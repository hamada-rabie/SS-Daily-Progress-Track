// Student-facing result messages: Arabic mode must be Modern Standard Arabic only (no dialect),
// English mode English only, bilingual both; WhatsApp text keeps real line breaks and hides the student id.
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
  for (let i = 0; i < 5; i++) {
    const pick = i < score ? KEY[i] : (KEY[i] + 1) % 4;
    await page.locator('#options .opt').nth(pick).click();
    await page.locator('#checkBtn').click();
    await page.locator('#nextBtn').click();
  }
  const text = await page.evaluate(() => ['resultTitle', 'resultMessage', 'resultFootnote'].map(id => document.getElementById(id).textContent).join(' || '));
  await page.locator('#shareBtn').click(); await page.waitForTimeout(250);
  await ctx.close();
  return { text, wa: hits[0] ? decodeURIComponent(hits[0].split('?text=')[1]) : '' };
}

test('result messages follow the selected language for every score 0-5', async (t) => {
  for (const lang of ['ar', 'en', 'bilingual']) {
    await t.test(lang, async () => {
      for (let score = 0; score <= 5; score++) {
        const { text } = await finishWithScore(lang, score);
        if (lang === 'ar') {
          assert.doesNotMatch(text, /[A-Za-z]{2,}/, 'Arabic mode must not contain English words (score ' + score + '): ' + text);
          assert.doesNotMatch(text, DIALECT, 'Arabic mode must be Modern Standard Arabic (score ' + score + '): ' + text);
        } else if (lang === 'en') {
          assert.doesNotMatch(text, /[؀-ۿ]/, 'English mode must not contain Arabic (score ' + score + '): ' + text);
        } else {
          assert.match(text, /[A-Za-z]{2,}/); assert.match(text, /[؀-ۿ]/);
          assert.doesNotMatch(text, DIALECT, 'Arabic part must be Modern Standard Arabic (score ' + score + '): ' + text);
        }
      }
    });
  }
});

test('WhatsApp text: real line breaks, student name not id, result link kept', async () => {
  for (const lang of ['ar', 'en', 'bilingual']) {
    const { wa } = await finishWithScore(lang, 3);
    assert.ok(wa, 'share must open wa.me for ' + lang);
    assert.ok(!wa.includes('\\n'), 'no literal backslash-n');
    assert.ok(wa.split('\n').length >= 5, 'multi-line message');
    assert.ok(wa.includes('Test Student'));
    assert.ok(!wa.split('http')[0].includes('1760000000001'), 'student id must not appear in the readable part');
    assert.match(wa, /english_dashboard-dynamic\.html\?pr=R2-S01\.1760000000001\.1\.3\.5\./, 'result link must keep the validated payload');
  }
});
