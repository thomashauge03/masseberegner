'use strict';
/**
 * Veiklasser etter Normaler for landbruksveier med byggebeskrivelse
 * (Landbruks- og matdepartementet / Skogkurs).
 *
 * Tallene er hentet rett fra normalen sine klassekapitler, slik at et
 * hurtigvalg setter opp malen med de kravene som faktisk gjelder i stedet
 * for omtrentlige verdier. Kilden star pa hver klasse, sa det gar an a
 * slå etter.
 *
 * To ting er verdt a merke seg:
 *
 *  - Normalen oppgir *total veibredde i kurver*, ikke et tillegg. Derfor
 *    ligger tabellene som mal-bredder, og breddeutvidelsen blir differansen
 *    mot den veibredden prosjektet faktisk bygger.
 *  - Stigningskravet er ulikt i lassretningen (motkjøring med tømmerlass)
 *    og returretningen (normalt tom bil). Begge ligger inne, og hvilken som
 *    gjelder avhenger av hvilken vei lasset kjører.
 *  - Normalen har *to* overgangslengder som er lette a blande: hvor langt
 *    breddeutvidelsen jevnes ut (`utvidelseOvergang`), og hvor langt
 *    stigningen flates ut før kurven (`stigningsovergang`). De er ulike i de
 *    fleste klassene, og star derfor som hvert sitt felt.
 */

