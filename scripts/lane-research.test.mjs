import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseOptions, buildMatchQuery, buildAggregatePlans, cohortChecks, projectMatch, runStudy } from './probe-stratz-lanes.mjs';
import { counterWindow, validateProjection, sampleBuckets, inspectMatch } from './inspect-lane-replays.mjs';

const scalar = (name, type = 'Int') => ({ name, type: { kind: 'SCALAR', name: type }, args: [] });
const relation = (name, type) => ({ name, type: { kind: 'OBJECT', name: type }, args: [] });
const syntheticSchema = () => ({
  MatchType: { fields: [scalar('id', 'Long'), scalar('gameVersionId'), relation('players', 'MatchPlayerType')] },
  MatchPlayerType: { fields: [scalar('heroId'), scalar('playerSlot'), scalar('position'), relation('stats', 'MatchPlayerStatsType'), relation('playbackData', 'MatchPlayerPlaybackDataType')] },
  MatchPlayerStatsType: { fields: [scalar('heroDamagePerMinute')] },
  MatchPlayerPlaybackDataType: { fields: [relation('heroDamageEvents', 'DamageEvent')] },
  DamageEvent: { fields: [scalar('time'), scalar('damage'), scalar('targetHeroId'), scalar('steamAccountId'), scalar('name', 'String')] },
  HeroStatsQuery: { fields: [{ name: 'laneOutcome', type: { kind: 'OBJECT', name: 'LaneOutcome' }, args: [
    scalar('heroId', 'Short'), scalar('isWith', 'Boolean'), scalar('positionIds', 'MatchPlayerPositionType'), scalar('bracketBasicIds', 'RankBracketBasicEnum')
  ] }] },
  LaneOutcome: { fields: ['heroId1', 'heroId2', 'position', 'bracketBasicIds', 'matchCount', 'winCount', 'lossCount'].map((name) => scalar(name)) },
  MatchPlayerPositionType: { enumValues: ['POSITION_1', 'POSITION_3'].map((name) => ({ name })) },
  RankBracketBasicEnum: { enumValues: [{ name: 'DIVINE_IMMORTAL' }] },
});
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('capture query is schema-led, excludes account fields, refuses absent identity and required unknown arguments', () => {
  const schema = syntheticSchema();
  const plan = buildMatchQuery(schema);
  assert.match(plan.query, /heroDamageEvents \{ time targetHeroId damage \}/);
  assert.doesNotMatch(plan.query, /steamAccount|name/);
  assert.ok(plan.omitted.includes('MatchPlayerStatsType.heroDamageReceivedPerMinute'));
  schema.MatchPlayerType.fields = schema.MatchPlayerType.fields.filter((f) => f.name !== 'heroId');
  assert.throws(() => buildMatchQuery(schema), /Required field/);
  const required = syntheticSchema();
  required.HeroStatsQuery.fields[0].args.push({ name: 'newRequiredArg', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'Int' } } });
  assert.deepEqual(buildAggregatePlans(required, 42), []);
});

test('bounded targets reject duplicates, unsafe IDs and unknown CLI options', () => {
  assert.equal(parseOptions(['9019592113:42', '--out=x.json']).targets.length, 1);
  for (const args of [['1:42', '1:1', '--out=x'], ['9007199254740992:42', '--out=x'], ['1:42', '--token=secret', '--out=x']]) assert.throws(() => parseOptions(args));
});

test('projection preserves zero/null/missing, and drops identities and unexpected nested objects', () => {
  const target = { matchId: 1, heroId: 42 };
  const projected = projectMatch({ id: 1, accountId: 123, players: [{ heroId: 42, playerSlot: 128, steamAccountId: 123, name: 'private',
    stats: { heroDamagePerMinute: [0, null, 17], secret: 'private' },
    playbackData: { heroDamageEvents: [{ time: 0, damage: 0, targetHeroId: 1, name: 'private' }], csEvents: null, playerUpdatePositionEvents: { name: 'private' } } }] }, target);
  assert.deepEqual(projected.players[0].stats.heroDamagePerMinute, [0, null, 17]);
  assert.equal(projected.players[0].playbackData.csEvents, null);
  assert.equal(projected.players[0].playbackData.playerUpdatePositionEvents, null);
  assert.doesNotMatch(JSON.stringify(projected), /private|account/i);
  assert.equal(projectMatch({ ...projected, id: 2 }, target), null);
  assert.equal(projectMatch({ ...projected, players: [...projected.players, ...projected.players] }, target), null);
});

