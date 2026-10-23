import { normalizeItemConstants } from '@/lib/dota/adapters/normalizeItemConstants';
import { fetchOpenDotaConstants } from '@/lib/dota/clients/opendota';
import { setHeroConstants } from '@/lib/dota/data/heroConstants';
import { setItemConstants } from '@/lib/dota/data/itemConstants';
import type { GoldReasonGroup } from '@/lib/dota/normalize/goldReasons';

let hydrated = false; let inFlight: Promise<void> | null = null;

export type GoldReasonConstant = { id: number; key: string; label: string; group: GoldReasonGroup };

// Verified 2026-10-23 against OpenDota web translations and the game's enum.
// Pinned sources and the NULL_gold_reasons_16 spelling: docs/OPENDOTA_FIELDS.md.
const GOLD_REASON_FALLBACK: Record<string, GoldReasonConstant> = {
  '1': { id: 1, key: 'death', label: 'Death', group: 'death' },
  '2': { id: 2, key: 'buyback', label: 'Buyback', group: 'buyback' },
  '6': { id: 6, key: 'sell_item', label: 'Sell Item', group: 'sale' },
  '11': { id: 11, key: 'building', label: 'Building', group: 'buildings' },
  '12': { id: 12, key: 'hero_kill', label: 'Hero Kill', group: 'heroes' },
  '13': { id: 13, key: 'creep_kill', label: 'Creep Kill', group: 'creeps' },
  '14': { id: 14, key: 'neutral_kill', label: 'Neutral Kill', group: 'neutral' },
  '15': { id: 15, key: 'roshan_kill', label: 'Roshan Kill', group: 'roshan' },
  '16': { id: 16, key: 'courier_kill', label: 'Courier Kill', group: 'courier' },
  '17': { id: 17, key: 'bounty_rune', label: 'Bounty Rune', group: 'bounty' },
  '19': { id: 19, key: 'ability_gold', label: 'Ability Gold', group: 'ability' },
  '20': { id: 20, key: 'ward_kill', label: 'Ward Kill', group: 'wards' },
  '21': { id: 21, key: 'courier_killed_by_this_player', label: 'Courier Killed By This Player', group: 'courierBonus' }
};

export function normalizeGoldReasonConstants(payload: unknown): Record<string, GoldReasonConstant> {
  const result: Record<string, GoldReasonConstant> = { ...GOLD_REASON_FALLBACK };
  if (!payload || typeof payload !== 'object') return result;

  for (const [idKey, value] of Object.entries(payload as Record<string, unknown>)) {
    const parsedId = Number(idKey);
    if (!Number.isSafeInteger(parsedId) || parsedId < 0) continue;
    // A generic/obsolete provider label must not override verified ID semantics.
    // Unreviewed IDs retain their raw label for debug, but stay unknown in product.
    if (GOLD_REASON_FALLBACK[idKey]) continue;
    if (typeof value === 'string') {
      const clean = value.trim();
      result[idKey] = { id: parsedId, key: clean.toLowerCase().replace(/\s+/g, '_'), label: clean, group: 'unknown' };
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const key = (typeof raw.key === 'string' && raw.key.trim()) || (typeof raw.name === 'string' && raw.name.trim()) || `reason_${idKey}`;
    const label = (typeof raw.label === 'string' && raw.label.trim())
      || (typeof raw.localized_name === 'string' && raw.localized_name.trim())
      || (typeof raw.name === 'string' && raw.name.trim())
      || key;
    result[idKey] = { id: parsedId, key, label, group: 'unknown' };
  }
  return result;
}

export async function getGoldReasonConstants(): Promise<Record<string, GoldReasonConstant>> {
  const constants = await fetchOpenDotaConstants('gold_reasons');
  return normalizeGoldReasonConstants(constants);
}
export function normalizeHeroes(heroes: unknown): { heroKeyById: Record<number, string>; heroNameByKey: Record<string, string> } {
  const heroKeyById: Record<number, string> = {}; const heroNameByKey: Record<string, string> = {};
  if (!heroes || typeof heroes !== 'object') return { heroKeyById, heroNameByKey };
  for (const [entryKey, value] of Object.entries(heroes as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const id = typeof raw.id === 'number' ? raw.id : undefined;
    // /constants/heroes is keyed by numeric ID; `name` holds the canonical asset key.
    const candidate = typeof raw.name === 'string' ? raw.name.replace(/^npc_dota_hero_/, '') : entryKey;
    if (!id || !Number.isSafeInteger(id) || id <= 0) continue;
    // Keep a known display name even if canonical image metadata is absent.
    const key = /^[a-z][a-z0-9_]*$/.test(candidate) ? candidate : String(id);
    heroKeyById[id] = key;
    if (typeof raw.localized_name === 'string') heroNameByKey[key] = raw.localized_name;
  }
  return { heroKeyById, heroNameByKey };
}
export async function ensureOpenDotaConstantsLoaded(): Promise<void> {
  if (hydrated) return; if (inFlight) return inFlight;
  inFlight = (async () => { const [items, itemIds, heroes] = await Promise.all([fetchOpenDotaConstants('items'), fetchOpenDotaConstants('item_ids'), fetchOpenDotaConstants('heroes')]); setItemConstants(normalizeItemConstants(items, itemIds)); setHeroConstants(normalizeHeroes(heroes)); hydrated = true; })().finally(() => { inFlight = null; });
  return inFlight;
}
