export const otherTargetKinds = ['summon', 'ward', 'building', 'roshan', 'tormentor'] as const;
export type OtherTargetKind = typeof otherTargetKinds[number];
export type OtherFarmTarget = { npcId: number; kind: OtherTargetKind; label: string };

type VerifiedTarget = { unitName: string } & (
  | { category: 'neutral' | 'ancient' }
  | { category: 'other'; kind: OtherTargetKind; label: string }
);

// STRATZ IDs, NOT Valve entity indices. Verified against saved responses and replay
// last-hit counter increments for gameVersionId 190 only. See docs/evidence/farm-targets/README.md.
// Do not extend to other versions or infer a category from an ID range/name substring.
export const verifiedFarmTargets: Readonly<Record<number, VerifiedTarget>> = {
  896: { unitName: 'npc_dota_neutral_froglet', category: 'neutral' },
  897: { unitName: 'npc_dota_neutral_grown_frog', category: 'neutral' },
  898: { unitName: 'npc_dota_neutral_ancient_frog', category: 'ancient' },
  899: { unitName: 'npc_dota_neutral_froglet_mage', category: 'neutral' },
  900: { unitName: 'npc_dota_neutral_grown_frog_mage', category: 'neutral' },
  901: { unitName: 'npc_dota_neutral_ancient_frog_mage', category: 'ancient' },
  863: { unitName: 'npc_dota_warlock_minor_imp', category: 'other', kind: 'summon', label: 'Бесы Warlock' },
  265: { unitName: 'npc_dota_clinkz_skeleton_archer', category: 'other', kind: 'summon', label: 'Скелеты Clinkz' },
  111: { unitName: 'npc_dota_sentry_wards', category: 'other', kind: 'ward', label: 'Сентри' },
  133: { unitName: 'npc_dota_roshan', category: 'other', kind: 'roshan', label: 'Рошан' },
  861: { unitName: 'npc_dota_miniboss', category: 'other', kind: 'tormentor', label: 'Терзатель' },
  21: { unitName: 'npc_dota_goodguys_tower2_bot', category: 'other', kind: 'building', label: 'Т2 Radiant · нижняя линия' },
  29: { unitName: 'npc_dota_badguys_tower2_top', category: 'other', kind: 'building', label: 'Т2 Dire · верхняя линия' },
  34: { unitName: 'npc_dota_badguys_tower3_bot', category: 'other', kind: 'building', label: 'Т3 Dire · нижняя линия' },
  49: { unitName: 'npc_dota_badguys_range_rax_bot', category: 'other', kind: 'building', label: 'Рендж-барак Dire · нижняя линия' },
  37: { unitName: 'npc_dota_badguys_fillers', category: 'other', kind: 'building', label: 'Постройка на базе Dire' },
  48: { unitName: 'npc_dota_badguys_range_rax_mid', category: 'other', kind: 'building', label: 'Рендж-барак Dire · мид' },
  45: { unitName: 'npc_dota_badguys_melee_rax_mid', category: 'other', kind: 'building', label: 'Мили-барак Dire · мид' }
};

export function verifiedFarmTarget(npcId: unknown, gameVersionId: unknown): VerifiedTarget | undefined {
  if (gameVersionId !== 190 || typeof npcId !== 'number' || !Number.isSafeInteger(npcId)) return undefined;
  return Object.hasOwn(verifiedFarmTargets, npcId) ? verifiedFarmTargets[npcId] : undefined;
}
