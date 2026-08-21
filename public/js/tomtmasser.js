'use strict';
/**
 * Masseberegning for en tomt.
 *
 * Vegen regnes i tverrsnitt langs en senterlinje. En tomt har ingen
 * senterlinje, sa den regnes celle for celle pa det samme 1 m rutenettet som
 * terrenget kommer i fra Kartverket. For hver celle: hvor høyt ligger
 * terrenget, hvor høyt skal det ferdige nivaet ligge, og hva er forskjellen.
 *
 * DET SOM GJØR HJØRNENE ENKLE
 * Skråningene utenfor tomta bygges ikke kant for kant. I stedet regnes for
 * hvert punkt den korteste avstanden til tomtekanten, og skraningen legges som
 * en flate som stiger med den avstanden. Det er den samme flaten man far om
 * man drar en skraning rundt hele omrisset.
 *
 * Da løser hjørnene seg selv. I et konvekst hjørne er det nærmeste punktet
 * selve hjørnet, og skraningen legger seg som en vifte rundt det - akkurat slik
 * den bygges i marka. I et konkavt hjørne er det nærmeste punktet pa én av de
 * to kantene, og den andre er automatisk trimmet bort. Regnet man kant for
 * kant, matte hver av de to tilfellene løses for seg, og overlappet i det
 * konkave hjørnet ville blitt talt to ganger.
 *
 * Fordi det nærmeste punktet ogsa forteller hvilken kant man star ved, kan hver
 * kant ha sin egen behandling - sprengt vegg pa én side og planert skraning pa
 * en annen - uten at noe mer trengs.
 */

/**
 * Nærmeste punkt pa polygonets omriss.
 *
 * @returns {{d:number, kant:number, u:number, x:number, y:number}}
 *   d    avstand i meter
 *   kant hvilken kant det nærmeste punktet ligger pa
 *   u    hvor langt ut pa kanten, 0..1
 */
function naermestePaOmriss(p, x, y) {
  let best = { d: Infinity, kant: 0, u: 0, x: 0, y: 0 };
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let u = l2 > 1e-12 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));            // klem til selve kantstykket
    const px = a.x + u * dx, py = a.y + u * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, kant: i, u, x: px, y: py };
  }
  return best;
}

/**
 * Ferdig nivå i et punkt, og planum under det.
 *
 * `ferdig` er overflaten man kjører pa. `planum` er der jordarbeidet slutter -
 * altsa ferdig niva minus alle lagene som legges oppa. Skraningene starter i
 * planum, ikke i ferdig niva. Startet de i ferdig niva, ville
 * jordarbeidsflaten hoppet med hele overbygningstykkelsen i det øyeblikket
 * kanten gikk fra skjæring til fylling - samme felle som vegen hadde.
 */
function nivaaFunksjon(tomt, mal, referanse) {
  const n = tomt.nivaa || {};
  const overbygning = (mal.slitelagTykkelse || 0) + (mal.baerelagTykkelse || 0)
    + (mal.forsterkningslag || 0) + (mal.avrettingslag || 0) + (mal.frostsikring || 0);
  const ferdig = (x, y) => nivaaVed(n, x, y, referanse);
  return { ferdig, planum: (x, y) => ferdig(x, y) - overbygning, overbygning };
}

function nivaaVed(n, x, y, ref) {
  const k = n.kote;
  if (!(typeof k === 'number' && Number.isFinite(k))) return NaN;
  switch (n.modus) {
    case 'flat': return k;
    case 'fall': {
      if (!ref) return k;
      /* Fallretningen er grader fra nord, den veien vannet renner. Enhets-
         vektoren dit er (sin, cos) i (øst, nord) - ikke (cos, sin). Bytter man
         om, faller flaten nitti grader feil vei, og det synes ikke pa volumet
         i det hele tatt: en plan flate over et areal gir omtrent samme masse
         uansett hvilken vei den heller. Feilen dukker først opp nar noen lurer
         pa hvorfor vannet samler seg i feil hjørne. */
      const rad = (n.fallretning || 0) * Math.PI / 180;
      const langs = (x - ref.x) * Math.sin(rad) + (y - ref.y) * Math.cos(rad);
      return k - langs * (n.fall || 0);
    }
    case 'sluk': {
      if (!n.punkt || !Number.isFinite(n.punkt.x)) return k;
      return k + Math.hypot(x - n.punkt.x, y - n.punkt.y) * (n.fall || 0);
    }
    default: return k;
  }
}

