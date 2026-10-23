'use client';

import { useState } from 'react';
import { Panel } from '@/components/ui';
type ItemTiming = {
  key: string;
  item: string;
  time: string;
  timeSeconds: number;
  iconUrl?: string;
  source: 'purchase_log';
};

function ItemIcon({ item }: { item: ItemTiming }) {
  const [failed, setFailed] = useState(false);
  return item.iconUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.iconUrl} alt="" className="item-icon" loading="lazy" onError={() => setFailed(true)} />
  ) : <div className="item-fallback" aria-hidden="true">{item.item[0]}</div>;
}

export function ItemTimeline({ items, title = 'Тайминг предметов' }: { items: ItemTiming[]; title?: string }) {
  return (
    <Panel>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">OpenDota не дал надёжных данных о ключевых покупках.</p>
      ) : (
        <div className="item-timeline-grid">
          {items.map((it) => (
            <article key={it.key} className="item-timeline-card">
              <ItemIcon key={it.iconUrl ?? it.key} item={it} />
              <div>
                <div>{it.item}</div>
                <div className="muted">{it.time}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
