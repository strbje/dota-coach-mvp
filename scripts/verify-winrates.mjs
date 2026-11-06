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
// Optional local cache of unmodified Steam CDN images for network-restricted browsers.
if (process.env.ASSET_DIR) await page.route('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/**', async (route) => {
  const match = new URL(route.request().url()).pathname.match(/\/(heroes|items)\/([a-z0-9_]+)\.png$/);
  if (!match) return route.continue();
  try { await route.fulfill({ contentType: 'image/png', body: readFileSync(join(process.env.ASSET_DIR, `${match[1]}-${match[2]}.png`)) }); }
  catch { await route.continue(); }
});
const portraitRequests = [];
page.on('request', (request) => { if (request.url().includes('/dota_react/heroes/')) portraitRequests.push(request.url()); });
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
  if (thisScenario === 'budget' && kind === 'participant' && request.matchId === 9000069) return;
  if (thisScenario === 'error') return route.fulfill({ status: 503, json: { error: 'provider_error' } });
  if (kind === 'plan') return route.fulfill({ json: planFor(request) });
  if (kind === 'batch') return route.fulfill({ json: request.matchIds.map((matchId, index) => {
    const entry = fixturePlan('series').matches[1]; entry.matchId = matchId; entry.match.matchId = matchId; entry.match.startTime -= (index + 2) * 86400; return entry;
  }) });
  if (thisScenario === 'retry-http' && request.accountId === 1001) return route.fulfill({ status: 503, json: { error: 'provider_error' } });
  const entry = fixturePlan('series').matches.find((item) => item.matchId === request.matchId);
  const asOf = request.basis === 'now' ? request.capturedAt : entry?.match.startTime ?? fixturePlan().matches[0].match.startTime - (request.matchId - 9000067) * 86400;
  let result = fixtureResult(request.accountId, request.matchId, asOf, request.accountId % 4, 5);
  if (thisScenario.startsWith('retry-') && request.accountId === 1001) {
    const empty = thisScenario === 'retry-failure';
    const recovered = thisScenario === 'retry-success';
    result = fixtureResult(request.accountId, request.matchId, asOf, empty ? 0 : recovered ? 40 : 30, empty ? 0 : 100);
    const fetchedAt = result.fetchedAt + (recovered ? 120 : empty ? 60 : -120);
    Object.assign(result, { fetchedAt, expiresAt: fetchedAt + 300 });
    Object.assign(result.history, { fetchedAt, expiresAt: fetchedAt + 300 });
    if (!recovered) {
      result.history.stop = empty ? 'provider_error' : 'timeout';
      Object.assign(result.samples[30], { complete: false, limitedBy: result.history.stop });
    }
    if (empty) {
      result.status = 'provider_error';
      Object.assign(result.samples[7], { complete: false, limitedBy: 'provider_error' });
    }
  }
  result.capturedAt = request.capturedAt; result.basis = request.basis;
  result.name = thisScenario === 'long-name' ? 'ОченьДлинноеИмяБезПробелов'.repeat(5) : `${thisScenario === 'stale' ? 'OLD' : 'Участник'} ${request.accountId}`;
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
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    if (document.getElementById('synthetic-note')) return;
    const note = document.createElement('div'); note.id = 'synthetic-note'; note.textContent = 'СИНТЕТИЧЕСКИЕ ДАННЫЕ · проверка интерфейса · не результаты реальных игроков';
    note.style.cssText = 'padding:8px 16px;background:#e0b568;color:#101416;font:12px system-ui;'; document.body.prepend(note);
  });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
