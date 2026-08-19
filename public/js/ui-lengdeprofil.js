'use strict';
/** Lengdeprofilen: terreng, prosjektert veglinje og knekkpunkt man kan dra i. */

const Lengdeprofil = {
  app: null, lerret: null, ctx: null,
  marg: { v: 52, h: 14, o: 12, u: 30 },
  dragIndeks: -1,
  peker: null,

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('lengdeprofil');
    this.ctx = this.lerret.getContext('2d');
    const l = this.lerret;

    l.addEventListener('mousedown', e => {
      const { s, z } = this.fraSkjerm(e);
      const i = this.finnVip(e);
      if (i >= 0) { this.dragIndeks = i; return; }
      this.app.settTverrStasjon(s);
      void z;
    });
    window.addEventListener('mousemove', e => {
      if (this.dragIndeks >= 0) {
        const { z } = this.fraSkjerm(e);
        this.app.P.vip[this.dragIndeks].z = z;
        this.app.profilEndret(true);
      }
    });
    window.addEventListener('mouseup', () => {
      if (this.dragIndeks >= 0) { this.dragIndeks = -1; this.app.profilEndret(false); }
    });
    l.addEventListener('mousemove', e => {
      this.peker = this.fraSkjerm(e);
      l.style.cursor = this.finnVip(e) >= 0 ? 'ns-resize' : 'crosshair';
      this.tegn();
    });
    l.addEventListener('mouseleave', () => { this.peker = null; this.tegn(); });
    l.addEventListener('dblclick', e => {
      const i = this.finnVip(e);
      const V = this.app.P.vip;
      if (i > 0 && i < V.length - 1) V.splice(i, 1);
      else {
        const { s, z } = this.fraSkjerm(e);
        V.push({ s, z, k: parseFloat(document.getElementById('kVerdi').value) || 1 });
        V.sort((a, b) => a.s - b.s);
      }
      this.app.profilEndret(false);
    });
    new ResizeObserver(() => this.tegn()).observe(l);
    return this;
  },

  omrade() {
    const app = this.app;
    const L = app.linje ? app.linje.lengde : 100;
    let zMin = Infinity, zMax = -Infinity;
    const tp = app.terrengProfil;
    if (tp) for (const z of tp.z) if (isFinite(z)) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    for (const v of app.P.vip) { zMin = Math.min(zMin, v.z); zMax = Math.max(zMax, v.z); }
    if (!isFinite(zMin)) { zMin = 0; zMax = 10; }
    const slakk = Math.max(2, (zMax - zMin) * 0.14);
    return { sMin: 0, sMax: Math.max(1, L), zMin: zMin - slakk, zMax: zMax + slakk };
  },

  tilSkjerm(s, z) {
    const o = this.omrade(), m = this.marg;
    const B = this.lerret.clientWidth, H = this.lerret.clientHeight;
    return {
      x: m.v + (s - o.sMin) / (o.sMax - o.sMin) * (B - m.v - m.h),
      y: H - m.u - (z - o.zMin) / (o.zMax - o.zMin) * (H - m.o - m.u)
    };
  },

  fraSkjerm(e) {
    const r = this.lerret.getBoundingClientRect();
    const o = this.omrade(), m = this.marg;
    const B = this.lerret.clientWidth, H = this.lerret.clientHeight;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    return {
      s: Math.max(o.sMin, Math.min(o.sMax, o.sMin + (px - m.v) / (B - m.v - m.h) * (o.sMax - o.sMin))),
      z: o.zMin + (H - m.u - py) / (H - m.o - m.u) * (o.zMax - o.zMin)
    };
  },

  finnVip(e) {
    const r = this.lerret.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = -1, bestD = 11;
    this.app.P.vip.forEach((v, i) => {
      const p = this.tilSkjerm(v.s, v.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  },

  tegn() {
    const app = this.app, l = this.lerret, c = this.ctx;
    if (!l.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    if (l.width !== l.clientWidth * dpr || l.height !== l.clientHeight * dpr) {
      l.width = l.clientWidth * dpr; l.height = l.clientHeight * dpr;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = l.clientWidth, H = l.clientHeight, m = this.marg;
    c.clearRect(0, 0, B, H);
    c.fillStyle = '#12161c'; c.fillRect(0, 0, B, H);

    const o = this.omrade();
    if (!app.linje || app.linje.lengde <= 0) {
      c.fillStyle = '#97a5b6'; c.font = '13px system-ui'; c.textAlign = 'center';
      c.fillText('Tegn en senterlinje i kartet – så kommer lengdeprofilen her.', B / 2, H / 2);
      return;
    }

    /* --- rutenett --- */
    c.strokeStyle = '#232c38'; c.fillStyle = '#6d7d90'; c.font = '10px system-ui'; c.lineWidth = 1;
    const zSteg = velgSteg(o.zMax - o.zMin, 6);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let z = Math.ceil(o.zMin / zSteg) * zSteg; z <= o.zMax; z += zSteg) {
      const p = this.tilSkjerm(0, z);
      c.beginPath(); c.moveTo(m.v, p.y); c.lineTo(B - m.h, p.y); c.stroke();
      c.fillText(z.toFixed(0), m.v - 5, p.y);
    }
    const sSteg = velgSteg(o.sMax - o.sMin, 10);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let s = 0; s <= o.sMax + 1e-6; s += sSteg) {
      const p = this.tilSkjerm(s, o.zMin);
      c.beginPath(); c.moveTo(p.x, m.o); c.lineTo(p.x, H - m.u); c.stroke();
      c.fillText(s.toFixed(0), p.x, H - m.u + 4);
    }

    const tp = app.terrengProfil;
    const prosjektert = s => app.vprofil ? app.vprofil.hoyde(s) : 0;

    /* --- skjæring / fylling som flater --- */
    if (tp && app.vprofil) {
      const lag = (positiv, farge) => {
        c.fillStyle = farge; c.beginPath(); let start = false;
        for (let i = 0; i < tp.s.length; i++) {
          const zt = tp.z[i], zv = prosjektert(tp.s[i]);
          const d = positiv ? zt - zv : zv - zt;
          const a = this.tilSkjerm(tp.s[i], positiv ? Math.max(zt, zv) : Math.min(zt, zv));
          void d;
          if (!start) { c.moveTo(a.x, a.y); start = true; } else c.lineTo(a.x, a.y);
        }
        for (let i = tp.s.length - 1; i >= 0; i--) {
          const zt = tp.z[i], zv = prosjektert(tp.s[i]);
          const b = this.tilSkjerm(tp.s[i], positiv ? Math.min(zt, zv) : Math.max(zt, zv));
          c.lineTo(b.x, b.y);
        }
        c.closePath(); c.fill();
      };
      // Skjæring der terrenget ligger over vegen, fylling under
      c.save();
      c.beginPath();
      for (let i = 0; i < tp.s.length; i++) {
        const p = this.tilSkjerm(tp.s[i], tp.z[i]);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      for (let i = tp.s.length - 1; i >= 0; i--) {
        const p = this.tilSkjerm(tp.s[i], prosjektert(tp.s[i]));
        c.lineTo(p.x, p.y);
      }
      c.closePath();
      c.clip();
      // over veglinjen = skjæring
      c.fillStyle = 'rgba(232,151,58,.30)';
      c.beginPath();
      for (let i = 0; i < tp.s.length; i++) { const p = this.tilSkjerm(tp.s[i], prosjektert(tp.s[i])); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
      c.lineTo(this.tilSkjerm(o.sMax, o.zMax).x, this.tilSkjerm(o.sMax, o.zMax).y);
      c.lineTo(this.tilSkjerm(0, o.zMax).x, this.tilSkjerm(0, o.zMax).y);
      c.closePath(); c.fill();
      // under veglinjen = fylling
      c.fillStyle = 'rgba(79,180,119,.32)';
      c.beginPath();
      for (let i = 0; i < tp.s.length; i++) { const p = this.tilSkjerm(tp.s[i], prosjektert(tp.s[i])); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
      c.lineTo(this.tilSkjerm(o.sMax, o.zMin).x, this.tilSkjerm(o.sMax, o.zMin).y);
      c.lineTo(this.tilSkjerm(0, o.zMin).x, this.tilSkjerm(0, o.zMin).y);
      c.closePath(); c.fill();
      c.restore();
      void lag;
    }

    /* --- fjelloverflate --- */
    if (tp && app.fjellmodell) {
      c.strokeStyle = 'rgba(176,107,214,.75)'; c.lineWidth = 1; c.setLineDash([5, 4]);
      c.beginPath();
      for (let i = 0; i < tp.s.length; i++) {
        const pkt = app.linje.punktVed(tp.s[i]);
        const d = app.fjellmodell.dybde(pkt.x, pkt.y, tp.s[i]);
        const p = this.tilSkjerm(tp.s[i], tp.z[i] - d);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      c.stroke(); c.setLineDash([]);
    }

    /* --- terrenglinje --- */
    if (tp) {
      c.strokeStyle = '#c3ccd8'; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < tp.s.length; i++) {
        const p = this.tilSkjerm(tp.s[i], tp.z[i]);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      c.stroke();
    }

    /* --- prosjektert veglinje --- */
    if (app.vprofil && app.P.vip.length > 1) {
      c.strokeStyle = '#4ea3ff'; c.lineWidth = 2.2; c.beginPath();
      const n = 400;
      for (let i = 0; i <= n; i++) {
        const s = o.sMin + (o.sMax - o.sMin) * i / n;
        const p = this.tilSkjerm(s, app.vprofil.hoyde(s));
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
      c.stroke();

      // stigning i prosent pa hvert rettstrekk
      c.fillStyle = '#9fc8ee'; c.font = '10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'bottom';
      for (let i = 0; i < app.P.vip.length - 1; i++) {
        const a = app.P.vip[i], b = app.P.vip[i + 1];
        const dl = b.s - a.s;
        if (dl < 12) continue;
        const g = (b.z - a.z) / dl * 100;
        const midt = this.tilSkjerm((a.s + b.s) / 2, (a.z + b.z) / 2);
        c.fillText(g.toFixed(1) + ' %', midt.x, midt.y - 4);
      }

      // vertikalkurver - merket med korte streker nede ved aksen
      c.strokeStyle = 'rgba(78,163,255,.6)'; c.lineWidth = 1;
      for (const k of app.vprofil.kurver) {
        for (const s of [k.sBVC, k.sEVC]) {
          const p = this.tilSkjerm(s, 0);
          c.beginPath(); c.moveTo(p.x, H - m.u); c.lineTo(p.x, H - m.u - 9); c.stroke();
        }
        const a = this.tilSkjerm(k.sBVC, 0), b = this.tilSkjerm(k.sEVC, 0);
        c.beginPath(); c.moveTo(a.x, H - m.u - 5); c.lineTo(b.x, H - m.u - 5); c.stroke();
      }

      // knekkpunkt
      app.P.vip.forEach((v, i) => {
        const p = this.tilSkjerm(v.s, v.z);
        c.fillStyle = i === this.dragIndeks ? '#fff' : '#4ea3ff';
        c.strokeStyle = '#0b1017'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, 4.5, 0, 7); c.fill(); c.stroke();
      });
    }

    /* --- valgt tverrprofil --- */
    if (app.tverrStasjon != null) {
      const p = this.tilSkjerm(app.tverrStasjon, 0);
      c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(p.x, m.o); c.lineTo(p.x, H - m.u); c.stroke(); c.setLineDash([]);
    }

    /* --- avlesing under pekeren --- */
    if (this.peker && tp) {
      const s = this.peker.s;
      const zt = interp(tp.s, tp.z, s);
      const zv = prosjektert(s);
      const p = this.tilSkjerm(s, zt);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill();
      c.fillStyle = 'rgba(18,22,28,.92)'; c.strokeStyle = '#303a48';
      const tekst = `prof ${s.toFixed(1)}   terr ${zt.toFixed(2)}   veg ${zv.toFixed(2)}   ${(zt - zv) >= 0 ? 'skjæring' : 'fylling'} ${Math.abs(zt - zv).toFixed(2)} m`;
      c.font = '11px system-ui'; c.textAlign = 'left'; c.textBaseline = 'top';
      const bredde = c.measureText(tekst).width + 12;
      const bx = Math.min(B - bredde - 4, Math.max(m.v, p.x + 8));
      c.fillRect(bx, m.o + 2, bredde, 18); c.strokeRect(bx, m.o + 2, bredde, 18);
      c.fillStyle = '#e6ecf3'; c.fillText(tekst, bx + 6, m.o + 6);
    }
  }
};

function velgSteg(spenn, ønsketAntall) {
  const ra = spenn / Math.max(1, ønsketAntall);
  const p = Math.pow(10, Math.floor(Math.log10(ra)));
  for (const f of [1, 2, 2.5, 5, 10]) if (ra <= p * f) return p * f;
  return p * 10;
}

function interp(xs, ys, x) {
  if (!xs.length) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m; else hi = m; }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}
