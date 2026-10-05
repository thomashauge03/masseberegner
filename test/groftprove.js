'use strict';
/**
 * Grøfta mot fasit regnet for hånd.
 *
 *   node test/groftprove.js
 *
 * Punktene er oppdiktet. Kundens filer ligger ikke i repoet – står stien i
 * ROR_FIL, kjøres en ekte fil i tillegg til slutt.
 */
const path = require('path');
const fs = require('fs');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const M = require(js('masser.js'));
const Groft = require(js('groft.js'));

/* Et rør fra punkter [x, y, topp] – som App.byggRor gir det, i regnesonen. */
function linje(id, kode, pts) {
  return { id, kode, punkter: pts.map((p, i) => ({ id: id + '-' + i, z: p[2] })), xy: pts.map(p => ({ x: p[0], y: p[1] })) };
}
/* Et rett rør med punkt hver 10. m, på skrå (0,3 rad) så kantene ikke følger
   rutenettet. `forskyv` flytter det sidelengs; `fall` senker toppen per meter. */
function rett(id, kode, lengde, topp, x0 = 1000, y0 = 1000, vinkel = 0.3, forskyv = 0, fall = 0) {
  const ux = Math.cos(vinkel), uy = Math.sin(vinkel), nx = -uy, ny = ux;
  const pts = [];
  for (let s = 0; s <= lengde + 1e-9; s += 10) pts.push([x0 + ux * s + nx * forskyv, y0 + uy * s + ny * forskyv, topp - fall * s]);
  return linje(id, kode, pts);
}
/* Posisjonen langs og ut fra et rør lagt med `rett` (vinkel 0,3, start 1000, 1000). */
const langs = (x, y) => (x - 1000) * Math.cos(0.3) + (y - 1000) * Math.sin(0.3);
const tvers = (x, y) => -(x - 1000) * Math.sin(0.3) + (y - 1000) * Math.cos(0.3);
const punktVed = (s, n) => ({ x: 1000 + Math.cos(0.3) * s - Math.sin(0.3) * n, y: 1000 + Math.sin(0.3) * s + Math.cos(0.3) * n });

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

console.log('\n1. Fjell fra sonderinger');
{
  const fm = new M.Fjellmodell({ standarddybde: 0.5, rekkevidde: 60, punkter: [{ x: 0, y: 0, dybde: 1.2 }] });
  sjekk('ved sonderingen', fm.sondert(0, 0.01), 1.2, 1e-9);
  sjekk('innenfor rekkevidden', fm.sondert(30, 0), 1.2, 1e-9);
  paastand('utenfor rekkevidden: ingenting – ikke standarddybden', fm.sondert(100, 0) === null);
  paastand('uten sonderinger: ingenting', new M.Fjellmodell({ standarddybde: 0.5 }).sondert(0, 0) === null);
  paastand('dybde() bruker fortsatt standarddybden', new M.Fjellmodell({ standarddybde: 0.5 }).dybde(0, 0, 0) === 0.5);
}

console.log('\n2. Målene og hvor de gjelder');
{
  const m = Groft.malFor({ helning: 0.5 }, { bunntillegg: 0.1 }, { fundament: 0.25 });
  sjekk('anleggets helning', m.helning, 0.5, 0);
  sjekk('kodens arbeidsrom', m.bunntillegg, 0.1, 0);
  sjekk('strekningens fundament', m.fundament, 0.25, 0);
  sjekk('standard omfylling', m.omfylling, 0.3, 0);
  sjekk('helning 0 er lov – loddrett', Groft.malFor({}, null, { helning: 0 }).helning, 0, 0);
  paastand('et felt som ikke er satt, arves', Groft.malFor({ fundament: 0.2 }, { fundament: null }, {}).fundament === 0.2);
  sjekk('klem: tekst med komma', Groft.klem('fundament', '0,2'), 0.2, 1e-12);
  sjekk('klem: over grensen', Groft.klem('helning', 9), 3, 0);
  paastand('klem: ikke et tall', Groft.klem('omfylling', 'abc') === null && Groft.klem('fjell', null) === null
    && Groft.klem('fjell', '') === null);
  paastand('klem: under null er en skrivefeil, ikke fjell i dagen', Groft.klem('fjell', '-0,5') === null
    && Groft.klem('fundament', -0.1) === null && Groft.klem('fjell', 0) === 0);
}

console.log('\n3. Rørene som segmenter');
{
  const M1 = Groft.forbered({ linjer: [rett('a', '90PE', 100, 8.5), rett('b', 'RØR', 50, 8.5, 2000, 2000)],
    koder: { '90PE': { dim: 90 }, 'RØR': { dim: null } }, terrengZ: () => 10 });
  paastand('røret med dimensjon er med', M1.ror.length === 1 && M1.ror[0].kode === '90PE');
  sjekk('røret uten dimensjon er ikke med, men lengden er talt', M1.utenDimensjon.get('RØR'), 50, 1e-9);
  sjekk('ett segment per strekk mellom målte punkt', M1.seg.length, 10, 0);
  sjekk('halv bunnbredde = D/2 + 0,3', M1.seg[0].w, 0.045 + 0.3, 1e-12);
  const M2 = Groft.forbered({ linjer: [rett('a', '90PE', 100, 8.5)], koder: { '90PE': { dim: 90 } }, terrengZ: () => 10,
    justering: { strekninger: [{ fra: 'a-2', til: 'a-5', mal: { helning: 0.5 }, fjell: 0.4, egen: true }], sammen: [] } });
  paastand('strekningen gjelder segment 2–4', [2, 3, 4].every(i => M2.seg[i].hel === 0.5 && M2.seg[i].fjell === 0.4)
    && M2.seg[1].hel === 1 && M2.seg[5].hel === 1);
  paastand('egen grøft får egen gruppe', M2.seg[2].gruppe > 0 && M2.seg[2].gruppe === M2.seg[4].gruppe && M2.seg[1].gruppe === 0);
  sjekk('to grupper i alt', M2.grupper, 2, 0);
  const M3 = Groft.forbered({ linjer: [rett('a', '90PE', 100, 8.5)], koder: { '90PE': { dim: 90 } }, terrengZ: () => 10, rute: 0.3 });
  sjekk('en rute som ikke går opp i 5 m, justeres så den gjør det', 5 / M3.rute, Math.round(5 / M3.rute), 1e-9);
}

