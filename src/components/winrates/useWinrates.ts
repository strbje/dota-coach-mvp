'use client';
import { useEffect, useRef, useState } from 'react';
import { encounters, resultKey, sample } from '@/lib/dota/winrates/calculation';
import { canRetry } from '@/lib/dota/winrates/presentation';
import { applyParticipantUpdate } from '@/lib/dota/winrates/participantUpdate';
import type { Encounter, Failure, History, MatchEntry, ParticipantResult, Plan, Query, Results } from '@/lib/dota/winrates/types';

async function post<T>(path: string, body: unknown, signal: AbortSignal, timeout: number): Promise<T> {
  const response = await fetch(`/api/winrates/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'provider_error');
  return result as T;
}

function failedResult(row: Encounter, plan: Plan, error: unknown): ParticipantResult {
  const asOf = plan.query.basis === 'match' ? row.startTime : plan.capturedAt;
  const code = error instanceof Error && ['unavailable', 'rate_limit', 'timeout'].includes(error.message) ? error.message as Failure : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'provider_error';
  const history: History = { rows: [], stop: code, scanned: 0, invalid: 0, oldest: null, ordered: true, fetchedAt: 0, expiresAt: 0 };
  const { rows, ...summary } = history;
  void rows;
  return { accountId: row.player.accountId!, matchId: row.matchId, basis: plan.query.basis, asOf, capturedAt: plan.capturedAt, status: code, samples: { 7: sample(history, 7, asOf, row.matchId), 30: sample(history, 30, asOf, row.matchId) }, history: summary, fetchedAt: 0, expiresAt: 0 };
}

function validResult(result: ParticipantResult, row: Encounter, plan: Plan) {
  return result?.accountId === row.player.accountId && result.matchId === row.matchId && result.basis === plan.query.basis && result.capturedAt === plan.capturedAt
    && result.asOf === (plan.query.basis === 'match' ? row.startTime : plan.capturedAt)
    && result.samples?.[7]?.days === 7 && result.samples?.[30]?.days === 30 && typeof result.history?.scanned === 'number';
}

export function useWinrates() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number>();
  const [results, setResults] = useState<Results>({});
  const [busy, setBusy] = useState<'plan' | 'participants' | null>(null);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const stop = () => { generation.current++; controller.current?.abort(); setBusy(null); };
  const clear = () => { stop(); setPlan(null); setSelectedSlot(undefined); setResults({}); setError(undefined); };
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  async function loadParticipants(nextPlan: Plan, slot: number | undefined, existing: Results) {
    stop();
    const version = generation.current;
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 45000);
    setBusy('participants');
    setError(undefined);
    const seen = new Set<string>();
    const queue = encounters(nextPlan, slot).filter((row) => {
      if (!row.player.accountId) return false;
      const key = resultKey(row.matchId, row.player.accountId);
      if (seen.has(key) || !canRetry(existing[key])) return false;
      seen.add(key); return true;
    });
    let cursor = 0;
    let limited = false;
    async function worker() {
      while (cursor < queue.length && !request.signal.aborted && !limited) {
        const row = queue[cursor++];
        let result: ParticipantResult;
        try {
          result = await post<ParticipantResult>('participant', { matchId: row.matchId, accountId: row.player.accountId, basis: nextPlan.query.basis, capturedAt: nextPlan.capturedAt, rankedOnly: nextPlan.query.rankedOnly, excludeTurbo: nextPlan.query.excludeTurbo }, request.signal, 17000);
          if (!validResult(result, row, nextPlan)) throw new Error('provider_error');
        } catch (failure) { if (request.signal.aborted) return; result = failedResult(row, nextPlan, failure); }
        if (generation.current !== version || request.signal.aborted) return;
        const key = resultKey(row.matchId, row.player.accountId!);
        setResults((current) => ({ ...current, [key]: applyParticipantUpdate(current[key], result) }));
        if (result.status === 'rate_limit' || result.history.stop === 'rate_limit') { limited = true; setError('rate_limit'); }
      }
    }
    try { await Promise.all([worker(), worker()]); }
    finally { clearTimeout(timer); if (generation.current === version) setBusy(null); }
  }

  async function loadPlan(query: Query, preferredAccount?: number) {
    clear();
    const version = generation.current;
    const request = new AbortController();
    controller.current = request;
    setBusy('plan');
    try {
      const next = await post<Plan>('plan', query, request.signal, 22000);
      if (generation.current !== version || request.signal.aborted) return;
      if (!next?.query || !Array.isArray(next.matches) || !Number.isSafeInteger(next.capturedAt)) throw new Error('provider_error');
      const slot = query.mode === 'match' && preferredAccount !== undefined
        ? next.matches[0]?.match?.players.find((player) => player.accountId === preferredAccount)?.slot : undefined;
      setPlan(next); setSelectedSlot(slot); setBusy(null);
      if (query.mode === 'series' || slot !== undefined) void loadParticipants(next, slot, {});
    } catch (failure) {
      if (generation.current === version && !request.signal.aborted) {
        setError(failure instanceof Error && failure.name === 'TimeoutError' ? 'timeout' : failure instanceof Error ? failure.message : 'provider_error'); setBusy(null);
      }
    }
  }

  const selectPlayer = (slot: number) => {
    stop(); setSelectedSlot(slot); setResults({});
    if (plan) void loadParticipants(plan, slot, {});
  };
  async function extendSeries(retryRosters = false) {
    if (!plan?.series) return;
    const ids = retryRosters ? plan.matches.filter((entry) => entry.error).slice(0, 3).map((entry) => entry.matchId) : plan.series.remainingIds.slice(0, 3);
    if (!ids.length) return;
    stop();
    const version = generation.current;
    const request = new AbortController(); controller.current = request; setBusy('plan'); setError(undefined);
    try {
      const entries = await post<MatchEntry[]>('batch', { ...plan.query, capturedAt: plan.capturedAt, matchIds: ids }, request.signal, 22000);
      if (generation.current !== version || request.signal.aborted) return;
      if (!Array.isArray(entries) || entries.length !== ids.length || entries.some((entry, index) => entry.matchId !== ids[index])) throw new Error('provider_error');
      const byId = new Map(plan.matches.map((entry) => [entry.matchId, entry]));
      entries.forEach((entry) => byId.set(entry.matchId, entry));
      const next: Plan = { ...plan, matches: [...byId.values()], series: { ...plan.series, shown: byId.size, remainingIds: plan.series.remainingIds.filter((id) => !ids.includes(id)) } };
      setPlan(next); setBusy(null); void loadParticipants(next, selectedSlot, results);
    } catch (failure) {
      if (generation.current === version && !request.signal.aborted) { setBusy(null); setError(failure instanceof Error ? failure.message : 'provider_error'); }
    }
  }
  return { plan, selectedSlot, results, busy, error, stop, clear, loadPlan, selectPlayer, extendSeries, resume: () => { if (plan) void loadParticipants(plan, selectedSlot, results); } };
}
