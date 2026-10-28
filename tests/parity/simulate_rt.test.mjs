// Simulated data on the response-time pages against bmm. ddm and cswald: the expected P(upper) and per-response mean
// and variance of rt against integrate() over bmm's dddm(), and a seeded sample of the explorer's and bmm's sample from
// rddm() or rcswald() against those values. ezdm: the expected statistics of a cell against the exact values from
// bmm's EZ moments, and a seeded sample of cells and bmm's from rezdm() against them. Each sample is scaled by its own
// SE: the explorer's from its draws, bmm's from the fixture, so neither test moves with the other's stream. bmm's side
// was replayed over 1000 other r*() streams (set.seed(seed + 100000 K), K 1 to 1000, through compare-fixtures.mjs and
// this file): all passed, the largest |z| 4.81 (ezdm var_var_rt_upper at n_trials 10), every other statistic within
// 4.46. The explorer's samples, fixed: largest |z| 2.91 (ezdm 3par, n_trials 100, drift 0, bound 1, p_upper); among
// ddm and cswald 2.23 (ddm drift -1, bound 2, zr 0.3, var_lower).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureSince, rtSampleError, rareCountOk, SAMPLE_LIMIT } from "./helpers.mjs";
import { ddmSim, cswaldDdmPars, ezdmCells, ezdmExpected, ezdmCellStats, ezdmCountTerms, rtStats, rtHistogram, EZ_STRIDE } from "../../js/lib/simulate-rt.js";
import { mulberry32, uniforms } from "../../js/lib/random.js";
import { ezdmMoments4par } from "../../js/models/rt.js";

const fx = loadFixtureSince("simulate_rt");
// The grid's Simpson sums (simulate-rt.js) against integrate(): P(upper) absolute, the means relative to the response's
// SD, the variances relative. Measured over these cells: 4.4e-9, 8.8e-11 and 4.5e-9.
const TOL = { p: 2e-8, mean: 1e-9, var: 2e-8 };

const errors = (cell, got) => Object.entries(got).map(([k, [v, se]]) => rtSampleError(cell, k, v, se)).filter(Boolean);
// The SE of a mean, as R/make_fixtures.R computes bmm's: sd(x) / sqrt(length(x)).
const se = xs => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) / n);
};

