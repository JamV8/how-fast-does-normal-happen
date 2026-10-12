# =============================================================
# clt_functions.R
# Shared code for "How Fast Does Normal Happen?"
#
# Every analysis file sources this script, so every population is
# simulated, measured, and judged with exactly the same code and
# the same "normal enough" standard.
# =============================================================

# ---- Reproducibility ----------------------------------------
student_id <- 9426   # last four digits of my student ID = random seed
B <- 100000          # Monte Carlo repetitions (how many sample means)
                     # NOTE: B is NOT the sample size n. A large B only
                     # makes our measurements more precise (it costs
                     # seconds of computer time, not real data).

# ---- My "normal enough" standard ----------------------------
# The sampling distribution of the mean is "normal enough" at sample
# size n when ALL four numerical checks pass, and the histogram and
# Q-Q plot show no systematic departure from the normal curve.
#
# Principle behind the numbers: each threshold is about 10 times the
# Monte Carlo noise (so truly normal data never fails by chance) and
# allows each tail of a 95% interval to be off by at most ~0.75
# percentage points (2.5% -> between 1.75% and 3.25%).
standards <- list(
  main = list(              # MY STANDARD: used for the chosen n
    max_abs_skew = 0.25,    # |skewness| <= 0.25        (normal = 0)
    max_abs_kurt = 0.50,    # |excess kurtosis| <= 0.50 (normal = 0)
    min_qq_cor   = 0.998,   # Q-Q points nearly on a straight line
    tail_min     = 0.0175,  # each tail: share of means beyond
    tail_max     = 0.0325   #   mu +/- 1.96 SE (normal predicts 2.5%)
  ),
  # Sensitivity analysis: the same simulations judged by a stricter
  # and a more lenient standard (thresholds calibrated the same way).
  strict = list(max_abs_skew = 0.10, max_abs_kurt = 0.20,
                min_qq_cor = 0.9996, tail_min = 0.022, tail_max = 0.028),
  lenient = list(max_abs_skew = 0.50, max_abs_kurt = 1.00,
                 min_qq_cor = 0.993, tail_min = 0.009, tail_max = 0.041)
)
normal_enough <- standards$main

# ---- Shape statistics (same formulas as Class 05) ------------
skew <- function(x) {
  m3 <- mean((x - mean(x))^3)
  m2 <- mean((x - mean(x))^2)
  m3 / m2^(3/2)
}

kurt <- function(x) {          # EXCESS kurtosis: normal = 0
  m4 <- mean((x - mean(x))^4)
  m2 <- mean((x - mean(x))^2)
  m4 / m2^2 - 3
}

# ---- One number for the Q-Q plot ------------------------------
# Correlation between the points of the normal Q-Q plot.
# A perfectly straight Q-Q plot gives exactly 1.
qq_cor <- function(x) {
  q <- qqnorm(x, plot.it = FALSE)
  cor(q$x, q$y)
}

# ---- Monte Carlo core -----------------------------------------
# rgen is a function that returns n random draws from the population,
# e.g. function(n) rexp(n, rate = 1).
simulate_means <- function(rgen, n, reps = B) {
  replicate(reps, mean(rgen(n)))
}

# All diagnostics for one vector of sample means.
# mu and sigma are the population mean and SD (NA if they do not exist).
diagnose_means <- function(means, n, mu = NA, sigma = NA) {
  theo_se <- sigma / sqrt(n)

  # Tail check: share of means below / above center -/+ 1.96 * spread,
  # checked separately because errors in the two tails can cancel.
  # Uses theory when it exists, otherwise the simulated mean and SD.
  center <- if (is.na(mu)) mean(means) else mu
  spread <- if (is.na(sigma)) sd(means) else theo_se

  data.frame(
    n           = n,
    sim_mean    = mean(means),
    theo_mean   = mu,
    sim_se      = sd(means),
    theo_se     = theo_se,
    se_ratio    = sd(means) / theo_se,
    skewness    = skew(means),
    ex_kurtosis = kurt(means),
    qq_cor      = qq_cor(means),
    lower_tail  = mean(means < center - 1.96 * spread),
    upper_tail  = mean(means > center + 1.96 * spread),
    shapiro_p   = shapiro.test(means[1:5000])$p.value  # max 5000 allowed
  )
}

# Mark which checks pass at each n.
apply_standard <- function(results, std = normal_enough) {
  results$skew_ok <- abs(results$skewness) <= std$max_abs_skew
  results$kurt_ok <- abs(results$ex_kurtosis) <= std$max_abs_kurt
  results$qq_ok   <- results$qq_cor >= std$min_qq_cor
  in_band <- function(x) x >= std$tail_min & x <= std$tail_max
  results$tail_ok <- in_band(results$lower_tail) & in_band(results$upper_tail)
  results$normal_enough <- results$skew_ok & results$kurt_ok &
                           results$qq_ok & results$tail_ok
  results
}

