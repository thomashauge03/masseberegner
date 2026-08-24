'use strict';
/**
 * Skriver en PDF-fil.
 *
 * Rapporten fantes fra før som en nettside man kunne skrive ut, men da ma man
 * innom nettleserens utskriftsdialog, velge «lagre som PDF», og finne ut av
 * marger og filnavn selv. Her lages fila direkte.
 *
 * Ingen bibliotek. En PDF er en katalog med objekter, en krysstabell som sier
 * hvor hvert objekt starter, og en tilhenger som peker til katalogen. Teksten
 * settes med Helvetica, som alle lesere har fra før - da slipper vi a legge
 * ved en skrift. Tegningene legges inn som JPEG rett fra lerretet, for det er
 * allerede det formatet nettleseren gir oss, og PDF leser det uten
 * omkoding (DCTDecode).
 *
 * Malene er i punkt: 72 per tomme. A4 er 595,28 x 841,89.
 */

/* Bokstavbredder fra Helvetica, i tusendels em. Uten dem kan vi ikke male
   hvor bred en tekst blir, og da kan ingenting høyrestilles eller midtstilles
   - tallkolonner ville stat og flakset. */
const HELVETICA_BREDDER = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556,
  118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260,
  125: 334, 126: 584,
  // WinAnsi: tankestrek, gradetegn, opphøyd tre, prikk, og de norske
  150: 556, 176: 400, 179: 333, 183: 278,
  197: 667, 198: 1000, 216: 778, 229: 556, 230: 889, 248: 611
};
const HELVETICA_FET_BREDDER = {
  32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
  64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
  96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333, 103: 611,
  104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611,
  111: 611, 112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611,
  118: 556, 119: 778, 120: 556, 121: 556, 122: 500, 123: 389, 124: 280,
  125: 389, 126: 584,
  150: 556, 176: 400, 179: 333, 183: 278,
  197: 722, 198: 1000, 216: 778, 229: 556, 230: 889, 248: 611
};

/* HULL I BREIDDETABELLEN.
   Uten en bredde blir reserven 556 brukt, og da havner alt som er høyre- eller
   midtstilt på feil sted. «m²» står seks steder i rapporten, og «²» ble målt
   til 556 der den er 333 – hver eneste tallkolonne med kvadratmeter var 2 pt
   for langt til venstre. Tallene under er fra Adobe sin egen AFM for
   Helvetica og Helvetica-Bold. */
Object.assign(HELVETICA_BREDDER, {
  133: 1000, 137: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350,
  150: 333, 151: 1000, 169: 737, 171: 556, 173: 333, 178: 333, 179: 333,
  183: 278, 187: 556, 215: 584
});
Object.assign(HELVETICA_FET_BREDDER, {
  133: 1000, 137: 1000, 145: 278, 146: 278, 147: 500, 148: 500, 149: 350,
  150: 333, 151: 1000, 169: 737, 171: 556, 173: 333, 178: 333, 179: 333,
  183: 278, 187: 556, 215: 584
});

class PdfSkriver {
  /**
   * @param {object} [o]
   * @param {number} [o.bredde] sidebredde i punkt (A4 staende er 595.28)
   * @param {number} [o.hoyde]  sidehøyde i punkt
   */
  constructor(o = {}) {
    this.bredde = o.bredde || 595.28;
    this.hoyde = o.hoyde || 841.89;
    this.sider = [];
    this.bilder = [];             // {id, bytes, bredde, hoyde}
    this.side = null;
  }

  /* ---------------- tegning ---------------- */

  nySide() {
    this.side = { deler: [], bilder: [] };
    this.sider.push(this.side);
    return this.side;
  }

  /** PDF regner y oppover fra bunnen; rapporten er lettere a tenke ovenfra. */
  _y(y) { return this.hoyde - y; }

  _n(v) { return (Math.round(v * 100) / 100).toString(); }

