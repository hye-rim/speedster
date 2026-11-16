'use strict';
// 번개 다람쥐: 소닉 풍 고속 러너 규칙 (DOM 없음). 1/60초 한 칸씩 step() 으로 진행하고, 같은 코스·같은 입력이면 늘 같은 결과다.
// 움직임 값은 원작 소닉의 알려진 값(프레임당 픽셀)을 바탕으로 했다. 좌표는 픽셀, 위쪽이 y=0, 캐릭터 위치(x, y)는 발바닥이다.
const LOGIC_SP = (() => {
  const VW = 320, VH = 200;                                   // 화면에 보이는 크기
  const ACC = 0.046875, DEC = 0.5, FRC = 0.046875, TOP = 6;   // 가속·브레이크·마찰·달리기 최고 속도(px/프레임)
  const ROLL_FRC = 0.0234, ROLL_DEC = 0.125, ROLL_UP = 0.078, ROLL_DOWN = 0.3125, SLOPE = 0.125;
  const AIR_ACC = 0.09375, GRAV = 0.21875, JUMP = 6.5, JUMP_CUT = 4, MAX_FALL = 16, MAX_GSP = 16;
  // 코스마다 다른 적 (땅을 걷는 적, 날아다니는 적). 움직임 종류는 같고(땅=type crab, 공중=type bee) 모양·속도만 달라요
  const SKINS = { grass: ['snail', 'bird'], desert: ['scorpion', 'vulture'], jungle: ['frog', 'parrot'], ice: ['penguin', 'snowbat'], lava: ['lavablob', 'ember'], factory: ['gearbot', 'drone'], neon: ['spiderbot', 'ufo'], sky: ['puffer', 'kite'] };
  const SKIN_SPD = { snail: 0.3, scorpion: 0.65, frog: 0.5, penguin: 0.6, lavablob: 0.4, gearbot: 0.7, spiderbot: 0.6, puffer: 0.35, bird: 0.8, vulture: 0.9, parrot: 0.8, snowbat: 0.85, ember: 0.9, drone: 0.75, ufo: 0.8, kite: 0.9 };
  const DROP_SKIN = { desert: 'boulder', ice: 'icicle', lava: 'meteor', factory: 'piston' };   // 위에서 떨어지는 위험물(경고 그림자 → 쿵) 코스별 모양
  const CRUMBLE_T = 36, CRUMBLE_GONE = 170;                       // 무너지는 징검돌: 밟고 서 있으면 이만큼 뒤에 사라지고, 한참 뒤에 다시 생긴다
  const platOff = (pl, t) => (pl.amp ? pl.amp * Math.sin(t / pl.per * Math.PI * 2 + pl.ph) : 0);   // 움직이는 발판의 좌우 흔들림
  const SPRING_V = 10, PAD_V = 10, HURT_VX = 2, HURT_VY = -4, INVULN = 120;
  const GROUND_REF = 150, Y_MIN = 78, Y_MAX = 168;            // 코스 땅 높이의 기준과 한계
  const PIT_LIMIT = 110;                                      // 구멍 폭 최대 (느리게 달려도 점프로 넘는다)
  const RING_GRAB = 24, MAGNET_R = 130, MAGNET_TIME = 15 * 60, RING_R = 13, ENEMY_POINTS = 100, RING_POINTS = 10, START_LIVES = 3;
  const SCATTER_MAX = 32, CHAIN_POINTS = [100, 200, 500, 1000], LIFE_RINGS = 100;      // 맞으면 링이 최대 32개 흩어짐 · 연속 처치 점수 · 링 100개마다 목숨 하나
  const DASH_BASE = 8, DASH_MAX_CHARGE = 8, SHOES_TIME = 20 * 60, INVINC_TIME = 15 * 60;   // 스핀 대시 · 신발·무적 시간
  const LOOP_R = 40, LOOP_W = 36, LOOP_MIN = 5;                                              // 루프: 반지름·폭, 이 속도 이상으로 들어가야 한 바퀴 돈다
  const TIME_PAR = [90, 102, 114, 126, 138, 150, 162, 180];        // 이 시간(초) 안에 끝내면 시간 보너스
  const SAFE_AFTER = 580;                                        // 스프링·점프대·긴 틈 뒤로 이만큼은 위험물을 안 둔다
  const BELT_V = 1.3;                                            // 컨베이어가 밀어 주는 속도(px/프레임)
  // 코스 8개: 테마와 코스마다 고유한 구조(sig)가 있다. 골라 쓰는 sig 는 구간 생성 함수가 맡는다.
  //  valley 깊은 계곡 · tramp 스프링 줄 · iceslide 미끄러운 얼음 내리막 · lavaflame 용암 구멍에서 튀는 불꽃 · belt 컨베이어 · tunnel 가속 판 터널 · longgap 가속 판으로 넘는 긴 틈
  const ZONES = [
    { name: '초원 언덕', theme: 'grass', len: 19200, pit: 0.10, enemy: 0.30, spike: 0.00, hill: 46, sig: null, sigP: 0, style: 'rollers', styles: ['rollers', 'plateaus', 'bumps'], roll: 0.55, extra: ['stones'] },
    { name: '모래 협곡', theme: 'desert', len: 21000, pit: 0.14, enemy: 0.34, spike: 0.06, hill: 54, sig: 'valley', sigP: 0.20, style: 'dunes', styles: ['dunes', 'plateaus', 'longslope'], roll: 0.5, extra: ['stones', 'dropper'] },
    { name: '정글 숲', theme: 'jungle', len: 22800, pit: 0.14, enemy: 0.38, spike: 0.06, hill: 56, sig: 'tramp', sigP: 0.18, style: 'bumps', styles: ['bumps', 'rollers', 'sawtooth'], roll: 0.6, extra: ['floatbridge', 'stones'] },
    { name: '얼음 능선', theme: 'ice', len: 24600, pit: 0.16, enemy: 0.40, spike: 0.10, hill: 60, sig: 'iceslide', sigP: 0.20, style: 'longslope', styles: ['longslope', 'rollers', 'plateaus'], roll: 0.45, extra: ['stones', 'dropper'] },
    { name: '용암 화산', theme: 'lava', len: 26400, pit: 0.18, enemy: 0.42, spike: 0.12, hill: 62, sig: 'lavaflame', sigP: 0.22, style: 'sawtooth', styles: ['sawtooth', 'dunes', 'islands'], roll: 0.55, extra: ['stones', 'dropper'] },
    { name: '번개 공장', theme: 'factory', len: 28200, pit: 0.20, enemy: 0.46, spike: 0.14, hill: 64, sig: 'belt', sigP: 0.22, style: 'plateaus', styles: ['plateaus', 'sawtooth', 'highway'], roll: 0.5, extra: ['floatbridge', 'dropper'] },
    { name: '네온 도시', theme: 'neon', len: 30000, pit: 0.22, enemy: 0.48, spike: 0.16, hill: 66, sig: 'tunnel', sigP: 0.22, style: 'highway', styles: ['highway', 'plateaus', 'bumps'], roll: 0.4, extra: ['floatbridge', 'stones'] },
    { name: '구름 섬', theme: 'sky', len: 32400, pit: 0.24, enemy: 0.50, spike: 0.18, hill: 68, sig: 'longgap', sigP: 0.22, style: 'islands', styles: ['islands', 'rollers', 'highway'], roll: 0.5, extra: ['stones', 'floatbridge'] },
  ];

  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (st, e) => { st.events.push(e); };

  // ---------- 코스 만들기 ----------
  // 땅은 높이 표(1픽셀마다 한 칸)로 둔다. 구멍은 Infinity. 언덕은 키 점 사이를 부드럽게 이어서 경사가 0.65(약 33도)를 넘지 않게 한다.
  function buildLevel(zone, seed) {
    const Z = ZONES[zone], rnd = rng(seed * 977 + zone * 31 + 7), len = Z.len;
    const H = new Float32Array(len + 1).fill(Infinity);
    const L = { zone, name: Z.name, theme: Z.theme, sig: Z.sig, len, H, rings: [], enemies: [], springs: [], pads: [], spikes: [], checks: [], monitors: [], loops: [], ice: [], belts: [], longGaps: [], launches: [], seq: [], plats: [], highs: 0, pitN: 0, extras: 0, enemyN: 0, movers: 0, stonesN: 0, drops: 0, sigCount: 0, goalX: len - 260 };
    let x = 0, y = GROUND_REF;
    const smooth = (x0, y0, x1, y1) => { for (let i = x0; i <= x1 && i <= len; i++) { const t = (i - x0) / Math.max(1, x1 - x0), s = t * t * (3 - 2 * t); H[i] = y0 + (y1 - y0) * s; } };
    const flat = (n) => { smooth(x, y, x + n, y); const a = x; x += n; return [a, x]; };
    // 구간 지문: 같은 코스 안에서는 종류+모양+크기가 똑같은 구간이 두 번 나오지 않는다.
    // pick(종류, {값이름: [후보…]}) 이 아직 안 쓴 조합을 골라 주고(없으면 null), mark(조합이름) 으로 "썼다"고 적는다. 같은 종류는 CAP 번까지만 나온다.
    const used = new Set(), kindN = {}, sc = len / 19200, CAP = { breather: 99, enemy: 3 + Math.floor(zone * 0.8), pit: Math.round(4 * sc), sig: Math.round(4 * sc) };       // 긴 코스일수록 같은 종류가 조금 더 나올 수 있다
    const capOf = (k) => k.startsWith('terrain') ? Math.round(2 * sc) : k.startsWith('sig') ? CAP.sig : CAP[k] || Math.round(3 * sc);
    const room = (k) => (kindN[k] || 0) < capOf(k);
    const pick = (kind, defs) => {
      if (!room(kind)) return null; const names = Object.keys(defs);
      for (let t = 0; t < 60; t++) { const o = { kind }; for (const n of names) o[n] = defs[n][Math.floor(rnd() * defs[n].length)]; o.key = kind + '|' + names.map((n) => o[n]).join(','); if (!used.has(o.key)) return o; }
      return null;
    };
    const mark = (o) => { L.seq.push(o.key); used.add(o.key); kindN[o.kind] = (kindN[o.kind] || 0) + 1; };                // 만든 구간을 차례로 적어 둔다(시험에서 같은 게 반복되는지 본다)
    // 링 배치도 매번 같지 않게: 일직선 · 호 · 지그재그 · 두 줄 중 하나
    const ringsLine = (a, b, step = 28, up = 22, pt = -1) => {
      const pat = pt >= 0 ? pt : Math.floor(rnd() * 4);
      for (let i = a + 20, k = 0; i < b - 10; i += step, k++) {
        const base = H[Math.floor(i)] - up, t = (i - a) / Math.max(1, b - a);
        if (pat === 0) L.rings.push({ x: i, y: base });
        else if (pat === 1) L.rings.push({ x: i, y: base - Math.sin(t * Math.PI) * 18 });
        else if (pat === 2) L.rings.push({ x: i, y: base - (k % 2 ? 10 : 0) });
        else { L.rings.push({ x: i, y: base }); if (k % 2 === 0) L.rings.push({ x: i, y: base - 16 }); }
      }
    };
    const slopeTo = (dy) => { const ny = clamp(y + dy, Y_MIN, Y_MAX), d = Math.max(130, Math.round(Math.abs(ny - y) * 2.7)); smooth(x, y, x + d, ny); const a = x; x += d; y = ny; return [a, x]; };
    // 튕겨 올라 멀리 날아가는 곳(스프링·점프대·긴 틈의 끝) 뒤 SAFE_AFTER 픽셀 안에는 적·가시·불꽃·구멍을 놓지 않는다:
    // 그때는 몸을 말지 못한 채 공중에 떠서 조종이 어렵고, 닿으면 막을 방법이 없기 때문이다.
    let safeUntil = 0; const guard = () => { if (x < safeUntil) flat(safeUntil - x); };
    // 코스마다 고유한 구간
    const signature = (kind, pre) => {
      const nm = pre + kind, wr = [0, 1, 2, 3].map((i) => 90 + Math.round(i * (PIT_LIMIT - 90) / 3));
      if (kind === 'lavaflame' || kind === 'longgap') guard();
      if (kind === 'floatbridge') {                                  // 떠다니는 다리: 넓은 구멍 위를 좌우로 흔들리는 발판 두 개로 건넌다 (타이밍을 봐서 갈아탄다)
        const o = pick(nm, { amp: [35, 45, 55], p1: [150, 170, 190], p2: [170, 190, 210], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        guard(); flat(220); const bx = x, W = 330;
        L.plats.push({ x0: bx + 30, x1: bx + 160, y, amp: o.amp, per: o.p1, ph: 0 }, { x0: bx + 170, x1: bx + 300, y, amp: o.amp, per: o.p2, ph: 2.1 });
        for (let k = 0; k < 8; k++) L.rings.push({ x: bx + 20 + k * 41, y: y - 36 - Math.sin(k / 7 * Math.PI) * 26 });
        x += W; smooth(x, y, x + 260, y); const a = x; x += 260; ringsLine(a, x, 28, 22, o.pat); L.movers++; return true;
      }
      if (kind === 'stones') {                                       // 무너지는 징검돌: 밟고 오래 서 있으면 떨어진다. 멈추지 말고 달려 건넌다 (돌 사이 간격·돌 크기가 코스마다 다르다)
        const o = pick(nm, { g1: zone === 0 ? [90, 100] : [90, 100, 110], g2: zone === 0 ? [90, 100] : [90, 100, 110], w: zone === 0 ? [70, 76] : [60, 70, 76], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        guard(); flat(220); const bx = x, W = 330, ss = [20, 20 + o.g1, 20 + o.g1 + o.g2];
        for (const q of ss) L.plats.push({ x0: bx + q, x1: bx + q + o.w, y, crumble: true });
        for (let k = 0; k < 7; k++) L.rings.push({ x: bx + 20 + k * 46, y: y - 34 - Math.sin(k / 6 * Math.PI) * 24 });
        x += W; smooth(x, y, x + 260, y); const a = x; x += 260; ringsLine(a, x, 28, 22, o.pat); L.stonesN++; return true;
      }
      if (kind === 'dropper') {                                      // 떨어지는 것: 바닥에 경고 그림자가 생기고 잠시 뒤 위에서 쿵 떨어졌다 올라간다 (사이로 지나간다)
        const o = pick(nm, { lead: [100, 140, 180], g: [150, 170, 190], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        guard(); flat(o.lead); const skin = DROP_SKIN[Z.theme] || 'boulder';
        for (let k = 0; k < 3; k++) { const [a, b] = flat(o.g); L.enemies.push({ type: 'drop', skin, x: a + o.g / 2, y, base: y, home: a + o.g / 2, range: 0 }); ringsLine(a, b, 34, 24, o.pat); L.drops++; }
        flat(80); return true;
      }
      if (kind === 'valley') {                                       // 깊은 계곡: 내려갔다 올라온다 (구르면 엄청 빨라진다)
        const o = pick(nm, { d: [-8, 4, 14, 26], st: [16, 20, 26], pat: [0, 1, 2, 3] }); if (!o) return false;
        flat(120); if (Y_MAX - y < 70) { const up = Math.min(80 - (Y_MAX - y), y - Y_MIN); if (up < 20) return false; slopeTo(-up); }
        const dy = Math.min(Z.hill + o.d + 12, Y_MAX - y); if (dy < 36) return false; mark(o);
        const [a, b] = slopeTo(dy); ringsLine(a, b, o.st, 16, o.pat); const [c, d] = slopeTo(-dy); ringsLine(c, d, o.st, 16, o.pat); return true;
      }
      if (kind === 'tramp') {                                        // 스프링 줄: 잇달아 밟으며 위의 링 길로
        const o = pick(nm, { n: [2, 3, 4], sp: [90, 100, 115], pat: [0, 1] }); if (!o) return false; mark(o);
        const [a, b] = flat(120 + o.n * o.sp); for (let k = 0; k < o.n; k++) { L.springs.push({ x: a + 70 + k * o.sp }); L.launches.push(a + 70 + k * o.sp); for (let j = 0; j < 4; j++) L.rings.push({ x: a + 70 + k * o.sp + 14 + j * 20, y: y - 70 - k * (o.pat ? 20 : 14) - Math.sin(j / 3 * Math.PI) * 22 }); } flat(520); return true;     // 스프링에 튕겨 멀리 날아가니 뒤에 넓은 평지
      }
      if (kind === 'iceslide') {                                     // 얼음 내리막: 바닥이 미끄럽다 (가속·마찰·브레이크가 약하다)
        const o = pick(nm, { dy: [40, 50, 62], l: [220, 280, 340], pat: [0, 1, 2, 3] }); if (!o) return false;
        flat(140); if (Y_MAX - y < 70) { const up = Math.min(80 - (Y_MAX - y), y - Y_MIN); if (up < 20) return false; slopeTo(-up); }
        const dy = Math.min(o.dy, Y_MAX - y); if (dy < 32) return false; mark(o); const [a] = slopeTo(dy); const [, e] = flat(o.l); L.ice.push({ x0: a - 10, x1: e }); ringsLine(a, e, 26, 20, o.pat); return true;
      }
      if (kind === 'lavaflame') {                                    // 용암 구멍: 가운데서 불꽃이 튀어 오른다 (타이밍을 봐서 건넌다)
        const o = pick(nm, { w: wr, pre: [150, 170, 200], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        const [, b] = flat(o.pre), w = o.w; L.enemies.push({ type: 'flame', x: b + w / 2, y: y, base: y, home: b + w / 2, range: 0 });
        for (let k = 0; k < 7; k++) L.rings.push({ x: b + 8 + k * (w / 6), y: y - 24 - Math.sin(k / 6 * Math.PI) * 38 });
        x += w; smooth(x, y, x + 240, y); const a = x; x += 240; ringsLine(a, x, 28, 22, o.pat); return true;
      }
      if (kind === 'belt') {                                         // 컨베이어: 땅이 앞이나 뒤로 밀어 준다
        const o = pick(nm, { dir: [-1, 1], l: [300, 340, 380], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        const [a, b] = flat(o.l); L.belts.push({ x0: a + 50, x1: b - 50, dir: o.dir }); ringsLine(a, b, 30, 22, o.pat); return true;
      }
      if (kind === 'tunnel') {                                       // 가속 판 터널: 판을 연달아 밟으며 점점 더 빨라진다
        const o = pick(nm, { n: [3, 4], sp: [130, 150, 170], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        const [a, b] = flat(200 + o.n * o.sp); for (let k = 0; k < o.n; k++) L.pads.push({ x: a + 70 + k * o.sp, dir: 1 }); ringsLine(a, b, 24, 22, o.pat); return true;
      }
      if (kind === 'longgap') {                                      // 긴 틈: 가속 판으로 속도를 붙여 점프대에서 날아 건넌다
        const o = pick(nm, { w: [170, 185, 200, 215], pre: [170, 200, 230], up: [34, 44] }); if (!o) return false;
        if (y - Y_MIN < 30) { const dn = Math.min(70, Y_MAX - y); if (dn < 20) return false; slopeTo(dn); } const up = Math.min(o.up, y - Y_MIN); if (up < 30) return false; mark(o); const [a] = flat(o.pre); L.pads.push({ x: a + 60, dir: 1 });
        const [, c] = slopeTo(-up), w = o.w; L.longGaps.push({ x0: c, x1: c + w }); L.launches.push(c); safeUntil = c + SAFE_AFTER;
        for (let k = 0; k < 8; k++) L.rings.push({ x: c + 12 + k * (w / 7), y: y - 38 - Math.sin(k / 7 * Math.PI) * 40 });
        x += w; y += Math.min(24, Y_MAX - y); smooth(x, y, x + 320, y); x += 320; return true;
      }
      return false;
    };
    // 높은 길: 스프링을 밟고 올라가면 구름·바위 같은 발판이 이어진 위쪽 길이 있다 (링과 아이템이 많다). 못 올라가도 아래는 평지라 안전하다
    const highroad = () => {
      const o = pick('highroad', { v: zone === 0 ? [0, 1] : zone === 1 ? [0, 1, 2] : [0, 1, 2, 3], d: [118, 126, 134, 142, 150] }); if (!o) return false; mark(o);
      guard();
      const v = o.v, d1 = o.d;
      // 첫 발판은 스프링에서 날아가 반드시 내려앉는 자리(폭 350)고, 뒤는 모양마다 달라요: 0 징검 · 1 계단 오르막 · 2 지그재그 · 3 움직이는 발판 건너기
      const spec = v === 0 ? [[0, 350, d1], [70, 210, 150], [80, 230, 126], [70, 170, 136]]
        : v === 1 ? [[0, 350, d1], [60, 220, d1 + 28], [60, 220, d1 + 56], [70, 200, d1 + 56]]
        : v === 2 ? [[0, 350, d1], [90, 130, d1 - 14], [90, 130, d1 + 22], [90, 130, d1 - 10], [80, 160, d1 + 6]]
        : [[0, 350, d1], [100, 150, d1 + 4, 35], [90, 280, d1 - 10]];
      const total = spec.reduce((s, q) => s + q[0] + q[1], 170) + 200, [a] = flat(Math.max(1300, total)), sx = a + 80, gy = y;
      L.springs.push({ x: sx }); L.launches.push(sx); let cx = sx + 170; const mi = v >= 2 ? 2 : 1;
      spec.forEach(([gap, w, dy, amp], i) => {
        const x0 = cx + gap, x1 = x0 + w, py = gy - dy, pl = { x0, x1, y: py, hr: true }; if (amp) { pl.amp = amp; pl.per = 170; pl.ph = rnd() * 6; } L.plats.push(pl);
        for (let r = x0 + 22; r < x1 - 10; r += 26) L.rings.push({ x: r, y: py - 22 });
        if (i < spec.length - 1) for (let k = 1; k <= 3; k++) L.rings.push({ x: x1 + k * (spec[i + 1][0] / 4), y: py - 40 - Math.sin(k / 4 * Math.PI) * 18 });
        if (i === mi) L.monitors.push({ x: x0 + w / 2, y: py, type: (zone === 0 ? ['ring10', 'shield', 'magnet'] : ['ring10', 'shield', 'shoes', 'invincible', 'magnet', zone > 1 ? 'life' : 'magnet'])[Math.floor(rnd() * (zone === 0 ? 3 : 6))] });
        cx = x1;
      });
      for (let r = a + 130; r < a + 560; r += 44) L.rings.push({ x: r, y: gy - 20 });
      safeUntil = cx + SAFE_AFTER; L.highs++; return true;
    };
    // 코스마다 다른 땅의 생김새: 같은 평지 달리기가 아니라 코스마다 언덕·모래언덕·울퉁불퉁·긴 내리막·톱니·계단·고속도로·섬 모양이 이어진다
    const rise = (dy) => { const up = Math.min(dy, y - Y_MIN); if (up < 14) return null; return slopeTo(-up); };
    const fall = (dy) => { const dn = Math.min(dy, Y_MAX - y); if (dn < 14) return null; return slopeTo(dn); };
    const bump = (dy, lenUp, lenDn) => { const ny = clamp(y - dy, Y_MIN, Y_MAX), y0 = y; smooth(x, y0, x + lenUp, ny); x += lenUp; y = ny; smooth(x, y, x + lenDn, y0); x += lenDn; y = y0; };
    let lastStyle = null;
    const TERR = {                                                    // 땅 모양마다 바꿀 수 있는 값(이 조합이 코스 안에서 한 번씩만 나온다)
      rollers: { n: [2, 3], amp: [40, 52, 64], pat: [0, 1, 2, 3] }, dunes: { n: [3, 4], amp: [30, 42, 54], pat: [0, 1, 2, 3] },
      bumps: { n: [5, 7, 9], h: [14, 18, 22] }, longslope: { dn: [60, 70, 80], f: [150, 200, 250], pat: [0, 1, 2, 3] },
      sawtooth: { n: [4, 5, 6], h: [28, 34, 40] }, plateaus: { n: [2, 3, 4], d: [30, 36, 44] },
      highway: { f1: [260, 300, 360], up: [50, 60, 70], f2: [220, 260, 300] }, islands: { n: [1, 2, 3], d: [40, 46, 54], w: [180, 220, 260] },
    };
    const pickTerrain = () => {                                       // 아직 안 쓴 땅 모양 조합을 고른다. 직전과 같은 모양은 피한다
      const c = Z.styles.filter((q) => q !== lastStyle).sort(() => rnd() - 0.5);
      for (const st of c) { const o = pick('terrain:' + st, TERR[st]); if (o) { o.st = st; return o; } }
      return null;
    };
    const terrain = (o) => {
      const style = o.st, n0 = x; mark(o); lastStyle = style;
      if (style === 'rollers') { for (let k = 0; k < o.n; k++) { const amp = o.amp + Math.floor(rnd() * 10) - 5, a = rise(amp); if (a) ringsLine(a[0], a[1], 26, 18, o.pat); const b = fall(amp); if (b) ringsLine(b[0], b[1], 26, 18, o.pat); if (!a && !b) flat(200); } }
      else if (style === 'dunes') { for (let k = 0; k < o.n; k++) { const a = rise(o.amp + Math.floor(rnd() * 12) - 6); if (a) ringsLine(a[0], a[1], 26, 18, o.pat); const dy = Math.min(46, Y_MAX - y); if (dy > 16) { const y0 = y; smooth(x, y0, x + 100, y0 + dy); x += 100; y = y0 + dy; flat(60); } else flat(120); } }
      else if (style === 'bumps') { for (let k = 0; k < o.n; k++) { bump(o.h + Math.floor(rnd() * 6) - 1, 70, 70); } ringsLine(n0, x, 40, 24); }
      else if (style === 'longslope') { const dn = Math.min(o.dn, Y_MAX - y); if (dn > 30) { const y0 = y; smooth(x, y0, x + dn * 11, y0 + dn); ringsLine(x, x + dn * 11, 30, 22, o.pat); x += dn * 11; y = y0 + dn; } flat(o.f); rise(60); }
      else if (style === 'sawtooth') { for (let k = 0; k < o.n; k++) bump(o.h + Math.floor(rnd() * 6), 110, 90); ringsLine(n0, x, 36, 22); }
      else if (style === 'plateaus') { for (let k = 0; k < o.n; k++) { flat(150); if (k % 2 === 0) fall(o.d); else rise(o.d); } }
      else if (style === 'highway') { flat(o.f1); const a = rise(o.up); if (a) ringsLine(a[0], a[1], 26, 18); flat(o.f2); fall(o.up); }
      else if (style === 'islands') { for (let k = 0; k < o.n; k++) { rise(o.d); flat(o.w); fall(o.d); flat(80); } }
      if (y < Y_MIN + 5 || y > Y_MAX - 5) slopeTo(GROUND_REF - y);
      return x > n0;
    };
    let lastEnemyPat = -1;
    const enemySeg = () => {                                         // 적 구간: 모양이 네 가지 (한 줄 · 땅 적+가시 · 날아다니는 적만 · 땅과 공중 번갈아)
      const spk = Z.spike > 0, allow = zone === 0 ? [0, 2] : zone === 1 ? [0, 1, 2] : [0, 1, 2, 3], pats = allow.filter((v) => v !== lastEnemyPat && (v !== 1 || spk)).sort(() => rnd() - 0.5); let o = null;
      const defs = [{ v: [0], len: [300, 340, 380, 420], n: zone === 0 ? [2] : [2, 3], fl: [-1, 0, 1], pat: [0, 1, 2, 3] }, { v: [1], at: [200, 230, 260], k: [3, 4], pat: [0, 1, 2, 3] }, { v: [2], len: [380, 430, 480], n: [3, 4], pat: [0, 1, 2, 3] }, { v: [3], len: [440, 480, 520], f0: [0, 1], pat: [0, 1, 2, 3] }];
      for (const v of pats) { o = pick('enemy', defs[v]); if (o) break; }
      if (!o) return false; mark(o); guard(); L.enemyN++; lastEnemyPat = o.v;
      const put = (ex, fly) => L.enemies.push({ type: fly ? 'bee' : 'crab', skin: SKINS[Z.theme][fly ? 1 : 0], x: ex, y: fly ? H[Math.floor(ex)] - 34 : H[Math.floor(ex)], home: ex, range: 60 });
      if (o.v === 0) { const [a, b] = flat(o.len); ringsLine(a, b, 28, 22, o.pat); for (let k = 0; k < o.n; k++) put(a + 70 + k * ((b - a - 140) / Math.max(1, o.n - 1)), o.fl === 0 ? k === 0 : o.fl === 1 ? k === o.n - 1 : false); }
      else if (o.v === 1) { const [a, b] = flat(420); ringsLine(a, b, 32, 30, o.pat); put(a + 70, false); for (let k = 0; k < o.k; k++) L.spikes.push({ x: a + o.at + k * 16 }); put(a + 360, false); }
      else if (o.v === 2) { const [a, b] = flat(o.len); ringsLine(a, b, 28, 22, o.pat); for (let k = 0; k < o.n; k++) put(a + 70 + k * ((b - a - 140) / (o.n - 1)), true); }
      else { const [a, b] = flat(o.len), st = (o.len - 120) / 3; ringsLine(a, b, 28, 22, o.pat); for (let k = 0; k < 4; k++) put(a + 60 + k * st, (k + o.f0) % 2 === 1); }
      return true;
    };
    // 쉬어 가는 구간: 다른 구간 종류를 다 썼을 때만 쓴다 (길이·링 모양·살짝 오르내림이 매번 다르다)
    const breather = () => {
      const o = pick('breather', { len: [200, 240, 280, 320, 360, 400, 440, 480], sh: [0, 1, 2], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
      if (o.sh === 1) rise(24); else if (o.sh === 2) fall(24);
      const [a, b] = flat(o.len); ringsLine(a, b, 28, 22, o.pat); return true;
    };
    flat(420);
    for (let i = 150; i <= 390; i += 40) L.rings.push({ x: i, y: GROUND_REF - 22 });                  // 처음 평지에 링 몇 개(처음 해 보는 사람이 링을 먹어 볼 수 있게)
    let nextCheck = 1;
    const norm = () => { if (y < Y_MIN + 5 || y > Y_MAX - 5) slopeTo(GROUND_REF - y); };
    const trySig = (list, pre) => { for (const k of list.slice().sort(() => rnd() - 0.5)) if (signature(k, pre)) { norm(); return true; } return false; };
    const pitMax = Math.min(PIT_LIMIT, 76 + zone * 5), wr = [0, 1, 2, 3].map((i) => 66 + Math.round(i * (pitMax - 66) / 3));      // 구멍 폭은 단계가 오를수록 넓어진다
    const MON = zone === 0 ? ['ring10', 'shield', 'magnet'] : ['ring10', 'ring10', 'shield', 'shield', 'shoes', 'invincible', 'magnet', 'magnet', 'life'];
    // 보통 구간 (모두 pick 으로 아직 안 쓴 모양만 고른다. 실패하면 false)
    const make = {
      pit() {                                                     // 구멍: 앞은 평평하게. 모양: 하나 · 두 개 연달아 · 위에 발판 길이 있는 구멍
        const pv = x < len - 2400 && zone >= 2 ? [0, 0, 1, 1, 2][Math.floor(rnd() * 5)] : [0, 2][Math.floor(rnd() * 2)];
        const o = pick('pit', pv === 1 ? { v: [1], pre: [190, 220, 250, 270], w: wr, w2: wr } : { v: [pv], pre: [190, 220, 250, 270], w: wr, pat: [0, 1, 2, 3] }); if (!o) return false;
        mark(o); guard(); L.pitN++;
        for (let m = 0; m < (pv === 1 ? 2 : 1); m++) {
          const [, b] = flat(m ? 200 : o.pre), w = m ? o.w2 : o.w;
          for (let k = 0; k < 7; k++) L.rings.push({ x: b + 8 + k * (w / 6), y: y - 24 - Math.sin(k / 6 * Math.PI) * 38 });
          if (pv === 2) { L.plats.push({ x0: b - 40, x1: b + w + 40, y: y - 70 }); for (let k = 0; k < 6; k++) L.rings.push({ x: b - 20 + k * ((w + 40) / 5), y: y - 94 }); }
          x += w; smooth(x, y, x + 230, y); const a = x; x += 230; ringsLine(a, x, 28, 22, o.pat);
        }
        return true;
      },
      ramp() {                                                    // 점프대: 오르막 끝이 갑자기 끊기고 아래에 땅
        const o = pick('ramp', { up: [30, 38, 46], w: zone === 0 ? [60, 68, 76] : zone < 3 ? [60, 75, 90] : [60, 75, 90, 100], dr: [16, 24, 30], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
        const [a, b] = slopeTo(-Math.min(o.up, y - Y_MIN));
        L.launches.push(b); safeUntil = b + SAFE_AFTER; const w = o.w; for (let k = 0; k < 6; k++) L.rings.push({ x: b + 10 + k * (w / 5), y: y - 40 - Math.sin(k / 5 * Math.PI) * 30 }); const drop = Math.min(o.dr, Y_MAX - y); x += w; y += drop; smooth(x, y, x + 160, y); const c = x; x += 160; ringsLine(c, x, 28, 22, o.pat);
        return true;
      },
      enemy() { return enemySeg(); },
      spike() {                                                   // 가시 모양: 3개 · 넓게 5개 · 둘씩 두 무리
        const o = pick('spike', { sv: zone < 3 ? [0] : zone < 5 ? [0, 1] : [0, 1, 2], off: [60, 80, 100], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
        const [a, b] = flat(o.sv === 2 ? 400 : 240); if (o.sv === 0) for (let k = 0; k < 3; k++) L.spikes.push({ x: a + o.off + k * 16 }); else if (o.sv === 1) for (let k = 0; k < 5; k++) L.spikes.push({ x: a + o.off + k * 16 }); else { for (const q of [o.off, o.off + 210]) for (let k = 0; k < 2; k++) L.spikes.push({ x: a + q + k * 16 }); }
        ringsLine(a, b, 32, 40, o.pat); return true;
      },
      spring() {                                                  // 스프링: 위로 날아오르는 링 길(아치 · 높은 아치 · 넓은 아치)
        const o = pick('spring', { sv: [0, 1, 2], pos: [80, 90, 110], len: [240, 280] }); if (!o) return false; mark(o);
        const [a] = flat(o.len); L.springs.push({ x: a + o.pos }); L.launches.push(a + o.pos); safeUntil = a + o.pos + SAFE_AFTER;
        const n = o.sv === 2 ? 9 : 5, st = o.sv === 2 ? 22 : 18, hh = o.sv === 1 ? 130 : 90; for (let k = 0; k < n; k++) L.rings.push({ x: a + o.pos + 10 + k * st, y: y - hh - Math.sin(k / (n - 1) * Math.PI) * 24 });
        return true;
      },
      pad() {                                                     // 가속 판과 긴 내리막
        const o = pick('pad', { l: [160, 200, 240], pos: [60, 70, 90], f: [0.6, 0.8, 1], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        const [a] = flat(o.l); L.pads.push({ x: a + o.pos, dir: 1 }); const [c, d] = slopeTo(Math.min(Math.round(Z.hill * o.f), Y_MAX - y)); ringsLine(c, d, 26, 18, o.pat); return true;
      },
      hill() {                                                    // 언덕: 올랐다 (꼭대기에서 잠깐 달리고) 내려오기
        const o = pick('hill', { f: [0.5, 0.7, 0.85, 1], top: [0, 60, 120], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o);
        const up = Math.min(Math.round(Z.hill * o.f), y - Y_MIN); if (up > 24) { const [a, b] = slopeTo(-up); ringsLine(a, b, 26, 18, o.pat); if (o.top) flat(o.top); slopeTo(up); } else flat(200);
        return true;
      },
    };
    while (x < len - 1400) {
      const q = rnd();
      if (L.checks.length < 2 && x > len * nextCheck / 3) { const [a] = flat(160); L.checks.push({ x: a + 80 }); nextCheck++; continue; }
      if (Z.style && x > 700 && x < len - 1800 && x >= safeUntil && rnd() < Z.roll) { const t = pickTerrain(); if (t) terrain(t); }      // 땅 모양(언덕 등)을 먼저 깔고, 같은 차례에 보통 구간도 이어서 만든다
      const prev = L.seq[L.seq.length - 1] || '', pk = (k) => prev.startsWith(k);
      if ((q < 0.10 || (kindN.loop || 0) < Math.floor(x / len * 3)) && x > 900 && !pk('loop')) {                                  // 루프: 앞에 달릴 평지, 루프, 뒤에 평지. 링이 원을 따라 놓인다
        const o = pick('loop', { n: [1, 1, 2], pre: [300, 340, 400, 460], post: [140, 180, 230], pat: [0, 1, 2, 3] });
        if (o) {
          mark(o); const [a0, b0] = flat(o.pre); ringsLine(a0, b0, 34, 22, o.pat);
          for (let m = 0; m < o.n; m++) {
            const lx = x; flat(LOOP_W + (m < o.n - 1 ? 260 : o.post)); L.loops.push({ x: lx, y: y });
            for (let k = 1; k <= 10; k++) { const th = k / 11 * Math.PI * 2; L.rings.push({ x: lx + LOOP_R * Math.sin(th) + LOOP_W * th / (Math.PI * 2), y: y - LOOP_R * (1 - Math.cos(th)) - 10 }); }
          }
          continue;
        }
      }
      if ((q < 0.18 || (kindN.monitor || 0) < Math.floor(x / len * 3)) && x > 700 && !pk('monitor')) {                                  // 아이템 상자
        const o = pick('monitor', { w: [200, 240, 280, 320], ty: MON, up: [0, 1, 2], pat: [0, 1, 2, 3] });
        if (o) { mark(o); guard(); if (o.up === 1) rise(26); else if (o.up === 2) fall(26); const [a, b] = flat(o.w); L.monitors.push({ x: a + 110, type: o.ty }); ringsLine(a, b, 28, 22, o.pat); norm(); continue; }
      }
      if (x > 1400 && x < len - 2600 && L.highs < 1 + Math.floor(x / len * 2) && room('highroad') && highroad()) continue;
      if (x > 2200 && x < len - 2800 && L.extras < Math.floor(x / len * 3.5) && Z.extra && trySig(Z.extra, 'x:')) { L.extras++; continue; }
      if (Z.sig && x > 900 && x < len - 1400 && !pk('sig:') && (rnd() < Z.sigP || L.sigCount < Math.floor(x / len * 5)) && trySig([Z.sig], 'sig:')) { L.sigCount++; continue; }
      if (x > 1000 && x < len - 1500 && !pk('enemy') && L.enemyN < Math.min(CAP.enemy, Math.floor(x / len * CAP.enemy * 1.5)) && enemySeg()) continue;      // 적 구간도 코스마다 꼭 몇 개는 있게
      const kindOf = (v) => v < Z.pit ? 'pit' : v < Z.pit + 0.14 ? 'ramp' : v < Z.pit + 0.14 + Z.enemy ? 'enemy' : v < Z.pit + 0.14 + Z.enemy + Z.spike ? 'spike' : v < Z.pit + 0.14 + Z.enemy + Z.spike + 0.12 ? 'spring' : v < Z.pit + 0.14 + Z.enemy + Z.spike + 0.22 ? 'pad' : 'hill';
      const forcePit = x > 1800 && L.pitN < Math.floor(x / len * 3) && room('pit'), last2 = L.seq.slice(-2);
      let r = forcePit ? 0 : rnd(), kind = kindOf(r);
      for (let t = 0; t < 24 && !forcePit && (!room(kind) || last2.some((k) => k.startsWith(kind))); t++) { r = rnd(); kind = kindOf(r); }      // 다 쓴 종류, 방금 한 두 가지와 같은 종류는 피한다
      if (!(make[kind]() || breather())) flat(220);
      norm();
    }
    smooth(x, y, x + 220, GROUND_REF); x += 220; y = GROUND_REF; smooth(x, y, len, y);          // 끝은 부드럽게 내려와 평평하게
    L.rings = L.rings.filter((q) => q.x < len - 300);
    L.plats.forEach((p, i) => { p.id = i; });
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
      checkX: 60, deaths: 0, kills: 0, spring: 0, maxSpeed: 0, chain: 0, nextLife: LIFE_RINGS, mon: new Set(), loopsRun: 0, monitorsBroken: 0,
      enemies: [], clearT: 0, dyingT: 0, scatter: [], got: new Set(), cr: {}, gone: {}, mag: {},
    };
    st.enemies = level.enemies.map((e, i) => ({ id: i, type: e.type, skin: e.skin, spd: SKIN_SPD[e.skin], x: e.x, y: e.y, home: e.home, range: e.range, base: e.base, dir: i % 2 ? 1 : -1, alive: true, vy: 0 }));
    if (st.tutorial) st.enemies.unshift({ id: 900, type: 'crab', skin: SKINS[level.theme][0], spd: SKIN_SPD[SKINS[level.theme][0]], x: 640, y: groundY(level, 640), home: 640, range: 40, dir: 1, alive: true, vy: 0 });      // 연습: 처음에 게 한 마리
    spawn(st, 60);
    return st;
  }
  function spawn(st, x) {
    const L = st.level;
    st.p = { x, y: groundY(L, x), vx: 0, vy: 0, gsp: 0, ground: true, spin: false, roll: false, face: 1, inv: 60, dead: false, jumping: false, jumpHeld: false, hurt: 0, moved: false, crouch: false, charge: 0, dashRoll: false, shield: false, invinc: 0, shoes: 0, magnet: 0, lx: x, ly: groundY(L, x), loop: null, plat: null };
  }

  const isSpin = (p) => p.roll || (!p.ground && p.jumping);
  const canKill = (p) => isSpin(p) || p.invinc > 0 || !!p.loop;                  // 무적이거나 루프를 도는 중에는 닿기만 해도 적을 부순다

  // 링을 n 개 얻는다: 점수는 줄 때만, 100개를 넘을 때마다 목숨 하나
  function addRings(st, n, silent, scattered) {
    st.rings += n; if (!scattered) { st.ringsTotal += n; st.score += n * RING_POINTS; }
    if (!silent) emit(st, { t: 'ring' });
    while (st.rings >= st.nextLife) { st.nextLife += LIFE_RINGS; st.lives++; emit(st, { t: 'oneup' }); }
  }

  // ---------- 한 걸음 ----------
  function step(st, input = {}) {
    st.events = [];
    if (st.phase === 'over') return;
    const L = st.level, p = st.p;
    if (st.phase === 'dying') {
      p.vy = Math.min(MAX_FALL, p.vy + GRAV); p.y += p.vy; st.dyingT--;
      if (st.dyingT <= 0) {
        if (st.lives <= 0) { st.phase = 'over'; emit(st, { t: 'over' }); } else { spawn(st, st.checkX); st.phase = 'play'; st.rings = 0; st.nextLife = LIFE_RINGS; emit(st, { t: 'respawn' }); }
      }
      return;
    }
    if (st.phase === 'clear') { st.clearT++; p.gsp *= 0.97; p.x += p.gsp; p.y = groundY(L, p.x); return; }
    st.t++;
    if (p.inv > 0) p.inv--; if (p.shoes > 0) p.shoes--; if (p.invinc > 0) { p.invinc--; if (p.invinc === 0) emit(st, { t: 'powerend' }); } if (p.magnet > 0) { p.magnet--; if (p.magnet === 0) emit(st, { t: 'powerend', what: 'magnet' }); }
    p.lx = p.x; p.ly = p.y;                                               // 이번 걸음 시작 자리(링을 줍는 범위를 지나온 길 따라 잰다)
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (const id of Object.keys(st.gone)) if (st.t >= st.gone[id]) delete st.gone[id];
    if (p.ground && p.plat && p.plat.amp) p.x += platOff(p.plat, st.t) - platOff(p.plat, st.t - 1);         // 움직이는 발판은 위에 선 사람을 같이 데려간다
    if (p.ground) stepGround(st, input, dir); else stepAir(st, input, dir);
    if (!p.ground) p.plat = null;
    if (p.ground && p.plat && p.plat.crumble) {                                                               // 무너지는 징검돌
      const id = p.plat.id; st.cr = { [id]: (st.cr[id] || 0) + 1 };
      if (st.cr[id] >= CRUMBLE_T) { st.gone[id] = st.t + CRUMBLE_GONE; st.cr = {}; p.ground = false; p.plat = null; p.vx = p.gsp; p.vy = 0; p.jumping = false; p.roll = false; emit(st, { t: 'crumble', id }); }
    } else st.cr = {};
    p.jumpHeld = !!input.jumpHeld || !!input.jump;
    st.maxSpeed = Math.max(st.maxSpeed, Math.abs(p.ground ? p.gsp : p.vx));
    if (!p.moved && Math.abs(p.gsp) > 0.5) { p.moved = true; emit(st, { t: 'move' }); }
    stepScatter(st);
    stepEnemies(st);
    objects(st);
    if (p.y > VH + 120 && st.phase === 'play') die(st, 'pit');
    if (st.phase === 'play' && p.x >= L.goalX) clearLevel(st);
  }

  function stepLoop(st) {                                          // 루프를 도는 중: 원을 따라 한 바퀴. 속도는 그대로
    const p = st.p, lp = p.loop; lp.th += Math.abs(p.gsp) / LOOP_R;
    if (lp.th >= Math.PI * 2) { p.x = lp.x0 + LOOP_W; p.y = groundY(st.level, p.x); p.loop = null; st.loopsRun++; emit(st, { t: 'loopdone' }); return; }
    p.x = lp.x0 + LOOP_R * Math.sin(lp.th) + LOOP_W * lp.th / (Math.PI * 2); p.y = lp.y0 - LOOP_R * (1 - Math.cos(lp.th)); p.roll = false; p.vx = p.gsp; p.vy = 0;
  }
  function stepGround(st, input, dir) {
    const L = st.level, p = st.p;
    if (p.loop) { stepLoop(st); return; }
    const onIce = L.ice.some((r) => p.x >= r.x0 && p.x <= r.x1);                                                        // 얼음 위: 가속·브레이크·마찰이 약해 미끄러진다
    const k = p.shoes > 0 ? 2 : 1, TOPK = TOP * k, ACCK = ACC * k * (onIce ? 0.3 : 1), DECK = DEC * k * (onIce ? 0.35 : 1), FRCK = FRC * k * (onIce ? 0.12 : 1);                     // 신발을 신으면 최고 속도·가속이 두 배
    // 스핀 대시: 서 있을 때 ↓ 로 웅크리고, 웅크린 채 점프 버튼을 누를 때마다 힘이 모인다. ↓ 를 놓으면 그 힘으로 굴러 나간다
    if (input.down && Math.abs(p.gsp) < 0.5 && !p.roll) {
      p.crouch = true; p.gsp = 0; if (dir) p.face = dir;
      if (input.jump) { p.charge = Math.min(DASH_MAX_CHARGE, p.charge + 2); emit(st, { t: 'rev', charge: p.charge }); }
      p.charge *= 0.985; return;
    }
    if (p.crouch) {
      p.crouch = false;
      if (p.charge >= 1) { p.gsp = p.face * (DASH_BASE + Math.floor(p.charge) / 2); p.roll = true; p.dashRoll = true; emit(st, { t: 'spindash', gsp: p.gsp }); }
      p.charge = 0;
    }
    const ang = p.plat ? 0 : angleAt(L, p.x), sn = Math.sin(ang), cs = Math.cos(ang);
    // 굴러가기(↓): 달리다 아래를 누르면 몸을 말아 굴러간다. 느려지면 풀린다
    if (input.down && Math.abs(p.gsp) >= 1 && !p.roll) { p.roll = true; emit(st, { t: 'roll' }); }
    if (p.roll && (Math.abs(p.gsp) < (p.dashRoll ? 1.5 : 0.5) || (!input.down && !p.dashRoll))) { p.roll = false; p.dashRoll = false; }   // ↓ 를 누르고 있는 동안만 구른다(떼면 속도는 그대로 달리기로). 스핀 대시로 나간 구르기는 느려질 때까지 계속
    if (!p.roll) {
      if (dir) {
        if (p.gsp * dir < 0) { p.gsp += dir * DECK; if (p.gsp * dir > 0) p.gsp = dir * 0.5; }               // 반대로 꺾으면 브레이크
        else if (Math.abs(p.gsp) < TOPK) p.gsp = clamp(p.gsp + dir * ACCK, -TOPK, TOPK);
        p.face = dir;
      } else p.gsp = Math.abs(p.gsp) <= FRCK ? 0 : p.gsp - Math.sign(p.gsp) * FRCK;
      p.gsp -= SLOPE * sn;                                                                                // 경사: 오르막은 느려지고 내리막은 빨라진다
    } else {
      if (dir && p.gsp * dir < 0) p.gsp += dir * ROLL_DEC;
      p.gsp = Math.abs(p.gsp) <= ROLL_FRC * (onIce ? 0.2 : 1) ? 0 : p.gsp - Math.sign(p.gsp) * ROLL_FRC * (onIce ? 0.2 : 1);
      p.gsp -= (Math.sign(p.gsp) === Math.sign(sn) ? ROLL_UP : ROLL_DOWN) * sn;
      if (p.gsp) p.face = Math.sign(p.gsp);
    }
    p.gsp = clamp(p.gsp, -MAX_GSP, MAX_GSP);
    // 점프
    if (input.jump) {
      p.vx = p.gsp * cs - JUMP * sn; p.vy = -p.gsp * sn - JUMP * cs;
      p.ground = false; p.jumping = true; p.roll = false; p.dashRoll = false; emit(st, { t: 'jump' }); return;
    }
    // 땅을 따라 간다. 땅이 갑자기 사라지거나 크게 낮아지면(점프대·낭떠러지) 속도를 그대로 가진 채 날아간다
    const po = p.plat ? platOff(p.plat, st.t) : 0, nx = p.x + p.gsp * cs, gy = p.plat ? (nx >= p.plat.x0 + po && nx <= p.plat.x1 + po ? p.plat.y : Infinity) : groundY(L, nx);
    if (!Number.isFinite(gy) || gy - p.y > 6 + Math.abs(p.gsp) * Math.abs(Math.tan(ang)) + 3) {
      p.x = nx; p.vx = p.gsp * cs; p.vy = -p.gsp * sn; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'air' }); return;
    }
    const px0 = p.x; p.x = nx; p.y = gy;
    for (const b of L.belts) if (p.x >= b.x0 && p.x <= b.x1) { const bx = p.x + b.dir * BELT_V, g2 = groundY(L, bx); if (Number.isFinite(g2)) { p.x = bx; p.y = g2; } break; }        // 컨베이어가 앞이나 뒤로 밀어 준다
    if (p.gsp >= LOOP_MIN) for (const lp of L.loops) if (px0 < lp.x && p.x >= lp.x) { p.x = lp.x; p.y = lp.y; p.loop = { x0: lp.x, y0: lp.y, th: 0 }; p.roll = false; p.dashRoll = false; emit(st, { t: 'loop' }); break; }      // 빠르게 들어가면 한 바퀴
    if (p.x < 8) { p.x = 8; p.gsp = Math.max(0, p.gsp); }
  }

  function stepAir(st, input, dir) {
    const L = st.level, p = st.p, TOPK = TOP * (p.shoes > 0 ? 2 : 1);
    if (dir) { if (dir * p.vx < TOPK) p.vx = clamp(p.vx + dir * AIR_ACC, -Math.max(TOPK, Math.abs(p.vx)), Math.max(TOPK, Math.abs(p.vx))); p.face = dir; }
    if (p.vy < 0 && p.vy > -4) p.vx *= 0.96875;
    if (p.jumping && p.vy < -JUMP_CUT && !(input.jumpHeld || input.jump)) p.vy = -JUMP_CUT;      // 버튼을 일찍 떼면 낮은 점프
    p.vy = Math.min(MAX_FALL, p.vy + GRAV);
    const ox = p.x, oy = p.y;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 8) { p.x = 8; p.vx = Math.max(0, p.vx); }
    let gy = groundY(L, p.x), plat = null;
    if (p.vy >= 0) for (const pl of L.plats) { if (st.gone[pl.id]) continue; const o = platOff(pl, st.t); if (p.x >= pl.x0 + o - 3 && p.x <= pl.x1 + o + 3 && oy <= pl.y + 2.5 && p.y >= pl.y && (plat === null || pl.y < plat.y)) plat = pl; }      // 발판은 아래에서 위로는 통과하고, 위에서 내려올 때만 선다
    if (plat) gy = plat.y;
    if (Number.isFinite(gy) && p.y >= gy && p.vy >= 0 && (plat || oy <= gy + 8)) {          // 착지 (절벽 아래쪽 벽에는 못 올라간다)
      p.y = gy; p.ground = true; p.plat = plat;
      const ang = plat ? 0 : angleAt(L, p.x), sn = Math.sin(ang), cs = Math.cos(ang);
      p.gsp = clamp(p.vx * cs - p.vy * sn, -MAX_GSP, MAX_GSP);
      p.jumping = false; p.roll = !!input.down && Math.abs(p.gsp) >= 1; p.vy = 0; p.hurt = 0; st.chain = 0;
      emit(st, { t: 'land' });
    }
  }

  // ---------- 링·적·장치 ----------
  const pbox = (p) => { const h = isSpin(p) ? 16 : 24; return { x: p.x - 7, y: p.y - h, w: 14, h }; };
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function stepScatter(st) {
    const p = st.p;
    for (const s of st.scatter) { s.vy += 0.15; s.x += s.vx; s.y += s.vy; s.life--; const gy = groundY(st.level, s.x); if (s.y > gy && s.vy > 0) { s.y = gy; s.vy *= -0.6; } if (s.life < 240 && Math.hypot(s.x - p.x, s.y - (p.y - 12)) < RING_R && p.inv < 100) { s.life = 0; addRings(st, 1, false, true); } }
    st.scatter = st.scatter.filter((s) => s.life > 0);
  }
  function stepEnemies(st) {
    const L = st.level, p = st.p;
    for (const e of st.enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x - p.x) > 400) continue;
      if (e.type === 'flame') {                                                                // 용암 구멍의 불꽃: 110프레임마다 32프레임 동안 솟았다 내려간다. 닿으면 무엇으로도 못 막는다(무적과 루프만 예외)
        const ph = (st.t + e.id * 23) % 110, h = ph < 32 ? Math.sin(ph / 32 * Math.PI) * 100 : -30; e.y = e.base - h; e.lit = ph < 32;
        if (!p.dead && overlap(pbox(p), { x: e.x - 6, y: e.y - 22, w: 12, h: 22 })) hurt(st, e.x);
        continue;
      }
      if (e.type === 'drop') {                                                                 // 떨어지는 것: 150프레임 주기. 0~50 경고(그림자), 50~58 낙하, 58~90 바닥에 있음, 90~112 다시 올라감
        const ph = (st.t + e.id * 37) % 150, up = e.base - 220; e.ph = ph;
        e.y = ph < 50 ? up : ph < 58 ? up + 220 * (ph - 50) / 8 : ph < 90 ? e.base : ph < 112 ? e.base - 220 * (ph - 90) / 22 : up;
        if (ph >= 53 && ph <= 92 && !p.dead && overlap(pbox(p), { x: e.x - 9, y: e.y - 20, w: 18, h: 20 })) hurt(st, e.x);
        continue;
      }
      if (e.type === 'crab') { e.x += e.dir * (e.spd || 0.5); if (Math.abs(e.x - e.home) > e.range) e.dir = -e.dir; e.y = groundY(L, e.x); }
      else { e.x += e.dir * (e.spd || 0.8); if (Math.abs(e.x - e.home) > e.range * 1.4) e.dir = -e.dir; e.y = groundY(L, e.home) - 34 + Math.sin(st.t / 20 + e.id) * 8; }
      const eb = { x: e.x - 8, y: e.y - 14, w: 16, h: 14 };
      if (p.dead || !overlap(pbox(p), eb)) continue;
      if (canKill(p)) { e.alive = false; st.kills++; const pts = CHAIN_POINTS[Math.min(st.chain, CHAIN_POINTS.length - 1)]; st.chain++; st.score += pts; emit(st, { t: 'kill', x: e.x, y: e.y, pts }); if (!p.ground) p.vy = p.vy > 0 ? -4 : p.vy + 1; }
      else hurt(st, e.x);
    }
  }
  function objects(st) {
    const L = st.level, p = st.p, bx = pbox(p);
    // 링 줍기: 몸 가운데(p.y-12)에서 RING_GRAB 안이면 먹는다. 이번 걸음에 지나온 길(이전 자리→지금 자리)을 따라 재서 빠르게 달려도 안 놓친다.
    // 자석이 켜져 있으면 MAGNET_R 안의 링이 빨려 온다.
    const cx = p.x, cy = p.y - 12, ox = p.lx == null ? cx : p.lx, oy = (p.ly == null ? p.y : p.ly) - 12, sx = cx - ox, sy = cy - oy, sl = sx * sx + sy * sy;
    for (let i = 0; i < L.rings.length; i++) {
      const r = L.rings[i]; if (st.got.has(i)) continue; const mg = st.mag[i];
      if (p.magnet > 0 && !mg && Math.hypot(r.x - cx, r.y - cy) < MAGNET_R) st.mag[i] = { x: r.x, y: r.y };
      const q = st.mag[i];
      if (q) { const d = Math.hypot(cx - q.x, cy - q.y) || 1, sp = Math.max(7, Math.hypot(sx, sy) + 4); q.x += (cx - q.x) / d * Math.min(sp, d); q.y += (cy - q.y) / d * Math.min(sp, d); }
      const rx = q ? q.x : r.x, ry = q ? q.y : r.y;
      let t = sl > 0.01 ? clamp(((rx - ox) * sx + (ry - oy) * sy) / sl, 0, 1) : 1;
      if (Math.hypot(rx - (ox + sx * t), ry - (oy + sy * t)) < RING_GRAB) { st.got.add(i); addRings(st, 1); }
    }
    for (const s of L.springs) if (Math.abs(s.x - p.x) < 12 && p.y > groundY(L, s.x) - 10 && p.y <= groundY(L, s.x) + 6 && (p.vy >= 0 || p.ground)) { p.vy = -SPRING_V; p.vx = clamp(p.ground ? p.gsp * Math.cos(angleAt(L, p.x)) : p.vx, -TOP, TOP); p.ground = false; p.jumping = false; p.roll = false; st.spring++; emit(st, { t: 'spring' }); }
    for (const d of L.pads) if (p.ground && Math.abs(d.x - p.x) < 14) { p.gsp = d.dir * PAD_V; p.roll = false; emit(st, { t: 'boost' }); }
    for (const k of L.spikes) if (Math.abs(k.x - p.x) < 9 && p.y > groundY(L, k.x) - 12) hurt(st, k.x);
    for (let i = 0; i < L.monitors.length; i++) {                                   // 아이템 상자: 구르거나 뛰어서(또는 무적일 때) 닿으면 부서진다. 그냥 걸어서 지나가면 아무 일 없다
      const m = L.monitors[i]; if (st.mon.has(i) || !canKill(p)) continue;
      if (overlap(pbox(p), { x: m.x - 9, y: (m.y != null ? m.y : groundY(L, m.x)) - 22, w: 18, h: 22 })) {
        st.mon.add(i); st.monitorsBroken++; st.score += 10; if (!p.ground) p.vy = p.vy > 0 ? -4 : p.vy + 1;
        if (m.type === 'ring10') addRings(st, 10); else if (m.type === 'shield') p.shield = true; else if (m.type === 'invincible') p.invinc = INVINC_TIME; else if (m.type === 'shoes') p.shoes = SHOES_TIME; else if (m.type === 'magnet') p.magnet = MAGNET_TIME; else if (m.type === 'life') { st.lives++; emit(st, { t: 'oneup' }); }
        emit(st, { t: 'monitor', type: m.type, x: m.x, y: m.y != null ? m.y : groundY(L, m.x) });
      }
    }
    for (const c of L.checks) if (c.x > st.checkX && p.x >= c.x) { st.checkX = c.x; emit(st, { t: 'check', x: c.x }); }
  }
  function hurt(st, fromX) {
    const p = st.p;
    if (p.inv > 0 || p.dead || st.phase !== 'play') return;
    if (p.invinc > 0 || p.loop) return;                                              // 무적이거나 루프를 도는 중에는 안 다친다
    if (p.shield) { p.shield = false; p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; p.dashRoll = false; emit(st, { t: 'shieldbreak' }); return; }   // 보호막은 한 번 막아 준다 (링은 그대로)
    if (st.tutorial) { p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'hurt', rings: 0 }); return; }
    if (st.rings <= 0) return die(st, 'enemy');
    const n = Math.min(st.rings, SCATTER_MAX);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; st.scatter.push({ x: p.x, y: p.y - 14, vx: Math.cos(a) * 2.2, vy: -2.5 + Math.sin(a) * 1.6, life: 260 }); }
    emit(st, { t: 'hurt', rings: st.rings }); st.rings = 0; st.nextLife = LIFE_RINGS;
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

  // 세로 카메라가 가려는 곳: 캐릭터(몸 중심 py-12)가 화면 위 50 ~ 아래 175 안에 있으면 0, 벗어나면 그만큼 따라간다
  const CAM_TOP = 50, CAM_BOTTOM = 175;
  // 세로가 긴 폰 화면에서는 보이는 높이를 늘린다(위쪽을 더 보여 줌). 늘어난 만큼의 60% 는 위쪽 하늘에 쓴다
  const VH_MAX = 380;
  const viewHeight = (availW, availH, vw) => vw > VW_MIN ? VH : clamp(Math.round(vw * availH / Math.max(1, availW)), VH, VH_MAX);
  const camShift = (vh) => Math.round((Math.max(VH, vh) - VH) * 0.6);
  function camTargetY(py, vh = VH) { const wy = py - 12; return (wy < CAM_TOP ? wy - CAM_TOP : wy > CAM_BOTTOM ? wy - CAM_BOTTOM : 0) - camShift(vh); }

  // 화면 비율에 맞춘 보이는 가로 범위: 세로는 항상 200, 가로는 320(세로 폰 화면) ~ 480(아주 넓은 화면). 가로가 넓을수록 앞이 멀리 보인다
  const VW_MIN = 320, VW_MAX = 480;
  const viewWidth = (availW, availH) => clamp(Math.round(VH * availW / Math.max(1, availH)), VW_MIN, VW_MAX);

  return { VW_MIN, VW_MAX, viewWidth, viewHeight, camShift, VH_MAX, CAM_TOP, CAM_BOTTOM, camTargetY, VW, VH, ACC, DEC, FRC, TOP, SLOPE, GRAV, JUMP, MAX_GSP, SPRING_V, PAD_V, INVULN, GROUND_REF, Y_MIN, Y_MAX, PIT_LIMIT, ZONES, TIME_PAR, START_LIVES,
    BELT_V, SAFE_AFTER, SKINS, DROP_SKIN, CRUMBLE_T, CRUMBLE_GONE, platOff, LOOP_R, LOOP_W, LOOP_MIN, SCATTER_MAX, CHAIN_POINTS, LIFE_RINGS, DASH_BASE, SHOES_TIME, INVINC_TIME, RING_GRAB, MAGNET_R, MAGNET_TIME, rng, buildLevel, groundY, angleAt, newGame, spawn, step, isSpin, canKill, pbox };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_SP;
