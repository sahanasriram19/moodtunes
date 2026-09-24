// moodtunes service worker
//
// strategy:
// - app files (pages, css, js, images): network first, so an installed app always
//   gets your latest deploy; the saved copy is only used when you're offline
// - google fonts: served from the saved copy (font files never change)
// - backend api + spotify: never touched here (always live)
// - offline and the page isn't saved: show offline.html
//
// bump VERSION only if you want to force-clear everyone's saved copies

var VERSION = 'v2';
var CACHE = 'moodtunes-' + VERSION;
var FONT_CACHE = 'moodtunes-fonts';

var APP_SHELL = [
  'index.html', 'playlists.html', 'session.html', 'history.html', 'stats.html', 'login.html', 'offline.html',
  'manifest.json',
  'css/style.css', 'css/mobile.css', 'css/motion.css', 'css/session.css', 'css/history.css',
  'css/playlists.css', 'css/stats.css', 'css/auth.css',
  'js/config.js', 'js/api.js', 'js/mood.js', 'js/app.js', 'js/session.js', 'js/history.js',
  'js/playlists.js', 'js/stats.js', 'js/help.js', 'js/profile.js', 'js/auth.js',
  'images/moodtunes_logo.png', 'images/favicon.png',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png'
];

// how long to wait for the network on a page load before using the saved copy
var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // save each file on its own, so one missing file can't break the whole install
      return Promise.all(APP_SHELL.map(function(path) {
        return cache.add(new Request(path, { cache: 'reload' })).catch(function() {});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) {
        return k.indexOf('moodtunes-') === 0 && k !== CACHE && k !== FONT_CACHE;
      }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

function networkFirst(request, timeoutMs) {
  return new Promise(function(resolve) {
    var settled = false;
    function finish(response) {
      if (settled) return;
      settled = true;
      resolve(response);
    }
    function savedCopy() {
      return caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    }
    // slow network: switch to the saved copy if we have one, otherwise keep waiting
    var timer = timeoutMs ? setTimeout(function() {
      savedCopy().then(function(hit) { if (hit) finish(hit); });
    }, timeoutMs) : null;

    fetch(request).then(function(response) {
      clearTimeout(timer);
      if (response && response.ok && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(request, copy); });
      }
      finish(response);
    }).catch(function() {
      // no network at all: saved copy, then the offline page for page loads
      clearTimeout(timer);
      savedCopy().then(function(hit) {
        if (hit) return finish(hit);
        if (request.mode === 'navigate') return caches.match('offline.html').then(finish);
        finish(Response.error());
      });
    });
  });
}

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function(cache) {
    return cache.match(request).then(function(hit) {
      if (hit) return hit;
      return fetch(request).then(function(response) {
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // fonts
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // anything else on another origin (backend api, spotify, album art): leave alone
  if (url.origin !== self.location.origin) return;

  // the service worker file itself and dev-server extras
  if (url.pathname.endsWith('/sw.js')) return;

  e.respondWith(networkFirst(req, req.mode === 'navigate' ? NETWORK_TIMEOUT_MS : 0));
});