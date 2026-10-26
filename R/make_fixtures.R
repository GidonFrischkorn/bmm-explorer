#!/usr/bin/env Rscript
# Writes the parity fixtures from the installed bmm. Usage: Rscript R/make_fixtures.R <out_dir>
# The grids are literal and small; they cover the slider ranges the pages expose and the corners
# where a port is weakest (kappa near 0 and above 100, probabilities near 0 and 1, counts of 0).
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "tests/parity/fixtures"
dir.create(out, showWarnings = FALSE, recursive = TRUE)
suppressPackageStartupMessages(library(bmm))
version <- as.character(packageVersion("bmm"))
has <- function(fn) exists(fn, asNamespace("bmm"), inherits = FALSE)
# A function bmm ships from version `since` on. Its fixture is skipped only for an older bmm; a newer bmm
# without it stops the script, so a lost or renamed function cannot pass as a skipped fixture.
has_since <- function(fn, since) {
  if (has(fn)) return(TRUE)
  if (package_version(version) >= since) stop(sprintf("bmm %s has no %s(), which bmm ships from %s on", version, fn, since))
  FALSE
}
# 17 significant digits: a double reads back as the value bmm computed. digits = NA keeps 15, which moves
# values by up to 5e-15 relative, about 22 units in the last place near 1 (sqrt(32), a branch cut of
# pnorm(), lands below the cut).
write_fx <- function(name, cells, extra = list()) {
  jsonlite::write_json(c(list(bmm_version = version, generated = format(Sys.time(), "%Y-%m-%d")), extra, list(cells = cells)),
                       file.path(out, paste0(name, ".json")), digits = I(17), auto_unbox = TRUE)
  cat(sprintf("%-10s %3d cells\n", name, length(cells)))
}
x <- seq(-pi, pi, length.out = 61)
# 100 trials split as predicted, rounded so the counts sum to 100 (the pages' d*() calls do the same)
split100 <- function(p) { k <- floor(100 * p); r <- order(-(100 * p - k)); i <- r[seq_len(100 - sum(k))]; k[i] <- k[i] + 1; k }
# Quadrature rules the pages read from nodes.json, collected from the m3 and sdt sections below.
node_cells <- list()

# --- circular ---------------------------------------------------------------
cells <- list()
for (p in list(c(0, 5, .6), c(1, .5, .9), c(-2, 30, .2), c(0, .01, .5), c(2.5, 80, .7), c(0, 150, .99), c(0, 5, .001)))
  cells[[length(cells) + 1]] <- list(fn = "dmixture2p", args = list(mu = p[1], kappa = p[2], p_mem = p[3]),
    x = x, logd = dmixture2p(x, mu = p[1], kappa = p[2], p_mem = p[3], log = TRUE))
for (p in list(list(mu = c(0, 2, -1.5), kappa = 5, p_mem = .6, p_nt = .2),
               list(mu = c(0, 1), kappa = 20, p_mem = .3, p_nt = .6),
               list(mu = c(0, .5, -.5, 3, -3), kappa = 2, p_mem = .5, p_nt = .05)))
  cells[[length(cells) + 1]] <- list(fn = "dmixture3p", args = p, x = x, logd = do.call(dmixture3p, c(list(x = x, log = TRUE), p)))
for (p in list(list(mu = c(0, 2, -1.5), dist = c(0, .5, 2), c = 5, a = 2, b = 1, s = 2, kappa = 5),
               list(mu = c(0, 1, -1, 2.5, -2.5), dist = c(0, .3, .3, 1.5, 1.5), c = 8, a = .5, b = .2, s = 4, kappa = 12),
               list(mu = c(0, 3), dist = c(0, 1), c = 1, a = 1, b = 3, s = 0, kappa = .8),
               list(mu = 0, dist = 0, c = 4, a = 0, b = .5, s = 1, kappa = 120)))
  cells[[length(cells) + 1]] <- list(fn = "dimm", args = p, x = x, logd = do.call(dimm, c(list(x = x, log = TRUE), p)))
