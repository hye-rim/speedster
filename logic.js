'use strict';
// 번개 다람쥐: 소닉 풍 고속 러너 규칙 (DOM 없음). 1/60초 한 칸씩 step() 으로 진행하고, 같은 코스·같은 입력이면 늘 같은 결과다.
// 움직임 값은 원작 소닉의 알려진 값(프레임당 픽셀)을 바탕으로 했다. 좌표는 픽셀, 위쪽이 y=0, 캐릭터 위치(x, y)는 발바닥이다.
const LOGIC_SP = (() => {
  const VW = 320, VH = 200;                                   // 화면에 보이는 크기
  const ACC = 0.046875, DEC = 0.5, FRC = 0.046875, TOP = 6;   // 가속·브레이크·마찰·달리기 최고 속도(px/프레임)
  const ROLL_FRC = 0.0234, ROLL_DEC = 0.125, ROLL_UP = 0.078, ROLL_DOWN = 0.3125, SLOPE = 0.125;
  const AIR_ACC = 0.09375, GRAV = 0.21875, JUMP = 6.5, JUMP_CUT = 4, MAX_FALL = 16, MAX_GSP = 16;
  // 코스마다 다른 적 (땅을 걷는 적, 날아다니는 적). 움직임 종류는 같고(땅=type crab, 공중=type bee) 모양·속도만 달라요
  const SKINS = { grass: ['snail', 'bird'], desert: ['scorpion', 'vulture'], jungle: ['frog', 'parrot'], ice: ['penguin', 'snowbat'], lava: ['lavablob', 'ember'], factory: ['gearbot', 'drone'], neon: ['spiderbot', 'ufo'], sky: ['puffer', 'kite'], water: ['urchin', 'jelly'] };
  const SKIN_SPD = { snail: 0.3, scorpion: 0.65, frog: 0.5, penguin: 0.6, lavablob: 0.4, gearbot: 0.7, spiderbot: 0.6, puffer: 0.35, bird: 0.8, vulture: 0.9, parrot: 0.8, snowbat: 0.85, ember: 0.9, drone: 0.75, ufo: 0.8, kite: 0.9, urchin: 0.45, jelly: 0.7 };
  const DROP_SKIN = { desert: 'boulder', ice: 'icicle', lava: 'meteor', factory: 'piston' };   // 위에서 떨어지는 위험물(경고 그림자 → 쿵) 코스별 모양
  const CRUMBLE_T = 36, CRUMBLE_GONE = 170;                       // 무너지는 징검돌: 밟고 서 있으면 이만큼 뒤에 사라지고, 한참 뒤에 다시 생긴다
  const platOff = (pl, t) => (pl.amp ? pl.amp * Math.sin(t / pl.per * Math.PI * 2 + pl.ph) : 0);   // 움직이는 발판의 좌우 흔들림
  const SPRING_V = 10, PAD_V = 10, HURT_VX = 2, HURT_VY = -4, INVULN = 120;
  const GROUND_REF = 150, Y_MIN = 78, Y_MAX = 168;            // 코스 땅 높이의 기준과 한계
  const PIT_LIMIT = 110;                                      // 구멍 폭 최대 (느리게 달려도 점프로 넘는다)
  const LOW_H = 18, LOW_TOP = 140, SHOT_LIFE = 170, RING_GRAB = 24, MAGNET_R = 130, MAGNET_TIME = 15 * 60, RING_R = 13, ENEMY_POINTS = 100, RING_POINTS = 10, START_LIVES = 3;
  const SCATTER_MAX = 32, CHAIN_POINTS = [100, 200, 500, 1000], LIFE_RINGS = 100;      // 맞으면 링이 최대 32개 흩어짐 · 연속 처치 점수 · 링 100개마다 목숨 하나
  const DASH_BASE = 8, DASH_MAX_CHARGE = 8, SHOES_TIME = 20 * 60, INVINC_TIME = 15 * 60;   // 스핀 대시 · 신발·무적 시간
  const LOOP_R = 40, LOOP_W = 36, LOOP_MIN = 5;                                              // 루프: 반지름·폭, 이 속도 이상으로 들어가야 한 바퀴 돈다
  const TIME_PAR = [110, 122, 134, 146, 158, 170, 182, 200, 210];        // 이 시간(초) 안에 끝내면 시간 보너스
  const SAFE_AFTER = 580;                                        // 스프링·점프대·긴 틈 뒤로 이만큼은 위험물을 안 둔다
  const CORK_MIN = 4.5, CORK_H = 26, TUBE_MIN = 2.5, TUBE_V = 7.5, WALL_MIN = 2.5, FAN_LIFT = 0.8, FAN_UP = 4.2, MUD_DRAG = 0.985;   // 코르크스크루 최소 속도·높이 · 튜브 최소·이동 속도 · 부서지는 벽 최소 속도 · 바람 구멍 · 늪
  const GATE_OPEN = 420;                                          // 스위치를 밟으면 문이 열려 있는 프레임(7초)
  const ZIP_V = 5.5, FLIP_COOL = 30, SPECIAL_TIME = 40 * 60, SPECIAL_NEED = 100, SPECIAL_LEN = 7200;       // 도르래 속도 · 플리퍼 재사용 대기 · 특별 스테이지 시간·필요한 링·길이
  const WATER_Y = 112, AIR_MAX = 20 * 60;                        // 수중 코스: 수면 높이 · 숨을 쉬지 않고 버티는 시간(프레임). 마지막 5초는 숫자를 센다
  const BELT_V = 1.3;                                            // 컨베이어가 밀어 주는 속도(px/프레임)
  // 코스 9개(마지막은 물속): 테마와 코스마다 고유한 구조(sig)가 있다. 골라 쓰는 sig 는 구간 생성 함수가 맡는다.
  //  valley 깊은 계곡 · tramp 스프링 줄 · iceslide 미끄러운 얼음 내리막 · lavaflame 용암 구멍에서 튀는 불꽃 · belt 컨베이어 · tunnel 가속 판 터널 · longgap 가속 판으로 넘는 긴 틈
  const ZONES = [
    { name: '초원 언덕', theme: 'grass', len: 24000, pit: 0.10, enemy: 0.30, spike: 0.00, hill: 46, sig: null, sigP: 0, style: 'rollers', styles: ['rollers', 'plateaus', 'bumps'], roll: 0.55, extra: ['stones'] },
    { name: '모래 협곡', theme: 'desert', mud: true, len: 28500, pit: 0.14, enemy: 0.34, spike: 0.06, hill: 54, sig: 'valley', sigP: 0.20, style: 'dunes', styles: ['dunes', 'plateaus', 'longslope'], roll: 0.5, extra: ['stones', 'dropper'] },
    { name: '정글 숲', theme: 'jungle', mud: true, len: 30800, pit: 0.14, enemy: 0.38, spike: 0.06, hill: 56, sig: 'tramp', sigP: 0.18, style: 'bumps', styles: ['bumps', 'rollers', 'sawtooth'], roll: 0.6, extra: ['floatbridge', 'stones'] },
    { name: '얼음 능선', theme: 'ice', len: 33200, pit: 0.16, enemy: 0.40, spike: 0.10, hill: 60, sig: 'iceslide', sigP: 0.20, style: 'longslope', styles: ['longslope', 'rollers', 'plateaus'], roll: 0.45, extra: ['stones', 'dropper'] },
    { name: '용암 화산', theme: 'lava', len: 34100, pit: 0.18, enemy: 0.42, spike: 0.12, hill: 62, sig: 'lavaflame', sigP: 0.22, style: 'sawtooth', styles: ['sawtooth', 'dunes', 'islands'], roll: 0.55, extra: ['stones', 'dropper'] },
    { name: '번개 공장', theme: 'factory', len: 36400, pit: 0.20, enemy: 0.46, spike: 0.14, hill: 64, sig: 'belt', sigP: 0.22, style: 'plateaus', styles: ['plateaus', 'sawtooth', 'highway'], roll: 0.5, extra: ['floatbridge', 'dropper'] },
    { name: '네온 도시', theme: 'neon', len: 37500, pit: 0.22, enemy: 0.48, spike: 0.16, hill: 66, sig: 'tunnel', sigP: 0.22, style: 'highway', styles: ['highway', 'plateaus', 'bumps'], roll: 0.4, extra: ['floatbridge', 'stones'] },
    { name: '구름 섬', theme: 'sky', len: 40200, pit: 0.24, enemy: 0.50, spike: 0.18, hill: 68, sig: 'longgap', sigP: 0.22, style: 'islands', styles: ['islands', 'rollers', 'highway'], roll: 0.5, extra: ['stones', 'floatbridge'] },
    { name: '수중 유적', theme: 'water', mud: true, len: 38900, pit: 0.14, enemy: 0.44, spike: 0.12, hill: 58, sig: null, sigP: 0, style: 'rollers', styles: ['rollers', 'plateaus', 'bumps'], roll: 0.5, extra: ['stones', 'floatbridge'], water: true },
  ];

  // 코스마다 「무엇을 하는 코스인가」: 위쪽 보너스 길의 종류와 개수, 즐겨 나오는 장치(팔레트). 같은 구조가 모든 코스에 반복되지 않게 코스마다 다르게 정한다.
  //  kinds: spring·fan·seesaw·lift·zip(위로 올라가는 길) · cave 굴 지름길 · slide 긴 얼음 미끄럼 · lowjump 낮은 징검 · tubeline 튜브 두 개 · channel 장애물 사이 헤엄
  const ZONE_PROFILE = [
    { kinds: ['spring'], count: [1, 1], pal: [] },                                                                       // 초원: 기본 학습, 짧은 보너스 길 한 번
    { kinds: ['cave'], count: [1, 1], pal: ['halfpipe', 'corkscrew', 'mud', 'seesaw', 'bumper'] },                     // 사막: 모래 내리막으로 속도, 낮은 굴 지름길
    { kinds: ['spring', 'zip', 'lift'], count: [2, 2], pal: ['seesaw', 'bumper', 'mud', 'wall', 'corkscrew'] },        // 정글: 올라가기의 대표
    { kinds: ['slide'], count: [1, 1], pal: ['halfpipe', 'corkscrew', 'bumper', 'wall', 'tube', 'fan'] },              // 얼음: 긴 미끄럼과 안전한 착지
    { kinds: ['lowjump'], count: [1, 2], pal: ['crusher', 'swing', 'wall', 'flipper', 'bumper', 'tube'] },             // 용암: 짧고 긴장되는 낮은 점프
    { kinds: ['lift', 'zip', 'seesaw', 'fork'], count: [1, 2], pal: ['crusher', 'wall', 'gate', 'tube', 'flipper', 'bumper'] }, // 공장: 위(발판) 아래(땅) 갈림, 벽·분쇄기
    { kinds: ['tubeline'], count: [1, 2], pal: ['tube', 'wall', 'gate', 'corkscrew', 'flipper', 'halfpipe'] },        // 네온: 터널 중심, 수직 점프 최소
    { kinds: ['fan', 'seesaw', 'spring', 'basin'], count: [2, 2], pal: ['fan', 'seesaw', 'zip', 'flipper', 'swing', 'bumper'] }, // 구름 섬: 바람과 공중
    { kinds: ['channel'], count: [1, 2], pal: ['current', 'tube', 'wall', 'crusher', 'swing', 'mud', 'seesaw'] },        // 수중: 위로 쌓지 않고 장애물 사이 헤엄
  ];
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (st, e) => { st.events.push(e); };

  // ---------- 코스 만들기 ----------
  // 땅은 높이 표(1픽셀마다 한 칸)로 둔다. 구멍은 Infinity. 언덕은 키 점 사이를 부드럽게 이어서 경사가 0.65(약 33도)를 넘지 않게 한다.
  function buildLevel(zone, seed) {
    const Z = ZONES[zone], rnd = rng(seed * 977 + zone * 31 + 7), len = Z.len;
    const H = new Float32Array(len + 16001).fill(Infinity);          // 만들다가 끝이 늘어날 수 있어 여유를 둔다(마지막에 L.len 에 맞춰 자른다)
    const L = { zone, name: Z.name, theme: Z.theme, sig: Z.sig, len, H, rings: [], enemies: [], springs: [], pads: [], spikes: [], checks: [], monitors: [], loops: [], ice: [], belts: [], longGaps: [], launches: [], seq: [], plats: [], highs: 0, pitN: 0, extras: 0, enemyN: 0, movers: 0, stonesN: 0, drops: 0, sigCount: 0, lows: [], cannons: [], lowN: 0, cannonN: 0, bumpers: [], swings: [], crushers: [], corks: [], tubes: [], walls: [], fans: [], mud: [], seesaws: [], flippers: [], zips: [], switches: [], doors: [], currents: [], giant: null, routes: [], bubbles: [], waterY: Z.water ? WATER_Y : null, boss: null, featured: [], goalX: len - 260 };
    let x = 0, y = GROUND_REF;
    const smooth = (x0, y0, x1, y1) => { for (let i = x0; i <= x1 && i < H.length; i++) { const t = (i - x0) / Math.max(1, x1 - x0), s = t * t * (3 - 2 * t); H[i] = y0 + (y1 - y0) * s; } };
    const flat = (n) => { smooth(x, y, x + n, y); const a = x; x += n; return [a, x]; };
    // 구간 지문: 같은 코스 안에서는 종류+모양+크기가 똑같은 구간이 두 번 나오지 않는다.
    // pick(종류, {값이름: [후보…]}) 이 아직 안 쓴 조합을 골라 주고(없으면 null), mark(조합이름) 으로 "썼다"고 적는다. 같은 종류는 CAP 번까지만 나온다.
    const used = new Set(), kindN = {}, sc = len / 19200, CAP = { tunnel: zone < 1 ? 0 : 2 + Math.floor(zone / 3), cannon: zone < 3 ? 0 : 1 + Math.floor((zone - 3) / 2), bumper: zone < 1 ? 0 : 1 + Math.floor(zone / 4), swing: zone < 3 ? 0 : 1 + Math.floor((zone - 3) / 3), crusher: zone < 5 ? 0 : 1 + Math.floor((zone - 5) / 3), corkscrew: zone < 1 || Z.water ? 0 : 1 + Math.floor(zone / 4), tube: zone < 2 ? 0 : 1 + Math.floor((zone - 2) / 3), wall: zone < 2 ? 0 : 1 + Math.floor((zone - 2) / 3), fan: zone < 3 ? 0 : 1 + Math.floor((zone - 3) / 3), mud: Z.mud ? 2 : 0, seesaw: zone < 1 ? 0 : 1 + Math.floor(zone / 4), flipper: zone < 2 ? 0 : 1 + Math.floor((zone - 2) / 4), zip: zone < 2 ? 0 : 1 + Math.floor((zone - 2) / 4), lift: zone < 2 ? 0 : 1 + Math.floor((zone - 2) / 3), halfpipe: zone < 1 || Z.water ? 0 : 1 + Math.floor(zone / 4), gate: zone < 4 || Z.water ? 0 : 1 + Math.floor((zone - 4) / 3), current: Z.water ? 2 : 0, breather: 99, enemy: 3 + Math.floor(zone * 0.8), pit: Math.round(4 * sc), sig: Math.round(4 * sc) };       // 긴 코스일수록 같은 종류가 조금 더 나올 수 있다
    // 코스마다 장치(기믹)를 전부 쓰지 않고, 그 코스에 나올 수 있는 것 중 몇 가지만 골라 쓴다(코스가 지나치게 길어지지 않게, 할 때마다 구성이 달라지게)
    const GIM = ['bumper', 'swing', 'crusher', 'corkscrew', 'tube', 'wall', 'fan', 'mud', 'seesaw', 'flipper', 'zip', 'lift', 'halfpipe', 'gate', 'current'];
    { const elig = GIM.filter((k) => CAP[k] > 0), pal = ZONE_PROFILE[zone].pal, n = Math.min(elig.length, 4 + Math.floor(zone / 2)), mine = elig.filter((k) => pal.includes(k)).sort(() => rnd() - 0.5), other = elig.filter((k) => !pal.includes(k)).sort(() => rnd() - 0.5), keep = new Set(mine.slice(0, Math.max(1, n - 1)).concat(other.slice(0, Math.max(1, n - Math.min(mine.length, n - 1))))); for (const k of GIM) if (!keep.has(k)) CAP[k] = 0; L.featured = [...keep]; }       // 코스의 팔레트에서 대부분, 한두 가지는 밖에서
    const capOf = (k) => k.startsWith('terrain') ? Math.round(2 * sc) : k.startsWith('sig') ? CAP.sig : k in CAP ? CAP[k] : Math.round(3 * sc);
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
    // 보너스 길(높은 길): 위로 올라가 발판 줄을 타고 링·아이템을 모으는 길. 들어가는 방법이 코스마다 다르다 — 스프링 · 바람 구멍 · 시소 · 승강기 · 도르래
    const addTube = (len, h, shape) => {                           // 튜브 하나를 지금 자리부터 놓는다(입구 x = 지금 x)
      const [a, b] = flat(len), pts = [];
      for (let k = 0; k <= 24; k++) { const u = k / 24, f = shape === 0 ? Math.sin(Math.PI * u) : shape === 1 ? Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.cos(3 * Math.PI * u)) : Math.abs(Math.sin(2 * Math.PI * u)); pts.push([a + u * len, y - h * f]); }
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const t = { x: a, x1: b, y, pts, cum, total: cum[cum.length - 1] }; L.tubes.push(t);
      for (let k = 3; k < pts.length - 2; k += 3) L.rings.push({ x: pts[k][0], y: pts[k][1] - 12 });
      return t;
    };
    const giantAt = (gx, gy2) => { if (!L.giant) L.giant = { x: gx, y: gy2 }; };       // 특별 스테이지 거대 링은 코스 고유의 길 위에 (점프로 닿는 높이)
    // 코스 고유의 선택 길(위로 올라가는 길 대신): 굴 지름길 · 긴 미끄럼 · 낮은 징검 · 튜브 두 개 · 장애물 사이 헤엄
    const signatureRoute = (K, v, d1) => {
      if (K === 'cave') {
        flat(260); for (let m = 0; m < 2; m++) { const len = (m ? 180 : 220) + v * 20, [a, b] = flat(len); L.lows.push({ x0: a, x1: b, gy: y }); for (let r = a + 18; r < b - 8; r += 28) L.rings.push({ x: r, y: y - 8 }); if (!m) flat(150); else { giantAt(b + 80, y - 80); L.rings.push({ x: b + 40, y: y - 36 }); L.rings.push({ x: b + 120, y: y - 36 }); } }
        flat(260); return;
      }
      if (K === 'slide') {
        const up = Math.min(54 + v * 6, y - Y_MIN - 6); if (up < 40) { const [fa, fb] = flat(400); giantAt((fa + fb) / 2, y - 80); ringsLine(fa, fb, 30, 22, 0); return; }
        slopeTo(-up); const [la, lb] = flat(130); giantAt((la + lb) / 2, y - 80); ringsLine(la, lb, 30, 22, 0);
        const d = 440 + (d1 - 118) * 3, s0 = x; smooth(x, y, x + d, y + up); x += d; y += up; L.ice.push({ x0: s0, x1: x }); ringsLine(s0, x, 30, 20, 1); flat(280); return;
      }
      if (K === 'lowjump') {
        flat(260); const x0 = x, W = 330; for (let m = 0; m < 3; m++) { const a = x0 + 14 + m * 120, b = a + 70; L.plats.push({ x0: a, x1: b, y: y - 28 }); for (let r = a + 14; r < b - 6; r += 26) L.rings.push({ x: r, y: y - 54 }); if (m === 1) giantAt((a + b) / 2, y - 96); }
        x += W; flat(300); return;
      }
      if (K === 'tubeline') { flat(260); const t1 = addTube(360 + v * 20, 50, v % 3), t2 = (flat(120), addTube(440, 80, (v + 1) % 3)); giantAt(t2.x1 + 70, y - 80); flat(260); return; }
      if (K === 'basin') {                                           // 재진입: 발판 줄을 건너다 떨어져도 움푹한 바닥에 안전하게 내려앉고, 가운데 스프링을 밟으면 발판 위로 되돌아온다
        flat(240); if (y > 108) slopeTo(108 - y); const y0 = y; flat(120); const dn = Math.min(58, Y_MAX - y0 - 4), st2 = (dy, d) => { smooth(x, y, x + d, y + dy); const a = x; x += d; y += dy; return [a, x]; };
        const [a1, b1] = st2(dn, 230); ringsLine(a1, b1, 30, 18, 1); const [a2, b2] = flat(360), cxm = (a2 + b2) / 2; L.springs.push({ x: cxm }); L.launches.push(cxm); ringsLine(a2, b2, 34, 20, 0);
        const [a3, b3] = st2(-dn, 230); const py = y0 - 10;
        for (const [pa, pb] of [[a1 + 10, a1 + 130], [cxm - 60, cxm + 60], [b3 - 130, b3 - 10]]) { L.plats.push({ x0: pa, x1: pb, y: py }); for (let r = pa + 14; r < pb - 6; r += 26) L.rings.push({ x: r, y: py - 22 }); }
        giantAt(cxm, py - 90); flat(240); return;
      }
      if (K === 'channel') {
        flat(260); for (let m = 0; m < 2; m++) { const [a, b] = flat(230); L.swings.push({ x: (a + b) / 2, y: y - 27 - 100, len: 100, per: 150 + 25 * ((v + m) % 3), ph: rnd() * 6.283, gy: y }); for (let r = a + 20; r < b - 10; r += 36) L.rings.push({ x: r, y: y - 30 }); flat(160); }
        const [ca, cb] = flat(52); L.crushers.push({ x0: ca, x1: cb, gy: y, per: 150, ph: Math.floor(rnd() * 150) }); giantAt(cb + 90, y - 80); L.currents.push({ x0: ca - 640, x1: cb, y0: WATER_Y, y1: y + 4, dx: 0.7, dy: 0 }); flat(260); return;
      }
    };
    const PR = ZONE_PROFILE[zone], wantRoutes = PR.count[0] + (PR.count[1] > PR.count[0] && rnd() < 0.5 ? 1 : 0);               // 코스 성격에 따라 한두 번
    const highroad = () => {
      const kinds = PR.kinds, o = pick('highroad', { k: kinds, v: zone === 0 ? [0, 1] : zone === 1 ? [0, 1, 2] : [0, 1, 2, 3], d: [118, 126, 134, 142, 150] }); if (!o) return false; mark(o);
      guard();
      const v = o.v, d1 = o.d, K0 = o.k, K = K0 === 'fork' ? 'lift' : K0;                       // fork = 승강기로 올라가는 위 길 + 아래 땅의 장애물 길(갈림길)
      if (['cave', 'slide', 'lowjump', 'tubeline', 'channel', 'basin'].includes(K)) { signatureRoute(K, v, d1); safeUntil = x + SAFE_AFTER; L.highs++; L.routes.push(K); return true; }
      // 첫 발판은 들어가는 길에서 날아가 내려앉는 자리고, 뒤는 모양마다 달라요: 0 징검 · 1 계단 오르막 · 2 지그재그 · 3 움직이는 발판 건너기
      const first = K === 'spring' ? [0, 350, d1] : K === 'fan' ? [0, 300, 80] : K === 'seesaw' ? [0, 280, 100] : K === 'lift' ? [0, 190, 108] : [0, 240, 58];
      const rest = v === 0 ? [[70, 210, 150], [80, 230, 126], [70, 170, 136]]
        : v === 1 ? [[60, 220, first[2] + 28], [60, 220, first[2] + 56], [70, 200, first[2] + 56]]
        : v === 2 ? [[90, 130, first[2] - 14], [90, 130, first[2] + 22], [90, 130, first[2] - 10], [80, 160, first[2] + 6]]
        : [[100, 150, first[2] + 4, 35], [90, 280, first[2] - 10]];
      const spec = [first, ...rest].map((q, i) => (K !== 'spring' && i > 0 ? [q[0], q[1], Math.min(150, Math.max(70, q[2])), q[3]] : q));
      const lead = K === 'spring' ? 250 : 330, total = spec.reduce((s, q) => s + q[0] + q[1], lead) + 200, [a] = flat(Math.max(1300, total)), gy = y; let cx;
      if (K === 'spring') { const sx = a + 80; L.springs.push({ x: sx }); L.launches.push(sx); cx = sx + 170; }
      else if (K === 'fan') { const fx = a + 120; L.fans.push({ x: fx, w: 84, gy, top: gy - 150 }); for (let k = 0; k < 6; k++) L.rings.push({ x: fx + Math.sin(k * 1.3) * 12, y: gy - 30 - k * 20 }); cx = fx + 30; }
      else if (K === 'seesaw') { const bx = a + 120; L.seesaws.push({ x: bx, len: 90, gy }); L.launches.push(bx); for (let k = 1; k <= 6; k++) { const t = k * 8; L.rings.push({ x: bx + 5.5 * t, y: gy - (7.9 * t - 0.109 * t * t) - 14 }); } cx = bx + 150; }
      else if (K === 'lift') { const lx = a + 100, up = 104, pl = { x0: lx, x1: lx + 60, y: gy - 4, y0: gy - 4 - up / 2, yamp: up / 2, yper: 360, ph: Math.PI / 2, elev: true }; pl.y = pl.y0 + pl.yamp * Math.sin(pl.ph); L.plats.push(pl); cx = lx + 60 + 40; }
      else { const zx = a + 100, z = { x0: zx, y0: gy - 72, x1: zx + 400, y1: gy - 40, gy }; L.zips.push(z); for (let k = 2; k < 10; k++) { const u = k / 10; L.rings.push({ x: zx + u * 400, y: z.y0 + u * (z.y1 - z.y0) + 8 }); } cx = zx + 400 + 60; }
      const mi = v >= 2 ? 2 : 1;
      spec.forEach(([gap, w, dy, amp], i) => {
        const x0 = cx + gap, x1 = x0 + w, py = gy - dy, pl = { x0, x1, y: py, hr: true }; if (amp) { pl.amp = amp; pl.per = 170; pl.ph = rnd() * 6; } L.plats.push(pl);
        for (let r = x0 + 22; r < x1 - 10; r += 26) L.rings.push({ x: r, y: py - 22 });
        if (i < spec.length - 1) for (let k = 1; k <= 3; k++) L.rings.push({ x: x1 + k * (spec[i + 1][0] / 4), y: py - 40 - Math.sin(k / 4 * Math.PI) * 18 });
        if (i === mi) L.monitors.push({ x: x0 + w / 2, y: py, type: (zone === 0 ? ['ring10', 'shield', 'magnet'] : ['ring10', 'shield', 'shoes', 'invincible', 'magnet', zone > 1 ? 'life' : 'magnet'])[Math.floor(rnd() * (zone === 0 ? 3 : 6))] });
        cx = x1;
      });
      for (let r = a + 130; r < a + 560; r += 44) L.rings.push({ x: r, y: gy - 20 });
      if (K0 === 'fork') {                                         // 아래 길: 가시(뛰어 넘기)와 벽(구르기로 부수기)이 이어진다. 위 길은 안전하지만 승강기를 타야 한다
        L.spikes.push({ x: a + 330 }, { x: a + 390 }); L.walls.push({ x: a + 800, w: 14, gy, h: 120 });
        for (const rx of [a + 470, a + 560, a + 650, a + 730, a + 900, a + 960]) L.rings.push({ x: rx, y: gy - 22 });
      }
      safeUntil = cx + SAFE_AFTER; L.highs++; L.routes.push(K0); return true;
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
    const MON = zone === 0 ? ['ring10', 'shield', 'magnet'] : ['ring10', 'ring10', 'shield', 'shield', 'shoes', 'invincible', 'magnet', 'magnet', 'life'].concat(zone >= 2 ? ['aqua'] : [], zone >= 4 ? ['fire', 'fire'] : [], zone >= 5 ? ['thunder', 'thunder'] : [], Z.water ? ['aqua', 'aqua', 'aqua'] : []);      // 방패 종류: 불(4코스~) · 번개(5코스~) · 물(수중에서 많이)
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
    make.tunnel = () => {                                         // 낮은 굴: 천장 밑 틈이 낮아서 굴러야 지나간다 (서서 들어가면 부딪힌다). 굴 안에는 링
      const o = pick('tunnel', { len: [140, 180, 220, 260], n: [1, 2], gap: [160, 220], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
      flat(220); const cnt = o.n;
      for (let m = 0; m < cnt; m++) {
        if (m) flat(o.gap); const [a, b] = flat(o.len); L.lows.push({ x0: a, x1: b, gy: y });
        for (let k = 0; k < Math.floor(o.len / 40); k++) L.rings.push({ x: a + 20 + k * 40, y: y - 8 });
      }
      flat(180); L.lowN++; return true;
    };
    make.cannon = () => {                                         // 대포: 끝에 대포가 있고 낮은 포탄이 날아온다 (구르거나 높이 뛰어 피한다)
      const o = pick('cannon', { len: [440, 500, 560], per: [130, 150, 170], sp: [2.4, 2.8], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
      const [a, b] = flat(o.len); L.cannons.push({ x: b - 40, gy: y, per: o.per, sp: o.sp, ph: Math.floor(rnd() * o.per) });
      ringsLine(a, b - 120, 36, 22, o.pat); flat(200); L.cannonN++; return true;
    };
    make.bumper = () => {                                         // 범퍼: 머리 위에 둥근 범퍼가 떠 있다. 뛰어 부딪히면 튕겨 나가고 점수. 밑으로 걸어가면 아무 일 없다
      const o = pick('bumper', { n: [3, 4, 5], sp: [48, 60], h: [42, 54], pat: [0, 1, 2, 3] }); if (!o) return false; mark(o); guard();
      flat(200); const [a, b] = flat(80 + o.n * o.sp), gy = y;
      for (let k = 0; k < o.n; k++) { L.bumpers.push({ x: a + 60 + k * o.sp, y: gy - o.h - (k % 2 ? 0 : 10), r: 11 }); if (k) L.rings.push({ x: a + 60 + (k - 0.5) * o.sp, y: gy - o.h - 28 }); }
      ringsLine(a, b, 30, 20, o.pat); flat(180); return true;
    };
    make.swing = () => {                                          // 흔들리는 철구: 서서 지나가면 맞고, 몸을 말면 밑으로 지나간다(공이 가장 낮을 때 중심이 바닥 위 27, 반지름 9.5)
      const o = pick('swing', { n: [1, 2, 2, 3], len: [96, 108], per: [140, 170, 200], gap: [150, 210] }); if (!o) return false; mark(o); guard();
      flat(240);
      for (let m = 0; m < o.n; m++) { if (m) flat(o.gap); const [a, b] = flat(230); L.swings.push({ x: (a + b) / 2, y: y - 27 - o.len, len: o.len, per: o.per, ph: rnd() * 6.283, gy: y }); }
      flat(200); return true;
    };
    make.crusher = () => {                                        // 분쇄기: 위에서 쿵 내려와 길을 막는 블록. 올라가 있을 때 지나가거나, 내려와 있으면 뛰어 넘는다
      const o = pick('crusher', { n: [1, 2], w: [44, 52], per: [140, 170], gap: [170, 240] }); if (!o) return false; mark(o); guard();
      flat(240);
      for (let m = 0; m < o.n; m++) { if (m) flat(o.gap); const [a, b] = flat(o.w); L.crushers.push({ x0: a, x1: b, gy: y, per: o.per, ph: Math.floor(rnd() * o.per) }); L.rings.push({ x: (a + b) / 2, y: y - 64 }); }
      flat(200); return true;
    };
    make.corkscrew = () => {                                      // 코르크스크루: 빠르게(4.5↑) 들어가면 땅 위로 솟은 나선 길을 따라 휙 지나간다. 느리면 밑의 땅을 걸어서 지난다
      const o = pick('corkscrew', { len: [200, 240, 280], pre: [320, 380, 440], post: [160, 200] }); if (!o) return false; mark(o); guard();
      flat(o.pre); const [a, b] = flat(o.len); L.corks.push({ x: a, len: o.len, y });
      for (let k = 1; k <= 9; k++) { const u = k / 10; L.rings.push({ x: a + u * o.len, y: y - 12 - CORK_H * Math.sin(Math.PI * u) }); }
      flat(o.post); return true;
    };
    make.tube = () => {                                           // 튜브: 입구로 달려 들어가면 조작 없이 관을 따라 휙 이동해 출구로 튀어나온다(관 안은 안 다친다)
      const o = pick('tube', { len: [360, 440, 520], h: [50, 80, 110], shape: [0, 1, 2], pre: [240, 300] }); if (!o) return false; mark(o); guard();
      flat(o.pre); addTube(o.len, o.h, o.shape); flat(220); return true;
    };
    make.wall = () => {                                           // 부서지는 벽: 높아서 못 넘는다. 몸을 말고(구르기·스핀 대시) 2.5 이상으로 부딪히면 부서진다
      const o = pick('wall', { n: [1, 2], gap: [200, 260], h: [110, 130], lead: [260, 320] }); if (!o) return false; mark(o); guard();
      flat(o.lead);
      for (let m = 0; m < o.n; m++) { if (m) flat(o.gap); const [a] = flat(14); L.walls.push({ x: a, w: 14, gy: y, h: o.h }); const [c, d] = flat(120); ringsLine(c, d, 30, 20, 0); }
      flat(200); return true;
    };
    make.fan = () => {                                            // 바람 구멍: 위로 부는 바람. 점프해서 타면 높은 곳의 링 길까지 떠오른다
      const o = pick('fan', { top: [120, 150], w: [44, 52] }); if (!o) return false; mark(o); guard();
      flat(240); const [a, b] = flat(120); const cx = (a + b) / 2; L.fans.push({ x: cx, w: o.w, gy: y, top: y - o.top });
      for (let k = 0; k < 6; k++) L.rings.push({ x: cx + Math.sin(k * 1.3) * 12, y: y - 30 - k * (o.top - 40) / 5 });
      flat(200); return true;
    };
    make.mud = () => {                                            // 늪: 서 있는 땅이 질척거려 속도가 잘 안 붙는다(점프하면 속도를 지키고, 스핀 대시로 빠져나간다)
      const o = pick('mud', { len: [160, 220, 280] }); if (!o) return false; mark(o); guard();
      flat(200); const [a, b] = flat(o.len); L.mud.push({ x0: a, x1: b }); ringsLine(a, b, 30, 22, 1); flat(160); return true;
    };
    make.seesaw = () => {                                         // 시소 발사대: 높은 데서 떨어져 밟을수록 크게 튕겨 오른다(걸어 올라가면 작게 통통). 위에 링 호
      const o = pick('seesaw', { len: [80, 100], pre: [240, 300] }); if (!o) return false; mark(o); guard();
      flat(o.pre); const [a, b] = flat(o.len), cx = (a + b) / 2; L.seesaws.push({ x: cx, len: o.len, gy: y }); L.launches.push(cx); safeUntil = b + SAFE_AFTER;
      for (let k = 1; k <= 8; k++) { const t = k * 8; L.rings.push({ x: cx + 5.5 * t, y: y - (8 * t - 0.109 * t * t) - 14 }); }
      flat(280); return true;
    };
    make.flipper = () => {                                        // 핀볼 플리퍼: 위에서 점프를 누르면 크게 쳐 올리고, 빠르게(4↑) 달려 지나가면 저절로 튕긴다
      const o = pick('flipper', { n: [1, 2], gap: [230, 300], pre: [240, 300] }); if (!o) return false; mark(o); guard();
      flat(o.pre);
      for (let m = 0; m < o.n; m++) { if (m) flat(o.gap); const [a] = flat(46); L.flippers.push({ x: a, len: 46, gy: y }); L.launches.push(a); safeUntil = a + 46 + SAFE_AFTER; for (let k = 1; k <= 7; k++) { const t = k * 8; L.rings.push({ x: a + 30 + 4.5 * t, y: y - (9 * t - 0.109 * t * t) - 14 }); } }
      flat(260); return true;
    };
    make.zip = () => {                                            // 도르래 손잡이: 레일 앞쪽에서 점프해 잡으면 레일을 따라 쭉 미끄러진다(점프 버튼으로 놓는다)
      const o = pick('zip', { len: [380, 460, 520], h0: [66, 76], drop: [20, 34], pre: [240, 300] }); if (!o) return false; mark(o); guard();
      flat(o.pre); const [a, b] = flat(o.len); const y0 = y - o.h0, y1 = y - o.h0 + o.drop;
      L.zips.push({ x0: a, y0, x1: b, y1, gy: y });
      for (let k = 2; k < 10; k++) { const u = k / 10; L.rings.push({ x: a + u * o.len, y: y0 + u * (y1 - y0) + 8 }); }
      flat(220); return true;
    };
    make.lift = () => {                                           // 승강기: 오르내리는 발판을 타고 위의 발판(링)까지 올라간다. 안 타도 지나갈 수 있다
      const o = pick('lift', { up: [90, 110], w: [56, 64], per: [320, 400], pre: [240, 300] }); if (!o || y - 38 < 56) return false; o.up = Math.min(o.up, y - 38); mark(o); guard();      // 땅이 너무 높으면(위가 모자라면) 안 만든다
      flat(o.pre); const [a] = flat(o.w + 220), top = y - 4 - o.up, mid = y - 4 - o.up / 2;
      const pl = { x0: a, x1: a + o.w, y: y - 4, y0: mid, yamp: o.up / 2, yper: o.per, ph: Math.PI / 2, elev: true }; pl.y = pl.y0 + pl.yamp * Math.sin(pl.ph); L.plats.push(pl);
      const lx = a + o.w + 40; L.plats.push({ x0: lx, x1: lx + 120, y: top });
      for (let r = lx + 20; r < lx + 110; r += 24) L.rings.push({ x: r, y: top - 22 });
      flat(220); return true;
    };
    make.gate = () => {                                           // 스위치와 문: 바닥 스위치를 밟으면 앞의 문이 7초 동안 열린다. 늦으면 문이 닫혀 길이 막힌다(속도 조절)
      const o = pick('gate', { d: [240, 300], h: [110, 130], pre: [240, 300] }); if (!o) return false; mark(o); guard();
      flat(o.pre); const [a, b] = flat(46), id = L.switches.length; L.switches.push({ x: (a + b) / 2, gy: y, id }); flat(o.d); const [c] = flat(14); L.doors.push({ x: c, w: 14, gy: y, h: o.h, id });
      for (let k = 1; k <= 5; k++) L.rings.push({ x: b + k * (o.d / 6), y: y - 22 }); const [e, f] = flat(120); ringsLine(e, f, 30, 20, 1); flat(200); return true;
    };
    make.current = () => {                                        // 물살과 기포 기둥(수중): 흐름은 옆으로 밀고, 기둥은 위로 띄운다
      const o = pick('current', { k: ['flow', 'flow', 'up'], len: [360, 440, 520], dir: [1, 1, -1] }); if (!o) return false; mark(o); guard();
      flat(220);
      if (o.k === 'flow') { const [a, b] = flat(o.len); L.currents.push({ x0: a, x1: b, y0: WATER_Y, y1: y + 4, dx: 0.9 * o.dir, dy: 0 }); ringsLine(a, b, 34, 24, 0); }
      else { const [a, b] = flat(90); L.currents.push({ x0: a, x1: b, y0: WATER_Y, y1: y + 4, dx: 0, dy: -0.42 }); for (let k = 0; k < 6; k++) L.rings.push({ x: (a + b) / 2 + Math.sin(k * 1.4) * 14, y: y - 30 - k * Math.max(10, (y - WATER_Y - 50) / 6) }); }
      flat(220); return true;
    };
    make.halfpipe = () => {                                       // 하프파이프: 높은 곳에서 가파르게 내려가 바닥을 지나 반대쪽 벽을 올라간다. 속도를 받아 위에서 튀어 나간다
      const o = pick('halfpipe', { dn: [50, 56], d: [130, 150], bottom: [120, 200], lip: [60, 100] }); if (!o) return false; mark(o); guard();
      if (y > 112) slopeTo(112 - y);
      flat(180); const dn = Math.min(o.dn, Y_MAX - y); if (dn < 36) { flat(120); return true; }
      const steep = (dy, d) => { smooth(x, y, x + d, y + dy); const a = x; x += d; y += dy; return [a, x]; };
      const [a1, b1] = steep(dn, o.d); ringsLine(a1, b1, 24, 18, 1); const [a2, b2] = flat(o.bottom); ringsLine(a2, b2, 28, 20, 0);
      const [a3, b3] = steep(-dn, o.d); ringsLine(a3, b3, 24, 18, 1); const [, e] = flat(o.lip); L.launches.push(e); safeUntil = e + SAFE_AFTER;
      for (let k = 1; k <= 6; k++) L.rings.push({ x: e + 10 + k * 22, y: y - 20 - Math.sin(k / 7 * Math.PI) * 50 }); flat(160); return true;
    };
    const tryGimmick = (pk, x) => { for (const g of GIM) if (x > 1300 && x < len - 2400 && !pk(g) && room(g) && (kindN[g] || 0) < Math.floor(x / len * capOf(g) * 1.3 + 0.5) && make[g]()) return true; return false; };
    while (x < len - 2200) {
      const q = rnd();
      if (L.checks.length < 2 && x > len * nextCheck / 3) { const [a] = flat(160); L.checks.push({ x: a + 80 }); nextCheck++; continue; }
      if (Z.style && x > 700 && x < len - 1800 && x >= safeUntil && rnd() < Z.roll) { const t = pickTerrain(); if (t) terrain(t); }      // 땅 모양(언덕 등)을 먼저 깔고, 같은 차례에 보통 구간도 이어서 만든다
      const prev = L.seq[L.seq.length - 1] || '', pk = (k) => prev.startsWith(k);
      if (Z.sig && x > 900 && x < len - 1400 && !pk('sig:') && (rnd() < Z.sigP || L.sigCount < Math.floor(x / len * 5)) && trySig([Z.sig], 'sig:')) { L.sigCount++; continue; }
      if (x > 2200 && x < len - 2800 && L.extras < Math.floor(x / len * 3.5) && Z.extra && trySig(Z.extra, 'x:')) { L.extras++; continue; }
      if (x > 1000 && x < len - 1500 && !pk('enemy') && L.enemyN < Math.min(CAP.enemy, Math.floor(x / len * CAP.enemy * 1.5)) && enemySeg()) continue;      // 적 구간도 코스마다 꼭 몇 개는 있게
      if (x > 1200 && x < len - 1800 && !pk('tunnel') && room('tunnel') && (kindN.tunnel || 0) < Math.floor(x / len * capOf('tunnel') * 1.3 + 0.5) && make.tunnel()) { norm(); continue; }
      if (x > 1600 && x < len - 1800 && !pk('cannon') && room('cannon') && (kindN.cannon || 0) < Math.floor(x / len * capOf('cannon') * 1.3 + 0.5) && make.cannon()) { norm(); continue; }
      if ((q < 0.10 || (kindN.loop || 0) < Math.floor(x / len * 3)) && x > 900 && !pk('loop') && !Z.water) {                                  // 루프: 앞에 달릴 평지, 루프, 뒤에 평지. 링이 원을 따라 놓인다
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
      if (x > 1400 && x < len - 2600 && L.highs < Math.ceil(x / len * wantRoutes) && room('highroad') && highroad()) continue;
      if (tryGimmick(pk, x)) { norm(); continue; }
      const kindOf = (v) => v < Z.pit ? 'pit' : v < Z.pit + 0.14 ? 'ramp' : v < Z.pit + 0.14 + Z.enemy ? 'enemy' : v < Z.pit + 0.14 + Z.enemy + Z.spike ? 'spike' : v < Z.pit + 0.14 + Z.enemy + Z.spike + 0.12 ? 'spring' : v < Z.pit + 0.14 + Z.enemy + Z.spike + 0.22 ? 'pad' : 'hill';
      const forcePit = x > 1800 && L.pitN < Math.floor(x / len * 3) && room('pit'), last2 = L.seq.slice(-2);
      let r = forcePit ? 0 : rnd(), kind = kindOf(r);
      for (let t = 0; t < 24 && !forcePit && (!room(kind) || last2.some((k) => k.startsWith(kind))); t++) { r = rnd(); kind = kindOf(r); }      // 다 쓴 종류, 방금 한 두 가지와 같은 종류는 피한다
      if (!(make[kind]() || breather())) flat(220);
      norm();
    }
    for (let n = 0; n < 2 && L.highs < 1 && room('highroad'); n++) if (!highroad()) break;                // 보너스 길(거대 링이 있는 곳)은 적어도 한 번은 있게
    for (const g of GIM) {          // 다른 구간에 밀려 한 번도 못 나온 장치는 코스 끝에 덧붙인다(그만큼 코스가 길어진다)
      for (let n = 0; n < 2 && capOf(g) > 0 && (kindN[g] || 0) < Math.min(capOf(g), 1); n++) { if (!make[g]()) break; norm(); }
    }
    smooth(x, y, x + 220, GROUND_REF); x += 220; y = GROUND_REF;          // 끝은 부드럽게 내려와 평평하게. 마지막 구간이 길게 나왔으면 보스 방과 골이 뒤로 밀린다
    const end = Math.max(len, x + 1300); L.len = end; L.goalX = end - 260; smooth(x, y, end, y); L.H = H.slice(0, end + 1);
    L.rings = L.rings.filter((q) => q.x < end - 300);
    { const hrp = L.plats.filter((q) => q.hr); if (!L.giant && hrp.length >= 3) L.giant = { x: (hrp[2].x0 + hrp[2].x1) / 2, y: hrp[2].y - 38 }; }      // 높은 길 위에 숨은 거대 링: 닿으면 특별 스테이지
    L.boss = { x0: end - 950, x1: end - 400, gy: GROUND_REF, hp: 5 + Math.floor(zone / 2), check: end - 1060 };           // 골 앞 보스 방: 끝까지 평평하다. 보스를 쓰러뜨려야 지나간다
    for (let k = 0; k < 8; k++) L.rings.push({ x: L.boss.x0 + 60 + k * 44, y: GROUND_REF - 22 });
    if (Z.water) {                                                // 수중 코스: 숨 쉴 수 있는 큰 거품을 물속 땅 위에, 보스 방까지 포함해 1300 안팎 간격으로
      let last = -9999;
      for (let bx = 700; bx < end - 200; bx += 50) {
        if (bx - last < 1300) continue; let got = false;
        for (let d = 0; d < 300 && !got; d += 20) for (const sg of [1, -1]) { const xx = bx + sg * d, g = H[xx]; if (Number.isFinite(g) && g > WATER_Y + 24) { L.bubbles.push({ x: xx, y: Math.max(g - 34, WATER_Y + 12) }); last = xx; got = true; break; } }
      }
    }
    L.plats.forEach((p, i) => { p.id = i; });
    return L;
  }

  // ---------- 특별 스테이지 ----------
  // 높은 길의 거대 링에 닿으면 들어간다: 물결치는 땅 위에 링이 가득하고, 시간(40초) 안에 끝까지 가며 링을 SPECIAL_NEED 개 이상 모으면 에메랄드. 가시에 맞으면 링 5개를 잃을 뿐 죽지 않는다
  function buildSpecial(seed) {
    const sp = buildLevel(0, seed + 91);                           // 모든 필드가 있는 빈 코스를 만든 뒤 비운다
    for (const k of Object.keys(sp)) if (Array.isArray(sp[k])) sp[k] = [];
    const rnd = rng(seed * 53 + 11), len = SPECIAL_LEN, H = new Float32Array(len + 1);
    for (let x = 0; x <= len; x++) { const w = Math.min(1, x / 300, (len - x) / 300); H[x] = 140 + w * (26 * Math.sin(x / 150) + 13 * Math.sin(x / 61 + 1)); }
    sp.H = H; sp.len = len; sp.goalX = len - 260; sp.theme = 'special'; sp.name = '특별 스테이지'; sp.sig = null; sp.boss = null; sp.waterY = null; sp.giant = null;
    for (let x = 220; x < len - 400; x += 36) { sp.rings.push({ x, y: H[x] - 18 }); if (Math.floor(x / 36) % 5 < 2) sp.rings.push({ x: x + 18, y: H[x + 18] - 58 }); }
    for (let x = 700; x < len - 600; x += 520 + Math.floor(rnd() * 200)) sp.spikes.push({ x });
    for (let x = 1300; x < len - 800; x += 1600) { sp.springs.push({ x }); sp.launches.push(x); }
    return sp;
  }
  function enterSpecial(st) {
    const L = st.level, p = st.p, sp = buildSpecial(st.zone * 7 + 1);
    st.sp = { saved: { level: L, enemies: st.enemies, got: st.got, mag: st.mag, mon: st.mon, bub: st.bub, bump: st.bump, broke: st.broke, ss: st.ss, flip: st.flip, scatter: st.scatter, gone: st.gone, cr: st.cr, bbombs: st.bbombs, bshots: st.bshots, rings: st.rings, nextLife: st.nextLife, pos: { x: p.x, y: p.y } }, left: SPECIAL_TIME, collected: 0 };
    st.level = sp; st.enemies = []; st.got = new Set(); st.mag = {}; st.mon = new Set(); st.bub = {}; st.bump = {}; st.broke = {}; st.ss = {}; st.flip = {}; st.scatter = []; st.gone = {}; st.cr = {}; st.bbombs = []; st.bshots = []; st.rings = 0; st.nextLife = 1e9; st.giantTaken = true;
    p.x = 80; p.y = groundY(sp, 80); p.lx = p.x; p.ly = p.y; p.vx = 0; p.vy = 0; p.gsp = 0; p.ground = true; p.roll = false; p.loop = null; p.jumping = false; p.inv = 60; p.plat = null; p.zipped = false;
    emit(st, { t: 'specialin' });
  }
  function exitSpecial(st) {
    const sp = st.sp, sv = sp.saved, p = st.p, collected = st.rings, ok = collected >= SPECIAL_NEED;
    st.level = sv.level; st.enemies = sv.enemies; st.got = sv.got; st.mag = sv.mag; st.mon = sv.mon; st.bub = sv.bub; st.bump = sv.bump; st.broke = sv.broke; st.ss = sv.ss; st.flip = sv.flip; st.scatter = sv.scatter; st.gone = sv.gone; st.cr = sv.cr; st.bbombs = sv.bbombs; st.bshots = sv.bshots; st.rings = sv.rings; st.nextLife = sv.nextLife;
    p.x = sv.pos.x; p.y = sv.pos.y; p.lx = p.x; p.ly = p.y; p.vx = 0; p.vy = 0; p.gsp = 0; p.ground = false; p.roll = false; p.loop = null; p.jumping = false; p.inv = INVULN; p.plat = null;
    st.sp = null; if (ok) { st.emeralds++; st.score += 5000 + collected * 100; } else st.score += collected * 20;
    emit(st, { t: 'special', ok, collected, need: SPECIAL_NEED, emeralds: st.emeralds });
  }
  function stepSpecial(st) { const sp = st.sp; sp.left--; sp.collected = st.rings; if (st.p.x >= st.level.goalX || sp.left <= 0) exitSpecial(st); }

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
    if (opts.tutorial) tutorialStage(level);
    const st = {
      zone, level, lives: opts.lives || START_LIVES, score: opts.score | 0, rings: 0, ringsTotal: 0, t: 0, events: [], phase: 'play', tutorial: !!opts.tutorial,
      checkX: 60, deaths: 0, kills: 0, spring: 0, maxSpeed: 0, chain: 0, nextLife: LIFE_RINGS, mon: new Set(), loopsRun: 0, monitorsBroken: 0,
      enemies: [], clearT: 0, dyingT: 0, scatter: [], got: new Set(), cr: {}, gone: {}, mag: {}, bub: {}, bump: {}, broke: {}, gate: {}, ss: {}, flip: {}, emeralds: 0, giantTaken: false, sp: null, boss: null, bossOn: false, bossDown: false, bbombs: [], bshots: [], noBoss: opts.boss === false || !!opts.tutorial,
    };
    st.enemies = level.enemies.map((e, i) => ({ id: i, type: e.type, skin: e.skin, spd: SKIN_SPD[e.skin], x: e.x, y: e.y, home: e.home, range: e.range, base: e.base, dir: i % 2 ? 1 : -1, alive: true, vy: 0 }));
    if (st.tutorial) st.enemies.unshift({ id: 900, type: 'crab', skin: SKINS[level.theme][0], spd: SKIN_SPD[SKINS[level.theme][0]], x: 640, y: groundY(level, 640), home: 640, range: 40, dir: 1, alive: true, vy: 0 });      // 연습: 처음에 게 한 마리
    spawn(st, 60);
    return st;
  }
  // 연습 코스(1코스)에는 굴·대포가 없으니, 다른 것이 없는 평평한 구간을 찾아 낮은 굴 하나와 대포 하나를 놓는다(튜토리얼 전용).
  function tutorialStage(L) {
    const pts = [].concat(L.springs.map((e) => e.x), L.pads.map((e) => e.x), L.spikes.map((e) => e.x), L.checks.map((e) => e.x), L.monitors.map((e) => e.x), L.loops.map((e) => e.x - 200));
    const ranges = [].concat(L.plats, L.ice, L.belts, L.longGaps).map((r) => [r.x0, r.x1]), loopR = L.loops.map((l) => [l.x - 200, l.x + LOOP_W + 400]);
    const busy = (a, b) => pts.some((x) => x > a - 60 && x < b + 60) || ranges.concat(loopR).some((r) => r[1] > a - 60 && r[0] < b + 60);
    const flatAt = (a, b) => { for (let i = a; i <= b; i++) if (!(Math.abs(L.H[i] - L.H[a]) < 0.01)) return false; return true; };
    for (let a = 760; a < L.len - 1400; a += 40) {
      const b = a + 640; if (!flatAt(a, b) || busy(a, b)) continue;
      const x0 = a + 90, x1 = x0 + 160, gy = L.H[a];
      L.rings = L.rings.filter((r) => !(r.x > a && r.x < b)); L.enemies = L.enemies.filter((e) => !(e.x > a - 60 && e.x < b + 60));      // 구간 안의 적은 치운다
      L.lows.push({ x0, x1, gy }); for (let k = 0; k < 4; k++) L.rings.push({ x: x0 + 20 + k * 40, y: gy - 8 });
      L.cannons.push({ x: b - 40, gy, per: 150, sp: 2.4, ph: 0 });
      L.tutorialStage = { x0, x1, cannonX: b - 40 }; return;
    }
  }
  function spawn(st, x) {
    const L = st.level;
    st.p = { x, y: groundY(L, x), vx: 0, vy: 0, gsp: 0, ground: true, spin: false, roll: false, face: 1, inv: 60, dead: false, jumping: false, jumpHeld: false, hurt: 0, moved: false, crouch: false, charge: 0, dashRoll: false, shield: false, invinc: 0, shoes: 0, magnet: 0, lx: x, ly: groundY(L, x), loop: null, plat: null, air: AIR_MAX, shType: null, shUsed: false, bounce: false, fireT: 0 };
    if (!st.bossDown) { st.bossOn = false; st.boss = null; st.bbombs = []; st.bshots = []; }      // 죽어서 다시 시작하면 보스는 처음부터
  }

  const inWater = (L, p) => L.waterY != null && p.y > L.waterY + 2;                // 발이 수면 아래: 움직임이 느려지고 중력이 약해진다
  const FIRE = new Set(['lavablob', 'ember', 'meteor']), ELEC = new Set(['drone', 'ufo', 'gearbot', 'spiderbot']);       // 불·번개 방패가 막아 주는 것
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
    for (const pl of L.plats) if (pl.yamp) pl.y = pl.y0 + pl.yamp * Math.sin(st.t / pl.yper * Math.PI * 2 + pl.ph);          // 승강기: 위아래로 오르내리는 발판
    if (p.inv > 0) p.inv--; if (p.shoes > 0) p.shoes--; if (p.invinc > 0) { p.invinc--; if (p.invinc === 0) emit(st, { t: 'powerend' }); } if (p.magnet > 0) { p.magnet--; if (p.magnet === 0) emit(st, { t: 'powerend', what: 'magnet' }); }
    p.lx = p.x; p.ly = p.y;                                               // 이번 걸음 시작 자리(링을 줍는 범위를 지나온 길 따라 잰다)
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (const id of Object.keys(st.gone)) if (st.t >= st.gone[id]) delete st.gone[id];
    if (p.ground && p.plat && p.plat.amp) p.x += platOff(p.plat, st.t) - platOff(p.plat, st.t - 1);         // 움직이는 발판은 위에 선 사람을 같이 데려간다
    if (p.ground) stepGround(st, input, dir); else stepAir(st, input, dir);
    if (p.zipped && p.ground) p.zipped = false;                                              // 착지하면 다시 매달릴 수 있다
    if (!p.ground) p.plat = null;
    if (p.ground && p.plat && p.plat.crumble) {                                                               // 무너지는 징검돌
      const id = p.plat.id; st.cr = { [id]: (st.cr[id] || 0) + 1 };
      if (st.cr[id] >= CRUMBLE_T) { st.gone[id] = st.t + CRUMBLE_GONE; st.cr = {}; p.ground = false; p.plat = null; p.vx = p.gsp; p.vy = 0; p.jumping = false; p.roll = false; emit(st, { t: 'crumble', id }); }
    } else st.cr = {};
    p.jumpHeld = !!input.jumpHeld || !!input.jump;
    st.maxSpeed = Math.max(st.maxSpeed, Math.abs(p.ground ? p.gsp : p.vx));
    if (!p.moved && Math.abs(p.gsp) > 0.5) { p.moved = true; emit(st, { t: 'move' }); }
    bossWalls(st);
    stepWalls(st);
    stepGates(st);
    stepCurrents(st);
    stepFans(st);
    stepScatter(st);
    stepEnemies(st);
    objects(st);
    stepWater(st);
    stepBoss(st);
    if (st.sp) { stepSpecial(st); return; }
    if (p.y > VH + 120 && st.phase === 'play') die(st, 'pit');
    if (st.phase === 'play' && p.x >= L.goalX) clearLevel(st);
  }

  function stepLoop(st, input = {}) {                              // 루프를 도는 중: 원을 따라 한 바퀴. 속도는 그대로
    const p = st.p, lp = p.loop;
    if (lp.kind === 'zip') {                                       // 도르래: 레일을 따라 매달려 간다. 점프 버튼으로 놓으면 앞으로 튀어 나간다. 끝에 닿으면 저절로 놓인다
      const z = lp.zip, ln = Math.hypot(z.x1 - z.x0, z.y1 - z.y0), ux = (z.x1 - z.x0) / ln, uy = (z.y1 - z.y0) / ln; lp.s += ZIP_V; lp.th += 0.15;
      const release = (up) => { p.loop = null; p.ground = false; p.jumping = false; p.vx = ZIP_V * ux; p.vy = up ? -5.5 : ZIP_V * uy; p.zipped = true; emit(st, { t: 'zipend' }); };
      if (lp.s >= ln) { p.x = z.x1; p.y = z.y1 + 22; return release(false); }
      p.x = z.x0 + ux * lp.s; p.y = z.y0 + uy * lp.s + 22; p.vx = p.gsp; p.vy = 0; p.roll = false;
      if (input.jump) release(true);
      return;
    }
    if (lp.kind === 'cork') {                                      // 코르크스크루: 땅 위의 나선 길(사인 곡선)을 따라 간다
      lp.th += 0.4; p.x += Math.max(CORK_MIN - 1, p.gsp); const u = (p.x - lp.x0) / lp.len;
      if (u >= 1) { p.x = lp.x0 + lp.len; p.y = groundY(st.level, p.x); p.loop = null; emit(st, { t: 'corkdone' }); return; }
      p.y = lp.y0 - CORK_H * Math.sin(Math.PI * u); p.roll = false; p.vx = p.gsp; p.vy = 0; return;
    }
    if (lp.kind === 'tube') {                                      // 튜브: 정해진 관 경로를 일정한 속도로 이동한다
      const T0 = lp.tube; lp.th += 0.4; lp.s += TUBE_V; const s0 = Math.min(lp.s, T0.total);
      let k = 1; while (k < T0.cum.length - 1 && T0.cum[k] < s0) k++; const seg = T0.cum[k] - T0.cum[k - 1] || 1, f = (s0 - T0.cum[k - 1]) / seg;
      p.x = T0.pts[k - 1][0] + (T0.pts[k][0] - T0.pts[k - 1][0]) * f; p.y = T0.pts[k - 1][1] + (T0.pts[k][1] - T0.pts[k - 1][1]) * f; p.roll = false; p.vy = 0;
      if (lp.s >= T0.total) { p.x = T0.x1; p.y = groundY(st.level, p.x); p.loop = null; p.gsp = TUBE_V; p.vx = TUBE_V; emit(st, { t: 'tubeout' }); }
      return;
    }
    lp.th += Math.abs(p.gsp) / LOOP_R;
    if (lp.th >= Math.PI * 2) { p.x = lp.x0 + LOOP_W; p.y = groundY(st.level, p.x); p.loop = null; st.loopsRun++; emit(st, { t: 'loopdone' }); return; }
    p.x = lp.x0 + LOOP_R * Math.sin(lp.th) + LOOP_W * lp.th / (Math.PI * 2); p.y = lp.y0 - LOOP_R * (1 - Math.cos(lp.th)); p.roll = false; p.vx = p.gsp; p.vy = 0;
  }
  function stepGround(st, input, dir) {
    const L = st.level, p = st.p;
    if (p.loop) { stepLoop(st, input); return; }
    const onIce = L.ice.some((r) => p.x >= r.x0 && p.x <= r.x1);                                                        // 얼음 위: 가속·브레이크·마찰이 약해 미끄러진다
    const wk = inWater(L, p) ? 0.5 : 1, k = (p.shoes > 0 ? 2 : 1) * wk, TOPK = TOP * k, ACCK = ACC * k * (onIce ? 0.3 : 1), DECK = DEC * k * (onIce ? 0.35 : 1), FRCK = FRC * k * (onIce ? 0.12 : 1);                     // 신발을 신으면 최고 속도·가속이 두 배
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
    const inLow = L.lows.some((lo) => p.x > lo.x0 - 2 && p.x < lo.x1 + 9);                  // 낮은 굴 안에서는 구르던 몸이 일어서지 못한다(지나갈 때까지 계속 굴러 나간다)
    if (input.down && Math.abs(p.gsp) >= 1 && !p.roll) { p.roll = true; emit(st, { t: 'roll' }); }
    if (inLow && p.roll && Math.abs(p.gsp) < 2.5) p.gsp = (p.gsp < 0 ? -1 : 1) * 2.5;
    if (p.roll && !inLow && (Math.abs(p.gsp) < (p.dashRoll ? 1.5 : 0.5) || (!input.down && !p.dashRoll))) { p.roll = false; p.dashRoll = false; }   // ↓ 를 누르고 있는 동안만 구른다(떼면 속도는 그대로 달리기로). 스핀 대시로 나간 구르기는 느려질 때까지 계속
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
    if (L.mud.some((m) => p.x >= m.x0 && p.x <= m.x1)) p.gsp *= MUD_DRAG;                  // 늪 위에서는 속도가 계속 깎인다(구르기는 덜하지 않다)
    // 플리퍼: 위에서 점프를 누르면 크게 쳐 올리고, 4 이상으로 달려 지나가면 저절로 튕긴다
    for (let i = 0; i < L.flippers.length; i++) {
      const f = L.flippers[i]; if (p.x < f.x || p.x > f.x + f.len || Math.abs(p.y - f.gy) > 3 || st.t - (st.flip[i] === undefined ? -99 : st.flip[i]) < FLIP_COOL) continue;
      if (input.jump || Math.abs(p.gsp) >= 4) { const big = !!input.jump; p.vx = Math.max(4.5, Math.abs(p.gsp) * 0.85) * (p.gsp < 0 ? -1 : 1); p.vy = big ? -9 : -7; p.ground = false; p.jumping = false; p.roll = false; p.dashRoll = false; st.flip[i] = st.t; emit(st, { t: 'flip', x: f.x + f.len / 2, y: f.gy }); return; }
    }
    // 점프
    if (input.jump) {
      const jv = JUMP * (wk < 1 ? 0.54 : 1); p.vx = p.gsp * cs - jv * sn; p.vy = -p.gsp * sn - jv * cs; p.shUsed = false;
      p.ground = false; p.jumping = true; p.roll = false; p.dashRoll = false; emit(st, { t: 'jump' }); return;
    }
    // 땅을 따라 간다. 땅이 갑자기 사라지거나 크게 낮아지면(점프대·낭떠러지) 속도를 그대로 가진 채 날아간다
    const po = p.plat ? platOff(p.plat, st.t) : 0, nx = p.x + p.gsp * cs, gy = p.plat ? (nx >= p.plat.x0 + po && nx <= p.plat.x1 + po ? p.plat.y : Infinity) : groundY(L, nx);
    if (!Number.isFinite(gy) || gy - p.y > 6 + Math.abs(p.gsp) * Math.abs(Math.tan(ang)) + 3) {
      p.x = nx; p.vx = p.gsp * cs; p.vy = -p.gsp * sn; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'air' }); return;
    }
    const px0 = p.x; p.x = nx; p.y = gy;
    for (const b of L.belts) if (p.x >= b.x0 && p.x <= b.x1) { const bx = p.x + b.dir * BELT_V, g2 = groundY(L, bx); if (Number.isFinite(g2)) { p.x = bx; p.y = g2; } break; }        // 컨베이어가 앞이나 뒤로 밀어 준다
    for (const c of L.corks) if (p.gsp >= CORK_MIN && px0 < c.x && p.x >= c.x) { p.x = c.x; p.y = c.y; p.loop = { kind: 'cork', x0: c.x, len: c.len, y0: c.y, th: 0 }; p.roll = false; p.dashRoll = false; emit(st, { t: 'cork' }); break; }          // 코르크스크루
    for (const t of L.tubes) if (p.gsp >= TUBE_MIN && px0 < t.x && p.x >= t.x && !p.loop) { p.x = t.x; p.y = t.y; p.loop = { kind: 'tube', tube: t, s: 0, th: 0 }; p.roll = false; p.dashRoll = false; emit(st, { t: 'tubein' }); break; }                              // 튜브
    if (!p.loop && p.gsp >= LOOP_MIN) for (const lp of L.loops) if (px0 < lp.x && p.x >= lp.x) { p.x = lp.x; p.y = lp.y; p.loop = { x0: lp.x, y0: lp.y, th: 0 }; p.roll = false; p.dashRoll = false; emit(st, { t: 'loop' }); break; }      // 빠르게 들어가면 한 바퀴
    if (p.x < 8) { p.x = 8; p.gsp = Math.max(0, p.gsp); }
  }

  function stepAir(st, input, dir) {
    const L = st.level, p = st.p, TOPK = TOP * (p.shoes > 0 ? 2 : 1), wet = inWater(L, p);
    // 방패 기술: 점프 중에 점프 버튼을 한 번 더 누르면 불(앞으로 대시) · 번개(한 번 더 뜀) · 물(아래로 내리꽂았다가 튀어 오름)
    if (input.jump && p.jumping && p.shield && !p.shUsed && (p.shType === 'fire' || p.shType === 'thunder' || p.shType === 'aqua')) {
      p.shUsed = true;
      if (p.shType === 'fire') { p.vx = (p.face || 1) * 9; p.vy = 0; p.fireT = 16; } else if (p.shType === 'thunder') p.vy = -5.5; else { p.vy = 9; p.bounce = true; }
      emit(st, { t: 'shskill', kind: p.shType });
    }
    if (dir) { if (dir * p.vx < TOPK) p.vx = clamp(p.vx + dir * AIR_ACC * (wet ? 0.5 : 1), -Math.max(TOPK, Math.abs(p.vx)), Math.max(TOPK, Math.abs(p.vx))); p.face = dir; }
    if (p.vy < 0 && p.vy > -4) p.vx *= 0.96875;
    if (p.jumping && p.vy < -(wet ? JUMP_CUT * 0.5 : JUMP_CUT) && !(input.jumpHeld || input.jump)) p.vy = -(wet ? JUMP_CUT * 0.5 : JUMP_CUT);      // 버튼을 일찍 떼면 낮은 점프
    if (p.fireT > 0) { p.fireT--; p.vy = 0; } else p.vy = Math.min(wet ? 8 : MAX_FALL, p.vy + (wet ? GRAV * 0.286 : GRAV));
    const ox = p.x, oy = p.y;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 8) { p.x = 8; p.vx = Math.max(0, p.vx); }
    for (const z of L.zips) if (!p.loop && !p.zipped && Math.abs(p.x - z.x0) < 34 && Math.abs((p.y - 22) - z.y0) < 26) { p.zipped = true; p.x = z.x0; p.ground = true; p.jumping = false; p.gsp = Math.max(ZIP_V, p.vx); p.loop = { kind: 'zip', zip: z, s: 0, th: 0 }; p.roll = false; emit(st, { t: 'zip' }); return; }      // 손잡이를 잡는다
    for (const t of L.tubes) if (!p.loop && p.vx >= TUBE_MIN && ox < t.x && p.x >= t.x && p.y > t.y - 34 && p.y <= t.y + 4) { p.x = t.x; p.y = t.y; p.ground = true; p.jumping = false; p.gsp = p.vx; p.loop = { kind: 'tube', tube: t, s: 0, th: 0 }; p.roll = false; emit(st, { t: 'tubein' }); return; }      // 뛰어서 입구로 들어가도 된다
    let gy = groundY(L, p.x), plat = null;
    if (p.vy >= 0) for (const pl of L.plats) { if (st.gone[pl.id]) continue; const o = platOff(pl, st.t); if (p.x >= pl.x0 + o - 3 && p.x <= pl.x1 + o + 3 && oy <= pl.y + 2.5 && p.y >= pl.y && (plat === null || pl.y < plat.y)) plat = pl; }      // 발판은 아래에서 위로는 통과하고, 위에서 내려올 때만 선다
    if (plat) gy = plat.y;
    if (Number.isFinite(gy) && p.y >= gy && p.vy >= 0 && (plat || oy <= gy + 8)) {          // 착지 (절벽 아래쪽 벽에는 못 올라간다)
      const fall = p.vy; p.y = gy; p.ground = true; p.plat = plat;
      const ang = plat ? 0 : angleAt(L, p.x), sn = Math.sin(ang), cs = Math.cos(ang);
      p.gsp = clamp(p.vx * cs - p.vy * sn, -MAX_GSP, MAX_GSP);
      p.jumping = false; p.roll = !!input.down && Math.abs(p.gsp) >= 1; p.vy = 0; p.hurt = 0; st.chain = 0;
      emit(st, { t: 'land' }); p.shUsed = false; p.fireT = 0;
      if (p.bounce) { p.bounce = false; p.ground = false; p.jumping = true; p.roll = false; p.vy = inWater(L, p) ? -4.5 : -7.5; p.y -= 1; emit(st, { t: 'bounce' }); }
      else for (let i = 0; i < L.seesaws.length; i++) { const sw = L.seesaws[i]; if (Math.abs(p.x - sw.x) < sw.len / 2 && fall > 1.2 && Math.abs(p.y - sw.gy) < 3) {       // 시소: 세게 떨어질수록 높이 튕긴다
        p.vy = -clamp(4 + fall * 0.6, 5, 9) * (inWater(L, p) ? 0.6 : 1); p.vx = (p.face || 1) * Math.max(4, Math.abs(p.gsp)); p.ground = false; p.jumping = false; p.roll = false; p.y -= 1; st.ss[i] = st.t; emit(st, { t: 'seesaw', x: sw.x, y: sw.gy }); break; } }
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
        if (!p.dead && overlap(pbox(p), { x: e.x - 6, y: e.y - 22, w: 12, h: 22 })) hurt(st, e.x, 'fire');
        continue;
      }
      if (e.type === 'drop') {                                                                 // 떨어지는 것: 150프레임 주기. 0~50 경고(그림자), 50~58 낙하, 58~90 바닥에 있음, 90~112 다시 올라감
        const ph = (st.t + e.id * 37) % 150, up = e.base - 220; e.ph = ph;
        e.y = ph < 50 ? up : ph < 58 ? up + 220 * (ph - 50) / 8 : ph < 90 ? e.base : ph < 112 ? e.base - 220 * (ph - 90) / 22 : up;
        if (ph >= 53 && ph <= 92 && !p.dead && overlap(pbox(p), { x: e.x - 9, y: e.y - 20, w: 18, h: 20 })) hurt(st, e.x, FIRE.has(e.skin) ? 'fire' : undefined);
        continue;
      }
      if (e.type === 'crab') { e.x += e.dir * (e.spd || 0.5); if (Math.abs(e.x - e.home) > e.range) e.dir = -e.dir; e.y = groundY(L, e.x); }
      else { e.x += e.dir * (e.spd || 0.8); if (Math.abs(e.x - e.home) > e.range * 1.4) e.dir = -e.dir; e.y = groundY(L, e.home) - 34 + Math.sin(st.t / 20 + e.id) * 8; }
      const eb = { x: e.x - 8, y: e.y - 14, w: 16, h: 14 };
      if (p.dead || !overlap(pbox(p), eb)) continue;
      if (canKill(p)) { e.alive = false; st.kills++; const pts = CHAIN_POINTS[Math.min(st.chain, CHAIN_POINTS.length - 1)]; st.chain++; st.score += pts; emit(st, { t: 'kill', x: e.x, y: e.y, pts }); if (!p.ground) p.vy = p.vy > 0 ? -4 : p.vy + 1; }
      else hurt(st, e.x, FIRE.has(e.skin) ? 'fire' : ELEC.has(e.skin) ? 'elec' : undefined);
    }
  }
  // 대포 포탄은 시간만으로 정해진다(저장할 상태가 없다): 발사 후 흐른 시간 a 에 따라 x = 대포 x - 16 - a * 속도
  function shotsOf(c, t) {
    const out = [], m = (((t - c.ph) % c.per) + c.per) % c.per;
    for (let a = m; a < SHOT_LIFE; a += c.per) out.push({ x: c.x - 16 - a * c.sp, age: a });
    return out;
  }

  // ---------- 기믹: 흔들리는 철구 · 분쇄기 (시간만으로 정해져서 저장할 상태가 없다) ----------
  const swingPos = (sw, t) => { const a = 1.05 * Math.sin(t / sw.per * Math.PI * 2 + sw.ph); return { x: sw.x + sw.len * Math.sin(a), y: sw.y + sw.len * Math.cos(a) }; };
  const crushY = (c, t) => {                                               // 분쇄기 블록 아래쪽 높이: 위에 머묾 → 8프레임에 쿵 → 잠깐 바닥 → 올라감
    const per = c.per, ph = (((t - c.ph) % per) + per) % per, up = c.gy - 134, dn = c.gy - 2;
    if (ph < per - 70) return up; if (ph < per - 62) return up + (dn - up) * (ph - (per - 70)) / 8; if (ph < per - 30) return dn; return dn - (dn - up) * (ph - (per - 30)) / 30;
  };

  // ---------- 부서지는 벽 · 바람 구멍 ----------
  // 벽은 높아서 못 넘는다. 땅에서 몸을 말고(구르기·스핀 대시) WALL_MIN 이상으로 부딪히면 부서지고, 아니면 막혀 있다(스핀 대시를 하면 늘 깰 수 있다)
  function stepWalls(st) {
    const L = st.level, p = st.p; if (!L.walls.length || p.loop || p.dead) return;
    for (let i = 0; i < L.walls.length; i++) {
      if (st.broke[i]) continue; const w = L.walls[i]; if (Math.abs(p.x - w.x) > 40) continue;
      if (!overlap(pbox(p), { x: w.x, y: w.gy - w.h, w: w.w, h: w.h })) continue;
      const sp = Math.abs(p.ground ? p.gsp : p.vx);
      if (p.roll && p.ground && sp >= WALL_MIN) { st.broke[i] = true; if (p.ground) p.gsp *= 0.85; else p.vx *= 0.85; st.score += 50; emit(st, { t: 'wallbreak', i, x: w.x, y: w.gy - w.h / 2 }); }
      else { const left = p.x < w.x + w.w / 2; p.x = left ? w.x - 7 : w.x + w.w + 7; if (p.ground) p.gsp = left ? Math.min(0, p.gsp) : Math.max(0, p.gsp); p.vx = left ? Math.min(0, p.vx) : Math.max(0, p.vx); }
    }
  }
  // 스위치와 문: 스위치를 밟으면 문이 GATE_OPEN 프레임 동안 열리고, 닫힌 문은 벽처럼 길을 막는다(부술 수 없다)
  function stepGates(st) {
    const L = st.level, p = st.p; if ((!L.doors.length && !L.switches.length) || p.loop || p.dead) return;
    for (const w of L.switches) if (p.ground && Math.abs(p.x - w.x) <= 22 && Math.abs(p.y - w.gy) < 3) { if (st.t >= (st.gate[w.id] || 0)) emit(st, { t: 'switch', x: w.x, y: w.gy }); st.gate[w.id] = st.t + GATE_OPEN; }
    for (const d of L.doors) {
      if (st.t < (st.gate[d.id] || 0) || Math.abs(p.x - d.x) > 40) continue;
      if (!overlap(pbox(p), { x: d.x, y: d.gy - d.h, w: d.w, h: d.h })) continue;
      const left = p.x < d.x + d.w / 2; p.x = left ? d.x - 7 : d.x + d.w + 7; if (p.ground) p.gsp = left ? Math.min(0, p.gsp) : Math.max(0, p.gsp); p.vx = left ? Math.min(0, p.vx) : Math.max(0, p.vx);
    }
  }
  // 물살(옆으로 밀기)과 기포 기둥(공중에서 위로 띄우기): 수중 코스
  function stepCurrents(st) {
    const L = st.level, p = st.p; if (!L.currents.length || p.loop || p.dead) return;
    for (const c of L.currents) if (p.x >= c.x0 && p.x <= c.x1 && p.y >= c.y0 && p.y <= c.y1 + 2) {
      if (c.dx) { p.x += c.dx; if (p.ground && c.dx * p.gsp < 0 && Math.abs(p.gsp) < 0.3) p.gsp = 0; }
      if (c.dy && !p.ground) p.vy = Math.max(p.vy + c.dy, -3.4);
      if (!p.cur) { p.cur = true; emit(st, { t: 'current' }); } return;
    }
    p.cur = false;
  }
  function stepFans(st) {                                          // 바람 구멍 위의 공중에서는 위로 떠오른다(최대 FAN_UP)
    const L = st.level, p = st.p; if (!L.fans.length || p.ground || p.loop || p.dead) return;
    for (const f of L.fans) if (Math.abs(p.x - f.x) < f.w / 2 && p.y < f.gy + 4 && p.y > f.top - 30) { p.vy = Math.max(p.vy - FAN_LIFT, -FAN_UP); if (!p.fanned) { p.fanned = true; emit(st, { t: 'fan' }); } return; }
    p.fanned = false;
  }

  // ---------- 수중: 숨 ----------
  function stepWater(st) {
    const L = st.level, p = st.p; if (L.waterY == null || p.dead || st.phase !== 'play') return;
    for (let i = 0; i < L.bubbles.length; i++) {                                            // 큰 거품: 닿으면 숨이 가득 찬다(잠시 뒤 다시 생긴다)
      const b = L.bubbles[i]; if (Math.abs(b.x - p.x) > 30 || st.bub[i] > st.t) continue;
      if (Math.hypot(b.x - p.x, b.y - (p.y - 12)) < 20) { st.bub[i] = st.t + 600; p.air = AIR_MAX; emit(st, { t: 'air', x: b.x, y: b.y }); return; }
    }
    if (!(p.y - 22 > L.waterY) || p.loop) { p.air = AIR_MAX; return; }                       // 머리가 물 밖이면 숨을 쉰다
    if (p.shield && p.shType === 'aqua') return;                                              // 물 방패: 물속에서도 숨이 안 줄어든다
    p.air--;
    if (p.air === 900 || p.air === 600) emit(st, { t: 'airwarn' });
    if (p.air <= 300 && p.air > 0 && p.air % 60 === 0) emit(st, { t: 'drownnum', n: p.air / 60 });
    if (p.air <= 0) die(st, 'drown');
  }

  // ---------- 보스 ----------
  // 코스 끝 보스 방(x0~x1): 들어서면 보스가 나타나고 뒤로 못 나간다. 구르거나 뛰어서(몸을 말아) 맞히면 체력이 깎이고, 쓰러뜨려야 앞 벽이 열린다.
  function bossWalls(st) {
    const B = st.level.boss, p = st.p; if (!B || st.noBoss || st.bossDown || p.loop) return;
    if (p.x > B.x1) { p.x = B.x1; if (p.ground) p.gsp = Math.min(0, p.gsp); p.vx = Math.min(0, p.vx); }
    if (st.bossOn && p.x < B.x0 + 4) { p.x = B.x0 + 4; if (p.ground) p.gsp = Math.max(0, p.gsp); p.vx = Math.max(0, p.vx); }
  }
  function stepBoss(st) {
    const L = st.level, B = L.boss, p = st.p; if (!B || st.noBoss || st.phase !== 'play') return;
    if (!st.bossDown && B.check > st.checkX && p.x >= B.check) { st.checkX = B.check; emit(st, { t: 'check', x: B.check }); }
    if (!st.bossOn && !st.bossDown && p.x >= B.x0 + 30) { st.bossOn = true; st.boss = { x: B.x1 - 40, y: B.gy - 150, hp: B.hp, max: B.hp, ph: 'enter', t: 0, inv: 0, lockx: 0 }; emit(st, { t: 'boss', hp: B.hp }); }
    const b = st.boss; if (!st.bossOn || !b) return;
    b.t++; if (b.inv > 0) b.inv--;
    const z = st.zone, hov = B.gy - 64;
    if (b.ph === 'dead') { b.y += Math.min(3, b.t * 0.04); return; }
    const goto = (tx, sp) => { b.x += clamp(tx - b.x, -sp, sp); b.x = clamp(b.x, B.x0 + 24, B.x1 - 24); };
    if (b.ph === 'enter') { b.y = Math.min(hov, b.y + 3); goto(p.x, 1); if (b.y >= hov) { b.ph = 'hover'; b.t = 0; } }
    else if (b.ph === 'hover') {
      goto(p.x + Math.sin(st.t / 40) * 50, 1.4 + 0.12 * z); b.y = hov + Math.sin(st.t / 16) * 6;
      if (z >= 2 && b.t === 70) st.bbombs.push({ x: b.x, y: b.y + 14, vy: 0, fuse: -1 });                     // 폭탄(3코스~): 떨어져서 땅에 닿고 잠시 뒤 터진다
      if (z >= 4 && b.t === 40) st.bshots.push({ x: b.x, y: B.gy - 22, vx: (p.x < b.x ? -1 : 1) * 2.6, life: 220 });   // 낮은 포탄(5코스~)
      if (b.t >= 120 - Math.min(40, z * 5)) { b.ph = 'warn'; b.t = 0; }
    } else if (b.ph === 'warn') { if (b.t >= 22) { b.ph = 'dive'; b.t = 0; b.lockx = p.x; } }
    else if (b.ph === 'dive') { goto(b.lockx, 3); b.y = Math.min(B.gy - 24, b.y + 4); if (b.y >= B.gy - 24) { b.ph = 'low'; b.t = 0; } }
    else if (b.ph === 'low') { goto(p.x, 1.1 + 0.1 * z); if (b.t >= 44) { b.ph = 'rise'; b.t = 0; } }
    else if (b.ph === 'rise') { b.y = Math.max(hov, b.y - 2.5); goto(p.x, 1); if (b.y <= hov) { b.ph = 'hover'; b.t = 0; } }
    // 부딪힘: 몸을 말고(또는 뛰어서) 닿으면 보스가 다치고, 그냥 닿으면 내가 다친다
    if (!p.dead && b.ph !== 'enter' && overlap(pbox(p), { x: b.x - 24, y: b.y - 16, w: 48, h: 30 })) {
      if (canKill(p)) {
        if (b.inv <= 0) {
          b.hp--; b.inv = 70; st.score += 100; emit(st, { t: 'bosshit', hp: b.hp, x: b.x, y: b.y });
          if (b.hp <= 0) { b.ph = 'dead'; b.t = 0; st.bossDown = true; st.score += 1000; st.bbombs = []; st.bshots = []; emit(st, { t: 'bossdead', x: b.x, y: b.y }); }
        }
        const sg = p.x < b.x ? -1 : 1;
        if (p.ground) { p.gsp = sg * Math.max(3, Math.abs(p.gsp) * 0.5); } else { p.vx = sg * 3; p.vy = p.vy > 0 ? -4.5 : 1.5; }
      } else hurt(st, b.x);
    }
    for (const bo of st.bbombs) {
      if (bo.fuse < 0) { bo.vy += 0.2; bo.y += bo.vy; if (bo.y >= B.gy) { bo.y = B.gy; bo.fuse = 50; } }
      else if (--bo.fuse === 0) { bo.done = true; emit(st, { t: 'bomb', x: bo.x, y: bo.y }); if (!p.dead && Math.abs(p.x - bo.x) < 34 && p.y > B.gy - 40) hurt(st, bo.x); }
    }
    st.bbombs = st.bbombs.filter((q) => !q.done);
    for (const sh of st.bshots) { sh.x += sh.vx; sh.life--; if (!p.dead && overlap(pbox(p), { x: sh.x - 5, y: sh.y - 4, w: 10, h: 8 })) { hurt(st, sh.x); sh.life = 0; } }
    st.bshots = st.bshots.filter((q) => q.life > 0 && q.x > B.x0 - 40 && q.x < B.x1 + 40);
  }
  function objects(st) {
    const L = st.level, p = st.p, bx = pbox(p);
    // 링 줍기: 몸 가운데(p.y-12)에서 RING_GRAB 안이면 먹는다. 이번 걸음에 지나온 길(이전 자리→지금 자리)을 따라 재서 빠르게 달려도 안 놓친다.
    // 자석이 켜져 있으면 MAGNET_R 안의 링이 빨려 온다.
    const cx = p.x, cy = p.y - 12, ox = p.lx == null ? cx : p.lx, oy = (p.ly == null ? p.y : p.ly) - 12, sx = cx - ox, sy = cy - oy, sl = sx * sx + sy * sy;
    for (let i = 0; i < L.rings.length; i++) {
      const r = L.rings[i]; if (st.got.has(i)) continue; const mg = st.mag[i];
      if ((p.magnet > 0 || (p.shield && p.shType === 'thunder')) && !mg && Math.hypot(r.x - cx, r.y - cy) < MAGNET_R) st.mag[i] = { x: r.x, y: r.y };
      const q = st.mag[i];
      if (q) { const d = Math.hypot(cx - q.x, cy - q.y) || 1, sp = Math.max(7, Math.hypot(sx, sy) + 4); q.x += (cx - q.x) / d * Math.min(sp, d); q.y += (cy - q.y) / d * Math.min(sp, d); }
      const rx = q ? q.x : r.x, ry = q ? q.y : r.y;
      let t = sl > 0.01 ? clamp(((rx - ox) * sx + (ry - oy) * sy) / sl, 0, 1) : 1;
      if (Math.hypot(rx - (ox + sx * t), ry - (oy + sy * t)) < RING_GRAB) { st.got.add(i); addRings(st, 1); }
    }
    for (const s of L.springs) if (Math.abs(s.x - p.x) < 12 && p.y > groundY(L, s.x) - 10 && p.y <= groundY(L, s.x) + 6 && (p.vy >= 0 || p.ground)) { p.vy = -SPRING_V * (inWater(L, p) ? 0.55 : 1); p.vx = clamp(p.ground ? p.gsp * Math.cos(angleAt(L, p.x)) : p.vx, -TOP, TOP); p.ground = false; p.jumping = false; p.roll = false; st.spring++; emit(st, { t: 'spring' }); }
    for (const d of L.pads) if (p.ground && Math.abs(d.x - p.x) < 14) { p.gsp = d.dir * PAD_V; p.roll = false; emit(st, { t: 'boost' }); }
    for (const k of L.spikes) if (Math.abs(k.x - p.x) < 9 && p.y > groundY(L, k.x) - 12) hurt(st, k.x);
    // 튜토리얼 신호: 굴을 굴러서 끝까지 빠져나감 · 대포알이 내 앞을 지나감(맞지 않고)
    for (let i = 0; i < L.lows.length; i++) { const lo = L.lows[i]; if (p.x > lo.x0 && p.x < lo.x1) st.lowIn = i; else if (st.lowIn === i) { st.lowIn = -1; if (p.x >= lo.x1 && p.roll) emit(st, { t: 'tunnel' }); } }
    for (const c of L.cannons) if (p.inv <= 0 && Math.abs(c.x - p.x) < SHOT_LIFE * c.sp + 40) { const prev = shotsOf(c, st.t - 1), cur = shotsOf(c, st.t); for (const sh of cur) { const q = prev.find((u) => u.age === sh.age - 1); if (q && q.x >= p.x && sh.x < p.x) emit(st, { t: 'dodge' }); } }
    // 낮은 굴: 천장 아래 틈이 LOW_H(18) 라서 서 있는 몸(24)은 부딪히고, 구르는 몸(16)은 지나간다
    for (const lo of L.lows) if (p.x + 7 > lo.x0 && p.x - 7 < lo.x1 && !p.loop && overlap(pbox(p), { x: lo.x0, y: lo.gy - LOW_TOP, w: lo.x1 - lo.x0, h: LOW_TOP - LOW_H })) hurt(st, lo.x0 - 40);
    // 대포: 일정한 간격으로 머리 높이(땅 위 18~26)로 낮게 날아오는 포탄. 구르거나 높이 뛰면 피한다
    for (const c of L.cannons) if (Math.abs(c.x - p.x) < SHOT_LIFE * c.sp + 40) for (const sh of shotsOf(c, st.t)) if (overlap(pbox(p), { x: sh.x - 5, y: c.gy - 26, w: 10, h: 8 })) { hurt(st, sh.x); break; }
    { const g = L.giant; if (g && !st.giantTaken && !st.sp && !st.tutorial && Math.hypot(p.x - g.x, (p.y - 12) - g.y) < 26) { enterSpecial(st); return; } }      // 거대 링
    for (let i = 0; i < L.bumpers.length; i++) {                                    // 범퍼: 닿으면 바깥쪽으로 튕겨 낸다
      const b = L.bumpers[i]; if (Math.abs(b.x - p.x) > 40 || st.bump[i] > st.t) continue;
      const dx = p.x - b.x, dy = (p.y - 12) - b.y, d = Math.hypot(dx, dy);
      if (d < b.r + 10) { const sp = Math.max(5.5, Math.hypot(p.ground ? p.gsp : p.vx, p.vy) * 0.9); p.ground = false; p.jumping = false; p.roll = false; p.plat = null; p.vx = dx / (d || 1) * sp; p.vy = dy / (d || 1) * sp - 1; st.bump[i] = st.t + 10; st.score += 10; emit(st, { t: 'bumper', x: b.x, y: b.y }); }
    }
    for (const sw of L.swings) if (Math.abs(sw.x - p.x) < sw.len + 30) {                // 흔들리는 철구
      const q = swingPos(sw, st.t), bx = pbox(p), cx = clamp(q.x, bx.x, bx.x + bx.w), cy = clamp(q.y, bx.y, bx.y + bx.h);
      if (Math.hypot(q.x - cx, q.y - cy) < 9.5) hurt(st, q.x);
    }
    for (const c of L.crushers) if (Math.abs((c.x0 + c.x1) / 2 - p.x) < 80 && overlap(pbox(p), { x: c.x0, y: crushY(c, st.t) - 30, w: c.x1 - c.x0, h: 30 })) hurt(st, (c.x0 + c.x1) / 2);
    for (let i = 0; i < L.monitors.length; i++) {                                   // 아이템 상자: 구르거나 뛰어서(또는 무적일 때) 닿으면 부서진다. 그냥 걸어서 지나가면 아무 일 없다
      const m = L.monitors[i]; if (st.mon.has(i) || !canKill(p)) continue;
      if (overlap(pbox(p), { x: m.x - 9, y: (m.y != null ? m.y : groundY(L, m.x)) - 22, w: 18, h: 22 })) {
        st.mon.add(i); st.monitorsBroken++; st.score += 10; if (!p.ground) p.vy = p.vy > 0 ? -4 : p.vy + 1;
        if (m.type === 'ring10') addRings(st, 10); else if (m.type === 'shield' || m.type === 'fire' || m.type === 'aqua' || m.type === 'thunder') { p.shield = true; p.shType = m.type === 'shield' ? 'basic' : m.type; p.shUsed = false; } else if (m.type === 'invincible') p.invinc = INVINC_TIME; else if (m.type === 'shoes') p.shoes = SHOES_TIME; else if (m.type === 'magnet') p.magnet = MAGNET_TIME; else if (m.type === 'life') { st.lives++; emit(st, { t: 'oneup' }); }
        emit(st, { t: 'monitor', type: m.type, x: m.x, y: m.y != null ? m.y : groundY(L, m.x) });
      }
    }
    for (const c of L.checks) if (c.x > st.checkX && p.x >= c.x) { st.checkX = c.x; emit(st, { t: 'check', x: c.x }); }
  }
  function hurt(st, fromX, src) {
    const p = st.p;
    if (p.inv > 0 || p.dead || st.phase !== 'play') return;
    if (p.invinc > 0 || p.loop) return;
    if (st.sp) { st.rings = Math.max(0, st.rings - 5); p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; emit(st, { t: 'hurt', rings: 0 }); return; }      // 특별 스테이지: 링 5개만 잃는다
    if (p.shield && ((src === 'fire' && p.shType === 'fire') || (src === 'elec' && p.shType === 'thunder'))) return;      // 불 방패는 불을, 번개 방패는 전기를 막는다(방패는 그대로)                                              // 무적이거나 루프를 도는 중에는 안 다친다
    if (p.shield) { p.shield = false; p.shType = null; p.bounce = false; p.inv = INVULN; p.vx = (p.x < fromX ? -1 : 1) * HURT_VX; p.vy = HURT_VY; p.ground = false; p.jumping = false; p.roll = false; p.dashRoll = false; emit(st, { t: 'shieldbreak' }); return; }   // 보호막은 한 번 막아 준다 (링은 그대로)
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
    BELT_V, SAFE_AFTER, SKINS, DROP_SKIN, CRUMBLE_T, CRUMBLE_GONE, platOff, LOOP_R, LOOP_W, LOOP_MIN, SCATTER_MAX, CHAIN_POINTS, LIFE_RINGS, DASH_BASE, SHOES_TIME, INVINC_TIME, LOW_H, LOW_TOP, SHOT_LIFE, shotsOf, ZONE_PROFILE, GATE_OPEN, WATER_Y, AIR_MAX, ZIP_V, SPECIAL_TIME, SPECIAL_NEED, SPECIAL_LEN, buildSpecial, CORK_MIN, CORK_H, TUBE_MIN, TUBE_V, WALL_MIN, MUD_DRAG, swingPos, crushY, inWater, RING_GRAB, MAGNET_R, MAGNET_TIME, rng, buildLevel, groundY, angleAt, newGame, spawn, step, isSpin, canKill, pbox };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_SP;
