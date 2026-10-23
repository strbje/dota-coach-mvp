'use client';

import { useId, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import type { MatchReview } from '@/lib/dota/types/domain';
import { formatGameTime } from '@/lib/dota/constants/items';
import styles from './postMatch.module.css';

export function MatchContextTimeline({ review }: { review: MatchReview }) {
  const [metric, setMetric] = useState<'gold' | 'xp'>('gold');
  const titleId = useId();
  const availableMetric = review.advantage.some((p) => p[metric] !== undefined) ? metric : metric === 'gold' ? 'xp' : 'gold';
  const points = review.advantage.filter((point) => point[availableMetric] !== undefined);
  const first = points[0];
  const last = points.at(-1);
  const extent = Math.max(1, ...points.map((point) => Math.abs(point[availableMetric]!)));
  const x = (time: number) => 10 + 780 * (time - (first?.timeSeconds ?? 0)) / Math.max(1, (last?.timeSeconds ?? 0) - (first?.timeSeconds ?? 0));
  const y = (value: number) => 100 - value / extent * 85;
  const segments: string[] = [];
  points.forEach((point, index) => {
    const position = `${x(point.timeSeconds)},${y(point[availableMetric]!)}`;
    if (index === 0 || point.timeSeconds - points[index - 1].timeSeconds > 60) segments.push(position);
    else segments[segments.length - 1] += ` ${position}`;
  });
  return <>
    <div id="team-advantage" tabIndex={-1}>
      <Panel className={styles.chartPanel}>
        <div className={styles.chartHeader}>
          <h2 id={titleId}>Как менялась игра</h2>
          <div className={styles.chartSwitch} role="group" aria-label="Показатель команды">
            <Button type="button" variant="secondary" aria-pressed={availableMetric === 'gold'} disabled={!review.advantage.some((p) => p.gold !== undefined)} onClick={() => setMetric('gold')}>Золото</Button>
            <Button type="button" variant="secondary" aria-pressed={availableMetric === 'xp'} disabled={!review.advantage.some((p) => p.xp !== undefined)} onClick={() => setMetric('xp')}>Опыт</Button>
          </div>
        </div>
        {first && last ? <>
          <div className={styles.chartLabels}><span>+{Math.round(extent).toLocaleString('ru-RU')} · ваша команда впереди</span><span>Разница {availableMetric === 'gold' ? 'золота' : 'опыта'}</span></div>
          <svg viewBox="0 0 800 200" preserveAspectRatio="none" role="img" aria-labelledby={titleId} className={styles.chart}>
            <desc>Разница {availableMetric === 'gold' ? 'золота' : 'опыта'} относительно соперника с {formatGameTime(first.timeSeconds)} по {formatGameTime(last.timeSeconds)}. Положительные значения — преимущество вашей команды. Точные числа доступны в таблице.</desc>
            <line x1="0" y1="100" x2="800" y2="100" className={styles.chartZero} />
            {segments.map((segment, index) => <polyline key={index} points={segment} className={styles.chartLine} vectorEffect="non-scaling-stroke" />)}
            {points.length === 1 ? <circle cx={x(first.timeSeconds)} cy={y(first[availableMetric]!)} r="3" className={styles.chartPoint} /> : null}
          </svg>
          <div className={styles.chartLabels}><span>{formatGameTime(first.timeSeconds)}</span><span>0 — равенство · ниже — соперник впереди</span><span>{formatGameTime(last.timeSeconds)}</span></div>
          <details className={styles.more}>
            <summary>Точные значения по времени</summary>
            <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.note}>Разница ресурсов твоей команды и соперника</caption><thead><tr><th>Время</th><th>Золото</th><th>Опыт</th></tr></thead><tbody>{review.advantage.map((point) => <tr key={point.timeSeconds}><td>{formatGameTime(point.timeSeconds)}</td><td>{point.gold?.toLocaleString('ru-RU') ?? '—'}</td><td>{point.xp?.toLocaleString('ru-RU') ?? '—'}</td></tr>)}</tbody></table></div>
          </details>
        </> : <p className="muted">В этом разборе нет подтверждённой временной шкалы ресурсов команд. Доступные события показаны ниже.</p>}
      </Panel>
    </div>
    <Panel>
      <h2>События по времени</h2>
      <p className={styles.note}>Покупки, твои смерти и объекты. Соседство событий не устанавливает причину.</p>
      {review.timeline.length ? <details className={styles.more} open={review.timeline.length <= 8}>
        <summary>Открыть события · {review.timeline.length}</summary>
        <ol className={styles.timeline}>{review.timeline.map((event) => <li id={event.id} tabIndex={-1} key={event.id}>
          <time>{formatGameTime(event.timeSeconds)}</time><div><strong>{event.label}</strong>{event.detail ? <span className={styles.note}>{event.detail}</span> : null}</div>
        </li>)}</ol>
      </details> : <p className="muted">Таймкоды событий пока недоступны.</p>}
    </Panel>
  </>;
}
