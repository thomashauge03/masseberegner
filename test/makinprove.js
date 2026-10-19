'use strict';
/**
 * ZIP-leseren og proxyen mot Makin 3D (api/makin.js).
 *
 *   node test/makinprove.js
 *
 * Alt her er oppdiktet: nøkkelen, org-nummeret, prosjekt-uuid-en og punktene.
 * Makin kalles aldri på ekte – proxyen får en falsk `fetch` som tar opp det
 * den ble spurt om, og svarer det prøven bestemmer.
 */
const zlib = require('zlib');
const { Readable } = require('stream');
const { lesZip } = require('../lib/zip.js');
const { lagHandler } = require('../api/makin.js');

let feil = 0, ok = 0;
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}
function kaster(navn, f, monster) {
  try { f(); feil++; console.log(`  FEIL ${navn}  kastet ikke`); }
  catch (e) { paastand(navn, monster.test(e.message), e.message); }
}

const NOKKEL = 'oppdiktet-nokkel-9f3a';
const AUTH = 'Bearer ' + NOKKEL;
const BASE = 'https://api.cloud.makin3d.com';
const ORG = '7';
const PROSJEKT = '123e4567-e89b-12d3-a456-426614174000';
const MASKIN = '0a1b2c3d-1111-4222-8333-444455556666';

