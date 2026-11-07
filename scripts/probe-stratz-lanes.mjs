// Issue #81: bounded research capture. Never imported by the application.
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { capture } from './probe-stratz-coordinates.mjs';

const ROOTS = ['MatchType', 'MatchPlayerType', 'MatchPlayerStatsType', 'MatchPlayerPlaybackDataType', 'HeroStatsQuery', 'RankBracketBasicEnum', 'MatchPlayerPositionType', 'LaneOutcomeEnums'];
const REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const BASE_FIELDS = {
  MatchType: ['id', 'startDateTime', 'durationSeconds', 'gameVersionId', 'gameMode', 'lobbyType', 'rank', 'bracket', 'actualRank', 'averageRank', 'isStats', 'bottomLaneOutcome', 'midLaneOutcome', 'topLaneOutcome'],
  MatchPlayerType: ['playerSlot', 'heroId', 'isRadiant', 'position', 'role', 'roleBasic', 'lane', 'heroDamage', 'numLastHits', 'numDenies', 'deaths', 'networth'],
  MatchPlayerStatsType: ['heroDamagePerMinute', 'heroDamageReceivedPerMinute', 'lastHitsPerMinute', 'denyCountPerMinute', 'networthPerMinute', 'experiencePerMinute'],
};
const STREAMS = ['heroDamageEvents', 'playerUpdatePositionEvents', 'csEvents'];
const EVENT_FIELDS = ['time', 'heroId', 'targetHeroId', 'attackerHeroId', 'npcId', 'targetNpcId', 'attackerNpcId', 'playerSlot', 'targetPlayerSlot', 'attackerPlayerSlot', 'damage', 'heroDamage', 'physicalDamage', 'magicalDamage', 'pureDamage', 'amount', 'value', 'damageType', 'abilityId', 'itemId', 'isIllusion', 'isTargetIllusion', 'isAttackerIllusion', 'isCreep', 'isNeutral', 'isAncient', 'x', 'y', 'positionX', 'positionY',
  // Confirmed HeroDamageDetailType names in the owner's 2026-11-07 schema.
  // Preserve raw Short IDs and flags; their meaning is not inferred here.
  'attacker', 'target', 'byAbility', 'byItem', 'fromNpc', 'toNpc', 'fromIllusion', 'toIllusion', 'isPhysicalAttack', 'isSourceMainHero', 'isTargetMainHero'];
const AGG_FIELDS = ['heroId1', 'heroId2', 'week', 'bracketBasicIds', 'position', 'matchCount', 'drawCount', 'winCount', 'lossCount', 'stompWinCount', 'stompLossCount', 'matchWinCount', 'csCount'];
const RATE_HEADERS = ['retry-after', ...['day', 'hour', 'minute', 'second'].flatMap((unit) => [`x-ratelimit-limit-${unit}`, `x-ratelimit-remaining-${unit}`])];

async function laneCapture(query, variables, token, fetchImpl) {
  const rateLimitHeaders = {};
  const request = await capture(query, variables, token, async (...args) => {
    const response = await fetchImpl(...args);
    for (const name of RATE_HEADERS) {
      const value = response.headers?.get(name);
      if (value != null) rateLimitHeaders[name] = value;
    }
    return response;
  });
  return { ...request, rateLimitHeaders };
}
export function baseType(type) { while (type?.ofType) type = type.ofType; return type; }
const field = (schema, owner, name) => schema[owner]?.fields?.find((f) => f.name === name);
const queryable = (f) => Boolean(f && !(f.args ?? []).some((a) => a.type?.kind === 'NON_NULL' && a.defaultValue == null));
const leaf = (f) => queryable(f) && ['SCALAR', 'ENUM'].includes(baseType(f.type)?.kind);

