'use strict';
/**
 * Henting og pakking av terrengdata fra Kartverket.
 *
 * Brukes bade av den lokale utviklingsserveren (server.js) og av
 * Vercel-funksjonene i api/. Ingen eksterne avhengigheter.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

// Hver flis dekker 256 x 256 meter.
const TILE_M = 256;

const DTM_TJENESTE = {
  25832: 'NHM_DTM_25832',
  25833: 'NHM_DTM_25833',
  25835: 'NHM_DTM_25835'
};

/* Overflatemodellen tar med det som star pa bakken. Trekker man terrenget fra
   den, star vegetasjonshøyden igjen - og den forteller hvor godt laseren har
   naadd ned. Under tett skog er terrengmodellen langt mer usikker enn pa apen
   mark, og det er verdt a vite før man priser en jobb. */
const DOM_TJENESTE = {
  25832: 'NHM_DOM_25832',
  25833: 'NHM_DOM_25833',
  25835: 'NHM_DOM_25835'
};

const NODATA_GRENSE = 1e30;

/* Hvordan en flis tolkes. Star i navnet pa mellomlagrede filer, sa gamle
   filer slutter a bli levert nar tolkningen endres.
   2: fliser som er nøyaktig null over alt regnes som manglende dekning. */
const FLIS_TOLKNING = 2;

/* ------------------------------------------------------------------ *
 *  Mellomlager pa disk
 *
 *  Lokalt havner det i cache/ i prosjektmappen. Pa Vercel er filsystemet
 *  skrivebeskyttet bortsett fra /tmp, og der lever filene bare sa lenge
 *  instansen gjør det. Det gjør ikke sa mye: svarene far lange
 *  hurtigbufferhoder, sa bade Vercel sitt kantnett og nettleseren tar
 *  vare pa flisene.
 * ------------------------------------------------------------------ */

function cacheMappe() {
  const lokal = path.join(__dirname, '..', 'cache');
  try {
    if (!fs.existsSync(lokal)) fs.mkdirSync(lokal, { recursive: true });
    fs.accessSync(lokal, fs.constants.W_OK);
    return lokal;
  } catch (e) {
    const tmp = path.join(os.tmpdir(), 'massekalk-cache');
    try { if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true }); return tmp; } catch (e2) { return null; }
  }
}

/* ------------------------------------------------------------------ *
 *  GeoTIFF-leser: float32, flislagt eller stripelagt
 * ------------------------------------------------------------------ */

function lesGeoTiff(b) {
  const magi = b.toString('ascii', 0, 2);
  if (magi !== 'II' && magi !== 'MM') throw new Error('Ikke en TIFF-fil');
  const le = magi === 'II';
  const u16 = o => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = o => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const f64 = o => (le ? b.readDoubleLE(o) : b.readDoubleBE(o));
  const STØRRELSE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  const ifd = u32(4);
  const antall = u16(ifd);
  const tagger = {};
  for (let i = 0; i < antall; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const bredde = (STØRRELSE[type] || 1) * cnt;
    const vo = bredde <= 4 ? e + 8 : u32(e + 8);
    const verdier = [];
    for (let k = 0; k < cnt; k++) {
      const o = vo + k * (STØRRELSE[type] || 1);
      if (type === 3) verdier.push(u16(o));
      else if (type === 4) verdier.push(u32(o));
      else if (type === 12) verdier.push(f64(o));
      else if (type === 11) verdier.push(le ? b.readFloatLE(o) : b.readFloatBE(o));
      else if (type === 2) { verdier.push(b.toString('ascii', vo, vo + cnt)); break; }
      else verdier.push(b[o]);
    }
    tagger[tag] = verdier;
  }

  const W = tagger[256][0];
  const H = tagger[257][0];
  const bits = tagger[258] ? tagger[258][0] : 32;
  const komprimering = tagger[259] ? tagger[259][0] : 1;
  const format = tagger[339] ? tagger[339][0] : 1;  // 3 = flyttall
  if (bits !== 32 || format !== 3) throw new Error(`Uventet pikselformat: ${bits} bit, format ${format}`);

  const flislagt = !!tagger[322];
  const tw = flislagt ? tagger[322][0] : W;
  const th = flislagt ? tagger[323][0] : (tagger[278] ? tagger[278][0] : H);
  const offsets = flislagt ? tagger[324] : tagger[273];
  const lengder = flislagt ? tagger[325] : tagger[279];

  const skala = tagger[33550] || [1, 1, 0];
  const knytepunkt = tagger[33922] || [0, 0, 0, 0, 0, 0];

  const data = new Float32Array(W * H);
  const overBredde = Math.ceil(W / tw);

  for (let t = 0; t < offsets.length; t++) {
    let blokk = b.slice(offsets[t], offsets[t] + lengder[t]);
    if (komprimering === 8 || komprimering === 32946) blokk = zlib.inflateSync(blokk);
    else if (komprimering !== 1) throw new Error('Ustøttet TIFF-komprimering: ' + komprimering);

    const tx = flislagt ? (t % overBredde) * tw : 0;
    const ty = flislagt ? Math.floor(t / overBredde) * th : t * th;
    let p = 0;
    for (let r = 0; r < th; r++) {
      const Y = ty + r;
      if (Y >= H) break;
      for (let c = 0; c < tw; c++) {
        if (p + 4 > blokk.length) break;
        const v = le ? blokk.readFloatLE(p) : blokk.readFloatBE(p);
        p += 4;
        const X = tx + c;
        if (X < W) data[Y * W + X] = v;
      }
      if (!flislagt) p = (r + 1) * W * 4;
    }
  }

  return {
    bredde: W, hoyde: H, data,
    originX: knytepunkt[3],   // vestkant av første piksel
    originY: knytepunkt[4],   // nordkant av første piksel
    px: skala[0], py: skala[1]
  };
}

