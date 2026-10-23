'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Panel } from '@/components/ui';
import type { PostMatchAnalysis } from '@/lib/dota/types/domain';
import { BenchmarkEvidence } from './BenchmarkEvidence';
import { GradesGrid } from './GradesGrid';
import { ItemTimeline } from './ItemTimeline';
import { PhaseBreakdown } from './PhaseBreakdown';
import { MatchContextTimeline } from './MatchContextTimeline';
import { TrainingChallengeCard } from './TrainingChallengeCard';
import styles from './postMatch.module.css';

function showEvidence(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center' });
}

export function PostMatchReport({ analysis }: { analysis: PostMatchAnalysis }) {
  const { review } = analysis;
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
      {review.factors.length ? <details className={styles.factorDetails} open={factorsOpen} onToggle={(event) => setFactorsOpen(event.currentTarget.open)}>
      <summary><span>Ключевые факты · {review.factors.length}</span><span className={styles.compactFacts}>{review.factors.filter((f) => f.stat).map((factor) => <span key={factor.id}><strong>{factor.stat!.value}</strong> {factor.stat!.label}</span>)}</span></summary>
      <div className={styles.factors}>{review.factors.map((factor) => <article className={styles.factor} key={factor.id}>
        <span className={styles.factorKind}>{factor.confidence === 'observation' ? 'Наблюдение' : 'Возможный фактор'}</span>
        <h3>{factor.title}</h3>
        {factor.stat ? <div className={styles.factorStat}><strong className={factor.stat.value.startsWith('-') ? styles.negative : ''}>{factor.stat.value}</strong><span>{factor.stat.label}</span></div> : null}
        <p><strong>{factor.fact}</strong></p>
        <p className="muted">{factor.meaning}</p>
        <Button type="button" variant="ghost" className={styles.factorLink} onClick={() => showEvidence(factor.evidenceId)}>Посмотреть отрезок ↗</Button>
      </article>)}</div></details> : null}
      {review.coverageNote ? <p className={styles.note}>{review.coverageNote}</p> : null}
    </Panel>
    <aside className={styles.plan} aria-label="План на следующие игры">
      <Panel className={styles.planPanel}>
        <span className="eyebrow">Твой следующий шаг</span>
        <h2>Личный план</h2>
        {analysis.priorities.length ? analysis.priorities.map((priority, index) => <article className={styles.priority} key={priority.id}>
          <Badge tone={index === 0 ? 'brand' : 'unknown'}>{index === 0 ? 'Основной фокус' : 'Дополнительно'}</Badge>
          <h3>{priority.title}</h3>
          <p><strong>{priority.fact}</strong></p>
          <p className="muted">{priority.meaning}</p>
          <p className={styles.action}>{priority.action}</p>
          {priority.target && priority.target.source !== 'training' ? <p>{priority.target.text} <span className={styles.note}>{priority.target.source === 'personal' ? 'Твой личный результат' : 'Внешний ориентир'}</span></p> : null}
        </article>) : <p>Явного приоритета для исправления нет. {analysis.training.goal ? 'Попробуй тренировку добивания и проверь результат на следующих играх.' : 'Вернись к эпизодам матча, которые ты сам хочешь проверить.'}</p>}
      </Panel>
      <TrainingChallengeCard key={`${analysis.matchId}:${analysis.training.observation.accountId ?? 'anonymous'}:${analysis.training.observation.heroId}`} analysis={analysis} />
    </aside>
    <div className={styles.main}>
      {review.strengths.length ? <section className={styles.strengths} aria-label="Что сохранить в своей игре"><h3>Что стоит повторить</h3>{review.strengths.map((text) => <p key={text}>{text}</p>)}</section> : null}
      <ItemTimeline items={analysis.itemTimings} title="Твои ключевые покупки" />
      <MatchContextTimeline review={review} />
      <details className="details">
        <summary>Оценки, фазы и источники данных</summary>
        <div className="details-content">
          <GradesGrid grades={analysis.grades} />
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
