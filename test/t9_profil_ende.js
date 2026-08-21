'use strict';
/**
 * Kjører den EKTE ui-tomtprofil.js-koden (i en vm med stubber for nettleseren)
 * og sammenligner det snittet tegner som ferdig nivå med det
 * beregnTomtemasser faktisk regner med.
 *
 *   node test/t9_profil_ende.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const mal = Object.assign({}, Tomt.StandardTomtemal);
const faktorer = { sprengningsfaktor: 1.50, fjellIFylling: 1.30, losmasseIFylling: 0.95, brukbarLosmasse: 0.50 };

function proev(navn, o) {
  const punkter = o.punkter, kanter = o.kanter, nivaa = o.nivaa;
  const terreng = o.terreng || { z: () => o.terrengZ };
  const fjell = new M.Fjellmodell({ standarddybde: o.fjelldybde });

  const inn = T.innerflate({ tomt: { punkter, kanter, nivaa }, mal, terreng, fjell });
  if (!inn.punkter) { console.log(`${navn}: innerflaten forsvant`); return; }
  const innerflate = inn.punkter;

  // --- app-stubb, ordrett de feltene ui-tomtprofil.js leser ---
  const app = {
    P: { tomt: { punkter, kanter, nivaa, omrissBetyr: 'yttergrense' }, mal },
    terreng,
    _innerflate: innerflate,
    erTomt: () => true,
    tomtIUtm: () => punkter,                  // det TEGNEDE omrisset
    tomtenivaaIUtm: () => nivaa,
    fjellmodellIUtm: () => fjell
  };

  // --- last den ekte fila i en vm ---
  const kode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-tomtprofil.js'), 'utf8');
  const sandkasse = {
    Tomtmasser: T, Tomt, Farger: {}, Math, Number, console,
    document: { getElementById: () => null },
    window: {}, ResizeObserver: function () { this.observe = () => {}; },
    module: { exports: {} }
  };
  sandkasse.globalThis = sandkasse;
  vm.createContext(sandkasse);
  vm.runInContext(kode, sandkasse);
  const P = sandkasse.module.exports;
  P.app = app; P.lerret = null; P.retning = 'fall'; P.forskyvning = 0.5;

  const s = P.snitt();
  if (!s) { console.log(`${navn}: snitt() ga null`); return; }

  // volumets egen ferdig-flate
  const tpInner = T.tyngdepunktAv(innerflate);
  let maksAvvik = 0, minAvvik = Infinity, n = 0;
  for (const q of s.punkt) {
    if (!q.inne || q.zN == null) continue;
    const x = s.senter.x + Math.sin(s.retning * Math.PI / 180) * q.d;
    const y = s.senter.y + Math.cos(s.retning * Math.PI / 180) * q.d;
    const volum = T.nivaaVed(nivaa, x, y, tpInner);
    const a = q.zN - volum;
    maksAvvik = Math.max(maksAvvik, a); minAvvik = Math.min(minAvvik, a); n++;
  }
  const res = T.beregnTomtemasser({
    tomt: { punkter: innerflate, kanter, nivaa },
    mal, faktorer, terreng, fjell, rutestorrelse: mal.rutestorrelse, bakkefaktor: 1
  });
  console.log(`\n=== ${navn} ===`);
  console.log(`  innerflate: ${innerflate.map(q => `(${q.x.toFixed(1)},${q.y.toFixed(1)})`).join(' ')}`);
  console.log(`  tp tegnet ${T.tyngdepunktAv(punkter).y.toFixed(3)}  tp indre ${tpInner.y.toFixed(3)} (nord)`);
  console.log(`  ${n} punkter inne i snittet. Snittets zN minus volumets ferdig nivå: ${minAvvik.toFixed(4)} .. ${maksAvvik.toFixed(4)} m`);
  console.log(`  areal ${res.areal.toFixed(0)} m² -> ${(maksAvvik * res.areal).toFixed(0)} m³ forskjell mellom bildet og tallet`);
  console.log(`  skjæring ${res.sum.skjaering.toFixed(0)} m³, fylling ${res.sum.fylling.toFixed(0)} m³`);
  console.log(`  merknader: ${res.merknader.length ? res.merknader.map(m => m.type).join(', ') : '(ingen)'}`);
}

const kv60 = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }];

proev('A  8 m skjæring, fjellvegg pa kant 0, 5 % fall', {
  punkter: kv60, kanter: [{ type: 'fjellvegg' }, {}, {}, {}],
  nivaa: { modus: 'fall', kote: 100, fall: 0.05, fallretning: 0 },
  terrengZ: 108, fjelldybde: 0.5
});

proev('B  mild: 2,5 m skjæring, fjellvegg pa kant 0, 2 % fall', {
  punkter: kv60, kanter: [{ type: 'fjellvegg' }, {}, {}, {}],
  nivaa: { modus: 'fall', kote: 100, fall: 0.02, fallretning: 0 },
  terrengZ: 102.5, fjelldybde: 3
});

proev('C  helt uten fjellvegg (symmetrisk innrykk) – kontrollprøve', {
  punkter: kv60, kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'fall', kote: 100, fall: 0.05, fallretning: 0 },
  terrengZ: 108, fjelldybde: 0.5
});

proev('D  flat modus (ingen fall) – kontrollprøve', {
  punkter: kv60, kanter: [{ type: 'fjellvegg' }, {}, {}, {}],
  nivaa: { modus: 'flat', kote: 100 },
  terrengZ: 108, fjelldybde: 0.5
});

proev('E  apen kant 2 + fjellvegg kant 0, 6 % fall', {
  punkter: kv60, kanter: [{ type: 'fjellvegg' }, {}, { type: 'apen' }, {}],
  nivaa: { modus: 'fall', kote: 100, fall: 0.06, fallretning: 0 },
  terrengZ: 106, fjelldybde: 4
});

/* --- F: den normale situasjonen. Tomt i ei li med 15 % fall, ingen
   spesialkanter i det hele tatt, bare vanlige skraninger. Skjæring i
   oppoverbakken, fylling nedover -> ulikt innrykk helt av seg selv. --- */
proev('F  tomt i li med 15 % terrengfall, bare vanlige skraninger, 3 % fall', {
  punkter: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 0, y: 80 }],
  kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'fall', kote: 106, fall: 0.03, fallretning: 180 },
  terreng: { z: (x, y) => 100 + 0.15 * y }, fjelldybde: 3
});

proev('G  samme li, men med sprengt vegg mot oppoverbakken', {
  punkter: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 0, y: 80 }],
  kanter: [{}, {}, { type: 'fjellvegg' }, {}],
  nivaa: { modus: 'fall', kote: 106, fall: 0.03, fallretning: 180 },
  terreng: { z: (x, y) => 100 + 0.15 * y }, fjelldybde: 3
});
