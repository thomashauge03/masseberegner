'use strict';
/**
 * Lokal utviklingsserver.
 *
 * Serverer public/ og kobler /api/... til de samme funksjonene som kjører
 * som serverless-funksjoner pa Vercel. Slik oppfører programmet seg likt
 * pa maskinen og pa nett.
 *
 *   node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '5178', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const RUTER = {
  '/api/dtm/flis': require('./api/dtm/flis.js'),
  '/api/punkt': require('./api/punkt.js'),
  '/api/sok': require('./api/sok.js')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(async (req, res) => {
  // WHATWG-URL: `url.parse` er foreldet og tolker stier ulikt fra nettleseren
  const u = new URL(req.url, 'http://lokal');
  let sti;
  try { sti = decodeURIComponent(u.pathname); } catch (e) { res.writeHead(400); return res.end('Ugyldig sti'); }

  const handler = RUTER[sti];
  if (handler) {
    req.query = Object.fromEntries(u.searchParams);   // samme som Vercel gir funksjonene
    try {
      await handler(req, res);
    } catch (err) {
      console.error('Feil i', sti, '-', err.message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ feil: err.message }));
    }
    return;
  }

  const filsti = path.join(PUBLIC_DIR, sti === '/' ? 'index.html' : sti);
  /* INNENFOR MAPPA, IKKE BARE MED SAMME BEGYNNELSE. `startsWith` slapp
     gjennom en søskenmappe med samme prefiks – «public-gammel» begynner med
     «public». Den relative stien sier om fila ligger under mappa. */
  const rel = path.relative(path.resolve(PUBLIC_DIR), path.resolve(filsti));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403); return res.end('Nei');
  }
  if (fs.existsSync(filsti) && fs.statSync(filsti).isFile()) {
    const kropp = fs.readFileSync(filsti);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filsti).toLowerCase()] || 'application/octet-stream', 'Content-Length': kropp.length });
    return res.end(kropp);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Fant ikke ' + sti);
});

if (require.main === module) {
  /* Utviklingstjeneren lytter bare på maskinen selv. Uten vertsnavn lyttet
     den på alle nettverkskort, og hvem som helst på samme nett kunne hente
     fra den. MASSEKALK_VERT=0.0.0.0 åpner den når det er meningen. */
  server.listen(PORT, process.env.MASSEKALK_VERT || '127.0.0.1', () => {
    console.log('');
    console.log('  Massekalk kjører');
    console.log('  Åpne:  http://localhost:' + PORT);
    console.log('  Terrengdata: Kartverket DTM1 (1 m laser)');
    console.log('');
  });
}

module.exports = server;
