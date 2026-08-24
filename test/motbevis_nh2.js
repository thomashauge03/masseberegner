'use strict';
/**
 * Del 2: er "alltid negativt" sant i det store, og er det jevne gitteret
 * det eneste som har fast nodetall?
 *
 *   node test/motbevis_nh2.js
 */

const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { hentFlis, pakkOpp } = require('../lib/hoydedata.js');
const demo = require('../public/demo/ydestad-demo.json');

class NodeTerreng {
  constructor(sone) { this.sone = sone; this.sr = Geo.epsg(sone); this.fliser = new Map(); }
  async last(linje, hb) {
    const trengs = new Set();
    for (let s = 0; s <= linje.lengde; s += 8) {
      const p = linje.punktVed(Math.min(s, linje.lengde));
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let t = -hb; t <= hb; t += 16) trengs.add(Math.floor((p.x + nx * t) / 256) + '_' + Math.floor((p.y + ny * t) / 256));
    }
    for (const k of trengs) { const [tx, ty] = k.split('_').map(Number); try { this.fliser.set(k, pakkOpp(await hentFlis(this.sr, tx, ty, 1)).data); } catch (e) { } }
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

function jordflateFra(p) {
  const jord = p.geometri.jord;
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

/** De EKTE knekkene i jordflaten: der helningen faktisk skifter. */
function ekteKnekk(p) {
  const jord = p.geometri.jord;
  const ut = [jord[0][0]];
  for (let i = 1; i < jord.length - 1; i++) {
    const dtA = jord[i][0] - jord[i - 1][0], dtB = jord[i + 1][0] - jord[i][0];
    if (dtA < 1e-9 || dtB < 1e-9) continue;
    const h1 = (jord[i][1] - jord[i - 1][1]) / dtA;
    const h2 = (jord[i + 1][1] - jord[i][1]) / dtB;
    if (Math.abs(h2 - h1) > 1e-4) ut.push(jord[i][0]);
  }
  ut.push(jord[jord.length - 1][0]);
  return ut;
}

/**
 * FAST nodetall, men nodene forankret i knekkene.
 * Tar knekklista, og deler så den lengste luka i to helt til det er nøyaktig
 * nh noder. Nodetallet er det samme i hvert profil; posisjonen er ikke.
 */
function malGitterT(p, nh) {
  let ts = [...new Set(ekteKnekk(p).map(v => +v.toFixed(9)))].sort((a, b) => a - b);
  if (ts.length > nh) {
    // for mange knekk: slipp de som betyr minst (minste helningsendring)
    while (ts.length > nh) {
      let best = 1, bestV = Infinity;
      for (let i = 1; i < ts.length - 1; i++) {
        const v = Math.min(ts[i] - ts[i - 1], ts[i + 1] - ts[i]);
        if (v < bestV) { bestV = v; best = i; }
      }
      ts.splice(best, 1);
    }
    return ts;
  }
  while (ts.length < nh) {
    let best = 0, bestL = -1;
    for (let i = 1; i < ts.length; i++) { const L = ts[i] - ts[i - 1]; if (L > bestL) { bestL = L; best = i; } }
    ts.splice(best, 0, (ts[best - 1] + ts[best]) / 2);
  }
  return ts;
}

function jevntT(p, nh) {
  const ut = [];
  for (let i = 0; i < nh; i++) ut.push(p.fotVenstre + (p.fotHoyre - p.fotVenstre) * i / (nh - 1));
  return ut;
}

function mal(res, terrZfor, nh, tFn) {
  let sSkj = 0, sFyl = 0, rSkj = 0, rFyl = 0, pos = 0, neg = 0, n = 0, verst = 0;
  for (const p of res.profiler) {
    if (!p.geometri) continue;
    const terrZ = terrZfor(p);
    const jf = jordflateFra(p);
    const ts = tFn(p, nh);
    const ds = ts.map(t => terrZ(t) - jf(t));
    const g = arealFra(ts, ds);
    sSkj += g.skjaering; sFyl += g.fylling;
    rSkj += p.areal.skjaering; rFyl += p.areal.fylling;
    const r = p.areal.skjaering + p.areal.fylling;
    if (r > 0.05) {
      n++;
      const e = (g.skjaering + g.fylling - r) / r;
      if (e > 1e-6) pos++; else if (e < -1e-6) neg++;
      if (Math.abs(e) > Math.abs(verst)) verst = e;
    }
  }
  return {
    skj: 100 * (sSkj - rSkj) / rSkj, fyl: 100 * (sFyl - rFyl) / rFyl,
    pos, neg, n, verst: 100 * verst
  };
}

(async () => {
  const sone = 32;
  const ipUtm = demo.ip.map(g => { const u = Geo.tilUtm(g.lat, g.lon, sone); return { x: u.x, y: u.y, r: g.r }; });
  const linje = new Linjeforing(ipUtm);
  const terreng = new NodeTerreng(sone);
  await terreng.last(linje, demo.mal.maksSokebredde + 12);
  const profil = new Vertikalprofil(demo.vip);
  const kjor = (m, f) => M.beregnMasser({
    linje, profil, terreng, mal: Object.assign({}, demo.mal, m || {}),
    fjell: new M.Fjellmodell(Object.assign({ standarddybde: 0.5 }, f || {})),
    faktorer: demo.faktorer, profilAvstand: 5, bakkefaktor: 1
  });
  const res = kjor();
  const terrZfor = p => {
    const nx = Math.sin(p.retning), ny = -Math.cos(p.retning), r = demo.mal.renskDybde;
    return t => { const v = terreng.z(p.x + nx * t, p.y + ny * t); return (typeof v === 'number' && isFinite(v)) ? v - r : NaN; };
  };

  console.log('1) HVOR MANGE EKTE KNEKK HAR ET PROFIL?');
  const antall = res.profiler.filter(p => p.geometri).map(p => ekteKnekk(p).length);
  antall.sort((a, b) => a - b);
  const hist = {};
  antall.forEach(v => hist[v] = (hist[v] || 0) + 1);
  console.log('   min', antall[0], ' median', antall[antall.length >> 1], ' maks', antall[antall.length - 1]);
  console.log('   fordeling', JSON.stringify(hist));
  console.log('   (masser.js sin knekk-liste, marsjpunkt og alt:',
    res.profiler.filter(p => p.sider).map(p => p.sider[-1].knekk.length + p.sider[1].knekk.length).sort((a, b) => a - b).slice(-1)[0], 'på det meste)');

  console.log('\n2) SAMME NODETALL, TO PLASSERINGER');
  console.log('   nh     JEVN skj/fyl              KNEKKFORANKRET skj/fyl        verste profil');
  for (const nh of [7, 9, 13, 17, 25, 33, 65]) {
    const a = mal(res, terrZfor, nh, jevntT);
    const b = mal(res, terrZfor, nh, malGitterT);
    console.log(`   ${String(nh).padStart(3)}   ${a.skj.toFixed(3).padStart(8)} / ${a.fyl.toFixed(3).padStart(7)} %      ` +
      `${b.skj.toFixed(3).padStart(8)} / ${b.fyl.toFixed(3).padStart(7)} %       jevn ${a.verst.toFixed(2)} %  forankret ${b.verst.toFixed(2)} %`);
  }

  console.log('\n3) FORTEGNET PER PROFIL (jevn oppdeling)');
  for (const nh of [9, 17, 33, 65, 129, 257, 513]) {
    const a = mal(res, terrZfor, nh, jevntT);
    console.log(`   nh ${String(nh).padStart(4)}: ${a.pos} profiler OVER, ${a.neg} under, av ${a.n}`);
  }
})();
