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
  /* Grøftejusteringene peker på rør:punkt også etter at punktet er slettet.
     Fikk et nytt punkt den samme id-en, gjaldt den gamle justeringen – fjell
     på en strekning ingen hadde markert. Id-ene de peker på, er brukt. */
  const groft = { strekninger: [{ fra: 'r1:p3', til: 'r4:p5' }], sammen: [['r1:p6', 'r7:p8+2']] };
  const medGroft = RorPlan.alleIder(plan, groft);
  paastand('id-ene grøftejusteringene peker på, er brukt', ['p3', 'p5', 'r4', 'p6', 'r7', 'p8'].every(x => medGroft.has(x))
    && !medGroft.has('p8+2'));
  paastand('så et nytt punkt får en id ingen justering peker på', RorPlan.nyId(medGroft, 'p') === 'p4'
    && RorPlan.nyId(medGroft, 'r') === 'r2');
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

console.log('\n4. Kontrollene');
{
  // overdekning: selvfall rett mellom to låste ender, terrenget har en dump midt på
  const topp8 = RorPlan.bunnFraTopp(8, SP);
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: topp8 }, { ror: 'r1', punkt: 'p2', bunn: topp8 }] });
  const T = x => (x >= 40 && x <= 60 ? 9 : 10);
  const od = RorPlan.kontroller({ bygg: bygg(p, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] })
    .filter(v => v.type === 'overdekning');
  paastand('overdekning: ett strekk i dumpa', od.length === 1, JSON.stringify(od));
  sjekk('fra', od[0].fra, 40, 1e-9);
  sjekk('til', od[0].til, 60, 1e-9);
  paastand('teksten sier hvor lite, og grensen', /1,00 m/.test(od[0].tekst) && /2,00 m/.test(od[0].tekst), od[0].tekst);
}
{
  // fall: motfall, for lite, for mye, og fallretningen snudd
  const fall = (b0, b1, ekstra = {}, koder = {}) => RorPlan.kontroller({
    bygg: bygg(plan1([[0, 0], [100, 0]], [Object.assign({ kode: 'SP 160PE' }, ekstra)],
      { laast: [{ ror: 'r1', punkt: 'p1', bunn: b0 }, { ror: 'r1', punkt: 'p2', bunn: b1 }] }), flatt, { koder }),
    koder, mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] });
  paastand('motfall', fall(7.0, 7.2).some(v => v.type === 'motfall'));
  paastand('fall under 10 ‰', fall(7.3, 7.0).some(v => v.type === 'fall' && /3,0 ‰/.test(v.tekst)));
  paastand('nok fall: ingen varsel', !fall(8.5, 7.0).some(v => v.type === 'fall' || v.type === 'motfall'));
  const maks = { 'SP 160PE': Object.assign({}, SP, { maksFall: 4, minFall: 0 }) };
  paastand('over største fall', fall(7.5, 7.0, {}, maks).some(v => v.type === 'fall' && /over 4,0 ‰/.test(v.tekst)));
  paastand('fallretningen snudd: motfallet er borte', !fall(7.0, 7.2, { motsatt: true }).some(v => v.type === 'motfall'));
  paastand('trykk sjekkes ikke for fall', !fall(7.0, 7.2, { regel: 'trykk' }).some(v => v.type === 'motfall' || v.type === 'fall'));
  /* Høydene låses på hel millimeter. 10 ‰ over 40,35 m er 403,5 mm – lagret
     som 403 mm er det 9,99 ‰, og «fall 10,0 ‰ – under 10,0 ‰» er tull. */
  const spenn = (L, b0, b1) => RorPlan.kontroller({
    bygg: bygg(plan1([[0, 0], [L, 0]], [{ kode: 'SP 160PE' }],
      { laast: [{ ror: 'r1', punkt: 'p1', bunn: b0 }, { ror: 'r1', punkt: 'p2', bunn: b1 }] }), flatt),
    koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] }).filter(v => v.type === 'fall' || v.type === 'motfall');
  paastand('millimeteravrunding er ikke for lite fall', spenn(40.35, 7.0, 6.597).length === 0, JSON.stringify(spenn(40.35, 7.0, 6.597)));
  paastand('på et kort strekk er en millimeter mer enn en promille', spenn(2, 7.0, 6.981).length === 0);
  paastand('men for lite fall er fortsatt for lite', spenn(2, 7.0, 6.985).some(v => v.type === 'fall'));
}
{
  /* TRYKKRØR: HØYBREKK, LAVBREKK OG FALL. Brekkene finnes med terskel, så en
     tue ikke er et brekk; endene teller ikke. */
  const B = (z, h = 0.3) => RorPlan.brekk(z, h).map(p => p.type + p.i).join(',');
  paastand('en kolle: ett høybrekk på toppen', B([0, 0.1, 0.2, 1, 0.2, 0.1, 0]) === 'hoy3', B([0, 0.1, 0.2, 1, 0.2, 0.1, 0]));
  paastand('en dal: ett lavbrekk i bunnen', B([1, 0.5, 0, 0.5, 1]) === 'lav2');
  paastand('tuer under terskelen er ingen brekk', B([0, 0.1, 0, 0.12, 0.02, 0.1, 0]) === '');
  paastand('jevn stigning: ingen brekk – endene teller ikke', B([0, 1, 2, 3]) === '');
  paastand('topp, dal, topp', B([0, 1, 0, 1, 0]) === 'hoy1,lav2,hoy3', B([0, 1, 0, 1, 0]));
  paastand('et hull i høydene hoppes over', B([0, NaN, 1, NaN, 0]) === 'hoy2', B([0, NaN, 1, NaN, 0]));
  paastand('en dal rett etter starten teller når starten lå over den', B([1, 0, 1.2, 1.4]) === 'lav1', B([1, 0, 1.2, 1.4]));
  paastand('en liten tue før et stort fall er ikke et høybrekk', B([0, 0.1, -1, 0]) === 'lav2', B([0, 0.1, -1, 0]));
  paastand('et flatt topp er et brekk midt på', B([0, 1, 1, 1, 1, 1, 0]) === 'hoy3', B([0, 1, 1, 1, 1, 1, 0]));
  paastand('en flat dal likeså', B([1, 0, 0, 0, 1]) === 'lav2', B([1, 0, 0, 0, 1]));
  paastand('terskel 0: starten er fortsatt ikke et brekk', B([0, 0, 1], 0) === '', B([0, 0, 1], 0));
  // et tegnet trykkrør over en kolle: ett høybrekk, ved toppen
  const kolle = x => 10 + 3 * Math.exp(-(((x - 50) / 10) ** 2));
  const vl = (T, mal = RorPlan.nyPlanmal(), koder = {}) => RorPlan.kontroller({
    bygg: bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }]), T, { koder, mal }), koder, mal, terrengZ: T, andre: [] });
  const hk = vl(kolle).filter(v => v.type === 'hoybrekk');
  paastand('trykkrør over en kolle: ett høybrekk, ved toppen', hk.length === 1 && Math.abs(hk[0].fra - 50) <= 1, JSON.stringify(hk));
  paastand('  og teksten sier lufting', /høybrekk ved 50 m/.test(hk[0].tekst) && /lufting/.test(hk[0].tekst), hk[0].tekst);
  const dal = vl(x => 10 - 3 * Math.exp(-(((x - 50) / 10) ** 2))).filter(v => v.type === 'lavbrekk');
  paastand('trykkrør gjennom en dal: ett lavbrekk', dal.length === 1 && /tømmes/.test(dal[0].tekst));
  // fallkravet: av som standard, på når anlegget eller koden sier det
  paastand('flatt trykkrør uten krav: ingen merknad', !vl(flatt).some(v => v.type === 'fall'));
  const malF = Object.assign(RorPlan.nyPlanmal(), { trykkMinFall: 2 });
  const flatF = vl(flatt, malF).filter(v => v.type === 'fall');
  paastand('flatt trykkrør med krav 2 ‰: merknad om flatt strekk', flatF.length === 1 && /flatt – 0,0 ‰/.test(flatF[0].tekst)
    && /under 2,0 ‰/.test(flatF[0].tekst), JSON.stringify(flatF));
  const helning = x => 10 + x * 0.005;     // 5 ‰ jevnt
  paastand('5 ‰ jevnt med krav 2 ‰: ingen merknad', !vl(helning, malF).some(v => v.type === 'fall'));
  // retningen spiller ingen rolle: begge sider av kollen er bratte, opp og ned
  paastand('bratt opp og ned en kolle med krav 2 ‰: ingen merknad', !vl(kolle, malF).some(v => v.type === 'fall'),
    JSON.stringify(vl(kolle, malF).filter(v => v.type === 'fall')));
  const kodeKrav = { 'VL 110PE': Object.assign({}, VL, { minFall: 8 }) };
  paastand('kodens minste fall går foran anleggets', vl(helning, malF, kodeKrav).some(v => v.type === 'fall' && /under 8,0 ‰/.test(v.tekst)));
  // et selvfallsrør satt til trykk tar ikke med seg selvfallskravet (10 ‰) – anleggets 2 ‰ gjelder
  const spKoder = { 'SP 160PE': Object.assign({}, SP, { minFall: 10 }) };
  const spTrykk = RorPlan.kontroller({ bygg: bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE', regel: 'trykk' }]), helning,
    { koder: spKoder, mal: malF }), koder: spKoder, mal: malF, terrengZ: helning, andre: [] });
  paastand('selvfallskode satt til trykk: anleggets krav for trykk gjelder, ikke kodens 10 ‰',
    !spTrykk.some(v => v.type === 'fall'), JSON.stringify(spTrykk.filter(v => v.type === 'fall')));
  // terskelen fra anlegget: 4 m er mer enn kollen stikker opp
  paastand('terskelen kan settes: med 4 m er kollen ikke et brekk',
    !vl(kolle, Object.assign(RorPlan.nyPlanmal(), { brekk: 4 })).some(v => v.type === 'hoybrekk'));
  /* Et selvfallsrør med en låst topp midt på får ingen brekk – det har
     fallkravet sitt, og motfallet sier fra. */
  const spTopp = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { laast: [{ ror: 'r1', punkt: 'p2', bunn: 9.0 }] });
  const sp = RorPlan.kontroller({ bygg: bygg(spTopp, flatt), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] });
  paastand('selvfall med en topp: motfall, men ingen høybrekk', sp.some(v => v.type === 'motfall')
    && !sp.some(v => v.type === 'hoybrekk' || v.type === 'lavbrekk'), JSON.stringify(sp.map(v => v.type)));
  sjekk('standarden: 0,3 m', RorPlan.StandardPlanmal.brekk, 0.3, 0);
  paastand('grensene: under 0,05 m avvises', RorPlan.klem('brekk', 0.01) === null && RorPlan.klem('brekk', '0,5') === 0.5);
}
{
  /* Påkoblingen: SP (+0,4 m) er koblet på en innmålt hovedledning som går
     tvers over enden av traseen, og OV (−0,4 m) ligger ved siden av i samme
     grøft. Møtet gjelder hele traseen, som for en grein – med 0,5 m rundt
     rørets eget punkt sto det «OV treffer SP (Innmålt)» der ingen krysser. */
  const p = plan1([[0, 0], [50, 0]], [{ kode: 'SP 160PE', side: 0.4 }, { kode: 'OV 160PVC', side: -0.4 }],
    { laast: [{ ror: 'r1', punkt: 'p2', bunn: RorPlan.bunnFraTopp(8.0, SP), kilde: { anlegg: 'a', punkt: 'm', topp: 8.0 } }] });
  const kr = RorPlan.kontroller({ bygg: bygg(p, flatt), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt,
    andre: [{ id: 'x', kode: 'SP 160PE', D: 0.16, xy: [{ x: 50, y: -20 }, { x: 50, y: 20 }], topp: [8.0, 8.0], navn: 'Innmålt' }] })
    .filter(v => v.type === 'kryss');
  paastand('påkoblingen gjelder hele traseen – røret ved siden av krysser ikke', kr.length === 0, JSON.stringify(kr.map(v => v.tekst)));
}
{
  /* To rør i samme trase med samme sideavstand ligger oppå hverandre – og
     strekker som går parallelt, krysser aldri. «Nytt rør» foreslår side 0
     hver gang, så det skjer lett, og ingenting sa fra. */
  const opp = (s1, s2) => RorPlan.kontroller({ bygg: bygg(plan1([[0, 0], [50, 0]],
    [{ kode: 'SP 160PE', side: s1 }, { kode: 'VL 110PE', side: s2 }]), flatt), koder: {}, mal: RorPlan.nyPlanmal(),
    terrengZ: flatt, andre: [] }).filter(v => v.type === 'kryss');
  paastand('rør oppå hverandre i samme trase varsles', opp(0, 0).length === 1 && /oppå hverandre/.test(opp(0, 0)[0].tekst),
    JSON.stringify(opp(0, 0).map(v => v.tekst)));
  paastand('også når de overlapper litt', opp(0.4, 0.3).length === 1);
  paastand('men ikke når de ligger ved siden av hverandre', opp(0.4, -0.4).length === 0);
}
{
  // kryssing: et planlagt rør (topp 8,0, bunn 7,84) over et innmålt med kjent høyde
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const kr = toppB => RorPlan.kontroller({ bygg: b, koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt,
    andre: [{ id: 'x', kode: '110PE', D: 0.11, xy: [{ x: 50, y: -20 }, { x: 50, y: 20 }], topp: [toppB, toppB], navn: 'Innmålt' }] })
    .filter(v => v.type === 'kryss');
  paastand('klaring 0,24 m: varsel', kr(7.6).length === 1 && /0,24 m/.test(kr(7.6)[0].tekst), JSON.stringify(kr(7.6)));
  paastand('klaring 0,84 m: ingen', kr(7.0).length === 0);
  paastand('rørene treffer hverandre', kr(7.9).length === 1 && /treffer/.test(kr(7.9)[0].tekst));
  sjekk('varselet står i krysset', kr(7.6)[0].x, 50, 1e-9);
  // en grein som møter hovedrøret, er ikke et kryss – heller ikke når koden er en annen
  const g = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 100 }] },
      { id: 't2', punkter: [{ id: 'p3', lat: 0, lon: 50 }, { id: 'p4', lat: 30, lon: 50 }] }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 }, { id: 'r2', trase: 't2', kode: 'VL 110PE', side: 0 }],
    greiner: [{ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p1' } }]
  });
  paastand('en grein som møter hovedrøret, er ikke et kryss', !RorPlan.kontroller({ bygg: bygg(g, flatt), koder: {},
    mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] }).some(v => v.type === 'kryss'));
  // og en ekte T: greina festet midt på hovedrøret, som går videre forbi den
  const T = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p5', lat: 0, lon: 50 }, { id: 'p2', lat: 0, lon: 100 }] },
      { id: 't2', punkter: [{ id: 'p3', lat: 0, lon: 50 }, { id: 'p4', lat: 30, lon: 50 }] }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 }, { id: 'r2', trase: 't2', kode: 'VL 110PE', side: 0 }],
    greiner: [{ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p5' } }]
  });
  const kT = RorPlan.kontroller({ bygg: bygg(T, flatt), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] })
    .filter(v => v.type === 'kryss');
  paastand('en grein midt på hovedrøret – en T – er ikke et kryss', kT.length === 0, JSON.stringify(kT.map(v => v.tekst)));
}
{
  // fjell fra grøfta: en opplysning per rør
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const pr = [];
  for (let s = 0; s <= 100; s++) pr.push({ s, gravebunn: 7.69, fjell: s >= 20 && s < 50 ? 8.5 : null });
  const f = RorPlan.fjell({ profiler: new Map([['r1', pr]]), perLinje: new Map([['r1', { sprengning: 24.6 }]]) }, b);
  paastand('fjell: lengde og sprengning', f.length === 1 && /30 m/.test(f[0].tekst) && /25 m³/.test(f[0].tekst), JSON.stringify(f));
}

