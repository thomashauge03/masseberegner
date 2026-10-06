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
}

console.log('\n3. Programmets egen KOF leses tilbake');
{
  // punktene som stikningslista for et rør skriver dem: samme kode, i rekkefølge
  const rader = [0, 10, 20, 30].map((s, i) => Eksport.kofPunkt('1-00' + i, 'RORTOPP', N0 + s, O0, 8 - s * 0.01));
  const r = TraseImport.lesKof(rader.join('\n'));
  paastand('én linje med fire punkt', r.linjer.length === 1 && r.linjer[0].punkter.length === 4);
  paastand('lengden', Math.abs(TraseImport.lengde(r.linjer[0]) - 30) < 1e-9);
}
paastand('feil endelse avvises', (() => { try { TraseImport.les('a.txt', ''); return false; } catch (e) { return /kof og .dxf/.test(e.message); } })());

console.log(`\n${ok} tester ok, ${feil} feil`);
if (feil) process.exit(1);
