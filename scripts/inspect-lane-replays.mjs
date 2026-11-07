// Issue #81: offline evidence, not a product normalizer or an evaluation model.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sumBy = (events, key) => events.reduce((out, e) => { const k = e[key] ?? 'unattributed'; out[k] = (out[k] ?? 0) + e.value; return out; }, {});

export function counterWindow(player, start, end) {
  const times = player?.times, values = player?.hero_damage_t;
  if (!Array.isArray(times) || !Array.isArray(values) || !times.length || times.length !== values.length) return { status: 'unavailable', damage: null };
  if (times.some((t, i) => !Number.isFinite(t) || i > 0 && t <= times[i - 1])) return { status: 'invalid-clock', damage: null };
  const a = times.indexOf(start), b = times.indexOf(end);
  if (a < 0 || b < 0) return { status: 'missing-boundary', damage: null };
  if (values.slice(a, b + 1).some((v, i, rows) => !valid(v) || i > 0 && v < rows[i - 1])) return { status: 'invalid-counter', damage: null };
  return { status: 'available', damage: values[b] - values[a], startValue: values[a], endValue: values[b] };
}

export function validateProjection(rows, matchId) {
  if (rows[0]?.type !== 'context' || rows[0]?.matchId !== matchId || rows.at(-1)?.type !== 'complete' || rows.at(-1)?.rowsBeforeComplete !== rows.length - 1) throw new Error('Wrong match or incomplete replay projection');
  const slots = new Map();
  for (const e of rows.filter((r) => r.type === 'player_slot')) {
    if (!/^[0-9]$/.test(e.key) || !Number.isInteger(e.value) || !(e.value >= 0 && e.value <= 4 || e.value >= 128 && e.value <= 132) || slots.has(Number(e.key))) throw new Error('Invalid/duplicate replay slot');
    slots.set(Number(e.key), e.value);
  }
  if (slots.size !== 10 || new Set(slots.values()).size !== 10) throw new Error('Incomplete replay roster');
  const seen = new Set();
  for (const e of rows.filter((r) => r.type === 'interval')) {
    const key = `${e.slot}:${e.time}`;
    if (seen.has(key)) throw new Error('Duplicate interval time; do not choose an arbitrary sample');
    seen.add(key);
  }
  return slots;
}

// Reproduces the pinned OpenDota coarse laneMappings ONLY for research sample counts.
// These old rectangles do not validate present-day geometry, lane membership or product coordinates.
export function coarseBucket(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'unavailable';
  const i = 128 - (Math.round(y) - 64), j = Math.round(x) - 64;
  if (i < 0 || i >= 128 || j < 0 || j >= 128) return 'outside';
  if (Math.abs(i - (127 - j)) < 8) return 'mid';
  if (j < 27 || i < 27) return 'top';
  if (j >= 100 || i >= 100) return 'bottom';
  return i < 50 ? 'dire-jungle' : i >= 77 ? 'radiant-jungle' : 'mid';
}

