# Rør etappe 3a – planlagte rør: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tegne nye rør i kartet – traseer med flere rør, høyder med overdekning, fall og kummer – og få grøftemassene, kumlista og kontrollene før man graver.

**Architecture:** Et tegnet anlegg er et vanlig røranlegg (`type: 'ror'`) med `ror.plan`. Den nye rene modulen `rorplan.js` gjør planen om til de samme linjene som importen gir (topp rør i hvert punkt), pluss kummer og kontrollpunkt; profil, 3D, grøftemotor og rapport tar linjene som før. `groft.js` får runde kumgroper. `ui-rorplan.js` eier verktøyene, dialogene, Rør-fanen og redigeringen i profilen for tegnede anlegg.

**Tech Stack:** Vanilla JS uten byggesteg (globaler i nettleseren, `module.exports` for node), Leaflet, canvas. Prøver: node-skript (`npm test`) og nettlesertesten (`Nettlesertest.kjor()`).

**Spec:** `docs/superpowers/specs/2026-10-05-ror-etappe3a-design.md`

## Global Constraints

- Ingen byggesteg; hver fil slutter med `if (typeof module !== 'undefined') module.exports = X;`. Logikkmoduler er IIFE-er `const X = (() => { … })();`.
- Norske navn og kommentarer; kommentarene forklarer *hvorfor*.
- Repoet er offentlig: ingen kundedata i commits – oppdiktede koordinater, høyder og navn i prøvene.
- Høyder som skrives inn og vises ved kummer og låste punkt er **bunn innvendig**; alt regnes i **topp rør**: `topp = bunn − gods + D`.
- Standarder: overdekning 2,0 m (mål og varselgrense), kryssklaring 0,3 m, kum Ø1000, kumvegg 0,1 m (ytre = d + 0,2), kumbunn 0,25 m under bunnløpet, arbeidsrom 0,5 m, minste fall spillvann/felles 10 ‰, overvann/drens 5 ‰, gods PE D/11, ellers D/34 (avrundet til 0,1 mm).
- Selvfall: spillvann, overvann, drens, felles; trykk: vann, kabel og ukjent system.
- Alt som endrer prosjektet går gjennom `App.merk()` først.
- Nettlesertesten kjøres i et vindu ≥ 1000 px bredt (1440 × 900).
- Ikke flett inn i eller push til `main` uten at brukeren sier ja – push til `main` legges rett ut.

---

### Oppgave 1: `RorPlan` – malen, id-ene, kodene og bunn ↔ topp

**Filer:**
- Opprett: `public/js/rorplan.js`, `test/rorplanprove.js`
- Endre: `package.json` (`test`), `public/index.html` (script etter `ror.js`)

**Grensesnitt:**
- Produserer: `RorPlan.StandardPlanmal`, `RorPlan.GRENSER`, `RorPlan.nyPlan()`, `RorPlan.nyPlanmal()`, `RorPlan.klem(felt, v)`, `RorPlan.nyId(brukt: Set, prefiks)`, `RorPlan.alleIder(plan) → Set`, `RorPlan.kodeAv(koder, kode)`, `RorPlan.gods(k) → mm`, `RorPlan.toppFraBunn(bunn, k)`, `RorPlan.bunnFraTopp(topp, k)`, `RorPlan.regel(ror, k) → 'selvfall'|'trykk'`, `RorPlan.overdekning(k, mal) → m`, `RorPlan.minFall(k) → ‰`, `RorPlan.maksFall(k) → ‰|null`.

- [ ] **Steg 1: Prøven** – `test/rorplanprove.js`:

```js
'use strict';
/**
 * Planlagte rør mot fasit regnet for hånd.
 *
 *   node test/rorplanprove.js
 *
 * Alt er oppdiktet: «grader» er meter i prøvene (tilSone gjør lat/lon til
 * n/o rett fram), så fasiten kan regnes uten kartprojeksjon.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const RorPlan = require(js('rorplan.js'));

let feil = 0, ok = 0;
const fmt = v => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(6)) : String(v));
function sjekk(navn, faktisk, ventet, toleranse) {
  const d = Math.abs(faktisk - ventet);
  if (d <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(d)}, grense ${toleranse})`); }
}
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

console.log('\n1. Malen, kodene og bunn ↔ topp');
{
  const pe = RorPlan.kodeAv({}, 'SP 160PE'), pvc = RorPlan.kodeAv({}, 'OV 110PVC');
  sjekk('gods PE 160: SDR 11', RorPlan.gods(pe), 14.5, 1e-9);
  sjekk('gods PVC 110: SN8 (D/34)', RorPlan.gods(pvc), 3.2, 1e-9);
  sjekk('kodens eget gods vinner', RorPlan.gods(Object.assign({}, pe, { gods: 9.5 })), 9.5, 1e-9);
  sjekk('topp = bunn − gods + D', RorPlan.toppFraBunn(10, pe), 10 - 0.0145 + 0.16, 1e-9);
  sjekk('og tilbake', RorPlan.bunnFraTopp(RorPlan.toppFraBunn(10, pe), pe), 10, 1e-9);
  paastand('spillvann er selvfall', RorPlan.regel({}, pe) === 'selvfall');
  paastand('vann er trykk', RorPlan.regel({}, RorPlan.kodeAv({}, 'VL 160PE')) === 'trykk');
  paastand('kabel og ukjent er trykk', RorPlan.regel({}, RorPlan.kodeAv({}, '40 FIBER')) === 'trykk'
    && RorPlan.regel({}, RorPlan.kodeAv({}, 'RØR 110')) === 'trykk');
  paastand('røret og koden kan overstyre', RorPlan.regel({ regel: 'trykk' }, pe) === 'trykk'
    && RorPlan.regel({}, Object.assign({}, pe, { regel: 'trykk' })) === 'trykk');
  sjekk('overdekning: standard', RorPlan.overdekning(pe, null), 2.0, 0);
  sjekk('overdekning: anleggets', RorPlan.overdekning(pe, { overdekning: 2.4 }), 2.4, 0);
  sjekk('overdekning: kodens vinner', RorPlan.overdekning(Object.assign({}, pe, { overdekning: 1.5 }), { overdekning: 2.4 }), 1.5, 0);
  sjekk('minste fall: spillvann 10 ‰', RorPlan.minFall(pe), 10, 0);
  sjekk('minste fall: overvann 5 ‰', RorPlan.minFall(pvc), 5, 0);
  sjekk('minste fall: vann ingen', RorPlan.minFall(RorPlan.kodeAv({}, 'VL 160PE')), 0, 0);
  paastand('største fall: ingen før den er satt', RorPlan.maksFall(pe) === null && RorPlan.maksFall(Object.assign({}, pe, { maksFall: 80 })) === 80);
  paastand('klem: sideavstand kan være negativ, men ikke utenfor', RorPlan.klem('side', '-0,4') === -0.4
    && RorPlan.klem('side', -12) === null && RorPlan.klem('diameter', 5000) === 3000 && RorPlan.klem('overdekning', 'x') === null);
  const brukt = new Set(['t1', 't2', 'p1']);
  paastand('ny id: første ledige', RorPlan.nyId(brukt, 't') === 't3' && RorPlan.nyId(brukt, 'k') === 'k1');
  const plan = RorPlan.nyPlan();
  plan.traseer.push({ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 1 }] });
  plan.ror.push({ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 });
  paastand('alle id-ene i planen', ['t1', 'p1', 'p2', 'r1'].every(x => RorPlan.alleIder(plan).has(x)));
  paastand('en ny planmal er en kopi', RorPlan.nyPlanmal() !== RorPlan.StandardPlanmal
    && RorPlan.nyPlanmal().kum !== RorPlan.StandardPlanmal.kum && RorPlan.nyPlanmal().kum.diameter === 1000);
}

/* ---------------- sluttsum ---------------- */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
```

- [ ] **Steg 2: Kjør** `node test/rorplanprove.js` · Ventet: kaster `Cannot find module …/rorplan.js`.

- [ ] **Steg 3: `public/js/rorplan.js`:**

```js
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
```

- [ ] **Steg 4: Kjør** `node test/rorplanprove.js` · Ventet: alle ok.

- [ ] **Steg 5: Koble inn** – `package.json`: `"test": "node test/selftest.js && node test/rorprove.js && node test/groftprove.js && node test/rorplanprove.js"`. `index.html`: `<script src="js/rorplan.js"></script>` rett etter `<script src="js/ror.js"></script>`.

- [ ] **Steg 6: Kjør** `npm test` · Ventet: alle fire grønne.

- [ ] **Steg 7: Commit** – «RorPlan: malen, id-ene, kodene og bunn innvendig ↔ topp rør».

---

### Oppgave 2: Rørets geometri – sideavstand og stasjonering

**Filer:**
- Endre: `public/js/rorplan.js`, `test/rorplanprove.js`

**Grensesnitt:**
- Produserer: `RorPlan.forskyv(pts: [{x,y}], side) → [{x,y}]` (høyre i tegneretningen er positiv), `RorPlan.stasjonering(xy) → number[]`.

- [ ] **Steg 1: Prøven** – nytt avsnitt før sluttsummen:

```js
console.log('\n2. Sideavstanden');
{
  const rett = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.5);
  paastand('rett strekk: høyre i tegneretningen er minus y når man går mot øst',
    Math.abs(rett[0].y + 0.5) < 1e-12 && Math.abs(rett[1].y + 0.5) < 1e-12 && rett[1].x === 10);
  const v = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 1);
  // venstresving på 90°: høyresiden er yttersida, punktet ligger på halveringslinja, √2 ut
  sjekk('90° knekk: √2 · side ut', Math.hypot(v[1].x - 10, v[1].y), Math.SQRT2, 1e-12);
  paastand('og på yttersida', v[1].x > 10 && v[1].y < 0);
  const s = RorPlan.forskyv([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }], 1);
  sjekk('skarp knekk: kappet ved 2 · side', Math.hypot(s[1].x - 10, s[1].y), 2, 1e-12);
  paastand('side 0 gir punktene som de er', RorPlan.forskyv([{ x: 1, y: 2 }, { x: 3, y: 4 }], 0)[1].y === 4);
  const st = RorPlan.stasjonering([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]);
  paastand('stasjoneringen langs linja', st.length === 3 && st[1] === 5 && st[2] === 11);
}
```

- [ ] **Steg 2: Kjør** · Ventet: `RorPlan.forskyv is not a function`.

- [ ] **Steg 3: Koden** – i `rorplan.js`, før `return`:

```js
  /**
   * Traseen forskjøvet `side` meter til høyre i tegneretningen. I et
   * knekkpunkt ligger punktet på halveringslinja, side / cos(θ/2) ut; i knekker
   * skarpere enn 120° kappes det ved 2 · side, så en spiss knekk ikke sender
   * røret langt av sted. Strekk uten lengde låner retningen fra naboen.
   */
  function forskyv(pts, side) {
    if (!side || pts.length < 2) return pts.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length;
    // høyre for retningen (dx, dy) er (dy, −dx)
    const normal = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      return L > 0 ? { x: dy / L, y: -dx / L } : null;
    };
    const nr = [];
    for (let i = 0; i + 1 < n; i++) nr.push(normal(pts[i], pts[i + 1]));
    for (let i = 1; i < nr.length; i++) if (!nr[i]) nr[i] = nr[i - 1];
    for (let i = nr.length - 2; i >= 0; i--) if (!nr[i]) nr[i] = nr[i + 1];
    const ut = [];
    for (let i = 0; i < n; i++) {
      const n1 = i > 0 ? nr[i - 1] : null, n2 = i < n - 1 ? nr[i] : null;
      let mx, my, f = 1;
      if (n1 && n2) {
        mx = n1.x + n2.x; my = n1.y + n2.y;
        const L = Math.hypot(mx, my);
        if (L < 1e-9) { mx = n1.x; my = n1.y; } else {
          mx /= L; my /= L;
          f = 1 / Math.max(mx * n1.x + my * n1.y, 0.5);   // 1 / cos(θ/2), høyst 2
        }
      } else {
        const m = n1 || n2 || { x: 0, y: 0 };
        mx = m.x; my = m.y;
      }
      ut.push({ x: pts[i].x + mx * side * f, y: pts[i].y + my * side * f });
    }
    return ut;
  }

  /** Lengden fram til hvert punkt langs linja. */
  function stasjonering(xy) {
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    return s;
  }
```

  og `forskyv, stasjonering` i `return`-lista.

- [ ] **Steg 4: Kjør** · Ventet: alle ok.

- [ ] **Steg 5: Commit** – «RorPlan: sideavstand gjennom knekker og stasjonering».

---

### Oppgave 3: Høydene – `RorPlan.bygg`

**Filer:**
- Endre: `public/js/rorplan.js`, `test/rorplanprove.js`, `public/js/ror.js` (`profil`: mellompunkt er ikke «målt»), `docs/superpowers/specs/2026-10-05-ror-etappe3a-design.md` (4.5: `utenHoyde` i stedet for `utenDimensjon`, se under)

**Grensesnitt:**
- Konsumerer: `forskyv`, `stasjonering`, `regel`, `overdekning`, `toppFraBunn`, `bunnFraTopp`, `kodeAv`.
- Produserer: `RorPlan.bygg(o)` der `o = { plan, koder, mal (= mal.plan), tilSone(lat, lon) → {o, n}, tilXY({o, n}) → {x, y}, terrengZ(x, y), innmalt(anlegg, punkt) → topp | null }` og svaret er
  `{ linjer: [{ id, kode, punkter: [{ id, kode, o, n, z, mellom? }], xy, lengde, lengde3d, plan: { ror, trase, regel, grense, gods, motsatt } }], enslige: [], objekter: [], bruddUtenTreff: 0, koblingUtenTreff: 0, kummer: [{ id, ror, x, y, o, n, bunnlop, terreng, diameter }], kontroll: [{ ror, s, punkt, x, y, topp, bunn, laast, kum, fra, kilde }], utenHoyde: [{ id, kode, xy, punkter, grunn }], merknader: [{ type, linje, tekst }], moter: [{ x, y, r }] }`.
  `moter` er greiningene og påkoblingene i regnesonen, med radius 0,5 m + største sideavstand på traseene som møtes (spesifikasjonen sa 0,5 m – med rør 1 m ut fra traseen ville møtet ellers blitt meldt som kryss). Rett 7 i spesifikasjonen i samme commit.
  `punkter` på linjene har `o, n` i anleggets sone (kartet tegner med `Ror.tilLatLon(p, r.sone)`), `xy` er i regnesonen og `z` er topp rør. Punkt-id-ene er `rør:punkt` i knekkpunktene og `rør:punkt+meter` i mellompunktene (bare trykk).
- **Avvik fra spesifikasjonen:** lista heter `utenHoyde` med `grunn: 'dimensjon' | 'terreng'`, ikke `utenDimensjon` – et rør uten terreng ennå (før terrenget er hentet) skal også tegnes i kartet. Rett 4.5 i spesifikasjonen i samme commit.

- [ ] **Steg 1: Prøven** – nytt avsnitt:

```js
console.log('\n3. Høydene');
/* En trase langs x-aksen i «meter-grader»: lat = y, lon = x. */
const plan1 = (pts, ror, ekstra = {}) => Object.assign(RorPlan.nyPlan(), {
  traseer: [{ id: 't1', punkter: pts.map(([x, y], i) => ({ id: 'p' + (i + 1), lat: y, lon: x })) }],
  ror: ror.map((r, i) => Object.assign({ id: 'r' + (i + 1), trase: 't1', side: 0, regel: null, motsatt: false }, r))
}, ekstra);
const bygg = (plan, T, ekstra = {}) => RorPlan.bygg(Object.assign({ plan, koder: {}, mal: RorPlan.nyPlanmal(),
  tilSone: (lat, lon) => ({ o: lon, n: lat }), tilXY: p => ({ x: p.o, y: p.n }), terrengZ: T }, ekstra));
