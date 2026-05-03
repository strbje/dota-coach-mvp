export function CoachSummaryCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
    </section>
  );
}
