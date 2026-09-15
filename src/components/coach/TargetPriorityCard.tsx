import { Panel } from '@/components/ui';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export function TargetPriorityCard({ targetPriority }: { targetPriority: PreGameAnalysis['targetPriority'] }) {
  return (
    <Panel>
      <h3>Приоритет целей</h3>
      <p><strong>Основные цели:</strong> {targetPriority.primary.join(', ')}</p>
      <p><strong>Не начинать с:</strong> {targetPriority.avoidOpeningOn.join(', ')}</p>
      <p><strong>Подсказки:</strong> {targetPriority.notes.join(', ')}</p>
    </Panel>
  );
}
