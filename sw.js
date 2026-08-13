/* The Supply Station - offline support for the home-screen app.
 *
 * Caching rules, in priority order:
 *   1. Anything that isn't a GET is left completely alone. Supabase writes
 *      (adding stock, placing an order) must never be replayed from a cache.
 *   2. Supabase and EmailJS are never cached. Inventory counts and order state
 *      have to be live, or two volunteers on two iPads see different shelves.
 *   3. The page itself is network-first, so when the client pushes an update
 *      the iPad picks it up on the next launch instead of pinning to an old build.
 *   4. Icons, logo and the CDN libraries are cache-first, refreshed in the
 *      background. These are the parts that make it open instantly.
 *
 * Bump VERSION to force every client to drop its old cache.
 */

var VERSION = 'v1';
var CACHE = 'supply-station-' + VERSION;

// How long to wait on the network for the page before falling back to the
// cached copy. Church wifi is often "connected but crawling", which is worse
// than being offline — without this the app would just hang on a white screen.
var NAV_TIMEOUT_MS = 4000;

var CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

// The two libraries the app needs to boot. They're precached rather than left
// to be picked up opportunistically: without them `emailjs.init()` throws on
// startup and the whole page dies, so "cached eventually" isn't good enough.
var CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo-256.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
].concat(CDN_LIBS);

// Hosts whose responses must always come straight from the network.
var LIVE_HOSTS = ['supabase.co', 'emailjs.com'];

function isLiveHost(hostname) {
  for (var i = 0; i < LIVE_HOSTS.length; i++) {
    if (hostname === LIVE_HOSTS[i] || hostname.endsWith('.' + LIVE_HOSTS[i])) return true;
  }
  return false;
}

function isCacheableHost(url) {
  if (url.origin === self.location.origin) return true;
  return CDN_HOSTS.indexOf(url.hostname) !== -1;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll is atomic — one 404 would abort the whole install and leave the
      // app with no offline support at all. Add individually and tolerate misses.
      return Promise.all(
        SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          return k !== CACHE ? caches.delete(k) : null;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function offlineFallback() {
  return new Response(
    '<!doctype html><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>The Supply Station - Offline</title>' +
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
      'max-width:30rem;margin:20vh auto;padding:0 1.5rem;text-align:center;color:#1a2744">' +
      '<h1 style="font-size:1.35rem;margin-bottom:.6rem">No connection</h1>' +
      '<p style="color:#5f5e5a;line-height:1.5">The Supply Station needs internet the first ' +
      'time it opens. Reconnect and try again.</p></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Network-first with a timeout. If the network is slow we serve the cached page
// immediately, but let the real request finish so the cache still gets updated.
function navigateStrategy(request) {
  return new Promise(function (resolve) {
    var settled = false;

    function finish(response) {
      if (settled) return;
      settled = true;
      resolve(response);
    }

    var timer = setTimeout(function () {
      caches.match('./index.html').then(function (hit) {
        if (hit) finish(hit);
      });
    }, NAV_TIMEOUT_MS);

    fetch(request)
      .then(function (response) {
        clearTimeout(timer);
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (c) {
            c.put('./index.html', copy);
          });
        }
        finish(response);
      })
      .catch(function () {
        clearTimeout(timer);
        caches.match('./index.html').then(function (hit) {
          finish(hit || offlineFallback());
        });
      });
  });
}

// A cross-origin script tag without crossorigin="anonymous" yields an opaque
// response: status 0, ok === false. Checking only `ok` silently drops those and
// they never make it into the cache. The script tags now request CORS properly,
// but accept opaque too so a CDN that stops sending ACAO degrades instead of
// leaving the app with nothing cached.
function isStorable(response) {
  if (!response) return false;
  return response.ok || response.type === 'opaque';
}

// Cache-first, revalidating in the background.
function assetStrategy(request) {
  return caches.match(request).then(function (hit) {
    var network = fetch(request)
      .then(function (response) {
        if (isStorable(response)) {
          var copy = response.clone();
          caches.open(CACHE).then(function (c) {
            c.put(request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return hit;
      });

    return hit || network;
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Rule 1: never come between the app and a write.
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // Rule 2: live data goes straight to the network, cached never.
  if (isLiveHost(url.hostname)) return;

  // Rule 3: the page itself.
  if (request.mode === 'navigate') {
    event.respondWith(navigateStrategy(request));
    return;
  }

  // Rule 4: our own assets and the two CDN libraries.
  if (isCacheableHost(url)) {
    event.respondWith(assetStrategy(request));
  }
});
