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
   rutenettet. `forskyv` flytter det sidelengs. */
function rett(id, kode, lengde, topp, x0 = 1000, y0 = 1000, vinkel = 0.3, forskyv = 0) {
  const ux = Math.cos(vinkel), uy = Math.sin(vinkel), nx = -uy, ny = ux;
  const pts = [];
  for (let s = 0; s <= lengde + 1e-9; s += 10) pts.push([x0 + ux * s + nx * forskyv, y0 + uy * s + ny * forskyv, topp]);
  return linje(id, kode, pts);
}

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
  const p = perMeter(L => Groft.beregn({ linjer: [rett('a', '160PE', L, TOPP)], koder: koder160, terrengZ: flatt,
    rute: 0.2, mal: { helning: 0 } }));
  sjekk('loddrette vegger: b · h', p.gravingLos, b * h, b * h * 0.02);
}
{
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, rute: 0.2,
    terrengZ: (x, y) => (x < 1030 ? TERRENG : NaN) });
  paastand('hull i terrenget telles som areal', r.manglerTerreng > 5, String(r.manglerTerreng));
}
{
  /* Bakkefaktoren, som for veg og tomt: lengdene ganges med den, flatene og
     volumene med kvadratet. Røret trekkes fra med sin virkelige lengde, så
     regnestykket går fortsatt opp. */
  const bf = 1.01;
  const lag = k => Groft.beregn({ linjer: [rett('a', '160PE', 100, TOPP)], koder: koder160, terrengZ: flatt, rute: 0.2,
    bakkefaktor: k });
  const u = lag(undefined), m = lag(bf);
  sjekk('bakkefaktoren: lengden ganges med den', m.sum.lengde, u.sum.lengde * bf, 1e-9);
  sjekk('og dybdeklassene', m.dybdeklasser[1].lengde, u.dybdeklasser[1].lengde * bf, 1e-9);
  sjekk('gravingen med kvadratet', m.sum.gravingLos, u.sum.gravingLos * bf * bf, 1e-6);
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
  const r = Groft.beregn({ linjer: [rett('a', '160PE', 100, 10.5), rett('u', 'UKJENT', 30, TOPP, 3000, 3000)],
    koder: { '160PE': { dim: 160 }, UKJENT: { dim: null } }, terrengZ: flatt, rute: 0.2 });
  paastand('over terrenget: merknad', r.merknader.some(m => m.type === 'over'));
  paastand('uten dimensjon: merknad med koden', r.merknader.some(m => m.type === 'dimensjon' && /UKJENT/.test(m.tekst)));
  sjekk('og lengden står i utenDimensjon', r.utenDimensjon[0].lengde, 30, 1e-9);
  paastand('fjellet: sier at alt er løsmasse', r.merknader.some(m => m.type === 'fjell' && /løsmasse/.test(m.tekst)));
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
