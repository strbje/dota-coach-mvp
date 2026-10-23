'use client';
import { type FormEvent, useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Button, Field, Input, Panel, Select } from '@/components/ui';
import { useWinrates } from '@/components/winrates/useWinrates';
import { WinrateReport } from '@/components/winrates/WinrateReport';
import { accountId, encounters, positiveId, resultFor, sortEncounters } from '@/lib/dota/winrates/calculation';
import { canRetry, dateMsk, exportCsv, statusText } from '@/lib/dota/winrates/presentation';
import type { Query, Sort, WindowDays } from '@/lib/dota/winrates/types';
import styles from '@/components/winrates/winrates.module.css';

export default function WinratesPage() {
  const [mode, setMode] = useState<Query['mode']>('match');
  const [id, setId] = useState('');
  const [basis, setBasis] = useState<Query['basis']>('match');
  const [period, setPeriod] = useState<Query['days']>(10);
  const [rankedOnly, setRankedOnly] = useState(true);
  const [excludeTurbo, setExcludeTurbo] = useState(true);
  const [days, setDays] = useState<WindowDays>(7);
  const [sort, setSort] = useState<Sort>('side');
  const [inputError, setInputError] = useState<string>();
  const [preferredAccount, setPreferredAccount] = useState<number>();
  const [showForm, setShowForm] = useState(false);
  const state = useWinrates();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (/^\d+$/.test(params.get('matchId') ?? '')) setId(params.get('matchId')!);
    const account = Number(params.get('accountId'));
    if (accountId(account)) setPreferredAccount(account);
  }, []);
  const change = (update: () => void) => { state.clear(); setInputError(undefined); update(); };
  const rows = state.plan ? sortEncounters(encounters(state.plan, state.selectedSlot), state.results, days, sort) : [];
  const received = rows.filter((row) => row.player.missing || resultFor(row, state.results)).length;
  const retryable = rows.filter((row) => row.player.accountId && canRetry(resultFor(row, state.results))).length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(id);
    if (!/^\d+$/.test(id) || !(mode === 'series' ? accountId(value) : positiveId(value))) { setInputError(mode === 'series' ? 'Введите числовой Steam32 ID от 1 до 4294967294.' : 'Введите положительный числовой Match ID.'); return; }
    setInputError(undefined);
    setShowForm(false);
    void state.loadPlan({ mode, id: value, basis, days: period, rankedOnly, excludeTurbo }, preferredAccount);
  };
  const download = () => {
    if (!state.plan) return;
    const url = URL.createObjectURL(new Blob([exportCsv(state.plan, rows, state.results, days)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `dota-victories-${state.plan.query.id}-${state.plan.capturedAt}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <PageContainer width="workspace" className="page-stack">
    <header className={styles.heading}><span className="eyebrow">История участников</span><h1>Доля побед союзников и соперников</h1>{!state.plan ? <p className="muted">Сравни четыре союзника и пять соперников по их предыдущим играм. Это наблюдаемая история, а не вероятность победы команды.</p> : null}</header>
    {state.plan ? <div className={styles.toolbar}><p className="muted">{state.plan.query.mode === 'match' ? 'Match ID' : 'Account ID'} {state.plan.query.id} · {state.plan.query.rankedOnly ? 'Только рейтинговые' : 'Все типы лобби'} · {state.plan.query.excludeTurbo ? 'Без Turbo' : 'С Turbo'}</p><Button type="button" variant="secondary" aria-expanded={showForm} aria-controls="wr-inputs" onClick={() => setShowForm(!showForm)}>{showForm ? 'Скрыть параметры' : 'Изменить параметры / обновить'}</Button>{state.busy ? <Button type="button" variant="secondary" onClick={state.stop}>Остановить загрузку</Button> : null}</div> : null}
    <div id="wr-inputs" hidden={Boolean(state.plan) && !showForm}><Panel><form className={styles.form} onSubmit={submit} aria-busy={state.busy === 'plan'}>
      <Field id="wr-mode" label="Представление"><Select value={mode} onChange={(event) => change(() => { setMode(event.target.value as Query['mode']); setId(''); setPreferredAccount(undefined); })}><option value="match">За матч</option><option value="series">За серию</option></Select></Field>
      <Field id="wr-id" label={mode === 'match' ? 'Match ID' : 'Account ID · Steam32'} hint={mode === 'match' ? 'Числовой ID завершённой игры' : 'Числовой ID игрока; ссылки Steam не поддерживаются'} error={inputError}><Input inputMode="numeric" value={id} onChange={(event) => change(() => { setId(event.target.value.trim()); setPreferredAccount(undefined); })} required /></Field>
      <Field id="wr-basis" label="Момент расчёта"><Select value={basis} onChange={(event) => change(() => setBasis(event.target.value as Query['basis']))}><option value="match">На момент матча</option><option value="now">Сейчас</option></Select></Field>
      {mode === 'series' ? <Field id="wr-period" label="Период серии"><Select value={period} onChange={(event) => change(() => setPeriod(Number(event.target.value) as Query['days']))}>{[7, 10, 30].map((value) => <option key={value} value={value}>{value} дней</option>)}</Select></Field> : null}
      <div className={styles.checks}><label><input type="checkbox" checked={rankedOnly} onChange={(event) => change(() => setRankedOnly(event.target.checked))} />Только рейтинговые</label><label><input type="checkbox" checked={excludeTurbo} onChange={(event) => change(() => setExcludeTurbo(event.target.checked))} />Без Turbo</label><span className="muted">Фильтры действуют на серии и истории участников.</span></div>
      <div className={styles.actions}><Button type="submit" loading={state.busy === 'plan'} loadingLabel="Получаем состав…">{state.plan ? 'Обновить данные' : 'Загрузить сравнение'}</Button>{state.busy && !state.plan ? <Button type="button" variant="secondary" onClick={state.stop}>Остановить загрузку</Button> : null}</div>
    </form></Panel></div>
    {state.error ? <Alert tone={state.error === 'rate_limit' ? 'warning' : 'danger'}>{statusText[state.error] ?? statusText.provider_error}. {state.error === 'rate_limit' ? 'Загрузка приостановлена. Повторите позже; полученные результаты сохранены.' : 'Попробуйте загрузить данные ещё раз.'}</Alert> : null}
    {state.busy === 'plan' ? <Alert tone="info">Получаем состав и доступные матчи. Затем истории участников будут появляться постепенно.</Alert> : null}
    {!state.plan && !state.busy ? <Alert>Введите Match ID или Account ID, чтобы начать.</Alert> : null}
    {state.plan ? <>
      <Panel className="stack">
        <div className={styles.toolbar}><div><h2>{state.plan.query.basis === 'match' ? 'На момент матча' : 'Сейчас · единый момент расчёта'}</h2><p className="muted">Загрузка зафиксирована {dateMsk(state.plan.capturedAt)} МСК · источник OpenDota · кэш до 5 минут.</p></div><Button type="button" variant="secondary" onClick={download} disabled={!rows.length}>Скачать CSV для Excel</Button></div>
        {state.plan.query.mode === 'match' && state.plan.matches[0]?.match ? <Field id="wr-player" label="Выбранный игрок" hint="Он не входит в среднее союзников."><Select value={state.selectedSlot ?? ''} onChange={(event) => state.selectPlayer(Number(event.target.value))}><option value="" disabled>Выбери игрока и сторону</option>{state.plan.matches[0].match.players.map((player) => <option key={player.slot} value={player.slot} disabled={player.missing === 'roster_missing' || player.missing === 'ambiguous'}>{player.slot < 128 ? 'Radiant' : 'Dire'} · {player.heroName} · {player.name ?? (player.accountId ? `ID ${player.accountId}` : 'Аккаунт скрыт')}</option>)}</Select></Field> : null}
        {state.plan.query.mode === 'match' && state.plan.matches[0]?.match?.players.every((player) => player.missing === 'roster_missing' || player.missing === 'ambiguous') ? <Alert>OpenDota не вернул состав, доступный для выбора. Обновите данные позже.</Alert> : null}
        {state.plan.series ? <p>Показано {state.plan.series.shown} из {state.plan.series.found} найденных подходящих матчей за {state.plan.query.days} дней. Первая серия ограничена 3 матчами; история — 300 записями. {statusText[state.plan.series.history.stop]} · просмотрено {state.plan.series.history.scanned}, ненадёжных записей {state.plan.series.history.invalid}.</p> : null}
        {state.plan.series && !state.plan.matches.length ? <Alert>{statusText[state.plan.series.status]}. Подходящих матчей в полученной выборке нет.</Alert> : null}
        {state.plan.series && !state.busy ? <div className={styles.actions}>
          {state.plan.series.remainingIds.length ? <Button type="button" variant="secondary" onClick={() => void state.extendSeries()}>Следующие 3 матча · осталось {state.plan.series.remainingIds.length}</Button> : null}
          {state.plan.matches.some((entry) => entry.error) ? <Button type="button" variant="secondary" onClick={() => void state.extendSeries(true)}>Повторить загрузку составов</Button> : null}
        </div> : null}
        {rows.length > 0 ? <>
          <details className="details"><summary>Окно {days} дней · сортировка</summary><div className={`details-content ${styles.toolbar}`}><Field id="wr-window" label="Окно для средних"><Select value={days} onChange={(event) => setDays(Number(event.target.value) as WindowDays)}><option value={7}>7 дней</option><option value={30}>30 дней</option></Select></Field><Field id="wr-sort" label="Сортировка участников"><Select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="side">По стороне</option><option value="rate_desc">По доле побед ↓</option><option value="rate_asc">По доле побед ↑</option><option value="name">По имени</option></Select></Field></div></details>
          <p role="status" aria-live="polite">Обработано {received} из {rows.length} участников.{state.busy === 'participants' ? ' Загружаем истории…' : retryable ? ' Результат частичный; можно продолжить или повторить недоступные истории.' : ' Загрузка завершена; доступность и полнота историй указаны ниже.'}</p>
          {state.busy || received < rows.length ? <progress className={styles.progress} value={received} max={rows.length} aria-label="Обработанные участники" /> : null}
          {!state.busy && retryable > 0 ? <Button type="button" variant="secondary" onClick={state.resume}>Продолжить / повторить · {retryable}</Button> : null}
        </> : null}
      </Panel>
      <WinrateReport plan={state.plan} rows={rows} results={state.results} days={days} />
    </> : null}
    <details className="details"><summary>Как считаются доля побед и покрытие</summary><div className={`details-content ${styles.method}`}>
      <p>Каждый участник имеет равный вес: 1 победа из 1 игры и 50 из 100 дают среднее 75%. Выбранный игрок исключён. Разница сторон показана в процентных пунктах.</p>
      <p>В режиме «На момент матча» учитываются только игры, начавшиеся за 7/30 дней до него и завершившиеся строго до его начала. Сам рассматриваемый матч исключён. «Сейчас» использует момент начала всей загрузки; эти результаты не смешиваются.</p>
      <p>Покрытие рядом со средним — число участников с подходящими играми. Полное окно означает, что просмотрена доступная история OpenDota до границы периода; источник может знать не все игры. Лимит 300 записей или ошибка не доказывают полноту окна. Ноль побед отображается как 0%; отсутствие игр — как «—».</p>
      <p>В сводке серии сначала считаются средние сторон каждого матча, затем среднее по матчам с обеими сторонами. Их веса равны. Уникальные игроки и итоговые числа повторных встреч показаны отдельно. Проценты из разных моментов не объединяются в один процент игрока.</p>
      <p>Загрузка делает паузу через 45 секунд; продолжение сохраняет момент расчёта. Обновление начинает новую загрузку. Кэш в памяти живёт до 5 минут; время исходных данных указано у участников. Все даты — МСК (Europe/Moscow).</p>
    </div></details>
  </PageContainer>;
}