console.log('\n5. Plandelen i prosjektfila');
{
  const Prosjektform = require(js('prosjektform.js'));
  const P = Prosjektform.klargjor({ navn: 'p', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror',
    mal: { plan: { overdekning: '2,4', kryssKlaring: -1, kum: { diameter: 50 } } },
    ror: { punkter: [], koder: { 'SP 160PE': { dim: 160, form: 'linje', gods: 'x', minFall: '12', regel: 'tull' } },
      plan: {
        traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 58.1, lon: 7.0 }, { id: 'p2', lat: '58,2', lon: 7.1 }, { id: 'p3', lat: 99, lon: 7 }] },
          { id: 't2', punkter: [{ id: 'p4', lat: 58, lon: 7 }] }, null],
        ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 40, regel: 'trykk', motsatt: 'ja' },
          { id: 'r2', trase: 't9', kode: 'VL 110PE' }, { id: 'r3', trase: 't1', kode: '' }],
        kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 9000 }, { id: 'k2', ror: 'r1', punkt: 'p9' }],
        laast: [{ ror: 'r1', punkt: 'p1', bunn: '7,5', kilde: { anlegg: 'a2', punkt: 'X', topp: 7.7 } },
          { ror: 'r1', punkt: 'p1', bunn: 'x' }],
        greiner: [{ trase: 't1', ende: 'midt', til: { trase: 't2', punkt: 'p4' } }]
      } } }] });
  const a = P.anlegg[0], pl = a.ror.plan;
  paastand('traser med for få gyldige punkt tas bort, og punkt utenfor kloden',
    pl.traseer.length === 1 && pl.traseer[0].punkter.length === 2);
  sjekk('tekst med komma blir tall', pl.traseer[0].punkter[1].lat, 58.2, 1e-12);
  paastand('rør uten trase eller kode tas bort', pl.ror.length === 1 && pl.ror[0].id === 'r1');
  paastand('sideavstanden klemmes, regel og retning ryddes',
    pl.ror[0].side === 10 && pl.ror[0].regel === 'trykk' && pl.ror[0].motsatt === false);
  paastand('kum som ikke treffer, tas bort; diameteren klemmes', pl.kummer.length === 1 && pl.kummer[0].diameter === 3000);
  paastand('låst høyde: én per punkt, med kilde', pl.laast.length === 1 && pl.laast[0].bunn === 7.5 && pl.laast[0].kilde.topp === 7.7);
  paastand('grein med ugyldig ende tas bort', pl.greiner.length === 0);
  paastand('planmalen klemmes og får standarden', a.mal.plan.overdekning === 2.4 && a.mal.plan.kryssKlaring === 0.3
    && a.mal.plan.kum.diameter === 1000 && a.mal.plan.kum.arbeidsrom === 0.5, JSON.stringify(a.mal.plan));
  // avviket mot innmålt: en fil fra før etappe 3c har det ikke – knappen er av, toleransene er standarden
  const av = a.mal.plan.avvik;
  paastand('en fil uten avviket får det av, med standardtoleransene', !!av && av.vis === false && av.plan === 0.1
    && av.selvfall === 0.03 && av.trykk === 0.1 && av.sok === 1, JSON.stringify(av));
  const P2 = Prosjektform.klargjor({ navn: 'p', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror',
    mal: { plan: { avvik: { vis: 'ja', plan: '0,05', selvfall: 0.001, trykk: 9, sok: 'x' } } },
    ror: { punkter: [], koder: {}, plan: { traseer: [] } } }] });
  const av2 = P2.anlegg[0].mal.plan.avvik;
  paastand('avviket ryddes: bare true er på, komma godtas, for lite blir standarden, for mye klemmes',
    av2.vis === false && av2.plan === 0.05 && av2.selvfall === 0.03 && av2.trykk === 2 && av2.sok === 1, JSON.stringify(av2));
  const P3 = Prosjektform.klargjor({ navn: 'p', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror',
    mal: { plan: { avvik: { vis: true, plan: 0.2, selvfall: 0.05, trykk: 0.15, sok: 2 } } },
    ror: { punkter: [], koder: {}, plan: { traseer: [] } } }] });
  paastand('og et gyldig avvik står seg', JSON.stringify(P3.anlegg[0].mal.plan.avvik)
    === JSON.stringify({ vis: true, plan: 0.2, selvfall: 0.05, trykk: 0.15, sok: 2 }), JSON.stringify(P3.anlegg[0].mal.plan.avvik));
  const k = a.ror.koder['SP 160PE'];
  paastand('kodefeltene ryddes', !('gods' in k) && k.minFall === 12 && !('regel' in k), JSON.stringify(k));
  const Q = Prosjektform.klargjor({ navn: 'q', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror', ror: { punkter: [] } }] });
  paastand('et innmålt anlegg får ingen plan', !('plan' in Q.anlegg[0].ror) && !('plan' in Q.anlegg[0].mal));
  // «lagt» av knappen står seg – men en påkobling er aldri lagt, og bare true teller
  const P4 = Prosjektform.klargjor({ navn: 'p', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror', ror: { punkter: [], koder: {},
    plan: { traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 58.1, lon: 7 }, { id: 'p2', lat: 58.2, lon: 7 }, { id: 'p3', lat: 58.3, lon: 7 }] }],
      ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE' }],
      laast: [{ ror: 'r1', punkt: 'p1', bunn: 7, lagt: true }, { ror: 'r1', punkt: 'p2', bunn: 7, lagt: true, kilde: { anlegg: 'x', punkt: 'y', topp: 7.2 } },
        { ror: 'r1', punkt: 'p3', bunn: 7, lagt: 'ja' }] } } }] });
  const l4 = P4.anlegg[0].ror.plan.laast;
  paastand('«lagt» står seg, men ikke på en påkobling, og bare som true', l4[0].lagt === true && !('lagt' in l4[1]) && !('lagt' in l4[2]),
    JSON.stringify(l4));
}

