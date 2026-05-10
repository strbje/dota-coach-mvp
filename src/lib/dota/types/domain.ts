export type HeroName = 'Lifestealer';
export type RoleName = 'carry';
export type MatchPhase = 'laning' | 'earlyMid' | 'midGame' | 'lateGame';

export type PreGameDraftInput = {
  hero: string;
  role: string;
  allies: string[];
  enemies: string[];
  lanes: {
    safe: {
      ally: string[];
      enemy: string[];
    };
  };
};

export type AnalysisFinding = {
  text: string;
  evidence: string[];
  severity: 'good' | 'warning' | 'bad' | 'info';
};

export type PreGameAnalysis = {
  hero: HeroName;
  role: RoleName;
  lane: {
    difficulty: 'easy' | 'medium' | 'hard';
    reasons: string[];
  };
  threats: string[];
  startingItems: Array<{ name: string; reason: string }>;
  buildBranches: Array<{ tag: string; title: string; items: string[]; when: string }>;
  stagePlan: Array<{ stage: string; goals: string[] }>;
  targetPriority: {
    primary: string[];
    avoidOpeningOn: string[];
    notes: string[];
  };
  mapPlan: { early: string[]; mid: string[]; late: string[] };
  mistakesToAvoid: string[];
  meta: { source: string[]; confidence: number };
};

export type NormalizedOpenDotaMatch = {
  matchId: number;
  didRadiantWin: boolean;
  durationSeconds: number;
  player?: {
    heroName?: string;
    isRadiant?: boolean;
    durationMinutes?: number;
    kills?: number;
    deaths?: number;
    assists?: number;
    lastHits?: number;
    lastHitsPerMin?: number;
    heroDamage?: number;
    heroDamagePerMin?: number;
    gpm?: number;
    xpm?: number;
    killParticipation?: number;
    item0?: number;
    item1?: number;
    item2?: number;
    item3?: number;
    item4?: number;
    item5?: number;
    itemTimings?: Array<{ key: string; item: string; time: string; timeSeconds: number; iconUrl?: string; source: 'purchase_log' }>;
    itemTimingSource?: 'purchase_log' | 'unavailable';
    rawPurchaseLogPreview?: Array<{ key: string; time: number }>;
    rawItemIds?: number[];
    unknownItemIds?: number[];
    buildPlayed?: string[];
    deathTimings?: Array<{
      timeSeconds: number;
      time: string;
      phase: MatchPhase;
      phaseLabel: string;
    }>;
    deathsByPhase?: {
      laning: number;
      earlyMid: number;
      midGame: number;
      lateGame: number;
    };
    deathDataSource?: 'death_log' | 'deaths_log' | 'unavailable';
    fightParticipationByPhaseSource?: 'teamfights' | 'kills_log' | 'unavailable';
    fightParticipationByPhase?: Record<MatchPhase, {
      playerKillsPlusAssists: number;
      teamKills: number;
      participation: number;
    }>;
    deathsAfterItemTimings?: Array<{
      itemKey: string;
      item: string;
      itemTime: string;
      deathsWithin5Min: number;
      deathsWithin10Min: number;
    }>;
    objectiveEvents?: Array<{
      timeSeconds: number;
      time: string;
      type: string;
      phase: MatchPhase;
      isPlayerTeam?: boolean;
    }>;
    itemObjectiveWindows?: Array<{
      itemKey: string;
      item: string;
      itemTime: string;
      objectivesWithin10Min: number;
      objectiveTypes: string[];
      attributedToPlayerTeam?: boolean;
    }>;
    laneReview?: {
      lane?: number;
      laneRole?: number;
      laneEfficiency?: number;
      laneEfficiencyPct?: number;
      lhAt10?: number;
      goldAt10?: number;
      deathsBefore10?: number;
      source: 'opendota' | 'partial' | 'unavailable';
    };
    economyByPhaseSource?: 'gold_t/lh_t' | 'unavailable';
    economyByPhase?: Record<'laning' | 'earlyMid' | 'midGame' | 'lateGame', {
      startMinute: number; endMinute: number; durationMinutes: number;
      goldStart?: number; goldEnd?: number; goldDelta?: number; goldPerMinuteInPhase?: number;
      lhStart?: number; lhEnd?: number; lhDelta?: number; lhPerMinuteInPhase?: number;
      xpStart?: number; xpEnd?: number; xpDelta?: number; xpPerMinuteInPhase?: number;
      deaths?: number;
    }>;
    farmProfile?: {
      laneKills?: number; neutralKills?: number; ancientKills?: number; heroKills?: number; roshanKills?: number; towerKills?: number;
    };
  };
};


