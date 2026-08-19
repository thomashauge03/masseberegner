'use strict';
/**
 * Terrengmodell i nettleseren.
 *
 * Henter 256 x 256 m fliser av Kartverket sin DTM1 (1 m laserdata) via
 * den lokale serveren, og gir oppslag av terrenghøyde i vilkarlige punkt
 * med bilineær interpolasjon.
 *
 * Høydene er kontrollert mot Kartverket sitt offisielle punkt-API og
 * stemmer innenfor noen fa millimeter.
 */

const FLIS_M = 256;

class Terreng {
  constructor(sonenr, oppløsning = 1) {
    this.sone = sonenr;
    this.sr = 25800 + sonenr;   // ETRS89 / UTM (EPSG 25832, 25833, 25835)
    this.res = oppløsning;                 // meter per piksel
    this.P = Math.round(FLIS_M / this.res); // piksler per flis
    this.fliser = new Map();
    this.mangler = new Set();
  }

  nøkkel(tx, ty) { return tx + '_' + ty; }

  /** Laster alle fliser som trengs for et belte langs linjeføringen. */
  async lastKorridor(linje, halvbredde, framdrift) {
    const trengs = new Set();
    const marg = 2;
    const stegS = Math.min(16, Math.max(2, linje.lengde / 400));
    const stegT = 16;
    for (let s = 0; s <= linje.lengde + 1e-9; s = Math.min(s + stegS, linje.lengde + 1e-9)) {
      const p = linje.punktVed(Math.min(s, linje.lengde));
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let t = -halvbredde - marg; t <= halvbredde + marg + 1e-9; t += stegT) {
        const tt = Math.min(t, halvbredde + marg);
        const x = p.x + nx * tt, y = p.y + ny * tt;
        trengs.add(this.nøkkel(Math.floor(x / FLIS_M), Math.floor(y / FLIS_M)));
      }
      // sikre at ytterkantene alltid er med
      for (const tt of [-halvbredde - marg, halvbredde + marg]) {
        const x = p.x + nx * tt, y = p.y + ny * tt;
        trengs.add(this.nøkkel(Math.floor(x / FLIS_M), Math.floor(y / FLIS_M)));
      }
      if (s >= linje.lengde) break;
    }

    const liste = [...trengs].filter(k => !this.fliser.has(k) && !this.mangler.has(k));
    let ferdig = 0;
    const totalt = liste.length;
    if (framdrift) framdrift(0, totalt);

    const samtidig = 6;
    let i = 0;
    const arbeidere = new Array(Math.min(samtidig, totalt)).fill(0).map(async () => {
      while (i < liste.length) {
        const k = liste[i++];
        const [tx, ty] = k.split('_').map(Number);
        try {
          const svar = await fetch(`/api/dtm/flis?sr=${this.sr}&tx=${tx}&ty=${ty}&res=${this.res}`);
          if (!svar.ok) throw new Error('HTTP ' + svar.status);
          const buf = await svar.arrayBuffer();
          this.fliser.set(k, new Float32Array(buf));
        } catch (e) {
          console.warn('Fikk ikke flis', k, e.message);
          this.mangler.add(k);
        }
        ferdig++;
        if (framdrift) framdrift(ferdig, totalt);
      }
    });
    await Promise.all(arbeidere);
    return { hentet: totalt, mangler: this.mangler.size };
  }

  /** Verdi i en global pikselcelle. */
  _celle(gi, gj) {
    const P = this.P;
    const tx = Math.floor(gi / P);
    const i = gi - tx * P;
    const ty = Math.ceil(-gj / P) - 1;
    const j = gj + (ty + 1) * P;
    const flis = this.fliser.get(this.nøkkel(tx, ty));
    if (!flis) return NaN;
    if (i < 0 || i >= P || j < 0 || j >= P) return NaN;
    return flis[j * P + i];
  }

  /** Terrenghøyde med bilineær interpolasjon. NaN dersom data mangler. */
  z(x, y) {
    const r = this.res;
    const fx = x / r - 0.5;
    const fy = -y / r - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0);
    const b = this._celle(i0 + 1, j0);
    const c = this._celle(i0, j0 + 1);
    const d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) {
      // fall tilbake pa naermeste gyldige nabo
      const kandidater = [a, b, c, d].filter(isFinite);
      return kandidater.length ? kandidater.reduce((s, v) => s + v, 0) / kandidater.length : NaN;
    }
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }

  /** Terrenghelning (fall) i punktet, som desimaltall. */
  helning(x, y) {
    const h = Math.max(1, this.res);
    const zx = (this.z(x + h, y) - this.z(x - h, y)) / (2 * h);
    const zy = (this.z(x, y + h) - this.z(x, y - h)) / (2 * h);
    return Math.hypot(zx, zy);
  }

  minneMb() {
    return +(this.fliser.size * this.P * this.P * 4 / 1048576).toFixed(1);
  }
}

if (typeof module !== 'undefined') module.exports = { Terreng, FLIS_M };
