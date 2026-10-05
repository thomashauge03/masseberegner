'use strict';
/**
 * Rørene i skjermbildet: importen, rørfanen, kodetabellen og rettingen.
 *
 * Logikken ligger i ror.js. Her er bare det som rører skjermen – derfor kan
 * prøvene i test/rorprove.js dekke alt som regnes, og nettlesertesten det som
 * vises.
 */
const RorUI = {
  app: null,
  /* Røret profilen viser og kartet framhever. En id, ikke et objekt: linjene
     bygges på nytt ved hver endring, og id-en overlever det – se
     Ror.byggLinjer. */
  valgt: null,
  _valg: null,
  /* Den første enden ved «Koble», til den andre er klikket. Kartet ringer den
     inn, så man ser hva man holder på med. */
  _kobleFra: null,

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    const fil = id('rorFil');
    if (fil) {
      fil.onchange = async () => {
        const f = fil.files && fil.files[0];
        fil.value = '';            // samme fil to ganger på rad skal også gi en change
        if (f) await this.importerFil(f, this._valg || {});
      };
    }
    if (id('verktoyRorImport')) id('verktoyRorImport').onclick = () => this.velgFil({});
    /* SLIPP EN FIL PÅ KARTET.
       Fila ligger gjerne alt framme i Utforsker etter nedlastingen fra Xsite,
       og å dra den inn er raskere enn å lete den fram i en filvelger. */
    const flate = document.querySelector('.kartflate');
    if (flate) {
      flate.addEventListener('dragover', e => {
        const t = e.dataTransfer;
        if (t && [...(t.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); t.dropEffect = 'copy'; }
      });
      flate.addEventListener('drop', async e => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        e.preventDefault();
        if (!/\.xml$/i.test(f.name)) { this.app.status('Bare .xml-filer fra maskinstyringen kan slippes her'); return; }
        await this.importerFil(f, {});
      });
    }
    if (id('ror_velg')) id('ror_velg').onchange = e => this.velgLinje(e.target.value);
    if (id('ror_forrige')) id('ror_forrige').onclick = () => this.blaa(-1);
    if (id('ror_neste')) id('ror_neste').onclick = () => this.blaa(1);
    for (const [knapp, modus] of [['verktoyRorAv', 'rorAv'], ['verktoyRorBryt', 'rorBryt'],
      ['verktoyRorKoble', 'rorKoble']]) {
      if (id(knapp)) id(knapp).onclick = () => Kart.settModus(Kart.modus === modus ? 'rediger' : modus);
    }
    // Profil eller 3D i rørpanelet
    if (id('rorVisProfil')) id('rorVisProfil').onclick = () => Ror3d.aktiver(false);
    if (id('rorVis3d')) id('rorVis3d').onclick = () => { Ror3d.aktiver(true); Ror3d.settModus('oversikt'); };
    if (id('r3_overdriv')) id('r3_overdriv').onchange = e => { Ror3d.overdriv = parseFloat(e.target.value) || 1; Ror3d.tegn(); };
    if (id('r3_kontekst')) id('r3_kontekst').onchange = e => {
      Ror3d.kontekst = parseFloat(e.target.value) || 10;
      Ror3d._gitterFor = null;
      Ror3d._skalaSatt = false;
      // en bredere ring trenger kanskje terreng som ikke er lastet – beregningen henter det
      this.app.planlegg(30);
    };
    if (id('r3_staker')) id('r3_staker').onclick = e => {
      Ror3d.lag.staker = !Ror3d.lag.staker;
      e.currentTarget.classList.toggle('aktiv', Ror3d.lag.staker);
      e.currentTarget.setAttribute('aria-pressed', Ror3d.lag.staker ? 'true' : 'false');
      Ror3d.tegn();
    };
    if (id('r3_nullstill')) id('r3_nullstill').onclick = () => Ror3d.nullstill();
    return this;
  },

  /** Fjorten skjermpunkt i meter der man står – så et klikk treffer uansett zoom. */
  _toleranse(latlng) {
    const k = Kart.kart;
    const p = k.latLngToContainerPoint(latlng);
    return Math.max(0.3, k.distance(latlng, k.containerPointToLatLng(L.point(p.x + 14, p.y))));
  },

  /**
   * Et klikk i kartet mens en av de tre rettingene står på.
   *
   * Alt regnes i fila sin egen sone, der punktene står – da er det ingen
   * omregning mellom klikket og det som ble klikket på. Hver retting går
   * gjennom `merk()`, så Ctrl+Z virker, og lagres mot punktenes id-er, så den
   * står seg når en nyere fil importeres.
   */
  kartklikk(modus, latlng) {
    const app = this.app;
    if (!app.erRor()) return;
    const r = app.P.ror;
    const u = Geo.tilUtm(latlng.lat, latlng.lng, r.sone);
    const tol = this._toleranse(latlng);
    const iFila = p => ({ x: p.o, y: p.n });
    const avstand = p => Math.hypot(p.o - u.x, p.n - u.y);
    const par = (x, y) => ([a, b]) => (a === x && b === y) || (a === y && b === x);
    if (modus === 'rorAv') {
      let best = null;
      for (const p of r.punkter) {
        const d = avstand(p);
        if (d <= tol && (!best || d < best.d)) best = { p, d };
      }
      if (!best) { app.status('Klikk nærmere et målt punkt'); return; }
      const i = r.retting.av.indexOf(best.p.id);
      app.merk(i >= 0 ? 'slo på punkt' : 'slo av punkt');
      if (i >= 0) r.retting.av.splice(i, 1); else r.retting.av.push(best.p.id);
      app.status(`${best.p.kode}, punkt ${best.p.nr}: ${i >= 0 ? 'slått på igjen' : 'slått av – det er ikke med i røret'}`);
    } else if (modus === 'rorBryt') {
      const bygg = Ror.byggLinjer(r, app.P.mal, iFila);
      let best = null;
      for (const l of bygg.linjer) {
        for (let k = 1; k < l.xy.length; k++) {
          const d = Ror.avstandTilStrekk(u, l.xy[k - 1], l.xy[k]);
          if (d <= tol && (!best || d < best.d)) best = { a: l.punkter[k - 1], b: l.punkter[k], d, kode: l.kode };
        }
      }
      if (!best) { app.status('Klikk på en rørstrek'); return; }
      app.merk('brøt et rør');
      r.retting.brudd.push([best.a.id, best.b.id]);
      // gjelder en kobling det samme paret, er det bruddet som er det siste ordet
      r.retting.koble = r.retting.koble.filter(k => !par(best.a.id, best.b.id)(k));
      app.status(`${best.kode} er brutt mellom punkt ${best.a.nr} og ${best.b.nr}`);
    } else if (modus === 'rorKoble') {
      const bygg = Ror.byggLinjer(r, app.P.mal, iFila);
      const ender = [];
      for (const l of bygg.linjer) {
        ender.push({ p: l.punkter[0], l });
        ender.push({ p: l.punkter[l.punkter.length - 1], l });
      }
      for (const p of bygg.enslige) ender.push({ p, l: null });
      let best = null;
      for (const e of ender) {
        const d = avstand(e.p);
        if (d <= tol && (!best || d < best.d)) best = Object.assign({ d }, e);
      }
      if (!best) { app.status('Klikk på enden av et rør'); return; }
      if (!this._kobleFra) {
        this._kobleFra = best;
        app.status(`Valgte enden av ${best.p.kode} – klikk på den andre enden`);
        Kart.tegnRor();
        return;
      }
      const a = this._kobleFra;
      this._kobleFra = null;
      if (a.p.id === best.p.id) { app.status('Det var samme ende – velg en annen'); Kart.tegnRor(); return; }
      if (a.p.kode !== best.p.kode) {
        app.status(`Kan ikke koble ${a.p.kode} til ${best.p.kode} – bare rør med samme kode`);
        Kart.tegnRor();
        return;
      }
      if (a.l && best.l && a.l.id === best.l.id) { app.status('Begge endene hører til samme rør'); Kart.tegnRor(); return; }
      app.merk('koblet to rør');
      r.retting.koble.push([a.p.id, best.p.id]);
      r.retting.brudd = r.retting.brudd.filter(k => !par(a.p.id, best.p.id)(k));
      app.status(`${a.p.kode} er koblet sammen`);
    }
    Kart.tegn();
    this.vis();
    app.planlegg(30);
  },

  /** Åpner filvelgeren. `valg` følger med til importen. */
  velgFil(valg) {
    this._valg = valg || {};
    const fil = document.getElementById('rorFil');
    if (fil) fil.click();
  },

  async importerFil(fil, valg) {
    let tekst;
    try { tekst = Ror.dekod(await fil.arrayBuffer()); }
    catch (e) { this._feil('Klarte ikke å lese ' + fil.name + ': ' + e.message); return false; }
    return this.importerTekst(tekst, fil.name, valg);
  },

  /**
   * Hele importen fra tekst. Egen inngang, så nettlesertesten slipper
   * filvelgeren – den sender `svarUtenDialog` i stedet for å klikke.
   */
  async importerTekst(tekst, filnavn, valg = {}, svarUtenDialog) {
    const app = this.app;
    let les;
    try { les = Ror.lesLandXML(tekst); }
    catch (e) { this._feil(e.message); return false; }
    const kk = Ror.sjekkKoordinater(les.punkter);
    if (kk.melding) { this._feil(kk.melding); return false; }
    les.punkter = kk.punkter;
    les.advarsler.utenforUtm = kk.utenfor;
    const gjett = Ror.gjettSone(les.punkter, les.epsg, this._prosjektpunkter());
    const aktivtRor = app.erRor() ? app.anlegg() : null;
    /* Det aktive anleggets koder gir tolkningen og fargene for koder brukeren
       alt har rettet – men bare kodene i DENNE fila kommer med. Ellers arvet
       et nytt anlegg alle kodene til det gamle, med null punkt hver. Legges
       fila til, beholder anlegget sine egne uansett. */
    const iFila = new Set(les.punkter.map(p => p.kode));
    const koder = Object.fromEntries(Object.entries(Ror.koderFra(les.punkter, aktivtRor ? aktivtRor.ror.koder : null))
      .filter(([kode]) => iFila.has(kode)));
    const svar = svarUtenDialog
      ? Object.assign({ koder }, svarUtenDialog)
      : await this.dialog(les, filnavn, gjett, koder, aktivtRor, valg);
    if (!svar) { app.status('Importen ble avbrutt'); return false; }
    this.leggInn(les, filnavn, svar);
    return true;
  },

  /** Første punkt i hvert anlegg, i grader – det sonegjettingen måler mot. */
  _prosjektpunkter() {
    const ut = [];
    for (const a of this.app.P.anlegg) {
      if (a.ip && a.ip.length) ut.push({ lat: a.ip[0].lat, lon: a.ip[0].lon });
      if (a.tomt && a.tomt.punkter && a.tomt.punkter.length) ut.push({ lat: a.tomt.punkter[0].lat, lon: a.tomt.punkter[0].lon });
      if (a.ror && a.ror.punkter && a.ror.punkter.length) {
        const [lat, lon] = Ror.tilLatLon(a.ror.punkter[0], a.ror.sone);
        ut.push({ lat, lon });
      }
    }
    return ut;
  },

  /** En feilmelding der brukeren ser den – ikke bare i statuslinja. */
  _feil(tekst) {
    this.app.status('⚠ ' + tekst);
    const boks = document.getElementById('dialog');
    document.getElementById('dialogtittel').textContent = 'Rør fra fil';
    document.getElementById('dialoginnhold').innerHTML =
      `<p class="notis" style="font-size:13px">${escapeHtml(tekst)}</p>
       <div class="knapperad" style="justify-content:flex-end"><button class="knapp primaer" id="rorFeilOk">OK</button></div>`;
    document.getElementById('rorFeilOk').onclick = () => boks.classList.add('skjult');
    boks.classList.remove('skjult');
  },

  /**
   * Dialogen før importen: hva fila inneholder, hvilken sone, hva kodene betyr.
   * @returns {Promise<?{sone, koder, maal}>} null når brukeren avbryter
   */
  dialog(les, filnavn, gjett, koder, aktivtRor, valg = {}) {
    return new Promise(los => {
      const boks = document.getElementById('dialog');
      const ramme = boks.querySelector('.dialogboks');
      const innhold = document.getElementById('dialoginnhold');
      const lukkeknapp = document.getElementById('dialogLukk');
      document.getElementById('dialogtittel').textContent = 'Rør fra fil';
      const a = les.advarsler;
      const hoppet = [
        a.utenHoyde && `${a.utenHoyde} uten høyde`, a.ugyldige && `${a.ugyldige} med ugyldige tall`,
        a.doble && `${a.doble} doble`, a.referanser && `${a.referanser} referanser til andre punkt`,
        a.utenforUtm && `${a.utenforUtm} med koordinater utenfor UTM i Norge`
      ].filter(Boolean);
      const antall = {};
      for (const p of les.punkter) antall[p.kode] = (antall[p.kode] || 0) + 1;
      const grunn = {
        fila: 'Oppgitt i fila.',
        prosjektet: 'Valgt fordi punktene da havner ved de andre anleggene i prosjektet.',
        standard: 'Fila sier ikke hvilket koordinatsystem den bruker. Sone 32 er vanligst sør i landet – '
          + 'sjekk at rørene havner riktig i kartet etterpå.'
      }[gjett.grunn];
      const maks = this.app.P && this.app.erRor() ? this.app.P.mal.maksAvstand : Ror.StandardRormal.maksAvstand;
      innhold.innerHTML = `
        <p class="notis">${escapeHtml(filnavn)}${les.program ? ' · ' + escapeHtml(les.program) : ''}${les.dato ? ' · ' + escapeHtml(les.dato) : ''}</p>
        <p><b>${les.punkter.length}</b> innmålte punkt i <b>${Object.keys(antall).length}</b> koder.
          ${hoppet.length ? `<span class="raud">Hoppet over: ${hoppet.join(', ')}.</span>` : ''}</p>
        <p class="notis">Høydene er topp rør. Linjene trekkes mellom punkt med samme kode som ligger
          høyst ${maks} m fra hverandre.</p>
        <div class="rorsone">
          <label for="rorSoneValg">Koordinatsystem</label>
          <select id="rorSoneValg" class="minivalg">${[32, 33, 35].map(s =>
            `<option value="${s}"${s === gjett.sone ? ' selected' : ''}>EUREF89 UTM ${s}</option>`).join('')}</select>
          <span id="rorSonePos" class="notis"></span>
        </div>
        <p class="notis">${grunn}</p>
        ${this.kodetabellHtml(koder, antall)}
        ${aktivtRor ? `<fieldset class="rormaal"><legend>Hvor skal punktene?</legend>
          <label><input type="radio" name="rorMaal" value="leggTil"${valg.nytt ? '' : ' checked'}>
            Legg til i «${escapeHtml(aktivtRor.navn || 'Rør')}» – punkt som finnes fra før, kjennes igjen.
            Anlegget er i UTM ${aktivtRor.ror.sone}; er fila i en annen sone, regnes punktene om dit.</label>
          <label><input type="radio" name="rorMaal" value="nytt"${valg.nytt ? ' checked' : ''}> Nytt røranlegg</label></fieldset>` : ''}
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="rorAvbryt">Avbryt</button>
          <button class="knapp primaer" id="rorImporter">Importer</button>
        </div>`;
      const sone = innhold.querySelector('#rorSoneValg');
      const pos = innhold.querySelector('#rorSonePos');
      const midt = les.punkter[Math.floor(les.punkter.length / 2)];
      const komma = v => v.toFixed(4).replace('.', ',');
      const visPos = () => {
        const [lat, lon] = Ror.tilLatLon(midt, +sone.value);
        pos.textContent = `– punktene havner ved ${komma(lat)}° N ${komma(lon)}° Ø`;
      };
      sone.onchange = visPos;
      visPos();
      let avgjort = false;
      const gammelLukk = lukkeknapp.onclick;
      const taste = e => { if (e.key === 'Escape') lukk(null); };
      const lukk = svar => {
        if (avgjort) return;
        avgjort = true;
        boks.classList.add('skjult');
        ramme.classList.remove('bred');
        lukkeknapp.onclick = gammelLukk;
        document.removeEventListener('keydown', taste);
        los(svar);
      };
      lukkeknapp.onclick = () => lukk(null);
      innhold.querySelector('#rorAvbryt').onclick = () => lukk(null);
      innhold.querySelector('#rorImporter').onclick = () => {
        const maal = innhold.querySelector('input[name="rorMaal"]:checked');
        lukk({ sone: +sone.value, koder: this.lesKodetabell(innhold, koder), maal: maal ? maal.value : 'nytt' });
      };
      document.addEventListener('keydown', taste);
      ramme.classList.add('bred');
      boks.classList.remove('skjult');
    });
  },

  /** Tabellen over kodene – den samme i dialogen og i Koder-fanen. */
  kodetabellHtml(koder, antall) {
    const valg = (verdi, liste) => liste.map(([v, t]) =>
      `<option value="${escapeAttr(v)}"${v === verdi ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');
    const farger = Object.entries(Ror.FARGER);
    const rader = Object.keys(koder).map((kode, i) => {
      const k = koder[kode];
      const id = 'rk' + i;
      return `<tr data-kode="${escapeAttr(kode)}">
        <th scope="row"><span class="rorfarge" style="background:${Farger.ror(k.farge)}" aria-hidden="true"></span>${escapeHtml(kode)}</th>
        <td class="tall">${antall ? (antall[kode] || 0) : ''}</td>
        <td><label class="sr-only" for="${id}f">Tegnes som</label>
          <select id="${id}f" class="minivalg" data-felt="form">${valg(k.form, [['linje', 'Rør'], ['punkt', 'Punkt']])}</select></td>
        <td><label class="sr-only" for="${id}d">Dimensjon i mm</label>
          <input id="${id}d" class="minitall" type="number" min="0" max="3000" step="1" data-felt="dim" value="${escapeAttr(k.dim || '')}"></td>
        <td><label class="sr-only" for="${id}c">Farge</label>
          <select id="${id}c" class="minivalg" data-felt="farge">${valg(k.farge, farger)}</select></td>
        <td><label class="sr-only" for="${id}v">Ta med ${escapeHtml(kode)}</label>
          <input id="${id}v" type="checkbox" data-felt="vis"${k.vis !== false ? ' checked' : ''}></td>
      </tr>`;
    }).join('');
    return `<table class="rorkoder"><thead><tr><th scope="col">Kode</th><th scope="col">Punkt</th>
      <th scope="col">Tegnes som</th><th scope="col">⌀ mm</th><th scope="col">Farge</th><th scope="col">Med</th>
      </tr></thead><tbody>${rader}</tbody></table>`;
  },

  /** Det brukeren har valgt i kodetabellen, som en ny kodetabell. */
  lesKodetabell(rot, koder) {
    const ut = {};
    for (const tr of rot.querySelectorAll('table.rorkoder tr[data-kode]')) {
      const kode = tr.dataset.kode;
      const k = Object.assign({}, koder[kode]);
      const f = felt => tr.querySelector(`[data-felt="${felt}"]`);
      k.form = f('form').value === 'punkt' ? 'punkt' : 'linje';
      const d = parseFloat(f('dim').value);
      k.dim = Number.isFinite(d) && d > 0 ? d : null;
      k.farge = f('farge').value;
      k.vis = f('vis').checked;
      ut[kode] = k;
    }
    return ut;
  },

  /** Legger punktene inn – i et nytt anlegg, eller i det aktive. */
  leggInn(les, filnavn, svar) {
    const app = this.app, P = app.P;
    app.merk('importerte rør');
    const kilde = { fil: filnavn, program: les.program, dato: les.dato,
      importert: new Date().toISOString(), antall: les.punkter.length };
    let a = svar.maal === 'leggTil' && app.erRor() ? app.anlegg() : null;
    let melding;
    if (a) {
      /* DE NYE PUNKTENE REGNES OM TIL ANLEGGETS SONE – IKKE OMVENDT.
         Her sto `a.ror.sone = svar.sone`. Var den nye fila i en annen sone,
         ble hele anlegget tolket i den: de gamle punktene flyttet seg flere
         hundre kilometer, og det nye havnet 352 km fra der det var målt. */
      const fra = svar.sone, til = a.ror.sone;
      const iAnlegget = Ror.lagTilXY(fra, til);
      const nye = fra === til ? les.punkter : les.punkter.map(p => {
        const q = iAnlegget(p);
        return Object.assign({}, p, { o: +q.x.toFixed(3), n: +q.y.toFixed(3) });
      });
      const sam = Ror.slaSammen(a.ror.punkter, nye);
      a.ror.punkter = sam.punkter;
      a.ror.koder = Object.assign({}, a.ror.koder, svar.koder);
      a.ror.kilder.push(kilde);
      melding = `${sam.nye} nye punkt, ${sam.kjente} fantes fra før`
        + (sam.endret ? `, ${sam.endret} med nye tall` : '')
        + (fra !== til ? ` – regnet om fra UTM ${fra} til anleggets UTM ${til}` : '');
    } else {
      const navn = this._ledigNavn(Ror.navnFraFil(filnavn));
      a = app.nyttAnlegg('ror', navn);
      a.ror.sone = svar.sone;
      a.ror.punkter = les.punkter.map(p => Object.assign({}, p));
      a.ror.koder = svar.koder;
      a.ror.kilder = [kilde];
      /* ET NYTT PROSJEKT SOM IKKE HAR BESTEMT SEG, OG DER DET ENE ANLEGGET ER
         TOMT: bytt det ut i stedet for å legge et nytt ved siden av. Samme
         regel som `velgAnleggstype` – ellers ville et ferskt prosjekt med rør
         hatt en tom veg liggende foran seg i lista. */
      const na = app.anlegg();
      const tomt = na && !(na.ip && na.ip.length)
        && !(na.tomt && na.tomt.punkter && na.tomt.punkter.length)
        && !(na.ror && na.ror.punkter && na.ror.punkter.length);
      if (P.ubestemt && tomt) { a.id = na.id; P.anlegg[P.anlegg.indexOf(na)] = a; }
      else P.anlegg.push(a);
      melding = `${les.punkter.length} punkt importert som «${navn}»`;
    }
    delete P.ubestemt;
    this.valgt = null;
    if (P.aktivt !== a.id) {
      /* Byttet er en del av importen, ikke en egen ting å angre. */
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
    /* «Ny» setter kartet i tegnemodus, og byttet over gjør ikke noe med det
       når anlegget ble byttet ut på samme plass. Ble det stående, var neste
       klikk i kartet et vegpunkt. */
    Kart.settModus('rediger');
    if (Kart.zoomTilRor) Kart.zoomTilRor();
    const utenfor = les.advarsler && les.advarsler.utenforUtm;
    app.status(melding + (utenfor ? ` · ${utenfor} punkt utenfor UTM i Norge ble hoppet over` : ''));
  },

  /** «VA Prøvefelt», eller «VA Prøvefelt 2» om navnet er tatt – se App.dopAnlegg. */
  _ledigNavn(navn) {
    const P = this.app.P;
    if (!P.anlegg.some(a => (a.navn || a.type) === navn)) return navn;
    let n = 2;
    while (P.anlegg.some(a => (a.navn || a.type) === navn + ' ' + n)) n++;
    return navn + ' ' + n;
  },

  /**
   * Rørfanen, Koder-fanen og velgeren over profilen.
   *
   * Leser resultatet når det finnes, ellers linjene bygget her og nå – fanen
   * skal ikke stå tom mens terrenget lastes.
   */
  vis() {
    const app = this.app;
    if (!app || !app.erRor()) return;
    const r = app.P.ror;
    const res = app.resultat && app.resultat.type === 'ror' ? app.resultat : null;
    const bygg = res ? res.bygg : Ror.byggLinjer(r, app.P.mal, Ror.lagTilXY(r.sone, r.sone));
    if (!bygg.linjer.some(l => l.id === this.valgt)) {
      const lengst = bygg.linjer.slice().sort((a, b) => b.lengde - a.lengde)[0];
      this.valgt = lengst ? lengst.id : null;
    }
    this._fyllVelger(bygg.linjer, res);
    this._fyllFane(r, bygg, res);
    this._fyllKoder(r);
    // står forklaringen oppe, skal den vise kodene i dette anlegget – ikke forrige
    if (document.querySelector('.fane.aktiv[data-fane="forklaring"]')) Forklaring.vis(app);
  },

  /** Velger et rør: kartet framhever det, profilen og 3D viser det. */
  velgLinje(id) {
    this.valgt = id;
    const v = document.getElementById('ror_velg');
    if (v && v.value !== id) v.value = id;
    for (const b of document.querySelectorAll('#rorInnhold [data-linje]')) {
      b.classList.toggle('aktiv', b.dataset.linje === id);
    }
    Kart.tegnRor();
    if (typeof Rorprofil !== 'undefined') Rorprofil.tegn();
    if (typeof Ror3d !== 'undefined' && Ror3d.aktiv) Ror3d.tegn();
  },

  /** ◀ og ▶ – går rundt i lista. */
  blaa(retning) {
    const v = document.getElementById('ror_velg');
    if (!v || !v.options.length) return;
    const i = Math.max(0, [...v.options].findIndex(o => o.value === this.valgt));
    const n = v.options.length;
    this.velgLinje(v.options[(i + retning + n) % n].value);
  },

  _navn(l, res) {
    const bf = (res && res.bakkefaktor) || 1;
    return `${l.kode} · ${Rapport.tall(l.lengde * bf, 0)} m`;
  },

  _fyllVelger(linjer, res) {
    const v = document.getElementById('ror_velg');
    if (!v) return;
    v.innerHTML = linjer.map(l =>
      `<option value="${escapeAttr(l.id)}">${escapeHtml(this._navn(l, res))}</option>`).join('');
    if (this.valgt) v.value = this.valgt;
  },

  _fyllFane(r, bygg, res) {
    const e = document.getElementById('rorInnhold');
    if (!e) return;
    const app = this.app;
    const t = (v, d = 0) => Rapport.tall(v, d);
    const bf = (res && res.bakkefaktor) || 1;
    const kode = k => r.koder[k] || Ror.tolkKode(k);
    const s = res ? Ror.sammendrag(res) : null;
    const grupper = new Map();
    for (const l of bygg.linjer) {
      if (!grupper.has(l.kode)) grupper.set(l.kode, []);
      grupper.get(l.kode).push(l);
    }
    let liste = '';
    for (const [k, linjer] of grupper) {
      const kd = kode(k);
      const sum = linjer.reduce((a, l) => a + l.lengde * bf, 0);
      liste += `<div class="rorgruppe"><div class="rorkode"><span class="rorfarge" style="background:${Farger.ror(kd.farge)}" aria-hidden="true"></span>`
        + `<b>${escapeHtml(k)}</b><span class="notis">${kd.dim ? '⌀' + kd.dim + ' · ' : ''}${t(sum)} m</span></div>`;
      linjer.forEach((l, i) => {
        const pr = res && res.profiler.get(l.id);
        liste += `<button class="rorlinje${l.id === this.valgt ? ' aktiv' : ''}" data-linje="${escapeAttr(l.id)}">`
          + `${linjer.length > 1 ? (i + 1) + '. ' : ''}${t(l.lengde * bf, 1)} m · ${l.punkter.length} punkt`
          + (pr ? ` · overdekning ${Ror.spenn(pr.minOverdekning, pr.maksOverdekning, v => t(v, 2))} m` : '') + '</button>';
      });
      liste += '</div>';
    }
    const merknader = (res ? res.merknader : []).map(m => `<li>${escapeHtml(m.tekst)}</li>`).join('');
    const kilder = r.kilder.map(k => `${escapeHtml(k.fil)}${k.program ? ' · ' + escapeHtml(k.program) : ''}`
      + `${k.dato ? ' · ' + escapeHtml(k.dato) : ''} · ${escapeHtml(k.antall)} punkt`).join('<br>');
    const ret = r.retting;
    e.innerHTML = `
      <h3>${escapeHtml(app.anlegg().navn || 'Rør')}</h3>
      <p class="notis">${kilder || 'Ingen fil importert ennå.'}</p>
      ${s ? `<div class="sumrad"><span>Rør</span><span class="verdi">${s.antall} · ${t(s.lengde)} m</span></div>
      <div class="sumrad"><span>Overdekning</span><span class="verdi">${Ror.spenn(s.minOd, s.maksOd, v => t(v, 2))} m</span></div>` : ''}
      <h3>Rørene</h3>
      <div class="rorliste">${liste || '<p class="tomtekst">Ingen rør – sjekk kodene og maks avstand.</p>'}</div>
      ${merknader ? `<h3>Merknader</h3><ul class="rormerknader">${merknader}</ul>` : ''}
      <h3>Innstillinger</h3>
      <div class="rorinnstilling"><label for="rorSoneFane">Koordinatsystem i fila</label>
        <select id="rorSoneFane" class="minivalg">${[32, 33, 35].map(z =>
          `<option value="${z}"${z === r.sone ? ' selected' : ''}>EUREF89 UTM ${z}</option>`).join('')}</select></div>
      <div class="rorinnstilling"><label for="rorMaksAvstand">Største avstand mellom punkt på samme rør</label>
        <input id="rorMaksAvstand" class="minitall" type="number" min="5" max="200" step="1" value="${app.P.mal.maksAvstand}"> m</div>
      <h3>Retting</h3>
      <p class="notis">Slått av: ${ret.av.length} punkt · brudd: ${ret.brudd.length} · koblinger: ${ret.koble.length}.
        Bruk knappene i kartet for å rette.</p>
      <div class="knapperad">
        <button class="knapp" id="rorTilbakestill"${ret.av.length + ret.brudd.length + ret.koble.length ? '' : ' disabled'}>Tilbakestill rettinger</button>
        <button class="knapp" id="rorImportNy">Importer nyere fil…</button>
      </div>`;
    for (const b of e.querySelectorAll('[data-linje]')) b.onclick = () => this.velgLinje(b.dataset.linje);
    e.querySelector('#rorSoneFane').onchange = ev => {
      app.merk('endret koordinatsystem');
      r.sone = +ev.target.value;
      app._terrengnokkel = '';
      app.tegnAlt();
      app.planlegg(30);
      if (Kart.zoomTilRor) Kart.zoomTilRor();
    };
    e.querySelector('#rorMaksAvstand').onchange = ev => {
      const v = parseFloat(ev.target.value);
      if (!(v >= 5 && v <= 200)) { ev.target.value = app.P.mal.maksAvstand; return; }
      app.merk('endret maks avstand');
      app.P.mal.maksAvstand = v;
      app.tegnAlt();
      app.planlegg(30);
    };
    e.querySelector('#rorTilbakestill').onclick = async () => {
      if (!await app.bekreft('Ta bort alle rettingene? Punktene som er slått av kommer tilbake, '
        + 'og brudd og koblinger forsvinner – men du kan angre etterpå.', 'Tilbakestill')) return;
      app.merk('tilbakestilte rettinger');
      r.retting = { av: [], brudd: [], koble: [] };
      app.tegnAlt();
      app.planlegg(30);
    };
    e.querySelector('#rorImportNy').onclick = () => this.velgFil({});
  },

  _fyllKoder(r) {
    const e = document.getElementById('rorKoder');
    if (!e) return;
    const antall = {};
    for (const p of r.punkter) antall[p.kode] = (antall[p.kode] || 0) + 1;
    e.innerHTML = '<p class="notis">Hva hver kode i fila betyr. Endringene gjelder med en gang, og kan angres.</p>'
      + this.kodetabellHtml(r.koder, antall);
    e.onchange = () => {
      this.app.merk('endret kode');
      r.koder = this.lesKodetabell(e, r.koder);
      this.app.tegnAlt();
      this.app.planlegg(30);
    };
  }
};
