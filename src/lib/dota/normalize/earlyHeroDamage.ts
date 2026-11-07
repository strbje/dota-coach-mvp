import { getHeroKeyById, getHeroNameById } from '../data/heroConstants';

export type EarlyDamagePlayer = {
  playerSlot: number;
  heroId: number;
  hero: string;
  heroKey?: string;
  selected: boolean;
  ally: boolean;
  damage?: number;
  firstFive?: number;
  nextFive?: number;
};
export type EarlyHeroDamage = {
  source: 'opendota';
  // A provider lane classification, not proof of continuous presence or damage targets.
  lane?: 1 | 2 | 3;
  players: EarlyDamagePlayer[];
};

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const slot = (value: unknown): value is number => count(value) && (value <= 4 || value >= 128 && value <= 132);

/** Cumulative game counter, NOT total hero_damage divided by match length.
 * Require explicit 0:00/10:00 samples. No interpolation, extrapolation or filling gaps with zero.
 */
export function earlyDamageValues(player: Record<string, unknown>, duration: number) {
  const times = player.times;
  const values = player.hero_damage_t;
  if (!Number.isFinite(duration) || duration < 600 || !Array.isArray(times) || !Array.isArray(values)
    || times.length !== values.length || !times.length
    || !times.every((t, i) => typeof t === 'number' && Number.isFinite(t) && (i === 0 || t > times[i - 1]))) return {};
  let previous = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] < 0 || times[i] > 600) continue;
    const value = values[i];
    if (value === null || value === undefined) continue;
    if (!count(value) || value < previous) return {};
    previous = value;
  }
  const at = (time: number) => values[times.indexOf(time)];
  const start: unknown = at(0), middle: unknown = at(300), end: unknown = at(600);
  if (!count(start) || !count(end) || end < start) return {};
  // Missing the midpoint does not erase two valid endpoints, but prevents a split.
  return { damage: end - start, ...(count(middle) ? { firstFive: middle - start, nextFive: end - middle } : {}) };
}

export function normalizeEarlyHeroDamage(players: Array<Record<string, unknown>>, selected: Record<string, unknown>, duration: number): EarlyHeroDamage | undefined {
  if (!slot(selected.player_slot) || !count(selected.hero_id) || selected.hero_id === 0) return undefined;
  const lane = [1, 2, 3].includes(Number(selected.lane)) && typeof selected.lane === 'number' && selected.is_roaming !== true
    ? selected.lane as 1 | 2 | 3 : undefined;
  const candidates = players.filter((p) => p === selected || lane !== undefined && p.lane === lane && p.is_roaming !== true);
  const rows = candidates.flatMap((p): EarlyDamagePlayer[] => {
    if (!slot(p.player_slot) || !count(p.hero_id) || p.hero_id === 0
      || players.filter((other) => other.player_slot === p.player_slot).length !== 1) return [];
    return [{ playerSlot: p.player_slot, heroId: p.hero_id, hero: getHeroNameById(p.hero_id) ?? `Герой ${p.hero_id}`,
      heroKey: getHeroKeyById(p.hero_id) ?? undefined, selected: p === selected, ally: (p.player_slot < 128) === (selected.player_slot as number < 128),
      ...earlyDamageValues(p, duration) }];
  }).sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.ally) - Number(a.ally) || a.playerSlot - b.playerSlot);
  if (!rows.some((p) => p.selected)) return undefined;
  return { source: 'opendota', lane, players: rows };
}
