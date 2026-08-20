'use strict';
/**
 * Eksport til de filformatene som brukes rundt et anlegg.
 *
 *   KOF       stikningsdata til totalstasjon og maskinstyring
 *   LandXML   linjeføring og lengdeprofil, leses av de fleste maskinstyringer
 *   SOSI      norsk standard for utveksling av kartdata med kommune og Kartverket
 *   DXF       tegning til AutoCAD og liknende
 *   GeoJSON   til kartverktøy og nettkart
 *   CSV       til regneark
 *
 * Formatene er skrevet etter spesifikasjonene, men de er ikke prøvd mot hvert
 * enkelt mottakersystem. Ta en prøveimport av én fil før dere baserer en jobb
 * pa dem.
 */

const Eksport = {

  /** Punktene langs senterlinjen med vegkanter, som alle formatene bygger pa. */
  punkter(app, res) {
    const ut = [];
    for (const p of res.profiler) {
      const fall = app.fallVed(p.s);
      const vk = app.linje.punktMedAvvik(p.s, -p.halvbredde);
      const hk = app.linje.punktMedAvvik(p.s, p.halvbredde);
      ut.push({
        s: p.s,
        senter: { n: p.y, o: p.x, z: p.vegnivaa },
        venstre: { n: vk.y, o: vk.x, z: p.vegnivaa - fall.venstre * p.halvbredde },
        hoyre: { n: hk.y, o: hk.x, z: p.vegnivaa - fall.hoyre * p.halvbredde },
        terreng: p.terrengSenter
      });
    }
    return ut;
  },

  /**
   * KOF – Koordinat- og observasjonsformat.
   *
   * Kolonnebasert: felttype, punktnavn, kode, nord, øst, høyde. 05 er en
   * koordinatlinje. Punktnavnet holdes kort, for mange instrumenter kutter
   * det som er lengre enn ti tegn.
   */
  kof(app, res) {
    const p = v => v.toFixed(3).padStart(12);
    const rader = [
      '-05 ' + this.tekst(app.P.navn, 30),
      '-05 Massekalk ' + new Date().toISOString().slice(0, 10) + '  EUREF89 UTM' + app.sone,
      '.PUNKT'
    ];
    for (const pt of this.punkter(app, res)) {
      const nr = Math.round(pt.s);
      rader.push(` 05 ${this.tekst('S' + nr, 10)} ${this.tekst('SENTER', 8)}${p(pt.senter.n)}${p(pt.senter.o)}${p(pt.senter.z)}`);
      rader.push(` 05 ${this.tekst('V' + nr, 10)} ${this.tekst('VKANT', 8)}${p(pt.venstre.n)}${p(pt.venstre.o)}${p(pt.venstre.z)}`);
      rader.push(` 05 ${this.tekst('H' + nr, 10)} ${this.tekst('HKANT', 8)}${p(pt.hoyre.n)}${p(pt.hoyre.o)}${p(pt.hoyre.z)}`);
    }
    return rader.join('\r\n') + '\r\n';
  },

  /**
   * LandXML – linjeføring med lengdeprofil.
   *
   * Rettstrekk og sirkelkurver skrives som egne elementer, slik at
   * maskinstyringen far den samme geometrien og ikke en kjede korder.
   * Merk at LandXML oppgir punkt som "nord øst", ikke omvendt.
   */
  landxml(app, res) {
    const linje = app.linje;
    const nå = new Date().toISOString();
    const nk = p => `${p.y.toFixed(4)} ${p.x.toFixed(4)}`;

    const elementer = linje.elementer.map(el => {
      if (el.type === 'linje') {
        return `        <Line length="${el.lengde.toFixed(4)}" staStart="${el.s0.toFixed(4)}">
          <Start>${nk({ x: el.x1, y: el.y1 })}</Start>
          <End>${nk({ x: el.x2, y: el.y2 })}</End>
        </Line>`;
      }
      const a = linje.punktVed(el.s0), b = linje.punktVed(el.s0 + el.lengde);
      /* PI er tangentskjæringspunktet, altsa selve knekkpunktet - ikke
         midtpunktet pa buen. Med buemidtpunktet ble geometrien inntil 12 m
         feil i en krapp sving for lesere som bygger linja opp fra PI. */
      const kurve = linje.kurver.find(k => Math.abs(k.sBC - el.s0) < 1e-6);
      const pi = kurve && kurve.ipPunkt ? kurve.ipPunkt : linje.punktVed(el.s0 + el.lengde / 2);
      return `        <Curve rot="${el.tegn > 0 ? 'ccw' : 'cw'}" radius="${el.r.toFixed(4)}" length="${el.lengde.toFixed(4)}" staStart="${el.s0.toFixed(4)}">
          <Start>${nk(a)}</Start>
          <Center>${nk({ x: el.cx, y: el.cy })}</Center>
          <End>${nk(b)}</End>
          <PI>${nk(pi)}</PI>
        </Curve>`;
    }).join('\n');

    /* Lengdeprofilen ma ha vertikalkurvene med.
       Her sto det bare `<PVI>` for hvert knekkpunkt, og da leser mottakeren
       lengdeprofilen som en kjede rette strekk med skarpe brekk. Forskjellen
       er ikke liten: en kurve med K=2 over et stigningsbrudd pa 20 % er 40 m
       lang, og veien ligger da 1,0 m lavere i høybrekket enn de rene
       knekkpunktene sier. Det tallet gar rett inn i maskinstyringen.

       LandXML uttrykker en parabolsk vertikalkurve som <ParaCurve> i stedet
       for <PVI> pa selve knekkpunktet, med kurvelengden som attributt. */
    const vp = app.vprofil && Array.isArray(app.vprofil.kurver)
      ? app.vprofil : new Vertikalprofil(app.P.vip);
    const pvi = vp.vip.map((v, i) => {
      const kurve = (vp.kurver || []).find(c => c.vip === i);
      return kurve && kurve.L > 1e-6
        ? `          <ParaCurve length="${kurve.L.toFixed(4)}">${v.s.toFixed(4)} ${v.z.toFixed(4)}</ParaCurve>`
        : `          <PVI>${v.s.toFixed(4)} ${v.z.toFixed(4)}</PVI>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="${nå.slice(0, 10)}" time="${nå.slice(11, 19)}">
  <Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
  <Application name="Massekalk" manufacturer="Hauge Maskin" version="1.0"/>
  <CoordinateSystem epsgCode="${Geo.epsg(app.sone)}" horizontalDatum="ETRS89" verticalDatum="NN2000"/>
  <Alignments name="${this.xml(app.P.navn)}">
    <Alignment name="${this.xml(app.P.navn)}" length="${linje.lengde.toFixed(4)}" staStart="0">
      <CoordGeom>
${elementer}
      </CoordGeom>
      <Profile name="Lengdeprofil">
        <ProfAlign name="Veglinje">
${pvi}
        </ProfAlign>
      </Profile>
    </Alignment>
  </Alignments>
</LandXML>
`;
  },

  /**
   * SOSI – norsk standard for kartdata.
   *
   * Koordinatene oppgis i hele centimeter, som ENHET 0.01 sier. Filen far
   * senterlinjen som en kurve og fotavtrykket som en flate.
   */
  sosi(app, res) {
    const punkter = this.punkter(app, res);
    const cm = v => Math.round(v * 100);
    // omradet ma dekke alt som faktisk star i filen, ikke bare senterlinjen
    let minN = Infinity, maksN = -Infinity, minO = Infinity, maksO = -Infinity;
    for (const p of punkter) {
      for (const q of [p.senter, p.venstre, p.hoyre]) {
        minN = Math.min(minN, q.n); maksN = Math.max(maksN, q.n);
        minO = Math.min(minO, q.o); maksO = Math.max(maksO, q.o);
      }
    }

    const rader = [];
    rader.push('.HODE');
    rader.push('..TEGNSETT UTF-8');
    rader.push('..TRANSPAR');
    rader.push('...KOORDSYS ' + (app.sone === 32 ? 22 : app.sone === 33 ? 23 : 25));
    /* Høydene er NN2000. Star det ingenting, tolker mottakeren dem etter sin
       egen forvalgte referanse - og er den NN54, forskyves hele profilen med
       et par desimeter uten at noen ser det. */
    rader.push('...VERT-DATUM NN2000');
    rader.push('...ORIGO-NØ 0 0');
    rader.push('...ENHET 0.01');
    rader.push('..OMRÅDE');
    rader.push(`...MIN-NØ ${cm(minN)} ${cm(minO)}`);
    rader.push(`...MAX-NØ ${cm(maksN)} ${cm(maksO)}`);
    rader.push('..SOSI-VERSJON 4.5');
    rader.push('..SOSI-NIVÅ 2');

    rader.push('.KURVE 1:');
    rader.push('..OBJTYPE Vegsenterlinje');
    // linjeskift i navnet ville brutt SOSI-strukturen
    rader.push('..VEGNAVN ' + String(app.P.navn).replace(/[\r\n]+/g, ' ').slice(0, 60));
    rader.push('..NØH');
    for (const p of punkter) rader.push(`${cm(p.senter.n)} ${cm(p.senter.o)} ${cm(p.senter.z)}`);

    rader.push('.KURVE 2:');
    rader.push('..OBJTYPE Vegkant');
    rader.push('..NØH');
    for (const p of punkter) rader.push(`${cm(p.venstre.n)} ${cm(p.venstre.o)} ${cm(p.venstre.z)}`);

    rader.push('.KURVE 3:');
    rader.push('..OBJTYPE Vegkant');
    rader.push('..NØH');
    for (const p of punkter) rader.push(`${cm(p.hoyre.n)} ${cm(p.hoyre.o)} ${cm(p.hoyre.z)}`);

    rader.push('.SLUTT');
    return rader.join('\r\n') + '\r\n';
  },

  /**
   * DXF – enkel tegning med senterlinje, vegkanter og fotavtrykk.
   *
   * Skrevet som R12-ASCII, som er det formatet flest program leser uten
   * innsigelser.
   */
  dxf(app, res) {
    const p = this.punkter(app, res);
    const ut = [];
    const par = (kode, verdi) => { ut.push(String(kode)); ut.push(String(verdi)); };

    par(0, 'SECTION'); par(2, 'ENTITIES');
    const polylinje = (navn, farge, punkt, medHoyde) => {
      par(0, 'POLYLINE'); par(8, navn); par(62, farge); par(66, 1); par(70, 8);
      for (const q of punkt) {
        par(0, 'VERTEX'); par(8, navn); par(70, 32);
        par(10, q.o.toFixed(4)); par(20, q.n.toFixed(4)); par(30, (medHoyde ? q.z : 0).toFixed(4));
      }
      par(0, 'SEQEND'); par(8, navn);
    };
    polylinje('SENTERLINJE', 1, p.map(q => q.senter), true);
    polylinje('VEGKANT', 3, p.map(q => q.venstre), true);
    polylinje('VEGKANT', 3, p.map(q => q.hoyre), true);

    const fot = [];
    for (const pr of res.profiler) fot.push(app.linje.punktMedAvvik(pr.s, pr.fotVenstre));
    for (let i = res.profiler.length - 1; i >= 0; i--) {
      fot.push(app.linje.punktMedAvvik(res.profiler[i].s, res.profiler[i].fotHoyre));
    }
    polylinje('FOTAVTRYKK', 2, fot.map(q => ({ n: q.y, o: q.x, z: 0 })), false);

    // profilnummer som tekst
    for (const q of p) {
      if (Math.round(q.s) % 50 !== 0) continue;
      par(0, 'TEXT'); par(8, 'PROFILNUMMER'); par(62, 7);
      par(10, q.senter.o.toFixed(4)); par(20, q.senter.n.toFixed(4)); par(30, '0');
      par(40, '2'); par(1, String(Math.round(q.s)));
    }
    par(0, 'ENDSEC'); par(0, 'EOF');
    return ut.join('\r\n') + '\r\n';
  },

  tekst(s, bredde) { return String(s).slice(0, bredde).padEnd(bredde); },
  xml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
};

if (typeof module !== 'undefined') module.exports = Eksport;
