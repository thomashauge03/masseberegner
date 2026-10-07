'use strict';
/**
 * Oversiktskartet for rør: én PDF med alle rørtypene på ett kart, i hver sin
 * farge med tegnforklaring i siden – og ett kart per type etterpå. Det er
 * kartet som skal ut på plassen, så de som legger rørene ser hvor hvert rør
 * skal ligge.
 *
 * Modulen er ren: den får rørene som linjer i regnesonen (UTM), og tegner på
 * en PdfSkriver. Henting av bakgrunnskartet og dialogen ligger i ui-rorkart.js.
 *
 * Mål på papiret er i millimeter her inne og gjøres om til punkt (MM) der
 * PdfSkriver kalles. Kartflaten har y nedover, som PdfSkriver.
 */
const Rorkart = (() => {
  const MM = 72 / 25.4;                    // punkt per millimeter

  /* FARGEFAMILIENE. Systemet bestemmer fargefamilien – vann er blått,
     spillvann brunt/rødt, overvann grønt – så kartet leses likt med det
     man kjenner fra tegningene. Innenfor en familie får hver kode sin nyanse,
     de største dimensjonene først. Programmets egen fargetabell går per
     system, så alle spillvannsrør er samme brune – det duger i et kart der
     man kan klikke, men ikke på et ark der fargen er det eneste som skiller
     to rør. Fargene er valgt mørke nok til å stå på det grå bakgrunnskartet
     og lyse nok til å skilles fra hverandre. */
  const FAMILIER = {
    spill: ['#8a4b1d', '#c0392b', '#5d2a0c', '#d35400', '#a1662f'],
    vann: ['#1f5fbf', '#0b2f75', '#4f97e8', '#0d8a9a', '#5b4bc4'],
    overvann: ['#11806a', '#1e8449', '#36b39a', '#0b5345', '#58b368'],
    drens: ['#8d7a12', '#b86e0c', '#6b5d0a', '#d4a017', '#7a7f1c'],
    felles: ['#5d4037', '#7b4f9e', '#3e2723', '#8d6e63', '#a1559e'],
    kabel: ['#7d3c98', '#b05cc6', '#4a235a', '#c06fb0', '#8e5ea2'],
    annet: ['#e4572e', '#17a398', '#c2185b', '#f29e1f', '#2e4057', '#8bc34a', '#6d4c41', '#00897b']
  };
  /** Hvor tett rørtypen skrives langs rørene, på arket (mm). */
  const TEKSTAVSTAND = 60;
  const GRAA = [0.62, 0.62, 0.62];
  const SVART = [0.1, 0.1, 0.1];
  const SVAK = [0.38, 0.38, 0.38];
  const KOTE = [0.6, 0.42, 0.24];          // kotebrun, som på kartet
  // desimalene en kotehøyde trenger: 2,5 m er ikke «3»
  const desimaler = ekv => (Math.abs(ekv * 2 - Math.round(ekv * 2)) > 1e-9 ? 2 : Math.abs(ekv - Math.round(ekv)) > 1e-9 ? 1 : 0);
  const HVIT = [1, 1, 1];

  /** Punktet halvveis langs en linje på papiret, med retningen der. */
  function midtpaa(punkter) {
    let L = 0;
    for (let i = 1; i < punkter.length; i++) L += Math.hypot(punkter[i][0] - punkter[i - 1][0], punkter[i][1] - punkter[i - 1][1]);
    let igjen = L / 2;
    for (let i = 1; i < punkter.length; i++) {
      const d = Math.hypot(punkter[i][0] - punkter[i - 1][0], punkter[i][1] - punkter[i - 1][1]);
      if (d >= igjen && d > 0) {
        const t = igjen / d;
        return { x: punkter[i - 1][0] + (punkter[i][0] - punkter[i - 1][0]) * t,
          y: punkter[i - 1][1] + (punkter[i][1] - punkter[i - 1][1]) * t, lengde: L };
      }
      igjen -= d;
    }
    return punkter.length ? { x: punkter[0][0], y: punkter[0][1], lengde: L } : null;
  }

  /**
   * En boks på arket, gjerne dreid: midtpunktet, retningen langs (enhetsvektor,
   * y nedover som på arket), og halve bredden og høyden.
   */
  const boks = (cx, cy, vinkel, hb, hh) => ({ cx, cy, ux: Math.cos(vinkel), uy: -Math.sin(vinkel), hb, hh });

  /** Om to bokser overlapper – skillende akser, så to skrå tekster tett i tett ikke regnes som kollisjon. */
  function overlapper(A, B) {
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    for (const [ax, ay] of [[A.ux, A.uy], [-A.uy, A.ux], [B.ux, B.uy], [-B.uy, B.ux]]) {
      const r = Q => Q.hb * Math.abs(Q.ux * ax + Q.uy * ay) + Q.hh * Math.abs(-Q.uy * ax + Q.ux * ay);
      if (Math.abs(dx * ax + dy * ay) > r(A) + r(B)) return false;
    }
    return true;
  }

  /**
   * HVOR RØRTYPEN SKRIVES LANGS RØRENE.
   *
   * Fargen og tegnforklaringen alene holder ikke ute på plassen: to blå og tre
   * brune nyanser skilles ikke i dagslys, og man skal slippe å lete i siden.
   * Så står typen skrevet langs røret, mange steder – omtrent hver `avstand`
   * på arket, og minst én gang på et rør teksten får plass langs.
   *
   * - Teksten står der røret er rett nok: knekker det mer enn `rett` ut fra
   *   streken under teksten, flyttes den litt langs røret, eller sløyfes der.
   * - Aldri opp ned: den leses fra venstre, eller nedenfra.
   * - Ingen tekst oppå en annen, eller oppå det som står i `opptatt` (numrene,
   *   kotetallene, kummene). Rør i samme grøft ligger oppå hverandre på arket:
   *   er plassen tatt, prøves en tredjedel av avstanden lenger fram, så rørene i
   *   en grøft skrives på hver sine steder etter tur.
   * - Inne i rammen.
   * - Et rør som ikke fikk noen tekst langs seg – en stikkledning med nummeret
   *   midt på, eller et rør i en grøft der de andre tok plassene – får den ved
   *   siden av, midt på og parallelt med røret. Ellers sto de korte rørene
   *   uten type, og det er de man lettest tar feil av.
   *
   * @param {Array<{punkter: Array<[number, number]>, bredde: number, hoyde: number}>} baner
   *   rørene på arket (punkt, y nedover), i den rekkefølgen de skal få plass
   * @param {{avstand, flytt, rett, siden?, ramme?, opptatt?}} o  mål i punkt – `siden`
   *   er luften mellom streken og en tekst ved siden av
   * @returns {Array<{i, x, y, vinkel}>} midtpunktet og vinkelen (mot klokka) for hver tekst
   */
  function plasserTekster(baner, o) {
    const ut = [];
    const R = o.ramme;
    // halve bredden og høyden av boksen rett mot arket
    const ytre = b => [b.hb * Math.abs(b.ux) + b.hh * Math.abs(b.uy), b.hb * Math.abs(b.uy) + b.hh * Math.abs(b.ux)];
    const iRamme = b => {
      if (!R) return true;
      const [ex, ey] = ytre(b);
      return b.cx - ex >= R.x0 && b.cx + ex <= R.x1 && b.cy - ey >= R.y0 && b.cy + ey <= R.y1;
    };
    /* DET SOM ER OPPTATT, I ET RUTENETT. Hver kandidat sjekkes mot boksene i
       rutene den dekker, ikke mot alle: med søket over hele avstanden i trange
       grøfter ble det ellers kvadratisk i antall tekster. */
    const RUTE = 60, rutenett = new Map();
    const ruter = (b, f) => {
      const [ex, ey] = ytre(b);
      for (let i = Math.floor((b.cx - ex) / RUTE); i <= Math.floor((b.cx + ex) / RUTE); i++) {
        for (let j = Math.floor((b.cy - ey) / RUTE); j <= Math.floor((b.cy + ey) / RUTE); j++) if (f(i + ',' + j)) return true;
      }
      return false;
    };
    const opptaFor = b => ruter(b, k => { let l = rutenett.get(k); if (!l) rutenett.set(k, (l = [])); l.push(b); return false; });
    const kolliderer = b => ruter(b, k => (rutenett.get(k) || []).some(Q => overlapper(b, Q)));
    for (const b of o.opptatt || []) opptaFor(b);
    // vinkelen på arket, mot klokka – y er nedover her – og aldri opp ned
    const vinkelAv = (dx, dy) => {
      const v = Math.atan2(-dy, dx);
      return v > Math.PI / 2 + 1e-9 ? v - Math.PI : v < -Math.PI / 2 + 1e-9 ? v + Math.PI : v;
    };
    const rorene = baner.map((bn, i) => {
      const p = bn.punkter, w = bn.bredde, h = bn.hoyde;
      if (!p || p.length < 2) return null;
      const lengs = [0];
      for (let k = 1; k < p.length; k++) lengs.push(lengs[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
      const L = lengs[lengs.length - 1];
      if (!(L >= w * 0.5)) return null;            // for kort til å kalle et rør på arket
      // første punkt med lengs ≥ s, funnet ved halvering
      const forste = s => { let lo = 0, hi = lengs.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (lengs[m] < s) lo = m + 1; else hi = m; } return lo; };
      const ved = s => {
        const k = Math.max(1, forste(s)), d = lengs[k] - lengs[k - 1], t = d > 0 ? (s - lengs[k - 1]) / d : 0;
        return [p[k - 1][0] + (p[k][0] - p[k - 1][0]) * t, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * t];
      };
      // målene langs røret, omtrent hver `avstand` – bare der teksten får plass langs streken
      const maal = [];
      if (L >= w * 1.1) {
        for (let s = o.avstand / 2; s <= L - w / 2; s += o.avstand) if (s >= w / 2) maal.push(s);
        if (!maal.length) maal.push(L / 2);
      }
      return { i, p, w, h, L, lengs, forste, ved, maal, brukt: -1, antall: 0 };
    }).filter(Boolean);
    const legg = (r, cx, cy, v) => {
      const B = boks(cx, cy, v, r.w / 2, r.h / 2);
      if (!iRamme(B) || kolliderer(B)) return false;
      opptaFor(B);
      ut.push({ i: r.i, x: cx, y: cy, vinkel: v });
      r.antall++;
      return true;
    };
    /* Én tekst langs røret ved mål nummer k: der, eller flyttet litt, der
       streken er rett nok. Er plassen tatt av et annet rør – rør i samme grøft
       ligger oppå hverandre på arket – prøves en tredjedel av avstanden lenger
       fram, så to, før teksten flyttes lenger. Her tok det første røret i
       grøfta alle plassene når to rør fikk samme forskyvning, og de andre fikk
       én tekst hver; eller de klumpet seg rundt hvert mål. De små flyttene
       (4 og 8 mm) er for det som er lite: et nummer, en kum, et kotetall. */
    const FORSOK = [];
    for (const t of [0, 1, 2]) for (const d of [0, 1, -1, 2, -2]) FORSOK.push([t, d]);
    for (const t of [0, 1, 2]) for (const d of [3, -3]) FORSOK.push([t, d]);
    /* Til sist hele avstanden rundt målet, hver halve flytt: langs en grøft med
       kummer er plassene mellom kummene få, og de faste flyttene bommet på dem –
       spillvannet med kummene fikk én tekst. */
    for (let m = 1; m * o.flytt / 2 <= o.avstand / 2 + 1e-9; m++) {
      for (const d of [m / 2, -m / 2]) if (!(Number.isInteger(d) && Math.abs(d) <= 3)) FORSOK.push([0, d]);
    }
    const langs = (r, k) => {
      const { p, w, L, lengs, forste, ved } = r;
      for (const [tredjedel, d] of FORSOK) {
        const s = r.maal[k] + tredjedel * o.avstand / 3 + d * o.flytt;
        if (s < w / 2 - 1e-9 || s > L - w / 2 + 1e-9) continue;
        const a = ved(s - w / 2), b = ved(s + w / 2);
        const dx = b[0] - a[0], dy = b[1] - a[1], kord = Math.hypot(dx, dy);
        // en knekk, eller et rør som går fram og tilbake: korda er kortere enn teksten
        if (!(kord >= w * 0.9)) continue;
        // rett nok: ingen del av røret under teksten går mer enn `rett` ut fra korda
        let avvik = 0;
        for (let q = forste(s - w / 2); q < p.length && lengs[q] < s + w / 2; q++) {
          avvik = Math.max(avvik, Math.abs((p[q][0] - a[0]) * dy - (p[q][1] - a[1]) * dx) / kord);
        }
        if (!(avvik <= o.rett)) continue;
        if (legg(r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, vinkelAv(dx, dy))) return true;
      }
      return false;
    };
    /* Ved siden av, midt på og parallelt – over streken, ellers under. Er det
       trangt, litt lenger ut: nummeret midt på et skrått rør står rett mot
       arket, og hjørnet stikker lenger ut fra streken enn på et vannrett.
       Aldri tvers over røret selv: en stikkledning med en knekk fikk teksten
       over begge beina. */
    const vedSiden = r => {
      const { p, w, h, L, lengs, forste, ved } = r, c = Math.min(w, L) / 2;
      // rørets egne strekk der teksten kan nå, som bokser uten høyde
      const strekk = s => {
        const ut2 = [];
        for (let q = Math.max(1, forste(s - w)); q < p.length && lengs[q - 1] <= s + w; q++) {
          const dx = p[q][0] - p[q - 1][0], dy = p[q][1] - p[q - 1][1], l = Math.hypot(dx, dy);
          if (l > 1e-9) ut2.push(boks((p[q][0] + p[q - 1][0]) / 2, (p[q][1] + p[q - 1][1]) / 2, Math.atan2(-dy, dx), l / 2, 0));
        }
        return ut2;
      };
      for (const s of [L / 2, L / 2 + o.flytt, L / 2 - o.flytt]) {
        if (s - c < -1e-9 || s + c > L + 1e-9) continue;
        const a = ved(s - c), b = ved(s + c), dx = b[0] - a[0], dy = b[1] - a[1];
        if (Math.hypot(dx, dy) < c) continue;      // en skarp knekk midt på
        const v = vinkelAv(dx, dy), m = ved(s), egne = strekk(s);
        // opp fra teksten, på arket med y nedover
        const nx = -Math.sin(v), ny = -Math.cos(v);
        for (const f of [1, 1.5, 2]) {
          const avstand = h / 2 + f * (o.siden || 0);
          for (const side of [1, -1]) {
            const cx = m[0] + side * avstand * nx, cy = m[1] + side * avstand * ny;
            if (egne.some(S => overlapper(boks(cx, cy, v, w / 2, h / 2), S))) continue;
            if (legg(r, cx, cy, v)) return true;
          }
        }
      }
      return false;
    };
    /* FØRST ÉN TEKST PER RØR, så resten. Her tok de lange rørene i en grøft
       plassene langs grøfta før stikkledningene kom til – hver stikkledning
       har bare én plass, og den sto opptatt. De korteste velger først. */
    for (const r of rorene.slice().sort((a, b) => a.L - b.L)) {
      for (let k = 0; k < r.maal.length && r.brukt < 0; k++) if (langs(r, k)) r.brukt = k;
      if (r.brukt < 0) vedSiden(r);
    }
    /* Så resten, etter tur: mål nummer k for hvert rør før nummer k + 1, og i
       hver runde det røret som har færrest først. Her tok det første røret i
       lista alle sine før det neste fikk et – langs en grøft med kummer, der
       plassene mellom kummene er få, fikk spillvannet én. */
    const flest = rorene.reduce((m, r) => Math.max(m, r.maal.length), 0);
    for (let k = 0; k < flest; k++) {
      for (const r of rorene.slice().sort((a, b) => a.antall - b.antall)) if (k < r.maal.length && k !== r.brukt) langs(r, k);
    }
    return ut;
  }

  const hexTilRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const rgbTilHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

  /**
   * Nyanse nr. `i` i en familie. Når familiens egne er brukt opp, lages nye av
   * dem – lysere, så mørkere, så enda lysere – så seks vannledninger ikke får
   * samme blå. Her gikk den rundt, og VL 32 og VL 160 ble like.
   */
  function nyanse(fam, i) {
    const n = fam.length, runde = Math.floor(i / n), grunn = hexTilRgb(fam[i % n]);
    if (!runde) return fam[i % n];
    const lys = runde % 2 === 1, f = Math.min(0.75, 0.3 + 0.15 * Math.floor((runde - 1) / 2));
    return rgbTilHex(grunn.map(v => (lys ? v + (1 - v) * f : v * (1 - f))));
  }

  /**
   * Farge per rørkode, for hele prosjektet – hver kode sin.
   * @param {Object<string, {system?:string, dim?:number}>} koder  kodene som har rør
   * @returns {Map<string, {rgb:number[], hex:string, system:string, nr:number}>}
   */
  function fargetabell(koder) {
    const grupper = new Map();
    for (const kode of Object.keys(koder || {}).sort()) {
      const k = koder[kode] || {};
      const sys = FAMILIER[k.system] ? k.system : 'annet';
      if (!grupper.has(sys)) grupper.set(sys, []);
      grupper.get(sys).push({ kode, dim: +k.dim || 0 });
    }
    const ut = new Map(), brukt = new Set();
    for (const sys of Object.keys(FAMILIER)) {
      const liste = grupper.get(sys);
      if (!liste) continue;
      liste.sort((a, b) => b.dim - a.dim || (a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0));
      const fam = FAMILIER[sys];
      liste.forEach((x, i) => {
        let hex = nyanse(fam, i);
        // to like etter avrundingen: et hakk mørkere til den er ledig
        for (let t = 1; brukt.has(hex) && t < 20; t++) hex = rgbTilHex(hexTilRgb(nyanse(fam, i)).map(v => v * (1 - 0.04 * t)));
        brukt.add(hex);
        ut.set(x.kode, { rgb: hexTilRgb(hex), hex, system: sys, nr: i });
      });
    }
    return ut;
  }

  /* ---------------- utsnitt og målestokk ---------------- */

  /* Målestokkene en tegning har. Et kart i 1:937 kan ikke leses med linjal. */
  const MALESTOKKER = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];

  /**
   * Utsnittet en kartflate viser: rørene midt i, med luft rundt, og en
   * målestokk fra rekka over.
   * @param {{x0,y0,x1,y1}} boks  det som skal med, i meter
   * @param {{b:number, h:number}} flate  kartflaten i millimeter
   * @returns {{N:number, x0:number, y0:number, x1:number, y1:number}}
   */
  function utsnitt(boks, flate, o = {}) {
    const minSpenn = o.minSpenn || 40, marg = o.marg != null ? o.marg : 0.08;
    const { x0, y0, x1, y1 } = boks || {};
    if (!(x1 >= x0) || !(y1 >= y0)) throw new Error('Ingen rør å vise');
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const sx = Math.max(minSpenn, (x1 - x0) * (1 + 2 * marg));
    const sy = Math.max(minSpenn, (y1 - y0) * (1 + 2 * marg));
    // 1 mm på papiret er N/1000 m i terrenget
    const behov = Math.max(sx / flate.b, sy / flate.h) * 1000;
    const N = MALESTOKKER.find(n => n >= behov - 1e-9) || Math.ceil(behov / 50000) * 50000;
    const bm = flate.b * N / 1000, hm = flate.h * N / 1000;
    return { N, x0: cx - bm / 2, x1: cx + bm / 2, y0: cy - hm / 2, y1: cy + hm / 2 };
  }

  /** Fra meter i terrenget til millimeter fra kartflatens øvre venstre hjørne. */
  function tilPapir(u) {
    const m = 1000 / u.N;
    return (x, y) => [(x - u.x0) * m, (u.y1 - y) * m];
  }

  /* ---------------- bakgrunnskartet ---------------- */

  /* Kartverkets kartcache har fliser rett i UTM, så rørene kan tegnes i sine
     egne koordinater uten omprojisering. Rutenettet står i
     WMTSCapabilities.xml: 256 piksler per flis, øvre venstre hjørne som under,
     og målestokken 77 371 428,57 på nivå 0 – med pikselstørrelsen 0,28 mm er
     det 21 664 m per piksel, halvert for hvert nivå. */
  const FLISTOPP = { 32: -2000000, 33: -2500000, 35: -3500000 };
  const FLISTOPP_Y = 9045984;
  const RES0 = 21664;

  /**
   * Flisene som dekker utsnittet, på nivået som gir om lag `dpi` på papiret.
   * Er det for mange, tas nivået under – et kart over flere kilometer skal
   * ikke hente tusen fliser.
   * @returns {?{z, res, fliser:Array<{rad,kol,url,px,py}>, bredde, hoyde}}
   *   px/py er der flisas øvre venstre hjørne havner på et lerret som dekker
   *   utsnittet; bredde/hoyde er lerretets mål i piksler
   */
  function flisplan(u, sone, lag = 'topograatone', o = {}) {
    const x0 = FLISTOPP[sone];
    if (x0 == null) return null;
    const dpi = o.dpi || 150, maks = o.maks || 300;
    const onsket = (u.N / 1000) / (dpi / 25.4);           // meter per piksel på papiret
    let z = Math.min(18, Math.max(0, Math.ceil(Math.log2(RES0 / onsket) - 1e-9)));
    for (;;) {
      const res = RES0 / Math.pow(2, z), side = 256 * res;
      const k0 = Math.floor((u.x0 - x0) / side), k1 = Math.floor((u.x1 - x0) / side);
      const r0 = Math.floor((FLISTOPP_Y - u.y1) / side), r1 = Math.floor((FLISTOPP_Y - u.y0) / side);
      if ((k1 - k0 + 1) * (r1 - r0 + 1) > maks && z > 0) { z--; continue; }
      const fliser = [];
      for (let r = r0; r <= r1; r++) {
        for (let k = k0; k <= k1; k++) {
          fliser.push({ rad: r, kol: k,
            url: `https://cache.kartverket.no/v1/wmts/1.0.0/${lag}/default/utm${sone}n/${z}/${r}/${k}.png`,
            px: (x0 + k * side - u.x0) / res, py: (u.y1 - (FLISTOPP_Y - r * side)) / res });
        }
      }
      return { z, res, fliser, bredde: Math.round((u.x1 - u.x0) / res), hoyde: Math.round((u.y1 - u.y0) / res) };
    }
  }

  /* ---------------- høydekotene ---------------- */

  const EKVIDISTANSER = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];

  /**
   * Avstanden mellom kotene: etter målestokken, og så dobbelt så stor til det
   * er høyst 60 koter i utsnittet – en li i 1:500 med en kote hver halve meter
   * ville vært et brunt teppe.
   */
  function velgEkvidistanse(N, zMin, zMax) {
    let i = EKVIDISTANSER.indexOf(N <= 500 ? 0.5 : N <= 1000 ? 1 : N <= 2500 ? 2 : N <= 5000 ? 5 : 10);
    while (i < EKVIDISTANSER.length - 1 && (zMax - zMin) / EKVIDISTANSER[i] > 60) i++;
    return EKVIDISTANSER[i];
  }

  /** Oppløsningen terrenget hentes i for en målestokk (m per piksel). */
  const terrengOpplosning = N => (N <= 2500 ? 1 : N <= 5000 ? 2 : N <= 10000 ? 4 : 8);

  /**
   * Kotene i et rutenett – marsjerende kvadrater.
   *
   * Hvert kvadrat med fire kjente hjørner gir korte stykker der nivået
   * krysser kantene. Stykkene kjedes til linjer gjennom kantene de deler, og
   * forenkles så punktene ikke blir flere enn tegningen trenger. Et hjørne
   * uten høyde gir et brudd i kota, ikke en kote som finner på noe.
   *
   * @param {{x0, y0, steg, nx, ny, z:ArrayLike<number>}} r  z[j·nx + i] i (x0 + i·steg, y0 + j·steg)
   * @param {number} ekv  avstanden mellom kotene (m)
   * @param {{toleranse?:number}} [o]  forenklingen (m)
   * @returns {Array<{niva:number, punkter:number[][], lukket:boolean}>}
   */
  function koter(r, ekv, o = {}) {
    const { x0, y0, steg, nx, ny, z } = r;
    const at = (i, j) => z[j * nx + i];
    const botter = new Map();         // nivånummer → { punkt: Map(kant → [x, y]), seg: [[kant, kant]] }
    const botte = k => { let b = botter.get(k); if (!b) { b = { punkt: new Map(), seg: [] }; botter.set(k, b); } return b; };
    for (let j = 0; j + 1 < ny; j++) {
      for (let i = 0; i + 1 < nx; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        for (let k = Math.ceil(lo / ekv); k * ekv <= hi; k++) {
          // et hårsbredd over nivået, så et hjørne som ligger nøyaktig på det ikke gir to treff
          const L = k * ekv + ekv * 1e-6;
          const kode = (a >= L ? 1 : 0) | (b >= L ? 2 : 0) | (c >= L ? 4 : 0) | (d >= L ? 8 : 0);
          if (kode === 0 || kode === 15) continue;
          const B = botte(k);
          const kant = (navn, za, zb, ia, ja, horisontal) => {
            const nokkel = navn;
            if (!B.punkt.has(nokkel)) {
              const t = (L - za) / (zb - za);
              B.punkt.set(nokkel, horisontal ? [x0 + (ia + t) * steg, y0 + ja * steg] : [x0 + ia * steg, y0 + (ja + t) * steg]);
            }
            return nokkel;
          };
          const bunn = () => kant(`h${i}_${j}`, a, b, i, j, true);
          const topp = () => kant(`h${i}_${j + 1}`, d, c, i, j + 1, true);
          const venstre = () => kant(`v${i}_${j}`, a, d, i, j, false);
          const hoyre = () => kant(`v${i + 1}_${j}`, b, c, i + 1, j, false);
          const seg = (p, q) => B.seg.push([p(), q()]);
          const midt = (a + b + c + d) / 4 >= L;
          switch (kode) {
            case 1: case 14: seg(venstre, bunn); break;
            case 2: case 13: seg(bunn, hoyre); break;
            case 3: case 12: seg(venstre, hoyre); break;
            case 4: case 11: seg(hoyre, topp); break;
            case 6: case 9: seg(bunn, topp); break;
            case 7: case 8: seg(venstre, topp); break;
            case 5: if (midt) { seg(bunn, hoyre); seg(topp, venstre); } else { seg(venstre, bunn); seg(hoyre, topp); } break;
            case 10: if (midt) { seg(venstre, bunn); seg(hoyre, topp); } else { seg(bunn, hoyre); seg(topp, venstre); } break;
            default: break;
          }
        }
      }
    }
    const ut = [];
    for (const [k, B] of [...botter].sort((x, y) => x[0] - y[0])) {
      const naboer = new Map();
      B.seg.forEach((s, n) => { for (const e of s) { const l = naboer.get(e); if (l) l.push(n); else naboer.set(e, [n]); } });
      const brukt = new Uint8Array(B.seg.length);
      // fra en kant: følg stykkene videre så langt de henger sammen
      const folg = (kant, liste) => {
        for (;;) {
          const neste = (naboer.get(kant) || []).find(n => !brukt[n]);
          if (neste == null) return kant;
          brukt[neste] = 1;
          const [p, q] = B.seg[neste];
          kant = p === kant ? q : p;
          liste.push(kant);
        }
      };
      for (let n = 0; n < B.seg.length; n++) {
        if (brukt[n]) continue;
        brukt[n] = 1;
        const fram = [B.seg[n][1]], bak = [];
        folg(B.seg[n][1], fram);
        folg(B.seg[n][0], bak);
        const kanter = bak.reverse().concat([B.seg[n][0]], fram);
        const lukket = kanter.length > 3 && kanter[0] === kanter[kanter.length - 1];
        let punkter = kanter.map(e => B.punkt.get(e));
        if (o.toleranse > 0) punkter = forenkle(punkter, o.toleranse);
        ut.push({ niva: Math.round(k * ekv * 1e6) / 1e6, punkter, lukket });
      }
    }
    return ut;
  }

  /** Douglas–Peucker uten rekursjon: punkt nærmere linja enn toleransen tas ut. */
  function forenkle(p, tol) {
    if (p.length < 3) return p;
    const behold = new Uint8Array(p.length);
    behold[0] = behold[p.length - 1] = 1;
    const stabel = [[0, p.length - 1]];
    while (stabel.length) {
      const [a, b] = stabel.pop();
      const [ax, ay] = p[a], [bx, by] = p[b];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let maks = -1, hvor = -1;
      for (let i = a + 1; i < b; i++) {
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[i][0] - ax) * dx + (p[i][1] - ay) * dy) / L2)) : 0;
        const d = Math.hypot(p[i][0] - ax - t * dx, p[i][1] - ay - t * dy);
        if (d > maks) { maks = d; hvor = i; }
      }
      if (maks > tol) { behold[hvor] = 1; stabel.push([a, hvor], [hvor, b]); }
    }
    return p.filter((_, i) => behold[i]);
  }

  /**
   * Kotene for et utsnitt: terrenget prøvd i et rutenett over kartflaten, med
   * en millimeter på papiret mellom prøvene – aldri tettere enn terrenget er.
   * @param {{N, x0, y0, x1, y1}} u
   * @param {(x:number, y:number) => number} terrengZ
   * @returns {?{ekvidistanse:number, linjer:Array}}
   */
  function lagKoter(u, terrengZ, o = {}) {
    const res = o.res || terrengOpplosning(u.N);
    const steg = Math.max(res, u.N / 1000);
    const nx = Math.ceil((u.x1 - u.x0) / steg) + 3, ny = Math.ceil((u.y1 - u.y0) / steg) + 3;
    const r = { x0: u.x0 - steg, y0: u.y0 - steg, steg, nx, ny, z: new Float32Array(nx * ny) };
    let zMin = Infinity, zMaks = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = terrengZ(r.x0 + i * steg, r.y0 + j * steg);
        r.z[j * nx + i] = Number.isFinite(v) ? v : NaN;
        if (Number.isFinite(v)) { if (v < zMin) zMin = v; if (v > zMaks) zMaks = v; }
      }
    }
    if (!Number.isFinite(zMin)) return null;
    const ekv = velgEkvidistanse(u.N, zMin, zMaks);
    // forenklet til en femtedels millimeter på papiret – mer ser ingen
    return { ekvidistanse: ekv, linjer: koter(r, ekv, { toleranse: 0.2 * u.N / 1000 }) };
  }

  /**
   * Terrengflisene langs rørene: for hver bit på høyst 16 m tas alle flisene
   * i rektangelet rundt biten, med `marg` meter til hver side. Prøvepunkt hver
   * 50. meter gikk glipp av en flis et rør bare snitter i hjørnet – samme feil
   * som `korridorFliser` i terreng.js beskriver – og røret fikk et hull uten
   * terreng der.
   * @returns {Set<string>} nøkler «tx_ty», som Terreng.nøkkel
   */
  function flisnokler(linjer, flisM = 256, marg = 3) {
    const ut = new Set();
    for (const l of linjer) {
      for (let i = 0; i + 1 < l.xy.length; i++) {
        const a = l.xy[i], b = l.xy[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16));
        for (let k = 0; k < n; k++) {
          const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n };
          const q = { x: a.x + (b.x - a.x) * (k + 1) / n, y: a.y + (b.y - a.y) * (k + 1) / n };
          for (let tx = Math.floor((Math.min(p.x, q.x) - marg) / flisM); tx <= Math.floor((Math.max(p.x, q.x) + marg) / flisM); tx++) {
            for (let ty = Math.floor((Math.min(p.y, q.y) - marg) / flisM); ty <= Math.floor((Math.max(p.y, q.y) + marg) / flisM); ty++) {
              ut.add(tx + '_' + ty);
            }
          }
        }
      }
    }
    return ut;
  }

  /** Antall terrengfliser et utsnitt trenger – kotene tegnes ikke når det er flere enn taket. */
  function fliserFor(u, flisM = 256) {
    return (Math.floor(u.x1 / flisM) - Math.floor(u.x0 / flisM) + 1) * (Math.floor(u.y1 / flisM) - Math.floor(u.y0 / flisM) + 1);
  }

  /* ---------------- sidene ---------------- */

  const PAPIR = {
    A3: { b: 420, h: 297, forklaring: 95, navn: 'A3' },
    A4: { b: 297, h: 210, forklaring: 75, navn: 'A4' }
  };

  /** Hvor kartet og tegnforklaringen står på arket – liggende, i millimeter. */
  function oppsett(papir) {
    const p = PAPIR[papir] || PAPIR.A3, marg = 10, mellom = 6;
    return {
      papir: p,
      kart: { x: marg, y: marg, b: p.b - 2 * marg - p.forklaring - mellom, h: p.h - 2 * marg },
      forklaring: { x: p.b - marg - p.forklaring, y: marg, b: p.forklaring, h: p.h - 2 * marg }
    };
  }

  function boksFor(data, koder) {
    const med = new Set(koder);
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const ta = q => {
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
      b.x0 = Math.min(b.x0, q.x); b.x1 = Math.max(b.x1, q.x);
      b.y0 = Math.min(b.y0, q.y); b.y1 = Math.max(b.y1, q.y);
    };
    for (const l of data.linjer) if (med.has(l.kode)) l.xy.forEach(ta);
    for (const k of data.kummer || []) if (med.has(k.kode)) ta(k);
    return b;
  }

  /**
   * Sidene PDF-en skal ha: samlekartet med alle de valgte typene, og – når
   * flere er valgt og brukeren vil – én side per type. Hver side har sitt
   * eget utsnitt, så en type som ligger i ett hjørne av prosjektet, ikke blir
   * en strek på et frimerke.
   * @param {{linjer:Array, kummer?:Array}} data
   * @param {{koder:string[], perType?:boolean, papir?:'A3'|'A4'}} valg
   */
  function sider(data, valg) {
    const opp = oppsett(valg.papir);
    const finnes = new Set(data.linjer.map(l => l.kode));
    const valgte = (valg.koder || []).filter(k => finnes.has(k));
    if (!valgte.length) throw new Error('Velg minst én rørtype');
    const ut = [{
      tittel: valgte.length === 1 ? valgte[0] : 'Alle valgte rør', koder: valgte, graa: [], samle: true,
      utsnitt: utsnitt(boksFor(data, valgte), opp.kart)
    }];
    if (valg.perType && valgte.length > 1) {
      for (const k of valgte) {
        ut.push({ tittel: k, koder: [k], graa: valgte.filter(x => x !== k), utsnitt: utsnitt(boksFor(data, [k]), opp.kart) });
      }
    }
    return ut;
  }

  /** Strektykkelse i mm etter dimensjonen – som i kartet: et 400-rør er tykkere enn et 32. */
  const tykkelse = dim => Math.max(0.5, Math.min(1.8, 0.45 + (+dim || 110) / 400));

  /** Et rundt tall for målestokklinjalen: 1, 2 eller 5 ganger en tierpotens. */
  function rundtTall(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const f of [5, 2, 1]) if (f * p <= v) return f * p;
    return p;
  }

  const tall = (v, des = 0) => {
    const s = (Math.round(v * Math.pow(10, des)) / Math.pow(10, des)).toFixed(des);
    const [hel, br] = s.split('.');
    return hel.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (br ? ',' + br : '');
  };

  /** Det tegnforklaringen sier om en kode: lengde, antall og om rørene er målt eller tegnet. */
  function omKode(data, kode) {
    let lengde = 0, antall = 0, innmalt = false, planlagt = false;
    for (const l of data.linjer) {
      if (l.kode !== kode) continue;
      lengde += l.lengde || 0; antall++;
      if (l.kilde === 'planlagt') planlagt = true; else innmalt = true;
    }
    return { lengde, antall, kilde: innmalt && planlagt ? 'innmålt og planlagt' : planlagt ? 'planlagt' : 'innmålt' };
  }

  /**
   * Tegner én side.
   * @param {PdfSkriver} P
   * @param {{tittel, koder, graa, utsnitt}} side
   * @param {object} data  {prosjekt, sone, dato, linjer, kummer}
   * @param {Map} farger  fra `fargetabell`
   * @param {?{bytes, bredde, hoyde}} bakgrunn  JPEG som dekker utsnittet
   * @param {{nr, antall, papir, merknad?, tekst?}} o  `tekst: false` – rørtypen skrives ikke langs rørene
   */
  function tegnSide(P, side, data, farger, bakgrunn, o) {
    const opp = oppsett(o.papir);
    const K = opp.kart, F = opp.forklaring, u = side.utsnitt;
    const pt = v => v * MM;
    const papir = tilPapir(u);
    const iKart = (x, y) => { const [mx, my] = papir(x, y); return [pt(K.x + mx), pt(K.y + my)]; };
    /* Kummene på siden: de som hører til typene her. En innmålt kum uten noe
       rør innen to meter hører ikke til noen type, og står bare på samlesiden. */
    const kummerHer = (data.kummer || []).filter(k => (k.kode == null ? !!side.samle : side.koder.includes(k.kode)));
    // en tekst som får plass i bredden (mm) – ellers kortet, med «…»
    const kort = (tekst, st, fet, maksMm) => {
      let s = String(tekst);
      if (P.bredteAv(s, st, fet) <= pt(maksMm)) return s;
      while (s.length > 1 && P.bredteAv(s + '…', st, fet) > pt(maksMm)) s = s.slice(0, -1);
      return s + '…';
    };
    P.nySide();
    /* Det som mangler, står i kartet – også når bare noen fliser ble borte.
       Hvite ruter i bakgrunnen uten et ord ser ut som et kart med hull i
       terrenget. */
    const notis = [!bakgrunn ? o.merknad : bakgrunn.mangler ? `${bakgrunn.mangler} av ${bakgrunn.av} fliser i bakgrunnskartet manglet` : null,
      side.koterMerknad || null].filter(Boolean).join(' · ') || null;
    // det tekstene langs rørene skal gå utenom: kotetallene, numrene og merknaden nederst
    const opptatt = [];
    if (notis) {
      const bn = P.bredteAv(notis, 7) + pt(3);
      opptatt.push(boks(pt(K.x + 1.5) + bn / 2, pt(K.y + K.h - 3.9), 0, bn / 2, pt(2.3)));
    }

    // ---- kartflaten
    P.klipp(pt(K.x), pt(K.y), pt(K.b), pt(K.h), () => {
      if (bakgrunn) P.bilde(bakgrunn.bytes, bakgrunn.bredde, bakgrunn.hoyde, pt(K.x), pt(K.y), pt(K.b), pt(K.h));
      /* HØYDEKOTENE – formen på bakken, så de som skal grave ser hvor det
         går opp og ned. Tynne og brune under rørene; hver femte tykkere og med
         høyden skrevet på. */
      const kt = side.koter;
      if (kt && kt.linjer.length) {
        const erIndeks = kl => Math.abs(Math.round(kl.niva / kt.ekvidistanse)) % 5 === 0;
        for (const kl of kt.linjer) {
          P.sti(kl.punkter.map(([x, y]) => iKart(x, y)), { farge: KOTE, tykkelse: pt(erIndeks(kl) ? 0.25 : 0.12) });
        }
        for (const kl of kt.linjer) {
          if (!erIndeks(kl)) continue;
          const m = midtpaa(kl.punkter.map(([x, y]) => iKart(x, y)));
          if (!m || m.lengde < pt(25)) continue;
          const tekst = tall(kl.niva, desimaler(kt.ekvidistanse)), b = P.bredteAv(tekst, 6);
          P.rektangel(m.x - b / 2 - pt(0.6), m.y - pt(1.4), b + pt(1.2), pt(2.6), { fyll: HVIT });
          P.tekst(m.x, m.y + pt(0.9), tekst, { storrelse: 6, farge: KOTE, juster: 'm' });
          opptatt.push(boks(m.x, m.y - pt(0.1), 0, b / 2 + pt(0.6), pt(1.3)));
        }
      }
      // de andre typene tynt i grått under, så man ser hvor dette røret ligger i forhold til dem
      const graa = new Set(side.graa || []);
      for (const l of data.linjer) {
        if (!graa.has(l.kode)) continue;
        P.sti(l.xy.map(q => iKart(q.x, q.y)), { farge: GRAA, tykkelse: pt(0.35),
          stiplet: l.kilde === 'planlagt' ? [pt(2), pt(1.2)] : null });
      }
      const med = new Set(side.koder);
      // de tykkeste først, så et lite rør oppå et stort fortsatt synes
      const linjer = data.linjer.filter(l => med.has(l.kode)).sort((a, b) => (+b.dim || 0) - (+a.dim || 0));
      for (const l of linjer) {
        const f = farger.get(l.kode);
        P.sti(l.xy.map(q => iKart(q.x, q.y)), { farge: f ? f.rgb : SVART, tykkelse: pt(tykkelse(l.dim)),
          stiplet: l.kilde === 'planlagt' ? [pt(3), pt(1.6)] : null });
      }
      for (const k of kummerHer) {
        const [x, y] = iKart(k.x, k.y);
        // kummen i målestokk, men aldri mindre enn at den synes
        const r = Math.max(pt(0.9), pt(((+k.d || 1) / 2) * 1000 / u.N));
        P.sirkel(x, y, r, { fyll: [1, 1, 1], strek: SVART, tykkelse: pt(0.25) });
        // kummen står på røret, der teksten også står – og den hvite kanten skjulte den
        opptatt.push(boks(x, y, 0, r, r));
      }
      // numrene: det samme tallet står over lengdeprofilen til røret
      for (const l of linjer) {
        if (!l.nr) continue;
        const m = midtpaa(l.xy.map(q => iKart(q.x, q.y)));
        if (!m) continue;
        const tekst = String(l.nr), b = Math.max(P.bredteAv(tekst, 6.5, true), pt(2));
        const f = farger.get(l.kode);
        P.rektangel(m.x - b / 2 - pt(0.8), m.y - pt(1.6), b + pt(1.6), pt(3.2), { fyll: HVIT, strek: f ? f.rgb : SVART, tykkelse: pt(0.25) });
        P.tekst(m.x, m.y + pt(1.0), tekst, { storrelse: 6.5, fet: true, juster: 'm' });
        opptatt.push(boks(m.x, m.y, 0, b / 2 + pt(0.8), pt(1.6)));
      }
      /* RØRTYPEN SKREVET LANGS RØRENE, mange steder – se plasserTekster. I
         rørets farge, med hvit kant så den leses over kartet og streken. */
      if (o.tekst !== false) {
        const ST = 6.5;
        const baner = linjer.map(l => ({ punkter: l.xy.map(q => iKart(q.x, q.y)),
          bredde: P.bredteAv(l.kode, ST, true) + pt(1.2), hoyde: ST * 0.8 + pt(0.8) }));
        const plassert = plasserTekster(baner, { avstand: pt(TEKSTAVSTAND), flytt: pt(4), rett: pt(0.6), siden: pt(2),
          ramme: { x0: pt(K.x + 1), y0: pt(K.y + 1), x1: pt(K.x + K.b - 1), y1: pt(K.y + K.h - 1) }, opptatt });
        for (const t of plassert) {
          const l = linjer[t.i], f = farger.get(l.kode);
          P.tekst(t.x, t.y, l.kode, { storrelse: ST, fet: true, farge: f ? f.rgb : SVART, juster: 'm', loddrett: 'm',
            vinkel: t.vinkel, glorie: { farge: HVIT, tykkelse: 1.8 } });
        }
      }
    });
    P.rektangel(pt(K.x), pt(K.y), pt(K.b), pt(K.h), { strek: SVART, tykkelse: pt(0.3) });
    if (notis) {
      P.rektangel(pt(K.x + 1.5), pt(K.y + K.h - 6.2), P.bredteAv(notis, 7) + pt(3), pt(4.6), { fyll: [1, 1, 1] });
      P.tekst(pt(K.x + 3), pt(K.y + K.h - 3), notis, { storrelse: 7, farge: SVAK });
    }

    // ---- tegnforklaringen
    let y = F.y;
    // ned én tekstlinje: skriftstørrelsen er i punkt, y i millimeter
    const linje = (tekst, st, fet, farge, luft = 1.6) => {
      y += st / MM + luft;
      P.tekst(pt(F.x), pt(y), tekst, { storrelse: st, fet, farge });
    };
    linje(kort(data.prosjekt || 'Prosjekt', 13, true, F.b), 13, true, SVART, 2);
    linje('Oversiktskart – rør', 9, false, SVAK);
    y += 3;
    linje(kort(side.tittel, 12, true, F.b), 12, true, SVART);
    linje(`Målestokk 1:${tall(u.N)} ved utskrift på ${opp.papir.navn}`, 8, false, SVAK);
    y += 5;
    linje('Tegnforklaring', 9, true, SVART);
    y += 1.5;
    const prove = (x, yy, farge, stiplet, tykk, lengde = 12) => {
      P.sti([[pt(x), pt(yy - 1.2)], [pt(x + lengde), pt(yy - 1.2)]], { farge, tykkelse: pt(tykk), stiplet });
    };
    const paSiden = data.linjer.filter(l => side.koder.includes(l.kode));
    const harPlan = paSiden.some(l => l.kilde === 'planlagt'), harMalt = paSiden.some(l => l.kilde !== 'planlagt');
    const harGraa = (side.graa || []).length > 0;
    /* ALLE KODENE SKAL STÅ I FORKLARINGEN. Her ble det stoppet når kolonnen var
       full: på A4 sto elleve, og den tolvte var en farge i kartet uten forklaring.
       Får de ikke plass med to linjer hver, får de én; så to kolonner; og først
       når heller ikke det holder, står det hvor mange som mangler. */
    const harKoter = !!(side.koter && side.koter.linjer.length);
    const ekstra = (harGraa ? 5 : 0) + (harPlan && harMalt ? 10.5 : 0) + (kummerHer.length ? 6 : 0) + (harKoter ? 5 : 0);
    const plass = (F.y + F.h - 62) - ekstra - y;
    const n = side.koder.length, RAD = 4.8;
    const modus = n * 8.6 <= plass ? 'to' : n * RAD <= plass ? 'en' : 'kolonner';
    const rader = modus === 'kolonner' ? Math.max(1, Math.floor(plass / RAD)) : n;
    const kapasitet = modus === 'kolonner' ? 2 * rader : n;
    const vises = n > kapasitet ? side.koder.slice(0, kapasitet - 1) : side.koder;
    const start = y;
    vises.forEach((kode, i) => {
      const f = farger.get(kode), om = omKode(data, kode);
      const dim = (data.linjer.find(l => l.kode === kode) || {}).dim;
      const farge = f ? f.rgb : SVART, stiplet = om.kilde === 'planlagt' ? [pt(3), pt(1.6)] : null;
      if (modus === 'to') {
        y += 5;
        prove(F.x, y, farge, stiplet, tykkelse(dim));
        P.tekst(pt(F.x + 15), pt(y), kort(kode, 9, true, F.b - 15), { storrelse: 9, fet: true });
        y += 3.6;
        P.tekst(pt(F.x + 15), pt(y), `${tall(om.lengde)} m · ${om.antall} rør · ${om.kilde}`, { storrelse: 7, farge: SVAK });
        return;
      }
      const kol = modus === 'kolonner' ? Math.floor(i / rader) : 0, rad = modus === 'kolonner' ? i % rader : i;
      const bredde = modus === 'kolonner' ? F.b / 2 - 1.5 : F.b;
      const x0 = F.x + kol * (F.b / 2 + 1.5), yy = start + RAD * (rad + 1);
      prove(x0, yy, farge, stiplet, tykkelse(dim), 7);
      P.tekst(pt(x0 + 9), pt(yy), kort(kode, 7.5, true, bredde - 9 - 13), { storrelse: 7.5, fet: true });
      P.tekst(pt(x0 + bredde), pt(yy), `${tall(om.lengde)} m`, { storrelse: 6.5, farge: SVAK, juster: 'h' });
    });
    if (modus !== 'to') y = start + RAD * Math.min(rader, vises.length);
    if (vises.length < n) {
      y += RAD;
      P.tekst(pt(F.x), pt(y), `+ ${n - vises.length} rørtyper til`, { storrelse: 7.5, fet: true, farge: SVAK });
    }
    if (harGraa) {
      y += 5;
      prove(F.x, y, GRAA, null, 0.35);
      P.tekst(pt(F.x + 15), pt(y), 'Andre rør i prosjektet', { storrelse: 8, farge: SVAK });
    }
    if (harPlan && harMalt) {
      y += 6;
      prove(F.x, y, SVART, null, 0.6);
      P.tekst(pt(F.x + 15), pt(y), 'Heltrukken: innmålt', { storrelse: 8 });
      y += 4.5;
      prove(F.x, y, SVART, [pt(3), pt(1.6)], 0.6);
      P.tekst(pt(F.x + 15), pt(y), 'Stiplet: planlagt', { storrelse: 8 });
    }
    if (kummerHer.length) {
      y += 6;
      P.sirkel(pt(F.x + 6), pt(y - 1.2), pt(1.2), { fyll: [1, 1, 1], strek: SVART, tykkelse: pt(0.25) });
      P.tekst(pt(F.x + 15), pt(y), 'Kum', { storrelse: 8 });
    }
    if (harKoter) {
      const ekv = side.koter.ekvidistanse;
      y += 5;
      prove(F.x, y, KOTE, null, 0.25);
      P.tekst(pt(F.x + 15), pt(y), `Høydekote hver ${tall(ekv, desimaler(ekv))} m (terrengmodellen)`, { storrelse: 8 });
    }

    // ---- nordpil og målestokklinjal nederst i kolonnen
    const bunn = F.y + F.h;
    const nx = F.x + F.b - 8, ny = bunn - 34;
    P.sti([[pt(nx - 3), pt(ny + 8)], [pt(nx), pt(ny - 4)], [pt(nx + 3), pt(ny + 8)], [pt(nx), pt(ny + 5)]],
      { farge: SVART, fyll: SVART, tykkelse: pt(0.2) });
    P.tekst(pt(nx), pt(ny - 6), 'N', { storrelse: 9, fet: true, juster: 'm' });
    const meterPerMm = u.N / 1000;
    const L = rundtTall(meterPerMm * Math.min(40, F.b - 20));
    const lmm = L / meterPerMm;
    const ly = bunn - 22;
    P.rektangel(pt(F.x), pt(ly), pt(lmm / 2), pt(1.6), { fyll: SVART, strek: SVART, tykkelse: pt(0.2) });
    P.rektangel(pt(F.x + lmm / 2), pt(ly), pt(lmm / 2), pt(1.6), { fyll: [1, 1, 1], strek: SVART, tykkelse: pt(0.2) });
    P.tekst(pt(F.x), pt(ly - 1.2), '0', { storrelse: 7, juster: 'm' });
    P.tekst(pt(F.x + lmm), pt(ly - 1.2), `${tall(L)} m`, { storrelse: 7, juster: 'm' });
    const sone = data.sone || 32;
    P.tekst(pt(F.x), pt(bunn - 12), `EUREF89 UTM ${sone} (EPSG:${25800 + sone}) · rutenett-nord`, { storrelse: 6.5, farge: SVAK });
    P.tekst(pt(F.x), pt(bunn - 7.5), bakgrunn ? 'Kartgrunnlag © Kartverket' : 'Uten bakgrunnskart', { storrelse: 6.5, farge: SVAK });
    P.tekst(pt(F.x), pt(bunn - 3), `Massekalk · ${data.dato || ''} · side ${o.nr} av ${o.antall}`, { storrelse: 6.5, farge: SVAK });
  }

  /**
   * Hele PDF-en, ikke bygd: `await P.bygg()` gir bytene.
   * @param {object} data  se `tegnSide`
   * @param {object} valg  se `sider`; `tekst: false` – ingen rørtype langs rørene (på uten)
   * @param {Array} [sidene]  fra `sider` – bakgrunnen hentes for dem først
   * @param {Map<number, object>} [bakgrunner]  sidenummer (0…) → JPEG
   * @param {string} [merknad]  står i kartet når bakgrunnen mangler
   */
  function lagPdf(data, valg, sidene, bakgrunner, merknad) {
    const S = typeof PdfSkriver !== 'undefined' ? PdfSkriver : require('./pdfeksport.js').PdfSkriver;
    const R = typeof Rorlengde !== 'undefined' ? Rorlengde : require('./rorlengde.js');
    const opp = oppsett(valg.papir);
    const P = new S({ bredde: opp.papir.b * MM, hoyde: opp.papir.h * MM });
    const s = sidene || sider(data, valg);
    const farger = fargetabell(kodeinfo(data));
    /* LENGDEPROFILENE ETTER KARTENE. Stripene regnes først, så «side x av y»
       stemmer på kartene også. */
    const plassene = R.bokser(valg.papir);
    const striper = [];
    if (valg.profiler) {
      for (const p of data.profiler || []) {
        if (!(valg.koder || []).includes(p.kode)) continue;
        const f = farger.get(p.kode);
        const prof = Object.assign({}, p, { farge: f ? f.rgb : SVART });
        const deler = R.striper(prof, R.flateI(plassene[0]));
        deler.forEach((st, i) => striper.push({ p: prof, st, del: i + 1, deler: deler.length }));
      }
    }
    const antall = s.length + Math.ceil(striper.length / plassene.length);
    s.forEach((side, i) => tegnSide(P, side, data, farger, bakgrunner ? bakgrunner.get(i) || null : null,
      { nr: i + 1, antall, papir: valg.papir, merknad, tekst: valg.tekst !== false }));
    let nr = s.length;
    striper.forEach((x, i) => {
      const plass = i % plassene.length;
      if (plass === 0) {
        P.nySide();
        nr++;
        P.tekst(opp.papir.b * MM - 10 * MM, (opp.papir.h - 4) * MM,
          `Lengdeprofiler · ${data.prosjekt || ''} · Massekalk · ${data.dato || ''} · side ${nr} av ${antall}`,
          { storrelse: 6.5, farge: SVAK, juster: 'h' });
      }
      R.tegnStripe(P, x.p, x.st, plassene[plass], { del: x.del, deler: x.deler });
    });
    return P;
  }

  /**
   * Numrene rørene har i kartet og over lengdeprofilene: de valgte typene i
   * tegnforklaringens rekkefølge, det lengste røret først innenfor hver.
   * Setter `nr` på linjene og gir antallet.
   */
  function nummerer(data, koder, med = () => true) {
    const farger = fargetabell(kodeinfo(data));
    const orden = k => { const f = farger.get(k); return f ? [Object.keys(FAMILIER).indexOf(f.system), f.nr] : [99, 0]; };
    const valgte = new Set(koder || []);
    const liste = data.linjer.filter(l => valgte.has(l.kode) && med(l)).sort((a, b) => {
      const oa = orden(a.kode), ob = orden(b.kode);
      return oa[0] - ob[0] || oa[1] - ob[1] || (b.lengde || 0) - (a.lengde || 0);
    });
    for (const l of data.linjer) delete l.nr;
    liste.forEach((l, i) => { l.nr = i + 1; });
    return liste.length;
  }

  /** Kodene som har rør, med system og dimensjon – det fargetabellen trenger. */
  function kodeinfo(data) {
    const ut = {};
    for (const l of data.linjer) {
      if (ut[l.kode]) continue;
      const k = (data.koder && data.koder[l.kode]) || {};
      ut[l.kode] = { system: k.system || l.system || '', dim: +k.dim || +l.dim || 0 };
    }
    return ut;
  }

  return { MM, FAMILIER, MALESTOKKER, EKVIDISTANSER, TEKSTAVSTAND, fargetabell, utsnitt, tilPapir, flisplan, oppsett, sider, tegnSide, lagPdf,
    kodeinfo, omKode, rundtTall, tykkelse, velgEkvidistanse, terrengOpplosning, koter, forenkle, lagKoter, nummerer, midtpaa,
    flisnokler, fliserFor, boks, overlapper, plasserTekster };
})();

if (typeof module !== 'undefined') module.exports = Rorkart;
