'use strict';
/**
 * Sveip: hvor ofte havner planum utenfor Y-skalaen i snittet?
 * Kjører den EKTE tegn() for en rekke realistiske tomter.
 *
 *   node test/motbevis_yskala2.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const BREDDE = 760, HOYDE = 220, MARG = { v: 52, h: 12, o: 14, u: 26 };
const kode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-tomtprofil.js'), 'utf8');

function lagLerret() {
  const spor = []; let aktiv = null;
  const ctx = {
    _fill: null, _stroke: null, lineWidth: 1, font: '', textAlign: '', globalAlpha: 1, _dash: [],
    set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
    set strokeStyle(v) { this._stroke = v; }, get strokeStyle() { return this._stroke; },
    setTransform() {}, clearRect() {}, fillRect() {}, fillText() {},
    measureText() { return { width: 40 }; }, setLineDash(d) { this._dash = d; },
    beginPath() { aktiv = { punkter: [] }; },
    moveTo(x, y) { aktiv && aktiv.punkter.push([x, y]); },
    lineTo(x, y) { aktiv && aktiv.punkter.push([x, y]); },
    closePath() {},
    stroke() { if (aktiv) { aktiv.type = 'strek'; aktiv.farge = this._stroke; spor.push(aktiv); aktiv = null; } },
    fill() { if (aktiv) { aktiv.type = 'flate'; aktiv.farge = this._fill; spor.push(aktiv); aktiv = null; } }
  };
  return {
    c: { clientWidth: BREDDE, clientHeight: HOYDE, width: 0, height: 0, style: {},
      getContext: () => ctx, addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: BREDDE, height: HOYDE }) },
    spor
  };
}

function kjor(o) {
  const mal = Object.assign({}, Tomt.StandardTomtemal, o.mal || {});
  const terreng = o.terreng || { z: () => o.terrengZ };
  const fjell = new M.Fjellmodell(o.fjelldybde === undefined ? {} : { standarddybde: o.fjelldybde });
  const app = {
    P: { tomt: { punkter: o.punkter, kanter: o.kanter, nivaa: o.nivaa, omrissBetyr: 'senterlinje' }, mal },
    terreng, _innerflate: null, erTomt: () => true,
    tomtIUtm: () => o.punkter, tomtenivaaIUtm: () => o.nivaa, fjellmodellIUtm: () => fjell, sone: 32
  };
  const { c, spor } = lagLerret();
  const s0 = {
    Tomtmasser: T, Tomt, Math, Number, console, Infinity,
    Farger: { blekk: '#000', blekkSvak: '#888', rutenett: '#ccc', terreng: 'TER', fjell: 'FJE', planum: 'PLA', veg: 'FER', skjaeringFlate: 'SKJ', fyllingFlate: 'FYL' },
    document: { getElementById: id => (id === 'tomtprofil' ? c : null) },
    window: { devicePixelRatio: 1 },
    ResizeObserver: function () { this.observe = () => {}; },
    module: { exports: {} }
  };
  s0.globalThis = s0; vm.createContext(s0); vm.runInContext(kode, s0);
  const P = s0.module.exports; P.init(app); P.retning = 'fall'; P.forskyvning = 0.5;
  const s = P.snitt(); P.tegn();
  const yBunn = HOYDE - MARG.u;
  const yPla = spor.filter(q => q.farge === 'PLA' || q.farge === 'SKJ' || q.farge === 'FYL')
    .flatMap(q => q.punkter.map(p => p[1]));
  const verst = yPla.length ? Math.max(...yPla) : NaN;
  let minZ = Infinity, maksZ = -Infinity, jMin = Infinity;
  for (const q of s.punkt) {
    for (const v of [q.zT, q.zF, q.zN]) if (v != null) { minZ = Math.min(minZ, v); maksZ = Math.max(maksZ, v); }
    if (q.zJord != null) jMin = Math.min(jMin, q.zJord);
  }
  const lav = minZ - (maksZ - minZ) * 0.08;
  return { verst, over: verst - yBunn, klippet: verst > HOYDE, lav, jMin, minZ, maksZ };
}

const kv40 = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
const rek = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 0, y: 80 }];

const saker = [
  ['flatt terreng 102, kote 100, STANDARD fjelldybde (ingen sondering)', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 102 }],
  ['flatt terreng 101, kote 100, standard fjelldybde', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 101 }],
  ['flatt terreng 103,5, kote 100, standard fjelldybde', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 103.5 }],
  ['flatt terreng 108, kote 100, standard fjelldybde (dyp skjæring)', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 108 }],
  ['li 5 %, kote 102, standard fjelldybde', { punkter: rek, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 102, fall: 0.02, fallretning: 180 }, terreng: { z: (x, y) => 100 + 0.05 * y } }],
  ['li 15 %, kote 106, standard fjelldybde', { punkter: rek, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 106, fall: 0.03, fallretning: 180 }, terreng: { z: (x, y) => 100 + 0.15 * y } }],
  ['li 5 %, kote 102, fjelldybde 3 m (dype løsmasser)', { punkter: rek, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 102, fall: 0.02, fallretning: 180 }, terreng: { z: (x, y) => 100 + 0.05 * y }, fjelldybde: 3 }],
  ['ren fylling: terreng 98, kote 100, standard fjelldybde', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 98 }],
  ['flatt terreng 102, kote 100, uten overbygning (ob = 0)', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'flat', kote: 100 }, terrengZ: 102, mal: { slitelagTykkelse: 0, baerelagTykkelse: 0, forsterkningslag: 0 } }]
];

console.log('sak'.padEnd(62), 'skala lav'.padStart(10), 'planum min'.padStart(11), 'y px'.padStart(8), 'utenfor'.padStart(9), 'klippet');
for (const [navn, o] of saker) {
  const r = kjor(o);
  console.log(navn.padEnd(62),
    r.lav.toFixed(2).padStart(10), r.jMin.toFixed(2).padStart(11),
    r.verst.toFixed(1).padStart(8),
    (r.over > 0.5 ? '+' + r.over.toFixed(1) + ' px' : 'nei').padStart(9),
    r.klippet ? 'JA' : 'nei');
}

console.log('\n--- realistisk, ikke matematisk flatt terreng (DTM-aktig ruhet) ---');
const naerFlatt = [
  ['jorde med 2 % fall og 0,3 m ruhet, kote 101,2', { punkter: rek, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 101.2, fall: 0.02, fallretning: 180 }, terreng: { z: (x, y) => 102 + 0.02 * y + 0.15 * Math.sin(x / 7) + 0.1 * Math.cos(y / 5) } }],
  ['grusplass, 1 % fall, kote 0,8 m under, standard fjell', { punkter: kv40, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 101.2, fall: 0.02, fallretning: 90 }, terreng: { z: (x, y) => 102 + 0.01 * x + 0.08 * Math.sin(y / 4) } }],
  ['samme jorde, men fjelldybde 4 m (kjent løsmasse)', { punkter: rek, kanter: [{}, {}, {}, {}], nivaa: { modus: 'fall', kote: 101.2, fall: 0.02, fallretning: 180 }, terreng: { z: (x, y) => 102 + 0.02 * y + 0.15 * Math.sin(x / 7) + 0.1 * Math.cos(y / 5) }, fjelldybde: 4 }]
];
for (const [navn, o] of naerFlatt) {
  const r = kjor(o);
  console.log(navn.padEnd(62), r.lav.toFixed(2).padStart(10), r.jMin.toFixed(2).padStart(11), r.verst.toFixed(1).padStart(8),
    (r.over > 0.5 ? '+' + r.over.toFixed(1) + ' px' : 'nei').padStart(9), r.klippet ? 'JA' : 'nei');
}