test('actual STRATZ damage field names preserve actors, targets and illusion/NPC flags without guessing IDs', () => {
  const schema = syntheticSchema();
  schema.DamageEvent.fields = [
    ...['time', 'value', 'attacker', 'target', 'byAbility', 'byItem', 'fromNpc', 'toNpc'].map((name) => scalar(name)),
    ...['fromIllusion', 'toIllusion', 'isPhysicalAttack', 'isSourceMainHero', 'isTargetMainHero'].map((name) => scalar(name, 'Boolean')),
    scalar('steamAccountId'), scalar('personaname', 'String'),
  ];
  const query = buildMatchQuery(schema).query;
  const event = { time: 121, value: 50, attacker: 42, target: 105, byAbility: null, byItem: null, fromNpc: null, toNpc: 123,
    fromIllusion: false, toIllusion: false, isPhysicalAttack: true, isSourceMainHero: true, isTargetMainHero: false };
  for (const name of Object.keys(event)) assert.match(query, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(query, /steamAccount|personaname/);
  const value = projectMatch({ id: 1, players: [{ heroId: 42, playerSlot: 0, playbackData: { heroDamageEvents: [{ ...event, steamAccountId: 123, personaname: 'private' }] } }] }, { matchId: 1, heroId: 42 });
  assert.deepEqual(value.players[0].playbackData.heroDamageEvents, [event]);
});

test('a matching scalar bracket is accepted; missing/different/multiple labels remain mismatches', () => {
  const plan = buildAggregatePlans(syntheticSchema(), 42)[0];
  const result = cohortChecks(plan, [plan.bracket, [plan.bracket], 'UNCALIBRATED', null, [], [plan.bracket, 'ARCHON']]
    .map((bracketBasicIds) => ({ position: plan.position, bracketBasicIds, matchCount: 10 })));
  assert.equal(result.mismatchedBrackets, 4);
  assert.equal(result.productReady, false);
});

test('small/large N, unknown role and inconsistent cohort labels never become a validated matchup', () => {
  const plan = buildAggregatePlans(syntheticSchema(), 42)[0];
  for (const matchCount of [1, 10000]) {
    const result = cohortChecks(plan, [{ position: null, bracketBasicIds: ['ARCHON'], matchCount, gameVersionId: 59 }]);
    assert.equal(result.productReady, false);
    assert.equal(result.mismatchedPositions, 1);
    assert.equal(result.mismatchedBrackets, 1);
    assert.ok(result.missingEvidence.includes('verified patch and mode'));
  }
  // Patch information cannot be inferred from a week or borrowed from a different match.
  const mixed = cohortChecks(plan, [59, 60].map((gameVersionId) => ({ position: plan.position, bracketBasicIds: [plan.bracket], matchCount: 100, gameVersionId })));
  assert.equal(mixed.productReady, false);
  assert.ok(mixed.missingEvidence.includes('both lane pairs'));
});

test('research request stops at 429 and saves partial success, never a complete or ready cohort', async () => {
  let calls = 0;
  const result = await runStudy([{ matchId: 1, heroId: 42 }, { matchId: 2, heroId: 42 }], 'not-a-real-token', async () => {
    calls++;
    if (calls === 1) return reply({ data: syntheticSchema() });
    if (calls === 2) return reply({ data: { match: { id: 1, players: [{ heroId: 42, playerSlot: 0 }] } } });
    return reply({ errors: [{ message: 'rate limit' }] }, 429);
  });
  assert.equal(calls, 3);
  assert.equal(result.probes[0].status, 'captured');
  assert.equal(result.probes[1].status, 'unavailable-or-partial');
  assert.equal(result.captureStatus, 'partial');
  assert.equal(result.productReady, false);
});

test('fresh schema auth failure is retained and token is not exposed', async () => {
  const result = await runStudy([{ matchId: 1, heroId: 42 }], 'synthetic-token', async () => reply({ errors: [{ message: 'rejected synthetic-token' }] }, 403));
  assert.equal(result.schemaCaptures[0].httpStatus, 403);
  assert.equal(result.probes.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token/);
});

test('two-pass introspection captures discovered event fields and observed limits without guessing a quota', async () => {
  const schema = syntheticSchema(), { DamageEvent, LaneOutcome, ...roots } = schema;
  let calls = 0;
  const result = await runStudy([{ matchId: 1, heroId: 42 }], 'synthetic-token', async (_url, options) => {
    calls++;
    if (calls === 1) return reply({ data: roots });
    if (calls === 2) {
      assert.match(JSON.parse(options.body).query, /DamageEvent: __type/);
      return reply({ data: { DamageEvent, LaneOutcome } });
    }
    return new Response(JSON.stringify({ errors: [{ message: 'rate limit' }] }), { status: 429, headers: { 'retry-after': '60', 'x-ratelimit-limit-minute': '20', 'x-unrelated-secret': 'do-not-copy' } });
  });
  assert.equal(calls, 3);
  assert.equal(result.schemaCaptures.length, 2);
  assert.deepEqual(result.probes[0].request.rateLimitHeaders, { 'retry-after': '60', 'x-ratelimit-limit-minute': '20' });
  assert.doesNotMatch(JSON.stringify(result), /do-not-copy/);
  assert.equal(result.captureStatus, 'partial');
});

test('local CLI refuses an existing capture before a network request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lane-research-'));
  const path = join(dir, 'existing.json');
  await writeFile(path, 'keep-this-capture');
  try {
    await assert.rejects(promisify(execFile)(process.execPath, [
      '--import', 'data:text/javascript,globalThis.fetch=async()=>{throw new Error("NETWORK_MUST_NOT_RUN")}',
      'scripts/probe-stratz-lanes.mjs', '1:42', `--out=${path}`,
    ], { env: { ...process.env, STRATZ_API_TOKEN: 'synthetic-token' } }), (error) => {
      assert.match(error.stderr, /EEXIST/);
      assert.doesNotMatch(error.stderr, /synthetic-token|NETWORK_MUST_NOT_RUN/);
      return true;
    });
    assert.equal(await readFile(path, 'utf8'), 'keep-this-capture');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('successful transport still leaves matchup semantics unverified', async () => {
  let calls = 0;
  const result = await runStudy([{ matchId: 1, heroId: 42 }], 'synthetic-token', async () => {
    calls++;
    if (calls === 1) return reply({ data: syntheticSchema() });
    if (calls === 2) return reply({ data: { match: { id: 1, players: [{ heroId: 42, playerSlot: 0, position: null }] } } });
    return reply({ data: { heroStats: { laneOutcome: [{ heroId1: 42, heroId2: 2, position: 'POSITION_1', bracketBasicIds: ['DIVINE_IMMORTAL'], matchCount: 100 }] } } });
  });
  assert.equal(calls, 6);
  assert.equal(result.captureStatus, 'requests-complete-semantics-unverified');
  assert.equal(result.productReady, false);
  assert.equal(result.aggregates[2].checks.mismatchedPositions, 1);
});

test('damage-only follow-up does not repeat aggregates, CS, positions or minute arrays', async () => {
  const options = parseOptions(['1:42', '--damage-events-only', '--out=new.json']);
  assert.equal(options.damageEventsOnly, true);
  assert.throws(() => parseOptions(['1:42', '--damage-events-only', '--damage-events-only', '--out=new.json']));
  let calls = 0;
  const result = await runStudy(options.targets, 'synthetic-token', async (_url, request) => {
    calls++;
    if (calls === 1) return reply({ data: syntheticSchema() });
    const query = JSON.parse(request.body).query;
    assert.match(query, /heroDamageEvents/);
    assert.doesNotMatch(query, /laneOutcome|csEvents|playerUpdatePositionEvents|heroDamagePerMinute/);
    return reply({ data: { match: { id: 1, players: [{ heroId: 42, playerSlot: 0, playbackData: { heroDamageEvents: [] } }] } } });
  }, options);
  assert.equal(calls, 2);
  assert.deepEqual(result.aggregates, []);
  assert.equal(result.captureScope, 'damage-events-only');
  assert.equal(result.captureStatus, 'requests-complete-semantics-unverified');
  assert.equal(result.productReady, false);
});

test('cumulative damage uses exact boundaries and distinguishes unavailable, truncated and genuine zero', () => {
  assert.equal(counterWindow({}, 0, 600).damage, null);
  assert.equal(counterWindow({ times: [0, 300], hero_damage_t: [0, 50] }, 0, 600).status, 'missing-boundary');
  assert.equal(counterWindow({ times: [0, 300, 600], hero_damage_t: [10, 10, 10] }, 0, 600).damage, 0);
  assert.equal(counterWindow({ times: [0, 300, 600], hero_damage_t: [10, null, 20] }, 0, 600).status, 'invalid-counter');
  assert.equal(counterWindow({ times: [0, 600, 600], hero_damage_t: [0, 10, 10] }, 0, 600).status, 'invalid-clock');
  assert.equal(counterWindow({ times: [0, 300, 600], hero_damage_t: [100, 20, 50] }, 0, 600).status, 'invalid-counter');
});

function syntheticReplay() {
  const rows = [{ type: 'context', matchId: 1 }, ...Array.from({ length: 10 }, (_, slot) => ({ type: 'player_slot', key: String(slot), value: slot < 5 ? slot : slot + 123 }))];
  return rows;
}
const complete = (rows) => [...rows, { type: 'complete', rowsBeforeComplete: rows.length }];

test('incomplete parse, wrong match and duplicate interval clocks cannot be accepted', () => {
  const rows = syntheticReplay();
  assert.throws(() => validateProjection(rows, 1), /incomplete/);
  assert.throws(() => validateProjection(complete(rows), 2), /Wrong match/);
  assert.throws(() => validateProjection(complete([...rows, { type: 'interval', slot: 0, time: 0 }, { type: 'interval', slot: 0, time: 0 }]), 1), /Duplicate interval/);
});

test('lane-switch sample sequences remain separate; a dead/missing sample is not time spent on lane', () => {
  const samples = [{ time: 1, x: 80, y: 165, life_state: 0 }, { time: 301, x: 160, y: 75, life_state: 0 }, { time: 302, x: 160, y: 75, life_state: 2 }, { time: 303, life_state: 0 }];
  assert.deepEqual(sampleBuckets(samples, 0, 300).buckets, { top: 1 });
  assert.deepEqual(sampleBuckets(samples, 300, 600).buckets, { bottom: 1, 'dead-or-dying': 1, unavailable: 1 });
  assert.equal(sampleBuckets(samples, 300, 600).samples, 3);
});

test('third opposing hero/rotation, summon ownership and target illusions remain distinct', () => {
  const heroes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { name: `hero${i + 1}`, localized_name: `Hero ${i + 1}` }]));
  const api = { match_id: 1, patch: 60, players: Array.from({ length: 10 }, (_, i) => ({ hero_id: i + 1, player_slot: i < 5 ? i : i + 123, lane: i === 7 ? 1 : 3 })) };
  api.players[0].times = [0, 300, 600]; api.players[0].hero_damage_t = [0, 10, 25];
  const events = [
    { type: 'interval', slot: 0, hero_id: 1, time: 0, hero_damage: 0 },
    ...[6, 7, 8].map((hero, i) => ({ type: 'DOTA_COMBATLOG_DAMAGE', time: 100 + i * 100, sourcename: 'hero1', attackername: i === 2 ? 'summon1' : 'hero1', targetname: `hero${hero}`, targethero: true, targetillusion: false, value: 10 })),
    { type: 'DOTA_COMBATLOG_DAMAGE', time: 400, sourcename: 'hero1', attackername: 'hero1', targetname: 'hero8', targethero: true, targetillusion: true, value: 999 },
  ];
  const result = inspectMatch(api, complete([...syntheticReplay(), ...events]), heroes, 1);
  assert.equal(result.combat.damageDealt, 30);
  assert.equal(result.combat.byActor.summon1, 10);
  assert.equal(result.combat.targets.length, 3);
  assert.equal(result.combat.targets[2].sameProviderLaneAsSelected, false);
  assert.equal(result.combat.targetIllusionDamageExcluded, 999);
  assert.equal(result.counterComparisons.at(-1).equal, null); // missing replay boundary
  assert.equal(result.confirmedPosition, null);
  assert.equal(result.productReady, false);
});

