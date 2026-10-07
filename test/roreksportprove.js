'use strict';
/**
 * Eksporten av rør mot fasit regnet for hånd.
 *
 *   node test/roreksportprove.js
 *
 * Alt er oppdiktet. «Gradene» i planen er UTM-meter (tilSone gjør lat/lon til
 * n/o rett fram), så fasiten kan regnes uten kartprojeksjon, og filene får tall
 * som ligner det en maskinstyring ser.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
global.Geo = require(js('geo.js'));
global.Ror = require(js('ror.js'));
global.RorPlan = require(js('rorplan.js'));
global.Eksport = require(js('eksport.js'));
const Groft = require(js('groft.js'));
const RorEksport = require(js('roreksport.js'));

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
   En trase (0,0) → (40,0) → (70,40) fra 500000 / 6500000, med spillvann
   midt i traseen og en kum i knekken, og vann 1 m til venstre. Flatt
   terreng på 10: fri overdekning 2,0 gir topp 8,0 overalt. */
const X0 = 500000, Y0 = 6500000, T = () => 10;
const plan = Object.assign(RorPlan.nyPlan(), {
  traseer: [{ id: 't1', punkter: [[0, 0], [40, 0], [70, 40]].map(([x, y], i) => ({ id: 'p' + (i + 1), lat: Y0 + y, lon: X0 + x })) }],
  ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0, regel: null, motsatt: false },
    { id: 'r2', trase: 't1', kode: 'VL 110PE', side: -1, regel: null, motsatt: false }],
  kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 }]
});
const koder = Ror.koderFra([{ kode: 'SP 160PE' }, { kode: 'VL 110PE' }], {});
const bygg = RorPlan.bygg({ plan, koder, mal: RorPlan.nyPlanmal(), terrengZ: T,
  tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o, y: p.n }) });
const groft = Groft.beregn({ linjer: bygg.linjer, koder, terrengZ: T,
  kummer: bygg.kummer.map(k => ({ id: k.id, x: k.x, y: k.y, bunnlop: k.bunnlop, diameter: k.diameter, eier: k.ror })) });
const profiler = new Map(bygg.linjer.map(l => [l.id, Ror.profil(l, T, RorPlan.kodeAv(koder, l.kode).dim)]));
const res = { type: 'ror', sone: 32, bygg, linjer: bygg.linjer, profiler, groft, kummer: bygg.kummer, bakkefaktor: 1, plan: true };
const app = { P: { navn: 'Prøvefelt «rør»', ror: { koder, plan } }, sone: 32 };
const SP = { D: 0.16, g: 0.0145 }, VL = { D: 0.11, g: 0.010 };

