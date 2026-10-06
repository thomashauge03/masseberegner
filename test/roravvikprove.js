'use strict';
/**
 * Planlagte rør mot innmålte, mot fasit regnet for hånd.
 *
 *   node test/roravvikprove.js
 *
 * Alt er oppdiktet. «Gradene» i planen er UTM-meter (tilSone gjør lat/lon til
 * n/o rett fram), og de innmålte linjene står i de samme metrene, så fasiten
 * kan regnes med blyant.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
global.Geo = require(js('geo.js'));
global.Ror = require(js('ror.js'));
global.RorPlan = require(js('rorplan.js'));
const RorAvvik = require(js('roravvik.js'));

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

/* ---------------- fiksturen ----------------
   En trase (0,0) → (40,0) → (40,30) fra 500000 / 6500000. Spillvannet ligger
   midt i traseen med bunnen låst i endene: topp 8,0 i starten og 7,3 i enden,
   rett linje – topp = 8,0 − 0,01 · s. Vannet (trykk) ligger 2 m til venstre og
   følger det flate terrenget på 10 med 2,0 m overdekning: topp 8,0 overalt.
   Venstre for retningen +x er +y, så vannet går (0,2) → (38,2) → (38,30). */
const X0 = 500000, Y0 = 6500000, T = () => 10;
const SP_GODS = 0.0145, PVC_GODS = 0.0047;     // SDR 11 for PE, D/34 for resten – se RorPlan.gods
const plan = Object.assign(RorPlan.nyPlan(), {
  traseer: [{ id: 't1', punkter: [[0, 0], [40, 0], [40, 30]].map(([x, y], i) => ({ id: 'p' + (i + 1), lat: Y0 + y, lon: X0 + x })) }],
  ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0, regel: null, motsatt: false },
    { id: 'r2', trase: 't1', kode: 'VL 110PE', side: -2, regel: null, motsatt: false }],
  laast: [{ ror: 'r1', punkt: 'p1', bunn: 8.0 - 0.16 + SP_GODS }, { ror: 'r1', punkt: 'p3', bunn: 7.3 - 0.16 + SP_GODS }]
});
const koder = Ror.koderFra([{ kode: 'SP 160PE' }, { kode: 'VL 110PE' }], {});
const bygg = RorPlan.bygg({ plan, koder, mal: RorPlan.nyPlanmal(), terrengZ: T,
  tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o - X0, y: p.n - Y0 }) });

/** En innmålt linje rett i regnesonen: [id, x, y, topp] per punkt. */
const linje = (kode, pkt) => ({ id: kode + ':' + pkt[0][0], kode,
  punkter: pkt.map(([id, , , z]) => ({ id, kode, z })), xy: pkt.map(([, x, y]) => ({ x, y })) });
const innA = { anlegg: 'aA', navn: 'Innmålt A', koder: Ror.koderFra([{ kode: 'SP160PE' }], {}), linjer: [
  // samme kode med en annen skrivemåte: rett, til høyre, for høyt, til venstre
  linje('SP160PE', [['a1', 0, 0, 8.0], ['a2', 10, -0.05, 7.9], ['a3', 20, 0, 7.85], ['a4', 30, 0.12, 7.7]])
] };
const innB = { anlegg: 'aB', navn: 'Innmålt B',
  koder: Ror.koderFra([{ kode: 'SP 160 PVC' }, { kode: 'VL 160PE' }, { kode: 'VL110PE' }], {}), linjer: [
    // samme system og dimensjon, et annet materiale: på utsiden av knekken, og forbi enden
    linje('SP 160 PVC', [['b1', 40.5, -0.5, 7.6], ['b2', 40.3, 30.6, 7.3]]),
    // et annet system med samme dimensjon, midt oppå spillvannet: ikke det samme røret
    linje('VL 160PE', [['c1', 10, 0, 8.0]]),
    // vannet: for høyt for selvfall, men innenfor for trykk; 1,5 m til siden; langt unna
    linje('VL110PE', [['v1', 5, 2, 8.06], ['v2', 15, 3.5, 8.0], ['v3', 25, 22, 8.0]])
  ] };
