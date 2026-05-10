export { getItemIconUrlByKey, getItemKeyById, getItemNameById, getItemNameByKey, humanizeItemKey } from '@/lib/dota/data/itemConstants';

export function formatGameTime(seconds: number): string {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return 'n/a';
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(seconds));
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${minutes}:${remainder.toString().padStart(2, '0')}`;
}
