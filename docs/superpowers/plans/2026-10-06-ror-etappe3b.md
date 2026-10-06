# Rør etappe 3b – eksport til maskinstyring og stikning: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Røranleggene (tegnede og innmålte) kan eksporteres til KOF, LandXML, SOSI, DXF, GeoJSON og CSV, med bunn innvendig, topp rør og gravebunn som egne lag.

**Architecture:** En ny ren modul `public/js/roreksport.js` (`RorEksport`) regner punktene én gang (`punkter`) og skriver hvert format med hjelperne i `Eksport`. `Rapport` (ui-rapport.js) får rørgreinene i enkelteksport, CSV og samlefil; Eksport-fanen vises for rør.

**Tech Stack:** Vanilla JS uten byggesteg, node-prøver (`test/*.js`), nettleserprøven (`public/js/nettlesertest.js`).

**Spec:** `docs/superpowers/specs/2026-10-06-ror-etappe3b-design.md`

## Global Constraints

- Norske navn og kommentarer; kommentarene forklarer hvorfor.
- Ingen kundedata i commits – prøvene bruker oppdiktede punkt.
- Eksporten leser bare; den endrer ingen høyder.
- Koordinatene skrives i regnesonen (`res.sone`), N før Ø der formatet krever det (KOF, LandXML, SOSI).
- KOF-navn ≤ 10 tegn og unike i fila (`Eksport.kofNavner` vokter).

---

### Oppgave 1: `RorEksport.punkter` – linjene og stikningspunktene

**Files:**
- Create: `public/js/roreksport.js`, `test/roreksportprove.js`
- Modify: `package.json` (`npm test` får `node test/roreksportprove.js`)

**Interfaces:**
- Produces: `RorEksport.punkter(app, res) → [{ linje, nr, kode, k, D, gods, lengde, linjer: { topp:[{x,y,z}], bunn:[{x,y,z}], gravebunn:[[{x,y,z}]] }, stikk:[{ s, type, x, y, topp, bunn, gravebunn, terreng }] }]`; `RorEksport.STIKK = 10`; `RorEksport.kumNr(id)`; `RorEksport.ved(stasj, verdier, s)`.
- `type` ∈ `start | slutt | knekk | kum | stikk` (kum > start/slutt > knekk > stikk).

- [ ] **Steg 1: Prøven** – `test/roreksportprove.js` med fiksturen (planlagt anlegg i UTM-lignende tall: trase (500000, 6500000) → (500040, 6500000) → (500070, 6500040), SP 160PE side 0 med kum i knekken, VL 110PE side −1; flatt terreng 10; grøfta fra `Groft.beregn`, profilene fra `Ror.profil`) og sjekkene:
  - SP: stasjonene 0, 10, …, 80, 90 (knekken 40 er kummen), typene `start`, `kum`, `slutt`;
  - bunn = topp − 0,16 + 0,0145 i hvert punkt; topp 8,0 (fri overdekning 2,0);
  - gravebunn ≈ 7,69 (topp − D − fundament) langs SP;
  - VL: ingen mellompunkt i stikkene – bare knekk, hver 10. m og enden;
  - et innmålt rør som stikker over terrenget på midten: gravebunnen i to biter, og stasjonen der har ingen gravebunn;
  - et rør uten dimensjon: ingen bunn og ingen gravebunn.
- [ ] **Steg 2:** `node test/roreksportprove.js` – rødt (modulen finnes ikke).
- [ ] **Steg 3:** `roreksport.js` med `stasjonering`, `ved`, `punkter`, `kumNr` (koden står i oppgave 2, steg 3 – én fil).
- [ ] **Steg 4:** grønt; `npm test` med den nye fila.
- [ ] **Steg 5:** commit «RorEksport.punkter: rørene med bunn, topp og gravebunn, og stikningspunktene».

### Oppgave 2: Formatene – KOF, LandXML, SOSI, DXF og GeoJSON

