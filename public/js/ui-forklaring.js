'use strict';
/**
 * Forklaring - hva strekene, fargene og ordene betyr.
 *
 * Tegnforklaringen i profilene sier hva en strek heter, men ikke hva den er.
 * «Etter rensk» er en stiplet linje under terrenget - men hva ER den? Det er
 * flaten man star igjen med nar matjord, torv og stubber er skrapt av, og det
 * er den flaten skjæringen males fra. Uten den forklaringen er navnet bare et
 * ord pa en strek.
 *
 * Ordlista dekker begge modusene og er bygd av det samme stoffet som ligger til
 * grunn for regnestykkene: Normaler for landbruksveier, N200 og R761. Der et
 * tall kommer fra en norm, star normen.
 */

const Forklaring = {

  /** Strekene i tegningene, med hvordan de faktisk ser ut. */
  streker: [
    { navn: 'Terreng', form: 'strek', farge: () => Farger.terreng, modus: 'begge',
      tekst: 'Bakken slik laserdataene fra Kartverket viser den, før noe er gjort. '
        + 'Høydene er kontrollert mot Kartverkets eget punkt-API og stemmer innenfor '
        + 'noen få millimeter.' },
    { navn: 'Etter rensk', form: 'stipla', farge: () => Farger.rensk, modus: 'veg',
      tekst: 'Flaten man står igjen med når matjord, torv, stubber og røtter er '
        + 'skrapt av. Det er herfra skjæringen måles – ikke fra terrengoverflaten. '
        + 'Ligger fjellet grunnere enn renskedybden, stopper rensken i fjellet.' },
    { navn: 'Planum', form: 'stipla', farge: () => Farger.planum, modus: 'begge',
      tekst: 'Der jordarbeidet slutter og overbygningen begynner. Skråningene '
        + 'starter i planum, ikke i overflaten – ellers ville jordarbeidsflaten '
        + 'hoppet med hele overbygningstykkelsen i det øyeblikket kanten gikk fra '
        + 'skjæring til fylling.' },
    { navn: 'Ferdig nivå', form: 'strek', farge: () => Farger.veg, modus: 'tomt',
      tekst: 'Overflaten man kjører på når alt er ferdig. Ligger overbygningen '
        + 'over planum, så avstanden mellom de to strekene er summen av lagene.' },
    { navn: '3D-modellen', form: 'flate', farge: () => Farger.terreng, modus: 'tomt',
      tekst: 'Knappen «3D» i tomtepanelet viser de samme tallene som snittet, '
        + 'sett fra en annen kant. Den røde og grønne flaten er det som skal '
        + 'graves og fylles – samme farger og samme skala som fargene i kartet. '
        + 'Den grå flaten oppå er dagens terreng. Modellen regner ingenting selv: '
        + 'hver høyde kommer fra det samme rutenettet volumet er regnet på. '
        + 'Ruter som er bleiket, ligger der skråningen måtte brattes opp eller '
        + 'ikke landet – tallene der står ikke like støtt som resten. '
        + 'Velger du å overdrive høyden, står det skrevet i bildet, også når du '
        + 'lagrer det: en tomt som er strukket tre ganger ser mye verre ut enn '
        + 'den er.' },
    { navn: 'Brattet opp', form: 'stipla', farge: () => Farger.skjaering, modus: 'tomt',
      tekst: 'Tykk, stiplet strek i kartet der skråningen ikke fikk plass med '
        + 'sin vanlige helning innenfor tomtegrensa. Den blir da lagt brattere – '
        + 'akkurat så bratt at den treffer bakken i grensa – og volumet er '
        + 'regnet med den helningen. Merknaden sier hvor bratt det ble, for '
        + 'eksempel «1:1,4 mot 1:2,5». Er tallet under 1:0,5, er det ikke lenger '
        + 'en skråning men en vegg: sprengt bergvegg i fjell, støpt mur i '
        + 'løsmasse. Skråningen blir aldri kappet loddrett – en loddrett flate '
        + 'i jord er ikke noe som kan bygges.' },
    { navn: 'Veglinje', form: 'strek', farge: () => Farger.veg, modus: 'veg',
      tekst: 'Vegoverflaten – der hjulet går. Under den ligger bærelag og '
        + 'slitelag, og under dem igjen planum.' },
    { navn: 'Fjell', form: 'stipla', farge: () => Farger.fjell, modus: 'begge',
      tekst: 'Overflaten av fast fjell, som modellen regner ut fra sonderingene '
        + 'du har lagt inn. Er det ingen sondering i nærheten, brukes '
        + 'standarddybden. Dette er den største usikkerheten i hele regnestykket – '
        + 'én sondering til er som regel verdt mer enn all annen finpussing.' }
  ],

  /** Fargeflatene. */
  flater: [
    { navn: 'Skjæring', farge: () => Farger.skjaeringFlate,
      tekst: 'Masse som må graves eller sprenges bort for å komme ned på planum.' },
    { navn: 'Fylling', farge: () => Farger.fyllingFlate,
      tekst: 'Rom som må fylles opp fordi det ferdige nivået ligger over bakken.' },
    { navn: 'Fjell i skjæringen', farge: () => Farger.skjaeringFlate, skravur: true,
      tekst: 'Den delen av skjæringen som ligger under fjelloverflaten og må '
        + 'sprenges. Fjellet er en del av skjæringen, ikke en post ved siden av – '
        + 'derfor skravur oppå skjæringsfargen i stedet for en egen farge.' }
  ],

  /** Begrepene, gruppert. */
  bolker: [
    {
      tittel: 'Masse og volum',
      ord: [
        ['Prosjektert fast volum (p.f.m³)', 'Massen slik den ligger i bakken, urørt. '
          + 'Alle hovedtallene i programmet er i denne formen. Det er det eneste '
          + 'volumet som er entydig – de andre avhenger av hva som skjer med massen.'],
        ['Anbrakt volum (p.a.m³)', 'Massen ferdig utlagt og komprimert der den skal '
          + 'ligge. Ett fast kubikkmeter fjell blir til om lag 1,3 m³ ferdig fylling.'],
        ['Løst volum', 'Massen på et lass. Sprengt fjell sveller til om lag 1,5 ganger '
          + 'det faste volumet. Dette tallet brukes til transport – aldri til balansen.'],
        ['Hvorfor to forskjellige fjelltall', 'Fjell teller med 1,5 på lasset og 1,3 '
          + 'ferdig utlagt. Blander man dem, blir svaret feil begge veier, og '
          + 'ingenting ser galt ut. Derfor står de som to poster.'],
        ['Brukbar løsmasse', 'Andelen av løsmasseskjæringen som holder mål som '
          + 'fyllmasse. Resten går til deponi. Standard er halvparten.'],
        ['Til deponi', 'Rensk, matjord og den løsmassen som ikke er god nok å fylle '
          + 'med. Dette skal kjøres bort og koster penger selv om det ikke bygges '
          + 'noe av det.'],
        ['Må kjøres inn', 'Det fyllingen mangler, pluss hele overbygningen. '
          + 'Overbygningen kjøpes uansett – den er knust masse med krav til '
          + 'kornkurve, og finnes ikke i en skogsli.']
      ]
    },
    {
      tittel: 'Skråninger og skrivemåte',
      ord: [
        ['1:1,5 og 10:1 betyr ikke det samme', 'Normene skriver berg og løsmasse med '
          + 'motsatt logikk. En jordskråning skrives 1:1,5 – én opp, halvannen ut, '
          + 'altså slak. En bergvegg skrives 10:1 – ti opp, én ut, altså nesten '
          + 'loddrett. Blander man dem, blir volumet fullstendig feil. Programmet '
          + 'lagrer alltid det samme tallet innvendig (vannrett utlegg per meter '
          + 'høyde) og viser den skrivemåten som hører til feltet.'],
        ['Skjæring i løsmasse', 'N200 tabell 242.1: stein 1:1,5 · grus 1:2 · sand 1:2 · '
          + 'silt 1:3 · leire 1:3 · morene 1:2,5. Slakere kreves ved høye skjæringer '
          + 'og i vanskelig grunn.'],
        ['Fylling', 'N200 tabell 252.1: stein 1:1,25 · grus 1:1,5 · sand 1:2 · '
          + 'morene 1:2 til 1:3.'],
        ['Sprengt bergvegg', 'N200 kap. 223.1 sier at bergskjæringer bør utformes som '
          + 'nær vertikale, 10:1. Grunnen er boreteknisk: borhullene settes med et '
          + '«kast» for å gi jevn forsetning. Helt loddrett er tillatt, men er et '
          + 'bevisst valg.'],
        ['Løsmasse over bergveggen', 'Veggen står nær loddrett i fjellet, men '
          + 'løsmassen som ligger over fjelloverflaten raser ut om den settes like '
          + 'bratt. Den får derfor sin egen, slakere helning – 1:2 eller slakere. '
          + 'Regner man hele veggen loddrett, blir løsmassevolumet for lite og '
          + 'skjæringstoppen havner feil sted i kartet.'],
        ['Utslag', 'Hvor langt skråningen stikker ut fra vegkanten eller tomtekanten. '
          + 'Blir det stort, er det ofte billigere å bygge mur eller flytte linjen '
          + 'enn å kjøre massene.']
      ]
    },
    {
      tittel: 'Fjell og sprengning',
      ord: [
        ['Overberg', 'Fjell som faktisk sprenges ut utenfor prosjektert kontur. Står '
          + 'på null med vilje: R761 prosess 22.1 sier at det ikke gis tillegg for '
          + 'overberg, og utfall innenfor 0,5 m fra konturen medregnes ikke. Setter '
          + 'du et tall, kommer det som egen post – aldri bakt inn i '
          + 'sprengningsvolumet, for da ville tilbudet sett dyrere ut enn oppgjøret '
          + 'blir.'],
        ['Kontursprengning', 'Tett hullavstand i ytterste rad, så veggen blir jevn. '
          + 'R761 prosess 22.21: maks c/c 0,7 m ved slettsprengning.'],
        ['Berme (hylle)', 'Avsats i en høy bergvegg. N200 kap. 202.1 setter 10 m som '
          + 'grensen der en bergskjæring går i geoteknisk kategori 3. Over det bør '
          + 'veggen deles i paller med hylle imellom.'],
        ['Dypsprengning', 'R761 prosess 22 c): er det mindre enn 0,75 m fra ferdig '
          + 'nivå ned til fast berg, ligger berget for nær til at et vanlig '
          + 'salveuttak går. Programmet teller rutene der dette skjer og sier fra.'],
        ['Rensk mot fjell', 'Løsmassen som skrapes av bergoverflaten der berget skal '
          + 'graves ut. N200 kap. 223.4 krever avdekking minst 2 m utenfor '
          + 'teoretisk skjæringskant.']
      ]
    },
    {
      tittel: 'På tomta',
      ord: [
        ['Ferdig nivå og planum', 'Ferdig nivå er der du kjører. Planum er der '
          + 'jordarbeidet slutter. Avstanden mellom dem er summen av lagene – '
          + 'frostsikring, forsterkningslag, bærelag, avretting og slitelag.'],
        ['Kanttypene', 'Planert skråning legger seg utover med valgt helning. '
          + 'Sprengt vegg står nær loddrett i berget. Mur erstatter skråningen med '
          + 'en konstruksjon. Åpen kant betyr at ingenting regnes utenfor – tomta '
          + 'stopper der.'],
        ['Hjørnene', 'Skråningene bygges som en avstandsflate rundt hele omrisset. '
          + 'I et utoverbøyd hjørne legger skråningen seg som en vifte rundt '
          + 'hjørnepunktet, akkurat slik den bygges i marka. I et innoverbøyd hjørne '
          + 'trimmes overlappet bort av seg selv – ellers ville volumet blitt talt '
          + 'to ganger.'],
        ['Fargene i kartet', 'Rødt er skjæring, grønt er fylling, sterkere farge jo '
          + 'mer. Skalaen er kvadratrot, så de grunne partiene også synes: med '
          + 'lineær skala forsvinner alt under en meter når ett hjørne er ti meter '
          + 'dypt.'],
        ['Snittlinja', 'Den stiplede streken i kartet viser hvor snittet under er '
          + 'lagt. Velg en kant i listen, eller klikk på målet i kartet, så legger '
          + 'snittet seg vinkelrett på den siden.'],
        ['Minstefall', 'Under 1:100 på tett dekke og 1:50 på grus blir det stående '
          + 'vann. TEK17 krever i tillegg fall bort fra bygning, minst 1:50 over '
          + 'de tre første meterne.'],
        ['Sikring', 'TEK17 § 8-3: nivåforskjell over 0,5 m mot hardt underlag eller '
          + '3 m mot mykt terreng skal sikres med rekkverk, gjerde eller tett '
          + 'vegetasjon. Det er ikke et volum, men det skal prises.']
      ]
    },
    {
      tittel: 'Når tallene ikke er til å stole på',
      ord: [
        ['Manglende terrengdata', 'Utenfor laserdekningen svarer høydetjenesten 0,00 '
          + 'for hver piksel. Programmet kjenner igjen slike fliser og regner dem '
          + 'som hull i stedet for som havflate – ellers ville en tomt på kote 260 '
          + 'fått en skjæring på 260 meter uten at noe sa fra. Rutene som mangler '
          + 'data blir talt opp og meldt.'],
        ['Skråningen når ikke terrenget', 'Går skråningen lenger ut enn søkebredden '
          + 'uten å møte bakken, er volumet på det profilet ikke til å stole på. '
          + 'Øk søkebredden, eller flytt nivået.'],
        ['Fjelldybden', 'Uten sonderinger er hele fjell/løsmasse-delingen et anslag '
          + 'basert på standarddybden. Det er den posten som svinger mest i pris, '
          + 'så det er der en ekstra sondering betaler seg.']
      ]
    }
  ],

  /** Bygger forklaringen for den modusen som er oppe. */
  vis(app) {
    const boks = document.getElementById('forklaringInnhold');
    if (!boks) return;
    const tomt = app.erTomt();
    const modus = tomt ? 'tomt' : 'veg';
    let ut = '<p class="notis">Hva strekene, fargene og ordene betyr. '
      + 'Der et tall kommer fra en norm, står normen.</p>';

    ut += '<div class="sumkort"><h4>Strekene i tegningene</h4>';
    for (const s of this.streker) {
      if (s.modus !== 'begge' && s.modus !== modus) continue;
      ut += `<div class="forklaringsrad"><span class="prove ${s.form}" `
        + `style="--f:${s.farge()}"></span><div><b>${s.navn}</b>${s.tekst}</div></div>`;
    }
    ut += '</div>';

    ut += '<div class="sumkort"><h4>Fargene</h4>';
    for (const f of this.flater) {
      ut += `<div class="forklaringsrad"><span class="prove flate${f.skravur ? ' skravur' : ''}" `
        + `style="--f:${f.farge()}"></span><div><b>${f.navn}</b>${f.tekst}</div></div>`;
    }
    ut += '</div>';

    for (const b of this.bolker) {
      if (b.tittel === 'På tomta' && !tomt) continue;
      ut += `<div class="sumkort"><h4>${b.tittel}</h4>`;
      for (const [ord, tekst] of b.ord) {
        ut += `<div class="forklaringsrad"><div><b>${ord}</b>${tekst}</div></div>`;
      }
      ut += '</div>';
    }
    boks.innerHTML = ut;
  },

  /**
   * Slår opp forklaringen til et navn i tegnforklaringen.
   * Brukes nar musa hviler over en post i profilen.
   */
  forStrek(navn) {
    const s = this.streker.find(x => x.navn === navn) || this.flater.find(x => x.navn === navn);
    return s ? s.navn + ': ' + s.tekst : null;
  }
};

if (typeof module !== 'undefined') module.exports = Forklaring;
