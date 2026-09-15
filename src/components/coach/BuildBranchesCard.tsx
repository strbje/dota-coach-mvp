import { Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';
import { preGameHeadings } from '@/lib/i18n/preGameCopy';
import type { Locale } from '@/lib/i18n/locales';

type Props = {
  branches: PreGameAnalysis['buildBranches'];
  locale: Locale;
};

export function BuildBranchesCard({ branches, locale }: Props) {
  const copy = preGameHeadings[locale];

  return (
    <Panel>
      <h3>{copy.branches}</h3>
      <div className="branch-list">
        {branches.map((branch) => (
          <div key={branch.tag}>
            <strong>{branch.title}</strong>
            <p className="muted">{branch.when}</p>
            <p>{branch.items.join(' → ')}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
