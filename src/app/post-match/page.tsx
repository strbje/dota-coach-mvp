'use client';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { MatchIdForm } from '@/components/coach/MatchIdForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale } from '@/components/layout/LocaleProvider';
import { Alert, Badge, Button, Field, Panel, Select } from '@/components/ui';
import type { MatchPlayerOption } from '@/lib/dota/selection/matchPlayers';
import { getPostMatchErrorCopy, getUiCopy } from '@/lib/i18n/uiCopy';
import { isPostMatchSuccessPayload, type PostMatchSuccessPayload as Payload } from '@/lib/dota/validation/postMatchResponse';
import { PostMatchReport } from '@/components/coach/PostMatchReport';
import { formatGameTime } from '@/lib/dota/constants/items';
import styles from '@/components/coach/postMatch.module.css';

export default function PostMatchPage() {
  const { locale } = useLocale();
  const [matchId, setMatchId] = useState('8781054570');
  const [showSelection, setShowSelection] = useState(true);
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

  useEffect(() => () => { playersAbortController.current?.abort(); analysisAbortController.current?.abort(); }, []);
  useEffect(() => { if (data) document.getElementById('report-title')?.focus(); }, [data]);

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
      if (!isPostMatchSuccessPayload(payload) || payload.analysis.matchId !== Number(matchId)) {
        setAnalysisErrorCode('POST_MATCH_FAILED');
        return;
      }
      setData(payload);
      setShowSelection(false);
    } catch {
      if (controller.signal.aborted || requestSequence !== analysisRequestSequence.current) return;
      setAnalysisErrorCode('POST_MATCH_FAILED');
    } finally {
      if (requestSequence === analysisRequestSequence.current) setLoading(false);
    }
  }

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

  const selectedPlayer = players.find((player) => String(player.playerSlot) === selectedSlot);
  return (
    <PageContainer width="workspace" className={styles.workspace}>
      <header className={styles.matchHeader}>
        <div className={styles.identity}>
          <span className="eyebrow">{analysis ? 'Разбор матча' : copy.eyebrow}</span>
          <h1 id="report-title" tabIndex={-1}>{analysis ? analysis.hero : copy.title}</h1>
          {analysis ? <div className={styles.meta}>
            <Badge tone={analysis.result === 'win' ? 'success' : 'danger'}>{analysis.result === 'win' ? 'Победа' : 'Поражение'}</Badge>
            <span>{selectedPlayer?.playerName ?? 'Выбранный игрок'}</span>
            <span>Керри</span><span>{formatGameTime(analysis.durationSeconds)}</span><span>Матч {analysis.matchId}</span>
          </div> : <p className="muted">Разбери ключевые отрезки и выбери одну цель на следующую игру.</p>}
        </div>
        {analysis ? <Button type="button" variant="secondary" aria-expanded={showSelection} aria-controls="match-selection" onClick={() => setShowSelection((value) => !value)}>{showSelection ? 'Скрыть выбор' : 'Матч и состав · изменить'}</Button> : null}
      </header>
      <div id="match-selection" hidden={!showSelection}>
        <Panel className={styles.formGrid}>
          <form className="stack" onSubmit={loadPlayers} aria-busy={loadingPlayers}>
            <MatchIdForm matchId={matchId} label={copy.matchIdLabel} hint={copy.matchIdHint} onChange={changeMatchId} />
            <Button type="submit" loading={loadingPlayers} loadingLabel="Загружаем игроков…">Загрузить игроков</Button>
            {loadingPlayers ? <Alert tone="info">Загружаем состав матча…</Alert> : null}
            {playersErrorCode ? <Alert tone="danger">{getPostMatchErrorCopy(locale, playersErrorCode)}</Alert> : null}
          </form>
          <div className="stack">
            {playersLoaded && players.length === 0 ? <Alert tone="unknown">В матче не найдены игроки, доступные для выбора.</Alert> : null}
            {players.length > 0 && players.length < 10 ? <Alert tone="unknown">Доступна часть состава: {players.length} из 10 игроков.</Alert> : null}
            {players.length > 0 ? <form className="stack" onSubmit={submit} aria-busy={loading}>
              <Field id="match-player" label="Игрок" hint="Выбери героя и сторону. Сейчас полный разбор доступен для керри.">
                <Select value={selectedSlot} onChange={(event) => changeSelectedSlot(event.target.value)}>
                  <option value="">Выбери игрока</option>
                  {players.map((player) => <option key={player.playerSlot} value={player.playerSlot}>{playerOptionLabel(player)}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={selectedSlot === ''} loading={loading} loadingLabel={copy.loading}>{copy.submit}</Button>
              {loading ? <Alert tone="info">{copy.loadingStatus}</Alert> : null}
              {analysisErrorCode ? <Alert tone="danger">{getPostMatchErrorCopy(locale, analysisErrorCode)}</Alert> : null}
            </form> : !loadingPlayers && !playersErrorCode && !playersLoaded ? <p className={`muted ${styles.empty}`}>Сначала загрузи матч, затем выбери себя в составе. Разбор отделит командный результат от твоих действий.</p> : null}
          </div>
        </Panel>
      </div>
      {analysis ? <PostMatchReport analysis={analysis} /> : null}
    </PageContainer>
  );
}
