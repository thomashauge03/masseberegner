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
 * `sone` er UTM-sonen fila sier den er i (KOF), ellers null. `hoppet` teller
 * det som ikke ble linjer, etter type.
 */
const TraseImport = (() => {
  /** KOF-ens koordinatsystemkode → UTM-sone (EUREF89). Samme tabell som eksporten skriver. */
  const KSYS = { 22: 32, 23: 33, 24: 34, 25: 35, 26: 36 };
  /** Punkt nærmere enn dette etter hverandre er samme punkt (m). */
  const LIK = 0.01;
  /** Endepunkt nærmere enn dette er samme punkt når streker kjedes (m). */
  const KJED = 0.001;
  /** Avstanden mellom punktene en bue legges inn med (m). */
  const BUESTEG = 1;
  /** Programmets egne punktnavn i en stikningsfil – se roreksport.js: rørene `<rørnr>-<løpenr><B|T|G>`, kummene `K<nr><B|T>`. */
  const EGET = /^(.+)-\d+[BTG]$/, EGENKUM = /^.*K\d+[BT]$/;

  const tall = s => {
    const v = Number(String(s).trim().replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  };

  /**
   * Linjene ryddet: punkt på samme sted etter hverandre slås sammen, og en
   * linje med under to punkt er ingen linje. Er alle høydene 0, har linja
   * ingen høyde. Er noen 0 og resten mer enn en meter unna null, er nullene
   * høyder som mangler – en 2D-strek kjedet inn i en 3D-linje – ikke en bunn
   * på havnivå.
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
      // alle 0, eller noen 0 og resten over en meter fra null: nullene er høyder som mangler
      const z = p.map(q => q.z).filter(Number.isFinite);
      if (z.some(v => v === 0) && z.every(v => v === 0 || Math.abs(v) > 1)) for (const q of p) if (q.z === 0) q.z = NaN;
      ut.push(Object.assign({}, l, { punkter: p }));
    }
    return ut;
  }

  /**
   * En 05-post: navn, kode, nord, øst og høyde. Kolonnene er de
   * `Eksport.kofPunkt` skriver (navn 10, kode 8); en fil skrevet for hånd med
   * andre mellomrom leses fra tallene bakerst – navnet er det første ordet, og
   * koden alt mellom det og tallene, så «SP 160» og «SP 110» er to koder.
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
    return { navn: foran[0] || '', kode: foran.slice(1).join(' '), n: x[0], o: x[1], z: bak > 2 ? x[2] : NaN };
  }

  /**
   * KOF: `09_91` begynner en linje og `09_99` avslutter den; `09_96` lukker
   * den. Utenfor linjeblokkene er punkt med samme kode etter hverandre én
   * linje – slik er stikningsfiler skrevet.
   *
   * PROGRAMMETS EGNE STIKNINGSFILER skriver tre koder om hverandre for hvert
   * punkt (RORBUNN, RORTOPP, GRAVBUNN), og navnet sier røret
   * (`<rørnr>-<løpenr><B|T|G>`). Der ble ingen punkt stående etter hverandre
   * med samme kode, og fila ga ingen linjer. Punkt med det navnet samles per
   * kode og rør. Kummene (KUMBUNN og KUMTOPP, `K<nr><B|T>`) er punkt, ikke en
   * linje – de telles i `hoppet`. Sonen står i 01-posten.
   */
  function lesKof(tekst) {
    const linjer = [], merknader = [], egne = new Map(), hoppet = {};
    let sone = null, blokk = null, lop = null, nr = 0;
    const avsluttLop = () => { if (lop) { linjer.push(lop); lop = null; } };
    // en ny 09_91 uten 09_99 foran avslutter den åpne linja – den ble kastet
    const avsluttBlokk = () => { if (blokk) { linjer.push(blokk); blokk = null; } };
    for (const rad of String(tekst).split(/\r?\n/)) {
      const t = rad.trim();
      if (!t || t[0] === '-' || t[0] === '.') continue;
      if (/^01\b/.test(t)) {
        const m = /\b\d{8}\s+\d+\s+(\d+)\b/.exec(t);
        if (m && KSYS[+m[1]]) sone = KSYS[+m[1]];
        continue;
      }
      if (/^09_91/.test(t)) { avsluttLop(); avsluttBlokk(); blokk = { navn: 'Linje ' + (++nr), lag: '', punkter: [] }; continue; }
      if (/^09_9[69]/.test(t)) {
        if (blokk && /^09_96/.test(t) && blokk.punkter.length > 2) blokk.punkter.push(Object.assign({}, blokk.punkter[0]));
        avsluttBlokk();
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
      if ((p.kode === 'KUMBUNN' || p.kode === 'KUMTOPP') && EGENKUM.test(p.navn)) { hoppet.kumpunkt = (hoppet.kumpunkt || 0) + 1; continue; }
      const eget = EGET.exec(p.navn);
      if (eget) {
        const k = p.kode + '|' + eget[1];
        if (!egne.has(k)) egne.set(k, { navn: `${p.kode} – rør ${eget[1]}`, lag: p.kode, punkter: [] });
        egne.get(k).punkter.push(q);
        continue;
      }
      if (!lop || lop.lag !== p.kode) { avsluttLop(); lop = { navn: `${p.kode || 'Punkt'} (${++nr})`, lag: p.kode, punkter: [] }; }
      lop.punkter.push(q);
    }
    avsluttLop();
    avsluttBlokk();   // en linje uten 09_99 til slutt
    linjer.push(...egne.values());
    return { linjer: rydd(linjer), sone, hoppet, merknader };
  }

  /**
   * Punktene inne i en bue fra p1 til p2 med `bulge` b (tan av en fjerdedel
   * av vinkelen; positiv mot klokka), hver `BUESTEG`. Uten dem ble en bue en
   * rett korde – 5,9 m fra buen midt på en kvart sirkel med radius 20 m.
   */
  function bue(p1, p2, b) {
    const th = 4 * Math.atan(b), dx = p2.o - p1.o, dy = p2.n - p1.n, c = Math.hypot(dx, dy);
    if (!(c > 1e-9) || !(Math.abs(th) > 1e-9)) return [];
    const R = c / (2 * Math.sin(Math.abs(th) / 2));
    const d = (c / 2) / Math.tan(th / 2);   // fra midten av korden til sentrum, til venstre for korden
    const cx = (p1.o + p2.o) / 2 - dy / c * d, cy = (p1.n + p2.n) / 2 + dx / c * d;
    const a1 = Math.atan2(p1.n - cy, p1.o - cx);
    const n = Math.min(2000, Math.max(2, Math.ceil(Math.abs(th) * R / BUESTEG)));
    const ut = [];
    for (let k = 1; k < n; k++) {
      const a = a1 + th * k / n;
      ut.push({ o: cx + R * Math.cos(a), n: cy + R * Math.sin(a), z: p1.z + (p2.z - p1.z) * k / n });
    }
    return ut;
  }

  /** Polylinjens punkt med buene lagt inn; `b` på et punkt gjelder strekket til det neste. */
  function medBuer(p, lukket) {
    const ut = [];
    let buer = 0;
    for (let k = 0; k < p.length; k++) {
      ut.push({ o: p[k].o, n: p[k].n, z: p[k].z });
      const neste = k + 1 < p.length ? p[k + 1] : lukket && p.length > 2 ? p[0] : null;
      if (neste && p[k].b) { ut.push(...bue(p[k], neste, p[k].b)); buer++; }
    }
    if (lukket && p.length > 2) ut.push({ o: p[0].o, n: p[0].n, z: p[0].z });
    return { punkter: ut, buer };
  }

  /**
   * DXF, ENTITIES: LINE og ARC (løse streker på samme lag kjedes), LWPOLYLINE
   * (høyden i 38) og POLYLINE med VERTEX og SEQEND – 3D, eller 2D med høyden i
   * hodet. Buer i polylinjene legges inn som punkt hver meter. Laget er navnet.
   *
   * Det som ikke er en trase, telles i `hoppet`: tekst, blokker og annet,
   * papirrommet (67 = 1 – rammen og tittelfeltet, som ellers kunne fått hele
   * fila avvist som et lokalt system) og flatenett (polyface og mesh, som ble
   * lest som linjer med flatepostene i (0, 0)). En flate med normalen ned
   * (230 = −1) er speilet: x snus, ellers havnet traseen på negativ øst.
   */
  function lesDxf(tekst) {
    const r = String(tekst).split(/\r?\n/);
    const par = [];
    for (let i = 0; i + 1 < r.length; i += 2) par.push([r[i].trim(), r[i + 1].replace(/\s+$/, '')]);
    let i = par.findIndex((p, k) => p[0] === '0' && p[1].trim() === 'SECTION' && par[k + 1] && par[k + 1][0] === '2'
      && par[k + 1][1].trim() === 'ENTITIES');
    const linjer = [], streker = [], hoppet = {}, merknader = [];
    if (i < 0) return { linjer: [], sone: null, hoppet, merknader: ['Fant ingen ENTITIES i fila'] };
    i += 2;
    const tell = type => { hoppet[type] = (hoppet[type] || 0) + 1; };
    let buer = 0;
    // ett objekt: kodene fram til neste 0
    const objekt = () => {
      const type = par[i][1].trim(), felt = [];
      i++;
      while (i < par.length && par[i][0] !== '0') { felt.push(par[i]); i++; }
      return { type, felt };
    };
    const en = (felt, kode) => { const f = felt.find(p => p[0] === kode); return f ? f[1].trim() : null; };
    const speil = (felt, p) => { if (tall(en(felt, '230') ?? '1') < 0) for (const q of p) q.o = -q.o; return p; };
    while (i < par.length) {
      if (par[i][0] !== '0') { i++; continue; }
      if (par[i][1].trim() === 'ENDSEC') break;
      const { type, felt } = objekt();
      const lag = en(felt, '8') || '0', papir = en(felt, '67') === '1';
      if (type === 'POLYLINE') {
        // hjørnene leses alltid, så de ikke blir stående som egne objekt
        const flagg = +(en(felt, '70') || 0), tre = (flagg & 8) === 8, hoyde = tall(en(felt, '30') ?? 'NaN');
        const p = [];
        while (i < par.length && par[i][0] === '0' && par[i][1].trim() === 'VERTEX') {
          const v = objekt().felt;
          // kontrollpunkt i en splinet polylinje er ikke på linja
          if ((+(en(v, '70') || 0) & 16) === 16) continue;
          const q = { o: tall(en(v, '10')), n: tall(en(v, '20')), z: tre ? tall(en(v, '30') ?? 'NaN') : hoyde, b: tall(en(v, '42') ?? '0') || 0 };
          if (Number.isFinite(q.o) && Number.isFinite(q.n)) p.push(q);
        }
        if (i < par.length && par[i][1].trim() === 'SEQEND') objekt();
        if (papir) { tell('papirrom'); continue; }
        if ((flagg & (16 | 64)) !== 0) { tell('flatenett'); continue; }
        const m = medBuer(p, (flagg & 1) === 1);
        buer += m.buer;
        linjer.push({ navn: lag, lag, punkter: tre ? m.punkter : speil(felt, m.punkter) });
        continue;
      }
      if (papir) { tell('papirrom'); continue; }
      if (type === 'LINE') {
        const a = { o: tall(en(felt, '10')), n: tall(en(felt, '20')), z: tall(en(felt, '30') ?? 'NaN') };
        const b = { o: tall(en(felt, '11')), n: tall(en(felt, '21')), z: tall(en(felt, '31') ?? 'NaN') };
        if ([a.o, a.n, b.o, b.n].every(Number.isFinite)) streker.push({ lag, punkter: [a, b] });
      } else if (type === 'LWPOLYLINE') {
        const z = tall(en(felt, '38') ?? 'NaN'), p = [];
        for (const [k, v] of felt) {
          if (k === '10') p.push({ o: tall(v), n: NaN, z, b: 0 });
          else if (k === '20' && p.length) p[p.length - 1].n = tall(v);
          else if (k === '42' && p.length) p[p.length - 1].b = tall(v) || 0;
        }
        const m = medBuer(p.filter(q => Number.isFinite(q.o) && Number.isFinite(q.n)), (+(en(felt, '70') || 0) & 1) === 1);
        buer += m.buer;
        linjer.push({ navn: lag, lag, punkter: speil(felt, m.punkter) });
      } else if (type === 'ARC') {
        const cx = tall(en(felt, '10')), cy = tall(en(felt, '20')), z = tall(en(felt, '30') ?? 'NaN'), R = tall(en(felt, '40'));
        const a0 = tall(en(felt, '50')) * Math.PI / 180;
        let a1 = tall(en(felt, '51')) * Math.PI / 180;
        if (![cx, cy, R, a0, a1].every(Number.isFinite) || !(R > 0)) continue;
        while (a1 <= a0) a1 += 2 * Math.PI;   // mot klokka fra start til slutt
        const n = Math.min(2000, Math.max(2, Math.ceil((a1 - a0) * R / BUESTEG))), p = [];
        for (let k = 0; k <= n; k++) {
          const a = a0 + (a1 - a0) * k / n;
          p.push({ o: cx + R * Math.cos(a), n: cy + R * Math.sin(a), z });
        }
        streker.push({ lag, punkter: speil(felt, p) });
        buer++;
      } else tell(type);
    }
    linjer.push(...kjed(streker));
    if (buer) merknader.push(`${buer} ${buer === 1 ? 'bue er lagt' : 'buer er lagt'} inn som punkt hver meter`);
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

  /**
   * Streker på samme lag som deler endepunkt, kjedet til linjer. Endepunktene
   * slås opp i et rutenett, og kjeden går bare gjennom et punkt der nøyaktig
   * to streker møtes – i et kryss eller en T stopper den, så svaret ikke
   * avhenger av rekkefølgen strekene står i. Her ble hver strek prøvd mot alle
   * de andre: 20 000 streker tok tolv sekunder.
   */
  function kjed(streker) {
    const noder = new Map();
    const node = (lag, q) => {
      const ci = Math.round(q.o / KJED), cj = Math.round(q.n / KJED);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (const nd of noder.get(lag + '|' + (ci + di) + ',' + (cj + dj)) || []) {
            if (Math.hypot(nd.q.o - q.o, nd.q.n - q.n) <= KJED) return nd;
          }
        }
      }
      const nd = { q, ender: [] }, k = lag + '|' + ci + ',' + cj;
      if (!noder.has(k)) noder.set(k, []);
      noder.get(k).push(nd);
      return nd;
    };
    const s = streker.map(st => ({ st, a: null, b: null, brukt: false }));
    for (const x of s) {
      x.a = node(x.st.lag, x.st.punkter[0]);
      x.b = node(x.st.lag, x.st.punkter[x.st.punkter.length - 1]);
      x.a.ender.push(x); x.b.ender.push(x);
    }
    // streken på den andre siden av et punkt der nøyaktig to møtes
    const videre = (nd, fra) => (nd.ender.length === 2 ? nd.ender.find(y => y !== fra) || null : null);
    const ut = [];
    for (const x of s) {
      if (x.brukt) continue;
      x.brukt = true;
      const p = x.st.punkter.slice();
      // framover fra b-enden
      for (let nd = x.b, cur = x; ;) {
        const y = videre(nd, cur);
        if (!y || y.brukt) break;
        y.brukt = true;
        const fram = y.a === nd, q = fram ? y.st.punkter : y.st.punkter.slice().reverse();
        for (let k = 1; k < q.length; k++) p.push(q[k]);
        nd = fram ? y.b : y.a; cur = y;
      }
      // bakover fra a-enden – samlet og satt foran til slutt
      const foran = [];
      for (let nd = x.a, cur = x; ;) {
        const y = videre(nd, cur);
        if (!y || y.brukt) break;
        y.brukt = true;
        const slutt = y.b === nd, q = slutt ? y.st.punkter : y.st.punkter.slice().reverse();
        for (let k = q.length - 2; k >= 0; k--) foran.push(q[k]);
        nd = slutt ? y.a : y.b; cur = y;
      }
      ut.push({ navn: x.st.lag, lag: x.st.lag, punkter: foran.reverse().concat(p) });
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

  return { KSYS, lesKof, lesDxf, les, kjed, rydd, lengde, bue };
})();

if (typeof module !== 'undefined') module.exports = TraseImport;