console.log('\n4. Én grøft mot fasit');
const D = 0.16, b = D + 0.6, f = 0.15, o = 0.3, TERRENG = 10, TOPP = 8.5;
const h = TERRENG - (TOPP - D - f);                    // 1,81 m fra terreng til gravebunn
const koder160 = { '160PE': { dim: 160 }, '40 FIBER': { dim: 40 } };
const flatt = () => TERRENG;
/* Massene per meter: to rør med samme start, 200 og 100 m lange. Endene er
   like, og forskjellen er 100 m rett grøft. */
function perMeter(lag) {
  const a = lag(200).sum, c = lag(100).sum, ut = {};
  for (const k of ['gravingLos', 'sprengning', 'fundament', 'omfylling', 'gjenfylling', 'rorvolum', 'areal']) {
    ut[k] = (a[k] - c[k]) / 100;
  }
  return ut;
}
const en = L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt, rute: 0.2 });
{
  const p = perMeter(en);
  const A = (b + h) * h;
  sjekk('graving per meter = (b + h)·h', p.gravingLos, A, A * 0.01);
  sjekk('ingen sprengning uten fjell', p.sprengning, 0, 1e-9);
  const fund = (b + f) * f;
  sjekk('fundament per meter – trapes', p.fundament, fund, fund * 0.02);
  const omf = (b + 2 * f + b + 2 * (f + D + o)) / 2 * (D + o);
  sjekk('omfylling med røret per meter – trapes', p.omfylling + p.rorvolum, omf, omf * 0.02);
  sjekk('gjenfylling er resten', p.gjenfylling, A - fund - omf, A * 0.01);
  const s = en(100).sum;
  sjekk('graving = fundament + omfylling + gjenfylling + røret', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum, 1e-6);
  // endene er avrundede groper: til sammen én hel omdreining av tverrsnittet
  const w = b / 2, vRot = Math.PI * (w * w * h + h ** 3 / 3 + w * h * h);
  sjekk('100 m med avrundede ender', s.gravingLos, 100 * A + vRot, (100 * A + vRot) * 0.01);
}
{
  const medFjell = L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: [{ fra: 'a-0', til: 'a-' + (L / 10), mal: {}, fjell: 0.8, egen: false }], sammen: [] } });
  const p = perMeter(medFjell);
  const zf = TERRENG - 0.8, zb = TOPP - D - f;
  sjekk('sprengning: loddrett fjellgrøft, b · (fjell − gravebunn)', p.sprengning, b * (zf - zb), b * (zf - zb) * 0.02);
  sjekk('løsmassen over: 1:1 fra fjellkanten', p.gravingLos, (b + 0.8) * 0.8, (b + 0.8) * 0.8 * 0.02);
}
{
  // fjellet fra sonderingene gir det samme som fjell markert på røret
  const p = perMeter(L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt,
    rute: 0.2, fjellSondert: () => 0.8 }));
  const zf = TERRENG - 0.8, zb = TOPP - D - f;
  sjekk('sonderingene: loddrett fjellgrøft', p.sprengning, b * (zf - zb), b * (zf - zb) * 0.02);
  sjekk('og løsmassen over', p.gravingLos, (b + 0.8) * 0.8, (b + 0.8) * 0.8 * 0.02);
}
{
  const p = perMeter(L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt,
    rute: 0.2, mal: { helning: 0 } }));
  sjekk('loddrette vegger: b · h', p.gravingLos, b * h, b * h * 0.02);
}
{
  /* SIDEHELLING. Terrenget stiger 1:2 til den ene siden, og skråningen er
     1:1,5. Veggen møter terrenget 12,4 m ut på oppsiden – overslaget fra
     dybden ved røret kappet grøfta ved 8,8 m. Fasiten er tverrsnittet
     integrert fint ut. */
  const k = 0.5, hel = 1.5, w = b / 2, zb = TOPP - D - f;
  const lia = (x, y) => TERRENG + k * tvers(x, y);
  const p = perMeter(L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: lia,
    rute: 0.2, mal: { helning: hel } }));
  let A = 0;
  for (let n = -30; n < 30; n += 0.001) {
    const m = n + 0.0005, T = TERRENG + k * m, z = Math.abs(m) <= w ? zb : zb + (Math.abs(m) - w) / hel;
    if (z < T) A += (T - z) * 0.001;
  }
  sjekk('sidehelling: hele tverrsnittet opp til terrenget', p.gravingLos, A, A * 0.01);
  const brattere = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, rute: 0.2,
    terrengZ: (x, y) => TERRENG + 0.7 * tvers(x, y), mal: { helning: hel } });
  paastand('brattere li enn skråningen: merknad om at gropa er kappet',
    brattere.merknader.some(m => m.type === 'kappet'), brattere.merknader.map(m => m.type).join(','));
}
{
  /* Hull i terrenget: 20 m av grøfta uten data. Arealet er grøftas bredde i
     toppen ganger lengden – ikke hele søkeboksen. */
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, rute: 0.2,
    terrengZ: (x, y) => (langs(x, y) > 40 && langs(x, y) < 60 ? NaN : TERRENG) });
  const ventet = 20 * 2 * (b / 2 + h);
  sjekk('hull i terrenget: arealet av grøfta i hullet', r.manglerTerreng, ventet, ventet * 0.03);
  const ved = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, rute: 0.2,
    terrengZ: (x, y) => (langs(x, y) > 40 && langs(x, y) < 60 && tvers(x, y) > 5 && tvers(x, y) < 6 ? NaN : TERRENG) });
  sjekk('et hull ved siden av grøfta er ingen grøft uten terreng', ved.manglerTerreng, 0, 0);
  paastand('og ingen merknad', !ved.merknader.some(m => m.type === 'hull'));
}
{
  /* Røret stikker 5 cm opp over terrenget: gropa graver likevel under det.
     Én regel – graves det her – for lengden, røret og merknaden. */
  const r = Groft.beregn({ linjer: [rett('a', '400PVC', 100, TERRENG + 0.05)], koder: { '400PVC': { dim: 400 } },
    terrengZ: flatt, rute: 0.2 });
  sjekk('røret litt over terrenget: lengden telles der det graves', r.sum.lengde, 100, 1e-6);
  sjekk('og bare røret under terrenget trekkes fra', r.sum.rorvolum, Math.PI * 0.4 * 0.4 / 4 * 100 * 0.35 / 0.4, 1e-6);
  const s = r.sum;
  sjekk('regnestykket går opp', s.gravingLos + s.sprengning, s.fundament + s.omfylling + s.gjenfylling + s.rorvolum, 1e-6);
  paastand('merknaden sier at røret ligger over, ikke at det ikke graves',
    r.merknader.some(m => m.type === 'over' && !/ingen grøft/.test(m.tekst)));
}
{
  /* Bakkefaktoren, som for vegen: lengden langs røret er et kartmål og ganges
     med den. Tverrsnittet er malen i virkelige meter, så volumene ganges med
     faktoren én gang – ikke med kvadratet, som for en tomt. */
  const bf = 1.01;
  const lag = k => Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, terrengZ: flatt, rute: 0.2,
    bakkefaktor: k });
  const u = lag(undefined), m = lag(bf);
  sjekk('bakkefaktoren: lengden ganges med den', m.sum.lengde, u.sum.lengde * bf, 1e-9);
  sjekk('og dybdeklassene', m.dybdeklasser[1].lengde, u.dybdeklasser[1].lengde * bf, 1e-9);
  sjekk('gravingen også – én gang', m.sum.gravingLos, u.sum.gravingLos * bf, 1e-6);
  sjekk('røret med faktoren', m.sum.rorvolum, u.sum.rorvolum * bf, 1e-9);
  sjekk('og regnestykket går opp', m.sum.gravingLos + m.sum.sprengning,
    m.sum.fundament + m.sum.omfylling + m.sum.gjenfylling + m.sum.rorvolum, 1e-6);
}

