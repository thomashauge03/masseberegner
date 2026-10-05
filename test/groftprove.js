'use strict';
/**
 * Grøfta mot fasit regnet for hånd.
 *
 *   node test/groftprove.js
 *
 * Punktene er oppdiktet. Kundens filer ligger ikke i repoet – står stien i
 * ROR_FIL, kjøres en ekte fil i tillegg til slutt.
 */
const path = require('path');
const fs = require('fs');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const M = require(js('masser.js'));
const Groft = require(js('groft.js'));

/* Et rør fra punkter [x, y, topp] – som App.byggRor gir det, i regnesonen. */
function linje(id, kode, pts) {
  return { id, kode, punkter: pts.map((p, i) => ({ id: id + '-' + i, z: p[2] })), xy: pts.map(p => ({ x: p[0], y: p[1] })) };
}
/* Et rett rør med punkt hver 10. m, på skrå (0,3 rad) så kantene ikke følger
   rutenettet. `forskyv` flytter det sidelengs. */
function rett(id, kode, lengde, topp, x0 = 1000, y0 = 1000, vinkel = 0.3, forskyv = 0) {
  const ux = Math.cos(vinkel), uy = Math.sin(vinkel), nx = -uy, ny = ux;
  const pts = [];
  for (let s = 0; s <= lengde + 1e-9; s += 10) pts.push([x0 + ux * s + nx * forskyv, y0 + uy * s + ny * forskyv, topp]);
  return linje(id, kode, pts);
}

let feil = 0, ok = 0;
const fmt = v => (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(6));
function sjekk(navn, faktisk, ventet, toleranse) {
  const d = Math.abs(faktisk - ventet);
  if (d <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(d)}, grense ${toleranse})`); }
}
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

console.log('\n1. Fjell fra sonderinger');
{
  const fm = new M.Fjellmodell({ standarddybde: 0.5, rekkevidde: 60, punkter: [{ x: 0, y: 0, dybde: 1.2 }] });
  sjekk('ved sonderingen', fm.sondert(0, 0.01), 1.2, 1e-9);
  sjekk('innenfor rekkevidden', fm.sondert(30, 0), 1.2, 1e-9);
  paastand('utenfor rekkevidden: ingenting – ikke standarddybden', fm.sondert(100, 0) === null);
  paastand('uten sonderinger: ingenting', new M.Fjellmodell({ standarddybde: 0.5 }).sondert(0, 0) === null);
  paastand('dybde() bruker fortsatt standarddybden', new M.Fjellmodell({ standarddybde: 0.5 }).dybde(0, 0, 0) === 0.5);
}

console.log('\n2. Målene og hvor de gjelder');
{
  const m = Groft.malFor({ helning: 0.5 }, { bunntillegg: 0.1 }, { fundament: 0.25 });
  sjekk('anleggets helning', m.helning, 0.5, 0);
  sjekk('kodens arbeidsrom', m.bunntillegg, 0.1, 0);
  sjekk('strekningens fundament', m.fundament, 0.25, 0);
  sjekk('standard omfylling', m.omfylling, 0.3, 0);
  sjekk('helning 0 er lov – loddrett', Groft.malFor({}, null, { helning: 0 }).helning, 0, 0);
  paastand('et felt som ikke er satt, arves', Groft.malFor({ fundament: 0.2 }, { fundament: null }, {}).fundament === 0.2);
  sjekk('klem: tekst med komma', Groft.klem('fundament', '0,2'), 0.2, 1e-12);
  sjekk('klem: over grensen', Groft.klem('helning', 9), 3, 0);
  paastand('klem: ikke et tall', Groft.klem('omfylling', 'abc') === null && Groft.klem('fjell', null) === null
    && Groft.klem('fjell', '') === null);
}

console.log('\n3. Rørene som segmenter');
{
  const M1 = Groft.forbered({ linjer: [rett('a', '90PE', 100, 8.5), rett('b', 'RØR', 50, 8.5, 2000, 2000)],
    koder: { '90PE': { dim: 90 }, 'RØR': { dim: null } }, terrengZ: () => 10 });
  paastand('røret med dimensjon er med', M1.ror.length === 1 && M1.ror[0].kode === '90PE');
  sjekk('røret uten dimensjon er ikke med, men lengden er talt', M1.utenDimensjon.get('RØR'), 50, 1e-9);
  sjekk('ett segment per strekk mellom målte punkt', M1.seg.length, 10, 0);
  sjekk('halv bunnbredde = D/2 + 0,3', M1.seg[0].w, 0.045 + 0.3, 1e-12);
  const M2 = Groft.forbered({ linjer: [rett('a', '90PE', 100, 8.5)], koder: { '90PE': { dim: 90 } }, terrengZ: () => 10,
    justering: { strekninger: [{ fra: 'a-2', til: 'a-5', mal: { helning: 0.5 }, fjell: 0.4, egen: true }], sammen: [] } });
  paastand('strekningen gjelder segment 2–4', [2, 3, 4].every(i => M2.seg[i].hel === 0.5 && M2.seg[i].fjell === 0.4)
    && M2.seg[1].hel === 1 && M2.seg[5].hel === 1);
  paastand('egen grøft får egen gruppe', M2.seg[2].gruppe > 0 && M2.seg[2].gruppe === M2.seg[4].gruppe && M2.seg[1].gruppe === 0);
  sjekk('to grupper i alt', M2.grupper, 2, 0);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