console.log('\n1. Punktene – tre høyder og stikningspunktene');
const d = RorEksport.punkter(app, res);
const sp = d.find(p => p.kode === 'SP 160PE'), vl = d.find(p => p.kode === 'VL 110PE');
{
  paastand('to rør, nummerert', d.length === 2 && sp.nr === 1 && vl.nr === 2);
  paastand('spillvannet stikkes i knekken, hver 10. m og enden',
    sp.stikk.map(q => Math.round(q.s)).join(',') === '0,10,20,30,40,50,60,70,80,90', sp.stikk.map(q => q.s.toFixed(2)).join(','));
  paastand('typene: start, kum i knekken, slutt', sp.stikk[0].type === 'start' && sp.stikk[4].type === 'kum'
    && sp.stikk[9].type === 'slutt' && sp.stikk[1].type === 'stikk', sp.stikk.map(q => q.type).join(','));
  paastand('topp 8,0 i hvert punkt – fri overdekning 2,0', sp.stikk.every(q => Math.abs(q.topp - 8) < 1e-9));
  paastand('bunn innvendig = topp − D + gods', sp.stikk.every(q => Math.abs(q.bunn - (q.topp - SP.D + SP.g)) < 1e-9)
    && vl.stikk.every(q => Math.abs(q.bunn - (q.topp - VL.D + VL.g)) < 1e-9));
  paastand('bunnlinja følger topplinja', sp.linjer.bunn.length === sp.linjer.topp.length
    && sp.linjer.bunn.every((q, i) => Math.abs(q.z - (sp.linjer.topp[i].z - SP.D + SP.g)) < 1e-9));
  sjekk('gravebunnen er grøftemotorens: topp − D − fundament', sp.stikk[2].gravebunn, 8 - 0.16 - 0.15, 0.005);
  paastand('og den finnes i hvert punkt langs spillvannet', sp.stikk.every(q => Number.isFinite(q.gravebunn)));
  paastand('gravebunnen er én sammenhengende linje', sp.linjer.gravebunn.length === 1 && sp.linjer.gravebunn[0].length > 10);
  sjekk('terrenget fra profilen', sp.stikk[3].terreng, 10, 1e-9);
  // vannet er et trykkrør med mellompunkt hver meter – de skal ikke stikkes
  const L = vl.lengde, s = RorEksport.stasjonering(vl.linje.xy);
  const knekk = vl.linje.punkter.map((p, i) => (p.mellom ? null : s[i])).filter(v => v !== null);
  let ventet = knekk.length;
  for (let v = 10; v < L - 0.05; v += 10) if (!knekk.some(k => Math.abs(k - v) < 0.05)) ventet++;
  paastand('trykkrøret stikkes bare i knekkene, hver 10. m og enden', vl.stikk.length === ventet
    && vl.linje.punkter.length > ventet, `${vl.stikk.length} mot ${ventet}`);
}
{
  /* Et innmålt rør som stikker opp over terrenget på midten: der graves det
     ikke, og gravebunnen brytes – den trekkes aldri over et sted uten tall. */
  const innm = { id: 'a', kode: 'SP 160PE', xy: [0, 20, 40, 60, 80].map(x => ({ x: X0 + x, y: Y0 - 100 })),
    punkter: [8, 8, 12, 8, 8].map((z, i) => ({ id: 'a' + i, z })) };
  const g2 = Groft.beregn({ linjer: [innm], koder, terrengZ: T });
  const r2 = { linjer: [innm], groft: g2, profiler: new Map([['a', Ror.profil(innm, T, 160)]]), kummer: [], sone: 32 };
  const [p] = RorEksport.punkter(app, r2);
  paastand('gravebunnen i to biter der røret er over terrenget', p.linjer.gravebunn.length === 2, String(p.linjer.gravebunn.length));
  paastand('og stasjonen på toppen har ingen gravebunn', !Number.isFinite(p.stikk.find(q => Math.abs(q.s - 40) < 0.01).gravebunn));
  const kof = RorEksport.kof(app, r2);
  const nr = '1-' + String(p.stikk.findIndex(x => Math.abs(x.s - 40) < 0.01) + 1).padStart(3, '0');
  paastand('KOF-fila har ingen G-punkt der', !kof.includes(` ${nr}G `) && kof.includes(` ${nr}T `), nr);
  // et rør uten dimensjon: bare topp rør
  const uten = { id: 'u', kode: 'XYZ', xy: [{ x: X0, y: Y0 }, { x: X0 + 30, y: Y0 }], punkter: [{ id: 'u0', z: 9 }, { id: 'u1', z: 9 }] };
  const r3 = { linjer: [uten], groft: Groft.beregn({ linjer: [uten], koder, terrengZ: T }), profiler: new Map(), kummer: [], sone: 32 };
  const [q] = RorEksport.punkter(app, r3);
  paastand('et rør uten dimensjon har bare topp rør', q.linjer.bunn.length === 0 && q.linjer.gravebunn.length === 0
    && q.stikk.every(x => !Number.isFinite(x.bunn)));
  paastand('og KOF-hodet sier det', /XYZ – uten dimensjon: bare topp rør/.test(RorEksport.kof(app, r3)));
}