export function parseOptions(args) {
  const options = args.filter((a) => a.startsWith('--'));
  const outputs = options.filter((a) => a.startsWith('--out='));
  if (outputs.length !== 1 || !outputs[0].slice(6).trim()
    || options.some((a) => !a.startsWith('--out=') && a !== '--damage-events-only')
    || options.filter((a) => a === '--damage-events-only').length > 1) throw new Error('Use one to three matchId:heroId targets, --out=new-file.json and optional --damage-events-only');
  const targets = args.filter((a) => !a.startsWith('--')).map((a) => {
    if (!/^[1-9]\d*:[1-9]\d*$/.test(a)) throw new Error('Invalid matchId:heroId');
    const [matchId, heroId] = a.split(':').map(Number);
    if (!Number.isSafeInteger(matchId) || !Number.isSafeInteger(heroId) || heroId > 32767) throw new Error('Unsafe identifier');
    return { matchId, heroId };
  });
  if (!targets.length || targets.length > 3 || new Set(targets.map((t) => t.matchId)).size !== targets.length) throw new Error('Choose one to three distinct matches');
  return { targets, outputPath: resolve(outputs[0].slice(6)), damageEventsOnly: options.includes('--damage-events-only') };
}

export function schemaQuery(names) {
  if (names.some((n) => !/^[_A-Za-z][_0-9A-Za-z]*$/.test(n))) throw new Error('Invalid schema name');
  return `query LaneResearchSchema { ${names.map((n) => `${n}: __type(name: "${n}") { name description fields { name description type { ${REF} } args { name description defaultValue type { ${REF} } } } inputFields { name description defaultValue type { ${REF} } } enumValues { name description } }`).join('\n')} }`;
}

export function dependencyTypes(schema) {
  const refs = [['MatchType', 'laneReport'], ['MatchPlayerStatsType', 'heroDamageReport'], ['HeroStatsQuery', 'laneOutcome'], ...STREAMS.map((n) => ['MatchPlayerPlaybackDataType', n])];
  const names = refs.map(([owner, name]) => baseType(field(schema, owner, name)?.type)?.name);
  for (const name of ['laneOutcome', 'stats', 'matchUp']) for (const a of field(schema, 'HeroStatsQuery', name)?.args ?? []) {
    const type = baseType(a.type); if (type?.kind !== 'SCALAR') names.push(type?.name);
  }
  return [...new Set(names.filter((n) => n && !schema[n]))];
}

export function buildMatchQuery(schema, { damageEventsOnly = false } = {}) {
  const omitted = [];
  function leaves(owner, names) { return names.filter((n) => {
    const ok = leaf(field(schema, owner, n)); if (!ok) omitted.push(`${owner}.${n}`); return ok;
  }).join(' '); }
  for (const [owner, name] of [['MatchType', 'id'], ['MatchPlayerType', 'heroId'], ['MatchPlayerType', 'playerSlot']]) if (!leaf(field(schema, owner, name))) throw new Error(`Required field missing: ${owner}.${name}`);
  if (!queryable(field(schema, 'MatchType', 'players')) || baseType(field(schema, 'MatchType', 'players').type)?.name !== 'MatchPlayerType') throw new Error('Player relation unavailable');
  const statsFields = damageEventsOnly ? '' : leaves('MatchPlayerStatsType', BASE_FIELDS.MatchPlayerStatsType);
  const stats = queryable(field(schema, 'MatchPlayerType', 'stats')) && baseType(field(schema, 'MatchPlayerType', 'stats').type)?.name === 'MatchPlayerStatsType' && statsFields ? `stats { ${statsFields} }` : '';
  const streams = (damageEventsOnly ? ['heroDamageEvents'] : STREAMS).flatMap((name) => {
    const f = field(schema, 'MatchPlayerPlaybackDataType', name), type = baseType(f?.type)?.name;
    if (!queryable(f) || !leaf(field(schema, type, 'time'))) { omitted.push(`MatchPlayerPlaybackDataType.${name}`); return []; }
    return [`${name} { ${leaves(type, EVENT_FIELDS)} }`];
  });
  const playback = queryable(field(schema, 'MatchPlayerType', 'playbackData')) && baseType(field(schema, 'MatchPlayerType', 'playbackData').type)?.name === 'MatchPlayerPlaybackDataType' && streams.length ? `playbackData { ${streams.join(' ')} }` : '';
  return { query: `query LaneMatchResearch($id: Long!) { match(id: $id) { ${leaves('MatchType', BASE_FIELDS.MatchType)} players { ${leaves('MatchPlayerType', BASE_FIELDS.MatchPlayerType)} ${stats} ${playback} } } }`, omitted };
}

