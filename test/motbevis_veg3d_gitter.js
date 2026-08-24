'use strict';
/*
 * Prøver å MOTBEVISE påstanden:
 *   "Vegen har allerede et regulært gitter - (stasjon x avvik) - og trenger
 *    ingen ny rasteriserer. Hele tegneren kan gjenbrukes uendret."
 *
 *   node test/motbevis_veg3d_gitter.js
 */
const path = require('path');
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));
const { Linjeforing } = require(path.join(__dirname, '..', 'public', 'js', 'linjeforing.js'));
const { Vertikalprofil } = require(path.join(__dirname, '..', 'public', 'js', 'vertikalprofil.js'));

/* --- En realistisk skogsbilveg: rettstrekk, slak sving, stram sving ------ */
const ip = [
  { x: 0, y: 0, r: 0 },
  { x: 120, y: 0, r: 60 },
  { x: 200, y: 60, r: 15 },     // stram sving, R = 15 m (minRadius er 10)
  { x: 200, y: 180, r: 0 }
];
const linje = new Linjeforing(ip);

/* Li som faller 12 % mot aust: skjæring på den ene sida, fylling på den andre. */
const terreng = { z: (x, y) => 100 - 0.12 * x + 0.04 * y };
const fjell = new M.Fjellmodell({ standarddybde: 3.0 });
const profil = new Vertikalprofil([
  { s: 0, z: 100, k: 1 },
  { s: linje.lengde / 2, z: 96, k: 1 },
  { s: linje.lengde, z: 99, k: 1 }
]);

const mal = Object.assign({}, M.StandardMal);

console.log('linjelengde', linje.lengde.toFixed(2), 'm   kurver:',
  linje.kurver.map(k => 'R=' + k.r.toFixed(1) + ' @ ' + k.sBC.toFixed(0)).join(', '));

const t0 = Date.now();
const res = M.beregnMasser({
  linje, profil, terreng, mal, fjell,
  profilAvstand: 5, bakkefaktor: 1
});
console.log('beregnMasser:', (Date.now() - t0) + ' ms,', res.profiler.length, 'profiler');

/* ==================================================================== *
 * 1. HVA ER EGENTLIG (stasjon x avvik)?  Skriv ut strukturen.
 * ==================================================================== */
console.log('\n=== 1. Strukturen i res.profiler ===');
const p0 = res.profiler[0];
console.log('felt på ett profil:', Object.keys(p0).join(', '));
console.log('har geometri:', !!p0.geometri, ' har sider:', !!p0.sider);
let minFot = Infinity, maksFot = -Infinity, minHb = Infinity, maksHb = -Infinity;
for (const p of res.profiler) {
  minFot = Math.min(minFot, p.fotVenstre); maksFot = Math.max(maksFot, p.fotHoyre);
  minHb = Math.min(minHb, p.halvbredde); maksHb = Math.max(maksHb, p.halvbredde);
}
console.log('fotVenstre spenner fra', minFot.toFixed(2), 'til',
  Math.min(...res.profiler.map(p => p.fotVenstre)).toFixed(2));
console.log('t-området over hele vegen: [', minFot.toFixed(2), ',', maksFot.toFixed(2), '] =',
  (maksFot - minFot).toFixed(2), 'm bredt');
console.log('halvbredde varierer:', minHb.toFixed(3), '-', maksHb.toFixed(3));
const bredder = res.profiler.map(p => p.fotHoyre - p.fotVenstre);
console.log('bredden per profil: min', Math.min(...bredder).toFixed(2),
  ' maks', Math.max(...bredder).toFixed(2));

/* Er stasjonene jamt fordelte? */
const dS = [];
for (let i = 1; i < res.profiler.length; i++) dS.push(res.profiler[i].s - res.profiler[i - 1].s);
console.log('stasjonsavstand: min', Math.min(...dS).toFixed(3), ' maks', Math.max(...dS).toFixed(3));

/* ==================================================================== *
 * 2. FOLDER (s,t)-AVBILDNINGEN SEG?  1 + t*krumning < 0 = forbi senteret.
 * ==================================================================== */
console.log('\n=== 2. Er (s,t) -> (x,y) injektiv? ===');
let forbi = 0, verstW = Infinity;
for (const p of res.profiler) {
  const kr = p.krumning;
  for (const t of [p.fotVenstre, p.fotHoyre]) {
    const w = 1 + t * kr;
    if (w < verstW) verstW = w;
  }
  if (p.forbiKurvesenter) forbi++;
}
console.log('profiler merket forbiKurvesenter:', forbi, 'av', res.profiler.length);
console.log('minste (1 + t*krumning) over hele vegen:', verstW.toFixed(4),
  verstW < 0 ? '  <-- NEGATIV: avbildningen er vrengt' : '');

