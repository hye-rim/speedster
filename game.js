'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 번개 다람쥐: 화면·입력·소리. 규칙은 logic.js (LOGIC_SP). 여기서는 규칙이 알려 주는 일(events)을 보고 소리·효과를 만든다.
const L = LOGIC_SP, $ = (id) => document.getElementById(id);
const TUT = /[?&]tutorial=1(&|$)/.test(location.search);
let VW = L.VW, VH = L.VH;                                   // 보이는 가로 범위는 화면 비율에 맞춰 바뀐다(resize)
const cv = $('c'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계속 */ } },
};
const LAST = L.ZONES.length - 1;
let unlocked = Math.max(0, Math.min(LAST, store.get('spZone', 0) | 0)), best = store.get('spBest', 0) | 0, soundOn = store.get('spSound', true);
let G = null, screen = 'title', paused = false, selZone = unlocked, runScore = 0, endT = 0;
let camX = 0, camY = 0, clock = 0, fx = [], floats = [], shake = 0, banner = null, trail = [], squash = 0, runT = 0;
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
  oneup() { [660, 880, 1100, 1320].forEach((f, k) => tone(f, 0.12, 'triangle', 0.05, 0, k * 0.08)); },
  monitor() { tone(200, 0.12, 'square', 0.06, 200); tone(800, 0.2, 'triangle', 0.05, 400, 0.08); },
  shield() { tone(900, 0.3, 'sine', 0.05, -500); },
  rev(c) { tone(240 + c * 40, 0.1, 'sawtooth', 0.04, 160); },
  dash() { tone(300, 0.35, 'sawtooth', 0.06, 900); },
  loop() { tone(500, 0.5, 'triangle', 0.04, 600); },
  clear() { [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.2, 'triangle', 0.06, 0, k * 0.1)); },
  over() { [392, 330, 262, 196].forEach((f, k) => tone(f, 0.3, 'triangle', 0.05, 0, k * 0.16)); },
};

// ---------- 크기 ----------
let cssW = VW, K = 1;
function resize() {
  const land = matchMedia('(pointer:coarse) and (orientation:landscape)').matches;
  const ctl = $('controls'), controlsH = (!land && getComputedStyle(ctl).display !== 'none') ? ctl.offsetHeight + 8 : 0;
  const sideW = 0;                                                                    // 가로 화면에서도 조작판은 게임 화면 위에 겹치므로 옆자리를 안 뺀다
  const availW = innerWidth - 16 - sideW, availH = innerHeight - 20 - controlsH;
  VW = L.viewWidth(availW, availH); VH = L.viewHeight(availW, availH, VW);                                                  // 세로 폰 320 · 가로 폰은 더 넓게(최대 480)
  const s = Math.max(0.5, Math.min(availW / VW, availH / VH));
  cssW = VW * s; cv.style.width = VW * s + 'px'; cv.style.height = VH * s + 'px';
  if (G) { camX = Math.max(0, Math.min(G.level.len - VW, camX)); camY = L.camTargetY(G.p.y, VH); }
  K = Math.max(1, Math.ceil(s * Math.min(2, window.devicePixelRatio || 1)));
  cv.width = VW * K; cv.height = VH * K;
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------- 입력 ----------
const keys = new Set(), pad = { left: false, right: false, down: false, jumpBtn: false };
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
function releaseAll() { keys.clear(); pad.left = pad.right = pad.down = pad.jumpBtn = false; jumpEdge = false; stick.on = false; padPtr = null; stickDraw(); $('jumpBtn').classList.remove('on'); }
// 점프 버튼
const jb = $('jumpBtn');
jb.addEventListener('pointerdown', (e) => { e.preventDefault(); try { jb.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } pad.jumpBtn = true; jumpEdge = true; jb.classList.add('on'); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) jb.addEventListener(t, () => { pad.jumpBtn = false; jb.classList.remove('on'); });
// 떠 있는 조이스틱: 왼쪽 칸 어디든 대면 그 자리가 중심. 좌우로 밀면 달리고, 아래로 밀면 구른다 (점프는 오른쪽 큰 버튼)
const stickEl = $('stick'), STICK = { dead: 9, reach: 24, down: 16 }, stick = { ax: 0, ay: 0, x: 0, y: 0, on: false };
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
  stickDraw();
}
stickEl.addEventListener('pointerdown', (e) => { e.preventDefault(); padPtr = e.pointerId; try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } const r = stickEl.getBoundingClientRect(); stick.on = true; stick.ax = Math.max(28, Math.min(r.width - 28, e.clientX - r.left)); stick.ay = Math.max(28, Math.min(r.height - 28, e.clientY - r.top)); stickMove(e); });
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === padPtr) stickMove(e); });
const stickUp = (e) => { if (e.pointerId === padPtr) { padPtr = null; pad.left = pad.right = pad.down = false; stick.on = false; stickDraw(); } };
stickEl.addEventListener('pointerup', stickUp); stickEl.addEventListener('pointercancel', stickUp); stickEl.addEventListener('lostpointercapture', stickUp);
const readInput = () => {
  const inp = { left: heldAny(KEY.left) || pad.left, right: heldAny(KEY.right) || pad.right, down: heldAny(KEY.down) || pad.down, jump: jumpEdge, jumpHeld: heldAny(KEY.jump) || pad.jumpBtn };
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
  camX = 0; camY = -L.camShift(VH); squash = 0; runT = 0; fx = []; floats = []; shake = 0; trail = []; endT = 0; paused = false; screen = 'play'; releaseAll(); hideOverlay();
  banner = { text: TUT ? '연습' : `${zone + 1}코스 ${G.level.name}`, sub: TUT ? '달리고 · 뛰고 · 링을 모아 보세요' : (SIG_HINT[G.level.sig] || '골까지 달려요!'), t: 0 };
}
const SIG_HINT = { valley: '깊은 계곡! 구르면 엄청 빨라져요', tramp: '스프링 줄! 연달아 튀어 올라요', iceslide: '미끄러운 얼음! 브레이크가 잘 안 들어요', lavaflame: '용암 불꽃! 솟는 때를 봐서 건너요', belt: '컨베이어! 땅이 밀어 줘요', tunnel: '가속 판 터널! 점점 빨라져요', longgap: '긴 틈! 가속 판으로 속도를 붙여 날아요' };
function saveBest() { if (!TUT && G && G.score > best) { best = G.score; store.set('spBest', best); } }
function showClear() {
  saveBest(); const last = G.zone >= LAST;
  if (!TUT && G.zone + 1 > unlocked && G.zone < LAST) { unlocked = G.zone + 1; store.set('spZone', unlocked); }
  runScore = G.score; screen = 'clear';
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
const MON_LABEL = { ring10: '링 +10', shield: '보호막', invincible: '무적!', shoes: '빠른 신발!', life: '1UP!' };
function dust(x, y, n, sp = 1.4) { for (let i = 0; i < n; i++) fx.push({ x: x + (Math.random() - 0.5) * 8, y: y - 1, vx: (Math.random() - 0.5) * sp * 2, vy: -Math.random() * 0.6, t: 0, life: 14 + Math.random() * 10, color: '#e8dcc0' }); }
function burst(x, y, color, n, sp = 2) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.4 + Math.random()) * sp; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, t: 0, life: 22 + Math.random() * 14, color }); } }
function handle(events) {
  for (const e of events) {
    if (e.t === 'ring') { sfx.ring(); burst(G.p.x, G.p.y - 16, '#ffe27a', 3, 1.2); tutorialSignal('ring'); }
    else if (e.t === 'jump') { sfx.jump(); dust(G.p.x, G.p.y, 4, 1.2); tutorialSignal('jump'); }
    else if (e.t === 'roll') { sfx.roll(); tutorialSignal('roll'); }
    else if (e.t === 'move') tutorialSignal('move');
    else if (e.t === 'oneup') { sfx.oneup(); floats.push({ x: G.p.x, y: G.p.y - 36, t: 0, text: '1UP!' }); tutorialSignal('oneup'); }
    else if (e.t === 'monitor') { sfx.monitor(); burst(e.x, e.y - 12, '#9ad8ff', 14, 2.6); floats.push({ x: e.x, y: e.y - 30, t: 0, text: MON_LABEL[e.type] }); tutorialSignal('monitor'); }
    else if (e.t === 'shieldbreak') { sfx.shield(); burst(G.p.x, G.p.y - 12, '#8ad0ff', 12, 2.4); }
    else if (e.t === 'rev') { sfx.rev(e.charge); tutorialSignal('rev'); }
    else if (e.t === 'spindash') { sfx.dash(); burst(G.p.x - 6 * G.p.face, G.p.y - 2, '#e8e0c0', 10, 2); tutorialSignal('spindash'); }
    else if (e.t === 'loop') { sfx.loop(); tutorialSignal('loop'); }
    else if (e.t === 'powerend') floats.push({ x: G.p.x, y: G.p.y - 36, t: 0, text: '무적 끝' });
    else if (e.t === 'kill') { sfx.kill(); burst(e.x, e.y - 8, '#ffd23a', 10, 2.4); floats.push({ x: e.x, y: e.y - 20, t: 0, text: '+' + e.pts }); tutorialSignal('kill'); }
    else if (e.t === 'hurt') { sfx.hurt(); shake = 8; tutorialSignal('hurt'); }
    else if (e.t === 'dead') { sfx.dead(); shake = 6; }
    else if (e.t === 'spring') { sfx.spring(); tutorialSignal('spring'); }
    else if (e.t === 'boost') { sfx.boost(); tutorialSignal('boost'); }
    else if (e.t === 'check') { sfx.check(); floats.push({ x: e.x, y: 80, t: 0, text: '체크포인트' }); }
    else if (e.t === 'respawn') { camX = Math.max(0, G.p.x - VW * 0.34); camY = -L.camShift(VH); trail = []; }
    else if (e.t === 'clear') { tutorialSignal('clear'); burst(G.p.x, G.p.y - 12, '#ffe27a', 24, 3); }
  }
}

