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
const controls = [
  { id: 9019592113, slot: 129, total: 302, counts: [26, 25, 35, 47, 64, 58, 27, 20], categories: [117, 140, 1, 44], highlight: 6 },
  { id: 9003795847, slot: 1, total: 281, counts: [22, 30, 58, 81, 63, 27], categories: [163, 76, 9, 33], highlight: 4 }
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
  const matches = controls.map((control) => {
    const raw = capture.probes.find((probe) => probe.raw?.id === control.id)?.raw;
    assert.ok(raw, `Capture missing match ${control.id}`);
    const normalized = normalizeStratzMatch({ match: raw }, { playerSlot: control.slot });
    const farm = normalized.normalized.selectedPlayer.farmEvents;
    const report = buildFarmIntervals(raw.durationSeconds, undefined, farm);
    assert.equal(report.source, 'stratz');
    assert.equal(report.eventCoverage, 'complete');
    assert.equal(report.receivedEvents, control.total);
    assert.equal(report.rejectedEvents, 0);
    assert.equal(report.highlightIndex, control.highlight);
    assert.deepEqual(report.intervals.map((window) => window.lastHits), control.counts);
    assert.deepEqual(['lane', 'neutral', 'ancient', 'unclassified'].map((key) => report.intervals.reduce((sum, window) => sum + window.breakdown[key], 0)), control.categories);
    return { matchId: control.id, ...report };
  });
  const result = { source: basename(file), sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: capture.capturedAt,
    verification: 'Real saved responses processed offline; not a fresh API request, replay viewing, role-gated product run or coordinate validation.', matches };
  if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally { rmSync(temp, { recursive: true, force: true }); }
