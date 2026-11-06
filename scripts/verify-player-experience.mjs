// Synthetic drafts only. Does not query STRATZ or validate live recommendations.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const temp = join(root, '.tmp-player-experience');
const output = process.env.EVIDENCE_DIR || join(root, 'docs/evidence/player-experience');
mkdirSync(temp, { recursive: true }); mkdirSync(output, { recursive: true });
writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, rootDir: '../src', outDir: '.', module: 'commonjs', moduleResolution: 'node', target: 'es2022' }, files: ['../src/lib/dota/rules/preGame/lifestealerCarry.ts', '../src/lib/dota/adapters/normalizeDraftInput.ts'], include: [] }));
assert.equal(spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], { cwd: root, stdio: 'inherit' }).status, 0);
const { runLifestealerCarryPreGameRules } = require(join(temp, 'lib/dota/rules/preGame/lifestealerCarry.js'));
const { normalizeDraftInput } = require(join(temp, 'lib/dota/adapters/normalizeDraftInput.js'));
const server = process.env.START_SERVER === '1' ? spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }) : null;
if (server) await new Promise((resolve, reject) => { const timeout = setTimeout(() => { server.kill(); reject(new Error('Startup timeout')); }, 30000); server.stdout.on('data', (data) => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } }); server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Startup ${code}`)); }); server.on('error', reject); });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const chromiumModule = process.env.CHROMIUM_MODULE_PATH ? require(process.env.CHROMIUM_MODULE_PATH) : null;
const localChromium = chromiumModule?.default ?? chromiumModule;
const browser = await chromium.launch(localChromium ? { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || await localChromium.executablePath(), args: localChromium.args } : { headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
let delay = 0, mode = 'ready', calls = 0;
await page.addInitScript(() => localStorage.setItem('dota-coach-locale', 'en'));
await page.route('**/api/pre-game/analyze', async (route) => {
  calls++; const input = route.request().postDataJSON(), scenario = mode;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  try { await route.fulfill(scenario === 'error' ? { status: 500, json: { errorCode: 'PRE_GAME_FAILED' } } : { json: scenario === 'malformed' ? { lane: {}, startingItems: [], buildBranches: [] } : runLifestealerCarryPreGameRules(normalizeDraftInput(input)) }); } catch { /* navigation/abort */ }
});
const checks = [];
async function shot(name) {
  await page.evaluate(() => { document.querySelector('[data-synthetic]')?.remove(); const note = document.createElement('p'); note.dataset.synthetic = 'true'; note.textContent = 'СИНТЕТИЧЕСКИЙ ДРАФТ · UI-проверка, не live API'; note.style.cssText = 'padding:8px 16px;background:#e0b568;color:#101416;font:12px system-ui'; document.body.prepend(note); });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
try {
  await page.goto(`${base}/pre-game`);
  assert.equal(await page.getByRole('heading', { name: 'План на линию', exact: true }).count(), 1);
  assert.equal(await page.getByRole('combobox').count(), 0);
  assert.equal(await page.getByLabel('Твой саппорт', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('button', { name: /^(RU|EN)$/ }).count(), 0);
  assert.equal(await page.getByText(/JSON плана/).count(), 0);
  await page.getByRole('button', { name: /^Заполнить пример:/ }).click();
  await page.getByLabel('Твой саппорт', { exact: true }).fill('Лион');
  await page.getByLabel('Соперник 1', { exact: true }).fill('Легионка');
  await page.getByLabel('Соперник 2', { exact: true }).fill('Таск');
  const submit = page.getByRole('button', { name: 'Составить план', exact: true });
  await submit.focus(); await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: /^Линия:/ });
  await heading.waitFor();
  assert.match(await heading.textContent(), /Lifestealer \+ Lion против Legion Commander \+ Tusk/);
  assert.equal(await page.getByText('сложная', { exact: true }).count(), 1);
  for (const width of [320, 390, 768, 1440, 1920]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `pregame overflow ${width}`); if ([390, 1440].includes(width)) await shot(`pre-game-${width}`); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pickBoxes = await Promise.all(['Твой саппорт', 'Соперник 1', 'Соперник 2'].map((label) => page.getByLabel(label, { exact: true }).boundingBox()));
  assert.ok(pickBoxes.every((box) => Math.abs(box.y - pickBoxes[0].y) < 1 && box.height === pickBoxes[0].height), 'pick inputs align even when only one field has a hint');
  checks.push('empty initial picks; explicit example; fixed supported hero/role; Russian aliases; exact matchup; legacy English ignored; no JSON block; keyboard submit; five viewport widths');
  await page.getByLabel('Соперник 1', { exact: true }).fill('Axe');
  await page.getByRole('status').filter({ hasText: 'Пики изменились' }).waitFor();
  assert.equal(await heading.count(), 0);
  await page.getByRole('button', { name: 'Обновить план', exact: true }).click(); await heading.waitFor();
  assert.equal(await page.getByText('Не оценена', { exact: true }).count(), 1);
  await page.getByText('Для этого матчапа пока есть только общий план', { exact: true }).waitFor();
  const before = calls;
  await page.getByLabel('Соперник 2', { exact: true }).fill('Lion');
  await page.getByRole('button', { name: 'Обновить план', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Укажи трёх разных героев' }).waitFor(); assert.equal(calls, before);
  await page.getByLabel('Соперник 2', { exact: true }).fill('Tusk');
  delay = 700;
  await page.getByRole('button', { name: 'Составить план', exact: true }).click();
  await page.getByLabel('Твой саппорт', { exact: true }).fill('Dazzle');
  await page.waitForTimeout(850); assert.equal(await heading.count(), 0, 'late response cannot restore stale plan');
  delay = 0; mode = 'malformed'; await page.getByRole('button', { name: 'Обновить план', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Не удалось составить план' }).waitFor();
  mode = 'error'; await page.getByRole('button', { name: 'Обновить план', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Не удалось составить план' }).waitFor();
  mode = 'ready'; await page.getByRole('button', { name: 'Обновить план', exact: true }).click(); await heading.waitFor();
  checks.push('unknown matchup stays unknown; edited picks hide old plan; duplicate picks rejected before fetch; late response discarded; malformed/error handled; successful retry');
  assert.deepEqual(errors, []);
  const result = { synthetic: true, checks, consoleErrors: errors };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) { await shot('failure').catch(() => undefined); throw error; }
finally { await browser.close(); server?.kill(); rmSync(temp, { recursive: true, force: true }); }
