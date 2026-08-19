'use strict';
/**
 * Lager et demoprosjekt pa virkelig terreng ved Ydestad i Lyngdal og kjører
 * hele beregningen utenfor nettleseren. Brukes til a kontrollere at kjeden
 * terrengdata -> linjeføring -> lengdeprofil -> masser henger sammen.
 *
 *   node test/demo-ydestad.js
 */

const fs = require('fs');
const path = require('path');
const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil, foreslaProfil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { hentFlis, pakkOpp } = require('../lib/hoydedata.js');

/* --- Terrengmodell for Node (samme oppslag som i nettleseren) --- */
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
      try {
        this.fliser.set(k, pakkOpp(await hentFlis(this.sr, tx, ty, 1)).data);
      } catch (e) { /* utenfor dekning */ }
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

(async () => {
  const sone = 32;
  // Skogsbilvei langs lia ovenfor Ydestad, om lag i høydekurvenes retning
  const ipUtm = [
    { x: 395010, y: 6463040, r: 0 },
    { x: 395100, y: 6463045, r: 60 },
    { x: 395190, y: 6463060, r: 60 },
    { x: 395270, y: 6463030, r: 30 },
    { x: 395350, y: 6463050, r: 60 },
    { x: 395430, y: 6463060, r: 0 }
  ];

  const linje = new Linjeforing(ipUtm);
  console.log(`Linjeføring: ${linje.lengde.toFixed(1)} m, ${linje.kurver.length} kurver`);
  linje.kurver.forEach(k => console.log(`  BC ${k.sBC.toFixed(0)} – EC ${k.sEC.toFixed(0)}   R = ${k.r.toFixed(1)} m`));
  linje.advarsler.forEach(a => console.log('  ! ' + a.tekst));

  const terreng = new NodeTerreng(sone);
  const mal = Object.assign({}, M.StandardMal);
  const antall = await terreng.last(linje, mal.maksSokebredde + 12);
  console.log(`Terrengfliser: ${antall}`);

  // Terrengprofil langs senterlinjen
  const st = [], zt = [];
  for (let s = 0; s <= linje.lengde; s += 2) {
    const p = linje.punktVed(Math.min(s, linje.lengde));
    st.push(Math.min(s, linje.lengde)); zt.push(terreng.z(p.x, p.y));
  }
  const gyldige = zt.filter(isFinite);
  console.log(`Terreng langs linja: ${Math.min(...gyldige).toFixed(1)} – ${Math.max(...gyldige).toFixed(1)} moh`);

  const vip = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.20, k: 1,
    maksStigningVed: s => M.maksStigningFraRadius(mal, linje.radiusVed(s))
  });
  const profil = new Vertikalprofil(vip);
  console.log(`Lengdeprofil: ${vip.length} knekkpunkt, største stigning ${(profil.maksStigning(1) * 100).toFixed(1)} %`);

  const midt = linje.punktVed(linje.lengde / 2);
  const bf = Geo.bakkefaktor(midt.x, midt.y, sone, gyldige.reduce((a, b) => a + b, 0) / gyldige.length);

  const res = M.beregnMasser({
    linje, profil, terreng, mal,
    fjell: new M.Fjellmodell({ standarddybde: 0.5 }),
    faktorer: M.StandardFaktorer,
    profilAvstand: 5,
    bakkefaktor: bf
  });

  const t = v => Math.round(v).toLocaleString('nb-NO');
  console.log('\n--- Masser ---------------------------------------');
  console.log(`Veglengde                 ${res.lengde.toFixed(1)} m  (kartplan ${res.lengdeKart.toFixed(1)} m, faktor ${bf.toFixed(6)})`);
  console.log(`Rensk / avdekking         ${t(res.sum.rensk)} m³`);
  console.log(`Skjæring løsmasse         ${t(res.sum.skjaeringLosmasse)} p.f.m³`);
  console.log(`Skjæring fjell            ${t(res.sum.skjaeringFjell)} p.f.m³`);
  console.log(`Skjæring totalt           ${t(res.sum.skjaering)} p.f.m³`);
  console.log(`Fylling                   ${t(res.sum.fylling)} m³`);
  console.log(`Bærelag                   ${t(res.sum.baerelag)} m³`);
  console.log(`Slitelag                  ${t(res.sum.slitelag)} m³`);
  console.log(`Fylling + bærelag         ${t(res.sum.fylling + res.sum.baerelag)} p.a.m³`);
  console.log(`Massebalanse              ${res.balanse.balanse >= 0 ? 'overskudd' : 'mangel'} ${t(Math.abs(res.balanse.balanse))} m³`);
  console.log(`Merknader                 ${res.merknader.length}`);
  const typer = {};
  res.merknader.forEach(m => typer[m.type] = (typer[m.type] || 0) + 1);
  console.log('   ' + JSON.stringify(typer));

  console.log('\nProfil   R      Z_terr   Z_veg    skjær   fjell   fyll');
  for (const p of res.profiler.filter((_, i) => i % 8 === 0)) {
    console.log(
      String(p.s.toFixed(0)).padStart(6),
      (isFinite(p.radius) ? p.radius.toFixed(0) : '–').padStart(5),
      (isFinite(p.terrengSenter) ? p.terrengSenter.toFixed(2) : '–').padStart(9),
      p.vegnivaa.toFixed(2).padStart(8),
      p.areal.skjaering.toFixed(1).padStart(8),
      p.areal.skjaeringFjell.toFixed(1).padStart(7),
      p.areal.fylling.toFixed(1).padStart(7)
    );
  }

  // Lagre som demoprosjekt slik at det kan apnes i programmet
  const prosjekt = {
    navn: 'Ydestad demo',
    ip: ipUtm.map(p => { const g = Geo.fraUtm(p.x, p.y, sone); return { lat: +g.lat.toFixed(8), lon: +g.lon.toFixed(8), r: p.r }; }),
    vip: vip.map(v => ({ s: +v.s.toFixed(2), z: +v.z.toFixed(3), k: v.k })),
    standardRadius: 30,
    mal, faktorer: M.StandardFaktorer,
    fjell: { standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [] },
    profilAvstand: 5,
    bakkekorreksjon: true
  };
  // Demoprosjektet legges der programmet henter det første gang det apnes
  const ut = path.join(__dirname, '..', 'public', 'demo', 'ydestad-demo.json');
  fs.mkdirSync(path.dirname(ut), { recursive: true });
  fs.writeFileSync(ut, JSON.stringify(prosjekt, null, 1), 'utf8');
  console.log('\nDemoprosjekt lagret: ' + ut);
})();
