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
    const deler = [];
    if (N) deler.push([0, L]);
    else {
      N = LENGDESKALA[LENGDESKALA.length - 1];
      const bit = flate.b * N / 1000;
      for (let s = 0; s < L - 1e-6; s += bit) deler.push([s, Math.min(L, s + bit)]);
    }
    return deler.map(([fra, til]) => {
      let zMin = Infinity, zMaks = -Infinity;
      for (const liste of [p.terreng, p.topp, p.bunn]) {
        for (const q of liste) {
          if (q.s < fra - 1e-9 || q.s > til + 1e-9 || !Number.isFinite(q.z)) continue;
          zMin = Math.min(zMin, q.z); zMaks = Math.max(zMaks, q.z);
        }
      }
      if (!Number.isFinite(zMin)) { zMin = 0; zMaks = 1; }
      // en halv meter luft over og under – kummens bunn og terrenget skal ikke ligge i kanten
      zMin -= 0.5; zMaks += 0.5;
      let i = HOYDESKALA.findIndex(n => n >= N / 10);
      if (i < 0) i = HOYDESKALA.length - 1;
      while (i < HOYDESKALA.length - 1 && (zMaks - zMin) * 1000 / HOYDESKALA[i] > flate.h) i++;
      return { fra, til, N, Nv: HOYDESKALA[i], zMin, zMaks };
    });
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
    const fall = p.fall ? ` · fall ${tall(p.fall.min, 1)}–${tall(p.fall.maks, 1)} ‰` : '';
    P.tekst(pt(boks.x) + P.bredteAv(navn, 10, true) + pt(3), pt(boks.y + 5),
      `${tall(p.lengde, 1)} m · ${p.kilde === 'planlagt' ? 'planlagt' : 'innmålt'}${fall}${del}`
      + ` · lengde 1:${st.N}, høyde 1:${st.Nv} (${tall(st.N / st.Nv, 0)}× overdrevet)`, { storrelse: 7.5, farge: SVAK });
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
      const bit = liste => liste.filter(q => q.s >= st.fra - 1e-9 && q.s <= st.til + 1e-9 && Number.isFinite(q.z));
      const t = bit(p.topp), b = bit(p.bunn);
      if (t.length > 1 && b.length > 1) {
        const lys = p.farge.map(v => v + (1 - v) * 0.6);
        P.sti(t.map(q => [pt(xAv(q.s)), pt(yAv(q.z))]).concat(b.slice().reverse().map(q => [pt(xAv(q.s)), pt(yAv(q.z))])),
          { farge: p.farge, fyll: lys, tykkelse: pt(0.25) });
      }
      // ---- terrenget, med brudd der modellen mangler data
      let bue = [];
      const tegnBue = () => { if (bue.length > 1) P.sti(bue, { farge: TERRENG, tykkelse: pt(0.35) }); bue = []; };
      for (const q of p.terreng) {
        if (q.s < st.fra - 1e-9 || q.s > st.til + 1e-9) continue;
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
    for (let z = Math.ceil(st.zMin / zSteg) * zSteg; z <= st.zMaks + 1e-9; z += zSteg) {
      P.tekst(pt(T.x - 1.5), pt(yAv(z) + 1), tall(z, zSteg < 1 ? 1 : 0), { storrelse: 6.5, farge: SVAK, juster: 'h' });
    }
    // ---- tallbåndet: profil, terreng, topp, bunn, overdekning
    const raderNavn = ['Profil', 'Terreng', 'Topp rør', 'Bunn innv.', 'Overdekning'];
    const by = T.y + T.h + 3, rad = 5;
    raderNavn.forEach((n, i) => {
      P.tekst(pt(boks.x), pt(by + rad * i + 3.6), n, { storrelse: 6.5, fet: i === 0, farge: i === 0 ? SVART : SVAK });
      P.linje(pt(boks.x), pt(by + rad * (i + 1)), pt(T.x + T.b), pt(by + rad * (i + 1)), { farge: RUTE, tykkelse: pt(0.1) });
    });
    /* Stasjonene i båndet: stegene, endene og kummene – men aldri så tett at
       tallene går i hverandre. En stasjon for nær den forrige hoppes over. */
    const kandidater = [st.fra, st.til].concat((p.kummer || []).map(k => k.s).filter(s => s >= st.fra && s <= st.til));
    for (let s = Math.ceil(st.fra / sSteg) * sSteg; s <= st.til + 1e-9; s += sSteg) kandidater.push(s);
    const stasjoner = [];
    for (const s of kandidater.sort((a, c) => a - c)) {
      if (stasjoner.length && (xAv(s) - xAv(stasjoner[stasjoner.length - 1])) < 11) continue;
      stasjoner.push(s);
    }
    for (const s of stasjoner) {
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

  return { striper, tegnStripe, bokser, flateI, verdiVed, steg, LENGDESKALA, HOYDESKALA };
})();

if (typeof module !== 'undefined') module.exports = Rorlengde;
