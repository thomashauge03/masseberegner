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
/**
 * Hvor langt en stråle kan gå før den treffer polygonets omriss.
 *
 * Brukes til a stoppe skraningen i tomtegrensa. Kan man ikke grave pa naboens
 * eiendom, hjelper det ikke at skraningen «egentlig» ville landet tjue meter
 * lenger ute - den stopper i grensa, og noe ma holde den der.
 *
 * @returns {number} avstand til omrisset, eller Infinity om strålen aldri
 *   treffer (punktet ligger allerede utenfor og peker bort)
 */
function tilOmriss(p, x, y, dx, dy) {
  let naermest = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const nevner = dx * ey - dy * ex;
    if (Math.abs(nevner) < 1e-12) continue;          // strålen er parallell
    const t = ((a.x - x) * ey - (a.y - y) * ex) / nevner;
    if (t < 1e-9) continue;                          // bak oss
    const u = ((a.x - x) * dy - (a.y - y) * dx) / nevner;
    if (u < -1e-9 || u > 1 + 1e-9) continue;         // utenfor kantstykket
    if (t < naermest) naermest = t;
  }
  return naermest;
}

/**
 * Hvor langt ut skraningen far ga før den star i tomtegrensa.
 *
 * Startpunktet ligger pa den innrykkede flaten, og det kan ligge en brøkdels
 * millimeter utenfor grensa etter innrykket. Da bommer en stråle rett utover pa
 * hele polygonet og svarer Infinity - og skraningen fikk lov a ga de fulle
 * seksti meterne, tvers over grensa man nettopp hadde satt. Derfor kastes
 * strålen fra et halvmeterssteg bakover, og svaret trekkes fra igjen.
 */
function tilGrensa(grense, x, y, nx, ny) {
  const bak = 0.5;
  const t = tilOmriss(grense, x - nx * bak, y - ny * bak, nx, ny);
  if (Number.isFinite(t)) return Math.max(0, t - bak);
  // strålen traff ingenting: punktet ligger utenfor og peker bort fra tomta
  return innenforPolygon(grense, x, y) ? Infinity : 0;
}

/* Hvor langt skraningen far lov a lete etter bakken før programmet gir opp.
   Ikke en ingeniørgrense - en ren stoppekloss sa en tomt lagt hundre meter over
   en fjord ikke setter maskinen fast. Lander den ikke innenfor dette, er svaret
   uansett mur eller et annet niva, ikke et større tall. */
const REKKEVIDDE_TAK = 150;

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
    /* En modus som ikke finnes gir en flat flate på koten. Det er den eneste
       forsvarlige reserven – men den skal ikke skje i stillhet, og
       beregnTomtemasser melder fra om den. Se NIVAAMODUSER under. */
    default: return k;
  }
}