// ---------- 그리기 ----------
// 테마 8종. sky/far/near 는 코스의 앞·가운데·끝 세 시간대 색(코스를 달리는 동안 서서히 바뀐다), top/body 는 땅 색
const THEMES = {
  grass: { sky: [['#4aa8ff', '#bfe6ff'], ['#5aa0f0', '#ffe2b4'], ['#6a5aa8', '#ff9a70']], far: ['#7fcf7a', '#6fb078', '#5c7a78'], near: ['#4aa04a', '#3e8a4e', '#345a52'], top: '#58c040', body: ['#a2672f', '#8a5424'] },
  desert: { sky: [['#f6a850', '#fde7b0'], ['#f08a48', '#ffd098'], ['#6a4a8a', '#ff9a58']], far: ['#e8b868', '#d8985a', '#8a5a6a'], near: ['#d49a48', '#c07a40', '#6a4258'], top: '#f4d68a', body: ['#c98a3e', '#b07630'] },
  jungle: { sky: [['#3ac0a0', '#c8f4d0'], ['#2aa088', '#9ae0b8'], ['#1a4a58', '#4a9a88']], far: ['#3a9a6a', '#2e8058', '#1e5a48'], near: ['#2a7a4a', '#1e6040', '#12402e'], top: '#6ad048', body: ['#6a4a2a', '#52381e'] },
  ice: { sky: [['#8fc4f0', '#eaf6ff'], ['#7aa8e8', '#d8ecff'], ['#1a2a5a', '#5a9ac8']], far: ['#c8e4f8', '#b0d0f0', '#6a8ac0'], near: ['#9cc8ea', '#84b0e0', '#4a6aa0'], top: '#f4fbff', body: ['#79b4dc', '#62a0cc'] },
  lava: { sky: [['#5a1a1a', '#c8502a'], ['#3a1018', '#d8602a'], ['#200a14', '#f07a2a']], far: ['#4a2020', '#3a1818', '#2a1018'], near: ['#38181a', '#2a1214', '#1c0c10'], top: '#8a5a4a', body: ['#4a2e2a', '#382220'] },
  factory: { sky: [['#2a3350', '#6a5a7a'], ['#3a3a5a', '#8a6a6a'], ['#1a1a30', '#5a4a6a']], far: ['#3a3f5a', '#34384e', '#262a3e'], near: ['#2c3048', '#262a3c', '#1c1e30'], top: '#8a96b8', body: ['#4a5270', '#3c4360'] },
  neon: { sky: [['#12082a', '#4a1a6a'], ['#0a1030', '#2a2a7a'], ['#06081c', '#1a2a5a']], far: ['#241a4a', '#1a1a46', '#121238'], near: ['#1a1238', '#141236', '#0c0c28'], top: '#5af0e8', body: ['#2a2458', '#201c48'] },
  sky: { sky: [['#5ab8ff', '#e8f6ff'], ['#7ac0ff', '#ffeede'], ['#9a8ae8', '#ffc8b0']], far: ['#cfe8ff', '#e8dcf8', '#d8b8e0'], near: ['#e8f4ff', '#f8e8f0', '#f0d0dc'], top: '#b8e890', body: ['#c8dcf0', '#a8c4e4'] },
};
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`; };
// 세 시간대 색을 진행도(0~1)로 섞는다
const phased = (arr, prog, fn) => { const k = prog * 2, i = Math.min(1, Math.floor(k)), t = k - i; return fn(arr[i], arr[i + 1], t); };
function progress() { return Math.max(0, Math.min(1, G.p.x / G.level.goalX)); }
function drawBackground(th) {
  const prog = progress(), name = G.level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, phased(th.sky, prog, (a, b, t) => mix(a[0], b[0], t))); g.addColorStop(1, phased(th.sky, prog, (a, b, t) => mix(a[1], b[1], t))); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  const night = name === 'neon' || (prog > 0.75 && (name === 'grass' || name === 'desert' || name === 'ice' || name === 'jungle'));
  if (night || name === 'lava') { ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = (hash(i) * VW * 1.3 - camX * 0.02) % VW, y = hash(i + 50) * 100; ctx.globalAlpha = (name === 'neon' ? 0.8 : Math.min(0.8, (prog - 0.75) * 3)) * (0.5 + 0.5 * Math.sin(clock * 3 + i)); ctx.fillRect((x + VW) % VW, y, 1.5, 1.5); } ctx.globalAlpha = 1; }
  // 해·달·큰 장식 (하늘에 고정, 아주 천천히 움직인다)
  const sun = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };
  if (name === 'grass') sun(250 - camX * 0.01, 38 + prog * 50, 16, prog > 0.6 ? '#ffd0a0' : '#fff3b0');
  else if (name === 'desert') { sun(230 - camX * 0.01, 46 + prog * 40, 24, prog > 0.6 ? '#ff8a58' : '#fff0c0'); }
  else if (name === 'sky') sun(60 - camX * 0.01, 40, 18, '#fff8c8');
  else if (name === 'neon') { sun(240, 40, 14, '#f4eeff'); sun(246, 36, 12, '#2a1a5a'); }
  else if (name === 'lava') { ctx.fillStyle = 'rgba(255,120,40,.25)'; ctx.fillRect(0, 100, VW, 100); }
  // 멀리 있는 장식(시차 0.2) → 가까운 장식(0.45)
  ctx.save(); ctx.translate(0, -camY * 0.3);                                         // 산·건물 같은 배경 층은 세로로도 조금 움직인다 (시차)
  const far = phased(th.far, prog, mix), near = phased(th.near, prog, mix);
  const layer = (color, par, base, amp, wl, shape) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, VH + 600);
    for (let sx = 0; sx <= VW; sx += 6) { const wx = sx + camX * par; ctx.lineTo(sx, base - (shape === 'peak' ? Math.abs(((wx / wl) % 2 + 2) % 2 - 1) * amp : shape === 'mesa' ? (Math.sin(wx / wl * Math.PI) > 0.2 ? amp : amp * 0.15) : Math.abs(Math.sin(wx / wl * Math.PI)) * amp)); }
    ctx.lineTo(VW, VH + 600); ctx.fill();
  };
  const shapeOf = { grass: ['hill', 'hill'], desert: ['mesa', 'hill'], jungle: ['hill', 'hill'], ice: ['peak', 'peak'], lava: ['peak', 'hill'], factory: ['mesa', 'mesa'], neon: ['mesa', 'mesa'], sky: ['hill', 'hill'] }[name];
  layer(far, 0.2, 128, name === 'ice' || name === 'lava' ? 70 : 42, name === 'desert' ? 120 : 200, shapeOf[0]);
  if (name === 'lava') { const vx = 130 - camX * 0.12; ctx.fillStyle = '#2a1214'; ctx.beginPath(); ctx.moveTo(vx - 70, 140); ctx.lineTo(vx - 16, 60); ctx.lineTo(vx + 16, 60); ctx.lineTo(vx + 70, 140); ctx.fill(); ctx.fillStyle = 'rgba(255,110,30,.8)'; ctx.fillRect(vx - 14, 58, 28, 4); const gl = ctx.createRadialGradient(vx, 50, 4, vx, 50, 50); gl.addColorStop(0, 'rgba(255,150,60,.5)'); gl.addColorStop(1, 'rgba(255,100,20,0)'); ctx.fillStyle = gl; ctx.fillRect(vx - 60, 0, 120, 110); }
  decorate(name, prog, 0.2);
  layer(near, 0.45, 150, 26, 120, shapeOf[1]);
  decorate(name, prog, 0.45);
  if (name === 'lava') { const lg = ctx.createLinearGradient(0, VH - 34, 0, VH); lg.addColorStop(0, 'rgba(255,120,30,0)'); lg.addColorStop(0.6, '#ff6a1a'); lg.addColorStop(1, '#ffc040'); ctx.fillStyle = lg; ctx.fillRect(0, VH - 34, VW, 34); ctx.fillStyle = 'rgba(255,230,120,.7)'; for (let i = 0; i < 18; i++) ctx.fillRect(((i * 23 - clock * 20) % VW + VW) % VW, VH - 10 + (i % 3) * 3, 6, 2); }
  if (name === 'sky') { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 9; i++) { const x = ((i * 47 - camX * 0.7) % (VW + 90) + VW + 90) % (VW + 90) - 45; ctx.beginPath(); ctx.ellipse(x, VH - 6 + (i % 3) * 4, 34, 11, 0, 0, 6.283); ctx.ellipse(x + 20, VH - 10 + (i % 2) * 3, 24, 9, 0, 0, 6.283); ctx.fill(); } }
  ctx.restore();
}
// 테마별 장식: par 가 0.2 이면 먼 층, 0.45 이면 가까운 층에 그린다 (카메라에 따라 시차로 움직인다)
function decorate(name, prog, par) {
  const near = par > 0.3, off = camX * par, gy = near ? 150 : 128;
  const each = (spacing, fn) => { const i0 = Math.floor(off / spacing) - 1; for (let i = i0; i < i0 + VW / spacing + 3; i++) fn(i, i * spacing - off, hash(i * 3 + (near ? 7 : 1))); };
  if (name === 'grass') {
    if (!near) each(150, (i, x, h) => { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(x + 30, 28 + h * 40, 17, 7, 0, 0, 6.283); ctx.ellipse(x + 42, 31 + h * 40, 12, 6, 0, 0, 6.283); ctx.fill(); });
    else each(90, (i, x, h) => { if (h < 0.5) return; ctx.fillStyle = '#3a8a3a'; ctx.beginPath(); ctx.arc(x, gy - 6, 9 + h * 5, 0, 6.283); ctx.fill(); ctx.fillStyle = '#f08a8a'; ctx.fillRect(x - 3, gy - 12 - h * 4, 3, 3); ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 4, gy - 10, 3, 3); });
  } else if (name === 'desert') {
    if (near) each(110, (i, x, h) => { if (h < 0.4) return; ctx.fillStyle = '#3a7a3a'; ctx.fillRect(x, gy - 16 - h * 10, 5, 16 + h * 10); ctx.fillRect(x - 6, gy - 12 - h * 6, 4, 3); ctx.fillRect(x - 6, gy - 16 - h * 6, 3, 6); ctx.fillRect(x + 7, gy - 8 - h * 6, 4, 3); ctx.fillRect(x + 8, gy - 14 - h * 6, 3, 8); });
  } else if (name === 'jungle') {
    each(near ? 70 : 100, (i, x, h) => { const tw = near ? 8 : 6; ctx.fillStyle = near ? '#3a2a18' : '#2a3a2a'; ctx.fillRect(x, 20, tw, VH); ctx.fillStyle = near ? 'rgba(40,150,70,.85)' : 'rgba(30,110,60,.8)'; ctx.beginPath(); ctx.ellipse(x + tw / 2, 24 + h * 14, 26 + h * 8, 13, 0, 0, 6.283); ctx.fill(); if (h > 0.4) { ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 14, 30); ctx.quadraticCurveTo(x + 18, 60 + h * 30, x + 12, 70 + h * 30); ctx.stroke(); } });
    if (prog > 0.6) { ctx.fillStyle = '#ffe870'; for (let i = 0; i < 14; i++) { const x = ((hash(i) * 300 + Math.sin(clock + i) * 8 - camX * 0.3) % VW + VW) % VW, y = 60 + hash(i + 9) * 90 + Math.cos(clock * 1.3 + i) * 6; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 4 + i); ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1; }
  } else if (name === 'ice') {
    each(near ? 80 : 140, (i, x, h) => { ctx.fillStyle = near ? '#2a6a6a' : '#3a7a88'; const w = 16 + h * 10, ht = (near ? 34 : 50) + h * 20; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w / 2, gy - ht); ctx.lineTo(x + w, gy); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + w / 2, gy - ht); ctx.lineTo(x + w / 2 - 5, gy - ht + 12); ctx.lineTo(x + w / 2 + 5, gy - ht + 12); ctx.fill(); });
    if (!near && prog > 0.7) { for (let k = 0; k < 3; k++) { ctx.fillStyle = ['rgba(80,255,180,.10)', 'rgba(120,160,255,.10)', 'rgba(200,120,255,.08)'][k]; ctx.beginPath(); ctx.moveTo(0, 30 + k * 8); for (let sx = 0; sx <= VW; sx += 10) ctx.lineTo(sx, 30 + k * 8 + Math.sin(sx / 40 + clock * 0.6 + k) * 8); ctx.lineTo(VW, 90); ctx.lineTo(0, 90); ctx.fill(); } }
  } else if (name === 'lava') {
    if (near) each(120, (i, x, h) => { ctx.fillStyle = '#1c0c10'; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + 8 + h * 6, gy - 22 - h * 18); ctx.lineTo(x + 20, gy); ctx.fill(); });
    ctx.fillStyle = '#ffa040'; for (let i = 0; i < 16; i++) { const x = ((hash(i) * 400 - camX * 0.4 + Math.sin(clock + i) * 6) % VW + VW) % VW, y = VH - ((clock * (14 + hash(i + 3) * 18) + hash(i + 7) * VH) % VH); ctx.globalAlpha = 0.8; ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
  } else if (name === 'factory') {
    each(near ? 110 : 170, (i, x, h) => { ctx.fillStyle = near ? '#2a2e44' : '#33384e'; ctx.fillRect(x, gy - 40 - h * 40, 14, 40 + h * 40); ctx.fillRect(x - 2, gy - 44 - h * 40, 18, 4); ctx.fillStyle = 'rgba(180,180,200,.18)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + 7 + Math.sin(clock + k + i) * 4, gy - 50 - h * 40 - ((clock * 16 + k * 14) % 42), 5 + k * 2, 0, 6.283); ctx.fill(); } if (near && h > 0.5) { ctx.strokeStyle = '#4a5270'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 50, gy - 20, 13, clock * 1.5, clock * 1.5 + 5); ctx.stroke(); } });
  } else if (name === 'neon') {
    each(near ? 64 : 90, (i, x, h) => { const w = near ? 40 : 52, ht = (near ? 60 : 90) + h * 50; ctx.fillStyle = near ? '#120c2a' : '#1a1440'; ctx.fillRect(x, gy - ht, w, ht + 30); for (let wy = gy - ht + 6; wy < gy - 4; wy += 9) for (let wx = x + 4; wx < x + w - 6; wx += 9) if (hash(i * 31 + wy * 3 + wx) > 0.55) { ctx.fillStyle = hash(wx + wy) > 0.5 ? '#ffe070' : '#70f0ff'; ctx.fillRect(wx, wy, 4, 5); }
      if (h > 0.6) { const c = ['#ff4aa8', '#4affd8', '#ffd24a'][i & 1 ? 0 : 2]; ctx.fillStyle = c; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(clock * 5 + i); ctx.fillRect(x + 6, gy - ht - 8, w - 12, 5); ctx.globalAlpha = 1; } });
  } else if (name === 'sky') {
    if (!near) each(190, (i, x, h) => { const y = 70 + h * 50; ctx.fillStyle = '#9ad06a'; ctx.beginPath(); ctx.ellipse(x + 40, y, 36, 8, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#c8ecff'; ctx.fillRect(x + 6, y - 4, 68, 5); ctx.fillStyle = '#6ab04a'; ctx.fillRect(x + 20, y - 10, 10, 6); });
    else for (let i = 0; i < 5; i++) { const x = ((i * 83 + clock * 12 - camX * 0.3) % (VW + 40) + VW + 40) % (VW + 40) - 20, y = 40 + hash(i) * 50; ctx.strokeStyle = 'rgba(60,60,90,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 2 + Math.sin(clock * 8 + i) * 2); ctx.lineTo(x + 6, y); ctx.stroke(); }
  }
}
function drawTerrain(th) {
  const L0 = G.level; ctx.fillStyle = th.body[0]; let open = false, firstX = 0;
  const flush = (endX) => {
    if (!open) return; ctx.lineTo(endX, VH + 700); ctx.lineTo(firstX, VH + 700); ctx.closePath();
    const g = ctx.createLinearGradient(0, 70, 0, VH + 300); g.addColorStop(0, th.body[0]); g.addColorStop(1, th.body[1]); ctx.fillStyle = g; ctx.fill(); open = false;
  };
  for (let sx = 0; sx <= VW + 2; sx += 2) {
    const wx = Math.floor(camX) + sx, h = L.groundY(L0, wx);
    if (!Number.isFinite(h)) { flush(sx); continue; }
    if (!open) { ctx.beginPath(); ctx.moveTo(sx, VH + 700); ctx.lineTo(sx, h); open = true; firstX = sx; } else ctx.lineTo(sx, h);
  }
  flush(VW + 2);
  // 겉면 띠와 격자(속도감)
  for (let sx = 0; sx < VW; sx += 2) {
    const wx = Math.floor(camX) + sx, h = L.groundY(L0, wx); if (!Number.isFinite(h)) continue;
    const ice = L0.ice.some((r) => wx >= r.x0 && wx <= r.x1);
    ctx.fillStyle = ice ? '#cfeeff' : th.top; ctx.fillRect(sx, h, 2, ice ? 6 : 5); if (ice && (Math.floor(wx / 14) + Math.floor(clock * 3)) % 5 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(sx, h + 1, 2, 2); }
    if (Math.floor(wx / 32) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(sx, h + 5, 2, VH + 700 - h); }
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
  for (const b of L0.belts) {                                                       // 컨베이어: 움직이는 화살표 띠
    if (b.x1 - camX < 0 || b.x0 - camX > VW) continue;
    for (let wx = Math.max(Math.floor(camX), b.x0); wx < Math.min(camX + VW, b.x1); wx += 2) { const gy = L.groundY(L0, wx); if (!Number.isFinite(gy)) continue; ctx.fillStyle = '#d8a020'; ctx.fillRect(wx - camX, gy, 2, 5); }
    for (let wx = b.x0 + (((clock * 40 * b.dir) % 24) + 24) % 24; wx < b.x1; wx += 24) { const sx = wx - camX; if (sx < 0 || sx > VW) continue; const gy = L.groundY(L0, wx); if (!Number.isFinite(gy)) continue; ctx.fillStyle = '#3a2a08'; ctx.beginPath(); ctx.moveTo(sx, gy + 1); ctx.lineTo(sx + 5 * b.dir, gy + 2.5); ctx.lineTo(sx, gy + 4); ctx.fill(); }
    for (const e of [b.x0, b.x1]) { const gy = L.groundY(L0, e); if (Number.isFinite(gy)) { ctx.fillStyle = '#8a8aa0'; ctx.beginPath(); ctx.arc(e - camX, gy + 2.5, 4, 0, 6.283); ctx.fill(); } }
  }
  for (const lp of L0.loops) {                                                       // 루프: 큰 원 길(뒤에서 비치는 띠)
    const sx = lp.x - camX + L.LOOP_W / 2; if (sx < -60 || sx > VW + 60) continue;
    ctx.save(); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(sx, lp.y - L.LOOP_R - 2, L.LOOP_R + 3, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = THEMES[G.level.theme].top; ctx.beginPath(); ctx.arc(sx, lp.y - L.LOOP_R - 2, L.LOOP_R + 3, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(sx, lp.y - L.LOOP_R - 2, L.LOOP_R + 5.5, 0.3, 2.6); ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < L0.monitors.length; i++) {                                     // 아이템 상자
    const m = L0.monitors[i]; if (G.mon.has(i)) continue; const sx = m.x - camX; if (sx < -14 || sx > VW + 14) continue; const gy = L.groundY(L0, m.x);
    ctx.fillStyle = '#2a2f48'; ctx.fillRect(sx - 9, gy - 22, 18, 22); ctx.fillStyle = '#9aa4c8'; ctx.fillRect(sx - 9, gy - 22, 18, 2); ctx.fillStyle = '#0a1020'; ctx.fillRect(sx - 7, gy - 20, 14, 14);
    const icon = { ring10: ['#ffd23a', '◯'], shield: ['#5ac0ff', '◍'], invincible: ['#ffffff', '★'], shoes: ['#ff6a4a', '»'], life: ['#ff8aa8', '♥'] }[m.type]; ctx.fillStyle = icon[0]; ctx.font = '900 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon[1], sx, gy - 13);
  }
  for (const k of L0.spikes) { const sx = k.x - camX; if (sx < -12 || sx > VW + 12) continue; const gy = L.groundY(L0, k.x); ctx.fillStyle = '#d8dce8'; ctx.beginPath(); ctx.moveTo(sx - 8, gy); ctx.lineTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.fill(); ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.moveTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.lineTo(sx + 2, gy); ctx.fill(); }
  for (const s of L0.springs) { const sx = s.x - camX; if (sx < -14 || sx > VW + 14) continue; const gy = L.groundY(L0, s.x); ctx.fillStyle = '#e83a3a'; ctx.fillRect(sx - 9, gy - 5, 18, 5); ctx.strokeStyle = '#d8d8e8'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(sx - 6, gy - 6 - i * 3); ctx.lineTo(sx + 6, gy - 8 - i * 3); } ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 10, gy - 19, 20, 4); }
  for (const d of L0.pads) { const sx = d.x - camX; if (sx < -20 || sx > VW + 20) continue; const gy = L.groundY(L0, d.x); ctx.fillStyle = '#ffb02a'; ctx.fillRect(sx - 14, gy - 3, 28, 3); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const o = ((clock * 40 + i * 9) % 27) - 13; ctx.beginPath(); ctx.moveTo(sx + o, gy - 2); ctx.lineTo(sx + o + 4, gy - 1.5); ctx.lineTo(sx + o, gy - 0.5); ctx.fill(); } }
  for (const c of L0.checks) { const sx = c.x - camX; if (sx < -10 || sx > VW + 10) continue; const gy = L.groundY(L0, c.x), on = G.checkX >= c.x; ctx.fillStyle = '#d0d4e0'; ctx.fillRect(sx - 1.5, gy - 38, 3, 38); ctx.fillStyle = on ? '#ff5a5a' : '#4aa8ff'; ctx.beginPath(); ctx.arc(sx, gy - 40, 5, 0, 6.283); ctx.fill(); }
  // 골 표지판
  const gx = L0.goalX - camX; if (gx > -30 && gx < VW + 30) { const gy = L.groundY(L0, L0.goalX); ctx.fillStyle = '#b0b8d0'; ctx.fillRect(gx - 2, gy - 56, 4, 56); const w = Math.abs(Math.cos(clock * 4)) * 14 + 2; ctx.fillStyle = '#ffd23a'; ctx.fillRect(gx - w / 2, gy - 72, w, 20); ctx.fillStyle = '#e83a3a'; ctx.fillRect(gx - w / 2 + 1, gy - 70, Math.max(0, w - 2), 4); }
}
function drawEnemy(e) {
  const sx = e.x - camX; if (sx < -20 || sx > VW + 20) return;
  if (e.type === 'flame') {                                                          // 용암에서 솟는 불꽃
    const wob = Math.sin(clock * 20 + e.id) * 1.5, y = e.y; ctx.fillStyle = '#ff5a10'; ctx.beginPath(); ctx.moveTo(sx - 7, y); ctx.quadraticCurveTo(sx - 8 + wob, y - 14, sx + wob, y - 26); ctx.quadraticCurveTo(sx + 8 + wob, y - 14, sx + 7, y); ctx.fill();
    ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.moveTo(sx - 4, y); ctx.quadraticCurveTo(sx - 4, y - 9, sx + wob, y - 17); ctx.quadraticCurveTo(sx + 4, y - 9, sx + 4, y); ctx.fill(); ctx.fillStyle = '#fff0a0'; ctx.fillRect(sx - 1.5, y - 6, 3, 5); return;
  }
  if (e.type === 'crab') { const step = Math.floor(clock * 6 + e.id) % 2; ctx.fillStyle = '#e8503a'; ctx.beginPath(); ctx.ellipse(sx, e.y - 6, 9, 6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(sx - 9, e.y - 6, 18, 5); ctx.fillStyle = '#fff'; ctx.fillRect(sx - 5, e.y - 12, 3, 3); ctx.fillRect(sx + 2, e.y - 12, 3, 3); ctx.fillStyle = '#000'; ctx.fillRect(sx - 4, e.y - 11, 1, 2); ctx.fillRect(sx + 3, e.y - 11, 1, 2); ctx.fillStyle = '#c0301c'; ctx.fillRect(sx - 12, e.y - (step ? 12 : 9), 4, 5); ctx.fillRect(sx + 8, e.y - (step ? 9 : 12), 4, 5); ctx.fillRect(sx - 8 + (step ? 0 : 2), e.y - 1, 3, 2); ctx.fillRect(sx + 5 - (step ? 0 : 2), e.y - 1, 3, 2); }
  else { const fl = Math.floor(clock * 20 + e.id) % 2; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, e.y - 7, 8, 6, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx - 6, e.y - 9, 3, 6); ctx.fillRect(sx, e.y - 9, 3, 6); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(sx - 2, e.y - 14, 5, fl ? 4 : 2, -0.4, 0, 6.283); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(sx + (e.dir > 0 ? 4 : -6), e.y - 9, 2, 2); }
}
function drawPlayer() {
  const p = G.p; if (p.inv > 0 && !p.dead && Math.floor(p.inv / 4) % 2 && G.phase === 'play') return;
  const sx = p.x - camX, spd = Math.abs(p.ground ? p.gsp : p.vx), face = p.face || 1;
  ctx.save();
  if (spd > 7.5 && !p.dead) { ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const o = ((clock * 60 + i * 13) % 40); ctx.beginPath(); ctx.moveTo(sx - face * (14 + o), p.y - 6 - i * 5); ctx.lineTo(sx - face * (26 + o), p.y - 6 - i * 5); ctx.stroke(); } }
  if (p.loop) {                                                                        // 루프를 도는 중: 공으로 돌며 지나간다
    ctx.translate(sx, p.y - 9); ctx.rotate(p.loop.th * 3); ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.arc(0, 3, 6, 0, Math.PI); ctx.fill();
  } else if (p.crouch) {                                                               // 웅크리고 힘을 모으는 중
    ctx.translate(sx, p.y); ctx.scale(face, 1); const sh = Math.sin(clock * 60) * (p.charge > 0 ? 1 : 0); ctx.fillStyle = '#e07820'; ctx.beginPath(); ctx.ellipse(-8, -8, 6, 6, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.ellipse(1 + sh, -8, 9, 7, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(5 + sh, -13, 6, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8 + sh, -13, 2.5, 0, 6.283); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(8.5 + sh, -14, 1.5, 2);
    ctx.fillStyle = 'rgba(232,224,192,.7)'; for (let i = 0; i < Math.min(5, p.charge); i++) ctx.fillRect(-14 - i * 3 - (clock * 60 % 4), -2 - (i % 2) * 3, 3, 2);
  } else if (L.isSpin(p)) {                                                            // 몸을 말면 공처럼 구른다
    ctx.translate(sx, p.y - 9); ctx.rotate(clock * 22 * face); ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.arc(0, 3, 6, 0, Math.PI); ctx.fill(); ctx.strokeStyle = '#a85010'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 11, 0.4, 2.4); ctx.stroke();
  } else {
    const ang = p.ground ? Math.atan2(L.groundY(G.level, p.x - 6) - L.groundY(G.level, p.x + 6), 12) : 0;
    const sq = squash / 8; ctx.translate(sx, p.y); ctx.rotate(-ang * 0.7 * face); ctx.scale(face * (1 + 0.28 * sq), 1 - 0.28 * sq);
    const run = p.ground && Math.abs(p.gsp) > 0.4, step = Math.floor(clock * (6 + spd * 2)) % 2, lean = Math.min(5, spd * 0.6);
    ctx.fillStyle = '#e07820'; ctx.beginPath(); ctx.ellipse(-8, -14 - lean * 0.3, 6, 11, -0.5 - lean * 0.05 + Math.sin(clock * (run ? 14 : 4)) * 0.18, 0, 6.283); ctx.fill();                        // 꼬리 (살랑살랑)
    ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.ellipse(-9, -18, 3, 5, -0.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.ellipse(lean * 0.5, -13, 7, 9, 0.1 * lean / 5, 0, 6.283); ctx.fill();                                        // 몸
    ctx.fillStyle = '#fff2d0'; ctx.beginPath(); ctx.ellipse(lean * 0.5 + 2, -10, 4, 6, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f08a2a'; ctx.beginPath(); ctx.arc(2 + lean, -22, 7, 0, 6.283); ctx.fill();                                                            // 머리
    ctx.beginPath(); ctx.moveTo(-1 + lean, -27); ctx.lineTo(0 + lean, -33); ctx.lineTo(4 + lean, -28); ctx.fill();
    if (p.hurt) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(3 + lean, -24); ctx.lineTo(8 + lean, -20); ctx.moveTo(8 + lean, -24); ctx.lineTo(3 + lean, -20); ctx.stroke(); }          // 맞으면 X 눈
    else if (Math.floor(clock * 60) % 200 < 6) { ctx.fillStyle = '#000'; ctx.fillRect(3.5 + lean, -22, 4, 1.4); }                                                                               // 가끔 눈 깜빡
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(5 + lean, -22, 3.5, 3.5, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(5.5 + lean, -23, 2, 3); }
    ctx.fillStyle = '#d06818'; ctx.fillRect(1 + lean + 4, -19, 4, 2);
    ctx.fillStyle = '#6a3a12';
    if (!p.ground) { ctx.fillRect(1, -4, 5, 4); ctx.fillRect(-6, -2, 5, 4); }
    else if (run && spd > 3) { ctx.beginPath(); ctx.ellipse(0, -2, 8, 3, 0, 0, 6.283); ctx.fill(); }                                           // 다리가 빨라 둥글게 번져 보인다
    else if (run) { ctx.fillRect(step ? 2 : -3, -4, 5, 4); ctx.fillRect(step ? -5 : 2, -4, 5, 4); }
    else { ctx.fillRect(-4, -4, 5, 4); ctx.fillRect(1, -4, 5, 4); }
  }
  ctx.restore();
  if (p.shield) { ctx.strokeStyle = 'rgba(120,200,255,.85)'; ctx.fillStyle = 'rgba(120,200,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, p.y - 13, 17 + Math.sin(clock * 8), 0, 6.283); ctx.fill(); ctx.stroke(); }
  if (p.invinc > 0 && (p.invinc > 120 || Math.floor(p.invinc / 6) % 2)) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const a = clock * 6 + i * 1.57; ctx.fillRect(sx + Math.cos(a) * 15 - 1.5, p.y - 13 + Math.sin(a) * 15 - 1.5, 3, 3); } }
  if (p.shoes > 0 && Math.abs(p.ground ? p.gsp : p.vx) > 4) { ctx.strokeStyle = 'rgba(255,120,70,.6)'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sx - face * (10 + i * 6), p.y - 3 - i); ctx.lineTo(sx - face * (22 + i * 6), p.y - 3 - i); ctx.stroke(); } }
}
function drawHud() {
  ctx.font = '900 11px -apple-system, sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
  const t = (s, x, y, c = '#fff', a = 'left') => { ctx.textAlign = a; ctx.fillStyle = c; ctx.strokeText(s, x, y); ctx.fillText(s, x, y); };
  t(`SCORE ${G.score}`, 8, 6); t(`TIME ${Math.floor(G.t / 3600)}:${String(Math.floor(G.t / 60) % 60).padStart(2, '0')}`, 8, 20);
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(14, 41, 4, 5.5, 0, 0, 6.283); ctx.stroke(); t(`× ${G.rings}`, 22, 35, G.rings === 0 ? '#ff7a7a' : '#ffd23a');
  t(`🐿 × ${Math.max(0, G.lives)}`, 8, 50); if (G.p.shoes > 0) t(`»${Math.ceil(G.p.shoes / 60)}`, 8, 64, '#ff9a6a'); if (G.p.invinc > 0) t(`★${Math.ceil(G.p.invinc / 60)}`, G.p.shoes > 0 ? 40 : 8, 64, '#fff'); if (TUT) t('연습', VW / 2, 6, '#ffe27a', 'center');
  const sp = Math.abs(G.p.ground ? G.p.gsp : G.p.vx); t(`${Math.round(sp * 60)} px/s`, VW / 2, VH - 14, sp > 7 ? '#ffe27a' : '#fff', 'center');
}
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (!G) { ctx.fillStyle = '#0a1420'; ctx.fillRect(0, 0, VW, VH); return; }
  const th = THEMES[G.level.theme], sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0; if (shake > 0) shake *= 0.85; if (shake < 0.3) shake = 0;
  ctx.save(); ctx.translate(sx, sy);
  drawBackground(th);
  ctx.save(); ctx.translate(0, -camY);                                                 // 세계(땅·장치·적·캐릭터·효과)는 세로 카메라만큼 움직인다
  drawTerrain(th); drawObjects(); drawRings();
  for (const e of G.enemies) if (e.alive || false) drawEnemy(e);
  for (let i = trail.length - 1; i >= 0; i--) { const q = trail[i]; q.t++; if (q.t > 9) { trail.splice(i, 1); continue; } ctx.globalAlpha = 0.32 * (1 - q.t / 9); ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); if (q.spin) ctx.arc(q.x - camX, q.y - 9, 9, 0, 6.283); else ctx.ellipse(q.x - camX, q.y - 13, 7, 11, 0, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (G.phase !== 'dying' || G.p.y < VH + 60) drawPlayer();
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t++; f.x += f.vx; f.y += f.vy; f.vy += 0.12; if (f.t > f.life) { fx.splice(i, 1); continue; } ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x - camX, f.y, 2.4, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.font = '900 11px -apple-system, sans-serif';
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t++; if (f.t > 50) { floats.splice(i, 1); continue; } ctx.globalAlpha = f.t > 36 ? (50 - f.t) / 14 : 1; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#ffe27a'; const y = f.y - f.t * 0.6; ctx.strokeText(f.text, f.x - camX, y); ctx.fillText(f.text, f.x - camX, y); }
  ctx.globalAlpha = 1; ctx.restore(); ctx.restore();
  drawHud();
  if (G.phase === 'clear') {                                                       // 골 장면: 반짝이는 큰 글자와 별
    const k = Math.min(1, endT / 24), sc = 0.4 + 0.6 * (1 - Math.pow(1 - k, 3)) + Math.sin(clock * 6) * 0.03; ctx.save(); ctx.translate(VW / 2, 70); ctx.scale(sc, sc); ctx.globalAlpha = k;
    ctx.font = '900 30px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = '#7a3a00'; ctx.fillStyle = '#ffe27a'; ctx.strokeText('ZONE CLEAR!', 0, 0); ctx.fillText('ZONE CLEAR!', 0, 0);
    ctx.font = '800 11px -apple-system, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#fff'; ctx.strokeText(G.level.name, 0, 24); ctx.fillText(G.level.name, 0, 24);
    ctx.fillStyle = '#ffd23a'; for (let i = 0; i < 5; i++) { const a = clock * 2 + i; ctx.fillRect(-60 + i * 30 + Math.cos(a) * 3, -34 + Math.sin(a * 1.3) * 4, 4, 4); } ctx.restore(); ctx.globalAlpha = 1;
  }
  if (banner && banner.t < 90) { banner.t++; const a = banner.t < 12 ? banner.t / 12 : banner.t > 70 ? (90 - banner.t) / 20 : 1; ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(0, 84, VW, 34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe27a'; ctx.font = '900 18px -apple-system, sans-serif'; ctx.fillText(banner.text, VW / 2, 96); ctx.fillStyle = '#fff'; ctx.font = '700 10px -apple-system, sans-serif'; ctx.fillText(banner.sub, VW / 2, 110); ctx.globalAlpha = 1; }
}

// ---------- 반복 ----------
let last = performance.now(), acc = 0;
function tick() {
  const pg = G.p.ground, pvy = G.p.vy;
  const ev = L.step(G, readInput()) || G.events; handle(G.events);
  const p = G.p;
  if (G.phase === 'play' && !p.dead) {                                                // 착지 먼지·찌그러짐, 달릴 때 먼지, 빠를 때 잔상
    const sp = Math.abs(p.ground ? p.gsp : p.vx);
    if (p.ground && !pg && pvy > 2.2) { dust(p.x, p.y, 6, 1.8); squash = 8; }
    if (p.ground && sp > 3.5 && (++runT) % 4 === 0) dust(p.x - (p.face || 1) * 8, p.y, 1, 0.5);
    if (sp > 8.5 || p.dashRoll) trail.push({ x: p.x, y: p.y, spin: L.isSpin(p) || !!p.loop, face: p.face || 1, t: 0 });
  }
  if (squash > 0) squash--;
  const target = Math.max(0, Math.min(G.level.len - VW, p.x - VW * 0.34 + Math.max(-30, Math.min(70, (p.ground ? p.gsp : p.vx) * 9))));
  camX += (target - camX) * (G.phase === 'dying' ? 0 : 0.14); if (Math.abs(target - camX) > 160) camX = target;
  // 세로 카메라: 캐릭터가 화면 가운데 여유 구간(위 50 ~ 아래 175)을 벗어나면 부드럽게 따라간다. 여유 구간 안에서는 원래 위치(0)로 돌아온다
  const tY = L.camTargetY(p.y, VH);
  camY += (tY - camY) * (tY < camY ? 0.22 : 0.1); if (Math.abs(tY - camY) < 0.05) camY = tY;
  if (G.phase === 'clear') { endT++; if (endT % 7 === 0) burst(G.p.x + (Math.random() - 0.5) * 120, G.p.y - 50 - Math.random() * 50, ['#ffd23a', '#ff6a8a', '#6ad8ff', '#9aff7a'][Math.floor(Math.random() * 4)], 12, 3); if (endT === 1) sfx.clear(); if (endT > 170 && screen === 'play') showClear(); }
  if (G.phase === 'over' && screen === 'play') showOver();
}
function frame(now) {
  const dt = Math.min(100, now - last); last = now; clock += dt / 1000;
  if (screen === 'play' && G && !paused && !document.hidden) { acc += dt; while (acc >= 1000 / 60) { acc -= 1000 / 60; if (screen === 'play') tick(); } } else acc = 0;
  render(); requestAnimationFrame(frame);
}
showTitle(); resize(); requestAnimationFrame(frame); setTimeout(resize, 60);

/* @test-hooks:start */
window.__sp = { get VW() { return VW; }, resize, get camY() { return camY; }, get G() { return G; }, get screen() { return screen; }, get unlocked() { return unlocked; }, get best() { return best; }, get pad() { return pad; }, get camX() { return camX; }, L, tick, render, startZone, setG(g) { G = g; }, get paused() { return paused; }, setPaused, pressJump: () => { jumpEdge = true; } };
/* @test-hooks:end */