**Files:** `public/js/roreksport.js`, `test/roreksportprove.js`

**Interfaces:**
- Produces: `kofMerknader(d)`, `kofKropp(app, res, navner, d?)`, `kof(app, res)`; `landxmlDeler(app, res, pre?, d?) → { linjer, punkter }`, `landxml(app, res)`; `sosiDeler(app, res, idFra?, anleggsnavn?, d?) → { rader, omr, niva, nesteId }`, `sosi(app, res)`; `dxfKropp(app, res, lagpre?, d?)`, `dxf(app, res)`; `geojson(app, res)`.
- Consumes: `Eksport.kofHode`, `kofPunkt`, `kofNavner`, `landxmlDokument`, `xml`, `sosiHode`, `sosiTekst`, `dxfDokument`, `dxfLagpre`; `Geo.fraUtm`.

- [ ] **Steg 1: Prøvene** (samme fil):
  - KOF: 05-linjene = 3 per SP-stikk + 3 per VL-stikk + 2 for kummen; navnene ≤ 10 tegn; første linje `1-001B RORBUNN` med N 6500000,000, Ø 500000,000 og bunnen; hodet har `MERK: 1 = SP 160PE (selvfall, Ø160)`; med prefiks `A` er navnene fortsatt ≤ 10.
  - LandXML: seks `<PlanFeature` (tre per rør), «1 SP 160PE – bunn innvendig», topp-linja starter på `6500000.0000 500000.0000 8.0000`, to `<CgPoint`, `epsgCode="25832"`.
  - SOSI: seks `.KURVE`, fire `Rørledning`, to `Grøftebunn`, én `.PUNKT` med `Kum`, første høyde i centimeter.
  - DXF: lagene `SP_160PE_BUNN/TOPP/GRAVEBUNN` og `VL_110PE_…`, en `CIRCLE` med radius 0,6 på bunnløpet.
  - GeoJSON: to `LineString`, ett `Point`, lon/lat innenfor Norge.
  - Ingen rør → `kof`, `landxml`, `sosi`, `dxf` kaster «Ingen rør å skrive».
- [ ] **Steg 2:** rødt.
- [ ] **Steg 3:** skriverne i `roreksport.js` (se koden under).
- [ ] **Steg 4:** grønt.
- [ ] **Steg 5:** commit «Rørene til KOF, LandXML, SOSI, DXF og GeoJSON – tre høyder som egne lag».

Koden for `roreksport.js` (oppgave 1 og 2):