console.log('\n5. Felles grøft, egen grøft og sammenslåing');
{
  // to parallelle rør, sentrene ±0,5 m: gropene smelter sammen til én
  const to = (L, egen) => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP, 1000, 1000, 0.3, -0.5),
    rett('b', '160PE', L, TOPP, 1000, 1000, 0.3, 0.5)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: egen ? [{ fra: 'b-0', til: 'b-' + (L / 10), mal: {}, fjell: null, egen: true }] : [], sammen: [] } });
  const p = perMeter(L => to(L, false));
  /* Bunnene når ikke helt sammen: 1 m mellom sentrene er 0,24 m mer enn
     bunnbredden, og der står en rygg på 0,12 m (1:1) – en trekant på
     (1 − b)²/4 som ikke graves. */
  const felles = (1 + b + h) * h - (1 - b) ** 2 / 4;
  sjekk('felles grøft: én grop med en lav rygg midt i', p.gravingLos, felles, felles * 0.005);
  const pe = perMeter(L => to(L, true));
  sjekk('egen grøft: to hele groper', pe.gravingLos, 2 * (b + h) * h, 2 * (b + h) * h * 0.01);
}
{
  // et grunt fiberrør 0,5 m til siden, i grøfta til et dypt rør
  const lag = L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP), rett('f', '40 FIBER', L, 9.3, 1000, 1000, 0.3, 0.5)],
    koder: koder160, terrengZ: flatt, rute: 0.2 });
  const p = perMeter(lag), alene = perMeter(en);
  sjekk('fiberet gjør ikke grøfta større', p.gravingLos, alene.gravingLos, alene.gravingLos * 0.005);
  const wf = 0.02 + 0.3, ff = (2 * wf + f) * f;
  sjekk('fiberet får sitt eget fundament der det ligger', p.fundament - alene.fundament, ff, ff * 0.05);
  const of = (2 * wf + 2 * f + 2 * wf + 2 * (f + 0.04 + o)) / 2 * (0.04 + o);
  sjekk('og sin egen omfylling', (p.omfylling + p.rorvolum) - (alene.omfylling + alene.rorvolum), of, of * 0.05);
}
{
  // sammenslått: to rør 3 m fra hverandre får flat bunn mellom seg
  const par = (L, sammen) => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP, 1000, 1000, 0.3, -1.5),
    rett('b', '160PE', L, TOPP, 1000, 1000, 0.3, 1.5)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: [], sammen: sammen ? [['a-0', 'b-0']] : [] } });
  const uten = perMeter(L => par(L, false)), med = perMeter(L => par(L, true));
  sjekk('sammenslått: flat bunn 3 + b', med.gravingLos, (3 + b + h) * h, (3 + b + h) * h * 0.015);
  paastand('mer enn uten sammenslåing', med.gravingLos > uten.gravingLos + 0.5, `${med.gravingLos} / ${uten.gravingLos}`);
  const u100 = par(100, false);
  sjekk('3 m fra hverandre uten sammenslåing: to grøfter, to lengder', u100.sum.lengde, 200, 1e-6);
}
{
  /* ÉN GRØFT, ÉN LENGDE – også med fall og på UTM-koordinater, der
     avrundingsstøyen før avgjorde om meteren ble talt (60 eller 70 av 100). */
  const par = (x0, y0, dz) => Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP, x0, y0, 0.3, -1.5, 0.013),
    rett('b', '160PE', 100, TOPP - dz, x0, y0, 0.3, 1.5, 0.013)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: [], sammen: [['a-0', 'b-0']] } });
  for (const [x0, y0, navn] of [[1000, 1000, 'små koordinater'], [512345.67, 6612345.89, 'UTM-koordinater']]) {
    const l = (r, id) => r.perLinje.get(id).lengde;
    const er = (v, x) => Math.abs(v - x) < 1e-6;
    const bDyp = par(x0, y0, 0.5), aDyp = par(x0, y0, -0.5), likt = par(x0, y0, 0);
    paastand(`sammenslått med fall, ${navn}: det dypeste røret får lengden`,
      er(l(bDyp, 'b'), 100) && er(l(bDyp, 'a'), 0) && er(l(aDyp, 'a'), 100) && er(l(aDyp, 'b'), 0),
      `${l(bDyp, 'a')}/${l(bDyp, 'b')} og ${l(aDyp, 'a')}/${l(aDyp, 'b')}`);
    paastand(`like dype, ${navn}: det første røret`, er(l(likt, 'a'), 100) && er(l(likt, 'b'), 0),
      `${l(likt, 'a')}/${l(likt, 'b')}`);
  }
}
{
  // to like rør tett i tett er én grøft – og to egne grøfter er to
  const to = egen => Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP, 1000, 1000, 0.3, -0.5),
    rett('b', '160PE', 100, TOPP, 1000, 1000, 0.3, 0.5)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: egen ? [{ fra: 'b-0', til: 'b-10', mal: {}, fjell: null, egen: true }] : [], sammen: [] } });
  sjekk('to like rør i samme grøft: én lengde', to(false).sum.lengde, 100, 1e-6);
  sjekk('med egen grøft for det ene: to', to(true).sum.lengde, 200, 1e-6);
}
{
  /* EGEN GRØFT MIDT PÅ ET RØR. Grøfta fortsetter der strekningen begynner og
     slutter; før fikk begge gruppene en rund ende der, og det ble 22 m³ for
     mye. Også der røret knekker i overgangen. */
  const midt = (linjer, st) => Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: st, sammen: [] } }).sum;
  const egen = (fra, til) => [{ fra, til, mal: {}, fjell: null, egen: true }];
  const rr = [rett('a', '160PE', 100, TOPP)];
  const u = midt(rr, []), e = midt(rr, egen('a-4', 'a-6'));
  sjekk('egen grøft midt på et rør: ingen ekstra graving', e.gravingLos, u.gravingLos, 0.01);
  sjekk('og intet ekstra fundament', e.fundament, u.fundament, 0.01);
  sjekk('og samme lengde', e.lengde, 100, 1e-6);
  const knekk = [];
  for (let s = 0; s <= 50; s += 10) knekk.push([1000 + Math.cos(0.3) * s, 1000 + Math.sin(0.3) * s, TOPP]);
  const P5 = knekk[5];
  for (let s = 10; s <= 50; s += 10) knekk.push([P5[0] + Math.cos(0.8) * s, P5[1] + Math.sin(0.8) * s, TOPP]);
  const kr = [linje('k', '160PE', knekk)];
  const ku = midt(kr, []), ke = midt(kr, egen('k-5', 'k-8'));
  sjekk('egen grøft som begynner i en knekk: samme graving', ke.gravingLos, ku.gravingLos, ku.gravingLos * 0.001);
}
{
  /* SAMMENSLÅTT, ULIKE LANGE RØR. Klikkrekkefølgen betyr ingenting, og forbi
     enden av det korte røret er det ingen flat bunn – der trakk alle
     tverrstrekene til endepunktet, i en vifte. */
  const par = (sammen) => Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP, 1000, 1000, 0.3, -1.5),
    rett('b', '160PE', 50, TOPP, 1000, 1000, 0.3, 1.5)], koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger: [], sammen } });
  const ab = par([['a-0', 'b-0']]), ba = par([['b-2', 'a-7']]), uten = par([]);
  sjekk('klikkrekkefølgen betyr ingenting', ab.sum.gravingLos, ba.sum.gravingLos, 1e-6);
  const q = punktVed(55, 0);
  sjekk('5 m forbi enden av det korte, midt mellom: som uten sammenslåing',
    Groft.nivaa(ab.modell, q.x, q.y), Groft.nivaa(uten.modell, q.x, q.y), 1e-9);
  const i = punktVed(25, 0);
  sjekk('men flat bunn der de går side om side', Groft.nivaa(ab.modell, i.x, i.y), TOPP - D - f, 1e-6);
}
{
  /* Fjell markert på rørene gjelder også i den flate bunnen mellom dem –
     sprengningen er det dyreste i grøfta. Fasit: bunnen 3 + b bred i fjell. */
  const par = (L, strek) => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP, 1000, 1000, 0.3, -1.5),
    rett('b', '160PE', L, TOPP, 1000, 1000, 0.3, 1.5)], koder: koder160, terrengZ: flatt, rute: 0.2,
    fjellSondert: strek ? undefined : () => 0.8,
    justering: { strekninger: strek ? ['a', 'b'].map(id => ({ fra: id + '-0', til: id + '-' + (L / 10), mal: {}, fjell: 0.8,
      egen: false })) : [], sammen: [['a-0', 'b-0']] } });
  const p = perMeter(L => par(L, true)), s = perMeter(L => par(L, false));
  const ventet = (3 + b) * (TERRENG - 0.8 - (TOPP - D - f));
  sjekk('fjell fra strekningene i den flate bunnen', p.sprengning, ventet, ventet * 0.01);
  sjekk('det samme som fra sonderingene', p.sprengning, s.sprengning, s.sprengning * 0.001);
}
{
  // målene på en strekning og per kode gjelder
  const L = 100, ett = ekstra => Groft.beregn(Object.assign({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160,
    terrengZ: flatt, rute: 0.2 }, ekstra)).sum.gravingLos;
  const anlegg = ett({ mal: { helning: 0.5 } });
  sjekk('helning på en strekning over hele røret', ett({ justering: { strekninger: [{ fra: 'a-0', til: 'a-10',
    mal: { helning: 0.5 }, fjell: null, egen: false }], sammen: [] } }), anlegg, anlegg * 1e-9);
  sjekk('helning per kode', ett({ koder: { '160PE': { dim: 160, groft: { helning: 0.5 } } } }), anlegg, anlegg * 1e-9);
  const halv = ett({ justering: { strekninger: [{ fra: 'a-5', til: 'a-0', mal: { helning: 0.5 }, fjell: null, egen: false }], sammen: [] } });
  const hel = en(L).sum.gravingLos;
  paastand('en strekning over halve røret gir noe imellom', halv < hel && halv > anlegg, `${anlegg} < ${halv} < ${hel}`);
  const feilM = Groft.forbered({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt,
    justering: { strekninger: [{ fra: 'a-0', til: 'x-3', mal: {}, fjell: null, egen: false }], sammen: [['a-0', 'y-1']] } });
  sjekk('strekning som ikke treffer, telles', feilM.strekUtenTreff, 1, 0);
  sjekk('sammenslåing som ikke treffer, telles', feilM.sammenUtenTreff, 1, 0);
}

