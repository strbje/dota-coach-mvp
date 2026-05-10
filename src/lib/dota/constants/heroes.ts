import { getHeroNameById } from '@/lib/dota/data/heroConstants';

export const HEROES = ['Lifestealer'] as const;
export const HERO_NAME_TO_OPENDOTA_ID: Record<string, number> = {
  Lifestealer: 54
};

export { getHeroKeyById, getHeroNameById } from '@/lib/dota/data/heroConstants';

export function resolveHeroNameById(heroId: number): string {
  return getHeroNameById(heroId) ?? `Hero #${heroId}`;
}
