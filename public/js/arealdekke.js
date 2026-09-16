/**
 * AREALDEKKE – hva bakken ER, før noen har gravd i den.
 *
 * Skog, vann, dyrka mark, myr, eksisterende veg og bebyggelse. Kilden er AR5
 * fra NIBIO, Norges offisielle arealressurskart, og det er hele poenget:
 * ingenting her er gjettet ut fra farger i et flyfoto. Hver flate har en
 * SOSI-kode, og koden kommer fra tjenesten selv.
 *
 * ── HVORFOR ET BILDE OG IKKE VEKTORDATA ─────────────────────────────
 * Tjenesten svarer `ServiceException` på `format=application/json`, og WFS-
 * inngangen finnes ikke på den adressen. Det som virker er GetMap som PNG,
 * og GetFeatureInfo som GML – der ligger `artype` og `artype_beskrivelse`
 * i klartekst. Altså: hent ETT bilde over hele området, og slå opp hver
 * FARGE én gang for å lære hva den betyr.
 *
 * ── HVORFOR 5×5 ─────────────────────────────────────────────────────
 * Å slå opp en tilfeldig piksel av hver farge er ikke godt nok, og det er
 * målt: i en prøverute ble hvit og en brunfarge begge meldt som «Skog».
 * Hvit er mellomrommet mellom flatene og brun er en kantstrek – oppslaget
 * traff naboflaten bak streken. Med kravet om at fargen må fylle en hel
 * 5×5-blokk før den kalibreres, forsvinner alle slike: 244 av 251 farger i
 * ruta var kantutjevning, og den brune leste da riktig som Samferdsel.
 *
 * En strek som er bred nok til å fylle 5×5 piksler er ikke en strek lenger.
 */
