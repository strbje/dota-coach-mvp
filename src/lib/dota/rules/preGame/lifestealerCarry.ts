import type { PreGameAnalysis, PreGameDraftInput } from '@/lib/dota/types/domain';

const RULED_LANE = {
  ally: ['Lifestealer', 'Lion'],
  enemy: ['Legion Commander', 'Tusk']
};

export function runLifestealerCarryPreGameRules(input: PreGameDraftInput): PreGameAnalysis {
  const isTargetLane =
    RULED_LANE.ally.every((h) => input.lanes.safe.ally.includes(h)) &&
    RULED_LANE.enemy.every((h) => input.lanes.safe.enemy.includes(h));

  if (isTargetLane) {
    return {
      hero: 'Lifestealer',
      role: 'carry',
      lane: {
        difficulty: 'hard',
        reasons: [
          'enemy short-trade pressure is high',
          'lane punishes melee positioning mistakes',
          'sustained fair trading is not favorable early'
        ]
      },
      threats: ['short_trade_burst', 'chain_control_after_rage', 'snowball_lane_pressure'],
      startingItems: [
        { name: 'Quelling Blade', reason: 'secure last hits' },
        { name: 'Tango', reason: 'lane sustain' },
        { name: 'Magic Stick', reason: 'spell value on lane' }
      ],
      buildBranches: [
        {
          tag: 'tempo',
          title: 'Tempo punish',
          items: ['Phase Boots', 'Armlet', 'Desolator', 'Basher'],
          when: 'when lane is stable and your team can convert fights into objectives'
        },
        {
          tag: 'stable_contact',
          title: 'Stable contact',
          items: ['Phase Boots', 'Armlet', 'Sange and Yasha', 'Basher'],
          when: 'when you need safer midgame contact and better stickiness'
        }
      ],
      stagePlan: [
        {
          stage: '0-7',
          goals: [
            'prioritize creeps and HP over long melee trades',
            'use Rage for guaranteed survival or secure farm windows'
          ]
        }
      ],
      targetPriority: {
        primary: ['isolated support targets', 'damaged backline heroes'],
        avoidOpeningOn: ['healthy frontliner without support follow-up'],
        notes: ['do not commit Rage too early before the enemy truly commits']
      },
      mapPlan: {
        early: ['farm safest lane-to-jungle pattern available'],
        mid: ['join fights only when there is an objective to convert'],
        late: ['take fights around vision and objective control, not empty map areas']
      },
      mistakesToAvoid: [
        'using Rage too early',
        'taking long lane trades for low-value creeps',
        'joining random fights with no objective nearby'
      ],
      meta: {
        source: ['rules', 'stratz'],
        confidence: 0.72
      }
    };
  }

  return {
    hero: 'Lifestealer',
    role: 'carry',
    lane: {
      difficulty: 'medium',
      reasons: ['lane pattern not in hardcoded matchup set; using safe baseline plan']
    },
    threats: ['chain_control_after_rage'],
    startingItems: [
      { name: 'Quelling Blade', reason: 'stable CS foundation' },
      { name: 'Tango', reason: 'baseline sustain' },
      { name: 'Magic Stick', reason: 'frequent lane spell value' }
    ],
    buildBranches: [
      {
        tag: 'stable_contact',
        title: 'Stable contact',
        items: ['Phase Boots', 'Armlet', 'Sange and Yasha', 'Basher'],
        when: 'default safe branch for uncertain lane pressure'
      }
    ],
    stagePlan: [
      { stage: '0-7', goals: ['secure last hits and avoid low-value brawls'] }
    ],
    targetPriority: {
      primary: ['exposed supports'],
      avoidOpeningOn: ['unbroken frontliner with backup'],
      notes: ['commit Rage reactively to real threat windows']
    },
    mapPlan: {
      early: ['repeat safe farm loops'],
      mid: ['join only objective-convertible fights'],
      late: ['avoid vision-dark map fights']
    },
    mistakesToAvoid: ['random map movements with no objective'],
    meta: {
      source: ['rules'],
      confidence: 0.61
    }
  };
}
