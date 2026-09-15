import { Badge, Panel } from '@/components/ui';
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
  map: 'Фарм и карта'
};

export function getGradeLevel(score: number): GradeLevel {
  if (score <= 39) return { label: 'Плохо', className: 'grade-critical', tone: 'critical', description: 'Критический провал' };
  if (score <= 54) return { label: 'Слабовато', className: 'grade-weak', tone: 'weak', description: 'Ниже ожидаемого' };
  if (score <= 64) return { label: 'Средне', className: 'grade-average', tone: 'average', description: 'Нужна стабильность' };
  if (score <= 74) return { label: 'Нормально', className: 'grade-ok', tone: 'ok', description: 'Рабочий уровень' };
  if (score <= 84) return { label: 'Хорошо', className: 'grade-good', tone: 'good', description: 'Уверенный темп' };
  return { label: 'Отлично', className: 'grade-excellent', tone: 'excellent', description: 'Сильное исполнение' };
}

export function GradesGrid({ grades }: { grades: PostMatchAnalysis['grades'] }) {
  return (
    <Panel>
      <h3>Оценки</h3>
      <div className="grid grid-2">
        {Object.entries(grades).map(([key, grade]) => {
          const level = getGradeLevel(grade.score);

          return (
            <Panel as="article" key={key} className={`grade-card ${level.className}`}>
              <div className="grade-head">
                <h4>{GRADE_LABELS[key] ?? key}</h4>
                <Badge tone={level.tone}>{level.label}</Badge>
              </div>
              <div className={`grade-score ${level.className}`}>{grade.score}</div>
              <div className={`grade-bar ${level.className}`}>
                <span style={{ width: `${grade.score}%` }} />
              </div>
              <p className="muted grade-summary">{grade.summary ?? level.description}</p>
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