for (const cell of fx?.cells ?? []) {
  // ezdmCountTerms() against dbinom(): P(k >= 2), E(1 / k | k >= 2) and E(1 / (k - 1) | k >= 2) per boundary, relative
  // 1e-10 (P(k >= 2) reaches 1e-19 at P(upper) 1e-12).
  if (cell.fn === "ezdm_count_terms") {
    cell.pC.forEach((pC, i) => {
      test(`ezdmCountTerms(${pC}, ${cell.n_trials[i]}) matches dbinom()`, () => {
        const got = ezdmCountTerms(pC, cell.n_trials[i]);
        ["upper", "lower"].forEach((b, j) => {
          for (const key of ["share", "inv", "inv1"]) {
            const ref = cell[`${key}_${b}`][i], v = got[j][key];
            assert.ok(Object.is(v, ref) || Math.abs(v - ref) <= 1e-10 * Math.abs(ref), `${key} ${b}: ${v} vs ${ref}`);
          }
        });
      });
    });
    continue;
  }

  const label = `${cell.fn}(${JSON.stringify(cell.page ? { ...cell.args, page: cell.page } : cell.args)})`;

  if (cell.fn === "ddm" || cell.fn === "cswald") {
    const pars = { zr: 0.5, ...cell.args };
    if (cell.fn === "cswald") {
      test(`${label}: the page passes rcswald() the diffusion model these arguments give`, () => {
        const page = { drift: cell.args.drift, bound: cell.page.bound, ndt: cell.args.ndt, zr: cell.args.zr ?? 0.5 };
        assert.deepEqual(cswaldDdmPars(page, cell.page.version), pars);
      });
    }
    const sim = ddmSim(pars), e = sim.expected;

    test(`${label}: expected statistics match integrate() over dddm(), bmm ${fx.bmm_version}`, () => {
      assert.ok(Math.abs(e.pUpper - cell.expected.p_upper) <= TOL.p, `p_upper ${e.pUpper} vs ${cell.expected.p_upper}`);
      for (const side of ["upper", "lower"]) {
        const v = cell.expected[`var_${side}`];
        if (v === undefined) continue;
        const dm = Math.abs(e[side].mean - cell.expected[`mean_${side}`]) / Math.sqrt(v), dv = Math.abs(e[side].sd ** 2 / v - 1);
        assert.ok(dm <= TOL.mean && dv <= TOL.var, `${side}: mean off by ${dm.toExponential(2)} SD, variance by ${dv.toExponential(2)} relative`);
      }
    });

    // The statistics as the page's summary line computes them (rtStats()); the variance is its SD squared.
    test(`${label}: a sample of ${cell.n} trials is within ${SAMPLE_LIMIT} SE of the expected statistics`, () => {
      const d = sim.draw(uniforms(2 * cell.n, cell.seed)), st = rtStats(d), got = { p_upper: [st.pUpper] };
      assert.equal(st.n, cell.n);
      for (const side of ["upper", "lower"]) {
        if (cell.expected[`var_${side}`] === undefined) continue;
        const x = d[side], m = st[side].mean;
        got[`mean_${side}`] = [m, se(x)];
        got[`var_${side}`] = [st[side].sd ** 2, se(x.map(v => (v - m) ** 2))];
      }
      const errs = errors(cell, got);
      assert.ok(errs.length === 0, `explorer: ${errs.join("; ")}`);
    });

    // The page's bars: each response's bars have as their area its share of the trials whose rt falls on the axis.
    test(`${label}: rtHistogram() bars have each response's share as their area`, () => {
      const d = sim.draw(uniforms(2000, cell.seed)), xlim = [0, e.upper.mean + 2 * e.upper.sd], h = rtHistogram(d, xlim, 40);
      assert.equal(h.edges.length, 41);
      for (const side of ["upper", "lower"]) {
        const area = h[side].reduce((a, v) => a + v, 0) * (xlim[1] - xlim[0]) / 40;
        const inside = d[side].filter(x => x >= xlim[0] && x < xlim[1]).length / 1000;
        assert.ok(Math.abs(area - inside) < 1e-12, `${side}: area ${area}, share on the axis ${inside}`);
      }
    });
  } else {
    const a = cell.args, n = a.n_trials, rows = a.version === "4par" ? ["_upper", "_lower"] : [""];
    const ex = ezdmExpected(a, a.version, n);

    test(`${label}: expected statistics match bmm's EZ moments`, () => {
      const got = { p_upper: ex.pUpper };
      ex.rows.forEach((r, j) => Object.assign(got, {
        [`mean_rt${rows[j]}`]: r.mean, [`var_rt${rows[j]}`]: r.varRt, [`var_mean_rt${rows[j]}`]: r.sdMean ** 2, [`cov_mean_var${rows[j]}`]: r.cov,
        [`var_var_rt${rows[j]}`]: r.varVar
      }));
      for (const [k, v] of Object.entries(cell.expected)) {
        assert.ok(Math.abs(got[k] - v) <= 1e-10 * Math.max(1, Math.abs(v)), `${k}: ${got[k]} vs ${v}`);
      }
    });

    // One cell at fixed uniforms against bmm's draw at the same uniforms (R/make_fixtures.R § simulate_rt): the trial
    // uniforms put k trials at the row's boundary, the row's two uniforms are u_var and u_mean, the rest 0.5. var_rt on
    // the log scale at 1e-10, as qgamma() in math.test.mjs; mean_rt at 1e-10 of max(1, |mean_rt|).
    test(`${label}: a cell drawn from fixed uniforms is bmm's draw from them`, () => {
      const errs = [];
      for (const at of cell.at_uniforms) {
        const j = at.row === "_lower" ? 1 : 0, kUp = at.row === "_lower" ? n - at.k : at.k;
        cell.u_var.forEach((u, i) => {
          const us = new Float64Array(EZ_STRIDE).fill(0.5);
          for (let t = 0; t < n; t++) us[4 + t] = t < kUp ? 0 : 1;
          us[2 * j] = u; us[2 * j + 1] = cell.u_mean[i];
          const c = ezdmCells(a, a.version, n, us, 1)[0];
          const v = rows.length > 1 ? c.var_rt[j] : c.var_rt, m = rows.length > 1 ? c.mean_rt[j] : c.mean_rt;
          if (!(Math.abs(Math.log(v) - Math.log(at.var_rt[i])) <= 1e-10)) errs.push(`k ${at.k}${at.row}, u ${u}: var_rt ${v} vs ${at.var_rt[i]}`);
          if (!(Math.abs(m - at.mean_rt[i]) <= 1e-10 * Math.max(1, Math.abs(at.mean_rt[i])))) errs.push(`k ${at.k}${at.row}, u ${u}: mean_rt ${m} vs ${at.mean_rt[i]}`);
        });
      }
      assert.ok(errs.length === 0, errs.join("; "));
    });

    test(`${label}: a sample of ${cell.n} cells is within ${SAMPLE_LIMIT} SE of the expected statistics`, () => {
      // The uniforms of uniforms(cell.n * EZ_STRIDE, cell.seed), made and used in chunks of 10^4 cells.
      // P(upper), the means of mean_rt and var_rt and the SD of mean_rt as the page's summary line computes them
      // (ezdmCellStats(); E(s^2) is the expected var_mean_rt), the covariance and the mean of (var_rt - VRT)^2 summed
      // here. Each SE is the sample's own, sd / sqrt(count) of the values averaged (for the SD of mean_rt, of the
      // squared deviations from the expected mean).
      const gen = mulberry32(cell.seed), CHUNK = 1e4, all = [], xs = {};
      for (let done = 0; done < cell.n; done += CHUNK) {
        const us = Float64Array.from({ length: CHUNK * EZ_STRIDE }, gen);
        for (const c of ezdmCells(a, a.version, n, us, CHUNK)) {
          all.push(c);
          rows.forEach((r, j) => {
            const m = rows.length > 1 ? c.mean_rt[j] : c.mean_rt, v = rows.length > 1 ? c.var_rt[j] : c.var_rt;
            if (Number.isNaN(m)) return;
            const x = (xs[r] ??= { m: [], v: [], dm2: [], cov: [], dv2: [] });
            const dm = m - cell.expected[`mean_rt${r}`], dv = v - cell.expected[`var_rt${r}`];
            x.m.push(m); x.v.push(v); x.dm2.push(dm * dm); x.cov.push(dm * dv); x.dv2.push(dv * dv);
          });
        }
      }
      const st = ezdmCellStats(all, n, a.version), mean = ys => ys.reduce((acc, y) => acc + y, 0) / ys.length;
      const got = { p_upper: [st.pUpper] };
      rows.forEach((r, j) => Object.assign(got, {
        [`mean_rt${r}`]: [st.rows[j].mean, se(xs[r].m)], [`var_rt${r}`]: [st.rows[j].varRt, se(xs[r].v)],
        [`var_mean_rt${r}`]: [st.rows[j].sdMean ** 2, se(xs[r].dm2)], [`cov_mean_var${r}`]: [mean(xs[r].cov), se(xs[r].cov)],
        [`var_var_rt${r}`]: [mean(xs[r].dv2), se(xs[r].dv2)]
      }));
      const errs = errors(cell, got);
      assert.ok(errs.length === 0, `explorer: ${errs.join("; ")}`);
    });
  }

  // bmm's r*() against the exact values: the committed sample, or in CI the fresh one.
  test(`${label}: r${cell.fn}()'s sample is within ${SAMPLE_LIMIT} SE of the expected statistics`, () => {
    const errs = errors(cell, Object.fromEntries(Object.entries(cell.sample.mean).map(([k, v]) => [k, [v, cell.sample.se[k]]])));
    assert.ok(errs.length === 0, `bmm: ${errs.join("; ")}`);
  });
}

