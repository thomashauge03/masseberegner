'use strict';
/**
 * Rørene ut av programmet: til maskinstyringen som 3D-linjer, til stikkeren
 * som punkt, og til kommunen og tegneren i formatene veg og tomt alt har.
 *
 * TRE HØYDER, SOM EGNE LAG. Bunn innvendig (bunnløpet – det VA-tegningene
 * oppgir), topp rør (det innmålingen er målt på) og gravebunn (bunnen av
 * grøfta – det maskina graver til). Den som setter opp maskina, velger;
 * programmet gjetter ikke på hvilken.
 *
 * Eksporten leser bare. Den endrer ingen høyder – innmålte høyder skal aldri
 * flytte seg av noe annet enn en knapp brukeren trykker på.
 *
 * Ren modul uten DOM. Hjelperne for hvert format kommer fra `Eksport`.
 */
const RorEksport = (() => {
  /** Stikningsavstanden langs røret (m) – i tillegg til hvert knekkpunkt og enden. */
  const STIKK = 10;
  const _eks = () => (typeof Eksport !== 'undefined' ? Eksport : require('./eksport.js'));
  const _rp = () => (typeof RorPlan !== 'undefined' ? RorPlan : require('./rorplan.js'));
  const _geo = () => (typeof Geo !== 'undefined' ? Geo : require('./geo.js'));

  /** Avstanden i planet fra starten av linja til hvert punkt. */
  function stasjonering(xy) {
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    return s;
  }

  /**
   * Verdien ved stasjon s – lineært mellom naboene. NaN utenfor lista, og NaN
   * mellom to punkt der det ene mangler tall: et hull fylles ikke med noe
   * programmet finner på.
   */
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

  /** «k12» → «12»: kummens nummer i et punktnavn som må være kort. */
  const kumNr = id => String(id).replace(/^k/i, '').replace(/[^A-Za-z0-9]/g, '') || '0';
  // en kum i et knekkpunkt er en kum, en ende er en ende – og et vanlig stikk er det minste
  const PRI = { stikk: 0, knekk: 1, start: 2, slutt: 2, kum: 3 };

  /**
   * Alt formatene trenger, per rør: de tre linjene og stikningspunktene.
   *
   * GRAVEBUNNEN KOMMER FRA GRØFTEMOTOREN, og der det ikke graves – røret over
   * terrenget, eller ingen dimensjon – brytes den. En strek tvers over et sted
   * uten tall ville vært en gravebunn ingen har regnet.
   *
   * STIKKENE er hvert knekkpunkt, hver 10. meter og enden. Mellompunktene på
   * et trykkrør (hver meter) er for mange til et instrument; de står i linjene.
   */
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
        l.xy.forEach((q, j) => {
          if (Math.hypot(q.x - km.x, q.y - km.y) < Math.hypot(l.xy[jb].x - km.x, l.xy[jb].y - km.y)) jb = j;
        });
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

  /** «1 = SP 160PE (selvfall, Ø160)» – det rørnumrene i en KOF-fil betyr. Ø, ikke ⌀: instrumentene kjenner ikke ⌀. */
  function beskriv(p) {
    const del = [];
    if (p.linje.plan && p.linje.plan.regel) del.push(p.linje.plan.regel);
    if (p.k.dim > 0) del.push('Ø' + p.k.dim);
    return `${p.nr} = ${p.kode}${del.length ? ' (' + del.join(', ') + ')' : ''}`
      + (p.D > 0 ? '' : ' – uten dimensjon: bare topp rør');
  }
  function kofMerknader(d) { return d.map(beskriv); }

  /**
   * Koordinatlinjene, uten hode. Navnet er `<rørnr>-<løpenr><B|T|G>` – kort
   * nok til ti tegn også med samlefilens prefiks foran.
   */
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

  /**
   * LandXML: én `<PlanFeature>` per rør og høyde, som 3D-strekk – slik tomta
   * skriver sine linjer – og kummene som `<CgPoint>`. `PipeNetworks` er vurdert:
   * røret er en polylinje med mange knekk, og et nettverk krever en struktur i
   * hvert av dem. Få maskinstyringer leser det.
   */
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
      // en gravebunn i flere biter blir flere linjer – aldri én strek over et brudd
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

  /**
   * SOSI: en kurve per rør og høyde, og et punkt per kum. Katalogen er
   * programmets egen, som for veg og tomt – navnene later ikke som de er FKB.
   */
  function sosiDeler(app, res, idFra = 1, anleggsnavn = null, d = punkter(app, res)) {
    const E = _eks(), cm = v => Math.round(v * 100);
    let minN = Infinity, maksN = -Infinity, minO = Infinity, maksO = -Infinity;
    const omr = q => {
      minN = Math.min(minN, q.y); maksN = Math.max(maksN, q.y);
      minO = Math.min(minO, q.x); maksO = Math.max(maksO, q.x);
    };
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

  /** DXF: 3D-polylinjer på lag per kode og høyde, og kummene som sirkler på bunnløpet. */
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

  /** GeoJSON til kartverktøy: rørene som linjer med egenskapene, kummene som punkt. */
  function geojson(app, res) {
    const G = _geo(), sone = res.sone || app.sone, bf = res.bakkefaktor || 1;
    const ll = q => { const g = G.fraUtm(q.x, q.y, sone); return [+g.lon.toFixed(8), +g.lat.toFixed(8)]; };
    const tall = (v, des) => (Number.isFinite(v) ? +v.toFixed(des) : null);
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
