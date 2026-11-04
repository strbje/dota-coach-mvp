import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildQuery, capture, eventTypeNames, parseOptions, runStudy, schemaQuery, selectedCapture } from './probe-stratz-coordinates.mjs';

// All responses in this file are synthetic. They test capture plumbing, never real coordinates.
const scalar = (name, kind = 'SCALAR', typeName = 'Int') => ({ name, type: { kind, name: typeName }, args: [] });
const object = (name, typeName) => scalar(name, 'OBJECT', typeName);
function schemaFixture() {
  const schema = {
    MatchType: { fields: ['id', 'startDateTime', 'durationSeconds', 'gameVersionId', 'replaySalt', 'clusterId'].map((n) => scalar(n)) },
    MatchPlayerType: { fields: ['heroId', 'playerSlot', 'isRadiant', 'numLastHits', 'numDenies', 'deaths'].map((n) => scalar(n)) },
    MatchPlayerStatsType: { fields: [object('deathEvents', 'Death')] },
    MatchPlayerPlaybackDataType: { fields: ['playerUpdatePositionEvents', 'deathEvents', 'csEvents', 'goldEvents'].map((n) => object(n, 'Event')) },
    MatchPlaybackDataType: { fields: [object('buildingEvents', 'Event'), object('roshanEvents', 'Event')] },
    Death: { fields: [scalar('time')] },
    Event: { fields: ['time', 'x', 'y', 'positionX', 'positionY', 'isNeutral', 'amount', 'steamAccountId'].map((n) => scalar(n)) }
  };
  schema.MatchType.fields.push(object('players', 'MatchPlayerType'), object('playbackData', 'MatchPlaybackDataType'));
  schema.MatchPlayerType.fields.push(object('stats', 'MatchPlayerStatsType'), object('playbackData', 'MatchPlayerPlaybackDataType'));
  return schema;
}
const target = { matchId: 101, heroId: 42 };
const response = (player) => ({ status: 'captured', data: { match: { id: 101, players: [player] } } });

test('accepts explicit recent targets without requiring old controls and rejects unsafe CLI inputs', () => {
  assert.deepEqual(parseOptions(['101:42', '102:54', '--out=result.json']).targets, [target, { matchId: 102, heroId: 54 }]);
  for (const args of [[], ['--out=x'], ['0:42', '--out=x'], ['101:42', '101:54', '--out=x'],
    ['9007199254740993:42', '--out=x'], ['101:42', '--out=x', '--surprise'], ['101:42', '--out=']]) {
    assert.throws(() => parseOptions(args));
  }
});

test('captures schema-confirmed event leaves, excludes identities and never invents an unsupported field', () => {
  const schema = schemaFixture();
  schema.Event.fields.push(scalar('reason', 'ENUM', 'GoldReason'));
  schema.Event.fields.push({ ...scalar('requiresArgument'), args: [{ type: { kind: 'NON_NULL' }, defaultValue: null }] });
  const plan = buildQuery(schema);
  assert.match(plan.query, /goldEvents \{ time x y positionX positionY isNeutral amount reason \}/);
  assert.doesNotMatch(plan.query, /steamAccountId|requiresArgument/);
  assert.deepEqual(plan.omitted, []);
  assert.deepEqual(eventTypeNames(schema), ['Death', 'Event']);
  assert.match(schemaQuery(['GoldReason']), /enumValues/);
  assert.throws(() => schemaQuery(['Invalid) {']));
});

test('missing stream schema is an explicit omission; missing identity blocks the plan', () => {
  const schema = schemaFixture();
  schema.MatchPlayerPlaybackDataType.fields = schema.MatchPlayerPlaybackDataType.fields.filter((f) => f.name !== 'goldEvents');
  const plan = buildQuery(schema);
  assert.ok(plan.omitted.includes('MatchPlayerPlaybackDataType.goldEvents'));
  assert.doesNotMatch(plan.query, /goldEvents/);
  schema.MatchPlayerType.fields = schema.MatchPlayerType.fields.filter((f) => f.name !== 'heroId');
  assert.throws(() => buildQuery(schema), /Required schema field unavailable/);
});

test('raw null, absent, empty and partial coordinate pairs stay distinct; duplicates stay intact', () => {
  for (const [playbackData, expected] of [[null, 'not_returned'], [{}, 'not_returned'],
    [{ playerUpdatePositionEvents: null }, 'null'], [{ playerUpdatePositionEvents: [] }, 'empty'],
    [{ playerUpdatePositionEvents: [{ time: 1, x: 0, y: null }] }, 'present']]) {
    const result = selectedCapture(response({ heroId: 42, playerSlot: 1, playbackData }), target);
    assert.equal(result.positionStatus, expected);
    assert.deepEqual(result.raw.players[0].playbackData, playbackData);
  }
  const duplicate = { time: 1, positionX: 128, positionY: 64 };
  const data = response({ heroId: 42, playerSlot: 1, playbackData: { csEvents: [duplicate, duplicate] } });
  assert.equal(selectedCapture(data, target).raw.players[0].playbackData.csEvents.length, 2);
  assert.doesNotMatch(JSON.stringify(selectedCapture(data, target)), /mapX|worldX/);
});

