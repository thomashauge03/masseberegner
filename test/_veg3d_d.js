'use strict';
const { byggDemo } = require('./_veg3d_felles.js');
const { byggGitter, volumAvGitter } = require('./_veg3d_gitter.js');

(async () => {
  const d = await byggDemo();
  const r = d.res, vf = d.bf * d.bf, linje = d.linje;
  console.log('fasit res.sum: skjæring', r.sum.skjaering.toFixed(2), ' fylling', r.sum.fylling.toFixed(2));
  console.log('\nALLE 87 STASJONER — tverroppløsningen varieres');
  console.log('  nt   noder    skjæring       %      fylling        %     tid ms');
  for (const nt of [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256]) {
    const t0 = process.hrtime.bigint();
    const g = byggGitter({ profiler: r.profiler, linje, nt });
    const v = volumAvGitter(g, vf);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(String(nt).padStart(4), String(g.nb * g.nh).padStart(8),
      v.sum.skjaering.toFixed(1).padStart(11), (100 * (v.sum.skjaering / r.sum.skjaering - 1)).toFixed(2).padStart(8),
      v.sum.fylling.toFixed(1).padStart(11), (100 * (v.sum.fylling / r.sum.fylling - 1)).toFixed(2).padStart(8),
      ms.toFixed(1).padStart(9));
  }
})();
