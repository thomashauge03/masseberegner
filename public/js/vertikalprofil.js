'use strict';
/**
 * Vertikal linjeføring - lengdeprofilen.
 *
 * Profilen legges inn som knekkpunkt (VIP) med profilnummer og høyde.
 * Mellom knekkpunktene gar veien rett med konstant stigning. I hvert
 * innvendig knekkpunkt legges det inn en parabolsk vertikalkurve med
 * lengde  L = K * A,  der A er stigningsbruddet i prosent og K er
 * K-verdien - samme notasjon som "VC1 K=1.0" i veiplanene.
 */

class Vertikalprofil {
  /**
   * @param {Array<{s:number,z:number,k:number}>} vip
   */
  constructor(vip) {
    /* To knekkpunkt pa samme profilnummer gir et strekk uten lengde. Stigningen
       der er ikke et tall, og profilen far et loddrett sprang som ingen
       stigningskontroll ser: to punkt pa profil 50 med høyde 110 og 90 ga
       h(49,9) = 109,98 og h(50,1) = 90,02 - tjue meter rett ned - mens
       stigningen ble meldt som 20 % pa begge sider. Siste punkt gjelder. */
    const sortert = (vip || []).slice()
      .filter(p => p && isFinite(p.s) && isFinite(p.z))
      .sort((a, b) => a.s - b.s)
      .map(p => ({ s: p.s, z: p.z, k: Math.max(0, isFinite(p.k) ? p.k : 1) }));
    this.vip = sortert.filter((p, i) => i === sortert.length - 1 || sortert[i + 1].s - p.s > 1e-6);
    this.stigninger = [];
    this.kurver = [];
    this._bygg();
  }

  _bygg() {
    const V = this.vip;
    if (V.length < 2) return;
    for (let i = 0; i < V.length - 1; i++) {
      const dl = V[i + 1].s - V[i].s;
      this.stigninger.push(dl > 1e-9 ? (V[i + 1].z - V[i].z) / dl : 0);
    }
    // Ønsket kurvelengde per innvendig VIP
    const L = new Array(V.length).fill(0);
    for (let i = 1; i < V.length - 1; i++) {
      const A = Math.abs(this.stigninger[i] - this.stigninger[i - 1]) * 100; // stigningsbrudd i prosent
      L[i] = V[i].k * A;
    }
    // Kort inn kurver som ellers ville overlappe hverandre eller endepunktene
    for (let runde = 0; runde < 12; runde++) {
      let endret = false;
      for (let i = 1; i < V.length - 1; i++) {
        const forrigeGrense = (i === 1) ? (V[1].s - V[0].s) : (V[i].s - V[i - 1].s) - L[i - 1] / 2;
        const nesteGrense = (i === V.length - 2) ? (V[i + 1].s - V[i].s) : (V[i + 1].s - V[i].s) - L[i + 1] / 2;
        const maks = 2 * Math.max(0, Math.min(forrigeGrense, nesteGrense)) * 0.999;
        if (L[i] > maks) { L[i] = maks; endret = true; }
      }
      if (!endret) break;
    }
    for (let i = 1; i < V.length - 1; i++) {
      if (L[i] <= 1e-9) continue;
      const g1 = this.stigninger[i - 1], g2 = this.stigninger[i];
      this.kurver.push({
        vip: i, L: L[i], k: V[i].k,
        sBVC: V[i].s - L[i] / 2, sEVC: V[i].s + L[i] / 2,
        zBVC: V[i].z - g1 * L[i] / 2,
        g1, g2, A: (g2 - g1)
      });
    }
  }

  _kurveVed(s) {
    for (const c of this.kurver) if (s >= c.sBVC && s <= c.sEVC) return c;
    return null;
  }

  hoyde(s) {
    const V = this.vip;
    if (!V.length) return 0;
    if (V.length === 1) return V[0].z;
    const c = this._kurveVed(s);
    if (c) {
      const x = s - c.sBVC;
      return c.zBVC + c.g1 * x + c.A * x * x / (2 * c.L);
    }
    if (s <= V[0].s) return V[0].z + this.stigninger[0] * (s - V[0].s);
    for (let i = 0; i < V.length - 1; i++) {
      if (s <= V[i + 1].s) return V[i].z + this.stigninger[i] * (s - V[i].s);
    }
    const siste = V.length - 1;
    return V[siste].z + this.stigninger[siste - 1] * (s - V[siste].s);
  }

