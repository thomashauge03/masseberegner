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

console.log('\n2. Sideavstanden');
{
  const rett = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.5);
  paastand('rett strekk: høyre i tegneretningen er minus y når man går mot øst',
    Math.abs(rett[0].y + 0.5) < 1e-12 && Math.abs(rett[1].y + 0.5) < 1e-12 && rett[1].x === 10);
  const v = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 1);
  // venstresving på 90°: høyresiden er yttersida, punktet ligger på halveringslinja, √2 ut
  sjekk('90° knekk: √2 · side ut', Math.hypot(v[1].x - 10, v[1].y), Math.SQRT2, 1e-12);
  paastand('og på yttersida', v[1].x > 10 && v[1].y < 0);
  const s = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }], 1);
  sjekk('skarp knekk: kappet ved 2 · side', Math.hypot(s[1].x - 10, s[1].y), 2, 1e-12);
  paastand('side 0 gir punktene som de er', RorPlan.forskyv([{ x: 1, y: 2 }, { x: 3, y: 4 }], 0)[1].y === 4);
  const st = RorPlan.stasjonering([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]);
  paastand('stasjoneringen langs linja', st.length === 3 && st[1] === 5 && st[2] === 11);
}

console.log('\n3. Høydene');
/* En trase langs x-aksen i «meter-grader»: lat = y, lon = x. */
const plan1 = (pts, ror, ekstra = {}) => Object.assign(RorPlan.nyPlan(), {
  traseer: [{ id: 't1', punkter: pts.map(([x, y], i) => ({ id: 'p' + (i + 1), lat: y, lon: x })) }],
  ror: ror.map((r, i) => Object.assign({ id: 'r' + (i + 1), trase: 't1', side: 0, regel: null, motsatt: false }, r))
}, ekstra);
const bygg = (plan, T, ekstra = {}) => RorPlan.bygg(Object.assign({ plan, koder: {}, mal: RorPlan.nyPlanmal(),
  tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o, y: p.n }), terrengZ: T }, ekstra));
