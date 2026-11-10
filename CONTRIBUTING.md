# Contributing to the bmm model explorer

The explorer is a website of interactive pages for the models in the [bmm](https://venpopov.com/bmm/)
R package. Each page has sliders for a model's parameters, a drawing of the task, the predicted
responses and the prediction across a task setting. Everything runs in the browser: plain JavaScript and
SVG, no packages to install, no R when a page loads.

This guide shows how to add a page, which checks a pull request has to pass, and how to report a
problem. If you only want to ask for a page or report a bug, open an issue from the templates; you do
not need the rest.

## The one rule

A density ships on a page only with a test that holds it to values bmm itself wrote. The densities in
`js/models/` are JavaScript copies of bmm's `d*()` functions. A helper beside them has a test of its
own or is covered through the test of the density that calls it. The exceptions are helpers only the
pages use, such as `mptNodes` and `criterionToBias`. The explorer must never become a second
definition of a model. The values come from `R/make_fixtures.R`, which calls the installed bmm and
writes `tests/parity/fixtures/*.json`; a value in those files is a fixture. The tests in `tests/parity/`
(the parity tests) compare the copies with the fixtures. A density is held to 1e-10 absolute on the log
scale, 1e-9 where the copy integrates on other points than bmm, as the copy of `sdm` sums its normaliser
over 1024 points where bmm calls `integrate()`. A copy that sums over bmm's own quadrature nodes, as the
m-AFC density and the gaussian rule of `m3` do, stays at 1e-10. Each test states its tolerance; start at
1e-10 and loosen it only where the copy integrates on other points than bmm, with the reason written in
the test. The samplers (step 5) are not densities: the expected statistics of a simulated sample are sums
on the page's grid and stay within 2e-8 of `integrate()` over bmm's density, as the sampler tests state
and explain. A GitHub workflow, the oracle, regenerates the fixtures from bmm every week (see "When bmm changes or a check finds a drift").

Three conventions follow from it. Names and defaults are bmm's, as its reference pages
(<https://venpopov.com/bmm/reference/>) list them. A density takes the arguments of its `d*()` function
(`mu`, `kappa` and `p_mem` for `dmixture2p()`). The bmm call takes the arguments of the model's
constructor (`resp_cats`, `num_options` and `choice_rule` for `m3()`) and the parameters its reference page
lists, which can differ from the density's: `mixture2p()` lists `mu1`, `kappa` and `thetat`, the logit of
`p_mem`. A page shows the bmm call that matches the current slider values. There are no dependencies: no
npm packages, and no scripts from a CDN except what Quarto loads itself.

## The page template

A page opens with a dashboard (`<div class="ex-dash">`) that fits one laptop screen, 1280 x 800, without
scrolling. At 1100 px of width or less the panels rearrange into two columns, at 640 px or less into
one. It has five panels (the dashboard) and, below it, five
sections of text (listed after this); the two lists have similar names and are separate things. The panels:

1. **The task**: an SVG of one trial, redrawn with the task settings.
2. **Task settings**: the inputs that enter the likelihood.
3. **Parameters**: one slider coupled to a number field per parameter, the choice of rule or
   parametrisation, and a reset.
4. **Predicted**: the response distribution, with the model at bmm's prior means dashed.
5. **Across task settings**: the prediction across the design variable, parameters held fixed.

Every input event redraws every panel, and a full redraw takes under 16 ms. Every parameter, task
setting and model choice has an (i) note: what it does in the model, then an example from the task
drawing. Copy the markup from `models/sdt_mafc.qmd` (a `button.ex-info` next to the label and a
`div.ex-info-pop` with the note); `js/lib/info.js` wires it.

**Where slider ranges come from.** From bmm's default priors for the intercepts: prior mean plus or
minus 3 SD on the link scale. In R,
`default_prior(bmf(d ~ 1), data = data.frame(n_correct = 55, n_trials = 100), model = sdt_mafc(response = "n_correct", n_trials = "n_trials", m = 4))`
prints them (here `Intercept_d ~ normal(1, 1)`). For another model, build the data frame in the response format its
reference page gives; for `sdt_ranking` that is one count column per rank, named in its `response`
argument:
`default_prior(bmf(d ~ 1), data = data.frame(rank1 = 40, rank2 = 30, rank3 = 20, rank4 = 10), model = sdt_ranking(response = paste0("rank", 1:4), m = 4))`.
That call prints a table: read the prior in the row with coef `Intercept` and nlpar `d` (here
`normal(1, 1)`). Every parameter that changes the shape of the prediction gets a slider; the model's
reference page names each parameter's link. Where bmm defines a parameter on the log scale, through a log link (`sdratio` of
`sdt_yn`) or as a log parameter with an identity link (`sdratio` of `sdt_ranking`, a "Log SD ratio"), the
slider is on the log scale and the number field in natural units. A page may slide the `d*()` argument on its natural scale instead, as the `mixture2p` page slides
`p_mem` from 0 to 1 rather than `thetat`. A parameter that bmm fixes unless the formula names it gets a
slider too if it changes the shape of the prediction, starting at the fixed value: `sdratio` of `sdt_yn`
and of `sdt_ranking` with normal noise (0 on the log scale, a ratio of 1), and `b` of `imm`, which bmm 1.4
always fixes at 1, so it has no prior and its slider runs from 0 to 5. A parameter that only shifts the
prediction gets no slider and stays at its fixed value: the location `mu1` of `mixture2p` moves the
density along the circle without changing its shape, so that page holds it at 0. A page that slides a
parameter bmm fixes names the value bmm fixes it at. The prior means are the starting values and the dashed reference. If a page uses another range or scale, its Explore section says so and says
why (the `sdm` page does).

**The design axis.** Every page answers one question: which task settings enter the likelihood? Candidate
counts for `m3` and `mpt`, non-target positions for `imm`, `m` for `sdt_mafc`, trials per cell for
`ezdm`. To find them for a new model, read the arguments of its `d<model>()`: those that are neither the
data nor parameters to estimate describe the task. The fifth panel shows the prediction across that setting. A model with no such setting says so
in one paragraph on the page instead of inventing an axis. The table "Which models have a task-settings
axis" in [`dev/ROADMAP.md`](dev/ROADMAP.md) lists the answers so far; step 8 adds your row, or adds your model to an existing one (`sdt_ranking`
already shares the row of `sdt_mafc`).

