#!/usr/bin/env node
// VIKTIG: Det dette skriptet skriver ut, skal IKKE limes inn i commits, saker eller chatter med kundedata.
// (Det skriver bare struktur, aldri koordinater, navn, koder eller nøkkelen. Les likevel gjennom før du deler.)
//
// Sonde mot en ekte SOSI-eksport fra Makin' 3D. Manuell, ikke en del av `npm test`.
//
// Bruk (i egen terminal, med nøkkelen satt der, aldri i chatten):
//   MAKIN_NOKKEL=...                      node test/makin-sonde.js   // lister organisasjoner (id og antall)
//   MAKIN_NOKKEL=... MAKIN_ORG=<id>       node test/makin-sonde.js   // lister prosjekter (uuid og antall)
//   MAKIN_NOKKEL=... MAKIN_ORG=<id> MAKIN_PROSJEKT=<uuid> node test/makin-sonde.js   // eksporterer og skriver struktur
//
// MAKIN_PROSJEKT er prosjektets UUID – det samme proxyen, skjermbildet og
// ror.makin.prosjektId bruker – ikke tall-id-en.
//
// Kaller Makin direkte (ikke proxyen). Node 18+, ingen avhengigheter.
// Utpakkingen her er midlertidig; en skikkelig lib/zip.js kommer senere.

'use strict';
const zlib = require('zlib');

const BASE = 'https://api.cloud.makin3d.com';
const NOKKEL = process.env.MAKIN_NOKKEL;
const ORG = process.env.MAKIN_ORG;
const PROSJEKT = process.env.MAKIN_PROSJEKT;

function stopp(melding) {
  console.error(melding);
  process.exit(1);
}

if (!NOKKEL) {
  stopp('Mangler MAKIN_NOKKEL. Lag en ny nøkkel på web.makin3d.com/profile/tokens ("Opprett ny nøkkel") ' +
    'og sett den i terminalen din før du kjører skriptet. Lim den aldri inn i chatten.');
}

// Henter fra Makin. Feil skrives som status + tittel (problem+json), aldri kropp eller nøkkel.
async function hent(sti, valg = {}) {
  let svar;
  try {
    svar = await fetch(BASE + sti, {
      ...valg,
      headers: { Authorization: 'Bearer ' + NOKKEL, ...(valg.headers || {}) },
    });
  } catch (e) {
    stopp('Fikk ikke kontakt med Makin (' + ((e.cause && e.cause.code) || e.name || 'ukjent feil') + ').');
  }
  return svar;
}

async function feil(svar, hva) {
  let tittel = '';
  try {
    const j = await svar.json();
    if (j && typeof j.title === 'string') tittel = ' – ' + j.title;
  } catch { /* ingen JSON-kropp */ }
  stopp(hva + ' feilet: HTTP ' + svar.status + tittel);
}

async function hentJson(sti, hva, valg) {
  const svar = await hent(sti, valg);
  if (!svar.ok) await feil(svar, hva);
  return svar.json();
}

function liste(j) {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
}

const ventMs = ms => new Promise(r => setTimeout(r, ms));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Feltnavnene i første oppføring og typen til hvert felt – aldri verdiene.
function skrivFeltnavn(hva, l) {
  const e = l.find(x => x && typeof x === 'object');
  if (!e) { console.log('  ' + hva + ': ingen oppføringer å vise feltnavn fra'); return; }
  const felt = Object.keys(e).sort().map(k => k + ':' + (e[k] === null ? 'null' : Array.isArray(e[k]) ? 'liste' : typeof e[k]));
  console.log('  ' + hva + ' – feltnavn i én oppføring: ' + felt.join(', '));
}

