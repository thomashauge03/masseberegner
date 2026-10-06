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
    /* INNKORTINGEN MÅ VÆRE SYMMETRISK, ELLERS AVHENGER VEGEN AV HVILKEN ENDE
       MAN STASJONERER FRA.
       Her sto en grådig klemming: hver VIP ble målt mot naboens ALLEREDE
       reduserte lengde bakover, men mot naboens FULLE ønskede lengde forover –
       fordi løkka går oppover. Den fremste av to som konkurrerer om det samme
       strekket tok da alt, og den bakerste ble stående uten kurve.
       Målt på fire VIP-er med tjue prosents stigningsbrudd: ÉN kurve på
       199,8 m, og knekkpunktet imellom helt uavrundet. Speilvender man den
       samme vegen – stasjonerer fra andre enden – blir høyden 4,995 m
       forskjellig på det samme punktet i terrenget. Det er ikke et
       avrundingsavvik, det er to ulike veger.
       Så ble begge naboene skalert ned med samme faktor, regnet samtidig – det
       ga samme svar begge veier, men ødela en kurve som hadde fått plass: et
       brekk på 5 % som trengte 15 m og hadde 40 m til rådighet, fikk ingenting
       fordi naboen ba om for mye.
       DEN MINSTE FÅR DET DEN TRENGER – samme deling som planlinja, se
       plassdeling.js. Halve kurvelengden ligger på hver side av knekkpunktet,
       og endene er ensidige: den første kurven kan strekke seg bakover til
       profilets start, den siste framover til slutten. Svaret er det samme
       uansett hvilken vei man teller. */
    const plass = [];
    for (let i = 0; i < V.length - 1; i++) plass.push(Math.max(0, (V[i + 1].s - V[i].s) * 0.999));
    const halv = _delPlassV()(L.map(l => (l > 0 ? l / 2 : 0)), plass);
    for (let i = 1; i < V.length - 1; i++) L[i] = halv[i] > 0 ? 2 * halv[i] : 0;
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

  /**
   * Største stigning i tallverdi fra profil 0 til `slutt` – linjas lengde;
   * uten den til siste knekkpunkt.
   *
   * Stigningen står stille på rettstrekkene og går jevnt fra den ene til den
   * andre gjennom en kurve. Den største ligger derfor i et knekkpunkt, i en
   * kurveende eller i en av endene, og der leses den. HER BLE DET PRØVD MED
   * ETT METERS STEG, og et strekk kortere enn steget ble aldri truffet: to
   * høyder én centimeter fra hverandre ga et strekk på −60 000 %, og «Største
   * stigning» sa 10 %. Og uten slutten ble stigningen mot et punkt bak
   * linjeslutt regnet med på hele strekket dit.
   */
  maksStigning(slutt) {
    const V = this.vip;
    if (V.length < 2) return 0;
    const til = Number.isFinite(slutt) ? slutt : V[V.length - 1].s;
    const steder = [0, til];
    for (const v of V) steder.push(v.s);
    for (const c of this.kurver) steder.push(c.sBVC, c.sEVC);
    let m = 0;
    for (const s of steder) {
      if (s < -1e-9 || s > til + 1e-9) continue;
      m = Math.max(m, Math.abs(this.stigning(s)));
    }
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

  /* Er hullet i terrengmodellen bredere enn vinduet, finner glattingen ingen
     verdier a snitte over, og høyden blir NaN. Og NaN sprer seg: `rettProfil`
     regner `dz / dl`, far NaN, og `NaN <= 1e-6` er usant - sa den «retter»
     bruddet ved a trekke NaN fra begge naboene. Etter noen runder er hvert
     eneste knekkpunkt NaN, `Vertikalprofil` kaster dem alle, og veien havner
     pa kote null i hele sin lengde.

     En veg ma ha en høyde overalt. Over hullet trekkes en rett linje mellom
     de nærmeste kjente høydene; er det ingen kjent høyde pa den ene siden,
     videreføres den fra den andre. */
  const kjent = [];
  for (let i = 0; i < n; i++) if (isFinite(glattet[i])) kjent.push(i);
  if (!kjent.length) return [];                    // ingen terrengdata i det hele tatt
  for (let i = 0; i < n; i++) {
    if (isFinite(glattet[i])) continue;
    let før = null, etter = null;
    for (const j of kjent) { if (j < i) før = j; else { etter = j; break; } }
    if (før == null) glattet[i] = glattet[etter];
    else if (etter == null) glattet[i] = glattet[før];
    else {
      const f = (stasjoner[i] - stasjoner[før]) / (stasjoner[etter] - stasjoner[før] || 1);
      glattet[i] = glattet[før] + f * (glattet[etter] - glattet[før]);
    }
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
 * Mellom to låste høyder som ligger lenger fra hverandre enn stigningskravet
 * rekker over: hvert strekk imellom får like mye over kravet.
 *
 * Rettingen flytter det ene strekket helt ned til grensen og skyver bruddet
 * videre, og et umulig krav ble liggende skjevt – fem strekk på 14,9 % og ett
 * på 10,0, der 14,1 overalt var det minste mulige. Det var et fastpunkt: ti
 * kall til endret ingenting, og annenhver vei ga 10 / 18,2 / 14,1. Er kravet
 * umulig, er det kompromisset med minst brudd som skal stå, og det er dette.
 */
function fordelUmuligeKrav(vip, maksFor) {
  const laste = [];
  for (let i = 0; i < vip.length; i++) if (vip[i].laast && Number.isFinite(vip[i].z)) laste.push(i);
  const stigningMot = (p, q) => (q.s - p.s > 1e-6 ? (q.z - p.z) / (q.s - p.s) : null);
  for (let n = 0; n + 1 < laste.length; n++) {
    const p = laste[n], q = laste[n + 1];
    if (q - p < 2) continue;                        // ingen frie punkt imellom
    if (vip.slice(p, q + 1).some(v => !Number.isFinite(v.z))) continue;
    const dz = vip[q].z - vip[p].z, tegn = Math.sign(dz) || 1;
    const lengde = vip[q].s - vip[p].s;
    if (lengde < 1e-6) continue;
    // det hvert strekk tåler; innvendig er naboen like bratt, så unntaket for korte strekk gjelder ikke
    const tillatt = [];
    let rekker = 0;
    for (let i = p; i < q; i++) {
      const dl = vip[i + 1].s - vip[i].s;
      const gFor = i > p ? tegn : (i > 0 ? stigningMot(vip[i - 1], vip[i]) : null);
      const gEtter = i + 1 < q ? tegn : (i + 2 < vip.length ? stigningMot(vip[i + 1], vip[i + 2]) : null);
      const g = maksFor(vip[i].s, vip[i + 1].s, tegn * Math.abs(dz) / lengde, gFor, gEtter);
      tillatt.push(g);
      rekker += g * Math.max(0, dl);
    }
    if (Math.abs(dz) <= rekker + 1e-9) continue;     // kravet lar seg holde – rettingen har tatt det
    const over = (Math.abs(dz) - rekker) / lengde;
    let z = vip[p].z;
    for (let i = p; i < q - 1; i++) {
      z += tegn * (tillatt[i - p] + over) * (vip[i + 1].s - vip[i].s);
      vip[i + 1].z = z;
    }
  }
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
  /* TAKET OG GULVET ER MÅLT, IKKE GJETTET.
     Se den lange forklaringen i kallet fra app.js: fyllingshøyden som meldes er
     den største NOE STED i tverrsnittet, mens `v.z - terreng(v.s)` bare er
     høyden på senterlinja. På en tverrfallende li er de to helt forskjellige
     tall, og rettingen jaget det ene mens merknaden talte det andre.
     Er de oppgitt, er `tak(s)` og `gulv(s)` absolutte koter senterlinja må
     holde seg mellom – regnet av det som faktisk ble målt i snittet. */
  const takVed = opsjoner.takVed;
  const gulvVed = opsjoner.gulvVed;
  const harMaalt = !!(takVed || gulvVed);

  for (let runde = 0; runde < 2000; runde++) {
    let verstBrudd = 0;

    /* Avstanden til terrenget dras bare halvveis inn hver runde, mens
       stigningskravet settes helt.
       Grunnen: stigningen er et krav fra veinormalen, mens fyllingsgrensen er
       var egen mening om hva som er verdt a bygge. Nar de star mot hverandre
       - som i en bratt li der veien ma brues over en søkk - ma stigningen
       vinne, ellers ender man med en veg som verken er lovlig eller billig.
       Det som ikke gar opp kommer som merknad i stedet. */
    if (harMaalt) {
      for (const v of vip) {
        if (v.laast || !Number.isFinite(v.z)) continue;
        const tak = takVed ? takVed(v.s) : Infinity;
        const gulv = gulvVed ? gulvVed(v.s) : -Infinity;
        /* Krever snittet BÅDE at man kommer ned og at man kommer opp – en dyp
           skjæring på oversiden og en høy fylling på undersiden av samme
           tverrfall – finnes det ingen kote som holder begge. Da gjør vi det
           samme som ellers: går halvveis mot hver, lander i et kompromiss, og
           lar merknaden fortelle hva som står igjen. */
        if (Number.isFinite(tak) && v.z > tak) { v.z -= (v.z - tak) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
        if (Number.isFinite(gulv) && v.z < gulv) { v.z += (gulv - v.z) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
      }
    } else if (terrengVed && (maksOver != null || maksUnder != null)) {
      /* Uten et målt snitt – første forslag, før noe er regnet – er høyden over
         terrenget på senterlinja det eneste man har. Det er riktig som første
         gjetning, og galt som fasit. */
      for (const v of vip) {
        if (v.laast) continue;
        const t = terrengVed(v.s);
        if (!Number.isFinite(t) || !Number.isFinite(v.z)) continue;
        if (maksOver != null && v.z - t > maksOver) { v.z -= (v.z - t - maksOver) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
        if (maksUnder != null && t - v.z > maksUnder) { v.z += (t - v.z - maksUnder) * 0.5; verstBrudd = Math.max(verstBrudd, 1); }
      }
    }

    for (let i = 0; i < vip.length - 1; i++) {
      const dl = vip[i + 1].s - vip[i].s;
      if (dl < 1e-6) continue;
      const a = vip[i], b = vip[i + 1];
      if (a.laast && b.laast) continue;          // dette strekket er bestemt
      /* En høyde som ikke er et tall ma ikke bli med videre. `NaN <= 1e-6` er
         usant, sa uten dette gikk rettingen i gang og trakk NaN fra begge
         naboene - og etter noen runder var hvert eneste knekkpunkt NaN. */
      if (!Number.isFinite(a.z) || !Number.isFinite(b.z)) continue;
      const dz = b.z - a.z;
      /* Kravet avhenger av fortegnet, sa det ma hentes pa nytt hver runde. Og
         av naboene: et kort, bratt rettstrekk er lovlig bare når det står
         alene (normalens unntak for strekk inntil 60 m), så stigningen på
         hver side følger med. */
      const stigningMot = (p, q) => (q.s - p.s > 1e-6 && Number.isFinite(p.z) && Number.isFinite(q.z)
        ? (q.z - p.z) / (q.s - p.s) : null);
      const grense = maksFor(a.s, b.s, dz / dl,
        i > 0 ? stigningMot(vip[i - 1], a) : null,
        i + 2 < vip.length ? stigningMot(b, vip[i + 2]) : null);
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
  fordelUmuligeKrav(vip, maksFor);
  /* HVA SOM IKKE GIKK, OG HVOR MYE SOM MANGLET.
     Uten dette kunne rettingen bare si «fant ingen bedre profil» – en setning
     som forteller at noe feilet, ikke hva. Står et knekkpunkt igjen over taket
     sitt når løkka er ferdig, er det fordi noe annet holder det oppe:
     stigningskravet, en låst høyde, eller et tak i den andre enden som drar
     motsatt vei. Tallet under er nøyaktig hvor mange meter som manglet, og det
     er den ene opplysningen som avgjør om brukeren skal slakke et krav, låse
     opp en høyde eller legge om linja. */
  const sperret = { antall: 0, verst: 0, s: null };
  if (harMaalt) {
    for (const v of vip) {
      if (!Number.isFinite(v.z)) continue;
      const tak = takVed ? takVed(v.s) : Infinity;
      const gulv = gulvVed ? gulvVed(v.s) : -Infinity;
      const mangler = Math.max(
        Number.isFinite(tak) ? v.z - tak : 0,
        Number.isFinite(gulv) ? gulv - v.z : 0);
      if (mangler > 0.05) {
        sperret.antall++;
        if (mangler > sperret.verst) { sperret.verst = mangler; sperret.s = v.s; }
      }
    }
  }
  vip.sperret = sperret;
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
/**
 * Lengden kurven i knekkpunkt `i` faktisk far nar profilen bygges.
 *
 * `_bygg` korter inn kurver som ellers ville tatt over naboens, sa den ønskede
 * lengden K·A er ikke nødvendigvis den man far. Rettingen ma vite hva den har
 * a ga pa, ellers setter den K i en plass som ikke finnes.
 */
function byggetLengde(vip, i) {
  const vp = new Vertikalprofil(vip.map(v => ({ s: v.s, z: v.z, k: v.k })));
  // knekkpunktene kan vaere ryddet i konstruktøren, sa finn igjen pa stasjon
  const j = vp.vip.findIndex(v => Math.abs(v.s - vip[i].s) < 1e-6);
  if (j < 0) return 0;
  const c = (vp.kurver || []).find(x => x.vip === j);
  return c ? c.L : 0;
}

function rettVertikalgeometri(vip, opsjoner = {}) {
  const kravLav = opsjoner.minVertikalLavbrekk || 0;
  const kravHoy = opsjoner.minVertikalHoybrekk || 0;
  const maksAvvikLast = opsjoner.maksAvvikLast != null ? opsjoner.maksAvvikLast : 0.01;
  if (!(kravLav > 0) && !(kravHoy > 0)) return { satt: 0, glattet: 0, laste: 0, senket: 0 };

  let satt = 0, glattet = 0, senket = 0;
  /* De låste som står i veien, telles én gang hver – her ble de talt én gang
     per runde, og to låste høyder ble meldt som 324. */
  const lasteIVeien = new Set();
  /* EN NABO MED HØYERE K ENN KRAVET TAR PLASSEN. Her ble K bare satt opp:
     en kurve brukeren hadde gitt K = 8, tok plassen fra naboen, og da ble
     naboens knekk flatet ut – høyden flyttet – i stedet for at K ble satt ned
     til det kravet trenger. Målt med brukersatt K: 363 av 400 brudd sto igjen.
     Nå gir naboen plassen tilbake først; det flytter ingen høyde. En nabo uten
     krav (et brudd under en halv prosent) røres ikke – kurven der er liten. */
  const senk = j => {
    if (j < 1 || j > vip.length - 2 || vip[j].laast) return false;
    const a = vip[j].s - vip[j - 1].s, b = vip[j + 1].s - vip[j].s;
    if (a < 1e-6 || b < 1e-6) return false;
    const Aj = (vip[j + 1].z - vip[j].z) / b - (vip[j].z - vip[j - 1].z) / a;
    if (Math.abs(Aj) < 5e-3) return false;
    const kJ = (Aj > 0 ? kravLav : kravHoy) / 100;
    if (!(kJ > 0) || !(vip[j].k > kJ + 1e-9)) return false;
    vip[j].k = kJ;
    return true;
  };
  for (let runde = 0; runde < 400; runde++) {
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
      /* Plassen er ikke bare avstanden til naboknekkpunktene. `_bygg` korter
         inn en kurve sa den ikke tar over naboens, sa naboens kurve spiser av
         plassen ogsa. Med `min(dFør, dEtter)` alene trodde rettingen at det
         var rom der det ikke var, satte K, og kom tilbake til samme brudd
         runde etter runde: to av sju brudd ble aldri borte.

         Her leses den lengden profilen faktisk bygger, sa rettingen vet hva
         den har a gaa pa. */
      const bygd = byggetLengde(vip, i);
      const plass = Math.max(bygd, Math.min(dFor, dEtter) * 0.5);

      if (kreves <= plass + 1e-9) {
        const trengsK = krav / 100;
        if (vip[i].k >= trengsK - 1e-9 && bygd >= kreves - 1e-6) continue;
        if (vip[i].k >= trengsK - 1e-9) {
          /* K er høy nok, men kurven blir likevel for kort - naboene tar
             plassen. Da ma knekken bli mindre, som under. */
        } else {
          // avviket kurven far fra selve knekkpunktet
          const avvik = Math.abs(A) * kreves / 8;
          if (vip[i].laast && avvik > maksAvvikLast) { lasteIVeien.add(i); continue; }
          vip[i].k = trengsK;
          satt++; endret = true;
          continue;
        }
      }

      // naboene gir plassen tilbake før en høyde flyttes – se `senk`
      if (senk(i - 1) | senk(i + 1)) { senket++; endret = true; continue; }

      /* For skarpt for avstanden: knekken selv ma bli mindre. Med plass
         meter tilgjengelig er største brudd som lar seg runde av
         plass/krav - høyden dras mot den tangentskjæringen. */
      if (vip[i].laast) { lasteIVeien.add(i); continue; }
      const maksA = plass / krav;
      const ønsketA = Math.sign(A) * maksA;
      /* Holder naboene i ro og løser for høyden som gir ønsket brudd:
         (z2-z)/dEtter - (z-z1)/dFor = ønsketA  */
      const z1 = vip[i - 1].z, z2 = vip[i + 1].z;
      const nyZ = (z2 / dEtter + z1 / dFor - ønsketA) / (1 / dEtter + 1 / dFor);
      if (!isFinite(nyZ)) continue;
      /* Står høyden alt der, er det ingenting å flytte. Her ble det likevel
         talt som en glatting og en endring – og løkka gikk alle 400 rundene
         uten å gjøre noe. */
      if (Math.abs(nyZ - vip[i].z) < 1e-9) continue;
      // halvveis hver runde, sa naboknekkpunktene far følge med
      vip[i].z += (nyZ - vip[i].z) * 0.5;
      vip[i].k = Math.max(vip[i].k, krav / 100);
      glattet++; endret = true;
    }
    if (!endret) break;
  }
  // stedene, så den som kaller flere ganger kan telle hver låste høyde én gang
  return { satt, glattet, laste: lasteIVeien.size, senket, lasteSteder: [...lasteIVeien].map(i => vip[i].s) };
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

/**
 * Hvor langt bak linjeslutt et punkt kan ligge og likevel regnes som på den.
 *
 * En høyde lagt inn på slutten får profilnummeret rundet til centimeter
 * (`+L.toFixed(2)`), og annenhver gang havner det litt bak. Med en grense på
 * en mikrometer ble endepunktet da merket «bak linjeslutt – brukes ikke» i
 * halvparten av tilfellene.
 */
const VIP_SLUTTMARGIN = 0.005;

/**
 * Høydene slik beregningen bruker dem på en linje som er L lang – en kopi,
 * lista brukeren har, røres ikke.
 *
 * HER STO `justerProfilTilLengde`, og den ble kjørt ved hver omregning. Den
 * slettet knekkpunktene bak linjeslutt – også de låste – og la et nytt
 * endepunkt inn i prosjektet. Kortet man linja et øyeblikk mens man dro i et
 * knekkpunkt, var høydene der borte for godt, og autolagringen skrev det til
 * disk. Høyder endres på knapper, ikke av en omregning.
 *
 * Nå får beregningen en kopi, ryddet som `Vertikalprofil` rydder: sortert,
 * bare tall, og det siste av to punkt på samme profil.
 *
 * DET FØRSTE PUNKTET BAK SLUTTEN ER MED, SOM DET ER. Profilen regnes som om
 * linja fortsatte, og vegen som er igjen blir den samme som før linja ble
 * kortet. Her sto et nytt endepunkt på linjeslutt i stedet, og det klemte den
 * siste vertikalkurven inn til avstanden dit: med et knekkpunkt 0,3 m før
 * slutten fikk kurven 0,6 m der kravet var 22 – et brudd i rapporten som
 * «Rett opp» ikke så, fordi den rettet profilen slik brukeren har den.
 * Punktene lenger bak er ikke med. Blir linja lengre igjen, er alle med.
 *
 * Mangler profilen et stykke i enden, forlenges den med den siste stigningen.
 */
function vipTilLengde(vip, L) {
  const sortert = (vip || []).filter(v => v && Number.isFinite(v.s) && Number.isFinite(v.z))
    .map(v => Object.assign({}, v))
    .sort((a, b) => a.s - b.s);
  const V = sortert.filter((p, i) => i === sortert.length - 1 || sortert[i + 1].s - p.s > 1e-6);
  if (V.length < 2 || !(L > 0)) return V;
  const inne = V.filter(v => v.s <= L + VIP_SLUTTMARGIN);
  const bak = V.find(v => v.s > L + VIP_SLUTTMARGIN);
  const paa = (a, b, s) => a.z + (b.z - a.z) * (s - a.s) / (b.s - a.s);
  if (bak) {
    if (!inne.length) {
      // hele profilen ligger bak slutten: linja mellom de to første, fra start til slutt
      return [{ s: 0, z: paa(V[0], V[1], 0), k: 0 }, { s: L, z: paa(V[0], V[1], L), k: 0 }];
    }
    inne.push(bak);
    return inne;
  }
  const siste = V[V.length - 1];
  if (L - siste.s > 0.5) V.push({ s: L, z: paa(V[V.length - 2], siste, L), k: siste.k });
  return V;
}

// global i nettleseren, modul i node – se plassdeling.js
function _delPlassV() {
  return typeof delPlass === 'function' ? delPlass : require('./plassdeling.js').delPlass;
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
    lagTerrengoppslag, lesHoydetabell, vipTilLengde, VIP_SLUTTMARGIN
  };
}
