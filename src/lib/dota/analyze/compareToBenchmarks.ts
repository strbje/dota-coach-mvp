type PercentileBucket = { percentile: number; value: number };

type BenchmarkLabel = 'below_average' | 'average' | 'good' | 'very_good' | 'elite';

export function getPercentileForValue(metricBuckets: PercentileBucket[] | undefined, actualValue: number): {
  percentileApprox: string;
  nearestLower?: PercentileBucket;
  nearestUpper?: PercentileBucket;
  label: BenchmarkLabel;
} {
  if (!Array.isArray(metricBuckets) || metricBuckets.length === 0 || !Number.isFinite(actualValue)) {
    return { percentileApprox: 'n/a', label: 'below_average' };
  }

  const sorted = [...metricBuckets]
    .filter((it) => Number.isFinite(it.percentile) && Number.isFinite(it.value))
    .sort((a, b) => a.percentile - b.percentile);

  if (!sorted.length) return { percentileApprox: 'n/a', label: 'below_average' };

  let nearestLower: PercentileBucket | undefined;
  let nearestUpper: PercentileBucket | undefined;
  for (const bucket of sorted) {
    if (actualValue >= bucket.value) {
      nearestLower = bucket;
      continue;
    }
    nearestUpper = bucket;
    break;
  }

  const lower = nearestLower?.percentile;
  const upper = nearestUpper?.percentile;
  const percentileApprox = lower !== undefined && upper !== undefined ? `${lower}-${upper}` : lower !== undefined ? `${lower}+` : `<${upper ?? sorted[0].percentile}`;
  const effective = lower ?? 0;
  const label: BenchmarkLabel = effective >= 90 ? 'elite' : effective >= 80 ? 'very_good' : effective >= 70 ? 'good' : effective >= 50 ? 'average' : 'below_average';

  return { percentileApprox, nearestLower, nearestUpper, label };
}