/* ---------------- verktøy: ZIP, falsk fetch, falsk res ---------------- */
const crc = b => (zlib.crc32 ? zlib.crc32(b) : 0);
/** Bygger en ZIP: [{navn, data: Buffer, metode: 0|8}] – lagret eller deflatet. */
function byggZip(oppforinger) {
  const lokale = [], sentrale = [];
  let forskyv = 0;
  for (const o of oppforinger) {
    const navn = Buffer.from(o.navn, 'utf8');
    const metode = o.metode === undefined ? 8 : o.metode;
    const pakket = metode === 8 ? zlib.deflateRawSync(o.data) : o.data;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(metode, 8); lh.writeUInt32LE(crc(o.data), 14);
    lh.writeUInt32LE(pakket.length, 18); lh.writeUInt32LE(o.data.length, 22);
    lh.writeUInt16LE(navn.length, 26);
    const lokal = Buffer.concat([lh, navn, pakket]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(metode, 10); ch.writeUInt32LE(crc(o.data), 16);
    ch.writeUInt32LE(pakket.length, 20); ch.writeUInt32LE(o.data.length, 24);
    ch.writeUInt16LE(navn.length, 28); ch.writeUInt32LE(forskyv, 42);
    lokale.push(lokal); sentrale.push(Buffer.concat([ch, navn]));
    forskyv += lokal.length;
  }
  const katalog = Buffer.concat(sentrale);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(oppforinger.length, 8); eocd.writeUInt16LE(oppforinger.length, 10);
  eocd.writeUInt32LE(katalog.length, 12); eocd.writeUInt32LE(forskyv, 16);
  return Buffer.concat([...lokale, katalog, eocd]);
}

/** Falsk fetch: tar opp hvert kall og svarer det `lag(url, opt)` gir. */
function lagFetch(lag) {
  const kall = [];
  const f = async (url, opt) => {
    kall.push({ url, metode: opt.method, hoder: opt.headers, opt });
    return lag(url, opt);
  };
  f.kall = kall;
  return f;
}
const jsonSvar = (status, data) => () => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function lagRes() {
  const r = { kode: null, hoder: {}, tekst: '' };
  r.writeHead = (k, h) => { r.kode = k; r.hoder = h || {}; };
  r.end = t => { r.tekst += t || ''; };
  r.json = () => JSON.parse(r.tekst);
  return r;
}
/** Kjør handleren: query som Vercel/server.js gir den, og nøkkelen i hodet. */
async function kall(f, query, valg = {}) {
  const handler = lagHandler({ fetch: f });
  const req = valg.strom
    ? Object.assign(Readable.from([Buffer.from(valg.strom)]), { method: valg.metode || 'POST', headers: valg.hoder || { authorization: AUTH }, query })
    : { method: valg.metode || 'GET', headers: valg.hoder || { authorization: AUTH }, query, body: valg.kropp };
  const res = lagRes();
  await handler(req, res);
  return res;
}

(async () => {

/* ------------------------------------------------------------------ */
console.log('\n1. lesZip');
{
  const sos = Buffer.from('.PUNKT 1\n..NØ 1 2\n.SLUTT\n', 'latin1');
  const tekst = Buffer.from('hei '.repeat(200));
  const zip = byggZip([
    { navn: 'eksport/lagret.txt', data: Buffer.from('lagret uten pakking'), metode: 0 },
    { navn: 'eksport/rør 1.sos', data: sos, metode: 8 },
    { navn: 'tekst.txt', data: tekst, metode: 8 }
  ]);
  const ut = lesZip(zip);
  paastand('tre oppføringer', ut.length === 3, String(ut.length));
  paastand('navnene kommer tilbake', ut.map(o => o.navn).join('|') === 'eksport/lagret.txt|eksport/rør 1.sos|tekst.txt', ut.map(o => o.navn).join('|'));
  paastand('lagret oppføring gir innholdet tilbake', ut[0].data.toString() === 'lagret uten pakking');
  paastand('deflatet oppføring gir bytene tilbake', Buffer.compare(ut[1].data, sos) === 0);
  paastand('lengre deflatet oppføring', Buffer.compare(ut[2].data, tekst) === 0);

  kaster('tom buffer kaster', () => lesZip(Buffer.alloc(0)), /Kunne ikke lese ZIP-fila fra Makin/);
  kaster('søppel kaster', () => lesZip(Buffer.from('dette er ingen zip-fil, bare tekst'.repeat(5))), /Kunne ikke lese ZIP-fila fra Makin/);
  kaster('avkuttet ZIP kaster', () => lesZip(zip.subarray(0, zip.length - 10)), /Kunne ikke lese ZIP-fila fra Makin/);
  const odelagt = Buffer.from(zip);
  odelagt.writeUInt16LE(99, odelagt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 10);   // ukjent metode
  kaster('ukjent pakkemetode kaster', () => lesZip(odelagt), /Kunne ikke lese ZIP-fila fra Makin/);
  const skadetData = byggZip([{ navn: 'a.sos', data: Buffer.from('x'.repeat(500)) }]);
  skadetData[40] ^= 0xff; skadetData[41] ^= 0xff; skadetData[42] ^= 0xff;                    // midt i deflate-strømmen
  kaster('skadet deflate-strøm kaster', () => lesZip(skadetData), /Kunne ikke lese ZIP-fila fra Makin/);
}

/* ------------------------------------------------------------------ */
console.log('\n2. Hvert kall treffer riktig Makin-URL');
{
  const sti = `${BASE}/v1/organizations/${ORG}/projects/${PROSJEKT}`;
  const tilfeller = [
    ['organisasjoner', {}, `${BASE}/v1/organizations`],
    ['prosjekter', { org: ORG }, `${BASE}/v1/organizations/${ORG}/projects`],
    ['maskiner', { org: ORG, prosjekt: PROSJEKT }, `${sti}/geometry/systems`],
    ['koder', { org: ORG, prosjekt: PROSJEKT }, `${sti}/geometry/objects`]
  ];
  for (const [hva, q, url] of tilfeller) {
    const f = lagFetch(jsonSvar(200, { data: [{ id: 1 }] }));
    const r = await kall(f, { hva, ...q });
    paastand(`${hva}: én fetch til rett URL`, f.kall.length === 1 && f.kall[0].url === url, f.kall.map(k => k.url).join(' '));
    paastand(`${hva}: GET`, f.kall[0] && f.kall[0].metode === 'GET');
    paastand(`${hva}: Authorization sendt videre uendret`, f.kall[0] && f.kall[0].hoder.Authorization === AUTH);
    paastand(`${hva}: fetch med cache no-store`, f.kall[0] && f.kall[0].opt.cache === 'no-store');
    paastand(`${hva}: svaret har Cache-Control no-store`, r.hoder['Cache-Control'] === 'no-store', JSON.stringify(r.hoder));
    paastand(`${hva}: 200 med data uendret`, r.kode === 200 && JSON.stringify(r.json()) === '[{"id":1}]', r.kode + ' ' + r.tekst);
  }
  const heltSvar = lagFetch(jsonSvar(200, [{ a: 1 }]));
  const r = await kall(heltSvar, { hva: 'organisasjoner' });
  paastand('uten data-nøkkel videresendes hele svaret', r.kode === 200 && r.tekst === '[{"a":1}]', r.tekst);

  const f = lagFetch(() => new Response(byggZip([{ navn: 'a.sos', data: Buffer.from('x') }]), { status: 200 }));
  await kall(f, { hva: 'hent', org: ORG, prosjekt: PROSJEKT, eksport: '42' });
  paastand('hent: rett URL med SOSI-valgene',
    f.kall[0] && f.kall[0].url === `${sti}/geometry/42?format=Sosi&includeLinePoints=true&block=true`, f.kall[0] && f.kall[0].url);
  paastand('hent: GET med Authorization uendret', f.kall[0].metode === 'GET' && f.kall[0].hoder.Authorization === AUTH);
  paastand('hent: bruker en tidsgrense (signal)', f.kall[0].opt.signal && typeof f.kall[0].opt.signal.aborted === 'boolean');
}

/* ------------------------------------------------------------------ */
console.log('\n3. start: POST og kroppen til Makin');
{
  const sti = `${BASE}/v1/organizations/${ORG}/projects/${PROSJEKT}/geometry`;
  const q = { hva: 'start', org: ORG, prosjekt: PROSJEKT };
  const f = lagFetch(jsonSvar(201, { exportId: 4711 }));
  const r = await kall(f, q, { metode: 'POST', kropp: { systemer: [MASKIN], koder: ['180 PE', 'SP'], fra: '2026-08-01T00:00:00Z', til: '2026-08-31T12:00:00.000Z' } });
  paastand('start: 200 {eksport}', r.kode === 200 && r.json().eksport === 4711 && Object.keys(r.json()).length === 1, r.kode + ' ' + r.tekst);
  paastand('start: POST til /geometry', f.kall[0] && f.kall[0].metode === 'POST' && f.kall[0].url === sti, f.kall[0] && f.kall[0].url);
  paastand('start: Authorization uendret', f.kall[0].hoder.Authorization === AUTH);
  const k = JSON.parse(f.kall[0].opt.body);
  paastand('start: kroppen oversatt til Makins feltnavn',
    JSON.stringify(k.systemUuids) === JSON.stringify([MASKIN]) && JSON.stringify(k.codeNames) === JSON.stringify(['180 PE', 'SP']) &&
    JSON.stringify(k.types) === '["point","line"]' && k.fromTimestamp === '2026-08-01T00:00:00.000Z' && k.toTimestamp === '2026-08-31T12:00:00.000Z',
    f.kall[0].opt.body);
  paastand('start: JSON som innholdstype', /application\/json/.test(f.kall[0].hoder['Content-Type']));

  const f2 = lagFetch(jsonSvar(201, { exportId: 5 }));
  await kall(f2, q, { metode: 'POST', kropp: { systemer: null, koder: null } });
  const k2 = JSON.parse(f2.kall[0].opt.body);
  paastand('start: felt som er null utelates', JSON.stringify(Object.keys(k2)) === '["types"]', f2.kall[0].opt.body);

  const f3 = lagFetch(jsonSvar(201, { exportId: 6 }));
  const r3 = await kall(f3, q, { metode: 'POST', strom: JSON.stringify({ systemer: [MASKIN], koder: null }) });
  paastand('start: kroppen leses fra strømmen når Vercel ikke har tolket den',
    r3.kode === 200 && f3.kall.length === 1 && JSON.parse(f3.kall[0].opt.body).systemUuids[0] === MASKIN, r3.kode + ' ' + r3.tekst);

  const f4 = lagFetch(jsonSvar(201, { exportId: 7 }));
  const r4 = await kall(f4, q, { metode: 'POST', kropp: JSON.stringify({ koder: ['SP'] }) });
  paastand('start: kropp som tekst tolkes', r4.kode === 200 && JSON.parse(f4.kall[0].opt.body).codeNames[0] === 'SP', r4.tekst);

  /* dårlig kropp: 400 og ingen fetch */
  const darlige = {
    'systemer er ikke uuid': { systemer: ['ikke-uuid'] },
    'systemer er ikke en liste': { systemer: MASKIN },
    'tom systemliste': { systemer: [] },
    'koder er ikke tekst': { koder: [5] },
    'fra er ikke en dato': { fra: 'i går' },
    'til er ikke tekst': { til: 12345 }
  };
  for (const [navn, kropp] of Object.entries(darlige)) {
    const fd = lagFetch(jsonSvar(201, { exportId: 1 }));
    const rd = await kall(fd, q, { metode: 'POST', kropp });
    paastand(`start med ${navn}: 400, ingen fetch`, rd.kode === 400 && fd.kall.length === 0, rd.kode + ' ' + fd.kall.length);
  }
  const fu = lagFetch(jsonSvar(201, { exportId: 1 }));
  const ru = await kall(fu, q, { metode: 'POST', strom: '{ikke json' });
  paastand('start med ugyldig JSON: 400, ingen fetch', ru.kode === 400 && fu.kall.length === 0, ru.kode + ' ' + ru.tekst);

  const fm = lagFetch(jsonSvar(201, { noe: 'annet' }));
  const rm = await kall(fm, q, { metode: 'POST', kropp: {} });
  paastand('start: Makin uten exportId gir 502', rm.kode === 502, rm.kode + ' ' + rm.tekst);
}

/* ------------------------------------------------------------------ */
console.log('\n4. hent: ZIP, bare .sos, base64');
{
  const q = { hva: 'hent', org: ORG, prosjekt: PROSJEKT, eksport: '42' };
  const sos = Buffer.from('.PUNKT 1\n..NØ 1 2\n.SLUTT\n', 'latin1');      // Ø som én byte (latin1)
  const zip = byggZip([
    { navn: 'lesmeg.txt', data: Buffer.from('ikke sosi') },
    { navn: 'mappe/', data: Buffer.alloc(0), metode: 0 },
    { navn: 'mappe/punkter.sos', data: sos },
    { navn: 'LINJER.SOS', data: Buffer.from('.KURVE 1\n'), metode: 0 }
  ]);
  const r = await kall(lagFetch(() => new Response(zip, { status: 200 })), q);
  const d = r.kode === 200 ? r.json() : {};
  paastand('hent: 200 {status:klar}', r.kode === 200 && d.status === 'klar', r.kode + ' ' + r.tekst.slice(0, 80));
  paastand('hent: bare .sos-oppføringene', d.filer && d.filer.map(x => x.navn).join('|') === 'mappe/punkter.sos|LINJER.SOS', JSON.stringify(d.filer && d.filer.map(x => x.navn)));
  paastand('hent: rå bytes som base64 (tegnsettet er uberørt)', d.filer && Buffer.compare(Buffer.from(d.filer[0].base64, 'base64'), sos) === 0);
  paastand('hent: Cache-Control no-store', r.hoder['Cache-Control'] === 'no-store');

  const rIngen = await kall(lagFetch(() => new Response(byggZip([{ navn: 'a.txt', data: Buffer.from('x') }]), { status: 200 })), q);
  paastand('hent: ZIP uten .sos gir tom fil-liste', rIngen.kode === 200 && Array.isArray(rIngen.json().filer) && rIngen.json().filer.length === 0, rIngen.tekst);

  const rSopp = await kall(lagFetch(() => new Response(Buffer.from('ingen zip her'), { status: 200 })), q);
  paastand('hent: ødelagt ZIP gir 502 med forklaring', rSopp.kode === 502 && /ZIP/.test(rSopp.json().feil), rSopp.kode + ' ' + rSopp.tekst);

  const r409 = await kall(lagFetch(() => new Response('', { status: 409 })), q);
  paastand('Makin 409 gir 202 {status:venter}', r409.kode === 202 && r409.json().status === 'venter', r409.kode + ' ' + r409.tekst);
  paastand('202 venter er heller ikke mellomlagret', r409.hoder['Cache-Control'] === 'no-store');

  const r409b = await kall(lagFetch(() => new Response('', { status: 409 })), { hva: 'prosjekter', org: ORG });
  paastand('409 på andre kall er en feil, ikke «venter»', r409b.kode === 502, String(r409b.kode));
}

/* ------------------------------------------------------------------ */
console.log('\n5. Ugyldige parametre: 400 og Makin røres ikke');
{
  const gyldig = { org: ORG, prosjekt: PROSJEKT };
  const darlige = {
    'org med sti-triks (1/../x)': { hva: 'prosjekter', org: '1/../x' },
    'org null': { hva: 'prosjekter', org: '0' },
    'org negativ': { hva: 'prosjekter', org: '-3' },
    'org med bokstaver': { hva: 'prosjekter', org: '12ab' },
    'org mangler': { hva: 'prosjekter' },
    'org som liste': { hva: 'prosjekter', org: ['1', '2'] },
    'prosjekt er ikke uuid': { hva: 'maskiner', org: ORG, prosjekt: 'ikke-uuid' },
    'prosjekt med sti-triks': { hva: 'koder', org: ORG, prosjekt: PROSJEKT + '/../..' },
    'prosjekt mangler': { hva: 'maskiner', org: ORG },
    'eksport -1': { hva: 'hent', ...gyldig, eksport: '-1' },
    'eksport 0': { hva: 'hent', ...gyldig, eksport: '0' },
    'eksport mangler': { hva: 'hent', ...gyldig },
    'eksport med spørring': { hva: 'hent', ...gyldig, eksport: '1?x=2' },
    'ukjent hva': { hva: 'slett', ...gyldig },
    'hva mangler': { ...gyldig },
    'hva er en sti': { hva: '../../v1/users', ...gyldig }
  };
  for (const [navn, q] of Object.entries(darlige)) {
    const f = lagFetch(jsonSvar(200, { data: [] }));
    const r = await kall(f, q);
    paastand(`${navn}: 400, ingen fetch`, r.kode === 400 && f.kall.length === 0 && typeof r.json().feil === 'string', r.kode + ' ' + f.kall.length);
  }
  const fs = lagFetch(jsonSvar(201, { exportId: 1 }));
  const rs = await kall(fs, { hva: 'start', ...gyldig }, { metode: 'GET' });
  paastand('start med GET: 400, ingen fetch', rs.kode === 400 && fs.kall.length === 0, rs.kode + ' ' + fs.kall.length);
  const fg = lagFetch(jsonSvar(200, { data: [] }));
  const rg = await kall(fg, { hva: 'prosjekter', org: ORG }, { metode: 'POST', kropp: {} });
  paastand('lese-kall med POST: 400, ingen fetch', rg.kode === 400 && fg.kall.length === 0, rg.kode + ' ' + fg.kall.length);
  const rq = await kall(lagFetch(jsonSvar(200, [])), undefined);
  paastand('manglende query tåles (400)', rq.kode === 400, String(rq.kode));
}

/* ------------------------------------------------------------------ */
console.log('\n6. Nøkkelen');
{
  const q = { hva: 'organisasjoner' };
  const nokkelhoder = {
    'ingen Authorization': {},
    'Basic i stedet for Bearer': { authorization: 'Basic abc' },
    'Bearer uten nøkkel': { authorization: 'Bearer ' },
    'Bearer med bare mellomrom': { authorization: 'Bearer    ' },
    'tom verdi': { authorization: '' },
    'bearer med liten b': { authorization: 'bearer abc' },
    'linjeskift i nøkkelen': { authorization: 'Bearer abc\r\nX-Evil: 1' }
  };
  for (const [navn, hoder] of Object.entries(nokkelhoder)) {
    const f = lagFetch(jsonSvar(200, { data: [] }));
    const r = await kall(f, q, { hoder });
    paastand(`${navn}: 401 mangler nøkkel, ingen fetch`, r.kode === 401 && r.json().feil === 'mangler nøkkel' && f.kall.length === 0, r.kode + ' ' + r.tekst);
  }
  const r0 = await kall(lagFetch(jsonSvar(200, [])), q, { hoder: {} });
  paastand('401 er ikke mellomlagret', r0.hoder['Cache-Control'] === 'no-store');
}

/* ------------------------------------------------------------------ */
console.log('\n7. Feil fra Makin, og at nøkkelen ikke lekker');
{
  const alle = [];                                   // alle svarene, for å lete etter nøkkelen
  for (const status of [401, 403]) {
    const r = await kall(lagFetch(() => new Response('{"detail":"Bearer ' + NOKKEL + ' er avvist"}', { status })), { hva: 'organisasjoner' });
    alle.push(r);
    paastand(`Makin ${status} gir 401 avvist`, r.kode === 401 && r.json().feil === 'avvist', r.kode + ' ' + r.tekst);
  }
  for (const status of [400, 404, 429, 500, 503]) {
    const r = await kall(lagFetch(() => new Response('feil Bearer ' + NOKKEL, { status })), { hva: 'organisasjoner' });
    alle.push(r);
    paastand(`Makin ${status} gir 502 «Makin svarte ${status}»`, r.kode === 502 && r.json().feil === `Makin svarte ${status}`, r.kode + ' ' + r.tekst);
  }
  const rKast = await kall(lagFetch(() => { throw new TypeError('fetch failed: Bearer ' + NOKKEL); }), { hva: 'organisasjoner' });
  alle.push(rKast);
  paastand('nettverksfeil gir 502', rKast.kode === 502, rKast.kode + ' ' + rKast.tekst);

  const rRedirect = await kall(lagFetch(() => new Response('', { status: 302, headers: { Location: 'https://ond.example/' } })), { hva: 'organisasjoner' });
  alle.push(rRedirect);
  paastand('omdirigering følges ikke (502)', rRedirect.kode === 502, rRedirect.kode + ' ' + rRedirect.tekst);

  const fTid = lagFetch(() => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
  const rTid = await kall(fTid, { hva: 'organisasjoner' });
  alle.push(rTid);
  paastand('tidsavbrudd gir 504 «Makin svarte ikke i tide»', rTid.kode === 504 && rTid.json().feil === 'Makin svarte ikke i tide', rTid.kode + ' ' + rTid.tekst);

  const rUgyldig = await kall(lagFetch(() => new Response('<html>ikke json</html>', { status: 200 })), { hva: 'organisasjoner' });
  alle.push(rUgyldig);
  paastand('200 uten gyldig JSON gir 502', rUgyldig.kode === 502, rUgyldig.kode + ' ' + rUgyldig.tekst);

  const rMangler = await kall(lagFetch(jsonSvar(200, [])), { hva: 'organisasjoner' }, { hoder: {} });
  const r400 = await kall(lagFetch(jsonSvar(200, [])), { hva: 'prosjekter', org: 'x' });
  alle.push(rMangler, r400);
  paastand('ingen av feilsvarene inneholder nøkkelen',
    alle.every(r => !r.tekst.includes(NOKKEL) && !JSON.stringify(r.hoder).includes(NOKKEL)));
  paastand('alle feilsvarene har no-store', alle.every(r => r.hoder['Cache-Control'] === 'no-store'));

  /* ingen console.* i api/makin.js */
  const kilde = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'makin.js'), 'utf8');
  paastand('api/makin.js logger ingenting (ingen console.*)', !/console\./.test(kilde));
}

/* ------------------------------------------------------------------ */
console.log('\n8. For stort svar: 413');
{
  const stor = { data: [{ tekst: 'x'.repeat(4100000) }] };
  const r = await kall(lagFetch(jsonSvar(200, stor)), { hva: 'koder', org: ORG, prosjekt: PROSJEKT });
  paastand('JSON over 4 000 000 byte gir 413 «for stor»', r.kode === 413 && r.json().feil === 'for stor', r.kode + ' ' + r.tekst.length);

  const nesten = { data: [{ tekst: 'x'.repeat(3900000) }] };
  const r2 = await kall(lagFetch(jsonSvar(200, nesten)), { hva: 'koder', org: ORG, prosjekt: PROSJEKT });
  paastand('under grensen går gjennom', r2.kode === 200, String(r2.kode));

  /* ZIP med tilfeldige (ikke-komprimerbare) bytes: base64 blir over 4 MB i svaret */
  const tilfeldig = Buffer.alloc(3200000);
  let s = 12345;
  for (let i = 0; i < tilfeldig.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; tilfeldig[i] = s >> 16; }
  const zip = byggZip([{ navn: 'stor.sos', data: tilfeldig, metode: 0 }]);
  const r3 = await kall(lagFetch(() => new Response(zip, { status: 200 })), { hva: 'hent', org: ORG, prosjekt: PROSJEKT, eksport: '9' });
  paastand('hent: base64 over 4 000 000 byte gir 413', r3.kode === 413 && r3.json().feil === 'for stor', r3.kode + ' ' + r3.tekst.length);
}

console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
})();
