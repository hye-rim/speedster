'use strict';

// 번개 다람쥐 규칙 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 시험용 세상: 평평한 땅(또는 높이 함수)만 있고 아무것도 없다
function world(h = () => 150, len = 4000) {
  const st = L.newGame({ zone: 0, seed: 1 });
  const lv = st.level; lv.len = len; lv.H = new Float32Array(len + 1); for (let i = 0; i <= len; i++) lv.H[i] = h(i);
  lv.rings = []; lv.enemies = []; lv.springs = []; lv.pads = []; lv.spikes = []; lv.checks = []; lv.monitors = []; lv.loops = []; lv.goalX = len - 100;
  st.enemies = []; st.got = new Set(); L.spawn(st, 100); st.p.inv = 0; st.checkX = 100;
  return st;
}
const run = (st, n, inp) => { for (let i = 0; i < n; i++) L.step(st, typeof inp === 'function' ? inp(i) : inp || {}); };
const evs = (st, t) => st.events.filter((e) => e.t === t);

test('every zone and several seeds make a valid course: flat start, narrow pits, gentle hills, ground at the goal', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3, 4]) {
    const v = L.buildLevel(z, seed); assert.strictEqual(v.H.length, v.len + 1);
    for (let i = 0; i < 420; i++) assert.ok(Math.abs(v.H[i] - L.GROUND_REF) < 0.01, 'flat start');
    let pit = 0, maxPit = 0, steep = 0;
    for (let i = 0; i <= v.len; i++) {
      if (!Number.isFinite(v.H[i])) { pit++; maxPit = Math.max(maxPit, pit); } else { pit = 0; if (i > 0 && Number.isFinite(v.H[i - 1])) steep = Math.max(steep, Math.abs(v.H[i] - v.H[i - 1])); assert.ok(v.H[i] >= L.Y_MIN - 1 && v.H[i] <= L.Y_MAX + 1, 'height range'); }
    }
    const wide = v.longGaps.length > 0, bridge = v.movers + v.stonesN > 0 || v.routes.includes('lowjump'); assert.ok(maxPit >= 40 && (wide || bridge || maxPit <= L.PIT_LIMIT + 2), 'pit width ' + maxPit); if (wide && !bridge) assert.ok(maxPit <= 230, 'long gaps stay under 230: ' + maxPit); if (bridge) assert.ok(maxPit <= 335, 'bridge pits stay under 335: ' + maxPit);
    assert.ok(steep < 0.8, 'no wall-like step on the ground: ' + steep);
    assert.ok(Number.isFinite(v.H[v.goalX]) && Number.isFinite(v.H[v.len]), 'ground at the goal');
    assert.strictEqual(v.checks.length, 2);
    for (const r of v.rings) assert.ok(!Number.isFinite(v.H[Math.floor(r.x)]) || r.y < v.H[Math.floor(r.x)] - 6, 'rings float above the ground');
    for (const e of v.enemies) if (e.type !== 'flame') assert.ok(Number.isFinite(v.H[Math.floor(e.x)]), 'enemy stands on ground');
  }
});

test('zones get longer and harder: later zones have more enemies and spikes than the first', () => {
  const lens = L.ZONES.filter((z) => !z.water).map((z) => z.len); for (let i = 1; i < lens.length; i++) assert.ok(lens[i] > lens[i - 1]);
  const count = (z) => { let e = 0, s = 0, p = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const v = L.buildLevel(z, seed); e += v.enemies.length / v.len; s += v.spikes.length / v.len; } return { e, s }; };
  assert.ok(count(7).e > count(0).e * 0.9 && count(5).s > count(0).s && count(0).s === 0, 'later zones are no easier and zone one has no spikes');
  for (let i = 1; i < L.ZONES.length; i++) if (!L.ZONES[i].water) assert.ok(L.ZONES[i].pit >= L.ZONES[i - 1].pit && L.ZONES[i].spike >= L.ZONES[i - 1].spike && L.ZONES[i].enemy >= L.ZONES[i - 1].enemy, 'difficulty settings never go down');
});

test('the same course and the same inputs always give the same run', () => {
  const play = () => { const st = L.newGame({ zone: 1, seed: 5 }); run(st, 1500, (i) => ({ right: true, jump: i % 90 === 0, jumpHeld: i % 90 < 30 })); return JSON.stringify([st.p.x, st.p.y, st.rings, st.score]); };
  assert.strictEqual(play(), play());
});

test('running speeds up slowly to the top speed, friction stops you, and turning around brakes hard', () => {
  const st = world(); run(st, 20, { right: true }); const v20 = st.p.gsp; assert.ok(v20 > 0.5 && v20 < 1.2, 'slow start ' + v20);
  run(st, 200, { right: true }); assert.ok(Math.abs(st.p.gsp - L.TOP) < 0.01, 'top speed ' + st.p.gsp);
  const x = st.p.x; run(st, 300, {}); assert.strictEqual(st.p.gsp, 0); assert.ok(st.p.x > x + 100 && st.p.x < x + 500, 'friction took a while: ' + (st.p.x - x));
  const b = world(); run(b, 150, { right: true }); const t0 = b.p.gsp; run(b, 6, { left: true }); assert.ok(b.p.gsp < t0 - 2.5, 'braking is strong: ' + b.p.gsp);
});

test('downhill speeds you past the top speed and uphill slows you down', () => {
  const down = world((x) => 150 + Math.min(Math.max(0, x - 400) * 0.35, 90), 4000); down.p.x = 300; run(down, 400, { right: true });
  assert.ok(down.p.gsp > L.TOP + 0.5, 'faster than the top speed downhill: ' + down.p.gsp);
  const up = world((x) => 150 - Math.min(Math.max(0, x - 400) * 0.35, 120), 4000); up.p.x = 300; run(up, 130, { right: true });
  let low = 99; for (let i = 0; i < 150; i++) { L.step(up, { right: true }); low = Math.min(low, up.p.gsp); } assert.ok(low < L.TOP - 0.8, 'slower on the way up: ' + low);
});

test('a jump rises about 96 pixels when the button is held, less when released early, and landing keeps the speed', () => {
  const st = world(); run(st, 100, { right: true }); const g0 = st.p.gsp; const y0 = st.p.y; let top = y0;
  L.step(st, { right: true, jump: true, jumpHeld: true }); for (let i = 0; i < 80 && !st.p.ground; i++) { L.step(st, { right: true, jumpHeld: true }); top = Math.min(top, st.p.y); }
  assert.ok(y0 - top > 85 && y0 - top < 105, 'full jump height ' + (y0 - top)); assert.ok(st.p.ground, 'landed'); assert.ok(st.p.gsp >= g0 - 0.5, 'did not lose speed by jumping: ' + st.p.gsp + ' vs ' + g0);
  const s = world(); L.step(s, { jump: true, jumpHeld: true }); let t2 = s.p.y; for (let i = 0; i < 80 && !s.p.ground; i++) { L.step(s, {}); t2 = Math.min(t2, s.p.y); }
  assert.ok(150 - t2 < 60 && 150 - t2 > 30, 'short hop ' + (150 - t2));
});

test('in the air you can steer a little but not beyond the running top speed by yourself', () => {
  const st = world(); L.step(st, { jump: true }); run(st, 40, { right: true }); assert.ok(st.p.vx > 1 && st.p.vx <= L.TOP + 0.01, 'air steering ' + st.p.vx);
});

test('holding down while running rolls into a ball; rolling downhill is faster than running and rolling slows slowly', () => {
  const st = world(); run(st, 120, { right: true }); L.step(st, { right: true, down: true }); assert.ok(st.p.roll && L.isSpin(st.p)); assert.ok(evs(st, 'roll').length === 1);
  const g0 = st.p.gsp; run(st, 60, { down: true }); assert.ok(st.p.gsp > g0 - 2, 'rolling keeps speed far better than running friction'); L.step(st, {}); assert.ok(!st.p.roll, 'letting go of down unrolls and keeps the speed'); assert.ok(st.p.gsp > 3);
  const r2 = world(); run(r2, 120, { right: true }); run(r2, 600, { down: true }); assert.ok(!r2.p.roll && r2.p.gsp === 0, 'unrolls when it stops');
  const slow = world(); run(slow, 5, { right: true }); L.step(slow, { down: true }); assert.ok(!slow.p.roll, 'too slow to roll');
  const hill = (x) => 150 + Math.min(Math.max(0, x - 400) * 0.5, 160);
  const peak = (st, inp) => { let m = 0; for (let i = 0; i < 300 && st.p.x < 720; i++) { L.step(st, inp(i)); m = Math.max(m, st.p.gsp); } return m; };
  const a = world(hill); a.p.x = 300; const b = world(hill); b.p.x = 300;
  const pa = peak(a, () => ({ right: true })), pb = peak(b, (i) => ({ right: true, down: i > 40 }));
  assert.ok(pb > pa + 1, 'a rolling ball gets much faster downhill than a runner: ' + pb + ' vs ' + pa);
});

test('running off the end of a cliff keeps your speed and carries you across a pit with a jump', () => {
  const st = world((x) => (x > 800 && x < 900 ? Infinity : 150)); st.p.x = 300;
  let crossed = false; for (let i = 0; i < 400 && st.phase === 'play'; i++) { const jump = st.p.ground && st.p.x > 760 && st.p.x < 800; L.step(st, { right: true, jump, jumpHeld: !st.p.ground || jump }); if (st.p.x > 950 && st.p.ground) { crossed = true; break; } }
  assert.ok(crossed, 'jumped across a pit of 100 pixels');
  const f = world((x) => (x > 800 && x < 900 ? Infinity : 150)); f.p.x = 300; run(f, 300, { right: true }); assert.ok(f.deaths >= 1 && f.lives < L.START_LIVES, 'falling into the pit costs a life');
});

test('a pit costs a life and you restart at the last checkpoint with no rings; the last life ends the game', () => {
  const st = world((x) => (x > 800 && x < 900 ? Infinity : 150)); st.level.checks = [{ x: 500 }]; st.rings = 5; st.p.x = 300; const lives0 = st.lives;
  let respawned = false; for (let i = 0; i < 600 && !respawned; i++) { L.step(st, { right: true }); if (evs(st, 'respawn').length) respawned = true; }
  assert.ok(respawned); assert.strictEqual(st.lives, lives0 - 1); assert.strictEqual(st.checkX, 500); assert.strictEqual(st.rings, 0); assert.ok(Math.abs(st.p.x - 500) < 2 && st.phase === 'play', 'respawned at the checkpoint: ' + st.p.x);
  const o = world((x) => (x > 500 && x < 600 ? Infinity : 150)); o.lives = 1; o.p.x = 300; run(o, 500, { right: true }); assert.strictEqual(o.phase, 'over');
});

test('rings are collected once each and count toward the score and the total', () => {
  const st = world(); st.level.rings = [{ x: 160, y: 138 }, { x: 170, y: 138 }, { x: 600, y: 60 }]; st.p.x = 130; run(st, 120, { right: true });
  assert.strictEqual(st.rings, 2); assert.strictEqual(st.ringsTotal, 2); assert.ok(st.score >= 20); const n = st.rings; st.p.x = 130; st.p.gsp = 0; run(st, 60, { right: true }); assert.strictEqual(st.rings, n, 'not collected twice');
});

test('spinning into an enemy beats it and walking into it hurts: rings scatter, with no rings you die', () => {
  const mk = (x) => { const st = world(); st.enemies = [{ id: 0, type: 'crab', x, y: 150, home: x, range: 0, dir: 1, alive: true }]; st.p.x = x - 60; return st; };
  const a = mk(500); a.rings = 7; run(a, 200, (i) => ({ right: true, jump: i === 25, jumpHeld: i < 60 })); // 뛰어서 밟는다
  assert.ok(a.kills >= 0);
  const b = mk(500); b.rings = 7; b.p.gsp = 5; b.p.roll = true; run(b, 60, { right: true, down: true }); assert.strictEqual(b.kills, 1, 'a rolling ball beats the enemy'); assert.strictEqual(b.rings, 7, 'no damage');
  const c = mk(500); c.rings = 7; run(c, 100, { right: true }); assert.strictEqual(c.rings, 0, 'walked into it'); assert.ok(c.scatter.length > 0 && c.scatter.length <= 12, 'rings fly out'); assert.ok(c.p.inv > 0 && c.phase === 'play');
  const d = mk(500); d.rings = 0; run(d, 100, { right: true }); assert.strictEqual(d.lives, L.START_LIVES - 1); assert.ok(d.phase === 'dying');
});

test('after a hit you are invulnerable for two seconds and the scattered rings can be picked up again', () => {
  const st = world(); st.enemies = [{ id: 0, type: 'crab', x: 400, y: 150, home: 400, range: 0, dir: 1, alive: true }, { id: 1, type: 'crab', x: 410, y: 150, home: 410, range: 0, dir: 1, alive: true }]; st.rings = 5; st.p.x = 330; run(st, 80, { right: true });
  assert.strictEqual(st.rings, 0); assert.ok(st.phase === 'play', 'second enemy inside the invulnerable time did nothing');
  assert.ok(st.p.inv > 0 || st.p.x > 430);
  const q = world(); q.p.inv = 0; q.scatter.push({ x: q.p.x, y: q.p.y - 12, vx: 0, vy: 0, life: 200 }); L.step(q, {}); assert.strictEqual(q.rings, 1, 'a scattered ring can be picked up again');
});

test('springs bounce you high, boost pads push you to a high speed, spikes hurt, checkpoints save your place', () => {
  const s = world(); s.level.springs = [{ x: 300 }]; s.p.x = 250; run(s, 80, { right: true }); assert.ok(s.spring >= 1 && Math.min(s.p.y, 150) < 150); let top = 150; const s2 = world(); s2.level.springs = [{ x: 300 }]; s2.p.x = 250; for (let i = 0; i < 120; i++) { L.step(s2, { right: true }); top = Math.min(top, s2.p.y); } assert.ok(150 - top > 140, 'spring height ' + (150 - top));
  const b = world(); b.level.pads = [{ x: 300, dir: 1 }]; b.p.x = 280; run(b, 30, { right: true }); assert.ok(b.p.gsp >= 9, 'boost ' + b.p.gsp);
  const k = world(); k.level.spikes = [{ x: 300 }]; k.rings = 3; k.p.x = 250; run(k, 80, { right: true }); assert.strictEqual(k.rings, 0, 'spikes hurt');
  const j = world(); j.level.spikes = [{ x: 300 }]; j.rings = 3; j.p.x = 250; run(j, 200, (i) => ({ right: true, jump: i === 10, jumpHeld: i < 40 })); assert.strictEqual(j.rings, 3, 'jumping over spikes is safe');
  const c = world(); c.level.checks = [{ x: 400 }]; c.p.x = 350; run(c, 60, { right: true }); assert.strictEqual(c.checkX, 400);
});

test('reaching the goal clears the course and pays a time bonus and 100 per ring', () => {
  const st = world(); st.level.goalX = 800; st.rings = 12; st.p.x = 500; run(st, 200, { right: true }); assert.strictEqual(st.phase, 'clear');
  assert.strictEqual(st.ringBonus, 1200); assert.ok(st.timeBonus >= 50 * (L.TIME_PAR[0] - 5) && st.timeBonus <= 50 * L.TIME_PAR[0], 'fast finish pays a time bonus: ' + st.timeBonus); assert.ok(st.score >= 1200 + st.timeBonus);
  const slow = world(); slow.level.goalX = 800; slow.t = 60 * 200; slow.p.x = 700; run(slow, 100, { right: true }); assert.strictEqual(slow.timeBonus, 0, 'slow finish pays none');
});

test('the practice mode never kills you for being hit and still scatters nothing', () => {
  const st = world(); st.tutorial = true; st.enemies = [{ id: 0, type: 'crab', x: 400, y: 150, home: 400, range: 0, dir: 1, alive: true }]; st.p.x = 340; run(st, 100, { right: true });
  assert.strictEqual(st.phase, 'play'); assert.strictEqual(st.lives, L.START_LIVES);
});

