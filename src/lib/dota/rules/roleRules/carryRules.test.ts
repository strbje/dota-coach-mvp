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

function withPhaseEconomy(input: NormalizedOpenDotaMatch, rates: [number, number, number, number], deaths: [number, number, number, number]) {
  const phaseKeys = ['laning', 'earlyMid', 'midGame', 'lateGame'] as const;
  input.player!.economyByPhaseSource = 'gold_t/lh_t';
  input.player!.economyByPhase = Object.fromEntries(phaseKeys.map((phase, index) => [phase, {
    startMinute: index === 0 ? 0 : index === 1 ? 10 : index === 2 ? 20 : 35,
    endMinute: index === 0 ? 10 : index === 1 ? 20 : index === 2 ? 35 : 40,
    durationMinutes: index === 2 ? 15 : index === 3 ? 5 : 10,
    lhPerMinuteInPhase: rates[index]
  }])) as NonNullable<NonNullable<NormalizedOpenDotaMatch['player']>['economyByPhase']>;
  input.player!.deathsByPhase = Object.fromEntries(phaseKeys.map((phase, index) => [phase, deaths[index]])) as NonNullable<NonNullable<NormalizedOpenDotaMatch['player']>['deathsByPhase']>;
  input.player!.deathDataSource = 'death_log';
}

function withAvailablePhaseEconomy(input: NormalizedOpenDotaMatch, rates: Partial<Record<'laning' | 'earlyMid' | 'midGame' | 'lateGame', number>>, deaths: [number, number, number, number]) {
  withPhaseEconomy(input, [0, 0, 0, 0], deaths);
  for (const phase of ['laning', 'earlyMid', 'midGame', 'lateGame'] as const) {
    if (rates[phase] === undefined) delete input.player!.economyByPhase![phase];
    else input.player!.economyByPhase![phase]!.lhPerMinuteInPhase = rates[phase];
  }
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
  assert.deepEqual(analysis.nextGameAdjustments, ['На линии цель — 0 смертей до 10:00 без потери доступного фарма.']);
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

test('research-only heroAverage does not affect product lane score or copy', () => {
  const baseline = runCarryPostMatchRules(match(42), undefined, {}, lifestealerCarryOverride);
  const withResearch = runCarryPostMatchRules(match(42), undefined, {
    heroAverage: { available: true, selectedPosition: 'POSITION_1', samples: [{ time: 10, position: 'POSITION_1', cs: 90 }] }
  }, lifestealerCarryOverride);

  assert.equal(withResearch.grades.lane.score, baseline.grades.lane.score);
  assert.deepEqual(withResearch.grades.lane.findings, baseline.grades.lane.findings);
  assert.deepEqual(withResearch.nextGameAdjustments, baseline.nextGameAdjustments);
  assert.doesNotMatch(allCopy(withResearch), /STRATZ|среднего ориентира/);
  assert.equal(withResearch.heroAverageComparison?.methodologyStatus, 'research');
});

test('reports a factual farm-tempo decline after the death-heavy phase', () => {
  const input = match();
  withPhaseEconomy(input, [5, 7.1, 4.2, 6], [0, 3, 1, 0]);
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const copy = analysis.grades.map.findings.map((finding) => finding.text).join(' ');
  assert.match(copy, /10–20 мин было 3 смерт.*снизился с 7.1 до 4.2 LH\/мин/);
  assert.doesNotMatch(copy, /восстанов|компенсировал/);
});

test('reports a factual farm-tempo increase in the phase after deaths', () => {
  const input = match();
  withPhaseEconomy(input, [5, 4.2, 7.1, 6], [0, 3, 1, 0]);
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.match(analysis.grades.map.findings.map((finding) => finding.text).join(' '), /10–20 мин было 3 смерт.*вырос с 4.2 до 7.1 LH\/мин/);
});

test('does not make a recovery claim when late game is death-heavy', () => {
  const input = match();
  withPhaseEconomy(input, [5, 6, 7, 8], [0, 0, 1, 3]);
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.doesNotMatch(copy, /После него|восстанов|компенсировал/);
});

test('a short match does not invent a zero-LH late phase in best/worst copy', () => {
  const input = match();
  withAvailablePhaseEconomy(input, { laning: 5, earlyMid: 6, midGame: 4 }, [0, 0, 0, 0]);
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.match(copy, /Лучший темп фарма/);
  assert.doesNotMatch(copy, /после 35 мин/);
});

test('the last real death-heavy phase has no after-phase comparison', () => {
  const input = match();
  withAvailablePhaseEconomy(input, { laning: 5, earlyMid: 6, midGame: 4 }, [0, 0, 3, 0]);
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.doesNotMatch(copy, /После него/);
});

test('uses the kill-count profile when gold reasons are incomplete', () => {
  const input = match();
  input.player!.farmProfile = { laneKills: 80, neutralKills: 120, ancientKills: 20 };
  input.player!.goldReasons = { constantsAvailable: true, breakdownComplete: false, totalPositiveGold: 1000, totalNegativeGold: 0, groups: [{ group: 'creeps', label: 'Лейн-крипы', amount: 1000 }], unknownAmount: 100, unknownKeys: ['21'], decoded: [], grouped: [] };
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.match(copy, /резервному профилю.*нейтралы.*120.*не сумма золота/);
  assert.doesNotMatch(copy, /Главный подтверждённый источник/);
});

test('uses the dominant confirmed gold source when the breakdown is complete', () => {
  const input = match();
  input.player!.farmProfile = { laneKills: 80, neutralKills: 120 };
  input.player!.goldReasons = { constantsAvailable: true, breakdownComplete: true, totalPositiveGold: 3000, totalNegativeGold: 0, groups: [{ group: 'creeps', label: 'Лейн-крипы', amount: 1000 }, { group: 'neutral', label: 'Нейтралы', amount: 2000 }], unknownAmount: 0, unknownKeys: [], decoded: [], grouped: [] };
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.match(copy, /Главный подтверждённый источник экономики — нейтралы: 2\s?000 золота/);
  assert.doesNotMatch(copy, /резервному профилю/);
});

test('non-source gold groups cannot override the dominant confirmed economy source', () => {
  const input = match();
  input.player!.goldReasons = { constantsAvailable: true, breakdownComplete: true, totalPositiveGold: 11000, totalNegativeGold: 0, groups: [{ group: 'neutral', label: 'Нейтралы', amount: 1000 }, { group: 'other', label: 'Другие источники', amount: 10000 }], unknownAmount: 0, unknownKeys: [], decoded: [], grouped: [] };
  const copy = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride).grades.map.findings.map((finding) => finding.text).join(' ');
  assert.match(copy, /Главный подтверждённый источник экономики — нейтралы: 1\s?000 золота/);
  assert.doesNotMatch(copy, /другие источники/);
});

