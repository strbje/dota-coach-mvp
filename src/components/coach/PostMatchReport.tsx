'use client';

import { useState } from 'react';
import { Badge, Button, Panel } from '@/components/ui';
import type { EvidenceRequest } from '@/lib/dota/analyze/timelinePresentation';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { BenchmarkEvidence } from './BenchmarkEvidence';
import { GradesGrid } from './GradesGrid';
import { GoldSources } from './GoldSources';
import { ItemTimeline } from './ItemTimeline';
import { PhaseBreakdown } from './PhaseBreakdown';
import { MatchContextTimeline } from './MatchContextTimeline';
import { TrainingChallengeCard } from './TrainingChallengeCard';
import { formatGameTime } from '@/lib/dota/utils/time';
import { FarmIntervals } from './FarmIntervals';
import { MatchParseControl } from './MatchParseControl';
import styles from './postMatch.module.css';

export function PostMatchReport({ analysis, onRefresh, refreshing = false }: { analysis: PostMatchAnalysis; onRefresh?: () => Promise<boolean>; refreshing?: boolean }) {
  const { review } = analysis;
  const [evidence, setEvidence] = useState<EvidenceRequest>();
  const factors = review.factors.filter((factor) => factor.id !== 'personal-start');
  const otherPriorities = analysis.priorities.filter((priority) => priority.id !== 'lane-farm' && priority.id !== 'lane-events');
  const farmDrop = analysis.farmIntervals?.highlightIndex === undefined ? undefined : analysis.farmIntervals.intervals[analysis.farmIntervals.highlightIndex];
  const firstDeath = review.timeline.find((event) => event.kind === 'death');
  const fallbackEpisode = farmDrop ?? (firstDeath ? { from: Math.max(0, firstDeath.timeSeconds - 20), to: firstDeath.timeSeconds } : undefined);
  function showEvidence(id: string, from: number, to = from, endExclusive = false) {
    setEvidence((previous) => ({ id, from, to, ...(endExclusive ? { endExclusive } : {}), sequence: (previous?.sequence ?? 0) + 1 }));
  }
  const [factorsOpen, setFactorsOpen] = useState(false);
  return <div className={styles.board}>
    <Panel className={styles.outcome}>
      <span className="eyebrow">Результат и ключевые факты</span>
      <h2>{review.headline}</h2>
      <p>{review.summary}</p>
      {factors.length ? <details className={styles.factorDetails} open={factorsOpen} onToggle={(event) => setFactorsOpen(event.currentTarget.open)}>
      <summary><span>Ключевые факты · {factors.length}</span><span className={styles.compactFacts}>{factors.filter((f) => f.stat).map((factor) => <span key={factor.id}><strong>{factor.stat!.value}</strong> {factor.stat!.label}</span>)}</span></summary>
      <div className={styles.factors}>{factors.map((factor) => <article className={styles.factor} key={factor.id}>
        <span className={styles.factorKind}>{factor.confidence === 'observation' ? 'Наблюдение' : 'Возможный фактор'}</span>
        <h3>{factor.title}</h3>
        {factor.stat ? <div className={styles.factorStat}><strong className={factor.stat.value.startsWith('-') ? styles.negative : ''}>{factor.stat.value}</strong><span>{factor.stat.label}</span></div> : null}
        <p><strong>{factor.fact}</strong></p>
        <p className="muted">{factor.meaning}</p>
        <Button type="button" variant="ghost" className={styles.factorLink} onClick={() => showEvidence(factor.evidenceId, factor.timeSeconds, factor.endSeconds)}>Посмотреть отрезок ↗</Button>
      </article>)}</div></details> : null}
      {review.timeline.some((event) => event.kind === 'death') ? <div className={styles.deathTimes} role="group" aria-label="Смерти по времени"><h3>Твои смерти</h3>{review.timeline.filter((event) => event.kind === 'death').map((event) => <Button key={event.id} type="button" variant="secondary" onClick={() => showEvidence(event.id, event.timeSeconds)}>{formatGameTime(event.timeSeconds)}</Button>)}</div> : null}
      {review.coverageNote ? <p className={styles.note}>{review.coverageNote}</p> : null}
    </Panel>
    <aside className={`${styles.plan} ${otherPriorities.length ? '' : styles.planSingle}`} aria-label="План на следующие игры">
      <div className={styles.planHeading}><span className="eyebrow">Твой следующий шаг</span><h2>Личный план</h2></div>
      {otherPriorities.length ? <Panel className={styles.planPanel}>
        {otherPriorities.map((priority) => <article className={styles.priority} key={priority.id}>
          <Badge tone={analysis.priorities[0].id === priority.id ? 'brand' : 'unknown'}>{analysis.priorities[0].id === priority.id ? 'Основной фокус' : 'Дополнительно'}</Badge>
          <h3>{priority.title}</h3>
          <p className={styles.action}>{priority.action}</p>
          <details><summary>Почему этот шаг</summary><p><strong>{priority.fact}</strong></p><p className="muted">{priority.meaning}</p></details>
          {priority.id === 'economy' && farmDrop ? <Button type="button" variant="secondary" onClick={() => showEvidence(`farm-${farmDrop.from}`, farmDrop.from, farmDrop.to, true)}>Открыть отрезок фарма</Button> : null}
          {priority.target && priority.target.source !== 'training' ? <p>{priority.target.text} <span className={styles.note}>{priority.target.source === 'personal' ? 'Твой личный результат' : 'Внешний ориентир'}</span></p> : null}
        </article>)}
      </Panel> : null}
      {!analysis.priorities.length && !analysis.training.goal && fallbackEpisode ? <Panel className={styles.priority}><h3>Разбери один эпизод</h3><p>Посмотри {formatGameTime(fallbackEpisode.from)}–{formatGameTime(fallbackEpisode.to)}. Выбери одно решение, которое стоит повторить или изменить в следующей игре.</p><Button type="button" onClick={() => showEvidence('next-episode', fallbackEpisode.from, fallbackEpisode.to)}>Открыть эпизод</Button></Panel> : null}
      {!analysis.priorities.length && !analysis.training.goal && !fallbackEpisode ? <p className={styles.note}>Данных для личного шага пока недостаточно. Попробуй другой матч.</p> : null}
      <TrainingChallengeCard key={`${analysis.matchId}:${analysis.training.observation.accountId ?? 'anonymous'}:${analysis.training.observation.heroId}`} analysis={analysis} onEvidence={() => showEvidence('lane-at-ten', 600)} />
    </aside>
    <div className={styles.main}>
      <GradesGrid benchmarkSummary={analysis.benchmarkSummary} hero={analysis.hero} grades={analysis.grades} categories={['fights', 'map']} />
      <FarmIntervals report={analysis.farmIntervals} onEvidence={(from, to, endExclusive) => showEvidence(`farm-${from}`, from, to, endExclusive)} />
      {analysis.itemTimings.length ? <ItemTimeline items={analysis.itemTimings} grade={analysis.grades.items} title="Твои ключевые покупки" /> : <p className={styles.note}>Время ключевых покупок недоступно.</p>}
      <MatchContextTimeline key={`${analysis.matchId}:${analysis.training.observation.accountId}:${analysis.training.observation.heroId}`} review={review} items={analysis.itemTimings} durationSeconds={analysis.durationSeconds} evidence={evidence}
        dataAction={analysis.meta?.openDotaParsed === false && onRefresh ? <MatchParseControl key={analysis.matchId} matchId={analysis.matchId} onRefresh={onRefresh} refreshing={refreshing} /> : undefined} />
      <details className="details">
        <summary>Подробности и источники</summary>
        <div className="details-content">
          {review.strengths.length ? <section className={styles.strengths} aria-label="Что сохранить в своей игре"><h3>Что стоит повторить</h3>{review.strengths.map((text) => <p key={text}>{text}</p>)}</section> : null}
          <BenchmarkEvidence benchmarkSummary={analysis.benchmarkSummary} hero={analysis.hero} />
          {Object.values(analysis.economyByPhase ?? {}).some((phase) => phase && (phase.lhPerMinuteInPhase !== undefined || phase.goldPerMinuteInPhase !== undefined || phase.xpPerMinuteInPhase !== undefined)) ? <PhaseBreakdown economyByPhase={analysis.economyByPhase} deathsByPhase={analysis.deathsByPhase} itemTimings={analysis.itemTimings} /> : null}
          {analysis.goldReasons?.grouped.length ? <GoldSources reasons={analysis.goldReasons} /> : null}
          {analysis.farmProfile && Object.values(analysis.farmProfile).some((value) => value !== undefined) ? <Panel><h3>Добивания и убийства</h3><ul>{([['laneKills', 'Крипы на линии'], ['neutralKills', 'Нейтралы'], ['ancientKills', 'Эншенты'], ['heroKills', 'Герои'], ['roshanKills', 'Рошан'], ['towerKills', 'Башни']] as const).map(([key, label]) => analysis.farmProfile![key] === undefined ? null : <li key={key}>{label}: {analysis.farmProfile![key]}</li>)}</ul></Panel> : null}
          <p className="muted">Источник: OpenDota{analysis.stratz?.deathTimings ? ', события смертей — STRATZ' : ''}.</p>
        </div>
      </details>
    </div>
  </div>;
}
