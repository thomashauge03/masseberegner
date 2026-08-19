'use strict';
/**
 * GET /api/sok?q=Ydestad
 *
 * Slar opp stedsnavn og adresser hos Kartverket og slar treffene sammen.
 */

const { hentJson } = require('../lib/hoydedata.js');

module.exports = async (req, res) => {
  const q = String((req.query || {}).q || '').trim();
  const svar = (kode, data) => {
    res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify(data));
  };
  if (q.length < 2) return svar(400, { feil: 'For kort søk' });

  const treff = [];
  const jobber = [
    hentJson(`https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(q)}*&treffPerSide=12&utkoordsys=4326`)
      .then(d => {
        for (const n of (d.navn || [])) {
          treff.push({
            navn: n.skrivemåte,
            type: n.navneobjekttype,
            kommune: (n.kommuner || []).map(k => k.kommunenavn).join(', '),
            lat: n.representasjonspunkt.nord,
            lon: n.representasjonspunkt.øst
          });
        }
      }).catch(() => {}),
    hentJson(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&treffPerSide=8`)
      .then(d => {
        for (const a of (d.adresser || [])) {
          treff.push({
            navn: a.adressetekst,
            type: 'Adresse',
            kommune: a.kommunenavn,
            lat: a.representasjonspunkt.lat,
            lon: a.representasjonspunkt.lon
          });
        }
      }).catch(() => {})
  ];

  await Promise.all(jobber);
  svar(200, { treff });
};
