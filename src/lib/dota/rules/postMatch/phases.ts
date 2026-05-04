export type MatchPhase = 'laning' | 'earlyMid' | 'midGame' | 'lateGame';

const PHASE_LABELS: Record<MatchPhase, string> = {
  laning: 'Лайнинг',
  earlyMid: 'Ранняя середина',
  midGame: 'Мидгейм',
  lateGame: 'Лейт'
};

export function getMatchPhase(timeSeconds: number): MatchPhase {
  if (timeSeconds < 600) return 'laning';
  if (timeSeconds < 1200) return 'earlyMid';
  if (timeSeconds < 2100) return 'midGame';
  return 'lateGame';
}

export function getPhaseLabel(phase: MatchPhase): string {
  return PHASE_LABELS[phase];
}
