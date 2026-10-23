export type GoldReasonGroup = 'creeps' | 'heroes' | 'buildings' | 'roshan' | 'courier' | 'neutral' | 'death' | 'buyback' | 'sale' | 'bounty' | 'ability' | 'wards' | 'courierBonus' | 'unknown';
type GoldReasonConstant = { label: string; group: GoldReasonGroup };

export const GOLD_REASON_GROUP_LABELS: Record<GoldReasonGroup, string> = {
  creeps: 'Крипы',
  neutral: 'Нейтралы',
  heroes: 'Герои',
  buildings: 'Строения',
  roshan: 'Рошан',
  courier: 'Курьеры',
  death: 'Потери при смерти',
  buyback: 'Выкуп',
  sale: 'Продажа предметов',
  bounty: 'Руны богатства',
  ability: 'Способности',
  wards: 'Варды',
  courierBonus: 'Личная награда за курьера',
  unknown: 'Источник не определён'
};

export type NormalizedGoldReasons = ReturnType<typeof normalizeGoldReasons>;

/** One normalization boundary shared by the product model and debug API. */
export function normalizeGoldReasons(
  raw: Record<string, unknown>,
  constants: Record<string, GoldReasonConstant>
) {
  const invalidKeys: string[] = [];
  const decoded = Object.entries(raw).flatMap(([key, value]) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      invalidKeys.push(key);
      return [];
    }
    const constant = constants[key];
    return [{
      key,
      amount: value,
      label: constant?.label ?? 'Unknown reason',
      group: constant?.group ?? 'unknown' as GoldReasonGroup,
      known: Boolean(constant && constant.group !== 'unknown')
    }];
  });

  // Keep each sign separately, including for unknown reasons. Opposing amounts
  // must not disappear through netting; a confirmed zero is still an observation.
  const grouped: Array<{ group: GoldReasonGroup; label: string; amount: number }> = [];
  for (const group of Object.keys(GOLD_REASON_GROUP_LABELS) as GoldReasonGroup[]) {
    for (const sign of [1, -1, 0]) {
      const entries = decoded.filter((entry) => entry.group === group && Math.sign(entry.amount) === sign);
      if (!entries.length) continue;
      grouped.push({
        group,
        label: group === 'unknown' && sign < 0 ? 'Причина потерь не определена' : GOLD_REASON_GROUP_LABELS[group],
        amount: entries.reduce((sum, entry) => sum + entry.amount, 0)
      });
    }
  }
  const unknownEntries = decoded.filter((entry) => !entry.known);
  const unknownKeys = unknownEntries.map((entry) => entry.key);
  const constantsAvailable = decoded.some((entry) => entry.known);

  return {
    raw: { ...raw },
    invalidKeys,
    constantsAvailable,
    // Completeness of decoding the received entries, not coverage of all gold.
    breakdownComplete: constantsAvailable && unknownKeys.length === 0 && invalidKeys.length === 0,
    totalPositiveGold: decoded.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
    totalNegativeGold: decoded.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
    groups: grouped.filter((entry) => entry.group !== 'unknown'),
    // Legacy debug net amount; presentation uses the separate signed groups.
    unknownAmount: unknownEntries.reduce((sum, entry) => sum + entry.amount, 0),
    unknownKeys,
    decoded,
    grouped
  };
}
