#!/usr/bin/env Rscript
# Writes the parity fixtures from the installed bmm. Usage: Rscript R/make_fixtures.R <out_dir>
# The grids are literal and small; they cover the slider ranges the pages expose and the corners
# where a port is weakest (kappa near 0 and above 100, probabilities near 0 and 1, counts of 0).
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "tests/parity/fixtures"
dir.create(out, showWarnings = FALSE, recursive = TRUE)
suppressPackageStartupMessages(library(bmm))
# R's default generators, named so that a user setting (.Rprofile, RNGversion()) cannot change the sampled cells
RNGkind("Mersenne-Twister", "Inversion", "Rejection")
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

# --- rt ----------------------------------------------------------------------
# The response-time pages: ezdm, cswald, ddm. Slider ranges are bmm's default prior means +- 3 SD on the
# link scale, at 3 significant digits as the pages compute them. drift has an identity link; its cauchy(0, 1)
# prior in ezdm and ddm has no SD, so the page uses location +- 3 scale, as the normal(0, 1) of cswald crisk.
# ezdm and ddm: bound exp(+-1.5), ndt exp(-1.5 +- 1.5), zr plogis(+-1.5). cswald: drift exp(+-3) in simple,
# bound exp(+-0.9), ndt exp(-2 +- 0.9), zr plogis(+-0.9) in crisk. s is fixed at 1 in bmm(); a few cells move it.
if (has_since("dezdm", "1.4.1") && has_since("dcswald", "1.4.1") && has_since("dddm", "1.4.1")) {
  cells <- list()
  ez_bound <- c(.223, 1, 4.48)
  ez_zr <- c(.182, .5, .818)
  # The forward EZ map the ezdm page draws: P(upper) and the mean and variance of the decision time, from
  # bmm's own moment functions. The drifts reach every branch of bmm's code: no drift (|2 drift bound| < 1e-4),
  # the small-argument series (bound * |drift| < 0.7), both signs, and the saturated cgf (bound * |drift| > 30,
  # typed values only).
  ez_drift <- c(-3, -1, -.1, -2e-5, 0, 2e-5, .05, .5, 1.5, 3)
  # The series coefficients are constants in bmm; js/models/rt.js holds a copy, which the test compares.
  cells[[1]] <- list(fn = "ezdm_log_sinhc_coef", args = list(), values = bmm:::.EZDM_LOG_SINHC_COEF)
  for (b in ez_bound) for (s in c(1, .7)) {
    m <- bmm:::.ezdm_moments_3par(ez_drift, b, s)
    cells[[length(cells) + 1]] <- list(fn = "ezdm_moments_3par", args = list(drift = ez_drift, bound = b, s = s),
      moments = m[c("pC", "MDT", "VRT", "k3", "k4")])
  }
  for (b in ez_bound) for (zr in ez_zr) {
    m <- bmm:::.ezdm_moments_4par(ez_drift, b, zr, 1)
    cells[[length(cells) + 1]] <- list(fn = "ezdm_moments_4par", args = list(drift = ez_drift, bound = b, zr = zr, s = 1),
      moments = m[c("pC", "mdt_upper", "mdt_lower", "vrt_upper", "vrt_lower", "k3_upper", "k3_lower", "k4_upper", "k4_lower")])
  }
  m <- bmm:::.ezdm_moments_3par(c(10, -10), 4.48, 1)
  cells[[length(cells) + 1]] <- list(fn = "ezdm_moments_3par", args = list(drift = c(10, -10), bound = 4.48, s = 1),
    moments = m[c("pC", "MDT", "VRT", "k3", "k4")])
  # dezdm(): summary statistics near and away from the ones the parameters predict, at trial counts from 3
  # (the smallest bmm accepts) to 500, with n_upper from 0 to n_trials. The 4par cells give one boundary fewer
  # than 2 responses, so its RT terms drop out, and one boundary NA. 4par logit P(upper) has its own branches
  # (.ezdm_logit_pc): no drift (|2 drift bound| < 1e-4) at the ezdm page's starting values and at tiny drifts
  # of either sign, and a small negative drift on the falling branch.
  ez_par <- list(c(1.5, 1, .3), c(-1, 4.48, .05), c(3, .223, 1), c(0, 1, .2), c(.05, 2, .4), c(2, 4.48, .3))
  for (p in ez_par) {
    m <- bmm:::.ezdm_moments_3par(p[1], p[2], 1)
    n_trials <- c(3, 20, 100, 100, 500, 100)
    n_upper <- pmin(n_trials, round(c(m$pC * n_trials[1:3], 0, m$pC * 500, 100)))
    mean_rt <- p[3] + m$MDT * c(1, 1.1, .9, 1, 1.02, 1.3)
    var_rt <- m$VRT * c(1, .8, 1.25, 1, 1, 2)
    cells[[length(cells) + 1]] <- list(fn = "dezdm", args = list(mean_rt = mean_rt, var_rt = var_rt, n_upper = n_upper,
      n_trials = n_trials, drift = p[1], bound = p[2], ndt = p[3], s = 1, version = "3par"),
      logd = dezdm(mean_rt, var_rt, n_upper, n_trials, p[1], p[2], p[3], version = "3par"))
  }
  for (p in list(c(1.5, 1, .3, .5), c(-1, 4.48, .05, .182), c(3, .223, 1, .818), c(.8, 2, .2, .3),
                 c(0, 1, .223, .5), c(2e-5, 2, .2, .3), c(-1e-5, 4.48, .1, .7), c(-.05, 1.5, .3, .6))) {
    m <- bmm:::.ezdm_moments_4par(p[1], p[2], p[4], 1)
    for (k in list(c(100, .5), c(20, 1), c(100, 0), c(50, 1.2))) {
      n_upper <- min(k[1], max(0, round(m$pC * k[1] * k[2])))
      mean_rt <- c(p[3] + m$mdt_upper * (.5 + k[2]), p[3] + m$mdt_lower * (2 - k[2]))
      var_rt <- c(m$vrt_upper * (.5 + k[2]), m$vrt_lower * (2 - k[2]))
      if (k[2] == 1.2) { mean_rt[2] <- NA; var_rt[2] <- NA }
      cells[[length(cells) + 1]] <- list(fn = "dezdm", args = list(mean_rt = mean_rt, var_rt = var_rt, n_upper = n_upper,
        n_trials = k[1], drift = p[1], bound = p[2], ndt = p[3], zr = p[4], s = 1, version = "4par"),
        logd = dezdm(mean_rt, var_rt, n_upper, k[1], p[1], p[2], p[3], zr = p[4], version = "4par"))
    }
  }
  # Exactly one response at a boundary: its statistics are finite here, so only the count of 1 drops its RT terms.
  m <- bmm:::.ezdm_moments_4par(1.5, 1, .5, 1)
  for (n_upper in c(1, 19)) {
    mean_rt <- .3 + c(m$mdt_upper, m$mdt_lower); var_rt <- c(m$vrt_upper, m$vrt_lower)
    cells[[length(cells) + 1]] <- list(fn = "dezdm", args = list(mean_rt = mean_rt, var_rt = var_rt, n_upper = n_upper,
      n_trials = 20, drift = 1.5, bound = 1, ndt = .3, zr = .5, s = 1, version = "4par"),
      logd = dezdm(mean_rt, var_rt, n_upper, 20, 1.5, 1, .3, zr = .5, version = "4par"))
  }
  # dcswald(): log densities of both responses on an rt grid from just above ndt to 3 s, both versions.
  rt_after <- function(ndt) ndt + c(.002, .01, .03, .06, .1, .15, .2, .3, .4, .5, .7, 1, 1.5, 2, 3)
  cs_par <- list(
    simple = list(c(1, 1, .135, 1), c(.0498, .407, .055, 1), c(20.1, 2.46, .333, 1), c(20.1, .407, .055, 1),
                  c(.0498, 2.46, .333, 1), c(3, 1.5, .2, .6), c(5, .8, .1, 1.4)),
    crisk = list(c(1, 1, .135, .5, 1), c(-3, .407, .055, .289, 1), c(3, 2.46, .333, .711, 1), c(0, 1, .135, .5, 1),
                 c(3, .407, .055, .289, 1), c(-1, 2.46, .2, .711, 1), c(2, 1.5, .1, .5, .7)))
  for (ver in names(cs_par)) for (p in cs_par[[ver]]) for (r in 0:1) {
    rt <- rt_after(p[3]); zr <- if (ver == "crisk") p[4] else .5; s <- p[length(p)]
    cells[[length(cells) + 1]] <- list(fn = "dcswald", args = list(response = r, drift = p[1], bound = p[2], ndt = p[3],
      zr = zr, s = s, version = ver), x = rt,
      logd = dcswald(rt, rep(r, length(rt)), p[1], p[2], p[3], zr = zr, s = s, version = ver))
  }
  # dddm(): through rtdists::ddiffusion. Both responses, an rt grid from just above ndt to 5 s, the slider
  # corners and middles; far tails included, where fast-dm's truncated series departs from the exact
  # density and the port has to follow it. The cswald page compares its simple version with dddm(drift,
  # 2 * bound, ndt, zr = 0.5), which reaches drift exp(+-3) and bound 2 exp(+-0.9): its start and corners.
  # Where bmm's density underflows to 0 the rt goes to zero_x, at which the port must return -Inf.
  ddm_par <- list(c(0, 1, .223, .5), c(1.5, 1, .223, .5), c(-3, .223, .0498, .182), c(3, 4.48, 1, .818),
                  c(3, 4.48, .0498, .182), c(-3, 4.48, .3, .5), c(3, .223, .3, .818), c(.5, 2, .2, .3),
                  c(-.5, 2.5, .15, .65), c(2, .6, .25, .5), c(0, 4.48, .1, .5), c(1, 1.5, .2, .7),
                  c(1, 2, .135, .5), c(20.1, 4.92, .333, .5), c(20.1, .814, .055, .5), c(.0498, 4.92, .333, .5),
                  c(.0498, .814, .055, .5),
                  # At rt = ndt + 1 fast-dm's truncated series has the wrong sign (lower response here, the
                  # upper one in the mirror cell), and rtdists returns its absolute value: bmm's log density
                  # there is log|sum|, which the port has to reproduce instead of a NaN.
                  c(2.5, 4.48, .2, .818), c(-2.5, 4.48, .2, .182))
  rt_ddm <- function(ndt) ndt + c(.001, .005, .01, .02, .05, .1, .15, .2, .3, .4, .5, .7, 1, 1.5, 2, 3, 5)
  for (p in ddm_par) for (r in 0:1) {
    rt <- rt_ddm(p[3])
    logd <- dddm(rt, rep(r, length(rt)), p[1], p[2], p[3], zr = p[4])
    stopifnot(!is.na(logd), logd < Inf)
    keep <- is.finite(logd)
    cells[[length(cells) + 1]] <- list(fn = "dddm", args = list(response = r, drift = p[1], bound = p[2], ndt = p[3], zr = p[4]),
      x = rt[keep], logd = logd[keep], zero_x = I(rt[!keep]))
  }
  write_fx("rt", cells)
} else cat("rt         skipped: this bmm lacks dezdm(), dcswald() or dddm()\n")

