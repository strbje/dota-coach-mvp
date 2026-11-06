'use client';
import { type FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { ActionLink, Alert, Button, Field, Input, Panel, Select } from '@/components/ui';
import { useWinrates } from '@/components/winrates/useWinrates';
import { WinrateReport } from '@/components/winrates/WinrateReport';
import { accountId, encounters, positiveId, resultFor, sortEncounters } from '@/lib/dota/winrates/calculation';
import { canRetry, dateMsk, exportCsv, statusText } from '@/lib/dota/winrates/presentation';
import type { Query, Sort, WindowDays } from '@/lib/dota/winrates/types';
import styles from '@/components/winrates/winrates.module.css';

export default function WinratesPage() {
  return <Suspense fallback={<PageContainer width="report" atmosphere="winrates"><p role="status">Открываем историю участников…</p></PageContainer>}><WinratesRoute /></Suspense>;
}

function WinratesRoute() {
  const params = useSearchParams();
  const match = params.get('matchId') ?? '';
  const account = Number(params.get('accountId'));
  const isMatch = /^\d+$/.test(match) && positiveId(Number(match));
  // Navigation from a match supplies its context; the standalone page starts with player history.
  // The key resets pending requests and results when navigating between these entry points.
  return <WinratesContent key={params.toString()} mode={isMatch ? 'match' : 'series'} initialId={isMatch ? match : accountId(account) ? String(account) : ''} initialAccount={accountId(account) ? account : undefined} />;
}

function WinratesContent({ mode, initialId, initialAccount }: { mode: Query['mode']; initialId: string; initialAccount?: number }) {
  const [id, setId] = useState(initialId);
  const [basis, setBasis] = useState<Query['basis']>('match');
  const [period, setPeriod] = useState<Query['days']>(10);
  const [rankedOnly, setRankedOnly] = useState(true);
  const [excludeTurbo, setExcludeTurbo] = useState(true);
  const [days, setDays] = useState<WindowDays>(7);
  const [sort, setSort] = useState<Sort>('side');
  const [inputError, setInputError] = useState<string>();
  const [preferredAccount, setPreferredAccount] = useState(initialAccount);
  const [showForm, setShowForm] = useState(false);
  const state = useWinrates();
  const change = (update: () => void) => { state.clear(); setInputError(undefined); update(); };
  const rows = state.plan ? sortEncounters(encounters(state.plan, state.selectedSlot), state.results, days, sort) : [];
  const received = rows.filter((row) => row.player.missing || resultFor(row, state.results)).length;
  const retryable = rows.filter((row) => row.player.accountId && canRetry(resultFor(row, state.results))).length;
  const selectedAccount = state.selectedSlot === undefined ? preferredAccount
    : state.plan?.matches[0]?.match?.players.find((player) => player.slot === state.selectedSlot)?.accountId;
  const historyHref = selectedAccount ? `/winrates?accountId=${selectedAccount}` : '/winrates';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(id);
    if (!/^\d+$/.test(id) || !(mode === 'series' ? accountId(value) : positiveId(value))) { setInputError(mode === 'series' ? 'Введи числовой Steam32 ID от 1 до 4294967294.' : 'Введи положительный числовой ID матча.'); return; }
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
  return <PageContainer width="report" atmosphere="winrates" className="page-stack">
    <header className={styles.heading}><span className="eyebrow">История участников</span><h1>Винрейт игроков</h1>{!state.plan ? <p className="muted">{mode === 'series' ? 'Загрузи свои матчи и сравни историю всех десяти участников в каждом.' : 'Выбери своего игрока и сравни историю обеих сторон.'} Винрейт в прошлых играх — не прогноз результата.</p> : null}</header>
    {mode === 'match' ? <div className={styles.toolbar}><p className="muted">Участники выбранного матча</p><ActionLink href={historyHref} variant="secondary">К истории игрока</ActionLink></div> : null}
    {state.plan ? <div className={styles.toolbar}><p className="muted">{state.plan.query.mode === 'match' ? 'ID матча' : 'Account ID'} {state.plan.query.id} · {state.plan.query.rankedOnly ? 'Только рейтинговые' : 'Все типы лобби'} · {state.plan.query.excludeTurbo ? 'Без Turbo' : 'С Turbo'}</p><Button type="button" variant="secondary" aria-expanded={showForm} aria-controls="wr-inputs" onClick={() => setShowForm(!showForm)}>{showForm ? 'Скрыть параметры' : 'Изменить параметры / обновить'}</Button>{state.busy ? <Button type="button" variant="secondary" onClick={state.stop}>Остановить загрузку</Button> : null}</div> : null}
    <div id="wr-inputs" className={styles.inputs} hidden={Boolean(state.plan) && !showForm}><Panel><form className={`${styles.form} ${mode === 'series' ? styles.historyForm : ''}`} onSubmit={submit} aria-busy={state.busy === 'plan'}>
      <Field id="wr-id" label={mode === 'match' ? 'ID матча' : 'ID игрока · Steam32'} hint={mode === 'match' ? 'Числовой ID завершённой игры' : 'Числовой ID игрока; ссылки Steam не поддерживаются'} error={inputError}><Input inputMode="numeric" value={id} onChange={(event) => change(() => { setId(event.target.value.trim()); setPreferredAccount(undefined); })} required /></Field>
      {mode === 'series' ? <Field id="wr-period" label="Твои матчи за"><Select value={period} onChange={(event) => change(() => setPeriod(Number(event.target.value) as Query['days']))}>{[7, 10, 30].map((value) => <option key={value} value={value}>Последние {value} дней</option>)}</Select></Field> : null}
      <Field id="wr-basis" label="История участников" hint={basis === 'match' ? 'Игры за 7 и 30 дней до начала каждого матча. Более поздние игры не учитываются.' : 'Игры за 7 и 30 дней до этой загрузки. Учитываются и игры после выбранного матча.'}><Select value={basis} onChange={(event) => change(() => setBasis(event.target.value as Query['basis']))}><option value="match">До начала матча</option><option value="now">На сегодня</option></Select></Field>
      <div className={styles.checks}><label><input type="checkbox" checked={rankedOnly} onChange={(event) => change(() => setRankedOnly(event.target.checked))} />Только рейтинговые</label><label><input type="checkbox" checked={excludeTurbo} onChange={(event) => change(() => setExcludeTurbo(event.target.checked))} />Без Turbo</label><span className="muted">Фильтры применяются к списку матчей и историям участников.</span></div>
      <div className={styles.actions}><Button type="submit" loading={state.busy === 'plan'} loadingLabel="Получаем состав…">{state.plan ? 'Обновить данные' : 'Загрузить сравнение'}</Button>{state.busy && !state.plan ? <Button type="button" variant="secondary" onClick={state.stop}>Остановить загрузку</Button> : null}</div>
    </form></Panel></div>
    {state.error ? <Alert tone={state.error === 'rate_limit' ? 'warning' : 'danger'}>{statusText[state.error] ?? statusText.provider_error}. {state.error === 'rate_limit' ? 'Загрузка приостановлена. Повтори позже; полученные результаты сохранены.' : 'Попробуй загрузить данные ещё раз.'}</Alert> : null}
    {state.busy === 'plan' ? <Alert tone="info">Получаем состав и доступные матчи. Затем истории участников будут появляться постепенно.</Alert> : null}
    {!state.plan && !state.busy ? <Alert>{mode === 'match' ? 'Загрузи состав, затем выбери своего игрока.' : 'Введи Account ID — загрузим последние матчи и сравним участников.'}</Alert> : null}
    {state.plan ? <>
      <Panel className="stack">
        <div className={styles.toolbar}><div><h2>{state.plan.query.basis === 'match' ? 'История до начала матча' : 'История на сегодня'}</h2><p className="muted">{state.plan.query.basis === 'match' ? 'Для каждого матча — свои предыдущие 7 и 30 дней.' : `Общая граница: ${dateMsk(state.plan.capturedAt)} МСК. Игры после выбранного матча тоже учитываются.`}</p><p className={styles.loadStatus}>Загрузка начата {dateMsk(state.plan.capturedAt)} МСК</p></div><Button type="button" variant="secondary" onClick={download} disabled={!rows.length}>Скачать CSV для Excel</Button></div>
        <div className={styles.reportControls}>
        {state.plan.query.mode === 'match' && state.plan.matches[0]?.match ? <Field id="wr-player" label="Выбранный игрок" hint="Его история входит в среднее своей стороны."><Select value={state.selectedSlot ?? ''} onChange={(event) => state.selectPlayer(Number(event.target.value))}><option value="" disabled>Выбери игрока и сторону</option>{state.plan.matches[0].match.players.map((player) => <option key={player.slot} value={player.slot} disabled={player.missing === 'roster_missing' || player.missing === 'ambiguous'}>{player.slot < 128 ? 'Radiant' : 'Dire'} · {player.heroName} · {player.name ?? (player.accountId ? `ID ${player.accountId}` : 'Аккаунт скрыт')}</option>)}</Select></Field> : null}
        {rows.length > 0 ? <><Field id="wr-window" label="Средний винрейт команд за"><Select value={days} onChange={(event) => setDays(Number(event.target.value) as WindowDays)}><option value={7}>7 дней</option><option value={30}>30 дней</option></Select></Field><Field id="wr-sort" label="Сортировка участников"><Select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="side">По стороне</option><option value="rate_desc">По винрейту ↓</option><option value="rate_asc">По винрейту ↑</option><option value="name">По имени</option></Select></Field></> : null}
        </div>
        {state.plan.query.mode === 'match' && state.plan.matches[0]?.match?.players.every((player) => player.missing === 'roster_missing' || player.missing === 'ambiguous') ? <Alert>OpenDota не вернул состав, доступный для выбора. Обновите данные позже.</Alert> : null}
        {state.plan.series ? <p>Показано {state.plan.series.shown} из {state.plan.series.found} найденных матчей за {state.plan.query.days} дней. {state.plan.series.history.stop !== 'exhausted' && state.plan.series.history.stop !== 'boundary' ? statusText[state.plan.series.history.stop] : ''}</p> : null}
        {state.plan.series && !state.plan.matches.length ? <Alert>{statusText[state.plan.series.status]}. Подходящих матчей в полученной выборке нет.</Alert> : null}
        {state.plan.series && !state.busy ? <div className={styles.actions}>
          {state.plan.series.remainingIds.length ? <Button type="button" variant="secondary" onClick={() => void state.extendSeries()}>Следующие 3 матча · осталось {state.plan.series.remainingIds.length}</Button> : null}
          {state.plan.matches.some((entry) => entry.error) ? <Button type="button" variant="secondary" onClick={() => void state.extendSeries(true)}>Повторить загрузку составов</Button> : null}
        </div> : null}
        {rows.length > 0 ? <>

          <p className={styles.loadStatus} role="status" aria-live="polite">Обработано {received} из {rows.length} участников.{state.busy === 'participants' ? ' Загружаем истории…' : retryable ? state.paused === 'budget' ? ' Пауза после 45 секунд. Полученные данные сохранены.' : state.paused === 'user' ? ' Загрузка остановлена. Полученные данные сохранены.' : ' Часть историй недоступна; можно повторить загрузку.' : ' Загрузка завершена.'}</p>
          {state.busy === 'participants' ? <progress className={styles.progress} value={received} max={rows.length} aria-label="Обработанные участники" /> : null}
          {!state.busy && retryable > 0 ? <Button type="button" variant="secondary" onClick={state.resume}>Продолжить / повторить · {retryable}</Button> : null}
        </> : null}
      </Panel>
      <WinrateReport plan={state.plan} rows={rows} results={state.results} days={days} loading={state.busy === 'participants'} />
    </> : null}
    <details className="details"><summary>Как считаются доля побед и покрытие</summary><div className={`details-content ${styles.method}`}>
      <p>Каждый участник имеет равный вес: 1 победа из 1 игры и 50 из 100 дают среднее 75%. Выбранный игрок включён в свою сторону. Разница сторон показана в процентных пунктах.</p>
      <p>«До начала матча»: игры за предыдущие 7 или 30 дней, завершившиеся строго до его начала. «На сегодня»: те же окна до момента начала загрузки, включая более поздние игры. Сам рассматриваемый матч исключён в обоих случаях. Точные границы доступны у каждого участника.</p>
      <p>Счётчик рядом со средним показывает, сколько игроков учтено. «Все доступные игры» означает, что просмотрена доступная история OpenDota до границы периода; источник может знать не все игры. Лимит 300 записей или ошибка не доказывают полноту окна. Ноль побед отображается как 0%; отсутствие игр — как «—».</p>
      <p>В сводке твоих матчей сначала считаются средние сторон каждого матча, затем среднее по матчам с обеими сторонами. Их веса равны. Уникальные игроки и итоговые числа повторных встреч показаны отдельно. Проценты из разных моментов не объединяются в один процент игрока.</p>
      <p>Загрузка делает паузу через 45 секунд; продолжение сохраняет момент расчёта. Обновление начинает новую загрузку. Кэш в памяти живёт до 5 минут; время исходных данных указано у участников. Все даты — МСК (Europe/Moscow).</p>
    </div></details>
  </PageContainer>;
}
