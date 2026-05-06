import { getPhaseLabel, type MatchPhase } from '@/lib/dota/rules/postMatch/phases';
import { getObjectiveLabel } from '@/lib/dota/rules/postMatch/objectives';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number { return Math.max(1, Math.min(99, base + delta)); }
function fmt(value: number, digits = 1): string { return value.toFixed(digits).replace(/\.0$/, ''); }

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch): PostMatchAnalysis {
  const p = match.player; const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const gpm = p?.gpm ?? 0; const xpm = p?.xpm ?? 0; const deaths = p?.deaths ?? 0; const durationMinutes = p?.durationMinutes ?? 0;
  const heroDamage = p?.heroDamage ?? 0; const heroDamagePerMin = p?.heroDamagePerMin ?? 0; const lastHits = p?.lastHits ?? 0; const lastHitsPerMin = p?.lastHitsPerMin ?? 0;
  const trackedTimings = p?.itemTimings ?? []; const getItemTiming = (key: string) => trackedTimings.find((it) => it.key === key);

  const itemsFindings: AnalysisFinding[] = [];
  const phaseBoots = getItemTiming('phase_boots'); const armlet = getItemTiming('armlet');
  if (!trackedTimings.length) itemsFindings.push({ text: 'Тайминги ключевых предметов недоступны для этого матча.', evidence: ['OpenDota не вернул события покупок ключевых предметов'], severity: 'info' });
  else if (phaseBoots || armlet) itemsFindings.push({ text: `Ключевые тайминги найдены: ${phaseBoots ? `Phase Boots ${phaseBoots.time}` : ''}${phaseBoots && armlet ? ', ' : ''}${armlet ? `Armlet ${armlet.time}` : ''}.`, evidence: ['по журналу покупок матча'], severity: 'good' });
  if (armlet) itemsFindings.push({ text: `Armlet на ${armlet.time} — хороший тайминг по MVP-ориентиру для Lifestealer.`, evidence: [`Armlet ${armlet.time}; ориентир <= 15:00`], severity: armlet.timeSeconds <= 900 ? 'good' : 'info' });

  const laneFindings: AnalysisFinding[] = [];
  const lanePct = p?.lane?.laneEfficiencyPct;
  if (lanePct !== undefined) laneFindings.push({ text: `Эффективность линии: ${Math.round(lanePct)}%.`, evidence: ['по данным линии OpenDota'], severity: lanePct >= 70 ? 'good' : 'warning' });
  if (p?.lane?.lhAt10 !== undefined) laneFindings.push({ text: `На 10-й минуте: ${Math.round(p.lane.lhAt10)} LH.`, evidence: ['по минутным срезам матча на 10:00'], severity: 'info' });
  if ((p?.lane?.deathsBefore10 ?? 0) > 0) laneFindings.push({ text: `${p?.lane?.deathsBefore10} смертей до 10:00 могли замедлить первый слот.`, evidence: ['по таймингам смертей до 10:00'], severity: 'warning' });
  if (!laneFindings.length) laneFindings.push({ text: 'Подробная оценка линии недоступна: OpenDota не вернул lane efficiency или минутные срезы для этого матча.', evidence: ['lane data unavailable'], severity: 'info' });

  const fightsFindings: AnalysisFinding[] = [
    heroDamagePerMin >= 700 ? { text: `Урон по героям высокий: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' } : { text: `Урон по героям: ${Math.round(heroDamage).toLocaleString('ru-RU')} за ${fmt(durationMinutes)} мин — можно усилить вклад.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' },
    { text: `${deaths} смертей — главный риск для carry.`, evidence: [`${deaths} смертей`], severity: deaths >= 8 ? 'bad' : 'info' }
  ];
  if (!p || p.deathDataSource === 'unavailable' || !p.deathsByPhase) fightsFindings.push({ text: 'Разбивка смертей по фазам недоступна: OpenDota не вернул таймстемпы смертей.', evidence: ['нет таймингов смертей'], severity: 'info' });

  const mapFindings: AnalysisFinding[] = [
    { text: `${Math.round(gpm)} GPM / ${Math.round(xpm)} XPM.`, evidence: ['общая экономика матча'], severity: gpm >= 650 ? 'good' : 'warning' },
    { text: `${lastHits} LH за ${fmt(durationMinutes)} мин (${fmt(lastHitsPerMin)} LH/мин).`, evidence: ['темп фарма за матч'], severity: lastHitsPerMin >= 7 ? 'good' : 'info' }
  ];
  if (p?.economyByPhaseSource === 'gold_t/lh_t' && p.economyByPhase) {
    const best = (Object.entries(p.economyByPhase) as Array<[MatchPhase, { lhDelta?: number }]>).sort((a, b) => (b[1].lhDelta ?? 0) - (a[1].lhDelta ?? 0))[0];
    mapFindings.push({ text: `Больше всего ластхитов набрано в фазе ${getPhaseLabel(best[0])}: +${best[1].lhDelta ?? 0}.`, evidence: ['по минутным срезам матча'], severity: 'info' });
  } else mapFindings.push({ text: 'Фазовый темп экономики недоступен: OpenDota не вернул минутные срезы фарма для этого матча.', evidence: ['нет минутных срезов фарма'], severity: 'info' });

  const attributedWindow = p?.itemObjectiveWindows?.find((w) => w.itemKey === 'armlet');
  const topPhase = p?.deathsByPhase ? (Object.entries(p.deathsByPhase).sort((a, b) => b[1] - a[1])[0] as [MatchPhase, number]) : null;
  const objectiveHint = attributedWindow
    ? attributedWindow.attributedToPlayerTeam
      ? `После Armlet команда взяла: ${(attributedWindow.objectiveTypes ?? []).map((x) => getObjectiveLabel((x as never))).join(', ') || 'objective-события'}.`
      : 'После Armlet в журнале матча есть objective-события, но их принадлежность к вашей команде пока не подтверждена.'
    : 'По доступным данным OpenDota не найдено подтверждённых objective-событий в течение 10 минут после Armlet.';

  return { matchId: match.matchId, hero: 'Lifestealer', role: 'carry', result, buildPlayed: p?.buildPlayed ?? [], timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}), itemTimings: trackedTimings, economyByPhase: p?.economyByPhase, deathsByPhase: p?.deathsByPhase,
    grades: { lane: { score: score(60, (lanePct ?? 60) >= 70 ? 12 : -4), findings: laneFindings.slice(0, 3) }, items: { score: 64, findings: itemsFindings.slice(0, 2) }, fights: { score: score(58, heroDamagePerMin >= 700 ? 10 : -5), findings: fightsFindings.slice(0, 3) }, map: { score: score(60, gpm >= 650 ? 10 : -5), findings: mapFindings.slice(0, 3) } },
    topMistakes: [
      `${deaths} смертей — главный риск для carry${topPhase ? `. Больше всего в фазе ${getPhaseLabel(topPhase[0])}` : ''}.`,
      objectiveHint,
      lanePct !== undefined && lanePct < 65 ? `Лайнинг был ниже целевого темпа (${Math.round(lanePct)}% эффективности).` : 'На линии важно стабилизировать первые 10 минут без лишних смертей.'
    ].slice(0, 3),
    nextGameAdjustments: [
      'Цель на следующий матч: удержать смерти в диапазоне 4–6.',
      armlet ? 'После Armlet играй вокруг ближайшего безопасного объекта вместе с командой.' : 'Сфокусируйся на раннем тайминге первого ключевого слота.',
      'Если игра уходит в лейт, избегай смерти перед Roshan и окнами байбека.'
    ].slice(0, 3),
    finalVerdict: { mainReason: result === 'win' ? `Победа за счёт темпа экономики и драк: ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона.` : `Поражение при ${Math.round(gpm)} GPM и ${Math.round(heroDamage).toLocaleString('ru-RU')} урона: не хватило стабильной конвертации темпа.`, biggestRisk: `${deaths} смертей для carry — главный риск матча.`, nextMatchFocus: 'Ускоряй ключевые тайминги и снижай риск смертей в критические окна карты.' },
    meta: { source: ['opendota', 'rules'], confidence: trackedTimings.length ? 0.83 : 0.75 }
  };
}
