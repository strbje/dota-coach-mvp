export type PlayerSelector = {
  accountId?: number;
  playerSlot?: number;
  /** Debug/legacy fallback. Prefer accountId or playerSlot. */
  heroId?: number;
};

export class PlayerSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayerSelectionError';
  }
}

type PlayerIdentity = { accountId?: number; playerSlot?: number; heroId?: number };

export function validatePlayerSelector(selector: PlayerSelector): void {
  const entries = Object.entries(selector).filter(([, value]) => value !== undefined);
  if (!entries.length) throw new PlayerSelectionError('A player selector is required');
  if (entries.some(([, value]) => typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
    throw new PlayerSelectionError('Player selector values must be non-negative integers');
  }
}

export function selectPlayer<T>(
  players: T[],
  selector: PlayerSelector,
  identity: (player: T) => PlayerIdentity,
  provider: 'OpenDota' | 'STRATZ'
): T {
  validatePlayerSelector(selector);
  const matches = players.filter((player) => {
    const candidate = identity(player);
    return (selector.accountId === undefined || candidate.accountId === selector.accountId)
      && (selector.playerSlot === undefined || candidate.playerSlot === selector.playerSlot)
      && (selector.heroId === undefined || candidate.heroId === selector.heroId);
  });

  if (matches.length === 0) throw new PlayerSelectionError(`Selected player was not found in ${provider} payload`);
  if (matches.length > 1) throw new PlayerSelectionError(`Player selector is ambiguous in ${provider} payload`);
  return matches[0];
}
