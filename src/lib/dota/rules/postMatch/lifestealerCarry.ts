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
    itemsFindings.push({ text: 'OpenDota не дал purchase_log, поэтому выводы по таймингам предметов отключены.', evidence: ['purchase_log unavailable'], severity: 'info' });
  } else if (!hasTracked) {
    itemsFindings.push({ text: 'purchase_log есть, но ключевые предметы Lifestealer не найдены.', evidence: [`purchase_log entries: ${p?.rawPurchaseLogPreview?.length ?? 0}`], severity: 'info' });
  } else {
    const evidence = trackedTimings.map((it) => `${it.item} — ${it.time}`);
    itemsFindings.push({ text: `Тайминги ключевых предметов взяты из purchase_log: ${evidence.join(', ')}.`, evidence, severity: 'good' });
  }

  const fightsFindings: AnalysisFinding[] = [
    heroDamagePerMin >= 700
      ? { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — высокий вклад в драки, но его нужно сопоставлять со смертями.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'good' }
      : { text: `${Math.round(heroDamage)} урона по героям за ${fmt(durationMinutes)} мин — вклад в драки можно усилить.`, evidence: [`${fmt(heroDamagePerMin)} урон/мин`], severity: 'warning' },
    deaths >= 8
      ? { text: `${deaths} смертей — высокий риск для carry и возможная потеря темпа/объектов.`, evidence: [`${deaths} deaths`], severity: 'bad' }
      : { text: `${deaths} смертей — приемлемый уровень риска для carry.`, evidence: [`${deaths} deaths`], severity: 'good' }
  ];

  const mapFindings: AnalysisFinding[] = [
    gpm >= 650
      ? { text: `${Math.round(gpm)} GPM — сильная экономика для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'good' }
      : { text: `${Math.round(gpm)} GPM — экономика ниже целевого уровня для carry.`, evidence: [`${Math.round(gpm)} GPM`, `${Math.round(xpm)} XPM`], severity: 'warning' }
  ];

  if (typeof p?.killParticipation === 'number') mapFindings.push({ text: `Участие в убийствах команды: ${fmt(p.killParticipation * 100)}%.`, evidence: ['расчёт по team kills из OpenDota'], severity: 'info' });

  return {
    matchId: match.matchId,
    hero: 'Lifestealer',
    role: 'carry',
    result,
    buildPlayed: p?.buildPlayed ?? [],
    timings: trackedTimings.reduce<Record<string, string>>((acc, t) => ((acc[t.item] = t.time), acc), {}),
    grades: {
      lane: { score: score(62, lastHitsPerMin >= 7 ? 10 : -6), findings: laneFindings },
      items: { score: hasTracked ? score(63, 8) : 62, findings: itemsFindings },
      fights: { score: score(58, heroDamagePerMin >= 700 ? 8 : -4), findings: fightsFindings },
      map: { score: score(60, gpm >= 650 ? 8 : -5), findings: mapFindings }
    },
    topMistakes: [
      deaths >= 8 ? `${deaths} смертей: снизить риск после выхода на линию и перед заходом на хайграунд.` : 'Критичных ошибок по смертям не обнаружено.',
      hasTracked ? 'Конвертируй ключевые предметные тайминги в objectives: tower/Roshan.' : 'Без подтверждённых таймингов предметов не делаем выводы о темпе сборки.',
      gpm < 650 ? `Экономика ${Math.round(gpm)} GPM: усилить цикл фарма между объектами.` : 'Сохрани текущий темп экономики в следующем матче.'
    ],
    nextGameAdjustments: [
      'Цель: 4–6 смертей, особенно до defensive timing.',
      'После первого сильного предмета играй ближе к Roshan, towers и enemy jungle, но входи в драку вторым номером при наличии вижена.',
      'Не заходи первым без вижена и контроля ключевых кнопок врага.'
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