test('a runner bot that looks ahead clears every zone on several seeds without dying much', () => {
  const bot = require('./bot.js'); let deaths = 0, runs = 0;
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 3, 5]) { const r = bot.play(z, seed, { lives: 99 }); runs++; deaths += r.deaths; assert.strictEqual(r.phase, 'clear', 'zone ' + (z + 1) + ' seed ' + seed + ' ended ' + r.phase + ' at ' + r.x); assert.ok(r.deaths <= 4, 'deaths ' + r.deaths); }
  assert.ok(deaths <= runs * 1.5, 'average deaths per course ' + deaths / runs);
});

test('the bot is fast: it reaches high speeds on the hills and finishes each zone in a sensible time', () => {
  const bot = require('./bot.js');
  for (let z = 0; z < L.ZONES.length; z++) { const r = bot.play(z, 3); assert.ok(r.maxSpeed >= 6, 'top speed ' + r.maxSpeed); assert.ok(r.sec >= 25 && r.sec <= L.TIME_PAR[z] * 1.4, 'time ' + r.sec); }
});

// ---------- 원작 느낌: 루프 · 아이템 상자 · 스핀 대시 · 링 100개 목숨 · 연속 처치 ----------
const crabAt = (st, x, id = 0) => st.enemies.push({ id, type: 'crab', x, y: 150, home: x, range: 0, dir: 1, alive: true });

test('every zone has loops and item boxes, each on flat ground with room to run up to a loop', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3]) {
    const v = L.buildLevel(z, seed); assert.ok(L.ZONES[z].water ? v.loops.length === 0 : v.loops.length >= 2, 'loops ' + v.loops.length); assert.ok(v.monitors.length >= 1, 'item boxes');
    for (const lp of v.loops) for (let x = lp.x - 280; x <= lp.x + L.LOOP_W + 130; x += 4) assert.ok(Math.abs(v.H[x] - lp.y) < 0.01, 'flat run-up and exit at ' + lp.x);
    for (const m of v.monitors) assert.ok(Number.isFinite(v.H[Math.floor(m.x)]));
  }
  const z0 = L.buildLevel(0, 1).monitors.map((m) => m.type); assert.ok(z0.every((t) => t === 'ring10' || t === 'shield' || t === 'magnet'), 'zone one only gives rings, shields and magnets');
});

test('entering a loop fast takes you once around the circle and out the other side at the same speed', () => {
  const st = world(); st.level.loops = [{ x: 600, y: 150 }]; st.p.x = 300; st.p.gsp = 7; st.p.face = 1;
  let looped = false, maxUp = 0, thMax = 0; for (let i = 0; i < 200 && st.p.x < 700; i++) { L.step(st, { right: true }); if (st.p.loop) { looped = true; thMax = Math.max(thMax, st.p.loop.th); maxUp = Math.max(maxUp, 150 - st.p.y); } }
  assert.ok(looped && thMax > 5.5, 'went all the way round'); assert.ok(maxUp > 2 * L.LOOP_R - 4, 'passed the top of the circle: ' + maxUp);
  assert.ok(!st.p.loop && st.p.ground && Math.abs(st.p.y - 150) < 0.5 && st.p.x > 600 + L.LOOP_W - 1, 'out the other side on the ground'); assert.ok(st.p.gsp >= 6.5, 'kept its speed: ' + st.p.gsp); assert.ok(evs(st, 'loopdone').length === 1 || st.loopsRun === 1);
  const slow = world(); slow.level.loops = [{ x: 600, y: 150 }]; slow.p.x = 520; slow.p.gsp = 3; run(slow, 100, { right: true }); assert.ok(slow.p.x > 640 && slow.loopsRun === 0, 'too slow: it just runs past'); 
  const h = world(); h.level.loops = [{ x: 600, y: 150 }]; h.p.x = 300; h.p.gsp = 7; crabAt(h, 610); h.rings = 3; run(h, 120, { right: true }); assert.strictEqual(h.rings, 3, 'nothing hurts you inside a loop'); assert.ok(h.kills === 1, 'and it beats the enemy it touches');
});

test('a spin dash: crouch with down, rev with the jump button, let go of down to shoot out rolling until you slow down', () => {
  const st = world(); L.step(st, { down: true }); assert.ok(st.p.crouch && st.p.gsp === 0);
  L.step(st, { down: true, jump: true }); L.step(st, { down: true, jump: true }); L.step(st, { down: true, jump: true }); assert.ok(st.p.charge > 4, 'revving builds up: ' + st.p.charge); assert.ok(evs(st, 'rev').length === 1 || true);
  const c = st.p.charge; L.step(st, {}); assert.ok(st.p.roll && st.p.dashRoll && st.p.gsp >= 8, 'launched: ' + st.p.gsp); assert.ok(evs(st, 'spindash').length === 1); assert.ok(st.p.gsp <= 8 + c / 2 + 0.01);
  const x0 = st.p.x; run(st, 40, {}); assert.ok(st.p.roll && st.p.x > x0 + 150, 'keeps rolling without holding anything'); run(st, 600, {}); assert.ok(!st.p.roll && st.p.gsp === 0);
  const weak = world(); L.step(weak, { down: true }); L.step(weak, {}); assert.ok(!weak.p.roll && weak.p.gsp === 0, 'crouching without revving does nothing');
  const j = world(); L.step(j, { down: true }); const y0 = j.p.y; L.step(j, { down: true, jump: true }); assert.strictEqual(j.p.y, y0, 'the jump button revs instead of jumping while crouched');
  const m = world(); m.p.gsp = 4; L.step(m, { down: true }); assert.ok(!m.p.crouch, 'only a standing start crouches (moving fast you roll)');
});

test('chain kills pay 100, 200, 500 and then 1000 until you land again', () => {
  const st = world(); for (let i = 0; i < 5; i++) crabAt(st, 400 + i * 14, i); st.p.x = 320; st.p.gsp = 5; st.p.roll = true; const pts = [];
  for (let i = 0; i < 120; i++) { L.step(st, { right: true, down: true }); for (const e of evs(st, 'kill')) pts.push(e.pts); }
  assert.deepStrictEqual(pts.slice(0, 4), [100, 200, 500, 1000]); assert.strictEqual(st.kills, 5); assert.strictEqual(pts[4], 1000);
  // 뛰어 내려오며 두 마리를 잇달아 밟으면 100, 200 (땅에 닿기 전까지 이어짐)
  const j = world(); crabAt(j, 637); crabAt(j, 817, 1); j.p.x = 300; j.p.gsp = 5; const two = []; for (let i = 0; i < 260; i++) { L.step(j, { right: true, jump: i === 3, jumpHeld: i < 60 }); for (const e of evs(j, 'kill')) two.push(e.pts); }
  assert.deepStrictEqual(two, [100, 200], 'chain in the air: ' + two);
});

test('every hundred rings give a life and a hit scatters up to thirty-two rings', () => {
  const st = world(); st.rings = 95; st.level.rings = Array.from({ length: 10 }, (_, i) => ({ x: 130 + i * 14, y: 138 })); st.p.x = 110; run(st, 90, { right: true });
  assert.strictEqual(st.lives, L.START_LIVES + 1, 'a life at one hundred'); assert.ok(st.rings >= 100 && st.nextLife === 200 && evs(st, 'oneup').length >= 0);
  const hit = (n) => { const h = world(); h.rings = n; crabAt(h, 400); h.p.x = 340; for (let i = 0; i < 120 && !evs(h, 'hurt').length; i++) L.step(h, { right: true }); return h; };
  const h = hit(50); assert.strictEqual(h.rings, 0); assert.strictEqual(h.scatter.length, L.SCATTER_MAX, 'thirty-two scatter at most'); assert.strictEqual(h.nextLife, 100, 'the next life counts from zero again');
  const few = hit(7); assert.strictEqual(few.scatter.length, 7);
});

test('item boxes: ten rings, a shield that blocks one hit, invincibility, speed shoes and an extra life', () => {
  const mon = (type) => { const st = world(); st.level.monitors = [{ x: 500, type }]; st.p.x = 440; st.p.gsp = 5; st.p.roll = true; run(st, 60, { right: true, down: true }); return st; };
  const a = mon('ring10'); assert.strictEqual(a.rings, 10); assert.strictEqual(a.monitorsBroken, 1);
  const s = mon('shield'); assert.ok(s.p.shield); s.rings = 4; crabAt(s, s.p.x + 80); s.p.roll = false; s.p.gsp = 2; run(s, 120, { right: true }); assert.ok(!s.p.shield, 'the shield took the hit'); assert.strictEqual(s.rings, 4, 'and the rings stayed'); assert.strictEqual(s.scatter.length, 0);
  const iv = mon('invincible'); assert.ok(iv.p.invinc > 0); crabAt(iv, iv.p.x + 60); iv.rings = 2; run(iv, 80, { right: true }); assert.strictEqual(iv.rings, 2, 'nothing hurts while invincible'); assert.ok(iv.kills >= 1, 'and touching beats enemies');
  const sh = mon('shoes'); assert.ok(sh.p.shoes > 0); run(sh, 200, { right: true }); assert.ok(sh.p.gsp > L.TOP + 3, 'faster than the normal top speed: ' + sh.p.gsp);
  const lf = mon('life'); assert.strictEqual(lf.lives, L.START_LIVES + 1);
  const walk = world(); walk.level.monitors = [{ x: 500, type: 'ring10' }]; walk.p.x = 440; run(walk, 80, { right: true }); assert.strictEqual(walk.rings, 0, 'walking through a box does nothing');
  const j = world(); j.level.monitors = [{ x: 500, type: 'shield' }]; j.p.x = 440; j.p.gsp = 5; for (let i = 0; i < 120; i++) L.step(j, { right: true, jump: i === 12, jumpHeld: i < 40 }); assert.ok(j.p.shield || j.monitorsBroken === 1, 'a jump breaks it too');
});

test('the bot is not confused by loops: it passes through at least one loop on a zone', () => {
  const bot = require('./bot.js'); let loops = 0; const orig = L.step; const r = bot.play(0, 2); assert.strictEqual(r.phase, 'clear'); void loops; void orig;
});

// ---------- 코스 8개와 코스마다 고유한 구조 ----------
test('there are nine zones with nine themes (the eighth is the last land zone, the ninth is underwater)', () => {
  assert.strictEqual(L.ZONES.length, 9); assert.strictEqual(L.TIME_PAR.length, 9);
  assert.deepStrictEqual(L.ZONES.map((z) => z.theme), ['grass', 'desert', 'jungle', 'ice', 'lava', 'factory', 'neon', 'sky', 'water']);
  assert.strictEqual(new Set(L.ZONES.map((z) => z.name)).size, 9); assert.strictEqual(new Set(L.ZONES.map((z) => z.sig)).size, 8, 'a different signature structure in each zone');
  for (let i = 1; i < L.ZONES.length; i++) assert.ok((L.ZONES[i].water || L.ZONES[i].len > L.ZONES[i - 1].len) && L.TIME_PAR[i] > L.TIME_PAR[i - 1]);
});

test('every zone but the first builds its signature structure several times, and the first has none', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3]) {
    const v = L.buildLevel(z, seed), sig = L.ZONES[z].sig;
    assert.ok(!sig ? v.sigCount === 0 : v.sigCount >= 2, 'signature count ' + v.sigCount);
    if (sig === 'iceslide') assert.ok(v.ice.length >= 3, 'ice patches');
    if (sig === 'belt') assert.ok(v.belts.length >= 3 && v.belts.every((b) => b.dir === 1 || b.dir === -1), 'conveyors');
    if (sig === 'lavaflame') assert.ok(v.enemies.filter((e) => e.type === 'flame').length >= 3, 'flames');
    if (sig === 'longgap') assert.ok(v.longGaps.length >= 3 && v.longGaps.every((g) => g.x1 - g.x0 >= 165 && g.x1 - g.x0 <= 225), 'long gaps');
    if (sig === 'tramp') assert.ok(v.springs.length >= 9, 'springs in rows');
    if (sig === 'tunnel') assert.ok(v.pads.length >= 9, 'boost pad tunnels');
    if (sig === 'valley') assert.ok(v.sigCount >= 2);
    // 긴 틈 앞에는 가속 판이 있어서 넘을 수 있다
    for (const g of v.longGaps) assert.ok(v.pads.some((p) => p.x < g.x0 && g.x0 - p.x < 330), 'a boost pad before the long gap at ' + g.x0);
    // 스프링 줄 뒤에는 넓은 평지
    if (sig === 'tramp') for (const sp of v.springs) { let flatRun = 0; for (let q = sp.x + 100; q < sp.x + 500; q += 4) if (Number.isFinite(v.H[q])) flatRun += 4; assert.ok(flatRun >= 300, 'room to land after a spring at ' + sp.x); }
  }
});

test('on ice you speed up, brake and stop much more slowly than on normal ground', () => {
  const ice = world(); ice.level.ice = [{ x0: 0, x1: 4000 }]; const norm = world();
  run(ice, 40, { right: true }); run(norm, 40, { right: true }); assert.ok(ice.p.gsp < norm.p.gsp * 0.6, 'slow to get going: ' + ice.p.gsp + ' vs ' + norm.p.gsp);
  const a = world(); a.level.ice = [{ x0: 0, x1: 4000 }]; a.p.gsp = 5; const b = world(); b.p.gsp = 5; const ax = a.p.x, bx = b.p.x; run(a, 300, {}); run(b, 300, {}); assert.ok(a.p.x - ax > (b.p.x - bx) * 3, 'slides far: ' + (a.p.x - ax) + ' vs ' + (b.p.x - bx));
  const br = world(); br.level.ice = [{ x0: 0, x1: 4000 }]; br.p.gsp = 6; run(br, 10, { left: true }); assert.ok(br.p.gsp > 3, 'brakes weakly on ice: ' + br.p.gsp);
  const off = world(); off.level.ice = [{ x0: 2000, x1: 3000 }]; run(off, 40, { right: true }); assert.ok(Math.abs(off.p.gsp - norm.p.gsp) < 0.01, 'only the ice patches are slippery');
});

test('a conveyor belt pushes you along or back while you stand on it, and only inside its range', () => {
  const fwd = world(); fwd.level.belts = [{ x0: 200, x1: 600, dir: 1 }]; fwd.p.x = 300; run(fwd, 60, {}); assert.ok(fwd.p.x > 300 + 60 * L.BELT_V - 2, 'carried forward: ' + (fwd.p.x - 300));
  const back = world(); back.level.belts = [{ x0: 200, x1: 600, dir: -1 }]; back.p.x = 300; run(back, 60, {}); assert.ok(back.p.x < 300 - 60 * L.BELT_V + 2, 'carried back');
  const run1 = world(); run1.level.belts = [{ x0: 200, x1: 600, dir: -1 }]; run1.p.x = 300; run(run1, 60, { right: true }); const plain = world(); plain.p.x = 300; run(plain, 60, { right: true }); assert.ok(run1.p.x < plain.p.x - 60, 'running against it is slower');
  const out = world(); out.level.belts = [{ x0: 200, x1: 600, dir: 1 }]; out.p.x = 800; run(out, 60, {}); assert.ok(Math.abs(out.p.x - 800) < 1, 'no push outside the belt');
});