  /**
   * WinAnsi-koding. Tegn utenfor det som far plass byttes mot noe som
   * ligner, sa en ukjent bokstav aldri velter fila.
   *
   * SPØRSMÅLSTEGN ER IKKE ET SVAR.
   * Her sto det fire bytter, og alt annet over 255 ble til «?». I vegrapporten
   * leste kunden «Lengdekorreksjon UTM ? bakke» – pilen er U+2192 og fikk
   * ingen. Et spørsmålstegn midt i en setning ser ut som om programmet ikke vet
   * hva det snakker om.
   *
   * Erstatningene under er ETTER BETYDNING, ikke etter utseende: pilen blir
   * «->», «tilnærmet lik» blir «~=». Da leses linjen fortsatt riktig i et
   * dokument som skal ut av huset. Tabellen dekker hvert eneste tegn over 255
   * som finnes i programmet i dag – talt opp, ikke gjettet.
   */
  _tekstbytes(streng) {
    const ut = [];
    for (const tegn of String(streng)) {
      const ett = PdfSkriver.ETTBYTE[tegn];
      if (ett != null) { ut.push(ett); continue; }
      const flere = PdfSkriver.FLERBYTE[tegn];
      if (flere != null) { for (const t of flere) ut.push(t.charCodeAt(0)); continue; }
      const k = tegn.codePointAt(0);
      /* Ukjent tegn over 255 slippes HELT. Et spørsmålstegn ser ut som en
         påstand programmet ikke kan stå for; ingen glyf ser ut som ingenting,
         og det er ærligere. */
      if (k > 255) continue;
      ut.push(k);
    }
    return ut;
  }

  _pdfstreng(streng) {
    let ut = '';
    for (const k of this._tekstbytes(streng)) {
      if (k === 0x28 || k === 0x29 || k === 0x5c) ut += '\\' + String.fromCharCode(k);
      else if (k < 32 || k > 126) ut += '\\' + k.toString(8).padStart(3, '0');
      else ut += String.fromCharCode(k);
    }
    return ut;
  }

  /** Bredden en tekst far, i punkt. */
  bredteAv(streng, storrelse = 9, fet = false) {
    const tab = fet ? HELVETICA_FET_BREDDER : HELVETICA_BREDDER;
    let sum = 0;
    for (const k of this._tekstbytes(streng)) sum += (tab[k] != null ? tab[k] : 556);
    return sum * storrelse / 1000;
  }

  /**
   * @param {number} x venstrekant (eller høyrekant/midte, se justering)
   * @param {number} y avstand fra toppen av siden til grunnlinjen
   * @param {object} [o] storrelse, fet, farge [r,g,b] 0-1, juster 'v'|'h'|'m'
   */
  tekst(x, y, streng, o = {}) {
    const st = o.storrelse || 9;
    const fet = !!o.fet;
    const farge = o.farge || [0, 0, 0];
    let xx = x;
    if (o.juster === 'h') xx = x - this.bredteAv(streng, st, fet);
    else if (o.juster === 'm') xx = x - this.bredteAv(streng, st, fet) / 2;
    this.side.deler.push(
      `BT /${fet ? 'F2' : 'F1'} ${this._n(st)} Tf ${this._n(farge[0])} ${this._n(farge[1])} ${this._n(farge[2])} rg `
      + `1 0 0 1 ${this._n(xx)} ${this._n(this._y(y))} Tm (${this._pdfstreng(streng)}) Tj ET`);
    return this.bredteAv(streng, st, fet);
  }

  linje(x1, y1, x2, y2, o = {}) {
    const f = o.farge || [0, 0, 0];
    this.side.deler.push(`${this._n(f[0])} ${this._n(f[1])} ${this._n(f[2])} RG ${this._n(o.tykkelse || 0.5)} w `
      + `${this._n(x1)} ${this._n(this._y(y1))} m ${this._n(x2)} ${this._n(this._y(y2))} l S`);
  }

  rektangel(x, y, bredde, hoyde, o = {}) {
    const deler = [];
    if (o.fyll) deler.push(`${this._n(o.fyll[0])} ${this._n(o.fyll[1])} ${this._n(o.fyll[2])} rg`);
    if (o.strek) deler.push(`${this._n(o.strek[0])} ${this._n(o.strek[1])} ${this._n(o.strek[2])} RG ${this._n(o.tykkelse || 0.5)} w`);
    deler.push(`${this._n(x)} ${this._n(this._y(y + hoyde))} ${this._n(bredde)} ${this._n(hoyde)} re`);
    deler.push(o.fyll && o.strek ? 'B' : o.fyll ? 'f' : 'S');
    this.side.deler.push(deler.join(' '));
  }

