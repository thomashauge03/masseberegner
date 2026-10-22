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
  /* Et tegnnummer utenfor Unicode kastet RangeError fra String.fromCodePoint,
     og hele fila ble avvist med «Invalid code point 1114112». */
  let tegn;
  try {
    tegn = Ror.lesLandXML('<LandXML><CgPoints><CgPoint name="a" code="R&#x110000;R &#216;">1 2 3</CgPoint></CgPoints></LandXML>');
  } catch (feilen) { tegn = feilen; }
  paastand('et tegnnummer utenfor Unicode står som det står', !(tegn instanceof Error)
    && tegn.punkter[0].kode === 'R&#x110000;R Ø', tegn instanceof Error ? tegn.message : tegn.punkter[0].kode);
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
  paastand('id-en er kode og de to endene', A.id === '90PE:p001~p021', A.id);
  paastand('samme svar to ganger', JSON.stringify(Ror.byggLinjer(ror, Ror.StandardRormal, iFila)) === JSON.stringify(b));
}

console.log('\n6b. Et rør med en gren');
{
  /* Der et rør forgrener seg, er grenpunktet med i tre polylinjer. Id-en var
     kode + minste punkt-id, og grenpunktet var ofte det minste i flere av
     dem: rørene fikk samme id, og profilen til det ene ble vist for alle.
     Målt i den ekte fila: tre 32PE-rør på 6, 5 og 2 m sto med nøyaktig samme
     overdekning, 0,03–0,18 m. */
  const pts = [];
  let nr = 0;
  const p = (x, y) => pts.push({ id: 'g' + String(++nr).padStart(2, '0'), kode: '90PE', n: y, o: x, z: 1, tid: '', nr });
  p(40, 0);                                   // g01 – grenpunktet har lavest id
  for (let x = 0; x <= 32; x += 8) p(x, 0);   // hovedløpet før grenen
  for (let x = 48; x <= 80; x += 8) p(x, 0);  // og etter
  p(40, 3);                                   // en stubb rett ut fra grenpunktet
  const b = Ror.byggLinjer({ punkter: pts, koder: {}, retting: { av: [], brudd: [], koble: [] } },
    Ror.StandardRormal, iFila);
  sjekk('tre rør møtes i grenpunktet', b.linjer.length, 3, 0);
  paastand('og hvert har sin egen id', new Set(b.linjer.map(l => l.id)).size === b.linjer.length,
    b.linjer.map(l => l.id).join(' '));
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

  const iOrden = Ror.sjekkKoordinater([p]);
  paastand('vanlige UTM-tall er i orden', iOrden.melding === null && iOrden.utenfor === 0
    && iOrden.punkter.length === 1, JSON.stringify(iOrden));
  /* Et punkt målt uten fix kan bli skrevet som 0 0 0. Det skal ikke stoppe en
     fil med hundrevis av gode punkt – det hoppes over og telles. */
  const glipp = Ror.sjekkKoordinater([p, Object.assign({}, p, { id: 'b' }), { id: 'c', n: 0, o: 0, z: 0 }]);
  paastand('ett punkt utenfor hoppes over og telles', glipp.melding === null && glipp.utenfor === 1
    && glipp.punkter.length === 2 && !glipp.punkter.some(q => q.id === 'c'), JSON.stringify(glipp));
  paastand('erUtm sier det samme', Ror.erUtm(p) && !Ror.erUtm({ n: 0, o: 0 }));
  const galt = Ror.sjekkKoordinater([p, { n: 1234567.8, o: 100000 }, { n: 1234570, o: 100010 }]);
  paastand('er flertallet NTM-aktig, stoppes fila med en forklaring',
    typeof galt.melding === 'string' && /ikke ser ut som UTM/.test(galt.melding), galt.melding);
  paastand('halvparten er også for mye', typeof Ror.sjekkKoordinater([p, { n: 1, o: 1 }]).melding === 'string');

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

  /* EN FIL KAN INNEHOLDE HVA SOM HELST. Den kan være redigert for hånd eller
     sendt fra en kollega, og feltene går rett inn i regnestykker og skjemaer:
     en dimensjon som tekst limes inn i HTML-en uten escaping, og en sone som
     ikke finnes gir NaN i hver koordinat. */
  const F = Prosjektform.klargjor({ navn: 'f', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror',
    mal: { maksAvstand: '9999' },
    ror: {
      sone: 34,
      punkter: [{ id: 'a', kode: '90PE', n: 1, o: 2, z: 3, nr: 1 }, { id: 'b', kode: 'NY KODE', n: 1, o: 2, z: 3, nr: 2 }],
      koder: {
        '90PE': { form: 'sirkel', dim: '"><img src=x onerror=alert(1)>', farge: 'rød', vis: 'ja' },
        '110PVC': { form: 'linje', dim: '110', farge: 'vann', vis: false },
        'TULL': 'ikke et objekt'
      },
      kilder: [{ fil: 'x.xml', antall: '<b>12</b>' }, null]
    } }] });
  const fr = F.anlegg[0].ror;
  sjekk('maks avstand utenfor 5–200 blir standarden', F.anlegg[0].mal.maksAvstand, 25, 0);
  sjekk('en sone som ikke finnes blir 32', fr.sone, 32, 0);
  paastand('en dimensjon som ikke er et tall blir null', fr.koder['90PE'].dim === null, String(fr.koder['90PE'].dim));
  paastand('en dimensjon som tekst blir tall', fr.koder['110PVC'].dim === 110, String(fr.koder['110PVC'].dim));
  paastand('en form som ikke finnes blir tolket fra koden', fr.koder['90PE'].form === 'linje', fr.koder['90PE'].form);
  paastand('en farge som ikke finnes blir en som gjør det', fr.koder['90PE'].farge in Ror.FARGER, fr.koder['90PE'].farge);
  paastand('vis er sant eller usant', fr.koder['90PE'].vis === true && fr.koder['110PVC'].vis === false);
  paastand('en kode som ikke er et objekt tas bort', !('TULL' in fr.koder));
  paastand('en kode punktene har men tabellen mangler, legges til', !!fr.koder['NY KODE']
    && fr.koder['NY KODE'].form === 'punkt', JSON.stringify(fr.koder['NY KODE']));
  paastand('kilder som ikke er objekter tas bort', fr.kilder.length === 1);
  paastand('antall punkt i kilden er et tall', fr.kilder[0].antall === 0, String(fr.kilder[0].antall));
  const G = Prosjektform.klargjor({ navn: 'g', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror',
    mal: { maksAvstand: 40 }, ror: { sone: '33', punkter: [], kilder: [{ fil: 'y.xml', antall: 120 }] } }] });
  sjekk('en lovlig maks avstand står', G.anlegg[0].mal.maksAvstand, 40, 0);
  sjekk('en sone som tekst blir tall', G.anlegg[0].ror.sone, 33, 0);
  sjekk('et lovlig antall står', G.anlegg[0].ror.kilder[0].antall, 120, 0);

  /* Punktene og rettingene kan også være hva som helst. Et `null` i lista
     stoppet åpningen av hele prosjektet – med panelene alt tømt og det gamle
     prosjektet fortsatt lastet – og et rettingspar som ikke var et par, fikk
     linjebyggingen til å kaste. */
  let H, hKast = null;
  try {
    H = Prosjektform.klargjor({ navn: 'h', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror', ror: {
      punkter: [null, 'tull', { id: 'a', kode: '90PE', n: 1, o: 2, z: 3, nr: 1 },
        { id: 5, n: '6488855.3', o: 429458.5, z: 206 }, { id: 'c', kode: 'X', n: 1, o: 2 }],
      retting: { av: ['a', null, 7], brudd: [['a', 'b'], 'tull', [1], null], koble: [['a', 'b', 'c'], {}, ['x', 'y']] }
    } }] });
  } catch (e) { hKast = e.message; }
  paastand('et prosjekt med ødelagte punkt kan åpnes', !hKast, hKast);
  const hr = H && H.anlegg[0].ror;
  paastand('punkt som ikke er objekter eller mangler en høyde, tas bort', !!hr && hr.punkter.length === 2,
    hr && JSON.stringify(hr.punkter));
  paastand('id og kode blir tekst, og en manglende kode blir UTEN KODE', !!hr && hr.punkter[1].id === '5'
    && hr.punkter[1].kode === 'UTEN KODE', hr && JSON.stringify(hr.punkter[1]));
  paastand('tall som tekst blir tall', !!hr && hr.punkter[1].n === 6488855.3);
  paastand('rettingene blir id-er og par av id-er', !!hr && JSON.stringify(hr.retting)
    === JSON.stringify({ av: ['a', '7'], brudd: [['a', 'b']], koble: [['x', 'y']], flytt: {}, nye: [] }), hr && JSON.stringify(hr.retting));
  let bKast = null;
  try { if (hr) Ror.byggLinjer(hr, H.anlegg[0].mal, iFila); } catch (e) { bKast = e.message; }
  paastand('og linjene kan bygges', !bKast, bKast);
}

