// Optional local browser checks. Requires Playwright in the environment; no production dependency.
// Start the app on BASE_URL first. Responses are SYNTHETIC (gold excerpts have separate live provenance),
// produced by real adapter/rules. This does not exercise live API role validation.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const temp = join(root, '.tmp-post-match-v2');
const output = process.env.EVIDENCE_DIR || join(root, 'docs/evidence/post-match-v2');
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });
mkdirSync(output, { recursive: true });
writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, rootDir: '../src', outDir: '.', module: 'commonjs', moduleResolution: 'node', target: 'es2022' }, files: ['../src/lib/dota/rules/postMatch/postMatchV2.fixture.ts', '../src/lib/dota/normalize/goldReasons.fixture.ts'], include: [] }));
const compile = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
if (compile.status !== 0) throw new Error('Fixture compilation failed');
mkdirSync(join(temp, 'node_modules/@'), { recursive: true });
symlinkSync(join(temp, 'lib'), join(temp, 'node_modules/@/lib'), 'junction');
const { syntheticPostMatch } = require(join(temp, 'lib/dota/rules/postMatch/postMatchV2.fixture.js'));
const { normalizeGoldReasons } = require(join(temp, 'lib/dota/normalize/goldReasons.js'));
const { normalizeGoldReasonConstants } = require(join(temp, 'lib/dota/providers/opendotaConstantsProvider.js'));
const { GOLD_REASON_CONTROLS } = require(join(temp, 'lib/dota/normalize/goldReasons.fixture.js'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{}');
const now = Math.floor(Date.now() / 1000);
let fixtures;
try {
  fixtures = {
    product: await syntheticPostMatch({ product: true, farm: 'complete', partial: true }),
    productPartial: await syntheticPostMatch({ product: true, farm: 'partialOnly', partial: true }),
    xpOnly: await syntheticPostMatch({ resources: 'xp' }), goldOnly: await syntheticPostMatch({ resources: 'gold' }),
    ready: await syntheticPostMatch(), temporal: await syntheticPostMatch({ temporal: true }), low: await syntheticPostMatch({ lowLane: true }),
    partial: await syntheticPostMatch({ partial: true }), empty: await syntheticPostMatch({ empty: true }),
    farmComplete: await syntheticPostMatch({ farm: 'complete' }), farmPartial: await syntheticPostMatch({ farm: 'partial' }),
    farmPartialOnly: await syntheticPostMatch({ farm: 'partialOnly' }), farmGap: await syntheticPostMatch({ farm: 'gap' }),
    next: await syntheticPostMatch({ matchId: 9000067, startTime: now + 60, lastHitsAt10: 58 }),
    missing: await syntheticPostMatch({ matchId: 9000068, startTime: now + 120, empty: true }),
    third: await syntheticPostMatch({ matchId: 9000069, startTime: now + 180, lastHitsAt10: 50 }),
    fourth: await syntheticPostMatch({ matchId: 9000070, startTime: now + 240, lastHitsAt10: 56 }),
    other: await syntheticPostMatch({ matchId: 9000071, startTime: now + 300, accountId: 1000099 })
  };
  fixtures.ready.analysis.goldReasons = normalizeGoldReasons(GOLD_REASON_CONTROLS[0].raw, normalizeGoldReasonConstants(null));
  for (const [name, raw] of Object.entries({ unknownGold: { 98: 100, 99: -100 }, invalidGold: { 14: 0, 15: '25', 16: null } })) {
    fixtures[name] = structuredClone(fixtures.ready);
    fixtures[name].analysis.goldReasons = normalizeGoldReasons(raw, normalizeGoldReasonConstants(null));
  }
  fixtures.missing.analysis.training.observation = { ...fixtures.next.analysis.training.observation, matchId: 9000068, startTime: now + 120, lastHitsAt10: undefined };
} finally { globalThis.fetch = originalFetch; }

// Presentation edge cases reuse the assembled fixture without provider calls.
fixtures.fourthMissing = structuredClone(fixtures.fourth);
delete fixtures.fourthMissing.analysis.training.observation.lastHitsAt10;
delete fixtures.fourthMissing.analysis.training.goal;
fixtures.noDeaths = structuredClone(fixtures.ready);
delete fixtures.noDeaths.analysis.laneFacts.deathsAt10;
fixtures.rescored = structuredClone(fixtures.ready);
fixtures.rescored.analysis.grades.fights.score = 77; fixtures.rescored.analysis.grades.map.score = 65;

const server = process.env.START_SERVER === '1'
  ? spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }) : null;
