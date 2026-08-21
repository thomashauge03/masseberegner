'use strict';
/**
 * Prøver a motbevise funnet om at balanserTomt ser bort fra
 * `omrissBetyr === 'yttergrense'`.
 *
 *   node test/motbevis_ytter.js
 *
 * Her gjenskapes BEGGE veiene ordrett slik de star i app.js:
 *   maalBalanser(kote)  = app.js:391-399  (ytre omriss, ingen innerflate)
 *   maalBeregn(kote)    = app.js:1263-1310 (innerflate nar yttergrense)
 * og sa sammenlignes koten de to gir.
 */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const mal = Object.assign({}, Tomt.StandardTomtemal);
const faktorer = { sprengningsfaktor: 1.50, fjellIFylling: 1.30, losmasseIFylling: 0.95, brukbarLosmasse: 0.50 };

/* 40 x 60 m omriss, tegnet som yttergrense. */
const punkter = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 0, y: 60 }];
/* Li med 15 % fall langs y: 9 m fall over tomta. */
const terreng = { z: (x, y) => 100 + 0.15 * y };
/* Fjellet dypt nede, sa alt blir løsmasse (holder saken ren). */
const fjell = new M.Fjellmodell({ standarddybde: 100 });

/* app.js:1332 tomtebalanse - kopiert ordrett */
function tomtebalanse(s) {
  const f = faktorer;
  const fjellFast = s.skjaeringFjell;
  const losFast = s.skjaeringLosmasse;
  const fyllingBehov = s.fylling;
  const kanByggesSelv = s.baerelag + s.forsterkningslag;
  const maaKjopes = s.slitelag + s.avrettingslag + s.frostsikring;
  const fraFjell = fjellFast * f.fjellIFylling;
  const brukbarLos = losFast * f.brukbarLosmasse * f.losmasseIFylling;
  const tilgjengelig = fraFjell + brukbarLos;
  return { tilgjengelig, fyllingBehov, balanse: tilgjengelig - fyllingBehov };
}

const grunn = kote => ({
  tomt: { punkter, kanter: [], nivaa: { modus: 'flat', kote } },
  mal, terreng, fjell
});

/* === Veien balanserTomt gar (app.js:391-399): ytre omriss rett inn === */
function maalBalanser(kote) {
  const r = T.beregnTomtemasser(Object.assign(grunn(kote), {
    rutestorrelse: Math.max(1, mal.rutestorrelse), bakkefaktor: 1
  }));
  return tomtebalanse(r.sum).balanse;
}

/* === Veien beregnTomt gar (app.js:1263-1310): innerflate først === */
function beregnSlikSkjermenViser(kote) {
  const inn = T.innerflate(grunn(kote));
  if (!inn.punkter) return { forLiten: true };
  const r = T.beregnTomtemasser({
    tomt: { punkter: inn.punkter, kanter: [], nivaa: { modus: 'flat', kote } },
    mal, faktorer, terreng, fjell, rutestorrelse: mal.rutestorrelse, bakkefaktor: 1
  });
  return { r, b: tomtebalanse(r.sum) };
}

/* --- 1. Halveringen slik balanserTomt gjør den, ordrett ---------------- */
const start = 104;                          // en fornuftig startkote midt i lia
let lav = start - 30, hoy = start + 30;
const bLav = maalBalanser(lav), bHoy = maalBalanser(hoy);
console.log('Tomta er tegnet som YTTERGRENSE (t.omrissBetyr = "yttergrense").');
console.log(`Startkote ${start}. Endene: b(${lav}) = ${bLav.toFixed(0)}, b(${hoy}) = ${bHoy.toFixed(0)}`);
if (!(bLav > 0 && bHoy < 0)) { console.log('Ingen rot i intervallet – halveringen ville avbrutt.'); process.exit(0); }
for (let i = 0; i < 24; i++) {
  const midt = (lav + hoy) / 2;
  if (maalBalanser(midt) > 0) lav = midt; else hoy = midt;
}
const svar = +((lav + hoy) / 2).toFixed(2);
console.log(`\nbalanserTomt lander pa kote ${svar.toFixed(2)}`);