console.log('\n6. Fallet fra–til');
{
  const p = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn: 8.0 },
    { ror: 'r1', punkt: 'p2', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 7.4 }] });
  const b = bygg(p, flatt);
  const f = RorPlan.fallSpenn(b.kontroll, b.linjer[0]);
  sjekk('minste fall', f.min, 2, 1e-9);
  sjekk('største fall', f.maks, 10, 1e-9);
  paastand('trykk har ikke fall', RorPlan.fallSpenn(b.kontroll, Object.assign({}, b.linjer[0], {
    plan: Object.assign({}, b.linjer[0].plan, { regel: 'trykk' }) })) === null);
  // snudd: fallet regnes i fallretningen, så det samme røret har motfall
  const s = RorPlan.fallSpenn(b.kontroll, Object.assign({}, b.linjer[0], {
    plan: Object.assign({}, b.linjer[0].plan, { motsatt: true }) }));
  paastand('snudd rør: motfall gir negativt fall', s.min === -10 && Math.abs(s.maks + 2) < 1e-9, JSON.stringify(s));
}

console.log('\n7. Høydene lagt på knapp');
{
  const LH = RorPlan.leggHoyder;
  // en li som faller 2 ‰, overdekning 2 m, kravet 10 ‰: fra taket i toppen, så 10 ‰
  const li = []; for (let s = 0; s <= 100; s++) li.push({ s, U: 20 - 0.002 * s - 2 });
  const a = LH({ s: [0, 50, 100], fast: [null, null, null], prover: li, minFall: 10 });
  paastand('jevn li: øverst under taket, så minste fall', !a.feil && a.topp.map(v => v.toFixed(2)).join(' ') === '18.00 17.50 17.00',
    JSON.stringify(a));
  // en dump på 2 m ved 25–35 m: linja fra start må under den – det beste er minste fall og så høyt som mulig
  const dump = []; for (let s = 0; s <= 100; s++) dump.push({ s, U: 20 - (Math.abs(s - 30) < 5 ? 2 : 0) - 2 });
  const d = LH({ s: [0, 50, 100], fast: [null, null, null], prover: dump, minFall: 10 });
  paastand('en dump midt i et strekk: linja holder seg under den', !d.feil && d.topp.map(v => v.toFixed(2)).join(' ') === '16.26 15.76 15.26',
    JSON.stringify(d));
  const u = LH({ s: [0, 50, 100], fast: [null, null, 18.5], prover: li, minFall: 10 });
  paastand('en låst ende for høyt: ingen profil, og hvor det stopper', u.feil === 'ingen profil oppfyller kravene' && u.fra === 50 && u.til === 100,
    JSON.stringify(u));
  const m = LH({ s: [0, 50, 100], fast: [null, null, null], prover: li, minFall: 10, motsatt: true });
  paastand('fallet mot starten: øverst i slutten', !m.feil && m.topp.map(v => v.toFixed(2)).join(' ') === '16.80 17.30 17.80', JSON.stringify(m));
  // bratt li (50 ‰) med største fall 20 ‰: røret kan ikke følge den
  const bratt = []; for (let s = 0; s <= 100; s++) bratt.push({ s, U: 20 - 0.05 * s - 2 });
  const b = LH({ s: [0, 50, 100], fast: [null, null, null], prover: bratt, minFall: 10, maksFall: 20 });
  const fall = (i, j) => 1000 * (b.topp[i] - b.topp[j]) / 50;
  paastand('største fall holdes', !b.feil && fall(0, 1) <= 20 + 1e-6 && fall(1, 2) <= 20 + 1e-6, JSON.stringify(b));
  paastand('  og røret ligger under taket hele veien', !b.feil && bratt.every(p => {
    const i = p.s <= 50 ? 0 : 1, uu = (p.s - (i ? 50 : 0)) / 50;
    return b.topp[i] + (b.topp[i + 1] - b.topp[i]) * uu <= p.U + 1e-9;
  }));
  const f = LH({ s: [0, 50, 100], fast: [null, 17.2, null], prover: li, minFall: 10 });
  paastand('et fast punkt står', !f.feil && f.topp[1] === 17.2 && f.topp[0] <= 18 && f.topp[2] <= 17.2 - 0.5 + 1e-9, JSON.stringify(f));

  /* MED BYGG: kummen midt på og frie ender. Etter knappen er kontrollene rene,
     og et nytt trykk legger det knappen la sist, på nytt. */
  const T = x => 20 - 0.002 * x;
  const plan = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 }] });
  const foer = RorPlan.kontroller({ bygg: bygg(plan, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] });
  paastand('uten knappen: for lite fall (terrenget faller bare 2 ‰)', foer.some(v => v.type === 'fall'));
  const svar = RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror: 'r1', koder: {}, terrengZ: T });
  paastand('knappen gir de tre frie punktene', !svar.feil && svar.laast.map(x => x.punkt).join(',') === 'p1,p2,p3', JSON.stringify(svar));
  plan.laast.push(...svar.laast.map(x => ({ ror: 'r1', punkt: x.punkt, bunn: x.bunn, lagt: true })));
  const etter = RorPlan.kontroller({ bygg: bygg(plan, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] });
  paastand('etter knappen: ingen merknad om fall eller overdekning', !etter.some(v => v.type === 'fall' || v.type === 'overdekning'),
    JSON.stringify(etter.map(v => v.tekst)));
  const igjen = RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror: 'r1', koder: {}, terrengZ: T });
  paastand('det knappen la, er fritt neste gang', !igjen.feil && igjen.laast.length === 3, JSON.stringify(igjen));
  plan.laast.find(x => x.punkt === 'p2').lagt = false;
  plan.laast.find(x => x.punkt === 'p2').bunn = 17.0;
  const bruker = RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror: 'r1', koder: {}, terrengZ: T });
  paastand('det brukeren låste selv, står', !bruker.feil && bruker.laast.map(x => x.punkt).join(',') === 'p1,p3', JSON.stringify(bruker));
  const trykk = RorPlan.leggHoyderFor({ bygg: bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }]), T), ror: 'r1', koder: {}, terrengZ: T });
  paastand('et trykkrør får ingen høyder lagt', !!trykk.feil && /selvfall/.test(trykk.feil));
  /* en grein: starten henter høyden fra hovedrøret og står – bare enden
     legges. Greinen renner mot hovedrøret, og terrenget stiger 20 ‰ langs den. */
  const TG = (x, y) => 20 - 0.002 * x + 0.02 * y;
  const gplan = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }]);
  gplan.traseer.push({ id: 't2', punkter: [{ id: 'q1', lat: 0, lon: 50 }, { id: 'q2', lat: 40, lon: 50 }] });
  gplan.ror.push({ id: 'r2', trase: 't2', kode: 'SP 160PE', side: 0, regel: null, motsatt: true });
  gplan.greiner.push({ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p2' } });
  const gsvar = RorPlan.leggHoyderFor({ bygg: bygg(gplan, TG), ror: 'r2', koder: {}, terrengZ: TG });
  paastand('en grein: starten er hentet fra hovedrøret og står – bare enden legges', !gsvar.feil
    && gsvar.laast.map(x => x.punkt).join(',') === 'q2', JSON.stringify(gsvar));

  // største fall 0 er flatt, som i kontrollen – ikke «ingen grense»
  const flat0 = LH({ s: [0, 50, 100], fast: [null, null, null], prover: li, minFall: 0, maksFall: 0 });
  paastand('største fall 0: røret ligger flatt, under det laveste taket', !flat0.feil
    && flat0.topp.map(v => v.toFixed(2)).join(' ') === '17.80 17.80 17.80', JSON.stringify(flat0));
  const mot = LH({ s: [0, 100], fast: [null, null], prover: li, minFall: 10, maksFall: 5 });
  paastand('største fall under minste: sagt rett ut', /største fall er mindre enn minste/.test(mot.feil || ''), JSON.stringify(mot));
  const sted = LH({ s: [0, 50, 50, 100], fast: [null, null, 17.3456, null], prover: li, minFall: 10, maksFall: 50 });
  paastand('to kontrollpunkt på samme sted: et sprang ned er lov, motfall ikke – heller ikke 5 mm', !sted.feil && sted.topp[2] === 17.3456
    && sted.topp[1] >= 17.3456 - 1e-9, JSON.stringify(sted));
  // taket i det frie punktet er 17,343, det faste står 4,9 mm høyere på samme sted: det er motfall, ikke avrunding
  const lavt = []; for (let s = 0; s <= 100; s++) lavt.push({ s, U: 17.343 });
  const motsprang = LH({ s: [0, 50, 50, 100], fast: [null, null, 17.3449, null], prover: lavt, minFall: 0 });
  paastand('  et fast punkt 4,9 mm over det frie på samme sted: ingen profil', !!motsprang.feil, JSON.stringify(motsprang));
}

console.log('\n7b. Faste punkt, greiner og hvorfor det ikke går');
{
  const LF = (plan, T) => RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror: 'r1', koder: {}, terrengZ: T });
  const kontr = (plan, T) => RorPlan.kontroller({ bygg: bygg(plan, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] });
  const legg = (plan, svar, ror = 'r1') => plan.laast.push(...svar.laast.map(x => ({ ror, punkt: x.punkt, bunn: x.bunn, lagt: true })));
  /* ET FAST PUNKT LITT OVER TAKET: terrenget faller 30 ‰, og starten er låst
     9 mm over overdekningen. Her måtte linja under taket en meter unna, og
     enden havnet 45 cm for dypt. Fasit: enden rett under taket, 2,00 m. */
  const T30 = x => 20 - 0.03 * x;
  const fp = plan1([[0, 0], [50, 0]], [{ kode: 'SP 160PE' }]);
  fp.laast.push({ ror: 'r1', punkt: 'p1', bunn: RorPlan.bunnFraTopp(18.009, SP) });
  const fs = LF(fp, T30);
  const enden = fs.feil ? NaN : RorPlan.toppFraBunn(fs.laast[0].bunn, SP);
  sjekk('et fast punkt 9 mm over taket: enden rett under taket likevel', T30(50) - enden, 2.0, 0.0011);
  // to faste punkt etter hverandre gir linja selv – den hindrer ikke resten
  const to = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 }] });
  to.laast.push({ ror: 'r1', punkt: 'p1', bunn: 17.5 }, { ror: 'r1', punkt: 'p2', bunn: 17.5 });
  const tos = LF(to, () => 20);
  paastand('to låste etter hverandre uten fall: den frie enden legges likevel', !tos.feil && tos.laast.map(x => x.punkt).join(',') === 'p3',
    JSON.stringify(tos));

  /* KUMMEN TATT BORT: det knappen la i den, er ikke lenger et kontrollpunkt. */
  const kp = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 }] });
  const Tk = x => 20 - 0.002 * x;
  legg(kp, LF(kp, Tk));
  kp.kummer = [];
  paastand('kummen tatt bort: høyden knappen la der, gjelder ikke',
    bygg(kp, Tk).kontroll.filter(c => c.ror === 'r1').map(c => c.punkt).join(',') === 'p1,p3');
  paastand('  og neste trykk legger bare endene', LF(kp, Tk).laast.map(x => x.punkt).join(',') === 'p1,p3');
  kp.laast.find(x => x.punkt === 'p2').lagt = false;
  paastand('  men en høyde låst for hånd er et kontrollpunkt uten kum', bygg(kp, Tk).kontroll.filter(c => c.ror === 'r1').length === 3);

  /* GREINER. Flatt terreng på 20; hovedrøret renner mot slutten, greina
     (40 m) inn i det 10 m fra starten. Lagt alene ligger hovedrøret 17,90 der –
     greina må opp 0,40 m til 18,30, over taket på 18,00. Fasit med greina:
     møtet høyst 17,60, så hovedrøret 17,70 → 16,70 (minste fall), og greina
     18,00 i enden. */
  const T20 = () => 20;
  const gr = plan1([[0, 0], [10, 0], [100, 0]], [{ kode: 'SP 160PE' }]);
  const alene = LF(gr, T20);
  sjekk('hovedrøret alene: starten rett under taket', RorPlan.toppFraBunn(alene.laast[0].bunn, SP), 18.0, 0.0011);
  gr.traseer.push({ id: 't2', punkter: [{ id: 'q1', lat: 0, lon: 10 }, { id: 'q2', lat: 40, lon: 10 }] });
  gr.ror.push({ id: 'r2', trase: 't2', kode: 'SP 160PE', side: 0, regel: null, motsatt: true });
  gr.greiner.push({ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p2' } });
  const hoved = LF(gr, T20);
  paastand('med greina: hovedrøret holdes under det greina tåler', !hoved.feil && hoved.greiner === 1, JSON.stringify(hoved));
  sjekk('  starten', RorPlan.toppFraBunn(hoved.laast[0].bunn, SP), 17.70, 0.0011);
  sjekk('  enden', RorPlan.toppFraBunn(hoved.laast[1].bunn, SP), 16.70, 0.0011);
  legg(gr, hoved);
  const grein = RorPlan.leggHoyderFor({ bygg: bygg(gr, T20), ror: 'r2', koder: {}, terrengZ: T20 });
  paastand('  så får greina fall inn i det', !grein.feil && grein.laast.length === 1, JSON.stringify(grein));
  sjekk('  greinas ende rett under taket', grein.feil ? NaN : RorPlan.toppFraBunn(grein.laast[0].bunn, SP), 18.0, 0.0011);
  legg(gr, grein, 'r2');
  paastand('  og ingen merknad om fall eller overdekning på noen av dem',
    !kontr(gr, T20).some(v => v.type === 'fall' || v.type === 'motfall' || v.type === 'overdekning'),
    JSON.stringify(kontr(gr, T20).map(v => v.tekst)));
  // det knappen la i greinas ende mot hovedrøret, gjelder ikke – høyden er hovedrørets
  gr.laast.push({ ror: 'r2', punkt: 'q1', bunn: 12, lagt: true });
  const q1 = bygg(gr, T20).kontroll.find(c => c.ror === 'r2' && c.punkt === 'q1');
  paastand('en lagt høyde i greinas ende: hovedrørets høyde vinner', q1.fra === 'r1' && q1.fraPunkt === 'p2' && Math.abs(q1.topp - 17.60) < 0.002,
    JSON.stringify(q1));
  // hovedrøret låst for hånd i taket: greina kan ikke legges, og svaret sier hvorfor
  for (const x of gr.laast) if (x.ror === 'r1') { x.lagt = false; x.bunn = RorPlan.bunnFraTopp(x.punkt === 'p1' ? 18 : 17, SP); }
  const stengt = RorPlan.leggHoyderFor({ bygg: bygg(gr, T20), ror: 'r2', koder: {}, terrengZ: T20 });
  paastand('hovedrøret låst for høyt: grunnen er greina', stengt.grunn === 'grein' && /fra utløpet og oppover/.test(stengt.feil),
    JSON.stringify(stengt));
  // og hovedrøret selv: det som står fast, står – merknaden sier at greina ikke får fall
  for (const x of gr.laast) if (x.ror === 'r1') x.lagt = true;
  gr.kummer.push({ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 });
  gr.laast.push({ ror: 'r1', punkt: 'p2', bunn: RorPlan.bunnFraTopp(17.9, SP) });
  const merket = LF(gr, T20);
  paastand('en låst kum i møtet: hovedrøret legges uten greina, og det sies fra', !merket.feil
    && /greina ved 10 m får ikke fall inn i en høyde som er låst/.test(merket.merk || ''), JSON.stringify(merket));

  /* HVORFOR. Terrenget stiger 80 ‰ mot fallet: et fritt rør må over 6 m ned. */
  const dyp = LF(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), x => 20 + 0.08 * x);
  paastand('for dypt: grunnen er dybden', dyp.grunn === 'dyp' && /6 m dypere/.test(dyp.feil), JSON.stringify(dyp));
  /* Med starten låst er det likevel dybden: terrenget stiger 70 ‰, og enden
     må 8,5 m under taket. Dobbelt så dypt går – da er det ikke låsen. */
  const dypL = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]);
  dypL.laast.push({ ror: 'r1', punkt: 'p1', bunn: RorPlan.bunnFraTopp(17.5, SP) });
  const dypLs = LF(dypL, x => 20 + 0.07 * x);
  paastand('  også med en låst høyde foran, når dobbelt så dypt går', dypLs.grunn === 'dyp', JSON.stringify(dypLs));
  // fallet mot starten, starten låst 1 m under taket: enden må opp over taket
  const opp = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE', motsatt: true }]);
  opp.laast.push({ ror: 'r1', punkt: 'p1', bunn: 17.0 });
  const opps = LF(opp, T20);
  paastand('en låst høyde som stenger: grunnen er den, med hvor', opps.grunn === 'laast' && opps.fra === 0 && opps.til === 100,
    JSON.stringify(opps));
  opp.laast[0].kilde = { anlegg: 'a1', punkt: 'x1', topp: 17.15 };
  paastand('  er den en påkobling, er grunnen påkoblingen', LF(opp, T20).grunn === 'pakobling');
  const uten = RorPlan.leggHoyderFor({ bygg: bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP' }]), T20), ror: 'r1', koder: {}, terrengZ: T20 });
  paastand('uten dimensjon: sagt rett ut, ikke «prøv igjen»', /ingen dimensjon/.test(uten.feil || ''), JSON.stringify(uten));
  const utenT = RorPlan.leggHoyderFor({ bygg: bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), () => NaN), ror: 'r1', koder: {},
    terrengZ: () => NaN });
  paastand('uten terreng: sagt rett ut', /terrenget mangler/.test(utenT.feil || ''), JSON.stringify(utenT));
  // et hull i terrenget midt på: lagt uten det, og telt
  const hullT = (x, y) => (x > 40 && x < 50 ? NaN : 20 - 0.002 * x);
  const hull = LF(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), hullT);
  paastand('et hull i terrenget: lagt likevel, og hvor mye som mangler', !hull.feil && hull.mangler === 9, JSON.stringify(hull));
}

