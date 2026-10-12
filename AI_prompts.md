---
title: "AI log"
subtitle: "Key prompts, what I questioned, and how I checked the results"
---

I used an AI assistant (Claude) throughout this project. My prompts were written in Russian; below they are
translated and shortened. This is not the full conversation: it is the set of exchanges that changed the
project or my understanding, as the assignment asks.

## Who did what

| I decided | The AI did |
|---|---|
| What "normal enough" means, after challenging the AI's first proposal | Wrote the R code (shared functions, simulations, plots) |
| To use B = 100,000 and to add strict and lenient standards | Ran calibration simulations when I questioned a threshold |
| My predictions (from pilot runs I asked for) | Built the website and the interactive simulator |
| To add a real-data extension | Translated and edited my written observations |
| The interpretation in each "What surprised me" section | Flagged problems it found while building (listed below) |

## Iteration 1: challenging the thresholds

**My prompt:** "Explain your thresholds. Why did you choose them?"

**First answer:** skewness ≤ 0.25, kurtosis ≤ 0.5, Q-Q correlation ≥ 0.999, and 4.5%–5.5% of the means outside
±1.96 SE in total, with a short justification.

**What happened next:** to answer my question with evidence instead of opinion, the AI calibrated each threshold by
simulation. That check exposed two problems with its own first proposal:

- A Q-Q correlation of 0.999 corresponds to a skewness of about 0.17, so it silently contradicted the 0.25 skewness rule.
- A two-sided tail check barely reacts to skewness: the total outside ±1.96 SE was 4.91% at skewness 0.25 and still
  4.47% at skewness 1.0, because the errors on the two sides cancel.

**Result:** Q-Q threshold changed to 0.998, and the tail check now tests **each side separately** (1.75%–3.25%).

## Iteration 2: "Why 1.96, and why these numbers?"

**My prompt:** "Why is 1.96 SE the thing to aim for? And why exactly these skewness and kurtosis values?"

**Answer:** 1.96 is the boundary that leaves 2.5% in each tail of a normal curve, and 95% intervals are what the CLT is
used for in practice. The thresholds sit between two limits: well above the Monte Carlo noise (skewness noise ≈ 0.025),
and low enough that a 95% interval stays honest (table of exact tail errors for skewness 0.1, 0.25, 0.5, 1).

**What I took from it:** the cutoff is a trade-off, not a fact. Halving the skewness threshold requires four times the data.
I kept 0.25 as my main standard.

## Iteration 3: "Doesn't 'normal enough' depend on the type of data?"

**Answer and decision:** the *standard* stays the same for every population; otherwise the populations cannot be
compared and the question "is 30 universal?" has no answer. What changes is the *interpretation*: for discrete
populations the Q-Q plot is a staircase, and for the Cauchy skewness and kurtosis do not exist, so I rely on
quantiles instead.

## Iteration 4: "Could we use stricter thresholds, since computers are powerful?"

**Answer:** computing power improves the *precision of the measurement* (B, the number of simulated samples), but a
stricter threshold changes the *answer* (n), and that cost falls on real data collection, not on the computer.

**Decision (mine):** increase B from 10,000 to 100,000 (measurement noise about 3 times smaller, a few seconds per
population) and report every result under strict, main and lenient standards as a sensitivity analysis.

## Iteration 5: questions about real data

**My prompts:** "There are only 141 rivers. If we take a large n, is that even real?" and "Wouldn't it be better to
measure 1,000 rivers and use a threshold of 0.1?"

**What I learned:** sampling *with* replacement treats the data as an infinite population; without replacement, at
n = 141 the mean never varies (the finite-population effect). The `rivers` data contain only the *longest* rivers,
and no sample size fixes a biased population. A larger n makes an interval both narrower (precision) and more honest
(normality), but the threshold defines the *minimum* n at which the normal formula can be trusted, not the ideal n.

**Effect on the project:** this is why the main study samples from theoretical distributions, and why the real-data
extension states its assumptions explicitly.

## Iteration 6: pilot runs before predicting

**My prompts:** "Before I predict, show me n = 1, 15 and 20 for each distribution," then "Show the Cauchy too," and
"Run the Cauchy again with n = 100."

**Result:** I made my predictions from the pilot histograms, skewness and kurtosis (Normal 1, die 15, exponential 45,
binomial 100, Cauchy never). For the binomial I predicted a larger n than for the exponential because of
discreteness. That turned out to be right, even though it is less skewed.

## Iteration 7: checking my own understanding

**My prompt:** "Quiz me on the material I need before we continue."

**Result:** I answered the questions on n vs. B, the CLT, the standard error and Q-Q plots correctly, but missed three:
the direction of skewness (I judged it by the peak instead of the tail), the meaning of kurtosis (I confused it
with skewness), and how to use the formula skewness/√n to predict n. I asked follow-up questions until both were clear (the river-length histogram with mean vs. median).

## Iteration 8: presentation for a non-technical audience

**My prompt:** after seeing the first version of the website: "I don't like it. It looks too technical and has too much
text. I want as little text as possible, as interactive as possible, with animation, almost like a game, so that a
non-technical person can understand the Central Limit Theorem, and more colorful."