# --- sdt ---------------------------------------------------------------------
# Yes/no, m-AFC and rating SDT under all four noise distributions. The page sliders span bmm's default priors,
# mean +- 3 SD on the link scale: d normal(1, 1) on [-2, 4], criterion normal(0.5, 1.5) on [-4, 5], bias
# normal(0, 1.5) on [-4.5, 4.5], sdratio normal(0, 0.3) on the log scale, a ratio from exp(-0.9) to exp(0.9),
# which the page computes at 3 significant digits (0.407, 2.46). The ROC panels sweep the criterion past those
# ends. Vectorised cells: one call per distribution and design, its arguments as columns.
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
    # A typed criterion of +-1000 sends log P("old") or log P("new") to -Inf under both Gumbel distributions
    # (exp() of the standardised criterion underflows or overflows); all old and all new responses then take
    # the zero-count branch, where the -Inf term contributes nothing.
    g <- expand.grid(stimulus = 0:1, criterion = c(-1000, 1000), sdratio = c(.407, 2.46), d = 1)
    cells[[length(cells) + 1]] <- list(fn = "dsdt_yn_tail", args = c(as.list(g), list(dist = dist)),
      log_p_old = yn(1, 1), log_p_new = yn(0, 1), logd_0 = yn(0, 10), logd_10 = yn(10, 10))
    # the equal-variance d, criterion and bias that one (hit, false-alarm) pair implies
    g <- expand.grid(fa_rate = c(1e-12, 1e-4, .2, .5, .9, 1 - 1e-12), hit_rate = c(1e-12, .05, .5, .8, .999, 1 - 1e-12))
    cells[[length(cells) + 1]] <- list(fn = "sdt_d", args = c(as.list(g), list(dist = dist)),
      d = sdt_d(g$hit_rate, g$fa_rate, dist), criterion = sdt_criterion(g$hit_rate, g$fa_rate, dist),
      bias = sdt_bias(g$hit_rate, g$fa_rate, dist))
    # m-AFC: log P(correct), log P(error) and 100 trials at the rounded expected count. The page draws, for every
    # m, the d at which each other distribution gives the same P(correct); over the sliders (d -2 to 4, m 2 to 10)
    # that matched d runs from -7.45 to 8.00, so the grid spans -8 to 8.5. A d typed beyond the sliders is matched
    # too, but is not covered here.
    g <- expand.grid(m = 2:10, d = c(-8, -6, -4.5, -3, -2, -1, 0, .5, 1, 1.5, 2.5, 4, 5, 7, 8.5))
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
    # bmm gives NA, not -Inf, for a category whose bounds both underflow (log1m_exp()'s ifelse() turns the NaN of
    # -Inf - -Inf into NA, which the is.nan() guard in .sdt_category_log_probs() misses); it has no mass, so no count
    counts <- t(apply(exp(lp), 1, function(p) split100(ifelse(is.na(p), 0, p))))
    list(fn = "dsdt_rating", args = c(list(thresholds = thr, dist = dist), as.list(g),
                                      list(counts = lapply(seq_len(nrow(g)), function(i) counts[i, ]))),
      logp = as.vector(t(lp)), logd = dsdt_rating(counts, g$stimulus, g$d, thr, g$sdratio, dist = dist, log = TRUE))
  }
  for (K in 3:8) for (dist in dists) cells[[length(cells) + 1]] <- rating_cell(K, start_thr(K), dist)
  for (K in c(3, 8)) for (dist in dists) {
    cells[[length(cells) + 1]] <- rating_cell(K, seq(-4, 5, length.out = K - 1), dist)
    cells[[length(cells) + 1]] <- rating_cell(K, seq(1, by = .05, length.out = K - 1), dist)
  }
  # Thresholds typed far into the tails: under both Gumbel distributions the outer categories have both bounds
  # underflow (log cdf or log survival -Inf at both ends), the -Inf branch of the port's category log P.
  for (dist in dists) cells[[length(cells) + 1]] <- rating_cell(6, c(-1000, -800, 0, 800, 1000), dist)
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
# lgamma() for the gamma and binomial terms of dezdm(): below 1, around the switch to Stirling's series
# at 10, and out to the shapes of large trial counts.
xg <- c(1e-8, .1, .5, 1, 1.5, 2, 2.5, 3, 7.3, 9.99, 10, 10.01, 12.5, 30, 101, 250.7, 1e3, 5e3, 1e5)
# qnorm() in js/lib/math.js is R's qnorm(p) (Wichura's AS 241), which the SDT pages use to place an ROC and to
# find the equal-variance d of one operating point. Points on both sides of its branch cuts (p = 0.075 and 0.925,
# where |p - 0.5| = 0.425, and p = exp(-25)), out to the tails, where it is steepest.
p <- c(1e-300, 1e-100, 1e-20, 1e-12, exp(-25) * c(.999, 1.001), 1e-6, .001, .0749, .075, .0751, .2, .5 - 1e-12, .5,
       .6, .9249, .925, .9251, .999, 1 - 1e-6, 1 - 1e-12, 1 - 2^-52)