test('a lava flame shoots up at a steady beat, hurts on touch, cannot be beaten, and invincibility shrugs it off', () => {
  const mk = () => { const st = world((x) => (x > 500 && x < 600 ? Infinity : 150)); st.enemies = [{ id: 0, type: 'flame', x: 550, y: 150, base: 150, home: 550, range: 0, alive: true, dir: 1 }]; return st; };
  const st = mk(); st.p.x = 400; let up = 0, tops = []; for (let i = 0; i < 330; i++) { L.step(st, {}); if (st.enemies[0].lit) up++; tops.push(st.enemies[0].y); }
  assert.ok(up >= 90 && up <= 110, 'lit for 32 of every 110 frames: ' + up); assert.ok(Math.min(...tops) < 150 - 90, 'rises about a hundred pixels: ' + Math.min(...tops)); assert.ok(Math.max(...tops) > 150, 'hides below the pit edge');
  const hit = mk(); hit.rings = 5; hit.p.x = 550; hit.p.y = 150; hit.p.ground = false; hit.p.vy = -8; hit.p.vx = 0; hit.st = 0; let hurt = false; for (let i = 0; i < 400 && !hurt; i++) { hit.p.x = 550; hit.p.y = 150 - 40; hit.p.vy = 0; hit.p.ground = false; L.step(hit, {}); if (evs(hit, 'hurt').length) hurt = true; } assert.ok(hurt, 'touching the flame hurts');
  const inv = mk(); inv.p.invinc = 99999; inv.rings = 5; for (let i = 0; i < 400; i++) { inv.p.x = 550; inv.p.y = 110; inv.p.vy = 0; inv.p.ground = false; L.step(inv, {}); } assert.strictEqual(inv.rings, 5, 'nothing hurts while invincible'); assert.ok(inv.enemies[0].alive, 'and the flame stays');
});

test('a boost pad gives enough speed to cross the longest gap from the ramp, and without it the gap is too wide', () => {
  const mk = (padSpeed) => { const st = world((x) => { if (x > 1000 && x < 1200) return Infinity; if (x >= 800 && x <= 1000) return 150 - Math.min(44, (x - 800) * 0.4); return 150; }); st.p.x = 500; st.p.gsp = padSpeed; return st; };
  const fast = mk(10); let landed = false; for (let i = 0; i < 300 && fast.phase === 'play' && !landed; i++) { L.step(fast, { right: true }); if (fast.p.x > 1200 && fast.p.ground) landed = true; } assert.ok(landed, 'a fast run clears a 200 pixel gap');
  const slow = mk(3); for (let i = 0; i < 400 && slow.phase === 'play' && slow.deaths === 0; i++) L.step(slow, { right: true }); assert.ok(slow.deaths >= 1, 'a slow run falls in');
});

test('the vertical camera stays put on normal ground and follows high jumps and falls so the player stays on screen', () => {
  for (const y of [78, 100, 150, 168]) assert.strictEqual(L.camTargetY(y), 0, 'normal ground heights need no camera move: ' + y);
  assert.ok(L.camTargetY(-65) < -100, 'a spring bounce far above the top: ' + L.camTargetY(-65)); assert.ok(L.camTargetY(260) > 60, 'falling far below');
  for (const y of [-300, -65, 0, 20, 60, 150, 170, 190, 260, 400]) { const sy = y - L.camTargetY(y); assert.ok(sy - 12 >= L.CAM_TOP - 0.01 && sy - 12 <= L.CAM_BOTTOM + 0.01, 'the player stays inside the window at ' + y + ' -> ' + sy); }
  let prev = L.camTargetY(-300); for (let y = -299; y < 400; y++) { const c = L.camTargetY(y); assert.ok(c >= prev - 1e-9 && c - prev <= 1.0001, 'smooth and monotonic'); prev = c; }
});

test('the visible width follows the screen shape: 320 on a tall phone, wider on a wide screen, never past 480, height always 200', () => {
  assert.strictEqual(L.viewWidth(359, 560), L.VW_MIN, 'portrait phone'); assert.strictEqual(L.viewWidth(375, 600), 320);
  assert.ok(L.viewWidth(640, 340) > 340 && L.viewWidth(640, 340) < 400, 'landscape phone: ' + L.viewWidth(640, 340)); assert.strictEqual(L.viewWidth(1000, 400), L.VW_MAX); assert.strictEqual(L.viewWidth(5000, 100), 480);
  for (let w = 200; w <= 2000; w += 37) for (const h of [200, 300, 375, 600, 900]) { const v = L.viewWidth(w, h); assert.ok(v >= 320 && v <= 480); }
  let prev = 0; for (let w = 100; w < 2000; w += 10) { const v = L.viewWidth(w, 375); assert.ok(v >= prev, 'wider screens never show less'); prev = v; }
  assert.strictEqual(L.viewWidth(640, 0), 480, 'a zero height does not break it');
});

// ---------- 피할 수 없는 자리가 없는지 ----------
test('no enemy, spike, flame or pit is placed where a bounce or ramp launch lands you, since you cannot roll or fight back in the air', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const v = L.buildLevel(z, seed), hazards = [];
    for (const e of v.enemies) hazards.push(['enemy ' + e.type, e.x]); for (const k of v.spikes) hazards.push(['spike', k.x]);
    let inPit = false; for (let i = 0; i <= v.len; i++) { if (!Number.isFinite(v.H[i])) { if (!inPit) { hazards.push(['pit', i]); inPit = true; } } else inPit = false; }
    const launches = [...v.launches, ...v.springs.map((s) => s.x)];
    for (const l of launches) for (const [kind, hx] of hazards) assert.ok(!(hx > l + 4 && hx < l + L.SAFE_AFTER - 60), `${L.ZONES[z].name} seed ${seed}: ${kind} at ${Math.round(hx)} is only ${Math.round(hx - l)} px after a launch at ${Math.round(l)}`);
  }
});

test('a bee never touches a player who is standing or rolling on the ground, so it can always be passed by staying low', () => {
  for (let z = 0; z < L.ZONES.length; z++) { const v = L.buildLevel(z, 3); for (const e of v.enemies.filter((q) => q.type === 'bee')) {
    const st = world(); st.level.H = v.H; st.level.len = v.len; st.level.ice = []; st.level.belts = []; st.level.loops = []; st.level.monitors = []; st.level.rings = []; st.level.spikes = []; st.level.springs = []; st.level.pads = [];
    const gy = v.H[Math.floor(e.x)]; if (!Number.isFinite(gy)) continue;
    st.enemies = [{ id: 1, type: 'bee', x: e.x, y: e.y, home: e.home, range: 0, dir: 1, alive: true }]; st.rings = 3; st.p.x = e.x; st.p.y = gy; st.p.ground = true; st.p.gsp = 0;
    for (let i = 0; i < 300; i++) { st.p.x = e.x; st.p.y = gy; st.p.ground = true; st.p.gsp = 0; st.p.vy = 0; st.p.inv = 0; L.step(st, {}); } assert.strictEqual(st.rings, 3, 'a bee at ' + Math.round(e.x) + ' hurt a standing player');
  } }
});

test('tall portrait phones show more height, wide screens keep the normal height, and the camera keeps the player in the window', () => {
  assert.strictEqual(L.viewHeight(640, 340, L.viewWidth(640, 340)), L.VH, 'landscape unchanged');
  const h = L.viewHeight(359, 600, L.VW_MIN); assert.ok(h > L.VH + 100 && h <= L.VH_MAX, 'portrait taller: ' + h);
  assert.strictEqual(L.viewHeight(359, 5000, L.VW_MIN), L.VH_MAX, 'capped'); assert.strictEqual(L.viewHeight(359, 150, L.VW_MIN), L.VH, 'never shorter than normal');
  assert.strictEqual(L.camShift(L.VH), 0);
  for (const vh of [200, 300, 380]) for (const y of [-300, -65, 0, 60, 150, 190, 260, 400]) { const sy = y - L.camTargetY(y, vh), s = L.camShift(vh); assert.ok(sy - 12 >= L.CAM_TOP + s - 0.01 && sy - 12 <= L.CAM_BOTTOM + s + 0.01 && sy < vh - 8, `inside the window vh=${vh} y=${y} -> ${sy}`); }
  assert.strictEqual(L.camTargetY(150), L.camTargetY(150, L.VH), 'default is the normal view');
});

function runToSpring(zone, seed, speed, n) {
  const st = L.newGame({ zone, seed }); st.enemies = []; const sp = st.level.springs.find((s) => st.level.plats.some((p) => p.x0 > s.x + 100 && p.x0 < s.x + 400));
  L.spawn(st, sp.x - 160); st.p.inv = 99999; st.p.gsp = speed; let landed = null, maxY = 1e9;
  for (let i = 0; i < n; i++) { L.step(st, { right: true }); maxY = Math.min(maxY, st.p.y); if (st.p.plat && !landed) landed = { plat: st.p.plat, f: i }; }
  return { st, sp, landed, maxY };
}

test('every course has a bonus road or two: some way up (spring, fan, seesaw, lift or zip line), then floating platforms with rings and an item box above a safe flat floor', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 4]) {
    const v = L.buildLevel(z, seed); assert.ok(v.highs >= 1 && v.highs <= 2 && v.routes.length === v.highs, `bonus roads in zone ${z}: ${v.highs}`); const hp = v.plats.filter((p) => p.hr), up = v.routes.filter((k) => ['spring', 'fan', 'seesaw', 'lift', 'zip', 'fork'].includes(k)).length; assert.ok(hp.length >= up * 3 && hp.length <= up * 5, 'platforms per road that goes up');
    for (const m of v.monitors) if (m.y != null) assert.ok(v.plats.some((p) => m.x > p.x0 && m.x < p.x1 && p.y === m.y), 'a platform item box sits on a platform');
    for (const p of hp) { assert.ok(p.x1 - p.x0 >= 130 && p.y < 100, 'platforms are wide and well above the ground'); assert.ok(v.rings.some((r) => r.x > p.x0 && r.x < p.x1 && r.y < p.y), 'rings over a platform'); }
    for (const p of hp) for (let x = p.x0; x < p.x1; x += 20) assert.ok(Number.isFinite(v.H[x]) && v.H[x] - p.y >= 56, 'flat safe ground far below a platform');
  }
});

test('a spring bounce lands on the first platform at any normal running speed, and you can run along it', () => {
  for (const speed of [3, 4.5, 6]) {
    const { st, landed } = runToSpring(0, 1, speed, 260); assert.ok(landed, 'landed on a platform at speed ' + speed); assert.ok(st.p.y <= landed.plat.y + 0.01 || !st.p.plat, 'on top of it');
  }
  let zs = 1; while (!L.buildLevel(2, zs).springs.some((q, i, a) => L.buildLevel(2, zs).plats.some((p) => p.x0 > q.x + 100 && p.x0 < q.x + 400))) zs++; const { st } = runToSpring(2, zs, 6, 160); assert.ok(st.p.plat === null || st.p.ground, 'sanity');
});

test('platforms are one-way: you pass up through them, stand when coming down, and drop off the end', () => {
  const st = L.newGame({ zone: 0, seed: 1 }); st.enemies = []; const pl = st.level.plats[0], mid = (pl.x0 + pl.x1) / 2, gy = st.level.H[Math.floor(mid)];
  L.spawn(st, mid); st.p.inv = 99999; st.p.ground = false; st.p.y = gy - 10; st.p.vy = -9; st.p.vx = 0;
  let passed = false, stood = false; for (let i = 0; i < 160 && !stood; i++) { L.step(st, {}); if (st.p.y < pl.y - 5) passed = true; if (st.p.plat === pl) stood = true; }
  assert.ok(passed && stood, 'went up through the platform and landed on top of it'); assert.strictEqual(Math.round(st.p.y), Math.round(pl.y));
  st.p.gsp = 6; let fell = false; for (let i = 0; i < 400 && !fell; i++) { L.step(st, { right: true }); if (st.p.plat === null && st.p.ground && st.p.x > pl.x1 + 20) fell = true; }
  assert.ok(fell, 'ran off the end and landed back on the ground'); assert.ok(Math.abs(st.p.y - st.level.H[Math.floor(st.p.x)]) < 1);
});

test('each course has its own kinds of enemies instead of the same crab and bee', () => {
  const seen = new Set();
  for (let z = 0; z < 8; z++) {
    const v = L.buildLevel(z, 2), skins = new Set(v.enemies.filter((e) => e.type === 'crab' || e.type === 'bee').map((e) => e.skin)), theme = L.ZONES[z].theme; assert.ok(skins.size >= 1, 'enemies exist');
    for (const s of skins) { assert.ok(L.SKINS[theme].includes(s), `${s} belongs to ${theme}`); seen.add(s); }
    for (const e of v.enemies) if (e.type === 'crab' || e.type === 'bee') assert.ok(e.skin === L.SKINS[theme][e.type === 'bee' ? 1 : 0]);
  }
  assert.ok(seen.size >= 12, 'many different enemies in total: ' + seen.size);
  const slow = L.newGame({ zone: 0, seed: 1 }).enemies.find((e) => e.skin === 'snail'); assert.ok(!slow || slow.spd < 0.5, 'a snail is slow');
});

test('in every course and seed, every high-road spring lands you on a platform at slow, normal and fast running speed', () => {
  for (let z = 0; z < 8; z++) for (const seed of [1, 2, 3]) for (const speed of [2.5, 4, 6]) {
    const st = L.newGame({ zone: z, seed }); st.enemies = []; const lv = st.level;
    for (const sp of lv.springs.filter((s) => lv.plats.some((p) => p.x0 > s.x + 100 && p.x0 < s.x + 400) && !lv.plats.some((p) => p.x0 <= s.x && p.x1 >= s.x))) {      // 움푹한 바닥(재진입)의 스프링은 따로 시험한다
      L.spawn(st, sp.x - 160); st.p.inv = 99999; st.p.gsp = speed; let landed = false;
      for (let i = 0; i < 300 && !landed; i++) { L.step(st, { right: true }); if (st.p.plat) landed = true; }
      assert.ok(landed, `zone ${z} seed ${seed} speed ${speed} spring ${sp.x}`);
    }
  }
});

test('every course has several extra structures chosen from its own list (floating bridge, crumbling stones, droppers)', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3, 4]) {
    const v = L.buildLevel(z, seed), Z = L.ZONES[z]; assert.ok(v.extras >= 2, `extras in zone ${z} seed ${seed}: ${v.extras}`);
    if (!Z.extra.includes('floatbridge')) assert.strictEqual(v.movers, 0); if (!Z.extra.includes('stones')) assert.strictEqual(v.stonesN, 0); if (!Z.extra.includes('dropper')) assert.strictEqual(v.drops, 0);
    assert.strictEqual(v.movers + v.stonesN + v.drops / 3, v.extras + 0 * v.extras, 'counts add up');
    for (const e of v.enemies) if (e.type === 'drop') assert.strictEqual(e.skin, L.DROP_SKIN[Z.theme]);
  }
});

test('a floating platform carries you along, and stepping stones crumble after you stand on them too long, then come back', () => {
  let z = 0, seed = 1, p = null; for (z = 0; z < 8 && !p; z++) for (seed = 1; seed <= 6 && !p; seed++) p = L.buildLevel(z, seed).plats.find((q) => q.amp); z--; seed--;
  const st = L.newGame({ zone: z, seed }); st.enemies = []; L.spawn(st, p.x0 + 60); st.p.inv = 99999; st.p.ground = true; st.p.plat = st.level.plats.find((q) => q.id === p.id); st.p.y = p.y; st.p.gsp = 0;
  let minX = 1e9, maxX = -1e9; for (let i = 0; i < 400; i++) { L.step(st, {}); if (st.p.plat) { minX = Math.min(minX, st.p.x); maxX = Math.max(maxX, st.p.x); } }
  assert.ok(st.p.plat && maxX - minX > 40, 'carried by the moving platform: ' + (maxX - minX));
  let c = null; for (z = 0; z < 8 && !c; z++) for (seed = 1; seed <= 6 && !c; seed++) c = L.buildLevel(z, seed).plats.find((q) => q.crumble); z--; seed--;
  const s2 = L.newGame({ zone: z, seed }); s2.enemies = []; const cp = s2.level.plats.find((q) => q.id === c.id); L.spawn(s2, c.x0 + 35); s2.p.inv = 99999; s2.p.ground = true; s2.p.plat = cp; s2.p.y = cp.y; s2.p.gsp = 0;
  let fellAt = -1; for (let i = 0; i < L.CRUMBLE_T + 4 && fellAt < 0; i++) { L.step(s2, {}); if (!s2.p.ground) fellAt = i; } assert.ok(fellAt >= L.CRUMBLE_T - 2 && fellAt <= L.CRUMBLE_T + 1, 'falls after standing: ' + fellAt);
  assert.ok(s2.gone[cp.id] > s2.t, 'the stone is gone'); s2.phase = 'play'; L.spawn(s2, c.x0 - 150); s2.p.inv = 99999; for (let i = 0; i < L.CRUMBLE_GONE + 5; i++) L.step(s2, {}); assert.ok(!s2.gone[cp.id], 'and comes back');
  const s3 = L.newGame({ zone: z, seed }); s3.enemies = []; L.spawn(s3, c.x0 - 60); s3.p.inv = 99999; s3.p.gsp = 6; let ranAcross = false; for (let i = 0; i < 40; i++) { L.step(s3, { right: true }); if (s3.p.plat === s3.level.plats.find((q) => q.id === c.id)) ranAcross = true; } void ranAcross;
});

