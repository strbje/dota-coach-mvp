import assert from 'node:assert/strict';
import test from 'node:test';
import { lifestealerCarryOverride } from '../heroOverrides/lifestealer';
import { runCarryPostMatchRules } from './carryRules';
import type { CarryHeroOverride } from './carryRules';
import type { NormalizedOpenDotaMatch, PostMatchBenchmarkContext } from '../../types/domain';

function match(lhAt10?: number): NormalizedOpenDotaMatch {
  return {
    matchId: 8781054570,
    didRadiantWin: true,
    durationSeconds: 2400,
    selectedPlayer: { heroId: 54, heroName: 'Lifestealer' },
    player: {
      heroName: 'Lifestealer',
      isRadiant: true,
      deaths: 2,
      laneReview: { source: 'partial', deathsBefore10: 1, lhAt10 },
      itemTimings: [],
      buildPlayed: []
    }
  };
}

function allCopy(analysis: ReturnType<typeof runCarryPostMatchRules>): string {
  return [
    ...Object.values(analysis.grades).flatMap((grade) => [grade.summary, ...grade.findings.map((finding) => finding.text)]),
    ...analysis.topMistakes,
    ...analysis.nextGameAdjustments,
    analysis.finalVerdict.mainReason,
    analysis.finalVerdict.biggestRisk
  ].filter(Boolean).join(' ');
}

test('does not present absent lane metrics as zero', () => {
  const input = match();
  delete input.player!.deaths;
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.doesNotMatch(allCopy(analysis), /0 LH|0% эффективности/);
  assert.doesNotMatch(allCopy(analysis), /0 смертей (всего|— главный)/);
  assert.match(analysis.finalVerdict.biggestRisk, /Недостаточно данных о смертях/);
  for (const grade of Object.values(analysis.grades)) {
    assert.equal(Number.isInteger(grade.score), true);
    assert.ok(grade.score >= 1 && grade.score <= 99);
  }
});

test('unknown item timings stay neutral without a benchmark', () => {
  const override: CarryHeroOverride = {
    ...lifestealerCarryOverride,
    earlyItemKey: 'unbenchmarked_early',
    timingItemKey: 'unbenchmarked_timing',
    getFallbackItemTarget: () => undefined,
    timingItemOnTimeFinding: () => { throw new Error('unknown timing must not use the on-time callback'); }
  };
  const input = match();
  input.player!.itemTimings = [
    { key: 'unbenchmarked_early', item: 'Early Item', time: '08:00', timeSeconds: 480, source: 'purchase_log' },
    { key: 'unbenchmarked_timing', item: 'Timing Item', time: '15:00', timeSeconds: 900, source: 'purchase_log' }
  ];
  const analysis = runCarryPostMatchRules(input, undefined, {}, override);
  assert.equal(analysis.grades.items.score, 64);
  assert.notEqual(analysis.grades.items.summary, 'Ранние ключевые предметы в темпе');
  assert.equal(analysis.grades.items.findings.some((finding) => finding.severity === 'good'), false);
  assert.ok(analysis.grades.items.findings.every((finding) => finding.text.includes('подтверждённого ориентира')));
});

test('external timing context stays neutral and does not enable the manual positive score', () => {
  const input = match();
  input.player!.itemTimings = [
    { key: 'phase_boots', item: 'Phase Boots', time: '08:00', timeSeconds: 480, source: 'purchase_log' },
    { key: 'armlet', item: 'Armlet', time: '15:00', timeSeconds: 900, source: 'purchase_log' }
  ];
  const context: PostMatchBenchmarkContext = {
    itemTimingScenarios: {
      available: true,
      timingBuckets: [
        { itemKey: 'phase_boots', timeLowerBound: 480, timeLabel: '8:00', games: 100, wins: 55, winRate: 0.55, sampleSize: 'standard', timeSemantics: 'discrete_timing_point' },
        { itemKey: 'armlet', timeLowerBound: 900, timeLabel: '15:00', games: 100, wins: 55, winRate: 0.55, sampleSize: 'standard', timeSemantics: 'discrete_timing_point' }
      ]
    }
  };
  const analysis = runCarryPostMatchRules(input, undefined, context, lifestealerCarryOverride);
  assert.equal(analysis.grades.items.score, 64);
  assert.equal(analysis.grades.items.summary, 'Тайминги сопоставлены с контекстом OpenDota');
  assert.equal(analysis.itemAnalysis?.filter((item) => item.scenarioContext).length, 2);
  assert.ok(analysis.itemAnalysis?.every((item) => item.timingStatus === 'unknown'));
});