# Smallest n that passes AND every larger n tested also passes,
# so a single lucky simulation cannot decide the answer.
smallest_normal_n <- function(results) {
  ok <- results$normal_enough
  for (i in seq_along(ok)) {
    if (all(ok[i:length(ok)])) return(results$n[i])
  }
  NA
}

# First n at which a single check (a logical column) passes and stays passed.
first_stable_n <- function(n, ok) {
  for (i in seq_along(ok)) if (all(ok[i:length(ok)])) return(n[i])
  NA
}

# Smallest n under each of the three standards (sensitivity analysis).
n_by_standard <- function(results) {
  sapply(standards, function(std) smallest_normal_n(apply_standard(results, std)))
}

# Run the whole experiment for one population over many n.
run_clt_experiment <- function(rgen, n_values, mu = NA, sigma = NA,
                               reps = B, seed = student_id) {
  n_values <- sort(unique(n_values))

  # Each sample size is its own experiment, and the seed is set
  # immediately before it. This way the result for a given n does not
  # depend on which other sample sizes are in the grid.
  means <- lapply(n_values, function(n) {
    set.seed(seed)
    simulate_means(rgen, n, reps)
  })
  names(means) <- n_values

  results <- do.call(rbind, lapply(seq_along(n_values), function(i) {
    diagnose_means(means[[i]], n_values[i], mu, sigma)
  }))

  list(means = means, results = apply_standard(results))
}

# Two-stage search, as suggested in the assignment: run a coarse grid,
# then test every n (in steps of `step`) between the last coarse n that
# failed and the first coarse n that passed, and combine both stages.
run_with_refinement <- function(rgen, coarse, mu = NA, sigma = NA,
                                step = 1, reps = B, seed = student_id) {
  stage1 <- run_clt_experiment(rgen, coarse, mu, sigma, reps, seed)
  n_star <- smallest_normal_n(stage1$results)
  if (is.na(n_star) || n_star == min(coarse)) return(c(stage1, refined = list(NULL)))

  n_prev <- max(coarse[coarse < n_star])
  if (n_prev + step > n_star - step) return(c(stage1, refined = list(NULL)))  # no gap to refine
  fine <- setdiff(seq(n_prev + step, n_star - step, by = step), coarse)
  if (length(fine) == 0) return(c(stage1, refined = list(NULL)))

  stage2 <- run_clt_experiment(rgen, fine, mu, sigma, reps, seed)
  results <- rbind(stage1$results, stage2$results)
  ord <- order(results$n)
  means <- c(stage1$means, stage2$means)
  list(means = means[as.character(results$n[ord])],
       results = results[ord, ],
       refined = fine)
}

# ---- Tables -----------------------------------------------------
# Full diagnostics table for one population (one row per n).
results_table <- function(results, caption = NULL) {
  mark <- function(ok) ifelse(ok, "✓", "✗")
  tab <- data.frame(
    n               = results$n,
    `Mean (sim)`    = sprintf("%.4f", results$sim_mean),
    `SE (sim)`      = sprintf("%.4f", results$sim_se),
    `SE (theory)`   = ifelse(is.na(results$theo_se), "n/a", sprintf("%.4f", results$theo_se)),
    Skewness        = sprintf("%.3f", results$skewness),
    `Ex. kurtosis`  = sprintf("%.3f", results$ex_kurtosis),
    `Q-Q r`         = sprintf("%.4f", results$qq_cor),
    `Lower tail`    = sprintf("%.2f%%", 100 * results$lower_tail),
    `Upper tail`    = sprintf("%.2f%%", 100 * results$upper_tail),
    `Checks (S K Q T)` = paste(mark(results$skew_ok), mark(results$kurt_ok),
                               mark(results$qq_ok), mark(results$tail_ok)),
    `Normal enough` = ifelse(results$normal_enough, "**yes**", "no"),
    check.names = FALSE
  )
  knitr::kable(tab, align = "r", caption = caption, row.names = FALSE)
}

# Smallest n under each standard, as a small table.
standards_table <- function(results) {
  n_std <- n_by_standard(results)
  fmt <- function(x) ifelse(is.na(x), "none found", as.character(x))
  knitr::kable(data.frame(
    Standard = c("Strict", "**Main (my standard)**", "Lenient"),
    `Max |skewness|` = c(standards$strict$max_abs_skew, standards$main$max_abs_skew,
                         standards$lenient$max_abs_skew),
    `Smallest n` = c(fmt(n_std[["strict"]]), paste0("**", fmt(n_std[["main"]]), "**"),
                     fmt(n_std[["lenient"]])),
    check.names = FALSE), align = "lrr")
}