# Values the IMM page can set. Its preset places n items equidistant on the display circle and spreads
# the colours evenly around the wheel; a smaller spacing puts the non-targets at its multiples while
# the colours stay spread. Distances and colours are rounded to 2 decimals, as the page shows and
# uses them. The cells: the preset at set sizes 1 to 8; the c x a x s x kappa corners at set size 8;
# each of b, a, c, s at 0 (and b at 5); a typed kappa of 0; a spacing below the preset; the square
# layout. c, a and s move on the log scale over bmm's prior mean +- 3 SD, exp(-3) to exp(3); kappa
# from exp(-1) to exp(5); the page computes with exp(slider) at 3 significant digits. b is fixed at 1
# in bmm() and runs from 0 to 5 on the page.
equi <- function(n) {
  ang <- 2 * pi * seq_len(n - 1) / n
  list(mu = c(0, round(atan2(sin(ang), cos(ang)), 2)), dist = c(0, round(pmin(ang, 2 * pi - ang), 2)))
}
spaced <- function(n, spacing) {
  ang <- spacing * seq_len(n - 1)
  list(mu = equi(n)$mu, dist = c(0, round(abs(atan2(sin(ang), cos(ang))), 2)))
}
lo_hi <- c(.0498, 20.1)
start <- list(c = 1, a = 1, b = 1, s = 1, kappa = 7.39)
corners <- expand.grid(c = lo_hi, a = lo_hi, s = lo_hi, kappa = c(.368, 148))
corner_cells <- setNames(lapply(seq_len(nrow(corners)), function(i)
  c(equi(8), list(c = corners$c[i], a = corners$a[i], b = 1, s = corners$s[i], kappa = corners$kappa[i]))),
  do.call(paste, c(corners, sep = "_")))
imm_page <- c(
  lapply(c(1, 2, 4, 8), function(n) c(equi(n), start)),
  corner_cells,
  lapply(list(list(b = 0), list(b = 5), list(a = 0), list(c = 0), list(s = 0)), function(m)
    c(equi(8), modifyList(start, m))),
  list(c(equi(4), modifyList(start, list(kappa = 0))), c(spaced(8, .5), start)),
  # The square layout: straight-line distances in circle radii, unordered, from 0 (an item dragged
  # onto the target) to 3.11 (opposite corners, 2.2 * sqrt(2)), at both kappa ends.
  lapply(c(.368, 148), function(k) c(list(mu = c(0, 0.79, -2.36, 3.14, 1.57, -0.5, 2, -1.2),
    dist = c(0, 0.05, 3.11, 1.2, 0, 0.6, 2.4, 1.56)), modifyList(start, list(kappa = k, s = 20.1))))
)
for (p in imm_page)
  cells[[length(cells) + 1]] <- list(fn = "dimm", args = p, x = x, logd = do.call(dimm, c(list(x = x, log = TRUE), p)))
# Probability of a response within +-20 degrees of the target, the page's across-set-size measure.
# bmm has no pimm() yet (.NotYetImplemented), so the reference is integrate() over bmm's dimm().
# Three corners of the grid are selected by name (c_a_s_kappa) so added cells cannot shift them.
h <- 20 * pi / 180
mass_corners <- corner_cells[c("0.0498_0.0498_0.0498_0.368", "20.1_20.1_20.1_0.368", "20.1_20.1_20.1_148")]
stopifnot(!vapply(mass_corners, is.null, logical(1)))
for (p in c(lapply(1:8, function(n) c(equi(n), start)), mass_corners))
  cells[[length(cells) + 1]] <- list(fn = "dimm_mass", args = c(p, list(lo = -h, hi = h)),
    mass = integrate(function(x) do.call(dimm, c(list(x = x), p)), -h, h, rel.tol = 1e-12)$value)
for (p in list(c(3, 3.5), c(1, .5), c(10, 20), c(.2, 8), c(6, 60), c(2, 200), c(0.05, 1)))
  for (par in c("sqrtexp", "bessel"))
    cells[[length(cells) + 1]] <- list(fn = "dsdm", args = list(mu = 0, c = p[1], kappa = p[2], parametrization = par),
      x = x, logd = dsdm(x, mu = 0, c = p[1], kappa = p[2], log = TRUE, parametrization = par))
