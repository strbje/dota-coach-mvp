import { getPhaseLabel, type MatchPhase } from '@/lib/dota/rules/postMatch/phases';
import { getObjectiveLabel } from '@/lib/dota/rules/postMatch/objectives';
import { compareItemTiming, getLifestealerCarryItemBenchmark } from '@/lib/dota/rules/postMatch/itemBenchmarks';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis, StratzPostMatchData } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number { return Math.max(1, Math.min(99, base + delta)); }
function fmt(value: number, digits = 1): string { return value.toFixed(digits).replace(/\.0$/, ''); }

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch, stratz?: StratzPostMatchData): PostMatchAnalysis {
  const p = match.player; const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const gpm = p?.gpm ?? 0; const xpm = p?.xpm ?? 0; const deaths = p?.deaths ?? 0; const durationMinutes = p?.durationMinutes ?? 0;
  const heroDamage = p?.heroDamage ?? 0; const heroDamagePerMin = p?.heroDamagePerMin ?? 0; const lastHits = p?.lastHits ?? 0; const lastHitsPerMin = p?.lastHitsPerMin ?? 0;
  const trackedTimings = p?.itemTimings ?? []; const getItemTiming = (key: string) => trackedTimings.find((it) => it.key === key);
  const deathsByPhase = stratz?.deathsByPhase ?? p?.deathsByPhase;
  const deathTimings = stratz?.deathTimings ?? p?.deathTimings;
  const lateDeathsAfter35 = (deathTimings ?? []).filter((d) => d.timeSeconds >= 2100).length;

  const itemsFindings: AnalysisFinding[] = [];
  const phaseBoots = getItemTiming('phase_boots'); const armlet = getItemTiming('armlet');
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

  const laneFindings: AnalysisFinding[] = [];
  const lanePct = p?.laneReview?.laneEfficiencyPct;
  if (lanePct !== undefined) laneFindings.push({ text: `Эффективность линии: ${Math.round(lanePct)}%.`, evidence: ['по данным линии OpenDota'], severity: lanePct >= 70 ? 'good' : 'warning' });
  if (p?.laneReview?.lhAt10 !== undefined) laneFindings.push({ text: `На 10-й минуте: ${Math.round(p.laneReview.lhAt10)} LH.`, evidence: [], severity: 'info' });
  if (deathsByPhase?.laning && deathsByPhase.laning > 0) laneFindings.push({ text: `${Math.round(p?.laneReview?.lhAt10 ?? 0)} LH к 10:00 и ${Math.round(lanePct ?? 0)}% эффективности линии — рабочий старт, но ${deathsByPhase.laning} смерти до 10:00 мешают назвать линию выигранной.`, evidence: [], severity: 'warning' });
  else if ((p?.laneReview?.deathsBefore10 ?? 0) > 0) laneFindings.push({ text: `${p?.laneReview?.deathsBefore10} смертей до 10:00 могли замедлить первый ключевой предмет.`, evidence: [], severity: 'warning' });
  if (!laneFindings.length) laneFindings.push({ text: 'Подробная оценка линии недоступна: OpenDota не вернул lane efficiency или минутные срезы для этого матча.', evidence: ['lane data unavailable'], severity: 'info' });

  const fightsFindings: AnalysisFinding[] = [
    heroDamagePerMin >= 700 ? { text: `Урон по героям высокий: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' } : { text: `Урон по героям: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин — можно усилить вклад.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' },
    { text: `${deaths} смертей — главный риск для carry.`, evidence: [`${deaths} смертей`], severity: deaths >= 8 ? 'bad' : 'info' }
  ];
  if (deathsByPhase) {
    fightsFindings.push({ text: `Смерти по фазам: линия — ${deathsByPhase.laning}, ранняя середина — ${deathsByPhase.earlyMid}, мидгейм — ${deathsByPhase.midGame}, лейт — ${deathsByPhase.lateGame}.`, evidence: [], severity: 'info' });
    if (deathsByPhase.lateGame >= 3) fightsFindings.push({ text: `Главный риск: ${deathsByPhase.lateGame} из ${deaths} смертей пришлись на позднюю игру, где смерть core-героя особенно дорого стоит.`, evidence: [], severity: 'bad' });
    if (deathsByPhase.laning >= 2) fightsFindings.push({ text: `На линии было ${deathsByPhase.laning} смерти до 10:00 — это замедляет первый ключевой предмет и снижает контроль темпа.`, evidence: [], severity: 'warning' });
  } else {
    fightsFindings.push({ text: `В этом матче доступно только общее число смертей: ${deaths}. Разложить их по фазам пока нельзя.`, evidence: [], severity: 'info' });
  }

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

  const attributedWindow = p?.itemObjectiveWindows?.find((w) => w.itemKey === 'armlet');
  const topPhase = deathsByPhase ? (Object.entries(deathsByPhase).sort((a, b) => b[1] - a[1])[0] as [MatchPhase, number]) : null;
  const objectiveHint = attributedWindow
    ? attributedWindow.attributedToPlayerTeam
      ? `После Armlet команда взяла: ${(attributedWindow.objectiveTypes ?? []).map((x) => getObjectiveLabel((x as never))).join(', ') || 'objective-события'}.`
      : 'После Armlet в журнале матча есть objective-события, но их принадлежность к вашей команде пока не подтверждена.'
    : 'По доступным данным OpenDota не найдено подтверждённых objective-событий в течение 10 минут после Armlet.';

  return { matchId: match.matchId, hero: 'Lifestealer', role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings, economyByPhase: p?.economyByPhase, deathsByPhase, farmProfile: p?.farmProfile, stratz,
    grades: { lane: { score: score(60, (lanePct ?? 60) >= 70 ? 12 : -4), findings: laneFindings.slice(0, 3) }, items: { score: 64, findings: itemsFindings.slice(0, 2) }, fights: { score: score(58, heroDamagePerMin >= 700 ? 10 : -5), findings: fightsFindings.slice(0, 3) }, map: { score: score(60, gpm >= 650 ? 10 : -5), findings: mapFindings.slice(0, 3) } },
    topMistakes: [
      `${deaths} смертей — главный риск для carry${topPhase ? `. Больше всего в фазе ${getPhaseLabel(topPhase[0])}` : ''}.`,
      objectiveHint,
      lanePct !== undefined && lanePct < 60 ? `Линия просела по эффективности (${Math.round(lanePct)}%).` : lanePct !== undefined ? `Линия была рабочей: ${Math.round(lanePct)}% эффективности и ${Math.round(p?.laneReview?.lhAt10 ?? 0)} LH к 10:00.` : 'На линии важно стабилизировать первые 10 минут без лишних смертей.'
    ].slice(0, 3),
    nextGameAdjustments: [
      'Цель на следующий матч: удержать смерти в диапазоне 4–6.',
      armlet ? 'После Armlet играй вокруг ближайшего безопасного объекта вместе с командой.' : 'Сфокусируйся на раннем тайминге первого ключевого слота.',
      'Если игра уходит в лейт, избегай смерти перед Roshan и окнами байбека.'
    ].slice(0, 3),
    finalVerdict: { mainReason: result === 'win' ? `Победа за счёт темпа экономики и драк: ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона.` : `Поражение при ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона: не хватило стабильной конвертации темпа.`, biggestRisk: `Главный риск — смерти core-героя: ${deaths} смертей всего, из них ${lateDeathsAfter35} после 35:00. В лейте такие смерти дают сопернику окна на Roshan, buyback pressure и строения.`, nextMatchFocus: 'После 35:00 играй от вижена и позиции команды: не начинай драку первым, сохраняй buyback и заходи в драку после раскрытия ключевых кнопок врага.' },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
