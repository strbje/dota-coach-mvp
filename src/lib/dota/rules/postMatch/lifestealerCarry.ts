import { getPhaseLabel, type MatchPhase } from '@/lib/dota/rules/postMatch/phases';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number { return Math.max(1, Math.min(99, base + delta)); }
function fmt(value: number, digits = 1): string { return value.toFixed(digits).replace(/\.0$/, ''); }

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch): PostMatchAnalysis {
  const p = match.player; const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const gpm = p?.gpm ?? 0; const xpm = p?.xpm ?? 0; const deaths = p?.deaths ?? 0; const durationMinutes = p?.durationMinutes ?? 0;
  const heroDamage = p?.heroDamage ?? 0; const heroDamagePerMin = p?.heroDamagePerMin ?? 0; const lastHits = p?.lastHits ?? 0; const lastHitsPerMin = p?.lastHitsPerMin ?? 0;

  const trackedTimings = p?.itemTimings ?? []; const itemsFindings: AnalysisFinding[] = [];
  const getItemTiming = (key: string) => trackedTimings.find((it) => it.key === key);

  const timingChecks: Array<[string, string, number]> = [
    ['phase_boots', 'Phase Boots', 480], ['armlet', 'Armlet', 900], ['desolator', 'Desolator', 1320], ['black_king_bar', 'Black King Bar', 1500], ['sange_and_yasha', 'Sange and Yasha', 1500]
  ];
  for (const [key, label, threshold] of timingChecks) {
    const it = getItemTiming(key);
    if (!it) itemsFindings.push({ text: `Тайминг ${label} не найден в purchase_log, вывод по этому предмету отключён.`, evidence: [`${label}: missing in purchase_log`], severity: 'info' });
    else itemsFindings.push({ text: `${label} на ${it.time} — ${it.timeSeconds <= threshold ? 'хороший' : 'более поздний'} timing для MVP-оценки Lifestealer.`, evidence: [`${label} — ${it.time}`], severity: it.timeSeconds <= threshold ? 'good' : 'warning' });
  }

  if (p?.deathDataSource === 'unavailable') itemsFindings.push({ text: 'Конвертация предметов через deaths window не рассчитана: нет death_log.', evidence: ['death_log unavailable'], severity: 'info' });
  else (p?.deathsAfterItemTimings ?? []).forEach((w) => {
    if (w.itemKey === 'armlet' && w.deathsWithin10Min >= 2) itemsFindings.push({ text: `После Armlet было ${w.deathsWithin10Min} смертей за 10 минут — тайминг мог не конвертироваться в давление.`, evidence: [`Armlet: ${w.deathsWithin10Min} смертей за 10 мин`], severity: 'warning' });
    if (w.itemKey === 'desolator' && w.deathsWithin10Min === 0 && heroDamagePerMin >= 700) itemsFindings.push({ text: 'После Desolator ты сохранил темп и мог давить карту.', evidence: ['Desolator: 0 смертей за 10 мин', `${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' });
  });

  if (!(p?.objectiveEvents?.length)) itemsFindings.push({ text: 'Конвертация в объекты не рассчитана: в текущем payload нет надёжных objective events.', evidence: ['objectives unavailable or empty'], severity: 'info' });
  else (p?.itemObjectiveWindows ?? []).forEach((w) => itemsFindings.push({ text: w.objectivesWithin10Min > 0 ? `Тайминг ${w.item} был конвертирован в объект в течение 10 минут.` : `По доступным данным после ${w.item} объекты в течение 10 минут не найдены.`, evidence: [`${w.item}: ${w.objectivesWithin10Min}`, w.objectiveTypes.join(', ') || 'types: none'], severity: w.objectivesWithin10Min > 0 ? 'good' : 'info' }));

  const fightsFindings: AnalysisFinding[] = [
    heroDamagePerMin >= 700 ? { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — высокий вклад в драки.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' } : { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — вклад в драки можно усилить.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' },
    { text: `Общее число смертей: ${deaths}.`, evidence: [`${deaths} deaths`], severity: deaths >= 8 ? 'bad' : 'info' }
  ];

  if (!p || p.deathDataSource === 'unavailable' || !p.deathsByPhase) fightsFindings.push({ text: 'OpenDota не дал надёжный death_log, поэтому нельзя разложить смерти по фазам.', evidence: ['death_log unavailable'], severity: 'info' });
  else {
    const d = p.deathsByPhase;
    fightsFindings.push({ text: `Смерти по фазам: Лайнинг — ${d.laning}, Ранняя середина — ${d.earlyMid}, Мидгейм — ${d.midGame}, Лейт — ${d.lateGame}.`, evidence: [`Лайнинг: ${d.laning}`, `10–20: ${d.earlyMid}`, `20–35: ${d.midGame}`, `35+: ${d.lateGame}`], severity: 'info' });
    if (d.laning >= 2) fightsFindings.push({ text: '2+ смерти на линии могли замедлить первый ключевой предмет.', evidence: [`Лайнинг: ${d.laning}`], severity: 'warning' });
    if (d.earlyMid >= 2) fightsFindings.push({ text: '2+ смерти в 10–20 минут могли сбить темп Armlet/Desolator/BKB.', evidence: [`10–20: ${d.earlyMid}`], severity: 'warning' });
    if (d.midGame >= 3) fightsFindings.push({ text: '3+ смерти в мидгейме — риск потери карты и Roshan.', evidence: [`20–35: ${d.midGame}`], severity: 'bad' });
    if (d.lateGame >= 2) fightsFindings.push({ text: '2+ смерти после 35-й минуты — высокий риск потери Roshan, buyback или стороны карты.', evidence: [`35+: ${d.lateGame}`], severity: 'bad' });
  }

  fightsFindings.push({ text: 'Участие в убийствах по фазам не рассчитано: в OpenDota payload нет достаточной структуры событий по ассистам/убийствам.', evidence: ['phase kill participation unavailable'], severity: 'info' });

  const mapFindings: AnalysisFinding[] = [
    { text: `${Math.round(gpm)} GPM / ${Math.round(xpm)} XPM.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: gpm >= 650 ? 'good' : 'warning' },
    { text: `${lastHits} LH за ${fmt(durationMinutes)} мин.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: lastHitsPerMin >= 7 ? 'good' : 'info' }
  ];
  if (p?.economyByPhaseSource === 'gold_t/lh_t' && p.economyByPhase) {
    const best = (Object.entries(p.economyByPhase) as Array<[MatchPhase, { lhDelta?: number }]>).sort((a, b) => (b[1].lhDelta ?? 0) - (a[1].lhDelta ?? 0))[0];
    mapFindings.push({ text: `Основной прирост LH пришёлся на фазу: ${getPhaseLabel(best[0])}.`, evidence: [`+${best[1].lhDelta ?? 0} LH`, 'lh_t from OpenDota'], severity: 'info' });
  } else mapFindings.push({ text: 'Фазовый темп экономики не рассчитан: OpenDota не дал gold_t/lh_t.', evidence: ['economy time-series unavailable'], severity: 'info' });

  const topPhase = p?.deathsByPhase ? (Object.entries(p.deathsByPhase).sort((a,b)=>b[1]-a[1])[0] as [MatchPhase,number]) : null;
  return { matchId: match.matchId, hero: 'Lifestealer', role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings,
    grades: { lane: { score: score(62, lastHitsPerMin >= 7 ? 10 : -6), findings: [] }, items: { score: 64, findings: itemsFindings }, fights: { score: score(58, heroDamagePerMin >= 700 ? 8 : -4), findings: fightsFindings }, map: { score: score(60, gpm >= 650 ? 8 : -5), findings: mapFindings } },
    topMistakes: [ deaths >= 8 ? `${deaths} смертей — главный риск. Проверь смерти в фазе, где их было больше всего.` : 'Критичных ошибок по смертям не обнаружено.', topPhase ? `Больше всего смертей в фазе: ${getPhaseLabel(topPhase[0])} — ${topPhase[1]}. После 35-й минуты каждая смерть может стоить Roshan/стороны карты.` : 'OpenDota не дал death_log, поэтому причины смертей ограничены общим числом смертей.', p?.deathsAfterItemTimings?.find((x)=>x.itemKey==='armlet') ? `После Armlet было ${p.deathsAfterItemTimings.find((x)=>x.itemKey==='armlet')?.deathsWithin10Min} смертей за 10 минут — тайминг мог не дать давления.` : 'Окно после Armlet не рассчитано из-за нехватки данных.' ],
    nextGameAdjustments: [ 'Цель на следующий матч: удержать смерти в диапазоне 4–6.', getItemTiming('armlet') ? 'Если Armlet выходит до 15 минуты, следующие 5–10 минут играй вокруг safe objectives вместе с командой.' : 'Без подтверждённого Armlet-тайминга не даём совет по этому окну.', (p?.deathsByPhase?.lateGame ?? 0) > 0 ? 'Если смертей больше всего после 35 минуты, не заходи первым в тёмные зоны без вижена и байбека.' : 'Фокус: стабильный темп фарма и безопасные подключения к дракам в mid game.' ],
    finalVerdict: { mainReason: result === 'win' ? `Победа на базе экономики и драк: ${Math.round(gpm)} GPM, ${Math.round(heroDamage).toLocaleString('ru-RU')} hero damage.` : `Поражение при ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} hero damage: не хватило конвертации темпа.`, biggestRisk: `${deaths} смертей для carry — главный риск матча.`, nextMatchFocus: 'Держи темп ключевых предметов и контролируй deaths-окна 5–10 минут после них.' },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