/* Mål det direkte: bygg gitteret slik påstanden foreslår og se etter
   celler som har snudd omløpsretning (foldet over seg selv). */
function byggGitter(profiler, nT) {
  const tMin = Math.min(...profiler.map(p => p.fotVenstre));
  const tMax = Math.max(...profiler.map(p => p.fotHoyre));
  const nb = nT, nh = profiler.length;
  const wx = new Float64Array(nb * nh), wy = new Float64Array(nb * nh);
  for (let j = 0; j < nh; j++) {
    const s = profiler[j].s;
    for (let i = 0; i < nb; i++) {
      const t = tMin + (tMax - tMin) * i / (nb - 1);
      const q = linje.punktMedAvvik(s, t);
      wx[j * nb + i] = q.x; wy[j * nb + i] = q.y;
    }
  }
  return { nb, nh, wx, wy, tMin, tMax };
}
const g = byggGitter(res.profiler, 121);
console.log('gitter:', g.nb, 'x', g.nh, '=', g.nb * g.nh, 'noder, t-steg',
  ((g.tMax - g.tMin) / (g.nb - 1)).toFixed(3), 'm');

let positive = 0, negative = 0, null_ = 0, minAreal = Infinity, maksAreal = 0;
for (let j = 0; j < g.nh - 1; j++) {
  for (let i = 0; i < g.nb - 1; i++) {
    const k00 = j * g.nb + i, k10 = k00 + 1, k01 = k00 + g.nb, k11 = k01 + 1;
    // signert areal av firkanten (skolissformelen)
    const xs = [g.wx[k00], g.wx[k10], g.wx[k11], g.wx[k01]];
    const ys = [g.wy[k00], g.wy[k10], g.wy[k11], g.wy[k01]];
    let a = 0;
    for (let n = 0; n < 4; n++) {
      const m = (n + 1) % 4;
      a += xs[n] * ys[m] - xs[m] * ys[n];
    }
    a /= 2;
    if (a > 1e-9) positive++; else if (a < -1e-9) negative++; else null_++;
    minAreal = Math.min(minAreal, Math.abs(a)); maksAreal = Math.max(maksAreal, Math.abs(a));
  }
}
console.log('celler med positivt areal:', positive, ' NEGATIVT (vrengt):', negative, ' null:', null_);
console.log('celleareal: minste', minAreal.toExponential(3), 'm2  største', maksAreal.toFixed(3), 'm2',
  '  forhold', (maksAreal / Math.max(1e-12, minAreal)).toExponential(2));

/* ==================================================================== *
 * 3. HVA KOSTER HØYDENE?  geometri finnes bare under GEOMETRIGRENSE.
 * ==================================================================== */
console.log('\n=== 3. Kostnaden ved å hente høydene ===');
const t1 = Date.now();
let n = 0;
for (const p of res.profiler) { const q = res.geometriFor(p.s); if (q.geometri) n++; }
const msGeo = Date.now() - t1;
console.log('geometriFor for alle', res.profiler.length, 'profiler:', msGeo, 'ms  (' +
  (msGeo / res.profiler.length).toFixed(2), 'ms per profil)');

/* Lang veg: over GEOMETRIGRENSE = 800 er geometri null i utgangspunktet. */
const langIp = [{ x: 0, y: 0, r: 0 }, { x: 4000, y: 0, r: 0 }];
const langLinje = new Linjeforing(langIp);
const langProfil = new Vertikalprofil([{ s: 0, z: 100, k: 1 }, { s: 4000, z: 90, k: 1 }]);
const t2 = Date.now();
const langRes = M.beregnMasser({
  linje: langLinje, profil: langProfil, terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1
});
console.log('4 km veg, 5 m profil:', langRes.profiler.length, 'profiler,',
  (Date.now() - t2) + ' ms,  geometri på profil 0:', langRes.profiler[0].geometri);
const t3 = Date.now();
const PRØV = 40;
for (let i = 0; i < PRØV; i++) langRes.geometriFor(langRes.profiler[i * 10].s);
const perGeo = (Date.now() - t3) / PRØV;
console.log('geometriFor koster', perGeo.toFixed(2), 'ms per profil ->',
  (perGeo * langRes.profiler.length / 1000).toFixed(1), 's for hele vegen');
