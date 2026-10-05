'use strict';
/**
 * Grøfta rørene ligger i – masser mot et teoretisk grøfteprofil.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `Groft` i nettleseren og med `require` i test/groftprove.js. Den bryr seg
 * ikke om røret er innmålt eller planlagt – etappe 3 skal bruke den som den er.
 *
 * ET RUTENETT, IKKE PROFILER LANGS RØRENE.
 * Flere rør ligger ofte i samme grøft, og grøftene møtes, deler seg og
 * krysser. Regnet profil for profil langs hvert rør ble den felles grøfta
 * talt én gang per rør. Her gir hvert rør en grop, og hver rute er gravd ned
 * til den dypeste gropa som når den: der gropene overlapper, er det én grøft,
 * og hver kubikk telles én gang – også der rør møtes og krysser.
 *
 * NORMALGRØFTA (avklart med brukeren): skråning 1:1, bunnbredde D + 2 × 0,3 m,
 * fundament 0,15 m under røret, omfylling til 0,3 m over topp rør, gjenfylling
 * med stedlige masser. I fjell står veggene loddrett, og løsmassen over graves
 * med vanlig skråning fra kanten av fjellgrøfta.
 */
const Groft = (() => {
  const StandardGroftmal = { bunntillegg: 0.30, fundament: 0.15, omfylling: 0.30, helning: 1.0, brukbar: 1.0 };
  /** Feltene som kan settes per kode og per strekning. `brukbar` gjelder hele anlegget. */
  const MALFELT = ['bunntillegg', 'fundament', 'omfylling', 'helning'];
  const GRENSER = { bunntillegg: [0, 2], fundament: [0, 1], omfylling: [0, 2], helning: [0, 3],
    brukbar: [0, 1], fjell: [0, 20] };
  /** Lenger fra hverandre enn dette får sammenslåtte rør ikke flat bunn mellom seg (m). */
  const SAMMEN_MAKS = 10;
  /** Nedre grense for hver dybdeklasse (m); den siste er åpen oppover. */
  const DYBDEKLASSER = [0, 1, 2, 3, 4];
  /* Rutenettet regnes flis for flis, og bare der et rør kan nå. Et rektangel
     rundt et rørnett på 800 × 300 m ville vært seks millioner ruter, nesten
     alle utenfor enhver grøft. */
  const FLIS = 5;
  /** Lenger ut enn dette fra et rør regnes det ikke med graving (m). */
  const MAKS_UT = 30;
  /** Avstanden mellom stasjonene langs rørene (m). */
  const STEG = 1;

  function nyGroft() { return { strekninger: [], sammen: [] }; }

  /** Et tall innenfor grensene for feltet, eller null. Tekst med komma godtas. */
  function klem(felt, v) {
    const x = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.trim().replace(',', '.'))) : v;
    if (typeof x !== 'number' || !Number.isFinite(x) || !GRENSER[felt]) return null;
    return Math.min(GRENSER[felt][1], Math.max(GRENSER[felt][0], x));
  }

  /**
   * Målene som gjelder: anlegget, så koden, så strekningen – felt for felt.
   * Et felt som ikke er satt på et nivå, arves fra nivået over.
   */
  function malFor(anlegg, kode, strekning) {
    const ut = Object.assign({}, StandardGroftmal);
    for (const f of Object.keys(StandardGroftmal)) {
      if (anlegg && Number.isFinite(anlegg[f])) ut[f] = anlegg[f];
    }
    for (const nivaa of [kode, strekning]) {
      if (!nivaa) continue;
      for (const f of MALFELT) if (Number.isFinite(nivaa[f])) ut[f] = nivaa[f];
    }
    return ut;
  }

  function dybdeklasse(d) {
    let k = 0;
    for (let i = 1; i < DYBDEKLASSER.length; i++) if (d >= DYBDEKLASSER[i]) k = i;
    return k;
  }

  function tomme() {
    return { gravingLos: 0, sprengning: 0, fundament: 0, omfylling: 0, gjenfylling: 0, rorvolum: 0,
      areal: 0, lengde: 0, dybdeklasser: DYBDEKLASSER.map(() => 0) };
  }

  /* Nøkkelen til en flis. y er alltid positiv i UTM; x kan være negativ. */
  const nokkel = (fi, fj) => fi * 8388608 + fj + 4194304;

  function lagSegment(a, b, ta, tb, felt) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Object.assign({ ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, L2: dx * dx + dy * dy, ta, tb }, felt);
  }

  /** Stasjonene langs et rør: hver meter og hvert målt punkt, med segmentet de ligger på. */
  function stasjoner(rr, seg) {
    const l = rr.linje, ut = [];
    for (let i = 0; i + 1 < l.xy.length; i++) {
      const j = rr.segmenter[i], sg = seg[j];
      const L = rr.s[i + 1] - rr.s[i];
      for (let d = 0; d < L - 1e-9; d += STEG) {
        const t = L > 0 ? d / L : 0;
        ut.push({ s: rr.s[i] + d, x: sg.ax + sg.dx * t, y: sg.ay + sg.dy * t, topp: sg.ta + (sg.tb - sg.ta) * t, j, t });
      }
    }
    const i = l.xy.length - 1, j = rr.segmenter[i - 1], sg = seg[j];
    ut.push({ s: rr.s[i], x: sg.bx, y: sg.by, topp: sg.tb, j, t: 1 });
    return ut;
  }

  /** Nærmeste punkt på et rør. */
  function naermest(rr, seg, x, y) {
    let best = null;
    for (const j of rr.segmenter) {
      const sg = seg[j];
      let t = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = sg.ax + sg.dx * t, py = sg.ay + sg.dy * t;
      const d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { d, x: px, y: py, j, topp: sg.ta + (sg.tb - sg.ta) * t };
    }
    return best;
  }

  /**
   * Rørene som segmenter, med målene som gjelder på hvert, og et register over
   * hvilke segmenter som kan nå hver flis.
   *
   * Et segment er strekket mellom to målte punkt. Strekningene ligger mellom
   * målte punkt, så målene er de samme langs hele segmentet.
   */
  function forbered(o) {
    const linjer = o.linjer || [];
    const koder = o.koder || {};
    const just = o.justering || {};
    const T = o.terrengZ || (() => NaN);
    const rute = o.rute > 0 ? o.rute : 0.2;
    const ror = [], seg = [];
    const utenDimensjon = new Map();
    const plass = new Map();
    // 1. rørene med dimensjon – de uten er ikke med i noe, men lengden telles
    for (const l of linjer) {
      const s = [0];
      for (let i = 1; i < l.xy.length; i++) {
        s.push(s[i - 1] + Math.hypot(l.xy[i].x - l.xy[i - 1].x, l.xy[i].y - l.xy[i - 1].y));
      }
      const k = koder[l.kode] || {};
      if (!(Number.isFinite(k.dim) && k.dim > 0)) {
        utenDimensjon.set(l.kode, (utenDimensjon.get(l.kode) || 0) + s[s.length - 1]);
        continue;
      }
      const r = ror.length;
      ror.push({ linje: l, kode: l.kode, D: k.dim / 1000, s, kodemal: k.groft || null, segmenter: [] });
      l.punkter.forEach((p, i) => plass.set(p.id, { r, i }));
    }
    // 2. strekningene: hvilke segmenter hver dekker
    const strekPaa = ror.map(rr => rr.linje.punkter.slice(1).map(() => []));
    let strekUtenTreff = 0;
    for (const st of just.strekninger || []) {
      const a = plass.get(st.fra), b = plass.get(st.til);
      if (!a || !b || a.r !== b.r || a.i === b.i) { strekUtenTreff++; continue; }
      for (let i = Math.min(a.i, b.i); i < Math.max(a.i, b.i); i++) strekPaa[a.r][i].push(st);
    }
    // 3. segmentene; hver sammenhengende «egen grøft» får sin egen gruppe
    let grupper = 1;
    ror.forEach((rr, r) => {
      const l = rr.linje;
      let forrigeEgen = false, gruppe = 0;
      for (let i = 0; i + 1 < l.xy.length; i++) {
        let strekMal = null, fjell = null, egen = false;
        for (const st of strekPaa[r][i]) {
          if (st.mal) strekMal = Object.assign(strekMal || {}, st.mal);
          if (Number.isFinite(st.fjell)) fjell = st.fjell;
          if (st.egen) egen = true;
        }
        if (egen && !forrigeEgen) gruppe = grupper++;
        if (!egen) gruppe = 0;
        forrigeEgen = egen;
        const m = malFor(o.mal, rr.kodemal, strekMal);
        rr.segmenter.push(seg.length);
        seg.push(lagSegment(l.xy[i], l.xy[i + 1], l.punkter[i].z, l.punkter[i + 1].z, {
          r, eier: r, sa: rr.s[i], sb: rr.s[i + 1], D: rr.D, w: rr.D / 2 + m.bunntillegg,
          fund: m.fundament, omf: m.omfylling, hel: m.helning, fjell, gruppe, virtuell: false
        }));
      }
    });
    /* 4. SAMMENSLÅINGENE: flat bunn mellom to rør der de går side om side.
       For hver stasjon på A trekkes en tverrstrek til nærmeste punkt på B, med
       gravebunnen lineært mellom deres. Tverrstrekene er virtuelle segmenter
       med halv bredde lik halve stasjonsavstanden – de former gropa, men har
       ingen lag selv. Massene føres på det dypeste av de to rørene. */
    let sammenUtenTreff = 0, sammenAldriNaer = 0;
    for (const par of just.sammen || []) {
      const a = plass.get(par[0]), b = plass.get(par[1]);
      if (!a || !b || a.r === b.r) { sammenUtenTreff++; continue; }
      const RA = ror[a.r], RB = ror[b.r];
      let noen = false;
      for (const q of stasjoner(RA, seg)) {
        const sA = seg[q.j];
        const nB = naermest(RB, seg, q.x, q.y);
        if (!nB || nB.d > SAMMEN_MAKS || nB.d < 0.01) continue;
        const sB = seg[nB.j];
        const zbA = q.topp - sA.D - sA.fund, zbB = nB.topp - sB.D - sB.fund;
        noen = true;
        seg.push(lagSegment({ x: q.x, y: q.y }, { x: nB.x, y: nB.y }, zbA, zbB, {
          r: -1, eier: zbA <= zbB ? a.r : b.r, sa: 0, sb: nB.d, D: 0, w: STEG / 2 + 0.01,
          fund: 0, omf: 0, hel: Math.min(sA.hel, sB.hel), fjell: null, gruppe: 0, virtuell: true
        }));
      }
      if (!noen) sammenAldriNaer++;
    }
    // 5. hvor langt hvert segment kan nå, og registeret over flisene
    const register = new Map();
    for (let j = 0; j < seg.length; j++) {
      const sg = seg[j];
      const zbA = sg.virtuell ? sg.ta : sg.ta - sg.D - sg.fund;
      const zbB = sg.virtuell ? sg.tb : sg.tb - sg.D - sg.fund;
      const TA = T(sg.ax, sg.ay), TB = T(sg.bx, sg.by);
      /* Terrenget kan stige til siden, og da når gropa lenger ut enn dybden
         ved røret tilsier. Dybden dobles før helningen ganges inn, og det hele
         kappes ved MAKS_UT. */
      const dyp = Math.max(0, Number.isFinite(TA) ? TA - zbA : 3, Number.isFinite(TB) ? TB - zbB : 3);
      const naa = Math.min(MAKS_UT, sg.w + (sg.hel > 0 ? (2 * dyp + 2) * sg.hel : 0) + rute);
      sg.x0 = Math.min(sg.ax, sg.bx) - naa; sg.x1 = Math.max(sg.ax, sg.bx) + naa;
      sg.y0 = Math.min(sg.ay, sg.by) - naa; sg.y1 = Math.max(sg.ay, sg.by) + naa;
      for (let fi = Math.floor(sg.x0 / FLIS); fi <= Math.floor(sg.x1 / FLIS); fi++) {
        for (let fj = Math.floor(sg.y0 / FLIS); fj <= Math.floor(sg.y1 / FLIS); fj++) {
          const kk = nokkel(fi, fj);
          let f = register.get(kk);
          if (!f) { f = { fi, fj, segs: [] }; register.set(kk, f); }
          f.segs.push(j);
        }
      }
    }
    return { ror, seg, register, rute, grupper, utenDimensjon, strekUtenTreff, sammenUtenTreff, sammenAldriNaer,
      terrengZ: T, sondert: o.fjellSondert || null, mal: malFor(o.mal, null, null), faktorer: o.faktorer || {} };
  }

  /**
   * Gravenivået fra ett segment i (x, y), eller Infinity der det ikke graver.
   *
   * Innenfor bunnen: gravebunnen. Utenfor stiger gropa med helningen – fra
   * fjelloverflaten der fjellet ligger over gravebunnen, så veggen står
   * loddrett i fjell. Helning 0 er loddrett hele veien: utenfor bunnen graves
   * ingenting. `ut.t` får posisjonen langs segmentet (0–1).
   */
  function grop(sg, x, y, Tq, sondert, ut) {
    let t = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
    /* En tverrstrek mellom to sammenslåtte rør graver bare mellom rørene. Med
       runde ender stakk bunnen dens 0,13 m forbi rørets egen bunn på
       yttersiden, og grøfta ble 3,4 % for stor. Utenfor er det rørenes egne
       groper som gjelder. */
    if (sg.virtuell && (t < 0 || t > 1)) return Infinity;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    ut.t = t;
    const ex = x - sg.ax - sg.dx * t, ey = y - sg.ay - sg.dy * t;
    const d = Math.sqrt(ex * ex + ey * ey);
    const topp = sg.ta + (sg.tb - sg.ta) * t;
    const zb = sg.virtuell ? topp : topp - sg.D - sg.fund;
    if (d <= sg.w) return zb;
    if (!(sg.hel > 0)) return Infinity;
    let fd = sg.fjell;
    if (fd == null) fd = sondert();
    const zf = fd == null ? -Infinity : Tq - fd;
    return (zf > zb ? zf : zb) + (d - sg.w) / sg.hel;
  }

  /** Intervallene slått sammen. */
  function forening(iv) {
    if (iv.length < 2) return iv;
    iv.sort((a, b) => a[0] - b[0]);
    const ut = [iv[0].slice()];
    for (let i = 1; i < iv.length; i++) {
      const siste = ut[ut.length - 1];
      if (iv[i][0] <= siste[1]) { if (iv[i][1] > siste[1]) siste[1] = iv[i][1]; } else ut.push(iv[i].slice());
    }
    return ut;
  }
  const lengdeAv = iv => iv.reduce((s, a) => s + a[1] - a[0], 0);
  function overlapp(A, B) {
    let s = 0;
    for (const a of A) {
      for (const c of B) {
        const lo = Math.max(a[0], c[0]), hi = Math.min(a[1], c[1]);
        if (hi > lo) s += hi - lo;
      }
    }
    return s;
  }

  /**
   * Fundament og omfylling i søylen [zg, T]. Hvert rør som graver her, får
   * lagene slik de ville vært i dets egen grøft: fundament fra gropa opp til
   * bunn rør, omfylling derfra til topp rør + omfylling. Et grunt rør i grøfta
   * til et dypt får dem der det ligger, og under det er det gjenfylling.
   * Overlapper lag fra flere rør, telles de én gang; fundamentet går foran.
   * @returns {number[]} [fundament, omfylling med røret] i meter
   */
  function lagISoyle(kand, g, zg, Tq) {
    const fund = [], omf = [];
    for (const c of kand) {
      if (c.g !== g) continue;
      const f0 = Math.max(c.z, zg), f1 = Math.min(c.bunn, Tq);
      if (f1 > f0) fund.push([f0, f1]);
      const o0 = Math.max(c.z, c.bunn, zg), o1 = Math.min(c.omfTopp, Tq);
      if (o1 > o0) omf.push([o0, o1]);
    }
    const F = forening(fund), O = forening(omf);
    const lf = lengdeAv(F);
    return [lf, lengdeAv(O) - overlapp(O, F)];
  }

  function leggTil(s, A, los, spreng, lf, lo, gjen) {
    s.gravingLos += los * A; s.sprengning += spreng * A;
    s.fundament += lf * A; s.omfylling += lo * A; s.gjenfylling += gjen * A;
  }

  /** Massene i grøfta – se spesifikasjonen, 4.1–4.6. */
  function beregn(o) {
    const M = forbered(o);
    const rute = M.rute, A = rute * rute, n = Math.round(FLIS / rute);
    const sum = tomme();
    const per = M.ror.map(() => tomme());
    const grpZ = new Float64Array(M.grupper), grpJ = new Int32Array(M.grupper);
    const kand = [];
    const ut = { t: 0 };
    const ingen = () => null;
    let manglerTerreng = 0;
    for (const fl of M.register.values()) {
      const segs = fl.segs;
      for (let a = 0; a < n; a++) {
        const x = fl.fi * FLIS + (a + 0.5) * rute;
        for (let c = 0; c < n; c++) {
          const y = fl.fj * FLIS + (c + 0.5) * rute;
          const Tq = M.terrengZ(x, y);
          if (!Number.isFinite(Tq)) {
            // hull i terrenget: telles der det ligger en grøftebunn
            for (const j of segs) {
              const sg = M.seg[j];
              if (x < sg.x0 || x > sg.x1 || y < sg.y0 || y > sg.y1) continue;
              if (Number.isFinite(grop(sg, x, y, Infinity, ingen, ut))) { manglerTerreng += A; break; }
            }
            continue;
          }
          let sond;
          const sondert = () => (sond === undefined ? (sond = M.sondert ? M.sondert(x, y) : null) : sond);
          grpZ.fill(Infinity);
          kand.length = 0;
          for (const j of segs) {
            const sg = M.seg[j];
            if (x < sg.x0 || x > sg.x1 || y < sg.y0 || y > sg.y1) continue;
            const z = grop(sg, x, y, Tq, sondert, ut);
            if (!(z < Tq)) continue;
            if (z < grpZ[sg.gruppe]) { grpZ[sg.gruppe] = z; grpJ[sg.gruppe] = j; }
            if (!sg.virtuell) {
              const topp = sg.ta + (sg.tb - sg.ta) * ut.t;
              kand.push({ g: sg.gruppe, z, bunn: topp - sg.D, omfTopp: topp + sg.omf });
            }
          }
          let gravd = false;
          for (let g = 0; g < M.grupper; g++) {
            const zg = grpZ[g];
            if (!(zg < Tq)) continue;
            gravd = true;
            const sg = M.seg[grpJ[g]];
            const dybde = Tq - zg;
            let fd = sg.fjell;
            if (fd == null) fd = sondert();
            const zf = fd == null ? -Infinity : Tq - fd;
            const spreng = zf > zg ? Math.min(Tq, zf) - zg : 0;
            const [lf, lo] = lagISoyle(kand, g, zg, Tq);
            const gjen = Math.max(0, dybde - lf - lo);
            leggTil(sum, A, dybde - spreng, spreng, lf, lo, gjen);
            leggTil(per[sg.eier], A, dybde - spreng, spreng, lf, lo, gjen);
            per[sg.eier].areal += A;
          }
          if (gravd) sum.areal += A;
        }
      }
    }
    const perLinje = new Map(M.ror.map((rr, r) => [rr.linje.id, per[r]]));
    return { sum, perLinje, manglerTerreng,
      utenDimensjon: [...M.utenDimensjon].map(([kode, l]) => ({ kode, lengde: l })), modell: M };
  }

  return { StandardGroftmal, MALFELT, GRENSER, SAMMEN_MAKS, DYBDEKLASSER,
    nyGroft, klem, malFor, dybdeklasse, forbered, beregn };
})();

if (typeof module !== 'undefined') module.exports = Groft;