test('a manual late timing is not hidden by external context for the other item', () => {
  const input = match();
  input.player!.itemTimings = [
    { key: 'phase_boots', item: 'Phase Boots', time: '08:00', timeSeconds: 480, source: 'purchase_log' },
    { key: 'armlet', item: 'Armlet', time: '20:00', timeSeconds: 1200, source: 'purchase_log' }
  ];
  const context: PostMatchBenchmarkContext = {
    itemTimingScenarios: {
      available: true,
      timingBuckets: [{ itemKey: 'phase_boots', timeLowerBound: 480, timeLabel: '8:00', games: 100, wins: 55, winRate: 0.55, sampleSize: 'standard', timeSemantics: 'discrete_timing_point' }]
    }
  };
  const analysis = runCarryPostMatchRules(input, undefined, context, lifestealerCarryOverride);
  assert.equal(analysis.grades.items.score, 64);
  assert.equal(analysis.grades.items.summary, 'Есть задержка по таймингу');
  assert.ok(analysis.grades.items.findings.some((finding) => finding.severity === 'warning' && finding.text.includes('Armlet')));
});

test('generic early item copy uses the override item and arbitrary hero name', () => {
  const override: CarryHeroOverride = {
    ...lifestealerCarryOverride,
    heroName: 'Test Carry',
    earlyItemKey: 'boots',
    timingItemKey: 'test_timing'
  };
  const input = match();
  input.player!.itemTimings = [{ key: 'boots', item: 'Boots of Speed', time: '07:00', timeSeconds: 420, source: 'purchase_log' }];
  const analysis = runCarryPostMatchRules(input, undefined, {}, override);
  assert.equal(analysis.hero, 'Test Carry');
  assert.match(allCopy(analysis), /Boots of Speed/);
  assert.doesNotMatch(allCopy(analysis), /Phase Boots/);
});

test('generic carry without a hero timing override emits no timing adjustment', () => {
  const override: CarryHeroOverride = {
    ...lifestealerCarryOverride,
    heroId: 1,
    heroName: 'Anti-Mage',
    earlyItemKey: '',
    timingItemKey: '',
    postTimingAdjustment: undefined
  };

  const analysis = runCarryPostMatchRules(match(), undefined, {}, override);
  assert.equal(analysis.nextGameAdjustments.length, 2);
  assert.doesNotMatch(analysis.nextGameAdjustments.join(' '), /ключев.*тайминг/i);
});

test('lane death risk uses STRATZ then OpenDota and ignores normalized phase fallback', () => {
  const input = match();
  input.player!.laneReview!.deathsBefore10 = 1;
  input.player!.deathsByPhase = { laning: 9, earlyMid: 0, midGame: 0, lateGame: 0 };
  const withStratz = runCarryPostMatchRules(input, { deathsByPhase: { laning: 3, earlyMid: 0, midGame: 0, lateGame: 0 } }, {}, lifestealerCarryOverride);
  const withOpenDota = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  delete input.player!.laneReview!.deathsBefore10;
  const withZeroFallback = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.equal(withStratz.grades.lane.score, 42);
  assert.equal(withOpenDota.grades.lane.score, 54);
  assert.equal(withZeroFallback.grades.lane.score, 60);
});

test('LH target never drops below the achieved checkpoint', () => {
  const context: PostMatchBenchmarkContext = {
    heroAverage: {
      available: true,
      selectedPosition: 'POSITION_1',
      samples: [{ time: 10, position: 'POSITION_1', cs: 50 }]
    }
  };
  const analysis = runCarryPostMatchRules(match(62), undefined, context, lifestealerCarryOverride);
  assert.ok(analysis.nextGameAdjustments.some((item) => item.includes('не менее 62 LH')));
});

test('deathless telemetry produces a neutral verdict', () => {
  const input = match();
  input.player!.deaths = 0;
  input.player!.deathsByPhase = { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 };
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.equal(analysis.finalVerdict.biggestRisk, 'По данным о смертях явного риска не выявлено.');
});