async function load(name, id = '9000067', selectPlayer = true) {
  scenario = name;
  await editInputs();
  await page.getByLabel('ID матча', { exact: true }).fill(id);
  await page.getByRole('button', { name: /^(Загрузить сравнение|Обновить данные)$/ }).click();
  const player = page.getByLabel('Выбранный игрок', { exact: true });
  await player.waitFor();
  if (selectPlayer) await player.selectOption('0');
}
async function editInputs() {
  const edit = page.getByRole('button', { name: 'Изменить параметры / обновить', exact: true });
  if (await edit.isVisible()) await edit.click();
}
async function complete(count = 10) { await page.getByText(new RegExp(`Обработано ${count} из ${count} участников`)).waitFor(); }
async function headerGeometry() {
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole('banner').evaluate((header) => {
    const top = header.getBoundingClientRect().top;
    return [header.firstElementChild, header.querySelector('a'), header.querySelector('nav'), header.querySelector('button')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.height ? rect.y - top : 0, width: rect.width, height: rect.height };
    });
  });
}
const report = { synthetic: true, widths: [], checks: [], headerPositions: {} };
try {
  for (const [path, asset] of [['/', 'home-allstars'], ['/pre-game', 'pre-game-shop'], ['/winrates', 'winrates-river'], ['/post-match', 'post-match-battlefield']]) {
    await page.goto(`${base}${path}`);
    await page.locator('main').waitFor();
    const decoration = await page.locator('main').evaluate((main) => {
      const css = getComputedStyle(main.parentElement, '::before');
      return { image: css.backgroundImage, pointerEvents: css.pointerEvents };
    });
    assert.ok(decoration.image.includes(`${asset}.webp`), `${path} has its own scene`);
    assert.equal(decoration.pointerEvents, 'none');
    const image = await page.request.get(`${base}/images/${asset}.webp`);
    assert.equal(image.status(), 200); assert.match(image.headers()['content-type'], /image\/webp/);
    for (const width of [320, 390, 768, 900, 901, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1050 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits ${width}`);
      const geometry = await headerGeometry();
      assert.ok(geometry[1].height < 30, 'brand stays on one line');
      assert.equal(geometry[2].height, width <= 900 ? 0 : 44, 'desktop nav is a row; mobile uses an explicit menu');
      if (path === '/') report.headerPositions[width] = geometry;
      else assert.deepEqual(geometry, report.headerPositions[width], `${path}: logo and navigation controls must stay in the same position at ${width}px`);
      if (path !== '/winrates' && [390, 1440, 1920].includes(width)) await shot(`${asset}-${width}`);
    }
  }
  report.checks.push('four distinct local backgrounds including Allstars home, HTTP 200 WebP, non-interactive decoration; stable header geometry on every page at 320/390/768/900/901/1440/1920/2560 without wrapped brand/navigation');
  await page.setViewportSize({ width: 1440, height: 1050 });
  assert.equal(await page.getByRole('button', { name: /^(RU|EN)$/ }).count(), 0);
  let expected;
  for (const path of ['/', '/post-match', '/pre-game', '/winrates', '/']) {
    const link = page.getByRole('navigation').locator(`a[href="${path}"]`);
    await link.click(); await page.waitForURL((url) => url.pathname === path);
    assert.equal(await link.getAttribute('aria-current'), 'page');
    const geometry = await headerGeometry();
    if (!expected) expected = geometry; else assert.deepEqual(geometry, expected);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  const menu = page.getByRole('button', { name: 'Меню', exact: true });
  await menu.focus(); await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.getByRole('navigation').getByRole('link', { name: 'Разбор матча', exact: true }).click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await menu.click(); await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate((el) => el === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1050 });
  report.checks.push('stable header on all pages; explicit keyboard-operable mobile menu; Escape restores focus; no partial English switch');
  await page.goto(`${base}/winrates`);
  assert.equal(await page.getByLabel('Представление', { exact: true }).count(), 0);
  await page.getByLabel('ID игрока · Steam32', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('История участников', { exact: true }).inputValue(), 'match');
  await page.getByText('Игры за 7 и 30 дней до начала каждого матча. Более поздние игры не учитываются.', { exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `input form fits ${width}`);
    if (width >= 1440) {
      const boxes = await Promise.all(['ID игрока · Steam32', 'Твои матчи за', 'История участников'].map((label) => page.getByLabel(label, { exact: true }).boundingBox()));
      assert.ok(boxes.every((box) => Math.abs(box.y - boxes[0].y) < 1), 'inputs align independently of hint height');
      assert.ok((await page.locator('#wr-inputs').boundingBox()).width <= 1120, 'form has a readable desktop width');
    }
    if (width === 390 || width === 1440) await shot(`initial-${width}`);
  }
  await page.getByLabel('ID игрока · Steam32', { exact: true }).fill('4294967295');
  await page.keyboard.press('Enter');
  await page.getByText('Введи числовой Steam32 ID от 1 до 4294967294.', { exact: true }).waitFor();
  assert.equal(seen.length, 0, 'invalid account does not fetch');
  assert.equal(await page.getByLabel('ID игрока · Steam32', { exact: true }).getAttribute('aria-invalid'), 'true');
  report.checks.push('standalone account history without presentation selector; aligned form at 1440/1920; responsive 320/390/768; default historic cutoff explained; validation');
  await page.goto(`${base}/winrates?matchId=9000067`);
  await page.getByLabel('ID матча', { exact: true }).fill('9000067');
  await page.keyboard.press('Enter');
  await page.getByLabel('Выбранный игрок', { exact: true }).waitFor();
  assert.equal(seen.filter((item) => item.kind === 'participant').length, 0, 'no guessed default player');
  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('0');
  await complete();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    if (width <= 390) assert.ok(await page.locator('[class*="miniStats"] > span').evaluateAll((windows) => windows.length > 0 && windows.every((window) => {
      const [label, value] = window.children;
      return value.getBoundingClientRect().top >= label.getBoundingClientRect().bottom;
    })), `mobile window labels stay above percentage and sample at ${width}`);
    if (width >= 1440) {
      const allies = await page.getByRole('region', { name: 'Твоя сторона', exact: true }).boundingBox();
      const opponents = await page.getByRole('region', { name: 'Соперники', exact: true }).boundingBox();
      assert.equal(Math.round(allies.y), Math.round(opponents.y)); assert.ok(opponents.x > allies.x);
    }
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
  for (const sort of ['rate_desc', 'rate_asc', 'name']) {
    await page.getByLabel('Сортировка участников', { exact: true }).selectOption(sort);
    for (const side of ['Твоя сторона', 'Соперники']) {
      const group = page.getByRole('region', { name: side, exact: true });
      const values = sort === 'name' ? await group.locator('[class*=identity] strong').allTextContents() : (await group.locator('[class*=miniStats] > span:first-child strong').allTextContents()).map((value) => parseFloat(value));
      const expected = [...values].sort(sort === 'name' ? (a, b) => a.localeCompare(b, 'ru') : sort === 'rate_desc' ? (a, b) => b - a : (a, b) => a - b);
      assert.deepEqual(values, expected, `${sort} within ${side}`);
    }
  }
  await page.getByLabel('Сортировка участников', { exact: true }).selectOption('side');
  report.checks.push('rate ascending/descending and name sorting remain stable within each side');
  report.checks.push('explicit selection; adjacent 5/5 rosters including selected player with side averages; responsive layout; expandable sample details; UTF-8 CSV download');

  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('128');
  await complete();
  const summaries = await page.locator('details summary').allTextContents();
  assert.ok(summaries.some((value) => value.includes('Участник 1000'))); assert.ok(summaries.some((value) => value.includes('Участник 1005') && value.includes('выбранный игрок')));
  const focusTarget = page.getByRole('button', { name: 'Скачать CSV для Excel' });
  await focusTarget.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  assert.notEqual(await focusTarget.evaluate((element) => getComputedStyle(element).outlineStyle), 'none');
  report.checks.push('Dire selection includes selected player; keyboard submit and visible focus');

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

  const beforeAnonymous = seen.filter((item) => item.kind === 'participant').length;
  await load('partial', '9000067', false);
  assert.equal(await page.getByLabel('Выбранный игрок', { exact: true }).inputValue(), '', 'anonymous participant must not become an implicit selection');
  assert.equal(seen.filter((item) => item.kind === 'participant').length, beforeAnonymous, 'no history requests before explicit selection with anonymous players');
  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('0'); await complete();
  const anonymous = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Участник 2' }) }).locator('summary');
  assert.match(await anonymous.innerText(), /Axe/);
  assert.ok(portraitRequests.some((url) => url.endsWith('/heroes/axe.png')));
  if (process.env.ASSET_DIR) assert.match(await anonymous.locator('img').getAttribute('src'), /heroes\/axe.png$/);
  const zeroWins = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Участник 1008' }) }).locator('summary');
  assert.equal(await zeroWins.getByText('0%', { exact: true }).count(), 2);
  assert.equal(await zeroWins.getByText('0 / 5', { exact: true }).count(), 2);
  const cappedSummary = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Участник 1005' }) }).locator('summary');
  for (const days of ['7', '30', '7']) {
    await page.getByLabel('Средний винрейт команд за', { exact: true }).selectOption(days);
    assert.match(await cappedSummary.getByText('7 дней', { exact: true }).locator('..').innerText(), /Все доступные игры/);
    assert.match(await cappedSummary.getByText('30 дней', { exact: true }).locator('..').innerText(), /История неполная/);
    assert.equal(await cappedSummary.getByText('История неполная', { exact: true }).count(), 1);
    assert.equal(await cappedSummary.getByText('Данные получены', { exact: true }).count(), 0);
  }
  await page.getByText('История ограничена OpenDota', { exact: true }).waitFor();
  await page.getByText('Нет подходящих игр', { exact: true }).waitFor();
  await shot('partial-desktop');
  await page.setViewportSize({ width: 320, height: 1050 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'partial states fit 320px');
  await page.setViewportSize({ width: 390, height: 1050 }); await shot('partial-mobile');
  report.checks.push('anonymous roster waits for explicit selection; anonymous, restricted, empty, provider error and capped sample states');
  report.checks.push('7-day and 30-day coverage is labelled independently while switching the mean window 7/30/7');
  await page.goto(`${base}/winrates?matchId=9000067&accountId=1000`);
  await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click();
  await complete();
  assert.equal(await page.getByLabel('Выбранный игрок', { exact: true }).inputValue(), '0');
  await page.getByLabel('Выбранный игрок', { exact: true }).selectOption('1');
  await complete();
  assert.equal(await page.getByRole('link', { name: 'К истории игрока', exact: true }).getAttribute('href'), '/winrates', 'anonymous selection must not reuse the account supplied by the deep link');
  report.checks.push('anonymous selection does not reuse the deep-linked account when navigating to player history');

  await load('retry-sample'); await complete();
  const retry = page.getByRole('button', { name: 'Продолжить / повторить · 1', exact: true });
  await retry.waitFor();
  const retained = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Участник 1001' }) });
  await retained.locator('summary').click();
  assert.equal(await retained.getByText(/Победы \/ игры: 30 \/ 100/).count(), 2);
  const freshness = await retained.getByText(/^Самые ранние данные получены/).innerText();
  const allyCard = page.locator('[class*="metric"]').filter({ has: page.getByRole('heading', { name: 'Твоя сторона', exact: true }) });
  const previousMean = await allyCard.innerText();
  for (const failed of ['retry-failure', 'retry-http']) {
    scenario = failed;
    await retry.click(); await retry.waitFor();
    await retained.getByText('Ошибка обновления', { exact: true }).waitFor();
    assert.equal(await retained.getByText(/Победы \/ игры: 30 \/ 100/).count(), 2, 'both samples survive an empty failed retry');
    assert.equal(await retained.getByText(/^Самые ранние данные получены/).innerText(), freshness, 'failed retry cannot refresh source timestamps');
    assert.equal(await allyCard.innerText(), previousMean, 'retained participant remains in the same side mean');
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `refresh failure fits ${width}px`);
    assert.ok(await retained.locator('[class*="identity"]').evaluate((element) => element.getBoundingClientRect().width > innerWidth / 2), `coverage labels leave space for the participant name at ${width}px`);
  }
  await shot('refresh-failure-mobile');
  const retainedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV для Excel' }).click();
  const retainedCsv = readFileSync(await (await retainedDownload).path(), 'utf8');
  assert.match(retainedCsv, /Ошибка обновления/); assert.match(retainedCsv, /"30";"30";"100"/); assert.match(retainedCsv, /Ошибка OpenDota/);
  scenario = 'retry-success'; await retry.click();
  await retry.waitFor({ state: 'hidden' });
  await retained.getByText(/Победы \/ игры: 40 \/ 100/).first().waitFor();
  assert.equal(await retained.getByText('Ошибка обновления', { exact: true }).count(), 0);
  assert.notEqual(await retained.getByText(/^Самые ранние данные получены/).innerText(), freshness);
  assert.notEqual(await allyCard.innerText(), previousMean); assert.match(await allyCard.innerText(), /28%/);
  report.checks.push('empty API and HTTP retry failures preserve 30/100, source freshness, side means and CSV; successful retry replaces data and clears the refresh error');

  await page.getByRole('link', { name: 'К истории игрока', exact: true }).click();
  await page.getByLabel('ID игрока · Steam32', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('ID игрока · Steam32', { exact: true }).inputValue(), '1000');
  assert.equal(await page.getByRole('region', { name: 'Твоя сторона', exact: true }).count(), 0, 'navigation discards the previous match report');
  scenario = 'ready'; await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click();
  await complete(30);
  await page.getByRole('heading', { name: 'История до начала матча', exact: true }).waitFor();
  await page.getByText('Для каждого матча — свои предыдущие 7 и 30 дней.', { exact: true }).waitFor();
  await editInputs();
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 1050 }); await shot(`history-controls-${width}`); }
  await page.getByText('Повторные встречи · 9 игроков', { exact: true }).waitFor();
  await page.getByText('Повторные встречи · 9 игроков', { exact: true }).click();
  assert.equal(await page.locator('table img').count(), 0, 'unique series people never get an arbitrary hero');
  assert.equal(await page.getByText('Аккаунт и матчи', { exact: true }).count(), 9);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1050 }); await shot('series-desktop');
  await page.getByRole('button', { name: 'Следующие 3 матча · осталось 2', exact: true }).click();
  await complete(50);
  const batches = seen.filter((item) => item.kind === 'batch');
  assert.equal(batches.length, 1); assert.deepEqual(batches[0].request.matchIds, [9000070, 9000071]);
  const times = new Set(seen.filter((item) => item.kind === 'participant').map((item) => item.request.capturedAt)); assert.equal(times.size, 1);
  report.checks.push('bounded first series; continuation by stable Match IDs; same capture time; final unique-player table');

  await page.route('**/apps/dota2/images/**', (route) => route.abort());
  scenario = 'long-name'; await page.goto(`${base}/winrates?matchId=9000067`); await load('long-name'); await complete();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `long names overflow ${width}`);
  }
  assert.equal(await page.locator('[class*=heroPortrait] img').count(), 0, 'failed portraits use safe fallback');
  report.checks.push('hero portraits from canonical roster metadata; anonymous hero retained; real 0% with 0/5; unique series people without arbitrary hero; long names and unavailable images');
  await page.getByRole('link', { name: 'К истории игрока', exact: true }).click();
  await page.getByLabel('ID игрока · Steam32', { exact: true }).fill('1000');
  scenario = 'empty'; await editInputs(); await page.getByRole('button', { name: /^(Загрузить сравнение|Обновить данные)$/ }).click();
  await page.getByText(/Подходящих матчей в полученной выборке нет/).waitFor(); await shot('empty');
  scenario = 'error'; await editInputs(); await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
  await page.getByText(/Ошибка OpenDota. Попробуй/).waitFor(); await shot('error');

  scenario = 'ready'; await page.goto(`${base}/winrates?matchId=9000067&accountId=1000`);
  assert.equal(await page.getByLabel('ID матча', { exact: true }).inputValue(), '9000067');
  await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click(); await complete();
  assert.equal(await page.getByLabel('Выбранный игрок', { exact: true }).inputValue(), '0');
  assert.equal(await page.locator('nav a[aria-current="page"]').textContent(), 'Винрейт игроков');
  report.checks.push('empty/error states; post-match deep link preselects account; active navigation');
  await editInputs(); await page.getByLabel('История участников', { exact: true }).selectOption('now');
  await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click(); await complete();
  await page.getByRole('heading', { name: 'История на сегодня', exact: true }).waitFor();
  await page.getByText(/Общая граница:/).waitFor();
  await page.getByText(/Загрузка начата/).waitFor();
  await page.getByText(/История за 7 дней до .*Сам этот матч исключён/).waitFor();
  const currentRequests = seen.filter((item) => item.kind === 'participant' && item.request.basis === 'now');
  assert.equal(currentRequests.length, 10); assert.equal(new Set(currentRequests.map((item) => item.request.capturedAt)).size, 1);
  report.checks.push('current mode is separately labelled and all participants share one capture time');

  await page.unroute('**/apps/dota2/images/**');
  await page.clock.install();
  await page.goto(`${base}/winrates`);
  await page.getByLabel('ID игрока · Steam32', { exact: true }).fill('1000');
  scenario = 'budget'; await page.getByRole('button', { name: 'Загрузить сравнение', exact: true }).click();
  await page.getByText(/Обработано 20 из 30 участников/).waitFor();
  const captureBefore = seen.filter((item) => item.kind === 'participant').at(-1).request.capturedAt;
  await page.clock.fastForward(45001);
  await page.getByText(/Пауза после 45 секунд/).waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 0, 'no endless progress after the budget');
  const thirdMatch = page.getByRole('group', { name: 'Твои матчи' }).getByRole('button', { name: /матч 9000069/i });
  assert.match(await thirdMatch.innerText(), /0\/10 обработано.*не загружено полностью/);
  await thirdMatch.click();
  assert.equal(await page.getByText('Не загружено', { exact: true }).count(), 10);
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 1000 }); await shot(`series-paused-${width}`); }
  const requestStart = seen.length;
  scenario = 'ready'; await page.getByRole('button', { name: 'Продолжить / повторить · 10', exact: true }).click();
  await complete(30);
  const resumed = seen.slice(requestStart).filter((item) => item.kind === 'participant');
  assert.equal(resumed.length, 10);
  assert.ok(resumed.every((item) => item.request.matchId === 9000069 && item.request.capturedAt === captureBefore));
  assert.equal(await page.getByRole('button', { name: /^Продолжить \/ повторить/ }).count(), 0);
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 1000 }); await shot(`series-completed-${width}`); }
  report.checks.push('45-second budget explicitly pauses the third match; no stuck progress; resume fetches only missing players and keeps capture time and first two matches');

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
} catch (error) {
  console.error(error);
  await shot('failure').catch(() => undefined);
  throw error;
} finally {
  await browser.close(); server?.kill(); rmSync(temp, { recursive: true, force: true });
}
