// ─────────────────────────────────────────────────────────────
//  The Pelican (Clawd's laid-back roommate) + his bicycle.
//  Built from shaded shapes rasterised without anti-aliasing,
//  then given a selective (colour-aware) pixel outline.
// ─────────────────────────────────────────────────────────────
import { C, mix, lerp, clamp, scratch, blit, outlineSel, bez } from './core.js';
import { drawClawd } from './clawd.js';

export const PEL = {
  white: C('#F4F1EC'), hi: C('#FFFFFF'), shade: C('#C5CDDC'), deep: C('#8B9BB4'),
  black: C('#2B2D45'), line: C('#27213C'),
  beak: C('#F6C35B'), beakHi: C('#FFE59A'), beakSh: C('#DE9038'),
  pouch: C('#F59A45'), pouchSh: C('#D2662D'), hook: C('#E4574A'),
  eye: C('#181425'), skin: C('#F9DDB8'),
  leg: C('#F77622'), legFar: C('#BF4E1E'),
  shades: C('#181425'), shadesHi: C('#6D7FA6'),
};
export const BIKE = {
  frame: C('#E43B44'), frameSh: C('#A22633'), frameHi: C('#FF7A7F'),
  tire: C('#262B44'), rim: C('#9AA8C0'), spoke: C('#C0CBDC'), hub: C('#5A6988'),
  metal: C('#C0CBDC'), metalSh: C('#8B9BB4'), seat: C('#4A2B2B'), seatHi: C('#6E4040'),
  basket: C('#E4A672'), basketSh: C('#B86F50'), basketDk: C('#733E39'), basketHi: C('#F2C99A'),
  chain: C('#3A4466'),
};

// Pose library (1× units, origin: ride = saddle point; stand/sit = ground under the bird).
//   body [cx,cy,rx,ry,rot]; neck = cubic bezier; head [x,y,r]; beak = angle;
//   wingF = folded-wing polygon; hips/feet for legs.
const POSES = {
  ride: {
    body: [0, -9, 7.5, 9, 0.3], tail: [[-5, -4], [-11, -1], [-5, 0]],
    neck: [[3, -15], [8, -18], [1, -22], [4, -25]], head: [4, -25, 4.8], beak: 0.5, shoulder: [1, -12],
    wingF: [[2, -14], [-3, -15], [-7, -8], [-9, 0], [-4, -1], [1, -7]],
  },
  stand: {
    body: [0, -18, 8.5, 9.5, 0.18], tail: [[-6, -13], [-13, -9], [-6, -9]],
    neck: [[3, -25], [10, -28], [0, -33], [4, -36]], head: [4, -36, 4.8], beak: 0.52, shoulder: [0, -21],
    wingF: [[3, -24], [-3, -25], [-8, -18], [-11, -10], [-5, -11], [1, -16]],
    hips: [[-2, -10], [2, -10]], feet: [[-3, 0], [2, 0]],
  },
  sleep: {
    body: [-2, -5, 11, 5.5, 0], tail: [[-11, -6], [-17, -5], [-11, -3]],
    neck: [[6, -7], [9, -8], [10, -8], [11, -8]], head: [11, -8, 4.8], beak: 1.05, shoulder: [0, -7],
    wingF: [[5, -8], [-3, -9], [-9, -6], [-14, -4], [-7, -3], [1, -5]],
  },
  sit: {
    body: [0, -9, 10, 8, 0.05], tail: [[-8, -6], [-15, -3], [-8, -2]],
    neck: [[4, -15], [11, -18], [1, -23], [5, -26]], head: [5, -26, 4.8], beak: 0.5, shoulder: [0, -12],
    wingF: [[4, -14], [-3, -16], [-9, -10], [-13, -4], [-6, -4], [1, -8]],
    feet: [[5, 0], [8, 0]],
  },
};

