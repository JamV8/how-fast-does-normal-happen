// Story mode: a scroll-driven walk through one example (NYC flight delays) and then nine others.
// Dots ease toward positions set by the current section and the (smoothed) scroll position.
// All study results come from the R analysis via assets/data/site.json; the flight delays shown
// are real records from assets/data/real_data.json.
(function () {
  "use strict";
  const cv = document.getElementById("viz"), ctx = cv.getContext("2d");
  const noteEl = document.getElementById("note"), nav = document.getElementById("nav");
  const bar = document.getElementById("progress-bar"), scrolly = document.querySelector(".scrolly");
  const steps = [...document.querySelectorAll(".step")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = { ink: "#1d1d1b", ink2: "#57544d", muted: "#8b867b", rule: "#d6cfc1", red: "#c8442d", blue: "#2d5f8a",
              mustard: "#c4900f", green: "#3c8d5a", orange: "#d9822b", paper: "#f4f1ea" };
  const SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace', SERIF = '"Source Serif 4", Georgia, serif';
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  // solid dots with a soft edge, pre-rendered once per color
  const SPR = {};
  for (const k of ["ink", "blue", "red", "mustard", "green", "orange", "rule"]) {
    const s = document.createElement("canvas"); s.width = s.height = 32;
    const g = s.getContext("2d"), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, C[k]); grd.addColorStop(0.62, C[k]); grd.addColorStop(1, rgba(C[k], 0));
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32); SPR[k] = s;
  }

  // ---------- seeded random numbers ----------
  let seed = 9426;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function qnorm(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 0.97575) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const dnorm = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));


  // ---------- data ----------
  const POP_N = 1100, MEAN_N = 2000, ALL = POP_N + MEAN_N;
  const N_STOPS = [30, 45, 70, 100, 150, 235, 320, 400];
  let D = null;   // everything that depends on the data files
  let SITE = {}, WHY = null, ORDER = [];

  Promise.all([fetch("assets/data/site.json").then((r) => r.json()), fetch("assets/data/real_data.json").then((r) => r.json())])
    .then(([site, real]) => {
      SITE = Object.fromEntries(site.populations.map((p) => [p.key, p])); ORDER = site.populations.map((p) => p.key); WHY = site.why;
      const fl = real.flights.values, MU = real.flights.mu, SIG = real.flights.sigma, draw = () => fl[(rand() * fl.length) | 0];
      const popVals = Float64Array.from({ length: POP_N }, draw);
      const meanStops = N_STOPS.map((n) => {
        const a = new Float64Array(MEAN_N);
        for (let i = 0; i < MEAN_N; i++) { let s = 0; for (let j = 0; j < n; j++) s += draw(); a[i] = s / n; }
        a.sort();
        const out = new Float64Array(MEAN_N), h = 8;   // light smoothing of neighbouring order statistics
        for (let i = 0; i < MEAN_N; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - h); j <= Math.min(MEAN_N - 1, i + h); j++) { s += a[j]; c++; } out[i] = s / c; }
        return out;
      });
      const cauchy = Float64Array.from({ length: MEAN_N }, () => Math.tan(Math.PI * (rand() - 0.5))).sort();
      const perm = Array.from({ length: MEAN_N }, (_, i) => i);
      for (let i = MEAN_N - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
      const reveal = new Int32Array(MEAN_N); perm.forEach((p, k) => { reveal[p] = k; });
      const bellZ = Float64Array.from({ length: ALL }, (_, i) => qnorm((i + 0.5) / ALL));
      const SAMPLES = [], SMEAN = [];   // the studies shown one by one in "One study, one average"
      for (let c = 0; c < 40; c++) {
        const smp = [];
        while (smp.length < 30) { const i = (rand() * POP_N) | 0; if (!smp.includes(i) && popVals[i] >= -60 && popVals[i] <= 180) smp.push(i); }
        SAMPLES.push(smp); SMEAN.push(smp.reduce((a, i) => a + popVals[i], 0) / 30);
      }
      const cauchyIn = cauchy.filter((v) => Math.abs(v) < 8).length;
      D = { fl, MU, SIG, draw, popVals, meanStops, cauchy, cauchyIn, reveal, bellZ, SAMPLES, SMEAN };
      resize();
      requestAnimationFrame(loop);
    });

  // ---------- particles ----------
  const P = Array.from({ length: ALL }, (_, i) => ({
    x: Math.random() * 1200, y: Math.random() * 800, tx: 0, ty: 0, a: 0, ta: 0, s: 1.6, ts: 1.6, c: "ink",
    j1: Math.random(), j2: Math.random(), pop: i < POP_N, k: i < POP_N ? i : i - POP_N }));
  const popIds = P.map((_, i) => i).filter((i) => P[i].pop), meanIds = P.map((_, i) => i).filter((i) => !P[i].pop);

  // ---------- layout ----------
  let W = 0, H = 0, B, narrow = false, textPts = [];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    narrow = W < 760;
    B = narrow ? { x: 18, y: 104, w: W - 36, h: H * 0.54 - 104 } : { x: W * 0.43, y: H * 0.17, w: W * 0.52, h: H * 0.66 };
    buildText();
  }
  function buildText() {   // points inside the glyphs of "30"
    if (!B) return;
    const oc = document.createElement("canvas"), w = Math.round(B.w), h = Math.round(B.h);
    oc.width = w; oc.height = h;
    const g = oc.getContext("2d"), fs = Math.min(h * 0.95, w * 0.6);
    g.fillStyle = "#000"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 ${fs}px ${SERIF}`;
    g.fillText("30", w / 2, h / 2 + fs * 0.03);
    const img = g.getImageData(0, 0, w, h).data, pts = [], st = Math.max(2, Math.round(Math.sqrt((w * h * 0.22) / ALL)));
    for (let y = 0; y < h; y += st) for (let x = 0; x < w; x += st) if (img[(y * w + x) * 4 + 3] > 140) pts.push([B.x + x, B.y + y]);
    textPts = pts;
  }
  window.addEventListener("resize", resize);
  if (document.fonts) document.fonts.ready.then(buildText);

  const R = () => ({
    hero: narrow ? { x: 18, y: H * 0.76, w: W - 36, h: H * 0.2 } : { x: W * 0.53, y: H * 0.28, w: W * 0.42, h: H * 0.5 },
    popBig: { x: B.x, y: B.y + B.h * 0.08, w: B.w, h: B.h * 0.76 },
    popTop: { x: B.x, y: B.y, w: B.w, h: B.h * 0.36 },
    low: { x: B.x, y: B.y + B.h * 0.58, w: B.w, h: B.h * 0.34 },
    full: narrow ? { x: B.x, y: B.y + B.h * 0.08, w: B.w, h: B.h * 0.84 } : { x: B.x, y: B.y + B.h * 0.26, w: B.w, h: B.h * 0.66 } });

  // dot histogram: values -> stacked positions inside a region
  function stack(ids, valueOf, reg, lo, hi, nb, maxDy) {
    const counts = new Int32Array(nb), bins = new Int32Array(ids.length);
    for (let j = 0; j < ids.length; j++) { const b = Math.floor((valueOf(ids[j]) - lo) / (hi - lo) * nb); bins[j] = b >= 0 && b < nb ? b : -1; if (bins[j] >= 0) counts[b]++; }
    let mx = 1; for (let b = 0; b < nb; b++) if (counts[b] > mx) mx = counts[b];
    const bw = reg.w / nb, dy = Math.min(maxDy || 6, reg.h / (mx + 1)), fill = new Int32Array(nb);
    for (let j = 0; j < ids.length; j++) {
      const p = P[ids[j]], b = bins[j];
      p.inR = b >= 0;
      if (b < 0) { p.ta = 0; continue; }
      p.tx = reg.x + (b + 0.5) * bw + (p.j1 - 0.5) * bw * 0.5;
      p.ty = reg.y + reg.h - (fill[b]++ + 0.5) * dy;
    }
    let peak = 0; for (let b = 1; b < nb; b++) if (counts[b] > counts[peak]) peak = b;
    return { dy, binW: (hi - lo) / nb, peakX: reg.x + (peak + 0.5) * bw, peakY: reg.y + reg.h - counts[peak] * dy };
  }

  // ---------- scroll ----------
  let scene = "hero", prog = 0, progS = 0, sceneT = 0, last = "", navSolid = false, cardsSet = false;
  function readScroll() {
    const mid = window.innerHeight * 0.55;
    let s = "hero", pr = 0;
    for (const el of steps) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid) { s = el.dataset.scene; pr = clamp((mid - r.top) / Math.max(1, r.height), 0, 1); }
    }
    if (s !== scene || !cardsSet) { cardsSet = true; for (const el of steps) { const c = el.querySelector(".card"); if (c) c.classList.toggle("in", el.dataset.scene === s); } }
    scene = s; prog = pr;
    const solid = window.scrollY > 30; if (solid !== navSolid) { navSolid = solid; nav.classList.toggle("solid", solid); }
    const total = scrolly.offsetHeight - window.innerHeight;
    bar.style.transform = `scaleX(${clamp(window.scrollY / total, 0, 1)})`;
  }

  // ---------- per-section state ----------
  let range = [-60, 180], reg = null, kick = 0, kickP = 0, curveA = 0, chartA = 0, whyA = 0;
  const whyShown = new Float64Array(100).fill(-1);
  const nAt = (pr) => { const f = clamp(pr, 0, 0.9999) * (N_STOPS.length - 1), k = Math.floor(f), t = f - k;
    return { k, t, n: Math.exp(lerp(Math.log(N_STOPS[k]), Math.log(N_STOPS[k + 1]), t)) }; };
  const seRange = (n) => [D.MU - 4.2 * D.SIG / Math.sqrt(n), D.MU + 4.2 * D.SIG / Math.sqrt(n)];
  const growN = () => nAt(clamp(progS / 0.98, 0, 1));
  const lerpReg = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
  // the last part of "data" and "many" slides the chart into the next section's layout
  const dataMorph = () => clamp((progS - 0.74) / 0.26, 0, 1);
  const manyMorph = () => clamp((progS - 0.75) / 0.25, 0, 1);
  const bump = (x, a, b, c, d) => clamp((x - a) / (b - a), 0, 1) * (1 - clamp((x - c) / (d - c), 0, 1));
  const neverN = () => Math.max(1, Math.round(Math.pow(10, clamp(progS / 0.98, 0, 1) * Math.log10(5000))));
  // dot size for a pile that is still filling up, so it grows upward instead of squashing
  const dyMax = {};
  function fixedDy(key, vals, lo, hi, nb, h, cap) {
    const k = key + nb;
    if (!(k in dyMax)) { const cnt = new Int32Array(nb); for (const v of vals) { const b = Math.floor((v - lo) / (hi - lo) * nb); if (b >= 0 && b < nb) cnt[b]++; } dyMax[k] = Math.max(...cnt); }
    return Math.min(cap, h / (dyMax[k] + 1));
  }
  let anno = {};

  function targets(dt) {
    const Rg = R(), f = 1 - Math.exp(-dt * 4);
    for (const p of P) { p.ta = 0; p.ts = narrow ? 1.25 : 1.55; p.c = "ink"; }
    const tRange = scene === "one" || scene === "many" ? seRange(30) : scene === "grow" ? seRange(growN().n) : null;
    if (tRange) range = [lerp(range[0], tRange[0], f), lerp(range[1], tRange[1], f)];
    const tReg = scene === "grow" ? Rg.full : scene === "many" ? lerpReg(Rg.low, Rg.full, manyMorph()) : Rg.low;
    reg = reg ? { x: lerp(reg.x, tReg.x, f), y: lerp(reg.y, tReg.y, f), w: lerp(reg.w, tReg.w, f), h: lerp(reg.h, tReg.h, f) } : { ...tReg };
    anno = {};

    if (scene === "hero") {
      const st = stack(P.map((_, i) => i), (i) => D.bellZ[i], Rg.hero, -3.3, 3.3, narrow ? 64 : 92, 5);
      for (const p of P) { if (!p.inR) continue; p.ta = 0.78; p.ty += Math.sin(sceneT * 1.1 + p.tx * 0.015) * 1.6; }
      anno.heroCurve = { reg: Rg.hero, dy: st.dy, binW: 6.6 / (narrow ? 64 : 92) };
    }
    if (scene === "data" || scene === "one" || scene === "many") {
      const pr = scene === "data" ? lerpReg(Rg.popBig, Rg.popTop, dataMorph()) : Rg.popTop, nb = narrow ? 48 : 80;
      const fr = scene === "data" ? clamp(progS / 0.45, 0, 1) : 1;
      const ids = fr >= 1 ? popIds : popIds.filter((id) => D.reveal[P[id].k] < fr * MEAN_N);
      const st = stack(ids, (i) => D.popVals[P[i].k], pr, -60, 180, nb, fixedDy("pop", D.popVals, -60, 180, nb, pr.h, 6));
      const h1 = scene === "data" ? bump(progS, 0.45, 0.5, 0.58, 0.62) : 0, h2 = scene === "data" ? bump(progS, 0.6, 0.64, 0.7, 0.74) : 0;
      for (const id of ids) {
        const p = P[id]; p.c = "blue"; if (!p.inR) continue;
        if (scene === "data" && p.a < 0.02) { p.x = p.tx; p.y = pr.y - 30 - p.j2 * 90; }
        p.ta = scene === "many" ? 0.28 * (1 - manyMorph()) : 0.85;
        if (scene === "data") {
          const v = D.popVals[p.k];
          if (Math.abs(v) > 20) p.ta *= 1 - 0.75 * h1;
          if (v > 60) { if (h2 > 0.25) { p.c = "red"; p.ts = 1.55 + 0.9 * h2; } } else p.ta *= 1 - 0.75 * h2;
        }
      }
      anno.h1 = h1; anno.h2 = h2;
      anno.pop = { reg: pr, st };
    }
    if (scene === "one") {
      const popR = Rg.popTop, NS = D.SAMPLES.length, SLOW = 4, q = clamp(progS, 0, 1);
      let c, ph;
      if (q < 0.6) { const f = q / 0.6 * SLOW; c = Math.min(SLOW - 1, Math.floor(f)); ph = f - c; }
      else { c = Math.min(NS - 1, SLOW + Math.floor((q - 0.6) / 0.4 * (NS - SLOW + 1))); ph = 1; }
      const xOf = (m) => popR.x + clamp((m + 60) / 240, 0, 1) * popR.w, my = popR.y + popR.h + 66;
      const slow = c < SLOW, m = D.SMEAN[c], mx = xOf(m);
      const g = slow ? clamp((ph - 0.15) / 0.4, 0, 1) : 0, back = slow ? clamp((ph - 0.7) / 0.3, 0, 1) : 1, pull = g * (1 - back);
      D.SAMPLES[c].forEach((i) => { const p = P[i]; p.c = "red"; p.ta = 1; p.ts = 3.2; p.tx = lerp(p.tx, mx, pull); p.ty = lerp(p.ty, my, pull); });
      const done = Math.min(NS, c + (!slow || ph >= 0.7 ? 1 : 0));
      const shown = meanIds.slice(0, done);
      stack(shown, (id) => D.SMEAN[P[id].k], reg, range[0], range[1], narrow ? 46 : 70, 7);
      shown.forEach((id) => { const p = P[id]; if (!p.inR) return; if (p.a < 0.02) { p.x = xOf(D.SMEAN[P[id].k]); p.y = my; } p.ta = 1; p.ts = 2.8; p.c = "mustard"; });
      if (slow && ph >= 0.7) { const p = P[meanIds[c]]; p.tx = lerp(mx, p.tx, back); p.ty = lerp(my, p.ty, back); }
      anno.sample = { mx, my, m, ids: D.SAMPLES[c], done,
        a: slow ? clamp((ph - 0.45) / 0.1, 0, 1) * (1 - clamp((ph - 0.85) / 0.1, 0, 1)) : 0,
        lines: slow ? 0.35 * clamp(ph / 0.12, 0, 1) * (1 - g) : 0 };
    }
    if (scene === "many" || scene === "grow") {
      let valueOf, count;
      const nb = narrow ? 56 : 90;
      let cap = 5;
      if (scene === "many") {
        const q = clamp(progS / 0.7, 0, 1); count = Math.round(40 + (MEAN_N - 40) * q * q); valueOf = (id) => D.meanStops[0][P[id].k];
        const r30 = seRange(30); cap = fixedDy("many", D.meanStops[0], r30[0], r30[1], nb, reg.h, 5);
      } else { const { k, t } = growN(); count = MEAN_N; valueOf = (id) => lerp(D.meanStops[k][P[id].k], D.meanStops[k + 1][P[id].k], t); }
      const ids = meanIds.filter((id) => D.reveal[P[id].k] < count);
      const st = stack(ids, valueOf, reg, range[0], range[1], nb, cap);
      for (const id of ids) {
        const p = P[id];
        if (!p.inR) continue;
        if (scene === "many" && p.a < 0.02) { p.x = Rg.popTop.x + Math.random() * Rg.popTop.w; p.y = Rg.popTop.y + Rg.popTop.h * 0.7; }
        p.ta = 0.85; p.c = "ink";
      }
      reg.dy = st.dy; reg.binW = st.binW;
    }
    if (scene === "never") {
      anno.never = stack(meanIds, (id) => D.cauchy[P[id].k], Rg.full, -8, 8, narrow ? 56 : 90, 5);
      for (const id of meanIds) { const p = P[id]; p.ta = p.inR ? 0.85 : 0; p.c = "red"; }
      kick += dt * 30 + Math.abs(progS - kickP) * 2600; kickP = progS;
      while (kick > 1) { kick -= 1; const p = P[meanIds[(Math.random() * MEAN_N) | 0]]; p.x += (Math.random() - 0.5) * W * 0.3; p.y -= Math.random() * H * 0.3; }
    }
    if (scene === "answer" && textPts.length) {
      const drift = clamp((progS - 0.3) / 0.7, 0, 1);
      P.forEach((p, i) => { const q = textPts[(i * 7919) % textPts.length];
        p.tx = q[0] + (p.j1 - 0.5) * 2; p.ty = q[1] + (p.j2 - 0.5) * 2 + drift * p.j1 * 90; p.ta = 0.8 * (1 - drift * 0.6); p.c = "ink"; });
    }
  }

  // ---------- drawing helpers ----------
  function axis(r, lo, hi, label, ticks, fmtT) {
    const y = r.y + r.h + 6;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke();
    ctx.fillStyle = C.ink2; ctx.font = `400 11px ${MONO}`; ctx.textAlign = "center";
    ticks.forEach((v) => { if (v < lo || v > hi) return; const x = r.x + (v - lo) / (hi - lo) * r.w; ctx.fillRect(x, y, 1, 4); ctx.fillText(fmtT ? fmtT(v) : String(v), x, y + 17); });
    if (label) { ctx.textAlign = "left"; ctx.font = `400 12px ${SANS}`; ctx.fillStyle = C.ink2; ctx.fillText(label, r.x, y + 34); }
  }
  function niceTicks(lo, hi, k = 5) {
    const step0 = (hi - lo) / k, mag = Math.pow(10, Math.floor(Math.log10(step0))), q = step0 / mag;
    const step = (q < 1.5 ? 1 : q < 3.5 ? 2 : q < 7.5 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function label(text, x, y, opt = {}) {
    ctx.save(); ctx.globalAlpha = opt.a == null ? 1 : opt.a;
    ctx.font = `${opt.weight || 400} ${opt.size || 12.5}px ${opt.font || SANS}`; ctx.fillStyle = opt.color || C.ink; ctx.textAlign = opt.align || "left";
    (Array.isArray(text) ? text : [text]).forEach((t, i) => ctx.fillText(t, x, y + i * 16));
    ctx.restore();
  }
  function leader(x1, y1, x2, y2, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1, y2, x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x2, y2, 2, 0, 7); ctx.fillStyle = C.ink; ctx.fill(); ctx.restore();
  }
  function curve(r, mu, se, lo, hi, count, binW, dy, a, color) {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color || C.red; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i <= 240; i++) { const x = lo + (hi - lo) * i / 240, px = r.x + (x - lo) / (hi - lo) * r.w, py = r.y + r.h - count * binW * dnorm(x, mu, se) * dy; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.restore();
  }

  function drawWhy(t) {
    if (!WHY) return;
    const iv = WHY.intervals, lo = -25, hi = 55;
    const top = narrow ? 6 : 128, r = { x: B.x, y: B.y + top, w: B.w, h: B.h - 24 - top + (narrow ? -34 : 40) }, rh = r.h / 100;
    const xs = (v) => r.x + (clamp(v, lo, hi) - lo) / (hi - lo) * r.w;
    const shown = Math.round(clamp(progS / 0.97, 0, 1) * 100);
    ctx.save(); ctx.globalAlpha = whyA;
    let hit = 0, low = 0, high = 0;
    for (let i = 0; i < 100; i++) {
      if (i >= shown) { whyShown[i] = -1; continue; }
      if (whyShown[i] < 0) whyShown[i] = t;
      const age = clamp((t - whyShown[i]) / 0.35, 0, 1), [a, b] = iv[i], miss = b < WHY.mu || a > WHY.mu, y = r.y + (i + 0.5) * rh;
      if (b < WHY.mu) low++; else if (a > WHY.mu) high++; else hit++;
      ctx.globalAlpha = whyA * easeOut(age); ctx.strokeStyle = miss ? C.red : C.ink2; ctx.lineWidth = miss ? 2 : 1.2;
      const off = (1 - easeOut(age)) * 30;
      ctx.beginPath(); ctx.moveTo(xs(a) + off, y); ctx.lineTo(xs(b) + off, y); ctx.stroke();
      if (b > hi) { ctx.beginPath(); ctx.moveTo(xs(hi) + off - 5, y - 3); ctx.lineTo(xs(hi) + off, y); ctx.lineTo(xs(hi) + off - 5, y + 3); ctx.stroke(); }
      ctx.fillStyle = miss ? C.red : C.ink; ctx.fillRect(xs((a + b) / 2) + off - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = whyA; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xs(WHY.mu), r.y - 18); ctx.lineTo(xs(WHY.mu), r.y + r.h); ctx.stroke(); ctx.setLineDash([]);
    label(`true average delay: ${WHY.mu.toFixed(1)} min`, xs(WHY.mu) + 6, r.y - 8, { a: whyA, size: 12, weight: 500 });
    axis(r, lo, hi, narrow ? "95% range from one study of 30 flights (min)" : "95% range for the average delay, from one study of 30 flights (minutes)", niceTicks(lo, hi, narrow ? 4 : 6));
    ctx.restore();
    return { shown, hit, low, high };
  }

  // what averaging would do to ordinary (finite-variance) data with the same middle spread
  function drawNeverRef() {
    const n = neverN(), r = R().full, st = anno.never, sd = 1.48 / Math.sqrt(n), a = 0.9 * clamp((progS - 0.02) / 0.08, 0, 1);
    if (a <= 0.01) return;
    const X = (v) => r.x + (v + 8) / 16 * r.w, Y = (v) => r.y + r.h - D.cauchyIn * st.binW * dnorm(v, 0, sd) * st.dy;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y - 26, r.w, r.h + 26); ctx.clip();
    ctx.globalAlpha = a; ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(-8), Y(-8));
    for (let i = 0; i <= 200; i++) { const v = (-4 + 8 * i / 200) * sd; ctx.lineTo(X(v), Y(v)); }
    ctx.lineTo(X(8), Y(8)); ctx.stroke(); ctx.restore();
    label("ordinary data, averaged the same way", X(0) + 10, r.y - 12, { a, size: 12.5, color: C.blue, weight: 500 });
  }

  function drawChart(t) {
    const rows = ORDER.map((k) => SITE[k]).filter(Boolean);
    const NAMES = { normal: "Already bell-shaped data", die: "Dice rolls", faithful: "Time between Old Faithful eruptions", discoveries: "Inventions per year",
      diamonds: "Diamond prices", exponential: "Waiting times (next customer)", binomial: "Count of rare events", flights: "Flight delays",
      counties: "County populations", cauchy: "Extreme-outlier data" };
    const SHORT = { normal: "Bell-shaped", die: "Dice rolls", faithful: "Old Faithful", discoveries: "Inventions", diamonds: "Diamond prices",
      exponential: "Waiting times", binomial: "Rare events", flights: "Flight delays", counties: "County pop.", cauchy: "Extreme outliers" };
    const lab = narrow ? 96 : 228, x0 = B.x + lab, x1 = B.x + B.w - (narrow ? 34 : 64), top = B.y + 26, rh = (B.h - 74) / rows.length;
    const xs = (n) => x0 + Math.log10(n) / 4 * (x1 - x0);
    ctx.save(); ctx.globalAlpha = chartA;
    ctx.font = `400 11px ${MONO}`; ctx.textAlign = "center"; ctx.fillStyle = C.ink2;
    [1, 10, 100, 1000, 10000].forEach((v) => { ctx.fillText(fmt(v), xs(v), top + rh * rows.length + 20); });
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, top + rh * rows.length + 4); ctx.lineTo(x1, top + rh * rows.length + 4); ctx.stroke();
    const nNow = Math.pow(10, 4 * t), bottom = top + rh * rows.length + 4;
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(xs(30), top - 30); ctx.lineTo(xs(30), bottom); ctx.stroke(); ctx.setLineDash([]);
    label("the textbook rule: 30", xs(30) + 5, top - 22, { a: chartA, size: 12, weight: 600 });
    label(narrow ? "values per study needed to pass" : "values per study needed before the averages pass all four checks", x0, bottom + 36, { a: chartA, size: 12, color: C.ink2 });
    const sweepA = chartA * (1 - clamp((t - 0.97) / 0.03, 0, 1));
    if (sweepA > 0.01) {
      ctx.save(); ctx.globalAlpha = sweepA * 0.08; ctx.fillStyle = C.ink; ctx.fillRect(x0, top - 2, xs(nNow) - x0, bottom - top + 2); ctx.restore();
      ctx.save(); ctx.globalAlpha = sweepA; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xs(nNow), top - 2); ctx.lineTo(xs(nNow), bottom); ctx.stroke(); ctx.restore();
      label(`${fmt(nNow)} per study`, xs(nNow) + 5, top - 6, { a: sweepA, size: 11.5, font: MONO, color: C.ink2 });
    }
    rows.forEach((p, i) => {
      const y = top + rh * (i + 0.5), never = p.n_main == null, target = never ? 10000 : p.n_main;
      const nn = Math.min(nNow, target), x = xs(nn), arrived = nNow >= target;
      const col = never ? (arrived ? "red" : nn > 30 ? "orange" : "green") : nn > 30 ? "orange" : "green";
      const name = (narrow ? SHORT[p.key] : NAMES[p.key]) || p.name;
      label(name, x0 - 12, y + 4,
        { a: chartA, align: "right", size: narrow ? 11 : 13, color: p.key === "flights" ? C.ink : C.ink2, weight: p.key === "flights" ? 600 : 400 });
      ctx.strokeStyle = C[col]; ctx.globalAlpha = chartA * 0.6; ctx.lineWidth = 2; if (never) ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(xs(1), y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = chartA;
      ctx.drawImage(SPR[col], x - 7, y - 7, 14, 14);
      if (arrived) label(never ? "never" : fmt(p.n_main), never ? x - 40 : x + 11, never ? y - 8 : y + 4, { a: chartA, size: 12, font: MONO, color: C[col] });
    });
    ctx.restore();
  }

  // ---------- the margin note ----------
  let noteHtml = "";
  function setNote(html) { if (html !== noteHtml) { noteHtml = html; noteEl.innerHTML = html; } noteEl.classList.toggle("show", !!html); }
  function curveAt(key, n) {
    const c = SITE[key] && SITE[key].curve; if (!c) return null;
    let best = 0; c.n.forEach((v, i) => { if (Math.abs(Math.log(v / n)) < Math.abs(Math.log(c.n[best] / n))) best = i; });
    return { skew: c.skew[best], kurt: c.kurt ? c.kurt[best] : 0, qq: c.qq[best], lower: c.lower[best], upper: c.upper[best] };
  }
  function updateNote(why) {
    if (scene === "why" && why) {
      const w = WHY.flights30;
      setNote(`<div class="head"><span>${why.shown} studies of 30 flights</span></div>
        <div class="marks">caught the truth <b>${why.hit}</b> · too low <b class="fail">${why.low}</b> · too high <b>${why.high}</b></div>
        <div class="check"><span>Range caught the true average</span><span class="big" style="margin-left:auto">${why.hit}</span></div>
        <div class="check"><span>Range was too low</span><span class="big" style="margin-left:auto;color:var(--red)">${why.low}</span></div>
        <div class="check"><span>Range was too high</span><span class="big" style="margin-left:auto">${why.high}</span></div>
        <div class="verdict"><span class="sub">all 100,000 tries: ${(100 * w.covers).toFixed(1)}% caught it, ${(100 * w.too_low).toFixed(1)}% too low</span></div>`);
    } else if (scene === "grow") {
      const n = nAt(progS).n, r = curveAt("flights", n), nMain = (SITE.flights && SITE.flights.n_main) || 235;
      const ok = n >= nMain - 0.5;
      const checks = r ? [[Math.abs(r.skew) <= 0.25, "Not lopsided", `lopsidedness ${Math.abs(r.skew).toFixed(2)}, limit 0.25`],
        [Math.abs(r.kurt) <= 0.5, "Not too many far-out averages", ""], [r.qq >= 0.998, "Matches the bell outline", ""],
        [[r.lower, r.upper].every((v) => v >= 0.0175 && v <= 0.0325), "95% range misses 2.5% per side", `now ${(100 * r.lower).toFixed(1)}% low, ${(100 * r.upper).toFixed(1)}% high`]] : [];
      const all = checks.every((c) => c[0]);
      setNote(`<div class="head"><span>Flights per study</span><span class="big">${fmt(n)}</span></div>` +
        `<div class="marks">${checks.map((c) => `<span class="${c[0] ? "pass" : "fail"}">${c[0] ? "✓" : "✗"}</span>`).join(" ")}</div>` +
        checks.map(([p, l, sub]) => `<div class="check ${p ? "pass" : "fail"}"><span class="mark">${p ? "✓" : "✗"}</span><span>${l}${sub ? `<br><span class="sub">${sub}</span>` : ""}</span></div>`).join("") +
        `<div class="verdict ${ok ? "ok" : "no"}">${ok ? "Bell-shaped enough" : all ? "Passes here, but not yet for every bigger study" : "Not bell-shaped yet"}</div>`);
    } else if (scene === "never") {
      const n = neverN();
      setNote(`<div class="head"><span>Values per study</span><span class="big">${fmt(n)}</span></div>
        <div class="check"><span>Middle half of the averages: about −1 to +1, the same as for single values.</span></div>
        <div class="verdict no">Never bell-shaped</div>`);
    } else setNote("");
  }

  // ---------- main loop ----------
  let lastT = performance.now();
  function frame(dt, now) {
    readScroll();
    if (scene !== last) { sceneT = 0; last = scene; progS = prog; kickP = prog; }
    else sceneT += dt;
    progS += (prog - progS) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
    targets(dt);
    const kp = reduce ? 1 : 1 - Math.exp(-dt * 4.2), ka = reduce ? 1 : 1 - Math.exp(-dt * 3.5), fa = 1 - Math.exp(-dt * 4);
    curveA = lerp(curveA, scene === "grow" ? 1 : 0, fa); chartA = lerp(chartA, scene === "compare" ? 1 : 0, fa);
    whyA = lerp(whyA, scene === "why" ? 1 : 0, fa);

    ctx.clearRect(0, 0, W, H);
    const Rg = R();
    if (anno.pop) {
      const aa = scene === "many" ? 1 - manyMorph() : 1;
      if (aa > 0.01) { ctx.save(); ctx.globalAlpha = aa; axis(anno.pop.reg, -60, 180, "arrival delay in minutes (negative = early)", [-60, 0, 60, 120, 180]); ctx.restore(); }
    }
    if ((scene === "one" || scene === "many" || scene === "grow") && reg) {
      const n = scene === "grow" ? growN().n : 30;
      axis(reg, range[0], range[1], `average delay of ${fmt(n)} flights (minutes)`, niceTicks(range[0], range[1], narrow ? 4 : 6));
    }
    if (scene === "never") axis(Rg.full, -8, 8, "average of n extreme-outlier values", [-8, -4, 0, 4, 8]);

    for (const p of P) {
      p.x += (p.tx - p.x) * kp; p.y += (p.ty - p.y) * kp; p.a += (p.ta - p.a) * ka; p.s += (p.ts - p.s) * ka;
      if (p.a < 0.01) continue;
      const r = p.s * 1.55; ctx.globalAlpha = p.a; ctx.drawImage(SPR[p.c], p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // annotations, after the dots have settled
    if (anno.heroCurve) { const h = anno.heroCurve; curve(h.reg, 0, 1, -3.3, 3.3, ALL, h.binW, h.dy, 0.9 * clamp(sceneT / 1.2, 0, 1)); }
    if (scene === "data" && anno.pop) {
      const { reg: pr, st } = anno.pop, a1 = anno.h1, a2 = anno.h2;
      leader(st.peakX + 70, pr.y + 10, st.peakX + 6, st.peakY - 4, a1);
      label(["most flights land within", "20 minutes of schedule"], st.peakX + 74, pr.y + 8, { a: a1, size: 12.5 });
      const tx = pr.x + pr.w - 4;
      label(["a few are hours late", "(up to 21 hours, off the chart) →"], tx, pr.y + pr.h - 40, { a: a2, size: 12.5, align: "right" });
    }
    if (scene === "one" && anno.sample) {
      const s = anno.sample;
      if (s.lines > 0.01) {
        ctx.save(); ctx.globalAlpha = s.lines; ctx.strokeStyle = C.red; ctx.lineWidth = 0.7;
        s.ids.forEach((i) => { const p = P[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(s.mx, s.my); ctx.stroke(); }); ctx.restore();
      }
      label(`average of these 30: ${s.m.toFixed(1)} min`, s.mx + 10, s.my + 4, { a: s.a, size: 12.5, weight: 600 });
      if (s.done && reg && !narrow) label(`${s.done} ${s.done === 1 ? "study" : "studies"} so far`, reg.x + reg.w, reg.y + 4, { size: 12, align: "right", color: C.ink2, font: MONO });
    }
    if ((scene === "many" || scene === "grow") && reg && reg.dy) {
      const x = reg.x + (D.MU - range[0]) / (range[1] - range[0]) * reg.w;
      ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = C.ink; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, reg.y - 6); ctx.lineTo(x, reg.y + reg.h + 6); ctx.stroke(); ctx.restore();
      label(`true average ${D.MU.toFixed(1)} min`, x - 6, reg.y + 4, { a: 0.85, size: 12, align: "right" });
      if (scene === "many") label(["the tail: studies that", "caught a very late flight →"], reg.x + reg.w - 4, reg.y + reg.h - 50, { a: clamp((progS - 0.55) / 0.12, 0, 1) * (1 - clamp((progS - 0.74) / 0.08, 0, 1)), size: 12.5, align: "right" });
    }
    if (curveA > 0.01 && reg && reg.dy) { const n = scene === "grow" ? growN().n : 400; curve(reg, D.MU, D.SIG / Math.sqrt(n), range[0], range[1], MEAN_N, reg.binW, reg.dy, curveA); }
    if (scene === "never" && anno.never) drawNeverRef();
    const why = whyA > 0.01 ? drawWhy(now / 1000) : null;
    if (chartA > 0.01) drawChart(scene === "compare" ? clamp(progS, 0, 1) : 1);
    if (scene === "answer") {
      const t = clamp((progS - 0.04) / 0.28, 0, 1);
      if (t > 0) {
        const xa = B.x + B.w * 0.12, ya = B.y + B.h * 0.74, xb = B.x + B.w * 0.88, yb = B.y + B.h * 0.26;
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = narrow ? 5 : 7; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(lerp(xa, xb, t), lerp(ya, yb, t)); ctx.stroke(); ctx.restore();
      }
    }
    updateNote(why);
  }
  function loop(now) { const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; frame(dt, now); requestAnimationFrame(loop); }

  // testing helper: run the animation for `sec` seconds without waiting for the browser
  window.__story = { advance(sec) { if (!D) return; const t0 = performance.now(); for (let i = 0; i < sec * 60; i++) frame(1 / 60, t0 + i * 16.67); } };
})();