// No week conversion, role inference or invented 2v2 filter. These are diagnostic controls.
export function buildAggregatePlans(schema, heroId) {
  const f = field(schema, 'HeroStatsQuery', 'laneOutcome');
  const args = new Map((f?.args ?? []).map((a) => [a.name, a]));
  const expected = { heroId: 'Short', isWith: 'Boolean', positionIds: 'MatchPlayerPositionType', bracketBasicIds: 'RankBracketBasicEnum' };
  if (Object.entries(expected).some(([n, type]) => baseType(args.get(n)?.type)?.name !== type)
    || [...args.values()].some((a) => a.type?.kind === 'NON_NULL' && a.defaultValue == null && !(a.name in expected))) return [];
  const positions = schema.MatchPlayerPositionType?.enumValues?.map((e) => e.name) ?? [];
  const brackets = schema.RankBracketBasicEnum?.enumValues?.map((e) => e.name) ?? [];
  if (!['POSITION_1', 'POSITION_3'].every((p) => positions.includes(p)) || !brackets.includes('DIVINE_IMMORTAL')) return [];
  const type = baseType(f.type)?.name;
  const fields = AGG_FIELDS.filter((n) => leaf(field(schema, type, n)));
  if (!['heroId1', 'heroId2', 'position', 'bracketBasicIds', 'matchCount'].every((n) => fields.includes(n))) return [];
  return ['POSITION_1', 'POSITION_3'].flatMap((position) => [false, true].map((isWith) => ({
    heroId, position, bracket: 'DIVINE_IMMORTAL', isWith, period: 'provider-default-unverified',
    query: `query LaneAggregateResearch { heroStats { laneOutcome(heroId: ${heroId}, isWith: ${isWith}, positionIds: [${position}], bracketBasicIds: [DIVINE_IMMORTAL]) { ${fields.join(' ')} } } }`
  })));
}

export function cohortChecks(plan, rows) {
  if (!Array.isArray(rows)) return { status: 'unavailable', productReady: false };
  return { status: rows.length ? 'observed' : 'empty', productReady: false, rowCount: rows.length,
    mismatchedPositions: rows.filter((r) => r?.position !== plan.position).length,
    // The argument is a list, but HeroLaneOutcomeType.bracketBasicIds is a scalar enum.
    // Keep support for an explicit singleton list; never coerce null/unknown labels.
    mismatchedBrackets: rows.filter((r) => Array.isArray(r?.bracketBasicIds)
      ? r.bracketBasicIds.length !== 1 || r.bracketBasicIds[0] !== plan.bracket
      : r?.bracketBasicIds !== plan.bracket).length,
    unavailableCounts: rows.filter((r) => !Number.isSafeInteger(r?.matchCount) || r.matchCount < 1).length,
    missingEvidence: ['verified patch and mode', 'both lane pairs', 'period semantics', 'damage distribution', 'precision and sample-size policy', 'roaming and lane-switch context'] };
}

// Redact unexpected response fields as well as avoiding them in the query.
function pick(value, names) { if (value == null) return value; return Object.fromEntries(names.filter((n) => Object.hasOwn(value, n)).map((n) => [n, safeLeaf(value[n])])); }
// The selected schema fields are leaves (possibly lists). Never export an unexpected object.
function safeLeaf(value) { return Array.isArray(value) ? value.map(safeLeaf) : value !== null && typeof value === 'object' ? null : value; }
export function projectMatch(value, target) {
  if (value?.id !== target.matchId || !Array.isArray(value.players) || value.players.length > 10 || value.players.filter((p) => p?.heroId === target.heroId).length !== 1) return null;
  if (value.players.some((p) => !Number.isInteger(p?.playerSlot) || !(p.playerSlot >= 0 && p.playerSlot <= 4 || p.playerSlot >= 128 && p.playerSlot <= 132)) || new Set(value.players.map((p) => p.playerSlot)).size !== value.players.length) return null;
  return { ...pick(value, BASE_FIELDS.MatchType), players: value.players.map((p) => ({ ...pick(p, BASE_FIELDS.MatchPlayerType),
    ...(Object.hasOwn(p, 'stats') ? { stats: pick(p.stats, BASE_FIELDS.MatchPlayerStatsType) } : {}),
    ...(Object.hasOwn(p, 'playbackData') ? { playbackData: p.playbackData == null ? p.playbackData : Object.fromEntries(STREAMS.filter((s) => Object.hasOwn(p.playbackData, s)).map((s) => [s, Array.isArray(p.playbackData[s]) ? p.playbackData[s].map((e) => pick(e, EVENT_FIELDS)) : safeLeaf(p.playbackData[s])])) } : {}) })) };
}

