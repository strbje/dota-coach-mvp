'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Badge, Button, Field, Input, Panel, Select } from '@/components/ui';
import { farmSummary, filterFarm, formatReviewTime, gridOrigin, projectWorld,
  type Executor, type FarmCategory, type ReviewData, type ReviewMatch, type XY } from '@/lib/dota/research/coordinateReview';
import styles from './coordinateReview.module.css';

type Layer = 'farm' | 'deaths' | 'landmarks';
const categoryNames: Record<FarmCategory, string> = { lane: 'Линейные крипы', neutral: 'Нейтральные крипы', ancient: 'Древние крипы', unclassified: 'Без категории STRATZ' };
const executorNames: Record<Executor, string> = { hero: 'Герой', skeleton: 'Скелеты WK', unknown: 'Не установлен' };
const xyText = (point: XY | null) => point ? point.map((v) => v.toFixed(2)).join('; ') : '—';
const rawText = (xy: Array<number | null>) => xy.map((v) => v === null ? '—' : String(v)).join('; ');
const time = formatReviewTime;

export function CoordinateReview({ data }: { data: ReviewData }) {
  const [matchId, setMatchId] = useState(data.matches[0]?.id);
  const match = data.matches.find((entry) => entry.id === matchId);
  return <PageContainer className="page-stack">
    <header className={styles.header}>
      <div className="stack"><p className="eyebrow">Исследование #50</p><h1>Проверка координат</h1></div>
      <Badge tone="info">Реальные данные · {data.matches.length} матча</Badge>
    </header>
    <Alert>Служебный экран. Карта местности и смысл координат добиваний ещё не подтверждены. Пользовательские карты и оценки выключены.</Alert>
    {data.matches.length ? <Field id="review-match" label="Контрольный матч">
      <Select value={matchId} onChange={(e) => setMatchId(Number(e.target.value))}>
        {data.matches.map((m) => <option key={m.id} value={m.id}>{m.id} · Wraith King · {m.side} · {time(m.duration)}</option>)}
      </Select>
    </Field> : <Panel><p>Нет контрольных матчей. Подготовьте исследовательский набор по инструкции из PR.</p></Panel>}
    {match ? <Workspace key={match.id} match={match} /> : null}
    <details className="details"><summary>Происхождение и границы проверки</summary>
      <div className="details-content">
        <p>STRATZ и два переданных реплея; синтетические точки в этом наборе отсутствуют. Схема использует декартовы оси: X вправо, Y вверх. Рамка взята из границ камеры реплея и не считается подтверждённым обрезанием миникарты.</p>
        <p>Фарм подконтрольных юнитов относится к игроку. Фильтр исполнителя меняет только этот исследовательский просмотр. Добивания без категории включают разные типы объектов; их состав виден в таблице.</p>
        <p>Подложка читается только в браузере, не отправляется на сервер и не сохраняется. Её загрузка не подтверждает версию, масштаб или ориентацию карты.</p>
        <dl className={styles.sources}>
          <dt>SHA-256 выгрузки</dt><dd><code>{data.source.captureSha256}</code></dd>
          <dt>SHA-256 протокола</dt><dd><code>{data.source.protocolSha256}</code></dd>
          <dt>Метод сверки добиваний</dt><dd>{data.source.csJoin}</dd>
          <dt>Готовность</dt><dd><code>productReady=false · structural_only</code></dd>
        </dl>
      </div>
    </details>
  </PageContainer>;
}