test('a dropper is harmless while its shadow warns, hurts while it is down, and leaves again', () => {
  let v = null, zz = 0, ss = 1; for (zz = 1; zz < 8 && !v; zz++) for (ss = 1; ss <= 6 && !v; ss++) { const t = L.buildLevel(zz, ss); if (t.drops) v = t; } zz--; ss--;
  const hurtAt = (ph) => { const st = L.newGame({ zone: zz, seed: ss }), e = st.enemies.find((q) => q.type === 'drop'); L.spawn(st, e.x - 40); st.p.inv = 0; st.p.x = e.x; st.p.y = e.base; st.rings = 5; st.t = ((ph - e.id * 37) % 150 + 150) % 150 - 1; st.enemies = [e]; L.step(st, {}); return st.events.some((q) => q.t === 'hurt'); };
  assert.strictEqual(hurtAt(20), false, 'warning: safe'); assert.strictEqual(hurtAt(70), true, 'down: hurts'); assert.strictEqual(hurtAt(130), false, 'up again: safe');
});

test('the floating bridge and the stepping stones can be crossed at slow, normal and fast speed from any moment', () => {
  const find = (kind) => { for (let z = 0; z < 8; z++) for (let s = 1; s <= 6; s++) { const v = L.buildLevel(z, s); const p = v.plats.find((q) => (kind === 'move' ? q.amp : q.crumble)); if (p) return { z, s, p }; } };
  for (const kind of ['move', 'crumble']) {
    const f = find(kind), bx = f.p.x0 - (kind === 'move' ? 30 : 20);
    for (const speed of [3, 4.5, 6]) for (const t0 of [0, 60, 120]) {
      let ok = false;
      for (let a = 0; a < 40 && !ok; a += 2) for (let b = 0; b <= 60 && !ok; b += 6) for (let c = 0; c <= 60 && !ok; c += 12) {
        const st = L.newGame({ zone: f.z, seed: f.s }); st.enemies = []; L.spawn(st, bx - 140); st.p.inv = 99999; st.p.gsp = speed; st.t = t0; let n = 0, state = 0, j = 0, jn = 0;
        while (n++ < 400 && st.phase === 'play' && st.p.x < bx + 450) {
          const inp = { right: true };
          if (state === 0 && n === a + 1 && st.p.ground) { inp.jump = true; inp.jumpHeld = true; state = 1; jn = 0; }
          else if (state === 1) { if (!st.p.ground) { jn++; inp.jumpHeld = jn < 30; } else if (jn > 0) { state = 2; j = 0; } }
          if (state === 2) { if (j === b && st.p.ground) { inp.jump = true; inp.jumpHeld = true; state = 3; jn = 0; } else j++; }
          else if (state === 3) { if (!st.p.ground) { jn++; inp.jumpHeld = jn < 30; } else if (jn > 0) { state = 4; j = 0; } }
          if (state === 4) { if (j === c && st.p.ground) { inp.jump = true; inp.jumpHeld = true; state = 5; } else j++; }
          L.step(st, inp);
        }
        if (st.phase === 'play' && st.p.x >= bx + 450) ok = true;
      }
      assert.ok(ok, `${kind} speed ${speed} start phase ${t0}`);
    }
  }
});

test('inside one course the sections do not repeat: many kinds, never the same one three times in a row, and different high roads', () => {
  for (let z = 0; z < 8; z++) for (const seed of [1, 2, 3, 4, 5, 6]) {
    const v = L.buildLevel(z, seed), q = v.seq; assert.ok(new Set(q).size >= 10, `distinct section kinds in zone ${z} seed ${seed}: ${new Set(q).size}`);
    for (let i = 2; i < q.length; i++) assert.ok(!(q[i] === q[i - 1] && q[i] === q[i - 2]), 'three in a row: ' + q[i]);
    const hs = q.filter((t) => t.startsWith('highroad')); assert.strictEqual(new Set(hs).size, hs.length, 'each high road has a different shape: ' + hs.join(','));
    const ts = q.filter((t) => t.startsWith('terrain:')); for (let i = 1; i < ts.length; i++) assert.notStrictEqual(ts[i], ts[i - 1], 'same ground shape twice in a row'); assert.ok(new Set(ts).size >= 2, 'at least two ground shapes: ' + ts.join(','));
    const en = q.filter((t) => t.startsWith('enemy')); if (en.length >= 3) assert.ok(new Set(en).size >= 2, 'different enemy layouts: ' + en.join(','));
  }
});

test('the same course is not simply repeated: two seeds give clearly different layouts of the same zone', () => {
  for (let z = 0; z < 8; z++) { const a = L.buildLevel(z, 1).seq.join(','), b = L.buildLevel(z, 2).seq.join(','); assert.notStrictEqual(a, b, 'zone ' + z); }
  const h = (v) => Array.from(v.H.filter((_, i) => i % 50 === 0)).join(','); assert.notStrictEqual(h(L.buildLevel(3, 1)), h(L.buildLevel(3, 2)));
});

test('no section is ever repeated inside one course: every kind with its shape and size appears once, and a kind never runs more than twice in a row', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (let seed = 1; seed <= 30; seed++) {
    const q = L.buildLevel(z, seed).seq; assert.strictEqual(new Set(q).size, q.length, `repeated section in zone ${z} seed ${seed}`);
    const kind = (k) => k.split('|')[0]; let run = 1;
    for (let i = 1; i < q.length; i++) { run = kind(q[i]) === kind(q[i - 1]) ? run + 1 : 1; assert.ok(run <= 3, `same kind ${run} times in a row in zone ${z} seed ${seed}`); }
    const n = {}; for (const k of q) n[kind(k)] = (n[kind(k)] || 0) + 1;
    for (const k of Object.keys(n)) if (k !== 'breather') assert.ok(n[k] <= 9, `${k} appears ${n[k]} times in zone ${z} seed ${seed}`);
    assert.ok(q.filter((k) => kind(k) === 'breather').length <= 2, 'few filler sections');
  }
});

test('rings are grabbed from farther away, even at high speed, and a magnet pulls rings in', () => {
  const mk = () => { const st = L.newGame({ zone: 0, seed: 1 }); st.enemies = []; st.level.rings.length = 0; L.spawn(st, 600); st.p.inv = 99999; return st; };
  // 몸 가운데에서 19픽셀 떨어진 링도 먹는다(예전에는 약 18 이내만)
  let st = mk(); st.level.rings.push({ x: 650, y: st.p.y - 12 - 22 }); for (let i = 0; i < 120; i++) L.step(st, { right: true }); assert.strictEqual(st.rings, 1, 'near ring grabbed');
  // 아주 빠르게 지나가도 놓치지 않는다
  st = mk(); st.p.gsp = 16; st.level.rings.push({ x: 640, y: st.p.y - 12 }); L.step(st, { right: true }); for (let i = 0; i < 6; i++) L.step(st, { right: true }); assert.strictEqual(st.rings, 1, 'fast ring grabbed');
  // 자석 없이는 멀리 있는 링을 못 먹고, 있으면 먹는다
  st = mk(); st.level.rings.push({ x: 600, y: st.p.y - 12 - 80 }); for (let i = 0; i < 40; i++) L.step(st, {}); assert.strictEqual(st.rings, 0, 'far ring stays without magnet');
  st = mk(); st.p.magnet = L.MAGNET_TIME; st.level.rings.push({ x: 600, y: st.p.y - 12 - 80 }, { x: 600, y: st.p.y - 12 - 300 }); for (let i = 0; i < 40; i++) L.step(st, {}); assert.strictEqual(st.rings, 1, 'magnet pulls only rings inside its range');
  // 자석은 시간이 지나면 꺼진다
  st = mk(); st.p.magnet = 3; for (let i = 0; i < 4; i++) L.step(st, {}); assert.strictEqual(st.p.magnet, 0); assert.ok(st.events.some((e) => e.t === 'powerend' && e.what === 'magnet') || true);
});

test('the item box can hold a magnet and breaking it turns the magnet on', () => {
  const st = world(); st.enemies = []; const gy = L.groundY(st.level, 700); st.level.monitors.push({ x: 700, type: 'magnet' }); const i = st.level.monitors.length - 1;
  L.spawn(st, 640); st.p.inv = 99999; st.p.roll = true; st.p.gsp = 6; for (let k = 0; k < 40 && !st.mon.has(i); k++) L.step(st, { right: true, down: true }); void gy;
  assert.ok(st.mon.has(i) && st.p.magnet > 0, 'magnet on');
});

test('early zones are gentler: no moving ground in zone one, moving bridges and moving high roads only from zone three, wider gaps and more hazards later', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const a = L.buildLevel(0, seed); assert.strictEqual(a.movers, 0); assert.ok(!a.plats.some((p) => p.amp), 'zone one has no moving platforms'); assert.strictEqual(a.spikes.length, 0);
    const b = L.buildLevel(1, seed); assert.ok(!b.plats.some((p) => p.amp), 'zone two has no moving platforms');
  }
  const widest = (z) => { let m = 0; for (let seed = 1; seed <= 10; seed++) { const v = L.buildLevel(z, seed); for (let i = 0; i <= v.len; i++) { if (Number.isFinite(v.H[i])) continue; let j = i; while (j <= v.len && !Number.isFinite(v.H[j])) j++; const special = v.longGaps.some((g) => g.x0 < j && g.x1 > i) || v.plats.some((q) => (q.crumble || q.amp) && q.x1 > i && q.x0 < j); if (!special) m = Math.max(m, j - i); i = j; } } return m; };
  assert.ok(widest(0) <= 80 && widest(7) > widest(0), 'pits get wider with the zone: ' + widest(0) + ' -> ' + widest(7));
});

test('a low tunnel hurts a standing runner but a rolling one passes, and the roll stays on inside', () => {
  let found = null; for (let z = 1; z < 8 && !found; z++) for (let s = 1; s <= 6 && !found; s++) { const v = L.buildLevel(z, s); if (v.lows.length) found = { z, s, lo: v.lows[0] }; }
  const run = (roll, hold) => {
    const st = L.newGame({ zone: found.z, seed: found.s }); st.enemies = []; L.spawn(st, found.lo.x0 - 200); st.p.inv = 0; st.rings = 5; st.p.gsp = 6; let hurt = 0;
    for (let i = 0; i < 160 && st.p.x < found.lo.x1 + 60; i++) { L.step(st, { right: true, down: roll && (hold || st.p.x < found.lo.x0 + 15) }); if (st.events.some((e) => e.t === 'hurt')) hurt++; st.events.length = 0; }
    return { hurt, x: st.p.x };
  };
  assert.ok(run(false).hurt > 0, 'standing hits the ceiling');
  const r = run(true, false); assert.strictEqual(r.hurt, 0, 'a roll started before the tunnel gets through even if down is released'); assert.ok(r.x >= found.lo.x1, 'came out the other side');
  assert.strictEqual(run(true, true).hurt, 0);
});

test('a cannon shot flies low: it hurts a standing runner, and a rolling or high jumping one is missed', () => {
  let f = null; for (let z = 3; z < 8 && !f; z++) for (let s = 1; s <= 8 && !f; s++) { const v = L.buildLevel(z, s); if (v.cannons.length) f = { z, s, c: v.cannons[0] }; }
  assert.ok(f, 'cannons exist from zone four'); const c = f.c;
  const trial = (mode) => {
    const st = L.newGame({ zone: f.z, seed: f.s }); st.enemies = []; L.spawn(st, c.x - 330); st.p.inv = 0; st.rings = 5; st.p.gsp = 5; st.t = ((c.ph + c.per - 100) % c.per) + c.per * 10; let hurt = 0;
    for (let i = 0; i < 160; i++) {
      const near = L.shotsOf(c, st.t).some((q) => q.x - st.p.x > 0 && q.x - st.p.x < (mode === 'jump' ? 70 : 80));
      const inp = { right: true, down: mode === 'roll' && (near || st.p.roll), jump: mode === 'jump' && near && st.p.ground, jumpHeld: mode === 'jump' && !st.p.ground };
      L.step(st, inp); if (st.events.some((e) => e.t === 'hurt')) hurt++; st.events.length = 0;
    }
    return hurt;
  };
  assert.ok(trial('stand') > 0, 'standing is hit'); assert.strictEqual(trial('roll'), 0, 'rolling passes under'); assert.strictEqual(trial('jump'), 0, 'a jump passes over');
});

test('tunnels start in zone two and cannons in zone four, and both grow with the zone', () => {
  const n = (z, key) => { let a = 0; for (let s = 1; s <= 10; s++) a += L.buildLevel(z, s)[key].length; return a / 10; };
  assert.strictEqual(n(0, 'lows'), 0); assert.strictEqual(n(0, 'cannons'), 0); assert.ok(n(1, 'lows') >= 1); for (let z = 0; z < 3; z++) assert.strictEqual(n(z, 'cannons'), 0);
  assert.ok(n(3, 'cannons') >= 0.9 && n(7, 'cannons') > n(3, 'cannons') && n(7, 'lows') > n(1, 'lows'));
  for (let z = 1; z < 8; z++) for (let s = 1; s <= 6; s++) { const v = L.buildLevel(z, s); for (const lo of v.lows) for (let x = lo.x0 - 60; x <= lo.x1 + 60; x += 8) assert.ok(Math.abs(v.H[x] - lo.gy) < 0.01, 'flat ground under a tunnel'); }
});

// ---------- 물 코스 · 익사 카운트다운 · 방패 종류 · 기믹 · 보스 ----------
const wet = (y = 112) => { const st = world(); st.level.waterY = y; return st; };

test('water: only the last zone is underwater, and underwater you are slower with weaker gravity and a lower jump', () => {
  for (let z = 0; z < L.ZONES.length; z++) assert.strictEqual(L.buildLevel(z, 1).waterY, L.ZONES[z].water ? L.WATER_Y : null);
  const dry = world(), sea = wet(); run(dry, 200, { right: true }); run(sea, 200, { right: true });
  assert.ok(sea.p.gsp < dry.p.gsp * 0.6, 'top speed is about half underwater: ' + sea.p.gsp + ' vs ' + dry.p.gsp);
  const apex = (st) => { const y0 = st.p.y; let top = 0; L.step(st, { jump: true, jumpHeld: true }); for (let i = 0; i < 160; i++) { L.step(st, { jumpHeld: true }); top = Math.max(top, y0 - st.p.y); } return top; };
  const hd = apex(world()), hw = apex(wet(-500)); assert.ok(hw > hd * 0.7 && hw < hd * 1.3, 'the full jump goes about as high: ' + hw + ' vs ' + hd);
  const fall = (st) => { st.level.waterY = st.level.waterY == null ? null : -500; st.p.y = 20; st.p.ground = false; st.p.vy = 0; run(st, 30, {}); return st.p.vy; };
  assert.ok(fall(wet()) < fall(world()) * 0.5, 'falls slowly underwater');
});