/**
 * Jordarbeidsflaten i et punkt utenfor tomta.
 *
 * Skraningen starter i planum ved kanten og gar utover. Under fjelloverflaten
 * er den bratt, over den slak - og det er nettopp dét som gjør en "rett vegg"
 * riktig: veggen star nær loddrett i berget, mens løsmassen over legger seg
 * med sin egen helning. Regnet man hele veggen loddrett, ble løsmassevolumet
 * for lite og skjæringstoppen havnet feil sted i kartet.
 *
 * @returns {number} kote pa jordarbeidsflaten, eller NaN om kanten er apen
 */
function skraningsflate(d, zKant, zFjell, kant, mal) {
  const type = kant.type || 'skraning';
  if (type === 'apen') return NaN;              // ingenting regnes utenfor

  const brattFjell = Math.max(0, type === 'fjellvegg'
    ? (kant.veggHelning != null ? kant.veggHelning : mal.veggHelning)
    : (kant.skjaeringFjell != null ? kant.skjaeringFjell : mal.skjaeringFjell));
  const slakLos = Math.max(0.02, type === 'fjellvegg'
    ? (kant.losmasseOverFjell != null ? kant.losmasseOverFjell : mal.losmasseOverFjell)
    : (kant.skjaeringLosmasse != null ? kant.skjaeringLosmasse : mal.skjaeringLosmasse));

  /* Under fjelloverflaten stiger flaten med 1/brattFjell per meter utover,
     over den med 1/slakLos. En loddrett vegg er brattFjell = 0, og da stiger
     den uendelig fort - flaten star rett opp til den treffer fjelloverflaten. */
  if (zKant >= zFjell) {
    // hele veien i løsmasse
    return zKant + d / slakLos;
  }
  const dTilFjell = brattFjell < 1e-9 ? 0 : (zFjell - zKant) * brattFjell;
  if (d <= dTilFjell) return zKant + d / brattFjell;
  return zFjell + (d - dTilFjell) / slakLos;
}

/** Samme for fylling: flaten faller utover med fast helning. */
function fyllingsflate(d, zKant, kant, mal) {
  const type = kant.type || 'skraning';
  if (type === 'apen') return NaN;
  const m = Math.max(0.02, kant.fylling != null ? kant.fylling : mal.fylling);
  return zKant - d / m;
}

/**
 * Regner massene for en tomt.
 *
 * @param {object} o
 *   tomt        {punkter:[{x,y}] i UTM, kanter:[…], nivaa:{…}}
 *   mal         tomtemalen
 *   faktorer    omregningsfaktorene, felles med vegen
 *   terreng     {z(x,y)} - NaN der det ikke finnes data
 *   fjell       Fjellmodell
 *   rutestorrelse  meter
 *   bakkefaktor lengdefaktor; arealet ganges med kvadratet
 */
