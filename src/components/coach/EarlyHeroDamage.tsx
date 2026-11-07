'use client';

import { Button, Panel } from '@/components/ui';
import { HeroPortrait } from '@/components/ui/HeroPortrait';
import type { EarlyHeroDamage as DamageReport } from '@/lib/dota/normalize/earlyHeroDamage';
import styles from './postMatch.module.css';

export function EarlyHeroDamage({ report, onEvidence }: { report?: DamageReport; onEvidence: () => void }) {
  const selected = report?.players.find((p) => p.selected);
  if (!selected || !report || !report.players.some((p) => p.damage !== undefined)) return <p className={styles.note}>Урон по героям до 10:00 пока недоступен. Урон за весь матч не заменяет этот показатель.</p>;
  const extent = Math.max(1, ...report.players.map((p) => p.damage ?? 0));
  const number = (value?: number) => value === undefined ? '—' : value.toLocaleString('ru-RU');
  return <Panel className={styles.earlyDamage}>
    <h2>Урон по героям до 10:00</h2>
    <p className={styles.note}>Показывает объём нанесённого урона в начале игры. Учитываются события по всей карте, а не только размены на твоей линии.</p>
    <div className={styles.damageLegend}><span>0:00–5:00</span><span>5:00–10:00</span></div>
    <ul className={styles.damagePlayers} aria-label="Урон игроков в начале игры">
      {report.players.map((player) => <li key={player.playerSlot}>
        <div className={styles.damageIdentity}><HeroPortrait heroKey={player.heroKey} /><strong>{player.hero}</strong><span className={styles.note}>{player.selected ? 'Ты' : player.ally ? 'Союзник' : 'Соперник'}</span><strong className={styles.damageTotal}>{number(player.damage)}</strong></div>
        {player.damage !== undefined ? <div className={styles.damageBar} aria-hidden="true">
          {player.firstFive !== undefined && player.nextFive !== undefined ? <><span style={{ width: `${player.firstFive / extent * 100}%` }} /><span style={{ width: `${player.nextFive / extent * 100}%` }} /></> : <span className={styles.damageUnsplit} style={{ width: `${player.damage / extent * 100}%` }} />}
        </div> : null}
        <p className={styles.note}>{player.damage === undefined ? 'Нет замера к 10:00' : player.firstFive === undefined ? 'Разбивка по пятиминуткам недоступна' : `0:00–5:00: ${number(player.firstFive)} · 5:00–10:00: ${number(player.nextFive)}`}</p>
      </li>)}
    </ul>
    <p className={styles.note}>{report.lane === undefined ? 'Состав линии не подтверждён — показан только твой результат.' : 'Рядом — игроки с той же линией по данным матча. Это не урон именно друг по другу.'} Сложность матчапа пока не оценена.</p>
    <Button type="button" variant="secondary" onClick={onEvidence}>Посмотреть события первых 10 минут</Button>
    <details><summary>Как понимать эти числа</summary>
      <p>Сопоставь урон с добиваниями и ранними смертями. В записи проверь, помогал ли размен забирать крипов или защищать фарм. В следующей игре выбери одну подходящую возможность для такого размена.</p>
      <p className={styles.note}>Больше урона не всегда лучше: важны герои обеих пар, лечение, расходники и перемещения. Надёжного сравнения с похожими линиями пока нет, поэтому оценку «слабо давил» не ставим. Источник: OpenDota, разница накопленных значений между 0:00 и 10:00. Предматчевый урон исключён; пропуски не считаются нулём.</p>
    </details>
  </Panel>;
}
