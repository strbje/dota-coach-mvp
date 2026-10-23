# #34 — проверка расшифровки золота, 23.10.2026

Основа: `main` `750c40ccddafae740a4750e49812e22cd8df3058`. Проверен только текущий этап #34. Соответствия сверены с [двумя закреплёнными первоисточниками](../OPENDOTA_FIELDS.md), а не только между потребителями одного нормализатора.

## Реальные ответы и независимый пересчёт

Повторно получены HTTP 200 от `https://api.opendota.com/api/matches/{id}` и локального `GET /api/debug/match/{id}?playerSlot={slot}` для всех трёх целей. Первые запросы Python получили 403; последующие запросы curl и маршруты приложения успешно получили реальные данные. `/api/constants/gold_reasons` вернул HTTP 404: проверена работа исправленного fallback.

| Матч | Герой / слот | Raw / debug HTTP | Добивания / золото к 10:00 | Последний интервал | Product POST |
| --- | --- | --- | --- | --- | --- |
| 8781054570 | Lifestealer 54 / 0 | 200 / 200 | 45 / 3338 | 35–78 мин | 422 `UNSUPPORTED_POST_MATCH_ROLE` |
| 9019592113 | Wraith King 42 / 129 | 200 / 200 | 51 / 3492 | 35–37 мин | 422 `UNSUPPORTED_POST_MATCH_ROLE` |
| 9003795847 | Wraith King 42 / 1 | 200 / 200 | 52 / 4042 | 20–29 мин | 422 `UNSUPPORTED_POST_MATCH_ROLE` |

| Матч | Герои | Крипы | Нейтралы | Строения | Рошан | Курьеры (16) | Руны | Потери при смерти | Не определено (0) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8781054570 | 16660 | 14624 | 14350 | 2965 | 1033 | 305 | 1758 | -6325 | 800 |
| 9019592113 | 4981 | 5589 | 5221 | 587 | 587 | 105 | 652 | -2102 | 600 |
| 9003795847 | 3302 | 7957 | 2851 | 2691 | 310 | 30 | 370 | -522 | 680 |

У 8781054570 также подтверждены **2255 от продажи предметов (6)** и **155 личной награды за курьера (21)**. Последняя строка отдельна от 305 по ключу 16; в этом патче их не объединяем. Наличие нулевого ключа не доказывает стартовое золото.

Проверены raw значения выбранного слота → независимые ожидаемые категории из issue/первоисточников → `goldReasonsDebug` → `normalized.player.goldReasons`. Локальный адаптер дополнительно прогнан на загруженных реальных payload с отключённым constants endpoint. Все значения совпали. Из raw `times/gold_t/lh_t/xp_t` независимо пересчитаны начала, концы, разницы и минутные темпы **всех** доступных фаз и контрольные точки 10/20/35; сравнены с адаптером и live debug. Последняя неполная минута не достраивалась. Сумма причин не приравнивалась к networth или полному собранному золоту.

В Git сохранён только [минимальный обезличенный фрагмент](../../src/lib/dota/normalize/goldReasons.fixture.ts): matchId, heroId, playerSlot, контрольные числа и gold reasons. Полные payload и аккаунты не добавлены.

## Проверено тестами

