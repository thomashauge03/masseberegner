'use strict';
/**
 * Motbevisforsøk: "Y-skalaen ser ikke på jordarbeidsflaten (zJord)".
 *
 * Kjører den EKTE tegn() i ui-tomtprofil.js mot et lerret som bare skriver ned
 * hvor strekene havner, og ser om planumstreken faktisk havner utenfor
 * tegneflaten.
 *
 *   node test/motbevis_yskala.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const BREDDE = 760, HOYDE = 220;   // typisk panelstørrelse
const MARG = { v: 52, h: 12, o: 14, u: 26 };

function lagLerret() {
  const spor = [];   // {type, farge, tykk, stiplet, punkter:[[x,y]]}
  let aktiv = null;
  const ctx = {
    _fill: null, _stroke: null, lineWidth: 1, font: '', textAlign: '',
    globalAlpha: 1,
    set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
    set strokeStyle(v) { this._stroke = v; }, get strokeStyle() { return this._stroke; },
    _dash: [],
    setTransform() {}, clearRect() {}, fillRect() {}, fillText() {},
    measureText() { return { width: 40 }; },
    setLineDash(d) { this._dash = d; },
    beginPath() { aktiv = { farge: null, punkter: [] }; },
    moveTo(x, y) { if (aktiv) aktiv.punkter.push([x, y]); },
    lineTo(x, y) { if (aktiv) aktiv.punkter.push([x, y]); },
    closePath() {},
    stroke() {
      if (aktiv) { aktiv.type = 'strek'; aktiv.farge = this._stroke; aktiv.tykk = this.lineWidth; aktiv.stiplet = this._dash.length > 0; spor.push(aktiv); aktiv = null; }
    },
    fill() {
      if (aktiv) { aktiv.type = 'flate'; aktiv.farge = this._fill; spor.push(aktiv); aktiv = null; }
    }
  };
  const c = {
    clientWidth: BREDDE, clientHeight: HOYDE, width: 0, height: 0,
    style: {}, getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: BREDDE, height: HOYDE })
  };
  return { c, spor };
}

function proev(navn, o) {
  const mal = Object.assign({}, Tomt.StandardTomtemal, o.mal || {});
  const ob = (mal.slitelagTykkelse || 0) + (mal.baerelagTykkelse || 0)
    + (mal.forsterkningslag || 0) + (mal.frostsikring || 0) + (mal.avrettingslag || 0);
  const punkter = o.punkter, kanter = o.kanter, nivaa = o.nivaa;
  const terreng = o.terreng || { z: () => o.terrengZ };
  const fjell = new M.Fjellmodell({ standarddybde: o.fjelldybde });

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

  const { c, spor } = lagLerret();
  const kode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-tomtprofil.js'), 'utf8');
  const sandkasse = {
    Tomtmasser: T, Tomt, Math, Number, console, Infinity,
    Farger: {
      blekk: '#000', blekkSvak: '#888', rutenett: '#ccc',
      terreng: 'TERRENG', fjell: 'FJELL', planum: 'PLANUM', veg: 'FERDIG',
      skjaeringFlate: 'SKJ', fyllingFlate: 'FYL'
    },
    document: { getElementById: id => (id === 'tomtprofil' ? c : null) },
    window: { devicePixelRatio: 1 },
    ResizeObserver: function () { this.observe = () => {}; },
    module: { exports: {} }
  };
  sandkasse.globalThis = sandkasse;
  vm.createContext(sandkasse);
  vm.runInContext(kode, sandkasse);
  const P = sandkasse.module.exports;
  P.init(app);
  P.retning = o.retning || 'fall';
  P.forskyvning = 0.5;

  const s = P.snitt();
  P.tegn();

  // hva tegn() faktisk skrev
  const strek = f => spor.filter(q => q.type === 'strek' && q.farge === f);
  const flate = f => spor.filter(q => q.type === 'flate' && q.farge === f);
  const alleY = liste => liste.flatMap(q => q.punkter.map(p => p[1]));

  const yTopp = MARG.o, yBunn = HOYDE - MARG.u;

  // skalaen slik tegn() regner den (av zT, zF, zN)
  let minZ = Infinity, maksZ = -Infinity;
  for (const q of s.punkt) for (const v of [q.zT, q.zF, q.zN]) if (v != null) { minZ = Math.min(minZ, v); maksZ = Math.max(maksZ, v); }
  const sp = maksZ - minZ;
  const lavSkala = minZ - sp * 0.08, hoySkala = maksZ + sp * 0.08;

  let jMin = Infinity, jMaks = -Infinity;
  for (const q of s.punkt) if (q.zJord != null) { jMin = Math.min(jMin, q.zJord); jMaks = Math.max(jMaks, q.zJord); }

  const yPlanum = alleY(strek('PLANUM'));
  const yFlater = alleY(flate('SKJ').concat(flate('FYL')));
  const yAlle = yPlanum.concat(yFlater);
  const verstY = yAlle.length ? Math.max(...yAlle) : NaN;

  console.log(`\n=== ${navn} ===`);
  console.log(`  overbygning ob = ${ob.toFixed(2)} m`);
  console.log(`  skala (zT,zF,zN): ${minZ.toFixed(3)} .. ${maksZ.toFixed(3)}  -> med luft ${lavSkala.toFixed(3)} .. ${hoySkala.toFixed(3)}`);
  console.log(`  jordarbeidsflaten zJord: ${jMin.toFixed(3)} .. ${jMaks.toFixed(3)}`);
  console.log(`  tegneflate i px: y = ${yTopp.toFixed(1)} (topp) .. ${yBunn.toFixed(1)} (bunn), lerret ${HOYDE} px høyt`);
  console.log(`  laveste tegnede punkt pa planum/flate: y = ${verstY.toFixed(1)} px`);
  const utenfor = verstY - yBunn;
  console.log(`  ${utenfor > 0.5 ? '>>> ' + utenfor.toFixed(1) + ' px UTENFOR rammen' : 'innenfor rammen (' + utenfor.toFixed(1) + ' px)'}`);
  console.log(`  klippes bort av lerretet? ${verstY > HOYDE ? 'JA' : 'nei, men over tegnforklaringen (y=' + (HOYDE - 14) + '..' + (HOYDE - 10) + ')'}`);

  // hva klikk() ville gitt: klikk pa nederste kotelinje
  return { utenfor, verstY };
}

const kv40 = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];

proev('A  funnets egen oppskrift: flatt terreng 102, flat kote 100, fjell 0,6 m', {
  punkter: kv40, kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'flat', kote: 100 },
  terrengZ: 102, fjelldybde: 0.6
});

proev('B  vanlig tomt i li, 15 % fall, kote midt i terrenget', {
  punkter: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 0, y: 80 }],
  kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'fall', kote: 106, fall: 0.03, fallretning: 180 },
  terreng: { z: (x, y) => 100 + 0.15 * y }, fjelldybde: 3
});

proev('C  ren fylling: terreng 98, kote 100 (ferdig niva øverst)', {
  punkter: kv40, kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'flat', kote: 100 },
  terrengZ: 98, fjelldybde: 3
});

proev('D  dyp skjæring: terreng 110, kote 100 (stort spenn)', {
  punkter: kv40, kanter: [{}, {}, {}, {}],
  nivaa: { modus: 'flat', kote: 100 },
  terrengZ: 110, fjelldybde: 3
});