export function sampleBuckets(intervals, start, end) {
  const selected = intervals.filter((e) => e.time >= start && e.time < end);
  const buckets = {};
  for (const e of selected) {
    const b = e.life_state === 0 ? coarseBucket(e.x, e.y) : e.life_state == null ? 'life-state-unavailable' : 'dead-or-dying';
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  return { start, end, samples: selected.length, expectedOneSecondSamples: end - start, buckets };
}

export function inspectMatch(api, rows, heroes, heroId) {
  const slots = validateProjection(rows, api.match_id);
  const matches = api.players?.filter((p) => p.hero_id === heroId);
  if (api.players?.length !== 10 || matches?.length !== 1) throw new Error('Ambiguous API roster');
  const player = matches[0], selectedName = heroes[heroId]?.name;
  if (!selectedName) throw new Error('Hero name contract unavailable');
  const selectedSlot = [...slots].find(([, slot]) => slot === player.player_slot)?.[0];
  const intervals = rows.filter((e) => e.type === 'interval' && e.slot === selectedSlot);
  if (!intervals.length || intervals.some((e) => e.hero_id !== heroId)) throw new Error('Replay hero does not match API slot');
  const enemyPlayers = api.players.filter((p) => (p.player_slot < 128) !== (player.player_slot < 128));
  const enemies = new Map(enemyPlayers.map((p) => [heroes[p.hero_id]?.name, p]));
  if (enemies.has(undefined)) throw new Error('Enemy hero name unavailable');
  const damage = rows.filter((e) => e.type === 'DOTA_COMBATLOG_DAMAGE' && e.time >= 0 && e.time < 600);
  if (damage.some((e) => !valid(e.value))) throw new Error('Invalid damage event');
  const dealt = damage.filter((e) => e.sourcename === selectedName && e.targethero === true && e.targetillusion === false && enemies.has(e.targetname));
  const received = damage.filter((e) => e.targetname === selectedName && e.targethero === true && e.targetillusion === false && enemies.has(e.sourcename));
  const counterComparisons = Array.from({ length: 11 }, (_, i) => i * 60).map((time) => {
    const index = player.times?.indexOf(time) ?? -1;
    const provider = index >= 0 && valid(player.hero_damage_t?.[index]) ? player.hero_damage_t[index] : null;
    const replay = intervals.find((e) => e.time === time)?.hero_damage ?? null;
    return { time, provider, replay, equal: provider !== null && replay !== null ? provider === replay : null,
      ...(provider !== replay ? { nextSecondReplay: intervals.find((e) => e.time === time + 1)?.hero_damage ?? null } : {}) };
  });
  const targets = [...new Set(dealt.map((e) => e.targetname))].map((name) => {
    const events = dealt.filter((e) => e.targetname === name), opponent = enemies.get(name);
    return { heroId: opponent.hero_id, name: heroes[opponent.hero_id].localized_name, providerLane: opponent.lane ?? null,
      sameProviderLaneAsSelected: player.lane != null && opponent.lane != null ? opponent.lane === player.lane : null,
      damage: events.reduce((n, e) => n + e.value, 0), firstRoundedSecond: Math.min(...events.map((e) => e.time)), lastRoundedSecond: Math.max(...events.map((e) => e.time)) };
  });
  const roster = api.players.map((p) => {
    const slot = [...slots].find(([, s]) => s === p.player_slot)?.[0];
    const points = rows.filter((e) => e.type === 'interval' && e.slot === slot);
    return { heroId: p.hero_id, name: heroes[p.hero_id]?.localized_name, playerSlot: p.player_slot,
      providerLane: p.lane ?? null, providerLaneRole: p.lane_role ?? null, providerRoaming: p.is_roaming ?? null,
      // A lane_role is not a confirmed POSITION_1/3/4/5.
      confirmedPosition: null, samples: [sampleBuckets(points, 0, 300), sampleBuckets(points, 300, 600)] };
  });
  return { matchId: api.match_id, heroId, playerSlot: player.player_slot, startTime: api.start_time,
    duration: api.duration, providerVersion: api.version, patch: api.patch ?? null, gameMode: api.game_mode ?? null, lobbyType: api.lobby_type ?? null,
    methodologyStatus: 'research-only', productReady: false, confirmedPosition: null, rankCohort: null,
    windows: [[0, 300], [300, 600], [0, 600]].map(([start, end]) => ({ start, end, ...counterWindow(player, start, end) })),
    counterComparisons, combat: { bounds: '0 <= rounded parser time < 600; no clock shift applied',
      damageDealt: dealt.reduce((n, e) => n + e.value, 0), byActor: sumBy(dealt, 'attackername'), targets,
      damageReceivedFromEnemyHeroOwners: received.reduce((n, e) => n + e.value, 0), receivedByOwner: sumBy(received, 'sourcename'),
      targetIllusionDamageExcluded: damage.filter((e) => e.sourcename === selectedName && e.targethero === true && e.targetillusion === true).reduce((n, e) => n + e.value, 0),
      attackerIllusionDamageIncluded: dealt.filter((e) => e.attackerillusion === true).reduce((n, e) => n + e.value, 0),
      receivedUnattributedOrNonEnemyOwnerDamageExcluded: damage.filter((e) => e.targetname === selectedName && e.targethero === true && e.targetillusion === false && !enemies.has(e.sourcename)).reduce((n, e) => n + e.value, 0),
    }, roster,
    limitations: ['No current authenticated STRATZ damage capture.', 'No verified hard-lane/early-jungle-exit label.', 'Coarse buckets count samples, not validated time on lane.', 'Counter and combat windows may differ at rounded boundaries.', 'No matchup cohort, quality score, or causal conclusion.'] };
}

async function main() {
  const [directory, output, ...targets] = process.argv.slice(2);
  if (!directory || !output || !targets.length || targets.some((t) => !/^[1-9]\d*:[1-9]\d*$/.test(t))) throw new Error('Usage: node scripts/inspect-lane-replays.mjs INPUT_DIR NEW_OUTPUT.json matchId:heroId ...');
  const heroBytes = await readFile(join(directory, 'heroes.json'));
  const heroes = JSON.parse(heroBytes);
  const results = [];
  for (const target of targets) {
    const [id, heroId] = target.split(':').map(Number);
    const api = await readFile(join(directory, `${id}.raw.json`)), replay = await readFile(join(directory, `${id}.early.jsonl`));
    const headers = await readFile(join(directory, `${id}.headers`), 'utf8');
    const compressed = await readFile(join(directory, `${id}.dem.bz2`));
    results.push({ ...inspectMatch(JSON.parse(api), replay.toString().trimEnd().split('\n').map(JSON.parse), heroes, heroId),
      provenance: { endpoint: `https://api.opendota.com/api/matches/${id}`, responseDate: headers.match(/^date: (.+)$/im)?.[1]?.trim() ?? null,
        responseSha256: hash(api), projectionSha256: hash(replay), replayArchiveSha256: hash(compressed), replayArchiveBytes: compressed.length } });
  }
  await writeFile(output, JSON.stringify({ methodologyStatus: 'research-only', productReady: false,
    heroConstantsSha256: hash(heroBytes), parserCommit: '927adf6bbd1fd321b711f544a5d754bfe75d89a7',
    coreCommit: '6511b56a709351d52f43ca082a4d2a5940dff060', matches: results }, null, 2) + '\n', { flag: 'wx' });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
