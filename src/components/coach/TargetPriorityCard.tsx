import { Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type Props = {
  targetPriority: PreGameAnalysis['targetPriority'];
  locale: Locale;
};

export function TargetPriorityCard({ targetPriority, locale }: Props) {
  const copy = preGameHeadings[locale];

  return (
    <Panel>
      <h3>{copy.targets}</h3>
      <p><strong>{copy.primary}</strong> {targetPriority.primary.join(', ')}</p>
      <p><strong>{copy.avoid}</strong> {targetPriority.avoidOpeningOn.join(', ')}</p>
      <p><strong>{copy.notes}</strong> {targetPriority.notes.join(', ')}</p>
    </Panel>
  );
}