export type StratzPostMatchData = {
  deathTimings?: Array<{
    timeSeconds: number;
    time: string;
    phase: MatchPhase;
    source: 'stratz_stats';
  }>;
  deathsByPhase?: {
    laning: number;
    earlyMid: number;
    midGame: number;
    lateGame: number;
  };
  selectedPlayer?: {
    heroId?: number;
    role?: string;
    lane?: string;
    position?: string;
    imp?: number | null;
  };
};

export type PostMatchAnalysis = {
  matchId: number;
  hero: HeroName;
  role: RoleName;
  result: 'win' | 'loss';
  buildPlayed: string[];
  timings: Record<string, string>;
  itemTimings: Array<{ key: string; item: string; time: string; timeSeconds: number; iconUrl?: string; source: 'purchase_log' }>;
  economyByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['economyByPhase'];
  deathsByPhase?: NonNullable<NormalizedOpenDotaMatch['player']>['deathsByPhase'];
  farmProfile?: NonNullable<NormalizedOpenDotaMatch['player']>['farmProfile'];
  stratz?: StratzPostMatchData;
  grades: {
    lane: { score: number; summary?: string; findings: AnalysisFinding[] };
    items: { score: number; summary?: string; findings: AnalysisFinding[] };
    fights: { score: number; summary?: string; findings: AnalysisFinding[] };
    map: { score: number; summary?: string; findings: AnalysisFinding[] };
  };
  topMistakes: string[];
  nextGameAdjustments: string[];
  finalVerdict: {
    mainReason: string;
    biggestRisk: string;
    nextMatchFocus: string;
  };
  meta: { source: string[]; confidence: number };
};

export type StratzCombatEvent = {
  timeSeconds?: number;
  time?: string;
  raw?: Record<string, unknown>;
};

export type StratzPositionSample = {
  timeSeconds?: number;
  time?: string;
  x?: number;
  y?: number;
  source: 'stratz_playback';
};

export type StratzDeathPositionSample = {
  deathTimeSeconds: number;
  deathTime: string;
  x?: number;
  y?: number;
  source: 'stratz_playback';
  productReady: false;
};

export type StratzFarmDistribution = {
  laneFarm?: number;
  neutralFarm?: number;
  ancientFarm?: number;
  heroFarm?: number;
  objectiveFarm?: number;
  unknown?: number;
  rawPreview?: Record<string, unknown>;
};

export type StratzHeroAverageBenchmark = {
  time: number;
  matchCount: number;
  winCount: number;
  cs?: number;
  networth?: number;
  goldPerMinute?: number;
  heroDamage?: number;
  deaths?: number;
  kills?: number;
  assists?: number;
};

export type NormalizedStratzPlayer = {
  steamAccountId?: number;
  heroId?: number;
  isRadiant?: boolean;
  isVictory?: boolean;
  lane?: string;
  position?: string;
  role?: string;
  roleBasic?: string;
  imp?: number | null;
  award?: string | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  gpm?: number;
  xpm?: number;
  networth?: number;
  level?: number;
  lastHits?: number;
  denies?: number;
  heroDamage?: number;
  towerDamage?: number;
  itemIds?: number[];
  backpackItemIds?: number[];
  neutralItemId?: number | null;
  killEvents?: StratzCombatEvent[];
  deathEvents?: StratzCombatEvent[];
  assistEvents?: StratzCombatEvent[];
  positionSamples?: StratzPositionSample[];
  deathPositionSamples?: StratzDeathPositionSample[];
  farmDistribution?: StratzFarmDistribution | null;
  heroAverageBenchmarks?: StratzHeroAverageBenchmark[];
};

export type NormalizedStratzMatch = {
  matchId: number;
  durationSeconds?: number;
  didRadiantWin?: boolean;
  averageImp?: number | null;
  selectedPlayer?: NormalizedStratzPlayer;
  dataAvailability: {
    playerSummary: boolean;
    eventStats: boolean;
    playback: boolean;
    heroAverage: boolean;
    deathEvents: boolean;
    positionEvents: boolean;
    farmDistribution: boolean;
  };
};
