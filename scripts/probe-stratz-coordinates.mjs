import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://api.stratz.com/graphql';
const ROOT_TYPES = ['MatchType', 'MatchPlayerType', 'MatchPlayerStatsType', 'MatchPlayerPlaybackDataType', 'MatchPlaybackDataType'];
const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const STREAMS = {
  MatchPlayerStatsType: ['deathEvents'],
  MatchPlayerPlaybackDataType: ['playerUpdatePositionEvents', 'deathEvents', 'csEvents', 'goldEvents'],
  MatchPlaybackDataType: ['buildingEvents', 'roshanEvents']
};
const PRIVATE_FIELD = /account|steam|name/i;
const OBJECTIVE_FIELDS = ['time', 'x', 'y', 'positionX', 'positionY', 'type', 'npcId', 'isRadiant'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const own = (value, key) => Object.hasOwn(value ?? {}, key);

export function parseOptions(args) {
  const options = args.filter((arg) => arg.startsWith('--'));
  if (options.length !== 1 || !options[0].startsWith('--out=') || !options[0].slice(6)) {
    throw new Error('Use matchId:heroId [matchId:heroId ...] --out=new-file.json; no other options.');
  }
  const targets = args.filter((arg) => !arg.startsWith('--')).map((arg) => {
    if (!/^\d+:\d+$/.test(arg)) throw new Error('Targets must be positive matchId:heroId pairs.');
    const [matchId, heroId] = arg.split(':').map(Number);
    if (![matchId, heroId].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error('Targets must be positive safe integers.');
    }
    return { matchId, heroId };
  });
  if (!targets.length || targets.length > 3 || new Set(targets.map((t) => t.matchId)).size !== targets.length) {
    throw new Error('Choose one to three distinct matches; no fixed historical control is required.');
  }
  return { targets, outputPath: resolve(options[0].slice(6)) };
}

function baseType(type) {
  while (type?.ofType) type = type.ofType;
  return type;
}

function field(schema, type, name) {
  return schema[type]?.fields?.find((entry) => entry.name === name);
}

function queryable(entry) {
  return entry && !(entry.args ?? []).some((arg) => arg.type?.kind === 'NON_NULL' && arg.defaultValue == null);
}

export function schemaQuery(names) {
  if (names.some((name) => !/^[_A-Za-z][_0-9A-Za-z]*$/.test(name))) throw new Error('Invalid schema type name.');
  return `query CoordinateSchema { ${names.map((name) => `${name}: __type(name: "${name}") {
    name description fields { name description type { ${TYPE_REF} }
      args { name description defaultValue type { ${TYPE_REF} } } }
    enumValues(includeDeprecated: true) { name description isDeprecated }
  }`).join('\n')} }`;
}

export function eventTypeNames(schema) {
  return [...new Set(Object.entries(STREAMS).flatMap(([type, names]) => names.map((name) =>
    baseType(field(schema, type, name)?.type)?.name)).filter(Boolean))];
}

// Preserve schema-confirmed leaf fields, including event-owned coordinates and gold reasons.
// No projection, nearest-position inference, deduplication or null-to-zero conversion here.
export function buildQuery(schema) {
  const omitted = [];
  const scalarFields = (type, names) => names.filter((name) => {
    const entry = field(schema, type, name);
    const ok = queryable(entry) && ['SCALAR', 'ENUM'].includes(baseType(entry.type)?.kind);
    if (!ok) omitted.push(`${type}.${name}`);
    return ok;
  });
  for (const [type, name] of [['MatchType', 'id'], ['MatchPlayerType', 'heroId'], ['MatchPlayerType', 'playerSlot']]) {
    if (!scalarFields(type, [name]).length) throw new Error(`Required schema field unavailable: ${type}.${name}`);
  }
  if (!queryable(field(schema, 'MatchType', 'players'))
      || baseType(field(schema, 'MatchType', 'players').type)?.name !== 'MatchPlayerType') {
    throw new Error('MatchType.players contract unavailable.');
  }
  const streams = (ownerType) => (STREAMS[ownerType] ?? []).flatMap((name) => {
    const entry = field(schema, ownerType, name);
    const type = baseType(entry?.type)?.name;
    const fields = schema[type]?.fields ?? [];
    const leaves = fields.filter((f) => !PRIVATE_FIELD.test(f.name) && queryable(f)
      && (ownerType !== 'MatchPlaybackDataType' || OBJECTIVE_FIELDS.includes(f.name))
      && ['SCALAR', 'ENUM'].includes(baseType(f.type)?.kind)).map((f) => f.name);
    if (!queryable(entry) || !leaves.includes('time')) {
      omitted.push(`${ownerType}.${name}`);
      return [];
    }
    return [`${name} { ${leaves.join(' ')} }`];
  });
  const nested = (parent, name, expectedType) => {
    const entry = field(schema, parent, name);
    if (!queryable(entry) || baseType(entry.type)?.name !== expectedType) {
      omitted.push(`${parent}.${name}`);
      return '';
    }
    const selections = streams(expectedType);
    return selections.length ? `${name} { ${selections.join('\n')} }` : '';
  };
  const match = scalarFields('MatchType', ['id', 'startDateTime', 'durationSeconds', 'gameVersionId', 'replaySalt', 'clusterId']);
  const player = scalarFields('MatchPlayerType', ['heroId', 'playerSlot', 'isRadiant', 'numLastHits', 'numDenies', 'deaths']);
  return { omitted, query: `query CoordinateCapture($id: Long!) { match(id: $id) {
    ${match.join(' ')}
    ${nested('MatchType', 'playbackData', 'MatchPlaybackDataType')}
    players { ${player.join(' ')}
      ${nested('MatchPlayerType', 'stats', 'MatchPlayerStatsType')}
      ${nested('MatchPlayerType', 'playbackData', 'MatchPlayerPlaybackDataType')}
    }
  } }` };
}

export async function capture(query, variables, token, fetchImpl = fetch) {
  const result = { startedAt: new Date().toISOString(), query, variables, status: 'error', errors: [] };
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'dota-coach-mvp/coordinate-research' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000)
    });
    result.httpStatus = response.status;
    const text = await response.text();
    result.responseBytes = Buffer.byteLength(text);
    result.responseSha256 = hash(text);
    let body;
    try { body = JSON.parse(text); } catch { result.errors.push('Non-JSON response'); }
    if (!response.ok) result.errors.push(`HTTP ${response.status}`);
    if (Array.isArray(body?.errors)) result.errors.push(...body.errors.map((e) => String(e.message ?? 'GraphQL error')));
    if (own(body, 'data')) result.data = body.data;
    if (body?.data == null && !result.errors.length) result.errors.push('GraphQL data unavailable');
    result.status = result.errors.length ? 'error' : 'captured';
  } catch (error) {
    // Do not serialize fetch internals/headers or arbitrary transport exception messages.
    result.errors.push(error?.name === 'TimeoutError' ? 'Request timed out after 30 seconds' : 'Transport/body read failed');
  }
  result.errors = result.errors.map((message) => token ? message.replaceAll(token, '[REDACTED]') : message);
  result.completedAt = new Date().toISOString();
  return result;
}

