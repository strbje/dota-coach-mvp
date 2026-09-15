import { Badge, Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type Props = {
  stagePlan: PreGameAnalysis['stagePlan'];
  locale: Locale;
};

export function StagePlanCard({ stagePlan, locale }: Props) {
  return (
    <Panel>
      <h3>{preGameHeadings[locale].stages}</h3>
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
