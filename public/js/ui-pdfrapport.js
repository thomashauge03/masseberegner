'use strict';
/**
 * Setter masseberegningen opp som en PDF-rapport.
 *
 * Samme innholdet som utskriftsrapporten - sammendrag, massebalanse,
 * forutsetninger, masser per bolk, lengdeprofil, tverrsnitt, stikningsdata og
 * merknader - men satt for papir og lastet ned som fil, sa man slipper veien
 * om nettleserens utskriftsdialog.
 *
 * Sidebrytingen skjer der den ma: en tabell far ny side nar raden ikke lenger
 * far plass, og overskriften følger med i stedet for a bli staende alene
 * nederst.
 */

const Pdfrapport = {

  init(app) { this.app = app; return this; },

  // Hauge Maskin: svart, rødt, hvitt
  SVART: [0.043, 0.043, 0.047],
  ROD: [0.847, 0.118, 0.157],
  GRA: [0.32, 0.32, 0.35],
  LYSGRA: [0.816, 0.816, 0.835],
  BAKGRUNN: [0.957, 0.957, 0.961],

  MARG: 38,
  BUNNMARG: 46,

  /**
   * Lager rapporten og laster den ned.
   * @returns {Promise<Uint8Array|null>} bytene, sa prøver kan se pa dem
   */
  async lag(lastNed = true) {
    const app = this.app, res = app.resultat;
    if (!res) { app.status('Ingen beregning å lage rapport av ennå.'); return null; }

    app.framdrift(true, 'Lager PDF…', 0.2);
    try {
      const bytes = await this._bygg(app, res);
      if (lastNed) {
        const navn = String(app.P.navn).replace(/[^\wæøåÆØÅ -]/g, '_').replace(/\s+/g, '_').slice(0, 60)
          + '_masseberegning.pdf';
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = navn;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        app.status(`PDF lastet ned · ${(bytes.length / 1024).toFixed(0)} kB`);
      }
      return bytes;
    } catch (e) {
      app.status('Klarte ikke å lage PDF: ' + e.message);
      console.error(e);
      return null;
    } finally {
      app.framdrift(false);
    }
  },

  async _bygg(app, res) {
    const P = new PdfSkriver();
    const t = (v, d = 0) => Rapport.tall(v, d);
    const s = res.sum, b = res.balanse, m = res.mal, f = res.faktorer;
    const dato = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric' });
    const innmarg = P.bredde - this.MARG;

    const tilstand = { y: 0, sidetall: 0 };

    /* Brevhodet: svart bjelke med rød strek under, logoen til venstre.
       Logoen hentes som bilde en gang og deles mellom alle sidene. */
    const logo = await this._logo();

    const nySide = () => {
      P.nySide();
      tilstand.sidetall++;
      P.rektangel(0, 0, P.bredde, 52, { fyll: this.SVART });
      P.rektangel(0, 52, P.bredde, 3, { fyll: this.ROD });
      if (logo) P.bilde(logo.bytes, logo.bredde, logo.hoyde, this.MARG, 13, logo.vis, logo.visHoyde);
      const xTekst = this.MARG + (logo ? logo.vis + 14 : 0);
      P.tekst(xTekst, 26, 'MASSEBEREGNING', { storrelse: 15, fet: true, farge: [1, 1, 1] });
      P.tekst(xTekst, 40, String(app.P.navn), { storrelse: 9, farge: [0.82, 0.82, 0.84] });
      P.tekst(innmarg, 22, dato, { storrelse: 8, farge: [0.82, 0.82, 0.84], juster: 'h' });
      P.tekst(innmarg, 33, 'Veglengde ' + t(res.lengde, 1) + ' m', { storrelse: 8, farge: [0.82, 0.82, 0.84], juster: 'h' });
      P.tekst(innmarg, 44, this._klassenavn(app), { storrelse: 8, farge: [0.82, 0.82, 0.84], juster: 'h' });
      tilstand.y = 76;
    };

    /** Ny side hvis det som kommer ikke far plass under det som star na. */
    const plass = (hoyde) => {
      if (tilstand.y + hoyde > P.hoyde - this.BUNNMARG) nySide();
    };

    const overskrift = (tekst) => {
      plass(46);
      tilstand.y += 12;
      P.tekst(this.MARG, tilstand.y, tekst.toUpperCase(), { storrelse: 11, fet: true });
      tilstand.y += 4;
      P.linje(this.MARG, tilstand.y, innmarg, tilstand.y, { tykkelse: 1.4, farge: this.SVART });
      tilstand.y += 12;
    };

    /**
     * To kolonner: venstre tekst, høyre tall. Brukes til alle nøkkeltallene.
     * @param {Array<[string,string,boolean]>} rader tekst, verdi, uthevet
     */
    const nokkeltabell = (rader, x, bredde) => {
      for (const [venstre, hoyre, uthevet] of rader) {
        plass(15);
        const y = tilstand.y;
        if (uthevet) P.rektangel(x, y - 8.5, bredde, 13, { fyll: this.BAKGRUNN });
        P.tekst(x + 3, y, venstre, { storrelse: 8.2, fet: !!uthevet });
        P.tekst(x + bredde - 3, y, hoyre, { storrelse: 8.2, fet: !!uthevet, juster: 'h' });
        P.linje(x, y + 4.5, x + bredde, y + 4.5, { farge: this.LYSGRA, tykkelse: 0.4 });
        tilstand.y += 13;
      }
    };

    /**
     * Rutenettstabell med hode som gjentas nar den brytes over en side.
     * @param {Array<{tekst:string,bredde:number,venstre?:boolean}>} kolonner
     */
    const tabell = (kolonner, rader, o = {}) => {
      const st = o.storrelse || 7.6;
      const radhoyde = o.radhoyde || 11.5;
      const samlet = kolonner.reduce((a, k) => a + k.bredde, 0);
      const skala = (innmarg - this.MARG) / samlet;

      const hode = () => {
        plass(radhoyde * 2);
        P.rektangel(this.MARG, tilstand.y - 8, innmarg - this.MARG, radhoyde + 1, { fyll: this.SVART });
        let x = this.MARG;
        for (const k of kolonner) {
          const bre = k.bredde * skala;
          P.tekst(k.venstre ? x + 3 : x + bre - 3, tilstand.y, k.tekst,
            { storrelse: st, fet: true, farge: [1, 1, 1], juster: k.venstre ? 'v' : 'h' });
          x += bre;
        }
        tilstand.y += radhoyde + 3;
      };
      hode();

      for (const rad of rader) {
        // brytes tabellen, skal hodet med over - ellers star kolonnene navnløse
        if (tilstand.y + radhoyde > P.hoyde - this.BUNNMARG) { nySide(); hode(); }
        const uthevet = rad.sum;
        if (uthevet) P.rektangel(this.MARG, tilstand.y - 8, innmarg - this.MARG, radhoyde, { fyll: this.BAKGRUNN });
        let x = this.MARG;
        rad.celler.forEach((celle, i) => {
          const k = kolonner[i], bre = k.bredde * skala;
          P.tekst(k.venstre ? x + 3 : x + bre - 3, tilstand.y, celle,
            { storrelse: st, fet: !!uthevet, juster: k.venstre ? 'v' : 'h' });
          x += bre;
        });
        P.linje(this.MARG, tilstand.y + 3.5, innmarg, tilstand.y + 3.5,
          { farge: uthevet ? this.SVART : this.LYSGRA, tykkelse: uthevet ? 0.9 : 0.35 });
        tilstand.y += radhoyde;
      }
      tilstand.y += 6;
    };

    const brodtekst = (tekst, o = {}) => {
      const st = o.storrelse || 7.6;
      const bredde = o.bredde || (innmarg - this.MARG);
      const x = o.x != null ? o.x : this.MARG;
      for (const linje of this._brytOpp(P, tekst, bredde, st)) {
        plass(11);
        P.tekst(x, tilstand.y, linje, { storrelse: st, farge: o.farge || this.GRA });
        tilstand.y += 10;
      }
    };

    /* ---------------- side 1 ---------------- */
    nySide();
    P.tekst(this.MARG, tilstand.y, `Terrengmodell: Kartverket DTM1 (1 m laserdata) · EUREF89 UTM${app.sone}`,
      { storrelse: 7.6, farge: this.GRA });
    tilstand.y += 6;

    overskrift('Sammendrag');
    nokkeltabell([
      [`Rensk / avdekking (${m.renskDybde} m + ${m.renskUtenfor} m utenfor)`, t(s.rensk) + ' m³'],
      ['Skjæring i løsmasse', t(s.skjaeringLosmasse) + ' p.f.m³'],
      ['Skjæring i fjell (sprengning)', t(s.skjaeringFjell) + ' p.f.m³'],
      ['Skjæring totalt', t(s.skjaering) + ' p.f.m³', true],
      ['Fylling (geometrisk volum)', t(s.fylling) + ' m³'],
      [`Bærelag ${m.baerelagTykkelse} m × ${m.vegbredde} m`, t(s.baerelag) + ' p.a.m³'],
      [`Slitelag ${m.slitelagTykkelse} m × ${m.slitelagBredde} m`, t(s.slitelag) + ' p.a.m³'],
      ['Fylling + bærelag', t(s.fylling + s.baerelag) + ' p.a.m³', true]
    ], this.MARG, innmarg - this.MARG);

    overskrift('Massebalanse');
    nokkeltabell([
      [`Tilgjengelig fra fjellskjæring (× ${f.fjellIFylling})`, t(b.fraFjell) + ' m³'],
      [`Tilgjengelig brukbar løsmasse (${Math.round(f.brukbarLosmasse * 100)} % × ${f.losmasseIFylling})`, t(b.brukbarLos) + ' m³'],
      ['Fylling dekket av egne masser', `${t(b.fyllFraLos + b.fyllFraFjell)} av ${t(b.fyllingBehov)} m³`],
      ['Bærelag dekket av egen sprengstein', `${t(b.baerelagFraFjell)} av ${t(b.baerelagBehov)} m³`],
      [b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd av sprengstein',
        t(b.manglerTotalt > 1 ? b.manglerTotalt : b.overskuddFjell) + ' m³', true],
      ['Overskudd av brukbar løsmasse', t(b.overskuddLos) + ' m³'],
      ['Til deponi (rensk + ubrukbar løsmasse)', t(b.tilDeponi) + ' m³'],
      [`Sprengt fjell, løst volum (× ${f.sprengningsfaktor})`, t(b.fjellSprengtLos) + ' p.a.m³']
    ], this.MARG, innmarg - this.MARG);

    overskrift('Forutsetninger');
    nokkeltabell([
      ['Veiklasse', this._klassenavn(app)],
      ['Vegbredde inkl. skulder', m.vegbredde + ' m'],
      ['Tverrfall', `${(m.tverrfall * 100).toFixed(1)} % ${m.tverrfallType === 'tak' ? '(tosidig)' : '(ensidig)'}`],
      ['Overbygning (bærelag + slitelag)', (m.baerelagTykkelse + m.slitelagTykkelse).toFixed(2) + ' m'],
      ['Grøftedybde under planum / grøftebunn', `${m.grofteDybdePlanum} m / ${m.grofteBunn} m`],
      ['Skjæring løsmasse / fjell / fylling', `1:${m.skjaeringLosmasse} · 1:${m.skjaeringFjell} · 1:${m.fylling}`],
      ['Profilavstand', t(res.stasjoner[1] - res.stasjoner[0], 1) + ' m'],
      ['Standard dybde til fjell', app.P.fjell.standarddybde + ' m'],
      ['Observasjoner av fjelldybde', app.P.fjell.punkter.length + ' stk'],
      ['Lengdekorreksjon UTM → bakke', res.bakkefaktor === 1 ? 'ikke brukt' : '× ' + res.bakkefaktor.toFixed(6)]
    ], this.MARG, innmarg - this.MARG);

    tilstand.y += 4;
    brodtekst('Volumene er regnet med gjennomsnittlig endeareal mellom profilene, med Pappus-korreksjon '
      + 'for kurvatur. Skjæring og fylling er regnet mot planum (under overbygningen) og mot terreng '
      + 'etter rensk. p.f. = prosjektert fast volum, p.a. = prosjektert anbrakt volum.');

    /* ---------------- tegninger ---------------- */
    const tegninger = Rapport.lagTegninger(res, 6);
    const lengdeBilde = await this._tilJpeg(tegninger.lengdeprofil);
    if (lengdeBilde) {
      overskrift('Lengdeprofil');
      const bredde = innmarg - this.MARG;
      const hoyde = bredde * lengdeBilde.hoyde / lengdeBilde.bredde;
      plass(hoyde + 6);
      P.bilde(lengdeBilde.bytes, lengdeBilde.bredde, lengdeBilde.hoyde, this.MARG, tilstand.y - 6, bredde, hoyde);
      P.rektangel(this.MARG, tilstand.y - 6, bredde, hoyde, { strek: this.LYSGRA, tykkelse: 0.5 });
      tilstand.y += hoyde + 4;
    }

    if (tegninger.tverrsnitt.length) {
      overskrift('Tverrsnitt');
      const bredde = (innmarg - this.MARG - 12) / 2;
      for (let i = 0; i < tegninger.tverrsnitt.length; i += 2) {
        const par = [];
        for (const x of tegninger.tverrsnitt.slice(i, i + 2)) {
          par.push({ post: x, bilde: await this._tilJpeg(x.bilde) });
        }
        const hoyde = par[0].bilde ? bredde * par[0].bilde.hoyde / par[0].bilde.bredde : 0;
        plass(hoyde + 20);
        par.forEach((q, j) => {
          if (!q.bilde) return;
          const x = this.MARG + j * (bredde + 12);
          P.bilde(q.bilde.bytes, q.bilde.bredde, q.bilde.hoyde, x, tilstand.y - 6, bredde, hoyde);
          P.rektangel(x, tilstand.y - 6, bredde, hoyde, { strek: this.LYSGRA, tykkelse: 0.5 });
          const a = q.post.areal;
          P.tekst(x, tilstand.y + hoyde + 2, `Profil ${q.post.s.toFixed(0)} · skjæring ${a.skjaering.toFixed(1)} m²`
            + ` (fjell ${a.skjaeringFjell.toFixed(1)}) · fylling ${a.fylling.toFixed(1)} m²`,
            { storrelse: 6.6, farge: this.GRA });
        });
        tilstand.y += hoyde + 16;
      }
    }

    /* ---------------- masser per bolk ---------------- */
    const bolk = 20;
    const bolker = [];
    let na = null;
    for (const iv of res.intervaller) {
      const start = Math.floor(iv.fra / bolk) * bolk;
      if (!na || na.fra !== start) {
        na = { fra: start, til: start + bolk, rensk: 0, skjaering: 0, fjell: 0, los: 0, fylling: 0, baerelag: 0, slitelag: 0 };
        bolker.push(na);
      }
      na.rensk += iv.volum.rensk; na.skjaering += iv.volum.skjaering;
      na.fjell += iv.volum.skjaeringFjell; na.los += iv.volum.skjaeringLosmasse;
      na.fylling += iv.volum.fylling; na.baerelag += iv.volum.baerelag;
      na.slitelag += iv.volum.slitelag; na.til = iv.til;
    }
    overskrift(`Masser per ${bolk} meter`);
    tabell(
      [{ tekst: 'Fra–til', bredde: 14, venstre: true }, { tekst: 'Rensk', bredde: 11 },
      { tekst: 'Skjær. løsm.', bredde: 13 }, { tekst: 'Skjær. fjell', bredde: 13 },
      { tekst: 'Skjær. sum', bredde: 12 }, { tekst: 'Fylling', bredde: 11 },
      { tekst: 'Bærelag', bredde: 11 }, { tekst: 'Slitelag', bredde: 11 }],
      bolker.map(r => ({
        celler: [`${r.fra}–${r.til.toFixed(0)}`, t(r.rensk), t(r.los), t(r.fjell),
          t(r.skjaering), t(r.fylling), t(r.baerelag), t(r.slitelag)]
      })).concat([{
        sum: true,
        celler: ['Sum', t(s.rensk), t(s.skjaeringLosmasse), t(s.skjaeringFjell),
          t(s.skjaering), t(s.fylling), t(s.baerelag), t(s.slitelag)]
      }])
    );

    /* ---------------- stikning ---------------- */
    const steg = res.lengdeKart > 600 ? 10 : 5;
    const stikning = Rapport.stikningstabell(res, steg);
    overskrift('Stikningsdata – senterlinje');
    brodtekst(`EUREF89 UTM${app.sone}. VK og HK er venstre og høyre vegkant. Z er ferdig vegnivå. `
      + `Hele oppsettet med hver ${t(res.stasjoner[1] - res.stasjoner[0], 1)} meter kan hentes som CSV under fanen «Linje».`);
    tilstand.y += 2;
    tabell(
      [{ tekst: 'Profil', bredde: 8, venstre: true }, { tekst: 'Nord', bredde: 14 }, { tekst: 'Øst', bredde: 13 },
      { tekst: 'Z veg', bredde: 10 }, { tekst: 'Z terr.', bredde: 10 },
      { tekst: 'VK nord', bredde: 14 }, { tekst: 'VK øst', bredde: 13 }, { tekst: 'VK Z', bredde: 10 },
      { tekst: 'HK nord', bredde: 14 }, { tekst: 'HK øst', bredde: 13 }, { tekst: 'HK Z', bredde: 10 }],
      stikning.map(r => ({
        celler: [r.s.toFixed(0), r.n.toFixed(3), r.o.toFixed(3), r.z.toFixed(3),
          isFinite(r.terreng) ? r.terreng.toFixed(3) : '–',
          r.vkN.toFixed(3), r.vkO.toFixed(3), r.vkZ.toFixed(3),
          r.hkN.toFixed(3), r.hkO.toFixed(3), r.hkZ.toFixed(3)]
      })),
      { storrelse: 6.4, radhoyde: 9.6 }
    );

    /* ---------------- merknader ---------------- */
    if (res.merknader.length) {
      overskrift('Merknader');
      tabell(
        [{ tekst: 'Profil', bredde: 8, venstre: true }, { tekst: 'Type', bredde: 14, venstre: true },
        { tekst: 'Merknad', bredde: 78, venstre: true }],
        res.merknader.map(v => ({
          celler: [v.type === 'inngang' ? '–' : v.s.toFixed(0), v.type,
            this._kort(P, v.tekst, (innmarg - this.MARG) * 0.74, 7.2)]
        }))
      );
    }

    /* ---------------- bunntekst pa hver side ---------------- */
    const bunntekst = 'Terrenghøydene er hentet fra Kartverket sin nasjonale høydemodell (DTM1, 1×1 m fra '
      + 'flybåren laserskanning). Modellen viser terrenget slik det var ved siste skanning – kontroller mot '
      + 'befaring før kontrahering. Dybden til fjell er den største usikkerheten i sprengningsvolumet.';
    const bunnlinjer = this._brytOpp(P, bunntekst, P.bredde - 2 * this.MARG - 60, 6.2);
    P.sider.forEach((side, i) => {
      P.side = side;
      const yb = P.hoyde - 34;
      P.linje(this.MARG, yb - 8, innmarg, yb - 8, { tykkelse: 1.6, farge: this.ROD });
      bunnlinjer.forEach((linje, j) => P.tekst(this.MARG, yb + j * 7.4, linje, { storrelse: 6.2, farge: this.GRA }));
      P.tekst(innmarg, yb, 'Hauge Maskin', { storrelse: 7.4, fet: true, juster: 'h' });
      P.tekst(innmarg, yb + 9, `Side ${i + 1} av ${P.sider.length}`, { storrelse: 6.8, farge: this.GRA, juster: 'h' });
    });

    return P.bygg();
  },


  /* ---------------- hjelpere ---------------- */

  _klassenavn(app) {
    const k = (typeof Veiklasser !== 'undefined') && Veiklasser[app.P.mal.veiklasse];
    return k ? `Veiklasse ${k.nr || app.P.mal.veiklasse.replace('k', '')} – ${k.navn}` : 'Egen vegmal';
  },

  /**
   * PNG fra lerretet blir til JPEG, som PDF leser rett (DCTDecode).
   *
   * Bildet ma vente pa `onload` selv om kilden er en data-URL - avkodingen
   * skjer for seg. Uten ventingen var bredden null, og alle tegningene falt
   * stille ut av rapporten.
   */
  async _tilJpeg(dataUrl) {
    if (!dataUrl) return null;
    try {
      const bilde = await new Promise((los, avvis) => {
        const b = new Image();
        b.onload = () => los(b);
        b.onerror = () => avvis(new Error('kunne ikke lese bildet'));
        b.src = dataUrl;
      });
      const l = document.createElement('canvas');
      l.width = bilde.naturalWidth || bilde.width;
      l.height = bilde.naturalHeight || bilde.height;
      if (!l.width || !l.height) return null;
      const c = l.getContext('2d');
      c.fillStyle = '#ffffff';                 // JPEG har ingen gjennomsiktighet
      c.fillRect(0, 0, l.width, l.height);
      c.drawImage(bilde, 0, 0);
      return { bytes: bytesFraDataUrl(l.toDataURL('image/jpeg', 0.86)), bredde: l.width, hoyde: l.height };
    } catch (e) { return null; }
  },

  async _logo() {
    if (this._logoBufret !== undefined) return this._logoBufret;
    this._logoBufret = null;
    try {
      const bilde = await new Promise((los, avvis) => {
        const b = new Image();
        b.onload = () => los(b);
        b.onerror = () => avvis(new Error('fant ikke logoen'));
        b.src = 'bilde/hm-logo.png';
      });
      const h = 26, bre = Math.round(h * bilde.naturalWidth / bilde.naturalHeight);
      const l = document.createElement('canvas');
      l.width = bre * 3; l.height = h * 3;      // tre ganger opp, sa den ikke blir grøtete
      const c = l.getContext('2d');
      c.fillStyle = '#0b0b0c';                  // samme svart som bjelken bak
      c.fillRect(0, 0, l.width, l.height);
      c.drawImage(bilde, 0, 0, l.width, l.height);
      this._logoBufret = {
        bytes: bytesFraDataUrl(l.toDataURL('image/jpeg', 0.92)),
        bredde: l.width, hoyde: l.height, vis: bre, visHoyde: h
      };
    } catch (e) { /* uten logo gar det ogsa */ }
    return this._logoBufret;
  },

  /** Deler en tekst i linjer som far plass i bredden. */
  _brytOpp(P, tekst, bredde, storrelse) {
    const ord = String(tekst).split(/\s+/);
    const linjer = [];
    let na = '';
    for (const o of ord) {
      const forsok = na ? na + ' ' + o : o;
      if (na && P.bredteAv(forsok, storrelse) > bredde) { linjer.push(na); na = o; }
      else na = forsok;
    }
    if (na) linjer.push(na);
    return linjer;
  },

  /** Kutter en tekst som ikke far plass, med tre prikker bak. */
  _kort(P, tekst, bredde, storrelse) {
    let ut = String(tekst);
    if (P.bredteAv(ut, storrelse) <= bredde) return ut;
    while (ut.length > 4 && P.bredteAv(ut + '…', storrelse) > bredde) ut = ut.slice(0, -1);
    return ut + '…';
  }
};
