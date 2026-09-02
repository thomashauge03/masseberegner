'use strict';
/**
 * Horisontal linjeføring (senterlinje i planet).
 *
 * Senterlinjen legges inn som knekkpunkt (IP-punkt) i UTM-koordinater.
 * Hvert innvendig knekkpunkt kan få en kurveradius, og da settes det inn
 * en sirkelkurve som tangerer begge rettstrekkene - samme prinsipp som
 * BC/EC/R-merkingen i en vanlig veiplan.
 *
 * Klassen gir:
 *   punktVed(s)     - koordinat, retning og krumning ved en gitt profilnummer
 *   radiusVed(s)    - kurveradius (Infinity pa rettstrekk)
 *   lengde          - total lengde langs senterlinjen
 *   kurver          - liste over kurvene med BC, EC og radius
 */

class Linjeforing {
  /**
   * @param {Array<{x:number,y:number,r:number}>} ip Knekkpunkt i UTM. r = ønsket radius (0 = skarp knekk).
   */
  constructor(ip) {
    const alle = (ip || [])
      .filter(p => p && isFinite(p.x) && isFinite(p.y))
      .map(p => ({ x: p.x, y: p.y, r: Math.max(0, isFinite(p.r) ? p.r : 0) }));

    /* To knekkpunkt pa nøyaktig samme sted er ikke to punkt. Retningen inn i
       det andre lar seg ikke regne, avbøyningen blir null, og kurven forsvant
       helt - uten kurve og uten et ord om hvorfor. En linje som skulle vaere
       87 m med en 30-metersving ble 100 m med et skarpt hjørne. Det skjer
       lettere enn man tror: et dobbeltklikk i kartet holder. */
    this.advarsler = [];
    /* `kilde` er indeksen i lista som ble sendt inn.
       Uten den er `kurver[i].ip` en felle: den peker inn i `this.ip`, som er
       den SAMMENSLÅTTE lista. Skriver noen en oppnådd radius tilbake med den
       indeksen, treffer de feil knekkpunkt i det øyeblikket to punkt lå oppå
       hverandre – og det skjer med ett dobbeltklikk i kartet. */
    alle.forEach((p, i) => { p.kilde = i; });
    /* RADIEN MÅ SKRIVES INN I DET PUNKTET SOM FAKTISK OVERLEVER.
       Her sto `alle[i - 1]`, altså naboen i den USILTE lista – og den kan selv
       være slettet i samme runde. Med tre sammenfallende knekkpunkt og radien
       på det siste ble radien lagt inn i nummer to, som forsvant like etter,
       og svingen var borte: null kurver, lengden 241,421 m i stedet for
       238,840. Det er ikke bare et tall: profilene stasjoneres langs linja, så
       en linje som er 8,6 m for lang på en 716 m veg legger profiler opptil
       17 m feil i terrenget, og massene regnes mot feil bakke.
       Tre sammenfallende punkt er ikke en kuriositet – det er to dobbeltklikk
       på samme sted i kartet. */
    let beholdt = alle[0];
    this.ip = alle.filter((p, i) => {
      if (i === 0) return true;
      if (Math.hypot(p.x - beholdt.x, p.y - beholdt.y) > 1e-6) { beholdt = p; return true; }
      // behold den største radien i hele gruppa, så svingen ikke forsvinner
      if (p.r > beholdt.r) beholdt.r = p.r;
      /* `kilde`, ikke `ip`: dette er brukerens egen nummerering i lista han
         tegnet. `ip` er indeksen i den SAMMENSLÅTTE lista, og brukes av
         advarslene i `_bygg`. Sto begge i samme felt, kunne et duplikatvarsel
         slå ut et innkortingsvarsel i dedupe-testen der nede – og
         knekkpunktnummeret i teksten pekte på feil punkt. */
      this.advarsler.push({
        kilde: p.kilde,
        tekst: `Knekkpunkt ${p.kilde + 1} lå oppå knekkpunkt ${beholdt.kilde + 1} `
          + 'og er slått sammen med det.'
      });
      return false;
    });

    this.elementer = [];
    this.kurver = [];
    this.lengde = 0;
    this._bygg();
  }

