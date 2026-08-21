'use strict';
/* Hvor vanlig er avviket? Sveip over helning, kote og kanttyper. */
const T = require('../public/js/tomtmasser.js');

const malBase = {
  slitelagTykkelse: 0.04, baerelagTykkelse: 0.08, forsterkningslag: 0.4,
  frostsikring: 0, avrettingslag: 0,
  skjaeringLosmasse: 1.5, skjaeringFjell: 0.15, fylling: 1.5,
  veggHelning: 0.1, losmasseOverFjell: 1.5,
  maksSokebredde: 45, rutestorrelse: 1, matjordDybde: 0.2, renskDybde: 0.1
};
const punkter = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }];
const fjell = { dybde: () => 1.5 };

function proev(helning, kote, kanter, fall) {
  const nivaa = { modus: 'fall', kote, fall, fallretning: 0 };
  const terreng = { z: (x, y) => 100 + y * helning };
  const inn = T.innerflate({ tomt: { punkter, kanter, nivaa }, mal: malBase, terreng, fjell });
  if (!inn.punkter) return null;
  const a = T.tyngdepunktAv(punkter), b = T.tyngdepunktAv(inn.punkter);
  const skift = (b.y - a.y);          // fallretning 0 = nordover
  return { skift, avvik: Math.abs(skift * fall), areal: Math.abs(arealAv(inn.punkter)) };
}
function arealAv(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j].x * p[i].y - p[i].x * p[j].y;
  return a / 2;
}

const alleSkraning = [{}, {}, {}, {}];                       // standard: alt planert skraning
const blandet = [{ type: 'fjellvegg' }, {}, { type: 'fjellvegg' }, { type: 'fjellvegg' }];

for (const [navn, kanter] of [['alle kanter standard skraning', alleSkraning],
  ['fjellvegg pa tre kanter', blandet]]) {
  console.log(`\n=== ${navn} ===`);
  console.log('helning  kote  fall   skift(m)  avvik(m)  areal(m2)');
  for (const helning of [0.02, 0.08, 0.15, 0.25]) {
    for (const kote of [104, 108, 112]) {
      for (const fall of [0.02, 0.05, 0.08]) {
        const r = proev(helning, kote, kanter, fall);
        if (!r) { continue; }
        console.log(`${(helning * 100).toFixed(0).padStart(5)}%  ${kote}  ${(fall * 100).toFixed(0).padStart(2)}%  `
          + `${r.skift.toFixed(2).padStart(8)}  ${r.avvik.toFixed(3).padStart(7)}  ${r.areal.toFixed(0).padStart(8)}`);
      }
    }
  }
}
