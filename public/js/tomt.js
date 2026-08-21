'use strict';
/**
 * Tomt - et areal som skal opparbeides til et ferdig nivå.
 *
 * Der en veg er en linje med et tverrsnitt, er en tomt et polygon med en
 * ferdig flate. Massene ligger mellom terrenget og den flaten, pluss det som
 * skråningene utenfor kanten tar med seg.
 *
 * Denne fila holder modellen: standardverdier, geometri og de regnestykkene
 * som bare gjelder selve polygonet - areal, omkrets, kanter, om punktet ligger
 * innenfor. Selve masseberegningen ligger i masser.js sammen med vegens.
 *
 * Se TOMTEMODUS-INNSTILLINGER.md for hvorfor feltene ser ut som de gjør.
 */

/* ------------------------------------------------------------------ *
 *  Standardverdier
 * ------------------------------------------------------------------ */

/**
 * De seks arbeidstypene. De styrer hvilke felt som vises og hvilke
 * standardverdier som settes - ikke hvordan volumet regnes.
 */
const Arbeidstyper = {
  planering: {
    navn: 'Planering',
    beskrivelse: 'Opparbeide et areal til ferdig nivå. Både skjæring og fylling.'
  },
  byggegrop: {
    navn: 'Byggegrop',
    beskrivelse: 'Grave ut for bygg, kjeller eller basseng. Bare skjæring.'
  },
  masseutskifting: {
    navn: 'Masseutskifting',
    beskrivelse: 'Fjerne dårlig masse og fylle tilbake med god. To volum, ikke ett.'
  },
  oppfylling: {
    navn: 'Oppfylling',
    beskrivelse: 'Bygge opp et areal. Bare fylling.'
  },
  uttak: {
    navn: 'Uttak',
    beskrivelse: 'Ta ut masse. Volumet er produktet, ikke en kostnad.'
  },
  deponi: {
    navn: 'Deponi',
    beskrivelse: 'Plass til overskuddsmasse. Spørsmålet er kapasitet.'
  }
};

/** Måtene det ferdige nivået kan settes på. */
const Nivaamoduser = {
  flat: 'Fast kote – helt flatt',
  fall: 'Fall i én retning',
  trePunkt: 'Plan gjennom tre punkt',
  sluk: 'Faller mot ett punkt',
  rennelinje: 'Faller mot en linje',
  takfall: 'Faller til begge sider fra en rygg',
  terreng: 'Følger terrenget med et fast avvik',
  balansert: 'Koten som gir massebalanse',
  fri: 'Egne høydepunkt, resten interpoleres'
};

/** Hva som kan stå langs en kant. */
const Kanttyper = {
  skraning: 'Planert skråning',
  fjellvegg: 'Sprengt bergvegg',
  mur: 'Støttemur',
  apen: 'Åpen – stopper her',
  overgang: 'Møter et annet anlegg'
};

/** Korte navn til kartet, der det ikke er plass til mer. */
const Kantkort = {
  skraning: 'skråning',
  fjellvegg: 'sprengt vegg',
  mur: 'mur',
  apen: 'åpen',
  overgang: 'overgang'
};

/**
 * Ferdige skråningssett etter jordart.
 *
 * N200 tabell 242.1 (skjæring uten erosjonssikring) og tabell 252.1 (fylling).
 * Tallene er vannrett utlegg per meter høyde, altsa 2,5 = 1:2,5.
 *
 * Grunnen til at dette ligger som ferdige sett og ikke som tre løse tall: det
 * er jordarten man vet noe om ute pa tomta, ikke helningen. Skal man slaa opp i
 * en tabell hver gang, blir det ikke gjort - og da star standardverdien igjen
 * pa noe som ikke passer grunnen.
 */
