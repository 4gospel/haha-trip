/* 하하가족여행 — 가족이 함께 고치는 여행 앱
 * 원본은 4gospel 구글 드라이브(앱스 스크립트 서버), 이 기기에는 사본과 아직 못 보낸 변경만 둔다. */
(() => {
'use strict';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? '/api'
  : 'https://script.google.com/macros/s/AKfycbzW5yTlddAZEjsqm0qbM9KZw2be-0xYKISxUu4BrxR2DSHzfyadiW3MF_OziGKh3Kc3Ww/exec';
const COLS = ['trips', 'items', 'bookings', 'spends', 'checks', 'notes', 'places', 'recs'];

/* ---------- 이 기기 저장 ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('haha.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('haha.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('haha.' + k); } catch (e) {} }
};
const empty = () => { const d = { rev: 0, meta: { family: [] } }; COLS.forEach(c => d[c] = {}); return d; };
const norm = d => { d = d || empty(); COLS.forEach(c => d[c] = d[c] || {}); d.meta = d.meta || { family: [] }; d.meta.family = d.meta.family || []; return d; };

let D = norm(LS.get('data', null));
let Q = LS.get('q', []);
let PASS = LS.get('pass', '');
let ME = LS.get('me', '');
const UI = { mode: LS.get('mode', 'tl'), recK: '전체', logK: 'note', day: {} };
const persist = () => { LS.set('data', D); LS.set('q', Q); };

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
const md = s => { if (!s) return ''; const d = pd(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WK[d.getDay()] + ')'; };
const dayDiff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
function daysOf(t) {
  const out = []; if (!t.start || !t.end) return out;
  for (let d = pd(t.start); d <= pd(t.end) && out.length < 60; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
}
function ddayText(t) {
  const n = dayDiff(today(), t.start), e = dayDiff(today(), t.end);
  if (n > 0) return 'D-' + n;
  if (e >= 0) return '여행 ' + (1 - n) + '일째';
  return '다녀옴';
}
const CUR = { JPY: '엔', KRW: '원', USD: '달러', EUR: '유로', CNY: '위안', TWD: '대만달러', THB: '바트', VND: '동', PHP: '페소', SGD: '싱가포르달러' };
const unit = c => CUR[c] || c || '';
const toWon = (t, amt, cur) => { amt = Number(amt) || 0; cur = cur || t.cur || 'KRW'; return cur === 'KRW' ? amt : amt * (Number(t.rate) || 0) / 100; };
const manWon = w => w >= 10000 ? (Math.round(w / 1000) / 10).toLocaleString('ko-KR') + '만 원' : comma(w) + '원';
const money = (t, amt, cur) => { cur = cur || t.cur; const s = comma(amt) + unit(cur); return cur === 'KRW' ? s : s + ' <em class="muted">≈ ' + manWon(toWon(t, amt, cur)) + '</em>'; };
const mapUrl = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const safeUrl = u => /^https:\/\//i.test(String(u || '')) ? u : '';

const CAT = { 이동: '--c-move', 관광: '--c-see', 식사: '--c-eat', 간식: '--c-snack', 숙소: '--c-stay', 쇼핑: '--c-shop', 기타: '--c-etc' };
const catVar = c => 'var(' + (CAT[c] || '--c-etc') + ')';
const RECK = { 명소: '--c-see', 맛집: '--c-eat', 쇼핑: '--c-shop', 팁: '--c-move', 숙소: '--c-stay' };
const AVC = ['#4F6EF0', '#DC4F93', '#F2683C', '#12A28C', '#8B63E8', '#D9921E'];
const famIdx = n => Math.max(0, D.meta.family.findIndex(f => f.name === n));
const av = (n, sz) => '<span class="av" style="background:' + AVC[famIdx(n) % AVC.length] + (sz ? ';width:' + sz + 'px;height:' + sz + 'px' : '') + '">' + esc(String(n || '?').slice(-2)) + '</span>';
const GRAD = { sea: '', sunset: 'g-sunset', forest: 'g-forest', plum: 'g-plum', sand: 'g-sand' };

const ICON = {
  back: '<path d="M15 18l-6-6 6-6"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  over: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 14h3M7.5 17h6"/>',
  recs: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  money: '<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10h19M16.5 14.5h2"/>',
  prep: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  log: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  plane: '<path d="M2.5 12h19M14 12l-4.5-7h-2l2.5 7M14 12l-4.5 7h-2l2.5-7M5 12L3.5 9H5l2 3M5 12l-1.5 3H5l2-3"/>',
  bed: '<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-8v1"/><circle cx="7" cy="10.5" r="1.8"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 21l2-4M15.5 21l-2-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  notion: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8.5 16.5v-8l7 8v-8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>',
  food: '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.2-3.5 4-3.5 8h3.5"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>', phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>'
};
const ic = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>';
const BK_IC = { 항공: 'plane', 숙소: 'bed', 티켓: 'ticket', 교통: 'train', 서류: 'doc', 기타: 'ticket' };
const RC_IC = { 명소: 'recs', 맛집: 'food', 쇼핑: 'bag', 팁: 'bulb', 숙소: 'bed' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600);
}

/* ---------- 서버 ---------- */
async function call(fn, ...args) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify({ pass: PASS, fn, args }) });
  let j; try { j = await r.json(); } catch (e) { const er = new Error('서버 답이 이상해요'); er.code = 'net'; throw er; }
  if (!j.ok) { const er = new Error(j.msg || j.err); er.code = j.err; throw er; }
  return j.v;
}
let flying = false, timer = 0, status = 'ok';
function setStatus(s) { status = s; const el = $('#sync'); if (el) paintSync(el); }
function paintSync(el) {
  el.className = 'sync ' + (status === 'ok' ? '' : status);
  el.innerHTML = '<i></i>' + (status === 'wait' ? '저장 중' : status === 'bad' ? (Q.length ? '저장 대기 ' + Q.length : '연결 안 됨') : '함께 보는 중');
}
function put(c, rec) {
  rec.ts = Math.max(Date.now(), (Number(rec.ts) || 0) + 1);
  rec.by = ME;
  if (c === 'meta') D.meta = rec; else D[c][rec.id] = rec;
  Q.push({ c, id: rec.id || 'meta', v: rec });
  persist(); render(); kick();
}
function remove(c, id) { const r = D[c][id]; if (r) put(c, { id, trip: r.trip, del: true, ts: r.ts }); }
function kick(ms) { clearTimeout(timer); timer = setTimeout(flush, ms == null ? 400 : ms); }
async function flush() {
  if (flying || !Q.length || !PASS) return;
  flying = true; setStatus('wait');
  const ops = Q.slice();
  try {
    const d = await call('apply', ops);
    Q = Q.slice(ops.length);
    adopt(d); setStatus('ok');
  } catch (e) {
    flying = false; setStatus('bad');
    if (e.code === 'pass') return relock();
    kick(6000); return;
  }
  flying = false;
  if (Q.length) kick(100);
}
function adopt(d) {
  d = norm(d);
  for (const op of Q) {
    if (op.c === 'meta') { d.meta = op.v; continue; }
    const cur = d[op.c][op.id];
    if (!cur || (cur.ts || 0) <= op.v.ts) d[op.c][op.id] = op.v;
  }
  const same = JSON.stringify(d) === JSON.stringify(D);
  D = d; persist();
  if (!same) render();
}
async function pull() {
  try { adopt(await call('load')); setStatus(Q.length ? 'wait' : 'ok'); if (Q.length) kick(); }
  catch (e) { if (e.code === 'pass') relock(); else setStatus('bad'); }
}
async function poll() {
  if (!PASS || document.hidden || flying) return;
  if (Q.length) return kick(0);
  try { const r = await call('rev'); if (r !== D.rev) pull(); else if (status === 'bad') setStatus('ok'); } catch (e) { setStatus('bad'); }
}
setInterval(poll, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.addEventListener('online', () => poll());
function relock() { PASS = ''; LS.del('pass'); toast('가족 암호를 다시 넣어 주세요'); render(); }

/* ---------- 길 (주소 #/trip/<id>/<tab>) ---------- */
function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'trip' && p[1]) return { view: 'trip', trip: decodeURIComponent(p[1]), tab: p[2] || 'over' };
  return { view: 'home' };
}
const go = h => { if (location.hash !== h) location.hash = h; else render(); };
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

