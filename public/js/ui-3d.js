'use strict';
/**
 * Tegneren bak 3D-visningene.
 *
 * Her ligger alt som bare kjenner ET GITTER, et lerret og et kamera: projeksjon,
 * rasterisering, lys, farger, mus og det felles overlegget. Den vet ingenting om
 * hva en tomt eller en veg er.
 *
 * Visningene – Tomt3d og Veg3d – arver herfra og gir tre kroker:
 *   _gitter(steg)                 bygger gitteret fra sine egne tall
 *   _lagliste(g, pal)             hvilke flater som tegnes, i hvilken rekkefølge
 *   _overleggEkstra(k, g, ...)    strekene som hører til nettopp den visningen
 * pluss _hudLinjer(g) og _avlesning(g, k) til tallene på skjermen.
 *
 * HVORFOR IKKE ET `kilde`-FELT MED IF-ER
 * Alternativet var én fil med `if (kilde === 'veg')` spredt gjennom hele
 * tegneveien. Da blir hver tomtefeil en vegfeil og omvendt, og de to visningene
 * kan aldri utvikle seg fra hverandre uten å rive i den andre. Med
 * prototypedelegering får hver visning sine egne yaw, pitch, skala, lag og
 * skrapebuffere gratis, uten en eneste gren.
 *
 * HVORFOR VI TEGNER DETTE SELV
 * Et bibliotek som three.js virker og er gratis, men koster prosjektets første
 * ekte avhengighet: 190 kB som må sjekkes inn eller hentes over nett, en
 * importmap i index.html, og en lastetilstand å håndtere. Verre: legger man inn
 * et modulskript slik alle eksemplene viser, blokkerer det DOMContentLoaded – og
 * hele appen starter på DOMContentLoaded. På dårlig dekning i felt ville
 * brukeren fått en hvit skjerm, og ved brudd ville programmet aldri startet.
 * Det er en feil som ikke synes på kontoret.
 *
 * Et regulært gitter er dessuten det enkleste 3D-tilfellet som finnes. Nodene
 * ligger allerede i rader og kolonner, så det trengs ingen dybdesortering av
 * trekanter – bare et dybdebuffer per piksel.
 *
 * HVORFOR IKKE ctx.fill() PER CELLE
 * Det var det opplagte: én firkant per celle med canvas. Målt gir det 4–12
 * bilder i sekundet, og kantutjevningen slipper bakgrunnen gjennom mellom hver
 * eneste firkant – flaten blir et fint nett av sprekker. Å skrive pikslene selv
 * i en Uint32Array er tiere ganger raskere og har ingen sprekker.
 */

