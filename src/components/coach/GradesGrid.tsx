import { Panel } from '@/components/ui';
import { formatBenchmarkPosition } from '@/lib/dota/analyze/compareToBenchmarks';
import styles from './postMatch.module.css';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

type GradeTone = 'critical' | 'weak' | 'average' | 'ok' | 'good' | 'excellent';
type GradeLevel = {
  label: string;
  className: string;
  tone: GradeTone;
  description: string;
};

const GRADE_LABELS: Record<string, string> = {
  lane: 'Линия',
  items: 'Предметы',
  fights: 'Урон по героям',
  map: 'Фарм и экономика'
};

export function getGradeLevel(score: number): GradeLevel {
  if (score <= 39) return { label: 'Плохо', className: 'grade-critical', tone: 'critical', description: 'Критический провал' };
  if (score <= 54) return { label: 'Слабовато', className: 'grade-weak', tone: 'weak', description: 'Ниже ожидаемого' };
  if (score <= 64) return { label: 'Средне', className: 'grade-average', tone: 'average', description: 'Нужна стабильность' };
  if (score <= 74) return { label: 'Нормально', className: 'grade-ok', tone: 'ok', description: 'Рабочий уровень' };
  if (score <= 84) return { label: 'Хорошо', className: 'grade-good', tone: 'good', description: 'Уверенный темп' };
  return { label: 'Отлично', className: 'grade-excellent', tone: 'excellent', description: 'Сильное исполнение' };
}

export function GradesGrid({ grades, benchmarkSummary, hero, categories = ['fights', 'map'] }: Pick<PostMatchAnalysis, 'grades' | 'benchmarkSummary' | 'hero'> & { categories?: Array<'fights' | 'map'> }) {
  const visible = Object.entries(grades).filter(([key, grade]) => categories.includes(key as 'fights' | 'map') && grade.score !== undefined);
  if (!visible.length) return null;
  return <section aria-label="Оценки" className={`grid grid-2 ${styles.grades}`}>
    {visible.map(([key, grade]) => {
      const keys = key === 'fights' ? ['heroDamagePerMin'] as const : key === 'map' ? ['gpm', 'lhPerMin'] as const : [];
      const labels = { heroDamagePerMin: 'урона в минуту', gpm: 'золота в минуту', lhPerMin: 'добиваний в минуту' };
      return <Panel as="article" key={key} className={styles.gradeCompact}>
        <h3>{GRADE_LABELS[key]}</h3>
        {keys.map((metricKey) => {
          const metric = benchmarkSummary?.metrics[metricKey];
          return metric ? <div key={metricKey}><p className={styles.gradeValue}><strong>{metric.actual.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} <span className={styles.gradeOutOf}>{labels[metricKey]}</span></strong></p><p className={styles.note}>{formatBenchmarkPosition(metric.lowerPercentile, metric.upperPercentile) ?? 'Сравнение недоступно'}</p></div> : null;
        })}
        <details><summary>Как сравниваем</summary>
          <p className={styles.note}>Выборка матчей на {hero}; без подбора по рейтингу, роли, патчу и длительности.</p>
          <p>{key === 'fights' ? 'Урон не оценивает выбор цели, контроль и качество решений в драке.' : 'Доход и добивания показываем отдельно: высокий темп добиваний не обязательно означает высокий доход.'}</p>
          <p className={styles.note}>Расчётный индекс: {grade.score}/100.{key === 'map' ? ' Среднее индексов дохода и добиваний.' : ' По положению урона в выборке.'} Это не оценка всех твоих действий.</p>
          <ul>{grade.findings.slice(0, 3).map((finding) => <li key={finding.text}>{finding.text}</li>)}</ul>
        </details>
      </Panel>;
    })}
  </section>;
}
