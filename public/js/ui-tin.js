'use strict';
/**
 * Triangulering – innmålte terrengpunkter som terreng.
 *
 * Fila leses som rørene leser sine (LandXML, KOF eller SOSI – se Ror.lesFil),
 * men punktene blir en trekantflate i stedet for rør. Panelet viser hvor mye
 * flaten ligger over og under Kartverkets DTM1, og har de tre knappene som
 * endrer noe:
 *
 *   «Godkjenn og bruk som terreng» – først da er flaten bakken for tomta,
 *   vegen og 3D. Før det kan 3D-modellen i panelet vise hva som er lagt til
 *   og fjernet mot DTM1 (se Tin3d).
 *   Ta ut / ta med et punkt – en feilmåling skal ikke bære flaten.
 *   Lengste kant – hvor langt ytterkanten skrelles inn fra det konvekse.
 *
 * INGEN AV DEM SKJER AV SEG SELV. Mistenkelige punkter merkes, men står i
 * flaten til brukeren tar dem ut. Innmålte høyder endres aldri automatisk.
 */
const TinUI = {
  app: null,

  init(app) {
    this.app = app;
    const fil = document.getElementById('tinFil');
    if (fil) {
      fil.onchange = async () => {
        const f = fil.files && fil.files[0];
        fil.value = '';            // samme fil to ganger på rad skal også gi en change
        if (f) await this.importerFil(f);
      };
    }
    // knappene i panelet tegnes på nytt hver gang – ett lytteri for alle
    document.addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-tin]') : null;
      if (!b || !this.app || !this.app.erTin()) return;
      const hva = b.dataset.tin;
      if (hva === 'bruk') this.settBruk(!this.app.P.tin.bruk);
      else if (hva === 'veksle') this.veksle(b.dataset.navn);
      else if (hva === 'tauttalle') this.taUt((this.app.resultat && this.app.resultat.mistenkelige || []).map(m => m.navn));
      else if (hva === 'nyfil') this.velgFil();
      else if (hva === 'kantforslag') this.settMakskant(null);
      else if (hva === 'nytomt') this.nyTomt();
    });
    document.addEventListener('change', e => {
      const i = e.target;
      if (!i || i.id !== 'tinMakskant' || !this.app || !this.app.erTin()) return;
      const v = parseFloat(String(i.value).replace(',', '.'));
      this.settMakskant(Number.isFinite(v) && v >= 0 ? v : null);
    });
    this._koble3d();
  },

  /**
   * Knappene for 3D-modellen i panelet. Samme oppførsel som tomtas: tre
   * kameraer som slår hverandre av, og Før · Endring · Etter som leser
   * tilstanden ut av visningen (se App sin kobling av t3_-knappene).
   */
  _koble3d() {
    if (typeof Tin3d === 'undefined') return;
    const v = Tin3d.init(this.app);
    const id = i => document.getElementById(i);
    const hjelp = id('tinhjelp');
    if (id('tinVisTabell')) id('tinVisTabell').onclick = () => { v.aktiver(false); if (hjelp) hjelp.classList.remove('skjult'); vis3(); };
    const kOpp = id('tinVis3d'), kGaa = id('tin3_bakken'), kFly = id('tin3_fly');
    const vis3 = () => {
      const paaGaa = v.aktiv && v.modus === 'bakken' && v.ferd === 'gaa';
      const paaFly = v.aktiv && v.modus === 'bakken' && v.ferd === 'fly';
      for (const [k, pa] of [[kGaa, paaGaa], [kFly, paaFly]]) {
        if (!k) continue;
        k.classList.toggle('aktiv', pa);
        k.setAttribute('aria-pressed', pa ? 'true' : 'false');
      }
      if (kOpp) kOpp.classList.toggle('aktiv', v.aktiv && v.modus !== 'bakken');
    };
    v.paaModus = () => vis3();
    v.paaFerd = () => vis3();
    if (kOpp) kOpp.onclick = () => {
      if (hjelp) hjelp.classList.add('skjult');
      v.aktiver(true);
      v.settModus('oversikt');
      vis3();
    };
    const inn = ferd => {
      if (!v.aktiv && kOpp) kOpp.click();
      v.settFerd(ferd);
      v.settModus('bakken');
      vis3();
      const o = id('tin3dover');
      if (o) o.focus();
    };
    if (kGaa) kGaa.onclick = () => (v.modus === 'bakken' && v.ferd === 'gaa' ? v.settModus('oversikt') : inn('gaa'));
    if (kFly) kFly.onclick = () => (v.modus === 'bakken' && v.ferd === 'fly' ? v.settModus('oversikt') : inn('fly'));
    const knapper = [['tin3_foer', 'foer'], ['tin3_vanlig', 'vanlig'], ['tin3_etter', 'etter']]
      .map(([i, verdi]) => [id(i), verdi]).filter(([e]) => e);
    v.paaVisning = () => {
      for (const [e, verdi] of knapper) {
        const pa = v.visning === verdi;
        e.classList.toggle('aktiv', pa);
        e.setAttribute('aria-pressed', pa ? 'true' : 'false');
      }
    };
    for (const [e, verdi] of knapper) e.onclick = () => v.settVisning(verdi);
    if (id('tin3_overdriv')) id('tin3_overdriv').onchange = e => { v.overdriv = parseFloat(e.target.value) || 1; v.tegn(); };
    if (id('tin3_nullstill')) id('tin3_nullstill').onclick = () => v.nullstill();
    vis3();
  },

  velgFil() {
    const fil = document.getElementById('tinFil');
    if (fil) fil.click();
  },

  async importerFil(fil) {
    let tekst;
    try { tekst = Ror.dekod(await fil.arrayBuffer()); }
    catch (e) { this._feil('Klarte ikke å lese ' + fil.name + ': ' + e.message); return false; }
    return this.importerTekst(tekst, fil.name);
  },

  /**
   * Hele importen fra tekst. Egen inngang, så nettlesertesten slipper
   * filvelgeren.
   *
   * SONEN. LandXML fra Leica sier den bare som en projeksjon (sentralmeridian
   * 9° = UTM 32), og den leses av `Triangulering.sone`. Sier ikke fila noe,
   * avgjør Ror.gjettSone – nærmest prosjektets egne punkter, ellers 32.
   */
  importerTekst(tekst, filnavn) {
    const app = this.app;
    let les;
    try { les = Ror.lesFil(tekst); }
    catch (e) { this._feil(e.message); return false; }
    const kk = Ror.sjekkKoordinater(les.punkter);
    if (kk.melding) { this._feil(kk.melding); return false; }
    const punkter = kk.punkter
      .filter(p => Number.isFinite(p.z))
      .map((p, i) => ({ navn: String(p.id != null ? p.id : i + 1), kode: p.kode && p.kode !== 'UTEN KODE' ? p.kode : '',
        e: p.o, n: p.n, z: p.z, tid: p.tid || '' }));
    if (punkter.length < 3) { this._feil(`Fila har ${punkter.length} punkt med høyde – det trengs minst tre for en flate.`); return false; }
    const sone = Triangulering.sone(tekst) || Ror.gjettSone(kk.punkter, les.epsg, []).sone;
    return this.leggInn(punkter, filnavn, sone, kk.utenfor);
  },

  leggInn(punkter, filnavn, sone, utenfor) {
    const app = this.app, P = app.P;
    app.merk('innmålt terreng');
    const navn = RorUI._ledigNavn(String(filnavn || 'Innmålt terreng').replace(/\.[^.]+$/, '').slice(0, 40) || 'Innmålt terreng');
    const a = app.nyttAnlegg('tin', navn);
    a.tin.fil = filnavn || '';
    a.tin.sone = sone;
    a.tin.punkter = punkter;
    // samme regel som rørimporten: et ferskt prosjekt bytter ut det tomme anlegget
    const na = app.anlegg();
    if (P.ubestemt && na && !app._harGeometri(na)) { a.id = na.id; P.anlegg[P.anlegg.indexOf(na)] = a; }
    else P.anlegg.push(a);
    delete P.ubestemt;
    if (P.aktivt !== a.id) {
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
    Kart.settModus('rediger');
    this.zoomTil();
    const mist = Triangulering.mistenkelige(punkter);
    app.status(`${punkter.length} punkt lest fra ${filnavn} (UTM ${sone})`
      + (mist.length ? ` · ${mist.length} mistenkelig${mist.length > 1 ? 'e' : ''} – se Masser-fanen` : '')
      + (utenfor ? ` · ${utenfor} punkt utenfor UTM i Norge ble hoppet over` : '')
      + ' · Se over tallene og 3D-modellen, og trykk «Godkjenn og bruk som terreng» for å regne tomta mot punktene.');
    return true;
  },

  zoomTil() {
    const t = this.app.P.tin;
    if (!t || !t.punkter.length || !Kart.kart) return;
    const sone = t.sone || this.app.sone;
    const ll = t.punkter.map(p => { const g = Geo.fraUtm(p.e, p.n, sone); return [g.lat, g.lon]; });
    Kart.kart.fitBounds(L.latLngBounds(ll), { padding: [40, 40], maxZoom: 20 });
  },

  /* ---------------- knappene ---------------- */

  settBruk(pa) {
    const app = this.app;
    app.merk(pa ? 'godkjenn innmålt terreng' : 'angre godkjenning av innmålt terreng');
    app.P.tin.bruk = !!pa;
    app.tinEndret();
    app.status(pa
      ? 'Godkjent: det innmålte terrenget er nå bakken innenfor punktene – tomt, veg og 3D regnes mot det. Utenfor gjelder DTM1.'
      : 'Godkjenningen er tatt bort – alt regnes mot Kartverkets DTM1 igjen.');
    this.vis();
    Kart.tegn();
  },

  /** Tar et punkt ut av flaten, eller inn igjen. */
  veksle(navn) {
    const t = this.app.P.tin;
    if (!t) return;
    const ute = new Set(t.utelatt || []);
    const inn = ute.has(navn);
    this.app.merk(inn ? 'ta med punkt' : 'ta ut punkt');
    if (inn) ute.delete(navn); else ute.add(navn);
    t.utelatt = [...ute];
    this.app.tinEndret();
    this.app.status(inn ? `«${navn}» er med i flaten igjen` : `«${navn}» er tatt ut av flaten`);
  },

  taUt(navn) {
    const t = this.app.P.tin;
    if (!t || !navn.length) return;
    this.app.merk('ta ut mistenkelige punkt');
    t.utelatt = [...new Set((t.utelatt || []).concat(navn))];
    this.app.tinEndret();
    this.app.status(`${navn.length} punkt tatt ut av flaten`);
  },

  /**
   * Neste steg etter innmålingen: en tomt oppå, tegnet i kartet. Den legges
   * ETTER det innmålte terrenget i lista og regnes mot punktene så lenge
   * «Bruk som terreng» er på – Foreslå, Massebalanse og Optimaliser likeså.
   * Knappen slår ikke på «Bruk som terreng»; det er en egen knapp.
   */
  nyTomt() {
    const app = this.app;
    const bruk = !!(app.P.tin && app.P.tin.bruk);
    app.leggTilAnlegg('tomt');
    app.status('Ny tomt. Klikk rundt den i kartet, dobbeltklikk for å lukke. '
      + (bruk ? 'Den regnes mot de innmålte punktene der de ligger, og mot DTM1 utenfor.'
        : 'Det innmålte terrenget er ikke godkjent ennå – tomta regnes mot DTM1 til du godkjenner det.'));
  },

  settMakskant(v) {
    const t = this.app.P.tin;
    if (!t || t.makskant === v) return;
    this.app.merk('lengste kant');
    t.makskant = v;
    this.app.tinEndret();
  },

  /* ---------------- visning ---------------- */

  /**
   * Masser-fanen: tallene, knappene og forbeholdene. Punkttabellen står i
   * panelet under kartet.
   */
  vis() {
    const app = this.app;
    if (!app || !app.erTin()) return;
    const t = app.P.tin, r = app.resultat && app.resultat.type === 'tin' ? app.resultat : null;
    const tall = (v, d = 0) => (Number.isFinite(v) ? Rapport.tall(v, d) : '–');
    const rad = (navn, verdi, tittel) => `<div class="sumrad"${tittel ? ` title="${escapeHtml(tittel)}"` : ''}>`
      + `<span>${navn}</span><span class="verdi">${verdi}</span></div>`;
    const boks = document.getElementById('massesammendrag');
    if (boks) {
      let ut = `<h3>△ ${escapeHtml(app.anlegg().navn || 'Innmålt terreng')}</h3>`;
      ut += `<button class="knapp${t.bruk ? ' primaer' : ''}" data-tin="bruk" aria-pressed="${t.bruk ? 'true' : 'false'}" `
        + `title="Når den er på, er punktene bakken innenfor ytterkanten – for tomt, veg, profiler og 3D. Utenfor gjelder DTM1.">`
        + (t.bruk ? '✓ Godkjent – brukes som terreng' : 'Godkjenn og bruk som terreng') + '</button>';
      ut += `<p class="notis">${t.bruk
        ? 'Tomt og veg i prosjektet regnes mot punktene der de ligger, og mot DTM1 utenfor. Trykk igjen for å angre godkjenningen.'
        : 'Ikke godkjent: alt regnes fortsatt mot Kartverkets DTM1. Se over tallene og 3D-modellen (Ovenfra under kartet) – '
          + 'hva som er lagt til og fjernet – og godkjenn når punktene er fasiten.'}</p>`;
      ut += '<button class="knapp" data-tin="nytomt" title="Tegn en tomt i kartet. Foreslå kote, Massebalanse og Optimaliser '
        + 'regner da mot punktene der de ligger, og mot DTM1 utenfor.">⬟ Tegn tomt her</button>';
      if (!r) {
        ut += '<p class="notis">Regner …</p>';
      } else {
        const s = r.tin, f = r.flate;
        ut += '<h3>Mot Kartverkets DTM1</h3>';
        ut += rad('Punkter i flaten / trekanter', `${f.punkter.length} / ${f.tri.length}`);
        ut += rad('Areal ovenfra / skrått', `${tall(s.areal, 1)} / ${tall(s.skrå, 1)} m²`);
        ut += rad('Høyder i flaten', `${tall(s.zMin, 2)} – ${tall(s.zMaks, 2)} moh.`);
        ut += rad('Over DTM1 (fylt)', `${tall(s.fyll)} m³`);
        ut += rad('Under DTM1 (gravd)', `${tall(s.skjæring)} m³`);
        ut += rad('<b>Netto</b>', `<b>${tall(s.netto)} m³</b>`);
        ut += rad('Snittykkelse', `${tall(s.snittTykkelse, 2)} m`);
        ut += rad('Største fyllhøyde / gravedybde', `${tall(s.maksFyll, 2)} / ${tall(s.maksSkjæring, 2)} m`);
        ut += rad('Usikkerhet (±0,1 m over arealet)', `± ${tall(s.areal * 0.1)} m³`,
          'DTM1 har noen centimeter usikkerhet, og flaten er rett mellom punktene');
        if (s.manglerTerreng > 0.5) ut += `<p class="notis">⚠ ${tall(s.manglerTerreng)} m² mangler DTM1 og er ikke med i volumet.</p>`;
        if (r.mistenkelige.length) {
          ut += '<h3>Mistenkelige punkter</h3><p class="notis">Står langt fra snittet av naboene – ofte en '
            + 'feilmåling. De er med i flaten til du tar dem ut.</p>';
          for (const m of r.mistenkelige) {
            ut += `<div class="sumrad"><span>⚠ ${escapeHtml(m.navn)}: ${tall(Math.abs(m.avvik), 2)} m ${m.avvik < 0 ? 'under' : 'over'} naboene</span>`
              + `<button class="minilenke" data-tin="veksle" data-navn="${escapeHtml(m.navn)}">Ta ut</button></div>`;
          }
          if (r.mistenkelige.length > 1) ut += '<button class="knapp" data-tin="tauttalle">Ta ut alle mistenkelige</button>';
        }
        const ute = t.utelatt || [];
        if (ute.length) {
          ut += '<h3>Tatt ut av flaten</h3>';
          for (const n of ute) {
            ut += `<div class="sumrad"><span>${escapeHtml(n)}</span>`
              + `<button class="minilenke" data-tin="veksle" data-navn="${escapeHtml(n)}">Ta med</button></div>`;
          }
        }
        ut += '<h3>Ytterkanten</h3>';
        ut += `<div class="sumrad"><label for="tinMakskant">Lengste kant langs ytterkanten</label>`
          + `<span><input id="tinMakskant" type="number" min="0" step="0.5" value="${f.makskant}" style="width:5em"> m</span></div>`;
        ut += `<p class="notis">Lengre kanter skrelles bort, så det ikke regnes kubikk over hjørner ingen har målt. `
          + `0 gir hele det konvekse hylsteret. ${t.makskant == null ? 'Satt ut fra avstanden mellom punktene.'
            : '<button class="minilenke" data-tin="kantforslag">Tilbake til forslaget</button>'}</p>`;
        if (f.dubletter.length) ut += `<p class="notis">${f.dubletter.length} punkt på samme sted som et annet er hoppet over: ${f.dubletter.map(escapeHtml).join(', ')}.</p>`;
        ut += '<p class="notis">Kanten er målt der punktene slutter. Ligger kanten høyt over DTM1, er den målt på toppen '
          + 'av en fylling – skråningen ned til foten er da utenfor og ikke med.</p>';
      }
      ut += `<p class="notis">Fil: ${escapeHtml(t.fil || '–')} · UTM ${t.sone || '?'} · `
        + '<button class="minilenke" data-tin="nyfil">Les inn en annen fil</button></p>';
      boks.innerHTML = ut;
    }
    this.visPunkter();
  },

  /** Punkttabellen i panelet under kartet. */
  visPunkter() {
    const app = this.app, e = document.getElementById('tinpunkter');
    if (!e || !app.erTin()) return;
    const t = app.P.tin, r = app.resultat && app.resultat.type === 'tin' ? app.resultat : null;
    const mist = new Map(((r && r.mistenkelige) || []).map(m => [m.navn, m.avvik]));
    const ute = new Set(t.utelatt || []);
    const tall = v => (Number.isFinite(v) ? Rapport.tall(v, 2) : '–');
    let ut = '<table class="tintabell"><thead><tr><th>Punkt</th><th>Kode</th><th>Nord</th><th>Øst</th><th>Høyde</th>'
      + '<th>DTM1</th><th>Over DTM1</th><th></th></tr></thead><tbody>';
    for (const p of t.punkter) {
      const d = r ? r.dtm(p.e, p.n) : NaN, diff = p.z - d, m = mist.get(p.navn), u = ute.has(p.navn);
      ut += `<tr class="${u ? 'ute' : ''}${m != null ? ' mistenkelig' : ''}">`
        + `<td>${m != null ? '⚠ ' : ''}${escapeHtml(p.navn)}</td><td>${escapeHtml(p.kode || '')}</td>`
        + `<td>${Rapport.tall(p.n, 3)}</td><td>${Rapport.tall(p.e, 3)}</td><td>${tall(p.z)}</td><td>${tall(d)}</td>`
        + `<td class="${diff > 0.2 ? 'fyll' : diff < -0.2 ? 'skj' : ''}">${Number.isFinite(diff) ? (diff >= 0 ? '+' : '') + tall(diff) : '–'}</td>`
        + `<td><button class="minilenke" data-tin="veksle" data-navn="${escapeHtml(p.navn)}">${u ? 'Ta med' : 'Ta ut'}</button></td></tr>`;
    }
    e.innerHTML = ut + '</tbody></table>';
  },

  _feil(tekst) {
    if (typeof RorUI !== 'undefined' && RorUI._feil) RorUI._feil(tekst, 'Triangulering');
    else this.app.status('⚠ ' + tekst);
  }
};

if (typeof module !== 'undefined') module.exports = TinUI;
