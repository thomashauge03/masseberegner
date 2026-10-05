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
    return this;
  },

  /** «1–2 m», «over 4 m». */
  klasseNavn(k) {
    const t = v => String(v).replace('.', ',');
    return Number.isFinite(k.til) ? `${t(k.fra)}–${t(k.til)} m` : `over ${t(k.fra)} m`;
  },

  /** Hva en strekning setter: «helning 1:0,5 · fjell 0,8 m ned · egen grøft». */
  strekningTekst(st) {
    const t = v => Rapport.tall(v, 2);
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

  /** Dialogen for en strekning – oppgave 9. */
  dialog() {}
};