function beregnTomtemasser(o) {
  const p = o.tomt.punkter || [];
  const mal = o.mal || {};
  const merknader = [];
  const tom = {
    sum: { skjaering: 0, skjaeringFjell: 0, skjaeringLosmasse: 0, fylling: 0,
      rensk: 0, matjord: 0, slitelag: 0, baerelag: 0, forsterkningslag: 0,
      frostsikring: 0, avrettingslag: 0, overberg: 0 },
    areal: 0, arealMedSkraning: 0, celler: 0, merknader, rutenett: null
  };
  if (p.length < 3) {
    merknader.push({ type: 'tomt', tekst: 'Tomta trenger minst tre hjørner' });
    return tom;
  }

  const ruteM = Math.max(0.25, Math.min(5, o.rutestorrelse || 1));
  const bf = o.bakkefaktor || 1;
  /* Bakkefaktoren er en lengdefaktor. Et areal er to lengder ganget sammen, og
     et volum her er et areal ganget med en høyde - og høyden er en virkelig
     høydeforskjell, ikke et kartmal. Derfor kvadratet, ikke tredje potens. */
  const arealFaktor = bf * bf;

  const senter = tyngdepunktAv(p);
  const { ferdig, planum, overbygning } = nivaaFunksjon(o.tomt, mal, senter);
  if (!Number.isFinite(ferdig(senter.x, senter.y))) {
    merknader.push({ type: 'tomt', tekst: 'Ferdig nivå er ikke satt – velg en kote først' });
    return tom;
  }

  const kantFor = i => (o.tomt.kanter && o.tomt.kanter[i]) || {};
  const maksUt = Math.max(1, mal.maksSokebredde || 45);

  // omslutt tomta og skråningssonen
  let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
  for (const q of p) {
    minX = Math.min(minX, q.x); maksX = Math.max(maksX, q.x);
    minY = Math.min(minY, q.y); maksY = Math.max(maksY, q.y);
  }
  minX -= maksUt; maksX += maksUt; minY -= maksUt; maksY += maksUt;

  const cellA = ruteM * ruteM * arealFaktor;
  const matjord = Math.max(0, mal.matjordDybde || 0);
  const renskDybde = Math.max(0, mal.renskDybde || 0);
  const s = tom.sum;
  let utenData = 0, dypesteSkjaering = 0, hoyesteFylling = 0, hoyesteVegg = 0;
  let forNaerBerg = 0;
  const rutenett = [];

  for (let y = minY + ruteM / 2; y <= maksY; y += ruteM) {
    for (let x = minX + ruteM / 2; x <= maksX; x += ruteM) {
      const inne = innenforPolygon(p, x, y);
      const naer = naermestePaOmriss(p, x, y);
      if (!inne && naer.d > maksUt) continue;              // langt utenfor alt

      const zT = o.terreng.z(x, y);
      if (!(typeof zT === 'number' && Number.isFinite(zT))) {
        if (inne || naer.d < ruteM) utenData++;
        continue;
      }
      const dybdeTilFjell = o.fjell ? o.fjell.dybde(x, y) : 0.5;
      const zFjell = zT - (Number.isFinite(dybdeTilFjell) ? dybdeTilFjell : 0.5);

      let zPlanum, iTomta = false, kant = null;
      if (inne) {
        zPlanum = planum(x, y);
        iTomta = true;
      } else {
        kant = kantFor(naer.kant);
        const zKant = planum(naer.x, naer.y);
        if (!Number.isFinite(zKant)) continue;
        /* Skjæring eller fylling avgjøres av terrenget ved SELVE KANTEN, ikke
           i cella. Ellers kunne én og samme kant hatt skraning oppover pa ett
           sted og fylling nedover rett ved siden av, med et sprang imellom. */
        const zTKant = o.terreng.z(naer.x, naer.y);
        const skjaerer = Number.isFinite(zTKant) ? zTKant > zKant : zT > zKant;
        zPlanum = skjaerer
          ? skraningsflate(naer.d, zKant, zFjell, kant, mal)
          : fyllingsflate(naer.d, zKant, kant, mal);
        if (!Number.isFinite(zPlanum)) continue;           // apen kant
        // utenfor tomta teller cella bare til skraningen har møtt terrenget
        if (skjaerer && zPlanum >= zT) continue;
        if (!skjaerer && zPlanum <= zT) continue;
        if (kant.type === 'fjellvegg' && skjaerer) {
          hoyesteVegg = Math.max(hoyesteVegg, Math.min(zT, zFjell) - zKant);
        }
      }
      if (!Number.isFinite(zPlanum)) continue;

      tom.celler++;
      if (iTomta) tom.areal += cellA;
      tom.arealMedSkraning += cellA;

      /* Matjorda tas av først, sa rensk mot berget, og det som er igjen er
         skjæring eller fylling. Rekkefølgen er ikke likegyldig: matjord som
         ligger over berg finnes ikke, og rensk som gar dypere enn til berget
         finnes heller ikke. */
      const tilBerg = Math.max(0, zT - zFjell);
      const matjordHer = Math.min(matjord, tilBerg);
      s.matjord += matjordHer * cellA;

      const d = zT - zPlanum;                    // positiv = skjæring
      if (d > 0) {
        // rensk: løsmasse som skrapes av berget der berget graves ut
        const renskHer = Math.min(renskDybde, Math.max(0, tilBerg - Math.max(0, tilBerg - d)));
        s.rensk += renskHer * cellA;

        const iFjell = Math.max(0, d - tilBerg);          // under fjelloverflaten
        const iLos = d - iFjell;
        s.skjaering += d * cellA;
        s.skjaeringFjell += iFjell * cellA;
        s.skjaeringLosmasse += iLos * cellA;
        dypesteSkjaering = Math.max(dypesteSkjaering, d);
        if (iFjell > 0 && mal.overberg > 0) s.overberg += mal.overberg * cellA / ruteM;
        /* R761 prosess 22 c): er det mindre enn 0,75 m fra ferdig niva ned til
           fast berg, ma det dypsprenges - berget ligger for nær til at et
           vanlig salveuttak gar. */
        if (iFjell <= 0 && tilBerg - d < (mal.minAvstandTilBerg || 0)) forNaerBerg++;
      } else if (d < 0) {
        s.fylling += -d * cellA;
        hoyesteFylling = Math.max(hoyesteFylling, -d);
      }

      if (iTomta) {
        s.slitelag += (mal.slitelagTykkelse || 0) * cellA;
        s.baerelag += (mal.baerelagTykkelse || 0) * cellA;
        s.forsterkningslag += (mal.forsterkningslag || 0) * cellA;
        s.frostsikring += (mal.frostsikring || 0) * cellA;
        s.avrettingslag += (mal.avrettingslag || 0) * cellA;
      }
      /* Hver celle tas vare pa, ogsa de utenfor tomta. Det er dette bildet
         kartet farger: hvor dypt det skal graves og hvor høyt det skal fylles,
         over hele flaten. Uten skraningscellene stopper fargen brått i
         tomtekanten, og da ser det ut som om ingenting skjer utenfor - mens det
         er nettopp der utslaget mot naboen ligger. */
      rutenett.push({ x, y, d, inne: iTomta, fjell: Math.max(0, d - tilBerg) });
    }
  }

  tom.rutenett = rutenett;
  tom.overbygning = overbygning;
  tom.dypesteSkjaering = dypesteSkjaering;
  tom.hoyesteFylling = hoyesteFylling;
  tom.hoyesteVegg = hoyesteVegg;

  /* --- merknader --- */
  if (utenData) {
    merknader.push({ type: 'data',
      tekst: `${utenData} ruter mangler terrengdata – volumet er regnet uten dem` });
  }
  if (mal.maksSkjaeringsdybde > 0 && dypesteSkjaering > mal.maksSkjaeringsdybde) {
    merknader.push({ type: 'skjaering',
      tekst: `Dypeste skjæring er ${dypesteSkjaering.toFixed(1)} m, grensen er ${mal.maksSkjaeringsdybde} m` });
  }
  if (mal.maksFyllingshoyde > 0 && hoyesteFylling > mal.maksFyllingshoyde) {
    merknader.push({ type: 'fylling',
      tekst: `Høyeste fylling er ${hoyesteFylling.toFixed(1)} m, grensen er ${mal.maksFyllingshoyde} m` });
  }
  if (mal.maksVeggHoyde > 0 && hoyesteVegg > mal.maksVeggHoyde) {
    merknader.push({ type: 'vegg',
      tekst: `Bergveggen blir ${hoyesteVegg.toFixed(1)} m høy. Over ${mal.maksVeggHoyde} m `
        + 'krever N200 geoteknisk kategori 3, og det bør legges inn en hylle (berme).' });
  }
  if (forNaerBerg > 0) {
    merknader.push({ type: 'berg',
      tekst: `${forNaerBerg} ruter har mindre enn ${(mal.minAvstandTilBerg || 0.75)} m fra ferdig `
        + 'nivå ned til fast berg – der må det dypsprenges (R761 prosess 22)' });
  }
  /* TEK17 § 8-3: en nivaforskjell pa mer enn 0,5 m mot hardt underlag, eller
     3,0 m mot mykt terreng, skal sikres. Det er ikke et volum, men det er noe
     som ma prises - og det er lettere a se det na enn pa befaring. */
  if (Math.max(dypesteSkjaering, hoyesteFylling, hoyesteVegg) > 3.0) {
    merknader.push({ type: 'sikring',
      tekst: 'Nivåforskjellen er over 3 m – TEK17 § 8-3 krever sikring med rekkverk, '
        + 'gjerde eller tett vegetasjon' });
  }

  return tom;
}