  /** Stigning som desimaltall (0,08 = 8 %). */
  stigning(s) {
    const V = this.vip;
    if (V.length < 2) return 0;
    const c = this._kurveVed(s);
    if (c) return c.g1 + c.A * (s - c.sBVC) / c.L;
    if (s <= V[0].s) return this.stigninger[0];
    for (let i = 0; i < V.length - 1; i++) if (s <= V[i + 1].s) return this.stigninger[i];
    return this.stigninger[this.stigninger.length - 1];
  }

  /** Største stigning i tallverdi over hele profilen. */
  maksStigning(steg = 1) {
    let m = 0;
    const slutt = this.vip.length ? this.vip[this.vip.length - 1].s : 0;
    for (let s = 0; s <= slutt; s += steg) m = Math.max(m, Math.abs(this.stigning(s)));
    return m;
  }
}

/**
 * Lager et forslag til lengdeprofil ut fra terrenget.
 *
 * Terrenget glattes, knekkpunktene legges pa den glattede linjen, og deretter
 * tvinges stigningen ned under makskravet. Til slutt løftes eller senkes hele
 * profilen slik at den i snitt ligger pa terrenget - uten det ville profilen
 * "seile" bort fra bakken i bratt lende der kravet ikke lar seg oppfylle.
 *
 * @param {function} [opsjoner.maksStigningVed] (profilnummer) => tillatt stigning.
 *        Brukes til a ta hensyn til at krappe kurver har strengere krav.
 * @param {function} [opsjoner.maksStigningFor] (sFra, sTil, stigning) => tillatt.
 *        Foretrekkes framfor maksStigningVed, fordi kravet ogsa avhenger av
 *        hvilken vei det bærer: i lassretningen er det strengere enn i
 *        returretningen. Da ma fortegnet pa stigningen vaere kjent, og det er
 *        det først nar strekket regnes.
 * @param {Array<{s,z,k}>} [opsjoner.laste] Høyder som er bestemt pa forhand.
 *        Disse blir liggende nøyaktig der de star; resten av profilen legger
 *        seg etter dem.
 */