# One-line summary used by the final cross-population table.
save_summary <- function(results, population, chosen_n, prediction, key_note,
                         file = "../results/summary.csv") {
  row <- if (is.na(chosen_n)) results[nrow(results), ] else
    results[results$n == chosen_n, ]
  n_std <- n_by_standard(results)
  fmt <- function(x) ifelse(is.na(x), "none", as.character(x))
  out <- data.frame(
    population   = population,
    prediction   = prediction,
    chosen_n     = fmt(chosen_n),
    n_strict     = fmt(n_std[["strict"]]),
    n_lenient    = fmt(n_std[["lenient"]]),
    n_reported   = row$n,
    skewness     = round(row$skewness, 3),
    ex_kurtosis  = round(row$ex_kurtosis, 3),
    qq_cor       = round(row$qq_cor, 4),
    lower_tail   = round(row$lower_tail, 4),
    upper_tail   = round(row$upper_tail, 4),
    se_ratio     = round(row$se_ratio, 3),
    key_note     = key_note
  )
  old <- if (file.exists(file)) read.csv(file) else NULL
  if (!is.null(old)) old <- old[old$population != population, ]
  write.csv(rbind(old, out), file, row.names = FALSE)
  invisible(out)
}

# Save the full results grid so the summary page and website can reuse it.
save_results <- function(results, key, dir = "../results") {
  write.csv(results, file.path(dir, paste0(key, "_results.csv")), row.names = FALSE)
}

# ---- Plot style -------------------------------------------------
pal <- list(bars = "#4C78A8", curve = "#D1495B", pass = "#2E7D32",
            fail = "#C62828", ink = "#2B2B2B", muted = "#7A7A7A",
            grid = "#E9E9E9", accent = "#E69F00", zone = "#2E7D32")

style_par <- function(...) {
  par(las = 1, bty = "n", mgp = c(2.3, 0.55, 0), tcl = -0.25,
      col.axis = "#555555", col.lab = pal$ink, fg = "#9A9A9A",
      cex.main = 1.0, font.main = 2, col.main = pal$ink, ...)
}

# ---- Plots ------------------------------------------------------
# Histograms of sample means with the CLT normal curve on top.
# `step` = spacing of the population's possible values (1 for counts);
# for discrete populations each bar is one possible value of the mean.
plot_hist_grid <- function(exper, n_show, mu = NA, sigma = NA,
                           step = NA, xlim = NULL, ncol = 3) {
  old <- style_par(mfrow = c(ceiling(length(n_show) / ncol), ncol),
                   mar = c(3.6, 3.6, 2.6, 0.8))
  on.exit(par(old))
  for (n in n_show) {
    m <- exper$means[[as.character(n)]]
    br <- if (is.na(step)) 50 else
      seq(min(m) - step / (2 * n), max(m) + step / (2 * n), by = step / n)
    xl <- if (is.null(xlim)) range(m) else xlim
    h <- hist(m, breaks = br, plot = FALSE)
    top <- max(h$density, if (!is.na(sigma)) dnorm(0, 0, sigma / sqrt(n)) else 0)
    plot(h, freq = FALSE, col = adjustcolor(pal$bars, 0.75), border = "white",
         main = paste("n =", n), xlab = "Sample mean", ylab = "Density",
         xlim = xl, ylim = c(0, top * 1.05))
    if (!is.na(sigma)) {
      curve(dnorm(x, mean = mu, sd = sigma / sqrt(n)),
            add = TRUE, col = pal$curve, lwd = 2.2, n = 400)
    }
  }
}

# Normal Q-Q plots of sample means. To keep the figures light, the
# points are 4,000 evenly spaced quantiles of the 100,000 means
# (this keeps the shape, including the tails); qqline uses all means.
plot_qq_grid <- function(exper, n_show, ncol = 3) {
  old <- style_par(mfrow = c(ceiling(length(n_show) / ncol), ncol),
                   mar = c(3.6, 3.6, 2.6, 0.8))
  on.exit(par(old))
  for (n in n_show) {
    m <- exper$means[[as.character(n)]]
    q <- quantile(m, ppoints(4000), names = FALSE)
    qqnorm(q, main = sprintf("n = %d   (r = %.4f)", n, qq_cor(m)),
           pch = 16, cex = 0.35, col = adjustcolor(pal$bars, 0.8),
           xlab = "Normal quantiles", ylab = "Sample-mean quantiles")
    qqline(m, col = pal$curve, lwd = 2)
  }
}