console.log('\n2. KOF – stikningspunktene');
{
  const kof = RorEksport.kof(app, res);
  const linjer = kof.split('\r\n').filter(r => r.startsWith(' 05'));
  const ventet = d.reduce((n, p) => n + p.stikk.reduce((m, q) => m + 1 + (Number.isFinite(q.bunn) ? 1 : 0)
    + (Number.isFinite(q.gravebunn) ? 1 : 0), 0), 0) + 2;
  paastand('tre punkt per stikk, og to for kummen', linjer.length === ventet, `${linjer.length} mot ${ventet}`);
  paastand('første linje er bunnen i starten av spillvannet',
    linjer[0] === Eksport.kofPunkt('1-001B', 'RORBUNN', Y0, X0, 8 - SP.D + SP.g), linjer[0]);
  paastand('kodene for de tre høydene og kummen', ['RORBUNN', 'RORTOPP', 'GRAVBUNN', 'KUMBUNN', 'KUMTOPP']
    .every(k => linjer.some(r => r.slice(15, 23).trim() === k)));
  paastand('kummen: bunnløp og lokk', linjer.some(r => r.startsWith(' 05 K1B ')) && linjer.some(r => r.startsWith(' 05 K1T ')));
  paastand('hodet sier hva rørnumrene er', /MERK: 1 = SP 160PE \(selvfall, Ø160\)/.test(kof) && /MERK: 2 = VL 110PE \(trykk, Ø110\)/.test(kof));
  paastand('hodet bærer koordinatsystemet', kof.split('\r\n').some(r => r.startsWith(' 01 ') && / 22 /.test(r)));
  const navner = Eksport.kofNavner();
  const medPre = RorEksport.kofKropp(app, res, b => navner('A' + b), d);
  paastand('med samlefilens prefiks er navnene innenfor ti tegn', medPre.every(r => r.slice(4, 14).trim().length <= 10
    && r.slice(4, 14).trim().startsWith('A')) && medPre[0].startsWith(' 05 A1-001B '), medPre[0]);
}

console.log('\n3. LandXML – 3D-linjene');
{
  const xml = RorEksport.landxml(app, res);
  paastand('tre linjer per rør', (xml.match(/<PlanFeature /g) || []).length === 6, String((xml.match(/<PlanFeature /g) || []).length));
  paastand('navnene sier rør og høyde', xml.includes('name="1 SP 160PE – bunn innvendig"') && xml.includes('name="1 SP 160PE – topp rør"')
    && xml.includes('name="1 SP 160PE – gravebunn"') && xml.includes('name="2 VL 110PE – gravebunn"'));
  paastand('topplinja starter i N Ø Z', /name="1 SP 160PE – topp rør">\s*<CoordGeom>\s*<Line>\s*<Start>6500000\.0000 500000\.0000 8\.0000<\/Start>/.test(xml));
  paastand('kummen som to punkt', (xml.match(/<CgPoint /g) || []).length === 2 && xml.includes('name="k1 bunnløp"'));
  paastand('koordinatsystemet står der', xml.includes('epsgCode="25832"') && xml.includes('verticalDatum="NN2000"'));
  paastand('navnet er escapet', xml.includes('Prøvefelt «rør»') && !/<PlanFeatures name="[^"]*"[^>]*"/.test(xml));
}

console.log('\n4. SOSI');
{
  const sos = RorEksport.sosi(app, res);
  const telle = re => (sos.match(re) || []).length;
  paastand('seks kurver: bunn, topp og gravebunn per rør', telle(/^\.KURVE /gm) === 6, String(telle(/^\.KURVE /gm)));
  paastand('rørledning og grøftebunn', telle(/^\.\.OBJTYPE Rørledning$/gm) === 4 && telle(/^\.\.OBJTYPE Grøftebunn$/gm) === 2);
  paastand('kummen som punkt', telle(/^\.PUNKT /gm) === 1 && telle(/^\.\.OBJTYPE Kum$/gm) === 1);
  paastand('høydereferansen står på kurven', sos.includes('..HØYDEREF "bunn innvendig"') && sos.includes('..DIAMETER 160'));
  const rader = sos.split('\r\n'), i = rader.indexOf('..NØH');
  paastand('første høyde i centimeter', rader[i + 1] === `${Y0 * 100} ${X0 * 100} ${Math.round((8 - SP.D + SP.g) * 100)}`, rader[i + 1]);
  /* Vannet ligger 1 m til venstre – nord på det første strekket – og slutter
     i (69,2; 40,6), innenfor knekken. Området er i hele meter, ikke centimeter. */
  paastand('området dekker rørene, i meter', rader.includes(`...MIN-NØ ${Y0} ${X0}`)
    && rader.includes(`...MAX-NØ ${Y0 + 41} ${X0 + 70}`), rader.filter(r => /^\.\.\.M(IN|AX)-NØ/.test(r)).join(' | '));
}

