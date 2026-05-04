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

  const laneFindings: AnalysisFinding[] = [
    lastHitsPerMin >= 7
      ? { text: `${lastHits} LH за ${fmt(durationMinutes)} мин — высокий farming output.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: 'good' }
      : { text: `${lastHits} LH за ${fmt(durationMinutes)} мин — ниже желаемого темпа для carry.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: 'warning' }
  ];

  const trackedTimings = p?.itemTimings ?? [];
  const purchaseLogUnavailable = p?.itemTimingSource === 'unavailable';
  const hasTracked = trackedTimings.length > 0;
  const itemsFindings: AnalysisFinding[] = [];

  if (purchaseLogUnavailable) {
    itemsFindings.push({ text: 'OpenDota не дал purchase_log, поэтому выводы по таймингам отключены.', evidence: ['purchase_log unavailable'], severity: 'info' });
  } else if (!hasTracked) {
    itemsFindings.push({ text: 'purchase_log есть, но ключевые предметы Lifestealer не найдены.', evidence: [`purchase_log entries: ${p?.rawPurchaseLogPreview?.length ?? 0}`], severity: 'info' });
  } else {
    const topEvidences = trackedTimings.slice(0, 3).map((it) => `${it.item} — ${it.time}`);
    itemsFindings.push({ text: 'Ключевые покупки найдены в purchase_log.', evidence: topEvidences, severity: 'good' });

    const phaseBoots = trackedTimings.find((it) => it.key === 'phase_boots');
    if (phaseBoots) {
      itemsFindings.push({
        text: phaseBoots.timeSeconds <= 480 ? 'Phase Boots вышли в хорошем темпе для линии.' : 'Phase Boots вышли поздно — проверь темп фарма и смерти до покупки.',
        evidence: [`Phase Boots — ${phaseBoots.time}`],
        severity: phaseBoots.timeSeconds <= 480 ? 'good' : 'warning'
      });
    }

    const armlet = trackedTimings.find((it) => it.key === 'armlet');
    if (armlet) {
      itemsFindings.push({
        text: armlet.timeSeconds <= 900 ? 'Armlet вышел в нормальный core timing.' : 'Armlet вышел поздно — проверь темп фарма и смерти до покупки.',
        evidence: [`Armlet — ${armlet.time}`],
        severity: armlet.timeSeconds <= 900 ? 'good' : 'warning'
      });
    }
  }

  const fightsFindings: AnalysisFinding[] = [
    heroDamagePerMin >= 700
      ? { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — высокий вклад в драки.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' }
      : { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — вклад в драки можно усилить.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' },
    { text: `Общее число смертей: ${deaths}.`, evidence: [`${deaths} deaths`], severity: deaths >= 8 ? 'bad' : 'info' }
  ];

  if (p?.deathDataSource === 'death_log' && p.deathsByPhase) {
    const byPhase = p.deathsByPhase;
    fightsFindings.push({
      text: `Смерти по фазам: линия ${byPhase.laning}, 10–20 ${byPhase.earlyMid}, 20–35 ${byPhase.midGame}, 35+ ${byPhase.lateGame}.`,
      evidence: ['источник: death_log OpenDota'],
      severity: 'info'
    });

    if (byPhase.laning > 1) fightsFindings.push({ text: `${byPhase.laning} смертей на линии — это могло замедлить первый слот.`, evidence: ['фаза: 0–10'], severity: 'warning' });
    if (byPhase.midGame >= 3) fightsFindings.push({ text: `${byPhase.midGame} смертей в мидгейме — проверь входы в драки до/после ключевого предмета.`, evidence: ['фаза: 20–35'], severity: 'warning' });
    if (byPhase.lateGame >= 2) fightsFindings.push({ text: `${byPhase.lateGame} смертей после 35-й минуты — высокий риск потери Roshan/стороны карты.`, evidence: ['фаза: 35+'], severity: 'bad' });
  } else {
    fightsFindings.push({ text: 'OpenDota не дал death_log, поэтому нельзя разложить смерти по фазам.', evidence: ['death_log unavailable'], severity: 'info' });
  }

  fightsFindings.push({ text: 'Участие в убийствах по фазам не рассчитано: в текущем OpenDota payload нет достаточной структуры событий.', evidence: ['phase KP unavailable'], severity: 'info' });

  const mapFindings: AnalysisFinding[] = [
    gpm >= 650
      ? { text: `${Math.round(gpm)} GPM — сильная экономика для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'good' }
      : { text: `${Math.round(gpm)} GPM — экономика ниже целевого уровня для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'warning' },
    { text: `${lastHits} LH за ${fmt(durationMinutes)} мин.`, evidence: [`${fmt(lastHitsPerMin)} LH/min`], severity: lastHitsPerMin >= 7 ? 'good' : 'info' }
  ];

  if (typeof p?.killParticipation === 'number') {
    mapFindings.push({ text: `Участие в убийствах команды: ${fmt(p.killParticipation * 100)}%.`, evidence: ['расчёт по team kills из OpenDota'], severity: 'info' });
  } else {
    mapFindings.push({ text: 'Участие в убийствах не рассчитано: нет надёжных team kills данных.', evidence: ['team kills unavailable'], severity: 'info' });
  }

  // TODO: Gold source breakdown requires reliable source fields; not implemented in MVP.
  return {
    matchId: match.matchId,
    hero: 'Lifestealer',
    role: 'carry',
    result,
    buildPlayed: p?.buildPlayed ?? [],
    timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}),
    itemTimings: trackedTimings,
    grades: {
      lane: { score: score(62, lastHitsPerMin >= 7 ? 10 : -6), findings: laneFindings },
      items: { score: purchaseLogUnavailable ? 60 : hasTracked ? score(63, 6) : 62, findings: itemsFindings },
      fights: { score: score(58, heroDamagePerMin >= 700 ? 8 : -4), findings: fightsFindings },
      map: { score: score(60, gpm >= 650 ? 8 : -5), findings: mapFindings }
    },
    topMistakes: [
      deaths >= 8 ? `${deaths} смертей: снизить риск до ключевого defensive timing.` : 'Критичных ошибок по смертям не обнаружено.',
      hasTracked ? 'После core-тайминга чаще конвертируй силу в objectives: tower/Roshan.' : 'Без подтверждённых таймингов предметов не делаем выводы о темпе сборки.',
      gpm < 650 ? `Экономика ${Math.round(gpm)} GPM: усили цикл фарма между объектами.` : 'Сохрани текущий темп экономики в следующем матче.'
    ],
    nextGameAdjustments: [
      'Цель: 4–6 смертей, особенно до defensive timing.',
      'После первого сильного предмета играй ближе к Roshan, towers и enemy jungle, но входи в драку вторым номером при наличии вижена.',
      'Если death_log доступен, после матча отдельно разбирай фазы с пиками смертей.'
    ],
    finalVerdict: {
      mainReason:
        result === 'win'
          ? `Ты выиграл за счёт сильной экономики и высокого урона: ${Math.round(gpm)} GPM, ${Math.round(xpm)} XPM, ${Math.round(heroDamage).toLocaleString('ru-RU')} урона по героям.`
          : `Ты удерживал игру за счёт экономики и урона: ${Math.round(gpm)} GPM, ${Math.round(xpm)} XPM, ${Math.round(heroDamage).toLocaleString('ru-RU')} урона по героям, но этого не хватило для победы.`,
      biggestRisk: `${deaths} смертей для carry — главный риск. В следующей игре цель: 4–6 смертей, особенно до defensive timing.`,
      nextMatchFocus: 'После первого сильного предмета играй ближе к Roshan, towers и enemy jungle, но входи в драку вторым номером при наличии вижена.'
    },
    meta: { source: ['opendota', 'rules'], confidence: hasTracked ? 0.82 : 0.74 }
  };
}
