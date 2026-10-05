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

/* ---------------- fargene ---------------- */

/* Fargene en kode kan få. Nøklene er navn på CSS-variabler (--ror-…), se
   app.css – stilarket er eneste sted en farge defineres, som for alt annet. */
const FARGER = {
  vann: 'Vann (blå)', spill: 'Spillvann (brun)', overvann: 'Overvann (turkis)',
  drens: 'Drens (oliven)', kabel: 'Kabelrør (lilla)', felles: 'Felles avløp (mørkebrun)',
  p1: 'Rødoransje', p2: 'Gul', p3: 'Rosa', p4: 'Lyseblå', p5: 'Lime', p6: 'Lys grå',
  punkt: 'Punkt (hvit)'
};
const _PALETT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

/**
 * Kodetabellen for et sett punkter: tolkningen pluss farge og «vis».
 *
 * Rør med kjent system får systemets farge – alt vann er blått. Rør uten
 * system får hver sin palettfarge i den rekkefølgen de dukker opp, så to
 * ukjente rør i samme grøft aldri får samme farge. Det som står i `finnes`,
 * er brukerens, og røres ikke.
 */
function koderFra(punkter, finnes) {
  const ut = Object.assign({}, finnes || {});
  const brukt = new Set(Object.values(ut).map(k => k && k.farge));
  let neste = 0;
  const ledig = () => {
    for (let i = 0; i < _PALETT.length; i++) {
      const f = _PALETT[(neste + i) % _PALETT.length];
      if (!brukt.has(f)) { neste = (neste + i + 1) % _PALETT.length; return f; }
    }
    return _PALETT[(neste++) % _PALETT.length];
  };
  for (const p of punkter || []) {
    if (ut[p.kode]) continue;
    const t = tolkKode(p.kode);
    const farge = t.form === 'punkt' ? 'punkt' : (t.system || ledig());
    brukt.add(farge);
    ut[p.kode] = Object.assign(t, { farge, vis: true });
  }
  return ut;
}

/* ---------------- anlegget ---------------- */

/* Innstillingene til et røranlegg. Etappe 2 utvider den med grøfta. */
const StandardRormal = { maksAvstand: 25 };

/** Dataene til et nytt røranlegg. Linjene lagres ikke – de regnes av dette. */
function nyRor() {
  return { sone: 32, kilder: [], punkter: [], koder: {}, retting: { av: [], brudd: [], koble: [] } };
}

/* ---------------- linjene ---------------- */