const SP = RorPlan.kodeAv({}, 'SP 160PE'), VL = RorPlan.kodeAv({}, 'VL 110PE');
const flatt = () => 10;
{
  // selvfall med frie ender på flatt terreng: 2,0 m overdekning hele veien
  const b = bygg(plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const l = b.linjer[0];
  paastand('selvfall: tre knekkpunkt, ingen mellompunkt', l.punkter.length === 3 && !l.punkter.some(p => p.mellom));
  paastand('frie ender: topp = terreng − 2,0', l.punkter.every(p => Math.abs(p.z - 8) < 1e-9));
  paastand('id-ene er rør:punkt', l.punkter.map(p => p.id).join(',') === 'r1:p1,r1:p2,r1:p3');
  paastand('to kontrollpunkt – endene', b.kontroll.length === 2 && b.kontroll.every(c => !c.laast));
  sjekk('lengden', l.lengde, 100, 1e-9);
}
{
  // låst bunn i begge ender: rett linje, og punktet midt på ligger på den
  const p = plan1([[0, 0], [30, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 7.0 }] });
  const b = bygg(p, (x) => (x > 20 && x < 40 ? 12 : 10));   // en kul under knekkpunktet midt på
  const l = b.linjer[0];
  sjekk('selvfall: topp i starten fra låst bunn', l.punkter[0].z, RorPlan.toppFraBunn(7.5, SP), 1e-9);
  sjekk('og knekkpunktet midt på ligger på linja – kula betyr ingenting', l.punkter[1].z,
    RorPlan.toppFraBunn(7.5 - 0.5 * 30 / 100, SP), 1e-9);
  const k = b.kontroll.find(c => c.punkt === 'p3');
  paastand('kontrollpunktet er låst, og bunnen er den låste', k.laast && Math.abs(k.bunn - 7.0) < 1e-9);
}
{
  // én låst ende, én fri, terrenget faller 2 %: rett mellom låst og terreng − 2,0
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.0 }] });
  const b = bygg(p, x => 10 - 0.02 * x);
  sjekk('fri ende: terreng − overdekning', b.linjer[0].punkter[1].z, 8 - 2, 1e-9);
}
{
  // trykk følger terrenget meter for meter
  const T = x => 10 + Math.sin(x / 7);
  const b = bygg(plan1([[0, 0], [40, 0]], [{ kode: 'VL 110PE' }]), T);
  const l = b.linjer[0];
  paastand('trykk: ett punkt per meter', l.punkter.length === 41 && l.punkter.filter(p => p.mellom).length === 39);
  paastand('og hvert ligger 2,0 m under terrenget', l.punkter.every((p, i) => Math.abs(p.z - (T(l.xy[i].x) - 2)) < 1e-9));
  paastand('mellompunktene heter rør:punkt+meter', l.punkter[1].id === 'r1:p1+1');
}
{
  // trykk mot en låst påkobling: overdekningen går lineært fra 3,0 til 2,0
  const bunn = RorPlan.bunnFraTopp(10 - 3.0, VL);
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn }] }), flatt);
  sjekk('trykk: overdekningen midt på er 2,5', 10 - b.linjer[0].punkter[50].z, 2.5, 1e-9);
}
{
  // trykk over et hull i terrenget: rett over
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'VL 110PE' }]), x => (x > 40 && x < 60 ? NaN : 10 + 0.01 * x));
  const l = b.linjer[0];
  sjekk('over hullet: rett linje mellom kantene', l.punkter[50].z, (8.4 + 8.6) / 2, 1e-9);
}
{
  // sideavstand og fallretning
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE', side: 0.4 }, { kode: 'VL 110PE', side: -0.4, motsatt: true }]), flatt);
  sjekk('sideavstand 0,4 til høyre', b.linjer[0].xy[0].y, -0.4, 1e-12);
  sjekk('og −0,4 til venstre', b.linjer[1].xy[0].y, 0.4, 1e-12);
  paastand('fallretningen følger med linja', b.linjer[1].plan.motsatt === true && b.linjer[0].plan.motsatt === false);
}
{
  // kum: et kontrollpunkt, med bunnløpet der den står
  const p = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1200 }] });
  const b = bygg(p, flatt);
  const k = b.kummer[0];
  paastand('kummen kommer ut med bunnløp, terreng og diameter', k && k.id === 'k1' && k.diameter === 1200
    && Math.abs(k.bunnlop - RorPlan.bunnFraTopp(8, SP)) < 1e-9 && k.terreng === 10 && k.x === 50);
  paastand('og den er et kontrollpunkt', b.kontroll.some(c => c.punkt === 'p2' && c.kum === 'k1'));
}
{
  // greining: rør med samme kode følger høyden til hovedrøret i punktet
  const p = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 50 }, { id: 'p3', lat: 0, lon: 100 }] },
      { id: 't2', punkter: [{ id: 'p4', lat: 0, lon: 50 }, { id: 'p5', lat: 40, lon: 50 }] }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 }, { id: 'r2', trase: 't2', kode: 'SP 160PE', side: 0 }],
    laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 6.5 }],
    greiner: [{ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p2' } }]
  });
  const b = bygg(p, flatt);
  const hoved = b.linjer.find(l => l.id === 'r1'), grein = b.linjer.find(l => l.id === 'r2');
  sjekk('greina begynner på høyden til hovedrøret', grein.punkter[0].z, hoved.punkter[1].z, 1e-9);
  paastand('og kontrollpunktet sier hvor høyden kommer fra', b.kontroll.some(c => c.ror === 'r2' && c.fra === 'r1'));
  // i motsatt rekkefølge i lista – hovedrøret regnes likevel først
  p.ror.reverse();
  sjekk('rekkefølgen i lista betyr ingenting', bygg(p, flatt).linjer.find(l => l.id === 'r2').punkter[0].z, hoved.punkter[1].z, 1e-9);
  // i sirkel: festene slippes ett sted, og det sies fra
  p.greiner.push({ trase: 't1', ende: 'start', til: { trase: 't2', punkt: 'p5' } });
  const sirkel = bygg(p, flatt);
  paastand('greiner i sirkel: begge rørene regnes, og merknaden sier fra',
    sirkel.linjer.length === 2 && sirkel.merknader.some(m => m.type === 'grein'));
}
{
  // et rør uten dimensjon, og et rør uten terreng ennå
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'RØR' }, { kode: 'SP 160PE' }]);
  const b = bygg(p, () => NaN);
  paastand('uten dimensjon og uten terreng: ingen linjer, men tegnes', b.linjer.length === 0
    && b.utenHoyde.length === 2 && b.utenHoyde.some(u => u.grunn === 'dimensjon') && b.utenHoyde.some(u => u.grunn === 'terreng'));
  paastand('merknaden sier hvilken kode som mangler dimensjon', b.merknader.some(m => m.type === 'dimensjon' && /RØR/.test(m.tekst)));
}
{
  // terreng som mangler under et fritt kontrollpunkt: nærmeste terreng langs røret
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), x => (x < 5 ? NaN : 10));
  sjekk('terreng hentet langs røret', b.linjer[0].punkter[0].z, 8, 1e-9);
}
{
  // påkobling: den låste høyden står, men merknaden sier fra når kilden er endret eller borte
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: 7.5, kilde: { anlegg: 'a1', punkt: 'X1', topp: 7.7 } }] });
  paastand('påkobling som er lik: ingen merknad', !bygg(p, flatt, { innmalt: () => 7.7 }).merknader.some(m => m.type === 'pakobling'));
  paastand('endret: merknad', bygg(p, flatt, { innmalt: () => 7.9 }).merknader.some(m => m.type === 'pakobling'));
  paastand('borte: merknad', bygg(p, flatt, { innmalt: () => null }).merknader.some(m => m.type === 'pakobling'));
}
```

- [ ] **Steg 2: Kjør** · Ventet: `RorPlan.bygg is not a function`.

- [ ] **Steg 3: Koden** – i `rorplan.js`, før `return`:

```js
  /* Mellompunktene for trykkrør (m) – som stasjonene i grøfta. */
  const STEG = 1;
  const fmt = (v, d) => v.toFixed(d).replace('.', ',').replace('-', '−');

  /**
   * Planen som linjer – samme form som `Ror.byggLinjer` gir – med kummene og
   * kontrollpunktene til profilen.
   *
   * KONTROLLPUNKTENE er endene, kummene og de låste punktene. Et låst punkt
   * har sin høyde; en grein festet til et annet rør har høyden til det røret
   * i punktet; et fritt punkt ligger med overdekningen under terrenget.
   * SELVFALL er rett linje mellom kontrollpunktene. TRYKK følger terrenget
   * meter for meter, med overdekningen lineær mellom kontrollpunktene – så
   * røret møter en låst påkobling uten sprang.
   *
   * @param {object} o
   *   plan, koder, mal              – `mal` er anleggets `mal.plan`
   *   tilSone(lat, lon) → { o, n }  – i anleggets sone, der punktene tegnes
   *   tilXY({ o, n }) → { x, y }    – i regnesonen
   *   terrengZ(x, y)                – i regnesonen; NaN der det mangler
   *   innmalt(anlegg, punkt)        – topp rør i et innmålt punkt nå, eller null
   */
  function bygg(o) {
    const plan = o.plan || nyPlan(), koder = o.koder || {}, mal = o.mal || StandardPlanmal;
    const T = o.terrengZ || (() => NaN);
    const tilSone = o.tilSone || ((lat, lon) => ({ o: lon, n: lat }));
    const tilXY = o.tilXY || (p => ({ x: p.o, y: p.n }));
    const traseer = new Map(plan.traseer.map(t => [t.id, t]));
    const linjer = [], kummer = [], kontroll = [], utenHoyde = [], merknader = [];
    const meldt = new Set();

    /* En grein følger punktet den er festet til – også i plan. */
    const festet = new Map(plan.greiner.map(g => [g.trase + ':' + g.ende, g.til]));
    const punktI = (tid, pid) => { const t = traseer.get(tid); return t ? t.punkter.find(p => p.id === pid) : null; };
    const posisjon = (t, i) => {
      const ende = i === 0 ? 'start' : i === t.punkter.length - 1 ? 'slutt' : null;
      const f = ende ? festet.get(t.id + ':' + ende) : null;
      const p = (f && punktI(f.trase, f.punkt)) || t.punkter[i];
      return tilSone(p.lat, p.lon);
    };
    const rorPaa = new Map();
    for (const r of plan.ror) {
      if (!rorPaa.has(r.trase)) rorPaa.set(r.trase, []);
      rorPaa.get(r.trase).push(r);
    }
    /* Røret en ende leser høyden fra: røret med samme kode på traseen den er festet til. */
    const forelder = (r, ende) => {
      const f = festet.get(r.trase + ':' + ende);
      if (!f) return null;
      const far = (rorPaa.get(f.trase) || []).find(x => x.kode === r.kode && x.id !== r.id);
      return far ? { ror: far, punkt: f.punkt } : null;
    };
    const toppVed = new Map();   // `rør:punkt` → topp, til greinene
    const brutt = new Set();     // `rør:ende` der festet er sluppet

    function byggRor(r) {
      const t = traseer.get(r.trase);
      if (!t || t.punkter.length < 2) return;
      const k = kodeAv(koder, r.kode);
      if (k.vis === false) return;   // «Med» er slått av i kodetabellen, som for innmålte rør
      const n = t.punkter.length;
      const sone = forskyv(t.punkter.map((p, i) => { const q = posisjon(t, i); return { x: q.o, y: q.n }; }), r.side || 0)
        .map(q => ({ o: q.x, n: q.y }));
      const xy = sone.map(tilXY);
      const s = stasjonering(xy);
      if (!(k.dim > 0)) {
        utenHoyde.push({ id: r.id, kode: r.kode, xy, punkter: sone, grunn: 'dimensjon' });
        if (!meldt.has('dim:' + r.kode)) {
          meldt.add('dim:' + r.kode);
          merknader.push({ type: 'dimensjon', linje: r.id,
            tekst: `${r.kode}: rør uten dimensjon får ingen høyder og ingen grøft – sett dimensjonen i Koder-fanen.` });
        }
        return;
      }
      const reg = regel(r, k), ov = overdekning(k, mal);
      const punktVed = sv => {
        let j = 1;
        while (j < n - 1 && s[j] < sv) j++;
        const a = xy[j - 1], b = xy[j], L = s[j] - s[j - 1];
        const u = L > 0 ? Math.max(0, Math.min(1, (sv - s[j - 1]) / L)) : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      const Tved = sv => { const p = punktVed(sv); const z = T(p.x, p.y); return Number.isFinite(z) ? z : NaN; };
      /* Mangler terrenget der et fritt kontrollpunkt står, hentes det fra
         nærmeste sted langs røret som har det. */
      const Tnaer = sv => {
        let z = Tved(sv);
        for (let d = STEG; !Number.isFinite(z) && (sv - d >= 0 || sv + d <= s[n - 1]); d += STEG) {
          if (sv + d <= s[n - 1]) z = Tved(sv + d);
          if (!Number.isFinite(z) && sv - d >= 0) z = Tved(sv - d);
        }
        return z;
      };
      // kontrollpunktene
      const laastHer = new Map(plan.laast.filter(l => l.ror === r.id).map(l => [l.punkt, l]));
      const kumHer = new Map(plan.kummer.filter(x => x.ror === r.id).map(x => [x.punkt, x]));
      const ktr = [];
      for (let i = 0; i < n; i++) {
        const pid = t.punkter[i].id;
        const ende = i === 0 ? 'start' : i === n - 1 ? 'slutt' : null;
        const L = laastHer.get(pid), K = kumHer.get(pid);
        if (!ende && !L && !K) continue;
        const far = ende && !brutt.has(r.id + ':' + ende) ? forelder(r, ende) : null;
        let topp, fra = null;
        if (L) topp = toppFraBunn(L.bunn, k);
        else if (far && toppVed.has(far.ror.id + ':' + far.punkt)) { topp = toppVed.get(far.ror.id + ':' + far.punkt); fra = far.ror.id; }
        else topp = Tnaer(s[i]) - ov;
        ktr.push({ i, s: s[i], topp, laast: !!L, kum: K ? K.id : null, fra, punkt: pid, kilde: !!(L && L.kilde) });
      }
      if (ktr.some(c => !Number.isFinite(c.topp))) {
        utenHoyde.push({ id: r.id, kode: r.kode, xy, punkter: sone, grunn: 'terreng' });
        merknader.push({ type: 'terreng', linje: r.id, tekst: `${r.kode}: terrenget mangler langs hele røret – ingen høyder ennå.` });
        return;
      }
      const lin = (sv, felt) => {
        let a = ktr[0], b = ktr[ktr.length - 1];
        for (let j = 1; j < ktr.length; j++) if (ktr[j].s >= sv) { a = ktr[j - 1]; b = ktr[j]; break; }
        const L = b.s - a.s;
        return L > 0 ? a[felt] + (b[felt] - a[felt]) * (sv - a.s) / L : a[felt];
      };
      if (reg === 'trykk') {
        // overdekningen i kontrollpunktene: den frie er målet, den låste det den gir
        for (const c of ktr) { const Tz = Tnaer(c.s); c.dekning = Number.isFinite(Tz) ? Tz - c.topp : ov; }
      }
      // punktene: knekkpunktene, og for trykk én per meter mellom dem
      const rader = [];
      for (let i = 0; i < n; i++) {
        const pid = t.punkter[i].id;
        rader.push({ s: s[i], x: xy[i].x, y: xy[i].y, o: sone[i].o, n: sone[i].n, id: `${r.id}:${pid}`, i });
        if (reg !== 'trykk' || i === n - 1) continue;
        const L = s[i + 1] - s[i];
        for (let d = STEG; d < L - 1e-9; d += STEG) {
          const u = d / L;
          rader.push({ s: s[i] + d, x: xy[i].x + (xy[i + 1].x - xy[i].x) * u, y: xy[i].y + (xy[i + 1].y - xy[i].y) * u,
            o: sone[i].o + (sone[i + 1].o - sone[i].o) * u, n: sone[i].n + (sone[i + 1].n - sone[i].n) * u,
            id: `${r.id}:${pid}+${d}`, mellom: true });
        }
      }
      for (const q of rader) {
        if (reg === 'selvfall') q.z = lin(q.s, 'topp');
        else { const Tz = T(q.x, q.y); q.z = Number.isFinite(Tz) ? Tz - lin(q.s, 'dekning') : NaN; }
      }
      // et låst kontrollpunkt ligger der det er låst, også om terrenget mangler der
      for (const c of ktr) { const q = rader.find(x => x.i === c.i); if (q) q.z = c.topp; }
      // over et hull i terrenget: rett linje mellom kantene
      for (let a = 0; a < rader.length; a++) {
        if (Number.isFinite(rader[a].z)) continue;
        let b = a;
        while (b < rader.length && !Number.isFinite(rader[b].z)) b++;
        const v = a > 0 ? rader[a - 1] : null, h = b < rader.length ? rader[b] : null;
        for (let j = a; j < b; j++) {
          rader[j].z = v && h ? v.z + (h.z - v.z) * (rader[j].s - v.s) / (h.s - v.s) : (v || h).z;
        }
        a = b;
      }
      let lengde3d = 0;
      for (let j = 1; j < rader.length; j++) {
        lengde3d += Math.hypot(rader[j].s - rader[j - 1].s, rader[j].z - rader[j - 1].z);
      }
      linjer.push({
        id: r.id, kode: r.kode,
        punkter: rader.map(q => Object.assign({ id: q.id, kode: r.kode, o: q.o, n: q.n, z: q.z }, q.mellom ? { mellom: true } : {})),
        xy: rader.map(q => ({ x: q.x, y: q.y })), lengde: s[n - 1], lengde3d,
        plan: { ror: r.id, trase: t.id, regel: reg, grense: ov, gods: gods(k), motsatt: !!r.motsatt }
      });
      const vedKnekk = i => rader.find(q => q.i === i).z;
      for (let i = 0; i < n; i++) toppVed.set(r.id + ':' + t.punkter[i].id, vedKnekk(i));
      for (const c of ktr) {
        kontroll.push({ ror: r.id, s: c.s, punkt: c.punkt, x: xy[c.i].x, y: xy[c.i].y, topp: c.topp,
          bunn: bunnFraTopp(c.topp, k), laast: c.laast, kum: c.kum, fra: c.fra, kilde: c.kilde });
      }
      for (const K of kumHer.values()) {
        const i = t.punkter.findIndex(p => p.id === K.punkt);
        if (i < 0) continue;
        kummer.push({ id: K.id, ror: r.id, x: xy[i].x, y: xy[i].y, o: sone[i].o, n: sone[i].n,
          bunnlop: bunnFraTopp(vedKnekk(i), k), terreng: Tnaer(s[i]), diameter: K.diameter || mal.kum.diameter });
      }
      // en påkobling: den låste høyden står, men merknaden sier fra om kilden er endret
      for (const L of laastHer.values()) {
        if (!L.kilde || !o.innmalt) continue;
        const na = o.innmalt(L.kilde.anlegg, L.kilde.punkt);
        if (na == null) {
          merknader.push({ type: 'pakobling', linje: r.id,
            tekst: `${r.kode}: punktet røret er koblet på, finnes ikke lenger – den låste høyden står.` });
        } else if (Math.abs(na - L.kilde.topp) > 0.01) {
          merknader.push({ type: 'pakobling', linje: r.id, tekst: `${r.kode}: punktet røret er koblet på, har fått ny høyde `
            + `(${fmt(na, 2)} mot ${fmt(L.kilde.topp, 2)}) – «Hent på nytt» i punktfeltet.` });
        }
      }
    }

    /* REKKEFØLGEN: et rør regnes før greinene som leser høyden fra det. Går
       festene i sirkel, slippes festet til det første røret som står igjen. */
    const igjen = plan.ror.slice(), ferdig = new Set();
    while (igjen.length) {
      let i = igjen.findIndex(r => ['start', 'slutt'].every(e => {
        const far = forelder(r, e);
        return !far || ferdig.has(far.ror.id) || brutt.has(r.id + ':' + e);
      }));
      if (i < 0) {
        const r = igjen[0];
        for (const e of ['start', 'slutt']) {
          const far = forelder(r, e);
          if (far && !ferdig.has(far.ror.id)) brutt.add(r.id + ':' + e);
        }
        merknader.push({ type: 'grein', linje: r.id,
          tekst: `${r.kode}: greinene går i sirkel – høyden fra den andre traseen er sluppet ett sted.` });
        i = 0;
      }
      const r = igjen.splice(i, 1)[0];
      byggRor(r);
      ferdig.add(r.id);
    }
    /* MØTENE: der en grein er festet og der et rør er koblet på et innmålt.
       Der skal rørene møtes – kontrollen for kryssing hopper over dem. Radien
       tar med sideavstanden, så rør som ligger ved siden av traseen også er
       med i møtet. */
    const moter = [];
    for (const g of plan.greiner) {
      const t = traseer.get(g.trase);
      if (!t) continue;
      const side = Math.max(0, ...(rorPaa.get(g.trase) || []).concat(rorPaa.get(g.til.trase) || [])
        .map(x => Math.abs(x.side || 0)));
      moter.push(Object.assign(tilXY(posisjon(t, g.ende === 'start' ? 0 : t.punkter.length - 1)), { r: 0.5 + side }));
    }
    for (const c of kontroll) if (c.kilde) moter.push({ x: c.x, y: c.y, r: 0.5 });
    return { linjer, enslige: [], objekter: [], bruddUtenTreff: 0, koblingUtenTreff: 0,
      kummer, kontroll, utenHoyde, merknader, moter };
  }
```

  og `bygg` i `return`-lista.

- [ ] **Steg 4: `Ror.profil`** – i `ror.js`, linja som legger inn knekkpunktene: et mellompunkt er ikke målt, så profilen skal ikke tegne en prikk og et overdekningstall per meter:

```js
      prover.push(prove(s[i], xy[i].x, xy[i].y, pts[i].z, !pts[i].mellom));
```

- [ ] **Steg 5: Kjør** `node test/rorplanprove.js` og `npm test` · Ventet: alle ok.

- [ ] **Steg 6: Spesifikasjonen** – i 4.5: `utenDimensjon: [{ id, kode, xy }]` → `utenHoyde: [{ id, kode, xy, punkter, grunn }]` med «`grunn` er `'dimensjon'` eller `'terreng'` – før terrenget er hentet, har ingen rør høyder, men de skal tegnes», og `moter` i svaret. I 7: «Kryss innen 0,5 m + største sideavstand fra en påkobling eller greining er ikke kryss».

- [ ] **Steg 7: Commit** – «RorPlan.bygg: selvfall og trykk mellom kontrollpunktene, kummer, greiner og påkoblinger».

---

### Oppgave 4: Kontrollene – overdekning, fall, motfall, kryssing og fjell

**Filer:**
- Endre: `public/js/rorplan.js`, `test/rorplanprove.js`

**Grensesnitt:**
- Konsumerer: `bygg`-svaret (oppgave 3), `minFall`, `maksFall`, `kodeAv`, `stasjonering`.
- Produserer: `RorPlan.kontroller({ bygg, koder, mal, terrengZ, andre })` → `[{ type: 'overdekning'|'fall'|'motfall'|'kryss', linje, fra, til, x, y, tekst, mot? }]`, der `andre = [{ id, kode, D, xy, topp: number[], navn }]` er rør i andre anlegg i regnesonen. `RorPlan.fjell(groft, bygg)` → `[{ type: 'fjell', linje, fra, til, tekst }]`.

- [ ] **Steg 1: Prøven** – nytt avsnitt:

```js
console.log('\n4. Kontrollene');
{
  // overdekning: selvfall rett mellom to låste ender, terrenget har en dump midt på
  const topp8 = RorPlan.bunnFraTopp(8, SP);
  const p = plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }],
    { laast: [{ ror: 'r1', punkt: 'p1', bunn: topp8 }, { ror: 'r1', punkt: 'p2', bunn: topp8 }] });
  const T = x => (x >= 40 && x <= 60 ? 9 : 10);
  const od = RorPlan.kontroller({ bygg: bygg(p, T), koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: T, andre: [] })
    .filter(v => v.type === 'overdekning');
  paastand('overdekning: ett strekk i dumpa', od.length === 1, JSON.stringify(od));
  sjekk('fra', od[0].fra, 40, 1e-9);
  sjekk('til', od[0].til, 60, 1e-9);
  paastand('teksten sier hvor lite, og grensen', /1,00 m/.test(od[0].tekst) && /2,00 m/.test(od[0].tekst), od[0].tekst);
}
{
  // fall: motfall, for lite, for mye, og fallretningen snudd
  const fall = (b0, b1, ekstra = {}, koder = {}) => RorPlan.kontroller({
    bygg: bygg(plan1([[0, 0], [100, 0]], [Object.assign({ kode: 'SP 160PE' }, ekstra)],
      { laast: [{ ror: 'r1', punkt: 'p1', bunn: b0 }, { ror: 'r1', punkt: 'p2', bunn: b1 }] }), flatt, { koder }),
    koder, mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] });
  paastand('motfall', fall(7.0, 7.2).some(v => v.type === 'motfall'));
  paastand('fall under 10 ‰', fall(7.3, 7.0).some(v => v.type === 'fall' && /3,0 ‰/.test(v.tekst)));
  paastand('nok fall: ingen varsel', !fall(8.5, 7.0).some(v => v.type === 'fall' || v.type === 'motfall'));
  const maks = { 'SP 160PE': Object.assign({}, SP, { maksFall: 4, minFall: 0 }) };
  paastand('over største fall', fall(7.5, 7.0, {}, maks).some(v => v.type === 'fall' && /over 4,0 ‰/.test(v.tekst)));
  paastand('fallretningen snudd: motfallet er borte', !fall(7.0, 7.2, { motsatt: true }).some(v => v.type === 'motfall'));
  paastand('trykk sjekkes ikke for fall', !fall(7.0, 7.2, { regel: 'trykk' }).some(v => v.type === 'motfall' || v.type === 'fall'));
}
{
  // kryssing: et planlagt rør (topp 8,0, bunn 7,84) over et innmålt med kjent høyde
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const kr = toppB => RorPlan.kontroller({ bygg: b, koder: {}, mal: RorPlan.nyPlanmal(), terrengZ: flatt,
    andre: [{ id: 'x', kode: '110PE', D: 0.11, xy: [{ x: 50, y: -20 }, { x: 50, y: 20 }], topp: [toppB, toppB], navn: 'Innmålt' }] })
    .filter(v => v.type === 'kryss');
  paastand('klaring 0,24 m: varsel', kr(7.6).length === 1 && /0,24 m/.test(kr(7.6)[0].tekst), JSON.stringify(kr(7.6)));
  paastand('klaring 0,84 m: ingen', kr(7.0).length === 0);
  paastand('rørene treffer hverandre', kr(7.9).length === 1 && /treffer/.test(kr(7.9)[0].tekst));
  sjekk('varselet står i krysset', kr(7.6)[0].x, 50, 1e-9);
  // en grein som møter hovedrøret, er ikke et kryss – heller ikke når koden er en annen
  const g = Object.assign(RorPlan.nyPlan(), {
    traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 0, lon: 0 }, { id: 'p2', lat: 0, lon: 100 }] },
      { id: 't2', punkter: [{ id: 'p3', lat: 0, lon: 50 }, { id: 'p4', lat: 30, lon: 50 }] }],
    ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0 }, { id: 'r2', trase: 't2', kode: 'VL 110PE', side: 0 }],
    greiner: [{ trase: 't2', ende: 'start', til: { trase: 't1', punkt: 'p1' } }]
  });
  paastand('en grein som møter hovedrøret, er ikke et kryss', !RorPlan.kontroller({ bygg: bygg(g, flatt), koder: {},
    mal: RorPlan.nyPlanmal(), terrengZ: flatt, andre: [] }).some(v => v.type === 'kryss'));
}
{
  // fjell fra grøfta: en opplysning per rør
  const b = bygg(plan1([[0, 0], [100, 0]], [{ kode: 'SP 160PE' }]), flatt);
  const pr = [];
  for (let s = 0; s <= 100; s++) pr.push({ s, gravebunn: 7.69, fjell: s >= 20 && s < 50 ? 8.5 : null });
  const f = RorPlan.fjell({ profiler: new Map([['r1', pr]]), perLinje: new Map([['r1', { sprengning: 24.6 }]]) }, b);
  paastand('fjell: lengde og sprengning', f.length === 1 && /30 m/.test(f[0].tekst) && /25 m³/.test(f[0].tekst), JSON.stringify(f));
}
```

- [ ] **Steg 2: Kjør** · Ventet: `RorPlan.kontroller is not a function`.

- [ ] **Steg 3: Koden** – i `rorplan.js`, før `return`:

```js
  /** Motfall er motfall først under dette (‰) – avrunding er ikke motfall. */
  const MOTFALL = -0.05;

  /** Skjæringen mellom to strekk: { t, u } langs hvert, eller null. */
  function kryssPunkt(a0, a1, b0, b1) {
    const rx = a1.x - a0.x, ry = a1.y - a0.y, sx = b1.x - b0.x, sy = b1.y - b0.y;
    const nevner = rx * sy - ry * sx;
    if (Math.abs(nevner) < 1e-12) return null;
    const qx = b0.x - a0.x, qy = b0.y - a0.y;
    const t = (qx * sy - qy * sx) / nevner, u = (qx * ry - qy * rx) / nevner;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
  }
  const ramme = xy => xy.reduce((r, q) => ({ x0: Math.min(r.x0, q.x), x1: Math.max(r.x1, q.x),
    y0: Math.min(r.y0, q.y), y1: Math.max(r.y1, q.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

  /**
   * Kontrollene på de planlagte rørene. Fjellet kommer fra grøfta – se `fjell`.
   *
   * OVERDEKNING prøves hver meter langs røret, mot rørets grense (det samme
   * tallet de frie punktene legges på), og slås sammen til strekk. FALL er for
   * selvfall, mellom kontrollpunktene, i fallretningen. KRYSSING finnes i plan
   * mot hvert annet rør; klaringen er avstanden mellom utsidene i krysset.
   *
   * @param {object} o
   *   bygg        – svaret fra `bygg`
   *   koder, mal  – anleggets kodetabell og `mal.plan`
   *   terrengZ    – i regnesonen
   *   andre       – rør i andre anlegg: [{ id, kode, D, xy, topp: [z per punkt], navn }]
   */
  function kontroller(o) {
    const b = o.bygg, ut = [], T = o.terrengZ || (() => NaN);
    const m0 = v => fmt(v, 0), m1 = v => fmt(v, 1), m2 = v => fmt(v, 2);
    // OVERDEKNING
    for (const l of b.linjer) {
      const grense = l.plan.grense, s = stasjonering(l.xy);
      let fra = null, til = null, min = Infinity, ved = null;
      const lukk = () => {
        if (fra == null) return;
        ut.push({ type: 'overdekning', linje: l.id, fra, til, x: ved.x, y: ved.y,
          tekst: `${l.kode}: overdekning ned til ${m2(min)} m på ${m0(fra)}–${m0(til)} m (grense ${m2(grense)} m).` });
        fra = null; min = Infinity;
      };
      const prov = (sv, x, y, topp) => {
        const c = T(x, y) - topp;
        if (!Number.isFinite(c) || c >= grense - 0.01) { lukk(); return; }
        if (fra == null) fra = sv;
        til = sv;
        if (c < min) { min = c; ved = { x, y }; }
      };
      for (let i = 0; i + 1 < l.xy.length; i++) {
        const L = s[i + 1] - s[i], a = l.xy[i], c = l.xy[i + 1], za = l.punkter[i].z, zc = l.punkter[i + 1].z;
        for (let d = 0; d < L - 1e-9; d += STEG) {
          const u = d / L;
          prov(s[i] + d, a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u, za + (zc - za) * u);
        }
      }
      const e = l.xy.length - 1;
      prov(s[e], l.xy[e].x, l.xy[e].y, l.punkter[e].z);
      lukk();
    }
    // FALL OG MOTFALL
    for (const l of b.linjer) {
      if (l.plan.regel !== 'selvfall') continue;
      const k = kodeAv(o.koder, l.kode), lav = minFall(k), hoy = maksFall(k);
      const ktr = b.kontroll.filter(c => c.ror === l.id).sort((a, c) => a.s - c.s);
      for (let j = 1; j < ktr.length; j++) {
        const a = ktr[j - 1], c = ktr[j], L = c.s - a.s;
        if (!(L > 0.01)) continue;
        const fall = 1000 * (l.plan.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / L;
        const v = { linje: l.id, fra: a.s, til: c.s, x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        const hvor = `på ${m0(a.s)}–${m0(c.s)} m`;
        if (fall < MOTFALL) {
          ut.push(Object.assign(v, { type: 'motfall', tekst: `${l.kode}: motfall ${m1(-fall)} ‰ ${hvor}.` }));
        } else if (lav > 0 && fall < lav - 0.005) {
          ut.push(Object.assign(v, { type: 'fall', tekst: `${l.kode}: fall ${m1(fall)} ‰ ${hvor} – under ${m1(lav)} ‰.` }));
        } else if (hoy != null && fall > hoy + 0.005) {
          ut.push(Object.assign(v, { type: 'fall', tekst: `${l.kode}: fall ${m1(fall)} ‰ ${hvor} – over ${m1(hoy)} ‰.` }));
        }
      }
    }
    // KRYSSING
    const grense = o.mal && Number.isFinite(o.mal.kryssKlaring) ? o.mal.kryssKlaring : StandardPlanmal.kryssKlaring;
    const egne = b.linjer.map(l => ({ id: l.id, kode: l.kode, D: kodeAv(o.koder, l.kode).dim / 1000, xy: l.xy,
      topp: l.punkter.map(p => p.z), egen: true }));
    const alle = egne.concat(o.andre || []).map(x => Object.assign({ boks: ramme(x.xy) }, x));
    const moter = b.moter || [];
    for (let ia = 0; ia < egne.length; ia++) {
      const A = alle[ia], sA = stasjonering(A.xy);
      for (let ib = 0; ib < alle.length; ib++) {
        const B = alle[ib];
        if (B.egen && ib <= ia) continue;   // hvert par av planlagte én gang
        if (A.boks.x1 < B.boks.x0 || B.boks.x1 < A.boks.x0 || A.boks.y1 < B.boks.y0 || B.boks.y1 < A.boks.y0) continue;
        for (let i = 0; i + 1 < A.xy.length; i++) {
          for (let j = 0; j + 1 < B.xy.length; j++) {
            const kr = kryssPunkt(A.xy[i], A.xy[i + 1], B.xy[j], B.xy[j + 1]);
            if (!kr) continue;
            const P = { x: A.xy[i].x + (A.xy[i + 1].x - A.xy[i].x) * kr.t, y: A.xy[i].y + (A.xy[i + 1].y - A.xy[i].y) * kr.t };
            if (moter.some(m => Math.hypot(m.x - P.x, m.y - P.y) <= m.r)) continue;
            const tA = A.topp[i] + (A.topp[i + 1] - A.topp[i]) * kr.t, tB = B.topp[j] + (B.topp[j + 1] - B.topp[j]) * kr.u;
            if (!Number.isFinite(tA) || !Number.isFinite(tB)) continue;
            const klaring = Math.max(tA - A.D - tB, tB - B.D - tA);
            if (klaring >= grense) continue;
            const sv = sA[i] + (sA[i + 1] - sA[i]) * kr.t;
            // et kryss i et knekkpunkt på det andre røret finnes i to strekk – ett varsel
            if (ut.some(v => v.type === 'kryss' && v.linje === A.id && v.mot === B.id && Math.abs(v.fra - sv) < 0.5)) continue;
            const hvem = `${B.kode}${B.navn ? ' (' + B.navn + ')' : ''}`;
            ut.push({ type: 'kryss', linje: A.id, mot: B.id, fra: sv, til: sv, x: P.x, y: P.y, tekst: klaring < 0
              ? `${A.kode} treffer ${hvem} ved ${m0(sv)} m.`
              : `${A.kode} krysser ${hvem} med ${m2(klaring)} m klaring ved ${m0(sv)} m (grense ${m2(grense)} m).` });
          }
        }
      }
    }
    return ut;
  }

  /** Fjell i grøfta, per rør – en opplysning, ikke en feil: hvor langt og hvor mye. */
  function fjell(g, b) {
    const ut = [];
    if (!g || !g.profiler) return ut;
    for (const l of b.linjer) {
      const pr = g.profiler.get(l.id), per = g.perLinje.get(l.id);
      if (!pr || !per) continue;
      let lengde = 0, fra = null, til = null;
      for (let i = 0; i + 1 < pr.length; i++) {
        const q = pr[i];
        if (q.fjell == null || !Number.isFinite(q.gravebunn) || q.fjell <= q.gravebunn) continue;
        lengde += pr[i + 1].s - q.s;
        if (fra == null) fra = q.s;
        til = pr[i + 1].s;
      }
      if (lengde > 0.5) {
        ut.push({ type: 'fjell', linje: l.id, fra, til,
          tekst: `${l.kode}: grøfta går i fjell på ${fmt(lengde, 0)} m – sprengning ${fmt(per.sprengning, 0)} m³.` });
      }
    }
    return ut;
  }
```

  og `kontroller, fjell` i `return`-lista.

- [ ] **Steg 4: Kjør** · Ventet: alle ok.

- [ ] **Steg 5: Commit** – «RorPlan.kontroller: overdekning, fall og motfall, kryssing – og fjellet fra grøfta».

---

### Oppgave 5: Kummene i grøfta

**Filer:**
- Endre: `public/js/groft.js`, `test/groftprove.js`

**Grensesnitt:**
- Produserer: `Groft.beregn({ …, kummer: [{ id, x, y, bunnlop, diameter, eier }], kumArbeidsrom })` (eier = linje-id), `sum.kumvolum`, `perLinje.get(id).kumvolum`, `perKode.get(kode).kumvolum`. Kontrollen er nå `graving + sprengning = fundament + omfylling + gjenfylling + rørvolum + kumvolum`.

- [ ] **Steg 1: Prøven** – i `groftprove.js`, nytt avsnitt rett før «7. Massebalansen»:

```js
console.log('\n6b. Kummene');
{
  /* En kum alene på flat mark, langt fra røret den hører til. Gropa er en
     avkortet kjegle; fundamentet er de nederste 0,15 m av den; kummen selv er
     en sylinder fra kumbunnen til terrenget. */
  const ytre = 1.0 + 0.2, arb = 0.5, bunnlop = 7.0, kumBunn = bunnlop - 0.25;
  const r0 = ytre / 2 + arb, dyp = TERRENG - (kumBunn - f), R = r0 + dyp;   // helning 1:1
  const linjer = [rett('a', '160PE', 10, TOPP)];
  const uten = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.1 });
  const med = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.1, kumArbeidsrom: arb,
    kummer: [{ id: 'k1', x: 1200, y: 1200, bunnlop, diameter: 1000, eier: 'a' }] });
  const d = k => med.sum[k] - uten.sum[k];
  const V = Math.PI * dyp / 3 * (r0 * r0 + r0 * R + R * R);
  sjekk('kumgropa: avkortet kjegle', d('gravingLos'), V, V * 0.01);
  const r1 = r0 + f, F = Math.PI * f / 3 * (r0 * r0 + r0 * r1 + r1 * r1);
  sjekk('fundamentet under kummen', d('fundament'), F, F * 0.02);
  const Kv = Math.PI * (ytre / 2) ** 2 * (TERRENG - kumBunn);
  sjekk('kummen selv trekkes fra', med.sum.kumvolum, Kv, Kv * 0.02);
  sjekk('resten er gjenfylling', d('gjenfylling'), V - F - Kv, V * 0.01);
  const s = med.sum;
  sjekk('regnestykket går opp med kummen', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum + s.kumvolum, 1e-6);
  sjekk('kummen føres på røret', med.perLinje.get('a').kumvolum, Kv, Kv * 0.02);
}
{
  // en kum på røret: én grop, ikke to – og løpemeteren og dybdeklassen er grøftas
  const linjer = [rett('a', '160PE', 100, TOPP)];
  const q = punktVed(50, 0);
  const uten = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2 });
  const med = Groft.beregn({ linjer, koder: koder160, terrengZ: flatt, rute: 0.2,
    kummer: [{ id: 'k1', x: q.x, y: q.y, bunnlop: TOPP - D + 0.005, diameter: 1000, eier: 'a' }] });
  paastand('kummen gjør gropa større', med.sum.gravingLos > uten.sum.gravingLos + 5);
  sjekk('men lengden er den samme', med.sum.lengde, 100, 1e-6);
  sjekk('og dybdeklassen er grøftas', med.dybdeklasser[1].lengde, 100, 1e-6);
  const s = med.sum;
  sjekk('og regnestykket går opp', s.gravingLos + s.sprengning,
    s.fundament + s.omfylling + s.gjenfylling + s.rorvolum + s.kumvolum, 1e-6);
}
```

- [ ] **Steg 2: Kjør** `node test/groftprove.js` · Ventet: «kumgropa» rød (ingen kummer i motoren ennå).

- [ ] **Steg 3: Koden** – i `groft.js`:
  1. `tomme()` får `kumvolum: 0`; `leggTil(s, A, los, spreng, lf, lo, gjen, lk)` legger også til `s.kumvolum += lk * A`.
  2. I `forbered`, rett etter sammenslåingene (steg 4) og før rekkevidden (steg 5):

```js
    /* 4b. KUMMENE: en rund grop per kum – et segment uten lengde, med flat
       bunn ut til ytre radius + arbeidsrom og skråning derfra. Bunnen er
       kumbunnen (0,25 m under bunnløpet) minus fundamentet. Kummen sitter på et
       rør og føres på det; den er ikke med i rørets stasjoner. */
    const arbeidsrom = Number.isFinite(o.kumArbeidsrom) ? o.kumArbeidsrom : 0.5;
    for (const K of o.kummer || []) {
      const r = ror.findIndex(rr => rr.linje.id === K.eier);
      if (r < 0 || !Number.isFinite(K.bunnlop) || !Number.isFinite(K.x) || !Number.isFinite(K.y)) continue;
      const m = malFor(o.mal, ror[r].kodemal, null);
      const ytre = (K.diameter > 0 ? K.diameter : 1000) / 1000 + 0.2, bunn = K.bunnlop - 0.25;
      const sg = lagSegment({ x: K.x, y: K.y }, { x: K.x, y: K.y }, bunn, bunn, {
        r, i: -1, eier: r, sa: 0, sb: 0, D: 0, w: ytre / 2 + arbeidsrom, fund: m.fundament, omf: 0,
        hel: m.helning, fjell: null, gruppe: 0, virtuell: false, kum: { id: K.id, ytre, bunn }
      });
      sg.TA = sg.TB = T(K.x, K.y);
      seg.push(sg);
    }
