'use strict';
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');
const Tomt = require('C:/Users/thoma/massekalk/public/js/tomt.js');
const PI = Math.PI;

function mal(o) {
  return Object.assign({}, Tomt.StandardTomtemal, o || {});
}
function kjor(o) {
  return TM.beregnTomtemasser({
    tomt: o.tomt, mal: o.mal, terreng: { z: o.z }, fjell: { dybde: o.dybde || (() => 1000) },
    rutestorrelse: o.rute || 1, bakkefaktor: o.bf || 1
  });
}
const rekt = (x0,y0,b,h) => [{x:x0,y:y0},{x:x0+b,y:y0},{x:x0+b,y:y0+h},{x:x0,y:y0+h}];

console.log('=== J. Dobbelttelling: matjord + rensk oppa skjaeringen ===');
{
  const m = mal({ matjordDybde: 0.25, renskDybde: 0.20, frostsikring: 0, forsterkningslag: 0,
    baerelagTykkelse: 0, slitelagTykkelse: 0, avrettingslag: 0 });
  const r = kjor({ tomt: { punkter: rekt(0,0,20,20), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal: m, z: () => 100, dybde: () => 1000 });
  const s = r.sum;
  console.log(`   arealMedSkraning ${r.arealMedSkraning.toFixed(0)} m2`);
  console.log(`   skjaering (geometrisk volum terreng->planum) ${s.skjaering.toFixed(1)} m3`);
  console.log(`   matjord ${s.matjord.toFixed(1)} m3   rensk ${s.rensk.toFixed(1)} m3`);
  console.log(`   sum bokfoert masse ${(s.skjaering + s.matjord + s.rensk).toFixed(1)} m3`);
  console.log(`   FASIT gravd masse = ${s.skjaering.toFixed(1)} m3 (matjord og rensk ligger INNI den)`);
  console.log(`   overtelling ${((s.matjord + s.rensk) / s.skjaering * 100).toFixed(1)} %`);
  // sammenlign med vegen sin regel: der males skjaering fra terreng MINUS rensk
  console.log(`   (masser.js: terr(t) = terrRaa(t) - renskDybde, sa rensk og skjaering er adskilt)`);
}

console.log('\n=== K. Rensk der berget aldri rores ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0.20, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  for (const bergdybde of [0.5, 2, 5, 20]) {
    const r = kjor({ tomt: { punkter: rekt(0,0,20,20), kanter: [], nivaa: { modus: 'flat', kote: 99 } },
      mal: m, z: () => 100, dybde: () => bergdybde });
    console.log(`   berg ${bergdybde} m ned, skjaering 1 m: fjelluttak ${r.sum.skjaeringFjell.toFixed(1)} m3, rensk ${r.sum.rensk.toFixed(1)} m3`);
  }
  console.log('   FASIT: rensk mot berg skal vaere 0 nar fjelluttaket er 0');
}

console.log('\n=== L. Skraningen naar ikke terrenget innen maksSokebredde ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0, maksSokebredde: 45, skjaeringLosmasse: 2.5 });
  for (const dyp of [4, 10, 18, 25]) {
    const r = kjor({ tomt: { punkter: rekt(0,0,40,40), kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
      mal: m, z: () => 100 });
    const W = dyp * 2.5;
    const fasit = 1600 * dyp + dyp * 160 * W / 2 + PI * dyp * W * W / 3;
    const av = (r.sum.skjaering - fasit) / fasit * 100;
    console.log(`   dyp ${dyp} m (utslag ${W} m): program ${r.sum.skjaering.toFixed(0)}  fasit ${fasit.toFixed(0)}  avvik ${av.toFixed(2)} %  merknader: ${r.merknader.map(x=>x.type).join(',') || '(ingen)'}`);
  }
  console.log('   FASIT: over 45 m utslag kuttes skraningen - er det sagt fra om?');
}

console.log('\n=== M. Ingen terrengdata utenfor tomta ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  const r = kjor({ tomt: { punkter: rekt(0,0,40,40), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal: m, z: (x,y) => (x >= -0.001 && x <= 40 && y >= -0.001 && y <= 40) ? 100 : NaN });
  console.log(`   skjaering ${r.sum.skjaering.toFixed(0)} (bare tomta = 3200)  merknader: ${JSON.stringify(r.merknader.map(x=>x.tekst))}`);
}

console.log('\n=== N. Fylling: hoyeste fylling og maksSokebredde ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0, fylling: 2.0, maksSokebredde: 45 });
  for (const h of [4, 12, 25]) {
    const r = kjor({ tomt: { punkter: rekt(0,0,40,40), kanter: [], nivaa: { modus: 'flat', kote: 100 + h } },
      mal: m, z: () => 100 });
    const W = h * 2;
    const fasit = 1600 * h + h * 160 * W / 2 + PI * h * W * W / 3;
    console.log(`   h ${h}: program ${r.sum.fylling.toFixed(0)}  fasit ${fasit.toFixed(0)}  avvik ${((r.sum.fylling-fasit)/fasit*100).toFixed(2)} %`);
  }
}

console.log('\n=== O. Halvt skjaering / halvt fylling med skraninger, hele volumet ===');
{
  /* Terreng: plan z = 100 + 0.1*(x-20) over 40x40 (x 0..40). Niva 100.
     Skjaering paa hoyre halvdel, fylling paa venstre.
     Inne: 2 * (40 * 0.1*20*20/2) = 2*400 = 800 hver vei.
     Utenfor er det vanskelig for haand - vi maaler bare at det ikke er sprang. */
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  const r = kjor({ tomt: { punkter: rekt(0,0,40,40), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal: m, z: (x) => 100 + 0.1 * (x - 20) });
  let innS = 0, innF = 0;
  for (const c of r.rutenett) if (c.inne) { if (c.d>0) innS += c.d; else innF += -c.d; }
  console.log(`   inne: skjaering ${innS.toFixed(1)} (fasit 800)  fylling ${innF.toFixed(1)} (fasit 800)`);
  console.log(`   totalt: skjaering ${r.sum.skjaering.toFixed(1)}  fylling ${r.sum.fylling.toFixed(1)}`);
}

console.log('\n=== P. Fjelluttak med standardmal og 1 m rutenett (fjell i dagen) ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  // fjell 1 m under terreng, 6 m skjaering -> 5 m fjell. skjaeringFjell-helning 0.2 -> 1 m ut
  for (const rute of [1, 0.25]) {
    const r = kjor({ tomt: { punkter: rekt(0,0,30,30), kanter: [], nivaa: { modus: 'flat', kote: 94 } },
      mal: m, z: () => 100, dybde: () => 1, rute });
    console.log(`   rute ${rute}: skjaeringFjell ${r.sum.skjaeringFjell.toFixed(1)}  skjaeringLos ${r.sum.skjaeringLosmasse.toFixed(1)}  total ${r.sum.skjaering.toFixed(1)}`);
  }
}
