'use strict';
/**
 * Trekantflaten av innmålte punkter (public/js/triangulering.js).
 *
 *   node test/trianguleringprove.js
 *
 * Alle punktene er oppdiktet. Fasiten er regnet for hånd: et skrått plan
 * gjenskapes eksakt, et kvadrat på 20 × 20 m med 1 m fylling er 400 m³, og en
 * L-form skal ikke fylles ut over hjørnet ingen har målt.
 */
const T = require('../public/js/triangulering.js');

let feil = 0, ok = 0;
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}
const nær = (a, b, tol) => Math.abs(a - b) <= tol;

/* Rutenett av punkter i UTM-koordinater, så presisjonen prøves der den
   faktisk brukes (øst 400 000, nord 6,5 millioner). */
const E0 = 412345, N0 = 6512345;
function nett(nx, ny, steg, z, med = () => true) {
  const P = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    if (!med(i, j)) continue;
    const e = E0 + i * steg, n = N0 + j * steg;
    P.push({ navn: `P${i}_${j}`, e, n, z: z(e, n) });
  }
  return P;
}
const plan = (e, n) => 100 + 0.1 * (e - E0) + 0.05 * (n - N0);

console.log('Delaunay');
{
  const P = nett(4, 4, 5, plan);
  const tri = T.delaunay(P);
  paastand('5 × 5 punkt gir 32 trekanter', tri.length === 32, String(tri.length));
  const motKlokka = tri.every(t => {
    const [a, b, c] = t.map(i => P[i]);
    return (b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n) > 0;
  });
  paastand('alle trekantene går mot klokka', motKlokka);
  paastand('under tre punkt gir ingen trekanter', T.delaunay(P.slice(0, 2)).length === 0);
}

console.log('Flaten');
{
  const P = nett(4, 4, 5, plan);
  const f = T.lagFlate(P, { makskant: 0 });
  paastand('planet gjenskapes midt i en trekant', nær(T.hoyde(f, E0 + 7.3, N0 + 11.9), plan(E0 + 7.3, N0 + 11.9), 1e-9));
  paastand('planet gjenskapes i et hjørne', nær(T.hoyde(f, E0, N0), 100, 1e-9));
  paastand('utenfor flaten er NaN', Number.isNaN(T.hoyde(f, E0 - 0.5, N0 + 5)) && Number.isNaN(T.hoyde(f, E0 + 30, N0)));
  const a = T.areal(f);
  paastand('arealet er 20 × 20 m', nær(a.areal, 400, 1e-6), String(a.areal));
  paastand('omkretsen er 80 m', nær(a.omkrets, 80, 1e-6), String(a.omkrets));
  paastand('skrått areal er større enn arealet ovenfra', a.skrå > a.areal && nær(a.skrå, 400 * Math.sqrt(1 + 0.01 + 0.0025), 1e-6), String(a.skrå));
  paastand('kanten går rundt alle 16 kantpunktene', f.kant.length === 16, String(f.kant.length));

  const dobbel = P.concat([{ ...P[0], navn: 'kopi' }]);
  const f2 = T.lagFlate(dobbel, { makskant: 0 });
  paastand('to punkt på samme sted: det siste holdes utenfor og nevnes', f2.dubletter.length === 1 && f2.dubletter[0] === 'kopi');
  const f3 = T.lagFlate(P, { makskant: 0, utelatt: ['P2_2'] });
  paastand('et utelatt punkt er ikke med i flaten', f3.punkter.length === 24 && !f3.punkter.some(p => p.navn === 'P2_2'));
}

console.log('Ytterkanten');
{
  /* L-form: 4 × 4 ruter à 5 m, uten den øvre høyre ruta på 2 × 2. Det konvekse
     hylsteret dekker 400 m²; det som er målt er 400 − 100 = 300 m². */
  const P = nett(4, 4, 5, () => 50, (i, j) => !(i > 2 && j > 2));
  const hylster = T.lagFlate(P, { makskant: 0 });
  paastand('konvekst hylster fyller over hjørnet', T.areal(hylster).areal > 300 + 1, String(T.areal(hylster).areal));
  const f = T.lagFlate(P);
  /* Den skrå trekanten over det innerste hjørnet (hypotenus 7,1 m, 12,5 m²)
     er kortere enn makskant og får stå – resten av hjørnet skal bort. */
  paastand('forslaget skreller bort hjørnet ingen har målt', T.areal(f).areal >= 300 - 1e-6 && T.areal(f).areal <= 312.5 + 1e-6,
    `${T.areal(f).areal} (makskant ${f.makskant})`);
  paastand('forslaget er 10 m (2 × 5 m til nærmeste nabo)', f.makskant === 10, String(f.makskant));
  paastand('ingen punkt faller utenfor flaten', new Set(f.tri.flat()).size === P.length);
  paastand('i det tomme hjørnet er det ingen høyde', Number.isNaN(T.hoyde(f, E0 + 18, N0 + 18)));
}

