'use strict';
/**
 * /api/makin?hva=<kall>&org=<orgId>&prosjekt=<uuid>&eksport=<id>
 *
 * Proxy mot Makin 3D sin sky-API. Nettleseren kan ikke kalle Makin selv (ingen
 * CORS-hoder), så kallene går hit. Funksjonen slipper bare gjennom en fast
 * liste med kall, bygd av validerte parametre – aldri en adresse eller sti fra
 * klienten – og den skriver aldri til Makin: det eneste POST-kallet starter en
 * eksport.
 *
 *   hva=organisasjoner                    GET  /v1/organizations
 *   hva=prosjekter  &org                  GET  …/{org}/projects
 *   hva=maskiner    &org&prosjekt         GET  …/projects/{p}/geometry/systems
 *   hva=koder       &org&prosjekt         GET  …/projects/{p}/geometry/objects
 *   hva=start       &org&prosjekt         POST …/projects/{p}/geometry   (kropp: se under)
 *   hva=hent        &org&prosjekt&eksport GET  …/geometry/{eksport}?format=Sosi&…
 *
 * NØKKELEN. Brukerens Makin-nøkkel kommer i Authorization-hodet på hvert kall
 * og sendes videre uendret. Den lagres, logges og mellomlagres aldri: ingen
 * logging til konsollen her, og feilmeldinger bygges av status og faste tekster, aldri av
 * det Makin eller fetch sier (det kan ekko hodet). Alle svar er no-store.
 *
 * start tar JSON { systemer: uuid[]|null, koder: string[]|null, fra?, til? }
 * og svarer { eksport: <exportId> }. hent svarer { status:'klar', filer:[{navn,
 * base64}] } (bare .sos-/.sosi-filene, rå bytes – nettleseren dekoder tegnsettet), eller
 * 202 { status:'venter' } når Makin ikke er ferdig (409).
 */

const { lesZip } = require('../lib/zip.js');

const MAKIN = 'https://api.cloud.makin3d.com';
const TIDSGRENSE_MS = 25000;       // Vercel stopper funksjonen ved 30 s; vi svarer selv før det
const MAKS_SVAR = 4000000;         // Vercel tillater 4,5 MB svar fra en funksjon
const MAKS_KROPP = 100000;         // en start-kropp er noen hundre byte; alt over er feil

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HELTALL = /^[1-9][0-9]{0,9}$/;                 // heltall > 0
const KONTROLLTEGN = /[\x00-\x1f\x7f]/;

/* Hva hvert kall trenger av parametre, og hvilken metode det krever. */
const KALL = {
  organisasjoner: { metode: 'GET', krever: [] },
  prosjekter: { metode: 'GET', krever: ['org'] },
  maskiner: { metode: 'GET', krever: ['org', 'prosjekt'] },
  koder: { metode: 'GET', krever: ['org', 'prosjekt'] },
  start: { metode: 'POST', krever: ['org', 'prosjekt'] },
  hent: { metode: 'GET', krever: ['org', 'prosjekt', 'eksport'] }
};

/** Kroppen: fra req.body hvis Vercel har tolket den, ellers fra strømmen (server.js). */
async function lesKropp(req, maks = MAKS_KROPP) {
  let k = req.body;
  if (k === undefined || k === null) {
    if (typeof req[Symbol.asyncIterator] !== 'function') return undefined;
    const deler = [];
    let n = 0;
    for await (const del of req) {
      n += del.length;
      if (n > maks) throw new Error('for stor kropp');
      deler.push(Buffer.from(del));
    }
    k = Buffer.concat(deler).toString('utf8');
  }
  if (Buffer.isBuffer(k)) k = k.toString('utf8');
  if (typeof k === 'string') return k.trim() ? JSON.parse(k) : undefined;
  return k;
}

/** Nøkkelen i hodet: «Bearer » og så noe som ikke er tomt eller har kontrolltegn. */
function nokkelhode(req) {
  const h = req.headers && req.headers.authorization;
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const nokkel = h.slice(7);
  if (!nokkel.trim() || KONTROLLTEGN.test(nokkel)) return null;
  return h;
}

/** start-kroppen til Makins kropp. Kaster en tekst (til 400) ved noe feil. */
function byggStart(k) {
  if (k === undefined || k === null) k = {};
  if (typeof k !== 'object' || Array.isArray(k)) throw new Error('Kroppen må være et objekt');
  const ut = { types: ['point', 'line'] };

  if (k.systemer !== undefined && k.systemer !== null) {
    if (!Array.isArray(k.systemer) || !k.systemer.length || k.systemer.length > 200 ||
        !k.systemer.every(s => typeof s === 'string' && UUID.test(s))) {
      throw new Error('systemer må være en liste med maskin-UUID-er');
    }
    ut.systemUuids = k.systemer;
  }
  if (k.koder !== undefined && k.koder !== null) {
    if (!Array.isArray(k.koder) || !k.koder.length || k.koder.length > 500 ||
        !k.koder.every(s => typeof s === 'string' && s.length > 0 && s.length <= 100 && !KONTROLLTEGN.test(s))) {
      throw new Error('koder må være en liste med tekst');
    }
    ut.codeNames = k.koder;
  }
  for (const [fra, til] of [['fra', 'fromTimestamp'], ['til', 'toTimestamp']]) {
    if (k[fra] === undefined || k[fra] === null) continue;
    const t = typeof k[fra] === 'string' ? new Date(k[fra]) : null;
    if (!t || isNaN(t)) throw new Error(`${fra} må være et tidspunkt`);
    ut[til] = t.toISOString();
  }
  return ut;
}