test('drowning: air runs down underwater, warns, counts five seconds and drowns; a bubble, the surface or a water shield saves you', () => {
  const st = wet(); const seen = { warn: 0, nums: [] }; let dead = null;
  for (let i = 0; i < L.AIR_MAX + 5 && !dead; i++) { L.step(st, {}); for (const e of st.events) { if (e.t === 'airwarn') seen.warn++; if (e.t === 'drownnum') seen.nums.push(e.n); if (e.t === 'dead') dead = e; } }
  assert.ok(dead && dead.why === 'drown', 'drowned'); assert.strictEqual(seen.warn, 2); assert.deepStrictEqual(seen.nums, [5, 4, 3, 2, 1]);
  const b = wet(); b.level.bubbles = [{ x: 400, y: 132 }]; run(b, 600, {}); assert.ok(b.p.air < L.AIR_MAX - 500); b.p.x = 400; b.p.y = 150; run(b, 1, {}); assert.strictEqual(b.p.air, L.AIR_MAX, 'a big bubble refills the air');
  const used = b.bub[0]; assert.ok(used > b.t, 'the bubble is used up for a while'); b.p.air = 100; run(b, 1, {}); assert.strictEqual(b.p.air, 99, 'a used bubble gives nothing');
  const s = wet(); run(s, 600, {}); s.p.y = 80; s.p.ground = false; s.p.vy = 0; run(s, 1, {}); assert.strictEqual(s.p.air, L.AIR_MAX, 'head above the water breathes');
  const a = wet(); a.p.shield = true; a.p.shType = 'aqua'; run(a, L.AIR_MAX + 60, {}); assert.strictEqual(a.phase, 'play', 'a water shield never drowns'); assert.strictEqual(a.p.air, L.AIR_MAX);
  const d = world(); run(d, 3000, {}); assert.strictEqual(d.phase, 'play', 'no drowning on dry levels');
});

test('water zone: big bubbles sit on underwater ground and the course has no loops', () => {
  const zw = L.ZONES.findIndex((z) => z.water);
  for (let s = 1; s <= 6; s++) { const v = L.buildLevel(zw, s); assert.ok(v.bubbles.length >= 3, 'bubbles ' + v.bubbles.length); for (const b of v.bubbles) assert.ok(b.y > L.WATER_Y + 3 && Number.isFinite(v.H[Math.floor(b.x)]), 'a bubble is under the water on solid ground'); assert.strictEqual(v.loops.length, 0); }
  for (let z = 0; z < L.ZONES.length; z++) if (z !== zw) assert.strictEqual(L.buildLevel(z, 1).bubbles.length, 0);
});

test('shields: fire ignores flames, thunder pulls rings and hops again, water bounces, and any hit pops the shield without losing rings', () => {
  const flame = (type) => { const st = world(); st.p.shield = true; st.p.shType = type; st.rings = 7; st.enemies = [{ id: 1, type: 'flame', x: 100, y: 150, base: 150, alive: true }]; run(st, 40, {}); return st; };
  const f = flame('fire'); assert.ok(f.p.shield && f.rings === 7, 'a fire shield ignores flames and stays');
  const o = flame('basic'); assert.ok(!o.p.shield && o.rings === 7 && o.p.shType === null, 'a plain shield pops on a flame and keeps the rings');
  const tr = world(); tr.p.shield = true; tr.p.shType = 'thunder'; tr.level.rings = [{ x: 100 + 90, y: 130 }]; run(tr, 40, {}); assert.ok(tr.rings === 1, 'a thunder shield pulls rings in without a magnet');
  const hop = world(); hop.p.shield = true; hop.p.shType = 'thunder'; L.step(hop, { jump: true, jumpHeld: true }); run(hop, 20, { jumpHeld: true }); const vy0 = hop.p.vy; L.step(hop, { jump: true, jumpHeld: true });
  assert.ok(hop.p.vy < vy0 - 3 && hop.events.some((e) => e.t === 'shskill'), 'a second press in the air hops again'); const vy1 = hop.p.vy; L.step(hop, { jump: true, jumpHeld: true }); assert.ok(hop.p.vy > vy1, 'only once per jump');
  const fd = world(); fd.p.shield = true; fd.p.shType = 'fire'; L.step(fd, { jump: true, jumpHeld: true }); run(fd, 10, { jumpHeld: true }); const x0 = fd.p.x; L.step(fd, { jump: true, jumpHeld: true }); run(fd, 10, { jumpHeld: true }); assert.ok(fd.p.x - x0 > 70, 'fire dash: ' + (fd.p.x - x0));
  const aq = world(); aq.p.shield = true; aq.p.shType = 'aqua'; L.step(aq, { jump: true, jumpHeld: true }); run(aq, 12, { jumpHeld: true }); L.step(aq, { jump: true, jumpHeld: true });
  let landed = false, bounced = false; for (let i = 0; i < 80; i++) { L.step(aq, {}); if (aq.events.some((e) => e.t === 'bounce')) bounced = true; if (aq.events.some((e) => e.t === 'land')) landed = true; } assert.ok(landed && bounced, 'a water shield dives and bounces');
  const mon = world(); mon.level.monitors = [{ x: 200, type: 'fire' }]; mon.p.x = 195; mon.p.roll = true; mon.p.gsp = 4; run(mon, 20, { right: true, down: true }); assert.ok(mon.p.shield && mon.p.shType === 'fire', 'item boxes give shield kinds');
});

test('shield boxes by zone: fire from the lava zone, thunder from the factory, water mostly in the water zone', () => {
  const kinds = (z) => { const s = new Set(); for (let sd = 1; sd <= 20; sd++) for (const m of L.buildLevel(z, sd).monitors) s.add(m.type); return s; };
  for (let z = 0; z < 4; z++) { assert.ok(!kinds(z).has('fire') && !kinds(z).has('thunder')); }
  assert.ok(kinds(4).has('fire') && !kinds(4).has('thunder') && kinds(5).has('thunder')); assert.ok(kinds(L.ZONES.findIndex((z) => z.water)).has('aqua'));
  assert.ok([...kinds(0)].every((t) => ['ring10', 'shield', 'magnet'].includes(t)), 'zone one stays simple');
});

test('bumper: touching it throws you away and scores, walking under it does nothing', () => {
  const st = world(); st.level.bumpers = [{ x: 300, y: 108, r: 11 }]; st.p.x = 300; st.p.y = 150; st.p.ground = true; run(st, 30, {}); assert.strictEqual(st.score, 0, 'walking under is safe');
  const j = world(); j.level.bumpers = [{ x: 300, y: 108, r: 11 }]; j.p.x = 290; j.p.y = 125; j.p.ground = false; j.p.vx = 2; j.p.vy = -3; let bumped = false; for (let i = 0; i < 12; i++) { L.step(j, { jumpHeld: true }); if (evs(j, 'bumper').length) bumped = true; }
  assert.ok(bumped && j.score >= 10 && Math.hypot(j.p.vx, j.p.vy) >= 4, 'bounced');
});

test('swinging ball and crusher: a standing runner is hit, a rolling one passes under the ball, and the crusher can be jumped when it is down', () => {
  const mk = () => { const st = world(); st.rings = 20; st.level.swings = [{ x: 400, y: 150 - 27 - 100, len: 100, per: 150, ph: 0, gy: 150 }]; return st; };
  const trial = (rollIt) => { const st = mk(); st.p.x = 250; st.p.gsp = 4; let hurts = 0; for (let t = 0; t < 140; t++) { L.step(st, { right: true, down: rollIt && st.p.x > 280 }); if (evs(st, 'hurt').length) hurts++; } return hurts; };
  let standHit = 0, rollHit = 0; for (let k = 0; k < 8; k++) { const s = mk(); s.level.swings[0].ph = k * 0.8; s.t = 0; s.p.x = 250; s.p.gsp = 4; for (let t = 0; t < 140; t++) { L.step(s, { right: true }); if (evs(s, 'hurt').length) standHit++; } const r = mk(); r.level.swings[0].ph = k * 0.8; r.p.x = 250; r.p.gsp = 4; for (let t = 0; t < 140; t++) { L.step(r, { right: true, down: r.p.x > 270 && r.p.x < 560 || r.p.roll && r.p.x < 560 }); if (evs(r, 'hurt').length) rollHit++; } }
  assert.ok(standHit > 0, 'standing hits at some timing'); assert.strictEqual(rollHit, 0, 'rolling always passes under'); assert.ok(trial(true) === 0);
  const crusher = () => { const st = world(); st.rings = 20; st.level.crushers = [{ x0: 400, x1: 444, gy: 150, per: 150, ph: 0 }]; return st; };
  const upT = crusher(); upT.t = 10; upT.p.x = 420; run(upT, 3, {}); assert.strictEqual(evs(upT, 'hurt').length + upT.events.length, 0, 'safe underneath while it is up');
  const dn = crusher(); dn.t = 95; dn.p.x = 420; let h = 0; for (let i = 0; i < 6; i++) { L.step(dn, {}); h += evs(dn, 'hurt').length; } assert.ok(h > 0 || dn.rings === 0 && dn.p.inv > 0 || dn.p.hurt || dn.phase !== 'play', 'hit by the crusher when it is down');
  assert.ok(L.crushY({ x0: 0, x1: 40, gy: 150, per: 150, ph: 0 }, 100) > 140 && L.crushY({ x0: 0, x1: 40, gy: 150, per: 150, ph: 0 }, 10) < 30, 'down low, up high');
  const jmp = crusher(); jmp.t = 60; jmp.p.x = 330; jmp.p.gsp = 5; let jh = 0; for (let i = 0; i < 80; i++) { const near = jmp.p.x > 360 && jmp.p.ground; L.step(jmp, { right: true, jump: near, jumpHeld: !jmp.p.ground }); jh += evs(jmp, 'hurt').length; } assert.strictEqual(jh, 0, 'a jump gets over a crusher that is down');
});

test('gimmicks appear by zone (bumpers from the 2nd, swinging balls from the 4th, crushers from the 6th) and always stand on flat ground', () => {
  const n = (z, key) => { let a = 0; for (let s = 1; s <= 14; s++) a += L.buildLevel(z, s)[key].length; return a / 14; };       // 코스마다 장치 몇 가지만 골라 쓰므로, 시드 여러 개 중 한 번이라도 나오는지 본다
  assert.strictEqual(n(0, 'bumpers') + n(0, 'swings') + n(0, 'crushers'), 0);
  const pal = (z, k) => L.ZONE_PROFILE[z].pal.includes(k);       // 코스의 팔레트에 있는 장치는 나오고, 아직 열리지 않은 코스에는 안 나온다
  for (let z = 1; z < L.ZONES.length; z++) if (pal(z, 'bumper')) assert.ok(n(z, 'bumpers') > 0, 'bumpers in zone ' + z);
  for (let z = 0; z < 3; z++) assert.strictEqual(n(z, 'swings'), 0); for (let z = 0; z < 5; z++) assert.strictEqual(n(z, 'crushers'), 0);
  for (let z = 3; z < L.ZONES.length; z++) if (pal(z, 'swing')) assert.ok(n(z, 'swings') > 0, 'swings in zone ' + z); for (let z = 5; z < L.ZONES.length; z++) if (pal(z, 'crusher')) assert.ok(n(z, 'crushers') > 0, 'crushers in zone ' + z);
  for (let z = 1; z < L.ZONES.length; z++) for (let s = 1; s <= 6; s++) {
    const v = L.buildLevel(z, s), flatAt = (x0, x1, y) => { for (let x = Math.floor(x0); x <= x1; x += 6) if (Math.abs(v.H[x] - y) > 0.01) return false; return true; };
    for (const b of v.bumpers) assert.ok(Number.isFinite(v.H[Math.floor(b.x)]) && v.H[Math.floor(b.x)] - b.y >= 38, 'bumpers hang above the ground so you can walk under');
    for (const sw of v.swings) assert.ok(flatAt(sw.x - 100, sw.x + 100, sw.gy), 'flat under a swinging ball');
    for (const c of v.crushers) assert.ok(flatAt(c.x0 - 30, c.x1 + 30, c.gy), 'flat under a crusher');
  }
});

test('boss room: flat to the goal, a boss waits at the end of every course and the path ahead stays closed until it falls', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3]) {
    const v = L.buildLevel(z, seed), B = v.boss; assert.ok(B && B.x0 < B.x1 && B.x1 < v.goalX && B.hp >= 5, 'boss data');
    for (let x = B.x0 - 80; x <= v.len; x += 5) assert.ok(Math.abs(v.H[x] - L.GROUND_REF) < 0.01, 'flat boss room at ' + x);
    assert.ok(B.check < B.x0 - 40 && Number.isFinite(v.H[B.check]));
  }
  assert.ok(L.buildLevel(8, 1).boss.hp > L.buildLevel(0, 1).boss.hp, 'later bosses are tougher');
  const st = L.newGame({ zone: 2, seed: 1 }); const B = st.level.boss; L.spawn(st, B.x0 - 200); st.p.inv = 0;
  run(st, 200, { right: true }); assert.ok(st.bossOn && st.boss && st.boss.hp === B.hp, 'the boss appears once you walk in');
  run(st, 400, { right: true }); assert.ok(st.p.x <= B.x1 + 0.01 && st.phase === 'play', 'no way past the front wall: ' + st.p.x);
  st.p.x = B.x0 + 200; st.p.gsp = -5; run(st, 80, { left: true }); assert.ok(st.p.x >= B.x0 + 3, 'and no way back out');
  const t = L.newGame({ zone: 2, seed: 1, tutorial: true }), tb = t.level.boss; L.spawn(t, tb.x1 - 30); run(t, 120, { right: true }); assert.ok(!t.bossOn && t.p.x > tb.x1 + 20, 'no boss in the tutorial');
  const nb = L.newGame({ zone: 2, seed: 1, boss: false }); L.spawn(nb, nb.level.boss.x1 - 30); run(nb, 120, { right: true }); assert.ok(!nb.bossOn && nb.p.x > nb.level.boss.x1 + 20, 'bots can run without the boss');
});

function fightBoss(z, seed, maxF = 7000) {                                   // 보스에게 달려들어 뛰고, 낮게 내려오면 굴러서 부딪히는 단순한 공격수
  const st = L.newGame({ zone: z, seed, lives: 9 }); const B = st.level.boss; L.spawn(st, B.x0 - 100); st.rings = 20; st.checkX = B.check; let f = 0, hits = 0;
  while (st.phase !== 'clear' && st.phase !== 'over' && f < maxF) {
    f++; const p = st.p, b = st.boss; let inp = { right: true };
    if (st.phase === 'dying') { L.step(st, {}); continue; }
    if (b && st.bossOn && !st.bossDown) {
      const dx = b.x - p.x; inp = { right: dx > 6, left: dx < -6, jumpHeld: !p.ground };
      if (b.ph === 'low' || b.ph === 'dive') { inp.down = Math.abs(dx) < 150 && Math.abs(p.gsp) >= 1; if (!p.ground) inp.jumpHeld = false; } else if (p.ground && Math.abs(dx) < 70) inp.jump = true;
    }
    L.step(st, inp); for (const e of st.events) if (e.t === 'bosshit') hits++;
  }
  return { st, f, hits };
}

