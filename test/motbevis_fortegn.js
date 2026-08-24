'use strict';
/* Motbevis-prøve: er "fortegnsprøvens motstykke" renskflaten mot jordflaten,
   og oppdager den foreslåtte prøven i det hele tatt forskjellen? */
const { byggDemo } = require('./_veg3d_felles.js');

(async () => {
  const d = await byggDemo();
  const r = d.res;
  const rensk = d.mal.renskDybde;
  console.log('renskDybde =', rensk, ' profiler =', r.profiler.length,
    ' geometri paa profil?', !!r.profiler[0].geometri);

  /* ---- 1. Er forskjellen mellom geometri.terreng og geometri.rensk en
           KONSTANT lik renskDybde, punkt for punkt? ---- */
  let maksAvvikFraKonstant = 0, n = 0, ulikLengde = 0;
  for (const p of r.profiler) {
    const g = p.geometri; if (!g) continue;
    if (g.terreng.length !== g.rensk.length) { ulikLengde++; continue; }
    for (let i = 0; i < g.terreng.length; i++) {
      const a = g.terreng[i][1], b = g.rensk[i][1];
      if (!isFinite(a) || !isFinite(b)) continue;
      if (Math.abs(g.terreng[i][0] - g.rensk[i][0]) > 1e-12) console.log('  ulik t!', i);
      maksAvvikFraKonstant = Math.max(maksAvvikFraKonstant, Math.abs((a - b) - rensk));
      n++;
    }
  }
  console.log('\n1) terreng - rensk, punkt for punkt:');
  console.log('   punkt =', n, ' profiler med ulik lengde =', ulikLengde);
  console.log('   maks |(terreng-rensk) - renskDybde| =', maksAvvikFraKonstant.toExponential(3));

  /* ---- 2. Bygg et korridorgitter slik en 3D-tegner ville gjort: en node per
           (profil, offset). Høydene hentes fra geometrien - ingen egen
           skråningsregning. ---- */
  const interp = (liste, t) => {
    if (!liste || !liste.length) return NaN;
    if (t <= liste[0][0]) return liste[0][1];
    if (t >= liste[liste.length - 1][0]) return liste[liste.length - 1][1];
    for (let i = 0; i < liste.length - 1; i++) {
      if (t >= liste[i][0] && t <= liste[i + 1][0]) {
        const dt = liste[i + 1][0] - liste[i][0];
        if (dt < 1e-12) return liste[i][1];
        const f = (t - liste[i][0]) / dt;
        return liste[i][1] + f * (liste[i + 1][1] - liste[i][1]);
      }
    }
    return liste[liste.length - 1][1];
  };

  const NT = 65;                         // noder tvers over korridoren
  const noder = [];                      // {s, t, zRaa, zRensk, zJord, zVeg}
  for (const p of r.profiler) {
    const g = p.geometri; if (!g) continue;
    const tV = p.fotVenstre, tH = p.fotHoyre;
    for (let i = 0; i < NT; i++) {
      const t = tV + (tH - tV) * i / (NT - 1);
      const zRaa = interp(g.terreng, t);
      const zRensk = interp(g.rensk, t);
      const zJord = interp(g.jord, t);
      if (!isFinite(zRaa) || !isFinite(zRensk) || !isFinite(zJord)) continue;
      noder.push({ s: p.s, t, zRaa, zRensk, zJord, hb: p.halvbredde,
        zVeg: interp(g.veg, Math.max(-p.halvbredde, Math.min(p.halvbredde, t))) });
    }
  }
  console.log('\n2) korridorgitter:', noder.length, 'noder (' + r.profiler.length + ' profiler x ' + NT + ')');

  let bytter = 0;
  let maksAbsDVedBytte = 0, maksAbsDTerrengVedBytte = 0;
  const bytteD = [];
  for (const nd of noder) {
    const dR = nd.zRensk - nd.zJord;     // slik masser.js regner volumet
    const dT = nd.zRaa - nd.zJord;       // slik "rateerreng"-varianten ville sett det
    if ((dR >= 0) !== (dT >= 0)) {
      bytter++;
      maksAbsDVedBytte = Math.max(maksAbsDVedBytte, Math.abs(dR));
      maksAbsDTerrengVedBytte = Math.max(maksAbsDTerrengVedBytte, Math.abs(dT));
      bytteD.push(Math.abs(dR));
    }
  }
  console.log('   bytter fortegn:', bytter, '=', (100 * bytter / noder.length).toFixed(1) + ' %');
  console.log('   STØRSTE |d_rensk| blant dem som bytter:', maksAbsDVedBytte.toFixed(4), 'm');
  console.log('   STØRSTE |d_terreng| blant dem som bytter:', maksAbsDTerrengVedBytte.toFixed(4), 'm');

  /* Samme prøve paa alle geometripunktene, som pastanden ogsa oppgir */
  let bytterG = 0, nG = 0, maksG = 0;
  for (const p of r.profiler) {
    const g = p.geometri; if (!g) continue;
    for (let i = 0; i < g.rensk.length; i++) {
      const zR = g.rensk[i][1], zRaa = g.terreng[i][1], zJ = g.jord[i][1];
      if (!isFinite(zR) || !isFinite(zJ) || !isFinite(zRaa)) continue;
      nG++;
      const dR = zR - zJ, dT = zRaa - zJ;
      if ((dR >= 0) !== (dT >= 0)) { bytterG++; maksG = Math.max(maksG, Math.abs(dR)); }
    }
  }
  console.log('   alle geometripunkt:', bytterG, 'av', nG, '=', (100 * bytterG / nG).toFixed(1) + ' %',
    ' storste |d_rensk| der:', maksG.toFixed(4));

  /* ---- 3. Hvor mange av dem som bytter fortegn har |d| >= 0,5 m? ---- */
  for (const terskel of [0.05, 0.1, 0.2, 0.3, 0.5, 1.0]) {
    const over = bytteD.filter(v => v >= terskel).length;
    console.log('   av dem som bytter: |d_rensk| >= ' + terskel.toFixed(2) + ' m -> ' + over + ' noder');
  }

  /* ---- 4. KJØR DEN FORESLATTE PRØVEN, med begge flatevalgene ---- */
  // enkelt kamera, samme form som Tomt3d._kamera
  const yaw = 25 * Math.PI / 180, pitch = 55 * Math.PI / 180;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // verdenskoordinat for noden
  const verden = nd => {
    const q = d.linje.punktMedAvvik ? null : null;
    return null;
  };
  // bruk (s, t) direkte som lokalt plan: x = s, y = t. Fortegnsprøven bryr seg
  // bare om py, og py avhenger av z gjennom -z*cp; s/t-planet er nok.
  let sX = 0, sY = 0, sZ = 0, nn = 0, lav = Infinity, hoy = -Infinity;
  for (const nd of noder) { sX += nd.s; sY += nd.t; nn++;
    lav = Math.min(lav, nd.zJord, nd.zRaa); hoy = Math.max(hoy, nd.zJord, nd.zRaa); }
  const cx0 = sX / nn, cy0 = sY / nn, z0 = (lav + hoy) / 2;
  const dist = Math.max(60, r.lengdeKart * 1.6);
  const skala = 3;
  const punkt = (wx, wy, wz) => {
    const x = wx - cx0, y = wy - cy0, z = wz - z0;
    const rx = x * ca + y * sa, ry = -x * sa + y * ca;
    const dk = -(ry * cp + z * sp);
    const sy = ry * sp - z * cp;
    const f = dist / (dist + dk);
    return { px: 400 + rx * f * skala, py: 300 + sy * f * skala, dk };
  };

  const kjorProve = (navn, hentZT) => {
    // noden med størst d og minste d, d fra masser.js (rensk - jord)
    let kS = -1, kF = -1;
    for (let i = 0; i < noder.length; i++) {
      const dd = noder[i].zRensk - noder[i].zJord;
      if (dd > 0.5 && (kS < 0 || dd > noder[kS].zRensk - noder[kS].zJord)) kS = i;
      if (dd < -0.5 && (kF < 0 || dd < noder[kF].zRensk - noder[kF].zJord)) kF = i;
    }
    if (kS < 0 || kF < 0) { console.log('   ' + navn + ': mangler noder'); return; }
    const a = noder[kS], b = noder[kF];
    const aT = punkt(a.s, a.t, hentZT(a)), aJ = punkt(a.s, a.t, a.zJord);
    const bT = punkt(b.s, b.t, hentZT(b)), bJ = punkt(b.s, b.t, b.zJord);
    const okS = aT.py < aJ.py - 0.5;
    const okF = bT.py > bJ.py + 0.5;
    console.log('   ' + navn + ': skjaering d=' + (a.zRensk - a.zJord).toFixed(2)
      + ' flate y=' + aT.py.toFixed(1) + ' jord y=' + aJ.py.toFixed(1) + ' -> ' + (okS ? 'BESTATT' : 'STRYK'));
    console.log('   ' + navn + ': fylling  d=' + (b.zRensk - b.zJord).toFixed(2)
      + ' flate y=' + bT.py.toFixed(1) + ' jord y=' + bJ.py.toFixed(1) + ' -> ' + (okF ? 'BESTATT' : 'STRYK'));
  };
  console.log('\n4) den foreslatte proven, kjort med begge flatevalgene:');
  kjorProve('RENSK  (pastandens krav)', nd => nd.zRensk);
  kjorProve('TERRENG (pastandens "feil")', nd => nd.zRaa);

  /* ---- 5. Veg over jord ---- */
  let vegUnder = 0, vegN = 0;
  for (const nd of noder) {
    if (Math.abs(nd.t) > nd.hb || !isFinite(nd.zVeg)) continue;
    vegN++;
    const v = punkt(nd.s, nd.t, nd.zVeg), j = punkt(nd.s, nd.t, nd.zJord);
    if (!(v.py < j.py)) vegUnder++;
  }
  console.log('\n5) veg over jord: ' + vegUnder + ' brudd av ' + vegN + ' noder pa vegbredden');

  /* ---- 6. Er tomta allerede i "samme feil"? ---- */
  console.log('\n6) se tomtmasser.js:396-399 og ui-tomt3d.js:144 - kommentar i svaret.');
})();
