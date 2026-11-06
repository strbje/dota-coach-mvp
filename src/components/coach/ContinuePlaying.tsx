'use client';
import { useEffect, useState } from 'react';
import { ActionLink, Alert, Button, Panel } from '@/components/ui';
import { HeroPortrait } from '@/components/ui/HeroPortrait';
import { activeChallenges, readRecentMatches, recentMatchHref, RECENT_MATCHES_KEY, type RecentMatch } from '@/lib/dota/localProgress';
import { challengeProgress, type TrainingChallenge } from '@/lib/dota/analyze/trainingChallenge';
import styles from './postMatch.module.css';

export function ContinuePlaying() {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [goals, setGoals] = useState<TrainingChallenge[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const read = () => { try { setMatches(readRecentMatches(localStorage.getItem(RECENT_MATCHES_KEY))); setGoals(activeChallenges(localStorage)); setError(false); } catch { setError(true); } };
    read(); window.addEventListener('storage', read); return () => window.removeEventListener('storage', read);
  }, []);
  if (error) return <Alert>Браузер не разрешил открыть сохранённые матчи и цели. Разбор по ID доступен.</Alert>;
  if (!matches.length && !goals.length) return null;
  return <section className="stack" aria-label="Продолжить тренировку">
    <h2>Продолжить тренировку</h2>
    {goals.map((goal) => {
      const progress = challengeProgress(goal);
      const source = matches.find((match) => match.matchId === goal.sourceMatchId && match.accountId === goal.scope.accountId);
      const hero = source?.hero ?? matches.find((match) => match.heroId === goal.scope.heroId)?.hero ?? 'Твоя цель';
      return <Panel key={`${goal.scope.accountId}:${goal.scope.heroId}:${goal.scope.gameMode}:${goal.scope.lobbyType}`} className="stack">
        <h3>{hero} · {goal.goal.target} добиваний к 10:00</h3>
        <p>Проверено {progress.counted.length} из 3 матчей · цель достигнута в {progress.successes}.</p>
        <p className={styles.note}>Игрок {goal.scope.accountId}. Открой разбор следующего подходящего матча — прогресс обновится автоматически.</p>
        <details><summary>Условия цели</summary><p className={styles.note}>Тот же игрок, герой и роль керри, режим и тип лобби, что в исходном матче {goal.sourceMatchId}. Цель: {goal.goal.baseline} → {goal.goal.target} добиваний к 10:00. Учитываются первые три проверенных матча с данными, сыгранных после принятия цели. Без результата к 10:00 матч остаётся в ожидании.</p></details>
        <div className="inline"><ActionLink href="/post-match">Проверить следующий матч</ActionLink><ActionLink variant="secondary" href={source ? recentMatchHref(source) : `/post-match?matchId=${goal.sourceMatchId}`}>Исходный матч</ActionLink></div>
      </Panel>;
    })}
    {matches.length ? <Panel className="stack"><h3>Последние открытые матчи</h3><div className={styles.recentMatches}>{matches.map((match) => <div key={`${match.matchId}:${match.playerSlot}`} className={styles.recentMatch}><HeroPortrait key={match.heroKey ?? match.heroId} heroKey={match.heroKey}/><ActionLink variant="ghost" href={recentMatchHref(match)}>{match.hero} · матч {match.matchId}</ActionLink></div>)}</div><Button type="button" variant="ghost" onClick={() => { try { localStorage.removeItem(RECENT_MATCHES_KEY); setMatches([]); } catch { setError(true); } }}>Очистить список матчей</Button></Panel> : null}
    <p className={styles.note}>Матчи и прогресс сохраняются только в этом браузере.</p>
  </section>;
}