console.log('\n6. Langs rørene');
{
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP), rett('c', '160PE', 50, 7.5, 3000, 3000)],
    koder: koder160, terrengZ: flatt, rute: 0.2 });
  sjekk('1–2 m: det første røret', r.dybdeklasser[1].lengde, 100, 1e-6);
  sjekk('2–3 m: det andre', r.dybdeklasser[2].lengde, 50, 1e-6);
  sjekk('løpemeter i alt', r.sum.lengde, 150, 1e-6);
  sjekk('røret: π D²/4 per meter', r.sum.rorvolum, Math.PI * D * D / 4 * 150, 1e-6);
  const s = r.sum;
  sjekk('graving = fyll + røret', s.gravingLos + s.sprengning, s.fundament + s.omfylling + s.gjenfylling + s.rorvolum, 1e-6);
  paastand('per kode er summen av rørene', Math.abs(r.perKode.get('160PE').gravingLos - s.gravingLos) < 1e-6);
  const pr = r.profiler.get('a');
  sjekk('profilen har én prøve per meter', pr.length, 101, 0);
  sjekk('gravebunnen i profilen', pr[50].gravebunn, TOPP - D - f, 1e-9);
  const x50 = 1000 + Math.cos(0.3) * 50, y50 = 1000 + Math.sin(0.3) * 50;
  sjekk('gravenivået midt i grøfta', Groft.nivaa(r.modell, x50, y50), TOPP - D - f, 1e-9);
  paastand('og ingenting langt unna', Number.isNaN(Groft.nivaa(r.modell, x50 + 50, y50)));
  const kant = Groft.kanter(r.modell);
  paastand('grøftekanten har to sider per rør', kant.length === 4, String(kant.length));
  const k0 = kant[0][Math.floor(kant[0].length / 2)];
  const ut0 = Math.abs(-(k0.x - 1000) * Math.sin(0.3) + (k0.y - 1000) * Math.cos(0.3));
  sjekk('kanten ligger w + h ut fra røret', ut0, b / 2 + h, 0.12);
}
{
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP), rett('f', '40 FIBER', 100, 9.3, 1000, 1000, 0.3, 0.5)],
    koder: koder160, terrengZ: flatt, rute: 0.2 });
  sjekk('fiberet i grøfta til det dype: én lengde', r.sum.lengde, 100, 1e-6);
  sjekk('og den står på det dype røret', r.perLinje.get('a').lengde, 100, 1e-6);
}
{
  /* ET KNUTEPUNKT, bygd som programmet bygger det: tre rør med samme kode
     møtes i M50. Hver gren beholder sine meter – de krysser, de går ikke
     langs hverandre – og strekninger og sammenslåinger som begynner i
     knutepunktet, havner på riktig rør. */
  const Ror = require(js('ror.js'));
  const pts = [];
  let nr = 1;
  for (let x = 0; x <= 100; x += 10) pts.push({ id: 'M' + x, kode: '160PE', o: 1000 + x, n: 5000, z: 8.5 - x * 0.01, nr: nr++ });
  for (let y = 10; y <= 40; y += 10) pts.push({ id: 'G' + y, kode: '160PE', o: 1050, n: 5000 + y, z: 8.0 - y * 0.01, nr: nr++ });
  for (let y = 0; y <= 40; y += 10) pts.push({ id: 'K' + y, kode: '110PE', o: 1053, n: 5000 + y, z: 8.2, nr: nr++ });
  const ror = { punkter: pts, koder: Ror.koderFra(pts), retting: { av: [], brudd: [], koble: [] } };
  const bygg = Ror.byggLinjer(ror, Ror.StandardRormal, p => ({ x: p.o, y: p.n }));
  const lag = just => Groft.beregn({ linjer: bygg.linjer, koder: ror.koder, terrengZ: () => 10, rute: 0.2, justering: just });
  const g = lag(undefined);
  const l = id => g.perLinje.get(bygg.linjer.find(x => x.punkter.some(p => p.id === id)
    && x.punkter.some(p => p.id === 'M50')).id).lengde;
  paastand('knutepunkt: hver gren beholder lengden sin', l('M0') === 50 && l('M100') === 50 && l('G40') === 40,
    `${l('M0')} / ${l('M100')} / ${l('G40')}`);
  for (const til of ['M0', 'M100', 'G40']) {
    const M = Groft.forbered({ linjer: bygg.linjer, koder: ror.koder, terrengZ: () => 10,
      justering: { strekninger: [{ fra: 'M50', til, mal: { helning: 0 }, fjell: null, egen: false }], sammen: [] } });
    const rr = M.ror.find(x => x.linje.punkter.some(p => p.id === til));
    paastand(`strekning fra knutepunktet til ${til}: på det røret`, M.strekUtenTreff === 0
      && rr.segmenter.every(j => M.seg[j].hel === 0), `uten treff ${M.strekUtenTreff}`);
  }
  const M = Groft.forbered({ linjer: bygg.linjer, koder: ror.koder, terrengZ: () => 10,
    justering: { strekninger: [], sammen: [['M50', 'K20']] } });
  const gren = M.ror.findIndex(x => x.linje.punkter.some(p => p.id === 'G40'));
  paastand('felles grøft fra knutepunktet: grenen som går langs det andre røret',
    M.seg.some(s => s.virtuell) && M.seg.filter(s => s.virtuell).every(s => s.ra === gren || s.rb === gren));
}
{
  /* Et punkt målt to ganger gir et segment uten lengde til slutt. Grøftekanten
     tok retningen fra det, og mistet det siste punktet. */
  const pts = [];
  for (let s = 0; s <= 20; s += 10) pts.push([1000 + s, 1000, TOPP]);
  pts.push([1020, 1000, TOPP]);
  const r = Groft.beregn({ linjer: [linje('d', '160PE', pts)], koder: koder160, terrengZ: flatt, rute: 0.2 });
  const kant = Groft.kanter(r.modell);
  paastand('punkt målt to ganger: kanten har et punkt per stasjon', kant.length === 2
    && kant.every(k => k.length === 21), kant.map(k => k.length).join(','));
}
{
  /* Sonderingene slås opp én gang per meter – før gikk hvert oppslag gjennom
     alle sonderingene for hver rute, og 300 av dem tok 3 s. */
  const fm = new M.Fjellmodell({ standarddybde: 0.5, rekkevidde: 60,
    punkter: Array.from({ length: 500 }, (_, i) => ({ x: 1000 + (i % 25) * 8, y: 1000 + Math.floor(i / 25) * 4, dybde: 5 })) });
  const t0 = Date.now();
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 200, TOPP), rett('c', '160PE', 200, TOPP, 1000, 1000, 0.3, 4)],
    koder: koder160, terrengZ: flatt, rute: 0.2, fjellSondert: (x, y) => fm.sondert(x, y) });
  const ms = Date.now() - t0;
  paastand('500 sonderinger: under 2 s', ms < 2000, ms + ' ms');
  sjekk('og fjellet på 5 m er under grøfta', r.sum.sprengning, 0, 1e-9);
}
{
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, 10.5), rett('u', 'UKJENT', 30, TOPP, 3000, 3000)],
    koder: { '160PE': { dim: 160 }, UKJENT: { dim: null } }, terrengZ: flatt, rute: 0.2 });
  paastand('over terrenget: merknad', r.merknader.some(m => m.type === 'over'));
  paastand('uten dimensjon: merknad med koden', r.merknader.some(m => m.type === 'dimensjon' && /UKJENT/.test(m.tekst)));
  sjekk('og lengden står i utenDimensjon', r.utenDimensjon[0].lengde, 30, 1e-9);
  paastand('fjellet: sier at alt er løsmasse', r.merknader.some(m => m.type === 'fjell' && /løsmasse/.test(m.tekst)));
}

