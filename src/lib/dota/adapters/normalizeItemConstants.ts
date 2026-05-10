import type { ItemConstant } from '@/lib/dota/data/itemConstants';
export function normalizeItemConstants(items: unknown, itemIds: unknown): { itemByKey: Record<string, ItemConstant>; itemKeyById: Record<number, string> } {
  const itemByKey: Record<string, ItemConstant> = {}; const itemKeyById: Record<number, string> = {};
  if (items && typeof items === 'object') for (const [key, value] of Object.entries(items as Record<string, unknown>)) { if (!key || !value || typeof value !== 'object') continue; const raw=value as Record<string, unknown>; itemByKey[key]={ dname: typeof raw.dname==='string'?raw.dname:undefined, img: typeof raw.img==='string'?raw.img:undefined, icon: typeof raw.icon==='string'?raw.icon:undefined }; }
  if (itemIds && typeof itemIds === 'object') for (const [id, key] of Object.entries(itemIds as Record<string, unknown>)) { const parsedId=Number(id); if (!Number.isFinite(parsedId) || parsedId <= 0 || typeof key !== 'string' || !key) continue; itemKeyById[parsedId]=key; }
  return { itemByKey, itemKeyById };
}
