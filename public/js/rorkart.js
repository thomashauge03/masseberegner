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
  const GRAA = [0.62, 0.62, 0.62];
  const SVART = [0.1, 0.1, 0.1];
  const SVAK = [0.38, 0.38, 0.38];

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
   * @param {{nr, antall, papir, merknad?}} o
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

    // ---- kartflaten
    P.klipp(pt(K.x), pt(K.y), pt(K.b), pt(K.h), () => {
      if (bakgrunn) P.bilde(bakgrunn.bytes, bakgrunn.bredde, bakgrunn.hoyde, pt(K.x), pt(K.y), pt(K.b), pt(K.h));
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
      }
    });
    P.rektangel(pt(K.x), pt(K.y), pt(K.b), pt(K.h), { strek: SVART, tykkelse: pt(0.3) });
    /* Det som mangler, står i kartet – også når bare noen fliser ble borte.
       Hvite ruter i bakgrunnen uten et ord ser ut som et kart med hull i
       terrenget. */
    const notis = !bakgrunn ? o.merknad
      : bakgrunn.mangler ? `${bakgrunn.mangler} av ${bakgrunn.av} fliser i bakgrunnskartet manglet` : null;
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
    const ekstra = (harGraa ? 5 : 0) + (harPlan && harMalt ? 10.5 : 0) + (kummerHer.length ? 6 : 0);
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
   * @param {object} valg  se `sider`
   * @param {Array} [sidene]  fra `sider` – bakgrunnen hentes for dem først
   * @param {Map<number, object>} [bakgrunner]  sidenummer (0…) → JPEG
   * @param {string} [merknad]  står i kartet når bakgrunnen mangler
   */
  function lagPdf(data, valg, sidene, bakgrunner, merknad) {
    const S = typeof PdfSkriver !== 'undefined' ? PdfSkriver : require('./pdfeksport.js').PdfSkriver;
    const opp = oppsett(valg.papir);
    const P = new S({ bredde: opp.papir.b * MM, hoyde: opp.papir.h * MM });
    const s = sidene || sider(data, valg);
    const farger = fargetabell(kodeinfo(data));
    s.forEach((side, i) => tegnSide(P, side, data, farger, bakgrunner ? bakgrunner.get(i) || null : null,
      { nr: i + 1, antall: s.length, papir: valg.papir, merknad }));
    return P;
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

  return { MM, FAMILIER, MALESTOKKER, fargetabell, utsnitt, tilPapir, flisplan, oppsett, sider, tegnSide, lagPdf,
    kodeinfo, omKode, rundtTall, tykkelse };
})();

if (typeof module !== 'undefined') module.exports = Rorkart;
