'use strict';
/**
 * Utsnitt til stikning: et lite område av rørene som PDF – kartet med
 * nummererte punkt, og en tabell med koordinatene – så man kan stikke ut
 * selv, med et instrument eller et målebånd, uten å laste noe inn noe sted.
 *
 * HVORFOR. Stiknings-KOF-en dekker hele anlegget og trenger et instrument som
 * leser den. Den som skal sette ut tre kummer og en grøft bak et hus, trenger
 * ett ark med akkurat de punktene, tallene ved siden av, og et kart som viser
 * hvilket punkt som er hvilket.
 *
 * PUNKTENE:
 *   · stikk   – stikkpunktene langs et tegnet rør: knekkpunkt, hver 10. meter
 *               og endene, med topp rør, bunn innvendig og gravebunn. NAVNENE ER
 *               DE SAMME SOM I STIKNINGS-KOF-EN («3-007», der KOF-en har
 *               3-007T/B/G), så arket og fila kan brukes om hverandre.
 *   · kum     – kummene: bunnløp og lokk (terrenget).
 *   · innmalt – de innmålte punktene SLIK DE STÅR I FILA: nord, øst og høyde
 *               uendret, i fila sin UTM-sone. Står fila i en annen sone enn
 *               kartet, sier tabellen det på raden.
 *
 * Ren modul uten DOM: punktene og PDF-en. Skjermen er i ui-stikkutsnitt.js.
 */
