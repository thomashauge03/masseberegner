'use strict';
/* Felles oppsett for veg-3D-prøvene: bygger Ydestad-demoen utenfor
   nettleseren, med terreng fra det lokale mellomlageret. */

const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil, foreslaProfil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { hentFlis, pakkOpp } = require('../lib/hoydedata.js');

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

const IP_YDESTAD = [
  { x: 395010, y: 6463040, r: 0 },
  { x: 395100, y: 6463045, r: 60 },
  { x: 395190, y: 6463060, r: 60 },
  { x: 395270, y: 6463030, r: 30 },
  { x: 395350, y: 6463050, r: 60 },
  { x: 395430, y: 6463060, r: 0 }
];

async function byggDemo(o) {
  o = o || {};
  const sone = 32;
  const linje = new Linjeforing(o.ip || IP_YDESTAD);
  const terreng = new NodeTerreng(sone);
  const mal = Object.assign({}, M.StandardMal, o.mal || {});
  await terreng.last(linje, mal.maksSokebredde + 12);

  const st = [], zt = [];
  for (let s = 0; s <= linje.lengde; s += 2) {
    const p = linje.punktVed(Math.min(s, linje.lengde));
    st.push(Math.min(s, linje.lengde)); zt.push(terreng.z(p.x, p.y));
  }
  const gyldige = zt.filter(isFinite);
  const vip = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.20, k: 1,
    maksStigningVed: s => M.maksStigningFraRadius(mal, linje.radiusVed(s))
  });
  const profil = new Vertikalprofil(vip);
  const midt = linje.punktVed(linje.lengde / 2);
  const bf = Geo.bakkefaktor(midt.x, midt.y, sone, gyldige.reduce((a, b) => a + b, 0) / gyldige.length);

  const kjor = valg => M.beregnMasser(Object.assign({
    linje, profil, terreng, mal,
    fjell: new M.Fjellmodell(o.fjell || { standarddybde: 0.5 }),
    faktorer: M.StandardFaktorer,
    profilAvstand: o.profilAvstand == null ? 5 : o.profilAvstand,
    bakkefaktor: bf
  }, valg || {}));

  return { linje, profil, terreng, mal, bf, kjor, res: kjor() };
}

module.exports = { byggDemo, NodeTerreng, IP_YDESTAD, M, Geo, Linjeforing, Vertikalprofil, foreslaProfil };
