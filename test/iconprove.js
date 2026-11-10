'use strict';
/**
 * iCON-fila: KOF-punktene tilbake til punkt, og skriveren som lager det
 * formatet Leica iCON selv skriver en jobb i.
 *
 *   node test/iconprove.js
 *
 * Alle tall er oppdiktet.
 */
const path = require('path');
global.Geo = require(path.join(__dirname, '..', 'public', 'js', 'geo.js'));
const Eksport = require(path.join(__dirname, '..', 'public', 'js', 'eksport.js'));

let feil = 0, ok = 0;
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

console.log('KOF tilbake til punkt');
{
  const kof = ['-05 Prøve', ' 01 Massekalk    10112026   2      22 0000 $11100000000', '.PUNKT',
    Eksport.kofPunkt('S0', 'SENTER', 6600123.456, 512345.678, 101.234),
    Eksport.kofPunkt('VKANT_LANG', 'VKANT', 6600124.5, 512346.25, 99.5),
    // rørskissen: bare nord og øst
    ' 05 ' + Eksport.tekst('1-001', 10) + ' ' + Eksport.tekst('SP', 8) + ' ' + (6600130).toFixed(3).padStart(12) + ' ' + (512350).toFixed(3).padStart(11),
    ' 09_99'].join('\r\n');
  const p = Eksport.kofTilPunkter(kof);
  paastand('tre punkt, hode og linjekoder hoppes over', p.length === 3, JSON.stringify(p));
  paastand('navn, kode og koordinater kommer tilbake som de ble skrevet',
    p[0].navn === 'S0' && p[0].kode === 'SENTER' && p[0].n === 6600123.456 && p[0].e === 512345.678 && p[0].z === 101.234, JSON.stringify(p[0]));
  paastand('et navn på hele ti tegn kappes ikke av koden', p[1].navn === 'VKANT_LANG' && p[1].kode === 'VKANT', JSON.stringify(p[1]));
  paastand('et punkt uten høyde får NaN, ikke null', p[2].navn === '1-001' && Number.isNaN(p[2].z) && p[2].e === 512350, JSON.stringify(p[2]));
}

console.log('iCON-skriveren');
{
  const r = Eksport.icon([
    { navn: 'S1', kode: 'STIKK', n: 6600000.1, e: 500000.2, z: 100.3 },
    { navn: 'S2', kode: 'STIKK', n: 6600001, e: 500001, z: NaN },
    { navn: 'S1', kode: 'SENTER', n: 6600002, e: 500002, z: 102 },
    { navn: 'A&B', kode: '', n: 6600003, e: 500003, z: 103 }
  ]);
  const t = r.tekst;
  paastand('fire punkt', r.antall === 4, String(r.antall));
  paastand('hodet er iCON sitt: HeXML-skjema og radianer', t.includes('http://xml.hexagon.com/schema/HeXML-1.8.xsd')
    && t.includes('angularUnit="radians"') && t.includes('<HexagonLandXML xmlns="http://xml.hexagon.com/schema/HeXML-1.9">'));
  paastand('ingen CoordinateSystem – punktene havner i jobbens system', !t.includes('CoordinateSystem'));
  paastand('CRLF på hver linje, som iCON', !/[^\r]\n/.test(t) && t.endsWith('</LandXML>\r\n'));
  paastand('CgPoint er «nord øst høyde»', t.includes('<CgPoint name="S1">6600000.100000 500000.200000 100.300000</CgPoint>'));
  paastand('Grid er øst, nord og ortometrisk høyde',
    t.includes('<Grid e="500000.200000" n="6600000.100000" hghthO="100.300000"></Grid>'));
  paastand('koden står i PointCode', t.includes('<PointCode code="STIKK"></PointCode>'));
  paastand('et punkt uten høyde er et 2D-punkt i begge delene',
    t.includes('<CgPoint name="S2">6600001.000000 500001.000000</CgPoint>') && t.includes('<Grid e="500001.000000" n="6600001.000000"></Grid>')
    && r.uten.join() === 'S2', r.uten.join());
  paastand('det første S1 beholder navnet, det andre blir S1.2', t.includes('uniqueID="S1"') && t.includes('uniqueID="S1.2"')
    && r.omdopt.join() === 'S1 → S1.2', r.omdopt.join());
  paastand('navn skrives som XML', t.includes('name="A&amp;B"') && !t.includes('A&B'));
  paastand('like mange CgPoint som Point', (t.match(/<CgPoint /g) || []).length === 4 && (t.match(/<Point /g) || []).length === 4);
}

