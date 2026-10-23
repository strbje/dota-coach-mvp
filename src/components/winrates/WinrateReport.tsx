'use client';
import { useState } from 'react';
import { getHeroPortraitUrl } from '@/lib/dota/data/heroConstants';
import { Badge, Panel } from '@/components/ui';
import { groupMean, resultFor, seriesMean, uniquePlayers } from '@/lib/dota/winrates/calculation';
import { coverageText, dateMsk, percent, points, rowStatus, statusText } from '@/lib/dota/winrates/presentation';
import type { Encounter, Plan, Results, RosterPlayer, WindowDays } from '@/lib/dota/winrates/types';
import styles from './winrates.module.css';

function HeroPortrait({ player }: { player: RosterPlayer }) {
  const [failed, setFailed] = useState(false);
  const src = getHeroPortraitUrl(player.heroKey);
  return <span className={styles.portrait} aria-hidden="true">
    {src && !failed
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span>{player.heroId ? '◇' : '?'}</span>}
  </span>;
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
          <p className={styles.comparisonNote}>Разница сторон: <strong>{points(groupMean(matchRows, results, days, 'with').mean, groupMean(matchRows, results, days, 'against').mean)}</strong> · союзники минус соперники</p>
          <div className={styles.sides}>
            {(['with', 'against'] as const).map((side) => {
              const value = groupMean(matchRows, results, days, side);
              return <section className={styles.side} key={side} aria-label={side === 'with' ? 'Союзники' : 'Соперники'}>
                <div className={styles.metric}>
                  <div className={styles.sideHeading}><h3>{side === 'with' ? 'Союзники' : 'Соперники'}</h3><strong className={styles.number}>{percent(value.mean)}</strong><span>за {days} дней</span></div>
                  <span className="muted">Данные {value.available} из {value.expected} · полных историй: {value.complete}</span>
                </div>
                <div className={styles.roster}>
            {matchRows.filter((row) => row.side === side).map((row) => {
              const result = resultFor(row, results);
              const person = people.find((item) => item.accountId === row.player.accountId);
              const complete = result && result.samples[7].complete && result.samples[30].complete;
              return <details key={row.key} className={styles.participant}>
                <summary>
                  <HeroPortrait key={`${row.player.heroId}:${row.player.heroKey}`} player={row.player} />
                  <span className={styles.identity}><strong>{result?.name ?? row.player.name ?? row.player.heroName}</strong><span className="muted">{row.player.heroName}</span></span>
                  <span className={styles.miniStats}>{([7, 30] as const).map((window) => <span key={window}>
                    <span>{window} дней</span><span className={styles.sampleValue}><strong>{percent(result?.samples[window].rate)}</strong><span title="Победы / игры">{result ? `${result.samples[window].wins} / ${result.samples[window].games}` : '— / —'}</span></span>
                    {result ? <span className="muted" title={coverageText(result.samples[window])}>{result.samples[window].complete ? 'Полное окно' : 'Неполное окно'}</span> : null}
                  </span>)}</span>
                  {result?.status !== 'ready' || !complete || result.refreshError || plan.query.mode === 'series' ? <span className={styles.participantStatus}>
                    {result?.status !== 'ready' || !complete ? <Badge tone="unknown">{result?.status === 'ready' ? 'Неполная выборка' : rowStatus(row, results)}</Badge> : null}
                    {result?.refreshError ? <Badge tone="warning">Ошибка обновления</Badge> : null}
                    {plan.query.mode === 'series' ? <span>Вместе {person?.with.length ?? '—'} · против {person?.against.length ?? '—'}</span> : null}
                  </span> : null}
                </summary>
                <div className={styles.participantBody}>
                  <p>{row.player.accountId ? `Account ID ${row.player.accountId}` : rowStatus(row, results)}</p>
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
              </section>;
            })}
          </div>
          <p className={styles.comparisonNote}>У каждого процента — победы / игры. Среднее доступных процентов участников; выбранный игрок исключён. Неполные истории тоже входят в среднее; каждое окно отмечено отдельно.</p>
        </>}
      </Panel>;
    })}
    {plan.query.mode === 'series' && rows.length > 0 ? <Panel className="stack">
      <h2>Уникальные участники · {people.length}</h2>
      <p className="muted">{rows.length} встреч в полученных составах, из них {rows.filter((row) => !row.player.accountId).length} без известного аккаунта. Повторный игрок занимает одну строку. Счётчики итоговые для показанной серии; выбранный игрок исключён.</p>
      <table className={styles.people}><caption>Встречи вместе и против по игрокам</caption><thead><tr><th scope="col">Игрок</th><th scope="col">Вместе</th><th scope="col">Против</th></tr></thead>
        <tbody>{people.map((person) => <tr key={person.accountId}><th scope="row">{person.name ?? `Игрок ${person.accountId}`}<details><summary>Аккаунт и матчи</summary><span className="muted">ID {person.accountId}</span><span>Вместе: {person.with.join(', ') || '—'}</span><span>Против: {person.against.join(', ') || '—'}</span></details></th>
          {(['with', 'against'] as const).map((side) => <td key={side}><strong>{person[side].length}</strong></td>)}
        </tr>)}</tbody>
      </table>
    </Panel> : null}
  </div>;
}
