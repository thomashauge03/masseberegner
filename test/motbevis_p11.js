'use strict';
/**
 * Kontroll av funn P11: "standardsnittet gar ikke gjennom tyngdepunktet".
 * Kjører den EKTE ui-tomtprofil.js i en vm, med app-stubb.
 *
 *   node test/motbevis_p11.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const mal = Object.assign({}, Tomt.StandardTomtemal);

function lastProfil(app, etikett) {
  const kode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-tomtprofil.js'), 'utf8');
  const sandkasse = {
    Tomtmasser: T, Tomt, Farger: {}, Math, Number, console,
    document: { getElementById: id => (id === 'tp_etikett' ? etikett : null) },
    window: {}, ResizeObserver: function () { this.observe = () => {}; },
    module: { exports: {} }
  };
  sandkasse.globalThis = sandkasse;
  vm.createContext(sandkasse);
  vm.runInContext(kode, sandkasse);
  const P = sandkasse.module.exports;
  P.app = app; P.lerret = null;
  return P;
}

function proev(navn, punkter, nivaa, retning, forskyvning) {
  const terreng = { z: (x, y) => 100 + 0.10 * y };
  const fjell = new M.Fjellmodell({ standarddybde: 3 });
  const kanter = punkter.map(() => ({}));
  const app = {
    P: { tomt: { punkter, kanter, nivaa, omrissBetyr: 'senterlinje' }, mal },
    terreng,
    _innerflate: null,
    erTomt: () => true,
    tomtIUtm: () => punkter,
    tomtenivaaIUtm: () => nivaa,
    fjellmodellIUtm: () => fjell,
    sone: 32
  };
  const etikett = { textContent: '' };
  const P = lastProfil(app, etikett);
  P.retning = retning; P.forskyvning = forskyvning;

  const s = P.snitt();
  if (!s) { console.log(navn + ': snitt() ga null'); return; }
  P._merkAv(s);                       // Kart er udefinert -> bare etiketten settes

  const tp = T.tyngdepunktAv(punkter);
  // avstand fra tyngdepunktet til snittlinja (linja gar gjennom s.senter langs ex,ey)
  const rad = s.retning * Math.PI / 180;
  const nx = Math.cos(rad), ny = -Math.sin(rad);
  const avst = Math.abs((tp.x - s.senter.x) * nx + (tp.y - s.senter.y) * ny);

  console.log('\n=== ' + navn + ' ===');
  console.log('  hjørner:      ' + punkter.map(q => `(${q.x},${q.y})`).join(' '));
  console.log(`  tyngdepunkt:  (${tp.x.toFixed(2)}, ${tp.y.toFixed(2)})`);
  console.log(`  snittretning: ${s.retning.toFixed(1)}°  forskyvning ${forskyvning}`);
  console.log(`  tMin/tMaks:   ${s.tMin.toFixed(2)} / ${s.tMaks.toFixed(2)}   (malt fra tyngdepunktet)`);
  console.log(`  skyv:         ${s.skyv.toFixed(3)} m  -> senter (${s.senter.x.toFixed(2)}, ${s.senter.y.toFixed(2)})`);
  console.log(`  AVSTAND fra tyngdepunktet til snittlinja: ${avst.toFixed(2)} m`);
  console.log(`  etiketten i grensesnittet sier: "${etikett.textContent}"`);
}

const nivaa = { modus: 'fall', kote: 104, fall: 0.03, fallretning: 0 };

// funnets egen reproduksjon
proev('Trekant (0,0)-(60,0)-(10,45), fall-retning 0°, forskyvning 0,5',
  [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 10, y: 45 }], nivaa, 'fall', 0.5);

// kontroll: kvadrat (symmetrisk) - da skal avstanden vaere 0
proev('Kvadrat 60x60, forskyvning 0,5 (kontroll)',
  [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }], nivaa, 'fall', 0.5);

// kontroll: trekant med snitt paa tvers
proev('Samme trekant, snitt paa tvers (90°), forskyvning 0,5',
  [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 10, y: 45 }], nivaa, 'tvers', 0.5);

// L-formet tomt, en realistisk asymmetrisk tomt
proev('L-formet tomt, forskyvning 0,5',
  [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: 20, y: 20 },
    { x: 20, y: 70 }, { x: 0, y: 70 }], nivaa, 'fall', 0.5);
