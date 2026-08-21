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

  /* EN MUR ER STØTTE, IKKE EN SKRANING.
     Den star nær loddrett og tar bare `murAnlegg` meter ut per meter høyde -
     omtrent en sjettedel av en jordskraning. Det er hele grunnen til at man
     bygger mur: tomta kan ligge der den skal, med støtte i kanten, uten at
     halve arealet gar med til a slake ut.

     Her ble mur regnet som en vanlig planert skraning. Pa en tomt med fjorten
     meters fall betydde det at skraningene spiste hele arealet, og
     yttergrense-modus svarte "det blir ingen flate igjen" - selv om den ene
     losningen som faktisk brukes i marka var valgt i lista. */
  if (type === 'mur') {
    const anlegg = Math.max(0, kant.murAnlegg != null ? kant.murAnlegg : mal.murAnlegg);
    return zKant + d / Math.max(0.01, anlegg);
  }

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
  /* Muren holder ogsa fyllinga oppe - det er den vanligste bruken: tomta ligger
     høyt, og muren tar det som ellers matte blitt en lang fyllingsskraning
     nedover lia. */
  if (type === 'mur') {
    const anlegg = Math.max(0, kant.murAnlegg != null ? kant.murAnlegg : mal.murAnlegg);
    return zKant - d / Math.max(0.01, anlegg);
  }
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
      frostsikring: 0, avrettingslag: 0, overberg: 0,
      murFundament: 0, murBakfylling: 0 },
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
  const fjellhoyde = [];
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

      /* MATJORDA TAS AV FØRST, OG DEN TELLER IKKE TO GANGER.
         Her ble skjæringen malt fra ratt terreng samtidig som matjord og rensk
         ble ført som egne poster. Da la de samme kubikkene bade i skjæringen og
         i deponiposten - malt: 993 m³ matjord og 793 m³ rensk oppa en skjæring
         som ikke endret seg med én kubikk nar de ble slatt pa. Vegen gjør det
         riktig; skjæringen der SYNKER nar renskedybden økes.

         Na skrapes matjorda av først, og skjæringen males fra den avskrapte
         flaten. Da er matjorda ute av skjæringen, og deponiet far den én gang. */
      const tilBerg = Math.max(0, zT - zFjell);
      const matjordHer = Math.min(matjord, tilBerg);
      s.matjord += matjordHer * cellA;
      const zAvdekket = zT - matjordHer;
      const losIgjen = tilBerg - matjordHer;        // løsmasse igjen over berget

      const d = zAvdekket - zPlanum;               // positiv = skjæring
      if (d > 0) {
        const iFjell = Math.max(0, d - losIgjen);         // under fjelloverflaten
        let iLos = d - iFjell;
        /* RENSK ER EN DEL AV LØSMASSEN, IKKE ET TILLEGG.
           Det er det siste laget som skrapes av selve bergflaten før den
           sprenges, og det skilles ut fordi det prises for seg - ikke fordi det
           er masse i tillegg. Her ble det lagt oppa, og formelen
           `min(renskDybde, min(tilBerg, d))` spurte bare om det ble gravd i det
           hele tatt: en tomt med berget femti meter under fikk full "rensk mot
           fjell" over hele flaten.

           Na kreves det at uttaket faktisk nar ned til berget. */
        const naarBerget = d >= losIgjen - 1e-9;
        const renskHer = naarBerget ? Math.min(renskDybde, losIgjen) : 0;
        s.rensk += renskHer * cellA;
        iLos = Math.max(0, iLos - renskHer);

        s.skjaering += d * cellA;
        s.skjaeringFjell += iFjell * cellA;
        s.skjaeringLosmasse += iLos * cellA;
        dypesteSkjaering = Math.max(dypesteSkjaering, d);
        if (iFjell > 0) fjellhoyde.push({ h: iFjell, inne: iTomta });
        /* R761 prosess 22 c): er det mindre enn 0,75 m fra ferdig niva ned til
           fast berg, ma det dypsprenges - berget ligger for nær til at et
           vanlig salveuttak gar. */
        if (iFjell <= 0 && losIgjen - d < (mal.minAvstandTilBerg || 0)) forNaerBerg++;
      } else if (d < 0) {
        /* Fyllingen males fra den AVSKRAPTE flaten, ikke fra det opprinnelige
           terrenget. Matjorda er tatt bort, sa hullet som skal fylles er
           akkurat sa mye dypere. */
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

  /* Overberg males pa BERGFLATEN som sprenges, ikke pa grunnflaten.
     Her sto `mal.overberg * cellA / ruteM`, som er m x m² / m = m² - en flate,
     ikke et volum - og som dessuten doblet seg hver gang rutenettet ble
     halvert: antall fjellceller vokser som 1/ruteM², mens hvert bidrag bare
     halveres. Samme tomt ga 120, 265 og 529 "m³" ved 1, 0,5 og 0,25 m rutenett.
     Pa standardinnstillingen traff det tilfeldigvis noe rimelig, sa feilen la
     og ventet pa at noen skrudde pa rutenettet.

     Riktig mal er arealet av den sprengte flaten: bunnen (grunnflaten der det
     er fjell) pluss veggene rundt. Veggarealet er omkretsen ganger midlere
     berghøyde langs den. R761 prosess 22.1 gir ikke tillegg for overberg, sa
     posten star pa null med mindre noen setter den - men settes den, skal den
     vaere et volum som ikke flytter seg nar man endrer rutenettet. */
  if (mal.overberg > 0 && fjellhoyde.length) {
    const bunnAreal = fjellhoyde.length * ruteM * ruteM * arealFaktor;
    let omkrets = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      omkrets += Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
    }
    const midlereBerg = fjellhoyde.reduce((a, f) => a + f.h, 0) / fjellhoyde.length;
    const veggAreal = omkrets * bf * midlereBerg;
    s.overberg = mal.overberg * (bunnAreal + veggAreal);
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
  /* Naar skraningen aldri møter terrenget, blir volumet bestemt av
     søkebredden i stedet for av bakken. Samme tomt ga 21 788 m³ fylling med
     45 m søkebredde og 93 164 m³ med 90 - fire ganger sa mye, styrt av en
     innstilling og ikke av virkeligheten.
     `traff: false` ble skrevet i skraningsfot, men lest ingen steder. Na
     kontrolleres det, og brukeren far vite at tallet ikke star pa egne ben. */
  if (o.terreng && p.length >= 3) {
    const fot = skraningsfot(o);
    const bom = fot.filter(f => !f.traff).length;
    if (bom > 0) {
      const andel = Math.round(100 * bom / fot.length);
      merknader.push({ type: 'utslag',
        tekst: `Skråningen når ikke terrenget på ${andel} % av omkretsen – den er `
          + `kuttet ved søkebredden (${Math.round(maksUt)} m). Volumet er da bestemt av `
          + 'den innstillingen, ikke av terrenget. Øk søkebredden, eller flytt nivået '
          + 'nærmere bakken.' });
    }
  }
  /* MURENS EGNE VOLUM.
     To poster folk glemmer nar de bytter skraning med mur: grøfta under muren
     og den drenerende bakfyllinga bak den. Begge ma kjøres, og ingen av dem
     kommer fram om man bare regner at skraningen ble brattere.
     Høyden males der muren star - det er høydeforskjellen mellom planum ved
     kanten og terrenget der. */
  const murKanter = [];
  for (let i = 0; i < p.length; i++) {
    const k = kantFor(i);
    if (!k || k.type !== 'mur') continue;
    const a = p[i], b = p[(i + 1) % p.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    let sumH = 0, n = 0, maksH = 0;
    const steg = Math.max(1, len / 20);
    for (let s = 0; s <= len; s += steg) {
      const f = s / len;
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      const zK = planum(x, y), zT2 = o.terreng.z(x, y);
      if (!Number.isFinite(zK) || !Number.isFinite(zT2)) continue;
      const h = Math.abs(zT2 - zK);
      sumH += h; n++; maksH = Math.max(maksH, h);
    }
    if (n) murKanter.push({ nr: i, lengde: len * bf, snittHoyde: sumH / n, maksHoyde: maksH });
  }
  if (murKanter.length) {
    let murLengde = 0, murMaks = 0, fundament = 0, bakfyll = 0;
    for (const m of murKanter) {
      murLengde += m.lengde;
      murMaks = Math.max(murMaks, m.maksHoyde);
      fundament += m.lengde * (mal.fundamentDybde || 0) * (mal.fundamentBredde || 0);
      bakfyll += m.lengde * (mal.bakfylling || 0) * m.snittHoyde;
    }
    s.murFundament = fundament;
    s.murBakfylling = bakfyll;
    tom.murLengde = murLengde;
    tom.murHoyde = murMaks;
    if (mal.maksMurHoyde > 0 && murMaks > mal.maksMurHoyde) {
      merknader.push({ type: 'mur',
        tekst: `Muren blir ${murMaks.toFixed(1)} m høy. Over ${mal.maksMurHoyde} m må den `
          + 'prosjekteres, og en tørrmur holder ikke – regn med betong eller L-element.' });
    }
    /* SAK10 § 4-1: en mur pa inntil 1 m kan sta 1 m fra nabogrensen, en pa
       inntil 1,5 m ma sta 4 m unna. Over det er den søknadspliktig. */
    if (murMaks > 1.5) {
      merknader.push({ type: 'mur',
        tekst: `Mur over 1,5 m er søknadspliktig (SAK10 § 4-1). Denne blir ${murMaks.toFixed(1)} m.` });
    }
  }
  /* Overgang har fortsatt ingen egen geometri og regnes som planert skraning.
     Det ma sies - ellers velger man den og tror tallene gjelder noe annet. */
  if ((o.tomt.kanter || []).some(k => k && k.type === 'overgang')) {
    merknader.push({ type: 'kant',
      tekst: 'Overgang mot et annet anlegg er regnet som planert skråning – '
        + 'egen geometri for den er ikke bygget ennå.' });
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

/**
 * Der skråningen møter terrenget - skjæringstopp og fyllingsfot.
 *
 * Det er denne linja som forteller hvor stort inngrepet faktisk blir. Tomta er
 * kanskje 50 x 70 m, men med fire meters skjæring i morene gar skraningen ti
 * meter ut hele veien rundt, og da er det 70 x 90 m som blir berørt. Star
 * naboen elleve meter unna, gar det - star han ni, gjør det ikke.
 *
 * Marsjen er den samme som volumet regnes med, sa linja og tallene kan ikke
 * komme i utakt.
 *
 * @returns {Array<{x,y,ut,type,kant}>} ett punkt per steg rundt omrisset
 */
function skraningsfot(o) {
  const p = o.tomt.punkter || [];
  const mal = o.mal || {};
  if (p.length < 3) return [];
  const senter = tyngdepunktAv(p);
  const { planum } = nivaaFunksjon(o.tomt, mal, senter);
  const maksUt = Math.max(1, mal.maksSokebredde || 45);
  const kantFor = i => (o.tomt.kanter && o.tomt.kanter[i]) || {};
  const kanter = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    kanter.push({ i, a, b, len, dx: dx / len, dy: dy / len });
  }
  // utoverrettet normal: samme regel som Tomt.kanter
  let areal2 = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) areal2 += p[j].x * p[i].y - p[i].x * p[j].y;
  const tegn = areal2 > 0 ? -1 : 1;

  const ut = [];
  const steg = Math.max(0.5, Math.min(3, (mal.rutestorrelse || 1) * 2));
  for (const k of kanter) {
    const kant = kantFor(k.i);
    const nx = tegn * -k.dy, ny = tegn * k.dx;
    const n = Math.max(2, Math.ceil(k.len / steg));
    for (let s = 0; s <= n; s++) {
      const f = s / n;
      const x = k.a.x + k.dx * k.len * f, y = k.a.y + k.dy * k.len * f;
      const zK = planum(x, y);
      if (!Number.isFinite(zK)) continue;
      const zT = o.terreng.z(x, y);
      if (!Number.isFinite(zT)) continue;
      /* En apen kant har ingen skraning. Her marsjerte den likevel, og siden
         skraningsflate() svarer NaN for 'apen', falt marsjen rett gjennom til
         `traff = maksUt` og meldte at skraningen gikk 45 m ut. Kartet tegnet
         streken dit, og verre: innerflate leste tallet og rykket den ferdige
         flaten 24,5 m inn - en 40 x 60 m tomt ble 362 m² i stedet for 1872.
         Ingen merknad, bare et gyldig og mye for lite areal. */
      if ((kant.type || 'skraning') === 'apen') {
        ut.push({ x, y, ut: 0, kant: k.i, type: 'apen', traff: true });
        continue;
      }
      const skjaerer = zT > zK;
      let traff = 0;
      const over = d => {
        const px = x + nx * d, py = y + ny * d;
        const zt = o.terreng.z(px, py);
        if (!Number.isFinite(zt)) return null;
        const dyp = o.fjell ? o.fjell.dybde(px, py) : 0.5;
        const zF = zt - (Number.isFinite(dyp) ? dyp : 0.5);
        const z = skjaerer ? skraningsflate(d, zK, zF, kant, mal) : fyllingsflate(d, zK, kant, mal);
        if (!Number.isFinite(z)) return null;
        return skjaerer ? z >= zt : z <= zt;
      };
      /* Grovsøk før halveringen.
         Halvering alene finner en vilkarlig kryssing, ikke den FØRSTE. Pa et
         terreng som bølger - en liten rygg, sa en senkning - kunne fyllingsfoten
         havne 6,7 m ut der fyllinga faktisk lander etter 4,0. Volumet regnes fra
         den første kryssingen, sa linja og tallene ble uenige.
         Derfor gas det først i grove steg til fortegnet snur, og halveringen
         gjøres innenfor det ene steget. */
      const grovSteg = Math.max(0.5, maksUt / 60);
      let funnet = false, lav = 0, hoy = maksUt;
      for (let d = grovSteg; d <= maksUt + 1e-9; d += grovSteg) {
        if (over(d) === true) { lav = d - grovSteg; hoy = d; funnet = true; break; }
      }
      if (!funnet) { traff = maksUt; }
      else {
        for (let b = 0; b < 14; b++) {
          const midt = (lav + hoy) / 2;
          if (over(midt) === true) hoy = midt; else lav = midt;
        }
        traff = hoy;
      }
      ut.push({ x: x + nx * traff, y: y + ny * traff, ut: traff, kant: k.i,
        type: skjaerer ? 'skjaering' : 'fylling',
        traff: funnet });
    }
  }
  return ut;
}

/**
 * Den omvendte veien: omrisset er ytterkanten av inngrepet, og den ferdige
 * flaten regnes innover.
 *
 * Slik tegner man nar man vet hvor tomtegrensen gar. Da er det ikke plassen som
 * er gitt, men at ingenting skal utenfor grensa - og den ferdige flaten blir
 * det som blir igjen nar skraningene har tatt sitt.
 *
 * Bredden pa skraningen henger av høydeforskjellen, som igjen henger av hvor
 * den ferdige flaten ligger - sa det ma løses ved a gjenta. Tre runder holder:
 * hver runde flytter kanten med det som var igjen av avviket forrige gang, og
 * avviket halveres fort fordi høyden ved kanten endrer seg lite nar kanten
 * flyttes en meter.
 */
function innerflate(o, runder = 14) {
  const p = (o.tomt.punkter || []).map(q => ({ x: q.x, y: q.y }));
  if (p.length < 3) return { punkter: p, innrykk: [] };
  let areal2 = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) areal2 += p[j].x * p[i].y - p[i].x * p[j].y;
  const tegn = areal2 > 0 ? -1 : 1;

  let na = p.map(q => ({ x: q.x, y: q.y }));
  let innrykk = new Array(p.length).fill(0);
  let forrigeKant = null;
  for (let r = 0; r < runder; r++) {
    const fot = skraningsfot(Object.assign({}, o, { tomt: Object.assign({}, o.tomt, { punkter: na }) }));
    if (!fot.length) break;
    /* Hvor langt hver kant stakk ut, malt som det største pa kanten.
       Apne kanter gir 0 - de krever ingen plass, og skal derfor ikke rykke
       noe inn. */
    const raaKant = new Array(p.length).fill(0);
    for (const f of fot) {
      if (f.type === 'apen') continue;
      raaKant[f.kant] = Math.max(raaKant[f.kant], f.ut);
    }
    /* Demping.
       Uten den svinger søket: pa skranende terreng ga rundene 1280, 1618, 1501,
       1527, 1530 - og de faste tre rundene landet 1,9 % feil, tilfeldig hvor i
       svingningen de traff. Grunnen er at nar kanten flyttes innover, endrer
       høyden ved kanten seg, og det slar tilbake pa hvor mye plass skraningen
       trenger. Halv vekt pa det nye kravet demper svingningen, og søket lander
       pa samme svar uansett hvor mange runder man kjører. */
    const perKant = forrigeKant
      ? raaKant.map((v, i) => (v + forrigeKant[i]) / 2)
      : raaKant;
    forrigeKant = perKant;
    /* Innrykket males ALLTID fra det tegnede omrisset, aldri fra forrige runde.
       Her sto det motsatt, og da krympet flaten pa nytt for hver runde: 2400 m²
       ble til 1056 og sa til 576, i stedet for a lande pa 1664. Rundene finnes
       bare fordi skraningsbredden henger av høyden ved kanten, og den endrer
       seg litt nar kanten flyttes - ikke fordi innrykket skal legges sammen. */
    const nye = [];
    for (let i = 0; i < p.length; i++) {
      const bak = perKant[(i - 1 + p.length) % p.length];   // kanten inn i hjørnet
      const foran = perKant[i];                              // kanten ut av hjørnet
      innrykk[i] = Math.max(bak, foran);
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const n1 = normal(a, b, tegn), n2 = normal(b, c, tegn);
      /* Hjørnet er skjæringspunktet mellom de to kantene forskjøvet HVER FOR
         SEG innover med sitt eget krav.

         Her ble de to kravene midlet først. Det gar bra sa lenge nabokantene
         krever det samme, men ikke ellers: en apen kant krever null og naboen
         fire meter, og gjennomsnittet to ga et hjørne som verken lot den ene
         kanten sta i ro eller ga den andre plassen sin. Med sprengt vegg pa én
         side og slak skraning pa den andre gikk skraningen rett utenfor
         tomtegrensa - som er nettopp det yttergrense-modus skal hindre.

         Lignings-settet er (P-b)·n1 = -bak og (P-b)·n2 = -foran. */
      const det = n1.x * n2.y - n1.y * n2.x;
      if (Math.abs(det) < 1e-9) {
        // kantene er parallelle - da er det bare én retning a flytte i
        const inn = Math.max(bak, foran);
        nye.push({ x: b.x - n1.x * inn, y: b.y - n1.y * inn });
        continue;
      }
      const vx = (-bak * n2.y + foran * n1.y) / det;
      const vy = (-n1.x * foran + n2.x * bak) / det;
      nye.push({ x: b.x + vx, y: b.y + vy });
    }
    /* Slutt nar kantene star stille. Uten dette matte alle rundene kjøres
       hver gang, ogsa pa en flat tomt der svaret er ferdig etter den første. */
    let flyttet = 0;
    for (let i = 0; i < nye.length; i++) {
      flyttet = Math.max(flyttet, Math.hypot(nye[i].x - na[i].x, nye[i].y - na[i].y));
    }
    na = nye;
    const stillestaaende = flyttet < 0.02 && r > 0;
    /* Gikk innrykket forbi midten, er det ikke plass til noen tomt.
       Fortegnet pa arealet duger ikke som prøve: et rektangel som rykkes inn
       forbi midten vender BEGGE akser, og da er arealet positivt igjen - et
       6 x 6 m omriss med 4 m skraning ble til en 2 x 2 m flate med riktig
       fortegn og 4 m² areal, som om alt var i orden.
       Kantretningen avslører det: snur en kant, har den passert seg selv. */
    let snudd = false;
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      const gx = p[j].x - p[i].x, gy = p[j].y - p[i].y;
      const nx2 = na[j].x - na[i].x, ny2 = na[j].y - na[i].y;
      if (gx * nx2 + gy * ny2 <= 0) { snudd = true; break; }
    }
    let a2 = 0;
    for (let i = 0, j = na.length - 1; i < na.length; j = i++) a2 += na[j].x * na[i].y - na[i].x * na[j].y;
    if (snudd || Math.sign(a2) !== Math.sign(areal2) || Math.abs(a2) < 4) {
      return { punkter: null, innrykk, forLiten: true };
    }
    if (stillestaaende) break;
  }
  return { punkter: na, innrykk };
}

function normal(a, b, tegn) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: tegn * -dy / l, y: tegn * dx / l };
}

const Tomtmasser = {
  beregnTomtemasser, naermestePaOmriss, skraningsflate, fyllingsflate,
  nivaaVed, innenforPolygon, tyngdepunktAv, skraningsfot, innerflate
};

if (typeof module !== 'undefined') module.exports = Tomtmasser;
