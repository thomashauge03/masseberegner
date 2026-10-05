'use strict';
/**
 * Rørene i tre dimensjoner.
 *
 * Terrenget legges i en korridor rundt rørene, og rørene tegnes som streker
 * oppå. De ligger under bakken, så bildet er en røntgen: man ser gjennom marka
 * ned til dem. Loddrette staker fra terrenget ned til toppen av røret i hvert
 * målte punkt gjør dybden synlig – uten dem er en strek under bakken og en
 * strek på bakken det samme bildet.
 *
 * ARVER FRA TOMT3D, IKKE DIREKTE FRA TEGNER3D.
 * Gitteret er et rett rutenett i UTM akkurat som tomtas, og alt som har med å
 * stå og gå på det å gjøre – gulvet, startpunktet, skrittene – er det samme.
 * Det som er tomtas eget – lagene, overlegget, tallene – er skrevet over her.
 * Feltene under er EGNE, av samme grunn som Tomt3d sier: et objekt på
 * prototypen ville vært delt mellom visningene.
 */
const Ror3d = Object.assign(Object.create(Tomt3d), {
  yaw: 0,
  pitch: 50,
  pitchHjem: 50,
  kontekst: 40,
  /* To ganger fra start: et rør to meter under en li er ellers en strek som
     nesten ligger i bakken. Valget står i verktøylinja. */
  overdriv: 2,
  kamX: 0, kamY: 0,
  lag: { terreng: true, staker: true, arealdekke: false, andre: false, groft: false },

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('ror3d');
    this.over = document.getElementById('ror3dover');
    if (!this.lerret) return this;
    this._musKobling();
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);
    return this;
  },

  _tomTekst() { return 'Importer en rørfil, så kommer rørene her'; },

  /** Profil eller 3D i rørpanelet – samme bryter som tomtpanelet har. */
  aktiver(pa) {
    this.aktiv = !!pa;
    const vis = (id, synlig) => { const e = document.getElementById(id); if (e) e.classList.toggle('skjult', !synlig); };
    vis('ror3d', this.aktiv);
    vis('ror3dover', this.aktiv);
    vis('rorprofil', !this.aktiv);
    // avlesningen hører til profilen; 3D har sin egen boks under musa
    vis('rorEtikett', !this.aktiv);
    vis('ror3dverktoy', this.aktiv);
    vis('rorprofilverktoy', !this.aktiv);
    for (const [id, pa2] of [['rorVis3d', this.aktiv], ['rorVisProfil', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    if (!this.aktiv && this.modus === 'bakken') this.settModus('oversikt', true);
    if (this.app.stort3d) this.app.stort3d('ror', this.aktiv);
    if (this.aktiv) this.tegn(); else Rorprofil.tegn();
    // rammes inn når lerretet har fått sin nye størrelse – se Tomt3d.aktiver
    if (this.aktiv) this._maaRammes = true;
  },

  _harData(res) { return !!(res && res.type === 'ror' && res.linjer && res.linjer.length); },

  /**
   * Terrenget i en korridor rundt rørene, som et rett rutenett i UTM.
   *
   * Bare nodene innenfor `kontekst` meter fra et rør får høyde; resten står
   * uten (`finnes` = 0) og tegnes ikke. Et rektangel rundt et rørnett på
   * 800 × 200 m ville ellers vært mest skog ingen spurte om, og kostet
   * tegningen like mye som det som betyr noe.
   *
   * `lav` tar med bunnen av rørene. Kameraet rammer inn etter `lav` og `hoy`,
   * og uten den lå rørene under bunnen av det som ble rammet inn.
   */
  _gitter(steg) {
    const app = this.app, res = app && app.resultat;
    if (!this._harData(res)) return null;
    if (this._gitterFor === res && this._gitterSteg === steg && this._gitterKontekst === this.kontekst) {
      return this._gitterBuffer;
    }
    const terr = app.terreng;
    const r = app.P.ror;
    const marg = Math.max(2, this.kontekst || 0);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity, rorLav = Infinity;
    for (const l of res.linjer) {
      const kd = r.koder[l.kode] || Ror.tolkKode(l.kode);
      const D = (kd.dim || 0) / 1000;
      l.xy.forEach((q, i) => {
        minX = Math.min(minX, q.x); maksX = Math.max(maksX, q.x);
        minY = Math.min(minY, q.y); maksY = Math.max(maksY, q.y);
        rorLav = Math.min(rorLav, l.punkter[i].z - D);
      });
    }
    minX -= marg; maksX += marg; minY -= marg; maksY += marg;
    let rute = Math.max(1, steg || 1);
    while (((maksX - minX) / rute + 1) * ((maksY - minY) / rute + 1) > 250000) rute *= 1.5;
    const nb = Math.round((maksX - minX) / rute) + 1, nh = Math.round((maksY - minY) / rute) + 1;
    const n = nb * nh;
    const naer = new Float32Array(n).fill(Infinity);
    for (const l of res.linjer) {
      for (let i = 1; i < l.xy.length; i++) {
        const a = l.xy[i - 1], b = l.xy[i];
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - marg - minX) / rute));
        const i1 = Math.min(nb - 1, Math.ceil((Math.max(a.x, b.x) + marg - minX) / rute));
        const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - marg - minY) / rute));
        const j1 = Math.min(nh - 1, Math.ceil((Math.max(a.y, b.y) + marg - minY) / rute));
        for (let j = j0; j <= j1; j++) {
          for (let ii = i0; ii <= i1; ii++) {
            const k = j * nb + ii;
            const d = Ror.avstandTilStrekk({ x: minX + ii * rute, y: minY + j * rute }, a, b);
            if (d < naer[k]) naer[k] = d;
          }
        }
      }
    }
    const wx = new Float64Array(n), wy = new Float64Array(n);      // Float64 – se Tomt3d._gitter
    const zT = new Float32Array(n), finnes = new Uint8Array(n), inne = new Uint8Array(n);
    let lav = Infinity, hoy = -Infinity, hoppet = 0, iKontekst = 0;
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        wx[k] = minX + i * rute; wy[k] = minY + j * rute;
        if (!(naer[k] <= marg)) continue;
        const z = terr ? terr.z(wx[k], wy[k]) : NaN;
        if (!Number.isFinite(z)) { hoppet++; continue; }
        finnes[k] = 1; zT[k] = z; iKontekst++;
        if (naer[k] <= Math.max(2, rute)) inne[k] = 1;   // der man lander når man går ned
        lav = Math.min(lav, z); hoy = Math.max(hoy, z);
      }
    }
    if (!Number.isFinite(lav)) return null;
    lav = Math.min(lav, rorLav);
    const ingen = new Uint8Array(n), null32 = new Float32Array(n);
    const g = {
      nb, nh, rute, minX, minY, lav, hoy, maksAvvik: 0.5,
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      wx, wy, zT, zP: zT, zF: zT, zEtter: zT, zFerdig: null32, harFerdig: ingen,
      harGrav: ingen, utenGrav: finnes, d: null32, finnes, inne, usikker: ingen,
      hoppet, iKontekst, totalt: n, celler: 0
    };
    this._gitterFor = res; this._gitterSteg = steg; this._gitterKontekst = this.kontekst;
    this._gitterBuffer = g;
    return g;
  },

  _avlesning(g, kk) {
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    return [`Terreng ${t2(g.zT[kk], 2)} moh`, `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`];
  },

  _hudLinjer() {
    const res = this.app.resultat;
    if (!this._harData(res)) return [];
    const s = Ror.sammendrag(res);
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    return [`${s.antall} rør · ${t2(s.lengde)} m`,
      Number.isFinite(s.minOd) ? `Overdekning ${Ror.spenn(s.minOd, s.maksOd, v => t2(v, 2))} m` : 'Overdekning ukjent',
      `Høyden ${t2(this.overdriv, 1)}× · rørene ligger under bakken og ses gjennom den`];
  },

  /**
   * Ett lag: terrenget – eller, med «Grøft» på, terrenget med grøfta gravd ut.
   * Rørene er streker i overlegget, ikke flater.
   */
  _lagliste(g) {
    if (!this.lag.terreng) return [];
    const rgb = Farger.terrengFlateRgb;
    const enkel = (k00, k10, k01, k11, z) => {
      const ly = this._lys(g, k00, k10, k01, z, this._kamNa);
      const r = Math.min(255, rgb[0] * ly), gg = Math.min(255, rgb[1] * ly), bl = Math.min(255, rgb[2] * ly);
      return (255 << 24) | (bl << 16) | (gg << 8) | r;
    };
    const bakken = (this.lag.arealdekke && Tegner3d._arealkart) ? this._arealfarge(g) : enkel;
    /* GRØFTA SOM ÅPEN GROP: terrenget senkes til gravenivået der det graves,
       og gropa får sin egen farge. Regnes én gang per gitter og resultat. */
    const res = this.app.resultat;
    if (this.lag.groft && res && res.groft) {
      if (this._gropGitter !== g || this._gropRes !== res.groft) {
        const zG = new Float32Array(g.zT.length), gravd = new Uint8Array(g.zT.length);
        for (let k = 0; k < zG.length; k++) {
          zG[k] = g.zT[k];
          if (!g.finnes[k]) continue;
          const z = Groft.nivaa(res.groft.modell, g.wx[k], g.wy[k]);
          if (Number.isFinite(z) && z < g.zT[k]) { zG[k] = z; gravd[k] = 1; }
        }
        this._gropGitter = g; this._gropRes = res.groft; this._grop = { zG, gravd };
      }
      const grop = this._grop, gr = Farger.rgb('groft-grop');
      // z er gropas eget høydefelt, så lyset regnes på gropa og ikke på terrenget
      const farge = (k00, k10, k01, k11, z) => {
        if (!grop.gravd[k00]) return bakken(k00, k10, k01, k11, z);
        const ly = this._lys(g, k00, k10, k01, z, this._kamNa);
        return (255 << 24) | (Math.min(255, gr[2] * ly) << 16) | (Math.min(255, gr[1] * ly) << 8) | Math.min(255, gr[0] * ly);
      };
      return [{ hoyde: grop.zG, farge, blanding: 0 }];
    }
    return [{ hoyde: g.zT, farge: bakken, blanding: 0 }];
  },

  /** Stakene, rørene og objektene – i den rekkefølgen, så rørene ligger øverst. */
  _overleggEkstra(k, g, kam, skjerm) {
    const app = this.app, res = app.resultat;
    if (!this._harData(res)) return;
    const r = app.P.ror;
    /* RØRENE LIGGER UNDER BAKKEN. Dybdeprøven i `_verdensstrek` skjuler alt bak
       rasteret når man står på bakken – og der ville hvert eneste rør vært
       borte. Røntgen er hele poenget her, så prøven slås av mens rørene tegnes. */
    const dyp = this._dyp;
    this._dyp = null;
    try {
      if (this.lag.staker && app.terreng) {
        k.strokeStyle = Farger.blekkSvak; k.lineWidth = 1;
        for (const l of res.linjer) {
          l.xy.forEach((q, i) => {
            const zt = app.terreng.z(q.x, q.y);
            if (!Number.isFinite(zt) || zt <= l.punkter[i].z) return;
            this._verdensstrek(k, [{ x: q.x, y: q.y, z: zt }, { x: q.x, y: q.y, z: l.punkter[i].z }]);
          });
        }
      }
      for (const l of res.linjer) {
        const kd = r.koder[l.kode] || Ror.tolkKode(l.kode);
        const D = (kd.dim || 0) / 1000;
        k.strokeStyle = Farger.ror(kd.farge);
        k.lineWidth = Math.max(2, Math.min(7, 1.5 + (kd.dim || 50) / 45)) + (l.id === RorUI.valgt ? 2 : 0);
        // senterlinja: en halv diameter under toppen som ble målt
        this._verdensstrek(k, l.xy.map((q, i) => ({ x: q.x, y: q.y, z: l.punkter[i].z - D / 2 })));
      }
      const tilXY = Ror.lagTilXY(r.sone, app.sone);
      k.fillStyle = Farger.ror('punkt'); k.strokeStyle = Farger.flate; k.lineWidth = 1;
      for (const p of res.bygg.objekter) {
        const q = tilXY(p);
        if (!(kam.punkt(q.x, q.y, p.z).w > (kam.naer || 1e-6))) continue;   // bak øyet
        const s = skjerm(q.x, q.y, p.z);
        k.fillRect(s.x - 3, s.y - 3, 6, 6);
        k.strokeRect(s.x - 3, s.y - 3, 6, 6);
      }
    } finally {
      this._dyp = dyp;
    }
  }
});

if (typeof module !== 'undefined') module.exports = Ror3d;
