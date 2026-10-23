/** Minimal anonymous excerpts from OpenDota, re-fetched 2026-10-23 (HTTP 200).
 * Provenance, independent semantics and limitations: docs/verification/gold-reasons.md.
 * Expected categories come from issue #34 + pinned primary sources, not the normalizer.
 */
export const GOLD_REASON_CONTROLS = [
  {
    matchId: 8781054570, heroId: 54, playerSlot: 0, lhAt10: 45, goldAt10: 3338, lastInterval: [35, 78],
    raw: { 0: 800, 1: -6325, 6: 2255, 11: 2965, 12: 16660, 13: 14624, 14: 14350, 15: 1033, 16: 305, 17: 1758, 21: 155 },
    expected: { heroes: 16660, creeps: 14624, neutral: 14350, buildings: 2965, roshan: 1033, courier: 305, bounty: 1758, death: -6325, sale: 2255, courierBonus: 155 }
  },
  {
    matchId: 9019592113, heroId: 42, playerSlot: 129, lhAt10: 51, goldAt10: 3492, lastInterval: [35, 37],
    raw: { 0: 600, 1: -2102, 11: 587, 12: 4981, 13: 5589, 14: 5221, 15: 587, 16: 105, 17: 652 },
    expected: { heroes: 4981, creeps: 5589, neutral: 5221, buildings: 587, roshan: 587, courier: 105, bounty: 652, death: -2102 }
  },
  {
    matchId: 9003795847, heroId: 42, playerSlot: 1, lhAt10: 52, goldAt10: 4042, lastInterval: [20, 29],
    raw: { 0: 680, 1: -522, 11: 2691, 12: 3302, 13: 7957, 14: 2851, 15: 310, 16: 30, 17: 370 },
    expected: { heroes: 3302, creeps: 7957, neutral: 2851, buildings: 2691, roshan: 310, courier: 30, bounty: 370, death: -522 }
  }
];