# qgamma() in js/lib/math.js draws an ezdm cell's var_rt: shape VRT^2 / W, from below 0.5 (2 rts at a boundary) to the
# hundreds (500 trials), at quantiles out to the tails a 32-bit uniform reaches (2^-33 and 1 - 2^-33) and beyond.
gq <- expand.grid(p = c(2^-33, 1e-12, 1e-6, .001, .1, .5, .9, .999, 1 - 1e-6, 1 - 2^-33),
                  shape = c(.05, .3, 1, 2.5, 10, 50, 249.5, 1000))
# Below shape 0.15 an earlier port's Newton iteration overshot from Wilson and Hilferty's start and stalled, returning
# about 1e17 for some 1e-5 of the uniforms: two such points (shapes 0.098 and 0.0588, which a 4par boundary with 2 rts
# reaches on the ezdm page), then 2000 seeded points at shapes 0.04 to 0.3 (log-uniform), p uniform for 1600 of them,
# 10^-U(1, 10) and 1 - 10^-U(1, 10) for 200 each.
set.seed(437)
gs <- data.frame(p = c(runif(1600), 10^-runif(200, 1, 10), 1 - 10^-runif(200, 1, 10)), shape = exp(runif(2000, log(.04), log(.3))))
# Last, four points where the answer is subnormal (below 2.2e-308, on a grid of 2^-1074): a Newton step there can be
# shorter than the grid and leave x where it is.
gd <- data.frame(p = c(0.00021379620895019876, 0.00003801893963205317, 0.00002691534803926727, 0.0000033884415613919373),
                   shape = c(0.011481536214968266, 0.013803842646028176, 0.01445439770745857, 0.017378008287492912))
