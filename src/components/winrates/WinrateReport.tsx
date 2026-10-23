'use client';
import { Badge, Panel } from '@/components/ui';
import { groupMean, resultFor, seriesMean, uniquePlayers } from '@/lib/dota/winrates/calculation';
import { coverageText, dateMsk, percent, points, rowStatus, statusText } from '@/lib/dota/winrates/presentation';
import type { Encounter, Plan, Results, WindowDays } from '@/lib/dota/winrates/types';
import styles from './winrates.module.css';

function Comparison({ rows, results, days }: { rows: Encounter[]; results: Results; days: WindowDays }) {
  const allies = groupMean(rows, results, days, 'with');
  const opponents = groupMean(rows, results, days, 'against');
  return <div className={styles.comparison}>
    {([{ label: 'Союзники', value: allies }, { label: 'Соперники', value: opponents }]).map(({ label, value }) => <div key={label} className={styles.metric}>
      <h3>{label}</h3><strong className={styles.number}>{percent(value.mean)}</strong>
      <span>Данные {value.available} из {value.expected}</span><span className="muted">Полных историй: {value.complete}</span>
    </div>)}
    <div className={styles.metric}><h3>Разница</h3><strong className={styles.number}>{points(allies.mean, opponents.mean)}</strong><span className="muted">Союзники минус соперники</span></div>
  </div>;
}

export function WinrateReport({ plan, rows, results, days }: { plan: Plan; rows: Encounter[]; results: Results; days: WindowDays }) {
  const people = uniquePlayers(rows);
  const average = seriesMean(rows, results, days);
  return <div className="page-stack">
    {plan.query.mode === 'series' && plan.matches.length > 0 ? <Panel className="stack">
      <h2>Серия · среднее по матчам</h2>
      <div className={styles.comparison}>
        <div className={styles.metric}><h3>Союзники</h3><strong className={styles.number}>{percent(average.with)}</strong></div>
        <div className={styles.metric}><h3>Соперники</h3><strong className={styles.number}>{percent(average.against)}</strong></div>
        <div className={styles.metric}><h3>Разница</h3><strong className={styles.number}>{points(average.with, average.against)}</strong></div>
      </div>
      <p className="muted">Окно {days} дней. Сравнимы {average.pairs} из {plan.matches.length} матчей: в них есть хотя бы один процент на каждой стороне. Каждый матч имеет равный вес; покрытие участников — ниже.</p>
    </Panel> : null}
    {plan.matches.map((entry) => {
      const matchRows = rows.filter((row) => row.matchId === entry.matchId);
      if (!matchRows.length && !entry.error) return null;
      return <Panel key={entry.matchId} className="stack">
        <div className={styles.toolbar}><h2>Матч {entry.matchId}</h2><span className="muted">{dateMsk(entry.match?.startTime)} МСК · {days} дней</span></div>
        {entry.error ? <p>{statusText[entry.error]}. Состав не получен; матч не включён в средние.</p> : <>
          <Comparison rows={matchRows} results={results} days={days} />
          <p className="muted">Среднее доступных процентов участников. Выбранный игрок исключён. Неполные истории входят в среднее и отмечены в деталях.</p>
          <div className={styles.roster}>
            {matchRows.map((row) => {
              const result = resultFor(row, results);
              const person = people.find((item) => item.accountId === row.player.accountId);
              const complete = result && result.samples[7].complete && result.samples[30].complete;
              return <details key={row.key} className={styles.participant}>
                <summary>
                  <span className={styles.identity}><strong>{result?.name ?? row.player.name ?? row.player.heroName}</strong><span className="muted">{row.side === 'with' ? 'Союзник' : 'Соперник'} · {row.player.heroName}</span></span>
                  <span className={styles.miniStats}>{([7, 30] as const).map((window) => <span key={window}>
                    <span>{window} дней</span><strong>{percent(result?.samples[window].rate)}</strong>
                    {result ? <span className="muted" title={coverageText(result.samples[window])}>{result.samples[window].complete ? 'Полное окно' : 'Неполное окно'}</span> : null}
                  </span>)}</span>
                  <span className={styles.participantStatus}>
                    <Badge tone={result?.status === 'ready' && complete ? 'info' : 'unknown'}>{result?.status === 'ready' && !complete ? 'Неполная выборка' : rowStatus(row, results)}</Badge>
                    {result?.refreshError ? <Badge tone="warning">Ошибка обновления</Badge> : null}
                  </span>
                </summary>
                <div className={styles.participantBody}>
                  <p>{row.player.accountId ? `Account ID ${row.player.accountId}` : rowStatus(row, results)} · Вместе {person?.with.length ?? '—'} / против {person?.against.length ?? '—'}</p>
                  {result ? <>
                    {result.refreshError ? <p role="status">{statusText[result.refreshError]}. Показана ранее полученная выборка; время её получения сохранено. Повторите обновление позже.</p> : null}
                    {result.status === 'private' ? <p>OpenDota ограничил историю: она закрыта или источнику не удалось её обновить. Причину источник не уточнил.</p> : null}
                    <div className={styles.samples}>{([7, 30] as const).map((window) => {
                      const value = result.samples[window];
                      return <div className="stack" key={window}>
                        <h3>{window} дней · {percent(value.rate)}</h3>
                        <p>Победы / игры: {value.wins} / {value.games} · {coverageText(value)}</p>
                        <p className="muted">Окно: {dateMsk(value.from)} — {dateMsk(value.to)} МСК.<br />Подходящие игры: {dateMsk(value.first)} — {dateMsk(value.last)} МСК.</p>
                      </div>;
                    })}</div>
                    <p className="muted">Расчёт на {dateMsk(result.asOf)} МСК. Просмотрено записей: {result.history.scanned}; пропущено ненадёжных: {result.history.invalid}. История просмотрена до {dateMsk(result.history.oldest)} МСК.</p>
                    <p className="muted">Самые ранние данные получены {dateMsk(result.fetchedAt)} МСК · кэш до {dateMsk(result.expiresAt)} МСК.</p>
                  </> : <p>Процент и размер выборки появятся после загрузки истории. Отсутствующее значение не считается нулём.</p>}
                </div>
              </details>;
            })}
          </div>
        </>}
      </Panel>;
    })}
    {plan.query.mode === 'series' && rows.length > 0 ? <Panel className="stack">
      <h2>Уникальные участники · {people.length}</h2>
      <p className="muted">{rows.length} встреч в полученных составах, из них {rows.filter((row) => !row.player.accountId).length} без известного аккаунта. Повторный игрок занимает одну строку. Счётчики итоговые для показанной серии; выбранный игрок исключён.</p>
      <table className={styles.people}><caption>Встречи вместе и против по игрокам</caption><thead><tr><th scope="col">Игрок</th><th scope="col">Вместе</th><th scope="col">Против</th></tr></thead>
        <tbody>{people.map((person) => <tr key={person.accountId}><th scope="row">{person.name ?? `Игрок ${person.accountId}`}<span className="muted">ID {person.accountId}</span></th>
          {(['with', 'against'] as const).map((side) => <td key={side}><strong>{person[side].length}</strong><span className="muted">Match ID: {person[side].join(', ') || '—'}</span></td>)}
        </tr>)}</tbody>
      </table>
    </Panel> : null}
  </div>;
}
