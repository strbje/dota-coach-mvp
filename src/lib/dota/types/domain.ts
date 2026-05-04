export type HeroName = 'Lifestealer';
export type RoleName = 'carry';

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
    itemTimings?: Array<{ item: string; time: string; source: 'purchase_log' | 'unavailable' }>;
    buildPlayed?: string[];
  };
};

export type PostMatchAnalysis = {
  matchId: number;
  hero: HeroName;
  role: RoleName;
  result: 'win' | 'loss';
  buildPlayed: string[];
  timings: Record<string, string>;
  grades: {
    lane: { score: number; findings: AnalysisFinding[] };
    items: { score: number; findings: AnalysisFinding[] };
    fights: { score: number; findings: AnalysisFinding[] };
    map: { score: number; findings: AnalysisFinding[] };
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