  _bygg() {
    const P = this.ip;
    if (P.length < 2) return;

    const nP = P.length;
    const tangent = new Array(nP).fill(0);
    const data = new Array(nP).fill(null);

    // 1) Tangentlengde for hvert innvendig knekkpunkt
    for (let i = 1; i < nP - 1; i++) {
      const inn = norm(sub(P[i], P[i - 1]));
      const ut = norm(sub(P[i + 1], P[i]));
      const kryss = inn.x * ut.y - inn.y * ut.x;
      const prikk = inn.x * ut.x + inn.y * ut.y;
      const avbøy = Math.atan2(kryss, prikk);      // positiv = venstresving
      if (P[i].r <= 0 || Math.abs(avbøy) < 1e-7 || Math.abs(Math.abs(avbøy) - Math.PI) < 1e-6) continue;
      tangent[i] = P[i].r * Math.tan(Math.abs(avbøy) / 2);
      data[i] = { inn, ut, avbøy };
    }

    // 2) Skaler ned tangentene der to kurver ellers ville overlappe
    for (let runde = 0; runde < 12; runde++) {
      let endret = false;
      for (let i = 0; i < nP - 1; i++) {
        const L = avstand(P[i], P[i + 1]);
        const sum = tangent[i] + tangent[i + 1];
        if (sum > L * 0.999) {
          const skala = (L * 0.999) / sum;
          if (tangent[i] > 0) tangent[i] *= skala;
          if (tangent[i + 1] > 0) tangent[i + 1] *= skala;
          endret = true;
          const nr = i + (tangent[i] > tangent[i + 1] ? 0 : 1);
          if (!this.advarsler.some(a => a.ip === nr)) {
            this.advarsler.push({ ip: nr, tekst: `Radien i knekkpunkt ${nr + 1} er for stor for strekket - kurven er kortet inn.` });
          }
        }
      }
      if (!endret) break;
    }

    /* Nedskaleringen har ingen bunn. En radius pa 200 m klemt inn mellom to
       knekkpunkt som star to meter fra hverandre ble til 0,22 m - det er ikke
       en kurve, det er en avrundingsrest, og den ga en veg ingen kan kjøre.
       Under et par meter er en skarp knekk et ærligere svar, og da sies det
       hva som skjedde. */
    const MINSTE_KURVE = 2.0;
    for (let i = 1; i < nP - 1; i++) {
      if (!data[i] || tangent[i] <= 1e-9) continue;
      const r = tangent[i] / Math.tan(Math.abs(data[i].avbøy) / 2);
      if (r >= MINSTE_KURVE) continue;
      tangent[i] = 0;
      data[i] = null;
      this.advarsler = this.advarsler.filter(a => a.ip !== i);
      this.advarsler.push({
        ip: i,
        tekst: `Knekkpunkt ${i + 1}: det er ikke plass til en kurve her `
          + `(bare ${r.toFixed(2)} m ble igjen av radien) – punktet er satt som skarp knekk.`
      });
    }

    // 3) Bygg elementlisten
    let s = 0;
    let fra = { x: P[0].x, y: P[0].y };
    for (let i = 1; i < nP - 1; i++) {
      /* Et knekkpunkt uten kurve er en skarp knekk - linja skal fortsatt gå
         gjennom punktet. Uten dette ble punktet stille hoppet over, og linja
         skar rett over hjørnet: en trasé med radius 0 pa ett innvendig punkt
         kunne passere titalls meter fra der brukeren hadde tegnet den, uten
         at noe sa ifra. */
      if (!data[i] || tangent[i] <= 1e-9) {
        const rett = avstand(fra, P[i]);
        if (rett > 1e-9) {
          this.elementer.push({
            type: 'linje', x1: fra.x, y1: fra.y, x2: P[i].x, y2: P[i].y,
            s0: s, lengde: rett, retning: Math.atan2(P[i].y - fra.y, P[i].x - fra.x)
          });
          s += rett;
          fra = { x: P[i].x, y: P[i].y };
        }
        continue;
      }
      const { inn, ut, avbøy } = data[i];
      const T = tangent[i];
      const R = T / Math.tan(Math.abs(avbøy) / 2);
      const BC = { x: P[i].x - inn.x * T, y: P[i].y - inn.y * T };
      const EC = { x: P[i].x + ut.x * T, y: P[i].y + ut.y * T };
      const tegn = avbøy > 0 ? 1 : -1;
      const senter = { x: BC.x - tegn * R * inn.y, y: BC.y + tegn * R * inn.x };

      const rett = avstand(fra, BC);
      if (rett > 1e-6) {
        this.elementer.push({ type: 'linje', x1: fra.x, y1: fra.y, x2: BC.x, y2: BC.y, s0: s, lengde: rett, retning: Math.atan2(BC.y - fra.y, BC.x - fra.x) });
        s += rett;
      }
      const a0 = Math.atan2(BC.y - senter.y, BC.x - senter.x);
      const buelengde = R * Math.abs(avbøy);
      this.elementer.push({ type: 'kurve', cx: senter.x, cy: senter.y, r: R, a0, tegn, s0: s, lengde: buelengde });
      this.kurver.push({
        ip: i, r: R, tangent: T, avbøy, sBC: s, sEC: s + buelengde, BC, EC, tegn,
        // selve knekkpunktet, der tangentene møtes - brukes av LandXML-eksporten
        ipPunkt: { x: P[i].x, y: P[i].y }
      });
      s += buelengde;
      fra = EC;
    }
    const sisteRett = avstand(fra, P[nP - 1]);
    if (sisteRett > 1e-9) {
      this.elementer.push({ type: 'linje', x1: fra.x, y1: fra.y, x2: P[nP - 1].x, y2: P[nP - 1].y, s0: s, lengde: sisteRett, retning: Math.atan2(P[nP - 1].y - fra.y, P[nP - 1].x - fra.x) });
      s += sisteRett;
    }
    this.lengde = s;
  }

