import assert from 'node:assert/strict';
import test from 'node:test';
import { canApplyCarryRules, detectRole } from './detectRole';

test('missing role telemetry retains the legacy carry fallback', () => {
  const result = detectRole({});
  assert.equal(result.fallbackKind, 'missing-signals');
  assert.equal(canApplyCarryRules(result), true);
});

test('ambiguous role telemetry cannot select carry rules', () => {
  const result = detectRole({ stratzRole: 'CORE', stratzLane: 'MID_LANE' });
  assert.equal(result.fallbackKind, 'conflicting-signals');
  assert.equal(canApplyCarryRules(result), false);
});

test('explicit unsupported roles cannot select carry rules', () => {
  const offlane = detectRole({ stratzPosition: 'POSITION_3', openDotaLaneRole: 1 });
  const mid = detectRole({ stratzPosition: 'POSITION_2', openDotaLaneRole: 1 });
  assert.equal(offlane.role, 'offlane');
  assert.equal(mid.role, 'mid');
  assert.equal(canApplyCarryRules(offlane), false);
  assert.equal(canApplyCarryRules(mid), false);
});