// o: s, facing, pose, bob, head:[dx,dy], beakRot (add), beakOpen 0..1, pouch 0..1, lump 0..1 (gulp travelling down),
//    wing 'ride'|'fold'|'wave', wingA (wave angle), shades −1 none | 0 forehead … 1 on eyes,
//    eyes 'open'|'closed'|'happy'|'wide'|'half', grip [x,y] (ride wing target), sil (silhouette), tint/tintA
export function drawPelican(g, x, y, o = {}) {
  const s = o.s || 1, pose = POSES[o.pose || 'ride'];
  const LW = 72 * s, LH = 70 * s, OX = 30 * s, OY = 50 * s;
  const L = scratch('pelican' + s, LW, LH);
  const P = pal(o);
  const bob = o.bob || 0;
  const hx = o.head ? o.head[0] : 0, hy = o.head ? o.head[1] : 0;
  const X = v => OX + v * s, Y = v => OY + (v + bob) * s;
  const u1 = Math.max(1, s >> 1);
  const facing = o.facing || 1;

  // legs (standing / sitting) go straight onto g, behind the body
  if (pose.hips && o.legs !== false) {
    pose.hips.forEach(([hx_, hy_], i) => {
      const [fx, fy] = pose.feet[i];
      const col = o.sil || (i === 0 ? P.legFar : P.leg);
      const gx = v => x + facing * v * s, gy = v => y + v * s;
      g.thick(gx(hx_), gy(hy_ + bob), gx(fx), gy(fy - 1), col, 2 * s);
      g.rect(gx(fx) - (facing > 0 ? s : 4 * s), gy(fy - 1), 5 * s, s, col);             // webbed foot
    });
  }

  // tail
  const tl = pose.tail;
  L.poly(tl.flatMap(([a, b]) => [X(a), Y(b)]), P.white);
  L.poly([X(tl[1][0]), Y(tl[1][1]), X(tl[2][0]), Y(tl[2][1]), X(lerp(tl[1][0], tl[0][0], 0.4)), Y(lerp(tl[1][1], tl[0][1], 0.4))], P.shade);

  // body, lit from top-left
  const [bx, by, brx, bry, brot] = pose.body;
  L.ellipseFn(X(bx), Y(by), brx * s, bry * s, brot, (nx, ny) => {
    const d = nx * 0.5 + ny * 0.86;
    return d > 0.6 ? P.shade : d < -0.74 ? P.hi : P.white;
  });

  // folded wing (drawn on the body) — skip when the wing is doing something else
  if (o.wing !== 'ride' && o.wing !== 'wave' && pose.wingF) {
    const wf = pose.wingF;
    L.poly(wf.flatMap(([a, b]) => [X(a), Y(b + 0)]), P.shade);
    // black primaries at the trailing tip
    L.poly([X(wf[2][0]), Y(wf[2][1]), X(wf[3][0]), Y(wf[3][1]), X(wf[4][0]), Y(wf[4][1]), X(lerp(wf[2][0], wf[5][0], 0.35)), Y(lerp(wf[2][1], wf[5][1], 0.35))], P.black);
    // feather line
    for (let t = 0.1; t < 0.9; t += 0.05) L.px(X(lerp(wf[0][0], wf[3][0], t)), Y(lerp(wf[0][1], wf[3][1], t)) + s, P.deep);
  }

  // neck (tapered tube along a bezier)
  const nk = pose.neck.map(([a, b], i) => [a + (i >= 2 ? hx : i === 1 ? hx * 0.5 : 0), b + (i >= 2 ? hy : i === 1 ? hy * 0.5 : 0)]);
  const np = bez(nk[0], nk[1], nk[2], nk[3], 16);
  L.tube(np.map(([a, b], i) => [X(a), Y(b), lerp(3.1, 2.5, i / (np.length - 1)) * s]), P.white, 0.5);
  np.forEach(([a, b], i) => { if (i > 2 && i < np.length - 3) L.px(X(a) + Math.round(2.4 * s) - s, Y(b), P.shade); });

  // gulp lump travelling down the neck
  if (o.lump > 0 && o.lump < 1) {
    const idx = Math.round((1 - o.lump) * (np.length - 1) * 0.9);
    const [a, b] = np[idx];
    L.disc(X(a) + s, Y(b), 3.6 * s, P.white);
    L.px(X(a) + Math.round(4 * s), Y(b) + s, P.shade);
  }

  // head
  const [hx0, hy0, hr] = pose.head;
  const HX = hx0 + hx, HY = hy0 + hy;
  L.ellipseFn(X(HX), Y(HY), hr * s, hr * 0.94 * s, 0, (nx, ny) => (nx * 0.45 + ny * 0.85 > 0.62 ? P.shade : P.white));
  // crest tuft at the back of the head
  L.rect(X(HX - 3.5), Y(HY - 4.5), s, s, P.white);
  L.rect(X(HX - 4.5), Y(HY - 5.5), s, s, P.white);
  // bare skin patch around the eye
  L.rect(X(HX + 0.2), Y(HY - 2.2), 3 * s, 3 * s, P.skin);

  // beak + pouch
  const rot = pose.beak + (o.beakRot || 0);
  const open = clamp(o.beakOpen || 0);
  const pouch = o.pouch ?? 0.35;
  const base = [HX + 3, HY + 0.4];
  const Lb = 17;
  const tf = (u, v, r = rot) => [X(base[0] + u * Math.cos(r) - v * Math.sin(r)), Y(base[1] + u * Math.sin(r) + v * Math.cos(r))];
  const pd = 1.2 + pouch * 4.8;
  const lower = [[-0.5, 0.8], [Lb * 0.97, 0.6], [Lb * 0.92, 1.5], [Lb * 0.7, 1.2 + pd * 0.55], [Lb * 0.42, 1.2 + pd], [Lb * 0.12, 1.2 + pd * 0.85], [-2.2, 3.4]];
  L.poly(lower.flatMap(([u, v]) => tf(u, v)), P.pouch);
  const lowerSh = [[Lb * 0.78, 1.0 + pd * 0.45], [Lb * 0.42, 1.2 + pd], [Lb * 0.12, 1.2 + pd * 0.85], [-1.2, 3.0], [Lb * 0.18, 1.0 + pd * 0.6], [Lb * 0.45, 1.0 + pd * 0.72]];
  L.poly(lowerSh.flatMap(([u, v]) => tf(u, v)), P.pouchSh);
  const ur = rot - open * 0.8;
  const upper = [[-0.8, -1.9], [Lb * 0.55, -1.3], [Lb, -0.7], [Lb + 1.2, 0.3], [Lb + 0.3, 1.1], [Lb * 0.6, 0.55], [-0.5, 0.9]];
  L.poly(upper.flatMap(([u, v]) => tf(u, v, ur)), P.beak);
  for (let u = 1; u < Lb - 1; u += 0.5) { const [a, b] = tf(u, -1.1 + u * 0.02, ur); L.px(a, b, P.beakHi); }
  { const [a, b] = tf(Lb + 0.5, 0.3, ur); L.rect(a, b, s, s, P.hook); }
  if (open < 0.05) for (let u = 0.5; u < Lb; u += 0.5) { const [a, b] = tf(u, 0.85, ur); L.px(a, b, P.beakSh); }
  if (open >= 0.05) {                                    // dark mouth interior
    const inner = [[0, 0.9], [Lb * 0.85, 0.8], ...[[Lb * 0.85, 0.8], [0, 0.9]].map(([u2, v2]) => [u2 * 0.98, v2 - 0.1])];
    const m = [...tf(0.5, 0.9, ur), ...tf(Lb * 0.8, 0.6, ur), ...tf(Lb * 0.8, 0.8), ...tf(0.5, 1.1)];
    L.poly(m, P.pouchSh);
    void inner;
  }

  // eye
  const eyeX = X(HX + 1), eyeY = Y(HY - 1.6);
  const e = o.eyes || 'open';
  if (e === 'closed') L.rect(eyeX - (s >> 1), eyeY + s, 2 * s, u1, P.eye);
  else if (e === 'half') { L.rect(eyeX, eyeY + s, s + u1, s, P.eye); L.rect(eyeX - (s >> 1), eyeY + s - u1, 2 * s, u1, P.beakSh); }
  else if (e === 'happy') { L.rect(eyeX - u1, eyeY + s, u1, u1, P.eye); L.rect(eyeX, eyeY + (s >> 1), s, u1, P.eye); L.rect(eyeX + s, eyeY + s, u1, u1, P.eye); }
  else if (e === 'wide') { L.rect(eyeX - u1, eyeY - u1, s + 2 * u1, 2 * s + u1, P.eye); L.rect(eyeX - u1, eyeY - u1, u1, u1, P.hi); }
  else { L.rect(eyeX, eyeY, s + (s >= 2 ? u1 : 0), 2 * s, P.eye); if (s >= 2) L.rect(eyeX, eyeY, u1, u1, P.hi); }

  // sunglasses: slide from forehead (0) to eyes (1)
  const sh = o.shades ?? -1;
  if (sh >= 0) {
    const gy = Math.round(lerp(Y(HY - 5.2), eyeY - u1, Math.min(sh, 2)));   // >1 = slid down the beak (peering over)
    const gx = X(HX - 1.6);
    L.rect(gx, gy, 6 * s, 2 * s, P.shades);
    L.rect(gx + s, gy + 2 * s, 4 * s, u1, P.shades);
    L.rect(gx - 2 * s, gy, 2 * s, u1, P.shades);
    L.rect(gx + 4 * s, gy, u1, u1, P.shadesHi);
    if (s >= 2) L.rect(gx + 3 * s, gy + u1, u1, u1, P.shadesHi);
  }

  // near wing (in front of the body)
  const [sx0, sy0] = pose.shoulder;
  if (o.wing === 'ride' && o.grip) {
    const [gx, gy] = o.grip;
    const dx = gx - sx0, dy = gy - sy0, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, px_ = -uy, py_ = ux;
    const pt = (t, w) => [X(sx0 + ux * len * t + px_ * w), Y(sy0 + uy * len * t + py_ * w)];
    L.poly([...pt(-0.35, -3.5), ...pt(0.4, -3.0), ...pt(0.95, -1.4), ...pt(1.05, 0.6), ...pt(0.55, 2.8), ...pt(-0.2, 4.2), ...pt(-0.5, 1)], P.shade);
    L.poly([...pt(0.62, -2.5), ...pt(0.97, -1.4), ...pt(1.08, 0.7), ...pt(0.66, 2.3)], P.black);
    L.poly([...pt(-0.3, -3.2), ...pt(0.35, -2.8), ...pt(0.3, -1.2), ...pt(-0.3, -0.8)], P.white);
    for (let t = 0; t < 0.6; t += 0.04) { const [a, b] = pt(t, 2.2); L.px(a, b, P.deep); }
  } else if (o.wing === 'wave') {
    const a = o.wingA ?? -2.1;                        // raised wing angle (−π/2 = straight up, −2.1 = up & back)
    const len = 13;
    const ux = Math.cos(a), uy = Math.sin(a), px_ = -uy, py_ = ux;
    const pt = (t, w) => [X(sx0 + ux * len * t + px_ * w), Y(sy0 + uy * len * t + py_ * w)];
    L.poly([...pt(-0.15, -3.4), ...pt(0.6, -2.8), ...pt(1.0, -1.6), ...pt(1.1, 0.8), ...pt(0.55, 2.8), ...pt(-0.15, 3.6)], P.shade);
    L.poly([...pt(0.82, -2.1), ...pt(1.0, -1.6), ...pt(1.12, 0.8), ...pt(0.84, 2.0)], P.black);
    for (let k = 0; k < 3; k++) { const [a1, b1] = pt(1.12, -1.4 + k * 1.1); L.rect(a1, b1, s, s, P.black); }
    L.poly([...pt(-0.1, -3.0), ...pt(0.55, -2.5), ...pt(0.5, 0.2), ...pt(-0.1, 0.6)], P.white);
    for (let t2 = 0.1; t2 < 0.8; t2 += 0.05) { const [a1, b1] = pt(t2, 1.2); L.px(a1, b1, P.deep); }
  }

  // outline everything (or flatten to a silhouette)
  if (!o.sil) outlineSel(L, P.line, 0.72);
  else { L.u32.forEach((c, i) => { if (c) L.u32[i] = o.sil; }); outlineSel(L, o.sil, 0); }

  if (facing > 0) blit(g, L, x - OX, y - OY);
  else blit(g, L, x - (LW - OX), y - OY, 0, true);
  if (pose.feet && !pose.hips && o.legs !== false) {       // sitting: little feet peeking out in front
    const col = o.sil || P.leg;
    for (const [fx, fy] of pose.feet) g.rect(x + facing * fx * s - (facing > 0 ? 0 : 3 * s), y + (fy - 1) * s, 3 * s, s, col);
  }
  const bt = [base[0] + Lb * Math.cos(rot), base[1] + Lb * Math.sin(rot)];
  return {
    head: [x + facing * HX * s, y + (HY + bob) * s],
    beakTip: [x + facing * bt[0] * s, y + (bt[1] + bob) * s],
    mouth: [x + facing * (base[0] + 6) * s, y + (base[1] + 2 + bob) * s],
  };
}