/* ------------------------------------------------------------------ */
console.log('\n15. Spenn som kan leses');
{
  const f = v => String(v).replace('.', ',').replace('-', '−');
  paastand('to positive tall får tankestrek', Ror.spenn(0.5, 2.25, f) === '0,5–2,25', Ror.spenn(0.5, 2.25, f));
  paastand('et negativt tall får «til»', Ror.spenn(-1.5, 2, f) === '−1,5 til 2', Ror.spenn(-1.5, 2, f));
  paastand('ukjent er en strek', Ror.spenn(NaN, NaN, f) === '–', Ror.spenn(NaN, NaN, f));
}

/* ------------------------------------------------------------------ */
console.log('\n15a. Dimensjonen');
{
  /* Samme regel i kodetabellen og i klargjøringen. Tabellen tok 5 000 mm, og
     klargjøringen tok den bort igjen ved neste angre. */
  paastand('tall og tekst', Ror.dimensjon(110) === 110 && Ror.dimensjon('160') === 160);
  paastand('over 3 000 mm er ingen dimensjon', Ror.dimensjon(5000) === null);
  paastand('null og tekst som ikke er tall heller ikke', Ror.dimensjon(0) === null && Ror.dimensjon('abc') === null
    && Ror.dimensjon(null) === null);
}

/* ------------------------------------------------------------------ */
console.log('\n15b. Kilden som tekst');
{
  paastand('fil, program, dato og antall', Ror.kildetekst({ fil: 'a.xml', program: 'Xsite Manage', dato: '2026-09-15', antall: 12 })
    === 'a.xml · Xsite Manage · 2026-09-15 · 12 punkt');
  paastand('det som mangler, utelates', Ror.kildetekst({ fil: 'a.xml', antall: 3 }) === 'a.xml · 3 punkt');
  paastand('en omregning står med', Ror.kildetekst({ fil: 'b.xml', antall: 1, regnetOm: { fra: 33, til: 32 } })
    === 'b.xml · 1 punkt · regnet om fra UTM 33 til UTM 32');
}

