'use strict';
/*
 * Kjører den EKTE tegneren fra ui-tomt3d.js på et veg-gitter.
 * Ingenting er skrevet om: _raster, _kamera, _lys, _tilpassSkala er hentet
 * rett fra fila og kalt slik tegn() kaller dem.
 *
 *   node test/motbevis_veg3d_tegner.js
 */
const path = require('path');
const fs = require('fs');
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));
const { Linjeforing } = require(path.join(__dirname, '..', 'public', 'js', 'linjeforing.js'));
const { Vertikalprofil } = require(path.join(__dirname, '..', 'public', 'js', 'vertikalprofil.js'));
const Tomt3d = require(path.join(__dirname, '..', 'public', 'js', 'ui-tomt3d.js'));

/* --- Vegen ------------------------------------------------------------ */
const ip = [
  { x: 0, y: 0, r: 0 }, { x: 120, y: 0, r: 60 },
  { x: 200, y: 60, r: 15 }, { x: 200, y: 180, r: 0 }
];
const linje = new Linjeforing(ip);
const terreng = { z: (x, y) => 100 - 0.12 * x + 0.04 * y };
const fjell = new M.Fjellmodell({ standarddybde: 3.0 });
const profil = new Vertikalprofil([
  { s: 0, z: 100, k: 1 }, { s: linje.lengde / 2, z: 96, k: 1 },
  { s: linje.lengde, z: 99, k: 1 }
]);
const res = M.beregnMasser({
  linje, profil, terreng, mal: M.StandardMal, fjell, profilAvstand: 5, bakkefaktor: 1
});

/* --- Et veg-gitter på formen ui-tomt3d._gitter() leverer ---------------- */
/**
 * @param nT antall kolonner i t-retningen
 * Høydene hentes fra geometri.jord / geometri.terreng - ALT er regnet av
 * masser.js, ingenting regnes her.
 */
function vegGitter(nT) {
  const pr = res.profiler;
  const tMin = Math.min(...pr.map(p => p.fotVenstre));
  const tMax = Math.max(...pr.map(p => p.fotHoyre));
  const nb = nT, nh = pr.length, n = nb * nh;
  const wx = new Float32Array(n), wy = new Float32Array(n);
  const zT = new Float32Array(n), zP = new Float32Array(n), zF = new Float32Array(n);
  const zFerdig = new Float32Array(n), harFerdig = new Uint8Array(n);
  const d = new Float32Array(n), finnes = new Uint8Array(n);
  const inne = new Uint8Array(n), usikker = new Uint8Array(n);
  let lav = Infinity, hoy = -Infinity, maksAvvik = 0;
  const les = (liste, t) => {           // lineær avlesning i [t, z]-lista
    if (!liste || !liste.length) return NaN;
    if (t <= liste[0][0]) return NaN;
    if (t >= liste[liste.length - 1][0]) return NaN;
    for (let i = 0; i < liste.length - 1; i++) {
      if (t >= liste[i][0] && t <= liste[i + 1][0]) {
        const dt = liste[i + 1][0] - liste[i][0];
        if (dt < 1e-9) return liste[i + 1][1];
        const f = (t - liste[i][0]) / dt;
        return liste[i][1] + f * (liste[i + 1][1] - liste[i][1]);
      }
    }
    return NaN;
  };
  for (let j = 0; j < nh; j++) {
    const p = pr[j], geo = p.geometri || res.geometriFor(p.s).geometri;
    for (let i = 0; i < nb; i++) {
      const t = tMin + (tMax - tMin) * i / (nb - 1);
      const k = j * nb + i;
      const q = linje.punktMedAvvik(p.s, t);
      wx[k] = q.x; wy[k] = q.y;
      const a = les(geo.terreng, t), b = les(geo.jord, t), c = les(geo.fjell, t);
      if (!(isFinite(a) && isFinite(b))) continue;
      finnes[k] = 1; zT[k] = a; zP[k] = b; zF[k] = isFinite(c) ? c : b;
      d[k] = a - b;
      lav = Math.min(lav, a, b); hoy = Math.max(hoy, a, b);
      maksAvvik = Math.max(maksAvvik, Math.abs(d[k]));
    }
  }
  let minX = Infinity, minY = Infinity, maksX = -Infinity, maksY = -Infinity;
  for (let k = 0; k < n; k++) {
    if (!finnes[k]) continue;
    minX = Math.min(minX, wx[k]); maksX = Math.max(maksX, wx[k]);
    minY = Math.min(minY, wy[k]); maksY = Math.max(maksY, wy[k]);
  }
  return {
    nb, nh, rute: (tMax - tMin) / (nb - 1), minX, minY, maksX, maksY,
    lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
    wx, wy, zT, zP, zF, zFerdig, harFerdig, d, finnes, inne, usikker,
    totalt: n, tMin, tMax
  };
}

