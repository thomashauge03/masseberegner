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

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
