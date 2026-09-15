export const ITEM_TIMING_MIN_SAMPLE = 30;
export const ITEM_TIMING_STANDARD_SAMPLE = 100;

export type ItemTimingSampleSize = 'insufficient' | 'weak' | 'standard';
export type ItemTimingTimeSemantics = 'discrete_timing_point';

export type NormalizedItemTimingBucket = {
  itemKey: string;
  timeLowerBound: number;
  timeLabel: string;
  games: number;
  wins: number;
  winRate: number | null;
  sampleSize: ItemTimingSampleSize;
  timeSemantics: ItemTimingTimeSemantics;
  timeUpperBound?: number;
};

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getItemTimingSampleSize(games: number): ItemTimingSampleSize {
  if (games < ITEM_TIMING_MIN_SAMPLE) return 'insufficient';
  if (games < ITEM_TIMING_STANDARD_SAMPLE) return 'weak';
  return 'standard';
}

export function normalizeItemTimingBucket(value: unknown): NormalizedItemTimingBucket | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const itemKey = typeof raw.item === 'string' ? raw.item : typeof raw.item_name === 'string' ? raw.item_name : null;
  const time = finiteNumber(raw.time);
  const gamesValue = finiteNumber(raw.games ?? raw.match_count);
  const winsValue = finiteNumber(raw.wins);
  if (!itemKey || time === undefined || gamesValue === undefined || winsValue === undefined) return null;

  if (!Number.isInteger(gamesValue) || !Number.isInteger(winsValue) || time < 0 || gamesValue < 0 || winsValue < 0 || winsValue > gamesValue) return null;
  const games = gamesValue;
  const wins = winsValue;

  return {
    itemKey,
    timeLowerBound: time,
    timeLabel: `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`,
    games,
    wins,
    winRate: games > 0 ? wins / games : null,
    sampleSize: getItemTimingSampleSize(games),
    // OpenDota exposes `time` as the grouped timing value and publishes no interval
    // bounds. It must therefore be treated as a discrete point, not a range edge.
    timeSemantics: 'discrete_timing_point'
  };
}

export function findNearestUsableItemTimingBucket(
  buckets: NormalizedItemTimingBucket[],
  itemKey: string,
  purchaseTimeSeconds: number
): NormalizedItemTimingBucket | undefined {
  return buckets
    .filter((bucket) => bucket.itemKey === itemKey && bucket.timeSemantics === 'discrete_timing_point' && bucket.sampleSize !== 'insufficient')
    .sort((a, b) => Math.abs(a.timeLowerBound - purchaseTimeSeconds) - Math.abs(b.timeLowerBound - purchaseTimeSeconds))[0];
}
