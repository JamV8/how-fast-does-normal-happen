// "How fast does normal happen?" — the interactive home page.
// Plain JavaScript + canvas. Numbers for the race and the challenge come from
// the R study (assets/data/site.json); real datasets from assets/data/real_data.json.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PAL = ["--purple", "--coral", "--yellow", "--teal", "--blue"].map(cssv);
  const INK = cssv("--ink"), INK2 = cssv("--ink2"), CORAL = cssv("--coral"), GREEN = cssv("--green");
  const rand = Math.random;
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  let spare = null;
  function rnorm() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rand();
    const v = rand(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
  }
  function qnorm(p) {   // Acklam's inverse normal CDF
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

  // ---------- canvas helpers ----------
  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: r.width, H: r.height };
  }
  function rrect(ctx, x, y, w, h, r) {
    if (h <= 0 || w <= 0) return;
    r = Math.min(r, w / 2, h);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  }
  function text(ctx, s, x, y, opt = {}) {
    ctx.font = `${opt.weight || 700} ${opt.size || 13}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = opt.color || INK2; ctx.textAlign = opt.align || "center"; ctx.textBaseline = opt.base || "alphabetic";
    ctx.fillText(s, x, y);
  }

  // ---------- one animation loop for everything that is on screen ----------
  const parts = [];
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const p of parts) if (p.visible || p.always) p.step(dt, now);
    requestAnimationFrame(loop);
  }
  function register(part, el) {
    parts.push(part);
    if (el) new IntersectionObserver((es) => es.forEach((e) => { part.visible = e.isIntersecting; if (e.isIntersecting && part.onShow) part.onShow(); }),
      { threshold: 0.05 }).observe(el);
  }
  window.addEventListener("resize", () => parts.forEach((p) => p.resize && p.resize()));
  window.__advance = (sec) => { const t = performance.now(); for (let i = 0; i < sec * 60; i++) for (const p of parts) p.step(1 / 60, t + i * 16.67); };
  window.__show = () => parts.forEach((p) => p.onShow && p.onShow());

  // ---------- confetti ----------
  const confetti = (() => {
    const cv = $("confetti"); let g = fit(cv), bits = [];
    const part = { always: true, resize() { g = fit(cv); },
      step(dt) {
        if (!bits.length) return;
        g.ctx.clearRect(0, 0, g.W, g.H);
        bits = bits.filter((b) => b.y < g.H + 20);
        for (const b of bits) {
          b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
          g.ctx.save(); g.ctx.translate(b.x, b.y); g.ctx.rotate(b.r); g.ctx.fillStyle = b.c; g.ctx.fillRect(-5, -3, 10, 6); g.ctx.restore();
        }
        if (!bits.length) g.ctx.clearRect(0, 0, g.W, g.H);
      } };
    register(part);
    return (x, y) => {
      for (let i = 0; i < 140; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.2, s = 350 + rand() * 520;
        bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand() * 6, vr: (rand() - 0.5) * 14, c: PAL[i % PAL.length] });
      }
    };
  })();
  const burstAt = (el) => { const r = el.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2); };

  // ---------- level dots + reveal text ----------
  const levels = [...document.querySelectorAll(".level")];
  const dots = $("dots");
  levels.forEach((s) => { const a = document.createElement("a"); a.href = "#" + s.id; a.title = "Level " + s.dataset.level; dots.appendChild(a); });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const i = levels.indexOf(e.target);
    [...dots.children].forEach((d, j) => d.classList.toggle("on", i === j));
    if (["level3", "level5"].includes(e.target.id)) { /* revealed by their own logic */ }
  }), { threshold: 0.45 });
  levels.forEach((s) => io.observe(s));
  const reveal = (id) => $(id) && $(id).classList.add("show");
  const ahaIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("show"); }), { threshold: 0.6 });
  ["#level3 .aha", "#level6 .aha"].forEach((q) => ahaIO.observe(document.querySelector(q)));

  // =====================================================================
  // HERO: Galton board — balls bounce left/right and pile into a bell
  // =====================================================================
  (function galton() {
    const cv = $("galton"); let g, rows = 12, balls = [], bins, disp, acc = 0, geo;
    function layout() {
      g = fit(cv);
      const dx = Math.min(g.W / (rows + 4), 38), pegTop = 26, rowGap = (g.H * 0.5 - pegTop) / rows;
      geo = { dx, pegTop, rowGap, x0: g.W / 2, binTop: pegTop + rows * rowGap + 14, base: g.H - 8 };
      if (!bins) {
        bins = new Array(rows + 1).fill(0);
        for (let i = 0; i < 160; i++) { let k = 0; for (let r = 0; r < rows; r++) if (rand() < 0.5) k++; bins[k]++; }
        disp = bins.slice();
      }
    }
    layout();
    const pmf = []; { let c = 1; for (let k = 0; k <= rows; k++) { pmf.push(c / 2 ** rows); c = c * (rows - k) / (k + 1); } }
    const part = { always: false, resize: layout,
      step(dt) {
        const { ctx, W, H } = g, { dx, pegTop, rowGap, x0, binTop, base } = geo;
        acc += dt; while (acc > 0.07) { acc -= 0.07; balls.push({ x: x0, y: -6, tx: x0, row: 0, k: 0, c: PAL[(rand() * PAL.length) | 0] }); }
        for (const b of balls) {
          b.y += rowGap * 9 * dt;
          while (b.row < rows && b.y >= pegTop + b.row * rowGap) { if (rand() < 0.5) b.k++; b.row++; b.tx = x0 + (b.k - b.row / 2) * dx; }
          b.x += (b.tx - b.x) * Math.min(1, dt * 16);
          if (b.row >= rows && b.y > binTop) { bins[b.k]++; b.dead = true; }
        }
        balls = balls.filter((b) => !b.dead);
        const mx = Math.max(...bins);
        if (mx > 90) bins = bins.map((c) => c * 0.6);
        for (let i = 0; i <= rows; i++) disp[i] = lerp(disp[i], bins[i], Math.min(1, dt * 10));
        // draw
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#cdbfe9";
        for (let r = 0; r < rows; r++) for (let j = 0; j <= r; j++) { ctx.beginPath(); ctx.arc(x0 + (j - r / 2) * dx, pegTop + r * rowGap + 6, 4, 0, 7); ctx.fill(); }
        const scale = (base - binTop) / Math.max(40, Math.max(...disp) * 1.1);
        for (let k = 0; k <= rows; k++) {
          const x = x0 + (k - rows / 2) * dx; ctx.fillStyle = PAL[k % PAL.length];
          rrect(ctx, x - dx * 0.42, base - disp[k] * scale, dx * 0.84, disp[k] * scale, 8);
        }
        // the bell the bars are heading for
        const tot = disp.reduce((a, b) => a + b, 0);
        if (tot > 20) {
          ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.setLineDash([2, 7]); ctx.lineCap = "round"; ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const z = -rows / 2 - 0.5 + (rows + 1) * i / 120, x = x0 + z * dx;
            const y = base - tot * dnorm(z, 0, Math.sqrt(rows) / 2) * scale;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
        for (const b of balls) { ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, 7.5, 0, 7); ctx.fill(); }
      } };
    register(part, cv);
  })();

  // =====================================================================
  // LEVELS 1 & 2: roll dice, balls fall into a histogram of averages
  // =====================================================================
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function makeDie(parent) {
    const d = document.createElement("div"); d.className = "die";
    for (let i = 0; i < 9; i++) d.appendChild(document.createElement("i"));
    parent.appendChild(d); return d;
  }
  function setFace(d, f) { [...d.children].forEach((p, i) => p.classList.toggle("on", PIPS[f].includes(i))); }

  function diceGame(cfg) {
    const k = cfg.k, nb = 5 * k + 1, counts = new Array(nb).fill(0), disp = new Array(nb).fill(0);
    const dice = Array.from({ length: k }, () => makeDie($(cfg.dice)));
    dice.forEach((d) => setFace(d, 1 + ((rand() * 6) | 0)));
    const cv = $(cfg.canvas); let g = fit(cv), balls = [], total = 0, queue = 0, qAcc = 0;
    const L = 20, R = 20, T = 40, B = 34;
    const binX = (i) => L + (i + 0.5) * (g.W - L - R) / nb;
    function result(fast) {
      const faces = dice.map(() => 1 + ((rand() * 6) | 0)), sum = faces.reduce((a, b) => a + b, 0);
      if (fast) dice.forEach((d, i) => setFace(d, faces[i]));
      else dice.forEach((d, i) => {
        d.classList.remove("rolling"); void d.offsetWidth; d.classList.add("rolling");
        let t = 0; const iv = setInterval(() => { setFace(d, 1 + ((rand() * 6) | 0)); if (++t > 6) { clearInterval(iv); setFace(d, faces[i]); } }, 60);
      });
      const avg = sum / k;
      const land = () => {
        $(cfg.readout).textContent = k === 1 ? `You rolled a ${faces[0]}` : `${faces.join(" + ")}  →  average ${avg % 1 ? avg.toFixed(1) : avg}`;
        balls.push({ bin: sum - k, t: 0, dur: fast ? 0.35 : 0.6, c: PAL[(rand() * PAL.length) | 0] });
      };
      if (fast) land(); else setTimeout(land, 430);
    }
    $(cfg.roll).addEventListener("click", () => result(false));
    $(cfg.roll100).addEventListener("click", () => { queue += 100; });
    const part = { resize() { g = fit(cv); },
      step(dt) {
        if (queue > 0) { qAcc += dt; while (qAcc > 0.028 && queue > 0) { qAcc -= 0.028; queue--; result(true); } }
        const { ctx, W, H } = g;
        for (const b of balls) { b.t += dt / b.dur; if (b.t >= 1 && !b.done) { b.done = true; counts[b.bin]++; total++; } }
        balls = balls.filter((b) => !b.done);
        const mx = Math.max(6, ...counts);
        for (let i = 0; i < nb; i++) disp[i] = lerp(disp[i], counts[i], Math.min(1, dt * 12));
        $(cfg.count).textContent = `${fmt(total)} roll${total === 1 ? "" : "s"}`;
        if (total >= 40) $(cfg.aha).classList.add("show");
        ctx.clearRect(0, 0, W, H);
        const bw = (W - L - R) / nb, sc = (H - T - B) / (mx * 1.12);
        for (let i = 0; i < nb; i++) {
          const h = disp[i] * sc; ctx.fillStyle = cfg.color; rrect(ctx, binX(i) - bw * 0.42, H - B - h, bw * 0.84, h, 7);
        }
        ctx.fillStyle = "#e9e1d4"; ctx.fillRect(L, H - B, W - L - R, 3);
        for (let i = 0; i < nb; i++) {
          const v = (i + k) / k, whole = Math.abs(v - Math.round(v)) < 1e-9;
          if (whole || nb <= 6) text(ctx, whole ? String(Math.round(v)) : v.toFixed(1), binX(i), H - 10, { size: whole ? 15 : 11, color: whole ? INK : INK2 });
        }
        for (const b of balls) {
          const t = Math.min(b.t, 1), x = lerp(W / 2, binX(b.bin), 1 - (1 - t) ** 2), y = lerp(4, H - B - disp[b.bin] * sc - 9, t * t);
          ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
        }
      } };
    register(part, cv);
  }
  diceGame({ k: 1, dice: "l1-dice", roll: "l1-roll", roll100: "l1-roll100", canvas: "l1-hist", count: "l1-count", readout: "l1-readout", aha: "l1-aha", color: cssv("--yellow") });
  diceGame({ k: 2, dice: "l2-dice", roll: "l2-roll", roll100: "l2-roll100", canvas: "l2-hist", count: "l2-count", readout: "l2-readout", aha: "l2-aha", color: cssv("--teal") });

  // =====================================================================
  // LEVEL 3: slide the number of dice; the histogram morphs into a bell
  // =====================================================================
  let DIE_N = 8;   // replaced by the study's answer when site.json loads
  (function level3() {
    const cv = $("l3-hist"); let g = fit(cv);
    const N = 20000, lo = 0.5, hi = 6.5;
    let k = 1, centers = [], target = [], disp = [], unlocked = false, w = 1;
    const sd1 = Math.sqrt(35 / 12);
    function compute() {
      const nb = 5 * k + 1; w = 1 / k;
      const counts = new Array(nb).fill(0);
      for (let s = 0; s < N; s++) { let sum = 0; for (let j = 0; j < k; j++) sum += 1 + ((rand() * 6) | 0); counts[sum - k]++; }
      const newC = counts.map((_, i) => (i + k) / k);
      const old = disp.slice(), oldC = centers.slice();
      // start the morph from the old shape, read off at the new bar positions
      disp = newC.map((x) => {
        if (!oldC.length) return 0;
        let j = 0; while (j < oldC.length - 1 && oldC[j + 1] < x) j++;
        if (x <= oldC[0] || x >= oldC[oldC.length - 1]) return 0;
        const t = (x - oldC[j]) / (oldC[j + 1] - oldC[j]); return lerp(old[j], old[j + 1], t);
      });
      centers = newC; target = counts.map((c) => c / (N * w));
    }
    function setK(v) {
      k = v; $("l3-k").textContent = k; $("l3-unit").textContent = k === 1 ? "die" : "dice";
      const mini = $("l3-mini"); mini.innerHTML = "";
      for (let i = 0; i < k; i++) { const s = document.createElement("span"); s.textContent = 1 + ((rand() * 6) | 0); s.style.animationDelay = (i * 12) + "ms"; mini.appendChild(s); }
      compute();
      if (k >= DIE_N && !unlocked) { unlocked = true; $("l3-badge").classList.add("show"); burstAt($("l3-badge")); }
    }
    $("l3-slider").addEventListener("input", (e) => setK(+e.target.value));
    setK(1);
    const part = { resize() { g = fit(cv); },
      step(dt) {
        const { ctx, W, H } = g, L = 20, R = 20, T = 60, B = 34;
        for (let i = 0; i < disp.length; i++) disp[i] = lerp(disp[i], target[i], Math.min(1, dt * 7));
        const xs = (x) => L + (x - lo) / (hi - lo) * (W - L - R);
        const se = sd1 / Math.sqrt(k), peak = Math.max(dnorm(3.5, 3.5, se), ...target);
        const ys = (d) => (H - B) - d / (peak * 1.1) * (H - T - B);
        ctx.clearRect(0, 0, W, H);
        const bw = Math.max(1.5, (xs(lo + w) - xs(lo)) * 0.84);
        for (let i = 0; i < disp.length; i++) {
          ctx.fillStyle = PAL[Math.round(clamp((centers[i] - 1) / 5, 0, 1) * 4)] || PAL[0];
          ctx.globalAlpha = 0.9; rrect(ctx, xs(centers[i]) - bw / 2, ys(disp[i]), bw, (H - B) - ys(disp[i]), Math.min(7, bw / 2)); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "#e9e1d4"; ctx.fillRect(L, H - B, W - L - R, 3);
        for (let v = 1; v <= 6; v++) text(ctx, String(v), xs(v), H - 10, { size: 15, color: INK });
        // the bell curve: faint until unlocked, glowing after
        ctx.lineWidth = unlocked ? 4 : 2.5; ctx.strokeStyle = CORAL; ctx.setLineDash(k >= DIE_N ? [] : [6, 6]);
        ctx.shadowColor = unlocked && k >= DIE_N ? CORAL : "transparent"; ctx.shadowBlur = 12;
        ctx.beginPath();
        for (let i = 0; i <= 300; i++) { const x = lo + (hi - lo) * i / 300, y = ys(dnorm(x, 3.5, se)); i ? ctx.lineTo(xs(x), y) : ctx.moveTo(xs(x), y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
        text(ctx, k >= DIE_N ? "🔔 bell curve" : "bell curve (not yet…)", xs(3.5), T - 22, { size: 15, color: CORAL });
      } };
    register(part, cv);
  })();

  // =====================================================================
  // LEVEL 4: the Average Machine
  // =====================================================================
  const STD = { max_abs_skew: 0.25, max_abs_kurt: 0.5, min_qq_cor: 0.998, tail_min: 0.0175, tail_max: 0.0325 };
  let SITE = {};
  const binomPmf = [0.59049, 0.32805, 0.0729, 0.0081, 0.00045, 0.00001];
  const POP = {
    exponential: { emo: "⏱️", nm: "Waiting times", mu: 1, sigma: 1, draw: () => -Math.log(1 - rand()), range: [0, 5], sup: [0, Infinity] },
    diamonds: { emo: "💎", nm: "Diamond prices", real: true },
    flights: { emo: "✈️", nm: "Flight delays", real: true },
    faithful: { emo: "🌋", nm: "Geyser waits", real: true },
    counties: { emo: "🏙️", nm: "County sizes", real: true },
    binomial: { emo: "🎯", nm: "Rare events", mu: 0.5, sigma: Math.sqrt(0.45), step: 1, range: [-0.5, 5.5], sup: [0, 5],
      draw: () => { let c = 0; for (let i = 0; i < 5; i++) if (rand() < 0.1) c++; return c; } },
    die: { emo: "🎲", nm: "Dice", mu: 3.5, sigma: Math.sqrt(35 / 12), step: 1, range: [0.5, 6.5], sup: [1, 6], draw: () => 1 + ((rand() * 6) | 0) },
    cauchy: { emo: "☄️", nm: "Chaos", mu: null, sigma: null, range: [-8, 8], sup: [-Infinity, Infinity], draw: () => Math.tan(Math.PI * (rand() - 0.5)) },
  };
  const ORDER = ["exponential", "diamonds", "flights", "faithful", "counties", "binomial", "die", "cauchy"];

  function popHist(P, k) {   // bars describing the population, for the cards and the machine
    const [lo, hi] = P.range, cnt = new Array(k).fill(0);
    if (P.step) { const xs = []; for (let v = Math.ceil(lo); v <= hi; v++) xs.push(v); return { lo, hi, bars: xs.map((v) => ({ x: v, h: P.pmf(v) })), discrete: true }; }
    const n = P.real ? P.values.length : 30000;
    for (let i = 0; i < n; i++) { const v = P.real ? P.values[i] : P.draw(); const j = Math.floor((v - lo) / (hi - lo) * k); if (j >= 0 && j < k) cnt[j]++; }
    return { lo, hi, bars: cnt.map((c, j) => ({ x: lo + (j + 0.5) * (hi - lo) / k, h: c })), discrete: false };
  }
  POP.binomial.pmf = (v) => binomPmf[v] || 0; POP.die.pmf = (v) => (v >= 1 && v <= 6 ? 1 / 6 : 0);

  function level4(real) {
    for (const key of ["diamonds", "flights", "faithful", "counties"]) {
      const d = real[key], v = Float64Array.from(d.values), s = Float64Array.from(v).sort();
      Object.assign(POP[key], { mu: d.mu, sigma: d.sigma, values: v, draw: () => v[(rand() * v.length) | 0],
        range: [s[Math.floor(0.005 * s.length)], s[Math.floor(0.99 * s.length)]], sup: [s[0], s[s.length - 1]] });
    }
    const best = {};
    let cur = "exponential", n = 5, means = null, count = 0, targetB = 0, runId = 0, hist = null, ph = null, done = false;
    const cards = $("l4-cards");
    ORDER.forEach((key) => {
      const P = POP[key], c = document.createElement("div"); c.className = "card"; c.dataset.key = key;
      c.innerHTML = `<div class="emo">${P.emo}</div><div class="nm">${P.nm}</div><canvas></canvas><div class="done"></div>`;
      c.addEventListener("click", () => select(key));
      cards.appendChild(c);
      requestAnimationFrame(() => {
        const g = fit(c.querySelector("canvas")), h = popHist(P, 24), mx = Math.max(...h.bars.map((b) => b.h));
        const bw = g.W / h.bars.length;
        h.bars.forEach((b, i) => { g.ctx.fillStyle = CORAL; g.ctx.globalAlpha = 0.75; rrect(g.ctx, i * bw + 1, g.H - b.h / mx * g.H, bw - 2, b.h / mx * g.H, 3); });
      });
    });
    // gauge + lights
    const gauge = $("l4-gauge");
    gauge.innerHTML = `
      <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#f3dfe3" stroke-width="22" stroke-linecap="round"/>
      <path d="M20 110 A90 90 0 0 1 110 20" fill="none" stroke="#ffd2d9" stroke-width="22" stroke-linecap="round"/>
      <path d="M110 20 A90 90 0 0 1 200 110" fill="none" stroke="#bdf0cf" stroke-width="22" stroke-linecap="round"/>
      <text x="200" y="128" text-anchor="end" font-family="Plus Jakarta Sans" font-size="13" fill="#2b9a55">bell!</text>
      <text x="20" y="128" text-anchor="start" font-family="Plus Jakarta Sans" font-size="13" fill="#c0475b">nope</text>
      <g id="needle" style="transform-origin:110px 110px; transition: transform .9s cubic-bezier(.3,1.5,.5,1); transform: rotate(-90deg)">
        <line x1="110" y1="110" x2="110" y2="32" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      </g>
      <circle cx="110" cy="110" r="11" fill="${INK}"/>`;
    const LIGHTS = [["skew", "Balanced"], ["kurt", "No wild values"], ["qq", "Smooth shape"], ["tail", "Fair tails"]];
    $("l4-lights").innerHTML = LIGHTS.map(([k, l]) => `<div class="light" id="lt-${k}"><b></b>${l}</div>`).join("");

    const sliderToN = (v) => Math.max(1, Math.round(Math.pow(10, v / 1000 * Math.log10(3000))));
    const nToSlider = (x) => Math.round(Math.log10(x) / Math.log10(3000) * 1000);
    $("l4-slider").addEventListener("input", (e) => { setN(sliderToN(+e.target.value)); });
    $("l4-try30").addEventListener("click", () => { $("l4-slider").value = nToSlider(30); setN(30); });

    function select(key) {
      cur = key;
      [...cards.children].forEach((c) => c.classList.toggle("on", c.dataset.key === key));
      ph = popHist(POP[key], 40);
      restart(); challenge();
    }
    function setN(v) { n = v; $("l4-n").textContent = fmt(n); restart(); }
    function histRange() {
      const P = POP[cur];
      if (P.mu == null) return [-10, 10];
      const se = P.sigma / Math.sqrt(n);
      return [Math.max(P.mu - 4.3 * se, P.sup[0] - (P.step ? 0.5 : 0)), Math.min(P.mu + 4.3 * se, P.sup[1] + (P.step ? 0.5 : 0))];
    }
    function restart() {
      runId++; done = false; count = 0;
      targetB = Math.max(4000, Math.min(100000, Math.floor(30e6 / n))); means = new Float64Array(targetB);   // same B as the R study when possible
      let [lo, hi] = histRange(); const P = POP[cur];
      let nb = 46, lat = P.step ? P.step / n : null;
      if (lat && (hi - lo) / lat <= 70) { lo = Math.floor(lo / lat) * lat - lat / 2; nb = Math.ceil((hi - lo) / lat); hi = lo + nb * lat; }
      const prev = hist;
      hist = { lo, hi, nb, cnt: new Array(nb).fill(0), disp: new Array(nb).fill(0) };
      if (prev) hist.disp = hist.disp.map(() => 0);
      setVerdict(null);
    }
    function compute() {
      const P = POP[cur], t0 = performance.now();
      while (count < targetB && performance.now() - t0 < 12) {
        let s = 0; for (let i = 0; i < n; i++) s += P.draw();
        const m = s / n; means[count++] = m;
        const j = Math.floor((m - hist.lo) / (hist.hi - hist.lo) * hist.nb);
        if (j >= 0 && j < hist.nb) hist.cnt[j]++;
      }
      if (count >= targetB && !done) { done = true; judge(); }
    }
    function judge() {
      const P = POP[cur], c = count, a = means;
      let sum = 0; for (let i = 0; i < c; i++) sum += a[i];
      const mean = sum / c; let m2 = 0, m3 = 0, m4 = 0;
      for (let i = 0; i < c; i++) { const d = a[i] - mean, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
      m2 /= c; m3 /= c; m4 /= c;
      const sd = Math.sqrt(m2), skew = m3 / m2 ** 1.5, kurt = m4 / (m2 * m2) - 3;
      const ctr = P.mu == null ? mean : P.mu, spr = P.sigma == null ? sd : P.sigma / Math.sqrt(n);
      let lo = 0, hi = 0; for (let i = 0; i < c; i++) { if (a[i] < ctr - 1.96 * spr) lo++; else if (a[i] > ctr + 1.96 * spr) hi++; }
      lo /= c; hi /= c;
      const sorted = Float64Array.from(a.subarray(0, c)).sort();
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < c; i++) { const x = qnorm((i + 0.5) / c), y = sorted[i]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
      const r = (c * sxy - sx * sy) / Math.sqrt((c * sxx - sx * sx) * (c * syy - sy * sy));
      const tailDev = Math.max(Math.abs(lo - 0.025), Math.abs(hi - 0.025));
      const bad = { skew: Math.abs(skew) / STD.max_abs_skew, kurt: Math.abs(kurt) / STD.max_abs_kurt,
                    qq: (1 - r) / (1 - STD.min_qq_cor), tail: tailDev / (0.025 - STD.tail_min) };
      setVerdict(bad);
    }
    function setVerdict(bad) {
      const needle = document.getElementById("needle");
      if (!bad) {
        needle.style.transform = "rotate(-90deg)"; $("l4-verdict").textContent = "Mixing…";
        ["skew", "kurt", "qq", "tail"].forEach((k) => $("lt-" + k).className = "light");
        return;
      }
      const worst = Math.max(...Object.values(bad)), score = 100 / (1 + worst), pass = worst <= 1;
      needle.style.transform = `rotate(${-90 + score * 1.8}deg)`;
      ["skew", "kurt", "qq", "tail"].forEach((k) => $("lt-" + k).className = "light " + (bad[k] <= 1 ? "ok" : "no"));
      $("l4-verdict").textContent = pass ? "🔔 Ding! It’s a bell" : cur === "cauchy" ? "☄️ Never a bell" : "Not a bell yet";
      if (pass && (!best[cur] || n < best[cur])) {
        const first = !best[cur]; best[cur] = n;
        const card = cards.querySelector(`[data-key=${cur}] .done`); card.textContent = `✓ n = ${fmt(n)}`;
        if (first) burstAt($("l4-gauge"));
      }
      if (cur === "cauchy" && n >= 1000) best.cauchyTried = true;
      challenge();
    }
    function challenge() {
      const s = SITE[cur], el = $("l4-challenge");
      if (cur === "cauchy") {
        el.innerHTML = best.cauchyTried ? "☄️ Chaos never rings the bell. The study tried up to n = 5,000. Averaging doesn’t tame it."
          : "Can you make <b>Chaos</b> ring the bell? Try a <i>huge</i> n.";
        return;
      }
      if (!best[cur]) { el.innerHTML = `Find the <b>smallest n</b> that rings the bell for <b>${POP[cur].nm.toLowerCase()}</b>.`; return; }
      const study = s && s.n_main;
      const stars = study ? (best[cur] <= study * 1.25 ? "⭐⭐⭐" : best[cur] <= study * 2 ? "⭐⭐" : "⭐") : "";
      el.innerHTML = `Your best: <b>n = ${fmt(best[cur])}</b> ${stars} &nbsp;·&nbsp; the study’s answer: <span class="gold">n = ${study ? fmt(study) : "?"}</span>` +
        (best[cur] > (study || 0) * 1.25 ? " &nbsp;·&nbsp; can you go lower?" : "");
    }

    // ---- drawing: population → funnel → histogram of averages ----
    const cv = $("l4-canvas"); let g = fit(cv), sparks = [], drops = [], spawnAcc = 0;
    function zones() {
      const narrow = g.W < 640;
      return narrow ? { pop: [12, g.W * 0.36], fx: g.W * 0.45, hist: [g.W * 0.52, g.W - 10] }
                    : { pop: [16, g.W * 0.28], fx: g.W * 0.355, hist: [g.W * 0.42, g.W - 16] };
    }
    const part = { resize() { g = fit(cv); },
      onShow() { if (!ph) select("exponential"); },
      step(dt) {
        if (!hist || !ph) return;
        compute();
        const { ctx, W, H } = g, Z = zones(), base = H - 34, top = 46, P = POP[cur], narrow = W < 640, fw = narrow ? 20 : 34;
        ctx.clearRect(0, 0, W, H);
        // population
        const pmx = Math.max(...ph.bars.map((b) => b.h)), pxs = (x) => Z.pop[0] + (x - ph.lo) / (ph.hi - ph.lo) * (Z.pop[1] - Z.pop[0]);
        const pbw = (Z.pop[1] - Z.pop[0]) / ph.bars.length;
        ph.bars.forEach((b) => { const h = b.h / pmx * (base - top - 30); ctx.fillStyle = "#c9bfb0"; rrect(ctx, pxs(b.x) - (ph.discrete ? pbw * 0.3 : pbw * 0.45), base - h, ph.discrete ? pbw * 0.6 : pbw * 0.9, h, 4); });
        text(ctx, narrow ? "population" : `${P.emo} the population`, (Z.pop[0] + Z.pop[1]) / 2, top - 18, { size: narrow ? 13 : 15, color: INK });
        // funnel
        ctx.fillStyle = "#ffe1e6"; ctx.beginPath();
        ctx.moveTo(Z.fx - fw, top + 30); ctx.lineTo(Z.fx + fw, top + 30); ctx.lineTo(Z.fx + 7, top + 100); ctx.lineTo(Z.fx - 7, top + 100); ctx.closePath(); ctx.fill();
        text(ctx, "average", Z.fx, top + 125, { size: 13, color: CORAL });
        text(ctx, `${fmt(n)} in`, Z.fx, top + 18, { size: 13, color: INK2 });
        // histogram of averages
        const hx = (x) => Z.hist[0] + (x - hist.lo) / (hist.hi - hist.lo) * (Z.hist[1] - Z.hist[0]);
        const w = (hist.hi - hist.lo) / hist.nb, dens = hist.cnt.map((c) => count ? c / (count * w) : 0);
        let peak = Math.max(...dens, 1e-9);
        const se = P.sigma == null ? null : P.sigma / Math.sqrt(n);
        if (se) peak = Math.max(peak, dnorm(P.mu, P.mu, se)); else peak = Math.max(peak, 1 / Math.PI);
        const ys = (d) => base - d / (peak * 1.12) * (base - top);
        const bw = (Z.hist[1] - Z.hist[0]) / hist.nb;
        for (let i = 0; i < hist.nb; i++) {
          hist.disp[i] = lerp(hist.disp[i], dens[i], Math.min(1, dt * 10));
          ctx.fillStyle = PAL[i % 2 ? 4 : 3]; ctx.globalAlpha = 0.85;
          rrect(ctx, Z.hist[0] + i * bw + 0.8, ys(hist.disp[i]), Math.max(bw - 1.6, 1), base - ys(hist.disp[i]), Math.min(5, bw / 2));
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "#e9e1d4"; ctx.fillRect(Z.hist[0], base, Z.hist[1] - Z.hist[0], 3);
        [hist.lo, (hist.lo + hist.hi) / 2, hist.hi].forEach((v, i) => text(ctx, niceNum(v), hx(v), base + 20, { size: 12, align: ["left", "center", "right"][i] }));
        text(ctx, narrow ? "averages" : "averages of the samples", (Z.hist[0] + Z.hist[1]) / 2, top - 18, { size: narrow ? 13 : 15, color: INK });
        if (se) {
          ctx.strokeStyle = CORAL; ctx.lineWidth = 3.5; ctx.beginPath();
          for (let i = 0; i <= 240; i++) { const x = hist.lo + (hist.hi - hist.lo) * i / 240, y = ys(dnorm(x, P.mu, se)); i ? ctx.lineTo(hx(x), y) : ctx.moveTo(hx(x), y); }
          ctx.stroke();
        } else text(ctx, "no bell curve exists for chaos", (Z.hist[0] + Z.hist[1]) / 2, top + 4, { size: 13, color: CORAL });
        // sparks: a few sample values fly into the funnel, then their average drops into the histogram
        spawnAcc += dt;
        if (spawnAcc > 0.55) {
          spawnAcc = 0;
          const m = Math.min(n, 12), vals = []; for (let i = 0; i < m; i++) vals.push(P.draw());
          let s = 0; for (let i = 0; i < n; i++) s += i < m ? vals[i] : P.draw();
          const avg = s / n;
          vals.forEach((v, i) => sparks.push({ x: pxs(clamp(v, ph.lo, ph.hi)), y: base - 10 - rand() * 60, t: -i * 0.04, avg: i === m - 1 ? avg : null }));
        }
        sparks.forEach((s) => {
          s.t += dt * 1.8; if (s.t < 0) return;
          const t = Math.min(s.t, 1), x = lerp(s.x, Z.fx, t), y = lerp(s.y, top + 34, t) - Math.sin(t * Math.PI) * 50;
          ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
          if (s.t >= 1 && s.avg != null) { drops.push({ v: s.avg, t: 0 }); s.avg = null; }
        });
        sparks = sparks.filter((s) => s.t < 1);
        drops.forEach((d) => {
          d.t += dt * 1.6; const t = Math.min(d.t, 1);
          const tx = hx(clamp(d.v, hist.lo, hist.hi)), x = lerp(Z.fx, tx, t), y = lerp(top + 100, base - 8, t * t) - Math.sin(t * Math.PI) * 40;
          ctx.fillStyle = cssv("--purple"); ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
        });
        drops = drops.filter((d) => d.t < 1);
      } };
    register(part, cv);
    window.__selectPop = select;
  }
  function niceNum(x) { const a = Math.abs(x); return a >= 1000 ? fmt(x) : a >= 10 ? x.toFixed(0) : a >= 1 ? x.toFixed(1) : x.toFixed(2); }

  // =====================================================================
  // LEVEL 5: the race to the bell curve
  // =====================================================================
  const RACERS = [
    ["normal", "🔔", "Bell curve"], ["die", "🎲", "Dice"], ["faithful", "🌋", "Geyser waits"], ["discoveries", "💡", "Inventions"],
    ["diamonds", "💎", "Diamond prices"], ["exponential", "⏱️", "Waiting times"], ["binomial", "🎯", "Rare events"],
    ["flights", "✈️", "Flight delays"], ["counties", "🏙️", "County sizes"], ["cauchy", "☄️", "Chaos"]];
  function level5() {
    const race = $("race"), pos = (n) => 4 + Math.log10(n) / 4 * 88;   // % of the track
    race.innerHTML = RACERS.map(([k, e, nm]) =>
      `<div class="lane"><div class="name">${e} ${nm}</div><div class="track"><span class="runner" id="run-${k}">${e}</span><span class="result" id="res-${k}"></span></div></div>`).join("") +
      `<div class="axis"><div></div><div class="ticks">${[1, 10, 30, 100, 1000, 10000].map((v) => `<span style="left:${pos(v)}%">${fmt(v)}</span>`).join("")}</div></div>`;
    const tracks = race.querySelectorAll(".track");
    const flag = document.createElement("div"); flag.className = "flagline"; race.appendChild(flag);
    function placeFlag() {
      const t = tracks[0].getBoundingClientRect(), r = race.getBoundingClientRect();
      flag.style.left = (t.left - r.left + t.width * pos(30) / 100) + "px"; flag.style.top = "16px";
      flag.innerHTML = `<span class="flag">🚩 30</span>`;
    }
    placeFlag(); window.addEventListener("resize", placeFlag);
    let t0 = null, running = false, played = false;
    const DUR = 6.5;
    function go() {
      running = true; played = true; t0 = performance.now(); $("race-verdict").classList.remove("show");
      RACERS.forEach(([k]) => { $("res-" + k).className = "result"; $("run-" + k).classList.remove("done"); $("run-" + k).style.opacity = 1; });
    }
    $("race-go").addEventListener("click", go);
    const part = {
      onShow() { if (!played) setTimeout(go, 400); },
      step(_, now) {
        if (!running) return;
        const p = Math.min(1.08, (now - t0) / 1000 / DUR), nNow = Math.pow(10, 4 * Math.min(p, 1));
        RACERS.forEach(([k]) => {
          const s = SITE[k], target = s ? s.n_main : null, el = $("run-" + k), res = $("res-" + k);
          if (target != null && nNow >= target) {
            el.style.left = pos(target) + "%";
            if (!res.classList.contains("show")) {
              res.textContent = "n = " + fmt(target); res.className = "result show " + (target <= 30 ? "good" : "bad");
              res.style.left = pos(target) + "%"; el.classList.add("done");
              res.classList.toggle("left", pos(target) > 62);   // keep the badge inside the track
            }
          } else {
            el.style.left = Math.min(pos(nNow), 99) + "%";
            if (k === "cauchy" && p >= 1) { res.textContent = "never ∞"; res.className = "result show never left"; res.style.left = "92%"; el.style.opacity = 0.35; }
          }
        });
        if (p >= 1.08) { running = false; $("race-verdict").classList.add("show"); }
      } };
    register(part, race);
  }

  // =====================================================================
  // LEVEL 6: polls land around the truth
  // =====================================================================
  (function level6() {
    const cv = $("l6-canvas"); let g = fit(cv), dots = [], stacks = {}, queue = 0, acc = 0, inside = 0, total = 0;
    const lo = 45, hi = 59, truth = 52, se = 100 * Math.sqrt(0.52 * 0.48 / 1000), moe = 1.96 * se, bin = 0.35;
    $("l6-go").addEventListener("click", () => { dots = []; stacks = {}; inside = 0; total = 0; queue = 100; });
    const part = { resize() { g = fit(cv); },
      step(dt) {
        const { ctx, W, H } = g, L = 20, R = 20, base = H - 34, xs = (x) => L + (x - lo) / (hi - lo) * (W - L - R);
        if (queue > 0) { acc += dt; while (acc > 0.05 && queue > 0) { acc -= 0.05; queue--;
          let yes = 0; for (let i = 0; i < 1000; i++) if (rand() < 0.52) yes++;
          const v = yes / 10, b = Math.round(v / bin), level = (stacks[b] = (stacks[b] || 0) + 1);
          const ok = Math.abs(v - truth) <= moe; dots.push({ x: b * bin, level, t: 0, ok }); total++; if (ok) inside++; } }
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#e3f8ea"; ctx.fillRect(xs(truth - moe), 20, xs(truth + moe) - xs(truth - moe), base - 20);
        text(ctx, `52% ± ${moe.toFixed(1)}%`, xs(truth), 40, { size: 16, color: "#1f8a4c" });
        ctx.fillStyle = "#e9e1d4"; ctx.fillRect(L, base, W - L - R, 3);
        for (let v = 46; v <= 58; v += 2) text(ctx, v + "%", xs(v), base + 22, { size: 13 });
        const r = Math.min(9, (W - L - R) / ((hi - lo) / bin) * 0.45);
        dots.forEach((d) => {
          d.t = Math.min(1, d.t + dt * 2.6);
          const y = lerp(10, base - r - (d.level - 1) * r * 2.1, d.t * d.t);
          ctx.fillStyle = d.ok ? GREEN : cssv("--red"); ctx.beginPath(); ctx.arc(xs(d.x), y, r, 0, 7); ctx.fill();
        });
        if (total) $("l6-readout").innerHTML = `<span style="color:#1f8a4c">${inside}</span> of ${total} polls landed inside the ± ${moe.toFixed(1)}% zone`;
      } };
    register(part, cv);
  })();

  // ---------- data, then start ----------
  Promise.all([fetch("assets/data/site.json").then((r) => r.json()), fetch("assets/data/real_data.json").then((r) => r.json())])
    .then(([site, real]) => {
      SITE = Object.fromEntries(site.populations.map((p) => [p.key, p]));
      if (SITE.die && SITE.die.n_main) DIE_N = SITE.die.n_main;
      Object.assign(STD, site.standards.main);
      level4(real); level5();
    })
    .catch(() => { level5(); });
  requestAnimationFrame(loop);
})();