/* ------------------------------------------------------------------ */
console.log('\n16. Hvert objekt på det røret det sitter på');
{
  const A = { id: 'A', punkter: [{ z: 1 }, { z: 1 }], xy: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const B = { id: 'B', punkter: [{ z: 1 }, { z: 1 }], xy: [{ x: 0, y: 1 }, { x: 100, y: 1 }] };
  const plass = Ror.objekterPaaLinjer([A, B], [
    { kode: '90PE MUFFE', o: 50, n: 0.1, z: 1 }, { kode: '180 PE MUFFE', o: 70, n: 0.9, z: 1 },
    { kode: 'LANGT', o: 50, n: 30, z: 1 }
  ], q => ({ x: q.o, y: q.n }), 3);
  paastand('muffen på A står bare på A', plass.get('A').length === 1 && plass.get('A')[0].kode === '90PE MUFFE',
    JSON.stringify([...plass].map(([k, v]) => [k, v.map(o => o.kode)])));
  paastand('muffen på B står bare på B', plass.get('B').length === 1 && plass.get('B')[0].kode === '180 PE MUFFE');
  paastand('det som er langt unna, står på ingen', ![...plass.values()].flat().some(o => o.kode === 'LANGT'));

  /* Koden avgjør før avstanden. Målt i den ekte fila: en «180 PE MUFFE» lå en
     drøy halvmeter nærmere 90PE enn 180 PE i samme grøft, og havnet på feil
     profil – oppå muffen til 90PE. */
  const R90 = { id: 'R90', kode: '90PE', punkter: [{ z: 1 }, { z: 1 }], xy: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const R180 = { id: 'R180', kode: '180 PE', punkter: [{ z: 1 }, { z: 1 }], xy: [{ x: 0, y: 1 }, { x: 100, y: 1 }] };
  const etterKode = Ror.objekterPaaLinjer([R90, R180], [
    { kode: '180 PE MUFFE', o: 40, n: 0.3, z: 1 }, { kode: 'ANNBORING', o: 60, n: 0.3, z: 1 }
  ], q => ({ x: q.o, y: q.n }), 3);
  paastand('180 PE-muffen går til 180 PE selv om 90PE er nærmere',
    etterKode.get('R180').some(o => o.kode === '180 PE MUFFE'),
    JSON.stringify([...etterKode].map(([k, v]) => [k, v.map(o => o.kode)])));
  paastand('en anboring uten dimensjon går til det nærmeste', etterKode.get('R90').some(o => o.kode === 'ANNBORING'));
  /* Kodetabellen vinner over tolkningen. Har brukeren rettet dimensjonen på
     et rør, skal muffene med den dimensjonen finne det – ikke det nærmeste. */
  const rettet = Ror.objekterPaaLinjer([R90, R180], [{ kode: '110 PE MUFFE', o: 40, n: 0.7, z: 1 }],
    q => ({ x: q.o, y: q.n }), 3, { '90PE': { form: 'linje', dim: 110, system: '' } });
  paastand('dimensjonen fra kodetabellen gjelder', rettet.get('R90').some(o => o.kode === '110 PE MUFFE'),
    JSON.stringify([...rettet].map(([k, v]) => [k, v.map(o => o.kode)])));
}

/* ------------------------------------------------------------------ */
console.log('\n17. Makin\' Excavator: LandXML med koden i navnet');
{
  /* Oppdiktet. Slik skriver Kinematic: en kode valgt fra lista står i `code`
     og navnet er «P3 (0)»; en kode operatøren skrev selv, står i navnet, og
     `code` er bare «Punkt». Rota har alltid 2008-01-08. */
  const egen = (tid) => `<Feature Code="Logpoint"><Property label="App" value="Makin&apos; Excavator"/>`
    + `<Property label="CreateTime" value="${tid}"/></Feature>`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<LandXML version="1.2" date="2008-01-08" xmlns="http://www.landxml.org/schema/LandXML-1.2">
<Application name="kblexport" manufacturer="Kinematic Aps"/><Project name="Prøvefelt"/>
<Units><Metric linearUnit="meter"/></Units>
<PlanFeatures><PlanFeature name="L1 (0)" desc="Linje"><CoordGeom><Line><Start>6600000 500000 100</Start><End>6600001 500000 100</End></Line></CoordGeom></PlanFeature></PlanFeatures>
<CgPoints><CgPoint name="P3 (0)" code="180 vann">6600010.000 500000.000 100.000</CgPoint>${egen('2026-05-02 10:00:00')}</CgPoints>
<CgPoints><CgPoint name="vann 63 (1)" code="Punkt">6600020.000 500000.000 100.100</CgPoint>${egen('2026-05-03 10:00:00')}</CgPoints>
<CgPoints><CgPoint name="vann63(1) (1)" code="Punkt">6600030.000 500000.000 100.200</CgPoint>${egen('2026-05-03 10:01:00')}</CgPoints>
<CgPoints><CgPoint name="Vann 63(2) (1)" code="Punkt">6600040.000 500000.000 100.300</CgPoint>${egen('2026-05-03 10:02:00')}</CgPoints>
<CgPoints><CgPoint name="Sveisemuffe vann 63 (1)" code="Punkt">6600035.000 500000.000 100.250</CgPoint>${egen('2026-05-03 10:03:00')}</CgPoints>
<CgPoints><CgPoint name="P9 (1)" code="Punkt">6600050.000 500000.000 100.400</CgPoint>${egen('2026-05-04 10:00:00')}</CgPoints>
<CgPoints><CgPoint name="LP1 (L1 (0))" code="Linjepunkt">6600000.000 500000.000 100.000</CgPoint></CgPoints>
<CgPoints><CgPoint name="P1Endepunkt 160 (1)" code="Punkt">6600060.000 500000.000 100.500</CgPoint></CgPoints>
<CgPoints><CgPoint name="P4 (0)" code="tr40">6600100.000 500010.000 99.000</CgPoint></CgPoints>
<CgPoints><CgPoint name="tr40(1) (0)" code="Punkt">6600110.000 500010.000 99.000</CgPoint></CgPoints>
</LandXML>`;
  const r = Ror.lesFil(xml);
  const kode = id => (r.punkter.find(p => p.id === id) || {}).kode;
  sjekk('ti punkt', r.punkter.length, 10, 0);
  paastand('koden fra navnet får listas skrivemåte når bare mellomrom skiller', kode('tr40(1) (0)') === 'tr40',
    kode('tr40(1) (0)'));
  paastand('en kode fra lista står som den står', kode('P3 (0)') === '180 vann', kode('P3 (0)'));
  paastand('«Punkt» gir koden fra navnet, uten tellerne',
    kode('vann 63 (1)') === 'vann 63' && kode('vann63(1) (1)') === 'vann 63' && kode('Vann 63(2) (1)') === 'vann 63',
    [kode('vann 63 (1)'), kode('vann63(1) (1)'), kode('Vann 63(2) (1)')].join(' / '));
  paastand('navnet blir id-en, uendret', r.punkter.some(p => p.id === 'vann63(1) (1)'));
  paastand('bare et punktnummer gir ingen kode', kode('P9 (1)') === 'Punkt' && kode('LP1 (L1 (0))') === 'Linjepunkt',
    kode('P9 (1)') + ' / ' + kode('LP1 (L1 (0))'));
  paastand('punktnummeret foran koden tas bort', kode('P1Endepunkt 160 (1)') === 'endepunkt 160', kode('P1Endepunkt 160 (1)'));
  paastand('programmet er det som målte', r.program === "Makin' Excavator", r.program);
  paastand('2008-datoen i rota byttes mot siste målte punkt', r.dato === '2026-05-04', r.dato);
  paastand('tiden fra CreateTime', r.punkter[0].tid === '2026-05-02 10:00:00', r.punkter[0].tid);
  const ror = { punkter: r.punkter, koder: Ror.koderFra(r.punkter), retting: {} };
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, iFila);
  const v63 = b.linjer.filter(l => l.kode === 'vann 63');
  paastand('«vann 63» er ett rør med tre punkt', v63.length === 1 && v63[0].punkter.length === 3,
    JSON.stringify(b.linjer.map(l => [l.kode, l.punkter.length])));
  paastand('sveisemuffen er et punkt på røret', b.objekter.some(p => p.kode === 'sveisemuffe vann 63'));
  /* Et rør skrevet slik blir ikke lenger «Punkt» – det var feilen: alle
     punktene uten kode fra lista havnet i samme punktsett, og ingen linje ble trukket. */
  paastand('ingen linje heter «Punkt»', !b.linjer.some(l => l.kode === 'Punkt'));
}

/* ------------------------------------------------------------------ */
console.log('\n18. SOSI fra maskinstyringen');
{
  const sos = [
    '.HODE', '..TEGNSETT UTF-8', '..TRANSPAR', '...KOORDSYS 22', '...ORIGO-NØ 6600000 500000', '...ENHET 0.001',
    '..SOSI-VERSJON 5.0', '..DATO 01/02/2008 10:00:00',
    '..APPLICATION', '...Navn kblexport',
    '.KURVE 1:', '..NAME L1', '..OBJTYPE Linje', '..NØH', '0 0 100000', '1000 0 100000',
    '.PUNKT 2:', '..NAME P3 (0)', '..OBJTYPE 180 vann', '..App "Makin\' Excavator"',
    '..CreateTime "2026-05-02 10:00:00"', '..NØH', '10000 0 100000',
    '.PUNKT 3:', '..NAME vann63(1) (1)', '..OBJTYPE Punkt', '..CreateTime "2026-05-03 10:00:00"',
    '..NØH 20000 1500 100250 ! kommentar',
    '.PUNKT 4:', '..NAME vann 63 (1)', '..OBJTYPE Punkt', '..NØH', '30000 0 100500',
    '.PUNKT 5:', '..NAME uten høyde', '..OBJTYPE Punkt', '..NØ', '40000 0',
    '.PUNKT 6:', '..NAME vann 63 (1)', '..OBJTYPE Punkt', '..NØH', '50000 0 100500',
    '.SLUTT'
  ].join('\r\n');
  const r = Ror.lesFil(sos);
  sjekk('tre punkt', r.punkter.length, 3, 0);
  const p = r.punkter.find(q => q.id === 'vann63(1) (1)');
  sjekk('nord = origo + tall × enhet', p.n, 6600020, 1e-6);
  sjekk('øst = origo + tall × enhet', p.o, 500001.5, 1e-6);
  sjekk('høyden i meter', p.z, 100.25, 1e-9);
  paastand('tallene på samme linje som ..NØH, og kommentaren tas bort', Number.isFinite(p.z));
  paastand('koden fra OBJTYPE, eller fra navnet når den er «Punkt»',
    r.punkter[0].kode === '180 vann' && p.kode === 'vann 63', r.punkter.map(q => q.kode).join(' / '));
  sjekk('KOORDSYS 22 er UTM 32', r.epsg, 25832, 0);
  sjekk('kurven telles', r.advarsler.ikkePunkt, 1, 0);
  sjekk('punkt uten høyde telles', r.advarsler.utenHoyde, 1, 0);
  sjekk('dobbelt navn telles', r.advarsler.doble, 1, 0);
  paastand('programmet fra punktene', r.program === "Makin' Excavator", r.program);
  paastand('en dato som ikke er ÅÅÅÅMMDD brukes ikke', r.dato === '2026-05-03', r.dato);
  const std = Ror.lesSOSI('.HODE\n..DATO 20260601\n...ENHET 0.01\n.PUNKT 1:\n..OBJTYPE 110PE\n..NØH\n660000000 50000000 10000\n.SLUTT');
  paastand('..DATO ÅÅÅÅMMDD og ENHET 0.01', std.dato === '2026-06-01' && Math.abs(std.punkter[0].z - 100) < 1e-9
    && Math.abs(std.punkter[0].n - 6600000) < 1e-6, JSON.stringify([std.dato, std.punkter[0]]));
  const latin = Buffer.from('.HODE\r\n..TEGNSETT ISO8859-10\r\n.PUNKT 1:\r\n..OBJTYPE R\xD8R 110\r\n..N\xD8H\r\n1 2 3\r\n.SLUTT', 'latin1');
  const t = Ror.dekod(latin);
  paastand('..TEGNSETT ISO8859-10 gir Ø', t.includes('RØR 110') && t.includes('..NØH'));
  paastand('og fila leses', Ror.lesFil(t).punkter[0].kode === 'RØR 110');
  kaster('verken SOSI, LandXML eller KOF gir klar beskjed', () => Ror.lesFil('hei'), /verken LandXML, SOSI eller KOF/);
}

/* ------------------------------------------------------------------ */
console.log('\n19. Kodene fra Makin\' Excavator');
{
  const fasit = [
    ['vann 63', 'linje', 63, 'vann'], ['160 kloakk', 'linje', 160, 'spill'],
    ['spillvann 160', 'linje', 160, 'spill'], ['tr 40', 'linje', 40, 'kabel'],
    ['kabel gatelys', 'linje', null, 'kabel'], ['el muffe 110 vann', 'punkt', 110, 'vann'],
    ['sveisemuffe vann 110', 'punkt', 110, 'vann'], ['45 grader bend 110 vann', 'punkt', 110, 'vann'],
    ['andborring vann', 'punkt', null, 'vann'], ['sveisskjøt 50', 'punkt', 50, ''],
    ['50mm vann', 'linje', 50, 'vann'], ['110 grenrør kloakk', 'punkt', 110, 'spill'],
    ['110 drens', 'linje', 110, 'drens']
  ];
  for (const [kode, form, dim, system] of fasit) {
    const t = Ror.tolkKode(kode);
    paastand(`«${kode}» → ${form}, ${dim}, «${system}»`,
      t.form === form && t.dim === dim && t.system === system, JSON.stringify(t));
  }
  paastand('«160 kloakk topp rør» har varianten «TOPP RØR»', Ror.tolkKode('160 kloakk topp rør').variant === 'TOPP RØR',
    Ror.tolkKode('160 kloakk topp rør').variant);
}

/* ------------------------------------------------------------------ */
console.log('\n20. Flere filer flettes til én import');
{
  // oppdiktet: samme anlegg målt to ganger, én LandXML og én SOSI, punktene heter det samme
  const xml = `<LandXML date="2026-05-01"><CoordinateSystem epsgCode="25832"/><CgPoints>
<CgPoint name="p1" code="110 PE">6600000.000 500000.000 100.000</CgPoint>
<CgPoint name="p2" code="110 PE">6600010.000 500000.000 100.100</CgPoint>
</CgPoints></LandXML>`;
  const sos = ['.HODE', '..TEGNSETT UTF-8', '...ENHET 0.001',
    '.PUNKT 1:', '..NAME p2', '..OBJTYPE 110 PE', '..CreateTime "2026-05-09 10:00:00"', '..NØH', '6600010000 500000000 100150',
    '.PUNKT 2:', '..NAME p3', '..OBJTYPE 110 PE', '..CreateTime "2026-05-09 10:01:00"', '..NØH', '6600000849 500020000 100200',
    '.SLUTT'].join('\n');
  // SOSI først i lista – rekkefølgen filene ble valgt i, skal ikke avgjøre
  const filer = [{ les: Ror.lesFil(sos), filnavn: 'b.sos' }, { les: Ror.lesFil(xml), filnavn: 'a.xml' }];
  const r = Ror.slaSammenFiler(filer);
  sjekk('tre punkt, ingen doble', r.punkter.length, 3, 0);
  sjekk('ett punkt sto i begge', r.iFlere, 1, 0);
  const p2 = r.punkter.find(p => p.id === 'p2');
  sjekk('den nyeste fila vinner for et punkt i begge', p2.z, 100.15, 1e-9);
  paastand('én kilde per fil, eldste først', r.kilder.length === 2 && r.kilder[0].fil === 'a.xml'
    && r.kilder[1].fil === 'b.sos', JSON.stringify(r.kilder));
  paastand('sonen fra fila som oppgir den', r.epsg === 25832, String(r.epsg));
  paastand('datoen er den nyeste', r.dato === '2026-05-09', r.dato);
  const p3 = r.punkter.find(p => p.id === 'p3');
  paastand('SOSI rundes til enheten: 6600000849 × 0.001 er nøyaktig 6600000.849', p3.n === 6600000.849, String(p3.n));
  sjekk('advarslene legges sammen', Object.values(r.advarsler).reduce((a, v) => a + v, 0), 0, 0);

  // en fil i sone 33 regnes om til sonen den andre oppgir
  const [la, lo] = Ror.tilLatLon({ n: 6600000, o: 500030 }, 32);
  const i33 = require(js('geo.js')).tilUtm(la, lo, 33);
  const xml33 = `<LandXML date="2026-05-05"><CoordinateSystem epsgCode="25833"/><CgPoints>
<CgPoint name="q1" code="110 PE">${i33.y.toFixed(3)} ${i33.x.toFixed(3)} 100.000</CgPoint></CgPoints></LandXML>`;
  const r33 = Ror.slaSammenFiler([{ les: Ror.lesFil(xml), filnavn: 'a.xml' }, { les: Ror.lesFil(xml33), filnavn: 'c.xml' }]);
  const q1 = r33.punkter.find(p => p.id === 'q1');
  sjekk('punktet fra sone 33 havner der det ble målt – nord', q1.n, 6600000, 0.002);
  sjekk('og øst', q1.o, 500030, 0.002);
  const k33 = r33.kilder.find(k => k.fil === 'c.xml');
  paastand('kilden noterer omregningen', k33.regnetOm && k33.regnetOm.fra === 33 && k33.regnetOm.til === 32,
    JSON.stringify(k33));
  paastand('fila som var i sonen fra før, er ikke regnet om', !r33.kilder.find(k => k.fil === 'a.xml').regnetOm);
}

/* ------------------------------------------------------------------ */
console.log('\n21. KOF fra maskinstyringen');
{
  /* Oppdiktet. Slik skriver VisualMachine: kommentarer med «-00», «Created:»,
     og 05-poster med navn (10), kode (8, gjerne med mellomrom) og nord øst høyde.
     Navnene begynner på 1 i hver fil. */
  const kof = (dato, poster) => ['-00 Prøveprogram', '-00', `-00 Created:  ${dato}`, '-00']
    .concat(poster.map(([navn, kode, n, o, z]) => ` 05 ${navn.padEnd(10)} ${kode.padEnd(8)}  ${n.toFixed(3)}  ${o.toFixed(3)}  ${z.toFixed(3)}`))
    .join('\r\n');
  const a = kof('2026-05-01', [
    ['prove1', 'avlop', 6600000, 500000, 100.0], ['prove2', 'avlop', 6600010, 500000, 100.1],
    ['prove3', 'vann 110', 6600000, 500001, 100.3], ['prove4', 'vann 110', 6600010, 500001, 100.4],
    ['prove5', 'gren 160', 6600005, 500000, 100.05], ['prove6', 'avlop160', 6600020, 500000, 100.2]]);
  const r = Ror.lesFil(a);
  sjekk('seks punkt', r.punkter.length, 6, 0);
  paastand('koden med mellomrom blir med', r.punkter[2].kode === 'vann 110', r.punkter[2].kode);
  sjekk('nord, øst og høyde', r.punkter[0].n + r.punkter[0].o / 1e6 + r.punkter[0].z / 1e9, 6600000 + 0.5 + 1e-7, 1e-9);
  paastand('datoen fra «Created:»', r.dato === '2026-05-01', r.dato);
  paastand('id-en er navnet og stedet', r.punkter[0].id === 'prove1@6600000.000|500000.000|100.000', r.punkter[0].id);
  const ror = { punkter: r.punkter, koder: Ror.koderFra(r.punkter), retting: {} };
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, iFila);
  paastand('«avlop» uten dimensjon er et rør, ikke et punkt',
    b.linjer.some(l => l.kode === 'avlop') && Ror.tolkKode('avlop').system === 'spill', JSON.stringify(Ror.tolkKode('avlop')));
  paastand('«gren 160» er et punkt', b.objekter.some(p => p.kode === 'gren 160'));

  /* Den neste fila begynner på prove1 igjen – et annet punkt et annet sted.
     Med navnet som id ville det skrevet over det første. */
  const b2 = kof('2026-05-02', [['prove1', 'anboring', 6600030, 500005, 99.0], ['prove2', 'vann 110', 6600020, 500001, 100.5]]);
  const r2 = Ror.lesFil(b2);
  const sam = Ror.slaSammenFiler([{ les: r, filnavn: 'a.kof' }, { les: r2, filnavn: 'b.kof' }]);
  sjekk('to filer med samme navn på ulike punkt gir alle åtte', sam.punkter.length, 8, 0);
  sjekk('ingen ble tatt for å være det samme', sam.iFlere, 0, 0);
  const igjen = Ror.slaSammenFiler([{ les: r, filnavn: 'a.kof' }, { les: Ror.lesFil(a), filnavn: 'a igjen.kof' }]);
  sjekk('samme fil to ganger kjennes igjen', igjen.punkter.length, 6, 0);

  const kort = Ror.lesFil(' 05 X 7 6600000.000 500000.000\r\n 05 Y vann 6600001.000 500000.000 100.000');
  sjekk('punkt uten høyde telles', kort.advarsler.utenHoyde, 1, 0);
  const ss = Ror.lesFil('01 Prøve 01012026 1 22\r\n 05 P1 vann 6600000.000 500000.000 100.000');
  sjekk('sonen fra 01-posten', ss.epsg, 25832, 0);
  const vinduer = Buffer.from(' 05 P1 avl\xF8p 6600000.000 500000.000 100.000', 'latin1');
  paastand('Windows-tegn uten hode gir ø', Ror.lesFil(Ror.dekod(vinduer)).punkter[0].kode === 'avløp');
  paastand('filnavnet fra VisualMachine', Ror.navnFraFil('Prøvenett.xml_2026-05-01.kof') === 'Prøvenett',
    Ror.navnFraFil('Prøvenett.xml_2026-05-01.kof'));
}

/* ------------------------------------------------------------------ */
console.log('\n22. Samme rør, ulike koder: forslag og sammenslåing');
{
  /* Oppdiktet. Et vannrør målt av tre maskiner: «VA 110PE» fra 0 til 40 m,
     «vann 110» fra 42 til 80 m (endene møtes 2 m fra hverandre), «vanl 110»
     – en skrivefeil – langt borte. Et spillvannsrør «sp 160» og «SP 160PE»
     ved siden av. «vann 160» og «sk 160» skal IKKE foreslås. En stikkledning
     «stikk110» begynner på vannrøret. */
  let nr = 0;
  const pkt = (kode, o, n) => ({ id: 'p' + (++nr), kode, n: 6600000 + n, o: 500000 + o, z: 100, nr });
  const rekke = (kode, o, n0, n1, steg) => { const ut = []; for (let n = n0; n <= n1 + 1e-9; n += steg) ut.push(pkt(kode, o, n)); return ut; };
  const punkter = [].concat(
    rekke('VA 110PE', 0, 0, 40, 10), rekke('vann 110', 0, 42, 82, 10), rekke('vanl 110', 0, 300, 320, 10),
    rekke('sp 160', 3, 0, 40, 10), rekke('SP 160PE', 3, 43, 83, 10),
    rekke('vann 160', 0, 500, 540, 10), rekke('sk 160', 3, 600, 640, 10),
    [pkt('stikk110', 0.3, 20), pkt('stikk110', 6, 25), pkt('stikk110', 12, 30), pkt('stikk110', 18, 35)]);
  const ror = { punkter, koder: Ror.koderFra(punkter), retting: {} };
  const xy = p => ({ x: p.o, y: p.n });
  const f = Ror.forslagSammen(ror, xy, 25);
  const har = (a, b) => f.find(x => (x.fra === a && x.til === b) || (x.fra === b && x.til === a));
  paastand('«vanl 110» og «vann 110»: navnene er nesten like', har('vanl 110', 'vann 110')
    && /nesten like/.test(har('vanl 110', 'vann 110').grunner.join()), JSON.stringify(f.map(x => [x.fra, x.til, x.grunner])));
  paastand('«VA 110PE» og «vann 110»: endene møtes', har('VA 110PE', 'vann 110')
    && /endene møtes 2 m/.test(har('VA 110PE', 'vann 110').grunner.join()));
  paastand('«sp 160» og «SP 160PE»: samme navn uten materialet', har('sp 160', 'SP 160PE')
    && /skrevet litt ulikt/.test(har('sp 160', 'SP 160PE').grunner.join()));
  paastand('«vann 160» foreslås ikke med «vann 110» – dimensjonen sier imot', !har('vann 160', 'vann 110'));
  paastand('«sk 160» og «sp 160» er to forkortelser, ikke en skrivefeil', !har('sk 160', 'sp 160'));
  paastand('en stikkledning som begynner på røret, er ikke «oppå» det', !har('stikk110', 'vann 110') && !har('stikk110', 'VA 110PE'));
  paastand('vannrøret og spillvannet ved siden av foreslås ikke', !har('VA 110PE', 'SP 160PE') && !har('sp 160', 'VA 110PE'));
  paastand('koden med flest punkt er den det slås sammen til', har('sp 160', 'SP 160PE').til === 'SP 160PE'
    || har('sp 160', 'SP 160PE').til === 'sp 160');

  const foer = Ror.byggLinjer(ror, Ror.StandardRormal, xy).linjer.filter(l => /110/.test(l.kode) && !/stikk/.test(l.kode)).length;
  Ror.slaaSammenKoder(ror, 'vann 110', 'VA 110PE');
  const etter = Ror.byggLinjer(ror, Ror.StandardRormal, xy);
  const va = etter.linjer.filter(l => l.kode === 'VA 110PE');
  paastand('sammenslått blir vannrøret ett rør over hele lengden', va.length === 1 && va[0].lengde > 80,
    `${foer} før, nå ${JSON.stringify(etter.linjer.map(l => [l.kode, Math.round(l.lengde)]))}`);
  paastand('punktene beholder sin egen kode', ror.punkter.filter(p => p.kode === 'vann 110').length === 5);
  paastand('forslaget er borte når det er gjort', !Ror.forslagSammen(ror, xy, 25).some(x => x.fra === 'vann 110' || x.til === 'vann 110'));
  Ror.slaaSammenKoder(ror, 'vanl 110', 'vann 110');
  paastand('en kjede følges: «vanl 110» → «vann 110» → «VA 110PE»', Ror.kanonisk(ror, 'vanl 110') === 'VA 110PE');
  paastand('en ring slås ikke sammen', Ror.slaaSammenKoder(ror, 'VA 110PE', 'vanl 110') === false);
  Ror.skillKode(ror, 'vann 110');
  paastand('Skill gjør det om', Ror.kanonisk(ror, 'vann 110') === 'vann 110'
    && Ror.byggLinjer(ror, Ror.StandardRormal, xy).linjer.some(l => l.kode === 'vann 110'));
  /* Ja til to forslag i samme slengen, slik dialogen etter importen gir dem:
     «vannl 110 → vann 110» og «vannl 110 → vanl 110». Alle tre skal bli ett
     rør – flyttes bare koden, tar det andre svaret «vannl 110» ut av den
     første gruppa igjen. */
  {
    const g = { alias: {} };
    Ror.slaaSammenKoder(g, 'vannl 110', 'vann 110');
    Ror.slaaSammenKoder(g, 'vannl 110', 'vanl 110');
    const k = ['vannl 110', 'vann 110', 'vanl 110'].map(x => Ror.kanonisk(g, x));
    paastand('to ja i samme slengen gir én gruppe av alle tre', k.every(x => x === k[0]), JSON.stringify([g.alias, k]));
  }
  Ror.ikkeSamme(ror, 'sp 160', 'SP 160PE');
  paastand('«ikke samme rør» huskes', !Ror.forslagSammen(ror, xy, 25).some(x => [x.fra, x.til].includes('sp 160') && [x.fra, x.til].includes('SP 160PE')));

  // prosjektfila: sammenslåingene leses inn igjen, søppel tas bort
  const PF = require(js('prosjektform.js'));
  {
    const P = { anlegg: [{ id: 'a', type: 'ror', ror: { punkter: ror.punkter.slice(0, 3), alias: { a: 'b', c: 'c', d: 7 }, ikkeSamme: ['x', 3] } }] };
    PF.klargjor(P);
    const rr = P.anlegg[0].ror;
    paastand('fila: gyldige sammenslåinger beholdes, resten tas bort',
      JSON.stringify(rr.alias) === '{"a":"b"}' && JSON.stringify(rr.ikkeSamme) === '["x"]', JSON.stringify([rr.alias, rr.ikkeSamme]));
  }
}

/* ------------------------------------------------------------------ */
console.log('\n23. Leica iCON: koden i navnet med teller, og linjene fra fila');
{
  /* Oppdiktet. Slik skriver iCON: CgPoint uten kode, koden som navn med en
     teller rett bak («SP 160», «SP 1601» …), en ny serie med «(2)» etter,
     linjene som PlanFeature med strekk som peker på punktene, og sonen i
     HexagonLandXML. Spillvannsrøret er målt i en sikksakk som gjettingen ville
     trukket annerledes: 0 → 2 → 1 (punkt 1 ligger nærmest punkt 0). */
  const pkt = (navn, n, o, z) => `<CgPoint name="${navn}" oID="${navn}" timeStamp="2026-05-01T08:00:00">${n} ${o} ${z}</CgPoint>`;
  const strekk = (a, b) => `<Line><Start pntRef="${a}">0 0 0</Start><End pntRef="${b}">0 0 0</End></Line>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<LandXML version="1.2" date="2026-05-02" xmlns="http://www.landxml.org/schema/LandXML-1.2"><Units><Metric linearUnit="meter"/></Units>
<CgPoints>${[
    pkt('SP 160', 6600000, 500000, 100), pkt('SP 1601', 6600001, 500000, 100), pkt('SP 1602', 6600010, 500000, 99.9),
    pkt('MUR', 6600000, 500050, 101), ...Array.from({ length: 10 }, (_, i) => pkt('MUR' + (i + 1), 6600000 + 3 * (i + 1), 500050, 101)),
    pkt('GRØFT(2)', 6600100, 500100, 102), pkt('GRØFT1(2)', 6600105, 500100, 102), pkt('GRØFT13', 6600110, 500100, 102),
    pkt('1487', 6600200, 500200, 90)].join('')}</CgPoints>
<PlanFeatures>
<PlanFeature name="SP 160-&gt;SP 1601"><CoordGeom>${strekk('SP 160', 'SP 1602')}${strekk('SP 1602', 'SP 1601')}</CoordGeom></PlanFeature>
<PlanFeature name="MUR-&gt;MUR10"><CoordGeom>${Array.from({ length: 10 }, (_, i) => strekk(i ? 'MUR' + i : 'MUR', 'MUR' + (i + 1))).join('')}</CoordGeom></PlanFeature>
<PlanFeature name="KANT"><CoordGeom>${strekk('GRØFT(2)', 'GRØFT1(2)')}${strekk('GRØFT1(2)', 'GRØFT13')}${strekk('GRØFT13', 'FINNES IKKE')}</CoordGeom></PlanFeature>
</PlanFeatures>
<HexagonLandXML><CoordinateSystem name="Euref89 UTM32Utv." type="classic"></CoordinateSystem></HexagonLandXML>
</LandXML>`;
  const les = Ror.lesFil(xml);
  const kode = id => (les.punkter.find(p => p.id === id) || {}).kode;
  paastand('«SP 1601» og «SP 1602» er «SP 160» – ikke «SP»', kode('SP 1601') === 'SP 160' && kode('SP 1602') === 'SP 160',
    kode('SP 1601') + ' / ' + kode('SP 1602'));
  paastand('«MUR10» er «MUR», ikke «MUR1»', kode('MUR10') === 'MUR', kode('MUR10'));
  paastand('en ny serie med «(2)» har samme kode', kode('GRØFT1(2)') === 'GRØFT' && kode('GRØFT13') === 'GRØFT',
    kode('GRØFT1(2)') + ' / ' + kode('GRØFT13'));
  paastand('et navn som bare er et tall, er et punktnummer', kode('1487') === 'UTEN KODE', kode('1487'));
  paastand('navnet er id-en, uendret', les.punkter.some(p => p.id === 'SP 1601'));
  sjekk('sonen fra HexagonLandXML («UTM32Utv.»)', les.epsg, 25832, 0);
  paastand('programmet er Leica', les.program === 'Leica', les.program);
  sjekk('tre linjer fra fila', les.linjer.length, 3, 0);
  paastand('linja i fila sin rekkefølge', les.linjer[0].punkter.join(',') === 'SP 160,SP 1602,SP 1601', les.linjer[0].punkter.join(','));
  paastand('et strekk til et punkt som ikke finnes, kortes av', les.linjer[2].punkter.length === 3, les.linjer[2].punkter.join(','));

  const linjekoder = Ror.linjekoder(les.punkter, les.linjer);
  paastand('kodene fila har målt som linjer', linjekoder.has('MUR') && linjekoder.has('SP 160') && linjekoder.has('GRØFT'));
  const koder = Ror.koderFra(les.punkter, null, linjekoder);
  paastand('«MUR» blir en linje selv om navnet ikke sier det', koder.MUR.form === 'linje' && koder.MUR.farge !== 'punkt',
    JSON.stringify(koder.MUR));
  const ror = { punkter: les.punkter, koder, retting: { av: [], brudd: [], koble: [] }, filLinjer: Ror.flettLinjer([], les.linjer) };
  const xy = p => ({ x: p.o, y: p.n });
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, xy);
  const sp = b.linjer.filter(l => l.kode === 'SP 160');
  paastand('spillvannet trekkes som fila sier: 0 → 2 → 1', sp.length === 1 && sp[0].punkter.map(p => p.id).join(',') === 'SP 160,SP 1602,SP 1601',
    JSON.stringify(sp.map(l => l.punkter.map(p => p.id))));
  sjekk('og lengden er den målte sikksakken', sp[0].lengde, 19, 1e-6);
  paastand('muren er én linje med elleve punkt', b.linjer.filter(l => l.kode === 'MUR').length === 1
    && b.linjer.find(l => l.kode === 'MUR').punkter.length === 11);
  paastand('punktnummeret er et punkt, ikke en linje', b.objekter.some(p => p.id === '1487'));
  // av og brudd deler linja
  const ror2 = Object.assign({}, ror, { retting: { av: ['MUR5'], brudd: [['MUR8', 'MUR9']], koble: [] } });
  const mur = Ror.byggLinjer(ror2, Ror.StandardRormal, xy).linjer.filter(l => l.kode === 'MUR');
  paastand('et punkt slått av og et brudd deler muren i tre', mur.length === 3,
    JSON.stringify(mur.map(l => l.punkter.map(p => p.id))));
  // en kode tegnet som punkt i kodetabellen: linja fra fila tegnes ikke, punktene står
  const ror3 = Object.assign({}, ror, { koder: Object.assign({}, koder, { MUR: Object.assign({}, koder.MUR, { form: 'punkt' }) }) });
  const b3 = Ror.byggLinjer(ror3, Ror.StandardRormal, xy);
  paastand('«Tegnes som punkt» gjelder linjene fra fila også', !b3.linjer.some(l => l.kode === 'MUR')
    && b3.objekter.filter(p => p.kode === 'MUR').length === 11);
  // samme fil to ganger: linjene én gang
  sjekk('samme fil lagt til igjen gir ingen doble linjer', Ror.flettLinjer(ror.filLinjer, les.linjer).length, 3, 0);
  const sam = Ror.slaSammenFiler([{ les, filnavn: 'a.xml' }, { les, filnavn: 'b.xml' }]);
  sjekk('flere filer: linjene flettes', sam.linjer.length, 3, 0);
  // kodetolkningen: forkortelsen sist
  const t = Ror.tolkKode('110 MM SP');
  paastand('«110 MM SP» er spillvann 110', t.system === 'spill' && t.dim === 110 && t.form === 'linje', JSON.stringify(t));
  paastand('«160 MM OV» er overvann 160', Ror.tolkKode('160 MM OV').system === 'overvann');
  // prosjektfila tar vare på linjene og rydder i dem
  const PF = require(js('prosjektform.js'));
  const P = { anlegg: [{ id: 'a', type: 'ror', ror: { punkter: les.punkter.slice(0, 3),
    filLinjer: [{ navn: 'x', punkter: ['SP 160', 'SP 1601'] }, { punkter: ['bare ett'] }, 'tull', { punkter: [{}, 'a', 'b'] }] } }] };
  PF.klargjor(P);
  paastand('fila: linjene beholdes, ugyldige tas bort', JSON.stringify(P.anlegg[0].ror.filLinjer)
    === '[{"navn":"x","punkter":["SP 160","SP 1601"]},{"navn":"","punkter":["a","b"]}]', JSON.stringify(P.anlegg[0].ror.filLinjer));
}

/* ------------------------------------------------------------------ */
console.log('\n24. Endre rør: koble linjer fra fila, flytte punkt, nye punkt');
{
  const P = (id, o, kode = 'VA 110') => ({ id, nr: +id.slice(1), kode, o, n: 0, z: 10 + o / 10 });
  const lag = () => [P('a1', 0), P('a2', 5), P('a3', 10), P('a4', 60), P('a5', 65), P('a6', 70)];
  const rorAv = (pts, filLinjer, retting) => ({ punkter: pts, koder: Ror.koderFra(pts), alias: {},
    retting: Object.assign(Ror.nyRetting(), retting), filLinjer });
  const ider = l => l.punkter.map(p => p.id).join('-');
  const to = [{ punkter: ['a1', 'a2', 'a3'] }, { punkter: ['a4', 'a5', 'a6'] }];
  const mal = { maksAvstand: 25 };

  // KOBLE: virket bare i treet – to linjer fra fila ble stående hver for seg
  let b = Ror.byggLinjer(rorAv(lag(), to, { koble: [['a3', 'a4']] }), mal, iFila);
  paastand('koble: to linjer fra fila blir ett rør', b.linjer.length === 1 && ider(b.linjer[0]) === 'a1-a2-a3-a4-a5-a6',
    b.linjer.map(ider).join(' | '));
  paastand('  og koblingen har treff', b.koblingUtenTreff === 0);
  b = Ror.byggLinjer(rorAv(lag(), to, { koble: [['a4', 'a1']] }), mal, iFila);
  paastand('koble: endene i hvilken som helst rekkefølge', b.linjer.length === 1 && ider(b.linjer[0]) === 'a3-a2-a1-a4-a5-a6',
    b.linjer.map(ider).join(' | '));
  b = Ror.byggLinjer(rorAv(lag(), [to[0]], { koble: [['a3', 'a4']] }), mal, iFila);
  paastand('koble: en linje fra fila og et rør fra treet blir ett', b.linjer.length === 1 && b.linjer[0].punkter.length === 6,
    b.linjer.map(ider).join(' | '));
  b = Ror.byggLinjer(rorAv(lag(), [to[0]], { koble: [['a2', 'a4']] }), mal, iFila);
  paastand('koble: midt i en linje kobles ikke', b.linjer.length === 2 && b.koblingUtenTreff === 1, b.linjer.map(ider).join(' | '));
  const ulik = lag();
  ulik[3].kode = ulik[4].kode = ulik[5].kode = 'vann 110';
  const ra = rorAv(ulik, to, { koble: [['a3', 'a4']] });
  ra.alias = { 'vann 110': 'VA 110' };
  b = Ror.byggLinjer(ra, mal, iFila);
  paastand('koble: koder som er slått sammen, kobles', b.linjer.length === 1, b.linjer.map(ider).join(' | '));

  // FLYTTE: o og n, aldri z – og tilbake når flyttingen tas bort
  const r = rorAv(lag(), to, { flytt: { a2: { o: 5, n: 3 } } });
  Ror.brukRetting(r);
  const a2 = r.punkter.find(p => p.id === 'a2');
  paastand('flytt: punktet står der brukeren satte det', a2.o === 5 && a2.n === 3 && a2.z === 10.5, JSON.stringify(a2));
  paastand('  og husker der det ble målt', a2.innmaalt && a2.innmaalt.n === 0);
  Ror.brukRetting(r);
  paastand('  to ganger er som én', a2.n === 3 && a2.innmaalt.n === 0);
  b = Ror.byggLinjer(r, mal, iFila);
  sjekk('  røret går om det flyttede punktet', b.linjer[0].lengde, 2 * Math.hypot(5, 3), 1e-9);
  delete r.retting.flytt.a2;
  Ror.brukRetting(r);
  paastand('  tatt bort: tilbake der det ble målt', a2.n === 0 && !a2.innmaalt);

  // NYE PUNKT: satt inn på en strek i en linje fra fila, og i treet
  for (const [navn, fil] of [['linje fra fila', to], ['treet', []]]) {
    const rn = rorAv(lag(), fil, { nye: [{ id: '+1', nr: 2.5, kode: 'VA 110', o: 7, n: 1, z: 10.7, paaStrekk: ['a2', 'a3'] }] });
    Ror.brukRetting(rn);
    b = Ror.byggLinjer(rn, mal, iFila);
    const l = b.linjer.find(x => x.punkter.some(p => p.id === 'a1'));
    paastand(`nytt punkt (${navn}): står mellom de to`, ider(l).startsWith('a1-a2-+1-a3'), b.linjer.map(ider).join(' | '));
    // et punkt satt inn mellom a2 og det nye
    rn.retting.nye.push({ id: '+2', nr: 2.2, kode: 'VA 110', o: 6, n: 0.5, z: 10.6, paaStrekk: ['a2', '+1'] });
    Ror.brukRetting(rn);
    b = Ror.byggLinjer(rn, mal, iFila);
    const l2 = b.linjer.find(x => x.punkter.some(p => p.id === 'a1'));
    paastand(`  og et til mellom det og naboen (${navn})`, ider(l2).startsWith('a1-a2-+2-+1-a3'), b.linjer.map(ider).join(' | '));
  }
  // en strek som er en kobling over maks avstand: det nye punktet havner likevel på den
  const lang = rorAv(lag(), [], { koble: [['a3', 'a4']], nye: [{ id: '+1', nr: 3.5, kode: 'VA 110', o: 35, n: 0, z: 13.5, paaStrekk: ['a3', 'a4'] }] });
  Ror.brukRetting(lang);
  b = Ror.byggLinjer(lang, mal, iFila);
  paastand('nytt punkt midt på en lang kobling står i røret', b.linjer.length === 1 && ider(b.linjer[0]) === 'a1-a2-a3-+1-a4-a5-a6',
    b.linjer.map(ider).join(' | '));
  // forlengelse: et nytt punkt koblet til enden av en linje fra fila
  const fo = rorAv(lag(), to, { koble: [['a6', '+1']], nye: [{ id: '+1', nr: 6.5, kode: 'VA 110', o: 120, n: 0, z: 17 }] });
  Ror.brukRetting(fo);
  b = Ror.byggLinjer(fo, mal, iFila);
  paastand('forlengelse: enden av en linje fra fila får det nye punktet', b.linjer.some(l => ider(l) === 'a4-a5-a6-+1'),
    b.linjer.map(ider).join(' | '));
  paastand('nyPunktId er ledig', Ror.nyPunktId(fo) === '+2');

  // NY IMPORT OG MAKIN: rettingene står
  const im = rorAv(lag(), to, { flytt: { a2: { o: 5, n: 3 } }, nye: [{ id: '+1', nr: 9, kode: 'VA 110', o: 90, n: 0, z: 19 }] });
  Ror.brukRetting(im);
  const sam = Ror.slaSammen(im.punkter, lag());
  paastand('ny import: et flyttet punkt med samme tall er ikke endret', sam.endret === 0, String(sam.endret));
  im.punkter = sam.punkter;
  Ror.brukRetting(im);
  paastand('  og står fortsatt flyttet', im.punkter.find(p => p.id === 'a2').n === 3);
  paastand('  og det nye punktet er med', im.punkter.some(p => p.id === '+1' && p.lagtTil));
  const nyere = lag();
  nyere[1] = Object.assign({}, nyere[1], { n: 0.2 });
  const sam2 = Ror.slaSammen(im.punkter, nyere);
  im.punkter = sam2.punkter;
  Ror.brukRetting(im);
  const a2b = im.punkter.find(p => p.id === 'a2');
  paastand('ny import med nye tall: flyttingen står, og det målte er det nye', sam2.endret === 1 && a2b.n === 3 && a2b.innmaalt.n === 0.2,
    JSON.stringify(a2b));
  const bytte = Ror.byttPunkter(im, nyere);
  paastand('makin: likt Makin er likt, med flyttede og nye punkt', !bytte.nye && !bytte.borte && !bytte.endret && !bytte.rettingerBorte,
    JSON.stringify({ nye: bytte.nye, borte: bytte.borte, endret: bytte.endret, ret: bytte.rettingerBorte }));
  im.retting.koble.push(['a6', '+1']);
  im.punkter = bytte.punkter;
  Ror.rensRetting(im, new Set(bytte.punkter.map(p => p.id)));
  Ror.brukRetting(im);
  paastand('makin: koblingen til det nye punktet står etter hentingen', im.retting.koble.length === 1);
  paastand('  og det nye punktet og flyttingen er med', im.punkter.some(p => p.id === '+1') && im.punkter.find(p => p.id === 'a2').n === 3);

  // PROSJEKTFILA
  const Prosjektform = require(js('prosjektform.js'));
  const PF = Prosjektform.klargjor({ navn: 'x', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror', ror: { sone: 32,
    punkter: lag(), retting: { av: [], brudd: [], koble: [], flytt: { a2: { o: 5, n: '3' }, a3: { o: 'tull' } },
      nye: [{ id: '+1', kode: 'VA 110', o: 1, n: 2, z: 3, paaStrekk: ['a1', 'a2'] }, { id: '+2', o: 'x' }, null] } } }] });
  const pr = PF.anlegg[0].ror;
  paastand('prosjektfila: gyldige flyttinger og nye punkt står, ugyldige tas bort',
    JSON.stringify(pr.retting.flytt) === '{"a2":{"o":5,"n":3}}' && pr.retting.nye.length === 1, JSON.stringify(pr.retting));
  paastand('  og punktene er som rettingene sier', pr.punkter.find(p => p.id === 'a2').n === 3
    && pr.punkter.some(p => p.id === '+1' && p.lagtTil), JSON.stringify(pr.punkter.slice(-2)));
  const gammel = Prosjektform.klargjor({ navn: 'x', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror', ror: { sone: 32,
    punkter: lag(), retting: { av: [], brudd: [], koble: [] } } }] });
  paastand('prosjektfila: en eldre fil får tomme flyttinger og nye punkt',
    JSON.stringify(gammel.anlegg[0].ror.retting.flytt) === '{}' && Array.isArray(gammel.anlegg[0].ror.retting.nye));
}

/* ------------------------------------------------------------------ */
/* DEN EKTE FILA – bare når stien er gitt. Kundens data ligger ikke i repoet. */
if (process.env.ROR_FIL) {
  console.log('\n25. Den ekte fila (ROR_FIL)');
  const les = Ror.lesFil(Ror.dekod(fs.readFileSync(process.env.ROR_FIL)));
  const ror = { punkter: les.punkter, koder: Ror.koderFra(les.punkter), retting: { av: [], brudd: [], koble: [] } };
  const b = Ror.byggLinjer(ror, Ror.StandardRormal, iFila);
  paastand('fila leses', les.punkter.length > 0, String(les.punkter.length));
  paastand('ingen strekk over 25 m', b.linjer.every(l => l.xy.every((q, i) => i === 0
    || Math.hypot(q.x - l.xy[i - 1].x, q.y - l.xy[i - 1].y) <= 25)));
  paastand('sonen er 32', Ror.gjettSone(les.punkter, les.epsg, []).sone === 32);
  const ider = b.linjer.map(l => l.id);
  paastand('hvert rør har sin egen id', new Set(ider).size === ider.length,
    ider.filter((id, i) => ider.indexOf(id) !== i).join(' '));
  const perKode = {};
  for (const l of b.linjer) perKode[l.kode] = (perKode[l.kode] || []).concat(l.lengde);
  for (const [k, ls] of Object.entries(perKode)) {
    console.log(`       ${k.padEnd(18)} ${String(ls.length).padStart(2)} rør  ${ls.reduce((a, x) => a + x, 0).toFixed(0).padStart(5)} m`);
  }
  console.log(`       ${b.objekter.length} objekter, ${b.enslige.length} enslige punkt`);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
})();