const Veiklasser = {
  // ── Bilveier ────────────────────────────────────────────────
  k1: {
    navn: 'Klasse 1 – Bilvei, offentlig standard',
    kort: 'K1',
    beskrivelse: 'Helårs bilvei som bygges i samarbeid med offentlig veimyndighet. '
      + 'Normalen setter ingen egen tabell for denne klassen – kravene hentes fra Statens vegvesen. '
      + 'Verdiene under er derfor bare et utgangspunkt, kontroller mot den aktuelle vegnormalen.',
    usikker: true,
    vegbredde: 5.0, kjorebane: 4.0, skulder: 0.5,
    minRadius: 40, minVertikalLavbrekk: 200, minVertikalHoybrekk: 400,
    tverrfall: 0.05, grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 20,
    maksStigningLass: 0.08, maksStigningRetur: 0.08,
    breddeIKurve: [], stigningIKurve: [[1e9, 0.08, 0.08]]
  },

  k2: {
    navn: 'Klasse 2 – Helårs landbruksbilvei',
    kort: 'K2',
    beskrivelse: 'Helårs bilvei med høy standard for tømmerbil med henger.',
    kilde: 'Normaler for landbruksveier, kap. 3.2',
    vegbredde: 4.5, kjorebane: 3.5, skulder: 0.5,
    minRadius: 20, minVertikalLavbrekk: 200, minVertikalHoybrekk: 200,
    tverrfall: 0.05, ensidigMaks: 0.05, ensidigUnderRadius: 60,
    grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 20, stigningsovergang: 20,
    maksStigningLass: 0.08, maksStigningRetur: 0.08,
    kortStrekkTillegg: 0.02,
    breddeIKurve: [[20, 24, 6.0, 7.0], [25, 29, 6.0, 6.5], [30, 39, 5.5, 6.0], [40, 49, 5.5, 5.5], [50, 59, 5.0, 5.5]],
    stigningIKurve: [[25, 0.04, 0.04], [30, 0.05, 0.05], [40, 0.06, 0.06], [50, 0.07, 0.07], [59, 0.07, 0.07], [1e9, 0.08, 0.08]],
    ekstraBredde: { fyllingshoyde: 2.0, tillegg: 0.5 }
  },

  k3: {
    navn: 'Klasse 3 – Landbruksbilvei',
    kort: 'K3',
    beskrivelse: 'Standarden for skogsbilveier, gårds- og seterveier. Helårs bilvei for tømmerbil med henger.',
    kilde: 'Normaler for landbruksveier, kap. 3.3',
    vegbredde: 4.0, kjorebane: 3.5, skulder: 0.25,
    minRadius: 10, minVertikalLavbrekk: 100, minVertikalHoybrekk: 200,
    tverrfall: 0.05, ensidigMaks: 0.05, ensidigUnderRadius: 60,
    grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 20, stigningsovergang: 10,
    maksStigningLass: 0.10, maksStigningRetur: 0.12,
    kortStrekkTillegg: 0.02,
    breddeIKurve: [[10, 14, 7.0, 9.5], [15, 19, 6.5, 8.0], [20, 24, 6.0, 7.0], [25, 29, 5.5, 6.5], [30, 39, 5.5, 6.0], [40, 49, 5.0, 5.5], [50, 59, 5.0, 5.0]],
    stigningIKurve: [[14, 0.02, 0.05], [19, 0.04, 0.07], [29, 0.06, 0.08], [39, 0.08, 0.10], [49, 0.09, 0.11], [59, 0.09, 0.11], [1e9, 0.10, 0.12]],
    ekstraBredde: { fyllingshoyde: 2.0, tillegg: 0.5 }
  },

  k4: {
    navn: 'Klasse 4 – Sommerbilvei for tømmerbil med henger',
    kort: 'K4',
    beskrivelse: 'Bilvei for tømmertransport med henger i barmarksperioden.',
    kilde: 'Normaler for landbruksveier, kap. 3.4',
    vegbredde: 4.0, kjorebane: 3.5, skulder: 0.25,
    minRadius: 10, minVertikalLavbrekk: 100, minVertikalHoybrekk: 200,
    tverrfall: 0.05, ensidigMaks: 0.05, ensidigUnderRadius: 60,
    grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 20, stigningsovergang: 10,
    maksStigningLass: 0.12, maksStigningRetur: 0.18,
    kortStrekkTillegg: 0.02,
    breddeIKurve: [[10, 14, 7.0, 9.5], [15, 19, 6.5, 8.0], [20, 24, 6.0, 7.0], [25, 29, 5.5, 6.5], [30, 39, 5.5, 6.0], [40, 49, 5.0, 5.5], [50, 59, 5.0, 5.0]],
    stigningIKurve: [[14, 0.04, 0.07], [19, 0.06, 0.09], [29, 0.08, 0.11], [39, 0.10, 0.13], [49, 0.11, 0.14], [59, 0.11, 0.16], [1e9, 0.12, 0.16]],
    // normalen: fylling over 2 m *eller* stigning over 12 %
    ekstraBredde: { fyllingshoyde: 2.0, stigning: 0.12, tillegg: 0.5 }
  },

  k5: {
    navn: 'Klasse 5 – Sommerbilvei for tømmerbil uten henger',
    kort: 'K5',
    beskrivelse: 'Bilvei for tømmertransport uten henger, kun i barmarksperioden. '
      + 'Skal etter normalen bare brukes der høyere standard ikke er teknisk mulig eller økonomisk forsvarlig.',
    kilde: 'Normaler for landbruksveier, kap. 3.5',
    vegbredde: 4.0, kjorebane: 3.5, skulder: 0.25,
    minRadius: 10, minVertikalLavbrekk: 60, minVertikalHoybrekk: 100,
    tverrfall: 0.05, ensidigMaks: 0.05, ensidigUnderRadius: 60,
    grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 15, stigningsovergang: 10,
    maksStigningLass: 0.18, maksStigningRetur: 0.20,
    kortStrekkTillegg: 0.02,
    breddeIKurve: [[10, 14, 5.5, 6.0], [15, 19, 5.0, 5.5], [20, 29, 5.0, 5.0], [30, 39, 4.5, 5.0], [40, 49, 4.5, 4.5], [50, 59, 4.0, 4.5]],
    stigningIKurve: [[14, 0.10, 0.12], [19, 0.11, 0.14], [29, 0.12, 0.15], [39, 0.14, 0.17], [49, 0.15, 0.18], [59, 0.16, 0.20], [1e9, 0.18, 0.20]],
    ekstraBredde: { fyllingshoyde: 2.0, stigning: 0.14, tillegg: 0.5 }
  },

  k6: {
    navn: 'Klasse 6 – Vinterbilvei',
    kort: 'K6',
    beskrivelse: 'Bilvei for tømmertransport på vinterføre.',
    kilde: 'Normaler for landbruksveier, kap. 3.6',
    vegbredde: 4.5, kjorebane: 3.5, skulder: 0.5,
    // normalen gir én vertikalradius for denne klassen, ikke to
    minRadius: 20, minVertikalLavbrekk: 200, minVertikalHoybrekk: 200,
    tverrfall: 0.05, ensidigMaks: 0.05, ensidigUnderRadius: 60,
    grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 20, stigningsovergang: 10,
    maksStigningLass: 0.08, maksStigningRetur: 0.12,
    kortStrekkTillegg: 0.02,
    breddeIKurve: [[20, 24, 6.0, 7.0], [25, 29, 6.0, 6.5], [30, 39, 6.0, 6.5], [40, 49, 5.5, 5.5], [50, 59, 5.0, 5.5]],
    stigningIKurve: [[24, 0.06, 0.08], [30, 0.07, 0.09], [39, 0.08, 0.10], [49, 0.08, 0.11], [59, 0.08, 0.11], [1e9, 0.08, 0.12]],
    ekstraBredde: { fyllingshoyde: 2.0, tillegg: 0.5 },
    // grøft, tverrfall og kjørebane er ikke tallfestet for denne klassen
    utledet: ['grofteDybdePlanum', 'grofteBunn', 'tverrfall', 'ensidigMaks', 'kjorebane', 'skulder']
  },

  // ── Traktorveier ────────────────────────────────────────────
  k7: {
    navn: 'Klasse 7 – Traktorvei',
    kort: 'K7',
    beskrivelse: 'Vei for transport av landbruksprodukter og tømmer med traktor.',
    kilde: 'Normaler for landbruksveier, kap. 5.1',
    vegbredde: 3.5, kjorebane: 3.0, skulder: 0.25,
    // normalen: «Vertikalkurver bør ikke ha mindre radius enn 50 m»
    minRadius: 10, minVertikalLavbrekk: 50, minVertikalHoybrekk: 50,
    tverrfall: 0.05, grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    // traktorvei doserer krappere og brattere enn bilveiklassene
    ensidigUnderRadius: 20, ensidigMaks: 0.10,
    utvidelseOvergang: 5, stigningsovergang: 10,
    maksStigningLass: 0.15, maksStigningRetur: 0.30,
    breddeIKurve: [[10, 14, 6.0, 6.0], [15, 19, 5.0, 5.0], [20, 29, 4.5, 4.5], [30, 39, 4.0, 4.0]],
    stigningIKurve: [[14, 0.06, 0.20], [19, 0.08, 0.20], [29, 0.10, 0.25], [39, 0.12, 0.25], [49, 0.15, 0.30], [1e9, 0.15, 0.30]],
    ekstraBredde: { fyllingshoyde: 2.0, tillegg: 0.5 },
    merknad: 'Stigningstallene gjelder landbrukstraktor. For lastetraktorvei tillater '
      + 'normalen 20 % i lassretningen og høyere verdier i kurvene.',
    utledet: ['kjorebane', 'skulder']
  },

  k8: {
    navn: 'Klasse 8 – Enkel traktorvei',
    kort: 'K8',
    beskrivelse: 'Enkel vei for transport av tømmer og landbruksprodukter med traktor.',
    kilde: 'Normaler for landbruksveier, kap. 5.2',
    vegbredde: 2.5, kjorebane: 2.5, skulder: 0,
    /* Normalen: «Det stilles ingen bestemte krav til kurvatur, men
       kurveradius må være tilfredsstillende for bruk av det transportutstyr
       veien er bygget for.» Derfor star kurvaturkravene som 0 - programmet
       skal ikke merke noe som brudd mot et krav som ikke finnes. */
    minRadius: 0, minVertikalLavbrekk: 0, minVertikalHoybrekk: 0,
    tverrfall: 0.05, grofteDybdePlanum: 0.20, grofteBunn: 0.30,
    utvidelseOvergang: 5, stigningsovergang: 10,
    maksStigningLass: 0.15, maksStigningRetur: 0.30,
    breddeIKurve: [], stigningIKurve: [[1e9, 0.15, 0.30]],
    ekstraBredde: { fyllingshoyde: 2.0, tillegg: 0.5 },
    utledet: ['grofteDybdePlanum', 'grofteBunn', 'tverrfall', 'utvidelseOvergang']
  },

  // ── Ikke landbruksvei ───────────────────────────────────────
  egen: {
    navn: 'Egne verdier',
    kort: 'Egen',
    beskrivelse: 'Ingen klasse valgt – alle verdier settes fritt. Bruk denne for anleggsvei, '
      + 'adkomstvei eller når byggherren har egne krav.',
    fri: true
  }
};

