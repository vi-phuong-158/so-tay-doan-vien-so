const CACHE = 'so-tay-doan-vien-v1';
const SHELL = ['/', '/brand/app-icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  // Do not cache Supabase API calls or anything outside our origin
  if (url.origin !== self.location.origin) return;
  // Do not cache API endpoints if we ever have them locally
  if (url.pathname.startsWith('/api')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then(response => {
        // Only cache successful responses for static assets
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        // Cache assets like CSS, JS, images, fonts
        if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/')) {
          const responseToCache = response.clone();
          caches.open(CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    }).catch(() => {
      return caches.match('/');
    })
  );
});
