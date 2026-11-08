// Synthetic provider responses: exercises the real page/card/storage, not live STRATZ roles.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const temp = join(root, '.tmp-challenge-matches');
const output = process.env.EVIDENCE_DIR || join(root, 'docs/evidence/challenge-matches');
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true }); mkdirSync(output, { recursive: true });
writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, rootDir: '../src', outDir: '.', module: 'commonjs', moduleResolution: 'node', target: 'es2022' }, files: ['../src/lib/dota/rules/postMatch/postMatchV2.fixture.ts'], include: [] }));
assert.equal(spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], { cwd: root, stdio: 'inherit' }).status, 0);
mkdirSync(join(temp, 'node_modules/@'), { recursive: true });
symlinkSync(join(temp, 'lib'), join(temp, 'node_modules/@/lib'), 'junction');
const { syntheticPostMatch } = require(join(temp, 'lib/dota/rules/postMatch/postMatchV2.fixture.js'));
const now = Math.floor(Date.now() / 1000), day = 86400;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{}');
let fixture;
try { fixture = await syntheticPostMatch({ startTime: now - 9 * day, benchmarks: true }); }
finally { globalThis.fetch = originalFetch; }
const server = process.env.START_SERVER === '1' ? spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }) : null;
if (server) await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { server.kill(); reject(new Error('Startup timeout')); }, 30000);
  server.stdout.on('data', (data) => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
  server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Startup ${code}`)); });
  server.on('error', reject);
});
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browserModule = process.env.CHROMIUM_MODULE_PATH ? require(process.env.CHROMIUM_MODULE_PATH) : null;
const localChromium = browserModule?.default ?? browserModule;
const browser = await chromium.launch(localChromium ? { headless: true, executablePath: await localChromium.executablePath(), args: localChromium.args } : { headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const matches = [9000067, 9000068, 9000069].map((matchId, index) => ({ matchId, startTime: now - (6 - index) * day }));
let mode = 'partial', historyMode = 'ready', delay = 0, analysisCalls = 0, historyCalls = 0;
const storageKey = 'dota-coach:challenge:v1:1000066:carry:42:22:7';
await page.route('**/api/post-match/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/players')) return route.fulfill({ json: { matchId: 9000066, players: [{ playerSlot: 0, heroId: 42, heroName: 'Wraith King', heroKey: 'skeleton_king', accountId: 1000066, side: 'radiant', playerName: 'Синтетический игрок', kills: 8, deaths: 5, assists: 11 }] } });
  if (path.endsWith('/challenge-matches')) {
    historyCalls++;
    if (historyMode === 'error' || historyMode === 'private') return route.fulfill({ status: historyMode === 'private' ? 403 : 503, json: { error: historyMode } });
    return route.fulfill({ json: { matches: historyMode === 'empty' ? [] : matches, partial: mode === 'partial', fetchedAt: now } });
  }
  const input = route.request().postDataJSON();
  if (input.selector.playerSlot !== undefined) return route.fulfill({ json: fixture });
  analysisCalls++;
  assert.deepEqual(input.selector, { accountId: 1000066, heroId: 42 });
  const match = matches.find((entry) => entry.matchId === input.matchId);
  assert.ok(match);
  const currentMode = mode;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  try {
    if (currentMode === 'role-error') return await route.fulfill({ status: 503, json: { errorCode: 'STRATZ_NOT_CONFIGURED' } });
    if (currentMode === 'partial' && match.matchId === 9000069) return await route.fulfill({ status: 504, json: { errorCode: 'STRATZ_TIMEOUT' } });
    const result = structuredClone(fixture);
    result.analysis.matchId = match.matchId;
    const observation = result.analysis.training.observation;
    Object.assign(observation, match);
    observation.lastHitsAt10 = currentMode === 'recovered' && match.matchId === 9000068 ? 0 : 60;
    if (currentMode === 'missing' || currentMode === 'partial' && match.matchId === 9000068) delete observation.lastHitsAt10;
    delete result.analysis.training.goal;
    await route.fulfill({ json: result });
  } catch { /* Aborted navigation/check. */ }
});

const checks = [];
const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
async function accept() {
  await page.clock.setFixedTime(new Date((now - 7 * day) * 1000));
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).click();
  await page.clock.setFixedTime(new Date(now * 1000));
  await page.getByRole('button', { name: 'Проверить новые матчи', exact: true }).waitFor();
}
async function check(label = 'Проверить новые матчи') { await page.getByRole('button', { name: label, exact: true }).click(); }
async function done() { await page.getByRole('status').filter({ hasText: 'Проверка завершена' }).waitFor(); }
async function screenshot(name, cardOnly = false) {
  const card = page.getByRole('heading', { name: 'К 10:00', exact: true }).locator('..');
  await (cardOnly ? card : page.locator('body')).evaluate((element) => {
    const note = document.createElement('p'); note.dataset.synthetic = 'true';
    note.textContent = 'СИНТЕТИЧЕСКИЕ ДАННЫЕ · UI-проверка челленджа';
    note.style.cssText = 'padding:8px 16px;background:#e0b568;color:#101416;font:12px system-ui'; element.prepend(note);
  });
  if (cardOnly) await card.screenshot({ path: join(output, `${name}.png`) });
  else { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: join(output, `${name}.png`), fullPage: false }); }
  await page.locator('[data-synthetic=true]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
}
try {
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:3000'}/post-match?matchId=9000066&playerSlot=0`);
  await page.getByRole('button', { name: 'Разобрать матч', exact: true }).click();
  await accept();
  const trigger = page.getByRole('button', { name: 'Проверить новые матчи', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({ hasText: 'Не удалось проверить матч' }).waitFor();
  assert.deepEqual((await stored()).checks.map((entry) => entry.actual), [60, undefined]);
  await page.getByText('Получена только часть истории.', { exact: false }).waitFor();
  await screenshot('challenge-partial', true);
  mode = 'recovered'; await check('Продолжить проверку'); await done();
  assert.equal((await stored()).checks.filter((entry) => entry.actual !== undefined).length, 2);
  await check(); await done();
  await page.getByText('Цикл завершён · проверено 3/3', { exact: true }).waitFor();
  assert.deepEqual((await stored()).checks.map((entry) => entry.actual), [60, 0, 60]);
  checks.push('keyboard start; per-result persistence; missing checkpoint pending; API error preserves progress; continuation; successful retry fills pending; zero is real');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    assert.ok((await trigger.boundingBox()).height >= 44);
    if (width === 390) await screenshot('challenge-mobile', true);
    if (width === 1440) await screenshot('challenge-desktop');
  }
  mode = 'missing'; await check(); await done();
  assert.deepEqual((await stored()).checks.map((entry) => entry.actual), [60, 0, 60]);
  mode = 'ready'; await check(); await done();
  assert.equal((await stored()).checks.length, 3);
  assert.ok((await stored()).checks.every((entry) => entry.actual === 60));
  historyMode = 'error'; await check(); await page.getByRole('status').filter({ hasText: 'Не удалось получить историю' }).waitFor();
  assert.equal((await stored()).checks.length, 3);
  historyMode = 'private'; await check(); await page.getByRole('status').filter({ hasText: 'История аккаунта недоступна' }).waitFor();
  assert.equal((await stored()).checks.length, 3);
  checks.push('320/390/768/1440px; 44px controls; no overflow; completed 3/3 survives missing/failed refresh; valid correction; no duplicates; private history');
  historyMode = 'ready'; mode = 'role-error'; await check(); await page.getByRole('status').filter({ hasText: 'Нужна настройка STRATZ' }).waitFor();
  assert.equal((await stored()).checks.length, 3);
  mode = 'ready'; delay = 600; await check('Продолжить проверку');
  await page.getByRole('button', { name: 'Остановить проверку', exact: true }).click();
  const beforePause = await stored();
  await page.waitForTimeout(750); assert.deepEqual(await stored(), beforePause);
  await check('Продолжить проверку');
  await page.getByRole('button', { name: 'Снять челлендж', exact: true }).click();
  await page.waitForTimeout(750); assert.equal(await stored(), null);
  await accept(); historyMode = 'empty'; delay = 0; await check();
  await page.getByRole('status').filter({ hasText: 'пока нет новых матчей' }).waitFor();
  await screenshot('challenge-empty', true);
  historyMode = 'ready'; delay = 600; await check();
  await page.getByRole('button', { name: 'Остановить проверку', exact: true }).waitFor();
  await page.evaluate((key) => { const next = JSON.parse(localStorage.getItem(key)); next.acceptedAt++; localStorage.setItem(key, JSON.stringify(next)); dispatchEvent(new StorageEvent('storage', { key })); }, storageKey);
  await page.waitForTimeout(750); assert.deepEqual((await stored()).checks, []);
  delay = 0;
  await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('dota-coach:challenge:')) throw new Error('quota'); return window.originalSetItem.call(this, key, value); }; });
  await check(); await page.getByRole('status').filter({ hasText: 'Браузер не разрешил сохранить новый результат' }).waitFor();
  assert.deepEqual((await stored()).checks, []);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await check('Продолжить проверку'); await done();
  assert.equal((await stored()).checks.length, 3);
  checks.push('missing token blocks new results; stop ignores late response; remove goal cannot resurrect; empty state; other-tab new cycle rejects old response; storage failure stops; storage recovery');
  await page.getByRole('button', { name: 'Снять челлендж', exact: true }).click();
  await accept(); mode = 'partial'; await check();
  await page.getByRole('status').filter({ hasText: 'Не удалось проверить матч' }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Разобрать матч', exact: true }).click();
  await page.getByText('Матчи и результаты проверки · ожидают данных: 1', { exact: true }).waitFor();
  mode = 'ready'; await check(); await done();
  assert.equal((await stored()).checks.length, 3);
  checks.push('pending checkpoint remains visible after page reload; fresh discovery retries it successfully');
  assert.deepEqual(errors, []);
  const result = { synthetic: true, checks, historyCalls, analysisCalls, consoleErrors: errors };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) { await screenshot('failure', true).catch(() => {}); throw error; }
finally { await browser.close(); server?.kill(); rmSync(temp, { recursive: true, force: true }); }