function pal(o) {
  const f = c => (o.tint && o.tintA ? mix(c, o.tint, o.tintA) : c);
  const out = {};
  for (const k in PEL) out[k] = f(PEL[k]);
  return out;
}

// Two-bone leg from hip to foot, knee bending towards the `bend` side.
export function drawLeg(g, hip, foot, L1, L2, col, s = 1, bend = 1) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
  const d = Math.hypot(dx, dy), dd = Math.min(d, L1 + L2 - 0.01);
  const a = Math.atan2(dy, dx);
  const cosk = clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1);
  const k = Math.acos(cosk) * -bend;
  const knee = [hip[0] + Math.cos(a + k) * L1, hip[1] + Math.sin(a + k) * L1];
  const end = d > L1 + L2 ? [hip[0] + Math.cos(a) * (L1 + L2), hip[1] + Math.sin(a) * (L1 + L2)] : foot;
  g.thick(hip[0], hip[1], knee[0], knee[1], col, 2 * s);
  g.thick(knee[0], knee[1], end[0], end[1], col, s + (s >> 1));
  const fx = Math.round(end[0]), fy = Math.round(end[1]);
  g.rect(fx - (bend > 0 ? s : 3 * s), fy, 4 * s, s, col);                    // webbed foot on the pedal
  return knee;
}