const av = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innA, innB] });
const pkt = id => av.punkter.find(p => p.punkt === id);

console.log('\n1. Kodene');
{
  paastand('skrivemåten likestilt', RorAvvik.normKode('sp_160pe') === 'SP 160 PE' && RorAvvik.normKode('SP160PE') === 'SP 160 PE'
    && RorAvvik.normKode('  SP  160 PE ') === 'SP 160 PE', RorAvvik.normKode('sp_160pe'));
  const k = kode => Ror.tolkKode(kode);
  paastand('samme system og dimensjon er samme rør', RorAvvik.likKode('SP 160PE', k('SP 160PE'), 'SP 160 PVC', k('SP 160 PVC')));
  paastand('et annet system med samme dimensjon er ikke det', !RorAvvik.likKode('SP 160PE', k('SP 160PE'), 'VL 160PE', k('VL 160PE')));
  paastand('uten system: bare skrivemåten', RorAvvik.likKode('90PE', k('90PE'), '90 PE', k('90 PE'))
    && !RorAvvik.likKode('90PE', k('90PE'), '90PVC', k('90PVC')));
  paastand('kodetabellen gjelder: et system brukeren har satt, teller', RorAvvik.likKode('SP 160PE', k('SP 160PE'),
    '160 RØR', Object.assign(k('160 RØR'), { system: 'spill' })));
}

console.log('\n2. Sideavviket – med fortegn, + til høyre i tegneretningen');
{
  sjekk('rett på linja', pkt('a1').side, 0, 1e-9);
  sjekk('5 cm til høyre (−y når røret går mot +x)', pkt('a2').side, 0.05, 1e-9);
  sjekk('12 cm til venstre', pkt('a4').side, -0.12, 1e-9);
  sjekk('på utsiden av knekken: avstanden til knekkpunktet', pkt('b1').side, Math.hypot(0.5, 0.5), 1e-9);
  sjekk('forbi enden: vinkelrett på det siste strekket', pkt('b2').side, 0.3, 1e-9);
  sjekk('og hvor langt forbi', pkt('b2').forbi, 0.6, 1e-9);
  sjekk('stasjonen i knekken', pkt('b1').s, 40, 1e-9);
  sjekk('stasjonen forbi enden er enden', pkt('b2').s, 70, 1e-9);
  sjekk('stasjonen midt på et strekk', pkt('a2').s, 10, 1e-9);
}

console.log('\n3. Høydeavviket – bunn innvendig mot bunn innvendig, ved samme stasjon');
{
  sjekk('rett på planen', pkt('a2').hoyde, 0, 1e-9);
  sjekk('5 cm for høyt', pkt('a3').hoyde, 0.05, 1e-9);
  sjekk('planens topp rør ved stasjonen (rett linje mellom punktene)', pkt('a4').toppPlan, 7.7, 1e-9);
  sjekk('planens bunn ved stasjonen', pkt('a4').bunnPlan, 7.7 - 0.16 + SP_GODS, 1e-9);
  // PVC har tynnere gods enn PE: samme topp rør gir lavere bunn innvendig
  sjekk('godset til den innmålte koden: PVC mot PE', pkt('b1').hoyde, PVC_GODS - SP_GODS, 1e-9);
  sjekk('den innmålte bunnen', pkt('b1').bunnInnmalt, 7.6 - 0.16 + PVC_GODS, 1e-9);
  sjekk('trykk: vannet 6 cm for høyt', pkt('v1').hoyde, 0.06, 1e-9);
}

