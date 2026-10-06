'use strict';
/**
 * GET /api/punkt?sr=25832&punkter=[[ost,nord],...]
 *
 * Videresender til Kartverket sitt offisielle punkt-API. Brukes til a
 * kontrollere at høydene i programmet stemmer med kilden.
 */

const { hentJson } = require('../lib/hoydedata.js');

module.exports = async (req, res) => {
  const q = req.query || {};
  const sr = parseInt(q.sr || '25833', 10);
  const punkter = q.punkter;
  /* Bare et svar som er et svar, mellomlagres. Her fikk også 400 og 502 et
     døgn i kantnettet – en kort feil hos Kartverket ble stående i et døgn. */
  const svar = (kode, data) => {
    res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': kode === 200 ? 'public, max-age=86400' : 'no-store' });
    res.end(JSON.stringify(data));
  };

  if (!punkter) return svar(400, { feil: 'Mangler punkter' });
  if (![25832, 25833, 25835, 4258, 4326].includes(sr)) return svar(400, { feil: 'Ugyldig koordinatsystem' });

  try {
    const data = await hentJson(
      `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=${sr}&punkter=${encodeURIComponent(punkter)}`
    );
    svar(200, data);
  } catch (err) {
    svar(502, { feil: err.message });
  }
};
