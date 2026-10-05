'use strict';
/**
 * Grøfta i skjermbildet: grøftedelen i Rør-fanen, kodemålene, verktøyene i
 * kartet og tegningen av normalgrøfta til rapporten.
 *
 * Regnestykket ligger i groft.js. Her er bare det som rører skjermen.
 */
const GroftUI = {
  app: null,
  /* Første punkt ved «Grøft på strekning», og første rør ved «Felles grøft»,
     til det andre er klikket. Kartet ringer det inn. */
  _strekFra: null,
  _sammenFra: null,

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    for (const [knapp, modus] of [['verktoyGroftStrekning', 'groftStrekning'], ['verktoyGroftSammen', 'groftSammen']]) {
      if (id(knapp)) id(knapp).onclick = () => Kart.settModus(Kart.modus === modus ? 'rediger' : modus);
    }
    return this;
  },

  /** «1–2 m», «over 4 m». */
  klasseNavn(k) {
    const t = v => String(v).replace('.', ',');
    return Number.isFinite(k.til) ? `${t(k.fra)}–${t(k.til)} m` : `over ${t(k.fra)} m`;
  },

  /** Hva en strekning setter: «helning 1:0,5 · fjell 0,8 m ned · egen grøft». */
  strekningTekst(st) {
    // uten nuller bak: «0,5», ikke «0,50» – tallene er det brukeren skrev
    const t = v => String(+v.toFixed(2)).replace('.', ',');
    const m = st.mal || {}, deler = [];
    if (Number.isFinite(m.helning)) deler.push(m.helning === 0 ? 'loddrett' : `helning 1:${t(m.helning)}`);
    if (Number.isFinite(m.bunntillegg)) deler.push(`arbeidsrom ${t(m.bunntillegg)} m`);
    if (Number.isFinite(m.fundament)) deler.push(`fundament ${t(m.fundament)} m`);
    if (Number.isFinite(m.omfylling)) deler.push(`omfylling ${t(m.omfylling)} m`);
    if (Number.isFinite(st.fjell)) deler.push(st.fjell === 0 ? 'fjell i dagen' : `fjell ${t(st.fjell)} m ned`);
    if (st.egen) deler.push('egen grøft');
    return deler.join(' · ') || 'ingen endringer';
  },

  /** «90PE, 12–48 m», eller null om punktene ikke finnes på samme rør lenger. */
  _plassering(fra, til) {
    for (const l of this.app.byggRor().linjer) {
      const ia = l.punkter.findIndex(p => p.id === fra), ib = l.punkter.findIndex(p => p.id === til);
      if (ia < 0 || ib < 0) continue;
      const s = [0];
      for (let i = 1; i < l.xy.length; i++) s.push(s[i - 1] + Math.hypot(l.xy[i].x - l.xy[i - 1].x, l.xy[i].y - l.xy[i - 1].y));
      return `${l.kode}, ${Rapport.tall(Math.min(s[ia], s[ib]), 0)}–${Rapport.tall(Math.max(s[ia], s[ib]), 0)} m`;
    }
    return null;
  },

  _rorMed(punkt) {
    const l = this.app.byggRor().linjer.find(x => x.punkter.some(p => p.id === punkt));
    return l ? l.kode : null;
  },

  /** Grøftedelen i Rør-fanen: feltene, tallene, justeringene og merknadene. */
  html(r, res) {
    const app = this.app, g = res && res.groft;
    const t = (v, d = 0) => Rapport.tall(v, d);
    const m = Groft.malFor(app.P.mal.groft, null, null);
    const felt = (id, navn, verdi, enhet, steg, maks) => `<div class="rorinnstilling"><label for="${id}">${navn}</label>`
      + `<input id="${id}" class="minitall" type="number" min="0" max="${maks}" step="${steg}" value="${verdi}"> ${enhet}</div>`;
    let ut = '<h3>Grøft</h3>'
      + felt('groftBunntillegg', 'Arbeidsrom på hver side av røret', m.bunntillegg, 'm', 0.05, 2)
      + felt('groftFundament', 'Fundament under røret', m.fundament, 'm', 0.05, 1)
      + felt('groftOmfylling', 'Omfylling over røret', m.omfylling, 'm', 0.05, 2)
      + felt('groftHelning', 'Helning, vannrett per loddrett (0 = loddrett)', m.helning, ': 1', 0.1, 3)
      + felt('groftBrukbar', 'Gravemasse som kan brukes til gjenfylling', Math.round(m.brukbar * 100), '%', 5, 100);
    if (!g) return ut + '<p class="notis">Massene kommer når terrenget er hentet.</p>';
    const rad = (navn, v, enhet = 'm³') => `<div class="sumrad"><span>${navn}</span><span class="verdi">${t(v)} ${enhet}</span></div>`;
    const s = g.sum, b = g.balanse;
    ut += '<h4>Masser, teoretisk profil</h4>' + rad('Graving løsmasse', s.gravingLos) + rad('Sprengning fjell', s.sprengning)
      + rad('Fundament', s.fundament) + rad('Omfylling (uten rør)', s.omfylling) + rad('Gjenfylling', s.gjenfylling);
    ut += '<h4>Grøft etter dybde</h4>' + g.dybdeklasser.map(k => rad(this.klasseNavn(k), k.lengde, 'm')).join('')
      + rad('I alt', s.lengde, 'm');
    ut += '<h4>Per kode</h4><table class="groftkodetall"><thead><tr><th scope="col">Kode</th><th scope="col">Grøft</th>'
      + '<th scope="col">Graving</th><th scope="col">Fjell</th><th scope="col">Fund.</th><th scope="col">Omf.</th>'
      + '<th scope="col">Gjenf.</th></tr></thead><tbody>'
      + [...g.perKode].map(([kode, k]) => `<tr><th scope="row">${escapeHtml(kode)}</th><td>${t(k.lengde)} m</td>`
        + `<td>${t(k.gravingLos)}</td><td>${t(k.sprengning)}</td><td>${t(k.fundament)}</td><td>${t(k.omfylling)}</td>`
        + `<td>${t(k.gjenfylling)}</td></tr>`).join('')
      + '</tbody></table><p class="notis">m³. Felles grøft står på det dypeste røret.</p>';
    ut += '<h4>Massebalanse</h4>' + rad('Gjenfylling fra gravemassene', b.gjenfyllingFraGraving)
      + rad('Løsmasse til overs (fast mål)', b.overskuddLos) + rad('Sprengt fjell (løst mål)', b.sprengtLos)
      + rad('Kjøpes: fundament', b.kjopFundament) + rad('Kjøpes: omfylling', b.kjopOmfylling)
      + (b.kjopGjenfylling > 0.5 ? rad('Kjøpes: gjenfylling', b.kjopGjenfylling) : '');
    const j = r.groft || Groft.nyGroft();
    let liste = '';
    j.strekninger.forEach((st, i) => {
      const hvor = this._plassering(st.fra, st.til);
      liste += `<li><span>${hvor ? escapeHtml(hvor) : '<span class="raud">punktene finnes ikke lenger</span>'}: `
        + `${escapeHtml(this.strekningTekst(st))}</span> <button class="minilenke" data-groftendre="${i}">Endre</button>`
        + ` <button class="minilenke" data-groftslett="${i}">Slett</button></li>`;
    });
    j.sammen.forEach((par, i) => {
      const a = this._rorMed(par[0]), c = this._rorMed(par[1]);
      liste += `<li><span>Felles grøft: ${a && c ? escapeHtml(a) + ' og ' + escapeHtml(c)
        : '<span class="raud">rørene finnes ikke lenger</span>'}</span>`
        + ` <button class="minilenke" data-sammenslett="${i}">Slett</button></li>`;
    });
    ut += '<h4>Justeringer</h4>' + (liste ? `<ul class="groftjusteringer">${liste}</ul>` : '')
      + '<p class="notis">Legg til med «Grøft på strekning» og «Felles grøft» over kartet.</p>';
    if (g.merknader.length) {
      ut += `<h4>Merknader om grøfta</h4><ul class="rormerknader">${g.merknader.map(x => `<li>${escapeHtml(x.tekst)}</li>`).join('')}</ul>`;
    }
    return ut;
  },

  /** Feltene og knappene i grøftedelen. */
  koble(rot) {
    const app = this.app;
    const felt = { groftBunntillegg: 'bunntillegg', groftFundament: 'fundament', groftOmfylling: 'omfylling',
      groftHelning: 'helning', groftBrukbar: 'brukbar' };
    for (const [id, f] of Object.entries(felt)) {
      const el = rot.querySelector('#' + id);
      if (!el) continue;
      el.onchange = () => {
        const m = app.P.mal.groft || (app.P.mal.groft = Object.assign({}, Groft.StandardGroftmal));
        const v = Groft.klem(f, f === 'brukbar' ? parseFloat(el.value) / 100 : el.value);
        if (v === null) { el.value = f === 'brukbar' ? Math.round(m[f] * 100) : m[f]; return; }
        app.merk('endret grøftemal');
        m[f] = v;
        app.tegnAlt();
        app.planlegg(30);
      };
    }
    const r = app.P.ror;
    for (const knapp of rot.querySelectorAll('[data-groftendre]')) {
      knapp.onclick = () => this.dialog(r.groft.strekninger[+knapp.dataset.groftendre], +knapp.dataset.groftendre);
    }
    for (const knapp of rot.querySelectorAll('[data-groftslett]')) {
      knapp.onclick = () => {
        app.merk('slettet grøft på strekning');
        r.groft.strekninger.splice(+knapp.dataset.groftslett, 1);
        app.tegnAlt(); app.planlegg(30);
      };
    }
    for (const knapp of rot.querySelectorAll('[data-sammenslett]')) {
      knapp.onclick = () => {
        app.merk('slettet felles grøft');
        r.groft.sammen.splice(+knapp.dataset.sammenslett, 1);
        app.tegnAlt(); app.planlegg(30);
      };
    }
  },

  /** Grøftemål per kode. Tomt felt = anleggets verdi, som står som plassholder. */
  kodeHtml(koder) {
    const arv = Groft.malFor(this.app.P.mal.groft, null, null);
    const navn = { bunntillegg: 'Arbeidsrom m', fundament: 'Fundament m', omfylling: 'Omfylling m', helning: 'Helning :1' };
    const rader = Object.entries(koder).filter(([, k]) => k.form === 'linje').map(([kode, k], i) => {
      const g = k.groft || {};
      return `<tr data-kode="${escapeAttr(kode)}"><th scope="row">${escapeHtml(kode)}</th>`
        + Groft.MALFELT.map(f => `<td><label class="sr-only" for="gk${i}${f}">${navn[f]} for ${escapeHtml(kode)}</label>`
          + `<input id="gk${i}${f}" class="minitall" type="number" min="0" step="0.05" data-groft="${f}" `
          + `value="${Number.isFinite(g[f]) ? g[f] : ''}" placeholder="${arv[f]}"></td>`).join('') + '</tr>';
    }).join('');
    return '<h3>Grøft per kode</h3><p class="notis">Tomt felt = som resten av anlegget.</p>'
      + '<table class="rorkoder groftkoder"><thead><tr><th scope="col">Kode</th>'
      + Groft.MALFELT.map(f => `<th scope="col">${navn[f]}</th>`).join('') + `</tr></thead><tbody>${rader}</tbody></table>`;
  },

  /** Et felt i tabellen over er endret. */
  endreKode(input) {
    const app = this.app;
    const kode = input.closest('tr').dataset.kode, f = input.dataset.groft;
    const k = app.P.ror.koder[kode];
    if (!k) return;
    const v = Groft.klem(f, input.value);
    app.merk('endret grøft for kode');
    const g = Object.assign({}, k.groft || {});
    if (v === null) delete g[f]; else g[f] = v;
    if (Object.keys(g).length) k.groft = g; else delete k.groft;
    app.tegnAlt();
    app.planlegg(30);
  },

  /**
   * Klikk i kartet med «Grøft på strekning» eller «Felles grøft». Som
   * rettingene: alt i fila sin egen sone, der punktene står.
   */
  kartklikk(modus, latlng) {
    const app = this.app;
    if (!app.erRor()) return;
    const r = app.P.ror;
    const u = Geo.tilUtm(latlng.lat, latlng.lng, r.sone);
    const tol = RorUI._toleranse(latlng);
    const linjer = Ror.byggLinjer(r, app.P.mal, p => ({ x: p.o, y: p.n })).linjer;
    if (modus === 'groftStrekning') {
      let best = null;
      for (const l of linjer) {
        for (const p of l.punkter) {
          const d = Math.hypot(p.o - u.x, p.n - u.y);
          if (d <= tol && (!best || d < best.d)) best = { p, l, d };
        }
      }
      if (!best) { app.status('Klikk nærmere et målt punkt på et rør'); return; }
      if (!this._strekFra) {
        this._strekFra = best;
        app.status(`Valgte et punkt på ${best.l.kode} – klikk på det andre punktet på samme rør`);
        Kart.tegnRor();
        return;
      }
      const a = this._strekFra;
      this._strekFra = null;
      Kart.tegnRor();
      if (a.l.id !== best.l.id) { app.status('Begge punktene må ligge på samme rør'); return; }
      if (a.p.id === best.p.id) { app.status('Det var samme punkt – velg et annet'); return; }
      this.dialog({ fra: a.p.id, til: best.p.id, mal: {}, fjell: null, egen: false }, null);
      return;
    }
    if (modus === 'groftSammen') {
      let best = null;
      for (const l of linjer) {
        for (let i = 1; i < l.xy.length; i++) {
          const d = Ror.avstandTilStrekk(u, l.xy[i - 1], l.xy[i]);
          if (d > tol || (best && d >= best.d)) continue;
          // punktet nærmest klikket står for røret – sammenslåingen lagres mot id-er
          const naerA = Math.hypot(l.xy[i - 1].x - u.x, l.xy[i - 1].y - u.y) <= Math.hypot(l.xy[i].x - u.x, l.xy[i].y - u.y);
          best = { l, d, p: naerA ? l.punkter[i - 1] : l.punkter[i] };
        }
      }
      if (!best) { app.status('Klikk på en rørstrek'); return; }
      if (!this._sammenFra) {
        this._sammenFra = best;
        app.status(`Valgte ${best.l.kode} – klikk på røret det deler grøft med`);
        Kart.tegnRor();
        return;
      }
      const a = this._sammenFra;
      this._sammenFra = null;
      if (a.l.id === best.l.id) { app.status('Det var samme rør – velg det andre'); Kart.tegnRor(); return; }
      app.merk('felles grøft');
      if (!r.groft) r.groft = Groft.nyGroft();
      r.groft.sammen.push([a.p.id, best.p.id]);
      app.status(`${a.l.kode} og ${best.l.kode} har felles grøft der de går side om side`);
      app.tegnAlt();
      app.planlegg(30);
    }
  },

  /**
   * Dialogen for en strekning – ny fra kartet (indeks null) eller en fra lista.
   * Tomt felt = som resten av anlegget; plassholderen viser hva det blir.
   */
  dialog(st, indeks) {
    const app = this.app, r = app.P.ror;
    const boks = document.getElementById('dialog');
    const innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = 'Grøft på strekning';
    const m = st.mal || {}, arv = Groft.malFor(app.P.mal.groft, null, null);
    const verdi = v => (Number.isFinite(v) ? String(v) : '');
    const felt = (id, navn, v, plass, enhet) => `<div class="rorinnstilling"><label for="${id}">${navn}</label>`
      + `<input id="${id}" class="minitall" type="number" min="0" step="0.05" value="${verdi(v)}" placeholder="${plass}"> ${enhet}</div>`;
    const hvor = this._plassering(st.fra, st.til);
    innhold.innerHTML = `<p class="notis">${hvor ? escapeHtml(hvor) + ' – ' : ''}tomt felt = som resten av anlegget.</p>`
      + felt('gsHelning', 'Helning (0 = loddrett)', m.helning, String(arv.helning), ': 1')
      + felt('gsBunntillegg', 'Arbeidsrom på hver side', m.bunntillegg, String(arv.bunntillegg), 'm')
      + felt('gsFundament', 'Fundament', m.fundament, String(arv.fundament), 'm')
      + felt('gsOmfylling', 'Omfylling over røret', m.omfylling, String(arv.omfylling), 'm')
      + felt('gsFjell', 'Dybde til fjell (0 = fjell i dagen)', st.fjell, 'ikke kjent', 'm')
      + `<div class="rorinnstilling"><label><input type="checkbox" id="gsEgen"${st.egen ? ' checked' : ''}> `
      + 'Egen grøft – graves for seg selv om den overlapper en annen</label></div>'
      + '<div class="knapperad" style="justify-content:flex-end">'
      + (indeks != null ? '<button class="knapp" id="gsSlett">Slett</button>' : '')
      + '<button class="knapp" id="gsAvbryt">Avbryt</button><button class="knapp primaer" id="gsLagre">Lagre</button></div>';
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#gsAvbryt').onclick = lukk;
    if (indeks != null) {
      innhold.querySelector('#gsSlett').onclick = () => {
        app.merk('slettet grøft på strekning');
        r.groft.strekninger.splice(indeks, 1);
        lukk(); app.tegnAlt(); app.planlegg(30);
      };
    }
    innhold.querySelector('#gsLagre').onclick = () => {
      const les = (id, f) => Groft.klem(f, innhold.querySelector('#' + id).value);
      const mal = {};
      for (const [id, f] of [['gsHelning', 'helning'], ['gsBunntillegg', 'bunntillegg'],
        ['gsFundament', 'fundament'], ['gsOmfylling', 'omfylling']]) {
        const v = les(id, f);
        if (v !== null) mal[f] = v;
      }
      const ny = { fra: st.fra, til: st.til, mal, fjell: les('gsFjell', 'fjell'), egen: innhold.querySelector('#gsEgen').checked };
      app.merk(indeks != null ? 'endret grøft på strekning' : 'grøft på strekning');
      if (!r.groft) r.groft = Groft.nyGroft();
      if (indeks != null) r.groft.strekninger[indeks] = ny; else r.groft.strekninger.push(ny);
      lukk();
      app.tegnAlt();
      app.planlegg(30);
      app.status('Grøfta på strekningen er lagret – massene regnes på nytt');
    };
    boks.classList.remove('skjult');
  }
};
