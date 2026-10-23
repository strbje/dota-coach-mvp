import { Alert, Panel } from '@/components/ui';
import type { NormalizedGoldReasons } from '@/lib/dota/normalize/goldReasons';

export function GoldSources({ reasons }: { reasons: NormalizedGoldReasons }) {
  const sections = [
    { title: 'Доходы', entries: reasons.grouped.filter(({ amount }) => amount > 0) },
    { title: 'Потери и расходы', entries: reasons.grouped.filter(({ amount }) => amount < 0) },
    { title: 'Без изменения золота', entries: reasons.grouped.filter(({ amount }) => amount === 0) }
  ];
  return <Panel>
    <h3>Источники золота</h3>
    {reasons.grouped.length ? <>
      {sections.filter(({ entries }) => entries.length).map(({ title, entries }) => <section key={title} aria-label={title}>
        <h4>{title}</h4>
        <ul>{entries.map((entry) => <li key={entry.group}>{entry.label}: {entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString('ru-RU')} золота</li>)}</ul>
      </section>)}
      {!reasons.breakdownComplete ? <Alert>Разбивка неполная: часть источников не определена или не содержит числовых значений.</Alert> : null}
      <p className="muted">Показаны только переданные источником суммы. Разбивка не подтверждает всё собранное золото и не заменяет стоимость героя с предметами.</p>
    </> : <Alert>OpenDota не вернул числовую разбивку источников золота.</Alert>}
  </Panel>;
}
