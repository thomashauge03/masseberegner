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


  /**
   * Fargeskalaen, som en oppslagstabell.
   *
   * Samme farger og samme kurve som fargeoverlegget i kartet: kvadratrota av
   * avviket delt på det største. Kurven gjør at de små avvikene – der man
   * faktisk skal se om det blir graving eller fylling – ikke drukner i det
   * ene punktet som er seks meter dypt.
   */
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
    const a = this.yaw * Math.PI / 180, p = this.pitch * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    const s = this.senter || { x: g.midtX, y: g.midtY };
    const z0 = (g.lav + g.hoy) / 2;
    const dist = Math.max(60, g.diagonal * 1.6);
    const cx = b / 2 + (panX || 0), cy = h / 2 + (panY || 0);
    const ov = this.overdriv;
    return {
      dist, skala,
      /** @returns {{px,py,dk}} px/py i piksler, dk er dybden (vokser bortover) */
      punkt: (wx, wy, wz) => {
        const x = wx - s.x, y = wy - s.y, z = (wz - z0) * ov;
        const rx = x * ca + y * sa;
        const ry = -x * sa + y * ca;
        const dk = -(ry * cp + z * sp);
        const sy = ry * sp - z * cp;
        const f = dist / (dist + dk);
        return { px: cx + rx * f * skala, py: cy + sy * f * skala, dk };
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
    const px = this._px || (this._px = []);
    const py = this._py || (this._py = []);
    const pd = this._pd || (this._pd = []);
    const n = nb * nh;
    if (px.length < n) { px.length = n; py.length = n; pd.length = n; }
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        if (!g.finnes[k]) { pd[k] = NaN; continue; }
        const q = kam.punkt(g.wx[k], g.wy[k], hoyde[k]);
        px[k] = q.px; py[k] = q.py; pd[k] = q.dk;
      }
    }

    const trekant = (ax, ay, ad, bx, by, bd, cx2, cy2, cd, f) => {
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
          let w0 = ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax)) * inv;
          let w1 = ((cx2 - bx) * (qy - by) - (cy2 - by) * (qx - bx)) * inv;
          let w2 = ((ax - cx2) * (qy - cy2) - (ay - cy2) * (qx - cx2)) * inv;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          // w1 hører til hjørne a, w2 til b, w0 til c
          const d = ad * w1 + bd * w2 + cd * w0;
          const p = y * b + x;
          if (d >= dyp[p]) continue;
          dyp[p] = d;
          ut[p] = f;
          if (id) id[p] = this._idNa;
        }
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
        trekant(px[k00], py[k00], pd[k00], px[k10], py[k10], pd[k10], px[k11], py[k11], pd[k11], f);
        trekant(px[k00], py[k00], pd[k00], px[k11], py[k11], pd[k11], px[k01], py[k01], pd[k01], f);
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
  _lys(g, k00, k10, k01, z) {
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
    // under dragning tegnes rasteret grovere og blåses opp
    const kvalitet = this._drar ? 0.6 : 1;
    const rb = Math.max(2, Math.round(b * dpr * kvalitet));
    const rh = Math.max(2, Math.round(h * dpr * kvalitet));
    if (c.width !== rb || c.height !== rh) { c.width = rb; c.height = rh; }
    const g2 = c.getContext('2d');

    const res = this.app && this.app.resultat;
    /* Om det finnes noe å tegne, vet VISNINGEN – ikke tegneren. Her sto det en
       gang en sjekk på res.rutenett, som er tomtas felt; en veg har profiler i
       stedet, og da ga tegneren opp før den kom til gitteret. */
    if (!this._harData(res)) {
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
    if (!g) { this._tomMelding(g2, rb, rh, dpr * kvalitet, 'For mye å tegne i 3D på én gang'); return; }

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
    this._dyp.fill(Infinity);
    this._id.fill(-1);

    const pal = this._palett();

    /* LAGENE KOMMER FRA VISNINGEN, IKKE FRA TEGNEREN.
       Hver visning – tomt eller veg – sier hvilke flater som skal tegnes, i
       hvilken rekkefølge, med hvilken farge og hvor gjennomsiktige. Tegneren
       under vet ingenting om hva en gravflate eller en vegbane er.
       Alternativet var en `if (kilde === 'veg')` spredt gjennom hele
       tegneveien, og da blir hver tomtefeil en vegfeil og omvendt. */
    for (const lag of this._lagliste(g, pal)) {
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
    const linjer = this._hudLinjer ? this._hudLinjer(g) : [];
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

    // målestokk: en to meters pinne i det laveste punktet
    const pinne = 2;
    const p0 = skjerm(g.wx[0], g.wy[0], g.lav);
    const p1 = skjerm(g.wx[0], g.wy[0], g.lav + pinne);
    k.strokeStyle = Farger.blekk; k.lineWidth = 2;
    k.beginPath(); k.moveTo(p0.x, p0.y); k.lineTo(p1.x, p1.y); k.stroke();
    k.fillStyle = Farger.blekk; k.font = '10px system-ui, sans-serif'; k.textAlign = 'left';
    k.fillText(pinne + ' m', p1.x + 4, p1.y + 3);

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
        panX: this.panX || 0, panY: this.panY || 0, flyttet: 0
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
      if (dra.flytter) {
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
      if (dra && !dra.flytter && dra.flyttet < 4 && this._velg) {
        const p = e && e.changedTouches
          ? (() => { const r = c.getBoundingClientRect(), t = e.changedTouches[0];
            return { x: t.clientX - r.left, y: t.clientY - r.top }; })()
          : { x: dra.x, y: dra.y };
        const traff = this._slaOpp(p, c);
        if (traff && traff.k >= 0) this._velg(traff.k, this._sisteGitter);
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
    c.addEventListener('dblclick', () => this.nullstill());

    /* Piltaster. Lerretet får tabIndex i HTML-en, så det kan ta imot taster når
       man har klikket i det. Uten `_stegVis` gjør de ingenting – tomta har
       ingen retning å gå i.

       stopPropagation MÅ være der. App-en har sin egen piltasthåndtering på
       document som flytter tverrsnittet ett hakk. Uten den ble hvert tastetrykk
       til to hakk, og shift-spranget på ti til elleve – nøyaktig den slags feil
       ingen melder fra om, de bare slutter å bruke tastene. */
    c.addEventListener('keydown', e => {
      const steg = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (steg && this._stegVis) {
        this._stegVis(steg * (e.shiftKey ? 10 : 1));
        e.preventDefault();
        e.stopPropagation();
      }
    });
  },


  _avstand(e) {
    const a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
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
    this.yaw = 0; this.pitch = 55; this.senter = null;
    this.panX = 0; this.panY = 0;
    this._skalaSatt = false;
    this.tegn();
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

if (typeof module !== 'undefined') module.exports = Tegner3d;