test('deathless telemetry produces a neutral verdict', () => {
  const input = match();
  input.player!.deaths = 0;
  input.player!.deathsByPhase = { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 };
  input.player!.deathDataSource = 'death_log';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.equal(analysis.finalVerdict.biggestRisk, 'По данным о смертях явного риска не выявлено.');
});

test('deathless total stays neutral when phase telemetry is unavailable', () => {
  const input = match();
  input.player!.deaths = 0;
  input.player!.deathTimings = [];
  input.player!.deathsByPhase = undefined;
  input.player!.deathDataSource = 'unavailable';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const copy = [analysis.grades.fights.summary, ...analysis.grades.fights.findings.map((finding) => finding.text), ...analysis.topMistakes, ...analysis.nextGameAdjustments, analysis.finalVerdict.biggestRisk, analysis.finalVerdict.nextMatchFocus].join(' ');
  assert.equal(analysis.finalVerdict.biggestRisk, 'По данным о смертях явного риска не выявлено.');
  assert.doesNotMatch(copy, /высокий риск|Фазу смертей определить нельзя|После 35:00|buyback|бесплатные смерти/);
  assert.doesNotMatch(analysis.nextGameAdjustments.join(' '), /смерт/);
});

test('deathless total overrides contradictory phase deaths in product findings', () => {
  const input = match();
  input.player!.deaths = 0;
  withPhaseEconomy(input, [5, 6, 7, 8], [0, 0, 0, 3]);
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const copy = allCopy(analysis);
  assert.equal(analysis.finalVerdict.biggestRisk, 'По данным о смертях явного риска не выявлено.');
  assert.deepEqual(analysis.deathsByPhase, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 });
  assert.doesNotMatch(copy, /смерт.*после 35:00|высокий риск смертей в лейте/i);
  assert.doesNotMatch(analysis.grades.map.findings.map((finding) => finding.text).join(' '), /3 смерт|После него/);
});