```

  3. I rekkevidden (steg 5): retningene det gås ut i – to for et rør, åtte rundt en kum:

```js
        const retn = sg.kum
          ? Array.from({ length: 8 }, (_, a) => ({ x: Math.cos(a * Math.PI / 4), y: Math.sin(a * Math.PI / 4) }))
          : [{ x: -uy, y: ux }, { x: uy, y: -ux }];
```

  og løkka `for (const side of [1, -1])` blir `for (const v of retn)` med `T(px + v.x * d, py + v.y * d)`.
  4. `lagISoyle` – kummen går foran:

```js
  /**
   * Fundament, omfylling og kum i søylen [zg, T]. Hvert rør som graver her,
   * får lagene slik de ville vært i dets egen grøft: fundament fra gropa opp
   * til bunn rør, omfylling derfra til topp rør + omfylling. Et grunt rør i
   * grøfta til et dypt får dem der det ligger, og under det er det
   * gjenfylling. KUMMEN GÅR FORAN: der den står, er det betong, ikke
   * fundament eller omfylling for rørene som går inn i den – men under den er
   * fundamentet dens eget. Overlapper lag fra flere rør, telles de én gang.
   * @returns {number[]} [fundament, omfylling med røret, kum] i meter
   */
  function lagISoyle(kand, g, zg, Tq) {
    const fund = [], omf = [], kum = [];
    for (const c of kand) {
      if (c.g !== g) continue;
      const f0 = Math.max(c.z, zg), f1 = Math.min(c.bunn, Tq);
      if (f1 > f0) fund.push([f0, f1]);
      const o0 = Math.max(c.z, c.bunn, zg), o1 = Math.min(c.omfTopp, Tq);
      if (o1 > o0) omf.push([o0, o1]);
      if (c.kum != null && Tq > Math.max(c.kum, zg)) kum.push([Math.max(c.kum, zg), Tq]);
    }
    const K = forening(kum), F = forening(fund), O = forening(omf);
    return [lengdeAv(F) - overlapp(F, K), lengdeAv(O) - overlapp(O, forening(F.concat(K))), lengdeAv(K)];
  }
```

  5. I rutene i `beregn`: kandidaten får kummens sylinder, og kummen kommer med i regnestykket:

```js
            if (!sg.virtuell) {
              const topp = sg.ta + (sg.tb - sg.ta) * ut.t;
              kand.push({ g: sg.gruppe, z, bunn: topp - sg.D, omfTopp: topp + sg.omf,
                kum: sg.kum && Math.hypot(x - sg.ax, y - sg.ay) <= sg.kum.ytre / 2 ? sg.kum.bunn : null });
            }
```

```js
            const [lf, lo, lk] = lagISoyle(kand, g, zg, Tq);
            const gjen = Math.max(0, dybde - lf - lo - lk);
            leggTil(sum, A, dybde - spreng, spreng, lf, lo, gjen, lk);
            leggTil(per[sg.eier], A, dybde - spreng, spreng, lf, lo, gjen, lk);
```

  6. Bakkefaktoren og summen per kode tar med `'kumvolum'` i feltlistene.
  7. `iPunkt(M, x, y, Tq, gruppe, foran = -1, utenKum = false)` hopper over `sg.kum` når `utenKum` er satt, og stasjonsløkka i `beregn` kaller den med `utenKum = true` – løpemeteren og dybdeklassen er grøftas, ikke kumgropas. `meterEier` hopper over `s2.kum`.
  8. Kommentaren øverst i `beregn` og `README`-avsnittet om kontrollen får «+ kumvolum».

- [ ] **Steg 4: Kjør** `npm test` · Ventet: alle grønne, også de gamle grøfteprøvene.

- [ ] **Steg 5: Commit** – «Grøfta: kummer som runde groper med fundament, og kumvolumet trukket fra».

---

### Oppgave 6: Et tegnet anlegg i appen – data, prosjektfil og beregning

**Filer:**
- Endre: `public/js/prosjektform.js` (`_rettPlan`), `public/js/app.js` (`nyttAnlegg`, `erPlan`, `_harGeometri`, `byggRor`, `byggPlan`, `_innmaltTopp`, `_andreRor`, `_settRorsone`, `beregnRor`, `klargjorProsjekt`, `harInnhold`, `velgAnleggstype`), `public/js/ui-ror.js` (`leggInn`), `test/rorplanprove.js`, `public/js/nettlesertest.js`

**Grensesnitt:**
- Konsumerer: `RorPlan.bygg`, `RorPlan.kontroller`, `RorPlan.fjell`, `Groft.beregn({ kummer, kumArbeidsrom })`.
- Produserer: `App.nyttAnlegg('rorplan', navn, id)` (et røranlegg med `ror.plan` og `mal.plan`), `App.erPlan()`, `App._harGeometri(a)`, `App.byggPlan(a)`, `App._innmaltTopp(anlegg, punkt)`, `App._andreRor()`; `App.resultat` for et tegnet anlegg får `plan: true`, `kummer`, `kontroll`, og `merknader` med kontrollene. Nettlesertesten får `_planProsjekt()`.

- [ ] **Steg 1: Prøven i node** – `test/rorplanprove.js`, nytt avsnitt:

```js
console.log('\n5. Plandelen i prosjektfila');
{
  const Prosjektform = require(js('prosjektform.js'));
  const P = Prosjektform.klargjor({ navn: 'p', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror',
    mal: { plan: { overdekning: '2,4', kryssKlaring: -1, kum: { diameter: 50 } } },
    ror: { punkter: [], koder: { 'SP 160PE': { dim: 160, form: 'linje', gods: 'x', minFall: '12', regel: 'tull' } },
      plan: {
        traseer: [{ id: 't1', punkter: [{ id: 'p1', lat: 58.1, lon: 7.0 }, { id: 'p2', lat: '58,2', lon: 7.1 }, { id: 'p3', lat: 99, lon: 7 }] },
          { id: 't2', punkter: [{ id: 'p4', lat: 58, lon: 7 }] }, null],
        ror: [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 40, regel: 'trykk', motsatt: 'ja' },
          { id: 'r2', trase: 't9', kode: 'VL 110PE' }, { id: 'r3', trase: 't1', kode: '' }],
        kummer: [{ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 9000 }, { id: 'k2', ror: 'r1', punkt: 'p9' }],
        laast: [{ ror: 'r1', punkt: 'p1', bunn: '7,5', kilde: { anlegg: 'a2', punkt: 'X', topp: 7.7 } },
          { ror: 'r1', punkt: 'p1', bunn: 'x' }],
        greiner: [{ trase: 't1', ende: 'midt', til: { trase: 't2', punkt: 'p4' } }]
      } } }] });
  const a = P.anlegg[0], pl = a.ror.plan;
  paastand('traser med for få gyldige punkt tas bort, og punkt utenfor kloden',
    pl.traseer.length === 1 && pl.traseer[0].punkter.length === 2);
  sjekk('tekst med komma blir tall', pl.traseer[0].punkter[1].lat, 58.2, 1e-12);
  paastand('rør uten trase eller kode tas bort', pl.ror.length === 1 && pl.ror[0].id === 'r1');
  paastand('sideavstanden klemmes, regel og retning ryddes',
    pl.ror[0].side === 10 && pl.ror[0].regel === 'trykk' && pl.ror[0].motsatt === false);
  paastand('kum som ikke treffer, tas bort; diameteren klemmes', pl.kummer.length === 1 && pl.kummer[0].diameter === 3000);
  paastand('låst høyde: én per punkt, med kilde', pl.laast.length === 1 && pl.laast[0].bunn === 7.5 && pl.laast[0].kilde.topp === 7.7);
  paastand('grein med ugyldig ende tas bort', pl.greiner.length === 0);
  paastand('planmalen klemmes og får standarden', a.mal.plan.overdekning === 2.4 && a.mal.plan.kryssKlaring === 0.3
    && a.mal.plan.kum.diameter === 1000 && a.mal.plan.kum.arbeidsrom === 0.5, JSON.stringify(a.mal.plan));
  const k = a.ror.koder['SP 160PE'];
  paastand('kodefeltene ryddes', !('gods' in k) && k.minFall === 12 && !('regel' in k), JSON.stringify(k));
  const Q = Prosjektform.klargjor({ navn: 'q', aktivt: 'a1', anlegg: [{ id: 'a1', type: 'ror', ror: { punkter: [] } }] });
  paastand('et innmålt anlegg får ingen plan', !('plan' in Q.anlegg[0].ror) && !('plan' in Q.anlegg[0].mal));
}
```

- [ ] **Steg 2: Kjør** · Ventet: «traser med for få …» rød.

- [ ] **Steg 3: `_rettPlan`** – i `prosjektform.js`, etter `_rettGroft`:

```js
function _rorplan() {
  if (typeof RorPlan !== 'undefined') return RorPlan;
  return require('./rorplan.js');
}

/**
 * Plandelen i et tegnet røranlegg, gjort om til det programmet tåler.
 *
 * Som grøftejusteringene: en prosjektfil kan være redigert for hånd. Et
 * punkt uten to tall kan ikke tegnes; et rør, en kum eller en låst høyde som
 * peker på noe som ikke finnes, ville gitt en linje uten trase eller en grop
 * uten rør. Det som ikke treffer, tas bort; tall utenfor grensene klemmes.
 */
