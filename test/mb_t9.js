'use strict';
/* Uavhengig etterprøving av funnet om referansepunkt i snittet (yttergrense + fall).
   Bygger snitt()-logikken pa nytt fra kilden, men med begge referansepunkt,
   og sammenligner mot beregnTomtemasser sin egen celleregning. */

const T = require('../public/js/tomtmasser.js');
const Tomt = require('../public/js/tomt.js');

/* ---- syntetisk terreng og fjell ---- */
function lagTerreng(f) { return { z: (x, y) => f(x, y) }; }
function lagFjell(f) { return { dybde: (x, y) => f(x, y) }; }

const mal = {
  slitelagTykkelse: 0.04, baerelagTykkelse: 0.08, forsterkningslag: 0.4,
  frostsikring: 0, avrettingslag: 0,
  skjaeringLosmasse: 1.5, skjaeringFjell: 0.15, fylling: 1.5,
  veggHelning: 0.1, losmasseOverFjell: 1.5,
  maksSokebredde: 45, rutestorrelse: 1, matjordDybde: 0.2, renskDybde: 0.1
};

/* ---- oppsettet fra funnet: 60x80 m omriss, fjellvegg pa tre kanter ---- */
const punkter = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }];
const kanter = [
  { type: 'fjellvegg' },   // sør
  { type: 'skraning' },    // øst
  { type: 'fjellvegg' },   // nord
  { type: 'fjellvegg' }    // vest
];
const helning = 0.25;
const terreng = lagTerreng((x, y) => 100 + y * helning);
const fjell = lagFjell(() => 1.0);
const nivaa = { modus: 'fall', kote: 112, fall: 0.08, fallretning: 0 };

const grunn = { tomt: { punkter, kanter, nivaa }, mal, terreng, fjell };
const inn = T.innerflate(grunn);
if (!inn.punkter) { console.log('innerflaten forsvant'); process.exit(0); }
const flate = inn.punkter;

const tpYtre = T.tyngdepunktAv(punkter);      // ui-tomtprofil.js:41
const tpIndre = T.tyngdepunktAv(flate);       // tomtmasser.js:169

console.log('ytre omriss   :', punkter.map(q => `(${q.x.toFixed(1)},${q.y.toFixed(1)})`).join(' '));
console.log('innerflate    :', flate.map(q => `(${q.x.toFixed(1)},${q.y.toFixed(1)})`).join(' '));
console.log(`tyngdepunkt ytre : ${tpYtre.x.toFixed(2)} ${tpYtre.y.toFixed(2)}`);
console.log(`tyngdepunkt indre: ${tpIndre.x.toFixed(2)} ${tpIndre.y.toFixed(2)}`);

/* ---- 1) FASIT: hva regner beregnTomtemasser mot, egentlig? ----
   Ikke ta nivaaVed pa ordet. Vi maler planum indirekte: sett en tomt der
   terrenget er en kjent konstant, og les av skjæringen. Enklere og sikrere:
   kall beregnTomtemasser to ganger, med kote k og kote k+1, og se at volumet
   endrer seg med areal*1 - det bekrefter at planum flyttes stivt. Deretter
   finner vi det faktiske planumnivaet ved a lete etter koten som gir null
   skjæring i et punkt. Vi gjør det direkte og enkelt: la terrenget vaere flatt
   og se hvilken kote som gir nøyaktig null masse i en gitt celle. */

function volum(kote, terr) {
  const n = Object.assign({}, nivaa, { kote });
  return T.beregnTomtemasser({
    tomt: { punkter: flate, kanter, nivaa: n }, mal,
    faktorer: {}, terreng: terr, fjell, rutestorrelse: 1, bakkefaktor: 1
  });
}

/* Maling av det faktiske planumet inne i tomta, uten a bruke nivaaVed:
   terrenget settes til en skra plan flate lik det ferdige nivaet minus ob
   for EN antatt referanse. Er antakelsen riktig, blir bade skjæring og
   fylling inne i tomta null. */
const ob = mal.slitelagTykkelse + mal.baerelagTykkelse + mal.forsterkningslag
  + mal.frostsikring + mal.avrettingslag;

function planumMedRef(ref) {
  return (x, y) => nivaa.kote - ((x - ref.x) * Math.sin(0) + (y - ref.y) * Math.cos(0)) * nivaa.fall - ob;
}

for (const [navn, ref] of [['ytre (snittets)', tpYtre], ['indre (volumets)', tpIndre]]) {
  const pl = planumMedRef(ref);
  /* alle kanter apne -> ingenting utenfor tomta teller med, sa bare flaten males */
  const kunFlate = flate.map(() => ({ type: 'apen' }));
  const n = Object.assign({}, nivaa);
  const r = T.beregnTomtemasser({
    tomt: { punkter: flate, kanter: kunFlate, nivaa: n }, mal,
    faktorer: {}, terreng: lagTerreng((x, y) => pl(x, y) + ob), fjell,
    rutestorrelse: 1, bakkefaktor: 1
  });
  /* terrenget er lagt nøyaktig pa ferdig niva for denne referansen.
     matjord ma trekkes fra: den skrapes av først. */
  const netto = r.sum.skjaering - r.sum.fylling;
  console.log(`\nprøve med terreng = ferdig niva for ${navn} referanse:`);
  console.log(`  areal ${r.areal.toFixed(0)} m², skjæring ${r.sum.skjaering.toFixed(1)} m³, `
    + `fylling ${r.sum.fylling.toFixed(1)} m³, netto ${netto.toFixed(1)} m³`);
  console.log(`  forventet om volumet bruker DENNE referansen: skjæring = matjord `
    + `(${r.sum.matjord.toFixed(1)} m³), fylling = 0`);
}

/* ---- 2) hvor stort er avviket i selve snittstreken? ---- */
const rad = (nivaa.fallretning || 0) * Math.PI / 180;
const skift = (tpIndre.x - tpYtre.x) * Math.sin(rad) + (tpIndre.y - tpYtre.y) * Math.cos(rad);
const avvik = skift * nivaa.fall;
console.log(`\nskift langs fallretningen: ${skift.toFixed(3)} m`);
console.log(`konstant avvik i ferdig niva: ${avvik.toFixed(3)} m`);

/* Kjør snitt()-lokka bade slik den star (tpYtre) og slik volumet regner (tpIndre) */
let maks = 0, n = 0;
for (let y = 0; y <= 80; y += 0.5) {
  for (let x = 0; x <= 60; x += 0.5) {
    if (!T.innenforPolygon(flate, x, y)) continue;
    const a = T.nivaaVed(nivaa, x, y, tpYtre);
    const b = T.nivaaVed(nivaa, x, y, tpIndre);
    maks = Math.max(maks, Math.abs(a - b)); n++;
  }
}
console.log(`største avvik i ${n} punkt inne i flaten: ${maks.toFixed(4)} m`);

const areal = Math.abs(Tomt.signertAreal(flate));
console.log(`areal innerflate ${areal.toFixed(0)} m² -> ${(areal * maks).toFixed(0)} m³ `
  + 'forskjell mellom bildet og tallene');

const r = volum(nivaa.kote, terreng);
console.log(`regnet: skjæring ${r.sum.skjaering.toFixed(0)} m³, fylling ${r.sum.fylling.toFixed(0)} m³`);
console.log('merknader:', JSON.stringify(r.merknader.map(m => m.tekst)));
