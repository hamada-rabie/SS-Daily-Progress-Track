
export const getAuth = () => { const a = { currentUser: null }; window.__authObj = a; return a; };
export const setPersistence = () => Promise.resolve();
export const browserLocalPersistence = {};
export const signOut = () => Promise.resolve();
export const onAuthStateChanged = (a, cb) => { const u = window.__FS.user || null; if (u) a.currentUser = u; setTimeout(() => cb(u), 40); return () => {}; };
