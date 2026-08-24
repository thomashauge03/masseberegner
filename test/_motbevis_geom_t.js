'use strict';
/* Motbevisforsøk: er geometri.terreng/jord/fjell/rensk alltid identiske i t,
   og er spennet alltid nøyaktig fotVenstre..fotHoyre?
   Leser terrengfliser rett fra cache/ - ingen nett. */

const fs = require('fs');
const path = require('path');
const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil, foreslaProfil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { pakkOpp } = require('../lib/hoydedata.js');

const CACHE = path.join(__dirname, '..', 'cache');

class CacheTerreng {
  constructor(sone, hull) {
    this.sone = sone; this.sr = Geo.epsg(sone);
    this.fliser = new Map(); this.mangler = new Set();
    this.hull = hull || null;   // {x0,x1,y0,y1} rektangel som skal late som nodata
    this.treff = 0; this.bom = 0;
  }
  _les(tx, ty) {
    const k = tx + '_' + ty;
    if (this.fliser.has(k) || this.mangler.has(k)) return;
    const kandidater = [
      `v2_${this.sr}_1m_${tx}_${ty}.bin`,
      `${this.sr}_1m_${tx}_${ty}.bin`
    ];
    for (const n of kandidater) {
      const f = path.join(CACHE, n);
      if (fs.existsSync(f)) {
        try {
          const buf = fs.readFileSync(f);
          if (buf.length > 16 && buf.toString('ascii', 0, 4) === 'MKT1') {
            this.fliser.set(k, pakkOpp(buf).data); this.treff++; return;
          }
        } catch (e) { /* neste */ }
      }
    }
    this.mangler.add(k); this.bom++;
  }
  _celle(gi, gj) {
    const tx = Math.floor(gi / 256), i = gi - tx * 256;
    const ty = Math.ceil(-gj / 256) - 1, j = gj + (ty + 1) * 256;
    this._les(tx, ty);
    const f = this.fliser.get(tx + '_' + ty);
    return f ? f[j * 256 + i] : NaN;
  }
  z(x, y) {
    if (this.hull && x >= this.hull.x0 && x <= this.hull.x1 && y >= this.hull.y0 && y <= this.hull.y1) return NaN;
    const fx = x - 0.5, fy = -y - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0), b = this._celle(i0 + 1, j0), c = this._celle(i0, j0 + 1), d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) return NaN;
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }
}

function byggLinje(ip) { return new Linjeforing(ip); }

function kjør(navn, ip, malOverstyr, hull, profilAvstand) {
  const sone = 32;
  const linje = byggLinje(ip);
  const terreng = new CacheTerreng(sone, hull);
  const mal = Object.assign({}, M.StandardMal, malOverstyr || {});
  const st = [], zt = [];
  for (let s = 0; s <= linje.lengde; s += 2) {
    const p = linje.punktVed(Math.min(s, linje.lengde));
    st.push(Math.min(s, linje.lengde)); zt.push(terreng.z(p.x, p.y));
  }
  const gyldige = zt.filter(isFinite);
  if (!gyldige.length) { console.log(`  ${navn}: INGEN terrengdekning i cache – hoppes over`); return null; }
  const vip = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.20, k: 1,
    maksStigningVed: s => M.maksStigningFraRadius(mal, linje.radiusVed(s))
  });
  const profil = new Vertikalprofil(vip);
  const res = M.beregnMasser({
    linje, profil, terreng, mal,
    fjell: new M.Fjellmodell({ standarddybde: 0.5 }),
    faktorer: M.StandardFaktorer,
    profilAvstand: profilAvstand == null ? 5 : profilAvstand,
    bakkefaktor: 1
  });
  console.log(`\n=== ${navn} ===`);
  console.log(`  lengde ${linje.lengde.toFixed(1)} m, ${res.profiler.length} profiler, ` +
    `fliser i cache ${terreng.treff}, manglende ${terreng.bom}`);
  return { linje, res, mal, terreng };
}

