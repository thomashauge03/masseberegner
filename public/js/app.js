'use strict';
/** Massekalk – binder sammen kart, profiler og beregning. */

const App = {
  P: null,
  sone: 32,
  linje: null,
  vprofil: null,
  terreng: null,
  terrengProfil: null,
  fjellmodell: null,
  resultat: null,
  tverrStasjon: 0,
  _tidsavbrudd: null,
  _terrengnokkel: '',

  /* ---------------- angre og gjør om ----------------
     Hele prosjektet tas vare pa som tekst før hver endring som er verdt a
     kunne angre. Det er grovt, men et prosjekt er noen fa kilobyte, og det
     som betyr noe er at man kommer helt tilbake - ikke bare halvveis.

     Tidligere angret knappen ved a fjerne siste knekkpunkt. Det er ikke a
     angre: hadde du nettopp flyttet et punkt eller endret en radius, slettet
     «Angre» et helt annet punkt i stedet for a ta tilbake det du gjorde. */
  historikk: { bakover: [], framover: [], grense: 60, _sist: '' },

  /**
   * Tar vare pa tilstanden slik den er akkurat na, før den endres.
   * @param {string} hva kort beskrivelse, vises i knappens hjelpetekst
   */
  merk(hva) {
    if (!this.P) return;
    const tekst = JSON.stringify(this.P);
    if (tekst === this.historikk._sist) return;     // ingenting har endret seg
    this.historikk._sist = tekst;
    this.historikk.bakover.push({ tekst, hva: hva || 'endring' });
    if (this.historikk.bakover.length > this.historikk.grense) this.historikk.bakover.shift();
    this.historikk.framover.length = 0;             // ny gren - det som la foran gjelder ikke lenger
    this.visAngreknapper();
    this.planleggAutolagring();
  },

  tomHistorikk() {
    this.historikk.bakover.length = 0;
    this.historikk.framover.length = 0;
    this.historikk._sist = this.P ? JSON.stringify(this.P) : '';
    this.visAngreknapper();
  },

  async _tilbakeTil(steg, fra, til) {
    if (!fra.length) return false;
    const na = JSON.stringify(this.P);
    const forrige = fra.pop();
    til.push({ tekst: na, hva: forrige.hva });
    this.P = JSON.parse(forrige.tekst);
    this.historikk._sist = forrige.tekst;
    this.visAnleggsvelger();          // angre kan ha byttet hvilket anlegg som er oppe
    this.byggLinje();
    this.vprofil = new Vertikalprofil(this.P.vip);
    this.malTilSkjema();
    Kart.tegn();
    this.visSonderinger();
    this.visLinjetabell();
    this.visHoydetabell();
    if (this.erTomt()) this.oppdaterTomtefelt();
    await this.oppdater();
    this.visAngreknapper();
    this.status(steg + ' «' + forrige.hva + '»');
    return true;
  },

  async angre() {
    if (!this.historikk.bakover.length) { this.status('Ingenting å angre'); return; }
    await this._tilbakeTil('Angret', this.historikk.bakover, this.historikk.framover);
  },

  async gjorOm() {
    if (!this.historikk.framover.length) { this.status('Ingenting å gjøre om'); return; }
    await this._tilbakeTil('Gjorde om', this.historikk.framover, this.historikk.bakover);
  },

  visAngreknapper() {
    const sett = (id, liste, ord) => {
      const k = document.getElementById(id);
      if (!k) return;
      k.disabled = !liste.length;
      k.title = liste.length ? ord + ' «' + liste[liste.length - 1].hva + '»' : 'Ingenting å ' + ord.toLowerCase();
    };
    sett('knappAngre', this.historikk.bakover, 'Angre');
    sett('knappGjorOm', this.historikk.framover, 'Gjør om');
  },

  nyttProsjekt() {
    return {
      navn: 'Nytt prosjekt',
      versjon: 2,
      aktivt: 'a1',
      anlegg: [this.nyttAnlegg('veg', 'Veg', 'a1')],
      standardRadius: 30,
      faktorer: Object.assign({}, StandardFaktorer),
      fjell: { standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [], soner: [] },
      tverrfall: [],            // egne fall per profil, satt i tverrprofilet
      profilAvstand: 5,
      bakkekorreksjon: true
    };
  },

  /* ---------------- anlegg ---------------- *
   *
   * Et prosjekt er en beholder med anlegg. Hvert anlegg er enten en veg eller
   * en tomt, og har sin egen mal. Det er dét som gjør at innstillingene ikke
   * blir uoversiktlige: det finnes ingen felles mal a bli forvirret av -
   * endrer man skjæringshelningen pa tomta, skjer ingenting med vegen.
   *
   * Fjellmodellen, faktorene og terrengdataene er felles. Fjellet ligger under
   * begge, og en sondering tatt pa tomta sier noe om vegen tretti meter unna;
   * to modeller ville gitt to forskjellige svar pa samme spørsmal.
   *
   * Massene holdes atskilt - hvert anlegg far sin egen oppstilling. Se
   * TOMTEMODUS-INNSTILLINGER.md.
   */

  nyttAnlegg(type, navn, id) {
    const a = {
      id: id || 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      type: type === 'tomt' ? 'tomt' : 'veg',
      navn: navn || (type === 'tomt' ? 'Tomt' : 'Veg')
    };
    if (a.type === 'tomt') {
      a.tomt = nyTomt();
      a.mal = Object.assign({}, StandardTomtemal);
      /* En tomt har ingen senterlinje, men den far tomme lister likevel.
         Alternativet var a la `P.ip` og `P.vip` vaere undefined pa en tomt, og
         da faller alt som gar gjennom dem - tegningen av kartet, lengde-
         profilen, øyeblikksbildet til Angre. Det er over to hundre oppslag, og
         ingen av dem har noen grunn til a vite hva slags anlegg de star i.
         Tomme lister er det samme som en veg uten knekkpunkt: ingenting a
         tegne, ingenting a regne, ingen feilmelding. */
      a.ip = [];
      a.vip = [];
    } else {
      a.ip = [];
      a.vip = [];
      a.mal = Object.assign({}, StandardMal);
    }
    return a;
  },

  /**
   * Gjør et prosjekt klart til bruk: pakker inn gamle filer, og setter opp
   * `ip`, `vip`, `mal` og `tomt` som vinduer inn i det aktive anlegget.
   *
   * De fire feltene slas opp over to hundre steder i programmet. A skrive om
   * alle sammen ville vaert bade stort og risikabelt, og det er unødvendig:
   * med aksessorer lander bade `P.ip.push(…)` og `P.vip = […]` riktig sted,
   * uten at et eneste oppslag ma røres.
   *
   * `enumerable: false` er nøkkelen. Feltene finnes for koden, men ikke for
   * lagringen - hverken JSON.stringify eller structuredClone tar dem med. Da
   * inneholder fila bare `anlegg`, ikke to sett av samme data som kan komme i
   * utakt.
   *
   * Merk: alt som gar gjennom Object.keys(P), for-in, Object.assign({}, P)
   * eller spredning ville mistet feltene. Programmet gjør ikke noe av det
   * noe sted, men det er verdt a huske om det endrer seg.
   */
  klargjorProsjekt(P) {
    if (!P) return P;
    /* Er `mal` eller `ip` en egen nøkkel pa prosjektet, er fila fra før
       tomtemodus. I den nye forma finnes de bare som ikke-tellbare aksessorer,
       og de blir aldri lagret - sa dette er et trygt kjennetegn.

       Sjekken kan ikke vaere "mangler anlegg". Apningen setter prosjektet
       sammen som Object.assign(nyttProsjekt(), fila), og da har resultatet
       alltid et anlegg - det tomme fra nyttProsjekt(). En gammel fil ville
       da fatt innholdet sitt kastet, uten et eneste tegn pa at noe var galt. */
    const eier = k => Object.prototype.hasOwnProperty.call(P, k);
    const gammelForm = eier('mal') || eier('ip') || eier('vip');
    if (gammelForm || !Array.isArray(P.anlegg) || !P.anlegg.length) {
      P.anlegg = [{
        id: 'a1', type: 'veg', navn: P.navn || 'Veg',
        ip: P.ip || [], vip: P.vip || [], mal: P.mal || Object.assign({}, StandardMal)
      }];
      P.aktivt = 'a1';
      P.versjon = 2;
    }
    for (const a of P.anlegg) {
      if (!a.type) a.type = a.tomt ? 'tomt' : 'veg';
      if (a.type === 'tomt') {
        a.mal = Object.assign({}, StandardTomtemal, a.mal || {});
        /* Nivaet ma flettes for seg. Object.assign gar bare ett niva ned, sa
           en lagret tomt ville byttet ut hele `nivaa` med sin egen - og felt
           som kom til etterpa ble undefined i stedet for a fa standardverdien.
           Da regnet et gammelt prosjekt med NaN uten a si fra. */
        const nivaa = Object.assign(nyTomt().nivaa, (a.tomt && a.tomt.nivaa) || {});
        a.tomt = Object.assign(nyTomt(), a.tomt || {});
        a.tomt.nivaa = nivaa;
        if (!Array.isArray(a.tomt.punkter)) a.tomt.punkter = [];
        if (!Array.isArray(a.tomt.kanter)) a.tomt.kanter = [];
        a.ip = a.ip || [];      // se nyttAnlegg: tomme lister, ikke undefined
        a.vip = a.vip || [];
      } else {
        // en vegmal fra en eldre fil kan ligge inne i anlegget ogsa
        a.mal = Object.assign({}, StandardMal, this.moderniserMal(a.mal || {}));
        a.ip = a.ip || [];
        a.vip = a.vip || [];
      }
    }
    if (!P.anlegg.some(a => a.id === P.aktivt)) P.aktivt = P.anlegg[0].id;

    const aktivt = () => P.anlegg.find(a => a.id === P.aktivt) || P.anlegg[0];
    for (const felt of ['ip', 'vip', 'mal', 'tomt']) {
      delete P[felt];                       // fjern verdien fra den gamle forma
      Object.defineProperty(P, felt, {
        configurable: true,
        enumerable: false,
        get() { return aktivt()[felt]; },
        set(v) { aktivt()[felt] = v; }
      });
    }
    return P;
  },

  /** Anlegget som er oppe i skjermen. */
  anlegg() { return this.P && this.P.anlegg ? this.P.anlegg.find(a => a.id === this.P.aktivt) || this.P.anlegg[0] : null; },

  /** Er det en tomt vi jobber med na? */
  erTomt() { const a = this.anlegg(); return !!a && a.type === 'tomt'; },

  /** Bytter hvilket anlegg som er oppe. */
  byttAnlegg(id) {
    if (!this.P.anlegg.some(a => a.id === id)) return;
    this.merk('bytt anlegg');
    this.P.aktivt = id;
    /* Terrengnøkkelen henger pa geometrien til det forrige anlegget. Uten a
       nullstille den ville programmet trodd at terrenget allerede var lastet
       for et helt annet sted pa kartet. */
    this._terrengnokkel = '';
    this.resultat = null;
    if (this.erTomt()) Kart.settModus(this.P.tomt.punkter.length ? 'rediger' : 'tegnTomt');
    else Kart.settModus('rediger');
    this.visAnleggsvelger();
    this.malTilSkjema();
    this.tegnAlt();
    if (this.erTomt()) this.tomtEndret();
    else this.planlegg(60);
  },

  /**
   * Legger til en tomt.
   *
   * Knappen spurte først om det skulle bli en veg eller en tomt, men den
   * dialogen har bare Ja og Avbryt - og "Avbryt" som svar pa "veg eller tomt"
   * betyr ingenting. Tomt er dessuten det man legger til; en veg til i samme
   * prosjekt er sjeldnere, og den far sin egen vei inn nar anleggslisten
   * kommer.
   */
  velgNyttAnlegg() { this.leggTilAnlegg('tomt'); },

  /** Legger til et anlegg og gar rett til det. */
  leggTilAnlegg(type) {
    this.merk('nytt anlegg');
    const brukt = this.P.anlegg.filter(a => a.type === type).length;
    const a = this.nyttAnlegg(type, (type === 'tomt' ? 'Tomt ' : 'Veg ') + (brukt + 1));
    this.P.anlegg.push(a);
    this.byttAnlegg(a.id);
    this.status(type === 'tomt'
      ? 'Ny tomt. Klikk rundt den i kartet, dobbeltklikk for å lukke.'
      : 'Ny veg. Velg «Tegn senterlinje» og klikk i kartet.');
  },

  /**
   * Bytter mellom vegbildet og tomtebildet.
   *
   * Her sto det en anleggsvelger nede i kartverktøylinja, og resten av skjermen
   * ble staende som den var med noen knapper skjult. Det ble rotete: lengde-
   * profil og tverrprofil hører til en senterlinje som ikke finnes pa en tomt,
   * og de sto igjen halvtomme. Na er det to arbeidsbilder, og valget mellom dem
   * ligger øverst der man ser det.
   */
  async settModus(type) {
    if (!this.P) return;
    let a = this.P.anlegg.find(x => x.type === type && x.id === this.P.aktivt)
      || this.P.anlegg.find(x => x.type === type);
    if (!a) { this.leggTilAnlegg(type); return; }
    if (a.id !== this.P.aktivt) this.byttAnlegg(a.id);
    else this.visAnleggsvelger();
    if (type === 'tomt') await this.beregnTomt();
  },

  /** Viser riktig arbeidsbilde for det anlegget som er oppe. */
  visAnleggsvelger() {
    if (!this.P) return;
    const tomt = this.erTomt();
    document.querySelector('.rute').classList.toggle('tomtemodus', tomt);
    const m = (id, pa) => { const e = document.getElementById(id); if (e) e.classList.toggle('aktiv', pa); };
    m('modusVeg', !tomt);
    m('modusTomt', tomt);
    const bytt = (id, vis) => { const e = document.getElementById(id); if (e) e.classList.toggle('skjult', !vis); };
    bytt('verktoyTegn', !tomt);
    bytt('verktoyTomt', tomt);
    if (tomt) { this.tomtTilSkjema(); this.visTomtemasser(); }
  },

  /* ---------------- tomtas skjema ---------------- */

  tomtTilSkjema() {
    if (!this.erTomt()) return;
    const t = this.P.tomt, n = t.nivaa, mal = this.P.mal;
    const sett = (id, v) => { const e = document.getElementById(id); if (e && document.activeElement !== e) e.value = v; };
    /* Bare `tm_kote` finnes i verktøylinja. Fall, fallretning, nivåmodus og
       rutestørrelse ble flyttet til Høyde-fanen, men oppslagene ble stående
       her og traff `null` hver eneste gang. */
    sett('tm_kote', n.kote == null ? '' : n.kote.toFixed(2));
    this.visKanttabell();
    this.visSnittvelger();
  },

  /**
   * Leser den ferdige koten fra verktøylinja under snittet.
   *
   * FIRE FELT SOM IKKE FANTES, OG ETT AV DEM ØDELA DATA.
   * Denne leste `tm_nivaamodus`, `tm_fall`, `tm_fallretning` og
   * `tm_rutestorrelse` – ingen av dem finnes i DOM-en. Tre av oppslagene falt
   * bare tilbake på sin egen verdi og var harmløse. Det fjerde var det ikke:
   *
   *     n.fall = Math.max(0, tall('tm_fall', (n.fall || 0.02) * 100)) / 100;
   *
   * `n.fall || 0.02` gjør 0 om til 0,02. Satte man fallet til null i
   * Høyde-fanen og deretter rørte koten i verktøylinja, kom det stille tilbake
   * som 2 %. Feltet i skjemaet viste fortsatt 0.
   */
  skjemaTilTomt() {
    if (!this.erTomt()) return;
    const t = this.P.tomt, n = t.nivaa;
    const koteFelt = document.getElementById('tm_kote');
    if (koteFelt) {
      const k = parseFloat(koteFelt.value);
      n.kote = Number.isFinite(k) ? k : null;
    }
  },

  /**
   * Foreslår en kote ut fra terrenget.
   *
   * Middelhøyden over tomta er utgangspunktet: da blir det omtrent like mye a
   * grave som a fylle, og massene har en sjanse til a ga opp. Overbygningen
   * legges pa toppen, sa den foreslatte koten er der man kjører - ikke der
   * jordarbeidet slutter.
   */
  foreslaKote() {
    if (!this.erTomt()) return null;
    const p = this.tomtIUtm();
    if (p.length < 3 || !this.terreng) return null;
    let sum = 0, n = 0;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (const q of p) {
      minX = Math.min(minX, q.x); maksX = Math.max(maksX, q.x);
      minY = Math.min(minY, q.y); maksY = Math.max(maksY, q.y);
    }
    for (let y = minY; y <= maksY; y += 1) {
      for (let x = minX; x <= maksX; x += 1) {
        if (!Tomtmasser.innenforPolygon(p, x, y)) continue;
        const z = this.terreng.z(x, y);
        if (Number.isFinite(z)) { sum += z; n++; }
      }
    }
    if (!n) return null;
    const mal = this.P.mal;
    const ob = (mal.slitelagTykkelse || 0) + (mal.baerelagTykkelse || 0)
      + (mal.forsterkningslag || 0) + (mal.frostsikring || 0) + (mal.avrettingslag || 0);
    return +(sum / n + ob).toFixed(2);
  },

  /**
   * Finner nivået som gir størst ferdig flate innenfor yttergrensa.
   *
   * Dette er den omvendte oppgaven, og den har ikke samme svar som
   * middelhøyden. Nar omrisset er yttergrensen, er det ikke massebalansen som
   * bestemmer - det er hvor mye skraningene tar. Legger man nivaet høyt, tar
   * fyllinga pa nedsida mye plass; legger man det lavt, tar skjæringa pa
   * oppsida mye. Et sted imellom er tapet minst, og det er sjelden middelet.
   *
   * Uten dette matte brukeren gjette pa koten og se den ferdige flaten krympe
   * uten a vite hvilken vei den skulle. Med det trenger man ikke mur i det hele
   * tatt pa mange tomter - man trenger bare riktig høyde.
   */
  finnNivaaForGrense() {
    if (!this.erTomt()) return null;
    const t = this.P.tomt;
    const p = this.tomtIUtm(t);
    if (p.length < 3 || !this.terreng) return null;
    const T = this.terrengOverTomta();
    if (!T) return null;
    const ob = this.overbygningstykkelse();
    const fjell = this.fjellmodellIUtm();

    const arealVed = kote => {
      const inn = Tomtmasser.innerflate({
        tomt: { punkter: p, kanter: t.kanter, nivaa: Object.assign({}, this.tomtenivaaIUtm(t), { kote }) },
        mal: this.P.mal, terreng: this.terreng, fjell
      });
      if (!inn.punkter) return { areal: 0, mangler: Infinity };
      const verst = (inn.mangler || []).reduce((m, x) => Math.max(m, x.mangler), 0);
      return { areal: Tomt.areal(inn.punkter), mangler: verst };
    };

    /* Grovsøk først. Arealet er ikke monotont i koten - det stiger til et punkt
       og faller igjen - sa halvering duger ikke. Tjue steg over hele
       terrengspennet finner toppen, og sa finpusses den. */
    let beste = null;
    const fra = T.lav + ob - 1, til = T.hoy + ob + 1;
    const steg = (til - fra) / 20;
    for (let k = fra; k <= til + 1e-9; k += steg) {
      const v = arealVed(k);
      if (!beste || v.areal > beste.areal) beste = { kote: k, ...v };
    }
    if (!beste || beste.areal <= 0) return null;
    for (const fin of [steg / 3, steg / 9, steg / 27]) {
      for (const d of [-fin, fin]) {
        const k = beste.kote + d;
        if (k < fra || k > til) continue;
        const v = arealVed(k);
        if (v.areal > beste.areal) beste = { kote: k, ...v };
      }
    }
    return { kote: +beste.kote.toFixed(2), areal: beste.areal, mangler: beste.mangler };
  },

  /**
   * Finner koten der skjæring og fylling gar opp mot hverandre.
   *
   * Halveringssøk pa balansen. Den er strengt voksende i koten - løfter man
   * nivaet, blir det mindre skjæring og mer fylling, alltid - sa halvering
   * treffer. Det er det samme grepet «Massebalanse» gjør pa vegen.
   */
  async balanserTomt() {
    if (!this.erTomt()) return;
    const t = this.P.tomt;
    if (!t.punkter.length) return;
    const start = t.nivaa.kote != null ? t.nivaa.kote : this.foreslaKote();
    if (start == null) { this.status('Sett en kote først'); return; }
    this.merk('massebalanse på tomta');
    this.framdrift(true, 'Finner koten som gir massebalanse…', 0.1);
    await pause();
    const maal = kote => {
      t.nivaa.kote = kote;
      /* Er omrisset yttergrensen, ma den ferdige flaten regnes om for hver
         prøvekote - den krymper nar nivaet flyttes lenger fra terrenget, fordi
         skraningene tar mer plass. Her balanserte den arealet man hadde TEGNET,
         som ikke er det som skal bygges, og landet derfor pa feil kote. */
      let punkter = this.tomtIUtm(t);
      if (t.omrissBetyr === 'yttergrense') {
        const inn = Tomtmasser.innerflate({
          tomt: { punkter, kanter: t.kanter, nivaa: this.tomtenivaaIUtm(t) },
          mal: this.P.mal, terreng: this.terreng, fjell: this.fjellmodellIUtm()
        });
        if (!inn.punkter) return -Infinity;    // ingen plass: for høyt lagt
        punkter = inn.punkter;
      }
      const r = Tomtmasser.beregnTomtemasser({
        tomt: { punkter, kanter: t.kanter, nivaa: this.tomtenivaaIUtm(t) },
        mal: this.P.mal, terreng: this.terreng, fjell: this.fjellmodellIUtm(),
        // samme grense som beregningen bruker, ellers balanserer den mot andre tall
        grense: t.omrissBetyr === 'yttergrense' ? this.tomtIUtm(t) : null,
        rutestorrelse: Math.max(1, this.P.mal.rutestorrelse), bakkefaktor: this.bakkefaktor()
      });
      return this.tomtebalanse(r.sum).balanse;
    };
    /* Balansen SYNKER nar koten heves: løfter man nivaet, blir det mindre a
       grave og mer a fylle. Her sto halveringen motsatt vei, og da løp den rett
       til bunnen av søkeomradet i stedet for a nærme seg null - 71 000 m³ i
       avvik, meldt som om den hadde funnet balanse.

       Derfor sjekkes ogsa at roten i det hele tatt ligger mellom endene før
       halveringen starter. Ligger den ikke det, finnes det ingen kote som gir
       balanse innenfor det man kan grave, og da er det bedre a si det enn a
       levere endepunktet som om det var svaret. */
    let lav = start - 30, hoy = start + 30;
    const bLav = maal(lav), bHoy = maal(hoy);
    if (!(bLav > 0 && bHoy < 0)) {
      t.nivaa.kote = start;
      this.framdrift(false);
      this.tomtTilSkjema();
      await this.beregnTomt();
      this.status(bLav <= 0
        ? 'Fant ingen kote som gir balanse – det blir fylling uansett hvor lavt tomta legges'
        : 'Fant ingen kote som gir balanse – det blir skjæring uansett hvor høyt tomta legges');
      return;
    }
    for (let i = 0; i < 24; i++) {
      const midt = (lav + hoy) / 2;
      if (maal(midt) > 0) lav = midt; else hoy = midt;
      this.framdrift(true, 'Finner koten som gir massebalanse…', 0.1 + 0.85 * i / 24);
      if (i % 4 === 0) await pause();
    }
    t.nivaa.kote = +((lav + hoy) / 2).toFixed(2);
    this.framdrift(false);
    this.tomtTilSkjema();
    await this.beregnTomt();
    const b = this.resultat && this.resultat.balanse;
    this.status(b
      ? `Kote ${t.nivaa.kote.toFixed(2)} gir balanse – ${Math.abs(b.balanse).toFixed(0)} m³ i avvik`
      : `Kote ${t.nivaa.kote.toFixed(2)}`);
  },

  /**
   * Massene for tomta, i sidepanelet.
   *
   * Bygd av de samme byggeklossene som vegens sammendrag - sumkort, sumrad og
   * verdi - sa skrift, avstander og farger blir identiske. Her sto det en egen
   * tabell med egen stil, og da sa tomta ut som et annet program.
   */
  visTomtemasser() {
    const boks = document.getElementById('massesammendrag');
    if (!boks || !this.erTomt()) return;
    Tomteprofil.tegn();
    Kart.tegnTomtefarger();
    /* Malene i kartet tegnes ogsa her, ikke bare fra Kart.tegn(). Kart.tegn()
       kjører før beregningen er ferdig, sa etiketten viste forrige tilstand -
       "sett et ferdig niva" etter at nivaet var satt, og gammel kanttype etter
       at den var byttet. */
    Kart.tegnTomtemal();
    Kart.tegnSkraningslinje();
    const t = this.tomtetall();
    if (!t || t.hjorner < 3) {
      boks.innerHTML = '<span class="tomtekst">Tegn tomta i kartet – klikk rundt den, '
        + 'dobbeltklikk eller Enter for å lukke.</span>';
      return;
    }
    const tall = (v, d = 0) => Rapport.tall(v, d);
    const rad = (navn, verdi, klasse, tittel) =>
      `<div class="sumrad${klasse ? ' ' + klasse : ''}"${tittel ? ` title="${escapeHtml(tittel)}"` : ''}>`
      + `<span>${navn}</span><span class="verdi">${verdi}</span></div>`;

    const r = this.resultat;
    const merk = (r && r.merknader ? r.merknader : []).concat(t.merknader || [])
      .filter(m => m.type !== 'ubyggelig');
    /* GÅR DET IKKE, SKAL DET STÅ ØVERST OG ALENE.
       Her lå meldingen om at tomta ikke lot seg bygge som én linje blant fire
       andre merknader, over et helt vanlig massesammendrag. En ferdig kote på
       300 der terrenget ligger 210 ga «162 366 m³ fylling» i store tall og en
       merknad om fyllingshøyde nede i lista. Tallet ser ut som et svar, og et
       tall som ser ut som et svar blir brukt som et svar. */
    let ut = '';
    if (r && r.ubyggelig) {
      ut += '<div class="varselboks stoppboks"><b class="merke-varsel">⛔ Dette lar seg ikke bygge</b>'
        + `<div>${escapeHtml(r.ubyggelig.tekst)}</div></div>`;
    }
    ut += merk.length
      ? `<div class="varselboks"><b>${merk.length} merknad${merk.length === 1 ? '' : 'er'}</b>`
        + merk.slice(0, 20).map(m => `<div>${escapeHtml(m.tekst)}</div>`).join('') + '</div>'
      : '';

    /* Malene først. Det er dem man leser mens man tegner, og kantlengdene er
       det man kontrollerer mot en situasjonsplan. */
    const p = this.tomtIUtm();
    const kanter = Tomt.kanter(p);
    const bf = this.bakkefaktor();
    ut += '<div class="sumkort"><h4>Mål</h4>';
    ut += rad('Areal', tall(t.areal) + ' m²');
    ut += rad('Omkrets', tall(t.omkrets, 1) + ' m');
    ut += rad('Hjørner', String(t.hjorner));
    ut += '<div class="strek"></div>';
    kanter.forEach(k => {
      const grader = ((90 - k.retning * 180 / Math.PI) % 360 + 360) % 360;
      ut += rad(`Side ${k.nr + 1}`, `${tall(k.lengde * bf, 1)} m <small>${tall(grader, 0)}°</small>`);
    });
    ut += '</div>';

    if (!r || !r.sum) {
      ut += '<div class="sumkort"><h4>Masser</h4>'
        + '<span class="tomtekst">Sett et ferdig nivå under «Høyde» for å få massene.</span></div>';
      boks.innerHTML = ut;
      return;
    }
    /* Massene holdes tilbake når det ikke lar seg bygge. De beskriver ingenting
       som kan settes ut, og et massesammendrag ved siden av en stoppmelding
       leses som om det gjaldt likevel. Knappen henter dem fram for den som
       vil se hva regnestykket faktisk ga. */
    if (r.ubyggelig && !this._visUbyggeligeTall) {
      ut += '<div class="sumkort"><h4>Masser</h4>'
        + '<span class="tomtekst">Ikke vist – de gjelder en flate som ikke kan bygges. '
        + 'Flytt den ferdige koten nærmere terrenget, så kommer de fram.</span>'
        + '<div class="knappekolonne"><button class="knapp bred" id="visLikevel">'
        + 'Vis tallene likevel</button></div></div>';
      boks.innerHTML = ut;
      const knapp = boks.querySelector('#visLikevel');
      if (knapp) knapp.onclick = () => { this._visUbyggeligeTall = true; this.visTomtemasser(); };
      return;
    }
    const s = r.sum, b = r.balanse;

    ut += '<div class="sumkort"><h4>Nøkkeltall</h4>';
    ut += rad('Dypeste skjæring', tall(r.dypesteSkjaering, 2) + ' m');
    ut += rad('Høyeste fylling', tall(r.hoyesteFylling, 2) + ' m');
    if (r.hoyesteVegg > 0.05) ut += rad('Høyeste bergvegg', tall(r.hoyesteVegg, 2) + ' m');
    ut += rad('Beregnet flate', tall(r.arealMedSkraning) + ' m² <small>med skråninger</small>');
    ut += '</div>';

    ut += '<div class="sumkort"><h4>Masser – prosjektert fast volum (p.f.m³)</h4>';
    if (s.matjord > 0.5) ut += rad('Matjord som tas av', tall(s.matjord) + ' m³',
      null, 'Skrapes av før arbeidet starter. Mellomlagres ofte på tomta og legges tilbake på skråningene.');
    if (s.rensk > 0.5) ut += rad('Rensk mot fjell', tall(s.rensk) + ' m³');
    ut += '<div class="strek"></div>';
    ut += rad('<span class="merke-skjaering">Skjæring totalt</span>',
      `<span class="merke-skjaering">${tall(s.skjaering)} m³</span>`, 'stor');
    ut += rad('&nbsp;&nbsp;– løsmasse', tall(s.skjaeringLosmasse) + ' m³');
    ut += rad('<span class="merke-fjell">&nbsp;&nbsp;– fjell (sprengning)</span>',
      `<span class="merke-fjell">${tall(s.skjaeringFjell)} m³</span>`);
    if (s.overberg > 0.5) {
      ut += rad('&nbsp;&nbsp;– overberg', tall(s.overberg) + ' m³', null,
        'Fjell som sprenges utenfor prosjektert kontur. Egen post: R761 prosess 22.1 gir '
        + 'ikke tillegg for overberg, så det hører ikke hjemme i sprengningsvolumet.');
    }
    ut += '<div class="strek"></div>';
    ut += rad('<span class="merke-fylling">Fylling</span>',
      `<span class="merke-fylling">${tall(s.fylling)} m³</span>`, 'stor');
    ut += '</div>';

    /* Muren er to poster folk glemmer nar de bytter skraning med mur:
       grøfta under den og den drenerende bakfyllinga bak. Begge ma kjøres. */
    if (r.murLengde > 0.5) {
      ut += '<div class="sumkort"><h4>Støttemur</h4>';
      ut += rad('Lengde', tall(r.murLengde, 1) + ' m');
      ut += rad('Høyeste punkt', tall(r.murHoyde, 2) + ' m');
      if (s.murFundament > 0.05) ut += rad('Fundamentgrøft', tall(s.murFundament, 1) + ' m³', null,
        `${this.P.mal.fundamentDybde} m dyp og ${this.P.mal.fundamentBredde} m bred under muren.`);
      if (s.murBakfylling > 0.05) ut += rad('Drenerende bakfylling', tall(s.murBakfylling, 1) + ' m³', null,
        `${this.P.mal.bakfylling} m tykt lag bak muren. Kjøpes – det må være drenerende masse.`);
      ut += '</div>';
    }

    const lag = s.slitelag + s.baerelag + s.forsterkningslag + s.frostsikring + s.avrettingslag;
    if (lag > 0.5) {
      const m = this.P.mal;
      ut += '<div class="sumkort"><h4>Byggeklart – lag som skal inn</h4>';
      const lagrad = (navn, v, tykk) => v > 0.005
        ? rad(navn + (tykk ? ` <small>${tall(tykk, 2)} m</small>` : ''), tall(v) + ' m³') : '';
      ut += lagrad('Frostsikring', s.frostsikring, m.frostsikring);
      ut += lagrad('Forsterkningslag', s.forsterkningslag, m.forsterkningslag);
      ut += lagrad('Bærelag', s.baerelag, m.baerelagTykkelse);
      ut += lagrad('Avretting', s.avrettingslag, m.avrettingslag);
      ut += lagrad('Slitelag', s.slitelag, m.slitelagTykkelse);
      ut += '<div class="strek"></div>';
      ut += rad('Sum overbygning', tall(lag) + ' m³', 'stor');
      ut += '</div>';
    }

    if (b) {
      ut += '<div class="sumkort"><h4>Massebalanse</h4>';
      ut += rad(`Sprengt fjell, løst <small>× ${this.P.faktorer.sprengningsfaktor}</small>`,
        tall(b.fjellSprengtLos) + ' p.a.m³', null,
        'Hva den faste kubikken blir til på et lass. Brukes til transport, ikke til balansen.');
      ut += rad('Tilgjengelig til fylling', tall(b.tilgjengelig) + ' m³', null,
        'Sprengstein × ' + this.P.faktorer.fjellIFylling + ' pluss brukbar løsmasse. '
        + 'Fjell teller med en annen faktor her enn på lasset – 1,30 er hva den fyller '
        + 'ferdig utlagt og komprimert.');
      ut += rad('Fyllingsbehov', tall(b.fyllingBehov) + ' m³');
      ut += '<div class="strek"></div>';
      ut += rad(b.balanse >= 0 ? 'Masseoverskudd' : 'Massemangel',
        tall(Math.abs(b.balanse)) + ' m³', 'stor');
      if (b.manglerTotalt > 0.5) ut += rad('Må kjøres inn', tall(b.manglerTotalt) + ' m³', null,
        'Fyllingsmangel pluss hele overbygningen. Overbygningen kjøpes – den er knust '
        + 'masse med krav til kornkurve, og finnes ikke i en skogsli.');
      if (b.tilDeponi > 0.5) ut += rad('Til deponi', tall(b.tilDeponi) + ' m³', null,
        'Matjord, rensk og den løsmassen som ikke er god nok å fylle med.');
      ut += '</div>';
    }
    boks.innerHTML = ut;
  },

  /**
   * Kantene, én rad hver.
   *
   * Skrivematen for helningen skifter med kanttypen, og det er med vilje: en
   * bergvegg skrives 10:1 (ti opp, én ut), en jordskraning 1:1,5 (én opp,
   * halvannen ut). Blandes de, blir volumet fullstendig feil. Tallet som lagres
   * er alltid det samme - vannrett utlegg per meter høyde - men det brukeren
   * leser skal se ut som i normen.
   */
  /** Fyller velgeren for hvor snittet legges - med én linje per kant. */
  visSnittvelger() {
    const v = document.getElementById('tp_retning');
    if (!v || !this.erTomt()) return;
    const p = this.tomtIUtm();
    const valgt = v.value || Tomteprofil.retning;
    let ut = '<option value="fall">Snitt langs fallet</option>'
      + '<option value="tvers">Snitt på tvers</option>';
    if (p.length >= 3) {
      const kort = { skraning: 'skråning', fjellvegg: 'sprengt vegg', mur: 'mur', apen: 'åpen', overgang: 'overgang' };
      const t = this.P.tomt;
      /* Nummeret ma vaere k.nr, ikke plassen i lista.
         Tomt.kanter() hopper over kanter uten lengde - to hjørner pa samme sted
         - mens motoren slar opp i kanter[] etter PUNKTnummer. Med én dublett i
         omrisset traff valget derfor feil side: man satte sprengt vegg pa den
         ene kanten og fikk den pa en annen, uten at noe sa fra. */
      Tomt.kanter(p).forEach(k => {
        const type = ((t.kanter && t.kanter[k.nr]) || {}).type || 'skraning';
        ut += `<option value="kant${k.nr}">Side ${k.nr + 1} – ${kort[type] || type}</option>`;
      });
    }
    v.innerHTML = ut;
    v.value = valgt;
    if (!v.value) { v.value = 'fall'; Tomteprofil.retning = 'fall'; }
  },

  visKanttabell() {
    const boks = document.getElementById('tomtKanter');
    if (!boks || !this.erTomt()) return;
    const t = this.P.tomt;
    const p = this.tomtIUtm(t);
    if (p.length < 3) { boks.innerHTML = ''; return; }
    const kanter = Tomt.kanter(p);
    const mal = this.P.mal;
    const bf = this.bakkefaktor();

    let ut = '<table><tr><th>Kant</th><th>Lengde</th><th>Behandling</th><th>Helning</th></tr>';
    /* k.nr, ikke plassen i lista - se visSnittvelger. Med to hjørner pa samme
       sted hopper Tomt.kanter() over kanten mellom dem, mens motoren teller
       alle, og da havner behandlingen pa feil side av tomta. */
    kanter.forEach(k => {
      const i = k.nr;
      const kant = (t.kanter && t.kanter[i]) || {};
      const type = kant.type || 'skraning';
      const valg = Object.entries(Tomt.Kanttyper).map(([v, n]) =>
        `<option value="${v}"${v === type ? ' selected' : ''}>${n}</option>`).join('');
      let helning = '';
      if (type === 'fjellvegg') {
        const h = kant.veggHelning != null ? kant.veggHelning : mal.veggHelning;
        helning = h < 1e-6 ? 'loddrett' : `${(1 / h).toFixed(h < 0.15 ? 0 : 1)}:1`;
      } else if (type === 'skraning') {
        const h = kant.skjaeringLosmasse != null ? kant.skjaeringLosmasse : mal.skjaeringLosmasse;
        helning = `1:${h.toFixed(1)}`;
      } else if (type === 'mur') {
        helning = `≤ ${mal.maksMurHoyde} m`;
      } else {
        helning = '–';
      }
      ut += `<tr><td>${i + 1}</td><td class="mal">${(k.lengde * bf).toFixed(1)} m</td>`
        + `<td><select data-kant="${i}">${valg}</select></td>`
        + `<td class="mal">${helning}</td></tr>`;
    });
    ut += '</table>';
    ut += '<p class="notis" style="font-size:11px;margin-top:8px">Bergvegg skrives 10:1 '
      + '(ti opp, én ut). Jordskråning skrives 1:1,5 (én opp, halvannen ut). '
      + 'Standardverdiene følger N200.</p>';
    boks.innerHTML = ut;

    for (const v of boks.querySelectorAll('select[data-kant]')) {
      v.onchange = () => {
        const i = +v.dataset.kant;
        this.merk('kantbehandling');
        if (!Array.isArray(t.kanter)) t.kanter = [];
        t.kanter[i] = Object.assign({}, t.kanter[i], { type: v.value });
        this.visKanttabell();
        this.visSnittvelger();
        this.beregnTomt();
      };
    }
  },

  /** Nøkkeltallene for tomta i statuslinjen mens man tegner. */
  oppdaterTomtefelt() {
    if (!this.erTomt()) return;
    const t = this.tomtetall();
    if (!t) return;
    if (t.hjorner < 3) {
      this.status(`Tomt: ${t.hjorner} hjørne${t.hjorner === 1 ? '' : 'r'} – minst tre trengs`);
      return;
    }
    const feil = t.merknader.length ? ' · ⚠ ' + t.merknader[0].tekst : '';
    this.status(`Tomt: ${t.areal.toFixed(0)} m² · omkrets ${t.omkrets.toFixed(1)} m · ${t.hjorner} hjørner${feil}`);
  },


  /**
   * Eldre prosjektfiler hadde grøftedybden malt fra vegkanten og
   * breddeutvidelsen som tillegg. Normalen maler fra planum og oppgir
   * total bredde, sa gamle filer regnes om ved apning.
   */
  moderniserProsjekt(P) {
    this.moderniserMal(P.mal);
    if (!Array.isArray(P.tverrfall)) P.tverrfall = [];
    return P;
  },

  /** Samme omregning for én vegmal. Kalles ogsa per anlegg fra klargjøringen. */
  moderniserMal(mal) {
    const m = mal || {};
    if (m.grofteDybde != null && m.grofteDybdePlanum == null) {
      const overbygning = (m.slitelagTykkelse || 0.10) + (m.baerelagTykkelse || 0.60);
      m.grofteDybdePlanum = Math.max(0.05, +(m.grofteDybde - overbygning).toFixed(3));
      delete m.grofteDybde;
    }
    if (m.breddeutvidelse && !m.breddeIKurve) {
      m.breddeIKurve = m.breddeutvidelse
        .filter(r => r[1] > 0)
        .map(r => [r[0], r[0] + 4, (m.vegbredde || 4.5) + r[1], (m.vegbredde || 4.5) + r[1]]);
      delete m.breddeutvidelse;
    }
    if (m.maksStigning && !m.stigningIKurve) {
      m.stigningIKurve = m.maksStigning.map(r => [r[0], r[1], r[1]]);
      delete m.maksStigning;
    }
    return m;
  },

  async start() {
    /* Prosjektet settes fra fem forskjellige steder - nytt prosjekt, apning,
       import, angre og nettlesertesten. Klargjøringen ma skje hver eneste
       gang, ellers star koden med et prosjekt uten vinduene inn i anlegget,
       og `P.mal` er plutselig undefined.

       Fem kall er fem steder a glemme det. I stedet gar tilordningen gjennom
       én port: `P` er en egenskap med en setter, og den klargjør. Da spiller
       det ingen rolle hvor prosjektet kommer fra. */
    Object.defineProperty(this, 'P', {
      configurable: true,
      get() { return this._P; },
      set(v) { this._P = v ? this.klargjorProsjekt(v) : v; }
    });

    this.P = this.nyttProsjekt();
    Kart.init(this);
    Lengdeprofil.init(this);
    Tverrprofil.init(this);
    Tomteprofil.init(this);
    Rapport.init(this);
    Pdfrapport.init(this);
    PdfUI.init(this);
    this.koblingerUI();
    this.visAnleggsvelger();
    this.malTilSkjema();
    this.tegnAlt();
    this.status('Klar. Velg «Tegn senterlinje» og klikk i kartet.');
    try {
      const liste = await Lager.saFrø();
      if (liste.length) this.status(`Klar. ${liste.length} lagrede prosjekt – trykk «Åpne».`);
    } catch (e) { /* uten lager virker programmet fortsatt, bare uten lagring */ }
  },

  status(t) { document.getElementById('statuslinje').textContent = t; },

  /**
   * Ja/nei-boks i programmets egen stil.
   *
   * Nettleserens confirm() blir blokkert i noen sammenhenger, og da forsvant
   * handlingen uten at brukeren fikk vite hvorfor. Denne gjør det samme, men
   * er alltid synlig.
   */
  bekreft(tekst, jaTekst = 'Ja') {
    return new Promise(løs => {
      const boks = document.getElementById('dialog');
      const innhold = document.getElementById('dialoginnhold');
      const lukkeknapp = document.getElementById('dialogLukk');
      document.getElementById('dialogtittel').textContent = 'Bekreft';
      innhold.innerHTML = `<p class="notis" style="font-size:13px">${escapeHtml(tekst)}</p>
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="bekreftNei">Avbryt</button>
          <button class="knapp primaer" id="bekreftJa">${escapeHtml(jaTekst)}</button>
        </div>`;

      let avgjort = false;
      const lukk = svar => {
        if (avgjort) return;
        avgjort = true;
        boks.classList.add('skjult');
        document.removeEventListener('keydown', taste);
        lukkeknapp.onclick = gammelLukk;
        løs(svar);
      };
      const taste = e => {
        // Enter i et skrivefelt hører til feltet, ikke til dialogen
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === 'Escape') lukk(false);
        if (e.key === 'Enter') lukk(true);
      };
      /* Lukkeknappen i dialoghodet ma ogsa svare. Uten dette ble løftet
         staende uløst og tastelytteren hengende igjen - og et tilfeldig
         Enter langt senere kunne fullføre en sletting brukeren hadde
         avbrutt. */
      const gammelLukk = lukkeknapp.onclick;
      lukkeknapp.onclick = () => lukk(false);

      innhold.querySelector('#bekreftJa').onclick = () => lukk(true);
      innhold.querySelector('#bekreftNei').onclick = () => lukk(false);
      document.addEventListener('keydown', taste);
      boks.classList.remove('skjult');
      innhold.querySelector('#bekreftJa').focus();
    });
  },

  /**
   * Tømmer alle panelene. Brukes nar et prosjekt legges bort.
   *
   * Alt som hører til det forrige prosjektet ma bort her. Sto for eksempel
   * angre-listen for sidelengs flytting igjen, kunne et klikk pa «Angre»
   * skrive forrige prosjekts koordinater inn i det nye.
   */
  tomPaneler() {
    this.resultat = null;
    this.terrengProfil = null;
    this.vprofil = null;
    this.linje = null;
    this._terrengnokkel = '';
    this.tverrStasjon = 0;
    this.flyttingsliste = [];
    this._ipForFlytting = null;
    this.skogdekke = null;
    this._dom = null;
    Rapport.visSammendrag(null);
    Tverrprofil.vis(null);
    Kart.lag.venstreFot.setLatLngs([]);
    Kart.lag.hoyreFot.setLatLngs([]);
    Kart.lag.vegkant.clearLayers();
    Kart.lag.stasjoner.clearLayers();
    Kart.lag.markorPos.clearLayers();
    this.byggLinje();          // før tabellen tegnes, ellers viser den gammel lengde
    this.visHoydetabell();
    this.visLinjetabell();
    Lengdeprofil.tegn();
    for (const f of ['tp_venstre', 'tp_senter', 'tp_hoyre']) {
      const e = document.getElementById(f);
      if (e) { e.value = ''; e.classList.remove('overstyrt'); }
    }
    document.getElementById('tverrEtikett').textContent = '–';
  },

  framdrift(vis, tekst, andel) {
    const boks = document.getElementById('framdrift');
    /* Nar en operasjon kaller en annen, tok den indre over stolpen som om den
       var alene om den. To ting gikk galt under Rett opp, som varer et titalls
       sekunder:

       1. Den indre skrev sin egen andel rett i stolpen, sa linja gikk til
          hundre, hoppet tilbake til null og begynte pa nytt - to ganger.
       2. Verre: nar sidelengs flytting førte linjen utenfor de nedlastede
          flisene, hentet den terreng, og terrenghenteren avsluttet med
          `framdrift(false)`. Da forsvant hele boksen, og de siste fire
          sekundene av Rett opp gikk uten et eneste tegn pa skjermen.

       Nummer to er det som ble meldt som at knappen "laster i evigheten": det
       sto ingenting der, sa det sa ut som om ingenting skjedde.

       Derfor: et vindu sier hvilken del av stolpen en indre operasjon far rade
       over, den far ikke lukke boksen sa lenge noen utenfor eier den, og
       stolpen kan ikke ga bakover innenfor samme visning. */
    if (!vis && this._framdriftEier > 0) return;   // en indre operasjon lukker ikke boksen
    const varSkjult = boks.classList.contains('skjult');
    boks.classList.toggle('skjult', !vis);
    if (!vis) { this._framdriftGulv = 0; return; }
    if (varSkjult) this._framdriftGulv = 0;
    if (tekst) document.getElementById('framdriftTekst').textContent = tekst;
    const [fra, til] = this._framdriftVindu || [0, 1];
    const a = Math.max(this._framdriftGulv || 0,
      fra + (til - fra) * Math.max(0, Math.min(1, andel || 0)));
    this._framdriftGulv = a;
    document.getElementById('framdriftStolpe').style.width = Math.round(a * 100) + '%';
  },

  /** Kjører et arbeid som far rade over stolpen fra `fra` til `til`. */
  async iFramdriftVindu(fra, til, arbeid) {
    const forrige = this._framdriftVindu;
    const [f0, t0] = forrige || [0, 1];
    this._framdriftVindu = [f0 + (t0 - f0) * fra, f0 + (t0 - f0) * til];
    this._framdriftEier = (this._framdriftEier || 0) + 1;
    try { return await arbeid(); }
    finally { this._framdriftVindu = forrige; this._framdriftEier--; }
  },

  /* ---------------- geometri ---------------- */

  byggLinje() {
    const P = this.P;
    if (P.ip.length) this.sone = Geo.sone(P.ip[0].lon);
    const ip = P.ip.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, this.sone);
      return { x: u.x, y: u.y, r: p.r || 0 };
    });
    this.linje = new Linjeforing(ip);
    return this.linje;
  },

  bakkefaktor() {
    if (!this.P.bakkekorreksjon) return 1;
    /* EN TOMT HAR INGEN SENTERLINJE, OG DEN SKAL IKKE LÅNE VEGENS.
       Her sto bare vegveien. På en tomt betydde det ett av to, og begge var
       gale: fantes det ingen veglinje i prosjektet, ble faktoren 1 og
       bakkekorreksjonen falt stille bort – på et anlegg der avkrysningen var
       på. Fantes det en veglinje, ble faktoren regnet på VEGENS midtpunkt og
       VEGENS middelhøyde, og brukt på tomtas volumer, som kan ligge en
       kilometer og hundre høydemeter unna.
       Målt: samme tomt ga 903 m³ med en veglinje i prosjektet og 904 m³ uten.
       Nå regnes den der tomta faktisk ligger. */
    if (this.erTomt()) {
      const p = this.tomtIUtm();
      if (p.length < 3) return 1;
      const tp = Tomtmasser.tyngdepunktAv(p);
      const T = this.terrengOverTomta();
      return Geo.bakkefaktor(tp.x, tp.y, this.sone, T ? T.middel : 0);
    }
    if (!this.linje || !this.linje.lengde) return 1;
    const p = this.linje.punktVed(this.linje.lengde / 2);
    let h = 0;
    if (this.terrengProfil && this.terrengProfil.z.length) {
      const gyldige = this.terrengProfil.z.filter(isFinite);
      if (gyldige.length) h = gyldige.reduce((a, b) => a + b, 0) / gyldige.length;
    }
    return Geo.bakkefaktor(p.x, p.y, this.sone, h);
  },

  korridorbredde() { return (this.P.mal.maksSokebredde || 45) + 12; },

  async lastTerreng() {
    if (!this.linje || this.linje.lengde <= 0) return;
    const res = this.linje.lengde > 4000 ? 2 : 1;
    if (!this.terreng || this.terreng.sone !== this.sone || this.terreng.res !== res) {
      this.terreng = new Terreng(this.sone, res);
    }
    const nokkel = this.P.ip.map(p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)},${p.r}`).join('|') + '#' + this.korridorbredde();
    if (nokkel === this._terrengnokkel) return;
    /* Framdriftsboksen dekker hele skjermen. Blir den staende fordi noe kastet
       underveis, er programmet last til man laster pa nytt - derfor ryddes den
       i finally, ikke etter kallet.
       Men bare dersom det var vi som apnet den. Sto den apen fra før, er det en
       større operasjon som eier den: sidelengs flytting under Rett opp førte
       linjen utenfor de nedlastede flisene og hentet mer terreng, og da forsvant
       boksen midt i - de siste fire sekundene gikk uten et tegn pa skjermen. */
    const varSynlig = !document.getElementById('framdrift').classList.contains('skjult');
    this.framdrift(true, 'Henter terrengdata fra Kartverket…', 0);
    try {
      await this.terreng.lastKorridor(this.linje, this.korridorbredde(), (f, t) => {
        this.framdrift(true, `Henter terrengdata fra Kartverket… ${f}/${t}`, t ? f / t : 1);
      });
    } finally {
      if (!varSynlig) this.framdrift(false);
    }
    this._terrengnokkel = nokkel;
    if (this.terreng.mangler.size) {
      this.status(`⚠ Fikk ikke ${this.terreng.mangler.size} av ${this.terreng.fliser.size + this.terreng.mangler.size} terrengfliser – deler av traseen mangler data`);
    } else {
      this.status(`Terreng lastet (${this.terreng.fliser.size} fliser, ${this.terreng.minneMb()} MB)`);
    }
  },

  hentTerrengProfil() {
    const steg = Math.max(0.5, Math.min(2, this.P.profilAvstand / 2));
    const s = [], z = [];
    for (let d = 0; d <= this.linje.lengde + 1e-9; d += steg) {
      const dd = Math.min(d, this.linje.lengde);
      const p = this.linje.punktVed(dd);
      s.push(dd); z.push(this.terreng.z(p.x, p.y));
      if (dd >= this.linje.lengde) break;
    }
    this.terrengProfil = { s, z };
  },

  justerProfilTilLengde() {
    const L = this.linje.lengde;
    const V = this.P.vip;
    if (!V.length) return;
    for (let i = V.length - 1; i >= 0; i--) if (V[i].s > L + 1e-6) V.splice(i, 1);
    if (!V.length) return;
    const siste = V[V.length - 1];
    if (Math.abs(siste.s - L) > 0.5) {
      /* Star de to siste knekkpunktene pa samme profilnummer, blir dette en
         deling pa null: stigningen blir uendelig, endepunktets høyde blir
         Infinity eller NaN, og volumene blir stille feil. Da videreføres
         høyden vannrett i stedet - det er ingenting a regne en stigning av. */
      const dl = V.length > 1 ? (siste.s - V[V.length - 2].s) : 0;
      const g = Math.abs(dl) > 1e-9 ? (siste.z - V[V.length - 2].z) / dl : 0;
      V.push({ s: L, z: siste.z + g * (L - siste.s), k: siste.k });
    }
  },

  lagProfilforslag() {
    const vipAvstand = parseFloat(document.getElementById('vipAvstand').value) || 40;
    const k = parseFloat(document.getElementById('kVerdi').value);
    const maksBrukt = this.P.mal.stigningIKurve.reduce((a, r) => Math.max(a, r[1], r[2]), 0);
    this.P.vip = foreslaProfil(this.terrengProfil.s, this.terrengProfil.z, {
      vipAvstand, maksStigning: maksBrukt, k: isFinite(k) ? k : 1,
      // krappe kurver har strengere stigningskrav
      maksStigningFor: (sA, sB, g) => this.tillattStigning(sA, sB, g),
      // hold profilen innenfor det som lar seg bygge
      maksOverTerreng: this.P.mal.maksFyllingshoyde > 0 ? this.P.mal.maksFyllingshoyde : null,
      maksUnderTerreng: this.P.mal.maksSkjaeringsdybde > 0 ? this.P.mal.maksSkjaeringsdybde : null,
      // høyder brukeren har bestemt blir liggende
      laste: this.lasteHoyder()
    });
  },

  /* ---------------- hovedløkke ---------------- */

  planlegg(forsinkelse = 260) {
    clearTimeout(this._tidsavbrudd);
    this._tidsavbrudd = setTimeout(() => this.oppdater(), forsinkelse);
  },

  async oppdater() {
    /* ÉN PORT INN, OG DEN MÅ KJENNE BEGGE ARBEIDSFORMENE.
       Alle veier til en ny beregning går gjennom her – angre, gjør om, åpne,
       bytte anlegg. For en tomt er `P.ip` tom, så vakten under slo inn,
       `resultat` ble satt til null, og `Rapport.visSammendrag(null)` skrev
       vegteksten «Tegn en senterlinje i kartet for å komme i gang» over
       massepanelet. På et anlegg med fire hjørner og lagret kote.
       Angret man en kotebytte på en tomt, ble koten riktig tilbakestilt – og
       alle tallene forsvant. */
    if (this.erTomt()) { await this.beregnTomt(); return; }
    this.byggLinje();
    Kart.tegn();
    if (!this.linje || this.linje.lengde <= 1) {
      this.resultat = null; Rapport.visSammendrag(null); Lengdeprofil.tegn(); Tverrprofil.vis(null);
      this.visLinjetabell();
      return;
    }
    await this.lastTerreng();
    this.hentTerrengProfil();
    if (this.P.vip.length < 2) this.lagProfilforslag();
    else this.justerProfilTilLengde();
    this.beregn();
  },

  /**
   * Fjellmodellen med sonderingene regnet om til UTM.
   *
   * Sonderingene lagres som {lat, lon, dybde}, men Fjellmodell regner avstand i
   * UTM og leser p.x og p.y. Gir man den punktene urørt, blir avstanden
   * `Math.hypot(undefined - x, …)` = NaN, `NaN <= rekkevidde` er usant, og hvert
   * eneste punkt hoppes STILLE over. Modellen faller tilbake pa standarddybden,
   * og alt ser normalt ut - tallene er rimelige, det kommer ingen merknad, og
   * sonderingene man har gatt ut og tatt har ingen virkning.
   *
   * Det var nøyaktig dette som skjedde i tomtemodus: vegen konverterte, tomta
   * gjorde det ikke. Na gar begge samme vei inn.
   */
  fjellmodellIUtm() {
    const f = this.P.fjell || {};
    return new Fjellmodell({
      standarddybde: f.standarddybde,
      rekkevidde: f.rekkevidde,
      strekninger: f.strekninger,
      soner: f.soner,
      punkter: (f.punkter || []).map(p => {
        const u = Geo.tilUtm(p.lat, p.lon, this.sone);
        return { x: u.x, y: u.y, dybde: p.dybde };
      })
    });
  },

  beregn() {
    if (!this.linje || !this.terreng || this.P.vip.length < 2) return;
    this.vprofil = new Vertikalprofil(this.P.vip);
    this.fjellmodell = this.fjellmodellIUtm();
    const t0 = performance.now();
    this.resultat = beregnMasser({
      linje: this.linje, profil: this.vprofil, terreng: this.terreng,
      mal: this.P.mal, fjell: this.fjellmodell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      profilAvstand: this.P.profilAvstand, bakkefaktor: this.bakkefaktor()
    });
    this.resultat.mal.profilAvstand = this.P.profilAvstand;
    this.resultat.usikkerhet = this.regnUsikkerhet();
    const tid = performance.now() - t0;

    Rapport.visSammendrag(this.resultat);
    Kart.tegnResultat(this.resultat);
    Lengdeprofil.tegn();
    this.settTverrStasjon(this.tverrStasjon, true);
    this.visLinjetabell();
    this.visHoydetabell();
    this.status(`Beregnet ${this.resultat.profiler.length} profiler på ${tid.toFixed(0)} ms`);
    /* Alt som er verdt a regne pa er verdt a ta vare pa. Beregningen kjøres
       etter hver endring, sa dette fanger ogsa det som ikke gar om `merk`. */
    this.visLagretMerke();
    this.planleggAutolagring();
  },

  /**
   * Største stigning veiklassen tillater pa strekket mellom to profilnummer.
   *
   * Den krappeste kurven pa strekket bestemmer, sa radien males flere steder
   * og ikke bare i endene - ellers ville en kurve midt pa strekket blitt
   * oversett. Fortegnet pa stigningen avgjør om det er lassretningen eller
   * returretningen som gjelder.
   */
  tillattStigning(sA, sB, stigning) {
    const mal = this.P.mal;
    if (!this.linje) return 1;
    let minste = Infinity;
    const steg = Math.max(1, Math.abs(sB - sA) / 8);
    for (let s = Math.min(sA, sB); s <= Math.max(sA, sB) + 1e-9; s += steg) {
      // effektiv radius tar med utflatingen foran og etter kurven
      const g = maksStigningFraRadius(mal, effektivRadius(this.linje, mal, s), stigning, mal.lassretning);
      if (g < minste) minste = g;
    }
    return isFinite(minste) ? minste : 1;
  },

  /**
   * Flytter et knekkpunkt sidelengs, pa tvers av veien der det ligger.
   * Retningen tas fra nabopunktene, sa forskyvningen blir vinkelrett pa
   * linjen og ikke pa nord-akse.
   */
  flyttIpSidelengs(ipUtm, i, avstand) {
    const n = ipUtm.length;
    const foran = ipUtm[Math.max(0, i - 1)];
    const bak = ipUtm[Math.min(n - 1, i + 1)];
    const dx = bak.x - foran.x, dy = bak.y - foran.y;
    const l = Math.hypot(dx, dy) || 1;
    // høyre normal
    return { x: ipUtm[i].x + (dy / l) * avstand, y: ipUtm[i].y - (dx / l) * avstand, r: ipUtm[i].r };
  },

  ipTilUtm() {
    return this.P.ip.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, this.sone);
      return { x: u.x, y: u.y, r: p.r || 0 };
    });
  },

  /**
   * Hvor mye tallene flytter seg nar forutsetningene endres.
   *
   * Terrenghøydene er malt, men dybden til fjell er anslatt - og det er den
   * som avgjør hvor mye som ma sprenges. Her regnes sprengningsvolumet om
   * igjen med fjellet en halvmeter høyere og en halvmeter lavere, sa man ser
   * hva anslaget faktisk betyr i kubikk. Terrengmodellens egen unøyaktighet
   * regnes pa samme mate ved a heve og senke hele terrenget 0,1 m.
   */
  regnUsikkerhet() {
    if (!this.linje || !this.terreng || !this.vprofil) return null;
    const lagFjell = tillegg => new Fjellmodell({
      standarddybde: Math.max(0, this.P.fjell.standarddybde + tillegg),
      rekkevidde: this.P.fjell.rekkevidde,
      strekninger: (this.P.fjell.strekninger || []).map(s => ({ fra: s.fra, til: s.til, dybde: Math.max(0, s.dybde + tillegg) })),
      punkter: this.P.fjell.punkter.map(p => {
        const u = Geo.tilUtm(p.lat, p.lon, this.sone);
        return { x: u.x, y: u.y, dybde: Math.max(0, p.dybde + tillegg) };
      })
    });
    /* Samme oppløsning som hovedberegningen. Med grovere innstillinger her
       ble «Sprengning nå» i usikkerhetsboksen et litt annet tall enn
       sprengningen i sammendraget for samme prosjekt, og da er det ikke til
       a stole pa noen av dem. */
    const kjor = fjell => beregnMasser({
      linje: this.linje, profil: this.vprofil, terreng: this.terreng,
      mal: this.P.mal, fjell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      profilAvstand: this.P.profilAvstand,
      bakkefaktor: this.bakkefaktor()
    });
    try {
      const grunn = kjor(lagFjell(0)).sum;
      const grunnere = kjor(lagFjell(-0.5)).sum;   // fjellet ligger høyere
      const dypere = kjor(lagFjell(+0.5)).sum;
      return {
        fjellNa: grunn.skjaeringFjell,
        fjellGrunnere: grunnere.skjaeringFjell,
        fjellDypere: dypere.skjaeringFjell,
        spenn: Math.abs(grunnere.skjaeringFjell - dypere.skjaeringFjell),
        skjaeringTotalt: grunn.skjaering
      };
    } catch (e) { return null; }
  },

  /**
   * Måler skogdekket langs traseen.
   *
   * Terrengmodellen er laget av laserpulser som ma na helt ned til bakken.
   * Under tett skog slipper fa av dem gjennom, og da er terrenghøyden
   * interpolert mellom spredte treff i stedet for malt. Overflatemodellen tar
   * med trærne, sa forskjellen mellom de to er vegetasjonshøyden - og den er
   * det beste malet vi har pa hvor godt laseren har naadd ned akkurat her.
   */
  async sjekkSkogdekke() {
    if (!this.linje || this.linje.lengde <= 0 || !this.terreng) return null;
    if (!this._dom || this._dom.sone !== this.sone) {
      this._dom = new Terreng(this.sone, this.terreng.res, 'dom');
    }
    const varSynlig = !document.getElementById('framdrift').classList.contains('skjult');
    this.framdrift(true, 'Henter overflatemodellen…', 0.2);
    try {
      await this._dom.lastKorridor(this.linje, this.korridorbredde(), (f, t) => {
        this.framdrift(true, `Henter overflatemodellen… ${f}/${t}`, t ? f / t : 1);
      });
    } finally {
      if (!varSynlig) this.framdrift(false);
    }

    let sum = 0, n = 0, over2 = 0, over5 = 0, maks = 0;
    const bredde = (this.P.mal.vegbredde || 4.5) / 2 + 8;
    for (let s = 0; s <= this.linje.lengde; s += 2) {
      for (let t = -bredde; t <= bredde; t += 2) {
        const p = this.linje.punktMedAvvik(s, t);
        const bakke = this.terreng.z(p.x, p.y);
        const topp = this._dom.z(p.x, p.y);
        if (!isFinite(bakke) || !isFinite(topp)) continue;
        const h = topp - bakke;
        if (h < -1) continue;
        sum += h; n++;
        if (h > 2) over2++;
        if (h > 5) over5++;
        if (h > maks) maks = h;
      }
    }
    if (!n) return null;
    this.skogdekke = {
      snitt: sum / n,
      andelOver2: over2 / n,
      andelOver5: over5 / n,
      maks, punkt: n
    };
    if (this.resultat) Rapport.visSammendrag(this.resultat);
    return this.skogdekke;
  },

  /** Rask beregning brukt av optimaliseringen. */
  beregnRaskt(vipListe, linje) {
    const vp = new Vertikalprofil(vipListe);
    return beregnMasser({
      linje: linje || this.linje, profil: vp, terreng: this.terreng,
      mal: this.P.mal, fjell: this.fjellmodell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      /* Grovere enn den endelige beregningen. Optimaliseringen sammenligner
         alternativer mot hverandre, og da holder det at feilen er den samme
         i alle - den forsvinner i sammenligningen. Den endelige beregningen
         kjøres uansett med full oppløsning etterpa.

         Profilavstanden vokser med lengden, sa antall profiler holder seg
         under ca. 250 uansett hvor lang veien er. Uten det var arbeidet
         kvadratisk i lengden: hvert knekkpunkt prøves atte ganger, og hver
         prøve regnet hele veien om igjen. Prøvd pa 1, 3 og 5 km mot fasit i
         full oppløsning: forskjellen mellom 15, 25 og 40 m er 0-5 % og gar
         begge veier - det er støy i et humpete søkelandskap, ikke en
         systematisk forverring. Under 3 km endrer dette ingenting. */
      profilAvstand: Math.max(this.P.profilAvstand, 15, (linje || this.linje).lengde / 250),
      integrasjonssteg: 0.5,
      raskt: true,
      bakkefaktor: this.bakkefaktor()
    });
  },

  settTverrStasjon(s, behold) {
    if (!this.resultat) { this.tverrStasjon = s; return; }
    let best = this.resultat.profiler[0], bestD = Infinity;
    for (const p of this.resultat.profiler) {
      const d = Math.abs(p.s - s);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.tverrStasjon = best.s;
    Tverrprofil.vis(best);
    this.visPunkthoyder(best);
    Kart.visStasjon(best.s);
    if (!behold) Lengdeprofil.tegn();
    else Lengdeprofil.tegn();
  },

  linjeEndret() { this.planlegg(120); },

  /**
   * Tomta er endret - tegn den om og fortell hva den er blitt.
   *
   * Regner ikke masser enda. Første etappe er a fa tomta inn og synlig; volumet
   * kommer nar kantbehandlingen er pa plass. Arealet og omkretsen males
   * likevel med en gang, for det er de tallene man leser mens man tegner for a
   * se om man har truffet det man mente.
   */
  tomtEndret() {
    Kart.tegn();
    this.oppdaterTomtefelt();
    this.visKanttabell();
    this.visLagretMerke();
    this.planleggAutolagring();
    clearTimeout(this._tomteberegning);
    this._tomteberegning = setTimeout(() => this.beregnTomt(), 150);
  },

  /** Tomta i UTM, sa areal og lengder males i meter og ikke i grader. */
  tomtIUtm(t) {
    const tt = t || (this.erTomt() ? this.P.tomt : null);
    if (!tt || !tt.punkter.length) return [];
    if (!this.sone) this.sone = Geo.sone(tt.punkter[0].lon);
    return tt.punkter.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, this.sone);
      return { x: u.x, y: u.y };
    });
  },

  /**
   * Laster terreng for tomta og regner massene.
   *
   * Egen vei inn, ikke `beregn()`. Vegberegningen henger pa en senterlinje som
   * ikke finnes her, og a lage en attrapp av en linje for a komme gjennom
   * ville vaert verre enn a skrive de tjue linjene som faktisk trengs.
   */
  async beregnTomt() {
    if (!this.erTomt()) return null;
    const t = this.P.tomt;
    const p = this.tomtIUtm(t);
    if (p.length < 3) { this.resultat = null; this.visTomtemasser(); return null; }

    /* Marginen ma dekke sa langt skråningen faktisk kan komme til a ga, ikke
       bare søkebredden. Skråningen søker nå til den lander, men den kan ikke
       lande i terreng som ikke er lastet ned - da stopper den pa datakanten,
       og det ser ut som om den lander der. Det er nøyaktig den samme løgnen
       som søkebredden fortalte før.

       Forrige beregning vet best hvor langt det ble: rekkevidden derfra brukes
       som utgangspunkt, med god klaring, sa marka rekker lenger enn skråningen
       neste gang. Første gang finnes den ikke, og da duger søkebredden. */
    const forrigeRekke = this.resultat && this.resultat.rekkevidde || 0;
    const marg = Math.min(160, Math.max(10, this.P.mal.maksSokebredde || 45,
      Math.ceil(forrigeRekke * 1.35) + 10));
    const res = 1;
    if (!this.terreng || this.terreng.sone !== this.sone || this.terreng.res !== res) {
      this.terreng = new Terreng(this.sone, res);
    }
    const nokkel = p.map(q => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join('|') + '#' + marg;
    if (nokkel !== this._terrengnokkel) {
      const varSynlig = !document.getElementById('framdrift').classList.contains('skjult');
      this.framdrift(true, 'Henter terrengdata fra Kartverket…', 0);
      try {
        await this.terreng.lastOmraade(p, marg, (f, tot) =>
          this.framdrift(true, `Henter terrengdata fra Kartverket… ${f}/${tot}`, tot ? f / tot : 1));
      } finally { if (!varSynlig) this.framdrift(false); }
      this._terrengnokkel = nokkel;
      if (this.terreng.mangler.size) {
        this.status(`⚠ Fikk ikke ${this.terreng.mangler.size} terrengfliser – deler av tomta mangler data`);
      }
    }

    const t0 = performance.now();
    /* Tegnet man yttergrensen, er det ikke den flaten som skal planeres - den
       er ytterkanten av inngrepet. Den ferdige flaten regnes innover, sa bunnen
       av skraningen havner nøyaktig pa grensa. */
    let bruktPolygon = p;
    this._innerflate = null;
    this._tomtMangler = [];
    if (t.omrissBetyr === 'yttergrense') {
      const inn = Tomtmasser.innerflate({
        tomt: { punkter: p, kanter: t.kanter, nivaa: this.tomtenivaaIUtm(t) },
        mal: this.P.mal, terreng: this.terreng, fjell: this.fjellmodellIUtm()
      });
      if (inn.punkter) {
        bruktPolygon = inn.punkter;
        this._innerflate = inn.punkter;
        this._tomtMangler = inn.mangler || [];
      } else {
        /* Si HVA som ikke gar opp, ikke bare at det ikke gar.
           Pa en tomt med fjorten meters fall trenger skraningene titalls meter,
           og da er svaret nesten alltid det samme: sett mur eller sprengt vegg
           pa de sidene der det ikke er plass. En mur tar en sjettedel av
           bredden til en jordskraning - det er nettopp derfor man bygger den. */
        const T = this.terrengOverTomta();
        const bredt = Math.sqrt(Tomt.areal(p));
        const detalj = T
          ? `Terrenget faller ${(T.hoy - T.lav).toFixed(1)} m over tomta, og den er `
            + `omtrent ${bredt.toFixed(0)} m tvers over. `
          : '';
        const rad = 'Sett mur eller sprengt vegg på de sidene der det ikke er plass – '
          + 'en mur tar omtrent en sjettedel av bredden til en jordskråning. '
          + 'Eller legg nivået nærmere terrenget.';
        this.resultat = { sum: {}, merknader: [{ type: 'tomt',
          tekst: 'Skråningene tar hele arealet innenfor grensa. ' + detalj + rad }], areal: 0 };
        this._innerflate = null;
        this.visTomtemasser();
        this.status('⚠ Ikke plass til skråningene innenfor grensa – prøv mur eller sprengt vegg på de bratteste sidene');
        return this.resultat;
      }
    }
    /* «Vis likevel» gjelder ett svar, ikke for alltid. Setter man en ny kote,
       skal stoppmeldingen komme igjen – ellers får man aldri se den andre
       gangen man skriver feil. */
    this._visUbyggeligeTall = false;
    this.resultat = Tomtmasser.beregnTomtemasser({
      tomt: { punkter: bruktPolygon, kanter: t.kanter, nivaa: this.tomtenivaaIUtm(t) },
      mal: this.P.mal,
      faktorer: this.P.faktorer,
      terreng: this.terreng,
      fjell: this.fjellmodellIUtm(),
      /* Er omrisset yttergrensen, er det en grense i ordets egentlige forstand:
         ingenting regnes utenfor den. Uten dette talte rapporten masser pa
         naboens eiendom - masser kartet ikke engang tegnet. */
      grense: t.omrissBetyr === 'yttergrense' ? p : null,
      rutestorrelse: this.P.mal.rutestorrelse,
      bakkefaktor: this.bakkefaktor()
    });
    /* STOPPET SKRANINGEN PA DATAKANTEN, HENT MER MARK OG REGN PA NYTT.
       Skraningen søker nå til den lander, men den kan bare lande i terreng som
       er lastet ned. Sluttet dataene før bakken kom, stanset den der - og det
       ser ut akkurat som en landing, med et volum som er kuttet like vilkarlig
       som søkebredden gjorde det før.
       Én ny runde med romsligere margin er nok i praksis: da er marka strukket
       til det skraningen bad om, med klaring. */
    if (!this._utvidetRunde && this.resultat.skraningsfot
      && this.resultat.skraningsfot.some(f => f.manglerData)) {
      this._utvidetRunde = true;
      try {
        this._terrengnokkel = null;          // tving ny nedlasting
        return await this.beregnTomt();
      } finally { this._utvidetRunde = false; }
    }
    this.resultat.balanse = this.tomtebalanse(this.resultat.sum);
    /* Sider der skraningen ikke far plass innenfor grensa.
       Her ble hele beregningen nektet med «ingen flate igjen». Na vises det som
       gar, og det sies HVILKEN side som er problemet og hvor mange meter som
       mangler - for det er den ene opplysningen man trenger for a vite hvor
       muren skal sta. */
    if (this._tomtMangler && this._tomtMangler.length) {
      const verst = this._tomtMangler.slice().sort((a, b) => b.mangler - a.mangler);
      const topp = verst.slice(0, 3)
        .map(m => `side ${m.kant + 1} (${m.mangler.toFixed(0)} m for lite plass)`).join(', ');
      /* Hva som SKJEDDE med de sidene, står i merknaden fra beregningen: der
         står den helningen de faktisk måtte legges i. Her sto det at skråningen
         var «kuttet i grensa» og at tallene manglet noe – to påstander som
         begge var blitt usanne da skråningen begynte å bratte seg opp i stedet
         for å bli kappet. To merknader som motsier hverandre er verre enn én. */
      this.resultat.merknader.push({ type: 'grense',
        tekst: `Den ferdige flaten er krympet så mye grensa tillater på ${topp}`
          + (verst.length > 3 ? ` og ${verst.length - 3} side(r) til` : '')
          + '. Vil du ha større flate, må nivået nærmere terrenget – eller '
          + 'grensa utvides.' });
    }
    this.visTomtemasser();
    this.tomthoydeTilSkjema();
    this.status(`Tomta regnet på ${Math.round(performance.now() - t0)} ms`);
    return this.resultat;
  },

  /** Nivået med sluk-punktet gjort om til UTM. */
  tomtenivaaIUtm(t) {
    const n = Object.assign({}, t.nivaa);
    if (n.punkt && n.punkt.lat != null) {
      const u = Geo.tilUtm(n.punkt.lat, n.punkt.lon, this.sone);
      n.punkt = { x: u.x, y: u.y };
    }
    return n;
  },

  /**
   * Massebalansen for en tomt.
   *
   * Samme regnestykke og samme faktorer som vegen - det er egenskaper ved
   * massen, ikke ved geometrien. Sprengstein er sprengstein.
   */
  tomtebalanse(s) {
    const f = this.P.faktorer;
    const fjellFast = s.skjaeringFjell;
    const losFast = s.skjaeringLosmasse;
    const fyllingBehov = s.fylling;
    /* Bare bærelaget og forsterkningslaget kan bygges av egen sprengstein.
       Slitelag, avretting og frostsikring har krav til kornkurve og renhet som
       en tilfeldig salve ikke oppfyller - de kjøpes uansett. */
    const kanByggesSelv = s.baerelag + s.forsterkningslag;
    const maaKjopes = s.slitelag + s.avrettingslag + s.frostsikring;
    const overbygningBehov = kanByggesSelv + maaKjopes;

    const fraFjell = fjellFast * f.fjellIFylling;
    const brukbarLos = losFast * f.brukbarLosmasse * f.losmasseIFylling;
    const tilgjengelig = fraFjell + brukbarLos;

    /* Løsmassen brukes først i fyllingen, sa gar det som er igjen av fjell til
       bærelaget - samme rekkefølge som vegen. Her kjøpte tomta HELE
       overbygningen inn, ogsa nar den hadde sprengstein til overs: samme masse
       ble kjørt bort som overskudd og kjøpt tilbake som bærelag. Vegen har gjort
       det riktig hele tiden, og to moduser som priser samme masse ulikt er en
       feil uansett hvilken av dem som har rett. */
    const fyllFraLos = Math.min(brukbarLos, fyllingBehov);
    const fyllFraFjell = Math.min(fraFjell, fyllingBehov - fyllFraLos);
    const fjellIgjen = fraFjell - fyllFraFjell;
    const baerelagFraFjell = Math.min(fjellIgjen, kanByggesSelv);

    const manglerFylling = Math.max(0, fyllingBehov - fyllFraLos - fyllFraFjell);
    const manglerBaerelag = Math.max(0, kanByggesSelv - baerelagFraFjell);
    return {
      fjellFast, losFast, fyllingBehov, overbygningBehov, kanByggesSelv, maaKjopes,
      fjellSprengtLos: fjellFast * f.sprengningsfaktor,
      fraFjell, brukbarLos, tilgjengelig,
      balanse: tilgjengelig - fyllingBehov,
      fyllFraLos, fyllFraFjell, baerelagFraFjell,
      manglerFylling, manglerBaerelag,
      overskuddFjell: Math.max(0, fjellIgjen - baerelagFraFjell),
      overskuddLos: Math.max(0, brukbarLos - fyllFraLos),
      /* Matjord og rensk gar til deponi sammen med den løsmassen som ikke er
         god nok a fylle med. Merk at rensken na er TRUKKET UT av
         skjaeringLosmasse i regnemotoren - før la den bade der og her, og de
         samme kubikkene ble talt to ganger. */
      tilDeponi: s.matjord + s.rensk + losFast * (1 - f.brukbarLosmasse),
      manglerTotalt: manglerFylling + manglerBaerelag + maaKjopes
    };
  },

  /** Nøkkeltallene for tomta, slik de vises mens man tegner. */
  tomtetall() {
    if (!this.erTomt()) return null;
    const t = this.P.tomt;
    const p = this.tomtIUtm(t);
    if (p.length < 3) return { hjorner: t.punkter.length, areal: 0, omkrets: 0, merknader: [] };
    /* Bakkefaktoren er en lengdefaktor. Et areal skalerer med kvadratet av den
       - to lengder ganges sammen. Bruker man den rett pa arealet, blir feilen
       dobbelt sa stor som den skulle vaert, og den er stille: 850 m² mot
       850,3 m² ser like rimelig ut. */
    const bf = this.bakkefaktor();
    return {
      hjorner: t.punkter.length,
      areal: Tomt.areal(p) * bf * bf,
      omkrets: Tomt.omkrets(p) * bf,
      kanter: Tomt.kanter(p).length,
      merknader: Tomt.sjekkTomt(t, p)
    };
  },
  grunnEndret() { Kart.tegn(); this.visSonderinger(); this.planlegg(60); },
  profilEndret(underDrag) {
    this.vprofil = new Vertikalprofil(this.P.vip);
    Lengdeprofil.tegn();
    if (!underDrag) this.planlegg(30);
  },

  /* ---------------- retting ---------------- */

  /**
   * Høydene som ligger naer et brudd profilen kan rette.
   *
   * Brukes nar alt er last: da er det disse som ma slippes løs for at
   * rettingen skal ha noe a arbeide med, og resten kan bli staende.
   */
  hoyderVedBrudd(marg = 60) {
    if (!this.resultat) return [];
    const steder = this.resultat.merknader
      .filter(m => this.BRUDDTYPER[m.type] === 'profil' && isFinite(m.s))
      .map(m => m.s);
    if (!steder.length) return [];
    return this.P.vip.filter(v => steder.some(s => Math.abs(v.s - s) <= marg));
  },

  /**
   * Bruddtypene, og hva som skal til for a fa dem bort.
   *
   * «profil» betyr at rettingen kan løse det ved a flytte høyder eller sette
   * K. «linje» betyr at det ma gjøres noe med linjen i planet, og det er
   * ikke rettingen sin jobb - den flytter ikke veien brukeren har tegnet.
   * «annet» er ting som verken profil eller linje kan gjøre noe med.
   */
  BRUDDTYPER: {
    stigning: 'profil', fylling: 'profil', skjaering: 'profil',
    utslag: 'profil', vertikalkurve: 'profil', geometri: 'profil',
    kurvatur: 'linje', linje: 'linje',
    data: 'annet', inngang: 'annet', avkortet: 'annet'
  },

  /**
   * Teller brudd pa kravene, sa man ser hva en retting faktisk gjorde.
   *
   * Tallene tas fra merknadene i beregningen, ikke fra et eget overslag her.
   * Med to steder som malte hver sin sak kunne rettingen melde «0 brudd»
   * mens rapporten ved siden av viste tjue - og da er ingen av dem til a
   * stole pa. Nar dette sier null, er merknadslisten tom.
   */
  tellBrudd(res) {
    const r = res || this.resultat;
    if (!r || !Array.isArray(r.merknader)) return null;
    const ut = { profil: 0, linje: 0, annet: 0, totalt: 0, per: {} };
    for (const m of r.merknader) {
      // oppsummeringslinjen «N vertikalkurver til» teller det den sier
      const flere = /^(\d+) (vertikalkurver|profiler) til/.exec(m.tekst || '');
      const antall = flere ? 1 + parseInt(flere[1], 10) : 1;
      const gruppe = this.BRUDDTYPER[m.type] || 'annet';
      ut[gruppe] += antall;
      ut.per[m.type] = (ut.per[m.type] || 0) + antall;
    }
    ut.totalt = ut.profil + ut.linje;      // «annet» er ikke noe rettingen kan løse
    return ut;
  },

  /**
   * Retter opp et prosjekt som bryter kravene, og leter samtidig etter den
   * billigste løsningen.
   *
   * "Foreslå profil" lager en helt ny linje fra terrenget. Pa et prosjekt som
   * alt er tegnet ferdig er det for grovt - der vil man beholde linjen, fa
   * bort bruddene, og sa fa ned sprengningen og fyllingen sa langt det gar.
   *
   * Rettingen kommer først. Optimaliseringen leter lokalt, og fra en profil
   * som bryter kravene med 8 % ville den brukt kreftene pa a klatre ut av
   * bruddene i stedet for a finne noe billigere.
   */
  async rettOpp(modus) {
    this.merk(modus === 'inngrep' ? 'minst inngrep' : 'rett opp');
    if (!this.vprofil || this.P.vip.length < 2 || !this.terrengProfil || !this.resultat) {
      this.status('Ingen profil å rette ennå.');
      return;
    }
    /* Er alt last, er det ingenting a flytte - og da gjorde knappen ingenting,
       med én linje i statuslinjen som er lett a overse. Er det brudd a rette,
       er det bedre a tilby seg a lase opp nøyaktig de høydene som star i
       veien, og la resten sta. */
    if (this.P.vip.every(v => v.laast)) {
      const brudd = this.tellBrudd();
      if (!brudd || brudd.profil === 0) {
        this.status('Alle høyder er låst, og det er ingen brudd å rette.');
        return;
      }
      const rammet = this.hoyderVedBrudd();
      if (!rammet.length) {
        this.status(`Alle høyder er låst. ${brudd.profil} brudd står igjen – `
          + 'lås opp noen høyder for at profilen skal kunne rettes.');
        return;
      }
      const ja = await this.bekreft(
        `Alle høyder er låst, så det er ingenting å flytte. Vil du at ${rammet.length} `
        + `høyde${rammet.length === 1 ? '' : 'r'} ved bruddene låses opp, så de kan rettes? `
        + 'De andre blir stående.', 'Lås opp og rett');
      if (!ja) { this.status('Rettingen ble avbrutt – høydene står som de var'); return; }
      this.merk('lås opp høyder ved brudd');
      for (const v of rammet) v.laast = false;
      this.visHoydetabell();
    }

    const bruddFor = this.tellBrudd();
    /* Bade profilen og linjen slik de sto, sa knappen kan legge dem tilbake om
       den ikke fant noe bedre.

       Linjen ma vaere med: er `sideforskyvning` satt, flytter optimaliseringen
       ogsa senterlinjen sidelengs. Uten den i bildet la knappen tilbake
       høydene, men beholdt en linje som var flyttet - en helt annen veg enn
       den man startet med, og med darligere tall enn begge. Malt pa en ekte
       trase: statuslinjen sa «beholdt profilen», mens merknadene gikk fra 63
       til 73. */
    const vipFor = this.P.vip.map(v => Object.assign({}, v));
    const ipFor = this.P.ip.map(p => Object.assign({}, p));
    const volumFor = {
      fjell: this.resultat.sum.skjaeringFjell,
      skjaering: this.resultat.sum.skjaering,
      fylling: this.resultat.sum.fylling,
      rensk: this.resultat.sum.rensk,
      // det som ma kjøres inn eller bort er ogsa masse man betaler for
      maaInn: this.resultat.balanse.manglerTotalt,
      tilDeponi: this.resultat.balanse.tilDeponi
    };

    this.framdrift(true, modus === 'inngrep' ? 'Legger veien tettest mulig på terrenget…' : 'Retter profilen…', 0.15);
    let laasteIVeien = 0;
    try {
      await pause();
      const mal = this.P.mal;
      const terrengVed = lagTerrengoppslag(this.terrengProfil.s, this.terrengProfil.z);
      const rettEnGang = () => {
        rettProfil(this.P.vip, {
          maksStigningFor: (sA, sB, g) => this.tillattStigning(sA, sB, g),
          maksOverTerreng: mal.maksFyllingshoyde > 0 ? mal.maksFyllingshoyde : null,
          maksUnderTerreng: mal.maksSkjaeringsdybde > 0 ? mal.maksSkjaeringsdybde : null,
          terrengVed
        });
        /* Vertikalgeometrien ma rettes for seg. rettProfil flytter høyder,
           men rører aldri K - og et knekkpunkt med K=0 far ingen kurve i det
           hele tatt. Uten dette sto alle vertikalkurvebruddene igjen etter
           en retting som ellers tok bort alt annet. */
        const v = rettVertikalgeometri(this.P.vip, {
          minVertikalLavbrekk: mal.minVertikalLavbrekk,
          minVertikalHoybrekk: mal.minVertikalHoybrekk
        });
        laasteIVeien = Math.max(laasteIVeien, v.laste);
      };

      /* De to rettingene drar i hver sin retning: a slake ut et vertikalbrudd
         flytter en høyde, og det kan bryte stigningskravet et hakk unna. Derfor
         gjentas de til det ikke er flere brudd igjen som lar seg løse - eller
         til det slutter a bli bedre. */
      /* Rettelykken trenger bare a vite om det ble faerre brudd, ikke det
         endelige regnestykket. Med full beregning hver runde tok knappen 11,8
         sekunder pa en veg med 172 profiler - atte runder a halvannet sekund -
         og det ser ut som om den har hengt seg. Den grove beregningen svarer
         pa det samme spørsmalet pa en brøkdel av tiden; den nøyaktige kjøres
         en gang, til slutt. */
      const bruddRaskt = () => {
        try {
          const r = this.beregnRaskt(this.P.vip);
          let n = 0;
          for (const m of r.merknader) if (this.BRUDDTYPER[m.type] === 'profil') n++;
          return n;
        } catch (e) { return Infinity; }
      };
      const frist = performance.now() + 25000;
      let forrige = Infinity;
      for (let runde = 0; runde < 8; runde++) {
        if (performance.now() > frist) break;
        rettEnGang();
        this.vprofil = new Vertikalprofil(this.P.vip);
        const na = bruddRaskt();
        this.framdrift(true, `Retter profilen… ${na} brudd igjen`, 0.15 + 0.35 * (runde + 1) / 8);
        if (na === 0) break;
        if (na >= forrige) break;                 // ikke lenger fremgang
        forrige = na;
        await pause();
      }
      this.beregn();
      this.framdrift(true, 'Finjusterer for minst mulig masse…', 0.5);
      await pause();
      await this.iFramdriftVindu(0.5, 0.95, () => this.optimaliser(true, modus));

      /* Optimaliseringen leter etter billigere høyder, og kan i den jakten
         havne pa noe som bryter et krav igjen. Da rettes det en siste gang -
         reglene skal holde nar brukeren slipper knappen. */
      /* Det som følger er tre fulle beregninger pa rad, over et sekund hver pa
         en lang veg. Uten teksten sto det «flytter linjen sidelengs» i fire
         sekunder etter at flyttingen var ferdig - stolpen sto stille, og det
         sa ut som om den hadde satt seg fast. */
      this.framdrift(true, 'Kontrollerer at kravene holder…', 0.96);
      await pause();
      if (this.tellBrudd().profil > 0) {
        rettEnGang();
        this.vprofil = new Vertikalprofil(this.P.vip);
        this.beregn();
      }
      this.framdrift(true, 'Sammenligner med profilen du hadde…', 0.98);
      await pause();

      /* Knappen skal aldri levere noe darligere enn det den fikk.
         Rettingen tvinger profilen mot kravene, og optimaliseringen etterpa
         er et lokalt søk som ikke lover noe. La veien høyt og tørt uten et
         eneste brudd, kunne den ende med a bli dratt ned i fjellet:
         22 m³ sprengning ble til 432, med null brudd bade før og etter.

         Derfor sammenlignes svaret med utgangspunktet, i den rekkefølgen
         dette faktisk koster: først antall brudd, sa sprengning, sa det som
         ellers ma flyttes. Er utgangspunktet bedre, er utgangspunktet svaret. */
      /* Er svaret bedre enn det vi fikk?

         Alt males i én sum, sa det ikke finnes en vei rundt. Volumene males
         pa det som faktisk koster: sprengning er dyrest, deretter hver kubikk
         som ma kjøres inn eller bort. Fyllingsvolumet alene er ikke et mal -
         en veg pa tre meters fylling har null sprengning, men ti tusen kubikk
         som ma kjøres inn.

         Og et brudd har en pris. Ikke uendelig: her sto det at faerre brudd
         alltid vant, og da kunne knappen bruke 8 700 ekstra kubikk sprengning
         pa a fjerne 54 stigningsmerknader - malt pa en ekte trase. For en
         skogsbilveg er det feil handel; da er det bedre a beholde bruddene og
         heller slake ut en kurve. Prisen er satt sa et brudd svarer til
         omtrent hundre og femti kubikk masse: nok til at knappen retter der
         det er billig, og ikke der det er dyrt. */
      const BRUDDPRIS = 150;
      const etterAlt = this.tellBrudd();
      const bedreFor = (() => {
        if (!bruddFor || !etterAlt) return false;
        const s = this.resultat.sum, b = this.resultat.balanse;
        const na = s.skjaeringFjell * 3 + s.skjaeringLosmasse
          + b.manglerTotalt * 1.5 + b.tilDeponi + etterAlt.profil * BRUDDPRIS;
        const før = volumFor.fjell * 3 + (volumFor.skjaering - volumFor.fjell)
          + volumFor.maaInn * 1.5 + volumFor.tilDeponi + bruddFor.profil * BRUDDPRIS;
        /* Behold det man hadde hvis det nye ikke er minst en prosent bedre.
           Uten denne terskelen drev tallene av garde nar man trykket flere
           ganger - optimaliseringen er et lokalt søk som alltid finner en litt
           annen vei, og sprengningen gikk fra 520 til 543 bare av et trykk til. */
        return na > før * 0.99 - 1;
      })();
      if (bedreFor) {
        this.P.vip = vipFor.map(v => Object.assign({}, v));
        this.P.ip = ipFor.map(p => Object.assign({}, p));
        this.flyttingsliste = [];
        this._ipForFlytting = null;
        this.framdrift(true, 'Legger tilbake profilen du hadde…', 0.99);
        await pause();
        this.byggLinje();
        this.vprofil = new Vertikalprofil(this.P.vip);
        this.beregn();
        this.framdrift(false);
        this.status(bruddFor.profil > 0
          ? `Fant ingen bedre profil – ${bruddFor.profil} brudd står som før. `
            + 'Prøv å slakke et krav, låse opp flere høyder, eller endre linjen i planet.'
          : 'Profilen du hadde var allerede best – den er beholdt som den var.');
        return;
      }
    } catch (e) {
      this.status('Rettingen feilet: ' + e.message);
      return;
    } finally {
      this.framdrift(false);
    }

    const bruddEtter = this.tellBrudd();
    const igjen = bruddEtter ? bruddEtter.totalt : 0;
    const s = this.resultat.sum;
    const tall = v => Math.round(Math.abs(v)).toLocaleString('nb-NO');
    const endring = (fra, til) => (fra - til > 0 ? '−' : '+') + tall(fra - til);

    const deler = [];
    if (bruddFor.totalt > igjen && igjen > 0) deler.push(`rettet ${bruddFor.totalt - igjen} brudd`);
    if (modus === 'inngrep') {
      const flyttetFor = volumFor.skjaering + volumFor.fylling;
      const flyttetNa = s.skjaering + s.fylling;
      if (Math.abs(flyttetFor - flyttetNa) > 5) deler.push(`flyttet masse ${endring(flyttetFor, flyttetNa)} m³`);
      if (Math.abs(volumFor.rensk - s.rensk) > 5) deler.push(`fotavtrykk ${endring(volumFor.rensk, s.rensk)} m³`);
    } else {
      if (Math.abs(volumFor.fjell - s.skjaeringFjell) > 5) deler.push(`sprengning ${endring(volumFor.fjell, s.skjaeringFjell)} m³`);
      if (Math.abs(volumFor.fylling - s.fylling) > 5) deler.push(`fylling ${endring(volumFor.fylling, s.fylling)} m³`);
      /* Masse som ma kjøres inn er ogsa penger. Uten den i meldingen sa det ut
         som en darlig handel a bytte 500 m³ sprengning mot 9 500 m³ mindre
         innkjørt fylling - som er en svaert god handel. */
      const b = this.resultat.balanse;
      if (Math.abs(volumFor.maaInn - b.manglerTotalt) > 5) {
        deler.push(`må kjøres inn ${endring(volumFor.maaInn, b.manglerTotalt)} m³`);
      }
    }
    /* Star det noe igjen, skal det sta nøyaktig hva og hvorfor rettingen ikke
       kunne ta det. «3 brudd står igjen» uten mer er ubrukelig - da vet man
       ikke om man skal endre linjen, lase opp en høyde eller slakke et krav. */
    if (bruddEtter && bruddEtter.profil > 0) {
      const verste = Object.entries(bruddEtter.per)
        .filter(([t]) => this.BRUDDTYPER[t] === 'profil')
        .sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ');
      deler.push(`${bruddEtter.profil} brudd står igjen (${verste})`
        + (laasteIVeien ? ` – ${laasteIVeien} av dem sitter fast i låste høyder` : ''));

      /* Star det stigningsbrudd igjen, er det ett av tre som binder: laste
         høyder, kravet i en kurve, eller terrenget selv. Uten a si hvilket
         star brukeren igjen med «det virket ikke». */
      const stign = this.resultat.merknader.filter(m => m.type === 'stigning');
      if (stign.length) {
        const laasteNaer = this.P.vip.filter(v => v.laast
          && stign.some(m => Math.abs(v.s - m.s) <= 60)).length;
        const iKurve = stign.filter(m => /radius/.test(m.tekst)).length;
        if (laasteNaer) {
          deler.push(`${laasteNaer} låste høyder ligger ved stigningsbruddene – `
            + 'lås dem opp, så kan profilen flyttes der');
        } else if (iKurve > stign.length / 2) {
          deler.push('det er kurvene som setter grensen – en slakkere radius '
            + 'tillater brattere veg (se merknadene for hvilken)');
        } else {
          deler.push('terrenget er for bratt for veiklassen på disse strekkene – '
            + 'her må linjen legges om i planet, eller veiklassen endres');
        }
      }
    }
    if (bruddEtter && bruddEtter.linje > 0) {
      const hva = Object.entries(bruddEtter.per)
        .filter(([t]) => this.BRUDDTYPER[t] === 'linje')
        .map(([t, n]) => `${n} ${t}`).join(', ');
      deler.push(`${hva} må løses i planet – rettingen flytter ikke linjen du har tegnet`);
    }
    if (bruddEtter && bruddEtter.per.data) {
      deler.push(`${bruddEtter.per.data} profiler mangler terrengdata`);
    }
    const tittel = modus === 'inngrep' ? 'Minst inngrep' : 'Rettet opp';
    const alt = bruddFor.totalt > 0 && igjen === 0 ? `alle ${bruddFor.totalt} brudd er borte` : null;
    if (alt) deler.unshift(alt);
    this.status(deler.length ? tittel + ': ' + deler.join(' · ') : 'Fant ingenting å rette.');
  },

  /**
   * Gjør linjen lovlig i planet, sa naer det tegnede som mulig.
   *
   * «Rett opp» flytter høyder. Men star knekkpunktene for tett, er det ikke
   * høydene som er problemet: da far ikke kurvene plass, og linjeføringen ma
   * korte dem inn - en radius pa 30 m kan ende pa fire. Og en firemetersving
   * tillater bare 12 % stigning etter normalen, uansett hvor mye man flytter
   * pa profilen. Malt pa en ekte trase med 40 knekkpunkt pa 850 m: fjorten
   * kurver innkortet, fem under minstekravet, minste radius 3,9 m.
   *
   * Her fjernes de knekkpunktene som star i veien, ett om gangen, og hver gang
   * det som koster minst - malt som hvor langt linjen da flytter seg fra det
   * du tegnet. Sa langt det gar settes radiene tilbake opp mot det du ba om.
   *
   * @param {number} [maksAvvik] hvor langt linjen far flytte seg, i meter
   */
  async gjorLovlig(maksAvvik = 8) {
    if (!this.linje || this.P.ip.length < 3) {
      this.status('Tegn en senterlinje først.');
      return;
    }
    const mal = this.P.mal;
    const minR = mal.minRadius || 0;

    /* Et forslag er ulovlig sa lenge en kurve ligger under minstekravet eller
       en kurve matte kortes inn for a fa plass. */
    const ulovlige = (l) => {
      let n = 0;
      for (const k of l.kurver) if (minR && k.r < minR - 1e-6) n++;
      n += (l.advarsler || []).filter(a => /kortet inn|skarp knekk/.test(a.tekst)).length;
      return n;
    };
    /* Hvor langt flytter linjen seg?

       Males mot den opprinnelige LINJEN, ikke mot knekkpunktene. Kurvene
       kutter hjørnene, sa en linje ligger alt titalls meter fra sine egne
       knekkpunkt i en hairnal - males det mot punktene, ser selv den
       uforandrede linjen ut til a ha flyttet seg ti meter.

       Malingen ma vaere billig. Søket prøver hvert knekkpunkt i hver runde, og
       med `projiser` - som gar gjennom hele elementlisten for hvert punkt -
       tok en enkelt maling 34 ms. Ganger noen og tretti kandidater ganger noen
       og tretti runder ble det nesten et minutt, og knappen sto og malte.
       Her legges begge linjene ut som punktrekker en gang, og avstanden males
       punkt mot linjestykke. Samme svar, under et halvt millisekund. */
    const somPunkter = (l, antall = 120) => {
      const ut = [];
      const steg = l.lengde / antall;
      for (let i = 0; i <= antall; i++) {
        const p = l.punktVed(Math.min(i * steg, l.lengde));
        ut.push(p.x, p.y);
      }
      return ut;
    };
    let foerPunkter = null;
    const avvikFra = (l) => {
      if (!foerPunkter) foerPunkter = somPunkter(forLinje, 120);
      const b = somPunkter(l, 120);
      let verst = 0;
      for (let i = 0; i < foerPunkter.length; i += 2) {
        const px = foerPunkter[i], py = foerPunkter[i + 1];
        let naermest = Infinity;
        for (let j = 0; j + 3 < b.length; j += 2) {
          const ax = b[j], ay = b[j + 1], bx = b[j + 2], by = b[j + 3];
          const dx = bx - ax, dy = by - ay;
          const len2 = dx * dx + dy * dy;
          let t = len2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = ax + t * dx - px, qy = ay + t * dy - py;
          const d2 = qx * qx + qy * qy;
          if (d2 < naermest) naermest = d2;
        }
        if (naermest < Infinity) verst = Math.max(verst, Math.sqrt(naermest));
      }
      return verst;
    };

    const opprinnelig = this.ipTilUtm();
    let na = opprinnelig.map(p => Object.assign({}, p));
    const forLinje = new Linjeforing(opprinnelig);
    const forUlovlige = ulovlige(forLinje);
    if (!forUlovlige) {
      this.status('Linjen er allerede lovlig i planet – bruk «Rett opp» for høydene.');
      return;
    }

    this.framdrift(true, 'Finner nærmeste lovlige linje…', 0.1);
    let fjernet = 0, hevet = 0, verstAvvik = 0;
    try {
      await pause();
      /* Hva et forslag koster. Lovlighet er ikke nok: fjerner man knekkpunkt
         uten a se pa massene, flytter linjen seg inn i en annen li og
         sprengningen kan mangedobles - malt pa en ekte trase gikk den fra
         6 161 til 14 737 kubikk for a rette opp planet. Da er ikke veien
         bedre, bare lovlig. */
      const massekost = (liste) => {
        try {
          const r = this.beregnRaskt(this.P.vip, new Linjeforing(liste));
          const s = r.sum, b = r.balanse;
          return s.skjaeringFjell * 3 + s.skjaeringLosmasse
            + b.manglerTotalt * 1.5 + b.tilDeponi;
        } catch (e) { return Infinity; }
      };
      const ULOVLIGPRIS = 400;      // hva ett problem i planet er verdt i masse
      let besteTilstand = { liste: na, poeng: ulovlige(forLinje) * ULOVLIGPRIS + massekost(na), fjernet: 0 };
      let lovligste = null;   // den som kom lengst i a gjøre planet lovlig, uansett masse

      /* 1) Fjern knekkpunkt til kurvene far plass. Endepunktene star: de er
            der veien begynner og slutter. Massen males en gang per runde, pa
            det forslaget som ser best ut geometrisk - a male hvert forsøk
            ville kostet hundrevis av beregninger. */
      /* Hardt tidsbudsjett. Massemalingen er den dyre delen - den kaller hele
         beregningen - og pa en lang veg med mange knekkpunkt kan søket ellers
         bli staende. Bedre a levere det beste man fant pa tjue sekunder enn a
         la brukeren se pa en framdriftsboks. */
      const frist = performance.now() + 20000;
      let gikkTomtForTid = false;

      for (let runde = 0; runde < opprinnelig.length; runde++) {
        if (performance.now() > frist) { gikkTomtForTid = true; break; }
        const l = new Linjeforing(na);
        if (!ulovlige(l)) break;
        let beste = null;
        for (let i = 1; i < na.length - 1; i++) {
          const forsok = na.filter((_, j) => j !== i);
          if (forsok.length < 2) continue;
          const lf = new Linjeforing(forsok);
          if (lf.lengde <= 1) continue;
          const u = ulovlige(lf);
          const a = avvikFra(lf);
          if (a > maksAvvik) continue;
          // færrest ulovlige først, sa minst avvik fra det tegnede
          if (!beste || u < beste.u || (u === beste.u && a < beste.a)) beste = { i, u, a, forsok };
        }
        if (!beste) break;                       // ingenting mer a fjerne innenfor avviket
        na = beste.forsok;
        fjernet++;
        verstAvvik = beste.a;

        if (!lovligste || beste.u < lovligste.u) lovligste = { liste: na, u: beste.u, fjernet, avvik: beste.a };
        const poeng = beste.u * ULOVLIGPRIS + massekost(na);
        if (poeng < besteTilstand.poeng) besteTilstand = { liste: na, poeng, fjernet, avvik: beste.a };

        this.framdrift(true, 'Finner nærmeste lovlige linje…', 0.1 + 0.6 * runde / opprinnelig.length);
        if (runde % 2 === 0) await pause();
      }

      /* Behold den tilstanden som kom best ut samlet - ikke bare den siste.
         Greedy-søket kan gaa forbi det beste punktet og fortsette a fjerne. */
      na = besteTilstand.liste;
      fjernet = besteTilstand.fjernet;

      /* Kom den beste ut som «gjør ingenting», har vi likevel sett alternativer
         underveis. Da er svaret ikke «fant ingen lovlig linje» - det er at de
         lovlige koster mer masse enn de er verdt. Det er en avveining
         brukeren skal ta, ikke programmet. */
      if (fjernet === 0 && lovligste && lovligste.u < ulovlige(forLinje)) {
        const naKost = massekost(opprinnelig);
        const daKost = massekost(lovligste.liste);
        const ja = await this.bekreft(
          `Linjen kan bli lovligere ved å fjerne ${lovligste.fjernet} knekkpunkt: `
          + `${ulovlige(forLinje) - lovligste.u} av ${ulovlige(forLinje)} problemer i planet forsvinner, `
          + `og den flytter seg inntil ${lovligste.avvik.toFixed(1)} m. `
          + `Men det koster masse: regnestykket går fra ${Math.round(naKost).toLocaleString('nb-NO')} `
          + `til ${Math.round(daKost).toLocaleString('nb-NO')} i vektet volum. Vil du det likevel?`,
          'Gjør lovlig likevel');
        if (ja) { na = lovligste.liste; fjernet = lovligste.fjernet; verstAvvik = lovligste.avvik; }
        else {
          this.framdrift(false);
          this.status('Linjen står som du tegnet den. '
            + 'Færre knekkpunkt i svingene, eller lavere minsteradius i vegmalen, gir en billigere lovlig linje.');
          return;
        }
      }

      /* 2) Sett radiene opp igjen mot det som ble bedt om, sa langt de far
            plass. Etter at punkt er fjernet er det ofte rom for mer. */
      const ønsket = this.P.standardRadius || 30;
      for (let i = 1; i < na.length - 1 && performance.now() < frist + 5000; i++) {
        const start = na[i].r;
        for (const r of [ønsket, ønsket * 0.75, ønsket * 0.5, Math.max(minR, 10)]) {
          if (r <= start + 1e-9) continue;
          const forsok = na.map((p, j) => j === i ? Object.assign({}, p, { r }) : p);
          const lf = new Linjeforing(forsok);
          if (ulovlige(lf) === 0 && avvikFra(lf) <= maksAvvik) {
            na = forsok; hevet++; break;
          }
        }
      }

      const etterLinje = new Linjeforing(na);
      const etterUlovlige = ulovlige(etterLinje);
      verstAvvik = avvikFra(etterLinje);

      if (etterUlovlige >= forUlovlige) {
        this.framdrift(false);
        this.status(`Fant ingen lovlig linje innenfor ${maksAvvik} m fra den du tegnet. `
          + 'Prøv å tegne færre knekkpunkt i svingene, eller senk minsteradiusen i vegmalen.');
        return;
      }

      const ja = await this.bekreft(
        `Linjen kan gjøres lovlig ved å fjerne ${fjernet} knekkpunkt`
        + (hevet ? ` og sette opp radien i ${hevet}` : '')
        + `. Den flytter seg da inntil ${verstAvvik.toFixed(1)} m fra der du tegnet den, `
        + `og ${forUlovlige - etterUlovlige} av ${forUlovlige} problemer i planet forsvinner. `
        + 'Vil du det?', 'Gjør lovlig');
      if (!ja) { this.framdrift(false); this.status('Linjen står som du tegnet den'); return; }

      this.merk('gjør linjen lovlig');
      this.P.ip = na.map(p => {
        const g = Geo.fraUtm(p.x, p.y, this.sone);
        return { lat: g.lat, lon: g.lon, r: p.r };
      });
      this._terrengnokkel = '';
      this.byggLinje();
      await this.oppdater();
    } catch (e) {
      this.status('Klarte ikke gjøre linjen lovlig: ' + e.message);
      return;
    } finally {
      this.framdrift(false);
    }

    // og sa høydene, sa hele veien er lovlig og ikke bare planet
    await this.rettOpp();
    const igjen = this.tellBrudd();
    this.status(`Linjen er gjort lovlig: ${fjernet} knekkpunkt fjernet`
      + (hevet ? `, radien satt opp i ${hevet}` : '')
      + `, inntil ${verstAvvik.toFixed(1)} m fra den tegnede. `
      + (igjen && igjen.totalt ? `${igjen.totalt} brudd står igjen.` : 'Ingen brudd igjen.'));
  },

  /**
   * Hvor mye linjen svinger til sammen, i grader.
   *
   * En rett veg har null. Hver sving legger til graden sin, sa en linje som
   * gar fram og tilbake far et høyt tall selv om hver enkelt sving er liten.
   * Brukes til a hindre at sidelengs flytting kjøper noen kubikk masse for en
   * veg i sikksakk - den er dyrere a bygge og verre a kjøre.
   */
  samletAvboyning(linje) {
    let sum = 0;
    for (const k of ((linje || this.linje || {}).kurver || [])) sum += Math.abs(k.avbøy);
    return sum * 180 / Math.PI;
  },

  /* ---------------- optimalisering ---------------- */

  async balanser() {
    this.merk('balanser massene');
    if (!this.terreng || !this.linje) return;
    if (this.P.vip.every(v => v.laast)) {
      this.status('Alle høyder er låst – lås opp noen for å kunne balansere massene');
      return;
    }
    this.framdrift(true, 'Finner høyden som gir massebalanse…', 0.1);
    try {
      await pause();
      const grunn = this.P.vip.map(v => ({ s: v.s, z: v.z, k: v.k, laast: v.laast }));
      // Laste høyder blir liggende; bare de andre løftes eller senkes
      const flytt = (liste, d) => liste.map(v => ({ s: v.s, z: v.laast ? v.z : v.z + d, k: v.k }));
      const verdi = d => this.beregnRaskt(flytt(grunn, d)).balanse.balanse;
      this._balanseTraffIkke = null;
      let lo = -8, hi = 8;
      let vLo = verdi(lo), vHi = verdi(hi);
      let d;
      if (vLo * vHi > 0) {
        /* Ingen fortegnsskifte innenfor atte meter opp eller ned: balansen
           lar seg ikke treffe ved a flytte profilen loddrett. Da velges
           endepunktet som kommer nærmest - men det ma sies, ellers ser det ut
           som om programmet fant balansen, og profilen har i stillhet flyttet
           seg atte meter. */
        d = Math.abs(vLo) < Math.abs(vHi) ? lo : hi;
        this._balanseTraffIkke = Math.abs(Math.abs(vLo) < Math.abs(vHi) ? vLo : vHi);
      } else {
        for (let i = 0; i < 26; i++) {
          const midt = (lo + hi) / 2;
          const vM = verdi(midt);
          if (vLo * vM <= 0) { hi = midt; vHi = vM; } else { lo = midt; vLo = vM; }
          this.framdrift(true, 'Finner høyden som gir massebalanse…', 0.1 + 0.9 * i / 26);
          if (i % 6 === 0) await pause();
        }
        d = (lo + hi) / 2;
      }
      this.P.vip.forEach(v => { if (!v.laast) v.z += d; });
      this.beregn();
      if (this._balanseTraffIkke != null) {
        const rest = Math.round(this._balanseTraffIkke);
        this._balanseTraffIkke = null;
        this.status(`Fant ingen høyde som gir balanse innenfor åtte meter. `
          + `Profilen er flyttet ${d > 0 ? '+' : ''}${d.toFixed(1)} m, og det står `
          + `${Math.abs(rest).toLocaleString('nb-NO')} m³ igjen i ubalanse.`);
      }
    } catch (e) {
      this.status('Massebalanseringen feilet: ' + e.message);
    } finally {
      this.framdrift(false);
    }
  },

  async optimaliser(stille, modus) {
    if (!this.terreng || !this.linje) return;
    // «Rett opp» kaller hit selv og har alt tatt sitt merke - ikke to for en handling
    if (!stille) this.merk(modus === 'inngrep' ? 'minst inngrep' : 'optimaliser');
    const V = this.P.vip;
    if (V.length < 2) return;
    if (V.every(v => v.laast)) {
      if (!stille) this.status('Alle høyder er låst – lås opp noen for å kunne optimalisere');
      return;
    }
    const maksTillatt = this.P.mal.stigningIKurve.reduce((a, r) => Math.max(a, r[1], r[2]), 0);

    const mal = this.P.mal;
    const inngrep = modus === 'inngrep';
    const kostnad = (liste, linje) => {
      const r = this.beregnRaskt(liste, linje);
      const s = r.sum, b = r.balanse;
      const vpKost = new Vertikalprofil(liste);

      /* To ulike malestokker, fordi de ikke er samme sak:

         BILLIGST tar hensyn til hva postene koster. Sprengning er dyrest, sa
         den godtar gjerne mer fylling for a slippe a sprenge.

         MINST INNGREP bryr seg ikke om hva noe koster - den teller alt som
         blir flyttet likt, og vekter fotavtrykket og avstanden til terrenget
         tungt. Da blir det ikke gravd eller fylt mer enn nødvendig, selv om
         regnestykket kunne blitt billigere av a gjøre mer. */
      let k = inngrep
        ? (s.skjaering + s.fylling) * 1
        + s.rensk * 6
        + Math.abs(b.balanse) * 0.3
        : s.skjaeringFjell * 3
        + s.skjaeringLosmasse * 1
        + Math.abs(b.balanse) * 1.6
        + s.rensk * 2
        + s.fylling * 0.5;

      /* Følg terrenget. Dette er arealet mellom veglinjen og bakken i
         lengdeprofilen - jo mindre, jo tettere ligger veien pa terrenget.
         Volumleddene over drar i samme retning, men de kan gi like svar for
         en veg som ligger rolig oppa bakken og en som svinger over og under
         den. Dette leddet skiller dem, og det er den rolige man vil ha. */
      if (this.terrengProfil) {
        const tp = this.terrengProfil;
        // hvert femte punkt holder til a male et areal
        const hopp = Math.max(1, Math.round(5 / Math.max(0.5, tp.s[1] - tp.s[0])));
        let avvik = 0;
        for (let i = hopp; i < tp.s.length; i += hopp) {
          if (!isFinite(tp.z[i]) || !isFinite(tp.z[i - hopp])) continue;
          const dA = Math.abs(vpKost.hoyde(tp.s[i - hopp]) - tp.z[i - hopp]);
          const dB = Math.abs(vpKost.hoyde(tp.s[i]) - tp.z[i]);
          avvik += (dA + dB) / 2 * (tp.s[i] - tp.s[i - hopp]);
        }
        k += avvik * (inngrep ? 120 : 30);
      }

      /* Kravene fra veiklassen og grensene for hva som lar seg bygge legges
         inn som svaert dyre brudd. Uten dette ville optimaliseringen valgt
         den løsningen som er billigst pa papiret - gjerne en 20 % bakke i en
         30-meterskurve, eller en fylling som stikker 40 m ut. */
      for (const m of r.merknader) {
        if (m.type === 'kurvatur') k += 200000;
        /* Vertikalkurvene hadde ingen straff. «Rett opp» retter dem, og sa
           kjører optimaliseringen etterpa og star fritt til a lage dem pa
           nytt - den merket dem ikke som noe a unnga. */
        if (m.type === 'vertikalkurve') k += 60000;
      }
      /* Bruddene telles per profil, men optimaliseringen regner med grovere
         profilavstand enn rapporten - femten meter mot fem. Da ser den bare en
         tredjedel sa mange brudd, og straffen ble tilsvarende for liten:
         malt pa en prøvevei sa rapporten 46 skjæringsbrudd der
         optimaliseringen sa 15.

         Løsningen er ikke a regne finere - det ville tredoblet arbeidet - men
         a male straffen per meter veg i stedet for per profil. Da veier et
         brudd like tungt uansett hvor tett profilene star, og
         volumleddene over er allerede uavhengige av oppløsningen. */
      const perMeter = r.stasjoner.length > 1 ? (r.stasjoner[1] - r.stasjoner[0]) : 5;
      for (const pr of r.profiler) {
        const g = vpKost.stigning(pr.s);
        /* Kravet males mot den effektive radien, slik det gjøres overalt
           ellers: normalen sier at stigningen skal flates ut ogsa pa
           innkjøringen til en knapp kurve. Med `pr.radius` siktet
           optimaliseringen mot en slakkere regel enn den rapporten handhever,
           og kunne lande pa en løsning som straks ble meldt som brudd. */
        const kravRadius = effektivRadius(this.linje, mal, pr.s);
        const tillatt = maksStigningFraRadius(mal, kravRadius, g, mal.lassretning);
        if (Math.abs(g) > tillatt) k += (Math.abs(g) - tillatt) * 80000 * perMeter;

        if (mal.maksFyllingshoyde > 0 && pr.maksFylling > mal.maksFyllingshoyde) {
          k += (pr.maksFylling - mal.maksFyllingshoyde) * 600 * perMeter;
        }
        if (mal.maksSkjaeringsdybde > 0 && pr.maksSkjaering > mal.maksSkjaeringsdybde) {
          k += (pr.maksSkjaering - mal.maksSkjaeringsdybde) * 600 * perMeter;
        }
        if (mal.maksUtslag > 0) {
          const utslag = Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;
          if (utslag > mal.maksUtslag) k += (utslag - mal.maksUtslag) * 400 * perMeter;
        }
        if (pr.advarsel) k += 10000 * perMeter;   // skraningen fant ikke terrenget
      }
      return k;
    };

    this.framdrift(true, 'Optimaliserer lengdeprofilen…', 0);
    try {
    await pause();
    let best = V.map(v => ({ s: v.s, z: v.z, k: v.k, laast: v.laast }));
    let bestK = kostnad(best);
    let steg = 1.5;
    const runder = 4;
    /* Tidsbudsjett. Søket er proporsjonalt med antall knekkpunkt ganger antall
       runder, og pa en lang veg med tette høyder kan det bli langt. Bedre a
       levere det beste man fant enn a la brukeren se pa en framdriftsboks. */
    const oFrist = performance.now() + 30000;
    for (let runde = 0; runde < runder; runde++) {
      if (performance.now() > oFrist) break;
      for (let i = 0; i < best.length; i++) {
        if (best[i].laast) continue;             // denne høyden er bestemt
        for (const d of [steg, -steg]) {
          const forsok = best.map((v, j) => ({ s: v.s, z: v.z + (j === i ? d : 0), k: v.k, laast: v.laast }));
          const kk = kostnad(forsok);
          if (kk < bestK - 1e-6) { best = forsok; bestK = kk; }
        }
        // profilsøket eier første del av stolpen, sidelengs flytting resten
        this.framdrift(true, 'Optimaliserer lengdeprofilen…', 0.6 * (runde + i / best.length) / runder);
        if (i % 4 === 0) await pause();
      }
      steg /= 2;
    }
    /* Sidelengs flytting av linjen.
       Pa en sidebratt li ligger det ofte mye a spare pa a flytte veien noen
       meter inn i skraningen i stedet for a bygge en høy fylling ut. Hvert
       knekkpunkt prøves flyttet pa tvers, og linjen bygges pa nytt sa
       kurvene fortsatt blir riktige. */
    const maksSide = this.P.mal.sideforskyvning || 0;
    let flyttet = 0;
    if (maksSide > 0 && this.P.ip.length >= 2) {
      const start = this.ipTilUtm();
      let beste = start.map(p => Object.assign({}, p));
      let besteK = kostnad(best, new Linjeforing(beste))
        + this.samletAvboyning(new Linjeforing(beste)) * 40;
      let sideSteg = Math.min(maksSide, 1.5);

      for (let runde = 0; runde < 3; runde++) {
        if (performance.now() > oFrist + 15000) break;
        for (let i = 0; i < beste.length; i++) {
          for (const d of [sideSteg, -sideSteg]) {
            const forsok = beste.map(p => Object.assign({}, p));
            const flytta = this.flyttIpSidelengs(beste, i, d);
            // hold oss innenfor det brukeren har tillatt, malt fra der punktet la
            const samlet = Math.hypot(flytta.x - start[i].x, flytta.y - start[i].y);
            if (samlet > maksSide + 1e-6) continue;
            forsok[i] = flytta;
            const linje2 = new Linjeforing(forsok);
            if (linje2.lengde <= 1) continue;
            /* En veg som svinger fram og tilbake er ikke en bedre veg, selv om
               den treffer litt billigere terreng. Uten dette leddet kunne
               sidelengs flytting kjøpe noen kubikk for en linje i sikksakk -
               den er dyrere a bygge, verre a kjøre, og ikke det noen ba om.
               Malt som samlet avbøyning: en rett veg har null, og hver sving
               legger til graden sin. */
            const kk = kostnad(best, linje2) + this.samletAvboyning(linje2) * 40;
            if (kk < besteK - 1e-6) { beste = forsok; besteK = kk; }
          }
          this.framdrift(true, 'Prøver å flytte linjen sidelengs…', 0.6 + 0.4 * (runde + i / beste.length) / 3);
          if (i % 3 === 0) await pause();
        }
        sideSteg /= 2;
      }
      /* Senterlinjen flyttes for alvor - knekkpunktene i kartet far nye
         koordinater, sa linjen ligger fortsatt midt i veien. Den gamle
         plasseringen tas vare pa, slik at flyttingen kan angres. */
      const forrige = this.P.ip.map(p => ({ lat: p.lat, lon: p.lon, r: p.r }));
      this.flyttingsliste = [];
      for (let i = 0; i < beste.length; i++) {
        const d = Math.hypot(beste[i].x - start[i].x, beste[i].y - start[i].y);
        if (d > 0.01) {
          flyttet++;
          const g = Geo.fraUtm(beste[i].x, beste[i].y, this.sone);
          this.P.ip[i].lat = g.lat; this.P.ip[i].lon = g.lon;
          this.flyttingsliste.push({ nr: i + 1, meter: d });
        }
      }
      if (flyttet) this._ipForFlytting = forrige;
      this._terrengnokkel = '';       // korridoren ma lastes for den nye linjen
      this.byggLinje();
    }

    this.P.vip = best;
    if (flyttet) {
      await this.lastTerreng();
      this.hentTerrengProfil();
      this.justerProfilTilLengde();
      Kart.tegn();
    }
    this.beregn();
    if (flyttet && !stille) this.status(`Optimalisert – ${flyttet} knekkpunkt flyttet sidelengs`);
    } catch (e) {
      if (!stille) this.status('Optimaliseringen feilet: ' + e.message);
      else throw e;
    } finally {
      this.framdrift(false);
    }
  },

  /** Setter senterlinjen tilbake dit den la før optimaliseringen flyttet den. */
  /**
   * Setter sidelengs flytting tilbake.
   *
   * Her sto det `this.P.ip = <bildet fra før flyttingen>`. Det byttet ut hele
   * punktlisten, sa alt du hadde gjort etterpa - lagt inn en sving, slettet et
   * punkt, endret en radius - forsvant med det samme. Og fordi handlingen ikke
   * gikk om historikken, kunne den ikke angres.
   *
   * Na settes bare de punktene tilbake som faktisk ble flyttet, og bare de som
   * fortsatt star der de sto. Har listen endret seg sa mye at punktene ikke
   * lar seg kjenne igjen, sies det ifra i stedet for a rydde vekk arbeid.
   */
  async angreFlytting() {
    if (!this._ipForFlytting) return;
    const før = this._ipForFlytting;

    if (this.P.ip.length !== før.length) {
      this.status('Linjen har fått eller mistet knekkpunkt siden flyttingen – '
        + 'sett dem tilbake for hånd, eller bruk Angre');
      return;
    }

    this.merk('angre sidelengs flytting');
    let satt = 0;
    for (const f of (this.flyttingsliste || [])) {
      const i = f.nr - 1;
      if (i < 0 || i >= this.P.ip.length || !før[i]) continue;
      this.P.ip[i].lat = før[i].lat;
      this.P.ip[i].lon = før[i].lon;
      satt++;
    }
    this._ipForFlytting = null;
    this.flyttingsliste = [];
    this._terrengnokkel = '';
    await this.oppdater();
    this.status(satt
      ? `${satt} knekkpunkt satt tilbake dit du tegnet dem`
      : 'Fant ingen flyttede punkt å sette tilbake');
  },

  /* ---------------- kontroll mot Kartverket ---------------- */

  async kontrollerHoyder() {
    const boks = document.getElementById('kontrollsvar');
    if (!this.linje || !this.terreng) { boks.textContent = 'Ingen linje å kontrollere.'; return; }
    boks.textContent = 'Spør Kartverket …';
    const punkter = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const s = this.linje.lengde * (i + 0.5) / n;
      const t = (i % 7 - 3) * 4;
      const p = this.linje.punktMedAvvik(s, t);
      punkter.push([+p.x.toFixed(3), +p.y.toFixed(3)]);
    }
    try {
      const bolker = [];
      for (let i = 0; i < punkter.length; i += 40) bolker.push(punkter.slice(i, i + 40));
      const svar = [];
      for (const b of bolker) {
        const r = await fetch(`api/punkt?sr=${Geo.epsg(this.sone)}&punkter=${encodeURIComponent(JSON.stringify(b))}`);
        const d = await r.json();
        svar.push(...(d.punkter || []));
      }
      let maks = 0, sum = 0, m = 0, kilder = new Set();
      svar.forEach((p, i) => {
        if (p.z == null) return;
        const z = this.terreng.z(punkter[i][0], punkter[i][1]);
        if (!isFinite(z)) return;
        const d = Math.abs(z - p.z);
        maks = Math.max(maks, d); sum += d; m++;
        if (p.datakilde) kilder.add(p.datakilde);
      });
      boks.innerHTML = m
        ? `<div class="rad"><span>Kontrollpunkt</span><span>${m} stk</span></div>
           <div class="rad"><span>Gjennomsnittlig avvik</span><span>${(sum / m).toFixed(3)} m</span></div>
           <div class="rad"><span>Største avvik</span><span>${maks.toFixed(3)} m</span></div>
           <div class="rad"><span>Datakilde</span><span>${[...kilder].join(', ') || '–'}</span></div>
           <div style="margin-top:6px">Avviket kommer av at API-et oppgir høyden med to desimaler. Modellen i programmet er den samme.</div>`
        : 'Fikk ingen høyder tilbake.';
    } catch (e) {
      boks.textContent = 'Kontrollen feilet: ' + e.message;
    }
  },

  /* ---------------- skjema ---------------- */

  malTilSkjema() {
    const m = this.P.mal, f = this.P.faktorer, g = this.P.fjell;
    const sett = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    this.visMalfane();
    /* Skjemaet er vegmalen. En tomt har sine egne felt, og a la vegskjemaet
       lese en tomtemal ville fylt hvert felt med undefined - og verre: neste
       gang noen rørte et felt, ville skjemaet skrevet vegverdier inn i tomtas
       mal. Faktorene og grunnforholdene er felles og settes fortsatt. */
    if (this.erTomt()) { this.grunnTilSkjema(f, g); return; }
    sett('m_vegbredde', m.vegbredde);
    sett('m_tverrfall', (m.tverrfall * 100).toFixed(1));
    sett('m_tverrfallType', m.tverrfallType);
    sett('m_slitelagTykkelse', m.slitelagTykkelse);
    sett('m_slitelagBredde', m.slitelagBredde);
    sett('m_baerelagTykkelse', m.baerelagTykkelse);
    sett('m_grofteDybdePlanum', m.grofteDybdePlanum);
    sett('m_grofteBunn', m.grofteBunn);
    sett('m_grofteInnerHelning', m.grofteInnerHelning);
    sett('m_skjaeringLosmasse', m.skjaeringLosmasse);
    sett('m_skjaeringFjell', m.skjaeringFjell);
    sett('m_fylling', m.fylling);
    sett('m_renskDybde', m.renskDybde);
    sett('m_renskUtenfor', m.renskUtenfor);
    sett('m_utvidelseOvergang', m.utvidelseOvergang);
    sett('m_veiklasse', m.veiklasse || 'egen');
    sett('m_lassretning', String(m.lassretning || -1));
    this.visVeiklasse();
    this.visKravtabell();
    sett('m_maksFyllingshoyde', m.maksFyllingshoyde);
    sett('m_maksSkjaeringsdybde', m.maksSkjaeringsdybde);
    sett('m_maksUtslag', m.maksUtslag);
    sett('m_beregningsbredde', m.beregningsbredde);
    sett('m_sideforskyvning', m.sideforskyvning || 0);
    sett('m_profilAvstand', this.P.profilAvstand);
    sett('m_maksSokebredde', m.maksSokebredde);
    document.getElementById('m_bakkekorreksjon').checked = !!this.P.bakkekorreksjon;
    this.grunnTilSkjema(f, g);
  },

  /** Faktorene og grunnforholdene er felles for alle anlegg i prosjektet. */
  grunnTilSkjema(f, g) {
    const sett = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    sett('f_sprengningsfaktor', f.sprengningsfaktor);
    sett('f_fjellIFylling', f.fjellIFylling);
    sett('f_losmasseIFylling', f.losmasseIFylling);
    sett('f_brukbarLosmasse', f.brukbarLosmasse);
    sett('g_standarddybde', g.standarddybde);
    sett('g_rekkevidde', g.rekkevidde);
    this.visStrekninger();
    this.visSonderinger();
  },

  /**
   * Fanene i sidepanelet skifter med modus.
   *
   * Vegen har Masser, Høyder, Vegmal, Grunnforhold og Linje. En tomt har ingen
   * høyder langs en stasjonering og ingen linje, sa de to fanene ville staat
   * tomme - og en fane som ikke gjør noe er verre enn ingen fane, for man tror
   * den er i stykker. I stedet far tomta sin egen malfane.
   */
  visMalfane() {
    const tomt = this.erTomt();
    const vis = (velger, pa) => {
      const e = document.querySelector(velger);
      if (e) e.classList.toggle('skjult', !pa);
    };
    vis('.fane[data-fane="hoyder"]', !tomt);
    vis('.fane[data-fane="linje"]', !tomt);
    vis('.fane[data-fane="mal"]', !tomt);
    vis('.fane[data-fane="tomtemal"]', tomt);
    vis('.fane[data-fane="tomthoyde"]', tomt);
    vis('#visTomtefargerBoks', tomt);
    /* KNAPPETEKSTEN MÅ SI HVA KNAPPEN FAKTISK LEVERER.
       En knapp som heter «Masseoppsett per profil» og leverer et sammendrag
       uten en eneste profil, er verre enn ingen knapp. Og «Linjeføring og
       profil (LandXML)» leverer flater for en tomt, ikke en linjeføring. */
    const tekst = (id, s) => { const e = document.getElementById(id); if (e) e.textContent = s; };
    tekst('knappEksportKof', tomt ? 'Hjørner og utslag (KOF)' : 'Stikningsdata (KOF)');
    tekst('knappEksportLandxml', tomt ? 'Flater og utslag (LandXML)' : 'Linjeføring og profil (LandXML)');
    tekst('knappEksportSosi', tomt ? 'Tomteflate (SOSI)' : 'Kartdata (SOSI)');
    tekst('knappEksportDxf', tomt ? 'Tegning av tomta (DXF)' : 'Tegning (DXF)');
    tekst('knappEksportStikning', tomt ? 'Stikningspunkt (CSV)' : 'Stikningsdata (CSV)');
    tekst('knappEksportMasser', tomt ? 'Massesammendrag (CSV)' : 'Masseoppsett per profil (CSV)');
    tekst('knappEksportGeojson', tomt ? 'Tomt, grense og utslag (GeoJSON)' : 'Linje og fotavtrykk (GeoJSON)');
    vis('#knappEksportRutenett', tomt);
    const notis = document.getElementById('eksportnotis');
    if (notis) {
      notis.textContent = tomt
        ? 'Filene inneholder den ferdige flaten, tomtegrensa, skråningsutslaget og murene. '
        + 'Der skråningen ikke landet, blir utslagslinja delt opp og merket – den lukkes '
        + 'aldri over et sted som ikke er regnet. Ta en prøveimport av én fil før dere '
        + 'baserer en jobb på dem.'
        : 'Formatene er skrevet etter spesifikasjonene, men er ikke prøvd mot hvert enkelt '
        + 'mottakersystem. Ta en prøveimport av én fil før dere baserer en jobb på dem.';
    }
    for (const [navn, tekst, etter] of [['tomthoyde', 'Høyde', 'masser'], ['tomtemal', 'Tomtemal', 'tomthoyde']]) {
      if (document.querySelector('.fane[data-fane="' + navn + '"]')) continue;
      const rad = document.querySelector('.faner');
      const foran = document.querySelector('.fane[data-fane="' + etter + '"]');
      if (!rad || !foran) continue;
      const k = document.createElement('button');
      k.className = 'fane'; k.dataset.fane = navn; k.textContent = tekst;
      k.onclick = () => this.visFane(navn);
      rad.insertBefore(k, foran.nextSibling);
      k.classList.toggle('skjult', !tomt);
    }
    let knapp = document.querySelector('.fane[data-fane="tomtemal"]');
    if (!knapp) {
      const rad = document.querySelector('.faner');
      const malknapp = document.querySelector('.fane[data-fane="mal"]');
      if (rad && malknapp) {
        knapp = document.createElement('button');
        knapp.className = 'fane';
        knapp.dataset.fane = 'tomtemal';
        knapp.textContent = 'Tomtemal';
        rad.insertBefore(knapp, malknapp.nextSibling);
        knapp.onclick = () => this.visFane('tomtemal');
        knapp.classList.toggle('skjult', !tomt);
      }
    }
    /* Star man pa en fane som nettopp ble skjult, ma man flyttes - ellers blir
       sidepanelet tomt uten at noe forklarer hvorfor. */
    const aktiv = document.querySelector('.fane.aktiv');
    if (aktiv && aktiv.classList.contains('skjult')) this.visFane('masser');
    if (tomt) { this.tomthoydeTilSkjema(); this.tomtemalTilSkjema(); }
  },

  /** Bytter fane i sidepanelet. */
  visFane(navn) {
    if (navn === 'forklaring') Forklaring.vis(this);
    for (const f of document.querySelectorAll('.fane')) f.classList.toggle('aktiv', f.dataset.fane === navn);
    for (const d of document.querySelectorAll('.faneinnhold')) d.classList.toggle('aktiv', d.id === 'fane-' + navn);
  },

  /** Terrenget over tomta: laveste, middel og høyeste. */
  terrengOverTomta() {
    const p = this.tomtIUtm();
    if (p.length < 3 || !this.terreng) return null;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (const q of p) {
      minX = Math.min(minX, q.x); maksX = Math.max(maksX, q.x);
      minY = Math.min(minY, q.y); maksY = Math.max(maksY, q.y);
    }
    let sum = 0, n = 0, lav = Infinity, hoy = -Infinity;
    for (let y = minY; y <= maksY; y += 1) {
      for (let x = minX; x <= maksX; x += 1) {
        if (!Tomtmasser.innenforPolygon(p, x, y)) continue;
        const z = this.terreng.z(x, y);
        if (!Number.isFinite(z)) continue;
        sum += z; n++; lav = Math.min(lav, z); hoy = Math.max(hoy, z);
      }
    }
    return n ? { lav, hoy, middel: sum / n, antall: n } : null;
  },

  /** Overbygningens tykkelse - avstanden fra ferdig nivå ned til planum. */
  overbygningstykkelse() {
    const m = this.P.mal;
    return (m.slitelagTykkelse || 0) + (m.baerelagTykkelse || 0)
      + (m.forsterkningslag || 0) + (m.frostsikring || 0) + (m.avrettingslag || 0);
  },

  /**
   * Høyden pa tomta - ett sted, med det man trenger for a velge den.
   *
   * Feltet la før inneklemt i verktøylinja nede, mellom fall, retning og
   * rutestørrelse. Da er det et tall man skriver i blinde. Her star terrenget
   * ved siden av: laveste, middel og høyeste punkt pa tomta, med en knapp for
   * hver. Da ser man hva man velger mellom, og hva valget koster - dypeste
   * skjæring, høyeste fylling og balansen star rett under.
   */
  tomthoydeTilSkjema() {
    const boks = document.getElementById('tomthoydeSkjema');
    if (!boks || !this.erTomt()) return;
    const t = this.P.tomt, n = t.nivaa;
    const har = t.punkter.length >= 3;
    if (!har) {
      boks.innerHTML = '<p class="notis">Tegn tomta i kartet først – klikk rundt den, '
        + 'dobbeltklikk eller Enter for å lukke.</p>';
      return;
    }
    const T = this.terrengOverTomta();
    const ob = this.overbygningstykkelse();
    const tall = (v, d = 2) => (Number.isFinite(v)
      ? v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
    const r = this.resultat;

    let ut = '<h3>Ferdig nivå</h3>';
    ut += '<div class="hoydevalg">'
      + `<input type="number" id="th_kote" step="0.05" value="${n.kote == null ? '' : n.kote.toFixed(2)}">`
      + '<span class="enhet">moh.</span></div>';
    ut += '<div class="knapperad hoydeverktoy">'
      + '<button class="knapp" id="th_foresla">Foreslå</button>'
      + '<button class="knapp" id="th_balanser">Massebalanse</button></div>';
    if (ob > 0.005) {
      ut += `<p class="notis">Planum ligger ${tall(ob)} m under dette – `
        + 'skråningene starter der, ikke i overflaten.</p>';
    }

    if (T) {
      ut += '<h3>Terrenget på tomta</h3><table class="noekkel">';
      ut += `<tr><td>Laveste</td><td>${tall(T.lav)} moh.</td>`
        + `<td><button class="knapp liten" data-legg="${(T.lav + ob).toFixed(2)}">Legg her</button></td></tr>`;
      ut += `<tr><td>Middel</td><td>${tall(T.middel)} moh.</td>`
        + `<td><button class="knapp liten" data-legg="${(T.middel + ob).toFixed(2)}">Legg her</button></td></tr>`;
      ut += `<tr><td>Høyeste</td><td>${tall(T.hoy)} moh.</td>`
        + `<td><button class="knapp liten" data-legg="${(T.hoy + ob).toFixed(2)}">Legg her</button></td></tr>`;
      ut += `<tr><td>Fall over tomta</td><td>${tall(T.hoy - T.lav, 1)} m</td><td></td></tr>`;
      ut += '</table>';
      ut += '<p class="notis">Knappene legger <b>planum</b> på terrenget, så '
        + 'overbygningen kommer oppå. Legger du på middelhøyden, blir det omtrent '
        + 'like mye å grave som å fylle.</p>';
    }

    ut += '<h3>Form</h3>';
    ut += '<div class="felt"><label>Nivået</label>'
      + `<select id="th_modus">
           <option value="flat"${n.modus === 'flat' ? ' selected' : ''}>Flatt</option>
           <option value="fall"${n.modus === 'fall' ? ' selected' : ''}>Fall i én retning</option>
         </select><span class="enhet"></span></div>`;
    if (n.modus === 'fall') {
      const f = (n.fall || 0) * 100;
      const somForhold = f > 0.001 ? '1:' + Math.round(100 / f) : 'flatt';
      ut += `<div class="felt"><label>Fall</label>`
        + `<input type="number" id="th_fall" step="0.5" min="0" max="15" value="${f.toFixed(1)}">`
        + `<span class="enhet">% · ${somForhold}</span></div>`;
      ut += `<div class="felt"><label>Retning</label>`
        + `<input type="number" id="th_retning" step="5" min="0" max="359" value="${Math.round(n.fallretning || 0)}">`
        + `<span class="enhet">° · ${this._himmelretning(n.fallretning || 0)}</span></div>`;
      ut += '<p class="notis">Retningen er dit vannet renner. Minstefall for at '
        + 'vann skal renne av er 1:100 på tett dekke og 1:50 på grus.</p>';
      if (f > 0.001 && f < (this.P.mal.minstefall || 0) * 100 - 1e-9) {
        ut += '<p class="notis">⚠ Under minstefallet – det blir stående vann.</p>';
      }
    }

    ut += '<div class="felt"><label>Rutenett</label>'
      + `<input type="number" id="th_rutenett" step="0.25" min="0.25" max="5" value="${this.P.mal.rutestorrelse}">`
      + '<span class="enhet">m</span></div>';

    if (r && r.sum) {
      ut += '<h3>Hva høyden koster</h3><table class="noekkel">';
      ut += `<tr><td>Dypeste skjæring</td><td>${tall(r.dypesteSkjaering)} m</td></tr>`;
      ut += `<tr><td>Høyeste fylling</td><td>${tall(r.hoyesteFylling)} m</td></tr>`;
      if (r.hoyesteVegg > 0.05) ut += `<tr><td>Høyeste bergvegg</td><td>${tall(r.hoyesteVegg)} m</td></tr>`;
      if (r.balanse) {
        const b = r.balanse;
        ut += `<tr><td>${b.balanse >= 0 ? 'Masseoverskudd' : 'Massemangel'}</td>`
          + `<td>${tall(Math.abs(b.balanse), 0)} m³</td></tr>`;
      }
      ut += '</table>';
    }
    boks.innerHTML = ut;

    const kote = document.getElementById('th_kote');
    const settKote = async v => {
      if (!Number.isFinite(v)) return;
      this.merk('satte ferdig nivå');
      t.nivaa.kote = +v.toFixed(2);
      this.tomtTilSkjema();
      await this.beregnTomt();
    };
    kote.onchange = () => settKote(parseFloat(kote.value));
    /* Forslaget ma vite hvilken oppgave det løser.
       Er omrisset selve tomta, er middelhøyden riktig: da blir det omtrent like
       mye a grave som a fylle. Er omrisset yttergrensen, er det en helt annen
       oppgave - da er det ikke balansen som teller, men hvor mye skraningene
       tar, og svaret er sjelden middelet. Ett forslag for begge ville vaert
       feil i det ene tilfellet. */
    document.getElementById('th_foresla').onclick = async () => {
      if (t.omrissBetyr === 'yttergrense') {
        this.framdrift(true, 'Finner nivået som gir størst tomt…', 0.2);
        await pause();
        const b = this.finnNivaaForGrense();
        this.framdrift(false);
        if (!b) { this.status('Fant ingen terrengdata over tomta'); return; }
        await settKote(b.kote);
        this.status(b.mangler > 0.2
          ? `Kote ${b.kote.toFixed(2)} gir størst tomt – ${Math.round(b.areal)} m². `
            + `Skråningene mangler fortsatt ${b.mangler.toFixed(1)} m på den verste sida; `
            + 'sett mur eller sprengt vegg der om du vil ha hele arealet.'
          : `Kote ${b.kote.toFixed(2)} gir ${Math.round(b.areal)} m² – skråningene får plass innenfor grensa`);
        return;
      }
      const k = this.foreslaKote();
      if (k == null) { this.status('Fant ingen terrengdata over tomta'); return; }
      await settKote(k);
      this.status(`Foreslo kote ${k.toFixed(2)} – middelhøyden i terrenget pluss overbygningen`);
    };
    document.getElementById('th_balanser').onclick = () => this.balanserTomt();
    for (const b of boks.querySelectorAll('button[data-legg]')) {
      b.onclick = () => settKote(parseFloat(b.dataset.legg));
    }
    const modus = document.getElementById('th_modus');
    modus.onchange = async () => {
      this.merk('endret form på nivået');
      t.nivaa.modus = modus.value;
      this.tomtTilSkjema();
      await this.beregnTomt();
    };
    const knytt = (id, les) => {
      const e = document.getElementById(id);
      if (!e) return;
      e.onchange = async () => {
        const v = parseFloat(e.value);
        if (!Number.isFinite(v)) return;
        this.merk('endret ferdig nivå');
        les(v);
        this.tomtTilSkjema();
        await this.beregnTomt();
      };
    };
    knytt('th_fall', v => { t.nivaa.fall = Math.max(0, v) / 100; });
    knytt('th_retning', v => { t.nivaa.fallretning = ((v % 360) + 360) % 360; });
    knytt('th_rutenett', v => { this.P.mal.rutestorrelse = Math.max(0.25, Math.min(5, v)); });
  },

  _himmelretning(grader) {
    const n = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];
    return n[Math.round((((grader % 360) + 360) % 360) / 45) % 8];
  },

  /**
   * Tomtemalen som skjema.
   *
   * Bygges av kode i stedet for a staa i HTML-en, fordi skrivematen for
   * helningen skifter med hva feltet gjelder: en bergvegg skrives 10:1 (ti opp,
   * én ut), en jordskraning 1:1,5 (én opp, halvannen ut). Normene bruker
   * motsatt logikk for berg og løsmasse, og blander man dem, blir volumet
   * fullstendig feil. Tallet som lagres er alltid vannrett utlegg per meter
   * høyde; det som vises, følger normen for det aktuelle feltet.
   */
  tomtemalTilSkjema() {
    const boks = document.getElementById('tomtemalSkjema');
    if (!boks || !this.erTomt()) return;
    const m = this.P.mal;
    const t = this.P.tomt;
    const F = [
      ['h3', 'Skråninger'],
      ['los', 'skjaeringLosmasse', 'Skjæring i løsmasse', 0.1, 5, 0.1],
      ['los', 'skjaeringFjell', 'Skjæring i fjell', 0, 5, 0.05],
      ['los', 'fylling', 'Fyllingsskråning', 0.1, 5, 0.1],
      ['h3', 'Sprengt vegg'],
      ['berg', 'veggHelning', 'Vegghelning', 0, 2, 0.05],
      ['los', 'losmasseOverFjell', 'Løsmasse over veggen', 0.5, 5, 0.1],
      ['m', 'maksVeggHoyde', 'Maks vegghøyde før berme', 0, 30, 0.5],
      ['m', 'bermeBredde', 'Bermebredde', 0, 10, 0.5],
      ['m', 'overberg', 'Overberg (egen post)', 0, 2, 0.05],
      ['h3', 'Lag under ferdig nivå'],
      ['m', 'matjordDybde', 'Matjord som tas av', 0, 1, 0.05],
      ['m', 'renskDybde', 'Rensk mot fjell', 0, 1, 0.05],
      ['m', 'frostsikring', 'Frostsikring', 0, 2, 0.05],
      ['m', 'forsterkningslag', 'Forsterkningslag', 0, 2, 0.05],
      ['m', 'baerelagTykkelse', 'Bærelag', 0, 1, 0.05],
      ['m', 'avrettingslag', 'Avretting', 0, 0.5, 0.01],
      ['m', 'slitelagTykkelse', 'Slitelag', 0, 0.5, 0.01],
      ['h3', 'Grenser'],
      ['m', 'maksSkjaeringsdybde', 'Maks skjæringsdybde', 0, 30, 0.5],
      ['m', 'maksFyllingshoyde', 'Maks fyllingshøyde', 0, 30, 0.5],
      ['m', 'maksUtslag', 'Maks utslag fra kant', 0, 60, 1],
      ['m', 'maksSokebredde', 'Søkebredde for skråninger', 5, 200, 5],
      ['m', 'minAvstandTilBerg', 'Minst avstand til fast berg', 0, 3, 0.05]
    ];
    let ut = '<div class="knapperad"><button class="knapp" id="tm_standard" '
      + 'title="Setter alle innstillingene under tilbake til det programmet leverer">'
      + '↺ Tilbakestill til standard</button></div>';
    ut += '<h3>Grunnlag</h3>';
    ut += '<div class="felt"><label>Løsmassetype</label><select id="tm_jordart">'
      + Object.entries(Tomt.Losmassetyper).map(([n, v]) =>
        `<option value="${n}"${m.losmassetype === n ? ' selected' : ''}>${v.navn}</option>`).join('')
      + '</select><span class="enhet"></span></div>';
    ut += '<p class="notis">Velger du jordart, settes skjæring og fylling etter '
      + 'N200 tabell 242.1 og 252.1. Tallene under kan overstyres etterpå.</p>';
    ut += '<div class="felt"><label>Omrisset du tegner</label><select id="tm_omriss">'
      + `<option value="planum"${t.omrissBetyr !== 'yttergrense' ? ' selected' : ''}>Er selve tomta – skråningene kommer utenpå</option>`
      + `<option value="yttergrense"${t.omrissBetyr === 'yttergrense' ? ' selected' : ''}>Er yttergrensen – ingenting utenfor</option>`
      + '</select><span class="enhet"></span></div>';
    ut += '<p class="notis">Vet du hvor tomtegrensen går, tegner du den og velger '
      + '<b>yttergrensen</b>. Da regnes den ferdige flaten innover, så bunnen av '
      + 'skråningen havner nøyaktig på grensa.</p>';
    for (const rad of F) {
      if (rad[0] === 'h3') { ut += `<h3>${rad[1]}</h3>`; continue; }
      const [slag, felt, navn, min, maks, steg] = rad;
      const v = m[felt];
      let hint = '';
      if (slag === 'berg') hint = v > 1e-6 ? `${(1 / v).toFixed(v < 0.15 ? 0 : 1)}:1` : 'loddrett';
      else if (slag === 'los') hint = v > 1e-6 ? `1:${(+v).toFixed(1)}` : 'loddrett';
      else hint = 'm';
      ut += `<div class="felt"><label>${navn}</label>`
        + `<input type="number" data-tm="${felt}" value="${v}" min="${min}" max="${maks}" step="${steg}">`
        + `<span class="enhet">${hint}</span></div>`;
    }
    ut += '<p class="notis">Skråningstallet er vannrett utlegg per meter høyde. '
      + 'Bergvegg vises som 10:1 (ti opp, én ut), jordskråning som 1:1,5 '
      + '(én opp, halvannen ut) – slik normene skriver dem. Standardverdiene '
      + 'følger N200 og R761.</p>';
    boks.innerHTML = ut;
    for (const inp of boks.querySelectorAll('input[data-tm]')) {
      inp.onchange = () => {
        const felt = inp.dataset.tm;
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v)) { inp.value = m[felt]; return; }
        this.merk('endret tomtemal');
        m[felt] = Math.max(+inp.min, Math.min(+inp.max, v));
        this.tomtemalTilSkjema();
        this.beregnTomt();
      };
    }
    const jord = document.getElementById('tm_jordart');
    jord.onchange = () => {
      const v = Tomt.Losmassetyper[jord.value];
      if (!v) return;
      this.merk('valgte løsmassetype');
      m.losmassetype = jord.value;
      m.skjaeringLosmasse = v.skjaering;
      m.fylling = v.fylling;
      m.losmasseOverFjell = Math.max(v.skjaering, 2.0);
      this.tomtemalTilSkjema();
      this.beregnTomt();
      this.status(`${v.navn}: skjæring 1:${v.skjaering}, fylling 1:${v.fylling} (N200)`);
    };
    const omr = document.getElementById('tm_omriss');
    omr.onchange = async () => {
      this.merk('endret hva omrisset betyr');
      t.omrissBetyr = omr.value;
      this.tomtemalTilSkjema();
      await this.beregnTomt();
      /* Bytter man til yttergrense, er koten som sto der svaret pa en annen
         oppgave - den var funnet for at omrisset var selve tomta. Da krymper
         den ferdige flaten uten at brukeren vet hvilken vei den skal justeres.
         Derfor finnes det nye nivaet med en gang, sa modusen virker av seg
         selv i stedet for a kreve at man gjetter. */
      if (t.omrissBetyr !== 'yttergrense' || t.nivaa.kote == null) return;
      this.framdrift(true, 'Finner nivået som gir størst tomt…', 0.2);
      await pause();
      const b = this.finnNivaaForGrense();
      this.framdrift(false);
      if (!b) return;
      const foer = this.resultat && this.resultat.areal ? this.resultat.areal : 0;
      if (b.areal <= foer * 1.02) {
        this.status(`Nivået du hadde gir allerede omtrent den største tomta (${Math.round(foer)} m²)`);
        return;
      }
      this.merk('fant nivået som gir størst tomt');
      t.nivaa.kote = b.kote;
      this.tomtTilSkjema();
      await this.beregnTomt();
      this.status(`Flyttet nivået til kote ${b.kote.toFixed(2)} – det gir ${Math.round(b.areal)} m² `
        + `mot ${Math.round(foer)} m². `
        + (b.mangler > 0.2
          ? `Verste sida mangler fortsatt ${b.mangler.toFixed(1)} m; mur eller sprengt vegg der gir hele arealet.`
          : 'Skråningene får plass innenfor grensa.'));
    };
    document.getElementById('tm_standard').onclick = async () => {
      const ja = await this.bekreft(
        'Sette alle tomteinnstillingene tilbake til standard? '
        + 'Skråninger, sprengt vegg, lag og grenser blir som programmet leverer dem. '
        + 'Tomta du har tegnet og det ferdige nivået blir stående.',
        'Tilbakestill');
      if (!ja) return;
      this.merk('tilbakestilte tomtemalen');
      /* Bare malen. Geometrien og nivaet er noe brukeren har lagt inn, og de
         hører ikke til «standardinnstillinger» - a kaste dem her ville vaert en
         overraskelse man ikke kan angre pa uten a tegne alt om igjen. */
      Object.assign(m, StandardTomtemal);
      this.tomtemalTilSkjema();
      await this.beregnTomt();
      this.status('Tomteinnstillingene er tilbake til standard');
    };
  },

  skjemaTilMal() {
    const m = this.P.mal, f = this.P.faktorer, g = this.P.fjell;
    /* Et tomt eller ugyldig felt ma ikke skrive NaN inn i malen. Det ga
       stille nullvolum: `while (t < NaN)` kjører aldri, og skjæringen ble 0
       uten at noe sa ifra at grunnlaget var ødelagt. Verdien som sto der fra
       før beholdes i stedet, og feltet settes tilbake til den. */
    const tall = id => {
      const felt = document.getElementById(id);
      const v = parseFloat(felt.value);
      if (isFinite(v)) return v;
      const gammel = m[id.replace(/^m_/, '')] ?? f[id.replace(/^f_/, '')] ?? g[id.replace(/^g_/, '')];
      if (isFinite(gammel)) { felt.value = gammel; return gammel; }
      felt.value = 0;
      return 0;
    };
    /* Star en tomt oppe, peker `m` pa tomtas mal - og vegskjemaet ville da
       skrevet vegbredde, tverrfall og grøftedybde rett inn i den. Tomta ville
       fatt et dusin felt den ikke har bruk for, og de som heter det samme i
       begge maler ville blitt overskrevet med vegens verdi uten at noe sa fra.
       Faktorene og grunnforholdene er felles og leses fortsatt. */
    if (this.erTomt()) {
      f.sprengningsfaktor = tall('f_sprengningsfaktor');
      f.fjellIFylling = tall('f_fjellIFylling');
      f.losmasseIFylling = tall('f_losmasseIFylling');
      f.brukbarLosmasse = tall('f_brukbarLosmasse');
      g.standarddybde = tall('g_standarddybde');
      g.rekkevidde = tall('g_rekkevidde');
      return;
    }
    m.vegbredde = tall('m_vegbredde');
    m.tverrfall = tall('m_tverrfall') / 100;
    m.tverrfallType = document.getElementById('m_tverrfallType').value;
    m.slitelagTykkelse = tall('m_slitelagTykkelse');
    m.slitelagBredde = tall('m_slitelagBredde');
    m.baerelagTykkelse = tall('m_baerelagTykkelse');
    m.grofteDybdePlanum = tall('m_grofteDybdePlanum');
    m.grofteBunn = tall('m_grofteBunn');
    m.grofteInnerHelning = tall('m_grofteInnerHelning');
    m.skjaeringLosmasse = tall('m_skjaeringLosmasse');
    m.skjaeringFjell = tall('m_skjaeringFjell');
    m.fylling = tall('m_fylling');
    m.renskDybde = tall('m_renskDybde');
    m.renskUtenfor = tall('m_renskUtenfor');
    m.utvidelseOvergang = tall('m_utvidelseOvergang');
    m.maksSokebredde = tall('m_maksSokebredde');
    m.maksFyllingshoyde = tall('m_maksFyllingshoyde');
    m.maksSkjaeringsdybde = tall('m_maksSkjaeringsdybde');
    m.maksUtslag = tall('m_maksUtslag');
    m.beregningsbredde = tall('m_beregningsbredde');
    m.sideforskyvning = tall('m_sideforskyvning');
    m.lassretning = parseInt(document.getElementById('m_lassretning').value, 10) || -1;
    this.P.profilAvstand = Math.max(1, tall('m_profilAvstand'));
    this.P.bakkekorreksjon = document.getElementById('m_bakkekorreksjon').checked;
    f.sprengningsfaktor = tall('f_sprengningsfaktor');
    f.fjellIFylling = tall('f_fjellIFylling');
    f.losmasseIFylling = tall('f_losmasseIFylling');
    f.brukbarLosmasse = tall('f_brukbarLosmasse');
    g.standarddybde = tall('g_standarddybde');
    g.rekkevidde = tall('g_rekkevidde');
  },

  visStrekninger() {
    const tb = document.querySelector('#strekningTabell tbody');
    tb.innerHTML = '';
    this.P.fjell.strekninger.forEach((st, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input type="number" value="${st.fra}"></td>
                      <td><input type="number" value="${st.til}"></td>
                      <td><input type="number" step="0.1" value="${st.dybde}"></td>
                      <td><button title="Slett">×</button></td>`;
      const [a, b, c] = tr.querySelectorAll('input');
      a.onchange = () => { st.fra = parseFloat(a.value) || 0; this.grunnEndret(); };
      b.onchange = () => { st.til = parseFloat(b.value) || 0; this.grunnEndret(); };
      c.onchange = () => { st.dybde = parseFloat(c.value) || 0; this.grunnEndret(); };
      tr.querySelector('button').onclick = () => { this.P.fjell.strekninger.splice(i, 1); this.visStrekninger(); this.grunnEndret(); };
      tb.appendChild(tr);
    });
  },

  visSonderinger() {
    const boks = document.getElementById('sonderingListe');
    const p = this.P.fjell.punkter;
    if (!p.length) { boks.innerHTML = '<span class="tomtekst">Ingen registrert. Velg «Fjellpunkt» og klikk i kartet.</span>'; return; }
    boks.innerHTML = p.map((o, i) => {
      let prof = '';
      if (this.linje && this.linje.lengde > 0) {
        const u = Geo.tilUtm(o.lat, o.lon, this.sone);
        const pr = this.linje.projiser(u.x, u.y);
        prof = `prof ${pr.s.toFixed(0)}, avvik ${pr.avvik.toFixed(1)} m`;
      }
      return `<div class="rad"><span>${o.dybde.toFixed(1)} m &nbsp;<small>${prof}</small></span><button data-i="${i}">×</button></div>`;
    }).join('');
    boks.querySelectorAll('button').forEach(b => {
      b.onclick = () => { this.P.fjell.punkter.splice(+b.dataset.i, 1); this.grunnEndret(); };
    });
  },

  /* ---------------- veiklasse ---------------- */

  fyllVeiklassevalg() {
    const v = document.getElementById('m_veiklasse');
    if (!v || v.options.length) return;
    for (const [n, k] of Object.entries(Veiklasser)) {
      const o = document.createElement('option');
      o.value = n; o.textContent = k.navn;
      v.appendChild(o);
    }
  },

  visVeiklasse() {
    const boks = document.getElementById('veiklasseinfo');
    if (!boks) return;
    const k = Veiklasser[this.P.mal.veiklasse] || Veiklasser.egen;
    boks.innerHTML = `<p>${k.beskrivelse}</p>`
      + (k.kilde ? `<p class="kilde">${k.kilde}</p>` : '')
      + (k.usikker ? `<p class="merke-varsel">Kontroller kravene mot gjeldende vegnormal.</p>` : '')
      + (k.fri ? '' : `<div class="klassetall">
           <span>Min. bredde <b>${k.vegbredde} m</b></span>
           <span>Min. radius <b>${k.minRadius} m</b></span>
           <span>Maks stigning <b>${Math.round(k.maksStigningLass * 100)} / ${Math.round(k.maksStigningRetur * 100)} %</b></span>
         </div>`);
  },

  visKravtabell() {
    const tb = document.querySelector('#kravTabell tbody');
    if (!tb) return;
    const m = this.P.mal;
    const bredde = m.breddeIKurve || [];
    const stign = m.stigningIKurve || [];
    tb.innerHTML = stign.map(rad => {
      const til = rad[0];
      const b = bredde.find(r => til >= r[0] && til <= r[1]);
      const merke = til > 1e8 ? '> 60 m' : `≤ ${til} m`;
      return `<tr><td>${merke}</td>
        <td>${b ? (b[2] === b[3] ? b[2].toFixed(1) : b[2].toFixed(1) + '–' + b[3].toFixed(1)) + ' m' : '–'}</td>
        <td>${(rad[1] * 100).toFixed(0)} %</td>
        <td>${(rad[2] * 100).toFixed(0)} %</td></tr>`;
    }).join('');
  },

  velgVeiklasse(navn) {
    this.P.mal = malFraVeiklasse(navn, this.P.mal);
    this.P.mal.veiklasse = navn;
    if (Veiklasser[navn] && !Veiklasser[navn].fri) {
      // Vegbredden er minstekravet i klassen; byggherren kan ville ha mer
      const k = Veiklasser[navn];
      if (this.P.mal.vegbredde < k.vegbredde) this.P.mal.vegbredde = k.vegbredde;
    }
    this.malTilSkjema();
    this.planlegg(30);
  },

  /* ---------------- punkthøyder i tverrprofilet ---------------- */

  /**
   * Fallet som gjelder i et profilnummer, enten fra malen eller overstyrt.
   *
   * Krumningen ma vaere med: i kurver under 60 m radius doserer normalen
   * ensidig, og da har den ene sida motsatt fortegn. Uten krumningen ville
   * vegkanthøydene i alle krappe kurver blitt feil - bade i feltene over
   * tverrprofilet, i stikningstabellen og i alt som eksporteres.
   */
  fallVed(s) {
    const kr = this.linje && this.linje.lengde > 0 ? this.linje.punktVed(s).krumning : 0;
    return tverrfallVed(this.P.mal, this.P.tverrfall, s, kr);
  },

  visPunkthoyder(pr) {
    const v = document.getElementById('tp_venstre');
    const c = document.getElementById('tp_senter');
    const h = document.getElementById('tp_hoyre');
    if (!v || !pr) return;
    const fall = this.fallVed(pr.s);
    v.value = (pr.vegnivaa - fall.venstre * pr.halvbredde).toFixed(3);
    c.value = pr.vegnivaa.toFixed(3);
    h.value = (pr.vegnivaa - fall.hoyre * pr.halvbredde).toFixed(3);
    const egen = (this.P.tverrfall || []).some(t => Math.abs(t.s - pr.s) < 1e-6);
    v.classList.toggle('overstyrt', egen);
    h.classList.toggle('overstyrt', egen);
  },

  /**
   * Skriver inn en høyde i et punkt i tverrsnittet.
   *
   * Senterlinjen styrer lengdeprofilen, mens vegkantene styrer tverrfallet
   * pa den sida. Slik kan et oppmalt tverrsnitt legges rett inn: mal de tre
   * punktene i felt, skriv dem inn, og malen retter seg etter dem.
   */
  settPunkthoyde(hvor, verdi) {
    const pr = this.resultat && this.resultat.profiler.find(p => Math.abs(p.s - this.tverrStasjon) < 1e-6);
    if (!pr || !isFinite(verdi)) return;

    if (hvor === 'senter') {
      const finnes = this.P.vip.find(v => Math.abs(v.s - pr.s) < 1e-6);
      if (finnes) { finnes.z = verdi; finnes.laast = true; }
      else this.P.vip.push({ s: pr.s, z: verdi, k: 0, laast: true });
      this.P.vip.sort((a, b) => a.s - b.s);
      this.profilEndret(false);
      this.visHoydetabell();
      return;
    }

    const fall = this.fallVed(pr.s);
    const nytt = { s: pr.s, venstre: fall.venstre, hoyre: fall.hoyre };
    const helning = (pr.vegnivaa - verdi) / pr.halvbredde;
    if (hvor === 'venstre') nytt.venstre = helning; else nytt.hoyre = helning;

    const i = this.P.tverrfall.findIndex(t => Math.abs(t.s - pr.s) < 1e-6);
    if (i >= 0) this.P.tverrfall[i] = nytt; else this.P.tverrfall.push(nytt);
    this.P.tverrfall.sort((a, b) => a.s - b.s);
    this.beregn();
  },

  nullstillPunkthoyder() {
    const s = this.tverrStasjon;
    const i = this.P.tverrfall.findIndex(t => Math.abs(t.s - s) < 1e-6);
    if (i >= 0) this.P.tverrfall.splice(i, 1);
    const j = this.P.vip.findIndex(v => Math.abs(v.s - s) < 1e-6);
    if (j >= 0 && this.P.vip.length > 2) this.P.vip.splice(j, 1);
    this.profilEndret(false);
    this.beregn();
  },

  /* ---------------- høydetabell ---------------- */

  /** Høyder brukeren har last - de skal ligge i ro. */
  lasteHoyder() {
    return this.P.vip.filter(v => v.laast).map(v => ({ s: v.s, z: v.z, k: v.k }));
  },

  terrengHoyde(s) {
    if (!this.terrengProfil) return NaN;
    const { s: ss, z: zz } = this.terrengProfil;
    if (!ss.length) return NaN;
    if (s <= ss[0]) return zz[0];
    if (s >= ss[ss.length - 1]) return zz[zz.length - 1];
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] < s) lo = m; else hi = m; }
    const f = (s - ss[lo]) / (ss[hi] - ss[lo] || 1);
    return zz[lo] + f * (zz[hi] - zz[lo]);
  },

  visHoydetabell() {
    const tb = document.querySelector('#hoydeTabell tbody');
    if (!tb) return;
    tb.innerHTML = '';
    const V = this.P.vip;
    V.forEach((v, i) => {
      const zt = this.terrengHoyde(v.s);
      const diff = zt - v.z;                     // positiv = skjæring
      const tr = document.createElement('tr');
      if (v.laast) tr.className = 'laast';
      tr.innerHTML =
        `<td><input type="number" step="1" value="${+v.s.toFixed(2)}"></td>
         <td><input type="number" step="0.01" value="${+v.z.toFixed(3)}"></td>
         <td>${isFinite(zt) ? zt.toFixed(2) : '–'}</td>
         <td class="${diff >= 0 ? 'diff-skjaering' : 'diff-fylling'}">${isFinite(diff) ? (diff >= 0 ? '+' : '') + diff.toFixed(2) : '–'}</td>
         <td><input type="checkbox" ${v.laast ? 'checked' : ''}></td>
         <td><button title="Slett">×</button></td>`;
      const [fS, fZ] = tr.querySelectorAll('input[type=number]');
      const laas = tr.querySelector('input[type=checkbox]');
      fS.onchange = () => {
        const ny = parseFloat(fS.value);
        if (isFinite(ny)) { v.s = Math.max(0, Math.min(this.linje ? this.linje.lengde : ny, ny)); }
        this.P.vip.sort((a, b) => a.s - b.s);
        this.profilEndret(false); this.visHoydetabell();
      };
      fZ.onchange = () => {
        const ny = parseFloat(fZ.value);
        if (isFinite(ny)) { v.z = ny; v.laast = true; v.k = 0; }
        this.profilEndret(false); this.visHoydetabell();
      };
      laas.onchange = () => {
        v.laast = laas.checked;
        // Last punkt skal treffes eksakt, og da kan det ikke ha vertikalkurve
        if (v.laast) v.k = 0;
        this.profilEndret(false);
        this.visHoydetabell();
      };
      tr.querySelector('button').onclick = () => {
        this.P.vip.splice(i, 1); this.profilEndret(false); this.visHoydetabell();
      };
      tb.appendChild(tr);
    });

    const laste = V.filter(v => v.laast).length;
    const info = document.getElementById('hoydeinfo');
    if (info) {
      info.innerHTML = this.vprofil && V.length > 1
        ? `<div class="rad"><span>Punkt i profilen</span><span>${V.length}, ${laste} låst</span></div>
           <div class="rad"><span>Største stigning</span><span>${(this.vprofil.maksStigning(1) * 100).toFixed(1)} %</span></div>
           <div class="rad"><span>Vertikalkurver</span><span>${this.vprofil.kurver.length}</span></div>`
        : '';
    }
    const topp = document.getElementById('hoydeToppinfo');
    if (topp) {
      topp.textContent = this.linje && this.linje.lengde > 0
        ? `Veglengde ${(this.linje.lengde * this.bakkefaktor()).toFixed(1)} m · profil 0 – ${this.linje.lengde.toFixed(0)}`
        : 'Tegn en senterlinje først';
    }
  },

  /**
   * Legger inn en høyde pa et valgt profilnummer.
   * Uten oppgitt høyde brukes den prosjekterte linjen der den ligger na,
   * sa man kan sette ned punkter langs veien og justere dem etterpa.
   */
  leggTilHoyde(s, z) {
    if (!this.linje || this.linje.lengde <= 0) return;
    const ss = Math.max(0, Math.min(this.linje.lengde, s));
    const hoyde = isFinite(z) ? z
      : (this.vprofil && this.P.vip.length > 1 ? this.vprofil.hoyde(ss) : this.terrengHoyde(ss));
    if (!isFinite(hoyde)) return;

    /* En last høyde er et punkt veien skal gjennom, ikke et knekkpunkt for
       tangentene. En vertikalkurve ville dratt linjen forbi punktet med
       A·L/8, sa den far K = 0 og treffes eksakt. */
    const finnes = this.P.vip.find(v => Math.abs(v.s - ss) < 0.05);
    if (finnes) { finnes.z = +hoyde.toFixed(3); finnes.laast = true; finnes.k = 0; }
    else this.P.vip.push({ s: +ss.toFixed(2), z: +hoyde.toFixed(3), k: 0, laast: true });
    this.P.vip.sort((a, b) => a.s - b.s);
    this.profilEndret(false);
    this.visHoydetabell();
    this.settTverrStasjon(ss);
    this.status(`Høyde ${hoyde.toFixed(2)} lagt inn i profil ${ss.toFixed(0)}`);
  },

  /** Fyller tabellen med jevn avstand, med terrenghøyde der det ikke finnes noe fra før. */
  fyllHoyder(steg) {
    if (!this.linje || this.linje.lengde <= 0) return;
    const k = document.getElementById('h_retteLinjer').checked ? 0 : (parseFloat(document.getElementById('kVerdi').value) || 1);
    const gammel = this.vprofil;
    const ny = [];
    let utenHoyde = 0;
    for (let s = 0; s <= this.linje.lengde + 1e-6; s += steg) {
      const ss = Math.min(s, this.linje.lengde);
      const fanns = this.P.vip.find(v => Math.abs(v.s - ss) < steg / 2 && v.laast);
      if (fanns) { ny.push(fanns); continue; }
      const z = gammel && this.P.vip.length > 1 ? gammel.hoyde(ss) : this.terrengHoyde(ss);
      /* Uten høyde ble punktet lagt inn pa kote 0 - havflaten, midt i en veg
         som ligger pa to hundre. Da er det bedre a la vaere: profilen gar rett
         mellom knekkpunktene den har, og det er et ærligere svar enn et tall
         som ser ut som en mailing. */
      if (!isFinite(z)) { utenHoyde++; if (ss >= this.linje.lengde) break; continue; }
      ny.push({ s: +ss.toFixed(2), z: +z.toFixed(3), k, laast: false });
      if (ss >= this.linje.lengde) break;
    }
    const slutt = +this.linje.lengde.toFixed(2);
    if (!ny.some(v => Math.abs(v.s - slutt) < 1e-6)) {
      const z = gammel ? gammel.hoyde(slutt) : this.terrengHoyde(slutt);
      if (isFinite(z)) ny.push({ s: slutt, z: +z.toFixed(3), k, laast: false });
      else utenHoyde++;
    }
    if (ny.length < 2) {
      this.status('Fant ingen høyder å fylle inn – terrengmodellen mangler data her');
      return;
    }
    this.merk('fyll inn høyder');
    this.P.vip = ny.sort((a, b) => a.s - b.s);
    this.profilEndret(false);
    this.visHoydetabell();
    if (utenHoyde) {
      this.status(`${ny.length} høyder fylt inn. ${utenHoyde} punkt ble hoppet over – ` +
        'terrengmodellen mangler data der.');
    }
  },

  limInnHoyder() {
    const felt = document.getElementById('h_lim');
    const rader = lesHoydetabell(felt.value);
    if (!rader.length) { alert('Fant ingen profilnummer og høyder i teksten.'); return; }
    const L = this.linje ? this.linje.lengde : Infinity;
    const utenfor = rader.filter(r => r.s > L + 0.5).length;
    const beholdt = rader.filter(r => r.s <= L + 0.5);
    // Innlimte høyder er punkt veien skal gjennom, sa de far ingen vertikalkurve
    this.P.vip = beholdt.map(r => ({ s: +Math.min(r.s, L).toFixed(2), z: r.z, k: 0, laast: true }));
    this.beregn();
    this.visHoydetabell();
    felt.value = '';
    this.status(`La inn ${beholdt.length} låste høyder`
      + (utenfor ? ` (${utenfor} lå utenfor veglengden på ${L.toFixed(0)} m og ble hoppet over)` : ''));
  },

  visLinjetabell() {
    const tb = document.querySelector('#ipTabell tbody');
    tb.innerHTML = '';
    this.P.ip.forEach((pt, i) => {
      const u = Geo.tilUtm(pt.lat, pt.lon, this.sone);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${u.y.toFixed(1)}</td><td>${u.x.toFixed(1)}</td>
                      <td><input type="number" step="5" value="${pt.r || 0}"></td>
                      <td><button title="Slett">×</button></td>`;
      tr.querySelector('input').onchange = e => { pt.r = parseFloat(e.target.value) || 0; this.linjeEndret(); };
      tr.querySelector('button').onclick = () => { this.P.ip.splice(i, 1); this.linjeEndret(); };
      tb.appendChild(tr);
    });
    const info = document.getElementById('linjeinfo');
    if (this.linje && this.linje.lengde > 0) {
      const k = this.linje.kurver.map(c =>
        `<div class="rad"><span>BC ${c.sBC.toFixed(0)} – EC ${c.sEC.toFixed(0)}</span><span>R = ${c.r.toFixed(1)} m${c.tegn > 0 ? ' venstre' : ' høyre'}</span></div>`
      ).join('');
      const flytting = (this.flyttingsliste && this.flyttingsliste.length)
        ? `<div class="rad"><span><b>Senterlinjen er flyttet sidelengs</b></span>
             <span><button class="minilenke" id="angreFlytting">Angre</button></span></div>`
        + this.flyttingsliste.map(f =>
          `<div class="rad"><span>&nbsp;&nbsp;Knekkpunkt ${f.nr}</span><span>${f.meter.toFixed(2)} m</span></div>`).join('')
        : '';
      info.innerHTML = flytting
        + `<div class="rad"><span>Lengde i kartplanet</span><span>${this.linje.lengde.toFixed(2)} m</span></div>`
        + `<div class="rad"><span>Lengde på bakken</span><span>${(this.linje.lengde * this.bakkefaktor()).toFixed(2)} m</span></div>`
        + `<div class="rad"><span>Sone</span><span>EUREF89 UTM${this.sone}</span></div>`
        + (k || '<div class="rad"><span>Ingen kurver lagt inn</span><span></span></div>')
        + this.linje.advarsler.map(a => `<div class="rad merke-varsel"><span>${a.tekst}</span><span></span></div>`).join('');
      const angre = info.querySelector('#angreFlytting');
      if (angre) angre.onclick = () => this.angreFlytting();
    } else info.innerHTML = '';
  },

  /* ---------------- lagring ---------------- */

  async lagre() {
    const navn = document.getElementById('prosjektnavn').value.trim() || 'Uten navn';

    /* Skriver man et navn som alt er i bruk av et ANNET prosjekt, er det som
       regel ikke meningen a slette det. Uten dette spørsmalet forsvant det
       gamle prosjektet i det øyeblikket noen skrev navnet - og med
       autolagringen kunne det skje uten at noen trykket pa noe.

       Det er bare navnebyttet som spørres om. A lagre prosjektet under det
       navnet det alt har, er nettopp det man vil. */
    if (navn !== this._aapnetSom) {
      let finnes = null;
      try { finnes = await Lager.hent(navn); } catch (e) { /* da far det staa */ }
      if (finnes) {
        const ja = await this.bekreft(
          `Det finnes allerede et prosjekt som heter «${navn}». Skrive over det?`,
          'Skriv over');
        if (!ja) { this.status('Lagringen ble avbrutt – velg et annet navn'); return; }
      }
    }

    this.P.navn = navn;
    try {
      const rad = await Lager.lagre(this.P.navn, this.P);
      this._lagretSom = JSON.stringify(this.P);
      this._aapnetSom = this.P.navn;
      this.visLagretMerke();
      this.status(rad && rad.reserve
        ? `Lagret «${this.P.navn}» – men bare i nettleserens reservelager. Ta en eksport til fil.`
        : 'Lagret «' + this.P.navn + '»');
    } catch (e) {
      this.status('Kunne ikke lagre: ' + e.message);
    }
  },

  /* ---------------- lagres av seg selv ----------------
     En prosjektfil holder det som ble lagret. Den kan ikke holde det man
     glemte a lagre - og det var lett a glemme: bade «Apne» og «Ny» byttet
     prosjekt uten a spørre, sa alt siden forrige lagring var borte. Det sa
     ut som om fila ikke tok vare pa punktene.

     Na lagres det av seg selv et par sekunder etter siste endring, sa lenge
     prosjektet har fatt et navn. Og skulle noe likevel ikke vaere lagret,
     blir man spurt før det byttes. */

  _lagretSom: '',
  _aapnetSom: null,          // navnet prosjektet ligger lagret under
  _autolagring: null,
  /* Teller opp mens noe annet enn brukeren rører prosjektet - nettlesertesten
     legger inn punkt og fjerner dem igjen, og de skal ikke bli lagret
     underveis. Uten dette skrev testen sine egne endringer inn i prosjektet
     den lante. */
  autolagringPause: 0,

  /** Har prosjektet noe i det hele tatt - en veglinje eller en tomt? */
  harInnhold() {
    if (!this.P || !this.P.anlegg) return false;
    return this.P.anlegg.some(a =>
      (a.ip && a.ip.length) || (a.tomt && a.tomt.punkter && a.tomt.punkter.length));
  },

  harUlagret() {
    if (!this.P) return false;
    /* Her sto det `P.ip.length > 0`. En tomt har ingen knekkpunkt, sa et
       prosjekt med bare en tomt i meldte at det ikke var noe a lagre - og ble
       aldri autolagret. Alt man hadde tegnet la da og ventet pa en lagring som
       ikke kom. */
    if (!this._lagretSom) return this.harInnhold();
    return JSON.stringify(this.P) !== this._lagretSom;
  },

  planleggAutolagring() {
    clearTimeout(this._autolagring);
    /* Star lagringen pa vent, skal det ikke planlegges noe heller. Ellers
       overlever tidtakeren pausen og fyrer etterpa - med den tilstanden som
       tilfeldigvis star da. Nettlesertesten laner prosjektet og legger det
       tilbake, men en tidtaker fra midt i testen rakk a lagre mellomtilstanden
       etterpa, og demoen endret seg uten at noen hadde rørt den. */
    if (this.autolagringPause > 0) return;
    this._autolagring = setTimeout(() => this.autolagre(), 2000);
  },

  async autolagre() {
    if (this.autolagringPause > 0) return;
    if (!this.P || !this.harUlagret()) return;
    // et prosjekt uten navn har brukeren ikke bestemt seg for enna
    const navn = (document.getElementById('prosjektnavn').value || '').trim();
    if (!navn || navn === 'Nytt prosjekt') return;
    /* Her sto `!(this.P.ip || []).length`. En tomt har ingen knekkpunkt, så
       P.ip er alltid tom og autolagringen returnerte alltid tidlig – på en tomt
       lagret den bokstavelig talt aldri. `harUlagret()` hadde nøyaktig samme
       feil og ble rettet, men denne linja ble ikke med, så «ulagret»-merket på
       Lagre-knappen slo av og på som normalt. Det så trygt ut. Trykte man ikke
       Lagre selv, var tomta borte ved neste omlasting. */
    if (!this.harInnhold()) return;

    /* Autolagringen skal aldri skrive over noe annet enn seg selv. Skriver
       brukeren et navn som alt er i bruk, ma det gaa om Lagre-knappen, der det
       blir spurt. Ellers kunne et prosjekt forsvinne uten at noen trykket pa
       noe i det hele tatt. */
    if (navn !== this._aapnetSom) {
      let finnes = null;
      try { finnes = await Lager.hent(navn); } catch (e) { /* da lar vi det staa */ }
      if (finnes) {
        this.status(`«${navn}» finnes fra før – trykk Lagre for å skrive over`);
        return;
      }
    }

    try {
      this.P.navn = navn;
      const rad = await Lager.lagre(navn, this.P);
      this._lagretSom = JSON.stringify(this.P);
      this._aapnetSom = navn;
      this.visLagretMerke();
      if (rad && rad.reserve) {
        this.status('Databasen tok ikke imot – lagret i reservelageret. Ta en eksport til fil.');
      }
    } catch (e) { this.status('Klarte ikke lagre automatisk: ' + e.message); }
  },

  visLagretMerke() {
    const k = document.getElementById('knappLagre');
    if (!k) return;
    const ulagret = this.harUlagret();
    k.classList.toggle('ulagret', ulagret);
    k.title = ulagret ? 'Det er endringer som ikke er lagret' : 'Alt er lagret';
  },

  async apneDialog() {
    const liste = await Lager.liste();
    const innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = 'Prosjekter';
    innhold.innerHTML = `
      <div class="dialogverktoy">
        <button class="knapp" id="dlgImport">Importer fil…</button>
        <button class="knapp" id="dlgEksportAlle">Eksporter alle</button>
        <input type="file" id="dlgFil" accept=".json" hidden multiple>
      </div>
      ${liste.length
        ? liste.map(p => `<div class="rad">
            <span data-navn="${escapeAttr(p.navn)}">${escapeHtml(p.navn)}<br><small style="color:#97a5b6">${new Date(p.endret).toLocaleString('nb-NO')}</small></span>
            <button class="knapp" data-eksport="${escapeAttr(p.navn)}">Eksporter</button>
            <button class="knapp" data-slett="${escapeAttr(p.navn)}">Slett</button>
          </div>`).join('')
        : '<p class="tomtekst">Ingen lagrede prosjekter ennå.</p>'}
      <p class="notis" style="margin-top:12px">Prosjektene ligger i nettleseren på denne maskinen.
      Eksporter en fil for å ta med prosjektet til en annen maskin eller ta sikkerhetskopi.</p>`;

    innhold.querySelectorAll('[data-navn]').forEach(el => { el.onclick = () => this.apne(el.dataset.navn); });
    innhold.querySelectorAll('[data-eksport]').forEach(el => { el.onclick = () => Lager.eksporter(el.dataset.eksport); });
    innhold.querySelectorAll('[data-slett]').forEach(el => {
      el.onclick = async () => {
        const navn = el.dataset.slett;
        document.getElementById('dialog').classList.add('skjult');
        if (!await this.bekreft(`Slette prosjektet «${navn}»? Dette kan ikke angres.`, 'Slett')) {
          return this.apneDialog();
        }
        await Lager.slett(navn);
        this.apneDialog();
      };
    });
    const fil = innhold.querySelector('#dlgFil');
    innhold.querySelector('#dlgImport').onclick = () => fil.click();
    innhold.querySelector('#dlgEksportAlle').onclick = async () => {
      const n = await Lager.eksporterAlle();
      this.status(`Eksporterte ${n} prosjekt`);
    };
    fil.onchange = async () => {
      const lagt = [];
      for (const f of fil.files) {
        try { lagt.push(...await Lager.importer(f)); }
        catch (e) { alert('Klarte ikke lese ' + f.name + ': ' + e.message); }
      }
      if (lagt.length) { this.status(`Importerte ${lagt.join(', ')}`); await this.apneDialog(); }
    };
    document.getElementById('dialog').classList.remove('skjult');
  },

  async apne(navn) {
    let d;
    try {
      d = await Lager.hent(navn);
    } catch (e) {
      this.status('Klarte ikke åpne «' + navn + '»: ' + e.message);
      return;
    }
    if (!d) { this.status('Fant ikke prosjektet «' + navn + '»'); return; }

    /* Star det igjen noe ulagret, ma det bli lagret eller uttrykkelig
       forkastet. Uten dette forsvant alt siden forrige lagring i det
       øyeblikket man apnet et annet prosjekt.

       Bare nar det er brukeren som apner. Er det programmet selv - som under
       nettlesertesten - er det ingen a spørre, og spørsmalet ble staende og
       vente pa et klikk som aldri kom. */
    if (this.autolagringPause === 0 && navn !== (this.P && this.P.navn) && this.harUlagret()) {
      await this.autolagre();
      if (this.harUlagret()) {
        const ja = await this.bekreft(
          `«${this.P.navn}» har endringer som ikke er lagret. Åpne «${navn}» likevel?`,
          'Åpne uten å lagre');
        if (!ja) return;
      }
    }
    this.tomPaneler();       // alt fra forrige prosjekt ma bort først
    /* Setteren pa `P` klargjør prosjektet: pakker inn gamle filer som ett
       veganlegg og setter opp vinduene inn i det aktive anlegget. Den fyller
       ogsa ut malen med standardverdier per anlegg - en vegmal for en veg, en
       tomtemal for en tomt. Derfor skal malen ikke slas sammen her; en tomt
       ville da fatt vegens felt tredd nedover seg. */
    this.P = this.moderniserProsjekt(Object.assign(this.nyttProsjekt(), d));
    this.P.faktorer = Object.assign({}, StandardFaktorer, d.faktorer || {});
    this.P.fjell = Object.assign({ standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [], soner: [] }, d.fjell || {});
    document.getElementById('prosjektnavn').value = this.P.navn;
    document.getElementById('dialog').classList.add('skjult');
    this.visAnleggsvelger();
    this._terrengnokkel = '';
    this._lagretSom = JSON.stringify(this.P);   // nettopp hentet - alt er lagret
    this._aapnetSom = this.P.navn;              // navnet det ligger lagret under
    this.visLagretMerke();
    // historikken hører til ett prosjekt - Angre skal ikke føre deg til det forrige
    this.tomHistorikk();
    this.malTilSkjema();
    await this.oppdater();
    Kart.zoomTilLinje();
  },

  tegnAlt() { Kart.tegn(); Lengdeprofil.tegn(); Tverrprofil.tegn(); Tomteprofil.tegn(); },

  /* ---------------- knapper og felt ---------------- */

  koblingerUI() {
    const id = x => document.getElementById(x);

    id('prosjektnavn').onchange = e => { this.P.navn = e.target.value; };
    id('knappLagre').onclick = () => this.lagre();
    id('knappApne').onclick = () => this.apneDialog();
    id('dialogLukk').onclick = () => id('dialog').classList.add('skjult');
    id('knappNy').onclick = async () => {
      /* Her sto det `P.ip.length`. Et prosjekt med bare en tomt i ble derfor
         kastet uten a spørre - man trykket «Ny» og tomta var borte. */
      if (this.harInnhold()) {
        const ja = await this.bekreft(
          'Starte på et nytt prosjekt? Det du har tegnet nå forsvinner hvis det ikke er lagret.',
          'Nytt prosjekt');
        if (!ja) return;
      }
      /* Vegmalen tas med til neste veg. Star en tomt oppe, peker `P.mal` pa
         tomtemalen, og den ville blitt tredd nedover den nye vegen. */
      const vegen = this.P.anlegg && this.P.anlegg.find(a => a.type === 'veg');
      const mal = Object.assign({}, vegen ? vegen.mal : StandardMal);
      this.P = this.nyttProsjekt();
      this.P.anlegg[0].mal = mal;
      this.tomPaneler();
      this.tomHistorikk();
      this._lagretSom = '';
      this._aapnetSom = null;             // et nytt prosjekt eier ingen navn enna
      Kart.tegn();
      id('prosjektnavn').value = this.P.navn;
      id('prosjektnavn').select();
      this.malTilSkjema();
      // Uten dette blir man staende i redigeringsmodus og far ikke satt et
      // eneste punkt, uten at noe forteller hvorfor.
      Kart.settModus('tegn');
      this.status('Nytt prosjekt – klikk i kartet for å tegne senterlinjen. Dobbeltklikk for å avslutte.');
    };
    id('knappRapport').onclick = () => Rapport.apneRapport();
    id('knappPdf').onclick = () => Pdfrapport.lag();

    id('knappForeslaProfil').onclick = () => {
      if (!this.terrengProfil) return;
      this.lagProfilforslag();
      this.beregn();
    };
    id('knappRettOpp').onclick = () => this.rettOpp();
    id('knappGjorLovlig').onclick = () => this.gjorLovlig();
    id('knappBalanser').onclick = () => this.balanser();
    id('knappOptimaliser').onclick = () => this.optimaliser();
    /* K settes pa knekkpunktene som far bestemme seg selv - ikke pa de laste.
       En last høyde har K=0 nettopp fordi veglinjen skal ga nøyaktig gjennom
       den, slik det ogsa star i teksten over høydetabellen. Med K=2 pa et last
       punkt bøyer kurven av fra høyden brukeren har bestemt, og avviket blir
       A·L/8 - fort en halv meter. */
    id('kVerdi').onchange = e => {
      const k = parseFloat(e.target.value);
      if (!isFinite(k)) return;
      this.merk('K-verdi');
      let laste = 0;
      this.P.vip.forEach(v => { if (v.laast) laste++; else v.k = k; });
      this.profilEndret(false);
      if (laste) this.status(`${laste} låste høyder beholder K=0 – veglinjen går nøyaktig gjennom dem`);
    };

    // Alle malfeltene
    document.querySelectorAll('#fane-mal input, #fane-mal select, #fane-grunn input').forEach(el => {
      if (el.closest('.minitabell')) return;
      el.addEventListener('change', () => { this.skjemaTilMal(); this._terrengnokkel = ''; this.planlegg(50); });
    });
    id('knappNullstillMal').onclick = () => {
      this.P.mal = Object.assign({}, StandardMal);
      this.P.faktorer = Object.assign({}, StandardFaktorer);
      this.malTilSkjema(); this.planlegg(30);
    };
    // Veiklasse
    this.fyllVeiklassevalg();
    id('m_veiklasse').onchange = e => this.velgVeiklasse(e.target.value);

    // Punkthøyder i tverrprofilet
    for (const [felt, hvor] of [['tp_venstre', 'venstre'], ['tp_senter', 'senter'], ['tp_hoyre', 'hoyre']]) {
      id(felt).onchange = e => this.settPunkthoyde(hvor, parseFloat(e.target.value));
    }
    id('tp_nullstill').onclick = () => this.nullstillPunkthoyder();

    // Høydetabellen
    id('h_fyll').onclick = () => this.fyllHoyder(Math.max(1, parseFloat(id('h_steg').value) || 5));
    id('h_laasAlle').onclick = () => { this.P.vip.forEach(v => v.laast = true); this.visHoydetabell(); Lengdeprofil.tegn(); };
    id('h_laasIngen').onclick = () => { this.P.vip.forEach(v => v.laast = false); this.visHoydetabell(); Lengdeprofil.tegn(); };
    id('h_limInn').onclick = () => this.limInnHoyder();
    id('h_tomTabell').onclick = async () => {
      if (!await this.bekreft('Fjerne alle innlagte høyder og lage nytt forslag fra terrenget?', 'Tøm tabellen')) return;
      this.P.vip = [];
      if (this.terrengProfil) this.lagProfilforslag();
      this.beregn(); this.visHoydetabell();
    };
    const nyHoyde = () => {
      const sFelt = id('h_nyS'), zFelt = id('h_nyZ');
      const s = sFelt.value === '' ? (this.tverrStasjon || 0) : parseFloat(sFelt.value);
      this.leggTilHoyde(s, parseFloat(zFelt.value));
      sFelt.value = ''; zFelt.value = '';
      sFelt.focus();
    };
    id('h_nyRad').onclick = nyHoyde;
    for (const f of ['h_nyS', 'h_nyZ']) {
      id(f).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nyHoyde(); } });
    }
    id('h_retteLinjer').onchange = e => {
      const k = e.target.checked ? 0 : (parseFloat(id('kVerdi').value) || 1);
      this.merk(e.target.checked ? 'rette linjer mellom høydene' : 'vertikalkurver på');
      // laste høyder star med K=0 - de skal treffes nøyaktig
      this.P.vip.forEach(v => { if (!v.laast) v.k = k; });
      this.profilEndret(false); this.visHoydetabell();
    };

    id('knappNyStrekning').onclick = () => {
      const L = this.linje ? this.linje.lengde : 100;
      this.P.fjell.strekninger.push({ fra: 0, til: Math.round(L), dybde: this.P.fjell.standarddybde });
      this.visStrekninger(); this.grunnEndret();
    };

    for (const [knapp, format] of [['knappEksportKof', 'kof'], ['knappEksportLandxml', 'landxml'],
    ['knappEksportSosi', 'sosi'], ['knappEksportDxf', 'dxf']]) {
      id(knapp).onclick = () => Rapport.eksporter(format);
    }
    id('knappEksportStikning').onclick = () => Rapport.eksportStikning();
    id('knappEksportMasser').onclick = () => Rapport.eksportMasser();
    id('knappEksportGeojson').onclick = () => Rapport.eksportGeojson();
    id('knappEksportRutenett').onclick = () => Rapport.eksportRutenett();
    id('knappKontroller').onclick = () => this.kontrollerHoyder();

    /* Stor visning. Panelene tegner seg sjøl pa nytt via ResizeObserver,
       men Leaflet ma fa beskjed eksplisitt. */
    const rute = document.querySelector('.rute');
    const settStor = navn => {
      const alt = ['kart', 'profil', 'tverr', 'tomt'];
      const alleredePa = rute.classList.contains('stor-' + navn);
      alt.forEach(n => rute.classList.remove('stor-' + n));
      if (!alleredePa) rute.classList.add('stor-' + navn);
      document.querySelectorAll('.utvidknapp').forEach(b => {
        b.classList.toggle('aktiv', !alleredePa && b.dataset.utvid === navn);
        b.textContent = (!alleredePa && b.dataset.utvid === navn) ? '⤡' : '⤢';
      });
      setTimeout(() => {
        if (Kart.kart) Kart.kart.invalidateSize();
        Lengdeprofil.tegn(); Tverrprofil.tegn(); Tomteprofil.tegn();
      }, 60);
    };
    document.querySelectorAll('.utvidknapp').forEach(b => {
      b.onclick = () => settStor(b.dataset.utvid);
    });
    id('knappSidepanel').onclick = () => {
      rute.classList.toggle('uten-side');
      setTimeout(() => {
        if (Kart.kart) Kart.kart.invalidateSize();
        Lengdeprofil.tegn(); Tverrprofil.tegn(); Tomteprofil.tegn();
      }, 60);
    };
    this._nullstillVisning = () => {
      ['kart', 'profil', 'tverr', 'tomt'].forEach(n => rute.classList.remove('stor-' + n));
      document.querySelectorAll('.utvidknapp').forEach(b => { b.classList.remove('aktiv'); b.textContent = '⤢'; });
      setTimeout(() => { if (Kart.kart) Kart.kart.invalidateSize(); Lengdeprofil.tegn(); Tverrprofil.tegn(); Tomteprofil.tegn(); }, 60);
    };

    /* FANEKLIKK SKAL GÅ GJENNOM visFane(), IKKE FORBI DEN.
       Her sto en egen kopi som bare byttet aktiv-klasse. Den gjorde alt
       visFane() gjør, bortsett fra den ene linja som fyller innholdet:
       `if (navn === 'forklaring') Forklaring.vis(this)`. Løkka kjører ved
       oppstart på alle de statiske faneknappene, så Forklaring-knappen fikk
       aldri visFane – og hele ui-forklaring.js, 235 linjer med tegnforklaring,
       har aldri vært vist for en bruker. To kopier av samme jobb der bare den
       ene blir vedlikeholdt. */
    document.querySelectorAll('.fane').forEach(f => {
      f.onclick = () => this.visFane(f.dataset.fane);
    });

    document.addEventListener('keydown', e => {
      // Ctrl+S skal virke ogsa rett etter at man har skrevet prosjektnavnet
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.lagre(); return; }
      /* Angre og gjør om ma ogsa virke rett etter at man har skrevet i et felt -
         det er som regel akkurat da man vil ha tilbake det som sto der. */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) this.gjorOm(); else this.angre();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.gjorOm(); return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      // Enter lukker tomta man holder pa a tegne - samme som dobbeltklikk
      if (e.key === 'Enter' && Kart.modus === 'tegnTomt') { e.preventDefault(); Kart.avsluttTomt(); return; }
      if (e.key === 'Escape') { Kart.settModus('rediger'); if (this._nullstillVisning) this._nullstillVisning(); }
      if (e.key === 'ArrowRight') Tverrprofil.flytt(1);
      if (e.key === 'ArrowLeft') Tverrprofil.flytt(-1);
    });
  }
};

function lesPar(tekst, skala) {
  const par = [];
  for (const bit of String(tekst).split(',')) {
    const m = bit.trim().match(/^(-?[\d.]+)\s*:\s*(-?[\d.]+)$/);
    if (!m) continue;
    par.push([parseFloat(m[1]), parseFloat(m[2]) * skala]);
  }
  return par.length ? par.sort((a, b) => a[0] - b[0]) : null;
}
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
/* Prosjektnavn kan komme fra en fil en kollega har sendt, og ma derfor
   behandles som tekst - ikke som markup. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/**
 * Slipper til tegningen mellom tunge runder.
 *
 * setTimeout ville vaert det opplagte, men nettleseren struper den til ett
 * sekund i faner som ligger i bakgrunnen. Bytter man fane midt i en
 * optimalisering, ville de femti smapausene blitt til nesten et minutt med
 * venting. En melding til seg selv over en MessageChannel blir ikke strupet.
 */
const _pausekanal = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const _pausekø = [];
if (_pausekanal) {
  _pausekanal.port1.onmessage = () => { const f = _pausekø.shift(); if (f) f(); };
}
function pause() {
  if (!_pausekanal) return new Promise(r => setTimeout(r, 0));
  return new Promise(r => { _pausekø.push(r); _pausekanal.port2.postMessage(0); });
}

window.addEventListener('DOMContentLoaded', () => App.start());
