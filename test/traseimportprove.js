'use strict';
/**
 * Traseer fra fil: KOF og DXF.
 *
 *   node test/traseimportprove.js
 *
 * Filene er laget i prøven, med oppdiktede koordinater.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const TraseImport = require(js('traseimport.js'));
const Eksport = require(js('eksport.js'));

let feil = 0, ok = 0;
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}
const N0 = 6500000, O0 = 500000;
const kort = l => `${l.navn}:${l.punkter.length}`;

console.log('\n1. KOF');
{
  const P = (navn, kode, n, o, z) => Eksport.kofPunkt(navn, kode, N0 + n, O0 + o, z);
  const kof = ['-05 Prøve', ' 01 Prove        06102026   2      23 0000 $11100000000', '.PUNKT',
    ' 09_91', P('P1', 'SP', 0, 0, 10), P('P2', 'SP', 10, 0, 9.9), P('P3', 'SP', 20, 5, 9.8), ' 09_99',
    ' 09_91', P('F1', 'KANT', 100, 0, 5), P('F2', 'KANT', 100, 10, 5), P('F3', 'KANT', 110, 10, 5), ' 09_96',
    P('A1', 'VL', 200, 0, 11), P('A2', 'VL', 210, 0, 11), P('B1', 'OV', 300, 0, 11), P('B2', 'OV', 310, 0, 11),
    P('B3', 'OV', 310, 0.004, 11), P('C1', 'DR', 400, 0, 11)].join('\r\n');
  const k = TraseImport.lesKof(kof);
  paastand('sonen fra 01-posten: kode 23 er UTM33', k.sone === 33, String(k.sone));
  paastand('09_91–09_99 er én linje', k.linjer[0].lag === 'SP' && k.linjer[0].punkter.length === 3, kort(k.linjer[0]));
  paastand('09_96 lukker linja', k.linjer[1].punkter.length === 4 && k.linjer[1].punkter[3].n === k.linjer[1].punkter[0].n);
  paastand('punkt med samme kode etter hverandre er en linje', k.linjer[2].lag === 'VL' && k.linjer[2].punkter.length === 2);
  paastand('et punkt på samme sted slås sammen', k.linjer[3].lag === 'OV' && k.linjer[3].punkter.length === 2, kort(k.linjer[3]));
  paastand('ett punkt alene er ingen linje', k.linjer.length === 4, k.linjer.map(kort).join(' '));
  paastand('nord og øst i riktig rekkefølge, med høyde', k.linjer[0].punkter[2].n === N0 + 20 && k.linjer[0].punkter[2].o === O0 + 5
    && k.linjer[0].punkter[2].z === 9.8);
  const hand = TraseImport.lesKof(' 09_91\n05 X1 7 6500300.5 500300.5\n05 X2 7 6500310.5 500300.5 12.5\n 09_99');
  paastand('skrevet for hånd: en kode som er et tall er ikke nord', hand.linjer[0].punkter[0].n === 6500300.5
    && Number.isNaN(hand.linjer[0].punkter[0].z) && hand.linjer[0].punkter[1].z === 12.5, JSON.stringify(hand.linjer[0]));
  paastand('uten 01-post: ingen sone', TraseImport.lesKof(P('A', 'SP', 0, 0, 1) + '\n' + P('B', 'SP', 5, 0, 1)).sone === null);
  // tre blokker uten 09_99: en ny 09_91 avslutter den åpne – her ble de to første kastet
  const apne = TraseImport.lesKof([' 09_91', P('A1', 'SP', 0, 0, 1), P('A2', 'SP', 10, 0, 1),
    ' 09_91', P('B1', 'SP', 0, 50, 1), P('B2', 'SP', 10, 50, 1), ' 09_91', P('C1', 'SP', 0, 90, 1), P('C2', 'SP', 10, 90, 1)].join('\n'));
  paastand('tre blokker uten 09_99: tre linjer', apne.linjer.length === 3 && apne.linjer.every(l => l.punkter.length === 2),
    apne.linjer.map(kort).join(' '));
  // skrevet for hånd uten faste kolonner: koden er alt mellom navnet og tallene
  const ord = TraseImport.lesKof(['05 A1 SP 160 6500300.5 500300.5 10', '05 A2 SP 160 6500310.5 500300.5 9.9',
    '05 B1 SP 110 6500300.5 500310.5', '05 B2 SP 110 6500310.5 500310.5'].join('\n'));
  paastand('en kode med mellomrom: «SP 160» og «SP 110» er to linjer', ord.linjer.length === 2 && ord.linjer[0].lag === 'SP 160'
    && ord.linjer[1].lag === 'SP 110' && ord.linjer[1].punkter[0].o === 500310.5 && Number.isNaN(ord.linjer[1].punkter[0].z),
    JSON.stringify(ord.linjer.map(l => [l.lag, l.punkter[0]])));
}

console.log('\n2. DXF');
{
  const d = (...rader) => rader.join('\n');
  const dxf = d('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    // tre løse streker i feil rekkefølge og retning – én trase
    '0', 'LINE', '8', 'SP', '10', O0 + 10, '20', N0, '30', '0', '11', O0, '21', N0, '31', '0',
    '0', 'LINE', '8', 'SP', '10', O0 + 20, '20', N0 + 5, '30', '0', '11', O0 + 10, '21', N0, '31', '0',
    '0', 'LINE', '8', 'SP', '10', O0 + 20, '20', N0 + 5, '30', '0', '11', O0 + 30, '21', N0 + 5, '31', '0',
    '0', 'LWPOLYLINE', '8', 'VL', '90', '3', '70', '0', '38', '12.5', '10', O0 + 100, '20', N0 + 100, '10', O0 + 110,
    '20', N0 + 100, '10', O0 + 120, '20', N0 + 110,
    '0', 'POLYLINE', '8', 'OV', '66', '1', '70', '8',
    '0', 'VERTEX', '8', 'OV', '10', O0 + 200, '20', N0 + 200, '30', '9.5',
    '0', 'VERTEX', '8', 'OV', '70', '16', '10', O0 + 205, '20', N0 + 220, '30', '9.4',
    '0', 'VERTEX', '8', 'OV', '10', O0 + 210, '20', N0 + 200, '30', '9.4',
    '0', 'SEQEND', '8', 'OV',
    '0', 'TEXT', '8', 'T', '10', '1', '20', '2', '1', 'tekst', '0', 'INSERT', '8', 'K', '2', 'KUM', '10', '0', '20', '0',
    '0', 'ENDSEC', '0', 'EOF');
  const r = TraseImport.lesDxf(dxf);
  const sp = r.linjer.find(l => l.lag === 'SP'), vl = r.linjer.find(l => l.lag === 'VL'), ov = r.linjer.find(l => l.lag === 'OV');
  const rekke = sp ? sp.punkter.map(q => q.o - O0).join(',') : '';
  paastand('løse streker på samme lag kjedes til én linje', rekke === '0,10,20,30' || rekke === '30,20,10,0', rekke);
  paastand('  og streker med høyde 0 har ingen høyde', !!sp && sp.punkter.every(q => Number.isNaN(q.z)));
  paastand('LWPOLYLINE med høyden i 38', !!vl && vl.punkter.length === 3 && vl.punkter.every(q => q.z === 12.5));
  paastand('3D-polylinje med VERTEX – kontrollpunkt for spline hoppes over', !!ov && ov.punkter.length === 2
    && ov.punkter[1].z === 9.4, ov && JSON.stringify(ov.punkter));
  paastand('tekst og blokker telles', r.hoppet.TEXT === 1 && r.hoppet.INSERT === 1, JSON.stringify(r.hoppet));
  paastand('DXF har ingen sone', r.sone === null);
  paastand('uten ENTITIES: en merknad, ingen linjer', TraseImport.lesDxf(d('0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC')).merknader.length === 1);

  const ent = (...e) => d('0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF');
  const lw = (lag, pts, ...ekstra) => ['0', 'LWPOLYLINE', '8', lag, ...ekstra, '90', String(pts.length), '70', '0',
    ...pts.flatMap(([x, y, b]) => ['10', String(x), '20', String(y)].concat(b ? ['42', String(b)] : []))];
  const linje = (lag, [x1, y1, z1], [x2, y2, z2], ...ekstra) => ['0', 'LINE', '8', lag, ...ekstra, '10', String(x1), '20', String(y1),
    '30', String(z1), '11', String(x2), '21', String(y2), '31', String(z2)];
  // papirrommet: rammen og tittelfeltet nær (0, 0) – her fikk de hele fila avvist som et lokalt system
  const papir = TraseImport.lesDxf(ent(...lw('SP', [[O0, N0], [O0 + 10, N0], [O0 + 20, N0 + 5], [O0 + 30, N0 + 5]]),
    ...linje('RAMME', [0, 0, 0], [420, 0, 0], '67', '1'), ...linje('RAMME', [420, 0, 0], [420, 297, 0], '67', '1'),
    ...lw('TITTEL', [[0, 0], [100, 0], [100, 40]], '67', '1')));
  paastand('papirrommet hoppes over og telles', papir.linjer.length === 1 && papir.linjer[0].lag === 'SP' && papir.hoppet.papirrom === 3,
    JSON.stringify({ l: papir.linjer.map(kort), h: papir.hoppet }));
  // en kvart sirkel med radius 20 som bue i polylinja (42 = tan(90°/4)): her ble den en rett korde, 5,9 m fra buen
  const bue = TraseImport.lesDxf(ent(...lw('OV', [[O0 + 20, N0, Math.tan(Math.PI / 8)], [O0, N0 + 20]])));
  const bp = bue.linjer[0].punkter, avst = q => Math.hypot(q.o - O0, q.n - N0);
  paastand('en bue i polylinja: punkt hver meter, alle på sirkelen', bp.length >= 32 && bp.every(q => Math.abs(avst(q) - 20) < 1e-6)
    && bp.some(q => Math.abs(q.o - q.n - O0 + N0) < 0.6), `${bp.length} punkt`);
  paastand('  og det står i merknadene', bue.merknader.some(m => /bue/.test(m)), JSON.stringify(bue.merknader));
  const med = TraseImport.lesDxf(ent(...lw('OV', [[O0, N0 + 20, -Math.tan(Math.PI / 8)], [O0 + 20, N0]])));
  paastand('  med klokka (negativ bue) likeså', med.linjer[0].punkter.every(q => Math.abs(avst(q) - 20) < 1e-6)
    && med.linjer[0].punkter[1].o > O0 && med.linjer[0].punkter[1].n > N0);
  // ARC: sentrum, radius og vinklene i grader, mot klokka
  const arc = TraseImport.lesDxf(ent('0', 'ARC', '8', 'DR', '10', String(O0 + 100), '20', String(N0 + 100), '30', '5', '40', '10',
    '50', '0', '51', '90'));
  const ap = arc.linjer[0].punkter;
  paastand('ARC: punkt hver meter fra 0° til 90°', ap.length >= 16 && ap.every(q => Math.abs(Math.hypot(q.o - O0 - 100, q.n - N0 - 100) - 10) < 1e-6)
    && Math.abs(ap[0].o - O0 - 110) < 1e-6 && Math.abs(ap[ap.length - 1].n - N0 - 110) < 1e-6 && ap.every(q => q.z === 5), `${ap.length} punkt`);
  // flatenett (polyface, 70 = 64): flatepostene lå i (0, 0) og ble lest som en linje
  const flate = TraseImport.lesDxf(ent('0', 'POLYLINE', '8', 'TERRENG', '66', '1', '70', '64',
    '0', 'VERTEX', '8', 'TERRENG', '70', '192', '10', String(O0), '20', String(N0), '30', '1',
    '0', 'VERTEX', '8', 'TERRENG', '70', '192', '10', String(O0 + 5), '20', String(N0), '30', '1',
    '0', 'VERTEX', '8', 'TERRENG', '70', '128', '10', '0', '20', '0', '30', '0', '0', 'SEQEND', '8', 'TERRENG'));
  paastand('flatenett hoppes over og telles', flate.linjer.length === 0 && flate.hoppet.flatenett === 1, JSON.stringify(flate.hoppet));
  // speilet (normalen ned, 230 = −1): x er snudd i fila
  const speil = TraseImport.lesDxf(ent(...lw('SP', [[-(O0 + 5), N0], [-(O0 + 15), N0]], '210', '0', '220', '0', '230', '-1')));
  paastand('speilet polylinje: øst blir riktig', speil.linjer[0].punkter[0].o === O0 + 5 && speil.linjer[0].punkter[1].o === O0 + 15,
    JSON.stringify(speil.linjer[0].punkter));
  // 2D-polylinje: høyden står i hodet (30), ikke i hjørnene
  const to = TraseImport.lesDxf(ent('0', 'POLYLINE', '8', 'VL', '66', '1', '10', '0', '20', '0', '30', '12.5', '70', '0',
    '0', 'VERTEX', '8', 'VL', '10', String(O0), '20', String(N0), '0', 'VERTEX', '8', 'VL', '10', String(O0 + 10), '20', String(N0),
    '0', 'SEQEND', '8', 'VL'));
  paastand('2D-polylinje: høyden fra hodet', to.linjer[0].punkter.every(q => q.z === 12.5), JSON.stringify(to.linjer[0].punkter));
  // en T: tre streker møtes i ett punkt – kjeden stopper der, uansett rekkefølge
  const J = [O0 + 50, N0 + 50, 0];
  for (const rekke of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
    const st = [linje('SP', [O0, N0 + 50, 0], J), linje('SP', J, [O0 + 100, N0 + 50, 0]), linje('SP', J, [O0 + 50, N0 + 100, 0])];
    const t = TraseImport.lesDxf(ent(...rekke.flatMap(i => st[i])));
    paastand(`en T (rekkefølge ${rekke.join('')}): tre linjer, ingen gjennom krysset`, t.linjer.length === 3
      && t.linjer.every(l => l.punkter.length === 2), t.linjer.map(kort).join(' '));
  }
  // en 0 inne i en 3D-kjede er en høyde som mangler, ikke bunn på havnivå
  const null3 = TraseImport.lesDxf(ent(...linje('SP', [O0, N0, 10], [O0 + 10, N0, 10]), ...linje('SP', [O0 + 10, N0, 10], [O0 + 20, N0, 0]),
    ...linje('SP', [O0 + 20, N0, 0], [O0 + 30, N0, 9.8])));
  const zz = null3.linjer[0].punkter.map(q => q.z);
  paastand('en 0 inne i en 3D-kjede blir ukjent', zz.length === 4 && zz[0] === 10 && Number.isNaN(zz[2]) && zz[3] === 9.8, JSON.stringify(zz));
  // 20 000 løse streker i tilfeldig rekkefølge og retning – her tok kjedingen tolv sekunder
  let frø = 7;
  const tilf = () => { frø = (frø * 1103515245 + 12345) % 2147483648; return frø / 2147483648; };
  const mange = [];
  for (let i = 0; i < 20000; i++) {
    const a = [O0 + i, N0 + (i % 2), 1], b = [O0 + i + 1, N0 + ((i + 1) % 2), 1];
    mange.push(tilf() < 0.5 ? linje('SP', a, b) : linje('SP', b, a));
  }
  for (let i = mange.length - 1; i > 0; i--) { const j = Math.floor(tilf() * (i + 1)); [mange[i], mange[j]] = [mange[j], mange[i]]; }
  const tekst = ['0', 'SECTION', '2', 'ENTITIES'].concat(...mange, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
  const t0 = Date.now(), stor = TraseImport.lesDxf(tekst), ms = Date.now() - t0;
  paastand(`20 000 streker blir én linje på ${ms} ms`, stor.linjer.length === 1 && stor.linjer[0].punkter.length === 20001 && ms < 3000,
    stor.linjer.map(kort).join(' '));
}

console.log('\n3. Programmets egen KOF leses tilbake');
{
  // punktene som stikningslista for et rør skriver dem: samme kode, i rekkefølge
  const rader = [0, 10, 20, 30].map((s, i) => Eksport.kofPunkt('1-00' + i, 'RORTOPP', N0 + s, O0, 8 - s * 0.01));
  const r = TraseImport.lesKof(rader.join('\n'));
  paastand('én linje med fire punkt', r.linjer.length === 1 && r.linjer[0].punkter.length === 4);
  paastand('lengden', Math.abs(TraseImport.lengde(r.linjer[0]) - 30) < 1e-9);

  /* STIKNINGSFILA SOM RØREKSPORTEN FAKTISK SKRIVER: bunn, topp og gravebunn om
     hverandre for hvert punkt, og kummene. Her ga den ingen linjer. To rør –
     spillvann og vann – i en trase med en kum i knekken, flatt terreng. */
  global.Geo = require(js('geo.js'));
  global.Ror = require(js('ror.js'));
  global.RorPlan = require(js('rorplan.js'));
  global.Eksport = Eksport;
  const Groft = require(js('groft.js')), RorEksport = require(js('roreksport.js'));
  const T = () => 10;
  const plan = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [[0, 0], [40, 0], [70, 40]].map(([x, y], i) => ({ id: 'p' + (i + 1), lat: N0 + y, lon: O0 + x })) }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0, regel: null, motsatt: false },
      { id: 'r2', trase: 't1', kode: 'VL 110PE', side: -1, regel: null, motsatt: false }],
    kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 }]
  });
  const koder = Ror.koderFra([{ kode: 'SP 160PE' }, { kode: 'VL 110PE' }], {});
  const bygg = RorPlan.bygg({ plan, koder, mal: RorPlan.nyPlanmal(), terrengZ: T, tilSone: (lat, lon) => ({ o: lon, n: lat }),
    tilXY: p => ({ x: p.o, y: p.n }) });
  const groft = Groft.beregn({ linjer: bygg.linjer, koder, terrengZ: T,
    kummer: bygg.kummer.map(k => ({ id: k.id, x: k.x, y: k.y, bunnlop: k.bunnlop, diameter: k.diameter, eier: k.ror })) });
  const profiler = new Map(bygg.linjer.map(l => [l.id, Ror.profil(l, T, RorPlan.kodeAv(koder, l.kode).dim)]));
  const res = { type: 'ror', sone: 32, bygg, linjer: bygg.linjer, profiler, groft, kummer: bygg.kummer, bakkefaktor: 1, plan: true };
  const app = { P: { navn: 'Prøvefelt', ror: { koder, plan } }, sone: 32 };
  const fil = RorEksport.kof(app, res), stikk = RorEksport.punkter(app, res);
  const tilbake = TraseImport.lesKof(fil);
  const navn = tilbake.linjer.map(l => l.navn).sort().join(' | ');
  paastand('eksporten leses tilbake: bunn, topp og gravebunn per rør', tilbake.linjer.length === 6
    && ['RORBUNN – rør 1', 'RORTOPP – rør 1', 'GRAVBUNN – rør 1', 'RORBUNN – rør 2', 'RORTOPP – rør 2', 'GRAVBUNN – rør 2']
      .every(x => tilbake.linjer.some(l => l.navn === x)), navn);
  const sp = tilbake.linjer.find(l => l.navn === 'RORBUNN – rør 1'), fasit = stikk.find(p => p.nr === 1).stikk;
  paastand('  med punktene der stikningen står, i rekkefølge', sp.punkter.length === fasit.length
    && sp.punkter.every((q, i) => Math.abs(q.o - fasit[i].x) < 0.001 && Math.abs(q.n - fasit[i].y) < 0.001 && Math.abs(q.z - fasit[i].bunn) < 0.001));
  paastand('  kummene er punkt, ikke en linje – de telles', tilbake.hoppet.kumpunkt === 2, JSON.stringify(tilbake.hoppet));
  paastand('  og sonen står i fila', tilbake.sone === 32);
}
paastand('feil endelse avvises', (() => { try { TraseImport.les('a.txt', ''); return false; } catch (e) { return /kof og .dxf/.test(e.message); } })());

console.log(`\n${ok} tester ok, ${feil} feil`);
if (feil) process.exit(1);
