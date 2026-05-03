import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function BuildBranchesCard({ branches }: { branches: PreGameAnalysis['buildBranches'] }) {
  return (
    <section className="card">
      <h3>Build Branches</h3>
      {branches.map((b) => (
        <div key={b.tag} style={{ marginBottom: '0.75rem' }}>
          <strong>{b.title}</strong>
          <p className="muted">{b.when}</p>
          <p>{b.items.join(' → ')}</p>
        </div>
      ))}
    </section>
  );
}