function _rettPlan(a, RP) {
  const erObjekt = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = v => (v != null && typeof v !== 'object' && String(v) !== '' ? String(v) : null);
  const tall = v => {
    const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };
  const liste = v => (Array.isArray(v) ? v : []);
  const p = erObjekt(a.ror.plan) ? a.ror.plan : {};
  const traseer = [], punktTil = new Map();
  for (const t of liste(p.traseer)) {
    const tid = erObjekt(t) ? id(t.id) : null;
    if (!tid || traseer.some(x => x.id === tid)) continue;
    const punkter = [];
    for (const q of liste(t.punkter)) {
      if (!erObjekt(q)) continue;
      const pid = id(q.id), lat = tall(q.lat), lon = tall(q.lon);
      if (!pid || punktTil.has(pid) || punkter.some(x => x.id === pid)) continue;
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      punkter.push({ id: pid, lat, lon });
    }
    if (punkter.length < 2) continue;
    traseer.push({ id: tid, punkter });
    for (const q of punkter) punktTil.set(q.id, tid);
  }
  const ror = [];
  for (const r of liste(p.ror)) {
    if (!erObjekt(r)) continue;
    const rid = id(r.id), trase = id(r.trase), kode = r.kode != null ? String(r.kode).trim() : '';
    if (!rid || !kode || !traseer.some(t => t.id === trase) || ror.some(x => x.id === rid)) continue;
    const side = RP.klem('side', r.side);
    ror.push({ id: rid, trase, kode, side: side === null ? (tall(r.side) > 0 ? 10 : tall(r.side) < 0 ? -10 : 0) : side,
      regel: r.regel === 'selvfall' || r.regel === 'trykk' ? r.regel : null, motsatt: r.motsatt === true });
  }
  const paaRoret = (rid, pid) => { const r = ror.find(x => x.id === rid); return !!r && punktTil.get(pid) === r.trase; };
  const kummer = [];
  for (const k of liste(p.kummer)) {
    if (!erObjekt(k)) continue;
    const kid = id(k.id), rid = id(k.ror), pid = id(k.punkt);
    if (!kid || !paaRoret(rid, pid) || kummer.some(x => x.id === kid)) continue;
    const d = RP.klem('diameter', k.diameter);
    kummer.push({ id: kid, ror: rid, punkt: pid, diameter: d === null ? RP.StandardPlanmal.kum.diameter : d });
  }
  const laast = [];
  for (const l of liste(p.laast)) {
    if (!erObjekt(l)) continue;
    const rid = id(l.ror), pid = id(l.punkt), bunn = tall(l.bunn);
    if (!paaRoret(rid, pid) || bunn === null || laast.some(x => x.ror === rid && x.punkt === pid)) continue;
    const ut = { ror: rid, punkt: pid, bunn };
    const k = l.kilde;
    if (erObjekt(k) && id(k.anlegg) && id(k.punkt) && tall(k.topp) !== null) {
      ut.kilde = { anlegg: id(k.anlegg), punkt: id(k.punkt), topp: tall(k.topp) };
    }
    laast.push(ut);
  }
  const greiner = [];
  for (const g of liste(p.greiner)) {
    if (!erObjekt(g) || !erObjekt(g.til)) continue;
    const tid = id(g.trase), ende = g.ende === 'start' || g.ende === 'slutt' ? g.ende : null;
    const til = { trase: id(g.til.trase), punkt: id(g.til.punkt) };
    if (!ende || !traseer.some(t => t.id === tid) || til.trase === tid || punktTil.get(til.punkt) !== til.trase) continue;
    if (greiner.some(x => x.trase === tid && x.ende === ende)) continue;
    greiner.push({ trase: tid, ende, til });
  }
  a.ror.plan = { traseer, ror, kummer, laast, greiner };
  const m = erObjekt(a.mal.plan) ? a.mal.plan : {}, kum = erObjekt(m.kum) ? m.kum : {};
  const std = RP.StandardPlanmal, ell = (v, s) => (v === null ? s : v);
  a.mal.plan = {
    overdekning: ell(RP.klem('overdekning', m.overdekning), std.overdekning),
    kryssKlaring: ell(RP.klem('kryssKlaring', m.kryssKlaring), std.kryssKlaring),
    kum: { diameter: ell(RP.klem('diameter', kum.diameter), std.kum.diameter),
      arbeidsrom: ell(RP.klem('arbeidsrom', kum.arbeidsrom), std.kum.arbeidsrom) }
  };
  for (const k of Object.values(a.ror.koder)) {
    for (const f of ['gods', 'overdekning', 'minFall', 'maksFall']) {
      if (!(f in k)) continue;
      const v = RP.klem(f, k[f]);
      if (v === null) delete k[f]; else k[f] = v;
    }
    if ('regel' in k && k.regel !== 'selvfall' && k.regel !== 'trykk') delete k.regel;
  }
}
```

  og i `ror`-greina etter `_rettGroft(a, _groft());`: `if (a.ror.plan) _rettPlan(a, _rorplan());`. (`klem` klemmer 40 ned til 10, men avviser alt under −10 – derfor settes en sideavstand under −10 til −10 for hånd, så et rør som ligger langt til venstre ikke havner midt i traseen.)

- [ ] **Steg 4: Kjør** `node test/rorplanprove.js` · Ventet: alle ok.

- [ ] **Steg 5: Appen** – i `app.js`:
  1. `nyttAnlegg`: `const ror = type === 'ror' || type === 'rorplan';`, `type: type === 'tomt' ? 'tomt' : ror ? 'ror' : 'veg'`, navnet `'Planlagte rør'` for `'rorplan'`, og i `ror`-greina etter `a.mal = …`:

```js
      /* Et tegnet anlegg har en plan; et innmålt har punktene fra fila. */
      if (type === 'rorplan') { a.ror.plan = RorPlan.nyPlan(); a.mal.plan = RorPlan.nyPlanmal(); }
```

  2. Nye metoder etter `erRor()`:

```js
  /** Er det et tegnet røranlegg vi jobber med nå? */
  erPlan() { const a = this.anlegg(); return !!a && a.type === 'ror' && !!(a.ror && a.ror.plan); },

  /** Har anlegget noe tegnet eller importert – en veg, en tomt, innmålte eller tegnede rør? */
  _harGeometri(a) {
    return !!a && !!((a.ip && a.ip.length) || (a.tomt && a.tomt.punkter && a.tomt.punkter.length)
      || (a.ror && a.ror.punkter && a.ror.punkter.length) || (a.ror && a.ror.plan && a.ror.plan.traseer.length));
  },
```

  3. `_harGeometri` brukes i `klargjorProsjekt` (`P.anlegg.some(a => this._harGeometri(a))`), `harInnhold` (`this.P.anlegg.some(a => this._harGeometri(a))`), `velgAnleggstype` (`const harNoe = this._harGeometri(a);`) og i `RorUI.leggInn` (`const tomt = !app._harGeometri(na);`).
  4. `byggRor` og de nye hjelperne:

```js
  byggRor() {
    const r = this.P.ror;
    if (r.plan) return this.byggPlan(this.anlegg());
    return Ror.byggLinjer(r, this.P.mal, Ror.lagTilXY(r.sone, this.sone));
  },

  /**
   * Et tegnet anlegg som linjer i regnesonen – se RorPlan.bygg. Høydene kommer
   * fra terrenget som er hentet; før det er hentet, har rørene ingen høyder,
   * men tegnes likevel (`utenHoyde`).
   */
  byggPlan(a) {
    const r = a.ror;
    const terr = this.terreng && this.terreng.sone === this.sone ? this.terreng : null;
    return RorPlan.bygg({
      plan: r.plan, koder: r.koder, mal: a.mal.plan,
      tilSone: (lat, lon) => { const u = Geo.tilUtm(lat, lon, r.sone); return { o: u.x, n: u.y }; },
      tilXY: Ror.lagTilXY(r.sone, this.sone),
      terrengZ: terr ? (x, y) => terr.z(x, y) : () => NaN,
      innmalt: (anlegg, punkt) => this._innmaltTopp(anlegg, punkt)
    });
  },

  /** Topp rør i et innmålt punkt i et annet anlegg nå – eller null om det er borte. */
  _innmaltTopp(anleggId, punktId) {
    const a = this.P.anlegg.find(x => x.id === anleggId);
    const p = a && a.type === 'ror' && a.ror && !a.ror.plan ? a.ror.punkter.find(x => x.id === punktId) : null;
    return p ? p.z : null;
  },

  /** Rørene i de andre røranleggene, i regnesonen – til kryssingskontrollen. */
  _andreRor() {
    const ut = [];
    for (const a of this.P.anlegg) {
      if (a.type !== 'ror' || a.id === this.P.aktivt || !a.ror) continue;
      const b = a.ror.plan ? this.byggPlan(a) : Ror.byggLinjer(a.ror, a.mal, Ror.lagTilXY(a.ror.sone, this.sone));
      for (const l of b.linjer) {
        const k = a.ror.koder[l.kode] || Ror.tolkKode(l.kode);
        if (!(k.dim > 0)) continue;
        ut.push({ id: a.id + '/' + l.id, kode: l.kode, D: k.dim / 1000, xy: l.xy, topp: l.punkter.map(p => p.z), navn: a.navn });
      }
    }
    return ut;
  },
```

  5. `_settRorsone(r)`: siste del blir

```js
    // et tegnet anlegg har ingen innmålte punkt – det første tracepunktet bestemmer
    const forste = r.plan && r.plan.traseer[0] ? r.plan.traseer[0].punkter[0] : null;
    const lon = forste ? forste.lon : r.punkter[0] ? Ror.tilLatLon(r.punkter[0], r.sone)[1] : NaN;
    if (Number.isFinite(lon)) { this.sone = Geo.sone(lon); this._soneSatt = true; }
