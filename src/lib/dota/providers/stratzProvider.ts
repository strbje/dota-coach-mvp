import { runStratzQuery } from '@/lib/dota/clients/stratz';

const STRATZ_HERO_AVERAGE_QUERY = `query DebugStratzHeroAverage($id: Long!) {
  match(id: $id) {
    id
    players {
      steamAccountId
      heroId
      position
      role
      roleBasic
      heroAverage {
        heroId
        time
        position
        matchCount
        winCount
        kills
        deaths
        assists
        networth
        xp
        cs
        neutrals
        heroDamage
        towerDamage
        goldPerMinute
        teamKills
        goldLost
        goldFed
        buybackCount
      }
    }
  }
}`;

export async function fetchStratzHeroAverage(matchId: number): Promise<unknown> {
  const token = process.env.STRATZ_API_TOKEN;
  if (!token) throw new Error('STRATZ token missing');

  const result = await runStratzQuery({
    query: STRATZ_HERO_AVERAGE_QUERY,
    variables: { id: matchId },
    token
  });

  if (!result.ok || !result.json) {
    throw new Error(result.error ?? `STRATZ request failed with status ${result.status ?? 'unknown'}`);
  }

  return result.json;
}