console.log('Mot et annet terreng');
{
  const P = nett(4, 4, 5, plan);
  const f = T.lagFlate(P, { makskant: 0 });
  const r = T.regnMot(f, (e, n) => plan(e, n) - 1, { steg: 0.25 });
  paastand('1 m over terrenget på 400 m² er 400 m³ fylling', nær(r.fyll, 400, 1e-6) && r.skjæring === 0, `${r.fyll} / ${r.skjæring}`);
  paastand('snittykkelsen er 1 m', nær(r.snittTykkelse, 1, 1e-9));
  const r2 = T.regnMot(f, (e, n) => (e - E0 < 10 ? plan(e, n) - 2 : plan(e, n) + 0.5), { steg: 0.25 });
  paastand('halvt fylling 2 m, halvt skjæring 0,5 m', nær(r2.fyll, 400, 1e-6) && nær(r2.skjæring, 100, 1e-6) && nær(r2.netto, 300, 1e-6),
    `${r2.fyll} / ${r2.skjæring}`);
  paastand('største fyllhøyde og skjæring', nær(r2.maksFyll, 2, 1e-9) && nær(r2.maksSkjæring, 0.5, 1e-9));
  const r3 = T.regnMot(f, (e, n) => (n - N0 < 5 ? NaN : plan(e, n)), { steg: 0.25 });
  paastand('manglende terreng telles for seg og ikke som null', nær(r3.manglerTerreng, 100, 1e-6) && nær(r3.fyll, 0, 1e-9), String(r3.manglerTerreng));
  const r4 = T.regnMot(f, (e, n) => plan(e, n) - 1);
  paastand('steget velges selv når det ikke er gitt', r4.steg > 0 && nær(r4.fyll, 400, 0.5), `${r4.steg} ${r4.fyll}`);
}

console.log('Mistenkelige punkter');
{
  const P = nett(4, 4, 5, plan);
  const feilpunkt = P.find(p => p.navn === 'P2_2');
  feilpunkt.z -= 4;
  const m = T.mistenkelige(P);
  paastand('et punkt 4 m under naboene merkes', m.length === 1 && m[0].navn === 'P2_2' && m[0].avvik < -3.5, JSON.stringify(m));
  paastand('et skrått plan uten feil gir ingen merker', T.mistenkelige(nett(4, 4, 5, plan)).length === 0);
}

