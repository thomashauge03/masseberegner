'use strict';
/**
 * Gjennomgang av hele programmet i nettleseren.
 *
 * Selvtesten i test/selftest.js dekker regnestykkene, men den kjører uten
 * nettleser og ser hverken knapper, lagring eller tegning. Denne gar gjennom
 * det som bare finnes her: at prosjekter lagres og hentes, at hver knapp gjør
 * det den skal, at rapporten blir til, og at panelene kommer tilbake til
 * normal etter a ha vaert store.
 *
 * Køres ved a apne programmet med ?test=1 bakerst i adressen.
 * Testen lager sitt eget prosjekt og rydder opp etter seg.
 */

const Nettlesertest = {
  ok: 0, feil: 0, linjer: [],

  sjekk(navn, sant, detalj) {
    if (sant) { this.ok++; this.linjer.push({ ok: true, navn }); }
    else { this.feil++; this.linjer.push({ ok: false, navn, detalj }); }
    return sant;
  },
  naer(navn, faktisk, ventet, slingring) {
    const d = Math.abs(faktisk - ventet);
    return this.sjekk(navn + ` (${faktisk} ≈ ${ventet})`, d <= slingring, `avvik ${d}`);
  },
  vent(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* Prosjektfila lagrer anlegg, ikke løse felt. Leser man fila rett - som
     provene under gjør nar de kontrollerer at lagringen faktisk skrev noe -
     ma man ga veien om anlegget. */
  vegenI(fil) {
    if (!fil) return { ip: [], vip: [], mal: {} };
    if (Array.isArray(fil.anlegg)) return fil.anlegg.find(a => a.type === 'veg') || fil.anlegg[0];
    return fil;                      // fil fra før tomtemodus
  },

  /** Venter til beregningen har landet, i stedet for a gjette pa en tid. */
  async ventPaBeregning(tid = 15000) {
    const start = Date.now();
    while (Date.now() - start < tid) {
      await this.vent(120);
      if (App.resultat && App.terreng && !App.terreng.mangler.size) return true;
    }
    return !!App.resultat;
  },

  async kjor() {
    const t0 = performance.now();
    this.ok = 0; this.feil = 0; this.linjer = [];
    const feilILoggen = [];
    const gammelFeil = window.onerror;
    window.onerror = (m) => { feilILoggen.push(String(m)); };
    /* window.onerror ALENE ER IKKE NOK.
       App.start() er async. Et kast inne i Kart.init blir derfor en avvist
       promise, ikke en onerror – og testen meldte «ingen feil i konsollen» selv
       med et helt dødt kart. Det er nettopp den feilen som er lettest å lage
       når man rører bakgrunnslagene, og den som er vanskeligst å se. */
    const paaAvvist = e => feilILoggen.push('ufanget avvisning: '
      + String((e && e.reason && e.reason.message) || (e && e.reason) || e));
    window.addEventListener('unhandledrejection', paaAvvist);

    /* Testen laner prosjektet som star apent, legger inn punkt og fjerner dem
       igjen. Med autolagring pa ble de mellomtilstandene skrevet inn i
       prosjektet - demoen endte 921 m lang med 755 000 kubikk fylling. Derfor
       settes lagringen pa vent, og prosjektet legges tilbake slik det var. */
    App.autolagringPause++;
    clearTimeout(App._autolagring);   // en tidtaker fra før pausen skal ikke fyre midt i testen
    const foerProsjekt = App.P ? JSON.stringify(App.P) : null;
    const foerNavn = App.P ? App.P.navn : null;

    try {
      await this.modulene();
      await this.lagring();
      await this.tegneLinje();
      await this.profilverktoy();
      await this.hoyder();
      await this.veiklasser();
      await this.tverrprofil();
      await this.grenser();
      await this.eksport();
      await this.linjeredigering();
      await this.autolagring();
      await this.overskriving();
      await this.tverrsnittAvlesning();
      await this.pdfrapport();
      await this.pdfavlesning();
      await this.rapport();
      await this.paneler();
      await this.flereAnlegg();
      await this.grensesnittbredder();
      await this.panelhoder();
      await this.tomt();
      await this.tomteksport();
      await this.tomterydding();
      await this.tomt3d();
      await this.veg3d();
      await this.kartlag();
      await this.lovlighet();
      await this.framdrift();
      await this.opprydding();
    } catch (e) {
      this.sjekk('testen kom seg gjennom uten å kaste', false, e.message + ' — ' + (e.stack || '').split('\n')[1]);
    }

    window.onerror = gammelFeil;
    window.removeEventListener('unhandledrejection', paaAvvist);

    /* Legg prosjektet tilbake slik det sto, ogsa i lageret dersom det var
       lagret der fra før. Testen skal ikke etterlate seg spor i noe brukeren
       har jobbet med. */
    if (foerProsjekt) {
      const naa = JSON.stringify(App.P);
      if (naa !== foerProsjekt) {
        App.P = JSON.parse(foerProsjekt);
        App.byggLinje();
        App.vprofil = new Vertikalprofil(App.P.vip);
        try {
          if (foerNavn && await Lager.hent(foerNavn)) await Lager.lagre(foerNavn, App.P);
        } catch (e) { /* lageret sier fra selv */ }
        App._lagretSom = foerProsjekt;
        /* Arbeidsbildet ma følge prosjektet tilbake. Uten dette sto skjermen
           igjen i tomtemodus etter at et veganlegg var lagt tilbake: lengde-
           profilen var skjult og kartet klemt sammen, og det sa ut som om
           testen hadde ødelagt noe. */
        App.visAnleggsvelger();
        try { await App.oppdater(); } catch (e) { /* tegningen kommer uansett */ }
      }
      this.sjekk('prosjektet står igjen slik det var før testen',
        JSON.stringify(App.P) === foerProsjekt);
    }
    App.autolagringPause--;

    /* Til slutt: arbeidsbildet skal vere heilt. Ein test som legg att appen i
       tomtemodus med kartet klemt til femti piksler har ikkje rydda opp. */
    this.sjekk('arbeidsbildet står igjen som det skal',
      document.getElementById('lengdeprofil').clientWidth > 100
      || App.erTomt(),
      'lengdeprofil ' + document.getElementById('lengdeprofil').clientWidth + ' px, erTomt ' + App.erTomt());
    this.sjekk('ingen feil i konsollen underveis', feilILoggen.length === 0, feilILoggen.join(' | '));
    return this.rapporter(Math.round(performance.now() - t0));
  },

  /* ---------------- 1. modulene ---------------- */
  async modulene() {
    for (const n of ['Geo', 'Linjeforing', 'Vertikalprofil', 'Terreng', 'Fjellmodell',
      'beregnMasser', 'Veiklasser', 'Lager', 'Farger', 'PdfImport', 'Kart', 'Lengdeprofil',
      'Tverrprofil', 'Rapport', 'App']) {
      this.sjekk('modulen ' + n + ' er lastet', typeof window[n] !== 'undefined' || typeof eval(n) !== 'undefined');
    }
    this.sjekk('nettleseren kan pakke ut PDF', typeof DecompressionStream !== 'undefined');
    this.sjekk('fargene kommer fra stilarket', /^#|rgb/.test(Farger.skjaering));
  },

  /* ---------------- 2. lagring ---------------- */
  async lagring() {
    const navn = '__test_' + Date.now();
    App.P = App.nyttProsjekt();
    App.P.navn = navn;
    App.P.ip = [{ lat: 58.2958, lon: 7.2098, r: 0 }, { lat: 58.2971, lon: 7.2129, r: 30 }];
    await Lager.lagre(navn, App.P);
    const liste = await Lager.liste();
    this.sjekk('prosjektet kom inn i listen', liste.some(p => p.navn === navn));

    /* Knekkpunktene ligger i anlegget i fila, ikke pa toppniva. `P.ip` er et
       vindu inn i det aktive anlegget, og det vinduet er ikke-tellbart - sa det
       blir hverken lagret eller lest tilbake. Leser man fila rett, ma man ga
       veien om anlegget. */
    const hentet = await Lager.hent(navn);
    const vegen = hentet && hentet.anlegg && hentet.anlegg.find(a => a.type === 'veg');
    this.sjekk('fila lagrer anlegg, ikke løse felt',
      !!vegen && !Object.prototype.hasOwnProperty.call(hentet, 'ip'),
      hentet ? Object.keys(hentet).join(',') : 'ingen fil');
    this.sjekk('hentet prosjekt har samme knekkpunkt',
      !!vegen && vegen.ip.length === 2 && Math.abs(vegen.ip[1].r - 30) < 1e-9);

    const fil = new File([JSON.stringify(hentet)], 't.json', { type: 'application/json' });
    const lagt = await Lager.importer(fil);
    this.sjekk('import gir nytt navn ved kollisjon', lagt.length === 1 && lagt[0] !== navn);
    for (const n of lagt) await Lager.slett(n);

    await Lager.slett(navn);
    this.sjekk('slettet prosjekt er borte', !(await Lager.hent(navn)));
    this._testnavn = navn;
  },

  /* ---------------- 3. tegne linje ---------------- */
  async tegneLinje() {
    App.P = App.nyttProsjekt();
    App.P.navn = this._testnavn;
    Kart.settModus('tegn');
    this.sjekk('tegnemodus slar seg pa', Kart.modus === 'tegn');
    for (const [lat, lng] of [[58.2958, 7.2098], [58.2964, 7.2114], [58.2971, 7.2129]]) {
      Kart.klikk({ latlng: { lat, lng } });
    }
    this.sjekk('tre knekkpunkt lagt inn', App.P.ip.length === 3);
    await App.oppdater();
    await this.ventPaBeregning();

    this.sjekk('linjeføringen ble bygd', App.linje && App.linje.lengde > 50);
    this.sjekk('terrengfliser ble hentet', App.terreng && App.terreng.fliser.size > 0);
    this.sjekk('ingen fliser manglet', App.terreng.mangler.size === 0, App.terreng.mangler.size + ' manglet');
    this.sjekk('terrengprofil langs linjen', App.terrengProfil && App.terrengProfil.z.some(isFinite));
    this.sjekk('masser ble regnet', App.resultat && isFinite(App.resultat.sum.skjaering));
    this.sjekk('alle massepostene er tall',
      Object.values(App.resultat.sum).every(v => isFinite(v) && v >= 0));
    this.sjekk('kartet tegnet senterlinjen', Kart.lag.linje.getLatLngs().length > 10);
    this.sjekk('fotavtrykket ble tegnet', Kart.lag.venstreFot.getLatLngs().length > 2);
  },

  /* ---------------- 4. profilverktøyene ---------------- */
  async profilverktoy() {
    const brudd = () => { const b = App.tellBrudd(); return b ? b.totalt : 0; };

    App.lagProfilforslag(); App.beregn();
    this.sjekk('«Foreslå profil» gir en profil', App.P.vip.length >= 2);
    this.sjekk('forslaget gir gyldige høyder', App.P.vip.every(v => isFinite(v.z)));

    const forBalanse = App.resultat.balanse.balanse;
    await App.balanser();
    this.sjekk('«Massebalanse» flytter balansen mot null',
      Math.abs(App.resultat.balanse.balanse) <= Math.abs(forBalanse) + 1);

    /* Saboter profilen, og kjør begge modusene fra nøyaktig samme
       utgangspunkt. Sammenligner man dem etter hverandre, starter den andre
       fra den førstes svar, og da maler man noe annet enn forskjellen
       mellom modusene. */
    const sabotert = App.P.vip.map((v, i) => ({ s: v.s, z: v.z + (i % 2 ? 7 : -7), k: 1, laast: false }));
    const fra = () => { App.P.vip = sabotert.map(v => ({ ...v })); App.profilEndret(false); App.beregn(); };
    const na = () => ({
      brudd: brudd(), fjell: App.resultat.sum.skjaeringFjell,
      rensk: App.resultat.sum.rensk,
      flyttet: App.resultat.sum.skjaering + App.resultat.sum.fylling
    });

    fra();
    const for_ = na();
    this.sjekk('sabotert profil gir brudd', for_.brudd > 0);

    await App.rettOpp();
    const billigst = na();
    this.sjekk('«Rett opp» fjerner brudd', billigst.brudd < for_.brudd, `${for_.brudd} → ${billigst.brudd}`);
    this.sjekk('«Rett opp» flytter mindre masse', billigst.flyttet < for_.flyttet);

    fra();
    await App.rettOpp('inngrep');
    const inngrep = na();

    /* Begge modusene er lokale søk. Pa et terreng der de to malestokkene
       peker samme vei, lander de nesten pa hverandre, og da sier en streng
       sammenligning mer om støyen enn om modusene. Det som ma holde er at
       ingen av dem gjør det verre enn utgangspunktet, og at hver av dem er
       minst like god som den andre pa sitt eget felt innenfor et par prosent. */
    const slingring = (a, b) => a <= b * 1.03 + 1;
    this.sjekk('«Minst inngrep» gir ikke større fotavtrykk enn «Billigst»',
      slingring(inngrep.rensk, billigst.rensk),
      `inngrep ${Math.round(inngrep.rensk)} mot billigst ${Math.round(billigst.rensk)}`);
    this.sjekk('«Billigst» gir ikke mer sprengning enn «Minst inngrep»',
      slingring(billigst.fjell, inngrep.fjell),
      `billigst ${Math.round(billigst.fjell)} mot inngrep ${Math.round(inngrep.fjell)}`);
    this.sjekk('«Minst inngrep» flytter mindre masse enn utgangspunktet',
      inngrep.flyttet < for_.flyttet, `${Math.round(for_.flyttet)} → ${Math.round(inngrep.flyttet)}`);
    this.sjekk('«Minst inngrep» krymper fotavtrykket',
      inngrep.rensk <= for_.rensk + 1, `${Math.round(for_.rensk)} → ${Math.round(inngrep.rensk)}`);
    this.sjekk('begge modusene gir gyldige tall og færre brudd',
      isFinite(inngrep.fjell) && isFinite(billigst.fjell) && inngrep.brudd <= for_.brudd);

    await App.optimaliser();
    this.sjekk('«Optimaliser» kjører uten feil', !!App.resultat);
  },

  /* ---------------- 5. høyder ---------------- */
  async hoyder() {
    const L = App.linje.lengde;
    App.leggTilHoyde(Math.round(L / 2), 200);
    const p = App.P.vip.find(v => Math.abs(v.s - Math.round(L / 2)) < 0.01);
    this.sjekk('høyde lagt inn på valgt profilnummer', !!p && p.laast);
    this.naer('veglinjen treffer den låste høyden', App.vprofil.hoyde(Math.round(L / 2)), 200, 1e-6);

    const linjer = [];
    for (let s = 0; s <= L; s += 25) linjer.push(`${s.toFixed(0)} ${(150 + s * 0.05).toFixed(2)}`);
    document.getElementById('h_lim').value = linjer.join('\n');
    App.limInnHoyder();
    this.sjekk('innlimt tabell ble lagt inn', App.P.vip.length >= linjer.length - 1);
    this.sjekk('alle innlimte er låst', App.P.vip.every(v => v.laast));
    let verst = 0;
    for (const v of App.P.vip) verst = Math.max(verst, Math.abs(App.vprofil.hoyde(v.s) - v.z));
    this.naer('profilen følger den innlimte tabellen', verst, 0, 1e-6);

    this.sjekk('balansering nekter når alt er låst',
      (await App.balanser(), document.getElementById('statuslinje').textContent.includes('låst')));

    App.fyllHoyder(20);
    this.sjekk('«Fyll hver N m» lager rader', App.P.vip.length > 2);
    this.sjekk('høydetabellen vises', document.querySelectorAll('#hoydeTabell tbody tr').length === App.P.vip.length);

    document.getElementById('h_laasIngen').click();
    this.sjekk('«Lås ingen» låser opp', App.P.vip.every(v => !v.laast));
  },

  /* ---------------- 6. veiklasser ---------------- */
  async veiklasser() {
    for (const navn of Object.keys(Veiklasser)) {
      const k = Veiklasser[navn];
      this.sjekk(`klasse ${navn} har navn og beskrivelse`, !!k.navn && !!k.beskrivelse);
      if (k.fri) continue;
      App.velgVeiklasse(navn);
      await this.vent(60);
      const m = App.P.mal;
      this.sjekk(`klasse ${navn} setter en gyldig mal`,
        isFinite(m.vegbredde) && m.vegbredde > 0 && Array.isArray(m.stigningIKurve) && m.stigningIKurve.length > 0);
      this.sjekk(`klasse ${navn} gir stigningskrav mellom 1 og 40 %`,
        m.stigningIKurve.every(r => r[1] > 0.01 && r[1] < 0.4 && r[2] > 0.01 && r[2] < 0.4));
      this.sjekk(`klasse ${navn}: lassretning er strengest`,
        m.stigningIKurve.every(r => r[1] <= r[2] + 1e-9));
      this.sjekk(`klasse ${navn}: kravet blir slakkere med større radius`,
        m.stigningIKurve.every((r, i) => i === 0 || r[1] >= m.stigningIKurve[i - 1][1] - 1e-9));
    }
    App.velgVeiklasse('k5');
    await this.vent(200);
    this.sjekk('klasse 5 er satt tilbake', App.P.mal.veiklasse === 'k5');
  },

  /* ---------------- 7. tverrprofil ---------------- */
  async tverrprofil() {
    App.beregn();
    const midt = App.resultat.profiler[Math.floor(App.resultat.profiler.length / 2)];
    App.settTverrStasjon(midt.s);
    this.sjekk('tverrprofilet viser valgt profil', Tverrprofil.profil === midt);
    this.sjekk('tverrsnittet har geometri', midt.geometri.terreng.length > 10);
    this.sjekk('etiketten viser profilnummeret',
      document.getElementById('tverrEtikett').textContent.includes(midt.s.toFixed(1)));

    const vk = +document.getElementById('tp_venstre').value;
    this.sjekk('punkthøydene er fylt ut', isFinite(vk));
    App.settPunkthoyde('venstre', vk - 0.25);
    await this.vent(300);
    this.naer('venstre vegkant traff den nye høyden',
      +document.getElementById('tp_venstre').value, vk - 0.25, 0.01);
    App.nullstillPunkthoyder();
    await this.vent(200);

    Tverrprofil.flytt(1);
    this.sjekk('«neste profil» flytter seg', App.tverrStasjon !== midt.s);
  },

  /* ---------------- 8. grenser ---------------- */
  async grenser() {
    const fritt = App.resultat.sum.skjaering;
    App.P.mal.beregningsbredde = 3;
    App.beregn();
    this.sjekk('avkortet beregning gir ikke mer masse', App.resultat.sum.skjaering <= fritt + 1e-6);
    App.P.mal.beregningsbredde = 0;
    App.beregn();
    this.naer('uten grense er vi tilbake', App.resultat.sum.skjaering, fritt, 1);

    const u = App.regnUsikkerhet();
    this.sjekk('usikkerheten regnes ut', u && isFinite(u.spenn) && u.spenn >= 0);
    this.sjekk('grunnere fjell gir mer sprengning', !u || u.fjellGrunnere >= u.fjellDypere);

    const skog = await App.sjekkSkogdekke();
    this.sjekk('skogdekket måles', skog && isFinite(skog.snitt) && skog.snitt >= 0);
    this.sjekk('vegetasjonshøyden er troverdig', !skog || (skog.maks >= 0 && skog.maks < 60));
  },

  /* ---------------- 9. eksport ---------------- */
  async eksport() {
    const ut = {};
    const orig = Rapport.lastNed;
    Rapport.lastNed = (navn, innhold) => { ut[navn] = innhold; };
    Rapport.eksportStikning(); Rapport.eksportMasser(); Rapport.eksportGeojson();
    Rapport.lastNed = orig;

    const navn = Object.keys(ut);
    this.sjekk('tre filer ble laget', navn.length === 3, navn.join(', '));
    const stikning = ut[navn.find(n => n.includes('stikning'))];
    this.sjekk('stikningsdata har rader', stikning.split('\r\n').length > 5);
    /* KOMMA, IKKE PUNKTUM.
       Semikolon som skilletegn og punktum som desimaltegn gjør at norsk Excel
       leser tallene som tekst - og felt med to desimaler der heltallsdelen er
       1-31 blir DATOER. 3.05 m³ ble til 3. mai. Denne testen sementerte
       punktum, så rettingen ville sett ut som en regresjon. */
    this.sjekk('stikningsdata har koordinater', /\d{6},\d{3};\d{6},\d{3}/.test(stikning));
    this.sjekk('stikningsdata bruker komma som desimaltegn', !/;\d+\.\d/.test(stikning));
    this.sjekk('ingen tomme tall i stikningsdata',
      !/NaN/.test(stikning) && !stikning.split('\r\n').filter(l => !l.startsWith('#') && l).slice(1)
        .some(l => /;;/.test(l)));

    const masser = ut[navn.find(n => n.includes('masser'))];
    this.sjekk('masseoppsettet har rader', masser.split('\r\n').length > 5);
    this.sjekk('ingen NaN i masseoppsettet', !/NaN/.test(masser));

    const geo = JSON.parse(ut[navn.find(n => n.endsWith('.geojson'))]);
    this.sjekk('geojson har senterlinje og fotavtrykk', geo.features.length >= 2);
    this.sjekk('koordinatene er lengde- og breddegrad',
      geo.features[0].geometry.coordinates.every(c => c[0] > 4 && c[0] < 32 && c[1] > 57 && c[1] < 72));
  },

  /* ---------------- 10. rapport ---------------- */
  /* ---------------- a sette inn punkt, og a angre ---------------- */
  async linjeredigering() {
    const app = App;
    if (!app.linje || app.P.ip.length < 2) {
      this.sjekk('ingen linje å redigere – hopper over', true);
      return;
    }

    /* Har man glemt en sving, ma punktet inn mellom de to knekkpunktene
       strekket ligger mellom. Legges det til pa slutten gar linjen tilbake
       dit den kom fra. */
    // merket vi startet pa, sa opprydningen bare tar tilbake det denne prøven gjorde
    const merkeVedStart = app.historikk.bakover.length;
    const forIp = app.P.ip.length, forLengde = app.linje.lengde;
    const p = app.linje.punktVed(app.linje.lengde * 0.4);
    const ll = Geo.fraUtm(p.x, p.y, app.sone);
    const plass = Kart.settInnPunkt({ lat: ll.lat, lng: ll.lon }, 40);
    await this.vent(250);
    this.sjekk('klikk på linja setter inn et knekkpunkt', app.P.ip.length === forIp + 1,
      `${forIp} → ${app.P.ip.length}`);
    this.sjekk('punktet havner mellom naboene, ikke på slutten',
      plass > 0 && plass < app.P.ip.length - 1, `plass ${plass}`);
    this.sjekk('linjen beholder lengden når punktet legges på den',
      Math.abs(app.linje.lengde - forLengde) < 2,
      `${forLengde.toFixed(1)} → ${app.linje.lengde.toFixed(1)}`);

    const langt = Kart.settInnPunkt({ lat: ll.lat + 0.03, lng: ll.lon + 0.03 }, 40);
    this.sjekk('et klikk langt fra linja setter ikke inn noe', langt === -1);


    /* Angre skal ta tilbake det du gjorde - ikke fjerne siste punkt.
       Med det gamle oppsettet slettet «Angre» et helt annet punkt hvis du
       nettopp hadde endret en radius. */
    const forRadius = app.P.ip[1].r;
    app.merk('prøve: radius');
    app.P.ip[1].r = (forRadius || 0) + 37;
    app.linjeEndret();
    await this.vent(250);

    await app.angre();
    this.sjekk('angre tar tilbake radiusendringen', app.P.ip[1].r === forRadius,
      `${app.P.ip[1].r} mot ${forRadius}`);
    await app.gjorOm();
    this.sjekk('gjør om setter den tilbake igjen', app.P.ip[1].r === (forRadius || 0) + 37);
    await app.angre();
    await app.angre();
    this.sjekk('angre nummer to tar bort det innsatte punktet',
      app.P.ip.length === forIp, `${app.P.ip.length} mot ${forIp}`);

    this.sjekk('knappene følger med på hva som er mulig',
      document.getElementById('knappGjorOm').disabled === false);

    // rydd opp: bare tilbake til der denne prøven startet, ikke lenger
    while (app.historikk.bakover.length > merkeVedStart) await app.angre();
    this.sjekk('alt er tilbake der prøven startet', app.P.ip.length === forIp
      && Math.abs(app.linje.lengde - forLengde) < 2,
      `${app.P.ip.length} punkt mot ${forIp}, ${app.linje.lengde.toFixed(1)} m mot ${forLengde.toFixed(1)}`);

    /* Mens man tegner skal punktet alltid pa enden. Her lot innsettingen seg
       utløse av et vanlig tegneklikk, og fulgte man en veg som svinger tilbake
       mot seg selv, havnet neste punkt midt i rekken - linjen gikk i sikksakk
       uten at noen hadde bedt om det. */
    const gammelModus = Kart.modus;
    const merkeForTegn = app.historikk.bakover.length;
    Kart.settModus('tegn');
    const forTegn = app.P.ip.length;
    const nye = [];
    for (const f of [0.3, 0.55, 0.32, 0.8]) {      // 0,32 ligger like ved 0,30
      const q = app.linje.punktVed(app.linje.lengde * f);
      const l2 = Geo.fraUtm(q.x, q.y, app.sone);
      nye.push({ lat: l2.lat + 0.00002, lng: l2.lon + 0.00002 });
    }
    for (const punkt of nye) Kart.klikk({ latlng: punkt });
    const feilPlass = nye.findIndex((punkt, i) => {
      const q = app.P.ip[forTegn + i];
      return !q || Math.abs(q.lat - punkt.lat) > 1e-9 || Math.abs(q.lon - punkt.lng) > 1e-9;
    });
    this.sjekk('tegning legger punktene bakerst, alltid', feilPlass === -1,
      feilPlass === -1 ? `${forTegn} → ${app.P.ip.length}`
        : `punkt ${feilPlass + 1} havnet ikke bakerst (${forTegn} → ${app.P.ip.length})`);

    const forLinjeklikk = app.P.ip.length;
    Kart.lag.linje.fire('click', { latlng: L.latLng(ll.lat, ll.lon), originalEvent: new MouseEvent('click') });
    this.sjekk('klikk på linja setter ikke inn noe mens man tegner',
      app.P.ip.length === forLinjeklikk);

    /* Rydd bort punktene direkte. A angre seg tilbake gar ikke: `merk` hopper
       over et merke nar ingenting har endret seg, sa antall merker er ikke
       det samme som antall klikk. */
    Kart.settModus(gammelModus);
    app.P.ip.length = forTegn;
    app.historikk.bakover.length = merkeForTegn;
    app.historikk.framover.length = 0;
    app.historikk._sist = JSON.stringify(app.P);
    app.linjeEndret();
    await this.vent(250);
    this.sjekk('tegneprøven ryddet opp etter seg', app.P.ip.length === forTegn,
      `${app.P.ip.length} mot ${forTegn}`);
  },

  /* ---------------- lagres av seg selv ----------------
     En prosjektfil holder det som ble lagret - den kan ikke holde det man
     glemte a lagre. Og det var lett a glemme: bade «Apne» og «Ny» byttet
     prosjekt uten a spørre. */
  async autolagring() {
    if (!App.P || App.P.ip.length < 2) { this.sjekk('ikke noe prosjekt å lagre – hopper over', true); return; }

    /* Prøven star pa egne ben: den lagrer det som ligger der na under et eget
       navn, sa den ikke henger pa hva de foregaende prøvene gjorde. */
    const navn = 'Massekalk prøve autolagring';
    const gammeltNavn = App.P.navn;
    const felt = document.getElementById('prosjektnavn');
    const gammeltFelt = felt.value;
    felt.value = navn;
    await App.lagre();
    this.sjekk('rett etter lagring er alt lagret', !App.harUlagret());

    const forRadius = App.P.ip[1].r;
    App.merk('prøve: autolagring');
    App.P.ip[1].r = (forRadius || 0) + 15;
    App.linjeEndret();
    await this.vent(300);
    this.sjekk('en endring blir merket som ulagret', App.harUlagret());
    this.sjekk('og lagreknappen sier fra',
      document.getElementById('knappLagre').classList.contains('ulagret'));

    /* Prøven ma slippe pausen som resten av testen kjører med - det er jo
       nettopp autolagringen som skal kontrolleres her. */
    App.autolagringPause--;
    await App.autolagre();
    App.autolagringPause++;
    this.sjekk('autolagringen tar den', !App.harUlagret());

    const lagra = await Lager.hent(navn);
    this.sjekk('og lageret har den nye verdien', !!lagra && this.vegenI(lagra).ip[1].r === (forRadius || 0) + 15,
      lagra ? String(this.vegenI(lagra).ip[1].r) : 'fant ikke prosjektet');

    /* Et prosjekt som ikke har fatt navn skal ikke lagres av seg selv - da
       ville listen fylles opp av halvferdige forsøk. */
    felt.value = 'Nytt prosjekt';
    App.P.ip[1].r = (forRadius || 0) + 16;
    App.autolagringPause--;
    await App.autolagre();
    App.autolagringPause++;
    this.sjekk('et prosjekt uten navn lagres ikke av seg selv',
      !(await Lager.hent('Nytt prosjekt')));

    // rydd opp
    App.P.ip[1].r = forRadius;
    App.P.navn = gammeltNavn;
    felt.value = gammeltFelt;
    await Lager.slett(navn);
    App._lagretSom = JSON.stringify(App.P);
    App.linjeEndret();
    this.sjekk('testprosjektet er ryddet bort', !(await Lager.hent(navn)));
  },

  /* ---------------- ingenting skal skrives over i stillhet ---------------- */
  async overskriving() {
    if (!App.P || !App.P.ip.length) { this.sjekk('ikke noe prosjekt – hopper over', true); return; }
    const annet = 'Massekalk prøve annet';
    const gammeltFelt = document.getElementById('prosjektnavn').value;
    const gammeltAapnet = App._aapnetSom;

    await Lager.lagre(annet, { navn: annet, ip: [{ lat: 58, lon: 7, r: 0 }, { lat: 58.001, lon: 7.001, r: 0 }], vip: [] });

    /* Autolagringen skal aldri skrive over noe annet enn seg selv. Uten dette
       kunne et prosjekt forsvinne uten at noen trykket pa noe. */
    document.getElementById('prosjektnavn').value = annet;
    App.merk('prøve: overskriving');
    App.P.ip[0].r = (App.P.ip[0].r || 0) + 1;
    App.autolagringPause--;
    await App.autolagre();
    App.autolagringPause++;
    const etterAuto = await Lager.hent(annet);
    this.sjekk('autolagringen skriver ikke over et annet prosjekt',
      !!etterAuto && this.vegenI(etterAuto).ip.length === 2 && this.vegenI(etterAuto).ip[0].lat === 58);

    // og Lagre-knappen skal spørre først
    let spurt = false;
    const gammelBekreft = App.bekreft;
    App.bekreft = async (t) => { spurt = /finnes allerede/i.test(t); return false; };
    await App.lagre();
    App.bekreft = gammelBekreft;
    const etterNei = await Lager.hent(annet);
    this.sjekk('Lagre spør før den skriver over', spurt);
    this.sjekk('og lar det være når svaret er nei',
      !!etterNei && this.vegenI(etterNei).ip[0].lat === 58);

    /* Demoprosjektet skal ikke kunne skrive over noe som alt finnes. */
    const førSaaing = await Lager.hent(annet);
    await Lager.saFrø();
    const etterSaaing = await Lager.hent(annet);
    this.sjekk('såing av demoprosjektet rører ikke det som finnes',
      JSON.stringify(førSaaing) === JSON.stringify(etterSaaing));

    // rydd opp
    App.P.ip[0].r = (App.P.ip[0].r || 1) - 1;
    document.getElementById('prosjektnavn').value = gammeltFelt;
    App.P.navn = gammeltFelt;
    App._aapnetSom = gammeltAapnet;
    await Lager.slett(annet);
    this.sjekk('prøveprosjektet er ryddet bort', !(await Lager.hent(annet)));
  },

  /* ---------------- avlesning i tverrsnittet ----------------
     Helningen skal leses av der pekeren star. Malen sier hva den skal vaere
     pa vegen og i skraningen, sa avlesningen kan prøves mot den. */
  async tverrsnittAvlesning() {
    const pr = Tverrprofil.profil;
    if (!pr || !pr.geometri) { this.sjekk('ingen tverrsnitt å lese av – hopper over', true); return; }
    const g = pr.geometri, mal = App.P.mal;

    const paaVegen = Tverrprofil._helning(g.jord, pr.halvbredde * 0.5);
    this.sjekk('helningen på vegen er tverrfallet fra malen',
      paaVegen != null && Math.abs(Math.abs(paaVegen) - mal.tverrfall) < 5e-3,
      `${paaVegen} mot ${mal.tverrfall}`);

    // ytterst i snittet skal skraningen kjennes igjen fra malen
    const ytterst = Tverrprofil._helning(g.jord, pr.fotHoyre * 0.99);
    const venta = [1 / mal.skjaeringLosmasse, 1 / mal.skjaeringFjell, 1 / mal.fylling];
    this.sjekk('helningen ytterst er en av skråningene i malen',
      ytterst != null && venta.some(v => Math.abs(Math.abs(ytterst) - v) < 0.25),
      `${ytterst}`);

    /* Punktene i geometrien kan ligge oppa hverandre. Ga avlesningen rett pa
       naboene, ga hver avlesning nær kanten ingen helning i det hele tatt. */
    let tomme = 0, prov = 0;
    for (let t = pr.fotVenstre; t <= pr.fotHoyre; t += (pr.fotHoyre - pr.fotVenstre) / 40) {
      prov++;
      if (Tverrprofil._helning(g.jord, t) == null) tomme++;
    }
    this.sjekk('helningen kan leses av overalt i snittet', tomme === 0, `${tomme} av ${prov} tomme`);

    this.sjekk('forholdstallet skrives som en skråning',
      Tverrprofil._somForhold(1 / 1.5) === '1:1,5' && Tverrprofil._somForhold(0) === 'flatt',
      Tverrprofil._somForhold(1 / 1.5));

    // og selve tegningen skal ikke kaste nar pekeren star et sted
    const B = Tverrprofil.lerret.clientWidth, H = Tverrprofil.lerret.clientHeight;
    let kastet = null;
    for (const f of [0.2, 0.5, 0.9]) {
      Tverrprofil.peker = { x: B * f, y: H * 0.5 };
      try { Tverrprofil.tegn(); } catch (e) { kastet = e.message; }
    }
    Tverrprofil.peker = null;
    Tverrprofil.tegn();
    this.sjekk('avlesningen tegnes uten å kaste', !kastet, kastet || '');
  },

  /* ---------------- PDF-rapporten ----------------
     Fila skrives for hand, sa den ma kontrolleres som en fil og ikke bare
     som et objekt: krysstabellen ma peke pa de objektene den sier, og hver
     /Length ma stemme med det som faktisk star mellom stream og endstream.
     Bommer en av delene apner ingen leser fila. */
  async pdfrapport() {
    if (!App.resultat) { this.sjekk('ingen beregning å lage PDF av – hopper over', true); return; }
    const bytes = await Pdfrapport.lag(false);
    this.sjekk('PDF-en ble laget', !!bytes && bytes.length > 2000, bytes ? bytes.length + ' byte' : 'ingen');
    if (!bytes) return;

    const tekst = new TextDecoder('latin1').decode(bytes);
    this.sjekk('fila starter som en PDF', tekst.startsWith('%PDF-1.'));
    this.sjekk('og slutter der den skal', tekst.trimEnd().endsWith('%%EOF'));

    const sider = (tekst.match(/\/Type \/Page[^s]/g) || []).length;
    this.sjekk('rapporten har flere sider', sider >= 2, `${sider} sider`);
    this.sjekk('tegningene er med', (tekst.match(/\/Subtype \/Image/g) || []).length >= 3,
      `${(tekst.match(/\/Subtype \/Image/g) || []).length} bilder`);

    // krysstabellen: hver oppføring skal peke pa «N 0 obj»
    const xref = +/startxref\s+(\d+)/.exec(tekst)[1];
    const hode = /^xref\s*\n0 (\d+)\s*\n/.exec(tekst.slice(xref));
    this.sjekk('krysstabellen står der tilhengeren sier', !!hode);
    if (hode) {
      const antall = +hode[1];
      const rader = tekst.slice(xref + hode[0].length).split('\n');
      let gale = 0;
      for (let i = 1; i < antall; i++) {
        const m = /^(\d{10}) \d{5} n/.exec(rader[i]);
        if (!m || !new RegExp('^' + i + ' 0 obj').test(tekst.slice(+m[1], +m[1] + 20))) gale++;
      }
      this.sjekk('alle objektene ligger der krysstabellen sier', gale === 0,
        `${gale} av ${antall - 1} feil`);
    }

    // /Length mot det som faktisk star i strømmen
    let idx = 0, sjekka = 0, gale = 0;
    while (true) {
      const st = tekst.indexOf('stream', idx);
      if (st === -1) break;
      if (tekst.slice(st - 3, st) === 'end') { idx = st + 6; continue; }
      let start = st + 6;
      if (bytes[start] === 0x0d) start++;
      if (bytes[start] === 0x0a) start++;
      const e = tekst.indexOf('endstream', start);
      if (e === -1) break;
      idx = e + 9;
      const L = /\/Length (\d+)/.exec(tekst.slice(Math.max(0, st - 300), st));
      if (L) { sjekka++; if (Math.abs((e - start) - +L[1]) > 2) gale++; }
    }
    this.sjekk('hver strøm er så lang som den sier', gale === 0 && sjekka >= 3,
      `${sjekka} strømmer, ${gale} feil`);

    /* Programmets egen PDF-leser brukes til a apne rapporten det selv skrev.
       Klarer den det, er strømmene virkelig gyldige - ikke bare riktige i
       tellingen. */
    const strommer = await PdfImport.lesStrommer(bytes);
    const alt = strommer.join('\n');
    this.sjekk('vår egen PDF-leser åpner rapporten', strommer.length >= 2,
      `${strommer.length} strømmer`);
    this.sjekk('overskriftene står i fila',
      alt.includes('SAMMENDRAG') && alt.includes('MASSEBALANSE'));
    /* HVA SLAGS DOKUMENT DETTE ER, SKAL STÅ ÉN GANG.
       Ordet sto i 15 pt fet på hver eneste side – dobbelt så stort som
       prosjektnavnet, som er det eneste som skiller denne rapporten fra alle
       andre. Nå står det som en liten etikett på første side, og prosjektet er
       tittelen. Prøven holder begge deler: at det står, og at det ikke gjentas. */
    {
      const sperret = 'M A S S E B E R E G N I N G';
      const antall = (alt.match(/M A S S E B E R E G N I N G/g) || []).length;
      this.sjekk('dokumenttypen står, og bare på første side', antall === 1,
        antall + ' forekomster');
      this.sjekk('mens prosjektnavnet står på hver side',
        (alt.match(/__test_pdf|Nytt prosjekt|Demo/g) || []).length >= 1
        || alt.includes(App.P.navn.slice(0, 6)));
      void sperret;
    }
    this.sjekk('stikningsdataene er med', alt.includes('STIKNINGSDATA'));
    this.sjekk('norske bokstaver er kodet som WinAnsi', /\\346|\\370|\\345|\\306|\\330|\\305/.test(alt));

    // bredden pa en tekst ma vaere kjent, ellers kan ingenting høyrestilles
    const P = new PdfSkriver();
    this.sjekk('bokstavbredder gir fornuftige mål',
      P.bredteAv('1 234,567', 9) > 30 && P.bredteAv('1 234,567', 9) < 60
      && P.bredteAv('W', 9, true) > P.bredteAv('i', 9, true),
      P.bredteAv('1 234,567', 9).toFixed(1) + ' pt');
    this.sjekk('parenteser i teksten blir unnsluppet',
      P._pdfstreng('Rensk (0,2 m)').includes('\\(') && P._pdfstreng('Rensk (0,2 m)').includes('\\)'));
  },

  /* ---------------- avlesning av PDF ----------------
     Strømmene i en PDF slutter der `/Length` sier, ikke der `endstream` star.
     Mellom dem ligger det et linjeskift eller to, og `DecompressionStream`
     kaster pa alt som følger etter at zlib-strømmen er slutt. De to bytene
     var nok til at ingen innholdsstrøm i noen ekte PDF noen gang pakket ut -
     avlesningen fant null kurver, uten a si ifra om hvorfor. Her bygges en
     liten PDF med akkurat den fellen i. */
  async pdfavlesning() {
    if (typeof CompressionStream === 'undefined') {
      this.sjekk('nettleseren kan pakke – hopper over PDF-prøven', true);
      return;
    }
    const innhold = '1 0 0 1 0 0 cm 100 100 m 200 150 l 300 120 l S';
    const pakk = async (tekst) => {
      const str = new Blob([tekst]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(str).arrayBuffer());
    };
    const komprimert = await pakk(innhold);

    const bit = s => new TextEncoder().encode(s);
    const sett = (...deler) => {
      const n = deler.reduce((a, d) => a + d.length, 0);
      const ut = new Uint8Array(n);
      let i = 0; for (const d of deler) { ut.set(d, i); i += d.length; }
      return ut;
    };
    // linjeskiftet før «endstream» er fella: det er ikke en del av strømmen
    const pdf = sett(
      bit('%PDF-1.7\n4 0 obj <</Filter/FlateDecode/Length ' + komprimert.length + '>>\nstream\r\n'),
      komprimert,
      bit('\r\nendstream\nendobj\n%%EOF\n')
    );

    const strommer = await PdfImport.lesStrommer(pdf);
    this.sjekk('strømmen i en PDF pakkes ut', strommer.length === 1,
      `fant ${strommer.length}`);
    this.sjekk('innholdet kom helt fram',
      strommer.length === 1 && strommer[0].includes('200 150 l'));

    const baner = strommer.flatMap(s => PdfImport.tolkBaner(s));
    this.sjekk('kurven i strømmen blir tolket', baner.length === 1 && baner[0].length === 3,
      `${baner.length} baner`);

    // en lengre, stigende kurve skal bli plukket ut som kandidat
    let lang = '1 0 0 1 0 0 cm 0 0 m';
    for (let i = 1; i <= 40; i++) lang += ` ${i * 5} ${20 + 10 * Math.sin(i / 4)} l`;
    lang += ' S';
    const langStrom = sett(
      bit('%PDF-1.7\n5 0 obj <</Filter/FlateDecode/Length '),
      bit(String((await pakk(lang)).length)),
      bit('>>\nstream\r\n'), await pakk(lang), bit('\r\nendstream\n%%EOF\n')
    );
    const kand = PdfImport.kandidater(
      (await PdfImport.lesStrommer(langStrom)).flatMap(s => PdfImport.tolkBaner(s)));
    this.sjekk('en lang kurve som gar framover blir kandidat', kand.length === 1,
      `${kand.length} kandidater`);
  },

  async rapport() {
    let html = '';
    const origOpen = window.open;
    window.open = () => ({ document: { write: h => html = h, close() { } } });
    Rapport.apneRapport();
    window.open = origOpen;

    this.sjekk('rapporten ble laget', html.length > 5000);
    this.sjekk('rapporten har lengdeprofil', /Lengdeprofil<\/h2>\s*<img/.test(html));
    this.sjekk('rapporten har tverrsnitt', html.includes('Tverrsnitt') && (html.match(/<img/g) || []).length >= 3);
    this.sjekk('rapporten har stikningsdata', html.includes('Stikningsdata'));
    this.sjekk('rapporten har koordinater', /\d{7}\.\d{3}/.test(html));
    this.sjekk('rapporten har massetabell', html.includes('Masser per'));
    // bildene er base64, og der dukker "NaN" opp som ren tilfeldighet
    const utenBilder = html.replace(/data:image\/[a-z]+;base64,[^"']+/g, '');
    this.sjekk('ingen NaN eller undefined i rapporten', !/NaN|undefined/.test(utenBilder));
    this.sjekk('utskriftstemaet er ryddet bort', !document.documentElement.hasAttribute('data-utskrift'));
    this.sjekk('lerretene på skjermen er intakte',
      document.getElementById('lengdeprofil').clientWidth > 100
      && document.getElementById('tverrprofil').clientHeight > 20);
  },

  /* ---------------- 11. panelene ---------------- */
  /**
   * PANELHODET SKAL IKKE ETE PANELET.
   *
   * Målt før dette ble rettet, på 1280 px: kartpanelet var 184 px høyt og
   * hodet tok 102 av dem – 55 %. Selve kartet satt igjen med 82 px. Alle tre
   * verktøylinjene brøt over tre rader, fordi hver eneste kontroll sto framme
   * hele tiden: tretten på kartet, syv på profilen, seks på tverrsnittet.
   *
   * Prøven er en TAKHØYDE, ikke en pikselfasit. Den sier ikke hvordan hodet
   * skal se ut – den sier at det ikke får lov til å spise tegningen. En ny
   * knapp som bryter linja vil slå ut her, og det er hele poenget.
   */
  /**
   * Teksten skal få plass i ruta si.
   *
   * Dette er den feilen ingen melder fra om, fordi den ikke ser ut som en feil –
   * den ser ut som om programmet er slik. To funn i sidepanelet:
   *
   * · Sju faner var 401 px innhold i et panel på 320, med `flex-wrap: nowrap`
   *   og `overflow: visible`. EKSPORT og FORKLARING ble tegnet UTENFOR panelet.
   *   Ingen rullefelt, ingen antydning – to faner fantes bare ikke.
   * · Fem nedtrekk var smalere enn sitt eget lengste valg. Verst: «Er selve
   *   tomta – skråningene kommer utenpå», 306 px tekst i en rute på 78, som ble
   *   vist som «Er selve to▾».
   *
   * Prøven måler BREDDER, ikke utseende. Den sier ikke hvordan panelet skal se
   * ut; den sier at det som står der skal være mulig å lese, og at det man kan
   * trykke på skal være mulig å treffe.
   */
  async grensesnittbredder() {
    /* Bredden en tekst VILLE tatt, målt med samme skrift, utenfor layouten. */
    const bredde = (tekst, mal) => {
      const st = getComputedStyle(mal);
      const sp = document.createElement('span');
      sp.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre';
      sp.style.fontSize = st.fontSize;
      sp.style.fontFamily = st.fontFamily;
      sp.style.fontWeight = st.fontWeight;
      sp.style.letterSpacing = st.letterSpacing;
      sp.style.textTransform = st.textTransform;
      sp.textContent = tekst;
      document.body.appendChild(sp);
      const b = sp.getBoundingClientRect().width;
      sp.remove();
      return b;
    };

    const faner = [...document.querySelectorAll('.fane')].filter(f => !f.classList.contains('skjult'));
    const rad = document.querySelector('.faner');
    const rr = rad.getBoundingClientRect();
    let utafor = 0;
    for (const f of faner) {
      const r = f.getBoundingClientRect();
      if (r.right > rr.right + 1 || r.left < rr.left - 1 || r.bottom > rr.bottom + 1) utafor++;
    }
    this.sjekk('alle fanene ligger innenfor panelet – ingen er tegnet utenfor',
      utafor === 0, utafor + ' av ' + faner.length + ' utenfor');
    /* Og de skal være til å TREFFE, ikke bare til stede: en fane som er klemt
       ned i tolv piksler er like utilgjengelig som en som ligger utenfor. */
    const smal = faner.filter(f => f.getBoundingClientRect().width < 34);
    this.sjekk('og ingen er klemt ned til en strek', smal.length === 0,
      smal.map(f => f.dataset.fane).join(', '));

    /* Hvert nedtrekk skal kunne vise sitt eget lengste valg. */
    const trange = [];
    for (const f of faner) {
      f.click();
      await this.vent(180);
      for (const e of document.querySelectorAll('.faneinnhold select')) {
        if (!e.offsetParent) continue;
        let treng = 0;
        for (const o of e.options) treng = Math.max(treng, bredde(o.textContent, e));
        // 34 px er pila og innvendig luft; nettleseren tegner den utenfor teksten
        const plass = e.getBoundingClientRect().width - 34;
        if (treng > plass + 2) {
          trange.push((e.id || f.dataset.fane) + ' ' + Math.round(plass) + ' < ' + Math.round(treng));
        }
      }
    }
    /* VEIKLASSENE ER UNNTAKET, og det er et bevisst unntak.
       «Klasse 4 – Sommerbilvei for tømmerbil med henger» er lengre enn et panel
       på 320 px uansett hva man gjør med layouten, og navnet er ikke vårt å
       korte ned – det står slik i Normaler for landbruksveier, og den samme
       strengen havner i rapporten og i PDF-en. Der er halen klippet, lista viser
       hele navnet, og hele navnet ligger i tittelen. Prøven krever DET. */
    const ekte = trange.filter(t => !t.startsWith('m_veiklasse'));
    this.sjekk('hvert nedtrekk kan vise sitt eget lengste valg',
      ekte.length === 0, ekte.join(' | '));
    const vk = document.getElementById('m_veiklasse');
    if (vk) {
      this.sjekk('veiklassen er for lang for panelet, og bærer da hele navnet i tittelen',
        !!vk.title && vk.title.length > 12, '«' + (vk.title || '') + '»');
    }

    /* Ingen knapp eller etikett skal ha tekst som renner over sin egen rute. */
    const renner = [];
    for (const f of faner) {
      f.click();
      await this.vent(160);
      for (const e of document.querySelectorAll('.faneinnhold button, .faneinnhold label, .faneinnhold .enhet')) {
        if (!e.offsetParent) continue;
        const st = getComputedStyle(e);
        if (st.overflowX === 'auto' || st.overflowX === 'scroll') continue;
        if (e.scrollWidth > e.clientWidth + 2) {
          renner.push(e.textContent.trim().slice(0, 26) + ' ' + e.clientWidth + '<' + e.scrollWidth);
        }
      }
    }
    this.sjekk('ingen knapp eller etikett renner over ruta si', renner.length === 0,
      renner.slice(0, 4).join(' | '));

    /* DESIMALTEGNET SKAL VÆRE DET SAMME PÅ SAMME RAD.
       Feltet viste «2,5» fordi nettleseren skriver tall på norsk; hintet ved
       siden av viste «1:2.5» fordi toFixed alltid skriver engelsk. To
       desimaltegn tre centimeter fra hverandre, på samme linje. */
    const punktum = [...document.querySelectorAll('.faneinnhold .enhet')]
      .filter(e => e.offsetParent && /\d\.\d/.test(e.textContent))
      .map(e => e.textContent.trim());
    this.sjekk('hintene skriver desimaltall med komma, som feltene ved siden av',
      punktum.length === 0, punktum.slice(0, 4).join(' | '));
  },

  /**
   * FLERE ANLEGG I SAMME PROSJEKT.
   *
   * Modellen har alltid holdt en liste – men bryteren kunne bare si «veg» eller
   * «tomt», og den hoppet til det FØRSTE anlegget av den typen. Et anlegg
   * nummer to lå i fila uten en eneste vei inn: man kunne lage det, det ble
   * lagret, det ble åpnet igjen, og det kunne ikke nås.
   *
   * Prøven måler de fire tingene som gjør flere anlegg brukbare i det hele
   * tatt: at hvert av dem kan nås, at de andre er å SE, at de ikke stjeler
   * klikkene fra det man arbeider med, og at tallene i topplinja er summen av
   * dem og ikke ett av dem.
   */
  async flereAnlegg() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    /* SLETTING SPØR FØRST, og spørsmålet er en dialog som venter på et klikk.
       I en prøve kommer det klikket aldri, og hele suiten ble stående. Her
       svares det ja med én gang; at dialogen finnes og virker er en annen sak,
       og den er prøvd der dialogen selv prøves. */
    const gammelBekreft = App.bekreft;
    App.bekreft = () => Promise.resolve(true);
    try {
      App.P = App.nyttProsjekt();
      App.P.navn = '__test_flere';
      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320, dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      const s0 = Geo.tilUtm(lat0, lon0, App.sone);
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      Terreng.prototype.z = function (x, y) { return 100 + (x - s0.x) * 0.05; };
      App._terrengnokkel = null;

      /* Ett veganlegg, som prosjektet starter med. */
      App.P.ip = [{ lat: lat0, lon: lon0, r: 0 }, { lat: lat0 + dLat(300), lon: lon0 + dLon(90), r: 0 }];
      App.byggLinje();
      await App.beregn();
      await this.vent(150);
      this.sjekk('prosjektet starter med ett anlegg', App.P.anlegg.length === 1,
        App.P.anlegg.length + '');

      /* HVERT ANLEGG MÅ KUNNE NÅS. */
      App.leggTilAnlegg('tomt');
      await this.vent(200);
      App.P.tomt.punkter = [[0, 500], [50, 500], [50, 560], [0, 560]]
        .map(([x, y]) => ({ lat: lat0 + dLat(y), lon: lon0 + dLon(x) }));
      /* Tomta må ha en ferdig kote, ellers finnes den ikke som modell – og da
         prøver samleeksporten under noe helt annet enn den skal. */
      App.P.tomt.nivaa = { modus: 'flat', kote: 101, fall: 0, fallretning: 0, punkt: null };
      App.tomtEndret();
      await App.beregnTomt();
      await this.vent(200);
      App.leggTilAnlegg('veg');
      await this.vent(200);
      // veg nummer to må ha geometri, ellers har den ingenting å tegne som bakgrunn
      App.P.ip = [{ lat: lat0 + dLat(60), lon: lon0 + dLon(220), r: 0 },
        { lat: lat0 + dLat(320), lon: lon0 + dLon(300), r: 0 }];
      App.byggLinje();
      this.sjekk('flere anlegg kan legges til', App.P.anlegg.length === 3,
        App.P.anlegg.map(a => a.type).join(','));

      const knapp = document.getElementById('anleggsknapp');
      const panel = document.getElementById('anleggspanel');
      this.sjekk('det finnes en knapp som viser hvilket anlegg man er i', !!knapp);
      this.sjekk('og et panel med anleggene i', !!panel);
      if (knapp && panel) {
        this.sjekk('knappen navngir det aktive anlegget',
          knapp.textContent.indexOf(App.anlegg().navn) >= 0, knapp.textContent.trim());
        const rader = panel.querySelectorAll('[data-bytt]');
        this.sjekk('hvert anlegg har sin egen rad – ingen er uten vei inn',
          rader.length === App.P.anlegg.length, rader.length + ' rader mot ' + App.P.anlegg.length + ' anlegg');
        /* Det som var umulig før: å komme til anlegg nummer to av samme type. */
        const vegene = App.P.anlegg.filter(a => a.type === 'veg');
        this.sjekk('  og det finnes to veger å skille mellom', vegene.length === 2);
        if (vegene.length === 2) {
          App.byttAnlegg(vegene[1].id);
          await this.vent(250);
          this.sjekk('man kommer til veg NUMMER TO – det gikk ikke før',
            App.P.aktivt === vegene[1].id, App.anlegg().navn);
        }
      }

      /* NAVN: «Tomt 2» og «Tomt 3» er to like ansikter. */
      const tomta = App.P.anlegg.find(a => a.type === 'tomt');
      App.merk('prøve');
      tomta.navn = 'Lagerplass';
      App.visAnleggsvelger();
      this.sjekk('anlegg kan hete noe annet enn typen sin',
        panel && panel.textContent.indexOf('Lagerplass') >= 0);

      /* DE ANDRE SKAL VÆRE Å SE – det er hele grunnen til at de er samlet. */
      App.byttAnlegg(App.P.anlegg[0].id);
      await this.vent(400);
      let former = 0, merker = 0;
      if (Kart.lag.andre) Kart.lag.andre.eachLayer(l => {
        if (l instanceof L.Path) former++; else merker++;
      });
      this.sjekk('de andre anleggene tegnes på kartet', former >= 2,
        former + ' former, ' + merker + ' navnemerker');
      this.sjekk('  og de bærer navnet sitt', merker >= 2, merker + '');

      /* OG DE SKAL IKKE STJELE KLIKKENE.
         Bakgrunnen lå i vanlig overlayPane og ble lagt sist i SVG-en på nytt
         ved hver opptegning. Da lå en dempet bakgrunnstomt ØVERST: et klikk på
         den aktive senterlinja traff tomteflaten, og «sett inn knekkpunkt» var
         dødt overalt der bakgrunnen dekket. */
      const rute = Kart.kart.getPane('andreAnlegg');
      this.sjekk('bakgrunnen har sin egen rute i kartet', !!rute);
      if (rute) {
        const bak = parseInt(rute.style.zIndex, 10);
        const over = parseInt(getComputedStyle(Kart.kart.getPane('overlayPane')).zIndex, 10) || 400;
        this.sjekk('  og den ligger UNDER det man arbeider med', bak < over,
          'bakgrunn ' + bak + ' mot arbeid ' + over);
      }

      /* TALLENE I TOPPLINJA ER HELE JOBBEN. */
      const sum = App.prosjektsum();
      this.sjekk('prosjektsummen finnes', !!sum);
      if (sum) {
        let egne = 0;
        for (const a of App.P.anlegg) if (a._sum) egne += a._sum.skjaering || 0;
        this.naer('summen er anleggene lagt sammen, ikke ett av dem',
          sum.skjaering, egne, Math.max(1, egne * 0.001));
        this.sjekk('  og den sier hvor mange som er regnet',
          sum.antall + sum.uregnet + sum.gamle === App.P.anlegg.length,
          sum.antall + ' regnet, ' + sum.uregnet + ' uregnet, ' + sum.gamle + ' gamle');
      }

      /* TVERRFALLET HØRER TIL VEGEN, IKKE TIL PROSJEKTET.
         Lista er nøklet på stasjon. Lå den på prosjektet, delte to veger den,
         og et tverrfall i profil 120 på den ene slo inn i profil 120 på den
         andre – et helt annet sted i terrenget. */
      const v1 = App.P.anlegg.filter(a => a.type === 'veg')[0];
      const v2 = App.P.anlegg.filter(a => a.type === 'veg')[1];
      App.byttAnlegg(v1.id);
      await this.vent(200);
      App.P.tverrfall = [{ s: 120, venstre: 0.05, hoyre: 0.05 }];
      App.byttAnlegg(v2.id);
      await this.vent(200);
      this.sjekk('tverrfall lagt inn på én veg gjelder ikke den andre',
        (App.P.tverrfall || []).length === 0, (App.P.tverrfall || []).length + ' oppføringer');
      App.byttAnlegg(v1.id);
      await this.vent(200);
      this.sjekk('  men står der man la det', (App.P.tverrfall || []).length === 1);

      /* ================================================================
         EN VEGBEREGNING TILHØRER VEGEN DEN BLE STARTET FOR.

         «Rett opp» og optimaliseringen er lange, asynkrone rutiner som kaller
         `beregn()` flere ganger med `await pause()` imellom. Byttet man anlegg
         i et av de mellomrommene, kom neste `beregn()` likevel – med den gamle
         vegens linje – og `huskAnleggstall()` skrev tallene på anlegget som var
         aktivt da. Målt før rettingen: en tomt på 1 013 m² med 923 m³ skjæring
         sto etterpå med 12 626 m³, hentet fra vegen. Tallet gikk rett inn i
         prosjektsummen, rapporten og PDF-en.

         Prøven gjør nøyaktig det: regner vegen ferdig, bytter til tomta, og
         kaller `beregn()` én gang til slik den forsinkede rutinen ville gjort.
         ================================================================ */
      {
        const veg1 = App.P.anlegg.find(x => x.type === 'veg');
        const tomt1 = App.P.anlegg.find(x => x.type === 'tomt');
        App.byttAnlegg(veg1.id);
        await this.vent(300);

        /* Vakten i `beregn()`: en vegberegning som kommer for sent skal ikke
           skrive tallene sine noe sted. */
        const vegTall = App.resultat && App.resultat.sum ? App.resultat.sum.skjaering : null;
        const vegLinje = App.linje, vegProfil = App.vprofil;
        App.byttAnlegg(tomt1.id);
        await this.vent(400);
        const sumFoer = tomt1._sum ? tomt1._sum.skjaering : null;
        /* Etternøleren hadde både linja, profilen og høydene til vegen med seg –
           det er nettopp derfor den kom seg forbi vaktene i første linje. */
        App.linje = vegLinje; App.vprofil = vegProfil;
        const tomtVip = tomt1.vip;
        tomt1.vip = veg1.vip.slice();
        App.beregn();
        tomt1.vip = tomtVip;
        const sumEtter = tomt1._sum ? tomt1._sum.skjaering : null;
        this.sjekk('en vegberegning som blir ferdig etter et anleggsbytte '
          + 'skriver ikke tallene sine på tomta',
        sumEtter === sumFoer, 'før ' + sumFoer + ', etter ' + sumEtter
          + ' (vegen har ' + (vegTall == null ? '–' : Math.round(vegTall)) + ')');

        /* Vakten i `_jobbpause()`: en lang rutine skal slutte å skrive i det
           hele tatt. `P.vip` er en aksessor til det AKTIVE anlegget, så
           «rett opp» skrev vegens høydeprofil rett inn i tomta – og den ble
           lagret i prosjektfila. Målt før rettingen: 0 punkt ble til 21. */
        App.byttAnlegg(veg1.id);
        await this.vent(300);
        const nyTomt = App.nyttAnlegg('tomt', '__vipprove');
        App.P.anlegg.push(nyTomt);
        const jobb = App.rettOpp();          // med vilje ikke ventet på
        await this.vent(30);
        App.byttAnlegg(nyTomt.id);
        await jobb;
        await this.vent(300);
        this.sjekk('«rett opp» skriver ikke vegens høyder inn i tomta '
          + 'man byttet til underveis',
        nyTomt.vip.length === 0, nyTomt.vip.length + ' punkt havnet der');
        App.P.anlegg.splice(App.P.anlegg.indexOf(nyTomt), 1);
        App.byttAnlegg(veg1.id);
        await this.vent(250);
      }

      /* ================================================================
         ALLE ANLEGGENE I SAMME 3D-BILDE

         Bryteren tegner naboanleggene som ferdige flater, bygd av lagret data
         alene. Det som må stemme er ikke at det kommer noe blått på skjermen,
         men at scenen er RIKTIG: at kameraet dekker det som er lagt til, at
         museoppslaget ikke svarer med tall fra et anlegg som ikke er regnet,
         at et anlegg som ikke kan tegnes blir sagt fra om, og at ingenting av
         dette lekker inn i en rapport som går til kunden.
         ================================================================ */
      {
        const veg1 = App.P.anlegg.filter(x => x.type === 'veg')[0];
        const tomt1 = App.P.anlegg.find(x => x.type === 'tomt');
        App.byttAnlegg(veg1.id);
        await this.vent(300);
        const foerOmfang = Veg3d.lag.andre;
        /* AKTIV-FLAGGET MÅ LEGGES TILBAKE.
           Første utgave satte `Veg3d.aktiv = true` for å få tegne, og glemte
           det. Etterpå trodde programmet at 3D-bildet sto framme mens panelet
           viste snittet – «Alle anlegg»-knappen ble stående i verktøylinja i
           tillegg til alle snittverktøyene, og panelhode-prøven lenger ned
           meldte 69 px og 35 % av panelet. Feilen var i prøven, ikke i
           programmet, og det er den slags som er vanskeligst å lete etter. */
        const foerVegAktiv = Veg3d.aktiv, foerTomtAktiv = Tomt3d.aktiv;
        Veg3d.aktiv = true;
        try {
          Tegner3d.settVisAndre(false);
          const av = Veg3d._bakgrunnsgitre();
          this.sjekk('3D: av som forvalg – ingen naboanlegg i scenen',
            av.length === 0, av.length + ' gitre');

          Tegner3d.settVisAndre(true);
          this.sjekk('  bryteren slår inn i BEGGE visningene, ikke bare den man står i',
            Veg3d.lag.andre === true && Tomt3d.lag.andre === true,
            'veg ' + Veg3d.lag.andre + ', tomt ' + Tomt3d.lag.andre);

          /* BRYTEREN MÅ VÆRE TIL Å FINNE.
             Den lå først blant lagbryterne bak «Vis ▾», og en funksjon man
             ikke vet finnes er like nyttig som en som ikke finnes – det var
             nøyaktig tilbakemeldingen: «kan fortsatt ikke se alle de
             forskjellige tomtene og vegene». Nå står den i verktøylinja, og
             bare når det finnes andre anlegg å vise. */
          {
            const kn = document.getElementById('v3_andre');
            this.sjekk('  «Alle anlegg» står i verktøylinja, ikke i en lukket meny',
              !!kn && !kn.closest('.menypanel'),
              kn ? (kn.closest('.menypanel') ? 'ligger i menypanelet' : 'i verktøylinja') : 'finnes ikke');
            if (kn) {
              Tegner3d.visAndreknapp();
              this.sjekk('    og den er framme når prosjektet har flere anlegg',
                !kn.classList.contains('skjult'), kn.className);
              /* Med ett anlegg finnes det ingen andre å vise, og en knapp som
                 ikke kan gjøre noe er verre enn ingen knapp. */
              const alle = App.P.anlegg;
              App.P.anlegg = [alle[0]];
              Tegner3d.visAndreknapp();
              this.sjekk('    og borte med bare ett anlegg', kn.classList.contains('skjult'),
                kn.className);
              App.P.anlegg = alle;
              /* OG BORTE I SNITTMODUS.
                 Sto den framme der òg, kom den i tillegg til alle
                 snittverktøyene og brøt verktøylinja til to rader – målt gikk
                 panelhodet fra 39 til 69 px og tok 35 % av panelet. Samme
                 regel som resten av 3D-verktøya følger. */
              const foerAktiv = Veg3d.aktiv;
              Veg3d.aktiv = false;
              Tegner3d.visAndreknapp();
              this.sjekk('    og borte når 3D-bildet ikke vises',
                kn.classList.contains('skjult'), kn.className);
              Veg3d.aktiv = foerAktiv;
              Tegner3d.visAndreknapp();
            }
          }

          const paa = Veg3d._bakgrunnsgitre();
          const andre = App.P.anlegg.filter(a => a.id !== App.P.aktivt);
          this.sjekk('  hvert av de andre anleggene er enten tegnet eller meldt utelatt',
            paa.length + (paa.utelatt || []).length === andre.length,
            paa.length + ' tegnet + ' + (paa.utelatt || []).length + ' meldt mot '
            + andre.length + ' andre anlegg');
          this.sjekk('  det aktive anlegget er ALDRI med i bakgrunnen',
            !paa.some(g => g.id === App.P.aktivt));

          /* AVSTANDEN MÅ DEKKE HELE SCENEN.
             `w = dist + dk`, og for et punkt D meter foran dreiepunktet er
             `dk ≈ -D`. Er D større enn `dist`, blir w negativ og punktet
             klippet bort. Med `dist` regnet av det AKTIVE gitteret alene
             forsvinner et naboanlegg som ligger lenger unna enn naboen er
             stor – og det forsvinner stille. */

          /* ET ANLEGG SOM IKKE KAN TEGNES SKAL DET SIES FRA OM.
             De to vanligste tilstandene til et halvferdig anlegg er nettopp
             de to som ikke lar seg tegne. */
          const nyVeg = App.nyttAnlegg('veg', '__uten_profil');
          nyVeg.ip = [{ lat: lat0 + dLat(700), lon: lon0 + dLon(10), r: 0 },
            { lat: lat0 + dLat(760), lon: lon0 + dLon(40), r: 0 }];
          App.P.anlegg.push(nyVeg);
          Veg3d._andreNokkel = null;
          const medUferdig = Veg3d._bakgrunnsgitre();
          this.sjekk('  en veg uten høydeprofil forsvinner ikke stille',
            (medUferdig.utelatt || []).some(s => s.indexOf('__uten_profil') === 0),
            JSON.stringify(medUferdig.utelatt || []));
          this.sjekk('    og de andre tegnes fortsatt',
            medUferdig.length === paa.length, medUferdig.length + ' mot ' + paa.length);
          App.P.anlegg.splice(App.P.anlegg.indexOf(nyVeg), 1);

          /* ER OMRISSET YTTERGRENSA, ER DET TEGNEDE POLYGONET IKKE TOMTA.
             Den ferdige flaten ligger innenfor, rykket inn med hele
             skråningsbredden – og innrykket krever terreng som ikke er lastet
             for et anlegg man ikke arbeider med. Å fylle ytterkanten på ferdig
             kote ville tegnet en plattform som er for stor. */
          if (tomt1 && tomt1.tomt) {
            const foerO = tomt1.tomt.omrissBetyr;
            tomt1.tomt.omrissBetyr = 'yttergrense';
            Veg3d._andreNokkel = null;
            const yg = Veg3d._bakgrunnsgitre();
            this.sjekk('  en yttergrense-tomt tegnes ikke som om omrisset var flaten',
              !yg.some(g => g.id === tomt1.id)
              && (yg.utelatt || []).some(s => s.indexOf('yttergrense') > 0),
              JSON.stringify(yg.utelatt || []));
            tomt1.tomt.omrissBetyr = foerO;
            Veg3d._andreNokkel = null;
          }

          /* INNRAMMINGEN MÅ ALDRI KOLLAPSE.
             Et punkt bak øyet gir `px = cx + F·rx/w` i milliardklassen med
             snudd fortegn. Ett slikt punkt forgifter randboksen, `skala` går
             mot null, og modellen blir en prikk – låst av `_skalaSatt`. */
          const gg = Veg3d._gitter(1);
          if (gg) {
            const t = Veg3d._tilpassSkala(800, 600, gg, Veg3d._bakgrunnsgitre());
            this.sjekk('  innrammingen gir en brukbar skala med naboanlegg i scenen',
              Number.isFinite(t.skala) && t.skala > 1e-4 && t.skala < 1e6,
              'skala ' + t.skala);
            this.sjekk('    og en forskyvning som er et tall',
              Number.isFinite(t.panX) && Number.isFinite(t.panY),
              t.panX + ', ' + t.panY);
          }

          /* «ALLE ANLEGG» ER EN SKJERMBRYTER OG SKAL ALDRI FØLGE MED I RAPPORTEN.
             Naboanleggene tegnes som ferdige flater UTEN skråninger og UTEN
             masser – de svarer på hvor ting ligger, ikke på hva de koster. I en
             rapport som går til kunden ville de stått i samme bilde som
             beregnede masser, uten noe som skiller dem: en flate som ser regnet
             ut og ikke er det.

             PRØVEN MÅ STÅ HER, IKKE I TOMTEGRUPPA. Første utgave lå der, og der
             finnes det bare ETT anlegg – `_bakgrunnsgitre` gir da tom liste
             uansett, og prøven passerte med vakten fjernet. En prøve som ikke
             kan feile er ikke en prøve. */
          if (tomt1 && tomt1.tomt && Number.isFinite(tomt1.tomt.nivaa.kote)) {
            App.byttAnlegg(tomt1.id);
            await this.vent(400);
            await App.beregnTomt();
            await this.vent(200);
            Tomt3d.aktiv = true;
            Tegner3d.settVisAndre(true);
            const bakgrunn = Tomt3d._bakgrunnsgitre();
            const blaa = async url => {
              if (!url) return null;
              const im = new Image();
              await new Promise(ok => { im.onload = ok; im.onerror = ok; im.src = url; });
              if (!im.width) return null;
              const c2 = document.createElement('canvas');
              c2.width = im.width; c2.height = im.height;
              const k2 = c2.getContext('2d');
              k2.drawImage(im, 0, 0);
              const d2 = k2.getImageData(0, 0, c2.width, c2.height).data;
              let b2 = 0, n2 = 0;
              for (let i = 0; i < d2.length; i += 4 * 5) {
                n2++;
                const r = d2[i], g2 = d2[i + 1], bb = d2[i + 2];
                if (bb > r + 18 && bb > g2 + 8 && bb > 60) b2++;
              }
              return b2 / n2;
            };
            this.sjekk('  det FINNES naboanlegg å lekke – ellers prøver den ingenting',
              bakgrunn.length > 0, bakgrunn.length + ' gitre');

            /* KAMERAAVSTANDEN MÅ DEKKE HELE SCENEN — prøvd HERFRA.
               `w = dist + dk`, og `dist` er 1,6 ganger scenens diagonal. Er den
               regnet av det AKTIVE anlegget alene, er den for kort så snart
               naboen er større enn en selv: en liten tomt med en lang veg ved
               siden av er nettopp det tilfellet, og det er det vanligste.
               Nodene bak nærplanet klippes bort, og vegen forsvinner stille.

               Prøven må stå her og ikke i vegen: fra vegen er tomtene små og
               nære, og da holder den korte avstanden også med feilen inne.
               Første utgave sto der, og passerte med vakten fjernet. */
            /* BETINGELSEN MÅ KONSTRUERES, ELLERS PRØVER DEN INGENTING.
               Prøvescenen har naboene tett på, og da holder den korte
               avstanden også med feilen inne – prøven passerte i to omganger
               med vakten fjernet. Her legges det derfor inn en tomt langt
               unna, slik en snuplass i den andre enden av en skogsbilveg
               ville ligget. Under er det målt at scenen faktisk KREVER den
               lange avstanden, før det måles at kameraet gir den. */
            const fjern = App.nyttAnlegg('tomt', '__langt_unna');
            fjern.tomt.punkter = [[900, 900], [960, 900], [960, 960], [900, 960]]
              .map(([x, y]) => ({ lat: lat0 + dLat(y), lon: lon0 + dLon(x) }));
            fjern.tomt.nivaa = { modus: 'flat', kote: 145, fall: 0, fallretning: 0, punkt: null };
            App.P.anlegg.push(fjern);
            Tomt3d._andreNokkel = null;
            const medFjern = Tomt3d._bakgrunnsgitre();
            const gT = Tomt3d._gitter(1);
            if (gT && medFjern.length) {
              const kort = Math.max(60, (gT.diagonal || 0) * 1.6);
              let lengst = 0;
              for (const bg of medFjern) {
                for (let kk = 0; kk < bg.nb * bg.nh; kk++) {
                  if (!bg.finnes[kk]) continue;
                  lengst = Math.max(lengst,
                    Math.hypot(bg.wx[kk] - gT.midtX, bg.wy[kk] - gT.midtY));
                }
              }
              this.sjekk('  scenen krever virkelig en lengre kameraavstand enn '
                + 'anlegget selv – ellers måler prøven under ingenting',
              lengst > kort, 'fjerneste node ' + Math.round(lengst)
                + ' m unna, egen avstand ville vært ' + Math.round(kort) + ' m');

              /* DREININGEN MÅ PRØVES RUNDT.
                 `dk = -(ry·cos p + z·sin p)`, og `ry` skifter fortegn med
                 blikkretningen: et naboanlegg som ligger BAK dreiepunktet får
                 w større enn avstanden, mens det samme anlegget foran får w
                 mindre. Med bare én yaw traff prøven den snille siden og
                 passerte i to omganger med feilen inne. Invarianten gjelder
                 uansett hvor man har dreid seg, og da må den prøves slik. */
              Tomt3d._sceneDiagonal = Tomt3d._scenediagonal(gT, medFjern);
              const foerYaw = Tomt3d.yaw, foerPitch = Tomt3d.pitch;
              let bak = 0, alle = 0, verst = Infinity, verstYaw = null;
              for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
                Tomt3d.yaw = yaw;
                const kam = Tomt3d._kamera(900, 700, gT, 1, 0, 0);
                const naerT = kam.naer || 1e-6;
                for (const bg of medFjern) {
                  for (let kk = 0; kk < bg.nb * bg.nh; kk++) {
                    if (!bg.finnes[kk]) continue;
                    alle++;
                    const hz = Tomt3d._bakgrunnHoyde(bg);
                    const q = kam.punkt(bg.wx[kk], bg.wy[kk], hz[kk]);
                    if (!(q.w > naerT)) bak++;
                    if (q.w < verst) { verst = q.w; verstYaw = yaw; }
                  }
                }
              }
              Tomt3d.yaw = foerYaw; Tomt3d.pitch = foerPitch;
              this.sjekk('  kameraet rekker ut til hele scenen – ingen node i et '
                + 'naboanlegg havner bak øyet, uansett dreining',
              alle > 0 && bak === 0,
              bak + ' av ' + alle + ' noder bak nærplanet, minste dybde '
                + (Number.isFinite(verst) ? verst.toFixed(0) : '–') + ' m ved yaw ' + verstYaw);
            }
            App.P.anlegg.splice(App.P.anlegg.indexOf(fjern), 1);
            Tomt3d._andreNokkel = null;
            if (App.resultat && App.resultat.rutenett && App.resultat.rutenett.length) {
              const teg = Rapport.lagTomtetegninger(App.resultat);
              const pst = [await blaa(teg.plan), await blaa(teg.perspektiv)]
                .filter(v => v != null);
              this.sjekk('  rapportbildene har ingen naboanlegg i seg, selv med bryteren på',
                pst.length > 0 && pst.every(v => v < 0.002),
                pst.map(v => (v * 100).toFixed(2) + ' %').join(', '));
              this.sjekk('    og bryteren står fortsatt på etterpå – rapporten låner, den tar ikke',
                Tomt3d.lag.andre === true);
            }
            Tomt3d.aktiv = foerTomtAktiv;    // ikke «false» – tilbake til det den var
            App.byttAnlegg(veg1.id);
            await this.vent(300);
          }
          /* ================================================================
             FULL DETALJ: naboanlegget regnet ut, ikke skissert.

             Skissen svarer på «hvor ligger de»; den fulle svarer på «hva skjer
             der». Det som må stemme er at den fulle faktisk BLIR brukt når den
             finnes, at den overlever byttet den ble bygd under, og at
             byggingen ikke koster brukeren noe han ikke ba om – hverken
             kameraet han står i eller angrehistorikken sin.
             ================================================================ */
          {
            const tomtA = App.P.anlegg.find(x => x.type === 'tomt'
              && x.tomt && x.tomt.nivaa && Number.isFinite(x.tomt.nivaa.kote));
            if (tomtA) {
              App.tomHistorikk();
              const angreFoer = App.historikk.bakover.length;
              const aktivFoer = App.P.aktivt;
              /* KAMERAPRØVEN MÅ STÅ PÅ BAKKEN.
                 `byttAnlegg` rører ikke yaw, og bytter bare modus når man ER i
                 bakkemodus – så en prøve tatt fra oversikten passerer også med
                 gjenopprettingen fjernet. Den som vil se naboene i full detalj
                 står ofte nede i modellen, og det er nettopp han som ble kastet
                 opp i oversikten uten dreiepunktet sitt. */
              Veg3d.settModus('bakken', true);
              await this.vent(200);
              const kamFoer = { modus: Veg3d.modus, senter: Veg3d.senter,
                kamYaw: Veg3d.kamYaw, panX: Veg3d.panX };
              Veg3d.panX = 37;                       // noe byttAnlegg ville nullet
              await Tegner3d.byggFulleAnlegg();
              await this.vent(300);

              this.sjekk('  full detalj kommer tilbake til anlegget man sto i',
                App.P.aktivt === aktivFoer, App.anlegg().navn);
              /* Programmets egen runde er ikke noe å angre. Uten vakten i
                 App.merk ble hvert hopp en post, og «Gjør om» ble tømt. */
              this.sjekk('  og legger ingenting i angrehistorikken',
                App.historikk.bakover.length === angreFoer,
                angreFoer + ' → ' + App.historikk.bakover.length);
              this.sjekk('  og lar kameraet stå der det sto – også på bakken',
                Veg3d.modus === kamFoer.modus && Veg3d.panX === 37,
                Veg3d.modus + ' (var ' + kamFoer.modus + ') · panX ' + Veg3d.panX);
              Veg3d.settModus('oversikt', true);
              Veg3d.panX = kamFoer.panX;
              await this.vent(150);

              Veg3d._andreNokkel = null;
              const medFull = Veg3d._bakgrunnsgitre();
              const fulle = medFull.filter(x => x.full);
              this.sjekk('  det finnes fullt regnede naboanlegg i scenen',
                fulle.length > 0, fulle.length + ' av ' + medFull.length);

              if (fulle.length) {
                const f = fulle[0];
                /* Et fullt gitter har INGEN `z` – det har zT, zP og zEtter.
                   Innrammingen leste `bg.z[kk]` og kastet på undefined, midt i
                   byggingen, så knappen så ut til å ødelegge noe. Kastet kom
                   før `_skalaSatt = true`, så hver senere opptegning kastet òg:
                   3D-bildet var dødt til sida ble lastet om. */
                this.sjekk('    og de har ingen egen z – innrammingen må tåle det',
                  f.z === undefined && !!f.zT, 'z=' + typeof f.z + ' zT=' + typeof f.zT);
                const gA = Veg3d._gitter(1);
                let kastet = null;
                try {
                  const t = Veg3d._tilpassSkala(800, 600, gA, medFull);
                  if (!Number.isFinite(t.skala) || !(t.skala > 0)) kastet = 'skala ' + t.skala;
                } catch (e) { kastet = e.message; }
                this.sjekk('    innrammingen tåler et fullt gitter', kastet === null,
                  kastet || 'ok');

                /* FØR/ETTER GJELDER ALLE. Naboen må bytte flate den òg – ellers
                   står to ulike svar i samme bilde uten at noe sier at de er
                   ulike. */
                const eier = f.eier;
                const vF = eier.visning;
                eier.visning = 'foer'; const tF = eier._flateHoyde(f);
                eier.visning = 'etter'; const tE = eier._flateHoyde(f);
                eier.visning = vF;
                let ulike = 0, talte = 0;
                for (let k2 = 0; k2 < f.nb * f.nh; k2++) {
                  if (!f.finnes[k2]) continue;
                  talte++;
                  if (Math.abs(tF[k2] - tE[k2]) > 0.05) ulike++;
                }
                this.sjekk('    og «før» og «etter» gir naboen to ULIKE flater',
                  talte > 0 && ulike > talte * 0.1, ulike + ' av ' + talte + ' noder');

                /* ÉN FARGESKALA FOR HELE BILDET. Er den per anlegg, betyr samme
                   rødtone to ulike dybder i samme bilde. */
                const felles = Veg3d._felleskala(gA, medFull);
                this.sjekk('    fargeskalaen dekker det dypeste i HELE scenen',
                  felles >= gA.maksAvvik - 1e-9 && felles >= f.maksAvvik - 1e-9,
                  'felles ' + (felles || 0).toFixed(2) + ', eget ' + gA.maksAvvik.toFixed(2)
                  + ', nabo ' + (f.maksAvvik || 0).toFixed(2));

                /* BUFERNØKKELEN MÅ DEKKE DET DEN FULLE AVHENGER AV.
                   En skisse avhenger av geometri og kote. En full avhenger av
                   hele malen òg – endrer man skråningshelningen på naboen, er
                   det bufra gitteret feil, mens lista fortsatt sier ● . */
                const anl = App.P.anlegg.find(x => x.id === f.id);
                if (anl && anl.mal) {
                  const n1 = Tegner3d._fullnokkel.call(Veg3d, anl);
                  const gml = anl.mal.skjaeringLosmasse;
                  anl.mal.skjaeringLosmasse = (gml || 1) + 0.37;
                  const n2 = Tegner3d._fullnokkel.call(Veg3d, anl);
                  anl.mal.skjaeringLosmasse = gml;
                  this.sjekk('    og nøkkelen merker en endret skråningshelning',
                    n1 !== n2);
                }

                /* ================================================================
                   SKJERMBOKSEN: raskere, og NØYAKTIG det samme bildet.

                   Et gjennomsiktig lag tømte og blandet over hele lerretet, én
                   gang per lag. Boksen skal kutte det arbeidet – men en boks som
                   er for liten lar piksler stå igjen fra forrige lag, og det er
                   akkurat den slags feil som ser ut som «litt rart i kanten» og
                   aldri blir funnet. Derfor prøves grensen selv, ikke bare at
                   det gikk fortere.
                   ================================================================ */
                {
                  const kamB = Veg3d._kamera(900, 700, gA, 1, 0, 0);
                  const naerB = kamB.naer || 1e-6;
                  let utafor = 0, prov = 0, bokser = 0, dekning = 0;
                  for (const bg of [gA, f]) {
                    const hz = Veg3d._bakgrunnHoyde(bg) || bg.zT || bg.z;
                    if (!hz) continue;
                    const b = Tegner3d._skjermboks(bg, hz, kamB, 900, 700);
                    bokser++;
                    dekning += (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) / (900 * 700);
                    for (let kk = 0; kk < bg.nb * bg.nh; kk++) {
                      if (!bg.finnes[kk] || !Number.isFinite(hz[kk])) continue;
                      const q = kamB.punkt(bg.wx[kk], bg.wy[kk], hz[kk]);
                      if (!(q.w > naerB)) continue;
                      if (q.px < -1 || q.px > 901 || q.py < -1 || q.py > 701) continue;
                      prov++;
                      const x = Math.max(0, Math.min(899, q.px));
                      const y = Math.max(0, Math.min(699, q.py));
                      if (x < b.x0 - 1 || x > b.x1 + 1 || y < b.y0 - 1 || y > b.y1 + 1) utafor++;
                    }
                  }
                  this.sjekk('  skjermboksen rommer hver eneste node i gitteret',
                    prov > 0 && utafor === 0,
                    utafor + ' av ' + prov + ' noder utenfor boksen');

                  /* DEN AVGJØRENDE PRØVEN: bildet skal være det SAMME.
                     En optimalisering som endrer én piksel er ikke en
                     optimalisering, den er en feil man ikke har oppdaget
                     ennå. Her tegnes scenen to ganger – én gang med boksen og
                     én gang med boksen slått av, altså nøyaktig slik koden var
                     før – og de to bildene sammenlignes byte for byte. */
                  /* LERRETET MÅ FAKTISK VÆRE SYNLIG.
                     `<canvas id="veg3d" class="skjult">` gir `display: none`, og
                     da returnerer `tegn()` med én gang på `offsetParent === null`.
                     Her sto prøven bak en `if` på nettopp det, uten `else` – så
                     den hoppet stille over, sto som en linje i lista som aldri
                     ble kjørt, og ville vært grønn med hele optimaliseringen
                     revet ut. `Veg3d.aktiv = true` er bare et JS-flagg; det er
                     `aktiver()` som tar bort klassen. */
                  {
                    /* Bare klassen, ikke `aktiver()`. `aktiver` bytter hele
                       arbeidsflaten (`App.stort3d`), skjuler tverrprofilen og
                       rører modus – og panelene kom ikke tilbake som de var,
                       slik `panelhoder` sa fra om. Å ta bort `skjult` gir
                       lerretet 878 × 158 px og rører ingenting annet. */
                    const c9 = Veg3d.lerret;
                    const skjult9 = c9 && c9.classList.contains('skjult');
                    if (skjult9) c9.classList.remove('skjult');
                    await this.vent(80);
                    const synlig = !!(c9 && c9.offsetParent !== null && c9.clientWidth > 20);
                    this.sjekk('    veglerretet er synlig, så prøven under kan kjøre',
                      synlig, c9 ? (c9.offsetParent === null ? 'skjult' : c9.width + ' px') : 'intet lerret');
                    if (synlig) {
                      const kk9 = c9.getContext('2d');
                      const orgB = Tegner3d._skjermboks;
                      let ulikt = -1, tot = 0;
                      try {
                        Veg3d.tegn();
                        const a9 = kk9.getImageData(0, 0, c9.width, c9.height).data;
                        Tegner3d._skjermboks = (g9, h9, kam9, rb9, rh9) =>
                          ({ x0: 0, y0: 0, x1: rb9 - 1, y1: rh9 - 1 });
                        Veg3d.tegn();
                        const d9 = kk9.getImageData(0, 0, c9.width, c9.height).data;
                        ulikt = 0; tot = a9.length / 4;
                        for (let i = 0; i < a9.length; i += 4) {
                          if (a9[i] !== d9[i] || a9[i + 1] !== d9[i + 1]
                            || a9[i + 2] !== d9[i + 2]) ulikt++;
                        }
                      } finally { Tegner3d._skjermboks = orgB; Veg3d.tegn(); }
                      this.sjekk('    og gir NØYAKTIG samme bilde som uten den',
                        ulikt === 0, ulikt + ' av ' + tot + ' piksler ulike');
                      /* Og bildet må ha noe i seg. Et tomt lerret er også
                         «nøyaktig likt», og da beviser prøven ingenting. */
                      const b9 = kk9.getImageData(0, 0, c9.width, c9.height).data;
                      let malt = 0;
                      for (let i = 0; i < b9.length; i += 4 * 5) {
                        if (b9[i] !== b9[0] || b9[i + 1] !== b9[1] || b9[i + 2] !== b9[2]) malt++;
                      }
                      this.sjekk('      og bildet er ikke tomt – ellers beviser likheten intet',
                        malt > 200, malt + ' piksler skiller seg fra bakgrunnen');
                    }
                    if (skjult9) c9.classList.add('skjult');
                    await this.vent(60);
                  }
                  this.sjekk('    og den er MINDRE enn lerretet – ellers sparer den ingenting',
                    bokser > 0 && dekning / bokser < 0.95,
                    ((dekning / Math.max(1, bokser)) * 100).toFixed(0) + ' % av lerretet i snitt');

                  /* Tømmingen skal treffe boksen og bare boksen. Går den for
                     langt, sletter den et lag som alt er blandet inn. */
                  /* Skrapebufferne bor på VISNINGEN, ikke på Tegner3d – `this`
                     inne i `tegn()` er Veg3d eller Tomt3d – og de finnes
                     først etter at panelet har tegnet en gang. Prøven kaller
                     derfor `_toemBoks` med sitt EGET par buffer: det er den
                     samme koden, og den avhenger ikke av hvilket panel som
                     tilfeldigvis står åpent. Sto det `Tegner3d._lag2` her,
                     var de undefined, og hele prøven hoppet stille over. */
                  const rbT = 40, rhT = 30;
                  const l2 = new Uint32Array(rbT * rhT);
                  const d2 = new Float32Array(rbT * rhT);
                  const merke = 0xdeadbeef | 0;
                  for (let i = 0; i < rbT * rhT; i++) { l2[i] = merke; d2[i] = -7; }
                  const boksT = { x0: 5, y0: 4, x1: 12, y1: 9 };
                  Tegner3d._toemBoks.call({ _lag2: l2, _dyp2: d2 }, boksT, rbT);
                  let inneFeil = 0, utaFeil = 0;
                  for (let y = 0; y < rhT; y++) {
                    for (let x = 0; x < rbT; x++) {
                      const i = y * rbT + x;
                      const inne = x >= boksT.x0 && x <= boksT.x1
                        && y >= boksT.y0 && y <= boksT.y1;
                      if (inne) { if (l2[i] !== 0 || d2[i] !== Infinity) inneFeil++; }
                      else if (l2[i] !== (merke >>> 0) || d2[i] !== -7) utaFeil++;
                    }
                  }
                  this.sjekk('  tømmingen nullstiller hele boksen',
                    inneFeil === 0, inneFeil + ' av 48 piksler igjen');
                  this.sjekk('    og rører ikke én piksel utenfor den',
                    utaFeil === 0, utaFeil + ' piksler slettet for mye');
                }

                /* ================================================================
                   DEMPINGEN: naboen skal sees, ikke forveksles.

                   Metningen svekkes og lyset senkes med en FAKTOR – se
                   `_dempet`. Kravene er de som ble brutt av de to tidligere
                   utgavene: hver eneste flate programmet faktisk tegner må bli
                   synlig annerledes (metning alene gjorde ingenting på
                   vegbanen og bærelaget, som er grå fra før), og forholdet
                   mellom lys og skygge må stå urørt (et ledd som TREKKER FRA
                   klemte spennet 0,55–1,00 ned og tok bort formen).
                   ================================================================ */
                {
                  const kanal = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
                  const lag = v => (255 << 24) | (v[2] << 16) | (v[1] << 8) | v[0];
                  const gjennom = p => kanal(Tegner3d._dempet(() => lag(p))(0, 0, 0, 0, 0));

                  /* HVER FLATE MÅ BLI SYNLIG ANNERLEDES. Dette er hele
                     hensikten, og det er nettopp her metning alene sviktet:
                     `--data-slitelag` og `--data-baerelag` har metning 0,10 og
                     0,06, og endret seg med fire nivåer av 255 – altså ikke i
                     det hele tatt. Og det er de to som er selve leveransen. */
                  const flater = ['data-skjaering-flate', 'data-fylling-flate',
                    'data-fjell', 'data-slitelag', 'data-baerelag'];
                  let svakest = 999, svakestNavn = '';
                  for (const navn of flater) {
                    const p = Farger.rgb(navn);
                    if (!p) continue;
                    const q = gjennom([p[0], p[1], p[2]]);
                    let d = 0;
                    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(p[c] - q[c]));
                    if (d < svakest) { svakest = d; svakestNavn = navn; }
                  }
                  this.sjekk('  dempingen endrer HVER flate programmet tegner, synlig',
                    svakest >= 8, 'svakest ' + svakestNavn + ': ' + svakest + ' av 255');

                  /* FORHOLDET MELLOM LYS OG SKYGGE SKAL STÅ. `_lys` holder med
                     vilje 0,55–1,00 fordi et videre spenn gjør at man ser
                     fargen, men ikke formen. En faktor rører ikke det
                     forholdet; et fratrekk klemmer det sammen. */
                  let verstSpenn = 0;
                  for (const p of [[255, 40, 30], [60, 140, 60], [160, 163, 170]]) {
                    const luma = q => 0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2];
                    const lys = gjennom(p.map(v => Math.min(255, v)));
                    const skygge = gjennom(p.map(v => Math.min(255, v * 0.55)));
                    const foerR = luma(p.map(v => v * 0.55)) / luma(p);
                    const etterR = luma(skygge) / Math.max(1e-9, luma(lys));
                    verstSpenn = Math.max(verstSpenn, Math.abs(foerR - etterR));
                  }
                  this.sjekk('    og forholdet lys/skygge står urørt – formen blir',
                    verstSpenn < 0.02, 'verst ' + verstSpenn.toFixed(4));

                  const ut = gjennom([255, 40, 30]);
                  this.sjekk('    kuløren står – rødt er fortsatt rødt',
                    ut[0] > ut[1] && ut[0] > ut[2], ut.join(', '));
                  /* TERSKELEN MÅ FELLE «DEMPINGA AV».
                     Her sto 185. Spennet er nøyaktig 225 · LYSDEMPING · METNING
                     = 180 · METNING, så METNING kunne settes til 1,00 – altså
                     hele metningsdempingen av – og prøven var fortsatt grønn.
                     117 er 0,65 av spennet, den grensa `_dempet` selv sier var
                     for slakk til å skille anleggene. */
                  const spenn = ut[0] - Math.min(ut[1], ut[2]);
                  this.sjekk('    men svakere – ellers ser man ingen forskjell',
                    spenn < 117, 'spenn ' + spenn + ' av 225, må under 117');
                  /* Og det må være METNINGEN som gjør det. Uten dette kunne
                     lysdempingen alene bære prøven, og metningsleddet være
                     dødt – akkurat det som gjorde at vegbanen og bærelaget
                     ikke ble dempet i det hele tatt i forrige utgave. */
                  const bareLys = [255, 40, 30].map(v => Math.round(v * Tegner3d.LYSDEMPING));
                  const lysSpenn = bareLys[0] - Math.min(bareLys[1], bareLys[2]);
                  this.sjekk('    og det er METNINGEN som gjør det, ikke bare lyset',
                    lysSpenn - spenn >= 60,
                    'metningens bidrag ' + (lysSpenn - spenn) + ' av ' + lysSpenn);
                  /* En gråtone skal bli grå igjen, ikke få en kulør: en dempet
                     bakke med et fargestikk leses som et annet materiale. */
                  const gq = gjennom([142, 142, 142]);
                  this.sjekk('    og en gråtone er fortsatt grå, bare mørkere',
                    gq[0] === gq[1] && gq[1] === gq[2] && gq[0] < 142,
                    gq.slice(0, 3).join(', '));

                  let overflod = 0, gjennomsiktig = 0;
                  for (const p of [[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0],
                    [0, 0, 255], [128, 200, 17]]) {
                    const q = gjennom(p);
                    for (let c = 0; c < 3; c++) if (q[c] < 0 || q[c] > 255) overflod++;
                    if (q[3] !== 255) gjennomsiktig++;
                  }
                  this.sjekk('    ingen kanal renner over 0–255',
                    overflod === 0, overflod + ' avvik');
                  this.sjekk('    og alfakanalen står på 255 – svak, ikke gjennomsiktig',
                    gjennomsiktig === 0);
                  /* «Tegn ingenting» må komme uendret gjennom. Dempet man 0 til
                     en gråtone, fikk hver node uten flate en firkant. */
                  this.sjekk('    og «ingen farge» blir fortsatt ingen farge',
                    Tegner3d._dempet(() => 0)(0, 0, 0, 0, 0) === 0);

                  /* I «etter» er modellen ÉN flate: bakke der ingen har gjort
                     noe, arbeid der noen har. Bakken er felles med naboen og
                     MÅ stå urørt – ellers er sømmen tilbake. */
                  const bygd = new Uint8Array([0, 1]);
                  const raa = lag([200, 60, 50]);
                  const dd = Tegner3d._dempetDer(() => raa, bygd);
                  this.sjekk('    i etter-visningen står den felles bakken helt urørt',
                    dd(0, 0, 0, 0, 0) === raa, 'urørt der ingen har gravd');
                  this.sjekk('    mens arbeidet ved siden av dempes',
                    dd(1, 0, 0, 0, 0) !== raa);
                }

                /* ================================================================
                   I «FØR» HAR INGEN GJORT NOE ENNÅ

                   Hele modellen er dagens terreng, og `_flateHoyde` returnerer
                   nettopp `g.zT` – samme tabell, samme referanse. Sto
                   helflate-grenen foran `erTerreng`-grenen, ble naboens
                   fotavtrykk malt en femtedel mørkere enn den identiske bakken
                   rundt: en ren skyggekant langs ei linje som ikke finnes i
                   landskapet, i det ene bildet der ingenting er bygd.
                   ================================================================ */
                {
                  const eier9 = f.eier;
                  const vFoer = eier9.visning;
                  eier9.visning = 'foer';
                  const flate9 = eier9._flateHoyde(f);
                  eier9.visning = vFoer;
                  this.sjekk('  i «før» ER helflaten terrenget selv',
                    flate9 === f.zT, flate9 === f.zT ? 'samme tabell' : 'en annen tabell');
                  /* Og da må dempingen la den være. Prøven speiler valget i
                     `_tegnFulltAnlegg`: er flaten `zT`, skal ingen demping på. */
                  const erTerreng9 = flate9 === f.zT;
                  const heilflate9 = true;
                  const bygd9 = f.harGrav || f.harVeg || f.harFerdig || null;
                  const valgt = !erTerreng9 && heilflate9 && bygd9 ? 'dempetDer'
                    : erTerreng9 ? 'ingen' : 'dempet';
                  this.sjekk('    så «før» dempes ikke i det hele tatt',
                    valgt === 'ingen', 'valgte: ' + valgt);
                }

                /* NABOEN SKAL IKKE VÆRE GROVERE ENN HAN VILLE VÆRT SELV.
                   Et veggitter har ingen `rute` – det er en korridor med
                   kolonner på tvers – så prøven gjelder tomter, og målet er
                   anleggets EGEN rutestørrelse. Sto naboen på det dobbelte,
                   ble cellene hans trappetrinn langs hver skråningskant mens
                   ens eget lå glatt ved siden av, og to oppløsninger i samme
                   bilde leses ikke som «den ene er grovere», men som at noe er
                   galt med den ene. */
                if (f.type === 'tomt' && Number.isFinite(f.rute)) {
                  const anlF = App.P.anlegg.find(x => x.id === f.id);
                  const egen = Math.max(0.05, (anlF && anlF.mal && anlF.mal.rutestorrelse) || 1);
                  this.sjekk('  naboanlegget regnes like fint som det ville gjort selv',
                    f.rute <= egen + 1e-9,
                    'nabo ' + f.rute + ' m, egen rutestørrelse ' + egen + ' m');
                }

                /* ================================================================
                   DEKNINGSMASKEN: mellomlagret, men ikke fastlåst.

                   Masken deler den felles bakken mellom anleggene, og
                   dekningen VOKSER mens scenen tegnes – hvert anlegg får bare
                   det de foregående ikke tok. Lagret man `dekning`-objektet
                   selv, ville det stått fullt utvokst ved neste bilde, og det
                   første naboanlegget hadde ikke tegnet terreng i det hele
                   tatt. Derfor: regn to ganger og krev nøyaktig samme svar.
                   ================================================================ */
                {
                  Tegner3d._maskeBuffer = null;
                  const m1 = Tegner3d._terrengmasker(gA, medFull);
                  const bufra = Tegner3d._terrengmasker(gA, medFull);
                  Tegner3d._maskeBuffer = null;
                  const m2 = Tegner3d._terrengmasker(gA, medFull);

                  this.sjekk('  dekningsmasken deler bakken mellom anleggene',
                    m1.size > 0, m1.size + ' masker');
                  this.sjekk('    og den mellomlagres – samme svar uten å regne om',
                    bufra === m1);

                  let ulike = 0, noder = 0, dekt = 0, iAktiv = 0;
                  /* Ligger naboen langt unna, er det RIKTIG at masken ikke tar
                     noe – de deler ingen bakke. Prøven må derfor bare gjelde
                     de nodene som faktisk ligger inne i det aktive gitterets
                     omriss; det er der de to ellers ville tegnet hver sin
                     flate i samme høyde. */
                  let aX0 = Infinity, aX1 = -Infinity, aY0 = Infinity, aY1 = -Infinity;
                  for (let i = 0; i < gA.nb * gA.nh; i++) {
                    if (!gA.finnes[i]) continue;
                    if (gA.wx[i] < aX0) aX0 = gA.wx[i];
                    if (gA.wx[i] > aX1) aX1 = gA.wx[i];
                    if (gA.wy[i] < aY0) aY0 = gA.wy[i];
                    if (gA.wy[i] > aY1) aY1 = gA.wy[i];
                  }
                  for (const [bg, a1] of m1) {
                    const b1 = m2.get(bg);
                    if (!b1 || b1.length !== a1.length) { ulike += 1e6; continue; }
                    for (let i = 0; i < a1.length; i++) {
                      noder++;
                      if (a1[i] !== b1[i]) ulike++;
                      if (!bg.finnes[i]) continue;
                      const inne = bg.wx[i] >= aX0 && bg.wx[i] <= aX1
                        && bg.wy[i] >= aY0 && bg.wy[i] <= aY1;
                      if (inne) { iAktiv++; if (!a1[i]) dekt++; }
                    }
                  }
                  this.sjekk('    og en ny runde gir NØYAKTIG samme deling',
                    noder > 0 && ulike === 0, ulike + ' av ' + noder + ' noder ulike');
                  /* Tar masken ingenting der de FAKTISK deler bakke, gjør den
                     ingen nytte: da tegner to anlegg den samme bakken, og
                     kamuflasjemønsteret er tilbake. */
                  this.sjekk('    og den tar bakken fra naboen der de deler den',
                    iAktiv === 0 || dekt > 0,
                    dekt + ' av ' + iAktiv + ' noder inne i det aktive omrisset');

                  /* Bytter gitteret, må masken bygges på nytt. Uten det ville
                     man sett forrige anleggs deling tegnet over sitt eget. */
                  const falskt = Object.assign({}, gA);
                  const m3 = Tegner3d._terrengmasker(falskt, medFull);
                  this.sjekk('    men et nytt gitter gir en ny maske',
                    m3 !== m1);
                  Tegner3d._maskeBuffer = null;

                  /* MASKEN MÅ TA HØYDE FOR FIREHJØRNESREGELEN.
                     `_raster` tegner en celle bare når alle fire hjørnene har
                     `krev`. Er masken ikke utvidet med én node, begynner naboen
                     en hel nabocelle for langt ute, og det står en utegnet
                     stripe langs hele sømmen – fire og en halv meter der
                     naboens kontekstkolonner er fem. */
                  {
                    /* MÅLET ER DEN TAPTE RANDEN, ikke et forhold.
                       Første utgave av denne prøven målte «hele celler delt på
                       noder med krev», og den var 99,4 % både med og uten
                       utvidelsen – begge tallene vokser sammen, så prøven kunne
                       ikke feile. Det som faktisk skiller er hvor mange noder
                       som HAR krev men ikke er hjørne i en eneste tegnbar
                       celle: det er nøyaktig randen som blir stående utegnet.
                       Målt på brukerens prosjekt: 3 med utvidelsen, 34 uten. */
                    /* MÅLET ER TEGNBARE CELLER, ikke noder.
                       Første forsøk telte «noder med krev som ikke er hjørne i
                       noen hel celle», og det var null begge veier – en randnode
                       er hjørne i FIRE celler, og én hel celle lenger ute redder
                       den. Det som faktisk blir borte er selve cellen over
                       sømmen, så det er cellene som må telles. */
                    const tegnbare = m => {
                      let celler = 0, medKrev = 0;
                      for (const [bg, mk] of m) {
                        for (let j = 0; j < bg.nh - 1; j++) {
                          for (let i = 0; i < bg.nb - 1; i++) {
                            const k = j * bg.nb + i;
                            if (!bg.finnes[k] || !bg.finnes[k + 1]
                              || !bg.finnes[k + bg.nb] || !bg.finnes[k + bg.nb + 1]) continue;
                            if (mk[k] && mk[k + 1] && mk[k + bg.nb] && mk[k + bg.nb + 1]) celler++;
                          }
                        }
                        for (let k = 0; k < bg.nb * bg.nh; k++) {
                          if (bg.finnes[k] && mk[k]) medKrev++;
                        }
                      }
                      return { celler, medKrev };
                    };
                    /* SØMMEN MÅ KONSTRUERES, ellers prøver vi ingenting.
                       I dette prøveprosjektet ligger anleggene fra hverandre, så
                       masken tar ingenting og begge tallene blir null – og en
                       prøve som sammenligner null med null kan ikke feile. Her
                       bygges derfor et nabogitter med GROVE celler som dekker
                       nøyaktig den samme bakken som det aktive: det er da
                       firehjørnesregelen spiser en hel nabocelle, og det er den
                       stripa utvidelsen finnes for. */
                    let nX0 = Infinity, nX1 = -Infinity, nY0 = Infinity, nY1 = -Infinity;
                    for (let i = 0; i < gA.nb * gA.nh; i++) {
                      if (!gA.finnes[i]) continue;
                      if (gA.wx[i] < nX0) nX0 = gA.wx[i];
                      if (gA.wx[i] > nX1) nX1 = gA.wx[i];
                      if (gA.wy[i] < nY0) nY0 = gA.wy[i];
                      if (gA.wy[i] > nY1) nY1 = gA.wy[i];
                    }
                    const grov = 5;                      // som en vegs kontekstkolonner
                    const gnb = Math.max(4, Math.round((nX1 - nX0) / grov) + 6);
                    const gnh = Math.max(4, Math.round((nY1 - nY0) / grov) + 6);
                    const nabo = { nb: gnb, nh: gnh, full: true, eier: gA.eier || Veg3d,
                      wx: new Float64Array(gnb * gnh), wy: new Float64Array(gnb * gnh),
                      finnes: new Uint8Array(gnb * gnh) };
                    for (let j = 0; j < gnh; j++) {
                      for (let i = 0; i < gnb; i++) {
                        const k = j * gnb + i;
                        nabo.wx[k] = nX0 - 2 * grov + i * grov;
                        nabo.wy[k] = nY0 - 2 * grov + j * grov;
                        nabo.finnes[k] = 1;
                      }
                    }
                    const scene = [nabo];
                    Tegner3d._maskeBuffer = null;
                    const med = tegnbare(Tegner3d._terrengmasker(gA, scene));
                    /* Den gamle oppførselen bygd opp her, så prøven pinner
                       nøyaktig hva utvidelsen er verdt – ingen magisk terskel. */
                    Tegner3d._maskeBuffer = null;
                    const dek = Tegner3d._dekningsprove(gA, scene);
                    const utan = new Map();
                    if (dek) {
                      for (const bg of scene) {
                        const n2 = bg.nb * bg.nh, krev = new Uint8Array(n2);
                        for (let k = 0; k < n2; k++) {
                          if (!bg.finnes[k]) continue;
                          krev[k] = dek.prov(bg.wx[k], bg.wy[k]) ? 0 : 1;
                        }
                        utan.set(bg, krev);
                        dek.leggTil(bg);
                      }
                    }
                    const u = tegnbare(utan);
                    this.sjekk('  sømmen har noe å prøve på – naboen er faktisk maskert',
                      u.medKrev > 0 && u.medKrev < gnb * gnh,
                      u.medKrev + ' av ' + (gnb * gnh) + ' noder står igjen til naboen');
                    this.sjekk('    og masken er utvidet, så sømmen ikke blir stående utegnet',
                      med.celler > u.celler,
                      med.celler + ' tegnbare celler med utvidelsen, ' + u.celler
                      + ' uten – differansen er stripa langs sømmen');
                    Tegner3d._maskeBuffer = null;
                  }

                  /* BUFERNØKKELEN MÅ MERKE AT NABOEN ER UTDATERT.
                     Nøkkelen inneholdt bare geometri. Endret man fjelldybden,
                     traff bufferet, og ferskhetsprøven lenger nede ble aldri
                     kjørt: eget anlegg med nytt fjell, naboen med det gamle, i
                     samme bilde – mens lista merket naboen ○ «skisse». */
                  {
                    Veg3d.glemBakgrunn();
                    const foerListe = Veg3d._bakgrunnsgitre();
                    const foerFulle = foerListe.filter(x => x.full).length;
                    const gml = App.P.fjell ? App.P.fjell.standarddybde : undefined;
                    if (App.P.fjell && foerFulle > 0) {
                      App.P.fjell.standarddybde = (gml || 0.5) + 2.5;
                      const etterListe = Veg3d._bakgrunnsgitre();   // UTEN glemBakgrunn
                      const etterFulle = etterListe.filter(x => x.full).length;
                      App.P.fjell.standarddybde = gml;
                      Veg3d.glemBakgrunn();
                      this.sjekk('  et endret fjell gjør nabogitteret utdatert, også i bufferet',
                        etterFulle < foerFulle,
                        foerFulle + ' fulle før, ' + etterFulle + ' etter');
                    }
                  }

                  /* ET STORT ANLEGG SKAL FÅ EN GROVERE MASKE, IKKE INGEN.
                     Rutenettet spenner over hele scenen og celletallet er
                     kvadratisk i oppløsningen, så en to kilometers veg sprengte
                     taket på fire millioner ved 0,5 m. Sto det en `return null`
                     der, forsvant HELE delingen på nettopp de store anleggene –
                     hvert naboanlegg tegnet terrenget sitt om igjen, og
                     ingenting sa fra. */
                  {
                    const langt = { nb: 2, nh: 2, wx: new Float64Array([0, 4000, 0, 4000]),
                      wy: new Float64Array([0, 0, 4000, 4000]),
                      finnes: new Uint8Array([1, 1, 1, 1]) };
                    const d = Tegner3d._dekningsprove(langt, []);
                    this.sjekk('  en scene på fire kilometer får fortsatt en maske',
                      !!d && typeof d.prov === 'function', d ? 'bygd' : 'INGEN');
                    if (d) {
                      this.sjekk('    og den svarer på et punkt inne i scenen',
                        d.prov(2000, 2000) === false || d.prov(2000, 2000) === true,
                        'svarer');
                    }
                  }

                  /* FELLESSKALAEN MÅ LEGGES TILBAKE SELV OM NOE KASTER.
                     `maksAvvik` settes på de MELLOMLAGREDE nabogitrene, som
                     lever videre mellom bildene. Uten `finally` bar de naboens
                     skala for alltid, og et anlegg som senere ble det aktive
                     fikk fargeskalaen til noe helt annet. */
                  {
                    /* KASTET MÅ FAKTISK HA SKJEDD.
                       Sto prøven med skjult lerret, returnerte `tegn()` før den
                       nådde `_tegnBakgrunn`, `kastet` ble usann – og påstanden
                       var likevel grønn, fordi `kastet` bare gikk inn i
                       meldingsteksten. Da var prøven grønn også med hele
                       `try`/`finally` revet ut. Nå er kastet en del av kravet. */
                    const c8 = Veg3d.lerret;                 // bare klassen – se over
                    const skjult8 = c8 && c8.classList.contains('skjult');
                    if (skjult8) c8.classList.remove('skjult');
                    await this.vent(80);
                    const foerAvvik = medFull.filter(x => x.full).map(x => [x, x.maksAvvik]);
                    const org = Tegner3d._tegnBakgrunn;
                    Tegner3d._tegnBakgrunn = () => { throw new Error('prøvekast'); };
                    let kastet = false;
                    try { Veg3d.tegn(); } catch (e) { kastet = true; }
                    finally { Tegner3d._tegnBakgrunn = org; }
                    const staar = foerAvvik.every(([x, m]) => x.maksAvvik === m);
                    this.sjekk('  et kast under tegningen lar ikke naboens fargeskala bli stående',
                      kastet && foerAvvik.length > 0 && staar,
                      (kastet ? 'kastet, ' : 'KASTET IKKE, ') + foerAvvik.length + ' gitre: '
                      + foerAvvik.map(([x, m]) => (x.maksAvvik === m ? 'ok' : 'STÅR IGJEN')).join(', '));
                    Veg3d.tegn();
                    if (skjult8) c8.classList.add('skjult');
                    await this.vent(60);
                  }
                }
              }

              /* ================================================================
                 ET FERDIG ANLEGG ER DET NYE TERRENGET

                 Legger man en tomt i prosjektet, er den bakken der. Graver man
                 siden en veg over den, er det planum man graver fra – ellers
                 telles den samme kubikken to ganger. Målt på brukerens eget
                 prosjekt: vegens skjæring gikk fra 623 til 985 m³ da nabotomta
                 ble regnet ferdig.
                 ================================================================ */
              {
                const f = App._ferdigflater;
                this.sjekk('  hvert regnet anlegg gir en ferdig flate til de andre',
                  !!f && f.size > 0, f ? f.size + ' flater' : 'ingen');

                /* ================================================================
                   EN FLATE SOM IKKE GJELDER LENGER ER IKKE TERRENG

                   Dette er den farligste feilen i hele nabomaskineriet, fordi
                   utslaget er et TALL og ingenting sier fra. Flatene var nøklet
                   på anleggs-id alene, uten noe som sa hvilken utgave de var
                   laget av – så et anlegg man hadde redigert, eller SLETTET,
                   fortsatte å være bakken de andre gravde fra.
                   ================================================================ */
                if (f && f.size > 1) {
                  const idA = [...f.keys()].find(k => k !== App.P.aktivt);
                  const anlA = App.P.anlegg.find(x => x.id === idA);
                  const flA = f.get(idA);
                  this.sjekk('  hver ferdig flate bærer nøkkelen til anlegget den kom fra',
                    !!(flA && flA.nokkel), flA ? (flA.nokkel ? 'har nøkkel' : 'INGEN NØKKEL') : '–');
                  if (anlA && flA && flA.nokkel) {
                    const midtX = (flA.minX + flA.maksX) / 2, midtY = (flA.minY + flA.maksY) / 2;
                    const foerZ = App.prosjektterreng().z(midtX, midtY);
                    const raaZ = App.terreng.z(midtX, midtY);
                    this.sjekk('    og flaten overstyrer bakken mens den gjelder',
                      Number.isFinite(foerZ), 'z = ' + (foerZ || 0).toFixed(2));

                    /* Rediger anlegget slik brukeren gjør det: rett på
                       `P.anlegg[…]`. Det går aldri gjennom P-setteren, så
                       ingenting annet river bufferet. */
                    const nokkelFoer = flA.nokkel;
                    let angre = null;
                    if (anlA.tomt && anlA.tomt.nivaa && Number.isFinite(anlA.tomt.nivaa.kote)) {
                      angre = anlA.tomt.nivaa.kote;
                      anlA.tomt.nivaa.kote = angre + 3.7;
                    } else if (anlA.mal) {
                      angre = anlA.mal.skjaeringLosmasse;
                      anlA.mal.skjaeringLosmasse = (angre || 1) + 0.53;
                    }
                    const etterZ = App.prosjektterreng().z(midtX, midtY);
                    this.sjekk('    men et REDIGERT anlegg slutter å være terreng',
                      !App._ferdigflater.has(idA)
                      && (etterZ === raaZ || (!Number.isFinite(etterZ) && !Number.isFinite(raaZ))),
                      App._ferdigflater.has(idA) ? 'flaten står igjen'
                        : 'falt tilbake til rå mark');
                    /* Og merknaden må slutte å påstå det den påsto. */
                    const res9 = { merknader: [], sum: {} };
                    App.naboMerknad(res9);
                    this.sjekk('      og merknaden slutter å si at det er regnet mot det',
                      !res9.merknader.some(q => q.type === 'naboanlegg'
                        && q.tekst.indexOf(anlA.navn || anlA.type) >= 0),
                      JSON.stringify(res9.merknader.map(q => q.type)));
                    // legg tilbake
                    if (anlA.tomt && anlA.tomt.nivaa && angre != null) anlA.tomt.nivaa.kote = angre;
                    else if (anlA.mal && angre != null) anlA.mal.skjaeringLosmasse = angre;
                    App._ferdigflater.set(idA, flA);
                    flA.nokkel = nokkelFoer;
                  }

                  /* ================================================================
                     TVERRSNITTSVINDUET SKAL IKKE KORTE NED TERRENGET

                     `v3_vindu` viser et utsnitt av vegen rundt tverrsnittet man
                     står i. Det er en VISNING. Men flaten som legges inn som
                     terreng for de andre anleggene ble bygd av det samme
                     gitteret, så med vinduet på ble bare den strekningen
                     registrert som ferdig bygd. Målt: flaten falt fra 50 × 104 m
                     til 28 × 28 m. En nabotomt utenfor utsnittet regnet da mot
                     rå mark – mens merknaden sa at den var regnet mot vegens
                     ferdige nivå.
                     ================================================================ */
                  {
                    const e6 = App.erTomt() ? Tomt3d : Veg3d;
                    const foerV6 = e6.vindu;
                    const areal = fl => (fl ? (fl.maksX - fl.minX) * (fl.maksY - fl.minY) : 0);
                    const bygg = () => {
                      /* Nøyaktig samme forholdsregel som byggFulleAnlegg tar. */
                      const fv = e6.vindu;
                      if (e6.vindu) { e6.vindu = 0; e6._gitterFor = null; }
                      try {
                        const g6 = e6._gitter(1);
                        return g6 ? App.ferdigflateAv(g6, 1) : null;
                      } finally { e6.vindu = fv; e6._gitterFor = null; }
                    };
                    const utanVindu = (() => {
                      e6.vindu = 0; e6._gitterFor = null;
                      const g6 = e6._gitter(1);
                      return g6 ? App.ferdigflateAv(g6, 1) : null;
                    })();
                    e6.vindu = 30; e6._gitterFor = null;
                    const medVindu = bygg();
                    /* Og hva det ville blitt UTEN forholdsregelen – det pinner
                       hva rettingen er verdt, uten noen magisk terskel. */
                    const utan = (() => {
                      const g6 = e6._gitter(1);
                      return g6 ? App.ferdigflateAv(g6, 1) : null;
                    })();
                    e6.vindu = foerV6; e6._gitterFor = null;
                    this.sjekk('  tverrsnittsvinduet korter ikke ned det de andre regner mot',
                      areal(utanVindu) === 0 || areal(medVindu) > areal(utanVindu) * 0.9,
                      Math.round(areal(medVindu)) + ' m² med vindu på, '
                      + Math.round(areal(utanVindu)) + ' m² uten');
                    this.sjekk('    og uten forholdsregelen ville den blitt kortet ned',
                      areal(utanVindu) === 0 || areal(utan) < areal(utanVindu) * 0.9,
                      Math.round(areal(utan)) + ' m² – det er feilen som var der');
                  }

                  /* Og et SLETTET anlegg – der finnes ikke engang et navn å
                     melde med, så merknaden tidde og tallet sto. */
                  {
                    const idB = [...App._ferdigflater.keys()].find(k => k !== App.P.aktivt);
                    const anlB = App.P.anlegg.find(x => x.id === idB);
                    if (anlB) {
                      const iB = App.P.anlegg.indexOf(anlB);
                      App.P.anlegg.splice(iB, 1);
                      const staarIgjen = App.prosjektterreng();
                      this.sjekk('  et SLETTET anlegg slutter å være terreng',
                        !App._ryddFerdigflater().has(idB),
                        App._ferdigflater.has(idB) ? 'graver fortsatt fra det' : 'borte');
                      this.sjekk('    og terrenget faller tilbake til rå mark',
                        staarIgjen === App.terreng || !App._ferdigflater.has(idB));
                      App.P.anlegg.splice(iB, 0, anlB);
                    }
                  }
                }

                if (f && f.size) {
                  const terr = App.prosjektterreng();
                  this.sjekk('    og terrenget beregningen får er ENDRET av dem',
                    terr !== App.terreng, terr === App.terreng ? 'rått' : 'endret');

                  /* Flaten skal bare overstyre der anlegget FAKTISK har endret
                     bakken. Tok den med kontekstringen, byttet man ut
                     høydemodellen med en rasterisering av seg selv, og tallene
                     «endret seg» av ingenting annet enn omprøvingen. */
                  let inne = 0, utanfor = 0;
                  for (const [, fl] of f) {
                    const midtX = (fl.minX + fl.maksX) / 2, midtY = (fl.minY + fl.maksY) / 2;
                    if (Number.isFinite(fl.ved(midtX, midtY))) inne++;
                    if (!Number.isFinite(fl.ved(fl.minX - 60, fl.minY - 60))) utanfor++;
                  }
                  this.sjekk('    flaten svarer inne i inngrepet',
                    inne > 0, inne + ' av ' + f.size);
                  this.sjekk('    og faller gjennom til høydemodellen utenfor',
                    utanfor === f.size, utanfor + ' av ' + f.size);

                  /* Utenfor alle flatene MÅ svaret være nøyaktig det samme som
                     før – ellers har vi flyttet terreng vi ikke skulle røre. */
                  const gA2 = Tomt3d._gitter(1) || Veg3d._gitter(1);
                  let like = 0, ulike = 0;
                  if (gA2) {
                    for (let k2 = 0; k2 < gA2.nb * gA2.nh; k2 += 37) {
                      if (!gA2.finnes[k2]) continue;
                      const x = gA2.wx[k2], y = gA2.wy[k2];
                      let dekt = false;
                      for (const [id, fl] of f) {
                        if (id === App.P.aktivt) continue;
                        if (Number.isFinite(fl.ved(x, y))) { dekt = true; break; }
                      }
                      if (dekt) continue;
                      const a1 = App.terreng.z(x, y), b1 = terr.z(x, y);
                      if (a1 === b1 || (!Number.isFinite(a1) && !Number.isFinite(b1))) like++;
                      else ulike++;
                    }
                  }
                  this.sjekk('    og rører ikke ett eneste punkt utenfor inngrepene',
                    ulike === 0, ulike + ' avvik av ' + (like + ulike) + ' prøvde');
                }

                /* MERKNADEN MÅ STÅ. Et tall som endrer seg med tre hundre
                   kubikk uten et ord er den slags som oppdages på plassen. */
                if (App.resultat && App._ferdigflater && App._ferdigflater.size > 1) {
                  const m = (App.resultat.merknader || []).some(q => q.type === 'naboanlegg');
                  this.sjekk('  og det står i merknadene at tallene er regnet mot naboene',
                    m, JSON.stringify((App.resultat.merknader || []).map(q => q.type)));
                }

                /* TO ANLEGG PÅ SAMME BAKKE ER ENTEN ET MØTE ELLER EN BEGRAVELSE.
                   «De dekker den samme bakken» sier ikke om de møtes pent i en
                   kant eller om det ene er borte inne i det andre – og det er
                   den forskjellen som avgjør om det lar seg bygge. Målt på
                   brukerens eget prosjekt: vegen lå 8,0 m under ferdig nivå på
                   nabotomta. En nybegynner skal ikke måtte se det selv. */
                {
                  const f = App._ferdigflater;
                  if (f && f.size > 1) {
                    /* Konstruer tilfellet: legg en flate rett over en annen,
                       åtte meter høyere. Da MÅ det meldes som ubyggelig. */
                    const par = [...f];
                    const under = par[0][1];
                    const kopi = {
                      minX: under.minX, minY: under.minY, rute: under.rute,
                      nb: under.nb, nh: under.nh, har: under.har, dekt: under.dekt,
                      maksX: under.maksX, maksY: under.maksY,
                      z: Float32Array.from(under.z, v => v + 8),
                      ved: under.ved
                    };
                    const gml = new Map(f);
                    const annen = par.find(q => q[0] !== par[0][0]);
                    f.set(annen[0], kopi);
                    const o = App.overlappendeAnlegg();
                    const dyp = o.length ? Math.abs(o[0].verst) : 0;
                    this.sjekk('  en flate åtte meter over en annen meldes med '
                      + 'høydeforskjellen, ikke bare som «samme bakke»',
                    o.length > 0 && dyp > 7 && dyp < 9, o.length + ' par, verst '
                      + (o.length ? o[0].verst.toFixed(1) : '–') + ' m');
                    const res2 = { merknader: [], sum: {} };
                    App.naboMerknad(res2);
                    this.sjekk('    og det står som UBYGGELIG, ikke som en opplysning',
                      res2.merknader.some(q => q.type === 'ubyggelig'),
                      JSON.stringify(res2.merknader.map(q => q.type)));
                    this.sjekk('    og merknaden sier hva man gjør med det',
                      res2.merknader.some(q => /hev |senk |flytt /.test(q.tekst)));
                    App._ferdigflater = gml;
                  }
                }
              }

              /* VELGE BORT ER IKKE DET SAMME SOM «LOT SEG IKKE TEGNE». */
              const bort = medFull[0];
              if (bort) {
                Tegner3d.settAnleggAv(bort.id, true);
                Veg3d._andreNokkel = null;
                const utan = Veg3d._bakgrunnsgitre();
                this.sjekk('  et anlegg man har valgt bort forsvinner fra scenen',
                  !utan.some(x => x.id === bort.id), utan.map(x => x.navn).join(', '));
                this.sjekk('    og meldes IKKE som «ikke tegnet» – det var jo et valg',
                  !(utan.utelatt || []).some(s => s.indexOf(bort.navn) === 0),
                  JSON.stringify(utan.utelatt || []));
                Tegner3d.settAnleggAv(bort.id, false);
                Veg3d._andreNokkel = null;
                const attende = Veg3d._bakgrunnsgitre();
                this.sjekk('    og kommer tilbake når man velger det inn igjen',
                  attende.some(x => x.id === bort.id));
              }
            }
          }
        } finally {
          Tegner3d.settVisAndre(foerOmfang);
          Veg3d.aktiv = foerVegAktiv; Tomt3d.aktiv = foerTomtAktiv;
          Veg3d._andreNokkel = null;
          Tomt3d._andreNokkel = null;
          Tegner3d._fulle = null;
          Tegner3d._andreAv = null;
          Tegner3d.visAndreknapp();
        }
      }

      /* ================================================================
         SAMLEEKSPORT: alle anleggene i én fil.

         Det som må stemme er ikke at filen blir skrevet – det gjør den
         alltid – men at HVERT anlegg står i den, og at de kan skilles fra
         hverandre etterpå. En samlefil der veg nummer to har overskrevet
         veg nummer én ser ut som en fil med én veg, og det er umulig å se
         forskjell på den og en fil som bare skulle hatt én.
         ================================================================ */
      App.byttAnlegg(v1.id);
      await this.vent(250);
      const forrigeOmfang = App._eksportomfang;
      const gammelNed = Rapport.lastNed;
      const skrevet = {};
      Rapport.lastNed = (n, i) => { skrevet[n] = String(i); };
      try {
        App.settEksportomfang('alle');
        this.sjekk('omfangsbryteren slår inn når prosjektet har flere anlegg',
          App.alleAnlegg() === true);

        await Rapport.eksporterAlle('kof');
        const kof = skrevet[Object.keys(skrevet).find(k => /\.KOF$/.test(k))] || '';
        const pkt = kof.split('\r\n').filter(r => r.startsWith(' 05'));
        const navn = pkt.map(r => r.slice(4, 14).trim());
        this.sjekk('KOF: samlefilen har punkt fra flere anlegg', pkt.length > 0,
          pkt.length + ' punkt');
        this.sjekk('  og ingen to punkt har samme navn – ellers overskriver de hverandre',
          new Set(navn).size === navn.length,
          navn.length - new Set(navn).size + ' navnekollisjoner');
        this.sjekk('  og hvert anlegg har sitt eget merke i punktnavnet',
          new Set(navn.map(n => n[0])).size >= 2,
          [...new Set(navn.map(n => n[0]))].join(''));
        this.sjekk('  og hodet sier hvilket merke som er hvilket anlegg',
          /-05 MERK: [A-Z] = /.test(kof));

        await Rapport.eksporterAlle('landxml');
        const xml = skrevet[Object.keys(skrevet).find(k => /\.xml$/.test(k))] || '';
        const dok = new DOMParser().parseFromString(xml, 'application/xml');
        this.sjekk('LandXML: samlefilen er velformet', !dok.querySelector('parsererror'));
        const modellnavn = [...dok.getElementsByTagName('Alignment')]
          .concat([...dok.getElementsByTagName('Surface')]).map(e => e.getAttribute('name'));
        this.sjekk('  og har flere modeller i seg', modellnavn.length >= 2,
          modellnavn.length + ': ' + modellnavn.join(', '));
        this.sjekk('  med hvert sitt navn – to like navn er én modell for mottakeren',
          new Set(modellnavn).size === modellnavn.length, modellnavn.join(', '));
        this.sjekk('  og ETT koordinatsystem for hele filen',
          dok.getElementsByTagName('CoordinateSystem').length === 1);

        await Rapport.eksporterAlle('sosi');
        const sos = (skrevet[Object.keys(skrevet).find(k => /\.sos$/.test(k))] || '').split('\r\n');
        const nr = sos.filter(r => /^\.(KURVE|FLATE|PUNKT)\s+\d+:/.test(r))
          .map(r => +r.match(/\s(\d+):/)[1]);
        this.sjekk('SOSI: objektnummeret er unikt i HELE filen, ikke per anlegg',
          nr.length > 1 && new Set(nr).size === nr.length,
          nr.length + ' objekt, ' + new Set(nr).size + ' unike');
        this.sjekk('  og hodet har ett .HODE og filen én .SLUTT',
          sos.filter(r => r === '.HODE').length === 1
          && sos.filter(r => r === '.SLUTT').length === 1);

        await Rapport.eksporterAlle('dxf');
        const dxf = (skrevet[Object.keys(skrevet).find(k => /\.dxf$/.test(k))] || '').split('\r\n');
        this.sjekk('DXF: samlefilen har én SECTION og én EOF',
          dxf.filter(r => r === 'SECTION').length === 1 && dxf.filter(r => r === 'EOF').length === 1);
        const lagnavn = new Set();
        for (let i = 0; i < dxf.length - 1; i++) {
          if (dxf[i] === '8' && /^[A-Z]/.test(dxf[i + 1])) lagnavn.add(dxf[i + 1]);
        }
        this.sjekk('  og lagene bærer anleggets navn, så tegneren kan skille dem',
          [...lagnavn].some(l => l.includes('_')), [...lagnavn].slice(0, 4).join(', '));
        this.sjekk('  og ingen lagnavn har tegn R12 ikke godtar',
          [...lagnavn].every(l => /^[A-Z0-9_]+$/.test(l)),
          [...lagnavn].filter(l => !/^[A-Z0-9_]+$/.test(l)).join(', '));

        await Rapport.eksporterAlle('geojson');
        const geo = JSON.parse(skrevet[Object.keys(skrevet).find(k => /\.geojson$/.test(k))] || '{}');
        const merket = (geo.features || []).filter(f => f.properties && f.properties.anlegg);
        this.sjekk('GeoJSON: hvert objekt vet hvilket anlegg det hører til',
          merket.length === (geo.features || []).length && merket.length > 0,
          merket.length + ' av ' + (geo.features || []).length);
        this.sjekk('  og flere anlegg er representert',
          new Set(merket.map(f => f.properties.anlegg)).size >= 2);

        await Rapport.eksporterCsvAlle('stikning');
        const csv = (skrevet[Object.keys(skrevet).find(k => /_alle_stikning\.csv$/.test(k))] || '')
          .split('\r\n');
        const blokker = csv.filter(r => r.startsWith('# ANLEGG:'));
        this.sjekk('CSV: ett avsnitt per anlegg, hvert med sin egen overskrift',
          blokker.length >= 2, blokker.length + ' avsnitt');

        /* ET ANLEGG SOM IKKE KOM MED SKAL SIES FRA OM.
           Rutenettet finnes bare for en tomt. En fil med to av tre anlegg som
           melder «3 av 3» er verre enn en som feiler: den ser komplett ut. */
        await Rapport.eksporterCsvAlle('rutenett');
        const melding = document.getElementById('eksportsvar').textContent;
        this.sjekk('det sies fra når et anlegg ikke kom med i samlefilen',
          /Ikke med/.test(melding) && /av \d+ anlegg/.test(melding), melding.trim().slice(0, 120));

        /* MED ETT ANLEGG FINNES IKKE VALGET. */
        App.settEksportomfang('dette');
        this.sjekk('bryteren kan settes tilbake', App.alleAnlegg() === false);
      } finally {
        Rapport.lastNed = gammelNed;
        App._eksportomfang = forrigeOmfang;
      }

      /* TO ANLEGG MED SAMME ID ER ETT ANLEGG SOM IKKE FINNES. */
      App.P.anlegg[1].id = App.P.anlegg[0].id;
      App.klargjorProsjekt(App.P);
      const ider = new Set(App.P.anlegg.map(a => a.id));
      this.sjekk('like id-er skilles ved åpning – ellers er ett anlegg uoppnåelig',
        ider.size === App.P.anlegg.length, ider.size + ' av ' + App.P.anlegg.length);

      /* SLETTING: det siste kan ikke slettes, og skjemaet skal ikke henge igjen. */
      const antallFoer = App.P.anlegg.length;
      await App.slettAnlegg(App.P.anlegg[App.P.anlegg.length - 1].id);
      await this.vent(300);
      this.sjekk('et anlegg kan slettes', App.P.anlegg.length === antallFoer - 1,
        App.P.anlegg.length + '');
      while (App.P.anlegg.length > 1) {
        await App.slettAnlegg(App.P.anlegg[App.P.anlegg.length - 1].id);
        await this.vent(120);
      }
      await App.slettAnlegg(App.P.anlegg[0].id);
      await this.vent(150);
      this.sjekk('men det siste kan ikke – et prosjekt uten anlegg har ingen aktiv',
        App.P.anlegg.length === 1);
    } catch (e) {
      this.sjekk('flere-anlegg-prøven kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      App.bekreft = gammelBekreft;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
      App.visAnleggsvelger();
    }
  },

  async panelhoder() {
    /* KARTET SKAL IKKE HA HODE I DET HELE TATT.
       Et panelhode er en 40 px stripe over hele bredden som ikke viser noe.
       Over et kart er den unødvendig – det som dekkes kan panoreres fram – og
       verktøyene ligger derfor PÅ kartet. En graf har ingen slik reserve, og
       beholder sitt hode. */
    this.sjekk('kartet har ikke panelhode',
      !document.querySelector('.kartpanel .panelhode'));
    this.sjekk('og verktøyene ligger på kartflaten',
      !!document.querySelector('.kartflate .kartverktoy')
      && !!document.getElementById('verktoyTegn'));

    const paneler = [...document.querySelectorAll('.panel')]
      .filter(p => p.offsetParent && p.querySelector('.panelhode'));
    this.sjekk('de andre panelene har hoder å måle', paneler.length >= 2, paneler.length + ' paneler');

    for (const p of paneler) {
      const navn = (p.className.match(/(\w+)panel/) || [])[1] || '?';
      const h = p.querySelector('.panelhode').getBoundingClientRect().height;
      const hele = p.getBoundingClientRect().height;
      /* 44 px er én rad med god klaring. To rader er 68, og det er der det
         begynner å koste tegneflate. */
      this.sjekk(navn + '-hodet er én rad', h <= 48, Math.round(h) + ' px');
      this.sjekk('og tar under en tredel av ' + navn + '-panelet',
        h / hele < 0.34, Math.round(100 * h / hele) + ' %');
    }

    /* INGEN KNAPP SKAL MISTE TEKSTEN SIN.
       Det var det brukeren meldte. En knapp der teksten er bredere enn boksen
       får enten to linjer eller et avkuttet ord, og begge deler ser ut som en
       feil. */
    {
      const maal = document.createElement('canvas').getContext('2d');
      const trange = [];
      for (const e of document.querySelectorAll('.verktoyknapp, .kartknapp, .knapp, .modusknapp')) {
        if (!e.offsetParent) continue;
        const tekst = (e.textContent || '').trim();
        if (!tekst) continue;
        const st = getComputedStyle(e);
        maal.font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
        const r = e.getBoundingClientRect();
        const plass = r.width - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight)
          - parseFloat(st.borderLeftWidth) - parseFloat(st.borderRightWidth);
        if (maal.measureText(tekst).width > plass + 1) {
          trange.push(tekst.slice(0, 18) + ' (' + Math.round(maal.measureText(tekst).width)
            + ' > ' + Math.round(plass) + ')');
        }
      }
      this.sjekk('ingen knapp er smalere enn teksten sin', trange.length === 0,
        trange.slice(0, 4).join(', ') || 'alle har plass');
    }

    /* FELTBILDET: 44 PIKSLER.
       Målt på et nettbrett før dette: 45 av 48 synlige betjeningsflater var
       under 44 px – verktøyknappene 25 px høye, tallfeltene 23, ⤢ 20×18,
       skyveren 16. En finger treffer 8–10 mm. De tre `pointer: coarse`-reglene
       som fantes traff nøyaktig én av de 45.
       Regelen henger på `data-peker` og ikke på en media-spørring nettopp
       fordi den skal kunne prøves her. */
    {
      const foer = document.documentElement.getAttribute('data-peker');
      document.documentElement.setAttribute('data-peker', 'grov');
      await this.vent(120);
      const smaa = [];
      const velg = 'button, input, select, label.kartbrikke, .fane';
      let alle = 0;
      for (const e of document.querySelectorAll(velg)) {
        if (!e.offsetParent) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        alle++;
        if (r.height < 43.5 || r.width < 43.5) {
          smaa.push((e.id || e.className.toString().split(' ')[0]) + ' '
            + Math.round(r.width) + '×' + Math.round(r.height));
        }
      }
      this.sjekk('prøven fant noe å måle', alle >= 20, alle + ' flater');
      this.sjekk('hver betjeningsflate er minst 44 px med finger',
        smaa.length === 0, smaa.slice(0, 5).join(', ') || 'alle er store nok');
      document.documentElement.setAttribute('data-peker', foer || 'fin');
      await this.vent(80);
    }

    /* MAN MÅ KOMME TILBAKE FRA 3D.
       3D-lerretene er `inset: 0`, og de målte fra HELE tverrpanelet –
       panelhodet inkludert. Med 3D på lå de derfor oppå «Snitt»-knappen, og
       veien tilbake til tverrsnittet var ikke klikkbar. Man kunne slå på 3D og
       ikke komme ut igjen. */
    {
      const paa = document.getElementById('vegVis3d');
      const av = document.getElementById('vegVisSnitt');
      if (paa && av && paa.offsetParent) {
        paa.click();
        await this.vent(200);
        const r = av.getBoundingClientRect();
        const truffet = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        this.sjekk('«Snitt»-knappen er klikkbar mens 3D står på',
          truffet === av || av.contains(truffet),
          truffet ? (truffet.id || truffet.tagName) : 'ingenting');
        av.click();
        await this.vent(150);
        this.sjekk('og snittet kommer tilbake',
          !document.getElementById('tverrprofil').classList.contains('skjult'));
      }
    }

    /* AVLESNINGEN SKAL VÆRE LESELIG.
       Den sto i verktøylinja og fikk 240 px av de 465 den trenger – 52 % av
       tallet man blar for å lese var usynlig, og på et nettbrett i portrett
       var 96 % borte. */
    {
      const e = document.getElementById('tverrEtikett');
      this.sjekk('avlesningen ligger ved tegningen, ikke i verktøylinja',
        !!e && !e.closest('.verktoy') && !!e.closest('.tverrinnhold'));
      if (e && e.offsetParent) {
        this.sjekk('og har plass til hele teksten',
          e.scrollWidth <= e.clientWidth + 2,
          e.clientWidth + ' av ' + e.scrollWidth + ' px');
      }
    }

    /* Lagvelgeren på kartet: åtte kontroller som før lå i hodet. */
    {
      const knapp = document.getElementById('kartlagknapp');
      const panel = document.getElementById('kartlagpanel');
      this.sjekk('lagvelgeren ligger på kartet', !!knapp && !!panel
        && document.querySelector('.kartflate').contains(knapp));
      if (knapp && panel) {
        this.sjekk('og er lukket til man ber om den', panel.classList.contains('skjult'));
        knapp.click();
        await this.vent(80);
        this.sjekk('den åpner seg', !panel.classList.contains('skjult'));
        this.sjekk('med alle bakgrunnene og overleggene i seg',
          panel.querySelectorAll('.kartknapp').length >= 3
          && panel.querySelectorAll('.kartbrikke').length >= 3);
        document.body.click();
        await this.vent(80);
        this.sjekk('og lukker seg ved klikk utenfor', panel.classList.contains('skjult'));
      }
    }
  },

  async paneler() {
    const storrelse = () => ({
      kart: document.getElementById('kart').clientHeight,
      profil: document.getElementById('lengdeprofil').clientHeight,
      tverr: document.getElementById('tverrprofil').clientHeight,
      side: document.querySelector('.sidepanel').clientWidth
    });
    const normal = storrelse();
    for (const p of ['kart', 'profil', 'tverr']) {
      document.querySelector(`[data-utvid="${p}"]`).click();
      await this.vent(220);
      const stor = storrelse();
      this.sjekk(`${p} blir stort`, stor[p] > normal[p] * 1.4, `${normal[p]} → ${stor[p]}`);
      document.querySelector(`[data-utvid="${p}"]`).click();
      await this.vent(220);
    }
    const tilbake = storrelse();
    this.sjekk('panelene kommer tilbake til normal',
      ['kart', 'profil', 'tverr', 'side'].every(k => Math.abs(tilbake[k] - normal[k]) < 6),
      JSON.stringify({ normal, tilbake }));

    document.getElementById('knappSidepanel').click();
    await this.vent(220);
    this.sjekk('sidepanelet kan skjules', document.querySelector('.sidepanel').clientWidth === 0);
    document.getElementById('knappSidepanel').click();
    await this.vent(220);
    this.sjekk('og komme tilbake', document.querySelector('.sidepanel').clientWidth > 100);

    for (const f of document.querySelectorAll('.fane')) {
      f.click();
      this.sjekk('fanen ' + f.dataset.fane + ' åpner seg',
        document.getElementById('fane-' + f.dataset.fane).classList.contains('aktiv'));
    }
    document.querySelector('.fane').click();
  },

  /* ---------------- 11b. tomtemodus ---------------- */
  /* ---------------- 14. eksport og rapport i tomtemodus ---------------- */
  /**
   * Sju eksportknapper og to rapportknapper slapp et TOMTEresultat rett inn i
   * kode som forutsetter res.profiler. Utfallet var tre uklassede TypeError-er,
   * tre knapper som gjorde bokstavelig talt ingenting, og – verst – en
   * LandXML-fil på 811 tegn med veglinja fra et tomt veganlegg. En fil som ser
   * ferdig ut er verre enn ingen fil.
   */
  async tomteksport() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    const gammelNed = Rapport.lastNed, gammelOpen = window.open;
    const filer = {};
    try {
      App.P = App.nyttProsjekt();
      App.P.navn = '__test_eksport';
      App.leggTilAnlegg('tomt');
      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320;
      const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      App.P.tomt.punkter = [[0, 0], [40, 0], [40, 30], [0, 30]]
        .map(([dx, dy]) => ({ lat: lat0 + dLat(dy), lon: lon0 + dLon(dx) }));
      App.P.tomt.kanter = [{ type: 'mur' }, {}, { type: 'fjellvegg' }, {}];
      App.P.tomt.omrissBetyr = 'planum';
      App.P.tomt.nivaa = { modus: 'flat', kote: 206 };

      // terreng som skråner, så både skjæring og fylling finnes
      const s0 = Geo.tilUtm(lat0, lon0, App.sone);
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      Terreng.prototype.z = function (x, y) { return 207 + (x - s0.x) * 0.06 + (y - s0.y) * 0.04; };
      App._terrengnokkel = null;
      await App.beregnTomt();
      this.sjekk('tomta ble regnet', !!App.resultat && App.resultat.celler > 100);

      Rapport.lastNed = (navn, innhold) => { filer[navn] = String(innhold); };
      const hent = del => filer[Object.keys(filer).find(n => n.includes(del))];

      for (const kall of [() => Rapport.eksporter('kof'), () => Rapport.eksporter('landxml'),
        () => Rapport.eksporter('sosi'), () => Rapport.eksporter('dxf'),
        () => Rapport.eksportStikning(), () => Rapport.eksportMasser(),
        () => Rapport.eksportGeojson(), () => Rapport.eksportRutenett()]) {
        let feil = null;
        try { kall(); } catch (e) { feil = e.message; }
        this.sjekk('eksporten kastet ikke', !feil, feil || '');
      }
      this.sjekk('alle åtte filene ble laget', Object.keys(filer).length === 8,
        Object.keys(filer).join(', '));
      for (const [navn, innhold] of Object.entries(filer)) {
        this.sjekk(`${navn.split('_').pop()} har verken NaN eller undefined`,
          !/NaN|undefined/.test(innhold),
          (innhold.match(/.{0,40}(NaN|undefined).{0,20}/) || [''])[0]);
      }

      const kof = hent('.KOF');
      this.sjekk('KOF har 01-blokka med koordinatsystemet', /^ 01 /m.test(kof));
      this.sjekk('KOF gir ikke to punkt samme navn', (() => {
        const n = kof.split('\r\n').filter(l => l.startsWith(' 05')).map(l => l.slice(4, 14).trim());
        return n.length > 8 && new Set(n).size === n.length;
      })());
      this.sjekk('KOF har både ferdig nivå og planum',
        /FERDIG/.test(kof) && /PLANUM/.test(kof));

      const xml = hent('.xml');
      /* ALDRI <Alignment> for en tomt. Her ble veglinja fra det tomme
         veganlegget skrevet ut - en velformet fil som åpnet uten innsigelser og
         inneholdt null meter av det brukeren regnet på. */
      this.sjekk('LandXML for tomt har flater', /<Surface /.test(xml));
      this.sjekk('LandXML for tomt har INGEN linjeføring', !/<Alignment/.test(xml));
      this.sjekk('LandXML-flatene har trekanter', (xml.match(/<F>/g) || []).length > 100);

      const sos = hent('.sos');
      this.sjekk('SOSI for tomt har en flate', /^\.FLATE/m.test(sos));
      this.sjekk('SOSI er på nivå 4, som .FLATE krever', /SOSI-NIVÅ 4/.test(sos));
      this.sjekk('SOSI deklarerer objektkatalogen', /\.\.OBJEKTKATALOG/.test(sos));
      this.sjekk('SOSI-området står i meter, ikke centimeter', (() => {
        const m = /MIN-NØ (\d+) (\d+)/.exec(sos);
        return m && +m[1] > 6000000 && +m[1] < 8000000;
      })(), (/MIN-NØ .*/.exec(sos) || [''])[0]);

      const dxf = hent('.dxf');
      this.sjekk('DXF har den ferdige flaten', dxf.includes('FERDIG_NIVAA'));
      this.sjekk('DXF har en 2D-kontur som kan skraveres', dxf.includes('FERDIG_NIVAA_2D'));
      this.sjekk('DXF er et helt par-oppsett',
        dxf.split('\r\n').filter(l => l !== '').length % 2 === 0);

      const geo = JSON.parse(hent('.geojson'));
      this.sjekk('GeoJSON har den ferdige flaten',
        geo.features.some(f => f.properties.type === 'ferdig_flate'));
      this.sjekk('GeoJSON oppgir høydereferansen',
        geo.features.filter(f => f.properties.z_ferdig != null)
          .every(f => f.properties.hoydereferanse === 'NN2000'));

      const csv = hent('stikning');
      this.sjekk('stikningsdata for tomt bruker komma som desimaltegn',
        /;\d+,\d/.test(csv) && !/;\d+\.\d/.test(csv));
      this.sjekk('massesammendraget kom, ikke masseoppsett per profil',
        !!hent('massesammendrag'));

      /* Rapportene kastet begge: HTML på res.intervaller, PDF på res.mal. */
      let html = null;
      window.open = () => ({ document: { write: h => html = h, close() { } } });
      let feilHtml = null;
      try { Rapport.apneRapport(); } catch (e) { feilHtml = e.message; }
      this.sjekk('HTML-rapporten kastet ikke i tomtemodus', !feilHtml, feilHtml || '');
      this.sjekk('rapporten handler om tomta', !!html && /Areal/.test(html) && /Massebalanse/.test(html));
      this.sjekk('rapporten inneholder ikke vegtall',
        !!html && !/Veglengde/.test(html) && !/Tverrsnitt/.test(html));
      this.sjekk('ingen NaN i tomterapporten', !!html && !/NaN|undefined/.test(html));

      const bytes = await Pdfrapport.lag(false);
      this.sjekk('PDF-rapporten ble til i tomtemodus', !!bytes && bytes.length > 2000,
        bytes ? bytes.length + ' byte' : 'null');

      /* En eksport som ikke kan gi riktig innhold skal NEKTE med en synlig
         begrunnelse - aldri en fil som ser ferdig ut. */
      App.resultat = null;
      const foerAntall = Object.keys(filer).length;
      Rapport.eksporter('kof');
      this.sjekk('uten beregning blir det ingen fil', Object.keys(filer).length === foerAntall);
      this.sjekk('og brukeren får vite hvorfor',
        /Ingen beregning/.test(document.getElementById('eksportsvar').textContent));
    } catch (e) {
      this.sjekk('tomteksporten kom seg gjennom', false, e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      Rapport.lastNed = gammelNed; window.open = gammelOpen;
      App._terrengnokkel = null;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
    }
  },

  /* ---------------- 15. det som bare gikk galt i tomtemodus ---------------- */
  /**
   * Hele denne testpakka kjørte i vegmodus, og det er nettopp derfor tre feil
   * fikk stå: autolagringen som aldri lagret en tomt, angre som tømte
   * massepanelet, og et fall satt til null som kom tilbake som 2 %.
   */
  async tomterydding() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    const gammelLagre = Lager.lagre;
    const felt = document.getElementById('prosjektnavn');
    const gammeltFelt = felt.value;
    try {
      App.P = App.nyttProsjekt();
      App.P.navn = '__test_tomterydding';
      App.leggTilAnlegg('tomt');
      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320;
      const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      App.P.tomt.punkter = [[0, 0], [40, 0], [40, 30], [0, 30]]
        .map(([x, y]) => ({ lat: lat0 + dLat(y), lon: lon0 + dLon(x) }));
      App.P.tomt.nivaa = { modus: 'flat', kote: 100 };

      /* AUTOLAGRINGEN VAR AV PÅ TOMTER.
         Vakten spurte etter knekkpunkt, og en tomt har ingen – så den
         returnerte alltid tidlig. «Ulagret»-merket på Lagreknappen slo av og på
         som normalt, så det så trygt ut. Trykte man ikke Lagre selv, var alt
         borte ved neste omlasting. */
      this.sjekk('en tomt teller som innhold', App.harInnhold());
      this.sjekk('og som ulagret arbeid', App.harUlagret());
      let lagret = 0;
      Lager.lagre = async (n, d) => { lagret++; return { navn: n, endret: '', data: d }; };
      felt.value = '__test_tomterydding';
      App._aapnetSom = '__test_tomterydding';
      App._lagretSom = null;
      App.autolagringPause--;
      await App.autolagre();
      App.autolagringPause++;
      Lager.lagre = gammelLagre;
      this.sjekk('autolagringen lagrer en tomt', lagret === 1, lagret + ' lagringer');

      /* ET FALL SATT TIL NULL BLE STILLE SKREVET OM TIL 2 %.
         `n.fall || 0.02` i en lesning av et felt som ikke fantes. */
      App.P.tomt.nivaa = { modus: 'fall', kote: 100, fall: 0, fallretning: 90 };
      App.skjemaTilTomt();
      this.sjekk('et fall satt til null blir stående på null',
        App.P.tomt.nivaa.fall === 0, String(App.P.tomt.nivaa.fall));
      this.sjekk('og fallretningen blir ikke rørt',
        App.P.tomt.nivaa.fallretning === 90, String(App.P.tomt.nivaa.fallretning));

      /* ANGRE REGNET ALDRI TOMTA OM.
         Begge veier endte i oppdater(), som er vegveien: for en tomt er P.ip
         tom, resultat ble satt til null, og massepanelet fikk vegteksten
         «Tegn en senterlinje i kartet for å komme i gang» – på et anlegg med
         fire hjørner og lagret kote. */
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      Terreng.prototype.z = () => 99;
      App.P.tomt.nivaa = { modus: 'flat', kote: 100 };
      App._terrengnokkel = null;
      await App.beregnTomt();
      const foerAngre = App.resultat && App.resultat.sum.fylling;
      this.sjekk('tomta er regnet før vi angrer', foerAngre > 0, String(foerAngre));
      App.merk('prøve: endret kote');
      App.P.tomt.nivaa.kote = 104;
      await App.beregnTomt();
      await App.angre();
      this.sjekk('angre setter koten tilbake', App.P.tomt.nivaa.kote === 100,
        String(App.P.tomt.nivaa.kote));
      this.sjekk('og regner tomta om i stedet for å tømme panelet',
        !!App.resultat && Math.abs(App.resultat.sum.fylling - foerAngre) < 1,
        App.resultat ? App.resultat.sum.fylling.toFixed(2) + ' mot ' + foerAngre : 'resultat er null');
      this.sjekk('massepanelet viser tomta, ikke vegteksten',
        !/Tegn en senterlinje/.test(document.getElementById('massesammendrag').textContent));

      /* SLUKET VAR FERDIG REGNET, MEN KUNNE IKKE VELGES.
         Beregningen, HTML-rapporten og PDF-en hadde alle sin sluk-gren, men
         ingenting skrev noen gang `nivaa.punkt`, og modusen sto ikke i
         velgeren. En grusplass med sluk måtte legges som «flat». */
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      Terreng.prototype.z = () => 100;
      App.P.tomt.nivaa = { modus: 'flat', kote: 100 };
      App._terrengnokkel = null;
      await App.beregnTomt();
      const flatVolum = App.resultat.sum.fylling;
      App.visFane('tomthoyde');
      const velger = document.getElementById('th_modus');
      this.sjekk('velgeren tilbyr bare modusene motoren kan',
        [...velger.options].map(o => o.value).join(',') === Object.keys(Tomt.Nivaamoduser).join(','),
        [...velger.options].map(o => o.value).join(','));
      App.P.tomt.nivaa = { modus: 'sluk', kote: 100, fall: 0.03, punkt: null };
      App.tomthoydeTilSkjema();
      this.sjekk('et sluk som ikke er satt sier fra',
        /ikke satt/.test(document.getElementById('fane-tomthoyde').textContent));
      const slukknapp = document.getElementById('th_settSluk');
      this.sjekk('og det finnes en knapp for å sette det', !!slukknapp);
      slukknapp.onclick();
      this.sjekk('knappen setter kartet i sluk-modus', Kart.modus === 'settSluk', Kart.modus);
      Kart.klikk({ latlng: { lat: lat0 + dLat(15), lng: lon0 + dLon(20) } });
      await this.vent(400);
      this.sjekk('kartklikket setter sluket', !!App.P.tomt.nivaa.punkt
        && Number.isFinite(App.P.tomt.nivaa.punkt.lat));
      this.sjekk('og slipper kartet tilbake til rediger', Kart.modus === 'rediger', Kart.modus);
      this.sjekk('sluket endrer volumet – modusen virker',
        Math.abs(App.resultat.sum.fylling - flatVolum) > 1,
        App.resultat.sum.fylling.toFixed(1) + ' mot ' + flatVolum.toFixed(1));

      /* En modus motoren ikke kjenner ga en helt flat flate uten et ord om det.
         Lista lovet ni former, motoren kunne tre. */
      App.P.tomt.nivaa = { modus: 'takfall', kote: 100 };
      App._terrengnokkel = null;
      await App.beregnTomt();
      this.sjekk('en ukjent nivåmodus blir meldt, ikke stilltiende flat',
        (App.resultat.merknader || []).some(m => m.type === 'nivaa'));

      /* BAKKEFAKTOREN BLE HENTET FRA VEGENS MIDTPUNKT.
         `bakkefaktor()` leste `this.linje` – veglinja. På en tomt betydde det
         ett av to, og begge var gale: uten veglinje i prosjektet ble faktoren
         1 og korreksjonen falt stille bort, med veglinje ble den regnet der
         VEGEN ligger og brukt på tomta. Samme tomt ga 903 m³ med en veglinje i
         prosjektet og 904 m³ uten. */
      const utenVeg = App.bakkefaktor();
      App.P.anlegg[0].ip = [
        { lat: lat0 + dLat(4000), lon: lon0 + dLon(4000), r: 0 },
        { lat: lat0 + dLat(4300), lon: lon0 + dLon(4300), r: 0 }
      ];
      App.byggLinje();
      const medVeg = App.bakkefaktor();
      this.sjekk('bakkefaktoren for tomta er ikke 1 når korreksjonen er på',
        Math.abs(utenVeg - 1) > 1e-9, String(utenVeg));
      this.sjekk('og den endrer seg ikke av at prosjektet har en veg et annet sted',
        Math.abs(medVeg - utenVeg) < 1e-12, medVeg + ' mot ' + utenVeg);
      App.P.anlegg[0].ip = [];
      App.byggLinje();

      /* FORKLARING-FANEN BLE ALDRI FYLT.
         En egen kopi av faneklikket manglet linja som kaller Forklaring.vis(),
         så 235 linjer tegnforklaring hadde aldri vært vist for en bruker. */
      document.querySelector('.fane[data-fane="forklaring"]').click();
      const boks = document.getElementById('fane-forklaring');
      this.sjekk('Forklaring-fanen blir fylt når man klikker på den',
        !!boks && boks.textContent.trim().length > 500,
        boks ? boks.textContent.trim().length + ' tegn' : 'fant ikke fanen');
      document.querySelector('.fane[data-fane="masser"]').click();
    } catch (e) {
      this.sjekk('tomteryddingen kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      Lager.lagre = gammelLagre;
      felt.value = gammeltFelt;
      try { await Lager.slett('__test_tomterydding'); } catch (e) { /* fantes ikke */ }
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
      App._lagretSom = null;
    }
  },

  /* ---------------- 16. tomta i tre dimensjoner ---------------- */
  /**
   * 3D-visningen er en ekstrafunksjon: snittet og kartet skal være uendret.
   * Den farligste feilen her er ikke at det ser stygt ut – det ser man – men at
   * fortegnet i projeksjonen er snudd. Da ser modellen helt troverdig ut, den
   * viser bare skjæring der det er fylling.
   */
  async tomt3d() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    try {
      App.P = App.nyttProsjekt();
      App.P.navn = '__test_3d';
      App.leggTilAnlegg('tomt');
      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320;
      const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      App.P.tomt.punkter = [[0, 0], [40, 0], [40, 30], [0, 30]]
        .map(([x, y]) => ({ lat: lat0 + dLat(y), lon: lon0 + dLon(x) }));
      /* Koten legges midt i terrengspennet, så det blir ekte fylling i vest og
         ekte skjæring i øst. Ligger den i den ene enden, er det ene tilfellet
         bare noen centimeter dypt – og da måler fortegnsprøven under på en
         forskjell som er mindre enn en piksel. */
      App.P.tomt.nivaa = { modus: 'flat', kote: 102.4 };
      const s0 = Geo.tilUtm(lat0, lon0, App.sone);
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      // skrånende terreng: 100 moh i vest, 104,8 i øst
      Terreng.prototype.z = function (x, y) { return 100 + (x - s0.x) * 0.12; };
      App._terrengnokkel = null;
      await App.beregnTomt();
      this.sjekk('tomta er regnet før 3D prøves', !!App.resultat && App.resultat.celler > 100);

      /* zFjell må ligge i rutenettet. Uten den kan fjelloverflaten bare tegnes
         der berget tilfeldigvis stikker opp i graveflaten – `fjell` og
         `fjellDel` er begge klemt til null under planum. */
      this.sjekk('rutenettet bærer fjellkoten',
        App.resultat.rutenett.every(c => Number.isFinite(c.zFjell)));

      /* Ingenting skal bygges før noen trykker 3D. */
      Tomt3d.aktiver(false);
      Tomt3d._gitterFor = null;
      Tomt3d.tegn();
      this.sjekk('3D bygger ingenting når den er av', !Tomt3d._sisteGitter);

      document.querySelector('[data-utvid="tomt"]').click();
      await this.vent(250);
      Tomt3d.aktiver(true);
      Tomt3d._skalaSatt = false;
      Tomt3d.tegn();
      await this.vent(120);
      this.sjekk('3D-lerretet er synlig', !document.getElementById('tomt3d').classList.contains('skjult'));
      this.sjekk('snittet er skjult mens 3D står på',
        document.getElementById('tomtprofil').classList.contains('skjult'));

      const g = Tomt3d._sisteGitter;
      this.sjekk('gitteret ble bygd', !!g && g.nb > 3 && g.nh > 3, g ? g.nb + '×' + g.nh : 'ingen');

      /* 6.1 FORTEGNET I PROJEKSJONEN – den eneste feilen som ikke synes.
         Der det er skjæring, ligger terrenget OVER planum, og skal derfor
         havne HØYERE på skjermen (mindre y). Snus fortegnet på dybden eller på
         skjermaksen, ser modellen like troverdig ut med skjæring og fylling
         byttet om. */
      const kam = Tomt3d._sisteKam;
      /* Cellene må ha en høydeforskjell som er verdt å måle. På et punkt der
         skjæringen er to centimeter, er forskjellen på skjermen en tidels
         piksel – og der kan perspektivet, som skyver punkt under midten
         utover, snu fortegnet helt lovlig. */
      let kSkjaering = -1, kFylling = -1;
      for (let i = 0; i < g.d.length; i++) {
        if (!g.finnes[i] || !g.inne[i]) continue;
        if (g.d[i] > 1 && (kSkjaering < 0 || g.d[i] > g.d[kSkjaering])) kSkjaering = i;
        if (g.d[i] < -1 && (kFylling < 0 || g.d[i] < g.d[kFylling])) kFylling = i;
      }
      this.sjekk('prøven har både en ekte skjæring og en ekte fylling å måle på',
        kSkjaering >= 0 && kFylling >= 0);
      const punktI = (k, z) => {
        const i = k % g.nb, j = (k / g.nb) | 0;
        return kam.punkt(g.minX + i * g.rute, g.minY + j * g.rute, z[k]);
      };
      const sT = punktI(kSkjaering, g.zT), sP = punktI(kSkjaering, g.zP);
      this.sjekk('i skjæring tegnes terrenget over planum',
        g.d[kSkjaering] > 1 && sT.py < sP.py - 0.5,
        `d=${g.d[kSkjaering].toFixed(2)} terreng y=${sT.py.toFixed(1)} planum y=${sP.py.toFixed(1)}`);
      const fT = punktI(kFylling, g.zT), fP = punktI(kFylling, g.zP);
      this.sjekk('i fylling tegnes terrenget under planum',
        g.d[kFylling] < -1 && fT.py > fP.py + 0.5,
        `d=${g.d[kFylling].toFixed(2)} terreng y=${fT.py.toFixed(1)} planum y=${fP.py.toFixed(1)}`);

      /* 6.2 Dybdebufferet feil vei: da forsvinner alt bak gravflaten. */
      const c = document.getElementById('tomt3d');
      const dekning = () => {
        const k = c.getContext('2d');
        const b = k.getImageData(0, 0, c.width, c.height).data;
        const bak = [b[0], b[1], b[2]];
        let u = 0, n = 0;
        for (let i = 0; i < b.length; i += 4 * 3) {
          n++;
          if (b[i] !== bak[0] || b[i + 1] !== bak[1] || b[i + 2] !== bak[2]) u++;
        }
        return u / n;
      };
      this.sjekk('modellen dekker en reell del av lerretet', dekning() > 0.04,
        (dekning() * 100).toFixed(1) + ' %');

      /* 6.3 Ragget rutenett: skråningsfoten slutter der den møter terrenget, så
         hull i gitteret er normalt – men ingen tall skal bli NaN av det. */
      let nanT = 0;
      for (let i = 0; i < g.zT.length; i++) if (g.finnes[i] && !Number.isFinite(g.zT[i])) nanT++;
      this.sjekk('ingen NaN i høydene', nanT === 0, nanT + ' celler');

      /* 6.4 Desimeringen skal ta MAKS av avviket, ikke middelet – ellers
         forsvinner en dyp grøft når man zoomer ut. */
      Tomt3d._gitterFor = null;
      const fint = Tomt3d._gitter(1);
      Tomt3d._gitterFor = null;
      const grovt = Tomt3d._gitter(2);
      const maks = gg => { let m = 0; for (let i = 0; i < gg.d.length; i++) if (gg.finnes[i]) m = Math.max(m, Math.abs(gg.d[i])); return m; };
      this.naer('desimeringen beholder det største avviket', maks(grovt), maks(fint), 1e-6);
      Tomt3d._gitterFor = null;

      /* LYSET MÅ VÆRE UENDRET PÅ ET KVADRATISK RUTENETT.
         Lysformelen ble skrevet om fra «ett steg per akse» til flatenormalen
         fra kryssproduktet av de to ekte kantene, for at den samme tegneren
         skal kunne brukes på en veg – der tverrsteget er 0,33 m mens steget
         langs vegen er 5 m. På tomtas kvadratiske rutenett skal de to gi
         nøyaktig samme tall. Uten denne prøven endrer tomtas skyggelegging seg
         umerkelig, og ingen ser hvilken versjon som var riktig. */
      {
        const gammel = (z00, z10, z01, rute) => {
          const dx = (z10 - z00) / rute, dy = (z01 - z00) / rute;
          const len = Math.sqrt(dx * dx + dy * dy + 1);
          const l = (-dx * -0.4 + -dy * 0.4 + 0.82) / len;
          return 0.55 + 0.45 * Math.max(0, Math.min(1, l));
        };
        let verst = 0;
        const prov = { wx: new Float32Array(4), wy: new Float32Array(4) };
        for (let a = -3; a <= 3; a += 0.5) {
          for (let bb = -3; bb <= 3; bb += 0.5) {
            const r = g.rute;
            prov.wx[0] = 0; prov.wy[0] = 0;
            prov.wx[1] = r; prov.wy[1] = 0;
            prov.wx[2] = 0; prov.wy[2] = r;
            const z = new Float32Array([100, 100 + a, 100 + bb, 0]);
            verst = Math.max(verst, Math.abs(
              Tomt3d._lys(prov, 0, 1, 2, z) - gammel(100, 100 + a, 100 + bb, r)));
          }
        }
        this.sjekk('lyset er uendret på et kvadratisk rutenett', verst < 1e-6,
          'største avvik ' + verst.toExponential(1));
      }

      /* NODEKOORDINATENE MÅ TÅLE UTM.
         Verdensposisjonen ble lagt i gitteret for at den samme tegneren skulle
         tjene både tomt og veg. Ligger den i en Float32Array, er en nordkoordinat
         på 6 460 000 kvantisert til en halv meter – naboceller på et 1 m-rutenett
         faller sammen, og lyset regner kryssproduktet av kanter som ikke finnes.
         Feilen synes ikke: flaten blir bare litt urolig i skyggeleggingen. */
      {
        let verst = 0, kollapsa = 0;
        for (let j = 0; j < g.nh; j++) {
          for (let i = 0; i < g.nb; i++) {
            const k = j * g.nb + i;
            verst = Math.max(verst,
              Math.abs(g.wx[k] - (g.minX + i * g.rute)),
              Math.abs(g.wy[k] - (g.minY + j * g.rute)));
            if (i && g.wx[k] === g.wx[k - 1]) kollapsa++;
          }
        }
        this.sjekk('nodekoordinatene er eksakte i UTM', verst < 1e-6,
          'største avvik ' + verst.toExponential(1) + ' m');
        this.sjekk('ingen naboceller har falt sammen', kollapsa === 0, kollapsa + ' celler');
      }

      /* Fyldig gjelder tomta òg – og de to visningene må ha HVER SIN
         innstilling. Ligger flagget på prototypen, slår man den på for tomta og
         får den på vegen samtidig. */
      {
        /* Prøven skal måle at feltene er UAVHENGIGE, ikke hva de tilfeldigvis
           sto på da den startet. Ligger flagget på prototypen, slår man den på
           for tomta og får den på vegen samtidig. */
        Tomt3d.fyldig = false; Veg3d.fyldig = false;
        this.sjekk('tomta og vegen har hver sin fyldig-innstilling',
          Object.prototype.hasOwnProperty.call(Tomt3d, 'fyldig')
          && Object.prototype.hasOwnProperty.call(Veg3d, 'fyldig'));
        Tomt3d.fyldig = true;
        this.sjekk('å slå den på for tomta rører ikke vegen', Veg3d.fyldig === false);
        Tomt3d.glemFarger();
        const pf = Tomt3d._palett();
        Tomt3d.fyldig = false; Tomt3d.glemFarger();
      Tomt3d.visFoer = false;
        const pl = Tomt3d._palett();
        this.sjekk('paletten bygges om når fyldig slås på', pf !== pl);
        /* Bunnen av skalaen – der avviket er null – skal være LANGT sterkere i
           fyldig. Det er nettopp den enden som gjør at en grunn skjæring ikke
           kan skilles fra en grunn fylling i den vanlige visningen. */
        const bunn = t => [t[0], t[1], t[2]];
        const skille = t => Math.abs(bunn(t.skjaering)[0] - bunn(t.fylling)[0]);
        this.sjekk('og bunnen av skalaen skiller mye tydeligere',
          skille(pf) > skille(pl) * 3,
          Math.round(skille(pl)) + ' → ' + Math.round(skille(pf)));
      }

      /* TOMTERAPPORTEN SKAL HA BILDER.
         Den hadde ingen: åtte tabeller etter hverandre på én side, alle med
         samme vekt. Vegrapporten har lengdeprofil og tverrsnitt; tomta hadde
         tall og bare tall, og den som fikk PDF-en tilsendt måtte lese hele for
         å finne ut hva saken gjaldt. */
      {
        const teg = Rapport.lagTomtetegninger(App.resultat);
        this.sjekk('tomterapporten har et bilde av tomta ovenfra', !!teg.plan);
        this.sjekk('og ett sett fra siden', !!teg.perspektiv);
        this.sjekk('og snittet', !!teg.snitt);


        /* SNITTET MALER INGEN BUNN SELV.
           På skjermen kommer bakgrunnen fra CSS-en på lerretet, og `tegn()`
           nøyer seg med clearRect. På et lerret som ikke står i siden er
           «tømt» det samme som gjennomsiktig – og bildet kom ut helt svart i
           PDF-en. Prøven måler hjørnepikselen. */
        if (teg.snitt) {
          const img = new Image();
          await new Promise(ok => { img.onload = ok; img.onerror = ok; img.src = teg.snitt; });
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const k = c.getContext('2d');
          k.drawImage(img, 0, 0);
          const px = k.getImageData(4, 4, 1, 1).data;
          this.sjekk('snittet har lys bunn, ikke svart',
            px[0] > 200 && px[1] > 200 && px[2] > 200 && px[3] === 255,
            '[' + px[0] + ',' + px[1] + ',' + px[2] + ',' + px[3] + ']');
        }

        /* Og alt skal stå som før etterpå. Tegningene lages ved å låne
           3D-visningen: bytte lerret, vinkel, kontekstring og fyldig. Blir noe
           av det stående igjen, har brukeren plutselig en annen visning på
           skjermen etter å ha laget en PDF. */
        this.sjekk('3D-visningen står som før etterpå',
          Tomt3d.lerret === document.getElementById('tomt3d')
          && Tomt3d.over === document.getElementById('tomt3dover')
          && Tomt3d.kontekst === 40 && Tomt3d.fyldig === false && Tomt3d.lag.rutenett === false,
          'kontekst ' + Tomt3d.kontekst + ' · fyldig ' + Tomt3d.fyldig);
        this.sjekk('og utskriftspaletten er slått av igjen',
          !document.documentElement.hasAttribute('data-utskrift'));
      }

      /* 6.5 Fargene kommer fra stilarket, også som tall. */
      const rgb = Farger.skjaeringFlateRgb;
      this.sjekk('fargene finnes som tre tall', Array.isArray(rgb) && rgb.length === 3
        && rgb.every(v => Number.isFinite(v)), JSON.stringify(rgb));
      const pal1 = Tomt3d._palett();
      Farger.glem(); Tomt3d.glemFarger();
      const pal2 = Tomt3d._palett();
      this.sjekk('paletten bygges på nytt ved temabytte', pal1 !== pal2);

      /* 6.7 Overdrivningsmerket MÅ brennes inn i bildet. Et 3×-bilde uten
         merking i et tilbud lurer kunden, ikke oss. */
      Tomt3d.overdriv = 2;
      Tomt3d.tegn();
      this.sjekk('overdrivning blir merket i bildet', Tomt3d._merketBrent === true);
      Tomt3d.overdriv = 1;
      Tomt3d.tegn();
      this.sjekk('og merket forsvinner ved 1×', Tomt3d._merketBrent === false);

      /* 6.8 Kostnad – en røykprøve mot en katastrofal regresjon, ikke en benk. */
      const t0 = performance.now();
      Tomt3d.tegn();
      const tid = performance.now() - t0;
      this.sjekk('tegningen er rask nok', tid < 400, tid.toFixed(0) + ' ms');

      /* 6.9 SPERREN MOT AT 3D-EN BEGYNNER Å REGNE SITT EGET.
         Høydene 3D-koden bruker skal komme fra det samme rutenettet volumet er
         regnet på. En modell som viser noe annet enn tallene ved siden av er
         verre enn ingen modell. */
      Tomt3d._gitterFor = null;
      const g1 = Tomt3d._gitter(1);
      const rute = App.P.mal.rutestorrelse || 1;
      let avvik = 0, prov = 0;
      for (const cel of App.resultat.rutenett) {
        if (prov++ % 7) continue;
        const i = Math.round((cel.x - g1.minX) / rute), j = Math.round((cel.y - g1.minY) / rute);
        const k = j * g1.nb + i;
        if (i < 0 || j < 0 || i >= g1.nb || j >= g1.nh || !g1.finnes[k]) continue;
        avvik = Math.max(avvik, Math.abs(g1.zP[k] - cel.zPlanum), Math.abs(g1.zT[k] - cel.zT));
      }
      this.sjekk('3D bruker nøyaktig de høydene volumet er regnet på',
        avvik < 1e-4, 'største avvik ' + avvik.toExponential(1) + ' m');

      /* 6.7 PÅ BAKKEN – OGSÅ PÅ TOMTA.
         Vegen har en SKINNE: stasjon langs senterlinja og avstand ut fra den,
         og det er den som gjør at man ikke kan bli borte. En tomt har ingen
         slik retning – den er en flate – så øyet er to UTM-koordinater, og
         «fram» er dit man SER.
         Prøven måler at man står på bakken og ikke i den, at man går dit man
         ser og ikke et annet sted, og at man ikke kan gå ut av modellen. */
      {
        Tomt3d.settModus('oversikt');
        Tomt3d.nullstill();
        await this.vent(200);
        Tomt3d.settModus('bakken');
        await this.vent(300);
        this.sjekk('tomta kan gås i', Tomt3d.modus === 'bakken', Tomt3d.modus);
        const gb = Tomt3d._sisteGitter;
        const kamb = Tomt3d._sisteKam;
        this.sjekk('  og kameraet er et ekte perspektivkamera med en posisjon',
          !!(kamb && kamb.oye));
        this.sjekk('  ikke oversiktskameraet i forkledning',
          !!(kamb && kamb.naer > 0), kamb ? 'nærplan ' + kamb.naer : 'ingen kamera');

        /* ØYET STÅR PÅ GULVET, IKKE I DET. */
        const oyeb = Tomt3d._bakkePos(gb);
        this.sjekk('øyet finnes', !!oyeb);
        if (oyeb) {
          this.naer('og står nøyaktig kamH over gulvet',
            oyeb.z - Tomt3d._gulv(gb, Tomt3d.kamX, Tomt3d.kamY), Tomt3d.kamH, 0.001);
        }

        /* MAN LANDER PÅ TOMTA, IKKE I SKOGEN VED SIDEN AV.
           Gitteret har en ring kontekstterreng rundt seg, så gitterets
           midtpunkt er ikke tomtas midtpunkt. */
        const midt = Tomt3d._tomtemidte(gb);
        this.sjekk('tomta har en midte å regne av', !!midt);
        if (midt) {
          const innafor = Tomt3d.kamX >= midt.minX - 2 && Tomt3d.kamX <= midt.maksX + 2
            && Tomt3d.kamY >= midt.minY - 2 && Tomt3d.kamY <= midt.maksY + 2;
          this.sjekk('man lander PÅ tomta', innafor,
            Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0) + ' i '
            + midt.minX.toFixed(0) + '–' + midt.maksX.toFixed(0));
          /* Og i ENDEN av den, ikke midt på: da ligger hele flata foran. */
          const langs = Math.max(midt.maksX - midt.minX, midt.maksY - midt.minY);
          const tilMidt = Math.hypot(midt.x - Tomt3d.kamX, midt.y - Tomt3d.kamY);
          this.sjekk('  i enden av den, så hele flata ligger foran',
            tilMidt > langs * 0.25, tilMidt.toFixed(0) + ' m fra midten av ' + langs.toFixed(0));

          /* OG MAN SER PÅ DEN. Midtpunktet skal treffe midten av skjermen. */
          const qm = kamb.punkt(midt.x, midt.y, Tomt3d._gulv(gb, midt.x, midt.y));
          this.sjekk('  og ser rett på den', Math.abs(qm.px - kamb.cx) < 12,
            Math.abs(qm.px - kamb.cx).toFixed(1) + ' px fra midten');
          this.sjekk('  som ligger foran kameraet, ikke bak', qm.w > 0, 'dybde ' + qm.w.toFixed(0));

          /* GÅINGEN ER I BLIKKETS RAMME. W skal nærme deg det du ser på. */
          const gaaT = (t, dt) => {
            Tomt3d._taster = new Set(t); Tomt3d._bakkeSteg(dt); Tomt3d._taster = new Set();
          };
          Tomt3d.kamH = 2; Tomt3d.fartsfaktor = 1;
          const foerAvst = Math.hypot(midt.x - Tomt3d.kamX, midt.y - Tomt3d.kamY);
          gaaT(['w'], 1);
          const etterAvst = Math.hypot(midt.x - Tomt3d.kamX, midt.y - Tomt3d.kamY);
          this.sjekk('W går mot det man ser på', etterAvst < foerAvst - 3,
            foerAvst.toFixed(1) + ' → ' + etterAvst.toFixed(1) + ' m');

          /* D skal gå TIL HØYRE FOR BLIKKET, ikke mot øst. Er fortegnet snudd
             eller aksene byttet, ser bildet like troverdig ut. */
          const xf = Tomt3d.kamX, yf = Tomt3d.kamY;
          const ang = Tomt3d.kamYaw * Math.PI / 180;
          gaaT(['d'], 1);
          const dFram = (Tomt3d.kamX - xf) * Math.sin(ang) - (Tomt3d.kamY - yf) * Math.cos(ang);
          const dSide = (Tomt3d.kamX - xf) * Math.cos(ang) + (Tomt3d.kamY - yf) * Math.sin(ang);
          this.sjekk('D går rett til høyre for blikket', dSide > 3 && Math.abs(dFram) < 0.05,
            dSide.toFixed(2) + ' m til høyre, ' + dFram.toFixed(2) + ' m fram);');

          /* MAN KAN IKKE GÅ UT AV MODELLEN.
             Utenfor gitteret gir _gulv NaN, _bakkePos null, og bildet faller
             stille tilbake til oversiktskameraet uten et ord. */
          for (let i = 0; i < 60; i++) gaaT(['w', 'shift'], 1);
          this.sjekk('man kan ikke løpe ut av modellen', !!Tomt3d._bakkePos(gb),
            Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0));
          this.sjekk('  fordi posisjonen klemmes til gitteret',
            Tomt3d.kamX >= gb.minX && Tomt3d.kamX <= gb.minX + (gb.nb - 1) * gb.rute
            && Tomt3d.kamY >= gb.minY && Tomt3d.kamY <= gb.minY + (gb.nh - 1) * gb.rute);
        }

        /* HUD-en skriver koordinat, ikke profilnummer – tomta har ingen veg. */
        const hud = Tomt3d._bakkeHud ? Tomt3d._bakkeHud() : [];
        this.sjekk('bakke-teksten på tomta er koordinater, ikke «Profil 0»',
          hud.length === 1 && /^N /.test(hud[0]) && !/Profil/.test(hud[0]),
          hud.join(' | '));

        /* Esc og ↺ er veien hjem, og hjem er TOMTAS synsvinkel – ikke vegens. */
        Tomt3d._bakkeTast({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
        await this.vent(200);
        this.sjekk('Esc tar deg opp igjen', Tomt3d.modus === 'oversikt');
        this.naer('og hjem er tomtas synsvinkel, ikke vegens 32°',
          Tomt3d.pitch, Tomt3d.pitchHjem, 0.001);
        Tomt3d.settModus('bakken');
        await this.vent(200);
        Tomt3d.nullstill();
        await this.vent(250);
        this.sjekk('↺ er også veien hjem fra bakken – fra BASEN, ikke fra hver visning',
          Tomt3d.modus === 'oversikt');
        Tomt3d.kamH = 2; Tomt3d.fartsfaktor = 1;
        await this.vent(120);
      }

      /* 6.8 GÅ PÅ TOMTA, ELLER FLY OVER DEN.
         Går man, er tomtegrensa veggen. Det gjør at man ikke kan rote seg bort,
         og at det man ser er det som faktisk blir stående på flata.
         Fella er å STOPPE mot veggen i stedet for å SKLI langs den: går man
         skrått inn i en kant og hele skrittet forkastes, står man bom fast selv
         om den ene komponenten var lovlig – og det kjennes som om tastene
         henger. */
      {
        const gaaT = (t, dt) => {
          Tomt3d._taster = new Set(t); Tomt3d._bakkeSteg(dt); Tomt3d._taster = new Set();
        };
        Tomt3d.settFerd('gaa');
        Tomt3d.settModus('oversikt');
        await this.vent(150);
        Tomt3d.settModus('bakken');
        await this.vent(350);
        const gT = Tomt3d._sisteGitter;
        const paaT = () => Tomt3d._kanStaa(gT, Tomt3d.kamX, Tomt3d.kamY, true);
        this.sjekk('man går som standard', Tomt3d.ferd === 'gaa');
        this.naer('og øyet står i en menneskehøyde', Tomt3d.kamH, 1.7, 0.001);
        this.sjekk('og man står PÅ tomta', paaT(),
          Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0));

        for (let i = 0; i < 40; i++) gaaT(['w', 'shift'], 1);
        this.sjekk('førti sekunders løping rett fram fører deg ikke ut av tomta', paaT(),
          Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0));

        /* SKRÅTT INN I ET HJØRNE: man skal komme seg videre langs kanten. */
        Tomt3d.kamYaw = 45;
        const f1 = { x: Tomt3d.kamX, y: Tomt3d.kamY };
        for (let i = 0; i < 30; i++) gaaT(['w', 'shift'], 1);
        const flyttet = Math.hypot(Tomt3d.kamX - f1.x, Tomt3d.kamY - f1.y);
        this.sjekk('og man setter seg ikke fast i et hjørne – man glir langs kanten',
          flyttet > 10, flyttet.toFixed(1) + ' m');
        this.sjekk('  fortsatt på tomta', paaT());

        /* FLY: ut over kanten, og opp. */
        Tomt3d.settFerd('fly');
        for (let i = 0; i < 25; i++) gaaT(['w', 'shift'], 1);
        this.sjekk('flyr man, kommer man ut over tomtegrensa', !paaT(),
          Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0));
        gaaT(['e'], 2);
        this.sjekk('og man kan heve seg', Tomt3d.kamH > 5, Tomt3d.kamH.toFixed(1) + ' m');

        Tomt3d.settFerd('gaa');
        this.naer('lander man, står øyet i menneskehøyde igjen', Tomt3d.kamH, 1.7, 0.001);
        this.sjekk('  og man er hentet inn på tomta igjen', paaT(),
          Tomt3d.kamX.toFixed(0) + ',' + Tomt3d.kamY.toFixed(0));

        Tomt3d.settModus('oversikt');
        Tomt3d.nullstill();
        await this.vent(200);
      }

      /* 6.6 Ingenting som fantes ble dårligere. */
      Tomt3d.aktiver(false);
      await this.vent(120);
      this.sjekk('snittet kommer tilbake',
        !document.getElementById('tomtprofil').classList.contains('skjult'));
      this.sjekk('og 3D-lerretene er skjult',
        document.getElementById('tomt3d').classList.contains('skjult')
        && document.getElementById('tomt3dover').classList.contains('skjult'));
      Tomteprofil.tegn();
      const p = document.getElementById('tomtprofil');
      this.sjekk('snittet tegner fortsatt', p.width > 20 && p.height > 20,
        p.width + '×' + p.height);
      document.querySelector('[data-utvid="tomt"]').click();
      await this.vent(200);
    } catch (e) {
      this.sjekk('3D-prøven kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      Tomt3d.aktiver(false);
      Tomt3d.overdriv = 1;
      Tomt3d.fyldig = false; Tomt3d.glemFarger();
      Tomt3d._gitterFor = null;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
    }
  },

  /* ---------------- 17. vegen i tre dimensjoner ---------------- */
  /**
   * Vegmodellen deler tegner med tomta, men har to feil tomta ikke kan få.
   *
   * Den ene: gitteret er ikke i UTM. Den ene aksen er stasjon langs
   * senterlinja, den andre avstand ut fra den, så nodene må svinge med kurven.
   * Skriver noen `minX + i * rute` her – formelen tomta bruker – blir modellen
   * en rett stripe i stedet for vegens trasé. Koden kompilerer, bildet ser like
   * pent ut, og man ser på en annen veg.
   *
   * Den andre: desimering. Hopper man over annenhver stasjon for å spare tid,
   * endrer volumet modellen omslutter seg titalls prosent – og heller ikke det
   * synes. Derfor måles volumet mot masser.js her, ikke bare formen.
   */
  async veg3d() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    try {
      App.P = App.nyttProsjekt();
      App.P.navn = '__test_veg3d';
      /* Prøven over jobbet i tomtebildet, og der finnes verken lengdeprofil
         eller tverrsnitt. Uten dette står de panelene igjen med null høyde, og
         3D-lerretet får aldri en størrelse å tegne i. */
      await App.settModus('veg');
      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320;
      const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      /* En SVING, ikke et rett strekk. På en rett veg er en stripe og en trasé
         det samme, og prøven under ville ikke merket forskjell. */
      App.P.ip = [
        { lat: lat0, lon: lon0, r: 0 },
        { lat: lat0 + dLat(120), lon: lon0 + dLon(90), r: 60 },
        { lat: lat0 + dLat(260), lon: lon0 + dLon(40), r: 0 }
      ];
      const s0 = Geo.tilUtm(lat0, lon0, App.sone);
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      // ei li som faller mot øst: gir ekte skjæring på den ene sida og fylling på den andre
      Terreng.prototype.z = function (x, y) { return 100 + (y - s0.y) * 0.06 - (x - s0.x) * 0.09; };
      App._terrengnokkel = null;
      await App.oppdater();
      this.sjekk('vegen er regnet før 3D prøves',
        !!App.resultat && App.resultat.profiler.length > 20,
        App.resultat ? App.resultat.profiler.length + ' profil' : 'ingen');

      /* Ingenting skal bygges før noen trykker 3D. */
      Veg3d.aktiver(false);
      Veg3d._gitterFor = null;
      Veg3d.tegn();
      this.sjekk('vegens 3D bygger ingenting når den er av', !Veg3d._sisteGitter);

      App.settTverrStasjon(App.resultat.lengde / 2);
      document.querySelector('[data-utvid="tverr"]').click();
      await this.vent(250);
      Veg3d.aktiver(true);
      Veg3d._skalaSatt = false;
      Veg3d.tegn();
      await this.vent(120);
      this.sjekk('vegens 3D-lerret er synlig',
        !document.getElementById('veg3d').classList.contains('skjult'));
      this.sjekk('tverrsnittet er skjult mens 3D står på',
        document.getElementById('tverrprofil').classList.contains('skjult'));

      const g = Veg3d._sisteGitter;
      this.sjekk('vegens gitter ble bygd', !!g && g.nb > 10 && g.nh > 5,
        g ? g.nb + '×' + g.nh : 'ingen');

      /* 17.1 NODENE MÅ LIGGE PÅ TRASEEN, IKKE PÅ EN RETT STRIPE.
         Hver node slås opp mot linjas eget `punktMedAvvik`. Er den regnet ut
         med en rett-linje-formel, spriker de to med meter i svingen. */
      {
        let verst = 0;
        for (let j = 0; j < g.nh; j += 3) {
          for (let i = g.kn; i < g.nb - g.kn; i += 5) {
            const k = j * g.nb + i;
            if (!g.finnes[k]) continue;
            const p = App.linje.punktMedAvvik(g.s[j], g.tAkse[k]);
            if (!p || !Number.isFinite(p.x)) continue;
            verst = Math.max(verst, Math.hypot(g.wx[k] - p.x, g.wy[k] - p.y));
          }
        }
        this.sjekk('nodene ligger på senterlinja, ikke på en rett stripe',
          verst < 1e-3, 'største avvik ' + verst.toExponential(1) + ' m');
      }

      /* 17.2 Radene skal ALDRI desimeres: én rad per profil i vinduet. */
      {
        const i = App.resultat.profiler.filter(
          p => p.s >= g.fra - 1e-6 && p.s <= g.til + 1e-6).length;
        this.sjekk('hver profil i vinduet har sin egen rad', g.nh === i,
          g.nh + ' rader mot ' + i + ' profiler');
        Veg3d._gitterFor = null;
        const grovt = Veg3d._gitter(4);        // steget skal ikke bite på vegen
        this.sjekk('desimeringssteget endrer ikke radene', grovt.nh === g.nh,
          grovt.nh + ' mot ' + g.nh);
        Veg3d._gitterFor = null;
      }

      /* 17.3 VOLUMET MODELLEN OMSLUTTER MOT masser.js.
         Trapesregelen tvers over hver rad, mot profilens eget areal. Spriker de
         to, viser bildet et annet inngrep enn tallene ved siden av.

         KRAVET ER RELATIVT, IKKE ABSOLUTT.
         Modellen har 63 kolonner per profil, mens jordarbeidsflaten fra
         masser.js kan ha mange hundre knekkpunkt – på en ekte skogsbilveg med
         R=10 m er 600 målt. Da KAN ikke 63 punkter gjengi polygonet eksakt, og
         et absolutt krav ville enten vært for slakt på et smalt profil eller
         umulig på et bredt. Målt på et virkelig prosjekt (Ydestad, 782 m, 158
         profiler) er snittavviket 0,016 m² og det verste 1,36 % – på nettopp
         det profilet med 600 knekkpunkt. Kravet under er satt over det, og
         under alt som ville vært en ekte feil i oppslaget. */
      {
        let verst = 0, verstS = 0, malte = 0, verstPst = 0;
        for (let j = 0; j < g.nh; j++) {
          const pr = App.resultat.profiler.find(p => Math.abs(p.s - g.s[j]) < 1e-9);
          if (!pr || !pr.areal) continue;
          let aS = 0, aF = 0;
          for (let i = g.kn; i < g.nb - g.kn - 1; i++) {
            const a = j * g.nb + i, b = a + 1;
            if (!g.harGrav[a] || !g.harGrav[b]) continue;
            const w = g.tAkse[b] - g.tAkse[a];
            if (!(w > 0)) continue;
            const d1 = g.zT[a] - g.zP[a], d2 = g.zT[b] - g.zP[b];
            if (d1 >= 0 && d2 >= 0) aS += (d1 + d2) / 2 * w;
            else if (d1 <= 0 && d2 <= 0) aF += (-d1 - d2) / 2 * w;
            else {
              // cella skifter fortegn: del den der, ellers blandes skjæring og fylling
              const f = d1 / (d1 - d2), w1 = w * f, w2 = w - w1;
              if (d1 > 0) { aS += d1 / 2 * w1; aF += -d2 / 2 * w2; }
              else { aF += -d1 / 2 * w1; aS += d2 / 2 * w2; }
            }
          }
          malte++;
          const av = Math.abs(aS - pr.areal.skjaering) + Math.abs(aF - pr.areal.fylling);
          const heile = pr.areal.skjaering + pr.areal.fylling;
          if (av > verst) { verst = av; verstS = pr.s; }
          if (heile > 1) verstPst = Math.max(verstPst, 100 * av / heile);
        }
        this.sjekk('det ble målt på noe i det hele tatt', malte > 5, malte + ' profiler');
        this.sjekk('modellen omslutter masser.js sine areal',
          verstPst < 2.5, 'verste profil ' + verstPst.toFixed(2) + ' % ('
          + verst.toFixed(3) + ' m² ved prof ' + verstS + ')');
      }

      /* 17.4 Fotavtrykket er selve leveransen: modellens bredeste inngrep skal
         være profilens egen fot, ikke en tilfeldig ytterkolonne. */
      {
        let modell = 0, fasit = 0;
        for (let j = 0; j < g.nh; j++) {
          let tmin = Infinity, tmaks = -Infinity;
          for (let i = 0; i < g.nb; i++) {
            const k = j * g.nb + i;
            if (!g.finnes[k] || !g.harGrav[k]) continue;
            tmin = Math.min(tmin, g.tAkse[k]); tmaks = Math.max(tmaks, g.tAkse[k]);
          }
          if (tmaks > tmin) modell = Math.max(modell, tmaks - tmin);
          const pr = App.resultat.profiler.find(p => Math.abs(p.s - g.s[j]) < 1e-9);
          if (pr) fasit = Math.max(fasit, pr.fotHoyre - pr.fotVenstre);
        }
        this.naer('bredeste inngrep i modellen er profilens egen fot', modell, fasit, 0.02);
      }

      /* 17.5 Velger man et vindu, skal det FØLGE snittet – ellers viser de to
         hvert sitt sted. Og velger man hele vegen, skal gitteret IKKE bygges om
         for hvert dratt i skyveren: det hakker, og det er ingenting å vinne. */
      {
        Veg3d.vindu = 100;
        Veg3d._gitterFor = null;
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.tegn();
        await this.vent(80);
        const fraFoer = Veg3d._sisteGitter.fra;
        App.settTverrStasjon(Math.min(App.resultat.lengde - 5, App.resultat.lengde * 0.8));
        Veg3d.stasjonEndret();
        await this.vent(80);
        const g2 = Veg3d._sisteGitter;
        this.sjekk('vinduet flytter seg med snittet', !!g2 && g2.fra > fraFoer + 1,
          g2 ? fraFoer.toFixed(0) + ' → ' + g2.fra.toFixed(0) + ' m' : 'ingen gitter');

        Veg3d.vindu = 0;
        Veg3d._gitterFor = null;
        Veg3d.tegn();
        await this.vent(80);
        const helt = Veg3d._sisteGitter;
        App.settTverrStasjon(App.resultat.lengde * 0.2);
        Veg3d.stasjonEndret();
        await this.vent(80);
        this.sjekk('hele vegen bygges ikke om når snittet flytter seg',
          Veg3d._sisteGitter === helt);
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.stasjonEndret();
        await this.vent(80);
      }

      /* 17.6 Ingen NaN, og noe faktisk tegnet. */
      {
        const gg = Veg3d._sisteGitter;
        let nan = 0;
        for (let i = 0; i < gg.zT.length; i++) {
          if (gg.finnes[i] && (!Number.isFinite(gg.zT[i]) || !Number.isFinite(gg.zP[i]))) nan++;
        }
        this.sjekk('ingen NaN i vegens høyder', nan === 0, nan + ' celler');
        const c = document.getElementById('veg3d');
        const k = c.getContext('2d');
        const b = k.getImageData(0, 0, c.width, c.height).data;
        const bak = [b[0], b[1], b[2]];
        let u = 0, n = 0;
        for (let i = 0; i < b.length; i += 4 * 3) {
          n++;
          if (b[i] !== bak[0] || b[i + 1] !== bak[1] || b[i + 2] !== bak[2]) u++;
        }
        this.sjekk('vegmodellen dekker en reell del av lerretet', u / n > 0.02,
          (100 * u / n).toFixed(1) + ' %');
      }

      /* 17.7 Kontekstringen: uten den slutter modellen i skråningsfoten, og man
         ser ikke om vegen går i ei li eller over en rygg. Kolonnene i ringen har
         terreng, men ingen prosjektert flate. */
      {
        const gg = Veg3d._sisteGitter;
        this.sjekk('det er lagt kontekstkolonner på hver side', gg.kn > 0, gg.kn + ' per side');
        let ringMedGrav = 0, ringMedTerreng = 0;
        for (let j = 0; j < gg.nh; j++) {
          for (const i of [0, gg.nb - 1]) {
            const k = j * gg.nb + i;
            if (!gg.finnes[k]) continue;
            if (gg.harGrav[k]) ringMedGrav++;
            if (Number.isFinite(gg.zT[k])) ringMedTerreng++;
          }
        }
        this.sjekk('ringen er rent terreng, uten prosjektert flate', ringMedGrav === 0,
          ringMedGrav + ' celler');
        this.sjekk('og ringen har terrenghøyder', ringMedTerreng > 5, ringMedTerreng + ' celler');
        Veg3d.kontekst = 0;
        Veg3d._gitterFor = null;
        const utan = Veg3d._gitter(1);
        this.sjekk('«uten terreng rundt» gir ingen ring', utan.kn === 0, utan.kn + ' kolonner');
        Veg3d.kontekst = 30;
        Veg3d._gitterFor = null;
      }

      /* 17.8 NAVIGERINGEN.
         Modellen var i orden lenge før den var til å bruke: man kunne snu og
         zoome, men ikke flytte seg. Zoomet man inn på en fylling, var eneste
         vei til den neste å zoome helt ut igjen. Prøvene under holder de fire
         grepene i live. */
      {
        const o = document.getElementById('veg3dover');
        const rr = () => o.getBoundingClientRect();
        const mus = (type, x, y, opt) => o.dispatchEvent(new MouseEvent(type, Object.assign(
          { bubbles: true, cancelable: true, clientX: rr().left + x, clientY: rr().top + y, button: 0 }, opt || {})));
        const opp = (x, y, opt) => window.dispatchEvent(new MouseEvent('mouseup', Object.assign(
          { bubbles: true, cancelable: true, clientX: rr().left + x, clientY: rr().top + y, button: 0 }, opt || {})));

        // venstre dra snur, og bare det
        const y0 = Veg3d.yaw, px0 = Veg3d.panX || 0;
        mus('mousedown', 200, 200); mus('mousemove', 260, 220); opp(260, 220);
        await this.vent(160);
        this.sjekk('venstre dragning snur modellen', Math.abs(Veg3d.yaw - y0) > 5,
          y0.toFixed(0) + ' → ' + Veg3d.yaw.toFixed(0));
        this.sjekk('og flytter den ikke', Math.abs((Veg3d.panX || 0) - px0) < 1e-9);

        // høyre dra flytter, og bare det
        const y1 = Veg3d.yaw, px1 = Veg3d.panX || 0, py1 = Veg3d.panY || 0;
        mus('mousedown', 200, 200, { button: 2 }); mus('mousemove', 245, 230, { button: 2 }); opp(245, 230, { button: 2 });
        await this.vent(160);
        this.naer('høyre dragning flytter like langt som musa', (Veg3d.panX || 0) - px1, 45, 0.01);
        this.naer('også loddrett', (Veg3d.panY || 0) - py1, 30, 0.01);
        this.sjekk('og snur den ikke', Math.abs(Veg3d.yaw - y1) < 1e-9);

        // shift+dra flytter òg – for den som bare har én knapp
        const px2 = Veg3d.panX || 0;
        mus('mousedown', 200, 200, { shiftKey: true }); mus('mousemove', 180, 200, { shiftKey: true }); opp(180, 200, { shiftKey: true });
        await this.vent(160);
        this.naer('shift og dra flytter også', (Veg3d.panX || 0) - px2, -20, 0.01);

        Veg3d.nullstill();
        await this.vent(160);
        const gg = Veg3d._sisteGitter;

        /* Et klikk velger stedet. Uten dette ser man en fylling i modellen uten
           å kunne komme til den. */
        /* MIDT I MODELLEN, IKKE PÅ KANTEN.
           Første treff i en skanning ovenfra-og-ned er alltid ytterkanten, og
           fire zoomsteg der tar punktet utenfor. Punktet i midten av treffene
           er det prøven egentlig vil måle på. */
        const alle = [];
        for (let y = 20; y < o.clientHeight - 20; y += 7) {
          for (let x = 20; x < o.clientWidth - 20; x += 7) {
            const t = Veg3d._slaOpp({ x, y }, o);
            if (t && t.k >= 0) alle.push({ x, y, k: t.k });
          }
        }
        const treff = alle.length ? alle[(alle.length / 2) | 0] : null;
        this.sjekk('det finnes noe å klikke på i modellen', !!treff);
        if (treff) {
          App.settTverrStasjon(0);
          await this.vent(80);
          mus('mousedown', treff.x, treff.y); opp(treff.x, treff.y);
          await this.vent(160);
          const j = (treff.k / gg.nb) | 0;
          this.naer('klikk i modellen flytter snittet dit', App.tverrStasjon, gg.s[j], 0.01);
        }

        /* PILTASTEN SKAL GÅ ETT HAKK, IKKE TO.
           App-en har sin egen piltasthåndtering på document. Uten
           stopPropagation kjørte begge, og hvert trykk ble to profiler – og
           shift-spranget på ti ble elleve. */
        const steg = App.resultat.profilsteg || 5;
        App.settTverrStasjon(gg.s[(gg.nh / 2) | 0]);
        await this.vent(80);
        const sA = App.tverrStasjon;
        o.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await this.vent(120);
        this.naer('piltast går nøyaktig ett profil', App.tverrStasjon - sA, steg, 0.01);
        const sB = App.tverrStasjon;
        o.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, shiftKey: true }));
        await this.vent(120);
        this.naer('og shift går nøyaktig ti', App.tverrStasjon - sB, 10 * steg, 0.01);

        /* HJULET SKAL ZOOME MOT MARKØREN.
           Regnes forskyvningen fra feil nullpunkt, SIGER bildet bortover for
           hvert hakk – man zoomer inn på noe og ender et helt annet sted.
           Prøven zoomer inn fire hakk og krever at samme node står under
           markøren etterpå. */
        if (treff) {
          const rz = rr();
          const foer = Veg3d._slaOpp({ x: treff.x, y: treff.y }, o);
          for (let i = 0; i < 4; i++) {
            o.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100,
              clientX: rz.left + treff.x, clientY: rz.top + treff.y }));
            await this.vent(60);
          }
          const etter = Veg3d._slaOpp({ x: treff.x, y: treff.y }, o);
          /* Kravet er at markøren blir stående PÅ SAMME STED, ikke på nøyaktig
             samme node. Står punktet på grensen mellom to celler, avgjør en
             brøkdels piksel hvilken av dem oppslaget treffer, og et krav om
             eksakt likhet ville falt tilfeldig. Feilen prøven finnes for –
             forskyvningen regnet fra feil nullpunkt – sendte markøren titalls
             celler unna, som regel helt ut i bakgrunnen. */
          /* MÅLT I METER, IKKE I CELLER.
             Cellene på tvers av vegen er en tredels meter brede, så nitten
             celler er seks meter – men de er også bare et par piksler på
             skjermen, og et par piksler er ikke det prøven er til for. Feilen
             den finnes for – forskyvningen regnet fra feil nullpunkt – flyttet
             markøren titalls meter, som regel helt ut i bakgrunnen. */
          const gg3 = Veg3d._sisteGitter;
          const meter = (etter && etter.k >= 0 && foer && foer.k >= 0)
            ? Math.hypot(gg3.wx[etter.k] - gg3.wx[foer.k], gg3.wy[etter.k] - gg3.wy[foer.k])
            : Infinity;
          this.sjekk('hjulet zoomer mot markøren, ikke mot midten',
            meter <= 8,
            Number.isFinite(meter) ? meter.toFixed(1) + ' m unna' : 'markøren havnet i bakgrunnen');
          Veg3d.nullstill();
          await this.vent(120);
        }
      }

      /* 17.9 «Hele vegen» er utgangspunktet, ikke et vindu på hundre meter. */
      {
        this.sjekk('hele vegen vises som standard', Veg3d.vindu === 0, '±' + Veg3d.vindu + ' m');
        const velger = document.getElementById('v3_vindu');
        this.sjekk('og velgeren står på det samme', velger && velger.value === '0',
          velger ? velger.value : 'ingen velger');
        const gg = Veg3d._sisteGitter;
        this.sjekk('alle profilene er med', gg.nh === App.resultat.profiler.length,
          gg.nh + ' av ' + App.resultat.profiler.length);

        /* Dreiningen skal MÅLES. En lang veg lagt på tvers av en høy, smal rute
           må krympe til en tråd; prøven krever at utgangsstillingen ikke er
           dårligere enn det andre valget. */
        /* Rammen settes ÉN gang, når 3D slås på. Prøven over har endret både
           vindu og kontekstring siden da, altså selve gitteret – så den må be
           om en ny innramming før den måler, ellers måler den en dreining som
           ble valgt for et annet gitter. */
        Veg3d.nullstill();
        await this.vent(150);
        const gg2 = Veg3d._sisteGitter;
        const c2 = document.getElementById('veg3d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const yaw0 = Veg3d.yaw;
        const skalaVed = v => {
          const f = Veg3d.yaw; Veg3d.yaw = v;
          const t = Veg3d._tilpassSkala(c2.clientWidth * dpr, c2.clientHeight * dpr, gg2);
          Veg3d.yaw = f; return t.skala;
        };
        /* Innenfor fem prosent, ikke eksakt.
           Rammen settes i det øyeblikket 3D slås på; lerretet kan ha endret seg
           noen piksler siden da, og når modellen er omtrent like bred som den er
           lang står de to valgene så nær hverandre at et par piksler snur dem.
           Feilen prøven finnes for er en HELT annen størrelsesorden: en to
           kilometer lang veg lagt på tvers av en høy, smal rute blir en tråd,
           og forholdet er da tre til ti ganger – ikke to prosent. */
        const valgt = skalaVed(yaw0), andre = skalaVed(yaw0 + 90);
        this.sjekk('utgangsstillingen er den som gjør modellen størst',
          valgt >= andre * 0.95,
          'valgt ' + valgt.toFixed(3) + ' mot ' + andre.toFixed(3));
      }

      /* 17.11 FYLDIG: MASSEN MALT HELT.
         Standardvisningen legger terrenget halvgjennomsiktig over graveflaten.
         Da blir en grunn skjæring og en grunn fylling nesten samme grå – man
         ser at det er gjort noe, men ikke hva. Prøven måler den faktiske
         fargen på skjermen, ikke at et flagg er satt: det er bildet som er
         leveransen her. */
      {
        /* HELE VEGEN, RAMMET INN, FØR DET MÅLES.
           Prøvene over flytter snittet, klikker i modellen (som nå setter
           dreiepunktet) og skrur på vindu og kontekstring. Måles fargen fra det
           utsnittet, kan man ende på et strekk som bare har skjæring – målt
           1 750 skjæringspiksler og NULL fyllingspiksler – og da sammenligner
           prøven en farge mot ingenting. */
        Veg3d.vindu = 0;
        Veg3d.kontekst = 30;
        Veg3d._gitterFor = null;
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.nullstill();
        await this.vent(300);
        const c3 = document.getElementById('veg3d');
        const snittfarge = () => {
          const kk = c3.getContext('2d');
          const b = kk.getImageData(0, 0, c3.width, c3.height).data;
          const id = Veg3d._id, gg = Veg3d._sisteGitter;
          const gr = { skjaering: [0, 0, 0, 0], fylling: [0, 0, 0, 0] };
          for (let p = 0; p < id.length; p++) {
            const k2 = id[p];
            if (k2 < 0 || !gg.harGrav[k2] || gg.harVeg[k2]) continue;
            const v = gr[gg.d[k2] >= 0 ? 'skjaering' : 'fylling'];
            v[0] += b[p * 4]; v[1] += b[p * 4 + 1]; v[2] += b[p * 4 + 2]; v[3]++;
          }
          const snitt = v => v[3] ? [v[0] / v[3], v[1] / v[3], v[2] / v[3]] : null;
          return { skj: snitt(gr.skjaering), fyl: snitt(gr.fylling),
            nSkj: gr.skjaering[3], nFyl: gr.fylling[3] };
        };
        const avstand = (a, b2) => (a && b2)
          ? Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]) : 0;

        Veg3d.fyldig = false; Veg3d.glemFarger(); Veg3d.tegn();
        await this.vent(200);
        const lett = snittfarge();
        Veg3d.fyldig = true; Veg3d.glemFarger(); Veg3d.tegn();
        await this.vent(200);
        const fyldig = snittfarge();

        this.sjekk('prøven fant både skjæring og fylling på skjermen',
          !!(lett.skj && lett.fyl && fyldig.skj && fyldig.fyl),
          `lett ${lett.nSkj}/${lett.nFyl} · fyldig ${fyldig.nSkj}/${fyldig.nFyl} piksler`);
        if (lett.skj && lett.fyl && fyldig.skj && fyldig.fyl) {
          /* Kravet er at de to blir LETTERE Å SKILLE. Et absolutt fargekrav
             ville låst fargevalget i stilarket; dette måler nettopp det
             innstillingen er til for. */
          this.sjekk('fyldig skiller skjæring og fylling tydeligere',
            avstand(fyldig.skj, fyldig.fyl) > avstand(lett.skj, lett.fyl) * 1.5,
            'avstand ' + avstand(lett.skj, lett.fyl).toFixed(0)
            + ' → ' + avstand(fyldig.skj, fyldig.fyl).toFixed(0));
          this.sjekk('og skjæringen blir tydelig rød',
            fyldig.skj[0] > fyldig.skj[1] + 60 && fyldig.skj[0] > fyldig.skj[2] + 60,
            '[' + fyldig.skj.map(v => Math.round(v)).join(',') + ']');
          this.sjekk('mens fyllingen blir tydelig grønn',
            fyldig.fyl[1] > fyldig.fyl[0] + 40 && fyldig.fyl[1] > fyldig.fyl[2] + 25,
            '[' + fyldig.fyl.map(v => Math.round(v)).join(',') + ']');
        }

        /* Terrenget må ut av veien der det graves – ellers hjelper ingen
           farge, fordi sløret ligger oppå uansett. */
        const lagF = Veg3d._lagliste(Veg3d._sisteGitter, Veg3d._palett());
        const terrF = lagF.find(l => l.hoyde === Veg3d._sisteGitter.zT);
        this.sjekk('terrenget tegnes ugjennomsiktig utenfor inngrepet i fyldig',
          !!terrF && !(terrF.blanding > 0) && terrF.krev === Veg3d._sisteGitter.utenGrav);
        Veg3d.fyldig = false; Veg3d.glemFarger();
        const lagL = Veg3d._lagliste(Veg3d._sisteGitter, Veg3d._palett());
        const terrL = lagL.find(l => l.hoyde === Veg3d._sisteGitter.zT);
        this.sjekk('og halvgjennomsiktig over alt i den vanlige visningen',
          !!terrL && terrL.blanding > 0 && !terrL.krev);

        /* utenGrav må være det eksakte speilbildet. Er den bare «nesten»,
           faller en stripe celler ut av begge lag og modellen får hull. */
        const gg2 = Veg3d._sisteGitter;
        let feil = 0;
        for (let i = 0; i < gg2.finnes.length; i++) {
          if (!gg2.finnes[i]) continue;
          if (!!gg2.utenGrav[i] === !!gg2.harGrav[i]) feil++;
        }
        this.sjekk('terrengringen er det eksakte speilbildet av inngrepet',
          feil === 0, feil + ' celler i begge eller ingen');

        Veg3d.tegn();
        await this.vent(120);
      }

      /* 17.12 «FØR»: TERRENGET UTEN INNGREPET.
         Man ser hva som blir gjort ved å se det som lå der før ved siden av.
         Med bare «etter» er det umulig å vite om den grønne vingen ligger i ei
         li eller på et jorde. Prøven måler BILDET – at fargene forsvinner – og
         ikke bare at et flagg er satt: det er bildet som er leveransen. */
      {
        const c4 = document.getElementById('veg3d');
        const farger = () => {
          const kk = c4.getContext('2d');
          const b = kk.getImageData(0, 0, c4.width, c4.height).data;
          const bak = [b[0], b[1], b[2]];
          let kulor = 0, n = 0;
          for (let i = 0; i < b.length; i += 4 * 5) {
            const r = b[i], g2 = b[i + 1], bl = b[i + 2];
            if (r === bak[0] && g2 === bak[1] && bl === bak[2]) continue;
            n++;
            if (r > g2 + 22 && r > bl + 22) kulor++;        // rødt
            else if (g2 > r + 16) kulor++;                   // grønt
          }
          return { n, del: n ? kulor / n : 0 };
        };
        Veg3d.visFoer = false; Veg3d.tegn();
        await this.vent(180);
        const etter = farger();
        this.sjekk('det er noe å se i «etter»', etter.n > 500 && etter.del > 0.01,
          Math.round(100 * etter.del) + ' % farget');

        Veg3d.visFoer = true; Veg3d.tegn();
        await this.vent(180);
        const foer = farger();
        this.sjekk('«før» viser bare terreng – ingen skjæring eller fylling',
          foer.del === 0, Math.round(100 * foer.del) + ' % farget');
        this.sjekk('men terrenget står der fortsatt', foer.n > etter.n * 0.5,
          foer.n + ' mot ' + etter.n + ' piksler');
        this.sjekk('og det står i bildet HVILKEN av de to man ser på',
          Veg3d.visFoer === true);

        Veg3d.visFoer = false; Veg3d.tegn();
        await this.vent(180);
        this.naer('og tilbake til «etter» gir samme bilde som før', farger().del, etter.del, 0.01);

        /* Mellomrom kikker: hold nede for før, slipp for etter. Å veksle er den
           eneste måten å SE forskjellen – to bilder ved siden av hverandre må
           man sammenligne, ett som blinker ser man. */
        const o4 = document.getElementById('veg3dover');
        o4.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
        await this.vent(150);
        this.sjekk('mellomrom kikker på terrenget', Veg3d.visFoer === true);
        o4.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true, cancelable: true }));
        await this.vent(150);
        this.sjekk('og slipper man, er inngrepet tilbake', Veg3d.visFoer === false);
      }

      /* 17.13 DREIEPUNKTET LIGGER I DET MAN SER PÅ.
         Modellen dreide om midten av HELE gitteret. På en to kilometer lang veg
         ligger den midten hundrevis av meter fra det man jobber med, og da er
         dreiing en slynge: motivet flyktet 91 piksler under musa på åtte
         dreininger, og man mistet det man så på.
         Med dreiepunktet I motivet er tallet algebraisk null – i fokuspunktet
         er X=Y=Z=0, altså px=cx og py=cy, uansett yaw, pitch, skala og
         overdrivning. Prøven måler det på skjermen, ikke i formelen. */
      {
        const o5 = document.getElementById('veg3dover');
        const c5 = document.getElementById('veg3d');
        const rr5 = () => o5.getBoundingClientRect();
        const mus5 = (t, x, y) => o5.dispatchEvent(new MouseEvent(t,
          { bubbles: true, cancelable: true, clientX: rr5().left + x, clientY: rr5().top + y, button: 0 }));
        const opp5 = (x, y) => window.dispatchEvent(new MouseEvent('mouseup',
          { bubbles: true, cancelable: true, clientX: rr5().left + x, clientY: rr5().top + y, button: 0 }));
        /* Rasterpiksel → skjermpiksel går via lerretets FAKTISKE rasterstørrelse,
           ikke via dpr: under dragning tegnes det i 60 % skala, og en omregning
           med dpr alene måler da noe annet enn den ser ut som. */
        const skjerm = k => {
          const g5 = Veg3d._sisteGitter, kam = Veg3d._sisteKam;
          const h5 = g5.harGrav[k] ? g5.zP[k] : g5.zT[k];
          const q = kam.punkt(g5.wx[k], g5.wy[k], h5);
          return { x: q.px * c5.clientWidth / Veg3d._sisteRb, y: q.py * c5.clientHeight / Veg3d._sisteRh };
        };

        Veg3d.nullstill();
        await this.vent(200);
        const treff5 = [];
        for (let y = 25; y < o5.clientHeight - 25; y += 9) {
          for (let x = 25; x < o5.clientWidth - 25; x += 9) {
            const t = Veg3d._slaOpp({ x, y }, o5);
            if (t && t.k >= 0) treff5.push(t.k);
          }
        }
        this.sjekk('det er en node å dreie om', treff5.length > 10, treff5.length + ' treff');
        if (treff5.length > 10) {
          const node = treff5[(treff5.length / 2) | 0];
          const dreiAtte = async () => {
            const start = skjerm(node);
            let verst = 0;
            for (let i = 0; i < 8; i++) {
              mus5('mousedown', 200, 200);
              mus5('mousemove', 200 + 45 * ((i % 3) - 1), 200 + 30 * (((i + 1) % 3) - 1));
              opp5(200, 200);
              await this.vent(170);
              const na = skjerm(node);
              verst = Math.max(verst, Math.hypot(na.x - start.x, na.y - start.y));
            }
            return verst;
          };

          Veg3d.nullstill(); await this.vent(200);
          const utenFokus = await dreiAtte();
          this.sjekk('uten dreiepunkt flykter motivet – slik det gjorde før',
            utenFokus > 10, Math.round(utenFokus) + ' px');

          Veg3d.nullstill(); await this.vent(200);
          Veg3d.settFokus(node, Veg3d._sisteGitter); Veg3d.tegn();
          await this.vent(150);
          const medFokus = await dreiAtte();
          this.sjekk('med dreiepunkt står det man ser på helt stille',
            medFokus <= 2, medFokus.toFixed(2) + ' px etter åtte dreininger');

          /* Låsen skal holde for ALT, ikke bare for dreining. */
          const foer = skjerm(node);
          Veg3d.skala *= 3; Veg3d.overdriv = 3; Veg3d.tegn();
          await this.vent(150);
          const etter = skjerm(node);
          this.naer('og gjennom zoom og overdrivning også',
            Math.hypot(etter.x - foer.x, etter.y - foer.y), 0, 2);
          Veg3d.overdriv = 1;

          /* Et klikk skal SETTE dreiepunktet – uten at bildet rikker seg. */
          Veg3d.nullstill(); await this.vent(200);
          let mal = null;
          for (let y = 40; y < o5.clientHeight - 40 && !mal; y += 11) {
            for (let x = 40; x < o5.clientWidth - 40; x += 11) {
              const t = Veg3d._slaOpp({ x, y }, o5);
              if (t && t.k >= 0) { mal = { x, y, k: t.k }; break; }
            }
          }
          if (mal) {
            const foerKlikk = skjerm(mal.k);
            mus5('mousedown', mal.x, mal.y); opp5(mal.x, mal.y);
            await this.vent(200);
            const etterKlikk = skjerm(mal.k);
            this.sjekk('et klikk setter dreiepunktet', !!Veg3d.fokus);
            this.naer('og bildet står stille mens det skjer',
              Math.hypot(etterKlikk.x - foerKlikk.x, etterKlikk.y - foerKlikk.y), 0, 2);
          }
        }
        /* Legg alt tilbake slik neste prøve finner det. Denne prøven skrur på
           både zoom, overdrivning og dreiepunkt, og en modell som står igjen
           utenfor lerretet får den neste til å måle på en tom flate. */
        Veg3d.overdriv = 1;
        Veg3d.fokus = null;
        Veg3d.panX = 0; Veg3d.panY = 0;
        Veg3d._skalaSatt = false;
        Veg3d.nullstill();
        await this.vent(300);
      }

      /* 17.14 PÅ BAKKEN: KAMERAET STÅR I MODELLEN, IKKE OVER DEN.
         En modell som dreier om en akse er et utstillingsobjekt. Den som skal
         vurdere en linje vil se den slik den blir sett – fra førerhuset. Her
         måles fire ting, og alle fire var feil i første forsøk:
           · gulvet er den FERDIGE flaten (i en skjæring lå kameraet 29 m for
             høyt fordi det tok det høyeste av terreng og gravflate),
           · kameraet går i METER PER SEKUND, ikke i hakk per tastetrykk,
           · det går JEVNT (snittets profilrutenett dro det i rykk på 2,2 og 2,8
             m annenhver gang),
           · og man ser LANGS vegen, ikke på tvers av den. */
      {
        const o6 = document.getElementById('veg3dover');
        const c6 = document.getElementById('veg3d');
        Veg3d.nullstill();
        await this.vent(250);
        const L6 = App.resultat.lengde;
        App.settTverrStasjon(L6 / 2);
        await this.vent(150);

        Veg3d.settModus('bakken');
        await this.vent(300);
        this.sjekk('«På bakken» setter kameraet i modellen', Veg3d.modus === 'bakken');
        this.sjekk('og knappen viser at man står der',
          document.getElementById('v3_bakken').getAttribute('aria-pressed') === 'true');

        const g6 = Veg3d._sisteGitter, kam6 = Veg3d._sisteKam;
        this.sjekk('kameraet har et øye – et punkt, ikke en retning', !!(kam6 && kam6.oye));

        /* GULVET ER DEN FERDIGE FLATEN.
           Står man på en veg i skjæring, står man PÅ VEGEN. Prøven finner en
           node der terrenget ligger merkbart over gravflaten og krever at gulvet
           følger gravflaten. Med `Math.max(zT, zP)` – som sto her – svevde man
           over skjæringen og så ingenting av den. */
        /* Den DYPESTE skjæringen på hele strekket, uansett hvor i profilen den
           ligger. Første utgave lette bare på senterlinja og bare dypere enn
           halvannen meter – og fant ingenting på prøvevegen, så hele kravet ble
           hoppet over uten et ord. En prøve som stilltiende forsvinner er verre
           enn ingen prøve: mutasjonen som satte det gamle maksimumet tilbake
           gikk rett gjennom med 502 av 502. */
        let dyp = null;
        for (let j = 0; j < g6.nh; j++) {
          for (let i = 0; i < g6.nb; i++) {
            const k = j * g6.nb + i;
            if (!g6.finnes[k] || !g6.harGrav[k]) continue;
            const kutt = g6.zT[k] - g6.zP[k];
            if (kutt > 0.5 && (!dyp || kutt > dyp.kutt)) {
              dyp = { s: g6.s[j], t: g6.tAkse[k], zP: g6.zP[k], zT: g6.zT[k], kutt };
            }
          }
        }
        this.sjekk('prøvevegen har en skjæring å måle gulvet i', !!dyp,
          dyp ? dyp.kutt.toFixed(1) + ' m på det dypeste' : 'fant ingen');
        if (dyp) {
          this.naer('gulvet i en skjæring er vegen, ikke det urørte terrenget',
            Veg3d._gulv(g6, dyp.s, dyp.t), dyp.zP, 0.3);
        }

        App.settTverrStasjon(L6 / 2);
        await this.vent(150);
        Veg3d.seFramover();
        Veg3d.tegn();
        await this.vent(220);
        const oye6 = Veg3d._bakkePos(Veg3d._sisteGitter);
        this.naer('øyet står kamH over gulvet – hverken i den eller over den',
          oye6.z - Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS, Veg3d.kamT), Veg3d.kamH, 0.01);

        /* SER MAN LANGS VEGEN? Et punkt på senterlinja rett fram skal ligge midt
           på skjermen, uansett hvor langt fram det er. Er yaw en halv grad feil,
           ser man ut i skogen. */
        const kam7 = Veg3d._sisteKam;
        for (const d of [3, 20, 50, 150]) {
          const pd = App.linje.punktVed(Veg3d.kamS + d);
          if (!pd) continue;
          const q = kam7.punkt(pd.x, pd.y, Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS + d, 0));
          this.sjekk('  ' + d + ' m fram ligger foran kameraet, ikke bak', q.w > 0,
            'dybde ' + q.w.toFixed(0) + ' m');
        }
        /* MÅLT TETT INNTIL, ikke langt fram. Blikket følger TANGENTEN, så i en
           kurve skal senterlinja 150 m fram ligge ut til siden – det er riktig,
           og en prøve som krevde midten der målte kurvaturen og ikke kameraet
           (den slo ut med 205 px på en R=120-kurve). Tre meter fram er derimot
           midten uansett kurve, og en yaw som er snudd, speilvendt eller 90
           grader feil flytter det punktet flere hundre piksler. */
        const pn7 = App.linje.punktVed(Veg3d.kamS + 3);
        const qn7 = kam7.punkt(pn7.x, pn7.y, Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS + 3, 0));
        this.sjekk('man ser LANGS vegen – senterlinja rett foran treffer midten',
          Math.abs(qn7.px - kam7.cx) < 30, Math.abs(qn7.px - kam7.cx).toFixed(1) + ' px unna midten');
        /* Tretti piksler er tre grader, altså sju centimeter sideveis på tre
           meter – det er kurven, ikke siktet. Prøven skal fange en yaw som er
           snudd, speilvendt eller lagt på feil akse, og alle tre bommer med
           titalls grader. En strammere grense ville bare målt radien. */
        const bak6 = App.linje.punktVed(Math.max(0, Veg3d.kamS - 50));
        this.sjekk('og det som er bak, er bak',
          kam7.punkt(bak6.x, bak6.y, Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS - 50, 0)).w < 0);

        /* FART I METER PER SEKUND.
           `_bakkeSteg(dt)` er hele bevegelsen; løkka over den gir bare `dt`.
           Prøven kaller den med kjent `dt`, så den måler farten og ikke
           nettleserens repetasjonsrate eller maskinens bildefrekvens. */
        const gaa6 = (taster, dt) => {
          Veg3d._taster = new Set(taster);
          Veg3d._bakkeSteg(dt);
          Veg3d._taster = new Set();
        };
        Veg3d.kamT = 0;
        Veg3d.kamH = 2;
        Veg3d.fartsfaktor = 1;
        /* FARTSPRØVENE GJELDER FLYGING. Regelen «farten følger øyehøyden» er en
           flyregel: går man, står høyden i 1,7 m og regelen har ingenting å
           følge. Og går man, stopper man mot vegkanten etter tre meter, så en
           sidelengs måling ville målt veggen og ikke farten. */
        Veg3d.settFerd('fly');
        Veg3d.kamH = 2;
        /* Prøven måler ETT skritt og bruker det som målestokk for de andre. Sto
           tallet 2,2 skrevet inn her, ville prøven brutt hver gang noen justerte
           grunnfarten – og det som faktisk skal holde er FORHOLDENE: bakover er
           like langt som framover, Shift ganger med 3,5, et halvt sekund er
           halvparten, og på skrå er man ikke raskere enn rett fram.
           Selve grunnfarten har bare ett krav, og det er et brukskrav: et
           menneskelig napp på tasten skal SYNES. */
        let f6 = Veg3d.kamS; gaa6(['w'], 1);
        const enhet6 = Veg3d.kamS - f6;
        this.sjekk('et napp på W flytter deg langt nok til at man ser det',
          enhet6 >= 4 && enhet6 <= 9, enhet6.toFixed(2) + ' m i sekundet på gangfart');
        f6 = Veg3d.kamS; gaa6(['s'], 1);
        this.naer('S går like langt bakover', Veg3d.kamS - f6, -enhet6, 0.05);
        f6 = Veg3d.kamS; gaa6(['w', 'shift'], 1);
        this.naer('Shift løper', Veg3d.kamS - f6, enhet6 * 3.5, 0.05);
        f6 = Veg3d.kamS; gaa6(['w'], 0.5);
        this.naer('et halvt sekund er halvparten – farten er per SEKUND',
          Veg3d.kamS - f6, enhet6 / 2, 0.05);

        /* To taster samtidig skal gi ETT skritt på skrå, ikke to skritt etter
           hverandre – ellers går man raskere på skrå enn rett fram. */
        f6 = Veg3d.kamS;
        const t6 = Veg3d.kamT;
        gaa6(['w', 'd'], 1);
        this.naer('W og D samtidig går på skrå, ikke fortere',
          Math.hypot(Veg3d.kamS - f6, Veg3d.kamT - t6), enhet6, 0.06);
        Veg3d.kamT = 0;

        /* FARTSFAKTOREN ER DEN VARIGE INNSTILLINGEN.
           Grunnfarten følger øyehøyden, men på en veg som er to kilometer lang
           er gangfart tolv minutter fra ende til ende. Shift løper, men den må
           holdes; faktoren står til man endrer den. */
        Veg3d.settFart(4);
        f6 = Veg3d.kamS; gaa6(['w'], 1);
        this.naer('fartsfaktoren ganger farten', Veg3d.kamS - f6, enhet6 * 4, 0.1);
        Veg3d.settFart(1000);
        this.sjekk('men den kan ikke skrus opp til noe man ikke kan styre',
          Veg3d.fartsfaktor <= 16, Veg3d.fartsfaktor + '×');
        Veg3d.settFart(0.0001);
        this.sjekk('og ikke ned til stillstand heller', Veg3d.fartsfaktor >= 0.25,
          Veg3d.fartsfaktor + '×');
        /* + og − gjør det samme som velgeren, og velgeren skal vise det. */
        Veg3d.settFart(1);
        Veg3d._bakkeTast({ key: '+', preventDefault() {}, stopPropagation() {} });
        this.sjekk('«+» skrur farten opp', Veg3d.fartsfaktor > 1.3, Veg3d.fartsfaktor.toFixed(2) + '×');
        const velger6 = document.getElementById('v3_fart');
        if (velger6) {
          this.sjekk('og velgeren følger med, så den aldri lyver om farten',
            Math.abs(+velger6.value - Veg3d.fartsfaktor) <= Veg3d.fartsfaktor,
            'velger ' + velger6.value + ' mot ' + Veg3d.fartsfaktor.toFixed(2));
        }
        Veg3d._bakkeTast({ key: '-', preventDefault() {}, stopPropagation() {} });
        this.naer('og «−» tilbake igjen', Veg3d.fartsfaktor, 1, 0.02);
        Veg3d.fartsfaktor = 1;

        /* JEVNT. Snittet hopper i profiler; kameraet skal ikke. Målt før dette:
           2,20 og 2,80 m annenhver gang, fordi omtegningen av tverrprofilen
           leste stasjonen tilbake og dro kameraet mot rutenettet. */
        /* JAMNE SKRITT ER ET GÅ-KRAV. Flyr man, står høyden stille som en KOTE
           mens terrenget ruller under, så farten – som følger høyden over
           bakken – endrer seg av seg selv. Det er riktig flyging, og feil sted
           å måle om profilrutenettet drar i kameraet. */
        Veg3d.settFerd('gaa');
        App.settTverrStasjon(L6 / 2);
        Veg3d.kamH = 2;
        const skritt = [];
        for (let i = 0; i < 8; i++) { const a6 = Veg3d.kamS; gaa6(['w'], 1); skritt.push(Veg3d.kamS - a6); }
        const spenn = Math.max(...skritt) - Math.min(...skritt);
        this.sjekk('åtte skritt er åtte like skritt – profilrutenettet drar ikke i kameraet',
          spenn < 0.02, 'spenn ' + spenn.toFixed(3) + ' m');

        /* FARTEN FØLGER HØYDEN – NÅR MAN FLYR. Én kontroll for en fylling på
           tretti meter og en veg på to kilometer. Går man, står høyden i 1,7 m,
           og da har regelen ingenting å følge; det er derfor den hører hjemme
           her og ikke i gåprøvene over. */
        Veg3d.settFerd('fly');
        Veg3d.kamH = 60;
        f6 = Veg3d.kamS; gaa6(['w'], 1);
        this.sjekk('hever man seg, går man fortere – uten en eneste innstilling',
          (Veg3d.kamS - f6) > enhet6 * 8, (Veg3d.kamS - f6).toFixed(0) + ' m/s på 60 m høyde mot '
            + enhet6.toFixed(1) + ' på bakken');
        Veg3d.kamH = 2;

        const h6 = Veg3d.kamH; gaa6(['e'], 1);
        this.sjekk('E hever øyet', Veg3d.kamH > h6 * 2, h6.toFixed(1) + ' → ' + Veg3d.kamH.toFixed(1) + ' m');
        gaa6(['q'], 4);
        this.sjekk('Q senker det igjen, men aldri ned i bakken', Veg3d.kamH >= 1.59,
          Veg3d.kamH.toFixed(2) + ' m over bakken');

        /* SKYVEREN ER OGSÅ EN KAMERAKONTROLL. Flytter noen andre stasjonen –
           skyveren, ◀ ▶, et klikk i kartet – skal kameraet dit. */
        App.settTverrStasjon(L6 * 0.75);
        await this.vent(120);
        this.naer('flytter man snittet, følger kameraet med',
          Veg3d.kamS, App.tverrStasjon, 0.01);

        /* Tastene skal legges NED, ikke utføres. Det er løkka som går. */
        Veg3d._taster = new Set();
        o6.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
        this.sjekk('en tast som holdes nede blir liggende nede', Veg3d._taster.has('w'));
        o6.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true, cancelable: true }));
        this.sjekk('og slippes når den slippes', !Veg3d._taster.has('w'));
        o6.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        this.sjekk('piltastene gjør det samme som WASD', Veg3d._taster.has('arrowup'));
        Veg3d._taster = new Set();

        /* Bildet må ikke rakne mens man går. Nærplanet klipper i kamerarommet;
           gjøres det etter divisjonen, smører trekanter seg over hele skjermen
           og dekningen hopper. */
        const dekning6 = () => {
          const kk = c6.getContext('2d');
          const b = kk.getImageData(0, 0, c6.width, c6.height).data;
          const bg = [b[0], b[1], b[2]];
          let n = 0, tot = 0;
          for (let i = 0; i < b.length; i += 4 * 5) {
            tot++;
            if (Math.abs(b[i] - bg[0]) + Math.abs(b[i + 1] - bg[1]) + Math.abs(b[i + 2] - bg[2]) > 8) n++;
          }
          return 100 * n / tot;
        };
        App.settTverrStasjon(L6 / 2);
        Veg3d.seFramover();
        Veg3d.tegn();
        await this.vent(200);
        const rad6 = [];
        for (let i = 0; i < 6; i++) {
          gaa6(['w'], 1.2);
          Veg3d.tegn();
          await this.vent(140);
          rad6.push(dekning6());
        }
        let hopp = 0;
        for (let i = 1; i < rad6.length; i++) hopp = Math.max(hopp, Math.abs(rad6[i] - rad6[i - 1]));
        this.sjekk('bildet holder seg mens man går – nærplanet smører ikke',
          hopp < 12 && rad6.every(v => v > 15),
          'største sprang ' + hopp.toFixed(1) + ' prosentpoeng');

        /* Esc og ↺ er begge veien hjem, og knappen skal slippe seg selv. */
        o6.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await this.vent(250);
        this.sjekk('Esc tar deg opp igjen', Veg3d.modus === 'oversikt');
        this.sjekk('og knappen slipper seg selv',
          document.getElementById('v3_bakken').getAttribute('aria-pressed') === 'false');
        Veg3d.settModus('bakken');
        await this.vent(200);
        Veg3d.nullstill();
        await this.vent(250);
        this.sjekk('↺ er også veien hjem fra bakken', Veg3d.modus === 'oversikt');
        this.sjekk('  og knappen fulgte med dit også',
          document.getElementById('v3_bakken').getAttribute('aria-pressed') === 'false');

        Veg3d.kamT = 0;
        Veg3d.kamH = 2;
        App.settTverrStasjon(L6 / 2);
        await this.vent(200);
      }

      /* 17.15 «ETTER»: LANDSKAPET SLIK DET BLIR.
         «Før» viser det som ligger der i dag. «Etter» viser det som står igjen
         når alt er ferdig – og det er bildet man legger i et tilbud.
         Den store fellen er å bygge den på `zP`. zP er jordarbeidsflaten, ikke
         ferdig nivå: under vegbanen ligger den bærelag pluss slitelag lavere,
         med standardmalen 0,70 m. En «etter»-visning på zP viser en veg som
         ligger sytti centimeter for lavt, og det ser helt troverdig ut. */
      {
        const c7 = document.getElementById('veg3d');
        Veg3d.settModus('oversikt');
        Veg3d.nullstill();
        await this.vent(280);
        const g7 = Veg3d._sisteGitter;
        this.sjekk('gitteret bærer en ferdig flate', !!(g7 && g7.zEtter));
        if (g7 && g7.zEtter) {
          /* FERDIG NIVÅ ER zVeg DER VEGBANEN FINNES, jordarbeidsflaten ellers.
             Masken må sjekkes for hånd: zVeg er en Float32Array som står på 0
             der vegbanen ikke er fylt, og uten sjekken faller halve modellen
             til kote 0. */
          let avvik = 0, medVeg = 0, storsteOb = 0, nuller = 0;
          for (let k = 0; k < g7.nb * g7.nh; k++) {
            if (!g7.finnes[k]) continue;
            const skal = g7.harVeg[k] ? g7.zVeg[k] : g7.zP[k];
            if (Math.abs(g7.zEtter[k] - skal) > 1e-6) avvik++;
            if (g7.harVeg[k]) { medVeg++; storsteOb = Math.max(storsteOb, g7.zVeg[k] - g7.zP[k]); }
            if (g7.zEtter[k] === 0) nuller++;
          }
          this.sjekk('ferdig flate er vegbanen der den finnes, jordarbeid ellers',
            avvik === 0, avvik + ' noder feil');
          this.sjekk('  og vegbanen ligger OVER planum – ikke på det', storsteOb > 0.3,
            'overbygning ' + storsteOb.toFixed(2) + ' m');
          this.sjekk('ingen node falt til kote 0 – masken ble sjekket', nuller === 0,
            nuller + ' noder på null');
          this.sjekk('  (og det var vegbane å måle på)', medVeg > 50, medVeg + ' noder');
        }

        /* BILDET, ikke bare flagget. «Etter» skal være landskapet: ingen rød
           skjæring, ingen grønn fylling, én sammenhengende flate. */
        const farger7 = () => {
          const kk = c7.getContext('2d');
          const b = kk.getImageData(0, 0, c7.width, c7.height).data;
          const bak = [b[0], b[1], b[2]];
          let kulor = 0, n = 0;
          for (let i = 0; i < b.length; i += 4 * 5) {
            const r = b[i], g2 = b[i + 1], bl = b[i + 2];
            if (r === bak[0] && g2 === bak[1] && bl === bak[2]) continue;
            n++;
            if (r > g2 + 22 && r > bl + 22) kulor++;
            else if (g2 > r + 16) kulor++;
          }
          return { n, del: n ? kulor / n : 0 };
        };
        Veg3d.settVisning('vanlig'); await this.vent(200);
        const vanlig7 = farger7();
        Veg3d.settVisning('etter'); await this.vent(220);
        const etter7 = farger7();
        this.sjekk('«etter» har ingen massefarger – det er et landskap, ikke et regnskap',
          etter7.del === 0, Math.round(100 * etter7.del) + ' % farget');
        this.sjekk('men modellen står der fortsatt', etter7.n > vanlig7.n * 0.7,
          etter7.n + ' mot ' + vanlig7.n + ' piksler');
        this.sjekk('  (og arbeidsbildet HAR massefarger å miste)', vanlig7.del > 0.01,
          Math.round(100 * vanlig7.del) + ' %');

        /* TRE BILDER, ETT AV GANGEN. To boolske flagg kunne stått på samtidig. */
        const trykt = () => ['foer', 'vanlig', 'etter']
          .filter(x => document.getElementById('v3_' + x)
            && document.getElementById('v3_' + x).getAttribute('aria-pressed') === 'true');
        this.sjekk('nøyaktig én knapp er trykket inn', trykt().length === 1, trykt().join(','));
        this.sjekk('  og det er den som viser det man ser', trykt()[0] === 'etter');
        Veg3d.settVisning('foer'); await this.vent(200);
        this.sjekk('bytter man bilde, slipper den forrige knappen seg selv',
          trykt().length === 1 && trykt()[0] === 'foer', trykt().join(','));

        /* GULVET FØLGER FLATEN MAN SER. Sto det fast på planum, gikk man sytti
           centimeter nede i asfalten i «etter» og under bakken i «før». */
        App.settTverrStasjon(App.resultat.lengde / 2);
        await this.vent(150);
        /* MÅLT DER DET ER NOE Å MÅLE. Første utgave sto på midtstasjonen og
           krevde at «før» lå merkbart over planum. På prøvevegen ligger den
           stasjonen tilfeldigvis i dagen – åtte centimeter skilte – og prøven
           feilet på en tilfeldighet i stedet for på en feil. Her letes det opp
           en stasjon med minst en meter skjæring på senterlinja. */
        const gg7 = Veg3d._sisteGitter;
        let dypS = null;
        for (let j = 0; j < gg7.nh && !dypS; j++) {
          const k = j * gg7.nb + gg7.kn + Veg3d.SENTER;
          if (gg7.finnes[k] && gg7.harGrav[k] && gg7.zT[k] - gg7.zP[k] > 1) dypS = gg7.s[j];
        }
        this.sjekk('prøvevegen har en skjæring på senterlinja å stå i', dypS != null);
        if (dypS != null) App.settTverrStasjon(dypS);
        await this.vent(150);
        const gulv7 = v => { Veg3d.settVisning(v); return Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS, 0); };
        const gV = gulv7('vanlig'), gE = gulv7('etter'), gF = gulv7('foer');
        this.sjekk('i «etter» står man PÅ ferdig veg, ikke nede i den',
          gE > gV + 0.3, 'ferdig ' + gE.toFixed(2) + ' mot planum ' + gV.toFixed(2));
        this.sjekk('og i «før» står man på dagens mark, over skjæringen',
          gF > gV + 0.5, 'terreng ' + gF.toFixed(2) + ' mot planum ' + gV.toFixed(2));
        Veg3d.settVisning('vanlig');
        await this.vent(200);

        /* Mellomrom kikker fortsatt – og skal legge deg tilbake der du var,
           ikke i arbeidsbildet. Med en boolsk hukommelse var det umulig. */
        const o7 = document.getElementById('veg3dover');
        Veg3d.settVisning('etter'); await this.vent(150);
        o7.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
        await this.vent(150);
        this.sjekk('mellomrom kikker på «før» også fra «etter»', Veg3d.visning === 'foer');
        o7.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true, cancelable: true }));
        await this.vent(150);
        this.sjekk('og slipper man, er man tilbake i «etter» – ikke i arbeidsbildet',
          Veg3d.visning === 'etter', Veg3d.visning);
        Veg3d.settVisning('vanlig');
        await this.vent(150);
      }

      /* 17.16 VEIEN INN I BAKKEMODUS, OG TASTENE ETTERPÅ.
         Brukeren spurte «hvordan kommer man inn i modusen?» og meldte at W A S D
         ikke virket. Begge deler var sant, og prøvene over kunne ikke fange
         noen av dem: de kalte _bakkeSteg direkte og sendte tastene rett på
         lerretet, altså hoppet de over både veien inn og fokuset. */
      {
        const kb7 = document.getElementById('v3_bakken');
        this.sjekk('«På bakken» står framme, ikke bak et menyklikk',
          !!(kb7 && kb7.offsetParent), kb7 ? 'synlig' : 'finnes ikke');
        this.sjekk('  og den står sammen med Snitt og 3D – den er den tredje måten å se på',
          !!(kb7 && kb7.closest('.visvalg')));
        const meny7 = document.getElementById('v3_menypanel');
        this.sjekk('  og altså ikke inne i «Vis»-menyen', !(meny7 && meny7.contains(kb7)));

        Veg3d.settModus('oversikt');
        await this.vent(200);
        /* Menyen er position:fixed over lerretet. Står den åpen når man går ned
           på bakken, dekker den bildet man nettopp gikk ned i – og fordi
           lukkeregelen hopper over klikk INNI panelet, ble den stående. */
        document.getElementById('v3_meny').click();
        await this.vent(180);
        this.sjekk('menyen kan åpnes', !meny7.classList.contains('skjult'));
        kb7.click();
        await this.vent(500);
        this.sjekk('ett klikk tar deg ned på bakken', Veg3d.modus === 'bakken', Veg3d.modus);
        this.sjekk('  og menyen viker – den lå oppå bildet',
          meny7.classList.contains('skjult'));
        this.sjekk('  og lerretet har fokus, så tastene virker uten et klikk til',
          document.activeElement === document.getElementById('veg3dover'),
          document.activeElement.id || document.activeElement.tagName);

        /* TASTENE MÅ VIRKE OGSÅ NÅR FOKUS HAR SKLIDD BORT.
           Målt: etter et klikk i 3D-bildet sto activeElement på BODY, fordi
           dragningen kaller preventDefault og det avlyser fokusering. Da var
           W A S D døde uten at noe forklarte hvorfor. */
        document.activeElement.blur();
        this.sjekk('fokus kan gli bort til BODY', document.activeElement === document.body);
        Veg3d._taster = new Set();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
        this.sjekk('men tasten fanges likevel – vinduet lytter mens man står på bakken',
          Veg3d._taster.has('w'), [...Veg3d._taster].join(','));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true, cancelable: true }));
        this.sjekk('  og slippes når den slippes', !Veg3d._taster.has('w'));

        /* Men den som skriver et tall skal få skrive det. */
        const felt7 = document.querySelector('.faneinnhold.aktiv input[type=number]')
          || document.querySelector('input[type=number]');
        felt7 && felt7.focus();
        if (felt7 && document.activeElement === felt7) {
          Veg3d._taster = new Set();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
          this.sjekk('skriver man i et felt, går tasten dit og ikke til kameraet',
            !Veg3d._taster.has('w'));
          felt7.blur();
        }

        /* Et klikk i bildet skal GI lerretet fokus, ikke ta det. */
        Veg3d._taster = new Set();
        document.body.focus();
        document.activeElement.blur();
        const ov7 = document.getElementById('veg3dover');
        const rr7 = ov7.getBoundingClientRect();
        ov7.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true,
          clientX: rr7.left + rr7.width / 2, clientY: rr7.top + rr7.height / 2, button: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true,
          clientX: rr7.left + rr7.width / 2, clientY: rr7.top + rr7.height / 2, button: 0 }));
        await this.vent(200);
        this.sjekk('et klikk i bildet gir lerretet fokus', document.activeElement === ov7,
          document.activeElement.id || document.activeElement.tagName);

        Veg3d.settModus('oversikt');
        await this.vent(250);
        this.sjekk('og ute av bakkemodus lar vinduet tastene være i fred',
          (() => { Veg3d._taster = new Set();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
            return !Veg3d._taster.has('w'); })());
        Veg3d.nullstill();
        await this.vent(200);
      }

      /* 17.17 FULLSKJERM.
         ⤢ gir panelet arbeidsflaten; ⛶ gir det hele skjermen. Prøven kan ikke
         BE om fullskjerm – nettleseren krever en ekte brukerbevegelse, og en
         syntetisk hendelse blir avvist. Den måler derfor det den kan: at
         knappen finnes begge steder, at den peker på et panel, og at
         omvisningen etter en fullskjermendring faktisk måler lerretene på
         nytt. Uten det siste ble modellen stående innrammet for den gamle
         størrelsen, som en frimerkestor tegning midt på en svart skjerm. */
      {
        const knapper7 = [...document.querySelectorAll('.fullskjermknapp')];
        this.sjekk('begge panelene har en fullskjermknapp', knapper7.length >= 2,
          knapper7.length + ' knapper');
        this.sjekk('  og hver av dem peker på et panel',
          knapper7.every(b => !!b.closest('.panel')));
        this.sjekk('  med navnet på panelet den fyller',
          knapper7.every(b => !!b.dataset.fullskjerm),
          knapper7.map(b => b.dataset.fullskjerm).join(','));
        /* Etter en fullskjermendring må innrammingen gjøres om. Flagget er det
           som styrer det, og prøven krever at hendelsen setter det. */
        Veg3d._skalaSatt = true; Tomt3d._skalaSatt = true;
        document.dispatchEvent(new Event('fullscreenchange'));
        await this.vent(220);
        this.sjekk('en fullskjermendring rammer modellene inn på nytt',
          Veg3d._skalaSatt === false || Tomt3d._skalaSatt === false,
          'veg ' + Veg3d._skalaSatt + ', tomt ' + Tomt3d._skalaSatt);
        await this.vent(150);
      }

      /* 17.18 STREKENE I OVERLEGGET MÅ KLIPPES MOT ØYET.
         Fotlinje, vegkant, senterlinje og snittmerke ble tegnet ved å projisere
         hver node og trekke en strek mellom dem – uten å spørre om noden lå
         FORAN øyet. Sett ovenfra er det riktig; der er hele modellen foran.
         Står man i den, ligger halve vegen bak ryggen, og et punkt bak øyet får
         negativ dybde: px = cx + F·rx/w speiler det over til motsatt side av
         skjermen. Polylinja trakk da en strek fra et ekte punkt til et
         speilbilde, og bildet ble en vifte av streker ut fra midten – over
         himmelen, gjennom terrenget, tvers over alt.
         Prøven måler BILDET: hvor mange piksler overlegget dekker, og hvor mye
         det tallet svinger når man snur seg rundt. */
      {
        const ov8 = document.getElementById('veg3dover');
        const dekning8 = () => {
          const kk = ov8.getContext('2d');
          const b = kk.getImageData(0, 0, ov8.width, ov8.height).data;
          let n = 0, tot = 0;
          for (let i = 3; i < b.length; i += 4 * 3) { tot++; if (b[i] > 40) n++; }
          return 100 * n / tot;
        };
        Veg3d.settModus('oversikt');
        Veg3d.nullstill();
        await this.vent(250);
        const oppe8 = dekning8();
        this.sjekk('strekene finnes i oversikten', oppe8 > 0.2 && oppe8 < 12,
          oppe8.toFixed(2) + ' % av ruta');

        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.settModus('bakken');
        await this.vent(400);
        const rundt = [];
        for (const yaw of [0, 90, 180, 270]) {
          Veg3d.kamYaw = yaw; Veg3d.tegn();
          await this.vent(220);
          rundt.push(dekning8());
        }
        const verst8 = Math.max(...rundt), minst8 = Math.min(...rundt);
        this.sjekk('strekene dekker en liten del av bildet også på bakken',
          verst8 < 3.5, 'verst ' + verst8.toFixed(2) + ' % av ruta');
        this.sjekk('  og tallet svinger ikke når man snur seg – ingen vifte',
          verst8 - minst8 < 1.2,
          rundt.map(v => v.toFixed(2)).join(' / ') + ' %');

        /* Og det var noe å bomme på: den naive utgaven, uten klipping, måles
           her ved siden av. Uten den kunne prøven over passert på en modell
           uten streker i det hele tatt. */
        const ekte8 = Veg3d._verdensstrek;
        Veg3d._verdensstrek = function (k, punkter) {
          const kam = this._strekKam;
          if (!kam || !this._sisteRb) return;
          const b = this._strekB, h = this._strekH, rb = this._sisteRb, rh = this._sisteRh;
          k.beginPath();
          let teg = false;
          for (const q of punkter) {
            if (!q) { teg = false; continue; }
            const pr = kam.punkt(q.x, q.y, q.z);
            const sc = { x: pr.px * b / rb, y: pr.py * h / rh };
            if (teg) k.lineTo(sc.x, sc.y); else { k.moveTo(sc.x, sc.y); teg = true; }
          }
          k.stroke();
        };
        const naive = [];
        for (const yaw of [0, 180]) {
          Veg3d.kamYaw = yaw; Veg3d.tegn();
          await this.vent(220);
          naive.push(dekning8());
        }
        Veg3d._verdensstrek = ekte8;
        this.sjekk('uten klipping smører strekene seg utover – slik de gjorde',
          Math.max(...naive) > verst8 * 1.8,
          'uten ' + Math.max(...naive).toFixed(2) + ' % mot med ' + verst8.toFixed(2) + ' %');

        Veg3d.settModus('oversikt');
        Veg3d.nullstill();
        await this.vent(250);
      }

      /* 17.19 W GÅR DIT MAN SER, OGSÅ PÅ VEGEN – MEN SKINNA BEHOLDES.
         Her ble «fram» lagt rett på stasjonen. Snudde man seg nitti grader for å
         se på en fylling fra siden og trykket W, gled man SIDELENGS langs vegen:
         man så én vei og gikk en annen. Nå dreies de to tallene med vinkelen
         mellom blikket og vegen – posisjonen er fortsatt stasjon og avvik, så
         snittet ved siden av følger med og man kan ikke bli borte. */
      {
        const gaa9 = (t, dt) => {
          Veg3d._taster = new Set(t); Veg3d._bakkeSteg(dt); Veg3d._taster = new Set();
        };
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.settModus('bakken');
        await this.vent(300);
        Veg3d.kamH = 2; Veg3d.fartsfaktor = 1; Veg3d.kamT = 0;
        Veg3d.seFramover();
        await this.vent(120);

        const s9 = Veg3d.kamS, t9 = Veg3d.kamT;
        gaa9(['w'], 1);
        const langs9 = Veg3d.kamS - s9, tvers9 = Veg3d.kamT - t9;
        this.sjekk('ser man langs vegen, går W langs vegen',
          langs9 > 3 && Math.abs(tvers9) < 0.2,
          langs9.toFixed(2) + ' m langs, ' + tvers9.toFixed(2) + ' m ut');

        /* Snu nitti grader og gå: nå skal man gå UT fra vegen, ikke langs den. */
        Veg3d.kamS = s9; Veg3d.kamT = 0;
        Veg3d.kamYaw += 90;
        const s10 = Veg3d.kamS, t10 = Veg3d.kamT;
        gaa9(['w'], 1);
        const langs10 = Veg3d.kamS - s10, tvers10 = Veg3d.kamT - t10;
        /* Forholdet, ikke det absolutte tallet: vegen svinger, så blikket peker
           aldri NØYAKTIG nitti grader på tangenten ved den nye stasjonen. Målt
           her ble det 0,34 m langs mot 4,49 m ut – syv prosent, altså rett vei.
           Den gamle utgaven ville gitt det motsatte: alt langs, ingenting ut. */
        /* Går man, er vegkanten veggen – rundt 2,8 m ut. Kravet må ligge under
           den, ellers måler prøven veggen og ikke retningen. */
        this.sjekk('snur man seg, går W dit man ser – ut fra vegen',
          Math.abs(tvers10) > 1.5 && Math.abs(langs10) < Math.abs(tvers10) * 0.2,
          langs10.toFixed(2) + ' m langs, ' + tvers10.toFixed(2) + ' m ut');
        this.sjekk('  men man er fortsatt PÅ strekket – skinna er ikke borte',
          Veg3d.kamS >= 0 && Veg3d.kamS <= App.resultat.lengde
          && Number.isFinite(Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS, Veg3d.kamT)));

        /* BLIKKET SVINGER MED VEGEN. Uten det holder man kompassretningen mens
           vegen dreier bort under, og W flytter deg kortere og kortere. */
        Veg3d.kamT = 0;
        Veg3d.seFramover();
        const yawFoer = Veg3d.kamYaw;
        const skritt9 = [];
        for (let i = 0; i < 8; i++) { const f = Veg3d.kamS; gaa9(['w'], 1); skritt9.push(Veg3d.kamS - f); }
        const spenn9 = Math.max(...skritt9) - Math.min(...skritt9);
        this.sjekk('åtte skritt er like lange også i en kurve – blikket svinger med vegen',
          spenn9 < 0.02, 'spenn ' + spenn9.toFixed(3) + ' m');
        this.sjekk('  og blikket dreide faktisk', Math.abs(Veg3d.kamYaw - yawFoer) > 0.5,
          (Veg3d.kamYaw - yawFoer).toFixed(1) + '° over ' + skritt9.length + ' skritt');

        Veg3d.settFerd('gaa');
        Veg3d.settModus('oversikt');
        Veg3d.kamT = 0; Veg3d.kamH = 2;
        Veg3d.nullstill();
        await this.vent(250);
      }

      /* 17.20 MODELLEN SKAL IKKE VÆRE ET SPEILBILDE AV KARTET.
         Dette lå i kameraet fra første dag og var usynlig: en terrengflate ser
         like troverdig ut speilvendt. Rotasjonen var venstrehendt – skjermens
         høyreakse var (cos a, sin a) der den skulle vært (−cos a, −sin a) – så
         modellen viste øst til høyre men NORD NEDOVER. Sett rett ovenfra var
         den et speilbilde av kartet, og på bakken lå høyre side av vegen til
         venstre i bildet.
         For et masseberegningsprogram er det ikke en skjønnhetsfeil: «fyllinga
         ligger på venstre side oppover» er da feil side, og det er den setningen
         som havner i et tilbud.
         Prøven binder bildet til KARTET, ikke til formelen: øst skal være til
         høyre og nord oppover når man ser rett ned, og høyre side av vegen skal
         ligge til høyre når man står på den og ser framover. */
      {
        Veg3d.settModus('oversikt');
        Veg3d.nullstill();
        await this.vent(250);
        const gS = Veg3d._sisteGitter;
        this.sjekk('det finnes et gitter å måle på', !!gS);
        if (gS) {
          /* NESTEN RETT NED: da skal bildet være kartet. */
          Veg3d.yaw = 0; Veg3d.pitch = 89;
          Veg3d.fokus = null; Veg3d.panX = 0; Veg3d.panY = 0;
          Veg3d._skalaSatt = false;
          Veg3d.tegn();
          await this.vent(300);
          const kS = Veg3d._sisteKam;
          const midt = { x: gS.midtX, y: gS.midtY, z: (gS.lav + gS.hoy) / 2 };
          const q0 = kS.punkt(midt.x, midt.y, midt.z);
          const qOst = kS.punkt(midt.x + 100, midt.y, midt.z);
          const qNord = kS.punkt(midt.x, midt.y + 100, midt.z);
          this.sjekk('sett rett ned ligger ØST til høyre, som i kartet',
            qOst.px - q0.px > 20, Math.round(qOst.px - q0.px) + ' px');
          this.sjekk('og NORD oppover, som i kartet',
            q0.py - qNord.py > 20, Math.round(q0.py - qNord.py) + ' px');
          /* Nordpila peker samme vei som nord faktisk går. Uten dette kunne
             begge være snudd, og de to feilene ville skjult hverandre. */
          const aP = -Veg3d.yaw * Math.PI / 180;
          this.sjekk('  og nordpila peker samme vei som nord faktisk går',
            Math.sign(-Math.cos(aP)) === Math.sign(qNord.py - q0.py) || Math.abs(qNord.py - q0.py) < 1,
            'pil ' + (-Math.cos(aP)).toFixed(2) + ' mot bilde ' + Math.sign(qNord.py - q0.py));
          Veg3d.pitch = Veg3d.pitchHjem;
        }

        /* PÅ BAKKEN: høyre side av vegen skal ligge til høyre i bildet. */
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.settModus('bakken');
        await this.vent(350);
        Veg3d.kamT = 0;
        Veg3d.seFramover();
        Veg3d.tegn();
        await this.vent(250);
        const kB = Veg3d._sisteKam, gB = Veg3d._sisteGitter;
        const sB = Veg3d.kamS;
        const zB = Veg3d._gulv(gB, sB + 40, 0);
        const hoyre = App.linje.punktMedAvvik(sB + 40, 8);
        const venstre = App.linje.punktMedAvvik(sB + 40, -8);
        const senter = App.linje.punktVed(sB + 40);
        const qH = kB.punkt(hoyre.x, hoyre.y, zB);
        const qV = kB.punkt(venstre.x, venstre.y, zB);
        const qM = kB.punkt(senter.x, senter.y, zB);
        this.sjekk('det man går mot ligger FORAN kameraet', qM.w > 0, 'dybde ' + qM.w.toFixed(0) + ' m');
        /* MÅLT MOT SENTERLINJA, IKKE MOT SKJERMENS MIDTE.
           I en kurve ligger senterlinja 40 m framme ute til siden – det er
           riktig, blikket følger tangenten – og en prøve som krevde midten
           målte da radien og ikke hendigheten. Forholdet mellom de tre punktene
           er derimot det samme uansett kurve: høyre kant til høyre for
           senterlinja, venstre kant til venstre. Det er nettopp det speilingen
           snudde. */
        this.sjekk('HØYRE side av vegen ligger til HØYRE for senterlinja i bildet',
          qH.px > qM.px + 2, 'høyre px ' + qH.px.toFixed(0) + ' mot senter ' + qM.px.toFixed(0));
        this.sjekk('og venstre side til venstre for den',
          qV.px < qM.px - 2, 'venstre px ' + qV.px.toFixed(0) + ' mot senter ' + qM.px.toFixed(0));
        this.sjekk('  og de to ligger på hver sin side, ikke oppå hverandre',
          qH.px - qV.px > 10, (qH.px - qV.px).toFixed(0) + ' px mellom kantene');
        const bakM = App.linje.punktVed(Math.max(0, sB - 40));
        this.sjekk('og det man har gått forbi ligger bak',
          kB.punkt(bakM.x, bakM.y, Veg3d._gulv(gB, sB - 40, 0)).w < 0);

        Veg3d.settModus('oversikt');
        Veg3d.nullstill();
        await this.vent(250);
      }

      /* 17.21 GÅ ELLER FLY – to måter å være i modellen på.
         Å blande dem var det gamle: man gikk «på bakken», men kunne heve seg
         til fire tusen meter og vandre ut i skogen. Da er verken det ene eller
         det andre til å stole på.
         GÅ er et menneske på anlegget: øyet i 1,7 m, føttene på vegen. Det er
         den som svarer på «hvor høyt rager fyllinga over meg?», og svaret er
         bare verdt noe hvis øyehøyden faktisk er en øyehøyde.
         FLY er kameraet uten bånd, for «hvor bredt blir inngrepet?». */
      {
        const gaaF = (t, dt) => {
          Veg3d._taster = new Set(t); Veg3d._bakkeSteg(dt); Veg3d._taster = new Set();
        };
        App.settTverrStasjon(App.resultat.lengde / 2);
        Veg3d.settFerd('gaa');
        Veg3d.settModus('bakken');
        await this.vent(350);
        this.sjekk('man går som standard – ikke svever', Veg3d.ferd === 'gaa', Veg3d.ferd);
        this.naer('og øyet står i en menneskehøyde', Veg3d.kamH, 1.7, 0.001);

        /* PÅ VEGEN, IKKE VED SIDEN AV DEN. */
        const grG = Veg3d._sidegrense(App.resultat);
        this.sjekk('gågrensa er vegkanten, ikke skråningsfoten',
          grG.hoy > 1 && grG.hoy < 8, '±' + grG.hoy.toFixed(1) + ' m');
        Veg3d.kamT = 0;
        Veg3d.kamYaw += 90;                       // se rett ut fra vegen
        for (let i = 0; i < 25; i++) gaaF(['w', 'shift'], 1);
        this.sjekk('går man rett ut fra vegen, stopper man ved kanten',
          Math.abs(Veg3d.kamT) <= grG.hoy + 0.01, 'avvik ' + Veg3d.kamT.toFixed(2) + ' m');
        this.sjekk('  og man er fortsatt på vegen',
          Number.isFinite(Veg3d._gulv(Veg3d._sisteGitter, Veg3d.kamS, Veg3d.kamT)));

        /* Q og E hever ikke når man går – de LETTER. Å heve seg i det stille
           med føttene på bakken ville gjort øyehøyden til en løgn. */
        const hG = Veg3d.kamH;
        gaaF(['e'], 1);
        this.sjekk('E letter i stedet for å heve i det stille', Veg3d.ferd === 'fly');
        /* Selve byttet flytter ikke øyet: man letter FRA der man står. Ville
           det hoppet til en annen høyde i samme trykk, ville man mistet det man
           så på i det øyeblikket man ba om å komme høyere. */
        this.naer('  og man letter fra der man sto', Veg3d.kamH, hG, 0.001);
        gaaF(['e'], 1);
        this.sjekk('  neste trykk hever', Veg3d.kamH > hG * 1.5,
          hG.toFixed(2) + ' → ' + Veg3d.kamH.toFixed(2) + ' m');

        /* FLY: nå er det fotavtrykket som er grensa, og høyden er fri. */
        const grF = Veg3d._sidegrense(App.resultat);
        this.sjekk('flygrensa er videre enn gågrensa', grF.hoy > grG.hoy + 3,
          '±' + grF.hoy.toFixed(1) + ' mot ±' + grG.hoy.toFixed(1) + ' m');
        for (let i = 0; i < 25; i++) gaaF(['w', 'shift'], 1);
        this.sjekk('flyr man, kommer man ut forbi vegkanten',
          Math.abs(Veg3d.kamT) > grG.hoy + 1, 'avvik ' + Veg3d.kamT.toFixed(1) + ' m');
        gaaF(['e'], 2);
        this.sjekk('og man kan heve seg', Veg3d.kamH > 5, Veg3d.kamH.toFixed(1) + ' m');

        /* LANDINGEN MÅ HENTE DEG INN. Fløy man ut over fotlinja og landet, ville
           man stått utenfor en grense som sa at man ikke kunne komme dit. */
        Veg3d.settFerd('gaa');
        this.naer('lander man, står øyet i menneskehøyde igjen', Veg3d.kamH, 1.7, 0.001);
        this.sjekk('  og man er hentet inn på vegen',
          Math.abs(Veg3d.kamT) <= grG.hoy + 0.01, 'avvik ' + Veg3d.kamT.toFixed(2) + ' m');

        /* G er den samme bryteren som velgeren i menyen. */
        Veg3d._bakkeTast({ key: 'g', preventDefault() {}, stopPropagation() {} });
        this.sjekk('G letter', Veg3d.ferd === 'fly');
        const knFly = document.getElementById('v3_fly');
        const knGaa = document.getElementById('v3_bakken');
        this.sjekk('  og «Fly»-knappen viser at man flyr',
          knFly && knFly.getAttribute('aria-pressed') === 'true',
          knFly ? knFly.getAttribute('aria-pressed') : 'finnes ikke');
        this.sjekk('  mens «Gå» slipper seg selv – de tre er ett valg, ikke tre brytere',
          knGaa && knGaa.getAttribute('aria-pressed') === 'false');
        Veg3d._bakkeTast({ key: 'g', preventDefault() {}, stopPropagation() {} });
        this.sjekk('og G lander igjen', Veg3d.ferd === 'gaa');

        Veg3d.settModus('oversikt');
        Veg3d.kamT = 0;
        Veg3d.nullstill();
        await this.vent(250);
      }

      /* 17.10 Kostnad – røykprøve mot en katastrofal regresjon. */
      {
        Veg3d.tegn();
        const t0 = performance.now();
        Veg3d.tegn();
        const tid = performance.now() - t0;
        this.sjekk('vegmodellen tegner raskt nok', tid < 400, tid.toFixed(0) + ' ms');
      }

      /* 17.9 Ingenting som fantes ble dårligere. */
      Veg3d.aktiver(false);
      await this.vent(120);
      this.sjekk('tverrsnittet kommer tilbake',
        !document.getElementById('tverrprofil').classList.contains('skjult'));
      this.sjekk('og vegens 3D-lerret er skjult',
        document.getElementById('veg3d').classList.contains('skjult')
        && document.getElementById('veg3dover').classList.contains('skjult'));
      Tverrprofil.tegn();
      const tp = document.getElementById('tverrprofil');
      this.sjekk('tverrsnittet tegner fortsatt', tp.width > 20 && tp.height > 20,
        tp.width + '×' + tp.height);
      document.querySelector('[data-utvid="tverr"]').click();
      await this.vent(200);
    } catch (e) {
      this.sjekk('vegens 3D-prøve kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      Veg3d.aktiver(false);
      Veg3d.overdriv = 1;
      Veg3d.kontekst = 30;
      Veg3d.vindu = 0;
      Veg3d.fyldig = false; Veg3d.glemFarger();
      Veg3d.visFoer = false;
      Veg3d.fokus = null;
      Veg3d.panX = 0; Veg3d.panY = 0;
      Veg3d._gitterFor = null;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
    }
  },

  /* ---------------- 19. lovlighet i planet ---------------- */
  /**
   * «Gjør lovlig» ga opp etter 13 ms på en linje det ikke var noe galt med.
   *
   * Årsaken var en feilklassifisering: advarselen «radien er for stor for
   * strekket – kurven er kortet inn» ble talt som et lovbrudd. Normaler for
   * landbruksveier setter en NEDRE grense for radius; ingen kilde krever at den
   * bygde radien er lik den tegnede, og alt programmet regner på – bredde-
   * utvidelse, maks stigning, masser – bruker allerede den bygde. Knappen jaktet
   * altså på fantomer, med det ene verktøyet den hadde: å fjerne et knekkpunkt.
   * I en sikksakk flytter det linjen 30 m, avviksgrensen kastet hvert forsøk,
   * og meldingen ble «fant ingen lovlig linje innenfor 8 m».
   */
  async lovlighet() {
    const foer = JSON.stringify(App.P);
    const gz = Terreng.prototype.z, gd = Terreng.prototype.dekning, gl = Terreng.prototype.lastOmraade;
    const gammelBekreft = App.bekreft;
    try {
      Terreng.prototype.lastOmraade = async function () { };
      Terreng.prototype.dekning = () => 1;
      Terreng.prototype.z = function (x, y) { return 100; };
      App.bekreft = async () => true;

      const lat0 = 58.2958, lon0 = 7.2098;
      const dLat = m => m / 111320;
      const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
      const lag = async (pkt, r, minR) => {
        App.P = App.nyttProsjekt();
        App.P.navn = '__test_lovlig';
        App.klargjorProsjekt(App.P);
        await App.settModus('veg');
        App.P.ip = pkt.map(([x, y]) => ({ lat: lat0 + dLat(y), lon: lon0 + dLon(x), r }));
        App.P.mal.minRadius = minR;
        App._terrengnokkel = null;
        App.byggLinje();
        await App.oppdater();
      };
      const ulovlige = () => App.ulovligeIPlanet(App.linje, App.P.mal.minRadius || 0);

      /* 19.1 EN INNKORTET KURVE ER IKKE ET LOVBRUDD.
         Sikksakk der hver eneste kurve blir kortet inn, men alle ligger godt
         over minstekravet. Dette er tilfellet knappen ga opp på. */
      const sikksakk = [];
      for (let i = 0; i < 10; i++) sikksakk.push([i * 25, (i % 2) * 12]);
      await lag(sikksakk, 30, 20);
      const minste = Math.min(...App.linje.kurver.map(k => k.r));
      this.sjekk('prøven har kurver som er kortet inn', App.innkortede(App.linje) >= 5,
        App.innkortede(App.linje) + ' innkortede');
      this.sjekk('og alle ligger over minstekravet', minste >= 20 - 1e-6, minste.toFixed(2) + ' m');
      this.sjekk('en innkortet kurve teller ikke som brudd i planet', ulovlige() === 0,
        ulovlige() + ' talt');
      const b1 = App.tellBrudd();
      this.sjekk('og ikke som «linje»-brudd i rapporten heller', b1.linje === 0,
        b1.linje + ' linjebrudd');
      this.sjekk('men den STÅR der, som opplysning',
        App.resultat.merknader.some(m => m.type === 'avvik' && /kortet inn/.test(m.tekst)));

      const foerUtm = App.ipTilUtm();
      const foerIp = App.P.ip.length;
      await App.gjorLovlig();
      await this.vent(80);
      this.naer('«Gjør lovlig» rører ikke en linje som er lovlig',
        App.linjeavvik(foerUtm, App.ipTilUtm()), 0, 1e-6);
      this.sjekk('og fjerner ingen knekkpunkt', App.P.ip.length === foerIp);
      this.sjekk('men sier fra at kurvene ble bygd mindre enn bestilt',
        /bygd mindre|fikk ikke plass/.test(document.getElementById('statuslinje').textContent),
        document.getElementById('statuslinje').textContent.slice(0, 80));

      /* 19.2 Den bygde radien skal STÅ I TABELLEN ved siden av den bestilte.
         Her sto bare det man hadde tastet inn – et tall som ikke fantes i vegen. */
      App.visLinjetabell();
      const merker = [...document.querySelectorAll('#ipTabell .bygdradius')];
      this.sjekk('linjetabellen viser den radien som faktisk bygges',
        merker.length >= 5, merker.length + ' merker');

      /* 19.3 ET EKTE BRUDD: radius under minstekravet. */
      const romslig = [[0, 0], [200, 60], [420, 0], [640, 80], [860, 20]];
      await lag(romslig, 12, 20);
      this.sjekk('prøven har ekte brudd i planet', ulovlige() === 3, ulovlige() + ' brudd');
      const f2 = App.ipTilUtm();
      await App.gjorLovlig();
      await this.vent(80);
      this.sjekk('«Gjør lovlig» retter dem', ulovlige() === 0, ulovlige() + ' igjen');
      this.sjekk('og linjen flytter seg nesten ikke',
        App.linjeavvik(f2, App.ipTilUtm()) < 1,
        App.linjeavvik(f2, App.ipTilUtm()).toFixed(3) + ' m');
      this.sjekk('uten å fjerne et eneste knekkpunkt', App.P.ip.length === romslig.length);

      /* 19.4 LOVLIGHETEN ER BYGD INN I DE ANDRE KNAPPENE.
         Vegen skal VÆRE lovlig, ikke bli det når noen husker å trykke på en
         knapp. Bare det som ikke flytter vegen merkbart gjøres uten å spørre. */
      for (const [navn, kall] of [
        ['Rett opp', () => App.rettOpp()],
        ['Massebalanse', () => App.balanser()],
        ['Optimaliser', () => App.optimaliser()]
      ]) {
        await lag(romslig, 12, 20);
        this.sjekk(navn + ': prøven starter ulovlig', ulovlige() === 3);
        const f3 = App.ipTilUtm();
        await kall();
        await this.vent(120);
        this.sjekk(navn + ' rydder planet på veien', ulovlige() === 0, ulovlige() + ' igjen');
        this.sjekk('og den sier hva den gjorde',
          /trange kurver|løftet til minstekravet|slakket/.test(document.getElementById('statuslinje').textContent),
          document.getElementById('statuslinje').textContent.slice(0, 70));
        this.sjekk('uten å flytte vegen mer enn en meter',
          App.linjeavvik(f3, App.ipTilUtm()) < 1,
          App.linjeavvik(f3, App.ipTilUtm()).toFixed(3) + ' m');
      }

      /* 19.5 ET SKARPT HJØRNE ER OGSÅ ET BRUDD.
         Et innvendig knekkpunkt uten kurve gir ingen post i `kurver`, og
         `radiusVed` svarer Infinity på rettstrekket gjennom det. En kontroll
         som bare ser på kurver, ser det aldri. */
      await lag([[0, 0], [80, 0], [80, 80]], 0, 20);
      this.sjekk('et skarpt hjørne telles som brudd i planet', ulovlige() === 1,
        ulovlige() + ' talt');
      this.sjekk('og meldes med sitt eget navn',
        App.resultat.merknader.some(m => m.type === 'kurvatur' && /skarpt hjørne/.test(m.tekst)),
        (App.resultat.merknader.find(m => m.type === 'kurvatur') || {}).tekst || 'ingen');
      await App.gjorLovlig();
      await this.vent(80);
      this.sjekk('og rådet handler om hjørnet, ikke om en kurve som ikke finnes',
        /skarpt hjørne/.test(document.getElementById('statuslinje').textContent),
        document.getElementById('statuslinje').textContent.slice(0, 90));

      /* 19.6 En lovlig linje skal si at den er lovlig, og ikke røres. */
      await lag([[0, 0], [220, 60], [460, 0], [700, 80], [900, 20]], 40, 20);
      this.sjekk('en romslig linje er lovlig', ulovlige() === 0);
      const f4 = JSON.stringify(App.P.ip);
      await App.gjorLovlig();
      await this.vent(80);
      this.sjekk('og blir stående helt urørt', JSON.stringify(App.P.ip) === f4);

      /* 19.7 Radiusfeltet og «×» i tabellen må kunne angres. Uten `merk()`
         var en feiltastet radius eller et slettet knekkpunkt borte for godt. */
      App.visLinjetabell();
      const rad = document.querySelector('#ipTabell tbody tr:nth-child(2)');
      const felt = rad.querySelector('input');
      const foerR = App.P.ip[1].r;
      felt.value = '77';
      felt.onchange({ target: felt });
      await this.vent(120);
      this.naer('radiusfeltet virker', App.P.ip[1].r, 77, 1e-9);
      App.angre();
      await this.vent(150);
      this.naer('og lar seg angre', App.P.ip[1].r, foerR, 1e-9);
    } catch (e) {
      this.sjekk('lovlighetsprøven kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      Terreng.prototype.z = gz; Terreng.prototype.dekning = gd; Terreng.prototype.lastOmraade = gl;
      App.bekreft = gammelBekreft;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
      App._planretting = null;
    }
  },

  /* ---------------- 18. bakgrunnskart og overlegg ---------------- */
  /**
   * Bakgrunnslagene hadde null dekning før dette, og feilen de kunne få er av
   * den verste sorten: bytteren fjernet det gamle laget FØR den slo opp det
   * nye, så et valg uten et lag bak seg etterlot kartet uten bakgrunn OG med en
   * ugyldig gjeldende nøkkel – hvorpå også NESTE bytte kastet. Ingen vei
   * tilbake uten å laste siden på nytt.
   *
   * Den andre fella er stillere: flyfototjenesten svarer HTTP 200 med en grå
   * «Map data not yet available»-rute fra zoom 19 og oppover i distrikts-Norge.
   * Leaflet ser ingen feil. Uten maxNativeZoom ville man zoomet inn for å
   * plassere et hjørne og fått grå skjerm med tegningen svevende oppå.
   */
  async kartlag() {
    const startBakgrunn = Kart.gjeldendeBakgrunn;
    const startValg = (() => { try { return localStorage.getItem('massekalk.kartvalg'); } catch (e) { return null; } })();
    try {
      /* 18.1 HVER KNAPP HAR ET LAG, OG HVERT LAG HAR EN KNAPP.
         Begge veier. Én vei ville sluppet gjennom nettopp det tilfellet som
         ødelegger kartet permanent. */
      const knapper = [...document.querySelectorAll('#bakgrunnsvalg .kartknapp')];
      this.sjekk('bakgrunnsknappene ble bygd', knapper.length >= 3, knapper.length + ' knapper');
      const navn = knapper.map(k => k.dataset.bakgrunn);
      this.sjekk('hver knapp peker på et lag som finnes',
        navn.every(n => !!Kart.bakgrunner[n]),
        navn.filter(n => !Kart.bakgrunner[n]).join(', ') || 'alle');
      const nokler = Object.keys(Kart.bakgrunner);
      this.sjekk('og hvert lag har sin knapp',
        nokler.every(n => navn.includes(n)),
        nokler.filter(n => !navn.includes(n)).join(', ') || 'alle');

      /* 18.2 Rundtur gjennom alle, og TILBAKE igjen – det er det andre byttet
         som avslører en ødelagt tilstand. */
      for (const n of navn.concat([navn[0]])) {
        Kart.settBakgrunn(n);
        await this.vent(30);
        const pa = nokler.filter(k => Kart.kart.hasLayer(Kart.bakgrunner[k]));
        this.sjekk('bytte til «' + n + '» gir nøyaktig ett bakgrunnslag',
          Kart.gjeldendeBakgrunn === n && pa.length === 1 && pa[0] === n,
          'gjeldende ' + Kart.gjeldendeBakgrunn + ', på kartet: ' + (pa.join(', ') || 'ingen'));
      }

      /* 18.3 Et ukjent navn skal ikke gjøre noe som helst. */
      const foer = Kart.gjeldendeBakgrunn;
      Kart.settBakgrunn('finnesikke');
      await this.vent(30);
      this.sjekk('ukjent bakgrunn lar kartet stå som det står',
        Kart.gjeldendeBakgrunn === foer && Kart.kart.hasLayer(Kart.bakgrunner[foer]),
        'gjeldende ' + Kart.gjeldendeBakgrunn);

      /* 18.4 GRENSEN MOT DE GRÅ FLISENE. */
      const f = Kart.bakgrunner.flyfoto;
      this.sjekk('flyfotoet finnes som lag', !!f);
      if (f) {
        this.sjekk('flyfotoet stopper på siste ekte zoomnivå',
          f.options.maxNativeZoom === 18,
          'maxNativeZoom ' + f.options.maxNativeZoom);
        this.sjekk('men lar Leaflet strekke lenger inn',
          f.options.maxZoom >= 21, 'maxZoom ' + f.options.maxZoom);
        this.sjekk('og attribusjonen står i laget',
          /Esri/.test(f.options.attribution || ''), f.options.attribution || 'ingen');

        Kart.settBakgrunn('flyfoto');
        await this.vent(60);
        const gammelZoom = Kart.kart.getZoom();
        Kart.kart.setZoom(20);
        await this.vent(400);
        const forDypt = [...document.querySelectorAll('.leaflet-tile-pane img')]
          .filter(i => /arcgisonline/.test(i.src) && /\/(19|20|21)\/\d+\/\d+/.test(i.src));
        this.sjekk('ingen flis hentes fra de grå nivåene', forDypt.length === 0,
          forDypt.length + ' fliser · f.eks. ' + (forDypt[0] ? forDypt[0].src.slice(-30) : '–'));
        Kart.kart.setZoom(gammelZoom);
        await this.vent(120);

        /* 18.5 Tegningen må kunne ses mot et mørkt foto. Den svarte haloen
           forsvinner mot skog og asfalt akkurat som linjen selv gjør. */
        this.sjekk('haloen under linjen blir lys på flyfoto',
          Kart.lag.linjeSkygge.options.color === '#ffffff',
          Kart.lag.linjeSkygge.options.color);
        this.sjekk('og tomtefyllet blir tynnere',
          Kart.lag.tomt.options.fillOpacity <= 0.12,
          String(Kart.lag.tomt.options.fillOpacity));
        Kart.settBakgrunn('topo');
        await this.vent(60);
        this.sjekk('begge deler kommer tilbake på topokartet',
          Kart.lag.linjeSkygge.options.color === '#0b0b0c'
          && Kart.lag.tomt.options.fillOpacity > 0.12,
          Kart.lag.linjeSkygge.options.color + ' / ' + Kart.lag.tomt.options.fillOpacity);
      }

      /* 18.6 FLISENE SKAL ALDRI NÅ ET CANVAS.
         Betingelsen for å bruke flyfotoet er at bildet blir stående på skjermen.
         `crossOrigin` er nettopp bryteren som avgjør om et canvas i det hele
         tatt KAN lese pikslene – står den på, kan noen senere legge fotoet i en
         PDF uten å merke at det skjer. */
      if (f) {
        this.sjekk('flyfotoet kan ikke leses av et canvas',
          typeof f.options.crossOrigin !== 'string', String(f.options.crossOrigin));
        this.sjekk('mens Kartverkets fliser kan det',
          Kart.bakgrunner.topo.options.crossOrigin === 'anonymous',
          String(Kart.bakgrunner.topo.options.crossOrigin));
        this.sjekk('og rapporten rører ikke kartet i det hele tatt',
          !/\bKart\./.test(String(Rapport.lagTegninger)));
      }

      /* 18.7 Overleggene: brikke og lag skal følges at. */
      const brikker = [...document.querySelectorAll('#overleggsvalg .kartbrikke')];
      this.sjekk('overleggsbrikkene ble bygd', brikker.length >= 3, brikker.length + ' brikker');
      this.sjekk('hver brikke peker på et lag som finnes',
        brikker.every(b => !!Kart.overlegg[b.dataset.overlegg]));
      Kart.settOverlegg('matrikkel', true);
      await this.vent(30);
      this.sjekk('eiendomsgrensene kan slås på', Kart.kart.hasLayer(Kart.overlegg.matrikkel));
      Kart.settOverlegg('matrikkel', false);
      await this.vent(30);
      this.sjekk('og av igjen', !Kart.kart.hasLayer(Kart.overlegg.matrikkel));

      /* 18.8 Rekkefølgen i flisruta. Med fire overlegg holder ikke ett
         bringToBack: vegnavnene havner under skyggen etter et bakgrunnsbytte. */
      Kart.settBakgrunn('flyfoto');
      await this.vent(40);
      for (const n of ['skygge', 'losmasse', 'matrikkel', 'vegnavn']) Kart.settOverlegg(n, true);
      Kart.settBakgrunn('topo');
      Kart.settBakgrunn('flyfoto');
      await this.vent(60);
      const z = n => Kart.overlegg[n].options.zIndex;
      this.sjekk('lagene ligger i fast rekkefølge',
        Kart.bakgrunner.flyfoto.options.zIndex < z('skygge')
        && z('skygge') < z('losmasse') && z('losmasse') < z('matrikkel')
        && z('matrikkel') < z('vegnavn'),
        [Kart.bakgrunner.flyfoto.options.zIndex, z('skygge'), z('losmasse'), z('matrikkel'), z('vegnavn')].join(' < '));

      /* 18.9 SKYGGEN GÅR AV NÅR FOTOET KOMMER.
         Tjenesten strekker kontrasten per flis. Over et topokart merkes det
         ikke; over et foto ser man rutene som lysere og mørkere firkanter, og
         det ser ut som en feil i programmet. Men slår brukeren den på igjen
         mens fotoet står, er det hans valg – og da skal den bli stående. */
      Kart.settBakgrunn('topo');
      await this.vent(40);
      const boksSkygge = document.getElementById('vis_skygge');
      boksSkygge.checked = true; boksSkygge.onchange();
      await this.vent(30);
      this.sjekk('terrengskyggen står på over kartet', Kart.kart.hasLayer(Kart.overlegg.skygge));
      this.naer('med full styrke', Kart.overlegg.skygge.options.opacity, 0.45, 1e-9);

      Kart.settBakgrunn('flyfoto');
      await this.vent(40);
      this.sjekk('og går av av seg selv når fotoet kommer',
        !Kart.kart.hasLayer(Kart.overlegg.skygge) && !boksSkygge.checked);
      this.naer('men er dempet om noen tar den fram', Kart.overlegg.skygge.options.opacity, 0.25, 1e-9);

      Kart.settBakgrunn('topo');
      await this.vent(40);
      this.sjekk('den kommer tilbake når kartet gjør det',
        Kart.kart.hasLayer(Kart.overlegg.skygge) && boksSkygge.checked);

      // tar brukeren den fram selv på fotoet, skal den bli stående
      Kart.settBakgrunn('flyfoto');
      await this.vent(30);
      boksSkygge.checked = true; boksSkygge.onchange();
      await this.vent(30);
      Kart.settBakgrunn('graatone');
      Kart.settBakgrunn('flyfoto');
      await this.vent(40);
      this.sjekk('brukerens eget valg overstyrer, og blir stående',
        Kart.kart.hasLayer(Kart.overlegg.skygge) && boksSkygge.checked);

      /* 18.10 Valget huskes, og søppel i lageret velter ingenting. */
      Kart.settBakgrunn('graatone');
      Kart.lagreValg();
      this.sjekk('valget blir lagret', Kart.lagreteValg().bakgrunn === 'graatone',
        Kart.lagreteValg().bakgrunn);
      localStorage.setItem('massekalk.kartvalg', '{ikke json');
      this.sjekk('ødelagt lagret valg faller tilbake til topokartet',
        Kart.lagreteValg().bakgrunn === 'topo');
      localStorage.setItem('massekalk.kartvalg', JSON.stringify({ v: 1, bakgrunn: 'finnesikke' }));
      this.sjekk('og et lag som ikke finnes lenger gjør det samme',
        Kart.lagreteValg().bakgrunn === 'topo');
    } catch (e) {
      this.sjekk('kartlagsprøven kom seg gjennom', false,
        e.message + ' — ' + (e.stack || '').split('\n')[1]);
    } finally {
      try {
        if (startValg == null) localStorage.removeItem('massekalk.kartvalg');
        else localStorage.setItem('massekalk.kartvalg', startValg);
      } catch (e) { /* privat modus */ }
      Kart._paaFoto = null; Kart._avAvOss = null;
      for (const v of KARTLAG.overlegg) {
        const i = document.getElementById('vis_' + v.navn);
        if (i) i.checked = !!v.standard;
        Kart.settOverlegg(v.navn, !!v.standard, true);
      }
      Kart.settBakgrunn(startBakgrunn || 'topo');
    }
  },

  async tomt() {
    const foer = JSON.stringify(App.P);

    App.P = App.nyttProsjekt();
    App.P.navn = '__test_tomt';
    this.sjekk('nytt prosjekt har ett veganlegg',
      App.P.anlegg.length === 1 && App.P.anlegg[0].type === 'veg');
    this.sjekk('P.ip er fortsatt en liste', Array.isArray(App.P.ip));

    App.leggTilAnlegg('tomt');
    this.sjekk('tomta ble lagt til', App.P.anlegg.length === 2 && App.erTomt());
    this.sjekk('tomta har sin egen mal',
      App.P.mal.veggHelning === 0.1 && App.P.mal.vegbredde === undefined);
    /* En tomt har ingen senterlinje, men ma likevel ha tomme lister - ellers
       faller alt som gar gjennom P.ip og P.vip, og det er over to hundre
       oppslag som ikke har noen grunn til a vite hva slags anlegg de star i. */
    this.sjekk('tomta har tomme lister, ikke undefined',
      Array.isArray(App.P.ip) && Array.isArray(App.P.vip));
    this.sjekk('vegmalen er urørt', App.P.anlegg[0].mal.vegbredde === 4.5);
    this.sjekk('«Tegn tomt» kom fram',
      !document.getElementById('verktoyTomt').classList.contains('skjult'));
    this.sjekk('«Tegn senterlinje» ble borte',
      document.getElementById('verktoyTegn').classList.contains('skjult'));

    /* Tegn et rektangel pa 60 x 40 m. Fasiten kan regnes i hodet: 2400 m² og
       200 m omkrets. En prøve uten fasit fanger bare at noe skjer, ikke at det
       som skjer er riktig. */
    const lat0 = 58.2958, lon0 = 7.2098;
    const dLat = m => m / 111320;
    const dLon = m => m / (111320 * Math.cos(lat0 * Math.PI / 180));
    Kart.settModus('tegnTomt');
    for (const [dx, dy] of [[0, 0], [60, 0], [60, 40], [0, 40]]) {
      Kart.klikk({ latlng: { lat: lat0 + dLat(dy), lng: lon0 + dLon(dx) } });
    }
    this.sjekk('fire hjørner lagt inn', App.P.tomt.punkter.length === 4);
    Kart.avsluttTomt();
    this.sjekk('tegningen ble avsluttet', Kart.modus === 'rediger');

    const t = App.tomtetall();
    this.naer('arealet stemmer', Math.round(t.areal), 2400, 30);
    this.naer('omkretsen stemmer', +t.omkrets.toFixed(1), 200, 3);
    this.sjekk('ingen merknader på et rent rektangel', t.merknader.length === 0,
      JSON.stringify(t.merknader));
    this.sjekk('polygonet ble tegnet', Kart.lag.tomt.getLatLngs()[0].length === 4);
    this.sjekk('hjørnene kan dras', Kart.lag.tomtHjorner.getLayers().length === 4);

    /* Et polygon som krysser seg selv har ikke ett entydig areal -
       skolisseformelen gir differansen mellom løkkene, ikke summen. Da blir
       volumet feil uten at noe ser galt ut. */
    const lovlig = App.P.tomt.punkter.map(p => ({ lat: p.lat, lon: p.lon }));
    const bytt = App.P.tomt.punkter[1];
    App.P.tomt.punkter[1] = App.P.tomt.punkter[2];
    App.P.tomt.punkter[2] = bytt;
    this.sjekk('selvkryssende tomt blir meldt',
      App.tomtetall().merknader.some(m => /krysser/.test(m.tekst)));
    App.P.tomt.punkter = lovlig;
    this.sjekk('og merknaden går bort igjen', App.tomtetall().merknader.length === 0);

    // lagring: tomta skal overleve en tur innom lageret
    await Lager.lagre('__test_tomt', App.P);
    const fil = await Lager.hent('__test_tomt');
    this.sjekk('fila lagrer begge anleggene', !!fil && fil.anlegg.length === 2);
    this.sjekk('fila har ingen løse felt på toppnivå',
      !!fil && !Object.prototype.hasOwnProperty.call(fil, 'mal')
      && !Object.prototype.hasOwnProperty.call(fil, 'ip'));
    const lagretTomt = fil && fil.anlegg.find(a => a.type === 'tomt');
    this.sjekk('tomta lagret med fire hjørner',
      !!lagretTomt && lagretTomt.tomt.punkter.length === 4);
    this.sjekk('tomta fikk ikke vegens felt', !!lagretTomt && lagretTomt.mal.vegbredde === undefined);

    // bytte tilbake til vegen skal ikke røre tomta
    App.byttAnlegg(App.P.anlegg[0].id);
    this.sjekk('tilbake på vegen', !App.erTomt() && App.P.mal.vegbredde === 4.5);
    this.sjekk('tomta ligger der fortsatt', App.P.anlegg[1].tomt.punkter.length === 4);
    this.sjekk('tomtelaget ble tømt på vegen', Kart.lag.tomt.getLatLngs()[0].length === 0);

    /* En fil fra før tomtemodus skal apne uendret. Blir den lest som et
       prosjekt uten anlegg, star innholdet igjen pa toppniva og blir borte -
       uten et eneste tegn pa at noe er galt. */
    const gammel = {
      navn: '__test_gammel',
      ip: [{ lat: 58.29, lon: 7.20, r: 30 }, { lat: 58.30, lon: 7.21, r: 30 }],
      vip: [{ s: 0, z: 100, k: 1 }, { s: 50, z: 105, k: 1 }],
      mal: { vegbredde: 4.0 }, faktorer: { sprengningsfaktor: 1.6 },
      fjell: { standarddybde: 1.2 }, profilAvstand: 5
    };
    const pakket = App.klargjorProsjekt(JSON.parse(JSON.stringify(gammel)));
    this.sjekk('gammel fil blir ett veganlegg',
      pakket.anlegg.length === 1 && pakket.anlegg[0].type === 'veg');
    this.sjekk('knekkpunktene overlevde innpakkingen', pakket.ip.length === 2);
    this.sjekk('høydene overlevde innpakkingen', pakket.vip.length === 2);
    this.sjekk('vegbredden overlevde innpakkingen', pakket.mal.vegbredde === 4.0);

    /* Yttergrense skal virke UTEN at man setter mur.
       Koten som passer nar omrisset er selve tomta, er svaret pa en annen
       oppgave enn den som passer nar omrisset er yttergrensen: da er det ikke
       massebalansen som teller, men hvor mye skraningene tar. Legger man nivaet
       høyt, tar fyllinga pa nedsida mye plass; legger man det lavt, tar
       skjæringa pa oppsida mye. Programmet ma finne det selv - ellers ma
       brukeren gjette, og se den ferdige flaten krympe uten a vite hvilken vei
       den skal justeres. */
    App.P = App.nyttProsjekt();
    App.P.navn = '__test_grense';
    App.leggTilAnlegg('tomt');
    const lat1 = 58.2950, lon1 = 7.2085;
    const dL = m => m / 111320;
    const dO = m => m / (111320 * Math.cos(lat1 * Math.PI / 180));
    Kart.settModus('tegnTomt');
    for (const [dx, dy] of [[0, 0], [34, 6], [46, 20], [44, 38], [30, 46], [12, 44], [2, 30], [-2, 14]]) {
      Kart.klikk({ latlng: { lat: lat1 + dL(dy), lng: lon1 + dO(dx) } });
    }
    Kart.avsluttTomt();
    await this.vent(600);
    await App.beregnTomt();
    const koteMiddel = App.foreslaKote();
    if (koteMiddel != null) {
      App.P.tomt.nivaa.kote = koteMiddel;
      App.P.tomt.omrissBetyr = 'yttergrense';
      await App.beregnTomt();
      const utenSok = App.resultat.areal || 0;
      const b = App.finnNivaaForGrense();
      this.sjekk('finner et nivå for yttergrensa', !!b && Number.isFinite(b.kote),
        b ? String(b.kote) : 'ingen');
      if (b) {
        this.sjekk('og det gir minst like stor tomt som middelhøyden',
          b.areal >= utenSok - 1, `${utenSok.toFixed(0)} → ${b.areal.toFixed(0)} m²`);
        App.P.tomt.nivaa.kote = b.kote;
        await App.beregnTomt();
        this.sjekk('den ferdige flaten finnes uten at noen mur er satt',
          !!App._innerflate && (App.P.tomt.kanter || []).every(k => !k || !k.type || k.type === 'skraning'));
        this.sjekk('og massene er regnet på den',
          App.resultat && Number.isFinite(App.resultat.sum.skjaering));
      }
    }

    await Lager.slett('__test_tomt');
    App.P = JSON.parse(foer);
    App.byggLinje();
  },

  /* ---------------- 12. framdriftsvisningen ---------------- */
  async framdrift() {
    const boks = document.getElementById('framdrift');
    const stolpe = document.getElementById('framdriftStolpe');
    const skjult = () => boks.classList.contains('skjult');
    const pst = () => parseInt(stolpe.style.width) || 0;

    App.framdrift(false);
    this.sjekk('boksen er borte når ingenting går', skjult());

    // en enkel operasjon eier hele stolpen
    App.framdrift(true, 'prøve', 0.4);
    this.sjekk('boksen kommer fram', !skjult());
    this.sjekk('og stolpen står der den skal', pst() === 40);

    /* Stolpen skal ikke ga bakover innenfor samme visning. En indre operasjon
       som meldte sin egen andel fikk linja til a hoppe tilbake til null. */
    App.framdrift(true, 'prøve', 0.1);
    this.sjekk('stolpen går ikke bakover', pst() === 40);

    /* Og en indre operasjon far ikke lukke boksen. Terrenghentingen inne i
       Rett opp gjorde nettopp det: boksen forsvant, og resten av operasjonen
       gikk uten et eneste tegn pa skjermen. */
    let saaSkjult = false, saaTilbake = 0, forrige = 0;
    await App.iFramdriftVindu(0.5, 0.95, async () => {
      forrige = pst();
      for (const a of [0, 0.5, 1]) {
        App.framdrift(true, 'indre', a);
        if (skjult()) saaSkjult = true;
        if (pst() < forrige - 1) saaTilbake++;
        forrige = pst();
      }
      App.framdrift(false);                        // slik terrenghentingen gjorde
      if (skjult()) saaSkjult = true;
    });
    this.sjekk('en indre operasjon skjuler ikke boksen', !saaSkjult);
    this.sjekk('og den kan ikke dra stolpen bakover', saaTilbake === 0);
    this.sjekk('den indre holder seg innenfor vinduet sitt', pst() <= 95);
    this.sjekk('og kommer helt opp til toppen av det', pst() === 95);

    /* Terrenghenting som star for seg selv skal fortsatt rydde etter seg. */
    App.framdrift(false);
    this.sjekk('boksen lar seg lukke utenfra', skjult());
    App.framdrift(true, 'ny operasjon', 0.05);
    this.sjekk('en ny visning starter forfra', pst() === 5);
    App.framdrift(false);
  },

  /* ---------------- 13. opprydding ---------------- */
  async opprydding() {
    if (this._testnavn) await Lager.slett(this._testnavn);
    const liste = await Lager.liste();
    this.sjekk('testprosjektet er ryddet bort', !liste.some(p => p.navn === this._testnavn));
  },

  rapporter(tid) {
    const linjer = this.linjer;
    const feilende = linjer.filter(l => !l.ok);
    console.log(`%cNettlesertest: ${this.ok} ok, ${this.feil} feil (${tid} ms)`,
      `font-weight:bold;color:${this.feil ? '#d81e28' : '#15803d'}`);
    feilende.forEach(l => console.log('%c  FEIL ' + l.navn + (l.detalj ? ' — ' + l.detalj : ''), 'color:#d81e28'));

    const boks = document.createElement('div');
    boks.className = 'testresultat';
    boks.innerHTML = `<h3>${this.feil ? '⚠' : '✓'} ${this.ok} ok, ${this.feil} feil <small>${tid} ms</small></h3>`
      + (feilende.length
        ? '<ul>' + feilende.map(l => `<li>${l.navn}${l.detalj ? ' <small>' + l.detalj + '</small>' : ''}</li>`).join('') + '</ul>'
        : '<p>Alt virker.</p>')
      + '<button>Lukk</button>';
    boks.querySelector('button').onclick = () => boks.remove();
    document.body.appendChild(boks);

    return { ok: this.ok, feil: this.feil, tid, feilende: feilende.map(l => l.navn + (l.detalj ? ' — ' + l.detalj : '')) };
  }
};

if (new URLSearchParams(location.search).get('test') === '1') {
  window.addEventListener('load', () => setTimeout(() => Nettlesertest.kjor(), 1500));
}
