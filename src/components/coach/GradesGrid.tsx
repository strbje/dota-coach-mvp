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
  return (
    <Panel>
      <h3>Оценки</h3>
      <div className={`grid grid-2 ${styles.grades}`}>
        {Object.entries(grades).filter(([key]) => categories.includes(key as keyof typeof grades)).map(([key, grade]) => {
          const level = grade.score === undefined ? null : getGradeLevel(grade.score);

          if (!level) return <details key={key} className={styles.more}><summary>{GRADE_LABELS[key]} · наблюдения</summary><p className="muted">{grade.summary}</p><ul>{grade.findings.map((finding) => <li key={finding.text}>{finding.text}</li>)}</ul></details>;
          return (
            <Panel as="article" key={key} className={`grade-card ${level?.className ?? ''}`}>
              <div className="grade-head">
                <h4>{GRADE_LABELS[key] ?? key}</h4>
                {level ? <Badge tone={level.tone}>{level.label}</Badge> : <Badge tone="unknown">Без оценки</Badge>}
              </div>
              {level ? <><div className={`grade-score ${level.className}`}>{grade.score}</div>
              <div className={`grade-bar ${level.className}`} aria-label={`Оценка: ${grade.score} из 100`}>
                <span style={{ width: `${grade.score}%` }} />
              </div></> : null}
              <p className="muted grade-summary">{grade.summary ?? level?.description ?? 'Недостаточно данных для оценки.'}</p>
              <ul>
                {grade.findings.slice(0, 3).map((finding) => (
                  <li key={`${finding.text}-${finding.severity}`}>{finding.text}</li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </Panel>
  );
}
