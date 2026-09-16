import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStratzMatch } from './normalizeStratzMatch';

type EventInput = { statsDeaths?: Array<{ time: number }>; playbackDeaths?: Array<{ time: number }> };

function payload({ statsDeaths, playbackDeaths = [] }: EventInput) {
  const stats = statsDeaths === undefined ? {} : { deathEvents: statsDeaths };
  return {
    data: {
      match: {
        id: 33,
        players: [{
          heroId: 54,
          stats,
          playbackData: {
            deathEvents: playbackDeaths,
            playerUpdatePositionEvents: [
              { time: 10, x: 100, y: 110 },
              { time: 20, x: 101, y: 111 },
              { time: 30, x: 102, y: 112 },
              { time: 40, x: 103, y: 113 },
              { time: 50, x: 104, y: 114 }
            ]
          }
        }]
      }
    }
  };
}

test('available empty stats deaths stay canonical and block playback fallback', () => {
  const result = normalizeStratzMatch(payload({ statsDeaths: [], playbackDeaths: [{ time: 10 }] }));

  assert.equal(result.eventCoverage.selectedDeathEvents, true);
  assert.deepEqual(result.normalized.selectedPlayer?.deathEvents, []);
  assert.deepEqual(result.deathsByPhase, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 });
  assert.deepEqual(result.deathPositionSamples, []);
});

test('missing stats deaths remain unavailable and playback is research-only', () => {
  const result = normalizeStratzMatch(payload({ playbackDeaths: [{ time: 10 }] }));

  assert.equal(result.eventCoverage.selectedDeathEvents, false);
  assert.equal(result.normalized.selectedPlayer?.deathEvents, undefined);
  assert.equal(result.deathsByPhase, undefined);
  assert.equal(result.deathTimings.length, 0);
  assert.equal(result.deathPositionSamples[0]?.deathEventSource, 'stratz_playback.deathEvents');
  assert.equal(result.deathPositionSamples[0]?.productReady, false);
});

test('available stats deaths take precedence for research association', () => {
  const result = normalizeStratzMatch(payload({ statsDeaths: [{ time: 20 }], playbackDeaths: [{ time: 40 }] }));

  assert.deepEqual(result.deathTimings.map((event) => event.timeSeconds), [20]);
  assert.deepEqual(result.deathPositionSamples.map((event) => event.deathTimeSeconds), [20]);
  assert.equal(result.deathPositionSamples[0]?.deathEventSource, 'stratz_stats.deathEvents');
});

test('nearest position confidence follows the five-second research window', () => {
  const result = normalizeStratzMatch(payload({ playbackDeaths: [
    { time: 10 },
    { time: 19 },
    { time: 28 },
    { time: 36 },
    { time: 56 }
  ] }));

  assert.deepEqual(
    result.deathPositionSamples.map((sample) => [sample.deltaSeconds, sample.confidence]),
    [[0, 'exact'], [1, 'high'], [2, 'medium'], [4, 'low'], [6, 'unmatched']]
  );
});