Below the dashboard come five sections with these headings, in this order:

1. **What the model says**: three to five sentences and the formula, parameters named as in bmm.
2. **The task**: what one trial is, and which task settings enter the likelihood.
3. **Explore**: how to read the panels, and where the ranges come from.
4. **Across task settings**: why the prediction changes with the design variable, or the paragraph that
   says there is none.
5. **In bmm**: the `bmm()` call and the `d*()` call with the current values filled in, copyable, and
   links to the bmm article and reference page.

## Adding a page

The example is a model called `sdt_ranking`; replace the names with yours. You need Node 22 or newer,
Quarto 1.5 or newer, Chrome, and R with bmm and jsonlite for the fixture steps. Reading
`models/sdt_mafc.qmd`, `js/pages/sdt_mafc.js` and `js/models/sdt.js` first is the fastest way in. Start
from a branch of `main`, named for the page (`sdt-ranking-page`). Do the steps in order. Steps 2 and 5
both add cells to the fixture script: run it after step 2 and again after step 5, then run the tests.
The checks in the next section come after step 8.

1. **Port the density.** Add pure functions to `js/models/<family>.js`; a model that belongs with
   existing ones goes into their file (the families are the files in `js/models/`; `sdt_ranking` goes into
   `sdt.js`), any other gets a new file. A density returns the log density and touches no DOM. A
   density of single responses takes `x` as a number or array and the parameters as an object with bmm's
   names (`dmixture2p(x, { mu, kappa, p_mem })`, `dddm(x, { response, drift, bound, ndt })`); a density of
   counts or summary statistics takes the data first, as bmm's `d*()` does, then the task settings and parameters (`dsdtMafc(nCorrect, nTrials, m, d, dist, rules)`,
   `dsdtYn(nOld, nTrials, stimulus, pars)`); for a vector of counts per row, as in `sdt_ranking`, follow
   `dsdtRating(counts, stimulus, thresholds, pars)`. `dezdm` is the exception: it takes one object holding the data
   and the parameters (`dezdm({ mean_rt, var_rt, n_upper, n_trials, drift, bound, ndt })`). Follow the other
   densities in your file. Print `d<model>()` and `r<model>()` in R (`bmm::dsdt_ranking`) to see which
   internal helpers they call; the port follows those, and the fixture script reaches them with `bmm:::`.
   `dsdt_ranking()` and `rsdt_ranking()` both take their probabilities from `.ranking_all_probs_r`. Under
   normal noise its helper `.ranking_prob_r` integrates by Gauss-Hermite quadrature where the SD ratio,
   `dsdt_ranking()`'s `sdratio`, is at most 1 (the helper takes its log) and by Gauss-Legendre quadrature
   on [-6, 6] above, with node counts that `.ranking_gh_n(m, free_sdratio = TRUE)` and `.ranking_gl_rule(m)` set from each row's `m`; the port
   switches rules at the same point and takes the same nodes. Do not copy them from the Stan code:
   `.ranking_fill_quadrature` picks its rules for the data's largest `m` and for whether `sdratio` is
   estimated, so with `sdratio` fixed at `m` = 4 Stan sums over 32 Gauss-Hermite nodes and the R density
   over 64. Use `js/lib/math.js` (`logPnorm`, `qnorm`, `lgamma`, `log1mExp`, `integrateExp`)
   instead of writing special functions again (read the file for the signatures). If the density needs a
   quadrature rule, `R/make_fixtures.R` writes bmm's own nodes and weights to
   `tests/parity/fixtures/nodes.json` (step 2) and the page fetches them; never use nodes computed in
   JavaScript. The density takes the rules as its last argument (`rules` in `dsdtMafc`), and the page and
   the test pass them in. `js/pages/sdt_mafc.js` shows how: a top-level `await fetch()` of that file
   relative to `import.meta.url`, and if the fetch fails the choices that need the nodes are switched off.
