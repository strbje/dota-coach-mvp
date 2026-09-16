export function compareItemTiming(actualSeconds?: number, benchmarkSeconds?: number): 'early' | 'onTime' | 'late' | 'unknown' {
  if (typeof actualSeconds !== 'number' || typeof benchmarkSeconds !== 'number') return 'unknown';
  if (actualSeconds <= benchmarkSeconds - 60) return 'early';
  if (actualSeconds <= benchmarkSeconds + 90) return 'onTime';
  return 'late';
}
