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
      await this.tomt();
      await this.tomteksport();
      await this.tomterydding();
      await this.tomt3d();
      await this.veg3d();
      await this.framdrift();
      await this.opprydding();
    } catch (e) {
      this.sjekk('testen kom seg gjennom uten å kaste', false, e.message + ' — ' + (e.stack || '').split('\n')[1]);
    }

    window.onerror = gammelFeil;

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
    this.sjekk('overskriftene står i fila', alt.includes('MASSEBEREGNING') && alt.includes('SAMMENDRAG'));
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
        let treff = null;
        for (let y = 20; y < o.clientHeight - 20 && !treff; y += 7) {
          for (let x = 20; x < o.clientWidth - 20; x += 7) {
            const t = Veg3d._slaOpp({ x, y }, o);
            if (t && t.k >= 0) { treff = { x, y, k: t.k }; break; }
          }
        }
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
          this.sjekk('hjulet zoomer mot markøren, ikke mot midten',
            !!etter && etter.k === foer.k,
            'node ' + (foer ? foer.k : '-') + ' → ' + (etter ? etter.k : 'bakgrunn'));
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
        const c2 = document.getElementById('veg3d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const yaw0 = Veg3d.yaw;
        const skalaVed = v => {
          const f = Veg3d.yaw; Veg3d.yaw = v;
          const t = Veg3d._tilpassSkala(c2.clientWidth * dpr, c2.clientHeight * dpr, gg);
          Veg3d.yaw = f; return t.skala;
        };
        this.sjekk('utgangsstillingen er den som gjør modellen størst',
          skalaVed(yaw0) >= skalaVed(yaw0 + 90) - 1e-9,
          'valgt ' + skalaVed(yaw0).toFixed(3) + ' mot ' + skalaVed(yaw0 + 90).toFixed(3));
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
      Veg3d.panX = 0; Veg3d.panY = 0;
      Veg3d._gitterFor = null;
      App.P = JSON.parse(foer);
      App.klargjorProsjekt(App.P);
      App.resultat = null;
      App._terrengnokkel = null;
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
