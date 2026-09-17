import { compareItemTiming } from '../postMatch/itemBenchmarks';
import { getMatchPhase, type MatchPhase } from '../postMatch/phases';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis, PostMatchBenchmarkContext, StratzPostMatchData } from '../../types/domain';
import { formatPercentileRange, getPercentileForValue } from '../../analyze/compareToBenchmarks';
import { findNearestUsableItemTimingBucket } from '../../analyze/itemTimingBenchmarks';

function score(base: number, delta: number): number { return Math.round(Math.max(1, Math.min(99, base + delta))); }
function fmt(value: number, digits = 1): string { return value.toFixed(digits).replace(/\.0$/, ''); }

export type CarryHeroOverride = {
  key: string;
  heroId: number;
  heroName: string;
  position: string;
  earlyItemKey: string;
  timingItemKey: string;
  getFallbackItemTarget: (key: string) => number | undefined;
  coreItems: readonly string[];
  suspiciousItems: readonly string[];
  timingItemLateFinding: (time: string) => string;
  timingItemOnTimeFinding: (time: string) => string;
  suspiciousItemFinding: (labels: string) => string;
  postTimingAdjustment?: string;
};

export function runCarryPostMatchRules(match: NormalizedOpenDotaMatch, stratz: StratzPostMatchData | undefined, benchmarkContext: PostMatchBenchmarkContext = {}, heroOverride: CarryHeroOverride): PostMatchAnalysis {
  const p = match.player; const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const gpm = p?.gpm; const xpm = p?.xpm; const deaths = p?.deaths; const durationMinutes = p?.durationMinutes;
  const heroDamage = p?.heroDamage; const heroDamagePerMin = p?.heroDamagePerMin; const towerDamage = p?.towerDamage; const lastHitsPerMin = p?.lastHitsPerMin;
  const trackedTimings = p?.itemTimings ?? []; const getItemTiming = (key: string) => trackedTimings.find((it) => it.key === key);
  const earlyItem = getItemTiming(heroOverride.earlyItemKey); const timingItem = getItemTiming(heroOverride.timingItemKey);
  const deathsByPhase = stratz?.deathsByPhase ?? p?.deathsByPhase;
  const deathTimings = stratz?.deathTimings ?? p?.deathTimings;
  const lateDeathsAfter35 = (deathTimings ?? []).filter((d) => d.timeSeconds >= 2100).length;
  const lanePct = p?.laneReview?.laneEfficiencyPct;

  const laneDeaths = stratz?.deathsByPhase?.laning ?? p?.laneReview?.deathsBefore10 ?? 0;
  const lateDeaths = deathsByPhase?.lateGame ?? lateDeathsAfter35;
  const coreItemsSeen = (p?.buildPlayed ?? []).filter((item) => heroOverride.coreItems.includes(item));
  const suspiciousItems = (p?.buildPlayed ?? []).filter((item) => heroOverride.suspiciousItems.includes(item));
  const timings = benchmarkContext.itemTimingScenarios;
  const timingBuckets = timings?.timingBuckets ?? [];
  const hasExternalTimingContext = (item: typeof earlyItem) => Boolean(item && findNearestUsableItemTimingBucket(timingBuckets, item.key, item.timeSeconds));
  const earlyItemHasExternalContext = hasExternalTimingContext(earlyItem);
  const timingItemHasExternalContext = hasExternalTimingContext(timingItem);
  const earlyItemStatus = earlyItem && !earlyItemHasExternalContext ? compareItemTiming(earlyItem.timeSeconds, heroOverride.getFallbackItemTarget(heroOverride.earlyItemKey)) : null;
  const timingItemStatus = timingItem && !timingItemHasExternalContext ? compareItemTiming(timingItem.timeSeconds, heroOverride.getFallbackItemTarget(heroOverride.timingItemKey)) : null;
  const isPositiveTiming = (status: typeof earlyItemStatus) => status === 'early' || status === 'onTime';
  const itemStatuses: NonNullable<PostMatchAnalysis['itemAnalysis']> = trackedTimings.map((item) => ({
    key: item.key,
    name: item.item,
    time: item.time,
    phase: getMatchPhase(item.timeSeconds),
    popularityStatus: 'unknown' as const,
    timingStatus: 'unknown' as const
  }));

  const laneSummary = laneDeaths >= 2
    ? 'Линия испорчена смертями'
    : lanePct === undefined
      ? 'Линия без полной телеметрии'
      : lanePct >= 70
      ? 'Сильная линия'
      : lanePct >= 60
        ? 'Рабочая линия без преимущества'
        : 'Линия просела';

  const itemsSummary = !trackedTimings.length
    ? 'Тайминги недоступны'
    : suspiciousItems.length > 0
      ? 'В билде есть спорные слоты'
    : earlyItemStatus === 'late' || timingItemStatus === 'late'
      ? 'Есть задержка по таймингу'
    : earlyItemHasExternalContext || timingItemHasExternalContext
      ? 'Тайминги сопоставлены с контекстом OpenDota'
      : earlyItem && timingItem && isPositiveTiming(earlyItemStatus) && isPositiveTiming(timingItemStatus)
        ? 'Ранние ключевые предметы в темпе'
        : earlyItem || timingItem
          ? 'Тайминги зафиксированы без подтверждённой оценки'
        : 'Тайминги недоступны';

  const itemsFindings: AnalysisFinding[] = [];
  if (!trackedTimings.length) itemsFindings.push({ text: 'Тайминги ключевых предметов в этом матче недоступны.', evidence: [], severity: 'info' });
  if (earlyItem && !earlyItemHasExternalContext) {
    const status = earlyItemStatus;
    itemsFindings.push({ text: status === 'late' ? `${earlyItem.item} — ${earlyItem.time}: предмет куплен поздновато.` : isPositiveTiming(status) ? `${earlyItem.item} — ${earlyItem.time}: ранний темп хороший.` : `${earlyItem.item} — ${earlyItem.time}: тайминг зафиксирован, но подтверждённого ориентира для оценки нет.`, evidence: [], severity: status === 'late' ? 'warning' : isPositiveTiming(status) ? 'good' : 'info' });
  }
  if (timingItem && !timingItemHasExternalContext) {
    const status = timingItemStatus;
    itemsFindings.push({ text: status === 'late' ? heroOverride.timingItemLateFinding(timingItem.time) : isPositiveTiming(status) ? heroOverride.timingItemOnTimeFinding(timingItem.time) : `${timingItem.item} — ${timingItem.time}: тайминг зафиксирован, но подтверждённого ориентира для оценки нет.`, evidence: [], severity: status === 'late' ? 'warning' : isPositiveTiming(status) ? 'good' : 'info' });
  }
  if (suspiciousItems.length > 0) {
    const labels = suspiciousItems.map((item) => item.replaceAll('_', ' ')).join(', ');
    itemsFindings.push({
      text: heroOverride.suspiciousItemFinding(labels),
      evidence: [],
      severity: 'bad'
    });
  } else if (earlyItem && timingItem && isPositiveTiming(earlyItemStatus) && isPositiveTiming(timingItemStatus)) {
    itemsFindings.push({
      text: 'Ранние ключевые предметы куплены вовремя. Оценка основана на ранних ключевых таймингах.',
      evidence: [`ключевых слотов в сборке: ${coreItemsSeen.length}`],
      severity: 'info'
    });
  }
  for (const status of itemStatuses) {
    const actual = trackedTimings.find((timing) => timing.key === status.key);
    if (!actual) continue;
    const nearest = findNearestUsableItemTimingBucket(timingBuckets, status.key, actual.timeSeconds);
    if (!nearest) continue;
    status.scenarioContext = {
      nearestBucketTimeLabel: nearest.timeLabel,
      nearestBucketTimeSeconds: nearest.timeLowerBound,
      games: nearest.games,
      wins: nearest.wins,
      winRate: nearest.winRate,
      sampleSizeStatus: nearest.sampleSize === 'standard' ? 'standard' : 'weak'
    };
    const confidence = nearest.sampleSize === 'standard' ? 'нормальная выборка' : 'слабый контекст';
    itemsFindings.push({ text: `${status.name} ${status.time}: ближайший timing context OpenDota — ${nearest.timeLabel} (${nearest.games} игр, ${nearest.winRate !== null ? (nearest.winRate * 100).toFixed(1) : 'n/a'}% winrate; ${confidence}). Это контекст, а не оценка качества тайминга.`, evidence: [], severity: 'info' });
  }


  const benchmarkMetrics = benchmarkContext.heroBenchmarks?.metrics ?? {};
  const unavailableBenchmark = getPercentileForValue(undefined, 0);
  const gpmBench = gpm === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.gold_per_min, gpm);
  const xpmBench = xpm === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.xp_per_min, xpm);
  const lhBench = lastHitsPerMin === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.last_hits_per_min, lastHitsPerMin);
  const hdBench = heroDamagePerMin === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.hero_damage_per_min, heroDamagePerMin);
  const tdBench = towerDamage === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.tower_damage, towerDamage);
  const killsPerMin = durationMinutes !== undefined && durationMinutes > 0 && p?.kills !== undefined ? p.kills / durationMinutes : undefined;
  const kpmBench = killsPerMin === undefined ? unavailableBenchmark : getPercentileForValue(benchmarkMetrics.kills_per_min, killsPerMin);

  const actualAtMinute = (minute: number) => p?.economyCheckpoints?.find((sample) => sample.minute === minute);
  const benchmarkScore = (comparison: ReturnType<typeof getPercentileForValue>): number | undefined => {
    if (comparison.lowerPercentile !== undefined) return comparison.lowerPercentile;
    if (comparison.upperPercentile !== undefined) return Math.max(1, comparison.upperPercentile - 5);
    return undefined;
  };
  const benchmarkSeverity = (comparison: ReturnType<typeof getPercentileForValue>): AnalysisFinding['severity'] => {
    const value = benchmarkScore(comparison);
    return value === undefined ? 'info' : value >= 70 ? 'good' : value < 50 ? 'warning' : 'info';
  };
  const heroDamagePercentile = benchmarkScore(hdBench);
  const fightsSummary = lateDeaths >= 3
    ? heroDamagePercentile !== undefined && heroDamagePercentile >= 70
      ? 'Сильный урон, но высокий риск смертей в лейте'
      : heroDamagePercentile !== undefined && heroDamagePercentile < 50
        ? 'Низкий вклад в драках и высокий риск смертей'
        : 'Высокий риск смертей в лейте'
    : (deaths ?? 0) >= 8
      ? 'Много смертей для core'
      : heroDamagePercentile !== undefined && heroDamagePercentile >= 70
        ? 'Сильный вклад в драках'
        : heroDamagePercentile !== undefined && heroDamagePercentile < 50
          ? 'Вклад в драках ниже ориентира'
          : 'Рабочий вклад в драки';
  const economyPercentile = benchmarkScore(gpmBench);
  const mapSummary = economyPercentile !== undefined && economyPercentile >= 70
    ? lateDeaths >= 3 ? 'Экономика выше ориентира, но лейт рискованный' : 'Экономика выше ориентира'
    : economyPercentile !== undefined && economyPercentile >= 50 ? 'Экономика на среднем уровне'
      : economyPercentile !== undefined ? 'Темп экономики ниже ориентира' : 'Темп экономики по данным матча';
  
  const laneFindings: AnalysisFinding[] = [];
  if (lanePct !== undefined) laneFindings.push({ text: `${Math.round(lanePct)}% эффективности линии.`, evidence: ['по данным линии OpenDota'], severity: 'info' });
  if (p?.laneReview?.lhAt10 !== undefined) {
    laneFindings.push({ text: `${Math.round(p.laneReview.lhAt10)} LH к 10:00.`, evidence: [], severity: 'info' });
  }
  if (laneDeaths >= 2) laneFindings.push({ text: `${laneDeaths} смерти до 10:00 сильно снижают оценку линии.`, evidence: [], severity: 'warning' });
  if (laneDeaths > 0) {
    const availableLaneMetrics = [
      p?.laneReview?.lhAt10 !== undefined ? `${Math.round(p.laneReview.lhAt10)} LH к 10:00` : undefined,
      lanePct !== undefined ? `${Math.round(lanePct)}% эффективности линии` : undefined
    ].filter((value): value is string => Boolean(value));
    laneFindings.push({
      text: `${availableLaneMetrics.length ? `${availableLaneMetrics.join(' и ')} — рабочий старт, но ` : ''}${laneDeaths} смерти до 10:00 мешают назвать линию выигранной.`,
      evidence: [],
      severity: 'warning'
    });
  }
  if (!laneFindings.length) laneFindings.push({ text: 'Подробная оценка линии недоступна: OpenDota не вернул lane efficiency или минутные срезы для этого матча.', evidence: ['lane data unavailable'], severity: 'info' });


  const damageFinding: AnalysisFinding = heroDamagePerMin === undefined ? {
    text: 'Данные об уроне по героям недоступны.', evidence: ['damage data unavailable'], severity: 'info'
  } : {
    text: formatPercentileRange(hdBench.lowerPercentile, hdBench.upperPercentile)
      ? `${fmt(heroDamagePerMin)} урона по героям в минуту — ${formatPercentileRange(hdBench.lowerPercentile, hdBench.upperPercentile)} для ${heroOverride.heroName}.`
      : `${fmt(heroDamagePerMin)} урона по героям в минуту.`,
    evidence: heroDamage !== undefined && durationMinutes !== undefined ? [`${Math.round(heroDamage).toLocaleString('ru-RU')} урона за ${fmt(durationMinutes)} мин`] : [],
    severity: benchmarkSeverity(hdBench)
  };

  const fightsFindings: AnalysisFinding[] = deathsByPhase
    ? [
        ...(deathsByPhase.lateGame >= 3
          ? [{ text: deaths === undefined ? `${deathsByPhase.lateGame} смертей пришлись на лейт — для core это главный риск, потому что каждая смерть после 35:00 открывает окно на Roshan, buyback pressure или строения.` : `${deathsByPhase.lateGame} из ${deaths} смертей пришлись на лейт — для core это главный риск, потому что каждая смерть после 35:00 открывает окно на Roshan, buyback pressure или строения.`, evidence: [], severity: 'bad' as const }]
          : []),
        ...(laneDeaths >= 2
          ? [{ text: `${laneDeaths} смерти до 10:00 замедлили старт и первый ключевой предмет.`, evidence: [], severity: 'warning' as const }]
          : []),
        damageFinding
      ].slice(0, 3)
    : [
        damageFinding,
        ...(deaths === undefined ? [] : [{ text: `${deaths} смертей — главный риск для carry.`, evidence: [`${deaths} смертей`], severity: deaths >= 8 ? 'bad' as const : 'info' as const }]),
        { text: 'Разложить смерти по фазам пока нельзя.', evidence: [], severity: 'info' }
      ];


  const mapFindings: AnalysisFinding[] = [
    ...(gpm !== undefined && formatPercentileRange(gpmBench.lowerPercentile, gpmBench.upperPercentile) ? [{ text: `${Math.round(gpm)} GPM — ${formatPercentileRange(gpmBench.lowerPercentile, gpmBench.upperPercentile)} по ориентиру OpenDota для ${heroOverride.heroName}.`, evidence: ['общая экономика матча'], severity: benchmarkSeverity(gpmBench) }] : []),
    ...(xpm !== undefined && formatPercentileRange(xpmBench.lowerPercentile, xpmBench.upperPercentile) ? [{ text: `${Math.round(xpm)} XPM — ${formatPercentileRange(xpmBench.lowerPercentile, xpmBench.upperPercentile)} по ориентиру OpenDota.`, evidence: [], severity: benchmarkSeverity(xpmBench) }] : []),
    ...(lastHitsPerMin !== undefined && formatPercentileRange(lhBench.lowerPercentile, lhBench.upperPercentile) ? [{ text: `${fmt(lastHitsPerMin)} LH/мин — ${formatPercentileRange(lhBench.lowerPercentile, lhBench.upperPercentile)} по ориентиру OpenDota.`, evidence: ['темп фарма за матч'], severity: benchmarkSeverity(lhBench) }] : [])
  ];
  if (p?.economyByPhaseSource === 'gold_t/lh_t' && p.economyByPhase) {
    const phaseLabels: Record<MatchPhase, string> = { laning: '0–10 мин', earlyMid: '10–20 мин', midGame: '20–35 мин', lateGame: 'после 35 мин' };
    const phases = (Object.entries(p.economyByPhase) as Array<[MatchPhase, { lhPerMinuteInPhase?: number }]>).filter((entry) => entry[1].lhPerMinuteInPhase !== undefined).sort((a, b) => b[1].lhPerMinuteInPhase! - a[1].lhPerMinuteInPhase!);
    const best = phases[0];
    const worst = phases.at(-1);
    if (phases.length >= 2 && best && worst) mapFindings.unshift({ text: `Лучший темп фарма — ${phaseLabels[best[0]]} (${fmt(best[1].lhPerMinuteInPhase!)} LH/мин), худший — ${phaseLabels[worst[0]]} (${fmt(worst[1].lhPerMinuteInPhase!)} LH/мин).`, evidence: ['темп по фазам'], severity: 'info' });
    const phaseOrder: MatchPhase[] = ['laning', 'earlyMid', 'midGame', 'lateGame'];
    const phaseWithMostDeaths = deathsByPhase && (Object.entries(deathsByPhase) as Array<[MatchPhase, number]>).sort((a, b) => b[1] - a[1])[0];
    if (phaseWithMostDeaths?.[1]) {
      const phaseFarm = p.economyByPhase[phaseWithMostDeaths[0]]?.lhPerMinuteInPhase;
      const nextPhase = phaseOrder.slice(phaseOrder.indexOf(phaseWithMostDeaths[0]) + 1).find((phase) => p.economyByPhase?.[phase]?.lhPerMinuteInPhase !== undefined);
      const nextFarm = nextPhase ? p.economyByPhase[nextPhase]?.lhPerMinuteInPhase : undefined;
      if (phaseFarm !== undefined && nextFarm !== undefined) {
        const direction = nextFarm > phaseFarm ? 'вырос' : nextFarm < phaseFarm ? 'снизился' : 'не изменился';
        mapFindings.unshift({ text: `В отрезке ${phaseLabels[phaseWithMostDeaths[0]]} было ${phaseWithMostDeaths[1]} смерт. После него темп фарма ${direction} с ${fmt(phaseFarm)} до ${fmt(nextFarm)} LH/мин.`, evidence: ['смерти и темп по фазам'], severity: nextFarm < phaseFarm ? 'warning' : 'info' });
      }
    }
  } else mapFindings.push({ text: 'Фазовый темп экономики недоступен: OpenDota не вернул минутные срезы фарма для этого матча.', evidence: ['нет минутных срезов фарма'], severity: 'info' });
  if (p?.goldReasons?.breakdownComplete) {
    const sourceGroups = new Set(['creeps', 'neutral', 'heroes', 'buildings', 'roshan', 'courier']);
    const dominant = p.goldReasons.groups.filter((entry) => entry.amount > 0 && sourceGroups.has(entry.group)).sort((a, b) => b.amount - a.amount)[0];
    if (dominant) mapFindings.unshift({ text: `Главный подтверждённый источник экономики — ${dominant.label.toLowerCase()}: ${Math.round(dominant.amount).toLocaleString('ru-RU')} золота.`, evidence: ['разбивка источников экономики'], severity: 'info' });
  } else if (p?.farmProfile) {
    const countSources: Array<[string, number | undefined]> = [['лейн-крипы', p.farmProfile.laneKills], ['нейтралы', p.farmProfile.neutralKills], ['древние', p.farmProfile.ancientKills]];
    const dominant = countSources.filter((entry): entry is [string, number] => entry[1] !== undefined).sort((a, b) => b[1] - a[1])[0];
    if (dominant) mapFindings.unshift({ text: `По резервному профилю чаще всего игрок добивал категорию «${dominant[0]}» (${dominant[1]}). Это счётчик событий, не сумма золота.`, evidence: ['профиль добиваний'], severity: 'info' });
  }
  const laneScoreWithEfficiency = score(60, lanePct === undefined ? 0 : lanePct >= 70 ? 8 : lanePct >= 60 ? 2 : -4);
  const laneFinalScore = score(laneScoreWithEfficiency, -(laneDeaths * 6));
  const itemsScore = suspiciousItems.length > 0
    ? 58
    : earlyItem && timingItem && !earlyItemHasExternalContext && !timingItemHasExternalContext && isPositiveTiming(earlyItemStatus) && isPositiveTiming(timingItemStatus)
      ? 73
      : 64;

  const topMistakes = [
    ...(lateDeaths >= 3 ? [`${lateDeaths} смертей после 35:00 — главный риск. В лейте смерть core-героя даёт сопернику окно на Roshan, buyback pressure или строения.`] : []),
    ...(laneDeaths >= 2 ? [`${laneDeaths} смерти до 10:00 снизили качество линии${p?.laneReview?.lhAt10 !== undefined ? ` при ${Math.round(p.laneReview.lhAt10)} LH` : ''}${lanePct !== undefined ? ` и ${Math.round(lanePct)}% эффективности` : ''}.`] : []),
    ...(lanePct !== undefined && lanePct < 60 ? [`Линия просела по эффективности (${Math.round(lanePct)}%).`] : [])
  ].slice(0, 3);
  if (towerDamage !== undefined && towerDamage > 0 && formatPercentileRange(tdBench.lowerPercentile, tdBench.upperPercentile)) mapFindings.push({ text: `${Math.round(towerDamage).toLocaleString('ru-RU')} урона по строениям — ${formatPercentileRange(tdBench.lowerPercentile, tdBench.upperPercentile)} по ориентиру OpenDota.`, evidence: [], severity: benchmarkSeverity(tdBench) });

  const safeTopMistakes = topMistakes.length > 0
    ? topMistakes
    : deaths !== undefined && deaths > 0
      ? [`${deaths} смертей — высокий риск для carry, но разложение по фазам недоступно.`]
      : ['Критичных ошибок по доступным данным не найдено.'];

  const previousFightScore = score(58, heroDamagePerMin === undefined ? 0 : heroDamagePerMin >= 700 ? 10 : -5);
  const fightBaseBenchmarkScore = benchmarkScore(hdBench) ?? previousFightScore;
  const deathRiskAdjustment = -(lateDeaths * 4 + laneDeaths * 2);
  const fightScore = score(fightBaseBenchmarkScore, deathRiskAdjustment);
  const benchmarkMetric = (actual: number | undefined, comparison: ReturnType<typeof getPercentileForValue>) =>
    actual !== undefined && (comparison.lowerPercentile !== undefined || comparison.upperPercentile !== undefined)
      ? { actual, percentileRange: comparison.percentileRange, lowerPercentile: comparison.lowerPercentile, upperPercentile: comparison.upperPercentile, label: comparison.label }
      : undefined;
  const actualLhAt10 = actualAtMinute(10)?.cs ?? p?.laneReview?.lhAt10;
  const laneLhTarget = actualLhAt10 === undefined ? undefined : Math.round(actualLhAt10);
  const knownLateDeaths = deathsByPhase?.lateGame ?? (deathTimings !== undefined ? lateDeathsAfter35 : undefined);
  const biggestRisk = deaths === undefined && deathsByPhase === undefined && deathTimings === undefined
    ? 'Недостаточно данных о смертях, чтобы надёжно оценить риск в поздней игре.'
    : deaths === 0 && knownLateDeaths === 0
      ? 'По данным о смертях явного риска не выявлено.'
    : deaths !== undefined && knownLateDeaths !== undefined
      ? `Главный риск — смерти core-героя: ${deaths} смертей всего, из них ${knownLateDeaths} после 35:00. В лейте такие смерти дают сопернику окна на Roshan, buyback pressure и строения.`
      : knownLateDeaths !== undefined
        ? `Главный риск — поздние смерти core-героя: подтверждено ${knownLateDeaths} после 35:00. В лейте такие смерти дают сопернику окна на Roshan, buyback pressure и строения.`
        : `${deaths} смертей всего, но данных по фазам недостаточно для оценки риска в поздней игре.`;

  return { matchId: match.matchId, hero: heroOverride.heroName, role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings, itemAnalysis: itemStatuses, benchmarkSummary: benchmarkContext.heroBenchmarks?.available ? { source: 'opendota', heroId: heroOverride.heroId, metrics: { gpm: benchmarkMetric(gpm, gpmBench), xpm: benchmarkMetric(xpm, xpmBench), lhPerMin: benchmarkMetric(lastHitsPerMin, lhBench), heroDamagePerMin: benchmarkMetric(heroDamagePerMin, hdBench), towerDamage: benchmarkMetric(towerDamage, tdBench), killsPerMin: benchmarkMetric(killsPerMin, kpmBench) } } : undefined, heroAverageComparison: benchmarkContext.heroAverage ? { source: 'stratz', methodologyStatus: 'research', selectedPosition: benchmarkContext.heroAverage.selectedPosition, checkpoints: [10, 20, 35].map((minute) => { const actualCs = actualAtMinute(minute)?.cs ?? (minute === 10 ? p?.laneReview?.lhAt10 : undefined); const averageCs = benchmarkContext.heroAverage?.samples.find((sample) => sample.time === minute && (!sample.position || sample.position === heroOverride.position))?.cs; return { minute, actualCs, averageCs, deltaCs: actualCs !== undefined && averageCs !== undefined ? actualCs - averageCs : undefined }; }) } : undefined, economyByPhase: p?.economyByPhase, deathsByPhase, farmProfile: p?.farmProfile, goldReasons: p?.goldReasons, stratz,
    grades: { lane: { score: laneFinalScore, summary: laneSummary, findings: laneFindings.slice(0, 3) }, items: { score: itemsScore, summary: itemsSummary, findings: itemsFindings.slice(0, 3) }, fights: { score: fightScore, summary: fightsSummary, findings: fightsFindings.slice(0, 3) }, map: { score: benchmarkScore(gpmBench) !== undefined && benchmarkScore(lhBench) !== undefined ? Math.round((benchmarkScore(gpmBench)! + benchmarkScore(lhBench)!) / 2) : score(60, gpm === undefined ? 0 : gpm >= 650 ? 10 : -5), summary: mapSummary, findings: mapFindings.slice(0, 3) } },
    scoreBreakdown: { fights: { baseBenchmarkScore: fightBaseBenchmarkScore, deathRiskAdjustment, finalScore: fightScore } },
    topMistakes: safeTopMistakes,
    nextGameAdjustments: [
      'После 35:00 цель — не умирать перед Roshan/объектами: играй от вижена, buyback и позиции команды.',
      laneLhTarget !== undefined ? `На линии цель — 0 смертей до 10:00 при сохранении не менее ${laneLhTarget} LH.` : 'На линии цель — 0 смертей до 10:00 без потери доступного фарма.',
      heroOverride.postTimingAdjustment
    ].filter((adjustment): adjustment is string => Boolean(adjustment)).slice(0, 3),
    finalVerdict: { mainReason: gpm !== undefined && heroDamage !== undefined ? (result === 'win' ? `Победа за счёт темпа экономики и драк: ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона.` : `Поражение при ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона: не хватило стабильной конвертации темпа.`) : `${result === 'win' ? 'Победа' : 'Поражение'}: часть данных об экономике и уроне недоступна, вывод основан на подтверждённых событиях матча.`, biggestRisk, nextMatchFocus: 'После 35:00 играй от вижена и позиции команды: не начинай драку первым, сохраняй buyback и заходи в драку после раскрытия ключевых кнопок врага.' },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
