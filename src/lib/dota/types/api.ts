import type { PreGameAnalysis, PreGameDraftInput } from './domain';
import type { PlayerSelector } from '../selection/playerSelector';
import type { MatchPlayerOption } from '../selection/matchPlayers';

export type PreGameAnalyzeRequest = PreGameDraftInput;
export type PreGameAnalyzeResponse = PreGameAnalysis;

export type PostMatchAnalyzeRequest = {
  matchId: number;
  selector?: PlayerSelector;
  /** @deprecated Legacy Lifestealer flow. Use selector instead. */
  hero?: string;
};

export type PostMatchPlayersResponse = {
  matchId: number;
  players: MatchPlayerOption[];
};