/* ------------------------------------------------------------------ */
function granskGeometri(navn, res) {
  let ulikT = 0, ulikLengde = 0, spennAvvikV = 0, spennAvvikH = 0;
  let ikkeMonoton = 0, eksaktDuplikat = 0, minDt = Infinity, minDtIkkeNull = Infinity;
  let vegAntall = new Map();
  let utenGeom = 0, medGeom = 0;
  let minPkt = Infinity, maksPkt = -Infinity, sumPkt = 0;
  let hullProfil = 0, hullSpennBrudd = 0, indreHull = 0, tomme = 0;
  let maksSpennAvvik = 0;
  let eksempel = null;

  for (const p of res.profiler) {
    const g = p.geometri;
    if (!g) { utenGeom++; continue; }
    medGeom++;
    const n = g.terreng.length;
    minPkt = Math.min(minPkt, n); maksPkt = Math.max(maksPkt, n); sumPkt += n;
    if (n === 0) { tomme++; if (p.manglerData) hullProfil++; continue; }

    // 1) identiske t-lister?
    for (const felt of ['jord', 'fjell', 'rensk']) {
      if (g[felt].length !== n) { ulikLengde++; break; }
    }
    let feilHer = false;
    for (let i = 0; i < n; i++) {
      const t0 = g.terreng[i][0];
      for (const felt of ['jord', 'fjell', 'rensk']) {
        if (g[felt].length !== n || g[felt][i][0] !== t0) { feilHer = true; break; }
      }
      if (feilHer) break;
    }
    if (feilHer) ulikT++;

    // 2) spenn == fotVenstre..fotHoyre?
    const tFørst = g.terreng[0][0], tSist = g.terreng[n - 1][0];
    const dV = Math.abs(tFørst - p.fotVenstre), dH = Math.abs(tSist - p.fotHoyre);
    if (dV > 1e-12) { spennAvvikV++; maksSpennAvvik = Math.max(maksSpennAvvik, dV); if (!eksempel) eksempel = { s: p.s, tFørst, fotV: p.fotVenstre, tSist, fotH: p.fotHoyre }; }
    if (dH > 1e-12) { spennAvvikH++; maksSpennAvvik = Math.max(maksSpennAvvik, dH); if (!eksempel) eksempel = { s: p.s, tFørst, fotV: p.fotVenstre, tSist, fotH: p.fotHoyre }; }

    // 3) monotoni og duplikat
    for (let i = 1; i < n; i++) {
      const d = g.terreng[i][0] - g.terreng[i - 1][0];
      if (d < 0) ikkeMonoton++;
      if (d === 0) eksaktDuplikat++;
      if (d < minDt) minDt = d;
      if (d > 0 && d < minDtIkkeNull) minDtIkkeNull = d;
    }

    // 4) hull inne i lista: forventet punkttall mot faktisk
    if (p.manglerData) {
      hullProfil++;
      if (dV > 1e-12 || dH > 1e-12) hullSpennBrudd++;
      // finn store sprang som tyder pa hull midt inne
      for (let i = 1; i < n; i++) {
        if (g.terreng[i][0] - g.terreng[i - 1][0] > 1.0) { indreHull++; break; }
      }
    }

    // 5) veg-lista
    vegAntall.set(g.veg.length, (vegAntall.get(g.veg.length) || 0) + 1);
    // dekker veg-lista nøyaktig -hb..hb?
    if (Math.abs(g.veg[0][0] + p.halvbredde) > 1e-9) { /* rapporteres under */ }
  }
  console.log(`  profiler med geometri ${medGeom}, uten ${utenGeom}, TOMME lister ${tomme}`);
  console.log(`  punkt per profil: ${minPkt}–${maksPkt}, middel ${(sumPkt / Math.max(1, medGeom)).toFixed(0)}`);
  console.log(`  ulik t-liste mellom flatene: ${ulikT}   ulik lengde: ${ulikLengde}`);
  console.log(`  spenn != fotVenstre: ${spennAvvikV}   spenn != fotHoyre: ${spennAvvikH}   maks avvik ${maksSpennAvvik.toExponential(3)}`);
  if (eksempel) console.log(`    eksempel s=${eksempel.s}: t[0]=${eksempel.tFørst} fotV=${eksempel.fotV} | t[n-1]=${eksempel.tSist} fotH=${eksempel.fotH}`);
  console.log(`  ikke-monoton: ${ikkeMonoton}   EKSAKT duplikat dt===0: ${eksaktDuplikat}`);
  console.log(`  minste dt: ${minDt === Infinity ? '-' : minDt.toExponential(6)}   minste dt>0: ${minDtIkkeNull === Infinity ? '-' : minDtIkkeNull.toExponential(6)}`);
  console.log(`  profiler med manglerData: ${hullProfil}, av dem med brutt spenn: ${hullSpennBrudd}, med indre sprang >1 m: ${indreHull}`);
  console.log(`  veg-punkttall: ${[...vegAntall.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}x${v}`).join(', ')}`);
  return { ulikT, spennAvvikV, spennAvvikH, eksaktDuplikat, minDtIkkeNull, vegAntall };
}

/* ------------------------------------------------------------------ */
const ydestad = [
  { x: 395010, y: 6463040, r: 0 },
  { x: 395100, y: 6463045, r: 60 },
  { x: 395190, y: 6463060, r: 60 },
  { x: 395270, y: 6463030, r: 30 },
  { x: 395350, y: 6463050, r: 60 },
  { x: 395430, y: 6463060, r: 0 }
];
// tvers av lia - ekte skraninger
const tvers = [
  { x: 395050, y: 6462900, r: 0 },
  { x: 395120, y: 6463060, r: 40 },
  { x: 395180, y: 6463220, r: 0 }
];

const oppsett = [
  ['A Ydestad, standardmal', ydestad, null, null],
  ['B Tvers av lia', tvers, null, null],
  ['C Tvers, beregningsbredde 6 m', tvers, { beregningsbredde: 6 }, null],
  ['D Tvers, smal veg hb<2 (vegbredde 3,0)', tvers, { vegbredde: 3.0, slitelagBredde: 3.0 }, null],
  ['E Tvers, vegbredde 4,0 (hb=2,0 grensetilfelle)', tvers, { vegbredde: 4.0, slitelagBredde: 4.0 }, null],
  ['F Tvers, vegbredde 7,3 (hb=3,65)', tvers, { vegbredde: 7.3, slitelagBredde: 7.0 }, null],
  ['G Tvers MED HULL i terrengmodellen', tvers, null, { x0: 395135, x1: 395175, y0: 6463090, y1: 6463160 }]
];

for (const [navn, ip, mo, hull] of oppsett) {
  const r = kjør(navn, ip, mo, hull);
  if (r) granskGeometri(navn, r.res);
}

/* --- H: over GEOMETRIGRENSE, sa geometri er null og geometriFor ma brukes --- */
{
  const r = kjør('H Ydestad med profilAvstand 0,5 (>800 stasjoner)', ydestad, null, null, 0.5);
  if (r) {
    const antNull = r.res.profiler.filter(p => !p.geometri).length;
    console.log(`  profiler uten geometri: ${antNull} av ${r.res.profiler.length}`);
    console.log(`  sider null: ${r.res.profiler.filter(p => !p.sider).length}`);
    const g = r.res.geometriFor(100);
    console.log(`  geometriFor(100) gav geometri: ${!!g.geometri}, punkt ${g.geometri.terreng.length}, ` +
      `spenn ${g.geometri.terreng[0][0].toFixed(4)}..${g.geometri.terreng[g.geometri.terreng.length - 1][0].toFixed(4)}, ` +
      `fot ${g.fotVenstre.toFixed(4)}..${g.fotHoyre.toFixed(4)}`);
    // Er geometriFor sitt profil identisk med profilet i lista?
    const nær = r.res.profiler.reduce((a, b) => Math.abs(b.s - 100) < Math.abs(a.s - 100) ? b : a);
    console.log(`  nærmeste lagrede profil s=${nær.s}, geometriFor gav s=${g.s}, ` +
      `areal skjæring ${nær.areal.skjaering.toFixed(6)} vs ${g.areal.skjaering.toFixed(6)}`);
  }
}