const Tegner3d = {
  app: null,
  lerret: null,        // rasteret
  over: null,          // vektoroverlegget: streker, tall, nordpil
  aktiv: false,

  // kamera – hver visning overskriver med sine egne utgangsverdier
  yaw: 0,              // grader, dreining om loddaksen
  pitch: 55,           // grader over horisonten
  skala: 1,            // piksler per meter i bakkeplanet
  overdriv: 1,         // vertikal overdrivning
  senter: null,        // {x, y} i UTM, det bildet dreier om
  /* Hvor mange meter terreng rundt selve arbeidet som tas med. Uten en ring
     rundt ser man flaten, men ikke om den ligger i ei li, på en rygg eller i en
     søkk – og det er nettopp det man vil vite. Ringen koster ingenting å hente:
     terrengdataene er alt lastet ned med margin utenfor beregningen. */
  kontekst: 40,
  /* FYLDIG: massen som skal flyttes, malt helt.
     Standardvisningen legger terrenget halvgjennomsiktig OVER graveflaten, så
     man ser begge to. Det er riktig når man vil se hvordan inngrepet ligger i
     bakken – men det gjør at selve massen blir en blek gjenskinn av seg selv,
     og en grunn skjæring ved siden av en grunn fylling er nesten samme grå.
     I fyldig blir terrenget stående IGJEN der det ikke røres, og massen males
     med full farge. Da ser man volumet, ikke sløret. */
  fyldig: false,
  /* TRE BILDER AV DET SAMME STEDET, OG BARE ETT AV GANGEN.
     · `vanlig` – massene: terrenget med skjæring og fylling malt oppå. Det er
       arbeidsbildet, det man regner med.
     · `foer`   – terrenget slik det ligger i dag, uten inngrepet. Man ser HVA
       som blir gjort ved å se det som lå der før: uten det er det umulig å vite
       om den grønne vingen ligger i ei li eller på et jorde.
     · `etter`  – landskapet slik det BLIR når alt er ferdig. Ferdig vegbane og
       ferdig tomteflate der det bygges, skråningene der de lander, og dagens
       mark utenfor – én sammenhengende flate, uten en eneste massefarge. Det er
       bildet man viser kunden.
     Ingen av dem regner noe nytt: alle tre høydene ligger i gitteret (zT, zP,
     zEtter), lest av den samme modellen volumet er regnet mot.

     ÉN STRENG, IKKE TRE BOOLSKE FLAGG. Tre flagg har åtte tilstander, og fem av
     dem er meningsløse – «før og etter samtidig» er ikke et bilde. Med én streng
     finnes de ugyldige tilstandene ikke.
     `visFoer` under er samme tilstand sett gjennom det gamle navnet. Den er en
     AKSESSOR på prototypen, og det er ikke tilfeldig: et vanlig felt ville blitt
     skygget av `Veg3d.visFoer = true` (egen egenskap), mens en aksessor kaller
     setteren – så alle de gamle leserne fortsetter å virke uendret. */
  visning: 'vanlig',        // 'vanlig' | 'foer' | 'etter'
  get visFoer() { return this.visning === 'foer'; },
  set visFoer(v) { this.visning = v ? 'foer' : (this.visning === 'foer' ? 'vanlig' : this.visning); },
  get visEtter() { return this.visning === 'etter'; },
  set visEtter(v) { this.visning = v ? 'etter' : (this.visning === 'etter' ? 'vanlig' : this.visning); },
  /* DREIEPUNKTET.
     Modellen dreide om midten av HELE gitteret. På en to kilometer lang veg
     ligger den midten typisk hundrevis av meter fra det man ser på, og da er
     dreiing ikke dreiing – det er en slynge. Målt: motivet flyttet seg 5,4 til
     14,8 piksler for hver piksel musa gikk, med dreiepunktet 334 m unna.
     Med dreiepunktet I motivet er tallet algebraisk NULL: i fokuspunktet er
     X=Y=Z=0, altså rx=ry=dk=0, altså px=cx og py=cy – uansett yaw, pitch,
     skala og overdrivning. Punktet er låst til midten av skjermen.
     Feltet er null naar det betyr «som foer»: midten av gitteret. */
  fokus: null,
  /* PÅ BAKKEN.
     Oversikten er riktig verktøy for å se HVOR det svulmer, og feil verktøy for
     å navigere: motivet er 0,9-2,6 % av lerretet, og man ser aldri en fylling
     slik den ser ut fra grøfta. Bakkemodus er et ekte perspektivkamera med en
     posisjon, og øyet ligger på en SKINNE langs vegen - aldri fritt.
     Skinnen er ikke en begrensning, den er grunnen til at man ikke kan bli
     borte: med øyet minst 1,6 m over flaten kommer man aldri under bakken, og
     med stasjonen bundet til vegen er man alltid PÅ strekket. */
  modus: 'oversikt',        // 'oversikt' | 'bakken'
  /* Synsvinkelen visningen hører hjemme i. Tomta ser bratt ned på en flate,
     vegen ser lavt langs et strekk – og det er den lave vinkelen som avslører
     en linje som ligger for høyt. Feltet finnes fordi tallet ellers måtte
     skrives på nytt hvert sted man kommer «hjem» fra noe. */
  pitchHjem: 55,
  fov: 60,                  // grader loddrett, fast - ikke en innstilling
  kamH: 2.0,                // øyehøyde over gulvet, meter
  /* FARTEN MÅ KUNNE SKRUS OPP.
     Grunnfarten følger øyehøyden, og det er riktig: står man nede går man i
     gangfart, hever man seg flyr man. Men gangfart på en veg som er to
     kilometer lang er tolv minutter fra ende til ende, og et kort trykk på W
     flytter deg 22 cm – man tror tasten er død. Shift løper, men den må holdes.
     Faktoren er den varige innstillingen: den står til man endrer den, og den
     ganger både gange og løp. */
  fartsfaktor: 1,
  kamYaw: 0,                // kompassretning
  kamPitch: 0,              // blikkets høydevinkel, 0 = vannrett
  /* GÅ ELLER FLY – to helt forskjellige måter å være i modellen på.
     GÅ er et menneske på anlegget: øyet står i 1,7 m, føttene holder seg på
     vegen eller inne på tomta, og man kommer seg ikke ut. Det er den man vil ha
     når spørsmålet er «hvordan blir dette å kjøre?» eller «hvor høyt rager
     fyllinga over meg?» – og det er umulig å rote seg bort i den.
     FLY er kameraet uten bånd: hev deg, gå ut over skråningsfoten, se anlegget
     ovenfra og skrått. Det er den man vil ha når spørsmålet er «hvor bredt blir
     inngrepet?».
     Å blande dem var det gamle: man gikk «på bakken», men kunne heve seg til
     fire tusen meter og vandre ut i skogen. Da er verken det ene eller det
     andre til å stole på. */
  ferd: 'gaa',              // 'gaa' | 'fly'
  /* I FLYMODUS ER HØYDEN EN KOTE, IKKE EN AVSTAND TIL BAKKEN.
     Med bare `kamH` klistret kameraet seg til terrenget: man «fløy», men fulgte
     hver kul og hver grøft i konstant høyde over dem, som en helikoptersimulator
     med bakkeradar. Da kan man ikke stige opp og se utover, og W med blikket
     ned fører ikke nedover. `kamZ` er den frie høyden over havet; `kamH` er den
     som gjelder når man går, og blir en avlesning når man flyr. */
  kamZ: null,


  /**
   * Fargeskalaen, som en oppslagstabell.
   *
   * Samme farger og samme kurve som fargeoverlegget i kartet: kvadratrota av
   * avviket delt på det største. Kurven gjør at de små avvikene – der man
   * faktisk skal se om det blir graving eller fylling – ikke drukner i det
   * ene punktet som er seks meter dypt.
   */
  /**
   * Flaten man faktisk SER, som høydetabell. Én kilde, fire brukere.
   *
   * Rasteret, dreiepunktet, dybden man tar tak i når man drar, og gulvet under
   * føttene i bakkemodus må alle svare på det samme spørsmålet: hvor høyt ligger
   * bakken i node k? Sto svaret fire steder, ville de drive fra hverandre – og
   * det gjorde de: bakkekameraet sto på planum mens bildet viste ferdig veg,
   * altså sytti centimeter nede i asfalten, og overleggsstrekene fløt i lufta
   * over «før»-terrenget.
   *
   * `zEtter` kan mangle i et gitter som er bygd av en eldre utgave; da faller
   * den tilbake til gravflaten i stedet for å tegne et svart hull.
   */
  _flateHoyde(g) {
    if (!g) return null;
    if (this.visning === 'foer') return g.zT;
    if (this.visning === 'etter') return g.zEtter || g.zP;
    return g.zP;
  },

  _palett() {
    const tema = Farger.hent('flate') + '|' + Farger.hent('data-skjaering-flate')
      + '|' + (this.fyldig ? 'fyldig' : 'lett');
    if (this._palettFor === tema) return this._palettBuffer;
    const skj = Farger.skjaeringFlateRgb, fyl = Farger.fyllingFlateRgb;
    const grunn = Farger.terrengFlateRgb;
    const N = 64;
    const bygg = (fra, til) => {
      const ut = new Uint8Array(N * 3);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        ut[i * 3] = Math.round(fra[0] + (til[0] - fra[0]) * t);
        ut[i * 3 + 1] = Math.round(fra[1] + (til[1] - fra[1]) * t);
        ut[i * 3 + 2] = Math.round(fra[2] + (til[2] - fra[2]) * t);
      }
      return ut;
    };
    /* Fra nøytral grå (ingen forskjell) til full styrke.
       I FYLDIG er bunnen løftet: der avviket er lite, står fargen likevel på
       drøyt halv styrke. Poenget med den innstillingen er å SE hvor massen er,
       ikke å lese av hvor dypt det er hvert sted – og da er en flate som toner
       ut i grått nettopp det som gjør at man ikke ser den. */
    const noytral = [Math.round((grunn[0] + 255) / 2), Math.round((grunn[1] + 255) / 2), Math.round((grunn[2] + 255) / 2)];
    const bunn = this.fyldig ? 0.6 : 0;
    const fra = til => [0, 1, 2].map(i => Math.round(noytral[i] + (til[i] - noytral[i]) * bunn));
    this._palettBuffer = {
      N,
      skjaering: bygg(fra(skj), skj),
      fylling: bygg(fra(fyl), fyl)
    };
    this._palettFor = tema;
    return this._palettBuffer;
  },


  /**
   * Verden til skjerm.
   *
   * `dk` er dybden, som vokser bortover fra kameraet, og `sy` er skjermens
   * y-akse før perspektivet. Fortegnene på nettopp de to er det ene stedet en
   * feil IKKE synes: modellen ser like troverdig ut med snudd fortegn, den
   * viser bare skjæring der det er fylling. Derfor står det en prøve på dem.
   */
  /**
   * @param {number} skala piksler per meter I DET LERRETET som tegnes
   * @param {number} panX,panY forskyvning i samme piksler
   *
   * Skalaen sendes inn i stedet for å leses fra objektet. Den var et felt som
   * ble skrevet om til rasterpiksler midt i tegnerutinen og tilbake etterpå, og
   * kameraet ble laget FØR omskrivingen – så modellen ble tegnet i skjermskala
   * på et lerret som var dobbelt så stort. Et kamera som ikke kan lages med feil
   * skala, kan heller ikke tegne feil.
   */
  _kamera(b, h, g, skala, panX, panY) {
    if (this.modus === 'bakken') {
      const bk = this._bakkeKamera(b, h, g);
      if (bk) return bk;
    }
    const a = this.yaw * Math.PI / 180, p = this.pitch * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    /* To linjer, og hele slyngen forsvinner. Se `fokus` over.
       z0 MÅ følge med: uten det driver bildet 89 px loddrett når man skrur
       overdrivningen fra 1x til 3x, fordi punktet da ikke lenger er punktet. */
    const fo = this.fokus;
    const s = fo || this.senter || { x: g.midtX, y: g.midtY };
    const z0 = fo ? fo.z : (g.lav + g.hoy) / 2;
    /* AVSTANDEN MÅ DEKKE HELE SCENEN, IKKE BARE DET MAN ARBEIDER MED.
       `w = dist + dk`, og for et punkt D meter foran dreiepunktet er
       `dk ≈ -D`. Er D større enn `dist`, blir w negativ og punktet klippet
       bort av nærplanet. Med bare det aktive gitteret i regnestykket
       forsvinner et bakgrunnsanlegg som ligger lenger unna enn sin egen nabo
       er stor: står man i en tomt på 60 m og vegen ved siden av er 700 m,
       ville det meste av vegen aldri blitt tegnet. */
    const dia = Math.max(g.diagonal || 0, this._sceneDiagonal || 0);
    const dist = Math.max(60, dia * 1.6);
    const cx = b / 2 + (panX || 0), cy = h / 2 + (panY || 0);
    const ov = this.overdriv;
    /* F er brennvidden i rasterpiksler. `px = cx + F·rx/w` er algebraisk
       identisk med den gamle `cx + rx·(dist/(dist+dk))·skala` – bare skrevet
       slik at bakkekameraet, som har en ekte øyeposisjon, kan bruke NØYAKTIG
       den samme rasteriseringen. */
    const F = dist * skala;
    return {
      dist, skala, F, cx, cy,
      /* ET EKTE NÆRPLAN OGSÅ OVENFRA.
         Uten `naer` faller `_raster` tilbake på 1e-6, og en trekant som
         krysser øyeplanet klippes MOT det tallet: `F·rx/1e-6` sender hjørnet
         en million skjermbredder ut, og firkanten smøres over halve bildet –
         inn i det delte dybdebufferet, så den skjuler det som ligger bak.
         Det kunne ikke skje så lenge bildet bare inneholdt det aktive
         anlegget, for `dist` er 1,6 ganger dets egen diagonal og w ble aldri
         liten. Med naboanlegg i samme scene er avstanden ikke lenger bundet
         til det man ser på. En prosent av avstanden ligger langt under
         modellens egne w-verdier og forkaster bare det degenererte. */
      naer: dist * 0.01,
      /**
       * @returns {{px,py,rx,sy,w}} px/py i rasterpiksler.
       *   rx/sy/w er kamerarommet, og de trengs der ute: nærplanklippingen må
       *   skje FØR divisjonen, fordi bare rx, sy og w er lineære i
       *   verdensposisjonen. Etter divisjonen er de det ikke, og en trekant som
       *   krysser øyeplanet smøres over hele skjermen med snudd fortegn.
       */
      punkt: (wx, wy, wz) => {
        const x = wx - s.x, y = wy - s.y, z = (wz - z0) * ov;
        const rx = x * ca + y * sa;
        const ry = x * sa - y * ca;              // se MODELLEN VAR SPEILVENDT
        const dk = -(ry * cp + z * sp);
        const sy = ry * sp - z * cp;
        const w = dist + dk;
        return { px: cx + F * rx / w, py: cy + F * sy / w, rx, sy, w };
      }
    };
  },

  /**
   * Kameraet når man står PÅ bakken.
   *
   * Rotasjonen er de samme fire linjene som over. Det eneste som er byttet er
   * origo (dreiepunktet → øyet), nevneren (`dist + dk` → dybden fra øyet, som
   * kan bli null eller negativ) og fortegnet på pitch – her er den BLIKKETS
   * høydevinkel, ikke kameraets høyde over bakken.
   *
   * Brennvidden er fast: `fov` er ikke en innstilling. En telelinse er nettopp
   * det man klager på i dreieskiva, og et synsfelt man kan skru på er en ny
   * måte å rote seg bort på.
   */
  _bakkeKamera(b, h, g) {
    const E = this._bakkePos ? this._bakkePos(g) : null;
    if (!E || !Number.isFinite(E.z)) return null;
    const a = this.kamYaw * Math.PI / 180, p = -this.kamPitch * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    const F = (h / 2) / Math.tan(this.fov * Math.PI / 360);
    const cx = b / 2, cy = h / 2;
    return {
      F, cx, cy, oye: E, naer: 0.35,
      punkt: (wx, wy, wz) => {
        const x = wx - E.x, y = wy - E.y, z = wz - E.z;
        const rx = x * ca + y * sa;
        const ry = x * sa - y * ca;              // se MODELLEN VAR SPEILVENDT
        const w = -(ry * cp + z * sp);
        const sy = ry * sp - z * cp;
        return { px: cx + F * rx / w, py: cy + F * sy / w, rx, sy, w };
      }
    };
  },


  /**
   * Skala og forskyvning som får hele tomta til å fylle lerretet.
   *
   * Skalaen alene holder ikke. Med pitch under 90 grader er ikke det
   * projiserte midtpunktet det samme som dreiepunktet – modellen havner i et
   * hjørne selv om den har riktig størrelse. Derfor regnes en forskyvning ut
   * samtidig, som flytter det som faktisk ble tegnet til midten.
   *
   * Hjørnene alene duger heller ikke: med perspektiv og rotasjon kan
   * ytterpunktet ligge midt på en kant. Derfor prøves kanten rundt.
   */
  /**
   * @param {Array} [andre] bakgrunnsanlegg som også skal få plass i bildet.
   *   Uten dem rammes bare det man arbeider med inn, og nabotomta ligger
   *   utenfor kanten til man zoomer ut selv.
   */
  _tilpassSkala(b, h, g, andre) {
    /* På bakken finnes ingen innramming: kameraet har en posisjon, og skala og
       forskyvning brukes ikke i det hele tatt. Uten dette ville tilpasningen
       regnet en meningsløs skala av et perspektivbilde og skrevet den inn. */
    if (this.modus === 'bakken') return { skala: 1, panX: 0, panY: 0 };
    const k = this._kamera(b, h, g, 1, 0, 0);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    /* ET PUNKT BAK ØYET HAR INGEN PLASS PÅ SKJERMEN, OG BOKSEN SKAL IKKE TRO
       DET HAR DET.
       `px = cx + F·rx/w` med negativ w gir et tall i milliardklassen med
       snudd fortegn. Ett slikt punkt forgifter hele randboksen: bredden blir
       enorm, `skala` går mot null, og modellen kollapser til en prikk – og
       `_skalaSatt` låser den tilstanden til noe nullstiller den. Med
       avstanden regnet av unionen skal dette ikke kunne skje, men den vakten
       koster tre sammenligninger og fanger det som likevel gjør det: stor
       høydeoverdrivning på et anlegg som ligger mye høyere enn det aktive. */
    const naerK = k.naer || 1e-6;
    const legg = q => {
      if (!(q.w > naerK)) return;
      const rx = q.px - b / 2, ry = q.py - h / 2;      // skala er 1 her
      minX = Math.min(minX, rx); maksX = Math.max(maksX, rx);
      minY = Math.min(minY, ry); maksY = Math.max(maksY, ry);
    };
    /* Randen av ETT gitter. Hjørnene alene duger ikke – med perspektiv og
       rotasjon kan ytterpunktet ligge midt på en kant. */
    const rand = gg => {
      const ta = (i, j) => {
        if (i < 0 || j < 0 || i >= gg.nb || j >= gg.nh) return;
        const kk = j * gg.nb + i;
        if (gg.finnes && !gg.finnes[kk]) return;
        for (const z of [gg.lav, gg.hoy]) legg(k.punkt(gg.wx[kk], gg.wy[kk], z));
      };
      const steg = Math.max(1, Math.floor(Math.max(gg.nb, gg.nh) / 24));
      for (let i = 0; i < gg.nb; i += steg) { ta(i, 0); ta(i, gg.nh - 1); }
      for (let j = 0; j < gg.nh; j += steg) { ta(0, j); ta(gg.nb - 1, j); }
      ta(gg.nb - 1, gg.nh - 1);
    };
    rand(g);
    /* Bakgrunnsgitrene har hull – en tomteflate fyller ikke sitt eget
       rektangel – så randen av rutenettet er ikke randen av flaten. Her leses
       ytterpunktene av de nodene som FINNES i stedet. */
    for (const bg of (andre || [])) {
      if (!bg || !bg.finnes) continue;
      const hz = this._bakgrunnHoyde(bg);
      if (!hz) continue;
      const n2 = bg.nb * bg.nh;
      const hopp = Math.max(1, Math.floor(n2 / 400));
      for (let kk = 0; kk < n2; kk += hopp) {
        if (!bg.finnes[kk]) continue;
        legg(k.punkt(bg.wx[kk], bg.wy[kk], hz[kk]));
      }
    }
    if (!Number.isFinite(minX)) return { skala: 1, panX: 0, panY: 0 };
    const br = Math.max(1e-6, maksX - minX), ho = Math.max(1e-6, maksY - minY);
    const skala = Math.min((b * 0.84) / br, (h * 0.84) / ho);
    /* HAR BRUKEREN PEKT UT ET DREIEPUNKT, ER DET HAN SOM HAR SAGT HVA MIDTEN
       ER. Tilpasningen sentrerer hele modellens randboks, og den kjøres om
       igjen hver gang lerretet skifter størrelse – stor visning, 3D av og på,
       et nettbrett som snus. Uten dette unntaket hoppet det utpekte punktet
       over tusen piksler ved én slik endring, og man sto et helt annet sted
       enn der man jobbet. */
    if (this.fokus) return { skala, panX: 0, panY: 0 };
    return {
      skala,
      panX: -((minX + maksX) / 2) * skala,
      panY: -((minY + maksY) / 2) * skala
    };
  },


  /* ================================================================
     DE ANDRE ANLEGGENE I SAMME BILDE

     Et prosjekt med to tomter og en veg er tre ting som skal bygges på samme
     plass. Spørsmålet man har foran seg – treffer snuplassen vegen? ligger
     lagerplassen høyt nok? – kan ikke besvares av en modell som viser ett
     anlegg om gangen, uansett hvor god den er.

     TO DETALJNIVÅER, OG DET ENE ER IKKE GRATIS.

     SKISSE er bygd av lagret data alene: vegbanen slik linjeføringen og
     høydeprofilen sier, tomteflaten slik omrisset og koten sier. Ingen
     terrengnedlasting, ingen masseberegning – den er der på et halvsekund.
     Prisen, sagt høyt: den har ingen skråninger og ingen masser. Den viser
     hvor anlegget ligger og hvilken høyde det får, ikke hvor langt inngrepet
     rekker. Derfor tegnes den i én dempet farge – den skal leses som en
     henvisning, ikke som et regnestykke.

     FULL er det samme gitteret som anlegget får når det er oppe: terreng,
     skjæring og fylling i massefargene, skråninger der de faktisk lander,
     fjell. Den koster at programmet må innom hvert anlegg og regne det ut –
     terrenget må lastes ned, massene må marsjeres – og det tar sekunder. Den
     bygges derfor på bestilling, med framdrift, og huskes til geometrien
     endrer seg.

     Skissen er ikke en dårligere utgave av den fulle; den er svaret på et
     annet spørsmål. «Hvor ligger de i forhold til hverandre» trenger ikke
     masser, og skal ikke vente på dem.
     ================================================================ */

  /**
   * Bygger FULLE gitre for naboanleggene – de samme som anleggene får selv.
   *
   * Det finnes ingen vei utenom å bytte til hvert anlegg: `_gitter()` leser
   * `app.resultat` og `app.linje`, og de hører til det aktive. Gitteret som
   * kommer ut er derimot selvstendig – rene tabeller med verdenskoordinater og
   * høyder – så det overlever byttet og kan tegnes lenge etterpå.
   *
   * Begge `_lagliste(g, pal)` er rene funksjoner av gitteret og lagbryterne;
   * ingen av dem leser `app.resultat`. Det er hele grunnen til at dette lar
   * seg gjøre uten å røre tegneveien.
   */
  async byggFulleAnlegg() {
    /* Kalles på PROTOTYPEN – fra knappen i menyen – og der finnes ingen `app`.
       Den bor på Veg3d og Tomt3d, ikke på Tegner3d. Samme fallback som
       `visAndreknapp` bruker; uten den gjorde knappen ingenting, stille. */
    const app = this.app || (typeof App !== 'undefined' ? App : null);
    if (!app || !app.P || !Array.isArray(app.P.anlegg) || app.P.anlegg.length < 2) return;
    if (Tegner3d._byggerFulle) return;
    Tegner3d._byggerFulle = true;
    const foer = app.P.aktivt;
    const fulle = Tegner3d._fulle || (Tegner3d._fulle = new Map());
    /* Autolagring midt i en runde ville lagret prosjektet med et annet aktivt
       anlegg enn brukeren står i. Samme grep som samleeksporten. */
    app.autolagringPause = (app.autolagringPause || 0) + 1;
    const utelatt = [];
    /* KAMERAET SKAL STÅ DER DET STO.
       `byttAnlegg` river ned senter, fokus, zoom og bakkeposisjon for begge
       visningene – med god grunn, for et bytte er et bytte. Men dette er ikke
       et bytte; det er programmet som løper en runde og kommer tilbake. Uten
       dette ble den som sto NEDE I MODELLEN og trykte «Full detalj» kastet opp
       i oversikten, uten dreiepunktet han nettopp klikket ut. Og det er
       nøyaktig han som vil se naboene. */
    /* BARE RENE FELT – ALDRI EN AKSESSOR.
       `Veg3d.kamS` er ikke et tall, det er et par getter/setter, og setteren
       kaller `App.settTverrStasjon`, som leser vegens profiler. Å legge den
       tilbake mens en TOMT er aktiv leste `resultat.profiler[0]` på et
       tomteresultat og kastet. Den samme fellen som `Object.assign` gikk i da
       visningene ble bygd: et felt som ser ut som en verdi er en funksjon.
       Det som skal legges tilbake, er `_kamS` under den. */
    const FELT = ['modus', 'ferd', 'senter', 'fokus', 'panX', 'panY', 'skala',
      'yaw', 'pitch', 'kamT', 'kamX', 'kamY', 'kamZ', 'kamH', 'kamYaw', 'kamPitch',
      '_kamS', '_kamSSkjovet', '_fitSkala', '_panFast', '_tilpassetFor', '_kamSatt'];
    const kamera = [Veg3d, Tomt3d].map(v => {
      const s = { v, felt: {} };
      for (const f of FELT) if (f in v) s.felt[f] = v[f];
      return s;
    });
    /* Programmets egen runde er ikke noe å angre – se App.merk. */
    app._ikkeMerk = true;
    try {
      /* ET ANLEGG SOM ÅPENBART IKKE KAN REGNES SKAL IKKE PRØVES.
         `ventPaaResultat` poller til fristen løper ut, og framdriftsboksen
         dekker hele skjermen og sluker klikk. En veg uten høydeprofil får
         `oppdater()` til å sette resultat = null og gå ut – da satt man og
         ventet ut hele fristen, med tre slike anlegg tre ganger etter
         hverandre, foran en skjerm som ikke tok imot noe. Skissen vet allerede
         hva som mangler; det er den samme kunnskapen. */
      const kanRegnes = a => a.type === 'tomt'
        ? !!(a.tomt && (a.tomt.punkter || []).length > 2
          && a.tomt.nivaa && Number.isFinite(a.tomt.nivaa.kote))
        : ((a.ip || []).length > 1 && (a.vip || []).length > 1);
      const liste = [];
      for (const a of app.P.anlegg) {
        if (a.id === foer || this.anleggAv(a.id)) continue;
        if (kanRegnes(a)) liste.push(a);
        else {
          utelatt.push((a.navn || a.type) + ' – '
            + (a.type === 'tomt' ? 'ingen ferdig kote satt' : 'ingen høydeprofil ennå'));
        }
      }
      /* TO RUNDER, IKKE ÉN.
         Det første anlegget som regnes ser ikke naboene sine – de finnes ikke
         ennå. Det siste ser alle. Etter én runde er tallene derfor avhengige av
         rekkefølgen, og det er ikke et svar man kan gi fra seg. Andre runde
         regner alle om igjen med alle de andre på plass, og da står de stille.
         Ligger to anlegg OPPÅ hverandre, står de fortsatt ikke stille – og det
         sies det fra om, se `App.overlappendeAnlegg`. */
      /* ANLEGGET MAN STÅR I ER OGSÅ TERRENG FOR DE ANDRE.
         Regelen er «alle de andre», og den gjelder begge veier. Uten dette
         hadde naboene regnet mot lia der tomta man nettopp planerte ligger –
         og bare den man sto i ville sett sannheten. Flaten hentes fra gitteret
         som alt står ferdig, så det koster ingenting. */
      {
        const eierA = app.erTomt() ? Tomt3d : Veg3d;
        /* VINDUET MÅ AV HER OGSÅ.
           Løkka nedenfor gjør nettopp dette for hver nabo, og begrunnelsen der
           gjelder ord for ord her: står tverrsnittsvinduet på ±100 m, ble bare
           den strekningen registrert som «vegen ferdig bygd» for de andre. En
           nabotomt tusen meter unna traff da rå mark og regnet mot lia som
           vegen alt har gravd bort – mens merknaden likevel sa at den var
           regnet mot vegens ferdige nivå. Og flyttet brukeren skyveknappen og
           trykte igjen, fikk han et annet tallsett. */
        const foerVinduA = eierA.vindu;
        if (eierA.vindu) { eierA.vindu = 0; eierA._gitterFor = null; }
        try {
          const gA = eierA._gitter(1);
          if (gA) {
            if (!app._ferdigflater) app._ferdigflater = new Map();
            const aA = app.P.anlegg.find(x => x.id === foer);
            const fA = app.ferdigflateAv(gA, 1);
            /* Nøkkelen følger flaten – se App._ryddFerdigflater. Uten den blir
               en flate liggende som terreng etter at anlegget er endret. */
            if (fA && aA) { fA.nokkel = this._fullnokkel(aA); app._ferdigflater.set(foer, fA); }
            else app._ferdigflater.delete(foer);
          }
        } finally { eierA.vindu = foerVinduA; eierA._gitterFor = null; }
      }
      const runder = liste.length > 1 ? 2 : 1;
      let i = 0;
      const totalt = liste.length * runder;
      for (let runde = 0; runde < runder; runde++) {
      for (const a of liste) {
        i++;
        app.framdrift(true, 'Regner ut ' + (a.navn || a.type) + ' … ' + i + '/' + totalt,
          i / (totalt + 1));
        const nokkel = this._fullnokkel(a);
        const har = fulle.get(a.id);
        if (har && har.nokkel === nokkel && har.runde >= runde) continue;
        const eier = a.type === 'tomt' ? Tomt3d : Veg3d;
        /* Vindu og kontekst former VEGENS gitter (`_gitter()` tar ingen
           parameter i det hele tatt). Sto vinduet på, ville naboen blitt et
           tohundremeters utsnitt midt på en veg på to kilometer – uten at noe
           sa hvorfor resten manglet. */
        const foerVindu = eier.vindu;
        if (eier.vindu) eier.vindu = 0;
        try {
          app.byttAnlegg(a.id);
          /* 20 sekunder, ikke 60. Terrenget for ett anlegg er nede på
             sekunder; tar det lenger, er noe galt, og da er en melding bedre
             enn et minutt til bak en overlay som sluker klikk. */
          await Rapport.ventPaaResultat(20000, a.id);
          const g = eier._gitter(a.type === 'tomt' ? Tegner3d.NABOSTEG : 1);
          eier._gitterFor = null;
          if (!g) throw new Error('ingen modell å bygge');
          fulle.set(a.id, { g, eier, nokkel, runde, navn: a.navn || a.type, type: a.type, id: a.id });
          /* OG DET FERDIGE ANLEGGET BLIR DET NYE TERRENGET.
             Gitteret er tegningen; høydemodellen under er det de ANDRE
             anleggene skal regne mot. Uten den siste linja ville bildet vist
             at tomta ligger der, mens vegen fortsatt gravde fra lia som lå
             der før – og den samme kubikken ville blitt talt to ganger. */
          if (!app._ferdigflater) app._ferdigflater = new Map();
          const flate = app.ferdigflateAv(g, 1);
          // nøkkelen følger flaten – se App._ryddFerdigflater
          if (flate) { flate.nokkel = nokkel; app._ferdigflater.set(a.id, flate); }
          else app._ferdigflater.delete(a.id);
        } catch (e) {
          fulle.delete(a.id);
          utelatt.push((a.navn || a.type) + ' – ' + e.message);
        } finally {
          eier.vindu = foerVindu;
          eier._gitterFor = null;
        }
      }
      }
    } finally {
      app.autolagringPause--;
      if (app.P.aktivt !== foer) {
        app.byttAnlegg(foer);
        try { await Rapport.ventPaaResultat(20000, foer); } catch (e) { /* status sier fra */ }
      }
      app._ikkeMerk = false;
      for (const s of kamera) {
        for (const f of Object.keys(s.felt)) s.v[f] = s.felt[f];
      }
      app.framdrift(false);
      Tegner3d._byggerFulle = false;
    }
    Tegner3d._fulleUtelatt = utelatt;
    for (const vis of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null]) {
      if (!vis) continue;
      vis.glemBakgrunn();
      vis._skalaSatt = false;
      if (vis.aktiv) vis.tegn();
    }
    app.status(utelatt.length
      ? 'Full detalj på ' + (Tegner3d._fulle.size) + ' anlegg · ikke med: ' + utelatt.join('; ')
      : 'Full detalj på ' + Tegner3d._fulle.size + ' naboanlegg');
  },

  /**
   * Høydene til et bakgrunnsanlegg, uansett hvilket av de to slagene det er.
   *
   * En SKISSE har én tabell, `z` – den ferdige flaten og ingenting annet. Et
   * FULLT gitter har ingen `z` i det hele tatt; det har zT, zP, zVeg/zFerdig
   * og zEtter, og hvilken av dem som er «flaten man ser» avgjøres av visningen.
   * Uten dette leste innrammingen `bg.z[kk]` på et fullt gitter og kastet på
   * undefined – midt i byggingen, så knappen så ut til å ødelegge noe.
   */
  _bakgrunnHoyde(bg) {
    if (bg.z) return bg.z;
    return this._flateHoyde(bg) || bg.zP || bg.zT;
  },

  /**
   * Bufernøkkel for et FULLT gitter – strengere enn skissens.
   *
   * En skisse er den ferdige flaten, og avhenger bare av geometrien og koten.
   * Et fullt gitter bærer skråninger, masser og fjell, og avhenger dermed også
   * av HELE malen (skjæringshelning, fyllingshelning, grøft, søkebredde,
   * rutestørrelse), av fjellmodellen og av faktorene – og de to siste ligger på
   * PROSJEKTET, felles for alle anleggene.
   *
   * Uten dette ble det bufrede gitteret stående uendret når man endret
   * skråningshelningen på naboen eller satte en ny fjellsondering, mens lista
   * fortsatt sa ● «fullt regnet». Et gammelt bilde som utgir seg for å være
   * ferskt er verre enn skissen – skissen ser i det minste ut som en skisse.
   */
  _fullnokkel(a) {
    const app = this.app || (typeof App !== 'undefined' ? App : null);
    const P = app && app.P;
    const eier = a.type === 'tomt' ? Tomt3d : Veg3d;
    return this._anleggsnokkel(a)
      + '#mal:' + JSON.stringify(a.mal || {})
      + '#fjell:' + JSON.stringify((P && P.fjell) || {})
      + '#fakt:' + JSON.stringify((P && P.faktorer) || {})
      + '#bakke:' + ((P && P.bakkekorreksjon) ? 1 : 0)
      + '#prof:' + ((P && P.profilAvstand) || '')
      + '#ktx:' + (eier ? eier.kontekst : '');
  },

  /** Er dette anlegget valgt bort fra bakgrunnen? */
  anleggAv(id) {
    return !!(Tegner3d._andreAv && Tegner3d._andreAv.has(id));
  },

  /**
   * Lista over naboanlegg i «Vis»-menyen: hvilke som er med, og hvor detaljert.
   *
   * Merket foran hvert navn sier hva man ser: ● er fullt regnet, ○ er skisse.
   * Uten det skillet er en dempet flate og en flate med masser to bilder man
   * ikke kan skille – og de svarer på helt ulike spørsmål.
   */
  visAndreliste() {
    const app = this.app || (typeof App !== 'undefined' ? App : null);
    const anlegg = (app && app.P && Array.isArray(app.P.anlegg)) ? app.P.anlegg : [];
    const andre = anlegg.filter(a => a.id !== app.P.aktivt);
    const fulle = Tegner3d._fulle;
    for (const id of ['v3_andreliste', 't3_andreliste']) {
      const boks = document.getElementById(id);
      if (!boks) continue;
      boks.classList.toggle('skjult', andre.length === 0);
      if (!andre.length) { boks.innerHTML = ''; continue; }
      const rader = andre.map(a => {
        const av = Tegner3d.anleggAv(a.id);
        const f = fulle && fulle.get(a.id);
        const full = !!(f && f.nokkel === this._fullnokkel(a));
        const merke = av ? '·' : (full ? '●' : '○');
        return '<button type="button" class="verktoyknapp anleggsrad' + (av ? '' : ' aktiv')
          + '" data-anlegg="' + a.id + '" title="'
          + (av ? 'Slå på i 3D-bildet' : 'Ta bort fra 3D-bildet')
          + (full ? ' · fullt regnet' : ' · skisse uten masser') + '">'
          + merke + ' ' + escapeHtml(a.navn || a.type) + '</button>';
      }).join('');
      const alleFulle = andre.every(a => {
        const f = fulle && fulle.get(a.id);
        return Tegner3d.anleggAv(a.id) || (f && f.nokkel === this._fullnokkel(a));
      });
      boks.innerHTML = '<span class="andrehode">Naboanlegg</span>' + rader
        + '<button type="button" class="verktoyknapp andrefull" data-full="1" title="'
        + 'Regn ut naboanleggene så de tegnes med terreng, masser og skråninger – '
        + 'akkurat som anlegget du står i. Tar noen sekunder per anlegg.">'
        + (alleFulle ? '● Full detalj på alle' : '○→● Full detalj') + '</button>';
      for (const b of boks.querySelectorAll('[data-anlegg]')) {
        b.onclick = () => this.settAnleggAv(b.dataset.anlegg, !Tegner3d.anleggAv(b.dataset.anlegg));
      }
      const kn = boks.querySelector('[data-full]');
      if (kn) kn.onclick = () => this.byggFulleAnlegg();
    }
  },

  /**
   * Slår ett enkelt naboanlegg av eller på.
   *
   * «Alle anlegg» er ett spørsmål; «ikke den der» er et annet. Med tre anlegg
   * på samme plass er det ofte ETT av dem man vil se sammen med sitt eget, og
   * en bryter som bare kan alt eller ingenting tvinger fram et bilde man ikke
   * spurte om.
   */
  settAnleggAv(id, av) {
    if (!Tegner3d._andreAv) Tegner3d._andreAv = new Set();
    if (av) Tegner3d._andreAv.add(id); else Tegner3d._andreAv.delete(id);
    for (const vis of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null]) {
      if (!vis) continue;
      vis.glemBakgrunn();
      vis._skalaSatt = false;
    }
    this.visAndreliste();
    for (const vis of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null]) {
      if (vis && vis.aktiv) vis.tegn();
    }
  },

  /**
   * Gitre for alle anleggene som IKKE er oppe nå.
   *
   * Bufres på geometrien til hvert anlegg. Uten bufring bygges de om for hvert
   * eneste bilde, og i bakkemodus er det seksti ganger i sekundet.
   */
  _bakgrunnsgitre() {
    if (!this.lag || !this.lag.andre) return [];
    const app = this.app;
    if (!app || !app.P || !Array.isArray(app.P.anlegg) || app.P.anlegg.length < 2) return [];
    /* SONEN MÅ ALT VÆRE SATT.
       `App.tomtIUtm(t)` setter `this.sone` dovent fra FØRSTE punkt i tomta den
       får inn dersom den ikke er satt fra før (app.js). Bygger vi et
       bakgrunnsanlegg før den er satt, pinnes hele prosjektets UTM-sone av et
       anlegg brukeren ikke ser på – og alt annet projiseres deretter. */
    if (!app.sone) return [];
    const fulle = Tegner3d._fulle;
    const nokkel = app.P.aktivt + '#' + app.sone + '#'
      + app.P.anlegg.map(a => this._anleggsnokkel(a)).join('|')
      + '#av:' + [...(Tegner3d._andreAv || [])].sort().join(',')
      + '#full:' + (fulle ? [...fulle.keys()].sort().join(',') : '')
      /* FERSKHETEN HØRER MED I NØKKELEN.
         `_anleggsnokkel` er ren geometri. Et fullt gitter avhenger av mye mer –
         malen, fjellet, kontekstringen – og prøves mot `_fullnokkel` lenger
         nede. Men den prøven kjøres bare når bufferet BOMMER. Endret brukeren
         fjellets standarddybde, traff nøkkelen her, og det gamle fulle
         gitteret ble tegnet videre: eget anlegg med nytt fjell, naboen med det
         gamle, i samme bilde. Samtidig regnet lista over anlegg `_fullnokkel`
         på nytt og merket naboen ○ «skisse» – merket og bildet sa motsatt ting.
         Prisen er én `JSON.stringify` per anlegg som faktisk HAR et fullt
         gitter, ikke per anlegg. */
      + '#fersk:' + (fulle ? app.P.anlegg.filter(a => fulle.has(a.id))
        .map(a => this._fullnokkel(a)).join('|') : '');
    if (this._andreNokkel === nokkel && this._andreBuffer) return this._andreBuffer;
    const ut = [];
    const utelatt = [];
    for (const a of app.P.anlegg) {
      if (a.id === app.P.aktivt) continue;
      /* Valgt bort er ikke det samme som «lot seg ikke tegne», og skal derfor
         heller ikke meldes som det. Det var brukerens eget valg. */
      if (this.anleggAv(a.id)) continue;
      /* ER DET ET FULLT GITTER, ER DET DET SOM SKAL BRUKES.
         Det er bygd av den samme koden som anlegget får når det er oppe, og
         bærer terreng, masser og skråninger. Skissen er reserven. */
      const full = fulle && fulle.get(a.id);
      if (full && full.nokkel === this._fullnokkel(a)) {
        const g = full.g;
        g.navn = full.navn; g.type = full.type; g.id = full.id;
        g.eier = full.eier; g.full = true;
        if (!g.merke) g.merke = { x: g.midtX, y: g.midtY, z: g.hoy };
        ut.push(g);
        continue;
      }
      let g = null, grunn = null;
      try {
        g = a.type === 'tomt' ? this._bakgrunnTomt(a) : this._bakgrunnVeg(a);
        if (!g) grunn = 'ingen geometri å tegne';
      } catch (e) {
        grunn = e.message;
      }
      if (g) ut.push(g);
      /* ET ANLEGG SOM IKKE KAN TEGNES SKAL DET SIES FRA OM.
         Uten dette ser et prosjekt med tre anlegg ut som et prosjekt med to,
         og det er ingenting på skjermen som skiller «finnes ikke» fra
         «mangler en kote». */
      else utelatt.push((a.navn || a.type) + ' – ' + grunn);
    }
    ut.utelatt = utelatt;
    /* ENDRET SETTET, MÅ BILDET RAMMES INN PÅ NYTT.
       Innrammingen dekker unionen av alt som tegnes. Sletter man naboen som
       lå åtte hundre meter unna, blir bildet ellers stående innrammet for en
       scene som ikke finnes lenger: det aktive anlegget blir en flekk, med
       dødt felt der naboen var. Samme feil motsatt vei når et anlegg kommer
       til. Denne kalles fra `tegn()` FØR innrammingsprøven, så det slår inn i
       det samme bildet. */
    if (this._andreNokkel != null) this._skalaSatt = false;
    this._andreNokkel = nokkel; this._andreBuffer = ut;
    return ut;
  },

  /**
   * Utstrekningen av ALT som skal tegnes, ikke bare det aktive anlegget.
   *
   * Brukes av `_kamera` til å sette avstanden til dreiepunktet. Boksen regnes
   * av de virkelige ytterpunktene, ikke av senter pluss diagonal: to anlegg som
   * ligger side om side har hver sin lille diagonal, men til sammen en stor.
   */
  _scenediagonal(g, andre) {
    if (!andre || !andre.length) return g.diagonal || 0;
    let minX = g.midtX - (g.diagonal || 0) / 2, maksX = g.midtX + (g.diagonal || 0) / 2;
    let minY = g.midtY - (g.diagonal || 0) / 2, maksY = g.midtY + (g.diagonal || 0) / 2;
    let lav = g.lav, hoy = g.hoy;
    for (const bg of andre) {
      if (!bg) continue;
      const r = (bg.diagonal || 0) / 2;
      minX = Math.min(minX, bg.midtX - r); maksX = Math.max(maksX, bg.midtX + r);
      minY = Math.min(minY, bg.midtY - r); maksY = Math.max(maksY, bg.midtY + r);
      lav = Math.min(lav, bg.lav); hoy = Math.max(hoy, bg.hoy);
    }
    /* HØYDEN TELLER MED, GANGET MED OVERDRIVNINGEN.
       Kameraet regner `z = (wz − z0) · overdriv`, og den z-en går inn i
       dybden med `sin(pitch)`. Et naboanlegg som ligger seksti meter høyere
       blir hundre og åtti med tredobbel overdrivning – mer enn nok til å
       skyve punktet bak øyet på en scene som er smal i planet. Uten dette
       leddet var avstanden riktig for kartet og gal for terrenget. */
    const dz = Math.max(0, (hoy - lav)) * (this.overdriv || 1);
    return Math.hypot(maksX - minX, maksY - minY) + dz;
  },

  /** Bufernøkkel: alt ved anlegget som endrer hvordan det ser ut i bakgrunnen. */
  _anleggsnokkel(a) {
    if (!a) return '';
    if (a.type === 'tomt') {
      const t = a.tomt || {};
      const n = t.nivaa || {};
      /* `punkt` MÅ med. I sluk-modus er hele flaten en kjegle rundt det
         punktet, og flytter man det uten at nøkkelen endrer seg, blir den
         gamle kjeglen stående til noe helt annet tilfeldigvis endrer nøkkelen
         – uten et ord om at bildet er foreldet. Det samme gjelder
         `omrissBetyr`: den avgjør om anlegget kan tegnes i det hele tatt. */
      const pk = n.punkt ? n.punkt.lat + ',' + n.punkt.lon : '';
      return a.id + ':t:' + (t.punkter || []).length + ':'
        + (t.punkter || []).map(p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6)).join(';')
        + ':' + n.modus + ':' + n.kote + ':' + n.fall + ':' + n.fallretning
        + ':' + pk + ':' + t.omrissBetyr + ':' + (a.navn || '');
    }
    /* `k` er kurvelengden i knekkpunktet og former lengdeprofilen. Uten den i
       nøkkelen står bakgrunnsvegen på gamle høyder etter en kurveendring. */
    return a.id + ':v:' + (a.ip || []).map(p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6) + ',' + p.r).join(';')
      + ':' + (a.vip || []).map(v => v.s.toFixed(2) + ',' + v.z.toFixed(3) + ',' + (v.k || '')).join(';')
      + ':' + ((a.mal && a.mal.vegbredde) || '') + ',' + ((a.mal && a.mal.tverrfall) || '')
      + ':' + (a.navn || '');
  },

  /**
   * Vegbanen til et annet anlegg, som et smalt gitter langs linjeføringen.
   *
   * Fem kolonner, ikke tre: med tre er flaten to trekanter på tvers, og lyset
   * – som regnes av kryssproduktet mellom nabokantene – får bare ett steg å
   * lese helningen av. Fem gir en flate man ser formen på.
   *
   * Tverrfallet tas rett fra malen, ikke fra `tverrfallVed`. Overstyringer per
   * stasjon og dosering i kurver hører til det anlegget man ARBEIDER med; her
   * er spørsmålet hvor vegen ligger, og en centimeter fall til eller fra
   * endrer ikke svaret.
   */
  _bakgrunnVeg(a) {
    const app = this.app;
    const ip = (a.ip || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (ip.length < 2) throw new Error('ingen senterlinje tegnet ennå');
    const linje = new Linjeforing(ip.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, app.sone);
      return { x: u.x, y: u.y, r: p.r || 0 };
    }));
    if (!linje.elementer || !linje.elementer.length || !(linje.lengde > 1)) {
      throw new Error('senterlinja er for kort til å tegne');
    }
    const vip = (a.vip || []).filter(v => Number.isFinite(v.s) && Number.isFinite(v.z));
    /* En nytegnet veg har tom `vip` til den er regnet én gang – og det skjer
       bare mens den er det aktive anlegget. Meldingen må si nettopp det, ikke
       bare at noe mangler. */
    if (vip.length < 2) throw new Error('ingen høydeprofil – åpne anlegget én gang så det regnes');
    const vp = new Vertikalprofil(vip);
    const mal = a.mal || {};
    const hb = Math.max(0.5, (mal.vegbredde || 4) / 2);
    const fall = Number.isFinite(mal.tverrfall) ? mal.tverrfall : 0.05;

    /* Steget følger lengden, ikke et fast tall: en veg på to kilometer skal
       ikke koste fem hundre rader i bakgrunnen. Taket på 400 rader er målt mot
       det samme budsjettet som hovedmodellen tegnes etter. */
    const steg = Math.max(2, Math.ceil(linje.lengde / 400));
    const nh = Math.max(2, Math.floor(linje.lengde / steg) + 1);
    const nb = 5;
    const n = nb * nh;
    /* Float64 for wx/wy. Nordkoordinaten er rundt 6 460 000, og der ligger
       nabotallene i float32 en halv meter fra hverandre – bredere enn halve
       vegen. Samme grunn som i hovedgitteret. */
    const wx = new Float64Array(n), wy = new Float64Array(n);
    const z = new Float32Array(n);
    const finnes = new Uint8Array(n);
    let lav = Infinity, hoy = -Infinity;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (let j = 0; j < nh; j++) {
      const s = Math.min(linje.lengde, j * steg);
      const zs = vp.hoyde(s);
      if (!Number.isFinite(zs)) continue;
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        const t = -hb + 2 * hb * (i / (nb - 1));
        const p = linje.punktMedAvvik(s, t);
        if (!p || !Number.isFinite(p.x)) continue;
        wx[k] = p.x; wy[k] = p.y;
        // taktverrfall: begge kanter ligger lavere enn senterlinja
        z[k] = zs - Math.abs(t) * fall;
        finnes[k] = 1;
        if (z[k] < lav) lav = z[k];
        if (z[k] > hoy) hoy = z[k];
        if (p.x < minX) minX = p.x; if (p.x > maksX) maksX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maksY) maksY = p.y;
      }
    }
    if (!Number.isFinite(lav)) return null;
    /* MERKET SKAL STÅ PÅ VEGEN, IKKE I MIDTEN AV BOKSEN RUNDT DEN.
       Midtpunktet i randboksen ligger utenfor en veg som svinger – på en
       L-formet trasé ligger det ikke i nærheten av asfalten, og navnet havner
       da svevende over noe helt annet. Midtstasjonen ligger alltid på vegen. */
    const sM = linje.lengde / 2;
    const pM = linje.punktVed(sM);
    const zM = vp.hoyde(sM);
    return {
      nb, nh, wx, wy, z, finnes, lav, hoy,
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      merke: (pM && Number.isFinite(pM.x) && Number.isFinite(zM))
        ? { x: pM.x, y: pM.y, z: zM } : null,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      navn: a.navn || 'Veg', type: 'veg', id: a.id
    };
  },

  /**
   * Den ferdige flaten til en annen tomt, som et rutenett over omrisset.
   *
   * `finnes` settes bare der noden ligger INNENFOR omrisset. Uten den ville
   * flaten blitt et rektangel, og et rektangel som ikke er tomta er verre enn
   * ingen tomt – man tror grensa går der.
   */
  _bakgrunnTomt(a) {
    const app = this.app;
    const t = a.tomt;
    if (!t || !t.punkter || t.punkter.length < 3) throw new Error('ingen tomt tegnet ennå');
    const niv = t.nivaa || {};
    if (!Number.isFinite(niv.kote)) throw new Error('ingen ferdig kote satt');
    /* ER OMRISSET YTTERGRENSA, ER DET IKKE TOMTA.
       Da er det tegnede polygonet inngrepsgrensa, og den ferdige flaten ligger
       INNENFOR – rykket inn så skråningsfoten lander nøyaktig i grensa.
       Innrykket regnes av `Tomtmasser.innerflate`, som krever terreng, og
       terrenget for et anlegg man ikke arbeider med er ikke lastet ned.
       Å fylle hele ytterkanten på ferdig kote ville tegnet en plattform som er
       for stor med hele skråningsutlegget – titalls meter i bratt terreng – og
       svaret på «treffer snuplassen vegen?» ville blitt feil.
       Kartet nekter på nøyaktig samme grunnlag: se `Kart.tegnTomtefarger`. */
    if (t.omrissBetyr === 'yttergrense') {
      throw new Error('omrisset er yttergrense – den ferdige flaten krever '
        + 'terreng, og det lastes bare for anlegget du arbeider med');
    }
    const p = app.tomtIUtm(t);
    if (p.length < 3) return null;
    const nivUtm = app.tomtenivaaIUtm(t);
    const tp = Tomt.tyngdepunkt(p);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (const q of p) {
      if (q.x < minX) minX = q.x; if (q.x > maksX) maksX = q.x;
      if (q.y < minY) minY = q.y; if (q.y > maksY) maksY = q.y;
    }
    const utstrekning = Math.max(maksX - minX, maksY - minY);
    if (!(utstrekning > 0.5)) return null;
    /* Ruta velges av utstrekningen, med tak på 120×120 noder. En tomt i
       bakgrunnen skal leses som en flate, ikke måles i. */
    const rute = Math.max(0.5, utstrekning / 120);
    const nb = Math.max(2, Math.round((maksX - minX) / rute) + 1);
    const nh = Math.max(2, Math.round((maksY - minY) / rute) + 1);
    const n = nb * nh;
    if (n > 2e5) return null;
    const wx = new Float64Array(n), wy = new Float64Array(n);
    const z = new Float32Array(n);
    const finnes = new Uint8Array(n);
    let lav = Infinity, hoy = -Infinity;
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        const x = minX + i * rute, y = minY + j * rute;
        wx[k] = x; wy[k] = y;
        if (!Tomt.innenfor(p, x, y)) continue;
        const zz = Tomtmasser.nivaaVed(nivUtm, x, y, tp);
        if (!Number.isFinite(zz)) continue;
        z[k] = zz; finnes[k] = 1;
        if (zz < lav) lav = zz;
        if (zz > hoy) hoy = zz;
      }
    }
    if (!Number.isFinite(lav)) return null;
    /* Tyngdepunktet ligger utenfor et konkavt omriss. Da faller merket tilbake
       på en node som FINNES – et punkt som beviselig er på flaten. */
    let merke = null;
    if (Tomt.innenfor(p, tp.x, tp.y)) {
      const zM = Tomtmasser.nivaaVed(nivUtm, tp.x, tp.y, tp);
      if (Number.isFinite(zM)) merke = { x: tp.x, y: tp.y, z: zM };
    }
    if (!merke) {
      for (let k = 0; k < n; k++) {
        if (finnes[k]) { merke = { x: wx[k], y: wy[k], z: z[k] }; break; }
      }
    }
    return {
      nb, nh, wx, wy, z, finnes, lav, hoy, rute, merke,
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      navn: a.navn || 'Tomt', type: 'tomt', id: a.id
    };
  },

  /**
   * Maler bakgrunnsanleggene inn i det samme bildet og det samme dybdebufferet.
   *
   * FØR hovedlagene, av to grunner. Dybdebufferet avgjør hva som vinner der de
   * overlapper, så rekkefølgen betyr ingenting for de ugjennomsiktige lagene –
   * men de GJENNOMSIKTIGE blander mot `_piksler` slik det står NÅ, og et
   * halvgjennomsiktig lag som blander mot bakgrunnsfargen der en nabotomt
   * ligger, ville malt tomta bort.
   *
   * `id`-bufferet får null. Det er museoppslaget: peker det på en celle i et
   * bakgrunnsgitter, ville avlesningen svart med tall fra et anlegg man ikke
   * arbeider med – og de tallene finnes ikke, for flaten er ikke regnet.
   */
  /**
   * Én fargeskala for HELE bildet, ikke én per anlegg.
   *
   * Fargen på en celle er `sqrt(|d| / g.maksAvvik)`, og `maksAvvik` regnes per
   * anlegg. Står tre anlegg i samme bilde, betyr da den samme rødtonen tre
   * ulike dybder – en to meters skjæring på naboen ser like dyp ut som en fem
   * meters på din egen. Det er nøyaktig den slags to tall som heter det samme
   * og betyr noe forskjellig som resten av programmet nekter å vise.
   *
   * Prisen er sagt: slår man på naboene, kan ens eget anlegg bli blekere fordi
   * naboen graver dypere. Det er riktig – det er da den blekere fargen betyr.
   */
  _felleskala(g, gitre) {
    let maks = g ? (g.maksAvvik || 0) : 0;
    for (const bg of (gitre || [])) {
      if (bg && bg.full && bg.maksAvvik > maks) maks = bg.maksAvvik;
    }
    return maks > 0 ? maks : null;
  },

  /**
   * Samme farge, lavere stemme.
   *
   * Naboanleggene skal leses som kontekst, ikke som noe man arbeider med.
   *
   * DET ER METNINGEN SOM DEMPES, IKKE LYSSTYRKEN. Første utgave blandet
   * naboens farge mot bakgrunnsfargen, og det gikk galt på tre måter, alle
   * målt:
   *
   *  – Terrenget er ÉN sammenhengende bakke, delt mellom anleggene bare av
   *    hvem som rakk å tegne den først (se `_dekningsprove`). Dempet man den
   *    som «naboens», gikk den samme bakken fra 142 til 83 tvers over ei linje
   *    som ikke betyr noe i landskapet. Det var nøyaktig den sømmen masken ble
   *    laget for å fjerne, tilbake som et fargesprang.
   *  – I bakkemodus males bakgrunnen om: himmel over horisonten, fjern bakke
   *    under. Under horisonten – der naboene ligger – står bakgrunnen på ca.
   *    (106,106,113), mens `flateRgb` er (11,11,12). Naboen ble altså MØRKERE
   *    enn det han skulle forsvinne inn i, og stakk mer fram, ikke mindre.
   *  – Lyset holdes med vilje i 0,55–1,00 (se `_lys`), fordi et videre spenn
   *    gjør at man ser fargen men ikke formen. Å gange hele bildet med 0,55
   *    presset naboens lys/skygge ned i 0,25 – under det som trengs for å se
   *    en skråning i det hele tatt.
   *
   * Med metning i stedet: gråtoner står helt urørt, så terrenget har ingen søm
   * og formen er nøyaktig like tydelig som før. Det er bare KULØREN som
   * svekkes – naboens skjæring er rødlig der din er rød – og det er akkurat
   * den forskjellen øyet trenger for å se hvilket anlegg som er ens eget.
   *
   * 0,40 er målt fram: ved 0,65 kunne man fortsatt ta feil, ved 0,20 var
   * naboens skjæring ikke lenger til å skille fra fylling. Merk at det er en
   * KANALfaktor, ikke en metningsfaktor: fordi gråpunktet er luma og ikke
   * maksimalkanalen, faller den målte metningen med 0,47 til 0,62 alt etter
   * fargen – fjell 0,51, skjæring 0,62, fylling 0,47.
   */
  METNING: 0.40,

  /**
   * … men metning alene hjelper ikke på en flate som er grå fra før.
   *
   * Målt metning på de fargene programmet faktisk bruker: skjæring 0,86,
   * fylling 0,68, fjell 0,53 – og så vegbanen på 0,10 og bærelaget på 0,06.
   * De to siste endret seg med FIRE nivåer av 255 under metningsdempingen,
   * altså ikke i det hele tatt. Og det er nettopp de to som er selve
   * leveransen: en nabovegs ferdige vegbane var ikke til å skille fra ens
   * egen.
   *
   * Lysdempingen er MULTIPLIKATIV, og det er hele poenget. Lyset holdes i
   * 0,55–1,00, og et ledd som TREKKER FRA – slik den første utgaven gjorde da
   * den blandet mot bakgrunnen – klemmer det spennet sammen og tar bort
   * formen. En faktor endrer ikke forholdet mellom lys og skygge i det hele
   * tatt; den senker bare nivået. Naboens skråninger er like lesbare som før,
   * bare mørkere.
   */
  LYSDEMPING: 0.80,

  /**
   * Hvor grovt et NABOANLEGG av typen tomt regnes ut i bakgrunnen.
   *
   * Multipliseres med anleggets egen rutestørrelse. En veg står alltid på 1 –
   * den er en korridor, og gitteret er lite uansett. En tomt er et areal, og
   * med kontekstringen rundt blir den fort tre ganger så stor som vegen.
   *
   * Sto på 2, og det SÅ man: med 3,2 piksler per meter ble naboens celler
   * trappetrinn på seks og en halv piksel langs hver skråningskant, mens ens
   * eget anlegg ved siden av var glatt. To ulike oppløsninger i samme bilde
   * leses ikke som «den ene er grovere», men som «noe er galt med den ene».
   *
   * Prisen var 20,0 → 35,8 ms per bilde da den ble satt ned, og det var for
   * dyrt. Den er betalt inn igjen andre steder: dekningsmasken bygges ikke
   * lenger for hvert bilde (`_terrengmasker`), og de gjennomsiktige lagene
   * blander bare der de kan treffe (`_skjermboks`). Målt etter begge:
   * 26,7 ms med 60 000 nabonoder, mot 43,6 ms før noe av dette.
   */
  NABOSTEG: 1,

  /**
   * Hvor fint dekningsmasken deler den felles bakken mellom anleggene.
   *
   * DETTE ER «DE RARE RUTENE». Masken avgjør hvem av anleggene som tegner
   * hvilken del av terrenget, og oppslaget er nærmeste rute – så kanten mellom
   * to anleggs terreng blir kvantisert til rutestørrelsen. Sto på 2 m, og med
   * sju piksler per meter ble det fjorten piksler høye trappetrinn langs hver
   * eneste skråningsfot: et sagtannmønster som ikke finnes i landskapet, og
   * som er det første man ser på bildet.
   *
   * Prisen er kvadratisk i oppløsningen, og var derfor uoverkommelig så lenge
   * masken ble bygd for hvert bilde: målt på brukerens prosjekt kostet et
   * bilde 33,5 ms ved 2 m og 47,4 ms ved 0,25 m. Etter at den ble mellomlagret
   * – se `_terrengmasker` – er tallet 26,7 til 27,5 ms for HELE spennet fra
   * 2 m til 0,25 m. Oppløsningen er da et rent spørsmål om hvor fin kanten
   * skal være, og 0,5 m er under én piksel på vanlig avstand.
   */
  DEKNINGSRUTE: 0.5,

  _dempet(farge) {
    const k = this.METNING, ly = this.LYSDEMPING;
    return (k00, k10, k01, k11, z) => {
      const f = farge(k00, k10, k01, k11, z);
      /* 0 betyr «tegn ingenting» i `_raster`, ikke «svart». Det må komme
         uendret gjennom, ellers får hver node uten flate en firkant. */
      if (f === 0) return 0;
      const r = f & 255, g = (f >> 8) & 255, b = (f >> 16) & 255;
      // samme vekting som øyet bruker, så gråtonen holder forholdene
      const gr = 0.299 * r + 0.587 * g + 0.114 * b;
      const r2 = ((gr + (r - gr) * k) * ly + 0.5) | 0;
      const g2 = ((gr + (g - gr) * k) * ly + 0.5) | 0;
      const b2 = ((gr + (b - gr) * k) * ly + 0.5) | 0;
      return (255 << 24) | (b2 << 16) | (g2 << 8) | r2;
    };
  },

  /**
   * Samme demping, men bare der anlegget faktisk har rørt bakken.
   *
   * I «før» og «etter» er hele modellen ÉN flate: terreng der ingen har gjort
   * noe, arbeid der noen har. De to halvdelene skal behandles ulikt – bakken
   * er felles med naboen og må stå urørt, arbeidet er hans og skal dempes –
   * og skillet er kjent per node.
   */
  _dempetDer(farge, bygd) {
    const dempa = this._dempet(farge);
    return (k00, k10, k01, k11, z) => (bygd[k00]
      ? dempa(k00, k10, k01, k11, z)
      : farge(k00, k10, k01, k11, z));
  },

  /**
   * Den delen av skjermen et gitter i det hele tatt kan treffe.
   *
   * ET GJENNOMSIKTIG LAG KOSTET FEM FULLSKJERMSLØYFER, UANSETT HVOR LITE DET VAR.
   * `_lag2.fill(0)`, `_dyp2.fill(Infinity)` og blandingsløkka går alle over hele
   * lerretet – 914 634 piksler her – og de kjøres én gang PER gjennomsiktig lag.
   * Med tre anlegg i bildet ble det 2,7 millioner elementoperasjoner som ikke
   * gjorde noe: målt 17,9 ms av 43,6, altså mer enn en tredel av tiden, brukt
   * utenfor selve tegningen.
   *
   * Boksen regnes av de åtte hjørnene i gitterets omsluttende volum. Den er et
   * OVERSLAG – den dekker alt laget kan treffe, og litt til – og det er den
   * riktige feilretningen: for stor boks koster litt tid, for liten ville latt
   * piksler stå igjen fra forrige lag.
   */
  _skjermboks(g, hoyde, kam, rb, rh, krev) {
    const heile = { x0: 0, y0: 0, x1: rb - 1, y1: rh - 1 };
    if (!g || !g.wx || !g.finnes) return heile;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    let lav = Infinity, hoy = -Infinity;
    const n = g.nb * g.nh;
    for (let k = 0; k < n; k++) {
      if (!g.finnes[k]) continue;
      /* HØYDESPENNET MÅ TAS DER LAGET FAKTISK FINNES.
         `zFerdig` er allokert til null og fylles bare inne i masken – utenfor,
         i hele kontekstringen, står den på 0. Leste man spennet over alle
         nodene, ble det 0–140 i stedet for 139–141 på en tomt på kote 140, og
         med tredobbel overdrivning 420 meter høy boks. Da havnet z=0-hjørnene
         bak nærplanet, boksen ble hele skjermen, og nettopp overbygningen –
         det ene laget som ER gjennomsiktig – fikk ingen innsparing. */
      if (krev && !krev[k]) continue;
      if (g.wx[k] < minX) minX = g.wx[k];
      if (g.wx[k] > maksX) maksX = g.wx[k];
      if (g.wy[k] < minY) minY = g.wy[k];
      if (g.wy[k] > maksY) maksY = g.wy[k];
      const z = hoyde[k];
      if (Number.isFinite(z)) { if (z < lav) lav = z; if (z > hoy) hoy = z; }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(lav)) return heile;
    const naer = kam.naer || 1e-6;
    let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
    for (const x of [minX, maksX]) {
      for (const y of [minY, maksY]) {
        for (const z of [lav, hoy]) {
          const q = kam.punkt(x, y, z);
          /* Krysser volumet øyeplanet, er projeksjonen ikke lenger begrenset av
             hjørnene, og et overslag er ikke lenger et overslag. */
          if (!(q.w > naer)) return heile;
          if (q.px < px0) px0 = q.px;
          if (q.px > px1) px1 = q.px;
          if (q.py < py0) py0 = q.py;
          if (q.py > py1) py1 = q.py;
        }
      }
    }
    const x0 = Math.max(0, Math.floor(px0) - 1), x1 = Math.min(rb - 1, Math.ceil(px1) + 1);
    const y0 = Math.max(0, Math.floor(py0) - 1), y1 = Math.min(rh - 1, Math.ceil(py1) + 1);
    if (x0 > x1 || y0 > y1) return { x0: 0, y0: 0, x1: -1, y1: -1 };   // utenfor bildet
    return { x0, y0, x1, y1 };
  },

  /** Nullstiller de to skrapebufferne, men bare i den delen som skal brukes. */
  _toemBoks(boks, rb) {
    for (let y = boks.y0; y <= boks.y1; y++) {
      const a = y * rb + boks.x0, b = y * rb + boks.x1 + 1;
      this._lag2.fill(0, a, b);
      this._dyp2.fill(Infinity, a, b);
    }
  },

  /** To masker samtidig – begge må være sanne. */
  _ogsaa(a, b) {
    const ut = new Uint8Array(Math.min(a.length, b.length));
    for (let i = 0; i < ut.length; i++) ut[i] = (a[i] && b[i]) ? 1 : 0;
    return ut;
  },

  /**
   * «Er denne bakken alt tegnet av anlegget jeg står i?»
   *
   * Gitteret til en veg følger senterlinjen og er ikke et rutenett man kan slå
   * opp i. Første forsøk brukte `Linjeforing.projiser`, som gjør et søk i to
   * tusen steg – ganget med elleve tusen noder i nabogitteret blir det
   * tjuetre millioner punktberegninger per bilde.
   * Her males dekningen i stedet inn i et grovt rutenett ÉN gang, og da er
   * oppslaget ett regnestykke for begge formene. Rutenettet henges på gitteret
   * og følger det, så det bygges bare når gitteret gjør det.
   */
  _dekningsprove(g, alle) {
    if (!g || !g.wx || !g.finnes) return null;
    /* RUTENETTET MÅ DEKKE HELE SCENEN, IKKE BARE DET AKTIVE ANLEGGET.
       Første utgave rammet bare det aktive inn, og da fanget den ikke det
       naboene gjør mot HVERANDRE. Står man i en smal veg mellom to tomter,
       er det nettopp de to tomtene som dekker samme bakken – og kamuflasjen
       sto igjen der, selv om den var borte rundt vegen. */
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    const bok = gg => {
      const n2 = gg.nb * gg.nh;
      for (let k = 0; k < n2; k++) {
        if (!gg.finnes[k]) continue;
        if (gg.wx[k] < minX) minX = gg.wx[k];
        if (gg.wx[k] > maksX) maksX = gg.wx[k];
        if (gg.wy[k] < minY) minY = gg.wy[k];
        if (gg.wy[k] > maksY) maksY = gg.wy[k];
      }
    };
    bok(g);
    for (const bg of (alle || [])) if (bg && bg.wx) bok(bg);
    if (!Number.isFinite(minX)) return null;
    /* GROVERE ER UENDELIG MYE BEDRE ENN INGENTING.
       Rutenettet spenner over HELE scenen, kontekstringene med, og celletallet
       er kvadratisk i oppløsningen. Med 0,5 m rekker taket på fire millioner
       bare en scene på tusen ganger tusen meter – og en to kilometers veg med
       en tomt ved siden av er 2000 × 500. Sto det bare en `return null` her,
       forsvant HELE delingen på nettopp de store anleggene: hvert naboanlegg
       tegnet terrenget sitt om igjen, kamuflasjemønsteret var tilbake, og
       ingenting sa fra. Ruta grovnes derfor i stedet, akkurat nok til å komme
       under taket. Kanten blir litt mer trappet på et digert anlegg; den
       finnes i det minste. */
    const TAK = 4e6;
    const bredde = Math.max(1, maksX - minX), hogd = Math.max(1, maksY - minY);
    let rute = Tegner3d.DEKNINGSRUTE;
    const trengs = (bredde / rute + 2) * (hogd / rute + 2);
    if (trengs > TAK) rute = Math.sqrt((bredde * hogd) / TAK) * 1.05;
    const nb = Math.max(2, Math.ceil(bredde / rute) + 1);
    const nh = Math.max(2, Math.ceil(hogd / rute) + 1);
    if (nb * nh > TAK) return null;                 // skal ikke kunne skje
    const har = new Uint8Array(nb * nh);
    /* Firkantene males inn, ikke bare hjørnene: med bare hjørnene ville vegen
       fått hull hver femte meter, og naboen hadde tegnet terreng i dem. */
    const fyll = (ax, ay, bx, by, cx, cy) => {
      const iL = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / rute));
      const iH = Math.min(nb - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / rute));
      const jL = Math.max(0, Math.floor((Math.min(ay, by, cy) - minY) / rute));
      const jH = Math.min(nh - 1, Math.ceil((Math.max(ay, by, cy) - minY) / rute));
      const omr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(omr) < 1e-12) return;
      const inv = 1 / omr;
      for (let j = jL; j <= jH; j++) {
        const py = minY + j * rute;
        for (let i = iL; i <= iH; i++) {
          const px = minX + i * rute;
          const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * inv;
          const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * inv;
          const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * inv;
          if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
          har[j * nb + i] = 1;
        }
      }
    };
    for (let j = 0; j < g.nh - 1; j++) {
      for (let i = 0; i < g.nb - 1; i++) {
        const k00 = j * g.nb + i, k10 = k00 + 1, k01 = k00 + g.nb, k11 = k01 + 1;
        if (!g.finnes[k00] || !g.finnes[k10] || !g.finnes[k01] || !g.finnes[k11]) continue;
        fyll(g.wx[k00], g.wy[k00], g.wx[k10], g.wy[k10], g.wx[k11], g.wy[k11]);
        fyll(g.wx[k00], g.wy[k00], g.wx[k11], g.wy[k11], g.wx[k01], g.wy[k01]);
      }
    }
    /* KRYMP MASKEN MED ÉN RUTE.
       Uten det ble det en søm: en rute som er DELVIS dekt teller som dekt, så
       naboen hoppet over hele den ruta – og der sto det en to meter bred svart
       stripe mellom de to terrengene. Krympet mask lar naboen tegne to meter
       inn under det som alt er tegnet. Det som kom først ligger der allerede,
       så overlappen er en søm man ikke ser, mens glipa var en man så. */
    const krymp = () => {
      const ut = new Uint8Array(har.length);
      for (let j = 0; j < nh; j++) {
        for (let i = 0; i < nb; i++) {
          const k = j * nb + i;
          if (!har[k]) continue;
          ut[k] = (i > 0 && j > 0 && i < nb - 1 && j < nh - 1
            && har[k - 1] && har[k + 1] && har[k - nb] && har[k + nb]) ? 1 : 0;
        }
      }
      return ut;
    };
    let krympa = krymp();
    return {
      /** Er denne bakken alt tegnet av noe? */
      prov(x, y) {
        const i = Math.round((x - minX) / rute), j = Math.round((y - minY) / rute);
        if (i < 0 || j < 0 || i >= nb || j >= nh) return false;
        return !!krympa[j * nb + i];
      },
      /**
       * Legger et gitter til i det som er dekt.
       *
       * DEKNINGEN MÅ VOKSE MENS SCENEN TEGNES. Første utgave sammenlignet bare
       * mot det AKTIVE anlegget, og fanget dermed ikke det naboene gjør mot
       * HVERANDRE. Står man i en smal veg mellom to tomter, er det nettopp de
       * to tomtene som dekker den samme bakken – og rutemønsteret sto igjen
       * der, selv om det var borte rundt vegen.
       */
      leggTil(gg) {
        if (!gg || !gg.wx || !gg.finnes) return;
        for (let j = 0; j < gg.nh - 1; j++) {
          for (let i = 0; i < gg.nb - 1; i++) {
            const k00 = j * gg.nb + i, k10 = k00 + 1, k01 = k00 + gg.nb, k11 = k01 + 1;
            if (!gg.finnes[k00] || !gg.finnes[k10] || !gg.finnes[k01] || !gg.finnes[k11]) continue;
            fyll(gg.wx[k00], gg.wy[k00], gg.wx[k10], gg.wy[k10], gg.wx[k11], gg.wy[k11]);
            fyll(gg.wx[k00], gg.wy[k00], gg.wx[k11], gg.wy[k11], gg.wx[k01], gg.wy[k01]);
          }
        }
        krympa = krymp();
      }
    };
  },

  /**
   * Hvilken del av bakken hvert naboanlegg skal tegne.
   *
   * MASKEN HAR INGENTING MED KAMERAET Å GJØRE, og ble likevel bygd på nytt for
   * hvert eneste bilde – hele rutenettet malt opp, og deretter ett oppslag per
   * node i hvert nabogitter, seksti tusen ganger i sekundet mens man dro i
   * modellen. Den avhenger bare av gitrene, og de skifter når man regner om,
   * ikke når man dreier.
   *
   * Rekkefølgen er en del av svaret: dekningen VOKSER mens scenen bygges, så
   * hvert anlegg får bare bakken de foregående ikke tok. Derfor kan ikke det
   * ferdige `dekning`-objektet mellomlagres – det ville stått fullt utvokst
   * ved neste bilde, og da hadde det første naboanlegget ikke tegnet terreng
   * i det hele tatt. Det som lagres, er den ferdige masken per gitter.
   */
  /**
   * Bakgrunnen er et annet sett nå – slipp både gitrene og maskene deres.
   *
   * De to hører sammen og må slippes sammen. Maskene nøkles på gitteridentitet
   * og kan derfor ikke bli FEIL av at de blir liggende – men de holder liv i
   * hele forrige prosjekts gitre, ett `Uint8Array` per nabo, og det gjør de
   * nettopp der `klargjorProsjekt` med vilje slipper alt annet. Verst er
   * «vis andre av»: da leverer `_bakgrunnsgitre` en tom liste, `_tegnBakgrunn`
   * går ut med en gang, og ingenting overskriver bufferet igjen.
   *
   * `_andreBuffer` og `_andreNa` MÅ med. Å nulle nøkkelen alene gjør at
   * bufferet aldri blir LEST – men gitrene ligger der like fullt, og de er
   * store: 46 byte per node, 8,4 MB for en tomt på 1 m ruter. Åpner man et
   * prosjekt med ett anlegg etter å ha stått i ett med tre, går
   * `_bakgrunnsgitre` ut med det samme ved hvert bilde og overskriver aldri
   * bufferet – da blir det forrige prosjektet liggende resten av økta.
   */
  glemBakgrunn() {
    this._andreNokkel = null;
    this._andreBuffer = null;
    this._andreNa = null;
    this._maskeBuffer = null;
  },

  _terrengmasker(g, gitre) {
    const b = this._maskeBuffer;
    if (b && b.g === g && b.gitre.length === gitre.length
      && b.gitre.every((x, i) => x === gitre[i])) return b.masker;
    const dekning = this._dekningsprove(g, gitre);
    const masker = new Map();
    for (const bg of gitre) {
      if (!(bg.full && bg.eier)) continue;
      if (dekning && bg.wx) {
        const n2 = bg.nb * bg.nh;
        const krev = new Uint8Array(n2);
        for (let k = 0; k < n2; k++) {
          if (!bg.finnes[k]) continue;
          krev[k] = dekning.prov(bg.wx[k], bg.wy[k]) ? 0 : 1;
        }
        /* FIREHJØRNESREGELEN SPISER EN CELLE TIL.
           Masken er krympet én dekningsrute, altså en halv meter, og det er
           nok til at overlappen dekker selve sømmen. Men `_raster` tegner en
           celle bare når ALLE FIRE hjørnene har `krev` – så naboen begynner i
           praksis en hel NABOCELLE lenger ute enn masken sier. Er naboens
           kontekstkolonner fem meter, står det da en fire og en halv meter
           bred stripe langs hele sømmen der verken det aktive anlegget eller
           naboen tegner bakke: ren bakgrunn tvers gjennom landskapet.
           Koden kjenner mekanismen fra før – helflaten i `tegn()` dropper
           `krev` nettopp fordi regelen «lar en celle bred søm stå utegnet» –
           men masken her la den tilbake uten å ta høyde for det. Én utvidelse
           i naboens EGET rutenett gir den cella alle fire hjørnene, og
           overlappen legger seg under noe som alt er tegnet. */
        const vid = new Uint8Array(n2);
        for (let j = 0; j < bg.nh; j++) {
          for (let i = 0; i < bg.nb; i++) {
            const k = j * bg.nb + i;
            vid[k] = (krev[k] || (i > 0 && krev[k - 1])
              || (i < bg.nb - 1 && krev[k + 1])
              || (j > 0 && krev[k - bg.nb])
              || (j < bg.nh - 1 && krev[k + bg.nb])) ? 1 : 0;
          }
        }
        masker.set(bg, vid);
      }
      if (dekning) dekning.leggTil(bg);
    }
    this._maskeBuffer = { g, gitre: gitre.slice(), masker };
    return masker;
  },

  /* `g` er det AKTIVE gitteret, ikke `_sisteGitter`. Her sto den forrige
     rundens gitter, og masken ble derfor bygd mot bakken slik den lå FØR
     byttet: ett bilde med feil deling hver gang man skiftet anlegg, og på
     første bilde ingen deling i det hele tatt. */
  _tegnBakgrunn(g, gitre, rb, rh, kam, pal) {
    if (!gitre || !gitre.length) return;
    const rgb = Farger.annetAnleggRgb;
    /* Dekningen bygges én gang for hele scenen og VOKSER mens den tegnes: hvert
       anlegg legger sin egen bakke til, så det neste ikke tegner den om igjen.
       Se `_terrengmasker` – regnestykket henger på gitrene, ikke på bildet. */
    const masker = this._terrengmasker(g, gitre);
    for (const bg of gitre) {
      if (bg.full && bg.eier) {
        this._tegnFulltAnlegg(bg, rb, rh, kam, pal, masker.get(bg) || null);
        continue;
      }
      const farge = (k00, k10, k01, k11, zz) => {
        const ly = this._lys(bg, k00, k10, k01, zz, kam);
        const r = Math.min(255, rgb[0] * ly), g2 = Math.min(255, rgb[1] * ly);
        const b2 = Math.min(255, rgb[2] * ly);
        return (255 << 24) | (b2 << 16) | (g2 << 8) | r;
      };
      this._raster(bg, bg.z, farge, this._piksler, this._dyp, null, rb, rh, kam, null);
    }
  },

  /**
   * Et naboanlegg med full detalj: samme lag, samme farger som det får selv.
   *
   * BILDET ER ETT, OG DA MÅ VISNINGEN VÆRE DET.
   * `_flateHoyde` og `_lagliste` leser `this.visning`, `this.lag` og
   * `this.fyldig` på EIEREN – Veg3d for et veganlegg, Tomt3d for en tomt. Står
   * man i tomta og slår om til «Etter», ville nabovegen blitt stående i
   * arbeidsbildet med massefarger: to ulike svar i samme bilde, uten noe som
   * sier at de er ulike. Derfor låner eieren det aktive bildets innstillinger
   * mens han tegner, og får sine egne tilbake straks etterpå.
   *
   * Lagbryterne som betyr det samme begge steder – terreng, grav, fjell,
   * rutenett, fyldig – lånes med. `vegbane` og `overbygning` gjør det ikke:
   * de finnes bare hos den ene, og en tomt har ingen vegbane å slå av.
   */
  _tegnFulltAnlegg(bg, rb, rh, kam, pal, krevTerreng) {
    const eier = bg.eier;
    const g = bg;
    const foer = {
      visning: eier.visning, fyldig: eier.fyldig, kamNa: eier._kamNa,
      lag: eier.lag
    };
    eier.visning = this.visning;
    eier.fyldig = this.fyldig;
    eier._kamNa = kam;
    eier.lag = Object.assign({}, eier.lag);
    /* `terreng` sto ikke her, tross det som står over. Slo man da av terrenget
       på sitt eget anlegg, tegnet naboen det likevel – og siden terrenget er
       unntatt fra dempingen, sto naboens bakke i FULL styrke mens man selv
       ikke viste noen. */
    for (const felt of ['terreng', 'grav', 'fjell', 'rutenett']) {
      if (felt in this.lag) eier.lag[felt] = this.lag[felt];
    }
    /* TERRENGET ER ÉN FLATE, OG SKAL TEGNES ÉN GANG.
       Hvert anlegg bærer sin egen kontekstring, og de ringene dekker den samme
       bakken – her målt til 91 av 149 meter mellom to nabotomter. To flater i
       nøyaktig samme høyde, med hver sin triangulering, slåss om dybden piksel
       for piksel: resultatet var et kamuflasjemønster over hele terrenget.
       Målt: 0,54 % skarpe fargesprang uten naboer, 7,3 % med to, 1,3 % etter.

       Men det holder ikke å slå naboens terreng AV: da henger arbeidet hans i
       lufta der det aktive anlegget ikke rekker. Naboen tegner derfor terreng
       bare UTENFOR det som alt er dekt – én sammenhengende bakke, uten at noe
       sted får to. Masken kommer ferdig inn – se `_terrengmasker`. */
    this._krevTerreng = krevTerreng || null;
    try {
      const lagene0 = this.visning === 'vanlig'
        ? eier._lagliste(g, pal)
        : [{
          hoyde: eier._flateHoyde(g), blanding: 0,
          farge: (k00, k10, k01, k11, z) => {
            const c = Farger.terrengFlateRgb;
            const ly = eier._lys(g, k00, k10, k01, z, kam);
            const r = Math.min(255, c[0] * ly), gg = Math.min(255, c[1] * ly);
            const bl = Math.min(255, c[2] * ly);
            return (255 << 24) | (bl << 16) | (gg << 8) | r;
          }
        }];
      /* HVOR ANLEGGET FAKTISK HAR RØRT BAKKEN.
         Utenfor dette er flaten – uansett visning – dagens terreng, og altså
         felles med naboen. */
      const bygd = g.harGrav || g.harVeg || g.harFerdig || null;
      for (const lag0 of lagene0) {
        if (!lag0 || !lag0.hoyde) continue;
        /* Terrenglaget kjennes på at det ligger på `zT`.
           I «før» og «etter» finnes det ikke noe eget terrenglag: hele
           laglista er ÉN flate, og den er terreng der anlegget ikke har rørt
           noe og arbeid der det har. Sto testen bare på `zT`, var hele
           delingen koblet ut i de to visningene – naboen tegnet ugjennomsiktig
           over den samme bakken som det aktive anlegget, og kamuflasjen var
           tilbake. `_flateHoyde` i «før» ER `zT`, så det er «etter» som
           trengte dette. */
        const heilflate = this.visning !== 'vanlig';
        const erTerreng = lag0.hoyde === g.zT;
        let krev = lag0.krev;
        if (this._krevTerreng && erTerreng) {
          krev = lag0.krev ? this._ogsaa(lag0.krev, this._krevTerreng) : this._krevTerreng;
        } else if (this._krevTerreng && heilflate && bygd) {
          krev = new Uint8Array(bygd.length);
          for (let k = 0; k < krev.length; k++) {
            krev[k] = bygd[k] ? 1 : this._krevTerreng[k];
          }
        }
        /* NABOEN SKAL SES, IKKE FORVEKSLES MED DITT EGET.
           Med full detalj ser alle anleggene like ut, og da mister man hvilket
           av dem man faktisk arbeider med – tre like røde flater ved siden av
           hverandre, uten noe som sier hvilken som er din. Naboens ARBEID
           dempes derfor: samme kulør, samme form, svakere metning. Se
           `_dempet`.
           TERRENGET ER UNNTATT, og det er ikke en detalj: bakken er felles og
           delt mellom anleggene bare av hvem som rakk å tegne den. Dempet man
           den halvparten naboen tegnet, sto det et fargesprang tvers over ei
           linje som ikke finnes i landskapet.
           I «etter» er flaten både bakke og arbeid, og da dempes den bare der
           anlegget har rørt noe – se `_dempetDer`.
           REKKEFØLGEN ER IKKE LIKEGYLDIG. `erTerreng` må prøves FØRST, slik
           `krev`-valget rett over alt gjør. I «før» er `_flateHoyde(g)` nettopp
           `g.zT` – samme tabell, samme referanse – så begge grenene er sanne
           samtidig. Sto helflate-grenen først, ble naboens fotavtrykk malt en
           femtedel mørkere enn den identiske, urørte bakken rundt: 130 mot 104
           i mørkt tema, en ren skyggekant langs en linje som ikke finnes i
           landskapet. Og «før» er nettopp bildet der INGEN har gjort noe ennå.
           `krev` legges på kopien òg, ikke bare i den lokale variabelen: to
           `krev` med ulik verdi i samme funksjon er en felle for den neste
           som leser koden. */
        const dempFarge = !lag0.farge ? null
          : erTerreng ? null
            : (heilflate && bygd ? this._dempetDer(lag0.farge, bygd)
              : this._dempet(lag0.farge));
        const lag = dempFarge
          ? Object.assign({}, lag0, { farge: dempFarge, krev })
          : (krev === lag0.krev ? lag0 : Object.assign({}, lag0, { krev }));
        if (!(lag.blanding > 0)) {
          /* `id` er alltid null for et naboanlegg: museavlesningen skal svare
             om det man ARBEIDER med, ikke om noe man bare ser. */
          this._raster(g, lag.hoyde, lag.farge, this._piksler, this._dyp, null,
            rb, rh, kam, krev);
          continue;
        }
        const boks = this._skjermboks(g, lag.hoyde, kam, rb, rh, krev);
        if (boks.x1 < boks.x0) continue;                 // helt utenfor bildet
        this._toemBoks(boks, rb);
        this._raster(g, lag.hoyde, lag.farge, this._lag2, this._dyp2, null, rb, rh, kam, krev);
        const styrke = lag.blanding;
        const p = this._piksler, d1 = this._dyp, d2 = this._dyp2, l2 = this._lag2;
        for (let y = boks.y0; y <= boks.y1; y++) {
          for (let x = boks.x0; x <= boks.x1; x++) {
            const i = y * rb + x;
          if (!l2[i]) continue;
          if (d2[i] > d1[i]) continue;
          const s = l2[i], u = p[i];
          const r = ((s & 255) * styrke + (u & 255) * (1 - styrke)) | 0;
          const gg = (((s >> 8) & 255) * styrke + ((u >> 8) & 255) * (1 - styrke)) | 0;
          const bl = (((s >> 16) & 255) * styrke + ((u >> 16) & 255) * (1 - styrke)) | 0;
          p[i] = (255 << 24) | (bl << 16) | (gg << 8) | r;
          /* ET GJENNOMSIKTIG LAG PÅ ET NABOANLEGG MÅ LIKEVEL SETTE DYBDE.
             I arbeidsbildet gjør det ikke det, og det er riktig der: terrenget
             ligger halvgjennomsiktig oppå ens EGEN graveflate, og skal ikke
             skygge for den.
             Mellom to anlegg er det motsatt. I hele kontekstringen rundt en
             nabo – tretti meter ut fra vegens fot, førti rundt en tomt – er
             terrenget det ENESTE laget, og det er gjennomsiktig. Uten denne
             linja sto `_dyp` på uendelig der, og det aktive anleggets flater
             besto dybdeprøven og ble malt rett over en nabo som ligger tre
             hundre meter nærmere kameraet. */
            if (d2[i] < d1[i]) d1[i] = d2[i];
          }
        }
      }
    } finally {
      eier.visning = foer.visning;
      eier.fyldig = foer.fyldig;
      eier._kamNa = foer.kamNa;
      eier.lag = foer.lag;
    }
  },

  /**
   * Slår «de andre anleggene» av og på i BEGGE visningene på én gang.
   *
   * Lagbryterne ellers hører til sin egen visning – slår man av terrenget på
   * vegen, skal det stå på i tomta. Denne er ikke et lag i modellen, den er et
   * spørsmål om hva SCENEN skal inneholde, og det svaret følger deg når du
   * bytter mellom vegen og tomta. Sto den per visning, måtte man slå den på to
   * ganger for å få den samme utsikten.
   */
  settVisAndre(pa) {
    for (const vis of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null]) {
      if (!vis || !vis.lag) continue;
      vis.lag.andre = !!pa;
      vis.glemBakgrunn();
      vis._skalaSatt = false;                 // innrammingen dekker nå noe annet
    }
    this.visAndreknapp();
    for (const vis of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null]) {
      if (vis && vis.aktiv) vis.tegn();
    }
  },

  /**
   * Knappen skal stå framme når den betyr noe, og være borte når den ikke gjør det.
   *
   * Med ett anlegg finnes det ingen andre å vise, og en knapp som ikke kan
   * gjøre noe er verre enn ingen knapp: man trykker på den, ingenting skjer,
   * og så stoler man ikke på den neste gang heller.
   */
  visAndreknapp() {
    const app = this.app || (typeof App !== 'undefined' ? App : null);
    const antall = (app && app.P && Array.isArray(app.P.anlegg)) ? app.P.anlegg.length : 0;
    const paa = !!(typeof Veg3d !== 'undefined' && Veg3d.lag && Veg3d.lag.andre);
    /* KNAPPEN HØRER TIL 3D-BILDET, OG SKAL VÆRE BORTE NÅR DET IKKE VISES.
       Sto den framme i snittmodus også, kom den i tillegg til alle
       snittverktøyene – og verktøylinja brøt til to rader. Målt: panelhodet
       gikk fra 39 til 69 px og tok 35 % av panelet, mot regelen om at hodet
       aldri skal ete tegneflaten. Samme regel som `veg3dverktoy` følger. */
    for (const [id, vis] of [['v3_andre', typeof Veg3d !== 'undefined' ? Veg3d : null],
      ['t3_andre', typeof Tomt3d !== 'undefined' ? Tomt3d : null]]) {
      const e = document.getElementById(id);
      if (!e) continue;
      e.classList.toggle('skjult', antall < 2 || !(vis && vis.aktiv));
      e.classList.toggle('aktiv', paa);
      e.setAttribute('aria-pressed', paa ? 'true' : 'false');
      e.textContent = paa ? '⬟▬ Alle anlegg' : '⬟▬ Alle anlegg (' + Math.max(0, antall - 1) + ')';
    }
    this.visAndreliste();
  },

  /**
   * Én flate inn i et pikselbuffer, med dybdeprøve.
   *
   * Firkantene deles i to trekanter og fylles med kantfunksjoner: for hver
   * piksel i den omsluttende boksen sjekkes det om punktet ligger på innsiden
   * av alle tre kantene. Det er den samme metoden en grafikkbrikke bruker, og
   * den har ingen sprekker – nabofirkanter deler kant nøyaktig.
   *
   * Fargen er flat per firkant. Med interpolerte hjørnefarger ville en
   * skjæringscelle ved siden av en fyllingscelle fått en rødgrønn overgang som
   * ser ut som en tredje tilstand.
   */
  _raster(g, hoyde, farge, ut, dyp, id, b, h, kam, krev) {
    const nb = g.nb, nh = g.nh;
    // projiser hver node én gang, ikke fire ganger per celle
    const rx = this._rx || (this._rx = []);
    const sy = this._sy || (this._sy = []);
    const pw = this._pw || (this._pw = []);
    const n = nb * nh;
    if (rx.length < n) { rx.length = n; sy.length = n; pw.length = n; }
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        if (!g.finnes[k]) { pw[k] = NaN; continue; }
        const q = kam.punkt(g.wx[k], g.wy[k], hoyde[k]);
        rx[k] = q.rx; sy[k] = q.sy; pw[k] = q.w;
      }
    }

    const F = kam.F, cx = kam.cx, cy = kam.cy;
    const naer = kam.naer || 1e-6;

    /* Selve fyllingen. Kantfunksjoner, som før – men den regner px/py selv,
       fordi den nå får hjørnene i kamerarommet. */
    const fyll = (arx, asy, aw, brx, bsy, bw, crx, csy, cw, f) => {
      const ax = cx + F * arx / aw, ay = cy + F * asy / aw;
      const bx = cx + F * brx / bw, by = cy + F * bsy / bw;
      const cx2 = cx + F * crx / cw, cy2 = cy + F * csy / cw;
      let minX = Math.max(0, Math.floor(Math.min(ax, bx, cx2)));
      let maksX = Math.min(b - 1, Math.ceil(Math.max(ax, bx, cx2)));
      let minY = Math.max(0, Math.floor(Math.min(ay, by, cy2)));
      let maksY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy2)));
      if (minX > maksX || minY > maksY) return;
      const omr = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
      if (Math.abs(omr) < 1e-9) return;
      const inv = 1 / omr;
      for (let y = minY; y <= maksY; y++) {
        for (let x = minX; x <= maksX; x++) {
          const qx = x + 0.5, qy = y + 0.5;
          const w0 = ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax)) * inv;
          const w1 = ((cx2 - bx) * (qy - by) - (cy2 - by) * (qx - bx)) * inv;
          const w2 = ((ax - cx2) * (qy - cy2) - (ay - cy2) * (qx - cx2)) * inv;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          // w1 hører til hjørne a, w2 til b, w0 til c
          const d = aw * w1 + bw * w2 + cw * w0;
          const pp = y * b + x;
          if (d >= dyp[pp]) continue;
          dyp[pp] = d;
          ut[pp] = f;
          if (id) id[pp] = this._idNa;
        }
      }
    };

    /**
     * Klipper mot nærplanet før den fyller.
     *
     * Står man på vegen, ligger 72 % av nodene BAK øyet. Uten klipping
     * projiserer hver trekant som krysser øyeplanet med snudd fortegn og
     * smøres over hele skjermen – og det ser ikke ut som en feil, det ser ut
     * som en flate. Klippingen må skje i kamerarommet, der rx, sy og w er
     * lineære i verdensposisjonen; etter divisjonen er de det ikke.
     *
     * I oversiktsmodus slår den aldri til: minste målte dybde er 1 907 m mot
     * et nærplan på null. Kostnaden er tre sammenligninger per trekant.
     */
    const trekant = (arx, asy, aw, brx, bsy, bw, crx, csy, cw, f) => {
      const ai = aw >= naer, bi = bw >= naer, ci = cw >= naer;
      const antall = (ai ? 1 : 0) + (bi ? 1 : 0) + (ci ? 1 : 0);
      if (antall === 0) return;
      if (antall === 3) { fyll(arx, asy, aw, brx, bsy, bw, crx, csy, cw, f); return; }
      // klipp kanten P→Q der P er innenfor
      const klipp = (prx, psy, pw2, qrx, qsy, qw) => {
        const t = (pw2 - naer) / (pw2 - qw);
        return [prx + t * (qrx - prx), psy + t * (qsy - psy), naer];
      };
      // ordne slik at A alltid er innenfor
      let A = [arx, asy, aw], B = [brx, bsy, bw], C = [crx, csy, cw];
      let inne = [ai, bi, ci];
      while (!inne[0]) {                       // roter til A er innenfor
        const t1 = A; A = B; B = C; C = t1;
        const t2 = inne[0]; inne = [inne[1], inne[2], t2];
      }
      if (antall === 1) {
        const nb2 = klipp(A[0], A[1], A[2], B[0], B[1], B[2]);
        const nc = klipp(A[0], A[1], A[2], C[0], C[1], C[2]);
        fyll(A[0], A[1], A[2], nb2[0], nb2[1], nb2[2], nc[0], nc[1], nc[2], f);
        return;
      }
      /* To innenfor. Etter roteringen er A innenfor; den andre innenfor er B
         eller C, og firkanten som blir igjen deles i to. */
      if (inne[1]) {                            // A og B inne, C ute
        const bc = klipp(B[0], B[1], B[2], C[0], C[1], C[2]);
        const ca = klipp(A[0], A[1], A[2], C[0], C[1], C[2]);
        fyll(A[0], A[1], A[2], B[0], B[1], B[2], bc[0], bc[1], bc[2], f);
        fyll(A[0], A[1], A[2], bc[0], bc[1], bc[2], ca[0], ca[1], ca[2], f);
      } else {                                  // A og C inne, B ute
        const ab = klipp(A[0], A[1], A[2], B[0], B[1], B[2]);
        const cb = klipp(C[0], C[1], C[2], B[0], B[1], B[2]);
        fyll(A[0], A[1], A[2], ab[0], ab[1], ab[2], cb[0], cb[1], cb[2], f);
        fyll(A[0], A[1], A[2], cb[0], cb[1], cb[2], C[0], C[1], C[2], f);
      }
    };

    for (let j = 0; j < nh - 1; j++) {
      for (let i = 0; i < nb - 1; i++) {
        const k00 = j * nb + i, k10 = k00 + 1, k01 = k00 + nb, k11 = k01 + 1;
        /* Rutenettet er ragget i skråningsfoten – der skråningen har møtt
           terrenget, slutter cellene. En firkant der ett hjørne mangler kan
           ikke tegnes, og skal ikke gjettes. */
        if (!g.finnes[k00] || !g.finnes[k10] || !g.finnes[k01] || !g.finnes[k11]) continue;
        /* «krev» er et ekstra krav for laget: gravflaten finnes bare der det
           faktisk er regnet, ikke ute i terrengringen rundt. */
        if (krev && (!krev[k00] || !krev[k10] || !krev[k01] || !krev[k11])) continue;
        /* Celler der korridoren har foldet seg over seg selv – bare mulig i
           krappe kurver på en veg – tegnes ikke. Dybdebufferet ville tegnet
           dem uten et ord. Tomta setter aldri feltet. */
        if (g.celleSperre && g.celleSperre[k00]) continue;
        /* HELT BAK ØYET? DA ER DET INGENTING Å REGNE PÅ.
           Står man i modellen, ligger omtrent halve gitteret bak ryggen, og hver
           eneste av de cellene gikk gjennom lysberegningen – et kryssprodukt,
           en normalisering og et oppslag i paletten – før klippingen kastet dem.
           Fire sammenligninger i stedet. Målt på en veg med 27 000 noder:
           56,7 ms per bilde ble 34,4, altså 18 bilder i sekundet mot 29. */
        if (pw[k00] <= naer && pw[k10] <= naer && pw[k01] <= naer && pw[k11] <= naer) continue;
        this._idNa = k00;
        const f = farge(k00, k10, k01, k11, hoyde);
        if (f === 0) continue;
        trekant(rx[k00], sy[k00], pw[k00], rx[k10], sy[k10], pw[k10], rx[k11], sy[k11], pw[k11], f);
        trekant(rx[k00], sy[k00], pw[k00], rx[k11], sy[k11], pw[k11], rx[k01], sy[k01], pw[k01], f);
      }
    }
  },


  /**
   * Lys fra flatens egen helning.
   *
   * Uten lys blir en 3D-flate en flat fargeklatt – man ser fargen, men ikke
   * formen. Lyset ganges bare inn i intervallet 0,55–1,00: med et videre spenn
   * blir en mørkt belyst grønn like mørk som en rød, og da forsvinner nettopp
   * det man skal se.
   */
  _lys(g, k00, k10, k01, z, kam) {
    /* NORMALEN FRA DE TO EKTE KANTENE, IKKE FRA ETT STEG PER AKSE.
       Her sto `(z10 - z00) / rute` for begge retningene. På en tomt er det
       riktig – rutenettet er kvadratisk. På en VEG er det ikke i nærheten:
       tverrsteget er målt til 0,33 m mens steget langs vegen er 5 m, altså
       15:1. Da blir hellingen på tvers femten ganger for stor, og hele
       modellen ser ut som en riflet plate.
       Kryssproduktet av de to kantene, med de virkelige avstandene fra wx/wy,
       gir riktig normal på begge – og er bit-identisk med den gamle formelen
       på et kvadratisk rutenett. */
    const ax = g.wx[k10] - g.wx[k00], ay = g.wy[k10] - g.wy[k00], az = z[k10] - z[k00];
    const bx = g.wx[k01] - g.wx[k00], by = g.wy[k01] - g.wy[k00], bz = z[k01] - z[k00];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    /* BAKSIDEN AV ET ARK SKAL IKKE LYSE SOM FORSIDEN.
       Linja under tvinger normalen oppover, og det er riktig sett ovenfra – da
       ser man alltid oversiden. Står man i en skjæring og ser opp forbi
       skjæringstoppen, ser man UNDERSIDEN av terrengarket, og med normalen
       tvunget opp lyses den som en opplyst forside: et lysende ark som svever.
       0,45 ligger under bunnen av lysintervallet (0,55), så en bakside kan
       aldri forveksles med en forside. */
    if (kam && kam.oye) {
      const bak2 = (nx * (kam.oye.x - g.wx[k00]) + ny * (kam.oye.y - g.wy[k00])
        + nz * (kam.oye.z - z[k00])) < 0;
      if (bak2) return 0.45;
    }
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // normalen skal peke opp
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    // lyset kommer fra nordvest og litt oppe: retningen er (-0,4  0,4  0,82)
    const l = (-nx * 0.4 + ny * 0.4 + nz * 0.82) / len;
    return 0.55 + 0.45 * Math.max(0, Math.min(1, l));
  },


  tegn() {
    /* Står visningen av, eller er panelet skjult, finnes det ikke noe bilde –
       og da skal det heller ikke ligge igjen et gitter. Blir det stående, peker
       oppslaget under musa inn i noe som ikke lenger vises, og avlesningen
       svarer med tall fra forrige gang panelet var oppe. */
    if (!this.aktiv || !this.lerret) { this._sisteGitter = null; return; }
    const c = this.lerret;
    if (c.offsetParent === null) { this._sisteGitter = null; return; }
    const b = c.clientWidth, h = c.clientHeight;
    if (b < 20 || h < 20) { this._sisteGitter = null; return; }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    /* OPPLØSNINGEN FØLGER MASKINEN, IKKE ET FAST TALL.
       Her sto 0,6 i bevegelse og 1 ellers. Det er riktig på ett gitter og galt
       på alle andre: målt på en veg med 27 000 noder tok et bilde 32 ms i 60 %,
       altså 31 i sekundet, mens en liten tomt gikk i 4 ms og hadde tålt full
       oppløsning hele veien. Et fast tall gir enten et hakkete stort anlegg
       eller et unødig grovt lite.
       Nå styres den av tiden forrige bilde tok, mot et budsjett på 28 ms – den
       ene tingen brukeren faktisk merker. Justeringen er myk (10 % per bilde),
       for et bilde som hopper mellom skarpt og grovt er verre å se på enn et
       som er jevnt grovt. */
    let kvalitet = 1;
    if (this._drar || this._farer) {
      const t = this._sisteTegnetid || 16;
      const mal = 28;
      let k = this._farteKvalitet || 0.7;
      if (t > mal * 1.25) k -= 0.1;
      else if (t < mal * 0.7) k += 0.1;
      this._farteKvalitet = Math.max(0.4, Math.min(1, k));
      kvalitet = this._farteKvalitet;
    }
    const tegnStart = performance.now();
    const rb = Math.max(2, Math.round(b * dpr * kvalitet));
    const rh = Math.max(2, Math.round(h * dpr * kvalitet));
    if (c.width !== rb || c.height !== rh) { c.width = rb; c.height = rh; }
    const g2 = c.getContext('2d');

    const res = this.app && this.app.resultat;
    /* Om det finnes noe å tegne, vet VISNINGEN – ikke tegneren. Her sto det en
       gang en sjekk på res.rutenett, som er tomtas felt; en veg har profiler i
       stedet, og da ga tegneren opp før den kom til gitteret. */
    if (!this._harData(res)) {
      /* GITTERET MÅ DØ MED DATAENE.
         De tre utgangene over nuller `_sisteGitter`; denne og den under gjorde
         det ikke. Da lå et helt gitter igjen fra forrige modell, og hover-grenen
         i musekoblingen tegnet overlegget på nytt av det: den gamle tomtegrensa,
         den gamle skråningsfoten og de gamle nøkkeltallene, malt oppå «Tegn
         tomta i kartet og sett en kote». Bytter man samtidig anlegg, er
         `res` null når `_overleggEkstra` leser `res.skraningsfot`, og da kaster
         den på hver eneste musebevegelse. */
      this._sisteGitter = null; this._sisteKam = null;
      this._tomMelding(g2, rb, rh, dpr * kvalitet);
      this._tegnOverlegg(null, null, b, h, dpr);
      return;
    }

    /* Desimering styres av piksler per celle, ikke av celletall. Kostnaden er
       pikselbundet: en celle som dekker en halv piksel koster nesten
       ingenting å hoppe over, og man ser den ikke uansett. */
    const pikslerPerMeter = (this.skala || 1) * dpr * kvalitet;
    const steg = Math.max(1, Math.ceil(1.6 / Math.max(0.02, pikslerPerMeter)));
    let g = this._gitter(steg);
    if (!g) {
      this._sisteGitter = null; this._sisteKam = null;
      this._tomMelding(g2, rb, rh, dpr * kvalitet, 'For mye å tegne i 3D på én gang');
      this._tegnOverlegg(null, null, b, h, dpr);
      return;
    }

    /* Nettopp slått på: nå VET vi hvor stort lerretet ble, og kan ramme inn
       for den størrelsen. `nullstill` tegner selv, så vi går ut etterpå. */
    if (this._maaRammes) {
      this._maaRammes = false;
      /* PÅ BAKKEN FINNES DET INGEN INNRAMMING Å GJØRE.
         `nullstill` er veien hjem til oversikten, og den gikk ut av bakkemodus.
         Slår man på 3D og går ned på bakken i samme klikk, kom den etterpå og
         hentet kameraet opp igjen – knappen så ut til å ikke virke i det hele
         tatt. Innrammingen gjelder oversiktskameraet; står man i modellen, er
         det ingenting å ramme inn. */
      if (this.modus !== 'bakken') { this.nullstill(); return; }
    }
    /* Bakgrunnsanleggene bygges FØR innrammingen, ikke etter: `_tilpassSkala`
       skal ramme inn alt som kommer til å stå i bildet. Gjør den det ikke,
       ligger nabotomta utenfor kanten helt til man zoomer ut selv – og da ser
       bryteren ut som om den ikke virker. */
    this._andreNa = this._bakgrunnsgitre();
    this._sceneDiagonal = this._scenediagonal(g, this._andreNa);
    /* Én fargeskala for hele bildet – se `_felleskala`. Settes på gitrene mens
       de tegnes og legges tilbake etterpå, så et gitter som senere blir det
       aktive ikke bærer med seg naboens skala. */
    const felles = this._felleskala(g, this._andreNa);
    const skalaFoer = [];
    if (felles) {
      for (const gg of [g].concat(this._andreNa.filter(x => x.full))) {
        skalaFoer.push([gg, gg.maksAvvik]);
        gg.maksAvvik = felles;
      }
    }
    if (!this.senter) this.senter = { x: g.midtX, y: g.midtY };
    /* Tilpasningen må gjøres om igjen når lerretet skifter størrelse. Uten
       dette blir skalaen stående fra den gangen panelet var lite: slår man på
       stor visning, ligger modellen igjen som en knapp midt i et tomt felt.
       Har brukeren zoomet selv, beholdes zoomen – den skaleres bare i takt med
       det nye lerretet, så bildet blir like stort i forhold til ruta som før. */
    /* Nøkkelen er lerretet i SKJERMpiksler, ikke i rasterpiksler. Rasteret
       krymper til 60 % mens man drar, og med rasterstørrelsen som nøkkel ville
       hver eneste dragning regnet tilpasningen om igjen til ingen nytte. */
    const kj = b + '×' + h;
    if (!this._skalaSatt || this._tilpassetFor !== kj) {
      const t = this._tilpassSkala(rb, rh, g, this._andreNa);
      const nyFit = t.skala / (dpr * kvalitet);
      const forhold = (this._skalaSatt && this._fitSkala > 1e-9) ? this.skala / this._fitSkala : 1;
      this.skala = nyFit * forhold;
      this._panFast = {
        x: t.panX / (dpr * kvalitet) * forhold,
        y: t.panY / (dpr * kvalitet) * forhold
      };
      this._fitSkala = nyFit;
      this._tilpassetFor = kj;
      this._skalaSatt = true;
    }
    /* Alt kameraet ser, regnes i RASTERPIKSLER. Skalaen og forskyvningen lagres
       i skjermpiksler, fordi det er der musa og hjulet lever. */
    const f = dpr * kvalitet;
    /* To forskyvninger, ikke én. `_panFast` er tilpasningens egen sentrering og
       regnes om hver gang ruta skifter størrelse; `panX/panY` er det brukeren
       selv har dratt modellen. Slås de sammen i ett felt, mister man brukerens
       flytting i det panelet endrer seg – og det er nettopp da man har zoomet
       inn på noe og vil beholde det. */
    const kam = this._kamera(rb, rh, g, this.skala * f,
      ((this._panFast ? this._panFast.x : 0) + (this.panX || 0)) * f,
      ((this._panFast ? this._panFast.y : 0) + (this.panY || 0)) * f);
    const n = rb * rh;
    if (!this._bilde || this._bilde.width !== rb || this._bilde.height !== rh) {
      this._bilde = g2.createImageData(rb, rh);
      this._piksler = new Uint32Array(this._bilde.data.buffer);
      this._dyp = new Float32Array(n);
      this._id = new Int32Array(n);
      this._lag2 = new Uint32Array(n);
      this._dyp2 = new Float32Array(n);
    }
    const bak = Farger.flateRgb;
    const bakVerdi = (255 << 24) | (bak[2] << 16) | (bak[1] << 8) | bak[0];
    this._piksler.fill(bakVerdi);
    /* HORISONTEN.
       Står man på bakken og ser utover, er øvre halvdel av skjermen én flat
       farge – og det ser ikke ut som himmel, det ser ut som et ødelagt bilde.
       To toner i stedet for én koster ett ekstra fill og ingen geometri:
       himmel over horisontlinja, fjern bakke under. Linja ligger nøyaktig der
       blikket er vannrett, så den flytter seg riktig når man ser opp og ned. */
    if (kam.oye) {
      const pyH = rh / 2 + kam.F * Math.tan(this.kamPitch * Math.PI / 180);
      const ton = (rgb, f2) => (255 << 24)
        | (Math.min(255, rgb[2] * f2) << 16) | (Math.min(255, rgb[1] * f2) << 8) | Math.min(255, rgb[0] * f2);
      const himmel = ton(bak, 1.35);
      const fjern = ton(Farger.terrengFlateRgb, 0.75);
      const grense = Math.max(0, Math.min(rh, Math.round(pyH)));
      this._piksler.fill(himmel, 0, grense * rb);
      this._piksler.fill(fjern, grense * rb, rh * rb);
    }
    this._dyp.fill(Infinity);
    this._id.fill(-1);

    const pal = this._palett();

    /* LAGENE KOMMER FRA VISNINGEN, IKKE FRA TEGNEREN.
       Hver visning – tomt eller veg – sier hvilke flater som skal tegnes, i
       hvilken rekkefølge, med hvilken farge og hvor gjennomsiktige. Tegneren
       under vet ingenting om hva en gravflate eller en vegbane er.
       Alternativet var en `if (kilde === 'veg')` spredt gjennom hele
       tegneveien, og da blir hver tomtefeil en vegfeil og omvendt. */
    /* I FØR OG ETTER tegnes ÉN flate over hele gitteret – bare høyden skiller
       dem. Overstyringen ligger her og ikke i hver visning, fordi den er den
       samme for tomt og veg, og fordi den da ikke kan bli glemt i den ene.
       INGEN `krev`. Det er nettopp fraværet av den som gir én sammenhengende
       flate: lagene i arbeidsbildet krever harGrav eller utenGrav i alle fire
       hjørner, og lar derfor en celle bred søm stå utegnet langs skråningsfoten.
       Her er hele poenget at landskapet henger sammen. */
    const lagene = this.visning === 'vanlig'
      ? this._lagliste(g, pal)
      : [{
        hoyde: this._flateHoyde(g), blanding: 0,
        farge: (k00, k10, k01, k11, z) => {
          const rgb = Farger.terrengFlateRgb;
          const ly = this._lys(g, k00, k10, k01, z, this._kamNa);
          const r = Math.min(255, rgb[0] * ly), gg = Math.min(255, rgb[1] * ly), bl = Math.min(255, rgb[2] * ly);
          return (255 << 24) | (bl << 16) | (gg << 8) | r;
        }
      }];
    this._kamNa = kam;
    /* FELLESSKALAEN MÅ LEGGES TILBAKE SELV OM NOE KASTER.
       `maksAvvik` settes på de MELLOMLAGREDE nabogitrene, som lever videre
       mellom bildene. Kaster noe under tegningen – `_lagliste` på et naboanlegg
       er den nærmeste kandidaten – ble tilbakelegget nedenfor hoppet over, og
       da bar de gitrene naboens skala for alltid: et anlegg som senere ble det
       aktive fikk fargeskalaen til noe helt annet, uten at noe sa hvorfor. */
    try {
    /* De andre anleggene først – se `_tegnBakgrunn`. */
    this._tegnBakgrunn(g, this._andreNa, rb, rh, kam, pal);
    for (const lag of lagene) {
      if (!lag) continue;
      if (!(lag.blanding > 0)) {
        // ugjennomsiktig: rett inn i bildet, med det felles dybdebufferet
        this._raster(g, lag.hoyde, lag.farge, this._piksler, this._dyp,
          lag.idBuffer === false ? null : this._id, rb, rh, kam, lag.krev);
        continue;
      }
      /* Hvert gjennomsiktige lag får SITT EGET dybdebuffer. Slår man i stedet
         av dybdeskrivingen, blander to firkanter av samme lag seg der de
         overlapper, og flaten får flekker. */
      /* ... men bare der laget FAKTISK kan havne. `_skjermboks` projiserer de
         åtte hjørnene av gitterets boks; utenfor den er både tømmingen og
         blandingen bortkastet arbeid. På et vanlig bilde er det tre firedeler
         av skjermen, ganger ett gjennomløp per gjennomsiktig lag. */
      const boks = this._skjermboks(g, lag.hoyde, kam, rb, rh, lag.krev);
      if (boks.x1 < boks.x0) continue;                 // helt utenfor bildet
      this._toemBoks(boks, rb);
      this._raster(g, lag.hoyde, lag.farge, this._lag2, this._dyp2, null, rb, rh, kam, lag.krev);
      const styrke = lag.blanding;
      const p = this._piksler, d1 = this._dyp, d2 = this._dyp2, l2 = this._lag2;
      for (let y = boks.y0; y <= boks.y1; y++) {
        for (let x = boks.x0; x <= boks.x1; x++) {
          const i = y * rb + x;
          if (!l2[i]) continue;
          if (d2[i] > d1[i]) continue;               // ligger bak det ugjennomsiktige
          const s = l2[i], u = p[i];
          const r = ((s & 255) * styrke + (u & 255) * (1 - styrke)) | 0;
          const gg = (((s >> 8) & 255) * styrke + ((u >> 8) & 255) * (1 - styrke)) | 0;
          const bl = (((s >> 16) & 255) * styrke + ((u >> 16) & 255) * (1 - styrke)) | 0;
          p[i] = (255 << 24) | (bl << 16) | (gg << 8) | r;
        }
      }
    }
    } finally {
      // felles fargeskala legges tilbake – se `_felleskala`
      for (const [gg, m] of skalaFoer) gg.maksAvvik = m;
    }
    g2.putImageData(this._bilde, 0, 0);
    this._sisteGitter = g;
    this._sisteKam = kam;
    this._sisteRb = rb; this._sisteRh = rh;
    this._tegnOverlegg(g, kam, b, h, dpr);
    // det neste bildet velger oppløsning etter hvor lang tid dette tok
    this._sisteTegnetid = performance.now() - tegnStart;
  },


  /**
   * Strekene i overlegget – fotlinje, vegkant, senterlinje, tomtegrense.
   *
   * OVENFRA ER ALT FORAN KAMERAET. PÅ BAKKEN ER DET IKKE DET.
   * Strekene ble tegnet ved å projisere hver node og trekke en linje mellom
   * dem, uten et eneste spørsmål om noden lå foran øyet. Sett ovenfra er det
   * riktig – der er hele modellen foran. Står man i den, ligger halve vegen BAK
   * ryggen, og et punkt bak øyet får negativ dybde: `px = cx + F·rx/w` speiler
   * det over til motsatt side av skjermen. Polylinja trakk da en strek fra et
   * ekte punkt til et speilbilde, og bildet ble en vifte av streker ut fra
   * midten – over himmelen, gjennom terrenget, tvers over alt.
   *
   * To ting må til, og begge må gjøres i KAMERAROMMET:
   *   · Nærplanet. `w` er lineær i verdensposisjonen, så krysningspunktet er
   *     en enkel interpolasjon. Etter divisjonen er ingenting lineært lenger.
   *   · Dybdeprøven. En strek som ligger bak en fylling skal ikke tegnes oppå
   *     den. Rasteret har alt regnet ut hvor nær flaten er i hvert piksel; her
   *     slås det bare opp.
   *
   * Toleransen er nødvendig fordi streken ligger nøyaktig PÅ flaten: uten den
   * ville halvparten av pikslene på fotlinja tapt mot sin egen bakke.
   */
  _strekOppsett(kam, b, h) {
    this._strekKam = kam;
    this._strekB = b; this._strekH = h;
  },

  /**
   * @param {CanvasRenderingContext2D} k
   * @param {Array<?{x:number,y:number,z:number}>} punkter  null = brudd i linja
   */
  _verdensstrek(k, punkter) {
    const kam = this._strekKam;
    if (!kam || !this._sisteRb) return;
    const b = this._strekB, h = this._strekH;
    const rb = this._sisteRb, rh = this._sisteRh;
    const naer = kam.naer || 1e-6;
    const dyp = this._dyp;
    // dybdeprøven gjelder bare på bakken; ovenfra er strekene aldri skjult
    const prov = !!(kam.oye && dyp && dyp.length === rb * rh);
    const paaSkjerm = q => ({ x: q.px * b / rb, y: q.py * h / rh });
    /* Skjult bak noe? Slå opp rasterets dybde i samme piksel. 2 % pluss en
       halvmeter er nok til at streken vinner mot sin egen flate, og for lite
       til at den vinner mot en fylling foran. */
    const skjult = q => {
      if (!prov) return false;
      const ix = q.px | 0, iy = q.py | 0;
      if (ix < 0 || iy < 0 || ix >= rb || iy >= rh) return false;
      const d = dyp[iy * rb + ix];
      return Number.isFinite(d) && q.w > d * 1.02 + 0.5;
    };
    // punktet der strekket krysser nærplanet; w er lineær, så dette er eksakt
    const klipp = (a, c, wa, wc) => {
      const t = (naer * 1.001 - wa) / (wc - wa);
      return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, z: a.z + (c.z - a.z) * t };
    };

    k.beginPath();
    let forrige = null, forrigeQ = null, tegner = false;
    for (const p of punkter) {
      if (!p) { forrige = null; forrigeQ = null; tegner = false; continue; }
      const q = kam.punkt(p.x, p.y, p.z);
      const inne = q.w > naer && !skjult(q);
      const foran = q.w > naer;
      if (inne) {
        const s = paaSkjerm(q);
        if (tegner) k.lineTo(s.x, s.y);
        else {
          // kom vi inn fra baksiden av øyet, skal streken begynne på nærplanet
          if (forrige && forrigeQ && !(forrigeQ.w > naer)) {
            const kr = klipp(forrige, p, forrigeQ.w, q.w);
            const sk = paaSkjerm(kam.punkt(kr.x, kr.y, kr.z));
            k.moveTo(sk.x, sk.y);
            k.lineTo(s.x, s.y);
          } else k.moveTo(s.x, s.y);
          tegner = true;
        }
      } else {
        if (tegner && !foran && forrige && forrigeQ) {
          const kr = klipp(p, forrige, q.w, forrigeQ.w);
          const sk = paaSkjerm(kam.punkt(kr.x, kr.y, kr.z));
          k.lineTo(sk.x, sk.y);
        }
        tegner = false;
      }
      forrige = p; forrigeQ = q;
    }
    k.stroke();
  },

  /** Er cella nær en 10 m-linje i UTM? Da tones den ned, som et drapert rutenett. */
  _paaRutelinje(g, k) {
    const x = g.wx[k], y = g.wy[k];
    // toleransen er en halv nodeavstand, som gitteret selv oppgir
    const t = (g.linjebredde || g.rute || 1) * 0.6;
    const naer = v => Math.abs(v - Math.round(v / 10) * 10) < t;
    return naer(x) || naer(y);
  },


  /**
   * Navnet på hvert bakgrunnsanlegg, satt der anlegget står.
   *
   * EN BLÅ FLATE UTEN NAVN ER ET SPØRSMÅL, IKKE ET SVAR.
   * Man ser at det ligger noe der, men ikke hva – og med to tomter i
   * bakgrunnen er det umulig å vite hvilken som er hvilken. Merket er hele
   * grunnen til at de andre anleggene er verdt å tegne.
   *
   * Punktet må ligge FORAN øyet. Bak det speiler `px = cx + F·rx/w` merket
   * over til motsatt side av skjermen, og navnet på tomta bak ryggen dukker
   * opp midt i utsikten framover.
   *
   * MERKET STÅR OVER FLATEN, IKKE PÅ DEN.
   * Først sto det i tyngdepunktet. Målt: en tomt på 52 × 38 m projiserte til
   * 89 × 45 piksler, og navneboksen dekket 40 av de 89 – man så merket og
   * ikke flaten det pekte på. Nå står det over det høyeste punktet med en
   * strek ned til midten, slik en etikett i en tegning gjør.
   */
  _merkBakgrunn(k, kam, b, h) {
    const gitre = this._andreNa;
    /* «HVOR ER DE ANDRE ANLEGGENE MINE?» SKAL BESVARES DER SPØRSMÅLET STILLES.
       Bryteren lå først i en lukket meny, og en funksjon man ikke vet finnes
       er nøyaktig like nyttig som en som ikke finnes. Står det flere anlegg i
       prosjektet mens modellen viser ett, sier modellen det selv – og sier
       hvor knappen er. Linja forsvinner i samme øyeblikk bryteren slås på. */
    if (!gitre || !gitre.length) {
      const app = this.app;
      const flere = app && app.P && Array.isArray(app.P.anlegg)
        ? app.P.anlegg.length - 1 : 0;
      if (flere > 0 && !(this.lag && this.lag.andre)) {
        const s = flere === 1
          ? 'Ett anlegg til i prosjektet – «Alle anlegg» viser det her'
          : flere + ' andre anlegg i prosjektet – «Alle anlegg» viser dem her';
        k.font = '11px system-ui, sans-serif';
        k.textAlign = 'left';
        k.textBaseline = 'alphabetic';
        const br = k.measureText(s).width;
        k.fillStyle = Farger.flate;
        k.globalAlpha = 0.75;
        k.fillRect(6, h - 43, br + 10, 20);
        k.globalAlpha = 1;
        k.fillStyle = Farger.annetAnlegg;
        k.fillText(s, 10, h - 29);
      }
    }
    if (!gitre) return;
    /* ET ANLEGG SOM IKKE KAN TEGNES SKAL DET SIES FRA OM – OG DET SKAL SIES
       HVA MAN GJØR MED DET.
       De to vanligste avvisningene er de to normale tilstandene til et
       halvferdig anlegg: en nytegnet veg har ingen høydeprofil før den er
       regnet én gang, og en nytegnet tomt har ingen kote. «Tegn veg nummer to,
       gå tilbake til veg én for å sammenligne» er nettopp det man gjør med
       denne bryteren først – og da ville bakgrunnen stått tom uten et ord. */
    if (gitre.utelatt && gitre.utelatt.length) {
      k.font = '11px system-ui, sans-serif';
      k.textAlign = 'left';
      k.textBaseline = 'alphabetic';
      const linjer = ['Ikke tegnet i bakgrunnen:'].concat(gitre.utelatt.map(s => '  ' + s));
      /* 30 px opp fra kanten, ikke 10. Nederste linje havnet ellers under
         avlesningsstripa som ligger langs bunnen av panelet – meldingen sto
         der, men bare overskriften var å se, og en overskrift uten innhold er
         verre enn ingen melding. */
      const bunn = h - 30;
      const topp = bunn - (linjer.length - 1) * 13;
      let bredest = 0;
      for (const s of linjer) bredest = Math.max(bredest, k.measureText(s).width);
      k.fillStyle = Farger.flate;
      k.globalAlpha = 0.75;
      k.fillRect(6, topp - 13, bredest + 10, linjer.length * 13 + 6);
      k.globalAlpha = 1;
      k.fillStyle = Farger.blekkSvak;
      linjer.forEach((s, i) => k.fillText(s, 10, topp + i * 13));
    }
    if (!gitre.length) return;
    const naer = kam.naer || 1e-6;
    k.font = '600 11px system-ui, sans-serif';
    k.textAlign = 'center';
    k.textBaseline = 'middle';
    /* Merkene løftes fra hverandre når to anlegg projiserer til nesten samme
       punkt: to navn oppå hverandre er ett uleselig navn. */
    const satt = [];
    for (const bg of gitre) {
      const m = bg.merke || { x: bg.midtX, y: bg.midtY, z: bg.hoy };
      const q = kam.punkt(m.x, m.y, m.z);
      if (!(q.w > naer)) continue;
      const x = q.px * b / this._sisteRb;
      const yFlate = q.py * h / this._sisteRh;
      let y = yFlate - 16;
      for (let runde = 0; runde < 8; runde++) {
        if (!satt.some(s => Math.abs(s.x - x) < 70 && Math.abs(s.y - y) < 17)) break;
        y -= 17;
      }
      if (!(x > -40 && x < b + 40 && y > -20 && y < h + 20)) continue;
      satt.push({ x, y });
      const tekst = bg.navn;
      const br = k.measureText(tekst).width + 10;
      k.strokeStyle = Farger.annetAnlegg;
      k.lineWidth = 1;
      k.beginPath(); k.moveTo(x, y + 8); k.lineTo(x, yFlate); k.stroke();
      k.fillStyle = Farger.flate;
      k.globalAlpha = 0.8;
      k.fillRect(x - br / 2, y - 8, br, 16);
      k.globalAlpha = 1;
      k.lineWidth = 1.2;
      k.strokeRect(x - br / 2, y - 8, br, 16);
      k.fillStyle = Farger.annetAnlegg;
      k.fillText(tekst, x, y + 1);
    }
    k.textBaseline = 'alphabetic';
  },

  /** Har visningen noe å bygge et gitter av? Overskrives av hver visning. */
  _harData(res) { return !!(res && res.rutenett && res.rutenett.length); },

  _tomMelding(g2, b, h, s, tekst) {
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.fillStyle = Farger.flate;
    g2.fillRect(0, 0, b, h);
    g2.fillStyle = Farger.blekkSvak;
    g2.font = Math.round(13 * s) + 'px system-ui, sans-serif';
    g2.textAlign = 'center';
    g2.fillText(tekst || (this._tomTekst ? this._tomTekst() : 'Ingenting å vise ennå'), b / 2, h / 2);
  },


  _tegnOverlegg(g, kam, b, h, dpr) {
    const o = this.over;
    if (!o) return;
    if (o.width !== Math.round(b * dpr) || o.height !== Math.round(h * dpr)) {
      o.width = Math.round(b * dpr); o.height = Math.round(h * dpr);
    }
    const k = o.getContext('2d');
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    k.clearRect(0, 0, b, h);
    if (!g || !kam) return;
    /* Overlegget tegnes i SKJERMpiksler, rasteret i rasterpiksler. Uten
       omregningen havner strekene et annet sted enn flaten de skal ligge på. */
    const skjerm = (wx, wy, wz) => {
      const q = kam.punkt(wx, wy, wz);
      return { x: q.px * b / this._sisteRb, y: q.py * h / this._sisteRh };
    };
    this._strekOppsett(kam, b, h);
    this._merkBakgrunn(k, kam, b, h);

    /* Strekene og tallene som hører til NETTOPP denne visningen – tomtegrense
       og skråningsfot for tomta, vegkanter og stasjonsmerker for vegen.
       Resten av overlegget under er likt for begge. */
    if (this._overleggEkstra) this._overleggEkstra(k, g, kam, skjerm, b, h);

    // nordpil
    const r = 22, nx = b - r - 16, ny = r + 14;
    const a = -this.yaw * Math.PI / 180;
    k.strokeStyle = Farger.blekkSvak; k.lineWidth = 1.2;
    k.beginPath(); k.arc(nx, ny, r, 0, Math.PI * 2); k.stroke();
    k.beginPath();
    k.moveTo(nx + Math.sin(a) * r * 0.8, ny - Math.cos(a) * r * 0.8);
    k.lineTo(nx - Math.sin(a) * r * 0.5, ny + Math.cos(a) * r * 0.5);
    k.strokeStyle = Farger.skjaering; k.lineWidth = 2.4; k.stroke();
    k.fillStyle = Farger.blekk; k.font = 'bold 10px system-ui, sans-serif'; k.textAlign = 'center';
    k.fillText('N', nx + Math.sin(a) * r * 1.35, ny - Math.cos(a) * r * 1.35 + 3);

    // nøkkeltall og overdrivningsmerke
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    /* HVILKEN AV DE TO MAN SER PÅ, MÅ STÅ.
       Et bilde av terrenget uten inngrepet ser ut som et bilde av terrenget MED
       et lite inngrep. Uten merket er de to umulige å skille i et skjermbilde
       som legges i et tilbud – og da er «før» verre enn ingenting. */
    this._hudNa = null;
    if (this.modus === 'bakken' && kam.oye) {
      const t2 = v => Rapport.tall(v, v < 10 ? 1 : 0);
      const gaar = this.ferd === 'gaa';
      const linjerB = [(gaar ? 'GÅR' : 'FLYR') + ' · øyet ' + t2(this.kamH) + ' m over bakken'
        + (gaar ? ' – du holder deg på anlegget' : ' – fritt')];
      /* HVOR MAN STÅR VET BARE VISNINGEN.
         Her sto vegens «Profil … · på senterlinja», lest rett av
         `app.tverrStasjon`. På en tomt er det tallet 0 og ikke null, så tomta
         ville fått linja «Profil 0 · på senterlinja» – om en veg den ikke har. */
      if (this._bakkeHud) linjerB.push(...this._bakkeHud());
      /* Tastene MÅ stå i bildet. Et kamera man må gjette seg til er et kamera
         man ikke bruker, og det er ingen annen plass å skrive dem. */
      linjerB.push('W A S D eller piltaster kjører · Shift løper · musa ser seg om'
        + ' · G ' + (gaar ? 'letter' : 'lander') + ' · F ser framover · Esc tilbake'
        + (gaar ? '' : ' · Q E hever og senker'));
      linjerB.push('Fart ' + t2(this.fartsfaktor || 1) + '× – trykk + og − for å endre'
        + (this.visning === 'etter' ? ' · du går på FERDIG veg'
          : this.visning === 'foer' ? ' · du går på dagens mark' : ''));
      this._hudNa = linjerB;
    }
    const linjer = (this.modus === 'bakken' && this._hudNa) ? this._hudNa
      : this.visning === 'foer'
        ? ['FØR – terrenget som det ligger i dag, uten inngrepet',
          'Slipp mellomrom, eller trykk «Før» igjen, for å se hva som blir gjort']
        : this.visning === 'etter'
          ? ['ETTER – landskapet slik det blir når alt er ferdig',
            'Ferdig nivå der det bygges, skråningene der de lander, dagens mark utenfor']
          : (this._hudLinjer ? this._hudLinjer(g) : []);
    k.textAlign = 'left';
    k.font = '11px system-ui, sans-serif';
    linjer.forEach((s, i) => {
      k.fillStyle = Farger.blekkSvak;
      k.fillText(s, 10, 16 + i * 14);
    });
    /* MERKET MÅ BRENNES INN, IKKE STÅ I ET SKJEMA VED SIDEN AV.
       Bildet havner i et tilbud. Ser kunden en tre ganger overdrevet skjæring
       uten at det står noe sted, er det kunden som blir lurt. */
    if (Math.abs(this.overdriv - 1) > 1e-9) {
      k.fillStyle = Farger.skjaering;
      k.font = 'bold 12px system-ui, sans-serif';
      k.fillText(`Høyden er overdrevet ${this.overdriv}×`, 10, 16 + linjer.length * 14 + 4);
      this._merketBrent = true;
    } else {
      this._merketBrent = false;
    }

    /* MÅLESTOKK: en to meters pinne i det laveste punktet.
       Den står i gitterets hjørne 0, og på bakken kan det hjørnet ligge BAK
       øyet – da speiles pinna ut i bildet som en tilfeldig strek med «2 m» på.
       En målestokk gir dessuten ingen mening i et perspektivbilde: to meter er
       ikke like mange piksler nær og fjernt. Derfor bare i oversikten. */
    const q0 = kam.punkt(g.wx[0], g.wy[0], g.lav);
    if (!kam.oye && q0.w > 0) {
      const pinne = 2;
      const p0 = skjerm(g.wx[0], g.wy[0], g.lav);
      const p1 = skjerm(g.wx[0], g.wy[0], g.lav + pinne);
      k.strokeStyle = Farger.blekk; k.lineWidth = 2;
      k.beginPath(); k.moveTo(p0.x, p0.y); k.lineTo(p1.x, p1.y); k.stroke();
      k.fillStyle = Farger.blekk; k.font = '10px system-ui, sans-serif'; k.textAlign = 'left';
      k.fillText(pinne + ' m', p1.x + 4, p1.y + 3);
    }

    // avlesning under markøren
    if (this._peker && this._peker.k >= 0 && g.finnes[this._peker.k]) {
      const tekst = this._avlesning(g, this._peker.k);
      const bx = Math.min(b - 168, this._peker.x + 12), by = Math.min(h - 54, this._peker.y + 12);
      k.fillStyle = Farger.flate; k.globalAlpha = 0.92;
      k.fillRect(bx, by, 160, 48);
      k.globalAlpha = 1;
      k.strokeStyle = Farger.kantSterk; k.lineWidth = 1; k.strokeRect(bx, by, 160, 48);
      k.fillStyle = Farger.blekk; k.font = '11px system-ui, sans-serif';
      tekst.forEach((s, n2) => k.fillText(s, bx + 6, by + 15 + n2 * 13));
    }
  },


  _tellUsikre(g) {
    let n = 0;
    for (let i = 0; i < g.usikker.length; i++) if (g.usikker[i] && g.finnes[i]) n++;
    return n;
  },


  /**
   * Mus, finger og tastatur.
   *
   * Her var det bare å snu og å zoome. Det holdt så vidt på en tomt, som er
   * omtrent like bred som den er lang og får plass i ruta hele tiden. På en veg
   * holdt det ikke i det hele tatt: zoomer man inn på en fylling, kan man ikke
   * flytte seg bortover til den neste, og det eneste som finnes er å zoome ut
   * igjen. Derfor:
   *   venstre dra          snur modellen
   *   høyre / midt / shift flytter den (og to fingre på skjerm)
   *   hjul / knip          zoomer
   *   klikk                velger stedet man peker på – vegen flytter snittet dit
   *   piltaster            går bortover, ett profil om gangen
   *   dobbeltklikk         tilbake til utgangsstillingen
   */
  _musKobling() {
    const c = this.over || this.lerret;
    let dra = null;
    /* Egen for hver visning. Lå den på prototypen, ville en tast man holdt nede
       i vegen fortsatt vært nede i tomta. */
    this._taster = new Set();
    const pos = e => {
      const r = c.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    // midtpunktet mellom to fingre – knip og flytt skjer samtidig
    const midt = e => {
      const r = c.getBoundingClientRect();
      const a = e.touches[0], b = e.touches[1];
      return { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
    };
    const start = e => {
      /* ET KLIKK I BILDET MÅ GI LERRETET FOKUS.
         Målt: etter et klikk midt i 3D-bildet sto `document.activeElement` på
         BODY. Tastene gikk da til appens egen document-håndtering, og W A S D
         gjorde ingenting – i det øyeblikket man gjorde det aller første man gjør
         i en 3D-visning, nemlig å klikke i den for å se seg om.
         Grunnen er at dragningen kaller preventDefault for å hindre at
         nettleseren markerer tekst, og det avlyser samtidig standardoppførselen
         som gir et element med tabindex fokus. Da må fokus settes for hånd. */
      if (document.activeElement !== c) c.focus({ preventScroll: true });
      if (e.touches && e.touches.length > 1) {
        dra = null;
        this._knip = this._avstand(e);
        this._knipMidt = midt(e);
        this._drar = true;
        return;
      }
      /* Høyre og midtre knapp, og shift, flytter i stedet for å snu. Venstre
         alene snur – det er den bevegelsen folk prøver først. */
      const flytter = !e.touches && (e.button === 1 || e.button === 2 || e.shiftKey);
      dra = Object.assign(pos(e), {
        yaw: this.yaw, pitch: this.pitch, flytter,
        kamYaw: this.kamYaw, kamPitch: this.kamPitch,
        panX: this.panX || 0, panY: this.panY || 0, flyttet: 0,
        // hvor langt unna er det man tok tak i? Det setter meter per piksel.
        dybde: this._dybdeUnder(pos(e), c)
      });
      this._drar = true;
    };
    const flytt = e => {
      if (e.touches && e.touches.length > 1 && this._knip) {
        const na = this._avstand(e), nm = midt(e);
        this.skala *= na / this._knip;
        this.panX = (this.panX || 0) + (nm.x - this._knipMidt.x);
        this.panY = (this.panY || 0) + (nm.y - this._knipMidt.y);
        this._knip = na; this._knipMidt = nm;
        this._skalaSatt = true;
        this.tegn();
        e.preventDefault();
        return;
      }
      const p = pos(e);
      if (!dra) {
        // hover: slå opp cella under markøren i id-bufferet
        this._peker = this._slaOpp(p, c);
        if (this._sisteGitter) this._tegnOverlegg(this._sisteGitter, this._sisteKam,
          c.clientWidth, c.clientHeight, Math.min(2, window.devicePixelRatio || 1));
        return;
      }
      dra.flyttet = Math.max(dra.flyttet, Math.hypot(p.x - dra.x, p.y - dra.y));
      if (this.modus === 'bakken') {
        /* EN TIL EN.
           Følsomheten er ikke valgt, den er utledet: `atan(1/F)` er nøyaktig
           den vinkelen som flytter motivet i midten én skjermpiksel per
           musepiksel. Målt på dreieskiva var forholdet 12 til 15 – man dro
           én piksel og motivet forsvant. Den regnes i SKJERMpiksler, så den
           endrer seg ikke når rasteret krymper til 60 % under dragningen. */
        const Fs = (c.clientHeight / 2) / Math.tan(this.fov * Math.PI / 360);
        const grad = Math.atan(1 / Fs) * 180 / Math.PI;
        if (dra.flytter) {
          // gå: motivet under markøren blir stående under markøren
          const m = (dra.dybde || 30) / Fs;
          this._bakkeFlytt(-(p.y - dra.y) * m * Math.cos(this.kamPitch * Math.PI / 180),
            (p.x - dra.x) * m);
          dra.x = p.x; dra.y = p.y;
        } else {
          this.kamYaw = dra.kamYaw + (p.x - dra.x) * grad;
          this.kamPitch = Math.max(-85, Math.min(85, dra.kamPitch - (p.y - dra.y) * grad));
        }
      } else if (dra.flytter) {
        this.panX = dra.panX + (p.x - dra.x);
        this.panY = dra.panY + (p.y - dra.y);
      } else {
        this.yaw = dra.yaw + (p.x - dra.x) * 0.4;
        this.pitch = Math.max(8, Math.min(88, dra.pitch + (p.y - dra.y) * 0.3));
      }
      this.tegn();
      e.preventDefault();
    };
    const slutt = e => {
      /* Et klikk er en dragning som ikke flyttet seg. Terskelen må være der:
         på et nettbrett rikker fingeren seg alltid noen piksler, og uten den
         ville hvert eneste forsøk på å snu endt med å velge et sted. */
      if (dra && !dra.flytter && dra.flyttet < 4) {
        const p = e && e.changedTouches
          ? (() => { const r = c.getBoundingClientRect(), t = e.changedTouches[0];
            return { x: t.clientX - r.left, y: t.clientY - r.top }; })()
          : { x: dra.x, y: dra.y };
        const traff = this._slaOpp(p, c);
        if (traff && traff.k >= 0) {
          /* Klikk gjør TO ting nå, og bildet rikker seg ikke av den ene:
             det velger stedet (som før), og det flytter dreiepunktet dit.
             Fra da av dreier man om det man ser på i stedet for om midten av
             et gitter som kan ligge en kilometer unna. */
          /* SETT DREIEPUNKTET UANSETT, VELG BARE NÅR VISNINGEN KAN.
             Vakten sto på `_velg`, som bare vegen har. Da satte et klikk i
             tomtemodellen aldri dreiepunkt, og tomta hadde ikke noe «her»
             å ta utgangspunkt i – hverken for dreiing eller for å gå ned
             på bakken. De to tingene har ingenting med hverandre å gjøre. */
          this.settFokus(traff.k, this._sisteGitter);
          if (this._velg) this._velg(traff.k, this._sisteGitter);
          this.tegn();
        }
      }
      dra = null; this._knip = null; this._knipMidt = null;
      if (this._drar) {
        this._drar = false;
        /* Full oppløsning først når man slipper. Under dragning tegnes det i
           60 % skala – uten det hakker en stor tomt på et nettbrett. */
        clearTimeout(this._skarpt);
        this._skarpt = setTimeout(() => this.tegn(), 120);
      }
    };
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', flytt);
    window.addEventListener('mouseup', slutt);
    // uten dette spretter nettleserens egen meny opp i det man begynner å flytte
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mouseleave', () => { this._peker = null; slutt(); });
    c.addEventListener('touchstart', start, { passive: true });
    c.addEventListener('touchmove', flytt, { passive: false });
    c.addEventListener('touchend', slutt);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      /* Zoom mot MARKØREN, ikke mot midten. Zoomer man mot midten, forsvinner
         det man ser på ut av ruta med én gang man går nærmere.

         BEGGE forskyvningene må trekkes fra for å finne hvor langt markøren
         står fra projeksjonens nullpunkt. Her sto bare `panX`, og da regnet
         formelen fra et punkt som lå `_panFast` unna det virkelige – med det
         resultatet at bildet SEG bortover for hvert hakk på hjulet, i stedet
         for å stå stille. Perspektivet gjør at det ikke kan bli helt eksakt for
         alle dybder, men feilen er da under en piksel i stedet for titalls. */
      const p = pos(e);
      if (this.modus === 'bakken') {
        /* HJULET ER ØYEHØYDEN, ikke zoom og ikke fart.
           Én kontroll styrer da både en 30 m fylling og en 2,6 km veg, fordi
           farten følger høyden: står man lavt går man sakte, hever man seg
           flyr man. Og det er veien opp når man har rotet seg bort. */
        /* Går man, letter man av hjulet – man hever seg ikke i det stille med
           føttene på bakken. Det er den samme regelen som Q og E følger. */
        if (this.ferd === 'gaa') {
          if (e.deltaY < 0) { this.settFerd('fly'); e.preventDefault(); }
          return;
        }
        this.kamH = Math.max(1.6, Math.min(4000, this.kamH * (e.deltaY < 0 ? 1 / 1.15 : 1.15)));
        this.tegn();
        return;
      }
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const fx = this._panFast ? this._panFast.x : 0;
      const fy = this._panFast ? this._panFast.y : 0;
      const mx = p.x - c.clientWidth / 2 - fx - (this.panX || 0);
      const my = p.y - c.clientHeight / 2 - fy - (this.panY || 0);
      this.panX = (this.panX || 0) - mx * (f - 1);
      this.panY = (this.panY || 0) - my * (f - 1);
      this.skala *= f;
      this._skalaSatt = true;
      this.tegn();
    }, { passive: false });
    c.addEventListener('keyup', e => {
      if (e.code !== 'Space' || this._foerFoerKikk === undefined) return;
      this.settVisning(this._foerFoerKikk);
      this._foerFoerKikk = undefined;
      this.tegn();
    });
    // slipper man tasten utenfor lerretet, skal kikket likevel ta slutt
    window.addEventListener('blur', () => {
      if (this._foerFoerKikk === undefined) return;
      this.settVisning(this._foerFoerKikk);
      this._foerFoerKikk = undefined;
      if (this.aktiv) this.tegn();
    });
    c.addEventListener('dblclick', () => this.nullstill());

    /* Piltaster. Lerretet får tabIndex i HTML-en, så det kan ta imot taster når
       man har klikket i det. Uten `_stegVis` gjør de ingenting – tomta har
       ingen retning å gå i.

       stopPropagation MÅ være der. App-en har sin egen piltasthåndtering på
       document som flytter tverrsnittet ett hakk. Uten den ble hvert tastetrykk
       til to hakk, og shift-spranget på ti til elleve – nøyaktig den slags feil
       ingen melder fra om, de bare slutter å bruke tastene. */
    /* MELLOMROM KIKKER.
       Hold nede for å se terrenget som det er i dag, slipp for å se inngrepet.
       Å veksle fram og tilbake er den eneste måten å SE forskjellen – to bilder
       ved siden av hverandre må man sammenligne, ett bilde som blinker ser man. */
    c.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat) {
        /* Kikken husker HVILKET bilde man kom fra, ikke bare om det var «før».
           Med tre bilder er en boolsk hukommelse en tapt tilstand: kikket man
           fra «Etter», landet man i «Masser» da man slapp. */
        this._foerFoerKikk = this.visning;
        this.settVisning('foer');
        e.preventDefault();
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && this.modus !== 'bakken') {
        /* Ram inn det man dreier om. Uten fokus er det hele modellen, som før.
           På bakken betyr F noe annet – se framover – og den ligger nedenfor. */
        this._skalaSatt = false;
        this.tegn();
        e.preventDefault(); e.stopPropagation();
        return;
      }
      if (e.key === 'Home') { this.nullstill(); e.preventDefault(); e.stopPropagation(); return; }
      if (this._bakkeTast(e)) { e.preventDefault(); e.stopPropagation(); return; }
      const steg = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (steg && this._stegVis) {
        this._stegVis(steg * (e.shiftKey ? 10 : 1));
        e.preventDefault();
        e.stopPropagation();
      }
    });
    c.addEventListener('keyup', e => { this._taster.delete(e.key.toLowerCase()); });

    /* TASTENE MÅ VIRKE UANSETT HVOR FOKUS LIGGER.
       Lytteren over sitter på lerretet, og krever at lerretet har fokus. Det er
       riktig for en tegning man klikker seg inn i, men galt for en modus man STÅR
       i: lukker man menyen, drar i skyveren eller bare klikker et sted uten
       tabindex, ligger fokus på BODY, og W A S D gjør ingenting uten at det
       finnes noe å se som forklarer hvorfor. Et spill slipper ikke tastaturet
       fordi man klikket feil sted.
       Derfor tar vinduet imot gåtastene i FANGSTFASEN så lenge man står på
       bakken – men bare da, bare når visningen er synlig, og aldri fra noen som
       holder på å skrive et tall. */
    const vindusTast = e => {
      /* KEYUP FØRST, FØR ALLE VAKTER.
         Bokføringen lå bak dem. Trykket man W og klikket i et tallfelt før man
         slapp tasten, kom keyup til en vakt som sa «her skrives det, la den
         være» – og W ble liggende nede for alltid. Kameraet gikk videre av seg
         selv, uendelig, og den eneste veien ut var å laste siden på nytt.
         En tast som SLIPPES skal alltid bokføres, uansett hvor man er. */
      if (e.type === 'keyup') {
        if (this._taster) this._taster.delete(e.key.toLowerCase());
        // og kikken skal ta slutt selv om lerretet ikke hadde fokus da man slapp
        if (e.code === 'Space' && this._foerFoerKikk !== undefined) {
          this.settVisning(this._foerFoerKikk);
          this._foerFoerKikk = undefined;
        }
        return;
      }
      if (this.modus !== 'bakken' || !this.aktiv || !this._bakkeFlytt) return;
      if (!this.lerret || this.lerret.offsetParent === null) return;
      const a = document.activeElement;
      if (a === c) return;              // lerretet håndterer det selv, i boblefasen
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'
        || a.tagName === 'SELECT' || a.isContentEditable)) return;
      /* ER DET EN DIALOG OPPE, EIER DEN TASTATURET.
         Escape lukker dialogen. Fanget vi den her, ble dialogen stående åpen
         mens man i tillegg ble kastet opp av bakkemodus – to ting man ikke ba
         om, og den ene skjult bak den andre. */
      const dia = document.getElementById('dialog');
      if (dia && dia.offsetParent !== null) return;
      if (this._bakkeTast(e)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', vindusTast, true);
    window.addEventListener('keyup', vindusTast, true);

    /* Slipper man tasten mens man er i et annet vindu, kommer keyup aldri – og
       kameraet ville gått for egen maskin i det uendelige. */
    c.addEventListener('blur', () => this._taster.clear());
    window.addEventListener('blur', () => this._taster.clear());
  },

  /**
   * Gåtastene, ett sted – lerretet og vinduet kaller den samme.
   *
   * Returnerer true når tasten er brukt, så den som kalte kan stoppe den.
   */
  _bakkeTast(e) {
    /* VEIEN UT LIGGER FØR VAKTEN.
       Escape sto bak `&& this._bakkeFlytt`. En visning som kom seg ned på
       bakken uten å ha gåing – og det er nettopp den halvferdige tilstanden man
       lager mens man bygger den – låste da brukeren inne. Utgangen skal aldri
       avhenge av at noe annet er ferdig. */
    if (this.modus === 'bakken' && e.key === 'Escape') { this.settModus('oversikt'); return true; }
    if (this.modus !== 'bakken' || !this._bakkeFlytt) return false;
    /* MELLOMROM KIKKER, OGSÅ NÅR FOKUS LIGGER PÅ EN KNAPP.
       Sto fokus på ⛶ eller på et lagvalg – og det gjør det rett etter at man
       har trykket på dem – gikk mellomrom dit i stedet, og TRYKKET knappen på
       nytt: fullskjerm slo seg av, laget skrudde seg tilbake. Står man på
       bakken, eier kameraet tastaturet. */
    if (e.code === 'Space' && !e.repeat) {
      this._foerFoerKikk = this.visning;
      this.settVisning('foer');
      return true;
    }
    /* CTRL OG ⌘ TILHØRER PROGRAMMET, IKKE KAMERAET.
       `s` er gåtasten bakover, og den ble slukt med preventDefault. Ctrl+S
       lagret da ikke så lenge man sto på bakken – man trykket, ingenting
       skjedde, og man trodde det var lagret. Det samme gjaldt Ctrl+Z og Ctrl+Y.
       Ctrl alene er «snik», og den bruker ikke S. */
    if (e.metaKey || (e.ctrlKey && e.key.length === 1)) return false;
    if (Tegner3d.GAATASTER[e.key.toLowerCase()]) {
      /* Tasten LEGGES NED, den utfører ingenting.
         Første forsøk flyttet kameraet ett hakk per tastetrykk. Da bestemmer
         nettleserens repetasjonsrate farten: en halv sekunds pause, så tretti
         hakk i sekundet. Man står stille, og så farer man av sted. Og to taster
         samtidig – fram og til siden – ble to skritt etter hverandre i stedet
         for ett på skrå.
         Her holder vi bare rede på hvilke taster som er NEDE. Løkka gjør resten,
         i meter per sekund. */
      this._taster.add(e.key.toLowerCase());
      this._bakkeLop();
      return true;
    }
    if ((e.key === 'f' || e.key === 'F') && this.seFramover) {
      this.seFramover(); this.tegn(); return true;
    }
    if (e.key === 'g' || e.key === 'G') {
      this.settFerd(this.ferd === 'gaa' ? 'fly' : 'gaa');
      return true;
    }
    /* + og − skrur farten opp og ned. Tastene ligger der hendene alt er, og de
       finnes i tre utgaver på et tastatur – pluss, plusstasten på talldelen, og
       likhetstegnet som er den ubeskyttede plussen på norsk oppsett. */
    if (e.key === '+' || e.key === '=' || e.key === 'Add') { this.settFart(this.fartsfaktor * 1.6); return true; }
    if (e.key === '-' || e.key === '_' || e.key === 'Subtract') { this.settFart(this.fartsfaktor / 1.6); return true; }
    return false;
  },

  /**
   * Bytter mellom de tre bildene, og forteller knappene om det.
   *
   * Alle veier inn hit: knappene, mellomromskikken og prøvene. Da kan ikke to
   * knapper stå trykket inn samtidig, og en tilstand satt av tastaturet kan
   * ikke bli usynlig for knappen ved siden av.
   */
  settVisning(v) {
    if (v !== 'vanlig' && v !== 'foer' && v !== 'etter') return;
    if (this.visning === v) return;
    this.visning = v;
    if (this.paaVisning) this.paaVisning(v);
    this.tegn();
  },

  /**
   * Bytter mellom å gå og å fly, og setter øyehøyden deretter.
   *
   * 1,7 m er ikke et rundt tall som ser fint ut: det er øyehøyden til en voksen
   * som står. Hele poenget med å gå er at fyllinga skal rage nøyaktig så høyt
   * over deg som den kommer til å gjøre.
   */
  settFerd(f) {
    if (f !== 'gaa' && f !== 'fly') return;
    if (this.ferd === f) return;
    this.ferd = f;
    if (f === 'gaa') { this.kamH = Tegner3d.OYEHOYDE; this.kamZ = null; }
    else {
      /* Man letter FRA der man står: den frie høyden settes til den man hadde.
         Uten det ville et trykk på G kastet kameraet til forrige gangs kote –
         gjerne et helt annet sted i landskapet. */
      const g = this._sisteGitter;
      const gulv = (g && this._gulvNa) ? this._gulvNa(g) : null;
      this.kamZ = (gulv != null && Number.isFinite(gulv)) ? gulv + this.kamH : null;
    }
    /* Landingen må hente deg INN på anlegget. Fløy man ut over skråningsfoten
       og trykket G, ble man stående utenfor med en grense som sa at man ikke
       kunne komme dit – uten en eneste tast som førte tilbake. */
    if (this._ferdEndret) this._ferdEndret(f);
    if (this.paaFerd) this.paaFerd(f);
    if (this.modus === 'bakken') this.tegn();
  },

  /** Farten som varig innstilling, klippet til noe man kan styre. */
  settFart(f) {
    this.fartsfaktor = Math.max(0.25, Math.min(16, f));
    if (this.paaFart) this.paaFart(this.fartsfaktor);
    this.tegn();
  },

  /**
   * Gåing i meter per sekund, ikke i hakk per tastetrykk.
   *
   * `dt` er tiden siden forrige bilde. Da blir farten den samme enten maskinen
   * klarer 60 bilder i sekundet eller 12, og to taster samtidig gir ett skritt
   * på skrå med samme fart som rett fram (derav normeringen).
   *
   * FARTEN FØLGER ØYEHØYDEN. Én regel, og både en fylling på tretti meter og en
   * veg på to kilometer får riktig fart av seg selv: står man på bakken går man
   * i gangfart, hever man seg flyr man. Shift løper, Alt sniker.
   *
   * Grunnfarten er hevet fra 2,2 til 4,5 m/s. Målt på gangfart: et menneskelig
   * napp på tasten – rundt hundre millisekunder – flyttet kameraet 22 cm på en
   * veg som er nesten to kilometer lang. Det ser ikke ut som en langsom modell,
   * det ser ut som en tast som ikke virker. `fartsfaktor` ganger oppå, og den
   * står til man endrer den.
   *
   * KONTRAKTEN FOR `_bakkeFlytt(fram, side)`: tallene er meter i BLIKKETS
   * ramme – fram er dit man ser, side er til høyre for blikket. Visningen
   * oversetter selv til sine egne akser. Vegen legger dem på stasjon og avvik
   * etter å ha dreid dem med vinkelen mellom blikket og vegen; tomta dreier dem
   * med kamYaw og legger dem rett på UTM. Sto det ikke skrevet ned, ville neste
   * visning arve tvetydigheten – og en veg der W flytter deg SIDELENGS når du
   * ser til siden ser like troverdig ut som en riktig.
   */
  _bakkeSteg(dt) {
    const t = this._taster;
    if (!t.size) return false;
    let fram = 0, side = 0, opp = 0;
    for (const k of t) {
      const r = Tegner3d.GAATASTER[k];
      if (!r) continue;
      fram += r[0]; side += r[1]; opp += r[2];
    }
    /* GÅR MAN, FØLGER IKKE FARTEN HØYDEN – for høyden står stille.
       Regelen «farten følger øyehøyden» er riktig når man flyr: står man nede
       går man sakte, hever man seg dekker man strekning. Går man, er høyden
       låst i 1,7 m, og da degenererer regelen til gulvet uansett. Ett tall,
       skrevet én gang. */
    const flyr = this.ferd === 'fly';
    const fart = (flyr ? Math.max(4.5, Math.min(600, 2.2 * this.kamH)) : 4.5)
      * (this.fartsfaktor || 1)
      * (t.has('shift') ? 3.5 : 1) * (t.has('alt') ? 0.3 : 1);
    let endret = false;
    if (fram || side) {
      const n = Math.hypot(fram, side);
      /* FLYR MAN, GÅR W DIT NESA PEKER – OGSÅ NEDOVER.
         Uten dette fløy man i vannrett plan uansett hvor man så: pekte man nesa
         ned mot en fylling og ga gass, ble man svevende like høyt og gled forbi
         over den. Fram deles derfor på en vannrett og en loddrett del etter
         blikkets høydevinkel, akkurat som et fly. Sidelengs er alltid vannrett –
         man ruller ikke. */
      const p = flyr ? this.kamPitch * Math.PI / 180 : 0;
      const vann = Math.cos(p);
      this._bakkeFlytt(fram / n * fart * dt * vann, side / n * fart * dt);
      if (flyr && fram) this._bakkeHev(fram / n * fart * dt * Math.sin(p));
      endret = true;
    }
    if (opp) {
      /* Q og E HEVER BARE NÅR MAN FLYR. Går man, er øyehøyden det som gjør
         bildet troverdig – en fylling som rager tolv meter over hodet ditt skal
         rage tolv meter, ikke ni eller femten. Første trykk bytter derfor til
         fly i stedet for å heve i det stille. */
      if (!flyr) { this.settFerd('fly'); return true; }
      /* Loddrett fart i meter per sekund, samme tall som framover. Her sto en
         ganging – `kamH * exp(...)` – og den er riktig for en zoom, men gal for
         en heis: nær bakken krøp man oppover i centimeter, og høyt oppe skjøt
         man forbi hele modellen på et sekund. */
      this._bakkeHev(opp * fart * dt);
      endret = true;
    }
    return endret;
  },

  /**
   * Hever eller senker kameraet i flymodus. Meter, ikke faktor.
   *
   * Under bakken slipper vi ingen: én meter over gulvet er gulvet i flymodus
   * òg. Å havne INNI terrenget er ikke en utsikt, det er en svart skjerm uten
   * forklaring, og det er den enkleste måten å tro at programmet har hengt seg.
   */
  _bakkeHev(dz) {
    if (this.ferd !== 'fly' || !dz) return;
    const g = this._sisteGitter;
    const gulv = (g && this._gulvNa) ? this._gulvNa(g) : null;
    const na = this.kamZ != null ? this.kamZ : ((gulv != null ? gulv : 0) + this.kamH);
    let ny = na + dz;
    if (gulv != null && Number.isFinite(gulv)) ny = Math.max(gulv + 1.6, Math.min(gulv + 4000, ny));
    this.kamZ = ny;
    if (gulv != null && Number.isFinite(gulv)) this.kamH = ny - gulv;
  },

  /** Løkka som holder gåingen i gang så lenge en tast er nede. */
  _bakkeLop() {
    if (this._lopId) return;
    let forrige = performance.now();
    const steg = na => {
      const dt = Math.min(0.1, Math.max(0, (na - forrige) / 1000));
      forrige = na;
      if (this.modus !== 'bakken' || !this._taster.size || !this.aktiv) {
        this._lopId = 0;
        this._farer = false;
        // ett skarpt bilde til slutt: under gåingen tegnes det i 60 % oppløsning
        clearTimeout(this._skarpt);
        this._skarpt = setTimeout(() => this.tegn(), 90);
        return;
      }
      this._farer = true;
      if (this._bakkeSteg(dt)) this.tegn();
      this._lopId = requestAnimationFrame(steg);
    };
    this._lopId = requestAnimationFrame(steg);
  },


  _avstand(e) {
    const a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  },


  /**
   * Dybden til det man tok tak i, i meter.
   *
   * Den setter hvor mange meter en musepiksel er verdt når man går: tar man
   * tak i noe nært, går man kort; tar man tak i horisonten, går man langt.
   * Det er det som gjør at «gå» kjennes som å dra i bakken og ikke som å skyve
   * et kamera.
   */
  _dybdeUnder(pos, c) {
    const t = this._slaOpp(pos, c);
    const g = this._sisteGitter, kam = this._sisteKam;
    if (t && t.k >= 0 && g && kam) {
      const tab = this._flateHoyde(g);
      const h = tab ? tab[t.k] : ((g.harGrav && g.harGrav[t.k]) ? g.zP[t.k] : g.zT[t.k]);
      const q = kam.punkt(g.wx[t.k], g.wy[t.k], h);
      if (Number.isFinite(q.w) && q.w > 1) return q.w;
    }
    /* OPPSLAGET FINNER BARE DET AKTIVE ANLEGGET – DYBDEBUFFERET FINNER ALT.
       `_slaOpp` leser id-bufferet, og bakgrunnsanleggene skriver aldri i det
       (med vilje: avlesningen skal ikke svare med tall fra et anlegg som ikke
       er regnet). Men de skriver i DYBDEbufferet, og det er den eneste
       opplysningen «dra for å gå» trenger. Uten dette falt farten tilbake på
       tretti meter over hver eneste bakgrunnspiksel: tok man tak i naboanlegget
       åtte hundre meter unna for å flytte seg dit, sto musa nesten stille. */
    const dyp = this._dyp, rb = this._sisteRb, rh = this._sisteRh;
    if (dyp && rb && rh && dyp.length === rb * rh && c && c.clientWidth) {
      // samme omregning som `_slaOpp`: pos er lerretsrelativ, ikke klientrelativ
      const ix = Math.round(pos.x * rb / c.clientWidth);
      const iy = Math.round(pos.y * rh / c.clientHeight);
      if (ix >= 0 && iy >= 0 && ix < rb && iy < rh) {
        const d = dyp[iy * rb + ix];
        if (Number.isFinite(d) && d > 1) return d;
      }
    }
    return 30;
  },

  /**
   * Bytter mellom å se modellen ovenfra og å stå i den.
   *
   * Byttet er ikke et klipp: man lander på stasjonen som alt er valgt, ser
   * langs vegen, og står to meter over bakken. Fra bakken tilbake beholdes
   * retningen. Man lander aldri et sted man ikke kjenner igjen.
   */
  settModus(m, stille) {
    if (m === this.modus) return;
    /* EN VISNING UTEN FØTTER KAN IKKE GÅ NED PÅ BAKKEN.
       Uten `_bakkePos` gir `_bakkeKamera` null, og `_kamera` faller stille
       tilbake til oversiktskameraet – som i bakkemodus får skala 1, altså én
       piksel per meter. Resultatet er et frimerke midt på lerretet, uten et ord
       om hvorfor. En halvferdig visning skal si fra, ikke gjette. */
    if (m === 'bakken' && !this._bakkePos) {
      if (this.app && this.app.status) this.app.status('Denne visningen kan ikke gås i ennå');
      return;
    }
    this.modus = m;
    // en tast som sto nede skal ikke fortsette å gå i den andre modusen
    if (this._taster) this._taster.clear();
    if (m === 'bakken') {
      this.kamH = this.ferd === 'gaa' ? Tegner3d.OYEHOYDE : 2.0;
      /* Plasser øyet FØR blikket settes: `seFramover` snur seg mot noe, og det
         kan den ikke gjøre før den vet hvor den står. */
      if (this._bakkeInn) this._bakkeInn();
      if (this.seFramover) this.seFramover();
    } else {
      this.yaw = this.kamYaw;
      /* Hjemvinkelen er visningens egen. Tallet 32 sto her, og det er vegens –
         tomta bruker 55. Kom man opp fra bakken på en tomt, landet man i vegens
         synsvinkel, og ingenting sa hvorfor bildet plutselig var flatere. */
      this.pitch = this.pitchHjem;
      this.fokus = null;
      this.panX = 0; this.panY = 0;
      this._skalaSatt = false;
    }
    /* KNAPPEN SPØR IKKE, DEN FÅR BESKJED.
       Her sto det en `classList.toggle` både i knappens onclick og i `nullstill`
       – to steder som måtte huske det samme. ↺ glemte det ene, og knappen ble
       stående som trykket inn i oversiktsmodus. Nå eier `settModus` tilstanden
       og forteller om den; det finnes ikke en vei ut av bakkemodus som ikke går
       gjennom denne linja. */
    if (this.paaModus) this.paaModus(m);
    if (!stille) this.tegn();
  },

  /** Cella under et skjermpunkt, slått opp i id-bufferet. O(1). */
  _slaOpp(p, c) {
    if (!this._id || !this._sisteRb) return null;
    const x = Math.round(p.x * this._sisteRb / c.clientWidth);
    const y = Math.round(p.y * this._sisteRh / c.clientHeight);
    if (x < 0 || y < 0 || x >= this._sisteRb || y >= this._sisteRh) return null;
    return { x: p.x, y: p.y, k: this._id[y * this._sisteRb + x] };
  },


  nullstill() {
    /* ↺ ER ALLTID VEIEN HJEM, OGSÅ FRA BAKKEN – og det hører hjemme HER.
       Bare vegen gjorde det, i sin egen overstyring. Da hadde hver ny visning
       som fikk bakkemodus én ting til å huske, og den som glemte det fikk et ↺
       som ikke tok deg hjem. */
    if (this.modus === 'bakken') this.settModus('oversikt', true);
    this.yaw = 0; this.pitch = this.pitchHjem; this.senter = null;
    this.fokus = null;
    this.panX = 0; this.panY = 0;
    this._skalaSatt = false;
    this.tegn();
  },

  /**
   * Setter dreiepunktet til en node i gitteret, uten at bildet rikker seg.
   *
   * Det er hele trikset: fokuspunktet er algebraisk låst til midten av
   * skjermen, så flytter man fokus dit man PEKER, må resten av bildet flyttes
   * like mye tilbake. Regnes forskyvningen ut fra det gamle og det nye
   * kameraet, står alt stille – og fra da av dreier man om det man ser på.
   */
  settFokus(k, g) {
    if (!g || k < 0 || k >= g.nb * g.nh || !g.finnes[k]) return;
    const c = this.lerret;
    if (!c || c.clientWidth < 20) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rb = c.clientWidth * dpr, rh = c.clientHeight * dpr;
    const tabF = this._flateHoyde(g);
    const hoyde = tabF ? tabF[k] : ((g.zP && g.harGrav && g.harGrav[k]) ? g.zP[k] : g.zT[k]);

    /* Hvor ligger noden PÅ SKJERMEN akkurat nå? */
    const fx0 = this._panFast ? this._panFast.x : 0;
    const fy0 = this._panFast ? this._panFast.y : 0;
    const foer = this._kamera(rb, rh, g, this.skala * dpr,
      (fx0 + (this.panX || 0)) * dpr, (fy0 + (this.panY || 0)) * dpr)
      .punkt(g.wx[k], g.wy[k], hoyde);

    this.fokus = { x: g.wx[k], y: g.wy[k], z: hoyde };
    /* MED FOKUS ER TILPASNINGENS FORSKYVNING ALLTID NULL.
       Den må settes her og ikke overlates til neste tegning: regnet man
       kompensasjonen mot den GAMLE forskyvningen, og tilpasningen så nullet
       den, spratt bildet like langt som den gamle forskyvningen var – målt
       180 px etter åtte dreininger. */
    this._panFast = { x: 0, y: 0 };
    const etter = this._kamera(rb, rh, g, this.skala * dpr,
      (this.panX || 0) * dpr, (this.panY || 0) * dpr)
      .punkt(g.wx[k], g.wy[k], hoyde);

    this.panX = (this.panX || 0) + (foer.px - etter.px) / dpr;
    this.panY = (this.panY || 0) + (foer.py - etter.py) / dpr;
    this._skalaSatt = true;
  },


  /**
   * Den dreiningen som gjør modellen størst på skjermen.
   *
   * En veg er lang og smal. Legger man den på tvers av en ruteform som er
   * høyere enn den er bred, må hele modellen krympe til den smaleste kanten
   * passer – og en 2 km veg blir en tråd. Kandidatene prøves derfor mot den
   * samme tilpasningen som brukes i tegningen, og den som gir størst skala
   * vinner. Ingen gjetning på formen: det er målt.
   */
  _besteYaw(kandidater, b, h, g, andre) {
    const foer = this.yaw;
    let best = foer, beste = -Infinity;
    for (const v of kandidater) {
      this.yaw = v;
      /* Bakgrunnsanleggene MÅ være med her når de vises: dreiningen som gjør
         vegen alene størst er ikke den samme som gjør vegen OG de to tomtene
         ved siden av størst. Uten dem ville «hjem» valgt en vinkel der halve
         scenen ligger utenfor kanten. */
      const t = this._tilpassSkala(b, h, g, andre);
      if (t.skala > beste) { beste = t.skala; best = v; }
    }
    this.yaw = foer;
    return best;
  },


  /** De to lerretene slått sammen til ett bilde, med merket brent inn. */
  eksportBilde() {
    if (!this.lerret || !this.over) return null;
    const l = document.createElement('canvas');
    l.width = this.over.width; l.height = this.over.height;
    const k = l.getContext('2d');
    k.drawImage(this.lerret, 0, 0, l.width, l.height);
    k.drawImage(this.over, 0, 0, l.width, l.height);
    return l.toDataURL('image/png');
  },


  /** Fargene er hentet fra stilarket og må bygges på nytt ved temabytte. */
  glemFarger() { this._palettFor = null; },

};

