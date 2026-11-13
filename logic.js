'use strict';
// 번개 다람쥐: 소닉 풍 고속 러너 규칙 (DOM 없음). 1/60초 한 칸씩 step() 으로 진행하고, 같은 코스·같은 입력이면 늘 같은 결과다.
// 움직임 값은 원작 소닉의 알려진 값(프레임당 픽셀)을 바탕으로 했다. 좌표는 픽셀, 위쪽이 y=0, 캐릭터 위치(x, y)는 발바닥이다.
const LOGIC_SP = (() => {
  const VW = 320, VH = 200;                                   // 화면에 보이는 크기
  const ACC = 0.046875, DEC = 0.5, FRC = 0.046875, TOP = 6;   // 가속·브레이크·마찰·달리기 최고 속도(px/프레임)
  const ROLL_FRC = 0.0234, ROLL_DEC = 0.125, ROLL_UP = 0.078, ROLL_DOWN = 0.3125, SLOPE = 0.125;
  const AIR_ACC = 0.09375, GRAV = 0.21875, JUMP = 6.5, JUMP_CUT = 4, MAX_FALL = 16, MAX_GSP = 16;
  const SPRING_V = 10, PAD_V = 10, HURT_VX = 2, HURT_VY = -4, INVULN = 120;
  const GROUND_REF = 150, Y_MIN = 78, Y_MAX = 168;            // 코스 땅 높이의 기준과 한계
  const PIT_LIMIT = 110;                                      // 구멍 폭 최대 (느리게 달려도 점프로 넘는다)
  const RING_R = 13, ENEMY_POINTS = 100, RING_POINTS = 10, START_LIVES = 3;
  const TIME_PAR = [75, 90, 105, 120];                          // 이 시간(초) 안에 끝내면 시간 보너스
  const ZONES = [
    { name: '초원 언덕', theme: 'grass', len: 16000, pit: 0.10, enemy: 0.30, spike: 0.00, hill: 46 },
    { name: '모래 협곡', theme: 'desert', len: 18500, pit: 0.16, enemy: 0.38, spike: 0.08, hill: 54 },
    { name: '얼음 능선', theme: 'ice', len: 21000, pit: 0.20, enemy: 0.44, spike: 0.12, hill: 62 },
    { name: '번개 공장', theme: 'factory', len: 24000, pit: 0.24, enemy: 0.50, spike: 0.18, hill: 66 },
  ];

  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (st, e) => { st.events.push(e); };

  // ---------- 코스 만들기 ----------
  // 땅은 높이 표(1픽셀마다 한 칸)로 둔다. 구멍은 Infinity. 언덕은 키 점 사이를 부드럽게 이어서 경사가 0.65(약 33도)를 넘지 않게 한다.
  function buildLevel(zone, seed) {
    const Z = ZONES[zone], rnd = rng(seed * 977 + zone * 31 + 7), len = Z.len;
    const H = new Float32Array(len + 1).fill(Infinity);
    const L = { zone, name: Z.name, theme: Z.theme, len, H, rings: [], enemies: [], springs: [], pads: [], spikes: [], checks: [], goalX: len - 260 };
    let x = 0, y = GROUND_REF;
    const smooth = (x0, y0, x1, y1) => { for (let i = x0; i <= x1 && i <= len; i++) { const t = (i - x0) / Math.max(1, x1 - x0), s = t * t * (3 - 2 * t); H[i] = y0 + (y1 - y0) * s; } };
    const flat = (n) => { smooth(x, y, x + n, y); const a = x; x += n; return [a, x]; };
    const ringsLine = (a, b, step = 28, up = 22) => { for (let i = a + 20; i < b - 10; i += step) L.rings.push({ x: i, y: H[Math.floor(i)] - up }); };
    const slopeTo = (dy) => { const ny = clamp(y + dy, Y_MIN, Y_MAX), d = Math.max(130, Math.round(Math.abs(ny - y) * 2.7)); smooth(x, y, x + d, ny); const a = x; x += d; y = ny; return [a, x]; };
    flat(420);
    for (let i = 150; i <= 390; i += 40) L.rings.push({ x: i, y: GROUND_REF - 22 });                  // 처음 평지에 링 몇 개(처음 해 보는 사람이 링을 먹어 볼 수 있게)
    let nextCheck = 1;
    while (x < len - 700) {
      const r = rnd();
      if (L.checks.length < 2 && x > len * nextCheck / 3) { const [a, b] = flat(160); L.checks.push({ x: a + 80 }); nextCheck++; continue; }
      if (r < Z.pit) {                                           // 구멍: 앞은 평평하게, 구멍 위에 링 곡선
        const [, b] = flat(120 + Math.floor(rnd() * 80)), w = 70 + Math.floor(rnd() * (PIT_LIMIT - 70));
        for (let k = 0; k < 7; k++) L.rings.push({ x: b + 8 + k * (w / 6), y: y - 24 - Math.sin(k / 6 * Math.PI) * 38 });
        x += w; smooth(x, y, x + 140, y); const a = x; x += 140; ringsLine(a, x);
      } else if (r < Z.pit + 0.14) {                              // 점프대: 오르막 끝이 갑자기 끊기고 아래에 땅
        const [a, b] = slopeTo(-Math.min(46, y - Y_MIN));
        if (b - a > 20) { const w = 60 + Math.floor(rnd() * 40); for (let k = 0; k < 6; k++) L.rings.push({ x: b + 10 + k * (w / 5), y: y - 40 - Math.sin(k / 5 * Math.PI) * 30 }); const drop = Math.min(30, Y_MAX - y); x += w; y += drop; smooth(x, y, x + 160, y); const c = x; x += 160; ringsLine(c, x); }
      } else if (r < Z.pit + 0.14 + Z.enemy) {                    // 적 구간
        const [a, b] = flat(300 + Math.floor(rnd() * 120)); ringsLine(a, b);
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) { const ex = a + 70 + k * ((b - a - 140) / Math.max(1, n - 1)); const fly = rnd() < 0.35; L.enemies.push({ type: fly ? 'bee' : 'crab', x: ex, y: fly ? H[Math.floor(ex)] - 34 : H[Math.floor(ex)], home: ex, range: 60 }); }
      } else if (r < Z.pit + 0.14 + Z.enemy + Z.spike) {          // 가시 구간
        const [a, b] = flat(220); for (let k = 0; k < 3; k++) L.spikes.push({ x: a + 80 + k * 16 }); ringsLine(a, b, 32, 40);
      } else if (r < Z.pit + 0.14 + Z.enemy + Z.spike + 0.12) {   // 스프링과 높은 길
        const [a, b] = flat(240); L.springs.push({ x: a + 90 }); for (let k = 0; k < 5; k++) L.rings.push({ x: a + 90 + 10 + k * 18, y: y - 90 - Math.sin(k / 4 * Math.PI) * 24 });
      } else if (r < Z.pit + 0.14 + Z.enemy + Z.spike + 0.22) {   // 가속 판과 긴 내리막
        const [a, b] = flat(160); L.pads.push({ x: a + 70, dir: 1 }); const [c, d] = slopeTo(Math.min(Z.hill, Y_MAX - y)); ringsLine(c, d, 26, 18);
      } else {                                                    // 언덕: 올랐다 내려오기
        const up = Math.min(Z.hill, y - Y_MIN); if (up > 24) { const [a, b] = slopeTo(-up); ringsLine(a, b, 26, 18); slopeTo(up); } else flat(200);
      }
      if (y < Y_MIN + 5 || y > Y_MAX - 5) slopeTo(GROUND_REF - y);
    }
    smooth(x, y, x + 220, GROUND_REF); x += 220; y = GROUND_REF; smooth(x, y, len, y);          // 끝은 부드럽게 내려와 평평하게
    L.rings = L.rings.filter((q) => q.x < len - 300);
    return L;
  }

  // ---------- 땅 ----------
  const groundY = (L, x) => { const i = Math.floor(x); return i < 0 ? L.H[0] : i > L.len ? L.H[L.len] : L.H[i]; };
  // 땅이 오른쪽으로 올라가면 +. 낭떠러지 가장자리에서는 값이 튀지 않게 한계를 둔다
  function angleAt(L, x) {
    const a = groundY(L, x - 6), b = groundY(L, x + 6);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return clamp(Math.atan2(a - b, 12), -0.75, 0.75);
  }

  // ---------- 새 판 ----------
  function newGame(opts = {}) {
    const zone = clamp(opts.zone | 0, 0, ZONES.length - 1), level = buildLevel(zone, opts.seed == null ? 1 : opts.seed);
    const st = {
      zone, level, lives: opts.lives || START_LIVES, score: opts.score | 0, rings: 0, ringsTotal: 0, t: 0, events: [], phase: 'play', tutorial: !!opts.tutorial,
      checkX: 60, deaths: 0, kills: 0, spring: 0, maxSpeed: 0,
      enemies: [], clearT: 0, dyingT: 0, scatter: [], got: new Set(),
    };
    st.enemies = level.enemies.map((e, i) => ({ id: i, type: e.type, x: e.x, y: e.y, home: e.home, range: e.range, dir: i % 2 ? 1 : -1, alive: true, vy: 0 }));
    if (st.tutorial) st.enemies.unshift({ id: 900, type: 'crab', x: 640, y: groundY(level, 640), home: 640, range: 40, dir: 1, alive: true, vy: 0 });      // 연습: 처음에 게 한 마리
    spawn(st, 60);
    return st;
  }
  function spawn(st, x) {
    const L = st.level;
    st.p = { x, y: groundY(L, x), vx: 0, vy: 0, gsp: 0, ground: true, spin: false, roll: false, face: 1, inv: 60, dead: false, jumping: false, jumpHeld: false, hurt: 0, moved: false };
  }

  const isSpin = (p) => p.roll || (!p.ground && p.jumping);

  // ---------- 한 걸음 ----------
  function step(st, input = {}) {
    st.events = [];
    if (st.phase === 'over') return;
    const L = st.level, p = st.p;
    if (st.phase === 'dying') {
      p.vy = Math.min(MAX_FALL, p.vy + GRAV); p.y += p.vy; st.dyingT--;
      if (st.dyingT <= 0) {
        if (st.lives <= 0) { st.phase = 'over'; emit(st, { t: 'over' }); } else { spawn(st, st.checkX); st.phase = 'play'; st.rings = 0; emit(st, { t: 'respawn' }); }
      }
      return;
    }
    if (st.phase === 'clear') { st.clearT++; p.gsp *= 0.97; p.x += p.gsp; p.y = groundY(L, p.x); return; }
    st.t++;
    if (p.inv > 0) p.inv--;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (p.ground) stepGround(st, input, dir); else stepAir(st, input, dir);
    p.jumpHeld = !!input.jumpHeld || !!input.jump;
    st.maxSpeed = Math.max(st.maxSpeed, Math.abs(p.ground ? p.gsp : p.vx));
    if (!p.moved && Math.abs(p.gsp) > 0.5) { p.moved = true; emit(st, { t: 'move' }); }
    stepScatter(st);
    stepEnemies(st);
    objects(st);
    if (p.y > VH + 120 && st.phase === 'play') die(st, 'pit');
    if (st.phase === 'play' && p.x >= L.goalX) clearLevel(st);
  }

  function stepGround(st, input, dir) {
    const L = st.level, p = st.p;
    const ang = angleAt(L, p.x), sn = Math.sin(ang), cs = Math.cos(ang);
    // 굴러가기(↓): 달리다 아래를 누르면 몸을 말아 굴러간다. 느려지면 풀린다
    if (input.down && Math.abs(p.gsp) >= 1 && !p.roll) { p.roll = true; emit(st, { t: 'roll' }); }
    if (p.roll && (Math.abs(p.gsp) < 0.5 || !input.down)) p.roll = false;                         // ↓ 를 누르고 있는 동안만 구른다(떼면 속도는 그대로 달리기로)
    if (!p.roll) {
      if (dir) {
        if (p.gsp * dir < 0) { p.gsp += dir * DEC; if (p.gsp * dir > 0) p.gsp = dir * 0.5; }               // 반대로 꺾으면 브레이크
        else if (Math.abs(p.gsp) < TOP) p.gsp = clamp(p.gsp + dir * ACC, -TOP, TOP);
        p.face = dir;
      } else p.gsp = Math.abs(p.gsp) <= FRC ? 0 : p.gsp - Math.sign(p.gsp) * FRC;
      p.gsp -= SLOPE * sn;                                                                                // 경사: 오르막은 느려지고 내리막은 빨라진다
    } else {
      if (dir && p.gsp * dir < 0) p.gsp += dir * ROLL_DEC;
      p.gsp = Math.abs(p.gsp) <= ROLL_FRC ? 0 : p.gsp - Math.sign(p.gsp) * ROLL_FRC;
      p.gsp -= (Math.sign(p.gsp) === Math.sign(sn) ? ROLL_UP : ROLL_DOWN) * sn;
      if (p.gsp) p.face = Math.sign(p.gsp);
    }
    p.gsp = clamp(p.gsp, -MAX_GSP, MAX_GSP);
    // 점프
    if (input.jump) {
      p.vx = p.gsp * cs - JUMP * sn; p.vy = -p.gsp * sn - JUMP * cs;
      p.ground = false; p.jumping = true; p.roll = false; emit(st, { t: 'jump' }); return;
    }
    // 땅을 따라 간다. 땅이 갑자기 사라지거나 크게 낮아지면(점프대·낭떠러지) 속도를 그대로 가진 채 날아간다
    const nx = p.x + p.gsp * cs, gy = groundY(L, nx);
    if (!Number.isFinite(gy) || gy - p.y > 6 + Math.abs(p.gsp) * Math.abs(Math.tan(ang)) + 3) {
      p.x = nx; p.vx = p.gsp * cs; p.vy = -p.gsp * sn; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'air' }); return;
    }
    p.x = nx; p.y = gy;
    if (p.x < 8) { p.x = 8; p.gsp = Math.max(0, p.gsp); }
  }

  function stepAir(st, input, dir) {
    const L = st.level, p = st.p;
    if (dir) { if (dir * p.vx < TOP) p.vx = clamp(p.vx + dir * AIR_ACC, -Math.max(TOP, Math.abs(p.vx)), Math.max(TOP, Math.abs(p.vx))); p.face = dir; }
    if (p.vy < 0 && p.vy > -4) p.vx *= 0.96875;
    if (p.jumping && p.vy < -JUMP_CUT && !(input.jumpHeld || input.jump)) p.vy = -JUMP_CUT;      // 버튼을 일찍 떼면 낮은 점프
    p.vy = Math.min(MAX_FALL, p.vy + GRAV);
    const ox = p.x, oy = p.y;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 8) { p.x = 8; p.vx = Math.max(0, p.vx); }
    const gy = groundY(L, p.x);
    if (Number.isFinite(gy) && p.y >= gy && p.vy >= 0 && oy <= gy + 8) {          // 착지 (절벽 아래쪽 벽에는 못 올라간다)
      p.y = gy; p.ground = true;
      const ang = angleAt(L, p.x), sn = Math.sin(ang), cs = Math.cos(ang);
      p.gsp = clamp(p.vx * cs - p.vy * sn, -MAX_GSP, MAX_GSP);
      p.jumping = false; p.roll = !!input.down && Math.abs(p.gsp) >= 1; p.vy = 0; p.hurt = 0;
      emit(st, { t: 'land' });
    }
  }

  // ---------- 링·적·장치 ----------
  const pbox = (p) => { const h = isSpin(p) ? 16 : 24; return { x: p.x - 7, y: p.y - h, w: 14, h }; };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function stepScatter(st) {
    const p = st.p;
    for (const s of st.scatter) { s.vy += 0.15; s.x += s.vx; s.y += s.vy; s.life--; const gy = groundY(st.level, s.x); if (s.y > gy && s.vy > 0) { s.y = gy; s.vy *= -0.6; } if (s.life < 240 && Math.hypot(s.x - p.x, s.y - (p.y - 12)) < RING_R && p.inv < 100) { s.life = 0; st.rings++; emit(st, { t: 'ring' }); } }
    st.scatter = st.scatter.filter((s) => s.life > 0);
  }
  function stepEnemies(st) {
    const L = st.level, p = st.p;
    for (const e of st.enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x - p.x) > 400) continue;
      if (e.type === 'crab') { e.x += e.dir * 0.5; if (Math.abs(e.x - e.home) > e.range) e.dir = -e.dir; e.y = groundY(L, e.x); }
      else { e.x += e.dir * 0.8; if (Math.abs(e.x - e.home) > e.range * 1.4) e.dir = -e.dir; e.y = groundY(L, e.home) - 34 + Math.sin(st.t / 20 + e.id) * 8; }
      const eb = { x: e.x - 8, y: e.y - 14, w: 16, h: 14 };
      if (p.dead || !overlap(pbox(p), eb)) continue;
      if (isSpin(p)) { e.alive = false; st.kills++; st.score += ENEMY_POINTS; emit(st, { t: 'kill', x: e.x, y: e.y }); if (!p.ground) p.vy = p.vy > 0 ? -4 : p.vy + 1; }
      else hurt(st, e.x);
    }
  }
  function objects(st) {
    const L = st.level, p = st.p, bx = pbox(p);
    for (let i = 0; i < L.rings.length; i++) {
      const r = L.rings[i]; if (st.got.has(i)) continue;
      if (Math.abs(r.x - p.x) < RING_R + 7 && Math.abs(r.y - (p.y - 12)) < RING_R + 7 && Math.hypot(r.x - p.x, r.y - (p.y - 12)) < RING_R + 5) { st.got.add(i); st.rings++; st.ringsTotal++; st.score += RING_POINTS; emit(st, { t: 'ring' }); }
    }
    for (const s of L.springs) if (Math.abs(s.x - p.x) < 12 && p.y > groundY(L, s.x) - 10 && p.y <= groundY(L, s.x) + 6 && (p.vy >= 0 || p.ground)) { p.vy = -SPRING_V; p.vx = clamp(p.ground ? p.gsp * Math.cos(angleAt(L, p.x)) : p.vx, -TOP, TOP); p.ground = false; p.jumping = false; p.roll = false; st.spring++; emit(st, { t: 'spring' }); }
    for (const d of L.pads) if (p.ground && Math.abs(d.x - p.x) < 14) { p.gsp = d.dir * PAD_V; p.roll = false; emit(st, { t: 'boost' }); }
    for (const k of L.spikes) if (Math.abs(k.x - p.x) < 9 && p.y > groundY(L, k.x) - 12) hurt(st, k.x);
    for (const c of L.checks) if (c.x > st.checkX && p.x >= c.x) { st.checkX = c.x; emit(st, { t: 'check', x: c.x }); }
  }
  function hurt(st, fromX) {
    const p = st.p;
    if (p.inv > 0 || p.dead || st.phase !== 'play') return;
    if (st.tutorial) { p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'hurt', rings: 0 }); return; }
    if (st.rings <= 0) return die(st, 'enemy');
    const n = Math.min(st.rings, 12);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; st.scatter.push({ x: p.x, y: p.y - 14, vx: Math.cos(a) * 2.2, vy: -2.5 + Math.sin(a) * 1.6, life: 260 }); }
    emit(st, { t: 'hurt', rings: st.rings }); st.rings = 0;
    p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; p.hurt = 1;
  }
  function die(st, why) {
    const p = st.p; if (p.dead || st.phase !== 'play') return;
    p.dead = true; p.vy = why === 'pit' ? 0 : -6; st.lives--; st.deaths++; st.phase = 'dying'; st.dyingT = why === 'pit' ? 45 : 70; st.scatter = [];
    emit(st, { t: 'dead', why });
  }
  function clearLevel(st) {
    const par = TIME_PAR[st.zone] * 60, secs = st.t / 60;
    st.timeBonus = Math.max(0, Math.round((par - st.t) / 60)) * 50; st.ringBonus = st.rings * 100;
    st.score += st.timeBonus + st.ringBonus; st.phase = 'clear'; st.clearT = 0; st.p.roll = false;
    emit(st, { t: 'clear', timeBonus: st.timeBonus, ringBonus: st.ringBonus, secs });
  }

  return { VW, VH, ACC, DEC, FRC, TOP, SLOPE, GRAV, JUMP, MAX_GSP, SPRING_V, PAD_V, INVULN, GROUND_REF, Y_MIN, Y_MAX, PIT_LIMIT, ZONES, TIME_PAR, START_LIVES,
    rng, buildLevel, groundY, angleAt, newGame, spawn, step, isSpin, pbox };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_SP;
