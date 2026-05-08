# UI_COPY_RULES

## Не писать в product UI
- `purchase_log`
- `death_log`
- `lh_t`
- `gold_t`
- `phase kill participation unavailable`
- `building_kill`
- `CHAT_MESSAGE_MINIBOSS_KILL`
- любые raw provider field names.

## Писать
- «по журналу покупок» — только в tooltip/debug;
- «по минутным срезам матча»;
- «OpenDota не вернул достаточно данных для ...»;
- «по MVP-ориентиру»;
- «источник: OpenDota» кратко.

## Примеры замен
- `purchase_log` → «тайминги покупок»
- `lh_t` → «минутные срезы ластхитов»
- `gold_t` → «минутные срезы золота»
- `death_log unavailable` → «для этого матча нет времени смертей»
- raw objective types → «строение», «Roshan», «объект», «другое событие»
