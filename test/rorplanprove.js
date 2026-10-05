'use strict';
/**
 * Planlagte rør mot fasit regnet for hånd.
 *
 *   node test/rorplanprove.js
 *
 * Alt er oppdiktet: «grader» er meter i prøvene (tilSone gjør lat/lon til
 * n/o rett fram), så fasiten kan regnes uten kartprojeksjon.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const RorPlan = require(js('rorplan.js'));

let feil = 0, ok = 0;
const fmt = v => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(6)) : String(v));
function sjekk(navn, faktisk, ventet, toleranse) {
  const d = Math.abs(faktisk - ventet);
  if (d <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(d)}, grense ${toleranse})`); }
}
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

console.log('\n1. Malen, kodene og bunn ↔ topp');
{
  const pe = RorPlan.kodeAv({}, 'SP 160PE'), pvc = RorPlan.kodeAv({}, 'OV 110PVC');
  sjekk('gods PE 160: SDR 11', RorPlan.gods(pe), 14.5, 1e-9);
  sjekk('gods PVC 110: SN8 (D/34)', RorPlan.gods(pvc), 3.2, 1e-9);
  sjekk('kodens eget gods vinner', RorPlan.gods(Object.assign({}, pe, { gods: 9.5 })), 9.5, 1e-9);
  sjekk('topp = bunn − gods + D', RorPlan.toppFraBunn(10, pe), 10 - 0.0145 + 0.16, 1e-9);
  sjekk('og tilbake', RorPlan.bunnFraTopp(RorPlan.toppFraBunn(10, pe), pe), 10, 1e-9);
  paastand('spillvann er selvfall', RorPlan.regel({}, pe) === 'selvfall');
  paastand('vann er trykk', RorPlan.regel({}, RorPlan.kodeAv({}, 'VL 160PE')) === 'trykk');
  paastand('kabel og ukjent er trykk', RorPlan.regel({}, RorPlan.kodeAv({}, '40 FIBER')) === 'trykk'
    && RorPlan.regel({}, RorPlan.kodeAv({}, 'RØR 110')) === 'trykk');
  paastand('røret og koden kan overstyre', RorPlan.regel({ regel: 'trykk' }, pe) === 'trykk'
    && RorPlan.regel({}, Object.assign({}, pe, { regel: 'trykk' })) === 'trykk');
  sjekk('overdekning: standard', RorPlan.overdekning(pe, null), 2.0, 0);
  sjekk('overdekning: anleggets', RorPlan.overdekning(pe, { overdekning: 2.4 }), 2.4, 0);
  sjekk('overdekning: kodens vinner', RorPlan.overdekning(Object.assign({}, pe, { overdekning: 1.5 }), { overdekning: 2.4 }), 1.5, 0);
  sjekk('minste fall: spillvann 10 ‰', RorPlan.minFall(pe), 10, 0);
  sjekk('minste fall: overvann 5 ‰', RorPlan.minFall(pvc), 5, 0);
  sjekk('minste fall: vann ingen', RorPlan.minFall(RorPlan.kodeAv({}, 'VL 160PE')), 0, 0);
  paastand('største fall: ingen før den er satt', RorPlan.maksFall(pe) === null
    && RorPlan.maksFall(Object.assign({}, pe, { maksFall: 80 })) === 80);
  paastand('klem: sideavstand kan være negativ, men ikke utenfor', RorPlan.klem('side', '-0,4') === -0.4
    && RorPlan.klem('side', -12) === null && RorPlan.klem('diameter', 5000) === 3000 && RorPlan.klem('overdekning', 'x') === null);
  const brukt = new Set(['t1', 't2', 'p1']);
  paastand('ny id: første ledige', RorPlan.nyId(brukt, 't') === 't3' && RorPlan.nyId(brukt, 'k') === 'k1');
  const plan = RorPlan.nyPlan();
  plan.traseer.push({ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 1 }] });
  plan.ror.push({ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 });
  paastand('alle id-ene i planen', ['t1', 'p1', 'p2', 'r1'].every(x => RorPlan.alleIder(plan).has(x)));
  paastand('en ny planmal er en kopi', RorPlan.nyPlanmal() !== RorPlan.StandardPlanmal
    && RorPlan.nyPlanmal().kum !== RorPlan.StandardPlanmal.kum && RorPlan.nyPlanmal().kum.diameter === 1000);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
