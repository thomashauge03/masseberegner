'use strict';
/* Har TOMTA - den som alt er bygd, prøvd og godkjent - nøyaktig samme
   forhold mellom tegnet flate og malt flate som pastanden kaller en feil? */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const rektangel = (b, l) => [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: l }, { x: 0, y: l }];

console.log('StandardTomtemal.matjordDybde =', Tomt.StandardTomtemal.matjordDybde);
console.log('StandardTomtemal.renskDybde   =', Tomt.StandardTomtemal.renskDybde);

// skrant terreng, slik at bade skjæring og fylling finnes
const r = T.beregnTomtemasser({
  mal: Object.assign({}, Tomt.StandardTomtemal),
  fjell: new M.Fjellmodell({ standarddybde: 100 }),
  rutestorrelse: 0.5, bakkefaktor: 1,
  tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
  terreng: { z: (x, y) => 100 + (x - 20) * 0.12 }
});

const m = Tomt.StandardTomtemal.matjordDybde;
let n = 0, bytter = 0, maksVedBytte = 0, avvikKonst = 0;
for (const c of r.rutenett) {
  if (!Number.isFinite(c.zT) || !Number.isFinite(c.zAvdekket) || !Number.isFinite(c.zPlanum)) continue;
  n++;
  avvikKonst = Math.max(avvikKonst, Math.abs((c.zT - c.zAvdekket) - Math.min(m, c.zT - c.zFjell)));
  const dAvdekket = c.zAvdekket - c.zPlanum;    // det volumet er regnet av (= c.d)
  const dRaa = c.zT - c.zPlanum;                // det 3D-en faktisk TEGNER
  if ((dAvdekket >= 0) !== (dRaa >= 0)) { bytter++; maksVedBytte = Math.max(maksVedBytte, Math.abs(dAvdekket)); }
}
console.log('\nTOMTA, standardmal:');
console.log('  celler =', n);
console.log('  c.d === zAvdekket - zPlanum ?', r.rutenett.every(c =>
  !Number.isFinite(c.d) || Math.abs(c.d - (c.zAvdekket - c.zPlanum)) < 1e-9));
console.log('  bytter fortegn mellom zT (tegnet) og zAvdekket (malt):', bytter,
  '=', (100 * bytter / n).toFixed(1) + ' %');
console.log('  storste |d| blant dem som bytter:', maksVedBytte.toFixed(4), 'm  (matjord =', m + ' m)');
console.log('  ui-tomt3d.js:144 tegner sumT[k] += c.zT  -> RA TERRENG, ikke zAvdekket');
console.log('  nettlesertest.js:1204 proven bruker g.zT mot g.zP, terskel |d| > 1 m');
console.log('  -> celler med |d| > 1 m som bytter fortegn:',
  r.rutenett.filter(c => Number.isFinite(c.d) && Math.abs(c.d) > 1
    && ((c.zAvdekket - c.zPlanum >= 0) !== (c.zT - c.zPlanum >= 0))).length);
