import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCohortRequest, captureResearch, clockEvidence, clockQuery, cohortResults, parseOptions, parseTargets, query, schemaQuery, summarizeProbe, writeArtifact } from './probe-stratz-hero-average.mjs';

const targets = ['8781054570:54', '9019592113:42', '9003795847:42'];
const schemaFixture = () => ({
  queryType: { fields: [{ name: 'stats', args: ['heroIds', 'positionIds', 'bracketBasicIds', 'week', 'minTime', 'maxTime',
    'groupByTime', 'groupByPosition', 'groupByBracket'].map((name) => ({ name, type: { name: name === 'week' ? 'Long' : null } })) }] },
  averageType: { fields: ['heroId', 'position', 'week', 'time', 'bracketBasicIds', 'matchCount', 'remainingMatchCount',
    'cs', 'networth', 'neutrals', 'ancients', 'goldPerMinute'].map((name) => ({ name })) },
  brackets: { enumValues: ['HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL', 'ALL'].map((name) => ({ name })) }
});
const cohortFixture = () => ({ heroId: 42, selectedPosition: 'POSITION_1', checkpoints: [{ heroAverage: { week: 2960 } }] });

test('requests the additional cohort fields without aliases or transformations', () => {
  assert.match(query, /week bracketBasicIds remainingMatchCount/);
});

