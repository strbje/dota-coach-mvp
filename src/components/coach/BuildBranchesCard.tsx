import { Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function BuildBranchesCard({ branches }: { branches: PreGameAnalysis['buildBranches'] }) {
  return (
    <Panel>
      <h3>Варианты сборки</h3>
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
