'use strict';
/**
 * Koordinatregning.
 *
 * Kartverket sine terrengdata ligger i ETRS89 / UTM (EPSG:25832, 25833, 25835).
 * Leaflet jobber i grader (lat/lon). Her ligger fram- og tilbaketransformasjon
 * med Krüger-rekker, som er nøyaktig til noen få millimeter innenfor en UTM-sone
 * - langt bedre enn de +/- 10 cm terrengmodellen selv har.
 *
 * I tillegg regnes malestokkfaktoren, slik at lengder kan gjøres om fra
 * kartplanet (UTM) til virkelige lengder pa bakken.
 */

const Geo = (() => {
  const a = 6378137.0;              // GRS80 store halvakse
  const f = 1 / 298.257222101;      // GRS80 flattrykning
  const k0 = 0.9996;                // UTM malestokk pa midtmeridianen
  const e2 = f * (2 - f);
  const n = f / (2 - f);

  const A_rekt = a / (1 + n) * (1 + n * n / 4 + Math.pow(n, 4) / 64);

  const n2 = n * n, n3 = n2 * n, n4 = n3 * n;

  // Krüger-rekker til fjerde orden - gir under 0,1 mm feil innenfor en UTM-sone
  const alfa = [
    n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180,
    13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
    61 * n3 / 240 - 103 * n4 / 140,
    49561 * n4 / 161280
  ];
  const beta = [
    n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360,
    n2 / 48 + n3 / 15 - 437 * n4 / 1440,
    17 * n3 / 480 - 37 * n4 / 840,
    4397 * n4 / 161280
  ];
  const delta = [
    2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45,
    7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
    56 * n3 / 15 - 136 * n4 / 35,
    4279 * n4 / 630
  ];

  const grad = Math.PI / 180;

  /**
   * Norsk sonevalg: Sør-Norge = 32, Trøndelag/Nordland/Troms = 33, Finnmark = 35.
   *
   * Grensene ligger midt mellom midtmeridianene (9, 15 og 27 grader), slik at
   * et sted alltid havner i den sonen det ligger nærmest. Det er ogsa den
   * inndelingen fylkene bruker.
   *
   * Valget avgjør ikke om det finnes terrengdata - Kartverket leverer hele
   * landet i alle tre sonene, prøvd i Trondheim, Tromsø, Bodø, Alta og Vadsø.
   * Det avgjør malestokksfaktoren, og hvor langt fra midtmeridianen
   * koordinatregningen ma strekke seg. Med 18 grader som grense havnet Tromsø
   * i sone 35, atte grader fra midtmeridianen der.
   */
  function sone(lon) {
    if (lon < 12) return 32;
    if (lon < 21) return 33;
    return 35;
  }
  // ETRS89 / UTM: EPSG 25832, 25833, 25835
  function epsg(sonenr) { return 25800 + sonenr; }
  function soneFraEpsg(kode) { return kode - 25800; }
  function midtmeridian(sonenr) { return sonenr * 6 - 183; }

  /** Grader -> UTM. Returnerer {x: øst, y: nord}. */
  function tilUtm(lat, lon, sonenr) {
    const lam0 = midtmeridian(sonenr) * grad;
    const fi = lat * grad;
    const lam = lon * grad - lam0;

    const sinFi = Math.sin(fi);
    const t = Math.sinh(Math.atanh(sinFi) - (2 * Math.sqrt(n) / (1 + n)) * Math.atanh((2 * Math.sqrt(n) / (1 + n)) * sinFi));
    const xi0 = Math.atan2(t, Math.cos(lam));
    const eta0 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));

    let xi = xi0, eta = eta0;
    for (let j = 1; j <= 4; j++) {
      xi += alfa[j - 1] * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
      eta += alfa[j - 1] * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
    }
    return { x: 500000 + k0 * A_rekt * eta, y: k0 * A_rekt * xi };
  }

  /** UTM -> grader. Returnerer {lat, lon}. */
  function fraUtm(x, y, sonenr) {
    const xi0 = y / (k0 * A_rekt);
    const eta0 = (x - 500000) / (k0 * A_rekt);

    let xi = xi0, eta = eta0;
    for (let j = 1; j <= 4; j++) {
      xi -= beta[j - 1] * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
      eta -= beta[j - 1] * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
    }
    const khi = Math.asin(Math.sin(xi) / Math.cosh(eta));
    let fi = khi;
    for (let j = 1; j <= 4; j++) fi += delta[j - 1] * Math.sin(2 * j * khi);

    const lam = Math.atan2(Math.sinh(eta), Math.cos(xi));
    return { lat: fi / grad, lon: midtmeridian(sonenr) + lam / grad };
  }

  /**
   * Punktmalestokk i UTM-planet. Verdi > 1 betyr at kartet strekker
   * lengdene; virkelig bakkelengde = kartlengde / k.
   */
  function malestokk(x, y, sonenr) {
    const { lat } = fraUtm(x, y, sonenr);
    const fi = lat * grad;
    const s2 = Math.sin(fi) * Math.sin(fi);
    const nu = a / Math.sqrt(1 - e2 * s2);
    const rho = a * (1 - e2) / Math.pow(1 - e2 * s2, 1.5);
    const R = Math.sqrt(nu * rho);
    const xm = (x - 500000) / k0;
    return k0 * (1 + xm * xm / (2 * R * R) + Math.pow(xm, 4) / (24 * Math.pow(R, 4)));
  }

  /**
   * Samlet faktor fra kartlengde til bakkelengde:
   *   bakke = kart * faktor
   * Tar hensyn til bade UTM-malestokken og at veien ligger over havflaten.
   */
  function bakkefaktor(x, y, sonenr, hoyde) {
    const k = malestokk(x, y, sonenr);
    const R = 6371000;
    const h = isFinite(hoyde) ? hoyde : 0;
    return (1 / k) * (1 + h / R);
  }

  return { sone, epsg, soneFraEpsg, midtmeridian, tilUtm, fraUtm, malestokk, bakkefaktor };
})();

if (typeof module !== 'undefined') module.exports = Geo;
