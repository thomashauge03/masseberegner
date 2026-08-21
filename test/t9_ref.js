'use strict';
/**
 * Prøver a motbevise funnet om at snittet og volumet bruker hvert sitt
 * tyngdepunkt som referanse for fallet nar tomta er tegnet som yttergrense.
 *
 *   node test/t9_ref.js
 */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const mal = Object.assign({}, Tomt.StandardTomtemal);
const faktorer = { sprengningsfaktor: 1.50, fjellIFylling: 1.30, losmasseIFylling: 0.95, brukbarLosmasse: 0.50 };

/* 60 x 60 m omriss, tegnet som yttergrense. Kant 0 (fra (0,0) til (60,0))
   er sprengt vegg, de tre andre vanlige skraninger. */
const punkter = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }];
const kanter = [{ type: 'fjellvegg' }, {}, {}, {}];
const nivaa = { modus: 'fall', kote: 100, fall: 0.05, fallretning: 0 };
const terreng = { z: () => 108 };                       // 8 m over nivaet, flatt
const fjell = new M.Fjellmodell({ standarddybde: 0.5 });

const grunn = { tomt: { punkter, kanter, nivaa }, mal, terreng, fjell };

/* === Slik app.js:1282-1298 gjør det === */
const inn = T.innerflate(grunn);
if (!inn.punkter) { console.log('For liten – innerflaten forsvant'); process.exit(0); }
const innerflate = inn.punkter;

console.log('innerflate: ' + innerflate.map(q => `(${q.x.toFixed(1)},${q.y.toFixed(1)})`).join(' '));

const tpTegnet = T.tyngdepunktAv(punkter);        // ui-tomtprofil.js:41
const tpInner = T.tyngdepunktAv(innerflate);      // tomtmasser.js:169
console.log(`tyngdepunkt tegnet omriss : ${tpTegnet.x.toFixed(2)} ${tpTegnet.y.toFixed(2)}`);
console.log(`tyngdepunkt innerflate    : ${tpInner.x.toFixed(2)} ${tpInner.y.toFixed(2)}`);

console.log('\nFerdig nivå i samme punkt, regnet med hver sin referanse:');
const proever = [innerflate[0], innerflate[2], tpInner];
for (const q of proever) {
  const vol = T.nivaaVed(nivaa, q.x, q.y, tpInner);    // det volumet regner med
  const snitt = T.nivaaVed(nivaa, q.x, q.y, tpTegnet); // det snittet tegner
  console.log(`  (${q.x.toFixed(1).padStart(5)},${q.y.toFixed(1).padStart(5)})  volum ${vol.toFixed(3).padStart(7)}   snitt ${snitt.toFixed(3).padStart(7)}   diff ${(vol - snitt).toFixed(3)} m`);
}

const areal = Math.abs(Tomt.signertAreal(innerflate));
const dz = T.nivaaVed(nivaa, tpInner.x, tpInner.y, tpInner) - T.nivaaVed(nivaa, tpInner.x, tpInner.y, tpTegnet);
console.log(`\nKonstant forskjell ${Math.abs(dz).toFixed(3)} m over ${areal.toFixed(0)} m² = ${Math.abs(dz * areal).toFixed(0)} m³ mellom det snittet viser og det volumet regner.`);

/* === Er forskjellen konstant over hele flaten? === */
let maks = -Infinity, min = Infinity;
for (let x = 2; x < 58; x += 1) for (let y = 2; y < 58; y += 1) {
  if (!T.innenforPolygon(innerflate, x, y)) continue;
  const d = T.nivaaVed(nivaa, x, y, tpInner) - T.nivaaVed(nivaa, x, y, tpTegnet);
  maks = Math.max(maks, d); min = Math.min(min, d);
}
console.log(`Spenn i forskjellen over flaten: ${min.toFixed(6)} .. ${maks.toFixed(6)} m (konstant om de er like)`);

/* === Merker programmet noe? === */
const res = T.beregnTomtemasser({
  tomt: { punkter: innerflate, kanter, nivaa },
  mal, faktorer, terreng, fjell, rutestorrelse: mal.rutestorrelse, bakkefaktor: 1
});
console.log('\nMerknader fra beregningen: ' + (res.merknader.length
  ? res.merknader.map(m => m.type + ': ' + m.tekst).join(' | ') : '(ingen)'));

/* === Hva utgjør 2 cm i masser? === */
console.log(`Areal innerflate ${res.areal.toFixed(0)} m², skjæring ${res.sum.skjaering.toFixed(0)} m³.`);
console.log(`2 cm feil lest av i snittet ≈ ${(Math.abs(dz) * res.areal).toFixed(0)} m³ = ${(100 * Math.abs(dz) * res.areal / Math.max(1, res.sum.skjaering)).toFixed(2)} % av skjæringen.`);
