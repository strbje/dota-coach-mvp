export type OpenDotaMatchResponse = {
  match_id: number;
  radiant_win: boolean;
  duration: number;
  radiant_score?: number;
  dire_score?: number;
  start_time?: number;
  game_mode?: number;
  lobby_type?: number;
  radiant_gold_adv?: unknown;
  radiant_xp_adv?: unknown;
  objectives?: unknown;
  teamfights?: unknown;
  players?: Array<Record<string, unknown>>;
};

export type StratzHeroContext = {
  hero: string;
  role: string;
  laneTips: string[];
  itemPriors: string[];
  source: 'stratz' | 'fallback';
};
