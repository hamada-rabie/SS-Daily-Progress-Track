const test = require('node:test');
const assert = require('node:assert/strict');
const { ANSWER_KEYS, parsePendingPayload } = require('../remediation-validation');

const roster = [{ id: 123, name: 'Test Student', classId: '8A' }];
function payload(setId = 'R2-S01', overrides = {}) {
  const key = ANSWER_KEYS[setId] || [1,0,2,3,2];
  const answers = overrides.answers || key.slice();
  const score = answers.reduce((sum, answer, index) => sum + (answer === key[index] ? 1 : 0), 0);
  const wrong = answers.map((answer, index) => answer === key[index] ? null : index + 1).filter(value => value !== null);
  const values = [
    setId, String(overrides.studentId ?? 123), String(overrides.attempt ?? 1),
    String(overrides.score ?? score), String(overrides.total ?? 5),
    overrides.wrongRaw !== undefined ? overrides.wrongRaw : wrong.join(','),
    overrides.answersRaw !== undefined ? overrides.answersRaw : answers.join(',')
  ];
  return '?pr=' + values.join('.');
}

test('all practice banks validate valid answers and recompute score', () => {
  for (const [setId, key] of Object.entries(ANSWER_KEYS)) {
    const parsed = parsePendingPayload(payload(setId), roster);
    assert.equal(parsed.setId, setId);
    assert.equal(parsed.score, 5);
    assert.deepEqual(parsed.answers, key);
    assert.deepEqual(parsed.wrong, []);
    assert.equal(parsed.student, roster[0]);
  }
});

test('partial answers are recomputed and the wrong-question list must match exactly', () => {
  for (const [setId, key] of Object.entries(ANSWER_KEYS)) {
    const answers = key.slice();
    answers[0] = (answers[0] + 1) % 4;
    const parsed = parsePendingPayload(payload(setId, { answers }), roster);
    assert.equal(parsed.score, 4, setId);
    assert.deepEqual(parsed.wrong, [1], setId);
  }
  assert.throws(() => parsePendingPayload(payload('R2-S01', { wrongRaw: '2' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { wrongRaw: '1,1' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { score: 5, answers: [0,0,0,0,0] }), roster), { kind: 'link' });
});

test('malformed, duplicate, oversized, and forged payloads are rejected', () => {
  assert.throws(() => parsePendingPayload('x'.repeat(4097), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload('?foo=bar', roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload('?pr=' + payload().slice(4) + '&pr=' + payload().slice(4), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload('?pr=R2-S01.123.1.5', roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('UNKNOWN'), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { studentId: 'abc' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { studentId: '9007199254740992' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { attempt: 3 }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { score: 2 }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { total: 4 }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { answersRaw: '1,0,2,3' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { answersRaw: '1,0,2,3,4' }), roster), { kind: 'link' });
  assert.throws(() => parsePendingPayload(payload('R2-S01', { wrongRaw: 'x' }), roster), { kind: 'link' });
});

test('student must match exactly one student in the authenticated teacher roster', () => {
  assert.throws(() => parsePendingPayload(payload(), []), { kind: 'roster' });
  assert.throws(() => parsePendingPayload(payload(), [roster[0], { id: 123, name: 'Duplicate' }]), { kind: 'roster' });
  assert.throws(() => parsePendingPayload(payload(), null), { kind: 'roster' });
});

test('attempt two is accepted but attempts outside one and two are rejected', () => {
  assert.equal(parsePendingPayload(payload('R2-S01', { attempt: 2 }), roster).attempt, 2);
  assert.throws(() => parsePendingPayload(payload('R2-S01', { attempt: 0 }), roster), { kind: 'link' });
});