console.log('\n4b. SOSI for innmålte rør: bare det som kom inn med fila');
{
  /* ET INNMÅLT ANLEGG gis ut som det kom inn: punktene fra innmålingen, rør
     for rør, med koordinatene og høydene fra fila. Bunn innvendig (regnet av
     dimensjonen), gravebunnen og merknadene om terrenget (regnet av
     Kartverkets terreng) hører til planleggingen, ikke til innmålingen. */
  const malt = { id: 'm', kode: 'SP 160PE', xy: [0, 20, 40].map(x => ({ x: X0 + x, y: Y0 + 5 })),
    punkter: [8.123, 8.041, 7.987].map((z, i) => ({ id: 'm' + i, z })) };
  const gM = Groft.beregn({ linjer: [malt], koder, terrengZ: T });
  // en kum i resultatet: SOSI-fila for et innmålt anlegg er rørene, og kummen står ikke der
  const rM = { type: 'ror', sone: 32, linjer: [malt], groft: gM, profiler: new Map([['m', Ror.profil(malt, T, 160)]]),
    kummer: [{ id: 'k9', ror: 'm', x: X0 + 20, y: Y0 + 5, bunnlop: 7, diameter: 1000 }], bakkefaktor: 1, plan: false,
    bygg: { linjer: [malt], enslige: [{ id: 'e1' }, { id: 'e2' }] } };
  paastand('fiksturen har en gravebunn å la være', RorEksport.punkter(app, rM)[0].linjer.gravebunn.length === 1);
  const sos = RorEksport.sosi(app, rM);
  const telle = re => (sos.match(re) || []).length;
  paastand('én kurve per rør – den innmålte', telle(/^\.KURVE /gm) === 1 && telle(/^\.\.OBJTYPE Rørledning$/gm) === 1, String(telle(/^\.KURVE /gm)));
  paastand('  ingen bunn innvendig, ingen grøftebunn, ingen kummer', !sos.includes('bunn innvendig') && !sos.includes('Grøftebunn')
    && telle(/^\.PUNKT /gm) === 0);
  /* BARE DET SOM KOM INN MED FILA: punktene i millimeter, som i innmålingen,
     og koden. Ingen diameter (tolket ut av koden), høydereferanse (antatt),
     anleggsnavn eller merknad – heller ikke om de enslige punktene. */
  const rader = sos.split('\r\n'), i = rader.indexOf('..NØH');
  paastand('  koordinatene og høydene fra fila, i millimeter', rader.slice(i + 1, i + 4).join(' | ')
    === [`${(Y0 + 5) * 1000} ${X0 * 1000} 8123`, `${(Y0 + 5) * 1000} ${(X0 + 20) * 1000} 8041`, `${(Y0 + 5) * 1000} ${(X0 + 40) * 1000} 7987`].join(' | ')
    && rader.includes('...ENHET 0.001'), rader.slice(i + 1, i + 4).join(' | '));
  const kurven = rader.slice(rader.findIndex(r => r.startsWith('.KURVE')), i);
  paastand('  kurven har bare objekttypen og koden', JSON.stringify(kurven) === JSON.stringify(['.KURVE 1:', '..OBJTYPE Rørledning', '..NAVN "SP 160PE"']),
    JSON.stringify(kurven));
  paastand('  og fila ingen merknader', !/^!/m.test(sos) && RorEksport.sosiMerknader(app, rM).length === 0,
    sos.split('\r\n').filter(r => r.startsWith('!')).join(' | '));
  // uten terreng: ingen gravebunn – og det er ikke noe SOSI-fila skal si fra om
  const utenT = Object.assign({}, rM, { groft: Groft.beregn({ linjer: [malt], koder, terrengZ: () => NaN }), bygg: { linjer: [malt], enslige: [] } });
  paastand('uten terreng: SOSI-fila er den samme, uten et ord om gravebunnen', RorEksport.sosiMerknader(app, utenT).length === 0
    && RorEksport.mangler(app, utenT).some(m => /gravebunn/.test(m)) && !/^!/m.test(RorEksport.sosi(app, utenT)));
  // de andre formatene er uendret: til maskinstyringen trengs bunnen og gravebunnen
  const kof = RorEksport.kof(app, rM);
  paastand('KOF-en har fortsatt bunn, topp og gravebunn', /RORBUNN/.test(kof) && /RORTOPP/.test(kof) && /GRAVBUNN/.test(kof));
  /* ET MILLIMETERTALL STÅR SOM DET STÅR, og to like punkt er ett: to
     målinger på samme sted og høyde ga et strekk uten lengde, som
     sjekkverktøyene flagger. */
  const lav = { id: 'l', kode: 'SP 160PE', xy: [0, 10, 10, 20].map(x => ({ x: X0 + x, y: Y0 + 9 })),
    punkter: [-0.125, 0.125, 0.125, 1].map((z, i) => ({ id: 'l' + i, z })) };
  const rL = Object.assign({}, rM, { linjer: [lav], groft: Groft.beregn({ linjer: [lav], koder, terrengZ: T }),
    profiler: new Map([['l', Ror.profil(lav, T, 160)]]), kummer: [], bygg: { linjer: [lav], enslige: [] } });
  const sL = RorEksport.sosi(app, rL).split('\r\n'), j = sL.indexOf('..NØH');
  paastand('millimeterne fra fila står som de er, og to like punkt er ett', sL.slice(j + 1, j + 4).join(' | ')
    === [`${(Y0 + 9) * 1000} ${X0 * 1000} -125`, `${(Y0 + 9) * 1000} ${(X0 + 10) * 1000} 125`, `${(Y0 + 9) * 1000} ${(X0 + 20) * 1000} 1000`].join(' | ')
    && sL[j + 4] === '.SLUTT', sL.slice(j + 1, j + 5).join(' | '));
  /* ET TEGNET ANLEGG står i centimeter, rundet en halv bort fra null: −0,125
     ble −12 (Math.round runder en halv mot pluss). */
  const sT = RorEksport.sosi(app, Object.assign({}, rL, { plan: true })).split('\r\n'), jT = sT.indexOf('..NØH', sT.indexOf('..HØYDEREF "topp rør"'));
  paastand('et tegnet anlegg i centimeter, en halv bort fra null', sT.includes('...ENHET 0.01') && sT.slice(jT + 1, jT + 4).join(' | ')
    === [`${(Y0 + 9) * 100} ${X0 * 100} -13`, `${(Y0 + 9) * 100} ${(X0 + 10) * 100} 13`, `${(Y0 + 9) * 100} ${(X0 + 20) * 100} 100`].join(' | '),
  sT.slice(jT + 1, jT + 4).join(' | '));
}