console.log('\n4. Toleransene');
{
  paastand('innenfor i plan og høyde', pkt('a2').ok && !pkt('a2').utenforPlan && !pkt('a2').utenforHoyde);
  paastand('5 cm i høyde er utenfor for selvfall (0,03)', !pkt('a3').ok && pkt('a3').utenforHoyde && !pkt('a3').utenforPlan);
  paastand('12 cm i plan er utenfor (0,10)', !pkt('a4').ok && pkt('a4').utenforPlan && !pkt('a4').utenforHoyde);
  paastand('6 cm i høyde er innenfor for trykk (0,10)', pkt('v1').ok);
  sjekk('graden: det største av avvik / toleranse', pkt('a3').grad, 0.05 / 0.03, 1e-9);
  sjekk('graden for trykk', pkt('v1').grad, 0.06 / 0.10, 1e-9);
  const strengere = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innB],
    toleranse: { plan: 0.10, selvfall: 0.03, trykk: 0.05, sok: 1.0 } });
  paastand('med 0,05 for trykk er vannet utenfor', !strengere.punkter.find(p => p.punkt === 'v1').ok);
  const vid = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innB],
    toleranse: { plan: 0.10, selvfall: 0.03, trykk: 0.10, sok: 2.0 } });
  paastand('med 2 m søkebredde knyttes punktet 1,5 m til siden', !!vid.punkter.find(p => p.punkt === 'v2'));
  paastand('uten toleranser: standarden', av.toleranse.plan === 0.10 && av.toleranse.selvfall === 0.03
    && av.toleranse.trykk === 0.10 && av.toleranse.sok === 1.0);
}

console.log('\n5. Knytningen');
{
  paastand('sju punkt knyttet', av.punkter.length === 7, av.punkter.map(p => p.punkt).join(','));
  paastand('spillvannet får A og PVC-røret, vannet får v1', ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'].every(id => pkt(id).linje === 'r1')
    && pkt('v1').linje === 'r2');
  paastand('et annet system oppå røret knyttes ikke', !pkt('c1'));
  paastand('1,5 m til siden knyttes ikke', !pkt('v2'));
  paastand('punktene på rør med en kode planen har, telles', av.antallInnmalt === 9, String(av.antallInnmalt));
  const r2 = av.perLinje.get('r2');
  paastand('1,5 m til siden telles som nær, 20 m unna gjør ikke', r2.naer === 1, String(r2.naer));
  // to spillvannsrør i samme trase: punktet går til det nærmeste
  const p2 = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: Y0, lon: X0 }, { id: 'p2', lat: Y0, lon: X0 + 20 }] }],
    ror: [{ id: 'ra', trase: 't1', kode: 'SP 160PE', side: 0, regel: null, motsatt: false },
      { id: 'rb', trase: 't1', kode: 'SP 160PE', side: 0.5, regel: null, motsatt: false }]
  });
  const b2 = RorPlan.bygg({ plan: p2, koder, mal: RorPlan.nyPlanmal(), terrengZ: T,
    tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o - X0, y: p.n - Y0 }) });
  const a2 = RorAvvik.sammenlign({ plan: b2.linjer, planKoder: koder,
    innmalt: [{ anlegg: 'x', navn: 'X', koder: innA.koder, linjer: [linje('SP160PE', [['n1', 5, -0.3, 8.0]])] }] });
  paastand('to rør med samme kode: det nærmeste', a2.punkter.length === 1 && a2.punkter[0].linje === 'rb'
    && Math.abs(a2.punkter[0].side + 0.2) < 1e-9, JSON.stringify(a2.punkter.map(p => [p.linje, p.side])));
}

