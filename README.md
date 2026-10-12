# How Fast Does Normal Happen?

### Stress-testing the Central Limit Theorem with Monte Carlo simulation, real data, and an interactive simulator

**🌐 Website:** https://jamv8.github.io/how-fast-does-normal-happen/
&nbsp;·&nbsp; **🎛 Simulator:** [try it in your browser](https://jamv8.github.io/how-fast-does-normal-happen/simulator.html)
&nbsp;·&nbsp; **📄 Findings:** [full summary](https://jamv8.github.io/how-fast-does-normal-happen/report.html)

Statistics courses teach a rule of thumb: **with 30 or more observations, the sample mean is approximately
normal.** That assumption is behind every margin of error and most confidence intervals. This project tests the
rule. For each population I simulated **100,000 samples at every sample size** and found the smallest n at which
the sample mean passes a calibrated "normal enough" standard. I did this for five textbook distributions and five
real datasets.

![Smallest sample size at which the sample mean is normal enough, for ten populations](figures/answer_chart.png)

## Conclusions: is the number 30?

**No. There is no universal n.** The answer depends on the shape of the population:

1. **Symmetric populations need less than 30.** Normal: n = 1. Six-sided die: n = 8.
2. **Skewed populations need more than 30.** Exponential: n = 71. The skewness of the mean shrinks only
   as 1/√n, so the threshold is about **n ≈ (skewness / 0.25)²**; that formula predicted 64.
3. **Discrete, rare-event counts need more than their skewness suggests.** Binomial(5, 0.1): n = 83. Its skewness
   passed at n = 30, but the stair-step shape of its sample mean held it back.
4. **With infinite variance, no n works.** Cauchy: the mean of 5,000 values has exactly the same spread as a
   single value.
5. **Real data mostly fail the rule of 30.** Diamond prices need about 51 observations, NYC flight delays 235,
   and Midwest county populations 2,450. The skewness formula predicted all three within about 20%.
6. **The standard error σ/√n was correct at every n** for every finite-variance population. The spread is
   right long before the shape is.

## Final table

| Population | My prediction | Smallest n (main standard) | Strict / lenient | Skewness at chosen n | Key observation |
|---|---:|---:|---:|---:|---|
| [Standard normal](https://jamv8.github.io/how-fast-does-normal-happen/analysis/01_normal.html) | 1 | **1** | 1 / 1 | −0.008 | Control case: normal at every n |
| [Six-sided die](https://jamv8.github.io/how-fast-does-normal-happen/analysis/02_die.html) | 15 | **8** | 38 / 3 | −0.014 | Symmetric; only the flat, discrete shape had to fade |
| [Exponential (λ = 1)](https://jamv8.github.io/how-fast-does-normal-happen/analysis/03_exponential.html) | 45 | **71** | 600 / 20 | 0.243 | Skewness is the bottleneck; theory predicts 64 |
| [Binomial (5, 0.1)](https://jamv8.github.io/how-fast-does-normal-happen/analysis/04_binomial.html) | 100 | **83** | 900 / 20 | 0.140 | Skewness passes at 30; discreteness sets the answer |
| [Cauchy (0, 1)](https://jamv8.github.io/how-fast-does-normal-happen/analysis/05_cauchy.html) | never | **none** | none / none | undefined | Infinite variance: averaging does not help |

| Real dataset ([extension](https://jamv8.github.io/how-fast-does-normal-happen/analysis/06_real_world_data.html)) | Skewness | Predicted n | Simulated n | n = 30 enough? |
|---|---:|---:|---:|:---:|
| Old Faithful waiting times | −0.42 | 3 | **6** | yes |
| Great inventions per year | 1.23 | 25 | **38** | no |
| Diamond prices | 1.62 | 42 | **51** | no |
| NYC flight arrival delays | 3.72 | 222 | **235** | no |
| Midwest county populations | 12.15 | 2,362 | **2,450** | no |

## What "normal enough" means here

There is no official cutoff, so I defined one standard and applied it to every population. The sample mean is
normal enough at n when **all four checks pass**, and they keep passing for every larger n tested:

| Check | Pass zone | Purpose |
|---|---|---|
| Skewness | between −0.25 and 0.25 | not lopsided |
| Excess kurtosis | between −0.5 and 0.5 | no excess of extreme values |
| Q-Q correlation | ≥ 0.998 | straight normal Q-Q plot |
| Tails | 1.75%–3.25% beyond ±1.96 SE on **each** side | 95% intervals stay honest |

Each threshold is about ten times the Monte Carlo noise, and each keeps both tails of a 95% interval within
0.75 percentage points of 2.5%. The calibration is on the [Method](https://jamv8.github.io/how-fast-does-normal-happen/methods.html) page. Results are also reported
under a strict (skewness ≤ 0.1) and a lenient (≤ 0.5) standard.

## Method in brief

- **Monte Carlo:** for each sample size n, draw B = 100,000 samples of size n and compute their means.
  B controls precision; n is the quantity studied.
- **Search:** a coarse grid of n, then every n between the last failing and first passing grid value.
- **Reproducibility:** seed 9426 (last four digits of my student ID), set immediately before each n. Rerunning
  the exponential analysis with seed 2026 changed the exact numbers but not the conclusion.
- **One codebase:** every population is simulated and judged by the same functions in
  [`R/clt_functions.R`](R/clt_functions.R).

## Repository structure

```
├── index.qmd                 Website home page (plain-language story)
├── simulator.qmd             Interactive simulator page
├── report.qmd                Findings: cross-population summary and research questions
├── methods.qmd               Simulation design and calibration of the standard
├── analysis/
│   ├── 01_normal.qmd         One analysis per population:
│   ├── 02_die.qmd              population, prediction, sample sizes, results,
│   ├── 03_exponential.qmd      chosen n, evidence, what surprised me
│   ├── 04_binomial.qmd         (+ reproducibility experiment in 03)
│   ├── 05_cauchy.qmd
│   └── 06_real_world_data.qmd  Extension: rivers, a poll, five real datasets
├── R/
│   ├── clt_functions.R       Shared simulation, diagnostics and plotting code
│   └── export_site_data.R    Exports results to JSON for the website
├── results/                  Saved results for every population (CSV)
├── assets/                   Website styles, scripts and data
├── docs/                     Rendered website (GitHub Pages)
└── AI_prompts.md             Log of key AI prompts and validation
```

## Reproduce

Requirements: R (≥ 4.3) and Quarto (bundled with RStudio). R packages: `knitr`, `rmarkdown`, `ggplot2`,
`nycflights13`, `jsonlite`.

```bash
quarto render                     # runs every simulation and builds the site into docs/
Rscript R/export_site_data.R      # refreshes the website data and the README figure
```

Results are cached by Quarto's `freeze` (`_freeze/`). Delete that folder to recompute everything from scratch.

## Use of AI

I used an AI assistant for writing R code, building the website, and editing my written explanations. The
decisions (the definition of "normal enough", the predictions, the design choices and the interpretation) are mine.
The key prompts, the problems I questioned, and how I validated the code are documented in
[AI_prompts.md](AI_prompts.md).

---

*MATH 167R · Project 1.*
