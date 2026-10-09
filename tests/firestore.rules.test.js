const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const {
  collection, doc, getDoc, getDocs, query, where,
  setDoc, updateDoc, deleteDoc
} = require('firebase/firestore');

const PROJECT_ID = 'demo-ss-dpt';
let env;

test('Firestore rules security suite', async (t) => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });

  const teacher = env.authenticatedContext('teacher-1', { email: 'teacher@example.test' }).firestore();
  const teacher2 = env.authenticatedContext('teacher-2', { email: 'teacher2@example.test' }).firestore();
  const fakeAdmin = env.authenticatedContext('fake-admin', { email: 'fake@example.test' }).firestore();
  const admin = env.authenticatedContext('real-admin', { email: 'admin@example.test' }).firestore();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'real-admin'), { active: true });
    await setDoc(doc(db, 'users', 'fake-admin'), {
      uid: 'fake-admin', email: 'fake@example.test', status: 'approved', role: 'admin'
    });
    await setDoc(doc(db, 'users', 'teacher-1'), {
      uid: 'teacher-1', email: 'teacher@example.test', status: 'approved', role: 'teacher'
    });
    await setDoc(doc(db, 'users', 'teacher-2'), {
      uid: 'teacher-2', email: 'teacher2@example.test', status: 'approved', role: 'teacher'
    });
  });

  await t.test('self-registration cannot create an admin profile', async () => {
    await assertSucceeds(setDoc(doc(teacher, 'users', 'teacher-new'), {
      uid: 'teacher-new', email: 'new@example.test', status: 'approved', role: 'teacher'
    }));
    await assertFails(setDoc(doc(teacher, 'users', 'teacher-admin'), {
      uid: 'teacher-admin', email: 'evil@example.test', status: 'approved', role: 'admin'
    }));
    await assertFails(setDoc(doc(teacher, 'users', 'teacher-pending'), {
      uid: 'teacher-pending', email: 'evil@example.test', status: 'pending', role: 'teacher'
    }));
  });

  await t.test('profile updates cannot alter role, status, or uid', async () => {
    await assertSucceeds(updateDoc(doc(teacher, 'users', 'teacher-1'), { displayName: 'Teacher One' }));
    await assertFails(updateDoc(doc(teacher, 'users', 'teacher-1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(teacher, 'users', 'teacher-1'), { status: 'denied' }));
    await assertFails(updateDoc(doc(teacher, 'users', 'teacher-1'), { uid: 'teacher-2' }));
  });

  await t.test('a profile claiming role admin is not an admin', async () => {
    await assertFails(getDocs(collection(fakeAdmin, 'users')));
    await assertFails(getDoc(doc(fakeAdmin, 'users', 'teacher-1')));
    await assertFails(setDoc(doc(fakeAdmin, 'admins', 'fake-admin'), { active: true }));
    await assertFails(updateDoc(doc(fakeAdmin, 'admins', 'real-admin'), { active: false }));
  });

  await t.test('only registry admins can list profiles', async () => {
    await assertSucceeds(getDocs(collection(admin, 'users')));
    await assertSucceeds(getDoc(doc(admin, 'users', 'teacher-1')));
    await assertFails(getDocs(collection(teacher, 'users')));
    await assertFails(getDoc(doc(teacher, 'users', 'teacher-2')));
  });

  await t.test('access requests are owner-created and admin-managed', async () => {
    await assertSucceeds(setDoc(doc(teacher, 'accessRequests', 'teacher-1'), {
      uid: 'teacher-1', status: 'pending'
    }));
    await assertFails(setDoc(doc(teacher, 'accessRequests', 'teacher-2'), {
      uid: 'teacher-2', status: 'pending'
    }));
    await assertFails(updateDoc(doc(teacher, 'accessRequests', 'teacher-1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(admin, 'accessRequests', 'teacher-1'), { status: 'approved' }));
  });

  const validResult = (overrides = {}) => ({
    teacherUid: 'teacher-1',
    studentId: '42',
    studentName: 'Test Student',
    setId: 'R2-S01',
    attempt: '1',
    answers: [1, 0, 2, 3, 2],
    score: 5,
    total: 5,
    wrongQuestionNumbers: [],
    createdAt: '2026-10-09T10:00:00.000Z',
    source: 'student-shared-result-link',
    grading: 'recalculated-in-dashboard; client-origin answers are not tamper-proof',
    ...overrides
  });
  const resultRef = (db, id = 'teacher-1_42_R2-S01_a1') => doc(db, 'remediationResults', id);

  await t.test('valid owner-scoped reading result can be created and queried by owner', async () => {
    await assertSucceeds(setDoc(resultRef(teacher), validResult()));
    const snap = await assertSucceeds(getDocs(query(
      collection(teacher, 'remediationResults'), where('teacherUid', '==', 'teacher-1')
    )));
    assert.equal(snap.size, 1);
    await assertFails(getDoc(resultRef(teacher2)));
    await assertFails(getDocs(query(
      collection(teacher2, 'remediationResults'), where('teacherUid', '==', 'teacher-1')
    )));
  });

  await t.test('reading results reject mismatched IDs, answer keys, scores, and wrong-question lists', async () => {
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_43_R2-S01_a1'), validResult()));
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_42_R2-S01_a2'), validResult({ attempt: '1' })));
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_42_R2-S01_a2'), validResult({ attempt: '2', score: 4 })));
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_42_R2-S01_a2'), validResult({ attempt: '2', answers: [0,0,0,0,0], score: 5 })));
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_42_R2-S01_a2'), validResult({ attempt: '2', answers: [1,1,2,3,2], score: 4, wrongQuestionNumbers: [2,2] })));
    await assertFails(setDoc(resultRef(teacher, 'teacher-1_42_R2-S01_a2'), validResult({ attempt: '2', answers: [1,1,2,3,2], score: 4, wrongQuestionNumbers: [2,3] })));
  });

  await t.test('reading results reject invalid types, ranges, and oversized strings', async () => {
    const id = 'teacher-1_42_R2-S01_a2';
    await assertFails(setDoc(resultRef(teacher, id), validResult({ attempt: 2 })));
    await assertFails(setDoc(resultRef(teacher, id), validResult({ studentId: '1.5' })));
    await assertFails(setDoc(resultRef(teacher, id), validResult({ studentId: '999999999999999999999' })));
    await assertFails(setDoc(resultRef(teacher, id), validResult({ studentName: 'x'.repeat(121) })));
    await assertFails(setDoc(resultRef(teacher, id), validResult({ createdAt: 'x'.repeat(41) })));
  });

  await t.test('reading results are append-only', async () => {
    await assertFails(updateDoc(resultRef(teacher), { score: 4 }));
    await assertFails(deleteDoc(resultRef(teacher)));
    await assertFails(setDoc(resultRef(teacher), validResult(), { merge: true }));
  });

  await env.cleanup();
});
