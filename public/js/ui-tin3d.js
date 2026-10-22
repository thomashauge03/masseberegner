'use strict';
/**
 * Det innmålte terrenget i tre dimensjoner – FØR det godkjennes.
 *
 * Spørsmålet her er ett: hva er lagt til og hva er fjernet siden Kartverket
 * skannet? Det er samme bilde som tomta viser for en planert flate, bare med
 * DTM1 som «før» og punktene som «etter»: der punktene ligger over DTM1 er det
 * fylt (fyllingsgrønt), der de ligger under er det gravd (skjæringsrødt).
 * Derfor arver visningen alt fra Tomt3d – Ovenfra, Fly, Gå, Før/Endring/Etter,
 * lys og skygger – og bytter bare ut gitteret, avlesningen og tallene.
 *
 * DEN VIKTIGSTE REGELEN
 * Høydene kommer fra den samme flaten og den samme DTM1 som tallene i
 * Masser-fanen (`resultat.flate` og `resultat.dtm`). Utenfor punktene står
 * alltid DTM1, også når flaten er i bruk som terreng: dette er bildet av hva
 * punktene ENDRER, og det skal se likt ut før og etter godkjenningen.
 */

/** Under dette er flaten «uendret» i bildet – se gitteret. */
const UENDRET = 0.1;

