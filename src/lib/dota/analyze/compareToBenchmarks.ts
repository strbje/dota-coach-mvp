export type PercentileBucket = { percentile: number; value: number };

export type BenchmarkLabel = 'Ниже среднего' | 'Средний уровень' | 'Выше среднего' | 'Очень высокий' | 'Элитный уровень';

function displayPercentile(percentile: number): number {
  return Math.round(percentile <= 1 ? percentile * 100 : percentile);
}

export function getPercentileForValue(metricBuckets: PercentileBucket[] | undefined, actualValue: number): {
  percentileRange: string;
  lowerPercentile?: number;
  upperPercentile?: number;
  nearestLower?: PercentileBucket;
  nearestUpper?: PercentileBucket;
  label: BenchmarkLabel;
} {
  if (!Array.isArray(metricBuckets) || metricBuckets.length === 0 || !Number.isFinite(actualValue)) {
    return { percentileRange: 'n/a', label: 'Ниже среднего' };
  }

  const sorted = [...metricBuckets]
    .filter((it) => Number.isFinite(it.percentile) && Number.isFinite(it.value))
    .sort((a, b) => a.percentile - b.percentile);

  if (!sorted.length) return { percentileRange: 'n/a', label: 'Ниже среднего' };

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

  const lower = nearestLower ? displayPercentile(nearestLower.percentile) : undefined;
  const upper = nearestUpper ? displayPercentile(nearestUpper.percentile) : undefined;
  const percentileRange = lower !== undefined && upper !== undefined ? `${lower}-${upper}` : lower !== undefined ? `${lower}+` : `<${upper ?? displayPercentile(sorted[0].percentile)}`;
  const effective = lower ?? 0;
  const label: BenchmarkLabel = effective >= 95 ? 'Элитный уровень' : effective >= 90 ? 'Очень высокий' : effective >= 70 ? 'Выше среднего' : effective >= 50 ? 'Средний уровень' : 'Ниже среднего';

  return { percentileRange, lowerPercentile: lower, upperPercentile: upper, nearestLower, nearestUpper, label };
}

export function formatPercentileRange(lowerPercentile?: number, upperPercentile?: number): string | null {
  if (lowerPercentile !== undefined && upperPercentile !== undefined) {
    return `между ${lowerPercentile}-м и ${upperPercentile}-м перцентилем`;
  }
  if (lowerPercentile !== undefined) return `${lowerPercentile}-й перцентиль или выше`;
  if (upperPercentile !== undefined) return `ниже ${upperPercentile}-го перцентиля`;
  return null;
}