console.log('\n6. Dekningen');
{
  const r1 = av.perLinje.get('r1'), r2 = av.perLinje.get('r2');
  sjekk('spillvannet er 70 m', r1.lengde, 70, 1e-9);
  paastand('ikke innmålt mellom A og PVC-røret: 30–40 m', r1.ikkeInnmalt.length === 1
    && Math.abs(r1.ikkeInnmalt[0].fra - 30) < 1e-9 && Math.abs(r1.ikkeInnmalt[0].til - 40) < 1e-9, JSON.stringify(r1.ikkeInnmalt));
  sjekk('strekket mellom to knyttede nabopunkt dekker planen mellom dem', r1.dekket, 60, 1e-9);
  paastand('ett punkt dekker bare stasjonen sin', r2.ikkeInnmalt.length === 2 && Math.abs(r2.ikkeInnmalt[0].til - 5) < 1e-9
    && Math.abs(r2.ikkeInnmalt[1].fra - 5) < 1e-9 && Math.abs(r2.dekket) < 1e-9, JSON.stringify(r2.ikkeInnmalt));
  // et kort rør med ett punkt midt på: ingen hull på 2 m
  const kort = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: Y0, lon: X0 }, { id: 'p2', lat: Y0, lon: X0 + 3 }] }],
    ror: [{ id: 'rk', trase: 't1', kode: 'SP 160PE', side: 0, regel: null, motsatt: false }]
  });
  const bk = RorPlan.bygg({ plan: kort, koder, mal: RorPlan.nyPlanmal(), terrengZ: T,
    tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o - X0, y: p.n - Y0 }) });
  const ak = RorAvvik.sammenlign({ plan: bk.linjer, planKoder: koder,
    innmalt: [{ anlegg: 'x', navn: 'X', koder: innA.koder, linjer: [linje('SP160PE', [['k1', 1.5, 0, 8.0]])] }] });
  paastand('et kort rør med ett punkt midt på har ingen hull', ak.perLinje.get('rk').ikkeInnmalt.length === 0
    && Math.abs(ak.perLinje.get('rk').dekket - 3) < 1e-9);
  const ingen = RorAvvik.sammenlign({ plan: bk.linjer, planKoder: koder, innmalt: [] });
  paastand('uten et eneste punkt er hele røret ikke innmålt – også når det er kortere enn 2 m',
    ingen.perLinje.get('rk').ikkeInnmalt.length === 1 && ingen.perLinje.get('rk').dekket === 0);
}

console.log('\n7. Per rør og de største avvikene');
{
  const r1 = av.perLinje.get('r1');
  paastand('spillvannet: seks punkt, fire utenfor', r1.antall === 6 && r1.utenfor === 4, `${r1.antall} / ${r1.utenfor}`);
  sjekk('største i plan, med fortegn', r1.maksSide, Math.hypot(0.5, 0.5), 1e-9);
  sjekk('største i høyde, med fortegn', r1.maksHoyde, 0.05, 1e-9);
  paastand('de verste sortert på grad', av.verste.map(p => p.punkt).join(',') === 'b1,b2,a3,a4,v1,a2,a1',
    av.verste.map(p => p.punkt).join(','));
  const rader = RorAvvik.oppsummering(av, bygg.linjer, 1);
  paastand('oppsummeringen følger linjene', rader.length === 2 && rader[0].nr === 1 && rader[0].kode === 'SP 160PE'
    && rader[1].nr === 2 && rader[1].naer === 1);
  sjekk('andelen innmålt', rader[0].andel, 60 / 70, 1e-9);
  const bf = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innA], bakkefaktor: 1.001 });
  sjekk('stasjonen vises som lengde på bakken', bf.punkter.find(p => p.punkt === 'a2').stasjon, 10.01, 1e-9);
  sjekk('men regnes i kartet', bf.punkter.find(p => p.punkt === 'a2').s, 10, 1e-9);
}