  /**
   * Elementet som profilnummeret ligger i.
   *
   * Elementene ligger sortert pa s0, sa det skal søkes med halvering. Med
   * lineært søk kostet hvert oppslag mer jo lengre veien var, og fordi bade
   * masseberegningen og utflatingskontrollen slar opp titusenvis av ganger,
   * ble hele beregningen kvadratisk i lengden: en veg pa 21 km brukte 24
   * ganger sa lang tid per oppslag som en pa 500 m.
   */
  _element(s) {
    const e = this.elementer;
    if (!e.length) return null;
    if (s <= e[0].s0) return e[0];
    let lo = 0, hi = e.length - 1;
    while (lo < hi) {
      const midt = (lo + hi) >> 1;
      if (s <= e[midt].s0 + e[midt].lengde + 1e-9) hi = midt; else lo = midt + 1;
    }
    return e[lo];
  }

  /** @returns {{x,y,retning,krumning}} krumning er signert: positiv = venstresving. */
  punktVed(s) {
    const el = this._element(s);
    if (!el) return { x: 0, y: 0, retning: 0, krumning: 0 };
    const d = s - el.s0;
    if (el.type === 'linje') {
      return {
        x: el.x1 + Math.cos(el.retning) * d,
        y: el.y1 + Math.sin(el.retning) * d,
        retning: el.retning,
        krumning: 0
      };
    }
    const vinkel = el.a0 + el.tegn * (d / el.r);
    return {
      x: el.cx + el.r * Math.cos(vinkel),
      y: el.cy + el.r * Math.sin(vinkel),
      retning: vinkel + el.tegn * Math.PI / 2,
      krumning: el.tegn / el.r
    };
  }

  radiusVed(s) {
    const el = this._element(s);
    return (!el || el.type === 'linje') ? Infinity : el.r;
  }

