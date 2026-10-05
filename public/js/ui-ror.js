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
    return this;
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
    const galt = Ror.sjekkKoordinater(les.punkter);
    if (galt) { this._feil(galt); return false; }
    const gjett = Ror.gjettSone(les.punkter, les.epsg, this._prosjektpunkter());
    const aktivtRor = app.erRor() ? app.anlegg() : null;
    const koder = Ror.koderFra(les.punkter, aktivtRor ? aktivtRor.ror.koder : null);
    const svar = svarUtenDialog
      ? Object.assign({ koder }, svarUtenDialog)
      : await this.dialog(les, filnavn, gjett, koder, aktivtRor);
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
  dialog(les, filnavn, gjett, koder, aktivtRor) {
    return new Promise(los => {
      const boks = document.getElementById('dialog');
      const ramme = boks.querySelector('.dialogboks');
      const innhold = document.getElementById('dialoginnhold');
      const lukkeknapp = document.getElementById('dialogLukk');
      document.getElementById('dialogtittel').textContent = 'Rør fra fil';
      const a = les.advarsler;
      const hoppet = [
        a.utenHoyde && `${a.utenHoyde} uten høyde`, a.ugyldige && `${a.ugyldige} med ugyldige tall`,
        a.doble && `${a.doble} doble`, a.referanser && `${a.referanser} referanser til andre punkt`
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
          <label><input type="radio" name="rorMaal" value="leggTil" checked>
            Legg til i «${escapeHtml(aktivtRor.navn || 'Rør')}» – punkt som finnes fra før, kjennes igjen</label>
          <label><input type="radio" name="rorMaal" value="nytt"> Nytt røranlegg</label></fieldset>` : ''}
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
          <input id="${id}d" class="minitall" type="number" min="0" max="3000" step="1" data-felt="dim" value="${k.dim || ''}"></td>
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
      const sam = Ror.slaSammen(a.ror.punkter, les.punkter);
      a.ror.punkter = sam.punkter;
      a.ror.koder = Object.assign({}, a.ror.koder, svar.koder);
      a.ror.kilder.push(kilde);
      a.ror.sone = svar.sone;
      melding = `${sam.nye} nye punkt, ${sam.kjente} fantes fra før`
        + (sam.endret ? `, ${sam.endret} med nye tall` : '');
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
    if (Kart.zoomTilRor) Kart.zoomTilRor();
    app.status(melding);
  },

  /** «VA Prøvefelt», eller «VA Prøvefelt 2» om navnet er tatt – se App.dopAnlegg. */
  _ledigNavn(navn) {
    const P = this.app.P;
    if (!P.anlegg.some(a => (a.navn || a.type) === navn)) return navn;
    let n = 2;
    while (P.anlegg.some(a => (a.navn || a.type) === navn + ' ' + n)) n++;
    return navn + ' ' + n;
  },

  /** Rørfanen og velgeren over profilen. Fylles i oppgave 10. */
  vis() {}
};
