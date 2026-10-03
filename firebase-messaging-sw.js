// firebase-messaging-sw.js
// Required by Firebase Cloud Messaging for Web Push.
// Must be served from the SAME origin as the main app, at the ROOT of the
// path scope you want it to control (for this project: the same folder as
// english_dashboard-dynamic.html, uploaded to GitHub Pages alongside it).
// Do NOT rename or move this file without also updating the
// navigator.serviceWorker.register('firebase-messaging-sw.js') call in the
// main HTML's registerPushToken() function.

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

// Minimal foundation only: show a basic notification for background messages.
// No automatic notification rules are defined yet — this just lets a push
// sent to this registration token actually display something.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'SS Daily Progress Track';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: (payload.notification && payload.notification.icon) || undefined
  };
  self.registration.showNotification(title, options);
});