test('keeps provider metrics separate and records the adjacent-index window', () => {
  const result = summarizeProbe(1, 54, { data: { match: {
    durationSeconds: 1200, gameVersionId: 99, lobbyType: 'RANKED', gameMode: 'ALL_PICK',
    players: [{ heroId: 54, position: 'POSITION_1', numLastHits: 123, goldPerMinute: 620,
      stats: { lastHitsPerMinute: [0, 7, 15], networthPerMinute: [600, 1020, 1510], goldPerMinute: [0, 410, 505] },
      heroAverage: [{ time: 1, position: 'POSITION_1', matchCount: 20, winCount: 11, cs: 6, networth: 1000, goldPerMinute: 420,
        week: 202639, bracketBasicIds: 'TEST_BRACKET', remainingMatchCount: 4 }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [0, 7], gold_t: [600, 9999] }] });

  assert.deepEqual(result.checkpoints[0].actualCsStratzWindow, [{ index: 0, value: 0 }, { index: 1, value: 7 }, { index: 2, value: 15 }]);
  assert.deepEqual(result.checkpoints[0].actualCsOpenDotaWindow, [{ index: 0, value: 0 }, { index: 1, value: 7 }, { index: 2, value: null }]);
  assert.deepEqual(result.checkpoints[0].actualNetworthStratzWindow, [{ index: 0, value: 600 }, { index: 1, value: 1020 }, { index: 2, value: 1510 }]);
  assert.deepEqual(result.checkpoints[0].actualGpmStratzWindow, [{ index: 0, value: 0 }, { index: 1, value: 410 }, { index: 2, value: 505 }]);
  assert.equal(result.finalLastHits, 123);
  assert.equal(result.finalGoldPerMinute, 620);
  assert.equal(result.checkpoints[0].heroAverage.networth, 1000);
  assert.equal(result.checkpoints[0].heroAverage.week, 202639);
  assert.equal(result.checkpoints[0].heroAverage.bracketBasicIds, 'TEST_BRACKET');
  assert.equal(result.checkpoints[0].heroAverage.remainingMatchCount, 4);
  assert.equal(result.checkpoints[0].rawTime, 1);
  assert.equal(result.checkpoints[0].candidateArrayIndex, 1);
  assert.equal('minute' in result.checkpoints[0], false);
  assert.deepEqual(result.actualSeries.stratzLastHitsPerMinute.values, [0, 7, 15]);
  assert.deepEqual(result.actualSeries.openDotaLhT.values, [0, 7]);
  assert.deepEqual(result.actualSeriesLengths, {
    stratzLastHitsPerMinute: 3,
    openDotaLhT: 2,
    stratzNetworthPerMinute: 3,
    stratzGoldPerMinute: 3
  });
  assert.equal('actualGoldOpenDota' in result.checkpoints[0], false);
});

test('preserves full actual series beyond heroAverage coverage', () => {
  const result = summarizeProbe(1, 54, { data: { match: {
    durationSeconds: 180, players: [{ heroId: 54, numLastHits: 12,
      stats: { lastHitsPerMinute: [2, 4, 6], networthPerMinute: [600, 900, 1200, 1500], goldPerMinute: [0, 300, 350] },
      heroAverage: [{ time: 0, cs: 1 }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [0, 2, 6, 12] }] });

  assert.equal(result.checkpoints.length, 1);
  assert.deepEqual(result.actualSeries.stratzLastHitsPerMinute.values, [2, 4, 6]);
  assert.deepEqual(result.actualSeries.openDotaLhT.values, [0, 2, 6, 12]);
  assert.equal(result.actualSeriesLengths.stratzNetworthPerMinute, 4);
});

test('keeps null heroAverage GPM and missing partial-minute values explicit', () => {
  const result = summarizeProbe(1, 54, { data: { match: {
    durationSeconds: 119, players: [{ heroId: 54, numLastHits: 8,
      stats: { lastHitsPerMinute: [8], networthPerMinute: [600], goldPerMinute: [null] },
      heroAverage: [{ time: 0, cs: 0, goldPerMinute: null, week: 202639, bracketBasicIds: null, remainingMatchCount: null }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [0] }] });

  assert.equal(result.checkpoints[0].heroAverage.goldPerMinute, null);
  assert.equal(result.checkpoints[0].heroAverage.week, 202639);
  assert.equal(result.checkpoints[0].heroAverage.bracketBasicIds, null);
  assert.equal(result.checkpoints[0].heroAverage.remainingMatchCount, null);
  assert.deepEqual(result.actualSeries.stratzGoldPerMinute.values, [null]);
  assert.equal(result.checkpoints[0].actualCsStratzWindow[0].value, null);
  assert.equal(result.checkpoints[0].actualCsStratzWindow[2].value, null);
});

test('does not calculate unsupported actual-to-average deltas', () => {
  const result = summarizeProbe(1, 54, { data: { match: {
    players: [{ heroId: 54, stats: { lastHitsPerMinute: [8], networthPerMinute: [600] }, heroAverage: [{ time: 0, cs: 44 }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [51] }] });

  assert.equal('delta' in result.checkpoints[0], false);
  assert.equal('comparison' in result.checkpoints[0], false);
});

test('accepts three unique positive targets including the control', () => {
  assert.equal(parseTargets(['8781054570:54', '2:1', '3:2']).length, 3);
});

test('rejects duplicate targets', () => {
  assert.throws(() => parseTargets(['8781054570:54', '2:1', '2:1']), /unique/);
});

test('rejects three unique pairs from fewer than three distinct matches', () => {
  assert.throws(() => parseTargets(['8781054570:54', '8781054570:1', '8781054570:2']), /distinct matchIds/);
});

test('rejects targets without the control match and hero', () => {
  assert.throws(() => parseTargets(['1:54', '2:1', '3:2']), /Control target/);
});

test('rejects zero, negative, unsafe and malformed ids', () => {
  for (const invalid of ['0:54', '-1:54', '1:0', '1:-2', '9007199254740992:54', '1.5:54', '1:2.5']) {
    assert.throws(() => parseTargets(['8781054570:54', '2:1', invalid]), /Invalid target/);
  }
});

test('creates parent directories before writing an artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stratz-probe-'));
  const outputPath = join(root, 'nested', 'probe.json');
  try {
    await writeArtifact(outputPath, '{"ok":true}\n');
    assert.equal(await readFile(outputPath, 'utf8'), '{"ok":true}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('study is opt-in and CLI rejects typos, repeated options and an empty output path', () => {
  assert.equal(parseOptions(targets).cohortStudy, false);
  assert.equal(parseOptions([...targets, '--cohort-study', '--out=study.json']).outputPath, 'study.json');
  for (const options of [['--cohort-stduy'], ['--out='], ['--cohort-study', '--cohort-study'], ['--out=a', '--out=b']]) {
    assert.throws(() => parseOptions([...targets, ...options]));
  }
});

test('captures argument documentation and clock/creep evidence without requesting account identifiers', () => {
  assert.match(schemaQuery, /args \{ name description defaultValue type/);
  assert.match(clockQuery, /csEvents \{ time npcId isCreep isNeutral isAncient \}/);
  assert.match(clockQuery, /playerUpdateGoldEvents \{ time networth \}/);
  assert.doesNotMatch(query + clockQuery, /steamAccount|accountId/i);
});

test('keeps raw clocks, overlapping flags and unknown net worth; drops other players and account fields', () => {
  const result = clockEvidence(42, { data: { match: { startDateTime: 123, rank: 70, bracket: 7, players: [
    { heroId: 42, playerSlot: 128, steamAccountId: 123456, numLastHits: 2,
      playbackData: { csEvents: [{ time: 599, isNeutral: true, isAncient: true }, { time: 600, isNeutral: null }] } },
    { heroId: 54, steamAccountId: 987654 }
  ] } } }, { start_time: 123, players: [{ hero_id: 42, player_slot: 128, times: [-60, 0, 60], lh_t: [0, 0, 2], lane_kills: 0 }] });
  assert.deepEqual(result.openDota.times, [-60, 0, 60]);
  assert.equal(result.openDota.networthT, null);
  assert.equal(result.openDota.neutralKills, null);
  assert.equal(result.openDota.laneKills, 0);
  assert.equal(result.stratz.player.playbackData.csEvents[1].time, 600);
  assert.equal(result.stratz.player.playbackData.csEvents[1].isNeutral, null);
  assert.doesNotMatch(JSON.stringify(result), /123456|987654|steamAccountId/);
  assert.equal(clockEvidence(42, { data: { match: { players: [] } } }, {}).status, 'unavailable');
});

test('controlled cohorts isolate rank filters and preserve the week conversion as a hypothesis', () => {
  const plan = buildCohortRequest(cohortFixture(), schemaFixture());
  assert.equal(plan.status, 'planned');
  assert.equal(plan.weekInterpretation.status, 'hypothesis');
  assert.equal(plan.weekInterpretation.rawWeek, 2960);
  assert.equal(plan.weekInterpretation.candidateStartUtc, '2026-09-24T00:00:00.000Z');
  assert.equal(plan.weekInterpretation.candidateEndUtcExclusive, '2026-10-01T00:00:00.000Z');
  assert.equal(plan.requests.length, 8);
  assert.equal(plan.requests.every((request) => request.week === 2960 * 604800), true);
  assert.deepEqual(plan.requests[2].bracketBasicIds, ['LEGEND_ANCIENT']);
  assert.deepEqual(plan.requests[3].bracketBasicIds, ['DIVINE_IMMORTAL']);
  assert.equal(plan.requests[5].bracketBasicIds, null);
  assert.doesNotMatch(plan.query.split('omittedBracket:')[1].split('collapsedTime:')[0], /bracketBasicIds:/);
  assert.equal(plan.requests[6].groupByTime, false);
  assert.equal(plan.requests[7].minTime, 10);
  assert.equal(plan.requests[7].maxTime, 10);
  assert.doesNotMatch(plan.query, /week: 2960[,)]/);
});

test('blocked introspection, changed enum and uncertain selectors never become default cohorts', () => {
  assert.equal(buildCohortRequest(cohortFixture(), null).reason, 'stats_arguments_unconfirmed');
  const schema = schemaFixture();
  schema.brackets.enumValues = schema.brackets.enumValues.filter((entry) => entry.name !== 'DIVINE_IMMORTAL');
  assert.equal(buildCohortRequest(cohortFixture(), schema).reason, 'bracket_enum_unconfirmed');
  for (const checkpoints of [[], [{ heroAverage: { week: null } }], [{ heroAverage: { week: 2960 } }, { heroAverage: { week: 2958 } }]]) {
    assert.equal(buildCohortRequest({ ...cohortFixture(), checkpoints }, schemaFixture()).status, 'blocked');
  }
  assert.equal(buildCohortRequest({ ...cohortFixture(), selectedPosition: 'UNKNOWN' }, schemaFixture()).reason, 'hero_or_position_unavailable');
  const changed = schemaFixture();
  changed.queryType.fields[0].args.find((arg) => arg.name === 'week').type.name = 'Int';
  assert.equal(buildCohortRequest(cohortFixture(), changed).reason, 'week_input_type_unconfirmed');
});

test('null cohorts and empty cohorts remain distinct; no population or zero is invented', () => {
  const plan = buildCohortRequest(cohortFixture(), schemaFixture());
  const result = cohortResults(plan, { data: { heroStats: { bracket0: [], bracket1: null,
    bracket2: [{ time: 10, cs: null, remainingMatchCount: null }] } } });
  assert.deepEqual(result.slice(0, 3), [
    { alias: 'bracket0', status: 'empty', rowCount: 0 },
    { alias: 'bracket1', status: 'unavailable', rowCount: null },
    { alias: 'bracket2', status: 'rows', rowCount: 1 }
  ]);
});

test('research requests retain partial GraphQL evidence and redact credentials from errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ data: { heroStats: { bracket0: [{ cs: null }] } },
      errors: [{ message: 'failed secret-test-token', path: ['heroStats', 'bracket1'] }] }));
  });
  const result = await captureResearch('query { heroStats { __typename } }', {}, 'secret-test-token', 'test');
  assert.equal(result.status, 'partial');
  assert.equal(result.data.heroStats.bracket0[0].cs, null);
  assert.doesNotMatch(JSON.stringify(result), /secret-test-token|Authorization/);
});

test('HTTP failure and a reset during body reading are failures with provider context', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('denied', { status: 403 }));
  const denied = await captureResearch('query { __typename }', {}, 'secret-test-token', '9019592113');
  assert.equal(denied.status, 'failed');
  assert.match(denied.errors[0].message, /STRATZ.*9019592113.*403/);
  globalThis.fetch = async () => ({ ok: true, text: async () => { throw new Error('ECONNRESET'); } });
  assert.equal((await captureResearch('query { __typename }', {}, 'secret-test-token', 'body')).status, 'failed');
});

test('CLI produces one complete or explicitly partial research artifact with the same base probes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stratz-study-'));
  const preload = join(root, 'mock.mjs');
  const outputPath = join(root, 'study.json');
  const script = fileURLToPath(new URL('./probe-stratz-hero-average.mjs', import.meta.url));
  const mock = `const schema = ${JSON.stringify(schemaFixture())};
globalThis.fetch = async (url, init) => {
  const input = init?.body ? JSON.parse(init.body) : null;
  const id = input?.variables?.id || Number(url.split('/').at(-1));
  const heroId = id === 8781054570 ? 54 : 42;
  if (!input) return new Response(JSON.stringify({start_time: 123, players:[{hero_id:heroId,times:[0,60],lh_t:[0,2]}]}));
  if (input.query.includes('query CohortSchemaProbe')) return new Response(JSON.stringify({data:schema}));
  if (input.query.includes('query ControlledCohortProbe')) {
    const heroStats = Object.fromEntries(['bracket0','bracket1','bracket2','bracket3','bracket4','omittedBracket','collapsedTime','boundary10'].map(alias=>[alias,[]]));
    if (process.env.MOCK_PARTIAL) heroStats.bracket3 = null;
    return new Response(JSON.stringify({data:{heroStats}}));
  }
  return new Response(JSON.stringify({data:{match:{id,startDateTime:123,players:[{heroId,position:'POSITION_1',stats:{lastHitsPerMinute:[2]},heroAverage:[{time:0,week:2960,cs:null}]}]}}}));
};`;
  try {
    await writeFile(preload, mock);
    const args = ['--import', pathToFileURL(preload).href, script, ...targets, '--cohort-study', `--out=${outputPath}`];
    await promisify(execFile)(process.execPath, args, { env: { ...process.env, STRATZ_API_TOKEN: 'secret-test-token', MOCK_PARTIAL: '' } });
    const complete = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(complete.captureStatus, 'complete');
    assert.equal(complete.methodologyStatus, 'research-only');
    assert.equal(complete.probes.length, 3);
    assert.equal(complete.probes[0].clockEvidence.evidence.openDota.times[1], 60);
    await assert.rejects(promisify(execFile)(process.execPath, args, { env: { ...process.env, STRATZ_API_TOKEN: 'secret-test-token', MOCK_PARTIAL: '1' } }), { code: 1 });
    const partial = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(partial.captureStatus, 'partial');
    assert.equal(partial.probes[0].controlledCohorts.capture.data.heroStats.bracket3, null);
    assert.doesNotMatch(JSON.stringify(partial), /secret-test-token|"actualToAverage":|"percentile":/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