/* ==================================================================== *
 * 1. FYLLINGSGRADEN: hvor mye av rektangelet er hull?
 * ==================================================================== */
console.log('=== 1. Hvor mye av (stasjon x avvik)-rektangelet er hull? ===');
for (const nT of [61, 121, 241, 615]) {
  const g = vegGitter(nT);
  let har = 0;
  for (let k = 0; k < g.totalt; k++) if (g.finnes[k]) har++;
  // hele celler (alle fire hjørner), som _raster faktisk krever
  let hele = 0, mulige = (g.nb - 1) * (g.nh - 1);
  for (let j = 0; j < g.nh - 1; j++) for (let i = 0; i < g.nb - 1; i++) {
    const k00 = j * g.nb + i;
    if (g.finnes[k00] && g.finnes[k00 + 1] && g.finnes[k00 + g.nb] && g.finnes[k00 + g.nb + 1]) hele++;
  }
  console.log(`  nT=${String(nT).padStart(3)}  t-steg ${g.rute.toFixed(3)} m   noder ${g.totalt}` +
    `   med data ${(100 * har / g.totalt).toFixed(1)} %   tegnbare celler ` +
    `${(100 * hele / mulige).toFixed(1)} % (${hele} av ${mulige})`);
}

/* ==================================================================== *
 * 2. _kamera SLIK DEN STÅR: nb*rute og nh*rute som verdensutstrekning
 * ==================================================================== */
console.log('\n=== 2. _kamera(), uendret, på et veg-gitter ===');
const g = vegGitter(121);
console.log('  vegens sanne utstrekning:',
  (g.maksX - g.minX).toFixed(1), 'x', (g.maksY - g.minY).toFixed(1), 'm',
  ' diagonal', Math.hypot(g.maksX - g.minX, g.maksY - g.minY).toFixed(1), 'm');
console.log('  det _kamera regner med: nb*rute =', (g.nb * g.rute).toFixed(1),
  ' nh*rute =', (g.nh * g.rute).toFixed(1), 'm');
const sannDist = Math.max(60, Math.hypot(g.maksX - g.minX, g.maksY - g.minY) * 1.6);
const kamDist = Math.max(60, Math.hypot(g.nb * g.rute, g.nh * g.rute) * 1.6);
console.log('  kameraavstand: riktig', sannDist.toFixed(0), 'm  -  _kamera gir',
  kamDist.toFixed(0), 'm   (' + (100 * kamDist / sannDist).toFixed(0) + ' %)');
const senterKam = { x: g.minX + g.nb * g.rute / 2, y: g.minY + g.nh * g.rute / 2 };
const senterSant = { x: (g.minX + g.maksX) / 2, y: (g.minY + g.maksY) / 2 };
console.log('  dreiepunkt: _kamera setter', senterKam.x.toFixed(1), senterKam.y.toFixed(1),
  ' - midt i vegen er', senterSant.x.toFixed(1), senterSant.y.toFixed(1),
  ' bom:', Math.hypot(senterKam.x - senterSant.x, senterKam.y - senterSant.y).toFixed(1), 'm');

/* ==================================================================== *
 * 3. _lys() SLIK DEN STÅR: én skala for to helt ulike steglengder
 * ==================================================================== */
