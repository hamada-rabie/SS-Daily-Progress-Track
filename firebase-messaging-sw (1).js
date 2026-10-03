// firebase-messaging-sw.js
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