const Losmassetyper = {
  stein: { navn: 'Stein / sprengt masse', skjaering: 1.5, fylling: 1.25 },
  grus: { navn: 'Grus', skjaering: 2.0, fylling: 1.5 },
  sand: { navn: 'Sand', skjaering: 2.0, fylling: 2.0 },
  morene: { navn: 'Morene', skjaering: 2.5, fylling: 2.0 },
  silt: { navn: 'Finsand / silt', skjaering: 3.0, fylling: 3.0 },
  leire: { navn: 'Leire (0–10 m)', skjaering: 3.0, fylling: 2.5 }
};

const StandardTomtemal = {
  arbeidstype: 'planering',

  /* --- skråninger. Alle tall er VANNRETT UTLEGG PER METER HØYDE, som i
     vegmalen. Standardverdiene er morene, som er det vanligste i Agder.
     N200 tabell 242.1 (skjæring, uten erosjonssikring): stein 1,5 · grus 2,0 ·
     sand 2,0 · finsand/silt 3,0 · leire 3,0 · morene 2,5.
     N200 tabell 252.1 (fylling): stein 1,25 · grus 1,5 · sand 2,0 · morene
     2,0-3,0. --- */
  losmassetype: 'morene',    // styrer forslagene, ikke regnestykket
  skjaeringLosmasse: 2.5,
  skjaeringFjell: 0.2,       // 5:1 - som vegmalen
  fylling: 2.0,

  /* --- sprengt vegg ---
     En "rett vegg" er nesten aldri rett hele veien opp. Den star nær vertikalt
     i fjellet, men løsmassen som ligger over fjelloverflaten raser ut om den
     settes like bratt. Derfor to helninger: veggHelning gjelder under
     fjelloverflaten, losmasseOverFjell over den.

     Regner man hele veggen vertikal, blir løsmassevolumet for lite og
     skjæringstoppen havner feil sted i kartet - og summen ser rimelig ut, sa
     feilen synes ikke.

     MERK SKRIVEMATEN. Berg og løsmasse oppgis med motsatt logikk i normene:
     en bergvegg skrives 10:1 (ti opp, én ut - nesten loddrett), mens en
     jordskraning skrives 1:1,5 (én opp, halvannen ut - slak). Blandes de, blir
     volumet fullstendig feil. Derfor lagres alt her som ett entydig tall:
     VANNRETT UTLEGG PER METER HØYDE. 0,1 er da bergveggen (= 10:1) og 1,5 er
     jordskraningen (= 1:1,5). Skrivematen hører hjemme i skjermbildet, ikke i
     tallet. */
  veggHelning: 0.1,          // 10:1 - N200 kap. 223.1: "nær vertikale (10:1)"
  losmasseOverFjell: 2.0,    // 1:2 - løsmasse som blir staende over bergveggen
  maksVeggHoyde: 10.0,       // N200 kap. 202.1: over 10 m -> geoteknisk kategori 3
  bermeBredde: 1.5,          // hylle mellom paller; 4-6 m først over ca. 25 m
  bermeFall: 0.05,           // innover, sa vann ikke renner utfor
  renskUtenforVegg: 2.0,     // N200 kap. 223.4: avdekking min. 2 m utenfor kant

  /* Overberg - fjell som faktisk sprenges ut utenfor prosjektert kontur.
     Star pa null med vilje. R761 prosess 22.1: "Det gis ikke tillegg for
     overberg, masser fra driftsrensk eller ettersprengning", og utfall innenfor
     0,5 m fra konturen medregnes ikke. Setter man et tall her, kommer det som
     EGEN post i rapporten - aldri bakt inn i fjellvolumet, for da ville et
     tilbud sett dyrere ut enn oppgjøret blir. */
  overberg: 0,
  kontursprengning: false,

  /* R761 prosess 22 c): avstanden fra ferdig niva ned til fast berg ma vaere
     større enn 0,75 m, ellers ma det dypsprenges. Utløser en merknad. */
  minAvstandTilBerg: 0.75,

  /* --- støttemur ---
     Fundamentgrøfta og den drenerende bakfyllinga er to volum folk glemmer
     nar de bytter skraning med mur. Begge ma kjøres. */
  murtype: 'naturstein',     // naturstein | betongL | gabion | torrmur
  maksMurHoyde: 3.0,
  murAnlegg: 0.15,           // muren heller innover, H:V
  fundamentDybde: 0.6,
  fundamentBredde: 0.8,
  bakfylling: 0.5,           // drenerende masse bak muren, meter

  /* --- hjørner --- */
  hjornebehandling: 'vifte', // vifte | avrunding | skjaer
  hjorneradius: 3.0,         // ved 'avrunding'
  overgangslengde: 4.0,      // der to ulike kanttyper møtes

  /* --- lagene over og under ferdig nivå --- */
  matjordDybde: 0.25,
  matjordMellomlagres: true,
  renskDybde: 0.20,
  renskUtenfor: 1.0,
  frostsikring: 0.0,
  forsterkningslag: 0.40,
  baerelagTykkelse: 0.10,
  slitelagTykkelse: 0.05,
  avrettingslag: 0.0,
  fiberduk: true,

  /* --- grenser --- */
  maksFyllingshoyde: 4.0,
  maksSkjaeringsdybde: 8.0,
  maksUtslag: 15.0,
  minstefall: 0.01,          // under dette blir det staende vann
  maksfall: 0.08,            // over dette blir plassen ubehagelig a bruke
  holdInnenforGrense: false,

  /* --- beregning --- */
  rutestorrelse: 1.0,        // terrenget kommer som 1 m rutenett fra Kartverket
  maksSokebredde: 45,
  beregningsbredde: 0
};

