import type { NormalizedOpenDotaMatch, PostMatchAnalysis } from '@/lib/dota/types/domain';

function score(base: number, delta: number): number {
  return Math.max(1, Math.min(99, base + delta));
}

export function runLifestealerCarryPostMatchRules(match: NormalizedOpenDotaMatch): PostMatchAnalysis {
  const p = match.player;
  const result: 'win' | 'loss' = p && p.isRadiant === match.didRadiantWin ? 'win' : 'loss';
  const kda = p ? (p.kills ?? 0) + (p.assists ?? 0) - (p.deaths ?? 0) : 0;

  const laneScore = score(62, (p?.lastHits ?? 0) > 180 ? 7 : -2);
  const itemScore = score(68, (p?.gpm ?? 0) > 550 ? 6 : -3);
  const fightScore = score(58, kda > 10 ? 8 : -2);
  const mapScore = score(60, (p?.xpm ?? 0) > 600 ? 5 : -1);

  return {
    matchId: match.matchId,
    hero: 'Lifestealer',
    role: 'carry',
    result,
    buildPlayed: ['Phase Boots', 'Armlet', 'Desolator', 'Basher', 'Sange and Yasha'],
    timings: {
      'Phase Boots': p?.itemTimings?.[0]?.time ?? '09:10',
      Armlet: p?.itemTimings?.[1]?.time ?? '14:35',
      Desolator: '21:40',
      Basher: '29:15'
    },
    grades: {
      lane: {
        score: laneScore,
        findings: ['lane was high pressure', 'farming stability mattered more than trade volume']
      },
      items: {
        score: itemScore,
        findings: ['Armlet is a natural core timing', 'Desolator is correct only if pressure converts fast']
      },
      fights: {
        score: fightScore,
        findings: ['early commitment windows looked fragile', 'frontline-first fights reduced impact']
      },
      map: {
        score: mapScore,
        findings: ['safe farm pattern needed stronger discipline', 'some moves likely lacked objective value']
      }
    },
    topMistakes: [
      'joining fights before stable contact timing',
      'not converting tempo itemization into objective pressure',
      'spending key defensive window too early'
    ],
    nextGameAdjustments: [
      'delay full commitment until enemy initiation is clearer',
      'choose stable-contact branch if quick tempo conversion is unlikely',
      'play closer to objective-side farm patterns after first core item'
    ],
    meta: {
      source: ['opendota', 'rules', 'stratz'],
      confidence: 0.67
    }
  };
}
