'use strict';
/**
 * Massekalk - lokal server.
 *
 * Oppgaver:
 *  1. Serverer nettgrensesnittet (public/).
 *  2. Henter terrengmodell (DTM1, 1x1 m laser) fra Kartverket sin ImageServer,
 *     tolker GeoTIFF-en og leverer den som rå Float32-fliser til nettleseren.
 *     Flisene mellomlagres pa disk slik at man bare laster ned en gang.
 *  3. Videresender oppslag mot Kartverket sine apne API-er (punkt, stedsnavn, adresse).
 *  4. Lagrer og henter prosjektfiler som JSON.
 *
 * Ingen eksterne avhengigheter - bare Node sitt standardbibliotek.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '5178', 10);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, 'cache');
const PROSJEKT_DIR = path.join(ROOT, 'prosjekter');

for (const d of [CACHE_DIR, PROSJEKT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/* ------------------------------------------------------------------ *
 *  Terrengmodell: flisstørrelse og datakilder
 * ------------------------------------------------------------------ */

// Hver flis dekker 256 x 256 meter. Med 1 m oppløsning gir det 256 x 256 piksler.
const TILE_M = 256;

const DTM_SERVICE = {
  25832: 'NHM_DTM_25832',
  25833: 'NHM_DTM_25833',
  25835: 'NHM_DTM_25835'
};

const NODATA_LIMIT = 1e30;

/* ------------------------------------------------------------------ *
 *  GeoTIFF-leser (float32, flislagt eller stripelagt, ukomprimert/deflate)
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
  const format = tagger[339] ? tagger[339][0] : 1; // 3 = flyttall
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
    bredde: W,
    hoyde: H,
    data,
    originX: knytepunkt[3],   // vestkant av første piksel
    originY: knytepunkt[4],   // nordkant av første piksel
    px: skala[0],
    py: skala[1]
  };
}

/* ------------------------------------------------------------------ *
 *  Nedlasting med gjenforsøk
 * ------------------------------------------------------------------ */

function hentBinært(adresse, forsøk = 3) {
  return new Promise((løs, avvis) => {
    const prøv = n => {
      const req = https.get(adresse, { timeout: 45000, headers: { 'User-Agent': 'Massekalk/1.0' } }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          if (n > 1) return setTimeout(() => prøv(n - 1), 800);
          return avvis(new Error('HTTP ' + res.statusCode + ' fra ' + adresse));
        }
        const biter = [];
        res.on('data', d => biter.push(d));
        res.on('end', () => løs({ buffer: Buffer.concat(biter), type: res.headers['content-type'] || '' }));
      });
      req.on('timeout', () => { req.destroy(new Error('tidsavbrudd')); });
      req.on('error', err => {
        if (n > 1) return setTimeout(() => prøv(n - 1), 800);
        avvis(err);
      });
    };
    prøv(forsøk);
  });
}

/* ------------------------------------------------------------------ *
 *  Terrengfliser
 * ------------------------------------------------------------------ */

const flisArbeid = new Map(); // hindrer at samme flis lastes ned flere ganger samtidig

