import { normalizeItemConstants } from '@/lib/dota/adapters/normalizeItemConstants';
import { fetchOpenDotaConstants } from '@/lib/dota/clients/opendota';
import { setHeroConstants } from '@/lib/dota/data/heroConstants';
import { setItemConstants } from '@/lib/dota/data/itemConstants';
let hydrated = false; let inFlight: Promise<void> | null = null;
function normalizeHeroes(heroes: unknown): { heroKeyById: Record<number, string>; heroNameByKey: Record<string, string> } {
  const heroKeyById: Record<number, string> = {}; const heroNameByKey: Record<string, string> = {};
  if (!heroes || typeof heroes !== 'object') return { heroKeyById, heroNameByKey };
  for (const [key, value] of Object.entries(heroes as Record<string, unknown>)) { if (!key || !value || typeof value !== 'object') continue; const raw=value as Record<string, unknown>; const id=typeof raw.id==='number'?raw.id:undefined; const localizedName=typeof raw.localized_name==='string'?raw.localized_name:undefined; if(!id||id<=0) continue; heroKeyById[id]=key; if(localizedName) heroNameByKey[key]=localizedName; }
  return { heroKeyById, heroNameByKey };
}
export async function ensureOpenDotaConstantsLoaded(): Promise<void> {
  if (hydrated) return; if (inFlight) return inFlight;
  inFlight = (async () => { const [items, itemIds, heroes] = await Promise.all([fetchOpenDotaConstants('items'), fetchOpenDotaConstants('item_ids'), fetchOpenDotaConstants('heroes')]); setItemConstants(normalizeItemConstants(items, itemIds)); setHeroConstants(normalizeHeroes(heroes)); hydrated = true; })().finally(() => { inFlight = null; });
  return inFlight;
}
