'use strict';
const { byggDemo } = require('./_veg3d_felles.js');

/* Samme endearealsformel som masser.js:967-976 */
function volumAv(profiler, vf, felt) {
  const sum = {}; felt.forEach(f => sum[f] = 0);
  for (let i = 0; i < profiler.length - 1; i++) {
    const a = profiler[i], b = profiler[i + 1];
    const L = b.s - a.s;
    felt.forEach(f => { sum[f] += (a.vektet[f] + b.vektet[f]) / 2 * L * vf; });
  }
  return sum;
}
function velg(profiler, k) {
  const ut = [];
  for (let i = 0; i < profiler.length; i += k) ut.push(profiler[i]);
  if (ut[ut.length - 1] !== profiler[profiler.length - 1]) ut.push(profiler[profiler.length - 1]);
  return ut;
}

(async () => {
  const d = await byggDemo();
  const r = d.res, vf = d.bf * d.bf;
  const felt = ['skjaering', 'fylling', 'rensk', 'baerelag'];
  const full = volumAv(r.profiler, vf, felt);
  console.log('kontroll mot res.sum:');
  felt.forEach(f => console.log('  ', f, full[f].toFixed(4), 'vs', r.sum[f].toFixed(4),
    'avvik', (100 * (full[f] / r.sum[f] - 1)).toFixed(6) + ' %'));

  console.log('\nDESIMERING (hopp over k-1 av k stasjoner), dS = 5 m');
  console.log('steg  m    n   skjæring        %      fylling         %');
  for (const k of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
    const p = velg(r.profiler, k);
    const v = volumAv(p, vf, felt);
    console.log(
      String(k).padStart(3), String(k * 5).padStart(4), String(p.length).padStart(4),
      v.skjaering.toFixed(1).padStart(10), (100 * (v.skjaering / r.sum.skjaering - 1)).toFixed(1).padStart(8),
      v.fylling.toFixed(1).padStart(11), (100 * (v.fylling / r.sum.fylling - 1)).toFixed(1).padStart(8));
  }
})();
