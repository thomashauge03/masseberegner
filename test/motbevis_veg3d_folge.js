'use strict';
/* Del 2: holder FØLGEN? «Bare jordflaten må komme fra masser.js.»
   Prøver å finne flater i geometrien som HELLER IKKE lar seg slå opp,
   og feller ved geometriFor(). */

const { byggDemo, M } = require('./_veg3d_felles.js');

const IP_SVING = [
  { x: 395010, y: 6463000, r: 0 },
  { x: 395060, y: 6463120, r: 25 },   // radius godt under ensidigUnderRadius = 60
  { x: 395010, y: 6463240, r: 25 },
  { x: 395060, y: 6463360, r: 0 }
];

(async () => {
  const d = await byggDemo({ ip: IP_SVING, profilAvstand: 2, fjell: { standarddybde: 1.0 } });
  const r = d.res, mal = r.mal;

  // --- 1. Kan vegflaten bygges av de feltene profilet eksporterer? ---
  let verst = 0, verstS = null, antall = 0;
  let verstDosert = 0;
  for (const p of r.profiler) {
    const g = p.geometri; if (!g) continue;
    for (const [t, z] of g.veg) {
      // slik en 3D-kode uten geometri måtte gjette: vegnivå minus takfall
      const tt = Math.max(-p.halvbredde, Math.min(p.halvbredde, t));
      const gjett = p.vegnivaa - mal.tverrfall * Math.abs(tt);
      const a = Math.abs(z - gjett);
      antall++;
      if (a > verst) { verst = a; verstS = [p.s, t, z, gjett, p.radius]; }
      if (p.radius < mal.ensidigUnderRadius && a > verstDosert) verstDosert = a;
    }
  }
  console.log(`1) vegflate rekonstruert av vegnivaa+halvbredde+mal.tverrfall: ${antall} pkt, maks avvik ${verst.toFixed(4)} m`);
  console.log('   verste [s, t, geometri.veg, gjett, radius] =', verstS);
  console.log('   maks avvik i profiler med radius < ensidigUnderRadius:', verstDosert.toFixed(4), 'm');
  console.log('   finnes tverrfall i profilobjektet?', Object.keys(r.profiler[0]).includes('tverrfall'));

  // --- 2. Møter jordflaten RÅTT terreng eller rensket terreng i foten? ---
  let maksFot = 0, maksFotRensk = 0;
  for (const p of r.profiler) {
    const g = p.geometri; if (!g) continue;
    for (const side of [0, g.terreng.length - 1]) {
      const [t, zRaa] = g.terreng[side];
      const zJ = g.jord[side][1];
      maksFot = Math.max(maksFot, Math.abs(zJ - zRaa));
      maksFotRensk = Math.max(maksFotRensk, Math.abs(zJ - (zRaa - mal.renskDybde)));
    }
  }
  console.log(`2) i skråningsfoten: |jord - raatt terreng| maks ${maksFot.toFixed(4)} m,`
    + ` |jord - (terreng - renskDybde)| maks ${maksFotRensk.toFixed(4)} m  (renskDybde ${mal.renskDybde})`);

  // --- 3. geometriFor(s) for en s MELLOM to stasjoner ---------------
  const sMidt = (r.stasjoner[10] + r.stasjoner[11]) / 2 + 0.37;
  const gp = r.geometriFor(sMidt);
  console.log(`3) geometriFor(${sMidt}) gir profil med s = ${gp.s}  (stasjon 10 = ${r.stasjoner[10]}, 11 = ${r.stasjoner[11]})`);
  const t = gp.geometri.terreng[5][0], z = gp.geometri.terreng[5][1];
  const feilPkt = d.linje.punktMedAvvik(sMidt, t);
  const rettPkt = d.linje.punktMedAvvik(gp.s, t);
  console.log('   oppslag med den s man BA om   :', d.terreng.z(feilPkt.x, feilPkt.y).toFixed(4),
    ' avvik', Math.abs(z - d.terreng.z(feilPkt.x, feilPkt.y)).toFixed(4), 'm');
  console.log('   oppslag med profilets EGEN s  :', d.terreng.z(rettPkt.x, rettPkt.y).toFixed(4),
    ' avvik', Math.abs(z - d.terreng.z(rettPkt.x, rettPkt.y)).toExponential(2), 'm');

  // --- 4. hva koster geometriFor per profil på en lang veg? ---------
  const lang = await byggDemo({ ip: [{ x: 395010, y: 6463000, r: 0 }, { x: 395030, y: 6463260, r: 0 }], profilAvstand: 0.2, fjell: { standarddybde: 1.0 } });
  const n = lang.res.profiler.length;
  const t0 = Date.now();
  let pkt = 0;
  for (const p of lang.res.profiler) pkt += lang.res.geometriFor(p.s).geometri.jord.length;
  const tid = Date.now() - t0;
  console.log(`4) geometriFor for alle ${n} profiler: ${tid} ms (${(tid / n).toFixed(2)} ms per profil), ${pkt} jordpunkt`);

  const t1 = Date.now();
  let sum = 0;
  for (const p of lang.res.profiler) {
    for (let tt = -20; tt <= 20; tt += 0.25) {
      const q = lang.linje.punktMedAvvik(p.s, tt);
      const v = lang.terreng.z(q.x, q.y);
      if (Number.isFinite(v)) sum += v;
    }
  }
  const tid2 = Date.now() - t1;
  console.log(`   til sammenlikning: ${n * 161} rene terrengoppslag: ${tid2} ms (sum ${sum.toFixed(0)})`);
})();
