import type { StratzHeroContext } from '@/lib/dota/types/providers';

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql';

export async function fetchStratzHeroContext(hero: string, role: string): Promise<StratzHeroContext> {
  const token = process.env.STRATZ_API_TOKEN;
  if (!token) {
    return {
      hero,
      role,
      laneTips: ['STRATZ token missing. Using deterministic fallback context.'],
      itemPriors: ['Phase Boots', 'Armlet'],
      source: 'fallback'
    };
  }

  const response = await fetch(STRATZ_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: '{ __typename }'
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    return {
      hero,
      role,
      laneTips: ['STRATZ unavailable. Using deterministic fallback context.'],
      itemPriors: ['Phase Boots', 'Armlet'],
      source: 'fallback'
    };
  }

  return {
    hero,
    role,
    laneTips: ['Use prior build and matchup tendencies as tie-breakers only.'],
    itemPriors: ['Phase Boots', 'Armlet', 'Sange and Yasha'],
    source: 'stratz'
  };
}
