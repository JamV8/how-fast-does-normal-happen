// Interactive CLT simulator. Runs entirely in the browser.
// Same idea as the R study: B studies, each averaging n random values,
// judged by the same four checks (skewness, kurtosis, Q-Q correlation, tails).
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (x) => Math.round(x).toLocaleString("en-US");
  const MAX_DRAWS = 40e6;                 // keep the browser responsive

  // ---------- random numbers (seeded, reproducible) ----------
  let rand = Math.random, spare = null;
  function seedRng(seed) {
    let a = seed >>> 0;
    rand = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    spare = null;
  }
  function rnorm() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rand();
    const v = rand(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  // inverse standard normal CDF (Acklam's approximation)
  function qnorm(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const dnorm = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

  // ---------- populations ----------
  const binomPmf = [0, 1, 2, 3, 4, 5].map((k) => {
    const c = [1, 5, 10, 10, 5, 1][k]; return c * 0.1 ** k * 0.9 ** (5 - k);
  });
  const POPS = {
    normal: { name: "Normal", mu: 0, sigma: 1, desc: "The bell curve itself: the control case.",
      draw: () => rnorm(), shape: { type: "pdf", f: (x) => dnorm(x, 0, 1), from: -4, to: 4 }, support: [-Infinity, Infinity] },
    die: { name: "Six-sided die", mu: 3.5, sigma: Math.sqrt(35 / 12), step: 1, desc: "Values 1 to 6, all equally likely: flat, lumpy, but symmetric.",
      draw: () => 1 + Math.floor(6 * rand()), shape: { type: "pmf", x: [1, 2, 3, 4, 5, 6], p: [1, 1, 1, 1, 1, 1].map(() => 1 / 6) }, support: [1, 6] },
    exponential: { name: "Exponential", mu: 1, sigma: 1, desc: "Waiting times: mostly short, sometimes very long (skewness 2).",
      draw: () => -Math.log(1 - rand()), shape: { type: "pdf", f: (x) => Math.exp(-x), from: 0, to: 6 }, support: [0, Infinity] },
    binomial: { name: "Binomial (5, 0.1)", mu: 0.5, sigma: Math.sqrt(0.45), step: 1, desc: "Successes in 5 tries with a 10% chance each: usually 0.",
      draw: () => { let c = 0; for (let i = 0; i < 5; i++) if (rand() < 0.1) c++; return c; },
      shape: { type: "pmf", x: [0, 1, 2, 3, 4, 5], p: binomPmf }, support: [0, 5] },
    cauchy: { name: "Cauchy", mu: null, sigma: null, desc: "Looks like a bell, but extreme values are so common that it has no mean or variance.",
      draw: () => Math.tan(Math.PI * (rand() - 0.5)), shape: { type: "pdf", f: (x) => 1 / (Math.PI * (1 + x * x)), from: -8, to: 8 }, support: [-Infinity, Infinity] },
  };
  const REAL = {
    faithful: { name: "Geyser waits", desc: "Minutes between eruptions of Old Faithful (272 eruptions). Two humps: short and long waits." },
    discoveries: { name: "Inventions per year", step: 1, desc: "Number of great inventions each year, 1860–1959. Small whole-number counts." },
    diamonds: { name: "Diamond prices", desc: "Prices of 53,940 diamonds in US dollars. A few very expensive stones." },
    flights: { name: "Flight delays", desc: "Arrival delay of NYC flights in 2013, in minutes (a random 40,000 of 327,346 flights). Negative = early." },
    counties: { name: "County populations", desc: "Population of 437 Midwest counties. Cook County (Chicago) alone has 5.1 million." },
    rivers: { name: "River lengths", desc: "Lengths of the 141 longest rivers in North America, in miles." },
  };

  // ---------- state ----------
  const S = { pop: "exponential", n: 5, B: 100000, std: "main", seed: 9426, means: null, count: 0, target: 0,
              running: false, runId: 0, study: null, site: null, standards: null };

  Promise.all([fetch("assets/data/real_data.json").then((r) => r.json()),
               fetch("assets/data/site.json").then((r) => r.json())]).then(([real, site]) => {
    for (const k in REAL) {
      const d = real[k], v = Float64Array.from(d.values), len = v.length;
      const sorted = Float64Array.from(v).sort();
      const hiCut = sorted[Math.floor(0.99 * (len - 1))];
      POPS[k] = { ...REAL[k], mu: d.mu, sigma: d.sigma, real: true,
        draw: () => v[Math.floor(rand() * len)], values: v,
        shape: { type: "data", values: v, from: sorted[0], to: hiCut }, support: [sorted[0], sorted[len - 1]] };
    }
    S.site = Object.fromEntries(site.populations.map((p) => [p.key, p]));
    S.standards = site.standards;
    wire();
    selectPop("exponential");
    startRun();
  });

  // ---------- controls ----------
  const N_MAX = 5000;
  const sliderToN = (v) => Math.max(1, Math.round(Math.pow(10, v / 1000 * Math.log10(N_MAX))));
  const nToSlider = (n) => Math.round(Math.log10(n) / Math.log10(N_MAX) * 1000);

  function wire() {
    $("pop").addEventListener("change", (e) => { selectPop(e.target.value); startRun(); });
    $("n-slider").addEventListener("input", (e) => setN(sliderToN(+e.target.value), false));
    $("n-slider").addEventListener("change", () => startRun());
    $("n-input").addEventListener("change", (e) => { setN(Math.min(N_MAX, Math.max(1, Math.round(+e.target.value || 1))), true); startRun(); });
    $("b-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      $("b-seg").querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on");
      S.B = +b.dataset.b; startRun();
    }));
    $("std-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      $("std-seg").querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on");
      S.std = b.dataset.s; updateStats(true);
    }));
    $("seed").addEventListener("change", (e) => { S.seed = Math.round(+e.target.value) || 9426; startRun(); });
    $("run").addEventListener("click", () => startRun());
    $("one").addEventListener("click", oneStudy);
    $("reset").addEventListener("click", () => { cancel(); resetData(); drawAll(); });
  }

  function setN(n, moveSlider) {
    S.n = n;
    $("n-display").textContent = fmt(n);
    $("n-input").value = n;
    if (moveSlider) $("n-slider").value = nToSlider(n);
    updateQuick();
  }

  function selectPop(key) {
    S.pop = key;
    const P = POPS[key];
    $("pop-desc").textContent = P.desc;
    $("pop-sub").textContent = P.mu == null ? "No mean and no standard deviation exist."
      : `Mean ${nice(P.mu)}, standard deviation ${nice(P.sigma)}.`;
    drawPopulation();
    updateQuick();
    updateFound();
    setN(S.n, true);
  }

  function updateQuick() {
    const q = $("quick"); q.innerHTML = "";
    const site = S.site && S.site[S.pop];
    const opts = [[1, "n = 1"], [30, "n = 30"]];
    if (site && site.n_main) opts.push([site.n_main, `study's answer: ${fmt(site.n_main)}`]);
    if (S.pop === "cauchy") opts.push([1000, "n = 1,000"]);
    opts.forEach(([n, label]) => {
      const c = document.createElement("button"); c.className = "chip"; c.textContent = label;
      c.addEventListener("click", () => { setN(n, true); startRun(); });
      q.appendChild(c);
    });
  }

  function updateFound() {
    const site = S.site && S.site[S.pop], P = POPS[S.pop];
    let html;
    if (S.pop === "rivers") html = "Rivers were a warm-up example. The study found n = 30 is clearly not enough (skewness of the averages ≈ 0.58).";
    else if (!site) html = "";
    else if (site.n_main == null) html = `<b>No sample size works.</b> Even averages of 5,000 values were no more normal than single values. ${site.note}`;
    else html = `<b>${P.name}: n = ${fmt(site.n_main)}</b> under the main standard ` +
      `(strict: ${site.n_strict ? fmt(site.n_strict) : "beyond the tested range"}, lenient: ${fmt(site.n_lenient)}).` +
      (site.n_formula ? ` The skewness formula predicted ≈ ${fmt(site.n_formula)}.` : "") + `<br>${site.note}`;
    $("found").innerHTML = html;
  }

  // ---------- simulation ----------
  function resetData() {
    seedRng(S.seed);
    S.means = new Float64Array(S.B + 5000); S.count = 0; S.study = null;   // room for extra single studies
    S.target = Math.min(S.B, Math.floor(MAX_DRAWS / S.n));
    $("b-note").textContent = S.target < S.B
      ? `Reduced to ${fmt(S.target)} studies so the browser stays fast (n × B is capped).`
      : "The full study used 100,000 studies for every n.";
  }
  function cancel() { S.runId++; S.running = false; }

  function startRun() {
    cancel(); resetData();
    const id = S.runId; S.running = true;
    const P = POPS[S.pop], n = S.n;
    function frame() {
      if (id !== S.runId) return;
      const t0 = performance.now();
      while (S.count < S.target && performance.now() - t0 < 22) {
        const k = Math.min(S.target - S.count, Math.max(1, Math.floor(200000 / n)));
        for (let j = 0; j < k; j++) {
          let s = 0; for (let i = 0; i < n; i++) s += P.draw();
          S.means[S.count++] = s / n;
        }
      }
      drawHist(); updateStats(false);
      if (S.count < S.target) requestAnimationFrame(frame);
      else { S.running = false; updateStats(true); }
    }
    drawAll();
    requestAnimationFrame(frame);
  }

  function oneStudy() {
    cancel();
    if (!S.means || S.count >= S.means.length) resetData();
    const P = POPS[S.pop], vals = new Float64Array(S.n);
    let s = 0; for (let i = 0; i < S.n; i++) { vals[i] = P.draw(); s += vals[i]; }
    const m = s / S.n;
    S.means[S.count++] = m;
    S.study = { vals, mean: m };
    drawOne(); drawHist(); updateStats(true);
  }

  // ---------- statistics ----------
  function stats(final) {
    const c = S.count, a = S.means;
    if (c < 2) return null;
    let sum = 0; for (let i = 0; i < c; i++) sum += a[i];
    const mean = sum / c;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i < c; i++) { const d = a[i] - mean, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    m2 /= c; m3 /= c; m4 /= c;
    const sd = Math.sqrt(m2 * c / (c - 1));
    const P = POPS[S.pop];
    const center = P.mu == null ? mean : P.mu;
    const spread = P.sigma == null ? sd : P.sigma / Math.sqrt(S.n);
    let lo = 0, hi = 0;
    for (let i = 0; i < c; i++) { if (a[i] < center - 1.96 * spread) lo++; else if (a[i] > center + 1.96 * spread) hi++; }
    const out = { mean, sd, skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3, lower: lo / c, upper: hi / c, qq: null, sorted: null };
    if (final && c >= 20) {
      const sorted = Float64Array.from(a.subarray(0, c)).sort();
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < c; i++) {
        const x = qnorm((i + 0.5) / c), y = sorted[i];
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      out.qq = (c * sxy - sx * sy) / Math.sqrt((c * sxx - sx * sx) * (c * syy - sy * sy));
      out.sorted = sorted;
    }
    return out;
  }

  function updateStats(final) {
    $("counter").textContent = S.running ? `${fmt(S.count)} of ${fmt(S.target)} studies` : `${fmt(S.count)} studies`;
    const st = stats(final), std = S.standards[S.std];
    const tiles = [
      { k: "Skewness", v: st ? st.skew.toFixed(3) : "–", ok: st && Math.abs(st.skew) <= std.max_abs_skew, goal: `between ±${std.max_abs_skew}` },
      { k: "Excess kurtosis", v: st ? st.kurt.toFixed(3) : "–", ok: st && Math.abs(st.kurt) <= std.max_abs_kurt, goal: `between ±${std.max_abs_kurt}` },
      { k: "Q-Q straightness", v: st && st.qq != null ? st.qq.toFixed(4) : "–", ok: st && st.qq != null && st.qq >= std.min_qq_cor, goal: `r ≥ ${std.min_qq_cor}` },
      { k: "Tails (left / right)", v: st ? `${(100 * st.lower).toFixed(1)}% / ${(100 * st.upper).toFixed(1)}%` : "–",
        ok: st && [st.lower, st.upper].every((t) => t >= std.tail_min && t <= std.tail_max),
        goal: `each ${(100 * std.tail_min).toFixed(2)}–${(100 * std.tail_max).toFixed(2)}%` },
    ];
    const done = !S.running && st && st.qq != null && S.count >= Math.min(1000, S.target);
    $("score").innerHTML = tiles.map((t) => {
      const cls = !st || (t.k === "Q-Q straightness" && st.qq == null) ? "" : (t.ok ? "pass" : "fail");
      const badge = cls === "pass" ? "✓" : cls === "fail" ? "✗" : "";
      return `<div class="tile ${cls}"><span class="badge">${badge}</span><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="goal">target: ${t.goal}</div></div>`;
    }).join("");

    const box = $("verdict");
    if (!done) {
      box.className = "verdict-box idle";
      box.innerHTML = `<div class="icon">…</div><div><div class="t">${S.running ? "Simulating…" : "Run more studies to get a verdict"}</div><div class="d">The verdict needs at least 1,000 studies.</div></div>`;
    } else {
      const failed = tiles.filter((t) => !t.ok).map((t) => t.k.toLowerCase());
      if (!failed.length) {
        box.className = "verdict-box pass";
        box.innerHTML = `<div class="icon" style="color:var(--pass)">✓</div><div><div class="t">Normal enough at n = ${fmt(S.n)}</div><div class="d">All four checks pass under the ${S.std} standard. The bell curve can be trusted here.</div></div>`;
      } else {
        box.className = "verdict-box fail";
        const extra = S.pop === "cauchy" ? " For this population no n will work: try n = 1,000 and compare with n = 1."
          : " Try a larger n.";
        box.innerHTML = `<div class="icon" style="color:var(--fail)">✗</div><div><div class="t">Not normal enough at n = ${fmt(S.n)}</div><div class="d">Failed: ${failed.join(", ")}.${extra}</div></div>`;
      }
    }
    if (final) drawQQ(st);
  }

  // ---------- drawing helpers ----------
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function nice(x) {
    const a = Math.abs(x);
    if (a >= 1000) return fmt(x);
    if (a >= 10) return x.toFixed(1);
    return x.toFixed(2);
  }
  function axis(svg, x0, x1, y, lo, hi, W, ticks = 5) {
    svgEl("line", { x1: x0, x2: x1, y1: y, y2: y, stroke: "#c9ced8" }, svg);
    for (let i = 0; i <= ticks; i++) {
      const v = lo + (hi - lo) * i / ticks, x = x0 + (x1 - x0) * i / ticks;
      svgEl("line", { x1: x, x2: x, y1: y, y2: y + 4, stroke: "#c9ced8" }, svg);
      const t = svgEl("text", { x, y: y + 17, "text-anchor": "middle", "font-size": 12, fill: css("--muted") }, svg);
      t.textContent = nice(v);
    }
  }
  function popRange() {
    const P = POPS[S.pop], sh = P.shape;
    if (sh.type === "pmf") return [Math.min(...sh.x) - 0.5, Math.max(...sh.x) + 0.5];
    return [sh.from, sh.to];
  }

  function drawPopulation() {
    const svg = $("pop-chart"); clear(svg);
    const P = POPS[S.pop], sh = P.shape, W = 460, H = 200, L = 14, R = 14, T = 10, Bm = 30;
    const [lo, hi] = popRange();
    const xs = (x) => L + (x - lo) / (hi - lo) * (W - L - R);
    let bars = [];
    if (sh.type === "pmf") bars = sh.x.map((x, i) => ({ x0: x - 0.4, x1: x + 0.4, h: sh.p[i] }));
    else if (sh.type === "pdf") { const k = 60; for (let i = 0; i < k; i++) { const a = lo + (hi - lo) * i / k, b = lo + (hi - lo) * (i + 1) / k; bars.push({ x0: a, x1: b, h: sh.f((a + b) / 2) }); } }
    else {
      const k = 50, cnt = new Array(k).fill(0), v = sh.values;
      for (let i = 0; i < v.length; i++) { const j = Math.floor((v[i] - lo) / (hi - lo) * k); if (j >= 0 && j < k) cnt[j]++; }
      bars = cnt.map((c, i) => ({ x0: lo + (hi - lo) * i / k, x1: lo + (hi - lo) * (i + 1) / k, h: c }));
    }
    const ymax = Math.max(...bars.map((b) => b.h));
    bars.forEach((b) => {
      const h = b.h / ymax * (H - T - Bm);
      if (h <= 0) return;
      svgEl("rect", { x: xs(b.x0) + 0.5, width: Math.max(xs(b.x1) - xs(b.x0) - 1, 0.6), y: H - Bm - h, height: h, rx: 1.5, fill: "#9aa6b8" }, svg);
    });
    if (P.mu != null) {
      svgEl("line", { x1: xs(P.mu), x2: xs(P.mu), y1: T, y2: H - Bm, stroke: css("--ink"), "stroke-dasharray": "4 4" }, svg);
      const t = svgEl("text", { x: xs(P.mu) + 5, y: T + 12, "font-size": 12, fill: css("--ink") }, svg); t.textContent = "mean";
    }
    axis(svg, L, W - R, H - Bm, lo, hi, W, 4);
    if (P.real) { const t = svgEl("text", { x: W - R, y: T + 12, "text-anchor": "end", "font-size": 11, fill: css("--muted") }, svg); t.textContent = "top 1% not shown"; }
  }

  function drawOne() {
    const svg = $("one-chart"); clear(svg);
    const W = 460, H = 200, L = 14, R = 14, Bm = 30;
    const [lo, hi] = popRange();
    const xs = (x) => L + (Math.min(Math.max(x, lo), hi) - lo) / (hi - lo) * (W - L - R);
    axis(svg, L, W - R, H - Bm, lo, hi, W, 4);
    if (!S.study) return;
    const v = S.study.vals, show = Math.min(v.length, 300);
    for (let i = 0; i < show; i++) {
      const y = 40 + (i * 37 % 100);
      svgEl("circle", { cx: xs(v[i]), cy: y, r: show > 100 ? 3 : 5, fill: css("--bars"), opacity: 0.75 }, svg);
    }
    const mx = xs(S.study.mean);
    svgEl("line", { x1: mx, x2: mx, y1: 22, y2: H - Bm, stroke: css("--bell"), "stroke-width": 3 }, svg);
    const t = svgEl("text", { x: Math.min(mx + 6, W - 120), y: 18, "font-size": 13, "font-weight": 700, fill: css("--bell") }, svg);
    t.textContent = `average = ${nice(S.study.mean)}`;
    $("one-sub").textContent = `${fmt(v.length)} random values${v.length > show ? " (first 300 shown)" : ""} and their average, which becomes one more bar in the chart below.`;
  }

  function histRange() {
    const P = POPS[S.pop], n = S.n;
    if (P.mu == null) return [-10, 10];
    const se = P.sigma / Math.sqrt(n);
    let lo = Math.max(P.mu - 4.5 * se, P.support[0]), hi = Math.min(P.mu + 4.5 * se, P.support[1]);
    return [lo, hi];
  }

  function drawHist() {
    const svg = $("hist-chart"); clear(svg);
    const P = POPS[S.pop], W = 960, H = 330, L = 20, R = 20, T = 14, Bm = 34;
    let [lo, hi] = histRange();
    // lattice-aligned bins for discrete populations when the steps are visible
    let edges;
    const lat = P.step ? P.step / S.n : null;
    if (lat && (hi - lo) / lat <= 90) {
      const first = Math.floor(lo / lat) * lat - lat / 2;
      edges = []; for (let e = first; e <= hi + lat; e += lat) edges.push(e);
      lo = edges[0]; hi = edges[edges.length - 1];
    } else {
      const k = 60; edges = []; for (let i = 0; i <= k; i++) edges.push(lo + (hi - lo) * i / k);
    }
    const k = edges.length - 1, cnt = new Array(k).fill(0), w = edges[1] - edges[0];
    let outside = 0;
    for (let i = 0; i < S.count; i++) {
      const j = Math.floor((S.means[i] - edges[0]) / w);
      if (j >= 0 && j < k) cnt[j]++; else outside++;
    }
    const dens = cnt.map((c) => S.count ? c / (S.count * w) : 0);
    let ymax = Math.max(...dens, 1e-9);
    const se = P.sigma == null ? null : P.sigma / Math.sqrt(S.n);
    if (se) ymax = Math.max(ymax, dnorm(P.mu, P.mu, se));
    if (P.mu == null) ymax = Math.max(ymax, 1 / Math.PI);
    const xs = (x) => L + (x - lo) / (hi - lo) * (W - L - R);
    const ys = (y) => H - Bm - y / (ymax * 1.08) * (H - T - Bm);
    dens.forEach((d, i) => {
      if (d <= 0) return;
      const x0 = xs(edges[i]), x1 = xs(edges[i + 1]);
      svgEl("rect", { x: x0 + 0.5, width: Math.max(x1 - x0 - 1, 0.6), y: ys(d), height: H - Bm - ys(d), rx: 2, fill: css("--bars"), opacity: 0.85 }, svg);
    });
    let path = "";
    for (let i = 0; i <= 300; i++) {
      const x = lo + (hi - lo) * i / 300;
      const y = se ? dnorm(x, P.mu, se) : (P.mu == null ? null : 0);
      if (y == null) break;
      path += (i ? "L" : "M") + xs(x).toFixed(1) + "," + ys(y).toFixed(1);
    }
    if (path) svgEl("path", { d: path, fill: "none", stroke: css("--bell"), "stroke-width": 2.6 }, svg);
    if (P.mu == null) {   // Cauchy: draw the Cauchy density itself, dashed
      let p2 = ""; for (let i = 0; i <= 300; i++) { const x = lo + (hi - lo) * i / 300; p2 += (i ? "L" : "M") + xs(x).toFixed(1) + "," + ys(1 / (Math.PI * (1 + x * x))).toFixed(1); }
      svgEl("path", { d: p2, fill: "none", stroke: css("--ink"), "stroke-width": 1.6, "stroke-dasharray": "5 4" }, svg);
    }
    if (S.study) svgEl("line", { x1: xs(S.study.mean), x2: xs(S.study.mean), y1: T, y2: H - Bm, stroke: css("--bell"), "stroke-width": 2, "stroke-dasharray": "3 3" }, svg);
    axis(svg, L, W - R, H - Bm, lo, hi, W, 6);
    const note = [];
    if (outside && S.count) note.push(`${(100 * outside / S.count).toFixed(1)}% of averages fall outside this window.`);
    if (P.mu == null) note.push("No bell curve can be drawn: the theorem's conditions fail. Dashed: the Cauchy shape of a single value; the averages keep exactly this shape at every n.");
    $("hist-note").textContent = note.join(" ");
  }

  function drawQQ(st) {
    const svg = $("qq-chart"); clear(svg);
    const W = 460, H = 300, L = 46, R = 12, T = 12, Bm = 34;
    if (!st || !st.sorted) return;
    const a = st.sorted, c = a.length, m = 300;
    const pts = [];
    for (let i = 0; i < m; i++) { const p = (i + 0.5) / m; pts.push([qnorm(p), a[Math.min(c - 1, Math.floor(p * c))]]); }
    const xlo = pts[0][0], xhi = pts[m - 1][0];
    const ylo = Math.min(...pts.map((p) => p[1])), yhi = Math.max(...pts.map((p) => p[1]));
    const xs = (x) => L + (x - xlo) / (xhi - xlo) * (W - L - R);
    const ys = (y) => H - Bm - (y - ylo) / (yhi - ylo || 1) * (H - T - Bm);
    // reference line through the quartiles (like qqline)
    const q1 = a[Math.floor(0.25 * c)], q3 = a[Math.floor(0.75 * c)], z1 = qnorm(0.25), z3 = qnorm(0.75);
    const slope = (q3 - q1) / (z3 - z1), icpt = q1 - slope * z1;
    svgEl("line", { x1: xs(xlo), y1: ys(icpt + slope * xlo), x2: xs(xhi), y2: ys(icpt + slope * xhi), stroke: css("--bell"), "stroke-width": 2 }, svg);
    pts.forEach(([x, y]) => svgEl("circle", { cx: xs(x), cy: ys(y), r: 2.6, fill: css("--bars"), opacity: 0.8 }, svg));
    svgEl("line", { x1: L, x2: W - R, y1: H - Bm, y2: H - Bm, stroke: "#c9ced8" }, svg);
    const t1 = svgEl("text", { x: (L + W - R) / 2, y: H - 8, "text-anchor": "middle", "font-size": 12, fill: css("--muted") }, svg); t1.textContent = "where a perfect bell curve would put each point";
    const t2 = svgEl("text", { x: 12, y: (T + H - Bm) / 2, transform: `rotate(-90 12 ${(T + H - Bm) / 2})`, "text-anchor": "middle", "font-size": 12, fill: css("--muted") }, svg); t2.textContent = "actual averages";
  }

  function drawAll() { drawPopulation(); drawOne(); drawHist(); updateStats(false); clear($("qq-chart")); }
})();