```

  6. `beregnRor`:
     - vakten: `if (!r || (!r.punkter.length && !(r.plan && r.plan.traseer.length))) { this.resultat = null; vis(); return null; }`
     - `const bygg = this.byggRor();` → `let bygg = this.byggRor();`
     - terrengnøkkelen og korridorene tar med rørene uten høyde – et tegnet anlegg har ingen høyder før terrenget er hentet, og da ville ingenting blitt hentet:

```js
    const traser = bygg.linjer.concat(bygg.utenHoyde || []);
    const nokkel = 'ror#' + this.sone + '#' + halv + '#' + (r.plan
      ? JSON.stringify(r.plan.traseer) + JSON.stringify(r.plan.ror.map(x => [x.id, x.side]))
      : bygg.linjer.map(l => l.id + ':' + l.punkter.length + ':' + l.lengde.toFixed(2)).join('|'));
    const anleggFoer = this.P.aktivt;
    if (nokkel !== this._terrengnokkel && traser.length) {
      await this.medHenteboks('Henter terrengdata fra Kartverket',
        fram => this.terreng.lastKorridorer(traser.map(l => Ror.korridor(l.xy)), halv, fram));
```

     - rett etter terrenghentingen: `if (r.plan) bygg = this.byggRor();` med kommentaren «Høydene til et tegnet anlegg kommer fra terrenget – nå som det er hentet, bygges det på nytt.»
     - grøfta får kummene, og nøkkelen tar dem med:

```js
    const kummer = (bygg.kummer || []).map(k => ({ id: k.id, x: k.x, y: k.y, bunnlop: k.bunnlop, diameter: k.diameter, eier: k.ror }));
    const groftNokkel = JSON.stringify([bygg.linjer.map(l => [l.id, l.punkter.map(p => [p.id, p.z]), l.xy]), r.koder,
      this.P.mal.groft, r.groft, fm.punkter, fm.rekkevidde, this._terrengnokkel, lastet, this.sone, this.P.faktorer,
      bakkefaktor, kummer, r.plan ? this.P.mal.plan : null]);
    if (groftNokkel !== this._groftNokkel || !this._groftResultat) {
      this._groftResultat = Groft.beregn({
        linjer: bygg.linjer, koder: r.koder, mal: this.P.mal.groft, justering: r.groft,
        terrengZ, fjellSondert: (x, y) => fm.sondert(x, y), faktorer: this.P.faktorer, bakkefaktor,
        kummer, kumArbeidsrom: r.plan ? this.P.mal.plan.kum.arbeidsrom : undefined
      });
      this._groftNokkel = groftNokkel;
    }
```

     - resultatet:

```js
    this.resultat = {
      type: 'ror', bygg, linjer: bygg.linjer, profiler, sone: this.sone, bakkefaktor,
      /* Et tegnet anlegg har kontrollene i stedet for importens merknader –
         enslige punkt og rettinger finnes ikke der. */
      merknader: r.plan
        ? bygg.merknader.concat(RorPlan.kontroller({ bygg, koder: r.koder, mal: this.P.mal.plan, terrengZ,
          andre: this._andreRor() }), RorPlan.fjell(this._groftResultat, bygg))
        : Ror.merknader(bygg, profiler, this.P.mal.maksAvstand),
      groft: this._groftResultat,
      plan: !!r.plan, kummer: bygg.kummer || [], kontroll: bygg.kontroll || []
    };
```

- [ ] **Steg 6: Nettlesertesten** – hjelperen og prøven, inn i lista etter `'groftRapport'`:

```js
  /**
   * Et tegnet anlegg med én trase: spillvann og vann i samme grøft, og en kum
   * på spillvannet. Kalles inne i `_medFlattTerreng`.
   */
  async _planProsjekt() {
    App.P = App.nyttProsjekt();
    const a = App.nyttAnlegg('rorplan', 'Planlagte rør', App.P.anlegg[0].id);
    App.P.anlegg[0] = a; App.P.aktivt = a.id; delete App.P.ubestemt;
    const o = Geo.tilUtm(58.1412, 7.0705, 32);
    const gr = (x, y) => Geo.fraUtm(o.x + x, o.y + y, 32);
    a.ror.sone = 32;
    a.ror.plan.traseer.push({ id: 't1', punkter: [[0, 0], [40, 0], [80, 10]].map(([x, y], i) => {
      const g = gr(x, y);
      return { id: 'p' + (i + 1), lat: g.lat, lon: g.lon };
    }) });
    a.ror.koder = Ror.koderFra([{ kode: 'SP 160PE' }, { kode: 'VL 110PE' }], {});
    a.ror.plan.ror.push({ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0.4, regel: null, motsatt: false },
      { id: 'r2', trase: 't1', kode: 'VL 110PE', side: -0.4, regel: null, motsatt: false });
    a.ror.plan.kummer.push({ id: 'k1', ror: 'r1', punkt: 'p2', diameter: 1000 });
    App.visAnleggsvelger(); App.malTilSkjema(); App.tegnAlt();
    clearTimeout(App._tidsavbrudd);
    await App.beregnRor();
    return { a, ll: (x, y) => { const g = gr(x, y); return L.latLng(g.lat, g.lon); } };
  },

  /** Et tegnet anlegg regnes som et innmålt: linjer, profiler, grøft, kummer og kontroller. */
  async planBeregning() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        await this._planProsjekt();
        const res = App.resultat;
        this.sjekk('resultatet er et rørresultat med plan', !!res && res.type === 'ror' && res.plan === true);
        this.sjekk('to rør', res.linjer.length === 2, String(res.linjer.length));
        const sp = res.linjer.find(l => l.kode === 'SP 160PE');
        this.sjekk('selvfall: topp 2,0 m under terrenget i enden', Math.abs(sp.punkter[0].z - 19.5) < 1e-6, String(sp.punkter[0].z));
        this.sjekk('grøfta er regnet, med kummen', res.groft.sum.gravingLos > 50 && res.groft.sum.kumvolum > 1,
          JSON.stringify(res.groft.sum));
        this.sjekk('kumlista', res.kummer.length === 1 && Math.abs(res.kummer[0].terreng - 21.5) < 1e-6);
        this.sjekk('en profil per rør', res.profiler.size === 2);
        this.sjekk('anlegget har innhold – det autolagres', App.harInnhold());
        this.sjekk('erPlan', App.erPlan() === true);
        // lagring og åpning: fila går gjennom den samme klargjøringen som når et prosjekt åpnes
        const apnet = App.klargjorProsjekt(Object.assign(App.nyttProsjekt(), JSON.parse(JSON.stringify(App.P))));
        const pl = apnet.anlegg[0].ror.plan;
        this.sjekk('planen står seg gjennom lagring og åpning', pl.traseer.length === 1 && pl.ror.length === 2
          && pl.kummer.length === 1 && apnet.anlegg[0].mal.plan.overdekning === 2 && !apnet.ubestemt);
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 7: Kjør** `npm test`, så nettlesertesten (`planBeregning`, `rorImport`, `rorKart`, `groftBeregning`) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Et tegnet røranlegg i appen: planen i prosjektfila, linjer fra RorPlan, kummer i grøfta og kontrollene i merknadene».

---

### Oppgave 7: Nytt tegnet anlegg, og verktøylinja for det

**Filer:**
- Opprett: `public/js/ui-rorplan.js` (skjelettet: `init`, `plan`)
- Endre: `public/index.html` (knappene, førstevalget, script etter `ui-groft.js`), `public/js/app.js` (`leggTilPlan`, `velgAnleggstype`, anleggslista, `visAnleggsvelger`, `start`), `public/js/ui-kart.js` (`settModus`, `tegnAndreAnlegg`), `public/js/nettlesertest.js`

**Grensesnitt:**
- Produserer: `App.leggTilPlan()`; Kart-modusene `'tegnTrase'`, `'kum'`, `'snuTrase'`; `RorPlanUI.init(app)`, `RorPlanUI.plan()`; knappene `verktoyTrase`, `verktoyKum`, `verktoySnu`; førstevalget `data-velg="rorplan"`; anleggslista `data-nyttplan`.

- [ ] **Steg 1: Prøven** – i `nettlesertest.js`, inn i lista etter `'planBeregning'`:

```js
  /** «Planlagte rør (tegn)» i førstevalget og i anleggslista. */
  async planNyttAnlegg() {
    const foer = JSON.stringify(App.P);
    try {
      App.P = App.nyttProsjekt();
      App.visAnleggsvelger(); App.visAnleggsvalg();
      document.querySelector('#velganlegg [data-velg="rorplan"]').click();
      this.sjekk('førstevalget gir et tegnet anlegg', App.erPlan() && App.P.anlegg.length === 1 && !App.P.ubestemt);
      this.sjekk('og står i «Ny trase»', Kart.modus === 'tegnTrase', Kart.modus);
      const synlig = id => !document.getElementById(id).classList.contains('skjult');
      this.sjekk('tegneverktøyene vises', synlig('verktoyTrase') && synlig('verktoyKum') && synlig('verktoySnu'));
      this.sjekk('importens verktøy vises ikke', !synlig('verktoyRorImport') && !synlig('verktoyRorAv'));
      this.sjekk('grøfteverktøyene vises', synlig('verktoyGroftStrekning') && synlig('verktoyGroftSammen'));
      Kart.settModus('rediger');
      App.visAnleggsvelger();
      document.querySelector('#anleggspanel [data-nyttplan]').click();
      this.sjekk('anleggslista legger til et nytt', App.P.anlegg.length === 2 && App.erPlan()
        && App.anlegg().navn === 'Planlagte rør 2', App.anlegg().navn);
      Kart.settModus('rediger');
      await App.angre();
      this.sjekk('og angre tar det bort igjen', App.P.anlegg.length === 1);
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: kaster på `#velganlegg [data-velg="rorplan"]`.

- [ ] **Steg 3: Knappene** – i `index.html`, etter `verktoyGroftSammen`:

```html
        <!-- TEGNEDE RØR: traseene og kummene i et planlagt anlegg – se RorPlanUI. -->
        <button id="verktoyTrase" class="verktoyknapp skjult" aria-pressed="false" title="Klikk punktene langs traseen. Dobbeltklikk eller Enter avslutter, Esc avbryter.">✎ Ny trase</button>
        <button id="verktoyKum" class="verktoyknapp skjult" aria-pressed="false" title="Klikk et punkt på en trase for å sette en kum – eller ta den bort">◯ Kum</button>
        <button id="verktoySnu" class="verktoyknapp skjult" aria-pressed="false" title="Klikk en trase for å snu fallretningen for rørene i den">⇄ Snu fallretning</button>
```

  i førstevalget etter `data-velg="ror"`: `<button class="knapp primaer" data-velg="rorplan">✎ Rør (tegn)</button>`, og `<script src="js/ui-rorplan.js"></script>` etter `ui-groft.js`.

- [ ] **Steg 4: `ui-rorplan.js`** – skjelettet:

```js
'use strict';
/**
 * Planlagte rør i skjermen: verktøyene i kartet, dialogene, Rør-fanen for
 * tegnede anlegg og redigeringen i profilen.
 *
 * Regnestykket ligger i rorplan.js. Her er bare det som rører skjermen.
 */
const RorPlanUI = {
  app: null,
  /* Traseen som tegnes nå. Den ligger utenfor prosjektet til den er ferdig,
     så hele traseen blir én angrepost – ikke én per klikk. */
  _ny: null,
  /* Tracepunktet som er valgt i kartet – Delete tar det bort. */
  valgt: null,
  _sistKode: null,

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    for (const [knapp, modus] of [['verktoyTrase', 'tegnTrase'], ['verktoyKum', 'kum'], ['verktoySnu', 'snuTrase']]) {
      if (id(knapp)) id(knapp).onclick = () => Kart.settModus(Kart.modus === modus ? 'rediger' : modus);
    }
    return this;
  },

  plan() { return this.app.P.ror.plan; }
};

if (typeof module !== 'undefined') module.exports = RorPlanUI;
```

- [ ] **Steg 5: Appen** – i `app.js`:
  1. Etter `leggTilAnlegg`:

```js
  /**
   * Et nytt tegnet røranlegg, rett i «Ny trase». Byttet er en del av det å
   * legge til – én angrepost, ikke to.
   */
  leggTilPlan() {
    this.merk('nytt anlegg');
    const a = this.nyttAnlegg('rorplan', RorUI._ledigNavn('Planlagte rør'));
    this.P.anlegg.push(a);
    this._ikkeMerk = true;
    try { this.byttAnlegg(a.id); } finally { this._ikkeMerk = false; }
    Kart.settModus('tegnTrase');
  },
```

  2. `velgAnleggstype`: navnet på det som byttes ut blir `type === 'tomt' ? 'Tomt' : type === 'rorplan' ? 'Planlagte rør' : 'Veg'`; `this.leggTilAnlegg(type)` blir `type === 'rorplan' ? this.leggTilPlan() : this.leggTilAnlegg(type)`; og slutten:

```js
    Kart.settModus(type === 'tomt' ? 'tegnTomt' : type === 'rorplan' ? 'tegnTrase' : 'tegn');
    this.tegnAlt();
    this.status(type === 'tomt' ? 'Klikk rundt tomta i kartet. Dobbeltklikk for å lukke den.'
      : type === 'rorplan' ? 'Klikk punktene langs traseen. Dobbeltklikk eller Enter avslutter.'
        : 'Klikk i kartet for å legge inn knekkpunkt. Dobbeltklikk for å avslutte.');
```

  3. Anleggslista: `'<button class="kartknapp" data-nyttplan="1">⌀ Planlagte rør (tegn)</button>'` etter «Nye rør (fra fil)», og

```js
    for (const b of panel.querySelectorAll('[data-nyttplan]')) {
      b.onclick = () => { this._lukkAnleggspanel(); this.leggTilPlan(); };
    }
```

  4. `visAnleggsvelger`: lista over rørknapper blir

```js
    /* Et tegnet anlegg har ingen fil å importere eller punkt å rette – det har
       traseene og kummene. Grøfteverktøyene gjelder begge. */
    const plan = this.erPlan();
    for (const id of ['verktoyRorImport', 'verktoyRorAv', 'verktoyRorBryt', 'verktoyRorKoble']) bytt(id, ror && !plan);
    for (const id of ['verktoyGroftStrekning', 'verktoyGroftSammen']) bytt(id, ror);
    for (const id of ['verktoyTrase', 'verktoyKum', 'verktoySnu']) bytt(id, plan);
```

  5. `start()`: `RorPlanUI.init(this);` etter `GroftUI.init(this);`.
  6. `RorUI.importerTekst`: et tegnet anlegg kan ikke få punkt «lagt til» – importen ville havnet i `ror.punkter`, som et tegnet anlegg ikke bruker, og forsvunnet uten et ord. Er det aktive anlegget tegnet, blir importen alltid et nytt anlegg: der `aktivtRor` settes, `app.erRor() && !app.erPlan()`.
- [ ] **Steg 6: Kartet** – i `ui-kart.js`:
  1. `settModus`: knappelista får `['verktoyTrase', 'tegnTrase'], ['verktoyKum', 'kum'], ['verktoySnu', 'snuTrase']`, og:

```js
    if (m === 'tegnTrase') {
      this.app.status('Klikk punktene langs traseen. Dobbeltklikk eller Enter avslutter, tilbaketasten tar bort det siste, Esc avbryter.');
    }
    if (m === 'kum') this.app.status('Klikk et punkt på en trase for å sette en kum – eller ta den bort.');
    if (m === 'snuTrase') this.app.status('Klikk en trase for å snu fallretningen for rørene i den.');
    // bytter man verktøy midt i en trase, er den ikke lagret
    if (m !== 'tegnTrase' && typeof RorPlanUI !== 'undefined' && RorPlanUI._ny) RorPlanUI.avbryt();
```

  2. `tegnAndreAnlegg`: etter greina for innmålte rør:

```js
      } else if (a.type === 'ror' && a.ror && a.ror.plan && a.ror.plan.traseer.length) {
        // et tegnet anlegg: traseene, rett fra gradene
        const ramme = L.latLngBounds([]);
        for (const t of a.ror.plan.traseer) {
          const p = t.punkter.map(q => [q.lat, q.lon]);
          L.polyline(p, Object.assign({}, stil, { weight: 2 })).on('click', bytt).addTo(this.lag.andre);
          ramme.extend(p);
        }
        if (ramme.isValid()) midt = ramme.getCenter();
      }
```

  (`RorPlanUI.avbryt` kommer i oppgave 8; til da står vakten `RorPlanUI._ny` og hindrer kallet.)

- [ ] **Steg 7: Kjør** nettlesertesten (`planNyttAnlegg`, `rorImport`, `anleggsliste`) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Planlagte rør som eget anlegg: førstevalget, anleggslista og verktøylinja».

---

### Oppgave 8: Tegne en trase – klikk, feste og «Rør i traseen»

**Filer:**
- Endre: `public/js/ui-rorplan.js`, `public/js/ui-kart.js` (`init`: klikk og dobbeltklikk, `klikk`, `tegnRor`, ny `tegnPlan`), `public/js/app.js` (tastene), `public/css/app.css`, `public/js/nettlesertest.js`

**Grensesnitt:**
- Konsumerer: `RorPlan.alleIder`, `RorPlan.nyId`, `RorPlan.klem`, `RorPlan.kodeAv`, `RorPlan.bunnFraTopp`, `Ror.koderFra`, `RorUI._toleranse`.
- Produserer: `RorPlanUI.tegnKlikk(latlng)`, `RorPlanUI.angreSiste()`, `RorPlanUI.avbryt()`, `RorPlanUI.avsluttTrase()`, `RorPlanUI.rorDialog({ tittel, notis, rader, flere, lagre, avbrutt })`, `RorPlanUI.lagreTrase(punkter, rader)`, `RorPlanUI._fest(latlng)`, `RorPlanUI._andreKoder()`; `Kart.tegnPlan(r, bygg, res, ll)`.

- [ ] **Steg 1: Prøven** – inn i lista etter `'planNyttAnlegg'`:

```js
  /** Ny trase med klikk: punktene, festet til et innmålt rør, dialogen med to rør, og angre. */
  async planTegnTrase() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        App.P = App.nyttProsjekt();
        await RorUI.importerTekst(this._rorXml(), 'asbuilts_Prove.xml', {}, { sone: 32, maal: 'nytt' });
        clearTimeout(App._tidsavbrudd);
        App.leggTilPlan();
        const o = Geo.tilUtm(58.1412, 7.0705, 32);
        const ll = (x, y) => { const g = Geo.fraUtm(o.x + x, o.y + y, 32); return L.latLng(g.lat, g.lon); };
        Kart.kart.setView(ll(100, 20), 18);
        this.sjekk('anlegget står i «Ny trase»', Kart.modus === 'tegnTrase');
        RorPlanUI.tegnKlikk(ll(100, 0));     // 90PE har et målt punkt her
        RorPlanUI.tegnKlikk(ll(100, 30));
        RorPlanUI.tegnKlikk(ll(140, 30));
        RorPlanUI.angreSiste();
        RorPlanUI.tegnKlikk(ll(150, 40));
        this.sjekk('tre punkt i traseen som tegnes', RorPlanUI._ny.length === 3);
        this.sjekk('det første er festet til det innmålte røret', !!RorPlanUI._ny[0].fest && RorPlanUI._ny[0].fest.kode === '90PE');
        let skisse = 0;
        Kart.lag.ror.eachLayer(l => { if (l.options && l.options.className === 'planskisse') skisse++; });
        this.sjekk('traseen som tegnes, vises', skisse === 1, String(skisse));
        RorPlanUI.avsluttTrase();
        this.sjekk('dialogen «Rør i traseen» åpnes', !document.getElementById('dialog').classList.contains('skjult')
          && !!document.getElementById('planLagre'));
        document.getElementById('planNyRad').click();
        const rader = document.querySelectorAll('#planRader .planrad');
        rader[0].querySelector('.plankode').value = '90PE';
        rader[1].querySelector('.plankode').value = 'SP 160PE';
        rader[1].querySelector('.planside').value = '0.5';
        document.getElementById('planLagre').click();
        const plan = App.P.ror.plan;
        this.sjekk('traseen er lagret med tre punkt og to rør', plan.traseer.length === 1
          && plan.traseer[0].punkter.length === 3 && plan.ror.length === 2 && plan.ror[1].side === 0.5);
        this.sjekk('påkoblingen er låst på røret med samme kode, med kilde', plan.laast.length === 1
          && plan.laast[0].ror === plan.ror[0].id && !!plan.laast[0].kilde, JSON.stringify(plan.laast));
        this.sjekk('den nye koden står i kodetabellen', !!App.P.ror.koder['SP 160PE']);
        clearTimeout(App._tidsavbrudd);
        await App.beregnRor();
        this.sjekk('og rørene er regnet', App.resultat.linjer.length === 2, String(App.resultat.linjer.length));
        // spillvannet (fri ende, topp 19,5) går rett gjennom 180 PE (topp 19,5) der det krysser
        this.sjekk('krysset med det innmålte 180 PE varsles', App.resultat.merknader.some(m => m.type === 'kryss'
          && /180 PE/.test(m.tekst)), App.resultat.merknader.map(m => m.tekst).join(' | '));
        await App.angre();
        this.sjekk('angre tar hele traseen bort', App.P.ror.plan.traseer.length === 0);
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: `RorPlanUI.tegnKlikk is not a function`.

- [ ] **Steg 3: `ui-rorplan.js`** – inn i objektet, etter `plan()`:

```js
  /* ---------------- ny trase ---------------- */

  /** Et klikk med «Ny trase»: punktet legges til, festet om det treffer et rør. */
  tegnKlikk(latlng) {
    if (!this.app.erPlan()) return;
    if (!this._ny) this._ny = [];
    const fest = this._fest(latlng);
    this._ny.push({ lat: fest ? fest.lat : latlng.lat, lon: fest ? fest.lon : latlng.lng, fest });
    this.app.status(`${this._ny.length} punkt${fest ? ' – festet til ' + (fest.trase ? 'traseen' : fest.kode) : ''}. `
      + 'Dobbeltklikk eller Enter avslutter, tilbaketasten tar bort det siste, Esc avbryter.');
    Kart.tegnRor();
  },

  /**
   * Et rør å feste til nær klikket: et punkt på en annen trase i dette
   * anlegget (greining), eller et målt punkt på et innmålt rør i et annet
   * anlegg (påkobling). Det nærmeste innen fjorten skjermpunkt vinner.
   */
  _fest(latlng) {
    const app = this.app, tol = RorUI._toleranse(latlng);
    let best = null;
    const prov = (lat, lon, mer) => {
      const d = Kart.kart.distance(latlng, L.latLng(lat, lon));
      if (d <= tol && (!best || d < best.d)) best = Object.assign({ d, lat, lon }, mer);
    };
    for (const t of this.plan().traseer) for (const p of t.punkter) prov(p.lat, p.lon, { trase: t.id, punkt: p.id });
    for (const a of app.P.anlegg) {
      if (a.type !== 'ror' || a.id === app.P.aktivt || !a.ror || a.ror.plan) continue;
      const b = Ror.byggLinjer(a.ror, a.mal || Ror.StandardRormal, Ror.lagTilXY(a.ror.sone, a.ror.sone));
      for (const l of b.linjer) {
        for (const p of l.punkter) {
          const [lat, lon] = Ror.tilLatLon(p, a.ror.sone);
          prov(lat, lon, { anlegg: a.id, punkt: p.id, topp: p.z, kode: p.kode, koder: a.ror.koder });
        }
      }
    }
    return best;
  },

  /** Tilbaketasten: det siste punktet bort. */
  angreSiste() {
    if (!this._ny || !this._ny.length) return;
    this._ny.pop();
    Kart.tegnRor();
  },

  /** Esc, eller et annet verktøy: traseen som tegnes, forkastes. */
  avbryt() {
    if (this._ny && this._ny.length) this.app.status('Traseen ble ikke lagret');
    this._ny = null;
  },

  /** Dobbeltklikk eller Enter: traseen er ferdig – velg rørene i den. */
  avsluttTrase() {
    const ny = this._ny;
    if (!ny || ny.length < 2) { this.app.status('En trase trenger minst to punkt'); return; }
    this._ny = null;
    Kart.settModus('rediger');
    const fest = [ny[0].fest, ny[ny.length - 1].fest].find(f => f && f.kode);
    this.rorDialog({
      tittel: 'Rør i traseen', flere: true, notis: `${ny.length} punkt.`,
      rader: [{ kode: (fest && fest.kode) || this._sistKode || '', side: 0, regel: '' }],
      lagre: rader => this.lagreTrase(ny, rader),
      avbrutt: () => this.app.status('Traseen ble ikke lagret')
    });
  },

  /** Kodene i de andre røranleggene – forslag når man skriver en kode. */
  _andreKoder() {
    const ut = [];
    for (const a of this.app.P.anlegg) {
      if (a.type !== 'ror' || a.id === this.app.P.aktivt || !a.ror) continue;
      for (const [k, v] of Object.entries(a.ror.koder || {})) if (v.form !== 'punkt') ut.push(k);
    }
    return ut;
  },

  /**
   * Dialogen for rør: kode, sideavstand og regel – én rad per rør. Brukes for
   * en ny trase (flere rør), et nytt rør i en trase og «Endre».
   */
  rorDialog(o) {
    const app = this.app, koder = app.P.ror.koder;
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = o.tittel;
    const forslag = [...new Set(Object.keys(koder).filter(k => koder[k].form !== 'punkt').concat(this._andreKoder()))];
    let nr = 0;
    const rad = x => {
      nr++;
      return `<div class="planrad"><label for="pk${nr}">Kode</label>`
        + `<input id="pk${nr}" class="plankode" list="planKodeliste" value="${escapeAttr(x.kode || '')}" placeholder="f.eks. SP 160PE">`
        + `<label for="ps${nr}">Side</label><input id="ps${nr}" class="minitall planside" type="number" step="0.1" value="${x.side || 0}"> m`
        + `<label for="pr${nr}">Regel</label><select id="pr${nr}" class="minivalg planregel">`
        + ['', 'selvfall', 'trykk'].map(v => `<option value="${v}"${(x.regel || '') === v ? ' selected' : ''}>${v || 'fra koden'}</option>`).join('')
        + '</select>' + (o.flere ? ' <button class="minilenke planfjern" title="Ta bort røret">×</button>' : '') + '</div>';
    };
    innhold.innerHTML = `<p class="notis">${escapeHtml(o.notis || '')} Sideavstanden er fra traseen, positiv til høyre i `
      + 'tegneretningen. Regelen kommer av koden: selvfall for spillvann, overvann og drens, trykk for vann og kabel.</p>'
      + `<datalist id="planKodeliste">${forslag.map(k => `<option value="${escapeAttr(k)}">`).join('')}</datalist>`
      + `<div id="planRader">${o.rader.map(rad).join('')}</div>`
      + (o.flere ? '<div class="knapperad"><button class="knapp" id="planNyRad">+ Rør</button></div>' : '')
      + '<div class="knapperad" style="justify-content:flex-end"><button class="knapp" id="planAvbryt">Avbryt</button>'
      + '<button class="knapp primaer" id="planLagre">Lagre</button></div>';
    const koble = () => {
      for (const b of innhold.querySelectorAll('.planfjern')) {
        b.onclick = () => { if (innhold.querySelectorAll('.planrad').length > 1) b.closest('.planrad').remove(); };
      }
    };
    koble();
    if (o.flere) {
      innhold.querySelector('#planNyRad').onclick = () => {
        innhold.querySelector('#planRader').insertAdjacentHTML('beforeend', rad({ kode: '', side: 0, regel: '' }));
        koble();
      };
    }
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#planAvbryt').onclick = () => { lukk(); if (o.avbrutt) o.avbrutt(); };
    innhold.querySelector('#planLagre').onclick = () => {
      const rader = [...innhold.querySelectorAll('.planrad')].map(d => ({
        kode: d.querySelector('.plankode').value.trim(),
        side: RorPlan.klem('side', d.querySelector('.planside').value),
        regel: d.querySelector('.planregel').value || null
      })).filter(x => x.kode);
      if (!rader.length) { app.status('Skriv koden til minst ett rør'); return; }
      lukk();
      o.lagre(rader);
    };
    boks.classList.remove('skjult');
  },

  /**
   * Lagrer en ny trase med rørene. Endene som traff noe, festes: til en annen
   * trase som grein, til et innmålt rør som låst høyde på røret med samme kode
   * (ellers det første) – med kilden, så merknadene kan si fra om den endres.
   */
  lagreTrase(punkter, rader) {
    const app = this.app, r = app.P.ror, plan = r.plan;
    app.merk('ny trase');
    // den første traseen bestemmer sonen punktene tegnes i
    if (!plan.traseer.length) r.sone = Geo.sone(punkter[0].lon);
    const brukt = RorPlan.alleIder(plan);
    const ny = id => { brukt.add(id); return id; };
    const t = { id: ny(RorPlan.nyId(brukt, 't')), punkter: [] };
    for (const p of punkter) t.punkter.push({ id: ny(RorPlan.nyId(brukt, 'p')), lat: p.lat, lon: p.lon });
    plan.traseer.push(t);
    r.koder = Ror.koderFra(rader.map(x => ({ kode: x.kode })), r.koder);
    const nye = rader.map(x => {
      const ror = { id: ny(RorPlan.nyId(brukt, 'r')), trase: t.id, kode: x.kode, side: x.side || 0, regel: x.regel, motsatt: false };
      plan.ror.push(ror);
      return ror;
    });
    for (const [i, ende] of [[0, 'start'], [punkter.length - 1, 'slutt']]) {
      const f = punkter[i].fest;
      if (!f) continue;
      if (f.trase) { plan.greiner.push({ trase: t.id, ende, til: { trase: f.trase, punkt: f.punkt } }); continue; }
      const k = RorPlan.kodeAv(f.koder, f.kode);
      if (!(k.dim > 0)) { app.status(`Påkoblingen har koden ${f.kode} uten dimensjon – høyden ble ikke hentet`); continue; }
      const ror = nye.find(x => x.kode === f.kode) || nye[0];
      plan.laast.push({ ror: ror.id, punkt: t.punkter[i].id, bunn: +RorPlan.bunnFraTopp(f.topp, k).toFixed(3),
        kilde: { anlegg: f.anlegg, punkt: f.punkt, topp: f.topp } });
    }
    this._sistKode = rader[rader.length - 1].kode;
    RorUI.valgt = nye[0].id;
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Traseen er lagret med ${nye.length} rør – høydene kommer når terrenget er hentet`);
  },
```

- [ ] **Steg 4: Kartet** – i `ui-kart.js`:
  1. `init`: klikk holdes igjen for dobbeltklikk også i `'tegnTrase'`: `if (this.modus !== 'tegn' && this.modus !== 'tegnTomt' && this.modus !== 'tegnTrase')`; og dobbeltklikket: `else if (this.modus === 'tegnTrase') RorPlanUI.avsluttTrase();`
  2. `klikk`, først:

```js
    if (this.modus === 'tegnTrase') { RorPlanUI.tegnKlikk(e.latlng); return; }
    if (this.modus === 'kum' || this.modus === 'snuTrase') { RorPlanUI.kartklikk(this.modus, e.latlng); return; }
```

     og i `'tegn'`-greina for rør: `if (this.app.erPlan()) { this.settModus('tegnTrase'); RorPlanUI.tegnKlikk(e.latlng); return; }` før meldingen om at rørene ikke tegnes for hånd.
  3. `tegnRor`: til slutt `if (r.plan) this.tegnPlan(r, bygg, res, ll);`, og den nye metoden (resten kommer i oppgave 9):

```js
  /**
   * Et tegnet anlegg: rørene uten høyder ennå, og traseen som tegnes nå.
   * Traseene, punktene, kummene og varslene kommer i oppgave 9.
   */
  tegnPlan(r, bygg, res, ll) {
    const lag = this.lag.ror;
    // før terrenget er hentet har ingen rør høyder – de tegnes stiplet
    for (const u of bygg.utenHoyde || []) {
      const k = r.koder[u.kode] || Ror.tolkKode(u.kode);
      L.polyline(u.punkter.map(q => ll(q)), { color: Farger.ror(k.farge), weight: 3, opacity: 0.8, dashArray: '6 5' })
        .bindTooltip(`${escapeHtml(u.kode)} · ${u.grunn === 'dimensjon' ? 'mangler dimensjon – ingen høyder'
          : 'høydene kommer når terrenget er hentet'}`, { sticky: true })
        .addTo(lag);
    }
    const ny = RorPlanUI._ny;
    if (this.modus === 'tegnTrase' && ny && ny.length) {
      L.polyline(ny.map(p => [p.lat, p.lon]), { color: Farger.blekk, weight: 2, dashArray: '5 4', interactive: false,
        className: 'planskisse' }).addTo(lag);
      for (const p of ny) {
        L.circleMarker([p.lat, p.lon], { radius: p.fest ? 6 : 4, color: p.fest ? Farger.groft('strekning') : Farger.blekk,
          weight: 2, fillOpacity: 0.6, interactive: false }).addTo(lag);
      }
    }
  },
```

- [ ] **Steg 5: Tastene** – i `app.js`, i `keydown` etter Enter for tomta:

```js
      /* «Ny trase»: Enter avslutter, tilbaketasten tar bort det siste punktet.
         Esc går ut av verktøyet under, og da forkastes traseen. */
      if (Kart.modus === 'tegnTrase' && e.key === 'Enter') { e.preventDefault(); RorPlanUI.avsluttTrase(); return; }
      if (Kart.modus === 'tegnTrase' && e.key === 'Backspace') { e.preventDefault(); RorPlanUI.angreSiste(); return; }
```

- [ ] **Steg 6: Stilen** – i `app.css`, ved `.ror-objekt`:

```css
/* Tegnede rør: punktene på traseen, og radene i «Rør i traseen» */
.plan-punkt { width: 11px; height: 11px; border-radius: 50%; background: var(--flate); border: 2px solid var(--blekk); box-sizing: border-box; }
.plan-punkt.valgt { background: var(--data-skjaering); }
.planrad { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.planrad .plankode { width: 9em; }
```

- [ ] **Steg 7: Kjør** nettlesertesten (`planTegnTrase`, `planNyttAnlegg`, `rorKart`, `tomt`-prøvene som tegner med klikk) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Ny trase i kartet: klikk, feste til innmålte rør og traseer, og «Rør i traseen»».

---

### Oppgave 9: Redigere i kartet – flytte, sette inn og slette punkt, kum, snu, og alt tegnet

**Filer:**
- Endre: `public/js/ui-rorplan.js`, `public/js/ui-kart.js` (`tegnPlan`, punktene i `tegnRor` for «Grøft på strekning»), `public/js/app.js` (Delete), `public/js/ui-groft.js` (`kartklikk`: ikke mellompunkt), `public/js/ui-ror3d.js` (stakene: ikke mellompunkt), `public/js/nettlesertest.js`

**Grensesnitt:**
- Produserer: `RorPlanUI.kartklikk(modus, latlng)`, `RorPlanUI._velgRor(ror, tittel, valgt)`, `RorPlanUI._vekslKum(ror, punkt)`, `RorPlanUI._naermestePunkt(latlng, tol)`, `RorPlanUI._naermesteTrase(latlng, tol)`, `RorPlanUI.flyttPunkt(tid, pid, latlng)`, `RorPlanUI.settInnPaaTrase(tid, latlng) → punkt-id`, `RorPlanUI.velgPunkt(tid, pid)`, `RorPlanUI.slettValgt()`, `RorPlanUI.slettPunkt(tid, pid)`.

- [ ] **Steg 1: Prøven** – inn i lista etter `'planTegnTrase'`:

```js
  /** Redigering i kartet: punktene, kummen, sette inn og slette, og snu fallretningen. */
  async planRediger() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        const { ll } = await this._planProsjekt();
        const plan = App.P.ror.plan, t = plan.traseer[0];
        Kart.kart.setView(ll(40, 0), 18);
        Kart.settModus('rediger');
        let punkter = 0, kummer = 0;
        Kart.lag.ror.eachLayer(l => {
          if (l.options && l.options.draggable) punkter++;
          if (l.options && l.options.className === 'plankum') kummer++;
        });
        this.sjekk('tracepunktene kan dras', punkter === 3, String(punkter));
        this.sjekk('kummen tegnes', kummer === 1, String(kummer));
        App.merk('flyttet tracepunkt');
        RorPlanUI.flyttPunkt('t1', 'p3', ll(80, 20));
        this.sjekk('punktet er flyttet', Math.abs(t.punkter[2].lat - ll(80, 20).lat) < 1e-12);
        const nytt = RorPlanUI.settInnPaaTrase('t1', ll(20, 0.3));
        this.sjekk('et punkt satt inn på traseen', t.punkter.length === 4 && t.punkter[1].id === nytt);
        RorPlanUI._vekslKum(plan.ror[0], 'p2');
        this.sjekk('kummen tas bort når den finnes', plan.kummer.length === 0);
        RorPlanUI._vekslKum(plan.ror[0], 'p2');
        this.sjekk('og settes på igjen med anleggets diameter', plan.kummer.length === 1 && plan.kummer[0].diameter === 1000);
        RorPlanUI.velgPunkt('t1', 'p2');
        RorPlanUI.slettValgt();
        this.sjekk('punktet er slettet, og kummen på det', t.punkter.length === 3 && plan.kummer.length === 0);
        RorPlanUI.kartklikk('snuTrase', ll(50, 10.15));
        this.sjekk('fallretningen er snudd for begge rørene', plan.ror.every(x => x.motsatt === true));
        await App.angre();
        this.sjekk('angre snur den tilbake', App.P.ror.plan.ror.every(x => x.motsatt === false));
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: «tracepunktene kan dras» rød (0).

- [ ] **Steg 3: `ui-rorplan.js`** – inn i objektet:

```js
  /* ---------------- redigering i kartet ---------------- */

  /** Klikk med «Kum» eller «Snu fallretning». */
  kartklikk(modus, latlng) {
    const app = this.app;
    if (!app.erPlan()) return;
    const plan = this.plan(), tol = RorUI._toleranse(latlng);
    if (modus === 'kum') {
      const p = this._naermestePunkt(latlng, tol);
      if (!p) { app.status('Klikk på et punkt på en trase'); return; }
      const ror = plan.ror.filter(x => x.trase === p.trase);
      if (!ror.length) { app.status('Traseen har ingen rør'); return; }
      if (ror.length === 1) this._vekslKum(ror[0], p.punkt);
      else this._velgRor(ror, 'Hvilket rør er kummen på?', x => this._vekslKum(x, p.punkt));
      return;
    }
    if (modus === 'snuTrase') {
      const t = this._naermesteTrase(latlng, tol);
      if (!t) { app.status('Klikk på en trase'); return; }
      app.merk('snudde fallretningen');
      for (const x of plan.ror) if (x.trase === t.id) x.motsatt = !x.motsatt;
      app.tegnAlt();
      app.planlegg(30);
      app.status('Fallretningen er snudd for rørene i traseen');
    }
  },

  /** Et valg mellom rørene i en trase – selvfall først, det er dem kummene står på. */
  _velgRor(ror, tittel, valgt) {
    const koder = this.app.P.ror.koder;
    const selv = x => (RorPlan.regel(x, RorPlan.kodeAv(koder, x.kode)) === 'selvfall' ? 0 : 1);
    const sortert = ror.slice().sort((a, b) => selv(a) - selv(b));
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = tittel;
    innhold.innerHTML = '<div class="knapperad">' + sortert.map((x, i) =>
      `<button class="knapp${i === 0 ? ' primaer' : ''}" data-planvelg="${escapeAttr(x.id)}">${escapeHtml(x.kode)}</button>`).join('')
      + '</div>';
    for (const b of innhold.querySelectorAll('[data-planvelg]')) {
      b.onclick = () => { boks.classList.add('skjult'); valgt(ror.find(x => x.id === b.dataset.planvelg)); };
    }
    boks.classList.remove('skjult');
  },

  /** Kum på et rør i et punkt – av om den finnes, på om den ikke gjør det. */
  _vekslKum(ror, punkt) {
    const app = this.app, plan = this.plan();
    const i = plan.kummer.findIndex(k => k.ror === ror.id && k.punkt === punkt);
    if (i >= 0) {
      app.merk('tok bort kum');
      plan.kummer.splice(i, 1);
      app.status('Kummen er tatt bort');
    } else {
      app.merk('ny kum');
      const id = RorPlan.nyId(RorPlan.alleIder(plan), 'k');
      plan.kummer.push({ id, ror: ror.id, punkt, diameter: app.P.mal.plan.kum.diameter });
      app.status(`Kum ${id} på ${ror.kode} – bunnløpet følger overdekningen til det låses i profilen`);
    }
    app.tegnAlt();
    app.planlegg(30);
  },

  /** Nærmeste tracepunkt innen toleransen. */
  _naermestePunkt(latlng, tol) {
    let best = null;
    for (const t of this.plan().traseer) {
      for (const p of t.punkter) {
        const d = Kart.kart.distance(latlng, L.latLng(p.lat, p.lon));
        if (d <= tol && (!best || d < best.d)) best = { trase: t.id, punkt: p.id, d };
      }
    }
    return best;
  },

  /** Nærmeste trase innen toleransen – målt til strekene i regnesonen. */
  _naermesteTrase(latlng, tol) {
    const sone = this.app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    let best = null;
    for (const t of this.plan().traseer) {
      const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
      for (let i = 1; i < xy.length; i++) {
        const d = Ror.avstandTilStrekk(u, xy[i - 1], xy[i]);
        if (d <= tol && (!best || d < best.d)) best = { t, d };
      }
    }
    return best ? best.t : null;
  },

  /**
   * Et tracepunkt er flyttet. Greiner festet til punktet følger med – også i
   * greinas eget endepunkt, så festet kan slippes uten at greina hopper.
   */
  flyttPunkt(tid, pid, latlng) {
    const plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    const p = t && t.punkter.find(x => x.id === pid);
    if (!p) return;
    p.lat = latlng.lat; p.lon = latlng.lng;
    /* Drar man en ende som er festet til en annen trase, slippes festet –
       ellers ville enden hoppet tilbake til punktet den var festet til. */
    const i = t.punkter.indexOf(p), ende = i === 0 ? 'start' : i === t.punkter.length - 1 ? 'slutt' : null;
    if (ende && plan.greiner.some(g => g.trase === tid && g.ende === ende)) {
      plan.greiner = plan.greiner.filter(g => !(g.trase === tid && g.ende === ende));
      this.app.status('Festet til den andre traseen er sluppet');
    }
    for (const g of plan.greiner) {
      if (g.til.trase !== tid || g.til.punkt !== pid) continue;
      const gt = plan.traseer.find(x => x.id === g.trase);
      const ende = gt && gt.punkter[g.ende === 'start' ? 0 : gt.punkter.length - 1];
      if (ende) { ende.lat = p.lat; ende.lon = p.lon; }
    }
  },

  /** Setter inn et punkt der traseen er nærmest klikket – på linja, så rørene ligger der de lå. */
  settInnPaaTrase(tid, latlng) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return null;
    const sone = app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
    let best = null;
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1], b = xy[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const s = L2 > 0 ? Math.max(0, Math.min(1, ((u.x - a.x) * dx + (u.y - a.y) * dy) / L2)) : 0;
      const q = { x: a.x + dx * s, y: a.y + dy * s }, d = Math.hypot(u.x - q.x, u.y - q.y);
      if (!best || d < best.d) best = { i, q, d };
    }
    app.merk('satte inn tracepunkt');
    const id = RorPlan.nyId(RorPlan.alleIder(plan), 'p');
    const g = Geo.fraUtm(best.q.x, best.q.y, sone);
    t.punkter.splice(best.i, 0, { id, lat: g.lat, lon: g.lon });
    app.tegnAlt();
    app.planlegg(30);
    return id;
  },

  /** Velger et tracepunkt – Delete tar det bort. */
  velgPunkt(tid, pid) {
    this.valgt = { trase: tid, punkt: pid };
    this.app.status('Punktet er valgt – Delete tar det bort, dra det for å flytte');
    Kart.tegnRor();
  },

  slettValgt() {
    if (this.valgt) this.slettPunkt(this.valgt.trase, this.valgt.punkt);
    this.valgt = null;
  },

  /**
   * Tar bort et tracepunkt – og det som står på det: kummer og låste høyder.
   * Greiner festet til punktet slippes; endepunktet deres blir stående der det
   * var. En trase kan ikke ha færre enn to punkt.
   */
  slettPunkt(tid, pid) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return;
    if (t.punkter.length <= 2) { app.status('En trase trenger minst to punkt – slett traseen i Rør-fanen'); return; }
    const i = t.punkter.findIndex(x => x.id === pid);
    if (i < 0) return;
    app.merk('slettet tracepunkt');
    t.punkter.splice(i, 1);
    const rorHer = new Set(plan.ror.filter(x => x.trase === tid).map(x => x.id));
    const for0 = [plan.kummer.length, plan.laast.length, plan.greiner.length];
    plan.kummer = plan.kummer.filter(k => !(rorHer.has(k.ror) && k.punkt === pid));
    plan.laast = plan.laast.filter(l => !(rorHer.has(l.ror) && l.punkt === pid));
    plan.greiner = plan.greiner.filter(g => !(g.til.trase === tid && g.til.punkt === pid)
      && !(g.trase === tid && ((g.ende === 'start' && i === 0) || (g.ende === 'slutt' && i === t.punkter.length))));
    const borte = [[for0[0] - plan.kummer.length, 'kum', 'kummer'], [for0[1] - plan.laast.length, 'låst høyde', 'låste høyder'],
      [for0[2] - plan.greiner.length, 'feste', 'fester']].filter(x => x[0]).map(x => `${x[0]} ${x[0] === 1 ? x[1] : x[2]}`);
    app.status('Punktet er slettet' + (borte.length ? ' – sammen med ' + borte.join(', ') : ''));
    if (this.valgt && this.valgt.punkt === pid) this.valgt = null;
    app.tegnAlt();
    app.planlegg(30);
  },
