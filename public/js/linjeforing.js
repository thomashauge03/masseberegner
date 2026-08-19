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
    this.ip = (ip || []).map(p => ({ x: p.x, y: p.y, r: Math.max(0, p.r || 0) }));
    this.elementer = [];
    this.kurver = [];
    this.lengde = 0;
    this.advarsler = [];
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

  _element(s) {
    const e = this.elementer;
    if (!e.length) return null;
    if (s <= e[0].s0) return e[0];
    for (let i = 0; i < e.length; i++) {
      if (s <= e[i].s0 + e[i].lengde + 1e-9) return e[i];
    }
    return e[e.length - 1];
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

  /** Kurven som dekker profilnummeret, eller null pa rettstrekk. */
  kurveVed(s) {
    for (const k of this.kurver) if (s >= k.sBC - 1e-9 && s <= k.sEC + 1e-9) return k;
    return null;
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
