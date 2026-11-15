'use strict';
// 달리기 봇(앞을 미리 돌려 보는 방식): 계속 오른쪽으로 달리다가 앞에 구멍·적·가시·스프링이 있으면
// 「그냥 달리기 / 구르기 / 크게 뛰기 / 낮게 뛰기」를 각각 100프레임쯤 미리 돌려 보고, 다치거나 죽지 않고 가장 멀리 가는 것을 고른다.
// 사람이 길을 읽고 고르는 것과 같다. 코스에 건널 길이 있는지 확인하는 데 쓴다.
const L = require('../logic.js');
function clone(st) { return { ...st, p: { ...st.p }, enemies: st.enemies.map((e) => ({ ...e })), scatter: st.scatter.map((s) => ({ ...s })), got: new Set(st.got), events: [] }; }
const PLANS = [
  { name: 'run', roll: 0, jump: false, hold: true, delay: 0 },
  { name: 'roll', roll: 50, jump: false, hold: true, delay: 0 },
  { name: 'jump', roll: 0, jump: true, hold: true, delay: 0 },
  { name: 'hop', roll: 0, jump: true, hold: false, delay: 0 },
  { name: 'jump+8', roll: 0, jump: true, hold: true, delay: 8 },
  { name: 'hop+8', roll: 0, jump: true, hold: false, delay: 8 },
  { name: 'jump+16', roll: 0, jump: true, hold: true, delay: 16 },
  { name: 'hop+16', roll: 0, jump: true, hold: false, delay: 16 },
  { name: 'jump+28', roll: 0, jump: true, hold: true, delay: 28 },
  { name: 'hop+28', roll: 0, jump: true, hold: false, delay: 28 },
];
function rollout(st, plan, frames) {
  const c = clone(st); const lives0 = c.lives, rings0 = c.rings; let hurt = false;
  for (let i = 0; i < frames && c.phase === 'play'; i++) {
    const jumpNow = plan.jump && i === plan.delay && c.p.ground;
    L.step(c, { right: true, jump: jumpNow, jumpHeld: plan.hold && (i >= plan.delay || !plan.jump), down: i < plan.roll });
    if (c.events.some((e) => e.t === 'hurt')) hurt = true;
    if (c.phase === 'clear') break;
  }
  return { dead: c.lives < lives0 || c.phase === 'dying' || c.phase === 'over', hurt, x: c.p.x, ground: c.p.ground };
}
function play(zone, seed, opts = {}) {
  const st = L.newGame({ zone, seed, lives: opts.lives || 99 }); let f = 0, hurts = 0, plan = PLANS[0], planLeft = 0, waitJump = -1;
  const maxF = 60 * (opts.maxSec || 400), frames = opts.frames || 100;
  while (st.phase !== 'clear' && st.phase !== 'over' && f < maxF) {
    f++;
    const p = st.p; let inp = { right: true };
    if (st.phase === 'play' && p.ground) {
      const near = (arr, ahead) => arr.some((q) => q.x > p.x && q.x - p.x < ahead);
      const v = Math.max(3, Math.abs(p.gsp)); let pit = false; for (let d = 6; d <= v * 14; d += 6) if (!Number.isFinite(L.groundY(st.level, p.x + d))) { pit = true; break; }
      const hazard = pit || near(st.level.spikes, v * 14) || near(st.level.springs, v * 14) || st.enemies.some((e) => e.alive && e.x > p.x && e.x - p.x < v * 14);
      if (planLeft > 0) planLeft--;
      if (hazard && planLeft <= 0) {
        let best = null;
        for (const pl of PLANS) { const r = rollout(st, pl, frames); const score = (r.dead ? -1e6 : 0) + (r.hurt ? -1e4 : 0) + r.x + (pl.name === 'run' ? 0.5 : 0); if (!best || score > best.score) best = { pl, score }; }
        plan = best.pl; planLeft = plan.jump ? plan.delay + 4 : plan.roll ? plan.roll : 6; waitJump = plan.jump ? plan.delay : -1; if (plan.roll) inp = { right: true, down: true };
      } else if (planLeft > 0 && plan.roll) inp = { right: true, down: true };
      else if (L.angleAt(st.level, p.x) < -0.12 && Math.abs(p.gsp) > 2) inp = { right: true, down: true };      // 내리막은 굴러서 더 빠르게
    } else if (!p.ground && p.jumping) inp = { right: true, jumpHeld: plan.hold };
    if (waitJump >= 0 && st.phase === 'play' && p.ground) { if (waitJump === 0) { inp = { right: true, jump: true, jumpHeld: plan.hold }; waitJump = -1; } else waitJump--; }
    L.step(st, inp);
    for (const e of st.events) { if (e.t === 'hurt') hurts++; if (e.t === 'dead' && opts.onDeath) opts.onDeath({ x: Math.round(p.x), why: e.why, f, plan: plan.name }); }
  }
  return { phase: st.phase, sec: Math.round(f / 60), deaths: st.deaths, hurts, rings: st.ringsTotal, score: st.score, x: Math.round(st.p.x), maxSpeed: +st.maxSpeed.toFixed(1), kills: st.kills };
}
module.exports = { play };
if (require.main === module && process.env.BOT) {
  for (let z = 0; z < 4; z++) { const rs = []; const t0 = Date.now(); for (let s = 1; s <= 6; s++) rs.push(play(z, s)); console.log(L.ZONES[z].name, rs.map((r) => `${r.phase === 'clear' ? '완주' : '실패'} ${r.sec}초 사망${r.deaths} 피격${r.hurts} 최고속도${r.maxSpeed}`).join(' | '), `(${((Date.now() - t0) / 1000).toFixed(0)}초 걸림)`); }
}
