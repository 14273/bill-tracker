/* ══════════════════════════════════════════
   账单记录工具 — Service Worker
   策略：Cache First（壳） + Network First（外部CDN）
══════════════════════════════════════════ */

const CACHE_NAME = 'bill-tracker-v2';

// 本地资源：安装时预缓存
const PRECACHE = [
  './bill-tracker.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Install：预缓存所有本地资源 ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] 预缓存失败:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate：清理旧版缓存 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch 路由策略 ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // CDN 资源（Chart.js）→ Network First，失败走缓存
  if (url.origin !== self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 本地资源 → Cache First，缓存不命中则请求网络并缓存
  event.respondWith(cacheFirst(request));
});

/* ── 策略函数 ── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 无网络也无缓存：返回离线提示页（对 HTML 导航请求）
    if (request.mode === 'navigate') {
      const cached = await caches.match('./bill-tracker.html');
      if (cached) return cached;
    }
    return new Response('离线中，资源加载失败', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('网络不可用', { status: 503 });
  }
}