// ---------- Minimal ZIP-leser (sentralkatalog + inflateRaw, metode 0 og 8) ----------
function lesZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Ikke en ZIP-fil (fant ikke sentralkatalogen)');
  const antall = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const ut = [];
  for (let n = 0; n < antall; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Ødelagt sentralkatalog');
    const metode = buf.readUInt16LE(p + 10);
    const kompStr = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const kommLen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const navn = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + kommLen;
    if (buf.readUInt32LE(lokal) !== 0x04034b50) throw new Error('Ødelagt lokal header');
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const rå = buf.subarray(start, start + kompStr);
    let data;
    if (metode === 0) data = rå;
    else if (metode === 8) data = zlib.inflateRawSync(rå);
    else throw new Error('Ukjent komprimeringsmetode ' + metode);
    ut.push({ navn, data });
  }
  return ut;
}

// ---------- Strukturanalyse av SOSI (skriver aldri verdier, bare navn og antall) ----------
function dekod(buf) {
  const u = buf.toString('utf8');
  return u.includes('�') ? buf.toString('latin1') : u;
}

function analyser(tekst) {
  const grupper = new Map();   // gruppenavn -> {antall, felt: Map(feltnavn -> {n, verdier:Set})}
  const hode = new Map();      // feltnavn i .HODE -> verdi (kun innstillinger)
  const navnAntall = new Map();
  let gruppe = null;
  let iHode = false;
  for (const rå of tekst.split(/\r?\n/)) {
    const linje = rå.replace(/!.*$/, '').trim();
    const m = /^(\.+)([^\s.][^\s]*)\s*(.*)$/.exec(linje);
    if (!m) continue;
    const dybde = m[1].length;
    const navn = m[2].replace(/:$/, '');
    const verdi = m[3];
    if (dybde === 1) {
      gruppe = navn;
      iHode = navn === 'HODE';
      if (!grupper.has(navn)) grupper.set(navn, { antall: 0, felt: new Map() });
      grupper.get(navn).antall++;
      continue;
    }
    if (!gruppe) continue;
    if (iHode) {
      if (['KOORDSYS', 'ENHET', 'ORIGO-NØ', 'TEGNSETT', 'ENHET-H', 'ENHET-D', 'VERT-DATUM'].includes(navn)) {
        hode.set(navn, verdi);
      }
      continue;
    }
    const f = grupper.get(gruppe).felt;
    if (!f.has(navn)) f.set(navn, { n: 0, verdier: new Set() });
    const rec = f.get(navn);
    rec.n++;
    if (rec.verdier.size < 5000) rec.verdier.add(verdi);
    if (navn === 'NAME' && dybde === 2) navnAntall.set(verdi, (navnAntall.get(verdi) || 0) + 1);
  }
  return { grupper, hode, navnAntall };
}

function skrivStruktur(tekst) {
  const { grupper, hode, navnAntall } = analyser(tekst);
  console.log('\n== Hode ==');
  for (const k of ['KOORDSYS', 'ENHET', 'ORIGO-NØ', 'TEGNSETT', 'ENHET-H', 'ENHET-D', 'VERT-DATUM']) {
    console.log('  ..' + k + ': ' + (hode.has(k) ? hode.get(k) : '(finnes ikke)'));
  }
  console.log('\n== Grupper (antall, felt med forekomster og antall ulike verdier) ==');
  for (const [navn, g] of grupper) {
    console.log('  .' + navn + '  x' + g.antall);
    if (navn === 'HODE') continue;
    for (const [fnavn, rec] of g.felt) {
      const flagg = rec.verdier.size > 1 && rec.verdier.size <= 10 && rec.n > rec.verdier.size
        ? '   <-- få ulike verdier (kandidat for å skille maskiner)' : '';
      console.log('    ..' + fnavn + '  forekomster=' + rec.n + '  ulike=' + rec.verdier.size + flagg);
    }
  }
  const dup = [...navnAntall.values()].filter(n => n > 1);
  console.log('\n== ..NAME ==');
  console.log('  elementer med ..NAME: ' + [...navnAntall.values()].reduce((a, b) => a + b, 0) +
    ', ulike: ' + navnAntall.size + ', navn som går igjen: ' + dup.length +
    (dup.length ? ' (største gjentakelse ' + Math.max(...dup) + ' ganger)' : ''));
}

