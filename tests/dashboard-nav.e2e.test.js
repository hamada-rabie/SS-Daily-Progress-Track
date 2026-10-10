// Browser acceptance for dashboard navigation (mobile drawer, Back) and the default Burgundy theme.
// Firebase is replaced by in-repo fakes (tests/fixtures/firebase-fake); no network and no real data.
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FAKE = path.join(__dirname, 'fixtures', 'firebase-fake');
const ALLOWED = new Set(['english_dashboard-dynamic.html', 'login.html', 'practice.html', 'manifest.json', 'firebase-messaging-sw.js']);
const student = { id: 1760000000001, name: 'Test Student', classId: 111, attendance: 'present', homeworkDone: false, participationLevel: 'active', behaviourLevel: 'disciplined', notes: '', phoneNumbers: [], parentPhone: '', skills: { reading: 0, writing: 0, listening: 0, speaking: 0 }, skillHistory: [] };
const cloud = (settings) => ({ 'users/U1/appData/main': { studentsData: [student], classesData: [{ id: 111, name: 'Grade 9', section: '1', color: '#0E7C74', icon: 'fa-book' }], dailyArchives: {}, settings: settings || {} } });

let server, browser, base;
test.before(async () => {
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').pathname.replace(/^\//, '') || 'index.html';
    if (!ALLOWED.has(name)) { res.writeHead(404); return res.end('nf'); }
    const type = name.endsWith('.json') ? 'application/json' : name.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(ROOT, name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser.close(); server.close(); });

async function openDashboard(settings, opts) {
  const o = Object.assign({ viewport: { width: 390, height: 844 } }, opts || {});
  const ctx = await browser.newContext(o);
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('https://www.gstatic.com/firebasejs/12.19.0/')) {
      const f = path.join(FAKE, u.split('/').pop().split('?')[0]);
      if (!fs.existsSync(f)) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    return u.startsWith(base) ? route.continue() : route.abort();
  });
  await ctx.addInitScript(init => { window.__FS = init; }, { store: cloud(settings), writes: [], calls: [], user: { uid: 'U1', email: 't@example.com' } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + 'english_dashboard-dynamic.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SS_AUTH_READY === true, null, { timeout: 15000 });
  // Tailwind comes from a CDN that tests do not load; supply the one utility these assertions rely on.
  await page.addStyleTag({ content: '.hidden{display:none!important}' });
  return { ctx, page, errors };
}
const state = page => page.evaluate(() => ({
  hash: location.hash, path: location.pathname.split('/').pop(),
  tab: (document.querySelector('.tab-content.active') || {}).id, open: document.body.classList.contains('sidebar-open'),
  asideLeft: Math.round(document.getElementById('sidebar').getBoundingClientRect().left), vw: innerWidth
}));
const toggle = page => page.evaluate(() => document.querySelector('[data-action="toggle-sidebar"]').click());

test('mobile drawer and Back navigation', async (t) => {
  const { ctx, page, errors } = await openDashboard();
  await t.test('dashboard opens after (fake) login without page errors', async () => {
    assert.equal((await state(page)).tab, 'tab-dashboard');
    assert.deepEqual(errors, []);
  });
  await t.test('hamburger opens the drawer inside the viewport and the overlay closes it', async () => {
    assert.equal((await state(page)).open, false);
    await toggle(page); await page.waitForTimeout(400);
    let s = await state(page);
    assert.equal(s.open, true);
    assert.ok(s.asideLeft >= 0 && s.asideLeft < s.vw, 'drawer must be on screen, left=' + s.asideLeft);
    await page.mouse.click(20, 400); await page.waitForTimeout(300);
    assert.equal((await state(page)).open, false);
  });
  await t.test('choosing a sidebar item switches tab and closes the drawer', async () => {
    await toggle(page); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#sidebar [data-action="switch-tab"][data-tab="students"]').click());
    await page.waitForTimeout(300);
    const s = await state(page);
    assert.equal(s.tab, 'tab-students'); assert.equal(s.open, false);
  });
  await t.test('Back walks through tabs and never leaves the dashboard page', async () => {
    for (const tab of ['daily', 'reports']) { await page.evaluate(x => switchTab(x), tab); await page.waitForTimeout(100); }
    const seen = [];
    for (let i = 0; i < 7; i++) { await page.goBack(); await page.waitForTimeout(200); const s = await state(page); seen.push(s.tab); assert.equal(s.path, 'english_dashboard-dynamic.html', 'Back must not leave the app'); }
    assert.deepEqual(seen.slice(0, 2), ['tab-daily', 'tab-students']);
    assert.equal(seen[seen.length - 1], 'tab-dashboard');
  });
  await t.test('Back with the drawer open closes the drawer and keeps the current tab', async () => {
    await page.evaluate(() => switchTab('students')); await page.waitForTimeout(100);
    await toggle(page); await page.waitForTimeout(300);
    assert.equal((await state(page)).open, true);
    await page.goBack(); await page.waitForTimeout(300);
    const s = await state(page);
    assert.equal(s.open, false, 'drawer must close'); assert.equal(s.tab, 'tab-students', 'tab must not change'); assert.equal(s.path, 'english_dashboard-dynamic.html');
  });
  await ctx.close();
});

test('default Burgundy theme is light enough, readable, and user choices are kept', async (t) => {
  const cssVar = (page, n) => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim().toLowerCase(), n);
  await t.test('new user starts on Burgundy with white text (WCAG AA, >= 4.5:1)', async () => {
    const { ctx, page } = await openDashboard({});
    assert.equal(await cssVar(page, '--teal'), '#b55a70');
    assert.equal((await cssVar(page, '--on-primary')).toLowerCase(), '#ffffff');
    const ratio = await page.evaluate(() => { const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }; return 1.05 / (L('#b55a70') + 0.05); });
    assert.ok(ratio >= 4.5, 'contrast ' + ratio);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).theme_color.toLowerCase(), '#b55a70');
    await ctx.close();
  });
  await t.test('a theme the user saved is not overridden by the default', async () => {
    const { ctx, page } = await openDashboard({ theme: 'ocean' });
    assert.equal(await cssVar(page, '--teal'), '#2574a9');
    await ctx.close();
  });
});