```js
'use strict';
/**
 * Rørene ut av programmet: til maskinstyringen som 3D-linjer, til stikkeren
 * som punkt, og til kommunen og tegneren i formatene veg og tomt alt har.
 *
 * TRE HØYDER, SOM EGNE LAG. Bunn innvendig (bunnløpet – det VA-tegningene
 * oppgir), topp rør (det innmålingen er målt på) og gravebunn (bunnen av
 * grøfta – det maskina graver til). Den som setter opp maskina, velger;
 * programmet gjetter ikke.
 *
 * Ren modul uten DOM. Hjelperne for hvert format kommer fra `Eksport`.
 */
const RorEksport = (() => {
  /** Stikningsavstanden langs røret (m) – i tillegg til hvert knekkpunkt og enden. */
  const STIKK = 10;
  const _eks = () => (typeof Eksport !== 'undefined' ? Eksport : require('./eksport.js'));
  const _rp = () => (typeof RorPlan !== 'undefined' ? RorPlan : require('./rorplan.js'));
  const _geo = () => (typeof Geo !== 'undefined' ? Geo : require('./geo.js'));

  function stasjonering(xy) {
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    return s;
  }

  /** Verdien ved stasjon s – lineært mellom naboene; NaN utenfor lista og ved et hull. */
  function ved(stasj, verdier, s) {
    const n = stasj.length;
    if (!n || s < stasj[0] - 1e-6 || s > stasj[n - 1] + 1e-6) return NaN;
    if (n === 1) return verdier[0];
    let i = 1;
    while (i < n - 1 && stasj[i] < s) i++;
    const a = stasj[i - 1], b = stasj[i];
    if (Math.abs(s - a) < 1e-6) return verdier[i - 1];
    if (Math.abs(s - b) < 1e-6) return verdier[i];
    const va = verdier[i - 1], vb = verdier[i];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return NaN;
    return va + (vb - va) * (b > a ? (s - a) / (b - a) : 0);
  }

  const kumNr = id => String(id).replace(/^k/i, '').replace(/[^A-Za-z0-9]/g, '') || '0';
  const PRI = { stikk: 0, knekk: 1, start: 2, slutt: 2, kum: 3 };

  function punkter(app, res) {
    const koder = (app.P.ror && app.P.ror.koder) || {};
    return (res.linjer || []).map((l, i) => {
      const k = _rp().kodeAv(koder, l.kode);
      const D = k.dim > 0 ? k.dim / 1000 : 0, g = D > 0 ? _rp().gods(k) / 1000 : 0;
      const s = stasjonering(l.xy), L = s[s.length - 1];
      const xs = l.xy.map(q => q.x), ys = l.xy.map(q => q.y), zs = l.punkter.map(p => p.z);
      const topp = l.xy.map((q, j) => ({ x: q.x, y: q.y, z: zs[j] }));
      const bunn = D > 0 ? topp.map(q => ({ x: q.x, y: q.y, z: q.z - D + g })) : [];
      const gp = res.groft && res.groft.profiler ? res.groft.profiler.get(l.id) || [] : [];
      const gravebunn = [];
      let bit = [];
      for (const q of gp) {
        if (Number.isFinite(q.gravebunn)) bit.push({ x: ved(s, xs, q.s), y: ved(s, ys, q.s), z: q.gravebunn });
        else { if (bit.length > 1) gravebunn.push(bit); bit = []; }
      }
      if (bit.length > 1) gravebunn.push(bit);
      const pr = res.profiler && res.profiler.get(l.id);
      const tS = pr ? pr.prover.map(q => q.s) : [], tZ = pr ? pr.prover.map(q => q.terreng) : [];
      const gS = gp.map(q => q.s), gZ = gp.map(q => q.gravebunn);
      const st = [];
      const legg = (v, type) => {
        const f = st.find(x => Math.abs(x.s - v) < 0.05);
        if (!f) st.push({ s: v, type });
        else if (PRI[type] > PRI[f.type]) f.type = type;
      };
      const n = l.punkter.length;
      l.punkter.forEach((p, j) => { if (!p.mellom) legg(s[j], j === 0 ? 'start' : j === n - 1 ? 'slutt' : 'knekk'); });
      for (let v = STIKK; v < L - 0.05; v += STIKK) legg(v, 'stikk');
      for (const km of res.kummer || []) {
        if (km.ror !== l.id) continue;
        let jb = 0;
        l.xy.forEach((q, j) => { if (Math.hypot(q.x - km.x, q.y - km.y) < Math.hypot(l.xy[jb].x - km.x, l.xy[jb].y - km.y)) jb = j; });
        if (Math.hypot(l.xy[jb].x - km.x, l.xy[jb].y - km.y) < 0.05) legg(s[jb], 'kum');
      }
      st.sort((a, b) => a.s - b.s);
      const stikk = st.map(q => {
        const tp = ved(s, zs, q.s);
        return { s: q.s, type: q.type, x: ved(s, xs, q.s), y: ved(s, ys, q.s), topp: tp,
          bunn: D > 0 ? tp - D + g : NaN, gravebunn: ved(gS, gZ, q.s), terreng: ved(tS, tZ, q.s) };
      });
      return { linje: l, nr: i + 1, kode: l.kode, k, D, gods: g, lengde: L, linjer: { topp, bunn, gravebunn }, stikk };
    });
  }

  function beskriv(p) {
    const del = [];
    if (p.linje.plan && p.linje.plan.regel) del.push(p.linje.plan.regel);
    if (p.k.dim > 0) del.push('Ø' + p.k.dim);
    return `${p.nr} = ${p.kode}${del.length ? ' (' + del.join(', ') + ')' : ''}`
      + (p.D > 0 ? '' : ' – uten dimensjon: bare topp rør');
  }
  function kofMerknader(d) { return d.map(beskriv); }

  function kofKropp(app, res, navner, d = punkter(app, res)) {
    const E = _eks(), rader = [];
    for (const p of d) {
      const b = Math.max(3, String(p.stikk.length).length);
      p.stikk.forEach((q, j) => {
        const nr = `${p.nr}-${String(j + 1).padStart(b, '0')}`;
        if (Number.isFinite(q.bunn)) rader.push(E.kofPunkt(navner(nr + 'B'), 'RORBUNN', q.y, q.x, q.bunn));
        rader.push(E.kofPunkt(navner(nr + 'T'), 'RORTOPP', q.y, q.x, q.topp));
        if (Number.isFinite(q.gravebunn)) rader.push(E.kofPunkt(navner(nr + 'G'), 'GRAVBUNN', q.y, q.x, q.gravebunn));
      });
    }
    for (const km of res.kummer || []) {
      const nr = 'K' + kumNr(km.id);
      rader.push(E.kofPunkt(navner(nr + 'B'), 'KUMBUNN', km.y, km.x, km.bunnlop));
      if (Number.isFinite(km.terreng)) rader.push(E.kofPunkt(navner(nr + 'T'), 'KUMTOPP', km.y, km.x, km.terreng));
    }
    return rader;
  }
  function kof(app, res) {
    const E = _eks(), d = punkter(app, res);
    if (!d.length) throw new Error('Ingen rør å skrive');
    const rader = E.kofHode(app, kofMerknader(d));
    for (const r of kofKropp(app, res, E.kofNavner(), d)) rader.push(r);
    return rader.join('\r\n') + '\r\n';
  }

  function landxmlDeler(app, res, pre = '', d = punkter(app, res)) {
    const E = _eks();
    const nez = q => `${q.y.toFixed(4)} ${q.x.toFixed(4)} ${q.z.toFixed(4)}`;
    const linjer = [];
    const geom = (navn, pts) => {
      if (pts.length < 2) return;
      const seg = [];
      for (let i = 0; i < pts.length - 1; i++) {
        seg.push(`        <Line>\n          <Start>${nez(pts[i])}</Start>\n          <End>${nez(pts[i + 1])}</End>\n        </Line>`);
      }
      linjer.push(`      <PlanFeature name="${E.xml(navn)}">\n      <CoordGeom>\n${seg.join('\n')}\n      </CoordGeom>\n      </PlanFeature>`);
    };
    for (const p of d) {
      const navn = `${pre}${p.nr} ${p.kode}`, gb = p.linjer.gravebunn;
      geom(navn + ' – bunn innvendig', p.linjer.bunn);
      geom(navn + ' – topp rør', p.linjer.topp);
      gb.forEach((b, i) => geom(navn + ' – gravebunn' + (gb.length > 1 ? ' ' + (i + 1) : ''), b));
    }
    const punkt = [];
    for (const km of res.kummer || []) {
      punkt.push(`    <CgPoint name="${E.xml(pre + km.id)} bunnløp" code="KUMBUNN">${nez({ x: km.x, y: km.y, z: km.bunnlop })}</CgPoint>`);
      if (Number.isFinite(km.terreng)) {
        punkt.push(`    <CgPoint name="${E.xml(pre + km.id)} lokk" code="KUMTOPP">${nez({ x: km.x, y: km.y, z: km.terreng })}</CgPoint>`);
      }
    }
    return { linjer, punkter: punkt };
  }
  function landxml(app, res) {
    const E = _eks(), d = landxmlDeler(app, res);
    if (!d.linjer.length) throw new Error('Ingen rør å skrive');
    return E.landxmlDokument(app, `  <PlanFeatures name="${E.xml(app.P.navn)}">\n${d.linjer.join('\n')}\n  </PlanFeatures>`
      + (d.punkter.length ? `\n  <CgPoints name="Kummer">\n${d.punkter.join('\n')}\n  </CgPoints>` : ''));
  }

  function sosiDeler(app, res, idFra = 1, anleggsnavn = null, d = punkter(app, res)) {
    const E = _eks(), cm = v => Math.round(v * 100);
    let minN = Infinity, maksN = -Infinity, minO = Infinity, maksO = -Infinity;
    const omr = q => { minN = Math.min(minN, q.y); maksN = Math.max(maksN, q.y); minO = Math.min(minO, q.x); maksO = Math.max(maksO, q.x); };
    const rader = [];
    let id = idFra;
    const kurve = (objtype, p, hoyde, pts) => {
      if (pts.length < 2) return;
      rader.push(`.KURVE ${id++}:`, '..OBJTYPE ' + objtype, '..NAVN ' + E.sosiTekst(p.kode), '..HØYDEREF ' + E.sosiTekst(hoyde));
      if (p.k.dim > 0) rader.push('..DIAMETER ' + Math.round(p.k.dim));
      if (anleggsnavn) rader.push('..ANLEGG ' + E.sosiTekst(anleggsnavn));
      rader.push('..NØH');
      for (const q of pts) { omr(q); rader.push(`${cm(q.y)} ${cm(q.x)} ${cm(q.z)}`); }
    };
    for (const p of d) {
      kurve('Rørledning', p, 'bunn innvendig', p.linjer.bunn);
      kurve('Rørledning', p, 'topp rør', p.linjer.topp);
      for (const b of p.linjer.gravebunn) kurve('Grøftebunn', p, 'gravebunn', b);
    }
    for (const km of res.kummer || []) {
      omr(km);
      rader.push(`.PUNKT ${id++}:`, '..OBJTYPE Kum', '..NAVN ' + E.sosiTekst(km.id));
      if (km.diameter > 0) rader.push('..DIAMETER ' + Math.round(km.diameter));
      if (anleggsnavn) rader.push('..ANLEGG ' + E.sosiTekst(anleggsnavn));
      rader.push('..NØH', `${cm(km.y)} ${cm(km.x)} ${cm(km.bunnlop)}`);
    }
    if (!Number.isFinite(minN)) throw new Error('Ingen rør å skrive');
    return { rader, omr: { minN, maksN, minO, maksO }, niva: 2, nesteId: id };
  }
  function sosi(app, res) {
    const E = _eks(), d = sosiDeler(app, res, 1);
    const rader = E.sosiHode(app, d.omr, d.niva).concat(d.rader);
    rader.push('.SLUTT');
    return rader.join('\r\n') + '\r\n';
  }

  function dxfKropp(app, res, lagpre = '', d = punkter(app, res)) {
    const E = _eks(), ut = [];
    const par = (kode, verdi) => { ut.push(String(kode)); ut.push(String(verdi)); };
    const polylinje = (lag, farge, pts) => {
      if (pts.length < 2) return;
      const navn = lagpre + lag;
      par(0, 'POLYLINE'); par(8, navn); par(62, farge); par(66, 1); par(70, 8);
      for (const q of pts) {
        par(0, 'VERTEX'); par(8, navn); par(70, 32);
        par(10, q.x.toFixed(4)); par(20, q.y.toFixed(4)); par(30, q.z.toFixed(4));
      }
      par(0, 'SEQEND'); par(8, navn);
    };
    for (const p of d) {
      const lag = E.dxfLagpre(p.kode) || ('ROR' + p.nr + '_');
      polylinje(lag + 'BUNN', 1, p.linjer.bunn);
      polylinje(lag + 'TOPP', 4, p.linjer.topp);
      for (const b of p.linjer.gravebunn) polylinje(lag + 'GRAVEBUNN', 8, b);
    }
    for (const km of res.kummer || []) {
      const r = ((km.diameter > 0 ? km.diameter : 1000) / 1000 + 0.2) / 2;
      par(0, 'CIRCLE'); par(8, lagpre + 'KUM'); par(62, 7);
      par(10, km.x.toFixed(4)); par(20, km.y.toFixed(4)); par(30, km.bunnlop.toFixed(4)); par(40, r.toFixed(4));
      par(0, 'TEXT'); par(8, lagpre + 'KUM'); par(62, 7);
      par(10, (km.x + r).toFixed(4)); par(20, km.y.toFixed(4)); par(30, km.bunnlop.toFixed(4));
      par(40, '0.5'); par(1, `${km.id} BL ${km.bunnlop.toFixed(2)}`);
    }
    return ut;
  }
  function dxf(app, res) {
    const d = punkter(app, res);
    if (!d.length) throw new Error('Ingen rør å skrive');
    return _eks().dxfDokument(dxfKropp(app, res, '', d));
  }

  function geojson(app, res) {
    const G = _geo(), sone = res.sone || app.sone, bf = res.bakkefaktor || 1;
    const ll = q => { const g = G.fraUtm(q.x, q.y, sone); return [+g.lon.toFixed(8), +g.lat.toFixed(8)]; };
    const tall = (v, d) => (Number.isFinite(v) ? +v.toFixed(d) : null);
    const f = [];
    for (const p of punkter(app, res)) {
      const pr = res.profiler && res.profiler.get(p.linje.id);
      const b = p.linjer.bunn;
      f.push({ type: 'Feature', properties: { type: 'ror', nr: p.nr, kode: p.kode, dim_mm: p.k.dim || null,
        lengde_m: tall(p.lengde * bf, 2), regel: p.linje.plan ? p.linje.plan.regel : null,
        bunn_start: b.length ? tall(b[0].z, 3) : null, bunn_slutt: b.length ? tall(b[b.length - 1].z, 3) : null,
        min_overdekning_m: pr ? tall(pr.minOverdekning, 2) : null, maks_overdekning_m: pr ? tall(pr.maksOverdekning, 2) : null,
        hoydereferanse: 'NN2000' },
        geometry: { type: 'LineString', coordinates: p.linjer.topp.map(ll) } });
    }
    for (const km of res.kummer || []) {
      f.push({ type: 'Feature', properties: { type: 'kum', id: km.id, diameter_mm: km.diameter, bunnlop: tall(km.bunnlop, 3),
        terreng: tall(km.terreng, 3), dybde_m: tall(km.terreng - km.bunnlop, 2), hoydereferanse: 'NN2000' },
        geometry: { type: 'Point', coordinates: ll(km) } });
    }
    return { type: 'FeatureCollection', features: f };
  }

  return { STIKK, stasjonering, ved, kumNr, punkter, kofMerknader, kofKropp, kof, landxmlDeler, landxml,
    sosiDeler, sosi, dxfKropp, dxf, geojson };
})();

if (typeof module !== 'undefined') module.exports = RorEksport;
```

