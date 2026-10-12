// Home page: fills numbers from the simulation results and draws the charts.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const fmt = (x) => x == null ? "never" : x.toLocaleString("en-US");

  fetch("assets/data/site.json").then((r) => r.json()).then((data) => {
    const byKey = Object.fromEntries(data.populations.map((p) => [p.key, p]));

    // numbers in the text
    document.querySelectorAll("[data-n]").forEach((s) => { s.textContent = fmt(byKey[s.dataset.n].n_main); });
    document.querySelectorAll("[data-tail]").forEach((s) => { s.textContent = byKey[s.dataset.tail].tails_at_30[1].toFixed(1) + "%"; });

    drawMini("mini-pop", data.illustration.population, null);
    drawMini("mini-n5", data.illustration.n5, data.illustration.n5);
    drawMini("mini-n71", data.illustration.n71, data.illustration.n71);
    drawAnswer(data.populations);
  });

  // ---- small histogram with an optional bell curve ----------------
  function drawMini(id, h, curve) {
    const svg = document.getElementById(id); if (!svg) return;
    const W = 320, H = 150, pad = { l: 6, r: 6, t: 8, b: 22 };
    const k = h.density.length, bw = (W - pad.l - pad.r) / k;
    const xs = (x) => pad.l + (x - h.from) / (h.to - h.from) * (W - pad.l - pad.r);
    let ymax = Math.max(...h.density);
    const pdf = (x) => Math.exp(-0.5 * ((x - curve.mu) / curve.se) ** 2) / (curve.se * Math.sqrt(2 * Math.PI));
    if (curve) ymax = Math.max(ymax, pdf(curve.mu));
    const ys = (y) => H - pad.b - y / ymax * (H - pad.t - pad.b);
    h.density.forEach((d, i) => {
      if (d <= 0) return;
      el("rect", { x: pad.l + i * bw + 0.6, y: ys(d), width: Math.max(bw - 1.2, 0.5), height: H - pad.b - ys(d),
                   rx: 2, fill: css("--bars"), opacity: 0.85 }, svg);
    });
    el("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: "#c9ced8" }, svg);
    if (curve) {
      let d = "";
      for (let i = 0; i <= 200; i++) {
        const x = h.from + (h.to - h.from) * i / 200;
        d += (i ? "L" : "M") + xs(x).toFixed(1) + "," + ys(pdf(x)).toFixed(1);
      }
      el("path", { d, fill: "none", stroke: css("--bell"), "stroke-width": 2.4 }, svg);
      const t = el("text", { x: W - pad.r, y: H - 6, "text-anchor": "end", "font-size": 12, fill: css("--muted") }, svg);
      t.textContent = "skewness " + curve.skew.toFixed(2);
    }
  }

  // ---- the answer chart --------------------------------------------
  function drawAnswer(pops) {
    const svg = document.getElementById("answer-chart"); if (!svg) return;
    const tip = document.getElementById("tip");
    // On narrow screens put each name above its line and use a narrower canvas,
    // so the text stays readable after the SVG is scaled down.
    const narrow = svg.getBoundingClientRect().width < 640;
    const W = narrow ? 420 : 1000, rowH = narrow ? 58 : 46, top = narrow ? 40 : 36;
    const left = narrow ? 14 : 250, right = narrow ? 34 : 70, nameDy = narrow ? -14 : 5;
    const fs = narrow ? 14 : 15;
    const H = top + rowH * pops.length + 40;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const lo = Math.log10(1), hi = Math.log10(10000);
    const xs = (n) => left + (Math.log10(n) - lo) / (hi - lo) * (W - left - right);

    // grid
    (narrow ? [1, 10, 30, 100, 1000, 10000] : [1, 3, 10, 30, 100, 300, 1000, 3000, 10000]).forEach((v) => {
      el("line", { x1: xs(v), x2: xs(v), y1: top - 10, y2: H - 30, stroke: v === 30 ? "none" : "#eef0f4" }, svg);
      const t = el("text", { x: xs(v), y: H - 10, "text-anchor": "middle", "font-size": 13, fill: css("--muted") }, svg);
      t.textContent = v.toLocaleString("en-US");
    });
    // the n = 30 line
    el("line", { x1: xs(30), x2: xs(30), y1: top - 18, y2: H - 30, stroke: css("--ink"), "stroke-width": 2, "stroke-dasharray": "5 5" }, svg);
    const lbl = el("text", { x: xs(30) + 8, y: top - 14, "font-size": 14, "font-weight": 700, fill: css("--ink") }, svg);
    lbl.textContent = narrow ? "n = 30 rule" : "the rule of thumb: n = 30";

    pops.forEach((p, i) => {
      const y = top + rowH * i + rowH / 2 + (narrow ? 8 : 0);
      const color = p.n_main == null ? css("--fail") : (p.n_main <= 30 ? css("--pass") : css("--warn"));
      const name = el("text", { x: narrow ? left : left - 18, y: y + nameDy, "text-anchor": narrow ? "start" : "end",
                                "font-size": fs, "font-weight": 600, fill: css("--ink"),
                                stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, svg);
      name.textContent = p.name;
      el("line", { x1: left, x2: W - right, y1: y, y2: y, stroke: "#f0f2f6" }, svg);

      const g = el("g", { style: "cursor:pointer" }, svg);
      if (p.n_main == null) {
        el("line", { x1: xs(1), x2: W - right + 10, y1: y, y2: y, stroke: color, "stroke-width": 3, "stroke-dasharray": "2 6", "stroke-linecap": "round" }, g);
        el("path", { d: `M${W - right + 10},${y - 7} L${W - right + 24},${y} L${W - right + 10},${y + 7} Z`, fill: color }, g);
        const t = el("text", { x: W - right - 4, y: y - 10, "text-anchor": "end", "font-size": 14, "font-weight": 700, fill: color }, g);
        t.textContent = "never";
      } else {
        el("line", { x1: xs(1), x2: xs(p.n_main), y1: y, y2: y, stroke: color, "stroke-width": 3, opacity: 0.35, "stroke-linecap": "round" }, g);
        if (p.kind === "textbook") {
          el("rect", { x: xs(p.n_main) - 8, y: y - 8, width: 16, height: 16, transform: `rotate(45 ${xs(p.n_main)} ${y})`, fill: color, stroke: "#fff", "stroke-width": 2 }, g);
        } else {
          el("circle", { cx: xs(p.n_main), cy: y, r: 9, fill: color, stroke: "#fff", "stroke-width": 2 }, g);
        }
        const t = el("text", { x: xs(p.n_main) + 16, y: y + 5, "font-size": 14, "font-weight": 700, fill: css("--ink") }, g);
        t.textContent = "n = " + fmt(p.n_main);
      }
      el("rect", { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: "transparent" }, g);
      g.addEventListener("mousemove", (ev) => {
        const pred = p.n_formula ? `<br>Formula prediction: n ≈ ${fmt(p.n_formula)}` : "";
        const at30 = p.n_main == null ? "" : `<br>At n = 30: ${p.pass_at_30 ? "passes ✓" : "fails ✗"}`;
        tip.innerHTML = `<b>${p.name}</b> (${p.kind === "real" ? "real data" : "textbook"})<br>` +
          `Needed: <b>${p.n_main == null ? "no n works" : "n = " + fmt(p.n_main)}</b>${pred}${at30}<br><span style="opacity:.8">${p.note}</span>`;
        tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 300) + "px";
        tip.style.top = (ev.clientY + 14) + "px";
        tip.style.opacity = 1;
      });
      g.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
      g.addEventListener("click", () => { window.location.href = p.page; });
    });
  }
})();
