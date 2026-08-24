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
        /* Én filnavnvasker, ett sted. Her sto en egen kopi som kuttet på 60
           tegn der Lager.filnavn kutter på 80, og som manglet reserven for et
           tomt navn – da ble filen hetende «_masseberegning.pdf». */
        const navn = Lager.filnavn(app.P.navn) + '_masseberegning.pdf';
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
      /* En tomt har ingen veglengde og ingen veiklasse. Sto det «Veglengde – m»
         og «Egen vegmal» øverst på hver side i en tomterapport, leste man en
         rapport som handlet om noe annet enn det man hadde regnet. */
      P.tekst(innmarg, 33, app.erTomt()
        ? 'Areal ' + t(res.areal, 0) + ' m²'
        : 'Veglengde ' + t(res.lengde, 1) + ' m',
      { storrelse: 8, farge: [0.82, 0.82, 0.84], juster: 'h' });
      P.tekst(innmarg, 44, app.erTomt()
        ? (Tomt.Arbeidstyper[app.P.tomt.arbeidstype] || { navn: 'Tomt' }).navn
        : this._klassenavn(app),
      { storrelse: 8, farge: [0.82, 0.82, 0.84], juster: 'h' });
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

    /* EN TOMT HAR INGEN PROFILER, OG RAPPORTEN MÅ VITE DET.
       Her ble et tomteresultat sendt rett inn i vegrapporten. Første felt som
       ikke fantes (`res.mal.renskDybde`) kastet, PDF-en ble aldri til, og
       brukeren fikk en grå statuslinje det var lett å overse. Å lappe felt for
       felt ville tatt åtte krasj på rad. */
    if (app.erTomt()) {
      await this._tomteinnhold(app, res, {
        P, t, tilstand, innmarg, nySide, plass, overskrift, nokkeltabell, tabell, brodtekst
      });
      this._bunn(P, innmarg);
      return P.bygg();
    }

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

    this._bunn(P, innmarg);
    return P.bygg();
  },

  /** Bunnteksten på hver side. Felles for veg og tomt. */
  _bunn(P, innmarg) {
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
  },

  /**
   * Innholdet i en tomterapport.
   *
   * Samme rekkefølge som sidepanelet viser på skjermen: mål, nivå, nøkkeltall,
   * masser, mur, overbygning, massebalanse, merknader. Den som har lest
   * skjermen skal kjenne igjen rapporten – ikke lure på hvorfor tallene står i
   * en annen orden.
   */
  async _tomteinnhold(app, res, r) {
    const { P, t, tilstand, innmarg, nySide, plass, overskrift, nokkeltabell, tabell, brodtekst } = r;
    const s = res.sum, b = res.balanse, m = app.P.mal, tt = app.P.tomt;
    const p = app.tomtIUtm(tt);
    const flate = app._innerflate || p;
    const bf = app.bakkefaktor();

    nySide();
    P.tekst(this.MARG, tilstand.y, `Terrengmodell: Kartverket DTM1 (1 m laserdata) · EUREF89 UTM${app.sone}`
      + ` · rutenett ${t(m.rutestorrelse, 2)} m · ${res.celler} celler`,
    { storrelse: 7.6, farge: this.GRA });
    tilstand.y += 6;

    /* GÅR DET I DET HELE TATT? DET SPØRSMÅLET FØRST.
       Er tomta ubyggelig, sto det som én merknad blant åtte nederst på siden.
       Tallene over den så ut som et helt vanlig svar. */
    if (res.ubyggelig) {
      const bredde = innmarg - this.MARG;
      const linjer = this._brytOpp(P, res.ubyggelig.tekst, bredde - 10, 8.4);
      const h = 10 + linjer.length * 4.6;
      plass(h + 6);
      P.rektangel(this.MARG, tilstand.y - 4, bredde, h, { fyll: [0.98, 0.92, 0.92], strek: [0.85, 0.12, 0.16], tykkelse: 1.2 });
      P.tekst(this.MARG + 5, tilstand.y + 2, 'DETTE LAR SEG IKKE BYGGE', { storrelse: 9.5, fet: true, farge: [0.66, 0.08, 0.11] });
      linjer.forEach((l, i) => P.tekst(this.MARG + 5, tilstand.y + 8 + i * 4.6, l, { storrelse: 8.4, farge: [0.35, 0.05, 0.07] }));
      tilstand.y += h + 4;
    }

    /* SAMMENDRAGET ØVERST.
       Rapporten var åtte tabeller etter hverandre, alle med samme vekt. Den som
       fikk den tilsendt måtte lese hele for å finne ut hva saken gjaldt. Her
       står de fem tallene som avgjør, store nok til å leses på en telefon. */
    {
      const bredde = innmarg - this.MARG;
      const felt = [
        ['Areal', t(res.areal) + ' m²'],
        ['Ferdig nivå', t((tt.nivaa || {}).kote, 2) + ' m'],
        ['Skjæring', t(s.skjaering) + ' m³'],
        ['Fylling', t(s.fylling) + ' m³'],
        [b && b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd',
          t(b ? (b.manglerTotalt > 1 ? b.manglerTotalt : Math.abs(b.balanse)) : 0) + ' m³']
      ];
      const kb = bredde / felt.length;
      plass(20);
      P.rektangel(this.MARG, tilstand.y - 4, bredde, 17, { fyll: [0.96, 0.96, 0.97] });
      felt.forEach(([navn, verdi], i) => {
        const x = this.MARG + i * kb;
        if (i) P.linje(x, tilstand.y - 4, x, tilstand.y + 13, { farge: this.LYSGRA, tykkelse: 0.4 });
        P.tekst(x + 4, tilstand.y + 1, navn, { storrelse: 6.8, farge: this.GRA });
        P.tekst(x + 4, tilstand.y + 9, verdi, { storrelse: 11, fet: true });
      });
      tilstand.y += 20;
    }

    /* TEGNINGENE FØR TABELLENE.
       Et bilde av tomta sett ovenfra, med skjæring i rødt og fylling i grønt,
       sier på ett blikk det tabellene under bruker en halv side på. */
    const teg = Rapport.lagTomtetegninger(res);
    const settInn = async (dataUrl, tittel, undertekst, maksHoyde) => {
      if (!dataUrl) return;
      const bilde = await this._tilJpeg(dataUrl);
      if (!bilde) return;
      overskrift(tittel);
      let bredde = innmarg - this.MARG;
      let hoyde = bredde * bilde.hoyde / bilde.bredde;
      if (maksHoyde && hoyde > maksHoyde) { bredde *= maksHoyde / hoyde; hoyde = maksHoyde; }
      plass(hoyde + (undertekst ? 12 : 6));
      P.bilde(bilde.bytes, bilde.bredde, bilde.hoyde, this.MARG, tilstand.y - 6, bredde, hoyde);
      P.rektangel(this.MARG, tilstand.y - 6, bredde, hoyde, { strek: this.LYSGRA, tykkelse: 0.5 });
      tilstand.y += hoyde;
      if (undertekst) {
        P.tekst(this.MARG, tilstand.y, undertekst, { storrelse: 6.8, farge: this.GRA });
        tilstand.y += 6;
      }
    };
    await settInn(teg.plan, 'Tomta ovenfra',
      'Rødt skal graves bort, grønt skal fylles opp. Sterkere farge er større avvik. '
      + 'Rutene er 10 m. Blek farge betyr at skråningen der ikke sto på egne ben.', 110);
    await settInn(teg.perspektiv, 'Sett fra siden',
      'Samme tall, sett på skrå, så man ser hvordan skråningene legger seg i terrenget.', 95);
    await settInn(teg.snitt, 'Snitt gjennom tomta', null, 60);

    overskrift('Mål og nivå');
    const niv = tt.nivaa || {};
    const nivaatekst = niv.modus === 'fall'
      ? `${t(niv.kote, 2)} m med fall ${t((niv.fall || 0) * 100, 1)} % mot ${t(niv.fallretning || 0, 0)}°`
      : niv.modus === 'sluk'
        ? `${t(niv.kote, 2)} m, faller mot ett punkt`
        : `${t(niv.kote, 2)} m, flatt`;
    nokkeltabell([
      ['Areal, ferdig flate', t(res.areal) + ' m²'],
      ['Areal med skråninger', t(res.arealMedSkraning) + ' m²'],
      ['Omkrets', t(Tomt.omkrets(flate) * bf, 1) + ' m'],
      ['Hjørner', String(flate.length)],
      ['Ferdig nivå (NN2000)', nivaatekst, true],
      ['Overbygning over planum', t(res.overbygning, 2) + ' m'],
      ['Omrisset betyr', tt.omrissBetyr === 'yttergrense'
        ? 'yttergrense – ferdig flate er regnet innover' : 'ferdig flate – skråninger kommer utenfor']
    ], this.MARG, innmarg - this.MARG);

    overskrift('Sidene');
    tabell(
      [{ tekst: 'Side', bredde: 8, venstre: true }, { tekst: 'Lengde', bredde: 14 },
        { tekst: 'Retning', bredde: 12 }, { tekst: 'Behandling', bredde: 34, venstre: true },
        { tekst: 'Helning', bredde: 14 }],
      Tomt.kanter(flate).map(k => {
        const kant = (tt.kanter || [])[k.nr] || {};
        const type = kant.type || 'skraning';
        const grader = ((90 - k.retning * 180 / Math.PI) % 360 + 360) % 360;
        const hell = type === 'mur' ? '1:' + t(kant.murAnlegg != null ? kant.murAnlegg : m.murAnlegg, 2)
          : type === 'fjellvegg' ? '10:1'
            : type === 'apen' ? '–' : '1:' + t(m.skjaeringLosmasse, 1);
        return { celler: [String(k.nr + 1), t(k.lengde * bf, 1) + ' m', t(grader, 0) + '°',
          Tomt.Kanttyper[type] || type, hell] };
      })
    );

    overskrift('Nøkkeltall');
    const nk = [
      ['Dypeste skjæring', t(res.dypesteSkjaering, 2) + ' m'],
      ['Høyeste fylling', t(res.hoyesteFylling, 2) + ' m']
    ];
    if (res.hoyesteVegg > 0.05) nk.push(['Høyeste bergvegg', t(res.hoyesteVegg, 2) + ' m']);
    if (res.rekkevidde > 0) nk.push(['Skråningen går lengst ut', t(res.rekkevidde, 1) + ' m']);
    nokkeltabell(nk, this.MARG, innmarg - this.MARG);

    overskrift('Masser – prosjektert fast volum');
    const poster = [];
    const legg = (navn, v, uthevet) => { if (v > 0.5) poster.push([navn, t(v) + ' m³', uthevet]); };
    legg('Matjord som tas av', s.matjord);
    legg('Rensk mot fjell', s.rensk);
    legg('Skjæring totalt', s.skjaering, true);
    legg('– løsmasse', s.skjaeringLosmasse);
    legg('– fjell (sprengning)', s.skjaeringFjell);
    legg('– overberg', s.overberg);
    legg('Fylling', s.fylling, true);
    nokkeltabell(poster, this.MARG, innmarg - this.MARG);

    if (res.murLengde > 0.5) {
      overskrift('Støttemur');
      nokkeltabell([
        ['Lengde', t(res.murLengde, 1) + ' m'],
        ['Høyeste punkt', t(res.murHoyde, 2) + ' m'],
        ['Fundamentgrøft', t(s.murFundament, 1) + ' m³'],
        ['Drenerende bakfylling', t(s.murBakfylling, 1) + ' m³']
      ], this.MARG, innmarg - this.MARG);
    }

    const lag = s.slitelag + s.baerelag + s.forsterkningslag + s.frostsikring + s.avrettingslag;
    if (lag > 0.5) {
      overskrift('Byggeklart – lag som skal inn');
      const rader = [];
      const lagrad = (navn, v, tykk) => { if (v > 0.005) rader.push([navn + (tykk ? ` (${t(tykk, 2)} m)` : ''), t(v) + ' m³']); };
      lagrad('Frostsikring', s.frostsikring, m.frostsikring);
      lagrad('Forsterkningslag', s.forsterkningslag, m.forsterkningslag);
      lagrad('Bærelag', s.baerelag, m.baerelagTykkelse);
      lagrad('Avretting', s.avrettingslag, m.avrettingslag);
      lagrad('Slitelag', s.slitelag, m.slitelagTykkelse);
      rader.push(['Sum overbygning', t(lag) + ' m³', true]);
      nokkeltabell(rader, this.MARG, innmarg - this.MARG);
    }

    if (b) {
      overskrift('Massebalanse');
      const f = app.P.faktorer;
      nokkeltabell([
        [`Sprengt fjell, løst på lass (× ${f.sprengningsfaktor})`, t(b.fjellSprengtLos) + ' p.a.m³'],
        [`Tilgjengelig til fylling (fjell × ${f.fjellIFylling})`, t(b.tilgjengelig) + ' m³'],
        ['Fyllingsbehov', t(b.fyllingBehov) + ' m³'],
        [b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd',
          t(b.manglerTotalt > 1 ? b.manglerTotalt : Math.abs(b.balanse)) + ' m³', true],
        ['Til deponi', t(b.tilDeponi) + ' m³']
      ], this.MARG, innmarg - this.MARG);
    }

    if (res.merknader && res.merknader.length) {
      overskrift('Merknader');
      /* Tomtemerknader har ingen stasjon. Vegrapporten skriver `v.s.toFixed(0)`
         i første kolonne, og det kaster her - derfor bare type og tekst. */
      tabell(
        [{ tekst: 'Type', bredde: 14, venstre: true }, { tekst: 'Merknad', bredde: 86, venstre: true }],
        res.merknader.map(v => ({
          celler: [v.type || '–', this._kort(P, v.tekst, (innmarg - this.MARG) * 0.82, 7.2)]
        }))
      );
    }

    brodtekst('Volumene er regnet celle for celle på Kartverkets 1 m rutenett. Skjæringen måles '
      + 'fra den avdekkede flaten, altså etter at matjorda er tatt av, så matjorda ligger ikke '
      + 'i skjæringsvolumet i tillegg til sin egen post.');
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