function foreslaProfil(stasjoner, terrengZ, opsjoner = {}) {
  const vipAvstand = opsjoner.vipAvstand || 40;
  const maksStigning = opsjoner.maksStigning || 0.20;
  const maksVed = opsjoner.maksStigningVed || (() => maksStigning);
  const maksFor = opsjoner.maksStigningFor
    || ((sA, sB) => Math.min(maksVed(sA), maksVed(sB)));
  const kVerdi = opsjoner.k == null ? 1.0 : opsjoner.k;
  const laste = (opsjoner.laste || []).slice().sort((a, b) => a.s - b.s);
  // Hvor langt fra terrenget veien far ligge. Uten dette kan profilen legge
  // seg høyt over bakken i en dal og gi en fylling som stikker titalls meter
  // ut til sidene - masser som i praksis aldri ville blitt bygd.
  const maksOver = opsjoner.maksOverTerreng;
  const maksUnder = opsjoner.maksUnderTerreng;
  const n = stasjoner.length;
  if (n < 2) return [];

  // 1) Glatt terrenget med et glidende gjennomsnitt
  const vindu = Math.max(1, Math.round(vipAvstand / Math.max(1e-6, stasjoner[1] - stasjoner[0]) / 2));
  const glattet = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, m = 0;
    for (let j = Math.max(0, i - vindu); j <= Math.min(n - 1, i + vindu); j++) {
      if (isFinite(terrengZ[j])) { sum += terrengZ[j]; m++; }
    }
    glattet[i] = m ? sum / m : terrengZ[i];
  }

  // 2) Plukk ut knekkpunkt med jevn avstand
  /* Er ønsket knekkpunktavstand mindre enn avstanden mellom stasjonene, faller
     flere knekkpunkt pa samme stasjon. To knekkpunkt pa samme profilnummer gir
     et strekk uten lengde, og stigningen der er ikke et tall - derfor sikres
     det at hver stasjon bare brukes en gang. */
  const vip = [];
  const brukt = new Set();
  const slutt = stasjoner[n - 1];
  const leggTil = (i) => {
    if (brukt.has(i)) return;
    brukt.add(i);
    vip.push({ s: stasjoner[i], z: glattet[i], k: kVerdi });
  };
  for (let s = 0; s < slutt - 1e-6; s += vipAvstand) leggTil(naermesteIndeks(stasjoner, s));
  leggTil(n - 1);

  // 3) Sett inn høydene som allerede er bestemt, og hold dem last
  const SAMME = 1e-3;                       // en millimeter fra hverandre er samme punkt
  for (const l of laste) {
    if (l.s < -1e-6 || l.s > slutt + 1e-6) continue;
    const finnes = vip.find(v => Math.abs(v.s - l.s) < SAMME);
    if (finnes) { finnes.z = l.z; finnes.k = l.k == null ? finnes.k : l.k; finnes.laast = true; }
    else vip.push({ s: l.s, z: l.z, k: l.k == null ? kVerdi : l.k, laast: true });
  }
  vip.sort((a, b) => a.s - b.s);
  // to høyder pa samme sted ville gitt samme problem; en last høyde vinner
  for (let i = vip.length - 1; i > 0; i--) {
    if (vip[i].s - vip[i - 1].s >= SAMME) continue;
    const kast = (vip[i - 1].laast && !vip[i].laast) ? i : i - 1;
    vip.splice(kast, 1);
  }

  // 4) Tving stigningen under makskravet.
  //    Hvert brudd rettes ved a flytte begge endene like mye, sa formen holdes.
  //    Laste punkt star i ro, sa naboen ma ta hele rettingen alene.
  const terrengVed = lagTerrengoppslag(stasjoner, glattet);

  const ønsket = vip.map(v => v.z);
  rettProfil(vip, { maksStigningFor: maksFor, maksOverTerreng: maksOver, maksUnderTerreng: maksUnder, terrengVed });

  // 5) Uten laste punkt kan hele profilen løftes eller senkes tilbake pa
  //    terrenget. Et konstant skift endrer ingen stigninger, sa makskravet
  //    holdes fortsatt. Med laste punkt er profilen allerede forankret.
  //    Grensene mot terrenget er allerede tatt hensyn til over, sa et skift
  //    her ville bare brutt dem igjen.
  if (!laste.length && maksOver == null && maksUnder == null) {
    let skift = 0;
    for (let i = 0; i < vip.length; i++) skift += ønsket[i] - vip[i].z;
    skift /= vip.length;
    for (const v of vip) v.z += skift;
  }

  return vip;
}

function lagTerrengoppslag(stasjoner, hoyder) {
  const n = stasjoner.length;
  return s => {
    if (!n) return NaN;
    if (s <= stasjoner[0]) return hoyder[0];
    if (s >= stasjoner[n - 1]) return hoyder[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stasjoner[m] < s) lo = m; else hi = m; }
    const f = (s - stasjoner[lo]) / (stasjoner[hi] - stasjoner[lo] || 1);
    return hoyder[lo] + f * (hoyder[hi] - hoyder[lo]);
  };
}

/**
 * Retter en profil slik at den holder stigningskravet og ikke legger seg
 * lenger fra terrenget enn tillatt.
 *
 * Laste høyder star i ro - de er punkt brukeren har bestemt, og et strekk
 * mellom to laste punkt kan derfor ikke rettes i det hele tatt.
 *
 * Bade stigningskravet og avstanden til terrenget er konvekse krav, sa det
 * gar an a veksle mellom dem til begge er oppfylt. Star de mot hverandre -
 * som over en trang kløft - ender det i et kompromiss i stedet for a løpe
 * løpsk, og resten fanges opp av merknadene.
 */
