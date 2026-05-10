import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

type GradeLevel = { label: string; className: string; description: string; };
const GRADE_LABELS: Record<string, string> = { lane: 'Линия', items: 'Предметы', fights: 'Драки', map: 'Фарм и карта' };

export function getGradeLevel(score: number): GradeLevel {
  if (score <= 39) return { label: 'Плохо', className: 'grade-critical', description: 'Критический провал' };
  if (score <= 54) return { label: 'Слабовато', className: 'grade-weak', description: 'Ниже ожидаемого' };
  if (score <= 64) return { label: 'Средне', className: 'grade-average', description: 'Нужна стабильность' };
  if (score <= 74) return { label: 'Нормально', className: 'grade-ok', description: 'Рабочий уровень' };
  if (score <= 84) return { label: 'Хорошо', className: 'grade-good', description: 'Уверенный темп' };
  return { label: 'Отлично', className: 'grade-excellent', description: 'Сильное исполнение' };
}

export function GradesGrid({ grades }: { grades: PostMatchAnalysis['grades'] }) {
  return <section className="card"><h3>Оценки</h3><div className="grid grid-2">{Object.entries(grades).map(([key, grade]) => {
    const level = getGradeLevel(grade.score);
    return <article key={key} className={`card grade-card ${level.className}`}><div className="grade-head"><h4>{GRADE_LABELS[key] ?? key}</h4><span className={`badge ${level.className}`}>{level.label}</span></div><div className={`grade-score ${level.className}`}>{grade.score}</div><div className={`grade-bar ${level.className}`}><span style={{ width: `${grade.score}%` }} /></div><p className="muted" style={{ marginBottom: '0.75rem' }}>{grade.summary ?? level.description}</p><ul>{grade.findings.slice(0, 3).map((f) => <li key={`${f.text}-${f.severity}`}>{f.text}</li>)}</ul></article>;
  })}</div></section>;
}
