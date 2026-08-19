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
  utvidelseOvergang: 15,     // hvor langt breddeutvidelsen jevnes ut
  utflatingForKurve: 10,     // hvor langt stigningen flates ut før kurven

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
  maksUtslag: 15.0,         // vannrett fra vegkant til fyllingsfot/skjæringstopp

  /* Hvor langt ut fra vegkanten massene i det hele tatt regnes. Er den satt,
     stopper regnestykket der, og det som ligger utenfor blir ikke med i
     volumet. Da far man et tall for det man faktisk har tenkt a gjøre, i
     stedet for en skraning som forsvinner nedover lia. Profilene det gjelder
     blir merket, sa det er tydelig at tallet er avkortet. 0 = ingen grense. */
  beregningsbredde: 0,

  /* Hvor langt "Optimaliser" far flytte senterlinjen sidelengs for a treffe
     billigere terreng. 0 = linjen star der den er tegnet. */
  sideforskyvning: 0
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
  const tab = (mal.breddeIKurve || []).slice().sort((a, b) => a[0] - b[0]);
  if (!tab.length) return 0;

  /* Radiusbandene i normalen er oppgitt i hele meter: 10-14, 15-19, 20-24 …
     En radius pa 14,5 m faller mellom to band. Da gjelder fortsatt det
     strengere kravet - man har ikke naadd 15 m, og kan ikke paberope seg
     kravet som hører til der. Uten dette ga 14,5 m ingen breddeutvidelse i
     det hele tatt, selv om bade 14 og 15 krever bredere veg. */
  let valgt = null;
  /* Er radien knappere enn tabellen rekker, gjelder det strengeste bandet.
     Normalen slutter a gi tall der fordi ingen bygger saa knappe kurver -
     ikke fordi kravet forsvinner. Uten dette ga en 8-metersving mindre
     utvidelse enn en pa 12. */
  if (R < tab[0][0]) valgt = tab[0];
  else for (let i = 0; i < tab.length; i++) {
    // det siste bandet stopper der det slutter - over 60 m kreves ingen utvidelse
    const slutt = i + 1 < tab.length ? tab[i + 1][0] : tab[i][1] + 1;
    if (R >= tab[i][0] && R < slutt) { valgt = tab[i]; break; }
  }
  if (!valgt) return 0;                      // slakere enn tabellen rekker
  const g = Math.max(45, Math.min(135, dreiningGrader == null ? 45 : dreiningGrader));
  return Math.max(0, (valgt[2] + (valgt[3] - valgt[2]) * (g - 45) / 90) - mal.vegbredde);
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
  /* Samme bandlogikk som for bredden: radiusgrensene er hele meter, sa en
     radius pa 14,5 m har ikke naadd 15-bandet og beholder det strengere
     kravet fra 10-14. */
  let rad = tab[tab.length - 1];
  for (const r of tab) { if (R < r[0] + 1) { rad = r; break; } }
  if (stigning == null) return Math.max(rad[1], rad[2]);
  const lassetKlatrer = (stigning * (lassretning || 1)) > 0;
  return lassetKlatrer ? rad[1] : rad[2];
}

/**
 * Radien som bestemmer stigningskravet i et punkt.
 *
 * Normalen sier at stigningen skal flates ut *før* knappe kurver, og at
 * stigningsovergangen skal jevnes ut over en gitt avstand regnet fra
 * tangentpunktene. Kravet i kurven gjelder derfor ogsa et stykke pa hver side
 * av den - ellers kunne man kjørt 20 % helt fram til en 10-meterssving og
 * sluppet unna med det pa papiret.
 */
function effektivRadius(linje, mal, s) {
  const utflating = mal.utflatingForKurve != null ? mal.utflatingForKurve : (mal.utvidelseOvergang || 0);
  let minste = linje.radiusVed(s);
  if (utflating > 0) {
    const steg = Math.max(1, utflating / 6);
    for (let d = -utflating; d <= utflating + 1e-9; d += steg) {
      const ss = Math.min(Math.max(0, s + d), linje.lengde);
      const r = linje.radiusVed(ss);
      if (r < minste) minste = r;
    }
  }
  return minste;
}