  /**
   * Legger inn et JPEG. Bildet deles mellom sider som bruker det samme, sa
   * en tegning som gjentas ikke gjør fila dobbelt sa stor.
   * @param {Uint8Array} bytes rene JPEG-bytes
   */
  /**
   * @param {Uint8Array} bytes JPEG-bytes, ELLER raa RGB naar `alfa` er med
   * @param {Uint8Array} [alfa] gjennomsikt, ett byte per piksel
   *
   * GJENNOMSIKT MAA VAERE MULIG.
   * Her gikk alt gjennom JPEG. Logoen har gjennomsiktig bunn, og JPEG kan ikke
   * det: den ble flatet mot bakgrunnsfargen paa forhaand, og siden JPEG er
   * tapsbasert traff ikke den flatede svarten den svarte bjelken eksakt. Rundt
   * logoen laa det et lysere rektangel med ringing rundt bokstavene - den ene
   * detaljen som mest av alt fikk dokumentet til aa se hjemmesnekret ut.
   * Med SMask ligger logoen fritt, paa svart som paa hvitt.
   */
  bilde(bytes, pikselBredde, pikselHoyde, x, y, bredde, hoyde, alfa) {
    let post = this.bilder.find(b => b.bytes === bytes);
    if (!post) {
      post = { id: 'Bi' + (this.bilder.length + 1), bytes, bredde: pikselBredde, hoyde: pikselHoyde, alfa };
      this.bilder.push(post);
    }
    if (!this.side.bilder.includes(post.id)) this.side.bilder.push(post.id);
    this.side.deler.push(`q ${this._n(bredde)} 0 0 ${this._n(hoyde)} ${this._n(x)} ${this._n(this._y(y + hoyde))} cm /${post.id} Do Q`);
  }

  /* ---------------- fila ---------------- */

  /**
   * Pakker en innholdsstrøm med deflate. Tegneoperatorene er ren tekst med
   * mange gjentakelser, sa de krymper kraftig - og en mindre fil er en
   * raskere fil a sende videre.
   */
  static async pakk(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const str = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(str).arrayBuffer());
    } catch (e) { return null; }
  }

  /** @returns {Promise<Uint8Array>} hele PDF-fila */
  async bygg() {
    const biter = [];
    let lengde = 0;
    const skriv = (data) => {
      const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      biter.push(b); lengde += b.length;
      return lengde;
    };

    /* Objektnummer deles ut først, sa hver referanse kan skrives ferdig med
       en gang: 1 katalog, 2 sidetre, 3-4 skrifter, sa ett bilde og to objekt
       (side + innhold) per side. */
    const nBilde = {};
    const nMaske = {};
    let neste = 5;
    for (const b of this.bilder) {
      nBilde[b.id] = neste++;
      if (b.alfa) nMaske[b.id] = neste++;      // maska er eit eige objekt
    }
    const nSide = this.sider.map(() => ({ side: neste++, innhold: neste++ }));
    const antall = neste;

    const start = new Array(antall).fill(0);
    skriv('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');

    const objekt = (nr, tekst, strom) => {
      start[nr] = lengde;
      skriv(`${nr} 0 obj\n${tekst}\n`);
      if (strom) { skriv('stream\n'); skriv(strom); skriv('\nendstream\n'); }
      skriv('endobj\n');
    };

    objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objekt(2, `<< /Type /Pages /Kids [${nSide.map(s => s.side + ' 0 R').join(' ')}] /Count ${this.sider.length} >>`);
    objekt(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objekt(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    for (const b of this.bilder) {
      if (!b.alfa) {
        objekt(nBilde[b.id],
          `<< /Type /XObject /Subtype /Image /Width ${b.bredde} /Height ${b.hoyde} `
          + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.bytes.length} >>`,
          b.bytes);
        continue;
      }
      /* Raa RGB pluss ei graatonemaske. Flate komprimerer flate fargar nesten
         gratis, saa logoen kan liggje inne i firedobbel opplosning uten at fila
         merkar det. */
      const rgb = await PdfSkriver.pakk(b.bytes);
      const maske = await PdfSkriver.pakk(b.alfa);
      objekt(nMaske[b.id],
        `<< /Type /XObject /Subtype /Image /Width ${b.bredde} /Height ${b.hoyde} `
        + `/ColorSpace /DeviceGray /BitsPerComponent 8`
        + (maske ? ' /Filter /FlateDecode' : '')
        + ` /Length ${(maske || b.alfa).length} >>`,
        maske || b.alfa);
      objekt(nBilde[b.id],
        `<< /Type /XObject /Subtype /Image /Width ${b.bredde} /Height ${b.hoyde} `
        + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${nMaske[b.id]} 0 R`
        + (rgb ? ' /Filter /FlateDecode' : '')
        + ` /Length ${(rgb || b.bytes).length} >>`,
        rgb || b.bytes);
    }

    for (let i = 0; i < this.sider.length; i++) {
      const s = this.sider[i];
      let innhold = new TextEncoder().encode(s.deler.join('\n'));
      const pakket = await PdfSkriver.pakk(innhold);
      const filter = pakket ? ' /Filter /FlateDecode' : '';
      if (pakket) innhold = pakket;
      const xo = s.bilder.length
        ? ` /XObject << ${s.bilder.map(id => `/${id} ${nBilde[id]} 0 R`).join(' ')} >>` : '';
      objekt(nSide[i].side,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this._n(this.bredde)} ${this._n(this.hoyde)}] `
        + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${nSide[i].innhold} 0 R >>`);
      objekt(nSide[i].innhold, `<< /Length ${innhold.length}${filter} >>`, innhold);
    }

    const krysstabell = lengde;
    let tab = `xref\n0 ${antall}\n0000000000 65535 f \n`;
    for (let i = 1; i < antall; i++) tab += String(start[i]).padStart(10, '0') + ' 00000 n \n';
    skriv(tab);
    skriv(`trailer\n<< /Size ${antall} /Root 1 0 R >>\nstartxref\n${krysstabell}\n%%EOF\n`);

    const ut = new Uint8Array(lengde);
    let i = 0;
    for (const b of biter) { ut.set(b, i); i += b.length; }
    return ut;
  }
}

