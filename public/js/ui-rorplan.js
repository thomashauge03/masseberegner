'use strict';
/**
 * Planlagte rør i skjermen: verktøyene i kartet, dialogene, Rør-fanen for
 * tegnede anlegg og redigeringen i profilen.
 *
 * Regnestykket ligger i rorplan.js. Her er bare det som rører skjermen.
 */
const RorPlanUI = {
  app: null,
  /* Traseen som tegnes nå. Den ligger utenfor prosjektet til den er ferdig,
     så hele traseen blir én angrepost – ikke én per klikk. */
  _ny: null,
  /* Tracepunktet som er valgt i kartet – Delete tar det bort. */
  valgt: null,
  _sistKode: null,

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    for (const [knapp, modus] of [['verktoyTrase', 'tegnTrase'], ['verktoyKum', 'kum'], ['verktoySnu', 'snuTrase']]) {
      if (id(knapp)) id(knapp).onclick = () => Kart.settModus(Kart.modus === modus ? 'rediger' : modus);
    }
    return this;
  },

  plan() { return this.app.P.ror.plan; },

  /* ---------------- ny trase ---------------- */

  /** Et klikk med «Ny trase»: punktet legges til, festet om det treffer et rør. */
  tegnKlikk(latlng) {
    if (!this.app.erPlan()) return;
    if (!this._ny) this._ny = [];
    const fest = this._fest(latlng);
    this._ny.push({ lat: fest ? fest.lat : latlng.lat, lon: fest ? fest.lon : latlng.lng, fest });
    this.app.status(`${this._ny.length} punkt${fest ? ' – festet til ' + (fest.trase ? 'traseen' : fest.kode) : ''}. `
      + 'Dobbeltklikk eller Enter avslutter, tilbaketasten tar bort det siste, Esc avbryter.');
    Kart.tegnRor();
  },

  /**
   * Et rør å feste til nær klikket: et punkt på en annen trase i dette
   * anlegget (greining), eller et målt punkt på et innmålt rør i et annet
   * anlegg (påkobling). Det nærmeste innen fjorten skjermpunkt vinner.
   */
  _fest(latlng) {
    const app = this.app, tol = RorUI._toleranse(latlng);
    let best = null;
    const prov = (lat, lon, mer) => {
      const d = Kart.kart.distance(latlng, L.latLng(lat, lon));
      if (d <= tol && (!best || d < best.d)) best = Object.assign({ d, lat, lon }, mer);
    };
    for (const t of this.plan().traseer) for (const p of t.punkter) prov(p.lat, p.lon, { trase: t.id, punkt: p.id });
    for (const a of app.P.anlegg) {
      if (a.type !== 'ror' || a.id === app.P.aktivt || !a.ror || a.ror.plan) continue;
      const b = Ror.byggLinjer(a.ror, a.mal || Ror.StandardRormal, Ror.lagTilXY(a.ror.sone, a.ror.sone));
      for (const l of b.linjer) {
        for (const p of l.punkter) {
          const [lat, lon] = Ror.tilLatLon(p, a.ror.sone);
          prov(lat, lon, { anlegg: a.id, punkt: p.id, topp: p.z, kode: p.kode, koder: a.ror.koder });
        }
      }
    }
    return best;
  },

  /** Tilbaketasten: det siste punktet bort. */
  angreSiste() {
    if (!this._ny || !this._ny.length) return;
    this._ny.pop();
    Kart.tegnRor();
  },

  /** Esc, eller et annet verktøy: traseen som tegnes, forkastes. */
  avbryt() {
    if (this._ny && this._ny.length) this.app.status('Traseen ble ikke lagret');
    this._ny = null;
  },

  /** Dobbeltklikk eller Enter: traseen er ferdig – velg rørene i den. */
  avsluttTrase() {
    const ny = this._ny;
    if (!ny || ny.length < 2) { this.app.status('En trase trenger minst to punkt'); return; }
    this._ny = null;
    Kart.settModus('rediger');
    const fest = [ny[0].fest, ny[ny.length - 1].fest].find(f => f && f.kode);
    this.rorDialog({
      tittel: 'Rør i traseen', flere: true, notis: `${ny.length} punkt.`,
      rader: [{ kode: (fest && fest.kode) || this._sistKode || '', side: 0, regel: '' }],
      lagre: rader => this.lagreTrase(ny, rader),
      avbrutt: () => this.app.status('Traseen ble ikke lagret')
    });
  },

  /** Kodene i de andre røranleggene – forslag når man skriver en kode. */
  _andreKoder() {
    const ut = [];
    for (const a of this.app.P.anlegg) {
      if (a.type !== 'ror' || a.id === this.app.P.aktivt || !a.ror) continue;
      for (const [k, v] of Object.entries(a.ror.koder || {})) if (v.form !== 'punkt') ut.push(k);
    }
    return ut;
  },

  /**
   * Dialogen for rør: kode, sideavstand og regel – én rad per rør. Brukes for
   * en ny trase (flere rør), et nytt rør i en trase og «Endre».
   */
  rorDialog(o) {
    const app = this.app, koder = app.P.ror.koder;
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = o.tittel;
    const forslag = [...new Set(Object.keys(koder).filter(k => koder[k].form !== 'punkt').concat(this._andreKoder()))];
    let nr = 0;
    const rad = x => {
      nr++;
      return `<div class="planrad"><label for="pk${nr}">Kode</label>`
        + `<input id="pk${nr}" class="plankode" list="planKodeliste" value="${escapeAttr(x.kode || '')}" placeholder="f.eks. SP 160PE">`
        + `<label for="ps${nr}">Side</label><input id="ps${nr}" class="planside" type="number" step="0.1" value="${x.side || 0}"> m`
        + `<label for="pr${nr}">Regel</label><select id="pr${nr}" class="minivalg planregel">`
        + ['', 'selvfall', 'trykk'].map(v => `<option value="${v}"${(x.regel || '') === v ? ' selected' : ''}>${v || 'fra koden'}</option>`).join('')
        + '</select>' + (o.flere ? ' <button class="minilenke planfjern" title="Ta bort røret">×</button>' : '') + '</div>';
    };
    innhold.innerHTML = `<p class="notis">${escapeHtml(o.notis || '')} Sideavstanden er fra traseen, positiv til høyre i `
      + 'tegneretningen. Regelen kommer av koden: selvfall for spillvann, overvann og drens, trykk for vann og kabel.</p>'
      + `<datalist id="planKodeliste">${forslag.map(k => `<option value="${escapeAttr(k)}">`).join('')}</datalist>`
      + `<div id="planRader">${o.rader.map(rad).join('')}</div>`
      + (o.flere ? '<div class="knapperad"><button class="knapp" id="planNyRad">+ Rør</button></div>' : '')
      + '<div class="knapperad" style="justify-content:flex-end"><button class="knapp" id="planAvbryt">Avbryt</button>'
      + '<button class="knapp primaer" id="planLagre">Lagre</button></div>';
    const koble = () => {
      for (const b of innhold.querySelectorAll('.planfjern')) {
        b.onclick = () => { if (innhold.querySelectorAll('.planrad').length > 1) b.closest('.planrad').remove(); };
      }
    };
    koble();
    if (o.flere) {
      innhold.querySelector('#planNyRad').onclick = () => {
        innhold.querySelector('#planRader').insertAdjacentHTML('beforeend', rad({ kode: '', side: 0, regel: '' }));
        koble();
      };
    }
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#planAvbryt').onclick = () => { lukk(); if (o.avbrutt) o.avbrutt(); };
    innhold.querySelector('#planLagre').onclick = () => {
      const rader = [...innhold.querySelectorAll('.planrad')].map(d => ({
        kode: d.querySelector('.plankode').value.trim(),
        side: RorPlan.klem('side', d.querySelector('.planside').value),
        regel: d.querySelector('.planregel').value || null
      })).filter(x => x.kode);
      if (!rader.length) { app.status('Skriv koden til minst ett rør'); return; }
      lukk();
      o.lagre(rader);
    };
    boks.classList.remove('skjult');
  },

  /**
   * Lagrer en ny trase med rørene. Endene som traff noe, festes: til en annen
   * trase som grein, til et innmålt rør som låst høyde på røret med samme kode
   * (ellers det første) – med kilden, så merknadene kan si fra om den endres.
   */
  lagreTrase(punkter, rader) {
    const app = this.app, r = app.P.ror, plan = r.plan;
    app.merk('ny trase');
    // den første traseen bestemmer sonen punktene tegnes i
    if (!plan.traseer.length) r.sone = Geo.sone(punkter[0].lon);
    const brukt = RorPlan.alleIder(plan);
    const ny = id => { brukt.add(id); return id; };
    const t = { id: ny(RorPlan.nyId(brukt, 't')), punkter: [] };
    for (const p of punkter) t.punkter.push({ id: ny(RorPlan.nyId(brukt, 'p')), lat: p.lat, lon: p.lon });
    plan.traseer.push(t);
    r.koder = Ror.koderFra(rader.map(x => ({ kode: x.kode })), r.koder);
    const nye = rader.map(x => {
      const ror = { id: ny(RorPlan.nyId(brukt, 'r')), trase: t.id, kode: x.kode, side: x.side || 0, regel: x.regel, motsatt: false };
      plan.ror.push(ror);
      return ror;
    });
    for (const [i, ende] of [[0, 'start'], [punkter.length - 1, 'slutt']]) {
      const f = punkter[i].fest;
      if (!f) continue;
      if (f.trase) { plan.greiner.push({ trase: t.id, ende, til: { trase: f.trase, punkt: f.punkt } }); continue; }
      const k = RorPlan.kodeAv(f.koder, f.kode);
      if (!(k.dim > 0)) { app.status(`Påkoblingen har koden ${f.kode} uten dimensjon – høyden ble ikke hentet`); continue; }
      const ror = nye.find(x => x.kode === f.kode) || nye[0];
      plan.laast.push({ ror: ror.id, punkt: t.punkter[i].id, bunn: +RorPlan.bunnFraTopp(f.topp, k).toFixed(3),
        kilde: { anlegg: f.anlegg, punkt: f.punkt, topp: f.topp } });
    }
    this._sistKode = rader[rader.length - 1].kode;
    RorUI.valgt = nye[0].id;
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Traseen er lagret med ${nye.length} rør – høydene kommer når terrenget er hentet`);
  },

  /* ---------------- redigering i kartet ---------------- */

  /** Klikk med «Kum» eller «Snu fallretning». */
  kartklikk(modus, latlng) {
    const app = this.app;
    if (!app.erPlan()) return;
    const plan = this.plan(), tol = RorUI._toleranse(latlng);
    if (modus === 'kum') {
      const p = this._naermestePunkt(latlng, tol);
      if (!p) { app.status('Klikk på et punkt på en trase'); return; }
      const ror = plan.ror.filter(x => x.trase === p.trase);
      if (!ror.length) { app.status('Traseen har ingen rør'); return; }
      if (ror.length === 1) this._vekslKum(ror[0], p.punkt);
      else this._velgRor(ror, 'Hvilket rør er kummen på?', x => this._vekslKum(x, p.punkt));
      return;
    }
    if (modus === 'snuTrase') {
      const t = this._naermesteTrase(latlng, tol);
      if (!t) { app.status('Klikk på en trase'); return; }
      app.merk('snudde fallretningen');
      for (const x of plan.ror) if (x.trase === t.id) x.motsatt = !x.motsatt;
      app.tegnAlt();
      app.planlegg(30);
      app.status('Fallretningen er snudd for rørene i traseen');
    }
  },

  /** Et valg mellom rørene i en trase – selvfall først, det er dem kummene står på. */
  _velgRor(ror, tittel, valgt) {
    const koder = this.app.P.ror.koder;
    const selv = x => (RorPlan.regel(x, RorPlan.kodeAv(koder, x.kode)) === 'selvfall' ? 0 : 1);
    const sortert = ror.slice().sort((a, b) => selv(a) - selv(b));
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = tittel;
    innhold.innerHTML = '<div class="knapperad">' + sortert.map((x, i) =>
      `<button class="knapp${i === 0 ? ' primaer' : ''}" data-planvelg="${escapeAttr(x.id)}">${escapeHtml(x.kode)}</button>`).join('')
      + '</div>';
    for (const b of innhold.querySelectorAll('[data-planvelg]')) {
      b.onclick = () => { boks.classList.add('skjult'); valgt(ror.find(x => x.id === b.dataset.planvelg)); };
    }
    boks.classList.remove('skjult');
  },

  /** Kum på et rør i et punkt – av om den finnes, på om den ikke gjør det. */
  _vekslKum(ror, punkt) {
    const app = this.app, plan = this.plan();
    const i = plan.kummer.findIndex(k => k.ror === ror.id && k.punkt === punkt);
    if (i >= 0) {
      app.merk('tok bort kum');
      plan.kummer.splice(i, 1);
      app.status('Kummen er tatt bort');
    } else {
      app.merk('ny kum');
      const id = RorPlan.nyId(RorPlan.alleIder(plan), 'k');
      plan.kummer.push({ id, ror: ror.id, punkt, diameter: app.P.mal.plan.kum.diameter });
      app.status(`Kum ${id} på ${ror.kode} – bunnløpet følger overdekningen til det låses i profilen`);
    }
    app.tegnAlt();
    app.planlegg(30);
  },

  /** Nærmeste tracepunkt innen toleransen. */
  _naermestePunkt(latlng, tol) {
    let best = null;
    for (const t of this.plan().traseer) {
      for (const p of t.punkter) {
        const d = Kart.kart.distance(latlng, L.latLng(p.lat, p.lon));
        if (d <= tol && (!best || d < best.d)) best = { trase: t.id, punkt: p.id, d };
      }
    }
    return best;
  },

  /** Nærmeste trase innen toleransen – målt til strekene i regnesonen. */
  _naermesteTrase(latlng, tol) {
    const sone = this.app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    let best = null;
    for (const t of this.plan().traseer) {
      const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
      for (let i = 1; i < xy.length; i++) {
        const d = Ror.avstandTilStrekk(u, xy[i - 1], xy[i]);
        if (d <= tol && (!best || d < best.d)) best = { t, d };
      }
    }
    return best ? best.t : null;
  },

  /**
   * Et tracepunkt er flyttet. Greiner festet til punktet følger med – også i
   * greinas eget endepunkt, så festet kan slippes uten at greina hopper.
   */
  flyttPunkt(tid, pid, latlng) {
    const plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    const p = t && t.punkter.find(x => x.id === pid);
    if (!p) return;
    p.lat = latlng.lat; p.lon = latlng.lng;
    /* Drar man en ende som er festet til en annen trase, slippes festet –
       ellers ville enden hoppet tilbake til punktet den var festet til. */
    const i = t.punkter.indexOf(p), ende = i === 0 ? 'start' : i === t.punkter.length - 1 ? 'slutt' : null;
    if (ende && plan.greiner.some(g => g.trase === tid && g.ende === ende)) {
      plan.greiner = plan.greiner.filter(g => !(g.trase === tid && g.ende === ende));
      this.app.status('Festet til den andre traseen er sluppet');
    }
    for (const g of plan.greiner) {
      if (g.til.trase !== tid || g.til.punkt !== pid) continue;
      const gt = plan.traseer.find(x => x.id === g.trase);
      const ende = gt && gt.punkter[g.ende === 'start' ? 0 : gt.punkter.length - 1];
      if (ende) { ende.lat = p.lat; ende.lon = p.lon; }
    }
  },

  /** Setter inn et punkt der traseen er nærmest klikket – på linja, så rørene ligger der de lå. */
  settInnPaaTrase(tid, latlng) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return null;
    const sone = app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
    let best = null;
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1], b = xy[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const s = L2 > 0 ? Math.max(0, Math.min(1, ((u.x - a.x) * dx + (u.y - a.y) * dy) / L2)) : 0;
      const q = { x: a.x + dx * s, y: a.y + dy * s }, d = Math.hypot(u.x - q.x, u.y - q.y);
      if (!best || d < best.d) best = { i, q, d };
    }
    app.merk('satte inn tracepunkt');
    const id = RorPlan.nyId(RorPlan.alleIder(plan), 'p');
    const g = Geo.fraUtm(best.q.x, best.q.y, sone);
    t.punkter.splice(best.i, 0, { id, lat: g.lat, lon: g.lon });
    app.tegnAlt();
    app.planlegg(30);
    return id;
  },

  /** Velger et tracepunkt – Delete tar det bort. */
  velgPunkt(tid, pid) {
    this.valgt = { trase: tid, punkt: pid };
    this.app.status('Punktet er valgt – Delete tar det bort, dra det for å flytte');
    Kart.tegnRor();
  },

  slettValgt() {
    if (this.valgt) this.slettPunkt(this.valgt.trase, this.valgt.punkt);
    this.valgt = null;
  },

  /**
   * Tar bort et tracepunkt – og det som står på det: kummer og låste høyder.
   * Greiner festet til punktet slippes; endepunktet deres blir stående der det
   * var. En trase kan ikke ha færre enn to punkt.
   */
  slettPunkt(tid, pid) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return;
    if (t.punkter.length <= 2) { app.status('En trase trenger minst to punkt – slett traseen i Rør-fanen'); return; }
    const i = t.punkter.findIndex(x => x.id === pid);
    if (i < 0) return;
    app.merk('slettet tracepunkt');
    t.punkter.splice(i, 1);
    const rorHer = new Set(plan.ror.filter(x => x.trase === tid).map(x => x.id));
    const for0 = [plan.kummer.length, plan.laast.length, plan.greiner.length];
    plan.kummer = plan.kummer.filter(k => !(rorHer.has(k.ror) && k.punkt === pid));
    plan.laast = plan.laast.filter(l => !(rorHer.has(l.ror) && l.punkt === pid));
    plan.greiner = plan.greiner.filter(g => !(g.til.trase === tid && g.til.punkt === pid)
      && !(g.trase === tid && ((g.ende === 'start' && i === 0) || (g.ende === 'slutt' && i === t.punkter.length))));
    const borte = [[for0[0] - plan.kummer.length, 'kum', 'kummer'], [for0[1] - plan.laast.length, 'låst høyde', 'låste høyder'],
      [for0[2] - plan.greiner.length, 'feste', 'fester']].filter(x => x[0]).map(x => `${x[0]} ${x[0] === 1 ? x[1] : x[2]}`);
    app.status('Punktet er slettet' + (borte.length ? ' – sammen med ' + borte.join(', ') : ''));
    if (this.valgt && this.valgt.punkt === pid) this.valgt = null;
    app.tegnAlt();
    app.planlegg(30);
  }
};

if (typeof module !== 'undefined') module.exports = RorPlanUI;
