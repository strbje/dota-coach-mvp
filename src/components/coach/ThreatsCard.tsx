import { Panel } from '@/components/ui';
export function ThreatsCard({ threats }: { threats: string[] }) {
  return (
    <Panel>
      <h3>Главные угрозы</h3>
      <ul>{threats.map((t) => <li key={t}>{t}</li>)}</ul>
    </Panel>
  );
}