console.log('\n6b. Kummene');
{
  /* En kum alene på flat mark, langt fra røret den hører til. Gropa er en
     avkortet kjegle; fundamentet er de nederste 0,15 m av den; kummen selv er
     en sylinder fra kumbunnen til terrenget. */
  const ytre = 1.0 + 0.2, arb = 0.5, bunnlop = 7.0, kumBunn = bunnlop - 0.25;
  const r0 = ytre / 2 + arb, dyp = TERRENG - (kumBunn - f), R = r0 + dyp;   // helning 1:1
  const linjer = [rett('a', '160PE', 10, TOPP)];
  const uten = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.1 });
  const med = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.1, kumArbeidsrom: arb,
    kummer: [{ id: 'k1', x: 1200, y: 1200, bunnlop, diameter: 1000, eier: 'a' }] });
  const d = k => med.sum[k] - uten.sum[k];
  const V = Math.PI * dyp / 3 * (r0 * r0 + r0 * R + R * R);
  sjekk('kumgropa: avkortet kjegle', d('gravingLos'), V, V * 0.01);
  const r1 = r0 + f, F = Math.PI * f / 3 * (r0 * r0 + r0 * r1 + r1 * r1);
  sjekk('fundamentet under kummen', d('fundament'), F, F * 0.02);
  const Kv = Math.PI * (ytre / 2) ** 2 * (TERRENG - kumBunn);
  sjekk('kummen selv trekkes fra', med.sum.kumvolum, Kv, Kv * 0.02);
  sjekk('resten er gjenfylling', d('gjenfylling'), V - F - Kv, V * 0.01);
  const s = med.sum;
  sjekk('regnestykket går opp med kummen', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum + s.kumvolum, 1e-6);
  sjekk('kummen føres på røret', med.perLinje.get('a').kumvolum, Kv, Kv * 0.02);
}
{
  // en kum på røret: én grop, ikke to – og løpemeteren og dybdeklassen er grøftas
  const linjer = [rett('a', '160PE', 100, TOPP)];
  const q = punktVed(50, 0);
  const uten = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2 });
  const med = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2,
    kummer: [{ id: 'k1', x: q.x, y: q.y, bunnlop: TOPP - D + 0.005, diameter: 1000, eier: 'a' }] });
  paastand('kummen gjør gropa større', med.sum.gravingLos > uten.sum.gravingLos + 5);
  sjekk('men lengden er den samme', med.sum.lengde, 100, 1e-6);
  sjekk('og dybdeklassen er grøftas', med.dybdeklasser[1].lengde, 100, 1e-6);
  const s = med.sum;
  sjekk('og regnestykket går opp', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum + s.kumvolum, 1e-6);
}
{
  /* Kummen arver strekningen den står på: fjellet som er markert der, og
     «egen grøft». Uten det ble kumgropa regnet som løsmasse i fjell – så
     sprengningen ble MINDRE med en kum – og en egen grøft talte gropa to ganger. */
  const linjer = [rett('a', '160PE', 100, TOPP)];
  const q = punktVed(50, 0);
  const kum = [{ id: 'k1', x: q.x, y: q.y, bunnlop: TOPP - D + 0.005, diameter: 1000, eier: 'a' }];
  const regn = (strekninger, kummer) => Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2,
    justering: { strekninger, sammen: [] }, kummer });
  const fjell = [{ fra: 'a-0', til: 'a-10', mal: {}, fjell: 0.5, egen: false }];
  const fU = regn(fjell, []), fM = regn(fjell, kum);
  paastand('kum i fjell: sprengningen øker', fM.sum.sprengning > fU.sum.sprengning + 1,
    `${fU.sum.sprengning.toFixed(1)} → ${fM.sum.sprengning.toFixed(1)}`);
  paastand('og løsmassen bare i laget over fjellet', fM.sum.gravingLos - fU.sum.gravingLos < 5,
    `${fU.sum.gravingLos.toFixed(1)} → ${fM.sum.gravingLos.toFixed(1)}`);
  const nU = regn([], []), nM = regn([], kum);
  const egen = [{ fra: 'a-4', til: 'a-6', mal: {}, fjell: null, egen: true }];
  const eU = regn(egen, []), eM = regn(egen, kum);
  sjekk('kum i egen grøft: gropa telles én gang', eM.sum.gravingLos - eU.sum.gravingLos,
    nM.sum.gravingLos - nU.sum.gravingLos, 1.5);
  const s = eM.sum;
  sjekk('og regnestykket går opp', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum + s.kumvolum, 1e-6);
}

