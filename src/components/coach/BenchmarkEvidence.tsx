import { Panel } from '@/components/ui';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { formatBenchmarkPosition } from '@/lib/dota/analyze/compareToBenchmarks';

const METRIC_LABELS: Record<string, { name: string; suffix: string; digits?: number }> = {
  gpm: { name: 'золота в минуту', suffix: '' },
  xpm: { name: 'опыта в минуту', suffix: '' },
  lhPerMin: { name: 'добиваний в минуту', suffix: '', digits: 2 },
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
    <h3>Сравнение с матчами на {hero}</h3>
    <p className="muted">Сравниваем с выборкой OpenDota на том же герое. Она не подобрана под твой рейтинг, роль, длительность или патч. Это сравнение результатов, а не обязательная норма.</p>
    {metrics.length ? <ul>{metrics.map(([key, metric]) => {
      if (!metric) return null;
      const copy = METRIC_LABELS[key] ?? { name: key, suffix: '' };
      const percentileCopy = formatBenchmarkPosition(metric.lowerPercentile, metric.upperPercentile);
      if (!percentileCopy) return null;
      return <li key={key}><strong>{formatValue(metric.actual, copy.digits)} {copy.name}</strong> — {percentileCopy}.</li>;
    })}</ul> : null}
  </Panel>;
}
