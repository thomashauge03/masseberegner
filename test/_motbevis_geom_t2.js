'use strict';
/* Runde 2: hull midt i tverrsnittet, veg-punkttall over breddespekteret,
   naerduplikate t, og hva som star igjen nar terreng-lista er tom. */

const fs = require('fs');
const path = require('path');
const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil, foreslaProfil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { pakkOpp } = require('../lib/hoydedata.js');

const CACHE = path.join(__dirname, '..', 'cache');

class CacheTerreng {
  constructor(sone, hullFn) {
    this.sone = sone; this.sr = Geo.epsg(sone);
    this.fliser = new Map(); this.mangler = new Set(); this.hullFn = hullFn || null;
  }
  _les(tx, ty) {
    const k = tx + '_' + ty;
    if (this.fliser.has(k) || this.mangler.has(k)) return;
    for (const n of [`v2_${this.sr}_1m_${tx}_${ty}.bin`, `${this.sr}_1m_${tx}_${ty}.bin`]) {
      const f = path.join(CACHE, n);
      if (fs.existsSync(f)) {
        try {
          const buf = fs.readFileSync(f);
          if (buf.length > 16 && buf.toString('ascii', 0, 4) === 'MKT1') { this.fliser.set(k, pakkOpp(buf).data); return; }
        } catch (e) { }
      }
    }
    this.mangler.add(k);
  }
  _celle(gi, gj) {
    const tx = Math.floor(gi / 256), i = gi - tx * 256;
    const ty = Math.ceil(-gj / 256) - 1, j = gj + (ty + 1) * 256;
    this._les(tx, ty);
    const f = this.fliser.get(tx + '_' + ty);
    return f ? f[j * 256 + i] : NaN;
  }
  z(x, y) {
    if (this.hullFn && this.hullFn(x, y)) return NaN;
    const fx = x - 0.5, fy = -y - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0), b = this._celle(i0 + 1, j0), c = this._celle(i0, j0 + 1), d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) return NaN;
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }
}

const tvers = [
  { x: 395050, y: 6462900, r: 0 },
  { x: 395120, y: 6463060, r: 40 },
  { x: 395180, y: 6463220, r: 0 }
];

function beregn(ip, malOverstyr, hullFn) {
  const linje = new Linjeforing(ip);
  const terreng = new CacheTerreng(32, hullFn);
  const mal = Object.assign({}, M.StandardMal, malOverstyr || {});
  const st = [], zt = [];
  for (let s = 0; s <= linje.lengde; s += 2) {
    const p = linje.punktVed(Math.min(s, linje.lengde));
    st.push(Math.min(s, linje.lengde)); zt.push(terreng.z(p.x, p.y));
  }
  const vip = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.20, k: 1,
    maksStigningVed: s => M.maksStigningFraRadius(mal, linje.radiusVed(s))
  });
  return M.beregnMasser({
    linje, profil: new Vertikalprofil(vip), terreng, mal,
    fjell: new M.Fjellmodell({ standarddybde: 0.5 }),
    faktorer: M.StandardFaktorer, profilAvstand: 5, bakkefaktor: 1
  });
}

