'use strict';
/* Forsøk på å motbevise påstanden om at geometri.terreng og geometri.fjell
   er bit-identiske med et direkte oppslag i terrengmodellen. */

const { byggDemo, M, Linjeforing } = require('./_veg3d_felles.js');

function tvers(dx, dy, n) {
  // en linje på tvers av lia
  return [
    { x: 395010, y: 6463000, r: 0 },
    { x: 395010 + dx, y: 6463000 + dy, r: 0 }
  ];
}

function sjekk(navn, d, fjellmodell) {
  const r = d.res;
  const linje = d.linje, terreng = d.terreng;
  let nT = 0, nF = 0, maksT = 0, maksF = 0, ulikeT = 0, ulikeF = 0;
  let nanT = 0;
  let verstT = null, verstF = null;
  for (const p of r.profiler) {
    const g = p.geometri || r.geometriFor(p.s).geometri;
    if (!g) continue;
    for (const [t, z] of g.terreng) {
      const pt = linje.punktMedAvvik(p.s, t);
      const z2 = terreng.z(pt.x, pt.y);
      nT++;
      if (!Number.isFinite(z)) { nanT++; continue; }
      if (!Object.is(z, z2)) { ulikeT++; const a = Math.abs(z - z2); if (a > maksT) { maksT = a; verstT = [p.s, t, z, z2]; } }
    }
    for (let i = 0; i < g.fjell.length; i++) {
      const [t, z] = g.fjell[i];
      const pt = linje.punktMedAvvik(p.s, t);
      const z2 = terreng.z(pt.x, pt.y) - fjellmodell.dybde(pt.x, pt.y, p.s);
      nF++;
      if (!Object.is(z, z2)) { ulikeF++; const a = Math.abs(z - z2); if (a > maksF) { maksF = a; verstF = [p.s, t, z, z2]; } }
    }
  }
  console.log(`${navn}: terreng ${nT} pkt, ${ulikeT} ulike (maks ${maksT.toExponential(2)}), NaN ${nanT}`
    + ` | fjell ${nF} pkt, ${ulikeF} ulike (maks ${maksF.toExponential(2)})`);
  if (verstT) console.log('   verste terreng', verstT);
  if (verstF) console.log('   verste fjell', verstF);
  return { nT, nF, ulikeT, ulikeF, nanT };
}

(async () => {
  // --- 1. rett på tvers av lia, tett profilavstand -----------------
  {
    const fjell = { standarddybde: 1.5 };
    const d = await byggDemo({ ip: tvers(20, 260), profilAvstand: 2, fjell });
    sjekk('A tvers, konstant fjell', d, new M.Fjellmodell(fjell));
  }

  // --- 2. fjellmodell med punkter (fjelldybde varierer i planet) ---
  {
    const fjell = {
      standarddybde: 2.0, rekkevidde: 120,
      punkter: [
        { x: 395010, y: 6463040, dybde: 0.1 },
        { x: 395030, y: 6463160, dybde: 4.0 },
        { x: 395000, y: 6463240, dybde: 0.0 }
      ]
    };
    const d = await byggDemo({ ip: tvers(20, 260), profilAvstand: 2, fjell });
    sjekk('B tvers, fjellpunkter', d, new M.Fjellmodell(fjell));
  }

  // --- 3. fjellmodell med strekninger (dybde avhenger av s) --------
  {
    const fjell = {
      standarddybde: 3.0,
      strekninger: [{ fra: 40, til: 120, dybde: 0.2 }, { fra: 180, til: 240, dybde: 6.0 }]
    };
    const d = await byggDemo({ ip: tvers(20, 260), profilAvstand: 2, fjell });
    const fm = new M.Fjellmodell(fjell);
    sjekk('C tvers, strekninger (med s)', d, fm);
    // samme, men uten å sende s inn i dybde()
    const utenS = { dybde: (x, y) => fm.dybde(x, y) };
    sjekk('C2 tvers, strekninger (UTEN s)', d, utenS);
  }

  // --- 4. kurvet demo-veg, beregningsbredde og smal søkebredde -----
  {
    const fjell = { standarddybde: 0.8 };
    const d = await byggDemo({ profilAvstand: 1, fjell, mal: { beregningsbredde: 6, renskDybde: 0.35 } });
    sjekk('D kurve, beregningsbredde 6', d, new M.Fjellmodell(fjell));
  }

  // --- 5. lang veg: geometri droppes, geometriFor må brukes --------
  {
    const fjell = { standarddybde: 1.0 };
    const d = await byggDemo({ ip: tvers(20, 260), profilAvstand: 0.2, fjell });
    console.log('E antall profiler', d.res.profiler.length, 'geometri på profil 0?', !!d.res.profiler[0].geometri);
    sjekk('E lang veg via geometriFor', d, new M.Fjellmodell(fjell));
  }
})();
