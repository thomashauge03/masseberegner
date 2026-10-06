'use strict';
/**
 * GET /api/dtm/flis?sr=25832&tx=1543&ty=25246&res=1
 *
 * Leverer en 256 x 256 meter flis av Kartverket sin høydemodell, pakket
 * som hele centimeter. Svaret er uforanderlig, sa det kan mellomlagres
 * bade i Vercel sitt kantnett og i nettleseren sa lenge som mulig.
 */

const { hentFlis, DTM_TJENESTE } = require('../../lib/hoydedata.js');

module.exports = async (req, res) => {
  const q = req.query || {};
  const sr = parseInt(q.sr, 10);
  const tx = parseInt(q.tx, 10);
  const ty = parseInt(q.ty, 10);
  /* OPPLØSNINGEN ER 1, 2, 4 ELLER 8 – det som går opp i 256. Her ble alt
     klemt til 1–8 i stillhet, og res=3 ga en flis på 85 punkt som klienten
     leste som 256 × 256. */
  const oppløsning = q.res == null || q.res === '' ? 1 : Number(q.res);
  const modell = q.modell === 'dom' ? 'dom' : 'dtm';

  if (!DTM_TJENESTE[sr] || !Number.isFinite(tx) || !Number.isFinite(ty) || ![1, 2, 4, 8].includes(oppløsning)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ feil: 'Ugyldige parametre' }));
  }

  try {
    const buf = await hentFlis(sr, tx, ty, oppløsning, modell);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
      'Vercel-CDN-Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ feil: 'Fikk ikke terrengdata: ' + err.message }));
  }
};