test('committed real evidence keeps provider/replay discrepancies visible', async () => {
  const artifact = JSON.parse(await readFile(new URL('../docs/research/lane-matchups/observations-2026-11-07.json', import.meta.url)));
  assert.equal(artifact.matches.length, 3);
  const wk = artifact.matches.find((m) => m.matchId === 9078566584);
  assert.deepEqual(wk.windows.map((w) => w.damage), [2038, 4297, 6335]);
  assert.equal(wk.combat.targets.find((t) => t.heroId === 57).damage, 1045);
  const boundary = artifact.matches.find((m) => m.matchId === 9019592113).counterComparisons.find((p) => p.time === 600);
  assert.deepEqual([boundary.provider, boundary.replay, boundary.equal], [4764, 4688, false]);
  assert.ok(artifact.matches.every((m) => m.productReady === false));
  const stratz = JSON.parse(await readFile(new URL('../docs/research/lane-matchups/observations-stratz-2026-11-07.json', import.meta.url)));
  assert.equal(stratz.source.allRequestsHttp200, true);
  for (const match of stratz.matches) {
    assert.equal(match.heroDamagePerMinuteFirst10.reduce((a, b) => a + b, 0), match.windows.dealt0to10);
    assert.deepEqual(match.heroDamageReceivedPerMinuteFirst10, match.replayReceivedCumulativeAtMinuteEnd);
    assert.equal(match.attackerTargetFieldsCaptured, false);
  }
  const different = stratz.matches.find((m) => m.matchId === 9003795847);
  assert.deepEqual([different.windows.dealt0to10, different.windows.stratzPlayback0to10], [3762, 3812]);
  assert.equal(stratz.aggregates[2].returnedPositions.POSITION_1, 122);
});
