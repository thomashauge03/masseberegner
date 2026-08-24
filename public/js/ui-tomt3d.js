'use strict';
/**
 * Tomta i tre dimensjoner.
 *
 * Tverrsnittet viser ett snitt om gangen, og kartet viser flaten ovenfra. Det
 * som er vanskeligst å se for seg, er nettopp det de to ikke viser: hvordan
 * skråningene legger seg rundt tomta, og hvor de treffer bakken. Det er der
 * mesteparten av volumet ligger.
 *
 * HVORFOR VI TEGNER DETTE SELV
 * Et bibliotek som three.js virker og er gratis, men koster prosjektets første
 * ekte avhengighet: 190 kB som må sjekkes inn eller hentes over nett, en
 * importmap i index.html, og en lastetilstand å håndtere. Verre: legger man
 * inn et modulskript slik alle eksemplene viser, blokkerer det DOMContentLoaded
 * – og hele appen starter på DOMContentLoaded. På dårlig dekning i felt ville
 * brukeren fått en hvit skjerm, og ved brudd ville programmet aldri startet.
 * Det er en feil som ikke synes på kontoret.
 *
 * Et regulært rutenett er dessuten det enkleste 3D-tilfellet som finnes.
 * Cellene ligger allerede i rader og kolonner, så det trengs ingen
 * dybdesortering av trekanter – bare et dybdebuffer per piksel.
 *
 * HVORFOR IKKE ctx.fill() PER CELLE
 * Det var det opplagte: én firkant per celle med canvas. Målt gir det 4–12
 * bilder i sekundet på en vanlig tomt, og kantutjevningen slipper bakgrunnen
 * gjennom mellom hver eneste firkant – flaten blir et fint nett av sprekker.
 * Å skrive pikslene selv i en Uint32Array er tiere ganger raskere og har ingen
 * sprekker i det hele tatt.
 *
 * DEN VIKTIGSTE REGELEN
 * Alle høyder kommer fra `res.rutenett` – det samme rutenettet volumet er
 * regnet på. Denne fila regner ALDRI ut sin egen skråningsgeometri. En
 * 3D-visning som viser noe annet enn tallene ved siden av, er verre enn ingen.
 */

