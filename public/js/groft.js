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
  /** To nivå nærmere enn dette er like (m) – avrundingsstøyen i UTM er langt under. */
  const LIK = 1e-6;
  /** Et annet rør går langs dette når vinkelen mellom dem er under 30°. */
  const LANGS = Math.cos(Math.PI / 6);

  function nyGroft() { return { strekninger: [], sammen: [] }; }

  /**
   * Et tall innenfor grensene for feltet, eller null. Tekst med komma godtas.
   * Under null er en skrivefeil, ikke null: «fjell −0,5» ble fjell i dagen.
   */
  function klem(felt, v) {
    const x = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.trim().replace(',', '.'))) : v;
    if (typeof x !== 'number' || !Number.isFinite(x) || !GRENSER[felt]) return null;
    if (x < GRENSER[felt][0]) return null;
    return Math.min(GRENSER[felt][1], x);
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

  /**
   * Nærmeste punkt på et rør. `forbi` sier at punktet ligger forbi en av
   * endene – der går ikke røret langs noe, det slutter bare i nærheten.
   * Segment uten lengde hoppes over; naboen har det samme punktet.
   */
  function naermest(rr, seg, x, y) {
    const S = rr.segmenter, n = S.length;
    let forste = 0, siste = n - 1;
    while (forste < siste && !(seg[S[forste]].L2 > 0)) forste++;
    while (siste > forste && !(seg[S[siste]].L2 > 0)) siste--;
    let best = null;
    for (let i = forste; i <= siste; i++) {
      const j = S[i], sg = seg[j];
      if (!(sg.L2 > 0) && forste !== siste) continue;
      const t0 = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
      const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
      const px = sg.ax + sg.dx * t, py = sg.ay + sg.dy * t;
      const d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) {
        // en millimeter å gå på: rør som begynner side om side, skal ikke være «forbi» på støyen
        const L = Math.sqrt(sg.L2);
        best = { d, x: px, y: py, j, topp: sg.ta + (sg.tb - sg.ta) * t,
          forbi: (i === forste && t0 * L < -1e-3) || (i === siste && (t0 - 1) * L > 1e-3) };
      }
    }
    return best;
  }

  /** Avstanden fra et punkt til et segment. */
  function avstandTil(sg, x, y) {
    let t = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(x - sg.ax - sg.dx * t, y - sg.ay - sg.dy * t);
  }

  /** Enhetsvektoren langs røret for hvert segment; et segment uten lengde låner naboens. */
  function retninger(rr, seg) {
    const ut = rr.segmenter.map(j => {
      const sg = seg[j], L = Math.sqrt(sg.L2);
      return L > 0 ? { x: sg.dx / L, y: sg.dy / L } : null;
    });
    for (let i = 1; i < ut.length; i++) if (!ut[i]) ut[i] = ut[i - 1];
    for (let i = ut.length - 2; i >= 0; i--) if (!ut[i]) ut[i] = ut[i + 1];
    return ut.map(u => u || { x: 1, y: 0 });
  }

  /** Det dypeste av to rør; likt – det som står først, så svaret ikke avhenger av klikkrekkefølgen. */
  const dypest = (r1, z1, r2, z2) => (z1 < z2 - LIK ? r1 : z2 < z1 - LIK ? r2 : Math.min(r1, r2));

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
    /* Rutene må gå opp i flisene: en rute som ikke deler 5 m, la seg over
       kanten til neste flis eller lot en stripe stå urørt. */
    const rute = FLIS / Math.max(1, Math.round(FLIS / (o.rute > 0 ? o.rute : 0.2)));
    const ror = [], seg = [];
    const utenDimensjon = new Map();
    /* Punkt-id → rørene punktet står i. Et knutepunkt er med i alle rørene som
       møtes der. Her sto bare det siste, og en strekning eller en felles grøft
       som begynte i knutepunktet, havnet på feil rør – eller på ingen. */
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
      l.punkter.forEach((p, i) => {
        const v = plass.get(p.id);
        if (v) v.push({ r, i }); else plass.set(p.id, [{ r, i }]);
      });
    }
    // 2. strekningene: røret som har begge punktene, og segmentene mellom dem
    const strekPaa = ror.map(rr => rr.linje.punkter.slice(1).map(() => []));
    let strekUtenTreff = 0;
    for (const st of just.strekninger || []) {
      let a = null, b = null;
      for (const pa of plass.get(st.fra) || []) {
        const pb = (plass.get(st.til) || []).find(x => x.r === pa.r && x.i !== pa.i);
        if (pb) { a = pa; b = pb; break; }
      }
      if (!a) { strekUtenTreff++; continue; }
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
          r, i, eier: r, sa: rr.s[i], sb: rr.s[i + 1], D: rr.D, w: rr.D / 2 + m.bunntillegg,
          fund: m.fundament, omf: m.omfylling, hel: m.helning, fjell, gruppe, virtuell: false
        }));
      }
      rr.retning = retninger(rr, seg);
      /* Terrenget i punktene, til anslaget der det mangler. Et hull kan dekke
         hele segment, og da finnes det ingen ende å regne fra – hullet fylles
         lineært langs røret mellom terrenget på hver side av det. */
      const Tp = l.xy.map(q => T(q.x, q.y));
      const Tv = Tp.map((v, i) => {
        if (Number.isFinite(v)) return v;
        let a = i - 1, c = i + 1;
        while (a >= 0 && !Number.isFinite(Tp[a])) a--;
        while (c < Tp.length && !Number.isFinite(Tp[c])) c++;
        if (a >= 0 && c < Tp.length) return Tp[a] + (Tp[c] - Tp[a]) * (rr.s[i] - rr.s[a]) / ((rr.s[c] - rr.s[a]) || 1);
        return a >= 0 ? Tp[a] : c < Tp.length ? Tp[c] : NaN;
      });
      rr.segmenter.forEach((j, i) => { seg[j].TA = Tv[i]; seg[j].TB = Tv[i + 1]; });
    });
    /* 4. SAMMENSLÅINGENE: flat bunn mellom to rør der de går side om side.
       Fra hver stasjon på det ene røret trekkes en tverrstrek til nærmeste
       punkt på det andre, med gravebunnen lineært mellom dem – fra begge
       rørene, så det ikke betyr noe hvilket som ble klikket først (det ga
       783 eller 762 m³). Forbi enden av det andre røret trekkes ingen strek:
       der gikk alle strekene til endepunktet, og bunnen ble flat i en vifte
       som ikke finnes. Strekene er virtuelle segmenter med halv bredde lik
       halve stasjonsavstanden – de former gropa, men har ingen lag selv.
       Massene føres på det dypeste røret, og fjellet som er markert på rørene,
       gjelder også mellom dem. */
    let sammenUtenTreff = 0, sammenAldriNaer = 0;
    const sammenMed = ror.map(() => []);
    for (const par of just.sammen || []) {
      // et knutepunkt hører til flere rør: ta de to som ligger nærmest hverandre
      let valgt = null, best = Infinity;
      for (const a of plass.get(par[0]) || []) {
        for (const b of plass.get(par[1]) || []) {
          if (a.r === b.r) continue;
          const pa = ror[a.r].linje.xy[a.i], pb = ror[b.r].linje.xy[b.i];
          const na = naermest(ror[a.r], seg, pb.x, pb.y), nb = naermest(ror[b.r], seg, pa.x, pa.y);
          const d = (na ? na.d : Infinity) + (nb ? nb.d : Infinity);
          if (!valgt || d < best) { valgt = [a.r, b.r]; best = d; }
        }
      }
      if (!valgt) { sammenUtenTreff++; continue; }
      sammenMed[valgt[0]].push(valgt[1]);
      sammenMed[valgt[1]].push(valgt[0]);
      let noen = false;
      for (const [r1, r2] of [valgt, [valgt[1], valgt[0]]]) {
        for (const q of stasjoner(ror[r1], seg)) {
          const s1 = seg[q.j];
          const n2 = naermest(ror[r2], seg, q.x, q.y);
          if (!n2 || n2.forbi || n2.d > SAMMEN_MAKS || n2.d < 0.01) continue;
          const s2 = seg[n2.j];
          const zb1 = q.topp - s1.D - s1.fund, zb2 = n2.topp - s2.D - s2.fund;
          const f1 = s1.fjell, f2 = s2.fjell;
          noen = true;
          seg.push(lagSegment({ x: q.x, y: q.y }, { x: n2.x, y: n2.y }, zb1, zb2, {
            r: -1, i: -1, ra: r1, rb: r2, eier: dypest(r1, zb1, r2, zb2), sa: 0, sb: n2.d, D: 0,
            w: STEG / 2 + 0.01, fund: 0, omf: 0, hel: Math.min(s1.hel, s2.hel),
            fjell: f1 != null && f2 != null ? (f1 + f2) / 2 : (f1 != null ? f1 : f2), gruppe: 0, virtuell: true
          }));
        }
      }
      if (!noen) sammenAldriNaer++;
    }
    // 5. hvor langt hvert segment kan nå, og registeret over flisene
    let kappet = 0;
    const register = new Map();
    for (let j = 0; j < seg.length; j++) {
      const sg = seg[j];
      sg.zbA = sg.virtuell ? sg.ta : sg.ta - sg.D - sg.fund;
      sg.zbB = sg.virtuell ? sg.tb : sg.tb - sg.D - sg.fund;
      if (sg.virtuell) { sg.TA = T(sg.ax, sg.ay); sg.TB = T(sg.bx, sg.by); }
      let naa = sg.w;
      if (sg.hel > 0) {
        /* SIDETERRENGET AVGJØR HVOR LANGT GROPA NÅR. Stiger terrenget til
           siden, møter skråningen det langt ute – i en li på 35° og med 1:1
           over tre ganger så langt som på flat mark. Her sto et overslag fra
           dybden ved røret, og i lia ble grøfta kappet uten et ord: 2–13 % for
           lite. Nå gås det ut fra linja på begge sider, annenhver meter langs
           segmentet, til veggen fra gravebunnen når terrenget. */
        const L = Math.sqrt(sg.L2);
        const ux = L > 0 ? sg.dx / L : 1, uy = L > 0 ? sg.dy / L : 0;
        const antall = Math.max(1, Math.ceil(L / 2));
        let lengst = 0, ute = false;
        for (let k = 0; k <= antall; k++) {
          const t = k / antall;
          const px = sg.ax + sg.dx * t, py = sg.ay + sg.dy * t, zb = sg.zbA + (sg.zbB - sg.zbA) * t;
          const Tm = anslagVed(sg, t);
          for (const side of [1, -1]) {
            let d = sg.w;
            for (; d < MAKS_UT; d += 0.5) {
              // i et hull: terrenget anslått langs røret, så hullet også får sin bredde
              let Tz = T(px - uy * d * side, py + ux * d * side);
              if (!Number.isFinite(Tz)) Tz = Tm;
              if (!Number.isFinite(Tz) || zb + (d - sg.w) / sg.hel >= Tz) break;
            }
            if (d >= MAKS_UT) ute = true;
            if (d > lengst) lengst = d;
          }
        }
        // litt ekstra: terrenget mellom prøvene kan stige mer
        naa = Math.min(MAKS_UT, lengst * 1.15 + 1);
        if (ute && !sg.virtuell) kappet += L;
      }
      sg.naa = naa + rute;
      sg.x0 = Math.min(sg.ax, sg.bx) - sg.naa; sg.x1 = Math.max(sg.ax, sg.bx) + sg.naa;
      sg.y0 = Math.min(sg.ay, sg.by) - sg.naa; sg.y1 = Math.max(sg.ay, sg.by) + sg.naa;
      for (let fi = Math.floor(sg.x0 / FLIS); fi <= Math.floor(sg.x1 / FLIS); fi++) {
        for (let fj = Math.floor(sg.y0 / FLIS); fj <= Math.floor(sg.y1 / FLIS); fj++) {
          const kk = nokkel(fi, fj);
          let f = register.get(kk);
          if (!f) { f = { fi, fj, segs: [] }; register.set(kk, f); }
          f.segs.push(j);
        }
      }
    }
    /* 6. DER RØRET GÅR INN I ELLER UT AV EN «EGEN GRØFT», fortsetter grøfta.
       Gruppene regnes hver for seg, og uten noe mer fikk begge gruppene sin
       runde ende der, den ene oppå den andre: 22 m³ for mye for en strekning
       midt på et rør. Gropene kuttes langs halveringslinja for knekken i
       punktet, så de to delene møtes uten å overlappe – alle segmentene som
       kan nå punktet, ikke bare de to som møtes. */
    for (const rr of ror) {
      const S = rr.segmenter;
      for (let i = 1; i < S.length; i++) {
        const s1 = seg[S[i - 1]], s2 = seg[S[i]];
        if (s1.gruppe === s2.gruppe) continue;
        const u1 = rr.retning[i - 1], u2 = rr.retning[i];
        let nx = u1.x + u2.x, ny = u1.y + u2.y;
        const nl = Math.hypot(nx, ny);
        if (nl < 1e-9) { nx = u1.x; ny = u1.y; } else { nx /= nl; ny /= nl; }
        const kutt = { x: nx, y: ny, px: s2.ax, py: s2.ay };
        for (let k = i - 1; k >= 0 && seg[S[k]].gruppe === s1.gruppe; k--) {
          if (avstandTil(seg[S[k]], kutt.px, kutt.py) > seg[S[k]].naa) break;
          seg[S[k]].kuttB = kutt;
        }
        for (let k = i; k < S.length && seg[S[k]].gruppe === s2.gruppe; k++) {
          if (avstandTil(seg[S[k]], kutt.px, kutt.py) > seg[S[k]].naa) break;
          seg[S[k]].kuttA = kutt;
        }
      }
    }
    /* Sonderingene slås opp for hver rute og hvert steg ut mot kanten, og hvert
       oppslag går gjennom alle sonderingene: med 300 av dem tok grøfta 3 s.
       Dybden endrer seg lite over en meter, så den slås opp én gang per meter. */
    let sondert = null;
    if (o.fjellSondert) {
      const lager = new Map(), f = o.fjellSondert;
      sondert = (x, y) => {
        const i = Math.round(x), k = Math.round(y);
        const n = (i + 4194304) * 16777216 + (k + 8388608);
        let v = lager.get(n);
        if (v === undefined) { v = f(i, k); lager.set(n, v); }
        return v;
      };
    }
    return { ror, seg, register, rute, grupper, utenDimensjon, strekUtenTreff, sammenUtenTreff, sammenAldriNaer, kappet,
      sammenMed, terrengZ: T, sondert, mal: malFor(o.mal, null, null), faktorer: o.faktorer || {} };
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
    // kuttet der røret går over i en annen gruppe – se steg 6 i `forbered`
    if (sg.kuttA && (x - sg.kuttA.px) * sg.kuttA.x + (y - sg.kuttA.py) * sg.kuttA.y < 0) return Infinity;
    if (sg.kuttB && (x - sg.kuttB.px) * sg.kuttB.x + (y - sg.kuttB.py) * sg.kuttB.y > 0) return Infinity;
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

  /**
   * Den dypeste gropa i et punkt, i én gruppe – eller i alle (-1). Likt
   * innenfor avrundingsstøyen går røret `foran` først, så eieren ikke
   * avgjøres av sjuende desimal.
   */
  function iPunkt(M, x, y, Tq, gruppe, foran = -1) {
    const fl = M.register.get(nokkel(Math.floor(x / FLIS), Math.floor(y / FLIS)));
    if (!fl) return null;
    let sond;
    const sondert = () => (sond === undefined ? (sond = M.sondert ? M.sondert(x, y) : null) : sond);
    const ut = { t: 0 };
    let best = null;
    for (const j of fl.segs) {
      const sg = M.seg[j];
      if (gruppe >= 0 && sg.gruppe !== gruppe) continue;
      if (x < sg.x0 || x > sg.x1 || y < sg.y0 || y > sg.y1) continue;
      const z = grop(sg, x, y, Tq, sondert, ut);
      if (!(z < Tq)) continue;
      if (!best || z < best.z - LIK
        || (z <= best.z + LIK && foran >= 0 && sg.r === foran && M.seg[best.j].r !== foran)) best = { z, j };
    }
    return best;
  }

  /**
   * Hvilket rør en meter grøft telles på.
   *
   * ÉN GRØFT, ÉN LENGDE. Ligger røret inne i grøfta til et annet rør som går
   * langs det, telles meteren bare på det dypeste av dem – er de like dype,
   * på det som står først. «Inne i grøfta» er at gropa til det andre røret,
   * eller en felles grøft mellom dem, når ned under terrenget der dette røret
   * ligger. Et rør som krysser eller greiner av, går ikke langs, og beholder
   * meterne sine; det gjør også et rør forbi enden av det andre.
   *
   * Her sto «røret med den laveste gropa der røret ligger». Ved en felles
   * grøft er det nøyaktig likt mellom røret og tverrstreken fra det, og
   * avrundingsstøyen avgjorde om meteren ble talt: 60 eller 70 av 100 m, alt
   * etter koordinatene. To like rør tett i tett fikk hver sin lengde.
   */
  function meterEier(M, r, q, sg, Tq) {
    const fl = M.register.get(nokkel(Math.floor(q.x / FLIS), Math.floor(q.y / FLIS)));
    let sond;
    const sondert = () => (sond === undefined ? (sond = M.sondert ? M.sondert(q.x, q.y) : null) : sond);
    const ut = { t: 0 };
    /* Kandidatene: rørene som er slått sammen med dette (der de går side om
       side, er det én grøft – akkurat der tverrstrekene trekkes), og rørene
       der gropa når ned under terrenget her. */
    const sammen = new Set(M.sammenMed[r]);
    const naar = new Set();
    for (const j of fl ? fl.segs : []) {
      const s2 = M.seg[j];
      if (s2.virtuell || s2.r === r || s2.gruppe !== sg.gruppe || sammen.has(s2.r) || naar.has(s2.r)) continue;
      if (q.x < s2.x0 || q.x > s2.x1 || q.y < s2.y0 || q.y > s2.y1) continue;
      if (grop(s2, q.x, q.y, Tq, sondert, ut) < Tq) naar.add(s2.r);
    }
    const u = M.ror[r].retning[sg.i];
    let best = r, bestZ = q.topp - sg.D - sg.fund;
    for (const r2 of [...sammen, ...naar]) {
      const n = naermest(M.ror[r2], M.seg, q.x, q.y);
      if (!n || n.forbi) continue;
      const s2 = M.seg[n.j];
      if (s2.gruppe !== sg.gruppe) continue;
      if (sammen.has(r2)) {
        if (n.d > SAMMEN_MAKS) continue;
      } else {
        const u2 = M.ror[r2].retning[s2.i];
        if (Math.abs(u.x * u2.x + u.y * u2.y) < LANGS) continue;
      }
      const z2 = n.topp - s2.D - s2.fund;
      if (z2 < bestZ - LIK || (z2 <= bestZ + LIK && r2 < best)) { best = r2; bestZ = z2; }
    }
    return best;
  }

  /**
   * Terrenget der det mangler, i posisjonen t langs segmentet: lineært mellom
   * endene (fylt langs røret i `forbered`) – eller NaN om røret ikke har noe.
   */
  function anslagVed(sg, t) {
    const a = sg.TA, b = sg.TB;
    if (Number.isFinite(a) && Number.isFinite(b)) return a + (b - a) * t;
    return Number.isFinite(a) ? a : Number.isFinite(b) ? b : NaN;
  }

  /** Det samme i et punkt; uten noe terreng i det hele tatt telles bare bunnen. */
  function anslag(sg, x, y) {
    let t = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const v = anslagVed(sg, t);
    return Number.isFinite(v) ? v : sg.zbA + (sg.zbB - sg.zbA) * t + 0.01;
  }

  /** Gravenivået i et punkt – den dypeste av alle gropene – eller NaN der det ikke graves. */
  function nivaa(M, x, y) {
    const Tq = M.terrengZ(x, y);
    if (!Number.isFinite(Tq)) return NaN;
    const p = iPunkt(M, x, y, Tq, -1);
    return p ? p.z : NaN;
  }

  /** Grøftekanten: der gravingen møter terrenget, på begge sider av hvert rør. */
  function kanter(M) {
    const ut = [];
    for (const rr of M.ror) {
      const sider = [[], []];
      const avslutt = k => { if (sider[k].length > 1) ut.push(sider[k]); sider[k] = []; };
      for (const q of stasjoner(rr, M.seg)) {
        const Tq = M.terrengZ(q.x, q.y);
        if (!Number.isFinite(Tq) || !iPunkt(M, q.x, q.y, Tq, -1)) { avslutt(0); avslutt(1); continue; }
        // retningen fra røret, ikke fra segmentet: et segment uten lengde har ingen
        const sg = M.seg[q.j], u = rr.retning[sg.i];
        const nx = -u.y, ny = u.x;
        for (let k = 0; k < 2; k++) {
          const side = k ? -1 : 1;
          let kant = null;
          for (let d = sg.w; d <= MAKS_UT; d += 0.1) {
            const x = q.x + nx * d * side, y = q.y + ny * d * side;
            const Tk = M.terrengZ(x, y);
            if (!Number.isFinite(Tk) || !iPunkt(M, x, y, Tk, -1)) { kant = { x, y }; break; }
          }
          if (kant) sider[k].push(kant); else avslutt(k);
        }
      }
      avslutt(0); avslutt(1);
    }
    return ut;
  }

  /** Hva som kjøres bort og hva som kjøpes – med prosjektets faktorer, som veg og tomt. */
  function balanse(sum, mal, faktorer) {
    const fk = Object.assign({ sprengningsfaktor: 1.5, losmasseIFylling: 0.95 }, faktorer || {});
    const brukbar = mal && Number.isFinite(mal.brukbar) ? mal.brukbar : 1;
    const tilgjengelig = sum.gravingLos * brukbar * fk.losmasseIFylling;
    const fraGraving = Math.min(tilgjengelig, sum.gjenfylling);
    return {
      gjenfyllingFraGraving: fraGraving,
      overskuddLos: Math.max(0, sum.gravingLos - (fk.losmasseIFylling > 0 ? fraGraving / fk.losmasseIFylling : 0)),
      sprengtFast: sum.sprengning,
      sprengtLos: sum.sprengning * fk.sprengningsfaktor,
      kjopFundament: sum.fundament,
      kjopOmfylling: sum.omfylling,
      kjopGjenfylling: Math.max(0, sum.gjenfylling - fraGraving)
    };
  }

  function leggTil(s, A, los, spreng, lf, lo, gjen) {
    s.gravingLos += los * A; s.sprengning += spreng * A;
    s.fundament += lf * A; s.omfylling += lo * A; s.gjenfylling += gjen * A;
  }

  /**
   * Massene i grøfta – se spesifikasjonen, 4.1–4.6. `o.bakkefaktor` gjør
   * UTM-målene om til mål på bakken; profilenes `s` står i UTM, som rørenes.
   */
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
            /* Hull i terrenget: telles der grøfta ville gått, med terrenget
               anslått fra endene av segmentet. Her ble det regnet med et
               uendelig høyt terreng, og hele søkeboksen ble «grøft» – et hull
               fem meter ved siden av grøfta ga 20 m² i merknaden. */
            for (const j of segs) {
              const sg = M.seg[j];
              if (x < sg.x0 || x > sg.x1 || y < sg.y0 || y > sg.y1) continue;
              const Te = anslag(sg, x, y);
              if (grop(sg, x, y, Te, ingen, ut) < Te) { manglerTerreng += A; break; }
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
    /* BAKKEN, IKKE KARTPLANET. Lengden langs røret er målt i UTM, og
       bakkefaktoren gjør den om til lengden på bakken. Tverrsnittet er lagt
       ut i virkelige meter – det er malen – så volumene og flatene ganges med
       faktoren én gang, som vegens. Med kvadratet, som for en tomt der begge
       retningene er kartmål, ble de faktoren for store. */
    const bf = o.bakkefaktor || 1;
    for (const p of [sum, ...per]) {
      for (const fe of ['gravingLos', 'sprengning', 'fundament', 'omfylling', 'gjenfylling', 'areal']) p[fe] *= bf;
    }
    manglerTerreng *= bf;
    /* LANGS RØRENE: løpemeter, dybdeklasser, røret og profilen.
       En meter telles der det graves, på røret `meterEier` peker ut – så en
       felles grøft bare har én lengde, på det dypeste røret. En «egen grøft»
       er sin egen og telles alltid. Røret trekkes fra omfyllingen der det
       ligger, og føres på røret som eier rutene rundt. */
    const profiler = new Map();
    const overTerreng = M.ror.map(() => 0);
    let fjellStrek = 0, fjellSond = 0;
    M.ror.forEach((rr, r) => {
      const pr = [];
      const st = stasjoner(rr, M.seg);
      for (let k = 0; k < st.length; k++) {
        const q = st[k], sg = M.seg[q.j];
        const bredde = (k + 1 < st.length ? st[k + 1].s - q.s : 0) * bf;
        const Tq = M.terrengZ(q.x, q.y);
        const bunn = q.topp - rr.D;
        const rad = { s: q.s, terreng: Tq, gravebunn: NaN, fundamentBunn: bunn - sg.fund, fundamentTopp: bunn,
          omfyllingTopp: q.topp + sg.omf, fjell: null };
        pr.push(rad);
        if (!Number.isFinite(Tq)) continue;
        /* ÉN REGEL: graves det her? Her sto «toppen over terrenget – ingen
           grøft», mens rutene gravde under et rør som stakk 5 cm opp: 77 m³
           graving, men ingen løpemeter og ingen rør trukket fra. */
        if (q.topp > Tq) overTerreng[r] += bredde;
        const p = iPunkt(M, q.x, q.y, Tq, sg.gruppe, r);
        if (!p) continue;
        rad.gravebunn = p.z;
        let fd = sg.fjell;
        const fraStrek = fd != null;
        if (fd == null && M.sondert) fd = M.sondert(q.x, q.y);
        if (fd != null) rad.fjell = Tq - fd;
        /* Hvem meteren hører til, avgjøres midt i den. Et rør som begynner der
           et annet slutter – i et knutepunkt – er likt med det i selve punktet,
           og mistet sin første meter til et rør som ikke dekker den. */
        const neste = st[k + 1];
        const midt = neste ? { x: (q.x + neste.x) / 2, y: (q.y + neste.y) / 2, topp: (q.topp + neste.topp) / 2 } : q;
        const Tm = neste ? M.terrengZ(midt.x, midt.y) : Tq;
        if (bredde > 0 && (sg.gruppe !== 0 || meterEier(M, r, midt, sg, Number.isFinite(Tm) ? Tm : Tq) === r)) {
          per[r].lengde += bredde;
          per[r].dybdeklasser[dybdeklasse(Tq - p.z)] += bredde;
          if (rad.fjell != null && rad.fjell > p.z) { if (fraStrek) fjellStrek += bredde; else fjellSond += bredde; }
        }
        if (bunn < Tq) {
          // bare den delen av røret som ligger under terrenget – lagene er kappet der
          const v = Math.PI * rr.D * rr.D / 4 * bredde * Math.min(1, (Tq - bunn) / rr.D);
          const eier = M.seg[p.j].eier;
          per[r].rorvolum += v; sum.rorvolum += v;
          per[eier].omfylling -= v; sum.omfylling -= v;
        }
      }
      profiler.set(rr.linje.id, pr);
    });
    for (const p of per) {
      sum.lengde += p.lengde;
      p.dybdeklasser.forEach((v, i) => { sum.dybdeklasser[i] += v; });
    }
    const perKode = new Map();
    M.ror.forEach((rr, r) => {
      if (!perKode.has(rr.kode)) perKode.set(rr.kode, tomme());
      const kk = perKode.get(rr.kode), p = per[r];
      for (const fe of ['gravingLos', 'sprengning', 'fundament', 'omfylling', 'gjenfylling', 'rorvolum', 'areal', 'lengde']) {
        kk[fe] += p[fe];
      }
      p.dybdeklasser.forEach((v, i) => { kk.dybdeklasser[i] += v; });
    });
    // merknadene – tallene med komma, som resten av programmet
    const m = v => v.toFixed(v < 10 ? 1 : 0).replace('.', ',');
    const flertall = (n, en, fl) => `${n} ${n === 1 ? en : fl}`;
    const merknader = [];
    for (const [kode, l] of M.utenDimensjon) {
      merknader.push({ type: 'dimensjon',
        tekst: `${kode}: ${m(l * bf)} m rør uten dimensjon – ingen grøft. Sett dimensjonen i Koder-fanen.` });
    }
    if (manglerTerreng > 0.5) {
      merknader.push({ type: 'hull',
        tekst: `Terrengdata mangler for ${m(manglerTerreng)} m² av grøfta – de rutene er ikke med i massene.` });
    }
    M.ror.forEach((rr, r) => {
      if (overTerreng[r] > 0.5) {
        merknader.push({ type: 'over', linje: rr.linje.id,
          tekst: `${rr.kode}: røret ligger helt eller delvis over terrenget på ${m(overTerreng[r])} m – `
            + 'grøfta regnes bare under terrenget.' });
      }
    });
    if (M.kappet > 0.5) {
      merknader.push({ type: 'kappet', tekst: `Sideterrenget er brattere enn skråningen på ${m(M.kappet * bf)} m av `
        + `grøfta – gropa er kappet ${MAKS_UT} m fra røret, og massene der er for små.` });
    }
    if (M.strekUtenTreff) {
      merknader.push({ type: 'justering', tekst: `${flertall(M.strekUtenTreff, 'strekning', 'strekninger')} `
        + 'finner ikke punktene sine lenger – se Justeringer.' });
    }
    if (M.sammenUtenTreff) {
      merknader.push({ type: 'justering', tekst: `${flertall(M.sammenUtenTreff, 'sammenslåing', 'sammenslåinger')} `
        + 'finner ikke rørene sine lenger – se Justeringer.' });
    }
    if (M.sammenAldriNaer) {
      merknader.push({ type: 'justering', tekst: `${flertall(M.sammenAldriNaer, 'sammenslåing', 'sammenslåinger')} `
        + `gjelder rør som aldri er innen ${SAMMEN_MAKS} m av hverandre.` });
    }
    merknader.push({ type: 'fjell', tekst: fjellStrek + fjellSond > 0.5
      ? `Fjell i grøfta på ${m(fjellStrek)} m fra strekninger og ${m(fjellSond)} m fra sonderinger. `
        + 'Resten er regnet som løsmasse.'
      : 'Ingen fjell er markert eller sondert langs grøfta – alt er regnet som løsmasse.' });
    const dybdeklasser = DYBDEKLASSER.map((fra, i) => ({ fra,
      til: i + 1 < DYBDEKLASSER.length ? DYBDEKLASSER[i + 1] : Infinity, lengde: sum.dybdeklasser[i] }));
    return {
      sum, perLinje: new Map(M.ror.map((rr, r) => [rr.linje.id, per[r]])), perKode, dybdeklasser,
      balanse: balanse(sum, M.mal, M.faktorer), profiler,
      utenDimensjon: [...M.utenDimensjon].map(([kode, l]) => ({ kode, lengde: l * bf })),
      merknader, manglerTerreng, modell: M
    };
  }

  return { StandardGroftmal, MALFELT, GRENSER, SAMMEN_MAKS, DYBDEKLASSER,
    nyGroft, klem, malFor, dybdeklasse, forbered, beregn, balanse, nivaa, kanter };
})();

if (typeof module !== 'undefined') module.exports = Groft;
