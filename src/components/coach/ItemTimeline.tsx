type ItemTiming = {
  key: string;
  item: string;
  time: string;
  timeSeconds: number;
  iconUrl?: string;
  source: 'purchase_log';
};

export function ItemTimeline({ items, title = 'Тайминг предметов' }: { items: ItemTiming[]; title?: string }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">OpenDota не дал надёжных данных о ключевых покупках.</p>
      ) : (
        <div className="item-timeline-grid">
          {items.map((it) => (
            <article key={it.key} className="item-timeline-card">
              {it.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.iconUrl} alt={it.item} className="item-icon" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <div className="item-fallback">{it.item[0]}</div>
              )}
              <div>
                <div>{it.item}</div>
                <div className="muted">{it.time}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