console.log('\n8. Merknadene og tekstene');
{
  const tekst = av.merknader.map(m => m.tekst);
  paastand('utenfor toleransen, med de største avvikene', tekst.includes(
    'SP 160PE: 4 av 6 innmålte punkt utenfor toleransen – største avvik +0,05 m i høyde og +0,71 m i plan.'), tekst.join(' | '));
  paastand('strekket som ikke er innmålt', tekst.includes('SP 160PE: ikke innmålt på 30–40 m.'), tekst.join(' | '));
  paastand('nær, men utenfor søkebredden – entall', tekst.includes(
    'VL 110PE: 1 innmålt punkt med samme kode ligger mer enn 1,0 m fra røret – utenfor søkebredden.'), tekst.join(' | '));
  paastand('merknadene hører til røret', av.merknader.every(m => m.type === 'avvik' && ['r1', 'r2'].includes(m.linje)));
  const tom = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [] });
  paastand('ingen innmålte anlegg: én merknad som sier det', tom.merknader.length === 1 && tom.punkter.length === 0
    && /ingen innmålte røranlegg/.test(tom.merknader[0].tekst), tom.merknader.map(m => m.tekst).join(' | '));
  const bom = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder,
    innmalt: [{ anlegg: 'x', navn: 'X', koder: innB.koder, linjer: [innB.linjer[1]] }] });
  paastand('ingen punkt knyttet: én merknad som sier det', bom.merknader.length === 1
    && /ingen innmålte punkt ligger innenfor 1,0 m/.test(bom.merknader[0].tekst), bom.merknader.map(m => m.tekst).join(' | '));
  paastand('fortegnet: +, −, og aldri −0,00', RorAvvik.fortegn(0.054) === '+0,05' && RorAvvik.fortegn(-0.026) === '−0,03'
    && RorAvvik.fortegn(-0.004) === '0,00' && RorAvvik.fortegn(0) === '0,00');
  const t = RorAvvik.punkttekst(pkt('a3'), av.toleranse);
  paastand('punktet i ord: utenfor i høyde', t === 'SP160PE · 20,0 m · plan 0,00 m · høyde +0,05 m · utenfor i høyde (±0,03)', t);
  const t2 = RorAvvik.punkttekst(pkt('b2'), av.toleranse);
  paastand('forbi enden og et annet materiale', t2 === 'SP 160 PVC mot SP 160PE · 70,0 m · plan +0,30 m · høyde −0,01 m'
    + ' · 0,6 m forbi enden · utenfor i plan (±0,10)', t2);
  paastand('innenfor', /· innenfor$/.test(RorAvvik.punkttekst(pkt('a2'), av.toleranse)));
}

console.log('\n9. Knekker, knutepunkt og to anlegg');
{
  // en planlagt linje rett i regnesonen, uten RorPlan – bare formen teller her
  const plan = (id, pkt) => ({ id, kode: 'SP 160PE', xy: pkt.map(([x, y]) => ({ x, y })),
    punkter: pkt.map(() => ({ z: 8 })), plan: { regel: 'selvfall' } });
  const ett = (pl, x, y) => RorAvvik.sammenlign({ plan: [pl], planKoder: koder,
    innmalt: [{ anlegg: 'x', navn: 'X', koder: innA.koder, linjer: [linje('SP160PE', [['q', x, y, 8]])] }] }).punkter[0];
  // 135° venstresving: (0,0) → (40,0) → (30,10). Utsiden av en venstresving er til høyre.
  const skarp = plan('s', [[0, 0], [40, 0], [30, 10]]);
  const p1 = ett(skarp, 40.5, 0.2);
  sjekk('utenfor en skarp venstresving: + (til høyre), selv om punktet er til venstre for linja inn', p1.side, Math.hypot(0.5, 0.2), 1e-9);
  // på forlengelsen av linja inn er tverravstanden null – men punktet står en halv meter ute
  const p2 = ett(plan('v', [[0, 0], [40, 0], [40, 30]]), 40.5, 0);
  sjekk('på forlengelsen av strekket inn i en knekk: avstanden, ikke null', p2.side, 0.5, 1e-9);
  paastand('og det er utenfor toleransen', p2.utenforPlan);
  // høyresving: (0,0) → (40,0) → (40,−30); utsiden er til venstre
  const p3 = ett(plan('h', [[0, 0], [40, 0], [40, -30]]), 40.5, 0.5);
  sjekk('utenfor en høyresving: − (til venstre)', p3.side, -Math.hypot(0.5, 0.5), 1e-9);
  // innsiden av knekken: tverravstanden til strekket punktet står ved
  const p4 = ett(plan('i', [[0, 0], [40, 0], [40, 30]]), 39.8, 0.1);
  sjekk('på innsiden av en venstresving: − (til venstre), tverravstanden', p4.side, -0.1, 1e-9);

  /* Et T-kryss med samme kode: importen deler rørnettet i knuten, og
     knutepunktet er enden på tre linjer. Det skal telles én gang. */
  const T = innA.koder;
  const kryss = { anlegg: 'T', navn: 'T', koder: T, linjer: [
    linje('SP160PE', [['t1', 0, 0, 8.0], ['t2', 10, 0, 7.9], ['t3', 20, 0, 7.8]]),
    linje('SP160PE', [['t3', 20, 0, 7.8], ['t4', 30, 0, 7.7]]),
    linje('SP160PE', [['t3', 20, 0, 7.8], ['t5', 20, 5, 7.8]])
  ] };
  const at = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [kryss] });
  paastand('knutepunktet telles én gang', at.punkter.filter(p => p.punkt === 't3').length === 1
    && at.punkter.length === 4 && at.antallInnmalt === 5, `${at.punkter.map(p => p.punkt).join(',')} / ${at.antallInnmalt}`);
  paastand('og står én gang blant de største', at.verste.filter(p => p.punkt === 't3').length === 1);
  sjekk('dekningen går gjennom knuten: 0–30 m', at.perLinje.get('r1').dekket, 70 - 40, 1e-9);
  // to innmålte anlegg med samme punktnavn er to punkt
  const to = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [
    { anlegg: 'a', navn: 'A', koder: T, linjer: [linje('SP160PE', [['p1', 5, 0, 7.95]])] },
    { anlegg: 'b', navn: 'B', koder: T, linjer: [linje('SP160PE', [['p1', 6, 0, 7.94]])] }] });
  paastand('to anlegg med samme punktnavn er to punkt', to.punkter.length === 2 && to.anlegg.join(',') === 'A,B');
  // «SP 160» sier verken materiale eller gods: planens rør, med planens gods
  const uten = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [
    { anlegg: 'u', navn: 'U', koder: Ror.koderFra([{ kode: 'SP 160' }], {}), linjer: [linje('SP 160', [['u1', 10, 0, 7.9]])] }] });
  sjekk('en innmålt kode uten materiale bruker planens gods', uten.punkter[0].hoyde, 0, 1e-9);
}