test('exports only the selected hero and rejects missing, ambiguous or mismatched match identity', () => {
  const data = response({ heroId: 42, playerSlot: 1 });
  data.data.match.players.push({ heroId: 54, playerSlot: 2, playbackData: { privateOtherPlayer: true } });
  assert.equal(selectedCapture(data, target).raw.players.length, 1);
  assert.doesNotMatch(JSON.stringify(selectedCapture(data, target)), /privateOtherPlayer/);
  for (const value of [{ match: null }, { match: { id: 102, players: [{ heroId: 42 }] } },
    { match: { id: 101, players: [{ heroId: 42 }, { heroId: 42 }] } }]) {
    assert.equal(selectedCapture({ status: 'captured', data: value }, target).status, 'unavailable');
  }
});

test('preserves partial GraphQL data, HTTP errors and response provenance without exposing auth', async () => {
  const token = 'synthetic-secret';
  const result = await capture('query', {}, token, async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ data: { match: { id: 101 } }, errors: [{ message: `failure ${token}` }] }), { status: 503 });
  });
  assert.equal(result.status, 'error');
  assert.equal(result.httpStatus, 503);
  assert.equal(result.data.match.id, 101);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|Authorization/);
  const failed = await capture('query', {}, token, async () => ({ status: 200, ok: true,
    text: async () => { throw new DOMException('body stalled', 'TimeoutError'); } }));
  assert.match(failed.errors[0], /30 seconds/);
});

test('schema failure is saved as partial and does not issue guessed match queries', async () => {
  let count = 0;
  const result = await runStudy([target], 'test', async () => { count++; return new Response('{}', { status: 403 }); });
  assert.equal(count, 1);
  assert.equal(result.captureStatus, 'partial');
  assert.equal(result.probes.length, 0);
  assert.deepEqual(result.targets, [target]);
  assert.equal(result.productReady, false);
});

test('completed requests with null playback are never promoted to coordinate readiness', async () => {
  const schema = schemaFixture();
  const result = await runStudy([target], 'test', async (_url, init) => {
    const input = JSON.parse(init.body);
    return new Response(JSON.stringify(input.query.startsWith('query CoordinateSchema') ? { data: schema }
      : response({ heroId: 42, playerSlot: 1, playbackData: null })));
  });
  assert.equal(result.captureStatus, 'complete');
  assert.equal(result.productReady, false);
  assert.equal(result.probes[0].positionStatus, 'not_returned');
  assert.equal(result.probes[0].raw.players[0].playbackData, null);
});

test('later target failure retains earlier raw results and enum descriptions', async () => {
  const schema = schemaFixture();
  schema.Event.fields.push(scalar('reason', 'ENUM', 'GoldReason'));
  const result = await runStudy([target, { matchId: 102, heroId: 54 }], 'test', async (_url, init) => {
    const input = JSON.parse(init.body);
    if (input.query.startsWith('query CoordinateSchema')) {
      return new Response(JSON.stringify({ data: input.query.includes('GoldReason:')
        ? { GoldReason: { enumValues: [{ name: 'UNKNOWN', description: null }] } } : schema }));
    }
    return input.variables.id === 101 ? new Response(JSON.stringify(response({ heroId: 42, playerSlot: 1, playbackData: null })))
      : new Response('unavailable', { status: 503 });
  });
  assert.equal(result.captureStatus, 'partial');
  assert.equal(result.probes[0].raw.players[0].playbackData, null);
  assert.equal(result.probes[1].status, 'unavailable');
  assert.equal(result.schemaCaptures[2].data.GoldReason.enumValues[0].description, null);
});

test('CLI refuses to overwrite an old capture before any network work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coordinate-probe-'));
  try {
    const path = join(directory, 'old.json');
    await writeFile(path, 'old capture');
    const result = spawnSync(process.execPath, ['scripts/probe-stratz-coordinates.mjs', '101:42', `--out=${path}`],
      { encoding: 'utf8', env: { ...process.env, STRATZ_API_TOKEN: 'synthetic-secret' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /EEXIST/);
    assert.doesNotMatch(result.stderr, /synthetic-secret|Capturing match/);
    assert.equal(await readFile(path, 'utf8'), 'old capture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CLI writes a usable partial artifact after a schema HTTP failure without leaking the token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coordinate-probe-'));
  try {
    const preload = join(directory, 'mock.mjs');
    const path = join(directory, 'partial.json');
    await writeFile(preload, 'globalThis.fetch = async () => new Response("unavailable", {status: 503});');
    const result = spawnSync(process.execPath, ['--import', preload, 'scripts/probe-stratz-coordinates.mjs', '101:42', `--out=${path}`],
      { encoding: 'utf8', env: { ...process.env, STRATZ_API_TOKEN: 'synthetic-secret' } });
    assert.equal(result.status, 1);
    const text = await readFile(path, 'utf8');
    const artifact = JSON.parse(text);
    assert.equal(artifact.captureStatus, 'partial');
    assert.deepEqual(artifact.targets, [target]);
    assert.equal(artifact.schemaCaptures[0].httpStatus, 503);
    assert.match(artifact.scriptSha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(text + result.stderr, /synthetic-secret|Authorization/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
