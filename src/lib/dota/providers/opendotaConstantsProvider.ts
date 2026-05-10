import { normalizeItemConstants } from '@/lib/dota/adapters/normalizeItemConstants';
import { fetchOpenDotaConstants } from '@/lib/dota/clients/opendota';
import { setHeroConstants } from '@/lib/dota/data/heroConstants';
import { setItemConstants } from '@/lib/dota/data/itemConstants';

let hydrated = false; let inFlight: Promise<void> | null = null;

export type GoldReasonGroup = 'creeps' | 'heroes' | 'buildings' | 'roshan' | 'courier' | 'neutral' | 'starting' | 'purchase' | 'other' | 'unknown';
export type GoldReasonConstant = { id: number; key: string; label: string; group: GoldReasonGroup };

const GOLD_REASON_FALLBACK: Record<string, GoldReasonConstant> = {
  '1': { id: 1, key: 'unreliable', label: 'Unreliable Gold', group: 'other' },
  '11': { id: 11, key: 'hero_kill', label: 'Hero Kill', group: 'heroes' },
  '12': { id: 12, key: 'creep_kill', label: 'Creep Kill', group: 'creeps' },
  '13': { id: 13, key: 'neutral_kill', label: 'Neutral Kill', group: 'neutral' },
  '14': { id: 14, key: 'roshan_kill', label: 'Roshan Kill', group: 'roshan' },
  '15': { id: 15, key: 'courier_kill', label: 'Courier Kill', group: 'courier' },
  '16': { id: 16, key: 'tower_kill', label: 'Tower Kill', group: 'buildings' },
  '17': { id: 17, key: 'building_kill', label: 'Building Kill', group: 'buildings' },
  '19': { id: 19, key: 'buyback', label: 'Buyback', group: 'purchase' },
  '20': { id: 20, key: 'abandon', label: 'Abandon', group: 'other' }
};

function groupGoldReason(label: string, key: string): GoldReasonGroup {
  const hay = `${label} ${key}`.toLowerCase();
  if (hay.includes('hero')) return 'heroes';
  if (hay.includes('neutral') || hay.includes('jungle')) return 'neutral';
  if (hay.includes('creep') || hay.includes('lane')) return 'creeps';
  if (hay.includes('roshan')) return 'roshan';
  if (hay.includes('courier')) return 'courier';
  if (hay.includes('tower') || hay.includes('building') || hay.includes('rax') || hay.includes('barrack')) return 'buildings';
  if (hay.includes('starting') || hay.includes('pre') || hay.includes('initial')) return 'starting';
  if (hay.includes('buyback') || hay.includes('purchase') || hay.includes('loss') || hay.includes('abandon') || hay.includes('death')) return 'purchase';
  if (hay.includes('gold') || hay.includes('bounty') || hay.includes('assist')) return 'other';
  return 'unknown';
}

function normalizeGoldReasonConstants(payload: unknown): Record<string, GoldReasonConstant> {
  const result: Record<string, GoldReasonConstant> = { ...GOLD_REASON_FALLBACK };
  if (!payload || typeof payload !== 'object') return result;

  for (const [idKey, value] of Object.entries(payload as Record<string, unknown>)) {
    const parsedId = Number(idKey);
    if (!Number.isFinite(parsedId)) continue;
    if (typeof value === 'string') {
      const clean = value.trim();
      result[idKey] = { id: parsedId, key: clean.toLowerCase().replace(/\s+/g, '_'), label: clean, group: groupGoldReason(clean, clean) };
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const key = (typeof raw.key === 'string' && raw.key.trim()) || (typeof raw.name === 'string' && raw.name.trim()) || `reason_${idKey}`;
    const label = (typeof raw.label === 'string' && raw.label.trim())
      || (typeof raw.localized_name === 'string' && raw.localized_name.trim())
      || (typeof raw.name === 'string' && raw.name.trim())
      || key;
    result[idKey] = { id: parsedId, key, label, group: groupGoldReason(label, key) };
  }
  return result;
}

export async function getGoldReasonConstants(): Promise<Record<string, GoldReasonConstant>> {
  const constants = await fetchOpenDotaConstants('gold_reasons');
  return normalizeGoldReasonConstants(constants);
}
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
