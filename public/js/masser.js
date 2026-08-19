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
  veiklasse: 'k5',            // hurtigvalg fra Normaler for landbruksveier
  vegbredde: 4.5,             // kjørebredde inkl. skulder, meter
  tverrfall: 0.05,            // 5 %
  tverrfallType: 'tak',       // 'tak' (tosidig) eller 'ensidig'
  tverrfallRetning: 1,        // ved ensidig: 1 = fall mot høyre
  slitelagTykkelse: 0.10,
  slitelagBredde: 4.0,
  baerelagTykkelse: 0.60,
  grofteDybdePlanum: 0.20,    // under planum, slik normalen angir det
  grofteBunn: 0.30,
  grofteInnerHelning: 1.0,    // H:V fra vegkant ned i grøfta
  skjaeringLosmasse: 1.5,     // H:V
  skjaeringFjell: 0.2,        // H:V (5:1)
  fylling: 1.5,               // H:V
  renskDybde: 0.20,
  renskUtenfor: 1.0,
  maksSokebredde: 45,

  /* Minste totale veibredde i kurver etter normalen:
     [radiusFra, radiusTil, bredde ved 45° dreining, bredde ved 135°] */
  breddeIKurve: [[10, 14, 5.5, 6.0], [15, 19, 5.0, 5.5], [20, 29, 5.0, 5.0],
  [30, 39, 4.5, 5.0], [40, 49, 4.5, 4.5], [50, 59, 4.0, 4.5]],
  utvidelseOvergang: 15,

  /* Største stigning: [radius til og med, med lass, uten lass] */
  stigningIKurve: [[14, 0.10, 0.12], [19, 0.11, 0.14], [29, 0.12, 0.15],
  [39, 0.14, 0.17], [49, 0.15, 0.18], [59, 0.16, 0.20], [1e9, 0.18, 0.20]],

  /* +1 nar tømmerlasset kjører mot økende profilnummer, -1 andre veien.
     Avgjør hvilken av de to stigningskolonnene som gjelder i hver bakke. */
  lassretning: -1,

  minRadius: 10,
  minVertikalLavbrekk: 60,
  minVertikalHoybrekk: 100,
  ensidigUnderRadius: 60,
  ensidigMaks: 0.05,
  ekstraBredde: { fyllingshoyde: 2.0, stigning: 0.14, tillegg: 0.5 },

  /* Grenser for hva som lar seg bygge. En fylling som stikker titalls meter
     ut til siden er ikke masser man kjører - da flyttes veien, eller det
     bygges mur. Uten disse grensene ville optimaliseringen gjerne lagt
     profilen der volumet ser billig ut pa papiret. 0 slar grensen av. */
  maksFyllingshoyde: 4.0,
  maksSkjaeringsdybde: 8.0,
  maksUtslag: 15.0          // vannrett fra vegkant til fyllingsfot/skjæringstopp
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

/**
 * Breddeutvidelse i en kurve.
 *
 * Normalen oppgir minste *totale* veibredde, avhengig av bade radius og hvor
 * mye kurven dreier. Utvidelsen er derfor differansen mot den veibredden
 * prosjektet ellers bygger - bygger man allerede bredere enn kravet, blir
 * det ingen utvidelse.
 */
function utvidelseFraRadius(mal, R, dreiningGrader) {
  if (!isFinite(R)) return 0;
  const tab = mal.breddeIKurve || [];
  for (const [fra, til, b45, b135] of tab) {
    if (R >= fra && R <= til) {
      const g = Math.max(45, Math.min(135, dreiningGrader == null ? 45 : dreiningGrader));
      const mal2 = b45 + (b135 - b45) * (g - 45) / 90;
      return Math.max(0, mal2 - mal.vegbredde);
    }
  }
  return 0;
}

/**
 * Største tillatte stigning i et punkt.
 *
 * Kravet er strengere der tømmerlasset skal oppover (motkjøring med lass)
 * enn der det er den tomme bilen som klatrer. Hvilken som gjelder avhenger
 * derfor bade av fortegnet pa stigningen og av hvilken vei lasset kjører.
 */
function maksStigningFraRadius(mal, R, stigning, lassretning) {
  const tab = mal.stigningIKurve || [];
  if (!tab.length) return 1;
  let rad = tab[tab.length - 1];
  for (const r of tab) { if (R <= r[0]) { rad = r; break; } }
  if (stigning == null) return Math.max(rad[1], rad[2]);
  const lassetKlatrer = (stigning * (lassretning || 1)) > 0;
  return lassetKlatrer ? rad[1] : rad[2];
}

/** Breddeutvidelse med jevn overgang inn og ut av kurven. */
function lagUtvidelsesprofil(linje, mal, stasjoner, ekstra) {
  const grunn = stasjoner.map(s => {
    const kurve = linje.kurveVed ? linje.kurveVed(s) : null;
    const dreining = kurve ? Math.abs(kurve.avbøy) * 180 / Math.PI : 45;
    return utvidelseFraRadius(mal, linje.radiusVed(s), dreining);
  });
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
  // Normalen krever ekstra bredde i bratte bakker og pa høye fyllinger
  if (ekstra) for (let i = 0; i < ut.length; i++) if (ekstra[i]) ut[i] += ekstra[i];
  return ut;
}

/**
 * Tverrfall i et gitt profilnummer.
 *
 * Standard er takfall fra malen, men brukeren kan legge inn eget fall for
 * venstre og høyre side pa enkeltprofiler - typisk nar en oppmalt veg skal
 * treffes, eller nar kurven skal doseres ensidig slik normalen krever.
 */