/* Tegn som finnes i programmet og ikke i WinAnsi. Ett byte der det finnes en
   ekte glyf, flere der betydningen må skrives ut. */
PdfSkriver.ETTBYTE = {
  '\u2013': 150,          // – tankestrek
  '\u2014': 151,          // — lang tankestrek
  '\u2212': 45,           // − minus
  '\u00a0': 32,           // hardt mellomrom
  '\u2019': 39,           // ' apostrof
  '\u2018': 39,
  '\u201c': 34, '\u201d': 34,
  '\u00b7': 183,          // · midtprikk
  '\u2022': 149,          // • kulepunkt
  '\u2500': 45,           // ─ rammestrek
  '\u25ac': 45,           // ▬
  '\u00ab': 171, '\u00bb': 187
};
PdfSkriver.FLERBYTE = {
  '\u2192': '->',         // → «UTM -> bakke», ikke «UTM ? bakke»
  '\u2190': '<-',
  '\u2191': 'opp', '\u2193': 'ned',
  '\u2026': '...',        // …
  '\u2264': '<=', '\u2265': '>=',
  '\u2248': '~=', '\u2260': '!=',
  '\u00d7': 'x',          // × ganger – WinAnsi har 215, men x leses tryggere
  '\u26a0': 'OBS',        // ⚠
  '\u26d4': 'STOPP',      // ⛔
  '\u2713': 'ja',         // ✓
  '\u21ba': ''            // ↺ knappesymbol, hører ikke hjemme på papir
};

/** Gjør en data-URL fra et lerret om til rene bytes. */
function bytesFraDataUrl(url) {
  const b64 = String(url).slice(String(url).indexOf(',') + 1);
  const rå = atob(b64);
  const ut = new Uint8Array(rå.length);
  for (let i = 0; i < rå.length; i++) ut[i] = rå.charCodeAt(i);
  return ut;
}

if (typeof module !== 'undefined') module.exports = { PdfSkriver, bytesFraDataUrl, HELVETICA_BREDDER };
