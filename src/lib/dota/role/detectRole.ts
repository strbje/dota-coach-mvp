export type RoleDetectionInput = {
  stratzRole?: string;
  stratzRoleBasic?: string;
  stratzPosition?: string;
  stratzLane?: string;
  openDotaLaneRole?: number;
  openDotaLane?: number;
};

export type DetectedRole = 'carry' | 'support' | 'offlane' | 'mid' | 'unknown';

export type RoleDetectionResult = {
  role: DetectedRole;
  confidence: 'high' | 'medium' | 'low';
  source: 'stratz' | 'opendota' | 'fallback';
  fallbackKind?: 'missing-signals' | 'conflicting-signals';
  reasons: string[];
};

function norm(value?: string): string {
  return (value ?? '').trim().toUpperCase();
}

export function detectRole(input: RoleDetectionInput): RoleDetectionResult {
  const reasons: string[] = [];
  const role = norm(input.stratzRole);
  const roleBasic = norm(input.stratzRoleBasic);
  const position = norm(input.stratzPosition);
  const lane = norm(input.stratzLane);

  if (position === 'POSITION_1') {
    reasons.push('stratz.position=POSITION_1');
    return { role: 'carry', confidence: 'high', source: 'stratz', reasons };
  }

  if (position === 'POSITION_2') return { role: 'mid', confidence: 'medium', source: 'stratz', reasons: ['stratz.position=POSITION_2'] };
  if (position === 'POSITION_3') return { role: 'offlane', confidence: 'medium', source: 'stratz', reasons: ['stratz.position=POSITION_3'] };
  if (position === 'POSITION_4' || position === 'POSITION_5') return { role: 'support', confidence: 'medium', source: 'stratz', reasons: [`stratz.position=${position}`] };

  if (role === 'CORE' && lane === 'SAFE_LANE') {
    reasons.push('stratz.role=CORE + stratz.lane=SAFE_LANE');
    return { role: 'carry', confidence: 'high', source: 'stratz', reasons };
  }

  if (roleBasic === 'CORE' && lane === 'SAFE_LANE') {
    reasons.push('stratz.roleBasic=CORE + stratz.lane=SAFE_LANE');
    return { role: 'carry', confidence: 'medium', source: 'stratz', reasons };
  }

  if (input.openDotaLaneRole === 1) {
    reasons.push('opendota.lane_role=1 (safe lane core)');
    return { role: 'carry', confidence: 'medium', source: 'opendota', reasons };
  }

  const hasRoleSignals = Object.values(input).some((value) => value !== undefined && value !== '');
  return {
    role: 'unknown',
    confidence: 'low',
    source: 'fallback',
    fallbackKind: hasRoleSignals ? 'conflicting-signals' : 'missing-signals',
    reasons: [hasRoleSignals ? 'role signals are conflicting or unsupported' : 'role signals are missing']
  };
}

export function canApplyCarryRules(result: RoleDetectionResult): boolean {
  return result.role === 'carry' || (result.role === 'unknown' && result.fallbackKind === 'missing-signals');
}
