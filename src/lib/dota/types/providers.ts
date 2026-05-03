export type OpenDotaMatchResponse = {
  match_id: number;
  radiant_win: boolean;
  duration: number;
  players?: Array<Record<string, unknown>>;
};

export type StratzHeroContext = {
  hero: string;
  role: string;
  laneTips: string[];
  itemPriors: string[];
  source: 'stratz' | 'fallback';
};
