// public/sw.js
const CACHE_NAME = 'timeclock-pwa-v1'

// Add core stuff you want available offline.
// Vite will build hashed assets, so we do a runtime cache for JS/CSS below too.
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))))
      await self.clients.claim()
    })()
  )
})

// Cache-first for same-origin assets (JS/CSS/images), network-first for navigations.
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  // Only handle same-origin
  if (url.origin !== self.location.origin) return

  // SPA navigation: try network, fall back to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(CACHE_NAME)
          cache.put('/index.html', fresh.clone())
          return fresh
        } catch {
          const cached = await caches.match('/index.html')
          return cached || Response.error()
        }
      })()
    )
    return
  }

  // Static asset requests: cache-first, then network
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      if (cached) return cached

      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE_NAME)

        // Cache common asset types
        const isAsset =
          req.destination === 'script' ||
          req.destination === 'style' ||
          req.destination === 'image' ||
          req.destination === 'font'

        if (isAsset && fresh.ok) cache.put(req, fresh.clone())
        return fresh
      } catch {
        return cached || Response.error()
      }
    })()
  )
})
