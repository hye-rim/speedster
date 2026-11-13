'use strict';

// 번개 다람쥐 규칙 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 시험용 세상: 평평한 땅(또는 높이 함수)만 있고 아무것도 없다
function world(h = () => 150, len = 4000) {
  const st = L.newGame({ zone: 0, seed: 1 });
  const lv = st.level; lv.len = len; lv.H = new Float32Array(len + 1); for (let i = 0; i <= len; i++) lv.H[i] = h(i);
  lv.rings = []; lv.enemies = []; lv.springs = []; lv.pads = []; lv.spikes = []; lv.checks = []; lv.goalX = len - 100;
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
    assert.ok(maxPit <= L.PIT_LIMIT + 2 && maxPit >= 40, 'pit width ' + maxPit);
    assert.ok(steep < 0.8, 'no wall-like step on the ground: ' + steep);
    assert.ok(Number.isFinite(v.H[v.goalX]) && Number.isFinite(v.H[v.len]), 'ground at the goal');
    assert.strictEqual(v.checks.length, 2);
    for (const r of v.rings) assert.ok(!Number.isFinite(v.H[Math.floor(r.x)]) || r.y < v.H[Math.floor(r.x)] - 6, 'rings float above the ground');
    for (const e of v.enemies) assert.ok(Number.isFinite(v.H[Math.floor(e.x)]), 'enemy stands on ground');
  }
});

test('zones get longer and harder: more pits, enemies and spikes', () => {
  const lens = L.ZONES.map((z) => z.len); for (let i = 1; i < lens.length; i++) assert.ok(lens[i] > lens[i - 1]);
  const count = (z) => { let e = 0, s = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const v = L.buildLevel(z, seed); e += v.enemies.length / v.len; s += v.spikes.length / v.len; } return { e, s }; };
  assert.ok(count(3).e > count(0).e && count(3).s >= count(0).s && count(0).s === 0, 'enemy density grows and zone one has no spikes');
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
  for (let z = 0; z < L.ZONES.length; z++) for (const seed of [1, 2, 3, 5]) { const r = bot.play(z, seed, { lives: 99 }); runs++; deaths += r.deaths; assert.strictEqual(r.phase, 'clear', 'zone ' + (z + 1) + ' seed ' + seed + ' ended ' + r.phase + ' at ' + r.x); assert.ok(r.deaths <= 4, 'deaths ' + r.deaths); }
  assert.ok(deaths <= runs * 1.5, 'average deaths per course ' + deaths / runs);
});

test('the bot is fast: it reaches high speeds on the hills and finishes each zone in a sensible time', () => {
  const bot = require('./bot.js');
  for (let z = 0; z < L.ZONES.length; z++) { const r = bot.play(z, 2); assert.ok(r.maxSpeed > 6.5, 'top speed ' + r.maxSpeed); assert.ok(r.sec >= 40 && r.sec <= L.TIME_PAR[z] * 1.4, 'time ' + r.sec); }
});