// ---------- Kjøring ----------
async function main() {
  if (!ORG) {
    const orgs = liste(await hentJson('/v1/organizations', 'Henting av organisasjoner'));
    console.log('Organisasjoner: ' + orgs.length);
    for (const o of orgs) console.log('  id=' + o.id);
    console.log('\nSett MAKIN_ORG til en av id-ene og kjør på nytt.');
    return;
  }
  const org = encodeURIComponent(ORG);
  if (!PROSJEKT) {
    const pr = liste(await hentJson('/v1/organizations/' + org + '/projects', 'Henting av prosjekter'));
    console.log('Prosjekter: ' + pr.length);
    for (const p of pr) console.log('  uuid=' + (typeof p.uuid === 'string' && p.uuid ? p.uuid : '(mangler)'));
    console.log('\nSett MAKIN_PROSJEKT til en av uuid-ene og kjør på nytt.');
    return;
  }
  if (!UUID.test(PROSJEKT)) stopp('MAKIN_PROSJEKT må være prosjektets uuid (ser slik ut: 123e4567-e89b-12d3-a456-426614174000).');
  const pid = encodeURIComponent(PROSJEKT);
  const rot = '/v1/organizations/' + org + '/projects/' + pid + '/geometry';

  const sys = liste(await hentJson(rot + '/systems', 'Henting av systemer'));
  console.log('Systemer: ' + sys.length + '  recordCount: [' + sys.map(s => s.recordCount).join(', ') + ']');
  skrivFeltnavn('systems', sys);

  /* koder-lista: navnene på feltene (aldri verdiene), så codeName, recordCount,
     firstLogged og lastLogged kan sjekkes mot det klienten og dialogen bruker. */
  const obj = liste(await hentJson(rot + '/objects', 'Henting av koder (objects)'));
  console.log('Koder (objects): ' + obj.length);
  skrivFeltnavn('objects', obj);
  for (const f of ['codeName', 'recordCount', 'firstLogged', 'lastLogged']) {
    const n = obj.filter(o => o && typeof o === 'object' && f in o).length;
    console.log('  ' + f + ': finnes i ' + n + ' av ' + obj.length);
  }

  const start = await hentJson(rot, 'Start av eksport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ types: ['point', 'line'] }),
  });
  if (!start || !start.exportId) stopp('Start av eksport ga ingen exportId.');
  const eid = encodeURIComponent(start.exportId);

  let zipBuf = null;
  for (let forsok = 1; forsok <= 20; forsok++) {
    const svar = await hent(rot + '/' + eid + '?format=Sosi&includeLinePoints=true&block=true');
    if (svar.status === 409) { await ventMs(2000); continue; }
    if (!svar.ok) await feil(svar, 'Nedlasting av eksport');
    zipBuf = Buffer.from(await svar.arrayBuffer());
    break;
  }
  if (!zipBuf) stopp('Eksporten ble ikke ferdig etter 20 forsøk (40 sekunder).');

  console.log('\nZIP: ' + zipBuf.length + ' byte');
  let filer;
  try { filer = lesZip(zipBuf); } catch (e) { stopp('Kunne ikke pakke ut ZIP: ' + e.message); }
  console.log('Filer i ZIP: ' + filer.length);
  for (const f of filer) {
    const pkt = f.navn.lastIndexOf('.');
    console.log('  filtype=' + (pkt >= 0 ? f.navn.slice(pkt) : '(ingen)') + '  ' + f.data.length + ' byte');
  }
  const sosi = filer.filter(f => /\.(sos|sosi)$/i.test(f.navn));
  if (!sosi.length) stopp('Fant ingen SOSI-fil i ZIP-en.');
  sosi.forEach((f, i) => {
    console.log('\n######## SOSI-fil ' + (i + 1) + ' av ' + sosi.length + ' (' + f.data.length + ' byte) ########');
    skrivStruktur(dekod(f.data));
  });
}

main().catch(e => stopp('Uventet feil: ' + (e && e.name ? e.name : 'ukjent')));