/** Modusene nivaaVed faktisk kan. Alt annet er flatt, og skal meldes. */
const NIVAAMODUSER = ['flat', 'fall', 'sluk'];

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
function skraningsflate(d, zKant, zFjell, kant, mal, tvunget) {
  const type = kant.type || 'skraning';
  if (type === 'apen') return NaN;              // ingenting regnes utenfor

  /* Er helningen tvunget, gar flaten rett fra planum ved kanten til terrenget i
     grensa. Da treffer skraningen bakken i stedet for a bli kappet loddrett -
     og det er én rett flate, slik en mur eller en sprengt vegg faktisk er, ikke
     et knekk mellom berg og løsmasse. */
  if (tvunget > 1e-9) return zKant + d / tvunget;

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
function fyllingsflate(d, zKant, kant, mal, tvunget) {
  const type = kant.type || 'skraning';
  if (type === 'apen') return NaN;
  // se skraningsflate: tvunget helning gar rett ned til terrenget i grensa
  if (tvunget > 1e-9) return zKant - d / tvunget;
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
 * Helningene skråningsfoten måtte bratte seg opp til, ordnet per kant.
 *
 * Skråningsfoten regnes én gang. Volumet og snittet må bruke NØYAKTIG den
 * samme helningen, ellers tegner de én skråning og regner en annen – og det er
 * akkurat den uenigheten man ser når streken i kartet og tallet i panelet ikke
 * stemmer overens.
 *
 * Kravet varierer langs kanten: er det trangere i den ene enden, er skråningen
 * brattere der. Derfor lagres punktene med `u` (hvor langt ut på kanten), og
 * det interpoleres mellom dem.
 */
function helningsfelt(fot) {
  const felt = new Map();
  for (const f of fot) {
    if (!(f.tvunget > 0)) continue;
    if (!felt.has(f.kant)) felt.set(f.kant, []);
    felt.get(f.kant).push({ u: f.u, tvunget: f.tvunget });
  }
  for (const liste of felt.values()) liste.sort((a, b) => a.u - b.u);
  return felt;
}

/** Helningen som gjelder et stykke ut på en kant. 0 = den vanlige holder. */
function tvungetVed(felt, kant, u) {
  if (!felt || !felt.size) return 0;
  const liste = felt.get(kant);
  if (!liste || !liste.length) return 0;
  if (u <= liste[0].u) return liste[0].tvunget;
  if (u >= liste[liste.length - 1].u) return liste[liste.length - 1].tvunget;
  for (let i = 0; i < liste.length - 1; i++) {
    if (u >= liste[i].u && u <= liste[i + 1].u) {
      const bredde = liste[i + 1].u - liste[i].u;
      if (bredde < 1e-12) return liste[i].tvunget;
      const t = (u - liste[i].u) / bredde;
      return liste[i].tvunget + t * (liste[i + 1].tvunget - liste[i].tvunget);
    }
  }
  return 0;
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

  /* HVOR LANGT UT SKAL DET REGNES? SPØR SKRÅNINGEN, IKKE INNSTILLINGEN.
     Her sto søkebredden, og da ble volumet kuttet ved den: cellene lenger ute
     ble hoppet over selv om fyllingen fortsatte nedover i lia. Tallet var da
     bestemt av et tall i et skjema, ikke av terrenget.
     Nå måles foten først, og rutenettet strekkes til den når. */
  const foten = (o.terreng && p.length >= 3) ? skraningsfot(o) : [];
  const felt = helningsfelt(foten);
  const naadde = foten.reduce((m, f) => Math.max(m, f.ut || 0), 0);
  const maksUt = Math.max(1, mal.maksSokebredde || 45, Math.ceil(naadde) + ruteM);

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
      /* Er det satt en tomtegrense, regnes ingenting utenfor den. Ellers ville
         rapporten talt masser pa naboens eiendom - masser som ikke kan graves,
         og som kartet heller ikke tegner. */
      if (o.grense && !inne && !innenforPolygon(o.grense, x, y)) continue;

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
        /* Samme helning som foten ble regnet med. Uten dette tegnet kartet en
           brattet skråning som traff bakken, mens volumet regnet den slake som
           aldri kom fram - to svar på samme spørsmål. */
        const tvunget = tvungetVed(felt, naer.kant, naer.u);
        zPlanum = skjaerer
          ? skraningsflate(naer.d, zKant, zFjell, kant, mal, tvunget)
          : fyllingsflate(naer.d, zKant, kant, mal, tvunget);
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
      /* KOTENE FØLGER MED UT, DE REGNES IKKE OM SENERE.
         Eksporten trenger høyder, ikke bare dybder. Regnet den dem om selv,
         ville den kunne komme i utakt med volumet - to steder som svarer litt
         forskjellig pa hva planum er, og bare det ene av dem er det som er
         regnet pa. Her koster de ingenting: tallene ligger allerede i handa.

         `d` males fra den AVDEKKEDE flaten, altsa etter at matjorda er tatt av
         - ikke fra naturlig terreng. Det ma alt som leser feltet vite.
         `zFerdig` finnes bare inne pa tomta; utenfor er det skraningen som
         gjelder, og der legges ingen overbygning oppa. */
      rutenett.push({ x, y, d, inne: iTomta,
        fjell: Math.max(0, d - tilBerg),          // rå avstand ned til berget
        fjellDel: d > 0 ? Math.max(0, d - losIgjen) : 0,   // det som faktisk sprenges
        /* zFjell hører med, ikke bare dybden ned til det.
           `fjell` og `fjellDel` er begge klemt til null der berget ligger under
           planum – og det er nettopp der man vil se hvor det ligger. Uten koten
           kan fjelloverflaten ikke tegnes i 3D, bare der den tilfeldigvis stikker
           opp i graveflaten. */
        zT, zAvdekket, zPlanum, zFjell,
        zFerdig: iTomta ? zPlanum + overbygning : null,
        matjord: matjordHer,
        kant: iTomta ? -1 : naer.kant });
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
  /* Foten følger med ut, sa kartet og snittet tegner den samme skraningen som
     volumet er regnet pa. Regnet de den hver for seg, kunne de vaere uenige -
     og det var nettopp uenigheten man sa da snittet stoppet ved søkebredden
     mens volumet gikk lenger. */
  tom.skraningsfot = foten;
  tom.rekkevidde = naadde;

  /* --- merknader --- */
  if (utenData) {
    merknader.push({ type: 'data',
      tekst: `${utenData} ruter mangler terrengdata – volumet er regnet uten dem` });
  }
  /* EN MODUS SOM IKKE FINNES SKAL IKKE FALLE STILLE TIL FLATT.
     Nivåmodus-lista lovet ni former; motoren kunne tre. De seks andre traff
     «default: return k» og ga en helt flat flate uten et eneste ord om det –
     tallene så riktige ut, men beskrev en annen tomt enn den man hadde valgt.
     Det samme gjaldt en modusstreng som ikke fantes i det hele tatt, slik en
     håndredigert eller eldre prosjektfil kan komme med. */
  /* FALLGRENSENE HØRER HJEMME HER, SAMMEN MED DE ANDRE.
     `minstefall` ble sjekket i høydepanelet og `maksfall` ingen steder. De tre
     andre grensene – skjæringsdybde, fyllingshøyde, vegghøyde – meldes herfra
     og følger med til rapporten og PDF-en. En fallgrense som bare vises i et
     panel man kanskje ikke står i, veier ikke like tungt som resten. */
  {
    const n = o.tomt.nivaa || {};
    const f = n.modus === 'flat' ? 0 : (n.fall || 0);
    if (mal.maksfall > 0 && f > mal.maksfall + 1e-9) {
      merknader.push({ type: 'fall',
        tekst: `Fallet er ${(f * 100).toFixed(1)} %, grensen i malen er `
          + `${(mal.maksfall * 100).toFixed(1)} %. Over det blir plassen tung å bruke – `
          + 'lass og maskiner står ustøtt, og snø og vann får fart.' });
    }
    if (mal.minstefall > 0 && n.modus !== 'flat' && f > 1e-9 && f < mal.minstefall - 1e-9) {
      merknader.push({ type: 'fall',
        tekst: `Fallet er ${(f * 100).toFixed(1)} %, under minstefallet på `
          + `${(mal.minstefall * 100).toFixed(1)} %. Da blir det stående vann.` });
    }
  }
  {
    const m = (o.tomt.nivaa || {}).modus;
    if (m && !NIVAAMODUSER.includes(m)) {
      merknader.push({ type: 'nivaa',
        tekst: `Det ferdige nivået står i modus «${m}», som programmet ikke kan regne. `
          + `Flaten er lagt helt flat på koten. Modusene som virker er `
          + `${NIVAAMODUSER.join(', ')}.` });
    }
  }
  if (mal.maksSkjaeringsdybde > 0 && dypesteSkjaering > mal.maksSkjaeringsdybde) {
    merknader.push({ type: 'skjaering',
      tekst: `Dypeste skjæring er ${dypesteSkjaering.toFixed(1)} m, grensen er ${mal.maksSkjaeringsdybde} m`
        + (dypesteSkjaering > mal.maksSkjaeringsdybde * 3
          ? `. Det er ${(dypesteSkjaering / mal.maksSkjaeringsdybde).toFixed(0)} ganger grensen – `
            + 'kontroller at den ferdige koten står riktig.' : '') });
  }
  if (mal.maksFyllingshoyde > 0 && hoyesteFylling > mal.maksFyllingshoyde) {
    /* Er fyllingen mange ganger grensen, er det som regel koten som er skrevet
       feil – ikke prosjektet som er dristig. Da hjelper det å se tallet mot
       terrenget: «47 m over det høyeste terrenget» kjennes igjen med én gang,
       mens «50,0 m, grensen er 4 m» like gjerne kan leses som en stor jobb. */
    merknader.push({ type: 'fylling',
      tekst: `Høyeste fylling er ${hoyesteFylling.toFixed(1)} m, grensen er ${mal.maksFyllingshoyde} m`
        + (hoyesteFylling > mal.maksFyllingshoyde * 3
          ? `. Det er ${(hoyesteFylling / mal.maksFyllingshoyde).toFixed(0)} ganger grensen – `
            + 'kontroller at den ferdige koten står riktig.' : '') });
  }
  /* HVOR LANGT UT MOT NABOEN INNGREPET GÅR.
     `maksUtslag` sto i tomtemalen, ble vist i skjemaet og lagret i hver
     prosjektfil – og ingenting leste det. Vegen håndhever den samme grensen
     (masser.js), tomta gjorde det ikke. Målt: skråningen gikk 136 m ut med
     maksUtslag satt til 15, og den eneste meldingen handlet om SØKEBREDDEN –
     en beregningsinnstilling, ikke en grense mot naboen.
     Det er nettopp utslaget man prosjekterer for. */
  if (mal.maksUtslag > 0 && foten.length) {
    const over = foten.filter(f => f.type !== 'apen' && f.ut > mal.maksUtslag);
    if (over.length) {
      const sider = [...new Set(over.map(f => f.kant + 1))].sort((a, b) => a - b);
      const lengst = over.reduce((m, f) => Math.max(m, f.ut), 0);
      merknader.push({ type: 'utslag',
        tekst: `Inngrepet går ${lengst.toFixed(1)} m ut fra tomtekanten på side ${sider.join(', ')} `
          + `– grensen i malen er ${mal.maksUtslag} m. Sett tomtegrensa som yttergrense, `
          + 'bruk mur eller sprengt vegg på de sidene, eller legg nivået nærmere terrenget.' });
    }
  }
  if (mal.maksVeggHoyde > 0 && hoyesteVegg > mal.maksVeggHoyde) {
    merknader.push({ type: 'vegg',
      tekst: `Bergveggen blir ${hoyesteVegg.toFixed(1)} m høy. Over ${mal.maksVeggHoyde} m `
        + 'krever N200 geoteknisk kategori 3, og det bør legges inn en hylle (berme). '
        + 'Bermen er ikke med i volumet under – den må prosjekteres for hånd.' });
  }
  /* Naar skraningen aldri møter terrenget, blir volumet bestemt av
     søkebredden i stedet for av bakken. Samme tomt ga 21 788 m³ fylling med
     45 m søkebredde og 93 164 m³ med 90 - fire ganger sa mye, styrt av en
     innstilling og ikke av virkeligheten.
     `traff: false` ble skrevet i skraningsfot, men lest ingen steder. Na
     kontrolleres det, og brukeren far vite at tallet ikke star pa egne ben. */
  /* DET SOM IKKE GÅR, SKAL SI AT DET IKKE GÅR.
     Setter man ferdig kote til 300 der terrenget ligger på 210, er ikke svaret
     162 366 m³ fylling – svaret er at dette ikke er en tomt. Her ble tallet
     regnet ut og vist fram i et helt vanlig massesammendrag, med en merknad om
     fyllingshøyde nede i lista blant fire andre. Det er lett å lese forbi, og
     et tall som ser ut som et svar blir brukt som et svar. */
  /* TO MÅTER Å VÆRE UBYGGELIG PÅ, IKKE ÉN.
     Her sto bare `umulig` – skråningen måtte vært brattere enn en bergvegg for
     å nå bakken innenfor tomtegrensa. Den flaggen settes bare når tomta HAR en
     yttergrense. Er tomta tegnet som planum, finnes det ingen grense å tvinge
     mot, og da får punktene `iLufta` i stedet: skråningen er fulgt så langt den
     får lov og henger fortsatt i lufta.
     Målt: en tomt uten yttergrense med ferdig nivå 90 m over terrenget fikk
     hundre av hundre fotpunkt i lufta, null «umulige» – og hele advarselen
     uteble. Programmet viste 162 000 m³ fylling som et helt vanlig svar.
     Lander ikke skråningen noe sted, er det ikke en tomt uansett hvorfor. */
  const iLuftaAlt = foten.filter(f => f.iLufta);
  const umulige = foten.filter(f => f.umulig);
  const landet = foten.filter(f => f.traff === true).length;
  const svever = umulige.length
    || (foten.length >= 8 && landet === 0 && iLuftaAlt.length > foten.length * 0.9);
  if (svever) {
    const grunnlag = umulige.length ? umulige : iLuftaAlt;
    const sider = [...new Set(grunnlag.map(f => f.kant + 1))].sort((a, b) => a - b);
    const del = Math.round(100 * grunnlag.length / foten.length);
    let lav = Infinity, hoy = -Infinity;
    for (const c of rutenett) {
      if (!c.inne || !Number.isFinite(c.zT)) continue;
      lav = Math.min(lav, c.zT); hoy = Math.max(hoy, c.zT);
    }
    const kote = nivaaVed(o.tomt.nivaa || {}, senter.x, senter.y, senter);
    const forhold = Number.isFinite(lav) && Number.isFinite(kote)
      ? (kote > hoy
        ? `Ferdig nivå ${kote.toFixed(1)} m ligger ${(kote - hoy).toFixed(0)} m OVER det `
          + `høyeste terrenget på tomta (${hoy.toFixed(1)} m).`
        : kote < lav
          ? `Ferdig nivå ${kote.toFixed(1)} m ligger ${(lav - kote).toFixed(0)} m UNDER det `
            + `laveste terrenget på tomta (${lav.toFixed(1)} m).`
          : '')
      : '';
    tom.ubyggelig = {
      sider, del,
      tekst: umulige.length
        ? `Dette lar seg ikke bygge. ${forhold} Skråningen måtte vært brattere enn `
          + `en sprengt bergvegg på ${del} % av omkretsen (side ${sider.join(', ')}), og det `
          + 'finnes ingen konstruksjon som står slik. Kontroller den ferdige koten – '
          + 'ligger den riktig? Tallene under beskriver ikke noe som kan settes ut.'
        : `Dette lar seg ikke bygge. ${forhold} Skråningen finner ikke bakken på noen `
          + `side (${del} % av omkretsen henger i lufta) – den er fulgt så langt den får `
          + 'lov og har fortsatt ingen fot å stå på. Kontroller den ferdige koten – '
          + 'ligger den riktig? Tallene under beskriver ikke noe som kan settes ut.'
    };
    merknader.unshift({ type: 'ubyggelig', tekst: tom.ubyggelig.tekst });
  }

  if (foten.length) {
    /* Nå søker skråningen til den lander. Da er det bare to grunner igjen til
       at den ikke gjør det, og de betyr helt forskjellige ting. */
    const iLufta = foten.filter(f => f.iLufta);
    const motGrense = foten.filter(f => f.moterGrense);
    if (iLufta.length) {
      const sider = [...new Set(iLufta.map(f => f.kant + 1))].sort((a, b) => a - b);
      const lengst = iLufta.reduce((m, f) => Math.max(m, f.ut), 0);
      merknader.push({ type: 'utslag',
        tekst: `Skråningen finner ikke bakken på side ${sider.join(', ')} – den er fulgt `
          + `${Math.round(lengst)} m ut og henger fortsatt i lufta. Terrenget faller `
          + 'raskere enn skråningen selv, så en fylling her har ingen fot å stå på. '
          + 'Volumet under er derfor et minstetall. Løsningen er mur eller sprengt '
          + 'vegg på de sidene, eller et ferdig nivå nærmere terrenget.' });
    }
    /* HVOR BRATT BLE DEN? DET ER SPØRSMÅLET.
       At skraningen «møter grensa» sier ingenting om hva man skal gjøre. At den
       matte legges 1:0,6 for a na bakken, sier alt: det er for bratt for jord,
       sa der ma det mur eller sprengt vegg. Er den 1:1,8, holder det med en
       litt brattere skraning og god sikring. */
    if (motGrense.length) {
      const perSide = new Map();
      for (const f of motGrense) {
        const na = perSide.get(f.kant);
        // den bratteste på siden er den som bestemmer hva som må bygges
        if (!na || (f.tvunget > 0 && f.tvunget < na.tvunget)) {
          perSide.set(f.kant, { tvunget: f.tvunget || 0.01, type: f.type });
        }
      }
      /* Målestokken er hva N200 gir for NETTOPP DEN kanten, ikke et tall valgt
         på slump. 1:1,4 er romslig på en fylling i stein og for bratt på en
         skjæring i silt – det er forholdet til standarden som betyr noe. */
      const standardFor = v => {
        const k = kantFor(v.kant) || {};
        return v.type === 'skjaering'
          ? Math.max(0.02, k.skjaeringLosmasse != null ? k.skjaeringLosmasse : mal.skjaeringLosmasse)
          : Math.max(0.02, k.fylling != null ? k.fylling : mal.fylling);
      };
      const sider = [...perSide.entries()]
        .map(([kant, v]) => ({ kant, ...v, standard: standardFor({ ...v, kant }) }))
        .sort((a, b) => a.tvunget - b.tvunget);
      const verst = sider[0];
      const liste = sider.map(v =>
        `side ${v.kant + 1}: 1:${v.tvunget.toFixed(1)} mot 1:${v.standard.toFixed(1)}`).join(', ');
      const rad = verst.tvunget < (mal.veggHelning || 0.1)
        ? 'Det er brattere enn selv en sprengt bergvegg står. Her må nivået flyttes '
          + 'eller grensa utvides – ingen konstruksjon holder det.'
        : verst.tvunget < 0.5
          ? 'Det er så bratt at det er en vegg, ikke en skråning: sprengt bergvegg '
            + 'i fjell, eller støpt mur i løsmasse.'
          : verst.tvunget < verst.standard * 0.9
            ? 'Det er brattere enn N200 gir for denne massen. Sett mur eller sprengt '
              + 'vegg, eller flytt nivået nærmere terrenget.'
            : 'Det er innenfor det denne massen tåler.';
      merknader.push({ type: 'grense',
        tekst: `Skråningen måtte brattes opp for å nå bakken innenfor grensa – ${liste}. `
          + rad + ' Volumet under er regnet med disse helningene, så skråningen '
          + 'treffer terrenget hele veien rundt.' });
    }
    /* Datakanten er ikke bakken. Stoppet skraningen fordi terrenget ikke var
       lastet ned sa langt, er tallet et kutt - like vilkarlig som søkebredden
       var det. Da ma det sies, ikke skjules bak et ryddig volum. */
    const utenMark = foten.filter(f => f.manglerData);
    if (utenMark.length) {
      const sider = [...new Set(utenMark.map(f => f.kant + 1))].sort((a, b) => a - b);
      merknader.push({ type: 'data',
        tekst: `Terrengdataene tar slutt før skråningen lander på side ${sider.join(', ')}. `
          + 'Volumet der er kuttet ved datakanten, ikke ved bakken. Flytt kartet slik at '
          + 'området nedenfor tomta blir lastet ned, og regn på nytt.' });
    }
    const langt = Math.round(naadde);
    if (langt > (mal.maksSokebredde || 45)) {
      merknader.push({ type: 'utslag',
        tekst: `Skråningen går ${langt} m ut på det meste – lenger enn søkebredden på `
          + `${mal.maksSokebredde || 45} m. Den er fulgt hele veien til den lander, så `
          + 'volumet er riktig, men se om tomta bør legges nærmere terrenget.' });
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
  // o.grense: skraningen stopper der, om den er satt
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
    /* En kant pa en brøkdels millimeter har ingen retning verdt navnet:
       normalen den gir peker en tilfeldig vei, og skraningen ble marsjert dit.
       Det var slik en enkelt strek endte seksti meter pa tvers av tomta. */
    if (len < 1e-4) continue;
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
      /* Grensa er en hard vegg. Er omrisset en tomtegrense, kan skraningen ikke
         ga forbi den - man kan ikke grave pa naboens eiendom. Da stopper den
         der, og noe ma holde den: mur, sprengt vegg eller en brattere skraning.
         Her fortsatte den utover og ble bare flagget, og da la det en strek
         flere titalls meter utenfor grensa man nettopp hadde satt. */
      const grenseUt = o.grense ? tilGrensa(o.grense, x, y, nx, ny) : Infinity;
      /* To helt forskjellige tak. Grensa er en ekte vegg som skraningen ikke far
         ga forbi. Rekkeviddetaket er bare en stoppekloss for programmet. Sto de
         to sammen i ett tall, kunne søket aldri strekke seg forbi søkebredden -
         som var nettopp feilen: skraningen ble kuttet ved 45 m og snittet tegnet
         en loddrett vegg der den sluttet. */
      const maksHer = Math.min(grenseUt, REKKEVIDDE_TAK);
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
      /* Terrenget nøyaktig i grensa. Trengs for a regne hvor bratt skraningen
         ma vaere for a lande der, i stedet for a bli kappet loddrett. */
      const zVedGrensa = Number.isFinite(grenseUt) && grenseUt < REKKEVIDDE_TAK
        ? o.terreng.z(x + nx * grenseUt, y + ny * grenseUt) : NaN;
      /* Grovsøk før halveringen.
         Halvering alene finner en vilkarlig kryssing, ikke den FØRSTE. Pa et
         terreng som bølger - en liten rygg, sa en senkning - kunne fyllingsfoten
         havne 6,7 m ut der fyllinga faktisk lander etter 4,0. Volumet regnes fra
         den første kryssingen, sa linja og tallene ble uenige.
         Derfor gas det først i grove steg til fortegnet snur, og halveringen
         gjøres innenfor det ene steget. */
      /* SØKEBREDDEN ER EN YTELSESGRENSE, IKKE EN INGENIØRAVGJØRELSE.
         Nadde skraningen ikke terrenget innenfor de 45 metrene, ble den bare
         kuttet der. I snittet sa det ut som om den ferdige flaten stupte rett
         ned - en loddrett vegg som ingen kan bygge - og volumet ble et tall
         søkebredden hadde bestemt: samme tomt ga 21 788 m³ fylling med 45 m og
         93 164 m³ med 90.

         En fylling i en li slutter ikke fordi en innstilling sier stopp. Den
         gar nedover til den møter bakken, og det kan godt vaere hundre meter.
         Derfor dobles søket til skraningen faktisk lander - eller til
         terrengdataene tar slutt, eller taket nas. Da er tallet bestemt av
         bakken, slik det skal vaere.

         Grensa er noe annet: den er en ekte vegg, og der SKAL den stoppe. */
      const start = Math.min(maksHer, maksUt);
      let tak = start, funnet = false, lav = 0, hoy = start, slappOppData = false;
      for (let runde = 0; runde < 8; runde++) {
        const grovSteg = Math.max(0.25, tak / 60);
        for (let d = lav > 0 ? lav : grovSteg; d <= tak + 1e-9; d += grovSteg) {
          if (over(d) === true) { lav = Math.max(0, d - grovSteg); hoy = d; funnet = true; break; }
        }
        if (funnet || tak >= maksHer - 1e-9 || tak >= REKKEVIDDE_TAK) break;
        /* Ikke landet ennå. Er det terrengdata der ute, er det verdt a ga
           videre; er det ikke det, hjelper det ikke a lete lenger - men da er
           det datakanten som stoppet skraningen, ikke bakken, og det ma sies
           fra om. Ellers ser det ut som om skraningen lander akkurat der
           nedlastingen tilfeldigvis sluttet. */
        if (over(tak) === null) { slappOppData = true; break; }
        lav = tak;
        tak = Math.min(maksHer, REKKEVIDDE_TAK, tak * 2);
      }
      /* SKRÅNINGEN SKAL TREFFE BAKKEN. ALLTID.
         Nadde den ikke terrenget innenfor tomtegrensa, ble den kappet der - og
         i snittet sto det igjen en loddrett flate. Det er ikke noe man kan
         bygge, og det er heller ikke et svar: det er programmet som gir opp.

         Det som faktisk skjer i marka er at skraningen blir BRATTERE. Er det
         fire meter ned og bare tre meter plass, legger man den 1:0,75 i stedet
         for 1:2,5 - og da er den for bratt for jord, sa der ma det mur eller
         sprengt vegg. Men den treffer bakken, den star i grensa, og volumet er
         volumet av noe som kan bygges.

         Her regnes den helningen ut, og skraningen legges rett fra planum ved
         kanten til terrenget i grensa. Hvor bratt det ble, meldes etterpa - det
         er DET tallet som forteller om det holder med en skraning eller ma
         støpes en mur. */
      let tvunget = 0, tvingesTilGrensa = false, umulig = false;
      if (!funnet && Number.isFinite(zVedGrensa) && grenseUt <= tak + 1e-9) {
        const fall = Math.abs(zVedGrensa - zK);
        /* Null bredde ved grensa er ikke «henger i lufta» - det er en LODDRETT
           VEGG. Den ferdige flaten går helt ut i tomtegrensa der, og skal det
           være høydeforskjell, må noe stå og holde den. Meldes det som «lander
           ikke», leter man etter feil sted: svaret er ikke mer søkebredde, det
           er mur, sprengt vegg, eller et nivå nærmere terrenget. */
        /* Null bredde og nitti meter fall er ikke «trenger ingen oppbratting» -
           det er uendelig bratt. Her sto det `fall < 0.02 ? 0 : …`, sa begge
           tilfellene ga null, og da slapp en ferdig kote pa 300 over et terreng
           pa 210 gjennom som et helt vanlig svar.
           Møttes de i grensa, ville marsjen ha landet og vi hadde ikke statt
           her - vakten star bare sa en deling pa null ikke kan sende NaN inn i
           flategeometrien. */
        const bratteste = Math.max(0.02, mal.veggHelning || 0.1);
        const krav = fall > 1e-6 ? grenseUt / fall : bratteste;
        /* MEN OPPBRATTINGEN MÅ HA EN GRENSE.
           Uten den «landet» alt: en ferdig kote på 300 der terrenget ligger
           210 ga 93 av 93 fotpunkt som traff bakken - hvert eneste av dem på en
           98 m høy loddrett vegg. Og siden en loddrett vegg ikke trenger plass,
           slapp innrykket unna, sa den ferdige flaten ble STØRRE enn på en kote
           som faktisk gikk: 1750 m² mot 852. Programmet svarte 162 366 m³ pa et
           spørsmal som ikke har noe svar.

           Det bratteste noe kan sta i, er en sprengt bergvegg. Kreves det mer
           enn det, finnes det ingen konstruksjon - da har man ikke en bratt
           skraning, man har en umulig tomt. */
        if (krav < bratteste) {
          umulig = true;                       // ingen vegg star sa bratt
        } else {
          tvunget = krav;
          tvingesTilGrensa = true;
        }
      }
      if (tvingesTilGrensa) { traff = grenseUt; }
      else if (!funnet) { traff = Math.min(maksHer, tak); }
      else {
        for (let b = 0; b < 18; b++) {
          const midt = (lav + hoy) / 2;
          if (over(midt) === true) hoy = midt; else lav = midt;
        }
        traff = hoy;
      }
      const fx = x + nx * traff, fy = y + ny * traff;
      ut.push({ x: fx, y: fy, ut: traff, kant: k.i,
        /* Kotene hører med. En utslagslinje uten høyde kan ikke settes ut, og
           uten dem matte eksporten regnet dem om selv - med fare for a svare
           noe annet enn det volumet er regnet pa. */
        z: o.terreng.z(fx, fy),      // terrengkoten der foten lander
        zKant: zK,                   // planum ved selve kanten, der skraningen starter
        xKant: x, yKant: y,          // utgangspunktet pa omrisset
        type: skjaerer ? 'skjaering' : 'fylling',
        u: f,                        // hvor langt ut pa kanten, sa volumet finner igjen helningen
        // den lander enten av seg selv, eller fordi den er brattet opp til grensa
        traff: funnet || tvingesTilGrensa,
        /* Hvor bratt den matte legges for a na bakken innenfor grensa.
           0 betyr at den standard helningen holdt. */
        tvunget,
        // stoppet i grensa: her holder ikke den vanlige skraningen
        moterGrense: tvingesTilGrensa,
        /* Det kreves brattere enn en sprengt bergvegg. Ingen konstruksjon star
           slik - dette punktet kan ikke bygges i det hele tatt. */
        umulig,
        // hverken landet eller stoppet i en grense: den star fortsatt i lufta
        iLufta: !funnet && !tvingesTilGrensa && !umulig,
        // ... og her var det terrengdataene som tok slutt, ikke bakken som kom
        manglerData: slappOppData });
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
  const loperUt = new Set();
  /* SØKET MA SE DET VERKELIGE BEHOVET, IKKE DET AVKLIPPEDE.
     Klippes skraningen i tomtegrensa allerede her, melder hver kant at den
     lander pent i streken, innrykket blir null, og hele flaten star igjen med
     skraninger klemt til null bredde. Innrykket er jo nettopp det som gjør at
     skraningen far plass innenfor grensa. Derfor males kravet uten grensa, og
     klippet legges pa etterpa - pa det som fortsatt stikker utenfor. */
  const so = Object.assign({}, o, { grense: null });
  for (let r = 0; r < runder; r++) {
    const fot = skraningsfot(Object.assign({}, so, { tomt: Object.assign({}, o.tomt, { punkter: na }) }));
    if (!fot.length) break;
    /* Hvor langt hver kant stakk ut, malt som det største pa kanten.
       Apne kanter gir 0 - de krever ingen plass, og skal derfor ikke rykke
       noe inn. */
    /* En kant der skraningen ALDRI møter terrenget skal ikke rykke noe inn.
       Tallet den melder er søkebredden, ikke et utslag - skraningen jager
       bakken nedover uten a lande, og a kreve fem og førti meter innrykk for
       det gjør hele modusen ubrukelig. Malt pa en ekte tomt: kantene krevde
       40,7 · 14,4 · 1,9 · 2,2 · 2,3 · 2,6 · 2,5 · 16,9 m, og de 40,7 var
       søkebredden pa den ene sida som falt ned i en dal.

       Grensa er der skraningen skal STARTE. Lander den ikke innenfor, er det
       noe brukeren ma vite - ikke noe som skal krympe tomta til ingenting.
       Kanten samles opp og meldes i stedet. */
    const raaKant = new Array(p.length).fill(0);
    const landet = new Array(p.length).fill(true);
    for (const f of fot) {
      if (f.type === 'apen') continue;
      if (!f.traff) { landet[f.kant] = false; continue; }
      raaKant[f.kant] = Math.max(raaKant[f.kant], f.ut);
    }
    for (let i = 0; i < landet.length; i++) if (!landet[i]) loperUt.add(i);
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
      /* IKKE GI OPP - VIS DET SOM GAR, OG SI HVA SOM IKKE GJØR DET.
         Her ble det svart «ingen flate igjen», og det var teknisk riktig: pa en
         tomt som faller mot en dal jager fyllingsskraningen bakken nedover og
         kan ta førti meter, og da er det ikke plass. Men et blankt nei er
         ubrukelig - man far verken vite hvor mye som mangler eller pa hvilken
         side.

         Na skrus innrykket ned til det som faktisk far plass, og hver side der
         skraningen ma ga forbi grensa blir meldt med hvor mange meter. Da ser
         man at det er side 1 som er problemet, og at svaret er mur eller
         sprengt vegg der - ikke at hele tomta er umulig. */
      const trygg = tilpassInnrykk(p, perKant, tegn);
      if (!trygg) return { punkter: null, innrykk, forLiten: true, loperUt: [...loperUt] };
      return { punkter: trygg.punkter, innrykk: perKant.map(v => Math.min(v, trygg.tak)),
        loperUt: [...loperUt], mangler: maalOverskridelse(p, trygg.punkter, so), avkortet: true };
    }
    if (stillestaaende) break;
  }
  /* Males pa den flaten som faktisk blir svaret, ikke pa kravet som ble regnet
     underveis. Kravet er malt pa forrige rundes polygon, og etter at kanten er
     flyttet, ligger den i annet terreng - sa skraningen blir litt annerledes
     enn den var da kravet ble satt. Uten denne malingen meldte programmet
     mangel pa noen sider mens streken i kartet krysset grensa pa andre. */
  return { punkter: na, innrykk, loperUt: [...loperUt],
    mangler: maalOverskridelse(p, na, so) };
}

/**
 * Skrur innrykket ned til det største som fortsatt gir en gyldig flate.
 *
 * Hver kant far sa mye den trenger, opp til et FELLES TAK. Taket finnes med
 * halvering: det høyeste som fortsatt gir en gyldig flate.
 *
 * Her sto det en felles FAKTOR i stedet - alle kantene ble skrudd ned like mye
 * i prosent. Da overskred ogsa sider som hadde rikelig plass: en kant som
 * trengte 2 m fikk 0,7 og gikk 1,3 m utenfor grensa helt unødvendig, fordi en
 * helt annen side krevde førti. Det var det man sa i kartet - skraningslinja
 * krysset grensa uten grunn.
 *
 * Med et tak far kanten som trenger 2 m sine 2 m, og bare de som ber om mer enn
 * taket blir klippet - med nøyaktig det de mangler.
 */
function tilpassInnrykk(p, perKant, tegn) {
  const bygg = tak => {
    const nye = [];
    for (let i = 0; i < p.length; i++) {
      const bak = Math.min(perKant[(i - 1 + p.length) % p.length], tak);
      const foran = Math.min(perKant[i], tak);
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const n1 = normal(a, b, tegn), n2 = normal(b, c, tegn);
      const det = n1.x * n2.y - n1.y * n2.x;
      if (Math.abs(det) < 1e-9) {
        const inn = Math.max(bak, foran);
        nye.push({ x: b.x - n1.x * inn, y: b.y - n1.y * inn });
        continue;
      }
      nye.push({ x: b.x + (-bak * n2.y + foran * n1.y) / det,
        y: b.y + (-n1.x * foran + n2.x * bak) / det });
    }
    return nye;
  };
  const gyldig = na => {
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      const gx = p[j].x - p[i].x, gy = p[j].y - p[i].y;
      if (gx * (na[j].x - na[i].x) + gy * (na[j].y - na[i].y) <= 0) return false;
    }
    let a2 = 0;
    for (let i = 0, j = na.length - 1; i < na.length; j = i++) a2 += na[j].x * na[i].y - na[i].x * na[j].y;
    let a0 = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a0 += p[j].x * p[i].y - p[i].x * p[j].y;
    // minst en tidel av det tegnede arealet, ellers er det ingen tomt igjen
    return Math.sign(a2) === Math.sign(a0) && Math.abs(a2) > Math.abs(a0) * 0.1;
  };
  const maksKrav = perKant.reduce((a, b) => Math.max(a, b), 0);
  if (gyldig(bygg(maksKrav))) return { tak: maksKrav, punkter: bygg(maksKrav) };
  if (!gyldig(bygg(0))) return null;
  let lav = 0, hoy = maksKrav;
  for (let i = 0; i < 24; i++) {
    const m = (lav + hoy) / 2;
    if (gyldig(bygg(m))) lav = m; else hoy = m;
  }
  return { tak: lav, punkter: bygg(lav) };
}

/**
 * Hvor langt skråningen faktisk går utenfor det tegnede omrisset, per side.
 *
 * Males pa den ferdige flaten - ikke pa kravet som ble regnet underveis. Kravet
 * males pa forrige rundes polygon, og etter at kanten er flyttet ligger den i
 * annet terreng, sa skraningen blir litt annerledes. Meldte man kravet, kunne
 * programmet si «side 3 mangler plass» mens streken i kartet krysset grensa pa
 * side 8.
 *
 * @returns {Array<{kant:number, mangler:number}>} sortert, verste først
 */
function maalOverskridelse(tegnet, indre, o) {
  if (!indre || indre.length < 3 || !o.terreng) return [];
  const fot = skraningsfot(Object.assign({}, o, {
    tomt: Object.assign({}, o.tomt, { punkter: indre })
  }));
  const verst = new Map();
  for (const f of fot) {
    if (f.type === 'apen') continue;
    if (innenforPolygon(tegnet, f.x, f.y)) continue;
    const d = naermestePaOmriss(tegnet, f.x, f.y).d;
    /* Kanten her er den pa den INDRE flaten. Den svarer til samme nummer pa
       det tegnede omrisset, siden innrykket ikke endrer rekkefølgen. */
    if (d > (verst.get(f.kant) || 0)) verst.set(f.kant, d);
  }
  return [...verst.entries()]
    .filter(([, d]) => d > 0.15)          // under femten centimeter er tegnestrek
    .map(([kant, mangler]) => ({ kant, mangler }))
    .sort((a, b) => b.mangler - a.mangler);
}

function normal(a, b, tegn) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: tegn * -dy / l, y: tegn * dx / l };
}

const Tomtmasser = {
  beregnTomtemasser, naermestePaOmriss, skraningsflate, fyllingsflate,
  nivaaVed, innenforPolygon, tyngdepunktAv, skraningsfot, innerflate,
  helningsfelt, tvungetVed
};

if (typeof module !== 'undefined') module.exports = Tomtmasser;