### Oppgave 3: Knappene – Eksport-fanen, enkeltfilene, CSV-ene og samlefilene

**Files:**
- Modify: `public/js/ui-rapport.js` (`kjorEksport`, `eksportStikning`, `eksportMasser`, `eksporter`, `eksportGeojson`, nye `stikningRaderRor` og `masseRaderRor`, `eksporterAlle`, `eksporterCsvAlle`, `gjennomAlleAnlegg`), `public/js/app.js` (fanen og knappetekstene), `public/index.html` (`<script src="js/roreksport.js">` etter `rorplan.js`), `public/js/ui-rapport.js`-kallene i `apneProsjektrapport` og `ui-pdfrapport.js` (`lagProsjekt`) mister `{ medRor: true }`, `public/js/nettlesertest.js`

**Interfaces:**
- Consumes: alt fra oppgave 1–2.
- Produces: `Rapport.stikningRaderRor(app, res)`, `Rapport.masseRaderRor(app, res)` – samme form som veg/tomt (`{ merknad, foran, overskrift, rader, svar }`).

- [ ] **Steg 1: Prøven** `planEksport` i nettlesertesten (etter `planForklaring`): et tegnet anlegg (`_planProsjekt`) med flatt terreng; Eksport-fanen er synlig; `Rapport.lastNed` byttes ut med en som samler `{navn, innhold}`; hver knapp (KOF, LandXML, SOSI, DXF, CSV-stikning, CSV-masser, GeoJSON) lager én fil med riktig endelse og innhold (`RORBUNN`, `<PlanFeature`, `Rørledning`, `SP_160PE_BUNN`, `Bunn_innvendig`, `Graving_m3`, `"type":"ror"`); knappeteksten er rørens («Rørene som 3D-linjer (LandXML)»). Så samlefila: et innmålt anlegg legges til (`_rorXml`), «Alle i prosjektet», LandXML – én fil med begge anleggene, og ingen «Ikke med».
  `rorRapport`: «eksportknappene skriver ingen fil for rør» snus til at de skriver filer, og «samleeksporten … røret ikke er med» snus til at røret er med.
