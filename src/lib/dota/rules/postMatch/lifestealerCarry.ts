import {
  compareItemTiming,
  getLifestealerCarryItemBenchmark,
  LIFESTEALER_CARRY_CORE_ITEMS,
  LIFESTEALER_CARRY_SUSPICIOUS_ITEMS
} from '@/lib/dota/rules/postMatch/itemBenchmarks';
import { getPhaseLabel, type MatchPhase } from '@/lib/dota/rules/postMatch/phases';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis, StratzPostMatchData } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number { return Math.max(1, Math.min(99, base + delta)); }
function fmt(value: number, digits = 1): string { return value.toFixed(digits).replace(/\.0$/, ''); }

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch, stratz?: StratzPostMatchData): PostMatchAnalysis {
  const p = match.player; const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const gpm = p?.gpm ?? 0; const xpm = p?.xpm ?? 0; const deaths = p?.deaths ?? 0; const durationMinutes = p?.durationMinutes ?? 0;
  const heroDamage = p?.heroDamage ?? 0; const heroDamagePerMin = p?.heroDamagePerMin ?? 0; const lastHits = p?.lastHits ?? 0; const lastHitsPerMin = p?.lastHitsPerMin ?? 0;
  const trackedTimings = p?.itemTimings ?? []; const getItemTiming = (key: string) => trackedTimings.find((it) => it.key === key);
  const phaseBoots = getItemTiming('phase_boots'); const armlet = getItemTiming('armlet');
  const deathsByPhase = stratz?.deathsByPhase ?? p?.deathsByPhase;
  const deathTimings = stratz?.deathTimings ?? p?.deathTimings;
  const lateDeathsAfter35 = (deathTimings ?? []).filter((d) => d.timeSeconds >= 2100).length;
  const lanePct = p?.laneReview?.laneEfficiencyPct;

  const laneDeaths = deathsByPhase?.laning ?? 0;
  const lateDeaths = deathsByPhase?.lateGame ?? lateDeathsAfter35;
  const phaseBootsStatus = phaseBoots ? compareItemTiming(phaseBoots.timeSeconds, getLifestealerCarryItemBenchmark('phase_boots')?.targetTimeSeconds) : null;
  const armletStatus = armlet ? compareItemTiming(armlet.timeSeconds, getLifestealerCarryItemBenchmark('armlet')?.targetTimeSeconds) : null;
  const coreItemsSeen = (p?.buildPlayed ?? []).filter((item) => LIFESTEALER_CARRY_CORE_ITEMS.includes(item as (typeof LIFESTEALER_CARRY_CORE_ITEMS)[number]));
  const suspiciousItems = (p?.buildPlayed ?? []).filter((item) => LIFESTEALER_CARRY_SUSPICIOUS_ITEMS.includes(item as (typeof LIFESTEALER_CARRY_SUSPICIOUS_ITEMS)[number]));

  const laneSummary = lanePct === undefined
    ? 'Линия без полной телеметрии'
    : lanePct >= 70
      ? 'Сильная линия'
      : lanePct >= 60
        ? laneDeaths >= 2
          ? 'Рабочий фарм, но линия испорчена смертями'
          : 'Рабочая линия без преимущества'
        : 'Линия просела';

  const itemsSummary = !trackedTimings.length
    ? 'Тайминги недоступны'
    : suspiciousItems.length > 0
      ? 'В билде есть спорные слоты для MVP-оценки'
    : phaseBootsStatus === 'late' || armletStatus === 'late'
      ? 'Есть задержка по таймингу'
      : phaseBoots && armlet
        ? 'Ранние ключевые предметы в темпе'
        : 'Тайминги недоступны';

  const fightsSummary = lateDeaths >= 3
    ? 'Сильный урон, но высокий late-risk'
    : deaths >= 8
      ? 'Много смертей для core'
      : 'Рабочий вклад в драки';

  const mapSummary = gpm >= 650
    ? lateDeaths >= 3
      ? 'Экономика сильная, но лейт рискованный'
      : 'Сильная экономика'
    : 'Темп фарма просел';

  const itemsFindings: AnalysisFinding[] = [];
  if (!trackedTimings.length) itemsFindings.push({ text: 'Тайминги ключевых предметов в этом матче недоступны.', evidence: [], severity: 'info' });
  if (phaseBoots) {
    const b = getLifestealerCarryItemBenchmark('phase_boots');
    const status = compareItemTiming(phaseBoots.timeSeconds, b?.targetTimeSeconds);
    itemsFindings.push({ text: `Phase Boots — ${phaseBoots.time}, ${status === 'late' ? `позже MVP-ориентира ${phaseBoots.time}.` : `в темпе по MVP-ориентиру ${b?.targetTimeSeconds ? `(${Math.floor(b.targetTimeSeconds / 60)}:00)` : ''}.`}`, evidence: [], severity: status === 'late' ? 'warning' : 'good' });
  }
  if (armlet) {
    const b = getLifestealerCarryItemBenchmark('armlet');
    const status = compareItemTiming(armlet.timeSeconds, b?.targetTimeSeconds);
    itemsFindings.push({ text: status === 'late' ? `Armlet на ${armlet.time} — позже MVP-ориентира 15:00. Проверь ранний фарм и смерти до первого core item.` : `Armlet на ${armlet.time} — хороший тайминг по MVP-ориентиру для Lifestealer.`, evidence: [], severity: status === 'late' ? 'warning' : 'good' });
  }
  if (suspiciousItems.length > 0) {
    const labels = suspiciousItems.map((item) => item.replaceAll('_', ' ')).join(', ');
    itemsFindings.push({
      text: `${labels} в билде — подозрительный слот для Lifestealer carry в рамках MVP-оценки: предмет хуже усиливает план героя через урон с руки, выживаемость или драку в Armlet/BKB timing.`,
      evidence: [],
      severity: 'bad'
    });
  } else if (phaseBoots && armlet) {
    itemsFindings.push({
      text: 'Phase Boots и Armlet были в хорошем темпе, но оценка пока ограничена: MVP-логика проверяет только ранние core-тайминги и не сравнивает весь билд с STRATZ/OpenDota benchmark.',
      evidence: [`core-слоты в сборке: ${coreItemsSeen.length}`],
      severity: 'info'
    });
  }

  const laneFindings: AnalysisFinding[] = [];
  if (lanePct !== undefined) laneFindings.push({ text: lanePct >= 70 ? `${Math.round(lanePct)}% эффективности линии — сильный ориентир для carry.` : `${Math.round(lanePct)}% эффективности линии — рабочее значение, но ниже сильного ориентира 70%+.`, evidence: ['по данным линии OpenDota'], severity: lanePct >= 70 ? 'good' : 'warning' });
  if (p?.laneReview?.lhAt10 !== undefined) laneFindings.push({ text: `${Math.round(p.laneReview.lhAt10)} LH к 10:00 — нормальный фарм для carry.`, evidence: [], severity: 'info' });
  if ((deathsByPhase?.laning ?? p?.laneReview?.deathsBefore10 ?? 0) >= 2) laneFindings.push({ text: `${deathsByPhase?.laning ?? p?.laneReview?.deathsBefore10} смерти до 10:00 сильно снижают оценку линии.`, evidence: [], severity: 'warning' });
  if (deathsByPhase?.laning && deathsByPhase.laning > 0) laneFindings.push({ text: `${Math.round(p?.laneReview?.lhAt10 ?? 0)} LH к 10:00 и ${Math.round(lanePct ?? 0)}% эффективности линии — рабочий старт, но ${deathsByPhase.laning} смерти до 10:00 мешают назвать линию выигранной.`, evidence: [], severity: 'warning' });
  else if ((p?.laneReview?.deathsBefore10 ?? 0) > 0) laneFindings.push({ text: `${p?.laneReview?.deathsBefore10} смертей до 10:00 могли замедлить первый ключевой предмет.`, evidence: [], severity: 'warning' });
  if (!laneFindings.length) laneFindings.push({ text: 'Подробная оценка линии недоступна: OpenDota не вернул lane efficiency или минутные срезы для этого матча.', evidence: ['lane data unavailable'], severity: 'info' });


  const damageFinding: AnalysisFinding = heroDamagePerMin >= 700
    ? { text: `Урон по героям высокий: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' }
    : { text: `Урон по героям: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин — можно усилить вклад.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' };

  const fightsFindings: AnalysisFinding[] = deathsByPhase
    ? [
        ...(deathsByPhase.lateGame >= 3
          ? [{ text: `${deathsByPhase.lateGame} из ${deaths} смертей пришлись на лейт — для core это главный риск, потому что каждая смерть после 35:00 открывает окно на Roshan, buyback pressure или строения.`, evidence: [], severity: 'bad' as const }]
          : []),
        ...(deathsByPhase.laning >= 2
          ? [{ text: `${deathsByPhase.laning} смерти до 10:00 замедлили старт и первый ключевой предмет.`, evidence: [], severity: 'warning' as const }]
          : []),
        damageFinding
      ].slice(0, 3)
    : [
        damageFinding,
        { text: `${deaths} смертей — главный риск для carry.`, evidence: [`${deaths} смертей`], severity: deaths >= 8 ? 'bad' : 'info' },
        { text: 'Разложить смерти по фазам пока нельзя.', evidence: [], severity: 'info' }
      ];


  const mapFindings: AnalysisFinding[] = [
    { text: `${Math.round(gpm)} GPM / ${Math.round(xpm)} XPM.`, evidence: ['общая экономика матча'], severity: gpm >= 650 ? 'good' : 'warning' },
    { text: `${lastHits} LH за ${fmt(durationMinutes)} мин (${fmt(lastHitsPerMin)} LH/мин).`, evidence: ['темп фарма за матч'], severity: lastHitsPerMin >= 7 ? 'good' : 'info' }
  ];
  if (p?.economyByPhaseSource === 'gold_t/lh_t' && p.economyByPhase) {
    const best = (Object.entries(p.economyByPhase) as Array<[MatchPhase, { lhPerMinuteInPhase?: number }]>).sort((a, b) => (b[1].lhPerMinuteInPhase ?? 0) - (a[1].lhPerMinuteInPhase ?? 0))[0];
    mapFindings.push({ text: `Лучший темп фарма: ${getPhaseLabel(best[0]).toLowerCase()} — ${fmt(best[1].lhPerMinuteInPhase ?? 0)} LH/мин.`, evidence: [], severity: 'info' });
    const lateLh = p.economyByPhase.lateGame?.lhPerMinuteInPhase;
    if (lateLh !== undefined && deathsByPhase?.lateGame !== undefined) mapFindings.push({ text: `Лейт: ${fmt(lateLh)} LH/мин, но высокий темп экономики не компенсирует ${deathsByPhase.lateGame} смертей после 35:00.`, evidence: [], severity: deathsByPhase.lateGame >= 3 ? 'warning' : 'info' });
  } else mapFindings.push({ text: 'Фазовый темп экономики недоступен: OpenDota не вернул минутные срезы фарма для этого матча.', evidence: ['нет минутных срезов фарма'], severity: 'info' });
  const laneScore = score(60, (p?.laneReview?.lhAt10 ?? 0) >= 45 ? 6 : 0);
  const laneScoreWithEfficiency = score(laneScore, (lanePct ?? 0) >= 70 ? 8 : (lanePct ?? 0) >= 60 ? 2 : -4);
  const laneFinalScore = score(laneScoreWithEfficiency, -((deathsByPhase?.laning ?? p?.laneReview?.deathsBefore10 ?? 0) * 6));
  const itemsScore = suspiciousItems.length > 0
    ? 58
    : phaseBoots && armlet && phaseBootsStatus !== 'late' && armletStatus !== 'late'
      ? 73
      : 64;

  const topMistakes = [
    ...(lateDeaths >= 3 ? [`${lateDeaths} смертей после 35:00 — главный риск. В лейте смерть core-героя даёт сопернику окно на Roshan, buyback pressure или строения.`] : []),
    ...(laneDeaths >= 2 ? [`${laneDeaths} смерти до 10:00 снизили качество линии: ${Math.round(p?.laneReview?.lhAt10 ?? 0)} LH и ${Math.round(lanePct ?? 0)}% эффективности выглядят рабоче, но не как выигранная линия.`] : []),
    ...(lanePct !== undefined && lanePct < 60 ? [`Линия просела по эффективности (${Math.round(lanePct)}%).`] : [])
  ].slice(0, 3);
  const safeTopMistakes = topMistakes.length > 0
    ? topMistakes
    : deaths > 0
      ? [`${deaths} смертей — высокий риск для carry, но разложение по фазам недоступно.`]
      : ['Критичных ошибок по доступным данным не найдено.'];

  return { matchId: match.matchId, hero: 'Lifestealer', role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings, economyByPhase: p?.economyByPhase, deathsByPhase, farmProfile: p?.farmProfile, stratz,
    grades: { lane: { score: laneFinalScore, summary: laneSummary, findings: laneFindings.slice(0, 3) }, items: { score: itemsScore, summary: itemsSummary, findings: itemsFindings.slice(0, 3) }, fights: { score: score(58, heroDamagePerMin >= 700 ? 10 : -5), summary: fightsSummary, findings: fightsFindings.slice(0, 3) }, map: { score: score(60, gpm >= 650 ? 10 : -5), summary: mapSummary, findings: mapFindings.slice(0, 3) } },
    topMistakes: safeTopMistakes,
    nextGameAdjustments: [
      'После 35:00 цель — не умирать перед Roshan/объектами: играй от вижена, buyback и позиции команды.',
      `На линии цель — 0 смертей до 10:00 при сохранении ${Math.max(45, Math.round(p?.laneReview?.lhAt10 ?? 45))}+ LH.`,
      'После Armlet не заходи первым в тёмные зоны: играй вторым номером после раскрытия контроля врага.'
    ].slice(0, 3),
    finalVerdict: { mainReason: result === 'win' ? `Победа за счёт темпа экономики и драк: ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона.` : `Поражение при ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона: не хватило стабильной конвертации темпа.`, biggestRisk: `Главный риск — смерти core-героя: ${deaths} смертей всего, из них ${lateDeathsAfter35} после 35:00. В лейте такие смерти дают сопернику окна на Roshan, buyback pressure и строения.`, nextMatchFocus: 'После 35:00 играй от вижена и позиции команды: не начинай драку первым, сохраняй buyback и заходи в драку после раскрытия ключевых кнопок врага.' },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
