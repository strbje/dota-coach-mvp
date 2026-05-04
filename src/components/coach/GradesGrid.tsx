import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

type GradeLevel = {
  label: string;
  className: string;
  description: string;
};

const GRADE_LABELS: Record<string, string> = {
  lane: 'Линия',
  items: 'Предметы',
  fights: 'Драки',
  map: 'Фарм и карта'
};

export function getGradeLevel(score: number): GradeLevel {
  if (score <= 39) return { label: 'Плохо', className: 'grade-critical', description: 'Критическая просадка' };
  if (score <= 59) return { label: 'Ниже нормы', className: 'grade-weak', description: 'Нужно подтянуть' };
  if (score <= 74) return { label: 'Нормально', className: 'grade-average', description: 'Рабочий уровень' };
  if (score <= 89) return { label: 'Хорошо', className: 'grade-good', description: 'Стабильный темп' };
  return { label: 'Отлично', className: 'grade-excellent', description: 'Сильное исполнение' };
}

export function GradesGrid({ grades }: { grades: PostMatchAnalysis['grades'] }) {
  const entries = Object.entries(grades);
  return (
    <section className="card">
      <h3>Оценки</h3>
      <div className="grid grid-2">
        {entries.map(([key, grade]) => {
          const level = getGradeLevel(grade.score);
          return (
            <article key={key} className={`card grade-card ${level.className}`}>
              <div className="grade-head">
                <h4>{GRADE_LABELS[key] ?? key}</h4>
                <span className={`badge ${level.className}`}>{level.label}</span>
              </div>
              <div className="grade-score">{grade.score}</div>
              <p className="muted" style={{ marginBottom: '0.75rem' }}>{level.description}</p>
              <ul>
                {grade.findings.map((f) => (
                  <li key={`${f.text}-${f.severity}`}>
                    {f.text}
                    {f.evidence.length ? <div style={{ opacity: 0.8 }}>Основание: {f.evidence.join(' · ')}</div> : null}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
