export type GoldReasonGroup = 'creeps' | 'heroes' | 'buildings' | 'roshan' | 'courier' | 'neutral' | 'starting' | 'purchase' | 'other' | 'unknown';
type GoldReasonConstant = { label: string; group: GoldReasonGroup };

export const GOLD_REASON_GROUP_LABELS: Record<GoldReasonGroup, string> = {
  creeps: 'Лейн-крипы',
  neutral: 'Нейтралы',
  heroes: 'Герои',
  buildings: 'Строения',
  roshan: 'Roshan',
  courier: 'Курьеры',
  starting: 'Стартовое золото',
  purchase: 'Покупки и потери',
  other: 'Другие источники',
  unknown: 'Другое / нераспознано'
};

export type NormalizedGoldReasons = ReturnType<typeof normalizeGoldReasons>;

/** One normalization boundary shared by the product model and debug API. */
export function normalizeGoldReasons(
  raw: Record<string, unknown>,
  constants: Record<string, GoldReasonConstant>
) {
  const decoded = Object.entries(raw)
    .flatMap(([key, value]) => {
      const amount = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      if (amount === undefined || amount === 0) return [];
      const constant = constants[key];
      const productKnown = Boolean(constant && constant.group !== 'unknown');
      return [{
        key,
        amount,
        label: constant?.label ?? 'Unknown reason',
        group: constant?.group ?? 'unknown' as GoldReasonGroup,
        known: productKnown
      }];
    });

  const amountsByGroup = decoded.reduce<Record<GoldReasonGroup, number>>((acc, entry) => {
    acc[entry.group] += entry.amount;
    return acc;
  }, { creeps: 0, neutral: 0, heroes: 0, buildings: 0, roshan: 0, courier: 0, starting: 0, purchase: 0, other: 0, unknown: 0 });
  const grouped = (Object.entries(amountsByGroup) as Array<[GoldReasonGroup, number]>)
    .filter(([, amount]) => amount !== 0)
    .map(([group, amount]) => ({ group, label: GOLD_REASON_GROUP_LABELS[group], amount }));
  const unknownKeys = decoded.filter((entry) => !entry.known).map((entry) => entry.key);
  const unknownAmount = amountsByGroup.unknown;
  const constantsAvailable = decoded.some((entry) => entry.known);

  return {
    constantsAvailable,
    breakdownComplete: constantsAvailable && unknownKeys.length === 0,
    totalPositiveGold: decoded.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
    totalNegativeGold: decoded.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
    groups: grouped.filter((entry) => entry.group !== 'unknown'),
    unknownAmount,
    unknownKeys,
    decoded,
    grouped
  };
}
