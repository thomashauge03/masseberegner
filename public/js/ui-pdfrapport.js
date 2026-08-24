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

  /* FIRE BLEKK. IKKE FEM.
     Regelen skal kunne følges uten skjønn:
       SVART   alt som ER informasjon – tall, brødtekst, overskrifter
       GRA     alt som FORKLARER informasjon – etiketter, enheter, bildetekst.
               Grått brukes aldri på et tall.
       LYSGRA  streker og rammer. Aldri tekstfarge.
       PANEL   flater bak tekst. Aldri tekstfarge.
       ROD     fire steder i hele dokumentet, og ingen andre: streken under
               sidehodet, streken over bunnen, inne i logoen, og tallet som
               sier at det MANGLER masse. Er tallet et overskudd, er det svart.
     Rødt er aldri en overskrift, aldri en tabellstrek, aldri en flate. */
  SVART: [0.043, 0.043, 0.047],
  ROD: [0.847, 0.118, 0.157],
  GRA: [0.42, 0.42, 0.45],
  LYSGRA: [0.894, 0.894, 0.906],
  BAKGRUNN: [0.957, 0.957, 0.961],
  PANEL: [0.957, 0.957, 0.961],

  /* Fire spalter à 121,82 pt med 8 pt mellomrom. Alt som settes har EN av
     disse bredddene – 1, 2, 3 eller 4 spalter. Ingen femte bredde finnes.
     Det er den regelen som gjør at sidene fylles: to nøkkeltabeller som før
     sto under hverandre over hele arket, står nå side ved side. */
  MARG: 42,
  BUNNMARG: 68,
  SPALTE: 121.82,
  MELLOMROM: 8,

  /* Fem tekststørrelser. Ikke ni. Trinnene er 1,25 / 1,18 / 1,21 – jevnt nok
     til å leses som ett system, stort nok til at hvert trinn synes på papir.
     Spranget opp til T1 er 1,78, og det finnes bare på forsiden, der ett ord
     skal vinne over alt annet. */
  T1: 24,      // prosjektnavnet på forsiden
  T2: 13.5,    // prosjektnavn i sidehodet
  T3: 10,      // seksjonsoverskrifter, VERSALER
  T4: 8.5,     // arbeidshesten: tabellrader, tall, lesetekst
  T5: 7,       // tabellhode, bildetekst, etiketter, bunntekst

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

    /** Undertittelen: hva slags arbeid dette er. Én linje, aldri to. */
    const undertittel = app.erTomt()
      ? (Tomt.Arbeidstyper[app.P.tomt.arbeidstype] || { navn: 'Tomt' }).navn
      /* «Veiklasse 5 – Klasse 5 – Sommerbilvei …» sa tallet to ganger. */
      : this._klassenavn(app).replace(/^Veiklasse (\S+) – Klasse \S+ – /, 'Veiklasse $1 – ');

    /**
     * Sidehodet.
     *
     * HVIT BUNN, IKKE SVART BJELKE.
     * Bjelken var det største på siden og sa ingenting – ordet
     * «MASSEBEREGNING» står på hver side i hver eneste rapport programmet har
     * laget. Verre: den drepte logoen. Det mest særpregede ved HM-merket er den
     * tunge svarte 3D-ekstruderingen, og på svart bunn er den usynlig – det som
     * står igjen er en flat hvit-og-rød «HM» som svever. På hvitt leses den som
     * den utstansede metallplaten den er.
     *
     * Og hierarkiet er snudd rett vei: prosjektnavnet er tittelen, for det er
     * det eneste som skiller denne rapporten fra alle andre.
     */
    const nySide = () => {
      P.nySide();
      tilstand.sidetall++;
      if (logo) {
        const h = 30, b = h * logo.bredde / logo.hoyde;
        P.bilde(logo.bytes, logo.bredde, logo.hoyde, this.MARG, 16, b, h, logo.alfa);
        P.linje(this.MARG + b + 16, 16, this.MARG + b + 16, 48, { farge: this.LYSGRA, tykkelse: 0.4 });
      }
      const xTekst = this.MARG + (logo ? 30 * logo.bredde / logo.hoyde + 28 : 0);
      /* Hva slags dokument dette er, står ÉN gang – på første side. Før sto
         «MASSEBEREGNING» i 15 pt fet hvit på hver eneste side, dobbelt så stort
         som prosjektnavnet. Men det ordet er likt i hver rapport programmet har
         laget; prosjektnavnet er det eneste som skiller denne fra alle andre. */
      if (tilstand.sidetall === 1) {
        P.tekst(xTekst, 22, this._sperret('MASSEBEREGNING'),
          { storrelse: 6.4, fet: true, farge: this.ROD });
        P.tekst(xTekst, 38, String(app.P.navn), { storrelse: this.T2, fet: true, farge: this.SVART });
        P.tekst(xTekst, 50, this._kort(P, undertittel, 300, this.T4),
          { storrelse: this.T4, farge: this.GRA });
      } else {
        P.tekst(xTekst, 32, String(app.P.navn), { storrelse: this.T2, fet: true, farge: this.SVART });
        P.tekst(xTekst, 45, this._kort(P, undertittel, 300, this.T4),
          { storrelse: this.T4, farge: this.GRA });
      }
      P.tekst(innmarg, 28, dato, { storrelse: this.T5, farge: this.GRA, juster: 'h' });

      P.rektangel(this.MARG, 60, innmarg - this.MARG, 2.5, { fyll: this.ROD });
      tilstand.y = 84;
    };

    /** Ny side hvis det som kommer ikke far plass under det som star na. */
    const plass = (hoyde) => {
      if (tilstand.y + hoyde > P.hoyde - this.BUNNMARG) nySide();
    };

    /**
     * @param {number} [behov] hvor mye plass det som KOMMER trenger.
     *   Uten den ba overskriften bare om plass til seg selv, og «Tverrsnitt»
     *   ble stående alene nederst på siden med tegningene på den neste.
     */
    const overskrift = (tekst, behov) => {
      plass((behov != null ? behov : 12) + 34);
      tilstand.y += 12;
      P.tekst(this.MARG, tilstand.y, tekst.toUpperCase(),
        { storrelse: this.T3, fet: true, farge: this.SVART });
      tilstand.y += 4;
      // 0,8 pt, ikke 1,4: streken skal merke av, ikke rope
      P.linje(this.MARG, tilstand.y, innmarg, tilstand.y, { tykkelse: 0.8, farge: this.SVART });
      tilstand.y += 12;
    };

    /**
     * To kolonner: venstre tekst, høyre tall. Brukes til alle nøkkeltallene.
     * @param {Array<[string,string,boolean]>} rader tekst, verdi, uthevet
     */
    const rad = (x, bredde, venstre, hoyre, uthevet, roedVerdi) => {
      const y = tilstand.y;
      if (uthevet) P.rektangel(x, y - 8.5, bredde, 13, { fyll: this.PANEL });
      P.tekst(x + 3, y, venstre, { storrelse: this.T4, fet: !!uthevet, farge: this.SVART });
      P.tekst(x + bredde - 3, y, hoyre,
        { storrelse: this.T4, fet: !!uthevet, farge: roedVerdi ? this.ROD : this.SVART, juster: 'h' });
      P.linje(x, y + 4.5, x + bredde, y + 4.5, { farge: this.LYSGRA, tykkelse: 0.4 });
      tilstand.y += 13;
    };

    const nokkeltabell = (rader, x, bredde) => {
      for (const r2 of rader) {
        plass(15);
        rad(x, bredde, r2[0], r2[1], r2[2], r2[3]);
      }
    };

    /**
     * Sammendragsbåndet: tallene som avgjør, øverst.
     *
     * DET VAR FOR TRANGT.
     * Båndet var 17 pt høyt og skulle romme 6,8 pt etikett og 11 pt tall.
     * J-en og ø-en i «Må kjøres inn» stakk rett ned i sifrene under, og
     * etiketten lå null komma én punkt fra bokskanten. Nå: 34 pt høyde, luft
     * over og under, etiketten i grå versaler og tallet stort. Enheten står i
     * grått etter tallet – den er en forklaring, ikke informasjon.
     */
    const band = (felt) => {
      const bredde = innmarg - this.MARG;
      const kb = bredde / felt.length;
      plass(44);
      const y = tilstand.y;
      P.rektangel(this.MARG, y, bredde, 34, { fyll: this.PANEL });
      felt.forEach(([navn, verdi, enhet, roed], i) => {
        const x = this.MARG + i * kb;
        if (i) P.linje(x, y + 5, x, y + 29, { farge: this.LYSGRA, tykkelse: 0.4 });
        P.tekst(x + 9, y + 13, navn.toUpperCase(), { storrelse: 6.4, farge: this.GRA });
        const br = P.tekst(x + 9, y + 27, verdi,
          { storrelse: 14, fet: true, farge: roed ? this.ROD : this.SVART });
        if (enhet) P.tekst(x + 9 + br + 3, y + 27, enhet, { storrelse: this.T5, farge: this.GRA });
      });
      tilstand.y = y + 34 + 10;
    };

    /**
     * To nøkkeltabeller ved siden av hverandre.
     *
     * DETTE ER DET SOM FYLLER SIDENE.
     * En nøkkeltabell sto strukket over hele arket: etiketten på venstre marg,
     * verdien høyrestilt på høyre marg, og 415 pt tomrom mellom dem. Målt over
     * de 25 radene i tomterapporten var blekket 19 % av bredden. Øyet mister
     * sammenhengen mellom navn og tall over den avstanden, og dokumentet leses
     * som en gissen hovedbok. Halv bredde er tett nok til å lese som par, og
     * to av dem ved siden av hverandre halverer høyden.
     */
    const toSpalter = (v1, v2) => {
      const sb = 2 * this.SPALTE + this.MELLOMROM;
      const hoyre = this.MARG + sb + 2 * this.MELLOMROM;
      const linjer = Math.max(v1 ? v1.rader.length : 0, v2 ? v2.rader.length : 0);
      plass(linjer * 13 + 42);
      // samme luft over som en vanlig overskrift, ellers klistrer tittelen seg
      // til det som sto rett over – bildeteksten spiste ringen over Å-en
      tilstand.y += 12;
      const y0 = tilstand.y;
      let bunn = y0;
      for (const [side, x] of [[v1, this.MARG], [v2, hoyre]]) {
        if (!side) continue;
        tilstand.y = y0;
        P.tekst(x, tilstand.y, side.tittel.toUpperCase(),
          { storrelse: 8.6, fet: true, farge: this.SVART });
        tilstand.y += 3.5;
        P.linje(x, tilstand.y, x + sb, tilstand.y, { tykkelse: 0.8, farge: this.SVART });
        tilstand.y += 12;
        for (const r2 of side.rader) rad(x, sb, r2[0], r2[1], r2[2], r2[3]);
        bunn = Math.max(bunn, tilstand.y);
      }
      tilstand.y = bunn + 4;
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

      /* TABELLHODET ER IKKE EN SVART BJELKE.
         En full svart bjelke over hver tabell er tyngre enn innholdet den
         merker, og med fire tabeller på en side blir siden stripet. Grå
         versaler over en tynn svart strek sier det samme uten å rope. */
      const hode = () => {
        plass(radhoyde * 2);
        let x = this.MARG;
        for (const k of kolonner) {
          const bre = k.bredde * skala;
          P.tekst(k.venstre ? x + 3 : x + bre - 3, tilstand.y, k.tekst,
            { storrelse: this.T5, fet: true, farge: this.GRA, juster: k.venstre ? 'v' : 'h' });
          x += bre;
        }
        tilstand.y += 4;
        P.linje(this.MARG, tilstand.y, innmarg, tilstand.y, { tykkelse: 0.8, farge: this.SVART });
        tilstand.y += radhoyde - 1;
      };
      hode();

      for (const rad2 of rader) {
        // brytes tabellen, skal hodet med over - ellers star kolonnene navnløse
        if (tilstand.y + radhoyde > P.hoyde - this.BUNNMARG) { nySide(); hode(); }
        const uthevet = rad2.sum;
        if (uthevet) P.rektangel(this.MARG, tilstand.y - 8, innmarg - this.MARG, radhoyde, { fyll: this.PANEL });
        let x = this.MARG;
        rad2.celler.forEach((celle, i) => {
          const k = kolonner[i], bre = k.bredde * skala;
          P.tekst(k.venstre ? x + 3 : x + bre - 3, tilstand.y, celle,
            { storrelse: st, fet: !!uthevet, farge: this.SVART, juster: k.venstre ? 'v' : 'h' });
          x += bre;
        });
        P.linje(this.MARG, tilstand.y + 3.5, innmarg, tilstand.y + 3.5,
          { farge: uthevet ? this.SVART : this.LYSGRA, tykkelse: uthevet ? 0.8 : 0.4 });
        tilstand.y += radhoyde;
      }
      tilstand.y += 6;
    };

    /* Lesetekst settes over TO spalter, ikke fire. 8,5 pt over 511 pt gir 95
       tegn per linje – dobbelt så mye som øyet klarer å følge tilbake til
       neste linjestart. */
    const brodtekst = (tekst, o = {}) => {
      const st = o.storrelse || this.T5;
      const bredde = o.bredde || (2 * this.SPALTE + this.MELLOMROM);
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
        P, t, tilstand, innmarg, nySide, plass, overskrift, nokkeltabell, toSpalter, band, tabell, brodtekst
      });
      this._bunn(P, innmarg);
      return P.bygg();
    }

    /* ---------------- side 1 ---------------- */
    nySide();
    P.tekst(this.MARG, tilstand.y, `Terrengmodell: Kartverket DTM1 (1 m laserdata) · EUREF89 UTM${app.sone}`,
      { storrelse: this.T5, farge: this.GRA });
    tilstand.y += 10;

    /* SAMME BÅND SOM TOMTA. Vegrapporten begynte med tjuefem tabellrader og
       ingen bilder – én grå masse å lete i. */
    {
      const mangler = b.manglerTotalt > 1;
      band([
        ['Veglengde', t(res.lengde, 1), 'm'],
        ['Skjæring', t(s.skjaering), 'p.f.m³'],
        ['Fylling', t(s.fylling), 'm³'],
        ['Sprengning', t(s.skjaeringFjell), 'p.f.m³'],
        [mangler ? 'Må kjøres inn' : 'Overskudd',
          t(mangler ? b.manglerTotalt : b.overskuddFjell), 'm³', mangler]
      ]);
    }

    toSpalter(
      { tittel: 'Sammendrag', rader: [
        [`Rensk / avdekking (${t(m.renskDybde, 2)} m)`, t(s.rensk) + ' m³'],
        ['Skjæring i løsmasse', t(s.skjaeringLosmasse) + ' p.f.m³'],
        ['Skjæring i fjell (sprengning)', t(s.skjaeringFjell) + ' p.f.m³'],
        ['Skjæring totalt', t(s.skjaering) + ' p.f.m³', true],
        ['Fylling (geometrisk volum)', t(s.fylling) + ' m³'],
        [`Bærelag ${t(m.baerelagTykkelse, 2)} m x ${t(m.vegbredde, 2)} m`, t(s.baerelag) + ' p.a.m³'],
        [`Slitelag ${t(m.slitelagTykkelse, 2)} m x ${t(m.slitelagBredde, 2)} m`, t(s.slitelag) + ' p.a.m³'],
        ['Fylling + bærelag', t(s.fylling + s.baerelag) + ' p.a.m³', true]
      ] },
      { tittel: 'Massebalanse', rader: [
        [`Fra fjellskjæring (x ${t(f.fjellIFylling, 2)})`, t(b.fraFjell) + ' m³'],
        [`Brukbar løsmasse (${Math.round(f.brukbarLosmasse * 100)} %)`, t(b.brukbarLos) + ' m³'],
        ['Fylling av egne masser', `${t(b.fyllFraLos + b.fyllFraFjell)} av ${t(b.fyllingBehov)} m³`],
        ['Bærelag av egen stein', `${t(b.baerelagFraFjell)} av ${t(b.baerelagBehov)} m³`],
        [b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd av sprengstein',
          t(b.manglerTotalt > 1 ? b.manglerTotalt : b.overskuddFjell) + ' m³', true,
          b.manglerTotalt > 1],
        ['Overskudd brukbar løsmasse', t(b.overskuddLos) + ' m³'],
        ['Til deponi', t(b.tilDeponi) + ' m³'],
        [`Sprengt fjell, løst (x ${t(f.sprengningsfaktor, 2)})`, t(b.fjellSprengtLos) + ' p.a.m³']
      ] });

    /* HVERT TALL GJENNOM t(), OGSÅ MALTALLENE.
       Her sto `toFixed()` og rå interpolering side om side med `t()`, og
       resultatet var at samme side skrev «270,35 m» i én tabell og «5.0 %»,
       «0.70 m», «1:1.5» og «× 1.000300» i den neste. Et norsk dokument har
       komma som desimaltegn hele veien; blandingen ser ut som om to
       forskjellige programmer har skrevet rapporten. */
    overskrift('Forutsetninger');
    nokkeltabell([
      ['Veiklasse', this._klassenavn(app)],
      ['Vegbredde inkl. skulder', t(m.vegbredde, 2) + ' m'],
      ['Tverrfall', `${t(m.tverrfall * 100, 1)} % ${m.tverrfallType === 'tak' ? '(tosidig)' : '(ensidig)'}`],
      ['Overbygning (bærelag + slitelag)', t(m.baerelagTykkelse + m.slitelagTykkelse, 2) + ' m'],
      ['Grøftedybde under planum / grøftebunn', `${t(m.grofteDybdePlanum, 2)} m / ${t(m.grofteBunn, 2)} m`],
      ['Skjæring løsmasse / fjell / fylling',
        `1:${t(m.skjaeringLosmasse, 1)} · 1:${t(m.skjaeringFjell, 1)} · 1:${t(m.fylling, 1)}`],
      ['Profilavstand', t(res.stasjoner[1] - res.stasjoner[0], 1) + ' m'],
      ['Standard dybde til fjell', t(app.P.fjell.standarddybde, 2) + ' m'],
      ['Observasjoner av fjelldybde', app.P.fjell.punkter.length + ' stk'],
      ['Lengdekorreksjon UTM til bakke',
        res.bakkefaktor === 1 ? 'ikke brukt' : 'x ' + t(res.bakkefaktor, 6)]
    ], this.MARG, innmarg - this.MARG);

    tilstand.y += 4;
    brodtekst('Volumene er regnet med gjennomsnittlig endeareal mellom profilene, med Pappus-korreksjon '
      + 'for kurvatur. Skjæring og fylling er regnet mot planum (under overbygningen) og mot terreng '
      + 'etter rensk. p.f. = prosjektert fast volum, p.a. = prosjektert anbrakt volum.');

    /* ---------------- tegninger ---------------- */
    const tegninger = Rapport.lagTegninger(res, 6);
    const lengdeBilde = await this._tilJpeg(tegninger.lengdeprofil);
    if (lengdeBilde) {
      overskrift('Lengdeprofil', (innmarg - this.MARG) * lengdeBilde.hoyde / lengdeBilde.bredde + 10);
      const bredde = innmarg - this.MARG;
      const hoyde = bredde * lengdeBilde.hoyde / lengdeBilde.bredde;
      plass(hoyde + 6);
      P.bilde(lengdeBilde.bytes, lengdeBilde.bredde, lengdeBilde.hoyde, this.MARG, tilstand.y - 6, bredde, hoyde);
      P.rektangel(this.MARG, tilstand.y - 6, bredde, hoyde, { strek: this.LYSGRA, tykkelse: 0.5 });
      tilstand.y += hoyde + 4;
    }

    if (tegninger.tverrsnitt.length) {
      overskrift('Tverrsnitt', 200);
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
          P.tekst(x, tilstand.y + hoyde + 2, `Profil ${t(q.post.s, 0)} · skjæring ${t(a.skjaering, 1)} m²`
            + ` (fjell ${t(a.skjaeringFjell, 1)}) · fylling ${t(a.fylling, 1)} m²`,
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
    const bunntekst = 'Terrenghøydene er hentet fra Kartverket sin nasjonale høydemodell (DTM1, 1x1 m fra '
      + 'flybåren laserskanning). Modellen viser terrenget slik det var ved siste skanning – kontroller mot '
      + 'befaring før kontrahering. Dybden til fjell er den største usikkerheten i sprengningsvolumet.';
    const bunnlinjer = this._brytOpp(P, bunntekst, 3 * this.SPALTE + 2 * this.MELLOMROM, this.T5 - 0.5);
    P.sider.forEach((side, i) => {
      P.side = side;
      const yb = P.hoyde - 42;
      P.linje(this.MARG, yb - 10, innmarg, yb - 10, { tykkelse: 2.5, farge: this.ROD });
      bunnlinjer.forEach((linje, j) =>
        P.tekst(this.MARG, yb + j * 8, linje, { storrelse: this.T5 - 0.5, farge: this.GRA }));
      P.tekst(innmarg, yb, 'HAUGE MASKIN', { storrelse: this.T5, fet: true, farge: this.SVART, juster: 'h' });
      P.tekst(innmarg, yb + 9.5, `Side ${i + 1} av ${P.sider.length}`,
        { storrelse: this.T5, farge: this.GRA, juster: 'h' });
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
    const { P, t, tilstand, innmarg, nySide, plass, overskrift, nokkeltabell, toSpalter, band, tabell, brodtekst } = r;
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
      const mangler = !!(b && b.manglerTotalt > 1);
      band([
        ['Areal', t(res.areal), 'm²'],
        ['Ferdig nivå', t((tt.nivaa || {}).kote, 2), 'm'],
        ['Skjæring', t(s.skjaering), 'm³'],
        ['Fylling', t(s.fylling), 'm³'],
        [mangler ? 'Må kjøres inn' : 'Overskudd',
          t(b ? (mangler ? b.manglerTotalt : Math.abs(b.balanse)) : 0), 'm³', mangler]
      ]);
    }

    /* TEGNINGENE FØR TABELLENE.
       Et bilde av tomta sett ovenfra, med skjæring i rødt og fylling i grønt,
       sier på ett blikk det tabellene under bruker en halv side på. */
    const teg = Rapport.lagTomtetegninger(res);
    const settInn = async (dataUrl, tittel, undertekst, maksHoyde) => {
      if (!dataUrl) return;
      const bilde = await this._tilJpeg(dataUrl);
      if (!bilde) return;
      let bredde = innmarg - this.MARG;
      let hoyde = bredde * bilde.hoyde / bilde.bredde;
      if (maksHoyde && hoyde > maksHoyde) { bredde *= maksHoyde / hoyde; hoyde = maksHoyde; }
      /* OVERSKRIFTEN OG BILDET HØRER SAMMEN.
         Her sto `overskrift()` først, og den ber bare om plass til seg selv.
         Da kunne «Snitt gjennom tomta» bli stående alene nederst på siden med
         tegningen på den neste. Plassen bes om for hele blokken, før noe av den
         er skrevet. */
      plass(hoyde + 46 + (undertekst ? 12 : 6));
      overskrift(tittel);
      P.bilde(bilde.bytes, bilde.bredde, bilde.hoyde, this.MARG, tilstand.y - 6, bredde, hoyde);
      P.rektangel(this.MARG, tilstand.y - 6, bredde, hoyde, { strek: this.LYSGRA, tykkelse: 0.5 });
      tilstand.y += hoyde;
      if (undertekst) {
        P.tekst(this.MARG, tilstand.y, undertekst, { storrelse: 6.8, farge: this.GRA });
        tilstand.y += 6;
      }
    };
    /* Full sidebredde på alle tre. Formatene er valgt slik at de får plass i
       høyden av seg selv – ingen nedskalering, ingen tomme felt ved siden av. */
    await settInn(teg.plan, 'Tomta ovenfra',
      'Rødt skal graves bort, grønt skal fylles opp. Sterkere farge er større avvik. '
      + 'Rutene er 10 m. Blek farge betyr at skråningen der ikke sto på egne ben.');
    await settInn(teg.perspektiv, 'Sett fra siden',
      'Samme tall, sett på skrå, så man ser hvordan skråningene legger seg i terrenget.');
    await settInn(teg.snitt, 'Snitt gjennom tomta',
      'Snittet står der du satte det i programmet.');

    const niv = tt.nivaa || {};
    const nivaatekst = niv.modus === 'fall'
      ? `${t(niv.kote, 2)} m, fall ${t((niv.fall || 0) * 100, 1)} % mot ${t(niv.fallretning || 0, 0)}°`
      : niv.modus === 'sluk'
        ? `${t(niv.kote, 2)} m, mot sluk`
        : `${t(niv.kote, 2)} m, flatt`;
    const nk = [
      ['Dypeste skjæring', t(res.dypesteSkjaering, 2) + ' m'],
      ['Høyeste fylling', t(res.hoyesteFylling, 2) + ' m']
    ];
    if (res.hoyesteVegg > 0.05) nk.push(['Høyeste bergvegg', t(res.hoyesteVegg, 2) + ' m']);
    if (res.rekkevidde > 0) nk.push(['Skråningen går lengst ut', t(res.rekkevidde, 1) + ' m']);
    nk.push(['Omrisset betyr', tt.omrissBetyr === 'yttergrense' ? 'yttergrense' : 'ferdig flate']);
    /* To og to ved siden av hverandre. Én tabell strukket over hele arket har
       415 pt tomrom mellom navnet og tallet; to halve har ingen. */
    toSpalter(
      { tittel: 'Mål og nivå', rader: [
        ['Areal, ferdig flate', t(res.areal) + ' m²'],
        ['Areal med skråninger', t(res.arealMedSkraning) + ' m²'],
        ['Omkrets', t(Tomt.omkrets(flate) * bf, 1) + ' m'],
        ['Hjørner', String(flate.length)],
        ['Ferdig nivå (NN2000)', nivaatekst, true],
        ['Overbygning over planum', t(res.overbygning, 2) + ' m']
      ] },
      { tittel: 'Nøkkeltall', rader: nk });

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

    const poster = [];
    const legg = (navn, v, uthevet) => { if (v > 0.5) poster.push([navn, t(v) + ' m³', uthevet]); };
    legg('Matjord som tas av', s.matjord);
    legg('Rensk mot fjell', s.rensk);
    legg('Skjæring totalt', s.skjaering, true);
    legg('– løsmasse', s.skjaeringLosmasse);
    legg('– fjell (sprengning)', s.skjaeringFjell);
    legg('– overberg', s.overberg);
    legg('Fylling', s.fylling, true);

    const lagrader = [];
    {
      const lagrad = (navn, v, tykk) => {
        if (v > 0.005) lagrader.push([navn + (tykk ? ` (${t(tykk, 2)} m)` : ''), t(v) + ' m³']);
      };
      lagrad('Frostsikring', s.frostsikring, m.frostsikring);
      lagrad('Forsterkningslag', s.forsterkningslag, m.forsterkningslag);
      lagrad('Bærelag', s.baerelag, m.baerelagTykkelse);
      lagrad('Avretting', s.avrettingslag, m.avrettingslag);
      lagrad('Slitelag', s.slitelag, m.slitelagTykkelse);
      const sum = s.slitelag + s.baerelag + s.forsterkningslag + s.frostsikring + s.avrettingslag;
      if (lagrader.length) lagrader.push(['Sum overbygning', t(sum) + ' m³', true]);
    }
    toSpalter(
      { tittel: 'Masser – prosjektert fast volum', rader: poster },
      lagrader.length ? { tittel: 'Byggeklart – lag som skal inn', rader: lagrader } : null);


    if (b) {
      const f = app.P.faktorer;
      const bal = [
        [`Sprengt fjell, løst på lass (x ${t(f.sprengningsfaktor, 2)})`, t(b.fjellSprengtLos) + ' p.a.m³'],
        [`Tilgjengelig til fylling (fjell x ${t(f.fjellIFylling, 2)})`, t(b.tilgjengelig) + ' m³'],
        ['Fyllingsbehov', t(b.fyllingBehov) + ' m³'],
        /* Rødt bare når det MANGLER masse. Er tallet et overskudd, er det svart
           – rødt betyr én ting i dette dokumentet, og det er «her må det inn». */
        [b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd',
          t(b.manglerTotalt > 1 ? b.manglerTotalt : Math.abs(b.balanse)) + ' m³', true,
          b.manglerTotalt > 1],
        ['Til deponi', t(b.tilDeponi) + ' m³']
      ];
      const mur = res.murLengde > 0.5 ? {
        tittel: 'Støttemur', rader: [
          ['Lengde', t(res.murLengde, 1) + ' m'],
          ['Høyeste punkt', t(res.murHoyde, 2) + ' m'],
          ['Fundamentgrøft', t(s.murFundament, 1) + ' m³'],
          ['Drenerende bakfylling', t(s.murBakfylling, 1) + ' m³']
        ]
      } : null;
      toSpalter({ tittel: 'Massebalanse', rader: bal }, mur);
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
      /* LOGOEN SKAL LIGGE FRITT, IKKE I EN BOKS.
         Her ble den malt mot #0b0b0c og lagret som JPEG. To ting gikk galt:
         JPEG kan ikke gjennomsikt, så bunnen måtte flates ut på forhånd, og
         siden JPEG er tapsbasert traff ikke den flatede svarten den svarte
         bjelken eksakt. Rundt logoen lå et lysere rektangel med ringing rundt
         bokstavene. Nå går den inn som rå RGB med en egen alfamaske, og kan
         legges på svart, hvitt eller hva som helst uten en kant.
         Fire ganger opp: Flate komprimerer flate farger nesten gratis, så
         oppløsningen koster nesten ingenting i filstørrelse. */
      const h = 26, bre = Math.round(h * bilde.naturalWidth / bilde.naturalHeight);
      const l = document.createElement('canvas');
      l.width = bre * 4; l.height = h * 4;
      const c = l.getContext('2d');
      c.clearRect(0, 0, l.width, l.height);
      c.drawImage(bilde, 0, 0, l.width, l.height);
      const d = c.getImageData(0, 0, l.width, l.height).data;
      const n = l.width * l.height;
      const rgb = new Uint8Array(n * 3), alfa = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2];
        alfa[i] = d[i * 4 + 3];
      }
      this._logoBufret = {
        bytes: rgb, alfa, bredde: l.width, hoyde: l.height, vis: bre, visHoyde: h
      };
    } catch (e) { /* uten logo gar det ogsa */ }
    return this._logoBufret;
  },

  /** Mellomrom mellom bokstavene. Helvetica sperrer ikke selv, så det gjøres her. */
  _sperret(tekst) { return String(tekst).split('').join(' '); },

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
