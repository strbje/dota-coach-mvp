'use client';

import { useEffect, useRef, useState } from 'react';

type ParseState = 'idle' | 'requesting' | 'polling' | 'paused' | 'checking' | 'checked' | 'error';

export function useMatchParse(matchId: number, onRefresh: () => Promise<boolean>) {
  const [state, setState] = useState<ParseState>('idle');
  const [error, setError] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [polling, setPolling] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useRef(onRefresh);
  const busy = useRef(false);
  useEffect(() => { refresh.current = onRefresh; }, [onRefresh]);
  useEffect(() => () => controller.current?.abort(), [matchId]);

  useEffect(() => {
    if (!jobId || !polling) return;
    const current = new AbortController();
    controller.current = current;
    const deadline = Date.now() + 60_000;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (current.signal.aborted) return;
      if (Date.now() >= deadline) { setPolling(false); setState('paused'); return; }
      try {
        const response = await fetch(`/api/post-match/parse?jobId=${jobId}`, { cache: 'no-store', signal: AbortSignal.any([current.signal, AbortSignal.timeout(10_000)]) });
        const result = await response.json();
        if (current.signal.aborted) return;
        if (!response.ok || typeof result?.queued !== 'boolean') throw new Error(result?.error === 'rate_limit' ? 'rate_limit' : 'unavailable');
        if (result.queued) { timer = setTimeout(() => void check(), 5_000); return; }
        setState('checking');
        const updated = await refresh.current();
        if (current.signal.aborted) return;
        setPolling(false); setState('checked');
        if (!updated) setError('Не удалось обновить разбор. Показаны ранее полученные данные. Попробуй обновить позже.');
      } catch (failure) {
        if (current.signal.aborted) return;
        setPolling(false); setState('paused');
        setError(failure instanceof Error && failure.message === 'rate_limit'
          ? 'Лимит запросов OpenDota. Автопроверка остановлена; попробуй позже.'
          : 'Не удалось проверить обработку. Автопроверка остановлена; полученные данные сохранены.');
      }
    }
    timer = setTimeout(() => void check(), 5_000);
    return () => { current.abort(); clearTimeout(timer); };
  }, [matchId, jobId, polling]);

  async function request() {
    if (busy.current || jobId) return;
    busy.current = true;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setState('requesting'); setError(undefined);
    try {
      const response = await fetch('/api/post-match/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(12_000)]) });
      const result = await response.json();
      if (current.signal.aborted) return;
      if (!response.ok || typeof result?.jobId !== 'string' || !/^[1-9]\d{0,19}$/.test(result.jobId)) throw new Error(result?.error === 'rate_limit' ? 'rate_limit' : 'unavailable');
      setJobId(result.jobId); setState('polling'); setPolling(true);
    } catch (failure) {
      if (current.signal.aborted) return;
      setState('error');
      setError(failure instanceof Error && failure.message === 'rate_limit'
        ? 'Лимит запросов OpenDota. Попробуй отправить запрос позже.'
        : 'Не удалось подтвердить отправку запроса. Можно обновить разбор или попробовать позже.');
    } finally { busy.current = false; }
  }
  function resume() { setError(undefined); setState('polling'); setPolling(true); }
  function pause() { controller.current?.abort(); setPolling(false); setState(jobId ? 'paused' : 'idle'); }
  return { state, error, jobId, request, resume, pause };
}
