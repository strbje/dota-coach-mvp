'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Panel } from '@/components/ui';
import type { EvidenceRequest } from '@/lib/dota/analyze/timelinePresentation';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { BenchmarkEvidence } from './BenchmarkEvidence';
import { GradesGrid } from './GradesGrid';
import { ItemTimeline } from './ItemTimeline';
import { PhaseBreakdown } from './PhaseBreakdown';
import { MatchContextTimeline } from './MatchContextTimeline';
import { TrainingChallengeCard } from './TrainingChallengeCard';
import styles from './postMatch.module.css';

export function PostMatchReport({ analysis }: { analysis: PostMatchAnalysis }) {
  const { review } = analysis;
  const [evidence, setEvidence] = useState<EvidenceRequest>();
  const factors = review.factors.filter((factor) => factor.id !== 'personal-start');
  const otherPriorities = analysis.priorities.filter((priority) => priority.id !== 'lane-farm' && priority.id !== 'lane-events');
  function showEvidence(id: string, from: number, to = from) {
    setEvidence((previous) => ({ id, from, to, sequence: (previous?.sequence ?? 0) + 1 }));
  }
  const [factorsOpen, setFactorsOpen] = useState(true);
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1050px)');
    const update = () => setFactorsOpen(!compact.matches);
    update();
    compact.addEventListener('change', update);
    return () => compact.removeEventListener('change', update);
  }, []);
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
      {review.coverageNote ? <p className={styles.note}>{review.coverageNote}</p> : null}
    </Panel>
    <aside className={`${styles.plan} ${otherPriorities.length ? '' : styles.planSingle}`} aria-label="План на следующие игры">
      <div className={styles.planHeading}><span className="eyebrow">Твой следующий шаг</span><h2>Личный план</h2></div>
      {otherPriorities.length ? <Panel className={styles.planPanel}>
        {otherPriorities.map((priority) => <article className={styles.priority} key={priority.id}>
          <Badge tone={analysis.priorities[0].id === priority.id ? 'brand' : 'unknown'}>{analysis.priorities[0].id === priority.id ? 'Основной фокус' : 'Дополнительно'}</Badge>
          <h3>{priority.title}</h3>
          <p><strong>{priority.fact}</strong></p>
          <p className="muted">{priority.meaning}</p>
          <p className={styles.action}>{priority.action}</p>
          {priority.target && priority.target.source !== 'training' ? <p>{priority.target.text} <span className={styles.note}>{priority.target.source === 'personal' ? 'Твой личный результат' : 'Внешний ориентир'}</span></p> : null}
        </article>)}
      </Panel> : null}
      <TrainingChallengeCard key={`${analysis.matchId}:${analysis.training.observation.accountId ?? 'anonymous'}:${analysis.training.observation.heroId}`} analysis={analysis} onEvidence={() => showEvidence('lane-at-ten', 600)} />
    </aside>
    <div className={styles.main}>
      {review.strengths.length ? <section className={styles.strengths} aria-label="Что сохранить в своей игре"><h3>Что стоит повторить</h3>{review.strengths.map((text) => <p key={text}>{text}</p>)}</section> : null}
      <ItemTimeline items={analysis.itemTimings} grade={analysis.grades.items} title="Твои ключевые покупки" />
      <MatchContextTimeline key={`${analysis.matchId}:${analysis.training.observation.accountId}:${analysis.training.observation.heroId}`} review={review} items={analysis.itemTimings} durationSeconds={analysis.durationSeconds} evidence={evidence} />
      <details className="details">
        <summary>Оценки, фазы и источники данных</summary>
        <div className="details-content">
          <GradesGrid grades={analysis.grades} categories={['fights', 'map']} />
          <BenchmarkEvidence benchmarkSummary={analysis.benchmarkSummary} hero={analysis.hero} />
          <PhaseBreakdown economyByPhase={analysis.economyByPhase} deathsByPhase={analysis.deathsByPhase} itemTimings={analysis.itemTimings} />
          {analysis.goldReasons?.constantsAvailable ? <Panel><h3>Источники золота</h3><ul>{analysis.goldReasons.groups.map((entry) => <li key={entry.group}>{entry.label}: {Math.round(entry.amount).toLocaleString('ru-RU')} золота</li>)}{analysis.goldReasons.unknownAmount > 0 ? <li>Другие источники: {Math.round(analysis.goldReasons.unknownAmount).toLocaleString('ru-RU')} золота</li> : null}</ul>{!analysis.goldReasons.breakdownComplete ? <p className="muted">Разбивка неполная.</p> : null}</Panel> : null}
          {analysis.farmProfile ? <Panel><h3>Добивания и убийства</h3><ul><li>Лейн-крипы: {analysis.farmProfile.laneKills ?? '—'}</li><li>Нейтралы: {analysis.farmProfile.neutralKills ?? '—'}</li><li>Древние: {analysis.farmProfile.ancientKills ?? '—'}</li><li>Убийства героев: {analysis.farmProfile.heroKills ?? '—'}</li></ul></Panel> : null}
          <p className="muted">Источник: OpenDota{analysis.stratz?.deathTimings ? ', события смертей — STRATZ' : ''}. Средние STRATZ и координаты в выводах не используются. Разница золота описывает ресурсы команд; сама по себе она не устанавливает причинность.</p>
        </div>
      </details>
    </div>
  </div>;
}