export function selectedCapture(request, target) {
  const { data, ...metadata } = request;
  const match = data?.match;
  const players = Array.isArray(match?.players) ? match.players.filter((p) => p.heroId === target.heroId) : [];
  if (match?.id !== target.matchId || players.length !== 1) {
    return { ...target, request: metadata, status: 'unavailable', reason: 'Match/hero selector absent or ambiguous', raw: null };
  }
  const { players: _players, ...context } = match;
  const player = players[0];
  const positions = player.playbackData?.playerUpdatePositionEvents;
  const positionStatus = !own(player.playbackData, 'playerUpdatePositionEvents') ? 'not_returned'
    : positions === null ? 'null' : Array.isArray(positions) ? (positions.length ? 'present' : 'empty') : 'unexpected_type';
  return { ...target, request: metadata, status: request.status, positionStatus, raw: { ...context, players: [player] } };
}

export async function runStudy(targets, token, fetchImpl = fetch) {
  const artifact = { capturedAt: null, endpoint: ENDPOINT, targets, methodologyStatus: 'research-only', productReady: false,
    captureStatus: 'partial', schemaCaptures: [], probes: [], limitations: [
      'Captured means transport completed; it does not validate coordinates, event coverage, clocks or map version.',
      'Only the selected hero is exported. Match.players has no hero/slot filter in the reviewed schema, so the request may read other players.',
      'A missing stream, null, empty array and incomplete coordinate pair remain distinct. No synthetic positions are generated.',
      'Replay comparisons and the existing coordinate normalizer must be reviewed separately.'
    ] };
  console.error('Capturing STRATZ root schema...');
  const roots = await capture(schemaQuery(ROOT_TYPES), {}, token, fetchImpl);
  artifact.schemaCaptures.push(roots);
  if (roots.status === 'captured') {
    const names = eventTypeNames(roots.data);
    if (names.length) {
      console.error('Capturing event field definitions...');
      const events = await capture(schemaQuery(names), {}, token, fetchImpl);
      artifact.schemaCaptures.push(events);
      if (events.status === 'captured') {
        const schema = { ...roots.data, ...events.data };
        const enums = [...new Set(Object.values(events.data).flatMap((type) => (type?.fields ?? [])
          .map((f) => baseType(f.type)).filter((t) => t?.kind === 'ENUM').map((t) => t.name)))];
        if (enums.length) {
          console.error('Capturing event enum definitions...');
          artifact.schemaCaptures.push(await capture(schemaQuery(enums), {}, token, fetchImpl));
        }
        try {
          artifact.plan = buildQuery(schema);
          for (const target of targets) {
            console.error(`Capturing match ${target.matchId}, hero ${target.heroId}...`);
            artifact.probes.push(selectedCapture(await capture(artifact.plan.query, { id: target.matchId }, token, fetchImpl), target));
          }
        } catch (error) { artifact.planError = error.message; }
      }
    } else artifact.planError = 'Event schema types unavailable';
  }
  if (artifact.schemaCaptures.every((c) => c.status === 'captured') && artifact.probes.length === targets.length
      && artifact.probes.every((p) => p.status === 'captured') && !artifact.plan?.omitted.length) artifact.captureStatus = 'complete';
  artifact.capturedAt = new Date().toISOString();
  return artifact;
}

async function main() {
  const { targets, outputPath } = parseOptions(process.argv.slice(2));
  const token = process.env.STRATZ_API_TOKEN;
  if (!token?.trim()) throw new Error('STRATZ_API_TOKEN missing. Use the existing local environment; do not share the token.');
  await mkdir(dirname(outputPath), { recursive: true });
  // Reserve the destination before requesting data. Never replace an earlier capture.
  const output = await open(outputPath, 'wx');
  try {
    const artifact = await runStudy(targets, token);
    artifact.scriptSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
    await output.writeFile(`${JSON.stringify(artifact, null, 2)}\n`);
    console.error(`Saved ${artifact.captureStatus} research capture: ${outputPath}`);
    if (artifact.captureStatus !== 'complete') process.exitCode = 1;
  } finally { await output.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
