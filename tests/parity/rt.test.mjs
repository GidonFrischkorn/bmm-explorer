import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, assertClose } from "./helpers.mjs";
import { LOG_SINHC_COEF, ezdmMoments3par, ezdmMoments4par, dezdm, dcswald, dddm } from "../../js/models/rt.js";

const fx = loadFixture("rt");
const cells = fn => {
  const out = fx.cells.filter(c => c.fn === fn);
  // A density without cells would pass without testing anything.
  if (!out.length) throw new Error(`rt.json: no ${fn} cells`);
  return out;
};

test(`the series coefficients are bmm ${fx.bmm_version}'s`, () => {
  assert.deepEqual(LOG_SINHC_COEF, cells("ezdm_log_sinhc_coef")[0].values);
});

// The forward EZ map (P(upper), mean and variance of the decision time): absolute 1e-10 on the natural scale.
for (const [fn, moments] of [["ezdm_moments_3par", ezdmMoments3par], ["ezdm_moments_4par", ezdmMoments4par]]) {
  for (const cell of cells(fn)) {
    test(`${fn}(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
      for (const [k, ref] of Object.entries(cell.moments))
        assertClose(cell.args.drift.map(drift => moments({ ...cell.args, drift })[k]), ref, 1e-10, `${fn} ${k}`);
    });
  }
}

// dezdm(): 1e-10 on the log scale. 3par cells hold vectors of summary statistics, 4par cells one row.
for (const cell of cells("dezdm")) {
  test(`dezdm(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
    const a = cell.args;
    const got = a.version === "3par"
      ? a.mean_rt.map((m, i) => dezdm({ ...a, mean_rt: m, var_rt: a.var_rt[i], n_upper: a.n_upper[i], n_trials: a.n_trials[i] }))
      : [dezdm(a)];
    assertClose(got, [].concat(cell.logd), 1e-10, "dezdm");
  });
}

// dcswald(): 1e-10 on the log scale, both versions and responses.
for (const cell of cells("dcswald")) {
  test(`dcswald(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
    assertClose(dcswald(cell.x, cell.args), cell.logd, 1e-10, "dcswald");
  });
}

// dddm(): 1e-10 on the log scale. The port repeats rtdists' series truncation, so the tails match too.
for (const cell of cells("dddm")) {
  test(`dddm(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
    assertClose(dddm(cell.x, cell.args), cell.logd, 1e-10, "dddm");
  });
}

// Before ndt nothing has happened: no density, and a censored simple-cswald response has probability 1.
test("rt at or before ndt", () => {
  const p = { drift: 1, bound: 1, ndt: 0.3 };
  assert.equal(dddm(0.3, { ...p, response: 1 }), -Infinity);
  assert.equal(dcswald(0.2, { ...p, response: 1 }), -Infinity);
  assert.equal(dcswald(0.2, { ...p, response: 0 }), 0);
  assert.equal(dcswald(0.2, { ...p, response: 0, version: "crisk" }), -Infinity);
});
