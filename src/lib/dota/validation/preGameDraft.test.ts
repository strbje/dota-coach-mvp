import test from 'node:test';
import assert from 'node:assert/strict';
import { isPreGameAnalysis } from './preGameResponse';
import { laneHero, validLaneInput } from './preGameDraft';
import { normalizeDraftInput } from '../adapters/normalizeDraftInput';
import { runLifestealerCarryPreGameRules } from '../rules/preGame/lifestealerCarry';
const draft = { hero: 'Lifestealer', role: 'carry', allies: ['Lifestealer', 'Лион'], enemies: ['Легионка', 'Таск'], lanes: { safe: { ally: ['Lifestealer', 'Лион'], enemy: ['Легионка', 'Таск'] } } };
test('lane aliases resolve to the configured matchup, without changing other matchups into medium difficulty', () => {
  assert.ok(validLaneInput(draft));
  assert.equal(runLifestealerCarryPreGameRules(normalizeDraftInput(draft)).lane.difficulty, 'hard');
  const different = { ...draft, lanes: { safe: { ally: ['Lifestealer', 'Dazzle'], enemy: ['Axe', 'Lion'] } } };
  assert.equal(runLifestealerCarryPreGameRules(normalizeDraftInput(different)).lane.difficulty, 'unknown');
});
test('missing, repeated, comma-separated and malformed lane picks are rejected before analysis', () => {
  for (const value of [null, {}, { ...draft, lanes: null }, { ...draft, lanes: { safe: { ally: ['Lifestealer', 'Naix'], enemy: ['Tusk', 'Lion'] } } }, { ...draft, lanes: { safe: { ally: ['Lifestealer', 'Lion'], enemy: ['', 'Tusk'] } } }, { ...draft, lanes: { safe: { ally: ['Lifestealer', 'Lion'], enemy: ['Axe, Pudge', 'Tusk'] } } }]) assert.equal(validLaneInput(value), false);
});

test('partial or malformed successful responses cannot crash the plan UI', () => {
  const plan = runLifestealerCarryPreGameRules(normalizeDraftInput(draft));
  assert.equal(isPreGameAnalysis(plan), true);
  for (const payload of [null, { lane: {}, startingItems: [], buildBranches: [] }, { ...plan, stagePlan: null }, { ...plan, lane: { ...plan.lane, difficulty: 'excellent' } }, { ...plan, startingItems: [null] }]) assert.equal(isPreGameAnalysis(payload), false);
});

test('prototype property names remain plain input, not aliases or executable values', () => {
  for (const value of ['constructor', 'toString', '__proto__']) assert.equal(laneHero(value), value);
  assert.equal(validLaneInput({ ...draft, role: undefined }), false);
});