gq <- rbind(gq, data.frame(p = c(0.5502553466940299, 0.74133601563517), shape = c(.098, .0588)), gs, gd)
write_fx("math", list(list(fn = "pnorm", args = list(log.p = TRUE), x = x, logd = pnorm(x, log.p = TRUE)),
                      list(fn = "lgamma", args = list(), x = xg, logd = lgamma(xg)),
                      list(fn = "qnorm", args = list(), x = p, q = qnorm(p)),
                      list(fn = "qgamma", args = list(rate = 1), x = gq$p, shape = gq$shape, q = qgamma(gq$p, gq$shape))))
# --- simulate ----------------------------------------------------------------
# Simulated data on the circular pages. (a) The expected statistics of the response error by integrate() over
# bmm's d*(): mean |x|, mean cos x, mean sin x (the circular SD comes from the last two) and P(|x| <= 20 deg).
# (b) The same four as sample means of n draws from bmm's r*(), each with its Monte Carlo SE, sd / sqrt(n); this
# sample and the explorer's are each held to (a) within 5 SE. Cells: page starts, a narrow and a wide memory peak, the
# IMM page's corner with the narrowest peaks, and slider ends where an inversion defect at the ends of the CDF or
# at the +-180 deg seam would show: mixture2p with p_mem 1, mixture3p with p_nt 1 and a non-target at 3.14 (its
# peak wraps the seam), imm at set size 1. Each cell draws from its own seed, 437 + its 1-based position (438 for
# the first cell), written into the cell, so the cells' sample errors are independent; the explorer's test draws
# from the same seed. The RNG kind is set, so that an .Rprofile cannot change the stream.
sim_n <- 1e5
w20 <- 20 * pi / 180
sim_stats <- function(x) {
  v <- cbind(mean_abs = abs(x), mean_cos = cos(x), mean_sin = sin(x), within = as.numeric(abs(x) <= w20))
  list(mean = as.list(colMeans(v)), se = as.list(apply(v, 2, sd) / sqrt(length(x))))
}
sim_expected <- function(d) {
  int <- function(f, lo, hi) integrate(function(x) f(x) * d(x), lo, hi, rel.tol = 1e-12, subdivisions = 2000L)$value
  list(mean_abs = int(function(x) -x, -pi, 0) + int(function(x) x, 0, pi),
       mean_cos = int(cos, -pi, 0) + int(cos, 0, pi), mean_sin = int(sin, -pi, 0) + int(sin, 0, pi),
       within = int(function(x) 1, -w20, 0) + int(function(x) 1, 0, w20))
}
sim_cell <- function(fn, args, seed) {
  d <- function(x) do.call(get(paste0("d", fn)), c(list(x = x), args))
  RNGkind("Mersenne-Twister", "Inversion", "Rejection")
  set.seed(seed)
  draws <- do.call(get(paste0("r", fn)), c(list(n = sim_n), args))
  list(fn = fn, args = args, expected = sim_expected(d), n = sim_n, seed = seed, sample = sim_stats(draws))
}
# kappa e^5 is 148, as the pages compute exp(slider) at 3 significant digits.
sim_specs <- c(
  lapply(list(list(mu = 0, kappa = 5, p_mem = .6), list(mu = 0, kappa = 148, p_mem = .9), list(mu = 0, kappa = .5, p_mem = .3),
              list(mu = 0, kappa = 148, p_mem = 1)),
         function(a) list("mixture2p", a)),
  lapply(list(list(mu = c(0, 2, -1.5), kappa = 5, p_mem = .6, p_nt = .2), list(mu = c(0, 1), kappa = 20, p_mem = .3, p_nt = .6),
              list(mu = c(0, .5, -.5, 3, -3), kappa = 2, p_mem = .5, p_nt = .05), list(mu = c(0, 3.14), kappa = 148, p_mem = 0, p_nt = 1)),
         function(a) list("mixture3p", a)),
  lapply(list(c(equi(4), start), c(spaced(8, .5), start),
              c(equi(8), list(c = 20.1, a = .0498, b = 1, s = 20.1, kappa = 148)),
              c(list(mu = c(0, 0.79, -2.36, 3.14), dist = c(0, 0.05, 3.11, 1.2)), modifyList(start, list(kappa = 30))),
              c(equi(1), start)),
         function(a) list("imm", a)),
  lapply(list(list(mu = 0, c = 7.39, kappa = 5.75, parametrization = "sqrtexp"), list(mu = 0, c = 1, kappa = 2, parametrization = "sqrtexp"),
              list(mu = 0, c = 15, kappa = 50, parametrization = "sqrtexp"), list(mu = 0, c = 20, kappa = 50, parametrization = "sqrtexp"),
              list(mu = 0, c = 3, kappa = 5, parametrization = "bessel")),
         function(a) list("sdm", a))
)
cells <- Map(function(s, i) sim_cell(s[[1]], s[[2]], 437 + i), sim_specs, seq_along(sim_specs))
write_fx("simulate", unname(cells))

