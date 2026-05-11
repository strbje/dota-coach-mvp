# Benchmark Research (debug-only)

Статус: **research/debug only**. Никакие данные из этого документа пока не должны напрямую попадать в product UI без дополнительной валидации.

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
- Дополнительно добавлен best-effort `timingBuckets` (если поля читаемы), но без жёстких предположений о контракте.
- Ограничение: при нестабильном формате использовать только как debug-источник.

## 4) STRATZ `heroAverage`
- Используется server-side STRATZ token и существующий GraphQL client.
- Для выбранного игрока по `heroId` возвращаются `samples[]` по `time`.
- Поля: `matchCount`, `winCount`, `cs`, `networth`, `goldPerMinute`, `heroDamage`, `towerDamage`, `deaths`, `teamKills`, `goldLost`, `goldFed`, `buybackCount`.
- `methodologyStatus` зафиксирован как `unknown`.
- Ограничение: при отсутствии токена источник мягко деградирует в `available: false` (без падения API).

## 5) Product readiness matrix
- OpenDota benchmarks: **candidate** (нужно подтвердить coverage по ролям/патчам).
- OpenDota itemPopularity: **candidate** (нужна проверка стабильности фаз).
- OpenDota itemTimings scenarios: **research-only** (контракт требует дополнительной валидации).
- STRATZ heroAverage: **research-only** (методология агрегирования не подтверждена).

## Guardrails
- Не делать выводы при отсутствии данных.
- Все source errors трактовать как `unavailable`, не как падение endpoint.
- Не возвращать секреты (например, `STRATZ_API_TOKEN`).
- Не подключать эти источники в product UI до отдельного продуктового решения.
