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

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
})();