console.log('\n7d. Nett av greiner, fra utløpet og oppover');
{
  /* Flere traseer, alle SP 160PE, flatt terreng på 20. `nett` setter greinene
     slik «Trase fra fil» gjør det: den som renner ut av et punkt, er roten der,
     og de som renner inn, er greiner av den. */
  const T20 = () => 20;
  const nett = (traseer, greiner) => {
    const p = RorPlan.nyPlan();
    traseer.forEach(([id, pts], i) => {
      p.traseer.push({ id, punkter: pts.map(([x, y], j) => ({ id: id + 'p' + (j + 1), lat: y, lon: x })) });
      p.ror.push({ id: 'r' + (i + 1), trase: id, kode: 'SP 160PE', side: 0, regel: null, motsatt: false });
    });
    for (const [trase, ende, til, punkt] of greiner) p.greiner.push({ trase, ende, til: { trase: til, punkt } });
    return p;
  };
  const trykk = (p, ror) => {
    const svar = RorPlan.leggHoyderFor({ bygg: bygg(p, T20), ror, koder: {}, terrengZ: T20 });
    if (svar.feil) return svar;
    p.laast = p.laast.filter(x => !(x.ror === ror && x.lagt));
    p.laast.push(...svar.laast.map(x => ({ ror, punkt: x.punkt, bunn: x.bunn, lagt: true })));
    return svar;
  };
  const rene = p => RorPlan.kontroller({ bygg: bygg(p, T20), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T20, andre: [] })
    .filter(v => v.type === 'fall' || v.type === 'motfall' || v.type === 'overdekning');
  /* Hovedrøret delt i fire kummer (M1–M4, 50 m hver) og en sidegrein B på
     40 m inn i kummen mellom M2 og M3. Her fikk ingen av de 120 rekkefølgene
     en ren profil: greina ble regnet uten greinene sine. */
  const p = nett([['M1', [[0, 0], [50, 0]]], ['M2', [[50, 0], [100, 0]]], ['M3', [[100, 0], [150, 0]]], ['M4', [[150, 0], [200, 0]]],
    ['B', [[100, 40], [100, 0]]]],
  [['M1', 'slutt', 'M2', 'M2p1'], ['M2', 'slutt', 'M3', 'M3p1'], ['B', 'slutt', 'M3', 'M3p1'], ['M3', 'slutt', 'M4', 'M4p1']]);
  const logg = ['r4', 'r3', 'r2', 'r5', 'r1'].map(r => { const s = trykk(p, r); return r + (s.feil ? ' FEIL ' + s.feil : ''); });
  paastand('hovedrør i kummer med en sidegrein: fra utløpet og oppover, i én runde', logg.every(x => !/FEIL/.test(x)), logg.join(' | '));
  paastand('  og ingen merknad om fall eller overdekning noe sted', !rene(p).length, rene(p).map(v => v.tekst).join(' | '));
  // en kjede på tre, flatt: C er utløpet, B renner i C, A i B
  const k3 = nett([['A', [[0, 0], [60, 0]]], ['B', [[60, 0], [120, 0]]], ['C', [[120, 0], [180, 0]]]],
    [['A', 'slutt', 'B', 'Bp1'], ['B', 'slutt', 'C', 'Cp1']]);
  const k3logg = ['r3', 'r2', 'r1'].map(r => { const s = trykk(k3, r); return r + (s.feil ? ' FEIL ' + s.feil : ''); });
  paastand('en kjede på tre: fra utløpet og oppover', k3logg.every(x => !/FEIL/.test(x)) && !rene(k3).length,
    k3logg.join(' | ') + ' ' + rene(k3).map(v => v.tekst).join(' | '));
  /* Den midterste tegnet MOT strømmen: B starter i C og renner mot starten
     sin. Greina snus når kravet regnes – og kravene fra greinene dens må snus
     med den, ellers står de i feil ende. */
  const mot = nett([['A', [[0, 0], [60, 0]]], ['B', [[120, 0], [60, 0]]], ['C', [[120, 0], [180, 0]]]],
    [['A', 'slutt', 'B', 'Bp2'], ['B', 'start', 'C', 'Cp1']]);
  mot.ror[1].motsatt = true;
  const motlogg = ['r3', 'r2', 'r1'].map(r => { const s = trykk(mot, r); return r + (s.feil ? ' FEIL ' + s.feil : ''); });
  paastand('  med den midterste tegnet mot strømmen likeså', motlogg.every(x => !/FEIL/.test(x)) && !rene(mot).length,
    motlogg.join(' | ') + ' ' + rene(mot).map(v => v.tekst).join(' | '));
  /* ÉN GREIN SOM IKKE GÅR, TAR IKKE DE ANDRE MED SEG. To greiner inn i
     hovedrøret; den andre er låst 5 m ned i enden sin (topp 13,0), så møtet
     må ligge på 12,6 eller lavere – og da må hovedrøret 6,9 m ned i enden. Den
     strengeste slippes, ikke den første; den andre står. */
  const to = nett([['H', [[0, 0], [100, 0], [200, 0]]], ['G1', [[50, 40], [50, 0]]], ['G2', [[150, 40], [150, 0]]]], []);
  to.traseer[0].punkter.splice(1, 1, { id: 'Hp2', lat: 0, lon: 50 }, { id: 'Hp3', lat: 0, lon: 150 });
  to.traseer[0].punkter[3] = { id: 'Hp4', lat: 0, lon: 200 };
  to.greiner.push({ trase: 'G1', ende: 'slutt', til: { trase: 'H', punkt: 'Hp2' } }, { trase: 'G2', ende: 'slutt', til: { trase: 'H', punkt: 'Hp3' } });
  to.laast.push({ ror: 'r3', punkt: 'G2p1', bunn: RorPlan.bunnFraTopp(12.4, SP) });
  const hs = RorPlan.leggHoyderFor({ bygg: bygg(to, T20), ror: 'r1', koder: {}, terrengZ: T20 });
  paastand('en grein som ville trukket røret for dypt, slippes – den strengeste, og det sies hvorfor', !hs.feil && hs.greiner === 2
    && /^greina ved 150 m får ikke fall inn hit uten at røret legges mer enn 6 m dypere/.test(hs.merk || '') && !/ 50 m/.test(hs.merk),
    JSON.stringify(hs));
  to.laast.push(...hs.laast.map(x => ({ ror: 'r1', punkt: x.punkt, bunn: x.bunn, lagt: true })));
  const g1 = RorPlan.leggHoyderFor({ bygg: bygg(to, T20), ror: 'r2', koder: {}, terrengZ: T20 });
  paastand('  den andre greina får fortsatt fall inn', !g1.feil, JSON.stringify(g1));
  // og en grein som ikke får fall uansett – låst 7 m ned – sies som det
  to.laast = to.laast.filter(x => x.ror !== 'r1');
  to.laast.find(x => x.punkt === 'G2p1').bunn = RorPlan.bunnFraTopp(11, SP);
  const ua = RorPlan.leggHoyderFor({ bygg: bygg(to, T20), ror: 'r1', koder: {}, terrengZ: T20 });
  paastand('en grein som ikke får fall uansett: sagt som det', !ua.feil
    && /greina ved 150 m får ikke fall med det som står fast på greina/.test(ua.merk || ''), JSON.stringify(ua));
  /* EN GREIN SOM IKKE TÅLER SIN EGEN GREIN, SKAL LIKEVEL HA FALL INN. A er låst
     på 12,6 og kan møte B på 12,2 – men da må B ned under 6 m i den andre
     enden. B selv kan godt renne inn i hovedrøret; regnet med A så den umulig
     ut, og hovedrøret sa at greina ikke fikk fall. */
  const sub = nett([['H', [[0, 0], [100, 0]]], ['B', [[50, 40], [50, 0]]], ['A', [[90, 40], [50, 40]]]],
    [['B', 'slutt', 'H', 'Hp2'], ['A', 'slutt', 'B', 'Bp1']]);
  sub.traseer[0].punkter.splice(1, 0, { id: 'Hp2', lat: 0, lon: 50 });
  sub.traseer[0].punkter[2].id = 'Hp3';
  sub.laast.push({ ror: 'r3', punkt: 'Ap1', bunn: RorPlan.bunnFraTopp(12.6, SP) });
  const hsub = RorPlan.leggHoyderFor({ bygg: bygg(sub, T20), ror: 'r1', koder: {}, terrengZ: T20 });
  paastand('en grein som ikke tåler sin egen grein, får likevel fall inn', !hsub.feil && !/ 50 m/.test(hsub.merk || ''), JSON.stringify(hsub));
}

