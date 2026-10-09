const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

function inlineScripts(path) {
  const html = readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script\\b([^>]*)>([\\s\\S]*?)<\\/script\\s*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/type\\s*=\\s*["'](?:application\\/ld\\+json|application\\/json)["']/i.test(attrs)) continue;
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
  assert.deepEqual(failures, [], failures.join('\\n'));
});
