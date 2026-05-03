import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function TargetPriorityCard({ targetPriority }: { targetPriority: PreGameAnalysis['targetPriority'] }) {
  return (
    <section className="card">
      <h3>Target Priority</h3>
      <p><strong>Primary:</strong> {targetPriority.primary.join(', ')}</p>
      <p><strong>Avoid opening on:</strong> {targetPriority.avoidOpeningOn.join(', ')}</p>
      <p><strong>Notes:</strong> {targetPriority.notes.join(', ')}</p>
    </section>
  );
}