# The four numerical checks against n. Shaded band = pass zone;
# green points pass, red points fail; the dotted line marks the chosen n.
# theory_skew / theory_kurt: population values, to draw skew/sqrt(n) and kurt/n.
plot_convergence <- function(results, std = normal_enough, chosen_n = NA,
                             theory_skew = NA, theory_kurt = NA) {
  old <- style_par(mfrow = c(2, 2), mar = c(3.8, 4.2, 2.6, 0.8))
  on.exit(par(old))
  n <- results$n
  xr <- range(n) * c(0.8, 1.25)
  col_ok <- function(ok) ifelse(ok, pal$pass, pal$fail)

  frame <- function(ylim, ylab, main, lo, hi) {
    plot(NA, xlim = xr, ylim = ylim, log = "x", xlab = "n (log scale)",
         ylab = ylab, main = main)
    abline(h = axTicks(2), col = pal$grid)
    rect(xr[1] / 2, lo, xr[2] * 2, hi, col = adjustcolor(pal$zone, 0.10), border = NA)
    abline(h = c(lo, hi), lty = 2, col = adjustcolor(pal$zone, 0.7))
    if (!is.na(chosen_n)) abline(v = chosen_n, lty = 3, col = pal$ink)
  }
  pts <- function(y, ok, pch = 19) {
    lines(n, y, col = "#BBBBBB")
    points(n, y, pch = pch, col = col_ok(ok), bg = col_ok(ok), cex = 0.9)
  }

  # 1. skewness
  frame(range(c(results$skewness, std$max_abs_skew, -std$max_abs_skew)),
        "Skewness", "Skewness of the sample means",
        -std$max_abs_skew, std$max_abs_skew)
  if (!is.na(theory_skew)) curve(theory_skew / sqrt(x), add = TRUE,
                                 col = pal$accent, lwd = 2, n = 300)
  pts(results$skewness, results$skew_ok)

  # 2. kurtosis
  frame(range(c(results$ex_kurtosis, std$max_abs_kurt, -std$max_abs_kurt)),
        "Excess kurtosis", "Excess kurtosis", -std$max_abs_kurt, std$max_abs_kurt)
  if (!is.na(theory_kurt)) curve(theory_kurt / x, add = TRUE,
                                 col = pal$accent, lwd = 2, n = 300)
  pts(results$ex_kurtosis, results$kurt_ok)

  # 3. Q-Q correlation (axis starts at 0.98; lower values drawn on the edge)
  lo_y <- 0.98
  frame(c(lo_y, 1), "Q-Q correlation r", "Straightness of the Q-Q plot",
        std$min_qq_cor, 1)
  y <- pmax(results$qq_cor, lo_y)
  pts(y, results$qq_ok, pch = ifelse(results$qq_cor < lo_y, 25, 19))

  # 4. tails
  tails <- 100 * c(results$lower_tail, results$upper_tail)
  frame(range(c(tails, 100 * std$tail_min, 100 * std$tail_max)),
        "% of means beyond 1.96 SE", "Tail check (target 2.5% each side)",
        100 * std$tail_min, 100 * std$tail_max)
  abline(h = 2.5, col = pal$muted)
  pts(100 * results$lower_tail, results$tail_ok, pch = 25)
  pts(100 * results$upper_tail, results$tail_ok, pch = 24)
  legend("topright", c("lower tail", "upper tail"), pch = c(25, 24),
         col = pal$muted, pt.bg = pal$muted, bty = "n", cex = 0.8)
}

# Simulated vs theoretical standard error on log-log axes (Class 06 style).
plot_se_check <- function(results) {
  old <- style_par(mar = c(4, 4.6, 2.6, 0.8))
  on.exit(par(old))
  plot(results$n, results$sim_se, log = "xy", pch = 19, col = pal$bars,
       xlab = "n (log scale)", ylab = "SD of the sample means (log scale)",
       main = "Simulated SE vs. theory sigma / sqrt(n)")
  lines(results$n, results$theo_se, col = pal$curve, lwd = 2)
  legend("topright", c("simulation", "theory"), pch = c(19, NA), lty = c(NA, 1),
         lwd = c(NA, 2), col = c(pal$bars, pal$curve), bty = "n")
}

# ---- Small helpers for writing numbers into the text --------------
f2  <- function(x) sprintf("%.2f", x)
f3  <- function(x) sprintf("%.3f", x)
f4  <- function(x) sprintf("%.4f", x)
pct <- function(x, d = 1) paste0(formatC(100 * x, format = "f", digits = d), "%")
num <- function(x) format(x, big.mark = ",", scientific = FALSE, trim = TRUE)

# Sentence describing pass/fail flips just below the chosen n.
flip_text <- function(results, chosen_n) {
  first <- min(results$n[results$normal_enough])
  if (is.na(chosen_n) || first >= chosen_n)
    return("Every tested sample size below this n fails at least one check.")
  fails <- results$n[results$n > first & results$n < chosen_n & !results$normal_enough]
  paste0("n = ", first, " already passes, but n = ", paste(fails, collapse = ", "),
         if (length(fails) > 1) " fail" else " fails", " again, so I do not stop there.")
}