const SP = RorPlan.kodeAv({}, 'SP 160PE'), VL = RorPlan.kodeAv({}, 'VL 110PE');
const flatt = () => 10;
{
  // selvfall med frie ender på flatt terreng: 2,0 m overdekning hele veien
  const b = bygg(plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const l = b.linjer[0];
  paastand('selvfall: tre knekkpunkt, ingen mellompunkt', l.punkter.length === 3 && !l.punkter.some(p => p.mellom));
  paastand('frie ender: topp = terreng − 2,0', l.punkter.every(p => Math.abs(p.z - 8) < 1e-9));
  paastand('id-ene er rør:punkt', l.punkter.map(p => p.id).join(',') === 'r1:p1,r1:p2,r1:p3');
  paastand('to kontrollpunkt – endene', b.kontroll.length === 2 && b.kontroll.every(c => !c.laast));
  sjekk('lengden', l.lengde, 100, 1e-9);
}
{
  // låst bunn i begge ender: rett linje, og punktet midt på ligger på den
  const p = plan1([[0, 0], [30, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 7.0 }] });
  const b = bygg(p, x => (x > 20 && x < 40 ? 12 : 10));   // en kul under knekkpunktet midt på
  const l = b.linjer[0];
  sjekk('selvfall: topp i starten fra låst bunn', l.punkter[0].z, RorPlan.toppFraBunn(7.5, SP), 1e-9);
  sjekk('og knekkpunktet midt på ligger på linja – kula betyr ingenting', l.punkter[1].z,
    RorPlan.toppFraBunn(7.5 - 0.5 * 30 / 100, SP), 1e-9);
  const k = b.kontroll.find(c => c.punkt === 'p3');
  paastand('kontrollpunktet er låst, og bunnen er den låste', k.laast && Math.abs(k.bunn - 7.0) < 1e-9);
}
{
  // én låst ende, én fri, terrenget faller 2 %: rett mellom låst og terreng − 2,0
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.0 }] });
  const b = bygg(p, x => 10 - 0.02 * x);
  sjekk('fri ende: terreng − overdekning', b.linjer[0].punkter[1].z, 8 - 2, 1e-9);
}
{
  // trykk følger terrenget meter for meter
  const T = x => 10 + Math.sin(x / 7);
  const b = bygg(plan1([[0, 0], [40, 0]], [{ kode: 'VL 110PE' }]), T);
  const l = b.linjer[0];
  paastand('trykk: ett punkt per meter', l.punkter.length === 41 && l.punkter.filter(p => p.mellom).length === 39);
  paastand('og hvert ligger 2,0 m under terrenget', l.punkter.every((p, i) => Math.abs(p.z - (T(l.xy[i].x) - 2)) < 1e-9));
  paastand('mellompunktene heter rør:punkt+meter', l.punkter[1].id === 'r1:p1+1');
}
{
  // trykk mot en låst påkobling: overdekningen går lineært fra 3,0 til 2,0
  const bunn = RorPlan.bunnFraTopp(10 - 3.0, VL);
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn }] }), flatt);
  sjekk('trykk: overdekningen midt på er 2,5', 10 - b.linjer[0].punkter[50].z, 2.5, 1e-9);
}
{
  // trykk over et hull i terrenget: rett over
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }]), x => (x > 40 && x < 60 ? NaN : 10 + 0.01 * x));
  const l = b.linjer[0];
  sjekk('over hullet: rett linje mellom kantene', l.punkter[50].z, (8.4 + 8.6) / 2, 1e-9);
}
{
  // sideavstand og fallretning
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE', side: 0.4 }, { kode: 'VL 110PE', side: -0.4, motsatt: true }]), flatt);
  sjekk('sideavstand 0,4 til høyre', b.linjer[0].xy[0].y, -0.4, 1e-12);
  sjekk('og −0,4 til venstre', b.linjer[1].xy[0].y, 0.4, 1e-12);
  paastand('fallretningen følger med linja', b.linjer[1].plan.motsatt === true && b.linjer[0].plan.motsatt === false);
}
{
  // kum: et kontrollpunkt, med bunnløpet der den står
  const p = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1200 }] });
  const b = bygg(p, flatt);
  const k = b.kummer[0];
  paastand('kummen kommer ut med bunnløp, terreng og diameter', k && k.id === 'k1' && k.diameter === 1200
    && Math.abs(k.bunnlop - RorPlan.bunnFraTopp(8, SP)) < 1e-9 && k.terreng === 10 && k.x === 50);
  paastand('og den er et kontrollpunkt', b.kontroll.some(c => c.punkt === 'p2' && c.kum === 'k1'));
}
{
  // greining: rør med samme kode følger høyden til hovedrøret i punktet
  const p = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 50 }, { id: 'p3', lat: 0, lon: 100 }] },
      { id: 't2', punkter: [{ id: 'p4', lat: 0, lon: 50 }, { id: 'p5', lat: 40, lon: 50 }] }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 }, { id: 'r2', trase: 't2', kode: 'SP 160PE', side: 0 }],
    laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 6.5 }],
    greiner: [{ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p2' } }]
  });
  const b = bygg(p, flatt);
  const hoved = b.linjer.find(l => l.id === 'r1'), grein = b.linjer.find(l => l.id === 'r2');
  sjekk('greina begynner på høyden til hovedrøret', grein.punkter[0].z, hoved.punkter[1].z, 1e-9);
  paastand('og kontrollpunktet sier hvor høyden kommer fra', b.kontroll.some(c => c.ror === 'r2' && c.fra === 'r1'));
  p.ror.reverse();
  sjekk('rekkefølgen i lista betyr ingenting', bygg(p, flatt).linjer.find(l => l.id === 'r2').punkter[0].z, hoved.punkter[1].z, 1e-9);
  p.greiner.push({ trase: 't1', ende: 'start', til: { trase: 't2', punkt: 'p5' } });
  const sirkel = bygg(p, flatt);
  paastand('greiner i sirkel: begge rørene regnes, og merknaden sier fra',
    sirkel.linjer.length === 2 && sirkel.merknader.some(m => m.type === 'grein'));
}
{
  // et rør uten dimensjon, og et rør uten terreng ennå
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'RØR' }, { kode: 'SP 160PE' }]);
  const b = bygg(p, () => NaN);
  paastand('uten dimensjon og uten terreng: ingen linjer, men tegnes', b.linjer.length === 0
    && b.utenHoyde.length === 2 && b.utenHoyde.some(u => u.grunn === 'dimensjon') && b.utenHoyde.some(u => u.grunn === 'terreng'));
  paastand('merknaden sier hvilken kode som mangler dimensjon', b.merknader.some(m => m.type === 'dimensjon' && /RØR/.test(m.tekst)));
}
{
  // terreng som mangler under et fritt kontrollpunkt: nærmeste terreng langs røret
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), x => (x < 5 ? NaN : 10));
  sjekk('terreng hentet langs røret', b.linjer[0].punkter[0].z, 8, 1e-9);
}
{
  // påkobling: den låste høyden står, men merknaden sier fra når kilden er endret eller borte
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5, kilde: { anlegg: 'a1', punkt: 'X1', topp: 7.7 } }] });
  paastand('påkobling som er lik: ingen merknad', !bygg(p, flatt, { innmalt: () => 7.7 }).merknader.some(m => m.type === 'pakobling'));
  paastand('endret: merknad', bygg(p, flatt, { innmalt: () => 7.9 }).merknader.some(m => m.type === 'pakobling'));
  paastand('borte: merknad', bygg(p, flatt, { innmalt: () => null }).merknader.some(m => m.type === 'pakobling'));
  paastand('påkoblingen er et møte, ikke et kryss', bygg(p, flatt).moter.length === 1);
}
{
  // en kode som er slått av i kodetabellen, er ikke med
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt,
    { koder: { 'SP 160PE': Object.assign({}, SP, { vis: false }) } });
  paastand('«Med» slått av: røret er ikke med', b.linjer.length === 0 && b.utenHoyde.length === 0);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
