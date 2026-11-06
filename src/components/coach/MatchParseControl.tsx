'use client';

import { Alert, Button } from '@/components/ui';
import { useMatchParse } from './useMatchParse';
import styles from './postMatch.module.css';

export function MatchParseControl({ matchId, onRefresh, refreshing }: { matchId: number; onRefresh: () => Promise<boolean>; refreshing: boolean }) {
  const { state, error, request } = useMatchParse(matchId);
  return <div className="stack" aria-label="Подробные данные матча">
    <p className={styles.note} role="status">{state === 'queued'
      ? 'Запрос отправлен. Обработка записи может занять несколько минут. Обнови разбор, чтобы проверить результат; доступность записи не гарантирована.'
      : 'OpenDota ещё не разобрал запись этого матча. Можно запросить данные золота, опыта и покупок.'}</p>
    {error ? <Alert tone="warning">{error}</Alert> : null}
    <div className={styles.chartSwitch}>
      {state !== 'queued' ? <Button type="button" variant="secondary" loading={state === 'requesting'} loadingLabel="Отправляем запрос…" disabled={refreshing} onClick={() => void request()}>Запросить подробные данные</Button> : null}
      <Button type="button" variant="secondary" loading={refreshing} loadingLabel="Обновляем разбор…" disabled={state === 'requesting'} onClick={() => void onRefresh()}>Обновить разбор</Button>
    </div>
  </div>;
}