write_fx("circular", cells)

# --- m3 ----------------------------------------------------------------------
cells <- list()
# The gaussian rule needs bmm's quadrature rule (.m3_gauss_rule(), from bmm 1.4.1 on); the page reads it
# from nodes.json, so the explorer integrates on bmm's own nodes.
has_gauss <- has_since(".m3_gauss_rule", "1.4.1")
rules <- c("simple", "softmax", if (has_gauss) "gaussian")
if (has_gauss) {
  gh <- bmm:::.m3_gauss_rule()
  node_cells[[length(node_cells) + 1]] <- list(fn = ".m3_gauss_rule", args = list(n = length(gh$nodes)),
                                               nodes = gh$nodes, log_w = gh$log_w, log_Phi = gh$log_Phi)
}
grid <- expand.grid(a = c(2, .5, 0), cc = c(1, 3), n_other = c(3, 5, 1), n_npl = c(4, 0, 6), rule = rules,
                    stringsAsFactors = FALSE)
for (i in seq_len(nrow(grid))) {
  g <- grid[i, ]
  mod <- m3(resp_cats = c("corr", "other", "npl"), num_options = c(1, g$n_other, g$n_npl), choice_rule = g$rule, version = "ss")
  probs <- bmm:::.compute_m3_probability_vector(c(a = g$a, c = g$cc), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_ss", args = list(a = g$a, c = g$cc, n_other = g$n_other, n_npl = g$n_npl,
    b = mod$fixed_parameters$b, choice_rule = g$rule), probs = unname(probs))
}
# Values the M3 page can set: slider ends and midpoint at bmm's default prior mean +- 3 SD. Simple
# moves log a and log c, and the page computes with exp(slider) at 3 significant digits; softmax and
# gaussian are linear on [0, 6] and [-1, 5]. Full a x c cross at middle counts, the four extreme
# pairings at the count limits.
levels <- list(simple = list(a = c(.0498, 1, 20.1), c = c(1, 20.1, 403)), softmax = list(a = c(0, 3, 6), c = c(0, 3, 6)),
               gaussian = list(a = c(-1, 2, 5), c = c(-1, 2, 5)))[rules]
ext <- data.frame(i = c(1, 3, 1, 3), j = c(1, 3, 3, 1))
idx <- rbind(data.frame(expand.grid(i = 1:3, j = 1:3), n_other = 4, n_npl = 5),
             data.frame(ext, n_other = 0, n_npl = 0), data.frame(ext, n_other = 8, n_npl = 12))
for (rule in names(levels)) for (k in seq_len(nrow(idx))) {
  ac <- c(levels[[rule]]$a[idx$i[k]], levels[[rule]]$c[idx$j[k]]); n <- c(idx$n_other[k], idx$n_npl[k])
  mod <- m3(resp_cats = c("corr", "other", "npl"), num_options = c(1, n), choice_rule = rule, version = "ss")
  probs <- bmm:::.compute_m3_probability_vector(c(a = ac[1], c = ac[2]), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_ss", args = list(a = ac[1], c = ac[2], n_other = n[1], n_npl = n[2],
    b = mod$fixed_parameters$b, choice_rule = rule), probs = unname(probs))
}
cs_cell <- function(a, c, f, num_options, rule) {
  mod <- m3(resp_cats = c("corr", "dist_context", "other", "dist_other", "npl"), num_options = num_options,
            choice_rule = rule, version = "cs")
  probs <- bmm:::.compute_m3_probability_vector(c(a = a, c = c, f = f), mod)
  list(fn = "m3_cs", args = list(a = a, c = c, f = f, num_options = num_options, b = mod$fixed_parameters$b,
    choice_rule = rule), probs = unname(probs))
}
for (rule in rules) for (f in c(.2, .8)) cells[[length(cells) + 1]] <- cs_cell(1, 2, f, c(1, 4, 1, 4, 8), rule)
# Complex-span values the page can set: f on the logit scale over bmm's logistic(0, 1) prior, mean +- 3 SD
# rounded to +-5.44, at 3 significant digits as the page computes it. a and c at the corners above;
# counts (corr, dist_context, other, dist_other, npl) at the start values and at both limits.
f_lv <- signif(plogis(c(-5.44, 0, 5.44)), 3)
for (rule in rules) {
  lv <- levels[[rule]]
  for (k in seq_len(nrow(ext))) for (fi in c(1, 3))
    cells[[length(cells) + 1]] <- cs_cell(lv$a[ext$i[k]], lv$c[ext$j[k]], f_lv[fi], c(1, 1, 4, 3, 4), rule)
  cells[[length(cells) + 1]] <- cs_cell(lv$a[2], lv$c[2], f_lv[2], c(1, 1, 4, 3, 4), rule)
  for (n in list(c(1, 0, 0, 0, 0), c(1, 2, 5, 4, 9))) for (q in c(1, 3))
    cells[[length(cells) + 1]] <- cs_cell(lv$a[q], lv$c[q], f_lv[q], n, rule)
}
write_fx("m3", cells)

