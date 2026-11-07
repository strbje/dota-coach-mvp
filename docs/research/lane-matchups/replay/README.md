# Воспроизведение сверки #81

Это offline-инструменты исследования. Приложение их не импортирует. Полные реплеи, аккаунты, чат, сборка Java и временные JSONL не добавляются в git.

## Закреплённая цепочка

- OpenDota parser `927adf6bbd1fd321b711f544a5d754bfe75d89a7` (все Java sources, кроме сетевого `Main.java`). Источники не изменены.
- Clarity 5.0.1, protobuf 7.0, прочие jars и SHA-256 — существующий [toolchain.json](../../stratz-coordinates/replay/toolchain.json). Загруженные файлы сверены по хешам.
- Temurin 21.0.13+9. В исследовании использован [официальный Linux x64 JDK](https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.13_9.tar.gz), SHA-256 `d7f5d5cf865a2902b70ff549b97586a7d3f234e016f041ab447ea740c7d66d1c`.
- Python 3 + zstandard 0.25.0 — только распаковка; Node >=20.9 — компактная сверка и тесты.

`LaneReplayProbe.java` оборачивает штатный `Parse` без запуска сервера. Сохраняет только игровые scalar-поля interval/damage/heal/death от −1 до 660 округлённых секунд и mapping слотов. Match ID читается из replay info. Только после успешного epilogue пишется маркер `complete` с числом строк. Неполная запись непригодна для сверки. История до −1 не экспортируется, поэтому **предматчевый combat log здесь не исследован**.

## Уже проверенные архивы

| Матч | URL Valve | SHA-256 архива |
|---|---|---|
| 9019592113 | http://replay185.valve.net/570/9019592113_1795309280.dem.bz2 | `afcd4f95af3dce38bbed613e8518fc059b2782365a65d3561799c8ebc7550b07` |
| 9003795847 | http://replay273.valve.net/570/9003795847_131812823.dem.bz2 | `8fb6f938727bc3cc204d10d484ce2e072664e9bb5ba8f3c9bfb526b9753a87c5` |
| 9078566584 | http://replay187.valve.net/570/9078566584_2100626761.dem.bz2 | `e2426fd5197a2eb53aeeb73b26dee385162745d15f198597abcfb6831a0e2847` |

На 07.11.2026 все три скачаны успешно. Срок доступности Valve не гарантирован. **Фактическое сжатие всех трёх — Zstandard** (magic `28b52ffd`), несмотря на `.bz2`. Первые два SHA совпали с ранее предоставленными владельцем. Чужой непроверенный архив нельзя подменять под эти имена.

## Команды для разработчика (Linux/bash, не нужны владельцу для STRATZ)

Запускать из корня репозитория, с JDK 21 в `PATH` и установленным `zstandard==0.25.0`. `research_work` — отдельный временный каталог. Нужна память для штатного parser, который буферизует полный матч; здесь каждый из трёх последовательно разобран с `-Xmx1400m`.

```bash
research_repo="$PWD"
research_work=$(mktemp -d)
git clone https://github.com/odota/parser.git "$research_work/parser"
git -C "$research_work/parser" checkout 927adf6bbd1fd321b711f544a5d754bfe75d89a7
mkdir -p "$research_work/jars" "$research_work/classes"
python - "$research_work" <<'PY'
import hashlib, json, pathlib, sys, urllib.request
work = pathlib.Path(sys.argv[1])
toolchain = json.load(open('docs/research/stratz-coordinates/replay/toolchain.json'))
for entry in toolchain['jars']:
    content = urllib.request.urlopen(entry['url'], timeout=60).read()
    if hashlib.sha256(content).hexdigest() != entry['sha256']:
        raise ValueError('Dependency hash mismatch: ' + entry['file'])
    (work / 'jars' / entry['file']).write_bytes(content)
PY
javac -J-XX:-UsePerfData -proc:full -cp "$research_work/jars/*" -d "$research_work/classes" \
  docs/research/lane-matchups/replay/LaneReplayProbe.java \
  $(find "$research_work/parser/src/main/java" -name '*.java' ! -name Main.java)
```

`-proc:full` нужен для annotation processors закреплённого Clarity; без них обнаружение event providers не работает. `-XX:-UsePerfData` обходит наблюдавшийся конфликт служебной памяти JVM в исследовательском окружении; сетевых функций не включает.

В каталог входных данных положить архивы из таблицы как `MATCH.dem.bz2`. Получить оригинальные OpenDota ответы и headers, например:

```bash
research_input="$research_work/input"
mkdir -p "$research_input"
for match_id in 9019592113 9003795847 9078566584; do
  curl --fail --location --max-time 60 -D "$research_input/$match_id.headers" \
    "https://api.opendota.com/api/matches/$match_id" -o "$research_input/$match_id.raw.json"
done
curl --fail --location --max-time 60 https://api.opendota.com/api/constants/heroes \
  -o "$research_input/heroes.json"
```

Свежие API-ответы могут отличаться от опубликованных хешей: это новая проба, а не точная реконструкция старого тела ответа. Сами опубликованные значения и хеши находятся в [наблюдениях](../observations-2026-11-07.json).

После сохранения архивов в `research_input` распаковать **по magic**, не расширению:

```bash
python - "$research_input" <<'PY'
import hashlib, json, pathlib, shutil, sys, zstandard
root = pathlib.Path(sys.argv[1])
observations = json.load(open('docs/research/lane-matchups/observations-2026-11-07.json'))
for match in observations['matches']:
    mid = str(match['matchId'])
    archive = root / (mid + '.dem.bz2')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != match['provenance']['replayArchiveSha256']:
        raise ValueError('Replay hash mismatch: ' + mid)
    with archive.open('rb') as source:
        if source.read(4) != bytes.fromhex('28b52ffd'):
            raise ValueError('Unexpected compression: ' + mid)
        source.seek(0)
        with zstandard.ZstdDecompressor().stream_reader(source) as decoded, (root / (mid + '.dem')).open('xb') as target:
            shutil.copyfileobj(decoded, target)
PY
for match_id in 9019592113 9003795847 9078566584; do
  java -XX:-UsePerfData -XX:ActiveProcessorCount=2 -Xmx1400m \
    -cp "$research_work/classes:$research_work/jars/*" LaneReplayProbe \
    "$research_input/$match_id.dem" "$research_input/$match_id.early.jsonl"
done
node scripts/inspect-lane-replays.mjs "$research_input" "$research_work/observations.json" \
  9019592113:42 9003795847:42 9078566584:42
npm run test:stratz-research
```

Java и Node отказываются перезаписывать готовые файлы. Неудачный разбор оставляет файл без `complete`; убрать его вручную перед осознанным повтором. Сверка проверяет match ID, полный mapping слотов, выбранного героя и дубликаты секунд. Пропуски minute boundaries остаются `null`, а объём пространственных семплов показан отдельно. Вся цепочка не подтверждает STRATZ clocks/illusions, точную геометрию линии или причинную оценку игрока.