const Tomt3d = {
  app: null,
  lerret: null,        // rasteret
  over: null,          // vektoroverlegget: streker, tall, nordpil
  aktiv: false,

  // kamera
  yaw: 0,              // grader, dreining om loddaksen
  pitch: 55,           // grader over horisonten
  skala: 1,            // piksler per meter i bakkeplanet
  overdriv: 1,         // vertikal overdrivning
  senter: null,        // {x, y} i UTM, det bildet dreier om

  lag: { terreng: true, grav: true, fjell: false, overbygning: false, rutenett: false, grenser: true },

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tomt3d');
    this.over = document.getElementById('tomt3dover');
    if (!this.lerret) return this;
    this._musKobling();
    /* Samme mønster som tverrprofilen: lerretet endrer størrelse når panelet
       gjør det, og da må det tegnes på nytt. Observatøren fyrer også når
       panelet er skjult (størrelse null), og da returnerer tegn() med én gang. */
    new ResizeObserver(() => this.tegn()).observe(this.lerret);
    return this;
  },

  /** Slår visningen på eller av. Alt arbeid henger på denne. */
  aktiver(pa) {
    this.aktiv = !!pa;
    const vis = (id, synlig) => {
      const e = document.getElementById(id);
      if (e) e.classList.toggle('skjult', !synlig);
    };
    vis('tomt3d', this.aktiv);
    vis('tomt3dover', this.aktiv);
    vis('tomtprofil', !this.aktiv);
    vis('tomtKanter', !this.aktiv);
    vis('tomt3dverktoy', this.aktiv);
    vis('snittverktoy', !this.aktiv);
    for (const [id, pa2] of [['tomtVis3d', this.aktiv], ['tomtVisSnitt', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    if (this.aktiv) this.tegn(); else Tomteprofil.tegn();
  },

  /** Fargene er hentet fra stilarket og må bygges på nytt ved temabytte. */
  glemFarger() { this._palettFor = null; },

  /* ================================================================
     GITTERET
     ================================================================ */

  /**
   * Rutenettet som et regulært gitter, med høyder i hjørnene.
   *
   * Cellene i `res.rutenett` har koordinaten i SENTER av cella. En flate må
   * tegnes mellom hjørner, ikke mellom sentre, ellers får flaten et hull på en
   * halv celle hele veien rundt kanten. Nodehøyden er derfor middelet av de
   * cellene som møtes i noden.
   *
   * Oppskriften for å finne (i, j) er nøyaktig den samme som fargeoverlegget i
   * kartet bruker. Avviker de, ligger 3D-modellen forskjøvet en halv rute i
   * forhold til fargene – og ingen ville sett hvilken av dem som var riktig.
   */
  _gitter(steg) {
    const res = this.app && this.app.resultat;
    const celler = res && res.rutenett;
    if (!celler || !celler.length) return null;
    if (this._gitterFor === celler && this._gitterSteg === steg) return this._gitterBuffer;

    const rute = Math.max(0.05, (this.app.P.mal.rutestorrelse || 1)) * steg;
    let minX = Infinity, minY = Infinity, maksX = -Infinity, maksY = -Infinity;
    for (const c of celler) {
      minX = Math.min(minX, c.x); maksX = Math.max(maksX, c.x);
      minY = Math.min(minY, c.y); maksY = Math.max(maksY, c.y);
    }
    const nb = Math.round((maksX - minX) / rute) + 1;
    const nh = Math.round((maksY - minY) / rute) + 1;
    if (!(nb > 0 && nh > 0) || nb * nh > 4e6) return null;

    const n = nb * nh;
    const sumT = new Float64Array(n), sumP = new Float64Array(n), sumF = new Float64Array(n);
    const sumFerdig = new Float64Array(n);
    const antall = new Int32Array(n), antallFerdig = new Int32Array(n);
    const maksD = new Float32Array(n);
    const inne = new Uint8Array(n), usikker = new Uint8Array(n);

    /* Slås celler sammen, tas MIDDELET av høydene og MAKS av avviket.
       Med middelverdi på avviket forsvinner en dyp grøft i sammenslåingen, og
       fargen viser en jevn flate der det i virkeligheten er et hull. */
    for (const c of celler) {
      const i = Math.round((c.x - minX) / rute), j = Math.round((c.y - minY) / rute);
      if (i < 0 || j < 0 || i >= nb || j >= nh) continue;
      const k = j * nb + i;
      if (Number.isFinite(c.zT)) { sumT[k] += c.zT; }
      if (Number.isFinite(c.zPlanum)) { sumP[k] += c.zPlanum; }
      if (Number.isFinite(c.zFjell)) { sumF[k] += c.zFjell; }
      antall[k]++;
      if (c.zFerdig != null && Number.isFinite(c.zFerdig)) { sumFerdig[k] += c.zFerdig; antallFerdig[k]++; }
      if (Math.abs(c.d) > Math.abs(maksD[k])) maksD[k] = c.d;
      if (c.inne) inne[k] = 1;
    }

    /* Skråningsfoten forteller hvor tallene IKKE står på egne ben: der
       skråningen ble brattet opp for å nå bakken innenfor grensa, eller ikke
       landet i det hele tatt. De cellene tegnes bleikere, så man ikke leser
       dem som like sikre som resten. */
    const fot = (res.skraningsfot || []).filter(f => f.tvunget > 0 || f.traff !== true);
    for (const f of fot) {
      const i = Math.round((f.x - minX) / rute), j = Math.round((f.y - minY) / rute);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < nb && b < nh) usikker[b * nb + a] = 1;
        }
      }
    }

    const zT = new Float32Array(n), zP = new Float32Array(n), zF = new Float32Array(n);
    const zFerdig = new Float32Array(n), harFerdig = new Uint8Array(n);
    const finnes = new Uint8Array(n);
    let hoppet = 0;
    for (let k = 0; k < n; k++) {
      if (!antall[k]) { hoppet++; continue; }
      finnes[k] = 1;
      zT[k] = sumT[k] / antall[k];
      zP[k] = sumP[k] / antall[k];
      zF[k] = sumF[k] / antall[k];
      if (antallFerdig[k]) { zFerdig[k] = sumFerdig[k] / antallFerdig[k]; harFerdig[k] = 1; }
    }

    let lav = Infinity, hoy = -Infinity, maksAvvik = 0;
    for (let k = 0; k < n; k++) {
      if (!finnes[k]) continue;
      lav = Math.min(lav, zT[k], zP[k]);
      hoy = Math.max(hoy, zT[k], zP[k]);
      maksAvvik = Math.max(maksAvvik, Math.abs(maksD[k]));
    }
    if (!Number.isFinite(lav)) return null;

    const g = {
      nb, nh, rute, minX, minY, lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
      zT, zP, zF, zFerdig, harFerdig, d: maksD, finnes, inne, usikker,
      hoppet, totalt: n, celler: celler.length
    };
    this._gitterFor = celler; this._gitterSteg = steg; this._gitterBuffer = g;
    return g;
  },

  /* ================================================================
     FARGE OG LYS
     ================================================================ */

  /**
   * Fargeskalaen, som en oppslagstabell.
   *
   * Samme farger og samme kurve som fargeoverlegget i kartet: kvadratrota av
   * avviket delt på det største. Kurven gjør at de små avvikene – der man
   * faktisk skal se om det blir graving eller fylling – ikke drukner i det
   * ene punktet som er seks meter dypt.
   */
  _palett() {
    const tema = Farger.hent('flate') + '|' + Farger.hent('data-skjaering-flate');
    if (this._palettFor === tema) return this._palettBuffer;
    const skj = Farger.skjaeringFlateRgb, fyl = Farger.fyllingFlateRgb;
    const grunn = Farger.terrengRgb;
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
    // fra nøytral grå (ingen forskjell) til full styrke
    const noytral = [Math.round((grunn[0] + 255) / 2), Math.round((grunn[1] + 255) / 2), Math.round((grunn[2] + 255) / 2)];
    this._palettBuffer = { N, skjaering: bygg(noytral, skj), fylling: bygg(noytral, fyl) };
    this._palettFor = tema;
    return this._palettBuffer;
  },

  /* ================================================================
     PROJEKSJON
     ================================================================ */

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
    const s = this.senter || { x: g.minX + g.nb * g.rute / 2, y: g.minY + g.nh * g.rute / 2 };
    const z0 = (g.lav + g.hoy) / 2;
    const dist = Math.max(60, Math.hypot(g.nb * g.rute, g.nh * g.rute) * 1.6);
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
        const q = k.punkt(g.minX + i * g.rute, g.minY + j * g.rute, z);
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

  /* ================================================================
     RASTERISERING
     ================================================================ */

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
  _raster(g, hoyde, farge, ut, dyp, id, b, h, kam) {
    const nb = g.nb, nh = g.nh, rute = g.rute;
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
        const q = kam.punkt(g.minX + i * rute, g.minY + j * rute, hoyde[k]);
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
  _lys(z00, z10, z01, rute) {
    const dx = (z10 - z00) / rute, dy = (z01 - z00) / rute;
    // normalen er (-dx, -dy, 1) normalisert; lyset kommer fra nordvest og oppe
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    const l = (-dx * -0.4 + -dy * 0.4 + 1 * 0.82) / len;
    return 0.55 + 0.45 * Math.max(0, Math.min(1, l));
  },

  /* ================================================================
     TEGNING
     ================================================================ */

  tegn() {
    if (!this.aktiv || !this.lerret) return;
    const c = this.lerret;
    if (c.offsetParent === null) return;          // panelet er skjult: null arbeid
    const b = c.clientWidth, h = c.clientHeight;
    if (b < 20 || h < 20) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // under dragning tegnes rasteret grovere og blåses opp
    const kvalitet = this._drar ? 0.6 : 1;
    const rb = Math.max(2, Math.round(b * dpr * kvalitet));
    const rh = Math.max(2, Math.round(h * dpr * kvalitet));
    if (c.width !== rb || c.height !== rh) { c.width = rb; c.height = rh; }
    const g2 = c.getContext('2d');

    const res = this.app && this.app.resultat;
    if (!res || !res.rutenett || !res.rutenett.length) {
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
    if (!g) { this._tomMelding(g2, rb, rh, dpr * kvalitet, 'For stort rutenett til å tegnes i 3D'); return; }

    if (!this.senter) this.senter = { x: g.minX + g.nb * g.rute / 2, y: g.minY + g.nh * g.rute / 2 };
    if (!this._skalaSatt) {
      const t = this._tilpassSkala(rb, rh, g);
      this.skala = t.skala / (dpr * kvalitet);
      this._panFast = { x: t.panX / (dpr * kvalitet), y: t.panY / (dpr * kvalitet) };
      this._skalaSatt = true;
    }
    /* Alt kameraet ser, regnes i RASTERPIKSLER. Skalaen og forskyvningen lagres
       i skjermpiksler, fordi det er der musa og hjulet lever. */
    const f = dpr * kvalitet;
    const kam = this._kamera(rb, rh, g, this.skala * f,
      (this._panFast ? this._panFast.x : 0) * f,
      (this._panFast ? this._panFast.y : 0) * f);
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

    // 1) gravflaten, ugjennomsiktig
    if (this.lag.grav) {
      const fargeGrav = (k00, k10, k01, k11, z) => {
        const d = g.d[k00];
        const t = Math.min(1, Math.sqrt(Math.abs(d) / g.maksAvvik));
        const tab = d >= 0 ? pal.skjaering : pal.fylling;
        const i = Math.min(pal.N - 1, Math.round(t * (pal.N - 1))) * 3;
        let r = tab[i], gg = tab[i + 1], bl = tab[i + 2];
        const ly = this._lys(z[k00], z[k10], z[k01], g.rute);
        // celler der skråningen ikke sto på egne ben tones ned
        const m = g.usikker[k00] ? 0.82 : 1;
        r = Math.min(255, r * ly * m); gg = Math.min(255, gg * ly * m); bl = Math.min(255, bl * ly * m);
        if (this.lag.rutenett && this._paaRutelinje(g, k00)) { r *= 0.72; gg *= 0.72; bl *= 0.72; }
        return (255 << 24) | (bl << 16) | (gg << 8) | r;
      };
      this._raster(g, g.zP, fargeGrav, this._piksler, this._dyp, this._id, rb, rh, kam);
    }

    // 2) terrenget og fjellet, halvgjennomsiktig oppå
    const blandLag = (hoyde, rgb, styrke, hopp) => {
      this._lag2.fill(0);
      this._dyp2.fill(Infinity);
      const f = (k00, k10, k01, k11, z) => {
        if (hopp && hopp(k00)) return 0;
        const ly = this._lys(z[k00], z[k10], z[k01], g.rute);
        const r = Math.min(255, rgb[0] * ly), gg = Math.min(255, rgb[1] * ly), bl = Math.min(255, rgb[2] * ly);
        return (255 << 24) | (bl << 16) | (gg << 8) | r;
      };
      /* Hvert gjennomsiktige lag får SITT EGET dybdebuffer. Slår man i stedet
         av dybdeskrivingen, blander to firkanter av samme lag seg der de
         overlapper, og flaten får flekker. */
      this._raster(g, hoyde, f, this._lag2, this._dyp2, null, rb, rh, kam);
      const p = this._piksler, d1 = this._dyp, d2 = this._dyp2, l2 = this._lag2;
      for (let i = 0; i < n; i++) {
        if (!l2[i]) continue;
        if (d2[i] > d1[i]) continue;                 // ligger bak gravflaten
        const s = l2[i], u = p[i];
        const r = ((s & 255) * styrke + (u & 255) * (1 - styrke)) | 0;
        const gg = (((s >> 8) & 255) * styrke + ((u >> 8) & 255) * (1 - styrke)) | 0;
        const bl = (((s >> 16) & 255) * styrke + ((u >> 16) & 255) * (1 - styrke)) | 0;
        p[i] = (255 << 24) | (bl << 16) | (gg << 8) | r;
      }
    };
    if (this.lag.terreng) blandLag(g.zT, Farger.terrengRgb, 0.45);
    if (this.lag.fjell) blandLag(g.zF, Farger.fjellRgb, 0.5);
    if (this.lag.overbygning) blandLag(g.zFerdig, Farger.rgb('data-baerelag'), 0.6, k => !g.harFerdig[k]);

    g2.putImageData(this._bilde, 0, 0);
    this._sisteGitter = g;
    this._sisteKam = kam;
    this._sisteRb = rb; this._sisteRh = rh;
    this._tegnOverlegg(g, kam, b, h, dpr);
  },

  /** Er cella nær en 10 m-linje i UTM? Da tones den ned, som et drapert rutenett. */
  _paaRutelinje(g, k) {
    const i = k % g.nb, j = (k / g.nb) | 0;
    const x = g.minX + i * g.rute, y = g.minY + j * g.rute;
    const naer = v => Math.abs(v - Math.round(v / 10) * 10) < g.rute * 0.6;
    return naer(x) || naer(y);
  },

  _tomMelding(g2, b, h, s, tekst) {
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.fillStyle = Farger.flate;
    g2.fillRect(0, 0, b, h);
    g2.fillStyle = Farger.blekkSvak;
    g2.font = Math.round(13 * s) + 'px system-ui, sans-serif';
    g2.textAlign = 'center';
    g2.fillText(tekst || 'Tegn tomta i kartet og sett en kote, så kommer modellen her', b / 2, h / 2);
  },

  /* ================================================================
     OVERLEGGET: streker, tall og hjelpemidler
     ================================================================ */

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
    const res = this.app.resultat;
    /* Overlegget tegnes i SKJERMpiksler, rasteret i rasterpiksler. Uten
       omregningen havner strekene et annet sted enn flaten de skal ligge på. */
    const skjerm = (wx, wy, wz) => {
      const q = kam.punkt(wx, wy, wz);
      return { x: q.px * b / this._sisteRb, y: q.py * h / this._sisteRh };
    };

    // tomtegrensa og skråningsfoten, tegnet som streker på flaten
    if (this.lag.grenser) {
      const t = this.app.P.tomt;
      const p = this.app.tomtIUtm(t);
      const flate = this.app._innerflate || p;
      const zVed = (x, y) => {
        const i = Math.round((x - g.minX) / g.rute), j = Math.round((y - g.minY) / g.rute);
        const kk = j * g.nb + i;
        return (i >= 0 && j >= 0 && i < g.nb && j < g.nh && g.finnes[kk]) ? g.zP[kk] : g.lav;
      };
      const strek = (punkt, farge, bredde, lukk) => {
        if (punkt.length < 2) return;
        k.strokeStyle = farge; k.lineWidth = bredde; k.beginPath();
        punkt.forEach((q, i) => {
          const s = skjerm(q.x, q.y, q.z != null ? q.z : zVed(q.x, q.y));
          if (i === 0) k.moveTo(s.x, s.y); else k.lineTo(s.x, s.y);
        });
        if (lukk) k.closePath();
        k.stroke();
      };
      strek(flate, Farger.veg, 2, true);
      if (t.omrissBetyr === 'yttergrense' && flate !== p) strek(p, Farger.blekkSvak, 1.4, true);
      for (const s of (typeof Eksport !== 'undefined' ? Eksport.fotstrekk(res.skraningsfot || []) : [])) {
        strek(s.punkt, s.type === 'skjaering' ? Farger.skjaering : Farger.fylling, 1.6, false);
      }
    }

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
    const linjer = [];
    if (res && res.sum) {
      linjer.push(`${t2(res.sum.skjaering)} m³ skjæring · ${t2(res.sum.fylling)} m³ fylling`);
      linjer.push(`${t2(res.arealMedSkraning)} m² med skråninger · rute ${t2(g.rute, 2)} m`);
    }
    const usikre = this._tellUsikre(g);
    if (usikre) linjer.push(`${usikre} ruter er bleiket – skråningen der står ikke på egne ben`);
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
    const p0 = skjerm(g.minX, g.minY, g.lav);
    const p1 = skjerm(g.minX, g.minY, g.lav + pinne);
    k.strokeStyle = Farger.blekk; k.lineWidth = 2;
    k.beginPath(); k.moveTo(p0.x, p0.y); k.lineTo(p1.x, p1.y); k.stroke();
    k.fillStyle = Farger.blekk; k.font = '10px system-ui, sans-serif'; k.textAlign = 'left';
    k.fillText(pinne + ' m', p1.x + 4, p1.y + 3);

    // avlesning under markøren
    if (this._peker && this._peker.k >= 0 && g.finnes[this._peker.k]) {
      const kk = this._peker.k;
      const i = kk % g.nb, j = (kk / g.nb) | 0;
      const x = g.minX + i * g.rute, y = g.minY + j * g.rute;
      const d = g.d[kk];
      const tekst = [
        `Terreng ${t2(g.zT[kk], 2)} · planum ${t2(g.zP[kk], 2)}`,
        d >= 0 ? `Skjæring ${t2(d, 2)} m` : `Fylling ${t2(-d, 2)} m`,
        `N ${t2(y, 1)}  Ø ${t2(x, 1)}`
      ];
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

  /* ================================================================
     MUS OG BERØRING
     ================================================================ */

  _musKobling() {
    const c = this.over || this.lerret;
    let dra = null;
    const pos = e => {
      const r = c.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const start = e => {
      if (e.touches && e.touches.length > 1) { dra = null; this._knip = this._avstand(e); return; }
      dra = Object.assign(pos(e), { yaw: this.yaw, pitch: this.pitch });
      this._drar = true;
    };
    const flytt = e => {
      if (e.touches && e.touches.length > 1 && this._knip) {
        const na = this._avstand(e);
        this.skala *= na / this._knip;
        this._knip = na;
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
      this.yaw = dra.yaw + (p.x - dra.x) * 0.4;
      this.pitch = Math.max(8, Math.min(88, dra.pitch + (p.y - dra.y) * 0.3));
      this.tegn();
      e.preventDefault();
    };
    const slutt = () => {
      dra = null; this._knip = null;
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
    c.addEventListener('mouseleave', () => { this._peker = null; slutt(); });
    c.addEventListener('touchstart', start, { passive: true });
    c.addEventListener('touchmove', flytt, { passive: false });
    c.addEventListener('touchend', slutt);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.skala *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this._skalaSatt = true;
      this.tegn();
    }, { passive: false });
    c.addEventListener('dblclick', () => this.nullstill());
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
    this._skalaSatt = false;
    this.tegn();
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
  }
};

if (typeof module !== 'undefined') module.exports = Tomt3d;
