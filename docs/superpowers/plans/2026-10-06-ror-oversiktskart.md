# Rør – oversiktskart: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One PDF with an overview map of all chosen pipe types, colour-coded with a legend, plus one map per type.

**Architecture:** The pure module `public/js/rorkart.js` (`Rorkart`) handles colours, extent, scale, tile plan and drawing on `PdfSkriver`. The writer gets `sti`, `sirkel` and `klipp`. `public/js/ui-rorkart.js` (`RorkartUI`) collects pipes from all pipe sites, shows the dialog, fetches the background tiles and builds the file.

**Tech Stack:** Vanilla JS, no build step. Modules are objects/IIFEs with `if (typeof module !== 'undefined') module.exports = …`. The tests are the node selftest (`test/selftest.js`) and the browser test (`public/js/nettlesertest.js`).

**Spec:** `docs/superpowers/specs/2026-10-06-ror-oversiktskart-design.md`

## Global Constraints

- The repo is public: no customer data in commits. Tests use invented data.
- Nothing changes heights, codes, colours or the active site. Building the map does not mark an undo entry.
- Text is WinAnsi via `PdfSkriver` (æøå OK; nothing above 255 without a replacement).
- The background comes from Kartverket's cache: `https://cache.kartverket.no/v1/wmts/1.0.0/{lag}/default/utm{sone}n/{z}/{rad}/{kol}.png`.
  - Layers: `topograatone` and `topo`.
  - The grid: resolution 21664 / 2^z m/px; 256 px tiles; top-left (−2 000 000 | −2 500 000 | −3 500 000, 9 045 984) for zones 32 | 33 | 35.
- Attribution: «Kartgrunnlag © Kartverket».
- Code style: Norwegian identifiers; comments explain why ("HER STO … Nå …").

---

### Task 1: PdfSkriver – sti, sirkel, klipp

**Files:**
- Modify: `public/js/pdfeksport.js`
- Test: `test/selftest.js` (new section 6j)

**Interfaces:**
- `sti(punkter:[[x,y]], o?:{farge,tykkelse,stiplet:[på,av],lukket,fyll})` draws a path between `q`/`Q`, with round joins and caps (`1 J 1 j`).
- `sirkel(x,y,r,o?:{fyll,strek,tykkelse})` draws four Bézier curves.
- `klipp(x,y,b,h,tegn:()=>void)` emits `q x y b h re W n` … `Q`.

- [ ] Test: the operators in `side.deler`.
  - `sti` with 3 points gives `m l l S` inside `q … Q`, with `1 J 1 j`.
  - `stiplet` gives `[a b] 0 d`.
  - `sirkel` has 4 `c` and ends with `b`/`f`/`s`.
  - `klipp` gives `re W n` before and `Q` after, also when `tegn` throws.
  - A whole file with these still has valid xref (reuse the check from `pdfrapport`).
- [ ] Implement, then run the selftest.

### Task 2: Rorkart – colours, extent, scale, tile plan

**Files:**
- Create: `public/js/rorkart.js`
- Test: `test/selftest.js` (section 6j)

**Interfaces:**
- `Rorkart.fargetabell(koder:{kode:{system,dim,form}})` returns `Map(kode → {rgb:[r,g,b] 0–1, system, nr})`.
  - Families per system with 5 shades.
  - Within a family, order is by dimension (descending), then by code.
  - Unknown systems get the neutral palette.
  - Point codes are skipped.
- `Rorkart.MALESTOKKER = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]`.
- `Rorkart.utsnitt(boks:{x0,y0,x1,y1}, flate:{b,h}(mm))` returns `{ N, x0, y0, x1, y1 }` (meters, centred), with an 8 % margin and a minimum span of 40 m.
- `Rorkart.tilPapir(u, flate)` returns `(x,y) => [mm_x, mm_y]` (y down).
- `Rorkart.flisplan(u, flate, sone, lag, dpi=150, maks=300)` returns `{ z, res, fliser:[{rad,kol,url,px,py}], bredde, hoyde }` in canvas pixels.

- [ ] Test, fargetabell:
  - three SP codes get three different brown shades;
  - VL is blue;
  - the same input gives the same output;
  - the result is independent of key order;
  - a point code is not included.
