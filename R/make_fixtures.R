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
write_fx <- function(name, cells) {
  jsonlite::write_json(list(bmm_version = version, generated = format(Sys.time(), "%Y-%m-%d"), cells = cells),
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
grid <- expand.grid(a = c(2, .5, 0), cc = c(1, 3), n_other = c(3, 5, 1), n_npl = c(4, 0, 6), rule = c("simple", "softmax"),
                    stringsAsFactors = FALSE)
for (i in seq_len(nrow(grid))) {
  g <- grid[i, ]
  mod <- m3(resp_cats = c("corr", "other", "npl"), num_options = c(1, g$n_other, g$n_npl), choice_rule = g$rule, version = "ss")
  probs <- bmm:::.compute_m3_probability_vector(c(a = g$a, c = g$cc), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_ss", args = list(a = g$a, c = g$cc, n_other = g$n_other, n_npl = g$n_npl,
    b = mod$fixed_parameters$b, choice_rule = g$rule), probs = unname(probs))
}
# Slider corners of the M3 page: bmm's default prior means +- 3 SD (log scale for simple), largest counts.
corners <- list(simple = list(c(.05, 1), c(1, 20.1), c(20.1, 403)), softmax = list(c(0, 0), c(3, 3), c(0, 6), c(6, 6)))
for (rule in names(corners)) for (ac in corners[[rule]]) for (n in list(c(0, 0), c(4, 5), c(8, 12))) {
  mod <- m3(resp_cats = c("corr", "other", "npl"), num_options = c(1, n), choice_rule = rule, version = "ss")
  probs <- bmm:::.compute_m3_probability_vector(c(a = ac[1], c = ac[2]), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_ss", args = list(a = ac[1], c = ac[2], n_other = n[1], n_npl = n[2],
    b = mod$fixed_parameters$b, choice_rule = rule), probs = unname(probs))
}
for (rule in c("simple", "softmax")) for (f in c(.2, .8)) {
  mod <- m3(resp_cats = c("corr", "dist_context", "other", "dist_other", "npl"), num_options = c(1, 4, 1, 4, 8), choice_rule = rule, version = "cs")
  probs <- bmm:::.compute_m3_probability_vector(c(a = 1, c = 2, f = f), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_cs", args = list(a = 1, c = 2, f = f, num_options = c(1, 4, 1, 4, 8),
    b = mod$fixed_parameters$b, choice_rule = rule), probs = unname(probs))
}
write_fx("m3", cells)
cat("bmm", version, "->", out, "\n")