console.log('\n5. DXF');
{
  const dxf = RorEksport.dxf(app, res);
  for (const lag of ['SP_160PE_BUNN', 'SP_160PE_TOPP', 'SP_160PE_GRAVEBUNN', 'VL_110PE_BUNN']) {
    paastand('laget ' + lag, dxf.includes('\r\n8\r\n' + lag + '\r\n'));
  }
  const p = dxf.split('\r\n'), i = p.indexOf('CIRCLE');
  const etter = p.slice(i, i + 16);
  const km = bygg.kummer[0];
  paastand('kummen som sirkel med ytre diameter på bunnløpet', i > 0 && etter.includes('0.6000')
    && etter[etter.indexOf('30') + 1] === km.bunnlop.toFixed(4), etter.join('|'));
}

console.log('\n6. GeoJSON');
{
  const g = RorEksport.geojson(app, res);
  const linjer = g.features.filter(f => f.geometry.type === 'LineString'), pkt = g.features.filter(f => f.geometry.type === 'Point');
  paastand('to rør og en kum', linjer.length === 2 && pkt.length === 1);
  const [lon, lat] = linjer[0].geometry.coordinates[0];
  paastand('i lengde- og breddegrad', lon > 8.9 && lon < 9.1 && lat > 58.5 && lat < 58.7, `${lon} ${lat}`);
  paastand('egenskapene', linjer[0].properties.kode === 'SP 160PE' && linjer[0].properties.dim_mm === 160
    && linjer[0].properties.regel === 'selvfall' && pkt[0].properties.id === 'k1');
}

