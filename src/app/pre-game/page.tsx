'use client';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/layout/LocaleProvider';
import { getPreGameErrorCopy, getUiCopy } from '@/lib/i18n/uiCopy';
import { localizePreGameAnalysis, preGameHeadings } from '@/lib/i18n/preGameCopy';
import { BuildBranchesCard } from '@/components/coach/BuildBranchesCard';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { StagePlanCard } from '@/components/coach/StagePlanCard';
import { TargetPriorityCard } from '@/components/coach/TargetPriorityCard';
import { ThreatsCard } from '@/components/coach/ThreatsCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Badge, Button, Field, Input, Panel } from '@/components/ui';
import { isPreGameAnalysis } from '@/lib/dota/validation/preGameResponse';
import { laneHero, validLaneInput } from '@/lib/dota/validation/preGameDraft';
import type { PreGameAnalysis } from '@/lib/dota/types/domain';

export default function PreGamePage() {
  const { locale } = useLocale();
  const copy = getUiCopy(locale).preGame;
  const [picks, setPicks] = useState(['', '', '']);
  const [result, setResult] = useState<{ input: string; data: PreGameAnalysis }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const input = JSON.stringify({ hero: 'Lifestealer', role: 'carry', allies: ['Lifestealer', laneHero(picks[0])], enemies: picks.slice(1).map(laneHero), lanes: { safe: { ally: ['Lifestealer', laneHero(picks[0])], enemy: picks.slice(1).map(laneHero) } } });
  const stale = Boolean(result && result.input !== input);
  const data = useMemo(() => result && !stale ? localizePreGameAnalysis(result.data, locale) : null, [result, stale, locale]);
  useEffect(() => () => request.current?.abort(), []);
  function change(next: string[]) { request.current?.abort(); sequence.current++; setLoading(false); setError(undefined); setPicks(next); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validLaneInput(JSON.parse(input))) { setError('Укажи трёх разных героев. Lifestealer уже выбран за тебя.'); return; }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const id = ++sequence.current;
    setLoading(true); setError(undefined);
    try {
      const response = await fetch('/api/pre-game/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: input, signal: controller.signal });
      const payload = await response.json();
      if (id !== sequence.current) return;
      if (!response.ok) { setError(getPreGameErrorCopy(locale, payload.errorCode)); return; }
      if (!isPreGameAnalysis(payload)) throw new Error('Invalid plan');
      setResult({ input, data: payload });
    } catch { if (!controller.signal.aborted && id === sequence.current) setError(getPreGameErrorCopy(locale, 'PRE_GAME_FAILED')); }
    finally { if (id === sequence.current) setLoading(false); }
  }
  return <PageContainer atmosphere="pre-game" className="page-stack">
    <header className="stack"><span className="eyebrow">До игры</span><h1 className="page-title">План на линию</h1><p className="muted">{copy.lead}</p></header>
    <Panel><form className="stack" onSubmit={submit} aria-busy={loading}>
      <div><Badge tone="info">Lifestealer · керри</Badge><p className="muted">Пока доступен этот герой и роль. План учитывает пары на линии; полный драфт команды здесь не оценивается.</p></div>
      <div className="grid grid-3">{['Твой саппорт', 'Соперник 1', 'Соперник 2'].map((label, index) => <Field key={label} id={`lane-pick-${index}`} label={label} hint={index === 0 ? 'Название героя, например Lion. Можно написать «Лион».' : undefined}><Input value={picks[index]} maxLength={60} required onChange={(event) => change(picks.map((value, i) => i === index ? event.target.value : value))} /></Field>)}</div>
      <div className="inline"><Button type="submit" loading={loading} loadingLabel={copy.loading}>{stale ? 'Обновить план' : copy.submit}</Button><Button type="button" variant="ghost" onClick={() => change(['Lion', 'Legion Commander', 'Tusk'])}>Заполнить пример: Lion против Legion Commander и Tusk</Button></div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {stale ? <Alert tone="warning">Пики изменились — обнови план.</Alert> : null}
    </form></Panel>
    {data ? <div className="page-stack">
      <Panel><h2>Линия: {JSON.parse(result!.input).lanes.safe.ally.join(' + ')} против {JSON.parse(result!.input).lanes.safe.enemy.join(' + ')}</h2>
        <Badge tone={data.lane.difficulty === 'unknown' ? 'unknown' : data.lane.difficulty === 'hard' ? 'warning' : 'info'}>{preGameHeadings[locale].difficulty[data.lane.difficulty]}</Badge>
        <ul>{data.lane.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </Panel>
      <div className="grid grid-2"><ThreatsCard threats={data.threats} locale={locale}/><Panel><h3>Стартовый закуп</h3><ul>{data.startingItems.map((item) => <li key={item.name}><strong>{item.name}</strong> — {item.reason}</li>)}</ul></Panel></div>
      <BuildBranchesCard branches={data.buildBranches} locale={locale}/>
      <StagePlanCard stagePlan={data.stagePlan} locale={locale}/>
      <TargetPriorityCard targetPriority={data.targetPriority} locale={locale}/>
      <details className="details"><summary>План после линии и дополнительные советы</summary><div className="details-content"><CoachSummaryCard title={copy.mapPlan} lines={[...data.mapPlan.early, ...data.mapPlan.mid, ...data.mapPlan.late]}/><CoachSummaryCard title={copy.mistakes} lines={data.mistakesToAvoid}/></div></details>
    </div> : null}
  </PageContainer>;
}
