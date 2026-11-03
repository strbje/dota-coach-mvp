import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { farmSummary, filterFarm, gridOrigin, isCoordinateReviewEnabled, parseReviewData, projectWorld, type FarmEvent } from './coordinateReview';

const fixture = () => JSON.parse(readFileSync(join(process.cwd(), 'docs/research/stratz-coordinates/visual-review-data.json'), 'utf8'));
const all = { from: -100, to: 10000, category: 'all' as const, executor: 'all' as const };
// The fixture is real replay-derived evidence. These assertions test preservation and
// display policy; they are not independent verification of STRATZ spatial semantics.
test('real fixture retains all 583 CS, including all 123 skeleton kills and missing coordinates', () => {
  const data = parseReviewData(fixture());
  assert.equal(data.productReady, false);
  assert.equal(data.source.synthetic, false);
  assert.deepEqual(data.matches.map((m) => farmSummary(m.farm)), [
    { total:302, usable:301, missing:1, hero:247, skeleton:55, unknownExecutor:0 },
    { total:281, usable:270, missing:11, hero:213, skeleton:68, unknownExecutor:0 }
  ]);
});

test('executor filter retains skeleton credit and category filter leaves unclassified separate', () => {
  const data = parseReviewData(fixture());
  for (const [index,m] of data.matches.entries()) {
    assert.equal(filterFarm(m.farm, all).length, m.lastHits);
    assert.equal(filterFarm(m.farm, { ...all, executor:'skeleton' }).length, [55,68][index]);
    assert.equal(filterFarm(m.farm, { ...all, category:'unclassified' }).length, [44,33][index]);
    assert.equal(farmSummary(m.farm).total, m.lastHits); // viewing filters never mutate input
  }
});

test('same-second real events remain separate and inclusive empty periods are honest', () => {
  const m = parseReviewData(fixture()).matches[1];
  const events = filterFarm(m.farm,{ ...all, from:1141, to:1141 });
  assert.deepEqual(events.map((e) => [e.index,e.executor]), [[176,'skeleton'],[177,'hero']]);
  assert.equal(filterFarm(m.farm,{ ...all, from:0, to:0 }).length,0);
  assert.equal(filterFarm(m.farm,{ ...all, from:20, to:10 }).length,0);
  assert.equal(filterFarm(m.farm,{ ...all, from:NaN }).length,0);
});

test('synthetic zero coordinate is usable; null/partial/out-of-range never get a hero fallback', () => {
  const base: FarmEvent = { index:0,time:0,xy:[0,0],category:'lane',executor:'skeleton',target:'synthetic',replayTime:0 };
  const events: FarmEvent[] = [base,{ ...base,index:1,xy:[0,null] },{ ...base,index:2,xy:[256,0] }];
  assert.deepEqual(gridOrigin([0,0]),[-16384,-16384]);
  assert.equal(gridOrigin([0,null]),null);
  assert.equal(gridOrigin([null,null]),null);
  assert.equal(gridOrigin([256,0]),null);
  assert.deepEqual(farmSummary(events),{total:3,usable:1,missing:2,hero:0,skeleton:3,unknownExecutor:0});
});

test('unmatched real death stays unmatched; exact time labels are not spatial validation', () => {
  const m = parseReviewData(fixture()).matches[0];
  const unmatched = m.deaths.find((d) => d.time===1145)!;
  assert.equal(gridOrigin(unmatched.candidateXY),null);
  assert.equal(unmatched.worldError,null);
  assert.equal(unmatched.candidateTime,null);
  assert.deepEqual(m.deaths.filter((d) => d.confidence==='exact' && d.sameCell===false).map((d) => d.time),[890,2019]);
});

test('cartesian review plane keeps equal world scale and rejects degenerate bounds (synthetic)', () => {
  const bounds = {xMin:-100,xMax:100,yMin:-200,yMax:200};
  assert.deepEqual(projectWorld([-100,200],bounds),[0,0]);
  assert.deepEqual(projectWorld([100,-200],bounds),[1000,2000]);
  assert.deepEqual(projectWorld([0,0],bounds),[500,1000]);
  assert.throws(() => projectWorld([0,0],{...bounds,xMax:-100}));
});

test('research UI is available only in development', () => {
  assert.equal(isCoordinateReviewEnabled('development'),true);
  for (const mode of ['production','test','',undefined]) assert.equal(isCoordinateReviewEnabled(mode),false);
});

test('corrupt fixture cannot silently become validated, synthetic, incomplete or duplicated', () => {
  for (const alter of [
    (d: ReturnType<typeof fixture>) => { d.productReady=true; },
    (d: ReturnType<typeof fixture>) => { d.source.synthetic=true; },
    (d: ReturnType<typeof fixture>) => { d.matches[0].farm[0].xy=['81',169]; },
    (d: ReturnType<typeof fixture>) => { d.matches[0].farm.pop(); },
    (d: ReturnType<typeof fixture>) => { d.matches[0].farm[1].index=0; },
    (d: ReturnType<typeof fixture>) => { d.matches[0].bounds.xMax=d.matches[0].bounds.xMin; }
  ]) {
    const value=fixture(); alter(value); assert.throws(() => parseReviewData(value));
  }
  const empty=fixture(); empty.matches=[]; assert.equal(parseReviewData(empty).matches.length,0);
});
