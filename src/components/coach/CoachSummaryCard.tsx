import { Panel } from '@/components/ui';
export function CoachSummaryCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Panel>
      <h3>{title}</h3>
      <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </Panel>
  );
}
