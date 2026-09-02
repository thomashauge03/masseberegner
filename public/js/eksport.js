'use strict';
/**
 * Eksport til de filformatene som brukes rundt et anlegg.
 *
 *   KOF       stikningsdata til totalstasjon og maskinstyring
 *   LandXML   linjeføring og lengdeprofil, leses av de fleste maskinstyringer
 *   SOSI      norsk standard for utveksling av kartdata med kommune og Kartverket
 *   DXF       tegning til AutoCAD og liknende
 *   GeoJSON   til kartverktøy og nettkart
 *   CSV       til regneark
 *
 * Formatene er skrevet etter spesifikasjonene, men de er ikke prøvd mot hvert
 * enkelt mottakersystem. Ta en prøveimport av én fil før dere baserer en jobb
 * pa dem.
 */

/* SOSI-koden for koordinatsystemet, som både KOF og SOSI trenger.
   Sto som en ternær `sone === 32 ? 22 : sone === 33 ? 23 : 25`, der alt annet
   enn 32 og 33 ble UTM35 – også sone 34 og 36, som finnes i Nord-Norge. En
   tabell kan slås opp, og det som ikke står i den skal si fra. */
const KSYS = { 32: 22, 33: 23, 34: 24, 35: 25, 36: 26 };   // EUREF89 UTM

/* Objekttypene SOSI-filen bruker.
   «Vegsenterlinje» og «Vegkant» finnes ikke i FKB-Veg – de var gjettet. En fil
   som utgir seg for å være FKB uten å være det, blir avvist av kommunen, og det
   er verre enn en fil som er ærlig om hvilken katalog den følger. Derfor står
   navnene ett sted, og filen deklarerer sin egen katalog i ..OBJEKTKATALOG.
   Skal dette bli en ekte FKB-leveranse, må navnene slås opp i Geonorge og
   byttes her – sammen med katalognavnet i hodet. */
const OBJTYPER = {
  senterlinje: 'Vegsenterlinje',
  vegkant: 'Vegkant',
  fotavtrykk: 'Vegfotavtrykk',
  tomteflate: 'Tomteflate',
  tomtegrense: 'Tomtegrense',
  skjaeringstopp: 'Skjæringstopp',
  fyllingsfot: 'Fyllingsfot',
  mur: 'Støttemur',
  bergvegg: 'Bergvegg'
};
const OBJEKTKATALOG = 'Massekalk 1.0';

