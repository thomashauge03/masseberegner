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
  fjellvegg: 'Sprengt vegg',
  mur: 'Støttemur',
  apen: 'Åpen – ingenting regnes utenfor',
  overgang: 'Møter et annet anlegg'
};

const StandardTomtemal = {
  arbeidstype: 'planering',

  /* --- skråninger, samme betydning som i vegmalen (H:V) --- */
  skjaeringLosmasse: 1.5,
  skjaeringFjell: 0.2,
  fylling: 1.5,

  /* --- sprengt vegg ---
     En "rett vegg" er nesten aldri rett hele veien opp. Den star vertikalt i
     fjellet, men løsmassen som ligger over fjelloverflaten raser ut om den
     settes like bratt. Derfor to helninger: veggHelning gjelder under
     fjelloverflaten, losmasseOverFjell over den.

     Regner man hele veggen vertikal, blir løsmassevolumet for lite og
     skjæringstoppen havner feil sted i kartet - og summen ser rimelig ut, sa
     feilen synes ikke. */
  veggHelning: 0.1,          // H:V under fjelloverflaten. 0 = loddrett
  losmasseOverFjell: 1.5,    // H:V over fjelloverflaten
  maksVeggHoyde: 8.0,        // over dette kreves berme
  bermeBredde: 3.0,
  bermeFall: 0.05,           // innover, sa vann ikke renner utfor

  /* Fjell som sprenges ut utenfor teoretisk profil. Dette er ekte masse som
     skal lastes og kjøres, men som ikke star i den teoretiske beregningen.
     Føres som egen post i rapporten, ikke bakt inn i fjellvolumet. */
  overberg: 0.3,
  kontursprengning: false,
  overbergKontur: 0.15,      // overberg nar det sprenges med kontur

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
    punkter: [],             // [{lat, lon}] ytterkant
    hull: [],                // [[{lat, lon}]] utsparinger som ikke røres
    kanter: [],              // overstyringer per kant, indeks = kantnummer
    nivaa: {
      modus: 'fall',
      kote: null,            // null = ikke satt enda, foreslas fra terrenget
      fall: 0.02,
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
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
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
  Arbeidstyper, Nivaamoduser, Kanttyper, StandardTomtemal, nyTomt,
  signertAreal, areal, omkrets, tyngdepunkt, innenfor, kanter,
  hjorneErKonvekst, nivaaVed, sjekkTomt, selvkryssende
};

if (typeof module !== 'undefined') {
  module.exports = Tomt;
}
