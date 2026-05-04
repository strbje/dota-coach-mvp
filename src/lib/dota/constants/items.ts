export const LIFESTEALER_MVP_ITEM_NAMES: Record<number, string> = {
  50: 'Phase Boots',
  108: 'Desolator',
  116: 'Black King Bar',
  112: 'Skull Basher',
  156: 'Armlet',
  154: 'Sange and Yasha'
};

export function getLifestealerMvpItemName(itemId?: number): string | null {
  if (typeof itemId !== 'number' || itemId <= 0) return null;
  return LIFESTEALER_MVP_ITEM_NAMES[itemId] ?? `Unknown item #${itemId}`;
}