function tverrfallVed(mal, overstyringer, s) {
  const standard = mal.tverrfallType === 'ensidig'
    ? { venstre: -mal.tverrfall * mal.tverrfallRetning, hoyre: mal.tverrfall * mal.tverrfallRetning }
    : { venstre: mal.tverrfall, hoyre: mal.tverrfall };
  const liste = (overstyringer || []).slice().sort((a, b) => a.s - b.s);
  if (!liste.length) return standard;
  if (s <= liste[0].s) return { venstre: liste[0].venstre, hoyre: liste[0].hoyre };
  if (s >= liste[liste.length - 1].s) {
    const sist = liste[liste.length - 1];
    return { venstre: sist.venstre, hoyre: sist.hoyre };
  }
  for (let i = 0; i < liste.length - 1; i++) {
    if (s >= liste[i].s && s <= liste[i + 1].s) {
      const f = (s - liste[i].s) / (liste[i + 1].s - liste[i].s || 1);
      return {
        venstre: liste[i].venstre + f * (liste[i + 1].venstre - liste[i].venstre),
        hoyre: liste[i].hoyre + f * (liste[i + 1].hoyre - liste[i].hoyre)
      };
    }
  }
  return standard;
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

  /* Ferdig vegoverflate. Venstre og høyre fall er skilt, slik at et
     oppmalt tverrsnitt kan treffes og kurver kan doseres ensidig. */
  const fall = o.tverrfall || { venstre: mal.tverrfall, hoyre: mal.tverrfall };
  const vegflate = t => {
    const tt = Math.max(-hb, Math.min(hb, t));
    return vegnivaa - (tt < 0 ? fall.venstre * -tt : fall.hoyre * tt);
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
      /* --- Skjæring: grøft og skraning opp til terreng ---
         Normalen maler grøftedybden fra planum, ikke fra veioverflaten,
         fordi det er drenering av bærelaget som er poenget. */
      type = 'skjaering';
      const zGroft = planumKant - Math.max(0.05, mal.grofteDybdePlanum);
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

  const kjørProfiler = utvidelser => stasjoner.map((s, i) => beregnTverrprofil({
    linje, terreng: o.terreng, mal, fjell: o.fjell,
    s, vegnivaa: profil.hoyde(s), utvidelse: utvidelser[i],
    tverrfall: tverrfallVed(mal, o.tverrfallOverstyring, s),
    integrasjonssteg: o.integrasjonssteg
  }));

  let utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner);
  let profiler = kjørProfiler(utvidelser);

  /* Normalen krever 0,5 m ekstra bredde der veien ligger pa høy fylling
     eller er bratt. Fyllingshøyden er ikke kjent før profilene er regnet,
     sa de stedene far et nytt gjennomløp med den økte bredden. */
  const ekstra = mal.ekstraBredde;
  if (ekstra && ekstra.tillegg) {
    const paslag = profiler.map(p => {
      const brattNok = ekstra.stigning != null && Math.abs(profil.stigning(p.s)) > ekstra.stigning;
      const høyNok = ekstra.fyllingshoyde != null && p.maksFylling > ekstra.fyllingshoyde;
      return (brattNok || høyNok) ? ekstra.tillegg : 0;
    });
    if (paslag.some(v => v > 0)) {
      utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner, paslag);
      profiler = kjørProfiler(utvidelser);
    }
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
    const stign = profil.stigning(pr.s);
    const maks = maksStigningFraRadius(mal, pr.radius, stign, mal.lassretning);
    if (Math.abs(stign) > maks + 1e-4) {
      const lassetKlatrer = (stign * (mal.lassretning || 1)) > 0;
      merknader.push({
        s: pr.s, type: 'stigning',
        tekst: `Stigning ${(Math.abs(stign) * 100).toFixed(1)} % overstiger ${(maks * 100).toFixed(0)} % `
          + `${lassetKlatrer ? 'i lassretningen' : 'i returretningen'} `
          + `(${isFinite(pr.radius) ? 'radius ' + pr.radius.toFixed(0) + ' m' : 'rettstrekk'})`
      });
    }
    if (isFinite(pr.radius) && mal.minRadius && pr.radius < mal.minRadius - 1e-6) {
      merknader.push({
        s: pr.s, type: 'kurvatur',
        tekst: `Radius ${pr.radius.toFixed(1)} m er under minstekravet på ${mal.minRadius} m`
      });
    }
    if (!isFinite(pr.terrengSenter)) {
      merknader.push({ s: pr.s, type: 'data', tekst: 'Mangler terrengdata' });
    }
    if (mal.maksFyllingshoyde > 0 && pr.maksFylling > mal.maksFyllingshoyde) {
      merknader.push({
        s: pr.s, type: 'fylling',
        tekst: `Fyllingshøyde ${pr.maksFylling.toFixed(1)} m over grensen på ${mal.maksFyllingshoyde} m`
      });
    }
    if (mal.maksSkjaeringsdybde > 0 && pr.maksSkjaering > mal.maksSkjaeringsdybde) {
      merknader.push({
        s: pr.s, type: 'skjaering',
        tekst: `Skjæringsdybde ${pr.maksSkjaering.toFixed(1)} m over grensen på ${mal.maksSkjaeringsdybde} m`
      });
    }
    if (mal.maksUtslag > 0) {
      const utslag = Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;
      if (utslag > mal.maksUtslag) {
        merknader.push({
          s: pr.s, type: 'utslag',
          tekst: `Skråningen stikker ${utslag.toFixed(1)} m ut fra vegkant, grensen er ${mal.maksUtslag} m`
        });
      }
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
    utvidelseFraRadius, maksStigningFraRadius, lagUtvidelsesprofil, tverrfallVed
  };
}