console.log('\n6b. Det som ikke kommer med, sies det fra om');
{
  /* Et tegnet rør uten dimensjon får ingen høyder (bunn ↔ topp trenger D), og
     ligger i `utenHoyde`, ikke i linjene. Her falt det stille ut: fila så
     komplett ut, og hodet nevnte bare de andre rørene. */
  const plan2 = JSON.parse(JSON.stringify(plan));
  plan2.ror.push({ id: 'r3', trase: 't1', kode: 'DRENS', side: 1, regel: null, motsatt: false });
  const koder2 = Ror.koderFra([{ kode: 'SP 160PE' }, { kode: 'VL 110PE' }, { kode: 'DRENS' }], {});
  const b2 = RorPlan.bygg({ plan: plan2, koder: koder2, mal: RorPlan.nyPlanmal(), terrengZ: T,
    tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o, y: p.n }) });
  const r2 = Object.assign({}, res, { bygg: b2, linjer: b2.linjer });
  const a2 = { P: { navn: 'Prøve', ror: { koder: koder2, plan: plan2 } }, sone: 32 };
  const mangler = RorEksport.mangler(a2, r2);
  paastand('røret uten dimensjon står i lista over det som mangler', mangler.some(m => /^Ikke med: DRENS: uten dimensjon/.test(m)),
    JSON.stringify(mangler));
  paastand('KOF-hodet sier det', /MERK: Ikke med: DRENS: uten dimensjon/.test(RorEksport.kof(a2, r2)));
  paastand('LandXML, SOSI og DXF sier det i en kommentar', /<!-- Ikke med: DRENS/.test(RorEksport.landxml(a2, r2))
    && /^! Ikke med: DRENS/m.test(RorEksport.sosi(a2, r2)) && /\r\n999\r\nIkke med: DRENS/.test(RorEksport.dxf(a2, r2)));
  paastand('stikningslista sier det', RorEksport.stikningRader(a2, r2, (v, d) => v.toFixed(d)).foran.some(f => /DRENS/.test(f)));
  // SOSI-fila for et tegnet anlegg sier fra om det samme som de andre – det er bare det innmålte som har sine egne
  paastand('et tegnet anlegg: SOSI-merknadene er de samme som de andres', RorEksport.sosiMerknader(a2, r2).length > 0
    && JSON.stringify(RorEksport.sosiMerknader(a2, r2)) === JSON.stringify(RorEksport.mangler(a2, r2)));
  paastand('og et komplett anlegg har ingenting å melde', RorEksport.mangler(app, res).length === 0, JSON.stringify(RorEksport.mangler(app, res)));
  // et innmålt anlegg der terrenget mangler: gravebunnen er borte, og massene kan ikke regnes
  const innm = { id: 'a', kode: 'SP 160PE', xy: [0, 20, 40].map(x => ({ x: X0 + x, y: Y0 })), punkter: [8, 8, 8].map((z, i) => ({ id: 'a' + i, z })) };
  const g3 = Groft.beregn({ linjer: [innm], koder, terrengZ: () => NaN });
  const r3 = { linjer: [innm], groft: g3, profiler: new Map([['a', Ror.profil(innm, () => NaN, 160)]]), kummer: [], sone: 32 };
  paastand('uten terreng: ingen gravebunn, og det sies', RorEksport.mangler(app, r3).some(m => /1 SP 160PE: ingen gravebunn/.test(m)));
  let melding = null;
  try { RorEksport.masseRader(app, r3, (v, d) => v.toFixed(d)); } catch (e) { melding = e.message; }
  paastand('og massene skrives ikke som nuller', /Ingen grøft er regnet/.test(String(melding)), String(melding));
}

