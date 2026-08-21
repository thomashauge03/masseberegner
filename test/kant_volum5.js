'use strict';
/* Reproduksjon av funnet: "Massebalansen søker på et annet rutenett enn
   rapporten regner på" (app.js linje 395 mot 1287). */
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');
const Tomt = require('C:/Users/thoma/massekalk/public/js/tomt.js');
const mal = o => Object.assign({}, Tomt.StandardTomtemal, o || {});
const rekt = (x0, y0, b, h) => [{x:x0,y:y0},{x:x0+b,y:y0},{x:x0+b,y:y0+h},{x:x0,y:y0+h}];

const F = { fjellIFylling: 0.9, brukbarLosmasse: 0.7, losmasseIFylling: 0.95, sprengningsfaktor: 1.5 };
function tomtebalanse(s, f) {
  f = f || F;
  const fraFjell = s.skjaeringFjell * f.fjellIFylling;
  const brukbarLos = s.skjaeringLosmasse * f.brukbarLosmasse * f.losmasseIFylling;
  const tilgjengelig = fraFjell + brukbarLos;
  return { tilgjengelig, balanse: tilgjengelig - s.fylling };
}

const kjor = (o, kote, rute) => TM.beregnTomtemasser({
  tomt: { punkter: o.punkter, kanter: o.kanter, nivaa: { modus: 'flat', kote } },
  mal: o.mal, terreng: { z: o.z }, fjell: { dybde: o.dybde },
  rutestorrelse: rute, bakkefaktor: 1 });

/* Nøyaktig samme halvering som balanserTomt (app.js 408-426), men med
   rutestørrelsen som parameter, slik at vi kan kjøre den både med
   Math.max(1, r) slik koden gjør, og med brukerens r. */
function balanserKote(o, start, sokeRute) {
  const maal = k => tomtebalanse(kjor(o, k, sokeRute).sum).balanse;
  let lav = start - 30, hoy = start + 30;
  const bLav = maal(lav), bHoy = maal(hoy);
  if (!(bLav > 0 && bHoy < 0)) return { kote: null, bLav, bHoy };
  for (let i = 0; i < 24; i++) {
    const midt = (lav + hoy) / 2;
    if (maal(midt) > 0) lav = midt; else hoy = midt;
  }
  return { kote: +((lav + hoy) / 2).toFixed(2), bLav, bHoy };
}

function scenario(navn, o, start) {
  console.log('\n=== ' + navn + ' ===');
  for (const brukerRute of [1, 0.5, 0.25]) {
    const sokeRute = Math.max(1, brukerRute);          // slik app.js gjør det
    const a = balanserKote(o, start, sokeRute);        // koden i dag
    const b = balanserKote(o, start, brukerRute);      // konsistent søk
    if (a.kote == null) { console.log(`  rute ${brukerRute}: ingen balanse i søkeområdet`); continue; }
    // Rapporten regner alltid på brukerens rute:
    const rapportA = tomtebalanse(kjor(o, a.kote, brukerRute).sum);
    const rapportB = tomtebalanse(kjor(o, b.kote, brukerRute).sum);
    const s = kjor(o, a.kote, brukerRute).sum;
    console.log(`  brukerrute ${brukerRute} m  (søk kjøres på ${sokeRute} m)`);
    console.log(`     kote fra koden i dag : ${a.kote.toFixed(2)}   restavvik i rapporten: ${rapportA.balanse.toFixed(1)} m3`);
    console.log(`     kote med samme rute  : ${b.kote.toFixed(2)}   restavvik i rapporten: ${rapportB.balanse.toFixed(1)} m3`);
    console.log(`     kotefeil ${(a.kote - b.kote).toFixed(3)} m,  rapporten viser fylling ${s.fylling.toFixed(0)} m3 / tilgjengelig ${rapportA.tilgjengelig.toFixed(0)} m3`);
    console.log(`     restavvik som andel av fyllingsbehovet: ${(Math.abs(rapportA.balanse)/Math.max(1,s.fylling)*100).toFixed(2)} %`);
    console.log(`     STATUSLINJA ville sagt: "Kote ${a.kote.toFixed(2)} gir balanse – ${Math.abs(rapportA.balanse).toFixed(0)} m3 i avvik"`);
  }
}

/* --- Funnets eget oppsett: 30x30 m, fjell i dagen, sprengt vegg alle kanter --- */
const mNull = mal({ matjordDybde:0, renskDybde:0, forsterkningslag:0, baerelagTykkelse:0,
  slitelagTykkelse:0, frostsikring:0, avrettingslag:0, overberg:0 });
const veggKanter = [0,1,2,3].map(() => ({ type: 'fjellvegg' }));

console.log('=== A. Funnets bevis: fast kote 96, 30x30 m, fjell i dagen, 4 m sprengt vegg ===');
for (const rute of [1, 0.5, 0.25, 0.1]) {
  const r = kjor({ punkter: rekt(0,0,30,30), kanter: veggKanter, mal: mNull, z: () => 100, dybde: () => 0 }, 96, rute);
  const b = tomtebalanse(r.sum);
  console.log(`  rute ${rute}: fjell ${r.sum.skjaeringFjell.toFixed(1)}  los ${r.sum.skjaeringLosmasse.toFixed(1)}  fyll ${r.sum.fylling.toFixed(1)}  balanse ${b.balanse.toFixed(1)}`);
}

/* --- Kan det i det hele tatt finnes en balansekote i dette oppsettet? --- */
scenario('B. Funnets oppsett kjørt gjennom hele balansesøket', {
  punkter: rekt(0,0,30,30), kanter: veggKanter, mal: mNull, z: () => 100, dybde: () => 0 }, 96);

/* --- Realistisk tomt: skrånende terreng, løsmasse over fjell, standardmal --- */
scenario('C. Realistisk: 50x70 m, terreng faller 1:12, 4 m til fjell, standardmal', {
  punkter: rekt(0,0,50,70), kanter: [], mal: mal(),
  z: (x, y) => 100 + (x + y) / 12, dybde: () => 4 }, 102);

/* --- Bratt fjellkant, der funnet sier utslaget er størst --- */
scenario('D. Bratt fjellrygg: 40x40 m, fjelloverflaten stiger 1:3, sprengt vegg', {
  punkter: rekt(0,0,40,40), kanter: veggKanter, mal: mal(),
  z: (x, y) => 100 + x / 3, dybde: () => 0.5 }, 104);
