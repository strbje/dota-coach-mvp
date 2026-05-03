export function ThreatsCard({ threats }: { threats: string[] }) {
  return (
    <section className="card">
      <h3>Top Threats</h3>
      <ul>{threats.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}
