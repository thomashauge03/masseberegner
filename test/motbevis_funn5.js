'use strict';
/* Uavhengig etterprøving av FUNN 5. node test/motbevis_funn5.js */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const OX = 442183.27, OY = 6461902.61;
const gm = o => Object.assign({}, Tomt.StandardTomtemal, {
  matjordDybde: 0, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0,
  forsterkningslag: 0, frostsikring: 0, avrettingslag: 0, overberg: 0,
  maksSokebredde: 60, maksSkjaeringsdybde: 0, maksFyllingshoyde: 0,
  maksVeggHoyde: 0, minAvstandTilBerg: 0
}, o || {});
const kjor = (p, kote, rute, mal) => T.beregnTomtemasser({
  tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote } },
  mal: mal || gm(), terreng: { z: () => 100 },
  fjell: new M.Fjellmodell({ standarddybde: 100 }),
  rutestorrelse: rute, bakkefaktor: 1
});
const mal = gm({ forsterkningslag: 0.40, baerelagTykkelse: 0.10, slitelagTykkelse: 0.05 });
const OB = 0.55;
const kvadrat = (x0, y0, s) => [{ x: OX + x0, y: OY + y0 }, { x: OX + x0 + s, y: OY + y0 },
  { x: OX + x0 + s, y: OY + y0 + s }, { x: OX + x0, y: OY + y0 + s }];

console.log('== A. Reproduksjon av FUNN 5, med skjæringen med ==');
{
  const p = kvadrat(3.2, 3.2, 2);
  for (const rute of [5, 1]) {
    const r = kjor(p, 98, rute, mal);
    const lag = r.sum.slitelag + r.sum.baerelag + r.sum.forsterkningslag;
    console.log(`  2x2 m, rute ${rute} m: talt areal ${r.areal.toFixed(2)} m2, `
      + `overbygning ${lag.toFixed(2)} m3, skjaering ${r.sum.skjaering.toFixed(1)} m3, `
      + `celler ${r.celler}, merknader fra motoren ${r.merknader.length}`);
  }
  // app-nivaa: sjekkTomt kjores i tillegg av app.js (tomtetall -> merknader)
  const sj = Tomt.sjekkTomt({ punkter: p, kanter: [] }, p);
  console.log(`  eksakt polygonareal ${Tomt.areal(p).toFixed(2)} m2, `
    + `sjekkTomt gir ${sj.length} merknad(er): ${sj.map(m => m.tekst).join(' | ') || '(ingen)'}`);
}

console.log('\n== B. Er nullen fase-avhengig? Samme 2x2 m tomt flyttet ==');
{
  for (const d of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]) {
    const r = kjor(kvadrat(3.2 + d, 3.2, 2), 98, 5, mal);
    console.log(`  forskyvning ${d.toFixed(1)} m -> talt areal ${r.areal.toFixed(1)} m2 `
      + `(eksakt 4,0), overbygning ${(r.sum.slitelag + r.sum.baerelag + r.sum.forsterkningslag).toFixed(2)} m3`);
  }
}

console.log('\n== C. Motsatt vei: kvadrater ved 5 m rutenett ==');
{
  for (const s of [4, 6, 8]) {
    const p = kvadrat(3.2, 3.2, s);
    const r = kjor(p, 98, 5, mal);
    const sant = Tomt.areal(p);
    const av = 100 * (r.areal - sant) / sant;
    const sj = Tomt.sjekkTomt({ punkter: p, kanter: [] }, p);
    console.log(`  ${s}x${s} m (sant ${sant.toFixed(0)} m2): talt ${r.areal.toFixed(1)} m2 `
      + `avvik ${av >= 0 ? '+' : ''}${av.toFixed(0)} %, motor-merknader ${r.merknader.length}, `
      + `sjekkTomt-merknader ${sj.length}`);
  }
}

console.log('\n== D. Samme kvadrater med STANDARD rutenett 1,0 m ==');
{
  for (const s of [2, 4, 6, 8, 16]) {
    const p = kvadrat(3.2, 3.2, s);
    const r = kjor(p, 98, 1, mal);
    const sant = Tomt.areal(p);
    console.log(`  ${s}x${s} m: talt ${r.areal.toFixed(1)} m2 av ${sant.toFixed(0)} m2 `
      + `(${(100 * (r.areal - sant) / sant).toFixed(1)} %)`);
  }
}

console.log('\n== E. Hva viser rapporten? Areal er polygonarealet, lagene er talte ==');
{
  const p = kvadrat(3.2, 3.2, 4);
  const r = kjor(p, 98, 5, mal);
  const lag = r.sum.slitelag + r.sum.baerelag + r.sum.forsterkningslag;
  console.log(`  4x4 m, rute 5 m: rapporten viser Areal ${Tomt.areal(p).toFixed(0)} m2, `
    + `men overbygningen er ${lag.toFixed(2)} m3 = ${(lag / OB).toFixed(1)} m2`);
  const p2 = kvadrat(3.2, 3.2, 2);
  const r2 = kjor(p2, 98, 5, mal);
  const lag2 = r2.sum.slitelag + r2.sum.baerelag + r2.sum.forsterkningslag;
  console.log(`  2x2 m, rute 5 m: rapporten viser Areal ${Tomt.areal(p2).toFixed(0)} m2, `
    + `men overbygningen er ${lag2.toFixed(2)} m3, skjaering ${r2.sum.skjaering.toFixed(1)} m3`);
}
