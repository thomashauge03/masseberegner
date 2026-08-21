'use strict';
/**
 * Snitt gjennom tomta.
 *
 * Det samme lengdeprofilen er for en veg: et bilde av hva som skal graves og
 * fylles, som man kan lese av mens man setter høyden. Snittet legges gjennom
 * tomtas tyngdepunkt, langs fallretningen - det er den veien det ferdige nivaet
 * heller, og dermed den retningen forskjellen mot terrenget er størst.
 *
 * Uten et slikt bilde ser man bare tall. Da vet man ikke om det er ett hjørne
 * som drar hele skjæringen, eller om tomta ligger jevnt for dypt.
 */

const Tomteprofil = {
  app: null,
  lerret: null,

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tomtprofil');
    if (!this.lerret) return this;
    new ResizeObserver(() => this.tegn()).observe(this.lerret);
    /* Klikk i snittet flytter det ferdige nivaet dit man peker. Det er den
       raskeste maten a prøve seg fram pa - samme grep som a dra et knekkpunkt
       i lengdeprofilen. */
    this.lerret.addEventListener('click', e => this.klikk(e));
    this.lerret.style.cursor = 'ns-resize';
    return this;
  },

  /** Punktene i snittet, med terreng, fjell og ferdig nivå. */
  snitt() {
    const app = this.app;
    if (!app || !app.erTomt() || !app.terreng) return null;
    const t = app.P.tomt;
    const p = app.tomtIUtm(t);
    if (p.length < 3) return null;

    const senter = Tomtmasser.tyngdepunktAv(p);
    const rad = ((t.nivaa.fallretning || 0)) * Math.PI / 180;
    // enhetsvektor langs fallretningen; nord er (0,1), øst er (1,0)
    const ex = Math.sin(rad), ey = Math.cos(rad);

    /* Hvor langt snittet rekker: til det er godt utenfor bade tomta og
       skraningene, sa man ser hvor de treffer terrenget. */
    let rekke = 0;
    for (const q of p) rekke = Math.max(rekke, Math.hypot(q.x - senter.x, q.y - senter.y));
    rekke += Math.min(40, app.P.mal.maksSokebredde || 45);

    const fjell = new Fjellmodell(app.P.fjell);
    const nivaa = app.tomtenivaaIUtm(t);
    const mal = app.P.mal;
    const ob = (mal.slitelagTykkelse || 0) + (mal.baerelagTykkelse || 0)
      + (mal.forsterkningslag || 0) + (mal.frostsikring || 0) + (mal.avrettingslag || 0);

    const punkt = [];
    const steg = Math.max(0.5, (2 * rekke) / 400);
    for (let d = -rekke; d <= rekke; d += steg) {
      const x = senter.x + ex * d, y = senter.y + ey * d;
      const zT = app.terreng.z(x, y);
      const inne = Tomtmasser.innenforPolygon(p, x, y);
      let zF = null;
      if (Number.isFinite(zT)) {
        const dyp = fjell.dybde(x, y);
        zF = zT - (Number.isFinite(dyp) ? dyp : 0.5);
      }
      let zN = null;
      if (inne) {
        const v = Tomtmasser.nivaaVed(nivaa, x, y, senter);
        if (Number.isFinite(v)) zN = v;
      }
      punkt.push({ d, zT: Number.isFinite(zT) ? zT : null, zF, zN, inne });
    }
    return { punkt, ob, retning: t.nivaa.fallretning || 0 };
  },

  tegn() {
    const c = this.lerret;
    if (!c || !this.app) return;
    const dpr = window.devicePixelRatio || 1;
    const b = c.clientWidth, h = c.clientHeight;
    if (b < 20 || h < 20) return;
    c.width = Math.round(b * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, b, h);

    const s = this.snitt();
    if (!s || !s.punkt.some(q => q.zT != null)) {
      g.fillStyle = Farger.blekkSvak;
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(this.app.erTomt() && this.app.P.tomt.punkter.length < 3
        ? 'Tegn tomta i kartet, så kommer snittet her'
        : 'Venter på terrengdata…', b / 2, h / 2);
      return;
    }

    const marg = { v: 52, h: 12, o: 14, u: 26 };
    const bredde = b - marg.v - marg.h, hoyde = h - marg.o - marg.u;
    let minZ = Infinity, maksZ = -Infinity;
    for (const q of s.punkt) {
      for (const v of [q.zT, q.zF, q.zN]) if (v != null) { minZ = Math.min(minZ, v); maksZ = Math.max(maksZ, v); }
    }
    if (!(maksZ > minZ)) { maksZ = minZ + 1; }
    const spenn = maksZ - minZ;
    minZ -= spenn * 0.08; maksZ += spenn * 0.08;
    const d0 = s.punkt[0].d, d1 = s.punkt[s.punkt.length - 1].d;
    const X = d => marg.v + (d - d0) / (d1 - d0) * bredde;
    const Y = z => marg.o + (maksZ - z) / (maksZ - minZ) * hoyde;

    // rutenett og kotetall
    g.strokeStyle = Farger.rutenett;
    g.fillStyle = Farger.blekkSvak;
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right';
    const trinn = this._trinn(maksZ - minZ);
    for (let z = Math.ceil(minZ / trinn) * trinn; z <= maksZ; z += trinn) {
      const y = Y(z);
      g.globalAlpha = 0.35; g.beginPath(); g.moveTo(marg.v, y); g.lineTo(b - marg.h, y); g.stroke();
      g.globalAlpha = 1; g.fillText(z.toFixed(trinn < 1 ? 1 : 0), marg.v - 5, y + 3);
    }

    /* Skjæring og fylling farges - det er dem øyet skal finne. Skjæring der
       terrenget ligger over det ferdige nivaet, fylling der det ligger under. */
    const bane = (velg, farge) => {
      g.fillStyle = farge; g.globalAlpha = 0.5;
      let i = 0;
      while (i < s.punkt.length) {
        while (i < s.punkt.length && !velg(s.punkt[i])) i++;
        const start = i;
        while (i < s.punkt.length && velg(s.punkt[i])) i++;
        if (i - start < 2) continue;
        g.beginPath();
        for (let k = start; k < i; k++) g.lineTo(X(s.punkt[k].d), Y(s.punkt[k].zT));
        for (let k = i - 1; k >= start; k--) g.lineTo(X(s.punkt[k].d), Y(s.punkt[k].zN - s.ob));
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    };
    const gyldig = q => q.zT != null && q.zN != null;
    bane(q => gyldig(q) && q.zT > q.zN - s.ob, Farger.skjaeringFlate);
    bane(q => gyldig(q) && q.zT < q.zN - s.ob, Farger.fyllingFlate);

    const strek = (velg, farge, tykk, stiplet) => {
      g.strokeStyle = farge; g.lineWidth = tykk;
      g.setLineDash(stiplet ? [4, 4] : []);
      g.beginPath();
      let nede = true;
      for (const q of s.punkt) {
        const v = velg(q);
        if (v == null) { nede = true; continue; }
        const x = X(q.d), y = Y(v);
        if (nede) { g.moveTo(x, y); nede = false; } else g.lineTo(x, y);
      }
      g.stroke(); g.setLineDash([]);
    };
    strek(q => q.zF, Farger.fjell, 1.2, true);          // fjelloverflaten
    strek(q => q.zT, Farger.terreng, 1.6, false);        // terrenget
    strek(q => (q.zN == null ? null : q.zN - s.ob), Farger.planum, 1.2, true);
    strek(q => q.zN, Farger.veg, 2.4, false);         // ferdig nivå

    // tegnforklaring
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'left';
    let x = marg.v;
    for (const [navn, farge] of [['Ferdig nivå', Farger.veg],
      ['Planum', Farger.planum], ['Terreng', Farger.terreng],
      ['Fjell', Farger.fjell]]) {
      g.fillStyle = farge; g.fillRect(x, h - 14, 10, 3);
      g.fillStyle = Farger.blekkSvak;
      g.fillText(navn, x + 14, h - 10);
      x += g.measureText(navn).width + 34;
    }
    g.textAlign = 'right';
    g.fillText(`Snitt gjennom tyngdepunktet · retning ${Math.round(s.retning)}°`, b - marg.h, h - 10);
  },

  /** Pen avstand mellom kotelinjene. */
  _trinn(spenn) {
    for (const t of [0.5, 1, 2, 5, 10, 20, 50]) if (spenn / t <= 8) return t;
    return 100;
  },

  /** Klikk i snittet setter det ferdige nivået der man peker. */
  klikk(e) {
    const app = this.app;
    if (!app || !app.erTomt()) return;
    const s = this.snitt();
    if (!s) return;
    const c = this.lerret;
    const b = c.clientWidth, h = c.clientHeight;
    const marg = { v: 52, h: 12, o: 14, u: 26 };
    let minZ = Infinity, maksZ = -Infinity;
    for (const q of s.punkt) {
      for (const v of [q.zT, q.zF, q.zN]) if (v != null) { minZ = Math.min(minZ, v); maksZ = Math.max(maksZ, v); }
    }
    if (!(maksZ > minZ)) return;
    const spenn = maksZ - minZ;
    minZ -= spenn * 0.08; maksZ += spenn * 0.08;
    const r = c.getBoundingClientRect();
    const y = e.clientY - r.top;
    const z = maksZ - (y - marg.o) / (h - marg.o - marg.u) * (maksZ - minZ);
    if (!Number.isFinite(z)) return;
    app.merk('satte ferdig nivå i snittet');
    app.P.tomt.nivaa.kote = +z.toFixed(2);
    app.tomtTilSkjema();
    app.beregnTomt();
  }
};

if (typeof module !== 'undefined') module.exports = Tomteprofil;