/* --- sma hjelpere, holdt her sa fila kan kjøres for seg i selvtesten --- */

function innenforPolygon(p, x, y) {
  let inne = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const yi = p[i].y, yj = p[j].y;
    if ((yi > y) !== (yj > y)) {
      const xK = p[i].x + (y - yi) / (yj - yi) * (p[j].x - p[i].x);
      if (x < xK) inne = !inne;
    }
  }
  return inne;
}

function tyngdepunktAv(p) {
  /* Kryssproduktforma. Trapesforma gir riktig areal men motsatt fortegn av
     leddet under, og da blir tyngdepunktet negert - et rektangel med hjørne i
     origo fikk tyngdepunkt i (-20, -30). Et ferdig niva med fall regnes ut fra
     tyngdepunktet, sa hele flaten havnet pa feil side av tomta. */
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += p[j].x * p[i].y - p[i].x * p[j].y;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    return { x: p.reduce((s, q) => s + q.x, 0) / p.length,
      y: p.reduce((s, q) => s + q.y, 0) / p.length };
  }
  let cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j].x * p[i].y - p[i].x * p[j].y;
    cx += (p[j].x + p[i].x) * f;
    cy += (p[j].y + p[i].y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

const Tomtmasser = {
  beregnTomtemasser, naermestePaOmriss, skraningsflate, fyllingsflate,
  nivaaVed, innenforPolygon, tyngdepunktAv
};

if (typeof module !== 'undefined') module.exports = Tomtmasser;
