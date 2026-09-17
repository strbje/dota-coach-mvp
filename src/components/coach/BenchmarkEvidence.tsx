import { Panel } from '@/components/ui';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { formatPercentileRange } from '@/lib/dota/analyze/compareToBenchmarks';

const METRIC_LABELS: Record<string, { name: string; suffix: string; digits?: number }> = {
  gpm: { name: 'GPM', suffix: '' },
  xpm: { name: 'XPM', suffix: '' },
  lhPerMin: { name: 'LH/мин', suffix: '', digits: 2 },
  heroDamagePerMin: { name: 'Урон по героям/мин', suffix: '', digits: 1 },
  towerDamage: { name: 'Урон по строениям', suffix: '' },
  killsPerMin: { name: 'Убийства/мин', suffix: '', digits: 2 }
};

function formatValue(value: number, digits = 0) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

export function BenchmarkEvidence({
  benchmarkSummary,
  hero
}: Pick<PostMatchAnalysis, 'benchmarkSummary' | 'hero'>) {
  const metrics = Object.entries(benchmarkSummary?.metrics ?? {}).filter(([, metric]) => metric && metric.percentileRange !== 'n/a');

  if (!metrics.length) return null;

  return <Panel>
    <h3>Ориентиры по герою</h3>
    {metrics.length ? <ul>{metrics.map(([key, metric]) => {
      if (!metric) return null;
      const copy = METRIC_LABELS[key] ?? { name: key, suffix: '' };
      const percentileCopy = formatPercentileRange(metric.lowerPercentile, metric.upperPercentile);
      if (!percentileCopy) return null;
      return <li key={key}><strong>{formatValue(metric.actual, copy.digits)} {copy.name}</strong> — {percentileCopy} для {hero}. {metric.label}.</li>;
    })}</ul> : null}
  </Panel>;
}
