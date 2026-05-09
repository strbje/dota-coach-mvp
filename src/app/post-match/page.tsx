'use client';

import { useState } from 'react';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { DebugPanel } from '@/components/coach/DebugPanel';
import { GradesGrid } from '@/components/coach/GradesGrid';
import { MatchIdForm } from '@/components/coach/MatchIdForm';
import { ItemTimeline } from '@/components/coach/ItemTimeline';
import { PhaseBreakdown } from '@/components/coach/PhaseBreakdown';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

type Payload = { analysis: PostMatchAnalysis; debug: unknown };


function phaseTone(value: number): string {
  if (value >= 3) return 'phase-chip-danger';
  if (value >= 2) return 'phase-chip-warning';
  if (value === 1) return 'phase-chip-normal';
  return 'phase-chip-safe';
}


export default function PostMatchPage() {
  const [matchId, setMatchId] = useState('8781054570');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/post-match/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: Number(matchId), hero: 'Lifestealer' }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Post-match analyze failed');
      setData(payload as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); } finally { setLoading(false); }
  }

  return <main className="container"><h1>Пост-матч тренер</h1><div className="card grid"><MatchIdForm matchId={matchId} onChange={setMatchId} /><button disabled={loading} onClick={submit}>{loading ? 'Анализ...' : 'Анализировать матч'}</button>{error ? <p className="error">{error}</p> : null}</div>
    {data ? <div className="grid" style={{ marginTop: '1rem' }}><section className="card"><h3>Краткая сводка матча</h3><p><strong>ID матча:</strong> {data.analysis.matchId}</p><p><strong>Герой:</strong> {data.analysis.hero}</p><p><strong>Результат:</strong> {data.analysis.result}</p><p><strong>Финальный инвентарь:</strong> {data.analysis.buildPlayed.length >= 2 ? data.analysis.buildPlayed.join(' → ') : 'данные пока не распознаны'}</p></section>
      <GradesGrid grades={data.analysis.grades} />
      <ItemTimeline items={data.analysis.itemTimings} />
      <PhaseBreakdown economyByPhase={data.analysis.economyByPhase} deathsByPhase={data.analysis.deathsByPhase} itemTimings={data.analysis.itemTimings} />
      {data.analysis.stratz?.deathsByPhase ? <section className="card"><h3>Смерти по фазам</h3><div className="phase-chip-grid">{[
        ['Линия', data.analysis.stratz.deathsByPhase.laning],
        ['Ранняя середина', data.analysis.stratz.deathsByPhase.earlyMid],
        ['Мидгейм', data.analysis.stratz.deathsByPhase.midGame],
        ['Лейт', data.analysis.stratz.deathsByPhase.lateGame]
      ].map(([label, value]) => <div key={String(label)} className={`phase-chip ${phaseTone(Number(value))}`}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {data.analysis.stratz?.deathTimings?.length ? <details style={{ marginTop: '0.75rem' }}><summary>Показать тайминги смертей</summary><ul>{data.analysis.stratz.deathTimings.map((d) => <li key={`${d.time}-${d.phase}`}>{d.time} — {d.phase === 'laning' ? 'линия' : d.phase === 'earlyMid' ? 'ранняя середина' : d.phase === 'midGame' ? 'мидгейм' : 'лейт'}</li>)}</ul></details> : null}
      </section> : null}
      {data.analysis.farmProfile ? <section className="card"><h3>Профиль фарма</h3><ul><li>Лейн-крипы: {data.analysis.farmProfile.laneKills ?? 0}</li><li>Нейтралы: {data.analysis.farmProfile.neutralKills ?? 0}</li><li>Древние: {data.analysis.farmProfile.ancientKills ?? 0}</li><li>Убийства героев: {data.analysis.farmProfile.heroKills ?? 0}</li></ul></section> : null}
      <section className="card"><h3>Итог тренера</h3><p><strong>Главная причина:</strong> {data.analysis.finalVerdict.mainReason}</p><p><strong>Главный риск:</strong> {data.analysis.finalVerdict.biggestRisk}</p><p><strong>Фокус на следующий матч:</strong> {data.analysis.finalVerdict.nextMatchFocus}</p></section>
      <CoachSummaryCard title="Главные ошибки" lines={data.analysis.topMistakes} />
      <CoachSummaryCard title="Что сделать в следующей игре" lines={data.analysis.nextGameAdjustments} />
      <DebugPanel data={data.debug} title="Provider payload summary / Debug" />
    </div> : null}
  </main>;
}
