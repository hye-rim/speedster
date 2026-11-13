'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 번개 다람쥐: 화면·입력·소리. 규칙은 logic.js (LOGIC_SP). 여기서는 규칙이 알려 주는 일(events)을 보고 소리·효과를 만든다.
const L = LOGIC_SP, $ = (id) => document.getElementById(id);
const TUT = /[?&]tutorial=1(&|$)/.test(location.search);
const VW = L.VW, VH = L.VH;
const cv = $('c'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계속 */ } },
};
const LAST = L.ZONES.length - 1;
let unlocked = Math.max(0, Math.min(LAST, store.get('spZone', 0) | 0)), best = store.get('spBest', 0) | 0, soundOn = store.get('spSound', true);
let G = null, screen = 'title', paused = false, selZone = unlocked, runScore = 0, endT = 0;
let camX = 0, clock = 0, fx = [], floats = [], shake = 0, banner = null, trail = [];
const TITLE_HTML = $('overlay').innerHTML;

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'square', vol = 0.04, slide = 0, delay = 0) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* 소리가 안 나도 게임은 계속 */ }
}
let ringPitch = 0, lastRing = -9;
const sfx = {
  ring() { const now = clock; ringPitch = now - lastRing < 0.35 ? Math.min(ringPitch + 1, 6) : 0; lastRing = now; tone(1100 + ringPitch * 90, 0.09, 'triangle', 0.04, 300); },
  jump() { tone(420, 0.14, 'square', 0.035, 380); },
  roll() { tone(260, 0.18, 'sawtooth', 0.03, -120); },
  kill() { tone(600, 0.1, 'square', 0.05, -300); tone(300, 0.14, 'triangle', 0.05, -100, 0.06); },
  hurt() { tone(500, 0.35, 'sawtooth', 0.06, -420); },
  dead() { tone(400, 0.5, 'sawtooth', 0.06, -330); },
  spring() { tone(300, 0.25, 'sine', 0.06, 800); },
  boost() { tone(500, 0.3, 'sawtooth', 0.05, 700); },
  check() { tone(880, 0.1, 'triangle', 0.05); tone(1320, 0.14, 'triangle', 0.05, 0, 0.1); },
  clear() { [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.2, 'triangle', 0.06, 0, k * 0.1)); },
  over() { [392, 330, 262, 196].forEach((f, k) => tone(f, 0.3, 'triangle', 0.05, 0, k * 0.16)); },
};