// ── the bicycle ─────────────────────────────────────────────
// Local coords: origin on the ground at the bike's centre, facing right.
export const BIKE_GEO = {
  R: [-15, -9], F: [15, -9], r: 9, K: [-2, -9], S: [-6, -19], Ht: [9, -21], Hb: [10, -17],
  seat: [-6, -21], grip: [3, -24], basket: [11, -28, 15, 9], pedalR: 3.5,
};

// o: s, wheelA, fast (0..1 motion blur), facing, kick (parked)
export function drawBike(g, x, y, o = {}, layer = 'all') {
  const s = o.s || 1, f = o.facing || 1;
  const Gx = v => x + f * v * s, Gy = v => y + v * s;
  const B = BIKE, geo = BIKE_GEO;
  const col = k => o.sil || B[k];
  const wheel = c => {
    const cx = Gx(c[0]), cy = Gy(c[1]), r = geo.r * s;
    g.ring(cx, cy, r - 0.5, col('tire')); g.ring(cx, cy, r - 1.3, col('tire'));
    if (o.sil) { g.ring(cx, cy, r - 2.2, o.sil); g.rect(cx - s, cy - s, 2 * s, 2 * s, o.sil); return; }
    g.ring(cx, cy, r - 2.2, B.rim);
    const blur = o.fast || 0;
    if (blur > 0.6) g.ring(cx, cy, r * 0.5, B.spoke);
    const n = blur > 0.6 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const a = (o.wheelA || 0) * f + (k * Math.PI) / n;
      g.line(cx - Math.cos(a) * (r - 2.6), cy - Math.sin(a) * (r - 2.6), cx + Math.cos(a) * (r - 2.6), cy + Math.sin(a) * (r - 2.6), B.spoke);
    }
    g.rect(cx - s, cy - s, 2 * s, 2 * s, B.hub);
  };
  const tube = (a, b, c = 'frame', w = 2) => g.thick(Gx(a[0]), Gy(a[1]), Gx(b[0]), Gy(b[1]), col(c), w * s);
  if (layer === 'all' || layer === 'back') {
    wheel(geo.R); wheel(geo.F);
    for (const [c, a0, a1] of [[geo.R, Math.PI * 1.02, Math.PI * 1.72], [geo.F, Math.PI * 1.25, Math.PI * 1.98]])
      for (let a = a0; a <= a1; a += 0.05) g.px(Gx(c[0] + Math.cos(a) * (geo.r + 1.2)), Gy(c[1] + Math.sin(a) * (geo.r + 1.2)), col('metal'));
    tube(geo.R, geo.K, 'frameSh'); tube(geo.R, [-5.5, -16], 'frameSh', 1);
    tube(geo.K, geo.S);
    const dt = bez(geo.K, [4, -10], [8, -13], geo.Hb, 8);
    for (let i = 0; i < dt.length - 1; i++) tube(dt[i], dt[i + 1]);
    tube(geo.Hb, geo.Ht, 'frameSh');
    tube(geo.Hb, [12.5, -13], 'frame'); tube([12.5, -13], geo.F, 'frame');
    g.thick(Gx(-3), Gy(-10), Gx(-13), Gy(-9), col('chain'), 2 * s);
    g.disc(Gx(geo.K[0]), Gy(geo.K[1]), 2.4 * s, col('metalSh'));
    tube(geo.S, [-6.2, -20.5], 'metalSh', 1);
    g.rect(Gx(f > 0 ? -10 : -3), Gy(-22), 7 * s, 2 * s, col('seat'));
    g.rect(Gx(f > 0 ? -10 : -3), Gy(-22), 7 * s, Math.max(1, s >> 1), col('seatHi'));
    if (o.kick) g.thick(Gx(-3), Gy(-9), Gx(-7), Gy(0), col('metalSh'), s);
  }
  if (layer === 'all' || layer === 'front') {
    g.thick(Gx(geo.Ht[0]), Gy(geo.Ht[1]), Gx(8), Gy(-24), col('metalSh'), s);
    g.thick(Gx(8), Gy(-24), Gx(3), Gy(-24), col('metal'), s);
    g.rect(Gx(f > 0 ? 2 : 4), Gy(-24.5), 2 * s, 2 * s, col('seat'));
    g.rect(Gx(f > 0 ? 6 : 8), Gy(-26), 2 * s, s, col('metal'));                 // bell
    g.px(Gx(6.5), Gy(-27), col('metalSh'));
  }
}

