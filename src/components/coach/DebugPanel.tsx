'use client';

import { useState } from 'react';

export function DebugPanel({ data, title = 'Debug payload' }: { data: unknown; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <button type="button" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'} {title}</button>
      {open ? <pre style={{ overflowX: 'auto' }}>{JSON.stringify(data, null, 2)}</pre> : null}
    </section>
  );
}