// ---------- 크기 ----------
let cssW = VW, K = 1;
function resize() {
  const land = matchMedia('(pointer:coarse) and (orientation:landscape)').matches;
  const ctl = $('controls'), controlsH = (!land && getComputedStyle(ctl).display !== 'none') ? ctl.offsetHeight + 8 : 0;
  const sideW = land ? $('stick').offsetWidth + $('jumpBtn').offsetWidth + 32 : 0;
  const s = Math.max(0.5, Math.min((innerWidth - 16 - sideW) / VW, (innerHeight - 20 - controlsH) / VH));
  cssW = VW * s; cv.style.width = VW * s + 'px'; cv.style.height = VH * s + 'px';
  K = Math.max(1, Math.ceil(s * Math.min(2, window.devicePixelRatio || 1)));
  cv.width = VW * K; cv.height = VH * K;
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------- 입력 ----------
const keys = new Set(), pad = { left: false, right: false, down: false, up: false, jumpBtn: false };
let jumpEdge = false;
const KEY = { left: ['ArrowLeft', 'a', 'A'], right: ['ArrowRight', 'd', 'D'], down: ['ArrowDown', 's', 'S'], jump: [' ', 'z', 'Z', 'ArrowUp', 'w', 'W'] };
const heldAny = (list) => list.some((k) => keys.has(k));
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const all = [...KEY.left, ...KEY.right, ...KEY.down, ...KEY.jump];
  if (all.includes(e.key)) e.preventDefault();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (screen === 'play') setPaused(true); else if (paused) setPaused(false); return; }
  if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
  if ((e.key === ' ' || e.key === 'Enter') && (screen === 'title' || screen === 'over' || screen === 'clear') && !e.repeat) { const b = $('overlay').querySelector('.btn'); if (b) b.click(); return; }
  if (KEY.jump.includes(e.key) && !e.repeat && !keys.has(e.key)) jumpEdge = true;
  keys.add(e.key);
});
addEventListener('keyup', (e) => keys.delete(e.key));
function releaseAll() { keys.clear(); pad.left = pad.right = pad.down = pad.up = pad.jumpBtn = false; jumpEdge = false; stick.on = false; padPtr = null; stickDraw(); $('jumpBtn').classList.remove('on'); }
// 점프 버튼
const jb = $('jumpBtn');
jb.addEventListener('pointerdown', (e) => { e.preventDefault(); try { jb.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } pad.jumpBtn = true; jumpEdge = true; jb.classList.add('on'); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) jb.addEventListener(t, () => { pad.jumpBtn = false; jb.classList.remove('on'); });
// 떠 있는 조이스틱: 왼쪽 칸 어디든 대면 그 자리가 중심. 좌우로 밀면 달리고, 아래로 밀면 구르고, 위로 밀면 점프
const stickEl = $('stick'), STICK = { dead: 9, reach: 24, down: 16, up: 16 }, stick = { ax: 0, ay: 0, x: 0, y: 0, on: false };
let padPtr = null;
function stickDraw() {
  const base = $('stickBase'), knob = $('stickKnob'), hint = $('stickHint');
  if (!stick.on) { base.classList.remove('on'); base.style.transform = ''; knob.style.transform = ''; hint.style.opacity = ''; return; }
  base.classList.add('on'); base.style.transform = `translate(${stick.ax - 28}px, ${stick.ay - 28}px)`;
  const dx = stick.x - stick.ax, dy = stick.y - stick.ay, d = Math.hypot(dx, dy) || 1, k = Math.min(1, 20 / d); knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; hint.style.opacity = '0';
}
function stickMove(e) {
  const r = stickEl.getBoundingClientRect();
  stick.x = Math.max(0, Math.min(r.width, e.clientX - r.left)); stick.y = Math.max(0, Math.min(r.height, e.clientY - r.top));
  let dx = stick.x - stick.ax;
  if (Math.abs(dx) > STICK.reach) { stick.ax += dx - Math.sign(dx) * STICK.reach; stick.ax = Math.max(28, Math.min(r.width - 28, stick.ax)); dx = stick.x - stick.ax; }
  const dy = stick.y - stick.ay, down = dy > STICK.down && dy > Math.abs(dx) * 0.8;
  pad.down = down; pad.left = !down && dx < -STICK.dead; pad.right = !down && dx > STICK.dead;
  const up = dy < -STICK.up; if (up && !pad.up) jumpEdge = true; pad.up = up;
  stickDraw();
}
stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); padPtr = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } const r = stickEl.getBoundingClientRect(); stick.on = true; stick.ax = Math.max(28, Math.min(r.width - 28, e.clientX - r.left)); stick.ay = Math.max(28, Math.min(r.height - 28, e.clientY - r.top)); stickMove(e); });
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === padPtr) stickMove(e); });
const stickUp = (e) => { if (e.pointerId === padPtr) { padPtr = null; pad.left = pad.right = pad.down = pad.up = false; stick.on = false; stickDraw(); } };
stickEl.addEventListener('pointerup', stickUp); stickEl.addEventListener('pointercancel', stickUp); stickEl.addEventListener('lostpointercapture', stickUp);
const readInput = () => {
  const inp = { left: heldAny(KEY.left) || pad.left, right: heldAny(KEY.right) || pad.right, down: heldAny(KEY.down) || pad.down, jump: jumpEdge, jumpHeld: heldAny(KEY.jump) || pad.jumpBtn || pad.up };
  jumpEdge = false; return inp;
};