async function hentFlis(sr, tx, ty, res) {
  const tjeneste = DTM_SERVICE[sr];
  if (!tjeneste) throw new Error('Ustøttet koordinatsystem: ' + sr);

  const px = Math.round(TILE_M / res);
  const nøkkel = `${sr}_${res}_${tx}_${ty}`;
  const mappe = path.join(CACHE_DIR, String(sr));
  const fil = path.join(mappe, `${res}m_${tx}_${ty}.f32`);

  if (fs.existsSync(fil)) {
    const buf = fs.readFileSync(fil);
    if (buf.length === px * px * 4) return buf;
  }
  if (flisArbeid.has(nøkkel)) return flisArbeid.get(nøkkel);

  const jobb = (async () => {
    const minx = tx * TILE_M, miny = ty * TILE_M;
    const maxx = minx + TILE_M, maxy = miny + TILE_M;
    const q = new URLSearchParams({
      bbox: `${minx},${miny},${maxx},${maxy}`,
      bboxSR: String(sr),
      imageSR: String(sr),
      size: `${px},${px}`,
      format: 'tiff',
      pixelType: 'F32',
      noDataInterpretation: 'esriNoDataMatchAny',
      interpolation: 'RSP_BilinearInterpolation',
      f: 'image'
    });
    const adresse = `https://hoydedata.no/arcgis/rest/services/${tjeneste}/ImageServer/exportImage?${q}`;
    const { buffer, type } = await hentBinært(adresse);
    if (!/tiff/i.test(type)) {
      throw new Error('Fikk ikke TIFF fra høydetjenesten: ' + buffer.slice(0, 200).toString('utf8'));
    }
    const rist = lesGeoTiff(buffer);
    if (rist.bredde !== px || rist.hoyde !== px) {
      throw new Error(`Uventet flisstørrelse ${rist.bredde}x${rist.hoyde}, ventet ${px}x${px}`);
    }
    // Normaliser manglende data til NaN
    const d = rist.data;
    for (let i = 0; i < d.length; i++) {
      if (!isFinite(d[i]) || Math.abs(d[i]) > NODATA_LIMIT) d[i] = NaN;
    }
    const ut = Buffer.from(d.buffer, d.byteOffset, d.byteLength);
    if (!fs.existsSync(mappe)) fs.mkdirSync(mappe, { recursive: true });
    fs.writeFileSync(fil, ut);
    return ut;
  })().finally(() => flisArbeid.delete(nøkkel));

  flisArbeid.set(nøkkel, jobb);
  return jobb;
}

/* ------------------------------------------------------------------ *
 *  Enkel videresending av JSON-API
 * ------------------------------------------------------------------ */

function hentJson(adresse) {
  return hentBinært(adresse).then(r => JSON.parse(r.buffer.toString('utf8')));
}

