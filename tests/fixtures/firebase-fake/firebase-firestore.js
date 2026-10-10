
const S = () => window.__FS;
const clone = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const err = (code) => { const e = new Error(code); e.code = code; return e; };
export const getFirestore = () => ({ __db: 1 });
export const initializeFirestore = () => ({ __db: 1 });
export const persistentLocalCache = () => ({});
export const doc = (db, ...seg) => ({ __path: seg.join('/'), id: seg[seg.length - 1] });
export const collection = (db, ...seg) => ({ __col: seg.join('/') });
export const where = (f, op, v) => ({ f, op, v });
export const orderBy = () => ({}); export const limit = () => ({});
export const query = (col, ...cons) => ({ __col: col.__col, cons });
export const serverTimestamp = () => ({ __sts: true });
const snapOf = (path) => { const d = S().store[path]; return { id: path.split('/').pop(), exists: () => d !== undefined, data: () => d === undefined ? undefined : clone(d) }; };
export const getDoc = async (ref) => { if (ref.__path.startsWith('remediationResults/') && S().store[ref.__path] === undefined) throw err('permission-denied'); return snapOf(ref.__path); };
export const getDocFromServer = async (ref) => { S().calls.push('getDocFromServer:' + ref.__path); if (S().offline) throw err('unavailable'); return snapOf(ref.__path); };
const runQuery = (q) => {
  const pre = q.__col + '/'; const docs = [];
  for (const k of Object.keys(S().store)) {
    if (!k.startsWith(pre) || k.slice(pre.length).includes('/')) continue;
    const d = S().store[k]; if (!q.cons.every(c => !c.f || d[c.f] === c.v)) continue;
    docs.push({ id: k.slice(pre.length), data: () => clone(d) });
  }
  return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
};
export const getDocs = async (q) => runQuery(q);
export const getDocsFromServer = async (q) => { S().calls.push('getDocsFromServer:' + q.__col); if (S().offline) throw err('unavailable'); return runQuery(q); };
export const setDoc = async (ref, data, opts) => {
  const p = ref.__path; S().writes.push({ path: p, merge: !!(opts && opts.merge) });
  if (p.startsWith('remediationResults/') && S().rulesModel === 'pr') {
    S().rrAttempts = (S().rrAttempts || 0) + 1;
    if (S().denyAllRR) throw err('permission-denied');
    if (S().hang) await new Promise(() => {});
    await sleep(S().saveDelay || 100);
    if (S().offline) throw err('unavailable');
    if (S().store[p] !== undefined) throw err('permission-denied');                 // no update rule => overwrite denied
    const d = data, uid = S().user.uid, isInt = v => Number.isInteger(v);
    const KEYS = ['teacherUid','studentId','studentName','setId','attempt','answers','score','total','wrongQuestionNumbers','createdAt','source','grading'];
    const key = { 'R2-S01': [1,0,2,3,2], 'R2-S02': [0,1,1,2,1] }[d.setId];
    const okAns = Array.isArray(d.answers) && d.answers.length === 5 && d.answers.every(a => isInt(a) && a >= 0 && a <= 3);
    const ok = Object.keys(d).length === KEYS.length && KEYS.every(k => k in d) && d.teacherUid === uid && isInt(d.studentId) && d.studentId > 0
      && typeof d.studentName === 'string' && d.studentName.length <= 200 && !!key && isInt(d.attempt) && d.attempt >= 1 && d.attempt <= (S().maxAttemptRule || 2)
      && isInt(d.score) && d.score >= 0 && d.score <= 5 && d.total === 5 && okAns && d.score === d.answers.reduce((n, a, i) => n + (a === key[i] ? 1 : 0), 0)
      && Array.isArray(d.wrongQuestionNumbers) && d.wrongQuestionNumbers.every(x => [1,2,3,4,5].includes(x)) && (S().noWrongSizeRule ? d.wrongQuestionNumbers.length <= 5 : d.wrongQuestionNumbers.length === 5 - d.score)
      && typeof d.createdAt === 'string' && d.createdAt.length <= 40 && d.source === 'student-shared-result-link' && d.grading === 'recalculated-in-dashboard; client-origin answers are not tamper-proof';
    if (!ok) throw err('permission-denied');
    S().store[p] = clone(d); return;
  }
  if (p.startsWith('remediationResults/')) {
    S().rrAttempts = (S().rrAttempts || 0) + 1;
    if (S().hang) await new Promise(() => {});
    await sleep(S().saveDelay || 150);
    if (S().offline) throw err('unavailable');
    if (S().store[p] !== undefined) throw err('permission-denied');          // create-only: overwrite == update == denied
    const d = clone(data); const ok = d.uid === S().user.uid && p === `${d.uid}_${d.studentId}_${d.set}_a${d.attempt}`.replace(/^/, 'remediationResults/') && data.receivedAt && data.receivedAt.__sts;
    const keys = Object.keys(d).sort().join(',');
    if (!ok || keys !== 'attempt,classSnapshot,level,receivedAt,score,set,skill,source,studentId,studentNameSnapshot,total,uid,wrong') throw err('permission-denied');
    d.receivedAt = { ts: Date.now() }; S().store[p] = d; return;
  }
  S().store[p] = clone(data);
};
export const updateDoc = async (ref, data) => { S().writes.push({ path: ref.__path, upd: 1 }); S().store[ref.__path] = Object.assign({}, S().store[ref.__path], clone(data)); };
export const deleteDoc = async () => {};
export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
export const onSnapshot = (q, cb) => { try { const ns = (q.__col && q.__col.endsWith('/notifications') && window.__FS.notifs) || []; const docs = ns.map((n, i) => ({ id: n.id || ('n' + i), data: () => clone(n) })); cb({ docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) }); } catch (e) {} return () => {}; };
