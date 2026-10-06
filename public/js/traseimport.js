'use strict';
/**
 * Traseer fra fil – KOF og DXF, lest lokalt i nettleseren.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `TraseImport` i nettleseren og med `require` i test/traseimportprove.js.
 *
 * Begge leserne svarer likt:
 *   { linjer: [{ navn, lag, punkter: [{ o, n, z }] }], sone, hoppet, merknader }
 * o er øst og n er nord i UTM. z er NaN der fila ikke har høyde – en DXF-linje
 * der alle høydene er 0, er en flat tegning, ikke en trase på havnivå.
 * `sone` er UTM-sonen fila sier den er i (KOF), ellers null.
 */
const TraseImport = (() => {
  /** KOF-ens koordinatsystemkode → UTM-sone (EUREF89). Samme tabell som eksporten skriver. */
  const KSYS = { 22: 32, 23: 33, 24: 34, 25: 35, 26: 36 };
  /** Punkt nærmere enn dette etter hverandre er samme punkt (m). */
  const LIK = 0.01;
  /** Endepunkt nærmere enn dette kjedes (m). */
  const KJED = 0.001;

  const tall = s => {
    const v = Number(String(s).trim().replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  };

  /**
   * Linjene ryddet: punkt på samme sted etter hverandre slås sammen, og en
   * linje med under to punkt er ingen linje. Er alle høydene 0, har linja
   * ingen høyde.
   */
  function rydd(linjer) {
    const ut = [];
    for (const l of linjer) {
      const p = [];
      for (const q of l.punkter) {
        const f = p[p.length - 1];
        if (f && Math.hypot(q.o - f.o, q.n - f.n) < LIK) continue;
        p.push(q);
      }
      if (p.length < 2) continue;
      if (p.every(q => q.z === 0)) for (const q of p) q.z = NaN;
      ut.push(Object.assign({}, l, { punkter: p }));
    }
    return ut;
  }

  /**
   * En 05-post: navn, kode, nord, øst og høyde. Kolonnene er de
   * `Eksport.kofPunkt` skriver (navn 10, kode 8); en fil skrevet for hånd med
   * andre mellomrom leses fra tallene bakerst.
   */
  function kofPunkt(linje) {
    const tallene = linje.slice(24).trim().split(/\s+/).map(tall);
    if (/^ 05 /.test(linje) && linje.length >= 48 && tallene.length >= 2 && tallene.slice(0, 2).every(Number.isFinite)) {
      return { navn: linje.slice(4, 14).trim(), kode: linje.slice(15, 23).trim(),
        n: tallene[0], o: tallene[1], z: tallene.length > 2 ? tallene[2] : NaN };
    }
    const d = linje.trim().split(/\s+/);
    if (d[0] !== '05') return null;
    let bak = 0;
    while (bak < 3 && d.length - 1 - bak > 0 && Number.isFinite(tall(d[d.length - 1 - bak]))) bak++;
    if (bak < 2) return null;
    /* En kode kan være et tall: «05 X 7 6500300 500300» er kode 7, nord og øst –
       ikke nord 7. Nord i UTM er millioner; står det millioner i nest siste
       og ikke i det tredje bakerste, er det tredje bakerste koden. */
    if (bak === 3 && !(Math.abs(tall(d[d.length - 3])) >= 1e6) && Math.abs(tall(d[d.length - 2])) >= 1e6) bak = 2;
    const x = d.slice(d.length - bak).map(tall);
    const foran = d.slice(1, d.length - bak);
    return { navn: foran[0] || '', kode: foran[1] || '', n: x[0], o: x[1], z: bak > 2 ? x[2] : NaN };
  }

  /**
   * KOF: `09_91` begynner en linje og `09_99` avslutter den; `09_96` lukker
   * den. Utenfor linjeblokkene er punkt med samme kode etter hverandre én
   * linje – slik er stikningsfiler skrevet, også programmets egne. Sonen står
   * i 01-posten.
   */
  function lesKof(tekst) {
    const linjer = [], merknader = [];
    let sone = null, blokk = null, lop = null, nr = 0;
    const avsluttLop = () => { if (lop) { linjer.push(lop); lop = null; } };
    for (const rad of String(tekst).split(/\r?\n/)) {
      const t = rad.trim();
      if (!t || t[0] === '-' || t[0] === '.') continue;
      if (/^01\b/.test(t)) {
        const m = /\b\d{8}\s+\d+\s+(\d+)\b/.exec(t);
        if (m && KSYS[+m[1]]) sone = KSYS[+m[1]];
        continue;
      }
      if (/^09_91/.test(t)) { avsluttLop(); blokk = { navn: 'Linje ' + (++nr), lag: '', punkter: [] }; continue; }
      if (/^09_9[69]/.test(t)) {
        if (blokk) {
          if (/^09_96/.test(t) && blokk.punkter.length > 2) blokk.punkter.push(Object.assign({}, blokk.punkter[0]));
          linjer.push(blokk);
        }
        blokk = null;
        continue;
      }
      if (!/^05\b/.test(t)) continue;
      const p = kofPunkt(rad);
      if (!p || !Number.isFinite(p.n) || !Number.isFinite(p.o)) { merknader.push(`Kunne ikke lese: ${t.slice(0, 60)}`); continue; }
      const q = { o: p.o, n: p.n, z: p.z };
      if (blokk) {
        if (!blokk.lag) { blokk.lag = p.kode; blokk.navn = p.kode ? `${p.kode} (${nr})` : blokk.navn; }
        blokk.punkter.push(q);
        continue;
      }
      if (!lop || lop.lag !== p.kode) { avsluttLop(); lop = { navn: `${p.kode || 'Punkt'} (${++nr})`, lag: p.kode, punkter: [] }; }
      lop.punkter.push(q);
    }
    avsluttLop();
    if (blokk) linjer.push(blokk);   // en linje uten 09_99 til slutt
    return { linjer: rydd(linjer), sone, hoppet: {}, merknader };
  }

  /**
   * DXF, ENTITIES: LINE, LWPOLYLINE (høyden i 38) og POLYLINE med VERTEX og
   * SEQEND (3D-polylinje). Laget er navnet. Løse LINE-er på samme lag som
   * deler endepunkt, kjedes – en trase fra CAD er ofte en rekke korte streker.
   * Det som ikke er linjer – blokker, tekst, sirkler – telles i `hoppet`.
   */
  function lesDxf(tekst) {
    const r = String(tekst).split(/\r?\n/);
    const par = [];
    for (let i = 0; i + 1 < r.length; i += 2) par.push([r[i].trim(), r[i + 1].replace(/\s+$/, '')]);
    let i = par.findIndex((p, k) => p[0] === '0' && p[1] === 'SECTION' && par[k + 1] && par[k + 1][0] === '2'
      && par[k + 1][1].trim() === 'ENTITIES');
    const linjer = [], streker = [], hoppet = {}, merknader = [];
    if (i < 0) return { linjer: [], sone: null, hoppet, merknader: ['Fant ingen ENTITIES i fila'] };
    i += 2;
    // ett objekt: kodene fram til neste 0
    const objekt = () => {
      const type = par[i][1].trim(), felt = [];
      i++;
      while (i < par.length && par[i][0] !== '0') { felt.push(par[i]); i++; }
      return { type, felt };
    };
    const en = (felt, kode) => { const f = felt.find(p => p[0] === kode); return f ? f[1].trim() : null; };
    while (i < par.length) {
      if (par[i][0] !== '0') { i++; continue; }
      if (par[i][1].trim() === 'ENDSEC') break;
      const { type, felt } = objekt();
      const lag = en(felt, '8') || '0';
      if (type === 'LINE') {
        const a = { o: tall(en(felt, '10')), n: tall(en(felt, '20')), z: tall(en(felt, '30') ?? 'NaN') };
        const b = { o: tall(en(felt, '11')), n: tall(en(felt, '21')), z: tall(en(felt, '31') ?? 'NaN') };
        if ([a.o, a.n, b.o, b.n].every(Number.isFinite)) streker.push({ lag, punkter: [a, b] });
      } else if (type === 'LWPOLYLINE') {
        const z = tall(en(felt, '38') ?? 'NaN'), lukket = (+(en(felt, '70') || 0) & 1) === 1;
        const p = [];
        for (const [k, v] of felt) {
          if (k === '10') p.push({ o: tall(v), n: NaN, z });
          else if (k === '20' && p.length) p[p.length - 1].n = tall(v);
        }
        if (lukket && p.length > 2) p.push(Object.assign({}, p[0]));
        linjer.push({ navn: lag, lag, punkter: p.filter(q => Number.isFinite(q.o) && Number.isFinite(q.n)) });
      } else if (type === 'POLYLINE') {
        const lukket = (+(en(felt, '70') || 0) & 1) === 1, p = [];
        while (i < par.length && par[i][0] === '0' && par[i][1].trim() === 'VERTEX') {
          const v = objekt().felt;
          // kontrollpunkt i en splinet polylinje er ikke på linja
          if ((+(en(v, '70') || 0) & 16) === 16) continue;
          const q = { o: tall(en(v, '10')), n: tall(en(v, '20')), z: tall(en(v, '30') ?? 'NaN') };
          if (Number.isFinite(q.o) && Number.isFinite(q.n)) p.push(q);
        }
        if (i < par.length && par[i][1].trim() === 'SEQEND') objekt();
        if (lukket && p.length > 2) p.push(Object.assign({}, p[0]));
        linjer.push({ navn: lag, lag, punkter: p });
      } else {
        hoppet[type] = (hoppet[type] || 0) + 1;
      }
    }
    linjer.push(...kjed(streker));
    // flere linjer på samme lag får nummer
    const antall = new Map();
    for (const l of linjer) antall.set(l.lag, (antall.get(l.lag) || 0) + 1);
    const nr = new Map();
    for (const l of linjer) {
      if (antall.get(l.lag) < 2) continue;
      nr.set(l.lag, (nr.get(l.lag) || 0) + 1);
      l.navn = `${l.lag} (${nr.get(l.lag)})`;
    }
    return { linjer: rydd(linjer), sone: null, hoppet, merknader };
  }

  /** Streker på samme lag som deler endepunkt, kjedet til linjer. */
  function kjed(streker) {
    const ut = [];
    const igjen = streker.slice();
    const lik = (a, b) => Math.hypot(a.o - b.o, a.n - b.n) <= KJED;
    while (igjen.length) {
      const s = igjen.shift();
      const p = s.punkter.slice();
      let fant = true;
      while (fant) {
        fant = false;
        for (let k = 0; k < igjen.length; k++) {
          const t = igjen[k];
          if (t.lag !== s.lag) continue;
          const [a, b] = t.punkter;
          if (lik(p[p.length - 1], a)) p.push(b);
          else if (lik(p[p.length - 1], b)) p.push(a);
          else if (lik(p[0], b)) p.unshift(a);
          else if (lik(p[0], a)) p.unshift(b);
          else continue;
          igjen.splice(k, 1);
          fant = true;
          break;
        }
      }
      ut.push({ navn: s.lag, lag: s.lag, punkter: p });
    }
    return ut;
  }

  /** Lengden i plan (m). */
  function lengde(l) {
    let s = 0;
    for (let k = 1; k < l.punkter.length; k++) s += Math.hypot(l.punkter[k].o - l.punkter[k - 1].o, l.punkter[k].n - l.punkter[k - 1].n);
    return s;
  }

  /** Les fila etter endelsen: .kof eller .dxf. */
  function les(navn, tekst) {
    if (/\.kof$/i.test(navn)) return lesKof(tekst);
    if (/\.dxf$/i.test(navn)) return lesDxf(tekst);
    throw new Error('Bare .kof og .dxf kan leses som trase');
  }

  return { KSYS, lesKof, lesDxf, les, kjed, rydd, lengde };
})();

if (typeof module !== 'undefined') module.exports = TraseImport;
