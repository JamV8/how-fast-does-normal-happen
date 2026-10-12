// Story mode: a scroll-driven particle visualization of the Central Limit Theorem.
// Every particle eases toward a target position set by the current scene and scroll progress.
// Numbers in the HUD and the threshold chart come from the R study (assets/data/site.json).
(function () {
  "use strict";
  const cv = document.getElementById("viz"), ctx = cv.getContext("2d");
  const hud = document.getElementById("hud");
  const steps = [...document.querySelectorAll(".step")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COL = { white: "#3d7bfd", cyan: "#6d4aff", coral: "#ff5d73", gold: "#e5a000", violet: "#00b8a0", star: "#d3c7b6",
                green: "#16a34a", orange: "#f59e0b", red: "#e11d48" };
  const INK = "#1f1a33";
  const TINT = { 0: "#faf7f2", 8: "#fff6df", 1: "#e9f7f4", 2: "#e9f7f4", 3: "#f2eeff", 4: "#f2eeff", 5: "#ebf2ff", 6: "#fff0f2", 7: "#faf7f2" };
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- glowing sprites ----------
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const SPR = {};
  for (const k in COL) {
    const s = document.createElement("canvas"); s.width = s.height = 64;
    const g = s.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, COL[k]); grd.addColorStop(0.55, COL[k]); grd.addColorStop(0.8, rgba(COL[k], 0.35)); grd.addColorStop(1, rgba(COL[k], 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); SPR[k] = s;
  }

  // ---------- random numbers and the simulated data ----------
  let seed = 9426;
  const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rexp = () => -Math.log(1 - rand());
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

  const POP_N = 1100, MEAN_N = 2000, ALL = POP_N + MEAN_N;
  const popVals = Array.from({ length: POP_N }, rexp);
  const N_STOPS = [5, 8, 12, 20, 30, 45, 71, 110, 200];
  // For each sample size: 2,000 averages of exponential samples, sorted, so that particle i can
  // carry the i-th smallest average from one sample size to the next (a smooth morph).
  const meanStops = N_STOPS.map((n) => {
    const a = new Float64Array(MEAN_N);
    for (let i = 0; i < MEAN_N; i++) { let s = 0; for (let j = 0; j < n; j++) s += rexp(); a[i] = s / n; }
    a.sort();
    const out = new Float64Array(MEAN_N), h = 12;
    for (let i = 0; i < MEAN_N; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - h); j <= Math.min(MEAN_N - 1, i + h); j++) { s += a[j]; c++; } out[i] = s / c; }
    return out;
  });
  const cauchyVals = Float64Array.from({ length: MEAN_N }, () => Math.tan(Math.PI * (rand() - 0.5))).sort();
  const perm = Array.from({ length: MEAN_N }, (_, i) => i);
  for (let i = MEAN_N - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const revealRank = new Int32Array(MEAN_N); perm.forEach((p, k) => { revealRank[p] = k; });
  const bellZ = Array.from({ length: ALL }, (_, i) => qnorm((i + 0.5) / ALL));

  // ---------- particles ----------
  const P = Array.from({ length: ALL }, (_, i) => ({
    x: Math.random() * 1400, y: Math.random() * 900, tx: 0, ty: 0, a: 0, ta: 0, s: 1.6, ts: 1.6, c: "white",
    star: [Math.random(), Math.random()], jit: Math.random(), pop: i < POP_N, k: i < POP_N ? i : i - POP_N }));

  // ---------- results from the R study ----------
  let SITE = {
    normal: { name: "Normal", n_main: 1 }, die: { name: "Six-sided die", n_main: 8 }, faithful: { name: "Geyser waiting times", n_main: 6 },
    discoveries: { name: "Inventions per year", n_main: 38 }, diamonds: { name: "Diamond prices", n_main: 51 },
    exponential: { name: "Exponential (waiting time)", n_main: 71 }, binomial: { name: "Binomial (5, 0.1)", n_main: 83 },
    flights: { name: "Flight delays (NYC)", n_main: 235 }, counties: { name: "County populations", n_main: 2450 },
    cauchy: { name: "Cauchy (extreme tails)", n_main: null } };
  let ORDER = Object.keys(SITE);
  Object.keys(SITE).forEach((k) => { SITE[k].key = k; });
  const PLAIN = { normal: "Already bell-shaped data", die: "Dice rolls", faithful: "Time between Old Faithful eruptions",
    discoveries: "Inventions per year", diamonds: "Diamond prices", exponential: "Waiting times (next customer)",
    binomial: "Count of rare events", flights: "Flight delays", counties: "County populations", cauchy: "Extreme-outlier data" };
  fetch("assets/data/site.json").then((r) => r.json()).then((d) => {
    SITE = Object.fromEntries(d.populations.map((p) => [p.key, p])); ORDER = d.populations.map((p) => p.key);
  }).catch(() => {});

  // ---------- layout ----------
  let W = 0, H = 0, B, narrow, textPts = [];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    narrow = W < 760;
    B = narrow ? { x: 18, y: 118, w: W - 36, h: H * 0.56 - 118 } : { x: W * 0.41, y: H * 0.17, w: W * 0.54, h: H * 0.68 };
    buildText();
  }
  function buildText() {   // sample points inside the glyphs of "30"
    const oc = document.createElement("canvas"), w = Math.round(B.w), h = Math.round(B.h);
    oc.width = w; oc.height = h;
    const g = oc.getContext("2d"), fs = Math.min(h * 0.95, w * 0.62);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `800 ${fs}px "Plus Jakarta Sans", sans-serif`;
    g.fillText("30", w / 2, h / 2 + fs * 0.04);
    const img = g.getImageData(0, 0, w, h).data, pts = [], step = Math.max(2, Math.round(Math.sqrt((w * h * 0.25) / ALL)));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (img[(y * w + x) * 4 + 3] > 140) pts.push([B.x + x, B.y + y]);
    textPts = pts;
  }
  resize();
  window.addEventListener("resize", resize);
  if (document.fonts) document.fonts.ready.then(buildText);

  // ---------- stacking: turn values into a dot histogram inside a region ----------
  function stack(ids, valueOf, region, lo, hi, nb, maxDy) {
    const counts = new Int32Array(nb), bins = new Int32Array(ids.length);
    ids.forEach((id, j) => { const v = valueOf(id); const b = Math.floor((v - lo) / (hi - lo) * nb); bins[j] = (b >= 0 && b < nb) ? b : -1; if (bins[j] >= 0) counts[b]++; });
    let mx = 1; for (let b = 0; b < nb; b++) if (counts[b] > mx) mx = counts[b];
    const bw = region.w / nb, dy = Math.min(maxDy || 7, region.h / (mx + 1)), fill = new Int32Array(nb);
    ids.forEach((id, j) => {
      const p = P[id], b = bins[j];
      if (b < 0) { p.ta = 0; return; }
      p.tx = region.x + (b + 0.5) * bw + (p.jit - 0.5) * bw * 0.55;
      p.ty = region.y + region.h - (fill[b]++ + 0.5) * dy;
    });
    return { dy, binW: (hi - lo) / nb };
  }
  const popIds = P.map((_, i) => i).filter((i) => P[i].pop);
  const meanIds = P.map((_, i) => i).filter((i) => !P[i].pop);

  // ---------- scroll state ----------
  let scene = 0, prog = 0, sceneT = 0, lastScene = -1;
  function readScroll() {
    const mid = window.innerHeight * 0.55;
    let s = 0, pr = 0;
    steps.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.top <= mid) { s = +el.dataset.scene; pr = clamp((mid - r.top) / Math.max(1, r.height - window.innerHeight * 0.45), 0, 1); }
    });
    scene = s; prog = pr;
    document.getElementById("nav").classList.toggle("solid", window.scrollY > 40);
    const sc = document.querySelector(".scrolly"), total = sc.offsetHeight - window.innerHeight;
    document.getElementById("progress-bar").style.width = (clamp(window.scrollY / total, 0, 1) * 100) + "%";
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  readScroll();

  // ---------- per-scene state ----------
  let whyReg = null, range = [0, 6], region = null, live = [], cycle = -1, sample = [], kicks = 0, chartAlpha = 0, curveAlpha = 0;

  function nAt(pr) {   // scroll progress -> sample size (log interpolation between the stops)
    const f = clamp(pr, 0, 0.9999) * (N_STOPS.length - 1), k = Math.floor(f), t = ease(f - k);
    return { k, t, n: Math.exp(lerp(Math.log(N_STOPS[k]), Math.log(N_STOPS[k + 1]), t)) };
  }
  const regions = () => ({
    popBig: { x: B.x, y: B.y, w: B.w, h: B.h * 0.82 },
    popTop: { x: B.x, y: B.y, w: B.w, h: B.h * 0.36 },
    means: { x: B.x, y: B.y + B.h * 0.56, w: B.w, h: B.h * 0.40 },
    full: { x: B.x, y: B.y + B.h * 0.06, w: B.w, h: B.h * 0.90 } });

  function setTargets(dt) {
    const Rg = regions();
    for (const p of P) { p.ta = 0; p.ts = 1.6; p.c = "white"; }
    const tRange = scene <= 3 ? [0, 6] : scene === 4 ? (() => { const n = nAt(prog).n; return [Math.max(0, 1 - 4.2 / Math.sqrt(n)), 1 + 4.2 / Math.sqrt(n)]; })() : range;
    range = [lerp(range[0], tRange[0], 1 - Math.exp(-dt * 5)), lerp(range[1], tRange[1], 1 - Math.exp(-dt * 5))];
    const tReg = scene === 4 ? Rg.full : Rg.means;
    region = region ? { x: lerp(region.x, tReg.x, 1 - Math.exp(-dt * 5)), y: lerp(region.y, tReg.y, 1 - Math.exp(-dt * 5)),
                        w: lerp(region.w, tReg.w, 1 - Math.exp(-dt * 5)), h: lerp(region.h, tReg.h, 1 - Math.exp(-dt * 5)) } : tReg;

    if (scene === 0) {
      const hr = { x: W * 0.08, y: H * (narrow ? 0.71 : 0.7), w: W * 0.84, h: H * (narrow ? 0.26 : 0.27) };
      stack(P.map((_, i) => i), (i) => bellZ[i], hr, -3.4, 3.4, narrow ? 60 : 110, 5);
      for (const p of P) { p.ta = 0.55 + 0.3 * p.jit; p.ts = narrow ? 1.3 : 1.7; p.c = p.star[0] < Math.exp(-(((p.tx - W / 2) / (W * 0.16)) ** 2)) ? "cyan" : "violet"; p.ty += Math.sin(sceneT * 1.3 + p.tx * 0.012) * 3; }
      return;
    }
    if (scene === 8) {
      const reg = { x: B.x, y: B.y + B.h * 0.18, w: B.w, h: B.h * 0.74 };
      stack(P.map((_, i) => i), (i) => bellZ[i], reg, -3.4, 3.4, narrow ? 60 : 96, 6);
      P.forEach((p, i) => { p.ta = 0.85; p.ts = narrow ? 1.3 : 1.6; p.c = Math.abs(bellZ[i]) <= 1.96 ? "cyan" : "coral"; });
      whyReg = reg;
    }
    if (scene === 1 || scene === 2 || scene === 3) {
      const pr = scene === 1 ? Rg.popBig : Rg.popTop;
      stack(popIds, (i) => popVals[P[i].k], pr, 0, 6, narrow ? 48 : 72, 7);
      for (const id of popIds) { const p = P[id]; p.ta = scene === 3 ? 0.35 : 0.85; p.ts = 1.7; }
    }
    if (scene === 2) {
      const cyc = Math.floor(sceneT / 2.4), ph = sceneT - cyc * 2.4;
      if (cyc !== cycle) {
        cycle = cyc;
        sample = []; while (sample.length < 5) { const i = (Math.random() * POP_N) | 0; if (!sample.includes(i)) sample.push(i); }
        const m = sample.reduce((s, i) => s + popVals[i], 0) / 5;
        if (live.length < 40) live.push(m);
        const id = meanIds[live.length - 1], p = P[id];
        p.born = sceneT; p.mx = Rg.popTop.x + clamp(m / 6, 0, 1) * Rg.popTop.w;
      }
      const mx = Rg.popTop.x + clamp(sample.reduce((s, i) => s + popVals[i], 0) / 5 / 6, 0, 1) * Rg.popTop.w, my = Rg.popTop.y + Rg.popTop.h + 70;
      sample.forEach((i) => {
        const p = P[i]; p.c = "coral"; p.ta = 1; p.ts = 4.4;
        if (ph > 0.55 && ph < 1.25) { p.tx = mx; p.ty = my; }
      });
      const shown = meanIds.slice(0, live.length - (ph < 1.25 ? 1 : 0));
      stack(shown, (id) => live[P[id].k], region, range[0], range[1], narrow ? 48 : 72, 7);
      shown.forEach((id) => { const p = P[id]; p.ta = 1; p.ts = 2.6; p.c = "gold"; });
      if (ph >= 1.25) { const p = P[meanIds[live.length - 1]]; if (ph < 1.4) { p.x = mx; p.y = my; } }
    }
    if (scene === 3 || scene === 4) {
      let valueOf, count;
      if (scene === 3) { count = Math.min(MEAN_N, Math.floor(sceneT * 650)); valueOf = (id) => meanStops[0][P[id].k]; }
      else { const { k, t } = nAt(prog); count = MEAN_N; valueOf = (id) => lerp(meanStops[k][P[id].k], meanStops[k + 1][P[id].k], t); }
      const ids = meanIds.filter((id) => revealRank[P[id].k] < count);
      const st = stack(ids, valueOf, region, range[0], range[1], narrow ? 56 : 90, 6);
      ids.forEach((id) => {
        const p = P[id];
        if (p.a < 0.02 && scene === 3) { p.x = Rg.popTop.x + Math.random() * Rg.popTop.w; p.y = Rg.popTop.y + Rg.popTop.h * 0.6; }
        p.ta = 0.9; p.ts = narrow ? 1.3 : 1.6; p.c = "cyan";
      });
      region.dy = st.dy; region.binW = st.binW; region.count = ids.length;
    }
    if (scene === 5) {
      for (const p of P) { p.tx = p.star[0] * W; p.ty = p.star[1] * H; p.ta = 0.35; p.ts = 1; p.c = "star"; }
    }
    if (scene === 6) {
      const reg = Rg.full;
      stack(meanIds, (id) => cauchyVals[P[id].k], reg, -8, 8, narrow ? 56 : 90, 6);
      meanIds.forEach((id) => { const p = P[id]; p.ta = Math.abs(cauchyVals[p.k]) > 8 ? 0 : 0.9; p.ts = narrow ? 1.3 : 1.6; p.c = "coral"; });
      kicks += dt;
      while (kicks > 0.08) {   // the extremes keep knocking averages around
        kicks -= 0.08;
        for (let j = 0; j < 14; j++) { const p = P[meanIds[(Math.random() * MEAN_N) | 0]]; p.x += (Math.random() - 0.5) * W * 0.5; p.y -= Math.random() * H * 0.45; }
      }
    }
    if (scene === 7 && textPts.length) {
      const drift = clamp((prog - 0.55) / 0.45, 0, 1);
      P.forEach((p, i) => {
        const q = textPts[(i * 7919) % textPts.length];
        p.tx = q[0] + (p.jit - 0.5) * 3; p.ty = q[1] + (p.star[1] - 0.5) * 3 + drift * (p.star[0] * 120);
        p.ta = 0.85 * (1 - drift * 0.6); p.ts = narrow ? 1.3 : 1.7; p.c = i % 3 ? "white" : "cyan";
      });
    }
  }

  // ---------- drawing ----------
  function axis(reg, lo, hi, label, ticks) {
    const y = reg.y + reg.h + 6;
    ctx.strokeStyle = "rgba(31,26,51,.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(reg.x, y); ctx.lineTo(reg.x + reg.w, y); ctx.stroke();
    ctx.fillStyle = "rgba(31,26,51,.55)"; ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.textAlign = "center";
    ticks.forEach((v) => { if (v < lo || v > hi) return; const x = reg.x + (v - lo) / (hi - lo) * reg.w; ctx.fillRect(x, y, 1, 4); ctx.fillText(nice(v), x, y + 17); });
    if (label) { ctx.textAlign = "left"; ctx.fillStyle = "rgba(31,26,51,.5)"; ctx.fillText(label, reg.x, y + 34); }
  }
  const nice = (v) => Math.abs(v) >= 100 ? fmt(v) : Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(Math.abs(v) < 1 ? 2 : 1);
  function niceTicks(lo, hi, k = 5) {
    const span = hi - lo, step0 = span / k, mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function drawCurve(n) {
    if (!region || !region.dy) return;
    const se = 1 / Math.sqrt(n), [lo, hi] = range;
    ctx.save(); ctx.globalAlpha = curveAlpha;
    ctx.shadowColor = "rgba(255,93,115,.35)"; ctx.shadowBlur = 6; ctx.strokeStyle = COL.coral; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 260; i++) {
      const x = lo + (hi - lo) * i / 260, cnt = MEAN_N * region.binW * dnorm(x, 1, se);
      const px = region.x + (x - lo) / (hi - lo) * region.w, py = region.y + region.h - cnt * region.dy;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.restore();
  }

  function drawChart(t) {
    const rows = ORDER.map((k) => SITE[k]).filter(Boolean), lab = narrow ? 118 : 210, x0 = B.x + lab, x1 = B.x + B.w - (narrow ? 40 : 70);
    const top = B.y + 30, rh = (B.h - 70) / rows.length, xs = (n) => x0 + Math.log10(n) / 4 * (x1 - x0);
    ctx.save(); ctx.globalAlpha = chartAlpha;
    ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.textAlign = "center"; ctx.fillStyle = "rgba(31,26,51,.5)";
    [1, 10, 100, 1000, 10000].forEach((v) => { ctx.fillText(fmt(v), xs(v), top + rh * rows.length + 22); ctx.fillStyle = "rgba(31,26,51,.07)"; ctx.fillRect(xs(v), top - 10, 1, rh * rows.length + 6); ctx.fillStyle = "rgba(31,26,51,.5)"; });
    ctx.strokeStyle = "rgba(31,26,51,.55)"; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(xs(30), top - 18); ctx.lineTo(xs(30), top + rh * rows.length); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = INK; ctx.font = '600 12px "JetBrains Mono", monospace'; ctx.fillText("n = 30", xs(30), top - 24);
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(31,26,51,.5)"; ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText("values per study needed before the averages form a bell curve", (x0 + x1) / 2, top + rh * rows.length + 42);
    rows.forEach((p, i) => {
      const y = top + rh * (i + 0.5), tt = clamp((t - 0.25 - i * 0.09) / 1.4, 0, 1), e = easeOut(tt);
      ctx.fillStyle = "rgba(31,26,51,.07)"; ctx.fillRect(x0, y, x1 - x0, 1);
      ctx.textAlign = "right"; ctx.fillStyle = "#3b3450"; ctx.font = `600 ${narrow ? 11 : 13}px "Plus Jakarta Sans", sans-serif`;
      const nm = PLAIN[p.key] || p.name;
      ctx.fillText(narrow ? nm.replace(/ \(.*\)/, "") : nm, x0 - 14, y + 4);
      const never = p.n_main == null, col = never ? "red" : p.n_main > 30 ? "orange" : "green", hex = COL[col];
      const target = never ? 10000 : p.n_main, nNow = Math.pow(10, Math.log10(target) * e), x = xs(nNow);
      ctx.strokeStyle = rgba(hex, 0.55); ctx.lineWidth = 2; if (never) ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(xs(1), y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.drawImage(SPR[col], x - 9, y - 9, 18, 18);
      if (tt >= 1) {
        ctx.textAlign = "left"; ctx.fillStyle = hex; ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillText(never ? "never" : "n = " + fmt(p.n_main), never ? x - 46 : x + 12, never ? y - 9 : y + 4);
      }
    });
    ctx.restore();
  }

  function drawWhy() {
    if (!whyReg) return;
    const xs = (z) => whyReg.x + (z + 3.4) / 6.8 * whyReg.w, top = whyReg.y - 26, bot = whyReg.y + whyReg.h + 6;
    ctx.save(); ctx.strokeStyle = "rgba(31,26,51,.45)"; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    [-1.96, 1.96].forEach((z) => { ctx.beginPath(); ctx.moveTo(xs(z), top + 10); ctx.lineTo(xs(z), bot); ctx.stroke(); });
    ctx.setLineDash([]); ctx.textAlign = "center";
    ctx.fillStyle = COL.cyan; ctx.font = `600 ${narrow ? 12 : 14}px "JetBrains Mono", monospace`;
    ctx.fillText("95% of repeated polls land here", xs(0), top);
    ctx.fillStyle = COL.coral; ctx.font = `600 ${narrow ? 11 : 12}px "JetBrains Mono", monospace`;
    ctx.fillText("2.5%", xs(-2.75), whyReg.y + whyReg.h - 30); ctx.fillText("2.5%", xs(2.75), whyReg.y + whyReg.h - 30);
    ctx.fillStyle = "rgba(31,26,51,.75)"; ctx.font = `600 ${narrow ? 12 : 13}px "JetBrains Mono", monospace`;
    ctx.fillText("← the “± 3%” →", xs(0), bot + 20);
    ctx.restore();
  }
  function drawSample() {
    if (!sample.length) return;
    const ph = sceneT - Math.floor(sceneT / 2.4) * 2.4, Rg = regions();
    const m = sample.reduce((a, i) => a + popVals[i], 0) / 5;
    const mx = Rg.popTop.x + clamp(m / 6, 0, 1) * Rg.popTop.w, my = Rg.popTop.y + Rg.popTop.h + 70;
    const a = ph < 0.15 ? ph / 0.15 : ph < 1.25 ? 1 : Math.max(0, 1 - (ph - 1.25) / 0.4);
    ctx.save(); ctx.globalAlpha = a * 0.55; ctx.strokeStyle = COL.coral; ctx.lineWidth = 1;
    sample.forEach((i) => { const p = P[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mx, my); ctx.stroke(); });
    ctx.globalAlpha = a; ctx.fillStyle = INK; ctx.font = '600 12px "JetBrains Mono", monospace'; ctx.textAlign = "left";
    ctx.fillText("average = " + m.toFixed(2), mx + 12, my + 4);
    ctx.restore();
  }
  function drawStrike(pr) {
    const t = clamp((pr - 0.3) / 0.25, 0, 1); if (t <= 0) return;
    const xa = B.x + B.w * 0.14, ya = B.y + B.h * 0.72, xb = B.x + B.w * 0.86, yb = B.y + B.h * 0.28;
    ctx.save(); ctx.strokeStyle = COL.coral; ctx.lineWidth = narrow ? 5 : 8; ctx.lineCap = "round"; ctx.shadowColor = "rgba(255,93,115,.4)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(lerp(xa, xb, easeOut(t)), lerp(ya, yb, easeOut(t))); ctx.stroke(); ctx.restore();
  }

  // ---------- HUD ----------
  function curveAt(key, n) {
    const c = SITE[key] && SITE[key].curve; if (!c) return null;
    let best = 0; c.n.forEach((v, i) => { if (Math.abs(Math.log(v / n)) < Math.abs(Math.log(c.n[best] / n))) best = i; });
    return { skew: c.skew[best], lower: c.lower[best], upper: c.upper[best], qq: c.qq[best], kurt: c.kurt ? c.kurt[best] : null };
  }
  function updateHud() {
    if (scene === 4) {
      const n = nAt(prog).n, r = curveAt("exponential", n), nMain = (SITE.exponential && SITE.exponential.n_main) || 71;
      const skew = r ? r.skew : 2 / Math.sqrt(n);
      const checks = r ? [
        [Math.abs(skew) <= 0.25, "Not lopsided", `${Math.abs(skew).toFixed(3)} <span class="dim">(0 = even, must be at most 0.25)</span>`],
        [r.kurt == null || Math.abs(r.kurt) <= 0.5, "Not too many far-out averages", ""],
        [r.qq >= 0.998, "Matches the bell outline", ""],
        [[r.lower, r.upper].every((t) => t >= 0.0175 && t <= 0.0325), "“95%” range catches 95%",
          `<span class="dim">misses ${(100 * r.lower).toFixed(1)}% low · ${(100 * r.upper).toFixed(1)}% high (2.5% each is right)</span>`]] : [];
      const all = checks.length && checks.every((c) => c[0]), ok = n >= nMain - 0.5;
      const verdict = ok ? "BELL CURVE: YES" : all ? "BELL CURVE: ALMOST" : "BELL CURVE: NOT YET";
      const marks = checks.map(([pass]) => `<i class="${pass ? "pass" : "fail"}">${pass ? "✓" : "✗"}</i>`).join("");
      hud.innerHTML = `<div class="row"><span>VALUES PER STUDY</span><span class="big">n = ${fmt(n)}</span></div>` +
        `<div class="marks">${marks}</div>` +
        checks.map(([pass, label, extra]) => `<div class="check ${pass ? "pass" : "fail"}"><span class="mark">${pass ? "✓" : "✗"}</span><span>${label}${extra ? "<br>" + extra : ""}</span></div>`).join("") +
        `<div class="verdict ${ok ? "ok" : ""}"><span class="dot"></span>${verdict}` +
        (!ok && all ? `<div class="dim" style="letter-spacing:0;margin-top:4px">All ✓ here, but they must stay ✓ for every bigger study too.</div>` : "") + `</div>`;
      hud.classList.add("show");
    } else if (scene === 6) {
      const n = Math.round(Math.pow(10, clamp(prog / 0.8, 0, 1) * Math.log10(5000)));
      hud.innerHTML = `<div class="row"><span>VALUES PER STUDY</span><span class="big">n = ${fmt(Math.max(1, n))}</span></div>
        <div class="row"><span>SPREAD OF THE AVERAGES</span><span class="val">unchanged</span></div>
        <div class="verdict"><span class="dot"></span>BELL CURVE: NEVER</div>`;
      hud.classList.add("show");
    } else hud.classList.remove("show");
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(dt) {
    if (scene !== lastScene) {
      sceneT = 0; lastScene = scene;
      document.querySelector(".stage").style.backgroundColor = TINT[scene] || TINT[0];
      if (scene !== 2) { cycle = -1; }
      if (scene === 2) { live = []; cycle = -1; }
    } else sceneT += dt;
    setTargets(dt);
    const kp = reduce ? 1 : 1 - Math.exp(-dt * 5.5), ka = reduce ? 1 : 1 - Math.exp(-dt * 4);
    chartAlpha = lerp(chartAlpha, scene === 5 ? 1 : 0, ka);
    curveAlpha = lerp(curveAlpha, scene === 4 ? 1 : 0, ka);

    ctx.clearRect(0, 0, W, H);
    const Rg = regions();
    if (scene >= 1 && scene <= 3) axis(scene === 1 ? Rg.popBig : Rg.popTop, 0, 6, "waiting time (minutes)", [0, 1, 2, 3, 4, 5, 6]);
    if ((scene === 2 || scene === 3 || scene === 4) && region) axis(region, range[0], range[1], scene === 4 ? `average of n = ${fmt(nAt(prog).n)} waiting times` : "average of 5 waiting times", scene === 4 ? niceTicks(range[0], range[1]) : [0, 1, 2, 3, 4, 5, 6]);
    if (scene === 6) axis(Rg.full, -8, 8, "average of n extreme-outlier values", [-8, -4, 0, 4, 8]);

    for (const p of P) {
      p.x += (p.tx - p.x) * kp; p.y += (p.ty - p.y) * kp; p.a += (p.ta - p.a) * ka; p.s += (p.ts - p.s) * ka;
      if (p.a < 0.01) continue;
      const r = p.s * 2.0;
      ctx.globalAlpha = p.a; ctx.drawImage(SPR[p.c], p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (curveAlpha > 0.01) drawCurve(scene === 4 ? nAt(prog).n : 200);
    if (chartAlpha > 0.01) drawChart(scene === 5 ? sceneT : 99);
    if (scene === 2) drawSample();
    if (scene === 8) drawWhy();
    if (scene === 7) drawStrike(prog);
    updateHud();
  }
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // testing helper: run the animation for `sec` seconds without waiting for the browser
  window.__story = { advance(sec) { for (let i = 0; i < sec * 60; i++) { readScroll(); frame(1 / 60); } } };
})();