/* ------------------------------------------------------------------ *
 *  HTTP-server
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, kode, data) {
  const kropp = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': kropp.length });
  res.end(kropp);
}

function trygtNavn(navn) {
  return String(navn).replace(/[^\wæøåÆØÅ \-.]/g, '_').slice(0, 120);
}

function lesKropp(req) {
  return new Promise((løs, avvis) => {
    const biter = [];
    let n = 0;
    req.on('data', d => {
      n += d.length;
      if (n > 60 * 1024 * 1024) { avvis(new Error('For stor forespørsel')); req.destroy(); return; }
      biter.push(d);
    });
    req.on('end', () => løs(Buffer.concat(biter).toString('utf8')));
    req.on('error', avvis);
  });
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const sti = decodeURIComponent(u.pathname);

  try {
    /* --- Terrengflis ------------------------------------------------ */
    if (sti === '/api/dtm/flis') {
      const sr = parseInt(u.query.sr, 10);
      const tx = parseInt(u.query.tx, 10);
      const ty = parseInt(u.query.ty, 10);
      const oppløsning = Math.max(1, Math.min(8, parseInt(u.query.res || '1', 10)));
      if (!DTM_SERVICE[sr] || !isFinite(tx) || !isFinite(ty)) return sendJson(res, 400, { feil: 'Ugyldige parametre' });
      const buf = await hentFlis(sr, tx, ty, oppløsning);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length,
        'X-Origin-X': String(tx * TILE_M),
        'X-Origin-Y': String((ty + 1) * TILE_M),
        'X-Pixel': String(oppløsning),
        'Cache-Control': 'public, max-age=31536000'
      });
      return res.end(buf);
    }

    /* --- Kontrollpunkt mot Kartverket sitt offisielle API ------------ */
    if (sti === '/api/punkt') {
      const sr = parseInt(u.query.sr || '25833', 10);
      const punkter = u.query.punkter;
      if (!punkter) return sendJson(res, 400, { feil: 'Mangler punkter' });
      const svar = await hentJson(
        `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=${sr}&punkter=${encodeURIComponent(punkter)}`
      );
      return sendJson(res, 200, svar);
    }

    /* --- Stedsnavnsøk ------------------------------------------------ */
    if (sti === '/api/sok') {
      const q = String(u.query.q || '').trim();
      if (!q) return sendJson(res, 400, { feil: 'Tomt søk' });
      const treff = [];
      try {
        const sted = await hentJson(
          `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(q)}*&treffPerSide=12&utkoordsys=4326`
        );
        for (const n of (sted.navn || [])) {
          treff.push({
            navn: n.skrivemåte,
            type: n.navneobjekttype,
            kommune: (n.kommuner || []).map(k => k.kommunenavn).join(', '),
            lat: n.representasjonspunkt.nord,
            lon: n.representasjonspunkt.øst
          });
        }
      } catch (e) { /* stedsnavn kan være nede - fortsett med adressesøk */ }
      try {
        const adr = await hentJson(
          `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=8`
        );
        for (const a of (adr.adresser || [])) {
          treff.push({
            navn: a.adressetekst,
            type: 'Adresse',
            kommune: a.kommunenavn,
            lat: a.representasjonspunkt.lat,
            lon: a.representasjonspunkt.lon
          });
        }
      } catch (e) { /* ignorer */ }
      return sendJson(res, 200, { treff });
    }

    /* --- Prosjektfiler ----------------------------------------------- */
    if (sti === '/api/prosjekt' && req.method === 'GET') {
      const filer = fs.readdirSync(PROSJEKT_DIR).filter(f => f.endsWith('.json'));
      const liste = filer.map(f => {
        const st = fs.statSync(path.join(PROSJEKT_DIR, f));
        return { navn: f.replace(/\.json$/, ''), endret: st.mtime.toISOString(), storrelse: st.size };
      }).sort((a, b) => b.endret.localeCompare(a.endret));
      return sendJson(res, 200, { prosjekter: liste });
    }
    if (sti.startsWith('/api/prosjekt/')) {
      const navn = trygtNavn(sti.slice('/api/prosjekt/'.length));
      const fil = path.join(PROSJEKT_DIR, navn + '.json');
      if (req.method === 'GET') {
        if (!fs.existsSync(fil)) return sendJson(res, 404, { feil: 'Finnes ikke' });
        return sendJson(res, 200, JSON.parse(fs.readFileSync(fil, 'utf8')));
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const kropp = await lesKropp(req);
        JSON.parse(kropp); // valider
        fs.writeFileSync(fil, kropp, 'utf8');
        return sendJson(res, 200, { ok: true, navn });
      }
      if (req.method === 'DELETE') {
        if (fs.existsSync(fil)) fs.unlinkSync(fil);
        return sendJson(res, 200, { ok: true });
      }
    }

    /* --- Cache-status ------------------------------------------------ */
    if (sti === '/api/status') {
      let filer = 0, bytes = 0;
      const gå = d => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          if (f.isDirectory()) gå(p);
          else { filer++; bytes += fs.statSync(p).size; }
        }
      };
      gå(CACHE_DIR);
      return sendJson(res, 200, { flisstorrelse: TILE_M, bufretFliser: filer, bufretMb: +(bytes / 1048576).toFixed(1) });
    }

    /* --- Statiske filer ---------------------------------------------- */
    let filsti = path.join(PUBLIC_DIR, sti === '/' ? 'index.html' : sti);
    if (!path.resolve(filsti).startsWith(path.resolve(PUBLIC_DIR))) {
      res.writeHead(403); return res.end('Nei');
    }
    if (fs.existsSync(filsti) && fs.statSync(filsti).isFile()) {
      const ext = path.extname(filsti).toLowerCase();
      const kropp = fs.readFileSync(filsti);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': kropp.length });
      return res.end(kropp);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Fant ikke ' + sti);
  } catch (err) {
    console.error('Feil på', sti, '-', err.message);
    sendJson(res, 500, { feil: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('');
    console.log('  Massekalk kjører');
    console.log('  Åpne:  http://localhost:' + PORT);
    console.log('  Terrengdata: Kartverket DTM1 (1 m laser) - mellomlagres i ' + CACHE_DIR);
    console.log('');
  });
}

module.exports = { lesGeoTiff, hentFlis, TILE_M };
