import { compareItemTiming } from '../postMatch/itemBenchmarks';
import { getMatchPhase, type MatchPhase } from '../postMatch/phases';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis, PostMatchBenchmarkContext, StratzPostMatchData } from '../../types/domain';
import { formatPercentileRange, getPercentileForValue } from '../../analyze/compareToBenchmarks';
import { findNearestUsableItemTimingBucket } from '../../analyze/itemTimingBenchmarks';

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
  const stratzPhaseDeathsAvailable = stratz?.deathsByPhase !== undefined
    || (stratz?.eventCoverage?.selectedDeathEvents === true && stratz.deathTimings !== undefined);
  const openDotaPhaseDeathsAvailable = p?.deathDataSource !== undefined
    && p.deathDataSource !== 'unavailable';
  const reportedDeathsByPhase = stratzPhaseDeathsAvailable ? stratz?.deathsByPhase : openDotaPhaseDeathsAvailable ? p?.deathsByPhase : undefined;
  const reportedDeathTimings = stratzPhaseDeathsAvailable ? stratz?.deathTimings : openDotaPhaseDeathsAvailable ? p?.deathTimings : undefined;
  const deathlessPhases = { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 };
  const deathsByPhase = deaths === 0 ? deathlessPhases : reportedDeathsByPhase;
  const deathTimings = deaths === 0 ? [] : reportedDeathTimings;
  const knownLateDeaths = deaths === 0 ? 0 : deathsByPhase?.lateGame
    ?? (deathTimings !== undefined ? deathTimings.filter((death) => death.timeSeconds >= 2100).length : undefined);
  const productStratz = deaths === 0 && stratz
    ? { ...stratz, deathsByPhase: deathlessPhases, deathTimings: [] }
    : stratz;
  const lanePct = p?.laneReview?.laneEfficiencyPct;

  const laneDeaths = deaths === 0 ? 0 : stratz?.deathsByPhase?.laning ?? p?.laneReview?.deathsBefore10;
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

  const laneSummary = lanePct === undefined
    ? 'Линия без полной телеметрии'
    : lanePct >= 70
      ? 'Сильный показатель эффективности линии'
      : lanePct >= 60
        ? 'Рабочий показатель эффективности линии'
        : 'Есть направление для улучшения фарма на линии';

  const itemsSummary = !trackedTimings.length
    ? 'Нет данных о ключевых покупках'
    : suspiciousItems.length > 0
      ? 'В билде есть спорные слоты'
    : earlyItemStatus === 'late' || timingItemStatus === 'late'
      ? 'Есть задержка по таймингу'
    : earlyItemHasExternalContext || timingItemHasExternalContext
      ? 'Покупки зафиксированы, оценка недоступна'
      : earlyItem && timingItem && isPositiveTiming(earlyItemStatus) && isPositiveTiming(timingItemStatus)
        ? 'Ранние ключевые предметы в темпе'
        : earlyItem || timingItem
          ? 'Тайминги зафиксированы без подтверждённой оценки'
        : 'Покупки зафиксированы, оценка недоступна';

  const itemsFindings: AnalysisFinding[] = [];
  if (!trackedTimings.length) itemsFindings.push({ text: 'OpenDota не вернул данные о ключевых покупках этого игрока.', evidence: [], severity: 'info' });
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
    // The nearest scenario remains available in itemAnalysis for research/debug,
    // but is deliberately not presented as a product recommendation or norm.
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
  const deathRiskKind = deaths === 0 ? 'deathless' : deaths === undefined ? 'unavailable' : 'events-only';
  const heroDamagePercentile = benchmarkScore(hdBench);
  const fightsSummary = heroDamagePercentile !== undefined && heroDamagePercentile >= 70
    ? 'Сильный вклад в драках'
    : heroDamagePercentile !== undefined && heroDamagePercentile < 50
      ? 'Вклад в драках ниже ориентира'
      : heroDamagePercentile !== undefined
        ? 'Рабочий вклад в драках'
        : 'Данные о драках без надёжной оценки';
  const economyPercentile = benchmarkScore(gpmBench);
  const mapSummary = economyPercentile !== undefined && economyPercentile >= 70
    ? 'Экономика выше ориентира'
    : economyPercentile !== undefined && economyPercentile >= 50 ? 'Экономика на среднем уровне'
      : economyPercentile !== undefined ? 'Темп экономики ниже ориентира' : 'Темп экономики по данным матча';
  
  const laneFindings: AnalysisFinding[] = [];
  if (lanePct !== undefined) laneFindings.push({ text: `${Math.round(lanePct)}% эффективности линии.`, evidence: ['по данным линии OpenDota'], severity: 'info' });
  if (p?.laneReview?.lhAt10 !== undefined) {
    laneFindings.push({ text: `${Math.round(p.laneReview.lhAt10)} добитых крипов к 10:00.`, evidence: [], severity: 'info' });
  }
  if (laneDeaths !== undefined && laneDeaths > 0) {
    const availableLaneMetrics = [
      p?.laneReview?.lhAt10 !== undefined ? `${Math.round(p.laneReview.lhAt10)} добитых крипов к 10:00` : undefined,
      lanePct !== undefined ? `${Math.round(lanePct)}% эффективности линии` : undefined
    ].filter((value): value is string => Boolean(value));
    laneFindings.push({
      text: `${availableLaneMetrics.length ? `${availableLaneMetrics.join(' и ')}. ` : ''}До 10:00 зафиксировано смертей: ${laneDeaths}. Причины и влияние этих эпизодов по данным матча не установлены.`,
      evidence: [], severity: 'info'
    });
  }
  if (laneDeaths === undefined) laneFindings.push({ text: 'OpenDota не вернул число смертей до 10:00.', evidence: [], severity: 'info' });
  if (!laneFindings.length) laneFindings.push({ text: 'Подробная оценка линии недоступна: OpenDota не вернул показатель эффективности или минутные срезы для этого матча.', evidence: [], severity: 'info' });


  const damageFinding: AnalysisFinding = heroDamagePerMin === undefined ? {
    text: 'Данные об уроне по героям недоступны.', evidence: ['damage data unavailable'], severity: 'info'
  } : {
    text: formatPercentileRange(hdBench.lowerPercentile, hdBench.upperPercentile)
      ? `${fmt(heroDamagePerMin)} урона по героям в минуту — ${formatPercentileRange(hdBench.lowerPercentile, hdBench.upperPercentile)} для ${heroOverride.heroName}.`
      : `${fmt(heroDamagePerMin)} урона по героям в минуту.`,
    evidence: heroDamage !== undefined && durationMinutes !== undefined ? [`${Math.round(heroDamage).toLocaleString('ru-RU')} урона за ${fmt(durationMinutes)} мин`] : [],
    severity: benchmarkSeverity(hdBench)
  };

  const fightsFindings: AnalysisFinding[] = [
    deaths !== undefined
      ? { text: `Смертей за матч: ${deaths}${knownLateDeaths !== undefined ? `; после 35:00: ${knownLateDeaths}` : ''}. Эти значения не оценивают качество решений без контекста эпизодов.`, evidence: [], severity: 'info' }
      : { text: 'Число смертей недоступно.', evidence: [], severity: 'info' },
    damageFinding
  ];


  const mapFindings: AnalysisFinding[] = [
    ...(gpm !== undefined && formatPercentileRange(gpmBench.lowerPercentile, gpmBench.upperPercentile) ? [{ text: `${Math.round(gpm)} золота в минуту — ${formatPercentileRange(gpmBench.lowerPercentile, gpmBench.upperPercentile)} по ориентиру OpenDota для ${heroOverride.heroName}.`, evidence: ['общая экономика матча'], severity: benchmarkSeverity(gpmBench) }] : []),
    ...(xpm !== undefined && formatPercentileRange(xpmBench.lowerPercentile, xpmBench.upperPercentile) ? [{ text: `${Math.round(xpm)} опыта в минуту — ${formatPercentileRange(xpmBench.lowerPercentile, xpmBench.upperPercentile)} по ориентиру OpenDota.`, evidence: [], severity: benchmarkSeverity(xpmBench) }] : []),
    ...(lastHitsPerMin !== undefined && formatPercentileRange(lhBench.lowerPercentile, lhBench.upperPercentile) ? [{ text: `${fmt(lastHitsPerMin)} добитых крипов в минуту — ${formatPercentileRange(lhBench.lowerPercentile, lhBench.upperPercentile)} по ориентиру OpenDota.`, evidence: ['темп фарма за матч'], severity: benchmarkSeverity(lhBench) }] : [])
  ];
  if (p?.economyByPhaseSource !== 'unavailable' && p?.economyByPhase) {
    const phaseLabels: Record<MatchPhase, string> = { laning: '0–10 мин', earlyMid: '10–20 мин', midGame: '20–35 мин', lateGame: 'после 35 мин' };
    const phases = (Object.entries(p.economyByPhase) as Array<[MatchPhase, { startMinute: number; endMinute: number; lhPerMinuteInPhase?: number }]>).filter((entry) => entry[1].lhPerMinuteInPhase !== undefined);
    const farmInterval = (value: { startMinute: number; endMinute: number }) => `${value.startMinute}–${value.endMinute} мин`;
    if (phases.length >= 2) mapFindings.unshift({ text: phases.map(([, value]) => `${farmInterval(value)}: ${fmt(value.lhPerMinuteInPhase!)} крипа/мин`).join('; ') + '.', evidence: ['темп по фазам'], severity: 'info' });
    const phaseOrder: MatchPhase[] = ['laning', 'earlyMid', 'midGame', 'lateGame'];
    const phaseWithMostDeaths = deathsByPhase && (Object.entries(deathsByPhase) as Array<[MatchPhase, number]>).sort((a, b) => b[1] - a[1])[0];
    if (phaseWithMostDeaths?.[1]) {
      const phaseFarm = p.economyByPhase[phaseWithMostDeaths[0]]?.lhPerMinuteInPhase;
      const nextPhase = phaseOrder.slice(phaseOrder.indexOf(phaseWithMostDeaths[0]) + 1).find((phase) => p.economyByPhase?.[phase]?.lhPerMinuteInPhase !== undefined);
      const nextFarm = nextPhase ? p.economyByPhase[nextPhase]?.lhPerMinuteInPhase : undefined;
      if (phaseFarm !== undefined && nextFarm !== undefined) {
        const direction = nextFarm > phaseFarm ? 'вырос' : nextFarm < phaseFarm ? 'снизился' : 'не изменился';
        const deathPhaseEconomy = p.economyByPhase[phaseWithMostDeaths[0]]!;
        const nextPhaseEconomy = p.economyByPhase[nextPhase!]!;
        mapFindings.unshift({ text: `В полной фазе ${phaseLabels[phaseWithMostDeaths[0]]} было ${phaseWithMostDeaths[1]} смерт. Между доступными отрезками фарма ${farmInterval(deathPhaseEconomy)} и ${farmInterval(nextPhaseEconomy)} темп ${direction} с ${fmt(phaseFarm)} до ${fmt(nextFarm)} крипа/мин; причинная связь не установлена.`, evidence: ['смерти и темп по фазам'], severity: 'info' });
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
    if (dominant) mapFindings.unshift({ text: `Добито больше всего в категории «${dominant[0]}»: ${dominant[1]}.`, evidence: ['профиль добиваний'], severity: 'info' });
  }
  const itemsScore = suspiciousItems.length > 0
    ? 58
    : earlyItem && timingItem && !earlyItemHasExternalContext && !timingItemHasExternalContext && isPositiveTiming(earlyItemStatus) && isPositiveTiming(timingItemStatus)
      ? 73
      : undefined;
  if (towerDamage !== undefined && towerDamage > 0 && formatPercentileRange(tdBench.lowerPercentile, tdBench.upperPercentile)) mapFindings.push({ text: `${Math.round(towerDamage).toLocaleString('ru-RU')} урона по строениям — ${formatPercentileRange(tdBench.lowerPercentile, tdBench.upperPercentile)} по ориентиру OpenDota.`, evidence: [], severity: benchmarkSeverity(tdBench) });

  const benchmarkMetric = (actual: number | undefined, comparison: ReturnType<typeof getPercentileForValue>) =>
    actual !== undefined && (comparison.lowerPercentile !== undefined || comparison.upperPercentile !== undefined)
      ? { actual, percentileRange: comparison.percentileRange, lowerPercentile: comparison.lowerPercentile, upperPercentile: comparison.upperPercentile, label: comparison.label }
      : undefined;
  const actualLhAt10 = actualAtMinute(10)?.cs ?? p?.laneReview?.lhAt10;
  const laneLhTarget = actualLhAt10 === undefined ? undefined : Math.round(actualLhAt10);
  const hasPhaseEconomy = p?.economyByPhaseSource !== 'unavailable'
    && Object.values(p?.economyByPhase ?? {}).some((phase) => phase?.goldPerMinuteInPhase !== undefined || phase?.lhPerMinuteInPhase !== undefined);
  const priorities: PostMatchAnalysis['priorities'] = [];

  if (lanePct !== undefined && lanePct < 60) priorities.push({
    id: 'lane-farm', title: 'Улучшить фарм на линии',
    fact: `В этой игре: ${actualLhAt10 !== undefined ? `${Math.round(actualLhAt10)} добитых крипов к 10:00; ` : ''}эффективность линии — ${Math.round(lanePct)}%${laneDeaths !== undefined ? `; смертей до 10:00 — ${laneDeaths}` : '; число смертей до 10:00 недоступно'}.`,
    meaning: 'Доступный показатель эффективности отмечает фарм на линии как направление для улучшения. Он не устанавливает причину результата матча.',
    action: 'Пересмотри первые 10 минут и отметь пропущенные добивания и отрезки, когда не удавалось фармить.',
    dataState: laneDeaths === undefined || actualLhAt10 === undefined ? 'partial' : 'available', severity: 'warning'
  });
  if (laneDeaths !== undefined && laneDeaths > 0 && priorities.length < 2) priorities.push({
    id: 'lane-events', title: laneDeaths === 1 ? 'Сохранить темп линии' : 'Проверить ранние эпизоды',
    fact: `В этой игре: ${actualLhAt10 !== undefined ? `${Math.round(actualLhAt10)} добитых крипов и ` : ''}${laneDeaths} ${laneDeaths === 1 ? 'смерть' : 'смерти'} к 10:00${lanePct !== undefined ? `; эффективность линии — ${Math.round(lanePct)}%` : ''}.`,
    meaning: laneDeaths === 1 ? 'Один эпизод не доказывает ошибку или проигранную линию, но его можно проверить.' : 'Данные отмечают несколько эпизодов для проверки, но не устанавливают их причины или влияние на линию.',
    action: 'Открой запись первых 10 минут и проверь решение перед каждым отмеченным эпизодом.',
    target: laneLhTarget !== undefined ? { text: `Сохранить свой результат — ${laneLhTarget} добитых крипов — и попробовать пройти линию без смерти.`, source: 'personal' } : { text: 'Попробовать пройти первые 10 минут без смерти.', source: 'training' },
    dataState: actualLhAt10 === undefined ? 'partial' : 'available', severity: 'info'
  });
  if (economyPercentile !== undefined && economyPercentile < 50 && priorities.length < 2) priorities.push({
    id: 'economy', title: 'Проверить темп экономики',
    fact: `В этой игре: ${gpm !== undefined ? `${Math.round(gpm)} золота в минуту` : 'значение золота в минуту недоступно'}; показатель ниже доступного ориентира OpenDota.`,
    meaning: hasPhaseEconomy
      ? 'Сравнение отмечает темп экономики как направление для разбора, но не объясняет причину результата.'
      : 'Сравнение отмечает темп экономики как направление для разбора, но данных по фазам недостаточно, чтобы указать конкретный отрезок.',
    action: hasPhaseEconomy
      ? 'Сравни отрезки фарма по фазам и выбери один период, где можно сократить время без получения золота.'
      : 'Посмотри запись матча и отметь один продолжительный отрезок без получения золота.',
    dataState: gpm === undefined || !hasPhaseEconomy ? 'partial' : 'available', severity: 'warning'
  });

  const topMistakes = priorities.filter((priority) => priority.severity === 'warning').map((priority) => priority.fact);
  const safeTopMistakes = topMistakes.length ? topMistakes : ['Критичных ошибок по доступным данным не найдено.'];
  const nextGameAdjustments = priorities.map((priority) => priority.target?.text ?? priority.action);
  const biggestRisk = priorities[0]?.meaning ?? (deathRiskKind === 'unavailable'
    ? 'Недостаточно данных, чтобы обосновать приоритет для разбора.'
    : 'По доступным данным приоритетная проблема не установлена.');
  const nextMatchFocus = priorities[0]?.target?.text ?? priorities[0]?.action ?? 'Сохрани сильные стороны и сравни подтверждённые показатели следующего матча.';
  const fightBaseBenchmarkScore = benchmarkScore(hdBench);
  const fightScore = fightBaseBenchmarkScore;
  const deathRiskAdjustment = 0;

  return { matchId: match.matchId, hero: heroOverride.heroName, role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings, itemAnalysis: itemStatuses, benchmarkSummary: benchmarkContext.heroBenchmarks?.available ? { source: 'opendota', heroId: heroOverride.heroId, metrics: { gpm: benchmarkMetric(gpm, gpmBench), xpm: benchmarkMetric(xpm, xpmBench), lhPerMin: benchmarkMetric(lastHitsPerMin, lhBench), heroDamagePerMin: benchmarkMetric(heroDamagePerMin, hdBench), towerDamage: benchmarkMetric(towerDamage, tdBench), killsPerMin: benchmarkMetric(killsPerMin, kpmBench) } } : undefined, heroAverageComparison: benchmarkContext.heroAverage ? { source: 'stratz', methodologyStatus: 'research', selectedPosition: benchmarkContext.heroAverage.selectedPosition, checkpoints: [10, 20, 35].map((minute) => { const actualCs = actualAtMinute(minute)?.cs ?? (minute === 10 ? p?.laneReview?.lhAt10 : undefined); const averageCs = benchmarkContext.heroAverage?.samples.find((sample) => sample.time === minute && (!sample.position || sample.position === heroOverride.position))?.cs; return { minute, actualCs, averageCs, deltaCs: actualCs !== undefined && averageCs !== undefined ? actualCs - averageCs : undefined }; }) } : undefined, economyByPhase: p?.economyByPhase, deathsByPhase, farmProfile: p?.farmProfile, goldReasons: p?.goldReasons, stratz: productStratz,
    grades: { lane: { score: undefined, summary: laneSummary, findings: laneFindings.slice(0, 3) }, items: { score: itemsScore, summary: itemsSummary, findings: itemsFindings.slice(0, 3) }, fights: { score: fightScore, summary: fightsSummary, findings: fightsFindings.slice(0, 3) }, map: { score: benchmarkScore(gpmBench) !== undefined && benchmarkScore(lhBench) !== undefined ? Math.round((benchmarkScore(gpmBench)! + benchmarkScore(lhBench)!) / 2) : undefined, summary: mapSummary, findings: mapFindings.slice(0, 3) } },
    scoreBreakdown: fightBaseBenchmarkScore === undefined ? undefined : { fights: { baseBenchmarkScore: fightBaseBenchmarkScore, deathRiskAdjustment, finalScore: fightScore! } },
    topMistakes: safeTopMistakes,
    nextGameAdjustments,
    priorities: priorities.slice(0, 2),
    finalVerdict: { mainReason: `${result === 'win' ? 'Победа' : 'Поражение'}. ${gpm !== undefined ? `${Math.round(gpm)} золота в минуту` : 'Темп золота недоступен'}${heroDamage !== undefined ? `, ${Math.round(heroDamage).toLocaleString('ru-RU')} урона по героям` : ''}. Эти показатели описывают игру, но не доказывают причину результата.`, biggestRisk, nextMatchFocus },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
