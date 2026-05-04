import { getLifestealerMvpItemName } from '@/lib/dota/constants/items';
import type { AnalysisFinding, NormalizedOpenDotaMatch, PostMatchAnalysis } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number {
  return Math.max(1, Math.min(99, base + delta));
}

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0$/, '');
}

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch): PostMatchAnalysis {
  const p = match.player;
  const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';

  const gpm = p?.gpm ?? 0;
  const xpm = p?.xpm ?? 0;
  const deaths = p?.deaths ?? 0;
  const durationMinutes = p?.durationMinutes ?? 0;
  const heroDamage = p?.heroDamage ?? 0;
  const heroDamagePerMin = p?.heroDamagePerMin ?? 0;
  const lastHits = p?.lastHits ?? 0;
  const lastHitsPerMin = p?.lastHitsPerMin ?? 0;

  const laneFindings: AnalysisFinding[] = [];
  laneFindings.push(
    lastHitsPerMin >= 7
      ? { text: `${lastHits} LH за ${fmt(durationMinutes)} мин — высокий farming output.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: 'good' }
      : { text: `${lastHits} LH за ${fmt(durationMinutes)} мин — ниже желаемого темпа для carry.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: 'warning' }
  );

  const itemsFindings: AnalysisFinding[] = [];
  const timingsUnavailable = !p?.itemTimings?.length || p.itemTimings.some((it) => it.source === 'unavailable');
  if (timingsUnavailable) {
    itemsFindings.push({
      text: 'OpenDota не дал надёжных purchase_log данных, поэтому точные выводы по таймингам предметов отключены.',
      evidence: ['purchase_log unavailable'],
      severity: 'info'
    });
  } else {
    itemsFindings.push({
      text: 'Тайминги предметов показаны только из purchase_log без догадок.',
      evidence: [`${p.itemTimings.length} purchase_log entries`],
      severity: 'good'
    });
  }

  const fightsFindings: AnalysisFinding[] = [];
  fightsFindings.push(
    heroDamagePerMin >= 700
      ? {
          text: `${Math.round(heroDamage)} hero damage за ${fmt(durationMinutes)} мин — высокий вклад в драки, но его нужно сопоставлять со смертями.`,
          evidence: [`${fmt(heroDamagePerMin)} damage/min`],
          severity: 'good'
        }
      : {
          text: `${Math.round(heroDamage)} hero damage за ${fmt(durationMinutes)} мин — вклад в драки можно усилить.`,
          evidence: [`${fmt(heroDamagePerMin)} damage/min`],
          severity: 'warning'
        }
  );
  fightsFindings.push(
    deaths >= 8
      ? { text: `${deaths} смертей — высокий риск для carry и возможная потеря темпа/объектов.`, evidence: [`${deaths} deaths`], severity: 'bad' }
      : { text: `${deaths} смертей — приемлемый уровень риска для carry.`, evidence: [`${deaths} deaths`], severity: 'good' }
  );

  const mapFindings: AnalysisFinding[] = [];
  mapFindings.push(
    gpm >= 650
      ? { text: `${Math.round(gpm)} GPM — сильная экономика для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'good' }
      : { text: `${Math.round(gpm)} GPM — экономика ниже целевого уровня для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'warning' }
  );
  if (typeof p?.killParticipation === 'number') {
    mapFindings.push({
      text: `Участие в убийствах команды: ${fmt(p.killParticipation * 100)}%.`,
      evidence: ['расчёт по team kills из OpenDota'],
      severity: 'info'
    });
  } else {
    mapFindings.push({
      text: 'Участие в убийствах не рассчитано: в матче нет надёжных team kills данных.',
      evidence: ['team kills unavailable'],
      severity: 'info'
    });
  }

  const buildPlayed = [p?.item0, p?.item1, p?.item2, p?.item3, p?.item4, p?.item5]
    .map((id) => getLifestealerMvpItemName(id))
    .filter((name): name is string => Boolean(name));

  return {
    matchId: match.matchId,
    hero: 'Lifestealer',
    role: 'carry',
    result,
    buildPlayed,
    timings: (p?.itemTimings ?? []).reduce<Record<string, string>>((acc, t) => {
      acc[t.item] = t.time;
      return acc;
    }, {}),
    grades: {
      lane: { score: score(62, lastHitsPerMin >= 7 ? 10 : -6), findings: laneFindings },
      items: { score: score(68, timingsUnavailable ? -4 : 6), findings: itemsFindings },
      fights: { score: score(58, heroDamagePerMin >= 700 ? 8 : -4), findings: fightsFindings },
      map: { score: score(60, gpm >= 650 ? 8 : -5), findings: mapFindings }
    },
    topMistakes: [
      deaths >= 8 ? `${deaths} смертей: снизить риск после выхода на линию и перед заходом на хайграунд.` : 'Критичных ошибок по смертям не обнаружено.',
      timingsUnavailable
        ? 'Нет purchase_log: не делаем выводы по темпам слотов, нужна повторная проверка данных OpenDota.'
        : 'Проверь, конвертировались ли ключевые покупки в цели (tower/Roshan) сразу после тайминга.',
      gpm < 650 ? `Экономика ${Math.round(gpm)} GPM: усилить цикл фарма между объектами.` : 'Сохрани текущий темп экономики в следующем матче.'
    ],
    nextGameAdjustments: [
      deaths >= 8 ? 'Цель на следующий матч: удержать смерти в диапазоне 4–6 до ключевого defensive item.' : 'Удерживай текущий контроль смертей и позиционку в драках.',
      gpm < 650 ? 'Добавь 1–2 безопасных фарм-паттерна через стаки и возврат в зону вижена.' : 'После первого сильного слота смещайся к Roshan/tower, когда команда рядом.',
      'Не заходи первым без вижена и контроля ключевых кнопок врага.'
    ],
    finalVerdict: {
      mainReason: `Ты выиграл/держал игру за счёт экономики и урона: ${Math.round(gpm)} GPM, ${Math.round(xpm)} XPM, ${Math.round(heroDamage)} hero damage.`,
      biggestRisk: `${deaths} смертей для carry — главный риск. В следующей игре цель: 4–6 смертей, особенно до defensive тайминга.`,
      nextMatchFocus: 'После первого сильного предмета играй ближе к Roshan, towers и enemy jungle, входи в драку вторым номером при наличии вижена.'
    },
    meta: {
      source: ['opendota', 'rules'],
      confidence: timingsUnavailable ? 0.74 : 0.81
    }
  };
}
