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
write_fx <- function(name, cells, extra = list()) {
  jsonlite::write_json(c(list(bmm_version = version, generated = format(Sys.time(), "%Y-%m-%d")), extra, list(cells = cells)),
                       file.path(out, paste0(name, ".json")), digits = NA, auto_unbox = TRUE)
  cat(sprintf("%-10s %3d cells\n", name, length(cells)))
}
x <- seq(-pi, pi, length.out = 61)

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
for (p in list(c(3, 3.5), c(1, .5), c(10, 20), c(.2, 8), c(6, 60), c(2, 200), c(0.05, 1)))
  for (par in c("sqrtexp", "bessel"))
    cells[[length(cells) + 1]] <- list(fn = "dsdm", args = list(mu = 0, c = p[1], kappa = p[2], parametrization = par),
      x = x, logd = dsdm(x, mu = 0, c = p[1], kappa = p[2], log = TRUE, parametrization = par))
write_fx("circular", cells)

# --- m3 ----------------------------------------------------------------------
cells <- list()
# The gaussian rule needs bmm's quadrature rule (.m3_gauss_rule(), from bmm 1.4.1 on); the page reads it
# from nodes.json, so the explorer integrates on bmm's own nodes.
has_gauss <- has(".m3_gauss_rule")
rules <- c("simple", "softmax", if (has_gauss) "gaussian")
if (has_gauss) {
  gh <- bmm:::.m3_gauss_rule()
  write_fx("nodes", list(list(fn = ".m3_gauss_rule", args = list(n = length(gh$nodes)),
                              nodes = gh$nodes, log_w = gh$log_w, log_Phi = gh$log_Phi)))
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
# without it no mpt.json is written and the test skips.
if (has("dmpt")) {
  branches <- list(
    corr = "Pm * Pb + Pm * (1 - Pb) * gl_corr + (1 - Pm) * g_corr",
    other = "Pm * (1 - Pb) * gl_other + (1 - Pm) * g_other",
    npl = "(1 - Pm) * g_npl")
  mod <- mpt(mpt_tree("span", branches), covariates = c("gl_corr", "gl_other", "g_corr", "g_other", "g_npl"))
  # 100 trials split as predicted, rounded so the counts sum to 100 (the page's dmpt() call does the same)
  split100 <- function(p) { k <- floor(100 * p); r <- order(-(100 * p - k)); i <- r[seq_len(100 - sum(k))]; k[i] <- k[i] + 1; k }
  p_lv <- signif(plogis(c(-5.44, 0, 5.44)), 3)
  cells <- list()
  for (n in list(c(4, 5), c(0, 0), c(8, 12), c(0, 6), c(3, 0))) for (pm in p_lv) for (pb in p_lv) {
    N <- 1 + sum(n)
    cv <- c(gl_corr = 1 / (1 + n[1]), gl_other = n[1] / (1 + n[1]), g_corr = 1 / N, g_other = n[1] / N, g_npl = n[2] / N)
    probs <- bmm:::.mpt_probability_vector(c(Pm = pm, Pb = pb), mod, covariates = cv)
    x <- split100(unname(probs))
    cells[[length(cells) + 1]] <- list(fn = "mpt_span", args = list(Pm = pm, Pb = pb, n_other = n[1], n_npl = n[2]),
      probs = unname(probs), counts = x,
      logd = dmpt(x, pars = c(Pm = pm, Pb = pb), mpt_model = mod, covariates = cv))
  }
  write_fx("mpt", cells, list(branches = branches))
} else cat("mpt        skipped: this bmm has no dmpt()\n")
cat("bmm", version, "->", out, "\n")