const Tin3d = Object.assign(Object.create(Tomt3d), {
  // egne felt – se Tomt3d om hvorfor de ikke kan arves
  yaw: 0,
  pitch: 55,
  pitchHjem: 55,
  kontekst: 20,
  overdriv: 2,
  kamX: 0, kamY: 0,
  aktiv: false,
  /* MASSEN MALES HELT, OG TRÆRNE STÅR AV. Bildet skal svare på hva som er
     lagt til og fjernet. Med terrenget halvgjennomsiktig oppå ble tre meter
     fylling en blek grønnfarge, og grantrærne fra arealdekket rundt sto
     høyere enn hele fyllinga og dekket den. */
  fyldig: true,
  lag: { terreng: true, grav: true, fjell: false, overbygning: false, rutenett: false,
    grenser: true, andre: false, arealdekke: true,
    traer: false, skygger: true, himmel: true, ekte: true },

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tin3d');
    this.over = document.getElementById('tin3dover');
    if (!this.lerret) return this;
    this._musKobling();
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);
    return this;
  },

  _tomTekst() { return 'Les inn punktene, så kommer modellen her'; },

  _harData(res) { return !!(res && res.type === 'tin' && res.flate && res.flate.tri.length); },

  /** Tabellen eller modellen – de deler panelet under kartet. */
  aktiver(pa) {
    this.aktiv = !!pa;
    const vis = (id, synlig) => {
      const e = document.getElementById(id);
      if (e) e.classList.toggle('skjult', !synlig);
    };
    vis('tin3d', this.aktiv);
    vis('tin3dover', this.aktiv);
    vis('tinpunkter', !this.aktiv);
    vis('tin3dverktoy', this.aktiv);
    for (const [id, pa2] of [['tinVis3d', this.aktiv], ['tinVisTabell', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    if (!this.aktiv && this.modus === 'bakken') this.settModus('oversikt', true);
    // modellen fyller arbeidsflaten, som tomtas – se App.stort3d
    if (this.app.stort3d) this.app.stort3d('tin', this.aktiv);
    if (this.aktiv) { this._maaRammes = true; this.tegn(); }
  },

  /** Glem gitteret – punktene, et utelatt punkt eller kanten er endret. */
  glem() { this._gitterFor = null; this._skalaSatt = false; },

  /**
   * Gitteret: DTM1 som terreng, punktene som «gravflate».
   *
   * Innenfor ytterkanten er `zT` DTM1 og `zP` flaten, og `d = zT − zP` – samme
   * fortegn som tomta: positivt er fjernet (skjæring), negativt er lagt til
   * (fylling). Utenfor er det bare DTM1, som ramme.
   */
  _gitter(steg) {
    const res = this.app && this.app.resultat;
    if (!this._harData(res)) return null;
    if (this._gitterFor === res && this._gitterSteg === steg) return this._gitterBuffer;
    const f = res.flate, dtm = res.dtm;
    const A = Math.max(1, res.tin.areal);
    // rundt 40 000 noder over selve flaten, aldri finere enn 0,25 m
    const rute = Math.max(0.25, Math.sqrt(A / 40000)) * steg;
    const B = f.boks, marg = Math.max(0, this.kontekst || 0);
    const minX = B.minE - marg, minY = B.minN - marg, maksX = B.maksE + marg, maksY = B.maksN + marg;
    const nb = Math.round((maksX - minX) / rute) + 1;
    const nh = Math.round((maksY - minY) / rute) + 1;
    if (!(nb > 1 && nh > 1) || nb * nh > 4e6) return null;
    const n = nb * nh;
    const zT = new Float32Array(n), zP = new Float32Array(n), zF = new Float32Array(n);
    const zFerdig = new Float32Array(n), harFerdig = new Uint8Array(n);
    const finnes = new Uint8Array(n), harGrav = new Uint8Array(n), utenGrav = new Uint8Array(n);
    const inne = new Uint8Array(n), usikker = new Uint8Array(n), d = new Float32Array(n);
    const wx = new Float64Array(n), wy = new Float64Array(n);
    let lav = Infinity, hoy = -Infinity, maksAvvik = 0, hoppet = 0, iKontekst = 0, celler = 0;
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i, x = minX + i * rute, y = minY + j * rute;
        wx[k] = x; wy[k] = y;
        const g = dtm(x, y);
        if (!Number.isFinite(g)) { hoppet++; continue; }
        finnes[k] = 1; zT[k] = g; zF[k] = g - 0.5;
        const z = Triangulering.hoyde(f, x, y);
        if (Number.isFinite(z)) {
          inne[k] = 1; zP[k] = z; d[k] = g - z; celler++;
          /* INNENFOR ±0,1 M ER DET IKKE ENDRET – DET ER DTM1 SIN USIKKERHET.
             Malt som masse ble hver centimeter støy like rød eller grønn som tre
             meter fylling, og den urørte delen av flaten så ut som et stort
             gravd felt. Der står den som vanlig bakke. */
          if (Math.abs(d[k]) >= UENDRET) harGrav[k] = 1; else utenGrav[k] = 1;
          maksAvvik = Math.max(maksAvvik, Math.abs(d[k]));
          lav = Math.min(lav, z); hoy = Math.max(hoy, z);
        } else {
          utenGrav[k] = 1; zP[k] = g; iKontekst++;
        }
        lav = Math.min(lav, g); hoy = Math.max(hoy, g);
      }
    }
    if (!Number.isFinite(lav)) return null;
    const zEtter = new Float32Array(n);
    for (let k = 0; k < n; k++) zEtter[k] = zP[k];
    const g = {
      nb, nh, rute, minX, minY, lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
      utenGrav, zEtter,
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      wx, wy, zT, zP, zF, zFerdig, harFerdig, harGrav, d, finnes, inne, usikker,
      hoppet, iKontekst, totalt: n, celler
    };
    this._gitterFor = res; this._gitterSteg = steg; this._gitterBuffer = g;
    return g;
  },

  _avlesning(g, kk) {
    const t2 = (v, dd = 0) => Rapport.tall(v, dd);
    const dd = g.d[kk];
    if (!g.inne[kk]) return [`DTM1 ${t2(g.zT[kk], 2)} · utenfor punktene`, `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`];
    if (!g.harGrav[kk]) return [`DTM1 ${t2(g.zT[kk], 2)} · innmålt ${t2(g.zP[kk], 2)}`,
      `Uendret (innenfor ±${t2(UENDRET, 1)} m)`, `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`];
    return [
      `DTM1 ${t2(g.zT[kk], 2)} · innmålt ${t2(g.zP[kk], 2)}`,
      dd <= 0 ? `Lagt til ${t2(-dd, 2)} m` : `Fjernet ${t2(dd, 2)} m`,
      `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`
    ];
  },

  _hudLinjer(g) {
    const res = this.app.resultat;
    const t2 = (v, dd = 0) => Rapport.tall(v, dd);
    if (!res || res.type !== 'tin') return [];
    const s = res.tin;
    return [
      `${t2(s.fyll)} m³ lagt til · ${t2(s.skjæring)} m³ fjernet · netto ${t2(s.netto)} m³ mot DTM1`,
      `${t2(s.areal)} m² innmålt · største fyllhøyde ${t2(s.maksFyll, 2)} m`
        + (this.app.P.tin && this.app.P.tin.bruk ? ' · godkjent som terreng' : ' · ikke godkjent ennå')
    ];
  },

  /** Ytterkanten og punktene, liggende på flaten. */
  _overleggEkstra(k, g, kam, skjerm) {
    if (!this.lag.grenser) return;
    const res = this.app.resultat;
    if (!res || res.type !== 'tin') return;
    const f = res.flate;
    const visEtter = this.visning !== 'foer';
    const z = p => visEtter ? p.z : res.dtm(p.e, p.n);
    k.strokeStyle = Farger.veg; k.lineWidth = 2;
    const ring = f.kant.map(i => ({ x: f.punkter[i].e, y: f.punkter[i].n, z: z(f.punkter[i]) }));
    if (ring.length > 2) { ring.push(ring[0]); this._verdensstrek(k, ring); }
  },
});

if (typeof module !== 'undefined') module.exports = Tin3d;