- `npm run test:unit`: **160 passed**, включая семантику 11–17, 1/2/6/19/20/21, недоступные constants (404/ошибка сети), старые неверные provider labels, unknown обоих знаков с нулевым балансом, нечисловые/отсутствующие значения и подтверждённый ноль. Debug/adapter выбирают нужный слот при наличии другого игрока. Существующие role guards и тесты фаз сохранены.
- `npm run test:combat`: **33 passed**; `npm run test:benchmarks`: **8 passed**; `npm run check:design`: **6 passed**.
- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`: успешно. Локальный Node 24.19.0; CI использует Node 22.
- `scripts/verify-post-match-v2.mjs`: синтетические ответы продукта, без обращения к live STRATZ. Раздел золота проверен на **320/390/768/1440 px**, общий post-match — также на 1920/2560. Проверены отдельные доходы/потери/unknown, только неизвестные суммы +100/-100, нечисловое/пустое/нулевое состояние, отсутствие горизонтального переполнения, раскрытие клавиатурой, focus и ARIA regions. Прежние loading/error/empty/partial/unsupported-role сценарии прошли; ошибок браузера нет.
- [Mobile](gold-reasons/mobile.png) и [desktop](gold-reasons/desktop.png) просмотрены. Это **синтетический отчёт с контрольным фрагментом золота**, не успешный live product-анализ.

## Недоступно и остаток

STRATZ-токен в окружении отсутствует. Все три реальные POST-запроса с `selector.playerSlot` корректно остановлены существующей проверкой роли: **422 `UNSUPPORTED_POST_MATCH_ROLE`**. Успешное равенство live `analysis.goldReasons` и debug здесь **не проверено**. Guard не менялся, selector не подменялся на legacy heroId, carry не назначался вручную для live проверки.

Приёмка успешного product-ответа остаётся владельцу в окружении с настроенным STRATZ. Нерасшифрованные/нерассмотренные причины, STRATZ goldEvents/farmDistributionReport/heroAverage остаются отдельным research. #70, новые роли и карты не входят в патч. Автоматическое закрытие #34 и merge не выполняются.

## PowerShell: повторить проверку у владельца

В первом терминале, после получения ветки PR, запустить приложение с существующей локальной конфигурацией. Токен в команды и вывод добавлять не нужно:

```powershell
cd D:\dota-coach
npm run dev
```

Во втором терминале PowerShell 5.1+:

```powershell
cd D:\dota-coach
$base = 'http://localhost:3000'
$targets = @(
    @{ Id = [long]8781054570; Slot = 0; Hero = 54; LH = 45; Gold = 3338; End = 78
       Expected = @{ heroes=16660; creeps=14624; neutral=14350; buildings=2965; roshan=1033; courier=305; bounty=1758; death=-6325; sale=2255; courierBonus=155; unknown=800 } },
    @{ Id = [long]9019592113; Slot = 129; Hero = 42; LH = 51; Gold = 3492; End = 37
       Expected = @{ heroes=4981; creeps=5589; neutral=5221; buildings=587; roshan=587; courier=105; bounty=652; death=-2102; unknown=600 } },
    @{ Id = [long]9003795847; Slot = 1; Hero = 42; LH = 52; Gold = 4042; End = 29
       Expected = @{ heroes=3302; creeps=7957; neutral=2851; buildings=2691; roshan=310; courier=30; bounty=370; death=-522; unknown=680 } }
)
function Assert-Value($actual, $expected, $label) {
    if ($null -eq $actual -or $actual -ne $expected) { throw "$label : expected $expected, got $actual" }
}
function Assert-Gold($gold, $expected, $label) {
    Assert-Value @($gold.grouped).Count $expected.Count "$label count"
    foreach ($entry in $expected.GetEnumerator()) {
        $rows = @($gold.grouped | Where-Object { $_.group -eq $entry.Key })
        Assert-Value $rows.Count 1 "$label $($entry.Key) count"
        Assert-Value $rows[0].amount $entry.Value "$label $($entry.Key)"
    }
    Assert-Value $gold.breakdownComplete $false "$label partial"
}
foreach ($t in $targets) {
    $raw = Invoke-RestMethod -Uri "https://api.opendota.com/api/matches/$($t.Id)" -TimeoutSec 120
    $players = @($raw.players | Where-Object { $_.player_slot -eq $t.Slot })
    Assert-Value $players.Count 1 'raw player count'
    Assert-Value $players[0].hero_id $t.Hero 'raw hero'
    $d = Invoke-RestMethod -Uri "$base/api/debug/match/$($t.Id)?playerSlot=$($t.Slot)" -TimeoutSec 120
    Assert-Value $d.normalized.selectedPlayer.playerSlot $t.Slot 'debug slot'
    Assert-Value $d.normalized.selectedPlayer.heroId $t.Hero 'debug hero'
    foreach ($reason in $players[0].gold_reasons.PSObject.Properties) {
        Assert-Value $d.goldReasonsDebug.raw.($reason.Name) $reason.Value "raw reason $($reason.Name)"
    }
    Assert-Gold $d.goldReasonsDebug $t.Expected 'debug'
    Assert-Gold $d.normalized.player.goldReasons $t.Expected 'normalized'
    Assert-Value $d.normalized.player.laneReview.lhAt10 $t.LH 'LH at 10'
    Assert-Value $d.normalized.player.laneReview.goldAt10 $t.Gold 'gold at 10'
    $last = $d.normalized.player.economyByPhase.PSObject.Properties.Value | Sort-Object endMinute | Select-Object -Last 1
    Assert-Value $last.endMinute $t.End 'last phase'
    $body = @{ matchId = $t.Id; selector = @{ playerSlot = $t.Slot } } | ConvertTo-Json -Depth 4 -Compress
    try {
        $p = Invoke-RestMethod -Method Post -Uri "$base/api/post-match/analyze" -ContentType 'application/json' -Body $body -TimeoutSec 120
    } catch {
        Write-Warning "Матч $($t.Id): product не подтверждён. $($_.ErrorDetails.Message)"
        continue
    }
    Assert-Value $p.debug.summary.selectedPlayer.playerSlot $t.Slot 'product slot'
    Assert-Value $p.debug.summary.selectedPlayer.heroId $t.Hero 'product hero'
    Assert-Gold $p.analysis.goldReasons $t.Expected 'product'
    Write-Host "Матч $($t.Id), слот $($t.Slot): raw/debug/normalized/product совпали."
}
```

Затем открыть эти же матчи и слоты в `/post-match`, раскрыть «Оценки, фазы и источники данных» и сверить доходы, потери и неопределённый источник по таблице выше. Ответ 422 означает, что product-проверка не завершена; не менять selector или guard для её обхода. PowerShell в среде исполнителя недоступен: команды подготовлены и проверены чтением, реальные HTTP-запросы выше выполнены через curl и приложение.

## Self-review полного diff

Проверены единственность ID mapping и нормализатора, соответствие pinned sources, отсутствие взаимного погашения знаков, состояние только unknown, raw/selector preservation, отдельные 16/21, полнота regressions и честная маркировка UI. Runtime фаз, role guards, engine, thresholds и scoring не изменены; carry-тесты переведены с вручную собранных объектов на действительный нормализатор. Новых зависимостей и CSS/redesign нет.