  /**
   * Radien som FAKTISK ble lagt i hvert knekkpunkt, i innsendt rekkefølge.
   *
   * Den bestilte radien og den bygde er to forskjellige tall. Får ikke kurven
   * plass mellom naboene, skalerer `_bygg` tangenten ned, og da bygges en
   * mindre kurve enn den som ble bedt om. Alt programmet regner på – bredde-
   * utvidelse, maks stigning, masser – bruker allerede den bygde radien. Denne
   * gir den samme verdien ut, indeksert slik den som kalte inn forventer.
   *
   * @returns {Array<number|null>} like lang som lista inn. `null` = ingen kurve
   *   i det punktet (endepunkt, skarp knekk, eller et punkt som ble slått sammen).
   */
  oppnaddeRadier(antall) {
    const n = antall != null ? antall : (this.ip.length ? this.ip[this.ip.length - 1].kilde + 1 : 0);
    const ut = new Array(n).fill(null);
    for (const k of this.kurver) {
      const p = this.ip[k.ip];
      if (p && p.kilde != null && p.kilde < n) ut[p.kilde] = k.r;
    }
    return ut;
  }

  /**
   * Innvendige knekkpunkt uten kurve, med avbøyningen sin.
   *
   * Et slikt punkt er et skarpt hjørne. Det gir ingen post i `kurver`, og
   * `radiusVed` svarer `Infinity` på rettstrekket gjennom det – så en kontroll
   * som bare ser på kurver, ser det aldri. Målt over knappe to tusen linjer med
   * et virkelig skarpt hjørne ble 190 meldt som helt lovlige.
   *
   * @returns {Array<{kilde:number, avboy:number}>} avboy i radianer
   */
  skarpeHjorner() {
    const ut = [];
    const P = this.ip;
    const medKurve = new Set(this.kurver.map(k => k.ip));
    for (let i = 1; i < P.length - 1; i++) {
      if (medKurve.has(i)) continue;
      const inn = norm(sub(P[i], P[i - 1]));
      const utv = norm(sub(P[i + 1], P[i]));
      const avboy = Math.atan2(inn.x * utv.y - inn.y * utv.x, inn.x * utv.x + inn.y * utv.y);
      if (Math.abs(avboy) < 1e-7) continue;          // rett fram: ikke et hjørne
      ut.push({ kilde: P[i].kilde != null ? P[i].kilde : i, avboy });
    }
    return ut;
  }

  /** Kurven som dekker profilnummeret, eller null pa rettstrekk. */
  kurveVed(s) {
    // kurvene ligger sortert pa sBC, sa samme halvering som i _element
    const k = this.kurver;
    if (!k.length) return null;
    let lo = 0, hi = k.length - 1;
    while (lo < hi) {
      const midt = (lo + hi) >> 1;
      if (s <= k[midt].sEC + 1e-9) hi = midt; else lo = midt + 1;
    }
    return (s >= k[lo].sBC - 1e-9 && s <= k[lo].sEC + 1e-9) ? k[lo] : null;
  }

  /** Nærmeste profilnummer til et vilkarlig punkt (brukt til klikk i kartet). */
  projiser(x, y) {
    let best = { s: 0, avstand: Infinity, side: 1 };
    const steg = Math.max(0.5, this.lengde / 2000);
    for (let s = 0; s <= this.lengde + 1e-9; s += steg) {
      const p = this.punktVed(s);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best.avstand) best = { s, avstand: d, punkt: p };
    }
    // finpuss
    for (let iter = 0; iter < 30; iter++) {
      const h = steg / Math.pow(2, iter + 1);
      if (h < 1e-4) break;
      for (const ds of [-h, h]) {
        const s2 = Math.min(this.lengde, Math.max(0, best.s + ds));
        const p = this.punktVed(s2);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < best.avstand) best = { s: s2, avstand: d, punkt: p };
      }
    }
    const p = best.punkt || this.punktVed(best.s);
    const nx = Math.sin(p.retning), ny = -Math.cos(p.retning); // høyre normal
    const side = ((x - p.x) * nx + (y - p.y) * ny) >= 0 ? 1 : -1;
    return { s: best.s, avstand: best.avstand, side, avvik: best.avstand * side };
  }

  /** Punkt med sideforskyvning: negativ = venstre, positiv = høyre. */
  punktMedAvvik(s, avvik) {
    const p = this.punktVed(s);
    const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
    return { x: p.x + nx * avvik, y: p.y + ny * avvik };
  }
}

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function norm(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
function avstand(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

if (typeof module !== 'undefined') module.exports = { Linjeforing };
