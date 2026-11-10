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

console.log(`\n${ok} ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
