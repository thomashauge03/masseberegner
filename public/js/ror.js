'use strict';
/**
 * Rør fra maskinstyringen – innlesing, tolking og linjer.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global `Ror`
 * i nettleseren og med `require` i test/rorprove.js.
 *
 * HVORFOR LINJENE IKKE TREKKES I MÅLEREKKEFØLGE.
 * Fila fra Xsite har bare punkter. Operatøren måler fram og tilbake og hopper
 * mellom rørene i samme grøft, så rekkefølgen i fila sier lite om hvilke punkt
 * som henger sammen. Målt på den ekte fila: koblet i `surveyOrder` fikk
 * fiberrøret et hopp på 689 m, og fire korte stikkledninger gikk i sikksakk.
 * Trukket etter geometri – minste spenntre, høyst 25 m mellom to punkt – ble
 * hvert rør én ren linje, og svaret sto stille mellom 20 og 30 m.
 *
 * KOORDINATENE STÅR SOM I FILA.
 * Veg og tomt lagrer grader. Et as-built er dokumentasjon, og sonen skal kunne
 * rettes etter import uten tap – så her står nord og øst slik maskinen målte
 * dem, sammen med sonen de gjelder i.
 */

/* Hentes der den bor: global i nettleseren, modul i node. Se prosjektform.js. */
function _geo() {
  if (typeof Geo !== 'undefined') return Geo;
  return require('./geo.js');
}

/* ---------------- innlesing ---------------- */

const _ENTITETER = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML-entitetene i en attributtverdi, så «SP &amp; VA» blir «SP & VA». */
function _avkod(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (hele, e) => {
    if (e[0] === '#') {
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : hele;
    }
    const v = _ENTITETER[e.toLowerCase()];
    return v === undefined ? hele : v;
  });
}

/** Attributtene i en starttagg – i hvilken som helst rekkefølge, med begge slags fnutter. */
function _attributter(s) {
  const ut = {};
  for (const m of String(s).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    ut[m[1]] = _avkod(m[2] !== undefined ? m[2] : m[3]);
  }
  return ut;
}

/**
 * Fila som tekst, dekodet etter tegnsettet XML-hodet oppgir.
 *
 * `fil.text()` leser alltid UTF-8. Står det ISO-8859-1 i hodet – og det gjør
 * det i eldre eksporter – blir Ø i «RØR» til et erstatningstegn, og to koder
 * som var forskjellige blir like. Derfor bytes inn, og hodet bestemmer.
 */
function dekod(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const bom = u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF;
  const start = bom ? 3 : 0;
  let hode = '';
  for (let i = start; i < Math.min(u8.length, start + 200); i++) hode += String.fromCharCode(u8[i]);
  const m = /encoding\s*=\s*["']([\w.:-]+)["']/i.exec(hode);
  const etikett = bom || !m ? 'utf-8' : m[1].toLowerCase();
  try { return new TextDecoder(etikett).decode(u8.subarray(start)); }
  catch (e) { return new TextDecoder('utf-8').decode(u8.subarray(start)); }
}

/**
 * De innmålte punktene i en LandXML-fil.
 *
 * Regex, ikke DOMParser: node har ingen, og prøvene skal kunne kjøre den.
 * LandXML skriver et punkt som «nord øst høyde».
 *
 * Et punkt som ikke kan brukes, hoppes over og TELLES – dialogen viser
 * tallene. Et punkt som forsvant uten et ord, er det verste utfallet: rapporten
 * ser komplett ut, og hullet oppdages på plassen.
 */
function lesLandXML(tekst) {
  const s = String(tekst || '').replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<LandXML[\s>]/.test(s)) {
    throw new Error('Fila er ikke LandXML. Velg en .xml-eksport fra maskinstyringen.');
  }
  if (/<Imperial\b/.test(s)) throw new Error('Fila er i fot (Imperial). Bare meter støttes.');
  const enhet = /<Metric\b([^>]*)>/.exec(s);
  if (enhet) {
    const a = _attributter(enhet[1]);
    if (a.linearUnit && a.linearUnit !== 'meter') {
      throw new Error(`Fila er i «${a.linearUnit}». Bare meter støttes.`);
    }
  }
  const rot = /<LandXML\b([^>]*)>/.exec(s);
  const prog = /<Application\b([^>]*)>/.exec(s);
  const ks = /<CoordinateSystem\b([^>]*)>/.exec(s);
  const epsgTall = ks ? parseInt(_attributter(ks[1]).epsgCode, 10) : NaN;

  const advarsler = { utenHoyde: 0, ugyldige: 0, doble: 0, referanser: 0 };
  const punkter = [];
  const sett = new Set();
  const re = /<CgPoint\b([^>]*?)(\/>|>([^<]*)<\/CgPoint>)/g;
  let m;
  while ((m = re.exec(s))) {
    const a = _attributter(m[1]);
    if (m[2] === '/>' || a.pntRef) { advarsler.referanser++; continue; }
    const tall = (m[3] || '').trim().split(/\s+/).filter(Boolean).map(Number);
    if (tall.length < 2 || !Number.isFinite(tall[0]) || !Number.isFinite(tall[1])) {
      advarsler.ugyldige++; continue;
    }
    if (tall.length < 3 || !Number.isFinite(tall[2])) { advarsler.utenHoyde++; continue; }
    const [n, o, z] = tall;
    let kode = (a.code || '').trim();
    if (!kode && a.desc && a.desc !== 'undefined') kode = a.desc.trim();
    if (!kode) kode = 'UTEN KODE';
    const id = (a.name || '').trim() || `${kode}|${n.toFixed(3)}|${o.toFixed(3)}|${z.toFixed(3)}`;
    if (sett.has(id)) { advarsler.doble++; continue; }
    sett.add(id);
    const nr = parseInt(a.surveyOrder, 10);
    punkter.push({ id, kode, n, o, z, tid: a.timeStamp || '',
      nr: Number.isFinite(nr) ? nr : punkter.length + 1 });
  }
  if (!punkter.length) throw new Error('Fant ingen innmålte punkter i fila.');
  return {
    punkter,
    program: prog ? (_attributter(prog[1]).name || '') : '',
    dato: rot ? (_attributter(rot[1]).date || '') : '',
    epsg: Number.isFinite(epsgTall) ? epsgTall : null,
    advarsler
  };
}

