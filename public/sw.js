// public/sw.js
const CACHE_NAME = 'drift-crm-v1';
const urlsToCache = [
  '/',
  '/auth',
  '/admin',
  '/superadmin',
  '/manifest.json',
  '/brand/logo-circle.png',
  '/icons/brain.png',
  '/icons/calendar.png',
  '/icons/phone.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
