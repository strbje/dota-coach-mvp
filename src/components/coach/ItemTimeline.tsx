'use client';

import { useState } from 'react';
import { Badge, Panel } from '@/components/ui';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { getGradeLevel } from './GradesGrid';
import styles from './postMatch.module.css';

type ItemTiming = {
  key: string;
  item: string;
  time: string;
  timeSeconds: number;
  iconUrl?: string;
  source: 'purchase_log';
};

export function ItemIcon({ item }: { item: ItemTiming }) {
  const [failed, setFailed] = useState(false);
  return item.iconUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.iconUrl} alt="" className="item-icon" loading="lazy" onError={() => setFailed(true)} />
  ) : <div className="item-fallback" aria-hidden="true">{item.item[0]}</div>;
}

export function ItemTimeline({ items, title = 'Тайминг предметов', grade }: { items: ItemTiming[]; title?: string; grade?: PostMatchAnalysis['grades']['items'] }) {
  const level = grade?.score === undefined ? undefined : getGradeLevel(grade.score);
  return (
    <Panel className={styles.purchases}>
      <div className="grade-head"><h3>{title}</h3>{level ? <Badge tone={level.tone}>{grade!.score}/100 · {level.label}</Badge> : null}</div>
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
      {grade && (items.length > 0 || level) ? <details className={styles.more}><summary>{level ? 'Оценка и наблюдения' : 'Что можно сказать о покупках'}</summary>
        {level ? <><p>{grade.summary}</p><ul>{grade.findings.map((finding) => <li key={finding.text}>{finding.text}</li>)}</ul></> : <>
          <p className="muted">Показаны фактические покупки. Для числовой оценки нет подтверждённого сопоставимого ориентира.</p>
          {grade.findings.filter((finding) => finding.severity !== 'info').map((finding) => <p key={finding.text}>{finding.text}</p>)}
        </>}
      </details> : null}
    </Panel>
  );
}
