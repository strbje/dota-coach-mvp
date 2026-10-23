'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import type { MatchReview, PostMatchAnalysis } from '@/lib/dota/types/domain';
import { formatGameTime } from '@/lib/dota/constants/items';
import { allEventFilters, clusterEvents, resourceSegments, revealEvidence, timelineDomain, type EvidenceRequest, type EventFilters, type TimelineSelection } from '@/lib/dota/analyze/timelinePresentation';
import { ItemIcon } from './ItemTimeline';
import styles from './postMatch.module.css';

const eventLabels: Record<keyof EventFilters, string> = { item: 'Покупки', death: 'Мои смерти', objective: 'Объекты', lane: 'Линия к 10:00' };
const eventSymbols = { item: '◆', death: '×', objective: '⚑', lane: '10′' };

export function MatchContextTimeline({ review, items, durationSeconds, evidence }: { review: MatchReview; items: PostMatchAnalysis['itemTimings']; durationSeconds: number; evidence?: EvidenceRequest }) {
  const [metric, setMetric] = useState<'gold' | 'xp'>('gold');
  const [filters, setFilters] = useState<EventFilters>(allEventFilters);
  const [selection, setSelection] = useState<TimelineSelection>();
  const [focusId, setFocusId] = useState<string>();
  const [width, setWidth] = useState(260);
  const plot = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const listId = useId();
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!evidence) return;
    setFilters((previous) => revealEvidence(review.timeline, previous, evidence).filters);
    const revealed = revealEvidence(review.timeline, allEventFilters, evidence);
    setSelection(revealed.selection);
    setFocusId(revealed.focusId);
  }, [evidence, review.timeline]);
  useEffect(() => {
    if (!focusId) return;
    const target = document.getElementById(focusId);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center' });
    setFocusId(undefined);
  }, [focusId, selection, filters]);

  const domain = timelineDomain(review, durationSeconds);
  const availableMetric = review.advantage.some((p) => p[metric] !== undefined) ? metric : metric === 'gold' ? 'xp' : 'gold';
  const segments = resourceSegments(review.advantage, availableMetric);
  const points = segments.flat();
  const extent = Math.max(1, ...points.map((point) => Math.abs(point[availableMetric]!)));
  const position = (time: number) => (time - domain.from) / (domain.to - domain.from);
  const x = (time: number) => 800 * position(time);
  const y = (value: number) => 100 - value / extent * 85;
  const visibleEvents = review.timeline.filter((event) => filters[event.kind]);
  const clusters = clusterEvents(visibleEvents, domain, width);
  const initial = clusters[0];
  const range = selection ?? (initial ? { from: initial.events[0].timeSeconds, to: initial.events.at(-1)!.timeSeconds } : undefined);
  const selected = range ? visibleEvents.filter((event) => event.timeSeconds >= range.from && event.timeSeconds <= range.to) : [];
  const itemFor = (id: string) => items.find((item) => `item-${item.key}` === id);
  function choose(from: number, to: number, id = listId) {
    setSelection({ from, to });
    setFocusId(id);
  }
  return <div id="team-advantage" tabIndex={-1}>
    <Panel className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <h2 id={titleId}>Как менялась игра</h2>
        <div className={styles.chartSwitch} role="group" aria-label="Показатель команды">
          {(['gold', 'xp'] as const).map((value) => <Button key={value} type="button" variant="secondary" aria-pressed={availableMetric === value && points.length > 0} disabled={!review.advantage.some((p) => p[value] !== undefined)} onClick={() => setMetric(value)}>{value === 'gold' ? 'Золото' : 'Опыт'}</Button>)}
        </div>
      </div>
      <div className={styles.eventFilters} role="group" aria-label="События на шкале">
        {(Object.keys(eventLabels) as Array<keyof EventFilters>).map((kind) => <label key={kind}><input type="checkbox" checked={filters[kind]} onChange={(event) => setFilters({ ...filters, [kind]: event.target.checked })} />{eventLabels[kind]}</label>)}
      </div>
      {points.length ? <div className={styles.chartLabels}><span>+{Math.round(extent).toLocaleString('ru-RU')} · ваша команда впереди</span><span>Разница {availableMetric === 'gold' ? 'золота' : 'опыта'}</span></div> : <p className="muted">В этом разборе нет подтверждённой временной шкалы ресурсов команд. Известные события доступны на оси и в списке.</p>}
      <div className={styles.plotInset}>
        <div ref={plot} className={styles.plot}>
          {points.length ? <svg viewBox="0 0 800 200" preserveAspectRatio="none" role="img" aria-labelledby={titleId} className={styles.chart}>
            <desc>Разница {availableMetric === 'gold' ? 'золота' : 'опыта'} относительно соперника. Выше нуля — ваша команда впереди. Разрывы означают отсутствие минутных данных. Точные числа доступны в таблице; значения под событиями не вычисляются.</desc>
            {range ? <rect x={x(range.from)} width={Math.max(2, x(range.to) - x(range.from))} y="0" height="200" className={styles.selectedRange} /> : null}
            <line x1="0" y1="100" x2="800" y2="100" className={styles.chartZero} />
            {segments.map((segment, index) => segment.length === 1
              ? <circle key={index} cx={x(segment[0].timeSeconds)} cy={y(segment[0][availableMetric]!)} r="3" className={styles.chartPoint} />
              : <polyline key={index} points={segment.map((point) => `${x(point.timeSeconds)},${y(point[availableMetric]!)}`).join(' ')} className={styles.chartLine} vectorEffect="non-scaling-stroke" />)}
          </svg> : null}
          <div className={styles.eventTrack} role="group" aria-label="Отметки событий">
            {clusters.map((cluster) => {
              const first = cluster.events[0];
              const last = cluster.events.at(-1)!;
              const item = itemFor(first.id);
              const active = selected.some((event) => cluster.events.includes(event));
              const label = cluster.events.length === 1 ? `${formatGameTime(first.timeSeconds)} · ${first.label}` : `${formatGameTime(first.timeSeconds)}–${formatGameTime(last.timeSeconds)} · событий: ${cluster.events.length}`;
              return <Button key={first.id} type="button" variant="secondary" className={styles.eventMarker} style={{ left: `${position(cluster.time) * 100}%` }} aria-label={label} aria-pressed={active} aria-controls={listId} onClick={() => choose(first.timeSeconds, last.timeSeconds)}>
                {cluster.events.length > 1 ? <span>{cluster.events.length}</span> : item ? <ItemIcon key={item.iconUrl ?? item.key} item={item} /> : <span aria-hidden="true">{eventSymbols[first.kind]}</span>}
              </Button>;
            })}
          </div>
        </div>
        <div className={styles.chartLabels}><span>{formatGameTime(domain.from)}</span><span>{formatGameTime((domain.from + domain.to) / 2)}</span><span>{formatGameTime(domain.to)}</span></div>
      </div>
      <p className={styles.note}>Нажми на отметку или группу событий. Разрыв линии — нет минутных данных; ниже нуля — соперник впереди. Соседство событий не устанавливает причину.</p>
      <section id={listId} tabIndex={-1} className={styles.selectedEvents} aria-label="Выбранный отрезок">
        <h3>{range ? `${formatGameTime(range.from)}${range.to !== range.from ? `–${formatGameTime(range.to)}` : ''} · события ${selected.length}` : 'События'}</h3>
        {selected.length ? <ol className={styles.timeline}>{selected.map((event) => {
          const item = itemFor(event.id);
          return <li id={event.id} tabIndex={-1} key={event.id}><time>{formatGameTime(event.timeSeconds)}</time>{item ? <ItemIcon key={item.iconUrl ?? item.key} item={item} /> : <span className={styles.eventSymbol} aria-hidden="true">{eventSymbols[event.kind]}</span>}<div><strong>{event.label}</strong>{event.detail ? <span className={styles.note}>{event.detail}</span> : null}</div></li>;
        })}</ol> : <p className="muted">{!review.timeline.length ? 'Таймкоды событий недоступны. Это не означает, что смертей или покупок не было.' : !visibleEvents.length ? 'Все события скрыты фильтрами.' : 'В выбранном отрезке нет событий включённых типов. Выбери другую отметку.'}</p>}
      </section>
      {visibleEvents.length ? <details className={styles.more}>
        <summary>Все события по фильтрам · {visibleEvents.length}</summary>
        <ul className={styles.eventIndex}>{visibleEvents.map((event) => <li key={event.id}><Button type="button" variant="ghost" onClick={() => choose(event.timeSeconds, event.endSeconds ?? event.timeSeconds, event.id)}>{formatGameTime(event.timeSeconds)} · {event.label}</Button></li>)}</ul>
      </details> : null}
      {review.advantage.length ? <details className={styles.more}>
        <summary>Точные значения по времени</summary>
        <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.note}>Разница ресурсов твоей команды и соперника. Пропуск — нет данных.</caption><thead><tr><th scope="col">Время</th><th scope="col">Золото</th><th scope="col">Опыт</th></tr></thead><tbody>{review.advantage.map((point) => <tr key={point.timeSeconds}><th scope="row">{formatGameTime(point.timeSeconds)}</th><td>{point.gold?.toLocaleString('ru-RU') ?? '—'}</td><td>{point.xp?.toLocaleString('ru-RU') ?? '—'}</td></tr>)}</tbody></table></div>
      </details> : null}
    </Panel>
  </div>;
}
