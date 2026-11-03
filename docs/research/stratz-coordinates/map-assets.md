# Минимальная выгрузка подложки для #50

## Сейчас нужен один недостающий файл

Первый `dota50-map-assets.zip` **получен, полный и исправный**. Повторять прежнюю
команду не нужно. [Проверка материала](2026-11-04-assets.md) установила его реальную
зависимость: `materials/overviews/dota_tga_d8178876.vtex_c` (~1 МБ).
В нашем первом списке были другие текстуры — это неточность списка, не ошибка владельца.

Ниже самостоятельный блок для PowerShell. Он найдёт уже скачанный Source 2 Viewer
CLI в прежней временной папке, извлечёт **только этот файл** и откроет Проводник с
готовым `dota50-map-reference.zip`. Каталог игры только читается; токен не нужен.
Параметры проверены по [исходнику CLI 20.1](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/20.1/CLI/Decompiler.cs),
но этот дополнительный блок не выполнялся в Windows.

```powershell
cd D:\dota-coach
$ErrorActionPreference = 'Stop'
$cliFile = Get-ChildItem (Join-Path $env:TEMP 'dota50-map-*\tool\Source2Viewer-CLI.exe') -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $cliFile) { throw 'Не найден ранее скачанный CLI. Сохраните текст ошибки.' }
$cliPath = $cliFile.FullName
$steamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath
$libraryPaths = @($steamPath)
foreach ($line in Get-Content (Join-Path $steamPath 'steamapps\libraryfolders.vdf')) {
    if ($line -match '"path"\s+"([^"]+)"') { $libraryPaths += $Matches[1].Replace('\\', '\') }
}
$dotaPaths = @($libraryPaths | Select-Object -Unique | ForEach-Object {
    $candidate = Join-Path $_ 'steamapps\common\dota 2 beta\game\dota'
    if (Test-Path (Join-Path $candidate 'pak01_dir.vpk')) { $candidate }
})
if ($dotaPaths.Count -ne 1) { throw 'Не найдена единственная установка Dota 2. Сохраните текст ошибки.' }
$workDir = Join-Path $env:TEMP ('dota50-map-reference-' + [guid]::NewGuid().ToString('N'))
$payloadDir = Join-Path $workDir 'files'
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
$assetPath = 'materials/overviews/dota_tga_d8178876.vtex_c'
& $cliPath --input (Join-Path $dotaPaths[0] 'pak01_dir.vpk') --output ($payloadDir + '\') --vpk_filepath $assetPath
if ($LASTEXITCODE -ne 0) { throw 'Ошибка извлечения; сохраните вывод CLI' }
$assetFile = Join-Path $payloadDir $assetPath
if (-not (Test-Path -LiteralPath $assetFile)) { throw 'Нужный файл не извлечён; сохраните вывод CLI' }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $assetFile).Hash
@{ path = $assetPath; bytes = (Get-Item -LiteralPath $assetFile).Length; sha256 = $hash } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $payloadDir 'manifest.json')
$archive = Join-Path $workDir 'dota50-map-reference.zip'
Compress-Archive -Path (Join-Path $payloadDir '*') -DestinationPath $archive
Get-FileHash -Algorithm SHA256 -LiteralPath $archive
Write-Host "Прикрепите только этот файл: $archive"
explorer.exe "/select,$archive"
```

Ожидаемые по обоим историческим каталогам параметры: **1 050 660 байт**, CRC32
**`d9e2fc78`**. Проверим их после получения файла. Даже совпадение не заменяет
проверку активной подложки и эпизодов в клиенте Dota 2.

<details>
<summary>История: первая выгрузка, уже выполнена — повторять не нужно</summary>

JSON и оба реплея уже получены. Нужны **четыре файла миникарты** и `steam.inf`,
не полный VPK и не повторная STRATZ-выгрузка. Токены не нужны.

Ниже команды для Windows PowerShell: автоматически находят установленную Dota 2
по библиотекам Steam, скачивают официальный Source 2 Viewer CLI **20.1**, проверяют
SHA-256 архива и извлекают только заданные пути. Каталог игры используется для чтения.
Файлы создаются в новом временном каталоге; в конце Проводник выделит готовый ZIP.

Источники: [release 20.1](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.1),
[CLI этой версии](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/20.1/CLI/Decompiler.cs).
Параметры проверены по исходнику закреплённой версии, **Windows-команды здесь не
выполнялись**. Если Dota не установлена или файлов нет, ошибка не означает, что
полученные ранее реплеи повреждены.