const Stikkutsnitt = (() => {
  const _rk = () => (typeof Rorkart !== 'undefined' ? Rorkart : require('./rorkart.js'));
  const _pdf = () => (typeof PdfSkriver !== 'undefined' ? PdfSkriver : require('./pdfeksport.js').PdfSkriver);

  const SVART = [0.1, 0.1, 0.1], SVAK = [0.38, 0.38, 0.38], HVIT = [1, 1, 1], GRAA = [0.62, 0.62, 0.62];
  const INNMALT = [0.85, 0.35, 0.05];          // oransje ring – skiller det målte fra det tegnede
  /** Flere punkt enn dette blir et uleselig kart og en bok av en tabell. */
  const MAKS = 400;

  /** Punktene som ligger i boksen (meter, regnesonen). */
  function iBoks(punkter, boks) {
    return (punkter || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)
      && p.x >= boks.x0 && p.x <= boks.x1 && p.y >= boks.y0 && p.y <= boks.y1);
  }

  /**
   * Numrene på arket: stikkpunktene først (rør for rør, langs røret), så
   * kummene, så de innmålte (kode for kode). Samme rekkefølge i kartet og i
   * tabellen.
   */
  function nummerer(punkter) {
    const rang = { stikk: 0, kum: 1, innmalt: 2 };
    const ut = punkter.slice().sort((a, b) => (rang[a.type] - rang[b.type])
      || (a.ror || 0) - (b.ror || 0) || (a.rekke || 0) - (b.rekke || 0)
      || String(a.kode).localeCompare(String(b.kode), 'nb') || String(a.navn).localeCompare(String(b.navn), 'nb'));
    ut.forEach((p, i) => { p.nr = i + 1; });
    return ut;
  }

  const tall = (v, des) => (Number.isFinite(v) ? v.toFixed(des).replace('.', ',') : '');
  const mellomrom = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  /** Koordinat med tre desimaler og tusenskille: «6 600 123,456». */
  const koord = v => {
    if (!Number.isFinite(v)) return '';
    const [hel, br] = v.toFixed(3).split('.');
    return mellomrom(hel) + ',' + br;
  };

  /**
   * PDF-en, ikke bygd: `await P.bygg()` gir bytene. A4 liggende: side 1 er
   * kartet, de neste tabellen.
   *
   * @param {object} o
   *   prosjekt, dato, sone        – teksten på arket; sonen er kartets
   *   boks {x0,y0,x1,y1}          – det brukeren dro opp, i meter
   *   linjer, koder               – rørene, fra RorkartUI.samle
   *   punkter                     – fra `nummerer`
   *   bakgrunn                    – JPEG som dekker utsnittet, eller null
   *   utsnitt                     – fra `utsnittFor` (bakgrunnen er hentet for det)
   *   merknad                     – står i kartet når bakgrunnen mangler
   */
  function lagPdf(o) {
    const R = _rk(), MM = R.MM, pt = v => v * MM;
    const opp = R.oppsett('A4');
    const P = new (_pdf())({ bredde: opp.papir.b * MM, hoyde: opp.papir.h * MM });
    const K = opp.kart, F = opp.forklaring, u = o.utsnitt;
    const papir = R.tilPapir(u);
    const iKart = (x, y) => { const [mx, my] = papir(x, y); return [pt(K.x + mx), pt(K.y + my)]; };
    const farger = R.fargetabell(R.kodeinfo({ linjer: o.linjer, koder: o.koder }));
    const punkter = o.punkter || [];
    const RADER = 36;
    const sider = 1 + Math.ceil(punkter.length / RADER);

    // ---- kartet
    P.nySide();
    P.klipp(pt(K.x), pt(K.y), pt(K.b), pt(K.h), () => {
      if (o.bakgrunn) P.bilde(o.bakgrunn.bytes, o.bakgrunn.bredde, o.bakgrunn.hoyde, pt(K.x), pt(K.y), pt(K.b), pt(K.h));
      const linjer = (o.linjer || []).slice().sort((a, b) => (+b.dim || 0) - (+a.dim || 0));
      for (const l of linjer) {
        const f = farger.get(l.kode);
        P.sti(l.xy.map(q => iKart(q.x, q.y)), { farge: f ? f.rgb : SVART, tykkelse: pt(R.tykkelse(l.dim)),
          stiplet: l.kilde === 'planlagt' ? [pt(3), pt(1.6)] : null });
      }
      // området som ble valgt, stiplet – resten av kartet er bare sammenheng
      const b = o.boks;
      P.sti([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => iKart(x, y)),
        { farge: SVART, tykkelse: pt(0.35), stiplet: [pt(2.5), pt(1.5)], lukket: true });
      // punktene først, så numrene oppå – et nummer skal aldri dekkes av neste punkt
      for (const p of punkter) {
        const [x, y] = iKart(p.x, p.y);
        if (p.type === 'kum') {
          const r = Math.max(pt(1.1), pt(((p.diameter || 1000) / 2000) * 1000 / u.N));
          P.sirkel(x, y, r, { fyll: HVIT, strek: SVART, tykkelse: pt(0.3) });
        } else if (p.type === 'innmalt') {
          P.sirkel(x, y, pt(0.8), { fyll: HVIT, strek: INNMALT, tykkelse: pt(0.35) });
        } else {
          P.sirkel(x, y, pt(0.6), { fyll: SVART, strek: SVART, tykkelse: pt(0.1) });
        }
      }
      /* NUMMERET VED PUNKTET, i en av fire plasser rundt det – den første
         som ikke dekker et nummer som alt står. Står alle fire opptatt, står
         det likevel: et nummer som mangler er verre enn to som skrubber. */
      const satt = [];
      const ST = 5.5;
      for (const p of punkter) {
        const [x, y] = iKart(p.x, p.y);
        const tekst = String(p.nr), b2 = P.bredteAv(tekst, ST, true) + pt(0.8), h2 = pt(2.4);
        const forslag = [[x + pt(1), y - pt(1) - h2], [x + pt(1), y + pt(1)], [x - pt(1) - b2, y - pt(1) - h2], [x - pt(1) - b2, y + pt(1)]];
        const fri = forslag.find(([fx, fy]) => !satt.some(s => fx < s[0] + s[2] && s[0] < fx + b2 && fy < s[1] + s[3] && s[1] < fy + h2));
        const [fx, fy] = fri || forslag[0];
        satt.push([fx, fy, b2, h2]);
        P.rektangel(fx, fy, b2, h2, { fyll: HVIT });
        P.tekst(fx + b2 / 2, fy + h2 / 2, tekst, { storrelse: ST, fet: true, juster: 'm', loddrett: 'm',
          farge: p.type === 'innmalt' ? INNMALT : SVART });
      }
    });
    P.rektangel(pt(K.x), pt(K.y), pt(K.b), pt(K.h), { strek: SVART, tykkelse: pt(0.3) });
    if (!o.bakgrunn && o.merknad) {
      P.rektangel(pt(K.x + 1.5), pt(K.y + K.h - 6.2), P.bredteAv(o.merknad, 7) + pt(3), pt(4.6), { fyll: HVIT });
      P.tekst(pt(K.x + 3), pt(K.y + K.h - 3), o.merknad, { storrelse: 7, farge: SVAK });
    }

    // ---- kolonnen til høyre
    let y = F.y;
    const linje = (tekst, st, fet, farge = SVART, luft = 1.6) => {
      y += st / MM + luft;
      P.tekst(pt(F.x), pt(y), tekst, { storrelse: st, fet, farge });
    };
    const kort = (tekst, st, fet, maks) => {
      let s = String(tekst);
      if (P.bredteAv(s, st, fet) <= pt(maks)) return s;
      while (s.length > 1 && P.bredteAv(s + '…', st, fet) > pt(maks)) s = s.slice(0, -1);
      return s + '…';
    };
    linje(kort(o.prosjekt || 'Prosjekt', 13, true, F.b), 13, true, SVART, 2);
    linje('Utsnitt til stikning', 9, false, SVAK);
    y += 3;
    linje(`Målestokk 1:${mellomrom(String(u.N))} ved utskrift på A4`, 8, false, SVAK);
    const n = t => punkter.filter(p => p.type === t).length;
    linje(`${punkter.length} punkt i området`, 9, true);
    if (n('stikk')) linje(`${n('stikk')} stikkpunkt langs tegnede rør`, 7.5, false, SVAK, 1.2);
    if (n('kum')) linje(`${n('kum')} ${n('kum') === 1 ? 'kum' : 'kummer'}`, 7.5, false, SVAK, 1.2);
    if (n('innmalt')) linje(`${n('innmalt')} innmålte punkt`, 7.5, false, SVAK, 1.2);
    linje(`Koordinatene står på side 2${sider > 2 ? '–' + sider : ''}`, 7.5, false, SVAK, 1.2);
    y += 4;
    linje('Tegnforklaring', 9, true);
    const symbol = (tegn, tekst) => {
      y += 5;
      tegn(pt(F.x + 3), pt(y - 1.2));
      P.tekst(pt(F.x + 9), pt(y), tekst, { storrelse: 8 });
    };
    if (n('stikk')) symbol((x, yy) => P.sirkel(x, yy, pt(0.6), { fyll: SVART, strek: SVART, tykkelse: pt(0.1) }), 'Stikkpunkt (tegnet rør)');
    if (n('kum')) symbol((x, yy) => P.sirkel(x, yy, pt(1.1), { fyll: HVIT, strek: SVART, tykkelse: pt(0.3) }), 'Kum');
    if (n('innmalt')) symbol((x, yy) => P.sirkel(x, yy, pt(0.8), { fyll: HVIT, strek: INNMALT, tykkelse: pt(0.35) }), 'Innmålt punkt');
    symbol((x, yy) => P.sti([[x - pt(3), yy], [x + pt(3), yy]], { farge: SVART, tykkelse: pt(0.35), stiplet: [pt(1.5), pt(1)] }),
      'Området du valgte');
    // rørtypene i utsnittet
    const koder = [...new Set((o.linjer || []).map(l => l.kode))].slice(0, 12);
    if (koder.length) {
      y += 3;
      for (const k of koder) {
        const f = farger.get(k), l = o.linjer.find(x => x.kode === k);
        y += 4.4;
        P.sti([[pt(F.x), pt(y - 1.2)], [pt(F.x + 7), pt(y - 1.2)]], { farge: f ? f.rgb : SVART, tykkelse: pt(R.tykkelse(l && l.dim)),
          stiplet: l && l.kilde === 'planlagt' ? [pt(3), pt(1.6)] : null });
        P.tekst(pt(F.x + 9), pt(y), kort(k, 7.5, true, F.b - 9), { storrelse: 7.5, fet: true });
      }
    }
    // nordpil og målestokklinjal nederst, som i oversiktskartet
    const bunn = F.y + F.h;
    const nx = F.x + F.b - 8, ny = bunn - 34;
    P.sti([[pt(nx - 3), pt(ny + 8)], [pt(nx), pt(ny - 4)], [pt(nx + 3), pt(ny + 8)], [pt(nx), pt(ny + 5)]],
      { farge: SVART, fyll: SVART, tykkelse: pt(0.2) });
    P.tekst(pt(nx), pt(ny - 6), 'N', { storrelse: 9, fet: true, juster: 'm' });
    const meterPerMm = u.N / 1000, L = R.rundtTall(meterPerMm * Math.min(40, F.b - 20)), lmm = L / meterPerMm, ly = bunn - 22;
    P.rektangel(pt(F.x), pt(ly), pt(lmm / 2), pt(1.6), { fyll: SVART, strek: SVART, tykkelse: pt(0.2) });
    P.rektangel(pt(F.x + lmm / 2), pt(ly), pt(lmm / 2), pt(1.6), { fyll: HVIT, strek: SVART, tykkelse: pt(0.2) });
    P.tekst(pt(F.x), pt(ly - 1.2), '0', { storrelse: 7, juster: 'm' });
    P.tekst(pt(F.x + lmm), pt(ly - 1.2), `${mellomrom(String(L))} m`, { storrelse: 7, juster: 'm' });
    P.tekst(pt(F.x), pt(bunn - 12), `EUREF89 UTM ${o.sone} · høyder NN2000`, { storrelse: 6.5, farge: SVAK });
    P.tekst(pt(F.x), pt(bunn - 7.5), o.bakgrunn ? 'Kartgrunnlag © Kartverket' : 'Uten bakgrunnskart', { storrelse: 6.5, farge: SVAK });
    P.tekst(pt(F.x), pt(bunn - 3), `Massekalk · ${o.dato || ''} · side 1 av ${sider}`, { storrelse: 6.5, farge: SVAK });

    // ---- tabellen
    /* Kolonnene i millimeter fra venstre marg. Høyden står i tre kolonner for
       et tegnet rør (topp, bunn, gravebunn) og i «Topp/målt» for et innmålt –
       det er det maskinen målte, toppen av røret. */
    const kol = [['Nr', 0, 'h'], ['Type', 12, 'v'], ['Navn', 30, 'v'], ['Kode', 62, 'v'], ['Nord', 128, 'h'], ['Øst', 158, 'h'],
      ['Topp / målt', 180, 'h'], ['Bunn', 200, 'h'], ['Gravebunn', 222, 'h'], ['Merknad', 226, 'v']];
    const X0 = 10, H = opp.papir.h;
    const typeNavn = { stikk: 'Stikk', kum: 'Kum', innmalt: 'Innmålt' };
    for (let s = 0; s * RADER < punkter.length; s++) {
      P.nySide();
      let yy = 14;
      P.tekst(pt(X0), pt(yy), `${o.prosjekt || 'Prosjekt'} – utsnitt til stikning: koordinatene`, { storrelse: 11, fet: true });
      yy += 5;
      P.tekst(pt(X0), pt(yy), `EUREF89 UTM ${o.sone}, høyder NN2000 · stikkpunktene har navnene fra stiknings-KOF-en `
        + '(der med T, B og G for topp, bunn og gravebunn) · de innmålte står som i fila', { storrelse: 7, farge: SVAK });
      yy += 7;
      for (const [navn, x, j] of kol) {
        P.tekst(pt(X0 + x), pt(yy), navn, { storrelse: 7.5, fet: true, juster: j === 'h' ? 'h' : 'v' });
      }
      P.linje(pt(X0), pt(yy + 1.4), pt(opp.papir.b - 10), pt(yy + 1.4), { farge: SVART, tykkelse: pt(0.3) });
      yy += 1.4;
      for (const p of punkter.slice(s * RADER, (s + 1) * RADER)) {
        yy += 4.6;
        if (p.nr % 2 === 0) P.rektangel(pt(X0), pt(yy - 3.3), pt(opp.papir.b - 20), pt(4.6), { fyll: [0.95, 0.95, 0.95] });
        const verdier = [String(p.nr), typeNavn[p.type] || p.type, kort(p.navn || '', 7.5, false, 31), kort(p.kode || '', 7.5, false, 40),
          koord(p.n), koord(p.o), tall(p.topp, 3), tall(p.bunn, 3), tall(p.gravebunn, 3), kort(p.merknad || '', 7, false, 60)];
        verdier.forEach((v, i) => {
          const [, x, j] = kol[i];
          P.tekst(pt(X0 + x), pt(yy), v, { storrelse: i === 9 ? 7 : 7.5, juster: j === 'h' ? 'h' : 'v',
            farge: i === 9 ? SVAK : p.type === 'innmalt' && i === 0 ? INNMALT : SVART, fet: i === 0 });
        });
      }
      P.tekst(pt(opp.papir.b - 10), pt(H - 5), `Massekalk · ${o.dato || ''} · side ${s + 2} av ${sider}`,
        { storrelse: 6.5, farge: SVAK, juster: 'h' });
    }
    if (!punkter.length) {
      P.nySide();
      P.tekst(pt(X0), pt(20), 'Ingen punkt i området.', { storrelse: 11, fet: true, farge: GRAA });
    }
    return P;
  }

  /**
   * Utsnittet kartet tegnes i: det valgte området med litt luft, i en vanlig
   * målestokk – minst 1:200, så noen få meter ikke blir et bilde av én flis.
   */
  function utsnittFor(boks) {
    const R = _rk();
    const opp = R.oppsett('A4');
    return R.utsnitt(boks, { b: opp.kart.b, h: opp.kart.h }, { minSpenn: 20, marg: 0.06 });
  }

  return { MAKS, iBoks, nummerer, lagPdf, utsnittFor, koord };
})();

if (typeof module !== 'undefined') module.exports = Stikkutsnitt;
