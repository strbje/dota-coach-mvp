// Offline diagnosis against the owner's saved STRATZ response and the existing replay decode evidence.
// Usage: node scripts/inspect-farm-types.mjs <capture.json> [output.json]
// Does not download data, publish the raw capture, classify product events by NPC guesses, or validate XY.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const input = process.argv[2];
if (!input) throw new Error('Pass the original saved STRATZ JSON path. No token is needed.');
const bytes = readFileSync(input);
const capture = JSON.parse(bytes);
const replayBytes = readFileSync(new URL('../docs/research/stratz-coordinates/visual-review-data.json', import.meta.url));
const evidence = JSON.parse(replayBytes);
const captureSha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(captureSha256, evidence.source.captureSha256, 'Replay-derived evidence must refer to this exact capture');
assert.equal(evidence.source.synthetic, false);
const fields = ['isCreep', 'isNeutral', 'isAncient'];
const categories = ['lane', 'neutral', 'ancient'];
const matches = evidence.matches.map((match) => {
  const raw = capture.probes.find((probe) => probe.raw?.id === match.id)?.raw;
  assert.ok(raw);
  const player = raw.players.find((player) => player.playerSlot === match.slot && player.heroId === match.heroId);
  const events = player.playbackData.csEvents;
  assert.equal(events.length, match.farm.length);
  assert.equal(events.length, player.numLastHits);
  const counts = {}, unknownReasons = {}, targets = {}, executors = {};
  const examples = [];
  match.farm.forEach((joined, index) => {
    const event = events[index];
    assert.equal(joined.index, index);
    assert.equal(joined.time, event.time);
    assert.ok(Math.abs(joined.replayTime - event.time) <= 2);
    const flags = fields.map((field) => event[field]);
    const valid = flags.every((flag) => typeof flag === 'boolean');
    const trueCount = flags.filter((flag) => flag === true).length;
    const category = valid && trueCount === 1 ? categories[flags.indexOf(true)] : 'unclassified';
    assert.equal(category, joined.category);
    counts[category] = (counts[category] ?? 0) + 1;
    if (category !== 'unclassified') return;
    const reason = !valid ? 'missing_flags' : trueCount === 0 ? 'all_false' : 'conflicting_flags';
    unknownReasons[reason] = (unknownReasons[reason] ?? 0) + 1;
    targets[joined.target] = (targets[joined.target] ?? 0) + 1;
    executors[joined.executor] = (executors[joined.executor] ?? 0) + 1;
    if (!examples.some((example) => example.target === joined.target)) examples.push({ index, time: event.time, replayTime: joined.replayTime, npcId: event.npcId, attacker: event.attacker, flags: Object.fromEntries(fields.map((field) => [field, event[field]])), target: joined.target, executor: joined.executor });
  });
  return { matchId: match.id, heroId: match.heroId, slot: match.slot, total: events.length, counts, unknownReasons, targets, executors, decodeSha256: match.decodeSha256, examples };
});
const report = { captureSha256, capturedAt: capture.capturedAt, replayEvidenceSha256: createHash('sha256').update(replayBytes).digest('hex'), synthetic: false, verification: 'Original saved response checked offline; target identities taken from the previously decoded real replays. No new live API call, replay decode, visual replay viewing or coordinate validation.', productReady: false, matches };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ captureSha256, matches: matches.map(({ matchId, total, counts, unknownReasons, executors }) => ({ matchId, total, counts, unknownReasons, executors })) }, null, 2));
