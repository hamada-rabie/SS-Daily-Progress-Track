const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { ANSWER_KEYS } = require('../remediation-validation');

function inlineScripts(path) {
  const html = readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/type\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(attrs)) continue;
    if (!match[2].trim()) continue;
    scripts.push({ path, index: scripts.length + 1, source: match[2] });
  }
  return scripts;
}

test('inline JavaScript parses without syntax errors', () => {
  const scripts = [
    ...inlineScripts('english_dashboard-dynamic.html'),
    ...inlineScripts('practice.html'),
    ...inlineScripts('login.html'),
    ...inlineScripts('admin.html')
  ];
  assert.ok(scripts.length >= 10, 'Expected to find the app inline scripts');
  const failures = [];
  for (const item of scripts) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: item.source,
      encoding: 'utf8'
    });
    if (result.status !== 0) failures.push(item.path + ' script #' + item.index + ': ' + (result.stderr || result.stdout));
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('all remediation banks contain five questions and match dashboard grading keys', () => {
  const practice = readFileSync('practice.html', 'utf8');
  const dashboard = readFileSync('english_dashboard-dynamic.html', 'utf8');
  const rules = readFileSync('firestore.rules', 'utf8');
  assert.doesNotMatch(practice, /\blocalStorage\b/, 'Practice attempt tracking must not rely on resettable localStorage');
  const bankMatch = practice.match(/const BANK=(\{[\s\S]*?\n\});\nconst params/);
  assert.ok(bankMatch, 'Practice question bank must be present');
  const bank = vm.runInNewContext('(' + bankMatch[1] + ')');
  const allowed = ANSWER_KEYS;
  const ruleSetMatch = rules.match(/request\.resource\.data\.setId in \[([^\]]+)\]/);
  assert.ok(ruleSetMatch, 'Firestore rules must whitelist practice sets');
  const ruleSets = ruleSetMatch[1].match(/'[^']+'/g).map(value => value.slice(1, -1));
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(allowed).sort(), 'Every practice bank must have a dashboard answer key');
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(ANSWER_KEYS).sort(), 'Every practice bank must have a server-side validation key');
  for (const [setId, set] of Object.entries(bank)) {
    assert.equal(set.questions.length, 5, setId + ' must contain five questions');
    assert.ok(set.questions.every(question => Array.isArray(question.o) && question.o.length === 4 && Number.isInteger(question.a) && question.a >= 0 && question.a < question.o.length), setId + ' must have four options and a valid answer index per question');
    const bankKey = JSON.parse(JSON.stringify(set.questions.map(question => question.a)));
    const dashboardKey = JSON.parse(JSON.stringify(allowed[setId]));
    assert.deepEqual(dashboardKey, bankKey, setId + ' answer key must match the practice bank');
    assert.deepEqual(JSON.parse(JSON.stringify(ANSWER_KEYS[setId])), bankKey, setId + ' validator key must match the practice bank');
    assert.ok(ruleSets.includes(setId), setId + ' must be allowed by Firestore rules');
    assert.ok(rules.includes("data.setId == '" + setId + "'"), setId + ' must have server-side answer-key validation');
  }
});

test('remediation assets are included in the deployable build and offline shell', () => {
  const build = readFileSync('scripts/build-dist.sh', 'utf8');
  const worker = readFileSync('firebase-messaging-sw.js', 'utf8');
  assert.match(build, /remediation-validation\.js/, 'build must include the result-link validator');
  assert.match(worker, /'\.\/practice\.html'/, 'offline shell must cache practice.html');
  assert.match(worker, /'\.\/remediation-validation\.js'/, 'offline shell must cache the result-link validator');
  assert.match(worker, /ss-dpt-pwa-v23/, 'cache version must change when shell assets change');
});