# --- mpt ---------------------------------------------------------------------
# The span tree of the MPT page (js/models/mpt-span-tree.js holds the same branches; the test compares the
# strings). Guessing rates follow from the response set and enter as covariates. dmpt() needs bmm >= 1.4.1;
# an older bmm writes no mpt.json, and the test skips it.
if (has_since("dmpt", "1.4.1")) {
  branches <- list(
    corr = "Pi * Pb + Pi * (1 - Pb) * gl_corr + (1 - Pi) * g_corr",
    other = "Pi * (1 - Pb) * gl_other + (1 - Pi) * g_other",
    npl = "(1 - Pi) * g_npl")
  mod <- mpt(mpt_tree("span", branches), covariates = c("gl_corr", "gl_other", "g_corr", "g_other", "g_npl"))
  p_lv <- signif(plogis(c(-5.44, 0, 5.44)), 3)
  cells <- list()
  for (n in list(c(4, 5), c(0, 0), c(8, 12), c(0, 6), c(3, 0))) for (p_i in p_lv) for (p_b in p_lv) {
    N <- 1 + sum(n)
    cv <- c(gl_corr = 1 / (1 + n[1]), gl_other = n[1] / (1 + n[1]), g_corr = 1 / N, g_other = n[1] / N, g_npl = n[2] / N)
    probs <- bmm:::.mpt_probability_vector(c(Pi = p_i, Pb = p_b), mod, covariates = cv)
    x <- split100(unname(probs))
    cells[[length(cells) + 1]] <- list(fn = "mpt_span", args = list(Pi = p_i, Pb = p_b, n_other = n[1], n_npl = n[2]),
      probs = unname(probs), counts = x,
      logd = dmpt(x, pars = c(Pi = p_i, Pb = p_b), mpt_model = mod, covariates = cv))
  }
  write_fx("mpt", cells, list(branches = branches))
} else cat("mpt        skipped: this bmm has no dmpt()\n")

