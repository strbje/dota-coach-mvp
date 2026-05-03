import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Dota Coach MVP</h1>
      <p className="muted">Deterministic coaching for Lifestealer carry in two scenarios: pre-game planning and post-match review.</p>
      <div className="grid grid-2">
        <article className="card">
          <h2>Pre-Game Assistant</h2>
          <p>Input lane setup and draft names to get a deterministic plan.</p>
          <Link href="/pre-game">Open flow →</Link>
        </article>
        <article className="card">
          <h2>Post-Match Coach</h2>
          <p>Analyze one match via OpenDota with rule-driven feedback.</p>
          <Link href="/post-match">Open flow →</Link>
        </article>
      </div>
      <p style={{ marginTop: '1rem' }}><Link href="/debug">Developer debug page</Link></p>
    </main>
  );
}