/* --- 1. Hull som en RING rundt senterlinja: treffer midt i tverrsnittet --- */
console.log('\n1. Hull midt i tverrsnittet (ringformet nodata 5–9 m fra senterlinja)');
{
  // ring rundt punktet (395120, 6463060) treffer bare deler av hvert snitt
  const cx = 395120, cy = 6463060;
  const hullFn = (x, y) => {
    const r = Math.hypot(x - cx, y - cy);
    return r > 60 && r < 66;          // et smalt band, ikke sammenhengende med kanten
  };
  const res = beregn(tvers, null, hullFn);
  let indre = 0, tomme = 0, brutt = 0, maksSprang = 0, eks = null;
  for (const p of res.profiler) {
    const g = p.geometri; if (!g) continue;
    const n = g.terreng.length;
    if (n === 0) { tomme++; continue; }
    for (let i = 1; i < n; i++) {
      const d = g.terreng[i][0] - g.terreng[i - 1][0];
      if (d > 0.5) {
        if (d > maksSprang) { maksSprang = d; eks = { s: p.s, a: g.terreng[i - 1][0], b: g.terreng[i][0], n, manglerData: p.manglerData }; }
      }
    }
    if (maksSprang > 0 && eks && eks.s === p.s) indre++;
    if (Math.abs(g.terreng[0][0] - p.fotVenstre) > 1e-12 || Math.abs(g.terreng[n - 1][0] - p.fotHoyre) > 1e-12) brutt++;
  }
  console.log(`  profiler ${res.profiler.length}, tomme geometrilister ${tomme}, brutt spenn ${brutt}`);
  console.log(`  største indre sprang i t: ${maksSprang.toFixed(3)} m`);
  if (eks) console.log(`    eksempel s=${eks.s}: t hopper ${eks.a.toFixed(3)} -> ${eks.b.toFixed(3)} (${eks.n} punkt, manglerData=${eks.manglerData})`);
  // og er t fortsatt identisk mellom flatene her?
  let ulik = 0;
  for (const p of res.profiler) {
    const g = p.geometri; if (!g) continue;
    const n = g.terreng.length;
    for (let i = 0; i < n; i++) {
      const t0 = g.terreng[i][0];
      if (g.jord[i] === undefined || g.jord[i][0] !== t0 || g.fjell[i][0] !== t0 || g.rensk[i][0] !== t0) { ulik++; break; }
    }
  }
  console.log(`  profiler der t-listene IKKE er identiske: ${ulik}`);
}

/* --- 2. Hva star igjen nar terreng-lista er tom? --- */
console.log('\n2. Tomme terrenglister – hva er da veg, sider, fot?');
{
  const hullFn = (x, y) => Math.hypot(x - 395120, y - 6463060) < 40;
  const res = beregn(tvers, null, hullFn);
  const tom = res.profiler.filter(p => p.geometri && p.geometri.terreng.length === 0);
  console.log(`  ${tom.length} av ${res.profiler.length} profiler har tom terrengliste`);
  if (tom.length) {
    const p = tom[Math.floor(tom.length / 2)];
    const g = p.geometri;
    console.log(`  s=${p.s}: terreng ${g.terreng.length}, jord ${g.jord.length}, fjell ${g.fjell.length}, rensk ${g.rensk.length}, VEG ${g.veg.length}`);
    console.log(`    veg spenner ${g.veg[0][0].toFixed(3)}..${g.veg[g.veg.length - 1][0].toFixed(3)}, halvbredde ${p.halvbredde.toFixed(3)}`);
    console.log(`    fot ${p.fotVenstre.toFixed(3)}..${p.fotHoyre.toFixed(3)}, zFot ${p.zFotVenstre.toFixed(3)}/${p.zFotHoyre.toFixed(3)}`);
    console.log(`    sider != null: ${!!p.sider}, manglerData: ${p.manglerData}, terrengSenter: ${p.terrengSenter}`);
    console.log(`    advarsel: ${p.advarsel}`);
  }
}

