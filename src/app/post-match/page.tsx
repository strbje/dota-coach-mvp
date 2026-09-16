'use client';
import { type FormEvent, useState } from 'react';
import { BenchmarkEvidence } from '@/components/coach/BenchmarkEvidence';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { GradesGrid } from '@/components/coach/GradesGrid';
import { ItemTimeline } from '@/components/coach/ItemTimeline';
import { MatchIdForm } from '@/components/coach/MatchIdForm';
import { PhaseBreakdown } from '@/components/coach/PhaseBreakdown';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale } from '@/components/layout/LocaleProvider';
import { Alert, Badge, Button, Panel } from '@/components/ui';
import type { MatchPhase } from '@/lib/dota/types/domain';
import { getPostMatchErrorCopy, getUiCopy } from '@/lib/i18n/uiCopy';
import { isPostMatchSuccessPayload, type PostMatchSuccessPayload as Payload } from '@/lib/dota/validation/postMatchResponse';
const PHASE_LABELS: Record<MatchPhase, string> = { laning: 'линия', earlyMid: 'ранняя середина', midGame: 'мидгейм', lateGame: 'лейт' };
const ROLE_LABELS: Record<string, string> = { carry: 'Керри', mid: 'Мидер', offlane: 'Оффлейнер', support: 'Поддержка', 'hard support': 'Полная поддержка' };
export default function PostMatchPage() {
  const { locale } = useLocale();
  const [matchId, setMatchId] = useState('8781054570');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const analysis = data?.analysis;
  // Keep the result consistently Russian until rules expose stable message IDs.
  const copy = getUiCopy(analysis ? 'ru' : locale).postMatch;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setData(null);
    setErrorCode(null);
    setLoading(true);

    try {
      const response = await fetch('/api/post-match/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: Number(matchId), hero: 'Lifestealer' })
      });
      const payload = await response.json() as Payload | { errorCode?: unknown };
      if (!response.ok) {
        const responseError = payload as { errorCode?: unknown };
        setErrorCode(
          typeof responseError.errorCode === 'string'
            ? responseError.errorCode
            : 'POST_MATCH_FAILED'
        );
        return;
      }
      if (!isPostMatchSuccessPayload(payload)) {
        setErrorCode('POST_MATCH_FAILED');
        return;
      }
      setData(payload);
    } catch {
      setErrorCode('POST_MATCH_FAILED');
    } finally {
      setLoading(false);
    }
  }

  const deaths = analysis?.stratz?.deathsByPhase ?? analysis?.deathsByPhase;

  return (
    <PageContainer className="page-stack">
<header className="stack">
<span className="eyebrow">{copy.eyebrow}</span>
<h1 className="page-title">{copy.title}</h1>
<p className="muted">{copy.lead}</p>
</header>
<Panel>
<form className="stack" onSubmit={submit} aria-busy={loading}>
<MatchIdForm
  matchId={matchId}
  label={copy.matchIdLabel}
  hint={copy.matchIdHint}
  onChange={setMatchId}
/>
<Button type="submit" loading={loading} loadingLabel={copy.loading}>{copy.submit}</Button>
{loading ? <Alert tone="info">{copy.loadingStatus}</Alert> : null}
{errorCode ? <Alert tone="danger">{getPostMatchErrorCopy(locale, errorCode)}</Alert>
 : null}{!analysis && !loading && !errorCode ? <Alert tone="unknown">{copy.initial}</Alert>
 : null}</form>
</Panel>
{analysis ? <div className="page-stack">
<Panel>
<h2 className="section-heading">Контекст матча</h2>

<div className="result-context">
<div className="context-item">
<span>Match ID</span>
<strong>{analysis.matchId}</strong></div>

<div className="context-item">
<span>Герой</span>
<strong>{analysis.hero ?? '—'}</strong></div>

<div className="context-item">
<span>Роль</span>
<strong>{ROLE_LABELS[analysis.role?.toLowerCase()] ?? 'Недостаточно данных'}</strong></div>

<div className="context-item">
<span>Результат</span>
<Badge tone={analysis.result === 'win' ? 'success' : 'danger'}>{analysis.result === 'win' ? 'Победа' : 'Поражение'}</Badge>
</div>
</div>
</Panel>

<Panel className="verdict">
<span className="eyebrow">Итог тренера</span>

<div className="verdict-grid">
<div>
<h2>Что определило матч</h2>
<p>{analysis.finalVerdict.mainReason}</p>
</div>

<div>
<h3>Главный риск</h3>
<p>{analysis.finalVerdict.biggestRisk}</p>
</div>

<div>
<h3>Фокус на следующую игру</h3>
<p>{analysis.finalVerdict.nextMatchFocus}</p>
</div>
</div>
</Panel>
<div className="grid grid-2">
<CoachSummaryCard title="Главные ошибки" lines={analysis.topMistakes} />
<CoachSummaryCard title="Что сделать в следующей игре" lines={analysis.nextGameAdjustments} /></div>
<GradesGrid grades={analysis.grades} />
<details className="details">
<summary>Показать доказательства и подробности</summary>

<div className="details-content">
<BenchmarkEvidence benchmarkSummary={analysis.benchmarkSummary} heroAverageComparison={analysis.heroAverageComparison} />
<ItemTimeline items={analysis.itemTimings} />
<PhaseBreakdown economyByPhase={analysis.economyByPhase} deathsByPhase={deaths} itemTimings={analysis.itemTimings} />{deaths ? <Panel>
<h3>Смерти по фазам</h3>
<ul>{Object.entries(deaths).map(([phase, count]) => <li key={phase}>{PHASE_LABELS[phase as MatchPhase]}: <strong>{count}</strong></li>
)}</ul>
{analysis.stratz?.deathTimings?.length ? <ul>{analysis.stratz.deathTimings.map((entry) => <li key={`${entry.time}-${entry.phase}`}>{entry.time} — {PHASE_LABELS[entry.phase]}</li>
)}</ul>
 : null}</Panel>
 : <Alert tone="unknown">Недостаточно данных о смертях по фазам.</Alert>
}{analysis.farmProfile ? <Panel>
<h3>Профиль фарма</h3>
{analysis.goldReasons?.constantsAvailable ? <ul>{analysis.goldReasons.groups.map((entry) => <li key={entry.group}>{entry.label}: {Math.round(entry.amount).toLocaleString('ru-RU')} золота</li>
)}{analysis.goldReasons.unknownAmount > 0 ? <li>Другое / нераспознано: {Math.round(analysis.goldReasons.unknownAmount).toLocaleString('ru-RU')} золота</li>
 : null}</ul>
 : <>
<ul>
<li>Лейн-крипы: {analysis.farmProfile.laneKills ?? '—'}</li>

<li>Нейтралы: {analysis.farmProfile.neutralKills ?? '—'}</li>

<li>Древние: {analysis.farmProfile.ancientKills ?? '—'}</li>

<li>Убийства героев: {analysis.farmProfile.heroKills ?? '—'}</li>
</ul>
<Alert tone="unknown">Разбивка золота по источникам недоступна.</Alert>
</>}</Panel>
 : <Alert tone="unknown">Недостаточно данных о профиле фарма.</Alert>
}</div>
</details>
</div>
 : null}</PageContainer>
  );
}
