'use strict';
/**
 * Etterprøving av funnet "sonderingspunktene brukes ikke i tomtemodus".
 *
 *   node test/motbevis_sondering.js
 *
 * Tre spørsmal:
 *  1) Er mekanismen ekte i det hele tatt (NaN-avstand -> standarddybde)?
 *  2) Gjør den *naavaerende* koden i app.js konverteringen?
 *  3) Gaar alle tomtemodus-kallstedene gjennom konverteringen?
 */
const fs = require('fs');
const path = require('path');
const rot = path.join(__dirname, '..');
const T = require(path.join(rot, 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(rot, 'public', 'js', 'tomt.js'));
const M = require(path.join(rot, 'public', 'js', 'masser.js'));
const Geo = require(path.join(rot, 'public', 'js', 'geo.js'));

const kilde = fs.readFileSync(path.join(rot, 'public', 'js', 'app.js'), 'utf8');

/* --- Hent den EKTE fjellmodellIUtm ut av app.js og kjør den ------------- */
const start = kilde.indexOf('  fjellmodellIUtm() {');
const slutt = kilde.indexOf('\n  },', start);
const metode = kilde.slice(start, slutt + 4);
console.log('=== A: metoden slik den staar i public/js/app.js ===');
console.log(metode.replace(/\n/g, '\n  '));

const App = new Function('Fjellmodell', 'Geo',
  'return {\n  sone: 32,\n  P: null,\n' + metode + '\n};'
)(M.Fjellmodell, Geo);

/* --- Punkter lagret nøyaktig slik ui-kart.js:316 gjør det ---------------- */
// ui-kart.js:  const punkt = { lat: e.latlng.lat, lon: e.latlng.lng, dybde: P.fjell.standarddybde };
const midtLat = 60.0, midtLon = 10.0;
const midt = Geo.tilUtm(midtLat, midtLon, 32);
const grader = m => m / 111320;                       // grovt, bare for a spre punktene
const P = {
  fjell: {
    standarddybde: 0.5, rekkevidde: 60, strekninger: [], soner: [],
    punkter: [
      { lat: midtLat + grader(10), lon: midtLon, dybde: 6 },
      { lat: midtLat - grader(10), lon: midtLon, dybde: 6 }
    ]
  }
};
App.P = P;

const raa = new M.Fjellmodell(P.fjell);               // slik koden VAR (app.js:1286 før)
const naa = App.fjellmodellIUtm();                    // slik koden ER na

console.log('\n=== B: dybde midt i tomta (sonderingene sier 6 m) ===');
console.log('  raa modell  new Fjellmodell(P.fjell)  ->', raa.dybde(midt.x, midt.y));
console.log('  naavaerende App.fjellmodellIUtm()     ->', naa.dybde(midt.x, midt.y));
console.log('  konverterte punkter i naavaerende modell:',
  JSON.stringify(naa.punkter.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), dybde: p.dybde }))));

/* --- Volumvirkning pa en 40x60 tomt med 3 m skjaering -------------------- */
const mal = Object.assign({}, Tomt.StandardTomtemal, {
  matjordDybde: 0, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0,
  forsterkningslag: 0, frostsikring: 0, avrettingslag: 0, overberg: 0,
  maksSokebredde: 60, maksSkjaeringsdybde: 0, maksFyllingshoyde: 0, maksVeggHoyde: 0,
  minAvstandTilBerg: 0
});
const tomt = {
  punkter: [
    { x: midt.x - 20, y: midt.y - 30 }, { x: midt.x + 20, y: midt.y - 30 },
    { x: midt.x + 20, y: midt.y + 30 }, { x: midt.x - 20, y: midt.y + 30 }
  ],
  kanter: [{ type: 'apen' }, { type: 'apen' }, { type: 'apen' }, { type: 'apen' }],
  nivaa: { type: 'flat', kote: 97 }        // terreng 100, ferdig 97 -> 3 m skjaering
};
const kjor = fjell => T.beregnTomtemasser({
  tomt, mal, faktorer: M.StandardFaktorer, terreng: { z: () => 100 },
  fjell, rutestorrelse: 0.5, bakkefaktor: 1
});
const rA = kjor(raa), rB = kjor(naa);
console.log('\n=== C: 40x60 tomt, 3 m skjaering, fjell 6 m nede (fasit: 0 m3 fjell, 7200 m3 losmasse) ===');
console.log(`  raa (lat/lon)     fjell ${rA.sum.skjaeringFjell.toFixed(0)} m3   losmasse ${rA.sum.skjaeringLosmasse.toFixed(0)} m3`);
console.log(`  naa (fjellmodellIUtm) fjell ${rB.sum.skjaeringFjell.toFixed(0)} m3   losmasse ${rB.sum.skjaeringLosmasse.toFixed(0)} m3`);
console.log('  merknader na:', JSON.stringify(rB.merknader.map(m => m.tekst)));

/* --- Kallstedene i tomtemodus ------------------------------------------- */
console.log('\n=== D: alle steder som bygger en Fjellmodell ===');
for (const f of ['public/js/app.js', 'public/js/ui-kart.js', 'public/js/ui-tomtprofil.js', 'public/js/tomt.js']) {
  const tekst = fs.readFileSync(path.join(rot, f), 'utf8').split('\n');
  tekst.forEach((l, i) => {
    if (/new Fjellmodell|fjellmodellIUtm\(\)/.test(l)) console.log(`  ${f}:${i + 1}  ${l.trim()}`);
  });
}
