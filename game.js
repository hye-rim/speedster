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
let ringPitch = 0, lastRing = -9, banner2 = null;
const sfx = {
  ring() { const now = clock; ringPitch = now - lastRing < 0.35 ? Math.min(ringPitch + 1, 6) : 0; lastRing = now; tone(1100 + ringPitch * 90, 0.09, 'triangle', 0.04, 300); },
  jump() { tone(420, 0.14, 'square', 0.035, 380); },
  roll() { tone(260, 0.18, 'sawtooth', 0.03, -120); },
  kill() { tone(600, 0.1, 'square', 0.05, -300); tone(300, 0.14, 'triangle', 0.05, -100, 0.06); },
  hurt() { tone(500, 0.35, 'sawtooth', 0.06, -420); },
  dead() { tone(400, 0.5, 'sawtooth', 0.06, -330); },
  spring() { tone(300, 0.25, 'sine', 0.06, 800); },
  crumble() { tone(140, 0.3, 'sawtooth', 0.05, -90); tone(90, 0.25, 'square', 0.04, -40, 0.05); },
  boost() { tone(500, 0.3, 'sawtooth', 0.05, 700); },
  shot() { tone(180, 0.18, 'square', 0.045, -120); },
  check() { tone(880, 0.1, 'triangle', 0.05); tone(1320, 0.14, 'triangle', 0.05, 0, 0.1); },
  oneup() { [660, 880, 1100, 1320].forEach((f, k) => tone(f, 0.12, 'triangle', 0.05, 0, k * 0.08)); },
  monitor() { tone(200, 0.12, 'square', 0.06, 200); tone(800, 0.2, 'triangle', 0.05, 400, 0.08); },
  shield() { tone(900, 0.3, 'sine', 0.05, -500); },
  rev(c) { tone(240 + c * 40, 0.1, 'sawtooth', 0.04, 160); },
  dash() { tone(300, 0.35, 'sawtooth', 0.06, 900); },
  loop() { tone(500, 0.5, 'triangle', 0.04, 600); },
  clear() { [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.2, 'triangle', 0.06, 0, k * 0.1)); },
  air() { tone(700, 0.12, 'sine', 0.05, 500); tone(1000, 0.14, 'sine', 0.05, 400, 0.1); },
  warn() { tone(880, 0.09, 'square', 0.05); tone(880, 0.09, 'square', 0.05, 0, 0.16); },
  count(n) { tone(260 + (6 - n) * 50, 0.2, 'sawtooth', 0.06, -60); },
  bump() { tone(520, 0.12, 'square', 0.05, 520); tone(900, 0.08, 'triangle', 0.04, 0, 0.05); },
  skill() { tone(600, 0.18, 'triangle', 0.05, 600); },
  boss() { [196, 175, 165, 147].forEach((f, k) => tone(f, 0.25, 'sawtooth', 0.06, -20, k * 0.18)); },
  bosshit() { tone(160, 0.22, 'sawtooth', 0.07, -60); tone(900, 0.12, 'square', 0.05, -500, 0.04); },
  boom() { tone(120, 0.4, 'sawtooth', 0.07, -90); tone(70, 0.4, 'square', 0.05, -30, 0.05); },
  bossdead() { for (let k = 0; k < 6; k++) tone(300 - k * 30, 0.3, 'sawtooth', 0.06, -150, k * 0.12); [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.2, 'triangle', 0.06, 0, 0.8 + k * 0.1)); },
  whoosh() { tone(260, 0.45, 'sawtooth', 0.04, 900); tone(520, 0.4, 'triangle', 0.03, 600, 0.05); },
  crash() { tone(150, 0.3, 'sawtooth', 0.08, -90); tone(90, 0.35, 'square', 0.06, -30, 0.05); tone(300, 0.12, 'square', 0.04, -200, 0.02); },
  fanon() { tone(200, 0.3, 'triangle', 0.03, 300); },
  boing() { tone(220, 0.28, 'sine', 0.07, 700); tone(440, 0.2, 'triangle', 0.04, 500, 0.05); },
  flipclack() { tone(180, 0.08, 'square', 0.07, 120); tone(520, 0.12, 'triangle', 0.05, 300, 0.04); },
  special() { [523, 659, 784, 1046, 1318, 1568].forEach((f, k) => tone(f, 0.18, 'triangle', 0.06, 0, k * 0.09)); },
  click() { tone(900, 0.05, 'square', 0.06, -300); tone(420, 0.12, 'triangle', 0.05, 200, 0.05); },
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
  banner = { text: TUT ? '연습' : `${zone + 1}코스 ${G.level.name}`, sub: TUT ? '달리고 · 뛰고 · 링을 모아 보세요' : (SIG_HINT[G.level.sig] || (G.level.waterY != null ? '물속! 숨이 줄어요, 큰 거품을 찾아요' : '골까지 달려요!')), t: 0 };
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
const SHOT_PX = 560;
const MON_LABEL = { ring10: '링 +10', shield: '보호막', invincible: '무적!', shoes: '빠른 신발!', life: '1UP!', magnet: '자석!', fire: '불 방패!', aqua: '물 방패!', thunder: '번개 방패!' };
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
    else if (e.t === 'air') { sfx.air(); burst(e.x, e.y, '#d8f4ff', 12, 1.8); floats.push({ x: e.x, y: e.y - 20, t: 0, text: '숨 쉬기!' }); tutorialSignal('air'); }
    else if (e.t === 'airwarn') { sfx.warn(); floats.push({ x: G.p.x, y: G.p.y - 40, t: 0, text: '숨이 줄어요!' }); }
    else if (e.t === 'drownnum') sfx.count(e.n);
    else if (e.t === 'shskill') { sfx.skill(); burst(G.p.x, G.p.y - 12, { fire: '#ff8a3a', thunder: '#ffe03a', aqua: '#7ad0ff' }[e.kind] || '#fff', 12, 2.4); }
    else if (e.t === 'bounce') { sfx.spring(); burst(G.p.x, G.p.y, '#9ad8ff', 8, 2); }
    else if (e.t === 'bumper') { sfx.bump(); burst(e.x, e.y, '#ff8ab0', 8, 2.2); tutorialSignal('bumper'); }
    else if (e.t === 'boss') { sfx.boss(); shake = 6; banner = { text: 'BOSS!', sub: '몸을 말고 뛰어서 부딪혀요', t: 0 }; }
    else if (e.t === 'bosshit') { sfx.bosshit(); shake = 8; burst(e.x, e.y, '#ffffff', 16, 3); floats.push({ x: e.x, y: e.y - 24, t: 0, text: e.hp > 0 ? '명중! ' + e.hp : '쾅!' }); }
    else if (e.t === 'bossdead') { sfx.bossdead(); shake = 14; for (let k = 0; k < 5; k++) burst(e.x + (k - 2) * 12, e.y + (k % 2) * 8, ['#ffd23a', '#ff6a3a', '#fff', '#ffb040', '#ff8a8a'][k], 16, 3.4); floats.push({ x: e.x, y: e.y - 30, t: 0, text: '+1000' }); }
    else if (e.t === 'bomb') { sfx.boom(); shake = 5; burst(e.x, e.y - 10, '#ffb040', 14, 3); burst(e.x, e.y - 10, '#ffe8a0', 8, 2); }
    else if (e.t === 'cork') { sfx.whoosh(); tutorialSignal('cork'); }
    else if (e.t === 'corkdone') burst(G.p.x, G.p.y - 8, '#ffd23a', 8, 2.2);
    else if (e.t === 'tubein') { sfx.whoosh(); tutorialSignal('tube'); }
    else if (e.t === 'tubeout') { sfx.boost(); burst(G.p.x, G.p.y - 8, '#bfe8ff', 10, 2.6); }
    else if (e.t === 'wallbreak') { sfx.crash(); shake = 10; for (let k = 0; k < 4; k++) burst(e.x + 7, e.y + (k - 1.5) * 26, ['#8a8478', '#b4ac9a', '#5a554a', '#d8d0bc'][k], 8, 3); floats.push({ x: e.x, y: e.y - 20, t: 0, text: '+50' }); tutorialSignal('wall'); }
    else if (e.t === 'fan') { sfx.fanon(); tutorialSignal('fan'); }
    else if (e.t === 'seesaw') { sfx.boing(); burst(e.x, e.y - 6, '#ffd23a', 10, 2.4); }
    else if (e.t === 'flip') { sfx.flipclack(); burst(e.x, e.y - 6, '#ff6a8a', 8, 2.4); tutorialSignal('flip'); }
    else if (e.t === 'zip') { sfx.whoosh(); tutorialSignal('zip'); }
    else if (e.t === 'zipend') sfx.skill();
    else if (e.t === 'specialin') { sfx.special(); shake = 6; banner2 = { text: 'SPECIAL STAGE', sub: '링을 ' + L.SPECIAL_NEED + '개 모아 끝까지!', t: 0 }; tutorialSignal('special'); }
    else if (e.t === 'special') { if (e.ok) { sfx.clear(); floats.push({ x: G.p.x, y: G.p.y - 40, t: 0, text: '에메랄드!' }); banner2 = { text: '에메랄드 획득!', sub: `링 ${e.collected}개 · ${e.emeralds}번째`, t: 0 }; } else { sfx.hurt(); banner2 = { text: '아쉬워요', sub: `링 ${e.collected}/${e.need}개`, t: 0 }; } }
    else if (e.t === 'switch') { sfx.click(); burst(e.x, e.y - 6, '#7aff9a', 8, 2); floats.push({ x: e.x, y: e.y - 24, t: 0, text: '문 열림!' }); tutorialSignal('switch'); }
    else if (e.t === 'current') tutorialSignal('current');
    else if (e.t === 'shieldbreak') { sfx.shield(); burst(G.p.x, G.p.y - 12, '#8ad0ff', 12, 2.4); }
    else if (e.t === 'rev') { sfx.rev(e.charge); tutorialSignal('rev'); }
    else if (e.t === 'spindash') { sfx.dash(); burst(G.p.x - 6 * G.p.face, G.p.y - 2, '#e8e0c0', 10, 2); tutorialSignal('spindash'); }
    else if (e.t === 'loop') { sfx.loop(); tutorialSignal('loop'); }
    else if (e.t === 'powerend') floats.push({ x: G.p.x, y: G.p.y - 36, t: 0, text: e.what === 'magnet' ? '자석 끝' : '무적 끝' });
    else if (e.t === 'kill') { sfx.kill(); burst(e.x, e.y - 8, '#ffd23a', 10, 2.4); floats.push({ x: e.x, y: e.y - 20, t: 0, text: '+' + e.pts }); tutorialSignal('kill'); }
    else if (e.t === 'hurt') { sfx.hurt(); shake = 8; tutorialSignal('hurt'); }
    else if (e.t === 'dead') { sfx.dead(); shake = 6; if (e.why === 'drown') { floats.push({ x: G.p.x, y: G.p.y - 40, t: 0, text: '숨이 다했어요!' }); for (let k = 0; k < 8; k++) burst(G.p.x, G.p.y - 14, '#d8f4ff', 2, 1.4); } }
    else if (e.t === 'crumble') { sfx.crumble(); const q = G.level.plats[e.id]; if (q) burst(G.p.x, q.y + 6, '#c8b090', 10, 2); }
    else if (e.t === 'spring') { sfx.spring(); tutorialSignal('spring'); }
    else if (e.t === 'tunnel') tutorialSignal('tunnel');
    else if (e.t === 'dodge') { if (TUT) floats.push({ x: G.p.x, y: G.p.y - 36, t: 0, text: '피했다!' }); tutorialSignal('dodge'); }
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
  special: { sky: [['#0a0630', '#3a1a7a'], ['#120840', '#5a2a9a'], ['#0a0630', '#2a1a6a']], far: ['#2a1a6a', '#241660', '#1a1050'], near: ['#201460', '#1a1050', '#120a3c'], top: '#9a7aff', body: ['#2a2070', '#1c1650'] },
  water: { sky: [['#0a5a9a', '#4ab8d8'], ['#0a4a88', '#2a98c0'], ['#06265a', '#0e6a98']], far: ['#1a78a8', '#146890', '#0e5278'], near: ['#14608a', '#0e5074', '#0a3e5c'], top: '#78e0cc', body: ['#2e6a86', '#204e68'] },
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
  const night = name === 'neon' || name === 'special' || (prog > 0.75 && (name === 'grass' || name === 'desert' || name === 'ice' || name === 'jungle'));
  if (night || name === 'lava') { ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = (hash(i) * VW * 1.3 - camX * 0.02) % VW, y = hash(i + 50) * 100; ctx.globalAlpha = (name === 'neon' || name === 'special' ? 0.8 : Math.min(0.8, (prog - 0.75) * 3)) * (0.5 + 0.5 * Math.sin(clock * 3 + i)); ctx.fillRect((x + VW) % VW, y, 1.5, 1.5); } ctx.globalAlpha = 1; }
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
  const shapeOf = { grass: ['hill', 'hill'], desert: ['mesa', 'hill'], jungle: ['hill', 'hill'], ice: ['peak', 'peak'], lava: ['peak', 'hill'], factory: ['mesa', 'mesa'], neon: ['mesa', 'mesa'], sky: ['hill', 'hill'], water: ['hill', 'hill'], special: ['hill', 'hill'] }[name];
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
  } else if (name === 'water') {
    if (!near) { ctx.fillStyle = 'rgba(200,245,255,.08)'; each(120, (i, x, h) => { ctx.beginPath(); ctx.moveTo(x + 10, 0); ctx.lineTo(x + 40 + h * 20, 0); ctx.lineTo(x + 10 - 30 + h * 10, VH); ctx.lineTo(x - 30 - h * 10, VH); ctx.fill(); }); }
    else each(70, (i, x, h) => { if (h < 0.3) return; ctx.strokeStyle = h > 0.65 ? '#2aa060' : '#3ab878'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, gy + 4); for (let k = 1; k <= 5; k++) ctx.lineTo(x + Math.sin(clock * 1.6 + i + k * 0.7) * (2 + k), gy + 4 - k * (6 + h * 4)); ctx.stroke(); if (h > 0.8) { ctx.fillStyle = '#ff8a8a'; ctx.beginPath(); ctx.arc(x + 12, gy - 2, 5, Math.PI, 0); ctx.fill(); } });
    ctx.fillStyle = 'rgba(220,248,255,.55)'; for (let i = 0; i < 12; i++) { const x = ((hash(i) * 380 - camX * (near ? 0.5 : 0.25)) % VW + VW) % VW, y = VH - ((clock * (10 + hash(i + 3) * 16) + hash(i + 7) * VH) % VH); ctx.beginPath(); ctx.arc(x, y, 1 + hash(i + 11) * 1.6, 0, 6.283); ctx.fill(); }
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
    const r0 = L0.rings[i]; if (G.got.has(i)) continue; const r = G.mag[i] || r0; const sx = r.x - camX; if (sx < -10 || sx > VW + 10) continue;
    const w = Math.abs(Math.cos(clock * 5 + r.x * 0.05)) * 5 + 1.2; ctx.strokeStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, r.y, w, 6.5, 0, 0, 6.283); ctx.stroke();
  }
  if (G.p.magnet > 0 && !G.p.dead) { const blink = G.p.magnet < 180 && Math.floor(G.p.magnet / 6) % 2; if (!blink) { ctx.save(); ctx.strokeStyle = 'rgba(255,100,120,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -clock * 30; ctx.beginPath(); ctx.arc(G.p.x - camX, G.p.y - 12, L.MAGNET_R, 0, 6.283); ctx.stroke(); ctx.restore(); } }
  for (const s of G.scatter) { const sx = s.x - camX; ctx.strokeStyle = s.life < 60 && Math.floor(s.life / 4) % 2 ? 'rgba(255,210,58,.3)' : '#ffd23a'; ctx.beginPath(); ctx.ellipse(sx, s.y, 4, 6, 0, 0, 6.283); ctx.stroke(); }
}
function drawObjects() {
  const L0 = G.level, TH0 = THEMES[L0.theme];
  for (const lo of L0.lows) {                                                       // 낮은 굴: 천장 덩어리 밑에 낮은 틈. 입구에 아래 화살표(굴러!)
    if (lo.x1 - camX < -4 || lo.x0 - camX > VW + 4) continue; const x0 = lo.x0 - camX, w = lo.x1 - lo.x0, gy = lo.gy, top = gy - L.LOW_TOP, bot = gy - L.LOW_H;
    ctx.fillStyle = TH0.body[1]; ctx.fillRect(x0, top, w, bot - top); ctx.fillStyle = TH0.body[0]; for (let k = 0; k < w; k += 28) ctx.fillRect(x0 + k + 2, top + 2, 24, bot - top - 4);
    ctx.fillStyle = TH0.top; ctx.fillRect(x0, bot - 4, w, 4); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0, bot, w, 5);
    ctx.fillStyle = TH0.top; ctx.fillRect(x0 - 5, top, 6, bot - top + 4); ctx.fillRect(x0 + w - 1, top, 6, bot - top + 4);
    const bob = Math.sin(clock * 6) * 2; ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.font = '900 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText('▼', x0 - 22, gy - 52 + bob); ctx.fillText('▼', x0 - 22, gy - 52 + bob); ctx.font = '800 10px sans-serif'; ctx.strokeText('굴러!', x0 - 22, gy - 38); ctx.fillText('굴러!', x0 - 22, gy - 38); ctx.lineWidth = 2;
  }
  for (const c of L0.cannons) {                                                     // 대포: 곧 쏘면 불이 번쩍 + 낮게 날아오는 포탄
    const sx = c.x - camX; if (sx < -SHOT_PX || sx > VW + 30) continue; const gy = c.gy, m = (((G.t - c.ph) % c.per) + c.per) % c.per, warn = c.per - m < 28;
    ctx.fillStyle = '#3a3f55'; ctx.fillRect(sx - 14, gy - 22, 30, 22); ctx.fillStyle = '#585f7e'; ctx.fillRect(sx - 14, gy - 22, 30, 4); ctx.fillStyle = '#12151f'; ctx.beginPath(); ctx.arc(sx - 15, gy - 15, 6, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.arc(sx + 6, gy - 5, 5, 0, 6.283); ctx.fill();
    if (warn) { ctx.fillStyle = `rgba(255,${120 + Math.floor((c.per - m) * 4)},60,.85)`; ctx.beginPath(); ctx.arc(sx - 22, gy - 22, 4 + (28 - (c.per - m)) * 0.25, 0, 6.283); ctx.fill(); }
    for (const sh of L.shotsOf(c, G.t)) { const hx = sh.x - camX; if (hx < -10 || hx > VW + 10) continue; ctx.fillStyle = 'rgba(255,180,90,.3)'; ctx.fillRect(hx + 4, gy - 24, 18, 4); ctx.fillStyle = '#1a1a24'; ctx.beginPath(); ctx.arc(hx, gy - 22, 5.5, 0, 6.283); ctx.fill(); ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.arc(hx - 1.5, gy - 23.5, 1.8, 0, 6.283); ctx.fill(); }
  }
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
  drawPlats(L0);                                                                      // 높은 길의 발판
  for (let i = 0; i < L0.monitors.length; i++) {                                     // 아이템 상자
    const m = L0.monitors[i]; if (G.mon.has(i)) continue; const sx = m.x - camX; if (sx < -14 || sx > VW + 14) continue; const gy = m.y != null ? m.y : L.groundY(L0, m.x);
    ctx.fillStyle = '#2a2f48'; ctx.fillRect(sx - 9, gy - 22, 18, 22); ctx.fillStyle = '#9aa4c8'; ctx.fillRect(sx - 9, gy - 22, 18, 2); ctx.fillStyle = '#0a1020'; ctx.fillRect(sx - 7, gy - 20, 14, 14);
    const icon = { ring10: ['#ffd23a', '◯'], shield: ['#5ac0ff', '◍'], invincible: ['#ffffff', '★'], shoes: ['#ff6a4a', '»'], life: ['#ff8aa8', '♥'], magnet: ['#ff5a6a', 'U'], fire: ['#ff7a2a', 'F'], aqua: ['#3aa0ff', 'W'], thunder: ['#ffe03a', 'T'] }[m.type]; ctx.fillStyle = icon[0]; ctx.font = '900 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon[1], sx, gy - 13);
  }
  for (const k of L0.spikes) { const sx = k.x - camX; if (sx < -12 || sx > VW + 12) continue; const gy = L.groundY(L0, k.x); ctx.fillStyle = '#d8dce8'; ctx.beginPath(); ctx.moveTo(sx - 8, gy); ctx.lineTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUTLINE[L0.theme] || '#1a1030'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.moveTo(sx, gy - 14); ctx.lineTo(sx + 8, gy); ctx.lineTo(sx + 2, gy); ctx.fill(); }
  for (const s of L0.springs) { const sx = s.x - camX; if (sx < -14 || sx > VW + 14) continue; const gy = L.groundY(L0, s.x); ctx.fillStyle = '#e83a3a'; ctx.fillRect(sx - 9, gy - 5, 18, 5); ctx.strokeStyle = '#d8d8e8'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(sx - 6, gy - 6 - i * 3); ctx.lineTo(sx + 6, gy - 8 - i * 3); } ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 10, gy - 19, 20, 4); }
  for (const d of L0.pads) { const sx = d.x - camX; if (sx < -20 || sx > VW + 20) continue; const gy = L.groundY(L0, d.x); ctx.fillStyle = '#ffb02a'; ctx.fillRect(sx - 14, gy - 3, 28, 3); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const o = ((clock * 40 + i * 9) % 27) - 13; ctx.beginPath(); ctx.moveTo(sx + o, gy - 2); ctx.lineTo(sx + o + 4, gy - 1.5); ctx.lineTo(sx + o, gy - 0.5); ctx.fill(); } }
  for (const c of L0.checks) { const sx = c.x - camX; if (sx < -10 || sx > VW + 10) continue; const gy = L.groundY(L0, c.x), on = G.checkX >= c.x; ctx.fillStyle = '#d0d4e0'; ctx.fillRect(sx - 1.5, gy - 38, 3, 38); ctx.fillStyle = on ? '#ff5a5a' : '#4aa8ff'; ctx.beginPath(); ctx.arc(sx, gy - 40, 5, 0, 6.283); ctx.fill(); }
  // 골 표지판
  const gx = L0.goalX - camX; if (gx > -30 && gx < VW + 30) { const gy = L.groundY(L0, L0.goalX); ctx.fillStyle = '#b0b8d0'; ctx.fillRect(gx - 2, gy - 56, 4, 56); const w = Math.abs(Math.cos(clock * 4)) * 14 + 2; ctx.fillStyle = '#ffd23a'; ctx.fillRect(gx - w / 2, gy - 72, w, 20); ctx.fillStyle = '#e83a3a'; ctx.fillRect(gx - w / 2 + 1, gy - 70, Math.max(0, w - 2), 4); }
}
// ---------- 기믹(범퍼·철구·분쇄기) · 큰 거품 · 보스 ----------
function drawBoss(b, B) {
  const sx = b.x - camX; if (sx < -60 || sx > VW + 60) return;
  const dead = b.ph === 'dead', flash = b.inv > 0 && Math.floor(b.inv / 4) % 2, shk = b.ph === 'warn' ? Math.sin(b.t * 2.4) * 2.2 : 0;
  if (dead && Math.floor(b.t / 3) % 2) return;
  ctx.save(); ctx.translate(sx + shk, b.y);
  if (b.ph === 'low' || b.ph === 'dive' || b.ph === 'warn') { ctx.fillStyle = '#7a7e90'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 8 - 4, 12); ctx.lineTo(i * 8, 22); ctx.lineTo(i * 8 + 4, 12); ctx.fill(); } }       // 아래로 내려올 때 가시가 나온다
  ctx.fillStyle = 'rgba(255,170,60,.85)'; const fl = 5 + Math.sin(clock * 40) * 2; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(0, 12 + fl + 4); ctx.lineTo(8, 12); ctx.fill();          // 아래로 뿜는 불꽃
  const accent = { grass: '#58c040', desert: '#e8a840', jungle: '#2aa850', ice: '#79c4f0', lava: '#ff5a1a', factory: '#ffd23a', neon: '#ff4aa8', sky: '#8ac0ff', water: '#38d0c0' }[G.level.theme] || '#e83a3a';
  ctx.globalAlpha = flash ? 0.45 : 1;
  ELL(0, 4, 25, 13, '#4a5068'); ELL(0, 2, 23, 11, flash ? '#fff' : '#c8d0e4'); ctx.fillStyle = accent; ctx.fillRect(-22, 3, 44, 4);
  ELL(0, -8, 12, 11, 'rgba(160,220,255,.75)'); ELL(0, -5, 8, 7, '#2a2e44'); ELL(-3, -6, 2.2, 2.4, '#fff'); ELL(3, -6, 2.2, 2.4, '#fff'); ELL(-2.6, -6, 1, 1.2, '#e83a3a'); ELL(3.4, -6, 1, 1.2, '#e83a3a');       // 조종사(고글 낀 눈)
  ctx.strokeStyle = '#4a5068'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(14, -26); ctx.stroke(); ELL(14, -27, 2.2, 2.2, b.inv > 0 ? '#fff' : accent);                // 안테나
  ctx.fillStyle = '#4a5068'; ctx.fillRect(-26, 0, 6, 8); ctx.fillRect(20, 0, 6, 8);
  ctx.globalAlpha = 1; ctx.restore();
  if (dead && Math.floor(b.t / 5) % 2 === 0) { ctx.fillStyle = 'rgba(255,200,80,.8)'; ctx.beginPath(); ctx.arc(sx + Math.sin(b.t) * 14, b.y + Math.cos(b.t * 1.3) * 8, 5 + (b.t % 5), 0, 6.283); ctx.fill(); }
}
function drawGimmicks() {
  const L0 = G.level, TH0 = THEMES[L0.theme];
  for (let i = 0; i < L0.bumpers.length; i++) {                                     // 범퍼: 둥글게 반짝, 맞으면 커졌다 작아진다
    const b = L0.bumpers[i], sx = b.x - camX; if (sx < -20 || sx > VW + 20) continue;
    const hit = G.bump[i] > G.t ? (G.bump[i] - G.t) / 10 : 0, r = b.r + hit * 4;
    ctx.fillStyle = hit ? '#fff' : '#ff4a88'; ctx.beginPath(); ctx.arc(sx, b.y, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#ffd0e0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#b01a58'; ctx.beginPath(); ctx.arc(sx, b.y, r * 0.55, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(sx - r * 0.3, b.y - r * 0.35, r * 0.18, 0, 6.283); ctx.fill();
  }
  for (const sw of L0.swings) {                                                     // 흔들리는 철구: 사슬 + 가시 달린 쇠공
    if (sw.x + sw.len + 20 - camX < 0 || sw.x - sw.len - 20 - camX > VW) continue;
    const q = L.swingPos(sw, G.t), px = sw.x - camX, bx = q.x - camX;
    ctx.strokeStyle = '#8a8fa4'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(px, sw.y); ctx.lineTo(bx, q.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#6a6f84'; ctx.fillRect(px - 5, sw.y - 5, 10, 6);
    ctx.strokeStyle = '#2a2e3e'; ctx.lineWidth = 2; for (let k = 0; k < 8; k++) { const a = k * 0.785 + G.t * 0.05; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * 8, q.y + Math.sin(a) * 8); ctx.lineTo(bx + Math.cos(a) * 13, q.y + Math.sin(a) * 13); ctx.stroke(); }
    ELL(bx, q.y, 9.5, 9.5, '#3a3f54'); ELL(bx - 3, q.y - 3, 3, 3, '#8a90aa');
  }
  for (const c of L0.crushers) {                                                    // 분쇄기: 위에서 내려오는 블록. 곧 내려오면 흔들리고 빨갛게 번쩍
    const sx0 = c.x0 - camX; if (sx0 < -60 || sx0 > VW + 20) continue;
    const bot = L.crushY(c, G.t), w = c.x1 - c.x0, ph = (((G.t - c.ph) % c.per) + c.per) % c.per, warn = ph >= c.per - 100 && ph < c.per - 70, shk = warn ? Math.sin(G.t * 2.4) * 1.6 : 0;
    ctx.fillStyle = '#4a4e62'; ctx.fillRect(sx0 + w / 2 - 3, bot - 420, 6, 390);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(sx0 + w / 2, c.gy, w * 0.5, 3, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8a90a8'; ctx.fillRect(sx0 + shk, bot - 30, w, 30);
    ctx.fillStyle = '#ffd23a'; for (let k = 0; k < w; k += 10) { ctx.beginPath(); ctx.moveTo(sx0 + shk + k, bot - 4); ctx.lineTo(sx0 + shk + k + 5, bot - 4); ctx.lineTo(sx0 + shk + k + 10, bot - 14); ctx.lineTo(sx0 + shk + k + 5, bot - 14); ctx.fill(); }
    ctx.fillStyle = '#d8dce8'; for (let k = 0; k < w; k += 8) { ctx.beginPath(); ctx.moveTo(sx0 + shk + k, bot); ctx.lineTo(sx0 + shk + k + 4, bot + 6); ctx.lineTo(sx0 + shk + k + 8, bot); ctx.fill(); }
    if (warn && Math.floor(G.t / 4) % 2) { ctx.fillStyle = 'rgba(255,60,50,.8)'; ctx.fillRect(sx0 + w / 2 - 4, bot - 38, 8, 5); }
  }
  for (let i = 0; i < L0.bubbles.length; i++) {                                     // 큰 거품: 먹으면 숨이 가득. 먹은 뒤엔 잠깐 사라졌다 다시 생긴다
    const b = L0.bubbles[i], sx = b.x - camX; if (sx < -20 || sx > VW + 20 || G.bub[i] > G.t) continue;
    const y = b.y + Math.sin(clock * 2.4 + i) * 3, r = 11 + Math.sin(clock * 3 + i) * 0.8;
    ctx.fillStyle = 'rgba(190,240,255,.35)'; ctx.beginPath(); ctx.arc(sx, y, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(235,252,255,.95)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(sx - 4, y - 4, 3, 2, -0.7, 0, 6.283); ctx.fill();
  }
  for (const m of L0.mud) {                                                         // 늪: 땅 윗면이 질척한 갈색, 거품이 보글보글
    if (m.x1 - camX < 0 || m.x0 - camX > VW) continue;
    for (let wx = Math.max(m.x0, Math.floor(camX)); wx < Math.min(m.x1, camX + VW); wx += 2) { const h = L.groundY(L0, wx); ctx.fillStyle = '#4a3020'; ctx.fillRect(wx - camX, h - 3, 2, 14); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(wx - camX, h - 3, 2, 4); }
    for (let i = 0; i < 7; i++) { const wx = m.x0 + ((i * 53 + Math.floor(clock * 3 + i)) % Math.max(10, m.x1 - m.x0)); const ph = (clock * 1.4 + i * 0.37) % 1; const sx2 = wx - camX; if (sx2 < 0 || sx2 > VW) continue; ctx.strokeStyle = 'rgba(200,160,100,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx2, L.groundY(L0, wx) + 2 - ph * 5, 1 + ph * 2.5, 0, 6.283); ctx.stroke(); }
  }
  for (const t of L0.tubes) {                                                       // 튜브: 반투명한 굵은 관과 양끝의 입구 고리
    if (t.x1 + 20 - camX < 0 || t.x - 20 - camX > VW) continue;
    const path = () => { ctx.beginPath(); t.pts.forEach((q, i) => { const x = q[0] - camX, y = q[1] - 12; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,24,40,.85)'; ctx.lineWidth = 27; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,190,.55)'; ctx.lineWidth = 22; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,240,255,.45)'; ctx.lineWidth = 5; ctx.translate(0, -5); path(); ctx.stroke(); ctx.translate(0, 5);
    ctx.setLineDash([6, 10]); ctx.lineDashOffset = -clock * 40; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; path(); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
    for (const [qx, qy] of [[t.pts[0][0], t.pts[0][1]], [t.x1, t.pts[t.pts.length - 1][1]]]) { const sx2 = qx - camX; ctx.fillStyle = '#c8d4ec'; ctx.beginPath(); ctx.ellipse(sx2, qy - 12, 5, 16, 0, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#1a2030'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#10142a'; ctx.beginPath(); ctx.ellipse(sx2, qy - 12, 2.5, 11, 0, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = '#ffd23a'; const ax = t.x - camX - 16; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(ax - k * 7 - 6, t.y - 18); ctx.lineTo(ax - k * 7, t.y - 12); ctx.lineTo(ax - k * 7 - 6, t.y - 6); ctx.fill(); }          // 입구 화살표
  }
  for (const c of L0.corks) {                                                       // 코르크스크루: 땅 위로 솟은 나선(줄무늬가 감겨 올라간다)
    if (c.x + c.len + 20 - camX < 0 || c.x - 20 - camX > VW) continue;
    const pt = (u) => [c.x + u * c.len - camX, c.y - 10 - L.CORK_H * Math.sin(Math.PI * u)];
    ctx.lineCap = 'round'; const N = 28;
    for (let k = 0; k < N; k++) { const a = pt(k / N), b = pt((k + 1) / N); ctx.strokeStyle = 'rgba(20,24,40,.8)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let k = 0; k < N; k++) { const a = pt(k / N), b = pt((k + 1) / N); ctx.strokeStyle = (k + Math.floor(clock * 6)) % 2 ? '#ffd23a' : '#ff7a3a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.lineCap = 'butt'; for (const x of [c.x, c.x + c.len]) { ctx.fillStyle = '#6a6f84'; ctx.fillRect(x - camX - 3, c.y - 12, 6, 12); }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '900 9px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('빨리!', c.x - camX - 14, c.y - 22);
  }
  for (let i = 0; i < L0.walls.length; i++) {                                       // 부서지는 벽: 금 간 돌벽. 부서지면 잔해만 남는다
    const w = L0.walls[i], sx2 = w.x - camX; if (sx2 < -30 || sx2 > VW + 30) continue;
    if (G.broke[i]) { ctx.fillStyle = '#6a6458'; for (let k = 0; k < 5; k++) ctx.fillRect(sx2 - 6 + k * 5, w.gy - 3 - (k % 2) * 2, 4, 3 + (k % 2) * 2); continue; }
    ctx.fillStyle = '#8a8478'; ctx.fillRect(sx2, w.gy - w.h, w.w, w.h); ctx.fillStyle = '#b4ac9a'; ctx.fillRect(sx2, w.gy - w.h, 3, w.h); ctx.fillStyle = '#5a554a'; ctx.fillRect(sx2 + w.w - 3, w.gy - w.h, 3, w.h);
    ctx.strokeStyle = '#3a362e'; ctx.lineWidth = 1; for (let y = w.gy - w.h + 14; y < w.gy; y += 14) { ctx.beginPath(); ctx.moveTo(sx2, y); ctx.lineTo(sx2 + w.w, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(sx2 + 3, w.gy - w.h + 10); ctx.lineTo(sx2 + 9, w.gy - w.h + 30); ctx.lineTo(sx2 + 5, w.gy - w.h + 48); ctx.lineTo(sx2 + 10, w.gy - w.h + 70); ctx.stroke();        // 금
    ctx.strokeStyle = OUTLINE[L0.theme] || '#1a1030'; ctx.lineWidth = 1.6; ctx.strokeRect(sx2, w.gy - w.h, w.w, w.h);
    ctx.fillStyle = '#ffd23a'; ctx.font = '900 9px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('굴러!', sx2 + w.w / 2 - 22, w.gy - w.h - 6);
  }
  for (const f of L0.fans) {                                                        // 바람 구멍: 바닥의 팬과 위로 올라가는 바람 줄기
    const sx2 = f.x - camX; if (sx2 < -40 || sx2 > VW + 40) continue;
    ctx.fillStyle = 'rgba(200,235,255,.10)'; ctx.fillRect(sx2 - f.w / 2, f.top, f.w, f.gy - f.top);
    ctx.strokeStyle = 'rgba(235,248,255,.6)'; ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const ph = (clock * 1.6 + i * 0.31) % 1, yy = f.gy - ph * (f.gy - f.top), xx = sx2 + Math.sin(i * 2.1 + clock * 3) * f.w * 0.35; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 10); ctx.stroke(); } ctx.globalAlpha = 1;
    ctx.fillStyle = '#4a5068'; ctx.fillRect(sx2 - f.w / 2 - 3, f.gy - 8, f.w + 6, 8); ctx.fillStyle = '#8a90a8'; ctx.fillRect(sx2 - f.w / 2 - 3, f.gy - 8, f.w + 6, 2);
    const bw = Math.abs(Math.cos(clock * 14)) * f.w * 0.45 + 4; ctx.fillStyle = '#d8dce8'; ctx.beginPath(); ctx.ellipse(sx2, f.gy - 10, bw, 2.4, 0, 0, 6.283); ctx.fill();
  }
  for (const w of L0.switches) {                                                    // 스위치: 바닥 판. 눌려 있는 동안 불이 초록
    const sx2 = w.x - camX; if (sx2 < -30 || sx2 > VW + 30) continue; const on = G.t < (G.gate[w.id] || 0);
    ctx.fillStyle = '#3a3f54'; ctx.fillRect(sx2 - 22, w.gy - 3, 44, 3); ctx.fillStyle = on ? '#4aff8a' : '#ff4a5a'; ctx.fillRect(sx2 - 14, w.gy - (on ? 2 : 6), 28, on ? 2 : 4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(sx2 - 14, w.gy - (on ? 2 : 6), 28, on ? 2 : 4);
    if (!on) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '900 9px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('밟아요', sx2, w.gy - 14); }
  }
  for (const d of L0.doors) {                                                       // 문: 닫히면 철판, 열리면 위로 들려 있고 남은 시간이 줄어든다
    const sx2 = d.x - camX; if (sx2 < -30 || sx2 > VW + 30) continue; const left = Math.max(0, (G.gate[d.id] || 0) - G.t), open = left > 0, lift = open ? Math.min(1, left / 20) * d.h * 0.9 : 0;
    ctx.fillStyle = '#5a6078'; ctx.fillRect(sx2 - 4, d.gy - d.h - 6, d.w + 8, 6); ctx.fillStyle = '#8a90a8'; ctx.fillRect(sx2 - 4, d.gy - d.h - 6, d.w + 8, 2);
    if (!open || left < 20) { const h2 = open ? d.h - lift : d.h; ctx.fillStyle = '#4a5068'; ctx.fillRect(sx2, d.gy - h2, d.w, h2); ctx.fillStyle = '#7a8098'; ctx.fillRect(sx2, d.gy - h2, 3, h2); ctx.fillStyle = '#ffd23a'; for (let y = d.gy - h2 + 6; y < d.gy - 6; y += 14) ctx.fillRect(sx2 + 3, y, d.w - 6, 4); ctx.strokeStyle = OUTLINE[L0.theme] || '#1a1030'; ctx.lineWidth = 1.6; ctx.strokeRect(sx2, d.gy - h2, d.w, h2); }
    ctx.fillStyle = open ? (left < 120 && Math.floor(G.t / 6) % 2 ? '#ffb02a' : '#4aff8a') : '#ff4a5a'; ctx.beginPath(); ctx.arc(sx2 + d.w / 2, d.gy - d.h - 12, 3.4, 0, 6.283); ctx.fill();
    if (open) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx2 - 10, d.gy - d.h - 24, 34, 5); ctx.fillStyle = '#4aff8a'; ctx.fillRect(sx2 - 9, d.gy - d.h - 23, 32 * left / L.GATE_OPEN, 3); }
  }
  for (const c of L0.currents) {                                                    // 물살: 흐르는 방향의 줄기 / 기포 기둥
    if (c.x1 - camX < 0 || c.x0 - camX > VW) continue; const x0 = c.x0 - camX, x1 = c.x1 - camX, w = x1 - x0, h = c.y1 - c.y0;
    ctx.fillStyle = 'rgba(190,235,255,.07)'; ctx.fillRect(x0, c.y0, w, h);
    ctx.strokeStyle = 'rgba(235,250,255,.55)'; ctx.fillStyle = 'rgba(235,250,255,.7)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < Math.max(4, Math.floor(w / 40)); i++) {
      if (c.dx) { const ph = ((clock * 40 * Math.sign(c.dx) + i * 61) % w + w) % w, yy = c.y0 + 10 + ((i * 37) % Math.max(10, h - 20)); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(x0 + ph, yy); ctx.lineTo(x0 + ph + 12 * Math.sign(c.dx), yy); ctx.lineTo(x0 + ph + 8 * Math.sign(c.dx), yy - 2); ctx.moveTo(x0 + ph + 12 * Math.sign(c.dx), yy); ctx.lineTo(x0 + ph + 8 * Math.sign(c.dx), yy + 2); ctx.stroke(); }
      else { const ph = (clock * 0.9 + i * 0.27) % 1, xx = x0 + w / 2 + Math.sin(i * 2.3 + clock * 2) * w * 0.3, yy = c.y1 - ph * h; ctx.globalAlpha = 1 - ph * 0.6; ctx.beginPath(); ctx.arc(xx, yy, 1.6 + (i % 3), 0, 6.283); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < L0.seesaws.length; i++) {                                     // 시소: 한쪽이 내려앉은 널빤지. 밟으면 반대로 기울며 튕긴다
    const q = L0.seesaws[i], sx2 = q.x - camX; if (sx2 < -70 || sx2 > VW + 70) continue; const since = G.t - (G.ss[i] === undefined ? -99 : G.ss[i]), ang = since < 24 ? -0.2 + 0.4 * Math.min(1, since / 8) : -0.2;
    ctx.fillStyle = '#6a6f84'; ctx.beginPath(); ctx.moveTo(sx2 - 9, q.gy); ctx.lineTo(sx2, q.gy - 14); ctx.lineTo(sx2 + 9, q.gy); ctx.fill();
    ctx.save(); ctx.translate(sx2, q.gy - 14); ctx.rotate(ang); ctx.fillStyle = '#c8873a'; ctx.fillRect(-q.len / 2, -3, q.len, 6); ctx.fillStyle = '#e8b060'; ctx.fillRect(-q.len / 2, -3, q.len, 2); ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.2; ctx.strokeRect(-q.len / 2, -3, q.len, 6);
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(q.len / 2 - 6, -7, 4, 0, 6.283); ctx.fill(); ctx.restore();
  }
  for (let i = 0; i < L0.flippers.length; i++) {                                    // 핀볼 플리퍼: 쳐 올릴 때 위로 꺾인다
    const f = L0.flippers[i], sx2 = f.x - camX; if (sx2 < -60 || sx2 > VW + 60) continue; const since = G.t - (G.flip[i] === undefined ? -99 : G.flip[i]), ang = since < 14 ? -0.75 : 0.28;
    ctx.save(); ctx.translate(sx2 + 6, f.gy - 6); ctx.rotate(ang); ctx.fillStyle = '#e83a5a'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(f.len - 6, -2); ctx.lineTo(f.len - 6, 2); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#4a5068'; ctx.fillRect(sx2, f.gy - 3, f.len + 4, 3);
  }
  for (const z of L0.zips) {                                                        // 도르래: 두 기둥 사이의 레일과 손잡이
    if (z.x1 + 20 - camX < 0 || z.x0 - 20 - camX > VW) continue; const x0 = z.x0 - camX, x1 = z.x1 - camX;
    ctx.fillStyle = '#5a6078'; ctx.fillRect(x0 - 2, z.y0 - 4, 4, z.gy - z.y0 + 4); ctx.fillRect(x1 - 2, z.y1 - 4, 4, z.gy - z.y1 + 4); ctx.fillStyle = '#8a90a8'; ctx.fillRect(x0 - 6, z.y0 - 5, 12, 4); ctx.fillRect(x1 - 6, z.y1 - 5, 12, 4);
    ctx.strokeStyle = 'rgba(20,24,40,.9)'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x0, z.y0); ctx.lineTo(x1, z.y1); ctx.stroke(); ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, z.y0); ctx.lineTo(x1, z.y1); ctx.stroke();
    const riding = G.p.loop && G.p.loop.zip === z, hx = riding ? G.p.x - camX : x0, hy = riding ? G.p.y - 22 : z.y0;
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.strokeStyle = '#ff7a3a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(hx, hy + 3); ctx.lineTo(hx, hy + 12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hx - 5, hy + 12); ctx.lineTo(hx + 5, hy + 12); ctx.stroke();
    if (!riding) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '900 9px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('점프로 잡기', x0, z.y0 - 12); }
  }
  for (const q of L0.plats) if (q.elev) {                                           // 승강기: 발판이 다니는 길에 레일과 화살표
    const sx2 = (q.x0 + q.x1) / 2 - camX; if (sx2 < -40 || sx2 > VW + 40) continue; const top = q.y0 - q.yamp - 4, bot = q.y0 + q.yamp + 2;
    ctx.fillStyle = 'rgba(20,24,40,.6)'; ctx.fillRect(sx2 - 2, top, 4, bot - top); ctx.strokeStyle = 'rgba(255,210,58,.8)'; ctx.lineWidth = 1.6; for (let k = 0; k < 4; k++) { const yy = top + ((clock * 30 + k * 30) % (bot - top)); ctx.beginPath(); ctx.moveTo(sx2 - 4, yy + 4); ctx.lineTo(sx2, yy); ctx.lineTo(sx2 + 4, yy + 4); ctx.stroke(); }
  }
  if (L0.giant && !G.giantTaken && !G.sp) {                                         // 거대 링: 높은 길 위에 떠서 반짝인다 (닿으면 특별 스테이지)
    const g = L0.giant, sx2 = g.x - camX; if (sx2 > -30 && sx2 < VW + 30) { const w = Math.abs(Math.cos(clock * 2.4)) * 12 + 4; ctx.strokeStyle = 'rgba(255,230,120,.35)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx2, g.y, w, 17, 0, 0, 6.283); ctx.stroke(); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sx2, g.y, w, 17, 0, 0, 6.283); ctx.stroke(); ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(sx2, g.y, w, 17, 0, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { const a = clock * 3 + k * 2.1; ctx.fillRect(sx2 + Math.cos(a) * 22, g.y + Math.sin(a) * 22, 2, 2); } }
  }
  const B = L0.boss; if (!B || G.noBoss) return;
  const gate = (x, on) => { const sx = x - camX; if (sx < -20 || sx > VW + 20) return; const gy = B.gy; const a = on ? 0.55 + 0.25 * Math.sin(clock * 12) : 0.18; ctx.fillStyle = `rgba(255,70,90,${a})`; ctx.fillRect(sx - 3, gy - 120, 6, 120); ctx.fillStyle = '#d8dce8'; ctx.fillRect(sx - 6, gy - 124, 12, 5); ctx.fillRect(sx - 6, gy - 4, 12, 4); ctx.fillStyle = `rgba(255,150,160,${a * 0.5})`; ctx.fillRect(sx - 9, gy - 120, 18, 120); };
  if (!G.bossDown) gate(B.x1, true); if (G.bossOn && !G.bossDown) gate(B.x0, true);       // 보스를 쓰러뜨릴 때까지 앞뒤가 막힌다
  if (G.boss && G.bossOn) drawBoss(G.boss, B);
  for (const bo of G.bbombs) { const sx = bo.x - camX; if (sx < -10 || sx > VW + 10) continue; const lit = bo.fuse >= 0 && Math.floor(bo.fuse / (bo.fuse < 18 ? 2 : 5)) % 2 === 0; ELL(sx, bo.y - 6, 6.5, 6.5, lit ? '#d8402a' : '#2a2e3e'); ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 1, bo.y - 15, 2, 4); if (bo.fuse >= 0) { ctx.strokeStyle = 'rgba(255,120,60,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, bo.y - 4, 34, 0, 6.283); ctx.stroke(); } }
  for (const sh of G.bshots) { const hx = sh.x - camX; if (hx < -10 || hx > VW + 10) continue; ctx.fillStyle = 'rgba(255,180,90,.3)'; ctx.fillRect(hx - Math.sign(sh.vx) * 22, sh.y - 2, 18, 4); ELL(hx, sh.y, 5.5, 5.5, '#1a1a24'); ELL(hx - 1.5, sh.y - 1.5, 1.8, 1.8, '#ff8a3a'); }
}
function drawWater() {                                                              // 수중 코스: 수면 아래를 푸르게 덮고, 수면에 물결선
  const L0 = G.level; if (L0.waterY == null) return; const wy = L0.waterY;
  ctx.fillStyle = 'rgba(30,120,210,.30)'; ctx.fillRect(0, wy, VW, 900);
  ctx.strokeStyle = 'rgba(200,244,255,.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let sx = 0; sx <= VW; sx += 4) { const y = wy + Math.sin((sx + camX) * 0.07 + clock * 3) * 1.6; if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y); } ctx.stroke();
  ctx.fillStyle = 'rgba(200,244,255,.14)'; ctx.beginPath(); for (let sx = 0; sx <= VW; sx += 4) { const y = wy + 3 + Math.sin((sx + camX) * 0.05 - clock * 2) * 2.2; if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y); } ctx.lineTo(VW, wy + 10); ctx.lineTo(0, wy + 10); ctx.fill();
}
// ---------- 높은 길의 발판 (코스마다 다른 모양) ----------
const PLAT_LOOK = { grass: ['#6ac848', '#8a5a2a'], desert: ['#f0d090', '#b8884a'], jungle: ['#3aa850', '#6a4a22'], ice: ['#f4fcff', '#8ac8e8'], lava: ['#9a6a5a', '#4a2e2a'], factory: ['#b8c4d4', '#5a6a7a'], neon: ['#4af0ff', '#2a1a6a'], water: ['#7ae0d0', '#2a5a7a'], special: ['#c8b0ff', '#3a2a8a'], sky: ['#ffffff', '#d4e6ff'] };
function drawPlats(L0) {
  const look = PLAT_LOOK[L0.theme] || PLAT_LOOK.grass;
  for (const pl of L0.plats) {
    const o = L.platOff(pl, G.t), gone = G.gone[pl.id] != null, crv = pl.crumble ? (G.cr[pl.id] || 0) / L.CRUMBLE_T : 0, shk = crv > 0 ? Math.sin(G.t * 2.7) * 1.4 * crv : 0;
    const x0 = pl.x0 - camX + o + shk, x1 = pl.x1 - camX + o + shk; if (x1 < -20 || x0 > VW + 20) continue; const y = pl.y, w = x1 - x0;
    if (gone) { ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(x0, y, w, 6); ctx.setLineDash([]); continue; }
    if (L0.theme === 'sky') {                                                          // 구름 다리
      ctx.fillStyle = look[1]; for (let k = 0; k <= Math.floor(w / 22); k++) { ctx.beginPath(); ctx.ellipse(x0 + k * 22 + 6, y + 8, 15, 9, 0, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = look[0]; for (let k = 0; k <= Math.floor(w / 22); k++) { ctx.beginPath(); ctx.ellipse(x0 + k * 22 + 6, y + 4, 14, 8 + (k % 2) * 2, 0, 0, 6.283); ctx.fill(); }
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x0 + 4, y + 17, w - 4, 3);
    ctx.fillStyle = look[1]; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1 - 8, y + 14); ctx.quadraticCurveTo((x0 + x1) / 2, y + 22, x0 + 8, y + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = look[0]; ctx.fillRect(x0 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x0, y - 1, w, 1.5);
    if (pl.crumble) { ctx.strokeStyle = 'rgba(20,10,0,.55)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, y); ctx.lineTo(x0 + w * 0.38, y + 6); ctx.lineTo(x0 + w * 0.3, y + 11); ctx.moveTo(x0 + w * 0.7, y + 1); ctx.lineTo(x0 + w * 0.62, y + 7); ctx.lineTo(x0 + w * 0.7, y + 12); ctx.stroke(); }
    if (pl.amp) { ctx.fillStyle = 'rgba(255,230,120,.9)'; for (const k of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.arc(x0 + w * k, y + 10, 1.8, 0, 6.283); ctx.fill(); } ctx.strokeStyle = 'rgba(255,230,120,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 6, y + 18); ctx.lineTo(x1 - 6, y + 18); ctx.stroke(); }
    if (L0.theme === 'neon') { ctx.strokeStyle = 'rgba(74,240,255,.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 1, y + 4, w - 2, 9); }
    else if (L0.theme === 'factory') { ctx.fillStyle = '#3a4656'; for (let k = x0 + 10; k < x1 - 6; k += 24) { ctx.fillRect(k, y + 6, 4, 4); } }
    else if (L0.theme === 'jungle') { ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = 2; for (let k = x0 + 14; k < x1 - 8; k += 38) { ctx.beginPath(); ctx.moveTo(k, y + 6); ctx.quadraticCurveTo(k + 3, y + 16, k - 1, y + 24); ctx.stroke(); } }
    else if (L0.theme === 'lava') { ctx.fillStyle = '#ff7a2a'; for (let k = x0 + 12; k < x1 - 8; k += 30) ctx.fillRect(k, y + 9, 8, 2); }
    else if (L0.theme === 'ice') { ctx.fillStyle = '#d4f0ff'; for (let k = x0 + 10; k < x1 - 8; k += 26) { ctx.beginPath(); ctx.moveTo(k, y + 12); ctx.lineTo(k + 4, y + 22); ctx.lineTo(k + 8, y + 12); ctx.fill(); } }
  }
}

// ---------- 코스마다 다른 적 ----------
// 몸은 (sx, y) 위 폭 16·높이 14 안에 그린다. 땅을 걷는 적은 y 가 발 밑, 날아다니는 적은 y-7 이 몸 가운데. d=가는 방향(1 오른쪽, -1 왼쪽)
const ELL = (x, y, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 6.283); ctx.fill(); };
const EYE = (x, y, r = 1.8) => { ELL(x, y, r, r, '#fff'); ELL(x + 0.4, y, r * 0.5, r * 0.5, '#111'); };
const SKIN_DRAW = {
  urchin(x, y, d, t) { ctx.strokeStyle = '#4a1a6a'; ctx.lineWidth = 1.6; for (let i = 0; i < 10; i++) { const a = i * 0.628 + Math.sin(t * 3) * 0.05; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 5, y - 7 + Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 10, y - 7 + Math.sin(a) * 10); ctx.stroke(); } ELL(x, y - 7, 6, 6, '#8a3ab8'); ELL(x - 1.5, y - 8.5, 2.5, 2.5, '#c88af0'); EYE(x + d * 2, y - 8, 1.3); },
  jelly(x, y, d, t) { const k = Math.sin(t * 6) * 1.4; ctx.fillStyle = 'rgba(255,150,210,.95)'; ctx.beginPath(); ctx.ellipse(x, y - 9, 8, 6 + k * 0.4, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff0fa'; ctx.beginPath(); ctx.ellipse(x - 2, y - 11, 3, 2, 0, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#ff90c8'; ctx.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 3, y - 9); ctx.quadraticCurveTo(x + i * 3 + Math.sin(t * 5 + i) * 3, y - 4, x + i * 3 - Math.sin(t * 5 + i) * 2, y + 1 + k); ctx.stroke(); } EYE(x + d * 2, y - 11, 1.2); },
  snail(x, y, d, t) { ELL(x - d, y - 2.5, 9, 3, '#b8d86a'); ELL(x - d * 2, y - 8, 6, 6, '#a86a32'); ctx.strokeStyle = '#6a3a14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x - d * 2, y - 8, 3.2, 0, 4.7); ctx.stroke(); ctx.strokeStyle = '#8aa83a'; ctx.beginPath(); ctx.moveTo(x + d * 6, y - 4); ctx.lineTo(x + d * 8, y - 10); ctx.moveTo(x + d * 3, y - 4); ctx.lineTo(x + d * 4, y - 10); ctx.stroke(); EYE(x + d * 8, y - 10, 1.4); EYE(x + d * 4, y - 10, 1.4); },
  scorpion(x, y, d, t) { const k = Math.sin(t * 8) * 1; ELL(x, y - 5, 7, 4, '#c8502a'); ELL(x + d * 7, y - 7 + k, 3, 3, '#e8703a'); ELL(x + d * 7, y - 3 - k, 3, 3, '#e8703a'); ctx.strokeStyle = '#c8502a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - d * 6, y - 6); ctx.quadraticCurveTo(x - d * 13, y - 10, x - d * 8, y - 16); ctx.stroke(); ELL(x - d * 8, y - 16, 1.8, 1.8, '#ffd23a'); ctx.strokeStyle = '#7a2a14'; ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 3, y - 2); ctx.lineTo(x + i * 3 + Math.sin(t * 10 + i) * 2, y); ctx.stroke(); } EYE(x + d * 3, y - 7, 1.3); },
  frog(x, y, d, t, id) { const hop = Math.abs(Math.sin(t * 5 + id)) * 5; ELL(x, y - 5 - hop, 8, 6, '#4ac85a'); ELL(x, y - 3 - hop, 5, 3, '#c8f0a0'); ELL(x + d * 4, y - 10 - hop, 3, 3, '#4ac85a'); ELL(x - d * 1, y - 10 - hop, 3, 3, '#4ac85a'); EYE(x + d * 4, y - 10 - hop, 1.6); EYE(x - d * 1, y - 10 - hop, 1.6); ctx.strokeStyle = '#2a7a34'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + d * 1, y - 4 - hop); ctx.lineTo(x + d * 8, y - 5 - hop); ctx.stroke(); },
  penguin(x, y, d, t) { const w = Math.sin(t * 9) * 1.2; ELL(x, y - 8, 6, 8, '#1a2438'); ELL(x + d * 1.5, y - 6.5, 3.6, 5.6, '#f4f8ff'); ELL(x - d * 5, y - 7 + w, 2, 5, '#1a2438', 0.4 * d); ELL(x + d * 3, y - 12, 3, 3, '#f4f8ff'); EYE(x + d * 3, y - 12.5, 1.3); poly2(x + d * 5, y - 11, x + d * 9, y - 10, x + d * 5, y - 9, '#ff9a2a'); ELL(x - 2, y - 0.8, 3, 1.6, '#ff9a2a'); ELL(x + 3, y - 0.8, 3, 1.6, '#ff9a2a'); },
  lavablob(x, y, d, t, id) { const w = Math.sin(t * 6 + id) * 1.5; ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x - 10 - w, y - 12, x, y - 13 + w); ctx.quadraticCurveTo(x + 10 + w, y - 12, x + 9, y); ctx.closePath(); ctx.fill(); ELL(x, y - 4, 6, 3.4, '#ffa030'); EYE(x - 3, y - 8, 1.6); EYE(x + 3, y - 8, 1.6); ELL(x + 6, y - 14 + Math.sin(t * 7) * 2, 1.6, 1.6, '#ffd23a'); },
  gearbot(x, y, d, t) { ctx.fillStyle = '#7a8aa0'; ctx.fillRect(x - 7, y - 11, 14, 9); ctx.fillStyle = '#4a5668'; ctx.fillRect(x - 7, y - 4, 14, 2); ELL(x - 4, y - 1.5, 2.6, 2.6, '#2a3240'); ELL(x + 4, y - 1.5, 2.6, 2.6, '#2a3240'); ELL(x + d * 3, y - 8, 2.4, 2.4, '#ff3a3a'); ctx.save(); ctx.translate(x - d * 3, y - 7); ctx.rotate(t * 5); ctx.strokeStyle = '#c8d4e4'; ctx.lineWidth = 1.6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * 1.57) * 3.4, Math.sin(i * 1.57) * 3.4); ctx.stroke(); } ctx.restore(); ctx.strokeStyle = '#7a8aa0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 15); ctx.stroke(); ELL(x, y - 15.5, 1.4, 1.4, '#ff3a3a'); },
  spiderbot(x, y, d, t) { ctx.strokeStyle = '#8a5aff'; ctx.lineWidth = 1.4; for (let i = 0; i < 4; i++) { const s = i < 2 ? -1 : 1, k = Math.sin(t * 10 + i * 1.6) * 2; ctx.beginPath(); ctx.moveTo(x + s * 3, y - 6); ctx.lineTo(x + s * (8 + (i % 2) * 2), y - 9 + k); ctx.lineTo(x + s * (9 + (i % 2) * 2), y); ctx.stroke(); } ctx.fillStyle = '#2a1a5a'; ctx.beginPath(); ctx.arc(x, y - 6, 6.5, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 6.5, y - 6, 13, 3); ELL(x + d * 2, y - 7, 2.4, 2, '#4af0ff'); ctx.fillStyle = '#4af0ff'; ctx.fillRect(x - 5, y - 4.2, 10, 1); },
  puffer(x, y, d, t) { const k = 1 + Math.sin(t * 4) * 0.06; ctx.fillStyle = '#c8d8f8'; for (let i = 0; i < 10; i++) { const a = i * 0.628; poly2(x + Math.cos(a - 0.2) * 6, y - 7 + Math.sin(a - 0.2) * 6, x + Math.cos(a) * 10 * k, y - 7 + Math.sin(a) * 10 * k, x + Math.cos(a + 0.2) * 6, y - 7 + Math.sin(a + 0.2) * 6, '#c8d8f8'); } ELL(x, y - 7, 6.5 * k, 6.5 * k, '#f4f8ff'); EYE(x + d * 2.4, y - 8, 1.7); ELL(x + d * 3, y - 4, 2, 1, '#ff8aa8'); },
  bird(x, y, d, t) { const f = Math.sin(t * 22) * 5; ELL(x, y - 7, 6, 4.4, '#4aa8ff'); ELL(x + d * 5, y - 9, 3.2, 3.2, '#4aa8ff'); poly2(x + d * 7.5, y - 9.5, x + d * 11, y - 8.5, x + d * 7.5, y - 7.5, '#ffb02a'); ELL(x - d * 1, y - 11 - f * 0.5, 5, 2, '#2a78d8', -0.4 * d); EYE(x + d * 5, y - 9.6, 1.3); poly2(x - d * 5, y - 8, x - d * 11, y - 10, x - d * 6, y - 5, '#2a78d8'); },
  vulture(x, y, d, t) { const f = Math.sin(t * 14) * 6; ELL(x, y - 7, 6, 4, '#5a3a22'); ELL(x + d * 5, y - 8.5, 2.8, 2.8, '#e8a888'); poly2(x + d * 7, y - 9, x + d * 10, y - 7.4, x + d * 7, y - 7, '#d8a030'); ELL(x - d * 2, y - 8 - f, 9, 2.2, '#3a2412', -0.3 * d + f * 0.05); ELL(x + d * 1, y - 8 + f * 0.2, 7, 2, '#3a2412', 0.3 * d); EYE(x + d * 5.6, y - 9, 1.1); },
  parrot(x, y, d, t) { const f = Math.sin(t * 18) * 4; ELL(x, y - 7, 5.4, 4, '#e83a3a'); ELL(x + d * 4.6, y - 9, 3.4, 3.2, '#e83a3a'); poly2(x + d * 7, y - 9.6, x + d * 10, y - 8, x + d * 7, y - 7, '#ffd23a'); ELL(x - d * 1, y - 10 - f * 0.4, 5, 2.4, '#3ac84a', -0.4 * d); poly2(x - d * 5, y - 7, x - d * 12, y - 4, x - d * 6, y - 5, '#2a8ae8'); EYE(x + d * 5, y - 9.6, 1.2); },
  snowbat(x, y, d, t) { const f = Math.sin(t * 20) * 5; ctx.fillStyle = '#9ad0f0'; poly2(x - 2, y - 7, x - 11, y - 12 - f, x - 8, y - 5, '#9ad0f0'); poly2(x + 2, y - 7, x + 11, y - 12 - f, x + 8, y - 5, '#9ad0f0'); ELL(x, y - 7, 4, 4.6, '#eaf6ff'); poly2(x - 3, y - 11, x - 2, y - 15, x - 0.5, y - 11, '#eaf6ff'); poly2(x + 3, y - 11, x + 2, y - 15, x + 0.5, y - 11, '#eaf6ff'); EYE(x - 1.6, y - 8, 1.2); EYE(x + 1.6, y - 8, 1.2); },
  ember(x, y, d, t) { const k = Math.sin(t * 16) * 1.4; ctx.fillStyle = 'rgba(255,240,160,.28)'; ctx.beginPath(); ctx.arc(x, y - 7, 13, 0, 6.283); ctx.fill();                       // 어두운 용암 배경에서 눈에 띄게: 연한 빛무리 + 어두운 테두리 + 밝은 속
    poly2(x - d * 3, y - 7, x - d * 17, y - 7 + k * 1.2, x - d * 3, y - 1, '#2a0810'); poly2(x - d * 3, y - 7, x - d * 13, y - 12 - k, x - d * 2, y - 13, '#2a0810');
    poly2(x - d * 4, y - 7, x - d * 14, y - 7 + k, x - d * 4, y - 3, '#ffd23a'); poly2(x - d * 4, y - 7, x - d * 11, y - 9 - k, x - d * 3, y - 10, '#fff0a0');
    ELL(x, y - 7, 8.4, 7.8, '#2a0810'); ELL(x, y - 7, 6.8, 6.2, '#ff5a1a'); ELL(x + d * 0.5, y - 7, 5, 4.6, '#fff0a0'); EYE(x + d * 2, y - 8, 1.5); },
  drone(x, y, d, t) { ELL(x, y - 7, 6.5, 3.6, '#7a8aa0'); ELL(x, y - 6, 4, 2, '#4a5668'); ctx.strokeStyle = 'rgba(200,214,230,.8)'; ctx.lineWidth = 1.6; const f = Math.sin(t * 40) * 9; ctx.beginPath(); ctx.moveTo(x - 9 - f * 0.2, y - 11); ctx.lineTo(x + 9 + f * 0.2, y - 11); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 11); ctx.stroke(); ELL(x, y - 5, 1.8, 1.8, (Math.floor(t * 4) % 2) ? '#ff3a3a' : '#7a1a1a'); },
  ufo(x, y, d, t) { ELL(x, y - 6, 9, 3.6, '#7a4aff'); ctx.fillStyle = '#4af0ff'; ctx.beginPath(); ctx.arc(x, y - 8, 4.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#ffd23a'; for (let i = -1; i <= 1; i++) ELL(x + i * 5, y - 5.6, 1.1, 1.1, (Math.floor(t * 6 + i) % 2) ? '#ffd23a' : '#ff8a3a'); ctx.fillStyle = 'rgba(74,240,255,.18)'; poly2(x - 3, y - 3, x - 8, y + 4, x + 8, y + 4, 'rgba(74,240,255,.18)'); poly2(x - 3, y - 3, x + 3, y - 3, x + 8, y + 4, 'rgba(74,240,255,.18)'); },
  kite(x, y, d, t) { const f = Math.sin(t * 10) * 3; poly2(x - d * 11, y - 9 - f, x + d * 6, y - 8, x - d * 4, y - 3 + f, '#ffe8a0'); poly2(x - d * 6, y - 8, x + d * 9, y - 8, x, y - 3, '#ffd060'); ELL(x + d * 7, y - 8.4, 3, 2.6, '#fff4cc'); poly2(x + d * 9, y - 9, x + d * 14, y - 7.6, x + d * 9, y - 6.6, '#ff8a3a'); EYE(x + d * 7.6, y - 9, 1); poly2(x - d * 5, y - 6, x - d * 13, y - 3, x - d * 5, y - 4, '#e8b840'); },
};
function poly2(x0, y0, x1, y1, x2, y2, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.fill(); }
// 적·위험물에 테두리를 둘러 배경과 구분한다: 밝은 배경에서는 어두운 테두리, 어두운 배경에서는 흰 테두리 (그림자를 네 방향으로 밀어 그려 윤곽선을 만든다)
const OUTLINE = { special: '#f0e8ff', grass: '#1a1030', desert: '#1a1030', jungle: '#10201a', ice: '#14143a', sky: '#1a1030', lava: '#fff4c8', factory: '#f0f6ff', neon: '#e8ffff', water: '#f0ffff' };
function drawEnemy(e) {
  const sx = e.x - camX; if (sx < -20 || sx > VW + 20) return;
  const oc = OUTLINE[G.level.theme] || '#1a1030';
  ctx.save(); ctx.shadowColor = oc; ctx.shadowBlur = 0;
  for (const [ox, oy] of [[1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8], [1.3, 1.3], [-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3]]) { ctx.shadowOffsetX = ox * K; ctx.shadowOffsetY = oy * K; drawEnemyRaw(e); }
  ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; drawEnemyRaw(e); ctx.restore();
}
function drawEnemyRaw(e) {
  const sx = e.x - camX; if (sx < -20 || sx > VW + 20) return;
  if (e.type === 'flame') {                                                          // 용암에서 솟는 불꽃
    const wob = Math.sin(clock * 20 + e.id) * 1.5, y = e.y; ctx.fillStyle = '#ff5a10'; ctx.beginPath(); ctx.moveTo(sx - 7, y); ctx.quadraticCurveTo(sx - 8 + wob, y - 14, sx + wob, y - 26); ctx.quadraticCurveTo(sx + 8 + wob, y - 14, sx + 7, y); ctx.fill();
    ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.moveTo(sx - 4, y); ctx.quadraticCurveTo(sx - 4, y - 9, sx + wob, y - 17); ctx.quadraticCurveTo(sx + 4, y - 9, sx + 4, y); ctx.fill(); ctx.fillStyle = '#fff0a0'; ctx.fillRect(sx - 1.5, y - 6, 3, 5); return;
  }
  if (e.type === 'drop') {                                                             // 떨어지는 위험물: 경고 그림자 → 쿵 → 올라감
    const ph = (G.t + e.id * 37) % 150, base = e.base, down = ph >= 50 && ph < 112;
    if (ph < 58) { const k = ph / 50, flick = ph > 25 && Math.floor(ph / 4) % 2 === 0; ctx.fillStyle = flick ? `rgba(255,60,40,${0.25 + 0.45 * Math.min(1, k)})` : `rgba(0,0,0,${0.2 + 0.3 * Math.min(1, k)})`; ctx.beginPath(); ctx.ellipse(sx, base + 1, 5 + 9 * Math.min(1, k), 2 + 2 * Math.min(1, k), 0, 0, 6.283); ctx.fill(); }
    const y = e.y;
    if (e.skin === 'piston') { ctx.fillStyle = '#6a7a8e'; ctx.fillRect(sx - 4, y - 260, 8, 260 - 6); ctx.fillStyle = '#4a5668'; ctx.fillRect(sx - 4, y - 260, 2, 254); ctx.fillStyle = '#9aa8bc'; ctx.fillRect(sx - 10, y - 8, 20, 8); ctx.fillStyle = '#ffd23a'; for (let k = -8; k < 8; k += 8) ctx.fillRect(sx + k, y - 4, 4, 4); }
    else if (down && e.skin === 'boulder') { ELL(sx, y - 9, 9.5, 9, '#8a6a4a'); ELL(sx - 2, y - 11, 4, 3, '#a8885e'); ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx + 1, y - 17); ctx.lineTo(sx + 4, y - 9); ctx.lineTo(sx, y - 3); ctx.stroke(); }
    else if (down && e.skin === 'icicle') { poly2(sx - 6, y - 24, sx + 6, y - 24, sx, y, '#bfe8ff'); poly2(sx - 6, y - 24, sx - 1, y - 24, sx, y, '#eaf8ff'); ctx.strokeStyle = '#7ab8e0'; ctx.lineWidth = 1; ctx.strokeRect(sx - 7, y - 26, 14, 3); }
    else if (down && e.skin === 'meteor') { poly2(sx - 8, y - 9, sx + 8, y - 9, sx, y - 46, 'rgba(255,140,40,.7)'); ELL(sx, y - 9, 9, 9, '#ff5a1a'); ELL(sx, y - 9, 5.5, 5.5, '#ffd060'); }
    return;
  }
  if (e.skin && SKIN_DRAW[e.skin]) { SKIN_DRAW[e.skin](sx, e.y, e.dir > 0 ? 1 : -1, clock, e.id); return; }
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
  if (p.shield) {
    const kind = p.shType || 'basic', C = { basic: ['120,200,255', 'rgba(120,200,255,.85)'], fire: ['255,130,40', 'rgba(255,150,60,.95)'], aqua: ['60,170,255', 'rgba(150,225,255,.95)'], thunder: ['255,225,60', 'rgba(255,235,90,.95)'] }[kind] || ['120,200,255', 'rgba(120,200,255,.85)'];
    ctx.strokeStyle = C[1]; ctx.fillStyle = `rgba(${C[0]},.2)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, p.y - 13, 17 + Math.sin(clock * 8), 0, 6.283); ctx.fill(); ctx.stroke();
    if (kind === 'fire') { ctx.fillStyle = 'rgba(255,200,80,.9)'; for (let i = 0; i < 5; i++) { const a = clock * 5 + i * 1.256; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 17, p.y - 13 + Math.sin(a) * 17, 2.6, 0, 6.283); ctx.fill(); } }
    else if (kind === 'thunder') { ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = clock * 9 + i * 2.1, r = 17; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * r, p.y - 13 + Math.sin(a) * r); ctx.lineTo(sx + Math.cos(a + 0.2) * (r + 5), p.y - 13 + Math.sin(a + 0.2) * (r + 5)); ctx.lineTo(sx + Math.cos(a + 0.35) * (r - 1), p.y - 13 + Math.sin(a + 0.35) * (r - 1)); ctx.stroke(); } }
    else if (kind === 'aqua') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(sx - 7, p.y - 21, 3.5, 2, -0.6, 0, 6.283); ctx.fill(); }
  }
  if (p.invinc > 0 && (p.invinc > 120 || Math.floor(p.invinc / 6) % 2)) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const a = clock * 6 + i * 1.57; ctx.fillRect(sx + Math.cos(a) * 15 - 1.5, p.y - 13 + Math.sin(a) * 15 - 1.5, 3, 3); } }
  if (p.shoes > 0 && Math.abs(p.ground ? p.gsp : p.vx) > 4) { ctx.strokeStyle = 'rgba(255,120,70,.6)'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sx - face * (10 + i * 6), p.y - 3 - i); ctx.lineTo(sx - face * (22 + i * 6), p.y - 3 - i); ctx.stroke(); } }
}
function drawHud() {
  ctx.font = '900 11px -apple-system, sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
  const t = (s, x, y, c = '#fff', a = 'left') => { ctx.textAlign = a; ctx.fillStyle = c; ctx.strokeText(s, x, y); ctx.fillText(s, x, y); };
  t(`SCORE ${G.score}`, 8, 6); t(`TIME ${Math.floor(G.t / 3600)}:${String(Math.floor(G.t / 60) % 60).padStart(2, '0')}`, 8, 20);
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(14, 41, 4, 5.5, 0, 0, 6.283); ctx.stroke(); t(`× ${G.rings}`, 22, 35, G.rings === 0 ? '#ff7a7a' : '#ffd23a');
  t(`🐿 × ${Math.max(0, G.lives)}`, 8, 50); if (G.p.shoes > 0) t(`»${Math.ceil(G.p.shoes / 60)}`, 8, 64, '#ff9a6a'); if (G.p.invinc > 0) t(`★${Math.ceil(G.p.invinc / 60)}`, G.p.shoes > 0 ? 40 : 8, 64, '#fff'); if (G.p.magnet > 0) t(`U${Math.ceil(G.p.magnet / 60)}`, (G.p.shoes > 0 ? 32 : 0) + (G.p.invinc > 0 ? 32 : 0) + 8, 64, '#ff7a8a'); if (TUT) t('연습', VW / 2, 6, '#ffe27a', 'center');
  if (G.sp) {                                                                         // 특별 스테이지: 링 수와 남은 시간
    const need = L.SPECIAL_NEED, k = Math.min(1, G.rings / need), tl = Math.max(0, G.sp.left / L.SPECIAL_TIME);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(VW / 2 - 50, 6, 100, 18); ctx.fillStyle = k >= 1 ? '#ffd23a' : '#9a7aff'; ctx.fillRect(VW / 2 - 48, 8, 96 * k, 6); ctx.fillStyle = tl < 0.25 ? '#ff5a5a' : '#6ad0ff'; ctx.fillRect(VW / 2 - 48, 17, 96 * tl, 4);
    t(`SPECIAL ${G.rings}/${need}`, VW / 2, 26, k >= 1 ? '#ffe27a' : '#fff', 'center');
  }
  if (G.emeralds > 0) { for (let k = 0; k < G.emeralds; k++) { ctx.fillStyle = ['#ff4a5a', '#4aa0ff', '#4aff8a', '#ffe24a', '#c84aff', '#4affee', '#ffffff'][k % 7]; ctx.beginPath(); ctx.moveTo(14 + k * 11, 78); ctx.lineTo(19 + k * 11, 82); ctx.lineTo(14 + k * 11, 88); ctx.lineTo(9 + k * 11, 82); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke(); } }
  if (banner2 && banner2.t < 120) { banner2.t++; const a = banner2.t < 12 ? banner2.t / 12 : banner2.t > 90 ? (120 - banner2.t) / 30 : 1; ctx.globalAlpha = a; ctx.fillStyle = 'rgba(20,10,60,.7)'; ctx.fillRect(0, 62, VW, 40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 18px -apple-system, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = '#ffe27a'; ctx.strokeText(banner2.text, VW / 2, 77); ctx.fillText(banner2.text, VW / 2, 77); ctx.font = '800 10px -apple-system, sans-serif'; ctx.lineWidth = 3; ctx.fillStyle = '#fff'; ctx.strokeText(banner2.sub, VW / 2, 93); ctx.fillText(banner2.sub, VW / 2, 93); ctx.globalAlpha = 1; ctx.textBaseline = 'top'; }
  if (G.level.waterY != null && !G.p.dead) {                                         // 숨: 물속에서만 보인다. 5초 남으면 큰 숫자
    const a = G.p.air / L.AIR_MAX, under = G.p.air < L.AIR_MAX, aq = G.p.shield && G.p.shType === 'aqua';
    if (under || aq) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VW / 2 - 32, 6, 64, 8); ctx.fillStyle = aq ? '#9ad8ff' : a < 0.25 ? (Math.floor(clock * 6) % 2 ? '#ff5a5a' : '#ffd0d0') : '#6ad0ff'; ctx.fillRect(VW / 2 - 31, 7, 62 * (aq ? 1 : a), 6); t(aq ? '물 방패' : 'AIR', VW / 2, 16, '#fff', 'center'); }
    if (G.p.air <= 300 && G.p.air > 0 && !aq) { ctx.font = '900 26px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#ff5a5a'; const n = String(Math.ceil(G.p.air / 60)), py = G.p.y - camY - 52; ctx.strokeText(n, G.p.x - camX, py); ctx.fillText(n, G.p.x - camX, py); ctx.font = '900 11px -apple-system, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; }
  }
  if (G.bossOn && G.boss && G.boss.ph !== 'dead') { const bx = VW / 2 - 50; t('BOSS', VW / 2, 6 + (G.level.waterY != null && G.p.air < L.AIR_MAX ? 16 : 0), '#ff8a8a', 'center'); const by = 20 + (G.level.waterY != null && G.p.air < L.AIR_MAX ? 16 : 0); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 2, by - 2, 104, 10); for (let k = 0; k < G.boss.max; k++) { ctx.fillStyle = k < G.boss.hp ? '#ff4a5a' : 'rgba(255,255,255,.18)'; ctx.fillRect(bx + k * (100 / G.boss.max) + 1, by, 100 / G.boss.max - 2, 6); } }
  const sp = Math.abs(G.p.ground ? G.p.gsp : G.p.vx); t(`${Math.round(sp * 60)} px/s`, VW / 2, VH - 14, sp > 7 ? '#ffe27a' : '#fff', 'center');
}
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (!G) { ctx.fillStyle = '#0a1420'; ctx.fillRect(0, 0, VW, VH); return; }
  const th = THEMES[G.level.theme], sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0; if (shake > 0) shake *= 0.85; if (shake < 0.3) shake = 0;
  ctx.save(); ctx.translate(sx, sy);
  drawBackground(th);
  ctx.save(); ctx.translate(0, -camY);                                                 // 세계(땅·장치·적·캐릭터·효과)는 세로 카메라만큼 움직인다
  drawTerrain(th); drawObjects(); drawGimmicks(); drawRings();
  for (const e of G.enemies) if (e.alive || false) drawEnemy(e);
  for (let i = trail.length - 1; i >= 0; i--) { const q = trail[i]; q.t++; if (q.t > 9) { trail.splice(i, 1); continue; } ctx.globalAlpha = 0.32 * (1 - q.t / 9); ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); if (q.spin) ctx.arc(q.x - camX, q.y - 9, 9, 0, 6.283); else ctx.ellipse(q.x - camX, q.y - 13, 7, 11, 0, 0, 6.283); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (G.phase !== 'dying' || G.p.y < VH + 60) drawPlayer();
  drawWater();
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
  for (const c of G.level.cannons) if (Math.abs(c.x - G.p.x) < 520 && (((G.t - c.ph) % c.per) + c.per) % c.per === 0) { sfx.shot(); burst(c.x - 24, c.gy - 22, '#ffb060', 6, 1.8); }
  const p = G.p;
  if (G.phase === 'play' && !p.dead) {                                                // 착지 먼지·찌그러짐, 달릴 때 먼지, 빠를 때 잔상
    const sp = Math.abs(p.ground ? p.gsp : p.vx);
    if (p.ground && !pg && pvy > 2.2) { dust(p.x, p.y, 6, 1.8); squash = 8; }
    if (p.ground && sp > 3.5 && (++runT) % 4 === 0) dust(p.x - (p.face || 1) * 8, p.y, 1, 0.5);
    if (sp > 8.5 || p.dashRoll) trail.push({ x: p.x, y: p.y, spin: L.isSpin(p) || !!p.loop, face: p.face || 1, t: 0 });
  }
  if (G.level.waterY != null && p.y > G.level.waterY && G.phase === 'play' && Math.random() < 0.06) fx.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 24, vx: 0, vy: -1.6, t: 0, life: 36, color: '#d8f4ff' });
  if (G.boss && G.boss.ph === 'dead' && G.boss.t % 6 === 0 && G.boss.t < 110) burst(G.boss.x + (Math.random() - 0.5) * 40, G.boss.y + (Math.random() - 0.5) * 20, ['#ffd23a', '#ff6a3a', '#fff'][Math.floor(Math.random() * 3)], 8, 2.6);
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