console.log('\n10. Toleransene i planmalen');
{
  const m = RorPlan.nyPlanmal();
  paastand('en ny planmal har sin egen kopi av toleransene', m.avvik !== RorPlan.StandardPlanmal.avvik
    && m.avvik.vis === false && m.avvik.plan === 0.10 && m.avvik.selvfall === 0.03 && m.avvik.trykk === 0.10 && m.avvik.sok === 1.0);
  paastand('grensene: tekst med komma, over grensen klemmes, under er en skrivefeil',
    RorPlan.klem('avvikPlan', '0,05') === 0.05 && RorPlan.klem('avvikHoyde', 5) === 2 && RorPlan.klem('sok', 50) === 10
    && RorPlan.klem('avvikPlan', 0.001) === null && RorPlan.klem('sok', 0.05) === null && RorPlan.klem('avvikHoyde', '') === null);
}

console.log('\n11. Tallene i tekstene');
{
  paastand('toleransen med to desimaler – tre når den trenger det', RorAvvik.toleranseTekst(0.1) === '0,10'
    && RorAvvik.toleranseTekst(0.015) === '0,015' && RorAvvik.toleranseTekst(0.03) === '0,03'
    && RorAvvik.toleranseTekst(0.025) === '0,025', RorAvvik.toleranseTekst(0.025));
  const fin = RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innA, innB],
    toleranse: { plan: 0.10, selvfall: 0.025, trykk: 0.10, sok: 1.25 } });
  const t = RorAvvik.punkttekst(fin.punkter.find(p => p.punkt === 'a3'), fin.toleranse);
  paastand('verktøytipset viser 0,025, ikke 0,03', /i høyde \(±0,025\)/.test(t), t);
  // vannpunktet 1,5 m til siden er nær, men utenfor 1,25 m
  paastand('søkebredden med det den trenger: 1,25, ikke 1,3', fin.merknader.some(m => /mer enn 1,25 m fra røret/.test(m.tekst))
    && RorAvvik.kortTall(1.25, 1, 2) === '1,25' && RorAvvik.kortTall(1, 1, 2) === '1,0', fin.merknader.map(m => m.tekst).join(' | '));
}

console.log('\n12. Sammenligningen endrer ingenting');
{
  const foer = JSON.stringify([bygg.linjer, innA, innB]);
  RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: koder, innmalt: [innA, innB] });
  paastand('linjene og punktene er som før', JSON.stringify([bygg.linjer, innA, innB]) === foer);
}

console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