/* --- 3. veg-punkttall over hele breddespekteret --- */
console.log('\n3. geometri.veg – punkttall som funksjon av halvbredde');
{
  const rader = [];
  for (const vb of [2.0, 2.5, 3.0, 3.5, 3.9, 3.99, 4.0, 4.01, 4.5, 5.0, 6.0, 7.0, 8.0, 10.0, 12.0, 20.0]) {
    const res = beregn(tvers, { vegbredde: vb, slitelagBredde: Math.min(vb, 3), ekstraBredde: null, breddeutvidelse: null }, null);
    const tell = new Map();
    let hbMin = Infinity, hbMaks = -Infinity, spennFeil = 0;
    for (const p of res.profiler) {
      const g = p.geometri; if (!g) continue;
      tell.set(g.veg.length, (tell.get(g.veg.length) || 0) + 1);
      hbMin = Math.min(hbMin, p.halvbredde); hbMaks = Math.max(hbMaks, p.halvbredde);
      if (Math.abs(g.veg[0][0] + p.halvbredde) > 1e-9 || Math.abs(g.veg[g.veg.length - 1][0] - p.halvbredde) > 1e-9) spennFeil++;
    }
    rader.push({ vb, hb: `${hbMin.toFixed(3)}–${hbMaks.toFixed(3)}`, tell: [...tell.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}x${v}`).join(' '), spennFeil });
  }
  console.log('  vegbredde  halvbredde        veg-punkttall            spenn!=±hb');
  for (const r of rader) console.log(`  ${String(r.vb).padEnd(10)} ${r.hb.padEnd(17)} ${r.tell.padEnd(24)} ${r.spennFeil}`);
}

/* --- 4. Naerduplikate t: hvor tett ligger de, og finnes eksakt 0? --- */
console.log('\n4. Naerduplikate t i geometri-lista');
{
  const res = beregn(tvers, null, null);
  const bøtter = { '0': 0, '<1e-12': 0, '<1e-6': 0, '<1e-3': 0, 'rest': 0 };
  let minDt = Infinity, minEks = null, totalt = 0;
  const nære = [];
  for (const p of res.profiler) {
    const g = p.geometri; if (!g || g.terreng.length < 2) continue;
    for (let i = 1; i < g.terreng.length; i++) {
      const d = g.terreng[i][0] - g.terreng[i - 1][0];
      totalt++;
      if (d === 0) bøtter['0']++;
      else if (d < 1e-12) bøtter['<1e-12']++;
      else if (d < 1e-6) bøtter['<1e-6']++;
      else if (d < 1e-3) bøtter['<1e-3']++;
      else bøtter['rest']++;
      if (d < minDt) { minDt = d; minEks = { s: p.s, a: g.terreng[i - 1][0], b: g.terreng[i][0], hb: p.halvbredde }; }
      if (d < 1e-6 && nære.length < 6) nære.push({ s: p.s, i, a: g.terreng[i - 1][0], b: g.terreng[i][0], d, hb: p.halvbredde, dz: g.jord[i][1] - g.jord[i - 1][1] });
    }
  }
  console.log(`  ${totalt} steg totalt: ` + JSON.stringify(bøtter));
  console.log(`  minste dt = ${minDt} (s=${minEks.s}, ${minEks.a} -> ${minEks.b}, hb=${minEks.hb})`);
  for (const n of nære) console.log(`    s=${n.s} i=${n.i}: t ${n.a} -> ${n.b}  dt=${n.d.toExponential(3)}  dz(jord)=${n.dz.toExponential(3)}  ±hb=${n.hb}`);
  // hva gir en interpolator som deler pa dt her?
  const n = nære[0];
  if (n) {
    const midt = (n.a + n.b) / 2;
    const f = (midt - n.a) / (n.b - n.a);
    console.log(`  interpolasjon midt i det tetteste steget: f = ${f} (endelig: ${isFinite(f)})`);
  }
}

/* --- 5. NaN-z i geometri-lista? --- */
console.log('\n5. Ikke-endelige z i geometri-listene');
{
  const res = beregn(tvers, null, (x, y) => Math.hypot(x - 395120, y - 6463060) < 40);
  const teller = { terreng: 0, jord: 0, fjell: 0, rensk: 0, veg: 0 };
  for (const p of res.profiler) {
    const g = p.geometri; if (!g) continue;
    for (const felt of Object.keys(teller)) for (const [t, z] of g[felt]) if (!isFinite(z) || !isFinite(t)) teller[felt]++;
  }
  console.log('  ' + JSON.stringify(teller));
  // og zFotVenstre / zFotHoyre?
  let nanFot = 0;
  for (const p of res.profiler) if (!isFinite(p.zFotVenstre) || !isFinite(p.zFotHoyre)) nanFot++;
  console.log(`  profiler med ikke-endelig zFotVenstre/zFotHoyre: ${nanFot} av ${res.profiler.length}`);
}