console.log('\n6c. Stikk i to punkt på samme sted, og CSV-ene');
{
  /* Et innmålt fall: to punkt på samme sted, topp 7,8 og 6,5. Begge skal
     stikkes – her ble de slått sammen, og den nederste høyden forsvant. */
  const fall = { id: 'f', kode: 'SP 160PE', xy: [0, 20, 20, 40].map(x => ({ x: X0 + x, y: Y0 })),
    punkter: [8, 7.8, 6.5, 6.3].map((z, i) => ({ id: 'f' + i, z })) };
  const [p] = RorEksport.punkter(app, { linjer: [fall], kummer: [], sone: 32 });
  const ved20 = p.stikk.filter(q => Math.abs(q.s - 20) < 0.01).map(q => q.topp);
  paastand('begge høydene i fallet stikkes', ved20.length === 2 && ved20[0] === 7.8 && ved20[1] === 6.5, JSON.stringify(ved20));
  const tall = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '');
  const st = RorEksport.stikningRader(app, res, tall);
  paastand('stikningslista: én rad per stikk, og en per kum', st.rader.length === sp.stikk.length + vl.stikk.length + 1, String(st.rader.length));
  paastand('med bunn, topp og gravebunn i hver rad', st.rader[0] === ['1', 'SP 160PE', '1-001', 'start', '0,00', '6500000,000', '500000,000',
    tall(8 - SP.D + SP.g, 3), '8,000', tall(sp.stikk[0].gravebunn, 3), '10,000', '2,00'].join(';'), st.rader[0]);
  const ms = RorEksport.masseRader(app, res, tall);
  paastand('massene per kode, summen, dybden og balansen', ms.rader.some(r => r.startsWith('SP 160PE;'))
    && ms.rader.some(r => r.startsWith('Sum;')) && ms.rader.includes('Dybde;Grøft_m') && ms.rader.includes('Massebalanse;Volum_m3'));
  paastand('avstivingen til sist, så kolonnene foran står der de stod', /;Kummer_m3;Kasse_m;Spunt_m2$/.test(ms.overskrift)
    && ms.rader.filter(r => /^(SP 160PE|Sum);/.test(r)).every(r => r.split(';').length === 10 && /;0,0;0,0$/.test(r)),
    ms.rader.find(r => r.startsWith('Sum;')));
  paastand('koder som kunne blitt formler i et regneark, nøytraliseres', RorEksport.csvTekst('=SUM(A1)') === "'=SUM(A1)"
    && RorEksport.csvTekst('-12;"x"') === "'-12,'x'" && RorEksport.csvTekst('SP 160PE') === 'SP 160PE');
}

