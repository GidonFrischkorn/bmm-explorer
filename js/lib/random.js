// Seeded random numbers: the same seed gives the same numbers on every machine, so a drawing or a sample stays
// put while a slider moves, and a test can name the values it expects.

// mulberry32: a uniform generator on [0, 1) from a 32-bit seed.
export function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A standard normal from two uniforms of unif (Box-Muller, the cosine half).
export const boxMuller = unif => Math.sqrt(-2 * Math.log(1 - unif())) * Math.cos(2 * Math.PI * unif());

export const uniforms = (n, seed) => Array.from({ length: n }, mulberry32(seed));

// The seed of the sample a page shows first: at every sample size the pages offer, its first n uniforms and both
// halves splitTrials() takes of them have a Kolmogorov-Smirnov sqrt(n) D below 0.83, about the median of its null
// distribution, so the first view is a typical draw, not one that leans the same way on every page.
export const SIM_SEED = 296;