# --- simulate_counts ---------------------------------------------------------
# Simulated data on the categorical and signal detection pages. Per cell: the probabilities bmm's r*() samples from
# (the helper it calls, rows noise then signal for rating), and one draw of n = 1e5 trials from that r*() as
# proportions per category with their SE, sqrt(p (1 - p) / n). yn and rating draw n noise and n signal trials.
# Cell i draws after set.seed(437 + i) and records the seed, so each cell is its own stream and the explorer's
# sample of the cell draws its uniforms from the same seed.
cnt_n <- 1e5
shares <- function(x) { p <- as.numeric(x) / cnt_n; list(p = p, se = sqrt(p * (1 - p) / cnt_n)) }
cells <- list()
count_cell <- function(fn, args, probs, draw) {
  seed <- 437 + length(cells) + 1
  set.seed(seed)
  x <- draw()
  cell <- if (is.matrix(probs)) list(noise = c(list(probs = probs[1, ]), shares(x[1, ])), signal = c(list(probs = probs[2, ]), shares(x[2, ])))
    else c(list(probs = unname(probs)), shares(x))
  cells[[length(cells) + 1]] <<- c(list(fn = fn, seed = seed, n = cnt_n, args = args), cell)
}
m3_count <- function(version, pars, num_options, rule) {
  cats <- if (version == "ss") c("corr", "other", "npl") else c("corr", "dist_context", "other", "dist_other", "npl")
  mod <- m3(resp_cats = cats, num_options = num_options, choice_rule = rule, version = version)
  counts <- if (version == "ss") list(n_other = num_options[2], n_npl = num_options[3]) else list(num_options = num_options)
  count_cell(paste0("m3_", version), c(as.list(pars), counts, list(choice_rule = rule, b = mod$fixed_parameters$b)),
    bmm:::.compute_m3_probability_vector(pars, mod), function() rm3(n = 1, size = cnt_n, pars = pars, m3_model = mod))
}
m3_count("ss", c(a = 1, c = 20.1), c(1, 4, 5), "simple")
m3_count("ss", c(a = 3, c = 3), c(1, 2, 6), "softmax")
if (has_gauss) m3_count("ss", c(a = 2, c = 2), c(1, 4, 5), "gaussian")
m3_count("cs", c(a = 3, c = 3, f = .5), c(1, 1, 4, 3, 5), "softmax")
if (has_gauss) m3_count("cs", c(a = 2, c = 2, f = .3), c(1, 1, 4, 3, 5), "gaussian")
if (has_since("rmpt", "1.4.1")) {
  mod <- mpt(mpt_tree("span", branches), covariates = c("gl_corr", "gl_other", "g_corr", "g_other", "g_npl"))
  for (g in list(list(Pi = .5, Pb = .5, n = c(4, 5)), list(Pi = .9, Pb = .3, n = c(1, 8)))) {
    N <- 1 + sum(g$n)
    cv <- c(gl_corr = 1 / (1 + g$n[1]), gl_other = g$n[1] / (1 + g$n[1]), g_corr = 1 / N, g_other = g$n[1] / N, g_npl = g$n[2] / N)
    pars <- c(Pi = g$Pi, Pb = g$Pb)
    count_cell("mpt_span", list(Pi = g$Pi, Pb = g$Pb, n_other = g$n[1], n_npl = g$n[2]),
      bmm:::.mpt_probability_vector(pars, mod, covariates = cv),
      function() rmpt(n = 1, size = cnt_n, pars = pars, mpt_model = mod, covariates = cv))
  }
}
if (has_since("rsdt_yn", "1.4.1")) {
  # rsdt_yn(): .sdt_resolve_criterion() -> .sdt_eta() -> exp(.sdt_log_p_old()), P("old") on noise and on signal trials
  for (g in list(list(d = 1, criterion = .5, sdratio = 1, dist = "normal"), list(d = 2, bias = .3, sdratio = 1.5, dist = "logistic"),
                 list(d = 1.5, bias = -.4, sdratio = .7, dist = "gumbel_min"), list(d = .8, criterion = 1, sdratio = 1.2, dist = "gumbel_max"))) {
    crit <- bmm:::.sdt_resolve_criterion(g$criterion, g$bias, g$d, g$sdratio)
    count_cell("sdt_yn", g, exp(bmm:::.sdt_log_p_old(bmm:::.sdt_eta(g$d, crit, c(0, 1), g$sdratio), g$dist)),
      function() do.call(rsdt_yn, c(list(n = 2, n_trials = cnt_n, stimulus = c(0, 1)), g)))
  }
  # rsdt_mafc(): plogis(.mafc_logit_pc_r()), P(correct)
  for (g in list(list(m = 4, d = 1, dist = "normal"), list(m = 2, d = 1.5, dist = "gumbel_min"), list(m = 10, d = 2, dist = "normal"),
                 list(m = 10, d = 1, dist = "logistic"), list(m = 6, d = 1.2, dist = "gumbel_max")))
    count_cell("sdt_mafc", g, plogis(bmm:::.mafc_logit_pc_r(g$d, as.integer(g$m), g$dist)),
      function() do.call(rsdt_mafc, c(list(n = 1, n_trials = cnt_n), g)))
  # rsdt_rating(): .sdt_category_probs(), one row per stimulus
  for (g in list(list(d = 1, thresholds = c(-1, 0, 1), sdratio = 1, dist = "normal"),
                 list(d = 1.2, thresholds = c(-1.11, -0.19, 0.5, 1.19, 2.11), sdratio = 1.3, dist = "gumbel_max"),
                 list(d = 1.5, thresholds = c(-.5, .3, 1, 1.8), sdratio = .8, dist = "logistic"),
                 list(d = .7, thresholds = c(0, 1), sdratio = 1.2, dist = "gumbel_min")))
    count_cell("sdt_rating", g, bmm:::.sdt_category_probs(rbind(g$thresholds), rep(g$d, 2), rep(g$sdratio, 2), c(0, 1), g$dist),
      function() do.call(rsdt_rating, c(list(n = 2, n_trials = cnt_n, stimulus = c(0, 1)), g)))
}
write_fx("simulate_counts", cells)

