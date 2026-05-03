import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function StagePlanCard({ stagePlan }: { stagePlan: PreGameAnalysis['stagePlan'] }) {
  return (
    <section className="card">
      <h3>Stage Plan</h3>
      {stagePlan.map((stage) => (
        <div key={stage.stage}>
          <div className="badge">{stage.stage}</div>
          <ul>{stage.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
        </div>
      ))}
    </section>
  );
}
