import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureSince, assertClose, assertCloseRel } from "./helpers.mjs";
import {
  DISTS, ynLogPOld, ynLogPNew, dsdtYn, biasToCriterion, sdtD, sdtCriterion, sdtBias, mafcLogitPc, mafcPc,
  dsdtMafc, mafcMatchD, ratingLogProbs, dsdtRating, parsimoniousThresholds, toLogDistance, fromLogDistance,
  evidencePdf, maxCompetitorPdf, ynRoc
} from "../../js/models/sdt.js";
import { integrateExp } from "../../js/lib/math.js";

// Log probabilities and log densities, 1e-10 absolute up to |value| 1e3 and 1e-13 relative beyond (assertCloseRel):
// the typed tail cells reach log P = -7.5e177 under Gumbel noise. The m-AFC quadrature runs on bmm's own nodes, so it is
// held to the same tolerance.
const TOL = 1e-10;
const fx = loadFixtureSince("sdt");
const nodes = loadFixtureSince("nodes");
const rules = nodes && { gh: nodes.cells.find(c => c.fn === ".mafc_gh"), gl: nodes.cells.find(c => c.fn === ".mafc_gl") };
// A fixture directory from a bmm without the SDT models has neither file; one without the other is an error.
if (!fx !== !rules) throw new Error("sdt.json and the m-AFC rules in nodes.json must come together");
const cells = fn => {
  const out = fx.cells.filter(c => c.fn === fn);
  if (!out.length) throw new Error(`sdt.json has no ${fn} cells`);
  return out;
};
const rows = args => args.stimulus?.length ?? args.m?.length ?? args.fa_rate.length;
const row = (args, i) => Object.fromEntries(Object.entries(args).map(([k, v]) => [k, Array.isArray(v) ? v[i] : v]));
const each = (args, f) => Array.from({ length: rows(args) }, (_, i) => f(row(args, i)));

