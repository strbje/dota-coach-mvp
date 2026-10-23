import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMatchReview } from './matchReview';
import { syntheticPostMatch } from './postMatchV2.fixture';
import type { NormalizedOpenDotaMatch } from '../../types/domain';

test('synthetic 561/34616/51/one-death screenshot case never invents blame, with and without team context', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  try {
    for (const partial of [false, true]) {
      const { analysis } = await syntheticPostMatch({ partial });
      assert.equal(analysis.training.goal?.baseline, 51);
      assert.equal(analysis.training.goal?.target, 56);
      assert.equal(analysis.priorities.length, 0);
      assert.doesNotMatch(analysis.review.summary, /561|34.?616|из-за.*смерт/);
      assert.ok(analysis.review.factors.every((f) => f.evidenceId === 'team-advantage' || analysis.review.timeline.some((e) => e.id === f.evidenceId)));
      assert.ok(analysis.review.timeline.some((e) => e.kind === 'death'));
      assert.ok(analysis.itemTimings.length);
      if (partial) assert.match(analysis.review.coverageNote ?? '', /Нет динамики/);
      else assert.ok(analysis.review.factors.some((f) => f.id === 'team-swing'));
    }
    const { analysis: empty } = await syntheticPostMatch({ empty: true });
    assert.equal(empty.training.goal, undefined);
    assert.equal(empty.priorities.length, 0);
    assert.equal(empty.review.timeline.length, 0);
  } finally { globalThis.fetch = original; }
});

test('victory against economic disadvantage is not mislabeled as a winning economic cause', () => {
  const match: NormalizedOpenDotaMatch = { matchId: 1, didRadiantWin: true, durationSeconds: 660, selectedPlayer: { heroId: 1, heroName: 'Test' }, player: { isRadiant: true }, teamAdvantage: [{ timeSeconds: 600, gold: -5000 }] };
  const review = buildMatchReview(match, [], []);
  assert.match(review.headline, /Победа вопреки/);
  assert.equal(review.factors[0].confidence, 'observation');
  match.durationSeconds = 2000;
  assert.doesNotMatch(buildMatchReview(match, [], []).headline, /вопреки|преимуществом/);
});

test('missing points cannot form a five-minute swing; same-time death/objective never imply a cause', () => {
  const match: NormalizedOpenDotaMatch = { matchId: 1, didRadiantWin: false, durationSeconds: 1800, selectedPlayer: { heroId: 1, heroName: 'Test' }, player: { isRadiant: true },
    teamAdvantage: [0, 60, 120, 240, 300, 360].map((timeSeconds) => ({ timeSeconds, gold: -timeSeconds * 10 })),
    objectiveTimeline: [{ id: 'objective-0', timeSeconds: 600, kind: 'objective', label: 'Разрушено строение' }] };
  const review = buildMatchReview(match, [{ timeSeconds: 600 }], []);
  assert.equal(review.factors.some((f) => f.id === 'team-swing'), false);
  assert.equal(review.timeline.length, 2);
  assert.doesNotMatch(JSON.stringify(review), /привела|виноват|из-за смерти|потерял.*башн/);
});

test('experience-only telemetry covering the finish is available even without personal checkpoints', () => {
  for (const xp of [-3000, 0, 500]) {
    const match: NormalizedOpenDotaMatch = { matchId: 1, didRadiantWin: false, durationSeconds: 2400, selectedPlayer: { heroId: 1, heroName: 'Test' }, player: { isRadiant: true },
      teamAdvantage: [{ timeSeconds: 0, xp: 0 }, { timeSeconds: 2280, xp }] };
    const review = buildMatchReview(match, [], []);
    assert.match(review.summary, /динамика опыта.*38:00/);
    assert.doesNotMatch(review.summary, /не хватает|золота/);
    assert.match(review.coverageNote ?? '', /Нет динамики золота/);
    assert.doesNotMatch(review.coverageNote ?? '', /конец матча не покрыт|Динамика опыта неполная|Нет динамики ресурсов/);
    assert.equal(review.headline, 'Поражение. Разберём твою игру');
    assert.equal(review.factors.length, 1);
    assert.equal(review.factors[0].id, 'team-xp');
    assert.equal(review.factors[0].confidence, 'observation');
    assert.match(review.factors[0].fact, /38:00/);
    assert.deepEqual(review.advantage, match.teamAdvantage);
  }
});

test('experience-only telemetry with a truncated finish identifies the available interval and missing experience coverage', () => {
  const match: NormalizedOpenDotaMatch = { matchId: 1, didRadiantWin: true, durationSeconds: 2400, selectedPlayer: { heroId: 1, heroName: 'Test' }, player: { isRadiant: true },
    teamAdvantage: [{ timeSeconds: 0, xp: 0 }, { timeSeconds: 1800, xp: 2000 }] };
  const review = buildMatchReview(match, [], []);
  assert.match(review.summary, /динамика опыта.*30:00/);
  assert.doesNotMatch(review.summary, /не хватает|золота/);
  assert.match(review.coverageNote ?? '', /Нет динамики золота/);
  assert.match(review.coverageNote ?? '', /Динамика опыта неполная: конец матча не покрыт/);
  assert.doesNotMatch(review.coverageNote ?? '', /Динамика золота неполная/);
  assert.equal(review.headline, 'Победа. Разберём твою игру');
  assert.equal(review.factors[0].confidence, 'observation');
});

test('gold and experience finish coverage are assessed independently when both series exist', () => {
  for (const missingFinish of ['gold', 'xp'] as const) {
    const other = missingFinish === 'gold' ? 'xp' : 'gold';
    const match: NormalizedOpenDotaMatch = { matchId: 1, didRadiantWin: true, durationSeconds: 2400, selectedPlayer: { heroId: 1, heroName: 'Test' }, player: { isRadiant: true },
      teamAdvantage: [{ timeSeconds: 1800, gold: 1000, xp: 2000 }, { timeSeconds: 2280, [other]: 3000 }] };
    const review = buildMatchReview(match, [], []);
    assert.match(review.coverageNote ?? '', missingFinish === 'gold' ? /Динамика золота неполная/ : /Динамика опыта неполная/);
    assert.doesNotMatch(review.coverageNote ?? '', missingFinish === 'gold' ? /Динамика опыта неполная/ : /Динамика золота неполная/);
    assert.doesNotMatch(review.coverageNote ?? '', /Нет динамики/);
  }
});
