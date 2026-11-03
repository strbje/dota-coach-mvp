# Offline replay verification for #50

These are **research helpers for the two specified WK matches**, not a general replay
service or a replacement for the product adapter. They perform no network calls and do
not read `.env.local`. Run them manually with trusted local input files, Java 21 and
Python 3.11+; do not run Python with `-O` (assertions validate evidence).
The main [report](../2026-11-04.md) describes measured results and remaining limitations.

- `ReplayProbe.java` uses Clarity to decode the selected WK, named landmarks, life-state
  transitions and combat events. Null/absent properties remain null. It writes UTF-8
  JSONL with a `complete` footer only after successful decoding.
- `compare_replays.py` checks the capture hash, decoded Match ID/team/slot, completion,
  monotonic clocks and unique death transitions. It compares the **saved actual adapter
  output** from November 3; it does not reimplement the adapter. Counts/windows and
  selected CS indices are specific to the research sample. Ambiguous CS candidates stay
  in the output. No STRATZ null axis is filled from a previous event.
- Both tools refuse to overwrite an existing output. Java failures may leave an
  incomplete JSONL without `complete`; such a file is not evidence and Python rejects it.
- Do not commit raw captures, replays, JSONL, JARs, compiled classes or player identities.
  Only the compact numerical protocol and code belong in this PR.

## Dependencies and inputs

The executed environment was Linux, Temurin 21.0.13+9, Python 3.12.14, zstandard 0.25.0.
Exact Maven Central URLs and measured JAR SHA-256 values are in [toolchain.json](toolchain.json).
Java 17 is insufficient for Clarity 5.0.1. `javac -proc:none` avoids annotation processing;
Clarity discovers event callbacks at runtime. No npm dependency or product build changes
are required. SLF4J's no-provider warning in these runs only means no logging backend.

Use these existing inputs from the owner, without fetching new STRATZ data:

- `stratz-coordinates-20261103-234056.json` (hash in the main report).
- `9019592113.dem.bz2` and `9003795847.dem.bz2` (hashes in the main report).
  Both are **Zstandard**, magic `28 b5 2f fd`, despite the suffix. Decompress by detected
  format, not by `.bz2`. A valid decoded file starts with `PBDEMS2\0`.
- Repository `observations-2026-11-03.json` from this PR is the saved adapter baseline.

## Reproduce on Linux

Commands below use the same operations executed for this report. Set an absolute checkout
path, and use a fresh working directory so outputs cannot be accidentally overwritten.
Put the three owner files in `$study/input` before running. A Java 21 JDK must be on PATH.

```bash
repo=/absolute/path/to/dota-coach-mvp
study=/absolute/path/to/new-dota50-verification
source_dir="$repo/docs/research/stratz-coordinates/replay"
mkdir -p "$study/input" "$study/jars" "$study/classes" "$study/replays"
cp "$source_dir/toolchain.json" "$study/toolchain.json"
cd "$study"
python -m pip install zstandard==0.25.0
python - <<'PY'
import hashlib, json, shutil, urllib.request
from pathlib import Path
import zstandard
for jar in json.loads(Path('toolchain.json').read_text())['jars']:
    path = Path('jars') / jar['file']
    with urllib.request.urlopen(jar['url'], timeout=30) as response:
        data = response.read()
    assert hashlib.sha256(data).hexdigest() == jar['sha256'], jar['file']
    with path.open('xb') as output:
        output.write(data)
archives = {
    '9019592113': 'afcd4f95af3dce38bbed613e8518fc059b2782365a65d3561799c8ebc7550b07',
    '9003795847': '8fb6f938727bc3cc204d10d484ce2e072664e9bb5ba8f3c9bfb526b9753a87c5',
}
for match, expected in archives.items():
    path = Path('input') / f'{match}.dem.bz2'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
    with path.open('rb') as compressed:
        assert compressed.read(4) == bytes.fromhex('28b52ffd')
        compressed.seek(0)
        with zstandard.ZstdDecompressor().stream_reader(compressed) as decoded:
            with (Path('replays') / f'{match}.dem').open('xb') as output:
                shutil.copyfileobj(decoded, output)
    with (Path('replays') / f'{match}.dem').open('rb') as decoded:
        assert decoded.read(8) == b'PBDEMS2\0'
PY
javac -proc:none -cp "$study/jars/*" -d "$study/classes" "$source_dir/ReplayProbe.java"
for match in 9019592113 9003795847; do
  java -Xmx1500m -cp "$study/classes:$study/jars/*" ReplayProbe \
    "$study/replays/$match.dem" "$study/replays/$match.verified.jsonl"
done
python "$source_dir/compare_replays.py" \
  "$study/input/stratz-coordinates-20261103-234056.json" \
  "$repo/docs/research/stratz-coordinates/observations-2026-11-03.json" \
  "$study/replays" "$study/observations-2026-11-04.json"
```

Inspect command exit codes: do not accept a failed/partial run just because a file exists.
The collector JSONL hashes and the protocol should match the committed result when the
pinned inputs/dependencies/source are used. Source hashes are included in the protocol.

## PowerShell entry point

The owner has already supplied the required files; **nothing needs uploading again**.
The successful download location was `$env:temp\dota50-replays`. If repeating only the
Java decode on Windows, with Java 21 on PATH, unpacked `.dem` files and the verified
six JARs already in a `jars` subdirectory, the corresponding commands are:

```powershell
cd D:\dota-coach
$study = join-path $env:temp 'dota50-replays'
$probe = join-path (get-location) 'docs\research\stratz-coordinates\replay'
new-item -itemtype directory -force "$study\classes" | out-null
javac -proc:none -cp "$study\jars\*" -d "$study\classes" "$probe\ReplayProbe.java"
if ($lastexitcode -ne 0) { throw 'javac failed; Java 21 is required' }
foreach ($match in '9019592113', '9003795847') {
    java -Xmx1500m -cp "$study\classes;$study\jars\*" ReplayProbe "$study\$match.dem" "$study\$match.verified.jsonl"
    if ($lastexitcode -ne 0) { throw "decode failed: $match" }
}
```

PowerShell syntax was reviewed but not executed in the Linux research environment. This
is an optional reproduction entry point with explicit prerequisites, not another request
for local work. Visual validation still needs the correct map asset/build and client;
these helpers produce no minimap image and do not claim to establish rendering semantics.

## Internal visual review fixture

`build_visual_review.py` derives the compact development-only review fixture from
the same real inputs and verified decoded outputs. It uses the first increasing
WK/skeleton `lastHits` counter for all CS (consecutive 1..N and ±2s); no XY-based
selection is used. Every skeleton kill stays credited to the player. For 13
preselected examples, all dying entities within ±0.1s are retained as candidates,
not asserted to be the victim. The script validates capture/decode hashes and the
complete footer, embeds its source hash, and refuses to overwrite an output.

With `repo` and `study` set by the Linux instructions above:

```bash
python "$repo/docs/research/stratz-coordinates/replay/build_visual_review.py" \
  "$study/input/stratz-coordinates-20261103-234056.json" \
  "$repo/docs/research/stratz-coordinates/observations-2026-11-04.json" \
  "$study/replays" "$study/visual-review-data.json"
cmp "$study/visual-review-data.json" \
  "$repo/docs/research/stratz-coordinates/visual-review-data.json"
```

The committed fixture contains real research points, no account IDs or complete
provider capture. See [the visual-stage report](../2026-11-04-visual.md) for screen
usage, source limits and the remaining map-asset/client validation.