function lagHandler({ fetch }) {
  return async function handler(req, res) {
    /* Hvert svar er no-store: nøkkelen skal aldri ende i en mellomlager, og et
       «venter» eller en feil må ikke bli stående. */
    const svar = (kode, data) => {
      let tekst = JSON.stringify(data);
      if (kode === 200 && Buffer.byteLength(tekst) > MAKS_SVAR) {
        kode = 413;
        tekst = JSON.stringify({ feil: 'for stor' });
      }
      res.writeHead(kode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(tekst);
    };

    const q = req.query || {};
    const hva = typeof q.hva === 'string' && Object.prototype.hasOwnProperty.call(KALL, q.hva) ? q.hva : null;
    if (!hva) return svar(400, { feil: 'Ukjent kall' });
    const kall = KALL[hva];

    const auth = nokkelhode(req);
    if (!auth) return svar(401, { feil: 'mangler nøkkel' });

    if (req.method !== kall.metode) return svar(400, { feil: `Kallet ${hva} krever ${kall.metode}` });

    /* Parametrene bygges inn i stien først etter at de er sjekket mot fast form. */
    const { org, prosjekt, eksport } = q;
    if (kall.krever.includes('org') && !(typeof org === 'string' && HELTALL.test(org))) return svar(400, { feil: 'Ugyldig org' });
    if (kall.krever.includes('prosjekt') && !(typeof prosjekt === 'string' && UUID.test(prosjekt))) return svar(400, { feil: 'Ugyldig prosjekt' });
    if (kall.krever.includes('eksport') && !(typeof eksport === 'string' && HELTALL.test(eksport))) return svar(400, { feil: 'Ugyldig eksport' });

    const orgSti = `${MAKIN}/v1/organizations`;
    const prosjektSti = `${orgSti}/${org}/projects/${prosjekt}`;
    const url = {
      organisasjoner: orgSti,
      prosjekter: `${orgSti}/${org}/projects`,
      maskiner: `${prosjektSti}/geometry/systems`,
      koder: `${prosjektSti}/geometry/objects`,
      start: `${prosjektSti}/geometry`,
      hent: `${prosjektSti}/geometry/${eksport}?format=Sosi&includeLinePoints=true&block=true`
    }[hva];

    const valg = {
      method: kall.metode,
      headers: { Authorization: auth, Accept: hva === 'hent' ? 'application/zip, application/octet-stream' : 'application/json' },
      cache: 'no-store',
      redirect: 'manual',                         // nøkkelen følger ikke med til en annen adresse
      signal: AbortSignal.timeout(TIDSGRENSE_MS)
    };
    if (hva === 'start') {
      try {
        valg.body = JSON.stringify(byggStart(await lesKropp(req)));
      } catch (e) {
        return svar(400, { feil: e instanceof SyntaxError ? 'Kroppen er ikke gyldig JSON' : e.message });
      }
      valg.headers['Content-Type'] = 'application/json';
    }

    try {
      const r = await fetch(url, valg);

      if (r.status === 401 || r.status === 403) return svar(401, { feil: 'avvist' });
      if (hva === 'hent' && r.status === 409) return svar(202, { status: 'venter' });
      if (r.status < 200 || r.status > 299) return svar(502, { feil: `Makin svarte ${r.status}` });

      if (hva === 'hent') {
        let filer;
        try {
          filer = lesZip(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw e;
          return svar(502, { feil: 'Kunne ikke lese ZIP-fila fra Makin' });
        }
        return svar(200, {
          status: 'klar',
          filer: filer.filter(f => /\.sosi?$/i.test(f.navn)).map(f => ({ navn: f.navn, base64: f.data.toString('base64') }))
        });
      }

      const kropp = await r.json();
      if (hva === 'start') {
        const id = Number(kropp && kropp.exportId);
        if (!Number.isSafeInteger(id) || id < 1) return svar(502, { feil: 'Makin svarte uventet' });
        return svar(200, { eksport: id });
      }
      const erObjekt = kropp !== null && typeof kropp === 'object' && !Array.isArray(kropp);
      return svar(200, erObjekt && 'data' in kropp ? kropp.data : kropp);
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return svar(504, { feil: 'Makin svarte ikke i tide' });
      if (e instanceof SyntaxError) return svar(502, { feil: 'Makin ga et svar vi ikke forsto' });
      return svar(502, { feil: 'Kunne ikke nå Makin' });
    }
  };
}

module.exports = lagHandler({ fetch: (...a) => fetch(...a) });
module.exports.lagHandler = lagHandler;
module.exports.lesKropp = lesKropp;
/* For prøven som sjekker at klienten (public/js/makin.js) siler etter samme regler. */
module.exports.byggStart = byggStart;
module.exports.UUID = UUID;
module.exports.HELTALL = HELTALL;