export function drawBasket(g, x, y, o = {}, part = 'front') {
  const s = o.s || 1, f = o.facing || 1;
  const [bx, by, bw, bh] = BIKE_GEO.basket;
  const X0 = f > 0 ? x + bx * s : x - (bx + bw) * s, Y0 = y + by * s;
  const B = BIKE, col = k => o.sil || B[k];
  if (part === 'back') {
    g.rect(X0 + s, Y0 + s, bw * s - 2 * s, s, col('basketDk'));
    g.rect(X0 + s, Y0 + 2 * s, bw * s - 2 * s, 2 * s, col('basketSh'));
    return;
  }
  for (let j = 0; j < (bh - 2) * s; j++) for (let i = 0; i < bw * s; i++) {
    const taper = j > (bh - 4) * s ? s : 0;
    if (i < taper || i >= bw * s - taper) continue;
    const weave = (Math.floor(i / (2 * s)) + Math.floor(j / (2 * s))) & 1;
    g.px(X0 + i, Y0 + 2 * s + j, o.sil || (weave ? B.basket : B.basketSh));
  }
  g.rect(X0, Y0 + s, bw * s, s + (s >> 1), col('basketHi'));
  g.rect(X0, Y0 + 2 * s, bw * s, Math.max(1, s >> 1), col('basketDk'));
  g.rect(X0 + s, Y0 + bh * s - s, bw * s - 2 * s, s, col('basketDk'));
  g.rect(f > 0 ? X0 - s : X0 + bw * s, Y0 + 4 * s, s, 2 * s, col('metalSh'));
}

