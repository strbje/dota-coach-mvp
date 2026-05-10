import { formatGameTime } from '@/lib/dota/constants/items';

export type ItemBenchmarkSource =
  | 'manual_mvp_threshold'
  | 'opendota_scenarios'
  | 'opendota_item_popularity'
  | 'unavailable';

export type ItemBenchmark = {
  hero: 'Lifestealer';
  role: 'carry';
  itemKey: string;
  targetTimeSeconds: number;
  label: string;
  source: ItemBenchmarkSource;
};

const MANUAL_MVP_THRESHOLDS: Record<string, number> = {
  phase_boots: 8 * 60,
  armlet: 15 * 60,
  desolator: 22 * 60,
  black_king_bar: 25 * 60,
  sange_and_yasha: 25 * 60,
  basher: 32 * 60,
  assault: 40 * 60,
  abyssal_blade: 42 * 60
};

export const LIFESTEALER_CARRY_CORE_ITEMS = [
  'phase_boots',
  'armlet',
  'desolator',
  'sange_and_yasha',
  'black_king_bar',
  'basher',
  'abyssal_blade',
  'assault',
  'satanic',
  'mjollnir',
  'monkey_king_bar',
  'butterfly',
  'heart'
] as const;

export const LIFESTEALER_CARRY_SUSPICIOUS_ITEMS = [
  'dagon',
  'ethereal_blade',
  'meteor_hammer',
  'phylactery',
  'octarine_core',
  'aether_lens',
  'veil_of_discord'
] as const;

export function getLifestealerCarryItemBenchmark(itemKey: string): ItemBenchmark | null {
  const targetTimeSeconds = MANUAL_MVP_THRESHOLDS[itemKey];
  if (!targetTimeSeconds) return null;

  return {
    hero: 'Lifestealer',
    role: 'carry',
    itemKey,
    targetTimeSeconds,
    label: `MVP-ориентир ${formatGameTime(targetTimeSeconds)}`,
    source: 'manual_mvp_threshold'
  };
}

export function compareItemTiming(actualSeconds?: number, benchmarkSeconds?: number): 'early' | 'onTime' | 'late' | 'unknown' {
  if (typeof actualSeconds !== 'number' || typeof benchmarkSeconds !== 'number') return 'unknown';
  if (actualSeconds <= benchmarkSeconds - 60) return 'early';
  if (actualSeconds <= benchmarkSeconds + 90) return 'onTime';
  return 'late';
}