/**
 * Setter opp en vegmal ut fra en veiklasse.
 *
 * Overbygningen kommer ikke fra klassen: tykkelsen pa bærelaget avhenger av
 * grunnforholdene, og normalen gir den i egne tabeller etter jordart. Den
 * lar vi derfor sta som den er i malen.
 */
function malFraVeiklasse(klasse, gjeldende) {
  const k = Veiklasser[klasse];
  const m = Object.assign({}, gjeldende);
  if (!k || k.fri) return m;

  m.veiklasse = klasse;
  m.vegbredde = k.vegbredde;
  m.tverrfall = k.tverrfall;
  m.grofteDybdePlanum = k.grofteDybdePlanum;
  m.grofteBunn = k.grofteBunn;
  m.utvidelseOvergang = k.utvidelseOvergang;
  // normalen skiller disse to; se kommentaren øverst i filen
  m.utflatingForKurve = k.stigningsovergang != null ? k.stigningsovergang : k.utvidelseOvergang;
  /* Slitelagsbredden hentes fra klassen, ikke fra det som sto der før.
     Med `Math.min(m.slitelagBredde || …, …)` kunne den bare ga nedover: sa du
     først pa K8 med 2,5 m og deretter valgte K1, ble slitelaget staende pa
     2,5 m i stedet for K1 sine 4,0. Resultatet hang pa hvilken klasse du
     tilfeldigvis apnet først. */
  m.slitelagBredde = Math.min(k.kjorebane != null ? k.kjorebane : k.vegbredde, k.vegbredde);
  m.breddeIKurve = (k.breddeIKurve || []).map(r => r.slice());
  m.stigningIKurve = (k.stigningIKurve || []).map(r => r.slice());
  m.minRadius = k.minRadius;
  m.minVertikalLavbrekk = k.minVertikalLavbrekk;
  m.minVertikalHoybrekk = k.minVertikalHoybrekk;
  m.ensidigUnderRadius = k.ensidigUnderRadius || 0;
  m.ensidigMaks = k.ensidigMaks || 0.05;
  m.ekstraBredde = k.ekstraBredde ? Object.assign({}, k.ekstraBredde) : null;
  return m;
}

/* TO NORMFUNKSJONER SOM GA FEIL SVAR – OG SOM INGEN KALTE.
   «normalbreddeIKurve» og «maksStigningNormal» sto her uten en eneste kaller i
   hele prosjektet, og de var ikke bare ubrukte: de var uenige med koden som
   faktisk regner. Kjørt side om side med masser.js sine «utvidelseFraRadius» og
   «maksStigningFraRadius» ga de 0,00 m der masser gir 7,00 m (R=8), 7 % der
   masser gir 5 % (R=14,5) og 12 % der masser gir 11 % (R=59,5).
   Båndkantrettingene i masser.js ble aldri gjort her.

   Verre enn ubrukt: GJENNOMGANG.md siterte tallene deres som om de var i bruk
   og bygde konklusjoner på dem. Død kode som lyver om fagregler er farligere
   enn død kode som bare ligger der.

   Reglene selv er ikke tapt – tabellene «breddeIKurve» og «stigningIKurve»
   står fortsatt i klassene, og masser.js leser dem. */

if (typeof module !== 'undefined') {
  module.exports = { Veiklasser, malFraVeiklasse };
}