2. **Write the fixture cells.** In `R/make_fixtures.R` add a section that calls bmm's `d<model>()` on a
   small literal grid (the existing sections write from tens to a few thousand values per function),
   covering the slider ranges the page offers and the corners where a port is weakest (`kappa` near 0 and above 100,
   probabilities near 0 and 1, counts of 0). Copy the nearest section of the script (the `dsdt_mafc` cells,
   for example) and keep its field names: a cell is one record, with `fn` naming the function or case,
   `args` holding the inputs (often a grid of rows) and one field per result bmm returned (`logd`; the `sdt`
   section makes several calls per cell, as `log_p_old`, `log_pc` or `logp`); `write_fx()` writes the
   file. If the port needs a quadrature rule, add a cell for it to `node_cells`, as the `m3` section does for `.m3_gauss_rule` and the `sdt` section for `.mafc_gh` and
   `.mafc_gl`, before `write_fx("nodes", node_cells)` writes them all. The pages find a rule by its `fn`;
   where bmm's rule depends on a task setting, as the ranking rules depend on `m`, write one cell per rule
   and tell them apart by `args`. Cells for an existing fixture file go
   inside its section, before its `write_fx()` call: `sdt_ranking` cells go into the block
   `if (has_since("dsdt_yn", "1.4.1")) { ... }`, before `write_fx("sdt", cells)`, since a second block
   would write `sdt.json` again. Guard a function that older bmm versions lack with
   `has_since("d<model>", "<version>")`, defined at the top of the script. The version matters only when
   the function is missing: a bmm older than it skips the cells, and one at or above it stops the script.
   So give a version from which bmm has the function; bmm's changelog
   (<https://venpopov.com/bmm/news/index.html>) names the first. Check which bmm is installed with `Rscript -e 'packageVersion("bmm")'`, then run
   `Rscript R/make_fixtures.R tests/parity/fixtures`. For a model that CRAN does not have yet, read
   "Models that are not on CRAN yet" first; `sdt_ranking` is on CRAN from bmm 1.4.1 and needs none of it.
3. **Write the parity test.** Add to `tests/parity/<family>.test.mjs` (create it if the family is new). It loads the fixture file, runs your
   function on every cell and states its tolerance. Load the file with `loadFixture(name)` from
   `tests/parity/helpers.mjs`, or with `loadFixtureSince(name)` if an older bmm writes no such file: it
   returns null there, so the test can skip, and it throws if a bmm that should write the file did not. A
   fixture loaded that way needs its first version in `SINCE` in `tests/parity/helpers.mjs`. Cells added to
   an existing fixture file need no new entry (`SINCE` lists files, not functions; `sdt_ranking` cells go
   into `sdt.json`). If the function is newer than the file's `SINCE` version, an older bmm writes the
   file without its cells, so the test must skip when the file holds no cells of that function. Log densities that reach far tails are compared
   relative once the magnitude of the log density exceeds 1e3: use `assertCloseRel` from `tests/parity/helpers.mjs`. Run the test alone with
   `node --test tests/parity/<family>.test.mjs`.
4. **Write the page.** `models/<model>.qmd` starts with front matter like this one, from
   `models/sdt_mafc.qmd` (`subtitle` is one line: task and response type):
   ```yaml
   title: "Signal detection theory, m-alternative forced choice"
   subtitle: "Pick the one of m alternatives that holds the signal: accuracy as a function of sensitivity and m"
   model: sdt_mafc
   page-layout: full
   toc: false
   ```
   Copy the dashboard block of `models/sdt_mafc.qmd` and change its ids and controls. Its `{=html}`
   blocks are Quarto raw HTML and hold markup only. Their ids start with a model prefix that
   no other page uses (`m3-`, `imm-`, `sdtmafc-`). `css/explorer.css` has rules keyed to page
   ids: `touch-action: none` on `#sdtyn-latent`, `#sdtrating-latent` and `#sdtmafc-latent`, which lets a
   reader drag the lines of the first two on a touch screen, and the font sizes of `#sdtmafc-latent` and `#sdtmafc-tiles`. Search the file
   for the prefix of the page you copied and copy each rule under your prefix. Behaviour lives in `js/pages/<model>.js`, loaded as a
   module at the end of the page. The script uses `js/lib/`: `widget.js` for coupled sliders
   (`bindParams`, then each pair's `setBounds({ min, max, step, scale })` with scale `LINEAR`, `LOG` or
   `LOGIT`, as `js/pages/sdt_yn.js` does), `plot.js` for line and bar plots, `circular-plot.js` for
   densities over a circular error, `sdt-plot.js` for evidence densities and ROC curves, `axis.js` for axes
   that hold their limit and ease to a new one, `info.js` for the (i) notes (call `initInfo()` once at the
   end). At the start of each redraw take `const t0 = performance.now()`, and at its end set
   `dashboard.dataset.redrawMs = (performance.now() - t0).toFixed(2)` (`dashboard` is the `.ex-dash`
   element), as the other pages do; the redraw
   check below reads it.
5. **Add the simulate switch.** Every page has a "simulate N trials" switch that draws a sample from the
   predicted distribution. `js/lib/sim-panel.js` has the controls (`simControls`). The sampler depends on
   the response. The circular pages call `circularSimulation` from `js/lib/sim-panel.js`, which uses
   `circularSim` in `js/lib/simulate.js` to invert a density over a circular error. From `simulate.js` the
   categorical and SDT pages import `categoricalShares`, `ynSample`,
   `ratingSample` or `mafcSample`, built on `categoryCounts` (counts from the probabilities the density
   scores) and `shareBelow` (a share of correct or yes responses). `js/lib/simulate-rt.js` serves the
   response-time pages. All draw from fixed uniforms
   (`js/lib/random.js`, seeded), so the sample stays put while a slider moves. The sampler needs two
   kinds of fixture, both from bmm: the expected values of what the page displays, and a sample of 1e5
   trials from bmm's `r*()` function for the model (on the `ezdm` page, 1e5 cells of summary statistics
   from `rezdm()`). Each response type has one section of `R/make_fixtures.R` and one test,
   `tests/parity/<section>.test.mjs`: `simulate_counts` for the categorical and SDT pages, `simulate` for
   the circular pages, `simulate_rt` for the response-time pages. On the
   categorical and SDT pages the expected values are the probabilities bmm's `r*()` samples from,
   computed by the internal helpers it calls: `.compute_m3_probability_vector` for `rm3()`,
   `.mpt_probability_vector` for `rmpt()`, `.sdt_resolve_criterion`, `.sdt_eta` and `.sdt_log_p_old` for
   `rsdt_yn()`, `.mafc_logit_pc_r` for `rsdt_mafc()`, `.sdt_category_probs` for `rsdt_rating()`,
   `.ranking_all_probs_r` for `rsdt_ranking()`. On the circular pages they come from `integrate()` over
   bmm's `d*()`, on the DDM and CS-Wald pages from `integrate()` over `dddm()`, and on the `ezdm` page
   they are bmm's EZ moments. A cell's seed is 437 plus its position in the section, so add new cells at
   the end of the section, inside its `has_since()` guard if it has one and before its `write_fx()` call
   (in `simulate_counts`, inside `if (has_since("rsdt_yn", "1.4.1")) { ... }`, before
   `write_fx("simulate_counts", cells)`): a cell inserted earlier shifts the seeds, and with them the
   samples, of every cell after it. Each test picks the page's sampler by the cell's `fn`, so add yours:
   a `case` in the `switch` of `explorer()` in `simulate_counts.test.mjs` (a cell without one fails with
   "no explorer sampler"), an entry in the map `D` in `simulate.test.mjs`, a branch on `cell.fn` in
   `simulate_rt.test.mjs`. The test draws one seeded sample of the same size from your sampler and checks
   each share or statistic the page displays. On the circular and response-time pages both samples, the
   page's and bmm's, are held to the expected values within 5 standard errors (`SAMPLE_LIMIT` in
   `tests/parity/helpers.mjs`). On the categorical and SDT pages bmm's sample is held to the probabilities
   within 4 standard errors, and the page's sample to bmm's within 4 √2 standard errors, since both
   samples vary.
   The switch's markup is in the dashboard you copied: a checkbox `<prefix>-sim` and the ids `-sim-n`,
   `-sim-new` and `-sim-text`. If no sampler fits your response, write one in `js/lib/simulate.js` in the
   same pattern (uniforms in, draws out) and test it the same way.