// ---------- 흐름 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
function zonesHtml() { return L.ZONES.map((z, i) => `<button data-zone="${i}" class="${i === selZone ? 'cur' : ''}"${i > unlocked ? ' disabled' : ''}>${i > unlocked ? '🔒' : i + 1}<small>${i > unlocked ? '' : z.name}</small></button>`).join(''); }
function showTitle() {
  screen = 'title'; G = null; releaseAll(); showOverlay(TITLE_HTML);
  $('zones').innerHTML = zonesHtml(); $('zoneBox').style.display = TUT ? 'none' : '';
  $('btnStart').textContent = !TUT && unlocked > 0 ? `이어서 하기 (${unlocked + 1}코스)` : '시작하기';
  $('btnStart').onclick = () => startZone(TUT ? 0 : Math.min(unlocked, LAST), 0);
  for (const b of document.querySelectorAll('#zones button')) b.onclick = () => { if (!b.disabled) startZone(Number(b.dataset.zone), 0); };
}
function startZone(zone, carry) {
  selZone = zone; G = L.newGame({ zone, seed: TUT ? 1 : (Date.now() % 9973) + 1, score: carry, tutorial: TUT });
  camX = 0; fx = []; floats = []; shake = 0; trail = []; endT = 0; paused = false; screen = 'play'; releaseAll(); hideOverlay();
  banner = { text: TUT ? '연습' : `${zone + 1}코스 ${G.level.name}`, sub: TUT ? '달리고 · 뛰고 · 링을 모아 보세요' : '골까지 달려요!', t: 0 };
}
function saveBest() { if (!TUT && G && G.score > best) { best = G.score; store.set('spBest', best); } }
function showClear() {
  saveBest(); const last = G.zone >= LAST;
  if (!TUT && G.zone + 1 > unlocked && G.zone < LAST) { unlocked = G.zone + 1; store.set('spZone', unlocked); }
  runScore = G.score; screen = 'clear'; sfx.clear();
  showOverlay(`<h2>${last ? '🏆 모든 코스 클리어!' : '코스 클리어!'}</h2><p class="big">${G.score.toLocaleString()}점</p><p>링 ${G.ringsTotal}개 · 적 ${G.kills}마리 · 시간 ${Math.round(G.t / 60)}초<br>시간 보너스 <b>+${G.timeBonus}</b> · 링 보너스 <b>+${G.ringBonus}</b></p><div class="row"><button class="btn" id="btnNext">${last ? '처음부터 다시' : '다음 코스'}</button><button class="sub" id="btnMenu">처음 화면</button></div>`);
  $('btnNext').onclick = () => startZone(last ? 0 : G.zone + 1, last ? 0 : runScore); $('btnMenu').onclick = showTitle;
}
function showOver() {
  saveBest(); screen = 'over'; sfx.over();
  showOverlay(`<h2>게임 오버</h2><p class="big">${G.score.toLocaleString()}점</p><p>${G.zone + 1}코스 ${G.level.name}에서 ${Math.round(G.p.x)}m 지점까지 갔어요<br>최고 기록 ${best.toLocaleString()}점</p><div class="row"><button class="btn" id="btnNext">다시 하기</button><button class="sub" id="btnMenu">처음 화면</button></div>`);
  $('btnNext').onclick = () => startZone(G.zone, 0); $('btnMenu').onclick = showTitle;
}
function setPaused(p) {
  if (screen !== 'play' && !paused) return; paused = p; if (p) { releaseAll(); $('pauseBtn').textContent = '▶'; showOverlay('<h2>일시정지</h2><div class="row"><button class="btn" id="btnResume">계속하기</button><button class="sub" id="btnQuit">그만하기</button></div>'); $('btnResume').onclick = () => setPaused(false); $('btnQuit').onclick = () => { paused = false; $('pauseBtn').textContent = '⏸'; saveBest(); showTitle(); }; }
  else { $('pauseBtn').textContent = '⏸'; hideOverlay(); }
}
function toggleSound() { soundOn = !soundOn; store.set('spSound', soundOn); $('muteBtn').textContent = soundOn ? '🔊' : '🔇'; }
$('muteBtn').textContent = soundOn ? '🔊' : '🔇';
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleSound(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); setPaused(!paused); };
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
addEventListener('blur', () => { if (screen === 'play') setPaused(true); });

