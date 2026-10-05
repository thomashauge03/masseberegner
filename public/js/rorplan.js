'use strict';
/**
 * Planlagte rør – tegnet i kartet, ikke målt.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `RorPlan` i nettleseren og med `require` i test/rorplanprove.js.
 *
 * PLANEN BLIR TIL DE SAMME LINJENE SOM IMPORTEN GIR. Et rør er en trase
 * forskjøvet sidelengs, med høyder fra høydereglene – topp rør i hvert punkt,
 * som de innmålte. Da tar profilen, 3D-en, grøftemotoren og rapporten de
 * planlagte rørene uten å vite forskjell.
 *
 * HØYDENE SKRIVES SOM BUNN INNVENDIG – bunnløpet, slik VA-tegningene oppgir
 * det – men alt regnes i topp rør: topp = bunn − gods + D. Se
 * docs/superpowers/specs/2026-10-05-ror-etappe3a-design.md.
 */
const RorPlan = (() => {
  function _ror() { return typeof Ror !== 'undefined' ? Ror : require('./ror.js'); }

  /** Anleggets standard: overdekning til topp rør, klaring i kryss, kummene. */
  const StandardPlanmal = { overdekning: 2.0, kryssKlaring: 0.3, kum: { diameter: 1000, arbeidsrom: 0.5 } };
  /** Systemene som renner av seg selv – resten følger terrenget. */
  const SELVFALL = new Set(['spill', 'felles', 'overvann', 'drens']);
  /** Minste fall (‰) når koden ikke sier noe. */
  const STANDARD_MINFALL = { spill: 10, felles: 10, overvann: 5, drens: 5 };
  const GRENSER = { side: [-10, 10], diameter: [400, 3000], gods: [0.5, 100], overdekning: [0, 10],
    minFall: [0, 1000], maksFall: [0, 1000], kryssKlaring: [0, 5], arbeidsrom: [0, 3] };

  function nyPlan() { return { traseer: [], ror: [], kummer: [], laast: [], greiner: [] }; }
  function nyPlanmal() { return JSON.parse(JSON.stringify(StandardPlanmal)); }

  /**
   * Et tall innenfor grensene for feltet, eller null. Tekst med komma godtas.
   * Under grensen er en skrivefeil – den klemmes ikke opp, den avvises.
   */
  function klem(felt, v) {
    const x = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.trim().replace(',', '.'))) : v;
    if (typeof x !== 'number' || !Number.isFinite(x) || !GRENSER[felt]) return null;
    if (x < GRENSER[felt][0]) return null;
    return Math.min(GRENSER[felt][1], x);
  }

  /** Første ledige id med prefikset: 't3', 'p12' … */
  function nyId(brukt, prefiks) {
    let n = 1;
    while (brukt.has(prefiks + n)) n++;
    return prefiks + n;
  }

  /** Alle id-ene i planen – prefiksene skiller traseer, punkt, rør og kummer. */
  function alleIder(plan) {
    const ut = new Set();
    for (const t of plan.traseer) { ut.add(t.id); for (const p of t.punkter) ut.add(p.id); }
    for (const r of plan.ror) ut.add(r.id);
    for (const k of plan.kummer) ut.add(k.id);
    return ut;
  }

  /** Koden slik planen bruker den: kodetabellen først, så tolkningen. */
  function kodeAv(koder, kode) { return (koder && koder[kode]) || _ror().tolkKode(kode); }

  /** Godstykkelsen i mm: kodens, ellers SDR 11 for PE og SN8 (D/34) for resten. */
  function gods(k) {
    if (Number.isFinite(k.gods) && k.gods > 0) return k.gods;
    if (!(k.dim > 0)) return 0;
    return Math.round(k.dim / (/^PE/.test(k.materiale || '') ? 11 : 34) * 10) / 10;
  }
  /** Topp rør utvendig fra bunn innvendig, og omvendt (m). */
  function toppFraBunn(bunn, k) { return bunn - gods(k) / 1000 + (k.dim || 0) / 1000; }
  function bunnFraTopp(topp, k) { return topp - (k.dim || 0) / 1000 + gods(k) / 1000; }

  /** Selvfall eller trykk: røret, så koden, så systemet. */
  function regel(r, k) {
    return (r && r.regel) || (k && k.regel) || (k && SELVFALL.has(k.system) ? 'selvfall' : 'trykk');
  }
  /** Overdekningen et fritt punkt legges på – og varselgrensen. */
  function overdekning(k, mal) {
    if (k && Number.isFinite(k.overdekning)) return k.overdekning;
    return mal && Number.isFinite(mal.overdekning) ? mal.overdekning : StandardPlanmal.overdekning;
  }
  function minFall(k) { return Number.isFinite(k.minFall) ? k.minFall : (STANDARD_MINFALL[k.system] || 0); }
  function maksFall(k) { return Number.isFinite(k.maksFall) ? k.maksFall : null; }

  return { StandardPlanmal, GRENSER, nyPlan, nyPlanmal, klem, nyId, alleIder, kodeAv, gods,
    toppFraBunn, bunnFraTopp, regel, overdekning, minFall, maksFall };
})();

if (typeof module !== 'undefined') module.exports = RorPlan;