/* --- 2. Hva skjermen sa viser for den koten ---------------------------- */
const vist = beregnSlikSkjermenViser(svar);
console.log('\nberegnTomt regner derimot pa innerflaten:');
console.log(`  areal ${vist.r.areal.toFixed(0)} m² (ytre omriss er 2400 m²)`);
console.log(`  skjæring ${vist.r.sum.skjaering.toFixed(0)} m³, fylling ${vist.r.sum.fylling.toFixed(0)} m³`);
console.log(`  faktisk balanse: ${vist.b.balanse.toFixed(0)} m³`);
console.log(`  statuslinja: «Kote ${svar.toFixed(2)} gir balanse – ${Math.abs(vist.b.balanse).toFixed(0)} m³ i avvik»`);
console.log(`  merknader: ${JSON.stringify((vist.r.merknader || []).map(m => m.tekst))}`);

/* --- 3. Hvor ligger den EKTE balansekoten for yttergrense-tolkningen? -- */
console.log('\nSkann av den ekte balansen (innerflate for hver kote):');
for (let k = 102.0; k <= 106.01; k += 0.5) {
  const v = beregnSlikSkjermenViser(+k.toFixed(2));
  if (v.forLiten) { console.log(`  kote ${k.toFixed(1)}: ingen flate igjen`); continue; }
  console.log(`  kote ${k.toFixed(1)}: areal ${v.r.areal.toFixed(0).padStart(5)} m²  balanse ${v.b.balanse.toFixed(0).padStart(7)} m³`);
}

/* Halvering pa den RIKTIGE malfunksjonen */
let l2 = 103.5, h2 = 104.5;
const f2 = k => { const v = beregnSlikSkjermenViser(k); return v.forLiten ? 1e9 : v.b.balanse; };
if (f2(l2) > 0 && f2(h2) < 0) {
  for (let i = 0; i < 30; i++) { const m2 = (l2 + h2) / 2; if (f2(m2) > 0) l2 = m2; else h2 = m2; }
  const riktig = +((l2 + h2) / 2).toFixed(2);
  const vr = beregnSlikSkjermenViser(riktig);
  console.log(`\nEkte balansekote: ${riktig.toFixed(2)} (balanse ${vr.b.balanse.toFixed(0)} m³, areal ${vr.r.areal.toFixed(0)} m²)`);
  console.log(`balanserTomt svarte ${svar.toFixed(2)}. Avvik ${Math.abs(riktig - svar).toFixed(2)} m.`);
} else {
  console.log(`\nFant ikke rot rundt ${svar} for den riktige malfunksjonen: f(${l2})=${f2(l2).toFixed(0)}, f(${h2})=${f2(h2).toFixed(0)}`);
}

/* --- 4. Er avviket bare rutenettoppløsning? ---------------------------- */
console.log('\nKontroll av oppløsning – samme kote, finere rutenett:');
for (const rs of [1.0, 0.5, 0.25]) {
  const inn = T.innerflate(grunn(svar));
  const r = T.beregnTomtemasser({
    tomt: { punkter: inn.punkter, kanter: [], nivaa: { modus: 'flat', kote: svar } },
    mal, faktorer, terreng, fjell, rutestorrelse: rs, bakkefaktor: 1
  });
  console.log(`  rute ${rs} m: balanse ${tomtebalanse(r.sum).balanse.toFixed(1)} m³, areal ${r.areal.toFixed(0)} m²`);
}

/* --- 5. Kontrollprøve: samme tomt tegnet som FERDIG FLATE -------------- */
console.log('\nKontrollprøve – samme tomt tegnet som ferdig flate (omrissBetyr != yttergrense):');
let l3 = start - 30, h3 = start + 30;
for (let i = 0; i < 24; i++) { const m3 = (l3 + h3) / 2; if (maalBalanser(m3) > 0) l3 = m3; else h3 = m3; }
const k3 = +((l3 + h3) / 2).toFixed(2);
const r3 = T.beregnTomtemasser(Object.assign(grunn(k3), { faktorer, rutestorrelse: mal.rutestorrelse, bakkefaktor: 1 }));
console.log(`  kote ${k3.toFixed(2)} gir balanse ${tomtebalanse(r3.sum).balanse.toFixed(0)} m³ – her stemmer de to veiene.`);