/* ---------- 그리기 ---------- */
function render() {
  const app = $('#app');
  if (!PASS) { app.innerHTML = lockView(); return; }
  if (!ME || !D.meta.family.some(f => f.name === ME)) { app.innerHTML = whoView(); return; }
  const r = route();
  if (r.view === 'trip' && D.trips[r.trip] && !D.trips[r.trip].del) app.innerHTML = tripView(D.trips[r.trip], r.tab);
  else app.innerHTML = homeView();
  const s = $('#sync'); if (s) paintSync(s);
}

function lockView() {
  return '<div class="lock"><img class="logo" src="icon.svg" alt=""><h1>하하가족여행</h1><p>우리 가족 여행을 함께 짜고 기록해요.<br>가족 암호를 넣어 주세요.</p>' +
    '<form class="f" data-form="lock"><input class="in" id="pass" type="password" autocomplete="current-password" placeholder="가족 암호" aria-label="가족 암호">' +
    '<button class="btn pri wide" style="height:50px;font-size:16px">들어가기</button><div class="muted" id="lockmsg"></div></form></div>';
}
function whoView() {
  const fam = D.meta.family;
  return '<div class="lock"><h1>누구세요?</h1><p>이 휴대폰을 쓰는 사람을 골라 주세요. 고친 사람이 이름으로 남아요.</p>' +
    (fam.length ? '<div class="who">' + fam.map(f => '<button data-act="me" data-v="' + esc(f.name) + '">' + av(f.name) + esc(f.name) + '<small>' + esc(f.role || '') + '</small></button>').join('') + '</div>'
      : '<div class="empty">가족 목록을 받는 중이에요…</div>') + '</div>';
}

/* 홈: 모든 여행과 통합 기록 */
function homeView() {
  const trips = live('trips').sort((a, b) => a.start.localeCompare(b.start));
  const t0 = today();
  const up = trips.filter(t => t.end >= t0), past = trips.filter(t => t.end < t0).reverse();
  const next = up[0];
  let h = '<div class="wrap"><div class="topbar"><h1>하하가족여행</h1><span id="sync" class="sync"></span><button class="iconbtn" data-act="settings" aria-label="설정">' + ic('gear') + '</button></div>';
  h += next ? heroCard(next, true) : '<div class="card empty"><b>아직 여행이 없어요</b>아래 ＋ 단추로 첫 여행을 만들어요.</div>';
  if (up.length > 1) h += '<div class="sec"><div class="sec-h"><h3>다가오는 여행</h3></div><div class="stack">' + up.slice(1).map(tripRow).join('') + '</div></div>';
  // 통합 기록
  const allDays = trips.filter(t => t.end < t0 || (t.start <= t0)).reduce((s, t) => s + Math.max(0, Math.min(dayDiff(t.start, t.end), dayDiff(t.start, t0)) + 1), 0);
  let spent = 0; live('spends').forEach(s => { const t = D.trips[s.trip]; if (t) spent += toWon(t, s.amount, s.cur); });
  const places = live('places').sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.ts - a.ts);
  h += '<div class="sec"><div class="sec-h"><h3>우리 가족 여행 기록</h3></div><div class="grid2">' +
    '<div class="stat"><small>함께 간 여행</small><b class="num">' + trips.length + '번</b><em>지난 여행 ' + past.length + '번</em></div>' +
    '<div class="stat"><small>여행한 날</small><b class="num">' + allDays + '일</b><em>지금까지</em></div>' +
    '<div class="stat"><small>쓴 돈 (기록한 것)</small><b class="num">' + manWon(spent) + '</b><em>모든 여행 합계</em></div>' +
    '<div class="stat"><small>평가한 곳</small><b class="num">' + places.length + '곳</b><em>맛집·명소</em></div></div></div>';
  if (places.length) {
    h += '<div class="sec"><div class="sec-h"><h3>우리가 좋았던 곳</h3><button class="more" data-act="all-places">모두 보기</button></div><div class="card">' +
      places.slice(0, 5).map(placeRow).join('') + '</div></div>';
  }
  if (past.length) h += '<div class="sec"><div class="sec-h"><h3>지난 여행</h3></div><div class="stack">' + past.map(tripRow).join('') + '</div></div>';
  h += '</div><button class="fab" data-act="trip-new" aria-label="새 여행 만들기">' + ic('plus') + '</button>';
  return h;
}
function heroCard(t, link) {
  const ds = daysOf(t);
  const tag = link ? 'button data-act="open-trip" data-v="' + esc(t.id) + '" style="width:100%;text-align:left;display:block"' : 'div';
  return '<' + tag + ' class="hero ' + (GRAD[t.color] || '') + '">' +
    '<div class="eyebrow">' + esc(t.place || '여행') + '</div><span class="dday">' + ddayText(t) + '</span>' +
    '<h2>' + esc(t.title) + '</h2><div class="sub num">' + esc(md(t.start)) + ' – ' + esc(md(t.end)) + ' · ' + Math.max(0, ds.length - 1) + '박 ' + ds.length + '일</div>' +
    '<div class="route"><div><small>출발</small><b class="num">' + esc(md(t.start)) + '</b></div><div class="line">' + ic('plane') + '</div><div style="text-align:right"><small>돌아옴</small><b class="num">' + esc(md(t.end)) + '</b></div></div>' +
    '<div class="people">' + (t.members || []).map(m => '<span class="chip-w">' + esc(m) + '</span>').join('') + '</div></' + tag.split(' ')[0] + '>';
}
function tripRow(t) {
  return '<button class="trip-row" data-act="open-trip" data-v="' + esc(t.id) + '"><span class="th ' + (GRAD[t.color] || '') + '"></span><span class="tt"><b>' + esc(t.title) + '</b><span class="num">' +
    esc(md(t.start)) + ' – ' + esc(md(t.end)) + ' · ' + esc(t.place || '') + '</span></span><span class="pill ' + (dayDiff(today(), t.start) > 0 ? 'hot' : '') + '">' + ddayText(t) + '</span></button>';
}
function placeRow(p) {
  const t = D.trips[p.trip];
  return '<button class="row" data-act="place-edit" data-v="' + esc(p.id) + '"><span class="body"><span class="t">' + esc(p.name) + '</span><span class="m"> ' + esc(p.cat || '') + '</span><div class="m">' +
    '<span class="stars">' + '★'.repeat(p.rating || 0) + '</span> ' + esc(p.memo || '') + '</div></span><span class="m" style="text-align:right">' + esc(t ? t.title : '') + '<br>' + esc(p.by || '') + '</span></button>';
}

