import type { PostMatchAnalysis } from '@/lib/dota/types/domain';

export function GradesGrid({ grades }: { grades: PostMatchAnalysis['grades'] }) {
  const entries = Object.entries(grades);
  return (
    <section className="card">
      <h3>Grades</h3>
      <div className="grid grid-2">
        {entries.map(([label, grade]) => (
          <article key={label} className="card">
            <h4 style={{ textTransform: 'capitalize', marginBottom: '0.4rem' }}>{label}: {grade.score}</h4>
            <ul>{grade.findings.map((f) => <li key={f}>{f}</li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  );
}
