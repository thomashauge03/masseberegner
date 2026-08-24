'use strict';
/* Et vegkorridor-gitter i nøyaktig samme form som Tomt3d._gitter gir:
   nb x nh noder, wx/wy i UTM, Float32Array per flate, Uint8Array finnes.
   Den ene aksen er stasjon, den andre avstand ut fra senterlinja.

   Ingen høyde regnes her. Alt hentes fra det masser.js allerede har lagt i
   profilets `geometri`, ved lineær avlesning mellom punktene den regnet. */

/** Avlesning i en [t, z]-liste. Returnerer NaN utenfor og i hull. */
function les(liste, t) {
  if (!liste || liste.length === 0) return NaN;
  if (t < liste[0][0] - 1e-9 || t > liste[liste.length - 1][0] + 1e-9) return NaN;
  let lo = 0, hi = liste.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) lo = m; else hi = m; }
  const a = liste[lo], b = liste[hi];
  const dt = b[0] - a[0];
  /* Et sprang i t betyr at masser.js hoppet over et hull i laserdekningen.
     Å strekke en rett linje over hullet ville dikte opp terreng. */
  if (dt > 1.0 + 1e-9) return NaN;
  if (dt < 1e-12) return a[1];
  return a[1] + (t - a[0]) * (b[1] - a[1]) / dt;
}

/**
 * @param {object} o
 *   profiler  liste av profil (må ha .geometri)
 *   linje     Linjeforing
 *   nt        antall tverrnoder per stasjon
 */
function byggGitter(o) {
  const pr = o.profiler, linje = o.linje, nt = o.nt;
  const nb = nt, nh = pr.length;                  // nb = tvers, nh = langs
  const n = nb * nh;
  const wx = new Float32Array(n), wy = new Float32Array(n);
  const zT = new Float32Array(n), zP = new Float32Array(n), zF = new Float32Array(n);
  const zRaa = new Float32Array(n);
  const tOff = new Float32Array(n);
  const d = new Float32Array(n);
  const finnes = new Uint8Array(n);
  let lav = Infinity, hoy = -Infinity, maksAvvik = 0;

  for (let j = 0; j < nh; j++) {
    const p = pr[j], g = p.geometri;
    const tV = p.fotVenstre, tH = p.fotHoyre;
    for (let i = 0; i < nb; i++) {
      const t = tV + (tH - tV) * i / (nb - 1);
      const k = j * nb + i;
      tOff[k] = t;
      const a = les(g.rensk, t), b = les(g.jord, t);
      if (!(Number.isFinite(a) && Number.isFinite(b))) continue;
      const q = linje.punktMedAvvik(p.s, t);
      wx[k] = q.x; wy[k] = q.y;
      zT[k] = a; zP[k] = b;
      zRaa[k] = les(g.terreng, t);
      zF[k] = les(g.fjell, t);
      d[k] = a - b;
      finnes[k] = 1;
      if (a < lav) lav = a; if (b < lav) lav = b;
      if (a > hoy) hoy = a; if (b > hoy) hoy = b;
      if (Math.abs(d[k]) > maksAvvik) maksAvvik = Math.abs(d[k]);
    }
  }
  return { nb, nh, wx, wy, zT, zP, zF, zRaa, d, tOff, finnes, lav, hoy, maksAvvik, profiler: pr };
}

/**
 * Volumet regnet UT AV GITTERET, med samme endearealsformel som
 * masser.js:967-976 og samme Pappus-vekt som integrasjonen der.
 * Krumningen er hentet fra profilet - den er et tall masser.js har regnet.
 */
function volumAvGitter(g, vf) {
  const nb = g.nb, nh = g.nh;
  const A = [];
  for (let j = 0; j < nh; j++) {
    const kr = g.profiler[j].krumning;
    let sk = 0, fy = 0;
    let f = null;
    for (let i = 0; i < nb; i++) {
      const k = j * nb + i;
      if (!g.finnes[k]) { f = null; continue; }
      const na = { t: g.tOff[k], d: g.d[k], w: Math.max(0, 1 + g.tOff[k] * kr) };
      if (f) {
        const dt = na.t - f.t;
        if (f.d >= 0 && na.d >= 0) sk += (f.d * f.w + na.d * na.w) / 2 * dt;
        else if (f.d <= 0 && na.d <= 0) fy += (-f.d * f.w - na.d * na.w) / 2 * dt;
        else {
          const u = f.d / (f.d - na.d);
          const wm = f.w + (na.w - f.w) * u;
          if (f.d > 0) {
            sk += f.d * (2 * f.w + wm) / 6 * u * dt;
            fy += (-na.d) * (wm + 2 * na.w) / 6 * (1 - u) * dt;
          } else {
            fy += (-f.d) * (2 * f.w + wm) / 6 * u * dt;
            sk += na.d * (wm + 2 * na.w) / 6 * (1 - u) * dt;
          }
        }
      }
      f = na;
    }
    A.push({ s: g.profiler[j].s, skjaering: sk, fylling: fy });
  }
  const sum = { skjaering: 0, fylling: 0 };
  for (let j = 0; j < nh - 1; j++) {
    const L = A[j + 1].s - A[j].s;
    sum.skjaering += (A[j].skjaering + A[j + 1].skjaering) / 2 * L * vf;
    sum.fylling += (A[j].fylling + A[j + 1].fylling) / 2 * L * vf;
  }
  return { sum, A };
}

module.exports = { byggGitter, volumAvGitter, les };