/* 여행 한 편 */
const TABS = [['over', '개요'], ['plan', '일정'], ['recs', '추천'], ['money', '경비'], ['prep', '준비'], ['log', '기록']];
function tripView(t, tab) {
  if (!TABS.some(x => x[0] === tab)) tab = 'over';
  let h = '<div class="wrap"><div class="topbar"><button class="iconbtn" data-act="home" aria-label="처음 화면">' + ic('back') + '</button><h1>' + esc(t.title) + '</h1><span id="sync" class="sync"></span>' +
    '<button class="iconbtn" data-act="trip-menu" data-v="' + esc(t.id) + '" aria-label="여행 메뉴">' + ic('more') + '</button></div>';
  h += ({ over: overTab, plan: planTab, recs: recsTab, money: moneyTab, prep: prepTab, log: logTab })[tab](t);
  h += '</div><nav class="nav" style="--n:6" aria-label="여행 메뉴">' + TABS.map(([k, n]) =>
    '<button class="' + (k === tab ? 'on' : '') + '" data-act="tab" data-v="' + k + '" aria-current="' + (k === tab ? 'page' : 'false') + '">' + ic(k) + n + '</button>').join('') + '</nav>';
  const fab = { plan: 'item-new', recs: 'rec-new', money: 'spend-new', prep: 'check-new', log: UI.logK === 'note' ? 'note-new' : 'place-new', over: 'booking-new' }[tab];
  if (fab) h += '<button class="fab" data-act="' + fab + '" data-v="' + esc(t.id) + '" aria-label="더하기">' + ic('plus') + '</button>';
  return h;
}
function planCost(t) { let s = 0; live('items', t.id).forEach(i => s += toWon(t, i.cost)); return s; }
function spentWon(t) { let s = 0; live('spends', t.id).forEach(x => s += toWon(t, x.amount, x.cur)); return s; }

function overTab(t) {
  const n = (t.members || []).length || 1;
  const ck = live('checks', t.id), done = ck.filter(c => c.done).length;
  const items = live('items', t.id);
  const t0 = today();
  const showDay = (t0 >= t.start && t0 <= t.end) ? t0 : t.start;
  const dayItems = items.filter(i => i.date === showDay).sort(byTime);
  let h = heroCard(t, false);
  if (t.memo) h += '<div class="card muted" style="margin-top:12px;white-space:pre-wrap">' + esc(t.memo) + '</div>';
  h += '<div class="sec grid2">' +
    '<div class="stat"><small>준비</small><b class="num">' + done + ' / ' + ck.length + '</b><em>' + (ck.length ? Math.round(done / ck.length * 100) : 0) + '% 끝</em></div>' +
    '<div class="stat"><small>예상 경비 (1인)</small><b class="num">' + manWon(planCost(t)) + '</b><em>가족 ' + n + '명 ' + manWon(planCost(t) * n) + '</em></div></div>';
  h += '<div class="sec"><div class="sec-h"><h3>' + (showDay === t0 ? '오늘 일정' : '첫날 일정') + ' · ' + esc(md(showDay)) + '</h3><button class="more" data-act="tab" data-v="plan">전체 일정</button></div>' +
    (dayItems.length ? '<div class="tl">' + dayItems.slice(0, 6).map(i => tlItem(t, i)).join('') + '</div>' : '<div class="card empty">이날 일정이 없어요</div>') + '</div>';
  const bk = live('bookings', t.id).sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  h += '<div class="sec"><div class="sec-h"><h3>예약 · 서류</h3><button class="more" data-act="booking-new" data-v="' + esc(t.id) + '">＋ 더하기</button></div><div class="stack">' +
    (bk.length ? bk.map(b => passCard(t, b)).join('') : '<div class="card empty">항공권·숙소·티켓 예약을 모아 두세요</div>') + '</div></div>';
  h += '<div class="sec"><div class="sec-h"><h3>기록 남기기</h3></div><div class="card"><div class="menu-list">' +
    '<button data-act="export-doc" data-v="' + esc(t.id) + '">' + ic('doc') + '<span>구글 드라이브 문서로 기록<small>' + (t.docAt ? '마지막 ' + new Date(t.docAt).toLocaleString('ko-KR') : '4gospel 드라이브 「하하가족여행/기록」') + '</small></span></button>' +
    (safeUrl(t.docUrl) ? '<a href="' + esc(t.docUrl) + '" target="_blank" rel="noopener">' + ic('link') + '<span>기록 문서 열기</span></a>' : '') +
    '<button data-act="export-notion" data-v="' + esc(t.id) + '">' + ic('notion') + '<span>노션에 기록<small>' + (t.notionAt ? '마지막 ' + new Date(t.notionAt).toLocaleString('ko-KR') : '설정에서 노션을 이어 두면 돼요') + '</small></span></button>' +
    (safeUrl(t.notionUrl) ? '<a href="' + esc(t.notionUrl) + '" target="_blank" rel="noopener">' + ic('link') + '<span>노션 페이지 열기</span></a>' : '') +
    '</div><div class="muted" style="margin-top:6px">모든 고침은 4gospel 드라이브 「하하가족여행/data.json」에 바로 저장되고, 날마다 백업 사본이 남아요.</div></div></div>';
  return h;
}
function passCard(t, b) {
  const tm = b.time ? b.time : '';
  return '<button class="pass" data-act="booking-edit" data-v="' + esc(b.id) + '"><div class="main"><div class="k">' + ic(BK_IC[b.kind] || 'ticket').replace('class="i ', 'class="i " style="width:14px;height:14px;vertical-align:-2px" ') + ' ' + esc(b.kind) + (b.provider ? ' · ' + esc(b.provider) : '') + '</div>' +
    '<div class="t">' + esc(b.title) + '</div>' + (b.memo ? '<div class="m">' + esc(b.memo) + '</div>' : '') +
    (b.code ? '<span class="code">예약번호 ' + esc(b.code) + '</span>' : '') + '</div>' +
    '<div class="side"><small>' + esc(b.date ? md(b.date) : '날짜 미정') + '</small><b class="num">' + esc(tm || '—') + '</b>' + (b.end ? '<small class="num">→ ' + esc(String(b.end).length > 5 ? md(String(b.end).slice(0, 10)) + ' ' + String(b.end).slice(11) : b.end) + '</small>' : '') + '</div></button>';
}
const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.ts - b.ts);

function tlItem(t, i) {
  const pl = i.place ? '<a class="maplink" href="' + esc(mapUrl(i.place)) + '" target="_blank" rel="noopener" data-stop="1">' + ic('pin') + esc(i.place.length > 26 ? i.place.slice(0, 25) + '…' : i.place) + '</a>' : '';
  return '<div class="tl-item ' + (i.done ? 'done' : '') + '"><div class="tl-time num">' + esc(i.time || '') + '</div>' +
    '<div class="tl-card" style="--cc:' + catVar(i.cat) + '"><button class="chk ' + (i.done ? 'on' : '') + '" data-act="item-done" data-v="' + esc(i.id) + '" aria-label="다녀옴 표시">' + (i.done ? ic('check') : '') + '</button>' +
    '<button class="body" style="text-align:left" data-act="item-edit" data-v="' + esc(i.id) + '"><div class="t">' + esc(i.title) + '</div>' + (i.memo ? '<div class="m">' + esc(i.memo) + '</div>' : '') +
    '<div class="meta"><span class="tag">' + esc(i.cat || '기타') + '</span>' + (i.cost ? '<span class="tag num" style="--cc:var(--soft)">1인 ' + comma(i.cost) + unit(t.cur) + '</span>' : '') + '</div></button>' +
    '</div>' + (pl ? '<div></div><div style="margin:-4px 0 10px 16px">' + pl + '</div>' : '') + '</div>';
}

