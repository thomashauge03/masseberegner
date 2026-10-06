'use strict';
/**
 * Stikkrenner under vegen: endene, lengden og høydene, regnet av tverrsnittet
 * i profilet der renna krysser senterlinja.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `Stikkrenner` i nettleseren og med `require` i test/stikkrenneprove.js.
 *
 * EN STIKKRENNE ER PROSJEKTERT, IKKE INNMÅLT. Lengden og høydene følger vegen
 * og terrenget, slik skråningene gjør. En høyde brukeren har låst, står – den
 * endres aldri av seg selv; da sier merknadene fra i stedet.
 */
const Stikkrenner = (() => {
  /** Ytre diameter delt på innvendig – korrugert plastrør, som er det vanlige. */
  const YTRE = 1.15;
  /** Hvor tett overdekningen prøves under vegen (m). */
  const PROVESTEG = 0.25;
  /** Avvik i høyde som ikke er verdt en merknad (m). */
  const SLINGER = 0.05;
  /** Forvalgene i malen, og grensene for det brukeren skriver. */
  const STANDARD = { dim: 600, fall: 10, overdekning: 0.5, tillegg: 0.5 };
  const GRENSER = { dim: [100, 3000], fall: [0, 500], overdekning: [0, 5], tillegg: [0, 10], vinkel: [-60, 60] };

  const klemt = (v, [lo, hi], standard) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : standard);
  const fmt = (v, d) => v.toFixed(d).replace('.', ',').replace('-', '−');

  /** Forvalgene og kravene fra malen – klemt der de leses, som snuplassens. */
  function fraMal(mal) {
    const m = mal || {};
    return {
      dim: klemt(m.stikkrenneDim, GRENSER.dim, STANDARD.dim),
      fall: klemt(m.stikkrenneFall, GRENSER.fall, STANDARD.fall),
      overdekning: klemt(m.stikkrenneOverdekning, GRENSER.overdekning, STANDARD.overdekning),
      tillegg: klemt(m.stikkrenneTillegg, GRENSER.tillegg, STANDARD.tillegg)
    };
  }

  /**
   * Enden på én side, av tverrsnittets side (`sider[±1]`): hvor langt ut den
   * ligger (t, positiv utover) og overflaten der vannet går inn eller ut.
   * - I FYLLING er det fyllingsfoten pluss tillegget – renna stikker litt
   *   forbi, så foten ikke graves ut. Overflaten er terrenget i foten.
   * - I SKJÆRING er det midt i grøftebunnen: der renner vannet inn.
   */
  function ende(sd, tillegg) {
    if (sd.type === 'fylling') {
      const sist = sd.knekk[sd.knekk.length - 1];
      return { t: sd.tFot + tillegg, z: sist.z, type: 'fylling', truffet: sd.truffet !== false };
    }
    // grøftebunnen er det laveste i skjæringen – skråningen går opp derfra
    let zMin = Infinity;
    for (const k of sd.knekk) zMin = Math.min(zMin, k.z);
    const bunn = sd.knekk.filter(k => k.z <= zMin + 1e-9);
    const t = (bunn[0].t + bunn[bunn.length - 1].t) / 2;
    return { t, z: zMin, type: 'skjaering', truffet: sd.truffet !== false };
  }

  /**
   * Én renne.
   *
   * @param {object} r  { id, navn, s, dim, vinkel, innlop, fall, bunnInn?, bunnUt? }
   * @param {object} pr tverrsnittet i profilet `r.s`, med sidene – `res.geometriFor(r.s)`
   * @param {object} mal vegens mal
   * @param {object} [o] { stigning, lengde } – vegens stigning i profilet, for en skjev
   *   renne, og linjas lengde
   * @returns {object} endene, lengden, høydene, overdekningen og merknadene – eller { feil }
   */
  function beregn(r, pr, mal, o = {}) {
    const krav = fraMal(mal);
    /* `geometriFor` svarer med det nærmeste profilet, også for en stasjon
       forbi enden – da hadde renna fått lengden fra endeprofilet. */
    const utenfor = Number.isFinite(o.lengde) && !(r.s >= -1e-6 && r.s <= o.lengde + 1e-6);
    if (utenfor || !pr || !pr.sider || !pr.sider[-1] || !pr.sider[1]) return { id: r.id, navn: r.navn, feil: 'profilet er utenfor linja' };
    const dim = klemt(r.dim, GRENSER.dim, krav.dim), D = dim * YTRE / 1000;
    const vinkel = klemt(r.vinkel, GRENSER.vinkel, 0), a = vinkel * Math.PI / 180, cos = Math.cos(a);
    const minFall = klemt(r.fall, GRENSER.fall, krav.fall);
    const V = ende(pr.sider[-1], krav.tillegg), H = ende(pr.sider[1], krav.tillegg);
    const merknader = [];
    const merk = (type, tekst) => merknader.push({ type, tekst });
    if (!V.truffet || !H.truffet) merk('terreng', 'skråningen når ikke terrenget innenfor søkebredden – lengden er usikker');
    if (pr.manglerData) merk('terreng', 'terrenget har hull i profilet – høydene er usikre');
    // den tverrgående avstanden fra ende til ende, og langs renna
    const bredde = V.t + H.t, L = bredde / cos;
    const innlop = r.innlop === 'venstre' || r.innlop === 'hoyre' ? r.innlop : (V.z >= H.z ? 'venstre' : 'hoyre');
    const inn = innlop === 'venstre' ? V : H, ut = innlop === 'venstre' ? H : V;
    const laastInn = typeof r.bunnInn === 'number' && Number.isFinite(r.bunnInn);
    const laastUt = typeof r.bunnUt === 'number' && Number.isFinite(r.bunnUt);
    /* UTLØPET FØLGER TERRENGET NÅR DET FALLER NOK. Faller bakken mer enn
       minstefallet, legges renna fra bunn til bunn; ellers gir minstefallet
       høyden, og utløpet havner under bakken – merknaden sier det. */
    let zInn = laastInn ? r.bunnInn : inn.z;
    let zUt = laastUt ? r.bunnUt : Math.min(ut.z, zInn - minFall / 1000 * L);
    // bunnen i en tverrgående avstand t fra senterlinja (negativ til venstre)
    const bunnVed = (t, zi, zu) => {
      const zV = innlop === 'venstre' ? zi : zu, zH = innlop === 'venstre' ? zu : zi;
      return zV + (zH - zV) * (t + V.t) / bredde;
    };
    /* OVERDEKNINGEN UNDER VEGEN: vegoverflaten minus topp rør, fra kant til
       kant. Vegflaten er rett fra senterlinja ut til hver kant, som i
       tverrsnittet. En skjev renne krysser vegen på skrå, og der vegen stiger,
       ligger flaten over den høyere jo lenger fram renna går. */
    const hbV = pr.halvbreddeVenstre != null ? pr.halvbreddeVenstre : pr.halvbredde;
    const hbH = pr.halvbreddeHoyre != null ? pr.halvbreddeHoyre : pr.halvbredde;
    const zKV = pr.sider[-1].zKant, zKH = pr.sider[1].zKant, z0 = pr.vegnivaa;
    const stig = Number.isFinite(o.stigning) ? o.stigning : 0;
    const flate = t => (t < 0 ? z0 + (zKV - z0) * (-t / hbV) : z0 + (zKH - z0) * (t / hbH)) + stig * t * Math.tan(a);
    const dekning = (zi, zu) => {
      let min = Infinity, ved = 0;
      const n = Math.max(2, Math.ceil((hbV + hbH) / PROVESTEG));
      for (let k = 0; k <= n; k++) {
        const t = -hbV + (hbV + hbH) * k / n;
        const c = flate(t) - (bunnVed(t, zi, zu) + D);
        if (c < min) { min = c; ved = t; }
      }
      return { min, ved };
    };
    let dek = dekning(zInn, zUt), senket = 0;
    if (dek.min < krav.overdekning - 1e-9) {
      if (!laastInn && !laastUt) {
        // ingen høyde er låst: hele renna senkes med det som mangler
        senket = krav.overdekning - dek.min;
        zInn -= senket; zUt -= senket;
        dek = dekning(zInn, zUt);
        merk('senket', `senket ${fmt(senket, 2)} m for overdekningen – innløpet ligger ${fmt(inn.z - zInn, 2)} m under `
          + `${inn.type === 'skjaering' ? 'grøftebunnen' : 'bakken'}`);
      } else {
        merk('overdekning', `overdekning ${fmt(dek.min, 2)} m – kravet er ${fmt(krav.overdekning, 2)} m`);
      }
    }
    const fall = (zInn - zUt) / L * 1000;
    if (fall < minFall - 0.05) merk('fall', `fall ${fmt(fall, 1)} ‰ – minst ${fmt(minFall, 1)} ‰`);
    if (zInn > inn.z + SLINGER) {
      merk('innlop', `innløpet ligger ${fmt(zInn - inn.z, 2)} m over ${inn.type === 'skjaering' ? 'grøftebunnen' : 'bakken'} – vannet når ikke inn`);
    }
    if (zUt < ut.z - SLINGER) merk('utlop', `utløpet ligger ${fmt(ut.z - zUt, 2)} m under bakken – det trengs en grøft ut`);
    else if (zUt > ut.z + SLINGER) merk('utlop', `utløpet henger ${fmt(zUt - ut.z, 2)} m over bakken – sikres mot utgraving`);
    /* ENDENE I PLAN. Normalen til høyre er (sin r, −cos r); vinkelen dreier
       den framover i stasjoneringen. En ende som ligger t ut på tvers, ligger
       t / cos(vinkel) ut langs renna. */
    const nx = Math.sin(pr.retning), ny = -Math.cos(pr.retning), tx = Math.cos(pr.retning), ty = Math.sin(pr.retning);
    const ax = nx * cos + tx * Math.sin(a), ay = ny * cos + ty * Math.sin(a);
    const plan = (t, side) => ({ x: pr.x + side * ax * t / cos, y: pr.y + side * ay * t / cos });
    const pv = plan(V.t, -1), ph = plan(H.t, 1);
    const bunnV = innlop === 'venstre' ? zInn : zUt, bunnH = innlop === 'venstre' ? zUt : zInn;
    return {
      id: r.id, navn: r.navn, s: pr.s, dim, vinkel, innlop, lengde: L, fall,
      bunnInn: zInn, bunnUt: zUt, laastInn, laastUt, senket,
      overdekning: dek.min, overdekningVed: dek.ved, kravOverdekning: krav.overdekning, ytre: D,
      ender: {
        venstre: { t: V.t, overflate: V.z, type: V.type, bunn: bunnV, x: pv.x, y: pv.y },
        hoyre: { t: H.t, overflate: H.z, type: H.type, bunn: bunnH, x: ph.x, y: ph.y }
      },
      merknader
    };
  }

  /** Bunnen der renna krysser senterlinja – til lengdeprofilet. */
  function bunnISenter(svar) {
    const V = svar.ender.venstre, H = svar.ender.hoyre;
    return V.bunn + (H.bunn - V.bunn) * V.t / (V.t + H.t);
  }

  return { YTRE, STANDARD, GRENSER, fraMal, ende, beregn, bunnISenter };
})();

if (typeof module !== 'undefined') module.exports = Stikkrenner;
