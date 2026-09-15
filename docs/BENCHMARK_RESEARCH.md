# Benchmark Research (debug-only)

Статус: источники исследуются отдельно; нормализованный item timing context разрешён в product-анализе только с guardrails ниже.

## 1) OpenDota `/benchmarks?hero_id={heroId}`
- Источник подключён через debug endpoint.
- Нормализованные поля:
  - `gold_per_min`
  - `xp_per_min`
  - `last_hits_per_min`
  - `hero_damage_per_min`
  - `tower_damage`
  - `kills_per_min`
- Формат: массивы `{ percentile, value }`.
- Ограничение: если `result`/метрика отсутствует, источник помечается как `available: false`.

## 2) OpenDota `/heroes/{hero_id}/itemPopularity`
- Источник подключён через debug endpoint.
- Нормализованные фазы:
  - `start`, `early`, `mid`, `late`.
- Для каждой фазы строится `topItemsByPhase` с item constants (`itemId -> key/name`).
- Ограничение: формат payload может быть неполным по фазам; при пустых фазах данных выводы запрещены.

## 3) OpenDota `/scenarios/itemTimings`
- Проверяются:
  - `/scenarios/itemTimings?hero_id={heroId}`
  - `/scenarios/itemTimings?hero_id={heroId}&item={itemKey}` (поддержано функцией research fetch)
- На этапе research сохраняется `raw` preview на уровне `items[]`.
- Raw `time` — дискретное значение времени в секундах, по которому scenario-ответ группирует строки. Контракт endpoint не сообщает, что это начало или конец интервала, и не возвращает границы интервала. Поэтому нормализация фиксирует `timeSemantics: discrete_timing_point`, сохраняет значение в `timeLowerBound` для обратной совместимости, но **не трактует его как нижнюю границу** и не выдумывает `timeUpperBound`.
- Фактическая покупка из `purchase_log` сопоставляется с ближайшей дискретной точкой только при достаточной выборке. Это proximity context, а не утверждение, что покупка попала в опубликованный OpenDota-интервал.
- `games` и `wins` принимаются как числа или числовые строки; `winRate` рассчитывается как `wins / games` (при `games > 0`). Некорректные и противоречивые строки отбрасываются.

### Sample-size policy (методология продукта, не факт OpenDota API)
- `<30 games` — `insufficient`: строка не используется для оценки или ближайшего контекста;
- `30–99 games` — `weak`: показывается только как слабый контекст;
- `100+ games` — `standard`: нормальный контекст.

Win rate всегда показывается вместе с размером выборки и не превращается самостоятельно в вывод «хороший/плохой тайминг». При наличии пригодного внешнего контекста ручная MVP-оценка тайминга для этого item не используется.

## 4) STRATZ `heroAverage`
- Используется server-side STRATZ token и существующий GraphQL client.
- Для выбранного игрока по `heroId` возвращаются `samples[]` по `time`.
- Поля: `matchCount`, `winCount`, `cs`, `networth`, `goldPerMinute`, `heroDamage`, `towerDamage`, `deaths`, `teamKills`, `goldLost`, `goldFed`, `buybackCount`.
- `methodologyStatus` зафиксирован как `unknown`.
- Ограничение: при отсутствии токена источник мягко деградирует в `available: false` (без падения API).

## 5) Product readiness matrix
- OpenDota benchmarks: **candidate** (нужно подтвердить coverage по ролям/патчам).
- OpenDota itemPopularity: **candidate** (нужна проверка стабильности фаз).
- OpenDota itemTimings scenarios: **context-only candidate** (без interval semantics и без quality verdict по win rate).
- STRATZ heroAverage: **research-only** (методология агрегирования не подтверждена).

## Guardrails
- Не делать выводы при отсутствии данных.
- Все source errors трактовать как `unavailable`, не как падение endpoint.
- Не возвращать секреты (например, `STRATZ_API_TOKEN`).
- Не подключать в product UI источники со статусом **research-only** до отдельного продуктового решения. OpenDota itemTimings разрешён только как **context-only** источник с описанными выше semantics и sample-size guardrails.