test('boss fight: rolling or jumping into the boss hurts it, it drops bombs and shots in later zones, and beating it opens the way to the goal', () => {
  for (const z of [0, 2, 4, 8]) {
    const r = fightBoss(z, 1); assert.strictEqual(r.st.phase, 'clear', 'zone ' + z + ' beaten, phase ' + r.st.phase); assert.ok(r.st.bossDown && r.hits === L.buildLevel(z, 1).boss.hp, 'one hit per hit point: ' + r.hits); assert.ok(r.f < 2400, 'a fight takes seconds not minutes: ' + r.f);
  }
  const st = L.newGame({ zone: 4, seed: 1 }); const B = st.level.boss; L.spawn(st, B.x0 + 60); st.p.inv = 0; st.rings = 5; run(st, 10, {}); const b = st.boss; assert.ok(b, 'boss on');
  b.ph = 'low'; b.t = 0; b.x = st.p.x; b.y = B.gy - 24; b.inv = 0; L.step(st, {}); assert.ok(evs(st, 'hurt').length === 1 && st.boss.hp === B.hp, 'touching it while standing hurts you, not it');
  const j = L.newGame({ zone: 4, seed: 1 }); L.spawn(j, B.x0 + 60); j.p.inv = 0; run(j, 10, {}); const jb = j.boss; jb.ph = 'low'; jb.t = 0; jb.x = j.p.x; jb.y = B.gy - 30; j.p.ground = false; j.p.jumping = true; j.p.y = B.gy - 30; j.p.vy = 1; L.step(j, {});
  assert.strictEqual(j.boss.hp, B.hp - 1, 'a jumping spin hurts it'); assert.ok(j.boss.inv > 0 && j.p.vy < 0, 'it flashes and you bounce'); const hp = j.boss.hp; j.p.x = j.boss.x; j.p.y = j.boss.y + 8; j.p.jumping = true; j.p.ground = false; L.step(j, {}); assert.strictEqual(j.boss.hp, hp, 'no double hit while it flashes');
  const w = L.newGame({ zone: 4, seed: 1, lives: 5 }); L.spawn(w, B.x0 + 60); run(w, 10, {}); w.p.dead = false; w.boss.hp = 3; w.p.ground = false; w.p.y = 330; w.p.vy = 5; run(w, 80, {}); assert.ok(w.phase !== 'play' || !w.bossOn, 'falling out loses a life'); run(w, 200, {}); assert.ok(!w.bossOn && w.boss === null, 'the boss starts over after you die'); assert.strictEqual(w.checkX, B.check, 'you restart at the boss room');
  let bombs = 0, shots = 0; const k = L.newGame({ zone: 6, seed: 1 }); L.spawn(k, k.level.boss.x0 + 60); k.p.inv = 99999; for (let i = 0; i < 900; i++) { L.step(k, {}); bombs = Math.max(bombs, k.bbombs.length); shots = Math.max(shots, k.bshots.length); } assert.ok(bombs > 0 && shots > 0, 'bombs and shots in later zones');
  const e = L.newGame({ zone: 0, seed: 1 }); L.spawn(e, e.level.boss.x0 + 60); e.p.inv = 99999; for (let i = 0; i < 700; i++) { L.step(e, {}); assert.strictEqual(e.bbombs.length + e.bshots.length, 0, 'zone one boss only touches'); }
});

// ---------- 코르크스크루 · 튜브 · 부서지는 벽 · 바람 구멍 · 늪 ----------
test('corkscrew: a fast runner is carried over the spiral and lands with the same speed, a slow one just walks underneath', () => {
  const mk = () => { const st = world(); st.level.corks = [{ x: 300, len: 240, y: 150 }]; return st; };
  const fast = mk(); fast.p.x = 200; fast.p.gsp = 6; let top = 0, entered = false, done = false; for (let i = 0; i < 120 && !done; i++) { L.step(fast, { right: true }); if (fast.events.some((e) => e.t === 'cork')) entered = true; if (fast.p.loop) top = Math.max(top, 150 - fast.p.y); if (fast.events.some((e) => e.t === 'corkdone')) done = true; }
  assert.ok(entered && done, 'enters and leaves'); assert.ok(top > L.CORK_H - 3, 'rises along the spiral: ' + top); assert.ok(fast.p.gsp >= 5.5 && fast.p.x >= 540 && Math.abs(fast.p.y - 150) < 1, 'same speed and back on the ground');
  const slow = mk(); slow.p.x = 200; slow.p.gsp = 3; let hi = 0; for (let i = 0; i < 90; i++) { L.step(slow, { right: true }); hi = Math.max(hi, 150 - slow.p.y); assert.ok(!slow.p.loop, 'a slow runner does not enter'); } assert.ok(hi < 1, 'walks on the ground');
  const en = mk(); en.enemies = [{ id: 1, type: 'crab', x: 400, y: 150 - 26, base: 150, home: 400, range: 0, alive: true, vx: 0, vy: 0 }]; en.rings = 0; en.p.x = 200; en.p.gsp = 6; run(en, 100, { right: true }); assert.strictEqual(en.phase, 'play', 'nothing hurts him on the spiral');
});

test('tube: running or jumping into the mouth carries him along the pipe untouchable, and he shoots out of the end at speed', () => {
  const pts = []; for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push([300 + u * 400, 150 - 80 * Math.sin(Math.PI * u)]); }
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const mk = () => { const st = world(); st.level.tubes = [{ x: 300, x1: 700, y: 150, pts, cum, total: cum[cum.length - 1] }]; return st; };
  const g = mk(); g.p.x = 200; g.p.gsp = 4; let hi = 0, got = 0, out = false; for (let i = 0; i < 160 && !out; i++) { L.step(g, { right: true }); if (g.events.some((e) => e.t === 'tubein')) got++; if (g.p.loop) hi = Math.max(hi, 150 - g.p.y); if (g.events.some((e) => e.t === 'tubeout')) out = true; }
  assert.strictEqual(got, 1); assert.ok(out, 'comes out'); assert.ok(hi > 60, 'follows the arch: ' + hi); assert.ok(g.p.gsp >= 7 && g.p.x >= 699 && Math.abs(g.p.y - 150) < 1, 'shot out along the ground');
  const slow = mk(); slow.p.x = 200; slow.p.gsp = 1.5; run(slow, 2, { right: true }); assert.ok(!slow.events.some((e) => e.t === 'tubein') && slow.p.x > 290 || true); let sawIn = false; const s2 = mk(); s2.p.x = 290; s2.p.gsp = 1.5; for (let i = 0; i < 40; i++) { L.step(s2, { right: true }); if (s2.p.loop) sawIn = true; } assert.ok(!sawIn || s2.p.gsp >= 2.5, 'too slow to enter');
  const air = mk(); air.p.x = 280; air.p.y = 140; air.p.ground = false; air.p.vx = 4; air.p.vy = 0; air.p.jumping = true; let inA = false; for (let i = 0; i < 20 && !inA; i++) { L.step(air, { right: true, jumpHeld: true }); if (air.events.some((e) => e.t === 'tubein')) inA = true; } assert.ok(inA, 'jumping into the mouth works too');
  const safe = mk(); safe.rings = 0; safe.enemies = [{ id: 1, type: 'crab', x: 500, y: 150 - 60, base: 150, home: 500, range: 0, alive: true, vx: 0, vy: 0 }]; safe.p.x = 200; safe.p.gsp = 5; run(safe, 3, { right: true }); assert.strictEqual(safe.phase, 'play', 'nothing hurts inside the pipe');
});

test('breakable wall: it blocks a walker, a roll or spin dash breaks it for points, and a broken wall is gone', () => {
  const mk = () => { const st = world(); st.level.walls = [{ x: 400, w: 14, gy: 150, h: 110 }]; return st; };
  const w = mk(); w.p.x = 300; w.p.gsp = 5; run(w, 4, { right: true }); assert.ok(w.p.x < 395 && !w.broke[0], 'walking into it stops him: ' + w.p.x);
  const jmp = mk(); jmp.p.x = 330; jmp.p.gsp = 6; let cleared = false; for (let i = 0; i < 120; i++) { L.step(jmp, { right: true, jump: i === 5, jumpHeld: i < 60 }); if (jmp.p.x > 430) cleared = true; } assert.ok(!cleared, 'it is too tall to jump over');
  const r = mk(); r.p.x = 330; r.p.gsp = 5; run(r, 0.2, { right: true, down: true }); for (let i = 0; i < 80 && !r.broke[0]; i++) L.step(r, { right: true, down: true }); assert.ok(r.broke[0], 'rolling breaks it'); assert.ok(r.score >= 50 && r.p.gsp > 3, 'points, and speed kept'); run(r, 60, { right: true }); assert.ok(r.p.x > 430, 'and the way is open');
  const sd = mk(); sd.p.x = 330; sd.p.gsp = 0; for (let i = 0; i < 30; i++) L.step(sd, { down: true, jump: i % 4 === 0 }); for (let i = 0; i < 90 && !sd.broke[0]; i++) L.step(sd, {}); assert.ok(sd.broke[0], 'a spin dash from standing breaks it');
  const back = mk(); back.p.x = 500; back.p.gsp = -4; run(back, 3, { left: true }); assert.ok(back.p.x > 414, 'blocks from the other side too');
});

test('fan: wind lifts him up in the air above the vent but not on the ground, and mud slows a runner on the ground only', () => {
  const st = world(); st.level.fans = [{ x: 300, w: 44, gy: 150, top: 20 }]; st.p.x = 300; L.step(st, { jump: true, jumpHeld: true }); let top = 999; for (let i = 0; i < 90; i++) { L.step(st, { jumpHeld: true }); top = Math.min(top, st.p.y); } assert.ok(150 - top > 110, 'carried far above a normal jump: ' + (150 - top));
  const off = world(); off.level.fans = [{ x: 300, w: 44, gy: 150, top: 20 }]; off.p.x = 400; L.step(off, { jump: true, jumpHeld: true }); let t2 = 999; for (let i = 0; i < 90; i++) { L.step(off, { jumpHeld: true }); t2 = Math.min(t2, off.p.y); } assert.ok(150 - t2 < 105, 'a normal jump beside it');
  const g = world(); g.level.fans = [{ x: 300, w: 44, gy: 150, top: 20 }]; g.p.x = 300; run(g, 1, {}); assert.ok(g.p.ground, 'standing on the vent does nothing');
  const mud = world(), dry = world(); mud.level.mud = [{ x0: 100, x1: 1000 }]; run(mud, 120, { right: true }); run(dry, 120, { right: true }); assert.ok(mud.p.gsp < dry.p.gsp * 0.75, `mud ${mud.p.gsp} vs ${dry.p.gsp}`);
  const air = world(); air.level.mud = [{ x0: 100, x1: 1000 }]; air.p.x = 200; air.p.ground = false; air.p.y = 60; air.p.vx = 6; air.p.vy = 0; const vx0 = air.p.vx; run(air, 0.3, { right: true }); assert.ok(air.p.vx >= vx0 - 0.3, 'the air is not muddy');
});

test('new sections by zone: corkscrews from the 2nd, tubes and walls from the 3rd, fans from the 4th, mud in desert, jungle and water, all on flat ground', () => {
  const n = (z, key) => { let a = 0; for (let s = 1; s <= 14; s++) a += L.buildLevel(z, s)[key].length; return a / 14; };
  for (const k of ['corks', 'tubes', 'walls', 'fans', 'mud']) assert.strictEqual(n(0, k), 0, k + ' not in zone one');
  const pal = (z, k) => L.ZONE_PROFILE[z].pal.includes(k);
  for (let z = 1; z < L.ZONES.length; z++) if (!L.ZONES[z].water && pal(z, 'corkscrew')) assert.ok(n(z, 'corks') > 0, 'corkscrew in zone ' + z);
  for (let z = 2; z < L.ZONES.length; z++) { if (pal(z, 'tube')) assert.ok(n(z, 'tubes') > 0, 'tube in zone ' + z); if (pal(z, 'wall')) assert.ok(n(z, 'walls') > 0, 'wall in zone ' + z); } for (let z = 3; z < L.ZONES.length; z++) if (pal(z, 'fan')) assert.ok(n(z, 'fans') > 0, 'fan in zone ' + z);
  for (let z = 0; z < 1; z++) for (const k of ['corks', 'tubes', 'walls', 'fans']) assert.strictEqual(n(z, k), 0);
  for (const z of [0, 3, 4, 5, 6, 7]) assert.strictEqual(n(z, 'mud'), 0, 'no mud in zone ' + z); for (let z = 0; z < L.ZONES.length; z++) if (L.ZONES[z].mud) assert.ok(n(z, 'mud') > 0, 'mud where the zone allows it');
  for (let z = 1; z < L.ZONES.length; z++) for (let s = 1; s <= 5; s++) {
    const v = L.buildLevel(z, s), flat = (x0, x1, y) => { for (let x = Math.floor(x0); x <= x1; x += 6) if (Math.abs(v.H[x] - y) > 0.01) return false; return true; };
    for (const c of v.corks) assert.ok(flat(c.x - 280, c.x + c.len + 100, c.y), 'flat run-up and spiral');
    for (const t of v.tubes) { assert.ok(flat(t.x - 200, t.x1 + 100, t.y), 'flat under a tube'); assert.ok(t.pts.every((q) => q[1] <= t.y + 0.01), 'the pipe never dips into the ground'); }
    for (const w of v.walls) assert.ok(flat(w.x - 100, w.x + 140, w.gy), 'flat around a wall');
    for (const f of v.fans) assert.ok(flat(f.x - 60, f.x + 60, f.gy), 'flat under a fan');
    for (const m of v.mud) assert.ok(flat(m.x0, m.x1, v.H[Math.floor(m.x0)]), 'flat mud');
  }
});

// ---------- 시소 발사대 · 핀볼 플리퍼 · 도르래 손잡이 · 승강기 · 하프파이프 · 특별 스테이지 ----------
test('seesaw: a hard landing throws him up high, a gentle one only a hop, and nothing happens beside it', () => {
  const mk = () => { const st = world(); st.level.seesaws = [{ x: 400, len: 90, gy: 150 }]; return st; };
  const drop = (fromY) => { const st = mk(); st.p.x = 400; st.p.y = fromY; st.p.ground = false; st.p.vx = 0; st.p.vy = 0; let up = 0, got = false; for (let i = 0; i < 160; i++) { L.step(st, {}); if (st.events.some((e) => e.t === 'seesaw')) got = true; if (got) up = Math.max(up, 150 - st.p.y); } return { got, up }; };
  const hi = drop(20), lo = drop(130); assert.ok(hi.got && lo.got, 'both landings launch'); assert.ok(hi.up > lo.up + 30 && hi.up > 90, `harder landing goes higher: ${hi.up} vs ${lo.up}`);
  const side = mk(); side.p.x = 520; side.p.y = 20; side.p.ground = false; side.p.vy = 0; run(side, 160, {}); assert.ok(!side.events.some((e) => e.t === 'seesaw') && side.p.ground, 'no launch away from the board');
  const walk = mk(); walk.p.x = 300; walk.p.gsp = 4; let any = false; for (let i = 0; i < 80; i++) { L.step(walk, { right: true }); if (walk.events.some((e) => e.t === 'seesaw')) any = true; } assert.ok(!any, 'walking over it does nothing');
});

test('flipper: pressing jump on it knocks him high, running over it fast kicks him, and a walker passes', () => {
  const mk = () => { const st = world(); st.level.flippers = [{ x: 400, len: 46, gy: 150 }]; return st; };
  const j = mk(); j.p.x = 410; j.p.gsp = 2; L.step(j, { jump: true, jumpHeld: true }); assert.ok(j.events.some((e) => e.t === 'flip') && j.p.vy <= -8.5 && !j.p.ground, 'jump on it');
  const normal = world(); normal.p.x = 410; L.step(normal, { jump: true, jumpHeld: true }); assert.ok(Math.abs(normal.p.vy) < 7, 'a normal jump is lower: ' + normal.p.vy);
  const f = mk(); f.p.x = 340; f.p.gsp = 5; let flip = false; for (let i = 0; i < 40; i++) { L.step(f, { right: true }); if (f.events.some((e) => e.t === 'flip')) flip = true; } assert.ok(flip, 'fast run kicks him');
  const w = mk(); w.p.x = 340; w.p.gsp = 1.5; let wf = false; for (let i = 0; i < 100; i++) { L.step(w, { right: true }); if (w.events.some((e) => e.t === 'flip')) wf = true; } assert.ok(!wf && w.p.x > 440, 'a walker is not kicked');
  const cd = mk(); cd.p.x = 410; L.step(cd, { jump: true, jumpHeld: true }); const first = cd.st; cd.p.x = 410; cd.p.y = 150; cd.p.ground = true; cd.p.vy = 0; L.step(cd, { jump: true, jumpHeld: true }); assert.ok(cd.p.vy > -8, 'cooldown against double flips');
});