- [ ] **Steg 2:** rødt.
- [ ] **Steg 3:** koden:
  - `kjorEksport`: rørsperren tas bort.
  - `eksporter`: `ror ? RorEksport.kof(app, res) : …` for hvert format.
  - `eksportStikning`/`eksportMasser`: `form === 'ror'` → `stikningRaderRor`/`masseRaderRor`; fila heter `_stikning.csv`/`_groftemasser.csv`.
  - `eksportGeojson`: `form === 'ror'` → `RorEksport.geojson`.
  - `eksporterAlle`: rørgreiner – KOF `RorEksport.kofKropp(a2, res, b => navner(pre + b), d)` + `kofMerknader`; LandXML `RorEksport.landxmlDeler(a2, res, anleggsnavn + ' – ')` (linjene i `PlanFeatures`, kummene i `CgPoints`); SOSI `sosiDeler`; DXF `dxfKropp(a2, res, pre)`; GeoJSON `RorEksport.geojson`.
  - `eksporterCsvAlle`: rørgreiner for stikning og masser.
  - `gjennomAlleAnlegg`: rørsperren (`!valg.medRor`) tas bort – alle tar rør nå.
  - `app.js`: Eksport-fanen vises for rør; `navn(vegtekst, tomtetekst, alletekst, rortekst)`; notisen for rør forklarer de tre høydene.
- [ ] **Steg 4:** grønt (`planEksport`, `rorRapport`, `rorPdf`, `eksport`, `tomteksport`, `groftRapport`).
- [ ] **Steg 5:** commit «Eksport-fanen for rør: enkeltfiler, stikningsliste, grøftemasser og samlefiler».

### Oppgave 4: Dokumentasjonen og hele runden

**Files:** `README.md` («Eksport» og «Planlagte rør»), `FORTSETTELSE.md`

- [ ] **Steg 1:** README: rørene eksporteres med tre høyder; prøvelista får `node test/roreksportprove.js`.
- [ ] **Steg 2:** FORTSETTELSE: 3b ferdig, tallene.
- [ ] **Steg 3:** hele runden – `npm test`, anleggs- og tomteprøven, `ROR_FIL` for grøfte- og rørprøven, hele nettlesertesten med fanen framme.
- [ ] **Steg 4:** commit «Eksport av rør i README og FORTSETTELSE».
