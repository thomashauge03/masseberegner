'use strict';

/* Norsk desimaltegn i meldingene.
   Merknadene skrev tallene sine med `toFixed()`, altså med punktum: «Høyeste
   fylling er 5.3 m». Tallene i tabellene ved siden av gikk gjennom
   Rapport.tall og fikk komma. Samme dokument, to desimaltegn – det ser ut som
   om to forskjellige programmer har skrevet rapporten. */
function kom(v, d = 1) {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
}
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

  /* MASSEUTSKIFTING: UNDER VEGKROPPEN GRAVES DET NED TIL FJELL.
     Rensk på tjue centimeter er avdekking – matjord, torv og stubber. Men
     under selve vegen er ikke det som ligger igjen noe å bygge på: det er
     skrot, og ofte myr. Da graves alt bort helt ned til fast fjell, og
     trauet fylles tilbake med sprengstein.
     Det gir to volum, ikke ett: alt som tas ut er deponimasse, og hele
     rommet mellom fjellet og planum må fylles på nytt. Med fjellet en halv
     meter nede er det tretti centimeter mer enn rensken tok; med myr og
     fjell to meter nede er det nesten to meter over hele vegbredden.
     Utenfor vegkroppen – i skråningene – er det fortsatt vanlig rensk. Der
     bygges det ingenting, så det er ingenting å skifte ut. */
  utskifting: true,
  /* Fire meter er dypt nok. Ligger fjellet dypere, er det ikke lenger
     utskifting man driver med, og da stopper uttaket her og sier fra om hva
     som blir liggende igjen under. Uten en grense ville en feilsatt
     standarddybde på ti meter gitt et tall ingen kunne kjenne igjen. */
  maksUtskifting: 4.0,
  /* TRAUET GÅR FORBI VEGKROPPEN, OG VEGGEN SKRÅNER.
     `utskiftingUtenfor` er hvor langt bunnen går utenfor vegkroppen, og
     `utskiftingHelning` er vannrett utlegg per meter høyde på veggen opp til
     terrenget – samme skrivemåte som de andre helningene i malen.

     Begge er der av samme grunn: en loddrett vegg i løsmasse står ikke, og den
     gode massen man fyller i må ha noe å bære seg mot. Uten margin står
     fyllingen kant i kant med myra den erstattet, og skråningen oppå siger ut.
     1,0 m og 1:1,5 er det som holder i vanlig løsmasse; i bløt myr trengs
     slakere, og da settes helningen opp. */
  utskiftingUtenfor: 1.0,
  utskiftingHelning: 1.5,
  /* KANTEN AV VEGKROPPEN SKRÅR, OG DEN STÅR PÅ NOE.
     Lagene ble lagt opp som `tykkelse · vegbredde` – en plate med loddrett kant
     ved vegkanten – mens skråningen startet i planum rett under. Målt på en veg
     1,5 m over terrenget: vegoverflaten i kanten står på kote 101,388 og planum
     på 100,688, altså en 0,70 m høy loddrett vegg som ingen post dekker. Plata
     hang ut i lufta.

     Nå går planum `overbygningstykkelsen · overbygningHelning` forbi vegkanten
     før grøfta eller skråningen tar over. Det er skulderen: hyllen lagene står
     på, og som gjør at kanten holder.

     SAMME TALL I SKJÆRING OG FYLLING, med vilje. Skråningen starter fortsatt i
     planum – se kommentaren i sideløkka om hvorfor – og skulderen er like brei
     på begge sider, så et profil som vipper fra skjæring til fylling ikke får
     et sprang å bli trukket mot. */
  overbygningHelning: 1.5,

  maksSokebredde: 45,

  /* Minste totale veibredde i kurver etter normalen:
     [radiusFra, radiusTil, bredde ved 45° dreining, bredde ved 135°] */
  breddeIKurve: [[10, 14, 5.5, 6.0], [15, 19, 5.0, 5.5], [20, 29, 5.0, 5.0],
  [30, 39, 4.5, 5.0], [40, 49, 4.5, 4.5], [50, 59, 4.0, 4.5]],
  utvidelseOvergang: 15,     // hvor langt breddeutvidelsen jevnes ut
  /* Forvalget når man setter ut en snuplass. Normaler for landbruksveier gir
     møteplasser rundt 20 m lengde og en samlet bredde på 8-10 m – altså 4-5 m
     mer enn en 4,5 m veg. Tallene kan endres på hver enkelt plass. */
  plassLengde: 20,
  plassBredde: 5.5,
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
    /* Bare et felt som ikke er oppgitt i det hele tatt far standardverdien.
       Star det noe der som ikke er et tall - null, tom streng - skal det bli
       staende, sa `rettInngang` far se det og si fra. Med `== null` her ble
       en tom fjelldybde stille til 0,5 m, og brukeren fikk aldri vite at
       tallet han skrev inn ikke ble brukt. */
    this.standarddybde = o.standarddybde === undefined ? 0.5 : o.standarddybde;
    this.strekninger = o.strekninger || [];
    this.punkter = o.punkter || [];
    this.rekkevidde = o.rekkevidde || 60;
  }

  dybde(x, y, s) {
    if (this.punkter.length) {
      let sumV = 0, sumW = 0;
      for (const p of this.punkter) {
        const d = Math.hypot(p.x - x, p.y - y);
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

/**
 * Plassene brukeren har satt ut: snuplasser og møteplasser.
 *
 * En snuplass er ikke noe eget anlegg - det er vegen som er bredere på et
 * stykke. Derfor er den en UTVIDELSE, akkurat som den kurver får, og da følger
 * alt annet med av seg selv: masser, tverrsnitt, 3D, rapport og eksport leser
 * allerede `utvidelse`, og ingen av dem trenger å vite at det står en snuplass
 * der.
 *
 * Punktet brukeren setter er MIDTEN av plassen. Ligger det så nær enden at
 * plassen ikke får plass, flyttes midten inn - ellers ville en snuplass satt
 * ytterst på vegen blitt halvert i stillhet, og det er nettopp der man setter
 * dem.
 *
 * @param {Array} plasser  [{s, lengde, bredde}] - bredde er SAMLET tillegg
 * @returns {function(number): number} utvidelsen i en gitt stasjon
 */
/** Minste innkjøringslengde: flaten flarer aldri brattere enn 1:5 per side. */
const PLASS_FLARE = 5;

/** Innkjøringslengden til én plass – egen verdi, eller den utregnede. */
function plassInnkjoring(p, overgang) {
  if (p && p.innkjoring != null && isFinite(p.innkjoring) && p.innkjoring >= 0) {
    return p.innkjoring;
  }
  /* HVER PLASS TRENGER SIN EGEN INNKJØRING.
     Kurveutvidelsen trappes av over `utvidelseOvergang`, en FAST lengde. Det
     går bra for en kurve, som utvider vegen med en meter eller to. En snuplass
     tar vegen fra 4,5 til 10 m, og da blir den faste lengden en vegg: målt med
     `utvidelseOvergang` 15 ble flaren 1:5,5 per side, og med veiklassene som
     setter den til 5 – se veiklasser.js – ble den 1:1,8. Det er ikke en
     innkjøring, det er en kant.
     Derfor: minst vegens egen overgang, og minst 1:5 for den halve bredden
     hver side skal ut. Bredere plass gir lengre innkjøring, slik det må. */
  return Math.max(overgang || 0, (p.bredde / 2) * PLASS_FLARE);
}

function plassUtvidelse(plasser, lengdeLinje, overgang) {
  const gyldige = (plasser || []).filter(p => p && isFinite(p.s)
    && p.lengde > 0 && p.bredde > 0);
  if (!gyldige.length) return () => 0;
  const omraader = gyldige.map(p => {
    const halv = p.lengde / 2;
    /* Midten klemmes inn slik at hele plassen ligger på vegen. Er vegen
       kortere enn plassen, dekker den hele vegen. */
    const midt = lengdeLinje <= p.lengde ? lengdeLinje / 2
      : Math.min(Math.max(p.s, halv), lengdeLinje - halv);
    return { fra: midt - halv, til: midt + halv, bredde: p.bredde,
      inn: plassInnkjoring(p, overgang) };
  });
  return s => {
    let b = 0;
    for (const o of omraader) {
      let v;
      if (s >= o.fra - 1e-9 && s <= o.til + 1e-9) v = o.bredde;
      else {
        // lineær innkjøring ut fra kanten, ned til null
        const ut = s < o.fra ? o.fra - s : s - o.til;
        v = o.inn > 1e-9 ? o.bredde * Math.max(0, 1 - ut / o.inn) : 0;
      }
      if (v > b) b = v;
    }
    return b;
  };
}

/** Stasjonene der en plass starter og slutter - kantene må treffes eksakt. */
function plassKanter(plasser, lengdeLinje, overgang) {
  const ut = [];
  for (const p of (plasser || [])) {
    if (!p || !isFinite(p.s) || !(p.lengde > 0) || !(p.bredde > 0)) continue;
    const halv = p.lengde / 2;
    const midt = lengdeLinje <= p.lengde ? lengdeLinje / 2
      : Math.min(Math.max(p.s, halv), lengdeLinje - halv);
    /* Selve kantene, og der avtrappingen er ferdig. Uten disse faller en kort
       plass mellom to profiler i det jevne rutenettet, og volumet blir smurt
       ut over nabostrekkene i stedet for å ligge der plassen er. */
    const inn = plassInnkjoring(p, overgang);
    const punkt = [midt - halv, midt + halv];
    if (inn > 1e-9) punkt.push(midt - halv - inn, midt + halv + inn);
    else {
      /* UTEN AVTRAPPING SKAL KANTEN VÆRE SKARP.
         Volumet regnes med gjennomsnittlig endeareal, så står nærmeste profil
         utenfor plassen fem meter unna med null utvidelse, rampes bredden ned
         over de fem meterne - og plassen blir en trapes i stedet for et
         rektangel. Målt på en 20 m plass med 4 m utvidelse: 70,0 m³ overbygning
         mot 56,0 håndregnet, 25 % for mye, og plassen stakk 5 m ut i hver ende
         av der den var satt.
         En millimeter utenfor hver kant holder: strekket er for kort til å bety
         noe i volum, og bredden er nede på null før nabostasjonen. */
      punkt.push(midt - halv - 0.001, midt + halv + 0.001);
    }
    for (const t of punkt) {
      if (t > 1e-9 && t < lengdeLinje - 1e-9) ut.push(+t.toFixed(4));
    }
  }
  return ut;
}

/** Breddeutvidelse med jevn overgang inn og ut av kurven. */
function lagUtvidelsesprofil(linje, mal, stasjoner, ekstra, plasser) {
  /* Utvidelsen ma leses av over hele strekket profilet representerer, ikke
     bare i det ene punktet. En kurve som er kortere enn profilavstanden kan
     ellers falle mellom to profiler, og da fikk den ingen utvidelse i det
     hele tatt - jo knappere sving, desto lettere skjedde det. */
  const les = s => {
    const kurve = linje.kurveVed ? linje.kurveVed(s) : null;
    const dreining = kurve ? Math.abs(kurve.avbøy) * 180 / Math.PI : 45;
    return utvidelseFraRadius(mal, linje.radiusVed(s), dreining);
  };
  const plass = plassUtvidelse(plasser, linje.lengde, mal.utvidelseOvergang);
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
  /* PLASSENE LEGGES PÅ ETTER KURVENS AVTRAPPING, fordi de har sin egen.
     Kurveutvidelsen trappes over `utvidelseOvergang`; en snuplass over en
     lengde som følger av hvor bred den er – se `plassInnkjoring`. To ulike
     rater lar seg ikke kjøre gjennom den ene vindusløkka over.

     OG DE KONKURRERER MED KURVEN, de legges ikke oppå: ligger snuplassen i en
     sving, er bredden den BREDESTE av de to, ikke summen. To grunner til å
     være bred er ikke dobbelt så bred veg. */
  for (let i = 0; i < ut.length; i++) {
    const p = plass(stasjoner[i]);
    if (p > ut[i]) ut[i] = p;
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

  /* Terreng etter rensk (avdekking av matjord/stubber).
   *
   * DYBDEN MÅ VÆRE DEN SAMME HER SOM I RENSKEPOSTEN.
   * Her sto `terrRå(t) - rensk`, en fast dybde uten et blikk på hva som ligger
   * under – mens renskeposten lenger nede med rette bokfører `min(renskDybde,
   * dybden til fjell)`, fordi det ikke er noe å skrape av der fjellet ligger i
   * dagen. De to var altså uenige, og laget mellom den virkelige renskebunnen
   * og `terrRå − renskDybde` havnet i INGEN post.
   *
   * Målt på flatt terreng i kote 100 med veg i kote 96 og standardmalen:
   * med fjellet i dagen ble det bokført 29,908 m²/lm skjæring og 0,000 rensk,
   * mens den fysiske utgravingen mellom skråningsføttene er 31,393. Manko
   * 1,485 m²/lm – knapt fem prosent av hele utgravingen, og hele tapet ligger
   * på FJELLPOSTEN, den dyreste. Mankoen vokser lineært fra null ved
   * fjelldybde 0,20 til full renskedybde ved fjell i dagen, og fjell i dagen
   * er ikke et sjeldent tilfelle i Norge.
   *
   * `fjellflate` er definert lenger nede, men `terr` kalles først etter den. */
  const terr = t => {
    const zr = terrRå(t);
    if (!isFinite(zr)) return NaN;
    return zr - Math.max(0, Math.min(rensk, zr - fjellflate(t)));
  };

  /* Ferdig vegoverflate. Venstre og høyre fall er skilt, slik at et
     oppmalt tverrsnitt kan treffes og kurver kan doseres ensidig. */
  const fall = o.tverrfall || { venstre: mal.tverrfall, hoyre: mal.tverrfall };
  const vegflate = t => {
    const tt = Math.max(-hb, Math.min(hb, t));
    return vegnivaa - (tt < 0 ? fall.venstre * -tt : fall.hoyre * tt);
  };

  /* Dybden til fjell ble malt ett sted - i senterlinjen - og brukt over hele
     tverrsnittet. Setter man en sondering pa hver side av veien, forventer man
     at modellen legger fjellflaten skratt mellom dem; i stedet ble begge to
     veid sammen til ett tall i midten, og fjellflaten ble liggende parallelt
     med terrenget hele veien ut.

     Na males dybden der man star. Det koster et oppslag per punkt, men
     Fjellmodell.dybde er noen fa avstandsregninger, og dybden til fjell er den
     største usikkerheten i hele regnestykket - den er verdt oppslaget.

     Senterverdien tas vare pa som `fjelldybde`, for den er det rapporten
     oppgir som dybden pa profilet. */
  const fjelldybde = fjell ? fjell.dybde(p.x, p.y, s) : 0.5;
  const fjellflate = fjell
    ? t => terrRå(t) - fjell.dybde(p.x + nx * t, p.y + ny * t, s)
    : t => terrRå(t) - 0.5;

  /* --- Utskiftingstrauet ---------------------------------------------
     Bunnen det faktisk graves til. Utenfor vegkroppen er den den vanlige
     renskebunnen; under vegkroppen er den fjellet, men aldri dypere enn
     `maksUtskifting` under bakken.

     VEGKROPPEN ER VEGBREDDEN PLUSS GRØFTA. Grøftebunnen ligger under planum,
     så trauet må uansett ned dit – og en utskifting som stoppet i vegkanten
     ville etterlatt en stripe myr rett under grøfta, som er der vannet står.
     Bredden regnes av malen og ikke av knekklista, fordi grøfta bare finnes i
     skjæring: i fylling skal trauet være like bredt likevel, ellers ville
     utskiftingen krympet og vokst med om profilet tilfeldigvis lå i skjæring.

     `Math.min(terr(t), …)` står der for at trauet ALDRI skal bli grunnere enn
     den vanlige rensken. Ligger fjellet i dagen, er de to like; ellers går
     trauet dypere. */
  const groftBredde = Math.max(0, mal.grofteDybdePlanum || 0) * Math.max(0, mal.grofteInnerHelning || 0)
    + Math.max(0, mal.grofteBunn || 0);
  /* SKULDEREN: hyllen i planum som vegkroppen står på.
     Lagene har en skrå kant, ikke en loddrett – se `overbygningHelning` i malen
     – og der kanten møter planum, slutter vegkroppen. Derfra tar grøfta eller
     skråningen over. Er helningen null, er skulderen null, og alt er som før:
     en plate med loddrett kant. */
  const obHelning = Math.max(0, mal.overbygningHelning || 0);
  const skulder = ob * obHelning;
  /* Vegkroppen er bredere i planum enn oppe på vegen, og det er vegkroppen
     trauet skal ligge under – skulderen skal stå på fast grunn den også. */
  const tUtskifting = hb + skulder + groftBredde;
  const maksUt = Math.max(0, mal.maksUtskifting || 0);
  /* ET TRAU HAR IKKE LODDRETTE VEGGER.
     Her sto veggen som et loddrett sprang ved vegkroppens kant. Da står den
     gode massen man nettopp fylte i mot en vegg av det man kastet - myr eller
     skrot - og skråningen oppå har ingenting å bære seg mot. Den siger ut.
     Og en fire meter høy loddrett vegg i løsmasse står ikke; den raser mens
     graveren står i den.

     Så bunnen går `utskiftingUtenfor` meter forbi vegkroppen, og derfra
     skråner veggen opp til terrenget med `utskiftingHelning` - vannrett utlegg
     per meter høyde, som alle andre helninger i malen. Den utvendige delen er
     ikke noe man kunne latt være: det er den som gjør at kanten holder. */
  const utUtenfor = Math.max(0, mal.utskiftingUtenfor || 0);
  const utHelning = Math.max(0, mal.utskiftingHelning || 0);
  const tUtskiftBunn = tUtskifting + utUtenfor;
  /* Bunnen slik den ville vært uten vegg – fjellet, eller grensa. */
  const trauBunnRett = (t) => {
    const zr = terrRå(t);
    if (!isFinite(zr)) return NaN;
    const zf = fjellflate(t);
    return maksUt > 0 ? Math.max(zf, zr - maksUt) : zf;
  };
  const utskiftBotn = !mal.utskifting ? terr : (t) => {
    const grunn = terr(t);
    const at = Math.abs(t);
    if (at <= tUtskiftBunn) {
      const b = trauBunnRett(t);
      return isFinite(b) ? Math.min(grunn, b) : NaN;
    }
    if (utHelning <= 0) return grunn;          // loddrett vegg: ingenting utenfor
    /* Skråningen stiger fra bunnen ved VEGGFOTEN, ikke fra det lokale
       trauet – det er den ene sammenhengende flaten graveren følger. */
    const bFot = trauBunnRett((t < 0 ? -1 : 1) * tUtskiftBunn);
    if (!isFinite(bFot)) return grunn;
    const zVegg = bFot + (at - tUtskiftBunn) / utHelning;
    const b = trauBunnRett(t);
    return Math.min(grunn, isFinite(b) ? Math.max(b, zVegg) : zVegg);
  };
  /* Der veggen møter den vanlige renskebunnen. Utenfor dette punktet er trauet
     ikke lenger dypere enn en vanlig avdekking, og der er det ingen utskifting.
     Løses ved halvering: terrenget kan skråne, så det finnes ingen formel. */
  const veggMoeter = (side) => {
    if (!mal.utskifting || utHelning <= 0) return tUtskiftBunn;
    const dypere = (t) => utskiftBotn(t) < terr(t) - 1e-9;
    let lav = tUtskiftBunn, hoy = tUtskiftBunn;
    /* Finn først et punkt der veggen ER oppe. Rekkevidden kan ikke bli
       uendelig: dypeste mulige trau er `maksUt`, eller hele veien til fjell. */
    const rekkevidde = Math.max(1, (maksUt > 0 ? maksUt : 50) * utHelning) + 1;
    hoy = tUtskiftBunn + rekkevidde;
    if (dypere(side * hoy)) return hoy;
    for (let i = 0; i < 40; i++) {
      const m = (lav + hoy) / 2;
      if (dypere(side * m)) lav = m; else hoy = m;
    }
    return hoy;
  };
  /* Hvor mye løsmasse som blir liggende igjen under trauet fordi grensa slo
     inn. Null når fjellet nås. Meldes videre, se `beregnMasser`.
     Gjelder bunnen, ikke veggen: under skråningen er det ikke meningen at man
     skal ned til fjell, så det som ligger igjen der er ikke en rest. */
  const restUnderTrauet = (t) => {
    if (!mal.utskifting || maksUt <= 0 || Math.abs(t) > tUtskiftBunn) return 0;
    const zr = terrRå(t);
    if (!isFinite(zr)) return 0;
    return Math.max(0, (zr - maksUt) - fjellflate(t));
  };

  // --- Bygg jordarbeidsflaten for hver side --------------------------
  const sider = {};
  for (const side of [-1, 1]) {
    const zKant = vegflate(side * hb);
    const planumKant = zKant - ob;
    const hbS = hb + skulder;                  // ytterkant av skulderen
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
      const t1 = hbS + Math.max(0, planumKant - zGroft) * mal.grofteInnerHelning;
      const t2 = t1 + mal.grofteBunn * grofteAndel;
      /* Skulderen først, så grøfta. Sto grøfta rett i vegkanten, hadde
         vegkroppen ingenting å stå på ute ved kanten. */
      knekk.push({ t: hb, z: planumKant });
      if (skulder > 1e-9) knekk.push({ t: hbS, z: planumKant });
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
      /* Sluttpunktet ma med, men ikke to ganger: gikk marsjen helt ut uten a
         treffe terrenget, sto det siste punktet allerede i listen. To punkt pa
         samme sted gir et strekk uten lengde, og en helning som ikke lar seg
         regne - avlesningen i tverrsnittet fikk ingen helning nær kanten. */
      const sistKnekk = knekk[knekk.length - 1];
      if (!sistKnekk || Math.abs(sistKnekk.t - t) > 1e-9) knekk.push({ t, z });
      tFot = t;
      sider[side] = { type, knekk, tFot, truffet, zKant, planumKant };
    } else {
      /* --- Fylling: skraning ned til terreng --- */
      type = 'fylling';
      knekk.push({ t: hb, z: planumKant });
      // skulderen: hyllen vegkroppens skrå kant står på
      if (skulder > 1e-9) knekk.push({ t: hbS, z: planumKant });
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
      let t = hbS, z = planumKant;
      const fallPerM = 1 / Math.max(0.02, mal.fylling);
      const skraning = tt => planumKant - (tt - hbS) * fallPerM;
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
      /* Sluttpunktet ma med, men ikke to ganger: gikk marsjen helt ut uten a
         treffe terrenget, sto det siste punktet allerede i listen. To punkt pa
         samme sted gir et strekk uten lengde, og en helning som ikke lar seg
         regne - avlesningen i tverrsnittet fikk ingen helning nær kanten. */
      const sistKnekk = knekk[knekk.length - 1];
      if (!sistKnekk || Math.abs(sistKnekk.t - t) > 1e-9) knekk.push({ t, z });
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
    /* SISTE KNEKKPUNKT HOLDER HERFRA. RØR DEN IKKE.
       Det ser ut som om terrenget burde overtatt her - utenfor skråningen er
       det jo bakken som er flaten - og det ble prøvd. Men `tFot` er IKKE alltid
       det siste knekkpunktet: målt på et kjegleterreng sto foten på 8,130 m
       mens siste knekk lå på 6,514, og i det mellomrommet er man fortsatt på
       den bygde skråningen. Byttet man til terrenget der, forsvant hele
       skjæringen på alle 18 kurveprofilene og fyllingen falt fra 49,92 til
       48,14 m²/lm.
       Trenger man flaten UTENFOR foten - og det gjør trauet, som nå går forbi
       den - hentes den der, ikke her. Se `flateVed` i integrasjonen. */
    return k[k.length - 1].z;
  }
  /* Flaten trauet skal fylles opp til.
     Innenfor profilets egne grenser er det jordarbeidsflaten. UTENFOR dem - og
     det området finnes bare fordi trauet har fått skrå vegg og går forbi
     skråningen - er det bakken selv: der er det ikke bygget noe, så gropa
     graves og bakken legges tilbake slik den lå.

     Grensen er `tV`/`tH`, ikke `tFot`. Det ble prøvd med foten, og det traff
     ikke: målt kalles flaten på t = -8,175 mens venstre fot står på 7,421, så
     «utenfor foten» slo inn 6 259 ganger midt inne i et helt vanlig profil og
     tok skjæringen på alle 18 kurveprofilene til null. */
  const flateVed = (t) =>
    (mal.utskifting && (t < tV - 1e-9 || t > tH + 1e-9)) ? terr(t) : jordflate(t);

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
  /* BREDDEN OG DYBDEN AV SELVE SPRENGNINGEN.
     Den som skal sprenge priser ikke på kubikk alene: han spør hvor bredt
     bruddet blir og hvor dypt han må ned. Begge deler faller ut av den samme
     integrasjonen som volumet – `dFjell` er dybden i hvert punkt og `dtI`
     bredden av steget – så det koster to addisjoner å ta dem vare på i stedet
     for å regne dem tilbake av et areal etterpå. */
  let breddeFjell = 0, maksFjelldybde = 0;
  let utskiftingRest = 0;      // løsmasse som blir liggende under maksgrensa
  /* Tegningsgeometrien er langt tyngre enn tallene, og pa lange veier trengs
     den ikke: skjermen viser ett snitt om gangen. Da bygges den ikke i det
     hele tatt - a slippe den etterpa hjelper ikke, for da er toppen alt nadd. */
  const geometri = o.utenGeometri ? null : { terreng: [], jord: [], veg: [], fjell: [], rensk: [] };

  // Integrasjonspunktene legges bade jevnt utover og nøyaktig i hvert knekkpunkt
  // i malen, slik at resultatet ikke henger pa hvor fint man deler opp.
  const brekk = new Set([tV, tH]);
  for (const side of [-1, 1]) for (const k of sider[side].knekk) brekk.add(side * k.t);
  for (const b of [-hb - 1e-7, -hb + 1e-7, hb - 1e-7, hb + 1e-7, 0]) brekk.add(b);
  /* TRAUVEGGEN ER ET SPRANG, OG DET MÅ TREFFES NØYAKTIG.
     Under vegkroppen ligger bunnen på fjellet, utenfor på renskebunnen – og
     mellom dem står en loddrett vegg. Uten et knekkpunkt på hver side av den
     interpolerte integrasjonen tvers over spranget, og da ble volumet
     avhengig av hvor finmasket man delte opp. Målt: 0,017 m²/lm feil på
     standardoppsettet, og prøven «ingen kubikk faller mellom rensken og
     skjæringen» fanget det.

     Her sto trauet som en teoretisk prisme uten utslag i sidene, med en
     kommentar om at det var en kjent forenkling. Det holder ikke: en loddrett
     vegg i løsmasse står ikke, og den gode massen man fyller i må ha noe å
     bære seg mot - ellers siger den ut. Nå har trauet en skrå vegg, og
     knekkpunktene er derfor tre per side: veggfoten, og der veggen møter den
     vanlige renskebunnen. Faller de mellom to integrasjonspunkt, blir
     spranget smurt utover den ruta det tilfeldigvis lander i. */
  if (mal.utskifting) {
    const kanter = [tUtskiftBunn];
    for (const side of [-1, 1]) {
      const møte = veggMoeter(side);
      if (møte > tUtskiftBunn + 1e-6) kanter.push(møte);
    }
    for (const k of kanter) {
      for (const s of [-1, 1]) { brekk.add(s * k - 1e-7); brekk.add(s * k + 1e-7); }
    }
  }
  /* Taket er det som skiller en tung beregning fra et program som dør. Bredde
     og integrasjonssteg kommer begge fra felt uten grenser, og produktet av
     dem er antall punkt: 20 m veg med 1e-6 steg er tjue millioner punkt i ett
     eneste snitt. Fire tusen punkt over snittet er finere enn terrengmodellen
     selv, sa taket koster ingenting i nøyaktighet. */
  /* OMRÅDET MÅ DEKKE TRAUET, IKKE BARE SKRÅNINGEN.
     Med skrå trauvegg går gropa forbi skråningsfoten: med fjellet to meter nede
     står foten på 3,97 m mens veggen først møter renskebunnen på 6,45. Stoppet
     regnestykket ved foten, ble den ytterste delen av trauet kappet bort - både
     massen som skal kjøres ut og den som må fylles tilbake. */
  let tI0 = tV, tI1 = tH;
  if (mal.utskifting) {
    tI0 = Math.min(tI0, -veggMoeter(-1));
    tI1 = Math.max(tI1, veggMoeter(1));
  }
  const nJevn = Math.min(4000, Math.max(4, Math.ceil((tI1 - tI0) / dt)));
  for (let i = 0; i <= nJevn; i++) brekk.add(tI0 + (tI1 - tI0) * i / nJevn);
  const offsets = [...brekk].filter(t => t >= tI0 - 1e-9 && t <= tI1 + 1e-9).sort((a, b) => a - b);

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
    const zJ = flateVed(t);
    const zF = fjellflate(t);
    /* SKJÆRINGEN MÅLES FRA TRAUETS BUNN, IKKE FRA RENSKEBUNNEN.
       Under vegkroppen er alt over fjellet alt tatt ut som utskifting, så det
       som står igjen å grave er fjell – og ligger planum OVER trauets bunn,
       blir differansen negativ og faller i fyllingsposten av seg selv. Det er
       nettopp den tilbakefyllingen som må kjøres inn.
       Utenfor vegkroppen er `utskiftBotn` den samme renskebunnen som før, så
       skråningene regnes uendret. */
    const zU = utskiftBotn(t);
    const d = zU - zJ;                       // positiv = skjæring
    const dFjell = Math.max(0, Math.min(zU, zF) - zJ);
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
          breddeFjell += del;
          if (D > maksFjelldybde) maksFjelldybde = D;
          vSkjaeringFjell += D * (2 * forrige.w + wMidt) / 6 * del;
        } else {
          const del = (1 - u) * dtI, D = naa.dFjell;
          arealSkjaeringFjell += 0.5 * D * del;
          breddeFjell += del;
          if (D > maksFjelldybde) maksFjelldybde = D;
          vSkjaeringFjell += D * (wMidt + 2 * naa.w) / 6 * del;
        }
      } else {
        arealSkjaeringFjell += (forrige.dFjell + naa.dFjell) / 2 * dtI;
        vSkjaeringFjell += (forrige.dFjell * forrige.w + naa.dFjell * naa.w) / 2 * dtI;
        /* BARE DER DET FAKTISK ER FJELL.
           Denne greina er «ingen overgang i steget», og det dekker BEGGE
           tilfellene: fjell hele veien, og fjell ingen steder. Bredden ble
           lagt til uansett, så `fjellbredde` ble hele tverrsnittsbredden.
           Målt på flatt terreng med veg fire meter ned: uten fjell i det hele
           tatt sto `skjaeringFjell` på 0,000000 og `fjellbredde` på 19,938 m.
           Det går ut som `sprengning.areal` og som «bredeste fjellskjæring» –
           altså et sprengningsareal ti ganger for stort, og en meldt bredde på
           tjue meter der det ikke er fjell. Volumet var riktig hele tiden, så
           ingenting så rart ut i totalen. */
        if (forrige.dFjell > 0 && naa.dFjell > 0) breddeFjell += dtI;
        if (forrige.dFjell > maksFjelldybde) maksFjelldybde = forrige.dFjell;
        if (naa.dFjell > maksFjelldybde) maksFjelldybde = naa.dFjell;
      }
    }
    forrige = naa;
    if (d > maksSkjaering) maksSkjaering = d;
    if (-d > maksFylling) maksFylling = -d;
    /* Hvor mye løsmasse grensa lar bli liggende igjen under trauet. Meldes
       videre så det ikke blir en stille forutsetning. */
    const rest = restUnderTrauet(t);
    if (rest > utskiftingRest) utskiftingRest = rest;
    if (geometri) {
      geometri.terreng.push([t, terrRå(t)]);
      geometri.jord.push([t, zJ]);
      geometri.fjell.push([t, zF]);
      /* Trauets bunn, ikke renskebunnen: det er den linja graveren følger, og
         den som skiller det som kjøres bort fra det som blir liggende. */
      geometri.rensk.push([t, zU]);
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

  /* --- Rensk og overbygning -----------------------------------------

     Rensk er avdekking: matjord, torv og stubber som skrapes av før veien
     bygges. Ligger fjellet i dagen, finnes det ingenting a skrape av - da er
     det sprengning, ikke rensk.

     Her sto `renskDybde * bredde`, en flat multiplikasjon uten et blikk pa hva
     som ligger under. Med fjell i dagen ble det bokført 189 m³ rensk pa 100 m
     veg: fast fjell, ført som avdekket løsmasse. Na males dybden mot
     fjelloverflaten pa hvert punkt, og der fjellet er nærmere overflaten enn
     renskedybden, er det fjellet som bestemmer. */
  /* TRAUET KAN NÅ LENGER UT ENN SKRÅNINGSFOTEN, OG DA MÅ OMRÅDET FØLGE MED.
     Renskeområdet var foten pluss `renskUtenfor`. Med skrå trauvegg går gropa
     forbi det: med fjellet to meter nede står foten på 3,97 m mens veggen først
     møter renskebunnen på 6,45 m. Alt utenfor 4,97 ble da kappet bort - målt
     ble hele renskeposten lik utskiftingen, 18,88 mot 20,94 riktig, fordi det
     ikke var plass til avdekkingen utenfor i det hele tatt.
     Nå strekker området seg til det ytterste av de to. */
  let tUt0 = tV - mal.renskUtenfor, tUt1 = tH + mal.renskUtenfor;
  if (mal.utskifting) {
    tUt0 = Math.min(tUt0, -veggMoeter(-1) - mal.renskUtenfor);
    tUt1 = Math.max(tUt1, veggMoeter(1) + mal.renskUtenfor);
  }
  const tR0 = tUt0, tR1 = tUt1;
  const renskBredde = tR1 - tR0;
  /* `arealUtskifting` er den delen av renskeposten som ligger INNE under
     vegkroppen, altså selve masseutskiftingen. Resten er vanlig avdekking
     utenfor. De er to forskjellige arbeider til to forskjellige priser, og
     tegningen skal kunne fargelegge det ene uten det andre – så de skilles her,
     i den ene løkka som måler dem, og ikke i et eget overslag som kunne kommet
     i utakt. Summen av de to ER `arealRensk`; det er prøvd. */
  let arealRensk = 0, vRensk = 0, arealUtskifting = 0, vUtskifting = 0;
  /* HULL I LASERDEKNINGEN SKAL TAS DER DE ER, IKKE FOR HELE SNITTET.
     Her sto `!manglerData` som port: ett eneste NaN-punkt et sted i profilet –
     også langt utenfor vegen – hoppet over hele renskeintegrasjonen. Men
     løkka under håndterer alt manglende punkt lokalt allerede (`if
     (!isFinite(zRaa)) return 0`), akkurat som tomteberegningen hopper over
     cella og ikke snittet.
     Målt på en rett veg på 200 m: en 0,2 m bred stripe uten dekning, ni og en
     halv meter ute fra senterlinja, tok `sum.rensk` fra 877,51 til 0,00 m³ –
     hundre prosent – mens skjæringen mistet 0,21. Rensken går rett i
     deponiposten, så tallet for hva som må kjøres bort ble 877 kubikk for
     lavt. Merknaden om manglende data står fortsatt. */
  /* `mal.utskifting` med i porten: setter man renskedybden til null mens
     utskiftingen står på, er det fortsatt alt ned til fjell som skal ut under
     vegkroppen – og med bare den gamle prøven hadde hele det uttaket falt
     stille bort. */
  if (renskBredde > 0 && (mal.renskDybde > 0 || mal.utskifting)) {
    /* Dybden er avstanden ned til det som faktisk graves ut: renskebunnen
       utenfor vegkroppen, trauets bunn under den. `utskiftBotn` er den ene
       kilden til begge, så posten og geometrien ikke kan bli uenige. */
    const dybdeVed = (tt) => {
      const zRaa = terrRå(tt);
      if (!isFinite(zRaa)) return 0;
      const botn = utskiftBotn(tt);
      if (!isFinite(botn)) return 0;
      return Math.max(0, zRaa - botn);
    };
    /* TRAUVEGGEN MÅ TREFFES HER OGSÅ.
       Denne løkka har sitt eget jevne rutenett, uavhengig av knekkpunktene
       lenger oppe – og et jevnt rutenett smører et sprang ut over den ruta
       spranget tilfeldigvis faller i. Målt på fjell to meter nede: 11,8751
       mot 11,8876 riktig. Lite, men det er en feil som ikke krymper når man
       finner oppdelingen, og rensken går rett i deponiposten. */
    const kanter = new Set([tR0, tR1]);
    if (mal.utskifting) {
      /* Både veggfoten og der veggen møter renskebunnen – med skrå vegg er det
         to sprang per side, ikke ett. */
      const grenser = [tUtskiftBunn];
      for (const side of [-1, 1]) {
        const møte = veggMoeter(side);
        if (møte > tUtskiftBunn + 1e-6) grenser.push(møte);
      }
      for (const g of grenser) for (const s of [-1, 1]) {
        const b = s * g;
        if (b > tR0 && b < tR1) { kanter.add(b - 1e-9); kanter.add(b + 1e-9); }
      }
    }
    const deler = [...kanter].sort((a, b) => a - b);
    for (let k = 0; k < deler.length - 1; k++) {
      const fra = deler[k], til = deler[k + 1];
      const bredde = til - fra;
      if (!(bredde > 1e-12)) continue;
      const nR = Math.min(400, Math.max(2, Math.ceil(bredde / Math.max(0.05, dt))));
      const dtR = bredde / nR;
      /* Delen ligger ENTEN inne i trauet eller helt utenfor – løkka over deler
         ved både veggfoten og der veggen møter renskebunnen, så midtpunktet
         avgjør for hele delen. Det er derfor dette ikke trenger en egen prøve
         per rute. Prøvd: summen av de to postene er hele renskeposten.

         «Inne i trauet» er der trauet faktisk går DYPERE enn den vanlige
         rensken – ikke en fast bredde. Med skrå vegg tynner utskiftingen ut mot
         null, og en fast bredde ville enten tatt med avdekking som ikke er
         utskifting eller kuttet skråningen bort. */
      const midt = (fra + til) / 2;
      const iTrauet = mal.utskifting && utskiftBotn(midt) < terr(midt) - 1e-9;
      for (let i = 0; i < nR; i++) {
        const tA = fra + i * dtR, tB = tA + dtR;
        const dA = dybdeVed(tA), dB = dybdeVed(tB);
        const bit = (dA + dB) / 2 * dtR;
        arealRensk += bit;
        if (iTrauet) arealUtskifting += bit;
        // samme Pappus-vekting som resten av snittet, og vekten kan ikke bli negativ
        const wA = Math.max(0, 1 + tA * kr), wB = Math.max(0, 1 + tB * kr);
        const vBit = (dA * wA + dB * wB) / 2 * dtR;
        vRensk += vBit;
        if (iTrauet) vUtskifting += vBit;
      }
    }
  }

  /* Slitelaget ligger bare over kjørebanen. Utenfor - pa skuldrene - er det
     bærelaget som gar helt opp til veinivaet. Uten dette ble den øverste
     desimeteren av skuldrene gravd ut, men aldri fylt igjen med noe: 50 til
     100 kubikk per kilometer som ikke sto pa noen post. */
  const bredde = mal.vegbredde + utvidelse;
  const slitebredde = Math.min(mal.slitelagBredde + utvidelse, bredde);
  const arealSlitelag = mal.slitelagTykkelse * slitebredde;
  /* VEGKROPPEN HAR SKRÅ KANT, IKKE LODDRETT.
     Her sto `tykkelse · bredde` for hvert lag – to rektangler som endte i en
     loddrett vegg ved vegkanten, med skråningen startende i planum rett under.
     Målt på en veg 1,5 m over terrenget: vegoverflaten i kanten på kote 101,388
     og planum på 100,688, en 0,70 m høy vegg som ingen post dekket.

     Kanten skrår ut og ned med `overbygningHelning`, så i høyden y over planum
     er halvbredden hb + (ob − y)·h. Hele stabelen blir da
        ∫₀^ob 2·(hb + (ob − y)·h) dy  =  bredde·ob + h·ob²
     Første leddet er plata som sto her før; `h·ob²` er de to kilene på skuldrene.
     Med standardmalen: 4,5 · 0,70 = 3,150 pluss 1,5 · 0,49 = 0,735 m²/lm.

     HELE KILEN GÅR I BÆRELAGET. Slitelaget ligger bare over kjørebanen og skal
     ikke ut på skulderen – der er det bærelagsmasse, ikke asfalt. */
  const kile = obHelning * ob * ob;
  const arealBaerelag = bredde * ob + kile - arealSlitelag;

  return {
    s, x: p.x, y: p.y, retning: p.retning, krumning: kr,
    radius: linje.radiusVed(s),
    vegnivaa,
    terrengSenter: terrRå(0),
    utvidelse,
    halvbredde: hb,
    fjelldybde,
    // bredden og dybden av selve sprengningen i dette snittet
    fjellbredde: breddeFjell,
    fjellSkjaeringsdybde: maksFjelldybde,
    /* Løsmasse som blir liggende under trauet fordi maksdybden slo inn.
       Null når fjellet nås – se `maksUtskifting` i malen. */
    utskiftingRest,
    /* HVOR TRAUET SLUTTER, slik tegningen kan fargelegge nøyaktig det som
       skiftes ut og ikke en meter for mye. Begge oppgis som halvbredde, som
       `halvbredde` – fra senterlinjen ut, til hver side.

       `utskiftingHalvbredde` er den YTRE enden, der veggen møter den vanlige
       renskebunnen. Det er den tegningen trenger: klippes det blå til bunnen i
       stedet, blir flankene kappet bort, og de er en tredel av volumet.
       `utskiftingBunnHalvbredde` er der bunnen slutter og veggen begynner.
       Begge er null når utskiftingen er av, for da finnes det ikke noe trau. */
    utskiftingHalvbredde: mal.utskifting
      ? Math.max(veggMoeter(-1), veggMoeter(1)) : 0,
    utskiftingBunnHalvbredde: mal.utskifting ? tUtskiftBunn : 0,
    /* Skulderen: hvor langt vegkroppen står forbi vegkanten i planum. Tegningen
       trenger den for å vise den skrå kanten – regnet den selv, ville to steder
       regnet det samme, og de kan komme i utakt. */
    skulderbredde: skulder,
    areal: {
      skjaering: arealSkjaering,
      skjaeringFjell: arealSkjaeringFjell,
      skjaeringLosmasse: arealSkjaering - arealSkjaeringFjell,
      fylling: arealFylling,
      rensk: arealRensk,
      /* Delen av rensken som er masseutskifting under vegkroppen. `rensk` er
         fortsatt hele posten, så ingenting som leser den fra før endrer svar. */
      utskifting: arealUtskifting,
      slitelag: arealSlitelag,
      baerelag: arealBaerelag
    },
    vektet: {
      skjaering: vSkjaering,
      skjaeringFjell: vSkjaeringFjell,
      skjaeringLosmasse: vSkjaering - vSkjaeringFjell,
      fylling: vFylling,
      rensk: vRensk,
      utskifting: vUtskifting,
      slitelag: arealSlitelag,
      baerelag: arealBaerelag
    },
    maksSkjaering, maksFylling,
    fotVenstre: tV, fotHoyre: tH,
    /* Kotene i skraningsfoten. Uten dem ble fotavtrykket eksportert pa z = 0 -
       hundre meter under vegen - og en Civil 3D-flate bygd pa det drar seg ned
       til havnivaet.
       De males med jordflate() pa NØYAKTIG den offseten som eksporteres. Tar
       man i stedet siste knekkpunkt, gjelder det den uklippede foten, og med
       `beregningsbredde` satt hører den til et annet sted enn tallet ved siden av. */
    zFotVenstre: jordflate(tV), zFotHoyre: jordflate(tH),
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
  maksUtskifting: [0, 15, 'Største utskiftingsdybde'],
  tverrfall: [0, 0.3, 'Tverrfall'],
  maksSokebredde: [1, 500, 'Søkebredde'],
  beregningsbredde: [0, 500, 'Beregningsbredde']
};

/** Samme for omregningsfaktorene: en faktor under null snur et volum. */
const FAKTORGRENSER = {
  sprengningsfaktor: [1, 3, 'Sprengningsfaktor'],
  /* Her sto en regel for en faktor som ikke finnes i StandardFaktorer og som
     ikke rører et eneste volum. Programmets eget skjema skriver den aldri –
     men en håndredigert eller fremmed prosjektfil tar nøkkelen med inn, og da
     SLO regelen ut og løy: «Løsmassefaktor var 99 – utenfor 1 til 3, regnet
     med 3» om et tall ingenting leser. Den ekte er `losmasseIFylling` under. */
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
/**
 * Er dette et tall det gar an a regne med?
 *
 * `isFinite` alene duger ikke: den gjør om argumentet til tall først, og da er
 * `isFinite(null)`, `isFinite('')` og `isFinite([])` alle sanne. Null blir til
 * null, og null er et gyldig tall - bare ikke det brukeren mente. En tom
 * fjelldybde ble slik til «fjell i dagen», og hele skjæringen ble bokført som
 * sprengning uten en eneste merknad.
 */
function erTall(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function rettInngang(mal, faktorer, fjell, dS, bf) {
  const merknader = [];
  const klem = (obj, grenser, hva) => {
    for (const felt of Object.keys(grenser)) {
      const [lav, høy, navn] = grenser[felt];
      const v = obj[felt];
      /* Et felt som ikke finnes i det hele tatt skal fa standardverdien uten
         merknad - det er slik eldre prosjektfiler ser ut. Men star det noe der
         som ikke er et tall, er det en verdi pa avveie, og da ma det sies. */
      if (v === undefined) {
        if (obj[felt] === undefined && StandardMal[felt] !== undefined && hva === 'mal') obj[felt] = StandardMal[felt];
        else if (obj[felt] === undefined && hva !== 'mal' && StandardFaktorer[felt] !== undefined) obj[felt] = StandardFaktorer[felt];
        continue;
      }
      if (!erTall(v)) {
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

  /* Skraningene. Her sto det bare en merknad, og verdien ble aldri rettet -
     merknaden lovte «regnet med 0.02», men malen beholdt det som sto der.
     Math.max(0.02, null) er 0.02, sa det gikk bra sa lenge verdien var null;
     var den NaN, ble Math.max(0.02, NaN) til NaN, og hele volumet med den. */
  const SKRAANING = [
    ['skjaeringLosmasse', 'Skjæring i løsmasse', 0.02, 10],
    ['skjaeringFjell', 'Skjæring i fjell', 0.02, 10],
    ['fylling', 'Fyllingsskråning', 0.02, 10]
  ];
  for (const [felt, navn, lav, høy] of SKRAANING) {
    const v = mal[felt];
    if (!erTall(v)) {
      merknader.push({ s: 0, type: 'inngang', tekst: `${navn} er ikke et tall – regnet med ${StandardMal[felt]}` });
      mal[felt] = StandardMal[felt];
    } else if (v < lav || v > høy) {
      mal[felt] = Math.min(høy, Math.max(lav, v));
      merknader.push({ s: 0, type: 'inngang', tekst: `${navn} var ${v} – regnet med ${mal[felt]}` });
    }
  }

  /* En fjelldybde som ikke er et tall smitter over pa hele massebalansen, og
     det uten et eneste tegn: skjæringen blir riktig, men fjell, løsmasse og
     alt som bygger pa dem blir NaN. */
  if (fjell) {
    /* Her sto det `isFinite`, som gjør om argumentet til tall først. En tom
       fjelldybde - null eller tom streng - ble derfor lest som null meter, og
       da ligger fjellet i dagen: hele skjæringen ble bokført som sprengning.
       Prøvd: 2 991 m³ sprengning i stedet for 1, uten en eneste merknad. */
    if (!erTall(fjell.standarddybde)) {
      /* Ikke null her. Null dybde betyr fjell i dagen, og da blir hele
         skjæringen bokført som sprengning - den dyreste posten i hele
         regnestykket, satt av en tom rute. Den vanlige standarddybden er
         riktigere, og merknaden sier hva som skjedde. */
      merknader.push({
        s: 0, type: 'inngang',
        tekst: `Dybden til fjell er ikke et tall (${JSON.stringify(fjell.standarddybde)}) – regnet med 0.5 m`
      });
      fjell.standarddybde = 0.5;
    } else if (fjell.standarddybde < 0) {
      merknader.push({ s: 0, type: 'inngang', tekst: `Dybden til fjell var ${fjell.standarddybde} – regnet med 0` });
      fjell.standarddybde = 0;
    }
    let daarlege = 0;
    for (const p of (fjell.punkter || [])) {
      if (!erTall(p.dybde) || p.dybde < 0) { p.dybde = fjell.standarddybde; daarlege++; }
    }
    for (const st of (fjell.strekninger || [])) {
      if (!erTall(st.dybde) || st.dybde < 0) { st.dybde = fjell.standarddybde; daarlege++; }
    }
    if (daarlege) {
      merknader.push({
        s: 0, type: 'inngang',
        tekst: `${daarlege} fjellobservasjon${daarlege === 1 ? '' : 'er'} mangler dybde – `
          + `regnet med standarddybden ${fjell.standarddybde} m`
      });
    }
  }

  /* Profilavstanden er den farligste av dem alle: null eller negativ gir en
     løkke som aldri kommer ut, og fana henger. */
  let dSut = dS;
  if (!erTall(dSut) || dSut <= 0) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Profilavstanden var ${dS} – regnet med 5 m` });
    dSut = 5;
  } else if (dSut > 100) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Profilavstanden var ${dS} m – regnet med 100 m` });
    dSut = 100;
  }

  let bfUt = bf;
  if (!erTall(bfUt) || bfUt <= 0) {
    merknader.push({ s: 0, type: 'inngang', tekst: `Bakkefaktoren var ${bf} – regnet med 1` });
    bfUt = 1;
  } else if (bfUt < 0.9 || bfUt > 1.1) {
    /* Bakkefaktoren gar i andre potens pa hvert volum. I Norge ligger den
       mellom 0,999 og 1,001; kommer det noe utenfor et par prosent, er det
       ikke en malestokk, det er et tall pa avveie. */
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

  /* EN SNUPLASS SKAL LIGGE DER DEN ER SATT, IKKE DER RUTENETTET TILFELDIGVIS
     FALLER. Stasjonene er et jevnt rutenett - standard hver femte meter - og en
     plass på femten meter har kanter som nesten aldri lander på det nettet.
     Volumet regnes med gjennomsnittlig endeareal mellom profiler, så en kant
     mellom to profiler blir smurt ut over hele mellomrommet: plassen blir for
     lang i den ene enden og for kort i den andre, og tallet henger på hvor
     brukeren tilfeldigvis klikket. Kantene legges derfor inn som egne
     stasjoner, slik knekkpunktene gjøres ellers i fila. */
  const kanter = plassKanter(o.plasser, linje.lengde, mal.utvidelseOvergang || 0);
  if (kanter.length) {
    for (const k of kanter) stasjoner.push(k);
    stasjoner.sort((a, b) => a - b);
    /* To profiler på samme sted gir et strekk uten lengde. Det koster ingenting
       i volum, men `geometriFor` velger naboer med halveringssøk og en dublett
       gjør søket tvetydig. */
    for (let i = stasjoner.length - 1; i > 0; i--) {
      if (stasjoner[i] - stasjoner[i - 1] < 1e-6) stasjoner.splice(i, 1);
    }
  }

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

  let utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner, null, o.plasser);
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
      utvidelser = lagUtvidelsesprofil(linje, mal, stasjoner, paslag, o.plasser);
      profiler = kjørProfiler(utvidelser);
    }
  }

  /**
   * Regner om ett tverrprofil med tegningsgeometri, for skjermen.
   *
   * Stasjonene ligger sortert, sa naboen finnes med halveringssok. Her sto en
   * gjennomgang av hele lista. Det merkes ikke nar tverrsnittet ber om ett
   * snitt, men 3D-modellen ber om ett per profil pa hele vegen: pa en veg med
   * 2 000 stasjoner ble det fire millioner sammenligninger for a finne det
   * programmet allerede visste hvor la.
   */
  const geometriFor = s => {
    let lav = 0, hoy = stasjoner.length - 1;
    while (hoy - lav > 1) {
      const m = (lav + hoy) >> 1;
      if (stasjoner[m] <= s) lav = m; else hoy = m;
    }
    const i = Math.abs(stasjoner[hoy] - s) < Math.abs(stasjoner[lav] - s) ? hoy : lav;
    return ettProfil(stasjoner[i], utvidelser[i], true);
  };

  // --- Volum mellom profilene (gjennomsnittlig endeareal) ------------
  /* `utskifting` er med her, ikke bare som snittareal: ellers kunne tegningen
     fargelegge utskiftingen mens rapporten ikke kunne si hvor mange kubikk det
     blå er. Den ligger INNE i `rensk` og skal ikke legges til noen sum. */
  const felt = ['skjaering', 'skjaeringFjell', 'skjaeringLosmasse', 'fylling', 'rensk', 'utskifting', 'slitelag', 'baerelag'];
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

  /* SPRENGNINGEN SOM LØPEMETER OG AREAL, IKKE BARE KUBIKK.
     Den som skal sprenge priser sjelden på kubikk alene. Han spør: hvor langt
     er strekket, hvor bredt er det, og hvor mange steder må jeg rigge? Fem
     tusen kubikk samlet på hundre meter er én rigging; de samme fem tusen
     fordelt på tolv flekker langs to kilometer er tolv riggingner og en helt
     annen pris.
     Tre tall, alle regnet av det som alt er regnet:
       · løpemeter – summen av de strekkene der det i det hele tatt er fjell å ta
       · areal – fotavtrykket av sprengningen, altså bredden på fjellskjæringen
         ganger lengden, målt på bakken
       · antall strekk – hvor mange steder han må flytte riggen til

     GRENSEN ER IKKE NULL. Et profil med en kubikkdesimeter fjell er ikke et
     sprengningssted; det er en stein i skråningen. `terskel` er satt til en
     tiendedels kvadratmeter tverrsnitt – under det finnes det ikke en salve. */
  const TERSKEL = 0.1;
  const sprengning = { lopemeter: 0, areal: 0, strekk: [], antallStrekk: 0, storsteBredde: 0 };
  let paagaaende = null;
  for (let i = 0; i < profiler.length - 1; i++) {
    const a = profiler[i], b = profiler[i + 1];
    const L = (b.s - a.s) * bf;                 // bakkelengde, som resten av rapporten
    const aA = a.areal.skjaeringFjell, aB = b.areal.skjaeringFjell;
    if (aA <= TERSKEL && aB <= TERSKEL) {
      if (paagaaende) { sprengning.strekk.push(paagaaende); paagaaende = null; }
      continue;
    }
    sprengning.lopemeter += L;
    /* Bredden er MÅLT i snittet, ikke regnet tilbake av et areal: summen av de
       stegene der det faktisk er fjell over planum. Et areal delt på en dybde
       ville gitt et gjennomsnitt som er sant for en rektangulær skjæring og
       galt for alle andre. */
    const bA = a.fjellbredde || 0, bB = b.fjellbredde || 0;
    sprengning.areal += (bA + bB) / 2 * L;
    sprengning.storsteBredde = Math.max(sprengning.storsteBredde, bA, bB);
    if (!paagaaende) paagaaende = { fra: a.s, til: a.s, lengde: 0, volum: 0, storsteDybde: 0 };
    paagaaende.til = b.s;
    paagaaende.lengde += L;
    paagaaende.volum += (a.vektet.skjaeringFjell + b.vektet.skjaeringFjell) / 2 * (b.s - a.s) * volumFaktor;
    paagaaende.storsteDybde = Math.max(paagaaende.storsteDybde,
      a.fjellSkjaeringsdybde || 0, b.fjellSkjaeringsdybde || 0);
  }
  if (paagaaende) sprengning.strekk.push(paagaaende);
  sprengning.antallStrekk = sprengning.strekk.length;
  sprengning.volum = sum.skjaeringFjell;

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

  /* «TIL SAMMEN X M³ SKAL UT AV ANLEGGET» MÅ VÆRE ÉN ENHET.
     Rapporten la sammen `tilDeponi`, som er prosjektert FAST volum, med
     `overskuddFjell` og `overskuddLos`, som begge alt er ganget opp til
     FYLLINGSvolum. Målt på en rett veg på 400 m med standardfaktorene:
     1 945,7 fast + 1 074,1 + 1 453,7 fyllingsvolum ga 4 473 m³ i rapporten.
     Konsekvent i fast volum er tallet 4 194,5; som løst på lass 5 522,7; som
     fyllingsvolum 4 376,2. Det som sto der var ingen av de tre.
     Mest direkte sagt: den samme kubikkmeteren løsmasseskjæring telles som
     1,00 m³ hvis den er ubrukbar og 0,95 hvis den er brukbar men blir til
     overs. Og dette er tallet transporten bestilles etter. */
  const overskuddFjellFast = faktorer.fjellIFylling > 0
    ? overskuddFjell / faktorer.fjellIFylling : 0;
  const overskuddLosFast = faktorer.losmasseIFylling > 0
    ? overskuddLos / faktorer.losmasseIFylling : 0;
  const utAvAnlegget = tilDeponi + overskuddFjellFast + overskuddLosFast;

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
     den som ble tegnet, og det sto ingen steder.

     DETTE ER EN OPPLYSNING, IKKE ET BRUDD.
     Den ble bokført som type 'linje' og talt med i «brudd». Normaler for
     landbruksveier setter en NEDRE grense for radius; ingen kilde krever at
     den bygde radien er lik den tegnede. En kurve på 28 m der kravet er 20 er
     en fullt lovlig kurve. Feilklassifiseringen var grunnen til at «Gjør
     lovlig» jaktet på fantomer: sju innkortede kurver ble talt som sju brudd,
     og knappen ga opp fordi den ikke hadde noe verktøy som traff dem.
     Det ekte kurvaturbruddet – oppnådd radius under minstekravet – kontrolleres
     lenger nede, per profil, mot `mal.minRadius`. */
  for (const a of (linje.advarsler || [])) {
    const kurve = (linje.kurver || []).find(k => k.ip === a.ip);
    merknader.push({
      s: kurve ? kurve.sBC : 0,
      type: /kortet inn/.test(a.tekst || '') ? 'avvik' : 'linje',
      tekst: a.tekst || String(a)
    });
  }

  /* SKARPE HJØRNER.
     Et innvendig knekkpunkt uten kurve gir ingen post i `kurver`, og
     `radiusVed` svarer Infinity på rettstrekket gjennom det. En kontroll som
     bare ser på kurver, ser det derfor aldri: malt over knappe to tusen linjer
     med et virkelig skarpt hjørne ble 190 meldt som helt lovlige. Radius null
     er under ethvert minstekrav. */
  if (mal.minRadius > 0 && typeof linje.skarpeHjorner === 'function') {
    for (const h of linje.skarpeHjorner()) {
      const grader = Math.abs(h.avboy) * 180 / Math.PI;
      if (grader < 1) continue;              // praktisk talt rett fram
      merknader.push({
        s: 0, type: 'kurvatur',
        tekst: `Knekkpunkt ${h.kilde + 1} er et skarpt hjørne – avbøyningen er `
          + `${kom(grader, 0)}°, og det er ingen kurve der. Minstekravet er `
          + `${mal.minRadius} m.`
      });
    }
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
        s: pr.s, type: 'stigning', verdi: Math.abs(stign) * 100, enhet: '%', vaerst: 'stor',
        tekst: `Stigning ${kom((Math.abs(stign) * 100), 1)} % overstiger ${kom((maks * 100), 0)} % `
          + `${lassetKlatrer ? 'i lassretningen' : 'i returretningen'} `
          + (iKurven ? `(radius ${kom(pr.radius, 0)} m)`
            : isFinite(kravRadius) ? `(utflating mot kurve med radius ${kom(kravRadius, 0)} m)` : '(rettstrekk)')
          + (rad ? ` – holder med radius ${rad > 1e8 ? 'over 60' : rad} m` : ''),
        raad: rad ? { type: 'radius', radius: rad > 1e8 ? 60 : rad } : { type: 'stigning', maks }
      });
    }
    if (isFinite(pr.radius) && mal.minRadius && pr.radius < mal.minRadius - 1e-6) {
      merknader.push({
        s: pr.s, type: 'kurvatur', verdi: pr.radius, enhet: 'm', vaerst: 'liten',
        tekst: `Radius ${kom(pr.radius, 1)} m er under minstekravet på ${mal.minRadius} m`
      });
    }
    if (!isFinite(pr.terrengSenter)) {
      merknader.push({ s: pr.s, type: 'data', tekst: 'Mangler terrengdata' });
    }
    if (mal.maksFyllingshoyde > 0 && pr.maksFylling > mal.maksFyllingshoyde) {
      merknader.push({
        s: pr.s, type: 'fylling', verdi: pr.maksFylling, enhet: 'm', vaerst: 'stor',
        tekst: `Fyllingshøyde ${kom(pr.maksFylling, 1)} m over grensen på ${mal.maksFyllingshoyde} m`
      });
    }
    if (mal.maksSkjaeringsdybde > 0 && pr.maksSkjaering > mal.maksSkjaeringsdybde) {
      merknader.push({
        s: pr.s, type: 'skjaering', verdi: pr.maksSkjaering, enhet: 'm', vaerst: 'stor',
        tekst: `Skjæringsdybde ${kom(pr.maksSkjaering, 1)} m over grensen på ${mal.maksSkjaeringsdybde} m`
      });
    }
    /* UTSKIFTINGEN STOPPET FØR FJELLET.
       Grensa er satt med vilje – dypere enn fire meter er det ikke lenger
       utskifting man driver med. Men da blir det liggende løsmasse igjen
       under vegen, og det er en forutsetning tallet hviler på. Den skal stå i
       merknadene og ikke i hodet på den som satte grensa. */
    if (mal.utskifting && pr.utskiftingRest > 0.05) {
      merknader.push({
        s: pr.s, type: 'utskifting', verdi: pr.utskiftingRest, enhet: 'm', vaerst: 'stor',
        tekst: `Fjellet ligger dypere enn grensen på ${kom(mal.maksUtskifting, 1)} m – `
          + `${kom(pr.utskiftingRest, 1)} m løsmasse blir liggende igjen under vegkroppen`
      });
    }
    if (mal.maksUtslag > 0) {
      const utslag = Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;
      if (utslag > mal.maksUtslag) {
        merknader.push({
          s: pr.s, type: 'utslag', verdi: utslag, enhet: 'm', vaerst: 'stor',
          tekst: `Skråningen stikker ${kom(utslag, 1)} m ut fra vegkant, grensen er ${mal.maksUtslag} m`
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
        tekst = `Knekk på ${kom((v.A * 100), 1)} % i ${sted} uten avrunding. `
          + `Kravet er radius ${v.krav} m, som trenger ${kom(v.kreves, 0)} m vertikalkurve`
          + (v.trangt ? `, men det er bare ${kom(v.plass, 0)} m til nærmeste høyde` : '');
      } else {
        tekst = `Vertikalkurve i ${sted} har radius ${kom(v.radius, 0)} m, `
          + `kravet er ${v.krav} m – `
          + (v.trangt
            ? `bruddet på ${kom((v.A * 100), 1)} % er for skarpt for avstanden mellom høydepunktene`
            : `øk K til ${kom((v.krav / 100), 1)}`);
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

  /* ÅTTIÉN LINJER SIER IKKE MER ENN ÉN.
     Målt på en ekte veg: 540 m, 110 profiler, 81 merknader – alle av formen
     «prof 225 – Fyllingshøyde 4,7 m over grensen på 4 m». Brukeren sa det
     rett ut: «jeg får alltid så mange merknader som jeg ikke kan ta bort eller
     rette opp i». Han har rett, og listen var grunnen: den fortalte 81 ganger
     at det samme kravet er brutt, uten å si hvor mye, hvor langt strekket er,
     eller hva som skulle til.
     Tomtesiden har gjort det riktig hele tiden (tomtmasser.js: «Høyeste fylling
     er X m, grensen er Y»). Dette er den samme sammenslåingen for vegen.

     TO LISTER, IKKE ÉN. `brudd` er den rå listen, én post per profil – den er
     det kostnadsfunksjonen, opptellingen og opplåsingen av høyder arbeider på,
     og de MÅ se hvert enkelt brudd. `merknader` er den brukeren leser. Ble de
     tvunget til å være samme liste, måtte man velge mellom en lesbar melding og
     en riktig retting. */
  const brudd = merknader.slice();
  const grupperbare = { fylling: 1, skjaering: 1, utslag: 1, stigning: 1, kurvatur: 1, data: 1, geometri: 1 };
  const samlet = [], grupper = new Map();
  for (const m of merknader) {
    if (!grupperbare[m.type] || !isFinite(m.s)) { samlet.push(m); continue; }
    let g = grupper.get(m.type);
    if (!g) {
      g = { type: m.type, poster: [], stasjoner: [] };
      grupper.set(m.type, g);
      samlet.push(g);            // holder rekkefølgen: gruppa står der den første sto
    }
    g.poster.push(m);
    g.stasjoner.push(m.s);
  }
  /* Verdien merknaden handler om står PÅ merknaden, satt der den ble målt.
     Å lese tallet tilbake ut av en setning man selv har skrevet er den slags
     kobling som ryker første gang noen retter en skrivefeil. */
  const grenseAv = {
    fylling: mal.maksFyllingshoyde, skjaering: mal.maksSkjaeringsdybde,
    utslag: mal.maksUtslag, kurvatur: mal.minRadius
  };
  const hvaAv = { fylling: 'Fyllingshøyde', skjaering: 'Skjæringsdybde',
    utslag: 'Skråningsutslaget', stigning: 'Stigningen',
    kurvatur: 'Kurveradien', data: 'Mangler terrengdata',
    geometri: 'Skråningen når ikke terrenget' };
  const merknaderUt = samlet.map(g => {
    if (!g.poster) return g;
    if (g.poster.length === 1) return g.poster[0];
    /* Verst er STØRST for alt som har en øvre grense, og MINST for radius, som
       har en nedre. Ett felt på merknaden avgjør det, i stedet for en liste
       over typer et sted langt fra der de lages. */
    let verst = g.poster[0];
    for (const m of g.poster) {
      if (!Number.isFinite(m.verdi)) continue;
      if (!Number.isFinite(verst.verdi)) { verst = m; continue; }
      if (m.vaerst === 'liten' ? m.verdi < verst.verdi : m.verdi > verst.verdi) verst = m;
    }
    const verdi = verst.verdi;
    const fra = Math.min(...g.stasjoner), til = Math.max(...g.stasjoner);
    const grense = grenseAv[g.type];
    const hva = hvaAv[g.type] || g.type;
    const e = verst.enhet || '';
    const tekst = Number.isFinite(verdi)
      ? `${hva} bryter kravet i ${g.poster.length} profiler, prof ${kom(fra, 0)}–${kom(til, 0)}`
        + (grense ? ` (grensen er ${kom(grense, e === '%' ? 0 : 1)} ${e})` : '')
        + `. Verst ${kom(verdi, 1)} ${e} ved prof ${kom(verst.s, 0)}.`
      : `${hva} i ${g.poster.length} profiler, prof ${kom(fra, 0)}–${kom(til, 0)}.`;
    /* RÅDET MÅ OVERLEVE SAMMENSLÅINGEN.
       Stigningsmerknaden er den eneste som bærer et maskinlesbart tiltak – «det
       holder med radius 40» – og et råd som forsvinner når linjene slås sammen,
       er verre enn ingen sammenslåing: da mister man nettopp det ene man kunne
       gjort noe med. Radius-rådet foretrekkes, for det er det som peker på en
       konkret endring; et rent stigningsråd sier bare at kravet er brutt. */
    const raad = g.poster.find(m => m.raad && m.raad.type === 'radius')
      || g.poster.find(m => m.raad);
    return {
      s: verst.s, type: g.type, tekst,
      raad: raad ? raad.raad : undefined,
      antall: g.poster.length, fra, til,
      verdi: Number.isFinite(verdi) ? verdi : undefined,
      enhet: verst.enhet,
      grense: grense == null ? undefined : grense,
      stasjoner: g.stasjoner.slice(),
      poster: g.poster
    };
  });

  return {
    stasjoner, profiler, intervaller, sum, bruckner, sprengning,
    merknader: merknaderUt, brudd,
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
      overskuddFjellFast, overskuddLosFast, utAvAnlegget,
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