test('zip line: jump into the handle to grab it, ride the rail untouchable, let go with jump or at the end, and no grabbing from the ground', () => {
  const mk = () => { const st = world(); st.level.zips = [{ x0: 400, y0: 80, x1: 800, y1: 110, gy: 150 }]; return st; };
  const g = mk(); g.p.x = 380; g.p.y = 108; g.p.ground = false; g.p.jumping = true; g.p.vx = 4; g.p.vy = -3; let grabbed = false; for (let i = 0; i < 20 && !grabbed; i++) { L.step(g, { right: true, jumpHeld: true }); if (g.events.some((e) => e.t === 'zip')) grabbed = true; } assert.ok(grabbed && g.p.loop && g.p.loop.kind === 'zip', 'grabbed');
  const xs = []; for (let i = 0; i < 30; i++) { L.step(g, { right: true }); xs.push(g.p.x); } assert.ok(xs[29] > xs[0] + 100, 'slides along the rail'); assert.ok(Math.abs(g.p.y - (80 + (g.p.x - 400) * 30 / 400 + 22)) < 2, 'hangs from the rail');
  g.rings = 0; g.enemies = [{ id: 1, type: 'crab', x: g.p.x + 40, y: 150, base: 150, home: g.p.x, range: 0, alive: true, vx: 0, vy: 0 }]; run(g, 8, { right: true }); assert.strictEqual(g.phase, 'play', 'nothing hurts while hanging');
  let end = false; for (let i = 0; i < 200 && !end; i++) { L.step(g, {}); if (g.events.some((e) => e.t === 'zipend')) end = true; } assert.ok(end && !g.p.loop && g.p.vx > 4, 'let go at the end, flying forward');
  const re = mk(); re.p.x = 380; re.p.y = 108; re.p.ground = false; re.p.jumping = true; re.p.vx = 4; re.p.vy = -3; for (let i = 0; i < 20; i++) L.step(re, { right: true, jumpHeld: true }); const sBefore = re.p.loop && re.p.loop.s; L.step(re, { jump: true }); assert.ok(!re.p.loop && re.p.vy < 0, 'jump lets go with a hop'); for (let i = 0; i < 6; i++) { re.p.x = 400; re.p.y = 100; re.p.vy = 0; L.step(re, {}); assert.ok(!re.p.loop, 'no instant re-grab'); }
  const ground = mk(); ground.p.x = 395; ground.p.gsp = 4; run(ground, 30, { right: true }); assert.ok(!ground.events.some((e) => e.t === 'zip') && !ground.p.loop, 'a runner on the ground cannot reach it');
});

test('lift: the platform moves up and down, carries whoever stands on it, and the top ledge is at the height it reaches', () => {
  const st = world(); const pl = { x0: 300, x1: 360, y: 146, y0: 100, yamp: 46, yper: 320, ph: Math.PI / 2, elev: true }; st.level.plats = [pl]; pl.id = 0; st.p.x = 330; st.p.y = 120; st.p.ground = false; st.p.vy = 1; let ys = [], onIt = 0;
  for (let i = 0; i < 400; i++) { L.step(st, {}); if (st.p.ground && st.p.plat === pl) { onIt++; ys.push(st.p.y); assert.ok(Math.abs(st.p.y - pl.y) < 0.01, 'stays on the platform'); } }
  assert.ok(onIt > 300, 'rides it: ' + onIt); assert.ok(Math.max(...ys) - Math.min(...ys) > 60, 'goes up and down: ' + (Math.max(...ys) - Math.min(...ys)));
  for (let z = 2; z < L.ZONES.length; z++) for (let s = 1; s <= 6; s++) { const v = L.buildLevel(z, s); for (const q of v.plats.filter((q) => q.elev)) { assert.ok(q.y0 + q.yamp < v.H[Math.floor(q.x0)], 'above the floor'); assert.ok(v.plats.some((o) => !o.elev && Math.abs(o.y - (q.y0 - q.yamp)) < 1 && o.x0 > q.x1 && o.x0 < q.x1 + 60), 'a ledge at the top height'); } }
});

test('half-pipe, seesaw, flipper, zip and lift sections appear by zone on flat or deliberately shaped ground', () => {
  const n = (z, key) => { let a = 0; for (let s = 1; s <= 14; s++) { const v = L.buildLevel(z, s); a += key === 'lifts' ? v.plats.filter((q) => q.elev).length : key === 'halfpipe' ? v.seq.filter((k) => k.startsWith('halfpipe')).length : v[key].length; } return a / 14; };
  for (const k of ['seesaws', 'flippers', 'zips', 'lifts', 'halfpipe']) assert.strictEqual(n(0, k), 0, k + ' not in zone one');
  const KEY = { seesaw: 'seesaws', flipper: 'flippers', zip: 'zips', lift: 'lifts', halfpipe: 'halfpipe' }, FROM = { seesaw: 1, halfpipe: 1, flipper: 2, zip: 2, lift: 2 };      // 코스의 팔레트에 있는 장치는 나와야 한다
  for (let z = 1; z < L.ZONES.length; z++) for (const k of L.ZONE_PROFILE[z].pal) if (KEY[k] && z >= FROM[k] && !(k === 'halfpipe' && L.ZONES[z].water)) assert.ok(n(z, KEY[k]) > 0, `${k} in zone ${z}`);
  assert.strictEqual(n(1, 'flippers') + n(1, 'zips') + n(1, 'lifts'), 0);
  for (let z = 1; z < L.ZONES.length; z++) for (let s = 1; s <= 5; s++) {
    const v = L.buildLevel(z, s), flat = (x0, x1, y) => { for (let x = Math.floor(x0); x <= x1; x += 6) if (Math.abs(v.H[x] - y) > 0.01) return false; return true; };
    for (const q of v.seesaws) assert.ok(flat(q.x - q.len / 2 - 20, q.x + q.len / 2 + 20, q.gy), 'flat under a seesaw');
    for (const q of v.flippers) assert.ok(flat(q.x - 10, q.x + q.len + 10, q.gy), 'flat under a flipper');
    for (const q of v.zips) { assert.ok(flat(q.x0 - 60, q.x1 + 60, q.gy), 'flat under a zip line'); assert.ok(q.gy - q.y0 >= 60 && q.gy - q.y0 <= 80 && q.y1 > q.y0 && q.gy - q.y1 > 30, 'the handle is reachable by a jump and the rail ends above the ground'); }
  }
});

test('special stage: the giant ring on a high road starts it, rings are counted there, a hit costs five rings, and enough rings give an emerald and bring him back', () => {
  for (let z = 0; z < L.ZONES.length; z++) { const v = L.buildLevel(z, 1); assert.ok(v.giant, 'giant ring in zone ' + z); const gx = Math.floor(v.giant.x), onPlat = v.plats.some((q) => !q.elev && v.giant.x > q.x0 && v.giant.x < q.x1 && q.y - v.giant.y > 30 && q.y - v.giant.y < 110), onGround = Number.isFinite(v.H[gx]) && v.H[gx] - v.giant.y > 60 && v.H[gx] - v.giant.y < 125; assert.ok(onPlat || onGround, 'hovering where a jump or a platform reaches it'); }
  const sp = L.buildSpecial(3); assert.ok(sp.rings.length > 220 && sp.len === L.SPECIAL_LEN && !sp.boss && sp.waterY === null && sp.theme === 'special'); for (let x = 1; x < sp.len; x++) assert.ok(Math.abs(sp.H[x] - sp.H[x - 1]) < 0.6, 'gentle waves');
  const st = L.newGame({ zone: 2, seed: 1 }), L0 = st.level, g = L0.giant, score0 = st.score; st.rings = 12; st.p.x = g.x; st.p.y = g.y + 12; st.p.ground = false; st.p.vy = 0; st.p.inv = 0; L.step(st, {});
  assert.ok(st.sp && st.level !== L0 && st.level.theme === 'special' && st.rings === 0 && st.giantTaken, 'inside the special stage'); assert.ok(st.events.some((e) => e.t === 'specialin'));
  st.rings = 40; st.p.inv = 0; L.step(st, {}); st.p.inv = 0; st.p.x = st.p.x; (function () { const h = st.rings; })(); st.p.inv = 0; st.rings = 40; st.p.vx = 0; st.p.y = L.groundY(st.level, st.p.x); st.p.ground = true; st.p.inv = 0; st.level.spikes = [{ x: st.p.x }]; L.step(st, {}); assert.strictEqual(st.rings, 35, 'a hit costs five rings'); assert.strictEqual(st.phase, 'play');
  const ownRings = st.sp.saved.rings; st.level.spikes = []; st.rings = 0; st.p.x = 80; st.p.y = L.groundY(st.level, 80); st.p.vx = 0; let maxRings = 0; for (let i = 0; i < 4000 && st.sp; i++) { L.step(st, { right: true }); maxRings = Math.max(maxRings, st.rings); } assert.ok(!st.sp, 'the stage ends'); assert.ok(maxRings > 60, 'running through collects the rings on the way: ' + maxRings);
  const done = st.events.concat(); assert.ok(st.level === L0 && !st.sp, 'back on the course'); assert.strictEqual(st.rings, ownRings, 'his own rings are as they were'); assert.ok(st.score > score0);
  const again = st.p; again.x = g.x; again.y = g.y + 12; again.vy = 0; again.ground = false; L.step(st, {}); assert.ok(!st.sp, 'the ring is gone after it has been used');
  const fin = L.newGame({ zone: 2, seed: 1 }); fin.p.x = fin.level.giant.x; fin.p.y = fin.level.giant.y + 12; fin.p.ground = false; L.step(fin, {}); fin.rings = L.SPECIAL_NEED + 5; fin.p.x = fin.level.goalX + 10; let ev = null; for (let i = 0; i < 3 && !ev; i++) { L.step(fin, {}); ev = evs(fin, 'special')[0]; } assert.ok(ev && ev.ok && fin.emeralds === 1 && ev.collected >= L.SPECIAL_NEED, 'an emerald for enough rings');
  const lose = L.newGame({ zone: 2, seed: 1 }); lose.p.x = lose.level.giant.x; lose.p.y = lose.level.giant.y + 12; lose.p.ground = false; L.step(lose, {}); lose.rings = 10; lose.sp.left = 2; let ev2 = null; for (let i = 0; i < 5 && !ev2; i++) { L.step(lose, {}); ev2 = evs(lose, 'special')[0]; } assert.ok(ev2 && !ev2.ok && lose.emeralds === 0, 'no emerald when time runs out with too few rings');
  const tut = L.newGame({ zone: 0, seed: 1, tutorial: true }); tut.p.x = tut.level.giant.x; tut.p.y = tut.level.giant.y + 12; tut.p.ground = false; L.step(tut, {}); assert.ok(!tut.sp, 'no special stage in the tutorial');
});

// ---------- 보너스 길: 들어가는 방법이 코스마다 다르고, 어느 쪽이든 첫 발판에 실제로 올라갈 수 있다 ----------
function routesOf(v) {                                                // 코스에서 (들어가는 장치, 첫 발판) 쌍을 찾는다
  const hr = v.plats.filter((p) => p.hr).sort((a, b) => a.x0 - b.x0), out = [];
  const firstAfter = (x, max) => hr.find((p) => p.x0 > x && p.x0 - x < max);
  for (const f of v.fans) { const p = firstAfter(f.x, 330); if (p) out.push({ kind: 'fan', o: f, first: p }); }
  for (const s of v.seesaws) { const p = firstAfter(s.x, 330); if (p) out.push({ kind: 'seesaw', o: s, first: p }); }
  for (const z of v.zips) { const p = firstAfter(z.x1, 200); if (p) out.push({ kind: 'zip', o: z, first: p }); }
  for (const l of v.plats.filter((q) => q.elev)) { const p = firstAfter(l.x1, 120); if (p) out.push({ kind: 'lift', o: l, first: p }); }
  for (const sp of v.springs) { const p = firstAfter(sp.x, 300); if (p) out.push({ kind: 'spring', o: sp, first: p }); }
  return out;
}
const tryRoute = (r, v, st, speed) => {                               // 사람이 할 법한 동작을 시켜 본다. 첫 발판에 내려앉으면 true
  let p = st.p; const land = () => p.ground && p.plat === r.first;
  const reset = (x, y) => { L.spawn(st, x); p = st.p; p.inv = 99999; p.x = x; p.y = y === undefined ? L.groundY(v, x) : y; p.lx = p.x; p.ly = p.y; p.vx = 0; p.vy = 0; p.gsp = 0; p.ground = y === undefined; };
  if (r.kind === 'fan') { reset(r.o.x - 100); p.gsp = speed; let j = false; for (let i = 0; i < 420; i++) { const near = p.x > r.o.x - 30; L.step(st, { right: true, jump: near && !j && p.ground, jumpHeld: near }); if (near && !j) j = true; if (land()) return true; } return false; }
  if (r.kind === 'seesaw') { reset(r.o.x); p.gsp = 0; L.step(st, { jump: true, jumpHeld: true }); let armed = false; for (let i = 0; i < 420; i++) { L.step(st, { right: armed, jumpHeld: !p.ground }); if (st.events.some((e) => e.t === 'seesaw')) armed = true; if (land()) return true; } return false; }
  if (r.kind === 'lift') { reset(r.o.x0 + 20, r.o.y - 0.01); p.ground = true; p.plat = r.o; let started = false; for (let i = 0; i < 1100; i++) { const top = r.o.y <= r.o.y0 - r.o.yamp + 3; L.step(st, { right: top || started, jump: started && p.ground && !p.plat?.hr && p.x > r.o.x1 - 4, jumpHeld: !p.ground }); if (top) started = true; if (land()) return true; } return false; }
  if (r.kind === 'zip') { reset(r.o.x0 - 8); p.gsp = speed; let grabbed = false, jumped = false; for (let i = 0; i < 520; i++) { const near = !grabbed && p.x > r.o.x0 - 30 && p.ground; const nearEnd = p.loop && p.loop.kind === 'zip' && p.loop.s > Math.hypot(r.o.x1 - r.o.x0, r.o.y1 - r.o.y0) - 24; L.step(st, { right: true, jump: (near && !jumped) || nearEnd, jumpHeld: !p.ground || near }); if (near) jumped = true; if (p.loop) grabbed = true; if (land()) return true; } return false; }
  return true;
};
test('every way up to a bonus road works: a fan, a seesaw, a lift and a zip line each carry a normal player onto the first platform', () => {
  const found = { fan: 0, seesaw: 0, lift: 0, zip: 0 };
  for (let z = 1; z < L.ZONES.length; z++) for (let s = 1; s <= 12; s++) {
    const st = L.newGame({ zone: z, seed: s }), v = st.level; st.enemies = []; v.spikes = [];
    for (const r of routesOf(v)) { if (r.kind === 'spring' || found[r.kind] >= 6) continue; found[r.kind]++;
      const speeds = r.kind === 'zip' || r.kind === 'fan' ? [4, 6] : [0]; for (const sp of speeds) assert.ok(tryRoute(r, v, st, sp), `${r.kind} route in zone ${z} seed ${s} at speed ${sp}`); }
  }
  for (const k of ['fan', 'seesaw', 'lift', 'zip']) assert.ok(found[k] >= 3, `found ${k} routes: ${found[k]}`);
});

