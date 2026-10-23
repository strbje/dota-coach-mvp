'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Panel } from '@/components/ui';
import { acceptChallenge, challengeProgress, challengeStorageKey, checkChallenge, readChallenge, type TrainingChallenge } from '@/lib/dota/analyze/trainingChallenge';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import styles from './postMatch.module.css';

export function TrainingChallengeCard({ analysis, onEvidence }: { analysis: PostMatchAnalysis; onEvidence: () => void }) {
  const { observation, goal: proposedGoal } = analysis.training;
  const storageKey = challengeStorageKey(observation);
  const [challenge, setChallenge] = useState<TrainingChallenge | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    function synchronize() {
      setError(undefined);
      try {
        const raw = storageKey ? localStorage.getItem(storageKey) : null;
        const saved = readChallenge(raw, observation);
        const checked = saved ? checkChallenge(saved, observation) : null;
        if (raw && !saved) setError('Сохранённая цель повреждена или устарела. Можно принять новую.');
        if (checked && storageKey && JSON.stringify(checked) !== raw) localStorage.setItem(storageKey, JSON.stringify(checked));
        setChallenge(checked);
      } catch {
        setChallenge(null);
        setError('Браузер не разрешил сохранить прогресс. Автоматическое продолжение сейчас недоступно.');
      }
      setReady(true);
    }
    synchronize();
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) synchronize(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [observation, storageKey]);

  function start() {
    if (!storageKey || !proposedGoal) return;
    const next = acceptChallenge(observation, proposedGoal, Math.floor(Date.now() / 1000));
    if (!next) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setChallenge(next);
      setError(undefined);
    } catch { setError('Не удалось сохранить цель в этом браузере. Челлендж не принят.'); }
  }
  function clear() {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); setChallenge(null); setError(undefined); }
    catch { setError('Не удалось удалить сохранённую цель.'); }
  }

  const goal = challenge?.goal ?? proposedGoal;
  const progress = challenge ? challengeProgress(challenge) : null;
  const canAccept = Boolean(storageKey && observation.startTime && proposedGoal);
  const current = challenge?.checks.find((check) => check.matchId === observation.matchId);
  const lanePriorities = analysis.priorities.filter((priority) => priority.id === 'lane-farm' || priority.id === 'lane-events');
  const deaths = analysis.laneFacts?.deathsAt10;
  const efficiency = analysis.laneFacts?.efficiencyPct;
  return <Panel className={styles.challenge}>
    <span className="eyebrow">Линия · факты и следующий шаг</span>
    <h3>К 10:00</h3>
    <dl className={styles.laneFacts}>
      <div><dt>Добито крипов</dt><dd>{observation.lastHitsAt10 ?? 'Нет данных'}</dd></div>
      <div><dt>Смерти</dt><dd>{deaths ?? 'Нет данных'}</dd></div>
      {goal ? <div><dt>Цель · 3 матча</dt><dd className={styles.targetGoal}>{goal.target}</dd></div> : null}
    </dl>
    {goal ? <p className={styles.note}>Добивания включают нейтралов. Цель — +5 к {challenge ? 'исходному' : 'этому'} результату; это тренировка, а не норма.</p> : <p className={styles.note}>Для измеримой цели нужен результат к 10:00 и матч от 10 минут.</p>}
    {lanePriorities.map((priority, index) => <article className={styles.priority} key={priority.id}>
      <Badge tone={index === 0 ? 'brand' : 'unknown'}>{analysis.priorities[0].id === priority.id ? 'Основной фокус' : 'Дополнительно'}</Badge>
      <h4>{priority.title}</h4><p className="muted">{priority.meaning}</p><p className={styles.action}>{priority.action}</p>
    </article>)}
    {goal && !lanePriorities.some((priority) => priority.id === 'lane-farm') ? <p className={styles.action}>{goal.action}</p> : null}
    {analysis.review.timeline.some((event) => event.id === 'lane-at-ten') ? <Button type="button" variant="ghost" className={styles.factorLink} onClick={onEvidence}>Посмотреть отрезок ↗</Button> : null}
    {efficiency !== undefined ? <details className={styles.more}><summary>Эффективность линии · {Math.round(efficiency)}%</summary><p className={styles.note}>Исходный показатель OpenDota. Это не оценка из 100 и не положение среди игроков; сопоставимого ориентира для оценки линии нет.</p></details> : null}
    <div aria-live="polite" aria-atomic="true">
      {challenge && progress ? <div className="stack">
        <Badge tone={progress.complete ? 'success' : 'info'}>{progress.complete ? 'Цикл завершён' : 'Челлендж принят'} · {progress.counted.length}/3</Badge>
        <div className={styles.progress}>
          {[0, 1, 2].map((index) => {
            const entry = progress.counted[index];
            const passed = entry && entry.actual! >= challenge.goal.target;
            return <div key={index} className={`${styles.progressStep} ${entry ? passed ? styles.passed : styles.missed : ''}`}>
              <span>Матч {index + 1}</span><br />
              <strong>{entry ? `${entry.actual} · ${passed ? 'цель взята' : 'ниже цели'}` : 'Ожидается'}</strong>
            </div>;
          })}
        </div>
        {progress.complete ? <p>Цель достигнута в {progress.successes} из 3 матчей. {progress.successes === 3 ? 'Повтори тот же подход и проверь, насколько устойчив результат.' : 'Пересмотри первые волны матчей ниже цели и найди повторяющийся пропуск добивания.'}</p> : null}
        {current && current.actual === undefined ? <p>Этот матч пока без результата к 10:00. Он не засчитан ни как успех, ни как неудача.</p> : null}
        <details className={styles.more}>
          <summary>Какие матчи засчитаны</summary>
          {progress.counted.length ? <ul>{progress.counted.map((entry) => <li key={entry.matchId}>Матч {entry.matchId}: {entry.actual} из {challenge.goal.target}</li>)}</ul> : <p>Пока ни одного.</p>}
          <p className={styles.note}>Исходный результат: {challenge.goal.baseline}. Матч: {challenge.sourceMatchId}. Берём первые три проверенных матча с данными, сыгранных после принятия цели.</p>
        </details>
      </div> : null}
    </div>
    {error ? <Alert tone="warning">{error}</Alert> : null}
    {!storageKey || !observation.startTime ? <p className={styles.note}>Не удалось подтвердить игрока, роль, режим или время матча. Цель можно попробовать вручную; автоматическое продолжение недоступно.</p> : null}
    {!challenge && goal ? <Button type="button" disabled={!ready || !canAccept} onClick={start}>Принять челлендж</Button> : null}
    {challenge ? <>
      {progress?.complete && canAccept ? <Button type="button" onClick={start}>Начать новый челлендж</Button> : null}
      <Button type="button" variant="ghost" onClick={clear}>Снять челлендж</Button>
    </> : null}
    <p className={styles.note}>Прогресс хранится только в этом браузере.</p>
    <details className={styles.more}><summary>Как проверяем цель</summary>
      <p>Выполни цель в каждом из трёх следующих подходящих матчей. Открой их разборы — сравним реальные значения автоматически.</p>
      <p className={styles.note}>Область: тот же игрок, {analysis.hero}, керри, тот же режим и тип лобби. Считаются матчи, сыгранные после принятия цели. Нет данных к 10:00 — нет зачёта и нет неудачи. Это тренировка, а не норма героя или ранга; она не гарантирует победу.</p>
    </details>
  </Panel>;
}
