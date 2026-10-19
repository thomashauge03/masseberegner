'use strict';
/**
 * Liten ZIP-leser, uten avhengigheter.
 *
 * Makin pakker SOSI-eksporten i en ZIP. Fila leses fra den sentrale katalogen
 * bakerst (ikke ved a gå fra lokal header til lokal header): bare katalogen
 * har sikre størrelser, også når fila er skrevet med «data descriptor».
 * Støtter metode 0 (lagret) og 8 (deflate, via zlib.inflateRawSync) – det er
 * alt Makin og vanlige ZIP-verktøy skriver. ZIP64, kryptering og andre
 * metoder gir feil.
 */

const zlib = require('zlib');

const FEIL = 'Kunne ikke lese ZIP-fila fra Makin';
const SIG_EOCD = 0x06054b50;      // slutten av den sentrale katalogen
const SIG_KATALOG = 0x02014b50;   // én oppføring i katalogen
const SIG_LOKAL = 0x04034b50;     // lokal header foran dataene
const MAKS_UTPAKKET = 64 * 1024 * 1024;   // vern mot «ZIP-bomber»

/**
 * @param {Buffer} buf  hele ZIP-fila
 * @returns {Array<{navn: string, data: Buffer}>}  i katalogens rekkefølge
 */
function lesZip(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('for kort');

    /* EOCD: 22 byte pluss en kommentar på høyst 65535 byte, helt bakerst. */
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
      if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('fant ikke katalogen');

    const antall = buf.readUInt16LE(eocd + 10);
    const katalogLen = buf.readUInt32LE(eocd + 12);
    let pos = buf.readUInt32LE(eocd + 16);
    if (antall === 0xffff || katalogLen === 0xffffffff || pos === 0xffffffff) throw new Error('ZIP64');
    if (pos + katalogLen > eocd) throw new Error('katalogen ligger utenfor fila');

    const ut = [];
    let sumUtpakket = 0;
    for (let k = 0; k < antall; k++) {
      if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== SIG_KATALOG) throw new Error('ødelagt katalog');
      const flagg = buf.readUInt16LE(pos + 8);
      const metode = buf.readUInt16LE(pos + 10);
      const pakketLen = buf.readUInt32LE(pos + 20);
      const utpakketLen = buf.readUInt32LE(pos + 24);
      const navnLen = buf.readUInt16LE(pos + 28);
      const ekstraLen = buf.readUInt16LE(pos + 30);
      const kommentarLen = buf.readUInt16LE(pos + 32);
      const lokal = buf.readUInt32LE(pos + 42);
      if (pos + 46 + navnLen > buf.length) throw new Error('ødelagt katalog');
      /* Bit 11 betyr UTF-8 i navnet; ellers er det det gamle tegnsettet. */
      const navn = buf.toString(flagg & 0x0800 ? 'utf8' : 'latin1', pos + 46, pos + 46 + navnLen);
      pos += 46 + navnLen + ekstraLen + kommentarLen;

      if (flagg & 1) throw new Error('kryptert');
      if (metode !== 0 && metode !== 8) throw new Error('ukjent metode ' + metode);
      sumUtpakket += utpakketLen;
      if (sumUtpakket > MAKS_UTPAKKET) throw new Error('for stor');

      /* Lokal header har egne lengder på navn og ekstra; dataene kommer etter. */
      if (lokal + 30 > buf.length || buf.readUInt32LE(lokal) !== SIG_LOKAL) throw new Error('ødelagt lokal header');
      const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
      if (start + pakketLen > buf.length) throw new Error('dataene går utenfor fila');
      const pakket = buf.subarray(start, start + pakketLen);

      let data;
      if (metode === 0) {
        data = Buffer.from(pakket);
      } else if (utpakketLen === 0) {
        data = Buffer.alloc(0);
      } else {
        data = zlib.inflateRawSync(pakket, { maxOutputLength: utpakketLen });
      }
      if (data.length !== utpakketLen) throw new Error('feil lengde på ' + navn);
      ut.push({ navn, data });
    }
    return ut;
  } catch (e) {
    /* Én melding uansett årsak: årsaken (og filnavn) hører ikke hjemme i svaret. */
    throw new Error(FEIL);
  }
}

module.exports = { lesZip };