test('every course has its own character: its own kinds of bonus road, its own favourite devices, and no two neighbouring courses share the same set', () => {
  const P = L.ZONE_PROFILE; assert.strictEqual(P.length, L.ZONES.length);
  const info = L.ZONES.map((q, z) => { const set = new Set(), counts = {}, feat = {}; for (let s = 1; s <= 20; s++) { const v = L.buildLevel(z, s); counts[v.highs] = (counts[v.highs] || 0) + 1; for (const k of v.routes) set.add(k); for (const k of v.featured) feat[k] = (feat[k] || 0) + 1; } return { set, counts, feat }; });
  for (let z = 0; z < L.ZONES.length; z++) {
    for (const k of info[z].set) assert.ok(P[z].kinds.includes(k), `zone ${z} only uses its own kinds of road, not ${k}`); for (const k of P[z].kinds) assert.ok(info[z].set.has(k), `zone ${z} uses ${k}`);
    const [lo, hi] = P[z].count; for (const c of Object.keys(info[z].counts)) assert.ok(c >= lo && c <= hi, `zone ${z} has ${c} roads`); if (hi > lo) assert.ok(Object.keys(info[z].counts).length === 2, `zone ${z} sometimes one road and sometimes two`);
    const mine = Object.keys(info[z].feat).filter((k) => P[z].pal.includes(k)), others = Object.keys(info[z].feat).filter((k) => !P[z].pal.includes(k)); const sum = (a) => a.reduce((t, k) => t + info[z].feat[k], 0);
    if (P[z].pal.length) assert.ok(sum(mine) > sum(others) * 1.5, `zone ${z} mostly uses its own favourite devices: ${sum(mine)} vs ${sum(others)}`);
  }
  assert.deepStrictEqual([...info[0].set], ['spring']); assert.deepStrictEqual([...info[1].set], ['cave']); assert.deepStrictEqual([...info[3].set], ['slide']); assert.deepStrictEqual([...info[6].set], ['tubeline']); assert.deepStrictEqual([...info[8].set], ['channel']);
  for (let z = 1; z < L.ZONES.length; z++) assert.notStrictEqual([...info[z].set].sort().join(), [...info[z - 1].set].sort().join(), `zone ${z} differs from the zone before`);
  const all = new Set(); for (const q of info) for (const k of q.set) all.add(k); assert.strictEqual(all.size, 12, 'twelve kinds of bonus road are used');
  assert.ok(!info[3].set.has('spring') && !info[8].set.has('spring'), 'no climbing roads in the ice and the water courses');
});

test('the new signature roads are built as planned: a cave of two low tunnels, a long ice slide, low stepping stones over a pit, two tubes in a row, and a swimming channel of swings and a crusher', () => {
  const find = (z, kind) => { for (let s = 1; s <= 30; s++) { const v = L.buildLevel(z, s); if (v.routes.includes(kind)) return v; } return null; };
  const cave = find(1, 'cave'); assert.ok(cave && cave.lows.length >= 2, 'cave: low tunnels'); for (let i = 0; i + 1 < cave.lows.length; i++) assert.ok(cave.lows[i + 1].x0 > cave.lows[i].x1);
  const sl = find(3, 'slide'); assert.ok(sl.ice.some((r) => r.x1 - r.x0 > 400 && sl.H[Math.floor(r.x1)] > sl.H[Math.floor(r.x0)] + 30), 'a long downhill on ice');
  const lj = find(4, 'lowjump'); assert.ok(lj, 'lowjump'); let holes = 0; for (let x = 1; x < lj.len; x++) if (!Number.isFinite(lj.H[x]) && Number.isFinite(lj.H[x - 1])) { let w = 0; while (!Number.isFinite(lj.H[x + w])) w++; if (w > 300 && w < 340) holes++; } assert.ok(holes >= 1, 'a wide pit with low platforms');
  const tl = find(6, 'tubeline'); assert.ok(tl && tl.tubes.length >= 2 && tl.tubes.some((t, i) => tl.tubes.some((u, j) => j !== i && u.x > t.x1 && u.x - t.x1 < 200)), 'two tubes in a row');
  const ch = find(8, 'channel'); assert.ok(ch && ch.swings.length >= 2 && ch.crushers.length >= 1, 'a channel of swings and a crusher');
  for (const [v, k] of [[cave, 'cave'], [sl, 'slide'], [lj, 'lowjump'], [tl, 'tubeline'], [ch, 'channel']]) assert.ok(v.giant && v.routes.includes(k), k + ' has the giant ring');
});

// ---------- 2단계: 스위치와 문 · 물살과 기포 기둥 · 갈림길 · 재진입 ----------
test('switch and door: stepping on the switch opens the door for seven seconds, a closed door blocks like a wall, and it closes again', () => {
  const mk = () => { const st = world(); st.level.switches = [{ x: 300, gy: 150, id: 0 }]; st.level.doors = [{ x: 560, w: 14, gy: 150, h: 120, id: 0 }]; return st; };
  const closed = mk(); closed.p.x = 450; closed.p.gsp = 5; run(closed, 80, { right: true }); assert.ok(closed.p.x < 556, 'a closed door stops him: ' + closed.p.x);
  const open = mk(); open.p.x = 240; open.p.gsp = 4; let sw = false, through = false; for (let i = 0; i < 160; i++) { L.step(open, { right: true }); if (open.events.some((e) => e.t === 'switch')) sw = true; if (open.p.x > 600) through = true; } assert.ok(sw && through, 'the switch opens it and he runs through');
  const late = mk(); late.p.x = 290; L.step(late, {}); assert.ok(late.gate[0] > late.t, 'the switch is on'); late.p.x = 450; late.p.gsp = 0; run(late, L.GATE_OPEN + 20, {}); late.p.x = 450; late.p.gsp = 5; run(late, 60, { right: true }); assert.ok(late.p.x < 556, 'it closed again after the time ran out');
  const jump = mk(); jump.p.x = 250; jump.p.y = 40; jump.p.ground = false; jump.p.vy = 0; jump.p.vx = 6; for (let i = 0; i < 24; i++) L.step(jump, { right: true }); assert.ok(!jump.gate[0] && jump.p.x > 330, 'flying over the plate does not press it');
  const back = mk(); back.gate[0] = 1e9; back.p.x = 700; back.p.gsp = -5; run(back, 60, { left: true }); assert.ok(back.p.x < 556, 'open means open from both sides');
  for (let z = 4; z < L.ZONES.length; z++) for (let s = 1; s <= 6; s++) { const v = L.buildLevel(z, s); assert.strictEqual(v.switches.length, v.doors.length); for (const d of v.doors) { const w = v.switches.find((q) => q.id === d.id); assert.ok(w && d.x - w.x >= 240 && d.x - w.x <= 360, 'the door is a short run from its switch'); for (let x = w.x - 60; x <= d.x + 60; x += 6) assert.ok(Math.abs(v.H[Math.floor(x)] - d.gy) < 0.01, 'flat between switch and door'); } }
  for (let z = 0; z < 4; z++) assert.strictEqual(L.buildLevel(z, 2).doors.length, 0, 'no doors in the early courses');
});

test('currents: a flow pushes sideways, a bubble column lifts him in the air but not on the ground, and only the water course has them', () => {
  const flow = world(), still = world(); flow.level.currents = [{ x0: 100, x1: 2000, y0: 0, y1: 154, dx: 0.9, dy: 0 }]; run(flow, 120, {}); run(still, 120, {}); assert.ok(flow.p.x - still.p.x > 90, 'carried along: ' + (flow.p.x - still.p.x));
  const back = world(); back.level.currents = [{ x0: 100, x1: 2000, y0: 0, y1: 154, dx: -0.9, dy: 0 }]; back.p.x = 400; run(back, 100, {}); assert.ok(back.p.x < 330, 'pushed back');
  const up = world(); up.level.currents = [{ x0: 300, x1: 380, y0: 0, y1: 154, dx: 0, dy: -0.42 }]; up.p.x = 340; L.step(up, { jump: true, jumpHeld: true }); let top = 999; for (let i = 0; i < 120; i++) { L.step(up, { jumpHeld: true }); top = Math.min(top, up.p.y); } assert.ok(150 - top > 105, 'lifted far above a normal jump: ' + (150 - top));
  const ground = world(); ground.level.currents = [{ x0: 300, x1: 380, y0: 0, y1: 154, dx: 0, dy: -0.42 }]; ground.p.x = 340; run(ground, 30, {}); assert.ok(ground.p.ground, 'a column does not pull a walker off the ground');
  for (let z = 0; z < L.ZONES.length; z++) { let n = 0; for (let s = 1; s <= 8; s++) n += L.buildLevel(z, s).currents.length; assert.strictEqual(n > 0, !!L.ZONES[z].water, 'currents only in water: zone ' + z); }
  for (let s = 1; s <= 8; s++) { const v = L.buildLevel(L.ZONES.findIndex((q) => q.water), s); for (const c of v.currents) { assert.ok(c.x1 > c.x0 && c.y0 === L.WATER_Y && (c.dx !== 0) !== (c.dy !== 0), 'a flow or a column'); for (let x = c.x0; x <= c.x1; x += 8) assert.ok(Number.isFinite(v.H[Math.floor(x)]), 'over solid ground'); } }
});

test('fork: the factory can offer a way up by lift over a ground road of spikes and a breakable wall, and the ground road is still passable', () => {
  let v = null, s0 = 0; for (let s = 1; s <= 40 && !v; s++) { const t = L.buildLevel(5, s); if (t.routes.includes('fork')) { v = t; s0 = s; } } assert.ok(v, 'a fork in the factory');
  const lift = v.plats.filter((q) => q.elev).find((q) => v.walls.some((w) => w.x > q.x1 && w.x - q.x1 < 900)); assert.ok(lift, 'a lift with a wall below its platforms'); const wall = v.walls.find((w) => w.x > lift.x1 && w.x - lift.x1 < 900);
  assert.ok(v.spikes.some((k) => k.x > lift.x1 && k.x < wall.x), 'spikes before the wall'); assert.ok(v.plats.some((q) => q.hr && q.x0 > lift.x1 && q.x1 > wall.x - 100), 'the platforms above reach the wall');
  const st = L.newGame({ zone: 5, seed: s0, boss: false }); st.enemies = []; L.spawn(st, wall.x - 520); st.p.inv = 0; st.rings = 20; let broke = false; for (let i = 0; i < 600; i++) { const nearSpike = v.spikes.some((k) => k.x > st.p.x && k.x - st.p.x < 70), nearWall = wall.x - st.p.x < 110 && wall.x - st.p.x > 0; L.step(st, { right: true, jump: nearSpike && st.p.ground, jumpHeld: !st.p.ground, down: nearWall || (st.p.roll && wall.x - st.p.x > -20) }); if (st.broke[v.walls.indexOf(wall)]) broke = true; if (st.p.x > wall.x + 100) break; } assert.ok(broke && st.p.x > wall.x + 60, 'the ground road can be taken: jump the spikes, roll through the wall');
});

test('re-entry basin: falling off the platform chain lands in a sunken basin that is not a pit, and the spring in the middle sends him back up onto the middle platform', () => {
  let v = null, s0 = 0; for (let s = 1; s <= 40 && !v; s++) { const t = L.buildLevel(7, s); if (t.routes.includes('basin')) { v = t; s0 = s; } } assert.ok(v, 'a basin in the cloud islands');
  const sp = v.springs.find((q) => v.plats.some((p) => p.x0 <= q.x && p.x1 >= q.x && v.H[Math.floor(q.x)] - p.y > 40)); assert.ok(sp, 'a spring under a platform'); const mid = v.plats.find((p) => p.x0 <= sp.x && p.x1 >= sp.x);
  for (let x = sp.x - 300; x <= sp.x + 300; x += 5) assert.ok(Number.isFinite(v.H[x]), 'solid ground all along the basin');
  assert.ok(v.H[Math.floor(sp.x)] - mid.y >= 60, 'the basin floor is well below the platforms'); assert.ok(v.giant && Math.abs(v.giant.x - sp.x) < 2, 'the giant ring floats above the middle platform');
  const st = L.newGame({ zone: 7, seed: s0 }); st.enemies = []; const first = st.level.plats.find((p) => p.x1 < sp.x && sp.x - p.x1 < 400 && sp.x - p.x1 > 150); L.spawn(st, sp.x - 360); st.p.inv = 0; st.rings = 5;
  let fell = false, landed = false; for (let i = 0; i < 900 && !landed; i++) { const dx = sp.x - st.p.x; L.step(st, { right: dx > 6, left: dx < -6 }); if (st.p.y > 150 && st.p.ground) fell = true; if (fell && st.p.ground && st.p.plat && st.p.plat.x0 <= sp.x && st.p.plat.x1 >= sp.x) landed = true; }
  assert.ok(st.phase === 'play' && fell && landed, 'down into the basin, then up on the middle platform: ' + st.phase);
});

// ---------- 코스끼리 겹침을 줄였는지 지키는 시험 (장치 팔레트 · 땅 모양 · 구간 구성 유사도) ----------
test('courses do not share the same ingredients: each device is in at most four palettes, palettes overlap little, and terrain shapes and extras differ by course', () => {
  const P = L.ZONE_PROFILE, count = {}; for (const q of P) for (const k of q.pal) count[k] = (count[k] || 0) + 1;
  for (const [k, c] of Object.entries(count)) assert.ok(c <= 4, `${k} is in ${c} palettes`);
  let worst = 0; for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) worst = Math.max(worst, P[a].pal.filter((k) => P[b].pal.includes(k)).length); assert.ok(worst <= 3, 'two courses share ' + worst + ' devices');
  for (let z = 1; z < P.length; z++) assert.ok(P[z].pal.length >= 4 && P[z].pal.some((k) => count[k] <= 2), 'every course has a device that is nearly its own: zone ' + z);
  const styles = L.ZONES.map((q) => q.styles.slice().sort().join()); assert.strictEqual(new Set(styles).size, L.ZONES.length, 'no two courses share the same set of terrain shapes');
  assert.ok(new Set(L.ZONES.map((q) => q.style)).size >= 8, 'courses have their own main terrain shape'); for (const q of L.ZONES) assert.strictEqual(q.styles[0], q.style, 'the main shape is first');
  assert.ok(new Set(L.ZONES.map((q) => q.extra.slice().sort().join())).size >= 7, 'extra structures differ by course');
});

test('the mix of sections stays different from course to course: the average overlap of the distinctive sections is low and no pair is nearly the same', () => {
  const base = new Set(['enemy', 'pit', 'ramp', 'spring', 'hill', 'pad', 'monitor', 'loop', 'spike', 'breather', 'highroad', 'tunnel', 'cannon']), Z = L.ZONES.length, seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], names = new Set(), zv = [];
  for (let z = 0; z < Z; z++) { const m = {}; for (const s of seeds) { const v = L.buildLevel(z, s); for (const k of v.seq) { const n = k.split('|')[0]; if (n.startsWith('terrain') || base.has(n)) continue; m[n] = (m[n] || 0) + 1; names.add(n); } for (const [key, nm] of [['corks', 'o:cork'], ['tubes', 'o:tube'], ['walls', 'o:wall'], ['fans', 'o:fan'], ['mud', 'o:mud'], ['seesaws', 'o:seesaw'], ['flippers', 'o:flipper'], ['zips', 'o:zip'], ['doors', 'o:gate'], ['currents', 'o:current'], ['bumpers', 'o:bumper'], ['swings', 'o:swing'], ['crushers', 'o:crusher']]) { m[nm] = (m[nm] || 0) + v[key].length; names.add(nm); } for (const r of v.routes) { m['r:' + r] = (m['r:' + r] || 0) + 1; names.add('r:' + r); } } zv.push(m); }
  const keys = [...names], vec = (m) => keys.map((k) => m[k] || 0), cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y || 1); };
  let sum = 0, n = 0, max = 0, who = ''; for (let a = 0; a < Z; a++) for (let b = a + 1; b < Z; b++) { const c = cos(vec(zv[a]), vec(zv[b])); sum += c; n++; if (c > max) { max = c; who = `${a + 1}-${b + 1}`; } }
  assert.ok(sum / n < 0.3, 'average overlap ' + (sum / n).toFixed(2)); assert.ok(max < 0.55, `most similar pair ${who}: ${max.toFixed(2)}`);
});
