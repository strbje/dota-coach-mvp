# Единая шапка и DotA Allstars на главной

Проверка от 6 ноября 2026. Основа — актуальный main после PR #77,
commit `e91eff2a680f147c615f2f94473e9ff24605cf64`.

## Причина и исправление

В `AppHeader` выбор маршрута менял ширину с 1200 px на 1440 px для разбора
и доли побед. Поэтому логотип и навигация сдвигались при переходе.
Теперь все страницы используют один контейнер шапки — `--layout-report`
и одинаковые `--layout-gutter`. Маршрут определяет только активную ссылку.
Место под обычную вертикальную полосу прокрутки зарезервировано через
`scrollbar-gutter: stable`.

До 900 px меню и выбор языка занимают отдельную строку под логотипом:
названия не переносятся внутри пункта. Поля, аналитика и ширина контента
страниц не менялись.

На главной подключён новый локальный [home-allstars.webp](../../../public/images/home-allstars.webp):
лес Sentinel, древнее дерево и силуэты Scourge в духе Warcraft III / DotA Allstars.
Это сгенерированная иллюстрация, не официальный игровой скриншот.
Полное задание и метод генерации — [background-prompt.json](background-prompt.json).
Предыдущая иллюстрация сохранена для исторических материалов PR #77.

## Проверки

- Lint, typecheck, production build и design guard — прошли.
- Unit: 214; combat: 34; benchmarks: 9; STRATZ research: 34; design: 6 — прошли.
- Production guard координатной страницы — ожидаемые 404.
- В браузере проверены 320, 390, 768, 900, 901, 1440, 1920 и 2560 px:
  геометрия шапки, логотипа, меню и RU/EN совпадает между четырьмя страницами.
  Проверены обе стороны адаптивного порога 900 px; названия остаются в одну строку.
- Переходы по меню без полной перезагрузки в RU и EN сохраняют положение шапки;
  активная ссылка следует за маршрутом. Клавиатура и видимый focus проверены.
- Сценарии доли побед: initial/loading/error/empty/partial, повторы, переключение
  окон, CSV, пауза и продолжение третьего матча.
- Сценарии разбора: загрузка/ошибки роли, ready/partial/empty, графики и события,
  цель и прогресс, адаптивность. Проверки используют синтетические ответы.

Протоколы: [header-and-winrates.json](header-and-winrates.json),
[post-match.json](post-match.json).

## Скриншоты текущего PR

Данные проверки и составы **синтетические**. Основной экран главной не содержит
реальной статистики игроков; фон сгенерирован.

| Страница | Desktop 1440 | Mobile 390 |
|---|---|---|
| Главная | [desktop](home-desktop.webp) | [mobile](home-mobile.webp) |
| Разбор матча | [desktop](post-match-desktop.webp) | [mobile](post-match-mobile.webp) |
| План перед игрой | [desktop](pre-game-desktop.webp) | [mobile](pre-game-mobile.webp) |
| Доля побед | [desktop](winrates-desktop.webp) | [mobile](winrates-mobile.webp) |

[Главная на широком экране 1920 px](home-wide.webp).

## Self-review

Проверен весь diff от main, включая новый WebP. Изменения ограничены общей шапкой,
резервом полосы прокрутки, фоном главной, проверками и документацией.
Все изображения локальные; декоративный слой не перехватывает ввод.
Новые данные провайдеров, зависимости и расчёты не добавлены.

Повторение после `npm ci` и `npm run build`, с доступными Playwright/Chromium:

```sh
START_SERVER=1 EVIDENCE_DIR=/tmp/header-check node scripts/verify-winrates.mjs
START_SERVER=1 EVIDENCE_DIR=/tmp/report-check node scripts/verify-post-match-v2.mjs
```

Опциональные `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_MODULE_PATH`,
`CHROMIUM_EXECUTABLE_PATH` и `ASSET_DIR` описаны в предыдущем
[протоколе UI](../winrates-controls/README.md#повторение).
