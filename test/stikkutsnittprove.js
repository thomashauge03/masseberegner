'use strict';
/**
 * Utsnitt til stikning: punktene i området, rekkefølgen og arket.
 *
 *   node test/stikkutsnittprove.js
 *
 * Punktene er oppdiktet.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
global.PdfSkriver = require(js('pdfeksport.js')).PdfSkriver;
global.Rorkart = require(js('rorkart.js'));
const S = require(js('stikkutsnitt.js'));

let feil = 0, ok = 0;
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

(async () => {
  console.log('\n1. Punktene i området og rekkefølgen');
  const punkter = [
    { type: 'innmalt', navn: 'p9', kode: 'vann 110', x: 500010, y: 6600010, n: 6600010.123, o: 500010.456, topp: 100.5 },
    { type: 'stikk', ror: 2, rekke: 0, navn: '2-001', kode: 'SP 160', x: 500005, y: 6600005, n: 6600005, o: 500005, topp: 99, bunn: 98.84, gravebunn: 98.6 },
    { type: 'stikk', ror: 1, rekke: 1, navn: '1-002', kode: 'VL 110', x: 500002, y: 6600002, n: 6600002, o: 500002, topp: 99.5 },
    { type: 'stikk', ror: 1, rekke: 0, navn: '1-001', kode: 'VL 110', x: 500001, y: 6600001, n: 6600001, o: 500001, topp: 99.6 },
    { type: 'kum', navn: 'K1', kode: 'kum', x: 500003, y: 6600003, n: 6600003, o: 500003, topp: 101, bunn: 98.5, diameter: 1000 },
    { type: 'innmalt', navn: 'langt unna', kode: 'vann 110', x: 501000, y: 6601000, n: 6601000, o: 501000, topp: 90 }
  ];
  const boks = { x0: 500000, y0: 6600000, x1: 500020, y1: 6600020 };
  const i = S.iBoks(punkter, boks);
  paastand('punktet utenfor området er ikke med', i.length === 5 && !i.some(p => p.navn === 'langt unna'));
  const n = S.nummerer(i);
  paastand('stikk først, rør for rør og langs røret; så kum; så innmålt',
    n.map(p => p.navn).join(',') === '1-001,1-002,2-001,K1,p9', n.map(p => p.navn).join(','));
  paastand('numrene følger rekkefølgen', n.map(p => p.nr).join(',') === '1,2,3,4,5');
  paastand('koordinaten med tusenskille og tre desimaler', S.koord(6600010.123) === '6 600 010,123', S.koord(6600010.123));

  console.log('\n2. Arket');
  const linjer = [{ kode: 'VL 110', kilde: 'planlagt', dim: 110, xy: [{ x: 500000, y: 6600000 }, { x: 500010, y: 6600010 }] },
    { kode: 'vann 110', kilde: 'innmalt', dim: 110, xy: [{ x: 500005, y: 6600000 }, { x: 500015, y: 6600015 }] }];
  const utsnitt = S.utsnittFor(boks);
  paastand('et lite område får en stor målestokk', utsnitt.N <= 500, String(utsnitt.N));
  const P = S.lagPdf({ prosjekt: 'Prøvefelt', dato: '01.05.2026', sone: 32, boks, linjer, koder: {}, punkter: n, bakgrunn: null,
    utsnitt, merknad: 'Uten bakgrunn' });
  const bytes = await P.bygg();
  paastand('PDF-en begynner som en PDF', Buffer.from(bytes).toString('latin1').startsWith('%PDF'));
  // sideinnholdet pakkes i fila – tekstene leses der de står før pakkingen
  const tekst = P.sider.map(s => s.deler.join('\n')).join('\n');
  paastand('to sider: kartet og tabellen', P.sider.length === 2, String(P.sider.length));
  paastand('koordinatene står i tabellen', /6 600 010,123/.test(tekst) && /500 010,456/.test(tekst));
  paastand('stikkpunktene har KOF-navnene', /1-001/.test(tekst) && /2-001/.test(tekst));
  paastand('høydene står med tre desimaler', /98,840/.test(tekst) && /98,600/.test(tekst));
  // mange punkt: tabellen deler seg over flere sider
  const mange = S.nummerer(Array.from({ length: 80 }, (_, k) => ({ type: 'innmalt', navn: 'p' + k, kode: 'x', x: 500000 + k / 10,
    y: 6600000, n: 6600000, o: 500000 + k / 10, topp: 100 })));
  const P2 = S.lagPdf({ prosjekt: 'Prøvefelt', sone: 32, boks, linjer: [], koder: {}, punkter: mange, utsnitt });
  paastand('80 punkt gir kart og tre sider tabell', P2.sider.length === 4, String(P2.sider.length));

  console.log(`\n${ok} tester ok, ${feil} feil`);
  process.exit(feil ? 1 : 0);
})();
