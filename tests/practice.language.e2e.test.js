// Student-facing results keep English fully above Arabic; WhatsApp is bilingual, line-separated, and contains no result URL or student ID.
const http = require('node:http');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const HTML = readFileSync(path.join(__dirname, '..', 'practice.html'));
const KEY = [1, 0, 2, 3, 2];
const DIALECT = /(بتتعلم|هتلاقي|مش |إحنا|احنا| دي | ده |النهارده|بكرة|عشان|شوية|اللي |خلّي|خلي |بتفهم|بتتقدم|تتخيل؟|قدّها|قدّام|يا سلام)/;
let server, browser, base;

test.before(async () => {
  server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/practice.html';
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser.close(); server.close(); });

async function finishWithScore(lang, score, sid = '1760000000001') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const hits = [];
  await page.route('https://wa.me/**', r => { hits.push(r.request().url()); r.abort(); });
  const url = new URL(base); url.searchParams.set('set', 'R2-S01'); url.searchParams.set('sid', sid); url.searchParams.set('sname', 'Test Student'); url.searchParams.set('lang', lang);
  await page.goto(url.href);
  assert.equal(await page.locator('#languageMode').count(), 0, 'student must not be offered a language selector');
  for (let i = 0; i < 5; i++) {
    const pick = i < score ? KEY[i] : (KEY[i] + 1) % 4;
    await page.locator('#options .opt').nth(pick).click();
    await page.locator('#checkBtn').click();
    await page.locator('#nextBtn').click();
  }
  const texts = await page.evaluate(() => ['resultTitle', 'resultMessage', 'resultFootnote'].map(id => document.getElementById(id).textContent));
  await page.locator('#shareBtn').click(); await page.waitForTimeout(250);
  await ctx.close();
  return { texts, wa: hits[0] ? decodeURIComponent(hits[0].split('?text=')[1]) : '' };
}

test('result messages always show English above Arabic for every score 0-5', async (t) => {
  for (let score = 0; score <= 5; score++) {
    await t.test('score ' + score, async () => {
      const { texts } = await finishWithScore('bilingual', score);
      const text = texts.join('\n');
      assert.match(text, /[A-Za-z]{2,}/, 'must include English');
      assert.match(text, /[؀-ۿ]/, 'must include Arabic');
      assert.doesNotMatch(text, DIALECT, 'Arabic text should remain formal Arabic (score ' + score + '): ' + text);
      for (const line of text.split('\n')) {
        assert.ok(!(/[A-Za-z]{2,}/.test(line) && /[؀-ۿ]/.test(line)), 'English and Arabic must be on separate lines: ' + line);
      }
    });
  }
});

test('WhatsApp text has separate bilingual lines and no result URL or student id', async () => {
  for (const lang of ['ar', 'en', 'bilingual']) {
    const { wa } = await finishWithScore(lang, 3);
    assert.ok(wa, 'share must open wa.me for ' + lang);
    assert.ok(!wa.includes('\\n'), 'no literal backslash-n');
    assert.ok(wa.split('\n').length >= 8, 'multi-line message');
    assert.ok(wa.includes('Test Student'));
    assert.ok(!wa.includes('1760000000001'), 'student id must not appear in WhatsApp text');
    assert.doesNotMatch(wa, /https?:\/\/|\bpr=/i, 'result URL/payload must not appear in WhatsApp');
    assert.match(wa, /Questions to review:/);
    assert.match(wa, /الأسئلة التي تحتاج إلى مراجعة:/);
    for (const line of wa.split('\n')) {
      assert.ok(!(/[A-Za-z]{2,}/.test(line) && /[؀-ۿ]/.test(line)), 'English and Arabic must be on separate WhatsApp lines: ' + line);
    }
  }
});
