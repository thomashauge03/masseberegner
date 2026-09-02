'use strict';
/**
 * Terrengmodell i nettleseren.
 *
 * Henter 256 x 256 m fliser av Kartverket sin DTM1 (1 m laserdata) via
 * den lokale serveren, og gir oppslag av terrenghøyde i vilkarlige punkt
 * med bilineær interpolasjon.
 *
 * Høydene er kontrollert mot Kartverket sitt offisielle punkt-API og
 * stemmer innenfor noen fa millimeter.
 */

const FLIS_M = 256;

/**
 * Flisene har svaert lang levetid i hurtigbufferen, bade hos Vercel og i
 * nettleseren.
 *
 * Dette tallet ma økes hver gang *innholdet* bak en adresse endrer seg - ikke
 * bare nar formatet gjør det. Da overflatemodellen ble lagt til, rakk en feil
 * versjon a bli bufret i et helt ar før den var riktig, og med "immutable"
 * ville den aldri blitt hentet pa nytt.
 *
 *   2: fliser pakket som centimeter over et nullniva
 *   3: egen adresse for overflatemodellen (modell=dom)
 *   4: fliser som er nøyaktig null over alt regnes som manglende dekning.
 *      Utenfor dekningen svarer høydetjenesten 0,00 for hver eneste piksel,
 *      og de flisene la bufret som havflate.
 *   5: og fliser som er DELVIS null, der nullflaten grenser mot høyt terreng.
 *      En flis på selve dekningskanten har ekte data i den ene enden og
 *      nuller i den andre, og slapp gjennom med nullene som koter – et stup
 *      på sju hundre meter tvers over en cellegrense. Se `nullflateKant` i
 *      lib/hoydedata.js. Nettleseren har flisen i sitt eget mellomlager òg,
 *      så tallet her må følge med, ellers blir den gamle liggende.
 */
const FLIS_VERSJON = 5;

/**
 * Pakker ut en flis fra serveren.
 *
 * Format 1: hele centimeter over et nullniva for flisen, som 16-bits tall.
 *           Terrengmodellen er selv oppgitt i centimeter, sa ingenting gar
 *           tapt, og flisen blir under halvparten sa stor pa nettet.
 * Format 2: rå float32. Brukes nar høydeforskjellen innenfor flisen er for
 *           stor for et 16-bits tall.
 */
function pakkOppFlis(arrayBuffer) {
  const b = new DataView(arrayBuffer);
  const magi = String.fromCharCode(b.getUint8(0), b.getUint8(1), b.getUint8(2), b.getUint8(3));
  if (magi !== 'MKT1') throw new Error('Ukjent flisformat');
  const format = b.getUint8(4);
  const base = b.getFloat32(8, true);
  if (format === 2) return new Float32Array(arrayBuffer, 16);
  const i16 = new Int16Array(arrayBuffer, 16);
  const ut = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) ut[i] = i16[i] === -32768 ? NaN : base + i16[i] / 100;
  return ut;
}

class Terreng {
  /** @param {string} [modell] 'dtm' (terreng) eller 'dom' (overflate med vegetasjon) */
  constructor(sonenr, oppløsning = 1, modell = 'dtm') {
    this.sone = sonenr;
    this.sr = 25800 + sonenr;   // ETRS89 / UTM (EPSG 25832, 25833, 25835)
    this.res = oppløsning;                 // meter per piksel
    this.modell = modell;
    this.P = Math.round(FLIS_M / this.res); // piksler per flis
    this.fliser = new Map();
    this.mangler = new Set();
  }

  nøkkel(tx, ty) { return tx + '_' + ty; }

  /**
   * Laster flisene som dekker et omrade - brukt av tomtemodus.
   *
   * En veg trenger et smalt belte langs en linje, og lastKorridor gar til verks
   * deretter: den vandrer langs linjen og prøver a treffe sa fa fliser som
   * mulig. En tomt er en klump, og da er det ingenting a spare pa a vaere lur.
   * Hele omsluttende rektangel tas rett fram.
   *
   * Malt: en tomt pa 50 x 80 m med 45 m skraningssone treffer 1-4 fliser mot
   * 4-10 for en 850 m veg - altsa omtrent en femdel av minnet.
   *
   * @param {Array<{x:number,y:number}>} omriss  UTM
   * @param {number} marg  hvor langt utenfor omrisset det trengs data
   */
  async lastOmraade(omriss, marg, framdrift) {
    if (!omriss || omriss.length < 3) return;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (const p of omriss) {
      minX = Math.min(minX, p.x); maksX = Math.max(maksX, p.x);
      minY = Math.min(minY, p.y); maksY = Math.max(maksY, p.y);
    }
    /* To meter ekstra fordi den bilineære interpolasjonen slar opp i
       nabocellen: et punkt helt ute ved kanten leser en celle som kan høre til
       en flis ingen har bedt om, og da blir høyden der hentet fra faerre naboer
       enn den skulle. */
    const m = (marg || 0) + 2;
    const trengs = new Set();
    for (let ty = Math.floor((minY - m) / FLIS_M); ty <= Math.floor((maksY + m) / FLIS_M); ty++) {
      for (let tx = Math.floor((minX - m) / FLIS_M); tx <= Math.floor((maksX + m) / FLIS_M); tx++) {
        trengs.add(this.nøkkel(tx, ty));
      }
    }
    return this._lastFliser(trengs, framdrift);
  }