/* ------------------------------------------------------------------ *
 *  Pakking av en flis
 *
 *  Høydene lagres som hele centimeter over et nullnivå for flisen.
 *  Terrengmodellen er selv oppgitt i centimeter, sa ingenting gar tapt,
 *  og flisen blir under halvparten sa stor som rå float32 pa nettet.
 *  Er høydeforskjellen innenfor flisen for stor for et 16-bits tall
 *  (over 320 meter), sendes flisen som float32 i stedet.
 * ------------------------------------------------------------------ */

const MAGI = 'MKT1';
const FORMAT_I16 = 1;
const FORMAT_F32 = 2;
const I16_NODATA = -32768;

function pakkFlis(data, px) {
  let min = Infinity, maks = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!isFinite(v)) continue;
    if (v < min) min = v;
    if (v > maks) maks = v;
  }
  if (!isFinite(min)) { min = 0; maks = 0; }

  const kanBrukeI16 = (maks - min) < 320;
  const hode = Buffer.alloc(16);
  hode.write(MAGI, 0, 'ascii');
  hode.writeUInt8(kanBrukeI16 ? FORMAT_I16 : FORMAT_F32, 4);
  hode.writeUInt16LE(px, 6);
  hode.writeFloatLE(kanBrukeI16 ? Math.floor(min * 100) / 100 : 0, 8);

  if (!kanBrukeI16) {
    return Buffer.concat([hode, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
  }
  const base = hode.readFloatLE(8);
  const ut = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    ut[i] = isFinite(v) ? Math.round((v - base) * 100) : I16_NODATA;
  }
  return Buffer.concat([hode, Buffer.from(ut.buffer)]);
}

/* ------------------------------------------------------------------ *
 *  Nedlasting
 * ------------------------------------------------------------------ */

function hentBinært(adresse, forsøk = 3) {
  return new Promise((løs, avvis) => {
    const prøv = n => {
      const req = https.get(adresse, { timeout: 40000, headers: { 'User-Agent': 'Massekalk/1.0' } }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          if (n > 1) return setTimeout(() => prøv(n - 1), 700);
          return avvis(new Error('HTTP ' + res.statusCode));
        }
        const biter = [];
        res.on('data', d => biter.push(d));
        res.on('end', () => løs({ buffer: Buffer.concat(biter), type: res.headers['content-type'] || '' }));
      });
      req.on('timeout', () => req.destroy(new Error('tidsavbrudd')));
      req.on('error', err => {
        if (n > 1) return setTimeout(() => prøv(n - 1), 700);
        avvis(err);
      });
    };
    prøv(forsøk);
  });
}

function hentJson(adresse) {
  return hentBinært(adresse).then(r => JSON.parse(r.buffer.toString('utf8')));
}

/* ------------------------------------------------------------------ *
 *  Flis
 * ------------------------------------------------------------------ */

const påGang = new Map();

