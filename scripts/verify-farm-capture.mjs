// Offline verification of the owner's two real #50 captures. No tokens, network calls or raw export publication.
// node scripts/verify-farm-capture.mjs path/to/stratz-coordinates-20261103-234056.json [output.json]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = join(root, '.tmp-farm-capture');
const file = process.argv[2];
if (!file) throw new Error('Pass the real coordinate capture JSON path. No token is needed.');
const bytes = readFileSync(file);
const capture = JSON.parse(bytes);
const replayBytes = readFileSync(join(root, 'docs/research/stratz-coordinates/visual-review-data.json'));
const replay = JSON.parse(replayBytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'), replay.source.captureSha256);
assert.equal(replay.source.synthetic, false);
const controls = [
  { id: 9019592113, slot: 129, total: 302, counts: [26, 25, 35, 47, 64, 58, 27, 20], categories: [117, 179, 4, 2, 0], highlight: 6 },
  { id: 9003795847, slot: 1, total: 281, counts: [22, 30, 58, 81, 63, 27], categories: [163, 93, 9, 16, 0], highlight: 4 }
];
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });
try {
  const compile = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
    'src/lib/dota/adapters/normalizeStratzMatch.ts', 'src/lib/dota/analyze/farmIntervals.ts',
    '--outDir', temp, '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022', '--esModuleInterop', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
  assert.equal(compile.status, 0);
  const require = createRequire(import.meta.url);
  const { normalizeStratzMatch } = require(join(temp, 'adapters/normalizeStratzMatch.js'));
  const { buildFarmIntervals } = require(join(temp, 'analyze/farmIntervals.js'));
  const { verifiedFarmTargets } = require(join(temp, 'normalize/farmTargets.js'));
  const observedIds = new Set();
  const matches = controls.map((control) => {
    const raw = capture.probes.find((probe) => probe.raw?.id === control.id)?.raw;
    assert.ok(raw, `Capture missing match ${control.id}`);
    assert.equal(raw.gameVersionId, 190);
    const joined = replay.matches.find((match) => match.id === control.id);
    const rawEvents = raw.players.find((player) => player.playerSlot === control.slot).playbackData.csEvents;
    assert.equal(rawEvents.length, joined.farm.length);
    rawEvents.forEach((event, index) => {
      const replayEvent = joined.farm[index];
      assert.equal(replayEvent.index, index);
      assert.equal(replayEvent.time, event.time);
      assert.ok(Math.abs(replayEvent.replayTime - event.time) <= 2);
      const target = verifiedFarmTargets[event.npcId];
      if (target) {
        assert.equal(target.unitName, replayEvent.target, `NPC ${event.npcId} disagrees with the replay victim`);
        observedIds.add(event.npcId);
      }
    });
    const normalized = normalizeStratzMatch({ match: raw }, { playerSlot: control.slot });
    const farm = normalized.normalized.selectedPlayer.farmEvents;
    const report = buildFarmIntervals(raw.durationSeconds, undefined, farm);
    assert.equal(report.source, 'stratz');
    assert.equal(report.eventCoverage, 'complete');
    assert.equal(report.receivedEvents, control.total);
    assert.equal(report.rejectedEvents, 0);
    assert.equal(report.highlightIndex, control.highlight);
    assert.deepEqual(report.intervals.map((window) => window.lastHits), control.counts);
    assert.deepEqual(['lane', 'neutral', 'ancient', 'other', 'unclassified'].map((key) => report.intervals.reduce((sum, window) => sum + window.breakdown[key], 0)), control.categories);
    const baselineFarm = normalizeStratzMatch({ match: { ...raw, gameVersionId: undefined } }, { playerSlot: control.slot }).normalized.selectedPlayer.farmEvents;
    const baseline = buildFarmIntervals(raw.durationSeconds, undefined, baselineFarm);
    assert.deepEqual(report.intervals.map(({ lastHits, perMinute }) => [lastHits, perMinute]), baseline.intervals.map(({ lastHits, perMinute }) => [lastHits, perMinute]));
    assert.equal(report.highlightIndex, baseline.highlightIndex);
    for (const window of report.intervals) assert.equal((window.otherTargets ?? []).reduce((sum, target) => sum + target.count, 0), window.breakdown.other);
    return { matchId: control.id, gameVersionId: raw.gameVersionId, replayDecodeSha256: joined.decodeSha256, ...report };
  });
  assert.deepEqual([...observedIds].sort((a, b) => a - b), Object.keys(verifiedFarmTargets).map(Number).sort((a, b) => a - b), 'Every dictionary entry needs replay evidence');
  const result = { source: basename(file), sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: capture.capturedAt,
    synthetic: false, replayEvidenceSha256: createHash('sha256').update(replayBytes).digest('hex'), verifiedTargetIds: [...observedIds].sort((a, b) => a - b),
    verification: 'Real saved responses processed offline and identities cross-checked against existing replay counter joins; not a fresh API request, new replay decode, visual replay viewing, role-gated product run or coordinate validation.', matches };
  if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
