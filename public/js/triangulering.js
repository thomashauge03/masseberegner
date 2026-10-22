'use strict';
/**
 * Triangulering – innmålte terrengpunkter til en trekantflate (TIN).
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `Triangulering` i nettleseren og med `require` i test/trianguleringprove.js.
 *
 * HVORFOR.
 * Kartverkets DTM1 viser bakken slik den var da området sist ble skannet. Er
 * det fylt eller gravd siden, regner tomta på terreng som ikke finnes lenger.
 * Innmålte punkter er fasiten for i dag: innenfor ytterkanten av punktene
 * skal flaten være terrenget, utenfor står DTM1 som før.
 *
 * KOORDINATENE ER NORD OG ØST I FILA SIN SONE.
 * Flaten regner i meter. Den som slår opp i den, regner om til samme sone.
 */

const Triangulering = (() => {
  /* ---------------------------------------------------------------- *
   *  Delaunay (Bowyer–Watson)
   *  Punktene er { e, n }. Svaret er trekanter som indekstripler, alle
   *  mot klokka. Like punkter (samme e og n) må være luket ut på forhånd.
   * ---------------------------------------------------------------- */
  function delaunay(P) {
    const S = P.length;
    if (S < 3) return [];
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    for (const p of P) { mx = Math.min(mx, p.e); my = Math.min(my, p.n); Mx = Math.max(Mx, p.e); My = Math.max(My, p.n); }
    /* Regner rundt midtpunktet: koordinater på 6,5 millioner gir for lite
       presisjon igjen i omsirkelen når de kvadreres. */
    const cx = (mx + Mx) / 2, cy = (my + My) / 2;
    const d = Math.max(Mx - mx, My - my, 1) * 50;
    const V = P.map(p => [p.e - cx, p.n - cy]);
    V.push([-d, -d], [d, -d], [0, d]);
    const sirkel = (a, b, c) => {
      const [ax, ay] = V[a], [bx, by] = V[b], [qx, qy] = V[c];
      const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
      const A = ax * ax + ay * ay, B = bx * bx + by * by, C = qx * qx + qy * qy;
      const ux = (A * (by - qy) + B * (qy - ay) + C * (ay - by)) / D;
      const uy = (A * (qx - bx) + B * (ax - qx) + C * (bx - ax)) / D;
      return { ux, uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let T = [{ t: [S, S + 1, S + 2], s: sirkel(S, S + 1, S + 2) }];
    for (let i = 0; i < S; i++) {
      const [x, y] = V[i];
      const beholdt = [], kanter = new Map();
      for (const o of T) {
        if ((x - o.s.ux) ** 2 + (y - o.s.uy) ** 2 < o.s.r2) {
          for (const [a, b] of [[o.t[0], o.t[1]], [o.t[1], o.t[2]], [o.t[2], o.t[0]]]) {
            const k = a < b ? a * 1e6 + b : b * 1e6 + a;
            kanter.set(k, kanter.has(k) ? null : [a, b]);
          }
        } else beholdt.push(o);
      }
      T = beholdt;
      for (const k of kanter.values()) if (k) T.push({ t: [k[0], k[1], i], s: sirkel(k[0], k[1], i) });
    }
    const ut = [];
    for (const o of T) {
      const t = o.t;
      if (t[0] >= S || t[1] >= S || t[2] >= S) continue;
      const [a, b, c] = t.map(i => V[i]);
      const kryss = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(kryss) < 1e-9) continue;
      ut.push(kryss > 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]);
    }
    return ut;
  }

  /* ---------------------------------------------------------------- *
   *  Ytterkanten
   *
   *  HVORFOR IKKE BARE DET KONVEKSE HYLSTERET.
   *  Delaunay fyller alltid ut til det konvekse hylsteret. Er det målt rundt
   *  en L-formet fylling, bygger den lange, flate trekanter over hjørnet der
   *  ingen har målt, og regner kubikk der. Kanten skrelles derfor innover
   *  (χ-form, Duckham 2008): den lengste kanttrekanten fjernes så lenge
   *  kanten er lengre enn `makskant`, og bare når det motsatte hjørnet ikke
   *  allerede ligger på kanten – da ville flaten blitt delt i to.
   * ---------------------------------------------------------------- */
  function skrell(P, tri, makskant) {
    if (!(makskant > 0)) return tri.slice();
    const lengde = (a, b) => Math.hypot(P[a].e - P[b].e, P[a].n - P[b].n);
    const nøkkel = (a, b) => a < b ? a + ',' + b : b + ',' + a;
    const levende = tri.map(() => true);
    const kantTil = new Map();               // kant -> trekanter som bruker den
    tri.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const n = nøkkel(t[k], t[(k + 1) % 3]);
        if (!kantTil.has(n)) kantTil.set(n, []);
        kantTil.get(n).push(i);
      }
    });
    const påKant = new Uint8Array(P.length);
    for (const [n, liste] of kantTil) if (liste.length === 1) n.split(',').forEach(i => påKant[+i] = 1);

    for (;;) {
      let best = null, bestL = makskant;
      for (const [n, liste] of kantTil) {
        const lev = liste.filter(i => levende[i]);
        if (lev.length !== 1) continue;
        const [a, b] = n.split(',').map(Number);
        const L = lengde(a, b);
        if (L <= bestL) continue;
        const t = tri[lev[0]];
        const motsatt = t.find(v => v !== a && v !== b);
        if (påKant[motsatt]) continue;
        best = { i: lev[0], motsatt }; bestL = L;
      }
      if (!best) break;
      levende[best.i] = false;
      påKant[best.motsatt] = 1;
    }
    return tri.filter((_, i) => levende[i]);
  }

  /* Kanten som lukket ring av punktindekser (mot klokka). */
  function kantring(tri) {
    const teller = new Map();
    for (const t of tri) for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      const n = a < b ? a + ',' + b : b + ',' + a;
      teller.set(n, (teller.get(n) || 0) + 1);
    }
    const neste = new Map();
    for (const t of tri) for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      if (teller.get(a < b ? a + ',' + b : b + ',' + a) === 1) neste.set(a, b);
    }
    if (!neste.size) return [];
    const start = neste.keys().next().value, ring = [start];
    for (let v = neste.get(start); v !== start && ring.length <= neste.size; v = neste.get(v)) ring.push(v);
    return ring;
  }

  /* ---------------------------------------------------------------- *
   *  Flaten
   * ---------------------------------------------------------------- */

  /* Lengden som skilles ut som «ingen har målt her»: det dobbelte av den
     typiske avstanden til nærmeste nabo, men aldri kortere enn den lengste –
     ellers blir punkter liggende igjen utenfor flaten. På en ekte fil (32
     punkter rundt en fylling, 4 m til nærmeste nabo) gir det 9 m og samme kant
     som operatøren gikk, bortsett fra ett hjørne. Medianen av trekantkantene
     ga 22 m og bygde over hele det konvekse hylsteret. */
  function forslagMakskant(P, tri) {
    const nær = P.map(() => Infinity);
    for (const t of tri) for (let k = 0; k < 3; k++) {
      const i = t[k], j = t[(k + 1) % 3];
      const L = Math.hypot(P[i].e - P[j].e, P[i].n - P[j].n);
      nær[i] = Math.min(nær[i], L); nær[j] = Math.min(nær[j], L);
    }
    const L = nær.filter(isFinite).sort((x, y) => x - y);
    if (!L.length) return 0;
    return Math.ceil(Math.max(2 * L[Math.floor(L.length / 2)], L[L.length - 1]) * 2) / 2;
  }

  /**
   * Lager flaten av punktene.
   *   punkter:  [{ navn, e, n, z, ... }]
   *   valg.utelatt:  navn som skal holdes utenfor (feilmålinger)
   *   valg.makskant: kanter lengre enn dette skrelles bort langs ytterkanten.
   *                  Mangler den, brukes forslaget. 0 = konvekst hylster.
   */
  function lagFlate(punkter, valg = {}) {
    const ute = new Set(valg.utelatt || []);
    const P = [], sett = new Set(), dubletter = [];
    for (const p of punkter) {
      if (ute.has(p.navn) || !isFinite(p.e) || !isFinite(p.n) || !isFinite(p.z)) continue;
      const k = Math.round(p.e * 1000) + ',' + Math.round(p.n * 1000);
      if (sett.has(k)) { dubletter.push(p.navn); continue; }
      sett.add(k);
      P.push(p);
    }
    const alle = delaunay(P);
    const makskant = valg.makskant == null ? forslagMakskant(P, alle) : valg.makskant;
    const tri = skrell(P, alle, makskant);
    const flate = { punkter: P, tri, kant: kantring(tri), makskant, dubletter };
    bygg(flate);
    return flate;
  }

  /* Rutenett av trekanter for raskt oppslag, og plan for hver trekant. */
  function bygg(f) {
    const P = f.punkter;
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    for (const t of f.tri) for (const i of t) { mx = Math.min(mx, P[i].e); my = Math.min(my, P[i].n); Mx = Math.max(Mx, P[i].e); My = Math.max(My, P[i].n); }
    f.boks = f.tri.length ? { minE: mx, minN: my, maksE: Mx, maksN: My } : null;
    if (!f.boks) { f.celler = new Map(); f.celle = 1; return; }
    const celle = Math.max(1, Math.sqrt((Mx - mx) * (My - my) / Math.max(1, f.tri.length)));
    f.celle = celle;
    f.celler = new Map();
    f.tri.forEach((t, i) => {
      const es = t.map(j => P[j].e), ns = t.map(j => P[j].n);
      for (let cx = Math.floor((Math.min(...es) - mx) / celle); cx <= Math.floor((Math.max(...es) - mx) / celle); cx++)
        for (let cy = Math.floor((Math.min(...ns) - my) / celle); cy <= Math.floor((Math.max(...ns) - my) / celle); cy++) {
          const k = cx + ',' + cy;
          if (!f.celler.has(k)) f.celler.set(k, []);
          f.celler.get(k).push(i);
        }
    });
  }

  /* Høyden i flaten, eller NaN utenfor ytterkanten. Et punkt på en felles
     kant får høyden fra den første trekanten som treffer – den er lik i
     begge, og volumet under telles dermed bare én gang. */
  function hoyde(f, e, n) {
    if (!f.boks || e < f.boks.minE - 1e-6 || e > f.boks.maksE + 1e-6 || n < f.boks.minN - 1e-6 || n > f.boks.maksN + 1e-6) return NaN;
    const liste = f.celler.get(Math.floor((e - f.boks.minE) / f.celle) + ',' + Math.floor((n - f.boks.minN) / f.celle));
    if (!liste) return NaN;
    const P = f.punkter;
    for (const i of liste) {
      const [a, b, c] = f.tri[i].map(j => P[j]);
      const D = (b.n - c.n) * (a.e - c.e) + (c.e - b.e) * (a.n - c.n);
      const l1 = ((b.n - c.n) * (e - c.e) + (c.e - b.e) * (n - c.n)) / D;
      const l2 = ((c.n - a.n) * (e - c.e) + (a.e - c.e) * (n - c.n)) / D;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a.z + l2 * b.z + l3 * c.z;
    }
    return NaN;
  }

  /* ---------------------------------------------------------------- *
   *  Mistenkelige punkter
   *
   *  Et punkt som står langt fra snittet av naboene sine i flaten, er
   *  oftest en feilmåling: stanga satt på noe, feil antennehøyde, et punkt
   *  tatt før fiksløsningen. På en ekte fil sto ett punkt 4,1 m under både
   *  naboene og DTM1. Appen MERKER dem – å ta dem ut er brukerens knapp.
   * ---------------------------------------------------------------- */
  function mistenkelige(punkter, grense = 1.5) {
    const P = punkter.filter(p => isFinite(p.e) && isFinite(p.n) && isFinite(p.z));
    const tri = delaunay(P);
    const naboer = P.map(() => new Set());
    for (const t of tri) for (let k = 0; k < 3; k++) { naboer[t[k]].add(t[(k + 1) % 3]); naboer[t[(k + 1) % 3]].add(t[k]); }
    const ut = [];
    P.forEach((p, i) => {
      const nb = [...naboer[i]];
      if (nb.length < 2) return;
      const snitt = nb.reduce((s, j) => s + P[j].z, 0) / nb.length;
      const avvik = p.z - snitt;
      if (Math.abs(avvik) > grense) ut.push({ navn: p.navn, avvik: Math.round(avvik * 100) / 100 });
    });
    return ut;
  }

  /* ---------------------------------------------------------------- *
   *  Mot et annet terreng
   *
   *  `terreng(e, n)` gir høyden flaten skal sammenlignes med (DTM1), eller
   *  NaN der det mangler. Et felles rutenett legges over flaten, og hver
   *  rute slås opp med `hoyde`; steget velges så det blir høyst rundt
   *  400 000 ruter.
   *
   *  HVORFOR IKKE TREKANT FOR TREKANT.
   *  Det var første utgave. Langs en diagonal som går gjennom rutesentrene,
   *  havnet rutene i begge trekantene: 1 m fylling på 20 × 20 m ble 403 m³.
   * ---------------------------------------------------------------- */
  function areal(f) {
    let a = 0, skrå = 0;
    const P = f.punkter;
    for (const t of f.tri) {
      const [p, q, r] = t.map(i => P[i]);
      const u = [q.e - p.e, q.n - p.n, q.z - p.z], v = [r.e - p.e, r.n - p.n, r.z - p.z];
      a += (u[0] * v[1] - u[1] * v[0]) / 2;
      skrå += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    let omkrets = 0;
    for (let i = 0; i < f.kant.length; i++) {
      const a1 = P[f.kant[i]], b1 = P[f.kant[(i + 1) % f.kant.length]];
      omkrets += Math.hypot(a1.e - b1.e, a1.n - b1.n);
    }
    return { areal: a, skrå, omkrets };
  }

  function regnMot(f, terreng, valg = {}) {
    const { areal: A, skrå, omkrets } = areal(f);
    const steg = valg.steg || Math.max(0.1, Math.sqrt(A / 400000));
    let fyll = 0, skj = 0, dekket = 0, mangler = 0, maksFyll = -Infinity, maksSkj = Infinity, maksFyllPkt = null;
    const P = f.punkter, celle = steg * steg, B = f.boks;
    if (B) {
      for (let j = Math.floor(B.minN / steg); (j + 0.5) * steg <= B.maksN; j++)
        for (let i = Math.floor(B.minE / steg); (i + 0.5) * steg <= B.maksE; i++) {
          const E = (i + 0.5) * steg, N = (j + 0.5) * steg;
          const z = hoyde(f, E, N);
          if (!isFinite(z)) continue;
          const g = terreng(E, N);
          if (!isFinite(g)) { mangler += celle; continue; }
          const d = z - g;
          dekket += celle;
          if (d > 0) fyll += d * celle; else skj -= d * celle;
          if (d > maksFyll) { maksFyll = d; maksFyllPkt = { e: E, n: N }; }
          if (d < maksSkj) maksSkj = d;
        }
    }
    let zMin = Infinity, zMaks = -Infinity;
    for (const t of f.tri) for (const i of t) { zMin = Math.min(zMin, P[i].z); zMaks = Math.max(zMaks, P[i].z); }
    return {
      areal: A, skrå, omkrets, steg,
      fyll, skjæring: skj, netto: fyll - skj,
      snittTykkelse: dekket > 0 ? (fyll - skj) / dekket : NaN,
      maksFyll: isFinite(maksFyll) ? maksFyll : NaN, maksFyllPkt,
      maksSkjæring: isFinite(maksSkj) ? -maksSkj : NaN,
      zMin, zMaks, manglerTerreng: mangler
    };
  }

  /* ---------------------------------------------------------------- *
   *  LandXML
   *
   *  Bare punktene (CgPoint) leses: «nord øst høyde». Koden står i
   *  `code`/`desc` hos Trimble, i HexagonLandXML hos Leica, eller ingen
   *  steder. Sonen hentes fra <CoordinateSystem>/<Projection> når fila sier
   *  den. Østverdien alene kan ikke avgjøre sonen, så sier ikke fila noe,
   *  står den åpen og brukeren velger.
   * ---------------------------------------------------------------- */
  function lesLandXml(tekst) {
    const punkter = [];
    const re = /<CgPoint\b([^>]*)>([^<]*)<\/CgPoint>/g;
    const attr = (s, navn) => { const m = s.match(new RegExp('\\b' + navn + '="([^"]*)"')); return m ? m[1] : ''; };
    let m;
    while ((m = re.exec(tekst))) {
      const tall = m[2].trim().split(/[\s,]+/).map(Number);
      if (tall.length < 3 || !tall.slice(0, 3).every(isFinite)) continue;
      punkter.push({
        navn: attr(m[1], 'name') || attr(m[1], 'oID') || String(punkter.length + 1),
        kode: attr(m[1], 'code') || attr(m[1], 'desc') || '',
        tid: attr(m[1], 'timeStamp') || '',
        n: tall[0], e: tall[1], z: tall[2]
      });
    }
    return { punkter, sone: sone(tekst) };
  }

  /* UTM-sonen fila oppgir: i navnet («UTM 32», «EUREF89 UTM33», «25832»)
     eller som sentralmeridian i en transversal Mercator. */
  function sone(tekst) {
    const navn = (tekst.match(/<(?:CoordinateSystem|Projection)\b[^>]*>/g) || []).join(' ');
    let m = navn.match(/(?:UTM|sone|zone)\s*-?\s*(3[1-6])\b/i) || navn.match(/\b258(3[1-6])\b/);
    if (m) return +m[1];
    m = tekst.match(/<TransverseMercatorProjection\b[^>]*\blambda0="([^"]+)"/);
    if (m) {
      const grader = +m[1] * 180 / Math.PI;
      const z = Math.round((grader + 183) / 6);
      if (Math.abs(z * 6 - 183 - grader) < 0.01 && z >= 31 && z <= 36) return z;
    }
    return null;
  }

  /* Et innmålt terreng i prosjektet. Punktene står i fila sin sone.
     `bruk` er brukerens knapp: først når den er på, er flaten terrenget for
     de andre anleggene. Den slås aldri på av seg selv. */
  function nyTin() {
    return { fil: '', sone: null, punkter: [], utelatt: [], makskant: null, bruk: false };
  }

  return { nyTin, delaunay, skrell, kantring, forslagMakskant, lagFlate, hoyde, mistenkelige, areal, regnMot, lesLandXml, sone };
})();

if (typeof module !== 'undefined') module.exports = Triangulering;