6. **Write the summaries for screen readers.** Every SVG in the dashboard has an id and a text summary.
   Add `<model>Summaries(...)` to `js/lib/summaries.js`, a pure function of the values the page drew that
   returns `{ svg id: text }` (copy `sdtMafcSummaries`), and a case in `tests/lib/summaries.test.mjs`. The page calls
   `describePlot(svg, summary)` after each redraw and `initA11y()` once. Draggable SVG items get
   `sliderAria()`. All three come from `js/lib/a11y.js`.
7. **Add the page to the accessibility run.** `tests/a11y/states.json` needs an entry
   `"models/<model>"` under its top-level `"pages"` key, with a state for each thing a reader can switch:
   simulate on, each model choice, an open (i) note, and a typed value outside the slider range. A model
   choice is a control that switches the model rather than a parameter value: the `version` and
   `choice_rule` of `m3`, the noise distribution `dist` of the SDT pages. Give each a state with a value
   other than the default. The quadrature rule is not a model choice and gets no control: the rule switch
   inside the integral in the E11a row of `dev/ROADMAP.md` is the port's, at the point where bmm switches. A value
   outside the range makes the page stale: the plots are greyed and keep the last valid values, and the
   page announces it. For an SDT page the `models/sdt_mafc` entry is the nearest template; its states
   are "simulate on", "note open: m", "m 10, simulate on", "gumbel_max", "logistic, simulate on" and
   "out of range: m 11". Here is the first state of the `models/m3` entry in full; the `"//"` key at the
   top of the file defines the syntax. The run fails for a rendered page without an entry.
   ```json
   { "name": "simulate on", "steps": [{ "click": "#m3-sim" }],
     "expect": [["#m3-sim", "checked", true], ["#m3-sim-text", "hidden", false]] }
   ```