console.log('\n7c. Knappen på tilfeldig terreng: ingen merknad etterpå');
{
  /* Knekkpunkt med skjeve avstander, kummer, fallretning og en låst kum
     tilfeldig – terrenget en sum av bølger. Etter knappen skal kontrollen
     ikke ha noe å si om fall eller overdekning. Her fikk hvert niende rør
     merknad: knappen prøvde andre steder enn kontrollen. */
  let frø = 20261006;
  const tilf = () => { frø = (frø * 1103515245 + 12345) % 2147483648; return frø / 2147483648; };
  let lagt = 0, dypt = 0, verst = [];
  for (let k = 0; k < 150; k++) {
    const a1 = tilf() * 3, a2 = tilf() * 1.5, f1 = 0.01 + tilf() * 0.05, f2 = 0.05 + tilf() * 0.3, g = (tilf() - 0.5) * 0.06;
    const T = (x, y) => 20 + g * x + a1 * Math.sin(f1 * x + 0.3 * y) + a2 * Math.sin(f2 * x + 1.1) * Math.cos(0.07 * y);
    const n = 3 + Math.floor(tilf() * 6), pts = [[0, 0]];
    for (let i = 1; i < n; i++) pts.push([pts[i - 1][0] + 3.3 + tilf() * 40, pts[i - 1][1] + (tilf() - 0.5) * 20]);
    const kummer = [];
    for (let i = 1; i < n - 1; i++) if (tilf() < 0.5) kummer.push({ id: 'k' + i, ror: 'r1', punkt: 'p' + (i + 1), diameter: 1000 });
    const plan = plan1(pts, [{ kode: 'SP 160PE', motsatt: tilf() < 0.3 }], { kummer });
    if (kummer.length && tilf() < 0.4) {
      // en kum låst for hånd, et stykke under taket
      const K = kummer[Math.floor(tilf() * kummer.length)], i = +K.punkt.slice(1) - 1;
      plan.laast.push({ ror: 'r1', punkt: K.punkt, bunn: RorPlan.bunnFraTopp(T(pts[i][0], pts[i][1]) - 2 - 0.2 - tilf() * 1.5, SP) });
    }
    const svar = RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror: 'r1', koder: {}, terrengZ: T });
    if (svar.feil) { if (svar.grunn === 'dyp' || svar.grunn === 'laast') dypt++; else verst.push(svar.feil); continue; }
    lagt++;
    plan.laast.push(...svar.laast.map(x => ({ ror: 'r1', punkt: x.punkt, bunn: x.bunn, lagt: true })));
    const v = RorPlan.kontroller({ bygg: bygg(plan, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] })
      .filter(x => x.type === 'fall' || x.type === 'motfall' || x.type === 'overdekning');
    if (v.length) verst.push(v[0].tekst);
  }
  paastand(`${lagt} rør lagt, ${dypt} for dype eller stengt – ingen merknad etter knappen`, !verst.length && lagt >= 100,
    verst.slice(0, 3).join(' | '));

  /* MED GREINER: et hovedrør og én til tre greiner som renner inn – i starten
     eller enden av greina – på skrått og bølgete terreng. Hovedrøret legges
     først, så greinene. Etterpå skal kontrollen ikke ha noe å si, og en grein
     som ikke kan legges, skal hovedrøret alt ha sagt fra om. */
  let rene = 0, merket = 0;
  const galt = [];
  for (let k = 0; k < 120; k++) {
    const a1 = tilf() * 2, f1 = 0.01 + tilf() * 0.04, g = (tilf() - 0.5) * 0.04, gy = (tilf() - 0.5) * 0.04;
    const T = (x, y) => 20 + g * x + gy * y + a1 * Math.sin(f1 * x + 0.2 * y);
    const n = 3 + Math.floor(tilf() * 5), pts = [[0, 0]];
    for (let i = 1; i < n; i++) pts.push([pts[i - 1][0] + 10 + tilf() * 40, pts[i - 1][1] + (tilf() - 0.5) * 10]);
    const plan = plan1(pts, [{ kode: 'SP 160PE', motsatt: tilf() < 0.3 }]);
    for (let i = 1; i < n - 1; i++) if (tilf() < 0.5) plan.kummer.push({ id: 'k' + i, ror: 'r1', punkt: 'p' + (i + 1), diameter: 1000 });
    const nb = 1 + Math.floor(tilf() * 3);
    for (let b = 0; b < nb; b++) {
      const j = Math.floor(tilf() * n), P = pts[j], L = 15 + tilf() * 50, v = tilf() * Math.PI * 2;
      const Q = [P[0] + L * Math.cos(v), P[1] + L * Math.sin(v)], M = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], iStart = tilf() < 0.5;
      const bp = iStart ? [P, M, Q] : [Q, M, P];
      plan.traseer.push({ id: 'g' + b, punkter: bp.map(([x, y], i) => ({ id: 'g' + b + 'p' + (i + 1), lat: y, lon: x })) });
      // greina renner inn i hovedrøret: møtet er enden nedstrøms
      plan.ror.push({ id: 'rg' + b, trase: 'g' + b, kode: 'SP 160PE', side: 0, regel: null, motsatt: iStart });
      plan.greiner.push({ trase: 'g' + b, ende: iStart ? 'start' : 'slutt', til: { trase: 't1', punkt: 'p' + (j + 1) } });
    }
    const leggPaa = ror => {
      const svar = RorPlan.leggHoyderFor({ bygg: bygg(plan, T), ror, koder: {}, terrengZ: T });
      if (!svar.feil) plan.laast.push(...svar.laast.map(x => ({ ror, punkt: x.punkt, bunn: x.bunn, lagt: true })));
      return svar;
    };
    const hoved = leggPaa('r1');
    if (hoved.feil) continue;
    const greiner = plan.ror.slice(1).map(r => leggPaa(r.id));
    if (hoved.merk) { merket++; continue; }
    if (greiner.some(s => s.feil)) { galt.push(`#${k}: en grein feilet uten at hovedrøret sa fra – ${greiner.find(s => s.feil).feil}`); continue; }
    const v = RorPlan.kontroller({ bygg: bygg(plan, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] })
      .filter(x => x.type === 'fall' || x.type === 'motfall' || x.type === 'overdekning');
    if (v.length) galt.push(`#${k}: ${v[0].tekst}`); else rene++;
  }
  paastand(`med greiner: ${rene} nett rene, ${merket} der hovedrøret sa fra – ingen merknad uten forklaring`, !galt.length && rene >= 90,
    galt.slice(0, 3).join(' | '));
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