console.log('\n=== 3. _lys(), uendret, med én rute for begge retninger ===');
/* Sant gitter-steg i de to retningene, målt i verden. */
let sumT = 0, sumS = 0, nT2 = 0, nS = 0;
for (let j = 0; j < g.nh; j++) for (let i = 0; i < g.nb - 1; i++) {
  const k = j * g.nb + i;
  if (!g.finnes[k] || !g.finnes[k + 1]) continue;
  sumT += Math.hypot(g.wx[k + 1] - g.wx[k], g.wy[k + 1] - g.wy[k]); nT2++;
}
for (let j = 0; j < g.nh - 1; j++) for (let i = 0; i < g.nb; i++) {
  const k = j * g.nb + i;
  if (!g.finnes[k] || !g.finnes[k + g.nb]) continue;
  sumS += Math.hypot(g.wx[k + g.nb] - g.wx[k], g.wy[k + g.nb] - g.wy[k]); nS++;
}
const stegT = sumT / nT2, stegS = sumS / nS;
console.log('  sant steg på tvers (t):', stegT.toFixed(3), 'm    langs (s):', stegS.toFixed(3), 'm',
  '   forhold', (stegS / stegT).toFixed(1) + 'x');
/* Hva lyset blir med g.rute mot hva det blir med de sanne stegene. */
let verst = 0, sumFeil = 0, m = 0;
const lysRiktig = (z00, z10, z01, dx1, dy1) => {
  const dx = (z10 - z00) / dx1, dy = (z01 - z00) / dy1;
  const len = Math.sqrt(dx * dx + dy * dy + 1);
  const l = (-dx * -0.4 + -dy * 0.4 + 1 * 0.82) / len;
  return 0.55 + 0.45 * Math.max(0, Math.min(1, l));
};
for (let j = 0; j < g.nh - 1; j++) for (let i = 0; i < g.nb - 1; i++) {
  const k00 = j * g.nb + i, k10 = k00 + 1, k01 = k00 + g.nb;
  if (!g.finnes[k00] || !g.finnes[k10] || !g.finnes[k01]) continue;
  const a = Tomt3d._lys(g.zP[k00], g.zP[k10], g.zP[k01], g.rute);   // slik den står
  const b = lysRiktig(g.zP[k00], g.zP[k10], g.zP[k01], stegT, stegS);
  const f = Math.abs(a - b);
  verst = Math.max(verst, f); sumFeil += f; m++;
}
console.log('  lysverdi (0,55-1,00): snittavvik', (sumFeil / m).toFixed(4),
  ' verste', verst.toFixed(4), ' =', (100 * verst / 0.45).toFixed(0) + ' % av hele spennet');

/* ==================================================================== *
 * 4. RASTERISER FAKTISK, OG MÅL DET
 * ==================================================================== */
console.log('\n=== 4. _raster(), uendret, på veg-gitteret ===');
Tomt3d.yaw = 30; Tomt3d.pitch = 55; Tomt3d.overdriv = 1;
const B = 900, H = 600;

function tegnEnGang(gg, skalaFast) {
  Tomt3d.senter = { x: (gg.minX + gg.maksX) / 2, y: (gg.minY + gg.maksY) / 2 };
  const t = Tomt3d._tilpassSkala(B, H, gg);
  const kam = Tomt3d._kamera(B, H, gg, skalaFast || t.skala, t.panX, t.panY);
  const ut = new Uint32Array(B * H), dyp = new Float32Array(B * H), id = new Int32Array(B * H);
  ut.fill(0xff202020); dyp.fill(Infinity); id.fill(-1);
  const farge = (k00, k10, k01, k11, z) => {
    const dd = gg.d[k00];
    const ly = Tomt3d._lys(z[k00], z[k10], z[k01], gg.rute);
    const r = Math.min(255, (dd >= 0 ? 210 : 90) * ly) | 0;
    const gr = Math.min(255, (dd >= 0 ? 110 : 190) * ly) | 0;
    const bl = Math.min(255, 90 * ly) | 0;
    return (255 << 24) | (bl << 16) | (gr << 8) | r;
  };
  const t0 = Date.now();
  Tomt3d._raster(gg, gg.zP, farge, ut, dyp, id, B, H, kam);
  return { ms: Date.now() - t0, ut, dyp, id, kam };
}

