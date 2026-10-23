export type Basis = 'match' | 'now';
export type WindowDays = 7 | 30;
export type Filters = { rankedOnly: boolean; excludeTurbo: boolean };
export type Query = Filters & { mode: 'match' | 'series'; id: number; days: 7 | 10 | 30; basis: Basis };
export type Failure = 'unavailable' | 'provider_error' | 'rate_limit' | 'timeout';
export type HistoryStop = 'boundary' | 'exhausted' | 'cap' | Failure;
export type HistoryRow = { matchId: number; startTime: number; duration: number; win: boolean; playerSlot: number };
export type History = {
  rows: HistoryRow[]; stop: HistoryStop; scanned: number; invalid: number;
  oldest: number | null; ordered: boolean; fetchedAt: number; expiresAt: number;
};
export type Sample = {
  days: WindowDays; from: number; to: number; wins: number; games: number; rate: number | null;
  first: number | null; last: number | null; complete: boolean; limitedBy: string | null;
};
export type ParticipantResult = {
  accountId: number; matchId: number; basis: Basis; asOf: number; capturedAt: number;
  status: 'ready' | 'empty' | 'private' | Failure; name?: string;
  samples: Record<WindowDays, Sample>; history: Omit<History, 'rows'>;
  fetchedAt: number; expiresAt: number; retryAfter?: number;
};
export type RosterPlayer = {
  slot: number; heroName: string; heroId?: number; heroKey?: string; name?: string; accountId?: number;
  missing?: 'anonymous' | 'roster_missing' | 'ambiguous';
};
export type TargetMatch = { matchId: number; startTime: number; duration: number; players: RosterPlayer[]; selectedSlot?: number };
export type MatchEntry = { matchId: number; match?: TargetMatch; error?: Failure };
export type Plan = {
  query: Query; capturedAt: number; matches: MatchEntry[];
  series?: { found: number; shown: number; remainingIds: number[]; history: Omit<History, 'rows'>; status: ParticipantResult['status'] };
};
export type Side = 'with' | 'against';
export type Encounter = { key: string; matchId: number; startTime: number; player: RosterPlayer; side: Side };
// Client state keeps refresh failures separate from the retained source observations.
export type ParticipantState = ParticipantResult & { refreshError?: Failure };
export type Results = Record<string, ParticipantState>;
export type Sort = 'side' | 'rate_desc' | 'rate_asc' | 'name';
