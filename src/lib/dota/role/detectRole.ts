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
    return { role: 'carry', confidence: 'high', reasons };
  }

  if (role === 'CORE' && lane === 'SAFE_LANE') {
    reasons.push('stratz.role=CORE + stratz.lane=SAFE_LANE');
    return { role: 'carry', confidence: 'high', reasons };
  }

  if (roleBasic === 'CORE' && lane === 'SAFE_LANE') {
    reasons.push('stratz.roleBasic=CORE + stratz.lane=SAFE_LANE');
    return { role: 'carry', confidence: 'medium', reasons };
  }

  if (input.openDotaLaneRole === 1) {
    reasons.push('opendota.lane_role=1 (safe lane core)');
    return { role: 'carry', confidence: 'medium', reasons };
  }

  if (position === 'POSITION_2') return { role: 'mid', confidence: 'medium', reasons: ['stratz.position=POSITION_2'] };
  if (position === 'POSITION_3') return { role: 'offlane', confidence: 'medium', reasons: ['stratz.position=POSITION_3'] };
  if (position === 'POSITION_4' || position === 'POSITION_5') return { role: 'support', confidence: 'medium', reasons: [`stratz.position=${position}`] };

  return {
    role: 'unknown',
    confidence: 'low',
    reasons: ['role signals are missing or conflicting']
  };
}
