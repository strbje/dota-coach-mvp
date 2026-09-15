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
  heroAverageComparison
}: Pick<PostMatchAnalysis, 'benchmarkSummary' | 'heroAverageComparison'>) {
  const metrics = Object.entries(benchmarkSummary?.metrics ?? {}).filter(([, metric]) => metric && metric.percentileRange !== 'n/a');
  const checkpoints = heroAverageComparison?.checkpoints.filter((checkpoint) => checkpoint.actualCs !== undefined && checkpoint.averageCs !== undefined) ?? [];

  if (!metrics.length && !checkpoints.length) return null;

  return <section className="card">
    <h3>Ориентиры по герою</h3>
    {metrics.length ? <ul>{metrics.map(([key, metric]) => {
      if (!metric) return null;
      const copy = METRIC_LABELS[key] ?? { name: key, suffix: '' };
      const percentileCopy = formatPercentileRange(metric.lowerPercentile, metric.upperPercentile);
      if (!percentileCopy) return null;
      return <li key={key}><strong>{formatValue(metric.actual, copy.digits)} {copy.name}</strong> — {percentileCopy} для Lifestealer. {metric.label}.</li>;
    })}</ul> : null}
    {checkpoints.length ? <>
      <h4 style={{ marginTop: '1rem' }}>Темп фарма по ходу матча</h4>
      <ul>{checkpoints.map((checkpoint) => {
        const delta = checkpoint.deltaCs ?? 0;
        const comparison = Math.abs(delta) < 1 ? 'на уровне' : delta > 0 ? 'выше' : 'ниже';
        return <li key={checkpoint.minute}><strong>{formatValue(checkpoint.actualCs!)} LH к {checkpoint.minute}:00</strong> — {comparison} среднего ориентира STRATZ для Lifestealer Position 1: {formatValue(checkpoint.averageCs!, 1)}.</li>;
      })}</ul>
      <p className="muted" style={{ marginTop: '0.75rem' }}>Средние значения STRATZ — ориентир для сравнения темпа, а не абсолютный рейтинг игры.</p>
    </> : null}
  </section>;
}
