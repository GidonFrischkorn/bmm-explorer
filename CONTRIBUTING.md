# Contributing to the bmm model explorer

The explorer is a website of interactive pages for the models in the [bmm](https://venpopov.com/bmm/)
R package. Each page has sliders for a model's parameters, a drawing of the task, the predicted
responses and the prediction across a task setting. Everything runs in the browser: plain JavaScript and
SVG, no packages to install, no R when a page loads.

This guide shows how to add a page, which checks a pull request has to pass, and how to report a
problem. If you only want to ask for a page or report a bug, open an issue from the templates; you do
not need the rest.

## The one rule

A density ships on a page only with a test that holds it to values bmm itself wrote. Every function in
`js/models/` is a JavaScript copy of one of bmm's `d*()` functions, and the explorer must never become a
second definition of a model. The values come from `R/make_fixtures.R`, which calls the installed bmm and
writes `tests/parity/fixtures/*.json`; a value in those files is a fixture. The tests in `tests/parity/`
(the parity tests) compare the copies with the fixtures: 1e-10 absolute on the log scale, 1e-9 where the
copy integrates numerically, that is, where the density contains a quadrature or an integral, as the
normaliser of `sdm` does. Each test states its tolerance; start at 1e-10 and loosen it only for a
numerical integral, with the reason written in the test. A GitHub workflow, the oracle, regenerates the
fixtures from bmm every week (see "When bmm changes or a check finds a drift").

Three conventions follow from it. Parameters, argument names and defaults are bmm's, as the reference page
of the model lists them (<https://venpopov.com/bmm/reference/>): `p_mem` and `kappa` for the mixture
models, `n_other` and `num_options` for `m3`. A page shows the bmm call that matches the current slider
values. There are no dependencies: no npm packages, and no scripts from a CDN except what Quarto loads
itself.

## The page template

A page opens with a dashboard (`<div class="ex-dash">`) that fits one laptop screen, 1280 x 800, without
scrolling. Below 1000 px of width the panels stack. It has five panels (the dashboard) and, below it, five
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
prints them (here `Intercept_d ~ normal(1, 1)`); every parameter of the model gets a slider; the model's reference page names each parameter's link. Where the link is log, the slider is on the log scale and the number field
in natural units. The prior means are the starting values and the dashed reference. If a page uses
another range, its Explore section says so and says why (the `sdm` page does).

**The design axis.** Every page answers one question: which task settings enter the likelihood? Candidate
counts for `m3` and `mpt`, non-target positions for `imm`, `m` for `sdt_mafc`, trials per cell for
`ezdm`. To find them for a new model, read the arguments of its `d<model>()`: those that are neither the
data nor parameters to estimate describe the task. The fifth panel shows the prediction across that setting. A model with no such setting says so
in one paragraph on the page instead of inventing an axis. The table "Which models have a task-settings
axis" in [`dev/ROADMAP.md`](dev/ROADMAP.md) lists the answers so far; step 8 adds your row.

Below the dashboard come five sections with these headings, in this order:

1. **What the model says**: three to five sentences and the formula, parameters named as in bmm.
2. **The task**: what one trial is, and which task settings enter the likelihood.
3. **Explore**: how to read the panels, and where the ranges come from.
4. **Across task settings**: why the prediction changes with the design variable, or the paragraph that
   says there is none.
5. **In bmm**: the `bmm()` call and the `d*()` call with the current values filled in, copyable, and
   links to the bmm article and reference page.

## Adding a page

The example is a model called `sdt_ranking`; replace the names with yours. You need Node 20 or newer,
Quarto 1.5 or newer, Chrome, and R with bmm and jsonlite for the fixture steps. Reading
`models/sdt_mafc.qmd`, `js/pages/sdt_mafc.js` and `js/models/sdt.js` first is the fastest way in. Start
from a branch of `main`, named for the page (`sdt-ranking-page`). Do the steps in order. Steps 2 and 5
both add cells to the fixture script: run it after step 2 and again after step 5, then run the tests.
The checks in the next section come after step 8.

1. **Port the density.** Add pure functions to `js/models/<family>.js`; a model that belongs with
   existing ones goes into their file (the families are the files in `js/models/`; `sdt_ranking` goes into
   `sdt.js`), any other gets a new file. A density returns the log
   density, takes `x` as a number or array and the parameters as an object with bmm's names, and
   touches no DOM. Use `js/lib/math.js` (`logPnorm`, `qnorm`, `lgamma`, `log1mExp`, `integrateExp`)
   instead of writing special functions again (read the file for the signatures). If the density needs a
   quadrature rule, `R/make_fixtures.R` writes bmm's own nodes and weights to
   `tests/parity/fixtures/nodes.json` (see the `node_cells` list in the script) and the page fetches them;
   never use nodes computed in JavaScript.
2. **Write the fixture cells.** In `R/make_fixtures.R` add a section that calls bmm's `d<model>()` on a
   small literal grid: under 50 cells per density, covering the slider ranges the page offers and the
   corners where a port is weakest (`kappa` near 0 and above 100, probabilities near 0 and 1, counts of
   0). Copy the nearest section of the script (the `dsdt_mafc` cells, for example): each cell is a
   `list(fn = , args = , logd = )` and `write_fx()` writes the file. Guard a function that older bmm
   versions lack with `has_since("d<model>", "<version>")`, defined at the top of the script; the version is
   the one the function's reference page and bmm's NEWS give. A bmm without it skips the cells, and a
   newer bmm that lost it stops the script. Check which bmm is installed with
   `Rscript -e 'packageVersion("bmm")'`, then run `Rscript R/make_fixtures.R tests/parity/fixtures`. For a
   model that CRAN does not have yet, read "Models that are not on CRAN yet" first.
3. **Write the parity test.** Add to `tests/parity/<family>.test.mjs` (create it if the family is new). It loads the fixture file, runs your
   function on every cell and states its tolerance. Log densities that reach far tails are compared
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
   no other page uses (`m3-`, `imm-`, `sdtmafc-`); behaviour lives in `js/pages/<model>.js`, loaded as a
   module at the end of the page. The script uses `js/lib/`: `widget.js` for coupled sliders
   (`bindParams`; scales `LINEAR`, `LOG`, `LOGIT`), `plot.js` for line and bar plots, `circular-plot.js` for
   densities over a circular error, `sdt-plot.js` for evidence densities and ROC curves, `axis.js` for axes
   that hold their limit and ease to a new one, `info.js` for the (i) notes (call `initInfo()` once at the
   end). At the start of each redraw take `const t0 = performance.now()`, and at its end set
   `dashboard.dataset.redrawMs = (performance.now() - t0).toFixed(2)` (`dashboard` is the `.ex-dash`
   element), as the other pages do; the redraw
   check below reads it.
5. **Add the simulate switch.** Every page has a "simulate N trials" switch that draws a sample from the
   predicted distribution. `js/lib/sim-panel.js` has the controls (`simControls`). The sampler depends on
   the response: `circularSim` in `js/lib/simulate.js` inverts a density over a circular error,
   `categoryCounts` draws counts from the probabilities the density scores (categorical and rating
   pages), `shareBelow` a share of correct or yes responses (m-AFC and yes/no pages), and `js/lib/simulate-rt.js` serves the response-time pages. All draw from fixed uniforms
   (`js/lib/random.js`, seeded), so the sample stays put while a slider moves. The sampler needs two
   kinds of fixture, added to `R/make_fixtures.R` (the `simulate*` sections show how). Expected
   probabilities or statistics come from bmm's `d*()`, by `integrate()` where they are moments of a
   continuous density. A sample of 1e5 trials comes from bmm's `r*()` function for the model. The test,
   in `tests/parity/simulate*.test.mjs`, draws one seeded sample of 1e5 trials from your sampler and holds
   it to bmm's within 4 √2 standard errors (4 × √2 × SE) for each share or statistic the page displays.
   The switch's markup is in the dashboard you copied: a checkbox `<prefix>-sim` and the ids `-sim-n`,
   `-sim-new` and `-sim-text`. If no sampler fits your response, write one in `js/lib/simulate.js` in the
   same pattern (uniforms in, draws out) and test it the same way.
6. **Write the summaries for screen readers.** Every SVG in the dashboard has an id and a text summary.
   Add `<model>Summaries(...)` to `js/lib/summaries.js`, a pure function of the values the page drew that
   returns `{ svg id: text }` (copy `sdtMafcSummaries`), and a case in `tests/lib/summaries.test.mjs`. The page calls
   `describePlot(svg, summary)` after each redraw and `initA11y()` once. Draggable SVG items get
   `sliderAria()`.
7. **Add the page to the accessibility run.** `tests/a11y/states.json` needs an entry under
   `models/<model>`, with a state for each thing a reader can switch: simulate on, each model choice, an
   open (i) note, and an entry outside the slider range. Such an entry makes the page stale: the plots are
   greyed and keep the last valid values, and the page announces it. A state looks like this (from the
   `models/m3` entry); the `"//"` key at the top of the file defines the syntax in full. The run fails for a
   rendered page without an entry.
   ```json
   { "name": "simulate on", "steps": [{ "click": "#m3-sim" }], "expect": [["#m3-sim", "checked", true]] }
   ```
8. **Register the page.** Search for `sdt_mafc` in the files below and add the new page beside it: the
   model map and the list of models by family in `index.qmd`, the sidebar in `_quarto.yml`, the page list in
   the "Verify the render" step of `.github/workflows/ci.yml`, the status table in `README.md`, and the
   axis table in `dev/ROADMAP.md`.

## Checks before a pull request

Run these and tick them in the pull request, whose template (`.github/PULL_REQUEST_TEMPLATE.md`) lists
them.

1. **Parity tests.** `node --test` runs every test in the repository in under a minute and must pass.
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
   `--page models/<model>` limits the run to one page. A serious or critical violation fails it; so does
   a failed check on value texts, plot summaries, focus marks or the tablet passes (1024 x 768 and
   768 x 1024, 44 px targets, no sideways scroll).
6. **Keyboard.** Reach and operate every control with Tab, arrow keys, Enter and Space alone, including
   the draggable items in the drawings and the (i) notes, and see the focus ring at every step.
7. **A reader who has not seen the page** (next section).
8. **The code on the page runs.** Copy the code of the "In bmm" section in the default state, in each
   model choice and at the extremes of the task settings, into R with the CRAN release of bmm. The model
   constructor and the `d*()` call must run and the `d*()` value must match the page's. For the `bmm()`
   call, replace `my_data` with a few made-up rows in the columns the model's reference page lists, and add `empty = TRUE`: it then builds the model
   without sampling and must not stop with an error.

A pull request that touches `R/`, `tests/parity/` or `js/models/` also runs the oracle workflow on
GitHub. Its CRAN job has to pass.

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
  cites in its references.
- Information never rests on colour alone. Pair colour with a dash pattern, a label, a marker or a
  position, so the page reads in greyscale and for colour-blind readers.
- Colours are the Okabe-Ito palette, as the `--ex-*` custom properties at the top of `css/explorer.css`.
  In `js/lib/plot.js` the series order is blue `#0072B2`, orange `#D55E00`, green `#009E73`, purple
  `#CC79A7`, sky `#56B4E9`, yellow `#E69F00`. Text in one of these hues uses its `-text` variant, which
  has the contrast text needs (4.5:1).
- Code comments say why, not what.

## Fixtures: regenerated, never edited

Fixture files are what bmm computed. A hand edit would make them say what the port computes, and the test
would pass for the wrong reason. Change `R/make_fixtures.R` and regenerate:
`Rscript R/make_fixtures.R tests/parity/fixtures`. Each file records the bmm version and the call
behind every cell. Commit the regenerated file with the change that needs it, so the pull request shows
the diff. A diff in a file you did not touch means bmm changed; find out why before you commit it.

## Models that are not on CRAN yet

A model gets a deployed page once it is on CRAN (look the package up on CRAN, and read bmm's NEWS for the
release that added the model). A port can start earlier, against fixtures written
with bmm's `develop` branch installed, on a branch that is not
deployed. It merges when CRAN has the model and the fixtures have been regenerated from the CRAN
release. Say in the pull request which bmm version the fixtures come from. The tracking issue for the
models of bmm 1.5.0 and 1.6.0 is [#18](https://github.com/GidonFrischkorn/bmm-explorer/issues/18).

## When bmm changes or a check finds a drift

The oracle workflow regenerates the fixtures from CRAN bmm and from bmm's `develop` branch every Monday
at 06:00 UTC, and on pushes and pull requests that touch `R/`, `tests/parity/` or `js/models/`. The CRAN
job blocks; the `develop` job only reports. A deployment does not wait for the oracle, so a red CRAN run
means the fix has to land before the next deployment.

If the oracle fails, open an issue titled `Oracle: <function> differs from bmm <version>`, with the link
to the run, the fixture file, the cells that differ and the size of the difference. Say whether the
change looks intended; bmm's NEWS usually answers that. Fix the port and the fixture cells in one pull
request.

A break can also arrive from bmm's side. bmm's maintainers announce a change to the model contract
(an accessor, a density or generator function, a default) in an issue here before the release that
contains it, using the "Companion package change" template. The title starts with `[companion-change]`.
[#34](https://github.com/GidonFrischkorn/bmm-explorer/issues/34) is an example. Bmm's repository can
also run this explorer's fixture checks against its `develop` branch and report a failure to its own
maintainers, who then file the same issue. A fix is a pull request that names the issue.

## Licence

Contributions are under the licences of the repository: GPL-2 for code ([`LICENSE`](LICENSE)), CC BY 4.0 for page
text and illustrations ([`LICENSE-text.md`](LICENSE-text.md)).
