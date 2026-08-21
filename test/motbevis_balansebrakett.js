'use strict';
/**
 * Ettergaar funnet om balanserTomt sin +/-30 m brakett.
 *   node test/motbevis_balansebrakett.js
 */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const StandardFaktorer = {
  sprengningsfaktor: 1.50, fjellIFylling: 1.30,
  losmasseIFylling: 0.95, brukbarLosmasse: 0.50
};

/* tomtebalanse, kopiert ordrett fra app.js:1332 */
function tomtebalanse(s, f) {
  const fjellFast = s.skjaeringFjell;
  const losFast = s.skjaeringLosmasse;
  const fyllingBehov = s.fylling;
  const kanByggesSelv = s.baerelag + s.forsterkningslag;
  const fraFjell = fjellFast * f.fjellIFylling;
  const brukbarLos = losFast * f.brukbarLosmasse * f.losmasseIFylling;
  const tilgjengelig = fraFjell + brukbarLos;
  return { balanse: tilgjengelig - fyllingBehov, kanByggesSelv };
}

const rektangel = (b, l) => [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: l }, { x: 0, y: l }];
const mal = Object.assign({}, Tomt.StandardTomtemal);
const TERRENG = 300;
const terreng = { z: () => TERRENG };
const fjell = new M.Fjellmodell({ standarddybde: 3 });

/** Samme kall som maal() i balanserTomt. */
function maal(kote) {
  const r = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote } },
    mal, terreng, fjell,
    rutestorrelse: Math.max(1, mal.rutestorrelse || 1), bakkefaktor: 1
  });
  return { balanse: tomtebalanse(r.sum, StandardFaktorer).balanse, merknader: r.merknader || [] };
}

console.log('\n=== Terreng flatt paa kote ' + TERRENG + ', tomt 40 x 60 m, standardmal ===');
console.log('overbygning =', (mal.slitelagTykkelse + mal.baerelagTykkelse + mal.forsterkningslag
  + mal.frostsikring + mal.avrettingslag).toFixed(2), 'm, matjord =', mal.matjordDybde,
  ', maksSkjaeringsdybde =', mal.maksSkjaeringsdybde, ', maksSokebredde =', mal.maksSokebredde);

/* A. Er balansen monoton i koten? Da er halveringen gyldig og braketten
      er det eneste som avgjør om svaret finnes. */
console.log('\nA. balansen som funksjon av koten');
for (let k = 220; k <= 320; k += 10) {
  const m = maal(k);
  console.log('   kote ' + String(k).padStart(3) + '  balanse ' + m.balanse.toFixed(0).padStart(10)
    + '   merknader: ' + m.merknader.length);
}

/* B. Den sanne balansekoten, funnet med en brakett som faktisk holder. */
console.log('\nB. sann balansekote (halvering paa [250, 400])');
{
  let lav = 250, hoy = 400;
  if (!(maal(lav).balanse > 0 && maal(hoy).balanse < 0)) console.log('   ingen rot i [250,400]!');
  else {
    for (let i = 0; i < 40; i++) {
      const midt = (lav + hoy) / 2;
      if (maal(midt).balanse > 0) lav = midt; else hoy = midt;
    }
    const k = (lav + hoy) / 2;
    console.log('   balansekote = ' + k.toFixed(2) + ', balanse der = ' + maal(k).balanse.toFixed(1));
  }
}

/* C. Braketten slik app.js setter den, med en feiltastet startkote. */
for (const start of [250, 300, 310]) {
  console.log('\nC. startkote ' + start + ' -> brakett [' + (start - 30) + ', ' + (start + 30) + ']');
  const bLav = maal(start - 30).balanse, bHoy = maal(start + 30).balanse;
  console.log('   bLav = ' + bLav.toFixed(0) + '   bHoy = ' + bHoy.toFixed(0)
    + '   holder? ' + (bLav > 0 && bHoy < 0));
  if (!(bLav > 0 && bHoy < 0)) {
    console.log('   melding: «Fant ingen kote som gir balanse – det blir '
      + (bLav <= 0 ? 'fylling uansett hvor lavt' : 'skjæring uansett hvor høyt') + ' tomta legges»');
  }
}

/* D. Hva ser brukeren ellers? Merknadene ved den feiltastede koten. */
console.log('\nD. merknader ved kote 250 (50 m under terrenget)');
{
  const m = maal(250);
  if (!m.merknader.length) console.log('   (ingen)');
  m.merknader.slice(0, 12).forEach(x => console.log('   - ' + x.tekst));
}
console.log('\nE. merknader ved kote 280 (øvre brakettende)');
{
  const m = maal(280);
  if (!m.merknader.length) console.log('   (ingen)');
  m.merknader.slice(0, 12).forEach(x => console.log('   - ' + x.tekst));
}