export async function runStudy(targets, token, fetchImpl = fetch, { damageEventsOnly = false } = {}) {
  const result = { capturedAt: new Date().toISOString(), methodologyStatus: 'research-only', productReady: false,
    captureStatus: 'partial', captureScope: damageEventsOnly ? 'damage-events-only' : 'full', targets, schemaCaptures: [], probes: [], aggregates: [],
    limitations: ['Raw clocks and values are not normalized.', 'All ten players are needed to inspect lane membership; accounts/names are excluded.', 'Aggregates are independent diagnostic requests, not cohorts matched to these historical games.', 'Schema/HTTP success is not proof of complete events or a valid matchup model.'] };
  const root = await laneCapture(schemaQuery(ROOTS), {}, token, fetchImpl); result.schemaCaptures.push(root);
  if (root.status !== 'captured') return result;
  const schema = { ...root.data };
  const names = dependencyTypes(schema);
  if (names.length) {
    const details = await laneCapture(schemaQuery(names), {}, token, fetchImpl); result.schemaCaptures.push(details);
    if (details.status !== 'captured') return result;
    Object.assign(schema, details.data);
  }
  try { result.plan = buildMatchQuery(schema, { damageEventsOnly }); } catch (error) { result.planError = error.message; return result; }
  for (const target of targets) {
    const { data, ...request } = await laneCapture(result.plan.query, { id: target.matchId }, token, fetchImpl);
    const raw = projectMatch(data?.match, target);
    result.probes.push({ ...target, request, status: raw && request.status === 'captured' ? 'captured' : 'unavailable-or-partial', raw });
    if (request.httpStatus === 429 || request.httpStatus === 401 || request.httpStatus === 403) return result;
  }
  // At most four extra data requests, for the first requested hero only.
  for (const plan of damageEventsOnly ? [] : buildAggregatePlans(schema, targets[0].heroId)) {
    const { data, ...request } = await laneCapture(plan.query, {}, token, fetchImpl);
    const raw = Array.isArray(data?.heroStats?.laneOutcome) ? data.heroStats.laneOutcome.map((r) => pick(r, AGG_FIELDS)) : safeLeaf(data?.heroStats?.laneOutcome ?? null);
    result.aggregates.push({ plan, request, raw, checks: cohortChecks(plan, raw) });
    if ([401, 403, 429].includes(request.httpStatus)) break;
  }
  result.captureStatus = result.probes.every((p) => p.status === 'captured') && result.aggregates.length === (damageEventsOnly ? 0 : 4) && result.aggregates.every((a) => a.request.status === 'captured') ? 'requests-complete-semantics-unverified' : 'partial';
  return result;
}

async function main() {
  const { targets, outputPath, damageEventsOnly } = parseOptions(process.argv.slice(2));
  createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd(), true);
  const token = process.env.STRATZ_API_TOKEN;
  if (!token?.trim()) throw new Error('STRATZ_API_TOKEN missing; load the existing local environment. Do not share the token.');
  await mkdir(dirname(outputPath), { recursive: true });
  const output = await open(outputPath, 'wx');
  try {
    const artifact = await runStudy(targets, token, fetch, { damageEventsOnly });
    artifact.scriptSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
    await output.writeFile(JSON.stringify(artifact, null, 2) + '\n');
    console.log(`Saved ${artifact.captureStatus}: ${outputPath}`);
    if (artifact.captureStatus === 'partial') process.exitCode = 1;
  } finally { await output.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
