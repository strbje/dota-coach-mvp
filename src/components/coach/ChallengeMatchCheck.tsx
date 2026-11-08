'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { ChallengeCheckError, checkChallengeBatch, startChallengeScan, type ChallengeScan } from '@/lib/dota/analyze/checkChallengeMatches';
import { challengeProgress, type TrainingChallenge } from '@/lib/dota/analyze/trainingChallenge';
import type { TrainingObservation } from '@/lib/dota/types/domain';
import styles from './postMatch.module.css';

export function ChallengeMatchCheck({ challenge, onSave }: {
  challenge: TrainingChallenge; onSave: (observation: TrainingObservation) => TrainingChallenge;
}) {
  const [scan, setScan] = useState<ChallengeScan>();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<number>();
  const [error, setError] = useState<string>();
  const [paused, setPaused] = useState(false);
  const active = useRef<AbortController | null>(null);
  const running = useRef(false);
  useEffect(() => () => active.current?.abort(), []);

  async function run() {
    if (running.current) return;
    const controller = new AbortController();
    active.current = controller; running.current = true;
    setBusy(true); setError(undefined); setPaused(false);
    try {
      const next = scan?.queue.length ? scan : await startChallengeScan(challenge, controller.signal);
      if (controller.signal.aborted) return;
      setScan(next);
      const completed = await checkChallengeBatch({ challenge, scan: next, signal: controller.signal, save: onSave,
        update: (value, matchId) => { setScan(value); setChecking(matchId); }
      });
      if (!controller.signal.aborted) { setScan(completed); setPaused(completed.queue.length > 0); }
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof ChallengeCheckError ? failure.message : 'Не удалось завершить проверку. Попробуй ещё раз — подтверждённый прогресс сохранён.');
    } finally {
      if (active.current === controller && !controller.signal.aborted) { running.current = false; setBusy(false); setChecking(undefined); }
    }
  }
  function pause() {
    active.current?.abort(); running.current = false;
    setBusy(false); setChecking(undefined); setPaused(true);
  }

  const progress = challengeProgress(challenge);
  const unresolved = new Map(challenge.checks.filter((entry) => entry.actual === undefined)
    .map((entry) => [entry.matchId, { matchId: entry.matchId, message: 'Нет добиваний к 10:00 — ожидаем данные.', status: 'pending' }]));
  for (const entry of scan?.results ?? []) if (entry.status !== 'checked') unresolved.set(entry.matchId, entry);
  const pending = [...unresolved.values()].filter((entry) => entry.status === 'pending').length;
  return <div className={styles.challengeCheck}>
    <Button type="button" variant="secondary" loading={busy}
      loadingLabel={checking ? 'Проверяем матч…' : 'Ищем матчи…'} onClick={() => void run()}>
      {scan?.queue.length ? 'Продолжить проверку' : 'Проверить новые матчи'}
    </Button>
    {busy ? <Button type="button" variant="ghost" onClick={pause}>Остановить проверку</Button> : null}
    <div role="status" aria-live="polite" aria-atomic="true" className={styles.note}>
      {busy ? checking ? `Матч ${checking}. Проверено в этой загрузке: ${scan?.results.length ?? 0}.` : 'Ищем игры после принятия цели.'
        : paused ? `Проверка приостановлена.${scan?.queue.length ? ` Осталось матчей: ${scan.queue.length}.` : ''} Полученные результаты сохранены.`
        : scan && !error ? scan.results.length ? `Проверка завершена. Обработано матчей: ${scan.results.length}.${pending ? ` Ожидают данных: ${pending}. Проверь их позже той же кнопкой.` : ''}`
          : 'В доступной истории пока нет новых матчей для этой цели. Проверь после следующей игры.' : null}
    </div>
    {error ? <Alert tone="warning">{error}</Alert> : null}
    {scan?.history.partial ? <p className={styles.note}>Получена только часть истории. Подтверждённые результаты сохранены; другие матчи могут появиться при следующей проверке.</p> : null}
    <details className={styles.more}>
      <summary>Матчи и результаты проверки{pending ? ` · ожидают данных: ${pending}` : ''}</summary>
      {progress.counted.length ? <ul>{progress.counted.map((entry) => <li key={entry.matchId}>
        <Link href={`/post-match?matchId=${entry.matchId}`}>Матч {entry.matchId}</Link>: {entry.actual} из {challenge.goal.target}
      </li>)}</ul> : <p>Пока ни одного зачтённого матча.</p>}
      {unresolved.size ? <ul>{[...unresolved.values()].map((entry) => <li key={entry.matchId}>
        <Link href={`/post-match?matchId=${entry.matchId}`}>Матч {entry.matchId}</Link>: {entry.message}
      </li>)}</ul> : null}
      <p className={styles.note}>Исходный результат: {challenge.goal.baseline}. Матч: {challenge.sourceMatchId}. Берём первые три проверенных матча с данными, сыгранных после принятия цели.</p>
      {scan ? <p className={styles.note}>История получена {new Date(scan.history.fetchedAt * 1000).toLocaleString('ru-RU')}. Проверяем до трёх матчей за нажатие, без фонового поиска.</p> : null}
    </details>
  </div>;
}
