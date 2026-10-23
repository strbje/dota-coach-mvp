import type { MatchReview, MatchTimelineEvent, TeamAdvantagePoint } from '../types/domain';

export type EventFilters = Record<MatchTimelineEvent['kind'], boolean>;
export const allEventFilters: EventFilters = { item: true, death: true, objective: true, lane: true };
export type TimelineSelection = { from: number; to: number };
export type EvidenceRequest = { id: string; from: number; to: number; sequence: number };

export function timelineDomain(review: MatchReview, durationSeconds: number): TimelineSelection {
  const times = [...review.advantage.map((p) => p.timeSeconds), ...review.timeline.flatMap((e) => [e.timeSeconds, e.endSeconds ?? e.timeSeconds])];
  return { from: Math.min(0, ...times), to: Math.max(1, durationSeconds, ...times) };
}

export function resourceSegments(points: TeamAdvantagePoint[], metric: 'gold' | 'xp'): TeamAdvantagePoint[][] {
  const segments: TeamAdvantagePoint[][] = [];
  for (const point of points.filter((p) => p[metric] !== undefined)) {
    const previous = segments.at(-1)?.at(-1);
    if (!previous || point.timeSeconds - previous.timeSeconds > 60) segments.push([point]);
    else segments[segments.length - 1].push(point);
  }
  return segments;
}

// Cluster in screen space, keeping every original event and its exact timestamp.
// A cluster sits at the midpoint of its events, never at an invented resource value.
export function clusterEvents(events: MatchTimelineEvent[], domain: TimelineSelection, width: number) {
  const gap = (domain.to - domain.from) * 52 / Math.max(1, width);
  const clusters: Array<{ time: number; events: MatchTimelineEvent[] }> = [];
  for (const event of [...events].sort((a, b) => a.timeSeconds - b.timeSeconds || a.id.localeCompare(b.id))) {
    const previous = clusters.at(-1);
    if (previous && event.timeSeconds - previous.time < gap) {
      previous.events.push(event);
      previous.time = (previous.events[0].timeSeconds + event.timeSeconds) / 2;
    } else clusters.push({ time: event.timeSeconds, events: [event] });
  }
  return clusters;
}

export function revealEvidence(events: MatchTimelineEvent[], filters: EventFilters, request: EvidenceRequest) {
  const event = events.find((entry) => entry.id === request.id);
  const related = event ? [event] : events.filter((entry) => entry.timeSeconds >= request.from && entry.timeSeconds <= request.to);
  const revealedFilters = { ...filters };
  for (const entry of related) revealedFilters[entry.kind] = true;
  return {
    filters: revealedFilters,
    selection: { from: event?.timeSeconds ?? request.from, to: event?.endSeconds ?? event?.timeSeconds ?? request.to },
    focusId: event?.id ?? 'team-advantage'
  };
}