if (server) await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { server.kill(); reject(new Error('Server startup timed out')); }, 30000);
  server.stdout.on('data', (data) => { if (data.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
  server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited ${code}`)); });
  server.on('error', reject);
});
const chromiumModule = process.env.CHROMIUM_MODULE_PATH ? require(process.env.CHROMIUM_MODULE_PATH) : null;
const localChromium = chromiumModule?.default ?? chromiumModule;
const browser = await chromium.launch(localChromium
  ? { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || await localChromium.executablePath(), args: localChromium.args }
  : { headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
// Optional local cache of unmodified Steam CDN images for network-restricted browsers.
if (process.env.ASSET_DIR) await page.route('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/**', async (route) => {
  const match = new URL(route.request().url()).pathname.match(/\/(heroes|items)\/([a-z0-9_]+)\.png$/);
  if (!match) return route.continue();
  try { await route.fulfill({ contentType: 'image/png', body: readFileSync(join(process.env.ASSET_DIR, `${match[1]}-${match[2]}.png`)) }); }
  catch { await route.continue(); }
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let scenario = 'ready';
let delay = 0;
let parseCalls = 0;
let parseFails = false;
const roleErrors = {
  STRATZ_NOT_CONFIGURED: /подключение к STRATZ не настроено/,
  STRATZ_AUTH_FAILED: /отклонил авторизацию/,
  STRATZ_TIMEOUT: /STRATZ не успел ответить/,
  STRATZ_UNAVAILABLE: /STRATZ временно недоступен/,
  STRATZ_INVALID_RESPONSE: /неполный или некорректный ответ/,
  STRATZ_PLAYER_MISMATCH: /Не удалось сопоставить выбранного игрока/,
  POST_MATCH_ROLE_UNCONFIRMED: /Это не означает, что ты играл не на керри/
};
const players = Array.from({ length: 10 }, (_, index) => ({ playerSlot: index < 5 ? index : 123 + index, heroId: index === 0 ? 42 : 1 + index, heroName: index === 0 ? 'Wraith King' : `Герой ${index + 1}`, playerName: index === 0 ? 'Игрок · пример' : `Игрок ${index + 1}`, accountId: index === 0 ? 1000066 : 1000066 + index, isRadiant: index < 5, kills: 8, deaths: 5, assists: 11 }));
await page.route('**/api/post-match/**', async (route) => {
  const selectedScenario = scenario;
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/parse')) { parseCalls++; return route.fulfill({ status: parseFails ? 429 : 200, json: parseFails ? { error: 'rate_limit' } : { jobId: 'synthetic-parse-job' } }); }
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (selectedScenario === 'network-error') return route.fulfill({ status: 503, json: { errorCode: 'OPENDOTA_UNAVAILABLE' } });
  if (path.endsWith('/players')) return route.fulfill({ json: { players: selectedScenario === 'empty-roster' ? [] : selectedScenario === 'partial' ? players.slice(0, 7) : players } });
  const request = route.request().postDataJSON();
  if (selectedScenario in roleErrors) return route.fulfill({ status: 503, json: { errorCode: selectedScenario } });
  if (request.selector.playerSlot !== 0) return route.fulfill({ status: 422, json: { errorCode: 'UNSUPPORTED_POST_MATCH_ROLE' } });
  if (selectedScenario === 'malformed') return route.fulfill({ json: { analysis: { matchId: request.matchId } } });
  return route.fulfill({ json: fixtures[selectedScenario] });
});

async function load(name, matchId = 9000066) {
  scenario = name;
  const change = page.getByRole('button', { name: 'Матч и состав · изменить' });
  if (await change.isVisible()) await change.click();
  await page.getByLabel('Match ID', { exact: true }).fill(String(matchId));
  await page.getByRole('button', { name: 'Загрузить игроков', exact: true }).click();
  await page.getByLabel('Игрок', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Разобрать матч', exact: true }).click();
}
async function reportReady() { await page.getByRole('heading', { name: 'Личный план', exact: true }).waitFor(); }
async function snapshot(name) {
  await page.evaluate(() => {
    if (document.getElementById('synthetic-evidence')) return;
    const note = document.createElement('div'); note.id = 'synthetic-evidence';
    note.textContent = 'СИНТЕТИЧЕСКИЕ ДАННЫЕ · проверка интерфейса · не реальный контрольный матч';
    note.style.cssText = 'padding:8px 16px;background:#e0b568;color:#101416;font:12px system-ui;';
    document.body.prepend(note);
  });
  if (name.startsWith('gold-') || name.startsWith('farm-')) {
    const isFarm = name.startsWith('farm-');
    const panel = page.getByRole('heading', { name: isFarm ? 'Фарм по времени' : 'Источники золота', exact: true }).locator('..');
    await panel.evaluate((element, farm) => {
      const note = document.createElement('p'); note.dataset.synthetic = 'gold';
      note.textContent = farm ? 'СИНТЕТИЧЕСКИЕ ДАННЫЕ · проверка фарма по времени · не реальный матч' : 'СИНТЕТИЧЕСКИЙ ОТЧЁТ · контрольный фрагмент золота #34 · не приёмка live API';
      element.prepend(note);
    }, isFarm);
    await panel.screenshot({ path: join(output, `${name}.png`) });
    await panel.locator('[data-synthetic="gold"]').evaluate((element) => element.remove());
  } else await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
const results = { synthetic: true, widths: [], checks: [] };
try {
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:3000'}/post-match`);
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await snapshot('initial');
  for (const width of [320, 390, 768, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: width < 1000 ? 900 : 1080 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `entry overflow at ${width}`);
    assert.ok((await page.locator('main').boundingBox()).width <= 1440);
    assert.ok((await page.locator('#match-selection').boundingBox()).width <= 1120);
    if (width === 390 || width === 1920) await snapshot(`entry-${width}`);
  }
  const decoration = await page.locator('main').evaluate((element) => {
    const style = getComputedStyle(element.parentElement, '::before');
    return { image: style.backgroundImage, pointerEvents: style.pointerEvents };
  });
  assert.match(decoration.image, /post-match-battlefield.webp/);
  assert.equal(decoration.pointerEvents, 'none');
  const background = await page.request.get(`${process.env.BASE_URL || 'http://127.0.0.1:3000'}/images/post-match-battlefield.webp`);
  assert.equal(background.status(), 200);
  assert.match(background.headers()['content-type'], /image\/webp/);
  for (const [code, message] of Object.entries(roleErrors)) {
    await load(code);
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    assert.equal(await page.getByLabel('Игрок', { exact: true }).inputValue(), '0');
    assert.equal(await page.getByRole('heading', { name: 'Личный план', exact: true }).count(), 0);
  }
  await load('STRATZ_TIMEOUT');
  await page.getByRole('alert').filter({ hasText: roleErrors.STRATZ_TIMEOUT }).waitFor();
  for (const width of [390, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 900 : 1080 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `error overflow at ${width}`);
    await snapshot(`role-timeout-${width}`);
  }
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /STRATZ did not respond in time/ }).waitFor();
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  scenario = 'ready';
  await page.getByRole('button', { name: 'Разобрать матч', exact: true }).focus();
  await page.keyboard.press('Enter');
  await reportReady();
  assert.equal(await page.locator('#match-selection').getByRole('alert').count(), 0);
  results.checks.push('role failure messages RU/EN; selection preserved and successful keyboard retry; entry <=1120 and report <=1440; six viewport widths; local decorative background loads without intercepting input');
  await load('ready'); await reportReady();
  assert.equal(await page.getByRole('link', { name: 'Доля побед участников', exact: true }).getAttribute('href'), '/winrates?matchId=9000066&accountId=1000066');
  assert.equal(await page.getByRole('heading', { name: 'Wraith King', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: width < 1000 ? 900 : 1100 });
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth }));
    assert.ok(overflow.body <= overflow.viewport, `horizontal overflow at ${width}: ${JSON.stringify(overflow)}`);
    assert.ok((await page.locator('main').boundingBox()).width <= 1440, `report too wide at ${width}`);
    results.widths.push(width);
    await snapshot(`ready-${width}`);
    if (width <= 1050) {
      await page.getByText('Ключевые факты · 1', { exact: true }).click();
      await page.getByRole('button', { name: 'Посмотреть отрезок ↗' }).first().waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `expanded facts overflow at ${width}`);
      if (width === 390) await snapshot('ready-expanded-390');
      await page.getByText('Ключевые факты · 1', { exact: true }).click();
    }
  }
  // #34: product rendering of a live excerpt in a synthetic report, then synthetic edge cases.
  const goldPanel = page.getByRole('heading', { name: 'Источники золота', exact: true }).locator('..');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const details = page.getByText('Подробности и источники', { exact: true });
    if (!await goldPanel.isVisible()) { await details.focus(); await page.keyboard.press('Enter'); }
    const income = goldPanel.getByRole('region', { name: 'Доходы', exact: true });
    const losses = goldPanel.getByRole('region', { name: 'Потери и расходы', exact: true });
    assert.match(await income.innerText(), /Нейтралы: \+14\s350 золота/);
    assert.match(await income.innerText(), /Рошан: \+1\s033 золота/);
    assert.match(await income.innerText(), /Курьеры: \+305 золота/);
    assert.match(await income.innerText(), /Личная награда за курьера: \+155 золота/);
    assert.match(await income.innerText(), /Источник не определён: \+800 золота/);
    assert.match(await losses.innerText(), /Потери при смерти: -6\s325 золота/);
    assert.doesNotMatch(await goldPanel.innerText(), /Другие источники|Roshan|unknown_|gold_reasons/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `gold breakdown overflow at ${width}`);
    if (width === 390 || width === 1440) await snapshot(`gold-${width}`);
  }
  for (const name of ['unknownGold', 'invalidGold']) {
    await load(name); await reportReady();
    if (!await goldPanel.isVisible()) await page.getByText('Подробности и источники', { exact: true }).click();
    const text = await goldPanel.innerText();
    if (name === 'unknownGold') {
      assert.match(text, /Источник не определён: \+100/);
      assert.match(text, /Причина потерь не определена: -100/);
      assert.match(text, /Разбивка неполная/);
    } else if (name === 'invalidGold') {
      assert.match(text, /Нейтралы: 0 золота/);
      assert.doesNotMatch(text, /Рошан:|Курьеры:/);
      assert.match(text, /Разбивка неполная/);
    } else assert.match(text, /не вернул числовую разбивку/);
  }
  results.checks.push('gold: independent income/loss/unknown, unknown-only net zero, confirmed zero, invalid/missing values, keyboard disclosure; 320/390/768/1440');
  // Farm aggregation uses the real rules/adapter path with explicitly synthetic inputs.
  await load('farmComplete'); await reportReady();
  const farmPanel = page.getByRole('heading', { name: 'Фарм по времени', exact: true }).locator('..');
  const farmRows = farmPanel.getByRole('list', { name: 'Отрезки фарма' }).locator(':scope > li');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await snapshot(`farm-${width}`);
  }
  await farmPanel.getByText('Точные значения и источники · 8', { exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await farmRows.count(), 8);
  assert.match(await farmPanel.innerText(), /темп снизился с 9 до 3/);
  assert.match(await farmRows.nth(5).innerText(), /0 добито · 0 в минуту/);
  await farmRows.nth(4).locator('summary').focus(); await page.keyboard.press('Enter');
  assert.match(await farmRows.nth(4).innerText(), /Тип не определён\s+3/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `farm overflow at ${width}`);
    if (width === 390 || width === 1440) await snapshot(`farm-expanded-${width}`);
  }
  for (const label of ['Покупки', 'Мои смерти', 'Объекты', 'Линия к 10:00']) await page.getByLabel(label, { exact: true }).uncheck();
  await page.keyboard.press('Tab');
  await farmPanel.getByRole('button', { name: 'Посмотреть события отрезка', exact: true }).focus();
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'team-advantage');
  const selectedFarmEvents = page.getByRole('region', { name: 'Выбранный отрезок', exact: true });
  assert.match(await selectedFarmEvents.innerText(), /20:00–25:00/);
  assert.match(await selectedFarmEvents.innerText(), /Black King Bar/);
  assert.match(await selectedFarmEvents.innerText(), /Твоя смерть/);
  for (const label of ['Покупки', 'Мои смерти', 'Объекты']) assert.equal(await page.getByLabel(label, { exact: true }).isChecked(), true);
  await farmPanel.getByRole('button', { name: 'События 25:00–30:00', exact: true }).click();
  await selectedFarmEvents.getByRole('heading', { name: /^25:00–30:00/ }).waitFor();
  assert.match(await selectedFarmEvents.innerText(), /25:00–30:00/);
  for (const name of ['farmPartial', 'farmPartialOnly', 'farmGap']) {
    await load(name); await reportReady();
    const windows = farmPanel.locator('details').first();
    if (!await windows.evaluate((element) => element.open)) await windows.locator(':scope > summary').click();
    assert.equal(await farmPanel.getByRole('button', { name: 'Посмотреть события отрезка', exact: true }).count(), 0);
    const copy = await farmPanel.innerText();
    if (name === 'farmGap') assert.match(copy, /только за 20:00–22:00/);
    else assert.match(copy, /Разбивка по типам неполная/);
    if (name === 'farmPartialOnly') assert.match(copy, /Число добиваний недоступно/);
    if (name === 'farmPartial') {
      assert.match(copy, /минутные срезы OpenDota/);
      assert.match(copy, /только за 35:00–38:00/);
    }
  }
  await load('empty'); await reportReady();
  assert.equal(await goldPanel.count(), 0, 'no empty gold card');
  assert.equal(await page.getByText('Как проверяем цель', { exact: true }).count(), 0, 'no instructions for a nonexistent challenge');
  assert.equal(await farmPanel.count(), 0);
  await page.getByText(/Фарм по времени недоступен/).waitFor();
  results.checks.push('farm: largest comparable drop; category/unknown breakdown; confirmed zero vs missing; partial events and no-series fallback; gaps/truncated end; keyboard filters/focus and selected-window navigation; 320/390/768/1440');
  await load('ready'); await reportReady();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel('Линия к 10:00', { exact: true }).uncheck();
  if (!await page.getByText('Ключевые факты · 1', { exact: true }).locator('..').evaluate((element) => element.open)) await page.getByText('Ключевые факты · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Посмотреть отрезок ↗' }).nth(1).click();
  await page.waitForFunction(() => document.activeElement?.id === 'lane-at-ten');
  assert.equal(await page.getByLabel('Линия к 10:00', { exact: true }).isChecked(), true);
  assert.equal(await page.locator('#lane-at-ten').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'lane-at-ten');
  await page.getByLabel('Покупки', { exact: true }).uncheck();
  await page.getByLabel('Мои смерти', { exact: true }).uncheck();
  await page.getByLabel('Объекты', { exact: true }).uncheck();
  assert.equal(await page.getByRole('group', { name: 'Отметки событий', exact: true }).getByRole('button').count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Твои ключевые покупки', exact: true }).isVisible(), true);
  await load('temporal'); await reportReady();
  const chart = page.locator('#team-advantage');
  assert.match(fixtures.temporal.analysis.review.summary, /3:00/);
  assert.doesNotMatch(fixtures.temporal.analysis.review.summary, /38:00/);
  assert.match(fixtures.temporal.analysis.review.coverageNote, /конец матча не покрыт/);
  assert.equal(await chart.locator('polyline').count(), 1, 'the isolated point and separate segment must not connect across a missing gold minute');
  assert.equal(await chart.locator('circle').count(), 1);
  assert.match(await chart.innerText(), /-0:30/);
  await chart.getByRole('button', { name: 'Опыт', exact: true }).click();
  assert.equal(await chart.locator('polyline').count(), 1);
  assert.equal(await chart.locator('circle').count(), 0);
  await chart.getByText(/^Все события по фильтрам/).click();
  const late = chart.getByRole('button', { name: /37:05 · Твоя смерть/ });
  await late.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'death-4');
  await chart.getByRole('button', { name: /23:25 · Black King Bar/ }).click();
  assert.match(await chart.getByRole('region', { name: 'Выбранный отрезок' }).innerText(), /Black King Bar/);
  assert.match(await chart.getByRole('region', { name: 'Выбранный отрезок' }).innerText(), /Разрушено строение Dire/);
  await chart.getByText(/^Все события по фильтрам/).click();
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `temporal overflow at ${width}`);
    const rects = await chart.getByRole('group', { name: 'Отметки событий', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.map((button) => { const r = button.getBoundingClientRect(); return { x: r.x, right: r.right }; }));
    assert.ok(rects.every((r, i) => i === 0 || r.x >= rects[i - 1].right), `event overlap at ${width}`);
    if (width === 390 || width === 1440) await snapshot(`timeline-${width}`);
  }
  for (const label of ['Покупки', 'Мои смерти', 'Объекты', 'Линия к 10:00']) await page.getByLabel(label, { exact: true }).uncheck();
  await page.getByText('Все события скрыты фильтрами.', { exact: true }).waitFor();
  await load('ready'); await reportReady();
  for (const label of ['Покупки', 'Мои смерти', 'Объекты', 'Линия к 10:00']) await page.getByLabel(label, { exact: true }).uncheck();
  if (!await page.getByText('Ключевые факты · 1', { exact: true }).locator('..').evaluate((element) => element.open)) await page.getByText('Ключевые факты · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Посмотреть отрезок ↗' }).first().click();
  await page.waitForFunction(() => document.activeElement?.id === 'team-advantage');
  for (const label of ['Покупки', 'Мои смерти', 'Объекты']) assert.equal(await page.getByLabel(label, { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Линия к 10:00', { exact: true }).isChecked(), false);
  await load('partial'); await reportReady();
  assert.ok(await chart.getByRole('group', { name: 'Отметки событий', exact: true }).getByRole('button').count() > 0, 'events remain available without resources');
  await load('noDeaths'); await reportReady();
  assert.match(await page.getByText('Смерти', { exact: true }).locator('..').innerText(), /Нет данных/);
  await load('rescored'); await reportReady();
  assert.equal(await page.getByText('77', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('65', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('Без оценки', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Сильный показатель эффективности линии', { exact: true }).count(), 0);

  await load('product'); await reportReady();
  assert.equal(await page.getByRole('region', { name: 'Оценки', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('group', { name: 'Смерти по времени' }).isVisible(), true);
  assert.equal(await page.getByText('Как проверяем цель', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).waitFor({ state: 'visible' });
  assert.equal(fixtures.product.analysis.training.goal.baseline, 51);
  assert.equal(fixtures.product.analysis.training.goal.target, 56);
  assert.equal(fixtures.product.analysis.training.observation.lastHitsAt10Source, 'stratz');
  assert.equal(await chart.getByRole('heading', { name: 'События матча', exact: true }).count(), 1);
  assert.equal(await chart.getByRole('button', { name: /^(Золото|Опыт)$/ }).count(), 0);
  assert.equal(await chart.getByLabel('Покупки', { exact: true }).count(), 0);
  assert.equal(await chart.getByLabel('Объекты', { exact: true }).count(), 0);
  assert.equal(parseCalls, 0, 'viewing a report never automatically requests a parse');
  const bars = farmPanel.getByRole('list', { name: 'Темп фарма по отрезкам' }).getByRole('button');
  assert.equal(await bars.count(), 8);
  assert.equal(await bars.first().isVisible(), true);
  assert.equal(await farmPanel.getByRole('list', { name: 'Типы добиваний' }).isVisible(), true);
  await page.getByRole('button', { name: 'Открыть отрезок фарма', exact: true }).click();
  await selectedFarmEvents.getByRole('heading', { name: /^20:00–25:00/ }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Твои ключевые покупки', exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator('main').innerText(), /перцентил|Средние STRATZ|координаты в выводах/);
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `product partial ${width}`);
    if (width === 390 || width === 1440) await snapshot(`product-${width}`);
  }
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).click();
  await page.getByText('Челлендж принят · 0/3').waitFor();
  await page.getByRole('button', { name: 'Снять челлендж', exact: true }).click();
  parseFails = true;
  await page.getByRole('button', { name: 'Запросить подробные данные', exact: true }).click();
  await page.getByText(/Лимит запросов OpenDota/).waitFor();
  parseFails = false;
  await page.getByRole('button', { name: 'Запросить подробные данные', exact: true }).click();
  await page.getByText(/Запрос отправлен/).waitFor();
  assert.equal(parseCalls, 2);
  assert.equal(await page.getByRole('button', { name: 'Запросить подробные данные', exact: true }).count(), 0, 'queue acceptance does not enqueue again');
  scenario = 'STRATZ_TIMEOUT';
  await page.getByRole('button', { name: 'Обновить разбор', exact: true }).click();
  await page.getByText(/Не удалось обновить разбор. Показаны ранее полученные данные/).waitFor();
  assert.equal(await farmPanel.isVisible(), true, 'refresh failure keeps the received report');
  scenario = 'product';
  await page.getByRole('button', { name: 'Обновить разбор', exact: true }).click();
  await page.getByText(/Не удалось обновить разбор/).waitFor({ state: 'hidden' });
  assert.equal(await chart.locator('svg').count(), 0, 'queue acceptance does not invent parsed data');
  assert.equal(await page.getByText(/Запрос отправлен/).count(), 1);
  scenario = 'ready';
  await page.getByRole('button', { name: 'Обновить разбор', exact: true }).click();
  await chart.getByRole('heading', { name: 'Как менялась игра', exact: true }).waitFor();
  assert.equal(await chart.locator('svg').count(), 1);
  assert.equal(await page.getByText(/Запрос отправлен/).count(), 0);
  const goldPoints = await chart.locator('polyline').first().getAttribute('points');
  await chart.getByRole('button', { name: 'Опыт', exact: true }).click();
  assert.notEqual(await chart.locator('polyline').first().getAttribute('points'), goldPoints);
  await chart.getByRole('button', { name: 'Золото', exact: true }).click();
  assert.equal(await chart.locator('polyline').first().getAttribute('points'), goldPoints);
  assert.equal(parseCalls, 2, 'refresh only rereads the analysis');
  for (const name of ['xpOnly', 'goldOnly']) {
    await load(name); await reportReady();
    assert.equal(await chart.locator('svg').count(), 1);
    assert.equal(await chart.getByRole('group', { name: 'Показатель команды' }).count(), 0, 'a single available series needs no dead switch');
    assert.match(await chart.locator('svg desc').textContent(), name === 'xpOnly' ? /опыта/ : /золота/);
  }
  await load('productPartial'); await reportReady();
  assert.equal(await page.getByRole('button', { name: 'Принять челлендж', exact: true }).count(), 0, 'partial events cannot fabricate a checkpoint');
  assert.equal(await page.getByText('Как проверяем цель', { exact: true }).count(), 0);
  results.checks.push('complete STRATZ events supply and accept the LH10 goal; partial events remain unknown; events-only timeline has no dead metric/event controls; one real metric remains visible; explicit parse rate limit/retry, queued is not parsed, failed refresh retains report, successful refresh restores working gold/XP switches');

  // Force the primary CDN to fail, then the secondary, without conflating missing purchases with missing pixels.
  await page.route('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/**', (route) => route.abort());
  await page.route('https://cdn.steamstatic.com/apps/dota2/images/dota_react/items/**', (route) => route.fulfill({ contentType: 'image/png', body: process.env.ASSET_DIR ? readFileSync(join(process.env.ASSET_DIR, `items-${new URL(route.request().url()).pathname.split('/').at(-1)}`)) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
  await page.goto('about:blank');
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:3000'}/post-match`);
  await load('ready'); await reportReady();
  const purchasePanel = page.getByRole('heading', { name: 'Твои ключевые покупки', exact: true }).locator('..').locator('..');
  await purchasePanel.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.item-timeline-card img')].length > 0 && [...document.querySelectorAll('.item-timeline-card img')].every((img) => img.complete && img.naturalWidth > 0 && img.src.startsWith('https://cdn.steamstatic.com/')));
  await page.route('https://cdn.steamstatic.com/apps/dota2/images/dota_react/items/**', (route) => route.abort());
  await page.goto('about:blank');
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:3000'}/post-match`);
  await load('partial'); await reportReady();
  await purchasePanel.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.item-timeline-card .item-fallback').length === 4);
  assert.match(await purchasePanel.innerText(), /Radiance/);
  results.checks.push('item images recover on secondary CDN; if both fail item names and times remain visible');
  await load('ready'); await reportReady();
  await page.setViewportSize({ width: 1440, height: 1100 });
  results.checks.push('unified time domain; pregame and post-telemetry events; independent filters; hidden evidence revealed with focus; clustered collision-free markers; keyboard exact-event selection; independent gold/XP gaps; unknown deaths; preserved fight/economy grades');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).focus();
  const outline = await page.getByRole('button', { name: 'Принять челлендж', exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle);
  assert.notEqual(outline, 'none');
  await page.keyboard.press('Enter');
  await page.getByText('Челлендж принят · 0/3').waitFor();
  await load('next', 9000067); await reportReady();
  await page.getByText('Челлендж принят · 1/3').waitFor();
  await page.reload(); await load('next', 9000067); await reportReady();
  await page.getByText('Челлендж принят · 1/3').waitFor();
  await load('missing', 9000068); await reportReady();
  await page.getByText('Челлендж принят · 1/3').waitFor();
  await page.getByText(/Он не засчитан ни как успех/).waitFor();
  await load('third', 9000069); await reportReady();
  await page.getByText('Челлендж принят · 2/3').waitFor();
  await load('fourth', 9000070); await reportReady();
  await page.getByText('Цикл завершён · 3/3').waitFor();
  await page.getByText(/Цель достигнута в 2 из 3 матчей/).waitFor();
  await snapshot('challenge-progress');
  await load('fourthMissing', 9000070); await reportReady();
  await page.getByText('Цикл завершён · 3/3').waitFor();
  results.checks.push('PR #68: reloading a completed challenge match without new last-hit data preserves 3/3');
  await load('other', 9000071); await reportReady();
  assert.equal(await page.getByText('Цикл завершён · 3/3').count(), 0);
  results.checks.push('accept with keyboard; persistence/reload; deduplication; no-data pending; 3-game completion; player isolation');

  await page.route('**/apps/dota2/images/**', (route) => route.abort());
  await page.reload(); await load('ready'); await reportReady();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('.item-fallback').count() > 0);
  results.checks.push('unavailable item images keep names, times and fallback');
  await load('low'); await reportReady(); await snapshot('one-priority');
  await page.setViewportSize({ width: 390, height: 900 });
  await snapshot('one-priority-390');
  assert.equal(await page.getByText('Основной фокус', { exact: true }).count(), 1);
  await load('partial'); await reportReady(); await snapshot('partial-data');
  await load('empty'); await reportReady(); await snapshot('empty-data');
  assert.equal(await page.getByRole('button', { name: 'Принять челлендж', exact: true }).count(), 0);

  await page.getByRole('button', { name: 'Матч и состав · изменить' }).click();
  await page.getByLabel('Игрок', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Разобрать матч', exact: true }).click();
  await page.getByText(/Для выбранного игрока определена другая роль/).waitFor(); await snapshot('unsupported-role');
  await page.setViewportSize({ width: 1440, height: 1100 });
  scenario = 'network-error';
  await page.getByRole('button', { name: 'Загрузить игроков', exact: true }).click();
  await page.getByText('OpenDota временно недоступен. Попробуйте позже.').waitFor(); await snapshot('error');
  scenario = 'empty-roster';
  await page.getByRole('button', { name: 'Загрузить игроков', exact: true }).click();
  await page.getByText(/В матче не найдены игроки/).waitFor();
  await load('malformed'); await page.getByText('Не удалось разобрать матч. Попробуйте ещё раз.').waitFor();
  results.checks.push('initial/error/empty/partial/unsupported role; malformed success controlled');

  scenario = 'ready'; delay = 600;
  await page.getByRole('button', { name: 'Загрузить игроков', exact: true }).click();
  await page.getByText('Загружаем состав матча…').waitFor(); await snapshot('loading');
  await page.getByLabel('Match ID', { exact: true }).fill('9999999');
  await page.waitForTimeout(800);
  assert.equal(await page.getByLabel('Игрок', { exact: true }).count(), 0);
  delay = 0;
  await load('ready'); await reportReady();
  await page.getByRole('button', { name: 'Матч и состав · изменить' }).click();
  delay = 600;
  await page.getByRole('button', { name: 'Разобрать матч', exact: true }).click();
  await page.getByLabel('Игрок', { exact: true }).selectOption('1');
  await page.waitForTimeout(800);
  assert.equal(await page.getByRole('heading', { name: 'Личный план', exact: true }).count(), 0);
  delay = 0;
  results.checks.push('late roster and analysis responses discarded after match/player changes');

  await page.evaluate(() => { localStorage.clear(); Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, value() { throw new DOMException('blocked'); } }); });
  await load('ready'); await reportReady();
  await page.getByRole('button', { name: 'Принять челлендж', exact: true }).click();
  await page.getByText(/Челлендж не принят/).waitFor();
  assert.equal(await page.getByText('Челлендж принят · 0/3').count(), 0);
  results.checks.push('blocked storage never reports accepted progress; focus and evidence navigation');
  assert.deepEqual(errors, []);
  results.consoleErrors = errors;
  writeFileSync(join(output, 'verification.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(error);
  await snapshot('failure').catch(() => undefined);
  throw error;
} finally {
  await browser.close();
  server?.kill();
  rmSync(temp, { recursive: true, force: true });
}