# --- simulate_rt -------------------------------------------------------------
# Simulated data on the response-time pages. Per cell one sample from bmm's r*() and the exact values its statistics
# estimate; the explorer's sampler and this sample are each held to the exact values within 5 SE, one sample each.
# ddm and cswald cells: n = 1e5 trials from rddm() or rcswald(), which both draw from rtdists::rdiffusion(). Expected:
# P(upper) and each response's mean and variance of rt, by integrate() over bmm's dddm() (the decision time split at
# T / 20 and at T, T the larger mean decision time plus 35 / lambda, beyond which the density falls as exp(-lambda t));
# sample: the same with their SE (binomial for P(upper), sd / sqrt(k) for a mean of k rts, the sd of the squared
# deviations / sqrt(k) for a variance). A response with P below 0.05 has no rt statistics in the cell. cswald cells
# record the page's values (version, bound) beside the rcswald() arguments, which take the simple version's bound
# twice. ezdm cells: n = 1e5 cells from rezdm(). Expected, from bmm's EZ moments: P(upper); per row (all rts in 3par,
# each boundary in 4par) the means of mean_rt and var_rt, the mean of (mean_rt - its expectation)^2, which is VRT
# times E(1 / k | k >= 2) for the k rts a row's statistics come from, and the mean of (mean_rt - expectation) (var_rt -
# VRT), k3 times E(1 / k | k >= 2). These hold whatever the gamma's variance W is, so a fifth statistic sees it: the
# mean of (var_rt - VRT)^2, W_k = k4 / k + 2 VRT^2 / (k - 1) averaged over k >= 2 (.ez_rt_terms()). Sample: the same
# over the cells that have the row, with SEs from the sample (binomial over n * n_trials trials for P(upper)). Cell i
# draws after set.seed(437 + i). The last cell holds no sample: the binomial terms of the 4par rows, P(k >= 2),
# E(1 / k | k >= 2) and E(1 / (k - 1) | k >= 2), at counts and P(upper) out to the corners. Replayed over 1000 other
# streams (set.seed(seed + 100000 K)): every sample within 5 of its own SEs, the largest |z| 4.81 (var_var_rt of the
# upper rts at n_trials 10), 4.46 for the other statistics. The mean of (var_rt - VRT)^2 catches .ez_rt_terms() with
# n instead of n - 1 in W at 7.8 to 12.7 SE (n_trials 3, 5, 10, 20), which no other statistic sees.
# rtdists::rdiffusion() inverts a distribution function it tabulates to precision = 3, which bmm does not change. At
# the narrowest bound (0.223) that puts the mean rt of a response 1.5e-4 s low, 4 to 7 SE at 1e5 trials, and at drift
# 10 or more the variance 2 to 9% off (up to 9 SE); precision 4 or 5 removes both. The cells keep away from those
# corners, so that a 5 SE check of bmm's sample is a check of the model, not of the table; the explorer's sampler is
# tested there against the exact EZ moments without bmm's sample (simulate_rt.test.mjs).
if (has_since("rddm", "1.4.1") && has_since("rcswald", "1.4.1") && has_since("rezdm", "1.4.1")) {
  rt_n <- 1e5
  cells <- list()
  stat <- function(x) list(mean = mean(x), se = sd(x) / sqrt(length(x)))
  rt_cell <- function(fn, args, page = NULL) {
    seed <- 437 + length(cells) + 1
    set.seed(seed)
    y <- do.call(get(paste0("r", fn)), c(list(n = rt_n), args))
    p <- args; zr <- if (is.null(p$zr)) .5 else p$zr
    m <- bmm:::.ezdm_moments_4par(p$drift, p$bound, zr, 1)
    T <- max(m$mdt_upper, m$mdt_lower) + 35 / (pi^2 / (2 * p$bound^2) + p$drift^2 / 2)
    pu <- mean(y$response)
    expected <- list(); smean <- list(p_upper = pu); sse <- list(p_upper = sqrt(pu * (1 - pu) / rt_n))
    for (r in c(1, 0)) {
      side <- if (r == 1) "upper" else "lower"
      f <- function(t) exp(dddm(p$ndt + t, rep(r, length(t)), p$drift, p$bound, p$ndt, zr = zr))
      int <- function(g) sum(vapply(list(c(0, T / 20), c(T / 20, T), c(T, Inf)), function(lim)
        integrate(function(t) g(t) * f(t), lim[1], lim[2], rel.tol = 1e-12, subdivisions = 2000L)$value, 0))
      P <- int(function(t) 1)
      if (r == 1) expected$p_upper <- P
      if (P < .05) next
      mu <- int(identity) / P
      expected[[paste0("mean_", side)]] <- p$ndt + mu
      expected[[paste0("var_", side)]] <- int(function(t) (t - mu)^2) / P
      x <- y$rt[y$response == r]
      a <- stat(x); b <- stat((x - mean(x))^2)
      smean[[paste0("mean_", side)]] <- a$mean; sse[[paste0("mean_", side)]] <- a$se
      smean[[paste0("var_", side)]] <- var(x); sse[[paste0("var_", side)]] <- b$se
    }
    cells[[length(cells) + 1]] <<- c(list(fn = fn, args = args), if (!is.null(page)) list(page = page),
      list(n = rt_n, seed = seed, expected = expected, sample = list(mean = smean, se = sse)))
  }
  for (a in list(list(drift = 0, bound = 1, ndt = .223, zr = .5), list(drift = 1.5, bound = 1, ndt = .223, zr = .5),
                 list(drift = -1, bound = 2, ndt = .2, zr = .3), list(drift = .5, bound = 4.48, ndt = .1, zr = .7),
                 list(drift = 3, bound = .5, ndt = .3, zr = .818), list(drift = 2, bound = 1.5, ndt = .2, zr = .182)))
    rt_cell("ddm", a)
  # cswald: the page's start in crisk and in simple, a crisk cell with negative drift and bias, a fast simple cell,
  # and simple at drift 20.1, where rcswald() draws no lower response (P(lower) 8e-8).
  for (g in list(list(v = "crisk", drift = 1, bound = 1, ndt = .135, zr = .5), list(v = "crisk", drift = -1, bound = 2.46, ndt = .2, zr = .711),
                 list(v = "simple", drift = 1, bound = 1, ndt = .135), list(v = "simple", drift = 3, bound = .407, ndt = .055),
                 list(v = "simple", drift = 20.1, bound = .407, ndt = .055))) {
    if (g$v == "simple") rt_cell("cswald", list(drift = g$drift, bound = 2 * g$bound, ndt = g$ndt), page = list(version = "simple", bound = g$bound))
    else rt_cell("cswald", list(drift = g$drift, bound = g$bound, ndt = g$ndt, zr = g$zr), page = list(version = "crisk", bound = g$bound))
  }
  ez_cell <- function(args) {
    seed <- 437 + length(cells) + 1
    set.seed(seed)
    y <- do.call(rezdm, c(list(n = rt_n), args))
    n <- args$n_trials; four <- args$version == "4par"
    m <- if (four) bmm:::.ezdm_moments_4par(args$drift, args$bound, args$zr, 1) else bmm:::.ezdm_moments_3par(args$drift, args$bound, 1)
    ph <- y$n_upper / n
    expected <- list(p_upper = m$pC); smean <- list(p_upper = mean(ph)); sse <- list(p_upper = sqrt(mean(ph) * (1 - mean(ph)) / (rt_n * n)))
    rows <- if (four) list(list("_upper", m$mdt_upper, m$vrt_upper, m$k3_upper, 0:n, m$k4_upper),
                           list("_lower", m$mdt_lower, m$vrt_lower, m$k3_lower, n - 0:n, m$k4_lower))
      else list(list("", m$MDT, m$VRT, m$k3, rep(n, n + 1), m$k4))
    w <- dbinom(0:n, n, m$pC)
    for (r in rows) {
      k <- r[[5]]; ok <- k >= 2
      inv <- sum(w[ok] / k[ok]) / sum(w[ok]); inv1 <- sum(w[ok] / (k[ok] - 1)) / sum(w[ok])
      e <- list(mean_rt = args$ndt + r[[2]], var_rt = r[[3]], var_mean_rt = r[[3]] * inv, cov_mean_var = r[[4]] * inv,
                var_var_rt = r[[6]] * inv + 2 * r[[3]]^2 * inv1)
      mr <- y[[paste0("mean_rt", r[[1]])]]; vr <- y[[paste0("var_rt", r[[1]])]]
      keep <- !is.na(mr)
      dm <- mr[keep] - e$mean_rt; dv <- vr[keep] - e$var_rt
      xs <- list(mean_rt = mr[keep], var_rt = vr[keep], var_mean_rt = dm^2, cov_mean_var = dm * dv, var_var_rt = dv^2)
      for (key in names(e)) {
        s <- stat(xs[[key]])
        expected[[paste0(key, r[[1]])]] <- e[[key]]; smean[[paste0(key, r[[1]])]] <- s$mean; sse[[paste0(key, r[[1]])]] <- s$se
      }
    }
    # The draw itself at fixed uniforms: for counts k of 2, 3 and n_trials (3par: n_trials), var_rt = qgamma(u_var) and
    # mean_rt = ndt + mdt + slope (var_rt - VRT) + sd qnorm(u_mean) with .ez_rt_terms(), each u shifted by 2^-33 as
    # ezdmCells() shifts its uniforms. u_var 0.536323 is where the earlier qgamma() port failed at the last cell's lower
    # boundary with 2 rts (shape 0.101); a sample of 1e5 cells holds about 0.2 such draws there (measured, 9e-6 per draw).
    uv <- c(1e-9, .001, .1, .536323, .9, .999, 1 - 1e-9); um <- rev(uv)
    at <- lapply(rows, function(r) lapply(if (four) unique(c(2, 3, n)) else n, function(k) {
      t <- bmm:::.ez_rt_terms(r[[3]], r[[4]], r[[6]], k); v <- qgamma(uv + 2^-33, t$shape, t$rate)
      list(row = r[[1]], k = k, var_rt = v, mean_rt = args$ndt + r[[2]] + t$slope * (v - r[[3]]) + t$sd * qnorm(um + 2^-33))
    }))
    cells[[length(cells) + 1]] <<- list(fn = "ezdm", args = args, n = rt_n, seed = seed, expected = expected, sample = list(mean = smean, se = sse),
                                        u_var = uv, u_mean = um, at_uniforms = do.call(c, at))
  }
  # ezdm: the page's start, the smallest trial count bmm accepts (gamma shapes below 1), the largest the page offers,
  # and 4par cells where a boundary often has fewer than 2 responses (n_trials 20, P(lower) 0.09; n_trials 10). The last
  # cell, added after the others so that they keep their seeds, has 2 lower rts in 19.9% of cells (78% of the cells
  # with a lower row), gamma shape 0.101 (P(upper) 0.80), where the earlier qgamma() port failed (math.json).
  for (a in list(list(n_trials = 100, drift = 0, bound = 1, ndt = .223, version = "3par"),
                 list(n_trials = 3, drift = 1.5, bound = 2, ndt = .3, version = "3par"),
                 list(n_trials = 500, drift = -1, bound = 4.48, ndt = .1, version = "3par"),
                 list(n_trials = 100, drift = 1, bound = 1.5, ndt = .2, zr = .6, version = "4par"),
                 list(n_trials = 20, drift = 2, bound = 1, ndt = .2, zr = .7, version = "4par"),
                 list(n_trials = 10, drift = 0, bound = .223, ndt = .3, zr = .3, version = "4par"),
                 list(n_trials = 5, drift = 1, bound = 4.48, ndt = .223, zr = .182, version = "4par")))
    ez_cell(a)
  # ezdmCountTerms() in js/lib/simulate-rt.js against dbinom(): n_trials 2 to 500 by P(upper) from 1e-12 to 1, where a
  # row is certain, rare or (P(upper) 1, lower) absent (NaN).
  ct <- expand.grid(pC = c(1e-12, .001, .09, .3, .5, .804, .999, 1 - 1e-9, 1), n = c(2, 3, 5, 10, 20, 100, 500))
  terms <- lapply(seq_len(nrow(ct)), function(i) {
    n <- ct$n[i]; w <- dbinom(0:n, n, ct$pC[i])
    vapply(list(0:n, n - 0:n), function(k) { ok <- k >= 2
      c(sum(w[ok]), sum(w[ok] / k[ok]) / sum(w[ok]), sum(w[ok] / (k[ok] - 1)) / sum(w[ok])) }, numeric(3))
  })
  pick <- function(j, b) vapply(terms, function(t) t[j, b], 0)
  cells[[length(cells) + 1]] <- list(fn = "ezdm_count_terms", args = list(), pC = ct$pC, n_trials = ct$n,
    share_upper = pick(1, 1), inv_upper = pick(2, 1), inv1_upper = pick(3, 1),
    share_lower = pick(1, 2), inv_lower = pick(2, 2), inv1_lower = pick(3, 2))
  write_fx("simulate_rt", cells)
} else cat("simulate_rt skipped: this bmm lacks rddm(), rcswald() or rezdm()\n")

cat("bmm", version, "->", out, "\n")
