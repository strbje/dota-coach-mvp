import type { PreGameAnalysis, PreGameDraftInput } from './domain';

export type PreGameAnalyzeRequest = PreGameDraftInput;
export type PreGameAnalyzeResponse = PreGameAnalysis;

export type PostMatchAnalyzeRequest = {
  matchId: number;
  hero?: string;
};
