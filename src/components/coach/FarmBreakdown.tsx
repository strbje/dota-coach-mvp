import { farmTypes } from '@/lib/dota/analyze/farmChart';
import type { FarmInterval } from '@/lib/dota/analyze/farmIntervals';
import { otherTargetKinds, type OtherTargetKind } from '@/lib/dota/normalize/farmTargets';
import styles from './postMatch.module.css';

const labels: Record<OtherTargetKind, string> = {
  summon: 'Саммоны', ward: 'Варды', building: 'Строения', roshan: 'Рошан', tormentor: 'Терзатель'
};
export const otherTargetsHint = 'Саммоны, варды, строения, Рошан и Терзатель. Уже учтены в общем числе добиваний.';

/** Native details work by touch and keyboard; the hover hint is only a shortcut. */
export function FarmBreakdown({ interval }: { interval: FarmInterval }) {
  if (!interval.breakdown) return null;
  const { breakdown, otherTargets = [] } = interval;
  const ordinary = farmTypes.filter((type) => type.key !== 'other' && breakdown[type.key] > 0);
  const remainder = breakdown.other - otherTargets.reduce((sum, target) => sum + target.count, 0);
  return <div className={styles.farmBreakdown}>
    {ordinary.length ? <dl>{ordinary.map((type) => <div key={type.key}>
      <dt>{type.label}</dt><dd>{breakdown[type.key]}</dd>
    </div>)}</dl> : null}
    {breakdown.unclassified > 0 ? <p className={styles.note}>«Тип не определён» входит в общий счёт, но цель распознать не удалось.</p> : null}
    {breakdown.other > 0 ? <details className={styles.farmOtherTargets}>
      <summary title={otherTargetsHint}>Другие цели · {breakdown.other}</summary>
      <p className={styles.note}>{otherTargetsHint}</p>
      {otherTargetKinds.map((kind) => {
        const targets = otherTargets.filter((target) => target.kind === kind);
        if (!targets.length) return null;
        const total = targets.reduce((sum, target) => sum + target.count, 0);
        return <div key={kind} className={styles.farmTargetGroup}>
          <strong>{labels[kind]} · {total}</strong>
          {kind !== 'roshan' && kind !== 'tormentor' ? <dl>{targets.map((target) => <div key={target.npcId}>
            <dt>{target.label}</dt><dd>{target.count}</dd>
          </div>)}</dl> : null}
        </div>;
      })}
      {remainder > 0 ? <p className={styles.note}>Без названия цели · {remainder}</p> : null}
    </details> : null}
    {!ordinary.length && breakdown.other === 0 ? <p className={styles.note}>В этом отрезке добиваний нет.</p> : null}
  </div>;
}