- [ ] Test, utsnitt:
  - 300 × 100 m in a 300 × 277 mm frame gives 1:1000, centred;
  - 0 × 0 gives at least 40 m;
  - 3 km gives 1:10 000 or 1:20 000.
- [ ] Test, flisplan:
  - the tile for a known point in utm32n (500000, 6500000) at z 17;
  - in utm33n the origin is −2 500 000;
  - more than 300 tiles takes a lower level;
  - the URLs have `utm32n`, `topograatone`, `{z}/{rad}/{kol}`.
- [ ] Implement, then run.

### Task 3: Rorkart – drawing a page

**Files:**
- Modify: `public/js/rorkart.js`
- Test: `test/selftest.js`

**Interfaces:**
- `Rorkart.sider(data, valg)` returns `[{ tittel, koder:[…], utsnitt, grå:[…] }]`.
  - `data = { linjer:[{kode,kilde:'innmalt'|'planlagt',xy:[{x,y}],lengde,dim}], kummer:[{x,y,d,kilde}], koder, prosjekt, sone, dato }`.
  - `valg = { koder:[…], perType:bool, papir:'A3'|'A4' }`.
- `Rorkart.tegnSide(P, side, data, farger, bakgrunn?:{bytes,bredde,hoyde}|null, nr, antall, merknad?)` draws:
  - the frame;
  - the background in the clip;
  - grey pipes, then the chosen ones (dashed when planned), then kummer;
  - the legend: code, length, count, source;
  - the scale bar, north arrow, title, scale, coordinate system, date, page and attribution.
- `Rorkart.lagPdf(data, valg, bakgrunner:Map(sidenr→bilde)|null)` returns `PdfSkriver` (not built).

- [ ] Test: a project with SP 160PE (measured, 2 pipes) and VL 110PE (planned, 1 pipe). Check:
  - `sider` gives 3 pages, or 1 without perType;
  - after `bygg`, `/Count 3`;
  - the streams, decompressed with `PdfImport.lesStrommer`, contain «SP 160PE», «VL 110PE», «1:», «Kartgrunnlag» (only with a background) and «EUREF89 UTM 32»;
  - the colours `RG` of the two codes are present;
  - the type page for VL has the grey of the other pipes.
- [ ] Implement, then run.

### Task 4: RorkartUI – collection, dialog, tiles, download

**Files:**
- Create: `public/js/ui-rorkart.js`
- Modify: `public/index.html` (script tags plus a button in the Rør tab and the Eksport tab)
- Modify: `public/js/app.js` (show the buttons when the project has pipe sites; wiring)
- Test: `public/js/nettlesertest.js` (`rorOversiktskart`)

**Interfaces:**
- `RorkartUI.samle()` returns `data` for all pipe sites, without switching the active one.
  - Codes are made visible in the copy.
  - The zone is `app.sone`, or that of the first pipe site.
- `RorkartUI.apne()` returns a Promise that opens the dialog and makes the PDF.
- `RorkartUI.hentBakgrunn(plan)` returns `{bytes,bredde,hoyde}` or null, using fetch, createImageBitmap, a canvas and JPEG 0.85.
- `RorkartUI.lag(valg, lastNed=true)` returns `Uint8Array`.

- [ ] Browser test:
  - a project with a measured site (`_rorXml`) and a planned one (`_planProsjekt`-like);
  - `fetch` is stubbed for `cache.kartverket.no` with a 256 px PNG made on a canvas;
  - the dialog lists the codes from both;
  - «Ingen» unticks all and «Alle» ticks all;
  - `lag` gives 1 + n pages and has an image;
  - the title of each type page has its code;
  - `P`, `P.aktivt` and the undo history are unchanged;
  - with a fetch that fails, the PDF is made without a background and the status says so.
- [ ] Implement, then run the test and the whole browser suite.

### Task 5: Documentation, review, merge

- [ ] README «Rør» and FORTSETTELSE.md: the new section, numbers.
- [ ] Code review by a subagent; fix the findings.
- [ ] `npm test`, anlegg, tomt, the full browser suite and the customer-data scan. Then ff to main, push, curl live (`/js/rorkart.js`), and delete the branch.
