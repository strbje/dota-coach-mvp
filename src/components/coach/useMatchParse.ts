'use client';

import { useEffect, useRef, useState } from 'react';

export function useMatchParse(matchId: number) {
  const [state, setState] = useState<'idle' | 'requesting' | 'queued' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function request() {
    if (state === 'requesting' || state === 'queued') return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setState('requesting'); setError(undefined);
    try {
      const response = await fetch('/api/post-match/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(12_000)]) });
      const result = await response.json();
      if (current.signal.aborted) return;
      if (!response.ok || typeof result?.jobId !== 'string') throw new Error(result?.error === 'rate_limit' ? 'rate_limit' : 'unavailable');
      setState('queued');
    } catch (failure) {
      if (current.signal.aborted) return;
      setState('error');
      setError(failure instanceof Error && failure.message === 'rate_limit'
        ? 'Лимит запросов OpenDota. Попробуй отправить запрос позже.'
        : 'Не удалось подтвердить отправку запроса. Можно обновить разбор или попробовать позже.');
    }
  }
  return { state, error, request };
}
