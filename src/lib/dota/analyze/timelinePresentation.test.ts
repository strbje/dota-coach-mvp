import assert from 'node:assert/strict';
import test from 'node:test';
import { allEventFilters, clusterEvents, resourceSegments, revealEvidence, timelineDomain } from './timelinePresentation';
import type { MatchReview, MatchTimelineEvent } from '../types/domain';

const event = (id: string, timeSeconds: number, kind: MatchTimelineEvent['kind'] = 'item'): MatchTimelineEvent => ({ id, timeSeconds, kind, label: id });

test('one time domain retains pregame purchases and events beyond incomplete resource coverage', () => {
  const review: MatchReview = { headline: '', summary: '', factors: [], strengths: [], advantage: [{ timeSeconds: 0, gold: 0 }, { timeSeconds: 600, gold: 1200 }], timeline: [event('pregame', -80), event('late', 2350)] };
  assert.deepEqual(timelineDomain(review, 2400), { from: -80, to: 2400 });
  assert.deepEqual(timelineDomain({ ...review, advantage: [] }, 2400), { from: -80, to: 2400 });
});

test('gold and XP keep their own gaps and isolated points without interpolation', () => {
  const points = [{ timeSeconds: 0, gold: 0, xp: 0 }, { timeSeconds: 60, xp: 100 }, { timeSeconds: 120, gold: 200, xp: 300 }, { timeSeconds: 180, gold: 300 }];
  assert.deepEqual(resourceSegments(points, 'gold').map((segment) => segment.map((p) => p.timeSeconds)), [[0], [120, 180]]);
  assert.deepEqual(resourceSegments(points, 'xp').map((segment) => segment.map((p) => p.timeSeconds)), [[0, 60, 120]]);
  assert.deepEqual(points[1], { timeSeconds: 60, xp: 100 });
});

test('clusters retain coincident and close events once and keep buttons apart at mobile/desktop widths', () => {
  const events = [-60, 0, 60, 600, 600, 601, 620, 800, 900, 1800, 1850, 2400].map((time, i) => event(String(i), time));
  const domain = { from: -60, to: 2400 };
  for (const width of [208, 278, 600, 1200]) {
    const clusters = clusterEvents(events, domain, width);
    assert.deepEqual(clusters.flatMap((group) => group.events).map((e) => e.id).sort(), events.map((e) => e.id).sort());
    assert.ok(clusters.every((group) => group.events.length > 0));
    for (let i = 1; i < clusters.length; i++) assert.ok((clusters[i].time - clusters[i - 1].time) / (domain.to - domain.from) * width >= 52);
    assert.ok(clusters.some((group) => group.events.filter((e) => e.timeSeconds === 600).length === 2));
  }
});

test('evidence enables only its hidden type, selects exact time and identifies focus target', () => {
  const filters = { ...allEventFilters, item: false, death: false };
  const events = [event('purchase', -60), event('death', 700, 'death')];
  const result = revealEvidence(events, filters, { id: 'purchase', from: 0, to: 300, sequence: 1 });
  assert.deepEqual(result, { filters: { ...filters, item: true }, selection: { from: -60, to: -60 }, focusId: 'purchase' });
  assert.equal(filters.item, false, 'do not mutate previous filter state');
  assert.deepEqual(revealEvidence(events, filters, { id: 'team-advantage', from: 600, to: 900, sequence: 2 }), { filters: { ...filters, death: true }, selection: { from: 600, to: 900 }, focusId: 'team-advantage' });
});