console.log('\n7. Massebalansen');
{
  const sum = { gravingLos: 100, sprengning: 20, fundament: 5, omfylling: 15, gjenfylling: 70 };
  const fk = { losmasseIFylling: 0.95, sprengningsfaktor: 1.5 };
  const b1 = Groft.balanse(sum, { brukbar: 1 }, fk);
  sjekk('gjenfyllingen tas fra gravemassen', b1.gjenfyllingFraGraving, 70, 1e-9);
  sjekk('overskuddet er resten, i fast mål', b1.overskuddLos, 100 - 70 / 0.95, 1e-9);
  sjekk('sprengt fjell, løst', b1.sprengtLos, 30, 1e-9);
  sjekk('fundament og omfylling kjøpes', b1.kjopFundament + b1.kjopOmfylling, 20, 1e-9);
  sjekk('ingen gjenfylling å kjøpe', b1.kjopGjenfylling, 0, 1e-9);
  const b2 = Groft.balanse(sum, { brukbar: 0.5 }, fk);
  sjekk('halvparten brukbar: resten kjøpes', b2.kjopGjenfylling, 70 - 50 * 0.95, 1e-9);
}

console.log('\n8. Grøftefeltene i prosjektfila');
{
  const Prosjektform = require(js('prosjektform.js'));
  const P = Prosjektform.klargjor({ navn: 'g', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror',
    mal: { groft: { helning: '0,5', fundament: 9, omfylling: 'tull' } },
    ror: { punkter: [], koder: { '90PE': { dim: 90, form: 'linje', groft: { bunntillegg: '0.1', helning: null, x: 1 } },
      '32PE': { dim: 32, form: 'linje', groft: 'tull' } },
      groft: { strekninger: [{ fra: 'a', til: 'b', mal: { helning: 5, tull: 1 }, fjell: '0,8', egen: 'ja' }, null, { fra: {} }],
        sammen: [['a', 'b'], ['c'], 'x'] } } }] });
  const a = P.anlegg[0];
  sjekk('helning som tekst blir tall', a.mal.groft.helning, 0.5, 1e-12);
  sjekk('fundament over grensen klemmes', a.mal.groft.fundament, 1, 0);
  sjekk('omfylling som ikke er tall får standarden', a.mal.groft.omfylling, 0.3, 0);
  sjekk('brukbar får standarden', a.mal.groft.brukbar, 1, 0);
  paastand('kodemål: bare lovlige felt', JSON.stringify(a.ror.koder['90PE'].groft) === '{"bunntillegg":0.1}',
    JSON.stringify(a.ror.koder['90PE'].groft));
  paastand('kodemål som ikke er et objekt tas bort', !('groft' in a.ror.koder['32PE']));
  sjekk('strekninger som ikke er gyldige, tas bort', a.ror.groft.strekninger.length, 1, 0);
  const st = a.ror.groft.strekninger[0];
  paastand('strekningen klemmes og ryddes', st.mal.helning === 3 && !('tull' in st.mal) && st.fjell === 0.8 && st.egen === false,
    JSON.stringify(st));
  sjekk('par som ikke er par, tas bort', a.ror.groft.sammen.length, 1, 0);
  const Q = Prosjektform.klargjor({ navn: 'h', aktivt: 'r1', anlegg: [{ id: 'r1', type: 'ror', ror: { punkter: [] } }] });
  paastand('et gammelt røranlegg får grøftemal og tomme justeringer', Q.anlegg[0].mal.groft.helning === 1
    && Q.anlegg[0].ror.groft.strekninger.length === 0 && Q.anlegg[0].ror.groft.sammen.length === 0);
}