/** Breddeutvidelse med jevn overgang inn og ut av kurven. */
function lagUtvidelsesprofil(linje, mal, stasjoner, ekstra) {
  /* Utvidelsen ma leses av over hele strekket profilet representerer, ikke
     bare i det ene punktet. En kurve som er kortere enn profilavstanden kan
     ellers falle mellom to profiler, og da fikk den ingen utvidelse i det
     hele tatt - jo knappere sving, desto lettere skjedde det. */
  const les = s => {
    const kurve = linje.kurveVed ? linje.kurveVed(s) : null;
    const dreining = kurve ? Math.abs(kurve.avbøy) * 180 / Math.PI : 45;
    return utvidelseFraRadius(mal, linje.radiusVed(s), dreining);
  };
  const grunn = stasjoner.map((s, i) => {
    const før = i > 0 ? (s - stasjoner[i - 1]) / 2 : 0;
    const etter = i + 1 < stasjoner.length ? (stasjoner[i + 1] - s) / 2 : 0;
    const steg = Math.max(0.5, Math.min(før, etter) / 4);
    let maks = les(s);
    for (let d = -før; d <= etter + 1e-9; d += steg) {
      const v = les(Math.min(Math.max(0, s + d), linje.lengde));
      if (v > maks) maks = v;
    }
    return maks;
  });
  const ut = grunn.slice();
  const overgang = mal.utvidelseOvergang;
  if (overgang > 0) {
    /* Bare naboer nærmere enn overgangslengden betyr noe, og stasjonene ligger
       sortert. Et glidende vindu gjør dette lineært i stedet for kvadratisk -
       med alle mot alle kostet det 2,3 sekunder pa 64 000 stasjoner. */
    let lav = 0, høy = 0;
    for (let i = 0; i < stasjoner.length; i++) {
      while (lav < i && stasjoner[i] - stasjoner[lav] > overgang) lav++;
      if (høy < i) høy = i;
      while (høy + 1 < stasjoner.length && stasjoner[høy + 1] - stasjoner[i] <= overgang) høy++;
      let best = grunn[i];
      for (let j = lav; j <= høy; j++) {
        const avtrapping = grunn[j] * (1 - Math.abs(stasjoner[j] - stasjoner[i]) / overgang);
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
function tverrfallVed(mal, overstyringer, s, krumning) {
  let standard = mal.tverrfallType === 'ensidig'
    ? { venstre: -mal.tverrfall * mal.tverrfallRetning, hoyre: mal.tverrfall * mal.tverrfallRetning }
    : { venstre: mal.tverrfall, hoyre: mal.tverrfall };

  /* Normalen: kurver med radius under 60 m skal bygges med ensidig tverrfall
     (dosering) inn mot kurvesenteret, og det skal ikke overstige 5 %.
     Uten dette ville en krapp sving fatt takfall, som heller vannet ut mot
     yttersiden nettopp der bilen presser mest. */
    if (krumning != null && mal.ensidigUnderRadius > 0 && Math.abs(krumning) > 1e-9) {
    const radius = 1 / Math.abs(krumning);
    if (radius < mal.ensidigUnderRadius) {
      const fall = Math.min(mal.tverrfall, mal.ensidigMaks != null ? mal.ensidigMaks : 0.05);
      // positiv krumning = venstresving, sa veien skal falle mot venstre
      standard = krumning > 0
        ? { venstre: fall, hoyre: -fall }
        : { venstre: -fall, hoyre: fall };
    }
  }

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
  /* `isFinite(null)` er sant, og null ville da blitt lest som kote 0 - en
     terrengmodell som svarer null for hull hadde gitt hundretusenvis av
     kubikk fylling opp fra havflaten, uten en eneste datamerknad. Bare et
     ekte tall slipper gjennom. */
  const terrRå = t => {
    const v = terreng.z(p.x + nx * t, p.y + ny * t);
    return typeof v === 'number' && isFinite(v) ? v : NaN;
  };

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
      /* Grøfta trappes ned der skjæringen tar slutt.
         En veg som gar fra skjæring til fylling har ikke full grøft helt fram
         til skillet - den renner ut. Uten nedtrappingen forsvant hele grøfta
         i ett sprang idet profilet vippet over til fylling, og arealet hoppet
         med den. Optimaliseringen ble trukket mot det spranget. */
      const skjaeringVedKant = tKant - planumKant;
      const grofteAndel = Math.max(0, Math.min(1, skjaeringVedKant / 0.5));
      const zGroft = planumKant - Math.max(0, mal.grofteDybdePlanum) * grofteAndel;
      const t1 = hb + Math.max(0, planumKant - zGroft) * mal.grofteInnerHelning;
      const t2 = t1 + mal.grofteBunn * grofteAndel;
      knekk.push({ t: hb, z: planumKant });
      knekk.push({ t: t1, z: zGroft });
      knekk.push({ t: t2, z: zGroft });

      /* Marsjer utover til skraningen møter terrenget.
         Naer fjelloverflaten ma stegene vaere sma, for der bytter skraningen
         helning og en bom pa steget slar rett inn i høyden. Godt over fjellet
         er helningen konstant, og da koster sma steg bare tid - en skraning
         som gar 40 m ut ville blitt 800 terrengoppslag. Selve treffpunktet
         finnes med halvering til slutt, sa det blir like nøyaktig uansett. */
      let t = t2, z = zGroft;
      let truffet = false;
      while (t < mal.maksSokebredde) {
        const naerFjell = Math.abs(z - fjellflate(side * t)) < 1.0;
        const steg = naerFjell ? 0.05 : 0.4;
        const iFjell = z < fjellflate(side * t) - 1e-9;
        const m = iFjell ? mal.skjaeringFjell : mal.skjaeringLosmasse;
        const nyZ = z + steg / Math.max(0.02, m);
        const nyT = t + steg;
        const tZ = terr(side * nyT);
        if (!isFinite(tZ)) { t = nyT; z = nyZ; break; }
        if (nyZ >= tZ) {
          // halver oss inn pa punktet der skraningen krysser terrenget
          let lo = t, hi = nyT, zLo = z;
          for (let b = 0; b < 12; b++) {
            const midt = (lo + hi) / 2;
            const zMidt = zLo + (midt - lo) / Math.max(0.02, m);
            if (zMidt >= terr(side * midt)) hi = midt; else { lo = midt; zLo = zMidt; }
          }
          t = hi; z = terr(side * t);
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
      /* Skraningen starter i planum, ikke i veikanten. Overbygningen er en
         egen post som legges oppa, og skal ikke telles med i fyllingen -
         slik det ogsa star i rapporten.

         Startet den i veikanten, ville jordarbeidsflaten hoppet 0,70 m i det
         øyeblikket profilet gikk fra skjæring til fylling. Et profil kunne da
         tredoble fyllingsarealet pa en femtedels millimeter endring i
         vegnivået, og optimaliseringen ble trukket mot det spranget.

         Fyllingsskraningen har fast helning hele veien - ingen fjellovergang
         a treffe. Da kan stegene vaere store, og treffpunktet finnes med
         halvering. */
      let t = hb, z = planumKant;
      const fallPerM = 1 / Math.max(0.02, mal.fylling);
      const skraning = tt => planumKant - (tt - hb) * fallPerM;
      const steg = 0.4;
      let truffet = false;
      while (t < mal.maksSokebredde) {
        const nyT = t + steg;
        const nyZ = skraning(nyT);
        const tZ = terr(side * nyT);
        if (!isFinite(tZ)) { t = nyT; z = nyZ; break; }
        if (nyZ <= tZ) {
          let lo = t, hi = nyT;
          for (let b = 0; b < 12; b++) {
            const midt = (lo + hi) / 2;
            if (skraning(midt) <= terr(side * midt)) hi = midt; else lo = midt;
          }
          t = hi; z = terr(side * t);
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
  /* Er det satt en beregningsbredde, stopper regnestykket der selv om
     skraningen fortsetter. Det som ligger utenfor blir ikke talt med. */
  const grense = mal.beregningsbredde > 0 ? hb + mal.beregningsbredde : Infinity;
  const avkortetV = sider[-1].tFot > grense;
  const avkortetH = sider[1].tFot > grense;
  const tV = -Math.min(sider[-1].tFot, grense);
  const tH = Math.min(sider[1].tFot, grense);
  let arealSkjaering = 0, arealFylling = 0, arealSkjaeringFjell = 0;
  let vSkjaering = 0, vFylling = 0, vSkjaeringFjell = 0; // kurvevektet
  let maksSkjaering = 0, maksFylling = 0;
  /* Tegningsgeometrien er langt tyngre enn tallene, og pa lange veier trengs
     den ikke: skjermen viser ett snitt om gangen. Da bygges den ikke i det
     hele tatt - a slippe den etterpa hjelper ikke, for da er toppen alt nadd. */
  const geometri = o.utenGeometri ? null : { terreng: [], jord: [], veg: [], fjell: [], rensk: [] };

  // Integrasjonspunktene legges bade jevnt utover og nøyaktig i hvert knekkpunkt
  // i malen, slik at resultatet ikke henger pa hvor fint man deler opp.
  const brekk = new Set([tV, tH]);
  for (const side of [-1, 1]) for (const k of sider[side].knekk) brekk.add(side * k.t);
  for (const b of [-hb - 1e-7, -hb + 1e-7, hb - 1e-7, hb + 1e-7, 0]) brekk.add(b);
  /* Taket er det som skiller en tung beregning fra et program som dør. Bredde
     og integrasjonssteg kommer begge fra felt uten grenser, og produktet av
     dem er antall punkt: 20 m veg med 1e-6 steg er tjue millioner punkt i ett
     eneste snitt. Fire tusen punkt over snittet er finere enn terrengmodellen
     selv, sa taket koster ingenting i nøyaktighet. */
  const nJevn = Math.min(4000, Math.max(4, Math.ceil((tH - tV) / dt)));
  for (let i = 0; i <= nJevn; i++) brekk.add(tV + (tH - tV) * i / nJevn);
  const offsets = [...brekk].filter(t => t >= tV - 1e-9 && t <= tH + 1e-9).sort((a, b) => a - b);

  let forrige = null;
  let manglerData = false;
  let forbiKurvesenter = false;
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
    /* Pappus-vekten gjelder bare sa lenge stripa ligger pa samme side av
       kurvesenteret som vegen. Strekker fyllingsfoten seg forbi senteret,
       blir (1 + t·krumning) negativ, og et areal ville da blitt trukket fra
       i stedet for lagt til. Da folder tverrsnittene seg over hverandre pa
       innersida, og det finnes ikke noe entydig volum - vi lar stripa telle
       null og merker profilet i stedet. */
    const rawW = 1 + t * kr;
    if (rawW < 0) forbiKurvesenter = true;
    const naa = { t, d, dFjell, w: Math.max(0, rawW) };
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
        /* Over en trekant der dybden gar fra d til null, og vekten fra w til
           wMidt, er det vektede arealet d·(2w + wMidt)/6 av grunnflaten - ikke
           d·w/2. Med endepunktvekten alene ble arealet riktig, men volumet fikk
           en systematisk skjevhet i kurver, samme sted som fjellsplitten rett
           under alt regnet det riktig. */
        if (forrige.d > 0) {
          arealSkjaering += 0.5 * forrige.d * u * dtI;
          vSkjaering += forrige.d * (2 * forrige.w + wMidt) / 6 * u * dtI;
          arealFylling += 0.5 * (-naa.d) * (1 - u) * dtI;
          vFylling += (-naa.d) * (wMidt + 2 * naa.w) / 6 * (1 - u) * dtI;
        } else {
          arealFylling += 0.5 * (-forrige.d) * u * dtI;
          vFylling += (-forrige.d) * (2 * forrige.w + wMidt) / 6 * u * dtI;
          arealSkjaering += 0.5 * naa.d * (1 - u) * dtI;
          vSkjaering += naa.d * (wMidt + 2 * naa.w) / 6 * (1 - u) * dtI;
        }
      }
      /* Fjellandelen ma deles like nøyaktig som skjæringen selv. Med rein
         trapes over knekken der fjellet slipper taket, ble splitten mellom
         fjell og løsmasse avhengig av hvor fint man delte opp - og fjellet er
         den dyre posten. */
      if ((forrige.dFjell > 0) !== (naa.dFjell > 0)) {
        // fjellet slipper taket et sted inne i intervallet - del der
        const u = Math.max(0, Math.min(1, forrige.dFjell / (forrige.dFjell - naa.dFjell)));
        const wMidt = forrige.w + (naa.w - forrige.w) * u;
        if (forrige.dFjell > 0) {
          const del = u * dtI, D = forrige.dFjell;
          arealSkjaeringFjell += 0.5 * D * del;
          vSkjaeringFjell += D * (2 * forrige.w + wMidt) / 6 * del;
        } else {
          const del = (1 - u) * dtI, D = naa.dFjell;
          arealSkjaeringFjell += 0.5 * D * del;
          vSkjaeringFjell += D * (wMidt + 2 * naa.w) / 6 * del;
        }
      } else {
        arealSkjaeringFjell += (forrige.dFjell + naa.dFjell) / 2 * dtI;
        vSkjaeringFjell += (forrige.dFjell * forrige.w + naa.dFjell * naa.w) / 2 * dtI;
      }
    }
    forrige = naa;
    if (d > maksSkjaering) maksSkjaering = d;
    if (-d > maksFylling) maksFylling = -d;
    if (geometri) {
      geometri.terreng.push([t, terrRå(t)]);
      geometri.jord.push([t, zJ]);
      geometri.fjell.push([t, zF]);
      geometri.rensk.push([t, zT]);
    }
  }
  // fjellandelen kan ikke overstige skjæringen
  arealSkjaeringFjell = Math.min(arealSkjaeringFjell, arealSkjaering);
  vSkjaeringFjell = Math.min(vSkjaeringFjell, vSkjaering);

  // Vegoverflaten til tegning
  if (geometri) {
    for (let t = -hb; t <= hb + 1e-9; t += Math.max(0.1, (2 * hb) / 40)) geometri.veg.push([t, vegflate(t)]);
    geometri.veg.push([hb, vegflate(hb)]);
  }

  // --- Rensk og overbygning -----------------------------------------
  const tR0 = tV - mal.renskUtenfor, tR1 = tH + mal.renskUtenfor;
  const renskBredde = tR1 - tR0;
  // samme klemme som over: vekten kan ikke bli negativ
  const renskVekt = Math.max(0, renskBredde + kr * (tR1 * tR1 - tR0 * tR0) / 2);
  // ingen rensk der terrengmodellen ikke har data
  const arealRensk = manglerData ? 0 : mal.renskDybde * renskBredde;
  const vRensk = manglerData ? 0 : mal.renskDybde * renskVekt;

  /* Slitelaget ligger bare over kjørebanen. Utenfor - pa skuldrene - er det
     bærelaget som gar helt opp til veinivaet. Uten dette ble den øverste
     desimeteren av skuldrene gravd ut, men aldri fylt igjen med noe: 50 til
     100 kubikk per kilometer som ikke sto pa noen post. */
  const bredde = mal.vegbredde + utvidelse;
  const slitebredde = Math.min(mal.slitelagBredde + utvidelse, bredde);
  const arealSlitelag = mal.slitelagTykkelse * slitebredde;
  const arealBaerelag = mal.baerelagTykkelse * bredde
    + mal.slitelagTykkelse * (bredde - slitebredde);

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
    /* Marsjpunktene ut mot skraningsfoten leses ikke av noen etter at arealene
       er regnet, men de var det tyngste pa hvert profil: nesten nitten kilobyte
       stykket, mot noen hundre byte for tallene. De følger tegningsgeometrien. */
    sider: geometri ? sider : null,
    geometri,
    manglerData,
    forbiKurvesenter,
    avkortet: avkortetV || avkortetH,
    advarsel: manglerData
      ? 'Terrengmodellen har hull i dette tverrsnittet – volumet er ufullstendig'
      : forbiKurvesenter
        ? 'Skråningen strekker seg forbi kurvesenteret – volumet her er ikke entydig'
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
/**
 * Grenser for de tallene som ma vaere fornuftige for at regnestykket i det
 * hele tatt skal gi mening. [minste, største, navn i klartekst].
 *
 * En negativ veibredde eller renskedybde er ikke en veg - det er et fortegn
 * pa avveie. Uten disse ble svaret et negativt volum uten et ord om hvorfor.
 */
const MALGRENSER = {
  vegbredde: [0.5, 30, 'Veibredde'],
  slitelagTykkelse: [0, 1, 'Slitelagstykkelse'],
  slitelagBredde: [0, 30, 'Slitelagsbredde'],
  baerelagTykkelse: [0, 3, 'Bærelagstykkelse'],
  grofteDybdePlanum: [0, 3, 'Grøftedybde under planum'],
  grofteBunn: [0, 5, 'Grøftebunn'],
  grofteInnerHelning: [0, 10, 'Grøftehelning'],
  renskDybde: [0, 3, 'Renskedybde'],
  renskUtenfor: [0, 20, 'Rensk utenfor'],
  tverrfall: [0, 0.3, 'Tverrfall'],
  maksSokebredde: [1, 500, 'Søkebredde'],
  beregningsbredde: [0, 500, 'Beregningsbredde']
};

/** Samme for omregningsfaktorene: en faktor under null snur et volum. */
const FAKTORGRENSER = {
  sprengningsfaktor: [1, 3, 'Sprengningsfaktor'],
  losmasseFaktor: [1, 3, 'Løsmassefaktor'],
  brukbarLosmasse: [0, 1, 'Andel brukbar løsmasse'],
  losmasseIFylling: [0.5, 1.5, 'Løsmasse i fylling'],
  fjellIFylling: [0.5, 2, 'Sprengstein i fylling']
};

/**
 * Ser over det som kommer inn, retter det som ikke lar seg regne med, og
 * forteller hva som ble rettet.
 *
 * Tallene kan komme fra et skjemafelt uten grenser, eller fra en prosjektfil
 * som er redigert for hand. Skjemaet klemmer noen av dem, men bare nar noen
 * skriver i det - en fil som lastes gar rett inn. Derfor ma kontrollen ligge
 * her, der alle veiene inn møtes.
 */
function rettInngang(mal, faktorer, fjell, dS, bf) {
  const merknader = [];
  const klem = (obj, grenser, hva) => {
    for (const felt of Object.keys(grenser)) {
      const [lav, høy, navn] = grenser[felt];
      const v = obj[felt];
      if (v == null) continue;
      if (typeof v !== 'number' || !isFinite(v)) {
        merknader.push({ s: 0, type: 'inngang', tekst: `${navn} er ikke et tall – bruker ${StandardMal[felt] != null ? StandardMal[felt] : lav}` });
        obj[felt] = (hva === 'mal' ? StandardMal[felt] : StandardFaktorer[felt]);
        continue;
      }
      if (v < lav || v > høy) {
        obj[felt] = Math.min(høy, Math.max(lav, v));
        merknader.push({
          s: 0, type: 'inngang',
          tekst: `${navn} var ${v} – utenfor ${lav} til ${høy}, regnet med ${obj[felt]}`
        });
      }
    }
  };
  klem(mal, MALGRENSER, 'mal');
  klem(faktorer, FAKTORGRENSER, 'faktor');

  // skraningene normaliseres allerede, men si ifra nar inngangen var ugyldig
  for (const [felt, navn] of [['skjaeringLosmasse', 'Skjæring i løsmasse'],
    ['skjaeringFjell', 'Skjæring i fjell'], ['fylling', 'Fyllingsskråning']]) {
    const v = mal[felt];
    if (typeof v !== 'number' || !isFinite(v) || v < 0.02) {
      merknader.push({ s: 0, type: 'inngang', tekst: `${navn} var ${v} – regnet med 0.02 (nesten loddrett)` });
    }
  }

  /* En fjelldybde som ikke er et tall smitter over pa hele massebalansen, og
     det uten et eneste tegn: skjæringen blir riktig, men fjell, løsmasse og
     alt som bygger pa dem blir NaN. */
  if (fjell) {
    if (!isFinite(fjell.standarddybde)) {
      merknader.push({ s: 0, type: 'inngang', tekst: `Fjelldybden er ikke et tall – regnet uten fjell` });
      fjell.standarddybde = 0;
    }
    for (const p of (fjell.punkter || [])) {
      if (!isFinite(p.dybde)) { p.dybde = fjell.standarddybde; }
      }
    for (const st of (fjell.strekninger || [])) {
      if (!isFinite(st.dybde)) st.dybde = fjell.standarddybde;
    }
  }

  /* Profilavstanden er den farligste av dem alle: null eller negativ gir en
     løkke som aldri kommer ut, og fana henger. */
  let dSut = dS;
  if (!isFinite(dSut) || dSut <= 0) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Profilavstanden var ${dS} – regnet med 5 m` });
    dSut = 5;
  } else if (dSut > 100) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Profilavstanden var ${dS} m – regnet med 100 m` });
    dSut = 100;
  }

  let bfUt = bf;
  if (!isFinite(bfUt) || bfUt <= 0) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Bakkefaktoren var ${bf} – regnet med 1` });
    bfUt = 1;
  }
  return { merknader, dS: dSut, bf: bfUt };
}

function beregnMasser(o) {
  const linje = o.linje;
  const profil = o.profil;
  const mal = Object.assign({}, StandardMal, o.mal || {});
  const faktorer = Object.assign({}, StandardFaktorer, o.faktorer || {});
  /* Radverdiene gar inn i vakten, ikke `o.profilAvstand || 5`. Med `||` ville
     bade 0 og NaN blitt byttet ut med 5 i stillhet, og brukeren fikk et svar
     som ikke svarte til det som sto i skjemaet. */
  const vakt = rettInngang(mal, faktorer, o.fjell,
    o.profilAvstand == null ? 5 : o.profilAvstand,
    o.bakkefaktor == null ? 1 : o.bakkefaktor);
  const dS = vakt.dS;
  const bf = vakt.bf;
  const arealFaktor = bf;          // ett vannrett mal i tverrsnittet
  const volumFaktor = bf * bf;     // to vannrette mal i volumet

  const stasjoner = [];
  for (let s = 0; s < linje.lengde - 1e-6; s += dS) stasjoner.push(+s.toFixed(4));
  stasjoner.push(+linje.lengde.toFixed(4));

  /* Over denne grensen slippes tegningsgeometrien, og det ene snittet som
     skal vises regnes om igjen ved behov. Uten det sprakk minnet ved rundt
     20 000 profiler - en 21 km lang veg med profil hver meter.
     Optimaliseringen tegner aldri noe, sa den slipper den alltid: den kaller
     hit tusenvis av ganger, og det den vil vite er bare tallene. */
  const GEOMETRIGRENSE = 800;
  const utenGeometri = o.raskt || stasjoner.length > GEOMETRIGRENSE;

  const ettProfil = (s, utvidelse, medGeometri) => beregnTverrprofil({
    linje, terreng: o.terreng, mal, fjell: o.fjell,
    s, vegnivaa: profil.hoyde(s), utvidelse,
    tverrfall: tverrfallVed(mal, o.tverrfallOverstyring, s, linje.punktVed(s).krumning),
    integrasjonssteg: o.integrasjonssteg,
    utenGeometri: medGeometri ? false : utenGeometri
  });
  const kjørProfiler = utvidelser => stasjoner.map((s, i) => ettProfil(s, utvidelser[i]));

  let utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner);
  let profiler = kjørProfiler(utvidelser);

  /* Normalen krever 0,5 m ekstra bredde der veien ligger pa høy fylling
     eller er bratt. Fyllingshøyden er ikke kjent før profilene er regnet,
     sa de stedene far et nytt gjennomløp med den økte bredden. */
  const ekstra = o.raskt ? null : mal.ekstraBredde;
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

  /** Regner om ett tverrprofil med tegningsgeometri, for skjermen. */
  const geometriFor = s => {
    let i = 0;
    for (let j = 1; j < stasjoner.length; j++) {
      if (Math.abs(stasjoner[j] - s) < Math.abs(stasjoner[i] - s)) i = j;
    }
    return ettProfil(stasjoner[i], utvidelser[i], true);
  };

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
  const merknader = vakt.merknader.slice();
  let antallAvkortet = 0;

  /* En linje uten lengde gir null i alle poster. Det er et gyldig tall, og
     nettopp derfor farlig: rapporten ser ferdig ut. */
  if (!(linje.lengde > 1e-6)) {
    merknader.push({
      s: 0, type: 'linje',
      tekst: 'Linjen har ingen lengde – sett minst to punkt som ikke ligger oppå hverandre'
    });
  }

  /* Linjeføringen korter inn kurver som ikke far plass mellom to knekkpunkt.
     Massene blir riktige for kurven som faktisk ble lagt, men veien er ikke
     den som ble tegnet, og det sto ingen steder. */
  for (const a of (linje.advarsler || [])) {
    const kurve = (linje.kurver || []).find(k => k.ip === a.ip);
    merknader.push({ s: kurve ? kurve.sBC : 0, type: 'linje', tekst: a.tekst || String(a) });
  }
  for (const pr of profiler) {
    if (pr.advarsel) merknader.push({ s: pr.s, type: pr.manglerData ? 'data' : 'geometri', tekst: pr.advarsel });
    if (pr.avkortet) antallAvkortet++;
    const stign = profil.stigning(pr.s);
    // kravet i kurven gjelder ogsa pa innkjøringen, jf. utflating før knappe kurver
    const kravRadius = effektivRadius(linje, mal, pr.s);
    const maks = maksStigningFraRadius(mal, kravRadius, stign, mal.lassretning);
    if (Math.abs(stign) > maks + 1e-4) {
      const lassetKlatrer = (stign * (mal.lassretning || 1)) > 0;
      /* Er det kurven som setter grensen, er den enkleste utveien som regel a
         slake ut kurven - ikke a flytte høyder. Da er det verdt a si hvilken
         radius som ville holdt. */
      let rad = null;
      if (isFinite(kravRadius)) {
        for (const r of (mal.stigningIKurve || [])) {
          const g = lassetKlatrer ? r[1] : r[2];
          if (g >= Math.abs(stign) - 1e-9) { rad = r[0]; break; }
        }
      }
      const iKurven = isFinite(pr.radius);
      merknader.push({
        s: pr.s, type: 'stigning',
        tekst: `Stigning ${(Math.abs(stign) * 100).toFixed(1)} % overstiger ${(maks * 100).toFixed(0)} % `
          + `${lassetKlatrer ? 'i lassretningen' : 'i returretningen'} `
          + (iKurven ? `(radius ${pr.radius.toFixed(0)} m)`
            : isFinite(kravRadius) ? `(utflating mot kurve med radius ${kravRadius.toFixed(0)} m)` : '(rettstrekk)')
          + (rad ? ` – holder med radius ${rad > 1e8 ? 'over 60' : rad} m` : ''),
        raad: rad ? { type: 'radius', radius: rad > 1e8 ? 60 : rad } : { type: 'stigning', maks }
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

  /* Vertikalkurvene har ogsa minstekrav i normalen, ulikt for lavbrekk og
     høybrekk. K-verdien er kurvelengden per prosent stigningsbrudd, og
     radien blir 100 ganger den.

     Kontrollen ma ga pa knekkpunktene, ikke pa kurvene som faktisk ble
     bygget. Et knekkpunkt med K=0 far nemlig ingen kurve i det hele tatt -
     og alle laste høyder far K=0. Gikk kontrollen bare pa kurvelisten, slapp
     hele arbeidsmaten med innlagte høyder fra veiplan, tabell eller PDF unna
     uten en eneste kontroll av vertikalgeometrien. */
  const vertikalbrudd = [];
  for (let i = 1; i < (profil.vip || []).length - 1; i++) {
    const g1 = profil.stigninger[i - 1], g2 = profil.stigninger[i];
    const A = g2 - g1;
    if (Math.abs(A) < 5e-3) continue;                 // under en halv prosent er uten betydning
    const lavbrekk = A > 0;
    const krav = lavbrekk ? mal.minVertikalLavbrekk : mal.minVertikalHoybrekk;
    if (!(krav > 0)) continue;

    const kv = (profil.kurver || []).find(c => c.vip === i);
    const bygget = kv ? kv.L : 0;
    const kreves = krav * Math.abs(A);
    if (bygget >= kreves - 1e-6) continue;

    /* Rommet en kurve kan bruke uten a ta over nabo-knekkpunktet sitt: den
       ligger symmetrisk om knekkpunktet, sa halve lengden pa hver side. */
    const plass = Math.min(profil.vip[i].s - profil.vip[i - 1].s,
                           profil.vip[i + 1].s - profil.vip[i].s);
    vertikalbrudd.push({
      s: profil.vip[i].s, lavbrekk, krav, A: Math.abs(A),
      radius: bygget / Math.abs(A), kreves, plass,
      ingenKurve: bygget <= 1e-9,
      trangt: plass < kreves - 1e-6
    });
  }
  if (vertikalbrudd.length) {
    /* Ligger høydene tett, kan hvert lille knekk gi en merknad. Da er en
       liste pa hundre linjer til ingen nytte - de verste sier det samme. */
    /* Sorter etter hvor mye som mangler, ikke etter radius: et knekkpunkt uten
       kurve har radius 0 uansett hvor lite bruddet er. */
    vertikalbrudd.sort((a, b) => (b.kreves - b.radius * b.A) - (a.kreves - a.radius * a.A));
    for (const v of vertikalbrudd.slice(0, 5)) {
      const sted = v.lavbrekk ? 'lavbrekk' : 'høybrekk';
      let tekst;
      if (v.ingenKurve) {
        /* Laste høyder har K=0 og far ingen kurve. Da hjelper det ikke a be om
           en høyere K - punktet har ingen. Si hva knekken er og hvor mye
           avrunding kravet ber om. */
        tekst = `Knekk på ${(v.A * 100).toFixed(1)} % i ${sted} uten avrunding. `
          + `Kravet er radius ${v.krav} m, som trenger ${v.kreves.toFixed(0)} m vertikalkurve`
          + (v.trangt ? `, men det er bare ${v.plass.toFixed(0)} m til nærmeste høyde` : '');
      } else {
        tekst = `Vertikalkurve i ${sted} har radius ${v.radius.toFixed(0)} m, `
          + `kravet er ${v.krav} m – `
          + (v.trangt
            ? `bruddet på ${(v.A * 100).toFixed(1)} % er for skarpt for avstanden mellom høydepunktene`
            : `øk K til ${(v.krav / 100).toFixed(1)}`);
      }
      merknader.push({ s: v.s, type: 'vertikalkurve', tekst });
    }
    if (vertikalbrudd.length > 5) {
      merknader.push({
        s: vertikalbrudd[5].s, type: 'vertikalkurve',
        tekst: `${vertikalbrudd.length - 5} vertikalkurver til er under kravet. `
          + 'De fem skarpeste står over.'
      });
    }
  }

  if (antallAvkortet) {
    merknader.push({
      s: 0, type: 'avkortet',
      tekst: `${antallAvkortet} profiler er avkortet ved beregningsbredden på ${mal.beregningsbredde} m `
        + 'fra vegkant. Masser utenfor er ikke tatt med.'
    });
  }

  return {
    stasjoner, profiler, intervaller, sum, bruckner, merknader,
    antallAvkortet, geometriFor,
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
    utvidelseFraRadius, maksStigningFraRadius, lagUtvidelsesprofil, tverrfallVed,
    effektivRadius
  };
}
