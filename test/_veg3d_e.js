'use strict';
const { byggDemo } = require('./_veg3d_felles.js');
const { byggGitter, volumAvGitter } = require('./_veg3d_gitter.js');

/* Slår k stasjonsrader sammen til én ved å MIDLE nodene, akkurat som
   Tomt3d._gitter midler celler (ui-tomt3d.js:129-140, 161-168). */
function midleLangs(g, k) {
  if (k <= 1) return g;
  const nb = g.nb, blokker = Math.ceil(g.nh / k);
  const n = nb * blokker;
  const ut = {
    nb, nh: blokker, wx: new Float32Array(n), wy: new Float32Array(n),
    zT: new Float32Array(n), zP: new Float32Array(n), zF: new Float32Array(n),
    zRaa: new Float32Array(n), d: new Float32Array(n), tOff: new Float32Array(n),
    finnes: new Uint8Array(n), lav: g.lav, hoy: g.hoy, maksAvvik: g.maksAvvik, profiler: []
  };
  for (let J = 0; J < blokker; J++) {
    const j0 = J * k, j1 = Math.min(j0 + k, g.nh);
    let sS = 0, sKr = 0, m = 0;
    for (let j = j0; j < j1; j++) { sS += g.profiler[j].s; sKr += g.profiler[j].krumning; m++; }
    ut.profiler.push({ s: sS / m, krumning: sKr / m });
    for (let i = 0; i < nb; i++) {
      let aT = 0, aP = 0, aTo = 0, aX = 0, aY = 0, c = 0;
      for (let j = j0; j < j1; j++) {
        const kk = j * nb + i;
        if (!g.finnes[kk]) continue;
        aT += g.zT[kk]; aP += g.zP[kk]; aTo += g.tOff[kk]; aX += g.wx[kk]; aY += g.wy[kk]; c++;
      }
      const K = J * nb + i;
      if (!c) continue;
      ut.finnes[K] = 1;
      ut.zT[K] = aT / c; ut.zP[K] = aP / c; ut.tOff[K] = aTo / c;
      ut.wx[K] = aX / c; ut.wy[K] = aY / c; ut.d[K] = ut.zT[K] - ut.zP[K];
    }
  }
  return ut;
}

(async () => {
  const d = await byggDemo();
  const r = d.res, vf = d.bf * d.bf, linje = d.linje;
  const g = byggGitter({ profiler: r.profiler, linje, nt: 64 });
  console.log('nt = 64, alle 87 stasjoner:');
  const v0 = volumAvGitter(g, vf);
  console.log('  skjæring', (100*(v0.sum.skjaering/r.sum.skjaering-1)).toFixed(2)+' %',
              ' fylling', (100*(v0.sum.fylling/r.sum.fylling-1)).toFixed(2)+' %');

  console.log('\nMIDLING AV STASJONSRADER I GITTERET (nt = 64)');
  console.log('  k    m    nh    skjæring %    fylling %');
  for (const k of [1,2,3,4,5,6,8,10,12,16,20]) {
    const gm = midleLangs(g, k);
    const v = volumAvGitter(gm, vf);
    console.log(String(k).padStart(3), String(k*5).padStart(4), String(gm.nh).padStart(5),
      (100*(v.sum.skjaering/r.sum.skjaering-1)).toFixed(2).padStart(11),
      (100*(v.sum.fylling/r.sum.fylling-1)).toFixed(2).padStart(12));
  }
})();
