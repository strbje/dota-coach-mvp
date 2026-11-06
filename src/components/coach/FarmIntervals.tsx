import { Button, Panel } from '@/components/ui';
import { farmChart, farmTypes } from '@/lib/dota/analyze/farmChart';
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
  const chart = farmChart(report);
  const split = chart.bars.some((bar) => bar.segments);
  const hasPace = chart.bars.some((bar) => bar.perMinute !== undefined);
  const show = (index: number) => onEvidence(intervals[index].from, intervals[index].to, index < intervals.length - 1);
  return <Panel className={styles.chartPanel}>
    <h2>Фарм по времени</h2>
    <p className={styles.note}>{hasPace ? 'Добито крипов в минуту · нажми на столбец, чтобы открыть события отрезка.' : 'Полный темп недоступен. Частичная разбивка событий — в деталях.'}</p>
    {split ? <ul className={styles.farmLegend} aria-label="Типы добиваний">{farmTypes.map((type) => <li key={type.key}><i className={styles[type.key]} aria-hidden="true" />{type.label}</li>)}</ul> : hasPace ? <p className={styles.note}>Общий темп · полной разбивки по типам нет.</p> : null}
    {hasPace ? <div className={styles.farmChart}>
      <div className={styles.farmAxis} aria-hidden="true"><span>{pace(chart.max)}</span><span>{pace(chart.max / 2)}</span><span>0</span></div>
      <div className={styles.farmPlot}>
        <ol className={styles.farmBars} aria-label="Темп фарма по отрезкам">
          {chart.bars.map((bar, index) => <li key={bar.from}>
            <Button type="button" variant="ghost" className={styles.farmBar} aria-controls="team-advantage"
              aria-label={`События ${range(bar.from, bar.to)}: ${bar.perMinute === undefined ? 'темп неизвестен' : `${pace(bar.perMinute)} крипа в минуту`}${bar.partial ? ', неполный отрезок' : ''}${bar.short ? ', короткое окончание' : ''}`}
              onClick={() => show(index)}>
              <span className={styles.barValue}>{bar.perMinute === undefined ? '—' : pace(bar.perMinute)}{bar.partial || bar.short ? '*' : ''}</span>
              <span className={styles.barTrack} aria-hidden="true">
                {bar.perMinute === undefined ? <span className={styles.barMissing}>Нет данных</span> : <span className={`${styles.barStack} ${index === highlightIndex ? styles.barHighlight : ''}`} style={{ height: `${bar.perMinute / chart.max * 100}%` }}>
                  {bar.segments ? bar.segments.map((part) => <span key={part.key} className={styles[part.key]} style={{ height: `${bar.perMinute ? part.rate / bar.perMinute * 100 : 0}%` }} />) : <span className={styles.total} />}
                </span>}
              </span>
              <span className={styles.barLabel}>{formatGameTime(bar.from)}<br />{formatGameTime(bar.to)}</span>
            </Button>
          </li>)}
        </ol>
      </div>
    </div> : null}
    {chart.bars.some((bar) => bar.short || bar.partial) ? <p className={styles.note}>* Темп за доступную часть отрезка. Короткие и неполные отрезки не участвуют в выборе снижения.</p> : null}
    {current && previous ? <div className={styles.farmObservation}>
      <h3>{range(current.from, current.to)} · темп снизился с {pace(previous.perMinute!)} до {pace(current.perMinute!)} крипа/мин</h3>
      <p className={styles.note}>Самое заметное снижение между полными пятиминутками. Проверь, на что ушло время: снижение само по себе не означает ошибку.</p>
      <Button type="button" variant="secondary" aria-controls="team-advantage" onClick={() => show(highlightIndex!)}>Посмотреть события отрезка</Button>
    </div> : null}
    <details className={styles.more}>
    <summary>Точные значения и источники · {intervals.length}</summary>
    <p className={styles.note}>{report.source === 'stratz' ? `Источник: STRATZ. Сверено ${report.receivedEvents}/${report.reportedLastHits} добиваний, включая подконтрольных существ.` : report.source === 'opendota' ? 'Источник темпа: минутные срезы OpenDota.' : 'Полного ряда для расчёта темпа нет.'}
      {report.eventCoverage === 'partial' ? ` Разбивка по типам неполная: получено ${report.receivedEvents} событий. Она показана только в деталях.` : ''}
      {report.rejectedEvents ? ` Событий без пригодного времени: ${report.rejectedEvents}.` : ''}
    </p>
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
