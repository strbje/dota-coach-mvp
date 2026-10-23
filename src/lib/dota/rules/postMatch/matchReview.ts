import type { AnalysisFinding, MatchReview, NormalizedOpenDotaMatch, TeamAdvantagePoint } from '../../types/domain';
import { formatGameTime } from '../../constants/items';

const number = (value: number) => Math.round(value).toLocaleString('ru-RU');
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;

/** Presentation facts within carryRules; never a second scoring/causality engine. */
export function buildMatchReview(
  match: NormalizedOpenDotaMatch,
  deathTimings: Array<{ timeSeconds: number }> | undefined,
  positiveFindings: AnalysisFinding[]
): MatchReview {
  const player = match.player;
  const won = player?.isRadiant === match.didRadiantWin;
  const advantage = match.teamAdvantage ?? [];
  const gold = advantage.filter((p): p is TeamAdvantagePoint & { gold: number } => p.gold !== undefined);
  const lastGold = gold.at(-1);
  const lastXp = advantage.filter((p): p is TeamAdvantagePoint & { xp: number } => p.xp !== undefined).at(-1);
  const goldNearEnd = lastGold !== undefined && match.durationSeconds - lastGold.timeSeconds <= 120;
  const xpNearEnd = lastXp !== undefined && match.durationSeconds - lastXp.timeSeconds <= 120;
  const factors: MatchReview['factors'] = [];
  const timeline: MatchReview['timeline'] = [
    ...(match.objectiveTimeline ?? []),
    ...(player?.itemTimings ?? []).map((item) => ({ id: `item-${item.key}`, timeSeconds: item.timeSeconds, kind: 'item' as const, label: item.item, detail: 'Твоя покупка' })),
    ...(deathTimings ?? []).filter((death) => death.timeSeconds >= 0 && death.timeSeconds <= match.durationSeconds)
      .map((death, index) => ({ id: `death-${index}`, timeSeconds: death.timeSeconds, kind: 'death' as const, label: 'Твоя смерть', detail: 'Эпизод для просмотра в записи' }))
  ];
  // Fixed five-minute windows with all six minute samples. Never bridge missing telemetry.
  const windows = gold.flatMap((end, index) => {
    const samples = gold.slice(index - 5, index + 1);
    if (samples.length !== 6 || samples.some((p, i) => i > 0 && p.timeSeconds - samples[i - 1].timeSeconds !== 60)) return [];
    const start = samples[0];
    return [{ start, end, delta: end.gold - start.gold }];
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const swing = windows[0];
  if (swing && swing.delta !== 0) {
    const ownPurchases = (player?.itemTimings ?? []).filter((item) => item.timeSeconds >= swing.start.timeSeconds && item.timeSeconds <= swing.end.timeSeconds);
    factors.push({
      id: 'team-swing', title: swing.delta < 0 ? 'Соперник нарастил ресурсы' : 'Команда нарастила ресурсы',
      fact: `${formatGameTime(swing.start.timeSeconds)}–${formatGameTime(swing.end.timeSeconds)}: разница золота твоей команды изменилась с ${signed(swing.start.gold)} до ${signed(swing.end.gold)}.${ownPurchases.length ? ` Твоя покупка на этом отрезке: ${ownPurchases.map((i) => `${i.item} в ${i.time}`).join(', ')}.` : ''}`,
      meaning: swing.delta < 0
        ? 'Соперник улучшил соотношение ресурсов. Проверь фарм и объекты на этом отрезке в записи.'
        : 'Команда улучшила соотношение ресурсов. Проверь этот отрезок вместе с покупками и событиями ниже.',
      stat: { value: signed(swing.delta), label: 'изменение разницы золота за 5 минут' },
      confidence: 'possible-factor', timeSeconds: swing.start.timeSeconds, endSeconds: swing.end.timeSeconds, evidenceId: 'team-advantage'
    });
  } else if (lastGold) {
    factors.push({ id: 'team-snapshot', title: 'Ресурсы команды', fact: `В ${formatGameTime(lastGold.timeSeconds)} разница золота: ${signed(lastGold.gold)}.`,
      meaning: 'Это состояние экономики всей команды в указанный момент.', confidence: 'observation', timeSeconds: lastGold.timeSeconds, evidenceId: 'team-advantage' });
  } else if (lastXp) {
    factors.push({ id: 'team-xp', title: 'Опыт команды', fact: `В ${formatGameTime(lastXp.timeSeconds)} разница опыта: ${signed(lastXp.xp)}.`,
      meaning: 'Это общий опыт команды; распределение уровней между героями здесь не оценено.', confidence: 'observation', timeSeconds: lastXp.timeSeconds, evidenceId: 'team-advantage' });
  }
  const lh = player?.laneReview?.lhAt10;
  if (lh !== undefined && match.durationSeconds >= 600) {
    timeline.push({ id: 'lane-at-ten', timeSeconds: 600, kind: 'lane', label: `${number(lh)} добитых крипов`, detail: 'Твой результат к 10:00, включая нейтралов' });
    factors.push({ id: 'personal-start', title: 'Твой старт', fact: `К 10:00 ты добил ${number(lh)} крипов${player?.laneReview?.deathsBefore10 !== undefined ? `; смертей за этот отрезок — ${player.laneReview.deathsBefore10}` : ''}.`,
      meaning: 'Возьми этот результат за основу тренировки добивания и сравни его с целью в следующей игре.', confidence: 'observation', timeSeconds: 0, endSeconds: 600, evidenceId: 'lane-at-ten', stat: { value: number(lh), label: 'твоих добиваний к 10:00' } });
  }
  const lastItem = player?.itemTimings?.at(-1);
  if (factors.length < 2 && lastItem) factors.push({
    id: 'purchase', title: 'Покупка и следующий отрезок', fact: `${lastItem.item} появился у тебя в ${lastItem.time}.`,
    meaning: 'Сопоставь следующие события с этой покупкой: удалось ли использовать новый предмет в действиях команды?',
    confidence: 'observation', timeSeconds: lastItem.timeSeconds, evidenceId: `item-${lastItem.key}`
  });

  const headline = goldNearEnd && lastGold.gold !== 0
    ? won ? lastGold.gold > 0 ? 'Победа с преимуществом по золоту' : 'Победа вопреки отставанию по золоту'
      : lastGold.gold < 0 ? 'Поражение на фоне отставания по золоту' : 'Преимущество по золоту не принесло победу'
    : won ? 'Победа. Разберём твою игру' : 'Поражение. Разберём твою игру';
  const available = [lh !== undefined ? 'стартовый фарм' : null, player?.itemTimings?.length ? 'покупки' : null, deathTimings?.length ? 'смерти по времени' : null].filter(Boolean);
  const summary = lastGold
    ? `В ${formatGameTime(lastGold.timeSeconds)} ${lastGold.gold === 0 ? 'золото команд было равным' : `${lastGold.gold > 0 ? 'ваша команда имела' : 'соперник имел'} преимущество в ${number(Math.abs(lastGold.gold))} золота`}. Ниже — важный отрезок команды и твой личный результат.`
    : lastXp ? `Для разбора доступна динамика опыта команд до ${formatGameTime(lastXp.timeSeconds)}. Разница опыта твоей команды в этот момент: ${signed(lastXp.xp)}.`
    : available.length ? `Для разбора доступны ${available.join(', ')}. Начнём с этих отрезков твоей игры.` : 'Есть итог матча. Для подробного разбора пока не хватает событий и минутных показателей.';
  return {
    headline, summary,
    coverageNote: !lastGold && !lastXp ? 'Нет динамики ресурсов команд — причину результата пока определить нельзя.'
      : [
        !lastGold ? 'Нет динамики золота.' : !goldNearEnd ? 'Динамика золота неполная: конец матча не покрыт.' : null,
        !lastXp ? 'Нет динамики опыта.' : !xpNearEnd ? 'Динамика опыта неполная: конец матча не покрыт.' : null,
        'Деталей командных драк нет: влияние решений на результат проверь в записи.'
      ].filter(Boolean).join(' '),
    factors: factors.slice(0, 3),
    strengths: [...new Set(positiveFindings.filter((f) => f.severity === 'good').map((f) => f.text))].slice(0, 2),
    advantage, timeline: timeline.sort((a, b) => a.timeSeconds - b.timeSeconds)
  };
}
