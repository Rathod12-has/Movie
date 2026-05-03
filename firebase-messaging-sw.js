importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

// --- 1. FIREBASE BACKGROUND MESSAGING ---
const firebaseConfig = {
    apiKey: "AIzaSyC7uuy0yYV3L17RJ0RvbN-mrfqrT4PquMo",
    authDomain: "devi-sri-delights.firebaseapp.com",
    projectId: "devi-sri-delights",
    storageBucket: "devi-sri-delights.firebasestorage.app",
    messagingSenderId: "73108349440",
    appId: "1:73108349440:web:8ca038c61c9a85b2b12ee5"
};
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
    const notificationTitle = payload?.notification?.title || "🎉 Order Ready!";
    const notificationOptions = {
        body: payload?.notification?.body || "Your food is ready for pickup!",
        icon: "https://cdn-icons-png.flaticon.com/512/3170/3170733.png",
        vibrate: [200, 100, 200],
        requireInteraction: true
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});

// --- 2. PWA OFFLINE CACHING ---
const CACHE_NAME = 'dsd-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/firebase-app.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});
      