# --- sdt ---------------------------------------------------------------------
# Yes/no, m-AFC and rating SDT under all four noise distributions. The page sliders span bmm's default priors,
# mean +- 3 SD on the link scale: d normal(1, 1) on [-2, 4], criterion normal(0.5, 1.5) on [-4, 5], bias
# normal(0, 1.5) on [-4.5, 4.5], sdratio normal(0, 0.3) on the log scale, a ratio from exp(-0.9) to exp(0.9),
# which the page computes at 3 significant digits (0.407, 2.46). The ROC panels sweep the criterion past those
# ends, and the m-AFC page matches d across distributions, hence d up to 7. Vectorised cells: one call per
# distribution and design, its arguments as columns.
dists <- c("normal", "gumbel_min", "gumbel_max", "logistic")
if (has_since("dsdt_yn", "1.4.1")) {
  cells <- list()
  s_lv <- c(.407, .5, 1, 2, 2.46)
  for (dist in dists) {
    g <- expand.grid(stimulus = 0:1, criterion = c(-6, -4, -1, .5, 2, 5, 8), sdratio = s_lv, d = c(-2, 0, 1, 2.5, 4, 5))
    yn <- function(n_old, n_trials) dsdt_yn(n_old, n_trials, g$stimulus, g$d, criterion = g$criterion,
                                            sdratio = g$sdratio, dist = dist, log = TRUE)
    # one "old" response in one trial: log P("old"), the hit rate on signal rows and the false-alarm rate on noise
    cells[[length(cells) + 1]] <- list(fn = "dsdt_yn", args = c(as.list(g), list(dist = dist)),
      log_p_old = yn(1, 1), log_p_new = yn(0, 1), logd_37 = yn(37, 100))
    # the same boundary given as bias, measured from the midpoint between the two means
    g <- expand.grid(stimulus = 0:1, bias = c(-4.5, 0, 1, 4.5), sdratio = c(.407, 1, 2.46), d = c(-2, 1, 4))
    cells[[length(cells) + 1]] <- list(fn = "dsdt_yn_bias", args = c(as.list(g), list(dist = dist)),
      log_p_old = dsdt_yn(1, 1, g$stimulus, g$d, bias = g$bias, sdratio = g$sdratio, dist = dist, log = TRUE))
    # the equal-variance d, criterion and bias that one (hit, false-alarm) pair implies
    g <- expand.grid(fa_rate = c(1e-12, 1e-4, .2, .5, .9, 1 - 1e-12), hit_rate = c(1e-12, .05, .5, .8, .999, 1 - 1e-12))
    cells[[length(cells) + 1]] <- list(fn = "sdt_d", args = c(as.list(g), list(dist = dist)),
      d = sdt_d(g$hit_rate, g$fa_rate, dist), criterion = sdt_criterion(g$hit_rate, g$fa_rate, dist),
      bias = sdt_bias(g$hit_rate, g$fa_rate, dist))
    # m-AFC: log P(correct), log P(error) and 100 trials at the rounded expected count
    g <- expand.grid(m = 2:10, d = c(-3, -2, -1, 0, .5, 1, 1.5, 2.5, 4, 5, 7))
    lp <- dsdt_mafc(1, 1, g$m, g$d, dist = dist, log = TRUE)
    k <- round(100 * exp(lp))
    cells[[length(cells) + 1]] <- list(fn = "dsdt_mafc", args = c(as.list(g), list(dist = dist, n_correct = k)),
      log_pc = lp, log_1m_pc = dsdt_mafc(0, 1, g$m, g$d, dist = dist, log = TRUE),
      logd = dsdt_mafc(k, 100, g$m, g$d, dist = dist, log = TRUE))
  }
  # Rating: K - 1 thresholds measured from the noise location. The page starts at the thresholds bmm's default
  # threshold_type ("parsimonious") places at its prior means (criterion 0.5, spacing 0); the corners at K = 3
  # and 8 add thresholds spread over the whole slider range and thresholds one slider step (0.05) apart.
  start_thr <- function(K) bmm:::.sdt_make_thresholds(.5, K, "parsimonious", spacing = 0)
  rating_cell <- function(K, thr, dist) {
    g <- expand.grid(stimulus = 0:1, sdratio = c(.407, 1, 2.46), d = c(-2, 1, 4))
    # one response in category j: the density is the probability of category j
    lp <- sapply(seq_len(K), function(j) {
      cnt <- matrix(0, nrow(g), K); cnt[, j] <- 1
      dsdt_rating(cnt, g$stimulus, g$d, thr, g$sdratio, dist = dist, log = TRUE)
    })
    counts <- t(apply(exp(lp), 1, split100))
    list(fn = "dsdt_rating", args = c(list(thresholds = thr, dist = dist), as.list(g),
                                      list(counts = lapply(seq_len(nrow(g)), function(i) counts[i, ]))),
      logp = as.vector(t(lp)), logd = dsdt_rating(counts, g$stimulus, g$d, thr, g$sdratio, dist = dist, log = TRUE))
  }
  for (K in 3:8) for (dist in dists) cells[[length(cells) + 1]] <- rating_cell(K, start_thr(K), dist)
  for (K in c(3, 8)) for (dist in dists) {
    cells[[length(cells) + 1]] <- rating_cell(K, seq(-4, 5, length.out = K - 1), dist)
    cells[[length(cells) + 1]] <- rating_cell(K, seq(1, by = .05, length.out = K - 1), dist)
  }
  # The page's "In bmm" code gives its thresholds as threshold_type = "log_distance": the criterion (the middle
  # threshold for even K, the centre of the middle category for odd K) and the log widths of the K - 2 intervals.
  # The mapping is this script's; bmm's builder must return the thresholds from it.
  for (K in 3:8) for (thr in list(start_thr(K), seq(-4, 5, length.out = K - 1))) {
    lo <- (K - 1) %/% 2
    criterion <- if (K %% 2 == 0) thr[K / 2] else (thr[lo] + thr[lo + 1]) / 2
    deltas <- log(diff(thr))
    rebuilt <- bmm:::.sdt_make_thresholds(criterion, K, "log_distance", deltas = deltas)
    stopifnot(isTRUE(all.equal(rebuilt, thr, tolerance = 1e-12)))
    cells[[length(cells) + 1]] <- list(fn = "thresholds_log_distance", args = list(n_ratings = K, thresholds = thr),
      criterion = criterion, deltas = I(deltas), rebuilt = rebuilt, parsimonious_start = start_thr(K))
  }
  write_fx("sdt", cells)
  # bmm's m-AFC quadrature: 40-point Gauss-Hermite for normal noise, 64-point Gauss-Legendre on [0, 1] for
  # logistic noise (the two Gumbel distributions have closed forms)
  node_cells[[length(node_cells) + 1]] <- list(fn = ".mafc_gh", args = list(n = 40L),
    nodes = bmm:::.mafc_gh_nodes, weights = bmm:::.mafc_gh_weights)
  node_cells[[length(node_cells) + 1]] <- list(fn = ".mafc_gl", args = list(n = 64L),
    nodes = bmm:::.mafc_gl_nodes, weights = bmm:::.mafc_gl_weights)
} else cat("sdt        skipped: this bmm has no dsdt_yn()\n")
if (length(node_cells)) write_fx("nodes", node_cells)

