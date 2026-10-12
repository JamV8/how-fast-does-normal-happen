# =============================================================
# export_site_data.R
# Exports results and datasets to JSON for the interactive website
# (assets/data/). Run from the project root AFTER rendering the
# analysis pages, which write the CSV files in results/:
#   Rscript R/export_site_data.R
# =============================================================
source("R/clt_functions.R")

dir.create("assets/data", showWarnings = FALSE, recursive = TRUE)
read_res <- function(key) read.csv(file.path("results", paste0(key, "_results.csv")))
pop_sd <- function(x) sqrt(mean((x - mean(x))^2))

flights_delay <- nycflights13::flights$arr_delay
flights_delay <- flights_delay[!is.na(flights_delay)]

# ---- populations shown on the website ---------------------------
pops <- list(
  list(key = "normal", res = "normal", name = "Normal", kind = "textbook", page = "analysis/01_normal.html",
       skew = 0, note = "Already a bell curve, so its averages are normal from the start."),
  list(key = "die", res = "die", name = "Six-sided die", kind = "textbook", page = "analysis/02_die.html",
       skew = 0, note = "Flat and lumpy, but symmetric, so it settles quickly."),
  list(key = "faithful", res = "real_faithful", name = "Geyser waiting times", kind = "real",
       page = "analysis/06_real_world_data.html", x = as.numeric(faithful$waiting),
       note = "Two humps, but nearly symmetric: fast."),
  list(key = "discoveries", res = "real_discoveries", name = "Inventions per year", kind = "real",
       page = "analysis/06_real_world_data.html", x = as.numeric(discoveries),
       note = "Small whole-number counts: the steps slow it down."),
  list(key = "diamonds", res = "real_diamonds", name = "Diamond prices", kind = "real",
       page = "analysis/06_real_world_data.html", x = as.numeric(ggplot2::diamonds$price),
       note = "Prices are skewed: a few very expensive stones."),
  list(key = "exponential", res = "exponential", name = "Exponential (waiting time)", kind = "textbook",
       page = "analysis/03_exponential.html", skew = 2, note = "Long right tail: skewness is the bottleneck."),
  list(key = "binomial", res = "binomial", name = "Binomial (5, 0.1)", kind = "textbook",
       page = "analysis/04_binomial.html", skew = 1.1926, note = "Rare-event counts: skewed and lumpy."),
  list(key = "flights", res = "real_flights", name = "Flight delays (NYC)", kind = "real",
       page = "analysis/06_real_world_data.html", x = flights_delay,
       note = "Most flights are on time, a few are hours late."),
  list(key = "counties", res = "real_counties", name = "County populations", kind = "real",
       page = "analysis/06_real_world_data.html", x = as.numeric(ggplot2::midwest$poptotal),
       note = "A few giant counties dominate: thousands of observations needed."),
  list(key = "cauchy", res = "cauchy", name = "Cauchy (extreme tails)", kind = "textbook",
       page = "analysis/05_cauchy.html", skew = NA, note = "No finite variance: no sample size is enough.")
)

summary_rows <- lapply(pops, function(p) {
  r <- read_res(p$res)
  sk <- if (!is.null(p$x)) skew(p$x) else p$skew
  std_n <- sapply(standards, function(s) smallest_normal_n(apply_standard(r, s)))
  r30 <- r[r$n == 30, ]
  list(key = p$key, name = p$name, kind = p$kind, page = p$page, note = p$note,
       skew = if (is.na(sk)) NULL else round(sk, 3),
       n_formula = if (is.na(sk) || abs(sk) < 1e-9) NULL else ceiling((sk / 0.25)^2),
       n_main = unname(std_n[["main"]]), n_strict = unname(std_n[["strict"]]),
       n_lenient = unname(std_n[["lenient"]]),
       pass_at_30 = isTRUE(r30$normal_enough),
       skew_at_30 = round(r30$skewness, 3),
       tails_at_30 = round(100 * c(r30$lower_tail, r30$upper_tail), 2),
       curve = list(n = r$n, skew = round(r$skewness, 4), kurt = round(r$ex_kurtosis, 4), qq = round(r$qq_cor, 5),
                    lower = round(r$lower_tail, 5), upper = round(r$upper_tail, 5),
                    ok = r$normal_enough))
})

# ---- three-step illustration on the home page (exponential) -------
bins <- function(m, from, to, k = 40) {
  inside <- m[m >= from & m <= to]                    # values outside the window are dropped
  h <- hist(inside, breaks = seq(from, to, length.out = k + 1), plot = FALSE)
  list(from = from, to = to, density = round(h$counts / (length(m) * diff(h$breaks)), 4))
}
set.seed(student_id)
pop_draws <- rexp(100000)
m5  <- simulate_means(function(n) rexp(n), 5, 50000)
m71 <- simulate_means(function(n) rexp(n), 71, 50000)
illustration <- list(
  population = bins(pop_draws, 0, 5),
  n5 = c(bins(m5, 0, 3), list(n = 5, mu = 1, se = 1 / sqrt(5), skew = round(skew(m5), 2))),
  n71 = c(bins(m71, 0.5, 1.5), list(n = 71, mu = 1, se = 1 / sqrt(71), skew = round(skew(m71), 2)))
)