const Eksport = {

  /** Punktene langs senterlinjen med vegkanter, som alle formatene bygger pa. */
  punkter(app, res) {
    const ut = [];
    for (const p of res.profiler) {
      const fall = app.fallVed(p.s);
      const vk = app.linje.punktMedAvvik(p.s, -p.halvbredde);
      const hk = app.linje.punktMedAvvik(p.s, p.halvbredde);
      ut.push({
        s: p.s,
        senter: { n: p.y, o: p.x, z: p.vegnivaa },
        venstre: { n: vk.y, o: vk.x, z: p.vegnivaa - fall.venstre * p.halvbredde },
        hoyre: { n: hk.y, o: hk.x, z: p.vegnivaa - fall.hoyre * p.halvbredde },
        terreng: p.terrengSenter
      });
    }
    return ut;
  },

  /**
   * Alt en tomteeksport trenger, samlet ett sted.
   *
   * DEN ENE FORVEKSLINGEN SOM MÅ UNNGÅS.
   * Er omrisset tegnet som YTTERGRENSE, er det tegnede polygonet
   * inngrepsgrensa – ikke tomta. Den ferdige flaten ligger innenfor, rykket inn
   * så skråningsfoten lander nøyaktig i grensa. Blandes de to, får stikkeren
   * feil polygon å sette ut, og forskjellen er hele skråningsbredden.
   * Derfor heter de `grense` og `flate`, og aldri det samme.
   */
  tomtpunkter(app, res) {
    const t = app.P.tomt;
    const omriss = app.tomtIUtm(t);
    const flate = app._innerflate || omriss;
    const niv = app.tomtenivaaIUtm(t);
    const ref = Tomt.tyngdepunkt(flate);
    const ob = res.overbygning || 0;
    const zF = q => Tomtmasser.nivaaVed(niv, q.x, q.y, ref);
    return {
      omriss, flate, ob, nivaa: niv,
      erYttergrense: t.omrissBetyr === 'yttergrense',
      hjorner: flate.map((q, i) => ({
        nr: i + 1, x: q.x, y: q.y, zFerdig: zF(q), zPlanum: zF(q) - ob
      })),
      grense: omriss.map((q, i) => ({ nr: i + 1, x: q.x, y: q.y })),
      /* Kantene med behandlingen sin. `Tomt.kanter` hopper over kanter uten
         lengde, men beholder `nr` som peker inn i punktlisten - derfor slås
         behandlingen opp på `nr`, ikke på plassen i lista. */
      kanter: Tomt.kanter(flate).map(k => Object.assign({}, k, (t.kanter || [])[k.nr] || {})),
      fot: res.skraningsfot || [],
      rutenett: res.rutenett || []
    };
  },

  /**
   * Skråningsfoten delt i sammenhengende strekninger.
   *
   * Foten er ikke én linje. Der skråningen ikke landet – fordi den ble stoppet
   * i tomtegrensa, fordi den henger i lufta, eller fordi terrengdataene tok
   * slutt – finnes det ingen fot å sette ut. En sammenhengende strek tvers over
   * det bruddet ville påstått en inngrepsgrense som ikke er regnet.
   *
   * @returns {Array<{type:string, punkt:Array, komplett:boolean}>}
   */
  fotstrekk(fot) {
    const ut = [];
    let na = null;
    for (const f of fot) {
      const brukbar = f.traff === true && f.type !== 'apen' && Number.isFinite(f.z);
      if (!brukbar) { na = null; continue; }
      if (!na || na.type !== f.type) { na = { type: f.type, punkt: [] }; ut.push(na); }
      na.punkt.push(f);
    }
    return ut.filter(s => s.punkt.length > 1);
  },

  /** Er hele foten rundt kjent? Bare da kan utslaget tegnes som en lukket flate. */
  fotErKomplett(fot) {
    return fot.length > 2 && fot.every(f => f.type === 'apen' || (f.traff === true && Number.isFinite(f.z)));
  },

  /**
   * KOF – Koordinat- og observasjonsformat.
   *
   * Kolonnebasert: felttype, punktnavn, kode, nord, øst, høyde. 05 er en
   * koordinatlinje. Punktnavnet holdes kort, for mange instrumenter kutter
   * det som er lengre enn ti tegn.
   *
   * TO TING SOM MÅ VÆRE PÅ PLASS, OG SOM IKKE VAR DET.
   *
   * 01-BLOKKA. Den bærer K.sys – SOSI-koden for koordinatsystemet – og
   * enhetsfeltet, der sifferet rett etter `$` sier hvilken koordinat som kommer
   * først (1 = nord, 2 = øst). Massekalk skriver nord først, men sa det ingen
   * steder. En leser som forvalgt tar øst først, leser da et punkt på Vestlandet
   * som et punkt i Indiahavet. Og uten K.sys må mottakeren gjette projeksjonen:
   * ED50 UTM33 og EUREF89 UTM33 skiller 100–200 m i Norge.
   *
   * FELTBREDDENE. Alle tre koordinatene ble skrevet med bredde 12 uten
   * skilletegn. Da havnet høyden to kolonner utenfor sitt eget felt, og en
   * leser som holder seg til spesifikasjonen kuttet millimeteren – alltid
   * nedover. Feltene er 12 / 11 / 8 med én blank imellom.
   */
  kofHode(app, merknader = []) {
    const ks = KSYS[app.sone];
    if (!ks) throw new Error('Ukjent UTM-sone ' + app.sone
      + ' – KOF kan ikke skrives uten koordinatsystemkode');
    const d = new Date();
    const dato = String(d.getDate()).padStart(2, '0')
      + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
    const rader = [
      '-05 ' + this.tekst(app.P.navn, 30),
      '-05 Massekalk ' + d.toISOString().slice(0, 16).replace('T', ' ')
        + '  EUREF89 UTM' + app.sone + '  høyder NN2000'
    ];
    for (const m of merknader) rader.push('-05 MERK: ' + String(m).replace(/[\r\n]+/g, ' '));
    // $1 = nord først, som filen faktisk er skrevet
    rader.push(' 01 ' + this.tekst('Massekalk', 12) + ' ' + dato + '   2 '
      + String(ks).padStart(7) + ' 0000 $11100000000');
    rader.push('.PUNKT');
    return rader;
  },

  /** Én 05-linje med feltbreddene spesifikasjonen setter. */
  kofPunkt(navn, kode, n, o, z) {
    for (const [hva, v] of [['nord', n], ['øst', o], ['høyde', z]]) {
      if (!Number.isFinite(v)) throw new Error(`Punkt ${navn} mangler ${hva}`);
    }
    return ' 05 ' + this.tekst(navn, 10) + ' ' + this.tekst(kode, 8) + ' '
      + n.toFixed(3).padStart(12) + ' ' + o.toFixed(3).padStart(11) + ' '
      + z.toFixed(3).padStart(8);
  },

  /**
   * Navnegiveren for en KOF-fil.
   *
   * Punktnavnet var `Math.round(pt.s)`. Er sluttstasjonen 227,4 m, het det
   * siste punktet S227 – et navn som peker 0,4 m feil – og lå sluttstasjonen
   * nærmere enn en halv meter etter siste rutenettsteg, fikk to profiler
   * samme navn. Duplikate punktnavn i en maskinstyring er ikke en skjønnhets-
   * feil: det ene punktet overskriver det andre.
   *
   * I en samlefil gjelder det på tvers av anlegg også: to veger har begge en
   * profil 0, og uten prefiks ville S0 fra den ene overskrevet S0 fra den
   * andre. Derfor eier navnegiveren settet, og den lever så lenge FILEN gjør –
   * ikke så lenge ett anlegg gjør.
   *
   * Ti tegn er taket mange instrumenter kutter ved. Kappes navnet, kan to navn
   * bli like uten at noen ser det – derfor sjekkes settet ETTER kappingen.
   */
  kofNavner(pre = '') {
    const brukt = new Set();
    return base => {
      const n = (pre + base).slice(0, 10);
      if (brukt.has(n)) throw new Error('To punkt fikk samme navn i KOF: ' + n);
      brukt.add(n);
      return n;
    };
  },

  /** Koordinatlinjene for en veg, uten hode. */
  kofKroppVeg(app, res, navner) {
    const rader = [];
    const navn = (bokstav, s) =>
      navner(bokstav + (Number.isInteger(s) ? String(s) : s.toFixed(1).replace('.', '_')));
    for (const pt of this.punkter(app, res)) {
      rader.push(this.kofPunkt(navn('S', pt.s), 'SENTER', pt.senter.n, pt.senter.o, pt.senter.z));
      rader.push(this.kofPunkt(navn('V', pt.s), 'VKANT', pt.venstre.n, pt.venstre.o, pt.venstre.z));
      rader.push(this.kofPunkt(navn('H', pt.s), 'HKANT', pt.hoyre.n, pt.hoyre.o, pt.hoyre.z));
    }
    return rader;
  },

  kof(app, res) {
    const rader = this.kofHode(app);
    for (const r of this.kofKroppVeg(app, res, this.kofNavner())) rader.push(r);
    return rader.join('\r\n') + '\r\n';
  },

  /**
   * LandXML – linjeføring med lengdeprofil.
   *
   * Rettstrekk og sirkelkurver skrives som egne elementer, slik at
   * maskinstyringen far den samme geometrien og ikke en kjede korder.
   * Merk at LandXML oppgir punkt som "nord øst", ikke omvendt.
   */
  /**
   * Hodet og halen i en LandXML-fil – likt for én modell og for en samlefil.
   *
   * Ett `<CoordinateSystem>` per fil. Det er også hele grunnen til at en
   * samlefil er bedre enn tre enkeltfiler: mottakeren får ETT system, og
   * modellene kan ikke havne i hver sin projeksjon ved et uhell.
   */
  landxmlDokument(app, kropp) {
    const nå = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${nå.slice(0, 10)}" time="${nå.slice(11, 19)}">
  <Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
  <Application name="Massekalk" manufacturer="Hauge Maskin" version="1.0"/>
  <CoordinateSystem epsgCode="${Geo.epsg(app.sone)}" horizontalDatum="ETRS89" verticalDatum="NN2000"/>
${kropp}
</LandXML>
`;
  },

  /**
   * Linjeføringen som ett `<Alignment>`, uten dokumentet rundt.
   *
   * `navn` er det modellen skal hete i mottakersystemet. I en samlefil er det
   * anleggsnavnet – to alignments som begge heter prosjektnavnet er ikke to
   * modeller, det er én modell og en navnekollisjon.
   */
  landxmlAlignment(app, res, navn) {
    const linje = app.linje;
    /* NEKT HELLER ENN Å SKRIVE EN TOM MODELL.
       Uten linjeføring skrev denne en velformet fil på ~800 tegn med
       length="0.0000", tomt <CoordGeom> og tomt <ProfAlign>. Brukeren fikk
       «Eksporterte …», filen åpnet uten en eneste feilmelding i maskinstyringa,
       og at det ikke fantes en meter linje i den ble oppdaget på plassen.
       Det var den farligste utdataen i hele programmet. */
    if (!linje || !linje.elementer || !linje.elementer.length || !(linje.lengde > 0)) {
      throw new Error('Ingen linjeføring å skrive – LandXML for veg krever minst to knekkpunkt');
    }
    const nk = p => `${p.y.toFixed(4)} ${p.x.toFixed(4)}`;

    const elementer = linje.elementer.map(el => {
      if (el.type === 'linje') {
        return `        <Line length="${el.lengde.toFixed(4)}" staStart="${el.s0.toFixed(4)}">
          <Start>${nk({ x: el.x1, y: el.y1 })}</Start>
          <End>${nk({ x: el.x2, y: el.y2 })}</End>
        </Line>`;
      }
      const a = linje.punktVed(el.s0), b = linje.punktVed(el.s0 + el.lengde);
      /* PI er tangentskjæringspunktet, altsa selve knekkpunktet - ikke
         midtpunktet pa buen. Med buemidtpunktet ble geometrien inntil 12 m
         feil i en krapp sving for lesere som bygger linja opp fra PI. */
      const kurve = linje.kurver.find(k => Math.abs(k.sBC - el.s0) < 1e-6);
      const pi = kurve && kurve.ipPunkt ? kurve.ipPunkt : linje.punktVed(el.s0 + el.lengde / 2);
      return `        <Curve rot="${el.tegn > 0 ? 'ccw' : 'cw'}" radius="${el.r.toFixed(4)}" length="${el.lengde.toFixed(4)}" staStart="${el.s0.toFixed(4)}">
          <Start>${nk(a)}</Start>
          <Center>${nk({ x: el.cx, y: el.cy })}</Center>
          <End>${nk(b)}</End>
          <PI>${nk(pi)}</PI>
        </Curve>`;
    }).join('\n');

    /* Lengdeprofilen ma ha vertikalkurvene med.
       Her sto det bare `<PVI>` for hvert knekkpunkt, og da leser mottakeren
       lengdeprofilen som en kjede rette strekk med skarpe brekk. Forskjellen
       er ikke liten: en kurve med K=2 over et stigningsbrudd pa 20 % er 40 m
       lang, og veien ligger da 1,0 m lavere i høybrekket enn de rene
       knekkpunktene sier. Det tallet gar rett inn i maskinstyringen.

       LandXML uttrykker en parabolsk vertikalkurve som <ParaCurve> i stedet
       for <PVI> pa selve knekkpunktet, med kurvelengden som attributt. */
    const vp = app.vprofil && Array.isArray(app.vprofil.kurver)
      ? app.vprofil : new Vertikalprofil(app.P.vip);
    const pvi = vp.vip.map((v, i) => {
      const kurve = (vp.kurver || []).find(c => c.vip === i);
      return kurve && kurve.L > 1e-6
        ? `          <ParaCurve length="${kurve.L.toFixed(4)}">${v.s.toFixed(4)} ${v.z.toFixed(4)}</ParaCurve>`
        : `          <PVI>${v.s.toFixed(4)} ${v.z.toFixed(4)}</PVI>`;
    }).join('\n');

    return `    <Alignment name="${this.xml(navn)}" length="${linje.lengde.toFixed(4)}" staStart="0">
      <CoordGeom>
${elementer}
      </CoordGeom>
      <Profile name="Lengdeprofil">
        <ProfAlign name="Veglinje">
${pvi}
        </ProfAlign>
      </Profile>
    </Alignment>`;
  },

  landxml(app, res) {
    const navn = app.P.navn;
    return this.landxmlDokument(app, `  <Alignments name="${this.xml(navn)}">
${this.landxmlAlignment(app, res, navn)}
  </Alignments>`);
  },

  /**
   * SOSI – norsk standard for kartdata.
   *
   * Koordinatene oppgis i hele centimeter, som ENHET 0.01 sier. Filen far
   * senterlinjen som en kurve og fotavtrykket som en flate.
   */
  /**
   * Objektene en veg bidrar med, uten hode og uten `.SLUTT`.
   *
   * OBJEKTNUMMERET ER UNIKT I FILEN, IKKE I MODELLEN.
   * Her sto 1, 2 og 3 fast. I en samlefil ville hver eneste veg fått de samme
   * tre numrene, og en SOSI-leser som slår opp `..REF :2` finner da tre
   * kandidater. Nummereringen kommer derfor utenfra og telles opp gjennom hele
   * filen.
   *
   * @returns {{rader:Array<string>, omr:Object, niva:number, nesteId:number}}
   */
  sosiDelerVeg(app, res, idFra = 1, navn = null) {
    const punkter = this.punkter(app, res);
    const cm = v => Math.round(v * 100);
    // omradet ma dekke alt som faktisk star i filen, ikke bare senterlinjen
    let minN = Infinity, maksN = -Infinity, minO = Infinity, maksO = -Infinity;
    for (const p of punkter) {
      for (const q of [p.senter, p.venstre, p.hoyre]) {
        minN = Math.min(minN, q.n); maksN = Math.max(maksN, q.n);
        minO = Math.min(minO, q.o); maksO = Math.max(maksO, q.o);
      }
    }
    const rader = [];
    let id = idFra;

    rader.push('.KURVE ' + (id++) + ':');
    rader.push('..OBJTYPE ' + OBJTYPER.senterlinje);
    /* Sto som `..VEGNAVN <navn>`, som ikke er en SOSI-egenskap, og verdien var
       ikke i anførselstegn. Et prosjektnavn med mellomrom brøt da strukturen. */
    rader.push('..NAVN ' + this.sosiTekst(navn || app.P.navn));
    rader.push('..NØH');
    for (const p of punkter) rader.push(`${cm(p.senter.n)} ${cm(p.senter.o)} ${cm(p.senter.z)}`);

    for (const side of ['venstre', 'hoyre']) {
      rader.push('.KURVE ' + (id++) + ':');
      rader.push('..OBJTYPE ' + OBJTYPER.vegkant);
      if (navn) rader.push('..NAVN ' + this.sosiTekst(navn));
      rader.push('..NØH');
      for (const p of punkter) rader.push(`${cm(p[side].n)} ${cm(p[side].o)} ${cm(p[side].z)}`);
    }

    return { rader, omr: { minN, maksN, minO, maksO }, niva: 2, nesteId: id };
  },

  sosi(app, res) {
    const d = this.sosiDelerVeg(app, res, 1);
    const rader = this.sosiHode(app, d.omr, d.niva).concat(d.rader);
    rader.push('.SLUTT');
    return rader.join('\r\n') + '\r\n';
  },

  /**
   * SOSI-hodet, felles for veg og tomt.
   *
   * OMRÅDET STÅR I HELE METER, IKKE I ENHETER.
   * Her sto det centimeter, som koordinatlinjene gjør – men ...ENHET 0.01
   * gjelder koordinatene, ikke ..OMRÅDE. Et område hundre ganger for stort
   * dekker riktignok alt som står i filen, så ingen leser klager; det er
   * kommunen som ser en tomt på 200 km² i innsynsløsningen.
   */
  sosiHode(app, omr, niva) {
    const ks = KSYS[app.sone];
    if (!ks) throw new Error('Ukjent UTM-sone ' + app.sone
      + ' – SOSI kan ikke skrives uten koordinatsystemkode');
    const d = new Date();
    const dato = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    return [
      '.HODE',
      '..TEGNSETT UTF-8',
      '..TRANSPAR',
      '...KOORDSYS ' + ks,
      /* Høydene er NN2000. Star det ingenting, tolker mottakeren dem etter sin
         egen forvalgte referanse - og er den NN54, forskyves hele profilen med
         et par desimeter uten at noen ser det. */
      '...VERT-DATUM NN2000',
      '...ORIGO-NØ 0 0',
      '...ENHET 0.01',
      '..OMRÅDE',
      `...MIN-NØ ${Math.floor(omr.minN)} ${Math.floor(omr.minO)}`,
      `...MAX-NØ ${Math.ceil(omr.maksN)} ${Math.ceil(omr.maksO)}`,
      '..SOSI-VERSJON 4.5',
      '..SOSI-NIVÅ ' + niva,
      /* Filen deklarerer sin egen katalog. Uten dette bandt objekttypene mot
         ingenting, og navn som «Vegkant» så ut som FKB uten å finnes der. */
      '..OBJEKTKATALOG ' + this.sosiTekst(OBJEKTKATALOG),
      '..DATO ' + dato
    ];
  },

  /** SOSI-tekstverdi: i anførselstegn, med doble anførselstegn inni. */
  sosiTekst(s) {
    return '"' + String(s).replace(/[\r\n]+/g, ' ').slice(0, 60).replace(/"/g, '""') + '"';
  },

  /**
   * DXF – enkel tegning med senterlinje, vegkanter og fotavtrykk.
   *
   * Skrevet som R12-ASCII, som er det formatet flest program leser uten
   * innsigelser.
   */
  /**
   * Lagnavn i en samlefil: modellens navn foran tegningens eget lagnavn.
   *
   * R12 tåler ikke mellomrom, æøå eller de fleste skilletegn i et lagnavn – en
   * tegning med et ulovlig lagnavn åpner enten ikke, eller åpner med lagene
   * slått sammen. Derfor renskes navnet ned til det formatet faktisk godtar,
   * og kappes så tegneren fortsatt kan lese hva laget er.
   */
  dxfLagpre(navn) {
    const rent = String(navn || '')
      .replace(/[æÆ]/g, 'AE').replace(/[øØ]/g, 'OE').replace(/[åÅ]/g, 'AA')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return rent ? rent.slice(0, 16) + '_' : '';
  },

  /** Tegningsobjektene for en veg, uten SECTION-rammen. */
  dxfKroppVeg(app, res, lagpre = '') {
    const p = this.punkter(app, res);
    const ut = [];
    const par = (kode, verdi) => { ut.push(String(kode)); ut.push(String(verdi)); };

    /* `lukket` setter bit 1 i 70-flagget. Uten den hadde fotavtrykket et gap på
       hele jordarbeidsbredden ved profil 0 - målt 9,7 m - og en flate med et
       hull i er ingen flate. Å duplisere startpunktet i stedet gir en strekning
       uten lengde, som enkelte lesere klager på. */
    const polylinje = (lag, farge, punkt, lukket) => {
      const navn = lagpre + lag;
      par(0, 'POLYLINE'); par(8, navn); par(62, farge); par(66, 1);
      par(70, 8 | (lukket ? 1 : 0));
      for (const q of punkt) {
        par(0, 'VERTEX'); par(8, navn); par(70, 32);
        par(10, q.o.toFixed(4)); par(20, q.n.toFixed(4)); par(30, (q.z || 0).toFixed(4));
      }
      par(0, 'SEQEND'); par(8, navn);
    };
    this._dxfPolylinje = polylinje;
    polylinje('SENTERLINJE', 1, p.map(q => q.senter));
    polylinje('VEGKANT', 3, p.map(q => q.venstre));
    polylinje('VEGKANT', 3, p.map(q => q.hoyre));

    /* FOTAVTRYKKET SKAL LIGGE DER DET LIGGER I TERRENGET.
       Her sto `z: 0`, og da lå hele skråningsfoten hundre meter under vegen.
       Bygde noen en Civil 3D-flate på laget, dro den seg ned til havnivået.
       Kotene måles med jordflate() på nøyaktig den offseten som skrives ut. */
    const fot = [];
    for (const pr of res.profiler) {
      const q = app.linje.punktMedAvvik(pr.s, pr.fotVenstre);
      fot.push({ n: q.y, o: q.x, z: pr.zFotVenstre });
    }
    for (let i = res.profiler.length - 1; i >= 0; i--) {
      const pr = res.profiler[i];
      const q = app.linje.punktMedAvvik(pr.s, pr.fotHoyre);
      fot.push({ n: q.y, o: q.x, z: pr.zFotHoyre });
    }
    polylinje('FOTAVTRYKK', 2, fot, true);

    /* Profilnummer hvert femtiende meter.
       Sto som `Math.round(q.s) % 50 !== 0`, som treffer der profilavstanden og
       50 har felles multiplum. Med profilavstand 7 m fikk en 226 m lang veg ETT
       profilnummer - på stasjon 0. Nå hentes punktene fra linja i stedet. */
    const antall = Math.floor(app.linje.lengde / 50);
    for (let k = 0; k <= antall; k++) {
      const q = app.linje.punktVed(k * 50);
      if (!q || !Number.isFinite(q.x)) continue;
      par(0, 'TEXT'); par(8, lagpre + 'PROFILNUMMER'); par(62, 7);
      par(10, q.x.toFixed(4)); par(20, q.y.toFixed(4)); par(30, '0');
      par(40, '2'); par(1, String(k * 50));
    }
    return ut;
  },

  /** Rammen rundt en DXF – én per fil, uansett hvor mange modeller som står i den. */
  dxfDokument(kropp) {
    return ['0', 'SECTION', '2', 'ENTITIES']
      .concat(kropp, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  },

  dxf(app, res) {
    return this.dxfDokument(this.dxfKroppVeg(app, res));
  },


  /* ================================================================
     TOMTEMODUS

     En tomt har ingen senterlinje. Alt det veg-eksporten bygger på –
     stasjoner, tverrprofiler, lengdeprofil – finnes ikke. Derfor har hvert
     format sin egen tomtevei, og ingen av dem later som om det finnes en
     linje gjennom tomta.

     Én regel går igjen i alle fire: en lukket kontur er et LØFTE om at
     inngrepsgrensa er kjent hele veien rundt. Landet ikke skråningen på en
     side, skrives foten som åpne strekninger med merknad – aldri lukket.
     ================================================================ */

  /**
   * KOF for en tomt: punktene noen skal ut og sette av.
   *
   * Rutenettet hører ikke hjemme her. KOF er et utsettingsformat, ikke en
   * modell – tusen punkt i en fil stikkeren skal lese på et instrument er
   * ubrukelig. Hjørnene, grensa, utslaget og murene er det som stikkes.
   */
  /** Merknadene tomte-KOF-en bærer i hodet – de hører til dataene, ikke til filen. */
  kofMerknaderTomt(d) {
    const uten = d.fot.filter(f => f.type !== 'apen' && f.traff !== true).length;
    const merk = [];
    if (uten) {
      merk.push(`utslagslinja mangler ${uten} punkt – skraningen landet ikke der. `
        + 'De er utelatt, ikke satt til null.');
    }
    if (d.erYttergrense) {
      merk.push('G-punktene er tomtegrensa (utslagsgrense). F/P-punktene er ferdig flate innenfor.');
    }
    return merk;
  },

  /** Koordinatlinjene for en tomt, uten hode. */
  kofKroppTomt(app, res, navner, d) {
    d = d || this.tomtpunkter(app, res);
    const rader = [];
    const nr2 = n => String(n).padStart(2, '0');
    const nr4 = n => String(n).padStart(4, '0');

    for (const h of d.hjorner) {
      if (!Number.isFinite(h.zFerdig)) continue;
      rader.push(this.kofPunkt(navner('F' + nr2(h.nr)), 'FERDIG', h.y, h.x, h.zFerdig));
      rader.push(this.kofPunkt(navner('P' + nr2(h.nr)), 'PLANUM', h.y, h.x, h.zPlanum));
    }
    if (d.erYttergrense) {
      for (const g of d.grense) {
        const naer = Tomtmasser.naermestePaOmriss(d.flate, g.x, g.y);
        const z = Tomtmasser.nivaaVed(d.nivaa, naer.x, naer.y, Tomt.tyngdepunkt(d.flate)) - d.ob;
        if (!Number.isFinite(z)) continue;
        rader.push(this.kofPunkt(navner('G' + nr2(g.nr)), 'GRENSE', g.y, g.x, z));
      }
    }
    /* Utslagspunktene tynnes til minst to meter mellom hvert. Marsjen legger et
       punkt hver halvmeter, og fire ganger så mange punkt gjør ingen jobb
       lettere – de gjør bare instrumentlista uleselig. */
    let k = 0, forrige = null;
    for (const f of d.fot) {
      if (f.type === 'apen' || f.traff !== true || !Number.isFinite(f.z)) continue;
      if (forrige && Math.hypot(f.x - forrige.x, f.y - forrige.y) < 2) continue;
      forrige = f;
      rader.push(this.kofPunkt(navner('U' + nr4(++k)),
        f.type === 'skjaering' ? 'SKJTOPP' : 'FYLLFOT', f.y, f.x, f.z));
    }
    for (const m of this.murpunkter(d)) {
      rader.push(this.kofPunkt(navner(m.navn), m.kode, m.y, m.x, m.z));
    }
    return rader;
  },

  kofTomt(app, res) {
    const d = this.tomtpunkter(app, res);
    const rader = this.kofHode(app, this.kofMerknaderTomt(d));
    for (const r of this.kofKroppTomt(app, res, this.kofNavner(), d)) rader.push(r);
    if (rader.filter(r => r.startsWith(' 05')).length === 0) {
      throw new Error('Ingen punkt å skrive – tomta har ingen ferdig kote ennå');
    }
    return rader.join('\r\n') + '\r\n';
  },

  /**
   * Topp- og bunnpunkt langs mur- og bergveggkanter.
   *
   * Det er de to linjene som faktisk bygges. En mur satt ut bare på toppen kan
   * ikke fundamenteres, og en bergvegg uten bunnlinje sier ingenting om hvor
   * dypt det skal sprenges.
   */
  murpunkter(d) {
    const ut = [];
    let iM = 0, iB = 0;
    for (const k of d.kanter) {
      const type = k.type || 'skraning';
      if (type !== 'mur' && type !== 'fjellvegg') continue;
      const a = d.flate[k.nr], b = d.flate[(k.nr + 1) % d.flate.length];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.round(len / 2));
      const merket = type === 'mur' ? 'M' + String(++iM).padStart(2, '0')
        : 'B' + String(++iB).padStart(2, '0');
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        /* Foten på denne kanten forteller hvor høyt det står. Finnes ingen fot
           her, hoppes punktet over – en mur uten kjent høyde er ikke noe å
           sette ut. */
        const naer = d.fot.filter(q => q.kant === k.nr && Number.isFinite(q.z));
        if (!naer.length) continue;
        const nrst = naer.reduce((m, q) =>
          Math.hypot(q.xKant - x, q.yKant - y) < Math.hypot(m.xKant - x, m.yKant - y) ? q : m);
        const topp = type === 'mur' ? nrst.zKant + d.ob : nrst.z;
        const bunn = type === 'mur' ? nrst.z : nrst.zKant;
        if (!Number.isFinite(topp) || !Number.isFinite(bunn)) continue;
        const navn = merket + '_' + String(i).padStart(2, '0');
        ut.push({ navn: navn.slice(0, 9) + 't', kode: type === 'mur' ? 'MURTOPP' : 'BERGTOPP', x, y, z: topp });
        ut.push({ navn: navn.slice(0, 9) + 'b', kode: type === 'mur' ? 'MURBUNN' : 'BERGBUNN', x, y, z: bunn });
      }
    }
    return ut;
  },

  /** SOSI for en tomt: en flate med grenser, ikke tre kurver. */
  sosiDelerTomt(app, res, idFra = 1, navn = null) {
    const d = this.tomtpunkter(app, res);
    const cm = v => Math.round(v * 100);
    let minN = Infinity, maksN = -Infinity, minO = Infinity, maksO = -Infinity;
    const sett = q => {
      minN = Math.min(minN, q.y); maksN = Math.max(maksN, q.y);
      minO = Math.min(minO, q.x); maksO = Math.max(maksO, q.x);
    };
    d.flate.forEach(sett); d.omriss.forEach(sett);
    d.fot.forEach(f => { if (f.traff === true) sett(f); });
    if (!Number.isFinite(minN)) throw new Error('Tomta har ingen geometri å skrive');

    const rader = [];
    let id = idFra - 1;
    const tp = Tomt.tyngdepunkt(d.flate);
    const zVed = q => {
      const z = Tomtmasser.nivaaVed(d.nivaa, q.x, q.y, tp);
      return Number.isFinite(z) ? z : 0;
    };

    const kurve = (objtype, punkt, zAv) => {
      if (punkt.length < 2) return 0;
      const n = ++id;
      rader.push(`.KURVE ${n}:`);
      rader.push('..OBJTYPE ' + objtype);
      rader.push('..NØH');
      for (const q of punkt) rader.push(`${cm(q.y)} ${cm(q.x)} ${cm(zAv(q))}`);
      return n;
    };

    // ferdig flate: avgrensningskurve, så flata som viser til den
    const ring = d.flate.concat([d.flate[0]]);
    const iRing = kurve(OBJTYPER.tomteflate + 'Grense', ring, q => zVed(q));
    const iFlate = ++id;
    rader.push(`.FLATE ${iFlate}:`);
    rader.push('..OBJTYPE ' + OBJTYPER.tomteflate);
    rader.push('..NAVN ' + this.sosiTekst(navn || app.P.navn));
    rader.push('..REF :' + iRing);
    rader.push('..NØH');
    rader.push(`${cm(tp.y)} ${cm(tp.x)} ${cm(zVed(tp))}`);

    if (d.erYttergrense) {
      kurve(OBJTYPER.tomtegrense, d.omriss.concat([d.omriss[0]]), q => zVed(q) - d.ob);
    }
    /* Utslaget deles ved hvert brudd. Én kurve tvers over et sted der
       skråningen ikke landet, ville påstått en inngrepsgrense som ikke finnes. */
    for (const s of this.fotstrekk(d.fot)) {
      kurve(s.type === 'skjaering' ? OBJTYPER.skjaeringstopp : OBJTYPER.fyllingsfot,
        s.punkt, q => q.z);
    }
    for (const k of d.kanter) {
      const type = k.type || 'skraning';
      if (type !== 'mur' && type !== 'fjellvegg') continue;
      const a = d.flate[k.nr], b = d.flate[(k.nr + 1) % d.flate.length];
      if (a && b) kurve(type === 'mur' ? OBJTYPER.mur : OBJTYPER.bergvegg, [a, b], q => zVed(q));
    }
    // .FLATE krever nivå 4; på nivå 2 finnes bare punkt og kurver
    return { rader, omr: { minN, maksN, minO, maksO }, niva: 4, nesteId: id + 1 };
  },

  sosiTomt(app, res) {
    const d = this.sosiDelerTomt(app, res, 1);
    const rader = this.sosiHode(app, d.omr, d.niva).concat(d.rader);
    rader.push('.SLUTT');
    return rader.join('\r\n') + '\r\n';
  },

  /** DXF for en tomt: lagene en tegner faktisk vil ha fra hverandre. */
  /** Tegningsobjektene for en tomt, uten SECTION-rammen. */
  dxfKroppTomt(app, res, lagpre = '') {
    const d = this.tomtpunkter(app, res);
    const ut = [];
    const par = (kode, verdi) => { ut.push(String(kode)); ut.push(String(verdi)); };
    const polylinje = (lag, farge, punkt, lukket) => {
      if (punkt.length < 2) return;
      const navn = lagpre + lag;
      par(0, 'POLYLINE'); par(8, navn); par(62, farge); par(66, 1);
      par(70, 8 | (lukket ? 1 : 0));
      for (const q of punkt) {
        par(0, 'VERTEX'); par(8, navn); par(70, 32);
        par(10, q.x.toFixed(4)); par(20, q.y.toFixed(4)); par(30, (q.z || 0).toFixed(4));
      }
      par(0, 'SEQEND'); par(8, navn);
    };
    const lukk = a => a.concat([a[0]]);

    polylinje('FERDIG_NIVAA', 3, d.hjorner.map(h => ({ x: h.x, y: h.y, z: h.zFerdig })), true);
    polylinje('PLANUM', 4, d.hjorner.map(h => ({ x: h.x, y: h.y, z: h.zPlanum })), true);
    /* Uten en 2D-polylinje kan ingen skravere flaten: en 3D-polylinje godtas
       ikke som HATCH-grense i AutoCAD, uansett lukket-bit. Derfor kommer
       flaten også som LWPOLYLINE på fast kote. */
    if (d.hjorner.length > 2 && Number.isFinite(d.hjorner[0].zFerdig)) {
      par(0, 'LWPOLYLINE'); par(8, lagpre + 'FERDIG_NIVAA_2D'); par(62, 3);
      par(90, d.hjorner.length); par(70, 1); par(38, d.hjorner[0].zFerdig.toFixed(4));
      for (const h of d.hjorner) { par(10, h.x.toFixed(4)); par(20, h.y.toFixed(4)); }
    }
    if (d.erYttergrense) {
      /* KOTE 0 ER HAVNIVÅ, IKKE «INGEN KOTE».
         Her sto `z: 0` hardkodet, mens de samme punktene får ekte planumskote
         i KOF, SOSI og LandXML. Målt på en tomt med ferdig kote 98,00 og
         0,55 m overbygning: KOF gir 97,450, LandXML 97,4500, DXF ga 0,0000 –
         i den samme fila der FERDIG_NIVAA ligger på 98,0000. Usynlig i plan,
         men snapper man mot laget, eller lager en Civil 3D-flate av det, drar
         geometrien 97 meter ned til havflaten. Nøyaktig det kommentaren over
         FOTAVTRYKK sier ble rettet der. */
      const tpG = Tomt.tyngdepunkt(d.flate);
      polylinje('TOMTEGRENSE', 7, lukk(d.omriss.map(q => ({
        x: q.x, y: q.y, z: Tomtmasser.nivaaVed(d.nivaa, q.x, q.y, tpG) - d.ob
      }))), true);
    }
    for (const s of this.fotstrekk(d.fot)) {
      polylinje(s.type === 'skjaering' ? 'SKJAERINGSTOPP' : 'FYLLINGSFOT',
        s.type === 'skjaering' ? 1 : 2, s.punkt, false);
    }
    /* Hele utslaget som én lukket kontur – men BARE når foten er kjent hele
       veien rundt. Ellers er den lukkede konturen en påstand om noe som ikke
       er regnet, og da leveres de usikre bitene for seg. */
    if (this.fotErKomplett(d.fot)) {
      polylinje('UTSLAG', 5, lukk(d.fot.filter(f => f.type !== 'apen')), true);
    } else {
      const usikker = d.fot.filter(f => f.type !== 'apen' && f.traff !== true);
      if (usikker.length > 1) polylinje('UTSLAG_USIKKER', 6, usikker, false);
    }
    /* ÉN POLYLINJE PER MUR, IKKE ALLE MURENE PER MUR.
       Her sto `this.murpunkter(d)` inne i løkka, filtrert bare på M/B – altså
       prefikset som skiller mur fra bergvegg, ikke den ene muren fra den
       andre. Med to murkanter ga det fire polylinjer der hver inneholdt BEGGE
       murene, og mellom dem et sprang tvers over tomta: målt 42 vertekser og
       140,00 m per linje der riktig er 21 og 40,00 m. Tegnet murlengde ble
       560 m mot 160 riktige, og tegningen viste en mur langs en kant som er
       skråning. Bergveggen hadde samme feil.
       Punktene regnes derfor én gang, og hver kant plukker sitt eget merke –
       `M01`, `M02` … – med tellere som går i samme rekkefølge som i
       `murpunkter`, siden begge løkkene går over `d.kanter` og hopper over de
       samme kantene. */
    const alleMur = this.murpunkter(d);
    let iMur = 0, iBerg = 0;
    for (const k of d.kanter) {
      const type = k.type || 'skraning';
      if (type !== 'mur' && type !== 'fjellvegg') continue;
      const merket = type === 'mur' ? 'M' + String(++iMur).padStart(2, '0')
        : 'B' + String(++iBerg).padStart(2, '0');
      const m = alleMur.filter(q => q.navn.startsWith(merket));
      const lag = type === 'mur' ? 'MUR' : 'BERGVEGG';
      polylinje(lag, type === 'mur' ? 5 : 8, m.filter(q => q.navn.endsWith('t')), false);
      polylinje(lag, type === 'mur' ? 5 : 8, m.filter(q => q.navn.endsWith('b')), false);
    }
    for (const h of d.hjorner) {
      if (!Number.isFinite(h.zFerdig)) continue;
      par(0, 'TEXT'); par(8, lagpre + 'TEKST'); par(62, 7);
      par(10, h.x.toFixed(4)); par(20, h.y.toFixed(4)); par(30, h.zFerdig.toFixed(4));
      par(40, '1.5'); par(1, `H${h.nr} ${h.zFerdig.toFixed(2)}`);
    }
    return ut;
  },

  dxfTomt(app, res) {
    return this.dxfDokument(this.dxfKroppTomt(app, res));
  },

  /**
   * LandXML for en tomt: flater, ikke en linjeføring.
   *
   * ALDRI <Alignment>. En tomt har ingen senterlinje, og en syntetisk en –
   * en diagonal, en lengste akse – ville gitt maskinstyringa et
   * stikningsgrunnlag som ikke svarer til noe i beregningen.
   *
   * Det maskinen trenger er flatene: planum med skråningene, og ferdig nivå
   * innenfor tomta. Rutenettet beregningen allerede har bygd, er regulært, så
   * trianguleringen er to trekanter per rute – ingen Delaunay trengs.
   */
  /**
   * Flatene og linjene en tomt bidrar med, uten dokumentet rundt.
   *
   * `pre` settes foran hvert flatenavn i en samlefil. Tre modeller som alle
   * har en flate som heter «Planum» er tre flater mottakeren ikke kan skille –
   * og i de fleste maskinstyringer overskriver den siste de andre.
   */
  landxmlDelerTomt(app, res, pre = '') {
    const d = this.tomtpunkter(app, res);
    if (!d.rutenett.length) {
      throw new Error('Tomta er ikke regnet ennå – LandXML for tomt krever et ferdig rutenett');
    }
    const ruteM = Math.max(0.05, (res.rutenett[1] && res.rutenett[0]
      && Math.abs(res.rutenett[1].x - res.rutenett[0].x)) || app.P.mal.rutestorrelse || 1);

    const flate = (navn, beskr, celler, zAv) => {
      const bra = celler.filter(c => Number.isFinite(zAv(c)));
      if (bra.length < 3) return '';
      let minX = Infinity, minY = Infinity;
      for (const c of bra) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); }
      const nokkel = c => Math.round((c.x - minX) / ruteM) + ':' + Math.round((c.y - minY) / ruteM);
      const id = new Map();
      const pnts = [];
      for (const c of bra) {
        const n = pnts.length + 1;
        id.set(nokkel(c), n);
        pnts.push(`        <P id="${n}">${c.y.toFixed(4)} ${c.x.toFixed(4)} ${zAv(c).toFixed(4)}</P>`);
      }
      const faces = [];
      for (const c of bra) {
        const i = Math.round((c.x - minX) / ruteM), j = Math.round((c.y - minY) / ruteM);
        const a = id.get(i + ':' + j), b = id.get((i + 1) + ':' + j);
        const e = id.get(i + ':' + (j + 1)), f = id.get((i + 1) + ':' + (j + 1));
        /* Ruter med hull i – celler uten terrengdata, celler utenfor grensa –
           hoppes over. Da får flaten et hull der, som er riktig: den skal ikke
           påstå en høyde der ingen er regnet. */
        if (a && b && e) faces.push(`        <F>${a} ${b} ${e}</F>`);
        if (b && f && e) faces.push(`        <F>${b} ${f} ${e}</F>`);
      }
      if (!faces.length) return '';
      return `    <Surface name="${this.xml(navn)}" desc="${this.xml(beskr)}">
      <Definition surfType="TIN">
        <Pnts>
${pnts.join('\n')}
        </Pnts>
        <Faces>
${faces.join('\n')}
        </Faces>
      </Definition>
    </Surface>`;
    };

    const flater = [
      flate(pre + 'Planum', 'Jordarbeidsflate med skråninger', d.rutenett, c => c.zPlanum),
      flate(pre + 'Ferdig nivå', 'Overflaten det kjøres på, bare innenfor tomta',
        d.rutenett.filter(c => c.inne), c => c.zFerdig),
      flate(pre + 'Terreng', 'Eksisterende terreng i samme utstrekning', d.rutenett, c => c.zT)
    ].filter(Boolean);
    if (!flater.length) throw new Error('Ingen flate å skrive – rutenettet mangler koter');

    const linjer = [];
    const geom = (navn, punkt, zAv, lukket) => {
      const p = (lukket ? punkt.concat([punkt[0]]) : punkt).filter(q => Number.isFinite(zAv(q)));
      if (p.length < 2) return;
      const seg = [];
      for (let i = 0; i < p.length - 1; i++) {
        seg.push(`        <Line>
          <Start>${p[i].y.toFixed(4)} ${p[i].x.toFixed(4)} ${zAv(p[i]).toFixed(4)}</Start>
          <End>${p[i + 1].y.toFixed(4)} ${p[i + 1].x.toFixed(4)} ${zAv(p[i + 1]).toFixed(4)}</End>
        </Line>`);
      }
      linjer.push(`      <PlanFeature name="${this.xml(navn)}">
      <CoordGeom>
${seg.join('\n')}
      </CoordGeom>
      </PlanFeature>`);
    };
    geom(pre + 'Ferdig flate', d.hjorner, h => h.zFerdig, true);
    if (d.erYttergrense) {
      const tp = Tomt.tyngdepunkt(d.flate);
      geom(pre + 'Tomtegrense', d.omriss,
        q => Tomtmasser.nivaaVed(d.nivaa, q.x, q.y, tp) - d.ob, true);
    }
    for (const s of this.fotstrekk(d.fot)) {
      geom(pre + (s.type === 'skjaering' ? 'Skjæringstopp' : 'Fyllingsfot'), s.punkt, q => q.z, false);
    }
    return { flater, linjer };
  },

  landxmlTomt(app, res) {
    const { flater, linjer } = this.landxmlDelerTomt(app, res);
    return this.landxmlDokument(app, `  <Surfaces name="${this.xml(app.P.navn)}">
${flater.join('\n')}
  </Surfaces>
${linjer.length ? '  <PlanFeatures name="Massekalk">\n' + linjer.join('\n') + '\n  </PlanFeatures>' : ''}`);
  },

  tekst(s, bredde) { return String(s).slice(0, bredde).padEnd(bredde); },
  xml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
};

if (typeof module !== 'undefined') module.exports = Eksport;