const Arealdekke = {
  /** Adressen til AR5. Bare denne ene tjenesten – se drøftingen over. */
  TJENESTE: 'https://wms.nibio.no/cgi-bin/ar5',

  /**
   * SOSI-kodene for arealtype, slik AR5 bruker dem.
   *
   * Navnene er tjenestens egne (`artype_beskrivelse`), ikke oversatt av oss.
   * Tabellen brukes bare til å SI hva man ser; oppslaget går på kode.
   */
  NAVN: {
    11: 'Bebygd', 12: 'Samferdsel', 21: 'Fulldyrka jord',
    22: 'Overflatedyrka jord', 23: 'Innmarksbeite', 30: 'Skog',
    50: 'Åpen fastmark', 60: 'Myr', 70: 'Snø og isbre',
    81: 'Ferskvann', 82: 'Hav', 99: 'Ikke kartlagt'
  },

  /** Hvor mange piksler i bredden bildet hentes i. Mer enn dette ser man ikke. */
  OPPLOSNING: 512,
  /** Hvor bred en farge må være for å regnes som en flate og ikke en strek. */
  KJERNE: 5,

  _bufret: new Map(),

  /**
   * Henter arealdekket over et område og gir en oppslagsfunksjon.
   *
   * @returns {Promise<{kodeVed(x,y):number, koder:Set, antall:number}|null>}
   *   `null` når tjenesten ikke svarer eller området ikke er kartlagt. Da
   *   skal den som spurte tegne som før – et manglende kart er ingen feil,
   *   og et halvt kart er verre enn ingen.
   */
  async hent(sone, minX, minY, maksX, maksY) {
    if (!(maksX > minX) || !(maksY > minY)) return null;
    const epsg = 25800 + (sone || 32);
    /* Bufferet står på området, ikke på anlegget: to naboanlegg i samme li
       deler det samme arealdekket, og skal ikke hente det to ganger. */
    const nokkel = [epsg, Math.round(minX), Math.round(minY),
      Math.round(maksX), Math.round(maksY)].join('_');
    if (this._bufret.has(nokkel)) return this._bufret.get(nokkel);
    const lovnad = this._bygg(epsg, minX, minY, maksX, maksY)
      .catch(() => null);
    this._bufret.set(nokkel, lovnad);
    return lovnad;
  },

  async _bygg(epsg, minX, minY, maksX, maksY) {
    /* Ruta gjøres kvadratisk i METER, ikke i piksler. Et avlangt anlegg ga
       ellers et bilde med rektangulære piksler, og da blir oppslaget
       forskjøvet den ene veien. */
    const b = maksX - minX, h = maksY - minY;
    const W = this.OPPLOSNING;
    const H = Math.max(16, Math.min(this.OPPLOSNING, Math.round(W * h / b)));
    const felles = this.TJENESTE + '?service=WMS&version=1.3.0'
      + '&layers=Arealtype&crs=EPSG:' + epsg
      + '&bbox=' + [minX, minY, maksX, maksY].join(',')
      + '&width=' + W + '&height=' + H;

    const svar = await fetch(felles + '&request=GetMap&format='
      + encodeURIComponent('image/png; mode=8bit'));
    if (!svar.ok) return null;
    const ct = svar.headers.get('content-type') || '';
    /* Tjenesten svarer 200 med en XML-feilmelding når noe er galt med
       forespørselen. Uten denne prøven havnet feilmeldingen i bildetolkeren
       og ble til et tomt kart som så ut som «ingen data her». */
    if (!ct.includes('image')) return null;
    const bm = await createImageBitmap(await svar.blob());
    const lerret = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(bm.width, bm.height)
      : Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height });
    const g = lerret.getContext('2d');
    g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, bm.width, bm.height).data;
    const bw = bm.width, bh = bm.height;

    const fargeI = (i, j) => { const p = (j * bw + i) * 4; return (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]; };

    /* Bare farger med en solid kjerne kalibreres – se toppen av fila. */
    const K = this.KJERNE, halv = K >> 1;
    const kjerne = new Map(), teller = new Map();
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const f = fargeI(i, j);
        teller.set(f, (teller.get(f) || 0) + 1);
      }
    }
    for (let j = halv; j < bh - halv; j++) {
      for (let i = halv; i < bw - halv; i++) {
        const f = fargeI(i, j);
        if (kjerne.has(f)) continue;
        let rein = true;
        for (let bb = -halv; bb <= halv && rein; bb++) {
          for (let aa = -halv; aa <= halv; aa++) {
            if (fargeI(i + aa, j + bb) !== f) { rein = false; break; }
          }
        }
        if (rein) kjerne.set(f, [i, j]);
      }
    }
    if (!kjerne.size) return null;

    /* De største først: en flate som dekker en promille er ikke verdt et
       nettkall, og taket holder kalibreringen på et titalls forespørsler
       uansett hvor broket et landskap er. */
    const store = [...kjerne.keys()].sort((x, y) => teller.get(y) - teller.get(x)).slice(0, 14);
    const kode = new Map();
    for (const f of store) {
      const [i, j] = kjerne.get(f);
      try {
        const r = await fetch(felles + '&request=GetFeatureInfo&query_layers=Arealtype'
          + '&i=' + i + '&j=' + j + '&info_format='
          + encodeURIComponent('application/vnd.ogc.gml'));
        if (!r.ok) continue;
        const m = (await r.text()).match(/<artype>(\d+)<\/artype>/);
        if (m) kode.set(f, +m[1]);
      } catch (e) { /* en farge uten svar er en farge uten farge */ }
    }
    if (!kode.size) return null;

    /* Hver piksel får koden til den NÆRMESTE kalibrerte fargen. Kantpiksler
       er blandinger av to naboflater og lander da på en av de to – som er
       riktig svar for begge, siden grensen går nettopp der. */
    const kalibrerte = [...kode.keys()];
    const naermest = new Map();
    const kodeFor = (f) => {
      if (naermest.has(f)) return naermest.get(f);
      let best = -1, avst = Infinity;
      const r = (f >> 16) & 255, gg = (f >> 8) & 255, bl = f & 255;
      for (const k of kalibrerte) {
        const dr = r - ((k >> 16) & 255), dg = gg - ((k >> 8) & 255), db = bl - (k & 255);
        const a = dr * dr + dg * dg + db * db;
        if (a < avst) { avst = a; best = k; }
      }
      const ut = kode.get(best);
      naermest.set(f, ut);
      return ut;
    };

    const rute = new Uint8Array(bw * bh);
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) rute[j * bw + i] = kodeFor(fargeI(i, j));
    }

    const koder = new Set(kode.values());
    return {
      bredde: bw, hoyde: bh, koder, antall: koder.size,
      /**
       * Arealtypen i et punkt, i de samme UTM-koordinatene modellen bruker.
       * 0 betyr «utenfor kartet» – ikke «ingenting».
       */
      kodeVed(x, y) {
        const i = Math.floor((x - minX) / (maksX - minX) * bw);
        /* Bildet har nord ØVERST, gitteret har y oppover. Uten vendingen
           ble skogen liggende der vannet er, og det ser helt troverdig ut. */
        const j = Math.floor((maksY - y) / (maksY - minY) * bh);
        if (i < 0 || j < 0 || i >= bw || j >= bh) return 0;
        return rute[j * bw + i];
      }
    };
  },

  /** Navnet på en kode, til tegnforklaringen. */
  navn(kode) { return this.NAVN[kode] || null; }
};

if (typeof module !== 'undefined') module.exports = Arealdekke;
