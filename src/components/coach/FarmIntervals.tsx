import { Button, Panel } from '@/components/ui';
import type { FarmIntervalReport } from '@/lib/dota/analyze/farmIntervals';
import { formatGameTime } from '@/lib/dota/utils/time';
import styles from './postMatch.module.css';

const pace = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const range = (from: number, to: number) => `${formatGameTime(from)}–${formatGameTime(to)}`;

export function FarmIntervals({ report, onEvidence }: { report?: FarmIntervalReport; onEvidence: (from: number, to: number, endExclusive: boolean) => void }) {
  if (!report) return null;
  const { intervals, highlightIndex } = report;
  const current = highlightIndex !== undefined ? intervals[highlightIndex] : undefined;
  const previous = highlightIndex !== undefined ? intervals[highlightIndex - 1] : undefined;
  const hasData = intervals.some((interval) => interval.lastHits !== undefined || interval.breakdown);
  if (!hasData) return <p className={styles.note}>Фарм по времени недоступен: нет пригодных минутных счётчиков или событий добиваний. Это не означает отсутствие фарма.</p>;
  const show = (index: number) => onEvidence(intervals[index].from, intervals[index].to, index < intervals.length - 1);
  return <Panel className={styles.chartPanel}>
    <h2>Фарм по времени</h2>
    {current && previous ? <div className={styles.farmObservation}>
      <h3>Стоит посмотреть {range(current.from, current.to)}</h3>
      <p>Темп: {pace(previous.perMinute!)} → {pace(current.perMinute!)} добитых крипов в минуту. Самое заметное снижение между соседними полными пятиминутками.</p>
      <p className={styles.note}>Сравни с событиями отрезка. Время могло уйти на полезную драку; само снижение не означает ошибку.</p>
      <Button type="button" variant="secondary" aria-controls="team-advantage" onClick={() => show(highlightIndex!)}>Посмотреть события отрезка</Button>
    </div> : <p className={styles.note}>Отрезок со снижением темпа не выделен: нет снижения между соседними полными пятиминутками или данных для такого сравнения недостаточно.</p>}
    <p className={styles.note}>{report.source === 'stratz' ? `События STRATZ сверены с общим числом добиваний: ${report.receivedEvents}/${report.reportedLastHits}. Учитываются и добивания подконтрольными существами.`
      : report.source === 'opendota' ? 'Число и темп — по минутным счётчикам OpenDota. Пропуски не заменяются нулями.' : 'Полного ряда для расчёта темпа нет.'}
      {report.eventCoverage === 'partial' ? ` Разбивка STRATZ неполная: получено ${report.receivedEvents} событий с пригодным временем${report.reportedLastHits !== undefined ? ` из ${report.reportedLastHits} итоговых добиваний` : '; итоговое число недоступно'}. Она не заменяет полный итог отрезка.` : ''}
      {report.rejectedEvents > 0 ? ` Событий без пригодного времени: ${report.rejectedEvents}.` : ''}
      {report.eventCoverage === 'unavailable' ? ' Разбивка по типам недоступна.' : ''}
    </p>
    <details className={styles.more}>
    <summary>Все отрезки фарма · {intervals.length}</summary>
    <ol className={styles.farmWindows} aria-label="Отрезки фарма">
      {intervals.map((interval, index) => <li key={interval.from}>
        <div className={styles.farmWindowHeading}>
          <Button type="button" variant="ghost" aria-controls="team-advantage" aria-label={`События ${range(interval.from, interval.to)}`} onClick={() => show(index)}>{range(interval.from, interval.to)} ↗</Button>
          <span>{interval.lastHits !== undefined ? <><strong>{interval.lastHits}</strong> добито · {pace(interval.perMinute!)} в минуту</> : 'Число добиваний недоступно'}</span>
        </div>
        {interval.coveredTo !== undefined && interval.coveredTo < interval.to ? <p className={styles.note}>Число и темп только за {range(interval.from, interval.coveredTo)}. Остаток отрезка не покрыт.</p> : null}
        {interval.to - interval.from < 300 ? <p className={styles.note}>Короткое окончание матча; не участвует в выборе снижения темпа.</p> : null}
        {interval.breakdown ? <details className={styles.farmTypes}>
          <summary>{report.eventCoverage === 'complete' ? 'Типы добиваний' : 'Типы в полученной части событий'} · STRATZ</summary>
          <dl>
            <div><dt>Линейные крипы</dt><dd>{interval.breakdown.lane}</dd></div>
            <div><dt>Обычные нейтралы</dt><dd>{interval.breakdown.neutral}</dd></div>
            <div><dt>Древние</dt><dd>{interval.breakdown.ancient}</dd></div>
            <div><dt>Тип не определён</dt><dd>{interval.breakdown.unclassified}</dd></div>
          </dl>
        </details> : null}
      </li>)}
    </ol>
    <p className={styles.note}>{report.eventCoverage !== 'unavailable' ? 'Категории — по признакам STRATZ; неизвестные и противоречивые признаки сохранены отдельно. ' : ''}Событие на границе пятиминуток относится к следующему отрезку. Выбор отрезка откроет его события на общей шкале ниже; соседство событий не доказывает причину.</p>
    </details>
  </Panel>;
}