function Workspace({ match }: { match: ReviewMatch }) {
  const [layer, setLayer] = useState<Layer>('farm');
  const [from, setFrom] = useState('0');
  const [to, setTo] = useState(String(match.duration));
  const [category, setCategory] = useState<FarmCategory | 'all'>('all');
  const [executor, setExecutor] = useState<Executor | 'all'>('all');
  const [farmIndex, setFarmIndex] = useState(match.id === 9019592113 ? 245 : 90);
  const [deathIndex, setDeathIndex] = useState(match.id === 9019592113 ? 1 : 0);
  const [background, setBackground] = useState<{ url: string; name: string; hash: string } | null>(null);
  const [imageError, setImageError] = useState<string>();
  const [imageBusy, setImageBusy] = useState(false);
  const imageRequest = useRef(0);
  useEffect(() => () => { imageRequest.current++; }, []);
  const rangeValid = from.trim() !== '' && to.trim() !== '' && Number.isFinite(Number(from))
    && Number.isFinite(Number(to)) && Number(from) <= Number(to);
  const farm = filterFarm(match.farm, { from: rangeValid ? Number(from) : NaN, to: Number(to), category, executor });
  const deaths = rangeValid ? match.deaths.filter((d) => d.time >= Number(from) && d.time <= Number(to)) : [];
  const selectedFarm = farm.find((e) => e.index === farmIndex) ?? farm[0];
  const selectedDeath = deaths.find((d) => d.index === deathIndex) ?? deaths[0];
  const example = match.farmExamples.find((entry) => entry.index === selectedFarm?.index);
  const summary = farmSummary(farm);
  const allSummary = farmSummary(match.farm);
  const inside = ([x,y]: XY) => x >= match.bounds.xMin && x <= match.bounds.xMax && y >= match.bounds.yMin && y <= match.bounds.yMax;
  const outside = farm.filter((e) => { const p = gridOrigin(e.xy); return p && !inside(p); }).length;
  const clip = useId();
  const plotHeight = (match.bounds.yMax - match.bounds.yMin) / (match.bounds.xMax - match.bounds.xMin) * 1000;
  const project = (point: XY) => projectWorld(point, match.bounds);
  const active = layer === 'farm' ? farm : deaths;
  const selectedIndex = layer === 'farm' ? selectedFarm?.index : selectedDeath?.index;
  const activePosition = active.findIndex((e) => e.index === selectedIndex);
  function move(delta: number) {
    const item = active[activePosition + delta];
    if (item) (layer === 'farm' ? setFarmIndex : setDeathIndex)(item.index);
  }
  function mark(point: XY | null, key: string, kind: 'event' | 'reference' | 'candidate' | 'victim', selected = false) {
    if (!point) return null;
    const [x,y] = project(point);
    const r = selected ? 12 : 5;
    const className = `${styles[kind]} ${selected ? styles.selected : ''}`;
    return <g key={key} className={className}>
      {kind === 'event' ? <path d={`M ${x} ${y-r} l ${r} ${r} l ${-r} ${r} l ${-r} ${-r} Z`} />
        : kind === 'candidate' ? <path d={`M ${x-r} ${y-r} L ${x+r} ${y+r} M ${x-r} ${y+r} L ${x+r} ${y-r}`} />
          : kind === 'victim' ? <rect x={x-r} y={y-r} width={r*2} height={r*2} />
            : <circle cx={x} cy={y} r={r} />}
    </g>;
  }
  async function loadBackground(file?: File) {
    const request = ++imageRequest.current;
    setImageError(undefined);
    setImageBusy(false);
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8*1024*1024) {
      setImageError('Выберите PNG, JPEG или WebP размером до 8 МБ.'); return;
    }
    setImageBusy(true);
    try {
      const url = await new Promise<string>((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('format'));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });
      const image = new Image(); image.src = url; await image.decode();
      if (image.width > 8192 || image.height > 8192) throw new Error('size');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2,'0')).join('');
      if (request === imageRequest.current) setBackground({ url, name: file.name, hash });
    } catch {
      if (request === imageRequest.current) setImageError('Не удалось прочитать изображение. Допустимый размер — до 8192 × 8192 пикселей.');
    } finally { if (request === imageRequest.current) setImageBusy(false); }
  }
  return <>
    <Panel><div className={styles.toolbar}>
      <div className={styles.layers} role="group" aria-label="Слой проверки">
        {([['farm','Добивания'],['deaths','Смерти'],['landmarks','Ориентиры']] as const).map(([value,label]) =>
          <Button key={value} variant={layer === value ? 'primary' : 'secondary'} aria-pressed={layer === value} onClick={() => setLayer(value)}>{label}</Button>)}
      </div>
      <p className="muted">Версия реплея {match.gameVersion} · {match.side}</p>
    </div>
      {layer !== 'landmarks' ? <div className={styles.filters}>
        <Field id="review-from" label="От, секунды" error={!rangeValid ? 'Проверьте границы периода' : undefined}><Input type="number" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="review-to" label="До, секунды"><Input type="number" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {layer === 'farm' ? <>
          <Field id="review-category" label="Категория STRATZ"><Select value={category} onChange={(e) => setCategory(e.target.value as FarmCategory | 'all')}>
            <option value="all">Все категории</option>{Object.entries(categoryNames).map(([key,label]) => <option value={key} key={key}>{label}</option>)}
          </Select></Field>
          <Field id="review-executor" label="Исполнитель по реплею"><Select value={executor} onChange={(e) => setExecutor(e.target.value as Executor | 'all')}>
            <option value="all">Герой и все его юниты</option>{Object.entries(executorNames).map(([key,label]) => <option value={key} key={key}>{label}</option>)}
          </Select></Field>
        </> : null}
      </div> : null}
    </Panel>
    <div className={styles.workspace}>
      <Panel>
        <div className={styles.mapHeader}><h2>Координатная схема</h2><Badge tone="warning">Подложка не подтверждена</Badge></div>
        <p className={styles.caption}>Точки — из реальных данных. Рельеф, препятствия и границы игровых зон на схеме не заданы.</p>
        <svg className={styles.plot} viewBox={`-125 -35 1180 ${plotHeight+100}`} role="img" aria-labelledby={`${clip}-title ${clip}-description`}>
          <title id={`${clip}-title`}>{`${layer === 'farm' ? 'Сверка координат добиваний' : layer === 'deaths' ? 'Сверка места смерти' : 'Ориентиры из реплея'} в матче ${match.id}`}</title>
          <desc id={`${clip}-description`}>X направлена вправо, Y вверх. Обозначения и точные значения доступны под схемой и в таблице. Подложка карты не подтверждена.</desc>
          <defs><clipPath id={clip}><rect width={1000} height={plotHeight} /></clipPath></defs>
          <rect width={1000} height={plotHeight} className={styles.plane} />
          <g clipPath={`url(#${clip})`} aria-hidden="true">
            {background ? <image href={background.url} width={1000} height={plotHeight} preserveAspectRatio="none" opacity={0.5} /> : null}
            {[-8000,-4000,0,4000,8000].map((v) => { const [x,y] = project([v,v]); return <g key={v} className={styles.grid}>
              <path d={`M ${x} 0 V ${plotHeight} M 0 ${y} H 1000`} /></g>; })}
            {match.landmarks.map((p,i) => { const [x,y] = project(p.world); return <g key={i} className={p.team === 2 ? styles.radiant : p.team === 3 ? styles.dire : styles.landmark}>
              <circle cx={x} cy={y} r={layer === 'landmarks' ? 11 : 7} />
              <text x={x+17} y={y+10} className={styles.plotLabel}>{p.label.startsWith('Фонтан') ? 'Ф' : p.label.startsWith('Рошан') ? 'Р' : 'T2'}</text>
            </g>; })}
            {layer === 'farm' ? <>
              {farm.map((e) => mark(gridOrigin(e.xy), `farm-${e.index}`, 'event'))}
              {selectedFarm ? mark(gridOrigin(selectedFarm.xy), 'active-farm', 'event', true) : null}
              {example ? mark(example.hero.world, 'hero', 'reference', true) : null}
              {example?.dyingCandidates.map((p,i) => mark(p.world, `dying-${i}`, 'victim', true))}
            </> : null}
            {layer === 'deaths' ? <>
              {deaths.map((d) => mark(d.referenceWorld, `death-ref-${d.index}`, 'reference'))}
              {deaths.map((d) => mark(gridOrigin(d.candidateXY), `death-candidate-${d.index}`, 'candidate'))}
              {selectedDeath ? <>
                {(() => { const origin = gridOrigin(selectedDeath.candidateXY); if (!origin) return null; const a=project(origin), b=project(selectedDeath.referenceWorld);
                  return <path className={styles.connection} d={`M ${a.join(' ')} L ${b.join(' ')}`} />; })()}
                {mark(gridOrigin(selectedDeath.candidateXY), 'selected-candidate', 'candidate', true)}
                {mark(gridOrigin(selectedDeath.eventXY), 'selected-event', 'event', true)}
                {mark(selectedDeath.referenceWorld, 'selected-reference', 'reference', true)}
              </> : null}
            </> : null}
          </g>
          {[-8000,-4000,0,4000,8000].map((v) => { const [x,y] = project([v,v]); return <g key={v} className={styles.axisLabel}><text x={x} y={plotHeight+45} textAnchor="middle">{v}</text><text x={-15} y={y+8} textAnchor="end">{v}</text></g>; })}
        </svg>
        <div className={styles.legend}>
          {layer !== 'landmarks' ? <><span className={styles.eventKey}>◆ Координата события STRATZ</span><span className={styles.referenceKey}>● Позиция героя в реплее</span>
            {layer === 'deaths' ? <span className={styles.candidateKey}>× Позиция adapter</span> : <span className={styles.victimKey}>□ Погибшие сущности: кандидаты</span>}</> : null}
          <span>Ф — фонтан · T2 — башня · Р — появление Рошана</span>
        </div>
        <details className={styles.background}><summary>Локальная подложка для ручной сверки</summary><div className="stack">
          <p>Изображение будет растянуто на рамку схемы. Его масштаб и версия остаются непроверенными; это не автоматическая калибровка.</p>
          <Field id="review-background" label="Изображение карты" hint="PNG, JPEG или WebP до 8 МБ; только в этом браузере." error={imageError}>
            <Input type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void loadBackground(file); }} />
          </Field>
          {imageBusy ? <p role="status" aria-busy="true">Читаем изображение…</p> : null}
          {background ? <><p className={styles.fileName}>{background.name} · SHA-256 <code>{background.hash}</code></p><div><Button variant="secondary" onClick={() => { imageRequest.current++; setBackground(null); setImageError(undefined); setImageBusy(false); }}>Убрать подложку</Button></div></> : null}
        </div></details>
      </Panel>
      <div className="stack">
        <Panel><div className="stack">
          <h2>{layer === 'farm' ? 'Добивания игрока' : layer === 'deaths' ? 'Проверка смертей' : 'Именованные ориентиры'}</h2>
          {layer === 'farm' ? <>
            <dl className={styles.metrics}>
              <div><dt>Всего за матч</dt><dd>{allSummary.total}</dd></div><div><dt>Из них скелетами</dt><dd>{allSummary.skeleton}</dd></div>
              <div><dt>По фильтрам</dt><dd data-testid="filtered-count">{summary.total}</dd></div><div><dt>Без пригодной пары</dt><dd data-testid="missing-count">{summary.missing}</dd></div>
            </dl>
            <p>Скелеты включены в общий результат. Категории взяты из STRATZ; отсутствие категории не исключает событие из общего списка.</p>
            <p className="muted">На схеме: {summary.usable-outside} из {summary.total}. За рамкой: {outside}. Координата события пока не считается проверенным местом фарма.</p>
          </> : layer === 'deaths' ? <>
            <p>В выбранном периоде {deaths.length} смертей. Совпадение целой секунды не гарантирует совпадения места.</p>
            <p className="muted">Сравниваем начало выбранной ячейки с первым состоянием погибшего героя в реплее. Новый допуск погрешности не вводился.</p>
          </> : <p>Фонтаны, башни и Рошан получены из именованных сущностей этих реплеев. Два положения появления Рошана относятся к разному времени.</p>}
        </div></Panel>
        {layer !== 'landmarks' ? <Panel><div className="stack">
          <h2>Контрольный эпизод</h2>
          {!rangeValid ? <Alert>Введите корректный период для проверки.</Alert> : !active.length ? <Alert>В выбранном периоде и по этим фильтрам событий нет.</Alert> : <>
            <Field id="review-event" label={layer === 'farm' ? 'Добивание' : 'Смерть'}><Select value={selectedIndex} onChange={(e) => (layer === 'farm' ? setFarmIndex : setDeathIndex)(Number(e.target.value))}>
              {active.map((e) => <option value={e.index} key={e.index}>№ {e.index+1} · {time(e.time)}{'executor' in e ? ` · ${executorNames[e.executor]}` : ''}</option>)}
            </Select></Field>
            <div className={styles.navigation}><Button variant="secondary" disabled={activePosition <= 0} onClick={() => move(-1)}>Предыдущий</Button><Button variant="secondary" disabled={activePosition >= active.length-1} onClick={() => move(1)}>Следующий</Button></div>
            {layer === 'farm' && selectedFarm ? <>
              <Badge tone="info">{executorNames[selectedFarm.executor]}</Badge>
              <p>{categoryNames[selectedFarm.category]} · {time(selectedFarm.time)}</p>
              <p>Позиция события: {rawText(selectedFarm.xy)}. {gridOrigin(selectedFarm.xy) ? 'Чья это позиция, ещё не установлено.' : 'На схеме для события точки нет; добивание учтено.'}</p>
              {example ? <p>Показана позиция героя. Погибших сущностей в пределах 0,1 с от события реплея: {example.dyingCandidates.length}. Квадраты — кандидаты, их связь с жертвой не подтверждена.</p> : <p className="muted">Для этого события отдельная выборка сущностей не подготовлена. Исполнитель сопоставлен по порядку добиваний и времени.</p>}
              <details><summary>Точные данные эпизода</summary><dl className={styles.sources}>
                <dt>NPC из боевого журнала</dt><dd><code>{selectedFarm.target}</code></dd>
                <dt>Время реплея, с</dt><dd>{selectedFarm.replayTime.toFixed(5)}</dd>
                <dt>Начало ячейки STRATZ</dt><dd>{xyText(gridOrigin(selectedFarm.xy))}</dd>
                <dt>Герой в ближайшем снимке реплея</dt><dd>{xyText(example?.hero.world ?? null)}{example ? ` · ${example.hero.time.toFixed(5)} с` : ''}</dd>
                <dt>Сущности в окне</dt><dd>{example?.dyingCandidates.map((p) => <p key={p.handle}><code>{p.className}</code>: {xyText(p.world)}</p>) ?? '—'}</dd>
              </dl></details>
            </> : null}
            {layer === 'deaths' && selectedDeath ? <>
              <Badge tone={selectedDeath.sameCell === false ? 'warning' : 'info'}>{selectedDeath.sameCell === null ? 'Позиция не назначена' : selectedDeath.sameCell ? 'Та же ячейка' : 'Другая ячейка'}</Badge>
              <dl className={styles.sources}>
                <dt>Время STRATZ / реплея</dt><dd>{selectedDeath.time} / {selectedDeath.replayTime.toFixed(5)} с</dd>
                <dt>Ячейка adapter / реплея</dt><dd>{rawText(selectedDeath.candidateXY)} / {rawText(selectedDeath.referenceCell)}</dd>
                <dt>Ошибка относительно реплея</dt><dd>{selectedDeath.worldError === null ? '—' : `${selectedDeath.worldError.toFixed(2)} мировых единиц`}</dd>
                <dt>Сдвиг выбранной позиции</dt><dd>{selectedDeath.candidateTime === null ? '—' : `${selectedDeath.candidateTime-selectedDeath.time} с`}</dd>
              </dl>
              <p className="muted">Разность включает выбор ячейки и отсутствующее внутриклеточное смещение. Это измерение, а не оценка игры.</p>
              <details><summary>Исследовательские поля</summary><p><code>confidence={selectedDeath.confidence}</code> описывает только временную близость.</p><p>XY события: {rawText(selectedDeath.eventXY)}; эталон: {xyText(selectedDeath.referenceWorld)}.</p></details>
            </> : null}
          </>}
        </div></Panel> : null}
      </div>
    </div>
    <details className="details"><summary>Таблица {layer === 'farm' ? 'добиваний по фильтрам' : layer === 'deaths' ? 'смертей по фильтрам' : 'ориентиров'}</summary><div className="details-content">
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Точные значения, таблица прокручивается горизонтально">
        {layer === 'farm' ? <table><caption>Каждая запись сохранена отдельно, включая одинаковые секунды и отсутствие координат.</caption><thead><tr><th>№</th><th>Время</th><th>Исполнитель</th><th>Категория</th><th>XY события</th><th>NPC реплея</th></tr></thead><tbody>
          {farm.map((e) => <tr key={e.index}><td>{e.index+1}</td><td>{time(e.time)}</td><td>{executorNames[e.executor]}</td><td>{categoryNames[e.category]}</td><td>{rawText(e.xy)}</td><td><code>{e.target}</code></td></tr>)}
        </tbody></table> : layer === 'deaths' ? <table><caption>Все смерти выбранного периода, в том числе без назначенной позиции.</caption><thead><tr><th>Время</th><th>Adapter XY</th><th>Ячейка реплея</th><th>Ошибка, мир. ед.</th></tr></thead><tbody>
          {deaths.map((d) => <tr key={d.index}><td>{time(d.time)}</td><td>{rawText(d.candidateXY)}</td><td>{rawText(d.referenceCell)}</td><td>{d.worldError?.toFixed(2) ?? '—'}</td></tr>)}
        </tbody></table> : <table><caption>Реальные сущности реплея; положение на изображении местности ещё не сверено.</caption><thead><tr><th>Ориентир</th><th>Время появления</th><th>Cell XY</th><th>World XY</th></tr></thead><tbody>
          {match.landmarks.map((p,i) => <tr key={i}><td>{p.label}</td><td>{time(p.time)}</td><td>{rawText(p.cell)}</td><td>{xyText(p.world)}</td></tr>)}
        </tbody></table>}
      </div>
    </div></details>
  </>;
}