8. **Register the page.** Search for `sdt_mafc` in the first four files below and add the new page beside
   it: the model map and the list of models by family in `index.qmd`, the sidebar in `_quarto.yml`, the page
   list in the "Verify the render" step of `.github/workflows/ci.yml`, and the status table in `README.md`,
   whose count of live pages above it and "Next:" list below it change too.
   Then add it to the axis table under "Which models have a task-settings axis" in `dev/ROADMAP.md`: a
   new row, or your model in the row of its design axis if one exists (`sdt_ranking` is already in
   "SDT mAFC, ranking"). If the page completes a milestone there (`sdt_ranking` is E11a), add it to the
   "Shipped by" line below the milestone table.

## Checks before a pull request

Run these and tick them in the pull request, whose template (`.github/PULL_REQUEST_TEMPLATE.md`) lists
them.

1. **Parity tests.** `node --test` runs every test in the repository in about a minute and must pass.
2. **Fresh fixtures agree.** Regenerate from the CRAN release of bmm into a scratch directory, compare
   with the committed files, and run the tests against the fresh ones (a model that CRAN does not have
   yet follows the section on those models instead):
   ```bash
   fresh=$(mktemp -d)
   Rscript R/make_fixtures.R "$fresh"
   node tests/parity/compare-fixtures.mjs tests/parity/fixtures "$fresh" 1e-10
   BMM_FIXTURES="$fresh" node --test
   ```
   The comparison prints `fixtures agree within 1e-10` or the cells that differ.