/* ---------------- kodene ---------------- */

/* Ord som gjør en kode til et PUNKT – noe som står på røret, ikke røret selv. */
const _PUNKTORD = new Set(['MUFFE', 'ANBORING', 'ANNBORING', 'KUM', 'STAKEKUM', 'STAGEKUM',
  'SPYLEKUM', 'GREN', 'BEND', 'BØY', 'BOY', 'ENDE', 'ENDELOKK', 'PROPP', 'KRYSS',
  'OVERGANG', 'REDUKSJON', 'VENTIL', 'HYDRANT', 'SKJØT', 'SKJOT', 'PUNKT', 'PNT', 'PKT']);
const _SYSTEM = { SP: 'spill', VA: 'vann', VL: 'vann', OV: 'overvann', DR: 'drens', AF: 'felles' };
const _MATERIALER = ['PEH', 'PEL', 'PE', 'PP', 'PVC', 'GRP', 'BETONG', 'BET', 'DUKTIL', 'DUK', 'STÅL', 'STAL'];
const _KABELORD = new Set(['FIBER', 'KABEL', 'TREKKERØR', 'TREKKEROR', 'EL']);
const _DRENSORD = new Set(['DRENS', 'DREN']);

/**
 * Hva en kode fra operatøren betyr: linje eller punkt, dimensjon og system.
 *
 * Kodene er fritekst – «90PE», «180 PE», «SP 160PE», «110DRENS». Svaret er et
 * forslag: kodetabellen lar brukeren rette det, og det rettede vinner.
 */
function tolkKode(kode) {
  const ren = String(kode || '').toUpperCase().replace(/_/g, ' ')
    .replace(/(\d)([A-ZÆØÅ])/g, '$1 $2').replace(/([A-ZÆØÅ])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ').trim();
  const ord = ren ? ren.split(' ') : [];
  const har = w => ord.includes(w);
  const erPunkt = ord.some(w => _PUNKTORD.has(w));
  const dimOrd = ord.find(w => /^\d+$/.test(w) && +w >= 16 && +w <= 3000);
  const dim = dimOrd ? +dimOrd : null;
  const prefiks = ord.length > 1 && _SYSTEM[ord[0]] ? ord[0] : null;
  let system = prefiks ? _SYSTEM[prefiks] : '';
  if (!system && ord.some(w => _KABELORD.has(w))) system = 'kabel';
  if (!system && ord.some(w => _DRENSORD.has(w))) system = 'drens';
  const materiale = _MATERIALER.find(har) || (har('FIBER') ? 'FIBER' : '');
  const variant = ord.filter(w => w !== prefiks && w !== dimOrd && w !== materiale
    && !_PUNKTORD.has(w) && !_KABELORD.has(w) && !_DRENSORD.has(w)).join(' ');
  return { form: erPunkt || !dim ? 'punkt' : 'linje', dim, materiale, system, variant };
}

const Ror = { lesLandXML, dekod, tolkKode };

if (typeof module !== 'undefined') module.exports = Ror;
