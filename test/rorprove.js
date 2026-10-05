'use strict';
/**
 * Rørene fra maskinstyringen mot fasit man kan regne ut for hånd.
 *
 *   node test/rorprove.js
 *
 * Punktene her er oppdiktet. Den ekte fila er kundens data og ligger
 * ikke i repoet – står stien i ROR_FIL, kjøres den i tillegg til slutt.
 */
const path = require('path');
const fs = require('fs');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const Ror = require(js('ror.js'));

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
function kaster(navn, f, monster) {
  try { f(); feil++; console.log(`  FEIL ${navn}  kastet ikke`); }
  catch (e) { paastand(navn, monster.test(e.message), e.message); }
}

(async () => {

/* ------------------------------------------------------------------ */
console.log('\n1. Lese LandXML');
{
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="2026-09-15" time="08:30:00">
  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter"/></Units>
  <Application manufacturer="Novatron Oy" name="Xsite Manage" version="1.0"/>
  <CgPoints name="Default">
    <CgPoint name="p1" surveyOrder="1" code="180 PE" timeStamp="2026-08-27T09:12:44.000Z">6488855.307 429458.503 205.766</CgPoint>
    <CgPoint code='90PE' name='p2' surveyOrder='2'>6488846.539 429455.801 206.009</CgPoint>
    <CgPoint name="p3" surveyOrder="3" code="SP &amp; VA">6488836.206 429452.076 206.041</CgPoint>
    <CgPoint name="p4" surveyOrder="4" code="32PE">6488829.364 429449.397</CgPoint>
    <CgPoint name="p1" surveyOrder="5" code="180 PE">6488816.979 429445.150 205.821</CgPoint>
    <CgPoint name="p6" surveyOrder="6" code="180 PE">abc def 1</CgPoint>
    <CgPoint name="p7" pntRef="p1"/>
    <CgPoint surveyOrder="8" desc="undefined">6488796.815 429437.779 205.925</CgPoint>
    <!-- <CgPoint name="kommentert" code="X">1 2 3</CgPoint> -->
  </CgPoints>
</LandXML>`;
  const r = Ror.lesLandXML(xml);
  sjekk('fire gyldige punkt', r.punkter.length, 4, 0);
  paastand('programmet er Xsite Manage', r.program === 'Xsite Manage', r.program);
  paastand('datoen fra rota', r.dato === '2026-09-15', r.dato);
  paastand('ingen EPSG i fila', r.epsg === null);
  const p1 = r.punkter[0];
  sjekk('nord er første tall', p1.n, 6488855.307, 1e-9);
  sjekk('øst er andre tall', p1.o, 429458.503, 1e-9);
  sjekk('høyden er tredje', p1.z, 205.766, 1e-9);
  paastand('id fra name, kode, tid', p1.id === 'p1' && p1.kode === '180 PE' && p1.tid === '2026-08-27T09:12:44.000Z');
  sjekk('surveyOrder blir nr', p1.nr, 1, 0);
  paastand('enkle fnutter og annen rekkefølge', r.punkter[1].id === 'p2' && r.punkter[1].kode === '90PE');
  paastand('&amp; blir &', r.punkter[2].kode === 'SP & VA', r.punkter[2].kode);
  const uten = r.punkter[3];
  paastand('uten kode og desc «undefined» blir UTEN KODE', uten.kode === 'UTEN KODE', uten.kode);
  paastand('uten name får id av kode og koordinater', uten.id === 'UTEN KODE|6488796.815|429437.779|205.925', uten.id);
  sjekk('punkt uten høyde telles', r.advarsler.utenHoyde, 1, 0);
  sjekk('dobbel id telles', r.advarsler.doble, 1, 0);
  sjekk('tekst som ikke er tall telles', r.advarsler.ugyldige, 1, 0);
  sjekk('referansepunkt telles', r.advarsler.referanser, 1, 0);
  paastand('kommentarer leses ikke', !r.punkter.some(p => p.id === 'kommentert'));

  kaster('ikke LandXML gir klar beskjed', () => Ror.lesLandXML('<html></html>'), /ikke LandXML/);
  kaster('fot avvises', () => Ror.lesLandXML(
    '<LandXML><Units><Imperial linearUnit="USSurveyFoot"/></Units><CgPoints><CgPoint name="a">1 2 3</CgPoint></CgPoints></LandXML>'), /fot/);
  kaster('millimeter avvises med enheten i meldingen', () => Ror.lesLandXML(
    '<LandXML><Units><Metric linearUnit="millimeter"/></Units><CgPoints><CgPoint name="a">1 2 3</CgPoint></CgPoints></LandXML>'), /millimeter/);
  kaster('ingen punkt gir klar beskjed', () => Ror.lesLandXML('<LandXML></LandXML>'), /Fant ingen innmålte punkter/);
  const e = Ror.lesLandXML('<LandXML><CoordinateSystem epsgCode="25833"/><CgPoints><CgPoint name="a">1 2 3</CgPoint></CgPoints></LandXML>');
  sjekk('EPSG fra CoordinateSystem', e.epsg, 25833, 0);
}

/* ------------------------------------------------------------------ */
console.log('\n2. Tegnsettet i fila');
{
  const latin = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><LandXML><CgPoint code="R\xD8R">1 2 3</CgPoint></LandXML>', 'latin1');
  paastand('ISO-8859-1 gir Ø', Ror.dekod(latin).includes('RØR'));
  const utf = Buffer.from('﻿<?xml version="1.0" encoding="utf-8"?><LandXML><CgPoint code="RØR">1 2 3</CgPoint></LandXML>', 'utf8');
  const t = Ror.dekod(utf);
  paastand('UTF-8 med BOM gir Ø', t.includes('RØR'));
  paastand('BOM-en er borte', t.startsWith('<?xml'));
  paastand('ArrayBuffer går også', Ror.dekod(utf.buffer.slice(utf.byteOffset, utf.byteOffset + utf.length)).includes('RØR'));
}

/* ------------------------------------------------------------------ */
console.log('\n3. Kodene fra operatøren');
{
  // [kode, form, dim, system, materiale] – de 18 fra den ekte fila og tre til
  const fasit = [
    ['180 PE', 'linje', 180, '', 'PE'], ['90PE', 'linje', 90, '', 'PE'],
    ['40 FIBER', 'linje', 40, 'kabel', 'FIBER'], ['90PE MUFFE', 'punkt', 90, '', 'PE'],
    ['180 PE MUFFE', 'punkt', 180, '', 'PE'], ['180 PE DIFUSJON', 'linje', 180, '', 'PE'],
    ['SP 160PE', 'linje', 160, 'spill', 'PE'], ['SP MUFFE', 'punkt', null, 'spill', ''],
    ['VA MUFFE', 'punkt', null, 'vann', ''], ['VA 160PE', 'linje', 160, 'vann', 'PE'],
    ['ANNBORING', 'punkt', null, '', ''], ['110PVC', 'linje', 110, '', 'PVC'],
    ['32PE', 'linje', 32, '', 'PE'], ['VA 110PE', 'linje', 110, 'vann', 'PE'],
    ['160 GREN', 'punkt', 160, '', ''], ['STAGEKUM', 'punkt', null, '', ''],
    ['110DRENS', 'linje', 110, 'drens', ''], ['AS_BUILT_PNT', 'punkt', null, '', ''],
    ['OV 200PP', 'linje', 200, 'overvann', 'PP'], ['DR 110', 'linje', 110, 'drens', ''],
    ['SP 160 PVC', 'linje', 160, 'spill', 'PVC']
  ];
  for (const [kode, form, dim, system, materiale] of fasit) {
    const t = Ror.tolkKode(kode);
    paastand(`«${kode}» → ${form}, ${dim}, «${system}», «${materiale}»`,
      t.form === form && t.dim === dim && t.system === system && t.materiale === materiale,
      JSON.stringify(t));
  }
  paastand('resten av koden blir variant', Ror.tolkKode('180 PE DIFUSJON').variant === 'DIFUSJON');
}

/* ------------------------------------------------------------------ */
console.log('\n4. Farger og koder');
{
  const k = Ror.koderFra([{ kode: '180 PE' }, { kode: '90PE' }, { kode: '40 FIBER' },
    { kode: 'SP 160PE' }, { kode: '90PE MUFFE' }, { kode: '180 PE DIFUSJON' }, { kode: '90PE' }]);
  paastand('rør uten system får palettfarger i rekkefølge',
    k['180 PE'].farge === 'p1' && k['90PE'].farge === 'p2' && k['180 PE DIFUSJON'].farge === 'p3',
    JSON.stringify([k['180 PE'].farge, k['90PE'].farge, k['180 PE DIFUSJON'].farge]));
  paastand('fiber er kabelrør, SP er spillvann', k['40 FIBER'].farge === 'kabel' && k['SP 160PE'].farge === 'spill');
  paastand('muffen er et punkt', k['90PE MUFFE'].farge === 'punkt' && k['90PE MUFFE'].form === 'punkt');
  paastand('alt vises fra start', Object.values(k).every(x => x.vis === true));
  const k2 = Ror.koderFra([{ kode: '90PE' }, { kode: '32PE' }],
    { '90PE': { form: 'linje', dim: 90, farge: 'p5', vis: false } });
  paastand('det brukeren har rettet, står', k2['90PE'].farge === 'p5' && k2['90PE'].vis === false);
  paastand('en ny kode tar første ledige farge', k2['32PE'].farge === 'p1', k2['32PE'].farge);
  paastand('FARGER har et navn for hver nøkkel', ['vann', 'spill', 'overvann', 'drens', 'kabel', 'felles',
    'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'punkt'].every(f => typeof Ror.FARGER[f] === 'string'));
}

/* ------------------------------------------------------------------ */
console.log('\n5. Avstand til et strekk');
{
  sjekk('rett over strekket', Ror.avstandTilStrekk({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3, 1e-12);
  sjekk('forbi enden måles til enden', Ror.avstandTilStrekk({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, 1e-12);
  sjekk('et strekk uten lengde er et punkt', Ror.avstandTilStrekk({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5, 1e-12);
}

/* ------------------------------------------------------------------ */
/* Oppdiktede punkter som oppfører seg som den ekte fila: to rør i samme
   grøft målt om hverandre og fram og tilbake, et rør med samme kode 300 m
   unna, stikkledninger målt i sikksakk, og en muffe. */
function proverPunkter() {
  const ut = [];
  let nr = 0;
  const p = (kode, x, y, z) => ut.push({ id: 'p' + String(++nr).padStart(3, '0'), kode, n: y, o: x, z, tid: '', nr });
  for (let x = 0; x <= 100; x += 10) p('90PE', x, 0, 500 - x * 0.01);       // A framover
  for (let x = 0; x <= 96; x += 12) p('180 PE', x, 1, 499.5);               // B framover, 1 m ved siden av
  for (let x = 200; x >= 110; x -= 10) p('90PE', x, 0, 500 - x * 0.01);     // A bakover
  for (let x = 192; x >= 108; x -= 12) p('180 PE', x, 1, 499.5);            // B bakover
  p('32PE', 50, 12, 500.2); p('32PE', 50, 0.5, 500); p('32PE', 50, 8, 500.1); p('32PE', 50, 4, 500.05);
  p('32PE', 150, -12, 500.2); p('32PE', 150, -0.5, 500); p('32PE', 150, -6, 500.1);
  for (let x = 500; x <= 560; x += 10) p('90PE', x, 0, 495);               // C, 300 m unna
  p('90PE MUFFE', 100, 0, 499);
  return ut;
}
const iFila = p => ({ x: p.o, y: p.n });
const finn = (pts, kode, x, y) => pts.find(q => q.kode === kode && q.o === x && q.n === y).id;

console.log('\n6. Linjene trekkes etter geometri');
{
  const pts = proverPunkter();
  const ror = { punkter: pts, koder: Ror.koderFra(pts), retting: { av: [], brudd: [], koble: [] } };
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, iFila);
  const av = kode => b.linjer.filter(l => l.kode === kode);
  sjekk('fem linjer i alt', b.linjer.length, 5, 0);
  sjekk('90PE blir to linjer – A og C, ikke ett hopp på 300 m', av('90PE').length, 2, 0);
  const A = av('90PE').find(l => l.punkter.some(q => q.o === 0));
  sjekk('A går hele veien', A.lengde, 200, 1e-9);
  sjekk('og har alle 21 punktene', A.punkter.length, 21, 0);
  paastand('A starter der målingen startet', A.punkter[0].o === 0 && A.punkter[A.punkter.length - 1].o === 200);
  sjekk('C er 60 m', av('90PE').find(l => l !== A).lengde, 60, 1e-9);
  sjekk('180 PE er én linje på 192 m', av('180 PE').length === 1 ? av('180 PE')[0].lengde : NaN, 192, 1e-9);
  const stubber = av('32PE');
  sjekk('to stikkledninger', stubber.length, 2, 0);
  for (const s of stubber) sjekk('hver stikkledning er rett, ikke sikksakk', s.lengde, 11.5, 1e-9);
  const ys = stubber.find(s => s.punkter[0].o === 50).punkter.map(q => q.n);
  paastand('punktene står i rekkefølge langs stikkledningen',
    ys.every((y, i) => i === 0 || y < ys[i - 1]) || ys.every((y, i) => i === 0 || y > ys[i - 1]), ys.join(' '));
  paastand('ingen strekk over 25 m', b.linjer.every(l => l.xy.every((q, i) => i === 0
    || Math.hypot(q.x - l.xy[i - 1].x, q.y - l.xy[i - 1].y) <= 25)));
  sjekk('muffen er et objekt', b.objekter.length, 1, 0);
  sjekk('ingen enslige', b.enslige.length, 0, 0);
  paastand('id-en er kode og minste punkt-id', A.id === '90PE:p001', A.id);
  paastand('samme svar to ganger', JSON.stringify(Ror.byggLinjer(ror, Ror.StandardRormal, iFila)) === JSON.stringify(b));
}

console.log('\n7. Retting: av, brudd og kobling');
{
  const pts = proverPunkter();
  const grunn = () => ({ punkter: pts, koder: Ror.koderFra(pts), retting: { av: [], brudd: [], koble: [] } });

  const r1 = grunn();
  r1.retting.av.push(finn(pts, '90PE', 50, 0));
  const b1 = Ror.byggLinjer(r1, Ror.StandardRormal, iFila);
  const A1 = b1.linjer.find(l => l.kode === '90PE' && l.punkter.some(q => q.o === 0));
  sjekk('et punkt slått av tas ut av røret', A1.punkter.length, 20, 0);
  sjekk('men røret henger fortsatt sammen', A1.lengde, 200, 1e-9);

  const r2 = grunn();
  r2.retting.brudd.push([finn(pts, '90PE', 100, 0), finn(pts, '90PE', 110, 0)]);
  const b2 = Ror.byggLinjer(r2, Ror.StandardRormal, iFila);
  sjekk('et brudd deler A i to', b2.linjer.filter(l => l.kode === '90PE').length, 3, 0);
  const del1 = b2.linjer.find(l => l.punkter.some(q => q.o === 100 && q.kode === '90PE'));
  paastand('bruddet kan ikke kobles rundt via en nabo (90 → 110 er bare 20 m)',
    del1.punkter.every(q => q.o <= 100), del1.punkter.map(q => q.o).join(' '));

  const r3 = grunn();
  r3.retting.koble.push([finn(pts, '90PE', 200, 0), finn(pts, '90PE', 500, 0)]);
  const b3 = Ror.byggLinjer(r3, Ror.StandardRormal, iFila);
  const hele = b3.linjer.filter(l => l.kode === '90PE');
  sjekk('en kobling gjør A og C til ett rør', hele.length, 1, 0);
  sjekk('over hele lengden', hele[0].lengde, 560, 1e-9);

  const r4 = grunn();
  r4.retting.brudd.push(['finnes-ikke', 'heller-ikke']);
  r4.retting.koble.push(['borte', 'vekk']);
  const b4 = Ror.byggLinjer(r4, Ror.StandardRormal, iFila);
  sjekk('et brudd uten treff telles', b4.bruddUtenTreff, 1, 0);
  sjekk('en kobling uten treff telles', b4.koblingUtenTreff, 1, 0);

  const r5 = grunn();
  r5.punkter = pts.concat([{ id: 'ensom', kode: '90PE', n: 1000, o: 1000, z: 1, nr: 999 }]);
  sjekk('et punkt uten nabo blir enslig', Ror.byggLinjer(r5, Ror.StandardRormal, iFila).enslige.length, 1, 0);

  const r6 = grunn();
  r6.koder['32PE'].vis = false;
  paastand('en kode som er slått av, tegnes ikke',
    !Ror.byggLinjer(r6, Ror.StandardRormal, iFila).linjer.some(l => l.kode === '32PE'));

  const r7 = grunn();
  sjekk('mindre maks avstand deler røret', Ror.byggLinjer(r7, { maksAvstand: 9 }, iFila)
    .linjer.filter(l => l.kode === '90PE').length, 0, 0);
}

/* ------------------------------------------------------------------ */
console.log('\n8. Koordinater og sone');
{
  const p = { n: 6488855.307, o: 429458.503 };
  const lik = Ror.lagTilXY(32, 32)(p);
  paastand('samme sone rører ikke tallene', lik.x === p.o && lik.y === p.n);
  const ll = Ror.tilLatLon(p, 32);
  sjekk('breddegrad i sone 32', ll[0], 58.5344902, 1e-6);
  sjekk('lengdegrad i sone 32', ll[1], 7.7884438, 1e-6);
  const i33 = Ror.lagTilXY(32, 33)(p);
  sjekk('øst i sone 33', i33.x, 80607.345, 0.01);
  sjekk('nord i sone 33', i33.y, 6510777.683, 0.01);

  paastand('vanlige UTM-tall er i orden', Ror.sjekkKoordinater([p]) === null);
  const galt = Ror.sjekkKoordinater([p, { n: 1234567.8, o: 100000 }]);
  paastand('NTM-aktige tall gir en forklaring', typeof galt === 'string' && /ikke ser ut som UTM/.test(galt), galt);

  const pts = [p];
  paastand('EPSG fra fila vinner', Ror.gjettSone(pts, 25833, []).sone === 33);
  paastand('og grunnen er fila', Ror.gjettSone(pts, 25833, []).grunn === 'fila');
  paastand('5972 er UTM32 med NN2000', Ror.gjettSone(pts, 5972, []).sone === 32);
  const agder = Ror.gjettSone(pts, null, [{ lat: 58.53, lon: 7.79 }]);
  paastand('nær et anlegg i Agder: sone 32', agder.sone === 32 && agder.grunn === 'prosjektet', JSON.stringify(agder));
  const sverige = Ror.gjettSone(pts, null, [{ lat: 58.53, lon: 13.79 }]);
  paastand('nær et anlegg i Sverige: sone 33', sverige.sone === 33, JSON.stringify(sverige));
  const ingen = Ror.gjettSone(pts, null, []);
  paastand('uten noe å gå etter: 32', ingen.sone === 32 && ingen.grunn === 'standard');
  const langt = Ror.gjettSone(pts, null, [{ lat: 69.9, lon: 23.3 }]);
  paastand('anlegg over 100 km unna teller ikke', langt.grunn === 'standard', JSON.stringify(langt));
}

/* ------------------------------------------------------------------ */
console.log('\n9. Ny import av samme anlegg');
{
  const gamle = [{ id: 'a', kode: 'X', n: 1, o: 1, z: 1 }, { id: 'b', kode: 'X', n: 2, o: 2, z: 2 }];
  const nye = [{ id: 'b', kode: 'X', n: 2, o: 2, z: 2.5 }, { id: 'c', kode: 'X', n: 3, o: 3, z: 3 }];
  const s = Ror.slaSammen(gamle, nye);
  sjekk('tre punkt etterpå', s.punkter.length, 3, 0);
  paastand('nye, kjente og endrede telles', s.nye === 1 && s.kjente === 1 && s.endret === 1, JSON.stringify(s));
  sjekk('det endrede får ny høyde', s.punkter.find(q => q.id === 'b').z, 2.5, 0);
  sjekk('de gamle røres ikke', gamle[1].z, 2, 0);
  paastand('ingenting slettes stille', s.punkter.some(q => q.id === 'a'));
}

/* ------------------------------------------------------------------ */
console.log('\n10. Navn fra filnavnet');
{
  for (const [inn, ut] of [
    ['asbuilts_VA Prøvefelt_2026-09-15T08_30_00.000Z.xml', 'VA Prøvefelt'],
    ['C:\\Users\\x\\Downloads\\asbuilts_Fiber_2026-01-02.xml', 'Fiber'],
    ['as-built Hytte 4.xml', 'Hytte 4'],
    ['ror_langs_vegen.xml', 'ror langs vegen'],
    ['asbuilts_2026-09-15T08_30_00.000Z.xml', 'Rør']
  ]) paastand(`«${inn}» → «${ut}»`, Ror.navnFraFil(inn) === ut, Ror.navnFraFil(inn));
}

/* ------------------------------------------------------------------ */
console.log('\n11. Profil og overdekning');
{
  const linje = {
    punkter: [{ z: 100 }, { z: 99 }, { z: 99.5 }],
    xy: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
  };
  const skraa = (x) => 101 + 0.1 * x;
  const p = Ror.profil(linje, (x, y) => skraa(x), 110);
  sjekk('lengden', p.lengde, 20, 1e-12);
  sjekk('en prøve per meter og i hvert målte punkt', p.prover.length, 21, 0);
  const ved = s => p.prover.find(q => Math.abs(q.s - s) < 1e-9);
  sjekk('overdekning ved start', ved(0).overdekning, 1.0, 1e-9);
  sjekk('overdekning ved 5 m (topp interpolert)', ved(5).overdekning, 2.0, 1e-9);
  sjekk('overdekning ved 10 m', ved(10).overdekning, 3.0, 1e-9);
  sjekk('overdekning ved slutten', ved(20).overdekning, 3.5, 1e-9);
  sjekk('senter er en halv diameter under toppen', ved(0).senter, 100 - 0.055, 1e-9);
  sjekk('bunn er en hel diameter under', ved(0).bunn, 100 - 0.11, 1e-9);
  paastand('de målte punktene er merket', p.prover.filter(q => q.maalt).length === 3);
  sjekk('minste overdekning', p.minOverdekning, 1.0, 1e-9);
  sjekk('største overdekning', p.maksOverdekning, 3.5, 1e-9);
  sjekk('fallet på første strekk', p.fall[0].fall, -0.1, 1e-12);
  sjekk('og på andre', p.fall[1].fall, 0.05, 1e-12);

  const hull = Ror.profil(linje, (x) => (x >= 12 && x <= 15 ? NaN : skraa(x)), 110);
  sjekk('meter uten terreng', hull.utenTerreng, 4, 1e-9);
  paastand('ukjent overdekning er NaN, ikke null', Number.isNaN(hull.prover.find(q => q.s === 13).overdekning));

  // 99,65 og ikke 99,6: ved s = 4 er toppen 99,6, og der ville flyttallsstøy avgjort svaret
  const over = Ror.profil(linje, () => 99.65, 110);
  sjekk('meter der røret ligger over terrenget', over.overTerreng, 4, 1e-9);
  sjekk('og minste overdekning er negativ', over.minOverdekning, -0.35, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n12. Objekter langs røret, sammendrag og merknader');
{
  const linje = { id: 'L', kode: '90PE', punkter: [{ z: 1 }, { z: 1 }], xy: [{ x: 0, y: 0 }, { x: 100, y: 0 }], lengde: 100 };
  const obj = Ror.objekterLangs(linje, [
    { kode: 'MUFFE', o: 40, n: 1, z: 1.2 }, { kode: 'LANGT', o: 40, n: 10, z: 0 }, { kode: 'ANBORING', o: 10, n: -2, z: 1.1 }
  ], q => ({ x: q.o, y: q.n }), 3);
  sjekk('bare objektene innen 3 m', obj.length, 2, 0);
  paastand('sortert langs røret', obj[0].kode === 'ANBORING' && obj[1].kode === 'MUFFE');
  sjekk('stasjonen til muffen', obj[1].s, 40, 1e-9);

  const profiler = new Map([['L', { minOverdekning: -0.2, maksOverdekning: 2.4, overTerreng: 3, utenTerreng: 0 }]]);
  const s = Ror.sammendrag({ linjer: [linje], profiler, bakkefaktor: 1.0004 });
  sjekk('lengden er korrigert til bakken', s.lengde, 100.04, 1e-9);
  paastand('antall og overdekning', s.antall === 1 && s.minOd === -0.2 && s.maksOd === 2.4);

  const m = Ror.merknader({ linjer: [linje], enslige: [{}], bruddUtenTreff: 1, koblingUtenTreff: 0 }, profiler, 25);
  paastand('enslige punkt nevnes', m.some(x => x.type === 'enslig' && /25 m/.test(x.tekst)));
  paastand('brudd som ikke gjelder nevnes', m.some(x => x.type === 'retting'));
  paastand('røret over terrenget nevnes med koden', m.some(x => x.type === 'over' && /^90PE/.test(x.tekst)));
}

/* ------------------------------------------------------------------ */
console.log('\n13. Terreng langs rørene');
{
  const { Terreng } = require(js('terreng.js'));
  const k = Ror.korridor([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  sjekk('korridoren er like lang som røret', k.lengde, 20, 1e-12);
  const q = k.punktVed(15);
  paastand('punkt og retning midt på andre strekk', Math.abs(q.x - 10) < 1e-9 && Math.abs(q.y - 5) < 1e-9
    && Math.abs(q.retning - Math.PI / 2) < 1e-12, JSON.stringify(q));
  paastand('forbi enden holder seg på enden', Math.abs(k.punktVed(99).y - 10) < 1e-9);
  const ett = Ror.korridor([{ x: 3, y: 4 }]);
  paastand('ett punkt gir lengde 0 uten å kaste', ett.lengde === 0 && ett.punktVed(0).x === 3);

  const T = new Terreng(32, 1);
  const f = T.korridorFliser(Ror.korridor([{ x: 100, y: 100 }, { x: 600, y: 100 }]), 10);
  paastand('flisene langs et rett rør', f.size === 3 && ['0_0', '1_0', '2_0'].every(n => f.has(n)), [...f].join(' '));

  let bestilt = null;
  T._lastFliser = async trengs => { bestilt = trengs; return { hentet: trengs.size, mangler: 0 }; };
  await T.lastKorridorer([Ror.korridor([{ x: 100, y: 100 }, { x: 600, y: 100 }]),
    Ror.korridor([{ x: 100, y: 300 }, { x: 120, y: 300 }])], 10);
  paastand('to rør gir ÉN bestilling med flisene til begge', bestilt && bestilt.has('0_1') && bestilt.has('2_0'),
    bestilt && [...bestilt].join(' '));
}

/* ------------------------------------------------------------------ */
console.log('\n14. Røranlegget i prosjektfila');
{
  const Prosjektform = require(js('prosjektform.js'));
  const M = require(js('masser.js'));
  const lag = () => ({ navn: 'x', anlegg: [
    { id: 'v1', type: 'veg', ip: [], vip: [], mal: Object.assign({}, M.StandardMal) },
    { id: 'r1', type: 'ror', navn: 'VA', ror: { sone: 32, punkter: [{ id: 'a', kode: '90PE', n: 1, o: 2, z: 3, nr: 1 }] } }
  ], aktivt: 'r1' });
  const P = Prosjektform.klargjor(lag());
  const r = P.anlegg[1];
  paastand('røranlegget beholder punktene', r.ror.punkter.length === 1);
  paastand('og får tomme rettinger', ['av', 'brudd', 'koble'].every(k => Array.isArray(r.ror.retting[k])));
  paastand('og kilder og koder', Array.isArray(r.ror.kilder) && typeof r.ror.koder === 'object');
  sjekk('og rørmalen', r.mal.maksAvstand, 25, 0);
  paastand('ikke vegmalen', !('vegbredde' in r.mal));
  paastand('og tomme lister for vegfeltene', Array.isArray(r.ip) && Array.isArray(r.vip));
  paastand('P.ror er et vindu inn i det aktive anlegget', P.ror === r.ror);
  paastand('P.ror står ikke på toppnivå i fila', !/^\{[^{]*"ror"/.test(JSON.stringify(P)));
  paastand('et røranlegg gjør ikke prosjektet «eldre enn utskiftingen»', P.utskiftingErNy === false);
  Prosjektform.klargjor(P);
  paastand('heller ikke ved andre klargjøring (angre)', P.utskiftingErNy === false);
  const Q = Prosjektform.klargjor({ navn: 'y', ubestemt: true, aktivt: 'r1',
    anlegg: [{ id: 'r1', type: 'ror', ror: { punkter: [{ id: 'a', kode: 'X', n: 1, o: 2, z: 3, nr: 1 }] } }] });
  paastand('et prosjekt med innmålte rør er ikke ubestemt', !Q.ubestemt);
  const R = Prosjektform.klargjor({ navn: 'z', aktivt: 'r1', anlegg: [{ id: 'r1', ror: { punkter: [] } }] });
  paastand('et anlegg uten type men med ror-felt blir rør', R.anlegg[0].type === 'ror');
}

/* ------------------------------------------------------------------ */
console.log('\n15. Spenn som kan leses');
{
  const f = v => String(v).replace('.', ',').replace('-', '−');
  paastand('to positive tall får tankestrek', Ror.spenn(0.5, 2.25, f) === '0,5–2,25', Ror.spenn(0.5, 2.25, f));
  paastand('et negativt tall får «til»', Ror.spenn(-1.5, 2, f) === '−1,5 til 2', Ror.spenn(-1.5, 2, f));
  paastand('ukjent er en strek', Ror.spenn(NaN, NaN, f) === '–', Ror.spenn(NaN, NaN, f));
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
})();
