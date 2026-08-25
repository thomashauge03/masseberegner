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
    const dist = Math.max(60, g.diagonal * 1.6);
    const cx = b / 2 + (panX || 0), cy = h / 2 + (panY || 0);
    const ov = this.overdriv;
    /* F er brennvidden i rasterpiksler. `px = cx + F·rx/w` er algebraisk
       identisk med den gamle `cx + rx·(dist/(dist+dk))·skala` – bare skrevet
       slik at bakkekameraet, som har en ekte øyeposisjon, kan bruke NØYAKTIG
       den samme rasteriseringen. */
    const F = dist * skala;
    return {
      dist, skala, F, cx, cy,
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
  _tilpassSkala(b, h, g) {
    /* På bakken finnes ingen innramming: kameraet har en posisjon, og skala og
       forskyvning brukes ikke i det hele tatt. Uten dette ville tilpasningen
       regnet en meningsløs skala av et perspektivbilde og skrevet den inn. */
    if (this.modus === 'bakken') return { skala: 1, panX: 0, panY: 0 };
    const k = this._kamera(b, h, g, 1, 0, 0);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    const legg = (i, j) => {
      if (i < 0 || j < 0 || i >= g.nb || j >= g.nh) return;
      for (const z of [g.lav, g.hoy]) {
        const q = k.punkt(g.wx[j * g.nb + i], g.wy[j * g.nb + i], z);
        const rx = q.px - b / 2, ry = q.py - h / 2;      // skala er 1 her
        minX = Math.min(minX, rx); maksX = Math.max(maksX, rx);
        minY = Math.min(minY, ry); maksY = Math.max(maksY, ry);
      }
    };
    const steg = Math.max(1, Math.floor(Math.max(g.nb, g.nh) / 24));
    for (let i = 0; i < g.nb; i += steg) { legg(i, 0); legg(i, g.nh - 1); }
    for (let j = 0; j < g.nh; j += steg) { legg(0, j); legg(g.nb - 1, j); }
    legg(g.nb - 1, g.nh - 1);
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
    // under dragning og gåing tegnes rasteret grovere og blåses opp
    const kvalitet = (this._drar || this._farer) ? 0.6 : 1;
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
      const t = this._tilpassSkala(rb, rh, g);
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
      this._lag2.fill(0);
      this._dyp2.fill(Infinity);
      this._raster(g, lag.hoyde, lag.farge, this._lag2, this._dyp2, null, rb, rh, kam, lag.krev);
      const styrke = lag.blanding;
      const p = this._piksler, d1 = this._dyp, d2 = this._dyp2, l2 = this._lag2;
      for (let i = 0; i < n; i++) {
        if (!l2[i]) continue;
        if (d2[i] > d1[i]) continue;                 // ligger bak det ugjennomsiktige
        const s = l2[i], u = p[i];
        const r = ((s & 255) * styrke + (u & 255) * (1 - styrke)) | 0;
        const gg = (((s >> 8) & 255) * styrke + ((u >> 8) & 255) * (1 - styrke)) | 0;
        const bl = (((s >> 16) & 255) * styrke + ((u >> 16) & 255) * (1 - styrke)) | 0;
        p[i] = (255 << 24) | (bl << 16) | (gg << 8) | r;
      }
    }

    g2.putImageData(this._bilde, 0, 0);
    this._sisteGitter = g;
    this._sisteKam = kam;
    this._sisteRb = rb; this._sisteRh = rh;
    this._tegnOverlegg(g, kam, b, h, dpr);
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
      const linjerB = ['PÅ BAKKEN · øyet ' + t2(this.kamH) + ' m over bakken'];
      /* HVOR MAN STÅR VET BARE VISNINGEN.
         Her sto vegens «Profil … · på senterlinja», lest rett av
         `app.tverrStasjon`. På en tomt er det tallet 0 og ikke null, så tomta
         ville fått linja «Profil 0 · på senterlinja» – om en veg den ikke har. */
      if (this._bakkeHud) linjerB.push(...this._bakkeHud());
      /* Tastene MÅ stå i bildet. Et kamera man må gjette seg til er et kamera
         man ikke bruker, og det er ingen annen plass å skrive dem. */
      linjerB.push('W A S D eller piltaster kjører · Shift løper · Q E hever og senker'
        + ' · musa ser seg om · F ser framover · Esc tilbake');
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
    const fart = Math.max(4.5, Math.min(600, 2.2 * this.kamH))
      * (this.fartsfaktor || 1)
      * (t.has('shift') ? 3.5 : 1) * (t.has('alt') ? 0.3 : 1);
    let endret = false;
    if (fram || side) {
      const n = Math.hypot(fram, side);
      this._bakkeFlytt(fram / n * fart * dt, side / n * fart * dt);
      endret = true;
    }
    if (opp) {
      // høyden ganges, ikke legges til: ett sekund på Q er alltid samme SPRANG
      this.kamH = Math.max(1.6, Math.min(4000, this.kamH * Math.exp(opp * 1.6 * dt)));
      endret = true;
    }
    return endret;
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
    if (!t || t.k < 0 || !g || !kam) return 30;
    const tab = this._flateHoyde(g);
    const h = tab ? tab[t.k] : ((g.harGrav && g.harGrav[t.k]) ? g.zP[t.k] : g.zT[t.k]);
    const q = kam.punkt(g.wx[t.k], g.wy[t.k], h);
    return Number.isFinite(q.w) && q.w > 1 ? q.w : 30;
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
      this.kamH = 2.0;
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
  _besteYaw(kandidater, b, h, g) {
    const foer = this.yaw;
    let best = foer, beste = -Infinity;
    for (const v of kandidater) {
      this.yaw = v;
      const t = this._tilpassSkala(b, h, g);
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
