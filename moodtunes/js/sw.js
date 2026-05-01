// moodtunes service worker
var CACHE = 'moodtunes-v1';
var STATIC = [
  '/index.html',
  '/playlists.html',
  '/history.html',
  '/discover.html',
  '/login.html',
  '/css/style.css',
  '/css/mobile.css',
  '/css/history.css',
  '/css/playlists.css',
  '/css/discover.css',
  '/css/auth.css',
  '/js/api.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/config.js',
  '/js/discover.js',
  '/js/history.js',
  '/js/playlists.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // always hit network for API calls
  if (e.request.url.includes('/api/') || e.request.url.includes('spotify.com') || e.request.url.includes('audioscrobbler')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        // cache new static files
        if (response.ok && e.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return cached;
      });
    })
  );
});