Скопировать блок целиком в PowerShell:

```powershell
cd D:\dota-coach
$ErrorActionPreference = 'Stop'
$steamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath
$libraryPaths = @($steamPath)
$libraryConfig = Join-Path $steamPath 'steamapps\libraryfolders.vdf'
foreach ($line in Get-Content $libraryConfig) {
    if ($line -match '"path"\s+"([^"]+)"') {
        $libraryPaths += $Matches[1].Replace('\\', '\')
    }
}
$dotaPaths = @($libraryPaths | Select-Object -Unique | ForEach-Object {
    $candidate = Join-Path $_ 'steamapps\common\dota 2 beta\game\dota'
    if (Test-Path (Join-Path $candidate 'pak01_dir.vpk')) { $candidate }
})
if ($dotaPaths.Count -ne 1) { throw 'Не найдена единственная установка Dota 2. Сохраните текст ошибки.' }
$dotaPath = $dotaPaths[0]
$workDir = Join-Path $env:TEMP ('dota50-map-' + [guid]::NewGuid().ToString('N'))
$toolDir = Join-Path $workDir 'tool'
$payloadDir = Join-Path $workDir 'map-assets'
New-Item -ItemType Directory -Path $toolDir, $payloadDir -Force | Out-Null
$toolZip = Join-Path $workDir 'cli-windows-x64.zip'
curl.exe --fail --location --connect-timeout 15 --max-time 300 --output $toolZip 'https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/20.1/cli-windows-x64.zip'
if ($LASTEXITCODE -ne 0) { throw 'Не удалось скачать Source 2 Viewer CLI' }
$expected = '67aaf8a67a85ca60fd09ff343e62103a4cdf3a2d177fc656231d7d734c5b3aa3'
if ((Get-FileHash -Algorithm SHA256 $toolZip).Hash.ToLowerInvariant() -ne $expected) { throw 'SHA-256 инструмента не совпал' }
Expand-Archive -LiteralPath $toolZip -DestinationPath $toolDir
$cliFiles = @(Get-ChildItem $toolDir -Recurse -Filter 'Source2Viewer-CLI.exe')
if ($cliFiles.Count -ne 1) { throw 'Не найден Source2Viewer-CLI.exe' }
$cliPath = $cliFiles[0].FullName
$assetPaths = @('materials/overviews/dota.vmat_c', 'materials/overviews/dota_psd.vtex_c', 'materials/overviews/dota_psd_8b4a9409.vtex_c', 'resource/overviews/dota.txt')
& $cliPath --input (Join-Path $dotaPath 'pak01_dir.vpk') --output $payloadDir --vpk_filepath ($assetPaths -join ',')
if ($LASTEXITCODE -ne 0) { throw 'Ошибка извлечения; сохраните вывод CLI' }
Copy-Item -LiteralPath (Join-Path $dotaPath 'steam.inf') -Destination $payloadDir
$missing = @($assetPaths | Where-Object { -not (Test-Path (Join-Path $payloadDir $_)) })
$manifest = @(Get-ChildItem $payloadDir -Recurse -File | ForEach-Object {
    [pscustomobject]@{ path = $_.FullName.Substring($payloadDir.Length + 1); bytes = $_.Length; sha256 = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash }
})
@{ toolVersion = '20.1'; missing = $missing; files = $manifest } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $payloadDir 'manifest.json')
$archive = Join-Path $workDir 'dota50-map-assets.zip'
Compress-Archive -Path (Join-Path $payloadDir '*') -DestinationPath $archive
Get-FileHash -Algorithm SHA256 $archive
Write-Host "Прикрепите только этот файл: $archive"
if ($missing.Count) { Write-Host ('Отсутствуют: ' + ($missing -join ', ')) }
explorer.exe "/select,$archive"
```

Ожидаемый файл — **`dota50-map-assets.zip`**. Архив инструмента `cli-windows-x64.zip`
присылать не нужно. Отсутствующие файлы отмечены в manifest: не заменяйте их вручную
картой из интернета. Если команда завершилась ошибкой, достаточно текста ошибки.

После получения архива сверяем CRC/размеры с обоими историческими manifests,
читаем material/overview и конвертируем именно referenced texture. Совпадение
проверяем отдельно от текущей версии установленной игры. Затем сопоставляем
ориентиры и [контрольные эпизоды](2026-11-04-visual.md#как-воспроизвести-набор-и-что-проверить-визуально).
Совпадение изображения не доказывает точность времени CS/death и не меняет
`productReady=false` автоматически.

</details>
