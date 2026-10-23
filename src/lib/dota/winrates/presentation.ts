import { groupMean, resultFor, seriesMean, uniquePlayers } from './calculation';
import type { Encounter, ParticipantResult, Plan, Results, Sample, WindowDays } from './types';

export const percent = (value: number | null | undefined) => value == null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
export const points = (a: number | null, b: number | null) => a === null || b === null ? '—' : `${a - b > 0 ? '+' : ''}${(a - b).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} п.п.`;
export const dateMsk = (timestamp: number | null | undefined) => !timestamp ? '—' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(timestamp * 1000);
export const statusText: Record<string, string> = {
  ready: 'Данные получены', empty: 'Нет подходящих игр', private: 'История ограничена OpenDota',
  unavailable: 'Доступность истории не подтверждена', provider_error: 'Ошибка OpenDota', rate_limit: 'Лимит запросов OpenDota', timeout: 'Время ожидания истекло',
  anonymous: 'Аккаунт скрыт', roster_missing: 'Нет данных об участнике', ambiguous: 'Неоднозначный состав', pending: 'Ожидает загрузки',
  cap: 'Достигнут лимит 300 записей', invalid: 'Есть записи без надёжных данных', order: 'Порядок истории не подтверждён',
  boundary: 'Достигнута граница окна', exhausted: 'Доступная история просмотрена', invalid_input: 'Проверьте числовой ID и параметры загрузки'
};
export const coverageText = (value: Sample) => value.complete ? 'Окно доступной истории покрыто' : `Неполная выборка: ${statusText[value.limitedBy ?? 'unavailable'] ?? statusText.unavailable}`;
export const rowStatus = (row: Encounter, results: Results) => statusText[row.player.missing ?? resultFor(row, results)?.status ?? 'pending'];
export const canRetry = (result?: ParticipantResult) => !result || ['provider_error', 'rate_limit', 'timeout', 'unavailable'].includes(result.status) || ['provider_error', 'rate_limit', 'timeout'].includes(result.history.stop);

/** Excel-compatible text, including neutralisation of formula prefixes after whitespace/control chars. */
export function csvCell(value: unknown): string {
  if (typeof value === 'number') return `"${Number.isFinite(value) ? String(value).replace('.', ',') : ''}"`;
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(plan: Plan, rows: Encounter[], results: Results, days: WindowDays): string {
  const table: unknown[][] = [
    ['Доля побед участников · источник OpenDota'],
    ['Загрузка (МСК)', dateMsk(plan.capturedAt), 'Момент', plan.query.basis === 'match' ? 'На момент матча' : 'Сейчас', 'Окно средних (дни)', days],
    ['Только рейтинговые', plan.query.rankedOnly ? 'Да' : 'Нет', 'Без Turbo', plan.query.excludeTurbo ? 'Да' : 'Нет', 'Период серии', plan.query.days],
    ['Средние — равный вес участников; сводка — равный вес парных матчей. Это не вероятность победы.'],
    ['Матч', 'Союзники, %', 'Данные из 4', 'Соперники, %', 'Данные из 5', 'Разница, п.п.', 'Состояние']
  ];
  for (const entry of plan.matches) {
    const matchRows = rows.filter((row) => row.matchId === entry.matchId);
    const a = groupMean(matchRows, results, days, 'with');
    const b = groupMean(matchRows, results, days, 'against');
    table.push([entry.matchId, a.mean, a.available, b.mean, b.available, a.mean !== null && b.mean !== null ? a.mean - b.mean : null, entry.error ? statusText[entry.error] : `${a.complete + b.complete} полных историй из 9`]);
  }
  if (plan.query.mode === 'series') {
    const average = seriesMean(rows, results, days);
    table.push(['Сводка парных матчей', average.with, average.pairs, average.against, average.pairs, average.with !== null && average.against !== null ? average.with - average.against : null]);
    table.push(['Серия: найдено / показано', plan.series?.found, plan.series?.shown, statusText[plan.series?.history.stop ?? 'unavailable']]);
  }
  const people = uniquePlayers(rows);
  table.push([], ['Матч', 'Время матча (МСК)', 'Сторона', 'Account ID', 'Имя', 'Герой', 'Состояние', 'Расчёт на (МСК)', 'Данные получены (МСК)', 'Кэш до (МСК)',
    '7 дней, %', 'Победы 7', 'Игры 7', 'Граница 7 (МСК)', 'Первая игра 7 (МСК)', 'Последняя игра 7 (МСК)', 'Покрытие 7',
    '30 дней, %', 'Победы 30', 'Игры 30', 'Граница 30 (МСК)', 'Первая игра 30 (МСК)', 'Последняя игра 30 (МСК)', 'Покрытие 30',
    'Вместе, всего', 'Против, всего', 'Match ID вместе', 'Match ID против', 'Просмотрено записей', 'История до (МСК)']);
  for (const row of rows) {
    const result = resultFor(row, results);
    const person = people.find((item) => item.accountId === row.player.accountId);
    const windowCells = (window: WindowDays) => {
      const value = result?.samples[window];
      return value ? [value.rate, value.wins, value.games, dateMsk(value.from), dateMsk(value.first), dateMsk(value.last), coverageText(value)] : Array(7).fill('');
    };
    table.push([row.matchId, dateMsk(row.startTime), row.side === 'with' ? 'Союзник' : 'Соперник', row.player.accountId, result?.name ?? row.player.name, row.player.heroName, rowStatus(row, results), dateMsk(result?.asOf), dateMsk(result?.fetchedAt), dateMsk(result?.expiresAt),
      ...windowCells(7), ...windowCells(30), person?.with.length, person?.against.length, person?.with.join(', '), person?.against.join(', '), result?.history.scanned, dateMsk(result?.history.oldest)]);
  }
  return '\uFEFF' + table.map((cells) => cells.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