console.log('LandXML');
{
  const xml = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <CoordinateSystem name="EUREF89 UTM sone 33"/>
  <CgPoints>
    <CgPoint name="A1" code="TERR">6500000.5 300000.25 120.125</CgPoint>
    <CgPoint name="A2" timeStamp="2026-01-01T10:00:00">6500010 300005 121</CgPoint>
    <CgPoint oID="A3">6500020 300000 122</CgPoint>
    <CgPoint name="tom"></CgPoint>
  </CgPoints>
</LandXML>`;
  const r = T.lesLandXml(xml);
  paastand('tre punkt lest, det tomme hoppet over', r.punkter.length === 3, String(r.punkter.length));
  const a = r.punkter[0];
  paastand('rekkefølgen i fila er nord, øst, høyde', a.n === 6500000.5 && a.e === 300000.25 && a.z === 120.125);
  paastand('navn, kode og tid', a.navn === 'A1' && a.kode === 'TERR' && r.punkter[1].tid === '2026-01-01T10:00:00' && r.punkter[2].navn === 'A3');
  paastand('sonen står i koordinatsystemet', r.sone === 33, String(r.sone));
  paastand('sone fra Leica-projeksjonen (sentralmeridian 9°)',
    T.sone('<TransverseMercatorProjection falseE="5.0e+05" lambda0="1.5707963267948966e-01" scale0="0.9996">') === 32);
  paastand('sone fra EPSG-koden', T.sone('<CoordinateSystem epsgCode="25835" name="EPSG:25835"/>') === 35);
  paastand('ingen sone i fila gir null', T.sone('<LandXML></LandXML>') === null);
}

console.log('Terrenget med overlag');
{
  const { Terreng } = require('../public/js/terreng.js');
  const t = new Terreng(32, 1);
  // én flis med flat DTM på kote 50, lagt rett inn så prøven slipper nettet
  const tx = Math.floor(E0 / 256), ty = Math.floor(N0 / 256);
  t.fliser.set(t.nøkkel(tx, ty), new Float32Array(256 * 256).fill(50));
  const P = nett(4, 4, 2, () => 53);
  const f = T.lagFlate(P, { makskant: 0 });
  const x = E0 + 3.3, y = N0 + 4.1, ute = E0 + 30;
  paastand('uten overlag er z DTM', t.z(x, y) === 50);
  t.overlag = [{ ved: (a, b) => T.hoyde(f, a, b) }];
  paastand('innenfor flaten er z den innmålte høyden', t.z(x, y) === 53);
  paastand('zDtm er fortsatt Kartverkets høyde', t.zDtm(x, y) === 50);
  paastand('utenfor flaten faller z tilbake på DTM', t.z(ute, y) === 50);
  paastand('helningen følger flaten (flat innmålt flate)', t.helning(x, y) === 0);
}

console.log('Fjellmodellen under en fylling');
{
  const { Fjellmodell } = require('../public/js/masser.js');
  const vanlig = new Fjellmodell({ standarddybde: 0.5 });
  const fylt = new Fjellmodell({ standarddybde: 0.5, tillegg: () => 3 });
  const gravd = new Fjellmodell({ standarddybde: 0.5, tillegg: () => -2 });
  paastand('uten tillegg: 0,5 m til fjell', vanlig.dybde(0, 0, 0) === 0.5);
  paastand('3 m fylling: berget ligger 3,5 m under dagens bakke', fylt.dybde(0, 0, 0) === 3.5);
  paastand('gravd dypere enn berget: dybden er null, aldri negativ', gravd.dybde(0, 0, 0) === 0);
}

console.log('Matjord på fyllmasser');
{
  const Tm = require('../public/js/tomtmasser.js');
  const Tomt = require('../public/js/tomt.js');
  const { Fjellmodell } = require('../public/js/masser.js');
  const mal = Object.assign({}, Tomt.StandardTomtemal, {
    matjordDybde: 0.3, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0, forsterkningslag: 0,
    frostsikring: 0, avrettingslag: 0, overberg: 0, maksSokebredde: 60, maksSkjaeringsdybde: 0,
    maksFyllingshoyde: 0, maksVeggHoyde: 0, minAvstandTilBerg: 0, utskifting: false });
  const kjor = terreng => Tm.beregnTomtemasser({
    tomt: { punkter: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], kanter: [], nivaa: { modus: 'flat', kote: 99 } },
    mal, terreng, fjell: new Fjellmodell({ standarddybde: 100 }), rutestorrelse: 0.5, bakkefaktor: 1 });
  const urort = kjor({ z: () => 100 });
  // den vestre halvdelen (x < 10) er fylt 2 m siden DTM1, den østre er urørt
  const fylt = kjor({ z: () => 100, kjortPaa: x => (x < 10 ? 2 : 0) });
  const litt = kjor({ z: () => 100, kjortPaa: () => 0.2 });
  paastand('urørt mark: matjord over hele tomta', urort.sum.matjord > 59, String(urort.sum.matjord));
  paastand('på fyllinga er det ingen matjord å ta av', fylt.sum.matjord < urort.sum.matjord * 0.6 && fylt.sum.matjord > urort.sum.matjord * 0.35,
    `${fylt.sum.matjord} mot ${urort.sum.matjord}`);
  paastand('0,2 m over DTM1 er usikkerhet – matjorda står', Math.abs(litt.sum.matjord - urort.sum.matjord) < 1e-9);
  const { Terreng } = require('../public/js/terreng.js');
  const t = new Terreng(32, 1);
  t.fliser.set(t.nøkkel(Math.floor(E0 / 256), Math.floor(N0 / 256)), new Float32Array(256 * 256).fill(50));
  const f = T.lagFlate(nett(4, 4, 2, () => 52.5), { makskant: 0 });
  paastand('uten innmålt terreng er ingenting kjørt på', t.kjortPaa(E0 + 3, N0 + 3) === 0);
  t.overlag = [{ ved: (a, b) => T.hoyde(f, a, b) }];
  paastand('Terreng.kjortPaa er høyden over DTM1 innenfor flaten', Math.abs(t.kjortPaa(E0 + 3, N0 + 3) - 2.5) < 1e-6);
  paastand('og 0 utenfor', t.kjortPaa(E0 + 40, N0 + 3) === 0);
}

console.log('Prosjektfila');
{
  const Pf = require('../public/js/prosjektform.js');
  paastand('tin er et vindu inn i det aktive anlegget', Pf.FELT.includes('tin'));
  const P = Pf.klargjor({ navn: 'x', versjon: 2, aktivt: 't1', anlegg: [
    { id: 't1', type: 'tin', navn: 'Innmålt', tin: { punkter: [{ navn: 'A', e: 1, n: 2, z: 3 }], bruk: true } }] });
  const a = P.anlegg[0];
  paastand('et innmålt terreng forblir et innmålt terreng', a.type === 'tin' && a.tin.punkter.length === 1);
  paastand('manglende felt fylles ut', Array.isArray(a.tin.utelatt) && a.tin.makskant === null);
  paastand('knappen står som lagret', a.tin.bruk === true && P.tin === a.tin);
  const Q = Pf.klargjor({ navn: 'y', versjon: 2, aktivt: 't1', anlegg: [{ id: 't1', navn: 'uten type', tin: { punkter: [] } }] });
  paastand('typen gjettes ut fra feltet', Q.anlegg[0].type === 'tin');
  const R = Pf.klargjor({ navn: 'z', versjon: 2, aktivt: 't1', anlegg: [{ id: 't1', type: 'tin', tin: { bruk: 'ja' } }] });
  paastand('bare true slår knappen på', R.anlegg[0].tin.bruk === false);
}

/* ------------------------------------------------------------------ */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
