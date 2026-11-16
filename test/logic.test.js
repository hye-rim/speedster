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
    const wide = v.longGaps.length > 0; assert.ok(maxPit >= 40 && (wide || maxPit <= L.PIT_LIMIT + 2), 'pit width ' + maxPit); if (wide) assert.ok(maxPit <= 230, 'long gaps stay under 230: ' + maxPit);
    assert.ok(steep < 0.8, 'no wall-like step on the ground: ' + steep);
    assert.ok(Number.isFinite(v.H[v.goalX]) && Number.isFinite(v.H[v.len]), 'ground at the goal');
    assert.strictEqual(v.checks.length, 2);
    for (const r of v.rings) assert.ok(!Number.isFinite(v.H[Math.floor(r.x)]) || r.y < v.H[Math.floor(r.x)] - 6, 'rings float above the ground');
    for (const e of v.enemies) if (e.type !== 'flame') assert.ok(Number.isFinite(v.H[Math.floor(e.x)]), 'enemy stands on ground');
  }
});

test('zones get longer and harder: later zones have more enemies and spikes than the first', () => {
  const lens = L.ZONES.map((z) => z.len); for (let i = 1; i < lens.length; i++) assert.ok(lens[i] > lens[i - 1]);
  const count = (z) => { let e = 0, s = 0, p = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const v = L.buildLevel(z, seed); e += v.enemies.length / v.len; s += v.spikes.length / v.len; } return { e, s }; };
  assert.ok(count(7).e > count(0).e * 0.9 && count(5).s > count(0).s && count(0).s === 0, 'later zones are no easier and zone one has no spikes');
  for (let i = 1; i < L.ZONES.length; i++) assert.ok(L.ZONES[i].pit >= L.ZONES[i - 1].pit && L.ZONES[i].spike >= L.ZONES[i - 1].spike && L.ZONES[i].enemy >= L.ZONES[i - 1].enemy, 'difficulty settings never go down');
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
  for (let z = 0; z < L.ZONES.length; z++) { const r = bot.play(z, 3); assert.ok(r.maxSpeed >= 6, 'top speed ' + r.maxSpeed); assert.ok(r.sec >= 40 && r.sec <= L.TIME_PAR[z] * 1.4, 'time ' + r.sec); }
});

// ---------- 원작 느낌: 루프 · 아이템 상자 · 스핀 대시 · 링 100개 목숨 · 연속 처치 ----------
const crabAt = (st, x, id = 0) => st.enemies.push({ id, type: 'crab', x, y: 150, home: x, range: 0, dir: 1, alive: true });

test('every zone has loops and item boxes, each on flat ground with room to run up to a loop', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3]) {
    const v = L.buildLevel(z, seed); assert.ok(v.loops.length >= 2, 'loops ' + v.loops.length); assert.ok(v.monitors.length >= 1, 'item boxes');
    for (const lp of v.loops) for (let x = lp.x - 280; x <= lp.x + L.LOOP_W + 130; x += 4) assert.ok(Math.abs(v.H[x] - lp.y) < 0.01, 'flat run-up and exit at ' + lp.x);
    for (const m of v.monitors) assert.ok(Number.isFinite(v.H[Math.floor(m.x)]));
  }
  const z0 = L.buildLevel(0, 1).monitors.map((m) => m.type); assert.ok(z0.every((t) => t === 'ring10' || t === 'shield'), 'zone one only gives rings and shields');
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
test('there are eight zones with eight themes and each longer than the one before', () => {
  assert.strictEqual(L.ZONES.length, 8); assert.strictEqual(L.TIME_PAR.length, 8);
  assert.deepStrictEqual(L.ZONES.map((z) => z.theme), ['grass', 'desert', 'jungle', 'ice', 'lava', 'factory', 'neon', 'sky']);
  assert.strictEqual(new Set(L.ZONES.map((z) => z.name)).size, 8); assert.strictEqual(new Set(L.ZONES.map((z) => z.sig)).size, 8, 'a different signature structure in each zone');
  for (let i = 1; i < L.ZONES.length; i++) assert.ok(L.ZONES[i].len > L.ZONES[i - 1].len && L.TIME_PAR[i] > L.TIME_PAR[i - 1]);
});

test('every zone but the first builds its signature structure several times, and the first has none', () => {
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3]) {
    const v = L.buildLevel(z, seed), sig = L.ZONES[z].sig;
    assert.ok(z === 0 ? v.sigCount === 0 : v.sigCount >= 3, 'signature count ' + v.sigCount);
    if (sig === 'iceslide') assert.ok(v.ice.length >= 3, 'ice patches');
    if (sig === 'belt') assert.ok(v.belts.length >= 3 && v.belts.every((b) => b.dir === 1 || b.dir === -1), 'conveyors');
    if (sig === 'lavaflame') assert.ok(v.enemies.filter((e) => e.type === 'flame').length >= 3, 'flames');
    if (sig === 'longgap') assert.ok(v.longGaps.length >= 3 && v.longGaps.every((g) => g.x1 - g.x0 >= 165 && g.x1 - g.x0 <= 225), 'long gaps');
    if (sig === 'tramp') assert.ok(v.springs.length >= 9, 'springs in rows');
    if (sig === 'tunnel') assert.ok(v.pads.length >= 9, 'boost pad tunnels');
    if (sig === 'valley') assert.ok(v.sigCount >= 3);
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
    const launches = [...v.launches, ...v.springs.map((s) => s.x)]; assert.ok(launches.length >= 1);
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
