import { Badge, Panel } from '@/components/ui';
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
  fights: 'Драки',
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

export function GradesGrid({ grades, categories = ['lane', 'items', 'fights', 'map'] }: { grades: PostMatchAnalysis['grades']; categories?: Array<keyof PostMatchAnalysis['grades']> }) {
  const visible = Object.entries(grades).filter(([key, grade]) => categories.includes(key as keyof typeof grades) && grade.score !== undefined);
  if (!visible.length) return null;
  return <section aria-label="Оценки" className={`grid grid-2 ${styles.grades}`}>
    {visible.map(([key, grade]) => {
      const level = getGradeLevel(grade.score!);
      return <Panel as="article" key={key} className={styles.gradeCompact}>
        <h3>{GRADE_LABELS[key]}</h3>
        <div className={styles.gradeValue}><strong><span>{grade.score}</span><span className={styles.gradeOutOf}> / 100</span></strong><Badge tone={level.tone}>{level.label}</Badge></div>
        <div className={`grade-bar ${level.className}`} aria-label={`Оценка: ${grade.score} из 100`}><span style={{ width: `${grade.score}%` }} /></div>
        <p className={styles.note}>{grade.summary}</p>
        <details><summary>Из чего складывается оценка</summary><ul>{grade.findings.slice(0, 3).map((finding) => <li key={finding.text}>{finding.text}</li>)}</ul><p className={styles.note}>Сравнение показателей на том же герое. Оценка не определяет качество отдельных решений.</p></details>
      </Panel>;
    })}
  </section>;
}
