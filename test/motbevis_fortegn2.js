'use strict';
/* Del 2: hvor følsom er den foreslatte proven, og hva skjer i skraningsfoten? */
const { byggDemo } = require('./_veg3d_felles.js');

const interp = (liste, t) => {
  if (!liste || !liste.length) return NaN;
  if (t <= liste[0][0]) return liste[0][1];
  if (t >= liste[liste.length - 1][0]) return liste[liste.length - 1][1];
  for (let i = 0; i < liste.length - 1; i++) {
    if (t >= liste[i][0] && t <= liste[i + 1][0]) {
      const dt = liste[i + 1][0] - liste[i][0];
      if (dt < 1e-12) return liste[i][1];
      return liste[i][1] + (t - liste[i][0]) / dt * (liste[i + 1][1] - liste[i][1]);
    }
  }
  return liste[liste.length - 1][1];
};

(async () => {
  for (const rd of [0.2, 0.5, 1.0]) {
    const d = await byggDemo({ mal: { renskDybde: rd } });
    const r = d.res;
    let dMaks = -Infinity, dMin = Infinity;
    let fotAvvikRaa = 0, fotAvvikRensk = 0, nFot = 0;
    for (const p of r.profiler) {
      const g = p.geometri; if (!g) continue;
      for (const [t, zJ] of g.jord) {
        const zR = interp(g.rensk, t);
        if (!isFinite(zR) || !isFinite(zJ)) continue;
        const dd = zR - zJ;
        if (dd > dMaks) dMaks = dd;
        if (dd < dMin) dMin = dd;
      }
      // skraningsfoten: der jordflaten slutter
      for (const t of [p.fotVenstre, p.fotHoyre]) {
        const zJ = interp(g.jord, t), zRaa = interp(g.terreng, t), zR = interp(g.rensk, t);
        if (!isFinite(zJ) || !isFinite(zRaa)) continue;
        nFot++;
        fotAvvikRaa = Math.max(fotAvvikRaa, Math.abs(zRaa - zJ));
        fotAvvikRensk = Math.max(fotAvvikRensk, Math.abs(zR - zJ));
      }
    }
    // proven ved ytterpunktene, med begge flatevalg
    const snurVedMaks = (dMaks >= 0) !== (dMaks + rd >= 0);
    const snurVedMin = (dMin >= 0) !== (dMin + rd >= 0);
    console.log(`renskDybde = ${rd.toFixed(2)} m`);
    console.log(`   dypeste skjaering d = ${dMaks.toFixed(3)}  hoyeste fylling d = ${dMin.toFixed(3)}`);
    console.log(`   snur fortegn ved d_maks? ${snurVedMaks}   ved d_min? ${snurVedMin}`);
    console.log(`   -> den foreslatte proven ville ${(snurVedMaks || snurVedMin) ? 'OPPDAGE' : 'IKKE oppdage'} bytte av flate`);
    console.log(`   i skraningsfoten (${nFot} punkt): |raterreng - jord| maks ${fotAvvikRaa.toFixed(3)} m,`
      + ` |rensk - jord| maks ${fotAvvikRensk.toFixed(3)} m`);
    console.log(`   sum skjaering ${r.sum.skjaering.toFixed(0)} m3, fylling ${r.sum.fylling.toFixed(0)} m3`);
    console.log('');
  }
})();