```

- [ ] **Steg 4: Kartet** – `tegnPlan` i `ui-kart.js` får resten, mellom rørene uten høyder og skissen:

```js
    const app = this.app, plan = r.plan, rediger = this.modus === 'rediger';
    // traseene: tynn midtlinje – i Rediger setter et klikk på den inn et punkt
    for (const t of plan.traseer) {
      const linje = L.polyline(t.punkter.map(p => [p.lat, p.lon]),
        { color: Farger.blekkSvak, weight: 1.5, opacity: 0.9, dashArray: '2 4', className: 'plantrase' }).addTo(lag);
      linje.on('click', e => {
        if (!rediger) return;
        L.DomEvent.stop(e);
        if (RorPlanUI.settInnPaaTrase(t.id, e.latlng)) app.status('Satte inn et punkt – dra det dit du vil ha knekken');
      });
      for (const p of t.punkter) {
        const valgt = RorPlanUI.valgt && RorPlanUI.valgt.punkt === p.id;
        const m = L.marker([p.lat, p.lon], {
          draggable: rediger, keyboard: false,
          icon: L.divIcon({ className: '', html: `<div class="plan-punkt${valgt ? ' valgt' : ''}"></div>`, iconSize: [11, 11], iconAnchor: [5.5, 5.5] })
        }).addTo(lag);
        if (!rediger) continue;
        m.on('dragstart', () => app.merk('flyttet tracepunkt'));
        m.on('drag', ev => { RorPlanUI.flyttPunkt(t.id, p.id, ev.latlng); linje.setLatLngs(t.punkter.map(q => [q.lat, q.lon])); });
        m.on('dragend', () => { app.tegnAlt(); app.planlegg(30); });
        m.on('click', () => RorPlanUI.velgPunkt(t.id, p.id));
      }
    }
    // kummene i riktig størrelse
    for (const k of bygg.kummer || []) {
      L.circle(Ror.tilLatLon(k, r.sone), { radius: (k.diameter / 1000 + 0.2) / 2, color: Farger.blekk, weight: 1.5,
        fillColor: Farger.flate, fillOpacity: 0.9, className: 'plankum' })
        .bindTooltip(`Kum ${escapeHtml(k.id)} · Ø${k.diameter} · bunnløp ${Rapport.tall(k.bunnlop, 2)} · `
          + `dybde ${Rapport.tall(k.terreng - k.bunnlop, 2)} m`).addTo(lag);
    }
    // låste høyder og påkoblinger – hvite er hentet fra et annet rør
    for (const c of bygg.kontroll || []) {
      if (!c.laast && !c.fra) continue;
      const g = Geo.fraUtm(c.x, c.y, app.sone);
      L.circleMarker([g.lat, g.lon], { radius: 4, color: '#0b0b0c', weight: 1.5, fillColor: c.kilde || c.fra ? '#ffffff' : Farger.blekk,
        fillOpacity: 1, interactive: false }).addTo(lag);
    }
    // varslene fra kontrollene – fargen står aldri alene: teksten følger med
    if (res && res.plan) {
      for (const v of res.merknader) {
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
        const g = Geo.fraUtm(v.x, v.y, res.sone);
        L.circleMarker([g.lat, g.lon], { radius: 8, color: Farger.skjaering, weight: 2.5, fill: false, className: 'planvarsel' })
          .bindTooltip(escapeHtml(v.tekst), { sticky: true }).addTo(lag);
      }
    }
