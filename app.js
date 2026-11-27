/* 하하가족여행 2 — 가족이 함께 고치는 여행 앱
 * 원본: 4gospel 구글 드라이브(앱스 스크립트 서버). 이 기기에는 사본과 못 보낸 고침만.
 * 사진은 찍는 즉시 드라이브 「하하가족여행/사진」에 보관, 글자는 서버가 읽어 칸을 채움(사람이 확인 후 간직). */
(() => {
'use strict';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? '/api'
  : 'https://script.google.com/macros/s/AKfycbzW5yTlddAZEjsqm0qbM9KZw2be-0xYKISxUu4BrxR2DSHzfyadiW3MF_OziGKh3Kc3Ww/exec';
const COLS = ['trips', 'items', 'bookings', 'spends', 'checks', 'notes', 'places', 'recs', 'parks', 'memos'];

/* ---------- 이 기기 저장 ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('haha.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('haha.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('haha.' + k); } catch (e) {} }
};
const empty = () => { const d = { rev: 0, meta: { family: [] } }; COLS.forEach(c => d[c] = {}); return d; };
const norm = d => { d = d || empty(); COLS.forEach(c => d[c] = d[c] || {}); d.meta = d.meta || { family: [] }; d.meta.family = d.meta.family || []; return d; };

let D = norm(LS.get('data', null));
let Q = LS.get('q', []);
let PASS = LS.get('pass', '');
let LOGGING = false;
let ME = LS.get('me', '');
const UI = { mode: LS.get('mode', 'tl'), pcat: LS.get('pcat', '전체'), recK: '전체', memK: 'note', day: {}, showPast: false };
const slim = d => { const c = JSON.parse(JSON.stringify(d)); ['notes', 'spends', 'bookings', 'parks', 'places', 'trips'].forEach(k => Object.values(c[k] || {}).forEach(r => { if (r && r.thumb) delete r.thumb; if (r && r.cover && k === 'trips') delete r.cover; })); return c; };
const persist = () => {
  let okQ = LS.set('q', Q);
  if (!okQ) { LS.set('data', slim(D)); okQ = LS.set('q', Q); } // 못 보낸 고침이 먼저(데이터 전문가)
  if (!LS.set('data', D) && !LS.set('data', slim(D)) && !persist.warned) { persist.warned = true; setTimeout(() => toast('휴대폰 저장 공간이 모자라요. 인터넷에 연결되면 구글에 저장돼요'), 50); }
  if (!okQ && !persist.qw) { persist.qw = true; setTimeout(() => toast('고친 내용을 이 휴대폰에 담지 못했어요. 인터넷 연결을 확인해 주세요'), 50); }
};
if (LS.get('big', false)) document.documentElement.classList.add('big');
if (LS.get('solid', false)) document.documentElement.classList.add('solid'); // 「선명하게」 — 유리 효과 끄기(전문가 의견 2026-11-26)

/* ---------- 작은 도구 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const live = (c, trip) => Object.values(D[c]).filter(r => r && !r.del && (trip == null || r.trip === trip));
const comma = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const WK = '일월화수목금토';
const pd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const ymd = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const today = () => ymd(new Date());
const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const md = s => { if (!s) return ''; const d = pd(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WK[d.getDay()] + ')'; };
const dayDiff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
function daysOf(t) {
  const out = []; if (!t.start || !t.end) return out;
  for (let d = pd(t.start); d <= pd(t.end) && out.length < 60; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}
function phase(t) {
  const t0 = today();
  if (t0 < t.start) return 'before';
  if (t0 > t.end) return 'after';
  if (t0 === t.start) return 'first';
  if (t0 === t.end) return 'last';
  return 'during';
}
function ddayText(t) {
  const n = dayDiff(today(), t.start), e = dayDiff(today(), t.end);
  if (n > 0) return 'D-' + n;
  if (e >= 0) return (1 - n) + '일째';
  return '다녀옴';
}
const CUR = { CHF: '스위스 프랑', CZK: '코루나', JPY: '엔', KRW: '원', USD: '달러', EUR: '유로', CNY: '위안', TWD: '대만달러', THB: '바트', VND: '동', PHP: '페소', SGD: '싱가포르달러', GBP: '파운드', AUD: '호주달러', HKD: '홍콩달러' };
const unit = c => CUR[c] || c || '';
/* 여행 돈이 아닌 돈(예: 인천 면세 달러)은 저장된 환율, 없으면 대략 값 — 100단위 = 몇 원 */
const FX_APPROX = { USD: 145000, EUR: 155000, JPY: 930, TWD: 4500, VND: 5.7, THB: 4100, HKD: 18500, CNY: 20000, KRW: 100 };
const toWon = (t, amt, cur) => { amt = Number(amt) || 0; cur = cur || t.cur || 'KRW'; if (cur === 'KRW') return amt; const r = cur === t.cur ? Number(t.rate) : ((LS.get('fx.' + cur, {}) || {}).rate || FX_APPROX[cur] || Number(t.rate)); return amt * (Number(r) || 0) / 100; };
const manWon = w => Math.abs(w) >= 10000 ? (Math.round(w / 1000) / 10).toLocaleString('ko-KR') + '만 원' : comma(w) + '원';
const mapUrl = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const dirUrl = (q, lat, lng) => 'https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=' + encodeURIComponent(lat ? lat + ',' + lng : q);
/* 네이버 지도 — 국내는 장소·길찾기 모두 네이버(가족이 애용), 해외(일본 등)는 한국어 지도로 장소 보기만(네이버 길찾기는 국내만) · 휴대폰은 네이버 지도 앱(nmap://), 컴퓨터는 map.naver.com */
const UA = navigator.userAgent || '', ANDR = /Android/i.test(UA), IOSD = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1), MOBD = ANDR || IOSD;
const NV_APP = encodeURIComponent(location.origin + location.pathname);
const inKR = (lat, lng) => lat >= 33 && lat <= 38.7 && lng >= 124.5 && lng <= 131.9;
const nvApp = (path, qs) => { const u = path + '?' + qs + '&appname=' + NV_APP; return ANDR ? 'intent://' + u + '#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end' : 'nmap://' + u; };
const nvWebQ = q => 'https://map.naver.com/p/search/' + encodeURIComponent(q);
const nvMerc = (lat, lng) => [(lng * 20037508.34 / 180).toFixed(2), (Math.log(Math.tan((90 + Number(lat)) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180).toFixed(2)];
/* 장소 보기 */
function nvPlace(q, lat, lng) {
  q = String(q || '').trim();
  if (!MOBD) return nvWebQ(q);
  return lat != null && inKR(lat, lng) ? nvApp('place', 'lat=' + lat + '&lng=' + lng + '&name=' + encodeURIComponent(q)) : nvApp('search', 'query=' + encodeURIComponent(q));
}
/* 길찾기(국내) — mode: public|walk|car · 좌표가 없으면 장소 찾기로 */
function nvRoute(q, lat, lng, mode, from) {
  q = String(q || '').trim(); mode = mode || 'public';
  if (lat == null) return nvPlace(q);
  if (!MOBD) {
    const [x, y] = nvMerc(lat, lng), f = from && from.lat != null ? nvMerc(from.lat, from.lng).join(',') + ',' + encodeURIComponent(from.name || '') + ',,ADDRESS_POI' : '-';
    return 'https://map.naver.com/p/directions/' + f + '/' + x + ',' + y + ',' + encodeURIComponent(q) + ',,ADDRESS_POI/-/' + ({ public: 'transit', walk: 'walk', car: 'car' }[mode] || 'transit');
  }
  return nvApp('route/' + mode, (from && from.lat != null ? 'slat=' + from.lat + '&slng=' + from.lng + '&sname=' + encodeURIComponent(from.name || '') + '&' : '') + 'dlat=' + lat + '&dlng=' + lng + '&dname=' + encodeURIComponent(q));
}
/* 한국 안의 곳인가 — 좌표·나라·여행 나라로 */
const isKR = (t, r) => r && r.lat != null ? inKR(r.lat, r.lng) : r && r.cc ? r.cc === 'KR' : r && r.place ? KR_RE.test(r.place) || (!!t && !abroad(t) && !/공항|airport/i.test(r.place) ? true : false) : !!t && !abroad(t);
/* 길찾기 단추 하나(일정 줄·숙소) — 국내는 네이버, 해외는 구글 */
const goTo = (t, q, r) => isKR(t, r) ? nvRoute(q, r && r.lat, r && r.lng, 'public') : dirUrl(q);
const nvA = (href, cls, inner) => '<a class="' + cls + (/^(nmap|intent):/.test(href) ? ' nvapp' : '') + '" href="' + esc(href) + '"' + (/^https:/.test(href) ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>';
const safeUrl = u => /^https:\/\//i.test(String(u || '')) ? u : '';
const safeImg = u => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || '')) ? u : '';

const CATS = ['이동', '관광', '식사', '간식', '숙소', '쇼핑', '기타'];
/* 쓴 돈은 일정보다 조금 더 나눔(2026-11-26) — 저장 값은 짧은 낱말 그대로, 화면엔 풀어 쓴 이름 */
const SPEND_CATS = ['식사', '간식', '이동', '관광', '숙소', '쇼핑', '선물', '통신', '준비', '기타'];
const SPEND_NAME = { 식사: '🍜 식사', 간식: '☕ 간식·카페', 이동: '🚆 교통', 관광: '🎟️ 입장·체험', 숙소: '🛏️ 숙소', 쇼핑: '🛍️ 쇼핑', 선물: '🎁 선물·기념품', 통신: '📶 유심·와이파이', 준비: '🛂 보험·여권·준비', 기타: '기타' };
const SPEND_IC = { 이동: 'plane', 숙소: 'bed', 식사: 'bowl', 쇼핑: 'bag', 간식: 'cup', 관광: 'ticket', 선물: 'gift', 통신: 'plug', 준비: 'doc' };
const cc = c => 'var(--c-' + (CATS.includes(c) || SPEND_CATS.includes(c) || c === '주차' ? c : '기타') + ')';
const RECC = { 명소: '관광', 맛집: '식사', 쇼핑: '쇼핑', 팁: '이동', 숙소: '숙소' };
const AVC = ['#4C8DF6', '#F2629B', '#FF7A59', '#22BFA0', '#9B7BF2', '#E8A400'];
const fam = n => D.meta.family.find(f => f.name === n);
const famIdx = n => Math.max(0, D.meta.family.findIndex(f => f.name === n));
const faceOf = n => { const r = (fam(n) || {}).role || ''; return /아빠|아버지/.test(r) ? 'dad' : /엄마|어머니/.test(r) ? 'mom' : /딸/.test(r) ? 'daughter' : /아들/.test(r) ? 'son' : ''; };
const av = (n, sz) => { const f = faceOf(n); return '<span class="av' + (f ? ' face' : '') + '" style="background:' + AVC[famIdx(n) % AVC.length] + (sz ? ';width:' + sz + 'px;height:' + sz + 'px' : '') + '">' + (f ? '<img src="img/face-' + f + '.webp" alt="' + esc(n) + '">' : esc(String(n || '?').slice(-2))) + '</span>'; };

const ICON = {
  back: '<path d="M15 18l-6-6 6-6"/>', down: '<path d="M6 9l6 6 6-6"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  plan: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 14h3M7.5 17h6"/>',
  money: '<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10h19M16.5 14.5h2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M9 7.5h7M9 11h5"/>',
  memory: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  recs: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  prep: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  walk: '<circle cx="13.5" cy="4.5" r="1.9"/><path d="M12.8 8.2 10.6 13l2.9 2.6 1.2 5.4M10.6 13 7.5 15M12.8 8.2l3 2.8 2.7-.4M10.4 17.2 8 21"/>', // 걸어서(사람이 걷는 모습)
  landmark: '<path d="M6 21V3.5M6 4h11l-2.3 3.8L17 11.5H6"/><path d="M3.5 21h6"/>', // 주변 볼거리(깃발)
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  plane: '<path d="M2.5 12h19M14 12l-4.5-7h-2l2.5 7M14 12l-4.5 7h-2l2.5-7M5 12L3.5 9H5l2 3M5 12l-1.5 3H5l2-3"/>',
  bed: '<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-8v1"/><circle cx="7" cy="10.5" r="1.8"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 21l2-4M15.5 21l-2-4"/>',
  park: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9.5 17V7.5h3.2a2.8 2.8 0 0 1 0 5.6H9.5"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M3.5 16h17v3h-3v-1.5h-11V19h-3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  notion: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8.5 16.5v-8l7 8v-8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  food: '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.2-3.5 4-3.5 8h3.5"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.8"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>', phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>', text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  sos: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="14" rx="3"/><path d="M4.5 11h15M7 17.5V20M17 17.5V20M7.5 6.5h9"/><circle cx="8" cy="14.3" r=".9"/><circle cx="16" cy="14.3" r=".9"/>',
  taxi: '<path d="M5 15v-4l2-4.5h10L19 11v4M3.5 15h17v3.5h-3V17h-11v1.5h-3z"/><path d="M9.5 6.5L10 4h4l.5 2.5"/><circle cx="7.5" cy="12.8" r="1"/><circle cx="16.5" cy="12.8" r="1"/>',
  torii: '<path d="M3 5.5Q12 7.5 21 5.5M4.5 9h15M7 5.8V21M17 5.8V21M12 6.5V9"/>',
  tower: '<path d="M12 2.5v3M9.5 5.5h5l-1 5h-3zM10.5 10.5L8 21M13.5 10.5L16 21M9 16h6"/>',
  bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0zM8 20.5h8M9 3.5c0 2 1.5 2 1.5 4M13 3.5c0 2 1.5 2 1.5 4"/>',
  cup: '<path d="M4.5 8.5h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 10h1.5a2.5 2.5 0 0 1 0 5h-1.5M8 3.5c0 1.5 1 1.5 1 3M12 3.5c0 1.5 1 1.5 1 3"/>',
  basket: '<path d="M3.5 10h17l-2 10H5.5zM8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>',
  land: '<path d="M3 20.5h18M4 13.5l3.5 1 2-1 6.5 2.5c1.5.6 3 .2 3.5-.7.4-.9-.3-1.9-1.8-2.4L12 10.5 9.5 4.5l-2-.5 1 6-3.5-1L4 6.5 2.5 6l.5 5z"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  shirt: '<path d="M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9L6 10 3 7z"/>',
  pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.5 8.5l5 7"/>',
  brush: '<path d="M7 21V10h4v11zM9 10V6M6 3h6v3H6z"/><path d="M15 21v-6a3 3 0 0 1 6 0v6z"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 1-4 0"/><path d="M12 3v1"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13.5h2"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10M10 20v-5h4v5"/>',
  call: '<path d="M21 16.4v2.8a1.9 1.9 0 0 1-2.1 1.9A18.8 18.8 0 0 1 2.9 5.1 1.9 1.9 0 0 1 4.8 3h2.8a1.9 1.9 0 0 1 1.9 1.6c.1.9.4 1.8.7 2.6a1.9 1.9 0 0 1-.4 2L8.6 10.4a15.2 15.2 0 0 0 5 5l1.2-1.2a1.9 1.9 0 0 1 2-.4c.8.3 1.7.6 2.6.7a1.9 1.9 0 0 1 1.6 1.9z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>'
};
const ic = n => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>';
const ib = (n, color, sm) => '<span class="ib' + (sm ? ' sm' : '') + '" style="--cc:' + color + '">' + ic(n) + '</span>';
function itemIcon(i) {
  const x = (i.title || '') + ' ' + (i.place || '');
  if (/주차|입차|출차/.test(x)) return ['park', 'var(--c-주차)'];
  const KW = [[/리버\s*크루즈|유람선|크루즈|페리|배\s*타|보트/i, 'cruise', '이동'], [/온천|스파\s*월드|스파월드|목욕탕|대욕장|족욕/, 'onsen', '관광'], [/신칸센|하루카|특급/, 'shinkansen', '이동'],
    [/관람차|덴포잔|헵\s*파이브/, 'ferris', '관광'], [/가이유칸|수족관/, 'aquarium', '관광'], [/나라\s*공원|사슴|도다이지/, 'deer', '관광'], [/이자카야|술집|야키토리|선술집/, 'izakaya', '식사'],
    [/편의점|돈키호테|드럭|마트|로손|세븐일레븐|패밀리마트/, 'store', '쇼핑'], [/사진|포토|인생샷/, 'photo', '관광'], [/카운트다운|불꽃/, 'fireworks', '관광'], [/쉬기|쉬는|휴식|낮잠|자유\s*시간/, 'rest', '숙소'],
    [/병원|약국|진료/, 'hospital', '기타'], [/예배|교회|주일/, 'church', '기타'], [/해변|해수욕|비치|바닷가/, 'beach', '관광'], [/등산|트레킹|하이킹|산행|한라산|어리목|윗세오름|일출봉|오름/, 'hiking', '관광'], [/스키|스노보드|눈썰매/, 'ski', '관광'],
    [/렌터카|렌트카|드라이브/, 'rentcar', '이동'], [/자전거|바이크/, 'bike', '이동'], [/박물관|미술관|뮤지엄|뮤지움|문학관|전시/, 'museum', '관광'], [/공연|뮤지컬|콘서트|노래방/, 'show', '관광'], [/카트|레일바이크/, 'rentcar', '관광'], [/아쿠아/, 'aquarium', '관광'], [/숲|폭포|새연교|해안|올레/, 'walk', '관광']];
  for (const [re, n, c] of KW) if (re.test(x)) return [n, cc(c)];
  if (/도착/.test(x) && /공항|간사이|인천|airport/i.test(x) && !/셔틀|체크인/.test(x)) return ['land', 'var(--c-이동)'];
  if (/체크인/.test(x) && /공항/.test(x)) return ['plane', 'var(--c-이동)'];
  if (/출발|항공|7C\d|비행|탑승|airport|공항/i.test(x) && !/급행|셔틀|난카이|버스|→ ?덴가/.test(x)) return ['plane', 'var(--c-이동)'];
  if (/셔틀|버스/.test(x)) return ['bus', 'var(--c-이동)'];
  if (/택시/.test(x)) return ['taxi', 'var(--c-이동)'];
  if (i.cat === '이동') return ['train', 'var(--c-이동)'];
  if (/숙소|체크인|체크아웃|호텔|짐/.test(x) || i.cat === '숙소') return ['bed', 'var(--c-숙소)'];
  if (/오사카성|성 공원|천수각|castle/i.test(x)) return ['castle', 'var(--c-관광)'];
  if (/산책|걸어|걷기|산넨자카|니넨자카|골목|거리/.test(x) && i.cat !== '식사') return ['walk', 'var(--c-관광)'];
  if (i.cat === '식사' && !/시장/.test(x)) return ['bowl', 'var(--c-식사)'];
  if (i.cat === '간식' && !/시장/.test(x)) return ['cup', 'var(--c-간식)'];
  if (/USJ|유니버설|입장|티켓|파크/i.test(x)) return ['ticket', 'var(--c-관광)'];
  if (/신사|절|데라|사원|도리이|이나리/.test(x)) return ['torii', 'var(--c-관광)'];
  if (/전망|야경|타워|쓰텐카쿠|하루카스|스카이/.test(x)) return ['tower', 'var(--c-관광)'];
  if (/시장/.test(x)) return ['basket', i.cat === '쇼핑' ? 'var(--c-쇼핑)' : 'var(--c-식사)'];
  if (/카페|커피|디저트|아이스/.test(x) || i.cat === '간식') return ['cup', 'var(--c-간식)'];
  if (i.cat === '식사') return ['bowl', 'var(--c-식사)'];
  if (i.cat === '쇼핑') return ['bag', 'var(--c-쇼핑)'];
  if (i.cat === '관광') return ['camera', 'var(--c-관광)'];
  return ['pin', 'var(--c-기타)'];
}
const PREP_CAT = { 서류: ['doc', 'var(--sky)', 'docs'], 예약: ['ticket', 'var(--c-관광)', 'ticket'], 돈: ['wallet', 'var(--mint)', 'money'], 전자기기: ['plug', 'var(--lav)', 'device'], 옷: ['shirt', 'var(--coral)', 'clothes'],
  '세면·생활': ['brush', 'var(--sky)', 'toiletry'], 건강: ['pill', 'var(--pink)', 'medicine'], '출발 전': ['house', 'var(--sun)', 'home'], '돌아올 때': ['gift', 'var(--c-쇼핑)', 'gift'], 기타: ['bag', 'var(--c-기타)', 'bag'] };
function prepIcon(c) {
  const x = c.text || '';
  const k = /여권/.test(x) ? ['doc', 'var(--sky)', 'passport'] : /항공권|티켓|USJ|예약|e티켓/.test(x) ? ['ticket', 'var(--c-관광)', 'ticket'] : /카드|현금|엔화|환전|동전|ICOCA|트래블/.test(x) ? ['wallet', 'var(--mint)', 'money'] :
    /충전|배터리|어댑터|플러그|eSIM|유심|이어폰|카메라|멀티탭/.test(x) ? ['plug', 'var(--lav)', 'device'] : /약|밴드|마스크|핫팩/.test(x) ? ['pill', 'var(--pink)', 'medicine'] :
    /운동화|신발|슬리퍼/.test(x) ? ['shirt', 'var(--coral)', 'shoes'] : /외투|니트|목도리|장갑|모자|양말|속옷|잠옷|히트텍|옷/.test(x) ? ['shirt', 'var(--coral)', 'clothes'] :
    /칫솔|치약|화장|선크림|렌즈|안경|머리|물티슈|손수건/.test(x) ? ['brush', 'var(--sky)', 'toiletry'] : /우산/.test(x) ? ['umbrella', 'var(--sky)', 'umbrella'] :
    /가스|문단속|전기|화분|반려/.test(x) ? ['house', 'var(--sun)', 'home'] : /면세|기념품|선물/.test(x) ? ['gift', 'var(--c-쇼핑)', 'gift'] : null;
  return k || PREP_CAT[c.cat] || PREP_CAT.기타;
}
/** 제미나이 그림이 있으면 그것, 없으면 선 아이콘 */
const pic = (arr, sz) => '<span class="pic" style="--cc:' + arr[1] + (sz ? ';width:' + sz + 'px;height:' + sz + 'px' : '') + '">' + ic(arr[0]) + '<img src="img/prep-' + arr[2] + '.webp" alt="" onerror="this.remove()"></span>';
const IT_IMG = { cruise: 'cruise', onsen: 'onsen', shinkansen: 'shinkansen', ferris: 'ferris', aquarium: 'aquarium', deer: 'deer', izakaya: 'izakaya', store: 'store', photo: 'photo', fireworks: 'fireworks', rest: 'rest', hospital: 'hospital', church: 'church', beach: 'beach', hiking: 'hiking', ski: 'ski', rentcar: 'rentcar', bike: 'bike', museum: 'museum', show: 'show', castle: 'castle', walk: 'walk', basket: 'market', park: 'park', plane: 'plane', land: 'land', train: 'train', bus: 'bus', taxi: 'taxi', bed: 'hotel', bowl: 'food', cup: 'cafe', torii: 'temple', tower: 'tower', bag: 'shop', ticket: 'ticket' };
/** 색 네모 안의 컬러 이모티콘(네이버 단추처럼 — 팀장님 2026-11-27 「더 예쁜 이모티콘」) */
const eb = (e, bg) => '<span class="eb" style="--eb:' + bg + '" aria-hidden="true">' + e + '</span>';
const itPic = (icn, col, sm) => IT_IMG[icn] ? '<span class="ib itp' + (sm ? ' sm' : '') + '" style="--cc:' + col + '"><img src="img/it-' + IT_IMG[icn] + '.webp" alt=""></span>' : ib(icn, col, sm);
const MOOD = { happy: '😊', love: '🥰', laugh: '😆', tired: '😴', hot: '🥵', yum: '🤤' };
const moodKey = m => MOOD[m] ? m : Object.keys(MOOD).find(k => MOOD[k] === m) || '';
const moodImg = (m, sz) => { const k = moodKey(m); return k ? '<img class="mood" src="img/mood-' + k + '.webp" alt="" width="' + (sz || 24) + '" height="' + (sz || 24) + '">' : esc(m || ''); };
function foodArt(r) { const x = (r.name || '') + ' ' + (r.desc || ''); return /나라\s*공원|사슴/.test(x) ? 'it-deer' : /오사카성/.test(x) ? 'it-castle' : /시장/.test(x) ? 'it-market' : /수족관|가이유칸/.test(x) ? 'it-aquarium' : /관람차/.test(x) ? 'it-ferris' : /온천|스파/.test(x) ? 'it-onsen' : /글리코|도톤보리/.test(x) ? 'it-photo' : /다코야키|타코야키/.test(x) ? 'food-takoyaki' : /오코노미야키|미즈노/.test(x) ? 'food-okonomiyaki' : /구시카쓰|쿠시카츠/.test(x) ? 'food-kushikatsu' : /라멘|이치란|소바|우동/.test(x) ? 'it-food' : /치즈케이크|551|찐빵|카페|디저트/.test(x) ? 'it-cafe' : /유니버설|USJ/i.test(x) ? 'usj-day' : /신사|이나리|기요미즈|데라/.test(x) ? 'it-temple' : /전망|쓰텐카쿠|하루카스|스카이/.test(x) ? 'it-tower' : r.kind === '쇼핑' ? 'souvenir' : ''; }
const IATA = { 인천: 'ICN', 김포: 'GMP', 간사이: 'KIX', 오사카: 'KIX', 이타미: 'ITM', 나리타: 'NRT', 하네다: 'HND', 도쿄: 'NRT', 후쿠오카: 'FUK', 나고야: 'NGO', 삿포로: 'CTS', 오키나와: 'OKA', 나하: 'OKA', 제주: 'CJU', 김해: 'PUS', 부산: 'PUS', 청주: 'CJJ', 대구: 'TAE',
  타이베이: 'TPE', 방콕: 'BKK', 다낭: 'DAD', 세부: 'CEB', 괌: 'GUM', 홍콩: 'HKG', 싱가포르: 'SIN', 마쓰야마: 'MYJ', 다카마쓰: 'TAK', 기타큐슈: 'KKJ', 고마쓰: 'KMQ', 요나고: 'YGJ', 가고시마: 'KOJ', 오이타: 'OIT', 상하이: 'PVG', 하노이: 'HAN', 호찌민: 'SGN', 마닐라: 'MNL', 파리: 'CDG', 런던: 'LHR' };
function flightInfo(b) {
  const t = b.title || '';
  const m = t.match(/([가-힣A-Za-z]+)\s*(?:→|->|~)\s*([가-힣A-Za-z]+)/);
  const code = n => IATA[n] || (/^[A-Z]{3}$/.test(n) ? n : null);
  const fn = (t.match(/\b([A-Z0-9]{2}\s?\d{2,4})\b/) || [])[1] || '';
  const air = (t.match(/^([가-힣]+항공|[가-힣]+에어)/) || [])[1] || b.provider || '';
  if (!m || !code(m[1]) || !code(m[2])) return null;
  return { from: code(m[1]), to: code(m[2]), fromN: m[1], toN: m[2], fn, air };
}
const BK = { 항공: ['plane', 'var(--c-이동)'], 숙소: ['bed', 'var(--c-숙소)'], 티켓: ['ticket', 'var(--c-관광)'], 교통: ['train', 'var(--c-이동)'], 주차: ['park', 'var(--c-주차)'], 보험: ['doc', 'var(--pink)'], 서류: ['doc', 'var(--c-기타)'], 기타: ['ticket', 'var(--c-기타)'] };
const RC_IC = { 명소: 'recs', 맛집: 'food', 쇼핑: 'bag', 팁: 'bulb', 숙소: 'bed' };

/* ---------- 알림 띠·되돌리기·색종이 ---------- */
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button id="undo">되돌리기</button>' : ''); t.hidden = false;
  if (undo) $('#undo').onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, undo ? 5000 : 2800);
}
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#FF7A59', '#FFC23D', '#22BFA0', '#4C8DF6', '#9B7BF2', '#F2629B'];
  for (let i = 0; i < 60; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % 6]; s.style.animationDelay = Math.random() * .4 + 's'; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2000);
}
const buzz = () => { try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} };

/* ---------- 서버 ---------- */
/* 서버 부르기 — 시간 제한(약한 신호에서 「저장 중」이 끝나지 않던 것) · 기기 토큰(잠금 때도 가족 휴대폰은 들어감) — 전문가 검토 2026-11-26 */
const SLOW_FN = { readPhoto: 1, readFile: 1, photo: 1, tripScan: 1, tripCompose: 1, tripStory: 1, photoTranslate: 1, load: 1, apply: 1, exportDoc: 1, ticketImg: 1, routes: 1, geocode: 1, notionSync: 1 };
async function call(fn, ...args) {
  let r; const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = ac ? setTimeout(() => ac.abort(), SLOW_FN[fn] ? 90000 : 25000) : 0;
  const tok = LS.get('tok', '');
  try {
    try { r = await fetch(API, { method: 'POST', body: JSON.stringify({ pass: PASS, fn, args, tok, wantTok: !tok }), signal: ac ? ac.signal : undefined }); }
    catch (e) { const er = new Error('인터넷 연결을 확인해 주세요'); er.code = 'offline'; throw er; }
    let j; try { j = await r.json(); } catch (e) { const er = new Error(e && e.name === 'AbortError' ? '인터넷 연결을 확인해 주세요' : '서버 답이 이상해요'); er.code = e && e.name === 'AbortError' ? 'offline' : 'net'; throw er; }
    if (j.tok) LS.set('tok', j.tok);
    if (!j.ok) { const er = new Error(j.err === 'locked' ? '잘못된 암호가 많이 들어와 잠시 막혔어요. 10분쯤 뒤에 다시 해 주세요' : (j.msg || j.err)); er.code = j.err; throw er; }
    return j.v;
  } finally { if (tm) clearTimeout(tm); }
}
let flying = false, timer = 0, status = 'ok', INFLIGHT = null, RENDER_LATER = false;
function setStatus(s) { status = s; const el = $('#sync'); if (el) paintSync(el); }
function paintSync(el) {
  el.className = 'sync ' + (status === 'ok' ? '' : status);
  el.innerHTML = '<i></i>' + (status === 'wait' ? '저장 중' : status === 'bad' ? (Q.length ? '보낼 것 ' + Q.length : '연결 안 됨') : '구글에 저장됨');
}
function put(c, rec, quiet) {
  rec.ts = Math.max(Date.now(), (Number(rec.ts) || 0) + 1);
  rec.by = ME;
  if (c === 'meta') D.meta = rec; else D[c][rec.id] = rec;
  const qid = rec.id || 'meta';
  for (let k = Q.length - 1; k >= 0; k--) if (Q[k].c === c && Q[k].id === qid && !(INFLIGHT && INFLIGHT.has(Q[k]))) Q.splice(k, 1); // 보낼 줄이 쌓여 넘치지 않게(데이터 전문가)
  Q.push({ c, id: qid, v: rec });
  persist(); if (!quiet) render(); kick();
  return rec;
}
function remove(c, id, label) {
  const old = D[c][id]; if (!old) return;
  put(c, { id, trip: old.trip, del: true, ts: old.ts });
  toast((label || '') + ' 지웠어요', () => put(c, Object.assign({}, old)));
}
function kick(ms) { clearTimeout(timer); timer = setTimeout(flush, ms == null ? 400 : ms); }
async function flush() {
  if (flying || !Q.length || !PASS) return;
  flying = true; setStatus('wait');
  const ops = Q.slice(); INFLIGHT = new Set(ops);
  try {
    const d = await call('apply', ops, { slim: true });
    Q = Q.filter(o => !INFLIGHT.has(o)); INFLIGHT = null;
    if (d && d.meta === undefined && d.rev != null) { // 새 서버: 판 번호만 받음 — 그 사이 다른 가족이 고쳤으면 전체를 받음
      if (Number(d.prev) === Number(D.rev) && Number(d.rev) > Number(d.prev)) { D.rev = Number(d.rev); persist(); } else if (Number(d.rev) !== Number(D.rev)) setTimeout(pull, 50);
    } else adopt(d, true);
    setStatus('ok');
  } catch (e) {
    INFLIGHT = null; flying = false; setStatus('bad');
    if (e.code === 'pass') return relock();
    kick(6000); return;
  }
  flying = false;
  if (Q.length) kick(100);
}
const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('#app') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };
document.addEventListener('focusout', () => setTimeout(() => { if (RENDER_LATER && !typing()) { RENDER_LATER = false; render(); } }, 200));
function adopt(d, mine) {
  if (!mine && d && Number(d.rev) < Number(D.rev)) return; // 늦게 온 옛 사본(프로그램 전문가)
  d = norm(d);
  for (const op of Q) {
    if (op.c === 'meta') { d.meta = op.v; continue; }
    const cur = d[op.c][op.id];
    if (!cur || (cur.ts || 0) <= op.v.ts) d[op.c][op.id] = op.v;
  }
  if (!mine) othersChanged(d);
  const same = JSON.stringify(d) === JSON.stringify(D);
  D = d; persist();
  if (!same) { if (!mine && typing()) RENDER_LATER = true; else render(); }
}
/** 다른 가족이 고친 것 알려 주기 */
function othersChanged(d) {
  const seen = LS.get('seen', 0);
  let max = seen; const who = {};
  COLS.forEach(c => Object.values(d[c]).forEach(r => {
    if (!r || !r.ts) return;
    if (r.ts > max) max = r.ts;
    if (seen && r.ts > seen && r.by && r.by !== ME && r.by !== '하하' && r.by !== '도우미') who[r.by] = (who[r.by] || 0) + 1;
  }));
  LS.set('seen', max);
  const names = Object.keys(who);
  if (names.length) toast(names.map(n => ((fam(n) || {}).role || n) + '가 ' + who[n] + '개').join(', ') + ' 고쳤어요');
}
async function pull() {
  if (flying) { setTimeout(pull, 1500); return; }
  try { adopt(await call('load')); setStatus(Q.length ? 'wait' : 'ok'); if (Q.length) kick(); setTimeout(tkSync, 300); }
  catch (e) { if (e.code === 'pass') relock(); else setStatus('bad'); }
}
let POLL_AT = 0; // 앱으로 돌아올 때마다 묻되 5초 안에는 다시 묻지 않음(서버·전지 아끼기, 2026-11-27)
async function poll(force) {
  if (!PASS || document.hidden || flying) return;
  if (!force && Date.now() - POLL_AT < 5000) return;
  POLL_AT = Date.now();
  if (Q.length) return kick(0);
  try { const r = await call('rev'); if (r !== D.rev) pull(); else if (status === 'bad') setStatus('ok'); } catch (e) { setStatus('bad'); }
}
setInterval(() => poll(true), 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.addEventListener('online', () => poll(true));
function relock() { PASS = ''; LS.del('pass'); toast('가족 암호를 다시 넣어 주세요'); render(); }

/* ---------- 표지 그림 (코드로 그린 하늘·해·구름·도시) ---------- */
function partOfDay() { const h = new Date().getHours(); return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'dusk' : 'night'; }
const SKY = { dawn: ['#6E8BD8', '#F4A38C', '#FFD9A8'], day: ['#2F7DE8', '#6FB0FF', '#BFE3FF'], dusk: ['#3A3A7A', '#E2697B', '#FFB067'], night: ['#0B1636', '#1F2D63', '#3B4C8C'] };
function skyline(place) {
  const p = String(place || '');
  const ground = 'M0 188 H400 V220 H0Z';
  if (/오사카|osaka/i.test(p)) return ground +
    ' M58 188 L66 168 H134 L142 188Z M78 168 V150 H122 V168Z M70 152 L130 152 L120 140 L80 140Z M86 140 V126 H114 V140Z M80 128 L120 128 L112 116 L88 116Z M92 116 L108 116 L100 104Z' +
    ' M292 188 L298 150 H306 L312 188Z M297 152 V96 H307 V152Z M291 98 H313 V84 H291Z M301 84 V60 H303 V84Z' +
    ' M160 188 V160 H182 V188Z M186 188 V146 H204 V188Z M208 188 V166 H228 V188Z M236 188 V136 H254 V188Z M258 188 V156 H280 V188Z M326 188 V150 H346 V188Z M350 188 V170 H372 V188Z M376 188 V158 H396 V188Z M8 188 V170 H30 V188Z';
  if (/교토|kyoto/i.test(p)) return ground +
    ' M300 188 V176 H330 V188Z M290 178 L340 178 L330 170 L300 170Z M303 170 V160 H327 V170Z M294 162 L336 162 L326 154 L304 154Z M306 154 V146 H324 V154Z M298 148 L332 148 L323 140 L307 140Z M309 140 V132 H321 V140Z M302 134 L328 134 L320 127 L310 127Z M314 127 V108 H316 V127Z' +
    ' M70 188 V168 M72 168 H120 M66 160 H126 M78 160 V188 M112 160 V188 M60 158 Q96 148 132 158 L130 164 Q96 156 62 164Z';
  if (/제주|jeju|한라/i.test(p)) return 'M0 176 Q120 96 210 112 Q300 128 400 170 V220 H0Z';
  if (/도쿄|tokyo/i.test(p)) return ground + ' M296 188 L304 120 H312 L320 188Z M300 124 L308 50 L316 124Z M150 188 V150 H176 V188Z M180 188 V132 H204 V188Z M210 188 V160 H232 V188Z M60 188 V156 H86 V188Z M90 188 V168 H112 V188Z';
  return 'M0 176 L50 140 L92 166 L150 112 L214 168 L270 134 L330 160 L400 128 V220 H0Z';
}
function scene(t, opts) {
  opts = opts || {};
  const part = partOfDay(), s = SKY[part], id = 'g' + Math.random().toString(36).slice(2, 7);
  const sea = /제주|바다|해변|괌|하와이|다낭|세부|오키나와|발리|푸켓|보라카이|jeju|guam|hawaii|cebu|bali/i.test(t.place + t.title);
  const n = dayDiff(today(), t.start);
  const p = n > 0 ? Math.max(.06, 1 - n / 60) : 1;
  const P = (a, b, c, k) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;
  const px = P(30, 200, 370, p), py = P(84, 18, 84, p);
  const ang = Math.atan2(P(84, 18, 84, Math.min(1, p + .01)) - py, P(30, 200, 370, Math.min(1, p + .01)) - px) * 180 / Math.PI;
  const sunY = part === 'day' ? 52 : 118, sunC = part === 'dawn' ? '#FFB27A' : part === 'dusk' ? '#FF8A5B' : '#FFD45A';
  const sil = part === 'night' ? '#081024' : part === 'day' ? '#1D3A6B' : '#2B2550';
  let h = '<svg class="scene" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="background:linear-gradient(180deg,' + s[0] + ' 0%,' + s[1] + ' 60%,' + s[2] + ' 100%)">';
  if (part === 'night') {
    h += [[40, 30], [90, 60], [150, 24], [220, 50], [260, 20], [340, 40], [370, 80], [120, 90]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.4" fill="#fff" opacity=".85"/>').join('');
    h += '<circle cx="320" cy="56" r="20" fill="#FFF3C4"/><circle cx="330" cy="50" r="18" fill="' + s[0] + '"/>';
  } else {
    h += '<circle cx="320" cy="' + sunY + '" r="46" fill="' + sunC + '" opacity=".25"/><circle cx="320" cy="' + sunY + '" r="26" fill="' + sunC + '"/>';
  }
  h += '<g class="cloud" opacity=".9"><ellipse cx="60" cy="50" rx="34" ry="11" fill="#fff" opacity=".75"/><ellipse cx="78" cy="44" rx="20" ry="10" fill="#fff" opacity=".8"/></g>' +
    '<g class="cloud c2" opacity=".8"><ellipse cx="0" cy="96" rx="40" ry="10" fill="#fff" opacity=".6"/><ellipse cx="20" cy="90" rx="22" ry="9" fill="#fff" opacity=".7"/></g>';
  if (!opts.noPlane) {
    h += '<path d="M30 84 Q200 -48 370 84" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>' +
      '<g transform="translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')"><path d="M-12 0 H12 M4 0 L-3 -9 H-7 L-2 0 M4 0 L-3 9 H-7 L-2 0 M-9 0 L-12 -5 H-10 L-6 0 M-9 0 L-12 5 H-10 L-6 0" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>';
  }
  if (sea) h += '<rect y="178" width="400" height="42" fill="#2E7FD0" opacity=".55"/><path d="M0 192 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>';
  h += '<path d="' + skyline(t.place + ' ' + t.title) + '" fill="' + sil + '" opacity=".88"/>';
  h += '</svg>';
  return h;
}

/* ---------- 나라별 정보 ---------- */
const CONSUL = '+82-2-3210-0404';
const COUNTRY = {
  JP: { n: '일본', f: '🇯🇵', cur: 'JPY', tz: '한국과 같음', volt: '100V · 11자 플러그(A형) — 변환 어댑터 필요 · 220V 전용 드라이기는 못 써요', sos: [['경찰', '110'], ['구급·화재', '119']], tip: '팁 문화 없음', etc: '왼쪽 통행 · 현금만 받는 가게가 아직 있어요' },
  TW: { n: '대만', f: '🇹🇼', cur: 'TWD', tz: '한국보다 1시간 늦음', volt: '110V · 11자 플러그(A형)', sos: [['경찰', '110'], ['구급·화재', '119']], tip: '팁 문화 없음', etc: '' },
  VN: { n: '베트남', f: '🇻🇳', cur: 'VND', tz: '한국보다 2시간 늦음', volt: '220V · 한국 플러그 대부분 맞음', sos: [['경찰', '113'], ['화재', '114'], ['구급', '115']], tip: '팁은 마음대로', etc: '' },
  TH: { n: '태국', f: '🇹🇭', cur: 'THB', tz: '한국보다 2시간 늦음', volt: '220V · 한국 플러그 대부분 맞음', sos: [['관광경찰', '1155'], ['구급', '1669']], tip: '작은 팁을 주기도 함', etc: '' },
  CN: { n: '중국', f: '🇨🇳', cur: 'CNY', tz: '한국보다 1시간 늦음', volt: '220V · 플러그 여러 모양', sos: [['경찰', '110'], ['구급', '120'], ['화재', '119']], tip: '팁 문화 없음', etc: '' },
  HK: { n: '홍콩', f: '🇭🇰', cur: 'HKD', tz: '한국보다 1시간 늦음', volt: '220V · 영국식(G형) 어댑터 필요', sos: [['경찰·구급', '999']], tip: '봉사료가 붙는 곳이 많음', etc: '' },
  SG: { n: '싱가포르', f: '🇸🇬', cur: 'SGD', tz: '한국보다 1시간 늦음', volt: '230V · 영국식(G형) 어댑터 필요', sos: [['경찰', '999'], ['구급', '995']], tip: '팁 문화 거의 없음', etc: '' },
  PH: { n: '필리핀', f: '🇵🇭', cur: 'PHP', tz: '한국보다 1시간 늦음', volt: '220V · 11자 플러그 많음', sos: [['긴급', '911']], tip: '작은 팁을 주기도 함', etc: '' },
  US: { n: '미국', f: '🇺🇸', cur: 'USD', tz: '지역마다 다름', volt: '120V · 11자 플러그(A·B형)', sos: [['긴급', '911']], tip: '식당 팁 15~20%', etc: '' },
  GB: { n: '영국', f: '🇬🇧', cur: 'GBP', tz: '한국보다 9시간 늦음(겨울)', volt: '230V · 영국식(G형) 어댑터 필요', sos: [['긴급', '999 또는 112']], tip: '봉사료 포함인지 확인', etc: '' },
  FR: { n: '프랑스', f: '🇫🇷', cur: 'EUR', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · 한국 플러그 맞음', sos: [['긴급', '112']], tip: '봉사료 포함이 많음', etc: '' },
  IT: { n: '이탈리아', f: '🇮🇹', cur: 'EUR', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · 한국 플러그 대부분 맞음', sos: [['긴급', '112']], tip: '자리값(코페르토)이 붙기도 함', etc: '' },
  ES: { n: '스페인', f: '🇪🇸', cur: 'EUR', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · 한국 플러그 맞음', sos: [['긴급', '112']], tip: '팁은 마음대로', etc: '' },
  DE: { n: '독일', f: '🇩🇪', cur: 'EUR', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · 한국 플러그 맞음', sos: [['긴급', '112']], tip: '5~10% 정도', etc: '' },
  AU: { n: '호주', f: '🇦🇺', cur: 'AUD', tz: '지역마다 다름', volt: '230V · I형 어댑터 필요', sos: [['긴급', '000']], tip: '팁 문화 거의 없음', etc: '' },
  CH: { n: '스위스', f: '🇨🇭', cur: 'CHF', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · J형 플러그 — 어댑터 필요', sos: [['경찰', '117'], ['구급', '144'], ['긴급', '112']], tip: '봉사료 포함', etc: '' },
  CZ: { n: '체코', f: '🇨🇿', cur: 'CZK', tz: '한국보다 8시간 늦음(겨울)', volt: '230V · 한국 플러그 대부분 맞음', sos: [['긴급', '112']], tip: '10% 정도', etc: '' },
  KR: { n: '한국', f: '🇰🇷', cur: 'KRW', tz: '', volt: '220V', sos: [['경찰', '112'], ['구급·화재', '119']], tip: '', etc: '' }
};
const WXI = c => c === 0 ? 'sunny' : c <= 2 ? 'partly' : c <= 48 ? 'cloudy' : c <= 67 || (c >= 80 && c <= 82) ? 'rain' : c <= 77 || (c >= 85 && c <= 86) ? 'snow' : 'storm';
const wxi = (c, sz) => '<img class="wxi" src="img/wx-' + WXI(c) + '.webp" alt="' + esc(WMO(c)[1]) + '" width="' + (sz || 32) + '" height="' + (sz || 32) + '">';
const WMO = c => c === 0 ? ['☀️', '맑음'] : c <= 2 ? ['🌤️', '구름 조금'] : c === 3 ? ['☁️', '흐림'] : c <= 48 ? ['🌫️', '안개'] : c <= 57 ? ['🌦️', '이슬비'] : c <= 67 ? ['🌧️', '비'] : c <= 77 ? ['❄️', '눈'] : c <= 82 ? ['🌦️', '소나기'] : c <= 86 ? ['🌨️', '눈발'] : ['⛈️', '뇌우'];
const INFO = {};
let PASSPORTS = null;
async function loadInfo(t) {
  const key = t.id;
  if (INFO[key] && Date.now() - INFO[key].at < 30 * 60 * 1000) return;
  INFO[key] = { at: Date.now() };
  const city = String(t.city || t.place || '').split(/[·,\/]/)[0].replace(/^(일본|대만|베트남|태국|중국|미국|영국|프랑스|이탈리아|스페인|독일|호주|싱가포르|필리핀|홍콩)\s*/, '').trim();
  try {
    let g = LS.get('geo.' + city, null);
    if (!g && city) {
      const r = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ko&name=' + encodeURIComponent(city))).json();
      const x = r.results && r.results[0];
      if (x) { g = { lat: x.latitude, lng: x.longitude, cc: x.country_code, name: x.name, tz: x.timezone }; LS.set('geo.' + city, g); }
    }
    if (g) {
      INFO[key].geo = g;
      const w = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lng + '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset&forecast_days=16&timezone=' + encodeURIComponent(g.tz || 'auto'))).json();
      INFO[key].wx = w;
      const lastFc = w.daily && w.daily.time[w.daily.time.length - 1];
      if (!lastFc || lastFc < t.end) {
        const nk = 'norm.' + g.lat + ',' + g.lng + '.' + t.start + '.' + t.end;
        let nm = LS.get(nk, null);
        if (!nm) {
          const y0 = pd(t.start).getFullYear(), span = pd(t.end).getFullYear() - y0;
          const per = {}; let n = 0;
          for (let k = 1; k <= 3; k++) {
            const s0 = (y0 - k) + t.start.slice(4), e0 = (y0 - k + span) + t.end.slice(4);
            try {
              const a = await (await fetch('https://archive-api.open-meteo.com/v1/archive?latitude=' + g.lat + '&longitude=' + g.lng + '&start_date=' + s0 + '&end_date=' + e0 + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=' + encodeURIComponent(g.tz || 'auto'))).json();
              (a.daily && a.daily.time || []).forEach((d, i) => { const m = d.slice(5); const r = per[m] = per[m] || { max: 0, min: 0, rain: 0, n: 0 }; r.max += a.daily.temperature_2m_max[i]; r.min += a.daily.temperature_2m_min[i]; r.rain += a.daily.precipitation_sum[i] > 1 ? 1 : 0; r.n++; });
              n++;
            } catch (e) {}
          }
          if (n) {
            const days = {}; let sx = 0, sn = 0, c = 0;
            Object.keys(per).forEach(m => { const r = per[m]; days[m] = { max: Math.round(r.max / r.n), min: Math.round(r.min / r.n), rainP: Math.round(r.rain / r.n * 100) }; sx += r.max / r.n; sn += r.min / r.n; c++; });
            nm = { days, years: n, avgMax: Math.round(sx / c), avgMin: Math.round(sn / c) };
            LS.set(nk, nm);
          }
        }
        INFO[key].normal = nm;
      }
    }
  } catch (e) { INFO[key].wxErr = 1; }
  const cur = t.cur || (COUNTRY[t.country] || {}).cur;
  if (cur && cur !== 'KRW') {
    try {
      const f = await (await fetch('https://open.er-api.com/v6/latest/' + cur)).json();
      if (f.rates && f.rates.KRW) { INFO[key].fx = { rate: f.rates.KRW * 100, upd: f.time_last_update_unix * 1000 }; LS.set('fx.' + cur, INFO[key].fx); }
    } catch (e) { INFO[key].fx = LS.get('fx.' + cur, null); }
  }
  render();
}
const countryOf = t => COUNTRY[t.country] || COUNTRY[((INFO[t.id] || {}).geo || {}).cc] || null;
/* 국내여행 · 해외여행 — 나라가 한국이면 국내 (나라를 안 적었으면 지명으로 짐작) */
const KR_RE = /제주|서귀포|서울|부산|인제|곡성|강릉|속초|양양|경주|전주|여수|순천|군산|대구|광주|대전|인천|강원|전남|전북|경남|경북|충남|충북|가평|남해|통영|거제|포항|안동|단양|태안|보령|울릉|섬진강/;
const abroad = t => t.country ? t.country !== 'KR' : !KR_RE.test((t.place || '') + ' ' + (t.title || ''));
/* 부부여행 — 임요한·장보정 두 사람만 간 여행 (가족 넷은 가족 여행) */
const COUPLE = ['임요한', '장보정'];
const couple = t => t.kind === 'couple' || (t.kind !== 'family' && t.kind !== 'culture' && (t.members || []).length === 2 && COUPLE.every(n => (t.members || []).includes(n)));
const kindOf = t => t.kind === 'culture' ? 'cu' : couple(t) ? 'cp' : abroad(t) ? 'out' : 'in';
const KIND = { out: ['해외여행', 'it-plane', 'plane'], in: ['국내여행', 'it-rentcar', 'rentcar'], cp: ['부부여행', 'it-photo', 'photo'], cu: ['문화 체험', 'it-museum', 'museum'] }; // 갈래 그림은 있는 그림으로(없는 kind-*.webp를 늘 찾던 것, 2026-11-27)
const kindImg = (k, cls) => '<img class="' + (cls || 'kind-art') + '" src="img/' + KIND[k][1] + '.webp" alt="" onerror="this.onerror=null;this.src=\'img/it-' + KIND[k][2] + '.webp\'">';
const CITY_IMG = [[/오사카|osaka/i, 'osaka'], [/교토|kyoto/i, 'kyoto'], [/도쿄|tokyo/i, 'tokyo'], [/후쿠오카/, 'fukuoka'], [/제주|서귀포/, 'jeju'], [/인제|자작나무/, 'inje'], [/곡성|섬진강/, 'gokseong'], [/타이베이|대만|타이완|taipei/i, 'taipei'], [/파리|paris/i, 'paris'], [/프라하|prague/i, 'prague'], [/스위스|체르마트|알프스/i, 'swiss'], [/남프랑스|니스|마르세유|아비뇽/i, 'provence']];
const COVER_PARTS = { osaka: ['dawn', 'day', 'dusk', 'night'], kyoto: ['dawn', 'dusk'] }; // img/cover-<도시>[-<때>].webp 가 실제로 있는 것
function coverImg(t) {
  if (safeImg(t.cover)) return '<img class="cover" src="' + t.cover + '" alt="">';
  const hit = CITY_IMG.find(([re]) => re.test((t.place || '') + ' ' + (t.title || '')));
  if (!hit) return '';
  const k = hit[1], parts = COVER_PARTS[k]; if (!parts) return ''; // 그림이 있는 도시만(없는 파일을 두 번씩 찾던 것, 2026-11-27)
  const pd = partOfDay(), f = parts.includes(pd) ? 'cover-' + k + '-' + pd : 'cover-' + k;
  return '<img class="cover" src="img/' + f + '.webp" alt="" onerror="this.remove()">';
}
/** 몇 년 전 오늘 — 지난 여행 가운데 오늘과 같은 달·날 */
function agoCard(cur) {
  const t0 = today(), dk = t0.slice(5);
  const hits = live('trips').filter(t => (!cur || t.id !== cur.id) && t.end < t0)
    .map(t => [t, daysOf(t).find(d => d.slice(5) === dk && d.slice(0, 4) < t0.slice(0, 4))]).filter(x => x[1])
    .sort((a, b) => b[1].localeCompare(a[1]));
  if (!hits.length) return '';
  const [t, d] = hits[0], n = +t0.slice(0, 4) - +d.slice(0, 4);
  const its = live('items', t.id).filter(i => i.date === d && (/관광|쇼핑|간식/.test(i.cat || '') || /—/.test(i.title || ''))).sort(byTime).map(i => String(i.title).split(/\s*[·(/]\s*/)[0]).filter(Boolean).slice(0, 4);
  return '<div class="sec"><button class="ago" data-act="open-trip" data-v="' + esc(t.id) + '"><img class="ago-art" src="img/family.webp" alt="" onerror="this.onerror=null;this.src=\'img/it-photo.webp\'">' +
    '<span class="ago-b"><small><b class="num">' + n + '년 전</b> 오늘, 우리는</small><b>' + esc(t.title) + '</b><span>' + esc(its.length ? its.join(' · ') : t.place || '') + '</span></span>' + (hits.length > 1 ? '<span class="pill">+' + (hits.length - 1) + '</span>' : '') + '</button></div>';
}
/** 지난 여행 카드 (연표) */
function pastCard(t) {
  const ds = daysOf(t), c = countryOf(t), n = +today().slice(0, 4) - +t.start.slice(0, 4);
  const its = live('items', t.id), mem = live('notes', t.id).length + live('places', t.id).length + planPlaces(t.id).length;
  const line = String(t.story || '').split(/\n/)[0] || String(t.memo || '').split(/\n/)[0];
  return '<button class="pcard" data-act="open-trip" data-v="' + esc(t.id) + '"><span class="pc-img">' + scene(t, { noPlane: 1 }) + coverImg(t) +
    '<span class="pc-year num"><b class="pc-yy">' + t.start.slice(0, 4) + ' · </b>' + (n > 0 ? n + '년 전' : '올해') + '</span>' + stampHtml('다녀옴', 'mini') + '</span>' +
    '<span class="pc-b"><b>' + esc(t.title) + '</b><span class="num">' + esc(t.start.slice(0, 4) + '. ' + md(t.start) + (t.end !== t.start ? ' – ' + md(t.end) : '')) + ' · ' + (ds.length > 1 ? (ds.length - 1) + '박 ' + ds.length + '일' : '당일') + '</span>' +
    (line ? '<span class="pc-line">' + esc(line) + '</span>' : '') + photoStrip(t, 4) +
    '<span class="pc-meta">' + (kindOf(t) === 'cu' ? '🎨 ' : couple(t) ? '💑 ' : '') + (c ? c.f + ' ' : '') + esc(t.place || '') + (its.length ? ' · 일정 ' + its.length : '') + (mem ? ' · 추억 ' + mem : '') + '</span></span></button>';
}
function pastHtml(past) {
  if (!past.length) return '';
  const G = { out: past.filter(t => kindOf(t) === 'out'), in: past.filter(t => kindOf(t) === 'in'), cp: past.filter(t => kindOf(t) === 'cp'), cu: past.filter(t => kindOf(t) === 'cu') };
  let k = UI.pastKind || LS.get('pastKind', '');
  if (!KIND[k]) k = G.out.length ? 'out' : 'in';
  const list = G[k];
  let h = '<div class="sec past"><div class="sec-h"><h3 class="ih">' + kindImg(k, 'h-art') + '지난 여행</h3><span class="muted small">' + past.length + '번의 추억</span></div>' +
    '<div class="seg kindseg' + (G.cu.length ? ' four' : '') + '" role="tablist" aria-label="지난 여행 갈래">' + ['out', 'in', 'cp', 'cu'].filter(v => v !== 'cu' || G.cu.length).map(v => '<button role="tab" aria-selected="' + (k === v) + '" class="' + (k === v ? 'on' : '') + '" data-act="past-kind" data-v="' + v + '">' + kindImg(v) + KIND[v][0] + ' <em class="num">' + G[v].length + '</em></button>').join('') + '</div>';
  if (!list.length) return h + '<div class="card empty"><div class="art">' + kindImg(k, 'empty-art') + '</div><b>아직 다녀온 ' + KIND[k][0] + '이 없어요</b>다녀오면 여기에 해마다 쌓여요.</div></div>';
  h += '<div class="ptl">';
  let y = '';
  list.forEach(t => { const yy = t.start.slice(0, 4); if (yy !== y) { y = yy; h += '<div class="ptl-y"><b class="num">' + yy + '</b><span>' + list.filter(x => x.start.slice(0, 4) === yy).length + '번</span></div>'; } h += pastCard(t); });
  return h + '</div></div>';
}
/** 여행 사진 줄 — 일기·가 본 곳에 붙은 사진 */
const tripPhotos = t => live('notes', t.id).filter(n => safeImg(n.thumb) && !n.owner).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.ts - b.ts);
function photoStrip(t, max) {
  const ph = tripPhotos(t); if (!ph.length) return '';
  return '<span class="pc-strip">' + ph.slice(0, max).map(n => '<img src="' + n.thumb + '" alt="" loading="lazy">').join('') + (ph.length > max ? '<i class="num">+' + (ph.length - max) + '</i>' : '') + '</span>';
}
/** 구글 포토에서 그날 사진 보기 — 날짜 찾기 주소(가족은 사진첩을 함께 받아 봄) · 여행에 `gphotos`(앨범 주소)가 있으면 그것 먼저 */
const gpUrl = ds => { const [y, m, d] = ds.split('-').map(Number); return 'https://photos.google.com/search/' + encodeURIComponent(y + '년 ' + m + '월 ' + d + '일'); };
function gpChips(t) {
  if (!t.start || t.start > today()) return '';
  const ds = daysOf(t), al = safeUrl(t.gphotos);
  const pick = ds.length <= 6 ? ds : ds.slice(0, 5);
  return (al ? '<a class="chipbtn gp" href="' + esc(al) + '" target="_blank" rel="noopener">' + ic('camera') + '구글 포토 앨범</a>' : '') +
    pick.map((d, i) => '<a class="chipbtn gp" href="' + esc(gpUrl(d)) + '" target="_blank" rel="noopener">' + (i ? '' : ic('camera') + '구글 포토 ') + '<span class="num">' + md(d) + '</span></a>').join('') + (ds.length > pick.length ? '<span class="muted small">…</span>' : '');
}
/** 지난 여행 화면: 그때 이야기 */
function storyCard(t) {
  const s = String(t.story || '').trim(), nu = safeUrl(t.notion);
  if (!s && !nu && !safeUrl(t.album) && !gpChips(t)) return '';
  return '<div class="sec"><div class="letter"><div class="lt-h">' + kindImg(kindOf(t), 'h-art') + '<b>그때 우리는</b><span class="lt-year num">' + esc(t.start.slice(0, 4)) + '</span></div>' +
    s.split(/\n+/).map(x => '<p>' + esc(x) + '</p>').join('') + (tripPhotos(t).length ? '<div class="lt-photos">' + tripPhotos(t).slice(0, 6).map((n, i) => '<button data-act="note-edit" data-v="' + esc(n.id) + '" style="--r:' + ((i % 3) - 1) * 3 + 'deg"><img src="' + n.thumb + '" alt="" loading="lazy"><small>' + esc(String(n.text || '').replace(/^📷\s*/, '').split(/\n/)[0].slice(0, 18)) + '</small></button>').join('') + '</div>' : '') + '<div class="chips">' + (nu ? '<a class="chipbtn" href="' + esc(nu) + '" target="_blank" rel="noopener">' + ic('notion') + '노션에서 보기</a>' : '') + (safeUrl(t.album) ? '<a class="chipbtn" href="' + esc(t.album) + '" target="_blank" rel="noopener">' + ic('camera') + '사진 앨범</a>' : '') + '</div>' + (gpChips(t) ? '<div class="chips gpchips">' + gpChips(t) + '</div><div class="muted small">그날 찍은 사진을 구글 포토에서 날짜로 찾아 보여 줘요. 공유받은 사진첩도 함께 나와요.</div>' : '') + '</div></div>';
}

/* ---------- 길 ---------- */
function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'trip' && p[1]) return { view: 'trip', trip: decodeURIComponent(p[1]), tab: p[2] || 'today' };
  return { view: 'home' };
}
let GO_LATER = null, SHEET_H = false, POP_SKIP = false;
const go = h => { if (POP_SKIP) { GO_LATER = h; return; } if (location.hash !== h) location.hash = h; else render(); }; // 창을 닫는 뒤로가기가 끝난 뒤에 옮김
const tripUrl = (id, tab) => '#/trip/' + encodeURIComponent(id) + '/' + (tab || 'today');
window.addEventListener('hashchange', () => { closeSheet(true); if (RB) rbClose(true); render(); window.scrollTo(0, 0); });
window.addEventListener('popstate', () => {
  if (POP_SKIP) { POP_SKIP = false; if (GO_LATER) { const g = GO_LATER; GO_LATER = null; go(g); return; } if (!$('#sheet').hidden && !SHEET_H) { history.pushState({ sheet: 1 }, ''); SHEET_H = true; } return; }
  if (TKV) { tkClose(true); return; }
  if (SHEET_H || !$('#sheet').hidden) { SHEET_H = false; closeSheet(true); return; }
  if (RB) { rbClose(true); return; }
  const w = $('.tmap-wrap.full'); if (w) { w.classList.remove('full'); document.body.classList.remove('map-open'); setTimeout(() => MAP && MAP.invalidateSize(), 80); }
});

/* ---------- 그리기 ---------- */
/** 한 글자(짧은 낱말)만 다음 줄로 떨어지지 않게(팀장님 2026-11-27 「모든 화면에서」) — 글 끝의 마지막 띄어쓰기를 붙는 띄어쓰기(NBSP)로.
 *  text-wrap:pretty를 못 쓰는 휴대폰을 위한 보탬. 끝 낱말이 3글자 이하일 때만, 입력 칸·코드는 건드리지 않음 */
const ORPHAN_SEL = 'h1,h2,h3,h4,p,li,.t,.m,.muted,.goline,.tip b,.iv-rows b,.iv-rows span,.alert b,.alert span,.card b,.card span,.facts span,.facts b,.tag,.sc-t small,.nowline span,.taxi-how li,.dmap-leg button,small,.rec p,.iv-rec div';
function fixOrphans(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(ORPHAN_SEL).forEach(el => {
    if (el.closest('input,textarea,[contenteditable],.num,code,pre') || ((el.closest('div,p,li,button,a,section,h1,h2,h3,h4') || el).clientWidth || 999) < 140) return; // 아주 좁은 칸(책 표지 등)은 붙이면 낱말 중간이 꺾여서 그대로
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let last = null, n; while ((n = w.nextNode())) if (n.nodeValue.trim()) last = n;
    if (!last) return;
    const v = last.nodeValue, m = v.match(/^([\s\S]*\S) (\S{1,3}[\s.,!?…)」』'"]*)$/);
    if (m && m[1].length >= 6) last.nodeValue = m[1] + '\u00A0' + m[2];
  });
}
/* 스크롤하면 스르륵 접히고, 멈춰서 읽으면 스르륵 펼쳐짐(팀장님 2026-11-27) — 누른 카드·지금/90분 안 일정은 늘 펼친 채 */
const TL_FOLD_H = 22; // 접혔을 때 보이는 메모 한 줄 높이
const TL_FOCUS_Y = 0.38; // 이 높이(화면 위에서 38%)에 가장 가까운 카드를 펼침 — 가운데(0.5)는 낮다(팀장님 2026-11-27)
function tlUnfold(c) {
  const x = c.querySelector('.tl-x'); c.classList.remove('fold');
  if (!x) return;
  x.style.maxHeight = TL_FOLD_H + 'px'; void x.offsetHeight; x.style.maxHeight = x.scrollHeight + 'px';
  clearTimeout(x._t); x._t = setTimeout(() => { if (!c.classList.contains('fold')) x.style.maxHeight = 'none'; }, 480);
}
function tlFold(c) {
  const x = c.querySelector('.tl-x');
  if (x) { clearTimeout(x._t); x.style.maxHeight = x.scrollHeight + 'px'; void x.offsetHeight; x.style.maxHeight = TL_FOLD_H + 'px'; }
  c.classList.add('fold');
}
let TL_IDLE = 0, TL_FOCUS = 0, TL_HOVER = null, TL_HT = 0;
// PC: 마우스를 올린 카드를 0.5초 뒤 먼저 펼침(화면 가운데보다 우선), 떠나면 0.6초 뒤 다시 접힘(팀장님 2026-11-27)
const TL_CARDS = '.tl-card, .sfc';
document.addEventListener('pointerover', e => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const c = e.target.closest && e.target.closest(TL_CARDS); if (c === TL_HOVER) return;
  TL_HOVER = c || null; clearTimeout(TL_HT);
  if (c && c.classList.contains('fold')) TL_HT = setTimeout(() => { if (TL_HOVER === c && document.body.contains(c) && c.classList.contains('fold')) { clearTimeout(TL_FOCUS); document.querySelectorAll('.tl-card.dwell:not(.fold), .sfc.dwell:not(.fold)').forEach(x => { if (x !== c) tlFold(x); }); c.classList.add('dwell'); tlUnfold(c); } }, 500);
});
document.addEventListener('pointerout', e => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const c = e.target.closest && e.target.closest(TL_CARDS); if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
  if (TL_HOVER === c) TL_HOVER = null; clearTimeout(TL_HT);
  setTimeout(() => { if (TL_HOVER !== c && c.classList.contains('dwell') && !c.classList.contains('fold')) tlFold(c); }, 600);
});
function tlScroll() {
  clearTimeout(TL_IDLE); clearTimeout(TL_FOCUS);
  document.querySelectorAll('.tl-card.dwell:not(.fold), .sfc.dwell:not(.fold)').forEach(c => { if (c.getBoundingClientRect().top >= 0) tlFold(c); }); // 움직이면 「읽던」 카드는 다시 접기 — 윗부분이 화면 위로 지나간 카드는 그대로(접으면 화면이 튐)
  TL_IDLE = setTimeout(() => { // 멈추면 가운데 카드를 조금 더 보고 있을 때 펼치기 — 마우스가 카드 위에 있으면 그 카드가 먼저(위 pointerover)
    if (TL_HOVER && document.body.contains(TL_HOVER)) return;
    const mid = innerHeight * TL_FOCUS_Y; let best = null, bd = 1e9;
    document.querySelectorAll('.tl-card.fold, .sfc.fold').forEach(c => { const r = c.getBoundingClientRect(); if (r.bottom < 80 || r.top > innerHeight - 90) return; const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = c; } });
    if (best && bd < innerHeight * 0.3) TL_FOCUS = setTimeout(() => { if (document.body.contains(best) && best.classList.contains('fold')) { best.classList.add('dwell'); tlUnfold(best); } }, 500);
  }, 600);
}
addEventListener('scroll', tlScroll, { passive: true });
function tlWatch() { document.querySelectorAll('.tl-card.fold .tl-x, .sfc.fold .tl-x').forEach(x => { x.style.maxHeight = TL_FOLD_H + 'px'; }); tlScroll(); }
function render() {
  try { render_(); fixOrphans($('#app')); tlWatch(); } catch (e) {
    console.error(e);
    const app = $('#app'); if (app) app.innerHTML = '<div class="wrap"><div class="card" style="margin-top:40px"><b>화면을 그리다 문제가 생겼어요</b><div class="muted" style="margin:6px 0 12px">기록은 안전해요. 아래를 눌러 다시 열어 주세요.</div><button class="btn pri" onclick="location.hash=\'#/\';location.reload()">처음 화면으로 다시 열기</button></div></div>';
  }
}
function render_() {
  const app = $('#app');
  if (!PASS) { app.innerHTML = lockView(); return; }
  if (!ME || !fam(ME)) { app.innerHTML = whoView(); return; }
  const r = route();
  const t = r.view === 'trip' ? D.trips[r.trip] : null;
  document.documentElement.dataset.tab = t && !t.del ? (r.tab || 'today') : 'home';
  if (t && !t.del) { app.innerHTML = tripView(t, r.tab); if (!longAgo(t)) loadInfo(t); }
  else app.innerHTML = homeView();
  const s = $('#sync'); if (s) paintSync(s);
  if ($('#tmap')) mountMap();
  if ($('#dmap')) mountDayMap();
}
const nightArt = () => partOfDay() === 'night' ? '<img class="night-art" src="img/night-sky.webp" alt="">' : '';
function greeting() {
  const h = new Date().getHours();
  const hi = h >= 5 && h < 11 ? '좋은 아침이에요' : h < 17 && h >= 11 ? '좋은 오후예요' : h >= 17 && h < 22 ? '좋은 저녁이에요' : '편안한 밤이에요';
  const f = fam(ME) || {};
  return esc(f.role || ME) + ', ' + hi;
}

function lockView() {
  return '<div class="lock"><img class="welcome" src="img/welcome.webp" alt="공항에서 손 흔드는 우리 가족"><div class="flex" style="gap:12px"><img class="logo" src="icon-180.png" alt=""><h1>하하가족여행</h1></div><p>우리 가족 여행을 함께 짜고 기록해요.<br>가족 암호를 넣어 주세요.</p>' +
    '<form class="f" data-form="lock"><input class="in" id="pass" type="password" autocomplete="current-password" placeholder="가족 암호" aria-label="가족 암호">' +
    '<button class="btn pri wide big">들어가기</button><div class="muted" id="lockmsg"></div></form></div>';
}
function whoView() {
  const fm = D.meta.family;
  return '<div class="lock"><img class="family" src="img/family.webp" alt="우리 가족"><h1>누구세요?</h1><p>이 휴대폰을 쓰는 사람을 골라 주세요. 고친 사람이 이름으로 남아요.</p>' +
    (fm.length ? '<div class="who">' + fm.map(f => '<button data-act="me" data-v="' + esc(f.name) + '">' + av(f.name) + esc(f.name) + '<small>' + esc(f.role || '') + '</small></button>').join('') + '</div>'
      : '<div class="empty">가족 목록을 받는 중이에요…</div>') + '</div>';
}

/* 처음 화면: 모든 여행·통합 기록 */
function homeView() {
  const trips = live('trips').sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const t0 = today();
  const up = trips.filter(t => t.end >= t0), past = trips.filter(t => t.end < t0).reverse();
  let h = '<div class="wrap nonav"><div class="topbar"><h1>하하가족여행</h1><span id="sync" class="sync"></span><button class="iconbtn" data-act="settings" aria-label="설정">' + ic('gear') + '</button></div>';
  h += '<div class="greet">' + nightArt() + greeting() + '</div>';
  h += agoCard();
  if (up[0]) h += heroCard(up[0], 'open');
  const rest = up.slice(1);
  if (!up.length) h += '<div class="sec"><div class="stack"><button class="newtrip" data-act="trip-new">' + ic('plus') + '새 여행 만들기</button></div></div>';
  else if (rest.length) h += '<div class="sec"><div class="sec-h"><h3>다가오는 여행</h3><button class="linkbtn" data-act="trip-new">＋ 새 여행</button></div><div class="stack">' + rest.map(tripRow).join('') + '</div></div>';
  else h += '<div class="newtrip-line"><button class="linkbtn" data-act="trip-new">＋ 새 여행 만들기</button></div>';
  h += pastHtml(past);
  if (past.length) h += mapHtml('');
  const allDays = trips.reduce((s, t) => s + (t.start <= t0 ? Math.max(0, Math.min(dayDiff(t.start, t.end), dayDiff(t.start, t0)) + 1) : 0), 0);
  let spent = 0; live('spends').forEach(s => { const t = D.trips[s.trip]; if (t) spent += toWon(t, s.amount, s.cur); });
  const places = live('places'), plan = allPlan(), vis = live('trips').flatMap(x => visitedOf(x.id));
  h += '<div class="sec"><div class="sec-h"><h3>우리 가족 여행 기록</h3></div>';
  if (!past.length && !allDays && !places.length) h += '<div class="card empty"><div class="art">🧳✨</div><b>첫 여행을 기다리는 중</b>다녀오면 여기에 우리 가족의 여행이 쌓여요.</div>';
  else h += '<div class="grid2"><div class="stat"><small>함께 간 여행</small><b class="num">' + trips.length + '번</b><em>해외 ' + trips.filter(t => kindOf(t) === 'out').length + ' · 국내 ' + trips.filter(t => kindOf(t) === 'in').length + ' · 부부 ' + trips.filter(t => kindOf(t) === 'cp').length + (trips.some(t => kindOf(t) === 'cu') ? ' · 문화 ' + trips.filter(t => kindOf(t) === 'cu').length : '') + '</em></div><div class="stat"><small>여행한 날</small><b class="num">' + allDays + '일</b></div>' +
    '<div class="stat"><small>쓴 돈 (기록한 것)</small><b class="num">' + manWon(spent) + '</b></div><div class="stat"><small>가 본 곳</small><b class="num">' + (places.length + plan.length) + '곳</b><em>별점 ' + places.filter(p => p.rating > 0).length + '곳</em></div></div>';
  h += '</div>';
  if (vis.length) {
    const c = pcatOk(vis, UI.pcat || '전체'), list = vis.filter(e => c === '전체' || e.cat === c).sort((a, b) => b.r - a.r || (b.d || '').localeCompare(a.d || ''));
    h += '<div class="sec"><div class="sec-h"><h3>' + (vis.some(e => e.r) ? '우리가 좋았던 곳' : '우리가 가 본 곳') + '</h3><button class="linkbtn" data-act="all-places">모두 보기 ' + vis.length + '</button></div>' +
      pcatChips(vis, c, 'pcat') + '<div class="card">' + list.slice(0, 5).map(vRow).join('') + '</div>' + (list.length > 5 ? '<button class="linkbtn more-line" data-act="all-places">' + (c === '전체' ? '' : c + ' ') + list.length + '곳 모두 보기</button>' : '') + '</div>';
  }
  return h + '</div>';
}
function heroCard(t, mode) {
  const ds = daysOf(t), mini = mode === 'mini';
  const tag = mode === 'open' ? 'button data-act="open-trip" data-v="' + esc(t.id) + '"' : 'div';
  const c = countryOf(t);
  const cover = coverImg(t);
  return '<' + tag + ' class="hero' + (mini ? ' mini' : '') + '">' + scene(t) + cover + '<div class="hin">' +
    '<div class="eyebrow">' + (c ? c.f + ' ' : '') + esc(t.place || '여행') + '</div><span class="dday num">' + ddayText(t) + '</span>' +
    '<h2>' + esc(t.title) + '</h2><div class="sub num">' + esc(md(t.start)) + ' – ' + esc(md(t.end)) + ' · ' + Math.max(0, ds.length - 1) + '박 ' + ds.length + '일</div>' +
    (mini ? '' : '<div class="people">' + (t.members || []).map(m => '<span class="chip-w">' + esc(m) + '</span>').join('') + '</div>') + '</div></' + tag.split(' ')[0] + '>';
}
function tripRow(t) {
  return '<button class="trip-row" data-act="open-trip" data-v="' + esc(t.id) + '"><span class="th">' + scene(t, { noPlane: 1 }).replace('class="scene"', '') + coverImg(t) + '</span><span class="tt"><b>' + esc(t.title) + '</b><span class="num"><i class="kindtag ' + kindOf(t) + '">' + ({ out: '해외', in: '국내', cp: '부부', cu: '문화' })[kindOf(t)] + '</i>' +
    esc(md(t.start)) + (t.end !== t.start ? ' – ' + esc(md(t.end)) : '') + ' · ' + esc(t.place || '') + '</span></span>' + (t.end < today() ? stampHtml('다녀옴', 'mini') : '<span class="pill ' + (dayDiff(today(), t.start) > 0 ? 'hot' : '') + '">' + ddayText(t) + '</span>') + '</button>';
}
function placeRow(p) {
  const t = D.trips[p.trip];
  return '<button class="row vrow" data-act="place-edit" data-v="' + esc(p.id) + '">' + (safeImg(p.thumb) ? '<img class="th" src="' + p.thumb + '" alt="">' : ib('star', 'var(--sun)', 1)) + '<span class="body"><span class="t">' + esc(p.name) + '</span> <span class="vcat">' + esc(p.cat || '') + '</span>' +
    (p.rating ? '<div class="stars">' + '★'.repeat(p.rating) + '</div>' : '') + (p.memo ? '<div class="m vmemo">' + esc(p.memo) + '</div>' : '') + '<div class="m vtrip">' + esc(t ? t.title : '') + (p.by && p.by !== '도우미' ? ' · ' + esc(p.by) : '') + '</div></span></button>';
}

/* 일정에서 다녀온 곳 — 다녀온(✓) 일정 가운데 장소가 있는 관광·식사·쇼핑을 「가 본 곳」에 저절로 (가 본 곳 기록이 있으면 그것만) */
const PLAN_CAT = { 관광: '명소', 식사: '맛집', 간식: '맛집', 쇼핑: '쇼핑', 카페: '카페' };
const pkey = x => String(x || '').toLowerCase().replace(/[\s·()\-—,.'’]/g, '');
function planPlaces(tid) {
  const t = D.trips[tid]; if (!t) return [];
  const pl = live('places', tid), keys = new Set(), names = [];
  pl.forEach(p => { [p.name, p.map].forEach(x => { const k = pkey(x); if (k) keys.add(k); }); if (pkey(p.name).length > 1) names.push(pkey(p.name)); if (p.item) keys.add('#' + p.item); });
  const seen = new Set();
  return live('items', tid).filter(i => i.done && (i.place || i.addr) && PLAN_CAT[i.cat] && !keys.has('#' + i.id) && !keys.has(pkey(i.place || i.addr)) && !names.some(n => pkey(i.title).includes(n) || pkey(i.place).includes(n)))
    .filter(i => { const k = pkey(i.place || i.addr); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || byTime(a, b));
}
const allPlan = () => live('trips').flatMap(t => planPlaces(t.id));
const planName = i => String(i.title).replace(/^(아침|점심|저녁|간식)\s*[—-]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim() || i.place;
function planRow(i) {
  const t = D.trips[i.trip];
  return '<button class="row vrow plan-place" data-act="place-from" data-v="' + esc(i.id) + '">' + ib('pin', 'var(--sky)', 1) + '<span class="body"><span class="t">' + esc(planName(i)) + '</span> <span class="vcat">' + esc(PLAN_CAT[i.cat]) + '</span>' +
    '<div class="m"><span class="pp-star">☆ 별점 남기기</span></div><div class="m vtrip">' + esc(t ? t.title : '') + (i.date ? ' · ' + esc(md(i.date)) : '') + '</div></span></button>';
}

/* 가 본 곳 갈래 — 목록이 길어지지 않게 명소·맛집·카페·쇼핑·숙소로 나눠 봄 */
const PCATS = ['명소', '맛집', '카페', '쇼핑', '숙소'];
function visitedOf(tid) {
  const pl = live('places', tid).map(p => ({ p, cat: PCATS.includes(p.cat) ? p.cat : '명소', r: p.rating || 0, ts: p.ts || 0, d: p.date || '' }));
  return pl.sort((a, b) => b.r - a.r || b.ts - a.ts).concat(planPlaces(tid).map(i => ({ i, cat: PLAN_CAT[i.cat], r: 0, ts: 0, d: i.date || '' })));
}
const vRow = e => e.p ? placeRow(e.p) : planRow(e.i);
const pcatOk = (list, c) => c !== '전체' && list.some(e => e.cat === c) ? c : '전체';
function pcatChips(list, cur, act) {
  const n = c => list.filter(e => e.cat === c).length;
  return '<div class="chips pcat">' + ['전체', ...PCATS].filter(c => c === '전체' || n(c)).map(c => '<button class="chipbtn ' + (cur === c ? 'on' : '') + '" data-act="' + act + '" data-v="' + c + '">' + c + ' <span class="num">' + (c === '전체' ? list.length : n(c)) + '</span></button>').join('') + '</div>';
}
const MORE_N = 4;
function rowsMore(list) {
  return list.length > MORE_N + 1 ? list.slice(0, MORE_N).map(vRow).join('') + '<details class="rows-more"><summary>' + (list.length - MORE_N) + '곳 더 보기</summary>' + list.slice(MORE_N).map(vRow).join('') + '</details>' : list.map(vRow).join('');
}

/* 여행 지도 — 진짜 다녀온 곳(가 본 곳 + 다녀온 일정)을 핀으로. 좌표는 서버 구글 지오코더로 한 번 찾아 기록에 남김 */
const PIN_C = { out: '#2f80ed', in: '#1f9d61', cp: '#e0508f', cu: '#9b5bd4' };
const geoQ = (t, x) => { const q = String(x || '').trim(), c = cityOf(t); return q && c && !q.includes(c) && !/[A-Za-z]/.test(q) ? q + ' ' + c : q; };
function mapPins(tid) {
  const pins = [];
  live('trips').filter(t => !tid || t.id === tid).forEach(t => {
    const k = kindOf(t), vs = visitedOf(t.id);
    vs.forEach(e => { const r = e.p || e.i, q = r.addr || geoQ(t, e.p ? r.map || r.name : r.place); if (q) pins.push({ c: e.p ? 'places' : 'items', r, q, t, k, name: e.p ? r.name : planName(r), cat: e.cat, d: e.d }); });
    if (!vs.length && t.end < today()) { const q = String(t.place || '').split(/\s*·\s*/)[0].trim(); if (q) pins.push({ c: 'trips', r: t, q, t, k, name: t.place, cat: '', d: t.start, city: 1 }); }
  });
  return pins;
}
let GEO_BUSY = false;
async function geoFill(pins) {
  const need = pins.filter(p => p.r.geoq !== p.q);
  if (GEO_BUSY || !need.length || !navigator.onLine || !PASS) return;
  GEO_BUSY = true;
  try {
    for (let k = 0; k < need.length; k += 30) {
      const part = need.slice(k, k + 30), res = await call('geocode', [...new Set(part.map(p => p.q))]);
      const alt = p => p.q + ' ' + (cityOf(p.t) || p.t.place || ''), miss = part.filter(p => !res[p.q] && cityOf(p.t) && !p.q.includes(cityOf(p.t)));
      if (miss.length) { const r2 = await call('geocode', [...new Set(miss.map(alt))]); miss.forEach(p => { if (r2[alt(p)]) res[p.q] = r2[alt(p)]; }); }
      part.forEach(p => { const g = res[p.q]; const cur = p.c === 'trips' ? D.trips[p.r.id] : D[p.c][p.r.id]; if (!cur) return;
        const rec = Object.assign({}, cur, { geoq: p.q, lat: g ? g.lat : null, lng: g ? g.lng : null, cc: g ? g.cc : '' });
        rec.ts = Math.max(Date.now(), (Number(cur.ts) || 0) + 1); D[p.c][rec.id] = rec; Q.push({ c: p.c, id: rec.id, v: rec }); });
      persist(); kick();
    }
  } catch (e) { /* 다음에 다시 */ }
  GEO_BUSY = false;
  if ($('#tmap')) mountMap(true);
}
let LEAF = null;
function leaflet() {
  if (window.L) return Promise.resolve(window.L);
  return LEAF || (LEAF = new Promise((ok, no) => {
    const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'lib/leaflet/leaflet.css'; document.head.append(c); // 앱 안에 둠 — 인터넷이 끊겨도·배포처가 오염돼도 안전(보안·여행 앱 전문가)
    const sc = document.createElement('script'); sc.src = 'lib/leaflet/leaflet.js'; sc.onload = () => ok(window.L); sc.onerror = () => { LEAF = null; no(new Error('지도')); }; document.head.append(sc);
  }));
}
function mapHtml(tid) {
  const pins = mapPins(tid), got = pins.filter(p => p.r.lat != null), kr = got.filter(p => p.r.cc === 'KR' || p.k !== 'out' && !p.r.cc).length;
  const mk = tid ? 'trip' : (UI.mapK || 'world');
  return '<div class="sec tmap-sec"><div class="sec-h"><h3 class="ih">' + ib('globe', 'var(--sky)', 1) + (tid ? '이 여행 지도' : '우리 가족 여행 지도') + '</h3>' +
    (tid ? '' : '<div class="seg mini"><button class="' + (mk === 'world' ? 'on' : '') + '" data-act="map-k" data-v="world">세계</button><button class="' + (mk === 'kr' ? 'on' : '') + '" data-act="map-k" data-v="kr">국내</button></div>') + '</div>' +
    '<div class="tmap-wrap"><div id="tmap" class="tmap" data-trip="' + esc(tid || '') + '" data-k="' + mk + '"><div class="tmap-wait">지도를 불러오는 중…</div></div><button class="tmap-full" data-act="map-full" aria-label="지도 크게 보기">' + ic('globe') + '<span>크게</span></button></div>' +
    '<div class="tmap-leg"><span><i style="--pc:' + PIN_C.out + '"></i>해외</span><span><i style="--pc:' + PIN_C.in + '"></i>국내</span><span><i style="--pc:' + PIN_C.cp + '"></i>부부</span><span><i style="--pc:' + PIN_C.cu + '"></i>문화</span><b class="num">' + got.length + '곳</b></div></div>';
}
let MAP = null;
async function mountMap(again) {
  const el = $('#tmap'); if (!el) return;
  const tid = el.dataset.trip || '', mk = el.dataset.k, pins = mapPins(tid);
  let L; try { L = await leaflet(); } catch (e) { el.innerHTML = '<div class="tmap-wait">인터넷이 연결되면 지도가 보여요</div>'; return; }
  if (!document.body.contains(el)) return;
  if (MAP && MAP.getContainer() !== el) { MAP.remove(); MAP = null; }
  if (!MAP) {
    el.innerHTML = '';
    MAP = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, worldCopyJump: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: 'anonymous' }).addTo(MAP);
    MAP._pins = L.layerGroup().addTo(MAP);
  }
  MAP._pins.clearLayers();
  const shown = pins.filter(p => p.r.lat != null && (mk !== 'kr' || p.r.cc === 'KR'));
  const yy = d => d ? d.slice(0, 4) + '. ' + md(d) : '';
  shown.forEach(p => {
    const icon = L.divIcon({ className: 'mpin-w', html: '<span class="mpin' + (p.city ? ' city' : '') + '" style="--pc:' + PIN_C[p.k] + '"></span>', iconSize: [26, 34], iconAnchor: [13, 32], popupAnchor: [0, -28] });
    L.marker([p.r.lat, p.r.lng], { icon, title: p.name }).addTo(MAP._pins).bindPopup('<div class="mpop"><b>' + esc(p.name) + '</b>' + (p.cat ? ' <span class="tag">' + esc(p.cat) + '</span>' : '') + '<small>' + esc(p.t.title) + ' · ' + esc(p.d ? yy(p.d) : p.t.start.slice(0, 4) + '년') + '</small>' +
      '<div class="mpop-a"><button class="btn" data-act="map-trip" data-v="' + esc(p.t.id) + '">여행 열기</button><a class="btn" href="' + esc(mapUrl(p.q)) + '" target="_blank" rel="noopener">구글 지도</a>' + nvA(nvPlace(p.name, p.r.lat, p.r.lng), 'btn nv-o', '<span class="nvlogo">N</span>네이버') + '</div></div>');
  });
  const ll = shown.map(p => [p.r.lat, p.r.lng]);
  if (ll.length) MAP.fitBounds(ll, { padding: [28, 28], maxZoom: tid ? 13 : mk === 'kr' ? 9 : 5 });
  else if (mk === 'kr') MAP.setView([36.2, 127.9], 6); else MAP.setView([30, 60], 1);
  setTimeout(() => MAP && MAP.invalidateSize(), 60);
  if (!again) geoFill(pins);
}

/* 하루 동선 지도 (팀장님 2026-11-27 「지도 포함 → 동선 마킹」): 그날 일정 좌표를 시간 순서대로 번호 핀 + 선. 일정에 zone(예: USJ)이 있으면 「USJ 안 | 하루 전체」 */
function dayMapPts(t, d) {
  const all = live('items', t.id).filter(i => i.date === d && !i.skip && i.lat != null && i.lng != null).sort(byTime);
  const zones = [...new Set(all.map(i => i.zone).filter(Boolean))];
  const big = zones.find(x => all.filter(i => i.zone === x).length * 2 > all.length); // 그날 일정의 절반 넘게 있는 구역(USJ 날)이 있으면 그 안부터, 아니면(교토처럼 여럿) 하루 전체부터
  const z = UI.dmz === 'all' ? 'all' : zones.includes(UI.dmz) ? UI.dmz : big || 'all';
  return { pts: z === 'all' ? all : all.filter(i => i.zone === z), zones, z };
}
function dayMapHtml(t, d) {
  const { pts, zones, z } = dayMapPts(t, d); if (!pts.length || (pts.length < 2 && !zones.length)) return ''; // 구역 안 핀이 하나여도 지도·구역 단추는 그대로(사라지면 되돌아갈 수 없었음)
  // 구역 단추는 여러 줄로 감싸지는 알약(한 줄 세그먼트는 휴대폰에서 잘렸음 — 팀장님 제보 2026-11-27)
  return '<div class="sec dmap-sec"><div class="sec-h"><h3 class="ih">' + ib('globe', 'var(--sky)', 1) + '이날 동선</h3></div>' +
    (zones.length ? '<div class="dm-zones">' + zones.map(x => '<button class="chipbtn' + (z === x ? ' on' : '') + '" data-act="dmz" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('') + '<button class="chipbtn' + (z === 'all' ? ' on' : '') + '" data-act="dmz" data-v="all">하루 전체</button></div>' : '') +
    '<div class="tmap-wrap"><button class="dm-loc" data-act="dm-loc" aria-label="내 위치 보기">📍 내 위치</button><div id="dmap" class="tmap dmap' + (z !== 'all' && pts.length >= 9 ? ' dense' : pts.length >= 6 ? ' mid' : '') + '" data-trip="' + esc(t.id) + '" data-d="' + esc(d) + '" data-z="' + esc(z) + '"><div class="tmap-wait">지도를 불러오는 중…</div></div><button class="tmap-full" data-act="map-full" aria-label="지도 크게 보기">' + ic('globe') + '<span>크게</span></button></div>' +
    '<div class="dmap-leg">' + pts.map((i, k) => '<button data-act="item-view" data-v="' + esc(i.id) + '"' + (i.done ? ' class="done"' : '') + '><b class="num">' + (k + 1) + '</b><span class="num">' + esc(i.time || '') + '</span>' + (dmEmo(i) ? '<i class="dm-emo">' + dmEmo(i) + '</i>' : '') + esc(dmLab(i)) + '</button>').join('') + '</div></div>';
}
/* 일정 동그라미 꾹 누르기(0.7초) → 도장 */
let HOLD = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.tl-card .chk[data-act="item-done"]'); if (!b) return;
  b.classList.add('holding');
  HOLD = { b, tm: setTimeout(() => { b.classList.remove('holding'); LAST_HOLD = Date.now(); b.dataset.held = '1'; b.click(); HOLD = null; }, 700) };
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => document.addEventListener(n, e => { if (HOLD && (n !== 'pointerleave' || e.target === HOLD.b)) { clearTimeout(HOLD.tm); HOLD.b.classList.remove('holding'); HOLD = null; } }, true));
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.tl-card .chk')) e.preventDefault(); });
/** 동선에서 탈것 그림(팀장님 2026-11-27 「대중교통 항목엔 이모티콘」) */
function dmEmo(i) {
  const g = i.go || {}, t = i.title || '';
  if (g.t === 'taxi' || /택시로/.test(t)) return '🚕';
  if (/(인천|간사이) 출발|출발 \(7C/.test(t)) return '✈️'; // 비행기는 「○○ 출발」 일정만(체크인 등 공항 안 일은 빼고)
  if (/도착/.test(t) && /공항|인천|간사이/.test(t) && !/체크인/.test(t)) return '🛬'; // 비행기에서 내린 때만(공항 가서 체크인하는 일정은 빼고)
  if (g.t === 'bus' || /셔틀버스|버스/.test(t)) return '🚌';
  if (/페리|배로 /.test(t)) return '⛴️';
  if (g.t === 'transit') return '🚃';
  if (g.t === 'walk' && i.cat === '이동') return '🚶';
  return '';
}
const dmLab = i => String(i.pin || planName(i)).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
let DMAP = null, DM_NEXT = '';
/** 내 위치(파란 점) — 여행 중 「여기서 어디로?」 */
function dmLocate() {
  if (!DMAP || !navigator.geolocation) return toast('이 휴대폰에서는 위치를 볼 수 없어요');
  toast('내 위치를 찾는 중…');
  navigator.geolocation.getCurrentPosition(p => {
    if (!DMAP || !window.L) return;
    const ll = [p.coords.latitude, p.coords.longitude];
    if (DMAP._me) DMAP._me.remove();
    DMAP._me = L.layerGroup([L.circle(ll, { radius: Math.min(p.coords.accuracy || 30, 300), color: '#2F80ED', weight: 1, fillOpacity: .12 }), L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 })]).addTo(DMAP);
    const b = DMAP.getBounds(); if (!b.contains(ll)) DMAP.flyTo(ll, Math.max(DMAP.getZoom() - 1, 14), { duration: .6 }); else DMAP.panTo(ll);
  }, () => toast('위치를 못 찾았어요. 휴대폰 설정에서 위치 권한을 켜 주세요'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}
async function mountDayMap() {
  const el = $('#dmap'); if (!el) return;
  const t = D.trips[el.dataset.trip]; if (!t) return;
  const { pts } = dayMapPts(t, el.dataset.d);
  let L; try { L = await leaflet(); } catch (e) { el.innerHTML = '<div class="tmap-wait">인터넷이 연결되면 지도가 보여요 · 아래 번호 순서대로 가요</div>'; return; }
  if (!document.body.contains(el)) return;
  if (DMAP && DMAP.getContainer() !== el) { DMAP.remove(); DMAP = null; }
  if (!DMAP) {
    el.innerHTML = '';
    DMAP = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 }); // 잘게 맞춰 한 단계 덜 확대되던 것을 줄임
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: 'anonymous' }).addTo(DMAP);
    DMAP._g = L.layerGroup().addTo(DMAP);
  }
  DMAP._g.clearLayers(); DMAP._mk = [];
  { const nowHM = hm().slice(0, 5), day = pts.filter(i => !i.done); DM_NEXT = el.dataset.d === today() ? ((day.filter(i => i.time && i.time <= nowHM).slice(-1)[0]) || day[0] || {}).id || '' : ''; } // 오늘이면 지금·다음 일정 핀 반짝임
  const ll = pts.map(i => [i.lat, i.lng]), zAll = el.dataset.z === 'all';
  if (ll.length > 1) { L.polyline(ll, { color: '#ffffff', weight: 8, opacity: .9 }).addTo(DMAP._g); L.polyline(ll, { color: '#C2410C', weight: 4, opacity: .95, dashArray: '2 9', lineCap: 'round' }).addTo(DMAP._g); }
  // 「하루 전체」는 구역마다 핀 하나(「USJ 3–19」)로 묶음 — 도시끼리 멀어 핀이 한 점에 뭉치던 것. 누르면 그 구역으로
  const groups = [];
  pts.forEach((i, k) => { const g = groups[groups.length - 1]; if (zAll && i.zone && g && g.zone === i.zone) { g.items.push(i); g.last = k + 1; } else groups.push({ zone: zAll ? i.zone : '', items: [i], first: k + 1, last: k + 1 }); });
  groups.forEach(g => {
    if (g.zone) {
      const la = g.items.reduce((a, i) => a + i.lat, 0) / g.items.length, ln = g.items.reduce((a, i) => a + i.lng, 0) / g.items.length;
      const icon = L.divIcon({ className: 'dpin-w', html: '<span class="dzone">' + esc(g.zone) + ' <b class="num">' + (g.first === g.last ? g.first : g.first + '–' + g.last) + '</b></span>', iconSize: null, iconAnchor: [0, 0] });
      const mk = L.marker([la, ln], { icon, title: g.zone + ' 안 동선 보기', zIndexOffset: 500 }).addTo(DMAP._g); mk.on('click', () => { UI.dmz = g.zone; render(); }); DMAP._mk.push(mk);
      return;
    }
    const dot = zAll && groups.some(x => x.zone); // 「하루 전체」에 구역이 있으면 구역 밖 일정(역·숙소)은 번호 없는 작은 점으로 — 겹쳐 읽을 수 없던 것
    g.items.forEach((i, n) => { const k = g.first + n - 1;
      const nowCls = el.dataset.d === today() && i.id === DM_NEXT ? ' next' : '';
      const icon = dot ? L.divIcon({ className: 'dpin-w', html: '<span class="ddot" title="' + (k + 1) + '. ' + esc(dmLab(i)) + '"></span>', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -8] })
        : L.divIcon({ className: 'dpin-w', html: '<span class="dpin' + (i.done ? ' done' : '') + nowCls + '">' + (k + 1) + (dmEmo(i) ? '<i>' + dmEmo(i) + '</i>' : '') + '</span>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
      const mk = L.marker([i.lat, i.lng], { icon, title: (k + 1) + '. ' + planName(i), zIndexOffset: k }).addTo(DMAP._g).bindPopup('<div class="mpop"><b>' + (k + 1) + '. ' + dmEmo(i) + ' ' + esc(dmLab(i)) + '</b><small>' + esc(i.time || '') + ' · ' + esc(planName(i)) + '</small><div class="mpop-a"><button class="btn" data-act="item-view" data-v="' + esc(i.id) + '">일정 보기</button><a class="btn" href="' + esc('https://www.google.com/maps/dir/?api=1&destination=' + i.lat + ',' + i.lng + '&travelmode=' + (i.zone ? 'walking' : 'transit')) + '" target="_blank" rel="noopener">' + eb(i.zone ? '🚶' : '🚇', '#E6F0FF') + '여기로 길찾기</a></div></div>');
      if (!dot) DMAP._mk.push(mk); });
  });
  // 화면에서 너무 붙은 핀은 살짝 비켜 놓기(확대·축소할 때마다 다시)
  const declutter = () => { if (!DMAP || !DMAP._mk) return; const placed = []; // 실제 크기(이름표는 넓음)로 겹침을 보고 나선형으로 비켜 놓기
    const sz = DMAP.getSize(), hit = (x, y, w, h) => x - w / 2 < 4 || y - h / 2 < 4 || x + w / 2 > sz.x - 4 || y + h / 2 > sz.y - 4 || (x - w / 2 < 46 && y - h / 2 < 78) || placed.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + 3 && Math.abs(q.y - y) < (q.h + h) / 2 + 3); // 지도 밖·＋− 단추 자리도 피함
    [...DMAP._mk].sort((a, b) => (b.options.zIndexOffset || 0) - (a.options.zIndexOffset || 0)).forEach(mk => { const e = mk.getElement && mk.getElement(), sp = e && e.firstElementChild; if (!sp) return; sp.style.translate = '0 0';
      const w = sp.offsetWidth || 26, h = sp.offsetHeight || 26, p = DMAP.latLngToContainerPoint(mk.getLatLng()); let dx = 0, dy = 0, k = 0;
      // 실제 자리에서 멀리 가면 헷갈려서 핀은 28px, 넓은 구역 이름표는 96px 안에서만 비킴 — 빈자리가 없으면 가장 덜 겹치는 자리
      const cost = (x, y) => placed.reduce((n, q) => n + Math.max(0, (q.w + w) / 2 + 3 - Math.abs(q.x - x)) * Math.max(0, (q.h + h) / 2 + 3 - Math.abs(q.y - y)), 0) + (x - w / 2 < 4 || y - h / 2 < 4 || x + w / 2 > sz.x - 4 || y + h / 2 > sz.y - 4 || (x - w / 2 < 46 && y - h / 2 < 78) ? 1e5 : 0);
      if (hit(p.x, p.y, w, h)) { let bc = cost(p.x, p.y), bx = 0, by = 0; for (let r = 12, rm = w > 40 ? 96 : 28; r <= rm && bc > 0; r += 8) for (let a = 0; a < 12; a++) { const x = Math.round(Math.cos(a * Math.PI / 6) * r), y = Math.round(Math.sin(a * Math.PI / 6) * r), c = cost(p.x + x, p.y + y); if (c < bc) { bc = c; bx = x; by = y; } } dx = bx; dy = by; }
      placed.push({ x: p.x + dx, y: p.y + dy, w, h }); sp.style.translate = dx + 'px ' + dy + 'px'; }); };
  if (!DMAP._dc) { DMAP._dc = true; DMAP.on('zoomend moveend', () => declutter()); }
  DMAP._declutter = declutter;
  const fit = () => { if (!DMAP || DMAP.getContainer() !== el || !el.offsetWidth) return; DMAP.invalidateSize(); if (ll.length === 1) DMAP.setView(ll[0], 16); else DMAP.fitBounds(ll, zAll ? { paddingTopLeft: [70, 44], paddingBottomRight: [70, 60], maxZoom: 16 } : { paddingTopLeft: [52, 36], paddingBottomRight: [36, 52], maxZoom: 18 }); [30, 400, 900].forEach(ms => setTimeout(() => DMAP && DMAP._declutter && DMAP._declutter(), ms));
    // 핀이 퍼진 모양(가로로 긴 USJ 등)에 맞춰 지도 높이를 줄여 빈 땅 없이 — 한 번만
    if (!el._sized && ll.length > 1 && !el.closest('.full')) { el._sized = true; setTimeout(() => { if (!DMAP || DMAP.getContainer() !== el) return; const ys = ll.map(q => DMAP.latLngToContainerPoint(q).y), need = Math.round(Math.max(...ys) - Math.min(...ys) + 130), h = el.offsetHeight; if (need < h - 40) { el.style.height = Math.max(260, need) + 'px'; DMAP.invalidateSize(); fit(); } }, 500); } }; // 왼쪽 위 ＋− 단추·오른쪽 아래 「크게」에 핀이 가리지 않게
  fit(); setTimeout(fit, 80); setTimeout(fit, 450);
  if (window.ResizeObserver && !el._ro) { el._ro = new ResizeObserver(() => { clearTimeout(el._rt); el._rt = setTimeout(fit, 120); }); el._ro.observe(el); }
}

/* 여행 화면 */
const TABS = [['today', '오늘'], ['plan', '일정'], ['+', ''], ['pass', '지갑'], ['book', '수첩']];
/* 지갑 안 「표 | 경비」 — 돈 관리도 지갑에서(팀장님 2026-11-26). 예전 주소 #/…/money 는 지갑 → 경비로 */
const wseg = () => UI.wseg || 'pass';
const PAGES = { talk: '번역기', wallet: '예약 모두', prep: '준비물', car: '내 차 어디?', info: '여행 정보', memory: '추억', weather: '날씨', passport: '여권' };
function tripView(t, tab) {
  if (tab === 'over') tab = 'today';
  if (tab === 'recs') { UI.mode = 'want'; tab = 'plan'; }
  if (tab === 'log') tab = 'memory';
  if (tab === 'money') { UI.wseg = 'money'; tab = 'pass'; }
  const isPage = !!PAGES[tab];
  if (!isPage && !TABS.some(x => x[0] === tab)) tab = 'today';
  let h = '<div class="wrap">' + sideNav(t, tab) + '<div class="topbar">' +
    (isPage ? '<button class="iconbtn" data-act="tab" data-v="today" aria-label="뒤로">' + ic('back') + '</button><h1>' + PAGES[tab] + '</h1>'
      : '<button class="iconbtn" data-act="home" aria-label="여행 목록">' + ic('home') + '</button><h1><button data-act="switch-trip"><span>' + esc(t.title) + '</span>' + ic('down') + '</button></h1>') +
    '<span id="sync" class="sync"></span><button class="iconbtn" data-act="trip-menu" data-v="' + esc(t.id) + '" aria-label="여행 메뉴">' + ic('more') + '</button></div>';
  h += '<div class="flow flow-' + (tab === 'pass' && wseg() === 'money' ? 'money' : tab) + '">' + ({ today: todayTab, plan: planTab, pass: passPage, money: moneyTab, book: bookTab, memory: memoryTab, talk: talkPage, wallet: walletPage, prep: prepPage, car: carPage, info: infoPage, weather: weatherPage, passport: passportPage })[tab](t) + '</div>';
  h += '</div><nav class="nav" aria-label="여행 메뉴">' + TABS.map(([k, n]) => k === '+'
    ? '<div><button class="plus" data-act="quick" aria-label="더하기">' + ic('plus') + '</button></div>'
    : '<button class="' + (k === tab || (k === 'pass' && tab === 'wallet') ? 'on' : '') + '" data-act="tab" data-v="' + k + '" aria-current="' + (k === tab ? 'page' : 'false') + '"><span class="pillbg">' + ic(k === 'pass' ? 'wallet' : k) + '</span>' + n + '</button>').join('') + '</nav>';
  return h;
}
/* PC 왼쪽 메뉴 — 넓은 화면(1100px~)에서만 보이고 아래 떠 있는 메뉴를 대신해요 */
const WIDE = () => matchMedia('(min-width:1100px)').matches;
function sideNav(t, tab) {
  const MAIN = [['today', '오늘'], ['plan', '일정'], ['pass', '지갑', 'wallet'], ['book', '수첩']];
  const MORE = [['prep', '준비물', 'prep'], ['wallet', '예약 모두', 'ticket'], ['memory', '추억', 'memory'], ['talk', '번역기', 'mic'], ['weather', '날씨', 'sun'], ['car', '내 차 어디?', 'car'], ['passport', '여권', 'doc'], ['info', '여행 정보', 'globe']];
  const b = (k, n, i) => '<button class="' + (k === tab ? 'on' : '') + '" data-act="tab" data-v="' + k + '"' + (k === tab ? ' aria-current="page"' : '') + '>' + ic(i || k) + '<span>' + n + '</span></button>';
  return '<aside class="snav" aria-label="여행 메뉴"><button class="snav-home" data-act="home">' + ic('home') + '<span>하하가족여행</span></button>' +
    '<div class="snav-trip"><small>' + esc(ddayText(t)) + '</small><b>' + esc(t.title) + '</b><span>' + esc(t.start.slice(5).replace('-', '/') + ' – ' + t.end.slice(5).replace('-', '/')) + '</span><button class="linkbtn" data-act="switch-trip">다른 여행</button></div>' +
    '<button class="btn pri snav-add" data-act="quick">' + ic('plus') + '더하기</button>' +
    '<nav class="snav-main">' + MAIN.map(([k, n, i]) => b(k, n, i)).join('') + '</nav><div class="snav-h">바로 가기</div><nav class="snav-more">' + MORE.map(([k, n, i]) => b(k, n, i)).join('') + '</nav></aside>';
}
let WIDE_NOW = null;
matchMedia('(min-width:1100px)').addEventListener('change', () => { if (PASS && ME) render(); });
const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.ts - b.ts);
/** 일정 1인 비용 = 그 일정 값 + 「여기까지 가는 길」 차비(교통 일정은 값이 곧 차비라 더하지 않음) — 2026-11-26 차비가 예산에서 빠지던 것 */
const itemCost = i => i.skip ? 0 : (Number(i.cost) || 0) + (i.cat !== '이동' && i.go && Number(i.go.fare) > 0 ? Number(i.go.fare) : 0);
function planCost(t) { let s = 0; live('items', t.id).forEach(i => s += toWon(t, itemCost(i))); return s; }
function spentWon(t, day) { let s = 0; const pre = preSpend(t); live('spends', t.id).forEach(x => { if (!day || (x.date === day && !pre(x))) s += toWon(t, x.amount, x.cur); }); return s; }
/** 미리 낸 돈(출발 전·보험·여권·예약 값과 같은 결제) — 「오늘 쓴 돈」에서는 뺌(시뮬레이션 2026-11-27) */
function preSpend(t) { const paidBk = live('bookings', t.id).map(b => Number(b.price) || 0).filter(Boolean); return s => (s.date || '') < t.start || s.cat === '준비' || paidBk.includes(Number(s.amount)); }
const parkBooking = t => live('bookings', t.id).find(b => b.kind === '주차');
const lastPark = t => live('parks', t.id).sort((a, b) => b.ts - a.ts)[0];
const flights = t => live('bookings', t.id).filter(b => b.kind === '항공').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

/** 예약끼리 시간 맞춰 보기 (주차 입차·출차 대 비행기) */
/** 주차 앞뒤 여유 (예약 시각 ± 몇 시간까지 입출차 가능) */
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function parkWindow(pb) {
  const g = (Number(pb.grace) || 0) * 60;
  const tm = s => { const [h, m] = String(s || '').split(':').map(Number); return isNaN(h) ? null : h * 60 + (m || 0); };
  const inM = tm(pb.time), em = String(pb.end || '').match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/), outM = em ? tm(em[2]) : null;
  return { g, inFrom: inM != null ? hhmm(inM - g) : '', inTo: inM != null ? hhmm(inM + g) : '', outFrom: outM != null ? hhmm(outM - g) : '', outTo: outM != null ? hhmm(outM + g) : '' };
}
/** 예약끼리 시간 맞춰 보기 (주차 입차·출차 대 비행기, 여유 시간까지 셈) */
function bookingWarnings(t) {
  const out = {}; const pb = parkBooking(t); const fl = flights(t);
  if (pb && fl.length) {
    const go = fl[0], back = fl[fl.length - 1], g = (Number(pb.grace) || 0) * 60;
    const mins = (d, tm) => { if (!d || !tm) return null; const x = pd(d); const [h, m] = tm.split(':').map(Number); return x.getTime() / 6e4 + h * 60 + m; };
    const inM = mins(pb.date, pb.time), goM = mins(go.date, go.time);
    if (inM != null && goM != null && goM - (inM - g) < 150) out[pb.id] = '입차 ' + pb.time + (g ? '(' + hhmm(inM - g) + '부터 가능)' : '') + ' → 출발 ' + go.time + ' — 연말 공항은 3시간 전 도착을 권해요.';
    const endS = String(pb.end || ''), em = endS.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
    const arr = String(back.end || '').match(/(\d{1,2}:\d{2})/);
    if (em && arr && back.date === em[1]) {
      const outM = mins(em[1], em[2]), arrM = mins(back.date, arr[1]);
      if (outM + g - arrM < 120) out[pb.id] = (out[pb.id] ? out[pb.id] + ' ' : '') + '도착 ' + arr[1] + ' 뒤 출차 ' + (g ? hhmm(outM + g) + '까지 가능' : em[2]) + ' — 입국·짐 찾기를 생각하면 빠듯해요.';
    }
  }
  return out;
}

/** 다녀온 지 일주일 넘은 여행 — 예보·환율·예약 안내는 쉼 */
const longAgo = t => t.end < today() && dayDiff(t.end, today()) > 7;
function todayTab(t) {
  const ph = phase(t), t0 = today();
  const c = countryOf(t);
  let h = '<div class="greet">' + nightArt() + greeting() + ' · <b>' + (ph === 'before' ? esc(t.place.split('·')[0].replace(/^일본\s*/, '').trim() || t.title) + '까지 ' + dayDiff(t0, t.start) + '일' : ph === 'after' ? '즐거운 추억이 됐어요' : '여행 ' + (dayDiff(t.start, t0) + 1) + '일째') + '</b></div>';
  h += heroCard(t, ph === 'before' ? '' : 'mini');
  h += newYearCard(t0);
  h += flightEveCard(t, t0);
  if (hm() >= '20:00' && !live('notes', t.id).some(n => (n.date || '') === t0)) h += '<div class="sec"><button class="alert" style="--cc:var(--pink)" data-act="note-new">' + ib('pen', 'var(--pink)') + '<span><b>📔 오늘 하루 한 줄 남기기</b><span>가장 좋았던 것 하나 · 사진 한 장 — 나중에 「추억」에서 다시 봐요</span></span></button></div>'; // 밤 8시부터, 오늘 일기가 아직 없을 때
  h += tkTodayCard(t);
  h += bringCard(t, t0);
  if (ph === 'before' && dayDiff(t0, t.start) <= 3 && !LS.get('offlineAt', 0)) h += '<div class="sec"><button class="alert" style="--cc:var(--sun)" data-act="offline"><span><b>📦 오프라인 준비가 아직 덜 끝났어요</b><span>인터넷이 되면 저절로 받아요 · 눌러서 지금 받기</span></span></button></div>';
  if (!longAgo(t)) h += '<div class="sec sos-row"><button class="sos-btn" data-act="sos-go"><span class="sb-ic">' + ic('call') + '</span><span class="sb-tx"><b>도움이 필요해요</b><span>긴급 전화 · 숙소 주소</span></span><span class="sb-go" aria-hidden="true">›</span></button><button class="sos-tr" data-act="tr-open"><span class="sb-ic">' + ic('mic') + '</span><b>번역기</b></button></div>';
  if (ph === 'after') h += storyCard(t);
  h += agoCard(t);
  const warns = bookingWarnings(t);
  const pb = parkBooking(t), pk = lastPark(t);
  // 비행기가 뜨기 전까지만 「차 세웠나요?」(시뮬레이션 2026-11-27: 일본에 내려서도 보이던 것)
  const fl0 = flights(t).find(b => b.date === t.start), preFly = ph === 'first' && (!fl0 || !fl0.time || hm() < fl0.time);
  // 귀국 날·다녀온 뒤: 내 차 먼저
  if ((ph === 'last' || ph === 'after' && dayDiff(t.end, t0) <= 2) && (pb || pk)) h += '<div class="sec">' + carCard(t, true) + '</div>';
  // 출발 날: 주차 위치 찍기
  if (preFly && pb && !pk) h += '<div class="sec"><button class="alert" style="--cc:var(--c-주차)" data-act="photo" data-v="parking">' + ib('camera', 'var(--c-주차)') + '<span><b>차 세웠나요? 기둥을 찍어 두세요</b><span>층·구역 글자를 읽어 「내 차 어디?」에 남겨요</span></span></button></div>';
  // 출발 전: 급한 일
  if (ph === 'before') {
    const urgent = live('checks', t.id).filter(x => !x.done && /예약|서류/.test(x.cat || '')).slice(0, 5);
    const wl = Object.keys(warns);
    if (urgent.length || wl.length) {
      h += '<div class="sec"><div class="sec-h"><h3 class="ih"><span class="urg-hic">' + ic('sos') + '</span>먼저 챙길 것<span class="urg-n num">' + (wl.length + urgent.length) + '</span></h3><button class="linkbtn" data-act="tab" data-v="prep">준비물 모두</button></div><div class="stack urg-list">';
      wl.forEach(id => { h += '<button class="alert" style="--cc:var(--warn)" data-act="booking-edit" data-v="' + esc(id) + '">' + ib('sos', 'var(--warn)') + '<span><b>' + esc(D.bookings[id].title) + '</b><span>' + esc(warns[id]) + '</span></span></button>'; });
      urgent.forEach(x => { h += '<div class="alert" style="--cc:var(--sun)"><button class="chk" data-act="check-done" data-v="' + esc(x.id) + '" aria-label="끝 표시"></button>' + pic(prepIcon(x), 36) + '<button class="al-t" data-act="check-edit" data-v="' + esc(x.id) + '"><b>' + esc(x.text) + '</b><span class="clamp2">' + esc(String(x.memo || x.cat || '').split('\n')[0]) + (x.who ? ' · ' + esc(x.who) : '') + '</span></button></div>'; }); // 긴 메모는 두 줄만 — PC에서 화면을 꽉 채우던 것(2026-11-27)
      h += '</div></div>';
    }
  }
  // 여행 중: 지금·다음 일정
  if (ph !== 'before' && ph !== 'after') {
    const list = live('items', t.id).filter(i => i.date === t0 && !i.skip).sort(byTime);
    const now = hm(); const next = list.filter(i => !i.done && (i.time || '99') >= now.slice(0, 5));
    const cur = list.filter(i => !i.done && i.time && i.time < now.slice(0, 5)).slice(-1)[0]; // 이미 시작했고 아직 다녀오지 않은 것 = 지금(UX 전문가)
    const show = (cur ? [cur] : []).concat(next.length ? next : list.filter(i => !i.done && i !== cur)).slice(0, 3);
    const mins = s2 => { const m = String(s2 || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    const nx = next[0], left = nx && mins(nx.time) != null ? mins(nx.time) - mins(now) : null;
    const nowLine = (cur || nx) ? '<div class="nowline">' + (cur ? '<span>⏱ 지금 <b>' + esc(cur.title) + '</b></span>' : '') + (nx ? '<span>다음 <b>' + esc(nx.time + ' ' + nx.title) + '</b>' + (left === 0 ? ' <em>곧</em>' : left != null && left > 0 ? ' <em>' + (left >= 60 ? Math.floor(left / 60) + '시간 ' + (left % 60 ? left % 60 + '분 ' : '') : left + '분 ') + '뒤</em>' : '') + '</span>' : '') + '</div>' : '';
    h += '<div class="sec"><div class="sec-h"><h3 class="ih"><img class="h-art" src="img/clock.webp" alt="">지금 · 다음 일정</h3><span class="flex" style="gap:10px"><button class="linkbtn" data-act="late">⏱ 늦어졌어요</button><button class="linkbtn" data-act="tab" data-v="plan">오늘 전체</button></span></div>' +
      nowLine + (nx && nx.place ? (u => '<a class="btn pri nx-go" href="' + esc(u) + '"' + (/^https:/.test(u) ? ' target="_blank" rel="noopener"' : '') + '>🧭 다음 「' + esc(nx.pin || planName(nx)) + '」까지 길찾기</a>')(goTo(t, nx.place, nx)) : '') + (show.length ? tlList(t, show, true) : '<div class="card empty"><div class="art">🎉</div><b>오늘 일정을 다 마쳤어요</b></div>') + '</div>';
    { // 오늘 쓴 돈을 이날 예산(일정 값 × 사람 수)과 견줘 보기(2026-11-27)
      const nn0 = (t.members || []).length || 1, plan0 = toWon(t, live('items', t.id).filter(i => i.date === t0).reduce((q, i) => q + itemCost(i), 0) * nn0), sp0 = spentWon(t, t0), pc = plan0 ? Math.round(sp0 / plan0 * 100) : 0;
      h += '<div class="sec"><button class="alert" style="--cc:var(--coral)" data-act="photo" data-v="receipt">' + ib('receipt', 'var(--coral)') + '<span><b>오늘 쓴 돈 ' + manWon(sp0) + (plan0 ? ' <small class="muted">/ 예산 약 ' + manWon(plan0) + '</small>' : '') + '</b>' +
        (plan0 ? '<span class="day-bar"><i style="width:' + Math.min(100, pc) + '%;' + (pc > 100 ? 'background:var(--warn-ink,#C62A2F)' : '') + '"></i></span><span>' + (pc > 100 ? '예산보다 ' + manWon(sp0 - plan0) + ' 더 썼어요' : '예산의 ' + pc + '% · 영수증을 찍으면 바로 적혀요') + '</span>' : '<span>영수증을 찍으면 바로 적혀요</span>') + '</span></button></div>';
    }
    const leftHotel = t0 === t.end && (lv => hm() >= ((lv.find(i => i.date === t0 && /^숙소 →/.test(i.title || '')) || {}).time || '10:00'))(live('items', t.id)); // 귀국 날 숙소를 나선 뒤엔 숙소 주소 카드를 감춤(시뮬레이션 2026-11-27)
    if (hotelOf(t) && !leftHotel) h += '<div class="sec"><button class="alert" style="--cc:var(--sun)" data-act="taxi"><span class="sc-ic" style="font-size:26px">🚕</span><span><b>택시에 숙소 주소 보여 주기</b><span>' + esc(hotelOf(t).title) + '</span></span></button></div>';
  }
  // 티켓 지갑
  const bk = live('bookings', t.id).sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  if (ph !== 'before' && ph !== 'after' && bk.length) h += '<div class="sec"><button class="wl-link" data-act="tab" data-v="pass">' + ib('ticket', 'var(--c-관광)', 1) + '<span><b>티켓·예약 모두</b><span>지갑에서 사람마다 티켓을 봐요</span></span><em class="wl-go">›</em></button></div>';
  else if (!(longAgo(t) && !bk.length)) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('ticket', 'var(--c-관광)', 1) + '티켓·예약</h3><button class="linkbtn" data-act="tab" data-v="wallet">모두 보기</button></div>' +
    (bk.length ? '<div class="wallet">' + bk.map(b => passCard(t, b, warns[b.id])).join('') + '</div>' : '<button class="alert" data-act="photo" data-v="booking">' + ib('camera', 'var(--sky)') + '<span><b>예약 화면을 찍어 넣어요</b><span>항공권·숙소·티켓·주차 예약</span></span></button>') + '</div>';
  // 내 차 (그 밖의 때)
  if (!(ph === 'last' || ph === 'after') && (pk || pb && preFly) && ph !== 'before') h += '<div class="sec">' + carCard(t) + '</div>';
  // 준비 (출발 전)
  if (ph === 'before') {
    const ck = live('checks', t.id), done = ck.filter(x => x.done).length, p = ck.length ? Math.round(done / ck.length * 100) : 0;
    h += '<div class="sec"><button class="card flex" style="width:100%;text-align:left;gap:14px" data-act="tab" data-v="prep"><div class="ring" style="--p:' + p + '"><span class="num">' + p + '%</span></div><div style="flex:1"><b style="font-size:17px">준비 ' + done + ' / ' + ck.length + '</b><div class="muted">' + (p === 100 ? '준비 끝! 가방만 들면 돼요' : '남은 것 ' + (ck.length - done) + '개 · 눌러서 챙기기') + '</div></div>' + '<img class="bp" src="img/backpack.webp" alt="">' + '</button></div>';
  }
  // 여행 정보 (환율·날씨·나라)
  if (!longAgo(t)) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('globe', 'var(--sky)', 1) + (c ? c.f + ' ' + c.n + ' ' : '') + '여행 정보</h3><button class="linkbtn" data-act="tab" data-v="info">자세히</button></div>' + infoCards(t, true) + '</div>';
  // 첫날 일정 미리 보기 (출발 전)
  if (ph === 'before') {
    const first = live('items', t.id).filter(i => i.date === t.start).sort(byTime).slice(0, 4);
    if (first.length) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('plan', 'var(--c-이동)', 1) + '첫날 · ' + esc(md(t.start)) + '</h3><button class="linkbtn" data-act="tab" data-v="plan">전체 일정</button></div>' + tlList(t, first) + '</div>';
  }
  // 추억
  const memN = live('notes', t.id).length + live('places', t.id).length + planPlaces(t.id).length;
  h += '<div class="sec"><button class="alert" style="--cc:var(--pink)" data-act="tab" data-v="memory">' + ib('memory', 'var(--pink)') + '<span><b>추억 ' + memN + '</b><span>여행 일기 · 가 본 곳 별점 · 사진</span></span></button></div>';
  // 기록 — 늘 보이는 곳이라 작은 단추 한 줄로
  h += '<div class="sec rec-line"><span class="rec-h">' + ic('doc') + '기록</span>' +
    (safeUrl(t.docUrl) ? '<a class="rec-chip" href="' + esc(t.docUrl) + '" target="_blank" rel="noopener" title="고칠 때마다 저절로 정리돼요' + (t.docAt ? ' · ' + new Date(t.docAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + '">' + ic('doc') + '드라이브 기록</a>'
      : '<button class="rec-chip" data-act="export-doc" data-v="' + esc(t.id) + '">' + ic('doc') + '드라이브 기록 만들기</button>') +
    '<button class="rec-chip" data-act="drive-open" title="4gospel 드라이브 「하하가족여행」">' + ic('folder') + '사진 폴더</button>' +
    '<button class="rec-chip" data-act="export-notion" data-v="' + esc(t.id) + '" title="' + (t.notionAt ? '마지막 ' + new Date(t.notionAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '설정에서 노션을 이으면 써요') + '">' + ic('notion') + '노션</button></div>';
  return h;
}

function passCard(t, b, warn) {
  const [icn, col] = BK[b.kind] || BK.기타;
  const fi = b.kind === '항공' ? flightInfo(b) : null;
  if (fi) {
    const arr = String(b.end || '').match(/(\d{1,2}:\d{2})/);
    const home = ['ICN', 'GMP', 'PUS', 'CJJ', 'TAE'].includes(fi.to);
    return '<button class="pass flight' + (warn ? ' warn' : '') + '" style="--cc:' + col + '" data-act="booking-edit" data-v="' + esc(b.id) + '"><div class="main">' +
      '<div class="k">' + itPic('plane', col, 1) + esc(fi.air || '항공') + (fi.fn ? '<span class="fno">' + esc(fi.fn) + '</span>' : '') + '</div>' +
      '<div class="route"><div><b>' + fi.from + '</b><small>' + esc(fi.fromN) + '</small><em class="num">' + esc(b.time || '') + '</em></div>' +
      '<div class="path"><i></i>' + ic('plane') + '<i></i></div>' +
      '<div style="text-align:right"><b>' + fi.to + '</b><small>' + esc(fi.toN) + '</small><em class="num">' + esc(arr ? arr[1] : '') + '</em></div></div>' +
      (b.code ? '<span class="code">' + esc(b.code) + '</span>' : '') + '</div>' +
      '<div class="side"><small>' + esc(b.date ? md(b.date) : '') + '</small>' + itPic(home ? 'land' : 'plane', col, 1) + '<small>' + (home ? '오는 편' : '가는 편') + '</small></div></button>';
  }
  const endS = String(b.end || '');
  const sideTop = b.kind === '주차' && endS.length > 5 ? '출차 ' + md(endS.slice(0, 10)) : (b.date ? md(b.date) : '날짜 미정');
  const sideBig = b.kind === '주차' && endS.length > 5 ? endS.slice(11) : (b.time || '—');
  const sf = b.kind !== '주차' && String(b.memo || '').length > 50; // 긴 메모는 스르륵 접기(2026-11-27)
  return '<button class="pass' + (warn ? ' warn' : '') + (sf ? ' sfc fold' : '') + '" style="--cc:' + col + '" data-act="booking-edit" data-v="' + esc(b.id) + '"><div class="main"><div class="k">' + itPic({ 항공: 'plane', 숙소: 'bed', 티켓: 'ticket', 교통: 'train' }[b.kind] || icn, col, 1) + esc(b.kind) + (b.provider ? ' · ' + esc(b.provider) : '') + '</div>' +
    '<div class="t">' + esc(b.title) + '</div>' + (b.kind === '주차' ? '<div class="m">' + esc([b.date && ('입차 ' + md(b.date) + ' ' + (b.time || '')), b.car && ('🚗 ' + b.car)].filter(Boolean).join(' · ')) + '</div>' + (Number(b.grace) ? '<span class="pill" style="align-self:flex-start">앞뒤 ' + Number(b.grace) + '시간 여유</span>' : '') : (b.memo ? (sf ? '<div class="tl-x"><div class="m">' + esc(b.memo) + '</div></div>' : '<div class="m">' + esc(b.memo) + '</div>') : '')) +
    (b.code ? '<span class="code">' + esc(b.code) + '</span>' : '') + (warn ? '<div class="warnline">⚠️ 시간 확인</div>' : '') + '</div>' +
    '<div class="side"><small>' + esc(sideTop) + '</small><b class="num">' + esc(sideBig) + '</b>' + (b.kind !== '주차' && endS ? '<small class="num">→ ' + esc(endS.length > 5 ? md(endS.slice(0, 10)) + ' ' + endS.slice(11) : endS) + '</small>' : '') + '</div>' +
    (safeImg(b.thumb) ? '<img class="ph" src="' + b.thumb + '" alt="">' : '') + '</button>';
}
function carCard(t, top) {
  const pb = parkBooking(t), pk = lastPark(t);
  if (!pk && top && pb) return '<button class="alert" style="--cc:var(--c-주차)" data-act="tab" data-v="car"><img class="alert-art" src="img/my-car.webp" alt=""><span><b>🚗 집에 가는 날 — ' + esc(pb.place || pb.title) + '</b><span>' + (pb.code ? '예약번호 ' + esc(pb.code) + ' · ' : '') + (pb.end ? '출차 ' + esc(String(pb.end).slice(-5)) + ' · ' : '') + '기둥 사진은 없어요 — 주차장 셔틀·안내소에 예약번호를 말해요</span></span></button>'; // 돌아오는 날엔 「찍어 두세요」 대신 예약 정보(시뮬레이션 2026-11-27)
  if (!pk) return '<button class="alert" style="--cc:var(--c-주차)" data-act="photo" data-v="parking"><img class="alert-art" src="img/my-car.webp" alt=""><span><b>내 차 어디?</b><span>' + (pb ? esc(pb.place || pb.title) + ' · ' : '') + '주차한 뒤 기둥을 찍어 두세요</span></span></button>';
  return '<button class="car" style="width:100%;text-align:left;display:block" data-act="tab" data-v="car">' + (safeImg(pk.thumb) ? '<img src="' + pk.thumb + '" alt="주차 위치 사진">' : '') +
    '<div class="cin"><div class="muted">' + (top ? '🚗 집에 가는 날 — 내 차는 여기' : '🚗 내 차 어디?') + '</div><div class="spot">' + esc(pk.spot || '주차 위치') + '</div><div class="muted">' + esc(pk.memo || '') + (pb ? ' · 출차 ' + esc(String(pb.end || '')) : '') + '</div></div></button>';
}

/* 일정 사이 이동 — i.go = { t: walk|transit|taxi, s: 한 줄, min, fare, dep, from, to, steps:[{m,l,f,d,to,a,n,min}] } (구글 길찾기로 확인한 것) */
const GO_IC = { walk: '🚶', transit: '🚃', taxi: '🚕', bus: '🚌' };
/** 가는 길 한 줄 — 순서를 바꾸면 저절로 따라감(팀장님 2026-11-27 「순서를 바꾸면 동선과 내용도 바뀌나?」)
 *  · 파크 안(zone)처럼 걸어서 가는 곳: 바로 앞 일정 좌표에서 걸음 분을 그때그때 셈
 *  · 전철·택시처럼 적어 둔 길: 앞 일정이 바뀌었으면 「길찾기로 다시 보기」 알림 */
const prevItem = i => { const l = live('items', i.trip).filter(x => x.date === i.date && (!x.skip || x.id === i.id)).sort(byTime), k = l.findIndex(x => x.id === i.id); return k > 0 ? l[k - 1] : null; };
const walkMin = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r, h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2, m = 2 * R * Math.asin(Math.sqrt(h)) * 1.3; return { m, min: Math.max(1, Math.round(m / 70)) }; };
const goLine = i => {
  const p = i.date ? prevItem(i) : null, g = i.go || {};
  if (p && i.zone && i.zone === p.zone && i.lat != null && p.lat != null && (!g.t || g.t === 'walk') && !g.keep) { // g.keep = 셔틀·비행기처럼 앞 일정 자리에서 걸어 셈하면 틀리는 곳은 적어 둔 길 그대로
    const w = walkMin(p, i);
    return '<div class="goline">🚶 ' + esc(p.pin || planName(p)) + (w.m < 60 ? '에서 바로 옆' : '에서 걸어서 약 ' + w.min + '분') + '</div>';
  }
  if (!g.s) return '';
  const moved = !!(p && g.after && p.id !== g.after); // go.after = 이 길을 적을 때 바로 앞 일정 — 순서가 바뀌면 알림
  const dm = s2 => { const m = String(s2 || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const late = g.t === 'transit' && dm(g.dep) != null && dm(i.time) != null && (dm(i.time) > dm(g.dep) + (i.cat === '이동' ? 0 : Number(g.min) || 0) + 10 || dm(i.time) < dm(g.dep) - 30); // 적어 둔 열차를 놓칠 만큼 늦거나, 30분 넘게 이르면(다른 열차)
  if (late && !moved) return '<div class="goline">' + (GO_IC[g.t] || '➜') + ' ' + esc(g.s) + ' <em class="go-moved">· 시간이 바뀌었어요 — 「길찾기」로 다음 열차를 봐요</em></div>';
  return '<div class="goline">' + (GO_IC[g.t] || '➜') + ' ' + esc(g.s) + (moved ? ' <em class="go-moved">· 앞 일정이 바뀌었어요 — 「길찾기」로 다시 봐요</em>' : '') + '</div>';
};
function goUrl(i) {
  const g = i.go; if (!g || !g.from || !g.to) return '';
  let data = '/data=!4m2!4m1!3e2';
  if (g.t !== 'walk') {
    const hm = String(g.dep || '').match(/(\d+):(\d+)/);
    data = hm && i.date ? '/data=!4m6!4m5!2m3!6e0!7e2!8j' + Date.UTC(+i.date.slice(0, 4), +i.date.slice(5, 7) - 1, +i.date.slice(8, 10), +hm[1], +hm[2]) / 1000 + '!3e3' : '/data=!4m2!4m1!3e3';
  }
  return 'https://www.google.com/maps/dir/' + encodeURIComponent(g.from) + '/' + encodeURIComponent(g.to) + data + '?hl=ko';
}
function goHtml(i) {
  const g = i.go; if (!g || !g.s) return '';
  const st = (g.steps || []).map(x => '<li>' + (x.m === 'walk' ? '🚶 걸어서 ' + x.min + '분' + (x.to ? ' → ' + esc(x.to) : '') : (x.m === 'bus' ? '🚌 ' : '🚃 ') + '<b class="num">' + esc(x.d || '') + '</b> ' + esc(x.l || '') + ' <span class="muted">' + esc(x.f || '') + ' → ' + esc(x.to || '') + '</span> <b class="num">' + esc(x.a || '') + '</b>' + (x.n ? ' <span class="muted small">(' + x.n + '정거장)</span>' : '')) + '</li>').join('');
  return '<div class="iv-sec iv-go-sec"><b>' + ic('route') + '여기까지 가는 길</b><div class="goline big">' + (GO_IC[g.t] || '➜') + ' ' + esc(g.s) + '</div>' + (st ? '<ol class="gosteps">' + st + '</ol>' : '') +
    (g.note ? '<div class="muted small">' + esc(g.note) + '</div>' : '') + (goUrl(i) ? '<a class="btn" href="' + esc(goUrl(i)) + '" target="_blank" rel="noopener">' + ic(g.t === 'walk' ? 'walk' : 'route') + '구글 지도에서 ' + (g.t === 'walk' ? '걷는 길' : '이 시각 경로') + ' 보기</a>' : '') + '</div>';
}
/* 해 뜨고 지는 때 — 날짜·위치로 계산(근사, ±2분). 카드 배경에 해·노을·달을 은은하게 */
function sunRS(ds, lat, lng, tz) {
  const y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10);
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (N - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180, ha = Math.acos(Math.max(-1, Math.min(1, Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec)))) * 180 / Math.PI;
  return { rise: 720 - 4 * (lng + ha) - eqt + tz * 60, set: 720 - 4 * (lng - ha) - eqt + tz * 60 };
}
const TZ = { KR: 9, JP: 9, TW: 8, HK: 8, CN: 8, VN: 7, TH: 7, SG: 8, PH: 8, FR: 1, DE: 1, CH: 1, CZ: 1, IT: 1, ES: 1, GB: 0, US: -5, AU: 10 };
const GEO0 = { KR: [37.55, 126.98], JP: [34.69, 135.5], TW: [25.04, 121.56], FR: [48.86, 2.35], CH: [46.02, 7.75], CZ: [50.08, 14.43] };
const SUN_C = {};
function sunOf(t, ds) {
  const key = t.id + ds; if (SUN_C[key]) return SUN_C[key];
  const near = live('items', t.id).find(i => i.date === ds && i.lat != null) || live('items', t.id).find(i => i.lat != null);
  const c = t.country || 'KR', [lat, lng] = near ? [near.lat, near.lng] : (GEO0[c] || GEO0.KR);
  const m = +ds.slice(5, 7), eu = ['FR', 'DE', 'CH', 'CZ', 'IT', 'ES', 'GB'].includes(c) && m >= 4 && m <= 10;
  return SUN_C[key] = sunRS(ds, lat, lng, (TZ[c] != null ? TZ[c] : Math.round(lng / 15)) + (eu ? 1 : 0));
}
const mmStr = x => Math.floor(x / 60) + ':' + String(Math.round(x % 60)).padStart(2, '0');
function sunVars(t, i) {
  if (!i.date || !/^\d{1,2}:\d\d/.test(i.time || '')) return { b: '', st: '' };
  const { rise, set } = sunOf(t, i.date), [h, mi] = i.time.split(':').map(Number), x = h * 60 + mi;
  let b, sx, sy;
  if (x < rise - 30 || x > set + 75) { b = 'night'; sx = 86; sy = 24; }
  else if (x < rise) { b = 'dawn'; sx = 6; sy = 92; }
  else if (x > set) { b = 'evening'; sx = 96; sy = 96; }
  else { const p = (x - rise) / (set - rise); b = x < rise + 240 ? 'morning' : x > set - 75 ? 'evening' : 'day'; sx = 6 + 88 * p; sy = 88 - 70 * Math.sin(Math.PI * p); }
  return { b, st: '--sx:' + sx.toFixed(1) + '%;--sy:' + sy.toFixed(1) + '%' };
}
function sunChip(t, ds) {
  if (!ds) return '';
  const { rise, set } = sunOf(t, ds);
  return '<div class="sunchip"><span>🌅 해 뜨는 때 <b class="num">' + mmStr(rise) + '</b></span><span>🌇 해 지는 때 <b class="num">' + mmStr(set) + '</b></span><span class="sc-leg"><i class="b-morning"></i>아침<i class="b-day"></i>낮<i class="b-evening"></i>저녁<i class="b-night"></i>밤</span></div>';
}
/* 일정 목록 — 시간 순서대로 화살표, 화살표 옆에 가는 길 */
function tlList(t, list, nowFirst) {
  return '<div class="tl tl-flow">' + list.map((i, k) => (k > 0 || (i.go && i.go.s) ? '<div class="tl-arrow"><span class="ar">↓</span>' + goLine(i) + '</div>' : '') + tlItem(t, i, nowFirst && k === 0)).join('') + '</div>';
}
/* 일정 카드 접기(팀장님 2026-11-27 「글이 너무 많아 — 평소엔 접고, 누르거나 오래 보면 펼치기」 · 「그 시간이 되거나 이전에 자세히 보니 거기에 맞춰」)
   펼침: ① 오늘 「지금」 일정·90분 안에 시작할 일정 ② 누른 카드(한 번 더 누르면 자세히 보기 창) ③ 화면 가운데에 1.5초 머문 카드 */
const TL_OPEN = new Set();
// 오늘 화면의 카드도 스크롤하면 접히고 멈춰 읽으면 펼침(팀장님 2026-11-27) — 「지금 · 다음」 카드를 미리 펼쳐 두지 않음
const tlOnToday = () => { const r = route(); return r.view === 'trip' && (r.tab || 'today') === 'today'; };
function tlSoon(i, now) {
  if (now) return true;
  if (!i.date || i.date !== today() || i.done || i.skip || !i.time) return false;
  const m = s2 => { const x = String(s2).match(/(\d{1,2}):(\d{2})/); return x ? +x[1] * 60 + +x[2] : null; }, d = m(i.time) - m(hm());
  return d <= 90 && d >= -60;
}
function tlItem(t, i, now) {
  const [icn, col] = itemIcon(i), sv = sunVars(t, i), open = TL_OPEN.has(i.id) || (!tlOnToday() && tlSoon(i, now)), long = String(i.memo || '').length > 40 || !!i.tip;
  return '<div class="tl-card' + (sv.b ? ' sun b-' + sv.b : '') + (i.done ? ' done' : '') + (i.skip ? ' skip' : '') + (now ? ' now' : '') + (long && !open ? ' fold' : '') + '" data-id="' + esc(i.id) + '" style="--cc:' + cc(i.cat) + ';' + sv.st + '">' + (i.done ? '<span class="tl-stamp' + (JUST_DONE === i.id ? ' just' : '') + '">' + (i.zone === 'USJ' ? usjStamp('mini') : hahaStamp('mini')) + '</span>' : '') + '<span class="tm num">' + itPic(icn, col) + '<b>' + esc(i.time || '') + '</b></span>' +
    '<button class="body" data-act="tl-tap" data-v="' + esc(i.id) + '"><div class="t">' + esc(i.title) + '</div>' + '<div class="tl-x">' + (i.memo ? '<div class="m tl-memo">' + esc(i.memo) + '</div>' : '') + (i.tip ? '<div class="m tl-tip" style="color:var(--c-간식);font-weight:600">💡 ' + esc(i.tip) + '</div>' : '') + '</div>' + (long ? '<div class="tl-hint">' + (i.tip ? '💡 주의 사항 · ' : '') + '눌러서 자세히 ▾</div>' : '') +
    '<div class="meta">' + (i.skip ? (/^\(선택\)/.test(i.title || '') ? '<span class="tag opt-tag">💡 선택 — 눌러서 「다시 넣기」</span>' : '<span class="tag skip-tag">⏭ 이번엔 건너뜀</span>') : '') + '<span class="tag">' + esc(i.cat || '기타') + '</span>' + (i.cost ? '<span class="tag num" style="--cc:var(--soft)">1인 ' + comma(i.cost) + unit(t.cur) + '</span>' : '') +
    (i.go && i.go.t === 'taxi' ? '<span class="go taxi-go" role="button" data-act="taxi" data-v="' + esc(i.id) + '">🚕 기사님께 보여 주기</span>' : '') +
    (i.place ? (u => '<a class="go' + (/^(nmap|intent):/.test(u) ? ' nvapp' : '') + '" href="' + esc(u) + '"' + (/^https:/.test(u) ? ' target="_blank" rel="noopener"' : '') + ' data-stop="1">' + ic('route') + '길찾기</a>')(goTo(t, i.place, i)) : '') + '</div></button>' +
    '<button class="chk ' + (i.done ? 'on' : '') + '" data-act="item-done" data-v="' + esc(i.id) + '" aria-label="다녀옴 표시">' + (i.done ? ic('check') : '') + '</button></div>';
}

/* ---------- 번역기 · 사진 번역 (쿨리쿨리처럼: 메뉴판·성분·안내판·영수증) ---------- */
const TR_LANG = { JP: ['ja', '일본어', 'ja-JP'], TW: ['zh-TW', '중국어(대만)', 'zh-TW'], HK: ['zh-TW', '중국어(홍콩)', 'zh-HK'], CN: ['zh-CN', '중국어', 'zh-CN'], VN: ['vi', '베트남어', 'vi-VN'], TH: ['th', '태국어', 'th-TH'],
  FR: ['fr', '프랑스어', 'fr-FR'], DE: ['de', '독일어', 'de-DE'], CH: ['de', '독일어', 'de-CH'], CZ: ['cs', '체코어', 'cs-CZ'], IT: ['it', '이탈리아어', 'it-IT'], ES: ['es', '스페인어', 'es-ES'],
  US: ['en', '영어', 'en-US'], GB: ['en', '영어', 'en-GB'], AU: ['en', '영어', 'en-AU'], SG: ['en', '영어', 'en-SG'], PH: ['en', '영어', 'en-PH'], KR: ['en', '영어', 'en-US'] };
const KO = ['ko', '한국어', 'ko-KR'];
const trLang = t => TR_LANG[t && t.country] || TR_LANG.JP;
const TR_PHOTO = [['menu', '🍜', '메뉴판', '요리 설명·알레르기'], ['label', '🧴', '성분·약·라벨', '화장품·과자·약 설명'], ['sign', '🚉', '안내판·표지', '역·가게 안내'], ['receipt', '🧾', '영수증·기타', '무엇을 샀는지']];
/* 읽어 주기 — 휴대폰에 있는 음성 가운데 자연스러운 여성 음성을 먼저(이름에 Natural·Neural·Google·Kyoko·Nanami 등) */
const VOICE_GOOD = /Natural|Neural|Online|Premium|Enhanced|Google|Kyoko|Nanami|Aoi|Mayu|Haruka|O-ren|Yuna|Sora|SunHi|Ava|Samantha|Female|여성|女性/i, VOICE_MALE = /Otoya|Ichiro|Keita|Daichi|Naoki|Hattori|Eddy|Reed|Rocko|Grandpa|Male|남성|男性/i;
function bestVoice(lang) {
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [], l2 = lang.slice(0, 2).toLowerCase();
  const mine = vs.filter(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith(l2));
  const score = v => (VOICE_GOOD.test(v.name) ? 4 : 0) + (/Natural|Neural|Online|Premium|Enhanced/i.test(v.name) ? 3 : 0) - (VOICE_MALE.test(v.name) ? 5 : 0) + ((v.lang || '').replace('_', '-').toLowerCase() === lang.toLowerCase() ? 1 : 0) + (v.localService ? 0 : 1);
  return mine.sort((a, b) => score(b) - score(a))[0] || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
/* 꼭 쓰는 말(일본어)은 미리 녹음한 여성 음성 파일 — audio/ja/<글자 지문>.m4a, 없으면 읽어 주기 */
const sayKey = s => { let x = 5381; for (const ch of s) x = (((x << 5) + x) + ch.codePointAt(0)) >>> 0; return x.toString(16); };
let SAY_AUDIO = null;
function sayPhrase(text, lang) {
  if (!/^ja/i.test(lang)) return speak(text, lang);
  try { if (SAY_AUDIO) SAY_AUDIO.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  const url = 'audio/ja/' + sayKey(text) + '.m4a';
  const play = src => { const a = new Audio(src); SAY_AUDIO = a; return a.play(); };
  (window.caches ? caches.match(url, { ignoreSearch: true }).then(r => r ? r.blob().then(b => play(URL.createObjectURL(b))) : play(url)) : play(url)).catch(() => speak(text, lang));
}
function speak(text, lang) {
  if (!window.speechSynthesis) return toast('이 휴대폰은 읽어 주기를 지원하지 않아요');
  const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = .92; u.pitch = 1.05; const v = bestVoice(lang); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function listen(lang, cb) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return toast('말로 넣기가 안 되는 휴대폰이에요. 키보드의 🎤를 눌러 주세요');
  try { const r = new R(); r.lang = lang; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = e => cb(e.results[0][0].transcript); r.onerror = () => toast('잘 못 들었어요. 다시 눌러 말해 주세요'); r.start(); toast('듣고 있어요… 말해 주세요'); } catch (e) { toast('말로 넣기를 시작하지 못했어요'); }
}
function trState() { return UI.tr || (UI.tr = { dir: 'ko', mode: 'text', text: '', out: '', face: {} }); }
async function trRun(t, text, from, to, where) {
  const S = trState(); text = String(text || '').trim(); if (!text) return toast('번역할 말을 적거나 말해 주세요');
  if (where === 'text') { S.text = text; S.busy = true; render(); }
  try {
    const r = await call('translate', text, from[0], to[0]);
    const out = (r && r.text) || '';
    const hist = LS.get('trHist', []).filter(x => x.f !== text); hist.unshift({ f: text, t: out, a: from[0], b: to[0], ts: Date.now() }); LS.set('trHist', hist.slice(0, 12));
    return out;
  } catch (e) { toast(e.code === 'offline' ? '인터넷이 끊겨 번역하지 못했어요' : '번역하지 못했어요: ' + e.message); return ''; }
  finally { S.busy = false; }
}
function talkPage(t) {
  const S = trState(), L = trLang(t);
  const from = S.dir === 'ko' ? KO : L, to = S.dir === 'ko' ? L : KO;
  let h = '<div class="tr-top"><button class="tr-lang" data-act="tr-swap" aria-label="번역 방향 바꾸기"><b>' + from[1] + '</b><span>' + ic('route') + '</span><b>' + to[1] + '</b></button>' +
    '<div class="seg tr-seg">' + [['text', '말·글'], ['photo', '사진 번역'], ['face', '마주 보고']].map(([k, n]) => '<button class="' + (S.mode === k ? 'on' : '') + '" data-act="tr-mode" data-v="' + k + '">' + n + '</button>').join('') + '</div></div>';
  if (S.mode === 'text') {
    h += '<div class="card tr-in"><textarea id="tr-in" class="in" rows="3" placeholder="' + (S.dir === 'ko' ? '한국어로 적거나 🎤 눌러 말해요 · 예: 화장실 어디예요?' : L[1] + ' 문장을 붙여 넣거나 🎤 눌러 들려주세요') + '">' + esc(S.text || '') + '</textarea>' +
      '<div class="tr-btns"><button class="btn" data-act="tr-mic">' + ic('mic') + '말하기</button><button class="btn pri" data-act="tr-go">' + (S.busy ? '번역 중…' : '번역하기') + '</button></div></div>';
    if (S.out) h += '<div class="card tr-out"><small>' + to[1] + '</small><div class="tr-big" lang="' + to[0] + '">' + esc(S.out) + '</div>' +
      '<div class="tr-btns four"><button class="btn" data-act="tr-say">' + ic('speaker') + '듣기</button><button class="btn" data-act="tr-show">' + ic('text') + '크게</button><button class="btn" data-act="tr-copy">' + ic('copy') + '복사</button><button class="btn" data-act="tr-save">' + ic('star') + '저장</button></div></div>';
    const saved = LS.get('trSaved', []), hist = LS.get('trHist', []);
    if (saved.length) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('star', 'var(--sun)', 1) + '내가 모은 문장</h3></div><div class="tr-list">' + saved.map((x, i) => '<button data-act="tr-pick" data-v="s' + i + '"><b lang="' + x.b + '">' + esc(x.t) + '</b><span>' + esc(x.f) + '</span></button>').join('') + '</div></div>';
    if (hist.length) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('sync', 'var(--sky)', 1) + '최근 번역</h3><button class="linkbtn" data-act="tr-clear">지우기</button></div><div class="tr-list">' + hist.slice(0, 8).map((x, i) => '<button data-act="tr-pick" data-v="h' + i + '"><b lang="' + x.b + '">' + esc(x.t) + '</b><span>' + esc(x.f) + '</span></button>').join('') + '</div></div>';
  } else if (S.mode === 'photo') {
    h += '<div class="tr-photo-grid">' + TR_PHOTO.map(([k, e, n, d]) => '<button data-act="tr-photo" data-v="' + k + '"><i>' + e + '</i><b>' + n + '</b><span>' + d + '</span></button>').join('') + '</div>';
    const P = S.photo;
    if (P && P.busy) h += '<div class="card empty"><div class="art">🔍</div><b>사진 속 글자를 읽고 옮기는 중…</b>10초쯤 걸려요.</div>';
    else if (P && P.res) {
      const r = P.res, al = r.allergens || [];
      h += '<div class="card tr-res">' + (P.thumb ? '<img class="tr-thumb" src="' + P.thumb + '" alt="">' : '') +
        (al.length ? '<div class="tr-al">⚠️ 알레르기 재료가 보여요: <b>' + al.map(esc).join(' · ') + '</b></div>' : '') +
        (r.summary ? '<p class="tr-sum">' + esc(r.summary) + '</p>' : '') +
        ((r.lines || []).length ? (r.lines || []).map(x => '<div class="tr-line"><div class="o" lang="' + L[0] + '">' + esc(x.orig) + (x.price && !String(x.orig).includes(x.price) ? ' <span class="pill">' + esc(x.price) + '</span>' : '') + '</div><div class="k">' + esc(x.ko) + '</div>' +
          (x.note ? '<div class="n">💡 ' + esc(x.note) + '</div>' : '') + ((x.allergens || []).length ? '<div class="a">⚠️ ' + x.allergens.map(esc).join(' · ') + '</div>' : '') + ((x.maybe || []).length ? '<div class="a soft">보통 들어가요: ' + x.maybe.map(esc).join(' · ') + '</div>' : '') + '</div>').join('') : '<p class="muted">' + esc(r.note || '글자를 찾지 못했어요') + '</p>') +
        '<div class="muted small" style="margin-top:8px">' + (r.via === 'gemini' ? 'AI가 읽고 설명했어요.' : '구글이 글자를 읽고 옮겼어요. 알레르기는 글자로 찾은 것이라 꼭 직원에게도 물어보세요.') + '</div></div>' +
        '<div class="card"><b>직원에게 물어볼 때</b><div class="tr-list" style="margin-top:8px">' + [['이 음식에 새우나 땅콩이 들어 있나요?', 'この料理にえびやピーナッツは入っていますか？'], ['이것은 어떤 음식인가요?', 'これはどんな料理ですか？'], ['맵지 않게 해 주세요', '辛くしないでください'], ['이걸로 주세요', 'これをください']].map(([k, j]) => '<button data-act="tr-sayq" data-v="' + esc(j) + '"><b lang="ja">' + esc(j) + '</b><span>' + esc(k) + ' · 🔊</span></button>').join('') + '</div></div>';
    } else h += '<div class="muted small" style="margin:6px 2px">찍을 것을 고르면 사진기가 열려요. 글자가 크고 반듯하게 나오게 찍어 주세요.</div>';
  } else {
    const F = S.face || (S.face = {});
    h += '<div class="tr-face"><div class="them"><div class="tr-big" lang="' + L[0] + '">' + esc(F.toThem || 'こんにちは！ 韓国から来ました。') + '</div><button class="btn" data-act="tr-face-mic" data-v="them">' + ic('mic') + L[1] + 'で話す</button></div>' +
      '<div class="me"><div class="tr-big">' + esc(F.toMe || '상대방이 말하면 여기에 한국어로 떠요') + '</div><div class="tr-btns"><button class="btn pri" data-act="tr-face-mic" data-v="me">' + ic('mic') + '한국어로 말하기</button><button class="btn" data-act="tr-face-type">' + ic('pen') + '글로</button></div></div></div>' +
      '<div class="muted small" style="margin:8px 2px">휴대폰을 탁자에 두면 위쪽 반은 상대방이 읽기 좋게 뒤집혀 보여요.</div>';
  }
  h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('link', 'var(--soft)', 1) + '다른 번역 앱으로</h3></div><div class="tr-ext">' +
    '<a class="btn" href="https://translate.google.com/?sl=' + L[0] + '&tl=ko&op=images" target="_blank" rel="noopener">구글 번역 (카메라)</a>' +
    '<a class="btn" href="https://papago.naver.com/?sk=' + (L[0] === 'zh-TW' ? 'zh-TW' : L[0].slice(0, 2)) + '&tk=ko" target="_blank" rel="noopener">파파고</a></div></div>';
  return h;
}
async function trPhoto(t, mode) {
  const S = trState(), L = trLang(t);
  pickPhoto('translate', async f => {
    try {
      S.photo = { busy: true }; render();
      const full = await shrink(f, 1600, .85), thumb = await shrink(f, 360, .6);
      const res = await call('photoTranslate', full.split(',')[1], 'image/jpeg', mode, L[0], 'ko');
      S.photo = { res, thumb, mode }; render();
    } catch (e) { S.photo = null; render(); toast(e.code === 'offline' ? '인터넷이 끊겨 사진을 옮기지 못했어요' : '사진을 옮기지 못했어요: ' + e.message); }
  });
}

/* ---------- 사진으로 여행 정리 — 사진·영수증·일정표를 올리면 날짜·곳·일정·경비·이야기로 (AI 열쇠가 있으면 AI가, 없으면 날짜·위치로) ---------- */
async function exifOf(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer(), v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    let o = 2;
    while (o + 10 < v.byteLength) {
      const m = v.getUint16(o), len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiffOf(v, o + 10);
      if ((m & 0xFF00) !== 0xFF00 || m === 0xFFDA) break;
      o += 2 + len;
    }
  } catch (e) { /* 못 읽으면 빈 값 */ }
  return {};
}
function tiffOf(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const ifd = o => { const r = {}; if (o + 2 > v.byteLength) return r; const n = u16(o); for (let k = 0; k < n && o + 14 + k * 12 <= v.byteLength; k++) { const e = o + 2 + k * 12; r[u16(e)] = { cnt: u32(e + 4), at: e + 8 }; } return r; };
  const str = en => { const off = en.cnt > 4 ? t + u32(en.at) : en.at; let x = ''; for (let k = 0; k < en.cnt - 1 && off + k < v.byteLength; k++) x += String.fromCharCode(v.getUint8(off + k)); return x; };
  const rat = (en, k) => { const off = t + u32(en.at) + k * 8; const d = u32(off + 4); return d ? u32(off) / d : 0; };
  const out = {}, i0 = ifd(t + u32(t + 4));
  let dt = i0[0x0132] ? str(i0[0x0132]) : '';
  if (i0[0x8769]) { const ex = ifd(t + u32(i0[0x8769].at)); if (ex[0x9003]) dt = str(ex[0x9003]); }
  const m = dt.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/);
  if (m && m[1] > '1990') { out.date = m[1] + '-' + m[2] + '-' + m[3]; out.time = m[4] + ':' + m[5]; }
  if (i0[0x8825]) {
    const g = ifd(t + u32(i0[0x8825].at));
    if (g[2] && g[4]) {
      const dms = en => rat(en, 0) + rat(en, 1) / 60 + rat(en, 2) / 3600;
      let la = dms(g[2]), lo = dms(g[4]);
      if (g[1] && String.fromCharCode(v.getUint8(g[1].at)) === 'S') la = -la;
      if (g[3] && String.fromCharCode(v.getUint8(g[3].at)) === 'W') lo = -lo;
      if (la || lo) { out.lat = +la.toFixed(5); out.lng = +lo.toFixed(5); }
    }
  }
  return out;
}
const SEASON = m => ['겨울', '겨울', '봄', '봄', '봄', '여름', '여름', '여름', '가을', '가을', '가을', '겨울'][m - 1];
const RATE_GUESS = { KRW: 100, JPY: 900, TWD: 4400, USD: 140000, EUR: 155000, GBP: 180000, CHF: 160000, CZK: 6200, VND: 5.5, THB: 4000, CNY: 19500, HKD: 18000, SGD: 105000, PHP: 2400, AUD: 92000 };
function pickMany(onPicked) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,application/pdf';
  inp.onchange = () => { const fs = [...(inp.files || [])].filter(f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || '')); if (fs.length) onPicked(fs); else toast('사진 파일을 골라 주세요'); };
  inp.click();
}
let SCAN = null;
async function scanFlow(t) {
  const st = await call('aiState').catch(() => ({ on: '' }));
  openSheet('<h2>' + (t ? '사진으로 이 여행 채우기' : '다녀온 여행 사진으로 정리') + '</h2>' +
    '<p class="muted">여행 사진·영수증·티켓·일정표 캡처를 한꺼번에 골라 주세요(60장까지). ' + (st.on ? (st.on === 'claude' ? '클로드' : '제미나이') + ' AI가 한 장씩 보고 날짜·곳·일정·경비·이야기를 정리해요.' : '사진에 담긴 날짜와 위치로 일정을 묶어요. 설정 → AI 도우미에서 열쇠를 넣으면 영수증·일정표까지 읽고 이야기도 써 줘요.') + ' 저장하기 전에 모두 확인할 수 있어요.</p>' +
    '<label class="fl"><span>한 줄 귀띔 (안 써도 돼요)</span><input class="in" id="scanhint" placeholder="예: 하은이 졸업 기념 제주 여행, 렌터카로 다님"></label>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="scango">' + ic('camera') + '사진 고르기</button></div>', el => {
    el.querySelector('#scango').onclick = () => { const hint = el.querySelector('#scanhint').value.trim(); pickMany(fs => scanRun(t, fs.slice(0, 60), hint, st.on)); };
  });
}
async function scanRun(t, files, hint, ai) {
  const say = m => { const e = $('#scanmsg'); if (e) e.textContent = m; };
  openSheet('<h2>정리하는 중</h2><div class="scan-wait"><div class="spin"></div><p id="scanmsg">사진 ' + files.length + '장을 읽는 중…</p></div><p class="muted small">사진이 많으면 1~2분 걸려요. 이 창을 닫지 말아 주세요.</p>');
  try {
    const imgs = [];
    for (let k = 0; k < files.length; k++) {
      say('사진 읽는 중 ' + (k + 1) + '/' + files.length);
      const f = files[k], ex = await exifOf(f);
      if (!ex.date && f.lastModified) { const d = new Date(f.lastModified); ex.date = ymd(d); ex.time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); ex.guess = 1; }
      const thumb = await shrink(f, 480, .72), ai1 = ai ? await shrink(f, 1024, .72) : '';
      imgs.push(Object.assign({ i: k, file: f, thumb, b64: ai1 ? ai1.split(',')[1] : '' }, ex));
    }
    const res = [];
    const step = ai ? 6 : 30;
    for (let k = 0; k < imgs.length; k += step) {
      say((ai ? 'AI가 사진을 살펴보는 중 ' : '찍은 곳 찾는 중 ') + Math.min(k + step, imgs.length) + '/' + imgs.length);
      const part = imgs.slice(k, k + step).map(m => ({ i: m.i, b64: m.b64, mime: 'image/jpeg', date: m.date || '', time: m.time || '', lat: m.lat, lng: m.lng }));
      const r = await call('tripScan', part, { hint });
      (r.images || []).forEach(x => res.push(x));
    }
    imgs.forEach(m => { if (!res.some(x => x.i === m.i)) res.push({ i: m.i, kind: 'photo', date: m.date || '', time: m.time || '', score: 2, caption: '' }); });
    res.forEach(x => { const m = imgs[x.i]; if (m) { if (!x.date && m.date) x.date = m.date; if (!x.time && m.time) x.time = m.time; } });
    const members = t ? t.members : D.meta.family.map(f => f.name);
    let draft = null;
    if (ai) {
      say('여행 기록을 정리하는 중…');
      try { draft = await call('tripCompose', { images: res.map(x => Object.assign({}, x)), members, hint, trip: t ? { title: t.title, start: t.start, end: t.end, place: t.place } : null }); }
      catch (e) { toast('AI 정리가 안 돼서 날짜·곳으로 묶었어요: ' + e.message); }
    }
    if (!draft || !draft.items) draft = localCompose(res, t);
    if (t) Object.assign(draft, { title: t.title, place: t.place, start: t.start, end: t.end, country: t.country, cur: t.cur });
    SCAN = { t, imgs, res, draft, members: members.slice(), pick: new Set((draft.photos || []).map(p => p.i).filter(i => imgs[i])), hint };
    if (!SCAN.pick.size) res.filter(x => x.kind === 'photo').sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).forEach(x => SCAN.pick.add(x.i));
    scanReview();
  } catch (e) { closeSheet(); toast(e.code === 'offline' ? '인터넷이 끊겨 정리하지 못했어요' : '정리하지 못했어요: ' + e.message); }
}
function localCompose(res, t) {
  const ph = res.filter(x => x.date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const cnt = a => { const c = {}; a.filter(Boolean).forEach(x => c[x] = (c[x] || 0) + 1); return Object.keys(c).sort((x, y) => c[y] - c[x]); };
  const cc = cnt(ph.map(x => x.country))[0] || 'KR', short = r => String(r || '').replace(/특별자치도|특별자치시|특별시|광역시|도$/, '');
  const cities = cnt(ph.map(x => cc === 'KR' && x.region ? short(x.region) : x.city));
  const items = [], groups = [];
  ph.forEach(x => { const key = x.date + '|' + (x.place || x.area || x.city || ''); const g = groups[groups.length - 1]; if (g && g.key === key) g.n.push(x); else groups.push({ key, n: [x] }); });
  groups.forEach(g => { const x = g.n[0], where = [x.city, x.area].filter(Boolean).join(' '); items.push({ date: x.date, time: x.time || '', title: x.place || (where ? where + ' 둘러보기' : '사진 ' + g.n.length + '장'), cat: x.kind === 'receipt' ? '식사' : '관광', place: x.place ? x.place + (x.city ? ' ' + x.city : '') : where, memo: '사진 ' + g.n.length + '장' }); });
  const start = ph.length ? ph[0].date : ymd(new Date()), end = ph.length ? ph[ph.length - 1].date : start, mo = +start.slice(5, 7);
  const c = COUNTRY[cc] || {}, place = (cc !== 'KR' && c.n ? c.n + ' ' : '') + cities.slice(0, 2).join(' · ');
  const days = [...new Set(ph.map(x => x.date))], best = [];
  days.forEach(d => { const top = res.filter(x => x.date === d && x.kind === 'photo').sort((a, b) => (b.score || 0) - (a.score || 0))[0]; if (top && best.length < 3) best.push({ i: top.i, caption: top.caption || top.place || top.city || '' }); });
  return {
    via: 'local', title: start.slice(0, 4) + ' ' + SEASON(mo) + ' ' + (cities[0] || c.n || '') + ' 가족여행', place: place || c.n || '', country: cc, cur: c.cur || 'KRW', start, end, story: '',
    items, spends: res.filter(x => x.kind === 'receipt' && x.receipt && x.receipt.total).map(x => ({ date: x.receipt.date || x.date, title: x.receipt.merchant || '영수증', amount: x.receipt.total, cur: x.receipt.cur || c.cur || 'KRW', cat: x.receipt.cat || '기타' })),
    bookings: [], places: [...new Set(ph.map(x => x.place).filter(Boolean))].map(n => ({ name: n, cat: '명소', memo: '' })), photos: best
  };
}
function scanReview() {
  const S = SCAN, d = S.draft, chk = (k, i, on) => '<input type="checkbox" class="scan-ck" data-k="' + k + '" data-i="' + i + '"' + (on === false ? '' : ' checked') + '>';
  S.on = S.on || {};
  const fam = D.meta.family.map(f => f.name);
  const list = (k, arr, row) => arr.length ? '<div class="scan-sec"><b>' + { items: '일정', places: '가 본 곳', spends: '경비', bookings: '예약·티켓' }[k] + ' <span class="muted">' + arr.length + '</span></b>' + arr.map((x, i) => '<label class="scan-row">' + chk(k, i) + '<span>' + row(x) + '</span></label>').join('') + '</div>' : '';
  const via = { claude: '클로드 AI가 정리했어요', gemini: '제미나이 AI가 정리했어요', local: 'AI 없이 사진 날짜·위치로 묶었어요 (설정 → AI 도우미에서 열쇠를 넣으면 영수증·일정표도 읽어요)' }[d.via] || '';
  openSheet('<h2>' + (S.t ? '이 여행에 더할 것' : '이렇게 정리했어요') + '</h2><p class="muted small">' + esc(via) + ' · 고칠 곳은 고치고, 빼고 싶은 건 체크를 풀어 주세요.</p>' +
    '<div class="scan-ph">' + S.imgs.map(m => '<button class="' + (S.pick.has(m.i) ? 'on' : '') + '" data-pi="' + m.i + '" title="' + esc(((S.res.find(x => x.i === m.i) || {}).caption) || '') + '"><img src="' + m.thumb + '" alt=""></button>').join('') + '</div><div class="muted small">대표 사진 ' + S.pick.size + '장 — 눌러서 고르거나 풀어요 (4장까지)</div>' +
    (S.t ? '' : '<label class="fl"><span>여행 이름</span><input class="in" id="sc-title" value="' + esc(d.title || '') + '"></label><label class="fl"><span>어디</span><input class="in" id="sc-place" value="' + esc(d.place || '') + '"></label>' +
      '<div class="grid2"><label class="fl"><span>시작</span><input class="in" type="date" id="sc-start" value="' + esc(d.start || '') + '"></label><label class="fl"><span>끝</span><input class="in" type="date" id="sc-end" value="' + esc(d.end || '') + '"></label></div>' +
      '<div class="fl"><span>함께 간 사람</span><div class="chips">' + fam.map(n => '<label class="chipbtn scan-mem ' + (S.members.includes(n) ? 'on' : '') + '"><input type="checkbox" hidden data-mem="' + esc(n) + '"' + (S.members.includes(n) ? ' checked' : '') + '>' + esc(n) + '</label>').join('') + '</div></div>') +
    '<label class="fl"><span>그때 이야기</span><textarea class="in" id="sc-story" rows="3" placeholder="가족이 나중에 읽을 짧은 이야기">' + esc(d.story || '') + '</textarea></label>' +
    list('items', d.items || [], x => '<b class="num">' + esc(x.date ? md(x.date) : '') + (x.time ? ' ' + esc(x.time) : '') + '</b> ' + esc(x.title) + (x.place ? ' <small class="muted">' + esc(x.place) + '</small>' : '')) +
    list('places', d.places || [], x => esc(x.name) + ' <small class="muted">' + esc(x.cat || '') + (x.memo ? ' · ' + esc(x.memo) : '') + '</small>') +
    list('spends', d.spends || [], x => esc(x.title) + ' <b class="num">' + comma(x.amount || 0) + ' ' + esc(x.cur || '') + '</b> <small class="muted">' + esc(x.date ? md(x.date) : '') + '</small>') +
    list('bookings', d.bookings || [], x => esc(x.title) + ' <small class="muted">' + esc(x.kind || '') + (x.date ? ' · ' + esc(md(x.date)) : '') + '</small>') +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">그만두기</button><button class="btn pri" id="sc-save">' + ic('check') + '저장</button></div>', el => {
    el.querySelectorAll('[data-pi]').forEach(b => b.onclick = () => { const i = +b.dataset.pi; if (S.pick.has(i)) S.pick.delete(i); else { if (S.pick.size >= 4) return toast('대표 사진은 4장까지예요'); S.pick.add(i); } b.classList.toggle('on', S.pick.has(i)); el.querySelector('.scan-ph + .muted').textContent = '대표 사진 ' + S.pick.size + '장 — 눌러서 고르거나 풀어요 (4장까지)'; });
    el.querySelectorAll('.scan-mem input').forEach(c => c.onchange = () => c.parentElement.classList.toggle('on', c.checked));
    el.querySelector('#sc-save').onclick = () => scanSave(el);
  });
}
async function coverOf(thumbUrl) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = thumbUrl; });
  const W = 640, H = 360, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  cv.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return cv.toDataURL('image/webp', .6);
}
async function scanSave(el) {
  const S = SCAN, d = S.draft, keep = k => (d[k] || []).filter((x, i) => { const c = el.querySelector('.scan-ck[data-k="' + k + '"][data-i="' + i + '"]'); return !c || c.checked; });
  let t = S.t;
  const story = el.querySelector('#sc-story').value.trim();
  if (!t) {
    const members = [...el.querySelectorAll('[data-mem]')].filter(c => c.checked).map(c => c.dataset.mem);
    const start = el.querySelector('#sc-start').value, end = el.querySelector('#sc-end').value || start, title = el.querySelector('#sc-title').value.trim();
    if (!title) return toast('여행 이름을 적어 주세요');
    if (!start || end < start) return toast('날짜를 확인해 주세요');
    if (members.length < 1) return toast('함께 간 사람을 골라 주세요');
    const cc = COUNTRY[d.country] ? d.country : (d.country || 'KR'), cur = d.cur || (COUNTRY[cc] || {}).cur || 'KRW';
    const best = [...S.pick][0] != null ? S.imgs[[...S.pick][0]] : null;
    t = put('trips', { id: uid('t'), title, place: el.querySelector('#sc-place').value.trim(), start, end, members, country: cc, cur, rate: (LS.get('fx.' + cur, {}) || {}).rate || RATE_GUESS[cur] || 100,
      kind: members.length === 2 && members.every(m => COUPLE.includes(m)) ? 'couple' : '', story, memo: '사진 ' + S.imgs.length + '장으로 정리 (' + ({ claude: '클로드', gemini: '제미나이', local: '날짜·위치' }[d.via] || '') + ')', cover: best ? await coverOf(best.thumb) : '' }, true);
  } else if (story && !t.story) put('trips', Object.assign({}, t, { story }), true);
  const past = t.end < today();
  keep('items').forEach(x => put('items', { id: uid('i'), trip: t.id, date: x.date || t.start, time: x.time || '', title: x.title, cat: CATS.includes(x.cat) ? x.cat : '관광', place: x.place || '', memo: x.memo || '', cost: 0, done: past || (x.date || '') <= today() }, true));
  keep('places').forEach(x => put('places', { id: uid('p'), trip: t.id, name: x.name, cat: PCATS.includes(x.cat) ? x.cat : '명소', memo: x.memo || '', rating: 0, map: x.name }, true));
  keep('spends').forEach(x => put('spends', { id: uid('s'), trip: t.id, date: x.date || t.start, title: x.title, amount: +x.amount || 0, cur: x.cur || t.cur || 'KRW', cat: SPEND_CATS.includes(x.cat) ? x.cat : guessCat(x.title || ''), payer: '', pay: '', share: '함께' }, true));
  keep('bookings').forEach(x => put('bookings', { id: uid('b'), trip: t.id, kind: x.kind || '기타', title: x.title, date: x.date || '', time: x.time || '', provider: x.provider || '', code: x.code || '', price: +x.price || 0, cur: x.cur || t.cur || 'KRW', place: x.place || '' }, true));
  const caps = {}; (d.photos || []).forEach(p => caps[p.i] = p.caption);
  for (const i of S.pick) {
    const m = S.imgs[i], r = S.res.find(x => x.i === i) || {}, cap = caps[i] || r.caption || r.place || '여행 사진';
    const note = put('notes', { id: uid('n'), trip: t.id, date: r.date || m.date || t.start, text: '📷 ' + cap, owner: '', mood: '', thumb: m.thumb }, true);
    shrink(m.file, 1600, .82).then(full => call('photo', full.split(',')[1], 'image/jpeg', t.title + ' ' + cap, '사진')).then(u => { const cur = D.notes[note.id]; if (cur && u && u.url) put('notes', Object.assign({}, cur, { photoUrl: u.url }), true); }).catch(() => {});
  }
  SCAN = null; closeSheet(); toast(S.t ? '이 여행에 더했어요' : '여행을 만들었어요');
  if (S.t) render(); else go(tripUrl(t.id));
}

/* 일정 하나 보기 — 누르면 고치기 대신 정보·지도·길찾기 */
const cityOf = t => String(t.place || '').split(/[·,\/]/)[0].replace(/^(일본|대만|베트남|태국|중국|미국|영국|프랑스|이탈리아|스페인|독일|호주|싱가포르|필리핀|홍콩|스위스|체코)\s*/, '').trim();
const gq = (t, i) => i.addr || (i.place || i.title || '') + (i.place ? '' : ' ' + cityOf(t));
const dirTo = (dest, mode, origin) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + (origin ? '&origin=' + encodeURIComponent(origin) : '') + '&travelmode=' + mode;
/** 일정 종류마다 쓸 일본어(guide.js PHRASES에서 — 받아 둔 음성이 있는 문장) */
function ivPhrases(i) {
  const G = (window.GUIDE && GUIDE.PHRASES && GUIDE.PHRASES.JP && GUIDE.PHRASES.JP.groups) || [], g = n => (G.find(x => x[0] === n) || [, []])[1], pick = (n, ks) => g(n).filter(p => ks.some(k => p[2].includes(k)));
  const t = (i.title || '') + ' ' + (i.cat || '');
  if (/식사|간식/.test(i.cat || '') || /점심|저녁|라멘|스시|초밥|우동|쿠시카쓰|우설/.test(t)) return pick('식당', ['4명', '이거 주세요', '추천', '한국어 메뉴', '계산']);
  if (/쇼핑/.test(i.cat || '') || /돈키호테|시장|상점가/.test(t)) return pick('쇼핑', ['얼마', '카드', '면세', '봉투']);
  if (i.go && i.go.t === 'taxi') return pick('길·교통', ['여기까지']);
  if (/이동/.test(i.cat || '')) return pick('길·교통', ['어디예요', '화장실', '역', '출구']).slice(0, 4);
  if (/관광/.test(i.cat || '')) return pick('길·교통', ['화장실']).concat(pick('인사', ['실례', '감사']));
  return [];
}
function itemView(t, i) {
  if (!i) return;
  const [icn, col] = itemIcon(i);
  const day = live('items', t.id).filter(x => x.date === i.date).sort(byTime);
  const k = day.findIndex(x => x.id === i.id), prev = k > 0 ? day.slice(0, k).reverse().find(x => x.place || x.title) : null, next = day[k + 1];
  const fromIt = k > 0 ? day.slice(0, k).reverse().find(x => x.place) : null;
  const q = gq(t, i), from = fromIt ? fromIt.place : '';
  const words = String(i.title + ' ' + (i.place || '')).toLowerCase();
  const rel = live('recs', t.id).filter(r => { const n = String(r.name || '').split(/[\s(·]/)[0].toLowerCase(); return n.length > 1 && words.includes(n); }).slice(0, 3);
  const bk = live('bookings', t.id).filter(b => b.date === i.date && (words.includes(String(b.provider || '').toLowerCase()) || (b.kind === '항공' && /출발|도착|항공|공항/.test(i.title)) || (b.kind === '주차' && /주차|입차|출차/.test(i.title)) || (b.kind === '숙소' && /숙소|체크인|체크아웃/.test(i.title))));
  const c = countryOf(t), n = (t.members || []).length || 1;
  let h = '<div class="iv-head" style="--cc:' + col + '">' + itPic(icn, col) + '<div><div class="iv-when num">' + esc(i.date ? md(i.date) : '날짜 미정') + (i.time ? ' · ' + esc(i.time) : '') + ' · <span class="tag">' + esc(i.cat || '기타') + '</span></div><h2>' + esc(i.title) + '</h2>' + (i.done ? '<span class="pill" style="--cc:var(--ok)">✓ 다녀옴</span>' : '') + '</div></div>';
  const hol = c && c.n === '일본' && /-12-3[01]$|-01-0[1-3]$/.test(i.date || '') && !/이동|숙소/.test(i.cat || '') && i.zone !== 'USJ'; // USJ 안은 파크 영업시간을 따로 확인해 둠(구글 지도 영업시간 안내 필요 없음)
  if (hol) h += '<div class="iv-hol">🎍 ' + (/-12-31$/.test(i.date) ? '그믐날' : /-12-30$/.test(i.date) ? '연말' : '설 연휴') + '이라 여는 시간이 평소와 달라요. 가기 전에 구글 지도의 「영업시간」을 꼭 확인해요.</div>';
  h += '<div class="iv-rows">' +
    (i.place ? '<div><span>' + ic('pin') + '장소</span><b>' + esc(i.place) + '</b></div>' : '') +
    (i.addr ? '<div><span>' + ic('home') + '주소</span><b>' + esc(i.addr) + ' <button class="linkbtn" data-act="copy-text" data-v="' + esc(i.addr) + '">복사</button></b></div>' : '') +
    (i.cost ? '<div><span>' + ic('wallet') + '비용</span><b class="num">1인 ' + comma(i.cost) + unit(t.cur) + (n > 1 ? ' · ' + n + '명 ' + comma(i.cost * n) + unit(t.cur) : '') + (t.cur && t.cur !== 'KRW' ? ' <small>(약 ' + manWon(toWon(t, i.cost * n)) + ')</small>' : '') + '</b></div>' : '') +
    (i.memo ? '<div><span>' + ic('pen') + '메모</span><b>' + esc(i.memo) + '</b></div>' : '') +
    (i.tip ? '<div class="tip"><span>' + ic('bulb') + '여행 팁</span><b>' + esc(i.tip) + '</b></div>' : '') +
    (prev ? '<div><span>' + ic('route') + '앞 일정</span><b>' + esc((prev.time ? prev.time + ' ' : '') + prev.title) + '</b></div>' : '') +
    (next ? '<div><span>' + ic('route') + '다음 일정</span><b>' + esc((next.time ? next.time + ' ' : '') + next.title) + '</b></div>' : '') + '</div>';
  if (i.tk && D.bookings[i.tk.b] && tkList(D.bookings[i.tk.b]).some(q => tkLabel(D.bookings[i.tk.b], q) === i.tk.label)) { const tb = D.bookings[i.tk.b], col = tkColor(tb, i.tk.label);
    h += '<div class="iv-tk" style="--wc:' + col + '"><span class="wl-ic">' + tkIcon(tb, i.tk.label) + '</span><span><b>' + esc(i.tk.label) + '</b><small>이 일정에서 쓰는 티켓</small></span><button class="btn pri" data-act="tk-gate" data-v="' + esc(tb.id) + '" data-label="' + esc(i.tk.label) + '">' + (tkAll() ? '가족 모두' : '내 티켓') + '</button><button class="btn' + (tkAll() ? '' : ' hide') + '" data-act="tk-me" data-v="' + esc(ME) + '">' + esc(ME) + ' 티켓</button></div>'; }
  h += goHtml(i);
  if (q.trim()) {
    h += '<div class="iv-map"><iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="지도" src="https://www.google.com/maps?q=' + encodeURIComponent(q) + '&hl=ko&z=15&output=embed"></iframe></div>';
    const kr = isKR(t, i), fromR = fromIt && fromIt.lat != null ? { lat: fromIt.lat, lng: fromIt.lng, name: fromIt.place } : null, nq = i.place || i.title || q;
    const gBtns = '<a class="btn" href="' + esc(dirTo(q, 'walking', from)) + '" target="_blank" rel="noopener">' + eb('🚶', '#DFF5E6') + '걸어서</a>' +
      '<a class="btn" href="' + esc(dirTo(q, 'driving', from)) + '" target="_blank" rel="noopener">' + eb('🚕', '#FFF1C7') + '차·택시</a>';
    const near = '<a class="btn" href="' + esc(mapUrl('맛집 near ' + q)) + '" target="_blank" rel="noopener">' + eb('🍜', '#FFE6D9') + '주변 맛집</a>' +
      '<a class="btn" href="' + esc(mapUrl('편의점 near ' + q)) + '" target="_blank" rel="noopener">' + eb('🏪', '#E3EEFF') + '주변 편의점</a>' +
      '<a class="btn" href="' + esc(mapUrl('관광 명소 near ' + q)) + '" target="_blank" rel="noopener">' + eb('🎡', '#F1E6FF') + '주변 볼거리</a>';
    if (kr) h += '<div class="iv-go">' + (i.lat != null ?
      nvA(nvRoute(nq, i.lat, i.lng, 'public', fromR), 'btn pri nv', '<span class="nvlogo">N</span>네이버 길찾기' + (fromR ? ' (앞 일정에서)' : '')) +
      nvA(nvPlace(nq, i.lat, i.lng), 'btn nv-o', '<span class="nvlogo">N</span>네이버 지도') +
      nvA(nvRoute(nq, i.lat, i.lng, 'walk', fromR), 'btn nv-o', '<span class="nvlogo">N</span>걸어서') +
      nvA(nvRoute(nq, i.lat, i.lng, 'car', fromR), 'btn nv-o', '<span class="nvlogo">N</span>차') :
      nvA(nvPlace(nq), 'btn pri nv', '<span class="nvlogo">N</span>네이버 지도에서 찾기 · 길찾기')) +
      '<a class="btn" href="' + esc(dirTo(q, 'transit', from)) + '" target="_blank" rel="noopener">' + eb('🚇', '#E6F0FF') + '구글 길찾기</a>' +
      '<a class="btn" href="' + esc(mapUrl(q)) + '" target="_blank" rel="noopener">' + eb('🗺️', '#E6F0FF') + '구글 지도</a>' + near + '</div>' +
      '<div class="muted small">' + (i.lat == null ? '지도 위치가 아직 없어 네이버 지도에서 「' + esc(nq) + '」을(를) 찾아요. 찾은 곳에서 「도착」을 누르면 길찾기가 돼요. ' : '') + '길찾기는 ' + (fromR ? '앞 일정 「' + esc(fromIt.title) + '」에서 출발해요. ' : '지금 있는 곳에서 출발해요. ') + (MOBD ? '네이버 지도 앱이 열려요.' : '네이버 지도 누리집이 열려요.') + '</div>';
    else h += '<div class="iv-go">' +
      '<a class="btn pri" href="' + esc(dirTo(q, 'transit', from)) + '" target="_blank" rel="noopener">' + ic('train') + '대중교통 길찾기' + (fromIt ? ' (앞 일정에서)' : '') + '</a>' +
      '<a class="btn" href="' + esc(mapUrl(q)) + '" target="_blank" rel="noopener">' + eb('🗺️', '#E6F0FF') + '구글 지도</a>' +
      nvA(nvPlace(nq + (i.place ? '' : ' ' + cityOf(t)), i.lat, i.lng), 'btn nv-o', '<span class="nvlogo">N</span>네이버 지도(한국어)') + gBtns + near + '</div>' +
      '<div class="muted small">길찾기는 ' + (fromIt ? '앞 일정 「' + esc(fromIt.title) + '」에서 출발해요. ' : '지금 있는 곳에서 출발해요. ') + '구글 지도 앱이 열려요. 네이버 지도는 이 나라 지도를 한국어로 보여 줘요(네이버 길찾기는 국내만 돼요).</div>';
  }
  if (rel.length) h += '<div class="iv-sec"><b>' + ic('star') + '함께 알아 둘 곳</b>' + rel.map(r => '<div class="iv-rec"><b>' + esc(r.name) + '</b>' + (r.area ? ' <span class="muted">' + esc(r.area) + '</span>' : '') + '<div>' + esc(r.desc || '') + '</div>' + (r.hours ? '<div class="muted small">🕘 ' + esc(r.hours) + '</div>' : '') + (r.price ? '<div class="muted small">💴 ' + esc(r.price) + '</div>' : '') + '</div>').join('') + '</div>';
  if (bk.length) h += '<div class="iv-sec"><b>' + ic('ticket') + '이 일정의 예약</b>' + bk.map(b => '<button class="iv-rec" data-act="booking-edit" data-v="' + esc(b.id) + '"><b>' + esc(b.title) + '</b>' + (b.code ? ' <span class="num muted">' + esc(b.code) + '</span>' : '') + '</button>').join('') + '</div>';
  if (i.zone === 'USJ') { const u = taxiAppUrl('usj'); h += '<div class="iv-sec"><a class="btn ta-btn" href="' + esc(u) + '"' + (/^intent:/.test(u) ? '' : ' target="_blank" rel="noopener"') + '>' + eb('🎢', '#E3EEFF') + '<span><b>USJ 공식 앱 열기</b><small>지금 대기 시간 · 정리권 · 오늘 공연 시간</small></span></a></div>'; }
  // 그 자리에서 쓸 일본어 한마디(누르면 받아 둔 음성 — 인터넷 없이도)
  if (t.country === 'JP') { const P = ivPhrases(i); if (P.length) h += '<div class="iv-sec iv-say"><b>🗣️ 여기서 쓸 일본어 <small class="muted">누르면 소리가 나요</small></b><div class="say-chips">' + P.map(q => '<button class="say-chip" data-act="ph-say" data-v="' + esc(q[0]) + '" data-l="ja-JP"><b>' + esc(q[2]) + '</b><small>' + esc(q[1]) + '</small></button>').join('') + '</div></div>'; }
  // 늦어지거나 바뀌었을 때 그 자리에서(팀장님 2026-11-27 「다른 일정도 늦어지거나 삭제·변경에 대처」)
  if (i.date) h += '<div class="iv-sec iv-change"><b>' + ic('route') + '바뀌었나요?</b><div class="iv-chg">' +
    (i.time ? [-15, 15, 30, 60].map(n => '<button class="btn" data-act="item-shift" data-v="' + esc(i.id) + '" data-n="' + n + '">' + (n > 0 ? '+' : '−') + Math.abs(n) + '분</button>').join('') : '') +
    '<button class="btn" data-act="item-skip" data-v="' + esc(i.id) + '">' + (i.skip ? '↩︎ 다시 넣기' : '⏭ 이번엔 건너뛰기') + '</button></div>' +
    '<div class="muted small">' + (isFixed(i) ? '시간이 정해진 일정이에요(정각·공연·배·비행기) — 「늦어졌어요」로는 안 밀려요. ' : '') + '건너뛴 일정은 지우지 않고 회색으로 남아 동선·예산·「지금 · 다음」에서만 빠져요. 날짜를 옮기거나 지우려면 「고치기」.</div></div>';
  h += '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn" data-act="item-done" data-v="' + esc(i.id) + '">' + ic('check') + (i.done ? '다녀옴 풀기' : '다녀옴') + '</button><button class="btn pri" data-act="item-edit" data-v="' + esc(i.id) + '">' + ic('pen') + '고치기</button></div>';
  openSheet(h);
}

function planTab(t) {
  const items = live('items', t.id);
  const days = daysOf(t);
  items.forEach(i => { if (i.date && !days.includes(i.date)) days.push(i.date); });
  days.sort();
  let sel = UI.day[t.id];
  if (!sel || !days.includes(sel)) sel = (today() >= t.start && today() <= t.end) ? today() : days[0];
  UI.day[t.id] = sel;
  const mode = ['tl', 'table', 'want'].includes(UI.mode) ? UI.mode : 'tl';
  const n0 = (t.members || []).length || 1, wxd = {}; tripWx(t).forEach(x => wxd[x.d] = x);
  let h = '<div class="tabhead th-plan"><div><small>' + esc(t.place) + ' · ' + days.length + '일</small><b>우리 여행 길</b><span>일정 ' + items.length + '개 · 가족 예상 ' + manWon(planCost(t) * n0) + '</span></div><img class="th-art" src="img/route-cover.webp" alt=""></div>' +
    '<div class="seg" style="margin:4px 0 14px"><button class="' + (mode === 'tl' ? 'on' : '') + '" data-act="mode" data-v="tl">하루씩</button><button class="' + (mode === 'table' ? 'on' : '') + '" data-act="mode" data-v="table">스케줄표</button><button class="' + (mode === 'want' ? 'on' : '') + '" data-act="mode" data-v="want">가고 싶은 곳</button></div>';
  if (mode === 'table') return h + schedTable(t, days, items);
  if (mode === 'want') return h + wantView(t);
  h += '<div class="days' + (days.length <= 5 ? ' fit' : '') + '" style="--n:' + days.length + '">' + days.map((d, k) => {
    const di = items.filter(i => i.date === d), all = di.length && di.every(i => i.done);
    return '<button class="day ' + (d === sel ? 'on' : '') + '" data-act="day" data-v="' + d + '"><small>' + (k + 1) + '일째</small><b class="num">' + esc(md(d)) + '</b>' + (wxd[d] && wxd[d].max != null ? '<span class="dwx">' + wxi(wxd[d].code, 22) + wxd[d].max + '°</span>' : '') + (all ? stampHtml('다녀옴', 'mini') : '') + '</button>';
  }).join('') + '</div>';
  let list = items.filter(i => i.date === sel).sort(byTime);
  const sum = list.reduce((s, i) => s + itemCost(i), 0);
  const dayAll = items.filter(i => i.date === sel); if (dayAll.length && dayAll.every(i => i.done)) h += '<div class="daydone">' + stampHtml(md(sel) + ' 다녀옴', 'big') + '<span>이날 일정을 모두 다녀왔어요!</span></div>';
  const kyotoDay = items.some(i => i.date === sel && /교토|후시미|기요미즈|기온|니시키|야사카|Kyoto|Fushimi|Kiyomizu|Gion|Nishiki|Yasaka/i.test((i.title || '') + ' ' + (i.place || '')));
  h += '<div class="sec-h" style="margin-top:6px"><h3 class="ih">' + (items.some(i => i.date === sel && /USJ|유니버설/i.test(i.title || '')) ? '<img class="h-art" src="img/usj-day.webp" alt="">' : kyotoDay ? '<img class="h-art" src="img/kyoto-thumb.webp" alt="">' : /-(12-31|01-01)$/.test(sel) ? '<img class="h-art" src="img/newyear.webp" alt="">' : ib('plan', 'var(--sky)', 1)) + (days.indexOf(sel) + 1) + '일째 · ' + esc(md(sel)) + (kyotoDay ? ' <span class="pill" style="font-size:12px">교토 가는 날</span>' : '') + '</h3><span class="flex" style="gap:10px">' + (sel === today() ? '<button class="linkbtn" data-act="late">⏱ 늦어졌어요</button>' : '') + '<button class="linkbtn" data-act="item-new">＋ 일정 더하기</button></span></div>';
  let past = '';
  if (sel === today() && !UI.showPast) {
    const p = list.filter(i => i.done || (i.time && i.time < hm().slice(0, 5) && list.some(j => j.time > i.time && !j.done)));
    if (p.length > 1) { list = list.filter(i => !p.includes(i)); past = '<button class="past-toggle" data-act="show-past">지난 일정 ' + p.length + '개 보기</button>'; }
  }
  if (list.length) h += sunChip(t, sel);
  const nn = (t.members || []).length || 1, daySum = items.filter(i => i.date === sel).reduce((q, i) => q + itemCost(i), 0);
  h += dayMapHtml(t, sel);
  if (daySum) h += '<div class="daycost num"><span>' + ic('wallet') + '이날 예상</span><b>' + nn + '명 ' + comma(daySum * nn) + unit(t.cur) + '</b>' + (t.cur !== 'KRW' ? '<em>≈ ' + manWon(toWon(t, daySum * nn)) + '</em>' : '') + '<small>1인 ' + comma(daySum) + unit(t.cur) + '</small></div>';
  h += list.length || past ? past + tlList(t, list) + '<div class="muted num" style="text-align:right;margin-top:10px">이날 예상 ' + nn + '명 ' + comma(daySum * nn) + unit(t.cur) + (t.cur !== 'KRW' ? ' (≈ ' + manWon(toWon(t, daySum * nn)) + ')' : '') + ' · 1인 ' + comma(daySum) + unit(t.cur) + '</div>'
    : '<div class="card empty"><div class="art">🗺️</div><b>이날 일정이 비어 있어요</b>「가고 싶은 곳」에서 골라 넣거나 ＋로 더해요.</div>';
  return h;
}
function schedTable(t, days, items) {
  let rows = '', total = 0; const NN = (t.members || []).length || 1;
  [...days, ''].forEach(d => {
    const list = items.filter(i => (i.date || '') === d).sort(byTime);
    if (!list.length) return;
    const sum = list.reduce((s, i) => s + itemCost(i), 0); total += sum;
    rows += '<tr class="dayrow"><td colspan="2">' + (d ? (days.indexOf(d) + 1) + '일째 · ' + esc(md(d)) : '날짜 미정') + (sum ? ' <span class="dr-tot num">· ' + NN + '명 ' + comma(sum * NN) + unit(t.cur) + (t.cur !== 'KRW' ? ' ≈ ' + manWon(toWon(t, sum * NN)) : '') + '</span>' : '') + '</td><td class="r num">' + comma(sum) + '</td></tr>';
    rows += list.map(i => '<tr data-act="item-view" data-v="' + esc(i.id) + '" style="cursor:pointer"><td class="tm num">' + esc(i.time || '') + '</td><td>' + (IT_IMG[itemIcon(i)[0]] ? '<img class="ticon-img" src="img/it-' + IT_IMG[itemIcon(i)[0]] + '.webp" alt="">' : '<span class="ticon" style="--cc:' + itemIcon(i)[1] + '">' + ic(itemIcon(i)[0]) + '</span>') + esc(i.title) +
      (i.place ? '<div class="muted" style="font-size:13px;margin-left:15px">' + esc(i.place) + '</div>' : '') + '</td><td class="r num">' + (i.cost ? comma(i.cost) : '') + '</td></tr>').join('');
  });
  if (!rows) return '<div class="card empty">일정이 아직 없어요</div>';
  const n = (t.members || []).length || 1;
  return '<div class="sched-wrap"><table class="sched"><thead><tr><th>시간</th><th>할 일 · 장소</th><th class="r">1인(' + unit(t.cur) + ')</th></tr></thead><tbody>' + rows +
    '<tr class="dayrow"><td colspan="2">합계 (1인) <span class="dr-tot num">· ' + n + '명 ' + comma(total * n) + unit(t.cur) + '</span></td><td class="r num">' + comma(total) + '</td></tr></tbody></table></div>' +
    '<div class="muted" style="margin-top:10px">가족 ' + n + '명 예상 ' + manWon(toWon(t, total) * n) + ' · 줄을 누르면 고칠 수 있어요</div>';
}
function wantView(t) {
  const all = live('recs', t.id);
  const ideas = live('items', t.id).filter(i => !i.date);
  const kinds = ['전체', ...['명소', '맛집', '쇼핑', '숙소', '팁'].filter(k => all.some(r => r.kind === k))];
  if (!kinds.includes(UI.recK)) UI.recK = '전체';
  const list = all.filter(r => UI.recK === '전체' || r.kind === UI.recK).sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || a.ts - b.ts);
  const inPlan = new Set(live('items', t.id).map(i => i.rec).filter(Boolean));
  let h = '<div class="between" style="margin-bottom:12px"><div class="chips">' + kinds.map(k => '<button class="chipbtn ' + (k === UI.recK ? 'on' : '') + '" data-act="reck" data-v="' + k + '">' + k + '</button>').join('') + '</div></div>';
  h += '<div class="sec-h"><h3>추천·자료 ' + list.length + '</h3><button class="linkbtn" data-act="rec-new">＋ 자료 더하기</button></div>';
  if (ideas.length) h += '<div class="card" style="margin-bottom:12px"><b>날짜 안 정한 일정</b>' + ideas.map(i => '<button class="row" data-act="item-edit" data-v="' + esc(i.id) + '">' + ib('pin', cc(i.cat), 1) + '<span class="body"><span class="t">' + esc(i.title) + '</span></span></button>').join('') + '</div>';
  h += list.length ? '<div class="stack">' + list.map(r => {
    const col = cc(RECC[r.kind] || '기타');
    const fa = foodArt(r);
    return '<div class="rec' + (String(r.desc || '').length > 70 ? ' sfc fold' : '') + '"><div class="top">' + (fa ? '<img class="rec-art" src="img/' + fa + '.webp" alt="">' : ib(RC_IC[r.kind] || 'recs', col)) + '<div style="flex:1;min-width:0"><h4>' + esc(r.name) + '</h4><div class="area">' + esc(r.kind) + (r.area ? ' · ' + esc(r.area) : '') + '</div></div>' +
      (inPlan.has(r.id) ? '<span class="pill hot">일정에 있음</span>' : '') + '</div>' +
      (r.desc ? (String(r.desc).length > 70 ? '<div class="tl-x" data-act="sf-tap"><p>' + esc(r.desc) + '</p></div><div class="tl-hint" data-act="sf-tap">눌러서 자세히 ▾</div>' : '<p>' + esc(r.desc) + '</p>') : '') +
      ((r.price || r.hours) ? '<div class="info">' + (r.price ? '<span>' + esc(r.price) + '</span>' : '') + (r.hours ? '<span>🕘 ' + esc(r.hours) + '</span>' : '') + '</div>' : '') +
      '<div class="acts">' + (r.kind !== '팁' ? '<button class="btn navy" data-act="rec-add" data-v="' + esc(r.id) + '">' + ic('plus') + '일정에 넣기</button><a class="btn" href="' + esc(mapUrl(r.map || r.name)) + '" target="_blank" rel="noopener">' + ic('pin') + '지도</a>' + nvA(nvPlace(r.name + (isKR(t) ? '' : ' ' + cityOf(t))), 'btn nv-o', '<span class="nvlogo">N</span>네이버') : '') +
      (safeUrl(r.link) ? '<a class="btn" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + ic('link') + '누리집</a>' : '') +
      '<button class="btn" data-act="rec-edit" data-v="' + esc(r.id) + '">고치기</button></div></div>';
  }).join('') + '</div>' : '<div class="card empty"><div class="art">⭐</div><b>추천 자료가 없어요</b>가 보고 싶은 명소·맛집을 모아 두세요.</div>';
  h += '<div class="muted" style="margin-top:12px">영업시간·휴무는 출발 전에 꼭 다시 확인하세요. 연말연시에는 쉬는 곳이 많아요.</div>';
  return h;
}

/* ---------- 경비: 예산(현실적으로) · 누가 어떻게 냈나 · 정산 ---------- */
const PAYS = ['카드', '현금', '트래블카드', '계좌이체', '기타'];
const PAY_IC = { 카드: '💳', 현금: '💴', 트래블카드: '🌏', 계좌이체: '🏦', 기타: '🧾' };
function budgetOf(t) {
  const n = (t.members || []).length || 1, days = daysOf(t).length || 1;
  const bk = live('bookings', t.id).filter(b => Number(b.price) > 0);
  const A = bk.reduce((s, b) => s + toWon(t, b.price, b.cur || 'KRW'), 0);
  const B = planCost(t) * n;
  const daily = t.daily != null ? Number(t.daily) : (t.cur === 'KRW' ? 30000 : 3000);
  const C = toWon(t, daily) * n * days;
  const pct = t.reserve != null ? Number(t.reserve) : 10;
  const D = (B + C) * pct / 100;
  return { A, B, C, D, total: A + B + C + D, bk, daily, pct, n, days };
}
/* 정산 — 자녀만 낼 몫을 정하고(팀장님), 나머지는 우리 부부가 모두 냄 · 자녀가 먼저 결제한 것(예: 하늘이 숙소)은 그 자녀 몫에서 빠짐 · 들어온 돈은 자녀가 나중에 부부에게 낸 돈 */
const payinsOf = t => (t.payins || []).filter(p => p && !p.del);
const kidsOf = t => (t.members || []).filter(m => !COUPLE.includes(m));
function duesCalc(t, sp, mem) {
  const kids = mem.filter(m => !COUPLE.includes(m)), par = mem.filter(m => COUPLE.includes(m)), dues = t.dues || {};
  const total = sp.reduce((q, s) => q + toWon(t, s.amount, s.cur), 0);
  const paid = {}; mem.forEach(m => paid[m] = 0); let unknown = 0;
  sp.forEach(s => { const w = toWon(t, s.amount, s.cur); if (s.payer in paid) paid[s.payer] += w; else unknown += w; });
  const got = {}; kids.forEach(m => got[m] = 0); payinsOf(t).forEach(p => { if (p.who in got) got[p.who] += Number(p.amt) || 0; });
  const rows = kids.map(m => { const set = Number(dues[m]) > 0, due = Number(dues[m]) || 0; return { m, set, due, paid: paid[m], got: got[m], left: due - paid[m] - got[m] }; });
  const kidDue = rows.reduce((q, r) => q + r.due, 0), gotAll = rows.reduce((q, r) => q + r.got, 0), parPaid = par.reduce((q, m) => q + paid[m], 0);
  const pr = { names: par, due: Math.max(0, total - kidDue), paid: parPaid, got: gotAll };
  pr.left = pr.due - (pr.paid - pr.got);
  return { total, rows, pr, unknown, kids };
}
function duesCard(t, sp, mem) {
  const D = duesCalc(t, sp, mem), pin = payinsOf(t).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const leftTxt = r => !r.set ? '<span class="muted">몫 미정</span>' : Math.abs(r.left) < 100 ? '<span style="color:var(--ok)">다 냈어요 ✓</span>' : r.left > 0 ? '<span style="color:var(--warn)">더 낼 돈 ' + comma(Math.round(r.left)) + '원</span>' : '<span style="color:var(--ok)">돌려받을 돈 ' + comma(Math.round(-r.left)) + '원</span>';
  let h = '<div class="card dues"><div class="between"><span class="muted">이번 여행에 쓴 돈</span>' + (D.kids.length ? '<button class="linkbtn" data-act="dues-edit">자녀 몫 정하기</button>' : '') + '</div><div class="big-num num">' + manWon(D.total) + '</div>' +
    '<div class="dues-rows">' + D.rows.map(r => '<div class="dues-row">' + av(r.m, 34) + '<div class="dr-b"><div class="between"><b>' + esc(r.m) + '</b><b class="num">' + leftTxt(r) + '</b></div>' +
      '<div class="dr-n num"><span>낼 몫 <b>' + (r.set ? manWon(r.due) : '<button class="linkbtn" data-act="dues-edit">정하기</button>') + '</b></span><span>먼저 결제 <b>' + manWon(r.paid) + '</b></span><span>들어온 돈 <b>' + manWon(r.got) + '</b></span></div></div></div>').join('') +
    (D.pr.names.length ? '<div class="dues-row par"><span class="dr-av">' + D.pr.names.map(n => av(n, 28)).join('') + '</span><div class="dr-b"><div class="between"><b>우리 부부 <span class="pill" style="font-size:11px">나머지 모두</span></b><b class="num">' + manWon(D.pr.due) + '</b></div>' +
      '<div class="dr-n num"><span>결제 <b>' + manWon(D.pr.paid) + '</b></span><span>자녀에게 받은 돈 <b>' + manWon(D.pr.got) + '</b></span>' + (Math.abs(D.pr.left) >= 100 ? '<span>' + (D.pr.left > 0 ? '아직 남은 돈 <b>' : '자녀에게 받을 돈 <b>') + manWon(Math.abs(D.pr.left)) + '</b></span>' : '') + '</div></div></div>' : '') + '</div>' +
    (D.unknown ? '<div class="warnline">낸 사람 미정 ' + manWon(D.unknown) + ' — 위 「누가 냈나」에서 낸 사람을 정해 주세요</div>' : '') +
    '<div class="muted small" style="margin-top:6px">똑같이 나누지 않아요. 자녀가 낼 몫만 정하면, 먼저 결제한 돈(예: 숙소)과 나중에 낸 돈을 빼고 남은 돈이 보여요. 나머지는 모두 우리 부부가 내요.</div></div>';
  if (D.kids.length) h += '<div class="card" style="margin-top:10px"><div class="between"><b>' + ic('wallet') + ' 자녀가 낸 돈</b><button class="btn small" data-act="payin-new">＋ 들어온 돈 적기</button></div>' +
    (pin.length ? pin.map(p => '<button class="row" data-act="payin-edit" data-v="' + esc(p.id) + '">' + av(p.who, 28) + '<span class="body"><div class="t">' + esc(p.who) + ' <span class="num">' + comma(Number(p.amt) || 0) + '원</span></div><div class="m">' + esc((p.date ? md(p.date) + ' · ' : '') + (p.memo || '우리 부부에게')) + '</div></span></button>').join('') : '<div class="muted small" style="margin-top:6px">자녀가 몫을 보내 주면 여기에 적어요.</div>') + '</div>';
  return h;
}
function duesEdit(t) {
  const kids = kidsOf(t), dues = t.dues || {}, rec = {};
  if (!kids.length) return toast('이 여행에는 자녀가 없어요');
  kids.forEach(m => rec['d_' + m] = dues[m] ? dues[m] : '');
  form('자녀가 낼 몫 정하기', kids.map(m => ({ k: 'd_' + m, label: m + ' (원)', type: 'number', ph: '예: 500,000', half: 1 })),
    rec, vals => { const nd = {}; kids.forEach(m => { const v = Number(vals['d_' + m]) || 0; if (v > 0) nd[m] = v; }); put('trips', Object.assign({}, t, { dues: nd, splitMode: 'split' })); closeSheet(); toast('자녀 몫을 정했어요'); }, null);
}
function payinEdit(t, id) {
  const kids = kidsOf(t), list = payinsOf(t), cur = list.find(p => p.id === id);
  if (!kids.length) return toast('이 여행에는 자녀가 없어요');
  const rec = cur ? Object.assign({}, cur) : { who: kids[0], date: today(), amt: '' };
  const save = arr => put('trips', Object.assign({}, t, { payins: arr }));
  form(cur ? '들어온 돈 고치기' : '자녀가 낸 돈 적기', [{ k: 'who', label: '누가 냈나', type: 'opts', options: kids }, { k: 'amt', label: '금액 (원)', type: 'number', huge: 1, ph: '예: 148,299' }, { k: 'date', label: '날짜', type: 'date', half: 1 }, { k: 'memo', label: '메모', ph: '예: 남은 몫', half: 1 }],
    rec, vals => { const v = { id: cur ? cur.id : 'pi' + Date.now().toString(36), who: vals.who, amt: Number(vals.amt) || 0, date: vals.date || today(), memo: vals.memo || '', ts: Date.now(), by: ME || '' }; if (!v.amt) return toast('금액을 넣어 주세요'); save(list.filter(p => p.id !== v.id).concat([v])); closeSheet(); toast('들어온 돈을 적었어요'); },
    cur ? () => { save(list.filter(p => p.id !== cur.id)); closeSheet(); toast('지웠어요'); } : null);
}
/* 경비 맨 위 — 예산 · 쓴 돈 · 남은 예산을 크게 나눠 보여 줌(팀장님 2026-11-26 「쓴 돈과 남은 예산이 총액에 비해 너무 작아」)
   쓴 돈 = 여행 전 미리 낸 돈(출발일 앞 날짜) + 여행 중 쓴 돈 · 막대는 예산을 세 칸(미리 낸 돈·여행 중·남음)으로 */
function budgetBoard(t, bg, sp, spent) {
  const paidBk = live('bookings', t.id).map(b => Number(b.price) || 0).filter(Boolean);
  const isPre = s => (s.date || '') < t.start || s.cat === '준비' || paidBk.includes(Number(s.amount)); // 출발 전 날짜 · 보험·여권 · 예약 값과 같은 결제(예: USJ 티켓을 이용일로 적은 것)
  const pre = sp.filter(isPre).reduce((q, s) => q + toWon(t, s.amount, s.cur), 0), during = spent - pre;
  const total = bg.total || 1, left = bg.total - spent, over = left < 0;
  const w = x => Math.max(0, Math.min(100, x / Math.max(total, spent) * 100)).toFixed(1) + '%';
  const pct = Math.round(spent / total * 100);
  const big = x => { const m = String(manWon(x)).match(/^([\d.,]+)\s*(.*)$/); return m ? m[1] + '<em>' + esc(m[2]) + '</em>' : esc(manWon(x)); };
  return '<div class="bud3">' +
    '<div class="b3-t"><small>예산 · 예상 총액</small><b class="num">' + big(bg.total) + '</b><span>가족 ' + bg.n + '명 · 1인 ' + manWon(bg.total / bg.n) + '</span></div>' +
    '<div class="b3-s"><small>쓴 돈</small><b class="num">' + big(spent) + '</b><span>' + pct + '% 썼어요</span></div>' +
    '<div class="b3-l' + (over ? ' over' : '') + '"><small>' + (over ? '예산 넘음' : '남은 예산') + '</small><b class="num">' + big(Math.abs(left)) + '</b><span>' + (over ? '예산을 고쳐 주세요' : '1인 ' + manWon(left / bg.n)) + '</span></div></div>' +
    '<div class="bud-bar" role="img" aria-label="예산 ' + manWon(bg.total) + ' 가운데 미리 낸 돈 ' + manWon(pre) + ', 여행 중 쓴 돈 ' + manWon(during) + ', 남은 예산 ' + manWon(Math.max(0, left)) + '"><i class="pre" style="width:' + w(pre) + '"></i><i class="dur" style="width:' + w(during) + '"></i></div>' +
    '<div class="bud-key"><span><i class="pre"></i>미리 낸 돈 <b class="num">' + manWon(pre) + '</b></span><span><i class="dur"></i>여행 중 <b class="num">' + manWon(during) + '</b></span><span><i class="left"></i>남음 <b class="num">' + manWon(Math.max(0, left)) + '</b></span></div>';
}
function moneyTab(t) {
  const mem = t.members || [];
  const split = t.splitMode !== 'one'; // 기본은 「자녀 몫」 정산 (팀장님 2026-11-26)
  const bg = budgetOf(t);
  const sp = live('spends', t.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
  const spent = spentWon(t), shared = sp.filter(s => s.share !== '개인');
  const pctUsed = bg.total ? Math.min(100, Math.round(spent / bg.total * 100)) : 0;
  let h = '<div class="tabhead th-money"><div><small>' + esc(t.title) + '</small><b>여행 경비</b><span>영수증을 찍으면 금액이 저절로 적혀요</span></div><img class="th-art wide" src="img/wallet-cover.webp" alt=""></div>' +
    '<div class="flex" style="margin:0 0 12px;gap:8px"><button class="btn pri big" style="flex:1" data-act="photo" data-v="receipt">' + ic('camera') + '영수증 찍기</button><button class="btn big" style="flex:1" data-act="spend-new">' + ic('pen') + '직접 적기</button></div>' +
    budgetBoard(t, bg, sp, spent) +
    '<div class="card budget receipt"><div class="between"><b>예산은 이렇게 셈해요</b><button class="linkbtn" data-act="budget-edit">예산 고치기</button></div><div class="muted small">가족 ' + bg.n + '명 · ' + bg.days + '일 · 1인 ' + manWon(bg.total / bg.n) + ' · 일정을 바꾸면 저절로 다시 계산돼요</div>' +
    '<div class="brows">' +
    '<div><span>' + ib('ticket', 'var(--c-관광)', 1) + '예약·결제한 것<small>' + (bg.bk.length ? esc(bg.bk.map(b => b.kind).join('·')) : '예약 금액을 넣으면 더해져요') + '</small></span><b class="num">' + manWon(bg.A) + '</b></div>' +
    '<div><span>' + ib('plan', 'var(--c-이동)', 1) + '일정 비용<small>일정 ' + live('items', t.id).filter(i => itemCost(i)).length + '개의 1인 비용(차비 포함) × ' + bg.n + '명</small></span><b class="num">' + manWon(bg.B) + '</b></div>' +
    '<div><span>' + ib('bag', 'var(--c-쇼핑)', 1) + '간식·쇼핑 여유<small>1인 하루 ' + comma(bg.daily) + unit(t.cur) + ' × ' + bg.n + '명 × ' + bg.days + '일</small></span><b class="num">' + manWon(bg.C) + '</b></div>' +
    '<div><span>' + ib('sos', 'var(--c-기타)', 1) + '예비비<small>일정·여유의 ' + bg.pct + '%</small></span><b class="num">' + manWon(bg.D) + '</b></div></div></div>';
  // 누가 냈나
  const paid = {}; mem.forEach(m => paid[m] = 0); let unknown = 0;
  sp.forEach(s => { const w = toWon(t, s.amount, s.cur); if (s.payer && s.payer in paid) paid[s.payer] += w; else unknown += w; });
  // 부부(임요한·장보정)는 함께 내니 한 줄로 묶음(팀장님 2026-11-26)
  const cp = mem.filter(m => COUPLE.includes(m));
  const groups = (cp.length > 1 ? [{ key: 'couple', name: '부부', sub: cp.join(' · '), amt: cp.reduce((q, m) => q + paid[m], 0), avs: cp.map(m => av(m, 30)).join(''), col: 'var(--coral)' }] : [])
    .concat(mem.filter(m => cp.length < 2 || !COUPLE.includes(m)).map(m => ({ key: m, name: m, sub: '', amt: paid[m], avs: av(m, 34), col: AVC[famIdx(m) % AVC.length] })));
  const maxP = Math.max(1, ...groups.map(g => g.amt), unknown);
  h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('users', 'var(--sky)', 1) + '누가 냈나</h3><span class="muted small">합계 ' + manWon(spent) + '</span></div><div class="card">' +
    groups.map(g => '<div class="payrow' + (g.key === 'couple' ? ' couple' : '') + '"><span class="pr-avs">' + g.avs + '</span><div class="pr-body"><div class="between"><b>' + esc(g.name) + (g.sub ? ' <small class="muted">' + esc(g.sub) + '</small>' : '') + '</b><b class="num">' + manWon(g.amt) + '</b></div><div class="bar" style="--cc:' + g.col + '"><i style="width:' + Math.round(g.amt / maxP * 100) + '%"></i></div></div></div>').join('') +
    (unknown ? '<button class="payrow" style="width:100%;text-align:left" data-act="filter-unknown"><span class="av" style="background:var(--faint)">?</span><div class="pr-body"><div class="between"><b>낸 사람 미정</b><b class="num">' + manWon(unknown) + '</b></div><div class="muted small">눌러서 낸 사람을 정해 주세요</div></div></button>' : '') + '</div>';
  // 결제 수단
  const byPay = {}; sp.forEach(s => { const k = s.pay || '정하지 않음'; byPay[k] = (byPay[k] || 0) + toWon(t, s.amount, s.cur); });
  if (sp.length) h += '<div class="paychips">' + Object.entries(byPay).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<span class="pill">' + (PAY_IC[k] || '•') + ' ' + esc(k) + ' <b class="num">' + manWon(v) + '</b></span>').join('') + '</div>';
  h += '</div>';
  // 정산 — 1/n이 아니라 「각자 낼 몫」: 몫은 팀장님이 정하고, 지갑 주인(기본 임요한)의 몫은 나머지 · 들어온 돈(자녀가 나중에 낸 돈)은 따로 적음
  h += '<div class="sec"><img class="settle-art" src="img/settle-family.webp" alt=""><div class="sec-h"><h3 class="ih">' + ib('money', 'var(--mint)', 1) + '정산</h3></div><div class="seg" style="margin-bottom:10px"><button class="' + (!split ? 'on' : '') + '" data-act="split" data-v="one">한 지갑 (정산 안 함)</button><button class="' + (split ? 'on' : '') + '" data-act="split" data-v="split">자녀 몫 정산</button></div>';
  if (!split) h += '<div class="card muted">가족 공동 지갑으로 써요. 위 「누가 냈나」에서 누가 결제했는지만 봐요. 자녀가 낼 몫을 정하려면 「자녀 몫 정산」을 눌러요.</div>';
  else h += duesCard(t, shared, mem); // 개인 지출은 정산에서 빼요(프로그램 전문가)
  h += '</div>';
  // 갈래별
  const cats = {}; sp.forEach(s => cats[s.cat || '기타'] = (cats[s.cat || '기타'] || 0) + toWon(t, s.amount, s.cur));
  const max = Math.max(1, ...Object.values(cats)), ce = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (ce.length) h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('bag', 'var(--c-쇼핑)', 1) + '무엇에 썼나</h3></div><div class="card">' + ce.map(([c, v]) => '<div class="cat-row" style="--cc:' + cc(c) + '"><span class="flex" style="gap:8px;font-weight:700"><span class="dot"></span>' + esc((SPEND_NAME[c] || c).replace(/^\S+ (?=\S)/, '')) + '</span><div class="bar"><i style="width:' + Math.round(v / max * 100) + '%"></i></div><span class="num" style="font-weight:800">' + manWon(v) + '</span></div>').join('') + '</div></div>';
  // 기록
  const f = UI.spendFilter;
  const list = f === 'unknown' ? sp.filter(s => !s.payer || !mem.includes(s.payer)) : sp;
  h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + ib('receipt', 'var(--coral)', 1) + '쓴 돈 기록 ' + list.length + '</h3>' + (f ? '<button class="linkbtn" data-act="filter-clear">모두 보기</button>' : '') + '</div><div class="card">' +
    (list.length ? list.map(s => '<button class="row" data-act="spend-edit" data-v="' + esc(s.id) + '">' + (safeImg(s.thumb) ? '<img class="th" src="' + s.thumb + '" alt="">' : ib(SPEND_IC[s.cat] || 'receipt', cc(s.cat), 1)) +
      '<span class="body"><div class="t">' + esc(s.title) + '</div><div class="m">' + esc(md(s.date)) + ' · ' + (s.payer ? esc(s.payer) : '<span style="color:var(--warn)">낸 사람 미정</span>') + (s.pay ? ' · ' + (PAY_IC[s.pay] || '') + esc(s.pay) : '') + (s.share === '개인' ? ' · 개인' : '') + '</div></span>' +
      '<span class="amt num">' + comma(s.amount) + unit(s.cur || t.cur) + ((s.cur || t.cur) !== 'KRW' ? '<small>≈ ' + manWon(toWon(t, s.amount, s.cur)) + '</small>' : '') + '</span></button>').join('')
      : '<div class="empty">' + art('empty-receipt') + '<b>아직 쓴 돈이 없어요</b>영수증을 찍으면 금액이 저절로 적혀요.</div>') + '</div></div>';
  if (t.cur !== 'KRW') {
    const fx = (INFO[t.id] || {}).fx;
    h += '<div class="muted" style="margin-top:12px">계산 환율: 100' + unit(t.cur) + ' = ' + comma(t.rate) + '원' + (fx ? ' · 오늘 ' + comma(fx.rate) + '원' : '') + '</div>';
    if (fx && Math.abs(fx.rate - t.rate) / fx.rate > .02) h += '<button class="btn" style="margin-top:8px" data-act="use-fx">오늘 환율 ' + comma(fx.rate) + '원으로 계산하기</button>';
  }
  return h;
}
function budgetEdit(t) {
  const bg = budgetOf(t);
  form('예산 고치기', [
    { k: 'daily', label: '간식·쇼핑 여유 (1인 하루, ' + unit(t.cur) + ')', type: 'number', ph: t.cur === 'KRW' ? '예: 30,000' : '예: 3,000' },
    { k: 'reserve', label: '예비비 (%)', type: 'number', ph: '예: 10' }],
    { daily: bg.daily, reserve: bg.pct }, vals => { put('trips', Object.assign({}, t, { daily: vals.daily, reserve: vals.reserve })); closeSheet(); toast('예산을 고쳤어요'); }, null);
}
/** 추천 자료의 값("1인 약 1,500~2,500엔")에서 1인 비용 짐작 */
function priceGuess(s) {
  const n = String(s || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!n) return 0;
  const v = n.slice(0, 2).map(Number);
  return Math.round((v.length === 2 ? (v[0] + v[1]) / 2 : v[0]) / 10) * 10;
}

function memoryTab(t) {
  const k = UI.memK;
  let h = '<div class="tabhead th-memory"><div><small>' + esc(t.title) + '</small><b>우리 가족 추억</b><span>일기 ' + live('notes', t.id).length + ' · 가 본 곳 ' + (live('places', t.id).length + planPlaces(t.id).length) + '</span></div><img class="th-art" src="img/diary-cover.webp" alt=""></div>' +
    '<div class="seg" style="margin:4px 0 14px"><button class="' + (k === 'note' ? 'on' : '') + '" data-act="memk" data-v="note">일기</button><button class="' + (k === 'place' ? 'on' : '') + '" data-act="memk" data-v="place">가 본 곳</button><button class="' + (k === 'photo' ? 'on' : '') + '" data-act="memk" data-v="photo">사진</button></div>';
  if (k === 'note') {
    const all = live('notes', t.id);
    const who = UI.diaryWho == null ? '' : UI.diaryWho;
    const mem = t.members || [];
    const nt = all.filter(n => (n.owner || '') === who).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
    h += '<div class="chips diary-who"><button class="chipbtn ' + (who === '' ? 'on' : '') + '" data-act="diary-who" data-v="">👨‍👩‍👧‍👦 우리 가족 ' + all.filter(n => !n.owner).length + '</button>' +
      mem.map(m => '<button class="chipbtn ' + (who === m ? 'on' : '') + '" data-act="diary-who" data-v="' + esc(m) + '">' + av(m, 22) + ' ' + esc(((fam(m) || {}).role) || m) + ' ' + all.filter(n => n.owner === m).length + '</button>').join('') + '</div>';
    const mine = who === ME, shared = who === '';
    h += '<div class="diary-head" style="--pc:' + (shared ? 'var(--coral)' : AVC[famIdx(who) % AVC.length]) + '"><div><b>' + (shared ? '우리 가족 함께 쓰는 일기' : esc(who) + '의 여행 다이어리') + '</b><span>' + (shared ? '누구나 쓰고 고칠 수 있어요' : mine ? '나만의 다이어리 · 가족이 읽을 수 있어요' : '읽기만 할 수 있어요 · ' + esc(who) + ' 님만 고쳐요') + '</span></div>' +
      (shared || mine ? '<button class="btn pri" data-act="note-new">' + ic('pen') + '쓰기</button>' : '') + '</div>';
    h += nt.length ? '<div class="stack">' + nt.map(n => '<button class="note" style="--pc:' + AVC[famIdx(n.by) % AVC.length] + '" data-act="note-edit" data-v="' + esc(n.id) + '"><div class="h">' + av(n.by, 28) + esc(n.by || '') + ' · ' + esc(md(n.date)) + (n.mood ? ' · ' + moodImg(n.mood, 22) : '') + (n.q ? '<span class="q">Q. ' + esc(n.q) + '</span>' : '') + '</div><p>' + esc(n.text) + '</p>' + (safeImg(n.thumb) ? '<img src="' + n.thumb + '" alt="">' : '') + '</button>').join('') + '</div>'
      : '<div class="card empty">' + art('empty-diary') + '<b>' + (shared || mine ? '오늘 어땠나요?' : '아직 쓴 일기가 없어요') + '</b>' + (shared || mine ? '한 줄이라도 남기면 나중에 가족 여행 책이 돼요.' : '') + '</div>';
  } else if (k === 'place') {
    const all = visitedOf(t.id), c = pcatOk(all, UI.pcatT || '전체'), list = all.filter(e => c === '전체' || e.cat === c);
    h += '<button class="scan-add" data-act="trip-scan-add">' + ic('camera') + '사진·영수증으로 이 여행 채우기</button>';
    if (all.length) h += mapHtml(t.id);
    h += '<div class="sec-h"><h3>가 본 곳</h3><button class="linkbtn" data-act="place-new">＋ 평가하기</button></div>';
    if (!all.length) h += '<div class="card empty">' + art('notebook') + '<b>가 본 곳을 평가해요</b>일정에서 「다녀옴」을 누른 곳도 여기에 저절로 모여요.</div>';
    else {
      if (all.length > 3) h += pcatChips(all, c, 'pcat-t');
      h += '<div class="card">' + list.map(vRow).join('') + '</div>';
      if (list.some(e => e.i)) h += '<div class="muted small" style="margin:6px 2px">「☆ 별점 남기기」는 일정에서 「다녀옴」을 누른 곳이에요. 누르면 별점과 한마디를 남길 수 있어요.</div>';
    }
  } else {
    const ph = [];
    [['spends', '영수증', 'spend-edit'], ['bookings', '예약', 'booking-edit'], ['parks', '주차', 'park-edit'], ['notes', '일기', 'note-edit'], ['places', '가 본 곳', 'place-edit']].forEach(([c, lb, act]) =>
      live(c, t.id).forEach(r => { if (safeImg(r.thumb)) ph.push({ r, lb, act }); }));
    ph.sort((a, b) => b.r.ts - a.r.ts);
    h += ph.length ? '<div class="photos">' + ph.map(x => '<button data-act="' + x.act + '" data-v="' + esc(x.r.id) + '"><img src="' + x.r.thumb + '" alt=""><small>' + x.lb + '</small></button>').join('') + '</div><div class="muted" style="margin-top:10px">원본은 4gospel 드라이브 「하하가족여행/사진」에 있어요.</div>'
      : '<div class="card empty">' + art('empty-photo') + '<b>사진이 아직 없어요</b>영수증·티켓·주차·일기 사진이 여기 모여요.</div>';
  }
  return h;
}

/* 따로 보는 쪽 */
/* ---------- 지갑 — 사람마다 표 모음 (애플 지갑처럼) 2026-11-26 ----------
   예약 칸 b.qr = [{who, label, file(드라이브 파일 id), code}] — 한 예약에 사람마다 여러 장(1일 입장권·닌텐도 입장권·푸드 바우처·탑승권 …)
   b.tkNeed = ['1일 입장권', …] 이 예약에 있어야 할 표(없으면 빈 칸으로 보임). 일정 칸 i.tk = {b, label} → 일정 보기에서 그 표를 바로 엶.
   사진은 데이터 파일에 넣지 않고 이 휴대폰 IndexedDB 「haha-tk」에 받아 둠 → 인터넷이 없어도 앱만 열면 보임. 앱을 열 때마다 저절로 받음(tkSync). */
const TKDB = (() => { let p; return () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('haha-tk', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); }; })); })();
async function tkGet(id) { try { const db = await TKDB(); return await new Promise(res => { const q = db.transaction('img').objectStore('img').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function tkPut(id, v) { try { const db = await TKDB(); await new Promise((res, rej) => { const tx = db.transaction('img', 'readwrite'); tx.objectStore('img').put(v, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); TK_HAVE.add(id); return true; } catch (e) { return false; } }
const tkNm = n => String(n || '');
/** 지갑은 개인용 — 임요한만 가족 모두의 표를 봄(팀장님 2026-11-26), 다른 사람은 자기 표만 */
const TK_ADMIN = '임요한';
const tkAll = () => ME === TK_ADMIN;
const TK_HAVE = new Set(), TK_CHECKED = new Set();
const tkWarnFull = () => { if (!tkWarnFull.done) { tkWarnFull.done = true; toast('휴대폰 저장 공간이 모자라 티켓 사진을 다 못 담았어요. 사진 몇 장을 지우고 다시 열어 주세요'); } };
const tkReady = q => !!(q && (q.data || TK_HAVE.has(q.file))); // 코드 값이 있거나 원본이 이 휴대폰에 있으면 인터넷 없이 열림
let TK_BUSY = false;
const tkList = b => (b && !b.del && Array.isArray(b.qr) ? b.qr.filter(q => q && q.file) : []);
const tkLocal = id => String(id).startsWith('local-');
const tkLabel = (b, q) => q.label || (b.kind === '항공' ? '탑승권' : '입장권');
const TK_SUGGEST = { 티켓: ['1일 입장권', '닌텐도 입장권', '푸드 바우처', '입장권', '익스프레스 패스'], 항공: ['탑승권'], 교통: ['승차권', '패스'], 기타: ['바우처'] };
/** 표 색 — 이름으로 (애플 지갑처럼 표마다 색이 달라 한눈에) */
/* 표 그림(배경) — 팀장님이 만들어 주시면 img/tk-<모양>.webp 로 넣고 여기에 이름을 더함 */
const TK_ART = ['flight', 'ship', 'rail', 'park', 'tower', 'food', 'show', 'etc']; // 팀장님이 만든 그림 2026-11-26
const tkColor = (b, lb, tp) => /닌텐도|nintendo/i.test(lb) ? '#D7262E' : /익스프레스|express/i.test(lb) ? '#6A3FC2' : TK_TPL[tp || tkType(b, { label: lb })].col;
const tkIcon = (b, lb, tp) => /닌텐도/.test(lb) ? '🍄' : /익스프레스/.test(lb) ? '⚡' : TK_TPL[tp || tkType(b, { label: lb })].ic;
/* 표 모양(틀) — 상황마다 미리 만든 표: 칸 이름표 · 색 · 그림. q.type이 없으면 표 이름·예약 종류로 짐작(tkType) */
const TK_TPL = {
  flight: { n: '탑승권', ic: '✈️', col: '#F25C05', route: 1, f: [['from', '출발'], ['to', '도착'], ['no', '편명'], ['board', '탑승 시각'], ['gate', '탑승구'], ['seat', '좌석'], ['cls', '등급']] },
  ship: { n: '승선권', ic: '⛴️', col: '#0E7C9B', route: 1, f: [['from', '출항'], ['to', '도착'], ['no', '배 이름'], ['board', '승선 시각'], ['seat', '좌석·객실'], ['pier', '부두']] },
  rail: { n: '승차권', ic: '🚆', col: '#1F8A5B', route: 1, f: [['from', '출발'], ['to', '도착'], ['no', '열차·버스'], ['board', '출발 시각'], ['car', '호차'], ['seat', '좌석']] },
  park: { n: '입장권', ic: '🎢', col: '#1D4E9E', f: [['pass', '종류'], ['slot', '입장 시간'], ['area', '구역'], ['age', '구분']] },
  tower: { n: '전망대', ic: '🗼', col: '#5B4BC4', f: [['slot', '입장 시간'], ['floor', '층'], ['age', '구분']] },
  food: { n: '식사권', ic: '🍔', col: '#E98A12', f: [['place', '쓰는 곳'], ['menu', '메뉴'], ['slot', '시간'], ['pax', '인원']] },
  show: { n: '공연·전시', ic: '🎭', col: '#B0306A', f: [['hall', '공연장'], ['slot', '시작'], ['gate', '입구'], ['seat', '좌석']] },
  etc: { n: '티켓', ic: '🎟️', col: '#3D4B5C', f: [['slot', '시간'], ['place', '곳']] }
};
function tkType(b, q) {
  if (q && TK_TPL[q.type]) return q.type;
  const s = (q && q.label || '') + ' ' + (b.title || '');
  return /탑승|항공|flight/i.test(s) || b.kind === '항공' ? 'flight' : /승선|페리|ferry|배표|크루즈/i.test(s) ? 'ship' : /승차|기차|열차|JR|신칸센|버스|bus/i.test(s) || b.kind === '교통' ? 'rail'
    : /푸드|식사|식당|레스토랑|food|meal|밀\s*쿠폰/i.test(q && q.label || '') ? 'food' : /전망|스카이|타워|하루카스|tower|sky/i.test(s) ? 'tower' : /공연|전시|뮤지컬|콘서트|미술관|박물관|show/i.test(s) ? 'show'
    : /입장|패스|닌텐도|익스프레스|스튜디오|랜드|월드|park|pass/i.test(s) || b.kind === '티켓' ? 'park' : 'etc';
}
/** 칸 값 — 표마다 적은 값(q.f) 먼저, 없으면 예약에서 */
function tkFields(b, q) {
  const tp = tkType(b, q), f = Object.assign({}, q.f || {});
  if (TK_TPL[tp].route && b.kind === '항공') { const fi = flightInfo(b) || {}; f.from = f.from || fi.from || ''; f.to = f.to || fi.to || ''; f.no = f.no || fi.fn || ''; f.fromN = fi.fromN; f.toN = fi.toN; }
  if (!f.board && TK_TPL[tp].route && b.time) f.board = b.time;
  return f;
}
/* 라이브러리 — 앱 안 lib/ (인터넷 없이도 열리게 sw.js가 같이 보관) */
const TK_LIB = {};
const tkLib = n => TK_LIB[n] || (TK_LIB[n] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/' + n + '.js'; s.onload = res; s.onerror = () => { TK_LIB[n] = null; rej(new Error('lib')); }; document.head.appendChild(s); }));
/** 사진에서 QR·바코드 찾기 → {data:{f,t}, box:[x,y,w,h](0~1)} */
async function tkDecode(src) {
  try { await tkLib('zxing.min'); } catch (e) { return null; }
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }).catch(() => null); if (!img) return null;
  for (const maxW of [2400, 1600, 1100, 800]) {
    const k = Math.min(1, maxW / img.naturalWidth), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, lum = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    for (const Bin of [ZXing.HybridBinarizer, ZXing.GlobalHistogramBinarizer]) {
      try {
        const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const r = new ZXing.MultiFormatReader(); r.setHints(hints);
        const res = r.decode(new ZXing.BinaryBitmap(new Bin(new ZXing.RGBLuminanceSource(lum, w, h))));
        const f = ZXing.BarcodeFormat[res.getBarcodeFormat()], pts = res.getResultPoints().map(p => [p.getX() / w, p.getY() / h]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (/QR|AZTEC|DATA_MATRIX|MAXICODE/.test(f)) { const px_ = (x1 - x0) * .24, py_ = (y1 - y0) * .24; x0 -= px_; x1 += px_; y0 -= py_; y1 += py_; }
        else { const bw = x1 - x0; x0 -= bw * .08; x1 += bw * .08; const cy = (y0 + y1) / 2, bh = Math.max(bw * w * .3 / h, .02); y0 = cy - bh / 2; y1 = cy + bh / 2; }
        const cl = v => Math.max(0, Math.min(1, v));
        return { data: { f, t: res.getText() }, box: [cl(x0), cl(y0), cl(x1) - cl(x0), cl(y1) - cl(y0)].map(v => Math.round(v * 1e4) / 1e4) };
      } catch (e) {}
    }
  }
  return null;
}
const JSB = { CODE_128: 'CODE128', EAN_13: 'EAN13', EAN_8: 'EAN8', CODE_39: 'CODE39', ITF: 'ITF', UPC_A: 'UPC', UPC_E: 'UPCE', CODABAR: 'codabar' };
/** 표 안 코드 — 읽은 값이 있으면 또렷하게 다시 그림, 아니면 원본에서 그 자리만 잘라 크게 */
async function tkCodeHtml(q, src) {
  const d = q.data;
  if (d && d.t && /QR_CODE/.test(d.f)) { try { await tkLib('qrcode'); const qr = qrcode(0, 'M'); qr.addData(d.t); qr.make(); return '<div class="tkc qr">' + qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true }) + '</div>'; } catch (e) {} }
  if (d && d.t && JSB[d.f]) { try { await tkLib('jsbarcode.min'); const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); JsBarcode(el, d.t, { format: JSB[d.f], displayValue: false, margin: 14, height: 110, width: 3 }); el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('preserveAspectRatio', 'none'); return '<div class="tkc bar">' + el.outerHTML + '</div>'; } catch (e) {} }
  if (src && q.box) { try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [x, y, w, h] = q.box, W = img.naturalWidth, H = img.naturalHeight, sw = w * W, sh = h * H, k = Math.max(1, Math.ceil(900 / Math.max(sw, sh)));
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k); const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, x * W, y * H, sw, sh, 0, 0, cv.width, cv.height);
    return '<div class="tkc ' + (sw > sh * 1.6 ? 'bar' : 'qr') + ' crop"><img src="' + cv.toDataURL('image/png') + '" alt="코드"></div>'; } catch (e) {} }
  return src ? '<div class="tkc orig"><img src="' + src + '" alt="원본 티켓"><small>코드를 못 찾아 원본을 보여 줘요 · 누르면 크게</small></div>' : '<div class="tkc none"><b>이 휴대폰에 아직 없어요</b><span>인터넷이 되는 곳에서 앱을 한 번 열면 저절로 저장돼요. 지금은 다른 가족 휴대폰이나 종이 티켓을 보여 주세요.</span></div>';
}
/** 표 모양 그리기 — 위(색 칸: 무슨 표·어디·누구) · 찢는 선 · 아래(흰 칸: 코드) */
function tkPassHtml(e, codeHtml, mini) {
  const b = e.b, q = e.q || {}, tp = tkType(b, q), T = TK_TPL[tp], f = tkFields(b, q), col = tkColor(b, e.lb, tp);
  const fam_ = fam(q.who) || {}, rows = T.f.filter(([k]) => !(T.route && (k === 'from' || k === 'to')) && f[k]);
  const head = T.route && (f.from || f.to)
    ? '<div class="tp-route"><div><b>' + esc(f.from || '—') + '</b><small>' + esc(f.fromN || '') + '</small></div><span class="tp-path">' + T.ic + '</span><div><b>' + esc(f.to || '—') + '</b><small>' + esc(f.toN || '') + '</small></div></div>'
    : '<div class="tp-name"><b>' + esc(f.place && tp !== 'food' ? f.place : (b.place || '').replace(/\s*\(.*$/, '').length > 1 && (b.place || '').replace(/\s*\(.*$/, '').length < 28 ? b.place.replace(/\s*\(.*$/, '') : String(b.title || '').replace(/\s*\(\d+명\)\s*$/, '')) + '</b></div>';
  const art = TK_ART.includes(tp) ? ';--art:url(img/tk-' + tp + '.webp)' : '';
  return '<div class="tpass t-' + tp + (art ? ' art' : '') + (mini ? ' mini' : '') + '" style="--wc:' + col + art + '">' +
    '<div class="tp-top"><div class="tp-row1"><span class="tp-ic">' + tkIcon(b, e.lb, tp) + '</span><span class="tp-lb"><b>' + esc(e.lb) + '</b><small>' + esc(b.provider || T.n) + '</small></span><span class="tp-date"><b class="num">' + esc(b.date ? md(b.date) : '') + '</b><small class="num">' + esc(f.slot || f.board || tkWhen(D.trips[b.trip] || { id: b.trip }, b, e.lb) || '') + '</small></span></div>' +
    head + '<div class="tp-fields"><div><small>이름</small><b>' + esc(q.who || '') + (fam_.role ? ' <i>' + esc(fam_.role) + '</i>' : '') + '</b></div>' + rows.map(([k, n]) => '<div><small>' + esc(n) + '</small><b>' + esc(f[k]) + '</b></div>').join('') + '</div></div>' +
    (f.warn ? '<div class="tp-warn">⚠️ ' + esc(f.warn) + '</div>' : '') +
    '<div class="tp-tear"></div><div class="tp-bot">' + (codeHtml || '') + (q.code ? '<div class="tp-code num">' + esc(q.code) + '</div>' : '') + '</div></div>';
}
/** 이 휴대폰에만 있는 티켓(local-)을 드라이브에 올리고 이름을 바꿈 — 실패하면 다음에 다시 */
let TK_UP = false;
async function tkUploadLocal() {
  if (TK_UP || !PASS || navigator.onLine === false || !D || !D.bookings) return; TK_UP = true;
  try {
    for (const b of Object.values(D.bookings)) for (const q of tkList(b)) {
      if (!tkLocal(q.file)) continue;
      const src = await tkGet(q.file); if (!src) continue;
      try {
        const r = await call('photo', String(src).split(',')[1], 'image/jpeg', tkLabel(b, q) + ' ' + q.who, '입장권');
        if (!r || !r.id) continue; await tkPut(r.id, src);
        const b2 = D.bookings[b.id]; put('bookings', Object.assign({}, b2, { qr: tkList(b2).map(x => x.file === q.file ? Object.assign({}, x, { file: r.id }) : x) }), true);
      } catch (e) { break; }
    }
  } finally { TK_UP = false; }
}
const tkImgOk = s => /^data:image\/(jpeg|png|webp|heic|heif);base64,/.test(String(s || '')); // 그림만(보안 전문가)
async function tkSync() {
  if (TK_BUSY || !D || !D.bookings) return; TK_BUSY = true;
  const before = TK_HAVE.size + TK_CHECKED.size;
  try {
    for (const b of Object.values(D.bookings)) {
      if (!tkList(b).length || (b.date || '9') < ymd(new Date(Date.now() - 3 * 864e5))) continue; // 지난 표는 받지 않음
      for (const q of tkList(b)) { if (!TK_HAVE.has(q.file) && await tkGet(q.file)) TK_HAVE.add(q.file); } // 첫 바퀴: 휴대폰에 있는지 먼저 다 봄
    }
    for (const b of Object.values(D.bookings)) {
      if (!tkList(b).length || (b.date || '9') < ymd(new Date(Date.now() - 3 * 864e5))) continue;
      for (const q of tkList(b)) {
        if (TK_HAVE.has(q.file)) continue;
        TK_CHECKED.add(q.file);
        if (tkLocal(q.file) || !PASS || navigator.onLine === false) continue;
        try { const r = await call('ticketImg', q.file); const u = r && r.b64 ? 'data:' + (/^image\//.test(r.mime || '') ? r.mime : 'image/jpeg') + ';base64,' + r.b64 : ''; if (tkImgOk(u) && !(await tkPut(q.file, u))) tkWarnFull(); } catch (e) {}
      }
    }
  } finally { TK_BUSY = false; }
  tkUploadLocal();
  if (navigator.onLine !== false && Object.values(D.bookings).some(b => tkList(b).length)) { tkLib('qrcode').catch(() => {}); tkLib('jsbarcode.min').catch(() => {}); }
  if (TK_HAVE.size + TK_CHECKED.size !== before && !TKV && $('#sheet').hidden) { const tab = route().tab; if (tab === 'pass' || tab === 'wallet' || tab === 'today' || tab === 'plan') render(); }
}
setTimeout(tkSync, 1500);
// 휴대폰이 앱 저장 칸을 함부로 지우지 않게(아이폰 7일 규칙 등) — 여행 앱 전문가 검토
setTimeout(() => { try { if (PASS && navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => LS.set('persisted', !!ok)).catch(() => {}); } catch (e) {} }, 3000);
// 「지금·다음」이 낡지 않게 오늘 화면은 1분마다 다시 그림(쓰는 중·창이 열렸을 땐 쉼)
setInterval(() => { try { if (!PASS || !ME || document.hidden || TKV || !$('#sheet').hidden || typing()) return; const r = route(); if (r.view === 'trip' && (r.tab || 'today') === 'today') render(); } catch (e) {} }, 60000);
window.addEventListener('online', () => setTimeout(tkSync, 800));
/** 이 여행의 표 — 사람 한 명(who) 또는 모두. 없어야 할 칸(tkNeed)은 miss로 */
function tkEntries(t, who) {
  const bk = live('bookings', t.id).filter(b => tkList(b).length || (b.tkNeed || []).length).sort((a, b) => ((a.date || '9') + (a.time || '')).localeCompare((b.date || '9') + (b.time || '')));
  const out = [];
  bk.forEach(b => {
    const need = b.tkNeed || [], l = tkList(b).filter(q => !who || q.who === who);
    const ord = lb => { const k = need.indexOf(lb); return k < 0 ? 99 : k; };
    l.slice().sort((x, y) => ord(tkLabel(b, x)) - ord(tkLabel(b, y))).forEach(q => out.push({ b, q, lb: tkLabel(b, q) }));
    if (who) need.forEach(lb => { if (!l.some(q => tkLabel(b, q) === lb)) out.push({ b, miss: lb, lb }); });
  });
  return out;
}
const tkDay = () => ymd(new Date(Date.now() - 4 * 3600e3)); // 티켓의 「오늘」은 새벽 4시까지
const tkPast = e => (e.b.date || '9') < tkDay();
/** 그날 쓰는 표의 시각 — 이 표와 이어진 일정(i.tk)의 시간, 없으면 예약 시간 */
function tkWhen(t, b, lb) { const it = live('items', t.id).find(i => i.tk && i.tk.b === b.id && i.tk.label === lb); return (it && it.time) || b.time || ''; }
function tkStatus(have, n) {
  return have === n ? '<span class="tk-ok">✓ 이 휴대폰에 저장 — 인터넷 없이도 열려요</span>' : '<span class="tk-no">이 휴대폰에 ' + have + '/' + n + '장 — 인터넷이 되면 저절로 받아요</span>';
}
/* 지갑 맨 위 — 사람 고르기 + 표 더미 */
function tkWallet(t, page) {
  const mem = t.members || [], all = tkEntries(t);
  const anyTk = live('bookings', t.id).some(b => tkList(b).length || (b.tkNeed || []).length);
  if (!anyTk) return page ? '<div class="card empty">' + art('empty-receipt') + '<b>지갑이 비어 있어요</b>입장권·탑승권 같은 티켓 화면을 찍어 넣으면 사람마다 지갑에 모여요. 인터넷이 없어도 열려요.</div>' : '';
  const who = tkAll() ? (mem.includes(UI.tkWho) ? UI.tkWho : mem.includes(ME) ? ME : mem[0]) : ME;
  const mine = tkEntries(t, who), used = e => e.b.date === tkDay() && (w => w && tkMin(w) < tkMin(hm()) - 180)(tkWhen(t, e.b, e.lb)), now = mine.filter(e => !tkPast(e) && !used(e)), past = mine.filter(e => tkPast(e) || used(e)); // 오늘 쓴 티켓도 세 시간 지나면 「지난 티켓」으로(아침 비행기 탑승권이 낮에도 맨 위에 있던 것, 2026-11-27)
  const t0 = today();
  const wk = e => (e.b.date || '9') + ' ' + (tkWhen(t, e.b, e.lb) || '99:99');
  now.sort((x, y) => (x.b.date === t0 ? 0 : 1) - (y.b.date === t0 ? 0 : 1) || wk(x).localeCompare(wk(y))); // 쓰는 시각 순(입장권 06:30 → 푸드 09:35 → 닌텐도 16:00) // 오늘 쓸 표가 맨 앞 (애플 지갑처럼)
  const card = (e, k, n) => {
    const col = tkColor(e.b, e.lb), when = tkWhen(t, e.b, e.lb);
    const has = tkReady(e.q);
    const tp = tkType(e.b, e.q || { label: e.lb }), art = !e.miss && TK_ART.includes(tp) ? ';--art:url(img/tk-' + tp + '.webp)' : '';
    return '<button class="wl-card' + (e.miss ? ' miss' : '') + (art ? ' art' : '') + (k === n - 1 ? ' last' : '') + '" style="--wc:' + col + art + '" ' + (e.miss ? 'data-act="tk-add" data-v="' + esc(e.b.id) + '"' : 'data-act="tk-me" data-v="' + esc(who) + '" data-file="' + esc(e.q.file) + '"') + '>' +
      '<div class="wl-h"><span class="wl-ic">' + tkIcon(e.b, e.lb) + '</span><span class="wl-lb"><b>' + esc(e.lb) + '</b><small>' + esc(e.b.provider || e.b.kind || '') + '</small></span><span class="wl-d">' + (e.b.date === t0 ? '<em>오늘</em>' : '') + '<b class="num">' + esc(e.b.date ? md(e.b.date) : '') + '</b><small class="num">' + esc(when) + '</small></span></div>' +
      '<div class="wl-b"><div class="wl-t">' + esc(e.b.title) + '</div><div class="wl-f">' + (e.miss ? '<span>' + (e.b.tkWait ? '⏳ 발급 전 · ' + esc(e.b.tkWait) : '＋ 아직 없어요 · 눌러서 넣기') + '</span>' : '<span>' + esc(tkNm(who)) + (e.q.code ? ' · <span class="num">' + esc(e.q.code) + '</span>' : '') + '</span><span>' + (has ? '✓ 저장됨' : '받는 중') + '</span>') + '</div></div></button>';
  };
  let h = '<div class="sec wl"><div class="sec-h"><h3 class="ih">' + ib('wallet', 'var(--c-관광)', 1) + esc(tkNm(who)) + ' 지갑' + '</h3><span class="muted small">인터넷 없이도 열려요</span></div>' +
    (!tkAll() ? '' : '<div class="wl-who">' + mem.map(m => '<button class="' + (m === who ? 'on' : '') + '" data-act="tk-who" data-v="' + esc(m) + '">' + av(m, 28) + '<span>' + esc(tkNm(m)) + '</span><em class="num">' + all.filter(e => e.q.who === m && !tkPast(e)).length + '</em></button>').join('') + '</div>');
  h += now.length ? '<div class="wl-stack">' + now.map((e, k) => card(e, k, now.length)).join('') + '</div>' : '<div class="card empty">' + esc(tkNm(who)) + '의 티켓이 아직 없어요</div>';
  if (now.some(e => !e.miss)) h += '<button class="btn wl-gate" data-act="tk-me" data-v="' + esc(who) + '">' + tkWhose(who) + ' 차례로 보기</button>';
  if (past.length) h += '<details class="wl-past"><summary>지난 티켓 ' + past.length + '</summary><div class="wl-stack">' + past.map((e, k) => card(e, k, past.length)).join('') + '</div></details>';
  return h + '</div>';
}
/* 예약 카드 아래 — 표 이름마다 「가족 모두」로 보여주기 · 넣기 */
function tkStrip(t, b) {
  const l = tkList(b).filter(q => tkAll() || q.who === ME), need = b.tkNeed || [];
  if (!l.length && !need.length) return b.kind === '숙소' || b.kind === '보험' || b.kind === '주차' ? '' : '<button class="tk-add" data-act="tk-add" data-v="' + esc(b.id) + '">' + ic('plus') + '사람마다 티켓(QR) 넣기</button>';
  const lbs = [...new Set(need.concat(l.map(q => tkLabel(b, q))))], n = tkAll() ? ((D.trips[b.trip] || {}).members || [1, 2, 3, 4]).length : 1;
  return '<div class="tk-strip">' + lbs.map(lb => { const c = l.filter(q => tkLabel(b, q) === lb).length;
    return '<button class="tk-lb" style="--wc:' + tkColor(b, lb) + '" ' + (c ? 'data-act="tk-gate" data-v="' + esc(b.id) + '" data-label="' + esc(lb) + '"' : 'data-act="tk-add" data-v="' + esc(b.id) + '"') + '><span>' + tkIcon(b, lb) + '</span><b>' + esc(lb) + '</b><em class="num">' + (!c && b.tkWait ? '발급 전' : c + '/' + n) + '</em></button>'; }).join('') +
    '<button class="tk-edit" data-act="tk-add" data-v="' + esc(b.id) + '" aria-label="티켓 넣기·고치기">' + ic('pen') + '</button></div>';
}
/* 오늘 화면 — 지금 쓸 티켓 (애플 지갑이 때맞춰 표를 띄우듯) */
/** 비행기 전날 할 일 — 내일 비행기가 있으면(출발 전날은 하루 종일, 귀국 전날은 오후 4시부터) */
function flightEveCard(t, t0) {
  const tm = ymd(new Date(new Date(t0 + 'T12:00:00').getTime() + 864e5)), fl = flights(t).find(b => b.date === tm);
  if (!fl) return '';
  const home = tm === t.end, now = hm();
  if (home && now < '16:00') return '';
  const fi = flightInfo(fl) || {}, bp = (fl.qr || []).length || tkList(fl).length;
  const todo = home ? ['📱 온라인 체크인(열리면) → 탑승권 4장 지갑에', '🧳 짐 싸기 — 면세품·영수증은 따로(내일 세관에 보여 줘요)', '🔋 휴대폰·보조배터리 충전(보조배터리는 기내 가방)', '💴 남은 엔화로 내일 아침거리', (() => { const L3 = live('items', t.id).filter(i => i.date === tm).sort(byTime), co = L3.find(i => /체크아웃/.test(i.title || '')), go = L3.find(i => /^숙소 →/.test(i.title || '')); return '⏰ 내일 ' + [co && co.time + ' 짐 정리', go && go.time + ' 숙소 출발'].filter(Boolean).join(' · ') + ' — 알람 맞추기'; })()]
    : ['📱 온라인 체크인(열리면 보통 출발 하루 전) → 탑승권 4장 지갑에', '🛂 여권 4개 · Visit Japan Web QR 캡처', '🔋 휴대폰·보조배터리 충전 · eSIM 켜는 법 확인', '🚗 주차 예약 문자 · 집 가스·창문', '⏰ 내일 새벽 출발 — 알람 맞추기'];
  return '<div class="sec"><div class="card flight-eve"><b>✈️ 내일 비행기 ' + esc((fi.air || '') + ' ' + (fi.fn || '')) + ' · ' + esc(fl.time || '') + '</b>' + (bp ? '<span class="muted small">탑승권 ' + bp + '장이 지갑에 있어요 ✓</span>' : '') +
    '<ul>' + todo.filter(x => !/undefined/.test(x)).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><button class="btn" data-act="tab" data-v="pass">지갑 열기</button></div></div>';
}
/** 그믐밤 새해 카운트다운 · 1/1 새해 인사(일본어 소리 단추) — 12/31 18시부터, 1/1 정오까지 */
function newYearCard(t0) {
  const now = new Date(), md0 = t0.slice(5);
  if (md0 === '12-31' && now.getHours() >= 18) {
    const ny = new Date((+t0.slice(0, 4) + 1) + '-01-01T00:00:00+09:00'), m = Math.max(0, Math.round((ny - now) / 60000));
    return '<div class="sec"><div class="card ny-card"><b>🎆 새해까지 ' + (m >= 60 ? Math.floor(m / 60) + '시간 ' : '') + (m % 60) + '분</b><span>올해 마지막 밤이에요. 숙소에서 다 함께 새해를 맞아요 — 그믐밤 거리·전철은 아주 붐벼요.</span></div></div>';
  }
  if (md0 === '01-01' && now.getHours() < 12) return '<div class="sec"><div class="card ny-card new"><b>🎍 새해 복 많이 받으세요!</b><button class="say-chip" data-act="ph-say" data-v="あけましておめでとうございます" data-l="ja-JP"><b>あけましておめでとうございます</b><small>아케마시테 오메데토- 고자이마스 · 눌러서 듣기</small></button><span>1/1은 공항 밖 가게가 대부분 쉬어요. 아침은 공항에서.</span></div></div>';
  return '';
}
/** 오늘 챙길 것 · 흩어지면 만날 곳(2026-11-27) — 여행 칸 bring {날짜: {items:[…], meet:'…'}} · 저녁 6시부터는 내일 것도 */
function bringCard(t, t0) {
  const B = t.bring || {}, tm = ymd(new Date(new Date(t0 + 'T12:00:00').getTime() + 864e5)), eve = hm() >= '18:00';
  const W = {}; try { tripWx(t).forEach(x => W[x.d] = x); } catch (e) {}
  const wxChips = d => { const w = W[d]; if (!w || w.max == null || !w.real) return ''; let c = ''; // 예보가 나왔을 때만(출발 16일 전부터)
    if (w.rainP >= 50 || [61, 63, 65, 80, 81, 82, 71, 73, 75].includes(w.code)) c += '<span class="wxc rain">☔ 우산 (비 ' + (w.rainP || '') + '%)</span>';
    if (w.min != null && w.min <= 1) c += '<span class="wxc cold">🧤 아침 ' + w.min + '° — 장갑·핫팩 넉넉히</span>';
    else if (w.max != null && w.max >= 15) c += '<span class="wxc warm">🧥 낮 ' + w.max + '° — 겉옷은 벗어 들기 쉽게</span>';
    return c; };
  const one = (d, lb) => { const b = B[d]; if (!b) return ''; return '<div class="bring-day"><b>' + lb + '</b><div class="bring-chips">' + wxChips(d) + (b.items || []).map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' + (b.meet ? '<div class="bring-meet">🧭 흩어지면 <b>' + esc(b.meet) + '</b></div>' : '') + '</div>'; };
  const a = one(t0, '🎒 오늘 챙길 것'), b = eve ? one(tm, '🌙 내일 챙길 것 (자기 전에)') : '';
  return a || b ? '<div class="sec"><div class="card bring">' + (eve ? b + a : a) + '</div></div>' : ''; // 저녁엔 내일 것부터
}
function tkTodayCard(t) {
  const t0 = tkDay(), tm = ymd(new Date(new Date(t0 + 'T12:00:00').getTime() + 864e5)), nowHM = hm();
  const slots = [];
  live('bookings', t.id).forEach(b => { if (!tkList(b).length || (b.date !== t0 && b.date !== tm)) return;
    [...new Set((b.tkNeed || []).concat(tkList(b).map(q => tkLabel(b, q))))].forEach(lb => { const l = tkList(b).filter(q => tkLabel(b, q) === lb && (tkAll() || q.who === ME)); if (l.length) slots.push({ b, lb, l, when: tkWhen(t, b, lb), day: b.date }); }); });
  if (!slots.length) return '';
  const today_ = slots.filter(s => s.day === t0).sort((a, b) => (a.when || '99').localeCompare(b.when || '99'));
  const cur = today_.filter(s => !s.when || tkMin(s.when) >= tkMin(nowHM) - 90)[0] || (l0 => l0 && tkMin(l0.when) >= tkMin(nowHM) - 180 ? l0 : null)(today_[today_.length - 1]); // 마지막 티켓도 세 시간 지나면 감춤(밤 9시에 닌텐도 입장권이 뜨던 것, 2026-11-27)
  let h = '<div class="sec tk-today">';
  if (cur) {
    const have = cur.l.filter(tkReady).length;
    h += '<div class="tk-hero" style="--wc:' + tkColor(cur.b, cur.lb) + '"><div class="tk-h"><span class="wl-ic">' + tkIcon(cur.b, cur.lb) + '</span><span><small>지금 쓸 티켓' + (cur.when ? ' · ' + esc(cur.when) : '') + '</small><b>' + esc(cur.lb) + '</b><span>' + esc(cur.b.title) + '</span></span></div>' +
      (tkAll() ? '<button class="btn big tk-go" data-act="tk-gate" data-v="' + esc(cur.b.id) + '" data-label="' + esc(cur.lb) + '">가족 모두 차례로 (' + cur.l.length + '명)</button>' : '<button class="btn big tk-go" data-act="tk-gate" data-v="' + esc(cur.b.id) + '" data-label="' + esc(cur.lb) + '">내 티켓 보여주기</button>') +
      (!tkAll() ? '' : '<div class="tk-people">' + cur.l.map(q => '<button data-act="tk-me" data-v="' + esc(q.who) + '" data-file="' + esc(q.file) + '">' + av(q.who, 36) + '<span>' + esc(tkNm(q.who)) + '</span></button>').join('') + '</div>') + '<div class="tk-st">' + tkStatus(have, cur.l.length) + '</div></div>';
    const rest = today_.filter(s => s !== cur);
    if (rest.length) h += '<div class="tk-more">' + rest.map(s => '<button data-act="tk-gate" data-v="' + esc(s.b.id) + '" data-label="' + esc(s.lb) + '" style="--wc:' + tkColor(s.b, s.lb) + '"><span>' + tkIcon(s.b, s.lb) + '</span><b>' + esc(s.lb) + '</b><small class="num">' + esc(s.when || '') + '</small></button>').join('') + '</div>';
  }
  // 내일 티켓은 예약마다 한 줄로(시뮬레이션 2026-11-27: 같은 긴 이름이 세 번 되풀이되던 것)
  const tmB = [...new Set(slots.filter(s => s.day === tm).map(s => s.b))];
  tmB.forEach(b => { const ss = slots.filter(s => s.day === tm && s.b === b), have = ss.reduce((n, s) => n + s.l.filter(tkReady).length, 0), all = ss.reduce((n, s) => n + s.l.length, 0);
    h += '<button class="tk-tom" data-act="tab" data-v="pass"><b>내일 쓸 티켓 ' + ss.length + '가지 · ' + esc(ss.map(s => s.lb).join(' · ')) + '</b><small>' + esc(b.title) + '</small>' + tkStatus(have, all) + '</button>'; });
  return h === '<div class="sec tk-today">' ? '' : h + '</div>';
}
const tkMin = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; };
/* 보여주기 화면 — 표 한 장씩(화면 전체 그대로 · 잘라 낸 QR은 안 받음), 누르면 크게, 옆으로 밀면 다음 티켓 */
let TKV = null;
function tkGate(bid, lb) { const b = D.bookings[bid]; if (!b) return; const l = tkList(b).filter(q => tkLabel(b, q) === lb && (tkAll() || q.who === ME)).map(q => ({ b, q, lb })); const i0 = l.findIndex(e => e.q.who === ME); tkOpen(l, i0 < 0 ? 0 : i0, tkAll() ? 'gate' : 'me', lb + (tkAll() ? ' · 가족 모두' : ' · ' + ME)); }
function tkMe(t, who, file) { if (!tkAll()) who = ME; const l = tkEntries(t, who).filter(e => e.q && !tkPast(e)); const l2 = l.length ? l : tkEntries(t, who).filter(e => e.q); const i0 = l2.findIndex(e => e.q.file === file); tkOpen(l2, i0 < 0 ? 0 : i0, 'me', tkWhose(who)); }
const tkWhose = who => tkNm(who) + ' 티켓';
function tkOpen(list, start, mode, title) {
  if (!list.length) return toast('보여 줄 티켓이 없어요');
  if (TKV) tkClose(true);
  TKV = { l: list, i: start || 0, mode, h: false, wl: null, orig: false };
  const el = document.createElement('div'); el.id = 'tkview'; el.className = 'tkv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
  el.innerHTML = '<div class="tkv-top"><button class="tkv-x" data-tk="close" aria-label="닫기">' + ic('back') + '</button><div class="tkv-ttl"><b>' + esc(title) + '</b><small>' + (mode === 'gate' ? '한 사람씩 자기 코드를 찍어요' : '옆으로 밀면 다음 티켓') + '</small></div><button class="tkv-o" data-tk="orig">원본</button></div>' +
    '<div class="tkv-who"></div><div class="tkv-stage"></div><div class="tkv-dots"></div>' +
    '<div class="tkv-tip">☀️ 휴대폰 밝기를 가장 밝게 올려 주세요 · 화면은 꺼지지 않아요</div>' +
    '<div class="tkv-bot"><button class="btn" data-tk="prev">‹ 이전</button><button class="btn pri" data-tk="next">' + (mode === 'gate' ? '다음 사람' : '다음 티켓') + ' ›</button></div>';
  document.body.appendChild(el); document.body.classList.add('tk-on'); document.body.style.overflow = 'hidden';
  if (!POP_SKIP) { history.pushState({ tk: 1 }, ''); TKV.h = true; }
  el.addEventListener('click', e => {
    const x = e.target.closest('[data-tk]'); if (!x) return;
    const a = x.dataset.tk;
    if (a === 'close') tkClose(); else if (a === 'prev') tkTurn(-1); else if (a === 'next') tkTurn(1); else if (a === 'go') { TKV.i = +x.dataset.v; tkPaint(); }
    else if (a === 'orig') { TKV.orig = !TKV.orig; tkPaint(); }
  });
  const stage = el.querySelector('.tkv-stage'); let sx = 0, sy = 0, moved = false;
  stage.addEventListener('touchstart', e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; moved = false; }, { passive: true });
  stage.addEventListener('touchend', e => { const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !stage.classList.contains('zoom')) { moved = true; tkTurn(dx < 0 ? 1 : -1); } });
  stage.addEventListener('click', e => {
    if (moved) { moved = false; return; }
    const im = e.target.closest('.tkv-orig img, .tkc.orig img'); if (!im) return;
    if (stage.classList.toggle('zoom')) { const r = im.getBoundingClientRect(); im.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%'; } else im.style.transformOrigin = '';
  });
  tkWake();
  tkPaint();
}
async function tkWake() { try { if (TKV && navigator.wakeLock && !TKV.wl) { TKV.wl = await navigator.wakeLock.request('screen'); TKV.wl.addEventListener('release', () => { if (TKV) TKV.wl = null; }); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && TKV) tkWake(); });
function tkTurn(d) { if (!TKV) return; const n = TKV.l.length; if (n < 2) return; TKV.i = (TKV.i + d + n) % n; buzz(); tkPaint(); }
async function tkPaint() {
  const el = $('#tkview'); if (!el || !TKV) return;
  const { l, i, mode } = TKV, e = l[i], q = e.q;
  el.querySelector('.tkv-who').innerHTML = l.map((x, k) => '<button class="' + (k === i ? 'on' : '') + '" data-tk="go" data-v="' + k + '" style="--wc:' + tkColor(x.b, x.lb, tkType(x.b, x.q)) + '">' + (mode === 'gate' ? av(x.q.who, 30) + '<span>' + esc(tkNm(x.q.who)) + '</span>' : '<i>' + tkIcon(x.b, x.lb, tkType(x.b, x.q)) + '</i><span>' + esc(x.lb) + '</span>') + '</button>').join('');
  el.querySelector('.tkv-dots').innerHTML = l.length > 1 ? l.map((x, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('') : '';
  el.querySelector('.tkv-o').classList.toggle('on', TKV.orig);
  const stage = el.querySelector('.tkv-stage'); stage.classList.remove('zoom');
  let src = await tkGet(q.file);
  if (!src && !q.data && !tkLocal(q.file) && PASS && navigator.onLine !== false) {
    stage.innerHTML = '<div class="tkv-miss">티켓을 받는 중…</div>';
    try { const r = await call('ticketImg', q.file); if (r && r.b64) { src = 'data:' + (r.mime || 'image/jpeg') + ';base64,' + r.b64; tkPut(q.file, src); } } catch (er) {}
  }
  if (!TKV || TKV.l[TKV.i] !== e) return;
  if (TKV.orig) { stage.innerHTML = src ? '<div class="tkv-orig"><img src="' + src + '" alt="원본 바우처"><small>원본 바우처 · 누르면 크게</small></div>' : '<div class="tkv-miss"><b>원본이 이 휴대폰에 아직 없어요</b>인터넷이 되면 저절로 받아요.</div>'; return; }
  const code = await tkCodeHtml(q, src);
  if (!TKV || TKV.l[TKV.i] !== e || TKV.orig) return;
  stage.innerHTML = tkPassHtml(e, code);
}
function tkClose(fromNav) {
  if (!TKV) return;
  const h = TKV.h; try { TKV.wl && TKV.wl.release(); } catch (e) {}
  TKV = null;
  const el = $('#tkview'); if (el) el.remove();
  document.body.classList.remove('tk-on'); if ($('#sheet').hidden) document.body.style.overflow = '';
  if (h && !fromNav) { POP_SKIP = true; history.back(); }
}
/* 표 한 장 — 모양(틀) 고르기 · 칸 채우기 · 미리 보기 */
async function tkEditOne(bid, k) {
  const b = D.bookings[bid], q0 = tkList(b)[k]; if (!q0) return;
  const q = Object.assign({}, q0, { f: Object.assign({}, q0.f || {}) }), src = await tkGet(q.file);
  const code = await tkCodeHtml(q, src);
  const paint = el => { const tp = tkType(b, q), T = TK_TPL[tp];
    el.querySelector('#te_prev').innerHTML = tkPassHtml({ b, q, lb: tkLabel(b, q) }, code, true);
    el.querySelector('#te_f').innerHTML = T.f.map(([fk, n]) => '<div class="field half"><label>' + esc(n) + '</label><input class="in" data-te="' + fk + '" value="' + esc(q.f[fk] || '') + '" placeholder="' + esc(tkFields(b, Object.assign({}, q, { f: {} }))[fk] || '') + '"></div>').join('');
    el.querySelectorAll('[data-te]').forEach(inp => inp.oninput = () => { q.f[inp.dataset.te] = inp.value.trim(); el.querySelector('#te_prev').innerHTML = tkPassHtml({ b, q, lb: tkLabel(b, q) }, code, true); }); };
  openSheet('<h2>티켓 모양 · ' + esc(tkLabel(b, q)) + ' · ' + esc(q.who) + '</h2><div id="te_prev" class="te-prev"></div>' +
    '<div class="field"><label>어떤 티켓</label><div class="opts" id="te_tp">' + Object.entries(TK_TPL).map(([key, T]) => '<button type="button" class="opt ' + (tkType(b, q) === key ? 'on' : '') + '" data-opt="' + key + '">' + T.ic + ' ' + esc(T.n) + '</button>').join('') + '</div></div>' +
    '<div class="te-f" id="te_f"></div><label class="te-all"><input type="checkbox" id="te_all" checked> 같은 「' + esc(tkLabel(b, q)) + '」 티켓 모두에 같게 (이름·번호는 그대로)</label>' +
    '<div class="sheet-acts"><button class="btn" id="te_back">뒤로</button><button class="btn pri" id="te_save">저장</button></div>', el => {
    paint(el);
    el.querySelectorAll('#te_tp .opt').forEach(o => o.onclick = () => { el.querySelectorAll('#te_tp .opt').forEach(x => x.classList.remove('on')); o.classList.add('on'); q.type = o.dataset.opt; paint(el); });
    el.querySelector('#te_back').onclick = () => tkAdd(bid);
    el.querySelector('#te_save').onclick = () => {
      const all = el.querySelector('#te_all').checked, lb = tkLabel(b, q);
      const fClean = Object.fromEntries(Object.entries(q.f).filter(([, v]) => v));
      const out = tkList(D.bookings[bid]).map((x, j) => j === k || (all && tkLabel(b, x) === lb) ? Object.assign({}, x, { type: q.type || x.type, f: Object.assign({}, fClean) }) : x);
      put('bookings', Object.assign({}, D.bookings[bid], { qr: out })); toast('티켓 모양을 저장했어요'); tkAdd(bid);
    };
  });
}
/* 넣기·고치기 — 사진 여러 장을 한꺼번에, 장마다 누구 표·무슨 표인지 고름 */
async function tkAdd(bid) {
  const b = D.bookings[bid]; if (!b) return;
  const t = D.trips[b.trip] || {}, mem = tkAll() ? (t.members || []).slice() : [ME];
  const l = tkList(b), sug = [...new Set((b.tkNeed || []).concat(TK_SUGGEST[b.kind] || TK_SUGGEST.기타))];
  const imgs = await Promise.all(l.map(q => tkGet(q.file)));
  const cnt = lb => l.filter(q => tkLabel(b, q) === lb).length;
  openSheet('<h2>티켓 넣기 · ' + esc(b.title) + '</h2><p class="muted">바우처 화면을 사람마다 한 장씩 캡처해서 넣어요. QR만 잘라 내지 말고 화면 그대로 넣어요. 넣은 티켓은 이 휴대폰에 저장돼서 인터넷이 없어도 열려요.</p>' +
    '<div class="field"><label>이 예약에 있어야 할 티켓 (쉼표로)</label><input class="in" id="tk_need" value="' + esc((b.tkNeed || []).join(', ')) + '" placeholder="예: 1일 입장권, 닌텐도 입장권, 푸드 바우처"></div>' +
    '<div class="field"><label>아직 발급 전이면 (예: 온라인 체크인 뒤 발급)</label><input class="in" id="tk_wait" value="' + esc(b.tkWait || '') + '" placeholder="비우면 발급된 티켓으로 봐요"></div>' +
    '<div class="field"><label>새로 넣을 사진의 티켓 이름</label><div class="opts" id="tk_lb">' + sug.map((s, k) => '<button type="button" class="opt ' + (k === 0 ? 'on' : '') + '" data-opt="' + esc(s) + '">' + esc(s) + (cnt(s) ? ' ' + cnt(s) : '') + '</button>').join('') + '</div></div>' +
    '<button class="btn pri big" id="tk_pick" style="width:100%">' + ic('camera') + '티켓 사진 고르기 (여러 장 한꺼번에)</button>' +
    '<div class="tk-rows">' + l.map((q, k) => !tkAll() && q.who !== ME ? '' : '<div class="tk-row"><div class="tk-th">' + (imgs[k] ? '<img src="' + imgs[k] + '" alt="">' : '<span>🎟️</span>') + '</div><div class="tk-rb"><input class="in tk-lbin" data-tk-lb="' + k + '" value="' + esc(tkLabel(b, q)) + '" aria-label="티켓 이름"><div class="opts" data-tk-who="' + k + '">' +
      mem.map(m => '<button type="button" class="opt ' + (q.who === m ? 'on' : '') + '" data-opt="' + esc(m) + '">' + esc(tkNm(m)) + '</button>').join('') + '</div>' +
      '<input class="in tk-code" data-tk-code="' + k + '" placeholder="티켓 번호 (있으면)" value="' + esc(q.code || '') + '"><div class="tk-rowacts"><span class="' + (q.data ? 'tk-ok' : 'tk-no') + '">' + (q.data ? '✓ ' + (/QR/.test(q.data.f) ? 'QR' : '바코드') + ' 읽음' : '코드 못 찾음') + '</span><button class="linkbtn" data-tk-one="' + k + '">모양·내용</button>' + (!q.data && imgs[k] ? '<button class="linkbtn" data-tk-re="' + k + '">다시 읽기</button>' : '') + '<button class="linkbtn tk-del" data-tk-del="' + k + '">빼기</button></div></div></div>').join('') + '</div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="tk_save">저장</button></div>', el => {
    const needOf = () => el.querySelector('#tk_need').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const cur = () => { const out = tkList(D.bookings[bid]).map(q => Object.assign({}, q));
      el.querySelectorAll('[data-tk-who]').forEach(o => { const k = +o.dataset.tkWho, on = o.querySelector('.opt.on'); if (out[k] && on) out[k].who = on.dataset.opt; });
      el.querySelectorAll('[data-tk-lb]').forEach(o => { const k = +o.dataset.tkLb; if (out[k]) out[k].label = o.value.trim() || tkLabel(b, out[k]); });
      el.querySelectorAll('[data-tk-code]').forEach(o => { const k = +o.dataset.tkCode; if (out[k]) out[k].code = o.value.trim(); }); return out; };
    const keep = qr => put('bookings', Object.assign({}, D.bookings[bid], { qr, tkNeed: needOf(), tkWait: qr.length ? '' : el.querySelector('#tk_wait').value.trim() }));
    el.querySelectorAll('[data-tk-del]').forEach(x => x.onclick = () => { const out = cur(); out.splice(+x.dataset.tkDel, 1); keep(out); tkAdd(bid); });
    el.querySelector('#tk_save').onclick = () => { keep(cur()); closeSheet(); toast('티켓을 저장했어요'); };
    el.querySelectorAll('[data-tk-one]').forEach(x => x.onclick = () => { keep(cur()); tkEditOne(bid, +x.dataset.tkOne); });
    el.querySelectorAll('[data-tk-re]').forEach(x => x.onclick = async () => { const k = +x.dataset.tkRe, out = cur(); x.textContent = '찾는 중…'; const dec = await tkDecode(imgs[k]);
      if (dec) { out[k].data = dec.data; out[k].box = dec.box; keep(out); toast('코드를 찾았어요'); tkAdd(bid); } else { x.textContent = '못 찾았어요'; } });
    el.querySelector('#tk_pick').onclick = () => {
      const lbOn = el.querySelector('#tk_lb .opt.on'), lb = lbOn ? lbOn.dataset.opt : (sug[0] || '입장권');
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true;
      inp.onchange = async () => {
        const files = [...(inp.files || [])].filter(f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || ''));
        if (!files.length) return toast('사진 파일을 골라 주세요');
        const out = cur(), used = new Set(out.filter(q => tkLabel(b, q) === lb).map(q => q.who));
        const need = needOf(); if (!need.includes(lb)) need.push(lb);
        toast(lb + ' ' + files.length + '장 넣는 중… (QR·바코드를 찾아요)');
        for (const f of files) {
          let src; try { src = await shrink(f, 1800, .92); } catch (er) { continue; }
          const who = mem.find(m => !used.has(m)) || ME || mem[0]; used.add(who);
          const id = 'local-' + uid('q'); await tkPut(id, src);
          const dec = await tkDecode(src), same = out.find(x => tkLabel(b, x) === lb && (x.f || x.type));
          const nq = { who, label: lb, file: id, code: '' }; if (dec) { nq.data = dec.data; nq.box = dec.box; }
          if (same) { if (same.type) nq.type = same.type; if (same.f) nq.f = Object.assign({}, same.f); }
          out.push(nq);
        }
        put('bookings', Object.assign({}, D.bookings[bid], { qr: out, tkNeed: need, tkWait: '' }));
        tkUploadLocal(); // 저장한 다음에 하나씩 올림 — 끊기면 앱을 다시 열 때 이어서
        const miss = out.filter(x => !x.data).length; if (miss) toast(miss + '장은 코드를 못 찾았어요 — 그 티켓은 원본을 보여 줘요');
        tkAdd(bid);
      };
      inp.click();
    };
  });
}
/* 지갑 — 아래 메뉴 한 칸. 표만 모아 봄 (애플 지갑처럼), 예약 목록은 「예약 모두」 쪽 */
function passPage(t) {
  const seg = wseg();
  let h = '<div class="seg wseg" role="tablist" aria-label="지갑"><button role="tab" aria-selected="' + (seg !== 'money') + '" class="' + (seg !== 'money' ? 'on' : '') + '" data-act="wseg" data-v="pass">🎫 티켓</button><button role="tab" aria-selected="' + (seg === 'money') + '" class="' + (seg === 'money' ? 'on' : '') + '" data-act="wseg" data-v="money">💰 경비</button></div>';
  if (seg === 'money') return h + moneyTab(t);
  h += tkTodayCard(t) + tkWallet(t, true);
  h += '<div class="flex wl-acts"><button class="btn pri big" data-act="tk-pick">' + ic('camera') + '티켓 넣기</button><button class="btn big" data-act="tab" data-v="wallet">' + ic('ticket') + '예약 모두</button></div>';
  return h;
}
function tkPick(t) {
  const bk = live('bookings', t.id).filter(b => !['숙소', '보험', '주차'].includes(b.kind)).sort((a, b) => ((a.date || '9') + (a.time || '')).localeCompare((b.date || '9') + (b.time || '')));
  openSheet('<h2>어느 예약의 티켓인가요?</h2><div class="stack">' + bk.map(b => { const [icn, col] = BK[b.kind] || BK.기타; return '<button class="row" data-act="tk-add" data-v="' + esc(b.id) + '">' + ib(icn, col, 1) + '<span class="body"><div class="t">' + esc(b.title) + '</div><div class="m">' + esc([b.date ? md(b.date) : '날짜 미정', b.provider, tkList(b).length ? tkList(b).length + '장 들어 있음' : b.tkWait ? '발급 전' : ''].filter(Boolean).join(' · ')) + '</div></span></button>'; }).join('') +
    '<button class="newtrip" data-act="booking-new">' + ic('plus') + '새 예약부터 적기</button></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function walletPage(t) {
  const w = bookingWarnings(t), mode = UI.walletSort || LS.get('walletSort', 'date');
  const bk = live('bookings', t.id).sort((a, b) => ((a.date || '9') + (a.time || '')).localeCompare((b.date || '9') + (b.time || '')));
  const card = b => passCard(t, b, w[b.id]) + tkStrip(t, b) + (w[b.id] ? '<div class="warnline" style="margin:-4px 4px 4px">⚠️ ' + esc(w[b.id]) + '</div>' : '');
  const grp = (name, list, cls) => '<div class="wgroup' + (cls ? ' ' + cls : '') + '"><div class="wgroup-h"><b>' + esc(name) + '</b><span class="muted num">' + list.length + '</span></div><div class="stack">' + list.map(card).join('') + '</div></div>';
  let h = '<button class="wl-link" data-act="tab" data-v="pass">' + ib('wallet', 'var(--c-관광)', 1) + '<span><b>지갑에서 티켓 보기</b><span>QR·바코드 티켓은 사람마다 지갑에 모여 있어요</span></span><em class="wl-go">›</em></button>' + '<div class="flex" style="gap:8px;margin:4px 0 12px"><button class="btn pri big" style="flex:1" data-act="photo" data-v="booking">' + ic('camera') + '예약 화면 찍기</button><button class="btn big" style="flex:1" data-act="booking-new">' + ic('pen') + '직접 적기</button></div>';
  if (!bk.length) return h + '<div class="card empty">예약이 아직 없어요</div>';
  h += '<div class="wrest-h" style="margin-top:4px"><b>예약</b></div>';
  // 항공·숙소·보험은 늘 맨 위에 고정
  const PIN = ['항공', '숙소', '보험'];
  PIN.forEach(k => { const l = bk.filter(b => b.kind === k); if (l.length) h += grp(k, l, 'pinned'); });
  const rest = bk.filter(b => !PIN.includes(b.kind));
  if (!rest.length) return h;
  h += '<div class="wrest-h"><b>티켓·교통·주차 등</b><div class="seg mini wsort"><button class="' + (mode === 'date' ? 'on' : '') + '" data-act="wallet-sort" data-v="date">시간순</button><button class="' + (mode === 'kind' ? 'on' : '') + '" data-act="wallet-sort" data-v="kind">종류별</button></div></div>';
  if (mode === 'kind') {
    const ORDER = ['티켓', '교통', '주차', '서류', '기타'];
    [...new Set(rest.map(b => b.kind || '기타'))].sort((a, b) => (ORDER.indexOf(a) + 99 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * (ORDER.indexOf(b) < 0)))
      .forEach(k => { h += grp(k, rest.filter(b => (b.kind || '기타') === k)); });
  } else {
    [...new Set(rest.map(b => b.date || ''))].forEach(d => { h += grp(d ? md(d) + (d === today() ? ' · 오늘' : '') : '날짜 없음', rest.filter(b => (b.date || '') === d)); });
  }
  return h;
}
/* PC: 할 일 · 함께 챙길 짐 · 가방들을 칸으로 나란히 (한눈에) */
function prepBoard(t, tabs, inTab) {
  const ORDER = Object.keys(PREP_CAT);
  return '<div class="prep-board">' + tabs.map(([k, n]) => {
    const l = inTab(k), d = l.filter(c => c.done).length, owner = k.startsWith('p:') ? k.slice(2) : '';
    const groups = {}; l.forEach(c => (groups[c.cat || '기타'] = groups[c.cat || '기타'] || []).push(c));
    const body = !l.length ? (owner ? '<button class="btn pri pb-kit" data-act="prep-kit" data-v="' + esc(owner) + '">' + ic('plus') + '기본 준비물 넣기</button>' : '<div class="muted small">아직 없어요</div>')
      : Object.keys(groups).sort((a, b) => (ORDER.indexOf(a) + 99 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * (ORDER.indexOf(b) < 0))).map(g => '<div class="pb-cat">' + esc(g) + '</div>' +
        groups[g].sort((a, b) => (a.done - b.done) || a.ts - b.ts).map(c => '<div class="pb-row ' + (c.done ? 'done' : '') + '"><button class="chk sm ' + (c.done ? 'on' : '') + '" data-act="check-done" data-v="' + esc(c.id) + '" aria-label="끝 표시">' + (c.done ? ic('check') : '') + '</button><button class="pb-t" data-act="check-edit" data-v="' + esc(c.id) + '" title="' + esc(c.memo || '') + '">' + esc(c.text) + (c.who && !owner ? ' <span class="pill">' + esc(whoName(c.who)) + '</span>' : '') + '</button></div>').join('')).join('');
    return '<section class="pb-col"><header>' + (owner ? av(owner, 26) : ib(k === 'todo' ? 'check' : 'bag', 'var(--mint)', 1)) + '<b>' + esc(n) + '</b><span class="num">' + d + '/' + l.length + '</span><button class="pb-add" data-act="prep-add" data-v="' + esc(k) + '" aria-label="' + esc(n) + '에 더하기">' + ic('plus') + '</button></header>' +
      '<i class="pb-bar"><i style="width:' + (l.length ? Math.round(d / l.length * 100) : 0) + '%"></i></i><div class="pb-list">' + body + '</div></section>';
  }).join('') + '</div>';
}
/* 준비물 — 할 일 · 함께 챙길 짐 · 사람마다 개인 가방 (여행 준비 전문가 의견으로 나눔) */
const TODO_CATS = ['서류', '예약', '출발 전', '돌아올 때'];
const prepKind = c => c.owner ? 'p:' + c.owner : TODO_CATS.includes(c.cat) ? 'todo' : 'common';
const whoName = n => n === ME ? '나' : ((fam(n) || {}).role) || n;
function personalKit(t) {
  const m = +String(t.start || '').slice(5, 7), cold = [11, 12, 1, 2, 3].includes(m), hot = [6, 7, 8].includes(m), out = abroad(t), n = Math.max(1, daysOf(t).length);
  return [
    ['옷', cold ? '두꺼운 외투' : hot ? '얇은 겉옷 (실내 냉방 대비)' : '가벼운 겉옷'], cold && ['옷', '장갑·목도리·모자'], cold && ['옷', '내복 (히트텍 같은 것)'], hot && ['옷', '모자·선글라스'],
    n > 1 && ['옷', '갈아입을 옷 ' + (n - 1) + '벌'], ['옷', '양말·속옷 ' + n + '일치'], n > 1 && ['옷', '잠옷'], ['옷', '오래 걸어도 편한 신발'],
    ['세면·생활', '칫솔·치약'], ['세면·생활', '렌즈·안경 (쓰는 사람)'], ['세면·생활', '로션·선크림·립밤'],
    ['전자기기', '휴대폰 충전기·케이블'], ['전자기기', '이어폰'],
    ['건강', '개인 복용약'], ['건강', '마스크 몇 장'],
    out && ['서류', '내 여권 (가방 속 정해진 자리)'], out && ['전자기기', 'eSIM·유심 설치 확인']
  ].filter(Boolean);
}
function prepPage(t) {
  const ck = live('checks', t.id), mem = t.members || [];
  const done = ck.filter(c => c.done).length, p = ck.length ? Math.round(done / ck.length * 100) : 0;
  const tabs = [['todo', '할 일'], ['common', '함께 챙길 짐'], ...mem.map(n => ['p:' + n, n === ME ? '내 가방' : whoName(n) + ' 가방'])];
  const cur = tabs.some(x => x[0] === UI.prepTab) ? UI.prepTab : (mem.includes(ME) ? 'p:' + ME : 'todo');
  const inTab = k => ck.filter(c => prepKind(c) === k);
  let h = '<div class="card flex" style="gap:14px;margin-top:4px"><div class="ring" style="--p:' + p + '"><span class="num">' + p + '%</span></div><div style="flex:1"><b style="font-size:17px">' + (p === 100 ? '준비 끝! 가방만 들면 돼요' : done + ' / ' + ck.length + ' 준비 끝') + '</b><div class="muted">' +
    (dayDiff(today(), t.start) > 0 ? '출발까지 ' + dayDiff(today(), t.start) + '일' : '즐거운 여행 되세요') + '</div></div><img class="bp" src="img/backpack.webp" alt=""></div>';
  h += '<div class="prep-tabs">' + tabs.map(([k, n]) => { const l = inTab(k), d = l.filter(c => c.done).length;
    return '<button class="' + (k === cur ? 'on' : '') + (l.length && d === l.length ? ' full' : '') + '" data-act="prep-tab" data-v="' + esc(k) + '">' + (k.startsWith('p:') ? av(k.slice(2), 22) : ib(k === 'todo' ? 'check' : 'bag', 'var(--mint)', 1)) + '<span>' + esc(n) + '<small class="num">' + d + '/' + l.length + '</small></span></button>'; }).join('') + '</div>';
  if (WIDE()) return h.replace('<div class="prep-tabs">', '<div class="prep-tabs" hidden>') + prepBoard(t, tabs, inTab);
  const list = inTab(cur), owner = cur.startsWith('p:') ? cur.slice(2) : '';
  const hint = { todo: '떠나기 전에 해 둘 일 — 서류·예약·집 정리·돌아올 때 챙길 것', common: '가족이 함께 쓰는 짐 — 맡은 사람을 정해 두면 겹치지 않아요' }[cur] || (owner === ME ? '내 가방에 넣을 것 — 넣었으면 눌러서 체크해요' : esc(owner) + ' 님 가방 — 아이 가방은 부모님이 함께 확인해 주세요');
  h += '<div class="prep-head"><span class="muted small">' + hint + '</span><button class="linkbtn" data-act="check-new">＋ 더하기</button></div>';
  if (!list.length) {
    h += '<div class="card empty">' + (owner ? '<b>' + esc(whoName(owner)) + ' 가방이 비어 있어요</b>여행 계절·일수에 맞춘 기본 목록(' + personalKit(t).length + '가지)을 넣고 고쳐 써요.<button class="btn pri" style="margin-top:10px" data-act="prep-kit" data-v="' + esc(owner) + '">' + ic('plus') + '기본 개인 준비물 넣기</button>' : '아직 없어요') + '</div>';
    return h;
  }
  const groups = {};
  list.forEach(c => (groups[c.cat || '기타'] = groups[c.cat || '기타'] || []).push(c));
  const ORDER = Object.keys(PREP_CAT);
  Object.keys(groups).sort((a, b) => (ORDER.indexOf(a) + 99 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * (ORDER.indexOf(b) < 0))).forEach(g => {
    const l = groups[g].sort((a, b) => (a.done - b.done) || a.ts - b.ts);
    h += '<div class="sec"><div class="sec-h"><h3 class="ih">' + pic(PREP_CAT[g] || PREP_CAT.기타, 36) + esc(g) + '</h3><span class="muted num">' + l.filter(c => c.done).length + '/' + l.length + '</span></div><div class="card">' +
      l.map(c => '<div class="row ' + (c.done ? 'done' : '') + '"><button class="chk ' + (c.done ? 'on' : '') + '" data-act="check-done" data-v="' + esc(c.id) + '" aria-label="끝 표시">' + (c.done ? ic('check') : '') + '</button>' + pic(prepIcon(c), 34) +
        '<button class="body" style="text-align:left;min-height:44px" data-act="check-edit" data-v="' + esc(c.id) + '"><div class="t">' + esc(c.text) + '</div>' + (c.memo ? '<div class="m clamp2">' + esc(c.memo) + '</div>' : '') + '</button>' +
        (c.who && !owner ? '<span class="pill">' + esc(whoName(c.who)) + '</span>' : '') + '</div>').join('') + '</div></div>';
  });
  return h;
}
function carPage(t) {
  const pb = parkBooking(t);
  const pks = live('parks', t.id).sort((a, b) => b.ts - a.ts);
  let h = '';
  const pk = pks[0];
  if (pk) {
    const hours = pk.date ? Math.max(0, Math.round((Date.now() - new Date(pk.date + 'T' + (pk.time || '00:00')).getTime()) / 36e5)) : 0;
    h += '<div class="car">' + (safeImg(pk.thumb) ? '<button data-act="view-photo" data-c="parks" data-v="' + esc(pk.id) + '" style="display:block;width:100%"><img src="' + pk.thumb + '" alt="주차 위치 사진"></button>' : '') +
      '<div class="cin"><div class="spot">' + esc(pk.spot || '주차 위치') + '</div><div class="muted">' + esc(md(pk.date)) + ' ' + esc(pk.time || '') + ' 세움' + (hours ? ' · ' + Math.floor(hours / 24) + '일 ' + (hours % 24) + '시간째' : '') + (pk.by ? ' · ' + esc(pk.by) + ' 기록' : '') + '</div>' +
      (pk.memo ? '<p style="margin:8px 0 0">' + esc(pk.memo) + '</p>' : '') + (pk.keyBy ? '<p class="muted" style="margin:6px 0 0">🔑 차 키: ' + esc(pk.keyBy) + '</p>' : '') + (pk.left ? '<p class="muted" style="margin:4px 0 0">차에 둔 것: ' + esc(pk.left) + '</p>' : '') +
      '<div class="acts">' + (pk.lat ? (inKR(pk.lat, pk.lng) ? nvA(nvRoute(pk.spot || '내 차', pk.lat, pk.lng, 'walk'), 'btn navy', ic('walk') + '걸어서 길찾기 (네이버)') : '<a class="btn navy" href="' + esc('https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=' + pk.lat + ',' + pk.lng) + '" target="_blank" rel="noopener">' + ic('walk') + '걸어서 길찾기</a>') : '') +
      '<button class="btn" data-act="photo" data-v="parking">' + ic('camera') + '사진 더 찍기</button><button class="btn" data-act="park-edit" data-v="' + esc(pk.id) + '">' + ic('pen') + '고치기</button>' +
      (safeUrl(pk.photoUrl) ? '<a class="btn" href="' + esc(pk.photoUrl) + '" target="_blank" rel="noopener">' + ic('link') + '원본 사진</a>' : '') + '</div></div></div>';
  } else h += '<div class="card empty">' + art('my-car') + '<b>주차한 뒤 기둥을 찍어 두세요</b>층·구역 글자를 읽어 여기 크게 보여 줘요</div><button class="btn pri big wide" style="margin-top:12px" data-act="photo" data-v="parking">' + ic('camera') + '주차 위치 사진 찍기</button>';
  if (pb) h += '<div class="sec"><div class="sec-h"><h3>주차 예약</h3></div>' + passCard(t, pb, bookingWarnings(t)[pb.id]) + '<div class="card" style="margin-top:10px"><div class="facts">' +
    [['주차장', pb.place || pb.title], ['입차', (pb.date || '') + ' ' + (pb.time || '') + (Number(pb.grace) ? ' (' + parkWindow(pb).inFrom + '~' + parkWindow(pb).inTo + ' 가능)' : '')], ['출차', (pb.end || '') + (Number(pb.grace) ? ' (' + parkWindow(pb).outFrom + '~' + parkWindow(pb).outTo + ' 가능)' : '')], ['차량번호', pb.car], ['예약번호', pb.code], ['보증금', pb.deposit ? comma(pb.deposit) + '원' : ''], ['전화', pb.phone]]
      .filter(x => x[1]).map(x => '<div><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div></div></div>';
  if (pks.length > 1) h += '<div class="sec"><div class="sec-h"><h3>예전 기록</h3></div><div class="card">' + pks.slice(1).map(p => '<button class="row" data-act="park-edit" data-v="' + esc(p.id) + '">' + (safeImg(p.thumb) ? '<img class="th" src="' + p.thumb + '" alt="">' : '') + '<span class="body"><span class="t">' + esc(p.spot || '') + '</span><div class="m">' + esc(md(p.date)) + ' ' + esc(p.time || '') + '</div></span></button>').join('') + '</div></div>';
  return h;
}
function infoCards(t, compact, only) {
  const I = INFO[t.id] || {}, c = countryOf(t);
  let h = '<div class="stack">';
  // 환율
  if (t.cur && t.cur !== 'KRW') {
    const fx = I.fx;
    h += '<div class="card"><div class="between"><span class="muted">💱 환율 (오늘)</span><span class="muted small">' + (fx ? new Date(fx.upd).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) + ' 기준' : '불러오는 중') + '</span></div>' +
      '<div class="big-num num">100' + unit(t.cur) + ' = ' + (fx ? comma(fx.rate) + '원' : '…') + '</div>' +
      '<div class="conv"><input class="in num" id="cv_a" inputmode="decimal" placeholder="' + unit(t.cur) + '" aria-label="' + unit(t.cur) + ' 금액"><span class="muted">→</span><div class="in num" id="cv_b" style="display:flex;align-items:center;justify-content:flex-end;font-weight:800">0원</div></div>' +
      (fx && Math.abs(fx.rate - t.rate) / fx.rate > .02 ? '<button class="btn" style="margin-top:10px" data-act="use-fx">경비 계산도 오늘 환율로 (지금 ' + comma(t.rate) + '원)</button>' : '') + '</div>';
  }
  if (only === 'fx') return h + '</div>';
  // 날씨
  const w = I.wx;
  if (w && w.daily) {
    const dd = w.daily, inTrip = dd.time.filter(d => d >= t.start && d <= t.end);
    const idx = (inTrip.length ? inTrip : dd.time.slice(0, compact ? 5 : 10)).map(d => dd.time.indexOf(d));
    const cur = w.current ? WMO(w.current.weather_code) : null;
    h += '<div class="card"><div class="between"><button class="linkbtn" style="padding:0;color:var(--soft)" data-act="tab" data-v="weather">🌤️ ' + esc((I.geo && I.geo.name) || t.place) + ' 날씨 ›</button>' + (cur ? '<b class="num flex" style="gap:4px">지금 ' + wxi(w.current.weather_code, 28) + ' ' + Math.round(w.current.temperature_2m) + '°</b>' : '') + '</div>' +
      '<div class="wx">' + idx.map(k => { const x = WMO(dd.weather_code[k]); return '<div><small>' + esc(md(dd.time[k]).replace(/\(.\)/, '')) + '</small><b>' + wxi(dd.weather_code[k], 34) + '</b><span class="num">' + Math.round(dd.temperature_2m_max[k]) + '° / ' + Math.round(dd.temperature_2m_min[k]) + '°</span>' + (dd.precipitation_probability_max[k] > 30 ? '<br><small>☔' + dd.precipitation_probability_max[k] + '%</small>' : '') + '</div>'; }).join('') + '</div>' +
      (inTrip.length ? '' : '<div class="muted small" style="margin-top:8px">여행 날 예보는 출발 16일 전부터 보여요. 지금은 요즘 날씨예요.' + (I.normal ? ' <b>여행 날 평균(지난 ' + I.normal.years + '년): 낮 ' + I.normal.avgMax + '° · 아침 ' + I.normal.avgMin + '°</b>' : '') + '</div>') + '</div>';
  } else if (I.wxErr) h += '<div class="card muted">날씨를 불러오지 못했어요</div>';
  // 나라
  if (c && c.n !== '한국') {
    h += '<div class="card"><div class="muted" style="margin-bottom:4px">' + c.f + ' ' + c.n + ' 기본 정보</div><div class="facts">' +
      [['시차', c.tz], ['전기', c.volt], ['팁', c.tip]].concat(compact ? [] : [['참고', c.etc]]).filter(x => x[1]).map(x => '<div><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') +
      '<div><span>긴급</span><b>' + c.sos.map(s => esc(s[0]) + ' <a href="tel:' + esc(s[1]) + '">' + esc(s[1]) + '</a>').join(' · ') + '</b></div>' +
      '<div><span>영사콜센터</span><b><a href="tel:' + CONSUL + '">' + CONSUL + '</a> (24시간)</b></div></div></div>';
  }
  return h + '</div>';
}
function infoPage(t) {
  const hb = live('bookings', t.id).find(b => b.kind === '숙소');
  let h = infoCards(t, false);
  if (hb) h += '<div class="sec"><div class="sec-h"><h3>숙소 (택시에 보여 주기)</h3></div><div class="card"><div style="font-size:20px;font-weight:800">' + esc(hb.title) + '</div>' +
    (hb.place ? '<div style="font-size:18px;margin-top:6px">' + esc(hb.place) + '</div>' : '') + '<div class="acts flex" style="margin-top:12px;flex-wrap:wrap">' + (hb.place ? nvA(goTo(t, hb.place, hb), 'btn navy', ic('route') + (isKR(t, hb) ? '네이버 길찾기' : '길찾기')) + (isKR(t, hb) ? '' : nvA(nvPlace(hb.place), 'btn nv-o', '<span class="nvlogo">N</span>네이버 지도')) : '') + '<button class="btn" data-act="booking-edit" data-v="' + esc(hb.id) + '">' + ic('pen') + '주소 고치기</button></div>' +
    '<div class="muted small" style="margin-top:8px">예약 확인서의 일본어 주소로 바꿔 두면 택시 기사에게 그대로 보여 줄 수 있어요.</div></div></div>';
  const tips = live('recs', t.id).filter(r => r.kind === '팁');
  if (tips.length) h += '<div class="sec"><div class="sec-h"><h3>알아 둘 것</h3></div><div class="card">' + tips.map(r => String(r.desc || '').length > 60 ? '<div class="row sfc fold" data-act="sf-tap"><span class="body"><div class="t">' + esc(r.name) + '</div><div class="tl-x"><div class="m">' + esc(r.desc) + '</div></div><div class="tl-hint">눌러서 자세히 ▾</div></span></div>' : '<div class="row"><span class="body"><div class="t">' + esc(r.name) + '</div><div class="m">' + esc(r.desc) + '</div></span></div>').join('') + '</div></div>';
  return h;
}

/* ---------- 개인 메모장 — 수첩 안, 가족마다 자기 메모. 「나만 보기」는 쓴 사람에게만 보여요 ---------- */
function memoHtml(t) {
  const names = D.meta.family.map(f => f.name), who = names.includes(UI.memoWho) ? UI.memoWho : (names.includes(ME) ? ME : names[0]);
  const seen = live('memos', t.id).filter(m => !m.secret || m.owner === ME), mine = who === ME;
  const list = seen.filter(m => m.owner === who).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.ts - a.ts);
  let h = '<div class="sec memo-sec" id="bk_memo"><div class="sec-h"><h3 class="ih">' + ib('pen', 'var(--sun)', 1) + '메모장</h3>' + (mine ? '<button class="linkbtn" data-act="memo-new">＋ 메모</button>' : '') + '</div>';
  h += '<div class="chips memo-who">' + names.map(n => '<button class="chipbtn ' + (who === n ? 'on' : '') + '" data-act="memo-who" data-v="' + esc(n) + '">' + av(n, 22) + ' ' + esc(n === ME ? '나' : ((fam(n) || {}).role) || n) + ' <span class="num">' + seen.filter(m => m.owner === n).length + '</span></button>').join('') + '</div>';
  if (!list.length) h += '<div class="memo-empty">' + (mine ? '<b>나만의 여행 메모</b>챙길 것·현지에서 떠오른 생각·사고 싶은 것을 적어 두세요. 「나만 보기」를 고르면 다른 가족에게는 안 보여요.<button class="btn pri" data-act="memo-new">' + ic('plus') + '메모 쓰기</button>' : esc(who) + ' 님이 아직 쓴 메모가 없어요.') + '</div>';
  else h += '<div class="memo-grid">' + list.map(m => {
    const body = '<p>' + esc(m.text) + '</p><small>' + (m.pin ? '📌 ' : '') + (m.secret ? '🔒 나만 보기 · ' : '') + esc(new Date(m.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</small>';
    return mine ? '<button class="memo-card" data-act="memo-edit" data-v="' + esc(m.id) + '">' + body + '</button>' : '<div class="memo-card">' + body + '</div>';
  }).join('') + '</div>';
  if (!mine && list.length) h += '<div class="muted small" style="margin:6px 2px">' + esc(who) + ' 님 메모는 읽기만 할 수 있어요.</div>';
  return h + '</div>';
}
function memoEdit(t, m) {
  const isNew = !m; m = m || { owner: ME, text: '', pin: false, secret: false };
  openSheet('<h2>' + (isNew ? '새 메모' : '메모 고치기') + '</h2><textarea class="in memo-in" id="memo-txt" rows="8" placeholder="예: 공항 가기 전에 보조배터리 충전 · 하늘이 선물 사기">' + esc(m.text) + '</textarea>' +
    '<label class="memo-opt"><input type="checkbox" id="memo-pin"' + (m.pin ? ' checked' : '') + '> 📌 위에 고정</label><label class="memo-opt"><input type="checkbox" id="memo-sec"' + (m.secret ? ' checked' : '') + '> 🔒 나만 보기 (다른 가족에게 안 보여요)</label>' +
    '<div class="sheet-acts">' + (isNew ? '' : '<button class="btn danger" id="memo-del">지우기</button>') + '<button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="memo-go">' + ic('check') + '저장</button></div>', el => {
      const ta = el.querySelector('#memo-txt'); setTimeout(() => ta.focus(), 50);
      el.querySelector('#memo-go').onclick = () => {
        const text = ta.value.trim(); if (!text) return toast('메모를 적어 주세요');
        put('memos', Object.assign({}, m, { id: m.id || uid('m'), trip: t.id, owner: ME, text, pin: el.querySelector('#memo-pin').checked, secret: el.querySelector('#memo-sec').checked }), true);
        closeSheet(); render(); toast('저장했어요');
      };
      const d = el.querySelector('#memo-del'); if (d) d.onclick = () => { closeSheet(); remove('memos', m.id, '메모'); };
    });
}

/* ---------- 여행 수첩 (공부하듯 읽는 여행지 자료) ---------- */
const BKEY = (t, k) => 'book.' + t.id + '.' + ME + '.' + k;
const bookRead = (t, k) => !!LS.get(BKEY(t, k), false);
function tripWx(t) {
  // 여행 날마다 {d, max, min, code, rainP, real}
  const I = INFO[t.id] || {}, w = I.wx, nm = I.normal;
  return daysOf(t).map(d => {
    if (w && w.daily) { const k = w.daily.time.indexOf(d); if (k >= 0) return { d, max: Math.round(w.daily.temperature_2m_max[k]), min: Math.round(w.daily.temperature_2m_min[k]), code: w.daily.weather_code[k], rainP: w.daily.precipitation_probability_max[k], real: true }; }
    if (nm && nm.days[d.slice(5)]) { const x = nm.days[d.slice(5)]; return { d, max: x.max, min: x.min, code: x.rainP > 40 ? 61 : 2, rainP: x.rainP, real: false }; }
    return { d, max: null };
  });
}
function outfitBlock(t, max, min, rain) {
  if (max == null || !window.GUIDE) return '<div class="muted">날씨를 받으면 옷차림을 알려 드려요</div>';
  const mem = (t.members || []).map(n => fam(n) || { name: n, role: '' });
  return '<div class="outfits">' + mem.map(p => { const o = GUIDE.outfitFor(p, max, min, rain); return '<div class="outfit"><div class="fig-wrap"><img class="fig-img" src="' + o.img + '" alt="' + esc((p.role || p.name) + ' 옷차림') + '" loading="lazy">' + (rain ? '<img class="fig-rain" src="img/wx-rain.webp" alt="우산 챙기기">' : '') + '</div><b>' + esc(p.role || p.name) + '</b><span>' + esc(o.text) + '</span><small>👟 ' + esc(o.shoes) + (rain ? ' · ☂️ 우산' : '') + '</small></div>'; }).join('') + '</div>';
}
function bookTab(t) {
  const c = countryOf(t), cc0 = t.country || (c && Object.keys(COUNTRY).find(k => COUNTRY[k] === c)) || '';
  const G = window.GUIDE || { PHRASES: {}, CULTURE: {}, SOS_MORE: {} };
  const ph = G.PHRASES[cc0] || G.PHRASES.EN, cul = G.CULTURE[cc0] || [], sosMore = G.SOS_MORE[cc0] || [];
  const wx = tripWx(t), known = wx.filter(x => x.max != null);
  const avgMax = known.length ? Math.round(known.reduce((s, x) => s + x.max, 0) / known.length) : null, avgMin = known.length ? Math.round(known.reduce((s, x) => s + x.min, 0) / known.length) : null;
  const recs = live('recs', t.id);
  const SECS = [['sos', '🆘', '비상 연락'], ['docs', '🛂', '여권·서류'], ['wx', '🌤️', '날씨와 옷차림'], ['talk', '🗣️', '꼭 쓰는 말'], ['caution', '⚠️', '현지 주의할 점'], ['culture', '🎌', '알아 둘 문화'], ['money', '💱', '돈·환율'], ['basic', '🔌', '기본 정보'], ['spots', '⭐', '가 볼 곳 미리 공부'], ['tips', '💡', '여행 팁']];
  const readN = SECS.filter(([k]) => bookRead(t, k)).length;
  const HEAD_ART = { sos: 'sos-cover', talk: 'phrase-cover', docs: 'pass-cover', wx: 'wx-partly', caution: 'bk-caution', culture: 'bk-culture', money: 'bk-money', basic: 'bk-plug', spots: 'bk-spot', tips: 'bk-tip' };
  const head = (k, e, n) => '<div class="sec book-sec" id="bk_' + k + '"><div class="sec-h"><h3 class="ih">' + (HEAD_ART[k] ? '<img class="h-art" src="img/' + HEAD_ART[k] + '.webp" alt="">' : e) + ' ' + n + '</h3><button class="readchk ' + (bookRead(t, k) ? 'on' : '') + '" data-act="book-read" data-v="' + k + '">' + (bookRead(t, k) ? '✓ 읽었어요' : '읽었어요') + '</button></div>';
  let h = '<div class="card book-cover"><img class="bk-art" src="img/notebook.webp" alt=""><div class="flex" style="gap:14px"><div class="ring" style="--p:' + Math.round(readN / SECS.length * 100) + '"><span class="num">' + readN + '/' + SECS.length + '</span></div><div><b style="font-size:18px">' + (c ? c.f + ' ' : '') + esc(t.place) + ' 여행 수첩</b><div class="muted">떠나기 전에 한 칸씩 읽고 「읽었어요」를 눌러요. ' + esc(ME) + ' 님 진도예요.</div></div></div>' +
    '<div class="chips" style="margin-top:12px">' + SECS.map(([k, e, n]) => '<a class="chipbtn' + (bookRead(t, k) ? ' on' : '') + '" href="#" data-act="book-jump" data-v="' + k + '">' + e + ' ' + n + '</a>').join('') + '</div></div>';
  h += bookCard(t);
  h += memoHtml(t);
  // 비상
  const hb = live('bookings', t.id).find(b => b.kind === '숙소');
  h += head('sos', '🆘', '비상 연락') + '<div class="card"><div class="facts">' + (c ? c.sos.map(s => '<div><span>' + esc(s[0]) + '</span><b><a href="tel:' + esc(s[1]) + '">' + esc(s[1]) + '</a></b></div>').join('') : '') +
    '<div><span>영사콜센터 (24시간, 한국어)</span><b><a href="tel:' + CONSUL + '">' + CONSUL + '</a></b></div>' +
    sosMore.map(s => '<div><span>' + esc(s[0]) + '<br><small>' + esc(s[2]) + '</small></span><b><a href="tel:' + esc(s[1]) + '">' + esc(s[1]) + '</a></b></div>').join('') +
    (hb ? '<div><span>우리 숙소</span><b>' + esc(hb.title) + (hb.place ? '<br><small>' + esc(hb.place) + '</small>' : '') + '</b></div>' : '') +
    live('bookings', t.id).filter(b => b.kind === '보험').map(b => '<div><span>여행자보험 · 해외 도움</span><b>' + esc(b.provider || b.title) + (b.phone ? '<br><a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a>' : '<br><small>보험사 앱 → 해외 사고·병원 도움</small>') + (b.code ? '<br><small>증권 ' + esc(b.code) + '</small>' : '') + '</b></div>').join('') +
    '<div><span>카드를 잃어버렸을 때</span><b><small>카드사 앱 → 분실 신고 (해외에서도 24시간) · 트래블카드는 앱에서 바로 잠그기</small></b></div>' +
    '<div><span>가족 모임 장소 (길을 잃으면)</span><b>' + esc(t.meet || '숙소 앞에서 만나요') + '</b></div></div><div class="muted small" style="margin-top:8px">전화번호를 누르면 바로 걸려요. 해외에서 한국 번호로 걸 땐 요금이 붙어요.</div></div></div>';
  // 서류
  h += head('docs', '🛂', '여권·서류') + '<div class="stack"><button class="alert" style="--cc:var(--sky)" data-act="tab" data-v="passport"><img class="alert-art" src="img/pass-cover.webp" alt=""><span><b>가족 여권 정보</b><span>여권 사진을 고르면 번호·만료일이 저절로 적혀요 (드라이브 「여권」 폴더에만 보관)</span></span></button>' +
    '<button class="alert" style="--cc:var(--mint)" data-act="tab" data-v="wallet">' + pic(['ticket', 'var(--mint)', 'ticket'], 44) + '<span><b>티켓 지갑</b><span>항공권·숙소·티켓·주차 예약</span></span></button></div></div>';
  // 날씨·코디
  h += head('wx', '🌤️', '날씨와 옷차림') + '<div class="card"><div class="between"><b>' + (known.length ? '여행 날 낮 ' + avgMax + '° · 아침 ' + avgMin + '°' : longAgo(t) ? '다녀온 여행이라 날씨는 쉬어요' : '날씨를 불러오는 중') + '</b><button class="linkbtn" data-act="tab" data-v="weather">날짜·시간별 ›</button></div>' +
    (known.length && !known.every(x => x.real) ? '<div class="muted small">지난 몇 해 같은 날의 평균이에요. 실제 예보는 출발 16일 전부터 바뀌어요.</div>' : '') +
    outfitBlock(t, avgMax, avgMin, known.length && known.reduce((q, x) => q + (x.rainP || 0), 0) / known.length > 45) + '</div></div>';
  // 말
  h += head('talk', '🗣️', '꼭 쓰는 말 · ' + ph.lang) + '<button class="alert" style="--cc:var(--sky);margin-bottom:10px" data-act="tr-open"><span class="ib" style="--cc:var(--sky)">🗣️</span><span><b>번역기 · 사진 번역</b><span>하고 싶은 말을 바로 옮기고, 메뉴판·성분표·안내판은 찍어서 읽어요</span></span></button><div class="muted small" style="margin:-4px 2px 8px">한글로 읽는 법이 함께 있어요. 카드를 누르면 뜻이 보여요. 소리 단추를 누르면 현지 말소리로 들려줘요. 외운 것은 ✓</div>' + ph.groups.map(([gname, list]) =>
    '<div class="card" style="margin-bottom:10px"><b>' + esc(gname) + '</b><div class="phrases">' + list.map((p, i) => { const k = 'ph.' + gname + '.' + i, got = !!LS.get(BKEY(t, k), false);
      return '<div class="phrase' + (got ? ' got' : '') + '"><button class="ph-face" data-act="flip"><span class="jp">' + esc(p[0]) + '</span><span class="ko">' + esc(p[1]) + '</span><span class="mean">' + esc(p[2]) + '</span></button><button class="ph-say" data-act="ph-say" data-v="' + esc(String(p[0]).replace(/〇〇/g, '').replace(/\s*\/\s*/g, '、')) + '" data-l="' + esc((TR_LANG[cc0] || TR_LANG.US)[2]) + '" aria-label="소리로 듣기">' + ic('speaker') + '</button><button class="ph-got" data-act="phrase-got" data-v="' + esc(k) + '" aria-label="외웠어요">' + (got ? '✓' : '') + '</button></div>'; }).join('') + '</div></div>').join('') + '</div>';
  // 주의할 점
  const cau = (G.CAUTION || {})[cc0] || [];
  if (cau.length) {
    const grp = {}; cau.forEach(x => (grp[x[0]] = grp[x[0]] || []).push(x));
    h += head('caution', '⚠️', '현지 주의할 점') + Object.keys(grp).map(g => '<div class="card caution" style="margin-bottom:10px"><b class="cau-g">' + esc(g) + '</b>' + grp[g].map(([, e, a, b]) => '<div class="cau"><span class="cau-e">' + e + '</span><div><b>' + esc(a) + '</b><span>' + esc(b) + '</span></div></div>').join('') + '</div>').join('') + '</div>';
  } else h += head('caution', '⚠️', '현지 주의할 점') + '<div class="card muted">이 나라 자료는 아직 없어요. 「여행 팁」에 직접 모아 주세요.</div></div>';
  // 문화
  h += head('culture', '🎌', '알아 둘 문화') + (cul.length ? '<div class="stack">' + cul.map(([a, b]) => '<div class="card"><b>' + esc(a) + '</b><p style="margin:6px 0 0">' + esc(b) + '</p></div>').join('') + '</div>' : '<div class="card muted">이 나라 자료는 아직 없어요. 「여행 팁」에 직접 모아 주세요.</div>') + '</div>';
  // 돈
  h += head('money', '💱', '돈·환율') + (t.cur && t.cur !== 'KRW' ? infoCards(t, true, 'fx') : '<div class="card muted">원화로 쓰는 여행이에요</div>') + '<div class="card" style="margin-top:10px"><div class="facts"><div><span>현금</span><b>현금만 받는 가게에 대비해 조금 챙겨요</b></div><div><span>카드</span><b>해외 결제 수수료가 적은 카드·트래블카드</b></div></div></div></div>';
  // 기본
  h += head('basic', '🔌', '기본 정보') + (c ? '<div class="card"><div class="facts">' + [['나라', c.f + ' ' + c.n], ['돈', unit(c.cur) + ' (' + c.cur + ')'], ['시차', c.tz], ['전기', c.volt], ['팁', c.tip], ['참고', c.etc]].filter(x => x[1]).map(x => '<div><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div></div>' : '<div class="card muted">여행 정보 고치기에서 나라를 골라 주세요</div>') + '</div>';
  // 가 볼 곳
  const spots = recs.filter(r => r.kind === '명소' || r.kind === '맛집');
  h += head('spots', '⭐', '가 볼 곳 미리 공부') + (spots.length ? '<div class="stack">' + spots.map(r => '<div class="card"><div class="flex">' + ib(RC_IC[r.kind] || 'recs', cc(RECC[r.kind])) + '<div style="flex:1;min-width:0"><b>' + esc(r.name) + '</b><div class="muted small">' + esc(r.kind) + (r.area ? ' · ' + esc(r.area) : '') + (r.price ? ' · ' + esc(r.price) : '') + '</div></div></div>' + (r.desc ? '<p style="margin:8px 0 0">' + esc(r.desc) + '</p>' : '') + '</div>').join('') + '</div>' : '<div class="card muted">일정 → 가고 싶은 곳에 자료를 모으면 여기서 공부해요</div>') + '</div>';
  // 팁
  const tips = recs.filter(r => r.kind === '팁'), itemTips = live('items', t.id).filter(i => i.tip).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  h += head('tips', '💡', '여행 팁') + '<div class="card">' + tips.map(r => '<div class="row"><span class="body"><div class="t">' + esc(r.name) + '</div><div class="m">' + esc(r.desc) + '</div></span><button class="iconbtn" style="box-shadow:none" data-act="rec-edit" data-v="' + esc(r.id) + '" aria-label="고치기">' + ic('pen') + '</button></div>').join('') +
    itemTips.map(i => '<div class="row"><span class="body"><div class="t">' + esc(md(i.date)) + ' ' + esc(i.title) + '</div><div class="m">💡 ' + esc(i.tip) + '</div></span></div>').join('') +
    '<button class="btn wide" style="margin-top:8px" data-act="tip-new">＋ 팁 더하기</button></div></div>';
  return h;
}

/* ---------- 여행책 (book-<도시>.js) — 책처럼 넘겨 읽기 · PDF·EPUB 받기 ---------- */
const bookFor = t => { const B = window.TRIPBOOK || {}; return Object.values(B).find(b => b && b.match && b.match.test((t.place || '') + ' ' + (t.title || '') + ' ' + t.id)) || null; };
const RB_KEY = t => 'rb.' + t.id + '.' + ME;
const RB_T10 = t => 'rb.t10.' + t.id + '.' + ME;
const RB_FS = ['', 'l', 'xl'];
const rbFs = () => { const v = LS.get('rb.fs', ''); return RB_FS.includes(v) ? v : ''; };
let RB = null; // { t, b, P, chs, i, h }
const RB_CAT = { 이동: '🚃', 관광: '📍', 식사: '🍽️', 간식: '🍡', 숙소: '🏨', 쇼핑: '🛍️', 주차: '🅿️', 기타: '•' };
const rbItems = t => live('items', t.id).filter(i => i.title).sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
function rbBuild(t, b) {
  const P = [{ k: 'cover' }, { k: 'toc' }];
  const days = daysOf(t), items = rbItems(t);
  const ours = days.map((d, n) => ({ h: (n + 1) + '일째 · ' + md(d), day: d, see: [] })).filter(p => items.some(i => i.date === p.day));
  if (live('recs', t.id).some(r => r.kind === '명소' || r.kind === '맛집')) ours.push({ h: '가 보고 싶은 곳', recs: 1, see: [] });
  const chs = b.chapters.concat(ours.length ? [{ id: 'ours', ic: '📅', t: '우리 일정과 이어 보기', cover: 'route-cover', intro: '앱의 일정에서 바로 가져와요. 일정을 누르면 길찾기·영업시간이 있는 자세한 보기가 열리고, 「📖」를 누르면 그곳을 다룬 쪽으로 가요.', pages: ours }] : [])
    .concat([{ id: 'end', ic: '🎒', t: '맺음', cover: 'book/ch-end', intro: '퀴즈와 이 책을 만든 자료', pages: b.ending }]);
  chs.forEach((c, ci) => { c.at = P.length; c.no = ci + 1; P.push({ k: 'open', c }); c.pages.forEach(p => P.push({ k: 'page', c, p })); });
  const idx = []; P.forEach((x, i) => { if (x.k === 'page') (x.p.see || []).forEach(w => idx.push([w, i])); });
  idx.sort((a, b2) => b2[0].length - a[0].length);
  return { P, chs, idx };
}
const rbFind = (R, text) => { const s = String(text || ''); const m = R.idx.find(([w]) => s.includes(w)); return m ? m[1] : -1; };
const rbItemText = i => (i.title || '') + ' ' + (i.place || '') + ' ' + (i.addr || '');
/** 한 쪽 그리기 — st(정적)은 PDF·EPUB용: 누르는 단추 없이 */
function rbPageHtml(R, t, b, i, st) {
  const x = R.P[i]; if (!x) return '';
  const go = (n, label) => st ? '<a class="rb-pn" href="#rbp-' + n + '">' + label.replace(/<em class="num">\d+<\/em>/, '').replace(/ \d+쪽$/, ' 읽기') + '</a>' : '<button class="rb-pn" data-rb="go" data-v="' + n + '">' + label + '</button>';
  const sid = st ? ' id="rbp-' + i + '"' : '';
  if (x.k === 'cover') return '<section class="rb-pg rb-cover"' + sid + '><img class="rb-cimg" src="img/' + b.cover + '.webp" alt=""><div class="rb-cin"><small>하하가족여행 문고 · ' + esc(b.ed) + '</small><h1>' + esc(b.title) + '</h1><p>' + esc(b.sub) + '</p><div class="rb-who">' + (t.members || []).map(n => '<span>' + esc((fam(n) || {}).role || n) + '</span>').join('') + '</div>' + (st ? '' : '<button class="rb-start" data-rb="go" data-v="1">펼치기 ›</button>') + '</div></section>';
  if (x.k === 'toc') return '<section class="rb-pg"' + sid + '><div class="rb-run">차례</div><h2>차례</h2><ol class="rb-toc">' + R.chs.map(c => '<li>' + (st ? '<a href="#rbp-' + c.at + '">' : '<button data-rb="go" data-v="' + c.at + '">') + '<i>' + c.ic + '</i><b>' + esc(c.t) + '</b>' + (st ? '</a>' : '<em class="num">' + (c.at + 1) + '</em></button>') + '</li>').join('') + '</ol>' + (st ? '' : '<p class="small-note">장 이름을 누르면 바로 가요. 읽던 쪽은 저절로 기억해요.</p>') + '</section>';
  if (x.k === 'open') { const c = x.c; return '<section class="rb-pg rb-open"' + sid + '><figure class="rb-oimg"><img src="img/' + c.cover + '.webp" alt="">' + (c.note ? '<figcaption>' + esc(c.note) + '</figcaption>' : '') + '</figure><div class="rb-oin"><small>' + (c.id === 'end' ? '' : '제 ' + c.no + ' 장') + '</small><h2><i>' + c.ic + '</i> ' + esc(c.t) + '</h2><p>' + esc(c.intro || '') + '</p><ul class="rb-olist">' + c.pages.map((p, k) => '<li>' + go(c.at + 1 + k, esc(p.h) + '<em class="num">' + (c.at + 2 + k) + '</em>') + '</li>').join('') + '</ul></div></section>'; }
  const c = x.c, p = x.p;
  let body = p.b || '';
  if (p.day) body = '<div class="rb-day">' + rbItems(t).filter(it => it.date === p.day).map(it => { const n = rbFind(R, rbItemText(it)); const row = '<span class="rb-it-t num">' + esc(it.time || '') + '</span><span class="rb-it-b"><b>' + (RB_CAT[it.cat] || '•') + ' ' + esc(it.title) + '</b>' + (it.place ? '<small>' + esc(it.place) + '</small>' : '') + '</span>';
    return '<div class="rb-it">' + (st ? '<span class="rb-it-m">' + row + '</span>' : '<button class="rb-it-m" data-act="item-view" data-v="' + esc(it.id) + '">' + row + '</button>') + (n > 0 ? go(n, '📖 ' + (n + 1) + '쪽') : '') + '</div>'; }).join('') + '</div>';
  if (p.recs) body = '<p>일정 → 「가고 싶은 곳」에 모은 자료예요.</p><div class="rb-day">' + live('recs', t.id).filter(r => r.kind === '명소' || r.kind === '맛집').map(r => { const n = rbFind(R, (r.name || '') + ' ' + (r.area || '')); return '<div class="rb-it"><span class="rb-it-m"><span class="rb-it-b"><b>' + (r.kind === '맛집' ? '🍽️ ' : '⭐ ') + esc(r.name) + '</b><small>' + esc([r.area, r.desc].filter(Boolean).join(' · ')) + '</small></span></span>' + (n > 0 ? go(n, '📖 ' + (n + 1) + '쪽') : '') + '</div>'; }).join('') + '</div>';
  const more = (p.more || []).map(([k, tt, u]) => { const href = k === 'yt' ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(u) : k === 'wiki' ? 'https://ko.wikipedia.org/w/index.php?search=' + encodeURIComponent(u) : u;
    return '<a class="rb-ln ' + k + '" href="' + esc(href) + '" target="_blank" rel="noopener"><i>' + (k === 'yt' ? '▶' : '📖') + '</i><span>' + esc(tt) + '<small>' + (k === 'yt' ? '유튜브에서 영상 찾기' : k === 'wiki' ? '위키백과 · 더 깊은 글' : esc(String(u).replace(/^https?:\/\/(www\.)?/, '').split('/')[0])) + '</small></span></a>'; }).join('');
  const ours = (p.see || []).length && !p.day ? rbItems(t).filter(it => (p.see || []).some(w => rbItemText(it).includes(w))).slice(0, 4) : [];
  return '<section class="rb-pg"' + sid + '><div class="rb-run">' + c.ic + ' ' + esc(c.t) + '</div><h2>' + esc(p.h) + '</h2><div class="rb-body">' + body + '</div>' +
    (ours.length ? '<div class="rb-ours"><b>📅 우리 일정에서</b>' + ours.map(it => (st ? '<span' : '<button data-act="item-view" data-v="' + esc(it.id) + '"') + ' class="rb-oi"><em class="num">' + esc(md(it.date)) + ' ' + esc(it.time || '') + '</em> ' + esc(it.title) + (st ? '</span>' : '</button>')).join('') + '</div>' : '') +
    (more ? '<div class="rb-more"><b>🔗 더 보고 싶다면</b>' + more + '</div>' : '') + (st ? '' : '<div class="rb-folio num">' + (i + 1) + '</div>') + '</section>';
}
const rbWide = () => matchMedia('(min-width: 1000px) and (min-height: 560px)').matches;
function rbPaint(dir) {
  if (!RB) return;
  const R = RB, n = R.P.length, wide = rbWide();
  R.i = Math.max(0, Math.min(n - 1, R.i)); if (wide && R.i % 2) R.i--;
  const el = $('#reader'); if (!el) return;
  const pages = wide ? [R.i, R.i + 1] : [R.i];
  const sh = el.querySelector('.rb-sheet');
  sh.className = 'rb-sheet' + (wide ? ' spread' : '') + (dir ? ' in-' + dir : '');
  sh.innerHTML = pages.map(k => k < n ? '<div class="rb-leaf">' + rbPageHtml(R, R.t, R.b, k) + '</div>' : '<div class="rb-leaf blank"></div>').join('');
  const t10 = LS.get(RB_T10(R.t), []);
  sh.querySelectorAll('.rb-leaf').forEach(l => {
    l.scrollTop = 0;
    l.querySelectorAll('.rb-top10 li').forEach((li, k) => { li.dataset.rb = 't10'; li.dataset.v = k; li.setAttribute('role', 'checkbox'); li.setAttribute('aria-checked', t10.includes(k)); li.classList.toggle('done', t10.includes(k)); });
    const more = () => l.classList.toggle('more', l.scrollHeight - l.clientHeight - l.scrollTop > 24);
    l.addEventListener('scroll', more, { passive: true }); setTimeout(more, 60);
  });
  const x = R.P[R.i]; el.querySelector('.rb-ttl').textContent = x.c ? x.c.ic + ' ' + x.c.t : R.b.title;
  const last = Math.min(n, R.i + pages.length);
  el.querySelector('.rb-prog i').style.width = Math.round(last / n * 100) + '%';
  el.querySelector('.rb-prog span').textContent = (wide && R.i + 1 < n ? (R.i + 1) + '–' + last : (R.i + 1)) + ' / ' + n;
  el.querySelector('[data-rb="prev"]').disabled = R.i <= 0; el.querySelector('[data-rb="next"]').disabled = last >= n;
  LS.set(RB_KEY(R.t), R.i);
}
function rbTurn(d) { if (!RB) return; const step = rbWide() ? 2 : 1, ni = RB.i + d * step; if (ni < 0 || ni >= RB.P.length) return; RB.i = ni; buzz(); rbPaint(matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : d > 0 ? 'next' : 'prev'); }
function rbGo(i) { if (!RB) return; RB.i = i; rbPaint('next'); }
function rbOpen(t, at) {
  const b = bookFor(t); if (!b) return toast('이 여행의 책은 아직 없어요');
  if (RB) rbClose(true);
  const R = rbBuild(t, b), saved = LS.get(RB_KEY(t), 0);
  RB = Object.assign(R, { t, b, i: at != null ? at : (+saved || 0), h: false });
  const el = document.createElement('div'); el.id = 'reader'; el.className = 'rb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', b.title);
  el.innerHTML = '<div class="rb-top"><button class="rb-x" data-rb="close" aria-label="책 닫기">' + ic('back') + '</button><div class="rb-ttl"></div><button class="rb-tb rb-fs" data-rb="fs" aria-label="글자 크기">가<small>가</small></button><button class="rb-tb" data-rb="go" data-v="1">차례</button><button class="rb-tb" data-act="rb-get" aria-label="PDF·EPUB 받기">⋯</button></div>' +
    '<div class="rb-stage"><div class="rb-sheet"></div></div>' +
    '<div class="rb-bot"><button class="rb-nb" data-rb="prev" aria-label="앞 쪽">‹</button><div class="rb-prog"><i></i><span class="num"></span></div><button class="rb-nb" data-rb="next" aria-label="다음 쪽">›</button></div>';
  el.dataset.fs = rbFs();
  document.body.appendChild(el); document.body.classList.add('rb-on'); document.body.style.overflow = 'hidden';
  if (!POP_SKIP) { history.pushState({ rb: 1 }, ''); RB.h = true; }
  el.addEventListener('click', e => {
    const b2 = e.target.closest('[data-rb]'); if (!b2) return;
    const a = b2.dataset.rb;
    if (a === 't10') { const k = +b2.dataset.v, cur = LS.get(RB_T10(RB.t), []), on = !cur.includes(k); LS.set(RB_T10(RB.t), on ? cur.concat(k) : cur.filter(x => x !== k)); b2.classList.toggle('done', on); b2.setAttribute('aria-checked', on); if (on) buzz(); return; }
    if (a === 'fs') { const n = RB_FS[(RB_FS.indexOf(rbFs()) + 1) % RB_FS.length]; LS.set('rb.fs', n); el.dataset.fs = n; toast(['보통 글씨', '큰 글씨', '아주 큰 글씨'][RB_FS.indexOf(n)]); return; }
    if (a === 'close') rbClose(); else if (a === 'prev') rbTurn(-1); else if (a === 'next') rbTurn(1); else if (a === 'go') rbGo(+b2.dataset.v);
  });
  // 쓸어 넘기기 (옆으로) — 위아래는 쪽 안에서 스크롤
  const stage = el.querySelector('.rb-stage'); let sx = 0, sy = 0, dx = 0, on = false, lock = '';
  stage.addEventListener('touchstart', e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; dx = 0; on = true; lock = ''; }, { passive: true });
  stage.addEventListener('touchmove', e => { if (!on) return; const p = e.touches[0]; const ddx = p.clientX - sx, ddy = p.clientY - sy; if (!lock && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) lock = Math.abs(ddx) > Math.abs(ddy) * 1.2 ? 'x' : 'y'; if (lock === 'x') { dx = ddx; el.querySelector('.rb-sheet').style.transform = 'translateX(' + dx * .6 + 'px)'; } }, { passive: true });
  stage.addEventListener('click', e => { if (lock === 'x' || e.target.closest('a,button,[data-rb],[data-act],summary,details,input')) return; const r = stage.getBoundingClientRect(), x = e.clientX - r.left; if (x < r.width * .16) rbTurn(-1); else if (x > r.width * .84) rbTurn(1); });
  stage.addEventListener('touchend', () => { if (!on) return; on = false; const sh = el.querySelector('.rb-sheet'); sh.style.transform = ''; if (lock === 'x' && Math.abs(dx) > 55) rbTurn(dx < 0 ? 1 : -1); });
  rbPaint('');
}
function rbClose(fromNav) {
  if (!RB) return;
  const h = RB.h; RB = null;
  const el = $('#reader'); if (el) el.remove();
  document.body.classList.remove('rb-on'); if ($('#sheet').hidden) document.body.style.overflow = '';
  if (h && !fromNav) { POP_SKIP = true; history.back(); }
}
window.addEventListener('resize', () => { if (RB) rbPaint(''); });
document.addEventListener('keydown', e => {
  if (!RB || !$('#sheet').hidden || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); rbTurn(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); rbTurn(-1); }
  else if (e.key === 'Escape') rbClose();
  else if (e.key === 'Home') rbGo(0);
});
function bookCard(t) {
  const b = bookFor(t); if (!b) return '';
  const R = rbBuild(t, b), saved = +LS.get(RB_KEY(t), 0) || 0;
  return '<div class="card rb-card"><button class="rb-cv" data-act="rb-open" aria-label="' + esc(b.title) + ' 펼치기"><img src="img/' + b.cover + '.webp" alt=""><span class="rb-cvt"><small>하하가족여행 문고</small><b>' + esc(b.title) + '</b><em>' + esc(b.sub) + '</em></span></button>' +
    '<div class="rb-cb"><b>📖 ' + esc(b.title) + '</b><div class="muted small">' + R.chs.length + '장 · ' + R.P.length + '쪽 · 일본 역사부터 교토 하루까지, 사진·지도·영상 링크와 함께</div>' +
    '<div class="flex rb-cbtn"><button class="btn pri" data-act="rb-open">' + (saved > 1 ? '이어 읽기 · ' + (saved + 1) + '쪽' : '책 펼치기') + '</button>' + (saved > 1 ? '<button class="btn" data-act="rb-open" data-v="0">처음부터</button>' : '') + '<button class="btn" data-act="rb-get">PDF·EPUB</button></div></div></div>';
}
function rbGetSheet(t) {
  openSheet('<h2>여행책 받아 두기</h2><p class="muted">인터넷이 없는 비행기 안에서도 읽을 수 있게 파일로 받아요. 영상·자료 링크는 파일 안에서도 눌러져요.</p><div class="newpick">' +
    '<button data-act="rb-pdf">' + ib('book', 'var(--coral)') + '<span><b>PDF로 받기</b><small>인쇄 창이 열리면 「PDF로 저장」을 골라요 (A5 책 크기)</small></span></button>' +
    '<button data-act="rb-epub">' + ib('book', 'var(--sky)') + '<span><b>EPUB(전자책)으로 받기</b><small>애플 북스·구글 플레이 북·리디 같은 전자책 앱에서 열려요</small></span></button></div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
/* 정적 쪽 모음 (PDF·EPUB) — 접힌 퀴즈는 펴고, 그림은 바로 불러요 */
function rbStatic(t, inert) {
  const b = bookFor(t), R = rbBuild(t, b);
  const doc = inert ? document.implementation.createHTMLDocument('') : document; // 전자책은 그림을 불러오지 않는 빈 문서에서
  const wrap = doc.createElement('div');
  wrap.innerHTML = R.P.map((x, i) => rbPageHtml(R, t, b, i, true)).join('');
  wrap.querySelectorAll('details').forEach(d => { const q = doc.createElement('div'); q.className = 'rb-quiz open'; q.innerHTML = '<p class="q">' + d.querySelector('summary').innerHTML + '</p>' + Array.from(d.children).filter(c => c.tagName !== 'SUMMARY').map(c => c.outerHTML).join(''); d.replaceWith(q); });
  wrap.querySelectorAll('img').forEach(im => im.removeAttribute('loading'));
  return { b, R, wrap };
}
async function rbPdf(t) {
  closeSheet();
  const { b, wrap } = rbStatic(t);
  wrap.id = 'rb-print'; wrap.className = 'rb-print';
  document.body.appendChild(wrap); document.body.classList.add('rb-printing');
  toast('책을 준비하고 있어요…');
  await Promise.all(Array.from(wrap.querySelectorAll('img')).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 8000); })));
  const old = document.title; document.title = b.title + ' — 하하가족여행';
  const done = () => { document.title = old; wrap.remove(); document.body.classList.remove('rb-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (e) { toast('이 화면에서는 인쇄 창을 열 수 없어요. 사파리·크롬으로 열어 주세요'); done(); } setTimeout(() => { if (document.body.classList.contains('rb-printing') && !matchMedia('print').matches) done(); }, 60000); }, 300);
}
/* EPUB 3 — 압축 없는 zip을 직접 만들어요 */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(10, 0x00210000, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint32(12, 0x00210000, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  });
  const csz = cen.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cen, [new Uint8Array(e.buffer)]), { type: 'application/epub+zip' });
}
async function toJpeg(src) {
  const r = await fetch(src); const bl = await r.blob(); const bm = await createImageBitmap(bl);
  const cv = document.createElement('canvas'), s = Math.min(1, 1000 / Math.max(bm.width, bm.height)); cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bm, 0, 0, cv.width, cv.height);
  const jb = await new Promise(res => cv.toBlob(res, 'image/jpeg', .82)); return new Uint8Array(await jb.arrayBuffer());
}
const EPUB_CSS = 'body{font-family:serif;line-height:1.75;margin:0 4%;word-break:keep-all}h1{font-size:1.8em}h2{font-size:1.35em;margin:.4em 0 .6em}.rb-run{font-size:.75em;color:#8a7a66}.lead{font-size:1.08em;border-left:4px solid #e9a36b;padding-left:.7em}figure{margin:1em 0}figure img{max-width:100%}figcaption{font-size:.8em;color:#666}figcaption small{display:block}.rb-art.small img{width:30%;float:right;margin:0 0 .5em .8em}.rb-box{border:1px solid #e5d9c7;border-radius:8px;padding:.6em .9em;margin:1em 0;background:#fbf6ee}.rb-voice{background:#eef4fc}.rb-judge{background:#f3effc;border-left:4px solid #9b7bf2}.rb-tip{background:#ecf8f3}.rb-box>b{display:block;margin-bottom:.3em}.rb-facts div{border-bottom:1px solid #eee;padding:.35em 0}.rb-facts span{display:block;font-size:.85em;color:#777}.rb-tl{padding-left:1.2em}.rb-tl em{font-style:normal;font-weight:bold;margin-right:.5em}.rb-chk{font-size:.75em;color:#9a6400}.rb-era span{display:inline-block;border:1px solid #ddd;border-radius:6px;padding:.2em .5em;margin:.15em}.rb-era small{display:block;font-size:.75em;color:#777}.rb-lines div{margin:.4em 0}.rb-lines i{display:inline-block;color:#fff;font-style:normal;font-weight:bold;padding:0 .4em;border-radius:4px;margin-right:.4em}.rb-lines b{margin-right:.4em}.rb-more{border-top:1px dashed #ccc;margin-top:1.2em;padding-top:.6em}.rb-more a{display:block;margin:.4em 0;color:#b4232a}.rb-more small{display:block;color:#777;font-size:.8em}.rb-more i{font-style:normal;margin-right:.4em}.rb-ours{font-size:.9em;color:#555}.rb-ours span{display:block}.rb-it{border-bottom:1px solid #eee;padding:.4em 0}.rb-it-t{display:inline-block;min-width:3.2em;font-weight:bold}.rb-it small{display:block;color:#777}.rb-pn{font-size:.8em;color:#8a7a66;margin-left:.5em}.rb-folio{text-align:center;color:#aaa;font-size:.8em;margin-top:1.5em}.rb-cover{text-align:center}.rb-cover img{max-width:100%}.rb-who span{margin:0 .3em}.rb-toc li,.rb-olist li{margin:.3em 0}.rb-toc i,.rb-olist i,.rb-toc em,.rb-olist em{font-style:normal;margin:0 .4em}.rb-map{width:100%;height:auto}.m-land{fill:#f6f1e7}.m-sea{fill:#cfe3f5}.m-river{fill:none;stroke:#9cc4ea;stroke-width:4}.m-line{fill:none;stroke-width:3}.m-pt{fill:#ff7a59;stroke:#fff;stroke-width:2}.m-pt.us{fill:#4c8df6}.m-tx{font-size:12px;fill:#333}.m-area{font-size:13px;fill:#8a7a66;font-weight:bold}.m-note,.m-lt{font-size:10px;fill:#999}.m-n path{fill:#555}.m-n text{font-size:10px}.rb-quiz .q{font-weight:bold;margin-bottom:0}.rb-ref img{width:40%}.rb-credits{font-size:.85em}.small-note{font-size:.85em;color:#777}.rb-oimg img{width:100%}.rb-top10 li{margin:.4em 0}.rb-top10 i{font-style:normal;margin-right:.4em}.rb-top10 small{display:block;color:#777;font-size:.8em}';
async function rbEpub(t) {
  closeSheet(); toast('전자책을 만들고 있어요…');
  try {
    const { b, R, wrap } = rbStatic(t, true);
    const doc = wrap.ownerDocument;
    const imgs = new Map(); let nImg = 0;
    const secs = Array.from(wrap.children);
    // 장마다 한 파일: 표지 · 차례 · 장(여는 쪽 + 쪽들)
    const groups = [{ id: 'cover', t: '표지', els: [secs[0]], from: 0, to: 1 }, { id: 'toc', t: '차례', els: [secs[1]], from: 1, to: 2 }];
    R.chs.forEach((c, ci) => groups.push({ id: 'c' + (ci + 1), t: c.t, els: secs.slice(c.at, c.at + 1 + c.pages.length), from: c.at, to: c.at + 1 + c.pages.length }));
    const ser = new XMLSerializer();
    const files = [{ name: 'mimetype', data: 'application/epub+zip' }, { name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' }];
    const man = [], spine = [];
    for (const g of groups) {
      const box2 = doc.createElement('div'); g.els.forEach(e => box2.appendChild(e));
      for (const im of box2.querySelectorAll('img')) { const src = im.getAttribute('src'); if (!imgs.has(src)) imgs.set(src, 'img/p' + (++nImg) + '.jpg'); im.setAttribute('src', imgs.get(src)); }
      box2.querySelectorAll('a[href^="#rbp-"]').forEach(a => { const n = +a.getAttribute('href').slice(5), gi = groups.findIndex(g2 => g2.from <= n && n < g2.to); if (gi >= 0) a.setAttribute('href', groups[gi].id + '.xhtml#rbp-' + n); });
      box2.querySelectorAll('button').forEach(bt => { const s = doc.createElement('span'); s.className = bt.className; s.innerHTML = bt.innerHTML; bt.replaceWith(s); });
      const svg = !!box2.querySelector('svg');
      const inner = Array.from(box2.childNodes).map(n => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
      files.push({ name: 'OEBPS/' + g.id + '.xhtml', data: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko"><head><meta charset="utf-8"/><title>' + esc(g.t) + '</title><link rel="stylesheet" href="style.css"/></head><body>' + inner + '</body></html>' });
      man.push('<item id="' + g.id + '" href="' + g.id + '.xhtml" media-type="application/xhtml+xml"' + (svg ? ' properties="svg"' : '') + '/>'); spine.push('<itemref idref="' + g.id + '"/>');
    }
    let k = 0;
    for (const [src, name] of imgs) { try { files.push({ name: 'OEBPS/' + name, data: await toJpeg(src) }); man.push('<item id="im' + (++k) + '" href="' + name + '" media-type="image/jpeg"' + (src.includes(b.cover) && k === 1 ? ' properties="cover-image"' : '') + '/>'); } catch (e) {} }
    const nav = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko"><head><meta charset="utf-8"/><title>차례</title></head><body><nav epub:type="toc" id="toc"><h1>차례</h1><ol>' + groups.filter(g => g.id !== 'cover').map(g => '<li><a href="' + g.id + '.xhtml">' + esc(g.t) + '</a></li>').join('') + '</ol></nav></body></html>';
    files.push({ name: 'OEBPS/nav.xhtml', data: nav }, { name: 'OEBPS/style.css', data: EPUB_CSS });
    const uidv = 'haha-trip-' + t.id + '-' + Date.now();
    files.push({ name: 'OEBPS/content.opf', data: '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid" xml:lang="ko"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bid">' + uidv + '</dc:identifier><dc:title>' + esc(b.title) + '</dc:title><dc:creator>하하가족여행</dc:creator><dc:language>ko</dc:language><dc:description>' + esc(b.sub) + '</dc:description><meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>' + man.join('') + '</manifest><spine>' + spine.join('') + '</spine></package>' });
    const blob = zipStore(files);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.title.replace(/\s+/g, '') + '.epub'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('전자책을 받았어요. 파일을 열면 전자책 앱으로 읽어요');
  } catch (e) { console.error(e); toast('전자책을 만들지 못했어요'); }
}

/* ---------- 날씨 (날씨 앱처럼 날짜별·시간별) ---------- */
function weatherPage(t) {
  const I = INFO[t.id] || {}, w = I.wx;
  const wx = tripWx(t);
  let sel = UI.wday || (today() >= t.start && today() <= t.end ? today() : t.start);
  if (!wx.some(x => x.d === sel)) sel = t.start;
  UI.wday = sel;
  const cur = w && w.current ? WMO(w.current.weather_code) : null;
  let h = '<div class="card wx-now"><div class="between"><div><div class="muted">' + esc((I.geo && I.geo.name) || t.place) + ' 지금</div><div class="big-num flex" style="gap:8px">' + (cur ? wxi(w.current.weather_code, 52) + Math.round(w.current.temperature_2m) + '°' : '…') + '</div><div class="muted">' + (cur ? cur[1] : '불러오는 중') + '</div></div>' +
    '<div style="text-align:right" class="muted small">' + (I.normal ? '여행 날 평균<br><b class="num" style="font-size:18px;color:var(--ink)">' + I.normal.avgMax + '° / ' + I.normal.avgMin + '°</b><br>지난 ' + I.normal.years + '년 같은 날' : '') + '</div></div></div>';
  h += '<div class="sec"><div class="sec-h"><h3>여행 날마다</h3></div><div class="days">' + wx.map((x, k) => { const ic2 = x.max != null ? wxi(x.code, 40) : '·'; return '<button class="day wxday ' + (x.d === sel ? 'on' : '') + '" data-act="wday" data-v="' + x.d + '"><small>' + (k + 1) + '일째 ' + esc(md(x.d)) + '</small><b>' + ic2 + '</b><span class="num">' + (x.max != null ? x.max + '° / ' + x.min + '°' : '—') + '</span>' + (x.max != null && !x.real ? '<em>평균</em>' : '') + '</button>'; }).join('') + '</div></div>';
  const x = wx.find(y => y.d === sel) || {};
  h += '<div class="card"><div class="between"><b style="font-size:18px" class="flex">' + esc(md(sel)) + ' ' + (x.max != null ? wxi(x.code, 36) + ' ' + WMO(x.code)[1] : '') + '</b>' + (x.max != null ? '<span class="pill ' + (x.real ? 'hot' : '') + '">' + (x.real ? '실시간 예보' : '평균 · 지난 ' + ((INFO[t.id] || {}).normal || {}).years + '년') + '</span>' : '') + '</div>';
  if (x.max != null) h += '<div class="big-num num" style="margin-top:6px">낮 ' + x.max + '° · 아침 ' + x.min + '°</div>' + (x.rainP != null ? '<div class="muted">' + (x.real ? '비 올 확률 ' + x.rainP + '%' : '지난 몇 해 이날 비 온 비율 ' + x.rainP + '%') + '</div>' : '');
  // 시간별
  if (x.real && w.hourly) {
    const hrs = w.hourly.time.map((tm, i) => [tm, i]).filter(([tm]) => tm.startsWith(sel)).filter(([tm]) => Number(tm.slice(11, 13)) % 2 === 0);
    h += '<div class="hourly">' + hrs.map(([tm, i]) => { return '<div><small>' + Number(tm.slice(11, 13)) + '시</small><b>' + wxi(w.hourly.weather_code[i], 30) + '</b><span class="num">' + Math.round(w.hourly.temperature_2m[i]) + '°</span>' + (w.hourly.precipitation_probability[i] > 20 ? '<small>☔' + w.hourly.precipitation_probability[i] + '%</small>' : '') + '</div>'; }).join('') + '</div>';
  } else if (x.max != null) h += '<div class="muted small" style="margin-top:8px">시간별 예보는 출발 16일 전부터 보여요 (' + esc(md(ymd(new Date(pd(sel).getTime() - 15 * 864e5)))) + '쯤). 그때까지는 지난 몇 해 같은 날의 평균을 적어 둬요.</div>';
  h += '</div>';
  h += '<div class="sec"><div class="sec-h"><h3>👕 ' + esc(md(sel)) + ' 우리 가족 옷차림</h3></div><div class="card">' + (x.max != null ? '<div class="pill" style="display:inline-block;margin-bottom:6px">' + esc(GUIDE.LV_NAME[GUIDE.level(x.max, x.min)]) + '</div>' : '') + outfitBlock(t, x.max, x.min, (x.rainP || 0) > 50) + '</div></div>';
  h += '<div class="muted small" style="margin-top:10px">날씨: Open-Meteo 예보·지난 기록. 실제와 다를 수 있어요.</div>';
  return h;
}

/* ---------- 여권 (드라이브 「여권」 폴더에만) ---------- */
async function loadPassports() { try { PASSPORTS = await call('passList'); } catch (e) { PASSPORTS = PASSPORTS || []; toast('여권 정보를 불러오지 못했어요'); } render(); }
const mask = s => String(s || '').replace(/^(.{4}).*$/, (m, a) => a + '•'.repeat(Math.max(0, s.length - 4)));
const MONS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ppDate = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return d || ''; const [y, m, dd] = d.split('-'); return dd + ' ' + Number(m) + '월/' + MONS[Number(m) - 1] + ' ' + y; };
function leftText(from, to) { const n = dayDiff(from, to); if (n < 0) return '만료됨'; const y = Math.floor(n / 365), mo = Math.floor(n % 365 / 30.4); return (y ? y + '년 ' : '') + mo + '개월'; }
function passportPage(t) {
  if (PASSPORTS == null) { loadPassports(); return '<div class="card empty">여권 정보를 불러오는 중…</div>'; }
  const mem = (t.members || []);
  const have = mem.filter(n => PASSPORTS.some(x => x.member === n));
  const soon = PASSPORTS.filter(p => mem.includes(p.member) && p.expiry).sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
  let h = '<div class="tabhead th-pass"><div><small>' + esc(t.title) + '</small><b>가족 여권</b><span>' + have.length + ' / ' + mem.length + '명 등록' + (soon ? ' · 가장 빠른 만료 ' + esc(soon.expiry) + ' (' + esc(soon.member) + ')' : '') + '</span></div><img class="th-art" src="img/pass-cover.webp" alt=""></div>';
  h += '<div class="muted small" style="margin:0 2px 12px">여권 정보는 가족 공용 기록에 넣지 않고 4gospel 드라이브 「하하가족여행/여권」에만 보관돼요. 번호·생년월일은 눌러야 보여요.</div><div class="stack">';
  mem.forEach(n => {
    const p = PASSPORTS.find(x => x.member === n);
    if (!p) { h += '<button class="alert" style="--cc:var(--sun)" data-act="pass-add" data-v="' + esc(n) + '">' + av(n, 44) + '<span><b>' + esc(n) + ' 여권 넣기</b><span>여권 사진을 고르면 번호·영문 이름·날짜를 저절로 읽어요</span></span></button>'; return; }
    const open = UI.reveal === p.id;
    const left = p.expiry ? dayDiff(t.end, p.expiry) : null;
    const st = left == null ? '' : left < 0 ? 'bad' : left < 183 ? 'warn' : 'ok';
    const f = faceOf(n);
    const num = open ? (p.number || '') : mask(p.number);
    const mrz1 = ('P' + (p.type || 'M') + 'KOR' + String(p.surname || '').replace(/\s/g, '<') + '<<' + String(p.given || '').replace(/\s/g, '<') + '<'.repeat(44)).slice(0, 44);
    h += '<div class="ppcard"><div class="pp-top"><span>여권 <i>PASSPORT</i></span><span>대한민국 <i>REPUBLIC OF KOREA</i></span><span class="pp-chip"></span></div>' +
      '<div class="pp-body"><div class="pp-photo">' + (f ? '<img src="img/face-' + f + '-pp.webp" alt="" onerror="this.onerror=null;this.src=\'img/face-' + f + '.webp\'">' : av(n, 80)) + '</div><div class="pp-f">' +
      '<div class="pp-row"><div><small>여권번호 / No.</small><button class="pp-v mono" data-act="pass-reveal" data-v="' + esc(p.id) + '">' + esc(num) + '</button></div></div>' +
      '<div><small>성 / Surname</small><b class="pp-v">' + esc(p.surname || '—') + '</b></div>' +
      '<div><small>이름 / Given names</small><b class="pp-v">' + esc(p.given || '—') + '</b></div>' +
      '<div><small>한글 성명</small><b class="pp-v">' + esc(p.nameKo || n) + '</b></div>' +
      '<div class="pp-row"><div><small>생년월일 / Birth</small><b class="pp-v">' + esc(open ? ppDate(p.birth) : (p.birth ? '•• ••/••• ' + p.birth.slice(0, 4) : '—')) + '</b></div><div><small>성별 / Sex</small><b class="pp-v">' + esc(p.sex || '—') + '</b></div></div>' +
      '<div class="pp-row"><div><small>발급일 / Issue</small><b class="pp-v">' + esc(ppDate(p.issue) || '—') + '</b></div><div><small>만료일 / Expiry</small><b class="pp-v pp-exp ' + st + '">' + esc(ppDate(p.expiry) || '—') + '</b></div></div>' +
      '</div></div><div class="pp-mrz mono">' + esc(mrz1) + '<br>' + esc((open ? (p.number || '') : mask(p.number)).padEnd(9, '<') + '<KOR' + '<'.repeat(31)) + '</div>' +
      '<div class="pp-foot"><span class="pill ' + (st === 'ok' ? '' : 'hot') + '">' + (left == null ? '만료일을 넣어 주세요' : st === 'bad' ? '⚠️ 여행 전에 만료돼요' : st === 'warn' ? '⚠️ 여행 뒤 6개월 안에 만료' : '✓ 만료까지 ' + leftText(today(), p.expiry)) + '</span>' +
      '<span class="flex">' + (safeUrl(p.photoUrl) ? '<a class="btn" href="' + esc(p.photoUrl) + '" target="_blank" rel="noopener">' + ic('link') + '사진</a>' : '') + '<button class="btn" data-act="pass-edit2" data-v="' + esc(p.id) + '">' + ic('pen') + '고치기</button></span></div></div>';
  });
  return h + '</div><div class="muted small" style="margin-top:12px">항공권에 여권 정보를 넣을 때 영문 이름 철자가 여권과 똑같은지 꼭 확인하세요.</div>';
}

const PASS_F = [{ k: 'nameKo', label: '한글 이름' }, { k: 'surname', label: '영문 성', half: 1 }, { k: 'given', label: '영문 이름', half: 1 }, { k: 'number', label: '여권번호' },
  { k: 'expiry', label: '만료일', type: 'date', half: 1 }, { k: 'birth', label: '생년월일', type: 'date', half: 1 }, { k: 'issue', label: '발급일', type: 'date', more: 1 }, { k: 'sex', label: '성별', type: 'opts', options: ['M', 'F'], names: { M: '남', F: '여' }, more: 1 }];
function passForm(rec, ph, read) {
  form(rec.id ? '여권 정보' : rec.member + ' 여권', PASS_F, rec, async vals => {
    if (!vals.number) return toast('여권번호를 확인해 주세요');
    const out = Object.assign({}, rec, vals, { id: rec.id || uid('p') });
    closeSheet(); toast('여권 정보를 저장하는 중…');
    try {
      if (ph && ph.upload) { const r = await ph.upload; if (r && r.url) { out.photoUrl = r.url; out.photoId = r.id; } }
      PASSPORTS = await call('passSave', out); toast('여권 정보를 드라이브에 저장했어요'); render();
    } catch (e) { toast('저장하지 못했어요: ' + e.message); }
  }, rec.id ? async () => { closeSheet(); try { PASSPORTS = await call('passDel', rec.id); render(); toast('여권 정보를 지웠어요'); } catch (e) { toast(e.message); } } : null, { photo: ph, read: read || [] });
}
function passFlow(member) {
  pickPhoto('', async file => {
    let ph;
    try {
      const full = await shrink(file, 1800, .85), thumb = await shrink(file, 300, .6), b64 = full.split(',')[1];
      ph = { b64, thumb, upload: call('photo', b64, 'image/jpeg', '여권-' + member, '여권') };
      ph.upload.catch(() => {});
    } catch (e) { return toast('사진을 열지 못했어요'); }
    openSheet('<h2>여권 읽는 중…</h2><div class="reading"><div class="shimmer"></div><div class="shimmer"></div></div>');
    let f = {};
    try { f = (await call('readPhoto', ph.b64, 'image/jpeg', 'passport')).fields || {}; } catch (e) {}
    passForm(Object.assign({ member }, f), Object.assign({}, ph, { thumb: '' }), Object.keys(f).filter(k => f[k]));
  });
}

/* ---------- 아래 창 ---------- */
let SHEET = null;
/* 창(시트)을 열면 기록 한 칸 — 휴대폰 뒤로가기·쓸어넘기기는 창만 닫고 그 화면에 머묾 */
function openSheet(html, onMount) {
  if (!SHEET_H && !POP_SKIP) { history.pushState({ sheet: 1 }, ''); SHEET_H = true; }
  $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; try { fixOrphans($('#sheet-body')); } catch (e) {}
  const card = $('.sheet-card'); if (card) card.scrollTop = 0; // 새 창은 늘 맨 위부터(앞 창의 스크롤 자리가 남아 중간부터 보이던 것, 2026-11-27)
  document.body.style.overflow = 'hidden'; document.body.classList.add('sheet-open');
  if (onMount) onMount($('#sheet-body'));
}
// 일정 창 제목 줄이기(내리면 작아지며 위에 붙음) — 경계에서 떨리지 않게 48px에서 작아지고 16px에서 커짐
(fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn())(() => { const card = $('.sheet-card'); if (!card) return; card.addEventListener('scroll', () => { const h = card.querySelector('.iv-head'); if (!h) return; const y = card.scrollTop; if (y > 48) h.classList.add('compact'); else if (y < 16) h.classList.remove('compact'); }, { passive: true }); });
function closeSheet(fromNav) {
  if (SHEET_H) { SHEET_H = false; if (!fromNav) { POP_SKIP = true; history.back(); } }
  $('#sheet').hidden = true; $('#sheet-body').innerHTML = ''; SHEET = null; document.body.style.overflow = ''; document.body.classList.remove('sheet-open'); }

/** 칸 목록으로 고치기 창 (read = 사진에서 읽은 칸) */
function form(title, fields, rec, onSave, onDelete, opts) {
  opts = opts || {};
  SHEET = { fields, rec, onSave, onDelete, armed: false, photo: opts.photo || null };
  const read = new Set(opts.read || []);
  const cell = f => {
    const v = rec[f.k] != null && rec[f.k] !== '' ? rec[f.k] : (f.def != null ? f.def : '');
    const id = 'f_' + f.k, rd = read.has(f.k) && v !== '' && v !== 0 ? ' read' : '';
    let x;
    if (f.type === 'textarea') x = '<textarea class="in' + rd + '" id="' + id + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    else if (f.type === 'opts' || f.type === 'multi') {
      const vs = f.type === 'multi' ? (Array.isArray(v) ? v : []) : [f.imgs === 'mood' ? moodKey(v) : v];
      x = '<div class="opts" id="' + id + '" data-type="' + f.type + '">' + f.options.map(o => '<button type="button" class="opt ' + (vs.includes(o) ? 'on' : '') + '" data-opt="' + esc(o) + '">' + (f.imgs ? '<img src="img/' + f.imgs + '-' + esc(o) + '.webp" alt="' + esc(o) + '" width="34" height="34">' : esc(o === '' ? '정하지 않음' : (f.names && f.names[o]) || o)) + '</button>').join('') + '</div>';
    } else if (f.type === 'stars') {
      x = '<div class="starpick" id="' + id + '" data-v="' + (Number(v) || 0) + '">' + [1, 2, 3, 4, 5].map(k => '<button type="button" class="' + (k <= v ? 'on' : '') + '" data-star="' + k + '" aria-label="별 ' + k + '개">★</button>').join('') + '</div>';
    } else x = '<input class="in' + rd + (f.huge ? ' huge' : '') + '" id="' + id + '" type="' + (f.type === 'number' ? 'text' : f.type || 'text') + '"' + (f.type === 'number' ? ' inputmode="decimal"' : '') + ' value="' + esc(f.type === 'number' && v ? comma(v) : v) + '" placeholder="' + esc(f.ph || '') + '"' + (f.list ? ' list="dl_' + f.k + '"' : '') + '>' +
      (f.list ? '<datalist id="dl_' + f.k + '">' + f.list.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist>' : '');
    return '<label class="fl"><span>' + esc(f.label) + (rd ? ' · 사진에서 읽음' : '') + '</span>' + x + '</label>';
  };
  const block = list => { let h = '', row = []; list.forEach(f => { if (f.half) { row.push(cell(f)); if (row.length === 2) { h += '<div class="f2">' + row.join('') + '</div>'; row = []; } } else { if (row.length) { h += '<div class="f2">' + row.join('') + '</div>'; row = []; } h += cell(f); } }); if (row.length) h += '<div class="f2">' + row.join('') + '</div>'; return h; };
  let h = '<h2>' + esc(title) + '</h2>';
  const th = (SHEET.photo && SHEET.photo.thumb) || rec.thumb;
  if (safeImg(th)) h += '<div class="photo-head"><img src="' + th + '" alt=""><div><b>' + (read.size ? '사진에서 읽었어요' : '붙인 사진') + '</b><span>' + (read.size ? '노란 칸이 맞는지 봐 주세요' : '') + (safeUrl(rec.photoUrl) ? ' <a href="' + esc(rec.photoUrl) + '" target="_blank" rel="noopener">원본</a>' : '') + '</span></div></div>';
  h += '<form class="f" data-form="sheet">' + block(fields.filter(f => !f.more));
  const more = fields.filter(f => f.more);
  if (more.length) h += '<details class="more"' + (more.some(f => read.has(f.k) && rec[f.k]) ? ' open' : '') + '><summary>더 적기</summary><div class="f">' + block(more) + '</div></details>';
  if (opts.cover) h += '<div class="flex" style="flex-wrap:wrap"><button type="button" class="btn" data-act="cover-pick">' + ic('camera') + '표지 사진 고르기</button>' + (rec.cover ? '<button type="button" class="btn" data-act="cover-clear">표지 그림으로 되돌리기</button>' : '') + '</div>';
  if (opts.attach) h += '<button type="button" class="btn" data-act="attach">' + ic('camera') + (th ? '사진 바꾸기' : '사진 붙이기') + '</button>';
  if (opts.geo) h += '<button type="button" class="btn" data-act="geo" id="geobtn">' + ic('pin') + (rec.lat ? '지금 위치로 다시 저장' : '지금 위치도 저장 (길찾기용)') + '</button>';
  h += '<div class="sheet-acts">' + (onDelete ? '<button type="button" class="btn danger" data-act="sheet-del">' + ic('trash') + '지우기</button>' : '') +
    '<button type="button" class="btn" data-act="sheet-close">닫기</button><button class="btn pri">저장</button></div></form>';
  openSheet(h, el => { const first = el.querySelector(opts.focus ? '#f_' + opts.focus : 'input.in,textarea.in'); if (first && (!rec.id || opts.focus)) setTimeout(() => first.focus(), 250); });
}
function readForm() {
  const out = {};
  SHEET.fields.forEach(f => {
    const el = document.getElementById('f_' + f.k); if (!el) return;
    if (f.type === 'opts') { const on = el.querySelector('.opt.on'); out[f.k] = on ? on.dataset.opt : ''; }
    else if (f.type === 'multi') out[f.k] = [...el.querySelectorAll('.opt.on')].map(b => b.dataset.opt);
    else if (f.type === 'stars') out[f.k] = Number(el.dataset.v) || 0;
    else if (f.type === 'number') out[f.k] = el.value === '' ? 0 : Number(String(el.value).replace(/[^\d.\-]/g, '')) || 0;
    else out[f.k] = el.value.trim();
  });
  return out;
}

/* 갈래마다 칸 */
const F = {
  trip: () => [
    { k: 'title', label: '여행 이름', ph: '예: 오사카 가족여행' },
    { k: 'place', label: '어디로 (도시)', ph: '예: 오사카 · 교토' },
    { k: 'start', label: '가는 날', type: 'date', half: 1 }, { k: 'end', label: '오는 날', type: 'date', half: 1 },
    { k: 'country', label: '나라 (🇰🇷 한국이면 국내여행)', type: 'opts', options: ['KR', ...Object.keys(COUNTRY).filter(k => k !== 'KR')], names: Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [k, v.f + ' ' + v.n])) },
    { k: 'members', label: '함께 가는 사람', type: 'multi', options: D.meta.family.map(f => f.name) },
    { k: 'cur', label: '현지 돈', type: 'opts', options: Object.keys(CUR), names: CUR, more: 1 },
    { k: 'rate', label: '경비 계산 환율 (현지 돈 100 = 몇 원)', type: 'number', ph: '예: 엔화 950', more: 1 },
    { k: 'memo', label: '메모', type: 'textarea', ph: '숙소·교통·꼭 기억할 것', more: 1 },
    { k: 'kind', label: '어떤 여행', type: 'opts', options: ['', 'family', 'couple', 'culture'], names: { '': '저절로 (함께 간 사람으로)', family: '👨‍👩‍👧‍👦 가족 여행', couple: '💑 부부여행', culture: '🎨 문화 체험 (전시·공연·나들이)' }, more: 1 },
    { k: 'album', label: '구글 포토 앨범 주소 (https://…)', type: 'url', more: 1 },
    { k: 'story', label: '그때 우리는 (다녀온 뒤 이야기)', type: 'textarea', ph: '가장 기억에 남는 순간', more: 1 },
    { k: 'notion', label: '노션 페이지 주소 (https://…)', type: 'url', more: 1 }],
  item: t => [
    { k: 'title', label: '할 일', ph: '예: 후시미 이나리 신사' },
    { k: 'date', label: '날짜 (비우면 날짜 미정)', type: 'date', half: 1 }, { k: 'time', label: '시간', type: 'time', half: 1 },
    { k: 'cat', label: '어떤 일정', type: 'opts', options: CATS },
    { k: 'place', label: '장소 (지도 검색어)', ph: '예: Fushimi Inari Taisha' },
    { k: 'addr', label: '주소 (숙소·식당 등, 있으면)', ph: '예: 大阪市浪速区… 또는 우리말 주소' },
    { k: 'cost', label: '1인 비용 (' + unit(t.cur) + ')', type: 'number' },
    { k: 'memo', label: '메모', type: 'textarea', ph: '가는 길·예약번호' },
    { k: 'tip', label: '💡 여행 팁 (여기서 알아 둘 것)', type: 'textarea', ph: '예: 아침 일찍 가면 한적해요', more: 1 }],
  booking: t => [
    { k: 'kind', label: '어떤 예약', type: 'opts', options: ['항공', '숙소', '티켓', '교통', '주차', '보험', '서류', '기타'] },
    { k: 'title', label: '이름', ph: '예: 인천공항 제1터미널 예약주차장(P5)' },
    { k: 'date', label: '날짜 (입차·체크인)', type: 'date', half: 1 }, { k: 'time', label: '시간', type: 'time', half: 1 },
    { k: 'end', label: '끝 (도착·출차·체크아웃)', ph: '예: 09:50 또는 2027-01-01 13:30' },
    { k: 'code', label: '예약번호', half: 1 }, { k: 'provider', label: '어디서 예약', half: 1 },
    { k: 'place', label: '주소', ph: '예: 숙소·주차장 주소 — 택시 기사님께 보여 줄 때도 써요' }, { k: 'grace', label: '주차 앞뒤 여유 (시간)', type: 'number', ph: '예: 4', half: 1, more: 1 }, { k: 'car', label: '차량번호 (주차)', half: 1, more: 1 }, { k: 'deposit', label: '보증금 (원)', type: 'number', half: 1, more: 1 },
    { k: 'phone', label: '전화', type: 'tel', half: 1, more: 1 }, { k: 'seat', label: '좌석', half: 1, more: 1 },
    { k: 'price', label: '결제 금액 (예산에 들어가요)', type: 'number', half: 1, more: 1 }, { k: 'cur', label: '돈', type: 'opts', options: [...new Set(['KRW', t.cur || 'KRW'])], names: CUR, half: 1, more: 1 },
    { k: 'link', label: '예약 주소 (https://…)', type: 'url', more: 1 },
    { k: 'memo', label: '메모', type: 'textarea', more: 1 }],
  spend: (t, rec) => [
    { k: 'amount', label: '얼마', type: 'number', huge: 1, ph: '0' },
    { k: 'cur', label: '돈', type: 'opts', options: [...new Set([t.cur || 'KRW', 'KRW', rec && rec.cur].filter(c => c && CUR[c]))], names: CUR },
    { k: 'title', label: '어디서 · 무엇을', ph: '예: 구로몬 시장 점심' },
    { k: 'cat', label: '무엇에 썼나', type: 'opts', options: SPEND_CATS, names: SPEND_NAME },
    { k: 'payer', label: '낸 사람', type: 'opts', options: t.members || [] },
    { k: 'pay', label: '어떻게 냈나', type: 'opts', options: PAYS },
    { k: 'share', label: '누구 돈', type: 'opts', options: ['함께', '개인'], names: { 함께: '👨‍👩‍👧‍👦 가족 함께', 개인: '🙋 개인 (내 몫만)' } },
    { k: 'date', label: '날짜', type: 'date', more: 1 },
    { k: 'split', label: '나눠 낼 사람 (나눠 내기일 때)', type: 'multi', options: t.members || [], more: 1 },
    { k: 'memo', label: '메모', type: 'textarea', more: 1 }],
  check: t => [
    { k: 'text', label: '챙길 것', ph: '예: 보조배터리' },
    { k: 'cat', label: '묶음', type: 'opts', options: Object.keys(PREP_CAT) },
    { k: 'owner', label: '누구 짐', type: 'opts', options: ['', ...(t.members || [])], names: { '': '함께 (공통·할 일)' } },
    { k: 'who', label: '맡은 사람 (함께 챙길 짐·할 일)', type: 'opts', options: ['', ...(t.members || [])], more: 1 },
    { k: 'memo', label: '메모', type: 'textarea' }],
  rec: t => [
    { k: 'kind', label: '어떤 곳', type: 'opts', options: ['명소', '맛집', '쇼핑', '숙소', '팁'] },
    { k: 'name', label: '이름' }, { k: 'area', label: '동네', half: 1 }, { k: 'price', label: '값', half: 1 },
    { k: 'desc', label: '설명', type: 'textarea' }, { k: 'hours', label: '여는 시간·휴무', more: 1 },
    { k: 'map', label: '지도 검색어', ph: '예: Kuromon Market', more: 1 }, { k: 'link', label: '누리집 (https://…)', type: 'url', more: 1 }],
  note: t => [
    { k: 'owner', label: '어디에 쓸까요', type: 'opts', options: ['', ME], names: { '': '👨‍👩‍👧‍👦 우리 가족 함께', [ME]: '📔 나만의 다이어리' } },
    { k: 'text', label: '오늘 이야기', type: 'textarea', ph: DIARY_Q[new Date().getDate() % DIARY_Q.length] },
    { k: 'date', label: '날짜', type: 'date', half: 1 }, { k: 'mood', label: '기분', type: 'opts', options: Object.keys(MOOD), imgs: 'mood' }],
  place: t => [
    { k: 'name', label: '곳 이름' }, { k: 'cat', label: '어떤 곳', type: 'opts', options: ['맛집', '명소', '숙소', '쇼핑', '카페'] },
    { k: 'rating', label: '별점', type: 'stars' }, { k: 'memo', label: '한마디', type: 'textarea', ph: '다시 가고 싶나요? 무엇이 맛있었나요?' },
    { k: 'addr', label: '주소', ph: '예: 제주 서귀포시 성산읍 일출로 284-12' },
    { k: 'map', label: '지도 검색어', more: 1 }],
  park: t => [
    { k: 'spot', label: '주차 위치 (크게 보여요)', ph: '예: 지하 2층 C-15 기둥' },
    { k: 'memo', label: '찾아가는 길·표지판', type: 'textarea', ph: '예: 셔틀 정류장 3번 앞, 엘리베이터 오른쪽' },
    { k: 'keyBy', label: '차 키 가진 사람', type: 'opts', options: ['', ...(t.members || [])] },
    { k: 'left', label: '차에 두고 온 것', ph: '예: 겨울 외투 2벌', more: 1 },
    { k: 'date', label: '날짜', type: 'date', half: 1, more: 1 }, { k: 'time', label: '시간', type: 'time', half: 1, more: 1 }]
};
const DIARY_Q = ['오늘 가장 맛있었던 것은?', '오늘 가장 웃겼던 순간은?', '가족에게 고마웠던 일은?', '다시 오고 싶은 곳은?', '오늘 처음 해 본 것은?', '사진으로 못 담은 장면은?', '내일 꼭 하고 싶은 것은?'];
const TITLE = { item: '일정', booking: '예약·티켓', spend: '쓴 돈', check: '준비물', rec: '추천 자료', note: '여행 일기', place: '가 본 곳', park: '내 차 어디?' };
const COLL = { item: 'items', booking: 'bookings', spend: 'spends', check: 'checks', rec: 'recs', note: 'notes', place: 'places', park: 'parks' };
const MAIN = { item: 'title', booking: 'title', spend: 'title', check: 'text', rec: 'name', note: 'text', place: 'name', park: 'spot' };

function editRec(kind, t, rec, opts) {
  opts = opts || {};
  const isNew = !rec.id;
  const c = COLL[kind];
  const photoKinds = { spend: 1, booking: 1, note: 1, place: 1, park: 1 };
  form((isNew ? '새 ' : '') + TITLE[kind], F[kind](t, rec), rec, vals => {
    if (kind === 'spend' && !(vals.amount > 0)) return toast('얼마인지 적어 주세요');
    if (kind === 'spend' && !vals.title) vals.title = vals.cat || '쓴 돈';
    if (kind === 'spend' && vals.pay) LS.set('lastPay', vals.pay);
    if (kind === 'park' && !vals.spot) vals.spot = '주차 위치';
    if (!vals[MAIN[kind]]) return toast('내용을 적어 주세요');
    if (kind === 'spend' && isNew && !SHEET.dupOk) {
      const dup = live('spends', t.id).find(s => s.date === vals.date && Number(s.amount) === vals.amount);
      if (dup) { SHEET.dupOk = true; return toast('같은 날 같은 금액(' + dup.title + ')이 이미 있어요. 한 번 더 누르면 저장해요'); }
    }
    const ph = SHEET.photo;
    if (kind === 'park' && SHEET.geo) Object.assign(vals, SHEET.geo);
    const out = Object.assign({}, rec, vals, { id: rec.id || uid(kind[0]), trip: t.id });
    if (ph && ph.thumb) out.thumb = ph.thumb;
    delete out.photo;
    const saved = put(c, out);
    if (ph && ph.upload) attachUpload(c, saved.id, ph.upload);
    closeSheet();
    if (kind === 'booking' && (out.kind === '항공' || out.kind === '티켓') && out.date && isNew) offerPlan(t, out);
    else toast(kind === 'spend' ? manWon(toWon(t, out.amount, out.cur)) + ' 적었어요' : '저장했어요');
  }, isNew ? null : () => { remove(c, rec.id, TITLE[kind]); closeSheet(); }, Object.assign({ attach: !!photoKinds[kind], geo: kind === 'park' }, opts));
}
/** 사진 원본이 드라이브에 올라가면 기록에 링크를 붙임 */
function attachUpload(c, id, upload) {
  upload.then(r => { const cur = D[c][id]; if (cur && r && r.url) put(c, Object.assign({}, cur, { photoUrl: r.url, photoId: r.id }), true); })
    .catch(() => toast('사진 원본은 다음에 다시 올릴게요'));
}
function offerPlan(t, b) {
  openSheet('<h2>일정에도 넣을까요?</h2><p class="muted">' + esc(md(b.date)) + ' ' + esc(b.time || '') + ' 「' + esc(b.title) + '」</p><div class="sheet-acts"><button class="btn" data-act="sheet-close">아니요</button><button class="btn pri" id="opgo">일정에 넣기</button></div>',
    el => el.querySelector('#opgo').onclick = () => { put('items', { id: uid('i'), trip: t.id, date: b.date, time: b.time || '', title: b.title, cat: b.kind === '항공' ? '이동' : '관광', place: b.place || '', cost: 0, memo: b.code ? '예약번호 ' + b.code : '', done: false }); closeSheet(); toast('일정에 넣었어요'); });
}
function editTrip(t) {
  const isNew = !t;
  const rec = t || { start: ymd(new Date(Date.now() + 30 * 864e5)), end: ymd(new Date(Date.now() + 33 * 864e5)), members: D.meta.family.map(f => f.name), cur: 'JPY', rate: (LS.get('fx.JPY', {}) || {}).rate || 900, country: 'JP' };
  form(isNew ? '새 여행' : '여행 정보', F.trip(), rec, vals => {
    if (SHEET.photo && SHEET.photo.cover) vals.cover = SHEET.photo.cover;
    if (!vals.title) return toast('여행 이름을 적어 주세요');
    if (!vals.start || !vals.end || vals.end < vals.start) return toast('날짜를 확인해 주세요');
    if (vals.country && COUNTRY[vals.country] && (!vals.cur || (isNew && vals.cur === 'JPY'))) vals.cur = COUNTRY[vals.country].cur;
    const id = rec.id || uid('t');
    put('trips', Object.assign({}, rec, vals, { id, cur: vals.cur || 'KRW' }));
    closeSheet();
    if (isNew) go(tripUrl(id));
  }, null, { cover: true });
}

/* ---------- 사진으로 넣기 ---------- */
function pickPhoto(kind, onPicked) {
  // image/* 만 쓰면 안드로이드가 구글 포토 고르기 창만 띄움 → PDF를 함께 적어 갤러리·카메라·내 파일까지 고르는 창이 뜨게
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return;
    if (!/^image\//.test(f.type || '') && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name || '')) return toast('사진 파일(JPG·PNG)을 골라 주세요. PDF는 아직 못 읽어요.');
    (onPicked || (x => readFlow(kind, x)))(f); };
  inp.click();
}
async function shrink(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}
async function preparePhoto(file, name) {
  const full = await shrink(file, 1600, .82), thumb = await shrink(file, 420, .7);
  const b64 = full.split(',')[1];
  const upload = call('photo', b64, 'image/jpeg', name);
  upload.catch(() => {});
  return { b64, thumb, upload };
}
const KIND_NAME = { receipt: '영수증', booking: '예약 화면', parking: '주차 위치' };
async function readFlow(kind, file) {
  const t = curTrip(); if (!t) return;
  let ph;
  try { ph = await preparePhoto(file, KIND_NAME[kind]); } catch (e) { return toast('사진을 열지 못했어요'); }
  let cancelled = false;
  openSheet('<h2>' + KIND_NAME[kind] + ' 읽는 중…</h2><div class="photo-head"><img src="' + ph.thumb + '" alt=""><div><b>몇 초면 돼요</b><span>사진 원본은 구글 드라이브에 보관돼요</span></div></div><div class="reading"><div class="shimmer"></div><div class="shimmer"></div><div class="shimmer" style="width:60%"></div></div>' +
    '<div class="sheet-acts"><button class="btn" id="rd_manual">' + ic('pen') + '직접 적기</button></div>', el => el.querySelector('#rd_manual').onclick = () => { cancelled = true; openFromRead(kind, t, {}, ph, []); });
  let res = null;
  try { res = await call('readPhoto', ph.b64, 'image/jpeg', kind); } catch (e) { if (!cancelled) toast(e.code === 'offline' ? '인터넷이 끊겨 글자를 못 읽었어요. 사진은 붙여 두었으니 금액만 적어 주세요' : '글자를 읽지 못했어요. 사진은 붙여 두었으니 금액만 적어 주세요'); }
  if (cancelled) return;
  const f = (res && res.fields) || {};
  openFromRead(kind, t, f, ph, Object.keys(f).filter(k => f[k] !== '' && f[k] != null && f[k] !== 0));
}
function openFromRead(kind, t, f, ph, read) {
  const inTrip = today() >= t.start && today() <= t.end;
  if (kind === 'receipt') {
    const cur = f.cur && CUR[f.cur] ? f.cur : t.cur;
    const cat = SPEND_CATS.includes(f.cat) ? f.cat : guessCat(f.title || '');
    editRec('spend', t, { pay: LS.get('lastPay', '카드'), share: '함께', amount: Number(f.amount) || 0, cur, title: f.title || '', date: /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') ? f.date : (inTrip ? today() : t.start), cat, payer: (t.members || []).includes(ME) ? ME : '', split: (t.members || []).slice(), memo: f.insurer ? '여행자보험 · ' + f.insurer : (f.memo || '') }, { photo: ph, read, focus: 'amount' });
  } else if (kind === 'booking') {
    const r = {}; ['kind', 'title', 'date', 'time', 'end', 'code', 'provider', 'place', 'car', 'deposit', 'phone', 'seat', 'price', 'cur', 'memo'].forEach(k => { if (f[k] != null && f[k] !== '') r[k] = f[k]; });
    if (!BK[r.kind]) r.kind = '티켓';
    if (r.car) r.car = String(r.car).replace(/-/g, '');
    editRec('booking', t, r, { photo: ph, read });
  } else {
    editRec('park', t, { spot: f.spot || '', memo: f.memo || '', date: today(), time: hm(), keyBy: ME }, { photo: ph, read, focus: 'spot' });
  }
}
function guessCat(s) {
  return /보험|insurance|여권|passport|비자|visa|캐리어|환전\s*수수료/i.test(s) ? '준비' : /유심|usim|e\s*sim|이심|와이파이|wi-?fi|로밍|도시락\s*와이파이/i.test(s) ? '통신' :
    /선물|기념품|お土産|おみやげ|오미야게|souvenir/i.test(s) ? '선물' : /유니버(설|셜)|스튜디오\s*패스|입장권|이용권|자유이용|1일권|투어|체험/i.test(s) ? '관광' : /항공|air|jr|역|철도|버스|택시|난카이|지하철|교통|metro|駅|電鉄|タクシー/i.test(s) ? '이동' : /호텔|숙소|hotel|inn/i.test(s) ? '숙소' : /ローソン|セブン|ファミリーマート|ファミマ|로손|세븐일레븐|패밀리마트|편의점/i.test(s) ? '간식' : /마트|돈키|ドン・キホーテ|쇼핑|드럭|ドラッグ|store|mart/i.test(s) ? '쇼핑' :
    /카페|coffee|커피|아이스|디저트|빵|베이커리/i.test(s) ? '간식' : /입장|티켓|ticket|usj|박물관|전망/i.test(s) ? '관광' : '식사';
}
const art = (n, alt) => '<img class="art-img" src="img/' + n + '.webp" alt="' + esc(alt || '') + '">';
/** USJ 안 일정 완료 도장(팀장님 2026-11-27 「USJ와 어울리는 도장」) — 지구본 줄·별, 파란 잉크(로고는 쓰지 않음) */
const usjStamp = cls => '<span class="stampx usj ' + (cls || '') + '"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="50" cy="50" r="39.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3"/><ellipse cx="50" cy="50" rx="17" ry="39" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".4"/><path d="M11 50h78M17 32h66M17 68h66" stroke="currentColor" stroke-width="1.3" opacity=".4"/><text x="50" y="25" text-anchor="middle" font-size="10" fill="currentColor">★ ★ ★</text><text x="50" y="55" text-anchor="middle" font-size="24" font-weight="900" fill="currentColor" font-family="system-ui,sans-serif">USJ</text><text x="50" y="74" text-anchor="middle" font-size="12.5" font-weight="800" fill="currentColor" letter-spacing="1.5" font-family="system-ui,sans-serif">CLEAR!</text></svg></span>';
/** 일반 일정 완료 도장 — 우리 「하하가족」 도장(팀장님 2026-11-27), 빨간 인주 */
const hahaStamp = cls => '<span class="stampx haha ' + (cls || '') + '"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="4.5"/><circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M50 30c-3-5-11-4-11 2 0 5 11 11 11 11s11-6 11-11c0-6-8-7-11-2z" fill="currentColor"/><text x="50" y="62" text-anchor="middle" font-size="17" font-weight="900" fill="currentColor" font-family="system-ui,sans-serif" letter-spacing="-.5">하하가족</text><text x="50" y="78" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor" font-family="system-ui,sans-serif" letter-spacing="2">다녀옴</text></svg></span>';
let JUST_DONE = '', LAST_HOLD = 0;
const stampHtml = (txt, cls) => '<span class="stampx ' + (cls || '') + '"><img src="img/stamp-done.webp" alt=""><b>' + esc(txt || '다녀옴') + '</b></span>';
const curTrip = () => { const r = route(); return r.view === 'trip' ? D.trips[r.trip] : null; };

/* 빠른 추가 (＋) */
function quickAdd(t) {
  const tab = route().tab;
  const hot = { plan: 'item-new', money: 'spend-new', pass: wseg() === 'money' ? 'spend-new' : '', memory: UI.memK === 'place' ? 'place-new' : 'note-new', prep: 'check-new', car: 'park-new', wallet: 'booking-new' }[tab] || '';
  const Q = [['spend-new', 'receipt', '쓴 돈', 'var(--c-식사)'], ['item-new', 'plan', '일정', 'var(--c-이동)'], ['booking-new', 'ticket', '예약·티켓', 'var(--c-관광)'],
    ['park-new', 'car', '내 차', 'var(--c-주차)'], ['note-new', 'pen', '일기', 'var(--c-쇼핑)'], ['place-new', 'star', '가 본 곳', 'var(--c-간식)'],
    ['check-new', 'prep', '준비물', 'var(--mint)', 'bag'], ['rec-new', 'recs', '가고 싶은 곳', 'var(--c-관광)'], ['photo-any', 'camera', '사진만', 'var(--c-기타)']];
  const inTrip = t && today() >= t.start && today() <= t.end;
  openSheet('<h2>무엇을 더할까요?</h2>' + (inTrip ? '<button class="btn pri big" style="width:100%;margin-bottom:10px;min-height:58px;font-size:18px" data-act="photo" data-v="receipt">🧾 영수증 찍기</button>' : '') + '<button class="quick-photo" data-act="photo-pick"><img class="qp-cam" src="img/camera.webp" alt=""><span><b>사진으로 넣기</b><span>영수증 · 예약·티켓 화면 · 주차 위치</span></span></button>' +
    '<button class="quick-photo tr-quick" data-act="tr-open"><span class="qp-cam tr-ic">🗣️</span><span><b>번역기 · 사진 번역</b><span>말·글 번역 · 메뉴판·성분·안내판 찍어 옮기기</span></span></button>' +
    '<div class="qgrid">' + Q.map(([a, icn, n, col, pk]) => '<button class="' + (a === hot ? 'hot' : '') + '" data-act="' + a + '">' + (pk ? pic([icn, col, pk], 44) : ib(icn, col)) + n + '</button>').join('') + '</div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function photoPick() {
  openSheet('<h2>무엇을 찍었나요?</h2><div class="pick3">' +
    '<button data-act="photo" data-v="receipt">' + ib('receipt', 'var(--c-식사)') + '<span><b>영수증·결제 화면</b><span>금액·가게·날짜가 쓴 돈에 적혀요</span></span></button>' +
    '<button data-act="photo" data-v="booking">' + ib('ticket', 'var(--c-관광)') + '<span><b>예약·티켓 화면</b><span>항공·숙소·티켓·주차 예약이 지갑에 들어가요</span></span></button>' +
    '<button data-act="photo" data-v="parking">' + ib('car', 'var(--c-주차)') + '<span><b>주차 위치</b><span>기둥 번호를 읽어 「내 차 어디?」에 남겨요</span></span></button></div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}

/* ---------- 누름 ---------- */
document.addEventListener('click', e => {
  const nva = e.target.closest('a.nvapp');
  if (nva && IOSD) { const t0 = Date.now(), web = 'https://m.map.naver.com/'; setTimeout(() => { if (!document.hidden && Date.now() - t0 < 2500) location.href = web; }, 1600); }
  const sopt = e.target.closest('.opt');
  if (sopt) {
    const box = sopt.parentElement;
    if (box.dataset.type === 'multi') sopt.classList.toggle('on');
    else { box.querySelectorAll('.opt').forEach(b => b.classList.remove('on')); sopt.classList.add('on'); }
    return;
  }
  const st = e.target.closest('[data-star]');
  if (st) { const box = st.parentElement, v = Number(st.dataset.star); box.dataset.v = v; box.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.star) <= v)); return; }
  if (e.target.closest('[data-stop]')) return;
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, v = el.dataset.v;
  const r = route(), t = r.view === 'trip' ? D.trips[r.trip] : null;
  const A = {
    home: () => go('#/'),
    'open-trip': () => go(tripUrl(v)),
    tab: () => { if (v === 'pass') UI.wseg = 'pass'; go(tripUrl(r.trip, v)); },
    'switch-trip': () => openSheet('<h2>여행 고르기</h2><div class="stack">' + live('trips').sort((x, y) => (y.start || '').localeCompare(x.start || '')).map(tripRow).join('') + '<button class="newtrip" data-act="trip-new">' + ic('plus') + '새 여행 만들기</button></div><div class="sheet-acts"><button class="btn" data-act="home">우리 여행 모두 보기</button></div>'),
    me: () => { ME = v; LS.set('me', v); render(); toast(v + ' 님, 반가워요'); newsCheck(); if (FRESH_LATER) setTimeout(freshCheck, 4000); },
    mode: () => { UI.mode = v; LS.set('mode', v); render(); },
    day: () => { UI.day[r.trip] = v; UI.showPast = false; render(); },
    'show-past': () => { UI.showPast = true; render(); },
    reck: () => { UI.recK = v; render(); },
    memk: () => { UI.memK = v; render(); },
    split: () => put('trips', Object.assign({}, t, { splitMode: v })),
    'use-fx': () => { const fx = (INFO[t.id] || {}).fx; if (fx) { put('trips', Object.assign({}, t, { rate: Math.round(fx.rate * 10) / 10 })); toast('오늘 환율로 계산해요'); } },
    quick: () => quickAdd(t),
    'photo-pick': () => photoPick(),
    photo: () => { closeSheet(); pickPhoto(v); },
    'photo-any': () => { closeSheet(); pickPhoto('', async f => { const ph = await preparePhoto(f, '여행 사진'); editRec('note', t, { date: today() >= t.start && today() <= t.end ? today() : t.start, text: '' }, { photo: ph }); }); },
    attach: () => pickPhoto('', async f => { try { const ph = await preparePhoto(f, '사진'); SHEET.photo = ph; const img = $('#sheet-body .photo-head img'); if (img) img.src = ph.thumb; else $('#sheet-body h2').insertAdjacentHTML('afterend', '<div class="photo-head"><img src="' + ph.thumb + '" alt=""><div><b>붙인 사진</b><span>간직하면 드라이브에도 보관돼요</span></div></div>'); } catch (er) { toast('사진을 열지 못했어요'); } }),
    geo: () => { if (!navigator.geolocation) return toast('이 기기에서는 위치를 못 써요'); el.textContent = '위치 찾는 중…'; navigator.geolocation.getCurrentPosition(p => { SHEET.geo = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }; el.textContent = '✓ 위치 저장됨'; }, () => { el.textContent = '위치를 못 찾았어요 (사진·글자로 충분해요)'; }, { enableHighAccuracy: true, timeout: 12000 }); },
    'sheet-close': () => closeSheet(),
    'sheet-del': () => { if (!SHEET || !SHEET.onDelete) return; if (!SHEET.armed) { SHEET.armed = true; el.lastChild.textContent = '한 번 더 누르면 지워요'; return; } SHEET.onDelete(); },
    'trip-new': () => openSheet('<h2>새 여행</h2><div class="newpick"><button data-act="trip-plan">' + ib('plan', 'var(--sky)') + '<span><b>여행 계획 세우기</b><small>갈 곳·날짜를 정하고 일정을 짜요</small></span></button><button data-act="trip-scan">' + ib('camera', 'var(--coral)') + '<span><b>다녀온 여행, 사진으로 정리</b><small>사진·영수증·일정표를 올리면 날짜·곳·일정·경비·이야기로 정리해요</small></span></button></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'),
    'trip-plan': () => editTrip(null),
    'trip-scan': () => scanFlow(null),
    'trip-scan-add': () => scanFlow(t),
    'item-new': () => editRec('item', t, { date: UI.day[t.id] || t.start, cat: '관광', cost: 0 }),
    'item-view': () => itemView(t, D.items[v]),
    'sf-tap': () => { const c = el.closest('.sfc'); if (!c) return; if (c.classList.contains('fold')) { c.classList.remove('dwell'); c.dataset.keep = '1'; tlUnfold(c); } else { delete c.dataset.keep; tlFold(c); } },
    'tl-tap': () => { const card = el.closest('.tl-card'); if (card && card.classList.contains('fold')) { TL_OPEN.add(v); card.classList.remove('dwell'); tlUnfold(card); return; } itemView(t, D.items[v]); },
    'rb-open': () => rbOpen(t, v != null ? +v : null),
    'rb-get': () => rbGetSheet(t),
    'rb-pdf': () => rbPdf(t),
    'rb-epub': () => rbEpub(t),
    'tr-open': () => { closeSheet(); go(tripUrl(t.id, 'talk')); },
    'tr-swap': () => { const S = trState(); S.dir = S.dir === 'ko' ? 'x' : 'ko'; S.text = ''; S.out = ''; render(); },
    'tr-mode': () => { trState().mode = v; render(); },
    'tr-go': async () => { const S = trState(), L = trLang(t), from = S.dir === 'ko' ? KO : L, to = S.dir === 'ko' ? L : KO; const txt = ($('#tr-in') || {}).value || ''; const out = await trRun(t, txt, from, to, 'text'); if (out) { S.out = out; } render(); },
    'tr-mic': () => { const S = trState(), L = trLang(t); listen(S.dir === 'ko' ? KO[2] : L[2], txt => { const el = $('#tr-in'); if (el) el.value = txt; S.text = txt; A['tr-go'](); }); },
    'tr-say': () => { const S = trState(), L = trLang(t); speak(S.out, S.dir === 'ko' ? L[2] : KO[2]); },
    'tr-sayq': () => speak(v, 'ja-JP'),
    'ph-say': () => { sayPhrase(v, el.dataset.l || 'ja-JP'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1600); },
    'tr-show': () => { const S = trState(), L = trLang(t); openSheet('<div class="tr-show" lang="' + (S.dir === 'ko' ? L[0] : 'ko') + '">' + esc(S.out) + '</div><div class="muted" style="text-align:center;margin:8px 0">' + esc(S.text) + '</div><div class="sheet-acts"><button class="btn" data-act="tr-say">' + ic('speaker') + '듣기</button><button class="btn pri" data-act="sheet-close">닫기</button></div>'); },
    'tr-copy': () => { try { navigator.clipboard.writeText(trState().out); toast('복사했어요'); } catch (e) { toast('복사하지 못했어요'); } },
    'tr-save': () => { const S = trState(), L = trLang(t); const sv = LS.get('trSaved', []).filter(x => x.t !== S.out); sv.unshift({ f: S.text, t: S.out, b: S.dir === 'ko' ? L[0] : 'ko' }); LS.set('trSaved', sv.slice(0, 30)); toast('내가 모은 문장에 넣었어요'); render(); },
    'tr-pick': () => { const S = trState(); const x = (v[0] === 's' ? LS.get('trSaved', []) : LS.get('trHist', []))[Number(v.slice(1))]; if (!x) return; S.text = x.f; S.out = x.t; render(); window.scrollTo(0, 0); },
    'tr-clear': () => { LS.set('trHist', []); render(); },
    'tr-photo': () => trPhoto(t, v),
    'tr-face-mic': () => { const S = trState(), L = trLang(t); const F = S.face || (S.face = {});
      if (v === 'me') listen(KO[2], async txt => { const out = await trRun(t, txt, KO, L, 'face'); if (out) { F.toThem = out; F.mine = txt; render(); speak(out, L[2]); } });
      else listen(L[2], async txt => { const out = await trRun(t, txt, L, KO, 'face'); if (out) { F.toMe = out; render(); } }); },
    'tr-face-type': () => openSheet('<h2>상대방에게 할 말</h2><textarea id="tr-face-in" class="in" rows="3" placeholder="한국어로 적어요"></textarea><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" data-act="tr-face-send">번역해서 보여 주기</button></div>', b => { const x = b.querySelector('textarea'); x && x.focus(); }),
    'tr-face-send': async () => { const S = trState(), L = trLang(t); const F = S.face || (S.face = {}); const txt = ($('#tr-face-in') || {}).value || ''; closeSheet(); const out = await trRun(t, txt, KO, L, 'face'); if (out) { F.toThem = out; render(); speak(out, L[2]); } },
    'item-edit': () => editRec('item', t, D.items[v]),
    'item-done': () => {
      // 일정 카드의 동그라미는 꾹 눌러야 도장(실수로 눌리지 않게, 2026-11-27). 일정 창의 「다녀옴」 단추는 그대로 한 번에
      if (el.closest('.tl-card') && el.dataset.held !== '1') { if (Date.now() - LAST_HOLD < 1200) return; toast(D.items[v] && D.items[v].done ? '꾹 누르고 있으면 도장을 지워요' : '꾹 누르고 있으면 도장이 찍혀요'); el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); return; }
      el.dataset.held = '';
      const i = D.items[v]; buzz(); if (!i.done) JUST_DONE = i.id; setTimeout(() => { JUST_DONE = ''; }, 1500); put('items', Object.assign({}, i, { done: !i.done })); const di = live('items', t.id).filter(x => x.date === i.date); if (!i.done && di.every(x => x.done || x.skip)) { confetti(); toast(md(i.date) + ' 일정을 다 다녀왔어요!'); } else if (el.closest('.tl-card')) { const back = Object.assign({}, i); toast(i.done ? '도장을 지웠어요' : (i.zone === 'USJ' ? 'CLEAR! ' : '다녀옴! ') + planName(i), () => put('items', back)); } if ($('#sheet .iv-head')) { const sc = $('.sheet-card').scrollTop; itemView(t, D.items[v]); $('.sheet-card').scrollTop = sc; } },
    'booking-new': () => editRec('booking', t, { kind: '숙소', date: t.start }),
    'booking-edit': () => editRec('booking', t, D.bookings[v]),
    'tk-gate': () => tkGate(v, el.dataset.label),
    'tk-me': () => t && tkMe(t, v, el.dataset.file),
    'tk-who': () => { UI.tkWho = v; render(); },
    'tk-pick': () => t && tkPick(t),
    wseg: () => { UI.wseg = v; render(); window.scrollTo(0, 0); },
    'tk-add': () => tkAdd(v),
    'spend-new': () => editRec('spend', t, { pay: LS.get('lastPay', '카드'), share: '함께', date: (today() >= t.start && today() <= t.end) ? today() : t.start, cur: t.cur, cat: '식사', payer: (t.members || []).includes(ME) ? ME : '', split: (t.members || []).slice() }, { focus: 'amount' }),
    'spend-edit': () => editRec('spend', t, D.spends[v]),
    'check-new': () => { const k = UI.prepTab || ''; editRec('check', t, { cat: k === 'todo' ? '출발 전' : k.startsWith('p:') ? '옷' : '기타', who: '', owner: k.startsWith('p:') ? k.slice(2) : '' }); },
    'prep-tab': () => { UI.prepTab = v; render(); },
    'prep-add': () => { UI.prepTab = v; A['check-new'](); },
    'prep-kit': () => { personalKit(t).forEach(([cat, text]) => put('checks', { id: uid('c'), trip: t.id, text, cat, who: '', owner: v, done: false }, true)); render(); toast(whoName(v) + ' 가방에 ' + personalKit(t).length + '가지를 넣었어요'); },
    'check-edit': () => editRec('check', t, D.checks[v]),
    'check-done': () => { const c = D.checks[v]; buzz(); put('checks', Object.assign({}, c, { done: !c.done })); const ck = live('checks', c.trip); if (!c.done && ck.every(x => x.done)) { confetti(); toast('준비 끝! 가방만 들면 돼요'); } },
    'rec-new': () => editRec('rec', t, { kind: UI.recK !== '전체' ? UI.recK : '맛집' }),
    'rec-edit': () => editRec('rec', t, D.recs[v]),
    'rec-add': () => recToPlan(t, D.recs[v]),
    'note-new': () => editRec('note', t, { date: (today() >= t.start && today() <= t.end) ? today() : t.start, owner: UI.diaryWho === ME ? ME : '' }),
    'note-edit': () => { const n = D.notes[v]; if (n.owner && n.owner !== ME) return openSheet('<div class="note" style="box-shadow:none;padding:0"><div class="h">' + av(n.by, 32) + esc(n.by) + ' · ' + esc(md(n.date)) + (n.mood ? ' · ' + moodImg(n.mood, 22) : '') + '</div><p>' + esc(n.text) + '</p>' + (safeImg(n.thumb) ? '<img src="' + n.thumb + '" alt="">' : '') + '</div><div class="muted small" style="margin-top:10px">' + esc(n.owner) + ' 님의 다이어리예요. 읽기만 할 수 있어요.</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'); editRec('note', t, n); },
    'diary-who': () => { UI.diaryWho = v; render(); },
    'past-kind': () => { UI.pastKind = v; LS.set('pastKind', v); render(); },
    'place-new': () => editRec('place', t, { cat: '맛집', rating: 5 }),
    'place-edit': () => { const p = D.places[v]; editRec('place', D.trips[p.trip], p); },
    'park-new': () => { closeSheet(); pickPhoto('parking'); },
    'park-edit': () => editRec('park', t, D.parks[v]),
    'view-photo': () => { const rec = D[el.dataset.c][v]; openSheet('<div class="viewer"><img src="' + safeImg(rec.thumb) + '" alt=""></div>' + (safeUrl(rec.photoUrl) ? '<a class="btn pri wide big" style="margin-top:12px" href="' + esc(rec.photoUrl) + '" target="_blank" rel="noopener">원본 크게 보기 (드라이브)</a>' : '') + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'); },
    'all-places': () => {
      const tr = live('trips').filter(x => visitedOf(x.id).length).sort((a, b) => (b.start || '').localeCompare(a.start || '')), all = tr.flatMap(x => visitedOf(x.id)), c = pcatOk(all, UI.pcat || '전체');
      const body = tr.map(x => { const l = visitedOf(x.id).filter(e => c === '전체' || e.cat === c); return l.length ? '<div class="ap-trip"><b>' + esc(x.title) + '</b> <span class="muted small num">' + esc(x.start.slice(0, 4) + '. ' + md(x.start)) + ' · ' + l.length + '곳</span></div><div class="card">' + rowsMore(l) + '</div>' : ''; }).join('');
      openSheet('<h2>우리가 가 본 곳</h2>' + pcatChips(all, c, 'pcat-s') + body + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
    },
    'map-k': () => { UI.mapK = v; const el = $('#tmap'); if (el) { el.dataset.k = v; document.querySelectorAll('[data-act="map-k"]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); mountMap(true); } },
    dmz: () => { UI.dmz = v; render(); },
    'dm-loc': () => dmLocate(),
    'map-full': () => { const w = el.closest('.tmap-wrap') || $('.tmap-wrap'); if (!w) return; const on = w.classList.toggle('full'); if (on) history.pushState({ map: 1 }, ''); else if (history.state && history.state.map) history.back(); document.body.classList.toggle('map-open', on); setTimeout(() => { MAP && MAP.invalidateSize(); DMAP && DMAP.invalidateSize(); }, 80); },
    'map-trip': () => { document.body.classList.remove('map-open'); MAP && MAP.closePopup(); A['open-trip'](); },
    'wallet-sort': () => { UI.walletSort = v; LS.set('walletSort', v); render(); },
    'memo-who': () => { UI.memoWho = v; render(); },
    'memo-new': () => memoEdit(t, null),
    'memo-edit': () => { const m = D.memos[v]; if (m && m.owner === ME) memoEdit(t, m); },
    'copy-text': () => { (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('복사했어요'), () => toast(v)); },
    'pcat': () => { UI.pcat = v; LS.set('pcat', v); render(); },
    'pcat-s': () => { UI.pcat = v; LS.set('pcat', v); render(); A['all-places'](); },
    'pcat-t': () => { UI.pcatT = v; render(); },
    'place-from': () => { const i = D.items[v]; if (!i) return; editRec('place', D.trips[i.trip], { name: planName(i), cat: PLAN_CAT[i.cat] || '명소', rating: 0, memo: i.memo || '', map: i.place, addr: i.addr || '', item: i.id, date: i.date }); },
    'trip-menu': () => tripMenu(D.trips[v]),
    'trip-edit': () => editTrip(D.trips[v]),
    'trip-copy': () => copyTrip(D.trips[v]),
    'trip-del': () => { if (!el.dataset.armed) { el.dataset.armed = '1'; el.querySelector('span').firstChild.textContent = '한 번 더 누르면 이 여행을 지워요'; return; } const id = v; closeSheet(); go('#/'); remove('trips', id, '여행을'); },
    'export-doc': () => exportTo('exportDoc', v, '구글 드라이브 문서'),
    'export-notion': () => exportTo('exportNotion', v, '노션'),
    settings: () => settings(),
    'who-again': () => { ME = ''; LS.del('me'); closeSheet(); render(); },
    solid: () => { const on = !document.documentElement.classList.contains('solid'); document.documentElement.classList.toggle('solid', on); LS.set('solid', on); closeSheet(); toast(on ? '유리 효과를 끄고 선명하게 했어요' : '유리 효과를 다시 켰어요'); },
    big: () => { const on = !document.documentElement.classList.contains('big'); document.documentElement.classList.toggle('big', on); LS.set('big', on); closeSheet(); toast(on ? '글씨를 크게 했어요' : '글씨를 보통으로 했어요'); },
    pull: () => { closeSheet(); pull().then(() => toast('새로 받았어요')); },
    logout: () => { if (!el.dataset.armed) { el.dataset.armed = '1'; el.querySelector('span').firstChild.textContent = '한 번 더 누르면 이 기기에서 나가요'; return; } PASS = ''; ME = ''; try { Object.keys(localStorage).filter(k => k.startsWith('haha.')).forEach(k => localStorage.removeItem(k)); } catch (e) {} try { indexedDB.deleteDatabase('haha-tk'); } catch (e) {} TK_HAVE.clear(); D = empty(); Q = []; closeSheet(); render(); }, // 이 기기에서 나가면 티켓 사진까지 지움(보안 전문가)
    'fam-edit': () => famEdit(), 'pass-edit': () => passEdit(), 'notion-edit': () => notionEdit(), 'ai-edit': () => aiEdit(),
    'notion-setup': async () => { el.textContent = '만드는 중…'; try { await call('notionSetup'); toast('노션에 「하하가족여행」 정리함을 만들었어요'); closeSheet(); } catch (er) { toast(er.message); el.textContent = '정리함 만들기'; } },
    'drive-open': async () => { try { const u = await call('folderUrl'); linkSheet('구글 드라이브 「하하가족여행」', u); } catch (er) { toast('폴더를 못 찾았어요: ' + er.message); } },
    install: () => openSheet('<h2>휴대폰 홈 화면에 앱처럼 두기</h2><div class="stack"><div class="card"><b>아이폰 (사파리)</b><div class="muted">아래 공유 단추 → 「홈 화면에 추가」</div></div><div class="card"><b>갤럭시 (크롬·삼성 인터넷)</b><div class="muted">오른쪽 위 ⋮ 또는 ≡ → 「홈 화면에 추가」 또는 「앱 설치」</div></div></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'),
    'book-read': () => { const k = BKEY(t, v); const on = !LS.get(k, false); LS.set(k, on); if (on) buzz(); render(); },
    'sos-go': () => sosOpen(t),
    offline: () => offlineOpen(),
    ics: () => icsDownload(t),
    'print-plan': () => printPlan(t),
    'sos-book': () => { closeSheet(); go(tripUrl(t.id, 'book')); setTimeout(() => { const x = document.getElementById('bk_sos'); if (x) window.scrollTo({ top: x.getBoundingClientRect().top + scrollY - 70 }); }, 300); },
    taxi: () => taxiOpen(t, v ? D.items[v] : null),
    late: () => lateOpen(t),
    'item-shift': () => { const it = D.items[v], n = Number(el.dataset.n) || 0; if (!it || !it.time) return; const back = Object.assign({}, it); closeSheet(); put('items', Object.assign({}, it, { time: addMin(it.time, n) })); toast(planName(it) + ' ' + (n > 0 ? n + '분 뒤로' : -n + '분 앞으로') + ' · ' + addMin(it.time, n), () => put('items', back)); },
    'item-skip': () => { const it = D.items[v]; if (!it) return; const back = Object.assign({}, it); closeSheet(); put('items', Object.assign({}, it, { skip: !it.skip })); toast(it.skip ? planName(it) + ' 다시 넣었어요' : planName(it) + ' 건너뛰었어요 — 동선·예산에서 빠져요', () => put('items', back)); },
    'late-go': () => lateGo(t, Number(v) || 15),
    'taxi-ja': () => { const hb = live('bookings', t.id).find(b => b.kind === '숙소'); if (hb) askText('일본어 주소 (택시 기사님께 보여 줄 주소)', hb.jaAddr || '', v2 => { put('bookings', Object.assign({}, hb, { jaAddr: v2.trim() })); taxiOpen(t); }); },
    'taxi-copy': () => { const x = el.dataset.v; (navigator.clipboard ? navigator.clipboard.writeText(x) : Promise.reject()).then(() => toast('주소를 복사했어요'), () => toast(x)); },
    'book-jump': () => { const x = document.getElementById('bk_' + v); if (x) window.scrollTo({ top: x.getBoundingClientRect().top + scrollY - 70, behavior: 'smooth' }); },
    flip: () => el.parentElement.classList.toggle('open'),
    'phrase-got': () => { const k = BKEY(t, v); LS.set(k, !LS.get(k, false)); buzz(); render(); },
    'tip-new': () => editRec('rec', t, { kind: '팁' }),
    wday: () => { UI.wday = v; render(); },
    'pass-add': () => passFlow(v),
    'pass-reveal': () => { UI.reveal = UI.reveal === v ? null : v; render(); },
    'pass-edit2': () => { const p = (PASSPORTS || []).find(x => x.id === v); if (p) passForm(p, null, []); },
    'news-ok': () => { LS.set('newsSeen', NEWS[0].v); closeSheet(); },
    news: () => newsOpen(true),
    'budget-edit': () => budgetEdit(t),
    'dues-edit': () => duesEdit(t), 'payin-new': () => payinEdit(t, ''), 'payin-edit': () => payinEdit(t, v),
    'filter-unknown': () => { UI.spendFilter = 'unknown'; render(); },
    'filter-clear': () => { UI.spendFilter = ''; render(); },
    'cover-pick': () => pickPhoto('', async f => { try { const c = await shrink(f, 1000, .72); SHEET.photo = { cover: c }; el.textContent = '✓ 표지 사진 골랐어요 (저장을 누르세요)'; } catch (er) { toast('사진을 열지 못했어요'); } }),
    'cover-clear': () => { SHEET.photo = { cover: '' }; SHEET.rec.cover = ''; el.textContent = '✓ 표지 그림으로 (저장을 누르세요)'; },
    'copy-link': () => { const u = location.origin + location.pathname; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('주소를 복사했어요'), () => toast(u)); }
  };
  if (A[a]) { e.preventDefault(); A[a](); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'cv_a') { const t = curTrip(); const fx = (INFO[t.id] || {}).fx; const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0; $('#cv_b').textContent = comma(n * (fx ? fx.rate : t.rate) / 100) + '원'; }
  if (e.target.classList.contains('in') && e.target.inputMode === 'decimal' && e.target.id.startsWith('f_')) {
    const raw = e.target.value.replace(/[^\d.]/g, ''); const [i, d] = raw.split('.'); const v = (i ? Number(i).toLocaleString('ko-KR') : '') + (d != null ? '.' + d : '');
    if (v !== e.target.value) e.target.value = v;
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'sheet' && SHEET) return SHEET.onSave(readForm());
  if (f === 'lock') {
    const p = $('#pass').value.trim(), msg = $('#lockmsg');
    if (!p) return;
    msg.textContent = '확인 중… 처음엔 자료를 받느라 10초쯤 걸릴 수 있어요';
    PASS = p; LOGGING = true;
    try { const d = await call('load'); LS.set('pass', p); LOGGING = false; adopt(d, true); othersChanged(D); startRoute(); render(); setTimeout(offlineAuto, 5000); }
    catch (er) { PASS = ''; LOGGING = false; msg.textContent = er.code === 'pass' ? '암호가 맞지 않아요' : (er.code === 'not_setup' || er.code === 'net') ? '서버 준비가 아직 안 됐어요' : '연결이 안 돼요. 인터넷을 확인해 주세요'; }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

function recToPlan(t, r) {
  const days = daysOf(t);
  openSheet('<h2>「' + esc(r.name) + '」 일정에 넣기</h2><div class="f"><div class="fl"><span>어느 날</span><div class="opts" id="rp_day">' +
    days.map((d, k) => '<button type="button" class="opt ' + (k === 0 ? 'on' : '') + '" data-opt="' + d + '">' + (k + 1) + '일째 ' + esc(md(d)) + '</button>').join('') + '<button type="button" class="opt" data-opt="">날짜 미정</button></div></div>' +
    '<label class="fl"><span>시간</span><input class="in" id="rp_time" type="time"></label></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="rp_go">일정에 넣기</button></div>',
    el => el.querySelector('#rp_go').onclick = () => {
      const on = el.querySelector('#rp_day .opt.on');
      put('items', { id: uid('i'), trip: t.id, date: on ? on.dataset.opt : '', time: el.querySelector('#rp_time').value, title: r.name, cat: RECC[r.kind] || '관광', place: r.map || r.name, cost: priceGuess(r.price), memo: [r.desc, r.price].filter(Boolean).join(' · '), rec: r.id, done: false });
      closeSheet(); toast('일정에 넣었어요');
    });
}
function tripMenu(t) {
  openSheet('<h2>' + esc(t.title) + '</h2><div class="menu-list">' +
    '<button data-act="trip-edit" data-v="' + esc(t.id) + '">' + ib('plan', 'var(--sky)', 1) + '<span>여행 정보 고치기<small>날짜·나라·사람·환율</small></span></button>' +
    '<button data-act="tab" data-v="prep">' + pic(['prep', 'var(--mint)', 'bag'], 36) + '<span>준비물</span></button>' +
    '<button data-act="tab" data-v="info">' + ib('globe', 'var(--sky)', 1) + '<span>여행 정보<small>환율·날씨·나라 정보·숙소 주소</small></span></button>' +
    '<button data-act="tab" data-v="car">' + ib('car', 'var(--c-주차)', 1) + '<span>내 차 어디?</span></button>' +
    '<button data-act="export-doc" data-v="' + esc(t.id) + '">' + ib('doc', 'var(--sky)', 1) + '<span>구글 문서 기록 지금 새로 만들기</span></button>' +
    '<button data-act="export-notion" data-v="' + esc(t.id) + '">' + ib('notion', 'var(--ink)', 1) + '<span>노션으로 보내기</span></button>' +
    '<button data-act="trip-copy" data-v="' + esc(t.id) + '">' + ib('copy', 'var(--lav)', 1) + '<span>이 여행을 본떠 새 여행<small>준비물·추천 자료를 그대로 가져가요</small></span></button>' +
    '<button data-act="settings">' + ib('gear', 'var(--soft)', 1) + '<span>설정</span></button>' +
    '<button data-act="trip-del" data-v="' + esc(t.id) + '" style="color:var(--warn)">' + ib('trash', 'var(--warn)', 1) + '<span>이 여행 지우기<small>되돌리기·드라이브 백업이 있어요</small></span></button>' +
    '</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function copyTrip(t) {
  const id = uid('t');
  put('trips', { id, title: t.title + ' (새)', place: t.place, start: t.start, end: t.end, members: (t.members || []).slice(), cur: t.cur, rate: t.rate, country: t.country, memo: '' });
  live('checks', t.id).forEach(c => put('checks', { id: uid('c'), trip: id, text: c.text, cat: c.cat, who: '', owner: c.owner || '', done: false }, true));
  live('recs', t.id).forEach(r => put('recs', Object.assign({}, r, { id: uid('r'), trip: id, ts: 0 }), true));
  closeSheet(); editTrip(D.trips[id]);
}
async function exportTo(fn, tripId, name) {
  if (Q.length) await flush();
  toast(name + '에 기록하는 중…');
  try { const r = await call(fn, tripId, ME); await pull(); linkSheet(name + '에 기록했어요', r.url); }
  catch (er) { openSheet('<h2>' + esc(name) + ' 기록이 안 됐어요</h2><p class="muted">' + esc(er.message) + '</p>' + (fn === 'exportNotion' ? '<button class="btn pri wide big" data-act="notion-edit">노션 연결하기</button>' : '') + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'); }
}
function linkSheet(title, url) {
  openSheet('<h2>' + esc(title) + '</h2>' + (safeUrl(url) ? '<a class="btn pri wide big" href="' + esc(url) + '" target="_blank" rel="noopener">' + ic('link') + '열기</a>' : '') + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}

/* ---------- 여행 전 오프라인 준비 (여행 앱 전문가 검토 2026-11-26) — 그림·일본어 소리·지도 라이브러리·티켓 사진을 휴대폰에 받아 둠 ---------- */
const ASSET_C = 'haha-assets-v1';
async function offlineStatus() {
  const st = { files: 0, have: 0, tk: 0, tkAll: 0, persisted: null, quota: '' };
  try { const a = await (await fetch('assets.json', { cache: 'no-store' })).json(); st.files = a.files.length; st.list = a.files; st.bytes = a.bytes; } catch (e) {}
  try { if (window.caches && st.list) { const c = await caches.open(ASSET_C); const ks = await c.keys(); const set = new Set(ks.map(r => new URL(r.url).pathname.replace(/^.*\/haha-trip\//, '').replace(/^\//, ''))); st.have = st.list.filter(f => set.has(f)).length; } } catch (e) {}
  Object.values(D.bookings || {}).forEach(b => { if ((b.date || '9') >= today()) tkList(b).forEach(q => { st.tkAll++; if (tkReady(q)) st.tk++; }); });
  try { st.persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) {}
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); st.quota = Math.round(e.usage / 1e6) + 'MB 씀 · ' + Math.round(e.quota / 1e6) + 'MB 가능'; } } catch (e) {}
  return st;
}
async function offlineOpen() {
  openSheet('<h2>📦 여행 전 오프라인 준비</h2><div class="muted">인터넷이 되면 앱이 <b>저절로</b> 받아 둬요. 일본에서 인터넷이 끊겨도 앱·티켓·그림·일본어 소리가 열려요. 아래 칸이 모두 ✅면 끝이에요.</div><div id="of_st" class="card" style="margin-top:12px">확인 중…</div>' +
    '<button class="btn big" id="of_go" style="width:100%;margin-top:12px">지금 한 번 더 받기</button><div class="muted small" style="margin-top:10px">동선 지도는 <b>한 번 열어 본 곳만</b> 인터넷 없이 보여요(지도 회사 규칙상 미리 왕창 받지 않아요) — 출발 전에 일정 → 네 날 「이날 동선」을 구역마다 한 번씩 눌러 두세요. 구글 지도 앱에서도 오사카·교토 「오프라인 지도」를 받아 두면 좋아요. 아이폰은 사파리와 「홈 화면 앱」의 저장 칸이 따로라, 여행 중 쓸 홈 화면 앱을 한 번 열어 두면 그 안에도 저절로 받아요.</div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>', async el => {
    const paint = st => { const ok = (a, b) => a >= b && b > 0 ? '✅' : '⬜'; el.querySelector('#of_st').innerHTML =
      '<div class="facts"><div><span>' + ok(st.have, st.files) + ' 그림·소리·지도 파일</span><b class="num">' + st.have + ' / ' + st.files + '</b></div>' +
      '<div><span>' + (st.tkAll ? ok(st.tk, st.tkAll) : '➖') + ' 티켓 (QR·원본)</span><b class="num">' + st.tk + ' / ' + st.tkAll + '</b></div>' +
      '<div><span>' + (st.persisted ? '✅' : '⬜') + ' 휴대폰이 지우지 않게 보호</span><b>' + (st.persisted ? '켜짐' : st.persisted === false ? '꺼짐' : '모름') + '</b></div>' +
      (st.quota ? '<div><span>저장 공간</span><b class="small">' + esc(st.quota) + '</b></div>' : '') + '</div>'; };
    paint(await offlineStatus());
    el.querySelector('#of_go').onclick = async () => {
      const b = el.querySelector('#of_go'); b.disabled = true;
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
      const st = await offlineStatus(); let n = 0, bad = 0;
      try {
        const c = await caches.open(ASSET_C);
        for (const f of st.list || []) { n++; b.textContent = '받는 중… ' + n + ' / ' + st.list.length; try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(f, r); else bad++; } catch (e) { bad++; } }
      } catch (e) { bad++; }
      TK_CHECKED.clear(); await tkSync();
      b.disabled = false; b.textContent = bad ? '다시 받아 두기 (' + bad + '개 못 받음)' : '✓ 다 받아 두었어요';
      if (!bad) { OF_DONE = true; LS.set('offlineAt', Date.now()); } paint(await offlineStatus());
    };
  });
}
/** 저절로 오프라인 준비 (팀장님 2026-11-27 「강제로」 — 가족 모두 무제한 요금제): 인터넷이 되면 빠진 파일만 조용히 받아 둠 */
let OF_BUSY = false, OF_DONE = false;
async function offlineAuto() {
  if (OF_BUSY || OF_DONE || !PASS || !window.caches || navigator.onLine === false) return;
  OF_BUSY = true;
  try {
    const st = await offlineStatus(); if (!st.list || !st.list.length) return;
    const sig = st.list.length + ':' + (st.bytes || 0), c = await caches.open(ASSET_C);
    const ks = await c.keys(), have = new Set(ks.map(r => new URL(r.url).pathname.replace(/^.*\/haha-trip\//, '').replace(/^\//, '')));
    const need = st.list.filter(f => !have.has(f)), first = !LS.get('offlineAt', 0), loud = first && need.length > 20;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => LS.set('persisted', !!ok)).catch(() => {}); } catch (e) {}
    if (loud) toast('📦 여행 준비물(그림·소리·지도)을 휴대폰에 받아 두는 중이에요');
    let i = 0, bad = 0;
    const work = async () => { while (i < need.length && navigator.onLine !== false) { const f = need[i++]; try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(f, r); else bad++; } catch (e) { bad++; } } };
    await Promise.all([work(), work(), work()]);
    if (i < need.length) bad += need.length - i;
    if (need.length) { TK_CHECKED.clear(); await tkSync(); }
    if (!bad) { OF_DONE = true; LS.set('offlineSig', sig); LS.set('offlineAt', Date.now()); if (loud) toast('✓ 오프라인 준비 끝 — 인터넷이 끊겨도 앱·티켓이 열려요'); }
  } catch (e) {} finally { OF_BUSY = false; }
}
setTimeout(offlineAuto, 6000);
setInterval(offlineAuto, 10 * 60000);
window.addEventListener('online', () => setTimeout(offlineAuto, 3000));
/* ---------- 늦어졌어요 — 남은 일정 한꺼번에 미루기 (팀장님 2026-11-27 「스케줄을 놓치거나 변경되었을 때는?」) ----------
   정각 입장권·공연·배·비행기처럼 시간이 정해진 일정(fixed·「정각」)은 그대로 두고, 겹치면 알려 줌. 되돌리기 있음 */
const isFixed = i => !!(i.fixed || /정각/.test(i.title || ''));
const addMin = (s, n) => { const m = String(s).match(/(\d{1,2}):(\d{2})/); if (!m) return s; const v = Math.min(23 * 60 + 59, +m[1] * 60 + +m[2] + n); return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
function lateList(t) {
  const t0 = today(), now = hm().slice(0, 5), l = live('items', t.id).filter(i => i.date === t0 && !i.done && !i.skip && i.time).sort(byTime);
  const cur = l.filter(i => i.time < now).slice(-1)[0], from = cur ? cur.time : now;
  return l.filter(i => i.time >= from);
}
/** 미룰 일정 — 기본은 다음 「시간 정해진 일정」 앞까지(그 자리에서 늦음을 흡수), all이면 남은 것 모두 */
function latePick(t, all) {
  const l = lateList(t), fx = l.filter(isFixed), f0 = fx[0];
  return { mv: l.filter(i => !isFixed(i) && (all || !f0 || i.time < f0.time)), fx, f0 };
}
function lateOpen(t) {
  const { mv, fx, f0 } = latePick(t, false), all = latePick(t, true).mv;
  if (!all.length) return toast('오늘 남은 일정 중 미룰 것이 없어요');
  openSheet('<h2>⏱ 늦어졌어요</h2><div class="muted">' + (f0 && mv.length ? '다음 시간 정해진 일정 <b>' + esc(f0.time + ' ' + planName(f0)) + '</b> 앞까지 ' + mv.length + '개를 뒤로 미뤄요.' : '남은 일정 ' + all.length + '개를 뒤로 미뤄요.') + ' 동선 지도·「지금 · 다음」도 따라 바뀌어요.</div>' +
    (f0 && mv.length && all.length > mv.length ? '<label class="late-all"><input type="checkbox" id="late_all"> 그 뒤 일정까지 모두 (' + all.length + '개)</label>' : '') +
    '<div class="late-btns">' + [15, 30, 45, 60, 90].map(n => '<button class="btn big" data-act="late-go" data-v="' + n + '">+' + n + '분</button>').join('') + '</div>' +
    (fx.length ? '<div class="card" style="margin-top:12px"><b>시간이 정해진 일정은 그대로예요</b>' + fx.map(i => '<div class="late-fx"><b class="num">' + esc(i.time) + '</b> ' + esc(planName(i)) + '</div>').join('') + '<div class="muted small" style="margin-top:6px">미룬 일정이 이 시간과 겹치면 알려 드려요 — 그땐 하나를 건너뛰어요(건너뛸 일정은 눌러서 「이번엔 건너뛰기」, 다녀온 일정은 동그라미를 꾹 눌러 도장).</div></div>' : '') +
    '<div class="muted small" style="margin-top:10px">하나만 바꾸려면 그 일정을 눌러 시간을 고쳐요 — 순서·동선이 저절로 따라가요.</div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function lateGo(t, n) {
  const box = $('#late_all'), p0 = latePick(t, false), { mv, fx } = latePick(t, (box && box.checked) || !p0.mv.length), back = mv.map(i => Object.assign({}, i));
  mv.forEach(i => put('items', Object.assign({}, i, { time: addMin(i.time, n) }), true));
  closeSheet(); render();
  const clash = fx.filter(f => mv.some(i => { const nt = addMin(i.time, n); return i.time < f.time && nt >= f.time; }));
  toast(mv.length + '개를 ' + n + '분 미뤘어요' + (clash.length ? ' · ⚠️ ' + '겹쳐요: ' + clash.map(f => f.time + ' ' + planName(f)).join(', ') + ' — 하나를 건너뛰어요' : ''), () => { back.forEach(b => put('items', b, true)); render(); });
}
/* ---------- 종이 일정표(인쇄·PDF) — 휴대폰이 꺼지거나 잃어버렸을 때 대비(2026-11-27) ---------- */
function printPlan(t) {
  const days = daysOf(t), hb = hotelOf(t), c = countryOf(t), strip = x => String(x || '').replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
  let h = '<h1>' + esc(t.title) + ' <small>' + esc(t.start + ' ~ ' + t.end) + '</small></h1>';
  h += '<div class="pp-box"><b>숙소</b> ' + esc(hb ? hb.title : '') + '<br><b style="font-size:15pt">' + esc(hb ? (hb.jaAddr || hotelAddr(hb)) : '') + '</b>' + (hb && hb.phone ? ' · ☎ ' + esc(hb.phone) : '') + '<br><b>비상</b> 경찰 110 · 구급·화재 119 · 영사콜센터 +82-2-3210-0404 (24시간 한국어)' + (t.meet ? '<br><b>만날 곳</b> ' + esc(t.meet) : '') + '</div>';
  days.forEach((d, k) => {
    const L2 = live('items', t.id).filter(i => i.date === d && !i.skip).sort(byTime), b = (t.bring || {})[d];
    h += '<h2>' + (k + 1) + '일째 · ' + esc(md(d)) + '</h2><table><tbody>' + L2.map(i => '<tr><td class="tm">' + esc(i.time || '') + '</td><td><b>' + esc(strip(i.title)) + '</b>' + (i.go && i.go.ja ? '<div class="ja">🚕 ' + esc(i.go.ja) + '</div>' : '') + (i.go && i.go.s ? '<div class="go">' + esc(i.go.s) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table>' +
      (b ? '<div class="pp-bring">챙길 것: ' + esc((b.items || []).join(' · ')) + (b.meet ? '<br>흩어지면: ' + esc(b.meet) : '') + '</div>' : '');
  });
  let area = $('#printArea'); if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = h;
  openSheet('<h2>🖨️ 종이 일정표</h2><div class="muted">「인쇄」를 누르면 종이로 뽑거나 <b>PDF로 저장</b>할 수 있어요. PDF를 가족 휴대폰·카카오톡 나에게 보내 두면, 한 대가 꺼져도 다른 휴대폰에서 볼 수 있어요.</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="pp_go">인쇄 · PDF</button></div>', el => { el.querySelector('#pp_go').onclick = () => { closeSheet(); setTimeout(() => window.print(), 300); }; });
}
/* ---------- 휴대폰 달력 알림(.ics) — 놓치면 안 되는 일정만, 인터넷·앱 없이도 휴대폰이 울림(2026-11-27) ---------- */
function icsItems(t) { return live('items', t.id).filter(i => i.date && i.time && !i.skip && (isFixed(i) || /출발 \(|택시로|오픈런|체크아웃|체크인 ·|입차|🔖 예약/.test(i.title || ''))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }
function icsDownload(t) {
  const L2 = icsItems(t); if (!L2.length) return toast('달력에 넣을 시간 정해진 일정이 없어요');
  const p2 = n => String(n).padStart(2, '0'), stamp = d => d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '00Z';
  const tz = t.country === 'KR' || t.country === 'JP' ? '+09:00' : '+09:00'; // 한국·일본 모두 UTC+9
  const fold = x => x.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ev = L2.map(i => {
    const st = new Date(i.date + 'T' + i.time + ':00' + tz), en = new Date(st.getTime() + 30 * 60000);
    const pre = /출발 \(/.test(i.title) ? 180 : /정각/.test(i.title) ? 40 : 20; // 비행기 3시간 전 · 정각 입장 40분 전 · 그 밖 20분 전
    return ['BEGIN:VEVENT', 'UID:' + i.id + '@haha-trip', 'DTSTAMP:' + stamp(new Date()), 'DTSTART:' + stamp(st), 'DTEND:' + stamp(en), 'SUMMARY:' + fold(String(i.title).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')),
      'DESCRIPTION:' + fold(String(i.memo || '').slice(0, 300)), 'LOCATION:' + fold(i.place || ''),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + fold(String(i.title).slice(0, 60)), 'TRIGGER:-PT' + pre + 'M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//haha-trip//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + fold(t.title)].concat(ev, ['END:VCALENDAR']).join('\r\n');
  const blob = new Blob([txt], { type: 'text/calendar;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (t.title || 'trip').replace(/[^\p{L}\p{N}]+/gu, '-') + '-알림.ics'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  openSheet('<h2>📅 달력 알림 ' + L2.length + '개</h2><div class="muted">받은 파일을 열면 휴대폰 달력에 들어가요. 아이폰은 「모두 추가」, 갤럭시는 「캘린더」로 열기 → 저장.</div><div class="card" style="margin-top:12px">' + L2.map(i => '<div class="late-fx"><b class="num">' + esc(md(i.date) + ' ' + i.time) + '</b> ' + esc(String(i.title).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '').slice(0, 40)) + '</div>').join('') + '</div><div class="muted small" style="margin-top:8px">비행기는 3시간 전, 정각 입장은 40분 전, 그 밖은 20분 전에 울려요. 일정이 바뀌면 달력에서 지우고 다시 넣어요.</div><div class="sheet-acts"><button class="btn pri" data-act="sheet-close">확인</button></div>');
}
/** 한 줄 적기 창 */
function askText(title, val, cb) {
  openSheet('<h2>' + esc(title) + '</h2><textarea class="in" id="ask_v" rows="3">' + esc(val || '') + '</textarea><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="ask_ok">저장</button></div>', el => { const i = el.querySelector('#ask_v'); setTimeout(() => i.focus(), 50); el.querySelector('#ask_ok').onclick = () => { const v = i.value; closeSheet(); cb(v); }; });
}
/* ---------- 도움 창 · 택시 카드 (UI/UX 전문가 검토 2026-11-26: 다른 탭으로 넘기지 말고 그 자리에서 크게) ---------- */
function hotelOf(t) { return live('bookings', t.id).find(b => b.kind === '숙소'); }
function hotelAddr(hb) {
  if (!hb) return '';
  if (hb.jaAddr) return hb.jaAddr;
  if (hb.place && !/^[가-힣\s·]+$/.test(hb.place)) return hb.place;
  const m = live('memos', hb.trip).map(x => x.text || '').concat([hb.memo || '']).join('\n').match(/(?:숙소\s*위치|주소)\s*[:：]\s*([^\n]{8,120})/);
  return m ? m[1].trim() : (hb.place || '');
}
function sosOpen(t) {
  const c = countryOf(t), sosMore = (typeof GUIDE !== 'undefined' && GUIDE.SOS_MORE && GUIDE.SOS_MORE[t.country]) || [], hb = hotelOf(t);
  const ins = live('bookings', t.id).filter(b => b.kind === '보험');
  const call_ = (ico, name, num, sub, cls) => '<a class="sos-call' + (cls ? ' ' + cls : '') + '" href="tel:' + esc(num) + '"><span class="sc-ic">' + ico + '</span><span class="sc-t"><b>' + esc(name) + '</b><small>' + esc(sub || num) + '</small></span><span class="sc-n num">' + esc(num) + '</span></a>';
  let h = '<h2>🆘 도움이 필요해요</h2><div class="sos-grid">';
  if (c && c.sos) c.sos.forEach(s => { h += call_(/경찰/.test(s[0]) ? '🚓' : '🚑', s[0], s[1], s[0] === '경찰' ? '사고·도난·길 잃음' : '아프거나 다쳤을 때 · 불', 'big'); });
  h += call_('🇰🇷', '영사콜센터', CONSUL, '한국어 24시간 · 여권 분실·사건 사고', 'big');
  sosMore.forEach(s => { h += call_(/영사관/.test(s[0]) ? '🏛️' : /구급/.test(s[0]) ? '🩺' : 'ℹ️', s[0], s[1], s[2]); });
  ins.forEach(b => { h += b.phone ? call_('🛡️', (b.provider || '보험사') + ' 해외 도움', b.phone, '병원·사고 접수') : '<div class="sos-call"><span class="sc-ic">🛡️</span><span class="sc-t"><b>' + esc(b.provider || '여행자보험') + '</b><small>보험사 앱 → 해외 사고·병원 도움' + (b.code ? ' · 증권 ' + esc(b.code) : '') + '</small></span></div>'; });
  if (hb && hb.phone) h += call_('🏨', '우리 숙소', hb.phone, hb.title);
  h += '</div><button class="btn pri big" style="width:100%;margin-top:12px" data-act="taxi">🚕 택시에 숙소 주소 보여 주기</button>' +
    '<div class="card" style="margin-top:12px"><b>가족 모임 장소 (길을 잃으면)</b><div style="font-size:17px;margin-top:4px">' + esc(t.meet || '숙소 앞에서 만나요') + '</div><div class="muted small" style="margin-top:6px">카드를 잃어버리면 카드사 앱 → 분실 신고(24시간). 트래블카드는 앱에서 바로 잠가요.</div></div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sos-book">수첩의 비상 연락 모두</button><button class="btn" data-act="sheet-close">닫기</button></div>';
  openSheet(h);
}
/** 택시 앱 바로 열기(팀장님 2026-11-27 「오사카에서 가장 잘 작동하는 앱으로 바로 가서 신청」)
 *  ① 디디 — 오사카에서 일본 서비스를 처음 시작, 협력 택시가 많아 가장 빨리 잡힘(nearme 2026-05) ② 카카오T 해외차량호출 — 한국어·한국 카드, 일본 GO 택시 ③ 우버 — 목적지 자동 입력
 *  안드로이드는 깔려 있으면 앱이 바로, 없으면 플레이스토어 / 아이폰은 앱스토어(깔려 있으면 「열기」) — 앱 번호·이름은 스토어에서 2026-11-27 확인 */
const TAXI_APPS = {
  didi: { n: '디디(DiDi)', e: '🟠', bg: '#FFE9D6', pkg: 'com.didiglobal.passenger', ios: '1362398401', sub: '오사카에서 가장 빨리 잡혀요' },
  kakao: { n: '카카오T', e: '🟡', bg: '#FFF6C4', pkg: 'com.kakao.taxi', ios: '981110422', sub: '「해외차량호출」 · 한국어·한국 카드' },
  go: { n: 'GO', e: '⚫', bg: '#E8EAEE', pkg: 'com.dena.automotive.taxibell', ios: '1254341709', sub: '일본 1위 택시 앱' },
  uber: { n: '우버', e: '⬛', bg: '#E8EAEE', pkg: 'com.ubercab', ios: '368677368', sub: '목적지를 저절로 넣어 줘요' },
  usj: { n: 'USJ 공식 앱', e: '🎢', bg: '#E3EEFF', pkg: 'com.universalstudios.japanresort', ios: '532097000', sub: '대기 시간·정리권·공연 시간' } // 2026-11-27 스토어에서 확인
};
function taxiAppUrl(k, dest) {
  const a = TAXI_APPS[k], ua = navigator.userAgent || '';
  if (k === 'uber' && dest && dest.lat != null) return 'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=' + dest.lat + '&dropoff[longitude]=' + dest.lng + '&dropoff[nickname]=' + encodeURIComponent(dest.name || '');
  if (/Android/i.test(ua)) return 'intent://#Intent;package=' + a.pkg + ';S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=' + a.pkg) + ';end';
  return 'https://apps.apple.com/kr/app/id' + a.ios;
}
function taxiAppsHtml(dest) {
  return '<div class="taxi-apps"><b>🚕 택시 부르기 — 앱 바로 열기</b><div class="ta-grid">' + ['didi', 'kakao', 'uber'].map((k, n) => { const a = TAXI_APPS[k];
    const u = taxiAppUrl(k, dest);
    return '<a class="btn ta-btn' + (n === 0 ? ' first' : '') + '" href="' + esc(u) + '"' + (/^intent:/.test(u) ? '' : ' target="_blank" rel="noopener"') + '>' + eb(a.e, a.bg) + '<span><b>' + (n + 1) + '. ' + esc(a.n) + '</b><small>' + esc(a.sub) + '</small></span></a>'; }).join('') +
    '</div><div class="muted small">앱에 목적지를 넣을 땐 아래 「복사」한 일본어 주소를 붙여 넣어요. 우버는 목적지가 저절로 들어가요. 앱이 안 열리면 길에서 빨간 「空車」 택시에 손 들기.</div></div>';
}
/** 택시 타는 법 (팀장님 2026-11-27 「택시 이용은 어떻게? 우버?」) — 꼭 필요할 때만, 넷이 한 대 */
const TAXI_HOW = '<details class="card taxi-how" style="margin-top:12px"><summary><b>🚕 택시 타는 법 (앱 · 길에서)</b></summary><ol>' +
  '<li><b>디디(DiDi) — 오사카에서 가장 빨리 잡혀요</b> — 오사카에서 일본 서비스를 처음 시작해 협력 택시가 많아요. 한국 번호로 가입하고 카드를 등록해 두면(출발 전에!) 일본에서 바로 불러요. 목적지는 일본어 주소를 붙여 넣기.</li>' +
  '<li><b>카카오T 「해외차량호출」</b> — 한국에서 쓰던 카카오T 그대로. 일본에서 앱을 열면 한국어로 목적지를 찾고, 한국에서 등록한 카드로 저절로 내요. 차는 일본 택시 앱 GO가 보내 줘요. 차가 오면 앱의 <b>탑승 확인번호</b>를 기사님께 보여 줘요. 부르기 전에 예상 요금도 보여요.</li>' +
  '<li><b>우버</b> — 오사카에서는 우버로 「일반 택시」를 불러요(4명까지). 한국에서 쓰던 우버 계정·카드 그대로.</li>' +
  '<li><b>길에서 잡기</b> — 앞 유리의 빨간 「空車」(빈 차) 불을 보고 손을 들어요. <b>뒷문은 저절로 열리고 닫혀요 — 손대지 마세요.</b> 역 앞 「タクシー乗り場」(택시 타는 곳)에서 줄 서도 돼요.</li>' +
  '<li><b>탄 뒤</b> — 이 화면(일본어 주소)을 기사님께 보여 드려요. 넷이면 보통 택시 한 대(앞 1 · 뒤 3). 큰 가방은 트렁크.</li>' +
  '<li><b>내기</b> — 카드(트래블카드 포함)·현금 모두 돼요. 팁은 없어요. 밤 10시~새벽 5시는 2할 더 붙어요. 영수증(領収書)을 받아 「🧾 영수증 찍기」로 남겨요.</li>' +
  '</ol><div class="muted small">요금: 오사카 처음 1.2km 600엔, 231m마다 100엔(2025년 11월부터). 넷이 한 대면 짧은 거리는 전철 네 명 값과 비슷해요. 이 여행의 택시는 세 번 — 12/30 새벽 숙소 → 신이마미야, 12/30 밤 스파월드 → 숙소, 12/31 시치조역 → 기요미즈데라.</div></details>';
function taxiOpen(t, it) {
  // 일정의 택시 칸에서 열면 그 목적지(일본어 이름 go.ja)를, 아니면 숙소 주소를 크게(시뮬레이션 2026-11-27)
  if (it && it.go && it.go.ja) {
    const g = it.go, map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(g.to || g.ja);
    return openSheet('<div class="taxi-card"><div class="taxi-ja">ここまでお願いします</div><div class="taxi-ko">여기로 가 주세요</div>' +
      '<div class="taxi-addr">' + esc(g.ja) + '</div><div class="taxi-name">' + esc(g.ko || it.title.replace(/^🚕\s*/, '')) + '</div></div>' +
      (g.s ? '<div class="muted" style="margin-top:10px">' + esc(g.s) + '</div>' : '') + taxiAppsHtml({ lat: it.lat, lng: it.lng, name: g.ja }) + TAXI_HOW +
      '<div class="sheet-acts"><button class="btn" data-act="taxi-copy" data-v="' + esc(g.ja) + '">복사</button><a class="btn" href="' + map + '" target="_blank" rel="noopener">지도</a><button class="btn pri" data-act="sheet-close">닫기</button></div>');
  }
  const hb = hotelOf(t), addr = hotelAddr(hb), ja = hb && hb.jaAddr;
  if (!hb) return toast('숙소 예약이 없어요. 티켓·예약에 숙소를 넣어 주세요');
  const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr || hb.title);
  openSheet('<div class="taxi-card"><div class="taxi-ja">この住所までお願いします</div><div class="taxi-ko">이 주소로 가 주세요</div>' +
    '<div class="taxi-name">' + esc(hb.title) + '</div><div class="taxi-addr">' + esc(addr || '주소가 아직 없어요') + '</div>' +
    (hb.phone ? '<div class="taxi-tel">☎ <a href="tel:' + esc(hb.phone) + '">' + esc(hb.phone) + '</a></div>' : '') + '</div>' +
    (!ja ? '<div class="alert" style="--cc:var(--sun);margin-top:10px"><span><b>일본어 주소를 넣어 두면 더 좋아요</b><span>예약 확인 메일·지도의 일본어 주소(大阪市西成区…)를 붙여 넣으면 기사님께 그대로 보여 드릴 수 있어요.</span></span></div><button class="btn" style="width:100%;margin-top:8px" data-act="taxi-ja">일본어 주소 넣기</button>' : '') +
    taxiAppsHtml({ lat: hb.lat, lng: hb.lng, name: hb.jaAddr || hb.title }) + TAXI_HOW +
    '<div class="sheet-acts"><button class="btn" data-act="taxi-copy" data-v="' + esc(addr) + '">주소 복사</button><a class="btn" href="' + map + '" target="_blank" rel="noopener">지도</a><button class="btn pri" data-act="sheet-close">닫기</button></div>');
}

/* ---------- 설정 ---------- */
function settings() {
  const big = document.documentElement.classList.contains('big');
  openSheet('<h2>설정</h2><div class="flex" style="margin-bottom:8px">' + av(ME, 44) + '<div><b style="font-size:17px">' + esc(ME) + '</b><div class="muted">이 휴대폰을 쓰는 사람</div></div></div><div class="menu-list">' +
    '<button data-act="big">' + ib('text', 'var(--coral)', 1) + '<span>글씨 ' + (big ? '보통으로' : '크게') + '<small>지금 ' + (big ? '크게' : '보통') + '</small></span></button>' +
    '<button data-act="solid">' + ib('sun', 'var(--sky)', 1) + '<span>' + (document.documentElement.classList.contains('solid') ? '유리 효과 다시 켜기' : '선명하게 (유리 효과 끄기)') + '<small>' + (document.documentElement.classList.contains('solid') ? '지금 선명하게 보여요' : '글씨가 잘 안 보이면 눌러 주세요') + '</small></span></button>' +
    '<button data-act="who-again">' + ib('users', 'var(--sky)', 1) + '<span>다른 사람으로 바꾸기</span></button>' +
    '<button data-act="fam-edit">' + ib('users', 'var(--mint)', 1) + '<span>가족 목록<small>' + esc(D.meta.family.map(f => f.name).join(', ')) + '</small></span></button>' +
    '<button data-act="pass-edit">' + ib('key', 'var(--sun)', 1) + '<span>가족 암호 바꾸기<small>바꾸면 다른 가족도 새 암호를 넣어야 해요</small></span></button>' +
    '<button data-act="drive-open">' + ib('folder', 'var(--sun)', 1) + '<span>구글 드라이브 폴더<small>4gospel 「하하가족여행」 — 원본·사진·기록 문서·백업 (저절로 저장)</small></span></button>' +
    '<button data-act="notion-edit">' + ib('notion', 'var(--ink)', 1) + '<span>노션 연결<small>「하하가족여행」 정리함으로 보내기</small></span></button>' +

    (curTrip() ? '<button data-act="print-plan">' + ib('doc', 'var(--sky)', 1) + '<span>🖨️ 종이 일정표 · PDF<small>휴대폰이 꺼질 때를 대비해 한 장으로 — 일정·숙소 일본어 주소·비상 연락</small></span></button>' : '') +
    (curTrip() ? '<button data-act="ics">' + ib('plan', 'var(--coral)', 1) + '<span>📅 휴대폰 달력에 알림 넣기<small>정각 입장·공연·배·비행기 — 앱을 안 열어도 미리 울려요</small></span></button>' : '') +
    '<button data-act="offline">' + ib('download' in ICON ? 'download' : 'folder', 'var(--mint)', 1) + '<span>여행 전 오프라인 준비<small>' + (LS.get('offlineAt', 0) ? '✅ 받아 둠 · ' + new Date(LS.get('offlineAt', 0)).toLocaleDateString('ko-KR') : '인터넷이 되면 저절로 받아요') + '</small></span></button>' +
    '<button data-act="news">' + ib('plane', 'var(--coral)', 1) + '<span>새 소식<small>바뀐 것 다시 보기</small></span></button>' +
    '<button data-act="install">' + ib('phone', 'var(--sky)', 1) + '<span>홈 화면에 앱처럼 두기</span></button>' +
    '<button data-act="copy-link">' + ib('link', 'var(--mint)', 1) + '<span>앱 주소 복사<small>가족에게 보내 주세요 (암호는 따로)</small></span></button>' +
    '<button data-act="pull">' + ib('sync', 'var(--sky)', 1) + '<span>지금 새로 받기<small>앱 v' + APP_V + ' · 기록 판 ' + D.rev + (Q.length ? ' · 못 보낸 고침 ' + Q.length + '개' : '') + '</small></span></button>' +
    '<button data-act="logout" style="color:var(--warn)">' + ib('out', 'var(--warn)', 1) + '<span>이 기기에서 나가기<small>이 휴대폰의 사본과 암호를 지워요</small></span></button>' +
    '</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function famEdit() {
  openSheet('<h2>가족 목록</h2><p class="muted">한 줄에 한 사람, 「이름 / 관계」로 적어 주세요. 관계는 인사말에 쓰여요(예: 아빠).</p><textarea class="in" id="famtx" rows="6">' + esc(D.meta.family.map(f => f.name + ' / ' + (f.role || '')).join('\n')) + '</textarea>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="famgo">저장</button></div>', el => el.querySelector('#famgo').onclick = () => {
      const fm = el.querySelector('#famtx').value.split('\n').map(l => l.split('/').map(s => s.trim())).filter(x => x[0]).map(x => ({ name: x[0], role: x[1] || '' }));
      if (!fm.length) return toast('한 사람 이상 적어 주세요');
      put('meta', Object.assign({}, D.meta, { family: fm })); closeSheet(); toast('가족 목록을 저장했어요');
    });
}
function passEdit() {
  openSheet('<h2>가족 암호 바꾸기</h2><input class="in" id="np" type="text" placeholder="새 암호 (4자 이상)" autocomplete="off"><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="npgo">바꾸기</button></div>',
    el => el.querySelector('#npgo').onclick = async () => {
      const np = el.querySelector('#np').value.trim(); if (np.length < 4) return toast('4자 이상으로 해 주세요');
      try { await call('setPass', np); PASS = np; LS.set('pass', np); closeSheet(); toast('암호를 바꿨어요. 가족에게 알려 주세요'); } catch (er) { toast('못 바꿨어요: ' + er.message); }
    });
}
async function notionEdit() {
  let st = { key: false, parent: false };
  try { st = await call('notionState'); } catch (e) {}
  openSheet('<h2>노션 「하하가족여행」 정리함</h2><div class="muted" style="margin-bottom:12px">노션에 데이터베이스 다섯 개를 만들어 여행마다 정리해요: 🧳 여행 · 🗓️ 일정 · 💳 경비 · 🎫 예약·서류 · 📔 추억(일기·가 본 곳·주차).<br><br>' +
    '① notion.so/profile/integrations → 「새 통합」 만들고 열쇠(ntn_…) 복사<br>② 노션에 「하하가족여행」 페이지를 만들고 ⋯ → 「연결」에서 그 통합 더하기<br>③ 아래에 열쇠와 페이지 주소를 넣고 「정리함 만들기」</div>' +
    '<div class="f"><label class="fl"><span>통합 열쇠 ' + (st.key ? '(들어 있음 — 바꿀 때만)' : '') + '</span><input class="in" id="nk" type="password" placeholder="ntn_…" autocomplete="off"></label>' +
    '<label class="fl"><span>「하하가족여행」 노션 페이지 주소 ' + (st.parent ? '(들어 있음)' : '') + '</span><input class="in" id="np2" type="url" placeholder="https://www.notion.so/…"></label></div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="nkgo">저장</button></div>' +
    (st.key && st.parent ? '<button class="btn mint wide big" style="margin-top:10px" data-act="notion-setup">정리함 만들기</button>' : ''), el => el.querySelector('#nkgo').onclick = async () => {
      try { const r = await call('setNotion', el.querySelector('#nk').value.trim(), el.querySelector('#np2').value.trim()); if (r.key && r.parent) { await call('notionSetup'); toast('노션에 정리함을 만들었어요'); closeSheet(); } else toast('열쇠와 페이지를 모두 넣어 주세요'); }
      catch (er) { toast('안 됐어요: ' + er.message); }
    });
}
async function aiEdit() {
  let st = { gemini: false, claude: false }; try { st = await call('aiState'); } catch (e) {}
  openSheet('<h2>AI 도우미</h2><p class="muted">AI 열쇠를 넣으면 사진으로 여행 정리, 영수증·예약 화면 읽기, 메뉴판 사진 번역을 AI가 해요. 클로드 열쇠가 있으면 클로드를 먼저 쓰고, 안 되면 제미나이를 써요. 열쇠는 4gospel 구글 서버에만 보관되고 앱·기기에는 남지 않아요.</p>' +
    '<label class="fl"><span>클로드 열쇠 ' + (st.claude ? '(들어 있음 ✓)' : '(없음)') + ' — platform.claude.com → API Keys</span><input class="in" id="ck" type="password" placeholder="sk-ant-…" autocomplete="off"></label>' +
    '<label class="fl"><span>제미나이 열쇠 ' + (st.gemini ? '(들어 있음 ✓)' : '(없음)') + ' — aistudio.google.com (4gospel)</span><input class="in" id="gk" type="password" placeholder="AIza…" autocomplete="off"></label>' +
    '<div class="muted small" id="aitest-msg" style="margin:4px 2px 10px">' + (st.claude || st.gemini ? '지금 쓰는 AI: ' + (st.claude ? '클로드' : '제미나이') : '열쇠가 없어도 사진 날짜·위치와 구글 글자 읽기로 정리는 돼요.') + '</div>' +
    '<div class="sheet-acts">' + (st.claude ? '<button class="btn danger" id="ckdel">클로드 빼기</button>' : '') + (st.gemini ? '<button class="btn danger" id="gkdel">제미나이 빼기</button>' : '') +
    (st.claude || st.gemini ? '<button class="btn" id="aitest">연결 시험</button>' : '') + '<button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="aigo">저장</button></div>', el => {
      el.querySelector('#aigo').onclick = async () => {
        const c = el.querySelector('#ck').value.trim(), g = el.querySelector('#gk').value.trim();
        if (!c && !g) return toast('넣을 열쇠가 없어요');
        try { if (c) await call('setClaude', c); if (g) await call('setGemini', g); toast('저장했어요 — 연결 시험을 해 볼게요'); aiEdit().then(() => { const b = $('#aitest'); if (b) b.click(); }); } catch (er) { toast(er.message); }
      };
      const cd = el.querySelector('#ckdel'); if (cd) cd.onclick = async () => { await call('setClaude', '-'); toast('클로드 열쇠를 뺐어요'); aiEdit(); };
      const gd = el.querySelector('#gkdel'); if (gd) gd.onclick = async () => { await call('setGemini', '-'); toast('제미나이 열쇠를 뺐어요'); aiEdit(); };
      const tb = el.querySelector('#aitest'); if (tb) tb.onclick = async () => {
        const m = el.querySelector('#aitest-msg'); m.textContent = '시험하는 중…';
        try { const r = await call('aiTest'); m.textContent = r.ok ? '✓ ' + (r.via === 'claude' ? '클로드' : '제미나이') + ' 연결됨 — 「' + (r.hi || '') + '」' : '연결이 안 돼요: ' + (r.msg || ''); }
        catch (er) { m.textContent = '연결이 안 돼요: ' + er.message; }
      };
    });
}

/* ---------- 새 소식 (바뀐 것을 엽서로) ---------- */
const NEWS = [
  { v: '8.0', d: '2026-11-27', title: '비행기 전날 챙김', items: [
    ['plane', 'var(--lav)', '✈️ 내일 비행기', '비행기 타기 전날 오늘 화면에 「내일 비행기」 카드가 떠요. 온라인 체크인·여권·충전·알람 시각까지 한눈에, 돌아오는 날 전날엔 면세품 따로 싸기와 숙소 나가는 시각도요.']] },
  { v: '7.9', d: '2026-11-27', title: 'USJ 앱 바로 · 하루 한 줄', items: [
    ['ticket', 'var(--sky)', '🎢 USJ 공식 앱 열기', 'USJ 날 일정 창에서 공식 앱을 바로 열어 지금 대기 시간·정리권·공연 시간을 봐요.'],
    ['pen', 'var(--pink)', '📔 오늘 하루 한 줄', '밤 8시가 지나면 오늘 화면에 「오늘 하루 한 줄 남기기」가 떠요. 가장 좋았던 것 하나와 사진 한 장 — 「추억」에 모여요.']] },
  { v: '7.8', d: '2026-11-27', title: '날씨 챙김 · 오늘 예산 · 종이 일정표', items: [
    ['sun', 'var(--sky)', '날씨에 맞춰 챙길 것', '여행 날 예보가 나오면(출발 16일 전부터) 「오늘 챙길 것」에 ☔ 우산, 🧤 장갑·핫팩이 저절로 붙어요.'],
    ['money', 'var(--coral)', '오늘 예산과 견주기', '오늘 화면 「오늘 쓴 돈」에 그날 예산과 막대가 보여요. 예산보다 더 쓰면 빨갛게 알려 줘요.'],
    ['doc', 'var(--mint)', '🖨️ 종이 일정표 · PDF', '설정 → 「종이 일정표 · PDF」로 네 날 일정·숙소 일본어 주소·비상 연락을 한 장으로 뽑거나 PDF로 저장해요. 휴대폰이 꺼져도 다른 가족이 볼 수 있어요.'],
    ['plane', 'var(--lav)', '새해', '12/31 저녁엔 「새해까지 몇 시간」, 1/1 아침엔 일본어 새해 인사(눌러서 듣기)가 나와요.']] },
  { v: '7.7', d: '2026-11-27', title: '다음 길찾기 · 그 자리 일본어', items: [
    ['route', 'var(--coral)', '🧭 다음 일정 길찾기', '오늘 화면 「지금 · 다음 일정」에 다음 갈 곳까지 길찾기 단추가 크게 있어요. 한 번 누르면 구글 지도가 열려요.'],
    ['mic', 'var(--sky)', '🗣️ 여기서 쓸 일본어', '식당·가게·택시·관광 일정을 열면 그 자리에서 쓸 일본어(4명이에요, 이거 주세요, 계산해 주세요, 면세 되나요 등)를 눌러 소리로 들려줘요. 받아 둔 음성이라 인터넷 없이도 나와요.']] },
  { v: '7.6', d: '2026-11-27', title: '달력 알림 · 마우스로 펼치기', items: [
    ['plan', 'var(--coral)', '📅 휴대폰 달력에 알림', '설정 → 「휴대폰 달력에 알림 넣기」를 누르면 놓치면 안 되는 일정(비행기·닌텐도 16시 정각·유람선 18:30·나이트 쇼·택시 등)이 휴대폰 달력에 들어가요. 앱을 안 열어도, 인터넷이 없어도 미리 울려요.'],
    ['check', 'var(--sky)', 'PC에선 마우스로', '카드에 마우스를 올리면 잠시 뒤 그 카드가 먼저 펼쳐지고, 떠나면 다시 접혀요.']] },
  { v: '7.5', d: '2026-11-27', title: '오늘 챙길 것 · 인터넷 없이 지도', items: [
    ['prep', 'var(--mint)', '🎒 오늘 챙길 것', '오늘 화면에 그날 꼭 챙길 것(USJ 날 핫팩·티켓, 교토 날 현금·수건 등)과 「흩어지면 만날 곳」을 보여 줘요. 저녁 6시부터는 내일 것이 먼저 나와요.'],
    ['globe', 'var(--sky)', '지도도 인터넷 없이', '한 번 본 동선 지도는 휴대폰에 담아 두어 일본에서 인터넷이 끊겨도 보여요. 출발 전에 네 날 「이날 동선」을 구역마다 한 번씩 눌러 두세요.']] },
  { v: '7.4', d: '2026-11-27', title: '택시는 앱으로 바로 · 지도에 내 위치', items: [
    ['sos', 'var(--coral)', '택시 앱 바로 열기', '택시 카드에서 ① 디디(오사카에서 가장 빨리 잡혀요) ② 카카오T 「해외차량호출」 ③ 우버(목적지 저절로)를 바로 열어요. 출발 전에 준비물 「택시 앱 미리 깔고 가입·카드 등록」을 꼭 해 두세요.'],
    ['globe', 'var(--sky)', '지도에 📍 내 위치', '동선 지도 위 「📍 내 위치」를 누르면 지금 있는 곳이 파란 점으로 보여요. 오늘 지도에서는 다음에 갈 일정 핀이 반짝이고, 핀을 누르면 「여기로 길찾기」가 열려요. 도톤보리는 크게, 신사이바시는 따로 나눴어요.']] },
  { v: '7.3', d: '2026-11-27', title: '동선 지도를 다시 다듬었어요', items: [
    ['globe', 'var(--sky)', '하루 전체는 구역 이름표로', '「하루 전체」 지도는 「USJ 3–19」처럼 구역마다 이름표 하나로 묶어 보여요. 이름표를 누르면 그 구역 지도로 들어가요. 역·숙소는 작은 점이에요.'],
    ['check', 'var(--mint)', '자리 고침', '숙소·택시·전철 도착점이 엉뚱한 곳에 찍히던 것을 바로잡고, 붙어 있는 핀은 살짝 비켜 번호가 보여요. 핀이 하나뿐인 구역을 눌러도 지도가 사라지지 않아요.'],
    ['ticket', 'var(--coral)', 'USJ 지도를 크게', '핀이 많은 USJ 같은 구역은 휴대폰 화면 양끝까지 꽉 채우고 한 단계 더 확대해 보여요. 지도 높이도 핀이 퍼진 모양에 맞춰 저절로 정해져요.']] },
  { v: '7.2', d: '2026-11-27', title: '읽을 때만 스르륵 펼쳐져요', items: [
    ['plan', 'var(--coral)', '카드가 스르륵', '일정·오늘 화면·예약 모두·여행 정보 「알아 둘 것」·가고 싶은 곳의 긴 글은 스크롤하는 동안 접혀 있다가, 멈춰서 화면 가운데 카드를 보고 있으면 스르륵 펼쳐지고, 다시 스크롤하면 스르륵 접혀요. 눌러서 펼친 카드는 그대로 둬요.'],
    ['globe', 'var(--sky)', '예쁜 단추 그림', '길찾기 단추에 색 네모 이모티콘(🗺️🚶🚕🍜🏪🎡)을 넣고, 창 아래 단추 크기를 알맞게 줄였어요.']] },
  { v: '7.1', d: '2026-11-27', title: '일정 창 제목이 위에 붙어 있어요', items: [
    ['plan', 'var(--sky)', '내리면 작아지는 제목', '일정을 눌러 연 창을 아래로 내리면 제목이 부드럽게 작아지며 창 맨 위에 붙어 있어요. 어떤 일정을 보고 있는지 늘 보여요.']] },
  { v: '7.0', d: '2026-11-27', title: '모든 날을 세밀하게 · 카드는 접어서', items: [
    ['plan', 'var(--coral)', '네 날 모두 세부 일정', '12/29 인천공항·간사이공항·난바·오사카성·도톤보리, 12/30 USJ·신세카이, 12/31 교토 네 곳, 1/1 간사이공항(면세 환급·체크인·출국)까지 구역마다 나눴어요. 꼭 필요한 정보(게이트·면세 환급·쿠시카쓰 소스 규칙 등)만 골라 넣었어요.'],
    ['check', 'var(--mint)', '카드는 평소 접혀요', '메모 첫 줄만 보이고 💡 주의 사항은 접혀요. 지금·90분 안 일정은 저절로 펼쳐지고, 접힌 카드는 한 번 누르면 펼침 · 한 번 더 누르면 자세히 · 화면 가운데에 잠깐 두면 저절로 펼쳐져요.'],
    ['globe', 'var(--sky)', '동선 구역 단추', '구역 단추가 휴대폰에서 잘리지 않게 여러 줄로 감쌌어요.']] },
  { v: '6.9', d: '2026-11-27', title: '교토 하루를 세밀하게', items: [
    ['torii', 'var(--coral)', '12/31 교토 세부 일정', '기요미즈(인왕문 → 본당 무대 → 오쿠노인 전망 → 오토와 폭포 → 산넨자카 → 니넨자카 → 야사카 탑), 후시미(큰 도리이·누문 → 센본 도리이 → 도리이 길 끝에서 돌아 내려오기 → 네자메야 점심), 니시키(덴만구 → 먹거리 걷기 → 서쪽 끝 한큐 가라스마역), 아라시야마(도게쓰쿄 → 온천)로 나눴어요.'],
    ['globe', 'var(--sky)', '구역마다 동선 지도', '「이날 동선」에서 「기요미즈 안 · 후시미 안 · 니시키 안 · 아라시야마 안 · 하루 전체」로 골라 봐요. 욧쓰지 전망·대나무숲은 「선택」으로 회색으로 넣어 두었어요 — 눌러 「다시 넣기」.'],
    ['check', 'var(--mint)', '고친 것', '일정을 눌렀을 때 창이 중간부터 보이던 것, 지도 「크게」 단추가 창 위에 뜨던 것을 고쳤어요.']] },
  { v: '6.8', d: '2026-11-27', title: '꾹 눌러 찍는 완료 도장', items: [
    ['check', 'var(--coral)', '완료 도장', '일정 카드 오른쪽 동그라미를 0.7초 꾹 누르면 도장이 찍혀요(살짝 누르면 안 찍혀요 — 실수 막기). USJ 안은 파란 「USJ CLEAR!」, 다른 일정은 우리 「하하가족」 도장이에요. 지우려면 다시 꾹.'],
    ['route', 'var(--sky)', '바뀌었나요?', '일정을 눌러 열면 −15·+15·+30·+60분으로 바로 옮기거나 「이번엔 건너뛰기」를 할 수 있어요. 건너뛴 일정은 회색으로 남고 동선·예산·「지금 · 다음」에서만 빠져요. 전철 시간이 달라지면 「다음 열차를 봐요」라고 알려 줘요.'],
    ['text', 'var(--mint)', '줄바꿈', '모든 화면에서 마지막 줄에 한 글자만 남지 않게 다듬었어요.']] },
  { v: '6.7', d: '2026-11-27', title: '늦어지거나 순서가 바뀌어도 따라가요', items: [
    ['route', 'var(--coral)', '⏱ 늦어졌어요', '오늘 화면 「지금 · 다음 일정」의 「⏱ 늦어졌어요」를 누르고 +15·30·60분을 고르면, 다음 시간 정해진 일정(정각 입장권·공연·배·비행기) 앞까지 한꺼번에 미뤄요. 겹치면 알려 주고, 되돌리기도 돼요.'],
    ['globe', 'var(--sky)', '순서를 바꾸면 동선도', '일정 시간을 고치면 순서·동선 지도·「지금 · 다음」이 저절로 바뀌어요. USJ 안 걸음 분은 바로 앞 일정에서 다시 셈해요. 전철·택시 길은 앞 일정이 바뀌면 「길찾기로 다시 봐요」라고 알려 줘요.']] },
  { v: '6.6', d: '2026-11-27', title: '여행 날처럼 써 보고 고쳤어요', items: [
    ['sos', 'var(--coral)', '택시는 「기사님께 보여 주기」', '일정의 택시 칸에서 누르면 갈 곳을 일본어 큰 글씨로 보여 줘요. 「택시 타는 법」에 카카오T 「해외차량호출」(한국어·한국 카드 그대로)·우버·길에서 잡는 법을 적었어요.'],
    ['check', 'var(--mint)', '예약할 곳은 하나', '미리 예약할 곳은 12/31 저녁 우설집(리큐) 하나예요. 준비물 「12/31 저녁 식당 예약」에 순서와 전화할 때 쓸 일본어를 적었어요. 톤보리 유람선은 18:30 배로 고쳤어요(정각·30분에만 떠요).'],
    ['ticket', 'var(--sky)', 'USJ는 기다림까지', '놀이기구마다 ⏳ 예상 대기와 ⭐ 순서를 달았어요. 겨울에 젖는 쥬라기 라이드는 빼고, 남매는 플라잉 다이너소어를 싱글라이더로.'],
    ['plan', 'var(--lav)', '작은 고침', '「내일 쓸 티켓」은 한 줄로, 「오늘 쓴 돈」에는 미리 낸 돈을 빼고, 「차 세웠나요?」는 비행기 뜨기 전까지만 보여요.']] },
  { v: '6.5', d: '2026-11-27', title: '하루 동선 지도 · USJ 세부 일정', items: [
    ['globe', 'var(--sky)', '이날 동선', '일정 → 하루씩에서 그날 갈 곳을 번호와 점선으로 지도에 보여 줘요. 🚕·🚃 같은 탈것 그림도 붙어요. USJ 날은 「USJ 안 | 하루 전체」로 바꿔 볼 수 있어요.'],
    ['ticket', 'var(--coral)', 'USJ 12/30 세부 일정', '오픈런 → 닌텐도(동키콩·마리오 카트) → 바우처 간식 → 죠스·플라잉 다이너소어 → 워터월드 → 해리포터(랠리·금지된 여행·점심·마법 생물) → 16시 닌텐도 다시 → 나이트 쇼. 싱글라이더 되는 곳도 적었어요.'],
    ['sos', 'var(--warn)', '택시는 꼭 필요할 때만', '새벽 어두운 길(숙소 → 신이마미야), 한밤 귀가(스파월드 → 숙소), 기요미즈 오르막 세 번만 타요. 넷이 한 대면 전철값과 비슷해요.']] },
  { v: '6.4', d: '2026-11-27', title: '오프라인 준비가 저절로 돼요', items: [
    ['folder', 'var(--mint)', '저절로 받아 두기', '앱을 열고 인터넷이 되면 그림·일본어 소리·지도·티켓을 저절로 휴대폰에 받아 둬요. 따로 누르지 않아도 돼요. 설정 → 「여행 전 오프라인 준비」에서 ✅로 확인할 수 있어요.'],
    ['sos', 'var(--coral)', '택시 카드에 일본어 주소', '숙소 주소를 일본어(大阪市西成区花園南1丁目10-4)로 넣었어요. 「택시에 숙소 주소 보여 주기」를 기사님께 그대로 보여 드리면 돼요.'],
    ['ticket', 'var(--sky)', 'USJ 오픈런', '12/30 USJ는 공식 8시 개장이지만 연말엔 7:15~7:45쯤 일찍 열려요. 새벽 5:45에 숙소를 나서 6:30에 입구에 서도록 아침 일정을 앞당겼어요.']] },
  { v: '6.3', d: '2026-11-26', title: '여섯 전문가 점검을 반영했어요', items: [
    ['sos', 'var(--warn)', '도움 창 · 택시 카드', '「도움이 필요해요」를 누르면 110·119·영사콜센터를 큰 단추로 바로 걸 수 있어요. 「택시에 숙소 주소 보여 주기」는 기사님께 그대로 보여 드리는 큰 글씨 화면이에요.'],
    ['folder', 'var(--mint)', '여행 전 오프라인 준비', '설정 → 「여행 전 오프라인 준비」를 와이파이에서 한 번 눌러 주세요. 인터넷이 끊겨도 티켓·그림·지도·일본어 소리가 열려요.'],
    ['check', 'var(--sky)', '더 튼튼하게', '약한 신호에서도 빨리 열리고, 저장이 멈추지 않아요. 지갑은 늘 「티켓」부터 열려요. 오늘 화면은 「지금 · 다음 (몇 분 뒤)」를 1분마다 고쳐 보여요.'],
    ['plan', 'var(--coral)', '일정에 주의할 점', '여행 전문가가 짚은 곳(새벽 신이마미야 길, 빠듯한 오사카성·교토, 설날 공항 열차)에 ⚠️ 팁을 달았어요.']] },
  { v: '6.2', d: '2026-11-26', title: '예산을 현실에 맞췄어요', items: [
    ['money', 'var(--mint)', '예산 · 쓴 돈 · 남은 예산', '경비 맨 위에 세 숫자를 크게 나눠 보여요. 막대는 미리 낸 돈·여행 중 쓴 돈·남은 돈이에요. 「누가 냈나」는 부부를 한 줄로 묶었어요.'],
    ['check', 'var(--sky)', '모든 금액 다시 확인', '전철·지하철 요금, 입장료, 식당 값을 공식 누리집과 최신 자료로 확인해 고쳤어요. 차비가 예산에서 빠지던 것, USJ 티켓이 두 번 더해지던 것도 고쳤어요.'],
    ['ticket', 'var(--coral)', 'USJ 해리포터 점심', '12/30 11:00 스리 브룸스틱스 점심(1인 약 3,000엔)과 버터비어(900엔), 파크 간식(약 2,000엔)을 예산에 넣었어요.'],
    ['receipt', 'var(--lav)', '일본 영수증을 더 잘 읽어요', '편의점·식당·면세·발권기·택시·손글씨 영수증 22장으로 시험해 금액·날짜·가게 이름을 모두 맞게 읽도록 고쳤어요.']] },
  { v: '6.1', d: '2026-11-26', title: '앱 전체가 맑은 유리처럼', items: [
    ['sun', 'var(--sky)', '유리 디자인', '디자인·사용성 전문가 검토를 거쳐 앱 전체를 새 아이폰처럼 유리 느낌으로 바꿨어요. 메뉴·단추·고르기 칸은 유리, 일정·돈·글은 또렷한 바탕 그대로예요.'],
    ['check', 'var(--mint)', '더 잘 보이게', '단추 글자 색을 진하게 해서 햇빛 아래서도 잘 보여요. 작은 글씨도 조금 키웠어요.'],
    ['users', 'var(--coral)', '「선명하게」 설정', '유리 느낌이 눈에 불편하면 설정 → 「선명하게 (유리 효과 끄기)」를 눌러 주세요.']] },
  { v: '6.0', d: '2026-11-26', title: '늘 밝은 화면으로', items: [
    ['sparkle' in ICON ? 'sparkle' : 'sun', 'var(--sky)', '유리처럼 맑은 아래 메뉴', '아래 메뉴와 지갑 티켓 화면이 새 아이폰처럼 유리 모양이 됐어요. QR이 있는 칸은 스캐너가 잘 읽도록 하얀색 그대로예요.'],
    ['sun', 'var(--sun)', '밝은 화면만', '휴대폰이 어두운 화면(야간 모드)이어도 앱은 늘 밝은 화면으로 열려요.'],
    ['ticket', 'var(--c-관광)', '「표」 대신 「티켓」', '지갑 안 말이 「🎫 티켓 | 💰 경비」, 「티켓 넣기」, 「지금 쓸 티켓」처럼 바뀌었어요.']] },
  { v: '5.9', d: '2026-11-26', title: '경비는 지갑 안으로', items: [
    ['wallet', 'var(--mint)', '아래 메뉴는 다시 4개', '오늘 · 일정 · ＋ · 지갑 · 수첩이에요. 「경비」 자리에 「지갑」이 들어갔어요.'],
    ['money', 'var(--coral)', '지갑 안에 「표 | 경비」', '지갑 맨 위에서 「🎫 표」와 「💰 경비」를 골라요. 쓴 돈·예산·정산은 모두 「💰 경비」에 그대로 있어요.']] },
  { v: '5.8', d: '2026-11-26', title: '지갑은 나만 봐요', items: [
    ['ticket', 'var(--c-관광)', '내 표만 보여요', '지갑에는 내 이름의 표만 보여요. 아빠(임요한)는 가족 모두의 표를 보고 입구에서 「가족 모두 차례로」 보여 줄 수 있어요.'],
    ['check', 'var(--mint)', '암호 넣을 때 끊기지 않게', '암호를 넣는 중에 앱이 새 판으로 바뀌며 처음 화면으로 돌아가던 것을 고쳤어요. 처음엔 자료를 받느라 10초쯤 걸릴 수 있어요.']] },
  { v: '5.7', d: '2026-11-26', title: '아래 메뉴에 「지갑」이 생겼어요', items: [
    ['ticket', 'var(--c-관광)', '표만 따로 모아서', '아래 메뉴 「지갑」을 누르면 입장권·탑승권 같은 표만 사람마다 모여 있어요. 예약 목록은 「예약 모두」에서 봐요.'],
    ['plane', 'var(--coral)', '탑승권은 발급 전', '비행기 표는 아직 발급 전이라 「⏳ 발급 전」 카드로 기다려요. 온라인 체크인 뒤 탑승권 화면을 찍어 「표 넣기」로 넣으면 돼요.'],
    ['check', 'var(--mint)', 'USJ 표 12장 준비 끝', '1일 입장권·닌텐도 월드 입장권(16:00 정각)·푸드 바우처가 네 식구 지갑에 3장씩 들어 있어요.']] },
  { v: '5.6', d: '2026-11-26', title: '사람마다 지갑이 생겼어요', items: [
    ['wallet', 'var(--c-관광)', '내 이름 지갑', '지갑에 임요한·장보정·임하은·임하늘 이름마다 표 모음이 있어요. 오늘 쓸 표가 맨 앞에 오고, 누르면 큰 표로 열려요. 옆으로 밀면 다음 표예요.'],
    ['ticket', 'var(--coral)', 'QR이 크고 또렷하게', 'A4 바우처를 찍어 넣으면 QR·바코드만 찾아 휴대폰에 맞는 멋진 표 모양으로 다시 그려요. 비행기·배·기차·놀이공원·전망대·식당·공연 표 모양이 있어요. 원본도 「원본」 단추로 볼 수 있어요.'],
    ['check', 'var(--mint)', '인터넷이 없어도', '넣은 표는 휴대폰에 저장돼서 인터넷이 안 돼도 앱만 열면 보여요. USJ 날엔 오늘 화면에 「지금 쓸 표」가 뜨고, 「가족 모두」를 누르면 한 사람씩 차례로 보여 줘요.'],
    ['star', 'var(--sun)', '아빠가 만든 표 그림', '비행기·배·기차·놀이공원·전망대·식당·공연 표마다 아빠가 만든 수채화 그림이 들어갔어요.']] },
  { v: '5.5', d: '2026-11-26', title: '예약 화면을 더 잘 읽어요', items: [
    ['camera', 'var(--coral)', '앱 예약 화면도 척척', '클룩 같은 예약 앱 화면을 찍어 넣으면 금액·표 이름·예약번호·사람 수를 제대로 읽어요. 예약번호 숫자를 금액으로, 휴대폰 맨 위 시계 줄을 가게 이름으로 잘못 읽던 것을 고쳤어요.'],
    ['receipt', 'var(--mint)', '쓴 돈을 더 자세히', '「무엇에 썼나」에 선물·기념품, 유심·와이파이, 보험·여권·준비가 새로 생겼어요. 경비 화면에서 어디에 돈이 많이 들었는지 더 또렷이 보여요.'],
    ['ticket', 'var(--sky)', '유니버설 표를 샀어요', '12월 30일 유니버설 스튜디오 재팬 1일 패스 4장이 티켓 지갑과 경비에 들어갔어요. 아침 개장부터 들어가고, 슈퍼 닌텐도 월드는 오후 4시 입장으로 정해져 일정에 넣었어요.']] },
  { v: '5.4', d: '2026-11-26', title: '여행책을 전문가 눈으로 다듬었어요', items: [
    ['check', 'var(--mint)', '사실을 한 번 더', '일본사·한국사·여행·국어 네 갈래로 점검해 틀린 연도와 설명을 고쳤어요. 오사카성 돌담은 히데요시가 아니라 도쿠가와 때 쌓은 것이라는 것도 새로 적었어요.'],
    ['ticket', 'var(--coral)', '면세가 바뀌었어요', '11월부터 면세는 세금까지 먼저 내고 공항에서 돌려받는 방식이에요. 책 1장과 스파월드·쓰텐카쿠 주의할 점도 더했어요.'],
    ['book', 'var(--sky)', '읽기 편하게', '책 위 「가가」로 글씨를 크게, 「꼭 해 볼 10가지」는 눌러서 ✓, 쪽 가장자리를 누르면 넘어가요. 여는 글과 「돌아와서 쓰는 쪽」도 생겼어요.']] },
  { v: '5.3', d: '2026-11-26', title: '여행책에 역사 이야기가 더해졌어요', items: [
    ['memory', 'var(--lav)', '오사카로 읽는 일본 역사', '나니와궁부터 오사카성, 오사카 전투(1614~15), 상인 문화와 분라쿠, 1970·2025 엑스포까지 열 쪽으로 깊어졌어요. 신세카이 옆 언덕이 400년 전 싸움터였다는 것도 알게 돼요.'],
    ['talk', 'var(--sky)', '한국과 일본 2천 년', '도래인과 백제, 왜구, 임진왜란과 귀무덤, 조선통신사, 일제강점기, 1965년 이후까지 — 좋은 일과 아픈 일을 사실과 평가로 나눠 새 장에 담았어요.'],
    ['check', 'var(--mint)', '꼭 해 볼 10가지', '우리 일정에서 고른 「꼭 해 볼 10가지」와 가족 퀴즈가 늘었어요. 참고한 국내외 안내서도 책 끝에 밝혀 두었어요.']] },
  { v: '5.2', d: '2026-11-26', title: '오사카 여행책이 나왔어요', items: [
    ['book', 'var(--coral)', '수첩 안의 책 한 권', '수첩 맨 위 「📖 오사카 여행책」을 누르면 책이 펼쳐져요. 휴대폰은 옆으로 쓸어 넘기고, 컴퓨터는 ‹ › 단추나 ← → 키로 넘겨요. 읽던 쪽을 기억해요.'],
    ['memory', 'var(--lav)', '일본 역사부터 연말연시까지', '일본 역사 한눈에, 오사카의 역사, 동네 안내, 교토 하루, 먹거리, 교통, 설 풍습을 실제 사진·그림 지도·재미있는 일화와 함께 담았어요.'],
    ['plan', 'var(--sky)', '우리 일정과 이어져요', '쪽마다 「📅 우리 일정에서」를 누르면 그 일정이 바로 열려요. 「▶ 유튜브」 단추로 관련 영상도 찾아봐요.'],
    ['ticket', 'var(--mint)', 'PDF·전자책으로 받기', '「⋯」에서 PDF나 EPUB(전자책)으로 받아 두면 비행기 안에서도 읽을 수 있어요.']] },
  { v: '5.1', d: '2026-11-26', title: '정산은 자녀 몫으로', items: [
    ['plan', 'var(--sky)', '날마다 예상 금액', '일정 「하루씩」 날짜 아래에 그날 4명 예상 금액(원화로도)이 보여요. 스케줄표의 날짜 줄에도 4명 합계가 나와요.'],
    ['money', 'var(--mint)', '1/n이 아니에요', '경비 → 정산에서 자녀(하은·하늘)가 낼 몫만 정해요. 나머지는 모두 우리 부부가 내요. 이번 오사카는 50만 원씩이에요.'],
    ['wallet', 'var(--coral)', '먼저 낸 돈은 빼고', '하늘이가 숙소를 먼저 결제했으니 하늘이 몫에서 그만큼 빠지고 남은 돈만 보여요. 자녀가 보낸 돈은 「＋ 들어온 돈 적기」로 남겨요.']] },
  { v: '5.0', d: '2026-11-26', title: '그날 사진으로 바로', items: [
    ['talk', 'var(--sky)', '꼭 쓰는 말 듣기', '수첩의 「꼭 쓰는 말」마다 소리 단추가 생겼어요. 누르면 일본어 여성 음성으로 또박또박 들려줘요. 휴대폰 소리를 켜 두세요.'],
    ['camera', 'var(--coral)', '구글 포토 링크', '지난 여행을 열면 「그때 우리는」 아래에 날짜마다 「구글 포토」 단추가 있어요. 누르면 그날 찍은 사진이 구글 포토에서 바로 열려요.'],
    ['plan', 'var(--sky)', '날짜 칸이 한 줄에', '접은 폴드처럼 좁은 화면에서도 여행 날짜 칸이 잘리지 않고 한 줄에 다 보여요.'],
    ['memory', 'var(--coral)', '찾은 추억', '2019 태안(새롬교회 교역자 가족), 2018 「시벨리우스의 관록」 연주회를 더했어요.']] },
  { v: '4.9', d: '2026-11-26', title: '네이버 지도로도 봐요', items: [
    ['route', '#03C75A', '국내 길찾기는 네이버', '국내 일정을 누르면 「네이버 길찾기」가 맨 앞에 있어요. 대중교통·걸어서·차 모두 네이버 지도 앱으로 열리고, 앞 일정에서 출발해요. 구글 길찾기도 그대로 있어요.'],
    ['pin', '#03C75A', '일본에서도 네이버 지도', '해외 일정에는 「네이버 지도(한국어)」가 생겼어요. 일본 지도를 한국어로 볼 수 있어요. 해외 길찾기는 네이버가 아직 국내만 돼서 구글로 열어요.'],
    ['memory', 'var(--coral)', '대가족 여행', '부모님·조카들과 함께한 2013 여름 보트 나들이, 2025 겨울 평창 육백마지기를 찾아 넣었어요.']] },
  { v: '4.8', d: '2026-11-25', title: '일정이 시간 흐름대로', items: [
    ['route', 'var(--sky)', '가는 길까지', '일정 사이마다 ↓ 화살표와 함께 「🚃 11:56 난카이 공항선 → 덴가차야 12:36 · 970엔」, 「🚶 걸어서 6분」처럼 구글 길찾기로 확인한 이동이 보여요. 일정을 누르면 갈아타는 곳까지 자세히, 그 시각의 구글 지도 경로도 열려요.'],
    ['sun', 'var(--sun)', '해의 움직임', '아침·낮·저녁·밤에 따라 카드 색이 바뀌고, 해 뜨고 지는 시각에 맞춰 해와 달이 은은하게 떠 있어요.'],
    ['food', 'var(--coral)', '오사카 식사 조율', '첫날 저녁은 회전초밥 원조 겐로쿠 스시, 그믐 저녁은 우설 정식, 아침과 밤 간식은 편의점으로 가볍게.']] },
  { v: '4.7', d: '2026-11-25', title: '문화 체험 칸', items: [
    ['ticket', '#9b5bd4', '문화 체험', '전시·공연·박물관 같은 당일 나들이는 「지난 여행」의 새 칸 「문화 체험」에 따로 모여요. 여행을 만들 때 「어떤 여행」에서 고를 수 있어요.'],
    ['memory', 'var(--coral)', '찾은 추억', '2006 여름 양평(중미산 천문대)과 2008 「황금의 제국 페르시아」 전시를 구글 포토에서 찾아 넣었어요.']] },
  { v: '4.6', d: '2026-11-25', title: 'PC에서 한눈에', items: [
    ['globe', 'var(--sky)', 'PC 화면', '넓은 화면에서는 왼쪽에 메뉴가 늘 있고(오늘·일정·경비·수첩·준비물·티켓 지갑·추억·번역기…), 카드가 세 단으로 빈틈없이 채워져 한눈에 많이 보여요.'],
    ['check', 'var(--mint)', '준비물 보드', 'PC에서는 할 일 · 함께 챙길 짐 · 네 식구 가방이 나란히 칸으로 보여요. 칸마다 「＋」로 바로 더해요.']] },
  { v: '4.5', d: '2026-11-25', title: '준비물을 나눠서 봐요', items: [
    ['check', 'var(--mint)', '할 일 · 함께 챙길 짐 · 개인 가방', '준비물이 세 갈래로 나뉘었어요. 서류·예약 같은 「할 일」, 어댑터·상비약 같은 「함께 챙길 짐」, 그리고 아빠·엄마·딸·아들 「가방」이 따로 있어요.'],
    ['bag', 'var(--coral)', '내 가방', '옷·칫솔·충전기·개인 약은 사람마다 따로 체크해요. 빈 가방은 「기본 개인 준비물 넣기」로 계절·일수에 맞춘 목록을 한 번에 넣어요.']] },
  { v: '4.4', d: '2026-11-25', title: '메모장·주소 칸·티켓 정렬', items: [
    ['pen', 'var(--sun)', '나만의 메모장', '수첩 안에 가족마다 메모장이 생겼어요. 챙길 것·사고 싶은 것을 적어 두고, 「나만 보기」를 고르면 다른 가족에게는 안 보여요.'],
    ['ticket', 'var(--mint)', '티켓 지갑 정리', '항공·숙소·보험은 늘 맨 위에 고정되고, 그 밖의 티켓·교통·주차는 「시간순」 또는 「종류별」로 골라 볼 수 있어요.'],
    ['home', 'var(--sky)', '주소 넣기', '일정·예약·가 본 곳에 주소 칸이 생겼어요. 주소를 넣으면 지도와 길찾기가 그 주소로 바로 가고, 일정 보기에서 「복사」로 택시 기사님께 보여 줄 수 있어요.']] },
  { v: '4.3', d: '2026-11-25', title: '사진만 올리면 여행 기록이 돼요', items: [
    ['camera', 'var(--coral)', '사진으로 여행 정리', '「＋ 새 여행 만들기」 → 「다녀온 여행, 사진으로 정리」에서 사진·영수증·일정표를 한꺼번에 고르면 찍은 날짜·곳으로 일정·가 본 곳·대표 사진을 정리해 줘요. 저장 전에 모두 확인해요. 지난 여행의 「추억 → 가 본 곳」에서도 더할 수 있어요.'],
    ['ai', 'var(--lav)', 'AI 도우미', '설정 → AI 도우미에 클로드(또는 제미나이) 열쇠를 넣으면 영수증 금액·티켓·일정표까지 읽고 그때 이야기도 써 줘요. 영수증 읽기·메뉴판 번역도 AI가 해요.'],
    ['back', 'var(--sky)', '뒤로가기', '일정 같은 창을 열고 뒤로가기(쓸어넘기기)를 하면 창만 닫히고 그 화면에 머물러요. 여행 화면의 「기록」은 작은 단추 한 줄로 줄였어요.']] },
  { v: '4.2', d: '2026-11-25', title: '우리 가족 여행 지도', items: [
    ['globe', 'var(--sky)', '진짜 다녀온 곳에 핀', '처음 화면에 세계·국내 지도가 생겼어요. 가 본 곳과 다녀온 일정마다 핀이 꽂혀요(해외 파랑·국내 초록·부부 분홍). 핀을 누르면 그 여행을 열거나 구글 지도로 볼 수 있어요.'],
    ['star', 'var(--sun)', '가 본 곳은 갈래별로', '명소·맛집·카페·쇼핑·숙소로 골라 보고, 긴 목록은 「더 보기」로 접혀요.'],
    ['plus', 'var(--soft)', '처음 화면은 추억 중심', '「새 여행 만들기」는 작은 글자로 줄였어요.']] },
  { v: '4.1', d: '2026-11-25', title: '가 본 곳이 일정을 따라와요', items: [
    ['pin', 'var(--sky)', '다녀오면 저절로', '일정에서 「다녀옴」을 누른 명소·식당·쇼핑 곳이 그 여행의 「가 본 곳」에 저절로 모여요. 지난 여행도 일정대로 채워졌어요.'],
    ['star', 'var(--sun)', '누르면 별점', '「일정에서 다녀온 곳」을 누르면 이름·지도가 채워진 채로 별점과 한마디를 남길 수 있어요. 처음 화면 「모두 보기」는 여행마다 나눠 보여요.']] },
  { v: '4.0', d: '2026-11-25', title: '번역기가 생겼어요', items: [
    ['mic', 'var(--coral)', '말하고 듣는 번역기', '수첩·「＋」에서 「번역기」를 열면 한국어로 말하거나 적은 말을 일본어로 옮기고 소리 내어 읽어 줘요. 마주 보고 번역하면 위쪽은 상대방 쪽으로 뒤집혀 보여요.'],
    ['camera', 'var(--sky)', '사진 찍어 번역', '메뉴판·약·과자 라벨·안내판·영수증을 찍으면 줄마다 한국어로 옮기고, 메뉴판은 요리 설명과 알레르기 재료(새우·땅콩·밀 등)도 짚어 줘요.'],
    ['sos', 'var(--pink)', '도움이 필요할 때', '「오늘」 화면의 「도움이 필요해요」를 누르면 응급·영사관·여행자보험·카드 분실 연락처로 바로 가요.']] },
  { v: '3.9', d: '2026-11-25', title: '일정을 누르면 정보부터', items: [
    ['plan', 'var(--c-관광)', '일정 보기', '일정을 누르면 고치는 칸 대신 장소·비용·메모·팁·앞뒤 일정과 지도가 먼저 떠요. 고칠 땐 아래 「고치기」를 눌러요.'],
    ['route', 'var(--sky)', '길찾기 한 번에', '대중교통·걸어서·차 길찾기(앞 일정에서 출발), 구글 지도, 주변 맛집·편의점·볼거리를 바로 열어요.']] },
  { v: '3.8', d: '2026-11-25', title: '독일 시절 유럽 여행이 돌아왔어요', items: [
    ['globe', 'var(--sky)', '해외여행 4가지 더', '구글 포토 사진으로 2010 남프랑스 · 2011 스위스 체르마트 · 2011 프라하 · 2011 성탄 파리 여행을 찾아 날짜·곳·사진을 남겼어요.'],
    ['memory', 'var(--coral)', '지난 여행은 조용하게', '오래전 여행에서는 예보·환율·예약 안내 대신 그때 이야기와 사진이 먼저 보여요.']] },
  { v: '3.7', d: '2026-11-25', title: '보험도, 여권도 더 잘 읽어요', items: [
    ['doc', 'var(--pink)', '여행자보험', '보험 가입 화면이나 결제 문자를 찍으면 「캐롯손해보험 여행자보험」처럼 보험사 이름까지 읽어요. 티켓 지갑에 「보험」 칸도 생겼어요.'],
    ['doc', 'var(--sky)', '여권 판독', '새 여권(번호 가운데 영문 글자)과 0이 O로 읽히는 경우도 바로잡아, 이름·번호·성별·날짜를 모두 읽어요.']] },
  { v: '3.6', d: '2026-11-25', title: '여권 사진 자리 바로잡기', items: [
    ['users', 'var(--lav)', '가족 얼굴 다시 그림', '여권 카드와 가족 얼굴 그림이 가운데에 반듯하게 들어가요. 이마와 턱이 잘리지 않아요.']] },
  { v: '3.5', d: '2026-11-25', title: '접은 폴드에서도 반듯하게', items: [
    ['phone', 'var(--sky)', '좁은 화면 점검', '여행 고르기의 도장, 여권 카드의 날짜가 접은 폴드 화면에서도 잘리거나 겹치지 않아요. 모든 화면을 344px 폭으로 점검했어요.'],
    ['camera', 'var(--coral)', '갤러리에서 고르기', '여권·영수증 사진을 넣을 때 구글 포토만이 아니라 갤러리·카메라·내 파일에서도 고를 수 있어요.']] },
  { v: '3.4', d: '2026-11-25', title: '읽는 법이 늘 보여요', items: [
    ['book', 'var(--sky)', '꼭 쓰는 말', '일본어 아래에 한글로 읽는 법이 늘 보여요. 카드를 누르면 뜻이 나와요.'],
    ['sync', 'var(--mint)', '늘 새 화면으로', '새 판이 올라오면 휴대폰이 옛 화면을 지우고 저절로 새로 열어요. 날씨·옷차림 그림도 새 그림으로 보여요.']] },
  { v: '3.3', d: '2026-11-25', title: '추억 사진이 붙었어요', items: [
    ['camera', 'var(--coral)', '여행마다 사진 세 장', '구글 포토에서 고른 사진이 지난 여행 카드와 「그때 우리는」 편지에 폴라로이드처럼 붙어요. 누르면 크게 보여요.'],
    ['memory', 'var(--sky)', '표지도 우리 사진으로', '2017 제주 · 2022 제주 · 2025 대만 표지가 그때 찍은 사진으로 바뀌었어요. 원본은 드라이브 「사진」에 있어요.']] },
  { v: '3.2', d: '2026-11-25', title: '두 사람의 여행, 부부여행', items: [
    ['memory', 'var(--pink)', '부부여행 칸', '아빠·엄마 두 사람만 다녀온 여행은 「부부여행」으로 따로 모여요. 여행 만들 때 함께 간 사람을 둘로 고르면 저절로 들어가요.'],
    ['camera', 'var(--sky)', '2025 새해 대만', '구글 포토 앨범과 사진 위치로 예류·스펀·단수이 일정을 되살렸어요. 「사진 앨범」 단추로 사진 572장을 바로 볼 수 있어요.']] },
  { v: '3.1', d: '2026-11-25', title: '지난 여행이 연표로 모였어요', items: [
    ['globe', 'var(--sky)', '해외여행 | 국내여행', '처음 화면 「지난 여행」에서 해외여행과 국내여행을 나눠 보고, 해마다 쌓인 여행을 연표로 봐요.'],
    ['memory', 'var(--coral)', '노션에 있던 추억 4가지', '2017 봄 제주 · 2017 인제 · 2019 곡성 · 2022 겨울 제주 — 노션 「여행_다녀온곳」 기록을 일정·예약·가 본 곳으로 옮겼어요.'],
    ['camera', 'var(--sun)', '○년 전 오늘', '지난 여행과 같은 날이 오면 「4년 전 오늘, 우리는」 카드가 떠요. 12월 29일엔 2022년 제주가 찾아와요.'],
    ['notion', 'var(--ink)', '그때 우리는', '다녀온 여행을 열면 그때 이야기가 편지처럼 보이고, 노션 페이지로 바로 갈 수 있어요.']] },
  { v: '3.0', d: '2026-11-25', title: '어떤 일정이든 그림이 붙어요', items: [
    ['plan', 'var(--c-관광)', '새 일정 그림 20가지', '유람선·온천·신칸센·관람차·수족관·나라 사슴·이자카야·편의점·사진·불꽃·휴식·약국, 그리고 교회·해변·등산·스키·렌터카·자전거·박물관·공연까지.'],
    ['pen', 'var(--coral)', '쓰기만 하면 저절로', '일정 제목에 「온천」「유람선」「편의점」 같은 말을 쓰면 맞는 그림이 붙어요.']] },
  { v: '2.9', d: '2026-11-25', title: '교토 표지와 새 아이콘', items: [
    ['sun', 'var(--sun)', '교토 표지', '단풍과 도리이, 기요미즈데라가 담긴 교토 표지가 생겼어요. 교토 여행을 만들면 저절로 떠요.'],
    ['route', 'var(--c-관광)', '걷기·시장·성·주차', '산책·시장·오사카성·주차 일정에도 그림이 붙고, 여권 화면엔 여권 표지, 밤에는 달이 인사해요.']] },
  { v: '2.8', d: '2026-11-25', title: '그림이 가득해졌어요', items: [
    ['plane', 'var(--c-이동)', '일정 그림 아이콘', '비행기·전철·버스·택시·호텔·라멘·카페·도리이·전망대·쇼핑·티켓 그림이 일정과 티켓 지갑에 붙어요.'],
    ['food', 'var(--coral)', '맛집·기분 스티커', '다코야키·오코노미야키·구시카쓰 그림이 추천 카드에, 기분 스티커가 일기에 들어갔어요.'],
    ['phone', 'var(--mint)', '새 앱 아이콘', '민트 여행 가방 아이콘으로 바뀌었어요. 홈 화면에 다시 추가하면 새 아이콘이 보여요.']] },
  { v: '2.7', d: '2026-11-25', title: '화면마다 그림이 생겼어요', items: [
    ['money', 'var(--mint)', '여행 지갑·여행 길·추억', '경비는 지갑, 일정은 지도, 추억은 리본 묶은 사진 그림이 머리에 들어갔어요.'],
    ['book', 'var(--sky)', '수첩·교토 가는 날', '비상 연락은 구급상자, 꼭 쓰는 말은 말풍선 그림. 교토 가는 날 일정에는 교토 그림이 붙어요.']] },
  { v: '2.6', d: '2026-11-25', title: '「다녀옴」 도장을 찍어요', items: [
    ['check', 'var(--warn)', '다녀옴 도장', '하루 일정을 모두 체크하면 그날에 여권 도장이 쾅! 지난 여행에도 도장이 찍혀요.'],
    ['car', 'var(--c-주차)', '새 그림', '내 차·여행 수첩·일기·사진·영수증 그림을 더했어요.']] },
  { v: '2.5', d: '2026-11-25', title: '오사카 표지가 생겼어요', items: [
    ['sun', 'var(--sun)', '시간 따라 바뀌는 표지', '아침·저녁은 노을빛, 낮은 파란 하늘, 밤은 별빛 오사카 그림이 표지에 떠요.'],
    ['prep', 'var(--mint)', '준비물 그림', '여권·지갑·충전기·스웨터·운동화·약·우산 같은 그림으로 준비물을 한눈에 봐요.']] },
  { v: '2.4', d: '2026-11-25', title: '여권·준비물이 꼼꼼해졌어요', items: [
    ['doc', 'var(--sky)', '여권처럼 보는 여권 정보', '여권 사진을 고르면 영문 이름·번호·발급일·만료일을 읽어 여권 모양 카드로 보여 줘요. 만료일과 남은 기간도 크게.'],
    ['prep', 'var(--mint)', '준비물 54가지', '서류·예약·돈·전자기기·옷·세면·건강·출발 전·돌아올 때 아홉 묶음으로 정리하고 그림을 달았어요.'],
    ['camera', 'var(--coral)', '표지 사진', '여행 정보 고치기에서 가족 사진을 표지로 고를 수 있어요.']] },
  { v: '2.3', d: '2026-11-25', title: '여행 지갑이 똑똑해졌어요', items: [
    ['money', 'var(--mint)', '현실적인 예산', '예약·결제한 항공권·숙소 + 일정 비용 + 간식·쇼핑 여유 + 예비비로 예상 총액을 셈해요. 일정을 바꾸면 저절로 다시 계산돼요.'],
    ['users', 'var(--sky)', '누가 어떻게 냈나', '가족별 낸 돈, 카드·현금·트래블카드 같은 결제 수단, 함께 쓴 돈과 개인 돈을 나눠 보고 정산표로 정리해요.'],
    ['sun', 'var(--sun)', '새 그림', '날씨 아이콘과 계절별 가족 옷차림, 가족 얼굴 그림으로 바꿨어요.'],
    ['plan', 'var(--pink)', '메뉴마다 다른 모습', '일정은 여행 길, 경비는 영수증, 수첩은 줄 공책, 추억은 폴라로이드 느낌이에요.']] },
  { v: '2.2', d: '2026-11-25', title: '접는 폰에 맞췄어요', items: [
    ['phone', 'var(--sky)', '폴드·플립·아이폰', '폴드를 펼치면 두 단으로 넓게, 접으면 좁은 화면에 맞게 보여요. 플립·아이폰 화면도 맞췄어요.'],
    ['sos', 'var(--warn)', '현지 주의할 점', '수첩에 안전·생활 습관·식당·교통·사진·건강·연말연시 주의할 점을 모았어요.'],
    ['park', 'var(--c-주차)', '주차 앞뒤 4시간', '인천 P5 예약은 입차 03:00~11:00, 출차 09:30~17:30에 할 수 있어요.']] },
  { v: '2.1', d: '2026-11-25', title: '주차 여유 시간', items: [
    ['park', 'var(--c-주차)', '주차 앞뒤 여유', '주차 예약에 「앞뒤 여유 시간」을 적으면 입출차 가능한 시간이 보이고, 시간 경고도 그 여유까지 셈해요. 인천 P5는 앞뒤 4시간으로 넣어 두었어요.']] },
  { v: '2.0', d: '2026-11-25', title: '새로워진 하하가족여행', items: [
    ['camera', 'var(--coral)', '사진으로 넣기', '영수증·예약 화면·주차 위치를 찍으면 금액·예약번호·주차 칸이 저절로 채워져요. 사진은 구글 드라이브에 보관돼요.'],
    ['today', 'var(--sun)', '「오늘」 화면', '출발 전·여행 중·돌아오는 날마다 꼭 필요한 것이 먼저 보여요. 시간에 따라 하늘 그림도 바뀌어요.'],
    ['park', 'var(--c-주차)', '공항 주차·내 차 어디?', '주차 예약을 지갑에 넣고, 세운 뒤 기둥을 찍어 두면 돌아오는 날 맨 위에 보여요.'],
    ['book', 'var(--mint)', '여행 수첩', '비상 연락·꼭 쓰는 일본어·문화·날씨별 가족 옷차림을 공부하듯 읽어요.'],
    ['sun', 'var(--sky)', '날씨·환율', '날짜별·시간별 날씨(16일 전부터 실시간, 그 전엔 평균)와 오늘 환율·계산기.'],
    ['plane', 'var(--c-이동)', '보기 좋은 아이콘', '항공권은 탑승권처럼, 일정은 비행기·전철·숙소·신사 아이콘으로.'],
    ['doc', 'var(--lav)', '구글에 저절로 기록', '고칠 때마다 드라이브 여행 기록 문서가 정리되고, 노션 「하하가족여행」 정리함으로도 보낼 수 있어요.']] }
];
function newsOpen(all) {
  const list = all ? NEWS : NEWS.slice(0, 1);
  openSheet(list.map(n => '<div class="postcard"><div class="pc-stamp"><span>HAHA</span><b>' + esc(n.v) + '</b></div><div class="pc-mark">✈ AIR MAIL · ' + esc(n.d) + '</div><h2>' + esc(n.title) + ' ✈️</h2>' +
    n.items.map(([icn, col, a, b]) => '<div class="pc-item">' + ib(icn, col) + '<div><b>' + esc(a) + '</b><span>' + esc(b) + '</span></div></div>').join('') + '</div>').join('') +
    '<div class="sheet-acts"><button class="btn pri" data-act="news-ok">좋아요, 여행 준비하러 가기</button></div>');
}
function newsCheck() {
  if (LS.get('newsSeen', '') === NEWS[0].v) return;
  setTimeout(() => { if ($('#sheet').hidden) newsOpen(); }, 700);
}

if (API === '/api') window.HAHA_TEST = { openFromRead, curTrip };
/* ---------- 시작 ---------- */
function startRoute() {
  if (location.hash && location.hash !== '#') return;
  const t0 = today();
  const t = live('trips').filter(x => x.end >= t0).sort((a, b) => (a.start || '').localeCompare(b.start || ''))[0];
  if (t) history.replaceState(null, '', tripUrl(t.id));
}
if (PASS) startRoute();
render();
if (PASS) pull().then(() => { if (!location.hash || location.hash === '#') { startRoute(); render(); } if (ME && fam(ME)) newsCheck(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
/* 새 판이 올라왔는데 휴대폰이 옛 화면을 붙들고 있으면 — 기억해 둔 화면을 지우고 새로 열기 */
const APP_V = ((document.querySelector('script[src*="app.js"]') || {}).src || '').replace(/.*[?&]v=(\d+).*/, '$1');
let FRESH_LATER = false;
async function freshCheck() {
  if (location.protocol !== 'https:' || !APP_V) return;
  try {
    const html = await (await fetch('index.html?fresh=' + Date.now(), { cache: 'no-store' })).text();
    const nv = (/app\.js\?v=(\d+)/.exec(html) || [])[1];
    if (!nv || nv === APP_V) return;
    // 암호·이름 고르기·입력 중·창이 열려 있을 땐 새로 열지 않음 — 넣던 암호가 지워져 「안 넘어가요」처럼 보이던 것(2026-11-26)
    const ae = document.activeElement;
    if (!PASS || !ME || LOGGING || !$('#sheet').hidden || (typeof TKV !== 'undefined' && TKV) || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) { FRESH_LATER = true; return; }
    if (sessionStorage.getItem('haha.fresh') === nv) return;
    sessionStorage.setItem('haha.fresh', nv);
    if (window.caches) for (const k of await caches.keys()) if (/^haha-v/.test(k)) await caches.delete(k); // 「여행 전 준비」로 받아 둔 haha-assets는 남김
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update().catch(() => {});
    location.reload();
  } catch (e) {}
}
freshCheck();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') freshCheck(); });
})();
