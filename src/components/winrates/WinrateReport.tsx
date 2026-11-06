'use client';
import { useState } from 'react';
import { getHeroPortraitUrl } from '@/lib/dota/data/heroConstants';
import { Badge, Button, Panel } from '@/components/ui';
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

export function WinrateReport({ plan, rows, results, days, loading = false }: { plan: Plan; rows: Encounter[]; results: Results; days: WindowDays; loading?: boolean }) {
  const [selectedMatch, setSelectedMatch] = useState<number>();
  const activeMatch = plan.matches.some((entry) => entry.matchId === selectedMatch) ? selectedMatch : plan.matches[0]?.matchId;
  const people = uniquePlayers(rows);
  const average = seriesMean(rows, results, days);
  return <div className="page-stack">
    {plan.query.mode === 'series' && plan.matches.length > 0 ? <Panel className="stack">
      <h2>Твои матчи · среднее сторон</h2>
      <div className={styles.comparison}>
        <div className={styles.metric}><h3>Твоя сторона</h3><strong className={styles.number}>{percent(average.with)}</strong></div>
        <div className={styles.metric}><h3>Соперники</h3><strong className={styles.number}>{percent(average.against)}</strong></div>
        <div className={styles.metric}><h3>Разница</h3><strong className={styles.number}>{points(average.with, average.against)}</strong></div>
      </div>
      <p className="muted">За {days} дней · учтено {average.pairs} из {plan.matches.length} матчей с данными обеих сторон. Покрытие — в составах.</p>
    </Panel> : null}
    {plan.query.mode === 'series' && plan.matches.length > 0 ? <div className={styles.matchPicker} role="group" aria-label="Твои матчи">{plan.matches.map((entry) => {
      const entries = rows.filter((row) => row.matchId === entry.matchId);
      const done = entries.filter((row) => row.player.missing || resultFor(row, results)).length;
      const a = groupMean(entries, results, days, 'with');
      const b = groupMean(entries, results, days, 'against');
      return <Button key={entry.matchId} type="button" variant="secondary" aria-pressed={activeMatch === entry.matchId} onClick={() => setSelectedMatch(entry.matchId)}>
        <strong>Матч {entry.matchId}</strong><span>{dateMsk(entry.match?.startTime)} МСК</span>
        <span>{percent(a.mean)} / {percent(b.mean)} · {days} дней</span>
        <span>{entry.error ? statusText[entry.error] : `${done}/${entries.length} обработано${done < entries.length ? loading ? ' · загрузка' : ' · не загружено полностью' : ''}`}</span>
      </Button>;
    })}</div> : null}
    {plan.matches.filter((entry) => plan.query.mode === 'match' || entry.matchId === activeMatch).map((entry) => {
      const matchRows = rows.filter((row) => row.matchId === entry.matchId);
      if (!matchRows.length && !entry.error) return null;
      return <Panel key={entry.matchId} className="stack">
        <div className={styles.toolbar}><h2>Матч {entry.matchId}</h2><span className="muted">Начало: {dateMsk(entry.match?.startTime)} МСК</span></div>
        {entry.error ? <p>{statusText[entry.error]}. Состав не получен; матч не включён в средние.</p> : <>
          <p className={styles.comparisonNote}>История за {days} дней до {dateMsk(plan.query.basis === 'match' ? entry.match?.startTime : plan.capturedAt)} МСК. Сам этот матч исключён.</p>
          <p className={styles.comparisonNote}>Разница сторон: <strong>{points(groupMean(matchRows, results, days, 'with').mean, groupMean(matchRows, results, days, 'against').mean)}</strong> · твоя сторона минус соперники</p>
          <div className={styles.sides}>
            {(['with', 'against'] as const).map((side) => {
              const value = groupMean(matchRows, results, days, side);
              return <section className={styles.side} key={side} aria-label={side === 'with' ? 'Твоя сторона' : 'Соперники'}>
                <div className={styles.metric}>
                  <div className={styles.sideHeading}><h3>{side === 'with' ? 'Твоя сторона' : 'Соперники'}</h3><strong className={styles.number}>{percent(value.mean)}</strong><span>за {days} дней</span></div>
                  <span className="muted">Данные {value.available} из {value.expected} · полных историй: {value.complete}</span>
                </div>
                <div className={styles.roster}>
            {matchRows.filter((row) => row.side === side).map((row) => {
              const result = resultFor(row, results);
              const status = !loading && !result && !row.player.missing ? 'Не загружено' : rowStatus(row, results);
              return <details key={row.key} className={`${styles.participant} ${row.isSelected ? styles.selectedPlayer : ''}`}>
                <summary>
                  <HeroPortrait key={`${row.player.heroId}:${row.player.heroKey}`} player={row.player} />
                  <span className={styles.identity}><strong>{result?.name ?? row.player.name ?? row.player.heroName}</strong><span className="muted">{row.player.heroName}{row.isSelected ? ' · выбранный игрок' : ''}</span></span>
                  <span className={styles.miniStats}>{([7, 30] as const).map((window) => <span key={window}>
                    <span>{window} дней</span><span className={styles.sampleValue}><strong>{percent(result?.samples[window].rate)}</strong><span title="Победы / игры">{result ? `${result.samples[window].wins} / ${result.samples[window].games}` : '— / —'}</span></span>
                    {result ? <span className="muted" title={coverageText(result.samples[window])}>{result.samples[window].complete ? 'Полное' : 'Неполное'}</span> : null}
                  </span>)}</span>
                  {(!result || result.status !== 'ready' || result.refreshError) ? <span className={styles.participantStatus}>
                    {!result || result.status !== 'ready' ? <span>{status}</span> : null}
                    {result?.refreshError ? <Badge tone="warning">Ошибка обновления</Badge> : null}
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
          <p className={styles.comparisonNote}>Процент · победы / игры. Выбранный игрок включён в свою сторону. Неполные окна входят в среднее и отмечены отдельно.</p>
        </>}
      </Panel>;
    })}
    {plan.query.mode === 'series' && rows.length > 0 ? <details className="details"><summary>Повторные встречи · {people.length} игроков</summary><div className="details-content">
      <p className="muted">{rows.filter((row) => !row.isSelected).length} встреч с другими игроками, из них {rows.filter((row) => !row.isSelected && !row.player.accountId).length} без известного аккаунта. Повторный игрок занимает одну строку. Счётчики итоговые для показанных матчей; выбранный игрок исключён.</p>
      <table className={styles.people}><caption>Встречи вместе и против по игрокам</caption><thead><tr><th scope="col">Игрок</th><th scope="col">Вместе</th><th scope="col">Против</th></tr></thead>
        <tbody>{people.map((person) => <tr key={person.accountId}><th scope="row">{person.name ?? `Игрок ${person.accountId}`}<details><summary>Аккаунт и матчи</summary><span className="muted">ID {person.accountId}</span><span>Вместе: {person.with.join(', ') || '—'}</span><span>Против: {person.against.join(', ') || '—'}</span></details></th>
          {(['with', 'against'] as const).map((side) => <td key={side}><strong>{person[side].length}</strong></td>)}
        </tr>)}</tbody>
      </table>
    </div></details> : null}
  </div>;
}
