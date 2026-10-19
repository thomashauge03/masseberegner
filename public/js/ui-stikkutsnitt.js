'use strict';
/**
 * «Utsnitt til stikning» i skjermen: knappen, rektangelet man drar opp i
 * kartet, og PDF-en. Punktene og arket er i stikkutsnitt.js.
 *
 * Rektangelet dras med musa: trykk, dra, slipp. Kartet flytter seg ikke mens
 * man drar – ellers ville dragningen flyttet kartet i stedet for å tegne.
 * Esc, eller knappen igjen, avbryter.
 */
const StikkutsnittUI = {
  app: null,
  _aktiv: false,

  init(app) {
    this.app = app;
    const knapp = document.getElementById('verktoyUtsnitt');
    if (knapp) knapp.onclick = () => (this._aktiv ? this.avbryt() : this.start());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this._aktiv) this.avbryt(); });
    return this;
  },

  start() {
    const app = this.app, kart = Kart.kart;
    if (!kart) return;
    if (!app.erRor()) { app.status('Utsnitt til stikning gjelder rørene – åpne et røranlegg først'); return; }
    this._aktiv = true;
    Kart.settModus('utsnitt');
    const knapp = document.getElementById('verktoyUtsnitt');
    if (knapp) { knapp.classList.add('aktiv'); knapp.setAttribute('aria-pressed', 'true'); }
    app.status('Dra et rektangel rundt området som skal stikkes ut. Esc avbryter.');
    kart.dragging.disable();
    let fra = null, rekt = null;
    this._ned = e => {
      fra = e.latlng;
      rekt = L.rectangle([fra, fra], { color: '#111', weight: 1.5, dashArray: '6 4', fill: true, fillOpacity: 0.08 }).addTo(kart);
    };
    this._flytt = e => { if (fra && rekt) rekt.setBounds(L.latLngBounds(fra, e.latlng)); };
    this._opp = e => {
      if (!fra) return;
      const b = L.latLngBounds(fra, e.latlng);
      fra = null;
      if (rekt) { kart.removeLayer(rekt); rekt = null; }
      this.avbryt(true);
      this.valgt(b);
    };
    kart.on('mousedown', this._ned);
    kart.on('mousemove', this._flytt);
    kart.on('mouseup', this._opp);
    this._rydd = () => { if (rekt) kart.removeLayer(rekt); };
  },

  /** Ut av verktøyet. `stille`: et rektangel ble valgt – statuslinja tar det som kommer etter. */
  avbryt(stille) {
    const kart = Kart.kart;
    this._aktiv = false;
    if (kart) {
      kart.off('mousedown', this._ned); kart.off('mousemove', this._flytt); kart.off('mouseup', this._opp);
      kart.dragging.enable();
    }
    if (this._rydd) this._rydd();
    const knapp = document.getElementById('verktoyUtsnitt');
    if (knapp) { knapp.classList.remove('aktiv'); knapp.setAttribute('aria-pressed', 'false'); }
    /* Modusen byttes etter klikket som kommer når musa slippes: byttet før,
       landet klikket i Rediger – og der starter et klikk i et tegnet anlegg
       en ny trase. */
    setTimeout(() => { if (Kart.modus === 'utsnitt') Kart.settModus('rediger'); }, 0);
    if (!stille) this.app.status('Utsnitt til stikning avbrutt');
  },

  /** Rektangelet i grader → en boks i meter i kartets sone (hjørnene omregnet, og boksen rundt dem). */
  boksFra(b, sone) {
    const hj = [b.getSouthWest(), b.getNorthEast(), b.getNorthWest(), b.getSouthEast()].map(p => Geo.tilUtm(p.lat, p.lng, sone));
    return { x0: Math.min(...hj.map(q => q.x)), x1: Math.max(...hj.map(q => q.x)),
      y0: Math.min(...hj.map(q => q.y)), y1: Math.max(...hj.map(q => q.y)) };
  },

  /**
   * Punktene i prosjektet, i kartets sone (x, y) – og med koordinatene som
   * skal stå i tabellen (n, o).
   *
   * Stikkpunktene og kummene kommer fra det tegnede anlegget som er åpent:
   * det er det som har høyder regnet. De innmålte kommer fra alle innmålte
   * røranlegg i prosjektet, uten de punktene som er slått av eller kodene som
   * er skjult – de står ikke i kartet heller.
   */
  punkter(sone) {
    const app = this.app, ut = [];
    const res = app.resultat;
    if (app.erPlan() && res && res.type === 'ror' && (res.linjer || []).length && app.sone === sone) {
      for (const p of RorEksport.punkter(app, res)) {
        const b = Math.max(3, String(p.stikk.length).length);
        p.stikk.forEach((q, j) => {
          ut.push({ type: 'stikk', ror: p.nr, rekke: j, navn: `${p.nr}-${String(j + 1).padStart(b, '0')}`, kode: p.kode,
            x: q.x, y: q.y, n: q.y, o: q.x, topp: q.topp, bunn: q.bunn, gravebunn: q.gravebunn,
            merknad: { start: 'start', slutt: 'slutt', knekk: 'knekkpunkt', kum: 'kum', stikk: '' }[q.type] || '' });
        });
      }
      for (const km of res.kummer || []) {
        ut.push({ type: 'kum', navn: 'K' + RorEksport.kumNr(km.id), kode: 'kum', x: km.x, y: km.y, n: km.y, o: km.x,
          topp: km.terreng, bunn: km.bunnlop, diameter: km.diameter, merknad: 'Topp: lokk (terreng) · Bunn: bunnløp' });
      }
    }
    for (const a of app.P.anlegg) {
      if (a.type !== 'ror' || !a.ror || a.ror.plan || !a.ror.punkter.length) continue;
      // et Makin-anlegg med en kopi: punktene står i kopien, og skal ikke stå to ganger i tabellen
      if (app.telles && !app.telles(a)) continue;
      const r = a.ror, tilXY = Ror.lagTilXY(r.sone, sone);
      const av = new Set((r.retting && r.retting.av) || []);
      for (const p of r.punkter) {
        if (av.has(p.id)) continue;
        const k = r.koder && r.koder[p.kode];
        if (k && k.vis === false) continue;
        const q = tilXY(p);
        /* NAVNET FRA FILA bare når det er kort nok til å lese – Xsite gir
           punktene lange id-er som ikke betyr noe på plassen. */
        const navn = String(p.id).length <= 22 && !/@/.test(p.id) ? String(p.id) : String(p.id).split('@')[0].slice(0, 22);
        ut.push({ type: 'innmalt', navn, kode: p.kode, x: q.x, y: q.y, n: p.n, o: p.o, topp: p.z,
          merknad: (r.sone !== sone ? `UTM ${r.sone} som i fila · ` : '') + (a.navn || '') });
      }
    }
    return ut;
  },

  /** Rektangelet er dratt: tell punktene, spør om bakgrunnskartet, og lag arket. */
  async valgt(b) {
    const app = this.app;
    const data = RorkartUI.samle();
    const boks = this.boksFra(b, data.sone);
    if (boks.x1 - boks.x0 < 0.5 || boks.y1 - boks.y0 < 0.5) { app.status('Dra et rektangel – et klikk er ikke et område'); return; }
    const alle = Stikkutsnitt.iBoks(this.punkter(data.sone), boks);
    if (!alle.length) { app.status('Ingen punkt i området – dra rektangelet rundt rørene'); return; }
    if (alle.length > Stikkutsnitt.MAKS) {
      app.status(`${alle.length} punkt i området – velg et mindre område (høyst ${Stikkutsnitt.MAKS})`);
      return;
    }
    const punkter = Stikkutsnitt.nummerer(alle);
    const utsnitt = Stikkutsnitt.utsnittFor(boks);
    // bare rørene som er innenfor kartet, så tegnforklaringen ikke lister hele prosjektet
    const linjer = data.linjer.filter(l => l.xy.some(q => q.x >= utsnitt.x0 && q.x <= utsnitt.x1 && q.y >= utsnitt.y0 && q.y <= utsnitt.y1));
    app.framdrift(true, 'Henter bakgrunnskart…', 0.2);
    let bakgrunn = null;
    try {
      bakgrunn = await RorkartUI.hentBakgrunn(Rorkart.flisplan(utsnitt, data.sone, 'topograatone', { dpi: 200 }),
        { framdrift: a => app.framdrift(true, 'Henter bakgrunnskart…', 0.2 + 0.6 * a) });
    } catch (e) { bakgrunn = null; }
    try {
      app.framdrift(true, 'Lager arket…', 0.9);
      const P = Stikkutsnitt.lagPdf({ prosjekt: app.P.navn, dato: new Date().toLocaleDateString('nb-NO'), sone: data.sone,
        boks, linjer, koder: data.koder, punkter, bakgrunn, utsnitt, merknad: 'Bakgrunnskartet kunne ikke hentes' });
      const bytes = await P.bygg();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = Lager.filnavn(app.P.navn) + '_stikning_utsnitt.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const n = t => punkter.filter(p => p.type === t).length;
      app.status(`Utsnitt til stikning lastet ned · ${punkter.length} punkt`
        + [n('stikk') && ` · ${n('stikk')} stikk`, n('kum') && ` · ${n('kum')} kummer`, n('innmalt') && ` · ${n('innmalt')} innmålte`]
          .filter(Boolean).join('') + ` · 1:${utsnitt.N}` + (bakgrunn ? '' : ' · uten bakgrunnskart'));
      this._sist = { punkter, boks, utsnitt, bytes: bytes.length };
    } catch (e) {
      app.status('⚠ Utsnittet kunne ikke lages: ' + e.message);
    } finally {
      app.framdrift(false);
    }
  }
};
