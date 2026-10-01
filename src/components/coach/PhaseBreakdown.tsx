import { Panel } from '@/components/ui';
import type { MatchPhase, NormalizedOpenDotaMatch } from '@/lib/dota/types/domain';

const PHASES: Array<{ key: MatchPhase; label: string }> = [
  { key: 'laning', label: '0–10 Лайнинг' },
  { key: 'earlyMid', label: '10–20 Ранняя середина' },
  { key: 'midGame', label: '20–35 Мидгейм' },
  { key: 'lateGame', label: '35+ Лейт' }
];

export function PhaseBreakdown({ economyByPhase, deathsByPhase, itemTimings }: { economyByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['economyByPhase']; deathsByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['deathsByPhase']; itemTimings?: Array<{ item: string; phase?: MatchPhase; timeSeconds: number }> }) {
  if (!economyByPhase && !deathsByPhase) return null;
  const playedPhases = economyByPhase ? PHASES.filter((phase) => economyByPhase[phase.key] !== undefined || (deathsByPhase?.[phase.key] ?? 0) > 0) : PHASES;
  return <Panel><h3>Фарм и экономика по фазам</h3><div className="grid grid-2">{playedPhases.map((p) => {
    const e = economyByPhase?.[p.key];
    const economyInterval = e ? `${e.startMinute}–${e.endMinute} мин` : undefined;
    const phaseItem = itemTimings?.find((it) => (p.key === 'laning' && it.timeSeconds <= 600) || (p.key === 'earlyMid' && it.timeSeconds > 600 && it.timeSeconds <= 1200) || (p.key === 'midGame' && it.timeSeconds > 1200 && it.timeSeconds <= 2100) || (p.key === 'lateGame' && it.timeSeconds > 2100));
    return <article key={p.key} className="item-timeline-card"><div><strong>{p.label}</strong><div className="muted">{e?.lhPerMinuteInPhase !== undefined ? `Фарм ${economyInterval}: ${e.lhPerMinuteInPhase.toFixed(1)} крипа/мин` : 'Добивания: нет данных'}</div><div className="muted">{e?.goldPerMinuteInPhase !== undefined ? `Золото ${economyInterval}: ${Math.round(e.goldPerMinuteInPhase)} золота/мин` : 'Золото: нет данных'}</div><div className="muted">{e?.xpPerMinuteInPhase !== undefined ? `Опыт ${economyInterval}: ${Math.round(e.xpPerMinuteInPhase)} опыта/мин` : 'Опыт: нет данных'}</div><div className={`phase-deaths ${deathsByPhase ? (deathsByPhase[p.key] >= 3 ? 'phase-deaths-danger' : deathsByPhase[p.key] >= 2 ? 'phase-deaths-warning' : deathsByPhase[p.key] === 1 ? 'phase-deaths-neutral' : 'phase-deaths-safe') : ''}`}>{deathsByPhase ? `Смерти за полную фазу: ${deathsByPhase[p.key]}` : 'Смерти: нет данных'}</div>{phaseItem ? <div className="muted">Ключевой предмет за полную фазу: {phaseItem.item}</div> : null}</div></article>;
  })}</div></Panel>;
}