/** Vannrett avstand fra q til strekket a–b. */
function avstandTilStrekk(q, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

const _par = (a, b) => (a < b ? a + '\u0001' + b : b + '\u0001' + a);

/**
 * Rørene, trukket av punktene.
 *
 * Per kode: minste spenntre over alle par som ligger innenfor maks avstand.
 * Treet følger røret fordi naboene langs røret alltid er nærmere enn noe
 * annet med samme kode. Så deles det i polylinjer mellom knutene (grad ≠ 2).
 *
 * RETTINGENE:
 * - `av`: punktet er ikke med i noe.
 * - `koble`: kanten legges inn FØRST, også over maks avstand.
 * - `brudd`: kanten tas ut ETTER at treet er bygd. Tas den ut før, kobler
 *   treet bare rundt bruddet via nærmeste nabo – på et rør med 10 m mellom
 *   punktene er 90 → 110 bare 20 m, og streken flytter seg i stedet for å
 *   brytes. Tatt ut etterpå deler den treet, og det er det brukeren ba om.
 *
 * @param {{punkter, koder, retting}} ror
 * @param {{maksAvstand:number}} mal
 * @param {(p) => {x:number, y:number}} tilXY  punktet i arbeidssonen
 */
function byggLinjer(ror, mal, tilXY) {
  const maks = Math.max(1, (mal && mal.maksAvstand) || StandardRormal.maksAvstand);
  const retting = (ror && ror.retting) || {};
  const av = new Set(retting.av || []);
  const brudd = new Set((retting.brudd || []).map(([a, b]) => _par(a, b)));
  const koble = retting.koble || [];
  const perKode = new Map();
  const objekter = [];
  for (const p of (ror && ror.punkter) || []) {
    if (av.has(p.id)) continue;
    const k = (ror.koder && ror.koder[p.kode]) || tolkKode(p.kode);
    if (k.vis === false) continue;
    if (k.form !== 'linje') { objekter.push(p); continue; }
    if (!perKode.has(p.kode)) perKode.set(p.kode, []);
    perKode.get(p.kode).push(p);
  }
  const linjer = [], enslige = [];
  const bruddTraff = new Set(), koblingTraff = new Set();
  for (const [kode, pts] of perKode) {
    const n = pts.length;
    const xy = pts.map(tilXY);
    const plass = new Map(pts.map((p, i) => [p.id, i]));
    // kandidatene: alle par innen maks avstand, funnet i et rutenett så det ikke blir n²
    const ruter = new Map();
    xy.forEach((q, i) => {
      const k = Math.floor(q.x / maks) + ',' + Math.floor(q.y / maks);
      if (!ruter.has(k)) ruter.set(k, []);
      ruter.get(k).push(i);
    });
    const kanter = [];
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xy[i].x / maks), cy = Math.floor(xy[i].y / maks);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of ruter.get((cx + dx) + ',' + (cy + dy)) || []) {
            if (j <= i) continue;
            const d = Math.hypot(xy[i].x - xy[j].x, xy[i].y - xy[j].y);
            if (d <= maks) kanter.push([d, i, j]);
          }
        }
      }
    }
    // lik avstand avgjøres av rekkefølgen i fila – samme svar hver gang
    kanter.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const far = Array.from({ length: n }, (_, i) => i);
    const rotAv = x => { while (far[x] !== x) { far[x] = far[far[x]]; x = far[x]; } return x; };
    const nabo = Array.from({ length: n }, () => []);
    const knytt = (i, j) => {
      const a = rotAv(i), b = rotAv(j);
      if (a === b) return false;
      far[a] = b; nabo[i].push(j); nabo[j].push(i);
      return true;
    };
    for (const [a, b] of koble) {
      const i = plass.get(a), j = plass.get(b);
      if (i === undefined || j === undefined) continue;
      koblingTraff.add(_par(a, b));
      knytt(i, j);
    }
    for (const [, i, j] of kanter) knytt(i, j);
    for (let i = 0; i < n; i++) {
      nabo[i] = nabo[i].filter(j => {
        const p = _par(pts[i].id, pts[j].id);
        if (!brudd.has(p)) return true;
        bruddTraff.add(p);
        return false;
      });
    }
    const brukt = new Set();
    const kant = (i, j) => (i < j ? i + ',' + j : j + ',' + i);
    const gaa = (start, neste) => {
      const sti = [start, neste];
      brukt.add(kant(start, neste));
      let forrige = start, her = neste;
      while (nabo[her].length === 2) {
        const videre = nabo[her][0] === forrige ? nabo[her][1] : nabo[her][0];
        if (brukt.has(kant(her, videre))) break;
        brukt.add(kant(her, videre));
        sti.push(videre);
        forrige = her; her = videre;
      }
      return sti;
    };
    const stier = [];
    for (let i = 0; i < n; i++) {
      if (nabo[i].length === 0) { enslige.push(pts[i]); continue; }
      if (nabo[i].length === 2) continue;
      for (const j of nabo[i]) if (!brukt.has(kant(i, j))) stier.push(gaa(i, j));
    }
    for (let sti of stier) {
      // fra den enden som ble målt først – oftest den operatøren begynte i
      if (pts[sti[sti.length - 1]].nr < pts[sti[0]].nr) sti = sti.slice().reverse();
      const lp = sti.map(i => pts[i]), lxy = sti.map(i => xy[i]);
      let lengde = 0, lengde3d = 0;
      for (let k = 1; k < lp.length; k++) {
        const d = Math.hypot(lxy[k].x - lxy[k - 1].x, lxy[k].y - lxy[k - 1].y);
        lengde += d;
        lengde3d += Math.hypot(d, lp[k].z - lp[k - 1].z);
      }
      const minId = lp.reduce((m, p) => (p.id < m ? p.id : m), lp[0].id);
      linjer.push({ id: kode + ':' + minId, kode, punkter: lp, xy: lxy, lengde, lengde3d });
    }
  }
  linjer.sort((a, b) => (a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : b.lengde - a.lengde));
  return {
    linjer, enslige, objekter,
    bruddUtenTreff: (retting.brudd || []).filter(([a, b]) => !bruddTraff.has(_par(a, b))).length,
    koblingUtenTreff: koble.filter(([a, b]) => !koblingTraff.has(_par(a, b))).length
  };
}

const Ror = {
  lesLandXML, dekod, tolkKode, koderFra, byggLinjer, avstandTilStrekk,
  nyRor, StandardRormal, FARGER
};

if (typeof module !== 'undefined') module.exports = Ror;
