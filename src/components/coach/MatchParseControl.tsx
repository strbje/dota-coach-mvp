'use client';

import { Alert, Button } from '@/components/ui';
import { useMatchParse } from './useMatchParse';
import styles from './postMatch.module.css';

export function MatchParseControl({ matchId, onRefresh, refreshing }: { matchId: number; onRefresh: () => Promise<boolean>; refreshing: boolean }) {
  const { state, error, jobId, request, resume, pause } = useMatchParse(matchId, onRefresh);
  const checking = state === 'polling' || state === 'checking';
  const message = state === 'polling' ? 'Запрос отправлен. Проверяем обработку около минуты; когда запись выйдет из очереди, обновим разбор.'
    : state === 'checking' ? 'Проверяем, появились ли подробные данные…'
    : state === 'paused' ? 'Автопроверка на паузе. Обработка может продолжаться; можно проверить ещё раз.'
    : state === 'checked' ? 'Проверка завершена. Подробные данные пока не появились. Доступность записи не гарантирована; попробуй обновить позже.'
    : 'Разбор пока неполный: OpenDota ещё не обработал запись. Графики ресурсов и покупки появятся, если удастся получить подробные данные.';
  return <div className="stack" aria-label="Подробные данные матча">
    <p className={styles.note} role="status">{message}</p>
    {error ? <Alert tone="warning">{error}</Alert> : null}
    <div className={styles.chartSwitch}>
      {!jobId ? <Button type="button" variant="secondary" loading={state === 'requesting'} loadingLabel="Отправляем запрос…" disabled={refreshing} onClick={() => void request()}>Запросить подробные данные</Button> : null}
      {jobId && !checking ? <Button type="button" variant="secondary" disabled={refreshing} onClick={resume}>Проверить обработку ещё раз</Button> : null}
      {state === 'polling' ? <Button type="button" variant="ghost" onClick={pause}>Остановить автопроверку</Button> : null}
      <Button type="button" variant="secondary" loading={refreshing} loadingLabel="Обновляем разбор…" disabled={state === 'requesting' || state === 'checking'} onClick={() => { pause(); void onRefresh(); }}>Обновить разбор</Button>
    </div>
  </div>;
}
