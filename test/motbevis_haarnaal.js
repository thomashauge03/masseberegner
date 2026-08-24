'use strict';
/**
 * Motbevis-prove for pastanden om at korridorgitteret bare folder seg i de
 * profilene masser.js har flagget med forbiKurvesenter.
 *
 *   node test/motbevis_haarnaal.js
 */
const path = require('path');
const { Linjeforing } = require(path.join(__dirname, '..', 'public', 'js', 'linjeforing.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

/* --- Syntetisk U-sving: to 90-graders venstresvinger med R = 10 --------- */
function lagLinje(R) {
  return new Linjeforing([
    { x: 0, y: 0, r: 0 },
    { x: 60, y: 0, r: R },
    { x: 60, y: 25, r: R },
    { x: 0, y: 25, r: 0 }
  ]);
}

/* Terreng som stiger kraftig mot nord, slik at innersida av svingen far en
   dyp skjaering og yttersida en fylling. */
function lagTerreng(helning) {
  return { z: (x, y) => 100 + helning * y + 0.02 * x };
}

function kjor(o) {
  const linje = lagLinje(o.R == null ? 10 : o.R);
  const terreng = lagTerreng(o.helning == null ? 0.35 : o.helning);
  const mal = Object.assign({}, M.StandardMal, {
    maksSokebredde: o.maksSokebredde == null ? 60 : o.maksSokebredde,
    maksFyllingshoyde: 0, maksSkjaeringsdybde: 0, maksUtslag: 0,
    minRadius: 0
  }, o.mal || {});
  const profil = {
    hoyde: () => (o.vegnivaa == null ? 104 : o.vegnivaa),
    stigning: () => 0
  };
  const fjell = new M.Fjellmodell({ standarddybde: o.fjelldybde == null ? 30 : o.fjelldybde });
  const res = M.beregnMasser({
    linje, profil, terreng, mal, fjell,
    profilAvstand: o.dS == null ? 5 : o.dS, bakkefaktor: 1
  });
  return { res, linje, terreng, mal };
}

/* ======================================================================
   KORRIDORGITTERET
   Regulaert i indeks: en rad per stasjon, nb noder jevnt fra fotVenstre til
   fotHoyre. Det er den eneste inndelingen der hver node har en hoyde som
   masser.js selv har regnet ut (geometri gar nettopp fra tV til tH).
   ====================================================================== */
function byggGitter(res, linje, nb) {
  const rader = [];
  for (const p of res.profiler) {
    const t = [], w = [], xy = [];
    for (let i = 0; i < nb; i++) {
      const tt = p.fotVenstre + (p.fotHoyre - p.fotVenstre) * i / (nb - 1);
      t.push(tt);
      w.push(1 + tt * p.krumning);
      xy.push(linje.punktMedAvvik(p.s, tt));
    }
    rader.push({ p, t, w, xy });
  }
  return rader;
}

/** Kryssproduktets fortegn for hver celle i planet (uten hoyde). */
function celleFortegn(rader, nb, hoppOver) {
  let pos = 0, neg = 0, null0 = 0;
  for (let j = 0; j < rader.length - 1; j++) {
    for (let i = 0; i < nb - 1; i++) {
      if (hoppOver && (hoppOver(rader[j], i) || hoppOver(rader[j], i + 1)
        || hoppOver(rader[j + 1], i) || hoppOver(rader[j + 1], i + 1))) continue;
      const a = rader[j].xy[i], b = rader[j].xy[i + 1], c = rader[j + 1].xy[i];
      const k = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (k > 1e-9) pos++; else if (k < -1e-9) neg++; else null0++;
    }
  }
  return { pos, neg, null0 };
}

function rapport(navn, o, nb) {
  const { res, linje } = kjor(o);
  const rader = byggGitter(res, linje, nb);
  const flagget = res.profiler.filter(p => p.forbiKurvesenter);
  const negVekt = rader.filter(r => r.w.some(v => v < 0));
  const nullVekt = rader.filter(r => r.w.some(v => v <= 0) && !r.w.some(v => v < 0));
  let minW = Infinity, maksBredde = -Infinity, minBredde = Infinity;
  for (const r of rader) {
    for (const v of r.w) minW = Math.min(minW, v);
    const br = r.p.fotHoyre - r.p.fotVenstre;
    maksBredde = Math.max(maksBredde, br); minBredde = Math.min(minBredde, br);
  }
  const uten = celleFortegn(rader, nb, null);
  const med = celleFortegn(rader, nb, (r, i) => r.w[i] <= 0);

  console.log('\n===== ' + navn + ' =====');
  console.log(`  profiler:                 ${res.profiler.length}`);
  console.log(`  forbiKurvesenter:         ${flagget.length}`);
  console.log(`  rader med w < 0:          ${negVekt.length}`);
  console.log(`  rader med w == 0 men ikke < 0: ${nullVekt.length}`);
  console.log(`  minste Pappus-vekt:       ${minW.toFixed(4)}`);
  console.log(`  korridorbredde:           ${minBredde.toFixed(1)} .. ${maksBredde.toFixed(1)} m`);
  console.log(`  celler uten kutt:         +${uten.pos}  -${uten.neg}  0:${uten.null0}`);
  console.log(`  celler MED kutt (w<=0):   +${med.pos}  -${med.neg}  0:${med.null0}`);
  const sameSett = flagget.length === negVekt.length
    && flagget.every((p, i) => negVekt.some(r => r.p.s === p.s));
  console.log(`  samme sett profiler?      ${sameSett ? 'JA' : 'NEI'}`);
  console.log(`  blandet fortegn etter kutt? ${(med.pos > 0 && med.neg > 0) ? 'JA - kuttet holder ikke' : 'nei'}`);
  return { res, linje, rader, flagget, negVekt, uten, med };
}

const nb = Number(process.argv[3] || 41);
const hva = process.argv[2] || 'alle';

if (hva === 'alle' || hva === 'a') {
  rapport('A. Harnal R=10, sokebredde 60, ingen beregningsbredde', {}, nb);
}
if (hva === 'alle' || hva === 'b') {
  rapport('B. Samme, men beregningsbredde 8 m (avkortet)', { mal: { beregningsbredde: 8 } }, nb);
}
if (hva === 'alle' || hva === 'c') {
  rapport('C. Samme, men beregningsbredde 12 m', { mal: { beregningsbredde: 12 } }, nb);
}
if (hva === 'alle' || hva === 'd') {
  rapport('D. Slakere terreng (0.12) - grunn skjaering', { helning: 0.12 }, nb);
}
if (hva === 'alle' || hva === 'e') {
  rapport('E. Demolik: R=60, slakt terreng', { R: 60, helning: 0.08 }, nb);
}

module.exports = { kjor, byggGitter, celleFortegn, lagLinje, lagTerreng, rapport };