**What changed:** the home page was rebuilt as six short playable levels: rolling dice into a histogram, a slider
that turns averages of dice into a bell curve, an "Average Machine" with a challenge to find the smallest n that
rings the bell (checked by the same four tests as the R study), a race of ten populations to the bell curve, and
simulated polls. The technical report stayed as separate pages for readers who want the details.

**Follow-up prompt:** "The game is cool, but it feels too relaxed and playful. I want something that looks slick and
professional, more like an animation than a game. Keep the game as a second option."

**What changed:** a new home page ("Story mode"): a dark, scroll-driven visual essay in which about 3,000 particles
re-form into each step of the argument (population, one sample, many averages, growing n with a live HUD of the R
results, ten populations, the Cauchy case, and "30" crossed out). The game moved to "Play mode".

## Iteration 9: "the why-it-matters part isn't believable"

**My prompt:** "Make the scroll animations smooth. Also think about the 'why it matters' part so it really matters:
what's there now isn't believable. And make both the game and the story not look like AI, including the text."

**What I noticed:** the website opened with a news poll ("52% ± 3%") as the reason the CLT matters, but my own
results showed a 50/50 yes/no question needs very few observations, so the example argued against my point.

**What changed:**
- A new analysis in R (Real data, Part C): how often does the usual 95% t-interval, built from one sample, contain the
  true mean? With 30 real flight delays it caught the truth 89.8% of the time and was too low in 9.8% of samples
  (promised: 2.5%). With 235 flights it caught it 94.1% of the time. County populations at n = 30: 71.7%.
- The story now follows that one real example (flight delays) from the problem to the answer, and Play mode's last
  level lets the reader run the same 100 studies.
- Design: no purple gradients, emoji or pill badges; a newspaper-style layout with a serif typeface, notes written
  directly on the charts, and data sources. Text rewritten in first person with specific numbers.
- Smoother scrolling: the scroll position is smoothed before it drives the animation, and the page avoids
  re-layout on every frame.

## Iteration 10: "sometimes I scroll and nothing happens"

**My prompts:** "The site displays very strangely." Then: "The scroll doesn't feel perfect. There are moments when you
scroll and nothing happens. Whenever you scroll, it should be visible on the screen."

**What we found:** two text cards were on screen at once, stray dots floated outside the charts, a `$` sign in a
table label was being read as a math formula, and the report pages still used the old purple theme. For the scroll,
we wrote a small test that scrolls the story one mouse-wheel step at a time and checks whether anything on the screen
changed. Before the fix, 43 of 141 steps changed nothing: several sections ran on a timer instead of the scroll, and
each section's progress finished half a screen before the section did.

**What changed:** every section is now driven by the scroll position (the population pile fills in, studies run one
by one and then faster, a line sweeps across the "every kind of data" chart, the end of a section slides into the
next one). After the change the same test found no scroll step where the screen stayed still, on a laptop and on a
phone-sized screen.

## Problems the AI found while building

These were flagged by the AI during coding; I reviewed and accepted each fix.

- **Coarse-grid numbers.** Before I wrote my conclusions, the strict-standard values came from a coarse grid
  (for the binomial, 1,000 was the edge of the grid). Refining changed the die's strict value from 50 to about 38
  and confirmed that the binomial stays normal enough up to n = 3,000.
- **Seed placement.** The seed was first set once per grid, so adding a sample size to the grid changed the results for
  all other sizes. Following the assignment ("set the seed immediately before each simulation experiment"), it is now
  set before each n.
- **A crash in the refinement step** when there was no gap between the last failing and first passing n; fixed.

## Writing

I wrote my "What surprised me" observations in my own words (in Russian). The AI translated and edited them. I asked
twice whether the result sounded professional and still like me, and the second version was simplified. I checked
every number in these sections against my results tables; in the final report they are inserted directly from the
R output.

## How I validated the code

| Check | How | Result |
|---|---|---|
| `skew()` and `kurt()` match the Class 05 formulas | compared `R/clt_functions.R` line by line with the lecture code | Identical: same third/fourth central moments, kurtosis reported as excess (−3) |
| Standard error formula | for the exponential at n = 71: 1/√71 = 0.1187, compared with the simulated SE in the results table | Simulated SE 0.1194 vs 0.1187 (ratio 1.006). Across every n for the normal, die, exponential and binomial the ratio stayed between 0.997 and 1.008 |
| Control case | the normal population passes all four checks at n = 1 | Passes: skewness −0.008, excess kurtosis −0.014, Q-Q r = 0.99999, tails 2.55% / 2.49%; it also passes at every larger n tested |
| Reproducibility | reran the exponential analysis with seed 2026 (section 8 of that page) | Main answer 69 with seed 2026 vs 71 with seed 9426; strict (600) and lenient (20) answers unchanged |
| Full re-render | `quarto render` from a clean copy reproduces the numbers | Fresh clone with cached results deleted, everything re-simulated: all 13 results files byte-for-byte identical; `summary.csv` has the same values in a different row order |