3. **Render.** `quarto render` finishes without a warning. `quarto preview` serves the site with live
   reload while you work.
4. **Fit and speed on a laptop screen.** Open the rendered page in Chrome with a viewport of 1280 x 713
   pixels (DevTools device toolbar), the room a 1280 x 800 screen leaves under the browser's toolbar and
   tabs; the drawings scale with the viewport height, so the size matters. The dashboard must be no
   taller than the viewport, and nothing may scroll sideways. Run this in the console. It returns the
   dashboard's height in pixels, the viewport's height, the horizontal overflow in pixels, and the slowest
   redraw in milliseconds over every slider swept across its range:
   ```js
   const dash = document.querySelector(".ex-dash"), ms = [];
   for (const r of dash.querySelectorAll('input[type="range"]')) {
     if (!r.getClientRects().length || r.disabled) continue;
     for (let k = 0; k <= 14; k++) {
       r.value = +r.min + (+r.max - +r.min) * k / 14;
       r.dispatchEvent(new Event("input", { bubbles: true }));
       ms.push(+dash.dataset.redrawMs);
       await new Promise(done => setTimeout(done, 30));
     }
   }
   ({ dashboardHeight: Math.round(dash.getBoundingClientRect().height), viewportHeight: innerHeight,
      overflowX: document.documentElement.scrollWidth - innerWidth, slowestRedrawMs: Math.max(...ms) })
   ```
   Repeat with the simulate switch on. The height must not exceed the viewport's, the overflow must be 0,
   and the slowest redraw must be under 16. A first sweep just over 16 is usually warm-up: run it again,
   and a value that stays above 16 is a real problem.
5. **Accessibility.** After `quarto render`, which writes the site to `_site`, fetch the pinned axe-core
   (a version fixed by a checksum in `tests/a11y/axe.json`, an accessibility checker used only for tests)
   and run it over `_site` in every state in `states.json`:
   ```bash
   node tests/a11y/fetch-axe.mjs
   node tests/a11y/run-axe.mjs
   ```
   `--page models/<model>` limits the run to one page; a `--page` that matches no page fails. A serious or critical violation fails the run; so does
   a failed check on value texts, plot summaries, focus marks or the tablet passes (1024 x 768 and
   768 x 1024, 44 px targets, no sideways scroll).
6. **Keyboard.** Reach and operate every control with Tab, arrow keys, Enter and Space alone, including
   the draggable items in the drawings and the (i) notes, and see the focus ring at every step.
7. **A reader who has not seen the page** (next section).
8. **The code on the page runs.** Copy the code of the "In bmm" section in the default state, in each
   model choice and at the extremes of the task settings, into R with the CRAN release of bmm. The model
   constructor and the `d*()` call must run. Where the page gives the `d*()` value, R must return it: the
   DDM, EZ-DM and CS-Wald pages print it as a comment under the call (to four decimals), and the SDT
   pages store it on the code block, which you read in the console with
   `document.querySelector("[data-logd]").dataset.logd`. It returns one number on the mAFC page, and on
   the yes/no and rating pages a JSON array of two: the noise row, then the signal row. The other pages do not give the value.
   A new page in one of these families gives it the same way, every value its printed call returns, so
   this check can compare it. For the
   `bmm()` call, replace `my_data` with a few made-up rows in the columns the model's reference page lists, and add `empty = TRUE`: it then builds the model
   without sampling and must not stop with an error.

A pull request that touches `R/`, `tests/parity/`, `js/models/` or `.github/workflows/oracle.yml` also
runs the oracle workflow on GitHub. A failed CRAN job turns the run red, and a pull request with a red CRAN job is not merged.

## The reader pass

A page has to be understood by someone who has not read its code, and the author cannot judge that. Ask
a person from the audience, a colleague or student who knows the experimental task but has not seen the
page (not you, and not someone who helped build it), to read it alone, top to bottom, and to move every control. They say where they stopped, guessed,
or did not know what a word or a curve meant. You listen and take notes; you do not explain.

Each point goes into the page: a reworded sentence, a longer (i) note, a label, a changed order. Then
the person reads the changed parts again. Findings are not kept in a log or pasted into the pull
request; the pull request says only that the pass happened. Keep going until the same reader no longer
stops.

## Text and drawing rules

