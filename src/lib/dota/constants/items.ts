const TRACKED_ITEM_ALIASES: Record<string, string> = {
  basher: 'Skull Basher',
  assault: 'Assault Cuirass',
  heart: 'Heart of Tarrasque'
};

const ITEM_KEY_BY_ID: Record<number, string> = {
  50: 'phase_boots',
  108: 'desolator',
  112: 'basher',
  116: 'black_king_bar',
  135: 'armlet',
  147: 'sange_and_yasha',
  156: 'satanic',
  168: 'mjollnir',
  208: 'abyssal_blade',
  603: 'assault'
};

const DOTA_CONSTANTS_ITEMS_BY_KEY: Record<string, { dname?: string }> = Object.fromEntries(
  Object.values(ITEM_KEY_BY_ID).map((key) => [key, { dname: TRACKED_ITEM_ALIASES[key] ?? humanizeItemKey(key) }])
);

export function humanizeItemKey(key: string): string {
  if (!key) return 'Unknown Item';
  return key
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function getItemNameByKey(key: string): string {
  const normalizedKey = key?.trim();
  if (!normalizedKey) return 'Unknown Item';

  return DOTA_CONSTANTS_ITEMS_BY_KEY[normalizedKey]?.dname ?? TRACKED_ITEM_ALIASES[normalizedKey] ?? humanizeItemKey(normalizedKey);
}

export function getItemNameById(itemId: number): string | null {
  if (typeof itemId !== 'number' || !Number.isFinite(itemId) || itemId <= 0) return null;
  const key = ITEM_KEY_BY_ID[itemId];
  if (!key) return null;
  return getItemNameByKey(key);
}

export function formatGameTime(seconds: number): string {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return 'n/a';
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(seconds));
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${minutes}:${remainder.toString().padStart(2, '0')}`;
}