/** Et tomt, nytt tomteanlegg. */
function nyTomt() {
  return {
    form: 'polygon',         // polygon | rektangel | sirkel
    /* Hva omrisset man tegner betyr.
       'planum'      - det man tegner er selve tomta, og skraningene kommer
                       utenpa. Slik man tegner nar man vet hvor plassen skal
                       ligge.
       'yttergrense' - det man tegner er ytterkanten av inngrepet, altsa der
                       skraningen møter terrenget. Slik man tegner nar man vet
                       hvor tomtegrensen gar og ingenting skal utenfor den. Da
                       regnes den ferdige flaten INNOVER, og den blir mindre
                       enn det man tegnet. */
    omrissBetyr: 'planum',
    punkter: [],             // [{lat, lon}] ytterkant
    hull: [],                // [[{lat, lon}]] utsparinger som ikke røres
    kanter: [],              // overstyringer per kant, indeks = kantnummer
    nivaa: {
      /* Flatt er standarden. En tomt er som regel tenkt flat, og fallet er noe
         man legger pa bevisst der vann skal renne av. Sto den pa fall fra
         starten, matte man skru det av hver gang - og et fall pa to prosent man
         ikke har bedt om flytter en hel meter over femti meter. */
      modus: 'flat',
      kote: null,            // null = ikke satt enda, foreslas fra terrenget
      fall: 0.02,            // brukes nar man velger fall
      fallretning: 0,        // grader fra nord, dit vannet renner
      punkt: null,           // for 'sluk'
      linje: null,           // for 'rennelinje'
      offset: 0,             // for 'terreng'
      hoydepunkter: []       // for 'fri'
    }
  };
}

/* ------------------------------------------------------------------ *
 *  Geometri
 * ------------------------------------------------------------------ */

/**
 * Areal av et polygon, med skolisseformelen.
 *
 * Punktene ma vaere i et plant koordinatsystem (UTM), ikke i grader -
 * lengdegrader er ikke like lange som breddegrader, og et areal regnet
 * rett pa lat/lon blir feil med en faktor cos(bredde).
 *
 * Fortegnet sier hvilken vei polygonet gar: positivt mot klokka.
 */
