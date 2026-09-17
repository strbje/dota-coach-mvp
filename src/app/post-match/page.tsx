'use client';
import { type FormEvent, useRef, useState } from 'react';
import { BenchmarkEvidence } from '@/components/coach/BenchmarkEvidence';
import { CoachSummaryCard } from '@/components/coach/CoachSummaryCard';
import { GradesGrid } from '@/components/coach/GradesGrid';
import { ItemTimeline } from '@/components/coach/ItemTimeline';
import { MatchIdForm } from '@/components/coach/MatchIdForm';
import { PhaseBreakdown } from '@/components/coach/PhaseBreakdown';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale } from '@/components/layout/LocaleProvider';
import { Alert, Badge, Button, Field, Panel, Select } from '@/components/ui';
import type { MatchPlayerOption } from '@/lib/dota/selection/matchPlayers';
import type { MatchPhase } from '@/lib/dota/types/domain';
import { getPostMatchErrorCopy, getUiCopy } from '@/lib/i18n/uiCopy';
import { isPostMatchSuccessPayload, type PostMatchSuccessPayload as Payload } from '@/lib/dota/validation/postMatchResponse';
const PHASE_LABELS: Record<MatchPhase, string> = { laning: 'линия', earlyMid: 'ранняя середина', midGame: 'мидгейм', lateGame: 'лейт' };
const ROLE_LABELS: Record<string, string> = { carry: 'Керри', mid: 'Мидер', offlane: 'Оффлейнер', support: 'Поддержка', 'hard support': 'Полная поддержка' };
export default function PostMatchPage() {
  const { locale } = useLocale();
  const [matchId, setMatchId] = useState('8781054570');
  const [data, setData] = useState<Payload | null>(null);
  const [players, setPlayers] = useState<MatchPlayerOption[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playersErrorCode, setPlayersErrorCode] = useState<string | null>(null);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(null);
  const playersRequestSequence = useRef(0);
  const analysisRequestSequence = useRef(0);
  const playersAbortController = useRef<AbortController | null>(null);
  const analysisAbortController = useRef<AbortController | null>(null);
  const analysis = data?.analysis;
  // Keep the result consistently Russian until rules expose stable message IDs.
  const copy = getUiCopy(analysis ? 'ru' : locale).postMatch;

  async function loadPlayers(event: FormEvent) {
    event.preventDefault();
    setData(null);
    setPlayers([]);
    setPlayersLoaded(false);
    setSelectedSlot('');
    setPlayersErrorCode(null);
    setAnalysisErrorCode(null);
    analysisAbortController.current?.abort();
    analysisRequestSequence.current += 1;
    setLoading(false);
    setLoadingPlayers(true);
    playersAbortController.current?.abort();
    const controller = new AbortController();
    playersAbortController.current = controller;
    const requestSequence = ++playersRequestSequence.current;

    try {
      const response = await fetch(`/api/post-match/players?matchId=${encodeURIComponent(matchId)}`, { signal: controller.signal });
      const payload = await response.json() as { players?: MatchPlayerOption[]; errorCode?: unknown };
      if (requestSequence !== playersRequestSequence.current) return;
      if (!response.ok || !Array.isArray(payload.players)) {
        setPlayersErrorCode(typeof payload.errorCode === 'string' ? payload.errorCode : 'POST_MATCH_FAILED');
        return;
      }
      setPlayers(payload.players);
      setPlayersLoaded(true);
    } catch {
      if (controller.signal.aborted || requestSequence !== playersRequestSequence.current) return;
      setPlayersErrorCode('POST_MATCH_FAILED');
    } finally {
      if (requestSequence === playersRequestSequence.current) setLoadingPlayers(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (selectedSlot === '') return;
    setData(null);
    setAnalysisErrorCode(null);
    setLoading(true);
    analysisAbortController.current?.abort();
    const controller = new AbortController();
    analysisAbortController.current = controller;
    const requestSequence = ++analysisRequestSequence.current;

    try {
      const response = await fetch('/api/post-match/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: Number(matchId), selector: { playerSlot: Number(selectedSlot) } }),
        signal: controller.signal
      });
      const payload = await response.json() as Payload | { errorCode?: unknown };
      if (requestSequence !== analysisRequestSequence.current) return;
      if (!response.ok) {
        const responseError = payload as { errorCode?: unknown };
        setAnalysisErrorCode(
          typeof responseError.errorCode === 'string'
            ? responseError.errorCode
            : 'POST_MATCH_FAILED'
        );
        return;
      }
      if (!isPostMatchSuccessPayload(payload)) {
        setAnalysisErrorCode('POST_MATCH_FAILED');
        return;
      }
      setData(payload);
    } catch {
      if (controller.signal.aborted || requestSequence !== analysisRequestSequence.current) return;
      setAnalysisErrorCode('POST_MATCH_FAILED');
    } finally {
      if (requestSequence === analysisRequestSequence.current) setLoading(false);
    }
  }

  const deaths = analysis?.stratz?.deathsByPhase ?? analysis?.deathsByPhase;
  const changeMatchId = (value: string) => {
    playersAbortController.current?.abort();
    analysisAbortController.current?.abort();
    playersRequestSequence.current += 1;
    analysisRequestSequence.current += 1;
    setMatchId(value);
    setPlayers([]);
    setPlayersLoaded(false);
    setSelectedSlot('');
    setData(null);
    setPlayersErrorCode(null);
    setAnalysisErrorCode(null);
    setLoadingPlayers(false);
    setLoading(false);
  };
  const changeSelectedSlot = (value: string) => {
    analysisAbortController.current?.abort();
    analysisRequestSequence.current += 1;
    setSelectedSlot(value);
    setData(null);
    setAnalysisErrorCode(null);
    setLoading(false);
  };
  const playerOptionLabel = (player: MatchPlayerOption) => {
    const identity = player.playerName ? ` · ${player.playerName}` : '';
    const kda = player.kills !== undefined && player.deaths !== undefined && player.assists !== undefined
      ? ` · ${player.kills}/${player.deaths}/${player.assists}`
      : '';
    return `${player.isRadiant ? 'Radiant' : 'Dire'} · ${player.heroName}${identity}${kda}`;
  };

  return (
    <PageContainer className="page-stack">
<header className="stack">
<span className="eyebrow">{copy.eyebrow}</span>
<h1 className="page-title">{copy.title}</h1>
<p className="muted">{copy.lead}</p>
</header>
<Panel>
<form className="stack" onSubmit={loadPlayers} aria-busy={loadingPlayers}>
<MatchIdForm
  matchId={matchId}
  label={copy.matchIdLabel}
  hint={copy.matchIdHint}
  onChange={changeMatchId}
/>
<Button type="submit" loading={loadingPlayers} loadingLabel="Загружаем игроков…">Загрузить игроков</Button>
{loadingPlayers ? <Alert tone="info">Загружаем состав матча…</Alert> : null}
{playersErrorCode ? <Alert tone="danger">{getPostMatchErrorCopy(locale, playersErrorCode)}</Alert>
 : null}{!analysis && !loading && !loadingPlayers && !playersErrorCode && !playersLoaded ? <Alert tone="unknown">{copy.initial}</Alert>
 : null}</form>
{playersLoaded && players.length === 0 ? <Alert tone="unknown">В матче не найдены игроки, доступные для выбора.</Alert> : null}
{players.length > 0 && players.length < 10 ? <Alert tone="unknown">OpenDota вернул неполный состав: доступно игроков — {players.length}.</Alert> : null}
{players.length > 0 ? <form className="stack subsection" onSubmit={submit} aria-busy={loading}>
<Field id="match-player" label="Игрок" hint="Выберите героя и сторону из состава матча.">
<Select value={selectedSlot} onChange={(event) => changeSelectedSlot(event.target.value)}>
<option value="">Выберите игрока</option>
{players.map((player) => <option key={player.playerSlot} value={player.playerSlot}>{playerOptionLabel(player)}</option>)}
</Select>
</Field>
<p className="muted">Сейчас полный тренерский разбор доступен для carry.</p>
<Button type="submit" disabled={selectedSlot === ''} loading={loading} loadingLabel={copy.loading}>{copy.submit}</Button>
{loading ? <Alert tone="info">{copy.loadingStatus}</Alert> : null}
{analysisErrorCode ? <Alert tone="danger">{getPostMatchErrorCopy(locale, analysisErrorCode)}</Alert> : null}
</form> : null}
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
<BenchmarkEvidence benchmarkSummary={analysis.benchmarkSummary} hero={analysis.hero} />
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
{analysis.goldReasons?.constantsAvailable ? <><ul>{analysis.goldReasons.groups.map((entry) => <li key={entry.group}>{entry.label}: {Math.round(entry.amount).toLocaleString('ru-RU')} золота</li>
)}{analysis.goldReasons.unknownAmount > 0 ? <li>Другое / нераспознано: {Math.round(analysis.goldReasons.unknownAmount).toLocaleString('ru-RU')} золота</li>
 : null}</ul>
{!analysis.goldReasons.breakdownComplete ? <><Alert tone="unknown">Разбивка по источникам неполная. Ниже показан резервный профиль по числу добиваний и убийств — это не сумма золота.</Alert>
<ul>
<li>Лейн-крипы: {analysis.farmProfile.laneKills ?? '—'}</li>
<li>Нейтралы: {analysis.farmProfile.neutralKills ?? '—'}</li>
<li>Древние: {analysis.farmProfile.ancientKills ?? '—'}</li>
<li>Убийства героев: {analysis.farmProfile.heroKills ?? '—'}</li>
</ul></> : null}</>
 : <>
<ul>
<li>Лейн-крипы: {analysis.farmProfile.laneKills ?? '—'}</li>

<li>Нейтралы: {analysis.farmProfile.neutralKills ?? '—'}</li>

<li>Древние: {analysis.farmProfile.ancientKills ?? '—'}</li>

<li>Убийства героев: {analysis.farmProfile.heroKills ?? '—'}</li>
</ul>
<Alert tone="unknown">Разбивка золота по источникам недоступна. Показаны количества событий, а не золото.</Alert>
</>}</Panel>
 : <Alert tone="unknown">Недостаточно данных о профиле фарма.</Alert>
}</div>
</details>
</div>
 : null}</PageContainer>
  );
}
