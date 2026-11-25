// 하하가족여행 — 인터넷이 끊겨도 화면은 열리게 (새 판은 늘 인터넷 먼저)
const C = 'haha-v37';
const SHELL = ['./', 'index.html', 'app.css?v=34', 'guide.js?v=34', 'app.js?v=34', 'favicon.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
