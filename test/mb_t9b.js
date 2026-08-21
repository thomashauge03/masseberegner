'use strict';
/* Kjører den EKTE snitt()-funksjonen fra public/js/ui-tomtprofil.js i node,
   og sammenligner streken den tegner med det beregnTomtemasser faktisk
   regner mot. Ingen omskriving av snittlogikken. */

global.Tomtmasser = require('../public/js/tomtmasser.js');
global.Tomt = require('../public/js/tomt.js');
global.window = { devicePixelRatio: 1 };
global.document = { getElementById: () => null };
global.ResizeObserver = function () { this.observe = () => {}; };
const Tomteprofil = require('../public/js/ui-tomtprofil.js');
const T = global.Tomtmasser;

const mal = {
  slitelagTykkelse: 0.04, baerelagTykkelse: 0.08, forsterkningslag: 0.4,
  frostsikring: 0, avrettingslag: 0,
  skjaeringLosmasse: 1.5, skjaeringFjell: 0.15, fylling: 1.5,
  veggHelning: 0.1, losmasseOverFjell: 1.5,
  maksSokebredde: 45, rutestorrelse: 1, matjordDybde: 0, renskDybde: 0
};
const ob = mal.slitelagTykkelse + mal.baerelagTykkelse + mal.forsterkningslag;

const punkter = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }];
const kanter = [{ type: 'fjellvegg' }, { type: 'skraning' },
  { type: 'fjellvegg' }, { type: 'fjellvegg' }];
const nivaa = { modus: 'fall', kote: 112, fall: 0.08, fallretning: 0 };
const terreng = { z: (x, y) => 100 + y * 0.25 };
const fjell = { dybde: () => 1.0 };

const inn = T.innerflate({ tomt: { punkter, kanter, nivaa }, mal, terreng, fjell });
if (!inn.punkter) { console.log('innerflaten forsvant'); process.exit(1); }
const flate = inn.punkter;

/* app-stubb: nøyaktig de feltene snitt() leser */
const app = {
  P: { tomt: { punkter, kanter, nivaa, omrissBetyr: 'yttergrense' }, mal },
  terreng, sone: 33,
  erTomt: () => true,
  tomtIUtm: () => punkter,
  tomtenivaaIUtm: () => nivaa,
  fjellmodellIUtm: () => fjell,
  _innerflate: flate
};
Tomteprofil.app = app;
Tomteprofil.retning = 'fall';
Tomteprofil.forskyvning = 0.5;

const s = Tomteprofil.snitt();

/* FASIT: det volumet regner mot. Males ved a legge terrenget nøyaktig pa den
   antatte ferdige flaten og se om beregnTomtemasser far null masse.
   matjord og rensk er sla av, sa residualen skal vaere nøyaktig ob. */
function proev(ref, navn) {
  const zFerdig = (x, y) => T.nivaaVed(nivaa, x, y, ref);
  const kunFlate = flate.map(() => ({ type: 'apen' }));   // ingenting utenfor teller
  const r = T.beregnTomtemasser({
    tomt: { punkter: flate, kanter: kunFlate, nivaa }, mal, faktorer: {},
    terreng: { z: (x, y) => zFerdig(x, y) }, fjell, rutestorrelse: 1, bakkefaktor: 1
  });
  const netto = (r.sum.skjaering - r.sum.fylling) / r.areal;
  console.log(`  terreng lagt pa ferdig niva for ${navn}: `
    + `gjennomsnittlig d = ${netto.toFixed(6)} m  (skal vaere +${ob.toFixed(2)} = ob)`);
  return Math.abs(netto - ob);
}
console.log('Hvilken referanse regner beregnTomtemasser mot?');
const feilYtre = proev(T.tyngdepunktAv(punkter), 'YTRE omriss ');
const feilIndre = proev(T.tyngdepunktAv(flate), 'INDRE flate ');
console.log(`  -> volumet bruker ${feilIndre < feilYtre ? 'INDRE' : 'YTRE'} `
  + `(restfeil indre ${feilIndre.toExponential(1)}, ytre ${feilYtre.toExponential(1)})`);

/* Sammenlign snittets zJord inne i tomta med volumets planum */
const refVolum = T.tyngdepunktAv(flate);
let maks = 0, n = 0, hvor = null;
for (const q of s.punkt) {
  if (!q.inne || q.zJord == null) continue;
  const x = s.senter.x + Math.sin(s.retning * Math.PI / 180) * q.d;
  const y = s.senter.y + Math.cos(s.retning * Math.PI / 180) * q.d;
  const planumVolum = T.nivaaVed(nivaa, x, y, refVolum) - ob;
  const d = q.zJord - planumVolum;
  n++;
  if (Math.abs(d) > Math.abs(maks)) { maks = d; hvor = { x, y }; }
}
console.log(`\nsnittets zJord mot volumets planum, ${n} punkt inne i flaten:`);
console.log(`  største avvik: ${maks.toFixed(4)} m ved (${hvor.x.toFixed(1)}, ${hvor.y.toFixed(1)})`);
console.log(`  snittet tegner jordarbeidsflaten ${maks > 0 ? 'FOR HØYT' : 'FOR LAVT'}`);

const areal = Math.abs(Tomt.signertAreal(flate));
console.log(`  areal ${areal.toFixed(0)} m² -> ${Math.abs(areal * maks).toFixed(0)} m³ `
  + 'mellom bildet og tallene');

/* Kontroll: samme prøve i flat-modus */
const nivaaFlat = { modus: 'flat', kote: 112 };
app.P.tomt.nivaa = nivaaFlat;
app.tomtenivaaIUtm = () => nivaaFlat;
const s2 = Tomteprofil.snitt();
let maks2 = 0;
for (const q of s2.punkt) {
  if (!q.inne || q.zJord == null) continue;
  const x = s2.senter.x + Math.sin(s2.retning * Math.PI / 180) * q.d;
  const y = s2.senter.y + Math.cos(s2.retning * Math.PI / 180) * q.d;
  maks2 = Math.max(maks2, Math.abs(q.zJord - (T.nivaaVed(nivaaFlat, x, y, refVolum) - ob)));
}
console.log(`\nkontroll, flat modus (ingen fall): største avvik ${maks2.toExponential(1)} m`);

/* Kontroll: fall-modus men vanlig tomtemodus (omrisset ER flaten) */
app.P.tomt.nivaa = nivaa;
app.tomtenivaaIUtm = () => nivaa;
app.P.tomt.omrissBetyr = 'flate';
app._innerflate = null;
const s3 = Tomteprofil.snitt();
const refYtre = T.tyngdepunktAv(punkter);
let maks3 = 0;
for (const q of s3.punkt) {
  if (!q.inne || q.zJord == null) continue;
  const x = s3.senter.x + Math.sin(s3.retning * Math.PI / 180) * q.d;
  const y = s3.senter.y + Math.cos(s3.retning * Math.PI / 180) * q.d;
  maks3 = Math.max(maks3, Math.abs(q.zJord - (T.nivaaVed(nivaa, x, y, refYtre) - ob)));
}
console.log(`kontroll, fall-modus uten yttergrense: største avvik ${maks3.toExponential(1)} m`);
