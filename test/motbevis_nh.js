'use strict';
/**
 * MOTBEVIS-FORSØK mot påstanden om at jevn t-oppdeling mellom fotVenstre og
 * fotHoyre ALLTID underrapporterer arealet.
 *
 *   node test/motbevis_nh.js
 */

const path = require('path');
const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { hentFlis, pakkOpp } = require('../lib/hoydedata.js');
const demo = require('../public/demo/ydestad-demo.json');

class NodeTerreng {
  constructor(sone) { this.sone = sone; this.sr = Geo.epsg(sone); this.fliser = new Map(); }
  async last(linje, halvbredde) {
    const trengs = new Set();
    for (let s = 0; s <= linje.lengde; s += 8) {
      const p = linje.punktVed(Math.min(s, linje.lengde));
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let t = -halvbredde; t <= halvbredde; t += 16) {
        trengs.add(Math.floor((p.x + nx * t) / 256) + '_' + Math.floor((p.y + ny * t) / 256));
      }
    }
    for (const k of trengs) {
      const [tx, ty] = k.split('_').map(Number);
      try { this.fliser.set(k, pakkOpp(await hentFlis(this.sr, tx, ty, 1)).data); } catch (e) { }
    }
    return trengs.size;
  }
  _celle(gi, gj) {
    const tx = Math.floor(gi / 256), i = gi - tx * 256;
    const ty = Math.ceil(-gj / 256) - 1, j = gj + (ty + 1) * 256;
    const f = this.fliser.get(tx + '_' + ty);
    return f ? f[j * 256 + i] : NaN;
  }
  z(x, y) {
    const fx = x - 0.5, fy = -y - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0), b = this._celle(i0 + 1, j0), c = this._celle(i0, j0 + 1), d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) return NaN;
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }
}

/* ---- Gitteret slik en 3D-visning ville bygd det --------------------
   Høydene kommer fra masser.js: jordflaten interpoleres i knekklista,
   terrenget leses i samme terrengmodell masser.js selv bruker. */

function jordflateFra(p, hb) {
  // eksakt samme stykkevis lineære flate som masser.js sin jordflate()
  const jord = p.geometri.jord;    // [t, z] i stigende t, inneholder alle knekk
  return t => {
    if (t <= jord[0][0]) return jord[0][1];
    for (let i = 0; i < jord.length - 1; i++) {
      if (t >= jord[i][0] && t <= jord[i + 1][0]) {
        const dt = jord[i + 1][0] - jord[i][0];
        if (dt < 1e-12) return jord[i + 1][1];
        return jord[i][1] + (t - jord[i][0]) / dt * (jord[i + 1][1] - jord[i][1]);
      }
    }
    return jord[jord.length - 1][1];
  };
}

/** Trapes med eksakt nullpunktsdeling – samme regel som masser.js. */
function arealFra(ts, ds) {
  let skj = 0, fyl = 0;
  for (let i = 1; i < ts.length; i++) {
    const dt = ts[i] - ts[i - 1], a = ds[i - 1], b = ds[i];
    if (!isFinite(a) || !isFinite(b)) continue;
    if (a >= 0 && b >= 0) skj += (a + b) / 2 * dt;
    else if (a <= 0 && b <= 0) fyl += (-a - b) / 2 * dt;
    else {
      const u = a / (a - b);
      if (a > 0) { skj += 0.5 * a * u * dt; fyl += 0.5 * (-b) * (1 - u) * dt; }
      else { fyl += 0.5 * (-a) * u * dt; skj += 0.5 * b * (1 - u) * dt; }
    }
  }
  return { skjaering: skj, fylling: fyl };
}

/** Jevn oppdeling: nh noder mellom fotVenstre og fotHoyre. */
function jevntGitter(p, nh, terrZ) {
  const tV = p.fotVenstre, tH = p.fotHoyre;
  const jf = jordflateFra(p);
  const ts = [], ds = [];
  for (let i = 0; i < nh; i++) {
    const t = tV + (tH - tV) * i / (nh - 1);
    ts.push(t); ds.push(terrZ(t) - jf(t));
  }
  return arealFra(ts, ds);
}

/** Featureforankret gitter med FAST nodetall: knekkene ligger i faste spor. */
function malGitter(p, perSegment, terrZ) {
  const jf = jordflateFra(p);
  const jord = p.geometri.jord;
  // de EKTE knekkene i jordflaten: der helningen skifter merkbart
  const ekte = [jord[0][0]];
  for (let i = 1; i < jord.length - 1; i++) {
    const h1 = (jord[i][1] - jord[i - 1][1]) / Math.max(1e-9, jord[i][0] - jord[i - 1][0]);
    const h2 = (jord[i + 1][1] - jord[i][1]) / Math.max(1e-9, jord[i + 1][0] - jord[i][0]);
    if (Math.abs(h2 - h1) > 1e-6) ekte.push(jord[i][0]);
  }
  ekte.push(jord[jord.length - 1][0]);
  return { ekte, ...null };
}

