import type { CarryHeroOverride } from '../roleRules/carryRules';

const MANUAL_TIMING_TARGETS: Record<string, number> = {
  phase_boots: 8 * 60,
  armlet: 15 * 60,
  desolator: 22 * 60,
  black_king_bar: 25 * 60,
  sange_and_yasha: 25 * 60,
  basher: 32 * 60,
  assault: 40 * 60,
  abyssal_blade: 42 * 60
};

const CORE_ITEMS = [
  'phase_boots', 'armlet', 'desolator', 'sange_and_yasha', 'black_king_bar',
  'basher', 'abyssal_blade', 'assault', 'satanic', 'mjollnir',
  'monkey_king_bar', 'butterfly', 'heart'
] as const;

const SUSPICIOUS_ITEMS = [
  'dagon', 'ethereal_blade', 'meteor_hammer', 'phylactery',
  'octarine_core', 'aether_lens', 'veil_of_discord'
] as const;

/** Lifestealer-only item and timing interpretation layered on the carry rules. */
export const lifestealerCarryOverride: CarryHeroOverride = {
  key: 'lifestealer',
  heroId: 54,
  heroName: 'Lifestealer',
  position: 'POSITION_1',
  earlyItemKey: 'phase_boots',
  timingItemKey: 'armlet',
  getFallbackItemTarget: (key) => MANUAL_TIMING_TARGETS[key],
  coreItems: CORE_ITEMS,
  suspiciousItems: SUSPICIOUS_ITEMS,
  timingItemLateFinding: (time) => `Armlet — ${time}: тайминг запоздал, проверь фарм и смерти до первого ключевого предмета.`,
  timingItemOnTimeFinding: (time) => `Armlet — ${time}: ключевой предмет куплен вовремя.`,
  suspiciousItemFinding: (labels) => `${labels} в билде — подозрительный слот для Lifestealer carry: предмет хуже усиливает урон с руки, выживаемость и драки в мидгейме.`,
  postTimingAdjustment: 'После Armlet не заходи первым в тёмные зоны: играй вторым номером после раскрытия контроля врага.'
};