// ---------- 규칙이 알려 준 일 → 소리와 효과 ----------
function burst(x, y, color, n, sp = 2) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.4 + Math.random()) * sp; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, t: 0, life: 22 + Math.random() * 14, color }); } }
function handle(events) {
  for (const e of events) {
    if (e.t === 'ring') { sfx.ring(); tutorialSignal('ring'); }
    else if (e.t === 'jump') { sfx.jump(); tutorialSignal('jump'); }
    else if (e.t === 'roll') { sfx.roll(); tutorialSignal('roll'); }
    else if (e.t === 'move') tutorialSignal('move');
    else if (e.t === 'kill') { sfx.kill(); burst(e.x, e.y - 8, '#ffd23a', 10, 2.4); floats.push({ x: e.x, y: e.y - 20, t: 0, text: '+100' }); tutorialSignal('kill'); }
    else if (e.t === 'hurt') { sfx.hurt(); shake = 8; tutorialSignal('hurt'); }
    else if (e.t === 'dead') { sfx.dead(); shake = 6; }
    else if (e.t === 'spring') { sfx.spring(); tutorialSignal('spring'); }
    else if (e.t === 'boost') { sfx.boost(); tutorialSignal('boost'); }
    else if (e.t === 'check') { sfx.check(); floats.push({ x: e.x, y: 80, t: 0, text: '체크포인트' }); }
    else if (e.t === 'respawn') { camX = Math.max(0, G.p.x - 110); trail = []; }
    else if (e.t === 'clear') { tutorialSignal('clear'); burst(G.p.x, G.p.y - 12, '#ffe27a', 24, 3); }
  }
}