console.log('\n6d. Tegn som må pakkes inn, og gravebunn i flere biter');
{
  const kode = 'SP <160> "PE" & \'x\'';
  const koder3 = Ror.koderFra([{ kode }], {});
  const l = { id: 'e', kode, xy: [0, 20, 40, 60, 80].map(x => ({ x: X0 + x, y: Y0 - 200 })), punkter: [8, 8, 12, 8, 8].map((z, i) => ({ id: 'e' + i, z })) };
  koder3[kode].dim = 160;
  const r4 = { linjer: [l], groft: Groft.beregn({ linjer: [l], koder: koder3, terrengZ: T }), profiler: new Map(), kummer: [], sone: 32 };
  const a4 = { P: { navn: 'A & B <«rør»>', ror: { koder: koder3 } }, sone: 32 };
  const xml = RorEksport.landxml(a4, r4);
  paastand('LandXML pakker inn & < > " \'', xml.includes('SP &lt;160&gt; &quot;PE&quot; &amp; &apos;x&apos;')
    && xml.includes('name="A &amp; B &lt;«rør»&gt;"') && !/<PlanFeature name="[^"]*"[^ >]/.test(xml));
  paastand('gravebunnen i to biter blir to navngitte linjer', xml.includes('– gravebunn 1"') && xml.includes('– gravebunn 2"'));
  const sos = RorEksport.sosi(a4, r4);
  paastand('SOSI dobler anførselstegnene', sos.includes('..NAVN "SP <160> ""PE"" & \'x\'"'));
}

console.log('\n7. Ingen rør');
{
  const tom = { linjer: [], kummer: [], sone: 32 };
  for (const [navn, f] of [['KOF', RorEksport.kof], ['LandXML', RorEksport.landxml], ['SOSI', RorEksport.sosi], ['DXF', RorEksport.dxf]]) {
    let melding = null;
    try { f(app, tom); } catch (e) { melding = e.message; }
    paastand(navn + ' uten rør sier fra i stedet for å skrive en tom fil', melding === 'Ingen rør å skrive', String(melding));
  }
}

/* Den ekte fila – bare hvis stien står i ROR_FIL. Kundens filer ligger ikke i
   repoet, og utskriften sier bare antall og tid, aldri navn eller tall fra fila. */
if (process.env.ROR_FIL) {
  console.log('\n8. Den ekte fila (ROR_FIL)');
  const fs = require('fs');
  const les = Ror.lesLandXML(Ror.dekod(fs.readFileSync(process.env.ROR_FIL)));
  const ror = { punkter: les.punkter, koder: Ror.koderFra(les.punkter), retting: { av: [], brudd: [], koble: [] } };
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, Ror.lagTilXY(32, 32));
  // terrenget 1,5 m over nærmeste målte punkt – nok til at grøfta regnes
  const zMaks = Math.max(...les.punkter.map(p => p.z));
  const terreng = (x, y) => {
    let best = null;
    for (const p of les.punkter) { const dd = Math.hypot(p.o - x, p.n - y); if (!best || dd < best.d) best = { d: dd, z: p.z }; }
    return best && best.d < 20 ? best.z + 1.5 : zMaks + 1.5;
  };
  const t0 = Date.now();
  const g = Groft.beregn({ linjer: b.linjer, koder: ror.koder, terrengZ: terreng, rute: 0.2 });
  const pr = new Map(b.linjer.map(l => [l.id, Ror.profil(l, terreng, RorPlan.kodeAv(ror.koder, l.kode).dim)]));
  const r = { linjer: b.linjer, groft: g, profiler: pr, kummer: [], sone: 32 };
  const a = { P: { navn: 'Ekte fil', ror: { koder: ror.koder } }, sone: 32 };
  let melding = null, filer = null;
  try {
    filer = { kof: RorEksport.kof(a, r), landxml: RorEksport.landxml(a, r), sosi: RorEksport.sosi(a, r), dxf: RorEksport.dxf(a, r) };
  } catch (e) { melding = e.message; }
  const ms = Date.now() - t0;
  paastand('alle formatene skrives for den ekte fila', !!filer, String(melding));
  if (filer) {
    const kof = filer.kof.split('\r\n').filter(x => x.startsWith(' 05')).length;
    console.log(`       ${b.linjer.length} rør · ${kof} KOF-punkt · ${(filer.landxml.match(/<PlanFeature /g) || []).length} LandXML-linjer · ${ms} ms`);
    paastand('og raskt', ms < 20000, ms + ' ms');
  }
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