function rettProfil(vip, opsjoner = {}) {
  const maksFor = opsjoner.maksStigningFor || (() => 1);
  const maksOver = opsjoner.maksOverTerreng;
  const maksUnder = opsjoner.maksUnderTerreng;
  const terrengVed = opsjoner.terrengVed;

  for (let runde = 0; runde < 2000; runde++) {
    let verstBrudd = 0;

    /* Avstanden til terrenget dras bare halvveis inn hver runde, mens
       stigningskravet settes helt.
       Grunnen: stigningen er et krav fra veinormalen, mens fyllingsgrensen er
       var egen mening om hva som er verdt a bygge. Nar de star mot hverandre
       - som i en bratt li der veien ma brues over en søkk - ma stigningen
       vinne, ellers ender man med en veg som verken er lovlig eller billig.
       Det som ikke gar opp kommer som merknad i stedet. */
    if (terrengVed && (maksOver != null || maksUnder != null)) {
      for (const v of vip) {
        if (v.laast) continue;
        const t = terrengVed(v.s);
        if (!isFinite(t)) continue;
        if (maksOver != null && v.z - t > maksOver) { v.z -= (v.z - t - maksOver) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
        if (maksUnder != null && t - v.z > maksUnder) { v.z += (t - v.z - maksUnder) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
      }
    }

    for (let i = 0; i < vip.length - 1; i++) {
      const dl = vip[i + 1].s - vip[i].s;
      if (dl < 1e-6) continue;
      const a = vip[i], b = vip[i + 1];
      if (a.laast && b.laast) continue;          // dette strekket er bestemt
      const dz = b.z - a.z;
      // Kravet avhenger av fortegnet, sa det ma hentes pa nytt hver runde
      const grense = maksFor(a.s, b.s, dz / dl);
      const brudd = Math.abs(dz / dl) - grense;
      if (brudd <= 1e-6) continue;
      verstBrudd = Math.max(verstBrudd, brudd);
      const overskudd = dz - Math.sign(dz) * grense * dl;
      if (a.laast) b.z -= overskudd;
      else if (b.laast) a.z += overskudd;
      else { b.z -= overskudd / 2; a.z += overskudd / 2; }
    }
    if (verstBrudd < 1e-5) break;
  }
  return vip;
}

/**
 * Retter vertikalgeometrien slik at kravet til vertikalkurveradius holder.
 *
 * `rettProfil` flytter høyder, men rører aldri K - og et knekkpunkt med K=0
 * far ingen kurve i det hele tatt. Alle laste høyder far K=0, sa hele
 * arbeidsmaten med innlagte høyder kom gjennom rettingen med
 * vertikalgeometrien urørt.
 *
 * To ting kan gjøres, og de trengs begge:
 *
 *   1. Sette K høyt nok. Kravet er en radius, og radien er hundre ganger K,
 *      sa K = krav/100. Dette holder sa lenge kurven far plass mellom
 *      naboknekkpunktene.
 *
 *   2. Er bruddet for skarpt til at kurven far plass, hjelper ingen K -
 *      da ma selve knekken bli mindre. Høyden dras mot der de to tangentene
 *      ville møttes med et slakere brudd.
 *
 * Kurven ligger symmetrisk om knekkpunktet, sa veien havner A·L/8 unna
 * høyden som star der. For en last høyde er det en forskyvning bort fra det
 * brukeren har bestemt, og da settes K bare nar avviket blir under en
 * centimeter. Resten meldes fra om.
 *
 * @returns {{satt:number, glattet:number, laste:number}} hva som ble gjort
 */
function rettVertikalgeometri(vip, opsjoner = {}) {
  const kravLav = opsjoner.minVertikalLavbrekk || 0;
  const kravHoy = opsjoner.minVertikalHoybrekk || 0;
  const maksAvvikLast = opsjoner.maksAvvikLast != null ? opsjoner.maksAvvikLast : 0.01;
  if (!(kravLav > 0) && !(kravHoy > 0)) return { satt: 0, glattet: 0, laste: 0 };

  let satt = 0, glattet = 0, laste = 0;
  for (let runde = 0; runde < 60; runde++) {
    let endret = false;
    for (let i = 1; i < vip.length - 1; i++) {
      const dFor = vip[i].s - vip[i - 1].s;
      const dEtter = vip[i + 1].s - vip[i].s;
      if (dFor < 1e-6 || dEtter < 1e-6) continue;
      const g1 = (vip[i].z - vip[i - 1].z) / dFor;
      const g2 = (vip[i + 1].z - vip[i].z) / dEtter;
      const A = g2 - g1;
      if (Math.abs(A) < 5e-3) continue;
      const krav = A > 0 ? kravLav : kravHoy;
      if (!(krav > 0)) continue;

      const kreves = krav * Math.abs(A);
      const plass = Math.min(dFor, dEtter);

      if (kreves <= plass + 1e-9) {
        const trengsK = krav / 100;
        if (vip[i].k >= trengsK - 1e-9) continue;
        // avviket kurven far fra selve knekkpunktet
        const avvik = Math.abs(A) * kreves / 8;
        if (vip[i].laast && avvik > maksAvvikLast) { laste++; continue; }
        vip[i].k = trengsK;
        satt++; endret = true;
        continue;
      }

      /* For skarpt for avstanden: knekken selv ma bli mindre. Med plass
         meter tilgjengelig er største brudd som lar seg runde av
         plass/krav - høyden dras mot den tangentskjæringen. */
      if (vip[i].laast) { laste++; continue; }
      const maksA = plass / krav;
      const ønsketA = Math.sign(A) * maksA;
      /* Holder naboene i ro og løser for høyden som gir ønsket brudd:
         (z2-z)/dEtter - (z-z1)/dFor = ønsketA  */
      const z1 = vip[i - 1].z, z2 = vip[i + 1].z;
      const nyZ = (z2 / dEtter + z1 / dFor - ønsketA) / (1 / dEtter + 1 / dFor);
      if (!isFinite(nyZ)) continue;
      // halvveis hver runde, sa naboknekkpunktene far følge med
      vip[i].z += (nyZ - vip[i].z) * 0.5;
      vip[i].k = Math.max(vip[i].k, krav / 100);
      glattet++; endret = true;
    }
    if (!endret) break;
  }
  return { satt, glattet, laste };
}

/**
 * Leser en tabell med profilnummer og høyder, slik den kan limes inn fra
 * en veiplan eller et regneark. Tar bade mellomrom, semikolon, komma og
 * tabulator, bade punktum og komma som desimalskille, og bade "250" og
 * "0+250" som profilnummer.
 */
function lesHoydetabell(tekst) {
  const rader = [];
  for (const linje of String(tekst).split(/\r?\n/)) {
    let reint = linje.trim();
    if (!reint || /^[a-zæøåA-ZÆØÅ]/.test(reint)) continue;      // hopp over overskrifter

    // Komma er desimaltegn i Norge, men blir ogsa brukt til a skille felt.
    // Finnes det et annet skilletegn pa linjen, ma kommaet vaere desimaltegn.
    if (/[;\t\s]/.test(reint)) reint = reint.replace(/(\d),(\d)/g, '$1.$2');

    const biter = reint.split(/[\s;,\t]+/).filter(Boolean);
    if (biter.length < 2) continue;

    // profilnummer: "250", "0+250" eller "1+250"
    let s = null;
    const km = biter[0].match(/^(\d+)\+(\d+(?:[.,]\d+)?)$/);
    if (km) s = parseInt(km[1], 10) * 1000 + parseFloat(km[2].replace(',', '.'));
    else s = parseFloat(biter[0].replace(',', '.'));

    // høyden er det neste tallet som ser ut som en høyde
    let z = null;
    for (let i = 1; i < biter.length; i++) {
      const v = parseFloat(biter[i].replace(',', '.'));
      if (isFinite(v)) { z = v; break; }
    }
    if (isFinite(s) && z !== null && isFinite(z)) rader.push({ s, z });
  }
  rader.sort((a, b) => a.s - b.s);
  // fjern doble profilnummer - siste vinner
  const ut = [];
  for (const r of rader) {
    if (ut.length && Math.abs(ut[ut.length - 1].s - r.s) < 1e-6) ut[ut.length - 1] = r;
    else ut.push(r);
  }
  return ut;
}

function naermesteIndeks(arr, v) {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m; else hi = m;
  }
  return (Math.abs(arr[lo] - v) <= Math.abs(arr[hi] - v)) ? lo : hi;
}

if (typeof module !== 'undefined') {
  module.exports = {
    Vertikalprofil, foreslaProfil, rettProfil, rettVertikalgeometri,
    lagTerrengoppslag, lesHoydetabell
  };
}