/**
 * Tegn på neste bilde, ikke nå. Til ResizeObserver.
 *
 * `tegn()` setter `canvas.width`, og det ENDRER elementets boks. Kalt rett inne
 * i observatørens tilbakekall melder nettleseren «ResizeObserver loop completed
 * with undelivered notifications» – en advarsel som ser skummel ut, men som
 * bare sier at man skrev til layouten mens den ble målt.
 *
 * Utsatt til neste bilde er skrivingen utenfor målingen, og flere varsler i
 * samme omgang – panelet vokser, lerretet vokser, fullskjerm slår inn – blir til
 * ÉN opptegning i stedet for tre.
 *
 * Fri funksjon og ikke en metode: den brukes av fem visninger som ikke deler
 * prototype – to i 3D og tre flate. Å låne en metode på tvers med `call` ville
 * skjult nettopp det at de ikke er i slekt.
 */
function tegnSnart(vis) {
  if (vis._venterTegn) return;
  vis._venterTegn = requestAnimationFrame(() => {
    vis._venterTegn = 0;
    vis.tegn();
  });
}

/**
 * Tastene man går med, som [fram, side, opp].
 *
 * WASD OG PILTASTENE GJØR DET SAMME. Den som har spilt et spill rekker etter
 * WASD uten å tenke; den som ikke har det, rekker etter piltastene. Å velge én
 * av dem er å gjøre halvparten av folk til nybegynnere igjen.
 *
 * Alt slås opp i småbokstaver, ellers slutter W å virke i det øyeblikket man
 * holder shift for å løpe.
 */
/* Øyehøyden til en voksen som står. Ikke et rundt tall som ser fint ut – hele
   poenget med å gå er at fyllinga skal rage nøyaktig så høyt over deg som den
   kommer til å gjøre. */
Tegner3d.OYEHOYDE = 1.7;

Tegner3d.GAATASTER = {
  w: [1, 0, 0], arrowup: [1, 0, 0],
  s: [-1, 0, 0], arrowdown: [-1, 0, 0],
  a: [0, -1, 0], arrowleft: [0, -1, 0],
  d: [0, 1, 0], arrowright: [0, 1, 0],
  e: [0, 0, 1], pageup: [0, 0, 1],
  q: [0, 0, -1], pagedown: [0, 0, -1],
  /* SNIKETASTEN ER ALT, IKKE CTRL.
     Ctrl+bokstav er programmets egne snarveier – S lagrer, Z angrer, Y gjør om –
     og S er samtidig gåtasten bakover. Med Ctrl som snik måtte gåingen enten
     sluke Ctrl+S eller slippe sniket; Alt kolliderer med ingenting. */
  shift: [0, 0, 0], alt: [0, 0, 0]
};

if (typeof module !== 'undefined') module.exports = Tegner3d;
