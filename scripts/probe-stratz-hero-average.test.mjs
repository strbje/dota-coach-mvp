import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseTargets, summarizeProbe, writeArtifact } from './probe-stratz-hero-average.mjs';

test('keeps provider metrics separate and records the adjacent-index window', () => {
  const result = summarizeProbe(1, 54, { data: { match: {
    durationSeconds: 1200, gameVersionId: 99, lobbyType: 'RANKED', gameMode: 'ALL_PICK',
    players: [{ heroId: 54, position: 'POSITION_1', numLastHits: 123, goldPerMinute: 620,
      stats: { lastHitsPerMinute: [0, 7, 15], networthPerMinute: [600, 1020, 1510], goldPerMinute: [0, 410, 505] },
      heroAverage: [{ time: 1, position: 'POSITION_1', matchCount: 20, winCount: 11, cs: 6, networth: 1000, goldPerMinute: 420 }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [0, 7], gold_t: [600, 9999] }] });

  assert.deepEqual(result.checkpoints[0].actualCsStratzWindow, [{ index: 0, value: 0 }, { index: 1, value: 7 }, { index: 2, value: 15 }]);
  assert.deepEqual(result.checkpoints[0].actualCsOpenDotaWindow, [{ index: 0, value: 0 }, { index: 1, value: 7 }, { index: 2, value: null }]);
  assert.deepEqual(result.checkpoints[0].actualNetworthStratzWindow, [{ index: 0, value: 600 }, { index: 1, value: 1020 }, { index: 2, value: 1510 }]);
  assert.deepEqual(result.checkpoints[0].actualGpmStratzWindow, [{ index: 0, value: 0 }, { index: 1, value: 410 }, { index: 2, value: 505 }]);
  assert.equal(result.finalLastHits, 123);
  assert.equal(result.finalGoldPerMinute, 620);
  assert.equal(result.checkpoints[0].heroAverage.networth, 1000);
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
      heroAverage: [{ time: 0, cs: 0, goldPerMinute: null }] }]
  } } }, { players: [{ hero_id: 54, lh_t: [0] }] });

  assert.equal(result.checkpoints[0].heroAverage.goldPerMinute, null);
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
