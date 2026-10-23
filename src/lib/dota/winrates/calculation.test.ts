import assert from 'node:assert/strict';
import test from 'node:test';
import { accountId, DAY, encounters, groupMean, normalizeHistoryRow, normalizeRoster, resultKey, sample, seriesMean, sortEncounters, uniquePlayers } from './calculation';
import { csvCell, exportCsv } from './presentation';
import { fixtureFilters, fixtureMatch, fixturePlan, fixtureResult, fixtureResults, fixtureRow, FIXTURE_TIME } from './winrates.fixture';
import type { History, Results } from './types';

test('Radiant and Dire wins are explicit; absent outcomes and invalid slots are not losses', () => {
  for (const slot of [0, 4, 128, 132]) for (const radiant of [true, false]) {
    const row = normalizeHistoryRow(fixtureRow(1, { player_slot: slot, radiant_win: radiant }), fixtureFilters);
    assert.ok(row && row !== 'filtered'); assert.equal(row.win, radiant === (slot < 128));
  }
  for (const overrides of [{ radiant_win: null }, { radiant_win: 0 }, { player_slot: 5 }, { duration: null }, { start_time: null }, { duration: 0 }]) assert.equal(normalizeHistoryRow(fixtureRow(1, overrides), fixtureFilters), null);
});

test('ranked and Turbo filtering are consistent and unknown filter fields are not guessed', () => {
  assert.equal(normalizeHistoryRow(fixtureRow(1, { lobby_type: 0 }), fixtureFilters), 'filtered');
  assert.equal(normalizeHistoryRow(fixtureRow(1, { game_mode: 23 }), fixtureFilters), 'filtered');
  assert.equal(normalizeHistoryRow(fixtureRow(1, { lobby_type: undefined }), fixtureFilters), null);
  assert.ok(normalizeHistoryRow(fixtureRow(1, { lobby_type: 0, game_mode: 23 }), { rankedOnly: false, excludeTurbo: false }));
});

test('timestamp windows include lower bound, exclude unfinished/later/target games, and preserve real zero wins', () => {
  const asOf = FIXTURE_TIME;
  const starts = [asOf - 7 * DAY, asOf - 7 * DAY - 1, asOf - 30 * DAY, asOf - 30 * DAY - 1, asOf - 100, asOf - 99, asOf + 100, asOf - DAY];
  const history: History = { rows: starts.map((startTime, index) => ({ matchId: index + 1, startTime, duration: 100, playerSlot: 0, win: false })), stop: 'exhausted', scanned: 8, invalid: 0, oldest: starts[3], ordered: true, fetchedAt: asOf, expiresAt: asOf + 300 };
  const seven = sample(history, 7, asOf, 8);
  assert.equal(seven.games, 1); assert.equal(seven.wins, 0); assert.equal(seven.rate, 0);
  const thirty = sample(history, 30, asOf, 8);
  assert.equal(thirty.games, 3); assert.equal(thirty.first, asOf - 30 * DAY);
  assert.equal(sample({ ...history, rows: [] }, 7, asOf, 8).rate, null);
});

test('4 allies / 5 opponents for both selected sides, with anonymous places retained', () => {
  const plan = fixturePlan();
  for (const slot of [0, 128]) {
    const rows = encounters(plan, slot);
    assert.equal(rows.length, 9); assert.equal(rows.filter((row) => row.side === 'with').length, 4);
    assert.equal(rows.filter((row) => row.side === 'against').length, 5); assert.ok(!rows.some((row) => row.player.slot === slot));
  }
  const raw = fixtureMatch(); raw.players[1].account_id = 4294967295; raw.players.pop();
  plan.matches[0].match = normalizeRoster(raw, raw.match_id);
  assert.equal(encounters(plan, 0).length, 9);
  assert.equal(plan.matches[0].match.players[1].missing, 'anonymous');
  assert.equal(plan.matches[0].match.players[9].missing, 'roster_missing');
  assert.equal(accountId(0), false); assert.equal(accountId(4294967295), false);
});

test('ambiguous duplicate slots and account IDs cannot be double-counted', () => {
  const raw = fixtureMatch(); raw.players[2].account_id = raw.players[1].account_id; raw.players.push(raw.players[3]);
  const match = normalizeRoster(raw, raw.match_id);
  assert.deepEqual([1, 2, 3].map((index) => match.players[index].missing), ['ambiguous', 'ambiguous', 'ambiguous']);
  assert.ok([1, 2, 3].every((index) => match.players[index].accountId === undefined));
});

test('equal participant percentages yield 75%, not pooled 51/101; missing values do not dilute mean', () => {
  const plan = fixturePlan(); const rows = encounters(plan, 0);
  const results: Results = { '9000067:1001': fixtureResult(1001, 9000067, FIXTURE_TIME - DAY, 1, 1), '9000067:1002': fixtureResult(1002, 9000067, FIXTURE_TIME - DAY, 50, 100) };
  const average = groupMean(rows, results, 7, 'with');
  assert.equal(average.mean, 75); assert.equal(average.available, 2); assert.equal(average.expected, 4);
  assert.equal(groupMean(rows, results, 7, 'against').mean, null);
});

