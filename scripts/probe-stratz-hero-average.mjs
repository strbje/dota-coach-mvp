import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const STRATZ_URL = 'https://api.stratz.com/graphql';
const OPENDOTA_URL = 'https://api.opendota.com/api/matches';
const REQUEST_TIMEOUT_MS = 30_000;
const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
export const schemaQuery = `query CohortSchemaProbe {
  queryType: __type(name: "HeroStatsQuery") { ...TypeEvidence }
  averageType: __type(name: "HeroPositionTimeDetailType") { ...TypeEvidence }
  brackets: __type(name: "RankBracketBasicEnum") { ...TypeEvidence }
  matchType: __type(name: "MatchType") { ...TypeEvidence }
  statsType: __type(name: "MatchPlayerStatsType") { ...TypeEvidence }
  csType: __type(name: "LastHitDetailType") { ...TypeEvidence }
  goldType: __type(name: "PlayerUpdateGoldDetailType") { ...TypeEvidence }
}
fragment TypeEvidence on __Type {
  name description
  fields {
    name description type { ${TYPE_REF} }
    args { name description defaultValue type { ${TYPE_REF} } }
  }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
}`;

export const clockQuery = `query ClockAndCreepProbe($id: Long!) {
  match(id: $id) {
    id startDateTime bracket rank
    players {
      playerSlot heroId numLastHits numDenies networth
      playbackData {
        csEvents { time npcId isCreep isNeutral isAncient }
        playerUpdateGoldEvents { time networth }
      }
      heroAverage {
        heroId time position week bracketBasicIds matchCount remainingMatchCount
        winCount cs neutrals ancients networth goldPerMinute
      }
    }
  }
}`;

export const query = `query HeroAverageMethodologyProbe($id: Long!) {
  match(id: $id) {
    id durationSeconds gameVersionId lobbyType gameMode
    players {
      playerSlot heroId position role roleBasic numLastHits goldPerMinute
      stats { lastHitsPerMinute networthPerMinute goldPerMinute }
      heroAverage {
        heroId time position matchCount winCount cs networth goldPerMinute
        week bracketBasicIds remainingMatchCount
      }
    }
  }
}`;

async function jsonFetch(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return JSON.parse(text);
}