# --- math --------------------------------------------------------------------
# logPnorm() in js/lib/math.js is R's pnorm(x, log.p = TRUE), which bmm's gaussian M3 rule calls. Points on
# both sides of the branch cuts of R's algorithm (|x| = 0.67448975 and sqrt(32)), at 0 and +-1e-17, out to
# the far lower tail and to the upper tail where log Phi underflows to 0.
x <- c(-1e5, -1e3, -200, -50, -38.5, -37.5193, -20, -10, -8, -5.656854249492380195, -5.66, -5.65, -3, -1,
       -0.67448975, -0.6745, -0.674, -0.3, -1e-17, 0, 1e-17, 0.3, 0.674, 0.67448975, 0.6745, 1, 3, 5.65,
       5.656854249492380195, 5.66, 8, 8.2924, 10, 20, 37, 38.5, 40, 1e3)
# qnorm() in js/lib/math.js is R's qnorm(p) (Wichura's AS 241), which the SDT pages use to place an ROC and to
# find the equal-variance d of one operating point. Points on both sides of its branch cuts (p = 0.075 and 0.925,
# where |p - 0.5| = 0.425, and p = exp(-25)), out to the tails, where it is steepest.
p <- c(1e-300, 1e-100, 1e-20, 1e-12, exp(-25) * c(.999, 1.001), 1e-6, .001, .0749, .075, .0751, .2, .5 - 1e-12, .5,
       .6, .9249, .925, .9251, .999, 1 - 1e-6, 1 - 1e-12, 1 - 2^-52)
write_fx("math", list(list(fn = "pnorm", args = list(log.p = TRUE), x = x, logd = pnorm(x, log.p = TRUE)),
                      list(fn = "qnorm", args = list(), x = p, q = qnorm(p))))
cat("bmm", version, "->", out, "\n")
