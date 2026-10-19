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
 * dem, sammen med sonen de gjelder i. Unntaket: et anlegg har én sone, og en
 * fil i en annen sone som legges til, regnes om til den. Kilden noterer det
 * (`regnetOm`), og rapporten viser det.
 */

const Ror = (() => {
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
        // utenfor Unicode kaster fromCodePoint – og det avviste hele fila
        return Number.isFinite(n) && n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : hele;
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
    for (let i = start; i < Math.min(u8.length, start + 1000); i++) hode += String.fromCharCode(u8[i]);
    /* SOSI sier det i ..TEGNSETT. ISO8859-10 har Æ, Ø og Å på samme plass som
       ISO8859-1, og det er de bokstavene som teller her. */
    const sosi = /^\s*\.HODE\b/.test(hode) && /\.TEGNSETT\s+([\w-]+)/i.exec(hode);
    const m = sosi ? null : /encoding\s*=\s*["']([\w.:-]+)["']/i.exec(hode.slice(0, 200));
    const etikett = bom ? 'utf-8'
      : sosi ? (/^UTF-?8$/i.test(sosi[1]) ? 'utf-8' : /^(ISO8859-\d+|ANSI)$/i.test(sosi[1]) ? 'iso-8859-1' : 'utf-8')
      : m ? m[1].toLowerCase() : 'utf-8';
    /* SIER FILA INGENTING, OG ER DEN IKKE GYLDIG UTF-8, er den Windows-tegn.
       En KOF har ikke noe hode som oppgir tegnsettet, og mange program
       skriver den i Windows-1252: «avløp» ble «avl�p», og to koder som var
       like i maskinen, ble ulike her. */
    if (!bom && !sosi && !m) {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(start)); }
      catch (e) { return new TextDecoder('windows-1252').decode(u8.subarray(start)); }
    }
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
    const fraNavn = new Set();
    let app = '';
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
      /* Makin' Excavator skriver egenskapene i en <Feature> rett etter punktet:
         når det ble målt, og hvilket program. */
      const egen = _egenskaper(s, re.lastIndex);
      if (!app && egen.App) app = egen.App;
      const k = _kode(a.code, a.name);
      let kode = k.kode;
      if (!kode && a.desc && a.desc !== 'undefined') kode = a.desc.trim();
      if (!kode) kode = 'UTEN KODE';
      const id = (a.name || '').trim() || `${kode}|${n.toFixed(3)}|${o.toFixed(3)}|${z.toFixed(3)}`;
      if (sett.has(id)) { advarsler.doble++; continue; }
      sett.add(id);
      const nr = parseInt(a.surveyOrder, 10);
      const punkt = { id, kode, n, o, z, tid: a.timeStamp || egen.CreateTime || '',
        nr: Number.isFinite(nr) ? nr : punkter.length + 1 };
      punkter.push(punkt);
      if (k.fraNavn) fraNavn.add(punkt);
    }
    if (!punkter.length) throw new Error('Fant ingen innmålte punkter i fila.');
    _samkjor(punkter, fraNavn);
    return {
      punkter,
      program: app || (prog ? (_attributter(prog[1]).name || '') : ''),
      dato: _dato(rot ? (_attributter(rot[1]).date || '') : '', punkter),
      epsg: Number.isFinite(epsgTall) ? epsgTall : null,
      advarsler
    };
  }

  /** Egenskapene i <Feature>-en som hører til punktet som slutter ved `fra`. */
  function _egenskaper(s, fra) {
    const ut = {};
    const neste = s.indexOf('<CgPoint', fra);
    const slutt = s.indexOf('</CgPoints>', fra);
    const grense = Math.min(neste < 0 ? s.length : neste, slutt < 0 ? s.length : slutt);
    const bit = s.slice(fra, grense);
    if (!/<Feature\b/.test(bit)) return ut;
    for (const p of bit.matchAll(/<Property\b([^>]*)>/g)) {
      const a = _attributter(p[1]);
      if (a.label) ut[a.label] = a.value || '';
    }
    return ut;
  }

  /* Ord som står som kode når operatøren ikke har gitt en: objekttypen. */
  const _TYPEORD = new Set(['PUNKT', 'LINJEPUNKT', 'POINT']);

  /**
   * Koden til et punkt – også når den står i navnet.
   *
   * Makin' Excavator (Kinematic) har to måter. Velger operatøren en kode, står
   * den i `code`, og navnet er bare «P12 (0)». Skriver operatøren koden som
   * navn, står `code` som «Punkt», og navnet er «vann 63(2) (1)»: koden,
   * telleren maskinen legger på, og nummeret i parentes til slutt. Leses
   * «Punkt» som kode, blir alle rørene ett punktsett, og ingen linje trekkes.
   *
   * Koden fra navnet får små bokstaver og mellomrom mellom tall og bokstaver,
   * så «vann110» og «Vann 110» blir samme rør. En kode valgt fra lista står
   * som den står – den er skrevet likt hver gang.
   */
  function _kode(kode, navn) {
    const k = String(kode || '').trim();
    if (k && !_TYPEORD.has(k.toUpperCase())) return { kode: k, fraNavn: false };
    const fraNavn = _kodeFraNavn(navn);
    return fraNavn ? { kode: fraNavn, fraNavn: true } : { kode: k, fraNavn: false };
  }

  const _normKode = k => String(k).toLowerCase().replace(/(\d)([a-zæøå])/g, '$1 $2')
    .replace(/([a-zæøå])(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim();

  /**
   * En kode fra navnet som er en kode fra lista skrevet litt annerledes, får
   * listas skrivemåte: «tr40 (0)» med «Punkt» og «tr40» fra lista er samme rør.
   */
  function _samkjor(punkter, fraNavn) {
    const liste = new Map();
    for (const p of punkter) {
      if (fraNavn.has(p)) continue;
      const n = _normKode(p.kode);
      if (!liste.has(n)) liste.set(n, p.kode);
    }
    for (const p of fraNavn) { const k = liste.get(p.kode); if (k) p.kode = k; }
  }

  /**
   * «vann 63(2) (1)» → «vann 63». «P12 (0)» og «LP1 (L1 (0))» har ingen kode,
   * og «P1Endepunkt 160» er «endepunkt 160» – punktnummeret foran er maskinens.
   */
  function _kodeFraNavn(navn) {
    const raa = String(navn || '').trim();
    if (!raa || /^L?P\d+(?=[\s(]|$)/i.test(raa)) return '';
    let s = raa.replace(/^P\d+(?=[a-zæøå])/i, ''), forrige;
    do { forrige = s; s = s.replace(/\s*\(\d+\)\s*$/, ''); } while (s !== forrige);
    return _normKode(s);
  }

  /**
   * Datoen til en fil. Makin' Excavator skriver 2008-01-08 i rota av hver fil,
   * så en dato eldre enn det siste målte punktet kan ikke være eksportdatoen –
   * da står datoen til det siste punktet.
   */
  function _dato(oppgitt, punkter) {
    let siste = '';
    for (const p of punkter) {
      const d = /^\d{4}-\d{2}-\d{2}/.exec(p.tid || '');
      if (d && d[0] > siste) siste = d[0];
    }
    const o = /^\d{4}-\d{2}-\d{2}/.exec(oppgitt || '');
    if (siste && (!oppgitt || (o && o[0] < siste))) return siste;
    return oppgitt || '';
  }

  /* SOSI-koden for koordinatsystemet → EPSG, for sonene programmet kan. */
  const _KOORDSYS_EPSG = { 22: 25832, 23: 25833, 25: 25835 };

  /**
   * De innmålte punktene i en SOSI-fil – eksporten fra Makin' Excavator og
   * liknende.
   *
   * Bare .PUNKT leses. En .KURVE i en slik fil er en logglinje, og punktene på
   * den står også som egne .PUNKT. Det som ikke er punkt, telles.
   *
   * Koordinatene er heltall ganget med ..ENHET (oftest 0.001 – millimeter),
   * lagt til ..ORIGO-NØ. Koden står i ..OBJTYPE, eller i ..NAME når OBJTYPE
   * bare er «Punkt» – samme regel som for LandXML-fila.
   */
  function lesSOSI(tekst) {
    const s = String(tekst || '').replace(/^﻿/, '');
    if (!/^\s*\.HODE\b/.test(s)) throw new Error('Fila er ikke SOSI. Velg en .sos-eksport fra maskinstyringen.');
    const linjer = s.split(/\r?\n/).map(_utenKommentar);
    const grupper = [];
    for (const l of linjer) {
      const g = /^\.([A-ZÆØÅ-]+)\b\s*(.*)$/i.exec(l);
      if (g) grupper.push({ navn: g[1].toUpperCase(), linjer: [] });
      else if (grupper.length) grupper[grupper.length - 1].linjer.push(l);
    }
    const hode = grupper.find(g => g.navn === 'HODE');
    const verdi = (g, navn) => {
      const re = new RegExp('^\\.+' + navn + '(?:\\s+(.*))?$', 'i');
      for (const l of g.linjer) { const m = re.exec(l.trim()); if (m) return (m[1] || '').trim(); }
      return null;
    };
    const enhet = parseFloat(hode && verdi(hode, 'ENHET')) || 1;
    const enhetH = parseFloat(hode && verdi(hode, 'ENHET-H')) || enhet;
    const origo = String((hode && verdi(hode, 'ORIGO-NØ')) || '0 0').split(/\s+/).map(Number);
    const oN = Number.isFinite(origo[0]) ? origo[0] : 0, oO = Number.isFinite(origo[1]) ? origo[1] : 0;
    const ks = parseInt(hode && verdi(hode, 'KOORDSYS'), 10);

    const advarsler = { utenHoyde: 0, ugyldige: 0, doble: 0, referanser: 0, ikkePunkt: 0 };
    const punkter = [];
    const sett = new Set();
    const fraNavn = new Set();
    let app = '';
    for (const g of grupper) {
      if (g.navn === 'HODE' || g.navn === 'SLUTT') continue;
      if (g.navn !== 'PUNKT' && g.navn !== 'SYMBOL') { advarsler.ikkePunkt++; continue; }
      const felt = {};
      let koord = null, medHoyde = false;
      for (let i = 0; i < g.linjer.length; i++) {
        const m = /^\.\.([^\s.][^\s]*)\s*(.*)$/.exec(g.linjer[i].trim());
        if (!m) continue;
        const nokkel = m[1].toUpperCase();
        if (nokkel === 'NØH' || nokkel === 'NØ') {
          medHoyde = nokkel === 'NØH';
          let tall = m[2].trim();
          // tallene står på samme linje eller på linja under
          if (!tall && i + 1 < g.linjer.length && !/^\s*\./.test(g.linjer[i + 1])) tall = g.linjer[++i].trim();
          koord = tall.split(/\s+/).filter(Boolean).map(Number);
          continue;
        }
        if (!(nokkel in felt)) felt[nokkel] = _utenFnutter(m[2]);
      }
      if (!koord || koord.length < 2 || !Number.isFinite(koord[0]) || !Number.isFinite(koord[1])) {
        advarsler.ugyldige++; continue;
      }
      if (!medHoyde || koord.length < 3 || !Number.isFinite(koord[2])) { advarsler.utenHoyde++; continue; }
      /* Rundet til enheten: 6600000003 × 0.001 er 6600000.0030000005, og da
         var punktet «endret» mot det samme punktet fra XML-fila. */
      const n = _rund(oN + koord[0] * enhet, enhet), o = _rund(oO + koord[1] * enhet, enhet);
      const z = _rund(koord[2] * enhetH, enhetH);
      if (!app && felt.APP) app = felt.APP;
      const navn = felt.NAME || felt.NAVN || '';
      const k = _kode(felt.OBJTYPE, navn);
      const kode = k.kode || 'UTEN KODE';
      const id = navn.trim() || `${kode}|${n.toFixed(3)}|${o.toFixed(3)}|${z.toFixed(3)}`;
      if (sett.has(id)) { advarsler.doble++; continue; }
      sett.add(id);
      const tid = /^\d{4}-\d{2}-\d{2}/.test(felt.CREATETIME || '') ? felt.CREATETIME : '';
      const punkt = { id, kode, n, o, z, tid, nr: punkter.length + 1 };
      punkter.push(punkt);
      if (k.fraNavn) fraNavn.add(punkt);
    }
    if (!punkter.length) throw new Error('Fant ingen innmålte punkter i fila.');
    _samkjor(punkter, fraNavn);
    const dato = hode ? _sosiDato(verdi(hode, 'DATO')) : '';
    const prog = hode && hode.linjer.findIndex(l => /^\.+APPLICATION\b/i.test(l.trim()));
    let program = app;
    if (!program && prog >= 0) {
      const navn = /^\.+Navn\s+(.*)$/i.exec((hode.linjer[prog + 1] || '').trim());
      if (navn) program = _utenFnutter(navn[1]);
    }
    return {
      punkter, program: program || '',
      dato: _dato(dato, punkter),
      epsg: _KOORDSYS_EPSG[ks] || null,
      advarsler
    };
  }

  /** Tallet rundet til så mange desimaler som enheten har (0.001 → 3). */
  function _rund(v, enhet) {
    const des = Math.min(6, Math.max(0, Math.round(-Math.log10(enhet))));
    return +v.toFixed(des);
  }

  /** En SOSI-linje uten kommentaren: alt etter en «!» som ikke står i fnutter. */
  function _utenKommentar(l) {
    let i = 0, fnutt = '';
    for (; i < l.length; i++) {
      const c = l[i];
      if (fnutt) { if (c === fnutt) fnutt = ''; continue; }
      if (c === '"' || c === "'") fnutt = c;
      else if (c === '!') return l.slice(0, i);
    }
    return l;
  }

  function _utenFnutter(v) {
    const t = String(v || '').trim();
    const m = /^"([^"]*)"$|^'([^']*)'$/.exec(t);
    return m ? (m[1] !== undefined ? m[1] : m[2]) : t;
  }

  /* ..DATO er ÅÅÅÅMMDD i standarden. Står den på en annen måte, er den ikke
     til å stole på (Makin' Excavator skriver «10/12/2026», og om det er
     måned eller dag først, sier fila ikke) – da avgjør punktene. */
  function _sosiDato(v) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v || '').trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }

  /* Hentes der den bor, som Geo: KOF-posten leses likt for traseer og rør. */
  function _traseImport() {
    if (typeof TraseImport !== 'undefined') return TraseImport;
    return require('./traseimport.js');
  }

  /**
   * De innmålte punktene i en KOF-fil – eksporten fra VisualMachine og
   * liknende: én 05-post per punkt, med navn, kode, nord, øst og høyde.
   *
   * ID-EN ER NAVNET OG STEDET, IKKE BARE NAVNET. VisualMachine begynner på
   * nytt for hver fil: «P1» er et vannrør i den ene og en anboring tjue meter
   * unna i den neste. Med navnet alene ville den andre fila skrevet over den
   * første, punkt for punkt, uten et ord. Samme fil lest to ganger gir
   * fortsatt de samme id-ene, så den kjennes igjen.
   *
   * Sonen står i 01-posten når den står noe sted; datoen i en «Created:»-linje
   * i kommentarene.
   */
  function lesKOF(tekst) {
    const s = String(tekst || '').replace(/^﻿/, '');
    const T = _traseImport();
    const advarsler = { utenHoyde: 0, ugyldige: 0, doble: 0, referanser: 0 };
    const punkter = [];
    const sett = new Set();
    let sone = null, dato = '';
    for (const rad of s.split(/\r?\n/)) {
      const t = rad.trim();
      if (!t) continue;
      if (t[0] === '-') {
        const d = /Created:\s*(\d{4}-\d{2}-\d{2})/i.exec(t);
        if (d && !dato) dato = d[1];
        continue;
      }
      if (/^01\b/.test(t)) {
        const m = /\b\d{8}\s+\d+\s+(\d+)\b/.exec(t);
        if (m && T.KSYS[+m[1]]) sone = T.KSYS[+m[1]];
        continue;
      }
      if (!/^05\b/.test(t)) continue;
      const p = T.kofPunkt(rad);
      if (!p || !Number.isFinite(p.n) || !Number.isFinite(p.o)) { advarsler.ugyldige++; continue; }
      if (!Number.isFinite(p.z)) { advarsler.utenHoyde++; continue; }
      const kode = (p.kode || '').trim() || 'UTEN KODE';
      const sted = `${p.n.toFixed(3)}|${p.o.toFixed(3)}|${p.z.toFixed(3)}`;
      const id = (p.navn ? p.navn + '@' : kode + '|') + sted;
      if (sett.has(id)) { advarsler.doble++; continue; }
      sett.add(id);
      punkter.push({ id, kode, n: p.n, o: p.o, z: p.z, tid: '', nr: punkter.length + 1 });
    }
    if (!punkter.length) throw new Error('Fant ingen innmålte punkter i fila.');
    const epsg = { 32: 25832, 33: 25833, 35: 25835 }[sone] || null;
    return { punkter, program: '', dato, epsg, advarsler };
  }

  /** Er dette en KOF med punkt? En 05-post med tall bakerst er nok. */
  function _erKof(s) {
    return /^[ \t]?05[ \t]+\S.*\d[ \t]*$/m.test(s) && !/<\w/.test(s.slice(0, 200));
  }

  /** Fila, hvilken av de tre den er: SOSI om den begynner med .HODE, LandXML, eller KOF. */
  function lesFil(tekst) {
    const s = String(tekst || '').replace(/^﻿/, '');
    if (/^\s*\.HODE\b/.test(s)) return lesSOSI(s);
    if (/<LandXML[\s>]/.test(s)) return lesLandXML(s);
    if (_erKof(s)) return lesKOF(s);
    throw new Error('Fila er verken LandXML, SOSI eller KOF. Velg en .xml-, .sos- eller .kof-eksport fra maskinstyringen.');
  }

  /* ---------------- kodene ---------------- */

  /* Ord som gjør en kode til et PUNKT – noe som står på røret, ikke røret selv. */
  const _PUNKTORD = new Set(['MUFFE', 'ANBORING', 'ANNBORING', 'KUM', 'STAKEKUM', 'STAGEKUM',
    'SPYLEKUM', 'GREN', 'BEND', 'BØY', 'BOY', 'ENDE', 'ENDELOKK', 'PROPP', 'KRYSS',
    'OVERGANG', 'REDUKSJON', 'VENTIL', 'HYDRANT', 'SKJØT', 'SKJOT', 'PUNKT', 'PNT', 'PKT']);
  /* Sammensatte ord og skrivemåter fra maskinene: «sveisemuffe», «el muffe»,
     «andborring», «sveisskjøt». */
  const _PUNKTENDING = /(MUFFE|SKJØT|SKJOT|SKJØYT|BORING|BORRING)$/;
  const _erPunktord = w => _PUNKTORD.has(w) || _PUNKTENDING.test(w)
    || w === 'GRENRØR' || w === 'GRENROR' || w === 'ENDEPUNKT';
  const _SYSTEM = { SP: 'spill', VA: 'vann', VL: 'vann', OV: 'overvann', DR: 'drens', AF: 'felles', TR: 'kabel' };
  /* Systemet skrevet ut, hvor som helst i koden – «160 kloakk», «vann 110». */
  const _SYSTEMORD = { VANN: 'vann', VANNLEDNING: 'vann', VANNRØR: 'vann', VANNROR: 'vann', VANNL: 'vann', VANL: 'vann',
    SPILLVANN: 'spill', SPILVANN: 'spill', KLOAKK: 'spill', AVLØP: 'spill', AVLOP: 'spill', OVERVANN: 'overvann' };
  const _MATERIALER = ['PEH', 'PEL', 'PE', 'PP', 'PVC', 'GRP', 'BETONG', 'BET', 'DUKTIL', 'DUK', 'STÅL', 'STAL'];
  const _KABELORD = new Set(['FIBER', 'KABEL', 'TREKKERØR', 'TREKKEROR', 'EL']);
  const _DRENSORD = new Set(['DRENS', 'DREN']);
  /* Et tall foran disse er en vinkel, ikke en dimensjon: «45 grader bend 110 vann». */
  const _VINKELORD = new Set(['GRADER', 'GRAD', '°']);

  /**
   * Hva en kode fra operatøren betyr: linje eller punkt, dimensjon og system.
   *
   * Kodene er fritekst – «90PE», «180 PE», «SP 160PE», «110DRENS», «vann 63».
   * Svaret er et forslag: kodetabellen lar brukeren rette det, og det rettede
   * vinner.
   *
   * Systemet: forkortelsen først i koden, så systemet skrevet ut, så kabel og
   * drens. Skrevet ut går foran kabel fordi «el muffe 110 vann» er en
   * elektromuffe på vannrøret, ikke en kabel.
   *
   * Et rør med kjent system er en linje også uten dimensjon – «kabel gatelys»
   * og «avlop» er traseer, ikke punkt. Dimensjonen rettes i kodetabellen.
   */
  function tolkKode(kode) {
    const ren = String(kode || '').toUpperCase().replace(/_/g, ' ')
      .replace(/(\d)([A-ZÆØÅ])/g, '$1 $2').replace(/([A-ZÆØÅ])(\d)/g, '$1 $2')
      .replace(/\s+/g, ' ').trim();
    const ord = ren ? ren.split(' ') : [];
    const har = w => ord.includes(w);
    const erPunkt = ord.some(_erPunktord);
    const dimPlass = ord.findIndex((w, i) => /^\d+$/.test(w) && +w >= 16 && +w <= 3000
      && !_VINKELORD.has(ord[i + 1]));
    const dimOrd = dimPlass >= 0 ? ord[dimPlass] : undefined;
    const dim = dimOrd ? +dimOrd : null;
    const prefiks = ord.length > 1 && _SYSTEM[ord[0]] ? ord[0] : null;
    let system = prefiks ? _SYSTEM[prefiks] : '';
    const utskrevet = ord.find(w => _SYSTEMORD[w]);
    if (!system && utskrevet) system = _SYSTEMORD[utskrevet];
    if (!system && ord.some(w => _KABELORD.has(w))) system = 'kabel';
    if (!system && ord.some(w => _DRENSORD.has(w))) system = 'drens';
    const materiale = _MATERIALER.find(har) || (har('FIBER') ? 'FIBER' : '');
    const variant = ord.filter((w, i) => w !== prefiks && i !== dimPlass && w !== materiale && w !== 'MM'
      && !_erPunktord(w) && !_KABELORD.has(w) && !_DRENSORD.has(w) && !_SYSTEMORD[w]).join(' ');
    const linje = !erPunkt && (dim || system);
    return { form: linje ? 'linje' : 'punkt', dim, materiale, system, variant };
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
      // en kode brukeren har slått sammen med en annen, trekkes som den andre – se `forslagSammen`
      const kode = kanonisk(ror, p.kode);
      const k = (ror.koder && (ror.koder[kode] || ror.koder[p.kode])) || tolkKode(kode);
      if (k.vis === false) continue;
      if (k.form !== 'linje') { objekter.push(p); continue; }
      if (!perKode.has(kode)) perKode.set(kode, []);
      perKode.get(kode).push(p);
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
        /* Id-en er de to endene. Treet har ingen ringer, så to rør med samme
           kode kan ikke dele begge endene – men de kan dele ett punkt: i en
           gren er knuten med i tre rør. Minste punkt-id var ofte knuten, og da
           fikk tre rør samme id og samme profil. Sortert, så retningen ikke
           spiller inn. */
        const ender = [lp[0].id, lp[lp.length - 1].id].sort();
        linjer.push({ id: kode + ':' + ender.join('~'), kode, punkter: lp, xy: lxy, lengde, lengde3d });
      }
    }
    linjer.sort((a, b) => (a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : b.lengde - a.lengde));
    return {
      linjer, enslige, objekter,
      bruddUtenTreff: (retting.brudd || []).filter(([a, b]) => !bruddTraff.has(_par(a, b))).length,
      koblingUtenTreff: koble.filter(([a, b]) => !koblingTraff.has(_par(a, b))).length
    };
  }

  /* ---------------- samme rør, ulike koder ---------------- */

  /*
   * HVORFOR. Et rør målt av tre maskiner over tre måneder får tre, fire, sju
   * koder: «SP 160PE» fra Xsite, «avlop160» fra KOF-en, «sp 160» og «spilvann
   * 160» fra gravemaskinen. Linjene trekkes bare mellom punkt med samme kode,
   * så røret stopper der koden skifter – det ser ut som hull, men er målt.
   *
   * PÅ KNAPP, IKKE AUTOMATISK. Programmet foreslår, med grunnen, og brukeren
   * slår sammen eller sier nei. To koder kan se like ut og likevel være to rør.
   * Sammenslåingen er et oppslag (`ror.alias`): punktene og kodene deres røres
   * ikke, og den kan skilles igjen.
   */

  /** Koden en kode tegnes som etter brukerens sammenslåinger. Kjeder følges, ringer stoppes. */
  function kanonisk(ror, kode) {
    const alias = ror && ror.alias;
    if (!alias) return kode;
    let k = kode;
    const sett = new Set([k]);
    while (Object.prototype.hasOwnProperty.call(alias, k) && !sett.has(alias[k])) { k = alias[k]; sett.add(k); }
    return k;
  }

  /**
   * «Spilvann 160» → «SPILVANN160»; ordene sortert, så «160 spillvann» og
   * «spillvann 160» er like. Materialet og «mm» telles ikke: «sp 160» og
   * «SP 160PE» er samme rør skrevet av to maskiner.
   */
  function _skrevet(kode) {
    const ord = String(kode || '').toUpperCase().replace(/[_\-.,/]/g, ' ')
      .replace(/(\d)([A-ZÆØÅ])/g, '$1 $2').replace(/([A-ZÆØÅ])(\d)/g, '$1 $2')
      .split(/\s+/).filter(w => w && w !== 'MM' && !_MATERIALER.includes(w));
    return { samlet: ord.join(''), sortert: ord.slice().sort().join(' ') };
  }

  /** Antall tegn som må byttes, settes inn eller tas bort (Levenshtein). */
  function _avstandTekst(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let forrige = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const na = [i];
      for (let j = 1; j <= n; j++) {
        na[j] = Math.min(forrige[j] + 1, na[j - 1] + 1, forrige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      forrige = na;
    }
    return forrige[n];
  }

  /**
   * Kan to koder være samme rør? Systemet og dimensjonen må ikke si imot
   * hverandre, og de må ha minst én av dem felles. «vann 110» og «vann 160»
   * er skrevet nesten likt, men er to rør.
   */
  function _forenlig(ta, tb) {
    if (ta.system && tb.system && ta.system !== tb.system) return false;
    if (ta.dim && tb.dim && ta.dim !== tb.dim) return false;
    return !!((ta.system && ta.system === tb.system) || (ta.dim && ta.dim === tb.dim));
  }

  /**
   * Forslag om koder som trolig er samme rør, med grunnen.
   *
   * Tre grunner, og systemet og dimensjonen må passe for alle:
   *   · navnene er nesten like – samme ord i annen rekkefølge, eller høyst to
   *     tegn forskjell («vanl 110», «vannl 110», «vann 110»)
   *   · endene møtes – en ende av det ene røret ligger innen 5 m av en ende
   *     av det andre, så det ene fortsetter der det andre slutter
   *   · de ligger oppå hverandre – minst to punkt av det ene ligger innen 1 m
   *     av det andre: samme rør målt to ganger
   *
   * Til (`til`) er koden med flest punkt; den andre tegnes som den. Et par
   * brukeren har sagt nei til (`ror.ikkeSamme`), foreslås ikke igjen.
   */
  function forslagSammen(ror, tilXY, maks) {
    const nei = new Set((ror && ror.ikkeSamme) || []);
    const bygg = byggLinjer(ror, { maksAvstand: maks || StandardRormal.maksAvstand }, tilXY);
    const perKode = new Map();
    const hent = k => {
      if (!perKode.has(k)) perKode.set(k, { linjer: [], ender: [], punkter: [] });
      return perKode.get(k);
    };
    for (const l of bygg.linjer) {
      const h = hent(l.kode);
      h.linjer.push(l);
      h.ender.push(l.xy[0], l.xy[l.xy.length - 1]);
      h.punkter.push(...l.xy);
    }
    for (const p of bygg.enslige) {
      const q = tilXY(p), h = hent(kanonisk(ror, p.kode));
      h.ender.push(q); h.punkter.push(q);
    }
    const tolk = k => (ror.koder && ror.koder[k]) || tolkKode(k);
    const koder = [...perKode.keys()].sort();
    const ut = [];
    for (let i = 0; i < koder.length; i++) {
      for (let j = i + 1; j < koder.length; j++) {
        const a = koder[i], b = koder[j];
        if (nei.has(_par(a, b))) continue;
        const ta = tolk(a), tb = tolk(b);
        if (ta.form !== 'linje' || tb.form !== 'linje' || !_forenlig(ta, tb)) continue;
        const grunner = [];
        const sa = _skrevet(a), sb = _skrevet(b);
        let navn = false;
        if (sa.samlet === sb.samlet) { grunner.push('samme navn, skrevet litt ulikt'); navn = true; }
        else if (sa.sortert === sb.sortert) { grunner.push('samme ord i annen rekkefølge'); navn = true; }
        /* Seks tegn eller mer: «sk 160» og «sp 160» er én bokstav fra hverandre,
           men to forkortelser – ikke en skrivefeil. */
        else if (Math.min(sa.samlet.length, sb.samlet.length) >= 6 && _avstandTekst(sa.samlet, sb.samlet) <= 2) {
          grunner.push('navnene er nesten like'); navn = true;
        }
        const A = perKode.get(a), B = perKode.get(b);
        let ende = Infinity;
        for (const p of A.ender) for (const q of B.ender) ende = Math.min(ende, Math.hypot(p.x - q.x, p.y - q.y));
        if (ende <= 5) grunner.push(`endene møtes ${String(Math.round(ende * 10) / 10).replace('.', ',')} m fra hverandre`);
        const oppaa = (P, Q) => {
          let n = 0;
          for (const p of P.punkter) {
            for (const l of Q.linjer) {
              let naer = false;
              for (let k = 1; k < l.xy.length && !naer; k++) naer = avstandTilStrekk(p, l.xy[k - 1], l.xy[k]) <= 1;
              if (naer) { n++; break; }
            }
          }
          return n;
        };
        /* En stikkledning begynner PÅ hovedledningen, så de første punktene
           ligger alltid tett inntil den. Oppå hverandre er derfor en stor del
           av røret – minst tre punkt og to femdeler – ikke bare enden. */
        const dekker = (P, Q) => { const n = oppaa(P, Q); return n >= 3 && n >= 0.4 * P.punkter.length; };
        if (dekker(A, B) || dekker(B, A)) grunner.push('de ligger oppå hverandre – trolig samme rør målt to ganger');
        if (!grunner.length) continue;
        const na = A.punkter.length, nb = B.punkter.length;
        const [fra, til] = na > nb || (na === nb && a < b) ? [b, a] : [a, b];
        ut.push({ fra, til, grunner, navn, ende, antall: { [a]: na, [b]: nb } });
      }
    }
    // navnelikhet først – den er sikrest – så de nærmeste endene
    return ut.sort((x, y) => (y.navn - x.navn) || (x.ende - y.ende));
  }

  /**
   * Slår `fra` sammen med `til`: punktene med `fra` tegnes heretter som `til`.
   *
   * Det er GRUPPENE som slås sammen, ikke bare de to kodene. Svarer man ja på
   * både «vannl 110 → vann 110» og «vannl 110 → vanl 110», skal alle tre bli
   * ett rør – med bare koden flyttet ville det andre svaret tatt «vannl 110»
   * ut av den første gruppa igjen.
   */
  function slaaSammenKoder(ror, fra, til) {
    if (!fra || !til) return false;
    const a = kanonisk(ror, fra), b = kanonisk(ror, til);
    if (a === b) return false;
    ror.alias = Object.assign({}, ror.alias || {}, { [a]: b });
    return true;
  }

  /** Skiller en kode fra det den var slått sammen med. */
  function skillKode(ror, kode) {
    if (!ror.alias || !Object.prototype.hasOwnProperty.call(ror.alias, kode)) return false;
    const ny = Object.assign({}, ror.alias);
    delete ny[kode];
    ror.alias = ny;
    return true;
  }

  /** «Nei, de er ikke samme rør» – huskes, så forslaget ikke kommer igjen. */
  function ikkeSamme(ror, a, b) {
    const p = _par(a, b);
    const liste = (ror.ikkeSamme || []).filter(x => x !== p);
    liste.push(p);
    ror.ikkeSamme = liste;
  }

  /* ---------------- koordinater ---------------- */

  /**
   * Punktet fra fila som x/y i den sonen programmet regner i.
   *
   * Er sonene like, røres ikke tallene – det er det vanlige, og da finnes det
   * ingen omregning å tape noe på. Er de ulike, går veien om grader; avviket er
   * under 0,01 mm.
   */
  function lagTilXY(fraSone, tilSone) {
    if (fraSone === tilSone) return p => ({ x: p.o, y: p.n });
    const G = _geo();
    return p => {
      const ll = G.fraUtm(p.o, p.n, fraSone);
      const u = G.tilUtm(ll.lat, ll.lon, tilSone);
      return { x: u.x, y: u.y };
    };
  }

  /** [lat, lon] – rekkefølgen Leaflet vil ha. */
  function tilLatLon(p, sone) {
    const ll = _geo().fraUtm(p.o, p.n, sone);
    return [ll.lat, ll.lon];
  }

  /** Ligger punktet der UTM-tall i Norge ligger? Romslig: fra Lindesnes til Svalbard, sone 32–35. */
  function erUtm(p) {
    return p.n > 6.3e6 && p.n < 8.0e6 && p.o > -2e5 && p.o < 1.3e6;
  }

  /**
   * Ser tallene ut som UTM i Norge?
   *
   * En fil i NTM har nordverdier rundt 1,2 millioner. Lest som UTM havner den i
   * havet utenfor Afrika, og ingenting i kartet ville forklart hvorfor rørene
   * er borte. Det skal stoppes ved døra med en forklaring.
   *
   * Men ett og ett punkt med feil tall – en måling uten fix som ble skrevet som
   * 0 0 0 – stoppet hele fila, hundrevis av gode punkt for ett dårlig. Det
   * hoppes nå over og telles, som de andre feilene i fila. Er det halvparten
   * eller mer, er det fila som er i et annet system.
   *
   * @returns {{punkter: Array, utenfor: number, melding: ?string}}
   */
  function sjekkKoordinater(punkter) {
    const alle = punkter || [];
    const gode = alle.filter(erUtm);
    const utenfor = alle.length - gode.length;
    if (!utenfor) return { punkter: alle, utenfor, melding: null };
    if (gode.length > utenfor) return { punkter: gode, utenfor, melding: null };
    const forste = alle.find(p => !erUtm(p));
    const nord = Math.round(forste.n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return {
      punkter: gode, utenfor,
      melding: `${utenfor} av ${alle.length} punkt har koordinater som ikke ser ut som UTM i Norge `
        + `(nord ${nord}). Er fila i NTM eller et lokalt system? Det støttes ikke ennå – `
        + 'eksporter i EUREF89 UTM fra maskinstyringen.'
    };
  }

  const _EPSG_SONE = { 25832: 32, 25833: 33, 25835: 35, 5972: 32, 5973: 33, 5975: 35,
    32632: 32, 32633: 33, 32635: 35 };

  /**
   * Hvilken UTM-sone fila er i.
   *
   * Fila fra Xsite sier det ikke. Tallene alene kan ikke avgjøre det heller: en
   * østverdi på 411 000 er gyldig i alle sonene, bare et annet sted. Rekkefølgen
   * er derfor (1) det fila selv oppgir, (2) sonen som legger punktene nærmest
   * de andre anleggene i prosjektet, (3) 32 – vanligst sør i landet. Dialogen
   * viser svaret og grunnen, og kartet viser hvor rørene havnet.
   */
  function gjettSone(punkter, epsg, naboer) {
    if (epsg && _EPSG_SONE[epsg]) return { sone: _EPSG_SONE[epsg], grunn: 'fila' };
    if (naboer && naboer.length && punkter && punkter.length) {
      const G = _geo();
      let sn = 0, so = 0;
      for (const p of punkter) { sn += p.n; so += p.o; }
      const n = sn / punkter.length, o = so / punkter.length;
      let best = null;
      for (const sone of [32, 33, 35]) {
        const ll = G.fraUtm(o, n, sone);
        for (const q of naboer) {
          const dy = (ll.lat - q.lat) * 111.2;
          const dx = (ll.lon - q.lon) * 111.2 * Math.cos(ll.lat * Math.PI / 180);
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { sone, d };
        }
      }
      if (best && best.d < 100) return { sone: best.sone, grunn: 'prosjektet' };
    }
    return { sone: 32, grunn: 'standard' };
  }

  /* ---------------- ny import ---------------- */

  /**
   * Slår en ny fil sammen med det anlegget har.
   *
   * Xsite eksporterer alt som er målt på prosjektet hver gang, så den neste fila
   * inneholder den forrige. Punktene kjennes igjen på id-en: nye legges til,
   * kjente får de nye tallene, og INGENTING slettes stille. Er et punkt slettet
   * i Xsite, slår man det av her – et punkt som bare forsvant, er det verste
   * utfallet.
   */
  function slaSammen(gamle, nye) {
    const ut = new Map((gamle || []).map(p => [p.id, p]));
    let antallNye = 0, kjente = 0, endret = 0;
    for (const p of nye || []) {
      const g = ut.get(p.id);
      if (!g) { ut.set(p.id, Object.assign({}, p)); antallNye++; continue; }
      kjente++;
      if (g.n !== p.n || g.o !== p.o || g.z !== p.z || g.kode !== p.kode) {
        ut.set(p.id, Object.assign({}, g, p));
        endret++;
      }
    }
    return { punkter: [...ut.values()], nye: antallNye, kjente, endret };
  }

  /**
   * Bytter hele punktsettet mot et nytt (henting fra Makin): i motsetning til
   * `slaSammen` forsvinner punkt som ikke er med i det nye. Funksjonen er ren –
   * `ror` endres ikke. Den regner ut hva som er nytt, borte og endret (samme id,
   * men annen n/o/z/kode), og hvor mange rettinger som peker på punkt som ikke
   * finnes i det nye settet: hver id i `retting.av`, og hvert par i
   * `retting.brudd` og `retting.koble` der en av id-ene mangler. `rensRetting`
   * fjerner nettopp dem.
   */
  function byttPunkter(ror, nye) {
    const gamle = new Map(((ror && ror.punkter) || []).map(p => [p.id, p]));
    const finnes = new Set((nye || []).map(p => p.id));
    let antallNye = 0, endret = 0;
    for (const p of nye || []) {
      const g = gamle.get(p.id);
      if (!g) antallNye++;
      else if (g.n !== p.n || g.o !== p.o || g.z !== p.z || g.kode !== p.kode) endret++;
    }
    let borte = 0;
    for (const id of gamle.keys()) if (!finnes.has(id)) borte++;
    const r = (ror && ror.retting) || {};
    const rettingerBorte = (r.av || []).filter(id => !finnes.has(id)).length
      + (r.brudd || []).filter(par => !par.every(id => finnes.has(id))).length
      + (r.koble || []).filter(par => !par.every(id => finnes.has(id))).length;
    return { punkter: (nye || []).map(p => Object.assign({}, p)), nye: antallNye, borte, endret, rettingerBorte };
  }

  /**
   * Fjerner rettingene som peker på id-er utenfor `ider` (id-ene i det nye
   * punktsettet) – nettopp de `byttPunkter` talte. `alias`, `ikkeSamme`, `koder`
   * og `groft` røres ikke.
   */
  function rensRetting(ror, ider) {
    const r = ror && ror.retting;
    if (!r) return;
    if (r.av) r.av = r.av.filter(id => ider.has(id));
    if (r.brudd) r.brudd = r.brudd.filter(par => par.every(id => ider.has(id)));
    if (r.koble) r.koble = r.koble.filter(par => par.every(id => ider.has(id)));
  }

  /**
   * Flere filer som én import – samme form som `lesFil` gir, pluss `kilder`
   * (én per fil) og `iFlere` (punkt som sto i mer enn én fil).
   *
   * Eldste fil først, så den nyeste vinner for et punkt som står i flere: det
   * er samme regel som når filene legges til én og én. Et punkt kjennes igjen
   * på navnet, som ellers.
   *
   * Sonen: oppgir en fil sin, gjelder den for alle; en fil som oppgir en annen,
   * regnes om dit, og kilden noterer det. Filer uten sone får den som velges i
   * dialogen.
   *
   * @param {Array<{les, filnavn}>} filer  `les` fra `lesFil`
   */
  function slaSammenFiler(filer) {
    const sortert = filer.map((f, i) => ({ f, i }))
      .sort((a, b) => ((a.f.les.dato || '') < (b.f.les.dato || '') ? -1
        : (a.f.les.dato || '') > (b.f.les.dato || '') ? 1 : a.i - b.i))
      .map(x => x.f);
    const medSone = sortert.find(f => _EPSG_SONE[f.les.epsg]);
    const sone = medSone ? _EPSG_SONE[medSone.les.epsg] : null;
    let punkter = [], iFlere = 0;
    const advarsler = {}, kilder = [], program = [];
    let dato = '';
    for (const f of sortert) {
      const fs = _EPSG_SONE[f.les.epsg];
      let pts = f.les.punkter;
      const kilde = { fil: f.filnavn, program: f.les.program, dato: f.les.dato, antall: pts.length };
      if (sone && fs && fs !== sone) {
        const t = lagTilXY(fs, sone);
        pts = pts.map(p => { const q = t(p); return Object.assign({}, p, { o: +q.x.toFixed(3), n: +q.y.toFixed(3) }); });
        kilde.regnetOm = { fra: fs, til: sone };
      }
      const sam = slaSammen(punkter, pts);
      punkter = sam.punkter;
      iFlere += sam.kjente;
      for (const [k, v] of Object.entries(f.les.advarsler || {})) advarsler[k] = (advarsler[k] || 0) + v;
      if (f.les.program && !program.includes(f.les.program)) program.push(f.les.program);
      if ((f.les.dato || '') > dato) dato = f.les.dato;
      kilder.push(kilde);
    }
    return { punkter, program: program.join(' + '), dato, epsg: medSone ? medSone.les.epsg : null,
      advarsler, kilder, iFlere };
  }

  /** En dimensjon i mm, eller null: over 0 og høyst 3 000, som tall eller tekst. */
  function dimensjon(v) {
    const d = typeof v === 'string' ? parseFloat(v) : v;
    return typeof d === 'number' && Number.isFinite(d) && d > 0 && d <= 3000 ? d : null;
  }

  /** En kilde som én linje: fil · program · dato · antall – og omregningen, om den ble gjort. */
  function kildetekst(k) {
    return [k.fil, k.program, k.dato, `${k.antall} punkt`,
      k.regnetOm && `regnet om fra UTM ${k.regnetOm.fra} til UTM ${k.regnetOm.til}`]
      .filter(Boolean).join(' · ');
  }

  /** «asbuilts_VA Prøvefelt_2026-09-15T08_30_00.000Z.xml» → «VA Prøvefelt». */
  function navnFraFil(filnavn) {
    let s = String(filnavn || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    s = s.replace(/^as[-_ ]?builts?[-_ ]*/i, '');
    s = s.replace(/[-_ ]*\d{4}-\d{2}-\d{2}(T[\d_:.-]+Z?)?$/i, '');
    // «Grøft.xml_2026-09-16.kof» – VisualMachine beholder navnet på fila punktene ble målt mot
    s = s.replace(/\.(xml|sos|kof)$/i, '');
    s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return s || 'Rør';
  }

  /* ---------------- profil og overdekning ---------------- */

  /**
   * Røret som en linje `Terreng.korridorFliser` kan gå langs: lengde og
   * `punktVed(s)` med retning som `Math.atan2(dy, dx)` – samme form som
   * `Linjeforing` har, så terrengkoden ikke trenger å vite at det er et rør.
   */
  function korridor(xy) {
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    return {
      lengde: s[s.length - 1],
      punktVed(ss) {
        if (xy.length < 2) return { x: xy[0].x, y: xy[0].y, retning: 0 };
        let i = 1;
        while (i < s.length - 1 && s[i] < ss) i++;
        const a = xy[i - 1], b = xy[i], seg = s[i] - s[i - 1];
        const t = seg > 0 ? Math.max(0, Math.min(1, (ss - s[i - 1]) / seg)) : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, retning: Math.atan2(b.y - a.y, b.x - a.x) };
      }
    };
  }

  /**
   * Lengdeprofilen til ett rør: topp, senter og bunn mot terrenget.
   *
   * Prøvd i hvert målte punkt og hver meter mellom. Toppen er rett linje mellom
   * de målte punktene – det er alt vi vet; å runde den av ville funnet på et rør
   * ingen har målt.
   *
   * Overdekningen er terreng minus topp rør. Mangler terrenget, er den NaN –
   * aldri null. En null her ville sett ut som et rør som ligger i dagen.
   *
   * `utenTerreng` og `overTerreng` er meter: hver prøve står for strekket fram
   * til neste.
   */
  function profil(linje, terrengZ, dimMm, steg) {
    const st = steg > 0 ? steg : 1;
    const D = Number.isFinite(dimMm) && dimMm > 0 ? dimMm / 1000 : 0;
    const xy = linje.xy, pts = linje.punkter;
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    const prove = (ss, x, y, topp, maalt) => {
      const t = terrengZ(x, y);
      const terreng = Number.isFinite(t) ? t : NaN;
      return { s: ss, x, y, topp, senter: topp - D / 2, bunn: topp - D, terreng,
        overdekning: Number.isFinite(terreng) ? terreng - topp : NaN, maalt };
    };
    const prover = [];
    for (let i = 0; i < xy.length; i++) {
      // et mellompunkt på et tegnet trykkrør er ikke målt – det står der bare så røret følger terrenget
      prover.push(prove(s[i], xy[i].x, xy[i].y, pts[i].z, !pts[i].mellom));
      if (i === xy.length - 1) break;
      const seg = s[i + 1] - s[i];
      for (let d = st; d < seg - 1e-9; d += st) {
        const t = d / seg;
        prover.push(prove(s[i] + d, xy[i].x + (xy[i + 1].x - xy[i].x) * t,
          xy[i].y + (xy[i + 1].y - xy[i].y) * t, pts[i].z + (pts[i + 1].z - pts[i].z) * t, false));
      }
    }
    const fall = [];
    for (let i = 1; i < pts.length; i++) {
      const ds = s[i] - s[i - 1];
      fall.push({ fra: s[i - 1], til: s[i], fall: ds > 0.01 ? (pts[i].z - pts[i - 1].z) / ds : NaN });
    }
    let minOd = Infinity, maksOd = -Infinity, utenTerreng = 0, overTerreng = 0;
    for (let k = 0; k < prover.length; k++) {
      const bredde = k < prover.length - 1 ? prover[k + 1].s - prover[k].s : 0;
      const od = prover[k].overdekning;
      if (!Number.isFinite(od)) { utenTerreng += bredde; continue; }
      if (od < minOd) minOd = od;
      if (od > maksOd) maksOd = od;
      if (od < 0) overTerreng += bredde;
    }
    return {
      lengde: s[s.length - 1], stasjoner: s, prover, fall,
      minOverdekning: Number.isFinite(minOd) ? minOd : NaN,
      maksOverdekning: Number.isFinite(maksOd) ? maksOd : NaN,
      utenTerreng, overTerreng
    };
  }

  /** Punktobjektene (muffer, anboringer …) som ligger på røret, med stasjon. */
  function objekterLangs(linje, objekter, tilXY, maks) {
    const grense = maks > 0 ? maks : 3;
    const s = [0];
    for (let i = 1; i < linje.xy.length; i++) {
      s.push(s[i - 1] + Math.hypot(linje.xy[i].x - linje.xy[i - 1].x, linje.xy[i].y - linje.xy[i - 1].y));
    }
    const ut = [];
    for (const p of objekter || []) {
      const q = tilXY(p);
      let best = null;
      for (let i = 1; i < linje.xy.length; i++) {
        const a = linje.xy[i - 1], b = linje.xy[i];
        const d = avstandTilStrekk(q, a, b);
        if (d > grense || (best && d >= best.d)) continue;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const t = L > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (L * L))) : 0;
        best = { d, s: s[i - 1] + t * L };
      }
      if (best) ut.push({ s: best.s, z: p.z, kode: p.kode, avstand: best.d, punkt: p });
    }
    return ut.sort((a, b) => a.s - b.s);
  }

  /**
   * Hvert punktobjekt på det røret det sitter på.
   *
   * To rør i samme grøft ligger en meter fra hverandre, og en muffe på det ene
   * ligger da også innen tre meter fra det andre. Med bare `objekterLangs` sto
   * muffen på 90PE også på profilen til 180 PE ved siden av.
   *
   * KODEN FØRST, SÅ AVSTANDEN. Blant rørene innen `maks` vinner det som koden
   * peker på – samme dimensjon, eller samme system – og først om ingen gjør
   * det, det nærmeste. Målt i den ekte fila: en «180 PE MUFFE» lå en drøy
   * halvmeter nærmere 90PE enn 180 PE, og havnet oppå muffen til 90PE.
   *
   * Kodetabellen (`koder`) vinner over tolkningen: har brukeren rettet
   * dimensjonen på et rør, er det den muffene skal kjenne det igjen på.
   *
   * @returns {Map<linjeId, Array>} objektene per rør, sortert langs røret
   */
  function objekterPaaLinjer(linjer, objekter, tilXY, maks, koder) {
    const ut = new Map((linjer || []).map(l => [l.id, []]));
    const tolket = new Map();
    const tolk = kode => {
      if (!tolket.has(kode)) tolket.set(kode, (koder && koder[kode]) || tolkKode(kode));
      return tolket.get(kode);
    };
    for (const p of objekter || []) {
      const t = tolk(p.kode);
      const passer = l => {
        const lt = tolk(l.kode);
        return (!!t.dim && lt.dim === t.dim) || (!!t.system && lt.system === t.system);
      };
      let best = null;
      for (const l of linjer || []) {
        const [o] = objekterLangs(l, [p], tilXY, maks);
        if (!o) continue;
        const kand = { l, o, passer: passer(l) };
        if (!best || (kand.passer && !best.passer)
          || (kand.passer === best.passer && o.avstand < best.o.avstand)) best = kand;
      }
      if (best) ut.get(best.l.id).push(best.o);
    }
    for (const liste of ut.values()) liste.sort((a, b) => a.s - b.s);
    return ut;
  }

  /** Tallene for hele anlegget: antall rør, lengde på bakken, overdekning. */
  function sammendrag(res) {
    const bf = (res && res.bakkefaktor) || 1;
    const linjer = (res && res.linjer) || [];
    let lengde = 0, minOd = Infinity, maksOd = -Infinity;
    for (const l of linjer) {
      lengde += l.lengde * bf;
      const pr = res.profiler && res.profiler.get(l.id);
      if (pr && Number.isFinite(pr.minOverdekning)) minOd = Math.min(minOd, pr.minOverdekning);
      if (pr && Number.isFinite(pr.maksOverdekning)) maksOd = Math.max(maksOd, pr.maksOverdekning);
    }
    // en rørskisse har strekene i `skisse` – lengden på kartet, uten overdekning
    const skisse = (res && res.skisse) || [];
    for (const l of skisse) lengde += (l.lengde || 0) * bf;
    return { antall: linjer.length + skisse.length, lengde,
      minOd: Number.isFinite(minOd) ? minOd : NaN, maksOd: Number.isFinite(maksOd) ? maksOd : NaN };
  }

  /**
   * Et spenn som «0,5–2,3», eller «−1,2 til 2,3» når ett av tallene er
   * negativt. «−19,91–−19,71» leses som én lang strek med minustegn i, og
   * nettopp et negativt spenn er det som må kunne leses – det er røret som
   * ligger over terrenget.
   */
  function spenn(min, maks, fmt) {
    if (!Number.isFinite(min) || !Number.isFinite(maks)) return '–';
    return (min < 0 || maks < 0) ? `${fmt(min)} til ${fmt(maks)}` : `${fmt(min)}–${fmt(maks)}`;
  }

  /** Det brukeren bør vite om – samme liste i fanen, rapporten og PDF-en. */
  function merknader(bygg, profiler, maksAvstand) {
    const ut = [];
    const m = v => String(Math.round(v * 10) / 10).replace('.', ',');
    if (bygg.enslige && bygg.enslige.length) {
      ut.push({ type: 'enslig', tekst: `${bygg.enslige.length} punkt har ingen nabo med samme kode innen `
        + `${maksAvstand} m – de står som enslige punkt i kartet.` });
    }
    if (bygg.bruddUtenTreff) {
      ut.push({ type: 'retting', tekst: `${bygg.bruddUtenTreff} brudd gjelder ikke lenger – `
        + 'punktene det gjaldt er borte eller henger ikke sammen.' });
    }
    if (bygg.koblingUtenTreff) {
      ut.push({ type: 'retting', tekst: `${bygg.koblingUtenTreff} koblinger gjelder ikke lenger – `
        + 'punktene det gjaldt er borte.' });
    }
    for (const l of bygg.linjer || []) {
      const pr = profiler && profiler.get(l.id);
      if (!pr) continue;
      if (pr.overTerreng > 0.5) {
        ut.push({ type: 'over', linje: l.id, tekst: `${l.kode}: røret ligger over terrenget i modellen på `
          + `${m(pr.overTerreng)} m – terrenget er trolig endret etter skanning, eller punktet er feil.` });
      }
      if (pr.utenTerreng > 0.5) {
        ut.push({ type: 'hull', linje: l.id, tekst: `${l.kode}: terrengdata mangler på ${m(pr.utenTerreng)} m `
          + '– overdekningen er ukjent der.' });
      }
    }
    return ut;
  }

  return {
    lesFil, lesLandXML, lesSOSI, lesKOF, dekod, tolkKode, koderFra, byggLinjer, avstandTilStrekk,
    kanonisk, forslagSammen, slaaSammenKoder, skillKode, ikkeSamme,
    lagTilXY, tilLatLon, erUtm, sjekkKoordinater, gjettSone, slaSammen, byttPunkter, rensRetting, slaSammenFiler, dimensjon, kildetekst, navnFraFil,
    korridor, profil, objekterLangs, objekterPaaLinjer, sammendrag, merknader, spenn,
    nyRor, StandardRormal, FARGER
  };
})();

if (typeof module !== 'undefined') module.exports = Ror;
