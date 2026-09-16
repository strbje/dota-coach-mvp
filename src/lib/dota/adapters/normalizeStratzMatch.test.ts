import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStratzMatch } from './normalizeStratzMatch';

type RawEventStats = {
  killEvents?: Array<{ time: number }> | null;
  deathEvents?: Array<{ time: number }> | null;
  assistEvents?: Array<{ time: number }> | null;
};

function player(heroId: number, isRadiant: boolean, stats: RawEventStats = { killEvents: [], deathEvents: [], assistEvents: [] }): {
  heroId: number;
  isRadiant: boolean;
  stats: RawEventStats;
  playbackData?: Record<string, Array<Record<string, number>>>;
} {
  return { heroId, isRadiant, stats };
}

function fullRoster() {
  return Array.from({ length: 10 }, (_, index) => player(index === 0 ? 54 : index, index < 5));
}

test('keeps a missing selected death-event stream unavailable', () => {
  const players = fullRoster();
  players[0] = player(54, true, { killEvents: [], assistEvents: [] });

  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.selectedDeathEvents, false);
  assert.equal(result.normalized.selectedPlayer?.deathEvents, undefined);
  assert.equal(result.deathsByPhase, undefined);
  assert.equal(result.deathMetrics.deathsAfterKeyItem.value, null);
});

test('normalizes an available empty selected death stream to zero phase counts', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster() } });

  assert.equal(result.eventCoverage.selectedDeathEvents, true);
  assert.deepEqual(result.normalized.selectedPlayer?.deathEvents, []);
  assert.deepEqual(result.deathsByPhase, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 });
});

test('does not claim all-player death coverage for a nine-player response', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster().slice(0, 9) } });

  assert.equal(result.eventCoverage.allPlayerDeathEvents, false);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.readiness, 'unavailable');
});

test('accepts empty death arrays from a complete unique ten-player roster', () => {
  const result = normalizeStratzMatch({ match: { players: fullRoster() } });

  assert.equal(result.eventCoverage.allPlayerDeathEvents, true);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.value, 0);
  assert.equal(result.deathMetrics.firstDeathInKillCluster.readiness, 'research');
});

test('rejects a four-player selected-team denominator', () => {
  const players = fullRoster().map((entry, index) => ({ ...entry, isRadiant: index < 4 }));
  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.teamKillEvents, false);
  assert.equal(result.fightMetrics.readiness, 'unavailable');
});

test('does not use playback deaths when the canonical stats stream is an empty array', () => {
  const players = fullRoster();
  players[0] = { ...players[0], playbackData: { deathEvents: [{ time: 700 }], playerUpdatePositionEvents: [{ time: 700, x: 128, y: 128 }] } };

  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.selectedDeathEvents, true);
  assert.deepEqual(result.normalized.selectedPlayer?.deathEvents, []);
  assert.deepEqual(result.deathsByPhase, { laning: 0, earlyMid: 0, midGame: 0, lateGame: 0 });
  assert.equal(result.deathMetrics.deathsAfterKeyItem.value, null);
  assert.deepEqual(result.deathPositionSamples, []);
  assert.equal(result.deathEventSource, 'stratz_stats.deathEvents');
});

test('uses playback deaths only for research positions when canonical stats deaths are missing', () => {
  const players = fullRoster();
  players[0] = {
    ...player(54, true, { killEvents: [], assistEvents: [] }),
    playbackData: { deathEvents: [{ time: 700 }], playerUpdatePositionEvents: [{ time: 701, x: 129, y: 127 }] }
  };

  const result = normalizeStratzMatch({ match: { players } });

  assert.equal(result.eventCoverage.selectedDeathEvents, false);
  assert.equal(result.normalized.selectedPlayer?.deathEvents, undefined);
  assert.equal(result.deathsByPhase, undefined);
  assert.equal(result.deathMetrics.deathsAfterKeyItem.readiness, 'unavailable');
  assert.equal(result.deathPositionSamples.length, 1);
  assert.equal(result.deathEventSource, 'stratz_playback.deathEvents');
});

test('prefers canonical stats deaths for research association when both streams differ', () => {
  const players = fullRoster();
  players[0] = {
    ...players[0],
    stats: { killEvents: [], deathEvents: [{ time: 100 }], assistEvents: [] },
    playbackData: { deathEvents: [{ time: 200 }], playerUpdatePositionEvents: [{ time: 100, x: 130, y: 126 }] }
  };

  const result = normalizeStratzMatch({ match: { players } });
  assert.deepEqual(result.deathPositionSamples.map((sample) => sample.deathTimeSeconds), [100]);
  assert.equal(result.deathEventSource, 'stratz_stats.deathEvents');
});

test('classifies nearest-position confidence and retains unmatched deltas', () => {
  const players = fullRoster();
  players[0] = {
    ...players[0],
    stats: { killEvents: [], deathEvents: [100, 200, 300, 400, 500, 600].map((time) => ({ time })), assistEvents: [] },
    playbackData: { playerUpdatePositionEvents: [100, 201, 302, 404, 505, 606].map((time) => ({ time, x: 128, y: 128 })) }
  };

  const samples = normalizeStratzMatch({ match: { players } }).deathPositionSamples;
  assert.deepEqual(samples.map((sample) => sample.confidence), ['exact', 'high', 'medium', 'low', 'low', 'unmatched']);
  assert.equal(samples[5].deltaSeconds, 6);
  assert.equal(samples[5].rawX, undefined);
});

test('skips the nearest timestamp when it has no usable coordinate pair', () => {
  const players = fullRoster();
  players[0] = {
    ...players[0],
    stats: { killEvents: [], deathEvents: [{ time: 100 }], assistEvents: [] },
    playbackData: { playerUpdatePositionEvents: [{ time: 100 }, { time: 101, x: 130, y: 126 }] }
  };

  const [sample] = normalizeStratzMatch({ match: { players } }).deathPositionSamples;
  assert.equal(sample.deltaSeconds, 1);
  assert.equal(sample.confidence, 'high');
  assert.equal(sample.rawX, 130);
  assert.equal(sample.rawY, 126);
});

test('leaves death and farm events unmatched when nearby positions have incomplete coordinates', () => {
  const players = fullRoster();
  players[0] = {
    ...players[0],
    stats: { killEvents: [], deathEvents: [{ time: 100 }], assistEvents: [] },
    playbackData: {
      playerUpdatePositionEvents: [{ time: 100, x: 128 }, { time: 101, y: 128 }],
      csEvents: [{ time: 100 }],
      goldEvents: [{ time: 101 }]
    }
  };

  const result = normalizeStratzMatch({ match: { players } });
  assert.equal(result.deathPositionSamples[0].confidence, 'unmatched');
  assert.equal(result.deathPositionSamples[0].rawX, undefined);
  assert.deepEqual(result.farmPositionSamples.map((sample) => sample.rawX), [undefined, undefined]);
});