async function fetchProvider(provider, matchId, url, init) {
  try {
    return await jsonFetch(url, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${provider} request failed for match ${matchId}: ${detail}`, { cause: error });
  }
}

function valueAtIndex(series, index) {
  if (!Array.isArray(series)) return undefined;
  const value = series[index];
  return typeof value === 'number' ? value : undefined;
}

function windowAtIndex(series, index) {
  return [-1, 0, 1].map((offset) => {
    const candidateIndex = index + offset;
    return { index: candidateIndex, value: valueAtIndex(series, candidateIndex) ?? null };
  });
}

function numericSeries(series) {
  if (!Array.isArray(series)) return [];
  return series.map((value) => typeof value === 'number' ? value : null);
}

export function parseTargets(args) {
  const targets = args.map((arg) => {
    if (!/^\d+:\d+$/.test(arg)) throw new Error(`Invalid target: ${arg}`);
    const [matchId, heroId] = arg.split(':').map(Number);
    if (!Number.isSafeInteger(matchId) || matchId <= 0 || !Number.isInteger(heroId) || heroId <= 0) {
      throw new Error(`Invalid target: ${arg}`);
    }
    return { matchId, heroId };
  });
  const keys = targets.map(({ matchId, heroId }) => `${matchId}:${heroId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Targets must be unique matchId:heroId pairs');
  if (targets.length < 3) throw new Error('At least three unique targets are required');
  if (new Set(targets.map(({ matchId }) => matchId)).size < 3) throw new Error('At least three distinct matchIds are required');
  if (!keys.includes('8781054570:54')) throw new Error('Control target 8781054570:54 is required');
  return targets;
}

export async function writeArtifact(outputPath, output) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
}

export function summarizeProbe(matchId, heroId, stratzBody, openDotaBody) {
  const match = stratzBody?.data?.match;
  const player = match?.players?.find((candidate) => candidate.heroId === heroId);
  const openDotaPlayer = openDotaBody?.players?.find((candidate) => candidate.hero_id === heroId);
  if (!match || !player) throw new Error(`match ${matchId}: heroId ${heroId} missing from STRATZ payload`);
  const samples = Array.isArray(player.heroAverage) ? player.heroAverage : [];

  return {
    matchId,
    heroId,
    durationSeconds: match.durationSeconds,
    matchContext: { gameVersionId: match.gameVersionId, lobbyType: match.lobbyType, gameMode: match.gameMode },
    selectedPosition: player.position,
    role: player.role,
    roleBasic: player.roleBasic,
    finalLastHits: player.numLastHits,
    finalGoldPerMinute: player.goldPerMinute,
    actualSeries: {
      stratzLastHitsPerMinute: {
        semantics: 'interval-count-observed-in-live-validation-not-a-product-contract',
        values: numericSeries(player.stats?.lastHitsPerMinute)
      },
      openDotaLhT: {
        semantics: 'cumulative-count',
        values: numericSeries(openDotaPlayer?.lh_t)
      },
      stratzNetworthPerMinute: {
        semantics: 'raw-provider-series-time-alignment-unconfirmed',
        values: numericSeries(player.stats?.networthPerMinute)
      },
      stratzGoldPerMinute: {
        semantics: 'raw-provider-series-no-hero-average-comparison',
        values: numericSeries(player.stats?.goldPerMinute)
      }
    },
    actualSeriesLengths: {
      stratzLastHitsPerMinute: numericSeries(player.stats?.lastHitsPerMinute).length,
      openDotaLhT: numericSeries(openDotaPlayer?.lh_t).length,
      stratzNetworthPerMinute: numericSeries(player.stats?.networthPerMinute).length,
      stratzGoldPerMinute: numericSeries(player.stats?.goldPerMinute).length
    },
    checkpoints: samples.map((sample) => ({
      rawTime: sample.time,
      candidateArrayIndex: sample.time,
      actualCsStratzWindow: windowAtIndex(player.stats?.lastHitsPerMinute, sample.time),
      actualCsOpenDotaWindow: windowAtIndex(openDotaPlayer?.lh_t, sample.time),
      actualNetworthStratzWindow: windowAtIndex(player.stats?.networthPerMinute, sample.time),
      actualGpmStratzWindow: windowAtIndex(player.stats?.goldPerMinute, sample.time),
      heroAverage: sample
    })),
    caveats: [
      'Array indexes are recorded as candidate minute alignment, not asserted as equivalent.',
      'Full actual arrays are preserved independently of heroAverage coverage; a missing final partial-minute bucket is not replaced with zero.',
      'STRATZ interval last-hit values and OpenDota cumulative last-hit values are explicitly separate and are not directly compared.',
      'OpenDota gold_t is deliberately not requested or compared.',
      'week, bracketBasicIds, and remainingMatchCount are preserved as raw provider values; their semantics remain unconfirmed.',
      'Cohort filters absent from the payload remain unknown.'
    ]
  };
}

export function parseOptions(args) {
  const options = args.filter((arg) => arg.startsWith('--'));
  if (options.some((arg) => arg !== '--cohort-study' && !arg.startsWith('--out=') && !arg.startsWith('--controls-from='))) {
    throw new Error('Unknown option; supported options: --cohort-study, --controls-from=file.json, --out=file.json');
  }
  if (options.filter((arg) => arg === '--cohort-study').length > 1 ||
      options.filter((arg) => arg.startsWith('--out=')).length > 1 ||
      options.filter((arg) => arg.startsWith('--controls-from=')).length > 1) throw new Error('Duplicate option');
  const outputPath = options.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
  const controlsFrom = options.find((arg) => arg.startsWith('--controls-from='))?.slice('--controls-from='.length);
  if (outputPath !== undefined && !outputPath.trim()) throw new Error('--out requires a file path');
  if (controlsFrom !== undefined) {
    if (!controlsFrom.trim()) throw new Error('--controls-from requires a file path');
    if (options.includes('--cohort-study') || args.some((arg) => !arg.startsWith('--'))) {
      throw new Error('--controls-from cannot be combined with targets or --cohort-study');
    }
    if (outputPath && resolve(controlsFrom) === resolve(outputPath)) throw new Error('Output must not replace the source capture');
    return { controlsFrom, outputPath };
  }
  return { cohortStudy: options.includes('--cohort-study'), outputPath,
    targets: parseTargets(args.filter((arg) => !arg.startsWith('--'))) };
}

// Retain provider clocks and flags; neither index offsets nor creep categories are inferred.
export function clockEvidence(heroId, body, openDotaBody) {
  const match = body?.data?.match;
  const selected = match?.players?.filter((player) => player.heroId === heroId) ?? [];
  const odPlayers = openDotaBody?.players?.filter((player) => player.hero_id === heroId) ?? [];
  const od = odPlayers.length === 1 ? odPlayers[0] : undefined;
  const player = selected.length === 1 ? selected[0] : undefined;
  return {
    status: selected.length === 1 ? 'captured' : 'unavailable',
    stratz: selected.length === 1 ? { startDateTime: match.startDateTime ?? null,
      matchBracket: match.bracket ?? null, matchRank: match.rank ?? null,
      player: { heroId: player.heroId, playerSlot: player.playerSlot, numLastHits: player.numLastHits,
        numDenies: player.numDenies, networth: player.networth,
        playbackData: player.playbackData ?? null, heroAverage: player.heroAverage ?? null } } : null,
    openDota: { startTime: openDotaBody?.start_time ?? null,
      playerSlot: od?.player_slot ?? null, times: od?.times ?? null,
      lhT: od?.lh_t ?? null, networthT: od?.networth_t ?? null,
      finalLastHits: od?.last_hits ?? null, laneKills: od?.lane_kills ?? null,
      neutralKills: od?.neutral_kills ?? null, ancientKills: od?.ancient_kills ?? null },
    caveats: [
      'Match rank is not the selected player rank; no account/profile identifiers are requested or exported.',
      'Raw event times and flags are evidence, not a verified heroAverage clock or metric definition.',
      'Neutral and ancient flags may overlap; an unflagged event is not automatically a lane creep.',
      'Null or missing playback and OpenDota times do not establish zero events or array-index timing.',
      'Clock query heroAverage is a separate capture; it may change after the base query.'
    ]
  };
}

export function buildCohortRequest(probe, schema) {
  const stats = schema?.queryType?.fields?.find((field) => field.name === 'stats');
  const args = new Map((stats?.args ?? []).map((arg) => [arg.name, arg]));
  const required = ['heroIds', 'positionIds', 'bracketBasicIds', 'week', 'minTime', 'maxTime',
    'groupByTime', 'groupByPosition', 'groupByBracket'];
  if (required.some((name) => !args.has(name))) return { status: 'blocked', reason: 'stats_arguments_unconfirmed' };
  if (args.get('week').type?.name !== 'Long') return { status: 'blocked', reason: 'week_input_type_unconfirmed' };
  const fields = new Set((schema?.averageType?.fields ?? []).map((field) => field.name));
  const requiredFields = ['heroId', 'position', 'week', 'time', 'bracketBasicIds', 'matchCount', 'remainingMatchCount', 'cs', 'networth'];
  if (requiredFields.some((name) => !fields.has(name))) return { status: 'blocked', reason: 'stats_fields_unconfirmed' };
  const names = new Set((schema?.brackets?.enumValues ?? []).filter((value) => !value.isDeprecated).map((value) => value.name));
  const brackets = ['HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL', 'ALL'];
  if (brackets.some((name) => !names.has(name))) return { status: 'blocked', reason: 'bracket_enum_unconfirmed' };
  const weeks = new Set(probe.checkpoints.map((point) => point.heroAverage.week));
  const week = [...weeks][0];
  if (weeks.size !== 1 || !Number.isSafeInteger(week) || week < 0 || week > 100_000) {
    return { status: 'blocked', reason: 'single_epoch_week_candidate_unavailable' };
  }
  if (!Number.isSafeInteger(probe.heroId) || probe.heroId <= 0 || !/^POSITION_[1-5]$/.test(probe.selectedPosition)) {
    return { status: 'blocked', reason: 'hero_or_position_unavailable' };
  }
  const requestedFields = [...requiredFields, ...['winCount', 'neutrals', 'ancients', 'goldPerMinute'].filter((name) => fields.has(name))];
  const profiles = brackets.map((bracket, index) => ({ alias: `bracket${index}`, bracketBasicIds: [bracket], minTime: 0, maxTime: 75, groupByTime: true }));
  profiles.push(
    { alias: 'omittedBracket', bracketBasicIds: null, minTime: 0, maxTime: 75, groupByTime: true },
    { alias: 'collapsedTime', bracketBasicIds: ['DIVINE_IMMORTAL'], minTime: 0, maxTime: 75, groupByTime: false },
    { alias: 'boundary10', bracketBasicIds: ['DIVINE_IMMORTAL'], minTime: 10, maxTime: 10, groupByTime: true },
    { alias: 'window9To11', bracketBasicIds: ['DIVINE_IMMORTAL'], minTime: 9, maxTime: 11, groupByTime: true },
    { alias: 'window9To10', bracketBasicIds: ['DIVINE_IMMORTAL'], minTime: 9, maxTime: 10, groupByTime: true },
    { alias: 'window10To11', bracketBasicIds: ['DIVINE_IMMORTAL'], minTime: 10, maxTime: 11, groupByTime: true }
  );
  const weekInput = week * 604_800;
  const requests = profiles.map((profile) => ({ ...profile, heroIds: [probe.heroId], positionIds: [probe.selectedPosition],
    week: weekInput, groupByPosition: true, groupByBracket: true }));
  const selections = requests.map((profile) => `${profile.alias}: stats(heroIds: [${probe.heroId}], positionIds: [${probe.selectedPosition}],
    ${profile.bracketBasicIds === null ? '' : `bracketBasicIds: [${profile.bracketBasicIds[0]}],`}
    week: ${weekInput}, minTime: ${profile.minTime}, maxTime: ${profile.maxTime},
    groupByTime: ${profile.groupByTime}, groupByPosition: true, groupByBracket: true) { ${requestedFields.join(' ')} }`);
  return { status: 'planned', weekInterpretation: { status: 'hypothesis', rawWeek: week, inputUnixSeconds: weekInput,
    candidateStartUtc: new Date(weekInput * 1000).toISOString(),
    candidateEndUtcExclusive: new Date((weekInput + 604_800) * 1000).toISOString() },
    requests, query: `query ControlledCohortProbe { heroStats { ${selections.join('\n')} } }`,
    caveats: [
      'Week conversion is an explicit experiment, not a confirmed provider contract or match-date mapping.',
      'Rank cohorts are requested independently; none is assigned to the selected player.',
      'ALL and omission are separate controls and are not assumed equivalent.',
      'Collapsed time and equal time bounds test API behavior, not denominator or minute-boundary definitions.',
      'Collapsed/boundary controls use the observed populated DIVINE_IMMORTAL group; ALL remains a separate negative control.',
      'Means and counts are exported raw; no pooled means, percentiles, scores or actual-to-average deltas are calculated.'
    ] };
}

export async function captureResearch(requestQuery, variables, token, context) {
  const startedAt = new Date().toISOString();
  try {
    const body = await fetchProvider('STRATZ', context, STRATZ_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
      body: JSON.stringify({ query: requestQuery, variables })
    });
    const errors = (body.errors ?? []).map((error) => ({ message: String(error.message ?? 'GraphQL error').replaceAll(token, '[redacted]'), path: error.path }));
    return { status: errors.length ? 'partial' : body.data ? 'captured' : 'unavailable',
      startedAt, completedAt: new Date().toISOString(), query: requestQuery, variables, data: body.data ?? null, errors };
  } catch (error) {
    return { status: 'failed', startedAt, completedAt: new Date().toISOString(), query: requestQuery, variables,
      data: null, errors: [{ message: (error instanceof Error ? error.message : String(error)).replaceAll(token, '[redacted]') }] };
  }
}

export function cohortResults(plan, capture) {
  const data = capture.data?.heroStats;
  return plan.requests.map(({ alias }) => {
    const rows = data?.[alias];
    return { alias, status: Array.isArray(rows) ? (rows.length ? 'rows' : 'empty') : 'unavailable',
      rowCount: Array.isArray(rows) ? rows.length : null };
  });
}

async function captureCohorts(probe, schema, token) {
  const plan = buildCohortRequest(probe, schema);
  if (plan.status !== 'planned') return plan;
  const capture = await captureResearch(plan.query, {}, token, `${probe.matchId} controlled cohorts`);
  const results = cohortResults(plan, capture);
  return { ...plan, status: capture.status === 'captured' && results.some((row) => row.status === 'unavailable') ? 'partial' : capture.status,
    capture, results };
}

export async function repeatControls(sourcePath, token) {
  const bytes = await readFile(sourcePath);
  const source = JSON.parse(bytes.toString('utf8'));
  if (source.methodologyStatus !== 'research-only' || !source.schema?.data || !Array.isArray(source.probes)) {
    throw new Error('Source must be a research study with captured schema and base probes');
  }
  parseTargets(source.probes.map((probe) => `${probe.matchId}:${probe.heroId}`));
  // Validate every selector before making requests; never choose a new bucket or week silently.
  for (const probe of source.probes) {
    if (!Array.isArray(probe.checkpoints)) throw new Error('Source is missing base checkpoints');
    const plan = buildCohortRequest(probe, source.schema.data);
    if (plan.status !== 'planned') throw new Error(`Source match ${probe.matchId}: ${plan.reason}`);
  }
  const probes = [];
  for (const probe of source.probes) {
    console.error(`Repeating controlled cohorts for match ${probe.matchId} (no match/playback/OpenDota fetch)...`);
    probes.push({ matchId: probe.matchId, heroId: probe.heroId, selectedPosition: probe.selectedPosition,
      controlledCohorts: await captureCohorts(probe, source.schema.data, token) });
  }
  return { capturedAt: new Date().toISOString(), methodologyStatus: 'research-only',
    captureStatus: probes.every((probe) => probe.controlledCohorts.status === 'captured') ? 'complete' : 'partial',
    sourceCapture: { filename: basename(sourcePath), capturedAt: source.capturedAt ?? null,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      schemaCompletedAt: source.schema.completedAt ?? null },
    caveats: ['Only controlled stats are refreshed. Match clocks and schema are referenced from the earlier source, not captured again.',
      'The source capture is read unchanged; new values are not substituted into its original evidence.',
      'Current-week cohorts may change between requests; identical selectors do not imply an immutable curve.'], probes };
}

async function main() {
  const token = process.env.STRATZ_API_TOKEN;
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  if (!token || !options) {
    console.error('Usage: node --env-file=.env.local scripts/probe-stratz-hero-average.mjs <matchId:heroId> <matchId:heroId> <matchId:heroId> [--cohort-study] [--out=file.json] OR --controls-from=study.json [--out=file.json] (requires STRATZ_API_TOKEN)');
    process.exitCode = 2;
    return;
  }

  if (options.controlsFrom) {
    const artifact = await repeatControls(options.controlsFrom, token);
    const output = `${JSON.stringify(artifact, null, 2)}\n`;
    if (options.outputPath) await writeArtifact(options.outputPath, output);
    else process.stdout.write(output);
    if (artifact.captureStatus === 'partial') {
      console.error('Partial controls artifact saved; inspect controlledCohorts statuses.');
      process.exitCode = 1;
    }
    return;
  }

  const { targets, cohortStudy, outputPath } = options;
  let schema;
  if (cohortStudy) {
    console.error('Capturing STRATZ schema and argument descriptions...');
    schema = await captureResearch(schemaQuery, {}, token, 'schema discovery');
  }
  const probes = [];
  for (const { matchId, heroId } of targets) {
    console.error(`Fetching STRATZ and OpenDota for match ${matchId} (hero ${heroId})...`);
    const [stratzBody, openDotaBody] = await Promise.all([
      fetchProvider('STRATZ', matchId, STRATZ_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'dota-coach-mvp-methodology-probe/1.0' }, body: JSON.stringify({ query, variables: { id: matchId } }) }),
      fetchProvider('OpenDota', matchId, `${OPENDOTA_URL}/${matchId}`)
    ]);
    if (stratzBody.errors?.length) throw new Error(`match ${matchId}: ${JSON.stringify(stratzBody.errors)}`);
    const probe = summarizeProbe(matchId, heroId, stratzBody, openDotaBody);
    if (cohortStudy) {
      console.error(`Capturing clocks, creep flags and controlled cohorts for match ${matchId}...`);
      const clock = await captureResearch(clockQuery, { id: matchId }, token, `${matchId} clock evidence`);
      probe.clockEvidence = { ...clock, data: undefined, evidence: clockEvidence(heroId, clock, openDotaBody) };
      probe.controlledCohorts = await captureCohorts(probe, schema.data, token);
    }
    probes.push(probe);
    console.error(`Captured match ${matchId} (${probes.length}/${targets.length}).`);
  }

  const complete = !cohortStudy || (schema.status === 'captured' && probes.every((probe) =>
    probe.clockEvidence.status === 'captured' && probe.clockEvidence.evidence.status === 'captured' &&
    probe.controlledCohorts.status === 'captured'));
  const output = `${JSON.stringify({ capturedAt: new Date().toISOString(), methodologyStatus: 'research-only',
    ...(cohortStudy ? { captureStatus: complete ? 'complete' : 'partial', schema } : {}), probes }, null, 2)}\n`;
  if (outputPath) await writeArtifact(outputPath, output);
  else process.stdout.write(output);
  if (!complete) {
    console.error('Partial research artifact saved: inspect schema, clockEvidence and controlledCohorts statuses. No product conclusions are enabled.');
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('probe-stratz-hero-average.mjs')) {
  try { await main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message.replaceAll(process.env.STRATZ_API_TOKEN || '\0', '[redacted]') : 'Probe failed');
    process.exitCode = 1;
  }
}
