'use strict';
const { byggDemo } = require('./_veg3d_felles.js');
const felt = ['skjaering', 'fylling'];

function endeareal(noder, vf) {           // noder: {s, A:{...}}
  const sum = {}; felt.forEach(f => sum[f] = 0);
  for (let i = 0; i < noder.length - 1; i++) {
    const L = noder[i + 1].s - noder[i].s;
    felt.forEach(f => { sum[f] += (noder[i].A[f] + noder[i + 1].A[f]) / 2 * L * vf; });
  }
  return sum;
}
const somNode = p => ({ s: p.s, A: p.vektet });

/* A) SAMPLING: behold hver k-te profil, kast resten (det påstanden måler) */
function sample(pr, k) {
  const ut = [];
  for (let i = 0; i < pr.length; i += k) ut.push(somNode(pr[i]));
  const sist = somNode(pr[pr.length - 1]);
  if (ut[ut.length - 1].s !== sist.s) ut.push(sist);
  return ut;
}

/* B) MIDLING: slå k profiler sammen til én node, høyden = middelet.
   Nøyaktig det tomta gjør når den slår celler sammen (ui-tomt3d.js:129-140). */
function midle(pr, k) {
  const ut = [];
  for (let i = 0; i < pr.length; i += k) {
    const blokk = pr.slice(i, Math.min(i + k, pr.length));
    const A = {}; felt.forEach(f => A[f] = blokk.reduce((a, p) => a + p.vektet[f], 0) / blokk.length);
    ut.push({ s: blokk.reduce((a, p) => a + p.s, 0) / blokk.length, A });
  }
  /* Endene: en midlet blokk ligger i blokkens tyngdepunkt, ikke i enden.
     Første og siste stasjon må stå igjen, ellers mangler halve endeblokken. */
  if (ut[0].s > pr[0].s) ut.unshift(somNode(pr[0]));
  const sist = pr[pr.length - 1];
  if (ut[ut.length - 1].s < sist.s) ut.push(somNode(sist));
  return ut;
}

(async () => {
  const d = await byggDemo();
  const r = d.res, vf = d.bf * d.bf;
  const f0 = endeareal(r.profiler.map(somNode), vf);
  console.log('fasit  skjæring', f0.skjaering.toFixed(1), ' fylling', f0.fylling.toFixed(1), '\n');
  console.log('              --- SAMPLING (påstandens) ---   --- MIDLING (tomtas måte) ---');
  console.log('steg   m   n     skjær %     fyll %      n     skjær %     fyll %');
  for (const k of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20]) {
    const a = endeareal(sample(r.profiler, k), vf);
    const bn = midle(r.profiler, k), b = endeareal(bn, vf);
    const pc = (v, f) => (100 * (v[f] / f0[f] - 1)).toFixed(2).padStart(9);
    console.log(String(k).padStart(3), String(k * 5).padStart(4),
      String(sample(r.profiler, k).length).padStart(4), pc(a, 'skjaering'), pc(a, 'fylling'),
      '  ', String(bn.length).padStart(4), pc(b, 'skjaering'), pc(b, 'fylling'));
  }
})();