(async () => {
  const sone = 32;
  const ipUtm = demo.ip.map(g => { const u = Geo.tilUtm(g.lat, g.lon, sone); return { x: u.x, y: u.y, r: g.r }; });
  const linje = new Linjeforing(ipUtm);
  const terreng = new NodeTerreng(sone);
  await terreng.last(linje, demo.mal.maksSokebredde + 12);
  const profil = new Vertikalprofil(demo.vip);

  const kjor = (mal, fjell, profilAvstand) => M.beregnMasser({
    linje, profil, terreng,
    mal: Object.assign({}, demo.mal, mal || {}),
    fjell: new M.Fjellmodell(Object.assign({ standarddybde: 0.5 }, fjell || {})),
    faktorer: demo.faktorer, profilAvstand: profilAvstand || 5, bakkefaktor: 1
  });

  const res = kjor();
  console.log(`Ydestad: ${res.profiler.length} profiler, lengde ${res.lengde.toFixed(1)} m`);
  console.log(`Geometri med? ${res.profiler[0].geometri ? 'ja' : 'nei'}`);

  const NH = [9, 17, 33, 65, 129, 257];

  const kjorProve = (res, navn) => {
    console.log('\n=== ' + navn + ' ===');
    console.log('  nh    sum skjæring      sum fylling     profiler med POSITIVT avvik (skj / fyl)');
    for (const nh of NH) {
      let sSkj = 0, sFyl = 0, rSkj = 0, rFyl = 0;
      let posS = 0, posF = 0, negS = 0, negF = 0, nS = 0, nF = 0;
      let verstPos = null;
      for (const p of res.profiler) {
        if (!p.geometri) continue;
        const pp = p.x, py = p.y;
        const dir = p.retning;
        const nx = Math.sin(dir), ny = -Math.cos(dir);
        const rensk = demo.mal.renskDybde;
        const terrZ = t => {
          const v = terreng.z(pp + nx * t, py + ny * t);
          return (typeof v === 'number' && isFinite(v)) ? v - rensk : NaN;
        };
        const g = jevntGitter(p, nh, terrZ);
        sSkj += g.skjaering; sFyl += g.fylling;
        rSkj += p.areal.skjaering; rFyl += p.areal.fylling;
        if (p.areal.skjaering > 0.05) {
          nS++;
          const e = (g.skjaering - p.areal.skjaering) / p.areal.skjaering;
          if (e > 1e-6) { posS++; if (!verstPos || e > verstPos.e) verstPos = { s: p.s, e, hva: 'skj' }; } else if (e < -1e-6) negS++;
        }
        if (p.areal.fylling > 0.05) {
          nF++;
          const e = (g.fylling - p.areal.fylling) / p.areal.fylling;
          if (e > 1e-6) { posF++; if (!verstPos || e > verstPos.e) verstPos = { s: p.s, e, hva: 'fyl' }; } else if (e < -1e-6) negF++;
        }
      }
      const pS = 100 * (sSkj - rSkj) / rSkj, pF = 100 * (sFyl - rFyl) / rFyl;
      console.log(`  ${String(nh).padStart(4)}  ${pS >= 0 ? '+' : ''}${pS.toFixed(3)} %        ${pF >= 0 ? '+' : ''}${pF.toFixed(3)} %       ${posS}/${nS}  ${posF}/${nF}` +
        (verstPos ? `   største positive: st ${verstPos.s} ${verstPos.hva} +${(100 * verstPos.e).toFixed(2)} %` : ''));
    }
  };

  kjorProve(res, 'Demoen som den står (fjell 0,5 m under terreng)');

  // Fjell dypt nede: ingen fjellknekk i skråningen
  const resDypt = kjor(null, { standarddybde: 100 });
  kjorProve(resDypt, 'Samme veg, fjell 100 m nede (ingen fjellknekk i skråningen)');

  // Ingen grøft
  const resUtenGroft = kjor({ grofteDybdePlanum: 0, grofteBunn: 0 }, { standarddybde: 100 });
  kjorProve(resUtenGroft, 'Uten grøft OG uten fjellknekk (bare hjørnet i vegkanten)');

  // Bare grøft, ikke fjell
  const resGroftDypt = kjor(null, { standarddybde: 100 });
})();
