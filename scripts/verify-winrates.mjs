// Optional browser verification with synthetic data. No production browser dependency.
// START_SERVER=1 runs the built app. LIVE_MATCH_ID optionally enables a separate real API probe.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const temp = join(root, '.tmp-winrates-browser');
const output = process.env.EVIDENCE_DIR || join(root, 'docs/verification/winrates');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true }); mkdirSync(output, { recursive: true });
writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, rootDir: '../src', outDir: '.', module: 'commonjs', moduleResolution: 'node', target: 'es2022' }, files: ['../src/lib/dota/winrates/winrates.fixture.ts'], include: [] }));
const compile = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) throw new Error('Fixture compilation failed');
mkdirSync(join(temp, 'node_modules/@'), { recursive: true });
symlinkSync(join(temp, 'lib'), join(temp, 'node_modules/@/lib'), 'junction');
const { fixturePlan, fixtureResult } = require(join(temp, 'lib/dota/winrates/winrates.fixture.js'));
const server = process.env.START_SERVER === '1' ? spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }) : null;
if (server) await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { server.kill(); reject(new Error('Server startup timed out')); }, 30000);
  server.stdout.on('data', (data) => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
  server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited ${code}`)); });
  server.on('error', reject);
});
const chromiumModule = process.env.CHROMIUM_MODULE_PATH ? require(process.env.CHROMIUM_MODULE_PATH) : null;
const localChromium = chromiumModule?.default ?? chromiumModule;
const browser = await chromium.launch(localChromium ? { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || await localChromium.executablePath(), args: localChromium.args } : { headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let scenario = 'ready'; let delay = 0;
const seen = [];
function planFor(query) {
  const plan = fixturePlan(query.mode);
  plan.query = query;
  if (query.mode === 'match') {
    plan.matches[0].matchId = query.id; plan.matches[0].match.matchId = query.id;
    if (scenario === 'partial') {
      delete plan.matches[0].match.players[1].accountId; plan.matches[0].match.players[1].missing = 'anonymous';
    }
  } else {
    if (scenario === 'empty') {
      plan.matches = []; Object.assign(plan.series, { found: 0, shown: 0, status: 'empty', history: { ...plan.series.history, scanned: 0 } });
    } else {
      const entry = structuredClone(plan.matches[1]); entry.matchId = 9000069; entry.match.matchId = entry.matchId; entry.match.startTime -= 86400;
      plan.matches.push(entry); Object.assign(plan.series, { found: 5, shown: 3, remainingIds: [9000070, 9000071] });
    }
  }
  return plan;
}
await page.route('**/api/winrates/**', async (route) => {
  const request = route.request().postDataJSON();
  const kind = new URL(route.request().url()).pathname.split('/').at(-1);
  const thisScenario = scenario;
  const thisDelay = kind === 'participant' ? delay : 0;
  seen.push({ kind, request });
  if (thisDelay) await new Promise((resolve) => setTimeout(resolve, thisDelay));
  if (thisScenario === 'error') return route.fulfill({ status: 503, json: { error: 'provider_error' } });
  if (kind === 'plan') return route.fulfill({ json: planFor(request) });
  if (kind === 'batch') return route.fulfill({ json: request.matchIds.map((matchId, index) => {
    const entry = fixturePlan('series').matches[1]; entry.matchId = matchId; entry.match.matchId = matchId; entry.match.startTime -= (index + 2) * 86400; return entry;
  }) });
  const entry = fixturePlan('series').matches.find((item) => item.matchId === request.matchId);
  const asOf = request.basis === 'now' ? request.capturedAt : entry?.match.startTime ?? fixturePlan().matches[0].match.startTime - (request.matchId - 9000067) * 86400;
  const result = fixtureResult(request.accountId, request.matchId, asOf, request.accountId % 4, 5);
  result.capturedAt = request.capturedAt; result.basis = request.basis;
  result.name = `${thisScenario === 'stale' ? 'OLD' : 'Участник'} ${request.accountId}`;
  if (thisScenario === 'partial') {
    if ([1002, 1003, 1004].includes(request.accountId)) {
      result.status = { 1002: 'private', 1003: 'empty', 1004: 'provider_error' }[request.accountId];
      for (const window of [7, 30]) Object.assign(result.samples[window], { games: 0, wins: 0, rate: null, complete: result.status === 'empty', limitedBy: result.status === 'empty' ? null : 'unavailable', first: null, last: null });
    } else {
      result.history.stop = 'cap'; result.history.scanned = 300;
      Object.assign(result.samples[30], { complete: false, limitedBy: 'cap' });
    }
  }
  return route.fulfill({ json: result }).catch(() => undefined);
});
async function shot(name) {
  await page.evaluate(() => {
    if (document.getElementById('synthetic-note')) return;
    const note = document.createElement('div'); note.id = 'synthetic-note'; note.textContent = 'СИНТЕТИЧЕСКИЕ ДАННЫЕ · проверка интерфейса #67 · не результаты реальных игроков';
    note.style.cssText = 'padding:8px 16px;background:#e0b568;color:#101416;font:12px system-ui;'; document.body.prepend(note);
  });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
async function load(name, id = '9000067') {
  scenario = name;
  await editInputs();
  await page.getByLabel('Match ID', { exact: true }).fill(id);
  await page.getByRole('button', { name: /^(Загрузить сравнение|Обновить данные)$/ }).click();
  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('0');
}
async function editInputs() {
  const edit = page.getByRole('button', { name: 'Изменить параметры / обновить', exact: true });
  if (await edit.isVisible()) await edit.click();
}
async function complete(count = 9) { await page.getByText(new RegExp(`Обработано ${count} из ${count} участников`)).waitFor(); }
const report = { synthetic: true, widths: [], checks: [] };
try {
  await page.goto(`${base}/winrates`);
  await shot('initial-desktop');
  await page.getByLabel('Match ID', { exact: true }).fill('9000067');
  await page.keyboard.press('Enter');
  await page.getByLabel('Выбранный игрок', { exact: true }).waitFor();
  assert.equal(seen.filter((item) => item.kind === 'participant').length, 0, 'no guessed default player');
  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('0');
  await complete();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    report.widths.push(width);
    if (width === 390 || width === 1440) await shot(`ready-${width}`);
  }
  await page.locator('details').filter({ has: page.locator('summary', { hasText: 'Участник 1001' }) }).locator('summary').click();
  await page.getByText(/Победы \/ игры: 1 \/ 5/).first().waitFor();
  await page.setViewportSize({ width: 390, height: 1050 });
  await shot('details-mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV для Excel' }).click();
  const download = await downloadPromise; const csv = readFileSync(await download.path(), 'utf8');
  assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /Победы 7/); assert.match(csv, /Игры 30/);
  report.checks.push('explicit selection; 4/5 groups; responsive layout; expandable sample details; UTF-8 CSV download');

  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('128');
  await complete();
  const summaries = await page.locator('details summary').allTextContents();
  assert.ok(summaries.some((value) => value.includes('Участник 1000'))); assert.ok(!summaries.some((value) => value.includes('Участник 1005')));
  const focusTarget = page.getByRole('button', { name: 'Скачать CSV для Excel' });
  await focusTarget.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  assert.notEqual(await focusTarget.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
  report.checks.push('Dire selection excludes selected player; keyboard submit and visible focus');

  await page.setViewportSize({ width: 1440, height: 1050 });
  delay = 1800; await load('stale', '9000068');
  await page.getByText(/Загружаем истории…/).waitFor(); await shot('loading');
  await page.getByRole('button', { name: 'Остановить загрузку' }).click();
  delay = 0; await load('ready', '9000067'); await complete();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  assert.equal(await page.getByText(/OLD/).count(), 0);
  await editInputs(); await page.getByLabel('Без Turbo', { exact: true }).uncheck();
  assert.equal(await page.getByRole('heading', { name: 'Матч 9000067', exact: true }).count(), 0);
  await page.getByLabel('Без Turbo', { exact: true }).check();
  report.checks.push('cancel/replace ignores delayed old responses; changing filters clears previous groups');

  await load('partial'); await complete();
  await page.getByText('Окно 7 дней · сортировка', { exact: true }).click();
  await page.getByLabel('Окно для средних', { exact: true }).selectOption('30');
  await page.getByText('Окно 30 дней · сортировка', { exact: true }).click();
  await page.getByText('История ограничена OpenDota', { exact: true }).waitFor();
  await page.getByText('Нет подходящих игр', { exact: true }).waitFor();
  await shot('partial-desktop');
  await page.setViewportSize({ width: 320, height: 1050 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'partial states fit 320px');
  await page.setViewportSize({ width: 390, height: 1050 }); await shot('partial-mobile');
  report.checks.push('anonymous, restricted, empty, provider error and capped sample states');

  await editInputs(); await page.getByLabel('Представление', { exact: true }).selectOption('series');
  await page.getByLabel('Account ID · Steam32', { exact: true }).fill('1000');
  scenario = 'ready'; await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click();
  await complete(27);
  await page.getByRole('heading', { name: 'Уникальные участники · 9', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1050 }); await shot('series-desktop');
  await page.getByRole('button', { name: 'Следующие 3 матча · осталось 2', exact: true }).click();
  await complete(45);
  const batches = seen.filter((item) => item.kind === 'batch');
  assert.equal(batches.length, 1); assert.deepEqual(batches[0].request.matchIds, [9000070, 9000071]);
  const times = new Set(seen.filter((item) => item.kind === 'participant').map((item) => item.request.capturedAt)); assert.equal(times.size, 1);
  report.checks.push('bounded first series; continuation by stable Match IDs; same capture time; final unique-player table');

  scenario = 'empty'; await editInputs(); await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
  await page.getByText(/Подходящих матчей в полученной выборке нет/).waitFor(); await shot('empty');
  scenario = 'error'; await editInputs(); await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
  await page.getByText(/Ошибка OpenDota. Попробуйте/).waitFor(); await shot('error');

  scenario = 'ready'; await page.goto(`${base}/winrates?matchId=9000067&accountId=1000`);
  assert.equal(await page.getByLabel('Match ID', { exact: true }).inputValue(), '9000067');
  await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click(); await complete();
  assert.equal(await page.getByLabel('Выбранный игрок', { exact: true }).inputValue(), '0');
  assert.equal(await page.locator('nav a[aria-current="page"]').textContent(), 'Доля побед');
  report.checks.push('empty/error states; post-match deep link preselects account; active navigation');
  await editInputs(); await page.getByLabel('Момент расчёта', { exact: true }).selectOption('now');
  await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click(); await complete();
  await page.getByRole('heading', { name: 'Сейчас · единый момент расчёта', exact: true }).waitFor();
  const currentRequests = seen.filter((item) => item.kind === 'participant' && item.request.basis === 'now');
  assert.equal(currentRequests.length, 9); assert.equal(new Set(currentRequests.map((item) => item.request.capturedAt)).size, 1);
  report.checks.push('current mode is separately labelled and all participants share one capture time');
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));

  if (process.env.LIVE_MATCH_ID) {
    const live = { synthetic: false, checkedAt: new Date().toISOString(), matchId: Number(process.env.LIVE_MATCH_ID) };
    try {
      const response = await fetch(`${base}/api/winrates/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'match', id: live.matchId, basis: 'match', days: 10, rankedOnly: true, excludeTurbo: true }), signal: AbortSignal.timeout(24000) });
      const plan = await response.json(); live.planHttpStatus = response.status;
      if (response.ok) {
        const target = plan.matches[0]?.match; const participant = target?.players.find((player) => player.accountId);
        live.rosterSize = target?.players.length; live.matchStart = target?.startTime;
        if (participant) {
          const detail = await fetch(`${base}/api/winrates/participant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: live.matchId, accountId: participant.accountId, capturedAt: plan.capturedAt, basis: 'match', rankedOnly: true, excludeTurbo: true }), signal: AbortSignal.timeout(18000) });
          const result = await detail.json(); live.participantHttpStatus = detail.status; live.status = result.status ?? result.error;
          live.samples = result.samples; live.history = result.history; live.asOf = result.asOf; live.fetchedAt = result.fetchedAt;
        }
      } else live.error = plan.error;
    } catch (error) { live.error = error.name; }
    writeFileSync(join(output, 'live.json'), JSON.stringify(live, null, 2) + '\n'); console.log(JSON.stringify(live));
  }
} finally {
  await browser.close(); server?.kill(); rmSync(temp, { recursive: true, force: true });
}