function signertAreal(p) {
  if (!p || p.length < 3) return 0;
  let a = 0;
  /* Kryssproduktforma, ikke trapesforma.
     Her sto det `(x_j + x_i) * (y_j - y_i)`, som gir riktig areal men MOTSATT
     fortegn av leddet tyngdepunktet regnes med. Da ble tyngdepunktet negert:
     et rektangel med hjørne i origo fikk tyngdepunkt i (-20, -30) i stedet for
     (20, 30). Arealet sa fortsatt riktig ut, siden det tas absoluttverdi av -
     men et ferdig niva med fall regnes ut fra tyngdepunktet, og det havnet
     hundre meter pa feil side av tomta.
     Og `kanter()` leser fortegnet for a vite hvilken vei som er UT. Med feil
     fortegn pekte alle normalene innover. */
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += p[j].x * p[i].y - p[i].x * p[j].y;
  }
  return a / 2;
}

function areal(p) { return Math.abs(signertAreal(p)); }

/** Omkrets. Samme krav til koordinatsystem som areal(). */
function omkrets(p) {
  if (!p || p.length < 2) return 0;
  let l = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    l += Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
  }
  return l;
}

/** Tyngdepunkt. Faller tilbake til midlere hjørne for et polygon uten areal. */
function tyngdepunkt(p) {
  if (!p || !p.length) return null;
  const a = signertAreal(p);
  if (Math.abs(a) < 1e-9) {
    return {
      x: p.reduce((s, q) => s + q.x, 0) / p.length,
      y: p.reduce((s, q) => s + q.y, 0) / p.length
    };
  }
  let cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j].x * p[i].y - p[i].x * p[j].y;
    cx += (p[j].x + p[i].x) * f;
    cy += (p[j].y + p[i].y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Ligger punktet innenfor polygonet?
 *
 * Strålemetoden: tell hvor mange kanter en stråle mot høyre krysser.
 * Ulikhetene er satt slik at et punkt nøyaktig pa en vannrett kant ikke
 * telles to ganger - ellers ville hjørner gitt tilfeldige svar.
 */
function innenfor(p, x, y) {
  if (!p || p.length < 3) return false;
  let inne = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const yi = p[i].y, yj = p[j].y;
    if ((yi > y) !== (yj > y)) {
      const xKryss = p[i].x + (y - yi) / (yj - yi) * (p[j].x - p[i].x);
      if (x < xKryss) inne = !inne;
    }
  }
  return inne;
}

/**
 * Kantene i polygonet, med utoverrettet normal.
 *
 * Normalen ma peke ut av tomta, ellers marsjerer skraningen innover og
 * spiser av arealet i stedet for a legge seg utenfor. Retningen avgjøres av
 * fortegnet pa arealet, sa den blir riktig uansett hvilken vei brukeren
 * tegnet.
 */
function kanter(p) {
  if (!p || p.length < 2) return [];
  const motKlokka = signertAreal(p) > 0;
  const ut = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;                 // to punkt pa samme sted
    // venstre normal er (-dy, dx); den peker ut nar polygonet gar med klokka
    const tegn = motKlokka ? -1 : 1;
    ut.push({
      nr: i, a, b, lengde: len,
      retning: Math.atan2(dy, dx),
      nx: tegn * -dy / len,
      ny: tegn * dx / len
    });
  }
  return ut;
}

/**
 * Er hjørnet mellom to kanter konvekst sett utenfra?
 *
 * Konvekst hjørne: skraningene fra de to kantene møtes ikke, og gapet ma
 * fylles med en vifte eller en avrunding.
 * Konkavt hjørne: skraningene overlapper, og ma trimmes mot hverandre -
 * ellers telles volumet to ganger.
 */
function hjorneErKonvekst(k1, k2) {
  const kryss = k1.nx * k2.ny - k1.ny * k2.nx;
  return kryss < 0;
}

/**
 * Hva den ferdige flaten star i, i et gitt punkt.
 *
 * @param {object} nivaa   fra tomt.nivaa
 * @param {number} x,y     UTM
 * @param {object} referanse  {x, y} som `kote` gjelder for - som regel tomtas
 *                            tyngdepunkt
 * @returns {number} kote, eller NaN om nivaet ikke lar seg regne enda
 */
