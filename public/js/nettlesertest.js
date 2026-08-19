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
      await this.rapport();
      await this.paneler();
      await this.opprydding();
    } catch (e) {
      this.sjekk('testen kom seg gjennom uten å kaste', false, e.message + ' — ' + (e.stack || '').split('\n')[1]);
    }

    window.onerror = gammelFeil;
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

    const hentet = await Lager.hent(navn);
    this.sjekk('hentet prosjekt har samme knekkpunkt',
      hentet && hentet.ip.length === 2 && Math.abs(hentet.ip[1].r - 30) < 1e-9);

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
    const brudd = () => { const b = App.tellBrudd(App.vprofil); return b ? b.totalt : 0; };

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
    this.sjekk('stikningsdata har koordinater', /\d{6}\.\d{3};\d{6}\.\d{3}/.test(stikning));
    this.sjekk('ingen tomme tall i stikningsdata', !/;;|NaN/.test(stikning));

    const masser = ut[navn.find(n => n.includes('masser'))];
    this.sjekk('masseoppsettet har rader', masser.split('\r\n').length > 5);
    this.sjekk('ingen NaN i masseoppsettet', !/NaN/.test(masser));

    const geo = JSON.parse(ut[navn.find(n => n.endsWith('.geojson'))]);
    this.sjekk('geojson har senterlinje og fotavtrykk', geo.features.length >= 2);
    this.sjekk('koordinatene er lengde- og breddegrad',
      geo.features[0].geometry.coordinates.every(c => c[0] > 4 && c[0] < 32 && c[1] > 57 && c[1] < 72));
  },

  /* ---------------- 10. rapport ---------------- */
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

  /* ---------------- 12. opprydding ---------------- */
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
