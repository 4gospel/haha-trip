// 하하가족여행 — 인터넷이 끊겨도 화면은 열리게 (전문가 검토 2026-11-26 반영)
// · 화면(HTML): 인터넷을 3초까지만 기다리고 늦으면 받아 둔 것 · 판 번호(?v=)가 붙은 파일·그림·라이브러리: 받아 둔 것 먼저
// · 성공한 응답만 담음(404·와이파이 로그인 화면이 좋은 사본을 덮지 않게) · 스크립트 자리에 HTML을 주지 않음
// · 「여행 전 준비」로 받은 haha-assets-* 는 새 판이 나와도 지우지 않음
const C = 'haha-v64';
const ASSETS = 'haha-assets-v1';
const SHELL = ['./', 'index.html', 'app.css?v=64', 'guide.js?v=64', 'book-osaka.js?v=64', 'app.js?v=64', 'favicon.png', 'manifest.webmanifest', 'assets.json', 'lib/qrcode.js', 'lib/jsbarcode.min.js', 'lib/zxing.min.js', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && /^haha-v/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const good = r => r && r.ok && !r.redirected && r.type === 'basic';
const keep = (req, r) => { if (good(r)) { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); } return r; };
const fromCache = req => caches.match(req).then(r => r || caches.match(req, { ignoreSearch: true }));
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.searchParams.has('fresh')) return; // 새 판 확인은 늘 인터넷으로, 담지 않음
  if (req.mode === 'navigate') {
    const net = fetch(req).then(r => keep(req, r));
    e.respondWith(timeout(net, 3000).catch(() => fromCache(req).then(r => r || caches.match('index.html') || net)));
    return;
  }
  const versioned = u.searchParams.has('v') || /\/(img|audio|lib)\//.test(u.pathname) || /\.(png|webp|jpg|svg|m4a|woff2?)$/.test(u.pathname);
  if (versioned) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => keep(req, n)).catch(() => caches.match(req, { ignoreSearch: true }).then(o => o || Response.error()))));
    return;
  }
  e.respondWith(fetch(req).then(r => keep(req, r)).catch(() => fromCache(req).then(r => r || Response.error())));
});