  /** Laster alle fliser som trengs for et belte langs linjeføringen. */
  async lastKorridor(linje, halvbredde, framdrift) {
    const trengs = new Set();
    const marg = 2;
    const stegS = Math.min(16, Math.max(2, linje.lengde / 400));
    const stegT = 16;
    for (let s = 0; s <= linje.lengde + 1e-9; s = Math.min(s + stegS, linje.lengde + 1e-9)) {
      const p = linje.punktVed(Math.min(s, linje.lengde));
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let t = -halvbredde - marg; t <= halvbredde + marg + 1e-9; t += stegT) {
        const tt = Math.min(t, halvbredde + marg);
        const x = p.x + nx * tt, y = p.y + ny * tt;
        trengs.add(this.nøkkel(Math.floor(x / FLIS_M), Math.floor(y / FLIS_M)));
      }
      // sikre at ytterkantene alltid er med
      for (const tt of [-halvbredde - marg, halvbredde + marg]) {
        const x = p.x + nx * tt, y = p.y + ny * tt;
        trengs.add(this.nøkkel(Math.floor(x / FLIS_M), Math.floor(y / FLIS_M)));
      }
      if (s >= linje.lengde) break;
    }

    /* Ogsa litt utenfor endene. Den bilineære interpolasjonen slar opp i
       nabocellen, sa et punkt i profil 0 leser en celle som ligger like før
       linjens start - og den kan høre til en flis ingen har bedt om. Da ble
       høyden i endene hentet fra faerre naboer enn den skulle. */
    for (const [s, retning] of [[0, -1], [linje.lengde, 1]]) {
      const p = linje.punktVed(s);
      const dx = Math.cos(p.retning) * retning, dy = Math.sin(p.retning) * retning;
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let d = 0; d <= marg + 1e-9; d += marg) {
        for (const tt of [-halvbredde - marg, 0, halvbredde + marg]) {
          const x = p.x + dx * d + nx * tt, y = p.y + dy * d + ny * tt;
          trengs.add(this.nøkkel(Math.floor(x / FLIS_M), Math.floor(y / FLIS_M)));
        }
      }
    }

    /* Fliser som slo feil sist far en ny sjanse. En kortvarig nettfeil skal
       ikke gjøre at et omrade star tomt resten av økta.

       Merk at «ingen dekning» ikke kommer hit som en feil: da svarer tjenesten
       pent med en flis der hver eneste piksel er null, og serveren gjør den om
       til manglende data. En feil pa dette stedet er derfor alltid teknisk. */
    return this._lastFliser(trengs, framdrift);
  }

  /**
   * Laster ned flisene i settet. Delt av bade lastKorridor og lastOmraade -
   * her ligger samtidigheten, det ekstra forsøket og framdriften, og det er
   * det samme uansett hvilken form omradet har.
   */
  async _lastFliser(trengs, framdrift) {
    this.mangler.clear();
    const liste = [...trengs].filter(k => !this.fliser.has(k));
    let ferdig = 0;
    const totalt = liste.length;
    if (framdrift) framdrift(0, totalt);

    const samtidig = 6;
    let i = 0;
    const arbeidere = new Array(Math.min(samtidig, totalt)).fill(0).map(async () => {
      while (i < liste.length) {
        const k = liste[i++];
        const [tx, ty] = k.split('_').map(Number);
        // ett forsøk til før vi gir opp - opplasteren svarer ikke alltid første gang
        for (let forsok = 0; forsok < 2; forsok++) {
          try {
            const svar = await fetch(`api/dtm/flis?sr=${this.sr}&tx=${tx}&ty=${ty}&res=${this.res}`
              + `&modell=${this.modell}&v=${FLIS_VERSJON}`);
            if (!svar.ok) throw new Error('HTTP ' + svar.status);
            this.fliser.set(k, pakkOppFlis(await svar.arrayBuffer()));
            break;
          } catch (e) {
            if (forsok) { console.warn('Fikk ikke flis', k, e.message); this.mangler.add(k); }
            else await new Promise(r => setTimeout(r, 400));
          }
        }
        ferdig++;
        if (framdrift) framdrift(ferdig, totalt);
      }
    });
    await Promise.all(arbeidere);
    return { hentet: totalt, mangler: this.mangler.size };
  }

  /** Verdi i en global pikselcelle. */
  _celle(gi, gj) {
    const P = this.P;
    const tx = Math.floor(gi / P);
    const i = gi - tx * P;
    const ty = Math.ceil(-gj / P) - 1;
    const j = gj + (ty + 1) * P;
    const flis = this.fliser.get(this.nøkkel(tx, ty));
    if (!flis) return NaN;
    if (i < 0 || i >= P || j < 0 || j >= P) return NaN;
    return flis[j * P + i];
  }

  /** Terrenghøyde med bilineær interpolasjon. NaN dersom data mangler. */
  z(x, y) {
    const r = this.res;
    const fx = x / r - 0.5;
    const fy = -y / r - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0);
    const b = this._celle(i0 + 1, j0);
    const c = this._celle(i0, j0 + 1);
    const d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) {
      // fall tilbake pa naermeste gyldige nabo
      const kandidater = [a, b, c, d].filter(isFinite);
      return kandidater.length ? kandidater.reduce((s, v) => s + v, 0) / kandidater.length : NaN;
    }
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }

  /** Terrenghelning (fall) i punktet, som desimaltall. */
  helning(x, y) {
    const h = Math.max(1, this.res);
    const zx = (this.z(x + h, y) - this.z(x - h, y)) / (2 * h);
    const zy = (this.z(x, y + h) - this.z(x, y - h)) / (2 * h);
    return Math.hypot(zx, zy);
  }

  minneMb() {
    return +(this.fliser.size * this.P * this.P * 4 / 1048576).toFixed(1);
  }
}

if (typeof module !== 'undefined') module.exports = { Terreng, FLIS_M };