function planTab(t) {
  const items = live('items', t.id);
  const days = daysOf(t);
  items.forEach(i => { if (i.date && !days.includes(i.date)) days.push(i.date); });
  days.sort();
  const hasIdea = items.some(i => !i.date);
  let sel = UI.day[t.id];
  if (!sel || (sel !== '' && !days.includes(sel) && sel !== 'idea')) sel = (today() >= t.start && today() <= t.end) ? today() : days[0];
  UI.day[t.id] = sel;
  let h = '<div class="between" style="margin:4px 0 12px"><div class="seg"><button class="' + (UI.mode === 'tl' ? 'on' : '') + '" data-act="mode" data-v="tl">하루씩</button><button class="' + (UI.mode === 'table' ? 'on' : '') + '" data-act="mode" data-v="table">스케줄표</button></div>' +
    '<span class="muted num">일정 ' + items.length + '개</span></div>';
  if (UI.mode === 'table') return h + schedTable(t, days, items);
  h += '<div class="days">' + days.map((d, k) => '<button class="day ' + (d === sel ? 'on' : '') + '" data-act="day" data-v="' + d + '"><small>' + (days.indexOf(d) + 1) + '일째</small><b class="num">' + esc(md(d)) + '</b></button>').join('') +
    '<button class="day ' + (sel === 'idea' ? 'on' : '') + '" data-act="day" data-v="idea"><small>날짜 미정</small><b>가고 싶은 곳' + (hasIdea ? '' : '') + '</b></button></div>';
  const list = items.filter(i => sel === 'idea' ? !i.date : i.date === sel).sort(byTime);
  const sum = list.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  h += list.length ? '<div class="tl" style="margin-top:6px">' + list.map(i => tlItem(t, i)).join('') + '</div>' +
    '<div class="muted num" style="text-align:right">이날 1인 예상 ' + money(t, sum) + '</div>'
    : '<div class="card empty"><b>일정이 비어 있어요</b>＋ 단추나 「추천」에서 「일정에 넣기」로 채워요.</div>';
  return h;
}
function schedTable(t, days, items) {
  let rows = '', total = 0;
  [...days, ''].forEach(d => {
    const list = items.filter(i => (i.date || '') === d).sort(byTime);
    if (!list.length) return;
    const sum = list.reduce((s, i) => s + (Number(i.cost) || 0), 0); total += sum;
    rows += '<tr class="dayrow"><td colspan="2">' + (d ? (days.indexOf(d) + 1) + '일째 · ' + esc(md(d)) : '날짜 미정') + '</td><td class="r num">' + comma(sum) + '</td></tr>';
    rows += list.map(i => '<tr data-act="item-edit" data-v="' + esc(i.id) + '" style="cursor:pointer"><td class="tm num">' + esc(i.time || '') + '</td><td><span class="dot" style="--cc:' + catVar(i.cat) + '"></span>' + esc(i.title) +
      (i.place ? '<div class="muted" style="font-size:12px;margin-left:14px">' + esc(i.place) + '</div>' : '') + '</td><td class="r num">' + (i.cost ? comma(i.cost) : '') + '</td></tr>').join('');
  });
  if (!rows) return '<div class="card empty">일정이 아직 없어요</div>';
  return '<div class="sched-wrap"><table class="sched"><thead><tr><th>시간</th><th>할 일 · 장소</th><th class="r">1인(' + unit(t.cur) + ')</th></tr></thead><tbody>' + rows +
    '<tr class="dayrow"><td colspan="2">합계 (1인)</td><td class="r num">' + comma(total) + '</td></tr></tbody></table></div>' +
    '<div class="muted" style="margin-top:8px">가족 ' + ((t.members || []).length) + '명 예상 ' + manWon(toWon(t, total) * ((t.members || []).length || 1)) + ' · 줄을 누르면 고칠 수 있어요</div>';
}

function recsTab(t) {
  const all = live('recs', t.id);
  const kinds = ['전체', ...['명소', '맛집', '쇼핑', '숙소', '팁'].filter(k => all.some(r => r.kind === k))];
  if (!kinds.includes(UI.recK)) UI.recK = '전체';
  const list = all.filter(r => UI.recK === '전체' || r.kind === UI.recK).sort((a, b) => (a.kind || '').localeCompare(b.kind || '') || a.ts - b.ts);
  const inPlan = new Set(live('items', t.id).map(i => i.rec).filter(Boolean));
  let h = '<div class="chips" style="margin:4px 0 14px">' + kinds.map(k => '<button class="chipbtn ' + (k === UI.recK ? 'on' : '') + '" data-act="reck" data-v="' + k + '">' + k + (k === '전체' ? '' : ' ' + all.filter(r => r.kind === k).length) + '</button>').join('') + '</div>';
  h += list.length ? '<div class="stack">' + list.map(r => {
    const cc = 'var(' + (RECK[r.kind] || '--c-etc') + ')';
    return '<div class="rec" style="--cc:' + cc + '"><div class="top"><span class="badge">' + ic(RC_IC[r.kind] || 'recs') + '</span><div style="flex:1;min-width:0"><h4>' + esc(r.name) + '</h4><div class="area">' + esc(r.kind) + (r.area ? ' · ' + esc(r.area) : '') + '</div></div>' +
      (inPlan.has(r.id) ? '<span class="pill hot">일정에 있음</span>' : '') + '</div>' +
      (r.desc ? '<p>' + esc(r.desc) + '</p>' : '') +
      ((r.price || r.hours) ? '<div class="info">' + (r.price ? '<span>💴 ' + esc(r.price) + '</span>' : '') + (r.hours ? '<span>🕘 ' + esc(r.hours) + '</span>' : '') + '</div>' : '') +
      '<div class="acts">' + (r.kind !== '팁' ? '<button class="btn sm navy" data-act="rec-add" data-v="' + esc(r.id) + '">' + ic('plus') + '일정에 넣기</button>' : '') +
      (r.map || r.name ? (r.kind !== '팁' ? '<a class="btn sm" href="' + esc(mapUrl(r.map || r.name)) + '" target="_blank" rel="noopener">' + ic('pin') + '지도</a>' : '') : '') +
      (safeUrl(r.link) ? '<a class="btn sm" href="' + esc(r.link) + '" target="_blank" rel="noopener">' + ic('link') + '누리집</a>' : '') +
      '<button class="btn sm" data-act="rec-edit" data-v="' + esc(r.id) + '">고치기</button></div></div>';
  }).join('') + '</div>' : '<div class="card empty"><b>추천 자료가 없어요</b>가 보고 싶은 명소·맛집을 ＋로 모아 두세요.</div>';
  h += '<div class="muted" style="margin-top:12px">영업시간·휴무는 출발 전에 꼭 다시 확인하세요. 연말연시에는 쉬는 곳이 많아요.</div>';
  return h;
}

