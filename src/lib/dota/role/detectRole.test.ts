import assert from 'node:assert/strict';
import test from 'node:test';
import { canApplyCarryRules, canApplyCarryRulesForSelector, detectRole } from './detectRole';

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

test('missing role telemetry keeps carry fallback only for the legacy Lifestealer selector', () => {
  const unknown = detectRole({});

  assert.equal(canApplyCarryRulesForSelector(unknown, { heroId: 54 }), true);
  assert.equal(canApplyCarryRulesForSelector(unknown, { heroId: 1 }), false);
  assert.equal(canApplyCarryRulesForSelector(unknown, { accountId: 123, heroId: 54 }), false);
  assert.equal(canApplyCarryRulesForSelector(unknown, { playerSlot: 2 }), false);
});

test('OpenDota safe lane alone does not confirm carry for an explicit selector', () => {
  const result = detectRole({ openDotaLaneRole: 1 });

  assert.equal(result.role, 'carry');
  assert.equal(result.source, 'opendota');
  assert.equal(canApplyCarryRulesForSelector(result, { accountId: 123 }), false);
  assert.equal(canApplyCarryRulesForSelector(result, { playerSlot: 0 }), false);
});

test('legacy Lifestealer retains the OpenDota safe-lane fallback', () => {
  const result = detectRole({ openDotaLaneRole: 1 });
  assert.equal(canApplyCarryRulesForSelector(result, { heroId: 54 }), true);
});

test('explicit selector accepts STRATZ Position 1', () => {
  const result = detectRole({ stratzPosition: 'POSITION_1' });
  assert.equal(canApplyCarryRulesForSelector(result, { accountId: 123 }), true);
});

test('STRATZ Position 5 takes priority over OpenDota safe lane', () => {
  const result = detectRole({ stratzPosition: 'POSITION_5', openDotaLaneRole: 1 });

  assert.equal(result.role, 'support');
  assert.equal(result.source, 'stratz');
  assert.equal(canApplyCarryRulesForSelector(result, { accountId: 123 }), false);
});