console.log('Makin-skriveren');
{
  const r = Eksport.makin([
    { navn: 'S1', kode: 'STIKK', n: 6600000.1, e: 500000.2, z: 100.3 },
    { navn: 'S2', kode: 'STIKK', n: 6600001, e: 500001, z: NaN },
    { navn: 'S1', kode: 'SENTER', n: 6600002, e: 500002, z: 102 }
  ], 32);
  const t = r.tekst;
  paastand('vanlig LandXML 1.2, ingen HeXML-del', t.includes('xmlns="http://www.landxml.org/schema/LandXML-1.2"') && !t.includes('hexagon'));
  paastand('koordinatsystemet står med EPSG for sonen', t.includes('epsgCode="25832"') && t.includes('ETRS89/UTM SONE 32N'));
  paastand('hvert punkt i sin egen CgPoints, med name, code og oID – som Gemini-fila Makin leser',
    t.includes('  <CgPoints>\r\n    <CgPoint name="S1" code="STIKK" oID="1">6600000.100000 500000.200000 100.300000</CgPoint>\r\n  </CgPoints>'));
  paastand('et punkt uten høyde er ikke med – maskinen styrer etter høyden', !t.includes('"S2"') && r.uten.join() === 'S2' && r.antall === 2,
    `${r.antall} ${r.uten.join()}`);
  paastand('oID teller bare punktene som er med', t.includes('name="S1.2" code="SENTER" oID="2"'));
  paastand('like navn gjøres unike også her', r.omdopt.join() === 'S1 → S1.2', r.omdopt.join());
  paastand('CRLF på hver linje', !/[^\r]\n/.test(t) && t.endsWith('</LandXML>\r\n'));
}

console.log('Flaten mellom punktene');
{
  const T = p => Eksport.trekanter(p.map(([x, y]) => ({ x, y })));
  const areal = (p, t) => t.reduce((s, [a, b, c]) => s + Math.abs((p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[a][0])) / 2, 0);
  const firkant = [[0, 0], [10, 0], [10, 5], [0, 5]];
  const f = T(firkant);
  paastand('en firkant blir to trekanter', f.trekanter && f.trekanter.length === 2, JSON.stringify(f));
  paastand('  som dekker hele arealet', Math.abs(areal(firkant, f.trekanter) - 50) < 1e-9);
  const med = T(firkant.slice().reverse());
  paastand('  også når punktene går med klokka', med.trekanter && Math.abs(areal(firkant.slice().reverse(), med.trekanter) - 50) < 1e-9);
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  const l = T(L);
  // 10 × 4 + 4 × 6 = 64 m²; en trekant over innoverhjørnet ville gitt mer
  paastand('en L-form blir fire trekanter som dekker 64 m², ingen utenfor', l.trekanter && l.trekanter.length === 4
    && Math.abs(areal(L, l.trekanter) - 64) < 1e-9, JSON.stringify(l));
  paastand('kanter som krysser hverandre er en feil', !!T([[0, 0], [10, 10], [10, 0], [0, 10]]).feil);
  paastand('tre punkt på en linje er en feil', !!T([[0, 0], [5, 0], [10, 0]]).feil);
  paastand('to punkt er ikke en flate', !!T([[0, 0], [5, 0]]).feil);

  const hj = [['A', 0, 0, 100], ['B', 10, 0, 100], ['C', 10, 5, 101], ['D', 0, 5, 101]]
    .map(([navn, e, n, z]) => ({ navn, e: 500000 + e, n: 6600000 + n, z }));
  const r = Eksport.makin(hj, 32, [{ navn: 'Flate 1', punkt: hj }, { navn: 'Uten', punkt: hj.slice(0, 2).concat([{ navn: 'X', e: 500003, n: 6600009, z: NaN }]) }]);
  const t = r.tekst;
  paastand('Makin-fila har flaten som TIN', t.includes('<Surface name="Flate 1"') && t.includes('surfType="TIN"')
    && (t.match(/<P id=/g) || []).length === 4 && (t.match(/<F>/g) || []).length === 2);
  paastand('  med hjørnene i «nord øst høyde»', t.includes('<P id="3">6600005.000000 500010.000000 101.000000</P>'));
  paastand('  og omrisset som en lukket linje', t.includes('<PlanFeature name="Flate 1">') && (t.match(/<Line>/g) || []).length === 4
    && t.includes('<Start>6600005.000000 500000.000000 101.000000</Start>\r\n          <End>6600000.000000 500000.000000 100.000000</End>'));
  paastand('en flate med et hjørne uten høyde skrives ikke, og grunnen sies', r.flater.join() === 'Flate 1'
    && r.flatefeil.length === 1 && /X har ikke høyde/.test(r.flatefeil[0]), JSON.stringify(r.flatefeil));
  paastand('uten flater er fila som før', !Eksport.makin(hj, 32).tekst.includes('Surface'));
}