// ---------- 그리기 ----------
const THEMES = {
  grass: { sky: ['#4aa8ff', '#bfe6ff'], far: '#7fcf7a', near: '#4aa04a', top: '#58c040', body: ['#a2672f', '#8a5424'] },
  desert: { sky: ['#f6a850', '#fde7b0'], far: '#e8b868', near: '#d49a48', top: '#f4d68a', body: ['#c98a3e', '#b07630'] },
  ice: { sky: ['#8fc4f0', '#eaf6ff'], far: '#c8e4f8', near: '#9cc8ea', top: '#f4fbff', body: ['#79b4dc', '#62a0cc'] },
  factory: { sky: ['#2a3350', '#6a5a7a'], far: '#3a3f5a', near: '#2c3048', top: '#8a96b8', body: ['#4a5270', '#3c4360'] },
};
function drawBackground(th) {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (G.level.theme === 'factory') { ctx.fillStyle = 'rgba(255,220,120,.06)'; for (let i = 0; i < 6; i++) ctx.fillRect(((i * 70 - camX * 0.1) % 400 + 400) % 400 - 40, 0, 6, VH); }
  for (const [color, par, base, amp, wl] of [[th.far, 0.2, 130, 40, 190], [th.near, 0.45, 150, 26, 120]]) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, VH);
    for (let sx = 0; sx <= VW; sx += 8) { const wx = sx + camX * par; ctx.lineTo(sx, base - Math.abs(Math.sin(wx / wl * Math.PI)) * amp); }
    ctx.lineTo(VW, VH); ctx.fill();
  }
  if (G.level.theme === 'ice') { ctx.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { const x = ((i * 53 + clock * (14 + (i % 4) * 6) - camX * 0.4) % (VW + 20) + VW + 20) % (VW + 20) - 10, y = (i * 31 + clock * (24 + (i % 3) * 10)) % VH; ctx.fillRect(x, y, 2, 2); } }
}
function drawTerrain(th) {
  const L0 = G.level; ctx.fillStyle = th.body[0]; let open = false, firstX = 0;
  const flush = (endX) => {
    if (!open) return; ctx.lineTo(endX, VH + 2); ctx.lineTo(firstX, VH + 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, 70, 0, VH); g.addColorStop(0, th.body[0]); g.addColorStop(1, th.body[1]); ctx.fillStyle = g; ctx.fill(); open = false;
  };
  for (let sx = 0; sx <= VW + 2; sx += 2) {
    const wx = Math.floor(camX) + sx, h = L.groundY(L0, wx);
    if (!Number.isFinite(h)) { flush(sx); continue; }
    if (!open) { ctx.beginPath(); ctx.moveTo(sx, VH + 2); ctx.lineTo(sx, h); open = true; firstX = sx; } else ctx.lineTo(sx, h);
  }
  flush(VW + 2);
  // 겉면 띠와 격자(속도감)
  for (let sx = 0; sx < VW; sx += 2) {
    const wx = Math.floor(camX) + sx, h = L.groundY(L0, wx); if (!Number.isFinite(h)) continue;
    ctx.fillStyle = th.top; ctx.fillRect(sx, h, 2, 5);
    if (Math.floor(wx / 32) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(sx, h + 5, 2, VH - h); }
  }
}
function drawRings() {
  const L0 = G.level; ctx.lineWidth = 2;
  for (let i = 0; i < L0.rings.length; i++) {
    const r = L0.rings[i]; if (G.got.has(i)) continue; const sx = r.x - camX; if (sx < -10 || sx > VW + 10) continue;
    const w = Math.abs(Math.cos(clock * 5 + r.x * 0.05)) * 5 + 1.2; ctx.strokeStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, r.y, w, 6.5, 0, 0, 6.283); ctx.stroke();
  }
  for (const s of G.scatter) { const sx = s.x - camX; ctx.strokeStyle = s.life < 60 && Math.floor(s.life / 4) % 2 ? 'rgba(255,210,58,.3)' : '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, s.y, 4, 6, 0, 0, 6.283); ctx.stroke(); }
}
function drawObjects() {
  const L0 = G.level;
  for (const k of L0.spikes) { const sx = k.x - camX; if (sx < -12 || sx > VW + 12) continue; const gy = L.groundY(L0, k.x); ctx.fillStyle = '#d8dce8'; ctx.beginPath(); ctx.moveTo(sx - 8, gy); ctx.lineTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.fill(); ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.moveTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.lineTo(sx + 2, gy); ctx.fill(); }
  for (const s of L0.springs) { const sx = s.x - camX; if (sx < -14 || sx > VW + 14) continue; const gy = L.groundY(L0, s.x); ctx.fillStyle = '#e83a3a'; ctx.fillRect(sx - 9, gy - 5, 18, 5); ctx.strokeStyle = '#d8d8e8'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(sx - 6, gy - 6 - i * 3); ctx.lineTo(sx + 6, gy - 8 - i * 3); } ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 10, gy - 19, 20, 4); }
  for (const d of L0.pads) { const sx = d.x - camX; if (sx < -20 || sx > VW + 20) continue; const gy = L.groundY(L0, d.x); ctx.fillStyle = '#ffb02a'; ctx.fillRect(sx - 14, gy - 3, 28, 3); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const o = ((clock * 40 + i * 9) % 27) - 13; ctx.beginPath(); ctx.moveTo(sx + o, gy - 2); ctx.lineTo(sx + o + 4, gy - 1.5); ctx.lineTo(sx + o, gy - 0.5); ctx.fill(); } }
  for (const c of L0.checks) { const sx = c.x - camX; if (sx < -10 || sx > VW + 10) continue; const gy = L.groundY(L0, c.x), on = G.checkX >= c.x; ctx.fillStyle = '#d0d4e0'; ctx.fillRect(sx - 1.5, gy - 38, 3, 38); ctx.fillStyle = on ? '#ff5a5a' : '#4aa8ff'; ctx.beginPath(); ctx.arc(sx, gy - 40, 5, 0, 6.283); ctx.fill(); }
  // 골 표지판
  const gx = L0.goalX - camX; if (gx > -30 && gx < VW + 30) { const gy = L.groundY(L0, L0.goalX); ctx.fillStyle = '#b0b8d0'; ctx.fillRect(gx - 2, gy - 56, 4, 56); const w = Math.abs(Math.cos(clock * 4)) * 14 + 2; ctx.fillStyle = '#ffd23a'; ctx.fillRect(gx - w / 2, gy - 72, w, 20); ctx.fillStyle = '#e83a3a'; ctx.fillRect(gx - w / 2 + 1, gy - 70, Math.max(0, w - 2), 4); }
}
function drawEnemy(e) {
  const sx = e.x - camX; if (sx < -20 || sx > VW + 20) return;
  if (e.type === 'crab') { const step = Math.floor(clock * 6 + e.id) % 2; ctx.fillStyle = '#e8503a'; ctx.beginPath(); ctx.ellipse(sx, e.y - 6, 9, 6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(sx - 9, e.y - 6, 18, 5); ctx.fillStyle = '#fff'; ctx.fillRect(sx - 5, e.y - 12, 3, 3); ctx.fillRect(sx + 2, e.y - 12, 3, 3); ctx.fillStyle = '#000'; ctx.fillRect(sx - 4, e.y - 11, 1, 2); ctx.fillRect(sx + 3, e.y - 11, 1, 2); ctx.fillStyle = '#c0301c'; ctx.fillRect(sx - 12, e.y - (step ? 12 : 9), 4, 5); ctx.fillRect(sx + 8, e.y - (step ? 9 : 12), 4, 5); ctx.fillRect(sx - 8 + (step ? 0 : 2), e.y - 1, 3, 2); ctx.fillRect(sx + 5 - (step ? 0 : 2), e.y - 1, 3, 2); }
  else { const fl = Math.floor(clock * 20 + e.id) % 2; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, e.y - 7, 8, 6, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx - 6, e.y - 9, 3, 6); ctx.fillRect(sx, e.y - 9, 3, 6); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(sx - 2, e.y - 14, 5, fl ? 4 : 2, -0.4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(sx + (e.dir > 0 ? 4 : -6), e.y - 9, 2, 2); }
}
function drawPlayer() {
  const p = G.p; if (p.inv > 0 && !p.dead && Math.floor(p.inv / 4) % 2 && G.phase === 'play') return;
  const sx = p.x - camX, spd = Math.abs(p.ground ? p.gsp : p.vx), face = p.face || 1;
  ctx.save();
  if (spd > 7.5 && !p.dead) { ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const o = ((clock * 60 + i * 13) % 40); ctx.beginPath(); ctx.moveTo(sx - face * (14 + o), p.y - 6 - i * 5); ctx.lineTo(sx - face * (26 + o), p.y - 6 - i * 5); ctx.stroke(); } }
  if (L.isSpin(p)) {                                                                   // 몸을 말면 공처럼 구른다
    ctx.translate(sx, p.y - 9); ctx.rotate(clock * 22 * face); ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.arc(0, 3, 6, 0, Math.PI); ctx.fill(); ctx.strokeStyle = '#a85010'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 11, 0.4, 2.4); ctx.stroke();
  } else {
    const ang = p.ground ? Math.atan2(L.groundY(G.level, p.x - 6) - L.groundY(G.level, p.x + 6), 12) : 0;
    ctx.translate(sx, p.y); ctx.rotate(-ang * 0.7 * face); ctx.scale(face, 1);
    const run = p.ground && Math.abs(p.gsp) > 0.4, step = Math.floor(clock * (6 + spd * 2)) % 2, lean = Math.min(5, spd * 0.6);
    ctx.fillStyle = '#e07820'; ctx.beginPath(); ctx.ellipse(-8, -14 - lean * 0.3, 6, 11, -0.5 - lean * 0.05, 0, 6.283); ctx.fill();                        // 꼬리
    ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.ellipse(-9, -18, 3, 5, -0.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.ellipse(lean * 0.5, -13, 7, 9, 0.1 * lean / 5, 0, 6.283); ctx.fill();                                        // 몸
    ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.ellipse(lean * 0.5 + 2, -10, 4, 6, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.arc(2 + lean, -22, 7, 0, 6.283); ctx.fill();                                                            // 머리
    ctx.beginPath(); ctx.moveTo(-1 + lean, -27); ctx.lineTo(0 + lean, -33); ctx.lineTo(4 + lean, -28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(5 + lean, -22, 3.5, 3.5, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(5.5 + lean, -23, 2, 3);
    ctx.fillStyle = '#d06818'; ctx.fillRect(1 + lean + 4, -19, 4, 2);
    ctx.fillStyle = '#6a3a12';
    if (!p.ground) { ctx.fillRect(1, -4, 5, 4); ctx.fillRect(-6, -2, 5, 4); }
    else if (run && spd > 3) { ctx.beginPath(); ctx.ellipse(0, -2, 8, 3, 0, 0, 6.283); ctx.fill(); }                                           // 다리가 빨라 둥글게 번져 보인다
    else if (run) { ctx.fillRect(step ? 2 : -3, -4, 5, 4); ctx.fillRect(step ? -5 : 2, -4, 5, 4); }
    else { ctx.fillRect(-4, -4, 5, 4); ctx.fillRect(1, -4, 5, 4); }
  }
  ctx.restore();
}
function drawHud() {
  ctx.font = '900 11px -apple-system, sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
  const t = (s, x, y, c = '#fff', a = 'left') => { ctx.textAlign = a; ctx.fillStyle = c; ctx.strokeText(s, x, y); ctx.fillText(s, x, y); };
  t(`SCORE ${G.score}`, 8, 6); t(`TIME ${Math.floor(G.t / 3600)}:${String(Math.floor(G.t / 60) % 60).padStart(2, '0')}`, 8, 20);
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(14, 41, 4, 5.5, 0, 0, 6.283); ctx.stroke(); t(`× ${G.rings}`, 22, 35, G.rings === 0 ? '#ff7a7a' : '#ffd23a');
  t(`🐿 × ${Math.max(0, G.lives)}`, 8, 50); if (TUT) t('연습', VW / 2, 6, '#ffe27a', 'center');
  const sp = Math.abs(G.p.ground ? G.p.gsp : G.p.vx); t(`${Math.round(sp * 60)} px/s`, VW - 8, VH - 14, sp > 7 ? '#ffe27a' : '#fff', 'right');
}
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (!G) { ctx.fillStyle = '#0a1420'; ctx.fillRect(0, 0, VW, VH); return; }
  const th = THEMES[G.level.theme], sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0; if (shake > 0) shake *= 0.85; if (shake < 0.3) shake = 0;
  ctx.save(); ctx.translate(sx, sy);
  drawBackground(th); drawTerrain(th); drawObjects(); drawRings();
  for (const e of G.enemies) if (e.alive || false) drawEnemy(e);
  if (G.phase !== 'dying' || G.p.y < VH + 60) drawPlayer();
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t++; f.x += f.vx; f.y += f.vy; f.vy += 0.12; if (f.t > f.life) { fx.splice(i, 1); continue; } ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x - camX, f.y, 2.4, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.font = '900 11px -apple-system, sans-serif';
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t++; if (f.t > 50) { floats.splice(i, 1); continue; } ctx.globalAlpha = f.t > 36 ? (50 - f.t) / 14 : 1; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#ffe27a'; const y = f.y - f.t * 0.6; ctx.strokeText(f.text, f.x - camX, y); ctx.fillText(f.text, f.x - camX, y); }
  ctx.globalAlpha = 1; ctx.restore();
  drawHud();
  if (banner && banner.t < 110) { banner.t++; const a = banner.t < 15 ? banner.t / 15 : banner.t > 90 ? (110 - banner.t) / 20 : 1; ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 70, VW, 44); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe27a'; ctx.font = '900 18px -apple-system, sans-serif'; ctx.fillText(banner.text, VW / 2, 86); ctx.fillStyle = '#fff'; ctx.font = '700 10px -apple-system, sans-serif'; ctx.fillText(banner.sub, VW / 2, 103); ctx.globalAlpha = 1; }
}

// ---------- 반복 ----------
let last = performance.now(), acc = 0;
function tick() {
  const ev = L.step(G, readInput()) || G.events; handle(G.events);
  const p = G.p, target = Math.max(0, Math.min(G.level.len - VW, p.x - 110 + Math.max(-30, Math.min(70, (p.ground ? p.gsp : p.vx) * 9))));
  camX += (target - camX) * (G.phase === 'dying' ? 0 : 0.14); if (Math.abs(target - camX) > 160) camX = target;
  if (G.phase === 'clear') { endT++; if (endT > 150 && screen === 'play') showClear(); }
  if (G.phase === 'over' && screen === 'play') showOver();
}
function frame(now) {
  const dt = Math.min(100, now - last); last = now; clock += dt / 1000;
  if (screen === 'play' && G && !paused && !document.hidden) { acc += dt; while (acc >= 1000 / 60) { acc -= 1000 / 60; if (screen === 'play') tick(); } } else acc = 0;
  render(); requestAnimationFrame(frame);
}
showTitle(); resize(); requestAnimationFrame(frame); setTimeout(resize, 60);

/* @test-hooks:start */
window.__sp = { get G() { return G; }, get screen() { return screen; }, get unlocked() { return unlocked; }, get best() { return best; }, get pad() { return pad; }, get camX() { return camX; }, L, tick, render, startZone, setG(g) { G = g; }, get paused() { return paused; }, setPaused, pressJump: () => { jumpEdge = true; } };
/* @test-hooks:end */