test('low lane efficiency without lane deaths produces farm-only adjustment', () => {
  const input = match();
  input.player!.deaths = 0;
  input.player!.laneReview = { source: 'opendota', deathsBefore10: 0, laneEfficiencyPct: 55, lhAt10: 48 };
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const adjustment = analysis.nextGameAdjustments.find((item) => item.includes('эффективность линии'));
  assert.match(adjustment ?? '', /55%.*фарм/);
  assert.doesNotMatch(analysis.nextGameAdjustments.join(' '), /смерт/);
});

test('two ordinary deaths are not promoted to a high-risk coaching problem', () => {
  const input = match();
  input.player!.deaths = 2;
  input.player!.laneReview!.deathsBefore10 = 0;
  input.player!.deathsByPhase = { laning: 0, earlyMid: 1, midGame: 1, lateGame: 0 };
  input.player!.deathDataSource = 'death_log';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const deathCopy = [analysis.grades.fights.summary, ...analysis.grades.fights.findings.map((finding) => finding.text), ...analysis.topMistakes, analysis.finalVerdict.biggestRisk].join(' ');
  assert.doesNotMatch(deathCopy, /высокий риск|главн.*риск/i);
  assert.deepEqual(analysis.topMistakes, ['Критичных ошибок по доступным данным не найдено.']);
  assert.equal(analysis.finalVerdict.biggestRisk, 'По данным о смертях повышенного риска не выявлено.');
  assert.doesNotMatch(analysis.nextGameAdjustments.join(' '), /смерт|После 35:00|buyback/);
});

test('ten total deaths with zero late deaths consistently coaches total death risk', () => {
  const input = match();
  input.player!.deaths = 10;
  input.player!.laneReview!.deathsBefore10 = 1;
  input.player!.deathsByPhase = { laning: 1, earlyMid: 5, midGame: 4, lateGame: 0 };
  input.player!.deathDataSource = 'death_log';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  assert.match(analysis.grades.fights.summary!, /Много смертей/);
  assert.match(analysis.grades.fights.findings.map((finding) => finding.text).join(' '), /10 смертей.*высокий общий риск/);
  assert.match(analysis.topMistakes.join(' '), /10 смертей.*общий риск/);
  assert.match(analysis.nextGameAdjustments.join(' '), /общее число смертей/);
  assert.match(analysis.finalVerdict.biggestRisk, /общая смертность.*10 смертей всего.*Смертей после 35:00 не зафиксировано/);
  assert.match(analysis.finalVerdict.nextMatchFocus, /общее число смертей/);
  assert.doesNotMatch(`${analysis.topMistakes.join(' ')} ${analysis.nextGameAdjustments.join(' ')} ${analysis.finalVerdict.nextMatchFocus}`, /После 35:00 цель|сохраняй buyback/);
});

test('unknown death phases never invent zero late deaths or late-game advice', () => {
  const input = match();
  input.player!.deaths = 10;
  input.player!.deathsByPhase = undefined;
  input.player!.deathTimings = [];
  input.player!.deathDataSource = 'unavailable';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const copy = [analysis.grades.fights.summary, ...analysis.grades.fights.findings.map((finding) => finding.text), ...analysis.topMistakes, ...analysis.nextGameAdjustments, analysis.finalVerdict.biggestRisk, analysis.finalVerdict.nextMatchFocus].join(' ');
  assert.match(copy, /Фазу смертей определить нельзя/);
  assert.doesNotMatch(copy, /0 после 35:00|Смертей после 35:00 не зафиксировано|После 35:00 цель|сохраняй buyback/);
});

test('two known late deaths use their factual count instead of claiming no late deaths', () => {
  const input = match();
  input.player!.deaths = 10;
  input.player!.deathsByPhase = { laning: 1, earlyMid: 4, midGame: 3, lateGame: 2 };
  input.player!.deathDataSource = 'deaths_log';
  const analysis = runCarryPostMatchRules(input, undefined, {}, lifestealerCarryOverride);
  const copy = [analysis.grades.fights.summary, ...analysis.grades.fights.findings.map((finding) => finding.text), ...analysis.topMistakes, analysis.finalVerdict.biggestRisk].join(' ');
  assert.match(copy, /2 после 35:00; повышенного late-game риска не выявлено/);
  assert.doesNotMatch(copy, /без смертей|Смертей после 35:00 не зафиксировано/);
  assert.doesNotMatch(analysis.nextGameAdjustments.join(' '), /После 35:00 цель|buyback/);
});