```

  og i `tegnRor`, der punktene vises for «Grøft på strekning»: et tegnet anlegg har ingen målte punkt – da er det knekkpunktene på linjene som kan velges:

```js
      const kilde = r.plan ? bygg.linjer.flatMap(l => l.punkter.filter(p => !p.mellom)) : r.punkter;
      for (const p of kilde) {
```

  (`paaRor` tar heller ikke med mellompunkt: `l.punkter.filter(p => !p.mellom).map(p => p.id)`.)
- [ ] **Steg 5: Delete** – i `app.js`, i `keydown` etter tastene for «Ny trase»:

```js
      if (e.key === 'Delete' && this.erPlan() && RorPlanUI.valgt) { e.preventDefault(); RorPlanUI.slettValgt(); return; }
```

- [ ] **Steg 6: Mellompunktene andre steder, og zoomen** –
  1. `GroftUI.kartklikk`, `'groftStrekning'`: `for (const p of l.punkter) { if (p.mellom) continue; … }`.
  2. `GroftUI.kartklikk`, `'groftSammen'`: punktet som står for røret må være et knekkpunkt – justeringene lagres mot id-er, og mellompunktene endrer seg med terrenget:

```js
          // et tegnet trykkrør har mellompunkt – gå til nærmeste knekkpunkt bakover
          let pi = naerA ? i - 1 : i;
          while (pi > 0 && l.punkter[pi].mellom) pi--;
          const p1 = l.punkter[pi], p2 = l.punkter[naerA ? i : i - 1];
```

     (resten som før: `delt(p1) && !delt(p2) ? p2 : p1`, og `p2` velges bare om det ikke er et mellompunkt).
  3. `Ror3d._overleggEkstra`, stakene: `if (l.punkter[i].mellom) return;` først i løkka.
  4. `Kart.zoomTilRor`: et tegnet anlegg har ingen målte punkt – rammen er tracepunktene:

```js
    const r = app.P.ror;
    const pkt = r.plan ? r.plan.traseer.flatMap(t => t.punkter.map(p => [p.lat, p.lon]))
      : r.punkter.map(p => Ror.tilLatLon(p, r.sone));
    if (!pkt.length) return;
    this.kart.fitBounds(L.latLngBounds(pkt), { padding: [40, 40], maxZoom: 19 });
```

     (vakten øverst blir `if (!app.erRor() || !app.P.ror) return;`).

- [ ] **Steg 7: Kjør** nettlesertesten (`planRediger`, `planTegnTrase`, `groftVerktoy`, `ror3d`) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Redigere traseer i kartet: flytte, sette inn og slette punkt, kummer, snu – og kummer, låste høyder og varsler tegnet».

---

### Oppgave 10: Rør-fanen og Koder-fanen for tegnede anlegg

**Filer:**
- Endre: `public/js/ui-rorplan.js` (`fyllFane`, `koble`, `kodeHtml`, `endreKode`), `public/js/rorplan.js` (`fallSpenn`), `public/js/ui-ror.js` (`_fyllFane`, `_fyllKoder`, `kodetabellHtml`, `lesKodetabell`), `public/css/app.css`, `test/rorplanprove.js`, `public/js/nettlesertest.js`

**Grensesnitt:**
- Produserer: `RorPlan.fallSpenn(kontroll, linje) → { min, maks } | null` (‰ i fallretningen, selvfall), `RorPlanUI.fyllFane(e, r, bygg, res)`, `RorPlanUI.kodeHtml(koder)`, `RorPlanUI.endreKode(input)`. Feltene i fanen: `planOverdekning`, `planKryss`, `planKumDiameter`, `planArbeidsrom`; knappene `data-plannytt`, `data-plantraseslett`, `data-planendre`, `data-plansnu`, `data-planslett`, `data-kumdiameter`, `data-kumslett`; tabellene `table.kumliste` og `table.plankoder` (felt `data-plan`).

- [ ] **Steg 1: Prøvene** – i `rorplanprove.js`:

```js
console.log('\n6. Fallet fra–til');
{
  const p = plan1([[0, 0], [50, 0], [100, 0]], [{ kode: 'SP 160PE' }], { laast: [{ ror: 'r1', punkt: 'p1', bunn: 8.0 },
    { ror: 'r1', punkt: 'p2', bunn: 7.5 }, { ror: 'r1', punkt: 'p3', bunn: 7.4 }] });
  const b = bygg(p, flatt);
  const f = RorPlan.fallSpenn(b.kontroll, b.linjer[0]);
  sjekk('minste fall', f.min, 2, 1e-9);
  sjekk('største fall', f.maks, 10, 1e-9);
  paastand('trykk har ikke fall', RorPlan.fallSpenn(b.kontroll, Object.assign({}, b.linjer[0], {
    plan: Object.assign({}, b.linjer[0].plan, { regel: 'trykk' }) })) === null);
}
```

  og i `nettlesertest.js`, inn i lista etter `'planRediger'`:

```js
  /** Rør-fanen og Koder-fanen for et tegnet anlegg. */
  async planFane() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        await this._planProsjekt();
        App.visFane('ror');
        const inn = document.getElementById('rorInnhold');
        this.sjekk('fanen viser traseen med begge rørene', /Trase 1/.test(inn.textContent)
          && /SP 160PE/.test(inn.textContent) && /VL 110PE/.test(inn.textContent));
        this.sjekk('og kumlista', !!inn.querySelector('table.kumliste') && /k1/.test(inn.querySelector('table.kumliste').textContent));
        this.sjekk('grøftedelen er med', !!inn.querySelector('#groftBunntillegg'));
        const od = inn.querySelector('#planOverdekning');
        od.value = '2.5';
        od.dispatchEvent(new Event('change'));
        this.sjekk('overdekningen lagres', App.P.mal.plan.overdekning === 2.5);
        clearTimeout(App._tidsavbrudd);
        await App.beregnRor();
        const sp = App.resultat.linjer.find(l => l.kode === 'SP 160PE');
        this.sjekk('og røret legges dypere', Math.abs(sp.punkter[0].z - 19.0) < 1e-6, String(sp.punkter[0].z));
        document.querySelector('#rorInnhold [data-plansnu="r1"]').click();
        this.sjekk('Snu snur røret', App.P.ror.plan.ror[0].motsatt === true);
        document.querySelector('#rorInnhold [data-planslett="r2"]').click();
        this.sjekk('Slett tar bort røret', App.P.ror.plan.ror.length === 1);
        await App.angre();
        this.sjekk('og angre gir det tilbake', App.P.ror.plan.ror.length === 2);
        App.visFane('koder');
        const gods = document.querySelector('#rorKoder table.plankoder input[data-plan="gods"]');
        this.sjekk('kodetabellen har planfeltene', !!gods);
        gods.value = '9.1';
        document.getElementById('rorKoder').dispatchEvent(Object.assign(new Event('change', { bubbles: true }), {}));
        gods.dispatchEvent(new Event('change', { bubbles: true }));
        this.sjekk('og godset lagres på koden', App.P.ror.koder[gods.closest('tr').dataset.kode].gods === 9.1);
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: `RorPlan.fallSpenn is not a function`, og i nettleseren «fanen viser traseen» rød.

- [ ] **Steg 3: `fallSpenn`** – i `rorplan.js`:

```js
  /** Fallet (‰) mellom kontrollpunktene på et selvfallsrør, i fallretningen – minste og største. */
  function fallSpenn(kontroll, l) {
    if (!l.plan || l.plan.regel !== 'selvfall') return null;
    const k = kontroll.filter(c => c.ror === l.id).sort((a, c) => a.s - c.s), f = [];
    for (let j = 1; j < k.length; j++) {
      const L = k[j].s - k[j - 1].s;
      if (L > 0.01) f.push(1000 * (l.plan.motsatt ? k[j].bunn - k[j - 1].bunn : k[j - 1].bunn - k[j].bunn) / L);
    }
    return f.length ? { min: Math.min(...f), maks: Math.max(...f) } : null;
  }
```

- [ ] **Steg 4: `ui-rorplan.js`** – Rør-fanen og kodene:

```js
  /* ---------------- Rør-fanen ---------------- */

  /** Rør-fanen for et tegnet anlegg: traseene med rørene, kumlista, kontrollene, grøfta og innstillingene. */
  fyllFane(e, r, bygg, res) {
    const app = this.app, plan = r.plan, mp = app.P.mal.plan, t = (v, d = 0) => Rapport.tall(v, d);
    const bf = (res && res.bakkefaktor) || 1;
    let tr = '';
    plan.traseer.forEach((tra, ti) => {
      tr += `<div class="rorgruppe"><div class="rorkode"><b>Trase ${ti + 1}</b><span class="notis">${tra.punkter.length} punkt</span>`
        + ` <button class="minilenke" data-plannytt="${escapeAttr(tra.id)}">+ Rør</button>`
        + ` <button class="minilenke" data-plantraseslett="${escapeAttr(tra.id)}">Slett traseen</button></div>`;
      for (const x of plan.ror.filter(y => y.trase === tra.id)) {
        const k = RorPlan.kodeAv(r.koder, x.kode), reg = RorPlan.regel(x, k);
        const l = (res ? res.linjer : bygg.linjer).find(y => y.id === x.id);
        const pr = res && res.profiler.get(x.id), gr = res && res.groft && res.groft.perLinje.get(x.id);
        const f = res && l ? RorPlan.fallSpenn(res.kontroll, l) : null;
        tr += `<div class="planror"><button class="rorlinje${x.id === RorUI.valgt ? ' aktiv' : ''}" data-linje="${escapeAttr(x.id)}">`
          + `<span class="rorfarge" style="background:${Farger.ror(k.farge)}" aria-hidden="true"></span> <b>${escapeHtml(x.kode)}</b>`
          + ` · ${reg}${x.motsatt ? ' (snudd)' : ''} · side ${t(x.side || 0, 1)} m`
          + (l ? ` · ${t(l.lengde * bf, 1)} m` : ' · ingen høyder ennå')
          + (f ? ` · fall ${Ror.spenn(f.min, f.maks, v => t(v, 1))} ‰` : '')
          + (pr ? ` · overdekning ${Ror.spenn(pr.minOverdekning, pr.maksOverdekning, v => t(v, 2))} m` : '')
          + (gr ? ` · graving ${t(gr.gravingLos + gr.sprengning)} m³` : '') + '</button>'
          + ` <button class="minilenke" data-planendre="${escapeAttr(x.id)}">Endre</button>`
          + ` <button class="minilenke" data-plansnu="${escapeAttr(x.id)}">Snu</button>`
          + ` <button class="minilenke" data-planslett="${escapeAttr(x.id)}">Slett</button></div>`;
      }
      tr += '</div>';
    });
    const kummer = (res && res.kummer) || bygg.kummer || [];
    const kumtabell = kummer.length
      ? '<table class="kumliste"><thead><tr><th scope="col">Kum</th><th scope="col">Rør</th><th scope="col">Ø mm</th>'
        + '<th scope="col">Terreng</th><th scope="col">Bunnløp</th><th scope="col">Dybde</th><th scope="col"><span class="sr-only">Slett</span></th></tr></thead><tbody>'
        + kummer.map(k => {
          const ror = plan.ror.find(x => x.id === k.ror), kid = escapeAttr(k.id);
          return `<tr><th scope="row">${escapeHtml(k.id)}</th><td>${escapeHtml(ror ? ror.kode : '?')}</td>`
            + `<td><label class="sr-only" for="kd_${kid}">Diameter for ${escapeHtml(k.id)}</label>`
            + `<input id="kd_${kid}" class="minitall" type="number" min="400" max="3000" step="100" value="${k.diameter}" data-kumdiameter="${kid}"></td>`
            + `<td>${t(k.terreng, 2)}</td><td>${t(k.bunnlop, 2)}</td><td>${t(k.terreng - k.bunnlop, 2)}</td>`
            + `<td><button class="minilenke" data-kumslett="${kid}">Slett</button></td></tr>`;
        }).join('') + '</tbody></table>'
      : '<p class="notis">Ingen kummer – sett dem med «◯ Kum» i kartet.</p>';
    const merk = (res ? res.merknader : []).map(m => `<li>${escapeHtml(m.tekst)}</li>`).join('');
    const felt = (id, navn, verdi, enhet, steg, min, maks) => `<div class="rorinnstilling"><label for="${id}">${navn}</label>`
      + `<input id="${id}" class="minitall" type="number" min="${min}" max="${maks}" step="${steg}" value="${verdi}"> ${enhet}</div>`;
    const s = res ? Ror.sammendrag(res) : null;
    e.innerHTML = `<h3>${escapeHtml(app.anlegg().navn || 'Planlagte rør')}</h3>
      <p class="notis">Tegnet i Massekalk · ${plan.traseer.length} ${plan.traseer.length === 1 ? 'trase' : 'traseer'}.
        Høydene ved kummer og låste punkt er bunn innvendig; frie punkt ligger med overdekningen under terrenget.</p>
      ${s ? `<div class="sumrad"><span>Rør</span><span class="verdi">${s.antall} · ${t(s.lengde)} m</span></div>` : ''}
      <h3>Traseene</h3>
      <div class="rorliste">${tr || '<p class="tomtekst">Ingen traseer ennå – tegn en med «✎ Ny trase» i kartet.</p>'}</div>
      <h3>Kummer</h3>${kumtabell}
      ${merk ? `<h3>Kontroller og merknader</h3><ul class="rormerknader">${merk}</ul>` : ''}
      ${GroftUI.html(r, res)}
      <h3>Innstillinger</h3>
      ${felt('planOverdekning', 'Overdekning til topp rør – frie punkt og varselgrense', mp.overdekning, 'm', 0.1, 0, 10)}
      ${felt('planKryss', 'Minste klaring der rør krysser', mp.kryssKlaring, 'm', 0.05, 0, 5)}
      ${felt('planKumDiameter', 'Diameter på nye kummer', mp.kum.diameter, 'mm', 100, 400, 3000)}
      ${felt('planArbeidsrom', 'Arbeidsrom rundt kummene', mp.kum.arbeidsrom, 'm', 0.1, 0, 3)}`;
    GroftUI.koble(e);
    this.koble(e);
  },

  /** Knappene og feltene i fanen. Hver endring går gjennom `merk`, så den kan angres. */
  koble(e) {
    const app = this.app, plan = this.plan(), mp = app.P.mal.plan;
    const ferdig = () => { app.tegnAlt(); app.planlegg(30); };
    const rorAv = id => plan.ror.find(x => x.id === id);
    for (const b of e.querySelectorAll('[data-linje]')) b.onclick = () => RorUI.velgLinje(b.dataset.linje);
    for (const b of e.querySelectorAll('[data-plannytt]')) {
      b.onclick = () => this.rorDialog({ tittel: 'Nytt rør i traseen', flere: true, notis: '', rader: [{ kode: this._sistKode || '', side: 0, regel: '' }],
        lagre: rader => {
          app.merk('nytt rør');
          app.P.ror.koder = Ror.koderFra(rader.map(x => ({ kode: x.kode })), app.P.ror.koder);
          const brukt = RorPlan.alleIder(plan);
          for (const x of rader) {
            const id = RorPlan.nyId(brukt, 'r');
            brukt.add(id);
            plan.ror.push({ id, trase: b.dataset.plannytt, kode: x.kode, side: x.side || 0, regel: x.regel, motsatt: false });
          }
          this._sistKode = rader[rader.length - 1].kode;
          ferdig();
        } });
    }
    for (const b of e.querySelectorAll('[data-planendre]')) {
      b.onclick = () => {
        const x = rorAv(b.dataset.planendre);
        if (!x) return;
        this.rorDialog({ tittel: 'Endre rør', flere: false, notis: '', rader: [{ kode: x.kode, side: x.side, regel: x.regel || '' }],
          lagre: ([ny]) => {
            app.merk('endret rør');
            app.P.ror.koder = Ror.koderFra([{ kode: ny.kode }], app.P.ror.koder);
            Object.assign(x, { kode: ny.kode, side: ny.side || 0, regel: ny.regel });
            ferdig();
          } });
      };
    }
    for (const b of e.querySelectorAll('[data-plansnu]')) {
      b.onclick = () => { const x = rorAv(b.dataset.plansnu); if (!x) return; app.merk('snudde røret'); x.motsatt = !x.motsatt; ferdig(); };
    }
    for (const b of e.querySelectorAll('[data-planslett]')) {
      b.onclick = () => {
        const id = b.dataset.planslett;
        app.merk('slettet rør');
        plan.ror = plan.ror.filter(x => x.id !== id);
        plan.kummer = plan.kummer.filter(k => k.ror !== id);
        plan.laast = plan.laast.filter(l => l.ror !== id);
        app.status('Røret er slettet – med kummene og de låste høydene på det');
        ferdig();
      };
    }
    for (const b of e.querySelectorAll('[data-plantraseslett]')) {
      b.onclick = async () => {
        const tid = b.dataset.plantraseslett, ror = new Set(plan.ror.filter(x => x.trase === tid).map(x => x.id));
        if (ror.size && !await app.bekreft(`Slette traseen med ${ror.size} rør? Du kan angre etterpå.`, 'Slett traseen')) return;
        app.merk('slettet trase');
        plan.traseer = plan.traseer.filter(x => x.id !== tid);
        plan.ror = plan.ror.filter(x => x.trase !== tid);
        plan.kummer = plan.kummer.filter(k => !ror.has(k.ror));
        plan.laast = plan.laast.filter(l => !ror.has(l.ror));
        plan.greiner = plan.greiner.filter(g => g.trase !== tid && g.til.trase !== tid);
        ferdig();
      };
    }
    for (const inp of e.querySelectorAll('[data-kumdiameter]')) {
      inp.onchange = () => {
        const k = plan.kummer.find(x => x.id === inp.dataset.kumdiameter), v = RorPlan.klem('diameter', inp.value);
        if (!k || v === null) { if (k) inp.value = k.diameter; return; }
        app.merk('endret kumdiameter');
        k.diameter = v;
        ferdig();
      };
    }
    for (const b of e.querySelectorAll('[data-kumslett]')) {
      b.onclick = () => { app.merk('slettet kum'); plan.kummer = plan.kummer.filter(k => k.id !== b.dataset.kumslett); ferdig(); };
    }
    const tall = (id, felt, sett) => {
      const inp = e.querySelector('#' + id);
      if (!inp) return;
      inp.onchange = () => {
        const v = RorPlan.klem(felt, inp.value);
        if (v === null) { app.status('Ugyldig tall – feltet er satt tilbake'); app.tegnAlt(); return; }
        app.merk('endret innstilling for planlagte rør');
        sett(v);
        ferdig();
      };
    };
    tall('planOverdekning', 'overdekning', v => { mp.overdekning = v; });
    tall('planKryss', 'kryssKlaring', v => { mp.kryssKlaring = v; });
    tall('planKumDiameter', 'diameter', v => { mp.kum.diameter = v; });
    tall('planArbeidsrom', 'arbeidsrom', v => { mp.kum.arbeidsrom = v; });
  },

  /** Planfeltene per kode. Tomt felt = standarden, som står som plassholder. */
  kodeHtml(koder) {
    const navn = { gods: 'Gods mm', regel: 'Regel', overdekning: 'Overdekning m', minFall: 'Minste fall ‰', maksFall: 'Største fall ‰' };
    const mp = this.app.P.mal.plan;
    const rader = Object.entries(koder).filter(([, k]) => k.form === 'linje').map(([kode, k], i) => {
      const uten = f => Object.assign({}, k, { [f]: undefined });
      const std = { gods: RorPlan.gods(uten('gods')), overdekning: RorPlan.overdekning(uten('overdekning'), mp),
        minFall: RorPlan.minFall(uten('minFall')), maksFall: '' };
      const tall = f => `<td><label class="sr-only" for="pl${i}${f}">${navn[f]} for ${escapeHtml(kode)}</label>`
        + `<input id="pl${i}${f}" class="minitall" type="number" min="0" step="any" data-plan="${f}" `
        + `value="${Number.isFinite(k[f]) ? k[f] : ''}" placeholder="${std[f]}"></td>`;
      const reg = `<td><label class="sr-only" for="pl${i}regel">Regel for ${escapeHtml(kode)}</label>`
        + `<select id="pl${i}regel" class="minivalg" data-plan="regel">`
        + [['', `fra systemet (${RorPlan.regel({}, uten('regel'))})`], ['selvfall', 'selvfall'], ['trykk', 'trykk']]
          .map(([v, tekst]) => `<option value="${v}"${(k.regel || '') === v ? ' selected' : ''}>${tekst}</option>`).join('')
        + '</select></td>';
      return `<tr data-kode="${escapeAttr(kode)}"><th scope="row">${escapeHtml(kode)}</th>${tall('gods')}${reg}`
        + `${tall('overdekning')}${tall('minFall')}${tall('maksFall')}</tr>`;
    }).join('');
    return '<h3>Planlagte rør per kode</h3><p class="notis">Tomt felt = standarden, som står som plassholder.</p>'
      + '<table class="rorkoder plankoder"><thead><tr><th scope="col">Kode</th>'
      + ['gods', 'regel', 'overdekning', 'minFall', 'maksFall'].map(f => `<th scope="col">${navn[f]}</th>`).join('')
      + `</tr></thead><tbody>${rader}</tbody></table>`;
  },

  /** Et planfelt i kodetabellen er endret. */
  endreKode(input) {
    const app = this.app, kode = input.closest('tr').dataset.kode, f = input.dataset.plan;
    const k = app.P.ror.koder[kode];
    if (!k) return;
    app.merk('endret kode for planlagte rør');
    if (f === 'regel') {
      if (input.value === 'selvfall' || input.value === 'trykk') k.regel = input.value; else delete k.regel;
    } else {
      const v = RorPlan.klem(f, input.value);
      if (v === null) delete k[f]; else k[f] = v;
    }
    app.tegnAlt();
    app.planlegg(30);
  },
```

- [ ] **Steg 5: `ui-ror.js`**:
  1. `_fyllFane`, øverst etter `if (!e) return;`: `if (r.plan) { RorPlanUI.fyllFane(e, r, bygg, res); return; }`
  2. `kodetabellHtml(koder, antall, enhet = 'Punkt')` – kolonneoverskriften er `enhet`.
  3. `lesKodetabell`: utvalget blir `'table.rorkoder:not(.groftkoder):not(.plankoder) tr[data-kode]'`.
  4. `_fyllKoder`:

```js
  _fyllKoder(r) {
    const e = document.getElementById('rorKoder');
    if (!e) return;
    // et tegnet anlegg teller rør per kode, et innmålt punkt
    const antall = {};
    if (r.plan) for (const x of r.plan.ror) antall[x.kode] = (antall[x.kode] || 0) + 1;
    else for (const p of r.punkter) antall[p.kode] = (antall[p.kode] || 0) + 1;
    e.innerHTML = '<p class="notis">Hva hver kode betyr. Endringene gjelder med en gang, og kan angres.</p>'
      + this.kodetabellHtml(r.koder, antall, r.plan ? 'Rør' : 'Punkt') + GroftUI.kodeHtml(r.koder)
      + (r.plan ? RorPlanUI.kodeHtml(r.koder) : '');
    e.onchange = ev => {
      const t = ev && ev.target && ev.target.closest ? ev.target : null;
      if (t && t.closest('table.groftkoder')) { GroftUI.endreKode(t); return; }
      if (t && t.closest('table.plankoder')) { RorPlanUI.endreKode(t); return; }
      this.app.merk('endret kode');
      r.koder = this.lesKodetabell(e, r.koder);
      this.app.tegnAlt();
      this.app.planlegg(30);
    };
  }
```

- [ ] **Steg 6: Stilen** – i `app.css`:

```css
table.kumliste { width: 100%; border-collapse: collapse; font-size: 12px; }
table.kumliste th, table.kumliste td { padding: 3px 4px; text-align: right; border-bottom: 1px solid var(--kant); }
table.kumliste th[scope="row"], table.kumliste td:nth-child(2) { text-align: left; }
.planror { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.planror .rorlinje { flex: 1 1 100%; text-align: left; }
```

- [ ] **Steg 7: Kjør** `node test/rorplanprove.js` og nettlesertesten (`planFane`, `rorFane`, `groftFane`, `groftKoder`, `rorKoder`) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Rør-fanen og Koder-fanen for tegnede anlegg: traseene, kumlista, innstillingene og planfeltene per kode».

---

### Oppgave 11: Lengdeprofilen – kontrollpunktene, fallet, varslene og redigeringen

**Filer:**
- Endre: `public/js/ui-rorprofil.js` (`init`, `dataFor`, `tegnPaa`, nye `_ned`, `_opp`), `public/js/ui-rorplan.js` (`punktfelt`, `laas`, `laasOpp`, `fallVidere`, `hentPaNytt`, `settInnVed`), `public/js/nettlesertest.js`

**Grensesnitt:**
- Konsumerer: `res.kontroll`, `res.kummer`, `res.merknader` (oppgave 6), `linje.plan` (oppgave 3).
- Produserer: `Rorprofil.dataFor(...)` får `plan: { …linje.plan, D, kontroll, varsler, kummer } | null`; `Rorprofil._skala = { X, Y, sAv, zAv, d }` (bare skjermens lerret); `RorPlanUI.punktfelt(rorId, punkt)` (feltene `ppBunn`, `ppFall`, knappene `ppLaas`, `ppLaasOpp`, `ppFallKnapp`, `ppHent`, `ppAvbryt`), `RorPlanUI.laas(rorId, punkt, bunn)`, `RorPlanUI.laasOpp(rorId, punkt)`, `RorPlanUI.fallVidere(rorId, punkt, fall, bunnHer)`, `RorPlanUI.hentPaNytt(rorId, punkt)`, `RorPlanUI.settInnVed(rorId, s) → punkt-id`.

- [ ] **Steg 1: Prøven** – inn i lista etter `'planFane'`:

```js
  /** Profilen til et tegnet rør: kontrollpunktene, punktfeltet, fall videre, klikk og dra. */
  async planProfil() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        await this._planProsjekt();
        RorUI.velgLinje('r1');
        const SP = RorPlan.kodeAv(App.P.ror.koder, 'SP 160PE');
        const data = () => Rorprofil.dataFor(App, App.resultat, App.resultat.linjer.find(x => x.id === 'r1'));
        this.sjekk('profilen får kontrollpunktene: endene og kummen', data().plan && data().plan.kontroll.length === 3);
        RorPlanUI.punktfelt('r1', 'p3');
        const felt = document.getElementById('ppBunn');
        this.sjekk('punktfeltet viser bunn innvendig', !!felt
          && Math.abs(parseFloat(felt.value) - RorPlan.bunnFraTopp(19.5, SP)) < 0.001, felt && felt.value);
        felt.value = '19.0';
        document.getElementById('ppLaas').click();
        this.sjekk('høyden er låst', App.P.ror.plan.laast.some(x => x.ror === 'r1' && x.punkt === 'p3' && x.bunn === 19));
        clearTimeout(App._tidsavbrudd);
        await App.beregnRor();
        RorPlanUI.punktfelt('r1', 'p1');
        document.getElementById('ppFall').value = '30';
        document.getElementById('ppFallKnapp').click();
        const L1 = App.P.ror.plan.laast.find(x => x.ror === 'r1' && x.punkt === 'p1');
        const L2 = App.P.ror.plan.laast.find(x => x.ror === 'r1' && x.punkt === 'p2');
        const k = App.resultat.kontroll.filter(c => c.ror === 'r1');
        const ds = k.find(c => c.punkt === 'p2').s - k.find(c => c.punkt === 'p1').s;
        this.sjekk('fall videre låser begge ender av strekket', !!L1 && !!L2 && Math.abs((L1.bunn - L2.bunn) / ds - 0.030) < 1e-4);
        clearTimeout(App._tidsavbrudd);
        await App.beregnRor();
        this.sjekk('og motfallet opp til p3 varsles', App.resultat.merknader.some(m => m.type === 'motfall' && m.linje === 'r1'));
        // klikk på et kontrollpunkt i profilen åpner punktfeltet; dra låser det lavere
        Rorprofil.tegn();
        const sk = Rorprofil._skala, c3 = data().plan.kontroll.find(c => c.punkt === 'p3');
        const rect = Rorprofil.lerret.getBoundingClientRect();
        const mus = (type, dy) => Rorprofil.lerret.dispatchEvent(new MouseEvent(type,
          { clientX: rect.left + sk.X(c3.s), clientY: rect.top + sk.Y(c3.topp) + dy, bubbles: true }));
        mus('mousedown', 0); mus('mouseup', 0);
        this.sjekk('klikk på et kontrollpunkt åpner punktfeltet', !document.getElementById('dialog').classList.contains('skjult')
          && !!document.getElementById('ppBunn'));
        document.getElementById('dialog').classList.add('skjult');
        mus('mousedown', 0); mus('mousemove', 25); mus('mouseup', 25);
        const L3 = App.P.ror.plan.laast.find(x => x.ror === 'r1' && x.punkt === 'p3');
        this.sjekk('dra ned låser det lavere, på hel centimeter', !!L3 && L3.bunn < 19 && Math.abs(L3.bunn * 100 - Math.round(L3.bunn * 100)) < 1e-9,
          L3 && String(L3.bunn));
        // for høyt: 1,35 m overdekning under grensen på 2,0
        RorPlanUI.laas('r1', 'p3', 20.0);
        clearTimeout(App._tidsavbrudd);
        await App.beregnRor();
        this.sjekk('for lite overdekning varsles', App.resultat.merknader.some(m => m.type === 'overdekning' && m.linje === 'r1'));
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: «profilen får kontrollpunktene» rød.

- [ ] **Steg 3: `dataFor`** – i objektet som returneres:

```js
      plan: res.plan && linje.plan ? Object.assign({}, linje.plan, {
        D: (kode.dim || 0) / 1000,
        kontroll: (res.kontroll || []).filter(c => c.ror === linje.id).sort((a, b) => a.s - b.s),
        varsler: (res.merknader || []).filter(m => m.linje === linje.id && ['overdekning', 'fall', 'motfall'].includes(m.type)),
        kummer: (res.kummer || []).filter(k => k.ror === linje.id)
      }) : null
```

- [ ] **Steg 4: `tegnPaa`**:
  1. `zmin` tar med kummene: `for (const km of (d.plan && d.plan.kummer) || []) zmin = Math.min(zmin, km.bunnlop - 0.4);`
  2. Rett etter røret (båndet og toppstreken), før de målte punktene:

```js
    /* ET TEGNET RØR: grensen for overdekningen, varslene, kummene og
       kontrollpunktene med bunnløpet – og fallet mellom dem for selvfall. */
    if (d.plan) {
      const pl = d.plan;
      k.strokeStyle = Farger.skjaering; k.lineWidth = 1; k.setLineDash([2, 4]);
      k.beginPath();
      let nede = false;
      for (const q of P) {
        if (!Number.isFinite(q.terreng)) { nede = false; continue; }
        const y = Y(q.terreng - pl.grense);
        if (nede) k.lineTo(X(q.s), y); else { k.moveTo(X(q.s), y); nede = true; }
      }
      k.stroke(); k.setLineDash([]);
      for (const v of pl.varsler) {
        k.fillStyle = Farger.skjaering; k.globalAlpha = 0.16;
        k.fillRect(X(v.fra), mt, Math.max(3, X(v.til) - X(v.fra)), hh);
        k.globalAlpha = 1;
      }
      for (const km of pl.kummer) {
        const c = pl.kontroll.find(x => x.kum === km.id);
        if (!c) continue;
        const halv = (km.diameter / 1000 + 0.2) / 2 / L * bb;
        k.strokeStyle = Farger.blekk; k.lineWidth = 1.2;
        k.strokeRect(X(c.s) - Math.max(2, halv), Y(km.terreng), 2 * Math.max(2, halv), Y(km.bunnlop - 0.25) - Y(km.terreng));
      }
      k.font = '10px ' + Farger.hent('skrift'); k.textAlign = 'center';
      for (const c of pl.kontroll) {
        const x = X(c.s), y = Y(c.topp);
        k.fillStyle = c.laast ? Farger.blekk : Farger.flate; k.strokeStyle = Farger.blekk; k.lineWidth = 1.5;
        k.beginPath();
        if (c.kum) k.rect(x - 4.5, y - 4.5, 9, 9);
        else if (c.laast || c.fra) { k.moveTo(x, y - 6); k.lineTo(x + 5, y + 3); k.lineTo(x - 5, y + 3); k.closePath(); }
        else k.arc(x, y, 4, 0, Math.PI * 2);
        k.fill(); k.stroke();
        k.fillStyle = Farger.blekk; k.textBaseline = 'top';
        k.fillText(Rapport.tall(c.bunn, 2), x, Y(c.topp - pl.D) + 4);
      }
      if (pl.regel === 'selvfall') {
        k.textBaseline = 'bottom';
        for (let j = 1; j < pl.kontroll.length; j++) {
          const a = pl.kontroll[j - 1], c = pl.kontroll[j], len = c.s - a.s;
          if (!(len > 0.01) || X(c.s) - X(a.s) < 34) continue;
          const fall = 1000 * (pl.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / len;
          k.fillStyle = fall < -0.05 ? Farger.skjaering : Farger.blekkSvak;
          k.fillText(`${Rapport.tall(fall, 1)} ‰`, (X(a.s) + X(c.s)) / 2, Y((a.topp + c.topp) / 2) - 6);
        }
      }
      k.font = '11px ' + Farger.hent('skrift');
    }
```

  3. Avlesningen: for et tegnet rør legges bunn innvendig til, og fallet der pekeren er:

```js
    const plantekst = d.plan ? ` · bunn innv. ${Rapport.tall(q.topp - d.plan.D + d.plan.gods / 1000, 2)}` + (() => {
      if (d.plan.regel !== 'selvfall') return '';
      const ks = d.plan.kontroll, j = ks.findIndex(c => c.s >= q.s);
      if (j <= 0) return '';
      const a = ks[j - 1], c = ks[j], len = c.s - a.s;
      return len > 0.01 ? ` · fall ${Rapport.tall(1000 * (d.plan.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / len, 1)} ‰` : '';
    })() : '';
```

     og `+ plantekst` på slutten av teksten som returneres (før `grofttekst`).
  4. Skalaen til skjermens lerret, rett før pekeren: `if (lerret === this.lerret) this._skala = { X, Y, sAv: px => (px - ml) / bb * L, zAv: py => zmaks - (py - mt) / hh * (zmaks - zmin), d };`
- [ ] **Steg 5: Musa** – i `init`, etter `mouseleave`:

```js
    /* Et tegnet rør redigeres her: klikk på et kontrollpunkt åpner
       punktfeltet, dra låser det på ny høyde, og klikk på røret mellom
       kontrollpunktene setter inn et punkt der. */
    this.lerret.addEventListener('mousedown', e => this._ned(e));
    this.lerret.addEventListener('mouseup', e => this._opp(e));
```

  og metodene:

```js
  _ned(e) {
    const sk = this._skala;
    this._dra = null; this._paRor = null;
    if (!sk || !sk.d || !sk.d.plan) return;
    const r = this.lerret.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const c = sk.d.plan.kontroll.find(x => Math.abs(sk.X(x.s) - mx) <= 7 && Math.abs(sk.Y(x.topp) - my) <= 9);
    if (c) { this._dra = { c, y0: my }; return; }
    const s = sk.sAv(mx), P = sk.d.profil.prover;
    const q = P.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
    if (Math.abs(sk.Y(q.topp) - my) <= 8) this._paRor = { s: q.s };
  },

  _opp(e) {
    const sk = this._skala, d = sk && sk.d;
    const r = this.lerret.getBoundingClientRect(), my = e.clientY - r.top;
    if (this._dra && d) {
      const { c, y0 } = this._dra;
      this._dra = null;
      if (Math.abs(my - y0) > 3) {
        const topp = sk.zAv(sk.Y(c.topp) + (my - y0));
        RorPlanUI.laas(d.linje.id, c.punkt, Math.round(RorPlan.bunnFraTopp(topp, d.kode) * 100) / 100);
      } else RorPlanUI.punktfelt(d.linje.id, c.punkt);
      return;
    }
    if (this._paRor && d) {
      const s = this._paRor.s;
      this._paRor = null;
      const pid = RorPlanUI.settInnVed(d.linje.id, s);
      if (pid) RorPlanUI.punktfelt(d.linje.id, pid);
    }
  },
```

- [ ] **Steg 6: `ui-rorplan.js`** – punktfeltet og det det gjør:

```js
  /* ---------------- høydene i profilen ---------------- */

  /**
   * Punktfeltet for et punkt på et tegnet rør: bunn innvendig, lås og lås opp,
   * for selvfall fallet videre, og «Hent på nytt» for en påkobling.
   */
  punktfelt(rorId, punkt) {
    const app = this.app, plan = this.plan(), res = app.resultat;
    const ror = plan.ror.find(x => x.id === rorId);
    if (!ror) return;
    const k = RorPlan.kodeAv(app.P.ror.koder, ror.kode);
    const L = plan.laast.find(x => x.ror === rorId && x.punkt === punkt);
    const kum = plan.kummer.find(x => x.ror === rorId && x.punkt === punkt);
    const c = res && res.kontroll ? res.kontroll.find(x => x.ror === rorId && x.punkt === punkt) : null;
    const l = res && res.linjer.find(x => x.id === rorId);
    const lp = l && l.punkter.find(p => p.id === rorId + ':' + punkt);
    const bunnNa = L ? L.bunn : c ? c.bunn : lp ? RorPlan.bunnFraTopp(lp.z, k) : NaN;
    const selvfall = RorPlan.regel(ror, k) === 'selvfall';
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = `${ror.kode} · ${kum ? 'kum ' + kum.id : 'punkt ' + punkt}`;
    innhold.innerHTML = `<p class="notis">${L ? (L.kilde ? 'Låst – hentet fra et innmålt rør.' : 'Låst.')
      : 'Fri – følger overdekningen under terrenget.'}</p>`
      + `<div class="rorinnstilling"><label for="ppBunn">Bunn innvendig</label><input id="ppBunn" class="minitall" type="number" step="0.01" `
      + `value="${Number.isFinite(bunnNa) ? bunnNa.toFixed(3) : ''}"> moh</div>`
      + (selvfall ? '<div class="rorinnstilling"><label for="ppFall">Fall videre i fallretningen</label>'
        + '<input id="ppFall" class="minitall" type="number" step="0.5" min="0"> ‰ <button class="knapp" id="ppFallKnapp">Sett</button></div>' : '')
      + '<div class="knapperad" style="justify-content:flex-end">'
      + (L && L.kilde ? '<button class="knapp" id="ppHent">Hent på nytt</button>' : '')
      + (L ? '<button class="knapp" id="ppLaasOpp">Lås opp</button>' : '')
      + '<button class="knapp" id="ppAvbryt">Avbryt</button><button class="knapp primaer" id="ppLaas">Lås</button></div>';
    const lukk = () => boks.classList.add('skjult');
    const tall = id => parseFloat(String(innhold.querySelector('#' + id).value).replace(',', '.'));
    innhold.querySelector('#ppAvbryt').onclick = lukk;
    innhold.querySelector('#ppLaas').onclick = () => {
      const v = tall('ppBunn');
      if (!Number.isFinite(v)) { app.status('Skriv bunn innvendig i meter over havet'); return; }
      lukk(); this.laas(rorId, punkt, v);
    };
    if (L) innhold.querySelector('#ppLaasOpp').onclick = () => { lukk(); this.laasOpp(rorId, punkt); };
    if (L && L.kilde) innhold.querySelector('#ppHent').onclick = () => { lukk(); this.hentPaNytt(rorId, punkt); };
    if (selvfall) {
      innhold.querySelector('#ppFallKnapp').onclick = () => { const f = tall('ppFall'); lukk(); this.fallVidere(rorId, punkt, f, tall('ppBunn')); };
    }
    boks.classList.remove('skjult');
  },

  /** Låser bunn innvendig i et punkt. En høyde man skriver selv, er ikke lenger hentet fra et annet rør. */
  laas(rorId, punkt, bunn) {
    const app = this.app, plan = this.plan();
    app.merk('låste høyde');
    this._settLaast(rorId, punkt, bunn);
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Bunn innvendig låst på ${Rapport.tall(bunn, 2)}`);
  },

  _settLaast(rorId, punkt, bunn) {
    const plan = this.plan(), ny = { ror: rorId, punkt, bunn: Math.round(bunn * 1000) / 1000 };
    const i = plan.laast.findIndex(x => x.ror === rorId && x.punkt === punkt);
    if (i >= 0) plan.laast[i] = ny; else plan.laast.push(ny);
  },

  laasOpp(rorId, punkt) {
    const app = this.app, plan = this.plan();
    app.merk('låste opp høyde');
    plan.laast = plan.laast.filter(x => !(x.ror === rorId && x.punkt === punkt));
    app.tegnAlt();
    app.planlegg(30);
    app.status('Høyden følger overdekningen igjen');
  },

  /**
   * Fall videre: låser dette punktet der det står, og neste kontrollpunkt i
   * fallretningen så fallet mellom dem blir det som er skrevet.
   */
  fallVidere(rorId, punkt, fall, bunnHer) {
    const app = this.app, res = app.resultat, ror = this.plan().ror.find(x => x.id === rorId);
    if (!Number.isFinite(fall)) { app.status('Skriv fallet i promille'); return; }
    const ktr = (res && res.kontroll ? res.kontroll : []).filter(c => c.ror === rorId).sort((a, b) => a.s - b.s);
    const j = ktr.findIndex(c => c.punkt === punkt);
    const neste = j < 0 || !ror ? null : ktr[ror.motsatt ? j - 1 : j + 1];
    if (!neste) { app.status('Ingen kontrollpunkt videre i fallretningen – sett en kum eller lås en høyde der først'); return; }
    const her = Number.isFinite(bunnHer) ? bunnHer : ktr[j].bunn;
    const bunnNeste = her - fall / 1000 * Math.abs(neste.s - ktr[j].s);
    app.merk('satte fall');
    this._settLaast(rorId, punkt, her);
    this._settLaast(rorId, neste.punkt, bunnNeste);
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Fall ${Rapport.tall(fall, 1)} ‰ – bunnløpet i neste kontrollpunkt er låst på ${Rapport.tall(bunnNeste, 2)}`);
  },

  /** Henter høyden i en påkobling på nytt fra det innmålte røret. */
  hentPaNytt(rorId, punkt) {
    const app = this.app, plan = this.plan();
    const L = plan.laast.find(x => x.ror === rorId && x.punkt === punkt);
    if (!L || !L.kilde) return;
    const a = app.P.anlegg.find(x => x.id === L.kilde.anlegg);
    const p = a && a.ror && !a.ror.plan ? a.ror.punkter.find(x => x.id === L.kilde.punkt) : null;
    if (!p) { app.status('Punktet røret er koblet på, finnes ikke lenger'); return; }
    app.merk('hentet påkoblingen på nytt');
    L.bunn = Math.round(RorPlan.bunnFraTopp(p.z, RorPlan.kodeAv(a.ror.koder, p.kode)) * 1000) / 1000;
    L.kilde.topp = p.z;
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Påkoblingen er hentet på nytt: bunn innvendig ${Rapport.tall(L.bunn, 2)}`);
  },

  /** Setter inn et tracepunkt der røret er i profilen – på stasjon s langs røret. */
  settInnVed(rorId, s) {
    const app = this.app, res = app.resultat, ror = this.plan().ror.find(x => x.id === rorId);
    const l = res && res.linjer.find(x => x.id === rorId);
    if (!ror || !l) return null;
    const st = RorPlan.stasjonering(l.xy);
    let i = 1;
    while (i < st.length - 1 && st[i] < s) i++;
    const a = l.xy[i - 1], b = l.xy[i], len = st[i] - st[i - 1], u = len > 0 ? (s - st[i - 1]) / len : 0;
    const g = Geo.fraUtm(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, res.sone);
    return this.settInnPaaTrase(ror.trase, L.latLng(g.lat, g.lon));
  },
```

- [ ] **Steg 7: Kjør** nettlesertesten (`planProfil`, `rorProfil`, `groftProfil`) · Ventet: grønne.

- [ ] **Steg 8: Commit** – «Profilen til et tegnet rør: kontrollpunktene, bunnløpet og fallet, varslene – og høydene redigert med klikk og dra».

---

### Oppgave 12: Rapport og PDF for tegnede anlegg

**Filer:**
- Endre: `public/js/ui-rapport.js` (`apneRorrapport`), `public/js/ui-pdfrapport.js` (`_rorinnhold`), `public/js/nettlesertest.js`

- [ ] **Steg 1: Prøven** – inn i lista etter `'planProfil'`:

```js
  /** Rapporten og PDF-en for et tegnet anlegg: kilden, regel og fall, kumlista. */
  async planRapport() {
    const foer = JSON.stringify(App.P);
    const gammel = Rapport.visRapport;
    let html = null;
    Rapport.visRapport = h => { html = h; };
    try {
      await this._medFlattTerreng(21.5, async () => {
        await this._planProsjekt();
        Rapport.apneRapport();
        this.sjekk('rapporten sier at rørene er tegnet', !!html && /Tegnet i Massekalk/.test(html));
        this.sjekk('rørtabellen har regel og fall', !!html && /selvfall/.test(html) && /trykk/.test(html) && /Fall ‰/.test(html));
        this.sjekk('og kumlista', !!html && /<h2>Kummer<\/h2>/.test(html) && /k1/.test(html));
        const bytes = await Pdfrapport.lag(false);
        const strommer = bytes ? await PdfImport.lesStrommer(bytes) : [];
        const innhold = strommer.map(s => (typeof s === 'string' ? s : new TextDecoder('latin1').decode(s))).join('\n');
        this.sjekk('PDF-en har kumlista', /KUMMER/.test(innhold));
        this.sjekk('og grøftemassene', /GR\\330FTEMASSER/.test(innhold));
      });
    } finally {
      Rapport.visRapport = gammel;
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Kjør** · Ventet: «rapporten sier at rørene er tegnet» rød.

- [ ] **Steg 3: HTML-rapporten** – i `apneRorrapport`:

```js
    const plan = !!r.plan;
    const kilder = plan ? `Tegnet i Massekalk · ${r.plan.traseer.length} ${r.plan.traseer.length === 1 ? 'trase' : 'traseer'}`
      : r.kilder.map(k => escapeHtml(Ror.kildetekst(k))).join('<br>');
```

  radene for et tegnet anlegg (kolonnene `#, Kode, Dim., Lengde, Regel, Fall ‰, Minste overdekning, Største, Merknad`):

```js
      if (plan) {
        const f = RorPlan.fallSpenn(res.kontroll, l);
        return `<tr><td>${i + 1}</td><td>${escapeHtml(l.kode)}</td><td>${k.dim ? '⌀' + k.dim : '–'}</td>`
          + `<td>${t(l.lengde * bf, 1)} m</td><td>${l.plan.regel}${l.plan.motsatt ? ' (snudd)' : ''}</td>`
          + `<td>${f ? Ror.spenn(f.min, f.maks, v => t(v, 1)) : '–'}</td><td>${od(pr.minOverdekning)}</td>`
          + `<td>${od(pr.maksOverdekning)}</td><td class="liten">${merk}</td></tr>`;
      }
```

  tabellhodet etter `plan`:

```js
<table><thead><tr><th>#</th><th>Kode</th><th>Dim.</th><th>Lengde</th>${plan ? '<th>Regel</th><th>Fall ‰</th>' : '<th>Punkt</th>'}
<th>Minste overdekning</th><th>Største</th><th>Merknad</th></tr></thead><tbody>${rader}
<tr class="sum"><td></td><td>Sum</td><td></td><td>${t(s.lengde, 1)} m</td>${plan ? '<td></td><td></td>' : '<td></td>'}<td>${od(s.minOd)}</td><td>${od(s.maksOd)}</td><td></td></tr>
</tbody></table>
```

  kilden: `<p class="liten">${kilder}<br>${plan ? 'Høydene ved kummer og låste punkt er bunn innvendig; frie punkt ligger ' + t(app.P.mal.plan.overdekning, 2) + ' m under terrenget.' : 'Punktene står i EUREF89 UTM' + r.sone + '.'}</p>`; og etter rørtabellen:

```js
    const kumliste = plan && res.kummer.length ? `
<h2>Kummer</h2>
<table><thead><tr><th>Kum</th><th>Rør</th><th>Ø mm</th><th>Terreng</th><th>Bunnløp</th><th>Dybde</th></tr></thead><tbody>
${res.kummer.map(km => { const ror = r.plan.ror.find(x => x.id === km.ror);
  return `<tr><td>${escapeHtml(km.id)}</td><td>${escapeHtml(ror ? ror.kode : '?')}</td><td>${km.diameter}</td>`
    + `<td>${t(km.terreng, 2)}</td><td>${t(km.bunnlop, 2)}</td><td>${t(km.terreng - km.bunnlop, 2)} m</td></tr>`; }).join('')}
</tbody></table>` : '';
```

  og `${kumliste}` inn rett etter rørtabellen.
- [ ] **Steg 4: PDF-en** – i `_rorinnhold`: kildelinja for et tegnet anlegg er `Tegnede rør · høydene ved kummer og låste punkt er bunn innvendig (NN2000)`; rørtabellen får `REGEL` og `FALL ‰` i stedet for `PUNKT`:

```js
    const plan = !!ror.plan;
    tabell([
      { tekst: '#', bredde: 18 }, { tekst: 'KODE', bredde: 110, venstre: true }, { tekst: 'DIM.', bredde: 40 },
      { tekst: 'LENGDE M', bredde: 58 },
      ...(plan ? [{ tekst: 'REGEL', bredde: 52, venstre: true }, { tekst: 'FALL ‰', bredde: 56 }] : [{ tekst: 'PUNKT', bredde: 44 }]),
      { tekst: 'MIN. OVERD. M', bredde: 66 }, { tekst: 'MAKS. OVERD. M', bredde: 66 }
    ], res.linjer.map((l, i) => {
      const k = ror.koder[l.kode] || Ror.tolkKode(l.kode);
      const pr = res.profiler.get(l.id), f = plan ? RorPlan.fallSpenn(res.kontroll, l) : null;
      return { celler: [String(i + 1), l.kode, k.dim ? 'Ø' + k.dim : '–', t(l.lengde * bf, 1),
        ...(plan ? [l.plan.regel, f ? Ror.spenn(f.min, f.maks, v => t(v, 1)) : '–'] : [String(l.punkter.length)]),
        od(pr.minOverdekning), od(pr.maksOverdekning)] };
    }).concat([{ sum: true, celler: ['', 'Sum', '', t(s.lengde, 1), ...(plan ? ['', ''] : ['']), od(s.minOd), od(s.maksOd)] }]));
    if (plan && res.kummer.length) {
      overskrift('Kummer');
      tabell([{ tekst: 'KUM', bredde: 40, venstre: true }, { tekst: 'RØR', bredde: 110, venstre: true }, { tekst: 'Ø MM', bredde: 50 },
        { tekst: 'TERRENG', bredde: 70 }, { tekst: 'BUNNLØP', bredde: 70 }, { tekst: 'DYBDE M', bredde: 60 }],
      res.kummer.map(km => {
        const x = ror.plan.ror.find(y => y.id === km.ror);
        return { celler: [km.id, x ? x.kode : '?', String(km.diameter), t(km.terreng, 2), t(km.bunnlop, 2), t(km.terreng - km.bunnlop, 2)] };
      }));
    }
```

- [ ] **Steg 5: Kumvolumet i massetabellene** – kummene er verken fundament, omfylling eller gjenfylling, og uten en rad går ikke tabellen opp. Der det er kummer (`sum.kumvolum > 0.5`), får tabellen en rad til:
  - `GroftUI.html`: `+ (s.kumvolum > 0.5 ? rad('Kummene (betong)', s.kumvolum) : '')` etter gjenfyllingen;
  - `apneRorrapport` (`grofthtml`): `${g.sum.kumvolum > 0.5 ? `<tr><td>Kummene (betong)</td><td>${t(g.sum.kumvolum)}</td></tr>` : ''}` etter gjenfyllingen;
  - `_rorinnhold`: `['Kummene (betong)', g.sum.kumvolum]` legges til i lista for «Masser, m³» når `g.sum.kumvolum > 0.5`.

  Prøven over får: `this.sjekk('massetabellen har kummene', !!html && /Kummene \(betong\)/.test(html));`

- [ ] **Steg 6: Kjør** nettlesertesten (`planRapport`, `rorRapport`, `rorPdf`, `groftRapport`, `groftFane`) · Ventet: grønne.

- [ ] **Steg 7: Commit** – «Rapporten og PDF-en for tegnede anlegg: kilden, regel og fall, kumlista og kumvolumet».

---

### Oppgave 13: Forklaringen, dokumentasjonen og hele runden

**Filer:**
- Endre: `public/js/ui-forklaring.js` (`_ror`), `public/js/nettlesertest.js`, `README.md`, `FORTSETTELSE.md`

- [ ] **Steg 1: Prøven** – inn i lista etter `'planRapport'`:

```js
  /** Forklaringen i et tegnet anlegg har ordene for planleggingen. */
  async planForklaring() {
    const foer = JSON.stringify(App.P);
    try {
      await this._medFlattTerreng(21.5, async () => {
        await this._planProsjekt();
        App.visFane('forklaring');
        const tekst = document.getElementById('forklaringInnhold').textContent;
        this.sjekk('ordene for tegnede rør står der', /Bunn innvendig/.test(tekst) && /Selvfall og trykk/.test(tekst)
          && /Kontrollpunkt/.test(tekst) && /Trase/.test(tekst));
      });
    } finally {
      await this._rorTilbake(foer);
    }
  },
```

- [ ] **Steg 2: Ordene** – i `Forklaring._ror`, etter «Fjell i grøfta», bare når anlegget er tegnet:

```js
      ...(app.P.ror.plan ? [
        ['Trase', 'Linja du tegner i kartet. Rørene ligger på den med sideavstand – flere rør i samme trase blir én grøft.'],
        ['Bunn innvendig', 'Bunnløpet – høyden VA-tegningene oppgir. Programmet regner med topp rør: bunn − gods + diameter.'],
        ['Kontrollpunkt', 'Endene, kummene og de låste høydene. Et fritt kontrollpunkt ligger med overdekningen under terrenget.'],
        ['Selvfall og trykk', 'Selvfall går rett mellom kontrollpunktene, med fast fall. Trykk følger terrenget meter for meter. '
          + 'Koden bestemmer: spillvann, overvann og drens er selvfall; vann og kabel er trykk.'],
        ['Kontrollene', 'Overdekning under grensen, motfall og for lite eller for mye fall, kryss med for liten klaring – og '
          + 'fjellet grøfta går i. Rødt i kartet og profilen, og i merknadene.']
      ] : [])
```

  (lista det står i, sprer seg inn: `for (const [ord, tekst] of [ …faste ord…, ...planord ])`).
- [ ] **Steg 3: README** – i «Rør fra maskinstyringen», etter «Grøftemasser»: avsnittet «### Planlagte rør» – nytt anlegg, «Ny trase» med flere rør og sideavstand, feste til innmålte rør og traseer, høydene (bunn innvendig, kontrollpunkt, selvfall og trykk), kummer med grop, kontrollene, profilredigeringen og at eksport (3b) og planlagt mot innmålt (3c) kommer. Filoversikten: `public/js/rorplan.js` og `public/js/ui-rorplan.js`. Prøvelista: `node test/rorplanprove.js`, og at `npm test` kjører alle fire.
- [ ] **Steg 4: FORTSETTELSE** – etappe 3a ferdig på grenen `ror-etappe3a` (spesifikasjon, plan, hva som er gjort), prøvetallene, og at 3b (eksport) og 3c (planlagt mot innmålt) står igjen.
- [ ] **Steg 5: Hele runden** – `npm test`, `node test/anleggsprove.js`, `node test/tomteprove.js`, `ROR_FIL=<sti> node test/groftprove.js` og `ROR_FIL=<sti> node test/rorprove.js`, og hele nettlesertesten i et vindu på 1440 × 900. Alt grønt.
- [ ] **Steg 6: Commit** – «Planlagte rør i forklaringen, README og FORTSETTELSE».