if (fx) {
  for (const cell of cells("dsdt_yn")) {
    test(`dsdt_yn (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const lo = each(cell.args, r => ynLogPOld(r, r.stimulus));
      assertCloseRel(lo, cell.log_p_old, TOL, "log P(old)");
      assertCloseRel(each(cell.args, r => ynLogPNew(r, r.stimulus)), cell.log_p_new, TOL, "log P(new)");
      assertCloseRel(each(cell.args, r => dsdtYn(37, 100, r.stimulus, r)), cell.logd_37, TOL, "dsdt_yn(37, 100)");
    });
  }
  for (const cell of cells("dsdt_yn_tail")) {
    test(`dsdt_yn at a criterion of +-1000 (${cell.args.dist}) matches bmm ${fx.bmm_version}, -Inf included`, () => {
      assertCloseRel(each(cell.args, r => ynLogPOld(r, r.stimulus)), cell.log_p_old, TOL, "log P(old)");
      assertCloseRel(each(cell.args, r => ynLogPNew(r, r.stimulus)), cell.log_p_new, TOL, "log P(new)");
      // all new and all old: the zero count's term drops out even where its log P is -Inf
      assertCloseRel(each(cell.args, r => dsdtYn(0, 10, r.stimulus, r)), cell.logd_0, TOL, "dsdt_yn(0, 10)");
      assertCloseRel(each(cell.args, r => dsdtYn(10, 10, r.stimulus, r)), cell.logd_10, TOL, "dsdt_yn(10, 10)");
    });
  }
  for (const cell of cells("dsdt_yn_bias")) {
    test(`dsdt_yn with bias (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const lo = each(cell.args, r => ynLogPOld({ ...r, criterion: biasToCriterion(r.bias, r.d, r.sdratio) }, r.stimulus));
      assertCloseRel(lo, cell.log_p_old, TOL, "log P(old)");
    });
  }
  for (const cell of cells("sdt_d")) {
    test(`sdt_d, sdt_criterion, sdt_bias (${cell.args.dist}) match bmm ${fx.bmm_version}`, () => {
      const { dist } = cell.args;
      assertCloseRel(each(cell.args, r => sdtD(r.hit_rate, r.fa_rate, dist)), cell.d, TOL, "sdt_d");
      assertCloseRel(each(cell.args, r => sdtCriterion(r.hit_rate, r.fa_rate, dist)), cell.criterion, TOL, "sdt_criterion");
      assertCloseRel(each(cell.args, r => sdtBias(r.hit_rate, r.fa_rate, dist)), cell.bias, TOL, "sdt_bias");
    });
  }
  for (const cell of cells("dsdt_mafc")) {
    test(`dsdt_mafc (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const { dist } = cell.args;
      // log P(correct) and log P(error), as dsdt_mafc() of one trial returns them
      assertCloseRel(each(cell.args, r => dsdtMafc(1, 1, r.m, r.d, dist, rules)), cell.log_pc, TOL, "log P(correct)");
      assertCloseRel(each(cell.args, r => dsdtMafc(0, 1, r.m, r.d, dist, rules)), cell.log_1m_pc, TOL, "log P(error)");
      assertCloseRel(each(cell.args, r => dsdtMafc(r.n_correct, 100, r.m, r.d, dist, rules)), cell.logd, TOL, "dsdt_mafc");
    });
  }
  for (const cell of cells("dsdt_rating")) {
    const { thresholds, dist } = cell.args;
    test(`dsdt_rating K = ${thresholds.length + 1} [${thresholds.map(t => +t.toFixed(2))}] (${dist}) matches bmm ${fx.bmm_version}`, () => {
      // bmm returns NA (read as NaN) for a category whose bounds both underflow, where its own comment means -Inf:
      // log1m_exp()'s ifelse() turns -Inf - -Inf into NA, which the is.nan() guard of .sdt_category_log_probs()
      // misses. The port returns the -Inf bmm intends; such a category has no count, so the densities agree.
      const ref = cell.logp.map(v => Number.isNaN(v) ? -Infinity : v);
      assertCloseRel(each(cell.args, r => ratingLogProbs(thresholds, r, r.stimulus)).flat(), ref, TOL, "category log P");
      assertCloseRel(each(cell.args, r => dsdtRating(r.counts, r.stimulus, thresholds, r)), cell.logd, TOL, "dsdt_rating");
    });
  }
  for (const cell of cells("thresholds_log_distance")) {
    const { n_ratings: K, thresholds } = cell.args;
    test(`rating thresholds K = ${K} as log_distance parameters and back, as bmm builds them`, () => {
      const ld = toLogDistance(thresholds);
      assertClose([ld.criterion, ...ld.deltas], [cell.criterion, ...cell.deltas], 1e-12, "criterion, deltas");
      assertClose(fromLogDistance(cell.criterion, cell.deltas), cell.rebuilt, 1e-12, "bmm's log_distance thresholds");
      assertClose(parsimoniousThresholds(K), cell.parsimonious_start, 1e-12, "parsimonious thresholds at the prior means");
    });
  }

  // Not bmm functions: what the pages draw and solve, checked against the tested functions above.
  test("the drawn densities are the model's: each integrates to 1, and integrating them gives P(old) and P(correct)", () => {
    for (const dist of Object.keys(DISTS)) {
      const logf = f => xs => xs.map(x => Math.log(f(x)));
      const one = integrateExp(logf(DISTS[dist].pdf), -40, 40, 8000);
      assert.ok(Math.abs(one - 1) < 1e-9, `${dist}: density integrates to ${one}`);
      const pars = { d: 1.7, criterion: 0.4, sdratio: 1.6, dist };
      const hit = integrateExp(logf(x => evidencePdf(x, pars, 1)), pars.criterion, 60, 8000);
      assert.ok(Math.abs(hit - Math.exp(ynLogPOld(pars, 1))) < 1e-9, `${dist}: hit rate ${hit}`);
      for (const m of [2, 5, 8]) {
        const pc = integrateExp(logf(x => DISTS[dist].pdf(x - 1.3) * Math.exp((m - 1) * DISTS[dist].lcdf(x))), -40, 40, 8000);
        assert.ok(Math.abs(pc - mafcPc(1.3, m, dist, rules)) < 1e-6, `${dist}, m = ${m}: P(correct) ${pc} vs ${mafcPc(1.3, m, dist, rules)}`);
        const comp = integrateExp(logf(x => maxCompetitorPdf(x, m, dist)), -40, 40, 8000);
        assert.ok(Math.abs(comp - 1) < 1e-9, `${dist}, m = ${m}: competitor density integrates to ${comp}`);
      }
    }
  });
  test("mafcMatchD finds the d with the target P(correct) under every distribution", () => {
    for (const dist of Object.keys(DISTS)) for (const m of [2, 4, 10]) for (const target of [-3, 0.2, 4]) {
      const d = mafcMatchD(target, m, dist, rules);
      assert.ok(Math.abs(mafcLogitPc(d, m, dist, rules) - target) < 1e-9, `${dist}, m = ${m}, logit ${target}: d = ${d}`);
    }
  });
  test("mafcMatchD reaches the logits of d typed far outside the slider, and gives NaN where no d reaches them", () => {
    const dists = Object.keys(DISTS);
    for (const from of dists) for (const m of [2, 3, 10]) for (const typed of [-40, -12, 15, 25]) {
      const target = mafcLogitPc(typed, m, from, rules);
      for (const dist of dists) {
        const d = mafcMatchD(target, m, dist, rules);
        assert.ok(Math.abs(mafcLogitPc(d, m, dist, rules) - target) <= 1e-8 * Math.max(1, Math.abs(target)),
          `${from} d = ${typed} -> ${dist}, m = ${m}, logit ${target}: d = ${d}`);
      }
    }
    // normal's quadrature logit is Inf from d = 48.25; gumbel_min's is -Inf below d = -709.78, where exp(-d)
    // overflows, and no lower than about -6374 above it at m = 10, short of normal's -1.6e5 at d = -200.
    for (const dist of dists) assert.ok(Number.isNaN(mafcMatchD(mafcLogitPc(50, 10, "normal", rules), 10, dist, rules)), dist);
    assert.equal(mafcLogitPc(-709.8, 10, "gumbel_min"), -Infinity);
    assert.ok(mafcLogitPc(-709.7, 10, "gumbel_min") > mafcLogitPc(-200, 10, "normal", rules));
    assert.ok(Number.isNaN(mafcMatchD(mafcLogitPc(-200, 10, "normal", rules), 10, "gumbel_min", rules)));
  });
  test("the ROC runs from (1, 1) to (0, 0) without increasing, and passes through the yes/no point", () => {
    for (const dist of Object.keys(DISTS)) for (const sdratio of [0.407, 1, 2.46]) {
      const pars = { d: 1.5, sdratio, dist }, roc = ynRoc(pars);
      roc.slice(1).forEach(([fa, h], i) => assert.ok(fa <= roc[i][0] && h <= roc[i][1], `${dist} ${sdratio}: point ${i + 1}`));
      const pt = [0.3, 1].map(c => [Math.exp(ynLogPOld({ ...pars, criterion: c }, 0)), Math.exp(ynLogPOld({ ...pars, criterion: c }, 1))]);
      // linear interpolation between the bracketing ROC points, hit rate at the point's false-alarm rate
      for (const [fa, h] of pt) {
        const j = roc.findIndex(([f]) => f <= fa);
        const [f0, h0] = roc[j - 1], [f1, h1] = roc[j];
        const hi = h1 + (h0 - h1) * (fa - f1) / (f0 - f1 || 1);
        assert.ok(Math.abs(hi - h) < 2e-3, `${dist} ${sdratio}: ROC at FA ${fa} gives ${hi}, model ${h}`);
      }
    }
  });
}
