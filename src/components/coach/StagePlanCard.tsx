import { Badge, Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function StagePlanCard({ stagePlan }: { stagePlan: PreGameAnalysis['stagePlan'] }) {
  return (
    <Panel>
      <h3>План по этапам</h3>
      {stagePlan.map((stage) => (
        <div className="subsection" key={stage.stage}>
          <Badge tone="info">{stage.stage}</Badge>
          <ul>
            {stage.goals.map((goal) => <li key={goal}>{goal}</li>)}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
