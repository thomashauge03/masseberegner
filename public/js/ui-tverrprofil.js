'use strict';
/** Tverrprofilet: terreng, fjell, planum, grøft, skråninger og vegkropp. */

const Tverrprofil = {
  app: null, lerret: null, ctx: null, profil: null,
  marg: { v: 42, h: 12, o: 10, u: 24 },

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tverrprofil');
    this.ctx = this.lerret.getContext('2d');
    const skyver = document.getElementById('tverrSkyver');
    skyver.oninput = () => {
      const res = app.resultat;
      if (!res) return;
      const i = Math.round(skyver.value / 100 * (res.profiler.length - 1));
      app.settTverrStasjon(res.profiler[i].s);
    };
    document.getElementById('tverrForrige').onclick = () => this.flytt(-1);
    document.getElementById('tverrNeste').onclick = () => this.flytt(1);
    new ResizeObserver(() => this.tegn()).observe(this.lerret);
    return this;
  },

  flytt(retning) {
    const res = this.app.resultat;
    if (!res) return;
    let i = res.profiler.findIndex(p => Math.abs(p.s - this.app.tverrStasjon) < 1e-6);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(res.profiler.length - 1, i + retning));
    this.app.settTverrStasjon(res.profiler[i].s);
  },

  vis(profil) {
    this.profil = profil;
    const res = this.app.resultat;
    if (res && profil) {
      const i = res.profiler.indexOf(profil);
      if (i >= 0) document.getElementById('tverrSkyver').value = Math.round(i / Math.max(1, res.profiler.length - 1) * 100);
      const a = profil.areal;
      document.getElementById('tverrEtikett').innerHTML =
        `Profil <b>${profil.s.toFixed(1)}</b> · veg ${profil.vegnivaa.toFixed(2)} · terr ${isFinite(profil.terrengSenter) ? profil.terrengSenter.toFixed(2) : '–'} · `
        + `<span class="merke-skjaering">skjær ${a.skjaering.toFixed(1)} m²</span> `
        + `(<span class="merke-fjell">fjell ${a.skjaeringFjell.toFixed(1)}</span>) · `
        + `<span class="merke-fylling">fyll ${a.fylling.toFixed(1)} m²</span>`
        + (isFinite(profil.radius) ? ` · R=${profil.radius.toFixed(0)} m` : '');
    }
    this.tegn();
  },

  tegn() {
    const l = this.lerret, c = this.ctx;
    if (!l.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    if (l.width !== l.clientWidth * dpr || l.height !== l.clientHeight * dpr) {
      l.width = l.clientWidth * dpr; l.height = l.clientHeight * dpr;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = l.clientWidth, H = l.clientHeight, m = this.marg;
    c.clearRect(0, 0, B, H);
    c.fillStyle = '#12161c'; c.fillRect(0, 0, B, H);

    const pr = this.profil;
    if (!pr) {
      c.fillStyle = '#97a5b6'; c.font = '13px system-ui'; c.textAlign = 'center';
      c.fillText('Velg et profilnummer for å se tverrsnittet.', B / 2, H / 2);
      return;
    }

    // omrade
    let zMin = Infinity, zMax = -Infinity;
    for (const liste of [pr.geometri.terreng, pr.geometri.jord, pr.geometri.veg]) {
      for (const [, z] of liste) if (isFinite(z)) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    }
    if (!isFinite(zMin)) { zMin = pr.vegnivaa - 2; zMax = pr.vegnivaa + 2; }
    const tMin = pr.fotVenstre - 1.5, tMax = pr.fotHoyre + 1.5;
    const zSlakk = Math.max(0.35, (zMax - zMin) * 0.10);
    zMin -= zSlakk; zMax += zSlakk;

    // lik malestokk i begge retninger, tilpasset lerretet
    const bruksB = B - m.v - m.h, bruksH = H - m.o - m.u;
    const skala = Math.min(bruksB / (tMax - tMin), bruksH / (zMax - zMin));
    const midtT = (tMin + tMax) / 2, midtZ = (zMin + zMax) / 2;
    const px = t => m.v + bruksB / 2 + (t - midtT) * skala;
    const py = z => m.o + bruksH / 2 - (z - midtZ) * skala;

    // rutenett
    c.strokeStyle = '#232c38'; c.lineWidth = 1; c.fillStyle = '#6d7d90'; c.font = '10px system-ui';
    const zSteg = velgSteg(zMax - zMin, 5);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let z = Math.ceil(zMin / zSteg) * zSteg; z <= zMax; z += zSteg) {
      c.beginPath(); c.moveTo(m.v, py(z)); c.lineTo(B - m.h, py(z)); c.stroke();
      c.fillText(z.toFixed(1), m.v - 4, py(z));
    }
    const tSteg = velgSteg(tMax - tMin, 8);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = Math.ceil(tMin / tSteg) * tSteg; t <= tMax; t += tSteg) {
      c.beginPath(); c.moveTo(px(t), m.o); c.lineTo(px(t), H - m.u); c.stroke();
      c.fillText(t.toFixed(0), px(t), H - m.u + 3);
    }
    c.strokeStyle = '#3c4756';
    c.beginPath(); c.moveTo(px(0), m.o); c.lineTo(px(0), H - m.u); c.stroke();

    const bane = (punkter, lukk) => {
      c.beginPath();
      punkter.forEach(([t, z], i) => { const X = px(t), Y = py(z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      if (lukk) c.closePath();
    };

    /* Flaten mellom terrenget og jordarbeidsflaten deles i to:
       ligger jordarbeidsflaten under terrenget skal det graves (skjæring),
       ligger den over skal det fylles. */
    const terr = pr.geometri.terreng, jord = pr.geometri.jord, fjellL = pr.geometri.fjell;
    c.save();
    bane(terr.concat(jord.slice().reverse()), true);
    c.clip();
    c.fillStyle = 'rgba(232,151,58,.34)';   // skjæring: under terrengoverflaten
    bane(terr.concat([[terr[terr.length - 1][0], zMin], [terr[0][0], zMin]]), true); c.fill();
    c.fillStyle = 'rgba(79,180,119,.34)';   // fylling: over terrengoverflaten
    bane(terr.concat([[terr[terr.length - 1][0], zMax], [terr[0][0], zMax]]), true); c.fill();
    c.restore();

    // fjellandel av skjæringen
    c.save();
    bane(terr.concat(jord.slice().reverse()), true); c.clip();
    bane(fjellL.concat([[fjellL[fjellL.length - 1][0], zMin], [fjellL[0][0], zMin]]), true);
    c.fillStyle = 'rgba(176,107,214,.30)'; c.fill();
    c.restore();

    // fjelloverflate
    c.strokeStyle = 'rgba(176,107,214,.85)'; c.lineWidth = 1.2; c.setLineDash([5, 4]);
    bane(fjellL); c.stroke();

    // terreng etter rensk - grensen masseberegningen regnes fra
    if (pr.geometri.rensk && pr.geometri.rensk.length > 1) {
      c.strokeStyle = 'rgba(195,204,216,.55)'; c.lineWidth = 1; c.setLineDash([2, 3]);
      bane(pr.geometri.rensk); c.stroke();
    }
    c.setLineDash([]);

    // jordarbeidsflate (planum, grøft, skraninger)
    c.strokeStyle = '#ffd08a'; c.lineWidth = 1.8; bane(jord); c.stroke();

    // vegkropp: baerelag og slitelag
    const hb = pr.halvbredde, mal = this.app.resultat ? this.app.resultat.mal : StandardMal;
    const veg = pr.geometri.veg;
    if (veg.length > 1) {
      const planum = veg.map(([t, z]) => [t, z - mal.slitelagTykkelse - mal.baerelagTykkelse]);
      c.fillStyle = 'rgba(120,132,148,.75)';
      bane(veg.map(([t, z]) => [t, z - mal.slitelagTykkelse]).concat(planum.slice().reverse()), true); c.fill();
      c.fillStyle = 'rgba(60,68,80,.95)';
      bane(veg.concat(veg.map(([t, z]) => [t, z - mal.slitelagTykkelse]).reverse()), true); c.fill();
      c.strokeStyle = '#e6ecf3'; c.lineWidth = 1.6; bane(veg); c.stroke();
    }

    // terrenglinje
    c.strokeStyle = '#c3ccd8'; c.lineWidth = 1.7; bane(terr); c.stroke();

    // malsetting
    c.fillStyle = '#8fa3ba'; c.font = '10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(`${(mal.vegbredde + pr.utvidelse).toFixed(2)} m`, px(0), py(pr.vegnivaa) - 5);
    c.strokeStyle = '#8fa3ba'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px(-hb), py(pr.vegnivaa) - 3); c.lineTo(px(hb), py(pr.vegnivaa) - 3); c.stroke();

    // tegnforklaring
    const forklaring = [
      ['Terreng', '#c3ccd8'], ['Etter rensk', 'rgba(195,204,216,.55)'], ['Planum/skråning', '#ffd08a'],
      ['Skjæring', 'rgba(232,151,58,.7)'], ['Fylling', 'rgba(79,180,119,.7)'], ['Fjell', 'rgba(176,107,214,.8)']
    ];
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '10px system-ui';
    let fx = m.v + 4;
    for (const [navn, farge] of forklaring) {
      c.fillStyle = farge; c.fillRect(fx, m.o + 4, 9, 9);
      c.fillStyle = '#8fa3ba'; c.fillText(navn, fx + 13, m.o + 9);
      fx += 16 + c.measureText(navn).width + 8;
    }

    if (pr.advarsel) {
      c.fillStyle = '#e2544a'; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText('⚠ ' + pr.advarsel, B - m.h, m.o + 4);
    }
  }
};