test('series mean uses equal paired match weights; unique encounter counters are final on both sides', () => {
  const plan = fixturePlan('series'); const rows = encounters(plan);
  const results = fixtureResults(plan);
  const people = uniquePlayers([...rows, rows[0]]);
  const repeated = people.find((person) => person.accountId === 1001)!;
  assert.deepEqual(repeated.with, [9000067]); assert.deepEqual(repeated.against, [9000068]);
  const first = rows.filter((row) => row.matchId === 9000067);
  const second = rows.filter((row) => row.matchId === 9000068);
  for (const row of second) if (row.side === 'with' && row.player.accountId !== 1005) delete results[resultKey(row.matchId, row.player.accountId!)];
  const mean = seriesMean(rows, results, 7);
  assert.equal(mean.pairs, 2); assert.equal(mean.with, (groupMean(first, results, 7, 'with').mean! + groupMean(second, results, 7, 'with').mean!) / 2);
  for (const row of second) if (row.side === 'against') delete results[resultKey(row.matchId, row.player.accountId!)];
  assert.equal(seriesMean(rows, results, 7).pairs, 1);
});

test('CSV matches sorted visible results, includes samples/final encounter counts, and neutralizes formulas', () => {
  const plan = fixturePlan('series'); const results = fixtureResults(plan);
  plan.matches[0].match!.players[1].name = '=HYPERLINK("x");\nTest';
  const rows = sortEncounters(encounters(plan), results, 7, 'rate_desc');
  const csv = exportCsv(plan, rows, results, 7);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('\r\n'));
  assert.match(csv, /Победы 7/); assert.match(csv, /Игры 30/); assert.match(csv, /Покрытие 30/); assert.match(csv, /Вместе, всего/);
  assert.ok(csv.includes(`"'` + '=HYPERLINK(""x"");\nTest"'));
  for (const unsafe of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', ' \t=1', '\tplain']) assert.ok(csvCell(unsafe).startsWith('"\''));
  assert.equal(csvCell('hello;"world"'), '"hello;""world"""');
  assert.equal(csvCell(-12.5), '"-12,5"');
  assert.equal(rows.length, 18); assert.equal(rows.at(-1)?.player.accountId !== undefined, true);
});


test('canonical hero metadata survives anonymous rosters and is never assigned to a unique series participant', async () => {
  const { normalizeHeroes } = await import('../providers/opendotaConstantsProvider');
  const { setHeroConstants, getHeroPortraitUrl } = await import('../data/heroConstants');
  const constants = normalizeHeroes({ 42: { id: 42, name: 'npc_dota_hero_skeleton_king', localized_name: 'Wraith King' }, 54: { id: 54, name: 'npc_dota_hero_life_stealer', localized_name: 'Lifestealer' } });
  setHeroConstants(constants);
  const raw = fixtureMatch();
  raw.players[1].hero_id = 42; raw.players[1].account_id = 4294967295;
  const anonymous = normalizeRoster(raw, raw.match_id).players[1];
  assert.equal(anonymous.heroId, 42); assert.equal(anonymous.heroKey, 'skeleton_king');
  assert.equal(anonymous.heroName, 'Wraith King'); assert.equal(anonymous.accountId, undefined);
  assert.match(getHeroPortraitUrl(anonymous.heroKey)!, /heroes\/skeleton_king.png$/);
  for (const key of [undefined, '42', 'Wraith King', '../axe', 'https://example.com/axe']) assert.equal(getHeroPortraitUrl(key), undefined);
  const missing = normalizeRoster({ ...raw, players: [] }, raw.match_id).players[0];
  assert.equal(missing.heroId, undefined); assert.equal(missing.heroKey, undefined);
  setHeroConstants(normalizeHeroes({ 42: { id: 42, localized_name: 'Wraith King' } }));
  const withoutKey = normalizeRoster(raw, raw.match_id).players[1];
  assert.equal(withoutKey.heroName, 'Wraith King'); assert.equal(withoutKey.heroId, 42); assert.equal(withoutKey.heroKey, undefined);
  const plan = fixturePlan('series');
  plan.matches[0].match!.players[1].heroId = 42;
  plan.matches[1].match!.players[5].heroId = 54;
  const person = uniquePlayers(encounters(plan)).find((p) => p.accountId === 1001)!;
  assert.equal('heroId' in person, false); assert.equal('heroKey' in person, false);
});

test('name sorting uses the displayed profile name and stays ordered within each side', () => {
  const plan = fixturePlan(); const rows = encounters(plan, 0); const results = fixtureResults(plan);
  for (const result of Object.values(results)) result.name = `Игрок ${10000 - result.accountId}`;
  const sorted = sortEncounters(rows, results, 7, 'name');
  for (const side of ['with', 'against']) {
    const names = sorted.filter((row) => row.side === side).map((row) => results[resultKey(row.matchId, row.player.accountId!)].name!);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ru')));
  }
});