- English, with bmm's terminology. Plain wording; no filler, no claim larger than the page shows.
- A number in prose comes from a fixture, a table or a figure of the page. Cite only papers that bmm
  cites: in its articles, whose sources are in
  [`vignettes/articles/REFERENCES.bib`](https://github.com/popov-lab/bmm/blob/master/vignettes/articles/REFERENCES.bib),
  or in the References section of a model's reference page.
- Information never rests on colour alone. Pair colour with a dash pattern, a label, a marker or a
  position, so the page reads in greyscale and for colour-blind readers.
- Colours are the Okabe-Ito palette, as the `--ex-*` custom properties at the top of `css/explorer.css`.
  In `js/lib/plot.js` the series order is blue `#0072B2`, orange `#D55E00`, green `#009E73`, purple
  `#CC79A7`, sky `#56B4E9`, yellow `#E69F00`. Text in orange, green, purple, sky or yellow uses
  its `-text` variant (`--ex-orange-text`, for example), which has the contrast text needs (4.5:1). Blue
  has no such variant: blue text uses `--ex-blue` itself.
- Code comments say why, not what.

## Fixtures: regenerated, never edited

Fixture files are what bmm computed. A hand edit would make them say what the port computes, and the test
would pass for the wrong reason. Change `R/make_fixtures.R` and regenerate:
`Rscript R/make_fixtures.R tests/parity/fixtures`. Each file records the bmm version and the call
behind every cell. Commit the regenerated file with the change that needs it, so the pull request shows
the diff. A diff in a file you did not touch means bmm changed; find out why before you commit it.

## Models that are not on CRAN yet

A model gets a deployed page once it is on CRAN: bmm's NEWS (<https://venpopov.com/bmm/news/index.html>)
lists each model under the release that added it, and bmm's CRAN page gives the released version. A port can start earlier, against fixtures written
with bmm's `develop` branch installed, on a branch that is not
deployed. It merges when CRAN has the model and the fixtures have been regenerated from the CRAN
release. Say in the pull request which bmm version the fixtures come from. The tracking issue for the
models of bmm 1.5.0 and 1.6.0 is [#18](https://github.com/GidonFrischkorn/bmm-explorer/issues/18).

## When bmm changes or a check finds a drift

The oracle workflow regenerates the fixtures from CRAN bmm and from bmm's `develop` branch every Monday
at 06:00 UTC, when started by hand from the Actions tab, and on pushes to `main` and pull requests that
touch `R/`, `tests/parity/`, `js/models/` or `.github/workflows/oracle.yml`. A failed
CRAN job turns the run red; a failed `develop` job does not. A deployment does not wait for the oracle, so a red CRAN run
means the fix has to land before the next deployment.

A warning in the `develop` fixture run that announces a deprecation, by bmm or a dependency, fails the
`develop` job. On a scheduled or manual run it also opens the issue "Oracle (develop): a warning in the
fixture run announces a deprecation", or comments on it while it is open, with the warnings and a link
to the run. Each warning names a form that a later release removes or turns into an error. Where it is
a call in the fixture script, move the script, and any page that prints the same call, to the new form
once CRAN bmm accepts it. Close the issue when the `develop` job passes again; a later deprecation then
opens a new one.

If the oracle fails, open an issue titled `Oracle: <function> differs from bmm <version>`, with the link
to the run, the fixture file, the cells that differ and the size of the difference. Say whether the
change looks intended; bmm's NEWS usually answers that. Fix the port and the fixture cells in one pull
request.

A break can also arrive from bmm's side. bmm's maintainers announce a change to the model contract
(what `model_spec()` returns, including default priors; the simulation generic `simulate_data()` and each model's method for it; a
density or generator function; `link_transform()`) in an issue here before the release that contains
it, using the "Companion package change" template. The title starts with `[companion-change]`.
[#34](https://github.com/GidonFrischkorn/bmm-explorer/issues/34) is an example. bmm's repository can
also run this explorer's fixture checks on each push to its `develop` and `dev-*` branches, once a
week, and on demand (currently switched off). That job never blocks a merge in bmm and sends no notification. When a failure there
comes from a contract change that was not announced, bmm's maintainers file the companion-change issue
here; when the explorer is at fault, they open an ordinary issue. A fix is a pull request that names
the issue.

## Licence

Contributions are under the licences of the repository: GPL-2 for code ([`LICENSE`](LICENSE)), CC BY 4.0 for page
text and illustrations ([`LICENSE-text.md`](LICENSE-text.md)).
