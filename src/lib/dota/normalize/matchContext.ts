import type { MatchTimelineEvent, TeamAdvantagePoint } from '../types/domain';
import type { OpenDotaMatchResponse } from '../types/providers';
import { normalizeObjectiveType } from '../rules/postMatch/objectives';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** OpenDota's times array may start after 0:00. Never shift these samples to minute zero. */
export function alignMinuteSeries(values: unknown, times: unknown, duration: number): number[] | null {
  if (!Array.isArray(values)) return null;
  if (times === undefined) return values.map((v) => finite(v) && v >= 0 ? v : NaN);
  if (!validTimes(times) || times.length !== values.length) return null;
  const aligned: number[] = [];
  times.forEach((seconds, index) => {
    if (seconds < 0 || seconds > duration || seconds % 60 !== 0) return;
    const value = values[index];
    aligned[seconds / 60] = finite(value) && value >= 0 ? value : NaN;
  });
  return aligned;
}

function validTimes(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((time, index) =>
    finite(time) && (index === 0 || time > value[index - 1]));
}

export function normalizeTeamAdvantage(payload: OpenDotaMatchResponse, isRadiant: boolean, duration: number): TeamAdvantagePoint[] {
  // A shared, explicit clock is required for new team context. Conflicting clocks are not guessed.
  const clocks = (payload.players ?? []).filter((p) => p.times !== undefined).map((p) => p.times);
  if (!clocks.length || !clocks.every(validTimes)) return [];
  const times = clocks[0] as number[];
  if (clocks.some((clock) => clock.length !== times.length || clock.some((time, i) => time !== times[i]))) return [];
  const gold = Array.isArray(payload.radiant_gold_adv) && payload.radiant_gold_adv.length === times.length ? payload.radiant_gold_adv : [];
  const xp = Array.isArray(payload.radiant_xp_adv) && payload.radiant_xp_adv.length === times.length ? payload.radiant_xp_adv : [];
  const sign = isRadiant ? 1 : -1;
  return times.flatMap((timeSeconds, index) => {
    if (timeSeconds < 0 || timeSeconds > duration) return [];
    const goldValue = finite(gold[index]) ? gold[index] * sign : undefined;
    const xpValue = finite(xp[index]) ? xp[index] * sign : undefined;
    return goldValue === undefined && xpValue === undefined ? [] : [{ timeSeconds, gold: goldValue, xp: xpValue }];
  });
}

export function normalizeObjectiveTimeline(raw: unknown, duration: number): MatchTimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index): MatchTimelineEvent[] => {
    if (!entry || typeof entry !== 'object' || !finite(entry.time) || entry.time < 0 || entry.time > duration || typeof entry.type !== 'string') return [];
    const type = normalizeObjectiveType(entry.type);
    // Event.team has different meanings across event types; do not infer who destroyed a building.
    const buildingSide = typeof entry.key === 'string'
      ? /^npc_dota_goodguys_(tower|fort|.*rax)/.test(entry.key) ? 'Radiant'
        : /^npc_dota_badguys_(tower|fort|.*rax)/.test(entry.key) ? 'Dire' : undefined
      : undefined;
    const label = type === 'building' || type === 'barracks'
      ? `Разрушено строение${buildingSide ? ` ${buildingSide}` : ''}`
      : type === 'roshan' ? 'Убит Рошан' : type === 'aegis' ? 'Получена Эгида' : undefined;
    return label ? [{ id: `objective-${index}`, timeSeconds: entry.time, kind: 'objective', label }] : [];
  }).sort((a, b) => a.timeSeconds - b.timeSeconds);
}
