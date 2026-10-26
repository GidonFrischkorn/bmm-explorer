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
# Values the IMM page can set. Its preset places n items equidistant on the display circle and spreads
# the colours evenly around the wheel; distances and colours are rounded to 2 decimals, as the page
# shows and uses them.
# c, a and s move on the log scale over bmm's prior mean +- 3 SD, exp(-3) to exp(3); kappa from
# exp(-1) to exp(5); the page computes with exp(slider) at 3 significant digits. b is fixed at 1 in
# bmm() and runs from 0 to 5 on the page.
equi <- function(n) {
  ang <- 2 * pi * seq_len(n - 1) / n
  list(mu = c(0, round(atan2(sin(ang), cos(ang)), 2)), dist = c(0, round(pmin(ang, 2 * pi - ang), 2)))
}
lo_hi <- c(.0498, 20.1)
start <- list(c = 1, a = 1, b = 1, s = 1, kappa = 7.39)
imm_page <- c(
  lapply(c(1, 2, 4, 8), function(n) c(equi(n), start)),
  apply(expand.grid(c = lo_hi, a = lo_hi, s = lo_hi, kappa = c(.368, 148)), 1, function(g)
    c(equi(8), list(c = g[["c"]], a = g[["a"]], b = 1, s = g[["s"]], kappa = g[["kappa"]]))),
  lapply(list(list(b = 0), list(b = 5), list(a = 0), list(c = 0), list(s = 0)), function(m)
    c(equi(8), modifyList(start, m))),
  # The square layout: straight-line distances in circle radii, unordered, from 0 (an item dragged
  # onto the target) to 3.11 (opposite corners, 2.2 * sqrt(2)), at both kappa ends.
  lapply(c(.368, 148), function(k) c(list(mu = c(0, 0.79, -2.36, 3.14, 1.57, -0.5, 2, -1.2),
    dist = c(0, 0.05, 3.11, 1.2, 0, 0.6, 2.4, 1.56)), modifyList(start, list(kappa = k, s = 20.1))))
)
for (p in imm_page)
  cells[[length(cells) + 1]] <- list(fn = "dimm", args = p, x = x, logd = do.call(dimm, c(list(x = x, log = TRUE), p)))
# Probability of a response within +-20 degrees of the target, the page's across-set-size measure.
# bmm has no pimm() yet (.NotYetImplemented), so the reference is integrate() over bmm's dimm().
h <- 20 * pi / 180
for (p in c(lapply(1:8, function(n) c(equi(n), start)), imm_page[c(5, 12, 20)]))
  cells[[length(cells) + 1]] <- list(fn = "dimm_mass", args = c(p, list(lo = -h, hi = h)),
    mass = integrate(function(x) do.call(dimm, c(list(x = x), p)), -h, h, rel.tol = 1e-12)$value)
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
# Values the M3 page can set: slider ends and midpoint at bmm's default prior mean +- 3 SD. Simple
# moves log a and log c, and the page computes with exp(slider) at 3 significant digits; softmax is
# linear on [0, 6]. Full a x c cross at middle counts, the four extreme pairings at the count limits.
levels <- list(simple = list(a = c(.0498, 1, 20.1), c = c(1, 20.1, 403)), softmax = list(a = c(0, 3, 6), c = c(0, 3, 6)))
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
for (rule in c("simple", "softmax")) for (f in c(.2, .8)) {
  mod <- m3(resp_cats = c("corr", "dist_context", "other", "dist_other", "npl"), num_options = c(1, 4, 1, 4, 8), choice_rule = rule, version = "cs")
  probs <- bmm:::.compute_m3_probability_vector(c(a = 1, c = 2, f = f), mod)
  cells[[length(cells) + 1]] <- list(fn = "m3_cs", args = list(a = 1, c = 2, f = f, num_options = c(1, 4, 1, 4, 8),
    b = mod$fixed_parameters$b, choice_rule = rule), probs = unname(probs))
}
write_fx("m3", cells)
cat("bmm", version, "->", out, "\n")
