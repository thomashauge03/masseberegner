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
    if (id('r3_groft')) {
      id('r3_groft').onclick = e => {
        Ror3d.lag.groft = !Ror3d.lag.groft;
        e.currentTarget.classList.toggle('aktiv', Ror3d.lag.groft);
        e.currentTarget.setAttribute('aria-pressed', Ror3d.lag.groft ? 'true' : 'false');
        Ror3d.tegn();
      };
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
    if (st.avstiving === 'kasse') deler.push(`grøftekasse ${t(Number.isFinite(st.kassebredde) ? st.kassebredde : Groft.KASSEBREDDE)} m`);
    else if (st.avstiving === 'spunt') deler.push('spunt');
    return deler.join(' · ') || 'ingen endringer';
  },

  /**
   * «90PE, 12–48 m», eller null om punktene ikke finnes på samme rør lenger.
   * `linjer` kan gis med, så en liste med mange strekninger ikke bygger
   * rørene på nytt for hver av dem.
   */
  _plassering(fra, til, linjer = this.app.byggRor().linjer) {
    for (const l of linjer) {
      const ia = l.punkter.findIndex(p => p.id === fra), ib = l.punkter.findIndex(p => p.id === til);
      if (ia < 0 || ib < 0 || ia === ib) continue;
      const s = [0];
      for (let i = 1; i < l.xy.length; i++) s.push(s[i - 1] + Math.hypot(l.xy[i].x - l.xy[i - 1].x, l.xy[i].y - l.xy[i - 1].y));
      return `${l.kode}, ${Rapport.tall(Math.min(s[ia], s[ib]), 0)}–${Rapport.tall(Math.max(s[ia], s[ib]), 0)} m`;
    }
    return null;
  },

  _rorMed(punkt, linjer = this.app.byggRor().linjer) {
    const l = linjer.find(x => x.punkter.some(p => p.id === punkt));
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
      + rad('Fundament', s.fundament) + rad('Omfylling (uten rør)', s.omfylling) + rad('Gjenfylling', s.gjenfylling)
      // kummene er verken fundament, omfylling eller gjenfylling – uten en egen rad går ikke tabellen opp
      + (s.kumvolum > 0.5 ? rad('Kummene (betong)', s.kumvolum) : '');
    ut += '<h4>Grøft etter dybde</h4>' + g.dybdeklasser.map(k => rad(this.klasseNavn(k), k.lengde, 'm')).join('')
      + rad('I alt', s.lengde, 'm');
    // avstivingen er det som faktureres der den står – bare når den er brukt
    const kasse = s.kasseLengde > 0.05, spunt = s.spuntAreal > 0.05;
    if (kasse || spunt) {
      ut += '<h4>Avstiving</h4>' + (kasse ? rad('Grøft med grøftekasse', s.kasseLengde, 'm') : '')
        + (spunt ? rad('Spunt, to vegger', s.spuntAreal, 'm²') : '');
    }
    ut += '<h4>Per kode</h4><table class="groftkodetall"><thead><tr><th scope="col">Kode</th><th scope="col">Grøft</th>'
      + '<th scope="col">Graving</th><th scope="col">Fjell</th><th scope="col">Fund.</th><th scope="col">Omf.</th>'
      + '<th scope="col">Gjenf.</th>' + (kasse ? '<th scope="col">Kasse</th>' : '') + (spunt ? '<th scope="col">Spunt</th>' : '')
      + '</tr></thead><tbody>'
      + [...g.perKode].map(([kode, k]) => `<tr><th scope="row">${escapeHtml(kode)}</th><td>${t(k.lengde)} m</td>`
        + `<td>${t(k.gravingLos)}</td><td>${t(k.sprengning)}</td><td>${t(k.fundament)}</td><td>${t(k.omfylling)}</td>`
        + `<td>${t(k.gjenfylling)}</td>` + (kasse ? `<td>${t(k.kasseLengde)} m</td>` : '')
        + (spunt ? `<td>${t(k.spuntAreal)} m²</td>` : '') + '</tr>').join('')
      + '</tbody></table><p class="notis">m³. Felles grøft står på det dypeste røret.</p>';
    ut += '<h4>Massebalanse</h4>' + rad('Gjenfylling fra gravemassene', b.gjenfyllingFraGraving)
      + rad('Løsmasse til overs (fast mål)', b.overskuddLos) + rad('Sprengt fjell (løst mål)', b.sprengtLos)
      + rad('Kjøpes: fundament', b.kjopFundament) + rad('Kjøpes: omfylling', b.kjopOmfylling)
      + (b.kjopGjenfylling > 0.5 ? rad('Kjøpes: gjenfylling', b.kjopGjenfylling) : '');
    const j = r.groft || Groft.nyGroft();
    const linjer = j.strekninger.length || j.sammen.length ? app.byggRor().linjer : [];
    let liste = '';
    j.strekninger.forEach((st, i) => {
      const hvor = this._plassering(st.fra, st.til, linjer);
      liste += `<li><span>${hvor ? escapeHtml(hvor) : '<span class="raud">punktene finnes ikke lenger</span>'}: `
        + `${escapeHtml(this.strekningTekst(st))}</span> <button class="minilenke" data-groftendre="${i}">Endre</button>`
        + ` <button class="minilenke" data-groftslett="${i}">Slett</button></li>`;
    });
    j.sammen.forEach((par, i) => {
      const a = this._rorMed(par[0], linjer), c = this._rorMed(par[1], linjer);
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
   * Normalgrøfta i løsmasse med anleggets mål – til rapporten og PDF-en:
   * terreng, gjenfylling, omfylling, fundament, røret og målene ved siden av.
   * Overdekningen er 1,2 m som eksempel; tegningen viser formen, ikke et sted.
   */
  tegnSnitt(lerret, mal, dimMm) {
    const B = lerret.width, H = lerret.height, k = lerret.getContext('2d');
    const m = Groft.malFor(mal, null, null), D = (dimMm || 110) / 1000;
    const dybde = 1.2 + D + m.fundament;
    const hel = m.helning, w = D / 2 + m.bunntillegg;
    const skala = Math.min((H * 0.66) / dybde, (B * 0.55) / (2 * w + 2 * dybde * Math.max(hel, 0.2)));
    const cx = B * 0.34, yT = H * 0.14, X = v => cx + v * skala, Y = v => yT + v * skala;
    const halv = d => w + Math.max(0, dybde - d) * hel;   // halv bredde i dybden d under terrenget
    const bunnRor = dybde - m.fundament, toppRor = bunnRor - D, omfTopp = Math.max(0, toppRor - m.omfylling);
    const flate = (d0, d1, farge) => {
      k.fillStyle = farge;
      k.beginPath();
      k.moveTo(X(-halv(d0)), Y(d0)); k.lineTo(X(halv(d0)), Y(d0));
      k.lineTo(X(halv(d1)), Y(d1)); k.lineTo(X(-halv(d1)), Y(d1));
      k.closePath(); k.fill();
    };
    k.fillStyle = Farger.flate; k.fillRect(0, 0, B, H);
    flate(0, omfTopp, Farger.groft('gjenfylling'));
    flate(omfTopp, bunnRor, Farger.groft('omfylling'));
    flate(bunnRor, dybde, Farger.groft('fundament'));
    // gravekanten rundt, så grøfta står klart mot bakken også der gjenfyllingen er lys
    k.strokeStyle = Farger.groft('bunn'); k.lineWidth = 2;
    k.beginPath();
    k.moveTo(X(-halv(0)), Y(0)); k.lineTo(X(-halv(dybde)), Y(dybde));
    k.lineTo(X(halv(dybde)), Y(dybde)); k.lineTo(X(halv(0)), Y(0));
    k.stroke();
    k.strokeStyle = Farger.terreng; k.lineWidth = 3;
    k.beginPath(); k.moveTo(B * 0.03, Y(0)); k.lineTo(B * 0.97, Y(0)); k.stroke();
    k.fillStyle = Farger.ror('vann');
    k.beginPath(); k.arc(X(0), Y(toppRor + D / 2), Math.max(4, D / 2 * skala), 0, Math.PI * 2); k.fill();
    const t = v => Rapport.tall(v, 2);
    const forhold = v => String(+v.toFixed(2)).replace('.', ',');   // «1:1», ikke «1:1,00»
    k.fillStyle = Farger.blekk; k.font = `${Math.round(H * 0.045)}px ${Farger.hent('skrift')}`;
    k.textBaseline = 'middle'; k.textAlign = 'left';
    const xt = Math.max(X(halv(0)) + B * 0.03, B * 0.66);
    k.fillText('Gjenfylling, stedlige masser', xt, Y(omfTopp / 2));
    k.fillText(`Omfylling ${t(m.omfylling)} m over røret`, xt, Y((omfTopp + bunnRor) / 2));
    k.fillText(`Fundament ${t(m.fundament)} m`, xt, Y((bunnRor + dybde) / 2) + H * 0.02);
    k.fillText(`Bunnbredde D + 2 × ${t(m.bunntillegg)} m · `
      + (hel === 0 ? 'loddrette vegger' : `skråning 1:${forhold(hel)}`) + ' · i fjell loddrett', B * 0.03, Y(dybde) + H * 0.09);
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
    /* Et tegnet anlegg har ingen målte punkt – linjene kommer fra planen.
       Punktene står i fila sin sone der også; strekene regnes om dit. */
    const linjer = r.plan
      ? app.byggRor().linjer.map(l => Object.assign({}, l, { xy: l.punkter.map(p => ({ x: p.o, y: p.n })) }))
      : Ror.byggLinjer(r, app.P.mal, p => ({ x: p.o, y: p.n })).linjer;
    if (modus === 'groftStrekning') {
      let best = null;
      for (const l of linjer) {
        for (const p of l.punkter) {
          // mellompunktene på et tegnet trykkrør flytter seg med terrenget
          if (p.mellom) continue;
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
      if (a.p.id === best.p.id) { app.status('Det var samme punkt – velg et annet'); return; }
      /* Et knutepunkt står i alle rørene som møtes der, og «linja» til det
         første klikket var bare én av dem. Det holder at ett rør har begge. */
      const har = (l, id) => l.punkter.some(p => p.id === id);
      if (!linjer.some(l => har(l, a.p.id) && har(l, best.p.id))) {
        app.status('Begge punktene må ligge på samme rør');
        return;
      }
      this.dialog({ fra: a.p.id, til: best.p.id, mal: {}, fjell: null, egen: false }, null);
      return;
    }
    if (modus === 'groftSammen') {
      let best = null;
      for (const l of linjer) {
        for (let i = 1; i < l.xy.length; i++) {
          const d = Ror.avstandTilStrekk(u, l.xy[i - 1], l.xy[i]);
          if (d > tol || (best && d >= best.d)) continue;
          /* Punktet nærmest klikket står for røret – sammenslåingen lagres mot
             id-er. Et knutepunkt står i flere rør, så er det nærmeste et
             knutepunkt, tas det andre endepunktet om det bare står i dette. */
          const naerA = Math.hypot(l.xy[i - 1].x - u.x, l.xy[i - 1].y - u.y) <= Math.hypot(l.xy[i].x - u.x, l.xy[i].y - u.y);
          /* Et tegnet trykkrør har mellompunkt, og de endrer seg med terrenget –
             gå til nærmeste knekkpunkt bakover. */
          let pi = naerA ? i - 1 : i;
          while (pi > 0 && l.punkter[pi].mellom) pi--;
          const p1 = l.punkter[pi], p2 = l.punkter[naerA ? i : i - 1];
          const delt = p => linjer.some(m => m !== l && m.punkter.some(x => x.id === p.id));
          best = { l, d, p: delt(p1) && !delt(p2) && !p2.mellom ? p2 : p1 };
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
      /* AVSTIVINGEN: med kasse eller spunt står veggene loddrett, og
         helningen over gjelder ikke der. Kassebredden står bare for kasse. */
      + '<div class="rorinnstilling"><label for="gsAvstiving">Avstiving</label><select id="gsAvstiving" class="minivalg">'
      + [['', 'Ingen – skråning'], ['kasse', 'Grøftekasse'], ['spunt', 'Spunt']]
        .map(([v, tekst]) => `<option value="${v}"${(st.avstiving || '') === v ? ' selected' : ''}>${tekst}</option>`).join('')
      + '</select></div>'
      + `<div class="rorinnstilling${st.avstiving === 'kasse' ? '' : ' skjult'}" id="gsKasseRad"><label for="gsKassebredde">`
      + 'Kassebredde, innvendig</label><input id="gsKassebredde" class="minitall" type="number" min="0.3" max="5" step="0.1" '
      + `value="${verdi(st.kassebredde)}" placeholder="${Groft.KASSEBREDDE}"> m</div>`
      + '<p class="notis">Med kasse eller spunt står veggene loddrett – helningen gjelder ikke der, og en nabo i samme '
      + 'grøft får loddrette vegger langs den også.</p>'
      + '<div class="knapperad" style="justify-content:flex-end">'
      + (indeks != null ? '<button class="knapp" id="gsSlett">Slett</button>' : '')
      + '<button class="knapp" id="gsAvbryt">Avbryt</button><button class="knapp primaer" id="gsLagre">Lagre</button></div>';
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#gsAvbryt').onclick = lukk;
    const avstiving = innhold.querySelector('#gsAvstiving');
    avstiving.onchange = () => innhold.querySelector('#gsKasseRad').classList.toggle('skjult', avstiving.value !== 'kasse');
    if (indeks != null) {
      innhold.querySelector('#gsSlett').onclick = () => {
        app.merk('slettet grøft på strekning');
        r.groft.strekninger.splice(indeks, 1);
        lukk(); app.tegnAlt(); app.planlegg(30);
      };
    }
    innhold.querySelector('#gsLagre').onclick = () => {
      const les = (id, f) => Groft.klem(f, innhold.querySelector('#' + id).value);
      /* Et tall som er skrevet, men ikke kan brukes, sies det fra om – under
         grensen og over den. Her ble det byttet stille: 0,2 m kassebredde ble
         1,2 m, og 9 m ble 5. */
      const felt = [['gsHelning', 'helning'], ['gsBunntillegg', 'bunntillegg'], ['gsFundament', 'fundament'],
        ['gsOmfylling', 'omfylling'], ['gsFjell', 'fjell']].concat(avstiving.value === 'kasse' ? [['gsKassebredde', 'kassebredde']] : []);
      const feil = felt.find(([id, f]) => {
        const v = innhold.querySelector('#' + id).value.trim();
        return v !== '' && (Groft.klem(f, v) === null || Number(v.replace(',', '.')) > Groft.GRENSER[f][1]);
      });
      if (feil) {
        const navn = innhold.querySelector(`label[for="${feil[0]}"]`).textContent;
        const [min, maks] = Groft.GRENSER[feil[1]], tt = v => String(+v.toFixed(2)).replace('.', ',');
        app.status(`Ugyldig tall i «${navn}» – det må være fra ${tt(min)} til ${tt(maks)}, eller tomt`);
        innhold.querySelector('#' + feil[0]).focus();
        return;
      }
      const mal = {};
      for (const [id, f] of [['gsHelning', 'helning'], ['gsBunntillegg', 'bunntillegg'],
        ['gsFundament', 'fundament'], ['gsOmfylling', 'omfylling']]) {
        const v = les(id, f);
        if (v !== null) mal[f] = v;
      }
      const ny = { fra: st.fra, til: st.til, mal, fjell: les('gsFjell', 'fjell'), egen: innhold.querySelector('#gsEgen').checked };
      if (Groft.AVSTIVING.includes(avstiving.value)) {
        ny.avstiving = avstiving.value;
        const kb = avstiving.value === 'kasse' ? les('gsKassebredde', 'kassebredde') : null;
        if (kb !== null) ny.kassebredde = kb;
      }
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