for (const nT of [121, 241, 615]) {
  const gg = vegGitter(nT);
  const a = tegnEnGang(gg);
  let malt = 0;
  for (let i = 0; i < B * H; i++) if (a.dyp[i] < Infinity) malt++;
  console.log(`  nT=${String(nT).padStart(3)}  ${gg.nb}x${gg.nh} noder   _raster ${a.ms} ms` +
    `   ->  ${(1000 / Math.max(1, a.ms)).toFixed(0)} bilder/s   dekker ` +
    `${(100 * malt / (B * H)).toFixed(1)} % av lerretet`);
}

/* Til sammenlikning: en tomt av samme omfang. */
console.log('\n  til sammenlikning, en 60x60 m tomt med 0,5 m rutenett = 121x121 noder:');
const tomt = (() => {
  const nb = 121, nh = 121, n = nb * nh, rute = 0.5;
  const o = {
    nb, nh, rute, minX: 0, minY: 0, maksX: 60, maksY: 60, lav: 95, hoy: 105, maksAvvik: 5,
    wx: new Float32Array(n), wy: new Float32Array(n), zT: new Float32Array(n),
    zP: new Float32Array(n), zF: new Float32Array(n), d: new Float32Array(n),
    finnes: new Uint8Array(n), usikker: new Uint8Array(n), totalt: n
  };
  for (let j = 0; j < nh; j++) for (let i = 0; i < nb; i++) {
    const k = j * nb + i;
    o.wx[k] = i * rute; o.wy[k] = j * rute;
    o.zT[k] = 100 + 0.05 * i * rute; o.zP[k] = 100; o.d[k] = o.zT[k] - 100; o.finnes[k] = 1;
  }
  return o;
})();
const tt = tegnEnGang(tomt);
console.log('    _raster', tt.ms, 'ms');

/* ==================================================================== *
 * 5. FOLDEN, SETT AV RASTERISEREN
 * ==================================================================== */
console.log('\n=== 5. Hva gjør folden i den stramme svingen med bildet? ===');
const gf = vegGitter(121);
let vrengte = 0, degenererte = 0;
const kam = (() => {
  Tomt3d.senter = { x: (gf.minX + gf.maksX) / 2, y: (gf.minY + gf.maksY) / 2 };
  const t = Tomt3d._tilpassSkala(B, H, gf);
  return Tomt3d._kamera(B, H, gf, t.skala, t.panX, t.panY);
})();
for (let j = 0; j < gf.nh - 1; j++) for (let i = 0; i < gf.nb - 1; i++) {
  const k00 = j * gf.nb + i, k10 = k00 + 1, k01 = k00 + gf.nb, k11 = k01 + 1;
  if (!(gf.finnes[k00] && gf.finnes[k10] && gf.finnes[k01] && gf.finnes[k11])) continue;
  const a = kam.punkt(gf.wx[k00], gf.wy[k00], gf.zP[k00]);
  const b = kam.punkt(gf.wx[k10], gf.wy[k10], gf.zP[k10]);
  const c = kam.punkt(gf.wx[k11], gf.wy[k11], gf.zP[k11]);
  const omr = (b.px - a.px) * (c.py - a.py) - (b.py - a.py) * (c.px - a.px);
  if (Math.abs(omr) < 1e-9) degenererte++;
  // verdensomløp, uavhengig av kameraet
  const wa = (gf.wx[k10] - gf.wx[k00]) * (gf.wy[k11] - gf.wy[k00])
    - (gf.wy[k10] - gf.wy[k00]) * (gf.wx[k11] - gf.wx[k00]);
  if (wa < 0) vrengte++;
}
console.log('  tegnbare celler som er VRENGT i verden:', vrengte);
console.log('  profiler masser.js nekter å regne volum på (forbiKurvesenter):',
  res.profiler.filter(p => p.forbiKurvesenter).length);
