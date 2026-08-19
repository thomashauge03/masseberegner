'use strict';
/**
 * Masseberegning.
 *
 * For hvert profilnummer bygges tverrprofilet opp av:
 *
 *      slitelag + baerelag  (overbygning)
 *   ---------------------------------------  ferdig vegnivå (lengdeprofilen)
 *      planum                                 = vegnivå - overbygning
 *      grøft pa skjæringssiden
 *      skjæringsskraning opp til terreng      (slakere i løsmasse, brattere i fjell)
 *      fyllingsskraning ned til terreng
 *
 * Skjæring og fylling regnes mellom terrenget (etter rensk) og planum-/
 * skraningsflaten. Volumene summeres med gjennomsnittlig endeareal.
 *
 * I kurver blir det mer masse pa yttersiden enn pa innsiden. Det tas hensyn
 * til ved a vekte hver arealstripe med (1 + t * krumning) - Pappus' regel -
 * slik at volumet blir riktig ogsa i krappe kurver.
 */

const StandardMal = {
  vegbredde: 4.5,             // kjørebredde inkl. skulder, meter
  tverrfall: 0.06,            // 6 %
  tverrfallType: 'tak',       // 'tak' (tosidig) eller 'ensidig'
  tverrfallRetning: 1,        // ved ensidig: 1 = fall mot høyre
  slitelagTykkelse: 0.10,
  slitelagBredde: 4.0,
  baerelagTykkelse: 0.60,
  grofteDybde: 0.80,          // under vegkant
  grofteBunn: 0.50,
  grofteInnerHelning: 1.0,    // H:V fra vegkant ned i grøfta
  skjaeringLosmasse: 1.5,     // H:V
  skjaeringFjell: 0.2,        // H:V (5:1)
  fylling: 1.5,               // H:V
  renskDybde: 0.20,
  renskUtenfor: 1.0,
  maksSokebredde: 45,
  // Breddeutvidelse i kurver: [radius, utvidelse]
  breddeutvidelse: [[10, 1.5], [15, 1.0], [20, 0.7], [30, 0.25], [40, 0.10], [60, 0]],
  utvidelseOvergang: 15,
  // Maks stigning avhengig av kurveradius (veiklasse 5)
  maksStigning: [[10, 0.12], [30, 0.17], [60, 0.20], [1e9, 0.20]]
};

const StandardFaktorer = {
  sprengningsfaktor: 1.50,      // fast fjell -> løst pa lass
  fjellIFylling: 1.30,          // fast fjell -> ferdig komprimert fyllingsvolum
  losmasseIFylling: 0.95,       // fast løsmasse -> ferdig komprimert fyllingsvolum
  brukbarLosmasse: 0.50         // andel av løsmasseskjæring som kan brukes i fylling
};

/* ------------------------------------------------------------------ *
 *  Fjellmodell - hvor dypt ned til fast fjell
 * ------------------------------------------------------------------ */

class Fjellmodell {
  /**
   * @param {object} o
   *   standarddybde  meter løsmasse over fjell nar ingenting annet er kjent
   *   strekninger    [{fra, til, dybde}] langs profilnummer
   *   punkter        [{x, y, dybde}] fra sondering, prøvegrop eller fjellsyning
   *   rekkevidde     hvor langt en observasjon far virke (meter)
   */
  constructor(o = {}) {
    this.standarddybde = o.standarddybde == null ? 0.5 : o.standarddybde;
    this.strekninger = o.strekninger || [];
    this.punkter = o.punkter || [];
    this.rekkevidde = o.rekkevidde || 60;
  }

  dybde(x, y, s) {
    if (this.punkter.length) {
      let sumV = 0, sumW = 0, naermest = Infinity;
      for (const p of this.punkter) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < naermest) naermest = d;
        if (d > this.rekkevidde) continue;
        if (d < 0.05) return p.dybde;
        const w = 1 / (d * d);
        sumV += w * p.dybde; sumW += w;
      }
      if (sumW > 0) return sumV / sumW;
    }
    for (const st of this.strekninger) {
      if (s >= st.fra && s <= st.til) return st.dybde;
    }
    return this.standarddybde;
  }
}