console.log('Punkt man skriver eller limer inn');
{
  const L = s => Eksport.lesPunktlinje(s);
  const er = (r, navn, n, e, z) => r && !r.feil && r.navn === navn && Math.abs(r.n - n) < 1e-6 && Math.abs(r.e - e) < 1e-6
    && (Number.isNaN(z) ? Number.isNaN(r.z) : Math.abs(r.z - z) < 1e-6);
  paastand('nord og øst, komma som desimaltegn', er(L('6600000,40 500000,25'), null, 6600000.4, 500000.25, NaN), JSON.stringify(L('6600000,40 500000,25')));
  paastand('nord, øst og høyde', er(L('6600000.4 500000.25 186.5'), null, 6600000.4, 500000.25, 186.5));
  paastand('navn foran', er(L('Hjørne 6600000 500000 100'), 'Hjørne', 6600000, 500000, 100));
  paastand('et navn med mellomrom', er(L('Hjørne A 6600000 500000'), 'Hjørne A', 6600000, 500000, NaN));
  paastand('et tall som navn: fire tall', er(L('1 6600000 500000 100'), '1', 6600000, 500000, 100));
  paastand('et tall som navn, uten høyde', er(L('7 6600000 500000'), '7', 6600000, 500000, NaN));
  paastand('raden fra «Kopier alle» (tabulator, komma)', er(L('S3\t6600000,12\t500000,34\t101,56'), 'S3', 6600000.12, 500000.34, 101.56));
  paastand('semikolon fra et regneark', er(L('A;6600000,1;500000,2;99,9'), 'A', 6600000.1, 500000.2, 99.9));
  paastand('komma som skille, punktum som desimal', er(L('6600000.1,500000.2,99.9'), null, 6600000.1, 500000.2, 99.9));
  paastand('mellomrom som tusenskille i hvert felt', er(L('6 600 000,5\t500 000,5'), null, 6600000.5, 500000.5, NaN));
  const b = L('500000 6600000 100');
  paastand('øst før nord byttes, og det sies', er(b, null, 6600000, 500000, 100) && b.byttet === true);
  paastand('overskriften fra «Kopier alle» hoppes over', L('Punkt\tNord\tØst\tHøyde') === null && L('   ') === null);
  paastand('nord utenfor Norge er en feil', !!(L('1234567 500000') || {}).feil);
  paastand('en høyde på 5000 m er en feil', !!(L('6600000 500000 5000') || {}).feil);
  paastand('bare ett tall er en feil', !!(L('6600000') || {}).feil);
}

console.log(`\n${ok} ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