# ---- "why it matters": coverage of the usual 95% interval (from analysis/06) ----
ci <- read.csv("results/ci_coverage.csv"); ex <- read.csv("results/ci_flights_examples.csv")
row_of <- function(k, n) { r <- ci[ci$key == k & ci$n == n, ]; list(n = n, covers = r$covers, too_low = r$too_low, too_high = r$too_high) }
why <- list(mu = mean(flights_delay), sigma = pop_sd(flights_delay), max = max(flights_delay),
            share_early = mean(flights_delay < 0), share_within20 = mean(abs(flights_delay) <= 20),
            intervals = unname(lapply(seq_len(nrow(ex)), function(i) round(c(ex$lo[i], ex$hi[i]), 2))),
            flights30 = row_of("flights", 30), flights100 = row_of("flights", 100),
            flights_main = row_of("flights", max(ci$n[ci$key == "flights"])), counties30 = row_of("counties", 30))

jsonlite::write_json(list(standards = standards, B = B, seed = student_id,
                          populations = summary_rows, illustration = illustration, why = why),
                     "assets/data/site.json", auto_unbox = TRUE, null = "null", na = "null", digits = NA)

# ---- datasets for the simulator ---------------------------------
set.seed(student_id)
real <- list(
  faithful = as.numeric(faithful$waiting),
  discoveries = as.numeric(discoveries),
  diamonds = as.numeric(ggplot2::diamonds$price),
  flights = flights_delay,
  counties = as.numeric(ggplot2::midwest$poptotal),
  rivers = as.numeric(rivers)
)
# The flights data has 327,346 records; the browser gets a random 40,000 of them.
# Its mean and SD are still reported from the full data.
sim_data <- lapply(names(real), function(k) {
  x <- real[[k]]
  shipped <- if (length(x) > 60000) sample(x, 40000) else x
  list(values = shipped, mu = mean(x), sigma = pop_sd(x), N = length(x))
})
names(sim_data) <- names(real)
jsonlite::write_json(sim_data, "assets/data/real_data.json", auto_unbox = TRUE, digits = 6)

cat("Wrote assets/data/site.json and assets/data/real_data.json\n")

# ---- static summary figure for the README -----------------------
pops_fig <- rev(summary_rows)   # top-to-bottom order on the chart
plain <- c(normal = "Already bell-shaped data", die = "Dice rolls", faithful = "Time between Old Faithful eruptions",
           discoveries = "Inventions per year", diamonds = "Diamond prices", exponential = "Waiting times (next customer)",
           binomial = "Count of rare events", flights = "Flight delays (NYC)",
           counties = "County populations", cauchy = "Extreme-outlier data")
png("figures/answer_chart.png", width = 2000, height = 1150, res = 220)
style_par(mar = c(4.2, 16, 3.2, 3))
k <- length(pops_fig)
plot(NA, xlim = c(1, 10000), ylim = c(0.5, k + 0.5), log = "x", yaxt = "n",
     xlab = "Values per study needed before the averages form a bell curve (each gridline is 10 times the last)", ylab = "",
     main = "Is 30 enough? It depends on the data")
abline(v = c(1, 10, 100, 1000, 10000), col = pal$grid)
for (i in seq_len(k)) {
  p <- pops_fig[[i]]
  axis(2, at = i, labels = paste0(plain[[p$key]], if (p$kind == "real") " *" else ""), las = 1, tick = FALSE, cex.axis = 0.95)
  if (is.null(p$n_main) || is.na(p$n_main)) {
    arrows(1, i, 9000, i, col = pal$fail, lwd = 3, length = 0.1)
    text(9000, i + 0.32, "never", col = pal$fail, font = 2, adj = 1)
  } else {
    col <- if (p$n_main <= 30) pal$pass else pal$accent
    segments(1, i, p$n_main, i, col = adjustcolor(col, 0.35), lwd = 4)
    points(p$n_main, i, pch = if (p$kind == "real") 19 else 18, cex = 2.1, col = col)
    text(p$n_main, i, paste0("  n = ", format(p$n_main, big.mark = ",")), adj = 0, font = 2, cex = 0.9, col = pal$ink)
  }
}
abline(v = 30, lty = 2, lwd = 2, col = pal$ink)
mtext("rule of thumb: n = 30", side = 3, at = 30, line = 0.1, cex = 0.8, font = 2, col = pal$ink)
mtext("* real-world data      green = 30 is enough   orange = needs more than 30   red = never", side = 1, line = 3, adj = 1, cex = 0.7, col = pal$muted)
invisible(dev.off())
cat("Wrote figures/answer_chart.png\n")
