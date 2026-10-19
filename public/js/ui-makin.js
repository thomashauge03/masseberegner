'use strict';
/**
 * «Hent fra Makin» i skjermbildet: nøkkelen, koblingen til et Makin-prosjekt
 * og hentingen inn i anlegget.
 *
 * Klienten (makin.js) snakker med proxyen, og ror.js leser fila og bytter
 * punktsettet. Her er bare det som rører skjermen og anlegget – derfor kan
 * nettlesertesten bytte ut `klient` med en falsk og prøve alt uten nett.
 *
 * INGEN HENTING UTEN ET TRYKK. Alt her starter fra en knapp: «⌀ Rør fra Makin»
 * i anleggspanelet (kobler til og henter første gang) og «☁ Hent fra Makin» i
 * kartverktøyene på et Makin-anlegg (henter alt på nytt). Massekalk skriver
 * aldri noe til Makin.
 *
 * NØKKELEN går aldri gjennom `P`. Den limes inn i en egen dialog, lagres av
 * klienten i nettleseren og tømmes av feltet med en gang. Derfor havner den
 * hverken i prosjektfila, angre-stegene eller eksportene.
 */
const MakinUI = {
  app: null,
  /* `Makin.lag()` – prøvene bytter den ut med en falsk. */
  klient: null,
  /* En henting pågår. Et nytt trykk mens Makin lager fila skulle ellers startet
     en eksport til, og den som kom sist tilbake, vant. */
  _holder: false,

  init(app) {
    this.app = app;
    if (!this.klient && typeof Makin !== 'undefined') this.klient = Makin.lag();
    const knapp = document.getElementById('verktoyRorMakin');
    if (knapp) {
      knapp.onclick = () => {
        const a = app.anlegg();
        if (a && a.type === 'ror' && a.ror && a.ror.makin) this.hent(a);
      };
    }
    return this;
  },

  /**
   * «⌀ Rør fra Makin»: nøkkelen om den mangler, koblingsdialogen og den
   * første hentingen.
   *
   * ETT MAKIN-ANLEGG PER MAKIN-PROSJEKT. Er prosjektet alt koblet til et
   * anlegg her, hentes det inn i det (med valgene fra dialogen) i stedet for
   * at det kommer et likt anlegg til. Et anlegg som ikke er koblet, gjøres
   * aldri om til et Makin-anlegg – det får et nytt.
   *
   * @returns {Promise<boolean>} true når punktene kom inn
   */
  async nyttAnlegg() {
    const app = this.app;
    if (this._holder) { app.status('Makin henter allerede – vent til den er ferdig'); return false; }
    if (!this.klient.nokkel() && !(await this._holdt(() => this.nokkelDialog()))) { app.status('Henting fra Makin avbrutt'); return false; }
    let valg;
    try { valg = await this._holdt(() => this.koblingsdialog()); }
    catch (e) { return this._feil(e, () => this.nyttAnlegg()); }
    if (!valg) { app.status('Henting fra Makin avbrutt'); return false; }
    if (valg.byttNokkel) return (await this._holdt(() => this.nokkelDialog())) ? this.nyttAnlegg() : false;
    if (valg.glemt) { app.status('Makin-nøkkelen er glemt i denne nettleseren'); return false; }
    const finnes = app.P.anlegg.find(a => a.type === 'ror' && a.ror && a.ror.makin
      && a.ror.makin.orgId === valg.orgId && a.ror.makin.prosjektId === valg.prosjektId) || null;
    /* Brukeren ba om rør fra Makin, og fikk dem i et anlegg som fantes – det
       skal stå, ellers leter man etter et nytt anlegg som aldri kom. */
    if (finnes) {
      valg.tillegg = ` · hentet inn i «${finnes.navn || 'Rør'}», som alt var koblet til prosjektet`;
      /* Og har det en kopi, er det kopien som telles – ellers leter man i
         rapporten etter punktene som nettopp kom inn. */
      const kopi = !app.telles(finnes)
        && app.P.anlegg.find(x => x !== finnes && x.type === 'ror' && x.ror && x.ror.kopiAv === finnes.id);
      if (kopi) valg.tillegg += ` · telles ikke, kopien «${kopi.navn || 'Rør'}» gjør`;
    }
    return this._hent(finnes, valg, () => this.nyttAnlegg());
  },

  /**
   * «☁ Hent fra Makin» på et Makin-anlegg: alt hentes på nytt med valgene
   * fra koblingen, og punktene byttes ut.
   * @returns {Promise<boolean>} true når punktene kom inn
   */
  async hent(a) {
    const app = this.app;
    if (!a || !a.ror || !a.ror.makin) return false;
    if (this._holder) { app.status('Makin henter allerede – vent til den er ferdig'); return false; }
    if (!this.klient.nokkel() && !(await this._holdt(() => this.nokkelDialog()))) { app.status('Henting fra Makin avbrutt'); return false; }
    return this._hent(a, this._valgFra(a), () => this.hent(a));
  },

  /** Valgene fra koblingen på et Makin-anlegg – det en ny henting bestiller. */
  _valgFra(a) {
    const m = a.ror.makin;
    return { orgId: m.orgId, prosjektId: m.prosjektId, prosjektnavn: m.prosjektnavn,
      systemer: m.systemer, koder: m.koder };
  },

  /**
   * Når et prosjekt åpnes: hvert Makin-anlegg i det hentes på nytt, ett om
   * gangen, så det står likt Makin uten at noen trykker.
   *
   * BRUKEREN BA OM DETTE (2026-10-19) – ellers står regelen om at ingenting
   * hentes uten et trykk. Derfor er det så stille som mulig: uten lagret nøkkel
   * hentes ingenting og det står én linje i statuslinja (ingen dialog som
   * hopper opp når man bare ville se på prosjektet); avviser Makin nøkkelen,
   * står det også bare der. Har ingenting endret seg i Makin, rører hentingen
   * ikke prosjektet – ingen angrepost, ingenting ulagret. Blir et annet
   * prosjekt åpnet underveis, stopper den.
   */
  async vedApning() {
    const app = this.app, P = app.P;
    const anlegg = (P && P.anlegg || []).filter(a => a.type === 'ror' && a.ror && !a.ror.plan && a.ror.makin);
    if (!anlegg.length) return;
    if (!this.klient.nokkel()) {
      app.status('Makin-anlegget ble ikke hentet på nytt – trykk «☁ Hent fra Makin» og legg inn nøkkelen');
      return;
    }
    for (const a of anlegg) {
      if (app.P !== P || !P.anlegg.includes(a)) return;
      await this._hent(a, Object.assign(this._valgFra(a), { auto: true }), null);
    }
  },

  /**
   * Hentingen: eksporten fra Makin, lest og regnet om, og så – bare om alt
   * gikk – inn i anlegget. `a` er null for et nytt anlegg.
   */
  async _hent(a, valg, igjen) {
    const app = this.app;
    if (this._holder) return false;
    this._holder = true;
    const knapp = document.getElementById('verktoyRorMakin');
    if (knapp) knapp.disabled = true;
    const P = app.P;
    let feil = null, ok = false;
    try {
      const svar = await this.klient.hentEksport({ orgId: valg.orgId, prosjektId: valg.prosjektId,
        systemer: valg.systemer, koder: valg.koder }, t => app.status('☁ ' + t));
      const les = this._les(svar && svar.filer);
      /* PROSJEKTET KAN HA ENDRET SEG MENS MAKIN LAGET FILA. Et angre bygger
         anleggene på nytt fra en tekst, og et annet prosjekt kan være åpnet:
         da finnes ikke `a` lenger, og punktene ville havnet i et anlegg ingen
         ser. Heller ingenting enn feil sted. */
      if (app.P !== P || (a && !P.anlegg.includes(a))) {
        // ved åpning: et annet prosjekt er åpnet, og det skal ikke få en melding om dette
        if (!valg.auto) app.status('Prosjektet ble endret mens Makin hentet – trykk «Hent fra Makin» igjen');
      } else {
        this._leggInn(a, valg, les);
        ok = true;
      }
    } catch (e) {
      feil = e;
    } finally {
      this._holder = false;
      if (knapp) knapp.disabled = false;
    }
    if (feil && valg.auto) {
      // ved åpning: ingen dialog, bare en linje – brukeren har ikke bedt om noe
      this.app.status('⚠ Makin-anlegget ble ikke hentet på nytt: '
        + (feil.art === 'nokkel' ? 'Makin godtok ikke nøkkelen – trykk «☁ Hent fra Makin»' : (feil.message || 'noe gikk galt')));
      return false;
    }
    return feil ? this._feil(feil, igjen) : ok;
  },

  /**
   * Filene fra Makin, lest og flettet – eller en feil. Ingenting i `P` er
   * rørt ennå.
   *
   * Eksporten kan komme i flere filer (den deles i tidsbolker når den blir for
   * stor), og filene kan hete det samme og ha samme punkt på grensen.
   * `Ror.slaSammenFiler` kjenner punktene igjen på id-en, ikke på filnavnet.
   *
   * ET SVAR UTEN PUNKTER ER EN FEIL, IKKE ET TOMT ANLEGG. Hentingen bytter ut
   * alt, så et tomt svar – en eksport som gikk galt hos Makin, eller maskiner
   * og koder som ikke har noe – ville tømt anlegget og tatt rettingene med
   * seg. Det skal ingen trykk på «Hent» gjøre uten et ord.
   *
   * MEN ÉN TOM FIL ER IKKE ET TOMT SVAR. En stor eksport hentes i tidsbolker,
   * og en bolk kan være tom (en fellesferie uten innmålinger). `Ror.lesSOSI`
   * kaster «Fant ingen innmålte punkter i fila» for en SOSI uten punkter – som
   * feil ved import av én fil er det riktig, men her stoppet det hele
   * hentingen, og et stort prosjekt kunne aldri hentes. En SOSI-fil uten
   * punkter telles derfor som null punkt, og feilen kommer først når det er
   * null punkt i ALLE filene. (lesSOSI selv står urørt til sonden har sett en
   * ekte eksport.)
   */
  _les(filer) {
    const lest = [];
    const liste = filer || [];
    let tomme = 0;
    for (const f of liste) {
      let les;
      try { les = Ror.lesFil(f.tekst); }
      catch (e) {
        if (this._tomSosi(f.tekst, e)) { tomme++; continue; }
        throw new Error('Fila fra Makin kunne ikke leses: ' + e.message);
      }
      const kk = Ror.sjekkKoordinater(les.punkter);
      if (kk.melding) throw new Error(kk.melding);
      les.punkter = kk.punkter;
      les.advarsler.utenforUtm = kk.utenfor;
      lest.push({ les, filnavn: f.navn });
    }
    if (!liste.length) throw new Error('Makin sendte ingen fil – ingenting i anlegget er tømt eller endret');
    const les = lest.length === 0 ? null : lest.length === 1 ? lest[0].les : Ror.slaSammenFiler(lest);
    if (!les || !les.punkter.length) throw new Error(this.INGEN_PUNKT);
    /* Tomme bolker ved siden av en med punkter: står i «hoppet over» sammen
       med det lesingen hoppet over, så tallene i statuslinja går opp. */
    if (tomme) les.advarsler = Object.assign({}, les.advarsler, { tommeFiler: tomme });
    return les;
  },

  INGEN_PUNKT: 'Makin sendte ingen innmålte punkt for de valgte maskinene og kodene – '
    + 'ingenting i anlegget er tømt eller endret',

  /** En SOSI-fil som bare mangler punkter – ikke en fil som ikke kan leses. */
  _tomSosi(tekst, feil) {
    return /^\s*\.HODE\b/.test(String(tekst || '').replace(/^﻿/, ''))
      && /^Fant ingen innmålte punkter i fila/.test(feil && feil.message);
  },

  /**
   * Punktene inn i anlegget – ett angresteg.
   *
   * Hentingen bytter ut punktene og oppdaterer koblingen og kilden, men rører
   * ikke arbeidet oppå dem: rettinger, «samme rør», kodetabellen, grøftene,
   * sonen og maks avstand blir liggende. En retting som peker på et punkt som
   * ikke kom med, faller bort, og statuslinja sier hvor mange.
   */
  _leggInn(a, valg, les) {
    const app = this.app, P = app.P;
    const ny = !a;
    /* SONEN: et nytt anlegg får den fila oppgir (ellers den som legger
       punktene ved prosjektets andre anlegg). Et anlegg som finnes, BEHOLDER
       sin – punktene regnes om dit, som når en fil legges til i RorUI.leggInn.
       Ellers ville en sone brukeren har rettet i Rør-fanen blitt overkjørt av
       hver henting. */
    const gjett = Ror.gjettSone(les.punkter, les.epsg, ny ? RorUI._prosjektpunkter() : null);
    const til = ny ? gjett.sone : a.ror.sone;
    const fra = gjett.grunn === 'fila' ? gjett.sone : til;
    const iAnlegget = Ror.lagTilXY(fra, til);
    const punkter = fra === til ? les.punkter : les.punkter.map(p => {
      const q = iAnlegget(p);
      return Object.assign({}, p, { o: +q.x.toFixed(3), n: +q.y.toFixed(3) });
    });

    /* VED ÅPNING, OG INGENTING ER NYTT I MAKIN: prosjektet røres ikke. Ellers
       ville hver åpning gitt en angrepost og et prosjekt som «har endringer
       som ikke er lagret», bare fordi tidspunktet for hentingen flyttet seg. */
    if (valg.auto && !ny) {
      const prove = Ror.byttPunkter(a.ror, punkter);
      if (!prove.nye && !prove.borte && !prove.endret) {
        app.status(`«${a.navn}» er likt Makin (${prove.punkter.length} punkt)`);
        return;
      }
    }

    // ---- herfra endres prosjektet ----
    app.merk('hentet fra Makin');
    if (ny) {
      a = app.nyttAnlegg('ror', RorUI._ledigNavn(valg.prosjektnavn || 'Makin'));
      a.ror.sone = til;
    }
    const bytte = Ror.byttPunkter(a.ror, punkter);
    a.ror.punkter = bytte.punkter;
    Ror.rensRetting(a.ror, new Set(bytte.punkter.map(p => p.id)));
    // nye koder får et forslag; det brukeren har satt opp, står
    a.ror.koder = Ror.koderFra(bytte.punkter, a.ror.koder);
    const importert = new Date().toISOString();
    const kilde = { fil: 'Makin: ' + valg.prosjektnavn, program: 'Makin 3D', dato: les.dato, importert, antall: bytte.punkter.length };
    if (fra !== til) kilde.regnetOm = { fra, til };
    /* Én kilde, erstattet ved hver henting: lista skulle ellers vokst med ett
       «Makin» for hvert trykk, og alle sammen beskrev det samme punktsettet. */
    a.ror.kilder = [kilde];
    a.ror.makin = {
      orgId: valg.orgId, prosjektId: valg.prosjektId, prosjektnavn: valg.prosjektnavn,
      systemer: valg.systemer, koder: valg.koder, sistHentet: importert, antall: bytte.punkter.length
    };
    if (ny) {
      /* Samme regel som RorUI.leggInn: et ferskt prosjekt der det ene
         anlegget er tomt, får det byttet ut i stedet for å ha en tom veg
         liggende foran seg i lista. */
      const na = app.anlegg();
      const tomt = na && !app._harGeometri(na);
      if (P.ubestemt && tomt) { a.id = na.id; P.anlegg[P.anlegg.indexOf(na)] = a; }
      else P.anlegg.push(a);
      RorUI.valgt = null;
    }
    delete P.ubestemt;
    if (P.aktivt !== a.id) {
      /* Byttet er en del av hentingen, ikke en egen ting å angre. */
      app._ikkeMerk = true;
      try { app.byttAnlegg(a.id); } finally { app._ikkeMerk = false; }
    } else {
      app._terrengnokkel = '';
      app.resultat = null;
      app.visAnleggsvelger();
      app.malTilSkjema();
      app.tegnAlt();
      app.planlegg(30);
    }
    app.visAnleggsvalg();
    if (ny) {
      Kart.settModus('rediger');
      if (Kart.zoomTilRor) Kart.zoomTilRor();
    }
    const r = bytte.rettingerBorte;
    /* Det lesingen hoppet over (doble navn, linjer, punkt uten høyde …) – med
       samme ordlyd som «Hoppet over» i importdialogen. */
    const hoppet = Ror.hoppetOver(les.advarsler);
    app.status((valg.auto ? `«${a.navn}» hentet på nytt: ` : '') + `${bytte.punkter.length} punkt fra Makin · ${bytte.nye} nye, ${bytte.borte} borte, ${bytte.endret} endret`
      + (r ? ` · ${r} ${r === 1 ? 'retting' : 'rettinger'} falt bort` : '')
      + (fra !== til ? ` · regnet om fra UTM ${fra} til anleggets UTM ${til}` : '')
      + (hoppet.length ? ` · hoppet over: ${hoppet.join(', ')}` : '')
      + (valg.tillegg || ''));
  },

  /**
   * En feil fra hentingen eller dialogen. En nøkkel Makin ikke godtar, gir
   * nøkkeldialogen – og med en ny nøkkel prøves det samme igjen. Alt annet
   * står i statuslinja.
   */
  async _feil(e, igjen) {
    const app = this.app;
    if (e && e.art === 'nokkel') {
      const hadde = !!this.klient.nokkel();
      if (hadde) app.status('⚠ Makin godtok ikke nøkkelen');
      const ny = await this._holdt(() => this.nokkelDialog(hadde ? 'Makin godtok ikke nøkkelen. Lag en ny i Makin og lim den inn her.' : null));
      if (ny && igjen) return igjen();
      if (!ny) app.status(hadde ? '⚠ Makin godtok ikke nøkkelen – ingenting er hentet' : 'Henting fra Makin avbrutt');
      return false;
    }
    app.status('⚠ ' + ((e && e.message) || 'Noe gikk galt med Makin'));
    return false;
  },

  /**
   * `f` (en dialog) med `_holder` satt så lenge den står oppe. Et nytt trykk
   * på «Hent» mens nøkkel- eller koblingsdialogen var åpen, la ellers en ny
   * dialog over den første – og den førstes løfte ble aldri innfridd. `_holder`
   * settes tilbake til det den var FØR et nytt forsøk startes, så «prøv igjen
   * med den nye nøkkelen» ikke stenger seg selv ute.
   */
  async _holdt(f) {
    const for_ = this._holder;
    this._holder = true;
    try { return await f(); } finally { this._holder = for_; }
  },

  /**
   * Rammen rundt dialogene – samme modal og samme klasser som RorUI.dialog.
   * `avbrutt` kalles når brukeren lukker med × eller Escape.
   */
  _modal(tittel, html, avbrutt) {
    const boks = document.getElementById('dialog');
    const ramme = boks.querySelector('.dialogboks');
    const innhold = document.getElementById('dialoginnhold');
    const lukkeknapp = document.getElementById('dialogLukk');
    document.getElementById('dialogtittel').textContent = tittel;
    innhold.innerHTML = html;
    let lukket = false;
    const gammelLukk = lukkeknapp.onclick;
    const lukk = () => {
      if (lukket) return false;
      lukket = true;
      boks.classList.add('skjult');
      ramme.classList.remove('bred');
      lukkeknapp.onclick = gammelLukk;
      document.removeEventListener('keydown', taste);
      return true;
    };
    const taste = e => { if (e.key === 'Escape' && lukk()) avbrutt(); };
    lukkeknapp.onclick = () => { if (lukk()) avbrutt(); };
    document.addEventListener('keydown', taste);
    ramme.classList.add('bred');
    boks.classList.remove('skjult');
    return { innhold, lukk, erLukket: () => lukket };
  },

  /**
   * Nøkkeldialogen. «Husk på denne maskinen» står alltid på: hver henting
   * trenger nøkkelen, og den lagres bare i denne nettleseren.
   * @param {?string} grunn hvorfor den spør (en avvist nøkkel)
   * @returns {Promise<boolean>} true når en nøkkel ble lagret
   */
  nokkelDialog(grunn) {
    return new Promise(los => {
      const m = this._modal('Makin-nøkkel', `
        ${grunn ? `<p class="raud">${escapeHtml(grunn)}</p>` : ''}
        <div class="makinfelt">
          <label for="makinNokkel">Lim inn API-nøkkelen fra Makin (Profil → API-nøkler → Opprett ny nøkkel)</label>
          <input id="makinNokkel" class="minivalg" type="password" autocomplete="off" spellcheck="false">
        </div>
        <label class="avkryss" title="Nøkkelen trengs ved hver henting, så den huskes alltid – bare i denne nettleseren">
          <input type="checkbox" id="makinHusk" checked disabled> Husk på denne maskinen</label>
        <p class="notis">Nøkkelen lagres bare i denne nettleseren – aldri i prosjektet, i eksportene eller på
          serveren. Massekalk bruker den bare til å lese fra Makin.</p>
        <p class="raud" id="makinNokkelMelding" hidden></p>
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="makinNokkelAvbryt">Avbryt</button>
          <button class="knapp primaer" id="makinNokkelOk">Bruk nøkkelen</button>
        </div>`, () => { felt.value = ''; los(false); });
      const d = m.innhold;
      const felt = d.querySelector('#makinNokkel');
      const melding = d.querySelector('#makinNokkelMelding');
      const ferdig = svar => { felt.value = ''; if (m.lukk()) los(svar); };
      const bruk = () => {
        const k = felt.value.trim();
        if (!k) { melding.textContent = 'Lim inn nøkkelen først.'; melding.hidden = false; return; }
        let lagret;
        /* En nøkkel med tegn som ikke kan stå i et HTTP-hode, kastes med en
           melding som kan vises som den er (den inneholder aldri nøkkelen). */
        try { lagret = this.klient.lagreNokkel(k); }
        catch (e) {
          felt.value = '';
          melding.textContent = (e && e.message) || 'Nøkkelen kunne ikke brukes.';
          melding.hidden = false;
          return;
        }
        if (!lagret) {
          melding.textContent = 'Nettleseren lar ikke Massekalk lagre nøkkelen (privat vindu eller blokkert lagring?).';
          melding.hidden = false;
          return;
        }
        ferdig(true);
      };
      d.querySelector('#makinNokkelAvbryt').onclick = () => ferdig(false);
      d.querySelector('#makinNokkelOk').onclick = bruk;
      felt.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); bruk(); } };
      felt.focus();
    });
  },

  /**
   * Koblingsdialogen: organisasjon (hoppes over når det bare er én),
   * prosjekt, maskiner og koder – alle på. Er alle krysset av, lagres `null`
   * («alle»), så maskiner og koder som kommer til i Makin senere, blir med.
   * Og ingen henting kan startes med ingenting valgt: proxyen avviser tomme
   * lister, og et tomt svar ville vært en feil uansett.
   *
   * @returns {Promise<?object>} valgene, `{byttNokkel}`, `{glemt}` eller null (avbrutt)
   */
  async koblingsdialog() {
    const k = this.klient;
    const liste = v => (Array.isArray(v) ? v : []);
    const orger = liste(await k.kall('organisasjoner')).filter(o => o && Makin.gyldigOrg(o.id));
    if (!orger.length) throw new Makin.MakinFeil('Nøkkelen gir ikke tilgang til noen organisasjon i Makin.', 'makin');
    return new Promise((los, avvis) => {
      const m = this._modal('Rør fra Makin', `
        ${orger.length > 1 ? `<div class="makinfelt"><label for="makinOrg">Organisasjon</label>
          <select id="makinOrg" class="minivalg">${orger.map(o =>
            `<option value="${o.id}">${escapeHtml(o.name || String(o.id))}</option>`).join('')}</select></div>` : ''}
        <div class="makinfelt"><label for="makinProsjekt">Prosjekt i Makin</label>
          <select id="makinProsjekt" class="minivalg" disabled><option value="">Henter prosjektene …</option></select></div>
        <div id="makinLister"></div>
        <p class="notis">Punktene legges i et eget røranlegg. Hvert trykk på «Hent fra Makin» henter alt på nytt,
          så anlegget blir likt Makin; rettinger og kodetabell blir liggende. Massekalk skriver aldri noe til Makin.</p>
        <p class="notis"><button class="minilenke" id="makinByttNokkel">Bytt nøkkel</button> ·
          <button class="minilenke" id="makinGlemNokkel">Glem nøkkelen i denne nettleseren</button></p>
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="makinAvbryt">Avbryt</button>
          <button class="knapp primaer" id="makinHent" disabled>Hent punktene</button>
        </div>`, () => los(null));
      const d = m.innhold;
      const ferdig = svar => { if (m.lukk()) los(svar); };
      const feil = e => { if (m.lukk()) avvis(e); };
      const orgValg = d.querySelector('#makinOrg');
      const velger = d.querySelector('#makinProsjekt');
      const lister = d.querySelector('#makinLister');
      const hentKnapp = d.querySelector('#makinHent');
      const org = () => (orgValg ? +orgValg.value : orger[0].id);
      let prosjekter = [];
      /* Svarene kommer når de kommer. Bytter brukeren prosjekt før maskinene
         til det forrige er hentet, skal det forrige svaret ikke skrive over. */
      let tur = 0;
      const merket = sel => [...d.querySelectorAll(sel)];
      /* Ingen hake i en liste som har bokser, gir ingenting å hente. Men en
         liste uten bokser (Makin ga ingen maskiner eller koder) skal ikke sperre
         knappen for godt: da sendes «alle» (null), og et tomt svar sier fra selv. */
      const ingenValgt = sel => { const alle = merket(sel); return alle.length > 0 && !alle.some(x => x.checked); };
      const sjekk = () => {
        hentKnapp.disabled = !velger.value || ingenValgt('input[data-system]') || ingenValgt('input[data-makinkode]');
      };
      const lastLister = async () => {
        const min = ++tur;
        const uuid = velger.value;
        lister.innerHTML = uuid ? '<p class="notis">Henter maskiner og koder …</p>' : '';
        sjekk();
        if (!uuid) return;
        let maskiner, koder;
        try {
          [maskiner, koder] = await Promise.all([k.kall('maskiner', { org: org(), prosjekt: uuid }),
            k.kall('koder', { org: org(), prosjekt: uuid })]);
        } catch (e) { if (min === tur) feil(e); return; }
        if (min !== tur || m.erLukket()) return;
        /* Samme regler som proxyen (Makin.gyldigUuid/gyldigKode): det den ville
           avvist med 400, kan ikke krysses av – ellers stoppet ett rart kodenavn
           hele hentingen med «en feil i Massekalk». */
        maskiner = liste(maskiner).filter(x => x && Makin.gyldigUuid(x.systemUuid));
        koder = liste(koder).filter(x => x && Makin.gyldigKode(x.codeName));
        const antall = n => (Number.isFinite(n) ? ` <span class="notis">· ${n}</span>` : '');
        lister.innerHTML = `
          <fieldset class="rormaal makinliste"><legend>Maskiner</legend>${maskiner.length ? maskiner.map(x =>
            `<label><input type="checkbox" data-system="${escapeAttr(x.systemUuid)}" checked>
              ${escapeHtml(x.systemName || 'Maskin')}${antall(x.recordCount)}</label>`).join('')
            : '<p class="notis">Ingen maskiner har logget noe i dette prosjektet.</p>'}</fieldset>
          <fieldset class="rormaal makinliste"><legend>Koder</legend>${koder.length ? koder.map(x =>
            `<label><input type="checkbox" data-makinkode="${escapeAttr(x.codeName)}" checked>
              ${escapeHtml(x.codeName)}${antall(x.recordCount)}</label>`).join('')
            : '<p class="notis">Ingen koder er logget i dette prosjektet.</p>'}</fieldset>`;
        for (const x of lister.querySelectorAll('input')) x.onchange = sjekk;
        sjekk();
      };
      const lastProsjekter = async () => {
        const min = ++tur;
        velger.disabled = true;
        velger.innerHTML = '<option value="">Henter prosjektene …</option>';
        lister.innerHTML = '';
        sjekk();
        let svar;
        try { svar = await k.kall('prosjekter', { org: org() }); }
        catch (e) { if (min === tur) feil(e); return; }
        if (min !== tur || m.erLukket()) return;
        prosjekter = liste(svar).filter(p => p && Makin.gyldigUuid(p.uuid));
        if (!prosjekter.length) { velger.innerHTML = '<option value="">Ingen prosjekter i denne organisasjonen</option>'; return; }
        velger.innerHTML = (prosjekter.length > 1 ? '<option value="">Velg prosjekt …</option>' : '')
          + prosjekter.map(p => `<option value="${escapeAttr(p.uuid)}">${escapeHtml(p.name || p.uuid)}</option>`).join('');
        velger.disabled = false;
        if (prosjekter.length === 1) await lastLister();
      };
      if (orgValg) orgValg.onchange = lastProsjekter;
      velger.onchange = lastLister;
      d.querySelector('#makinAvbryt').onclick = () => ferdig(null);
      d.querySelector('#makinByttNokkel').onclick = () => ferdig({ byttNokkel: true });
      d.querySelector('#makinGlemNokkel').onclick = () => { k.glemNokkel(); ferdig({ glemt: true }); };
      hentKnapp.onclick = () => {
        const p = prosjekter.find(x => x.uuid === velger.value);
        if (!p || hentKnapp.disabled) return;
        const valgte = (sel, felt) => {
          const alle = merket(sel), pa = alle.filter(x => x.checked);
          return pa.length === alle.length ? null : pa.map(x => x.dataset[felt]);
        };
        ferdig({ orgId: org(), prosjektId: p.uuid, prosjektnavn: String(p.name || 'Makin'),
          systemer: valgte('input[data-system]', 'system'), koder: valgte('input[data-makinkode]', 'makinkode') });
      };
      lastProsjekter();
    });
  },

  /** Linja i Rør-fanen på et Makin-anlegg: når det ble hentet, og nøkkelen. */
  faneHtml(r) {
    const m = r && r.makin;
    if (!m) return '';
    const tid = m.sistHentet ? new Date(m.sistHentet).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' }) : 'aldri';
    return `<p class="notis">Hentet fra Makin ${escapeHtml(tid)} · ${escapeHtml(m.prosjektnavn || '')}<br>
      <button class="minilenke" id="makinFaneBytt">Bytt nøkkel</button> ·
      <button class="minilenke" id="makinFaneGlem">Glem nøkkelen i denne nettleseren</button></p>`;
  },

  kobleFane(e) {
    const bytt = e.querySelector('#makinFaneBytt');
    if (bytt) {
      bytt.onclick = async () => {
        if (await this.nokkelDialog()) this.app.status('Den nye Makin-nøkkelen er lagret i denne nettleseren');
      };
    }
    const glem = e.querySelector('#makinFaneGlem');
    if (glem) {
      glem.onclick = () => {
        this.klient.glemNokkel();
        this.app.status('Makin-nøkkelen er glemt i denne nettleseren');
      };
    }
  }
};
