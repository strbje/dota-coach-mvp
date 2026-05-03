import { normalizeDraftInput } from '@/lib/dota/adapters/normalizeDraftInput';

const sampleDraft = normalizeDraftInput({
  hero: 'Lifestealer',
  role: 'carry',
  allies: ['Lifestealer', 'Lion'],
  enemies: ['Legion Commander', 'Tusk'],
  lanes: { safe: { ally: ['Lifestealer', 'Lion'], enemy: ['Legion Commander', 'Tusk'] } }
});

export default function DebugPage() {
  return (
    <main className="container">
      <h1>Debug</h1>
      <section className="card">
        <h2>Example normalized payload</h2>
        <pre>{JSON.stringify(sampleDraft, null, 2)}</pre>
      </section>
      <section className="card">
        <h2>Provider health checks</h2>
        <p className="muted">Use <code>/api/debug/match/:id</code> to test OpenDota access quickly.</p>
      </section>
    </main>
  );
}