function moneyTab(t) {
  const mem = t.members || [];
  const n = mem.length || 1;
  const plan = planCost(t), spent = spentWon(t);
  const sp = live('spends', t.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
  let h = '<div class="grid2" style="margin-top:4px">' +
    '<div class="stat"><small>예상 (일정 합계)</small><b class="num">' + manWon(plan * n) + '</b><em>1인 ' + manWon(plan) + '</em></div>' +
    '<div class="stat"><small>실제 쓴 돈</small><b class="num" style="color:var(--accent)">' + manWon(spent) + '</b><em>1인 ' + manWon(spent / n) + '</em></div></div>';
  // 갈래별
  const cats = {};
  if (sp.length) sp.forEach(s => cats[s.cat || '기타'] = (cats[s.cat || '기타'] || 0) + toWon(t, s.amount, s.cur));
  else live('items', t.id).forEach(i => { if (i.cost) cats[i.cat || '기타'] = (cats[i.cat || '기타'] || 0) + toWon(t, i.cost) * n; });
  const max = Math.max(1, ...Object.values(cats));
  const ce = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (ce.length) h += '<div class="sec"><div class="sec-h"><h3>' + (sp.length ? '어디에 썼나' : '어디에 쓸까 (예상)') + '</h3></div><div class="card">' +
    ce.map(([c, v]) => '<div class="cat-row" style="--cc:' + catVar(c) + '"><span style="font-weight:700">' + esc(c) + '</span><div class="bar"><i style="width:' + Math.round(v / max * 100) + '%"></i></div><span class="num" style="font-weight:700">' + manWon(v) + '</span></div>').join('') + '</div></div>';
  // 정산
  if (sp.length && mem.length > 1) {
    const bal = {}; mem.forEach(m => bal[m] = 0);
    sp.forEach(s => {
      const w = toWon(t, s.amount, s.cur);
      const who = (s.split && s.split.length ? s.split : mem).filter(m => m in bal);
      if (s.payer in bal) bal[s.payer] += w;
      who.forEach(m => bal[m] -= w / (who.length || 1));
    });
    const pos = Object.entries(bal).filter(x => x[1] > 1).sort((a, b) => b[1] - a[1]).map(x => [x[0], x[1]]);
    const neg = Object.entries(bal).filter(x => x[1] < -1).sort((a, b) => a[1] - b[1]).map(x => [x[0], -x[1]]);
    const moves = [];
    let i = 0, j = 0;
    while (i < neg.length && j < pos.length) {
      const m = Math.min(neg[i][1], pos[j][1]);
      if (m >= 100) moves.push([neg[i][0], pos[j][0], m]);
      neg[i][1] -= m; pos[j][1] -= m;
      if (neg[i][1] < 1) i++; if (pos[j][1] < 1) j++;
    }
    h += '<div class="sec"><div class="sec-h"><h3>정산</h3><span class="more">원 기준 · 나눠 낼 사람끼리 똑같이</span></div><div class="card">' +
      (moves.length ? moves.map(([a, b, m]) => '<div class="settle">' + av(a, 26) + '<b>' + esc(a) + '</b> → ' + av(b, 26) + '<b>' + esc(b) + '</b><span class="amt num">' + comma(Math.round(m / 10) * 10) + '원</span></div>').join('')
        : '<div class="muted">주고받을 돈이 없어요 👍</div>') +
      '<div class="hr"></div><div class="muted">' + mem.map(m => esc(m) + ' 낸 돈 ' + manWon(sp.filter(s => s.payer === m).reduce((x, s) => x + toWon(t, s.amount, s.cur), 0))).join(' · ') + '</div></div></div>';
  }
  h += '<div class="sec"><div class="sec-h"><h3>쓴 돈 기록</h3><span class="more num">' + sp.length + '건</span></div><div class="card">' +
    (sp.length ? sp.map(s => '<button class="row" data-act="spend-edit" data-v="' + esc(s.id) + '">' + av(s.payer, 30) + '<span class="body"><div class="t">' + esc(s.title) + '</div><div class="m">' + esc(md(s.date)) + ' · ' + esc(s.cat || '') + ' · ' + esc(s.payer || '') + ' 냄</div></span>' +
      '<span class="amt num">' + comma(s.amount) + unit(s.cur || t.cur) + ((s.cur || t.cur) !== 'KRW' ? '<small>≈ ' + manWon(toWon(t, s.amount, s.cur)) + '</small>' : '') + '</span></button>').join('')
      : '<div class="empty"><b>아직 쓴 돈이 없어요</b>여행 중 ＋로 바로 적으면 정산까지 저절로 돼요.</div>') + '</div></div>';
  if (t.cur !== 'KRW') h += '<div class="muted" style="margin-top:10px">환율: 100' + unit(t.cur) + ' = ' + comma(t.rate) + '원 (여행 정보 고치기에서 바꿀 수 있어요)</div>';
  return h;
}

function prepTab(t) {
  const ck = live('checks', t.id);
  const done = ck.filter(c => c.done).length, p = ck.length ? Math.round(done / ck.length * 100) : 0;
  const groups = {};
  ck.forEach(c => (groups[c.cat || '기타'] = groups[c.cat || '기타'] || []).push(c));
  let h = '<div class="card flex" style="gap:14px;margin-top:4px"><div class="ring" style="--p:' + p + '"><span class="num">' + p + '%</span></div><div><b style="font-size:16px">' + done + ' / ' + ck.length + ' 준비 끝</b><div class="muted">' +
    (dayDiff(today(), t.start) > 0 ? '출발까지 ' + dayDiff(today(), t.start) + '일 남았어요' : '즐거운 여행 되세요') + '</div></div></div>';
  Object.keys(groups).sort().forEach(g => {
    const list = groups[g].sort((a, b) => (a.done - b.done) || a.ts - b.ts);
    h += '<div class="sec"><div class="sec-h"><h3>' + esc(g) + '</h3><span class="more num">' + list.filter(c => c.done).length + '/' + list.length + '</span></div><div class="card">' +
      list.map(c => '<div class="row ' + (c.done ? 'done' : '') + '"><button class="chk ' + (c.done ? 'on' : '') + '" data-act="check-done" data-v="' + esc(c.id) + '" aria-label="끝 표시">' + (c.done ? ic('check') : '') + '</button>' +
        '<button class="body" style="text-align:left" data-act="check-edit" data-v="' + esc(c.id) + '"><div class="t">' + esc(c.text) + '</div>' + (c.memo ? '<div class="m">' + esc(c.memo) + '</div>' : '') + '</button>' +
        (c.who ? '<span class="pill">' + esc(c.who) + '</span>' : '') + '</div>').join('') + '</div></div>';
  });
  if (!ck.length) h += '<div class="card empty sec"><b>준비물이 없어요</b>＋로 챙길 것을 더하고 맡을 사람을 정해요.</div>';
  return h;
}

function logTab(t) {
  let h = '<div class="seg" style="margin:4px 0 14px"><button class="' + (UI.logK === 'note' ? 'on' : '') + '" data-act="logk" data-v="note">여행 일기</button><button class="' + (UI.logK === 'place' ? 'on' : '') + '" data-act="logk" data-v="place">가 본 곳 평가</button></div>';
  if (UI.logK === 'note') {
    const nt = live('notes', t.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
    h += nt.length ? '<div class="stack">' + nt.map(n => '<button class="note" data-act="note-edit" data-v="' + esc(n.id) + '"><div class="h">' + av(n.by, 26) + esc(n.by || '') + ' · ' + esc(md(n.date)) + (n.mood ? ' · ' + esc(n.mood) : '') + '</div><p>' + esc(n.text) + '</p></button>').join('') + '</div>'
      : '<div class="card empty"><b>오늘 어땠나요?</b>한 줄이라도 남기면 나중에 가족 여행 책이 돼요.</div>';
  } else {
    const pl = live('places', t.id).sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.ts - a.ts);
    h += pl.length ? '<div class="card">' + pl.map(placeRow).join('') + '</div>' : '<div class="card empty"><b>가 본 곳을 평가해요</b>별점과 한마디를 남기면 다음 여행 때 「우리가 좋았던 곳」에 모여요.</div>';
  }
  return h;
}

/* ---------- 아래 창(고치기) ---------- */
let SHEET = null;
function openSheet(html, onMount) {
  $('#sheet-body').innerHTML = html; $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden'; document.body.classList.add('sheet-open');
  if (onMount) onMount($('#sheet-body'));
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-body').innerHTML = ''; SHEET = null; document.body.style.overflow = ''; document.body.classList.remove('sheet-open'); }

/** 칸 목록으로 고치기 창 만들기 */
function form(title, fields, rec, onSave, onDelete) {
  SHEET = { fields, rec, onSave, onDelete, armed: false };
  let h = '<h2>' + esc(title) + '</h2><form class="f" data-form="sheet">';
  const row = [];
  fields.forEach(f => {
    const v = rec[f.k] != null ? rec[f.k] : (f.def != null ? f.def : '');
    let x = '';
    const id = 'f_' + f.k;
    if (f.type === 'textarea') x = '<textarea class="in" id="' + id + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    else if (f.type === 'opts' || f.type === 'multi') {
      const vs = f.type === 'multi' ? (Array.isArray(v) ? v : []) : [v];
      x = '<div class="opts" id="' + id + '" data-type="' + f.type + '">' + f.options.map(o => '<button type="button" class="opt ' + (vs.includes(o) ? 'on' : '') + '" data-opt="' + esc(o) + '">' + esc(o === '' ? '정하지 않음' : (f.names && f.names[o]) || o) + '</button>').join('') + '</div>';
    } else if (f.type === 'stars') {
      x = '<div class="starpick" id="' + id + '" data-v="' + (Number(v) || 0) + '">' + [1, 2, 3, 4, 5].map(k => '<button type="button" class="' + (k <= v ? 'on' : '') + '" data-star="' + k + '" aria-label="별 ' + k + '개">★</button>').join('') + '</div>';
    } else x = '<input class="in" id="' + id + '" type="' + (f.type || 'text') + '"' + (f.type === 'number' ? ' inputmode="decimal" step="any"' : '') + ' value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"' + (f.list ? ' list="dl_' + f.k + '"' : '') + '>' +
      (f.list ? '<datalist id="dl_' + f.k + '">' + f.list.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist>' : '');
    const cell = '<label class="fl"><span>' + esc(f.label) + '</span>' + x + '</label>';
    if (f.half) { row.push(cell); if (row.length === 2) { h += '<div class="f2">' + row.join('') + '</div>'; row.length = 0; } }
    else { if (row.length) { h += '<div class="f2">' + row.join('') + '</div>'; row.length = 0; } h += cell; }
  });
  if (row.length) h += '<div class="f2">' + row.join('') + '</div>';
  h += '<div class="sheet-acts">' + (onDelete ? '<button type="button" class="btn danger" data-act="sheet-del">' + ic('trash') + '지우기</button>' : '') +
    '<button type="button" class="btn" data-act="sheet-close">닫기</button><button class="btn pri">간직</button></div></form>';
  openSheet(h, el => { const first = el.querySelector('input.in,textarea.in'); if (first && !rec.id) setTimeout(() => first.focus(), 250); });
}
function readForm() {
  const out = {};
  SHEET.fields.forEach(f => {
    const el = document.getElementById('f_' + f.k); if (!el) return;
    if (f.type === 'opts') { const on = el.querySelector('.opt.on'); out[f.k] = on ? on.dataset.opt : ''; }
    else if (f.type === 'multi') out[f.k] = [...el.querySelectorAll('.opt.on')].map(b => b.dataset.opt);
    else if (f.type === 'stars') out[f.k] = Number(el.dataset.v) || 0;
    else if (f.type === 'number') out[f.k] = el.value === '' ? 0 : Number(String(el.value).replace(/,/g, ''));
    else out[f.k] = el.value.trim();
  });
  return out;
}

/* 갈래마다 칸 */
const ITEM_CATS = Object.keys(CAT);
const F = {
  trip: () => [
    { k: 'title', label: '여행 이름', ph: '예: 오사카 가족여행' },
    { k: 'place', label: '어디로', ph: '예: 일본 오사카 · 교토' },
    { k: 'start', label: '가는 날', type: 'date', half: 1 }, { k: 'end', label: '오는 날', type: 'date', half: 1 },
    { k: 'members', label: '함께 가는 사람', type: 'multi', options: D.meta.family.map(f => f.name) },
    { k: 'cur', label: '현지 돈', type: 'opts', options: Object.keys(CUR), names: CUR },
    { k: 'rate', label: '환율 (현지 돈 100 = 몇 원)', type: 'number', ph: '예: 엔화 950' },
    { k: 'color', label: '표지 색', type: 'opts', options: Object.keys(GRAD), names: { sea: '바다', sunset: '노을', forest: '숲', plum: '보라', sand: '모래' } },
    { k: 'memo', label: '메모', type: 'textarea', ph: '숙소·교통·꼭 기억할 것' }],
  item: t => [
    { k: 'title', label: '할 일', ph: '예: 후시미 이나리 신사' },
    { k: 'date', label: '날짜 (비우면 날짜 미정)', type: 'date', half: 1 }, { k: 'time', label: '시간', type: 'time', half: 1 },
    { k: 'cat', label: '갈래', type: 'opts', options: ITEM_CATS },
    { k: 'place', label: '장소 (지도 검색어)', ph: '예: Fushimi Inari Taisha' },
    { k: 'cost', label: '1인 비용 (' + unit(t.cur) + ')', type: 'number', half: 1 },
    { k: 'memo', label: '메모', type: 'textarea', ph: '가는 길·예약·팁' }],
  booking: t => [
    { k: 'kind', label: '갈래', type: 'opts', options: ['항공', '숙소', '티켓', '교통', '서류', '기타'] },
    { k: 'title', label: '이름', ph: '예: 제주항공 7C1391 인천 → 간사이' },
    { k: 'date', label: '날짜', type: 'date', half: 1 }, { k: 'time', label: '시간', type: 'time', half: 1 },
    { k: 'end', label: '끝 (도착·체크아웃)', ph: '예: 09:50 또는 2027-01-01 10:00' },
    { k: 'provider', label: '어디서 예약', ph: '예: 트립닷컴', half: 1 }, { k: 'code', label: '예약번호', half: 1 },
    { k: 'link', label: '예약 주소 (https://…)', type: 'url' },
    { k: 'memo', label: '메모', type: 'textarea' }],
  spend: t => [
    { k: 'title', label: '어디에', ph: '예: 구로몬 시장 점심' },
    { k: 'amount', label: '얼마', type: 'number', half: 1 }, { k: 'cur', label: '돈', type: 'opts', options: [...new Set([t.cur || 'KRW', 'KRW'])], names: CUR, half: 1 },
    { k: 'date', label: '날짜', type: 'date', half: 1 }, { k: 'cat', label: '갈래', type: 'opts', options: ITEM_CATS },
    { k: 'payer', label: '낸 사람', type: 'opts', options: t.members || [] },
    { k: 'split', label: '나눠 낼 사람', type: 'multi', options: t.members || [] },
    { k: 'memo', label: '메모', type: 'textarea' }],
  check: t => [
    { k: 'text', label: '챙길 것', ph: '예: 보조배터리' },
    { k: 'cat', label: '묶음', list: ['서류', '예약', '전자기기', '돈', '옷', '생활', '기타'], ph: '예: 전자기기' },
    { k: 'who', label: '맡은 사람', type: 'opts', options: ['', ...(t.members || [])] },
    { k: 'memo', label: '메모' }],
  rec: t => [
    { k: 'kind', label: '갈래', type: 'opts', options: ['명소', '맛집', '쇼핑', '숙소', '팁'] },
    { k: 'name', label: '이름' }, { k: 'area', label: '동네', half: 1 }, { k: 'price', label: '값', half: 1 },
    { k: 'desc', label: '설명', type: 'textarea' }, { k: 'hours', label: '여는 시간·휴무' },
    { k: 'map', label: '지도 검색어', ph: '예: Kuromon Market' }, { k: 'link', label: '누리집 (https://…)', type: 'url' }],
  note: t => [
    { k: 'date', label: '날짜', type: 'date', half: 1 }, { k: 'mood', label: '기분', type: 'opts', options: ['😊', '🥰', '😆', '😴', '🥵', '🤤'], half: 1 },
    { k: 'text', label: '오늘 이야기', type: 'textarea', ph: '무엇이 좋았나요? 무엇을 먹었나요?' }],
  place: t => [
    { k: 'name', label: '곳 이름' }, { k: 'cat', label: '갈래', type: 'opts', options: ['맛집', '명소', '숙소', '쇼핑', '카페'] },
    { k: 'rating', label: '별점', type: 'stars' }, { k: 'memo', label: '한마디', type: 'textarea', ph: '다시 가고 싶나요? 무엇이 맛있었나요?' },
    { k: 'map', label: '지도 검색어' }]
};
const TITLE = { item: '일정', booking: '예약·서류', spend: '쓴 돈', check: '준비물', rec: '추천 자료', note: '여행 일기', place: '가 본 곳' };
const COLL = { item: 'items', booking: 'bookings', spend: 'spends', check: 'checks', rec: 'recs', note: 'notes', place: 'places' };

function editRec(kind, t, rec) {
  const isNew = !rec.id;
  const c = COLL[kind];
  form((isNew ? '새 ' : '') + TITLE[kind], F[kind](t), rec, vals => {
    if (kind === 'spend' && !(vals.amount > 0)) return toast('얼마인지 적어 주세요');
    const main = { item: 'title', booking: 'title', spend: 'title', check: 'text', rec: 'name', note: 'text', place: 'name' }[kind];
    if (!vals[main]) return toast('내용을 적어 주세요');
    put(c, Object.assign({}, rec, vals, { id: rec.id || uid(kind[0]), trip: t.id }));
    closeSheet(); toast('간직했어요');
  }, isNew ? null : () => { remove(c, rec.id); closeSheet(); toast('지웠어요'); });
}
function editTrip(t) {
  const isNew = !t;
  const rec = t || { start: ymd(new Date(Date.now() + 30 * 864e5)), end: ymd(new Date(Date.now() + 33 * 864e5)), members: D.meta.family.map(f => f.name), cur: 'JPY', rate: 950, color: 'sea' };
  form(isNew ? '새 여행' : '여행 정보', F.trip(), rec, vals => {
    if (!vals.title) return toast('여행 이름을 적어 주세요');
    if (!vals.start || !vals.end || vals.end < vals.start) return toast('날짜를 확인해 주세요');
    const id = rec.id || uid('t');
    put('trips', Object.assign({}, rec, vals, { id, cur: vals.cur || 'KRW', color: vals.color || 'sea' }));
    closeSheet();
    if (isNew) go('#/trip/' + encodeURIComponent(id) + '/over');
  }, null);
}

/* ---------- 누름 ---------- */
document.addEventListener('click', e => {
  const sopt = e.target.closest('.opt');
  if (sopt) {
    const box = sopt.parentElement;
    if (box.dataset.type === 'multi') sopt.classList.toggle('on');
    else { const was = sopt.classList.contains('on'); box.querySelectorAll('.opt').forEach(b => b.classList.remove('on')); if (!was || box.dataset.type === 'opts') sopt.classList.add('on'); }
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
    'open-trip': () => go('#/trip/' + encodeURIComponent(v) + '/over'),
    tab: () => go('#/trip/' + encodeURIComponent(r.trip) + '/' + v),
    me: () => { ME = v; LS.set('me', v); render(); toast(v + ' 님, 반가워요'); },
    mode: () => { UI.mode = v; LS.set('mode', v); render(); },
    day: () => { UI.day[r.trip] = v; render(); },
    reck: () => { UI.recK = v; render(); },
    logk: () => { UI.logK = v; render(); },
    'sheet-close': () => closeSheet(),
    'sheet-del': () => {
      if (!SHEET || !SHEET.onDelete) return;
      if (!SHEET.armed) { SHEET.armed = true; el.textContent = '한 번 더 누르면 지워요'; return; }
      SHEET.onDelete();
    },
    'trip-new': () => editTrip(null),
    'item-new': () => editRec('item', t, { date: UI.day[t.id] === 'idea' ? '' : (UI.day[t.id] || t.start), cat: '관광', cost: 0 }),
    'item-edit': () => editRec('item', t, D.items[v]),
    'item-done': () => { const i = D.items[v]; put('items', Object.assign({}, i, { done: !i.done })); },
    'booking-new': () => editRec('booking', t || D.trips[v], { kind: '숙소', date: (t || D.trips[v]).start }),
    'booking-edit': () => editRec('booking', t, D.bookings[v]),
    'spend-new': () => editRec('spend', t, { date: (today() >= t.start && today() <= t.end) ? today() : t.start, cur: t.cur, cat: '식사', payer: (t.members || []).includes(ME) ? ME : (t.members || [])[0], split: (t.members || []).slice() }),
    'spend-edit': () => editRec('spend', t, D.spends[v]),
    'check-new': () => editRec('check', t, { cat: '기타', who: '' }),
    'check-edit': () => editRec('check', t, D.checks[v]),
    'check-done': () => { const c = D.checks[v]; put('checks', Object.assign({}, c, { done: !c.done })); },
    'rec-new': () => editRec('rec', t, { kind: UI.recK !== '전체' ? UI.recK : '맛집' }),
    'rec-edit': () => editRec('rec', t, D.recs[v]),
    'rec-add': () => recToPlan(t, D.recs[v]),
    'note-new': () => editRec('note', t, { date: (today() >= t.start && today() <= t.end) ? today() : t.start }),
    'note-edit': () => editRec('note', t, D.notes[v]),
    'place-new': () => editRec('place', t, { cat: '맛집', rating: 5 }),
    'place-edit': () => { const p = D.places[v]; editRec('place', D.trips[p.trip], p); },
    'all-places': () => openSheet('<h2>우리가 가 본 곳</h2><div>' + live('places').sort((a, b) => (b.rating || 0) - (a.rating || 0)).map(placeRow).join('') + '</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'),
    'trip-menu': () => tripMenu(D.trips[v]),
    'trip-edit': () => editTrip(D.trips[v]),
    'trip-copy': () => copyTrip(D.trips[v]),
    'trip-del': () => {
      if (!el.dataset.armed) { el.dataset.armed = '1'; el.querySelector('span').firstChild.textContent = '한 번 더 누르면 이 여행을 지워요'; return; }
      remove('trips', v); closeSheet(); go('#/'); toast('여행을 지웠어요');
    },
    'export-doc': () => exportTo('exportDoc', v, '드라이브 문서'),
    'export-notion': () => exportTo('exportNotion', v, '노션'),
    settings: () => settings(),
    'who-again': () => { ME = ''; LS.del('me'); closeSheet(); render(); },
    'pull': () => { closeSheet(); pull().then(() => toast('새로 받았어요')); },
    'logout': () => { if (!el.dataset.armed) { el.dataset.armed = '1'; el.querySelector('span').firstChild.textContent = '한 번 더 누르면 이 기기에서 나가요'; return; } PASS = ''; ME = ''; LS.del('pass'); LS.del('me'); LS.del('data'); LS.del('q'); D = empty(); Q = []; closeSheet(); render(); },
    'fam-edit': () => famEdit(), 'pass-edit': () => passEdit(), 'notion-edit': () => notionEdit(),
    'drive-open': async () => { try { const u = await call('folderUrl'); linkSheet('드라이브 폴더', u); } catch (er) { toast('폴더를 못 찾았어요: ' + er.message); } },
    'install': () => openSheet('<h2>휴대폰 홈 화면에 앱처럼 두기</h2><div class="stack"><div class="card"><b>아이폰 (사파리)</b><div class="muted">아래 공유 단추 → 「홈 화면에 추가」</div></div><div class="card"><b>갤럭시 (크롬·삼성 인터넷)</b><div class="muted">오른쪽 위 ⋮ 또는 ≡ → 「홈 화면에 추가」 또는 「앱 설치」</div></div></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'),
    'copy-link': () => { const u = location.origin + location.pathname; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('주소를 복사했어요'), () => toast(u)); }
  };
  if (A[a]) { e.preventDefault(); A[a](); }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'sheet' && SHEET) return SHEET.onSave(readForm());
  if (f === 'lock') {
    const p = $('#pass').value.trim(), msg = $('#lockmsg');
    if (!p) return;
    msg.textContent = '확인 중…';
    PASS = p;
    try { const d = await call('load'); LS.set('pass', p); adopt(d); render(); }
    catch (er) { PASS = ''; msg.textContent = er.code === 'pass' ? '암호가 맞지 않아요' : er.code === 'not_setup' ? '서버 준비가 아직 안 됐어요 (setup 실행 필요)' : '연결이 안 돼요. 인터넷을 확인해 주세요'; }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

function recToPlan(t, r) {
  const days = daysOf(t);
  const catOf = { 맛집: '식사', 명소: '관광', 쇼핑: '쇼핑', 숙소: '숙소' };
  SHEET = { fields: [], onSave: () => {} };
  openSheet('<h2>「' + esc(r.name) + '」 일정에 넣기</h2><div class="f"><div class="fl"><span>어느 날</span><div class="opts" id="rp_day">' +
    days.map((d, k) => '<button type="button" class="opt ' + (k === 0 ? 'on' : '') + '" data-opt="' + d + '">' + (k + 1) + '일째 ' + esc(md(d)) + '</button>').join('') + '<button type="button" class="opt" data-opt="">날짜 미정</button></div></div>' +
    '<label class="fl"><span>시간</span><input class="in" id="rp_time" type="time"></label></div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="rp_go">일정에 넣기</button></div>',
    el => el.querySelector('#rp_go').onclick = () => {
      const on = el.querySelector('#rp_day .opt.on');
      put('items', { id: uid('i'), trip: t.id, date: on ? on.dataset.opt : '', time: el.querySelector('#rp_time').value, title: r.name, cat: catOf[r.kind] || '관광', place: r.map || r.name, cost: 0, memo: [r.desc, r.price].filter(Boolean).join(' · '), rec: r.id, done: false });
      closeSheet(); toast('일정에 넣었어요');
    });
}
function tripMenu(t) {
  openSheet('<h2>' + esc(t.title) + '</h2><div class="menu-list">' +
    '<button data-act="trip-edit" data-v="' + esc(t.id) + '">' + ic('plan') + '<span>여행 정보 고치기<small>날짜·사람·환율·표지 색</small></span></button>' +
    '<button data-act="export-doc" data-v="' + esc(t.id) + '">' + ic('doc') + '<span>구글 드라이브 문서로 기록</span></button>' +
    '<button data-act="export-notion" data-v="' + esc(t.id) + '">' + ic('notion') + '<span>노션에 기록</span></button>' +
    '<button data-act="trip-copy" data-v="' + esc(t.id) + '">' + ic('copy') + '<span>이 여행을 본떠 새 여행<small>준비물·추천 자료를 그대로 가져가요</small></span></button>' +
    '<button data-act="copy-link">' + ic('link') + '<span>앱 주소 복사<small>가족에게 보내 주세요 (암호는 따로)</small></span></button>' +
    '<button data-act="trip-del" data-v="' + esc(t.id) + '" style="color:var(--warn)">' + ic('trash') + '<span>이 여행 지우기<small>드라이브 백업에는 남아요</small></span></button>' +
    '</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function copyTrip(t) {
  const id = uid('t');
  put('trips', { id, title: t.title + ' (새)', place: t.place, start: t.start, end: t.end, members: (t.members || []).slice(), cur: t.cur, rate: t.rate, color: t.color, memo: '' });
  live('checks', t.id).forEach(c => put('checks', { id: uid('c'), trip: id, text: c.text, cat: c.cat, who: '', done: false }));
  live('recs', t.id).forEach(r => put('recs', Object.assign({}, r, { id: uid('r'), trip: id, ts: 0 })));
  closeSheet(); editTrip(D.trips[id]);
}
async function exportTo(fn, tripId, name) {
  if (Q.length) await flush();
  toast(name + '에 기록하는 중…');
  try { const r = await call(fn, tripId, ME); await pull(); linkSheet(name + '에 기록했어요', r.url); }
  catch (er) { openSheet('<h2>' + esc(name) + ' 기록이 안 됐어요</h2><p class="muted">' + esc(er.message) + '</p>' + (fn === 'exportNotion' ? '<button class="btn pri wide" data-act="notion-edit">노션 연결하기</button>' : '') + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>'); }
}
function linkSheet(title, url) {
  openSheet('<h2>' + esc(title) + '</h2>' + (safeUrl(url) ? '<a class="btn pri wide" href="' + esc(url) + '" target="_blank" rel="noopener">' + ic('link') + '열기</a>' : '') + '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}

/* ---------- 설정 ---------- */
function settings() {
  openSheet('<h2>설정</h2><div class="flex" style="margin-bottom:8px">' + av(ME, 40) + '<div><b>' + esc(ME) + '</b><div class="muted">이 휴대폰을 쓰는 사람</div></div></div><div class="menu-list">' +
    '<button data-act="who-again">' + ic('users') + '<span>다른 사람으로 바꾸기</span></button>' +
    '<button data-act="fam-edit">' + ic('users') + '<span>가족 목록<small>' + esc(D.meta.family.map(f => f.name).join(', ')) + '</small></span></button>' +
    '<button data-act="pass-edit">' + ic('key') + '<span>가족 암호 바꾸기<small>바꾸면 다른 가족도 새 암호를 넣어야 해요</small></span></button>' +
    '<button data-act="notion-edit">' + ic('notion') + '<span>노션 연결<small>노션 통합 열쇠와 기록할 페이지</small></span></button>' +
    '<button data-act="drive-open">' + ic('folder') + '<span>구글 드라이브 폴더 열기<small>4gospel 「하하가족여행」 — 원본·백업·기록 문서</small></span></button>' +
    '<button data-act="install">' + ic('phone') + '<span>홈 화면에 앱처럼 두기</span></button>' +
    '<button data-act="copy-link">' + ic('link') + '<span>앱 주소 복사</span></button>' +
    '<button data-act="pull">' + ic('sync') + '<span>지금 새로 받기<small>판 ' + D.rev + (Q.length ? ' · 못 보낸 고침 ' + Q.length + '개' : '') + '</small></span></button>' +
    '<button data-act="logout" style="color:var(--warn)">' + ic('out') + '<span>이 기기에서 나가기<small>이 휴대폰의 사본과 암호를 지워요</small></span></button>' +
    '</div><div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button></div>');
}
function famEdit() {
  SHEET = { fields: [], onSave: () => {} };
  openSheet('<h2>가족 목록</h2><p class="muted">한 줄에 한 사람, 「이름 / 관계」로 적어 주세요.</p><textarea class="in" id="famtx" rows="6">' + esc(D.meta.family.map(f => f.name + ' / ' + (f.role || '')).join('\n')) + '</textarea>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="famgo">간직</button></div>', el => el.querySelector('#famgo').onclick = () => {
      const fam = el.querySelector('#famtx').value.split('\n').map(l => l.split('/').map(s => s.trim())).filter(x => x[0]).map(x => ({ name: x[0], role: x[1] || '' }));
      if (!fam.length) return toast('한 사람 이상 적어 주세요');
      put('meta', Object.assign({}, D.meta, { family: fam })); closeSheet(); toast('가족 목록을 간직했어요');
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
  openSheet('<h2>노션 연결</h2><div class="muted" style="margin-bottom:12px">① notion.so/profile/integrations 에서 「새 통합」을 만들고 열쇠(ntn_…)를 복사해요.<br>② 기록을 모을 노션 페이지 → ⋯ → 「연결」에서 그 통합을 더해요.<br>③ 아래에 열쇠와 그 페이지 주소를 넣어요.</div>' +
    '<div class="f"><label class="fl"><span>통합 열쇠 ' + (st.key ? '(들어 있음 — 바꿀 때만)' : '') + '</span><input class="in" id="nk" type="password" placeholder="ntn_…" autocomplete="off"></label>' +
    '<label class="fl"><span>기록할 노션 페이지 주소 ' + (st.parent ? '(들어 있음)' : '') + '</span><input class="in" id="np2" type="url" placeholder="https://www.notion.so/…"></label></div>' +
    '<div class="sheet-acts"><button class="btn" data-act="sheet-close">닫기</button><button class="btn pri" id="nkgo">간직</button></div>', el => el.querySelector('#nkgo').onclick = async () => {
      try { const r = await call('setNotion', el.querySelector('#nk').value.trim(), el.querySelector('#np2').value.trim()); closeSheet(); toast(r.key && r.parent ? '노션을 이었어요' : '열쇠와 페이지를 모두 넣어 주세요'); }
      catch (er) { toast('못 넣었어요: ' + er.message); }
    });
}

/* ---------- 시작 ---------- */
render();
if (PASS) pull();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
