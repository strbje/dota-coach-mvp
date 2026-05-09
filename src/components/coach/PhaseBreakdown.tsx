import type { MatchPhase, NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';

const PHASES: Array<{ key: MatchPhase; label: string }> = [
  { key: 'laning', label: '0–10 Лайнинг' },
  { key: 'earlyMid', label: '10–20 Ранняя середина' },
  { key: 'midGame', label: '20–35 Мидгейм' },
  { key: 'lateGame', label: '35+ Лейт' }
];

export function PhaseBreakdown({ economyByPhase, deathsByPhase, itemTimings }: { economyByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['economyByPhase']; deathsByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['deathsByPhase']; itemTimings?: Array<{ item: string; phase?: MatchPhase; timeSeconds: number }> }) {
  if (!economyByPhase && !deathsByPhase) return null;
  return <section className="card"><h3>Фазы матча / Фарм по фазам</h3><div className="grid grid-2">{PHASES.map((p) => {
    const e = economyByPhase?.[p.key];
    const phaseItem = itemTimings?.find((it) => (p.key === 'laning' && it.timeSeconds <= 600) || (p.key === 'earlyMid' && it.timeSeconds > 600 && it.timeSeconds <= 1200) || (p.key === 'midGame' && it.timeSeconds > 1200 && it.timeSeconds <= 2100) || (p.key === 'lateGame' && it.timeSeconds > 2100));
    return <article key={p.key} className="item-timeline-card"><div><strong>{p.label}</strong><div className="muted">{e?.lhPerMinuteInPhase !== undefined ? `LH/мин ${e.lhPerMinuteInPhase.toFixed(1)}` : 'LH/мин: нет данных'}</div><div className="muted">{e?.goldPerMinuteInPhase !== undefined ? `Gold/мин ${Math.round(e.goldPerMinuteInPhase)}` : 'Gold/мин: нет данных'}</div><div className="muted">{e?.xpPerMinuteInPhase !== undefined ? `XP/мин ${Math.round(e.xpPerMinuteInPhase)}` : 'XP/мин: нет данных'}</div><div className="muted">{deathsByPhase ? `Смерти ${deathsByPhase[p.key]}` : 'Смерти: нет данных'}</div>{phaseItem ? <div className="muted">Ключевой предмет: {phaseItem.item}</div> : null}</div></article>;
  })}</div></section>;
}
