import type { StratzHeroContext } from '@/lib/dota/types/providers';

export function normalizeStratzHeroContext(context: StratzHeroContext): StratzHeroContext {
  return {
    ...context,
    laneTips: context.laneTips.slice(0, 3),
    itemPriors: context.itemPriors.slice(0, 4)
  };
}
