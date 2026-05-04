'use client';

import { useState } from 'react';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { DebugPanel } from '@/components/coach/DebugPanel';
import { GradesGrid } from '@/components/coach/GradesGrid';
import { MatchIdForm } from '@/components/coach/MatchIdForm';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

type Payload = { analysis: PostMatchAnalysis; debug: unknown };

export default function PostMatchPage() {
  const [matchId, setMatchId] = useState('8781054570');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/post-match/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: Number(matchId), hero: 'Lifestealer' })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Post-match analyze failed');
      setData(payload as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Пост-матч тренер</h1>
      <div className="card grid">
        <MatchIdForm matchId={matchId} onChange={setMatchId} />
        <button disabled={loading} onClick={submit}>{loading ? 'Анализ...' : 'Анализировать матч'}</button>
        {error ? <p className="error">{error}</p> : null}
      </div>

      {data ? (
        <div className="grid" style={{ marginTop: '1rem' }}>
          <section className="card">
            <h3>Сводка матча</h3>
            <p><strong>ID матча:</strong> {data.analysis.matchId}</p>
            <p><strong>Герой:</strong> {data.analysis.hero}</p>
            <p><strong>Результат:</strong> {data.analysis.result}</p>
            <p><strong>Финальный инвентарь:</strong> {data.analysis.buildPlayed.length >= 2 ? data.analysis.buildPlayed.join(' → ') : 'данные пока не распознаны'}</p>
          </section>
          <GradesGrid grades={data.analysis.grades} />
          <section className="card">
            <h3>Итог тренера</h3>
            <p><strong>Главная причина:</strong> {data.analysis.finalVerdict.mainReason}</p>
            <p><strong>Главный риск:</strong> {data.analysis.finalVerdict.biggestRisk}</p>
            <p><strong>Фокус на следующий матч:</strong> {data.analysis.finalVerdict.nextMatchFocus}</p>
          </section>
          <CoachSummaryCard title="Главные ошибки" lines={data.analysis.topMistakes} />
          <CoachSummaryCard title="План на следующий матч" lines={data.analysis.nextGameAdjustments} />
          <DebugPanel data={data.debug} title="Сводка provider payload" />
        </div>
      ) : null}
    </main>
  );
}