// Full rider: pelican on the bike (+ Clawd in the basket).
// o: s, dist (distance travelled → wheel/crank angle), crankA override, facing,
//    pel: overrides for drawPelican, clawd: overrides for drawClawd (null = empty basket), fast, bob, sil
export function drawRider(g, x, y, o = {}) {
  const s = o.s || 1, f = o.facing || 1;
  const geo = BIKE_GEO;
  const wheelA = (o.dist || 0) / geo.r;
  const crankA = o.crankA ?? wheelA * 0.6;
  const Gx = v => x + f * v * s, Gy = v => y + v * s;
  const seat = [geo.seat[0], geo.seat[1] + 0.5];
  const bob = o.bob || 0;
  const hip = [seat[0] + 1.5, seat[1] - 1.5 + bob];
  const pedal = a => [geo.K[0] + Math.cos(a) * geo.pedalR, geo.K[1] + Math.sin(a) * geo.pedalR];
  const sil = o.sil || 0;
  const legs = o.legs !== false;

  const pf = pedal(crankA + Math.PI);
  if (legs) {
    g.thick(Gx(geo.K[0]), Gy(geo.K[1]), Gx(pf[0]), Gy(pf[1]), sil || BIKE.metalSh, s);
    drawLeg(g, [Gx(hip[0]), Gy(hip[1])], [Gx(pf[0]), Gy(pf[1]) - s], 8.6 * s, 8.6 * s, sil || PEL.legFar, s, f);
  }
  drawBike(g, x, y, { ...o, wheelA, facing: f }, 'back');
  const grip = [geo.grip[0] - seat[0] + 0.5, geo.grip[1] - seat[1] + 0.5];
  const pel = drawPelican(g, Gx(seat[0]), Gy(seat[1]), { s, pose: 'ride', wing: 'ride', grip, facing: f, bob, sil, ...(o.pel || {}) });
  drawBike(g, x, y, { ...o, wheelA, facing: f }, 'front');
  const pn = pedal(crankA);
  if (legs) {
    drawLeg(g, [Gx(hip[0] + 0.5), Gy(hip[1])], [Gx(pn[0]), Gy(pn[1]) - s], 8.6 * s, 8.6 * s, sil || PEL.leg, s, f);
    g.thick(Gx(geo.K[0]), Gy(geo.K[1]), Gx(pn[0]), Gy(pn[1]), sil || BIKE.metal, s);
  }
  let clawdBox = null;
  if (o.basket !== false) {
    drawBasket(g, x, y, { s, facing: f, sil }, 'back');
    if (o.clawd) {
      const [bx, by, bw] = geo.basket;
      const cx = Gx(bx + bw / 2) + (o.clawd.dx || 0) * s * f;
      clawdBox = drawClawd(g, cx, Gy(by) + 4 * s + (o.clawd.dy || 0) * s, { s, legs: 'hide', silhouette: sil || undefined, ...o.clawd });
    }
    drawBasket(g, x, y, { s, facing: f, sil }, 'front');
  }
  return { pel, clawd: clawdBox, basketTop: [Gx(geo.basket[0] + geo.basket[2] / 2), Gy(geo.basket[1])] };
}
