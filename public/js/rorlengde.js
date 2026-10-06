'use strict';
/**
 * Lengdeprofilene til oversiktskartet: terrenget og røret under det, for hvert
 * rør, med et tallbånd under tegningen. Det er tegningen arbeidslaget leser
 * dybden av – kartet sier hvor røret går, profilen hvor dypt.
 *
 * Ren modul: den får profilene ferdig regnet (stasjoner, topp og bunn,
 * terrenget langs røret) og tegner på en PdfSkriver. Mål er i millimeter her
 * inne, y nedover, og gjøres om til punkt der PdfSkriver kalles.
 */
const Rorlengde = (() => {
  const MM = 72 / 25.4;
  const SVART = [0.1, 0.1, 0.1], SVAK = [0.4, 0.4, 0.4], RUTE = [0.85, 0.85, 0.85];
  const TERRENG = [0.45, 0.3, 0.15], HVIT = [1, 1, 1];
  const LENGDESKALA = [200, 250, 500, 1000, 2000, 2500, 5000];
  const HOYDESKALA = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const pt = v => v * MM;

  const tall = (v, des = 2) => {
    if (!Number.isFinite(v)) return '–';
    const s = (Math.round(v * Math.pow(10, des)) / Math.pow(10, des)).toFixed(des);
    return s.replace('-', '−').replace('.', ',');
  };

  /** Verdien i stasjon s langs en liste [{s, z}] – lineært, NaN utenfor eller i et hull. */
  function verdiVed(liste, s) {
    if (!liste.length || s < liste[0].s - 1e-9 || s > liste[liste.length - 1].s + 1e-9) return NaN;
    let lo = 0, hi = liste.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (liste[m].s <= s) lo = m; else hi = m; }
    const a = liste[lo], b = liste[hi];
    if (b.s - a.s < 1e-9) return a.z;
    return a.z + (b.z - a.z) * (s - a.s) / (b.s - a.s);
  }

  /**
   * Stripene en profil tegnes i: lengdemålestokken fra rekka, så røret får
   * plass i bredden – og er det for langt selv i 1:5000, deles det. Høyden er
   * overdrevet ti ganger, eller mindre om høydeforskjellen ikke får plass.
   *
   * @param {object} p  { lengde, terreng:[{s,z}], topp:[{s,z}], bunn:[{s,z}] }
   * @param {{b:number, h:number}} flate  tegneflaten i mm
   * @returns {Array<{fra, til, N, Nv, zMin, zMaks}>}
   */
  function striper(p, flate) {
    const L = Math.max(p.lengde, 1);
    let N = LENGDESKALA.find(n => L * 1000 / n <= flate.b);
    let deler;
    if (N) deler = [[0, L]];
    else {
      N = LENGDESKALA[LENGDESKALA.length - 1];
      // like lange biter – ikke en full stripe og en stump på én meter
      const n = Math.ceil(L / (flate.b * N / 1000)), bit = L / n;
      deler = Array.from({ length: n }, (_, i) => [i * bit, i === n - 1 ? L : (i + 1) * bit]);
    }
    return deler.map(([fra, til]) => {
      let zMin = Infinity, zMaks = -Infinity;
      for (const liste of [p.terreng, p.topp, p.bunn]) {
        for (const q of medKant(liste, fra, til)) {
          if (!Number.isFinite(q.z)) continue;
          zMin = Math.min(zMin, q.z); zMaks = Math.max(zMaks, q.z);
        }
      }
      if (!Number.isFinite(zMin)) { zMin = 0; zMaks = 1; }
      // en halv meter luft over og under – kummens bunn og terrenget skal ikke ligge i kanten
      zMin -= 0.5; zMaks += 0.5;
      let i = HOYDESKALA.findIndex(n => n >= N / 10);
      if (i < 0) i = HOYDESKALA.length - 1;
      /* ALDRI MINDRE MÅLESTOKK I HØYDEN ENN I LENGDEN: en bratt profil ble
         «1:200, høyde 1:500 (0× overdrevet)». */
      while (i < HOYDESKALA.length - 1 && HOYDESKALA[i + 1] <= N && (zMaks - zMin) * 1000 / HOYDESKALA[i] > flate.h) i++;
      const Nv = HOYDESKALA[i];
      /* Får høydeforskjellen likevel ikke plass, vises stykket rundt røret –
         resten klippes, og aksen merker bare det som står i rammen. */
      const plass = flate.h * Nv / 1000;
      if (zMaks - zMin > plass) {
        const ror = medKant(p.topp, fra, til).concat(medKant(p.bunn, fra, til)).map(q => q.z).filter(Number.isFinite);
        const midt = ror.length ? (Math.min(...ror) + Math.max(...ror)) / 2 : (zMin + zMaks) / 2;
        zMin = midt - plass / 2; zMaks = midt + plass / 2;
      }
      return { fra, til, N, Nv, zMin, zMaks };
    });
  }

  /**
   * Punktene i lista som ligger i stripa – med et punkt lagt inn på hver kant.
   * En stripe begynner og slutter gjerne midt mellom to punkt, og uten kantene
   * manglet røret fra det siste punktet før kanten: et rør på 2 km med knekk
   * hver 500. m sto uten rør i hele den andre stripa.
   */
  function medKant(liste, fra, til) {
    const ut = liste.filter(q => q.s > fra + 1e-9 && q.s < til - 1e-9);
    const a = verdiVed(liste, fra), b = verdiVed(liste, til);
    if (Number.isFinite(a)) ut.unshift({ s: fra, z: a });
    if (Number.isFinite(b)) ut.push({ s: til, z: b });
    return ut;
  }

  // desimalene et steg trenger: 2,5 er ikke «3», og 0,25 ikke «0,3»
  const desimaler = v => (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9 ? 2 : Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0);

  /**
   * Stasjonene i tallbåndet. Endene og kummene først – det er der tallene
   * trengs mest – og så stegene der det er plass til dem. Her vant stasjonen
   * som kom først: ved 20 m sto 20, og kummen på 20,5 ble borte.
   * @param {number} mmPerM  millimeter på papiret per meter langs røret
   */
  function bandstasjoner(p, st, sSteg, mmPerM, minst = 11) {
    const ut = [];
    const ledig = s => ut.every(x => Math.abs(x - s) * mmPerM >= minst);
    const kummer = (p.kummer || []).map(k => k.s).filter(s => s >= st.fra - 1e-9 && s <= st.til + 1e-9);
    for (const s of [st.fra, st.til].concat(kummer.sort((a, b) => a - b))) if (ledig(s)) ut.push(s);
    for (let s = Math.ceil(st.fra / sSteg - 1e-9) * sSteg; s <= st.til + 1e-9; s += sSteg) if (ledig(s)) ut.push(s);
    return ut.sort((a, b) => a - b);
  }

  /** Et rundt steg for et spenn: 1, 2, 2,5 eller 5 ganger en tierpotens, så det blir om lag `antall` steg. */
  function steg(spenn, antall) {
    const grov = spenn / Math.max(1, antall), p = Math.pow(10, Math.floor(Math.log10(grov)));
    for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= grov) return f * p;
    return 10 * p;
  }

  /**
   * Tegner én stripe i en boks på siden.
   * @param {PdfSkriver} P
   * @param {object} p  profilen: { nr, kode, kilde, dim, farge, lengde, terreng, topp, bunn, kummer:[{s, navn}], fall }
   * @param {object} st  fra `striper`
   * @param {{x, y, b, h}} boks  mm, y fra toppen av siden
   * @param {{del?:number, deler?:number}} [o]
   */
  function tegnStripe(P, p, st, boks, o = {}) {
    const venstre = 24, band = 27, topp = 10;
    const T = { x: boks.x + venstre, y: boks.y + topp, b: boks.b - venstre - 2, h: boks.h - topp - band - 4 };
    const xAv = s => T.x + (s - st.fra) * 1000 / st.N;
    const yAv = z => T.y + T.h - (z - st.zMin) * 1000 / st.Nv;
    // ---- tittelen
    const del = o.deler > 1 ? ` · del ${o.del} av ${o.deler}` : '';
    const navn = `${p.kode} · ${p.nr}`;
    P.tekst(pt(boks.x), pt(boks.y + 5), navn, { storrelse: 10, fet: true });
    // fallet i fallretningen – motfall står som minus, og sies
    const fall = p.fall ? ` · fall ${tall(p.fall.min, 1)}–${tall(p.fall.maks, 1)} ‰${p.fall.min < 0 ? ' (motfall)' : ''}` : '';
    const overdrevet = st.N / st.Nv > 1 + 1e-9 ? `${tall(st.N / st.Nv, desimaler(st.N / st.Nv))}× overdrevet` : 'ikke overdrevet';
    P.tekst(pt(boks.x) + P.bredteAv(navn, 10, true) + pt(3), pt(boks.y + 5),
      `${tall(p.lengde, 1)} m · ${p.kilde === 'planlagt' ? 'planlagt' : 'innmålt'}${fall}${del}`
      + ` · lengde 1:${st.N}, høyde 1:${st.Nv} (${overdrevet})`, { storrelse: 7.5, farge: SVAK });
    // ---- rutenettet: høydene til venstre, stasjonene langs bunnen
    const zSteg = steg(st.zMaks - st.zMin, 6);
    const sSteg = steg(Math.max(1, st.til - st.fra), Math.max(2, Math.floor(T.b / 18)));
    P.klipp(pt(T.x), pt(T.y), pt(T.b), pt(T.h), () => {
      for (let z = Math.ceil(st.zMin / zSteg) * zSteg; z <= st.zMaks + 1e-9; z += zSteg) {
        P.linje(pt(T.x), pt(yAv(z)), pt(T.x + T.b), pt(yAv(z)), { farge: RUTE, tykkelse: pt(0.1) });
      }
      for (let s = Math.ceil(st.fra / sSteg) * sSteg; s <= st.til + 1e-9; s += sSteg) {
        P.linje(pt(xAv(s)), pt(T.y), pt(xAv(s)), pt(T.y + T.h), { farge: RUTE, tykkelse: pt(0.1) });
      }
      // ---- røret: fylt mellom topp og bunn innvendig, i sin farge
      const bit = liste => medKant(liste, st.fra, st.til).filter(q => Number.isFinite(q.z));
      const t = bit(p.topp), b = bit(p.bunn);
      if (t.length > 1 && b.length > 1) {
        const lys = p.farge.map(v => v + (1 - v) * 0.6);
        P.sti(t.map(q => [pt(xAv(q.s)), pt(yAv(q.z))]).concat(b.slice().reverse().map(q => [pt(xAv(q.s)), pt(yAv(q.z))])),
          { farge: p.farge, fyll: lys, tykkelse: pt(0.25) });
      }
      // ---- terrenget, med brudd der modellen mangler data
      let bue = [];
      const tegnBue = () => { if (bue.length > 1) P.sti(bue, { farge: TERRENG, tykkelse: pt(0.35) }); bue = []; };
      for (const q of medKant(p.terreng, st.fra, st.til)) {
        if (!Number.isFinite(q.z)) { tegnBue(); continue; }
        bue.push([pt(xAv(q.s)), pt(yAv(q.z))]);
      }
      tegnBue();
      // ---- kummene: loddrett fra terrenget ned til bunnen av kumgropa
      for (const k of p.kummer || []) {
        if (k.s < st.fra - 1e-9 || k.s > st.til + 1e-9) continue;
        const zt = verdiVed(p.terreng, k.s), zb = verdiVed(p.bunn, k.s);
        if (!Number.isFinite(zt) || !Number.isFinite(zb)) continue;
        P.linje(pt(xAv(k.s)), pt(yAv(zt)), pt(xAv(k.s)), pt(yAv(zb - 0.25)), { farge: SVART, tykkelse: pt(0.5) });
        P.tekst(pt(xAv(k.s)), pt(yAv(zt) - 1.5), k.navn ? `Kum ${k.navn}` : 'Kum', { storrelse: 6.5, juster: 'm' });
      }
    });
    P.rektangel(pt(T.x), pt(T.y), pt(T.b), pt(T.h), { strek: SVAK, tykkelse: pt(0.2) });
    // bare høydene som står i rammen
    for (let z = Math.ceil(st.zMin / zSteg) * zSteg; z <= st.zMaks + 1e-9; z += zSteg) {
      if (yAv(z) < T.y - 0.1 || yAv(z) > T.y + T.h + 0.1) continue;
      P.tekst(pt(T.x - 1.5), pt(yAv(z) + 1), tall(z, desimaler(zSteg)), { storrelse: 6.5, farge: SVAK, juster: 'h' });
    }
    // ---- tallbåndet: profil, terreng, topp, bunn, overdekning
    const raderNavn = ['Profil', 'Terreng', 'Topp rør', 'Bunn innv.', 'Overdekning'];
    const by = T.y + T.h + 3, rad = 5;
    raderNavn.forEach((n, i) => {
      P.tekst(pt(boks.x), pt(by + rad * i + 3.6), n, { storrelse: 6.5, fet: i === 0, farge: i === 0 ? SVART : SVAK });
      P.linje(pt(boks.x), pt(by + rad * (i + 1)), pt(T.x + T.b), pt(by + rad * (i + 1)), { farge: RUTE, tykkelse: pt(0.1) });
    });
    for (const s of bandstasjoner(p, st, sSteg, 1000 / st.N)) {
      const zt = verdiVed(p.terreng, s), zo = verdiVed(p.topp, s), zb = verdiVed(p.bunn, s);
      const x = pt(xAv(s));
      const verdier = [tall(s, s % 1 ? 1 : 0), tall(zt), tall(zo), tall(zb), tall(zt - zo)];
      verdier.forEach((v, i) => P.tekst(x, pt(by + rad * i + 3.6), v, { storrelse: 6.5, fet: i === 0, juster: 'm' }));
      P.linje(x, pt(T.y + T.h), x, pt(T.y + T.h + 1.5), { farge: SVAK, tykkelse: pt(0.2) });
    }
  }

  /**
   * Hvor mange striper som får plass på en side, og boksene deres.
   * A3 liggende: to over hverandre. A4 liggende: én.
   */
  function bokser(papir) {
    const A3 = papir !== 'A4', B = A3 ? 420 : 297, H = A3 ? 297 : 210, marg = 10, bunn = 9;
    const antall = A3 ? 2 : 1, mellom = 6;
    const h = (H - 2 * marg - bunn - mellom * (antall - 1)) / antall;
    return Array.from({ length: antall }, (_, i) => ({ x: marg, y: marg + i * (h + mellom), b: B - 2 * marg, h }));
  }

  /** Tegneflaten i en boks – det `striper` skal få plass i. */
  const flateI = boks => ({ b: boks.b - 26, h: boks.h - 41 });

  return { striper, tegnStripe, bokser, flateI, verdiVed, steg, medKant, bandstasjoner, LENGDESKALA, HOYDESKALA };
})();

if (typeof module !== 'undefined') module.exports = Rorlengde;