/* DEN EKTE FILA – bare når stien er gitt. Kundens data ligger ikke i repoet.
   Terrenget er det nærmeste målte punktet + 1,5 m: et rimelig terreng uten
   å hente noe fra Kartverket. */
if (process.env.ROR_FIL) {
  console.log('\n9. Den ekte fila (ROR_FIL)');
  const Ror = require(js('ror.js'));
  const les = Ror.lesLandXML(Ror.dekod(fs.readFileSync(process.env.ROR_FIL)));
  const ror = { punkter: les.punkter, koder: Ror.koderFra(les.punkter), retting: { av: [], brudd: [], koble: [] } };
  const bygg = Ror.byggLinjer(ror, Ror.StandardRormal, Ror.lagTilXY(32, 32));
  const botter = new Map();
  for (const p of les.punkter) {
    const kk = Math.floor(p.o / 10) + ',' + Math.floor(p.n / 10);
    if (!botter.has(kk)) botter.set(kk, []);
    botter.get(kk).push(p);
  }
  const terreng = (x, y) => {
    let best = null;
    const bx = Math.floor(x / 10), by = Math.floor(y / 10);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const p of botter.get((bx + i) + ',' + (by + j)) || []) {
          const d = Math.hypot(p.o - x, p.n - y);
          if (!best || d < best.d) best = { d, z: p.z };
        }
      }
    }
    return best ? best.z + 1.5 : NaN;
  };
  const t0 = Date.now();
  const r = Groft.beregn({ linjer: bygg.linjer, koder: ror.koder, terrengZ: terreng, rute: 0.2 });
  const ms = Date.now() - t0;
  console.log(`       ${bygg.linjer.length} rør · ${ms} ms · graving ${r.sum.gravingLos.toFixed(0)} m³ · `
    + `${r.sum.lengde.toFixed(0)} m grøft`);
  paastand('regnes på under 10 s', ms < 10000, ms + ' ms');
  const s = r.sum;
  paastand('tallene er tall', ['gravingLos', 'fundament', 'omfylling', 'gjenfylling', 'lengde'].every(k => Number.isFinite(s[k])));
  sjekk('graving = fyll + røret', s.gravingLos + s.sprengning, s.fundament + s.omfylling + s.gjenfylling + s.rorvolum, 1e-3);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