// Real touch input (emulated phone: hasTouch + isMobile) goes through browser hit-testing, so a covered or
// double-handled hamburger would fail here even though a scripted element.click() would pass.
test('hamburger works with real touch taps and does not double-fire', async (t) => {
  const { ctx, page, errors } = await openDashboard(undefined, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const open = () => page.evaluate(() => document.body.classList.contains('sidebar-open'));
  await t.test('hamburger is the topmost element at its own centre', async () => {
    const hit = await page.evaluate(() => { const b = document.querySelector('.sidebar-toggle-btn'); const r = b.getBoundingClientRect(); return { n: document.querySelectorAll('.sidebar-toggle-btn').length, ok: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; });
    assert.equal(hit.n, 1); assert.equal(hit.ok, true);
  });
  await t.test('one tap opens, and exactly one toggle runs (no open-then-close)', async () => {
    await page.evaluate(() => { window.__toggles = 0; const o = window.toggleSidebar; window.toggleSidebar = function () { window.__toggles++; return o.apply(this, arguments); }; });
    await page.locator('.sidebar-toggle-btn').tap(); await page.waitForTimeout(400);
    assert.equal(await open(), true);
    assert.equal(await page.evaluate(() => window.__toggles), 1);
    assert.equal(await page.locator('.sidebar-toggle-btn').getAttribute('aria-expanded'), 'true');
  });
  await t.test('drawer is the element hit inside its area; tapping the overlay closes it; it reopens', async () => {
    const hitAside = await page.evaluate(() => { const a = document.getElementById('sidebar').getBoundingClientRect(); const e = document.elementFromPoint(a.x + a.width / 2, 200); return !!(e && e.closest('aside')); });
    assert.equal(hitAside, true);
    await page.tap('#sidebar-overlay', { position: { x: 20, y: 400 } }); await page.waitForTimeout(400);
    assert.equal(await open(), false);
    await page.locator('.sidebar-toggle-btn').tap(); await page.waitForTimeout(400);
    assert.equal(await open(), true);
  });
  await t.test('expanding a nav group keeps the drawer open; tapping a tab link switches tab and closes it', async () => {
    await page.locator('#sidebar [data-action="toggle-nav-group"]').first().tap(); await page.waitForTimeout(300);
    assert.equal(await open(), true);
    await page.locator('#sidebar [data-action="switch-tab"][data-tab="students"]').first().tap(); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.querySelector('.tab-content.active').id), 'tab-students');
    assert.equal(await open(), false);
  });
  await t.test('a viewport resize (mobile address bar) does not close an open drawer', async () => {
    await page.locator('.sidebar-toggle-btn').tap(); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 760 }); await page.waitForTimeout(300);
    assert.equal(await open(), true);
  });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('desktop layout is unchanged: no hamburger, sidebar visible without opening', async () => {
  const { ctx, page, errors } = await openDashboard(undefined, { viewport: { width: 1280, height: 800 } });
  const r = await page.evaluate(() => ({ burger: getComputedStyle(document.querySelector('.sidebar-toggle-btn')).display, left: document.getElementById('sidebar').getBoundingClientRect().left, w: document.getElementById('sidebar').getBoundingClientRect().width, vw: innerWidth }));
  assert.equal(r.burger, 'none'); assert.ok(r.left >= 0 && r.left + r.w <= r.vw + 1, 'sidebar fully on screen'); assert.deepEqual(errors, []);
  await ctx.close();
});