/* ------------------------------------------------------------------ *
 *  Hjelpefunksjoner
 * ------------------------------------------------------------------ */

function utvidelseFraRadius(mal, R) {
  if (!isFinite(R)) return 0;
  const tab = mal.breddeutvidelse.slice().sort((a, b) => a[0] - b[0]);
  if (R <= tab[0][0]) return tab[0][1];
  if (R >= tab[tab.length - 1][0]) return tab[tab.length - 1][1];
  for (let i = 0; i < tab.length - 1; i++) {
    if (R >= tab[i][0] && R <= tab[i + 1][0]) {
      const f = (R - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
      return tab[i][1] + f * (tab[i + 1][1] - tab[i][1]);
    }
  }
  return 0;
}

function maksStigningFraRadius(mal, R) {
  const tab = mal.maksStigning.slice().sort((a, b) => a[0] - b[0]);
  for (const [r, g] of tab) if (R <= r) return g;
  return tab[tab.length - 1][1];
}

/** Breddeutvidelse med jevn overgang inn og ut av kurven. */
function lagUtvidelsesprofil(linje, mal, stasjoner) {
  const ra = stasjoner.map(s => linje.radiusVed(s));
  const grunn = ra.map(R => utvidelseFraRadius(mal, R));
  const ut = grunn.slice();
  const overgang = mal.utvidelseOvergang;
  if (overgang > 0) {
    for (let i = 0; i < stasjoner.length; i++) {
      let best = grunn[i];
      for (let j = 0; j < stasjoner.length; j++) {
        const d = Math.abs(stasjoner[j] - stasjoner[i]);
        if (d > overgang) continue;
        const avtrapping = grunn[j] * (1 - d / overgang);
        if (avtrapping > best) best = avtrapping;
      }
      ut[i] = best;
    }
  }
  return ut;
}

/* ------------------------------------------------------------------ *
 *  Ett tverrprofil
 * ------------------------------------------------------------------ */

/**
 * Bygger og maler opp ett tverrprofil.
 * @returns {object} areal, geometri og kontrollopplysninger for profilet
 */
function beregnTverrprofil(o) {
  const { linje, terreng, mal, fjell, s, vegnivaa, utvidelse } = o;
  const dt = o.integrasjonssteg || 0.1;

  const p = linje.punktVed(s);
  const kr = p.krumning;
  const nx = Math.sin(p.retning), ny = -Math.cos(p.retning); // høyre normal
  const terrRå = t => terreng.z(p.x + nx * t, p.y + ny * t);

  const hb = (mal.vegbredde + utvidelse) / 2;
  const ob = mal.slitelagTykkelse + mal.baerelagTykkelse;
  const rensk = mal.renskDybde;

  // Terreng etter rensk (avdekking av matjord/stubber)
  const terr = t => terrRå(t) - rensk;

  // Ferdig vegoverflate
  const vegflate = t => {
    const tt = Math.max(-hb, Math.min(hb, t));
    if (mal.tverrfallType === 'ensidig') {
      return vegnivaa - mal.tverrfall * mal.tverrfallRetning * tt;
    }
    return vegnivaa - mal.tverrfall * Math.abs(tt);
  };

  const fjelldybde = fjell ? fjell.dybde(p.x, p.y, s) : 0.5;
  const fjellflate = t => terrRå(t) - fjelldybde;

  // --- Bygg jordarbeidsflaten for hver side --------------------------
  const sider = {};
  for (const side of [-1, 1]) {
    const zKant = vegflate(side * hb);
    const planumKant = zKant - ob;
    const tKant = terr(side * hb);
    const knekk = [];  // {t (positiv utover), z} - jordarbeidsflaten
    let type, tFot;

    if (tKant > planumKant + 1e-6) {
      /* --- Skjæring: grøft og skraning opp til terreng --- */
      type = 'skjaering';
      const zGroft = Math.min(zKant - mal.grofteDybde, planumKant - 0.05);
      const t1 = hb + Math.max(0, planumKant - zGroft) * mal.grofteInnerHelning;
      const t2 = t1 + mal.grofteBunn;
      knekk.push({ t: hb, z: planumKant });
      knekk.push({ t: t1, z: zGroft });
      knekk.push({ t: t2, z: zGroft });

      let t = t2, z = zGroft;
      const steg = 0.05;
      let truffet = false;
      while (t < mal.maksSokebredde) {
        const iFjell = z < fjellflate(side * t) - 1e-9;
        const m = iFjell ? mal.skjaeringFjell : mal.skjaeringLosmasse;
        const nyZ = z + steg / Math.max(0.02, m);
        const nyT = t + steg;
        const tZ = terr(side * nyT);
        if (!isFinite(tZ)) { t = nyT; z = nyZ; break; }
        if (nyZ >= tZ) {
          // finn skjæringspunktet mellom skraning og terreng
          const f0 = z - terr(side * t);
          const f1 = nyZ - tZ;
          const u = (f1 - f0) !== 0 ? -f0 / (f1 - f0) : 1;
          t = t + steg * Math.max(0, Math.min(1, u));
          z = terr(side * t);
          truffet = true;
          break;
        }
        t = nyT; z = nyZ;
        knekk.push({ t, z });
      }
      knekk.push({ t, z });
      tFot = t;
      sider[side] = { type, knekk, tFot, truffet, zKant, planumKant };
    } else {
      /* --- Fylling: skraning ned til terreng --- */
      type = 'fylling';
      knekk.push({ t: hb, z: planumKant });
      knekk.push({ t: hb, z: zKant });          // materialskillet mot overbygningen
      let t = hb, z = zKant;
      const steg = 0.05;
      let truffet = false;
      while (t < mal.maksSokebredde) {
        const nyT = t + steg;
        const nyZ = zKant - (nyT - hb) / Math.max(0.02, mal.fylling);
        const tZ = terr(side * nyT);
        if (!isFinite(tZ)) { t = nyT; z = nyZ; break; }
        if (nyZ <= tZ) {
          const f0 = z - terr(side * t);
          const f1 = nyZ - tZ;
          const u = (f1 - f0) !== 0 ? -f0 / (f1 - f0) : 1;
          t = t + steg * Math.max(0, Math.min(1, u));
          z = terr(side * t);
          truffet = true;
          break;
        }
        t = nyT; z = nyZ;
        knekk.push({ t, z });
      }
      knekk.push({ t, z });
      tFot = t;
      sider[side] = { type, knekk, tFot, truffet, zKant, planumKant };
    }
  }

  // Jordarbeidsflaten som funksjon av t (negativ = venstre)
  function jordflate(t) {
    const side = t < 0 ? -1 : 1;
    const at = Math.abs(t);
    if (at <= hb) return vegflate(t) - ob;      // planum under vegen
    const k = sider[side].knekk;
    for (let i = 0; i < k.length - 1; i++) {
      if (at >= k[i].t && at <= k[i + 1].t) {
        const dtt = k[i + 1].t - k[i].t;
        if (dtt < 1e-9) return k[i + 1].z;
        const f = (at - k[i].t) / dtt;
        return k[i].z + f * (k[i + 1].z - k[i].z);
      }
    }
    return k[k.length - 1].z;
  }

  // --- Integrer arealene --------------------------------------------
  const tV = -sider[-1].tFot, tH = sider[1].tFot;
  let arealSkjaering = 0, arealFylling = 0, arealSkjaeringFjell = 0;
  let vSkjaering = 0, vFylling = 0, vSkjaeringFjell = 0; // kurvevektet
  let maksSkjaering = 0, maksFylling = 0;
  const geometri = { terreng: [], jord: [], veg: [], fjell: [], rensk: [] };

  // Integrasjonspunktene legges bade jevnt utover og nøyaktig i hvert knekkpunkt
  // i malen, slik at resultatet ikke henger pa hvor fint man deler opp.
  const brekk = new Set([tV, tH]);
  for (const side of [-1, 1]) for (const k of sider[side].knekk) brekk.add(side * k.t);
  for (const b of [-hb - 1e-7, -hb + 1e-7, hb - 1e-7, hb + 1e-7, 0]) brekk.add(b);
  const nJevn = Math.max(4, Math.ceil((tH - tV) / dt));
  for (let i = 0; i <= nJevn; i++) brekk.add(tV + (tH - tV) * i / nJevn);
  const offsets = [...brekk].filter(t => t >= tV - 1e-9 && t <= tH + 1e-9).sort((a, b) => a - b);

  let forrige = null;
  let manglerData = false;
  for (let i = 0; i < offsets.length; i++) {
    const t = offsets[i];
    const zT = terr(t);
    if (!isFinite(zT)) {
      // Hull i laserdekningen: ingen masse regnes over hullet
      manglerData = true;
      forrige = null;
      continue;
    }
    const zJ = jordflate(t);
    const zF = fjellflate(t);
    const d = zT - zJ;                       // positiv = skjæring
    const dFjell = Math.max(0, Math.min(zT, zF) - zJ);
    const naa = { t, d, dFjell, w: 1 + t * kr };
    if (forrige) {
      const dtI = t - forrige.t;
      // skjæring / fylling med eksakt nullpunkt
      if (forrige.d >= 0 && naa.d >= 0) {
        arealSkjaering += (forrige.d + naa.d) / 2 * dtI;
        vSkjaering += (forrige.d * forrige.w + naa.d * naa.w) / 2 * dtI;
      } else if (forrige.d <= 0 && naa.d <= 0) {
        arealFylling += (-forrige.d - naa.d) / 2 * dtI;
        vFylling += (-forrige.d * forrige.w - naa.d * naa.w) / 2 * dtI;
      } else {
        const u = forrige.d / (forrige.d - naa.d);
        const wMidt = forrige.w + (naa.w - forrige.w) * u;
        if (forrige.d > 0) {
          arealSkjaering += 0.5 * forrige.d * u * dtI;
          vSkjaering += 0.5 * forrige.d * forrige.w * u * dtI;
          arealFylling += 0.5 * (-naa.d) * (1 - u) * dtI;
          vFylling += 0.5 * (-naa.d) * naa.w * (1 - u) * dtI;
        } else {
          arealFylling += 0.5 * (-forrige.d) * u * dtI;
          vFylling += 0.5 * (-forrige.d) * forrige.w * u * dtI;
          arealSkjaering += 0.5 * naa.d * (1 - u) * dtI;
          vSkjaering += 0.5 * naa.d * naa.w * (1 - u) * dtI;
        }
        void wMidt;
      }
      arealSkjaeringFjell += (forrige.dFjell + naa.dFjell) / 2 * dtI;
      vSkjaeringFjell += (forrige.dFjell * forrige.w + naa.dFjell * naa.w) / 2 * dtI;
    }
    forrige = naa;
    if (d > maksSkjaering) maksSkjaering = d;
    if (-d > maksFylling) maksFylling = -d;
    geometri.terreng.push([t, terrRå(t)]);
    geometri.jord.push([t, zJ]);
    geometri.fjell.push([t, zF]);
    geometri.rensk.push([t, zT]);
  }
  // fjellandelen kan ikke overstige skjæringen
  arealSkjaeringFjell = Math.min(arealSkjaeringFjell, arealSkjaering);
  vSkjaeringFjell = Math.min(vSkjaeringFjell, vSkjaering);

  // Vegoverflaten til tegning
  for (let t = -hb; t <= hb + 1e-9; t += Math.max(0.1, (2 * hb) / 40)) geometri.veg.push([t, vegflate(t)]);
  geometri.veg.push([hb, vegflate(hb)]);

  // --- Rensk og overbygning -----------------------------------------
  const tR0 = tV - mal.renskUtenfor, tR1 = tH + mal.renskUtenfor;
  const renskBredde = tR1 - tR0;
  const renskVekt = renskBredde + kr * (tR1 * tR1 - tR0 * tR0) / 2;
  const arealRensk = mal.renskDybde * renskBredde;
  const vRensk = mal.renskDybde * renskVekt;

  const arealSlitelag = mal.slitelagTykkelse * Math.min(mal.slitelagBredde + utvidelse, mal.vegbredde + utvidelse);
  const arealBaerelag = mal.baerelagTykkelse * (mal.vegbredde + utvidelse);

  return {
    s, x: p.x, y: p.y, retning: p.retning, krumning: kr,
    radius: linje.radiusVed(s),
    vegnivaa,
    terrengSenter: terrRå(0),
    utvidelse,
    halvbredde: hb,
    fjelldybde,
    areal: {
      skjaering: arealSkjaering,
      skjaeringFjell: arealSkjaeringFjell,
      skjaeringLosmasse: arealSkjaering - arealSkjaeringFjell,
      fylling: arealFylling,
      rensk: arealRensk,
      slitelag: arealSlitelag,
      baerelag: arealBaerelag
    },
    vektet: {
      skjaering: vSkjaering,
      skjaeringFjell: vSkjaeringFjell,
      skjaeringLosmasse: vSkjaering - vSkjaeringFjell,
      fylling: vFylling,
      rensk: vRensk,
      slitelag: arealSlitelag,
      baerelag: arealBaerelag
    },
    maksSkjaering, maksFylling,
    fotVenstre: tV, fotHoyre: tH,
    sider,
    geometri,
    manglerData,
    advarsel: manglerData
      ? 'Terrengmodellen har hull i dette tverrsnittet – volumet er ufullstendig'
      : ((!sider[-1].truffet || !sider[1].truffet)
        ? 'Skraningen nadde ikke terrenget innenfor søkebredden'
        : null)
  };
}

/* ------------------------------------------------------------------ *
 *  Hele prosjektet
 * ------------------------------------------------------------------ */

/**
 * @param {object} o  {linje, profil, terreng, mal, fjell, faktorer, profilAvstand, bakkefaktor}
 */
function beregnMasser(o) {
  const linje = o.linje;
  const profil = o.profil;
  const mal = Object.assign({}, StandardMal, o.mal || {});
  const faktorer = Object.assign({}, StandardFaktorer, o.faktorer || {});
  const dS = o.profilAvstand || 5;
  const bf = o.bakkefaktor || 1;
  const arealFaktor = bf;          // ett vannrett mal i tverrsnittet
  const volumFaktor = bf * bf;     // to vannrette mal i volumet

  const stasjoner = [];
  for (let s = 0; s < linje.lengde - 1e-6; s += dS) stasjoner.push(+s.toFixed(4));
  stasjoner.push(+linje.lengde.toFixed(4));

  const utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner);

  const profiler = [];
  for (let i = 0; i < stasjoner.length; i++) {
    const s = stasjoner[i];
    profiler.push(beregnTverrprofil({
      linje, terreng: o.terreng, mal, fjell: o.fjell,
      s, vegnivaa: profil.hoyde(s), utvidelse: utvidelser[i],
      integrasjonssteg: o.integrasjonssteg
    }));
  }

  // --- Volum mellom profilene (gjennomsnittlig endeareal) ------------
  const felt = ['skjaering', 'skjaeringFjell', 'skjaeringLosmasse', 'fylling', 'rensk', 'slitelag', 'baerelag'];
  const sum = {}; felt.forEach(f => sum[f] = 0);
  const intervaller = [];

  for (let i = 0; i < profiler.length - 1; i++) {
    const a = profiler[i], b = profiler[i + 1];
    const L = b.s - a.s;
    const v = {};
    felt.forEach(f => {
      v[f] = (a.vektet[f] + b.vektet[f]) / 2 * L * volumFaktor;
      sum[f] += v[f];
    });
    intervaller.push({ fra: a.s, til: b.s, lengde: L, volum: v });
  }

  /* --- Massebalanse -------------------------------------------------
     Fyllingen kan bygges av bade sprengstein og brukbar løsmasse, mens
     bærelaget ma vaere sprengstein. Derfor brukes løsmassen først i
     fyllingen, og det som er igjen av fjell gar til bærelaget. */
  const fjellFast = sum.skjaeringFjell;
  const losFast = sum.skjaeringLosmasse;
  const fyllingBehov = sum.fylling;
  const baerelagBehov = sum.baerelag;

  const fraFjell = fjellFast * faktorer.fjellIFylling;
  const brukbarLos = losFast * faktorer.brukbarLosmasse * faktorer.losmasseIFylling;
  const tilgjengelig = fraFjell + brukbarLos;

  const fyllFraLos = Math.min(brukbarLos, fyllingBehov);
  const fyllFraFjell = Math.min(fraFjell, fyllingBehov - fyllFraLos);
  const fjellIgjen = fraFjell - fyllFraFjell;
  const baerelagFraFjell = Math.min(fjellIgjen, baerelagBehov);

  const manglerFylling = fyllingBehov - fyllFraLos - fyllFraFjell;
  const manglerBaerelag = baerelagBehov - baerelagFraFjell;
  const overskuddFjell = fjellIgjen - baerelagFraFjell;
  const overskuddLos = brukbarLos - fyllFraLos;
  const tilDeponi = sum.rensk + losFast * (1 - faktorer.brukbarLosmasse);

  const balanse = tilgjengelig - fyllingBehov;   // gammel, enkel balanse

  // Massetransportdiagram (Bruckner): kumulativ overskuddsmasse i fyllingsvolum
  const bruckner = [{ s: profiler[0] ? profiler[0].s : 0, verdi: 0 }];
  let kum = 0;
  for (const iv of intervaller) {
    const inn = iv.volum.skjaeringFjell * faktorer.fjellIFylling
      + iv.volum.skjaeringLosmasse * faktorer.brukbarLosmasse * faktorer.losmasseIFylling;
    kum += inn - iv.volum.fylling;
    bruckner.push({ s: iv.til, verdi: kum });
  }

  // --- Kontroll mot krav ---------------------------------------------
  const merknader = [];
  for (const pr of profiler) {
    if (pr.advarsel) merknader.push({ s: pr.s, type: pr.manglerData ? 'data' : 'geometri', tekst: pr.advarsel });
    const g = Math.abs(profil.stigning(pr.s));
    const maks = maksStigningFraRadius(mal, pr.radius);
    if (g > maks + 1e-4) {
      merknader.push({
        s: pr.s, type: 'stigning',
        tekst: `Stigning ${(g * 100).toFixed(1)} % overstiger ${(maks * 100).toFixed(0)} % (radius ${isFinite(pr.radius) ? pr.radius.toFixed(0) + ' m' : 'rettstrekk'})`
      });
    }
    if (!isFinite(pr.terrengSenter)) {
      merknader.push({ s: pr.s, type: 'data', tekst: 'Mangler terrengdata' });
    }
  }

  return {
    stasjoner, profiler, intervaller, sum, bruckner, merknader,
    mal, faktorer,
    lengde: linje.lengde * bf,
    lengdeKart: linje.lengde,
    bakkefaktor: bf,
    arealFaktor,
    balanse: {
      fjellFast, losFast, fyllingBehov, baerelagBehov,
      fjellSprengtLos: fjellFast * faktorer.sprengningsfaktor,
      fraFjell, brukbarLos, tilgjengelig, balanse,
      fyllFraLos, fyllFraFjell, baerelagFraFjell,
      manglerFylling, manglerBaerelag,
      overskuddFjell, overskuddLos, tilDeponi,
      manglerTotalt: manglerFylling + manglerBaerelag,
      overskudd: Math.max(0, balanse),
      underskudd: Math.max(0, -balanse)
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    StandardMal, StandardFaktorer, Fjellmodell,
    beregnMasser, beregnTverrprofil,
    utvidelseFraRadius, maksStigningFraRadius, lagUtvidelsesprofil
  };
}