function nivaaVed(nivaa, x, y, referanse) {
  if (!nivaa || !erTall(nivaa.kote)) return NaN;
  const k = nivaa.kote;
  switch (nivaa.modus) {
    case 'flat':
      return k;

    case 'fall': {
      if (!referanse) return k;
      /* Fallretningen er grader fra nord, den veien vannet renner. Enhets-
         vektoren dit er (sin, cos) i (øst, nord) - ikke (cos, sin). Bytter
         man om, faller flaten 90 grader feil vei, og det synes ikke pa
         volumet i det hele tatt: en plan flate over et areal gir omtrent
         samme masse uansett hvilken vei den heller. */
      const rad = (nivaa.fallretning || 0) * Math.PI / 180;
      const ex = Math.sin(rad), ey = Math.cos(rad);
      const langs = (x - referanse.x) * ex + (y - referanse.y) * ey;
      return k - langs * (nivaa.fall || 0);
    }

    case 'sluk': {
      if (!nivaa.punkt || !erTall(nivaa.punkt.x)) return k;
      const d = Math.hypot(x - nivaa.punkt.x, y - nivaa.punkt.y);
      return k - d * (nivaa.fall || 0) * -1;   // stiger utover fra sluket
    }

    default:
      return k;
  }
}

function erTall(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/* ------------------------------------------------------------------ *
 *  Kontroll av det brukeren har tegnet
 * ------------------------------------------------------------------ */

/**
 * Ser over polygonet og sier fra om det som ikke lar seg regne pa.
 * Samme form pa merknadene som i masser.js, sa de kan vises samme sted.
 */
function sjekkTomt(tomt, punkterUtm) {
  const m = [];
  const p = punkterUtm || [];
  if (p.length < 3) {
    m.push({ type: 'tomt', tekst: 'Tomta trenger minst tre hjørner' });
    return m;
  }
  const a = areal(p);
  if (a < 4) {
    m.push({ type: 'tomt', tekst: `Arealet er bare ${a.toFixed(1)} m² – er polygonet tegnet riktig?` });
  }
  // to hjørner på samme sted gir en kant uten lengde og en normal som ikke finnes
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length];
    if (Math.hypot(p[i].x - b.x, p[i].y - b.y) < 0.05) {
      m.push({ type: 'tomt', tekst: `Hjørne ${i + 1} og ${(i + 1) % p.length + 1} står på samme sted` });
    }
  }
  if (selvkryssende(p)) {
    m.push({ type: 'tomt', tekst: 'Kantene krysser hverandre – arealet blir ikke entydig' });
  }
  return m;
}

/**
 * Krysser polygonet seg selv?
 *
 * Et selvkryssende polygon har ikke ett entydig areal - skolisseformelen gir
 * differansen mellom de to løkkene, ikke summen. Da blir volumet feil uten at
 * noe ser galt ut, sa det ma fanges.
 */
function selvkryssende(p) {
  const n = p.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;        // nabokanter deler hjørne
      if (segmenterKrysser(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

function segmenterKrysser(a, b, c, d) {
  const s = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const d1 = s(a, b, c), d2 = s(a, b, d), d3 = s(c, d, a), d4 = s(c, d, b);
  return d1 !== d2 && d3 !== d4;
}

/* ------------------------------------------------------------------ */

/* Samlet under ett navn, sa resten av programmet kan skrive Tomt.areal(…)
   i stedet for a ha et dusin løse navn liggende i vinduet. */
const Tomt = {
  Arbeidstyper, Nivaamoduser, Kanttyper, Kantkort, Losmassetyper, StandardTomtemal, nyTomt,
  signertAreal, areal, omkrets, tyngdepunkt, innenfor, kanter,
  hjorneErKonvekst, nivaaVed, sjekkTomt, selvkryssende
};

if (typeof module !== 'undefined') {
  module.exports = Tomt;
}