// rezdm() draws each boundary's statistics from its own random numbers, so the upper and lower rows of a cell are
// independent given n_upper. No statistic above sees a lower row that reuses the upper row's uniforms (each row's
// marginals stay exact), so the uniforms are checked one at a time: in 4par, us[o] (variance) moves the upper row's
// var_rt and mean_rt, us[o + 1] (mean) its mean_rt only, us[o + 2] and us[o + 3] the same in the lower row; in 3par the
// first two act on the one row and the next two on nothing. A cell of 20 trials, 10 at each boundary.
for (const version of ["4par", "3par"]) {
  test(`ezdmCells(${version}): each of a cell's first four uniforms moves only its own statistics`, () => {
    const p = { drift: 1, bound: 1.5, ndt: 0.2, zr: 0.6 }, nT = 20, base = new Float64Array(EZ_STRIDE).fill(0.5);
    for (let i = 0; i < nT; i++) base[4 + i] = i < nT / 2 ? 1e-3 : 1 - 1e-3;
    const flat = c => (version === "4par" ? [c.var_rt[0], c.mean_rt[0], c.var_rt[1], c.mean_rt[1]] : [c.var_rt, c.mean_rt, NaN, NaN]);
    const ref = ezdmCells(p, version, nT, base, 1)[0];
    assert.equal(ref.n_upper, nT / 2);
    assert.ok(flat(ref).slice(0, version === "4par" ? 4 : 2).every(Number.isFinite), "a row without statistics");
    // moved[j]: which of [var upper, mean upper, var lower, mean lower] (3par: var, mean) uniform o + j moves.
    const moved = version === "4par" ? [[1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 1, 1], [0, 0, 0, 1]] : [[1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let j = 0; j < 4; j++) {
      const us = base.slice();
      us[j] = 0.9;
      const c = ezdmCells(p, version, nT, us, 1)[0], got = flat(c).map((v, i) => (Object.is(v, flat(ref)[i]) ? 0 : 1));
      assert.equal(c.n_upper, ref.n_upper);
      assert.deepEqual(got, moved[j], `uniform o + ${j} moves [var upper, mean upper, var lower, mean lower] = ${got}`);
    }
  });
}

// The corners of the ddm and cswald sliders that the cells leave out because bmm's sampler is off there (narrowest
// bound, largest drift; R/make_fixtures.R § simulate_rt), against the exact EZ moments of the diffusion model, which
// rt.test.mjs holds to bmm's at 1e-10. Grid against exact, measured: P(upper) 1.4e-7, means 1.3e-6 SD, variances 2.1e-5
// relative; the rest of the gap to integrate() is fast-dm's truncation of the density, which bmm's dddm() keeps. The
// sample of 1e5 trials from seed 437 is held within SAMPLE_LIMIT exact SEs: binomial for P(upper), sqrt(VRT / k) for a
// mean of k rts and sqrt((k4 + 2 VRT^2) / k) for their variance (k4 the fourth cumulant). Largest |z| 2.74 (the upper
// mean at drift 3, bound 0.223, zr 0.818). Moments only for a response with P of at least 0.05.
const CORNER_TOL = { p: 1e-6, mean: 1e-5, var: 1e-4 }, CORNER_SEED = 437, CORNER_N = 1e5;
const corners = [];
for (const drift of [-3, 0, 3]) for (const bound of [0.223, 4.48]) for (const zr of [0.182, 0.818]) corners.push({ drift, bound, ndt: 0.2, zr });
for (const [drift, bound] of [[20.1, 0.814], [20.1, 4.92], [0.0498, 0.814], [0.0498, 4.92]]) corners.push({ drift, bound, ndt: 0.055, zr: 0.5 });
for (const p of corners) {
  test(`ddmSim(${JSON.stringify(p)}): grid and a sample of ${CORNER_N} against the exact moments`, () => {
    const m = ezdmMoments4par(p), sim = ddmSim(p), e = sim.expected, d = sim.draw(uniforms(2 * CORNER_N, CORNER_SEED));
    const errs = [];
    if (!(Math.abs(e.pUpper - m.pC) <= CORNER_TOL.p)) errs.push(`grid P(upper) ${e.pUpper} vs ${m.pC}`);
    const zp = (d.upper.length / CORNER_N - m.pC) / Math.sqrt(m.pC * (1 - m.pC) / CORNER_N);
    const rare = Math.min(m.pC, 1 - m.pC) * CORNER_N;
    if (SAMPLE_LIMIT * Math.sqrt(m.pC * (1 - m.pC) / CORNER_N) < 1 / CORNER_N
      ? !rareCountOk(m.pC < 0.5 ? d.upper.length : CORNER_N - d.upper.length, rare) : !(Math.abs(zp) <= SAMPLE_LIMIT)) {
      errs.push(`sample P(upper) ${zp.toFixed(2)} SE off`);
    }
    for (const [side, P, mdt, vrt, k4] of [["upper", m.pC, m.mdt_upper, m.vrt_upper, m.k4_upper], ["lower", 1 - m.pC, m.mdt_lower, m.vrt_lower, m.k4_lower]]) {
      if (P < 0.05) continue;
      const dm = Math.abs(e[side].mean - p.ndt - mdt) / Math.sqrt(vrt), dv = Math.abs(e[side].sd ** 2 / vrt - 1);
      if (!(dm <= CORNER_TOL.mean && dv <= CORNER_TOL.var)) errs.push(`grid ${side}: mean ${dm.toExponential(2)} SD, variance ${dv.toExponential(2)}`);
      const x = d[side], k = x.length, mu = x.reduce((a, b) => a + b, 0) / k, v = x.reduce((a, b) => a + (b - mu) ** 2, 0) / (k - 1);
      const zm = (mu - p.ndt - mdt) / Math.sqrt(vrt / k), zv = (v - vrt) / Math.sqrt((k4 + 2 * vrt ** 2) / k);
      if (!(Math.abs(zm) <= SAMPLE_LIMIT && Math.abs(zv) <= SAMPLE_LIMIT)) errs.push(`sample ${side}: mean ${zm.toFixed(2)} SE, variance ${zv.toFixed(2)} SE`);
    }
    assert.ok(errs.length === 0, errs.join("; "));
  });
}
