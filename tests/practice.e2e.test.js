const http = require('node:http');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const HTML = readFileSync(path.join(__dirname, '..', 'practice.html'));
const KEYS = {
  'R2-S01':[1,0,2,3,2], 'R2-S02':[0,1,1,2,1],
  'R2-VW01':[1,2,0,1,3], 'R2-WK01':[1,2,0,3,1], 'R2-MD01':[0,1,2,3,1],
  'W2-VW01':[0,1,2,1,3], 'W2-WK01':[1,3,1,2,1], 'W2-MD01':[0,1,2,3,1],
  'L2-VW01':[1,2,0,3,1], 'L2-WK01':[1,2,3,0,1], 'L2-MD01':[0,2,3,1,2],
  'S2-VW01':[1,2,0,3,1], 'S2-WK01':[2,3,0,1,2], 'S2-MD01':[3,0,2,1,3]
};
let server, browser, baseUrl;

test('remedial practice browser acceptance', async (t) => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === '/practice.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(HTML);
      return;
    }
    res.writeHead(404); res.end('Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/practice.html';
  browser = await chromium.launch({ headless: true });

  await t.test('all fourteen banks load and can complete with full marks', async () => {
    for (const [setId, key] of Object.entries(KEYS)) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));
      const url = new URL(baseUrl);
      url.searchParams.set('set', setId);
      url.searchParams.set('sid', '123');
      url.searchParams.set('sname', 'Test Student');
      url.searchParams.set('lang', 'bilingual');
      await page.goto(url.href);
      await page.locator('#questionNumber').waitFor();
      assert.equal(await page.locator('#options .opt').count(), 4, setId + ' first question must have four options');
      if (setId.startsWith('L2-')) {
        assert.equal(await page.locator('#listenBtn').isVisible(), true, setId + ' must provide listening playback');
        assert.doesNotMatch(await page.locator('#passageText').innerText(), /The school bus will leave|Good morning, students|Hello, my name is Sami/, 'Listening passage must not be exposed as visible text');
      }
      for (let i = 0; i < key.length; i++) {
        await page.locator('#options .opt').nth(key[i]).click();
        await page.locator('#checkBtn').click();
        await page.locator('#nextBtn').click();
      }
      await page.locator('#resultCard:not(.hidden)').waitFor();
      assert.match(await page.locator('#scoreText').innerText(), /5\s*\/\s*5/, setId + ' should score full marks');
      assert.deepEqual(pageErrors, [], setId + ' should not raise browser errors');
      await page.close();
    }
  });

  await t.test('language selector and retry confirmation work', async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl + '?set=R2-VW01&sid=123&sname=Test&lang=ar');
    assert.match(await page.locator('#heroTitle').innerText(), /خطوات صغيرة/);
    assert.equal(await page.locator('#checkBtn').innerText(), 'تحقق من الإجابة');
    const key = KEYS['R2-VW01'];
    for (let i = 0; i < key.length; i++) {
      await page.locator('#options .opt').nth(key[i]).click();
      await page.locator('#checkBtn').click();
      await page.locator('#nextBtn').click();
    }
    await page.locator('#retryBtn').click();
    await page.locator('#retryModal:not(.hidden)').waitFor();
    await page.locator('#retryConfirm').click();
    for (let i = 0; i < key.length; i++) {
      await page.locator('#options .opt').nth(key[i]).click();
      await page.locator('#checkBtn').click();
      await page.locator('#nextBtn').click();
    }
    await page.locator('#resultCard:not(.hidden)').waitFor();
    assert.match(await page.locator('#scoreText').innerText(), /2/);
    await page.close();
  });

  await t.test('student name is rendered as text and result sharing opens WhatsApp only', async () => {
    const page = await browser.newPage();
    let whatsappUrl = '';
    await page.route('https://wa.me/**', async route => {
      whatsappUrl = route.request().url();
      await route.abort();
    });
    const url = new URL(baseUrl);
    url.searchParams.set('set', 'R2-S01');
    url.searchParams.set('sid', '123');
    url.searchParams.set('sname', '<img src=x onerror=alert(1)>');
    url.searchParams.set('lang', 'en');
    await page.goto(url.href);
    assert.equal(await page.locator('#studentLine img').count(), 0, 'untrusted student name must not become HTML');
    for (const answer of KEYS['R2-S01']) {
      await page.locator('#options .opt').nth(answer).click();
      await page.locator('#checkBtn').click();
      await page.locator('#nextBtn').click();
    }
    await page.locator('#shareBtn').click().catch(() => {});
    assert.match(whatsappUrl, /^https:\/\/wa\.me\//, 'result sharing must use WhatsApp, not a generic share sheet');
    await page.close();
  });

  await browser.close();
  await new Promise(resolve => server.close(resolve));
});
