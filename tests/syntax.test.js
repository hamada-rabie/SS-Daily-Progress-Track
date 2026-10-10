const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

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
  const bankMatch = practice.match(/const BANK=(\{[\s\S]*?\n\});\nconst params/);
  const allowedMatch = dashboard.match(/const allowedSets=Object\.freeze\((\{[^;]+\})\);/);
  assert.ok(bankMatch, 'Practice question bank must be present');
  assert.ok(allowedMatch, 'Dashboard answer-key map must be present');
  const bank = vm.runInNewContext('(' + bankMatch[1] + ')');
  const allowed = vm.runInNewContext('(' + allowedMatch[1] + ')');
  const ruleSetMatch = rules.match(/request\.resource\.data\.setId in \[([^\]]+)\]/);
  assert.ok(ruleSetMatch, 'Firestore rules must whitelist practice sets');
  const ruleSets = ruleSetMatch[1].match(/'[^']+'/g).map(value => value.slice(1, -1));
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(allowed).sort(), 'Every practice bank must have a dashboard answer key');
  for (const [setId, set] of Object.entries(bank)) {
    assert.equal(set.questions.length, 5, setId + ' must contain five questions');
    const bankKey = set.questions.map(question => question.a);
    const dashboardKey = JSON.parse(JSON.stringify(allowed[setId]));
    assert.deepEqual(dashboardKey, bankKey, setId + ' answer key must match the practice bank');
    assert.ok(ruleSets.includes(setId), setId + ' must be allowed by Firestore rules');
    assert.ok(rules.includes("data.setId == '" + setId + "'"), setId + ' must have server-side answer-key validation');
  }
});