async function hentFlis(sr, tx, ty, res, modell) {
  const dom = modell === 'dom';
  const tjeneste = (dom ? DOM_TJENESTE : DTM_TJENESTE)[sr];
  if (!tjeneste) throw new Error('Ustøttet koordinatsystem: ' + sr);

  const px = Math.round(TILE_M / res);
  const nøkkel = `${sr}_${res}_${tx}_${ty}_${dom ? 'dom' : 'dtm'}`;
  const mappe = cacheMappe();
  /* Versjonen star i filnavnet. Endrer vi hvordan en flis tolkes - som da
     nullfliser utenfor dekningen begynte a bli lest som manglende data - ma
     de gamle filene slutte a bli levert. Uten versjonen i navnet ble de
     liggende og svare med det gamle innholdet i det uendelige. */
  const fil = mappe
    ? path.join(mappe, `v${FLIS_TOLKNING}_${sr}_${res}m_${tx}_${ty}${dom ? '_dom' : ''}.bin`)
    : null;

  if (fil && fs.existsSync(fil)) {
    try {
      const buf = fs.readFileSync(fil);
      if (buf.length > 16 && buf.toString('ascii', 0, 4) === MAGI) return buf;
    } catch (e) { /* les pa nytt */ }
  }
  if (påGang.has(nøkkel)) return påGang.get(nøkkel);

  const jobb = (async () => {
    const minx = tx * TILE_M, miny = ty * TILE_M;
    const q = new URLSearchParams({
      bbox: `${minx},${miny},${minx + TILE_M},${miny + TILE_M}`,
      bboxSR: String(sr), imageSR: String(sr),
      size: `${px},${px}`,
      format: 'tiff', pixelType: 'F32',
      noDataInterpretation: 'esriNoDataMatchAny',
      interpolation: 'RSP_BilinearInterpolation',
      f: 'image'
    });
    const adresse = `https://hoydedata.no/arcgis/rest/services/${tjeneste}/ImageServer/exportImage?${q}`;
    const { buffer, type } = await hentBinært(adresse);
    if (!/tiff/i.test(type)) throw new Error('Fikk ikke TIFF fra høydetjenesten');

    const rist = lesGeoTiff(buffer);
    if (rist.bredde !== px || rist.hoyde !== px) {
      throw new Error(`Uventet flisstørrelse ${rist.bredde}x${rist.hoyde}, ventet ${px}x${px}`);
    }
    const d = rist.data;
    for (let i = 0; i < d.length; i++) {
      if (!isFinite(d[i]) || Math.abs(d[i]) > NODATA_GRENSE) d[i] = NaN;
    }

    /* Utenfor dekningen svarer høydetjenesten 0,00 for hver eneste piksel -
       ikke en nodata-verdi, ikke en feilmelding. Prøvd i Nordsjøen, i
       Skagerrak, utenfor Lofoten og inne i Sverige: 65 536 av 65 536 celler
       er nøyaktig null.

       Uten dette ble et hull i terrengmodellen lest som havflaten. En veg pa
       kote 260 fikk da en skjæring pa 260 meter over hele bredden, og ikke en
       eneste merknad om at det manglet data - tallene sa bare ut som veldig
       store tall.

       Enkeltnuller ma fa sta: langs sjøen modellerer DTM-en havflaten som
       null, og den flisen har ekte data rundt seg. Det er flisen som er
       nøyaktig null over alt som ikke finnes. En ekte flis pa 65 536 celler
       er aldri bitkorrekt null i hver eneste en. */
    let bareNull = true;
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== 0) { bareNull = false; break; }
    }
    if (bareNull && d.length) d.fill(NaN);
    const pakket = pakkFlis(d, px);
    if (fil) { try { fs.writeFileSync(fil, pakket); } catch (e) { /* uten mellomlager gar det ogsa */ } }
    return pakket;
  })().finally(() => påGang.delete(nøkkel));

  påGang.set(nøkkel, jobb);
  return jobb;
}

/** Pakker ut igjen - brukes av testene. */
function pakkOpp(buf) {
  if (buf.toString('ascii', 0, 4) !== MAGI) throw new Error('Ukjent flisformat');
  const format = buf.readUInt8(4);
  const px = buf.readUInt16LE(6);
  const base = buf.readFloatLE(8);
  const kropp = buf.slice(16);
  if (format === FORMAT_F32) {
    const kopi = Buffer.from(kropp);
    return { px, data: new Float32Array(kopi.buffer, kopi.byteOffset, kopi.byteLength / 4) };
  }
  const kopi = Buffer.from(kropp);
  const i16 = new Int16Array(kopi.buffer, kopi.byteOffset, kopi.byteLength / 2);
  const ut = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) ut[i] = i16[i] === I16_NODATA ? NaN : base + i16[i] / 100;
  return { px, data: ut };
}

module.exports = {
  TILE_M, DTM_TJENESTE, DOM_TJENESTE, MAGI, FORMAT_I16, FORMAT_F32, I16_NODATA,
  lesGeoTiff, pakkFlis, pakkOpp, hentFlis, hentBinært, hentJson, cacheMappe
};
