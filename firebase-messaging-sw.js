// firebase-messaging-sw.js
// PWA + offline caching is intentionally integrated into this SAME service worker.
// Do not create a second service worker: Firebase Cloud Messaging and the PWA
// shell must share this root-scope worker.

const PWA_CACHE = 'ss-dpt-pwa-v13';
const APP_SHELL = [
  './index.html?v=20261006',
  './index.html',
  './login.html?v=20261006',
  './english_dashboard-dynamic.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './favicon.svg',
  './firebase-messaging-sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PWA_CACHE);
    await Promise.all(APP_SHELL.map(async (asset) => {
      try { await cache.add(asset); }
      catch (err) { console.warn('PWA shell asset cache warning:', asset, err); }
    }));
    await self.skipWaiting();
  })().catch(err => console.warn('PWA shell install warning:', err)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('ss-dpt-pwa-') && key !== PWA_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Navigation requests: prefer the network so the teacher gets the latest app,
// but fall back to the cached shell when offline.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  if(url.origin === self.location.origin){
    event.respondWith(
      fetch(request)
        .then(response => {
          if(response && response.ok){
            const copy = response.clone();
            caches.open(PWA_CACHE).then(cache => cache.put(request, copy)).catch(()=>{});
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./english_dashboard-dynamic.html')))
    );
    return;
  }

  // Runtime-cache static CDN assets after the first successful online load.
  // Firestore writes/reads are not affected because the SDK uses non-GET
  // requests for its backend operations.
  if(url.protocol === 'https:' && (
    url.hostname === 'www.gstatic.com' ||
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  )){
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(response => {
          if(response && (response.ok || response.type === 'opaque')){
            const copy = response.clone();
            caches.open(PWA_CACHE).then(cache => cache.put(request, copy)).catch(()=>{});
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Required by Firebase Cloud Messaging for Web Push.
// Must be served from the SAME origin as the main app, at the ROOT of the
// path scope you want it to control (for this project: the same folder as
// english_dashboard-dynamic.html, uploaded to GitHub Pages alongside it).
// Do NOT rename or move this file without also updating the
// navigator.serviceWorker.register('firebase-messaging-sw.js') /
// getRegistration('firebase-messaging-sw.js') calls in the main HTML's
// registerPushToken() / deactivatePushToken() functions.

importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

// Same public client config as the main app (projectId, appId, etc. are not
// secrets — Firebase's actual security boundary is Firestore Security Rules,
// not hiding these values). Keep this block identical to firebaseConfig in
// english_dashboard-dynamic.html if that project config ever changes.
firebase.initializeApp({
  apiKey: "AIzaSyAlrLU20zWisISrmZKAMBNoAxclSA8B9iY",
  authDomain: "ss-daily-progress-track.firebaseapp.com",
  projectId: "ss-daily-progress-track",
  storageBucket: "ss-daily-progress-track.firebasestorage.app",
  messagingSenderId: "946203049271",
  appId: "1:946203049271:web:7534618a40b304ac722eb2"
});

const messaging = firebase.messaging();

// Background push (tab/app not focused, or fully closed): show an OS-level
// notification. The actual read/unread record that drives the in-app
// Notification Center lives in Firestore (users/{uid}/notifications/{id}),
// written by whatever sends the push — this handler's only job is to make
// the push visible to the teacher at the OS level when they're not already
// looking at the app.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'SS Daily Progress Track';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: (payload.notification && payload.notification.icon) || undefined,
    badge: (payload.notification && payload.notification.icon) || undefined,
    tag: (payload.data && payload.data.notificationId) || undefined,
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

// Clicking the OS notification must bring the teacher into the app (focusing
// an already-open tab if there is one, otherwise opening a new one), so the
// push connects back to the in-app Notification Center instead of being a
// dead end. Without this handler the notification just closes on click and
// does nothing — the gap this file previously had.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.registration.scope; // the app's own root, e.g. the GitHub Pages folder this SW controls
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.indexOf(targetUrl) === 0 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
