'use strict';
/**
 * Selvtest.
 *
 *   node test/selftest.js
 *
 * Kontrollerer koordinatregning, linjeføring, lengdeprofil og - viktigst -
 * at masseberegningen gir nøyaktig det man far ved a regne tverrsnittet for hand.
 * Til slutt sjekkes terrengmodellen mot Kartverket sitt offisielle punkt-API.
 */

const path = require('path');
const Geo = require(path.join(__dirname, '..', 'public', 'js', 'geo.js'));
const { Linjeforing } = require(path.join(__dirname, '..', 'public', 'js', 'linjeforing.js'));
const { Vertikalprofil, foreslaProfil, lesHoydetabell, rettVertikalgeometri, rettProfil } = require(path.join(__dirname, '..', 'public', 'js', 'vertikalprofil.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));
const VK = require(path.join(__dirname, '..', 'public', 'js', 'veiklasser.js'));
const H = require(path.join(__dirname, '..', 'lib', 'hoydedata.js'));
const { Terreng, FLIS_M } = require(path.join(__dirname, '..', 'public', 'js', 'terreng.js'));

/* HÅNDREGNINGENE I DENNE FILA GJELDER DEN KLASSISKE MODELLEN.
   Rensk på en fast dybde, ingen masseutskifting. Fasitverdiene er regnet for
   akkurat den, og de skal fortsatt måle det de ble regnet for. Utskiftingen –
   der alt under vegkroppen graves ned til fjell og fylles tilbake – har sine
   egne prøver i seksjon 4u, med sine egne håndregninger. */
const KLASSISK = Object.assign({}, M.StandardMal, { utskifting: false });

let feil = 0, ok = 0;
function sjekk(navn, faktisk, ventet, toleranse) {
  const avvik = Math.abs(faktisk - ventet);
  if (avvik <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(avvik)}, grense ${toleranse})`); }
}
function paastand(navn, sant) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}`); }
}
const fmt = v => (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(7));

/* ------------------------------------------------------------------ */
console.log('\n1. Koordinatregning');
{
  const lat = 58.1412, lon = 7.0705;
  const s = Geo.sone(lon);
  paastand('sone 32 for Lyngdal', s === 32);
  sjekk('EPSG for sone 32', Geo.epsg(32), 25832, 0);
  sjekk('EPSG for sone 33', Geo.epsg(33), 25833, 0);
  sjekk('EPSG for sone 35', Geo.epsg(35), 25835, 0);
  paastand('EPSG tilbake til sone', Geo.soneFraEpsg(25833) === 33);
  const u = Geo.tilUtm(lat, lon, s);
  const t = Geo.fraUtm(u.x, u.y, s);
  sjekk('rundtur breddegrad', t.lat, lat, 1e-9);
  sjekk('rundtur lengdegrad', t.lon, lon, 1e-9);

  // Kjent kontroll: midtmeridianen i sone 33 skal gi øst = 500000
  const m = Geo.tilUtm(60, 15, 33);
  sjekk('midtmeridian gir øst 500000', m.x, 500000, 1e-6);

  // Malestokk pa midtmeridianen skal vaere 0,9996
  sjekk('malestokk på midtmeridianen', Geo.malestokk(500000, 6650000, 33), 0.9996, 1e-9);
  const k = Geo.malestokk(u.x, u.y, 32);
  paastand('malestokk i Lyngdal er mellom 0,9996 og 1,0002', k > 0.9996 && k < 1.0002);
}

/* ------------------------------------------------------------------ */
console.log('\n2. Linjeføring');
{
  // Rett strekk pa 300 m
  const rett = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 300, y: 0, r: 0 }]);
  sjekk('lengde rett strekk', rett.lengde, 300, 1e-9);
  sjekk('punkt midt på', rett.punktVed(150).x, 150, 1e-9);

  // 90-graders sving med R = 50: tangent = 50, buelengde = 50*pi/2
  const sving = new Linjeforing([
    { x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 50 }, { x: 200, y: 200, r: 0 }
  ]);
  const ventetLengde = (200 - 50) + 50 * Math.PI / 2 + (200 - 50);
  sjekk('lengde med 90° kurve', sving.lengde, ventetLengde, 1e-6);
  sjekk('radius i kurven', sving.radiusVed(200), 50, 1e-9);
  paastand('rettstrekk har uendelig radius', !isFinite(sving.radiusVed(10)));
  sjekk('BC ligger 150 m ut', sving.kurver[0].sBC, 150, 1e-9);
  const bue = sving.punktVed(150 + 50 * Math.PI / 4);   // midt i kurven
  const r = Math.hypot(bue.x - 150, bue.y - 50);
  sjekk('buepunkt har rett avstand fra kurvesenter', r, 50, 1e-6);
  sjekk('venstresving gir positiv krumning', bue.krumning, 1 / 50, 1e-9);

  // Projeksjon
  const pr = rett.projiser(120, 7);
  sjekk('projisert profilnummer', pr.s, 120, 0.05);
  sjekk('projisert avvik', pr.avvik, -7, 0.05);   // nord for en østgående linje = venstre

  // For stor radius skal kortes inn, ikke gi tull
  const trang = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 40, y: 0, r: 500 }, { x: 40, y: 40, r: 0 }]);
  paastand('for stor radius blir kortet inn', trang.advarsler.length > 0 && trang.lengde > 0);
}

/* ------------------------------------------------------------------ */
console.log('\n3. Lengdeprofil');
{
  // To stigninger: +5 % og -5 %, K = 2 => A = 10 %, L = 20 m
  const vp = new Vertikalprofil([
    { s: 0, z: 100, k: 2 }, { s: 100, z: 105, k: 2 }, { s: 200, z: 100, k: 2 }
  ]);
  sjekk('stigning på første strekk', vp.stigning(30), 0.05, 1e-9);
  sjekk('kurvelengde L = K·A', vp.kurver[0].L, 20, 1e-9);
  sjekk('høyde i BVC', vp.hoyde(90), 104.5, 1e-9);
  // Toppunktet i en symmetrisk parabel ligger 0,25*A*L/... under VIP: dz = A*L/8
  sjekk('høyde i toppunktet', vp.hoyde(100), 105 - 0.10 * 20 / 8, 1e-9);
  sjekk('stigning i toppunktet', vp.stigning(100), 0, 1e-12);
  sjekk('høyde utenfor kurven', vp.hoyde(150), 102.5, 1e-9);

  // Forslag skal holde makskravet nar terrenget i snitt er slakt nok
  const st = [], zt = [];
  for (let s = 0; s <= 400; s += 5) { st.push(s); zt.push(100 + s * 0.10 + 4 * Math.sin(s / 25)); }
  const forslag = foreslaProfil(st, zt, { vipAvstand: 40, maksStigning: 0.2, k: 1 });
  const vp2 = new Vertikalprofil(forslag);
  paastand('profilforslag holder maks stigning', vp2.maksStigning(1) <= 0.2001);
  paastand('profilforslag følger terrenget rimelig',
    Math.abs(vp2.hoyde(200) - (100 + 20 + 4 * Math.sin(8))) < 6);

  // Brattere enn kravet tillater: da er 20 % umulig, men svaret ma likevel vaere brukbart
  const bratt = foreslaProfil(st, st.map(s => 100 + s * 0.35), { vipAvstand: 40, maksStigning: 0.2, k: 1 });
  const vp3 = new Vertikalprofil(bratt);
  paastand('umulig terreng gir fortsatt gyldige tall',
    bratt.every(v => isFinite(v.z)) && vp3.maksStigning(5) > 0.2);

  /* VEGEN SKAL VÆRE DEN SAMME UANSETT HVILKEN ENDE MAN STASJONERER FRA.
     Innkortingen av vertikalkurver som ellers ville overlappe var grådig:
     hver VIP ble målt mot naboens ALLEREDE reduserte lengde bakover, men mot
     naboens FULLE ønskede lengde forover – fordi løkka går oppover. Den
     fremste av to som konkurrerer om det samme strekket tok da alt.
     Målt på fire VIP-er med tjue prosents stigningsbrudd: ÉN kurve på 199,8 m,
     og knekkpunktet imellom helt uavrundet. Speilvender man den samme vegen,
     ble høyden 4,995 m forskjellig på det samme punktet i terrenget. På et
     kupert profil på 600 m: 0,680 m.

     Dette er en invariant, ikke en toleranse: samme veg, samme svar. */
  {
    const spegl = (V, L) => V.map(v => ({ s: L - v.s, z: v.z, k: v.k })).reverse();
    const avvik = (V, L) => {
      const a = new Vertikalprofil(V), b = new Vertikalprofil(spegl(V, L));
      let v = 0;
      for (let s = 0; s <= L; s += 0.5) v = Math.max(v, Math.abs(a.hoyde(s) - b.hoyde(L - s)));
      return { v, kurver: a.kurver.length, speglaKurver: b.kurver.length };
    };
    const konstruert = avvik([{ s: 0, z: 0, k: 10 }, { s: 100, z: 10, k: 10 },
      { s: 200, z: 0, k: 10 }, { s: 300, z: 10, k: 10 }], 300);
    sjekk('speilvendt veg gir nøyaktig samme profil', konstruert.v, 0, 1e-9);
    /* Og begge de konkurrerende knekkpunktene skal FÅ en kurve – den grådige
       utgaven ga bare én, og lot et tjue prosents brudd stå uavrundet. */
    paastand('  og begge de konkurrerende knekkpunktene får sin kurve',
      konstruert.kurver === 2 && konstruert.speglaKurver === 2);

    /* Og over mange profil, så prøven ikke hviler på ett heldig tilfelle. */
    let verst = 0, verstNavn = '';
    for (let n = 0; n < 200; n++) {
      const m = 4 + (n % 9), dl = 20 + (n % 40), V = [];
      let z = 100;
      for (let i = 0; i < m; i++) {
        z += ((n * 7 + i * 13) % 21 - 10) * 0.4;
        V.push({ s: i * dl, z, k: 2 + ((n + i) % 18) });
      }
      const d = avvik(V, (m - 1) * dl);
      if (d.v > verst) { verst = d.v; verstNavn = m + ' vip, avstand ' + dl + ' m'; }
    }
    sjekk('    og det holder over to hundre ulike profil'
      + (verstNavn ? ' (verst: ' + verstNavn + ')' : ''), verst, 0, 1e-9);
  }

  /* KORRIDORLASTEREN MÅ BE OM HVER FLIS DEN SLÅR OPP I.
     Korridoren ble prøvd i punkt seksten meter fra hverandre på tvers, mens en
     flis er 256 meter. Klipper korridoren et flishjørne i en kile smalere enn
     seksten meter, faller flisen mellom to prøvepunkt og blir aldri bestilt –
     men den blir slått opp i. Målt: én flis slått opp i 237 ganger uten å være
     blant de sytten bestilte, med hullet midt inne i tverrsnittet. Utslaget
     var falske merknader om at «terrengmodellen har hull i dette tverrsnittet»
     på data Kartverket faktisk har.

     Invarianten er absolutt og lar seg prøve uten nett: ingen flis skal slås
     opp i uten å være bestilt. Med den gamle punktprøvingen slår det til på
     fire av fire hundre tilfeldige traséer. */
  {
    const lagT = () => {
      const t = Object.create(Terreng.prototype);
      t.P = FLIS_M; t.res = 1; t.fliser = new Map();
      t.bestilt = new Set(); t.slaattOpp = new Set();
      t._lastFliser = async (trengs) => { for (const k of trengs) t.bestilt.add(k); };
      t._celle = function (gi, gj) {
        const tx = Math.floor(gi / this.P);
        const ty = Math.ceil(-gj / this.P) - 1;
        this.slaattOpp.add(this.nøkkel(tx, ty));
        return NaN;                      // vi maler bare hvilke fliser som trengs
      };
      return t;
    };
    const slump = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    let uventa = 0, traff = 0, provde = 0, verstN = null;
    for (let n = 0; n < 200; n++) {
      const ip = [];
      const m = 2 + Math.floor(slump(n) * 3);
      let x = 200000 + slump(n + 1) * 600000, y = 6500000 + slump(n + 2) * 900000;
      for (let i = 0; i <= m; i++) {
        x += (slump(n * 10 + i) - 0.5) * 2000;
        y += (slump(n * 10 + i + 5) - 0.5) * 2000;
        ip.push({ x, y, r: i > 0 && i < m ? 50 + slump(n + i) * 300 : 0 });
      }
      let linje;
      try { linje = new Linjeforing(ip); } catch (e) { continue; }
      if (!(linje.lengde > 50)) continue;
      const hb = 20 + slump(n + 7) * 50;
      const t = lagT();
      t.lastKorridor(linje, hb, null);   // _lastFliser er synkron her
      provde++;
      for (let s = 0; s <= linje.lengde; s += 1) {
        const p = linje.punktVed(s);
        const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
        for (let tt = -hb; tt <= hb; tt += 0.5) t.z(p.x + nx * tt, p.y + ny * tt);
      }
      let mangla = 0;
      for (const k of t.slaattOpp) if (!t.bestilt.has(k)) mangla++;
      if (mangla) { traff++; if (mangla > uventa) { uventa = mangla; verstN = n; } }
    }
    paastand('korridoren prøvde noe i det hele tatt', provde > 100);
    sjekk('ingen flis slås opp i uten å være bestilt'
      + (verstN != null ? ' (verst trasé ' + verstN + ')' : ''),
    traff, 0, 0);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n3b. Innlagte høyder');
{
  // Innlesing av en limt inn tabell
  const rader = lesHoydetabell(`
    Profil   Høyde
    0        269,54
    5;269.76
    10\t270.01
    0+015    270,30
    tull uten tall
    20 270.55 (kommentar)
  `);
  sjekk('leste alle radene', rader.length, 5, 0);
  sjekk('komma som desimaltegn', rader[0].z, 269.54, 1e-9);
  sjekk('semikolon som skille', rader[1].z, 269.76, 1e-9);
  sjekk('tabulator som skille', rader[2].z, 270.01, 1e-9);
  sjekk('profilnummer på formen 0+015', rader[3].s, 15, 1e-9);
  sjekk('siste rad', rader[4].z, 270.55, 1e-9);

  // Laste høyder skal ligge nøyaktig der de er satt
  const st = [], zt = [];
  for (let s = 0; s <= 300; s += 5) { st.push(s); zt.push(100 + s * 0.08); }
  const laste = [{ s: 0, z: 95.5, k: 0 }, { s: 150, z: 108.0, k: 0 }, { s: 300, z: 130.0, k: 0 }];
  const vip = foreslaProfil(st, zt, { vipAvstand: 40, maksStigning: 0.2, k: 1, laste });
  const vp = new Vertikalprofil(vip);
  for (const l of laste) sjekk(`låst høyde ved profil ${l.s}`, vp.hoyde(l.s), l.z, 1e-6);
  paastand('låste punkt er merket', vip.filter(v => v.laast).length === 3);
  paastand('forslaget har også frie punkt mellom', vip.some(v => !v.laast));

  /* Et last punkt er noe veien skal gjennom, ikke et knekkpunkt for
     tangentene. Med vertikalkurve ville linjen gatt A·L/8 forbi punktet,
     sa laste punkt ma ha K = 0 for a treffes eksakt. */
  const medKurve = new Vertikalprofil([
    { s: 0, z: 100, k: 2 }, { s: 100, z: 105, k: 2 }, { s: 200, z: 100, k: 2 }
  ]);
  paastand('med vertikalkurve treffer linjen ikke knekkpunktet',
    Math.abs(medKurve.hoyde(100) - 105) > 0.2);
  const utenKurve = new Vertikalprofil([
    { s: 0, z: 100, k: 0 }, { s: 100, z: 105, k: 0 }, { s: 200, z: 100, k: 0 }
  ]);
  sjekk('uten vertikalkurve treffes punktet eksakt', utenKurve.hoyde(100), 105, 1e-12);

  /* Kravet er strengere i lassretningen enn i returretningen, og hvilket som
     gjelder avhenger av fortegnet. Forslaget ma hente kravet pa nytt for hvert
     strekk, ellers blir det lagt 20 % der bare 17 % er lov. */
  const bakke = [], bakkeZ = [];
  for (let s = 0; s <= 400; s += 5) { bakke.push(s); bakkeZ.push(100 + s * 0.30); }
  const retningsprofil = foreslaProfil(bakke, bakkeZ, {
    vipAvstand: 40, k: 0,
    // 12 % nar det bærer oppover, 20 % nar det bærer nedover
    maksStigningFor: (a, b, g) => (g > 0 ? 0.12 : 0.20)
  });
  const vpRetning = new Vertikalprofil(retningsprofil);
  let verstOpp = 0;
  for (let s = 0; s < 400; s += 5) verstOpp = Math.max(verstOpp, vpRetning.stigning(s));
  paastand('forslaget holder det strenge kravet i stigende retning', verstOpp <= 0.1201);

  /* Grensene mot terrenget skal hindre at profilen legger seg høyt over
     bakken og gir fyllinger som stikker langt ut til sidene. */
  const lagDal = (djup, sigma) => {
    const s = [], z = [];
    for (let i = 0; i <= 400; i += 5) { s.push(i); z.push(100 - djup * Math.exp(-Math.pow((i - 200) / sigma, 2))); }
    return { s, z };
  };
  const verst = (vip, z) => {
    let f = 0, sk = 0;
    for (const v of vip) { const t = z[Math.round(v.s / 5)]; f = Math.max(f, v.z - t); sk = Math.max(sk, t - v.z); }
    return { fylling: f, skjaering: sk };
  };

  // Slak dal: her lar bade stigningskravet og grensen seg oppfylle
  const slak = lagDal(6, 40);
  const slakVip = foreslaProfil(slak.s, slak.z, {
    vipAvstand: 40, maksStigning: 0.2, k: 0, maksOverTerreng: 3, maksUnderTerreng: 5
  });
  const slakVerst = verst(slakVip, slak.z);
  paastand('i slakt lende holdes grensen mot terrenget', slakVerst.fylling <= 3.05 && slakVerst.skjaering <= 5.05);
  paastand('og stigningskravet holdes samtidig', new Vertikalprofil(slakVip).maksStigning(1) <= 0.2001);
  /* GRENSEN MÅ PRØVES DER DEN FAKTISK BITER.
     Påstanden over er navngitt etter `maksOverTerreng: 3` og
     `maksUnderTerreng: 5`, men i denne slake dalen legger forslaget seg 0,571 m
     over og 0,197 m under terrenget. Marginen er faktor 5 og faktor 26.

     Målt: med grensene satt fra 0,05 til 100 er svaret NØYAKTIG det samme –
     0,571 / 0,197 hele veien. Påstanden ville stått grønn med reglene revet ut
     av koden.

     Og grunnen er verdt å vite: regelen måler mot GLATTET terreng
     (`lagTerrengoppslag(stasjoner, glattet)` i vertikalprofil.js), mens prøven
     måler mot det rå. I en slak dal er de to nesten like, og forslaget ligger
     innenfor uansett. En prøve i slakt lende kan derfor ikke se regelen i det
     hele tatt.

     Under prøves den der den biter: en dyp, trang dal der forslaget ellers
     legger seg 13,8 m over bunnen. Målt der: 13,80 m uten grense mot 12,26 m
     med grense 3 – regelen drar profilen halvannen meter ned. */
  const djupDal = lagDal(25, 18);
  const djupUten = verst(foreslaProfil(djupDal.s, djupDal.z, {
    vipAvstand: 40, maksStigning: 0.2, k: 0
  }), djupDal.z);
  const djupMed = verst(foreslaProfil(djupDal.s, djupDal.z, {
    vipAvstand: 40, maksStigning: 0.2, k: 0, maksOverTerreng: 3, maksUnderTerreng: 5
  }), djupDal.z);
  paastand('i dyp dal drar grensen profilen ned mot bakken',
    djupMed.fylling < djupUten.fylling - 0.5,
    `uten ${djupUten.fylling.toFixed(2)} m mot med ${djupMed.fylling.toFixed(2)} m`);

  /* Trang kløft: her star kravene mot hverandre. Veien kan ikke følge bunnen
     uten a bryte stigningskravet, sa kløften ma brues. Grensen kan da ikke
     oppfylles, men den skal likevel dra fyllingen ned - og resten fanges av
     merknadene. */
  const kloft = lagDal(25, 22);
  const utenGrense = verst(foreslaProfil(kloft.s, kloft.z, { vipAvstand: 40, maksStigning: 0.2, k: 0 }), kloft.z);
  const medGrense = verst(foreslaProfil(kloft.s, kloft.z, {
    vipAvstand: 40, maksStigning: 0.2, k: 0, maksOverTerreng: 3, maksUnderTerreng: 5
  }), kloft.z);
  paastand('i trang kløft drar grensen fyllingen ned', medGrense.fylling < utenGrense.fylling - 1);
  paastand('men stigningskravet slipper ikke taket',
    new Vertikalprofil(foreslaProfil(kloft.s, kloft.z, {
      vipAvstand: 40, maksStigning: 0.2, k: 0, maksOverTerreng: 3, maksUnderTerreng: 5
    })).maksStigning(1) <= 0.2001);

  // Uten laste punkt skal profilen fortsatt legge seg pa terrenget
  const utenLas = new Vertikalprofil(foreslaProfil(st, zt, { vipAvstand: 40, maksStigning: 0.2, k: 1 }));
  paastand('uten låsing følger profilen terrenget', Math.abs(utenLas.hoyde(150) - (100 + 150 * 0.08)) < 3);

  // Alt last: profilen skal vaere nøyaktig som oppgitt, ogsa mellom punktene
  const alt = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.2, k: 0,
    laste: st.map(s => ({ s, z: 200 + Math.sin(s / 40) * 3, k: 0 }))
  });
  const vpAlt = new Vertikalprofil(alt);
  let maksAvvik = 0;
  for (const s of st) maksAvvik = Math.max(maksAvvik, Math.abs(vpAlt.hoyde(s) - (200 + Math.sin(s / 40) * 3)));
  sjekk('full høydetabell gjengis nøyaktig', maksAvvik, 0, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n4. Masseberegning mot handregning');
{
  // Flatt terreng i kote 100, rett veg i kote 100.
  const terreng = { z: () => 100 };
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const mal = Object.assign({}, KLASSISK);
  const fjell = new M.Fjellmodell({ standarddybde: 99, punkter: [] });

  const pr = M.beregnTverrprofil({
    linje, terreng, mal, fjell, s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });

  /* Handregning, en side, med normalens verdier (tverrfall 5 %,
     grøft 0,20 m under planum, grøftebunn 0,30 m):
       hb        = 2,25            planum ved senter = 100 - 0,70 = 99,30
       terreng etter rensk         = 99,80
       planum ved vegkant          = 100 - 0,05·2,25 - 0,70 = 99,1875

     SKULDEREN. Vegkroppen har skrå kant, ikke loddrett: overbygningen er
     0,70 m og kanten skrår 1:1,5, så planum går 0,70·1,5 = 1,05 m forbi
     vegkanten før grøfta tar over. Uten den sto vegkroppen som en plate med
     loddrett vegg og hang ut i lufta – se `overbygningHelning` i malen.
       skulderkant                 = 2,25 + 1,05 = 3,30
       grøftebunn                  = 99,1875 - 0,20 = 98,9875
       t1 = 3,30 + 0,20·1,0 = 3,50     t2 = 3,80
       skraning 1:1,5 opp 0,8125 m => 1,21875 m ut, fot ved t = 5,01875
       areal = 1,2515625 (under vegen)
             + 0,643125   (skulderen: 0,6125 m dyp over 1,05 m)
             + 0,1425     (grøftas innerskråning)
             + 0,24375    (grøftebunnen)
             + 0,49511719 (skråningen opp til terrenget)
             = 2,77605469  */
  const enSide = 2.77605469;
  sjekk('skjæringsareal (begge sider)', pr.areal.skjaering, 2 * enSide, 0.01);
  sjekk('fyllingsareal', pr.areal.fylling, 0, 1e-6);
  sjekk('skjæringsfot høyre', pr.fotHoyre, 5.01875, 0.01);
  sjekk('renskeareal', pr.areal.rensk, 0.2 * (2 * 5.01875 + 2), 0.02);
  /* 0,60 m bærelag i full bredde, og i tillegg de øverste 0,10 m pa den halve
     meteren skulder som ligger utenfor slitelaget - der gar bærelaget helt
     opp til veinivaet. PLUSS de to kilene på skuldrene: vegkroppens skrå kant
     er `overbygningHelning · ob²` = 1,5 · 0,49 = 0,735 m²/lm, og den er
     bærelagsmasse - slitelaget skal ikke ut på skulderen. */
  sjekk('bærelagsareal', pr.areal.baerelag,
    0.6 * 4.5 + 0.1 * (4.5 - 4.0) + 1.5 * 0.7 * 0.7, 1e-9);
  /* Og med kanten satt loddrett er det plata igjen – slik det var før. */
  {
    const flat = M.beregnTverrprofil({
      linje, terreng, mal: Object.assign({}, mal, { overbygningHelning: 0 }),
      fjell, s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
    });
    sjekk('  uten kanthelning er bærelaget plata igjen',
      flat.areal.baerelag, 0.6 * 4.5 + 0.1 * (4.5 - 4.0), 1e-9);
    sjekk('  og foten står der den sto', flat.fotHoyre, 3.96875, 0.01);
  }
  sjekk('slitelagsareal', pr.areal.slitelag, 0.1 * 4.0, 1e-9);
  sjekk('ingen fjell når fjellet ligger 99 m nede', pr.areal.skjaeringFjell, 0, 1e-9);

  // Alt i fjell
  const prFjell = M.beregnTverrprofil({
    linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 0 }),
    s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });
  paastand('alt regnes som fjell når fjellet ligger i dagen',
    Math.abs(prFjell.areal.skjaeringFjell - prFjell.areal.skjaering) < 1e-6);

  /* RENSK OG SKJÆRING MÅ MØTES I SAMME FLATE.
     Skjæringen ble målt fra `terrRå − renskDybde`, en fast dybde, mens
     renskeposten med rette bokfører `min(renskDybde, dybden til fjell)` –
     det er ingenting å skrape av der fjellet ligger i dagen. De to var altså
     uenige, og laget mellom dem havnet i ingen post. Målt før rettingen: med
     fjellet i dagen 29,908 m²/lm skjæring + 0,000 rensk mot 31,793 fysisk –
     manko 1,885, seks prosent, alt sammen på fjellposten.

     Invarianten er at summen skal være UAVHENGIG av fjelldybden når fjell og
     løsmasse har samme skråningshelning: hullet er det samme, det er bare
     fordelingen mellom postene som flytter seg. */
  {
    /* Invarianten er IKKE at summen er den samme uansett fjelldybde – det er
       den ikke, og det er riktig: ligger fjellet i dagen, må skråningen starte
       en renskedybde høyere og blir bredere på toppen. Målt til 0,060 m²/lm,
       nøyaktig de to kilene `renskDybde² × helning` gir.

       Invarianten er at INGEN KUBIKK FALLER MELLOM POSTENE: alt mellom rå
       terreng og den ferdige jordarbeidsflaten skal være bokført én gang, som
       skjæring eller som rensk. Det måles mellom skråningsføttene, så
       `renskUtenfor` – som ligger utenfor og med rette ikke har noen skjæring
       – ikke blander seg inn. */
    const arealAv = (A, B, fra, til) => {
      let s2 = 0;
      for (let i = 0; i < Math.min(A.length, B.length) - 1; i++) {
        const t0 = A[i][0], t1 = A[i + 1][0];
        if (t1 <= fra || t0 >= til || Math.abs(t1 - t0) < 1e-12) continue;
        const d0 = Math.max(0, A[i][1] - B[i][1]), d1 = Math.max(0, A[i + 1][1] - B[i + 1][1]);
        s2 += (d0 + d1) / 2 * (t1 - t0);
      }
      return s2;
    };
    let verst = 0, verstFd = null;
    for (const fd of [0, 0.05, 0.10, 0.15, 0.20, 0.50, 2.0]) {
      const pr2 = M.beregnTverrprofil({
        linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: fd, punkter: [] }),
        s: 50, vegnivaa: 96, utvidelse: 0, integrasjonssteg: 0.02
      });
      const g2 = pr2.geometri;
      const fra = g2.terreng[0][0], til = g2.terreng[g2.terreng.length - 1][0];
      // alt som skal graves bort, fra rå mark ned til jordarbeidsflaten
      const alt = arealAv(g2.terreng, g2.jord, fra, til);
      /* Det BOKFØRTE rensketallet, ikke det tegnede. Her sto `geometri.rensk`,
         og den prøven kunne ikke feile: tegningen er selvsagt enig med seg
         selv – den tegnes av den samme `terr` som skjæringen måles fra. Det
         som var uenig, var posten. Stripa utenfor skråningsfoten bokføres med
         den virkelige dybden, og på flatt terreng med jevnt fjell er den
         nøyaktig `2 · renskUtenfor · min(renskDybde, fjelldybde)`. */
      const stripe = 2 * mal.renskUtenfor * Math.min(mal.renskDybde, fd);
      const avvik = Math.abs(pr2.areal.skjaering + pr2.areal.rensk - stripe - alt);
      if (avvik > verst) { verst = avvik; verstFd = fd; }
    }
    sjekk('ingen kubikk faller mellom rensken og skjæringen'
      + (verstFd === null ? '' : ' (verst ved fjelldybde ' + verstFd + ')'),
      verst, 0, 0.01);
    /* Og der fjellet ligger grunnere enn renskedybden, skal ALT under
       fjellflaten være bokført som fjell – ikke som ingenting. */
    const iDagen = M.beregnTverrprofil({
      linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 0, punkter: [] }),
      s: 50, vegnivaa: 96, utvidelse: 0, integrasjonssteg: 0.02
    });
    const dypt = M.beregnTverrprofil({
      linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 0.20, punkter: [] }),
      s: 50, vegnivaa: 96, utvidelse: 0, integrasjonssteg: 0.02
    });
    paastand('fjell i dagen gir MER fjell å sprenge, ikke like mye',
      iDagen.areal.skjaeringFjell > dypt.areal.skjaeringFjell + 1.0);

    /* FJELLBREDDEN MÅ VÆRE NULL NÅR DET IKKE ER FJELL.
       Bredden ble lagt til for hvert integrasjonssteg uten en overgang i seg –
       og det dekker både «fjell hele veien» og «fjell ingen steder». Målt:
       et tverrsnitt uten fjell i det hele tatt meldte skjaeringFjell 0,000000
       og fjellbredde 19,938 m. Det går ut som sprengningsareal og som
       «bredeste fjellskjæring», altså et areal ti ganger for stort. Volumet
       var riktig hele tiden, så ingenting så rart ut i totalen.

       Invarianten gjelder hvert eneste profil og koster ingenting å holde. */
    const utenFjell = M.beregnTverrprofil({
      linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      s: 50, vegnivaa: 96, utvidelse: 0, integrasjonssteg: 0.02
    });
    sjekk('uten fjell er fjellbredden null, ikke hele tverrsnittet',
      utenFjell.fjellbredde, 0, 1e-9);
    /* Og der det ER fjell, kan bredden ikke overstige selve skjæringen –
       fjellet ligger inne i hullet, ikke utenfor det. */
    paastand('fjellbredden ligger innenfor skjæringen',
      iDagen.fjellbredde > 0 && iDagen.fjellbredde <= (iDagen.fotHoyre - iDagen.fotVenstre) + 1e-6);

    /* «TIL SAMMEN X M³ SKAL UT AV ANLEGGET» MÅ VÆRE ÉN ENHET.
       Rapporten la sammen `tilDeponi`, som er prosjektert FAST volum, med
       `overskuddFjell` og `overskuddLos`, som begge alt er ganget opp til
       FYLLINGSvolum. Målt: 14 499 m³ der det konsekvente tallet er 12 383 –
       17 % for stort. Den samme kubikkmeteren løsmasse telles som 1,00 hvis
       den er ubrukbar og 0,95 hvis den er brukbar men blir til overs. Dette er
       tallet transporten bestilles etter.

       Prøven bruker en ren skjæring uten fylling og uten overbygning. Da er
       fasiten en lukket form: graver man opp alt og bruker ingenting, skal ALT
       ut, og summen er rensk + løsmasse + fjell i fast volum. Og fordi
       ingenting går i fyllingen, kan ikke fyllingsfaktorene røre tallet. */
    {
      const malU = Object.assign({}, KLASSISK,
        { slitelagTykkelse: 0, baerelagTykkelse: 0 });
      const linjeU = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 300, y: 0, r: 0 }]);
      const profilU = new Vertikalprofil([{ s: 0, z: 94, k: 1 }, { s: 300, z: 94, k: 1 }]);
      const kjorU = fakt => M.beregnMasser({
        linje: linjeU, profil: profilU, terreng: { z: () => 100 }, mal: malU,
        fjell: new M.Fjellmodell({ standarddybde: 2, punkter: [] }),
        profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05,
        faktorer: Object.assign({}, M.StandardFaktorer, fakt || {})
      });
      const rU = kjorU();
      const bU = rU.balanse, sU = rU.sum;
      paastand('  ren skjæring: ingenting går i fylling', sU.fylling < 1);
      sjekk('alt som graves opp skal ut, i fast volum',
        bU.utAvAnlegget, sU.rensk + sU.skjaeringLosmasse + sU.skjaeringFjell, 1);
      /* Og da kan ikke en fyllingsfaktor flytte det – den sier bare hvor mye
         massen svulmer NÅR den legges ut, og her legges ingenting ut. */
      const spennU = [1.1, 1.3, 1.6].map(v => kjorU({ fjellIFylling: v }).balanse.utAvAnlegget);
      sjekk('  og sprengningsfaktoren flytter det ikke',
        Math.max(...spennU) - Math.min(...spennU), 0, 0.01);
      const spennL = [0.85, 0.95, 1.05].map(v => kjorU({ losmasseIFylling: v }).balanse.utAvAnlegget);
      sjekk('    og heller ikke løsmassefaktoren',
        Math.max(...spennL) - Math.min(...spennL), 0, 0.01);
      /* Motprøve: det GAMLE, blandede tallet ville flyttet seg med begge. */
      const blanda = v => { const b2 = kjorU({ fjellIFylling: v }).balanse;
        return b2.tilDeponi + b2.overskuddLos + b2.overskuddFjell; };
      paastand('    mens det gamle blandede tallet gjorde det',
        Math.abs(blanda(1.6) - blanda(1.1)) > 100);
    }

    /* ET HULL I LASERDEKNINGEN SKAL TAS DER DET ER.
       Renskeintegrasjonen sto bak en port på `!manglerData`: ett eneste
       NaN-punkt i profilet – også langt utenfor vegen – hoppet over hele
       posten, selv om løkka håndterer manglende punkt lokalt allerede.
       Målt på en rett veg på 200 m med en 0,2 m bred stripe uten dekning ni og
       en halv meter ute: rensken gikk fra 877,51 til 0,00 m³, hundre prosent,
       mens skjæringen mistet 0,21. Rensken går rett i deponiposten. */
    const linje2 = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }]);
    const profil2 = new Vertikalprofil([{ s: 0, z: 96, k: 1 }, { s: 200, z: 96, k: 1 }]);
    const kjorHull = terr2 => M.beregnMasser({
      linje: linje2, profil: profil2, terreng: terr2, mal,
      fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05
    });
    const heilt = kjorHull({ z: () => 100 });
    const medHull = kjorHull({ z: (x, y) => (Math.abs(y - 9.5) < 0.1 ? NaN : 100) });
    const tapt = 1 - medHull.sum.rensk / heilt.sum.rensk;
    /* HVOR MYE ET HULL FAKTISK KOSTER, OG HVORFOR.
       Kravet var «omtrent ingenting» (under 5 %). Det holdt så lenge
       skråningen var kort. Nå har vegkroppen fått skulder, foten står 11,02 m
       ute i stedet for 9,97, og hullet på 9,5 m ligger midt i marsjen i stedet
       for nesten ytterst: tapet gikk fra 2,89 % til 7,43 %.

       Det er IKKE utskiftingen eller skulderen som spiser rensken. Det er at
       skråningsmarsjen BRYTER ved et hull – `if (!isFinite(tZ)) break` – så
       foten settes der hullet er, og alt utenfor faller bort. En lengre
       skråning gir hullet mer å ta. Mekanismen er den samme som før; det er
       lengden som har endret seg.

       Kravet er derfor formulert på det prøven faktisk skal fange: den
       opprinnelige feilen tok HUNDRE prosent av posten fordi ett NaN hvor som
       helst stengte hele renskeintegrasjonen. Et hull skal koste noe – det
       kutter foten – men i størrelsesorden en tidel, ikke alt. */
    paastand('et smalt hull i dekningen tar en bit av rensken, ikke hele',
      tapt > 0 && tapt < 0.15, `tapt ${(tapt * 100).toFixed(2)} %`);
    paastand('  og hullet er grunnen: uten det står posten hel',
      heilt.sum.rensk > 900 && medHull.sum.rensk > 800,
      `${heilt.sum.rensk.toFixed(0)} mot ${medHull.sum.rensk.toFixed(0)} m³`);
    paastand('  og det blir fortsatt sagt fra om at data mangler',
      (medHull.merknader || []).some(m => /data|dekning/i.test(m.tekst || '')));
  }

  // Volum over 100 m
  const res = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 1 }, { s: 100, z: 100, k: 1 }]),
    terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.02
  });
  sjekk('skjæringsvolum over 100 m', res.sum.skjaering, 2 * enSide * 100, 3);
  // plata pluss de to kilene på skuldrene, se bærelagsarealet over
  sjekk('bærelagsvolum over 100 m', res.sum.baerelag,
    (0.6 * 4.5 + 0.1 * 0.5 + 1.5 * 0.7 * 0.7) * 100, 0.5);
  sjekk('lengde', res.lengde, 100, 1e-9);

  // Ren fylling: veg 3 m over terrenget
  const resF = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 103, k: 1 }, { s: 100, z: 103, k: 1 }]),
    terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.02
  });
  /* Fyllingsareal for hand, en side.
     Fyllingen blir over 2 m høy, og da krever normalen 0,5 m ekstra
     veibredde. Halvbredden blir derfor 2,5 m, ikke 2,25 m.
     Skraningen starter i planum, ikke i veikanten - overbygningen er en egen
     post som legges oppa:
       planum ved kant 103 - 0,05·2,5 - 0,70 = 102,175
       terreng etter rensk                    = 99,80
       skulderen: 0,70 · 1,5 = 1,05 m i planum forbi vegkanten, altså til 3,55
       skraning 1:1,5 ned 2,375 m            => 3,5625 m ut, fot ved 7,1125
       under vegen: ∫0^2,5 (102,30 - 0,05t - 99,80) dt = 6,25 - 0,15625
       skulderen:   2,375 · 1,05
       trekant utenfor: 0,5 · 2,375 · 3,5625

     MERK at fyllingen VOKSER med skulderen: fyllingskroppen er bredere i
     planum enn vegen er oppe. Det er ikke dobbeltbokføring – kubikken over
     planum, mellom vegkanten og skulderkanten, er bærelag og ligger i sin egen
     post. Med `overbygningHelning` lik fyllingsskråningen er ytterflaten
     dessuten én ubrutt rett linje fra vegkanten ned til terrenget. */
  const fyllEnSide = (2.5 * 2.5 - 0.05 * 2.5 * 2.5 / 2)
    + 2.375 * (0.7 * 1.5) + 0.5 * 2.375 * 3.5625;
  sjekk('fyllingsareal (begge sider)', resF.profiler[0].areal.fylling, 2 * fyllEnSide, 0.02);
  sjekk('ingen skjæring ved ren fylling', resF.sum.skjaering, 0, 1e-6);
  sjekk('høy fylling gir 0,5 m ekstra bredde', resF.profiler[0].utvidelse, 0.5, 1e-9);

  /* Kurvekorreksjon (Pappus).
     Sidebratt terreng gjennom en venstrekurve: skjæring pa den ene siden,
     fylling pa den andre. Da skal det vektede arealet vaere
        A_vektet = A + krumning · (første moment av arealet om senterlinjen). */
  const kurve = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 20 }, { x: 100, y: 100, r: 0 }]);
  const skratt = { z: (x, y) => 100 + 0.25 * y };
  const vipKurve = [];
  for (let s = 0; s <= kurve.lengde; s += 5) {
    const q = kurve.punktVed(Math.min(s, kurve.lengde));
    vipKurve.push({ s: Math.min(s, kurve.lengde), z: skratt.z(q.x, q.y), k: 0 });
  }
  const resK = M.beregnMasser({
    linje: kurve, profil: new Vertikalprofil(vipKurve),
    terreng: skratt, mal, fjell, profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05
  });
  paastand('kurvevektet volum er beregnet', resK.sum.skjaering > 0 && isFinite(resK.sum.skjaering));

  const pk = resK.profiler.filter(p => isFinite(p.radius) && p.areal.skjaering > 0.5)[0];
  paastand('fant et profil inne i kurven med skjæring', !!pk);
  if (pk) {
    // Uavhengig kontroll av vektingen, regnet ut fra den tegnede geometrien
    let A = 0, moment = 0;
    const g = pk.geometri;
    for (let i = 1; i < g.terreng.length; i++) {
      const t0 = g.terreng[i - 1][0], t1 = g.terreng[i][0];
      const h0 = Math.max(0, (g.terreng[i - 1][1] - mal.renskDybde) - g.jord[i - 1][1]);
      const h1 = Math.max(0, (g.terreng[i][1] - mal.renskDybde) - g.jord[i][1]);
      A += (h0 + h1) / 2 * (t1 - t0);
      moment += (h0 * t0 + h1 * t1) / 2 * (t1 - t0);
    }
    sjekk('vektet areal = areal + krumning · moment',
      pk.vektet.skjaering, A + pk.krumning * moment, 0.02);
    paastand('vektingen endrer arealet merkbart i krapp kurve',
      Math.abs(pk.vektet.skjaering - pk.areal.skjaering) > 0.01);
  }

  // Bakkekorreksjon skal virke som kvadratet
  const resB = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 1 }, { s: 100, z: 100, k: 1 }]),
    terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1.001, integrasjonssteg: 0.02
  });
  sjekk('bakkekorreksjon på volum', resB.sum.skjaering / res.sum.skjaering, 1.001 * 1.001, 1e-6);
}

/* ------------------------------------------------------------------ */
console.log('\n4u. Masseutskifting – alt under vegkroppen ned til fjell');
{
  /* Rensk på tjue centimeter er avdekking. Under selve vegen er det som
     ligger igjen ikke noe å bygge på – det er skrot, og ofte myr – så alt
     graves bort helt ned til fast fjell og trauet fylles tilbake.

     To volum, ikke ett: alt som tas ut er deponimasse, og hele rommet mellom
     fjellet og planum må fylles på nytt. Utenfor vegkroppen er det fortsatt
     vanlig rensk; der bygges det ingenting, så det er ingenting å skifte ut. */
  const mal = Object.assign({}, M.StandardMal);
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const hb = mal.vegbredde / 2;
  /* VEGKROPPEN ER BREDERE I PLANUM ENN OPPE PÅ VEGEN.
     Overbygningen har skrå kant, så planum går `ob · overbygningHelning` forbi
     vegkanten før grøfta tar over – skulderen. Den er en del av vegkroppen og
     skal stå på fast grunn, så trauet må under den også. Her sto bare
     `hb + grøft`, og hvert utskiftingstall lå 4,20 m²/lm for lavt: nøyaktig
     2 · 1,05 m skulder · 2,0 m fjelldybde. */
  const obTjukn = mal.slitelagTykkelse + mal.baerelagTykkelse;
  const skulder = obTjukn * mal.overbygningHelning;
  const tUt = hb + skulder + mal.grofteDybdePlanum * mal.grofteInnerHelning + mal.grofteBunn;
  const snitt = (fjelldybde, steg, m2) => M.beregnTverrprofil({
    linje, terreng: { z: () => 100 }, mal: Object.assign({}, mal, m2 || {}),
    fjell: new M.Fjellmodell({ standarddybde: fjelldybde, punkter: [] }),
    s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: steg || 0.02
  });

  /* HÅNDREGNING FOR ET TRAU MED SKRÅ VEGG.
     Vegkroppen er vegbredden pluss grøfta:
       tUt = 2,25 + 0,20·1,0 + 0,30 = 2,75 m til hver side.
     Bunnen går `utskiftingUtenfor` = 1,0 m forbi den, altså til 3,75 m, og
     derfra skråner veggen opp med 1:1,5 til den treffer renskebunnen.

     Med fjellet D meter nede blir arealet, målt fra RÅTT terreng:
       bunnen   2 · tB · D
       flankene veggen stiger fra dybde D til dybde `renskDybde`, altså
                (D − renskDybde) høyde, som gir (D − renskDybde)·h bredde og
                snittdybde (D + renskDybde)/2 – to sider blir da
                h · (D² − renskDybde²)
     Med D = 2: 2·3,75·2 = 15,00 pluss 1,5·(4 − 0,04) = 5,94, til sammen 20,94.

     Renskeposten er det pluss stripa utenfor: `renskUtenfor` meter på hver side
     av der veggen møter renskebunnen, i renskedybde. */
  const tB = tUt + mal.utskiftingUtenfor;
  const hUt = mal.utskiftingHelning;
  const utskiftFasit = (D) => {
    const d = Math.min(D, mal.maksUtskifting);
    return 2 * tB * d + hUt * (d * d - mal.renskDybde * mal.renskDybde);
  };
  const stripa = 2 * mal.renskUtenfor * mal.renskDybde;
  {
    const pr = snitt(2.0);
    sjekk('utskifting: bunnen pluss de to flankene',
      pr.areal.utskifting, utskiftFasit(2.0), 0.01);
    sjekk('  og renskeposten er det pluss stripa utenfor',
      pr.areal.rensk, utskiftFasit(2.0) + stripa, 0.01);
    paastand('  og vegkroppen er 4,50 m veg + 2 x 1,05 m skulder + grøft',
      Math.abs(2 * tUt - (4.5 + 2 * skulder + 2 * 0.5)) < 1e-9,
      (2 * tUt).toFixed(3) + ' m');
    paastand('  mens trauets bunn er en meter forbi på hver side av den',
      Math.abs(2 * tB - (2 * tUt + 2 * mal.utskiftingUtenfor)) < 1e-9,
      (2 * tB).toFixed(3) + ' m');

    /* DET ER NETTOPP FLANKENE SOM ER POENGET. En loddrett vegg ville gitt
       11,00 m²/lm; med skrå vegg 20,94. Forskjellen er den gode massen som
       holder kanten oppe – uten den siger fyllingen ut i myra ved siden av. */
    const loddrett = snitt(2.0, null, { utskiftingUtenfor: 0, utskiftingHelning: 0 });
    sjekk('  en loddrett vegg ville gitt vegkroppen ganger dybden',
      loddrett.areal.utskifting, 2 * tUt * 2.0, 0.01);
    paastand('  og den skrå veggen er vesentlig mer',
      pr.areal.utskifting > loddrett.areal.utskifting * 1.5,
      `${pr.areal.utskifting.toFixed(2)} mot ${loddrett.areal.utskifting.toFixed(2)}`);
  }

  /* Trauet har en loddrett vegg mot skråningen. Et sprang smøres ut av et
     jevnt rutenett, og da henger volumet på hvor fint man deler opp – derfor
     treffes veggen med egne knekkpunkt, både i tverrsnittet og i
     renskeløkka. Uten dem: 11,8751 mot 11,8875 riktig. */
  {
    const v = [0.2, 0.05, 0.01, 0.002].map(st => snitt(2.0, st).areal.rensk);
    sjekk('  og tallet henger ikke på integrasjonssteget',
      Math.max(...v) - Math.min(...v), 0, 1e-6);
  }

  /* INGEN KUBIKK MELLOM POSTENE, OGSÅ MED UTSKIFTING.
     Alt mellom rå mark og trauets bunn er rensk; alt mellom trauets bunn og
     jordarbeidsflaten er enten skjæring eller tilbakefylling. `geometri.rensk`
     ER trauets bunn, så invarianten kan måles rett av tegningen. */
  {
    const integ = (A, B) => {
      let s2 = 0;
      for (let i = 0; i < A.length - 1; i++) {
        const dt2 = A[i + 1][0] - A[i][0];
        if (Math.abs(dt2) < 1e-12) continue;
        s2 += ((A[i][1] - B[i][1]) + (A[i + 1][1] - B[i + 1][1])) / 2 * dt2;
      }
      return s2;
    };
    let verst = 0, verstFd = null;
    for (const fd of [0.2, 0.5, 1.0, 2.0, 4.0, 6.0]) {
      const g = snitt(fd).geometri;
      const pr = snitt(fd);
      const avvik = Math.abs((pr.areal.skjaering - pr.areal.fylling)
        - integ(g.rensk, g.jord));
      if (avvik > verst) { verst = avvik; verstFd = fd; }
    }
    sjekk('skjæring minus fylling er nøyaktig trauet ned til jordarbeidsflaten'
      + (verstFd === null ? '' : ' (verst ved fjelldybde ' + verstFd + ')'),
    verst, 0, 0.001);
  }

  /* GRENSA PÅ FIRE METER. Ligger fjellet dypere, stopper uttaket der – og da
     blir det liggende løsmasse igjen under, som må sies fra om. */
  {
    const grunn = snitt(2.0), dypt = snitt(6.0);
    sjekk('under grensa graves det helt ned til fjell', grunn.utskiftingRest, 0, 1e-9);
    sjekk('  og over den stopper uttaket, med resten oppgitt',
      dypt.utskiftingRest, 6.0 - mal.maksUtskifting, 1e-6);
    /* Kappet paa grensa: samme formel, med D = maksUtskifting. */
    const fasitDypt = utskiftFasit(6.0) + stripa;
    sjekk('    og da er det grensa som gjelder, ikke fjellet',
      dypt.areal.rensk, fasitDypt, 0.01);
  }

  /* Under vegkroppen er alt over fjellet alt tatt ut som utskifting, så det
     som står igjen å grave der er fjell. Løsmasseskjæringen som blir igjen
     hører til skråningene utenfor. */
  {
    const pr = snitt(1.0);
    const losIVegkropp = 2 * tUt * 1.0;   // det som ville vært løsmasseskjæring
    paastand('under vegkroppen er det ikke løsmasse igjen å grave',
      (pr.areal.skjaering - pr.areal.skjaeringFjell) < losIVegkropp * 0.25);
  }

  /* SLÅS DEN AV, ER ALT SOM FØR. Det er den prøven som gjør at alle
     håndregningene over i denne fila fortsatt måler det de ble regnet for. */
  {
    const paa = snitt(1.5), av = snitt(1.5, 0.02, { utskifting: false });
    paastand('med utskifting AV er rensken den gamle, faste dybden',
      Math.abs(av.areal.rensk
        - mal.renskDybde * ((av.fotHoyre - av.fotVenstre) + 2 * mal.renskUtenfor)) < 0.01);
    paastand('  og med den PÅ er det vesentlig mer som skal ut',
      paa.areal.rensk > av.areal.rensk * 2);
    paastand('  og en tilbakefylling som ikke fantes før',
      paa.areal.fylling > 1 && av.areal.fylling < 1e-6);
  }

  /* Dypere fjell skal gi mer ut og mer inn – aldri mindre. */
  {
    const dyp = [0.3, 0.6, 1.0, 1.5, 2.0, 3.0];
    const rensk = dyp.map(d => snitt(d).areal.rensk);
    const fyll = dyp.map(d => snitt(d).areal.fylling);
    let stiger = true;
    for (let i = 1; i < dyp.length; i++) {
      if (rensk[i] < rensk[i - 1] - 1e-6 || fyll[i] < fyll[i - 1] - 1e-6) stiger = false;
    }
    paastand('dypere fjell gir mer å kjøre bort og mer å kjøre inn', stiger);
  }

  /* DE TO POSTENE MÅ KUNNE SKILLES, OG SUMMEN MÅ HOLDE.
     Utskiftingen under vegkroppen og avdekkingen utenfor er to forskjellige
     arbeider til to forskjellige priser. Tegningen skal fargelegge det ene
     alene, og rapporten skal kunne si hvor mange kubikk det blå er - så
     `areal.utskifting` er skilt ut. Men den er en DEL av `areal.rensk`, ikke et
     tillegg: blir den lagt oppå, er de samme kubikkene bokført to ganger. */
  {
    const pr = snitt(2.0);
    const fot = pr.fotHoyre;
    sjekk('utskiftingen alene er bunnen pluss flankene',
      pr.areal.utskifting, utskiftFasit(2.0), 0.01);
    sjekk('  og resten av rensken er stripa utenfor',
      pr.areal.rensk - pr.areal.utskifting, stripa, 0.01);
    paastand('  altså er utskiftingen en DEL av rensken, ikke et tillegg',
      pr.areal.utskifting < pr.areal.rensk - 1e-9);

    /* Trauveggen må komme ut, ellers vet ikke tegningen hvor det blå slutter. */
    /* Bunnen slutter der marginen slutter; trauet selv strekker seg videre ut
       til veggen har steget opp til renskebunnen: 3,75 + (2 - 0,2)*1,5 = 6,45. */
    sjekk('trauets bunn oppgis som halvbredde', pr.utskiftingBunnHalvbredde, tB, 1e-9);
    sjekk('  og trauets ytre ende der veggen har steget opp',
      pr.utskiftingHalvbredde, tB + (2.0 - mal.renskDybde) * hUt, 0.01);
    sjekk('  og begge er null når utskiftingen er av',
      snitt(2.0, null, { utskifting: false }).utskiftingHalvbredde
      + snitt(2.0, null, { utskifting: false }).utskiftingBunnHalvbredde, 0, 1e-9);
    sjekk('  og da er det ingen utskifting å farge heller',
      snitt(2.0, null, { utskifting: false }).areal.utskifting, 0, 1e-9);

    /* Fjellet i dagen: ingenting å skifte ut, men trauveggen står der fortsatt.
       En bredde uten dybde skal gi null areal, ikke en tom flate med bredde. */
    sjekk('fjell i dagen gir null utskifting', snitt(0).areal.utskifting, 0, 1e-9);
    paastand('  men trauets bunn står der likevel', snitt(0).utskiftingBunnHalvbredde > 0);
  }

  /* OG SOM VOLUM, ikke bare som snittareal - ellers kan tegningen fargelegge
     noe rapporten ikke kan tallfeste. */
  {
    const r = M.beregnMasser({
      linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]),
      terreng: { z: () => 100 }, mal,
      fjell: new M.Fjellmodell({ standarddybde: 2.0, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05
    });
    paastand('utskiftingen kommer ut som volum også', r.sum.utskifting > 0,
      `${r.sum.utskifting.toFixed(1)} m³`);
    paastand('  og ligger inne i renskevolumet', r.sum.utskifting < r.sum.rensk,
      `${r.sum.utskifting.toFixed(1)} av ${r.sum.rensk.toFixed(1)}`);
    sjekk('  og er lengden ganger snittarealet på flat mark',
      r.sum.utskifting, 100 * utskiftFasit(2.0), 1);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n4v. Tegningen skal vise de samme tallene som rapporten');
{
  /* TEGNINGEN ER ET SVAR, IKKE EN ILLUSTRASJON.
     Tverrsnittet fyller flater med skjæringsfarge og fyllingsfarge, og den som
     ser på det leser av hvor mye som skal graves. Da må de flatene være de
     SAMME arealene rapporten bokfører. Var de ikke det, ville programmet gitt
     to svar på samme spørsmål, og ingen av dem ville vært til å stole på.

     Snittet delte flatene ved TERRENGLINJEN. Regnestykket måler fra bunnen i
     trauet – `const d = zU - zJ` – og med masseutskifting ligger de to langt
     fra hverandre. Målt med standardmalen og fjellet to meter nede: snittet
     fylte 5,85 m²/lm med skjæringsfarge der rapporten bokførte 0,99, og
     tilbakefyllingen på 6,62 m²/lm – massen som må KJØPES OG KJØRES INN, den
     dyre halvparten – ble tegnet som null. Ved seks meter: 17,62 m²/lm
     usynlige.

     Prøven integrerer flatene tegningen ville fylt, rett fra den geometrien
     tverrsnittet får utlevert, og krever at de treffer de bokførte arealene. */
  const kom = (v, d) => v.toFixed(d).replace('.', ',');
  const mal = Object.assign({}, M.StandardMal);
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  /* MERK: denne `snitt` tar (fjelldybde, malOverstyring) – seksjon 4u har sin
     egen med (fjelldybde, STEG, malOverstyring). Flytter man en linje mellom de
     to seksjonene, havner malen i steget: `integrasjonssteg` blir et objekt,
     regnestykket blir tull, og en prøve som ser etter null kan bli grønn på
     falskt grunnlag. Det skjedde. */
  const snitt = (fjelldybde, m2) => M.beregnTverrprofil({
    linje, terreng: { z: () => 100 }, mal: Object.assign({}, mal, m2 || {}),
    fjell: new M.Fjellmodell({ standarddybde: fjelldybde, punkter: [] }),
    s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });

  /* Arealet mellom to kurver som tegningen har dem: samme t-punkter, trapes.
     Det er nettopp det `c.fill()` dekker mellom to baner. */
  const mellom = (ovre, nedre) => {
    let A = 0;
    for (let i = 1; i < ovre.length; i++) {
      const t0 = ovre[i - 1][0], t1 = ovre[i][0];
      const a = Math.max(0, ovre[i - 1][1] - nedre[i - 1][1]);
      const b = Math.max(0, ovre[i][1] - nedre[i][1]);
      A += (a + b) / 2 * (t1 - t0);
    }
    return A;
  };

  for (const d of [0.5, 1.0, 2.0, 4.0, 6.0]) {
    const pr = snitt(d), g = pr.geometri;
    /* Overkanten er TRAU-BUNNEN (`geometri.rensk`), ikke terrenget. */
    sjekk(`fjell ${kom(d, 1)} m: den tegnede skjæringen er den bokførte`,
      mellom(g.rensk, g.jord), pr.areal.skjaering, 0.02);
    sjekk('  og den tegnede fyllingen er den bokførte',
      mellom(g.jord, g.rensk), pr.areal.fylling, 0.02);
    /* Og det blå: alt mellom terrenget og trau-bunnen skal ut - utskiftingen
       under vegkroppen pluss avdekkingen utenfor.

       MINUS STRIPA UTENFOR SKRÅNINGSFOTEN. `areal.rensk` tar med `renskUtenfor`
       meter på hver side av foten, og de ligger utenfor det tegningen i det hele
       tatt strekker seg over - geometrien slutter ved foten. Her sto et krav om
       likhet, og det falt med nøyaktig 0,40 m²/lm = 2 · 1,0 m · 0,20 m, altså
       stripa. Den skal trekkes fra, ikke tegnes. Og den stopper i fjellet som
       all annen rensk, så ved fjellet ti centimeter nede er den 0,20. */
    const stripe = 2 * mal.renskUtenfor * Math.min(mal.renskDybde, d);
    sjekk('  og det som skal skiftes ut er renskeposten innenfor foten',
      mellom(g.terreng, g.rensk), pr.areal.rensk - stripe, 0.02);
  }

  /* MÅLT FRA TERRENGET I STEDET GIR FEIL SVAR, OG PRØVEN SKAL VITE DET.
     Ellers kunne man flyttet overkanten tilbake til terrenglinjen og prøven
     ville fortsatt vært grønn på et snitt der de to tilfeldigvis er like. */
  {
    const pr = snitt(2.0), g = pr.geometri;
    paastand('fra terrenget i stedet ville gitt et helt annet tall',
      mellom(g.terreng, g.jord) > pr.areal.skjaering * 3,
      `${kom(mellom(g.terreng, g.jord), 2)} mot bokført ${kom(pr.areal.skjaering, 2)}`);
    paastand('  og tilbakefyllingen ville forsvunnet helt',
      pr.areal.fylling > 1 && mellom(g.jord, g.terreng) < 1e-6,
      `bokført ${kom(pr.areal.fylling, 2)}, tegnet ${kom(mellom(g.jord, g.terreng), 2)}`);
  }

  /* MED UTSKIFTING AV SKAL DET FORTSATT STEMME. Da er trau-bunnen den gamle
     faste renskedybden, og de tre kravene over gjelder like fullt. */
  for (const d of [0.1, 0.5, 2.0]) {
    const pr = snitt(d, { utskifting: false }), g = pr.geometri;
    sjekk(`utskifting av, fjell ${kom(d, 1)} m: skjæringen stemmer`,
      mellom(g.rensk, g.jord), pr.areal.skjaering, 0.02);
    sjekk('  og renskeposten stemmer',
      mellom(g.terreng, g.rensk),
      pr.areal.rensk - 2 * mal.renskUtenfor * Math.min(mal.renskDybde, d), 0.02);
  }

  /* FJELLET I DAGEN: trauet har null dybde, og flaten blir tom. Tegningen skal
     tåle det uten å melde noe, og tallet skal være null - ikke NaN. */
  {
    const pr = snitt(0), g = pr.geometri;
    const blaa = mellom(g.terreng, g.rensk);
    paastand('fjell i dagen gir en tom utskiftingsflate, ikke NaN',
      isFinite(blaa) && blaa < 0.01, String(blaa));
    sjekk('  og skjæringen stemmer fortsatt', mellom(g.rensk, g.jord),
      pr.areal.skjaering, 0.02);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n4a. Feil som er funnet og rettet');
{
  /* Et knekkpunkt uten kurve ble stille hoppet over, og linja skar rett over
     hjørnet. En trasé med radius 0 pa ett innvendig punkt kunne passere
     titalls meter fra der brukeren hadde tegnet den. */
  const skarp = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }, { x: 100, y: 100, r: 0 }]);
  sjekk('skarp knekk gir full lengde', skarp.lengde, 200, 1e-9);
  const hjornet = skarp.punktVed(100);
  sjekk('linja gar gjennom knekkpunktet, ikke over det', Math.hypot(hjornet.x - 100, hjornet.y - 0), 0, 1e-6);

  const blandet = new Linjeforing([
    { x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 20 }, { x: 100, y: 100, r: 0 }, { x: 200, y: 100, r: 0 }
  ]);
  const ventet = (100 - 20) + 20 * Math.PI / 2 + (100 - 20) + 100;
  sjekk('kurve og skarp knekk om hverandre', blandet.lengde, ventet, 1e-6);

  // To sammenfallende punkt skal ikke sluke naboene sine
  const dobbelt = new Linjeforing([
    { x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }, { x: 100, y: 100, r: 0 }
  ]);
  sjekk('sammenfallende punkt gir fortsatt riktig lengde', dobbelt.lengde, 200, 1e-6);

  /* OG RADIEN SKAL OVERLEVE, UANSETT HVOR I GRUPPA DEN LIGGER.
     Radien ble skrevet inn i `alle[i - 1]`, altså naboen i den USILTE lista –
     og den kan selv være slettet i samme runde. Med tre sammenfallende punkt
     og radien på det siste havnet den i nummer to, som forsvant like etter:
     null kurver, lengden 241,421 m i stedet for 238,840. Profilene stasjoneres
     langs linja, så en linje som er 8,6 m for lang på en 716 m veg legger
     profiler opptil 17 m feil i terrenget – og massene regnes mot feil bakke.
     Tre sammenfallende punkt er to dobbeltklikk på samme sted i kartet.

     Prøven over brukte bare TO punkt uten radius, og der overlever den. */
  {
    const rent = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 60 },
      { x: 200, y: 100, r: 0 }]);
    let verstL = 0, verstR = 0, verstNavn = '';
    for (const n of [2, 3, 4]) {
      for (let pos = 0; pos < n; pos++) {
        const grp = [];
        for (let k = 0; k < n; k++) grp.push({ x: 100, y: 0, r: k === pos ? 60 : 0 });
        const L = new Linjeforing([{ x: 0, y: 0, r: 0 }].concat(grp)
          .concat([{ x: 200, y: 100, r: 0 }]));
        const dL = Math.abs(L.lengde - rent.lengde);
        const dR = Math.abs((L.kurver[0] ? L.kurver[0].r : 0) - 60);
        if (dL > verstL || dR > verstR) verstNavn = n + ' punkt, radius på nr. ' + (pos + 1);
        verstL = Math.max(verstL, dL);
        verstR = Math.max(verstR, dR);
      }
    }
    sjekk('radien overlever uansett hvor i duplikatgruppa den ligger'
      + (verstNavn ? ' (verst: ' + verstNavn + ')' : ''), verstR, 0, 1e-9);
    sjekk('  og lengden blir den samme som uten duplikatene', verstL, 0, 1e-9);
    /* Duplikatvarselet skal ikke kunne slå ut et innkortingsvarsel: det ene
       nummererer i brukerens liste, det andre i den sammenslåtte. */
    const medDup = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 },
      { x: 100, y: 0, r: 0 }, { x: 200, y: 100, r: 500 }, { x: 300, y: 100, r: 0 }]);
    const utenDup = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 },
      { x: 200, y: 100, r: 500 }, { x: 300, y: 100, r: 0 }]);
    const tell = L => (L.advarsler || []).filter(a => /kortet inn/.test(a.tekst || '')).length;
    sjekk('  og et duplikat skjuler ikke at radien ble kortet inn',
      tell(medDup), tell(utenDup), 0);
  }

  /* Pappus-vekten (1 + t·krumning) blir negativ forbi kurvesenteret. Da ble
     et areal trukket fra i stedet for lagt til, og et fyllingsareal pa 36 m²
     kom ut som −0,3 m². */
  const krapp = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 60, y: 0, r: 12 }, { x: 60, y: 60, r: 0 }]);
  const li = { z: (x, y) => 100 + 0.55 * y };
  const mal = Object.assign({}, KLASSISK, { maksSokebredde: 45, ekstraBredde: null });
  const vipK = [];
  for (let s = 0; s <= krapp.lengde; s += 5) {
    const q = krapp.punktVed(Math.min(s, krapp.lengde));
    vipK.push({ s: Math.min(s, krapp.lengde), z: li.z(q.x, q.y) - 2, k: 0 });
  }
  const rKrapp = M.beregnMasser({
    linje: krapp, profil: new Vertikalprofil(vipK), terreng: li, mal,
    fjell: new M.Fjellmodell({ standarddybde: 5 }), profilAvstand: 5, bakkefaktor: 1
  });
  paastand('ingen negative vektede arealer i krapp kurve',
    rKrapp.profiler.every(p => p.vektet.fylling >= -1e-9 && p.vektet.skjaering >= -1e-9));
  paastand('ingen negative volum', Object.values(rKrapp.sum).every(v => v >= -1e-9));

  /* Jordarbeidsflaten var diskontinuerlig i skjæring/fylling-skillet:
     fyllingssida startet 0,70 m høyere enn skjæringssida, sa et profil kunne
     tredoble fyllingsarealet pa en femtedels millimeter. */
  const flatt = { z: () => 100 };
  const rettLinje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const areal = z => M.beregnTverrprofil({
    linje: rettLinje, terreng: flatt, mal, fjell: new M.Fjellmodell({ standarddybde: 9 }),
    s: 50, vegnivaa: z, utvidelse: 0, integrasjonssteg: 0.02
  });
  /* Malt som endring i endringstakten: et sprang i selve flaten viser seg som
     et hopp her, mens en jevn overgang gir sma tall. Før rettingen hoppet
     fyllingsarealet 0,736 m² i ett eneste 0,02 m steg. */
  const totalt = z => { const r = areal(z); return r.areal.skjaering + r.areal.fylling; };
  let verstHopp = 0;
  for (let z = 99.9; z <= 100.9; z += 0.02) {
    const takt1 = totalt(z) - totalt(z - 0.02);
    const takt2 = totalt(z + 0.02) - totalt(z);
    verstHopp = Math.max(verstHopp, Math.abs(takt2 - takt1));
  }
  paastand('overgangen skjæring/fylling er sammenhengende', verstHopp < 0.10, 'verste sprang ' + verstHopp.toFixed(4));

  /* Fjell/løsmasse-splitten skal ikke henge pa hvor fint man deler opp. */
  const sideli = { z: (x, y) => 100 + y / 3 };
  const vipS = [];
  for (let s = 0; s <= 100; s += 5) vipS.push({ s, z: 100, k: 0 });
  const splitt = steg => M.beregnMasser({
    linje: rettLinje, profil: new Vertikalprofil(vipS), terreng: sideli, mal,
    fjell: new M.Fjellmodell({ standarddybde: 0.5 }), profilAvstand: 5,
    integrasjonssteg: steg, bakkefaktor: 1
  }).sum.skjaeringFjell;
  const standard = splitt(0.1), fin = splitt(0.02);
  paastand('fjellandelen er stabil ved standard oppløsning',
    Math.abs(standard - fin) / Math.max(1, fin) < 0.005, `0,1 m: ${standard.toFixed(1)}  0,02 m: ${fin.toFixed(1)}`);

  // Rensk skal ikke faktureres der terrengmodellen ikke har data
  const utenData = M.beregnMasser({
    linje: rettLinje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]),
    terreng: { z: () => NaN }, mal, fjell: new M.Fjellmodell({ standarddybde: 5 }),
    profilAvstand: 10, bakkefaktor: 1
  });
  sjekk('ingen rensk uten terrengdata', utenData.sum.rensk, 0, 1e-9);

  /* Laste høyder far K=0, og da lages det ingen vertikalkurve. Gikk kontrollen
     bare pa kurvelisten, slapp hele arbeidsmaten med innlagte høyder unna
     kravet til vertikalgeometri - uansett hvor skarpt bruddet var. */
  const knekkmal = Object.assign({}, KLASSISK, {
    minVertikalLavbrekk: 200, minVertikalHoybrekk: 100, maksStigning: 1, stigningIKurve: null
  });
  const skarptLavbrekk = M.beregnMasser({
    linje: rettLinje,
    profil: new Vertikalprofil([
      { s: 0, z: 110, k: 0 }, { s: 50, z: 100, k: 0 }, { s: 100, z: 110, k: 0 }
    ]),
    terreng: { z: () => 105 }, mal: knekkmal, fjell: new M.Fjellmodell({ standarddybde: 5 }),
    profilAvstand: 10, bakkefaktor: 1
  });
  paastand('skarpt lavbrekk uten kurve gir merknad',
    skarptLavbrekk.merknader.some(m => m.type === 'vertikalkurve'));

  // Et jevnt fall skal ikke gi merknad selv om alle knekkpunkt har K=0
  const jevnt = [];
  for (let s = 0; s <= 100; s += 5) jevnt.push({ s, z: 100 - 0.05 * s, k: 0 });
  const rett = M.beregnMasser({
    linje: rettLinje, profil: new Vertikalprofil(jevnt),
    terreng: { z: () => 100 }, mal: knekkmal, fjell: new M.Fjellmodell({ standarddybde: 5 }),
    profilAvstand: 10, bakkefaktor: 1
  });
  paastand('jevn stigning gir ingen vertikalmerknad',
    !rett.merknader.some(m => m.type === 'vertikalkurve'));

  /* Tette høyder som vaker opp og ned skal si ifra - men ikke med hundre
     linjer som alle sier det samme. */
  const vaker = [];
  for (let s = 0; s <= 100; s += 5) vaker.push({ s, z: 100 + (s / 5 % 2 ? 0.4 : 0), k: 0 });
  const bolge = M.beregnMasser({
    linje: rettLinje, profil: new Vertikalprofil(vaker),
    terreng: { z: () => 100 }, mal: knekkmal, fjell: new M.Fjellmodell({ standarddybde: 5 }),
    profilAvstand: 10, bakkefaktor: 1
  });
  const vm = bolge.merknader.filter(m => m.type === 'vertikalkurve');
  paastand('bølgete høyder gir merknad, men en kort liste',
    vm.length > 0 && vm.length <= 6, `${vm.length} merknader`);

  /* En radius knappere enn tabellen rekker ga null breddeutvidelse - mindre
     enn en slakere sving fikk. */
  const bredde = KLASSISK.breddeIKurve;
  const knappest = M.utvidelseFraRadius(KLASSISK, bredde[0][0], 90);
  paastand('radius under tabellen gir minst like mye utvidelse som det knappeste bandet',
    M.utvidelseFraRadius(KLASSISK, bredde[0][0] - 3, 90) >= knappest - 1e-9);

  /* En kurve kortere enn profilavstanden falt mellom to profiler og fikk
     ingen utvidelse i det hele tatt. */
  const kortKurve = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 12 }, { x: 100, y: 100, r: 0 }]);
  const stasjonerGrovt = [];
  for (let s = 0; s <= kortKurve.lengde; s += 20) stasjonerGrovt.push(s);
  /* `lagUtvidelsesprofil` gir `{sym, v, h}` per stasjon: den symmetriske delen,
     og det som bare hører til venstre eller høyre. Kurveutvidelsen er alltid
     symmetrisk – bare en snuplass kan være ensidig. */
  const utv = M.lagUtvidelsesprofil(kortKurve, KLASSISK, stasjonerGrovt, null)
    .map(u => u.sym);
  paastand('kort kurve mellom to profiler far likevel utvidelse',
    Math.max(...utv) > 0, `største utvidelse ${Math.max(...utv).toFixed(2)} m`);

  // Knekkpunkt tettere enn stasjonene ga to knekkpunkt pa samme profilnummer
  const stasjonerTett = [];
  for (let s = 0; s <= 100; s += 10) stasjonerTett.push(s);
  const tett = foreslaProfil(stasjonerTett, stasjonerTett.map(() => 100), { vipAvstand: 2 });
  paastand('for tett knekkpunktavstand gir ikke doble punkt',
    tett.every((v, i) => i === 0 || v.s > tett[i - 1].s));
  paastand('alle stigninger er tall',
    new Vertikalprofil(tett).stigninger.every(g => isFinite(g)));

  /* Der skjæring gar over i fylling inne i et integrasjonssteg, ma trekanten
     vektes over hele bredden sin - ikke med vekten i endepunktet. Prøven er at
     svaret ikke skal henge pa hvor fint man deler opp. */
  const krappLinje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 60, y: 0, r: 12 }, { x: 60, y: 60, r: 0 }]);
  const skraaLi = { z: (x, y) => 100 + 0.55 * y };
  const krappMal = Object.assign({}, KLASSISK, { maksSokebredde: 45, ekstraBredde: null });
  const krappVip = [];
  for (let s = 0; s <= krappLinje.lengde; s += 5) {
    const q = krappLinje.punktVed(Math.min(s, krappLinje.lengde));
    krappVip.push({ s: Math.min(s, krappLinje.lengde), z: skraaLi.z(q.x, q.y), k: 0 });
  }
  const medSteg = steg => M.beregnMasser({
    linje: krappLinje, profil: new Vertikalprofil(krappVip), terreng: skraaLi, mal: krappMal,
    fjell: new M.Fjellmodell({ standarddybde: 3 }), profilAvstand: 5,
    integrasjonssteg: steg, bakkefaktor: 1
  }).sum;
  const grovt = medSteg(0.2), fasit = medSteg(0.005);
  for (const f of ['skjaering', 'fylling']) {
    paastand(`${f} henger ikke på integrasjonssteget i krapp kurve`,
      Math.abs(grovt[f] - fasit[f]) / fasit[f] < 1e-4,
      `0,2 m: ${grovt[f].toFixed(2)}  0,005 m: ${fasit[f].toFixed(2)}`);
  }

  /* Overbygningen skal fylle nøyaktig rommet mellom planum og vegoverflaten.
     Slitelaget ligger bare over kjørebanen, sa skuldrene ma fylles med
     bærelag helt opp - ellers star 50 til 100 kubikk per kilometer pa
     ingen post.

     ROMMET ER EN TRAPES, IKKE EN PLATE. Vegkroppen har skrå kant, så figuren
     er `bredde · ob` pluss de to kilene `overbygningHelning · ob²`. Her sto
     bare plata, og kravet falt med nøyaktig kilene – 73,50 m³ på 100 m med
     standardmalen. Toleransen står fortsatt på 1e-6: dette er en bevaring, og
     en kubikk skal ikke kunne falle mellom postene. */
  for (const veiklasse of ['k1', 'k3', 'k7', 'k8']) {
    const vm = Object.assign({}, KLASSISK, VK.malFraVeiklasse(veiklasse) || {},
      { grofteDybdePlanum: 0, grofteBunn: 0 });
    const r = M.beregnMasser({
      linje: rettLinje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]),
      terreng: { z: () => 100 }, mal: vm, fjell: new M.Fjellmodell({ standarddybde: 5 }),
      profilAvstand: 10, bakkefaktor: 1
    });
    const obT = vm.slitelagTykkelse + vm.baerelagTykkelse;
    const gravd = (obT * vm.vegbredde + (vm.overbygningHelning || 0) * obT * obT) * 100;
    sjekk(`${veiklasse}: overbygningen fyller det som er gravd ut`,
      r.sum.slitelag + r.sum.baerelag, gravd, 1e-6);
  }

  /* Sonevalget skal følge nærmeste midtmeridian (9, 15 og 27 grader). Med 18
     grader som grense havnet Tromsø i sone 35, atte grader unna. */
  sjekk('Tromsø havner i sone 33', Geo.sone(18.955), 33, 0);
  sjekk('Alta havner i sone 35', Geo.sone(23.271), 35, 0);
  sjekk('Lyngdal havner i sone 32', Geo.sone(7.070), 32, 0);
  /* Sonevalget avgjør ogsa OM DET FINNES DATA: de tre høydetjenestene dekker
     ikke samme omrade. Malt pa tolv landpunkt dekker sone 33 hele landet,
     mens 32 slutter rundt Røros og 35 begynner først i Finnmark. Derfor
     ligger grensen mot 35 pa 23 grader, ikke pa 21 der nærmeste midtmeridian
     ellers ville sagt. */
  for (const [lon, venta, hvor] of [
    [5.33, 32, 'Bergen'], [7.07, 32, 'Lyngdal'], [10.40, 32, 'Trondheim'], [11.38, 32, 'Røros'],
    [14.14, 33, 'Mo i Rana'], [18.96, 33, 'Tromsø'], [21.20, 33, 'Nord-Troms'],
    [23.27, 35, 'Alta'], [25.51, 35, 'Karasjok'], [29.75, 35, 'Vadsø']
  ]) {
    sjekk(`${hvor} (${lon}°) havner i sone ${venta}`, Geo.sone(lon), venta, 0);
  }
  paastand('ingen del av landet havner i sone 35 før Finnmark',
    [21, 22, 22.9].every(l => Geo.sone(l) === 33));
}

/* ------------------------------------------------------------------ */
console.log('\n4k. Merknadene, og masser som brukes om igjen');
{
  /* Sju av elleve merknadstyper var uten dekning i begge testene. Alle
     advarselblokkene kunne settes til `if (false)` uten at en eneste prøve sa
     ifra - og det er advarslene som forteller brukeren at tallet ikke holder. */
  const krapp = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 80, y: 0, r: 8 }, { x: 80, y: 80, r: 0 }]);
  const sideli = { z: (x, y) => 100 + 0.6 * y };
  const bratt = [];
  for (let s = 0; s <= krapp.lengde; s += 10) bratt.push({ s: Math.min(s, krapp.lengde), z: 100 + 0.30 * s, k: 0 });
  const streng = M.beregnMasser({
    linje: krapp, profil: new Vertikalprofil(bratt), terreng: sideli,
    mal: { maksFyllingshoyde: 2, maksSkjaeringsdybde: 3, maksUtslag: 4, minRadius: 10, maksSokebredde: 25 },
    fjell: new M.Fjellmodell({ standarddybde: 2 }), profilAvstand: 5, bakkefaktor: 1
  });
  /* Og en som graver seg ned i stedet for a klatre, sa skjæringsdybden ogsa
     blir prøvd. */
  const nedi = [];
  for (let s = 0; s <= krapp.lengde; s += 10) nedi.push({ s: Math.min(s, krapp.lengde), z: 94, k: 0 });
  const dypt = M.beregnMasser({
    linje: krapp, profil: new Vertikalprofil(nedi), terreng: sideli,
    mal: { maksFyllingshoyde: 2, maksSkjaeringsdybde: 3, maksUtslag: 4, minRadius: 10, maksSokebredde: 25 },
    fjell: new M.Fjellmodell({ standarddybde: 2 }), profilAvstand: 5, bakkefaktor: 1
  });
  const typer = new Set([...streng.merknader, ...dypt.merknader].map(m => m.type));
  for (const t of ['stigning', 'kurvatur', 'fylling', 'skjaering', 'utslag', 'geometri']) {
    paastand(`merknadstypen «${t}» blir gitt når den skal`, typer.has(t),
      [...typer].join(', ') || 'ingen merknader');
  }

  /* Radet om hvilken radius som ville holdt gis bare nar en radius fra
     tabellen faktisk er nok - ved 30 % hjelper ingen. Her prøves en stigning
     som en slakkere kurve ville tillatt. */
  const slakkere = [];
  for (let s = 0; s <= krapp.lengde; s += 10) slakkere.push({ s: Math.min(s, krapp.lengde), z: 100 + 0.16 * s, k: 0 });
  const medRaad = M.beregnMasser({
    linje: krapp, profil: new Vertikalprofil(slakkere), terreng: sideli,
    mal: { maksSokebredde: 60 }, fjell: new M.Fjellmodell({ standarddybde: 2 }),
    profilAvstand: 5, bakkefaktor: 1
  });
  paastand('stigningsmerknaden sier hvilken radius som ville holdt',
    medRaad.merknader.some(m => m.type === 'stigning' && m.raad && m.raad.type === 'radius'),
    medRaad.merknader.filter(m => m.type === 'stigning').map(m => m.raad && m.raad.type).join(',') || 'ingen');
  paastand('og en veg uten problemer gir ingen av dem', (() => {
    const flatt = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }]);
    const r = M.beregnMasser({
      linje: flatt, profil: new Vertikalprofil([{ s: 0, z: 99.5, k: 0 }, { s: 200, z: 99.5, k: 0 }]),
      terreng: { z: () => 100 }, mal: {}, fjell: new M.Fjellmodell({ standarddybde: 3 }),
      profilAvstand: 5, bakkefaktor: 1
    });
    return r.merknader.length === 0;
  })());

  /* Alle balanseprøvene sto pa helt flatt terreng: ren skjæring eller ren
     fylling, aldri begge deler. Da er `fyllFraLos` og `fyllFraFjell` null i
     hver eneste prøve, og hele gjenbrukslogikken - det massebalansen finnes
     for - var aldri i drift. */
  const li = { z: (x, y) => 100 + 0.22 * x };          // terrenget stiger langs veien
  const langs = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }]);
  const midt = M.beregnMasser({
    linje: langs, profil: new Vertikalprofil([{ s: 0, z: 108, k: 0 }, { s: 200, z: 130, k: 0 }]),
    terreng: li, mal: {}, fjell: new M.Fjellmodell({ standarddybde: 1.5 }),
    profilAvstand: 5, bakkefaktor: 1
  });
  const b = midt.balanse;
  paastand('prøven har både skjæring og fylling',
    midt.sum.skjaering > 50 && midt.sum.fylling > 50,
    `skjæring ${midt.sum.skjaering.toFixed(0)}, fylling ${midt.sum.fylling.toFixed(0)}`);
  /* GRENSEN MÅ LIGGE DER SVARET FAKTISK ER.
     Her sto `> 1`, og målt verdi er 4 864 m³ – en margin på faktor 4 864. Den
     ville holdt om koden brukte én eneste kubikk av skjæringen og kjøpte
     resten. Regelen er at det som er tilgjengelig skal brukes SÅ LANGT DET
     REKKER: er det nok, dekkes hele behovet; er det ikke nok, brukes alt. */
  sjekk('massen fra skjæringen brukes så langt den rekker',
    b.fyllFraLos + b.fyllFraFjell, Math.min(b.tilgjengelig, b.fyllingBehov), 1e-6);
  paastand('  og det er en vesentlig del av fyllingen her, ikke en kubikk',
    b.fyllFraLos + b.fyllFraFjell > b.fyllingBehov * 0.5,
    `${(b.fyllFraLos + b.fyllFraFjell).toFixed(0)} av ${b.fyllingBehov.toFixed(0)} m³`);
  paastand('løsmassen brukes før sprengsteinen',
    b.fyllFraLos > 0 && (b.fyllFraLos >= b.brukbarLos - 1e-6 || b.fyllFraFjell < 1e-6),
    `${b.fyllFraLos.toFixed(1)} av ${b.brukbarLos.toFixed(1)} brukbar`);
  /* BEHOVET MÅ FORANKRES, ELLERS REGNER PÅSTANDEN SEG SELV.
     Under står identiteten `fyllFraLos + fyllFraFjell + manglerFylling =
     fyllingBehov`. Den holder for ETHVERT tall, for `manglerFylling` er i
     masser.js DEFINERT som `fyllingBehov − fyllFraLos − fyllFraFjell`.
     Venstresiden bygger altså høyresiden opp igjen ledd for ledd.

     Målt: med `fyllingBehov = sum.fylling * 0.5` sto hele selvtesten grønn –
     576 av 576 – og denne linja skrev til og med ut det halverte tallet og
     godkjente det: «(2432.1 ≈ 2432.1)». Det samme gjaldt bærelaget.

     Det er ikke et hvilket som helst tall. `manglerFylling` er «Må inn» på
     skjermen og i tilbudet – kubikken som må kjøpes og kjøres på anlegget.
     Den kunne halveres uten at én eneste prøve sa fra.

     Derfor ANKERET først: behovet skal være massesummen, som kommer en annen
     vei gjennom koden. Identiteten står igjen etterpå, for den er fortsatt
     verdt å ha – den fanger en feil i FORDELINGEN mellom postene. */
  sjekk('fyllingsbehovet ER fyllingen som skal legges ut',
    b.fyllingBehov, midt.sum.fylling, 1e-6);
  sjekk('bærelagsbehovet ER bærelaget som skal inn',
    b.baerelagBehov, midt.sum.baerelag, 1e-6);
  sjekk('fyllingsbehovet går nøyaktig opp',
    b.fyllFraLos + b.fyllFraFjell + b.manglerFylling, b.fyllingBehov, 1e-6);
  paastand('og ingen post er negativ',
    Object.values(b).every(v => v >= -1e-9), JSON.stringify(b));

  /* Hele regnskapet, post for post.
     Her sto det bare tre-fire løse pastander, og resten av balansen kunne
     drive fra hverandre uten at noe sa fra. Postene henger sammen med faste
     regnestykker, og hvert eneste et av dem skal ga opp pa kubikken.

     Merk at fjell teller med to forskjellige faktorer, og at det er meningen:
     1,50 er hva den faste kubikken blir til pa et lass, 1,30 er hva den fyller
     nar den er lagt ut og komprimert i fyllingen. Det første tallet brukes til
     transport, det andre til balansen - blandes de, blir svaret feil begge
     veier. */
  /* IDENTITETENE MÅ KJØRES PÅ ET UNDERSKUDD OGSÅ.
     Blokka under sto bare på `midt`, og `midt` ligger i et terreng som gir
     kraftig masseoverskudd: fjellFast 7 609 m³ mot et fyllingsbehov på 4 864.
     Da er BÅDE `manglerFylling` og `manglerBaerelag` null, og identiteten
     `manglerTotalt = manglerFylling + manglerBaerelag` blir 0 = 0 + 0. Den
     holder uansett hva koden gjør med de to leddene.

     Målt: med `manglerTotalt: manglerFylling` – altså bærelagsmangelen strøket
     fra totalen – sto hele selvtesten grønn. «Må inn» på skjermen ville da
     manglet hele bærelaget som skal kjøpes.

     `mangel` under er det samme regnskapet i et terreng som ikke har masse nok,
     så de samme identitetene prøves med tall som ikke er null på begge sider. */
  const mangel = M.beregnMasser({
    linje: langs, profil: new Vertikalprofil([{ s: 0, z: 112, k: 0 }, { s: 200, z: 134, k: 0 }]),
    terreng: li, mal: {}, fjell: new M.Fjellmodell({ standarddybde: 40 }),
    profilAvstand: 5, bakkefaktor: 1
  });
  paastand('mangelprøven mangler faktisk masse',
    mangel.balanse.manglerFylling > 1 && mangel.balanse.manglerBaerelag > 1,
    `fylling ${mangel.balanse.manglerFylling.toFixed(0)}, `
    + `bærelag ${mangel.balanse.manglerBaerelag.toFixed(0)}`);

  for (const [hva, res] of [['overskudd', midt], ['underskudd', mangel]]) {
    const b = res.balanse;
    const f = res.faktorer, s = res.sum;
    const id = (navn, a, b2) => sjekk('  ' + hva + ': ' + navn, a, b2, 1e-6);
    id('sprengt løsvolum = fast fjell × sprengningsfaktor',
      b.fjellSprengtLos, b.fjellFast * f.sprengningsfaktor);
    id('fast fjell i regnskapet = skjæring i fjell',
      b.fjellFast, s.skjaeringFjell);
    id('fjell tilgjengelig for fylling = fast × fjellIFylling',
      b.fraFjell, b.fjellFast * f.fjellIFylling);
    id('brukbar løsmasse = løs × andel brukbar × losmasseIFylling',
      b.brukbarLos, b.losFast * f.brukbarLosmasse * f.losmasseIFylling);
    id('tilgjengelig = fjell + løsmasse',
      b.tilgjengelig, b.fraFjell + b.brukbarLos);
    id('balanse = tilgjengelig − fyllingsbehov',
      b.balanse, b.tilgjengelig - b.fyllingBehov);
    id('til deponi = rensk + ubrukbar løsmasse',
      b.tilDeponi, s.rensk + b.losFast * (1 - f.brukbarLosmasse));
    id('manglerTotalt = manglerFylling + manglerBaerelag',
      b.manglerTotalt, b.manglerFylling + b.manglerBaerelag);
    paastand('  overskudd og underskudd kan ikke begge være positive',
      b.overskudd < 1e-6 || b.underskudd < 1e-6,
      `overskudd ${b.overskudd.toFixed(1)}, underskudd ${b.underskudd.toFixed(1)}`);
  }

  /* Faktorene ble bare kontrollert for at negative verdier klemmes - aldri
     for at de brukes riktig. En sprengningsfaktor som ikke gjør noe ville
     sluppet gjennom. */
  const medFaktor = f => M.beregnMasser({
    linje: langs, profil: new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: 200, z: 96, k: 0 }]),
    terreng: { z: () => 100 }, mal: {}, faktorer: f,
    fjell: new M.Fjellmodell({ standarddybde: 0 }), profilAvstand: 5, bakkefaktor: 1
  }).balanse;
  const f14 = medFaktor({ sprengningsfaktor: 1.4 });
  const f18 = medFaktor({ sprengningsfaktor: 1.8 });
  paastand('sprengningsfaktoren brukes på det løse volumet',
    Math.abs(f18.fjellSprengtLos / f14.fjellSprengtLos - 1.8 / 1.4) < 1e-6,
    `${f14.fjellSprengtLos.toFixed(0)} → ${f18.fjellSprengtLos.toFixed(0)}`);
  const lav = medFaktor({ fjellIFylling: 1.1 });
  const hoy = medFaktor({ fjellIFylling: 1.5 });
  paastand('sprengstein i fylling brukes på det tilgjengelige volumet',
    Math.abs(hoy.fraFjell / lav.fraFjell - 1.5 / 1.1) < 1e-6,
    `${lav.fraFjell.toFixed(0)} → ${hoy.fraFjell.toFixed(0)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n4j. Fjellmodellen');
{
  /* Skillet fjell/løsmasse er den største prisforskjellen i hele beregningen -
     sprengning koster mangedobbelt av graving. Likevel var modellen utestet:
     hverken strekninger, rekkevidde eller sonderingsinterpolasjonen ble
     utøvd noe sted. Fem mutasjoner i koden slapp gjennom hele selvtesten. */

  sjekk('standarddybden er 0,5 m når ingenting er oppgitt',
    new M.Fjellmodell({}).standarddybde, 0.5, 1e-9);
  sjekk('rekkevidden er 60 m når ingenting er oppgitt',
    new M.Fjellmodell({}).rekkevidde, 60, 1e-9);

  /* Strekninger: brukeren legger inn «fjell 0,3 m fra profil 120 til 260»
     fra en prøvegrop. Blir de ignorert, sier ingen ifra. */
  const medStrekning = new M.Fjellmodell({
    standarddybde: 4,
    strekninger: [{ fra: 120, til: 260, dybde: 0.3 }]
  });
  sjekk('innenfor strekningen gjelder strekningens dybde', medStrekning.dybde(0, 0, 200), 0.3, 1e-9);
  sjekk('før strekningen gjelder standarddybden', medStrekning.dybde(0, 0, 100), 4, 1e-9);
  sjekk('etter strekningen gjelder standarddybden', medStrekning.dybde(0, 0, 300), 4, 1e-9);
  sjekk('nøyaktig på startprofilet gjelder strekningen', medStrekning.dybde(0, 0, 120), 0.3, 1e-9);
  sjekk('nøyaktig på sluttprofilet gjelder strekningen', medStrekning.dybde(0, 0, 260), 0.3, 1e-9);

  /* Rekkevidde: en sondering skal ikke virke i det uendelige. */
  const medPunkt = new M.Fjellmodell({
    standarddybde: 4, rekkevidde: 50,
    punkter: [{ x: 0, y: 0, dybde: 1 }]
  });
  sjekk('rett oppå sonderingen gjelder den målte dybden', medPunkt.dybde(0, 0, 0), 1, 1e-9);
  sjekk('innenfor rekkevidden virker sonderingen', medPunkt.dybde(30, 0, 0), 1, 1e-9);
  sjekk('utenfor rekkevidden gjelder standarddybden', medPunkt.dybde(80, 0, 0), 4, 1e-9);
  paastand('rekkevidden er en virkelig grense, ikke en gradvis uttoning',
    Math.abs(medPunkt.dybde(49.9, 0, 0) - 1) < 1e-9 && Math.abs(medPunkt.dybde(50.1, 0, 0) - 4) < 1e-9);

  /* Interpolasjonen mellom to sonderinger er invers kvadratisk avstand.
     Midt mellom to like langt unna skal svaret bli snittet; nærmere den ene
     skal det trekke mot den. */
  const to = new M.Fjellmodell({
    standarddybde: 9, rekkevidde: 100,
    punkter: [{ x: 0, y: 0, dybde: 1 }, { x: 100, y: 0, dybde: 5 }]
  });
  sjekk('midt mellom to sonderinger blir det snittet', to.dybde(50, 0, 0), 3, 1e-6);
  paastand('nærmere den grunne trekker svaret ned',
    to.dybde(20, 0, 0) < 3 && to.dybde(20, 0, 0) > 1,
    `${to.dybde(20, 0, 0).toFixed(3)}`);
  paastand('nærmere den dype trekker svaret opp',
    to.dybde(80, 0, 0) > 3 && to.dybde(80, 0, 0) < 5,
    `${to.dybde(80, 0, 0).toFixed(3)}`);
  /* Vekten er 1/d², ikke 1/d. Ved 25 m og 75 m gir 1/d² 1 + (5-1)·(1/75²)/(1/25²+1/75²)
     = 1,4; med 1/d ville det blitt 2,0. Prøven skiller de to. */
  sjekk('vekten er invers kvadratisk, ikke invers lineær', to.dybde(25, 0, 0), 1.4, 0.01);

  // sonderinger går foran strekninger, og strekninger foran standarddybden
  const alle = new M.Fjellmodell({
    standarddybde: 9, rekkevidde: 50,
    strekninger: [{ fra: 0, til: 500, dybde: 3 }],
    punkter: [{ x: 0, y: 0, dybde: 1 }]
  });
  sjekk('en sondering går foran strekningen', alle.dybde(0, 0, 100), 1, 1e-9);
  sjekk('utenfor sonderingen gjelder strekningen', alle.dybde(200, 0, 100), 3, 1e-9);

  /* Og det skal slå igjennom i volumene: en strekning med fjell høyt oppe
     skal gi mer sprengning enn en uten. */
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 300, y: 0, r: 0 }]);
  const profil = new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: 300, z: 96, k: 0 }]);
  const fjellVolum = f => M.beregnMasser({
    linje, profil, terreng: { z: () => 100 }, mal: {}, fjell: f, profilAvstand: 5, bakkefaktor: 1
  }).sum.skjaeringFjell;
  const utenStrekning = fjellVolum(new M.Fjellmodell({ standarddybde: 4 }));
  const medHoytFjell = fjellVolum(new M.Fjellmodell({
    standarddybde: 4, strekninger: [{ fra: 100, til: 200, dybde: 0.3 }]
  }));
  paastand('en fjellstrekning slår igjennom i sprengningsvolumet',
    medHoytFjell > utenStrekning * 1.2,
    `${utenStrekning.toFixed(0)} → ${medHoytFjell.toFixed(0)} m³`);

  const medSondering = fjellVolum(new M.Fjellmodell({
    standarddybde: 4, rekkevidde: 60, punkter: [{ x: 150, y: 0, dybde: 0.3 }]
  }));
  paastand('en sondering slår igjennom i sprengningsvolumet',
    medSondering > utenStrekning * 1.1,
    `${utenStrekning.toFixed(0)} → ${medSondering.toFixed(0)} m³`);
}

/* ------------------------------------------------------------------ */
console.log('\n4i. Linjeføring som ikke lar seg tegne slik den står');
{
  /* To knekkpunkt pa nøyaktig samme sted er ikke to punkt. Retningen inn i det
     andre lar seg ikke regne, avbøyningen blir null, og kurven forsvant helt -
     uten kurve og uten et ord. Et dobbeltklikk i kartet holder. */
  const medDobbel = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 50, y: 0, r: 30 },
    { x: 50, y: 0, r: 30 }, { x: 50, y: 50, r: 0 }]);
  const uten = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 50, y: 0, r: 30 }, { x: 50, y: 50, r: 0 }]);
  sjekk('et duplikatpunkt gir samme linje som uten', medDobbel.lengde, uten.lengde, 1e-9);
  sjekk('og kurven blir stående', medDobbel.kurver.length, uten.kurver.length, 0);
  paastand('sammenslåingen blir meldt', medDobbel.advarsler.length > 0);

  // den største radien av de to skal overleve sammenslåingen
  const ulikRadius = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 50, y: 0, r: 5 },
    { x: 50, y: 0, r: 30 }, { x: 50, y: 50, r: 0 }]);
  paastand('den største radien overlever sammenslåingen',
    ulikRadius.kurver.length === 1 && Math.abs(ulikRadius.kurver[0].r - 30) < 1e-9,
    ulikRadius.kurver.length ? String(ulikRadius.kurver[0].r) : 'ingen kurve');

  /* Nedskaleringen hadde ingen bunn. En radius pa 200 m klemt inn mellom to
     knekkpunkt to meter fra hverandre ble til 0,22 m - en avrundingsrest, ikke
     en kurve, og en veg ingen kan kjøre. */
  const trangt = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 20, y: 0, r: 5 },
    { x: 22, y: 0.5, r: 400 }, { x: 60, y: 20, r: 0 }]);
  paastand('ingen kurve blir liggende under to meter',
    trangt.kurver.every(k => k.r >= 2), trangt.kurver.map(k => k.r.toFixed(2)).join(', '));
  paastand('og det sies at punktet ble en skarp knekk',
    trangt.advarsler.some(a => /skarp knekk/.test(a.tekst)));
  paastand('linjen går fortsatt gjennom knekkpunktet',
    trangt.projiser(20, 0).avstand < 0.5, `${trangt.projiser(20, 0).avstand.toFixed(3)} m unna`);

  // en romslig kurve skal ikke røres av noen av delene
  const romslig = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 60 }, { x: 200, y: 200, r: 0 }]);
  sjekk('en romslig kurve står urørt', romslig.kurver[0].r, 60, 1e-9);
  sjekk('og gir ingen advarsler', romslig.advarsler.length, 0, 0);
}

/* ------------------------------------------------------------------ */
console.log('\n4h. Rensk der fjellet ligger høyt');
{
  /* Rensk er avdekking - matjord, torv og stubber. Ligger fjellet i dagen,
     finnes det ingenting a skrape av, og da er det sprengning. Her sto det en
     flat `renskDybde * bredde` uten et blikk pa hva som la under, sa fast
     fjell ble bokført som avdekket løsmasse. */
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const profil = new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: 100, z: 96, k: 0 }]);
  const rensk = d => M.beregnMasser({
    linje, profil, terreng: { z: () => 100 }, mal: {},
    fjell: new M.Fjellmodell({ standarddybde: d }), profilAvstand: 5, bakkefaktor: 1
  }).sum.rensk;

  const dyp = rensk(2);
  paastand('med fjell langt nede renskes det som før', dyp > 100, `${dyp.toFixed(0)} m³`);
  sjekk('med fjell i dagen renskes det ingenting', rensk(0), 0, 1e-9);

  /* Er fjellet halvveis oppe i renskelaget, skal halve renskevolumet bli
     igjen - resten er fjell. */
  const full = rensk(KLASSISK.renskDybde);
  const halv = rensk(KLASSISK.renskDybde / 2);
  paastand('halv dybde til fjell gir halv rensk',
    Math.abs(halv - full / 2) < full * 0.02, `${halv.toFixed(0)} mot ${(full / 2).toFixed(0)}`);
  /* Ligger fjellet dypere enn renskelaget, skal rensken vaere nøyaktig
     renskedybden ganger bredden - det gamle flate regnestykket. Volumene for
     ulike fjelldybder kan ikke sammenlignes direkte, for et dypere fjell gir
     slakere skjæring og dermed bredere rensk. */
  {
    const pr = M.beregnTverrprofil({
      linje, terreng: { z: () => 100 }, mal: KLASSISK,
      fjell: new M.Fjellmodell({ standarddybde: 5 }), s: 50, vegnivaa: 96, utvidelse: 0,
      tverrfall: { venstre: 0.05, hoyre: 0.05 }, integrasjonssteg: 0.1
    });
    const bredde = (pr.fotHoyre - pr.fotVenstre) + 2 * KLASSISK.renskUtenfor;
    sjekk('med fjellet dypt er rensken dybde ganger bredde',
      pr.areal.rensk, KLASSISK.renskDybde * bredde, 0.01);
  }

  // og rensken skal fortsatt være null der terrengmodellen mangler data
  sjekk('ingen rensk uten terrengdata', M.beregnMasser({
    linje, profil, terreng: { z: () => NaN }, mal: {},
    fjell: new M.Fjellmodell({ standarddybde: 2 }), profilAvstand: 5, bakkefaktor: 1
  }).sum.rensk, 0, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n4g. Hull i terrenget skal ikke velte lengdeprofilen');
{
  /* Er hullet bredere enn glattevinduet, finner glattingen ingen verdier a
     snitte over, og høyden blir NaN. NaN sprer seg videre: `rettProfil` far
     NaN av `dz / dl`, og `NaN <= 1e-6` er usant - sa den «retter» bruddet ved
     a trekke NaN fra begge naboene. Etter noen runder var hvert eneste
     knekkpunkt NaN, og veien la pa kote null i hele sin lengde. */
  const st = [], zt = [];
  for (let s = 0; s <= 300; s += 5) { st.push(s); zt.push(s >= 100 && s <= 140 ? NaN : 100 + 0.02 * s); }

  const vip = foreslaProfil(st, zt, { vipAvstand: 40, maksStigning: 0.12, k: 1 });
  paastand('et hull gir ingen knekkpunkt uten høyde',
    vip.length >= 5 && vip.every(v => isFinite(v.z)),
    `${vip.filter(v => !isFinite(v.z)).length} av ${vip.length} uten høyde`);

  const vp = new Vertikalprofil(vip);
  paastand('profilen ligger på terrenget, ikke på kote null',
    vp.hoyde(0) > 90 && vp.hoyde(300) > 90 && vp.hoyde(120) > 90,
    `${vp.hoyde(0).toFixed(1)} / ${vp.hoyde(120).toFixed(1)} / ${vp.hoyde(300).toFixed(1)}`);
  paastand('og går rett gjennom hullet',
    Math.abs(vp.hoyde(120) - (vp.hoyde(95) + vp.hoyde(145)) / 2) < 1.0,
    `${vp.hoyde(120).toFixed(2)} mot ${((vp.hoyde(95) + vp.hoyde(145)) / 2).toFixed(2)}`);

  // et hull helt i enden skal videreføre høyden fra siden som har data
  const enden = [];
  for (let s = 0; s <= 200; s += 5) enden.push(s < 40 ? NaN : 100 + 0.03 * s);
  const vipEnde = foreslaProfil(st.slice(0, enden.length), enden, { vipAvstand: 40, maksStigning: 0.15 });
  paastand('hull i enden gir også gyldige høyder',
    vipEnde.length >= 3 && vipEnde.every(v => isFinite(v.z)));

  // uten terrengdata i det hele tatt skal det ikke komme noe forslag
  paastand('helt uten terrengdata blir det ingen profil',
    foreslaProfil(st, st.map(() => NaN), { vipAvstand: 40 }).length === 0);

  /* rettProfil skal heller ikke la en enkelt NaN-høyde smitte over pa
     naboene, uansett hvor den kommer fra. */
  const medEn = [{ s: 0, z: 100, k: 1 }, { s: 50, z: NaN, k: 1 }, { s: 100, z: 100, k: 1 }];
  rettProfil(medEn, { maksStigningFor: () => 0.1 });
  paastand('en enkelt høyde uten tall smitter ikke over på naboene',
    isFinite(medEn[0].z) && isFinite(medEn[2].z),
    JSON.stringify(medEn.map(v => v.z)));
}

/* ------------------------------------------------------------------ */
console.log('\n4f. Eksportformatene');
{
  /* Eksporten hadde ingen dekning i det hele tatt, verken her eller i
     nettlesertesten. Den skriver tallene som gar rett i maskinstyringen. */
  global.Geo = Geo;
  global.Vertikalprofil = Vertikalprofil;
  const Eksport = require(path.join(__dirname, '..', 'public', 'js', 'eksport.js'));

  const linje = new Linjeforing([{ x: 500000, y: 6500000, r: 0 },
    { x: 500100, y: 6500000, r: 40 }, { x: 500100, y: 6500200, r: 0 }]);
  const vp = new Vertikalprofil([{ s: 0, z: 100, k: 2 }, { s: 150, z: 110, k: 2 }, { s: 300, z: 100, k: 2 }]);
  const res = M.beregnMasser({
    linje, profil: vp, terreng: { z: () => 104 }, mal: {},
    fjell: new M.Fjellmodell({ standarddybde: 2 }), profilAvstand: 10, bakkefaktor: 1
  });
  const app = {
    P: { navn: 'Prøvevei «test»', vip: vp.vip, mal: KLASSISK, fjell: { punkter: [] } },
    vprofil: vp, sone: 32, linje,
    fallVed: () => ({ venstre: 0.05, hoyre: 0.05 })
  };

  /* Lengdeprofilen ma ha vertikalkurvene med. Uten dem leser mottakeren en
     kjede rette strekk: en kurve med K=2 over et brudd pa 13 % gjør veien
     nesten en halv meter lavere i høybrekket enn de rene knekkpunktene sier. */
  const xml = Eksport.landxml(app, res);
  paastand('LandXML har vertikalkurvene med',
    (xml.match(/<ParaCurve length="[\d.]+">/g) || []).length === vp.kurver.length,
    `${(xml.match(/ParaCurve/g) || []).length / 2} av ${vp.kurver.length}`);
  paastand('LandXML har både linjer og kurver i planet',
    xml.includes('<Line ') && xml.includes('<Curve '));
  paastand('LandXML oppgir koordinatsystemet', xml.includes('epsgCode="25832"'));
  paastand('LandXML har enhetene som kreves',
    xml.includes('temperatureUnit') && xml.includes('pressureUnit'));
  /* PRØVEN MÅ BRUKE DET TEGNET SOM FAKTISK KAN BRYTE ATTRIBUTTET.
     Her sto navnet «Prøvevei «test»» – FRANSKE anførselstegn. « og » er helt
     vanlige tegn i et XML-attributt og trenger ingen escaping, så attributtet
     kunne ikke brytes uansett hva eksporten gjorde. Påstanden var sann fra
     første tegn, og den var i tillegg skrevet som tre ledd med `||`, der det
     første alene gjorde hele uttrykket sant.

     Tegnene som KAN bryte et attributt er `"`, `&` og `<`. Her sendes alle tre
     inn, og kravet er at fila fortsatt er velformet XML: ingen av dem får stå
     rå inne i attributtet. Uten escaping ville navnet lukket attributtet og
     resten av taggen blitt tolket som markup. */
  {
    const stygt = 'Veg "A" & <B>';
    /* Navnet leses fra `app.P.navn` (eksport.js:322), ikke fra `app.navn` –
       det tok meg ett forsøk å finne ut, og det er verdt å skrive ned: en
       prøve som setter feil felt prøver ingenting og ser ut som en feil i
       eksporten. */
    const xml2 = Eksport.landxml(
      Object.assign({}, app, { P: Object.assign({}, app.P, { navn: stygt }) }), res);
    const ventet = 'name="Veg &quot;A&quot; &amp; &lt;B&gt;"';
    paastand('anførselstegn, & og < i prosjektnavnet blir escapet',
      xml2.includes(ventet),
      (xml2.match(/<Alignments name="[^"]*"/) || ['fant ingen Alignments'])[0].slice(0, 140));
    /* Og det rå navnet skal ikke stå noe sted – ett usikret anførselstegn
       lukker attributtet, og resten av taggen blir lest som markup. */
    paastand('  og det rå navnet står ingen steder i fila',
      !xml2.includes(stygt));
  }

  /* PI er tangentskjæringspunktet. Med buens midtpunkt ble geometrien flere
     meter feil for lesere som bygger linjen opp fra PI. */
  const pi = /<PI>([\d.]+) ([\d.]+)<\/PI>/.exec(xml);
  paastand('PI er selve knekkpunktet',
    !!pi && Math.hypot(+pi[1] - 6500000, +pi[2] - 500100) < 0.01,
    pi ? `${pi[1]} ${pi[2]}` : 'ingen PI');

  const sos = Eksport.sosi(app, res);
  paastand('SOSI oppgir høydereferansen', sos.includes('...VERT-DATUM NN2000'));
  paastand('SOSI har riktig koordinatsystem for sone 32', sos.includes('...KOORDSYS 22'));
  paastand('SOSI slutter der den skal', sos.trim().endsWith('.SLUTT'));
  {
    const min = /MIN-NØ (-?\d+) (-?\d+)/.exec(sos);
    const maks = /MAX-NØ (-?\d+) (-?\d+)/.exec(sos);
    const koord = sos.split('\r\n').filter(l => /^-?\d+ -?\d+ -?\d+$/.test(l)).map(l => l.split(' ').map(Number));
    /* ..OMRÅDE står i hele meter, koordinatlinjene i centimeter - det er
       ...ENHET 0.01 som gjelder koordinatene, ikke omradet. Her ble de to
       sammenlignet ratt mot hverandre, og testen gikk gjennom NETTOPP fordi
       begge sto i centimeter. Da omradet ble rettet til meter, sa fiksen ut
       som en regresjon. */
    paastand('SOSI-området dekker alle koordinatene i filen',
      koord.length > 10 && koord.every(k => k[0] >= +min[1] * 100 && k[0] <= +maks[1] * 100
        && k[1] >= +min[2] * 100 && k[1] <= +maks[2] * 100));
    paastand('SOSI-området står i meter, ikke i enheter',
      +maks[1] - +min[1] < 100000 && +maks[1] > 6000000 && +maks[1] < 8000000,
      `${min[1]}–${maks[1]}`);
  }

  const kof = Eksport.kof(app, res);
  const kofRader = kof.split('\r\n').filter(l => l.startsWith(' 05'));
  paastand('KOF har tre punkt per profil', kofRader.length === res.profiler.length * 3,
    `${kofRader.length} mot ${res.profiler.length * 3}`);
  paastand('KOF-koordinatene er nord, øst, høyde i den rekkefølgen', (() => {
    const tall = kofRader[0].trim().split(/\s+/).slice(-3).map(Number);
    return Math.abs(tall[0] - 6500000) < 400 && Math.abs(tall[1] - 500000) < 400
      && Math.abs(tall[2] - 100) < 20;
  })(), kofRader[0]);
  /* 01-BLOKKA BÆRER KOORDINATSYSTEMET OG AKSEREKKEFØLGEN.
     Uten den er filen nord/øst-tall uten hjemsted: mottakeren må gjette
     projeksjonen - ED50 UTM33 og EUREF89 UTM33 skiller 100-200 m i Norge - og
     en leser som forvalgt tar øst først, plasserer et punkt på Vestlandet i
     Indiahavet. */
  {
    const adm = kof.split('\r\n').find(l => l.startsWith(' 01 '));
    paastand('KOF har en 01-blokk', !!adm);
    paastand('KOF oppgir riktig K.sys for sone 32', adm && adm.slice(30, 38).trim() === '22',
      adm && '«' + adm.slice(30, 38) + '»');
    paastand('KOF sier at nord kommer først', adm && /\$1/.test(adm.slice(43)),
      adm && adm.slice(43, 56));
  }
  /* Feltbreddene er 12 / 11 / 8 med én blank imellom, ikke 12 / 12 / 12.
     ' 05 '(4) + navn(10) + ' ' + kode(8) + ' ' + N(12) + ' ' + Ø(11) + ' ' + Z(8) = 57 tegn.
     Sto alle tre på bredde 12, ble linja 59 tegn og høyden lå to kolonner
     utenfor sitt eget felt - en leser som holder seg til F8.3 i kolonne 50-57
     kuttet da millimeteren, alltid nedover.
     En prøve som bare leser «et sted rundt der» merker ikke forskjellen; den
     må telle kolonner. */
  paastand('KOF-linja har spesifikasjonens feltbredder', kofRader.every(l => l.length === 57),
    kofRader[0].length + ' tegn: «' + kofRader[0] + '»');
  paastand('KOF-høyden ligger i kolonne 50-57', (() => {
    const z = Number(kofRader[0].slice(49, 57));
    const helt = Number(kofRader[0].trim().split(/\s+/).slice(-1)[0]);
    return Number.isFinite(z) && Math.abs(z - helt) < 1e-9;
  })(), '«' + kofRader[0].slice(49, 57) + '»');
  paastand('KOF-feltene er skilt med en blank', kofRader.every(l =>
    l[14] === ' ' && l[23] === ' ' && l[36] === ' ' && l[48] === ' '));
  paastand('KOF gir ikke to punkt samme navn', (() => {
    const navn = kofRader.map(l => l.slice(4, 14).trim());
    return new Set(navn).size === navn.length;
  })());
  paastand('KOF nekter når sonen er ukjent', (() => {
    try { Eksport.kof(Object.assign(Object.create(Object.getPrototypeOf(app)), app, { sone: 99 }), res); return false; }
    catch (e) { return /sone/i.test(e.message); }
  })());
  paastand('LandXML nekter på en linje uten knekkpunkt', (() => {
    const tom = Object.assign({}, app, { linje: { elementer: [], lengde: 0, kurver: [] } });
    try { Eksport.landxml(tom, res); return false; }
    catch (e) { return /linjeføring/i.test(e.message); }
  })());
  /* DXF er kode/verdi-par, to linjer om gangen. Leses de som enkeltlinjer,
     leter man etter laget tre plasser feil, og testen «finner ingenting» -
     som ser ut som en feil i eksporten. */
  const dxfPar = tekst => {
    const l = tekst.split('\r\n'), par = [];
    for (let i = 0; i + 1 < l.length; i += 2) par.push([l[i], l[i + 1]]);
    return par;
  };
  const fotBlokk = tekst => {
    const par = dxfPar(tekst);
    for (let i = 0; i < par.length; i++) {
      if (par[i][0] === '0' && par[i][1] === 'POLYLINE'
        && par[i + 1] && par[i + 1][0] === '8' && par[i + 1][1] === 'FOTAVTRYKK') {
        const ut = [];
        for (let j = i; j < par.length; j++) { ut.push(par[j]); if (par[j][1] === 'SEQEND') break; }
        return ut;
      }
    }
    return null;
  };
  paastand('DXF lukker fotavtrykket', (() => {
    const b = fotBlokk(Eksport.dxf(app, res));
    const flagg = b && b.find(p => p[0] === '70');
    return !!flagg && (Number(flagg[1]) & 1) === 1;
  })());
  /* GRENSEN MÅ KUNNE SKILLE FLATENE FRA HVERANDRE.
     Her sto «innenfor 30 m av kote 100», og alle de 60 z-verdiene er 103,800 –
     terrenget 104 minus renskdybden 0,20. Med en grense på 30 m ville
     vegnivået (100–110), terrenget (104) og skråningsfoten alle bestått, og
     påstanden kunne ikke si hvilken av dem fotavtrykket lå på. Den fanget bare
     «ikke null».

     Fasiten her er hentet fra RESULTATET, ikke fra eksporten: skråningsfoten
     ligger på `zFotVenstre`/`zFotHoyre` i profilene. Da prøves det eksporten
     faktisk skal gjøre – legge foten i sin egen kote – med en toleranse som
     ikke rommer noen av de andre flatene. */
  paastand('DXF legger fotavtrykket i sin egen kote, ikke på null', (() => {
    const b = fotBlokk(Eksport.dxf(app, res));
    const z = b && b.filter(p => p[0] === '30').map(p => Number(p[1]));
    if (!z || z.length <= 4) return false;
    const foter = [];
    for (const pr of res.profiler) {
      if (Number.isFinite(pr.zFotVenstre)) foter.push(pr.zFotVenstre);
      if (Number.isFinite(pr.zFotHoyre)) foter.push(pr.zFotHoyre);
    }
    if (!foter.length) return false;
    const lav = Math.min(...foter) - 0.05, hoy = Math.max(...foter) + 0.05;
    return z.every(v => v >= lav && v <= hoy);
  })());

  const dxf = Eksport.dxf(app, res);
  paastand('DXF har senterlinje, vegkant og fotavtrykk',
    dxf.includes('SENTERLINJE') && dxf.includes('VEGKANT') && dxf.includes('FOTAVTRYKK'));
  paastand('DXF er et helt par-oppsett',
    dxf.split('\r\n').filter(l => l !== '').length % 2 === 0);
  paastand('DXF slutter med EOF', dxf.trim().endsWith('EOF'));

  /* Vegkanthøydene i alle formatene skal stemme med tverrsnittsberegningen -
     det er de tallene som blir stukket ut i felt. */
  const punkter = Eksport.punkter(app, res);
  let verst = 0;
  for (const p of punkter) {
    const pr = res.profiler.find(q => Math.abs(q.s - p.s) < 1e-6);
    verst = Math.max(verst,
      Math.abs(p.senter.z - pr.vegnivaa),
      Math.abs(p.venstre.z - (pr.vegnivaa - 0.05 * pr.halvbredde)),
      Math.abs(p.hoyre.z - (pr.vegnivaa - 0.05 * pr.halvbredde)));
  }
  sjekk('vegkanthøydene stemmer med tverrsnittet', verst, 0, 1e-9);
  /* FASITEN OVER ER DEN SAMME FORMELEN EKSPORTEN BRUKER, og oppsettet gjør de
     to sidene like: `fallVed` gir 0,05 begge veier, og halvbredden er én verdi.
     Da er `venstre` og `hoyre` det samme tallet, og påstanden kan ikke se om
     eksporten bytter om sidene eller bruker feil halvbredde på den ene.

     Eksporten leser `halvbreddeVenstre`/`halvbreddeHoyre` hver for seg
     (eksport.js:51-52). Under settes de til å være ULIKE – en snuplass ut til
     én side – og da må de to kanthøydene skille lag, og hver av dem følge SIN
     egen halvbredde. Det er den regelen som ikke kunne prøves før. */
  {
    const resE = M.beregnMasser({
      linje, profil: vp, terreng: { z: () => 104 }, mal: {},
      fjell: new M.Fjellmodell({ standarddybde: 2 }), profilAvstand: 10, bakkefaktor: 1,
      plasser: [{ s: 100, lengde: 30, bredde: 6, side: 'hoyre', form: 'rektangel' }]
    });
    const pE = Eksport.punkter(Object.assign({}, app), resE);
    const prE = resE.profiler.find(q => Math.abs(q.s - 100) < 1e-6);
    const pkt = pE.find(q => Math.abs(q.s - 100) < 1e-6);
    paastand('en ensidig plass gjør halvbreddene ulike',
      prE && prE.halvbreddeHoyre > prE.halvbreddeVenstre + 5,
      prE ? `${prE.halvbreddeVenstre.toFixed(2)} mot ${prE.halvbreddeHoyre.toFixed(2)}` : 'ingen profil');
    if (pkt && prE) {
      const f = app.fallVed(100);
      sjekk('  og venstre kanthøyde følger VENSTRE halvbredde',
        pkt.venstre.z, prE.vegnivaa - f.venstre * prE.halvbreddeVenstre, 1e-9);
      sjekk('  og høyre følger HØYRE',
        pkt.hoyre.z, prE.vegnivaa - f.hoyre * prE.halvbreddeHoyre, 1e-9);
      paastand('  så de to kanthøydene er ikke like',
        Math.abs(pkt.venstre.z - pkt.hoyre.z) > 0.05,
        `${pkt.venstre.z.toFixed(3)} mot ${pkt.hoyre.z.toFixed(3)}`);
    }
  }

  for (const [navn, tekst] of [['KOF', kof], ['LandXML', xml], ['SOSI', sos], ['DXF', dxf]]) {
    paastand(`${navn} inneholder verken NaN eller undefined`,
      !/NaN|undefined|Infinity/.test(tekst));
  }
}

/* ------------------------------------------------------------------ */
console.log('\n4e. Fjellflaten på tvers av snittet');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const mal = Object.assign({}, KLASSISK, { maksSokebredde: 40 });
  const terreng = { z: (x, y) => 100 - 0.35 * y };

  /* Dybden til fjell ble malt ett sted - i senterlinjen - og brukt over hele
     tverrsnittet. Setter man en sondering pa hver side, forventer man at
     fjellflaten legger seg skratt mellom dem. */
  const fjell = new M.Fjellmodell({
    standarddybde: 3, rekkevidde: 30,
    punkter: [{ x: 50, y: 8, dybde: 6 }, { x: 50, y: -8, dybde: 0.3 }]
  });
  const pr = M.beregnTverrprofil({
    linje, terreng, mal, fjell, s: 50, vegnivaa: 94, utvidelse: 0,
    tverrfall: { venstre: 0.05, hoyre: 0.05 }, integrasjonssteg: 0.1
  });
  const naer = (liste, t) => liste.reduce((a, p) => Math.abs(p[0] - t) < Math.abs(a[0] - t) ? p : a);
  const dybdeVed = t => naer(pr.geometri.terreng, t)[1] - naer(pr.geometri.fjell, t)[1];
  const venstre = dybdeVed(-8), hoyre = dybdeVed(8);
  paastand('fjellet ligger dypere der sonderingen sier det er dypt',
    venstre > 4 && hoyre < 1.5, `venstre ${venstre.toFixed(2)} m, høyre ${hoyre.toFixed(2)} m`);
  paastand('og flaten heller jevnt mellom dem',
    dybdeVed(-4) > dybdeVed(0) && dybdeVed(0) > dybdeVed(4));

  // uten sonderinger skal flaten ligge parallelt med terrenget
  const jamt = M.beregnTverrprofil({
    linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 2 }),
    s: 50, vegnivaa: 94, utvidelse: 0, tverrfall: { venstre: 0.05, hoyre: 0.05 }, integrasjonssteg: 0.1
  });
  const d = t => naer(jamt.geometri.terreng, t)[1] - naer(jamt.geometri.fjell, t)[1];
  paastand('uten sonderinger ligger fjellflaten parallelt med terrenget',
    Math.abs(d(-8) - 2) < 0.05 && Math.abs(d(8) - 2) < 0.05, `${d(-8).toFixed(2)} / ${d(8).toFixed(2)}`);

  /* Marsjen ut mot skraningsfoten skal bytte helning nøyaktig der den krysser
     fjelloverflaten - ikke et halvt steg for tidlig eller for sent. */
  const bratt = { z: (x, y) => 100 - 0.9 * y };
  const p2 = M.beregnTverrprofil({
    linje, terreng: bratt, mal: Object.assign({}, mal, { maksSokebredde: 60 }),
    fjell: new M.Fjellmodell({ standarddybde: 2 }), s: 50, vegnivaa: 94, utvidelse: 0,
    tverrfall: { venstre: 0.05, hoyre: 0.05 }, integrasjonssteg: 0.1
  });
  const k = p2.sider[1].knekk;
  let gale = 0, prøvd = 0;
  for (let i = 1; i < k.length; i++) {
    const dt = k[i].t - k[i - 1].t, dz = k[i].z - k[i - 1].z;
    if (dt < 1e-9 || dz < 1e-12) continue;
    prøvd++;
    const fjelltopp = bratt.z(50, -k[i - 1].t) - 2;
    const venta = k[i - 1].z < fjelltopp - 1e-9 ? mal.skjaeringFjell : mal.skjaeringLosmasse;
    if (Math.abs(dt / dz - venta) > 0.05) gale++;
  }
  paastand('skråningen bruker riktig helning på hvert eneste steg',
    gale === 0 && prøvd > 100, `${gale} av ${prøvd} steg feil`);
}

/* ------------------------------------------------------------------ */
console.log('\n4d. Retting av vertikalgeometrien');
{
  const krav = { minVertikalLavbrekk: 200, minVertikalHoybrekk: 150 };
  const bruddene = (vip) => {
    const vp = new Vertikalprofil(vip);
    const ut = [];
    for (let i = 1; i < vp.vip.length - 1; i++) {
      const A = vp.stigninger[i] - vp.stigninger[i - 1];
      if (Math.abs(A) < 5e-3) continue;
      const k = A > 0 ? krav.minVertikalLavbrekk : krav.minVertikalHoybrekk;
      const kurve = vp.kurver.find(c => c.vip === i);
      if ((kurve ? kurve.L : 0) < k * Math.abs(A) - 1e-6) ut.push(vp.vip[i].s);
    }
    return ut;
  };

  /* Alle laste høyder far K=0, og da lages det ingen vertikalkurve. rettProfil
     flytter høyder men rører aldri K, sa disse bruddene sto igjen etter en
     retting som ellers tok bort alt annet. */
  const lag = () => {
    const v = [];
    for (let s = 0; s <= 400; s += 20) v.push({ s, z: 100 + 3 * Math.sin(s / 23), k: 0 });
    return v;
  };
  const for_ = bruddene(lag());
  paastand('utgangspunktet bryter kravet flere steder', for_.length >= 5, `${for_.length} brudd`);

  const rettet = lag();
  const gjort = rettVertikalgeometri(rettet, krav);
  paastand('rettingen fjerner alle vertikalkurvebrudd', bruddene(rettet).length === 0,
    `${bruddene(rettet).length} igjen, satt K ${gjort.satt}, glattet ${gjort.glattet}`);

  // Der kurven far plass skal K settes, ikke høyden flyttes
  const romslig = [{ s: 0, z: 100, k: 0 }, { s: 200, z: 104, k: 0 }, { s: 400, z: 104, k: 0 }];
  const forHoyde = romslig[1].z;
  rettVertikalgeometri(romslig, krav);
  sjekk('romslig brudd løses med K, ikke ved å flytte høyden', romslig[1].z, forHoyde, 1e-9);
  paastand('K ble satt høyt nok', romslig[1].k >= krav.minVertikalHoybrekk / 100 - 1e-9);

  /* Er bruddet for skarpt for avstanden mellom høydene, hjelper ingen K -
     da ma selve knekken bli mindre. */
  const trangt = [{ s: 0, z: 100, k: 0 }, { s: 10, z: 103, k: 0 }, { s: 20, z: 100, k: 0 }];
  const A0 = Math.abs((100 - 103) / 10 - (103 - 100) / 10);
  rettVertikalgeometri(trangt, krav);
  const A1 = Math.abs((trangt[2].z - trangt[1].z) / (trangt[2].s - trangt[1].s)
    - (trangt[1].z - trangt[0].z) / (trangt[1].s - trangt[0].s));
  paastand('for skarpt brudd blir slakere', A1 < A0 * 0.8, `${(A0 * 100).toFixed(1)} % → ${(A1 * 100).toFixed(1)} %`);
  paastand('trangt brudd er løst', bruddene(trangt).length === 0);

  /* Plassen er ikke bare avstanden til naboknekkpunktene: `_bygg` korter inn
     en kurve sa den ikke tar over naboens, sa naboens kurve spiser av plassen
     ogsa. Med avstanden alene trodde rettingen at det var rom der det ikke
     var, satte K, og kom tilbake til samme brudd runde etter runde. */
  {
    const lag = () => {
      const v = [];
      for (let s = 0; s <= 200; s += 25) v.push({ s, z: 100 + 3 * Math.sin(s / 18), k: 0 });
      return v;
    };
    const tett = lag();
    const foer = bruddene(tett).length;
    paastand('utgangspunktet har flere brudd som konkurrerer om plassen', foer >= 5, `${foer}`);
    rettVertikalgeometri(tett, krav);
    paastand('kurver som konkurrerer om plassen blir likevel løst',
      bruddene(tett).length === 0, `${bruddene(tett).length} igjen av ${foer}`);
  }

  // En last høyde skal ikke flyttes for a redde vertikalgeometrien
  const laast = [{ s: 0, z: 100, k: 0 }, { s: 10, z: 103, k: 0, laast: true }, { s: 20, z: 100, k: 0 }];
  const res = rettVertikalgeometri(laast, krav);
  sjekk('last høyde star i ro', laast[1].z, 103, 1e-9);
  paastand('og det blir meldt fra om den', res.laste > 0);

  // En jevn profil skal ikke røres i det hele tatt
  const jevn = [];
  for (let s = 0; s <= 200; s += 20) jevn.push({ s, z: 100 - 0.04 * s, k: 0 });
  const kopi = jevn.map(v => Object.assign({}, v));
  rettVertikalgeometri(jevn, krav);
  paastand('jevn profil star urørt', jevn.every((v, i) => Math.abs(v.z - kopi[i].z) < 1e-12));
}

/* ------------------------------------------------------------------ */
console.log('\n4b. Krumningsvekten i kurver (Pappus)');
{
  /* En stripe t meter ut fra senterlinja sveiper (1 + t·kr) sa langt som
     senterlinja selv. Vekten sto helt utestet: skrudde man den av, gikk hele
     selvtesten gjennom uten en eneste anmerkning, mens volumet i kurver ble
     flere prosent feil.
     Testen bygger pa en identitet, ikke pa en handregnet fasit: legger vi den
     samme tverrsnittforma pa ytre og indre side av samme kurve, ma summen av
     de to vektede arealene bli nøyaktig to ganger det uvektede, siden
     (1+t·kr) + (1-t·kr) = 2. Den holder uansett hvordan tverrsnittet ser ut. */
  const R = 60, Z0 = 100, G = 0.25;
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: R }, { x: 200, y: 200, r: 0 }]);
  const senter = { x: 140, y: 60 };                 // kurvesenteret i 90°-svingen
  const profil = new Vertikalprofil([{ s: 0, z: Z0, k: 0 }, { s: linje.lengde, z: Z0, k: 0 }]);
  // kjegleterreng rundt kurvesenteret: stiger utover (+1) eller innover (-1)
  const kjor = tegn => M.beregnMasser({
    linje, profil,
    terreng: { z: (x, y) => Z0 + tegn * G * (Math.hypot(x - senter.x, y - senter.y) - R) },
    /* UTEN MASSEUTSKIFTING. Det som måles her er Pappus-vektingen – at en
       stripe t meter ute sveiper (1 + t·kr) så langt som senterlinja – og den
       er en egenskap ved integrasjonen, ikke ved trauet. `beregnMasser` fletter
       malen med StandardMal, så utskiftingen sto PÅ her uten at det var meningen,
       og med skrå trauvegg graves hele skjæringen bort som utskifting: alle 18
       kurveprofilene fikk skjæring null, og «ytre side er tyngst» kan ikke måles
       på null. Identiteten under gjelder like fullt for utskiftingen; den har
       sine egne prøver i 4u. */
    mal: {
      vegbredde: 4.5, tverrfallType: 'tak', tverrfall: 0.05,
      breddeIKurve: [], ensidigUnderRadius: 0, maksSokebredde: 60,
      skjaeringLosmasse: 1.5, fylling: 1.5, renskDybde: 0.2, utskifting: false
    },
    fjell: new M.Fjellmodell({ standarddybde: 50 }), profilAvstand: 5, bakkefaktor: 1
  });
  const ut = kjor(+1), inn = kjor(-1);

  let verst = 0, iKurve = 0, ytreStorst = 0, formLik = true;
  for (let i = 0; i < ut.profiler.length; i++) {
    const a = ut.profiler[i], b = inn.profiler[i];
    if (Math.abs(a.krumning) < 1e-9 || a.manglerData || b.manglerData) continue;
    iKurve++;
    if (Math.abs(a.areal.skjaering - b.areal.skjaering) > 1e-6) formLik = false;
    const avvik = (a.vektet.skjaering + b.vektet.skjaering) - 2 * a.areal.skjaering;
    verst = Math.max(verst, Math.abs(avvik) / Math.max(1e-9, a.areal.skjaering));
    if (a.vektet.skjaering > a.areal.skjaering * 1.0001) ytreStorst++;
  }
  paastand('kurven gir profiler a male pa', iKurve >= 10);
  paastand('speilvendt terreng gir samme tverrsnittform', formLik);
  sjekk('ytre + indre vekt = 2 · uvektet', verst, 0, 1e-6);
  paastand('ytre side gir mer volum enn uvektet i hele kurven', ytreStorst === iKurve);

  // og uten krumning skal vekten vere nøyaktig 1
  let rettAvvik = 0;
  for (const p of ut.profiler) {
    if (Math.abs(p.krumning) > 1e-9 || p.manglerData) continue;
    rettAvvik = Math.max(rettAvvik, Math.abs(p.vektet.skjaering - p.areal.skjaering));
  }
  sjekk('rett strekning: vektet = uvektet', rettAvvik, 0, 1e-12);
}

/* ------------------------------------------------------------------ */
console.log('\n4c. Tall som ikke lar seg regne med');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const profil = new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: 100, z: 96, k: 0 }]);
  const flatt = { z: () => 100 };
  const grunn = () => ({
    linje, profil, terreng: flatt, mal: {},
    fjell: new M.Fjellmodell({ standarddybde: 5 }), profilAvstand: 5, bakkefaktor: 1
  });
  const med = endring => M.beregnMasser(Object.assign(grunn(), endring));

  /* Profilavstand null eller negativ ga en løkke som aldri kom ut. Skjemaet
     klemmer den, men en prosjektfil gar rett inn - fana hang med ett klikk. */
  for (const dS of [0, -5, NaN, Infinity]) {
    const r = med({ profilAvstand: dS });
    paastand(`profilavstand ${dS} henger ikke og sier ifra`,
      r.profiler.length > 1 && r.merknader.some(m => m.type === 'inngang'));
  }

  /* En fjelldybde som ikke er et tall smittet over pa hele balansen - uten en
     eneste merknad, og med riktig skjæringsvolum sa ingenting sa galt ut. */
  const nanFjell = med({ fjell: new M.Fjellmodell({ standarddybde: NaN }) });
  paastand('NaN fjelldybde gir tall og merknad',
    Object.values(nanFjell.sum).every(isFinite)
    && Object.values(nanFjell.balanse).every(isFinite)
    && nanFjell.merknader.some(m => m.type === 'inngang'));

  const nanPunkt = med({
    fjell: new M.Fjellmodell({ standarddybde: 2, punkter: [{ x: 50, y: 0, dybde: undefined }] })
  });
  paastand('sonderingspunkt uten dybde gir tall',
    Object.values(nanPunkt.sum).every(isFinite) && Object.values(nanPunkt.balanse).every(isFinite));

  // Negative mal- og faktorverdier skal aldri gi negative volum
  for (const [felt, verdi] of [['vegbredde', -4.5], ['baerelagTykkelse', -0.6],
    ['slitelagTykkelse', -0.5], ['renskDybde', -1], ['renskUtenfor', -50]]) {
    const r = med({ mal: { [felt]: verdi } });
    paastand(`${felt}=${verdi} gir ingen negative volum og sier ifra`,
      Object.values(r.sum).every(v => v >= -1e-9) && r.merknader.some(m => m.type === 'inngang'),
      JSON.stringify(r.sum));
  }
  for (const [felt, verdi] of [['fjellIFylling', -1.3], ['brukbarLosmasse', 2], ['sprengningsfaktor', -1]]) {
    const r = med({ faktorer: { [felt]: verdi } });
    paastand(`faktor ${felt}=${verdi} gir ingen negative poster og sier ifra`,
      Object.values(r.balanse).every(v => v >= -1e-6) && r.merknader.some(m => m.type === 'inngang'),
      JSON.stringify(r.balanse));
  }

  /* `isFinite` gjør om argumentet til tall før den svarer, sa isFinite(null),
     isFinite('') og isFinite([]) er alle sanne. Null blir til null - et gyldig
     tall, bare ikke det brukeren mente. En tom fjelldybde ble slik lest som
     «fjell i dagen», og hele skjæringen ble bokført som sprengning uten et ord. */
  const fasit = med({});
  for (const [navn, endring] of [
    ['vegbredde = null', { mal: { vegbredde: null } }],
    ['vegbredde = tom streng', { mal: { vegbredde: '' } }],
    ['renskDybde = tom streng', { mal: { renskDybde: '' } }],
    ['fyllingsskråning = null', { mal: { fylling: null } }],
    ['fyllingsskråning = NaN', { mal: { fylling: NaN } }],
    ['sprengstein i fylling = null', { faktorer: { fjellIFylling: null } }]
  ]) {
    const r = med(endring);
    paastand(`${navn} blir rettet og meldt`,
      r.merknader.some(m => m.type === 'inngang')
      && Math.abs(r.sum.skjaering - fasit.sum.skjaering) < 1
      && Object.values(r.sum).every(v => isFinite(v) && v >= -1e-9),
      `${r.merknader.filter(m => m.type === 'inngang').length} merknader, skjæring ${r.sum.skjaering.toFixed(0)}`);
  }

  /* EN ØDELAGT FJELLDYBDE SKAL GI SAMME SVAR SOM STANDARDVERDIEN, IKKE FJELL
     I DAGEN.
     Her sto «fjellandelen er under 99 % av skjæringen» som mål på at berget
     ikke lå oppe i dagen. Det var en omvei, og den sluttet å virke: med
     masseutskifting er alt løst over fjellet allerede tatt ut som utskifting,
     så det som står igjen å grave ER fjell – 100 % – også når fjelldybden er
     helt i orden. Målt: 0,5 m og null og tom streng gir alle 5 540 m³ fjell.

     Nå måles det som faktisk betyr noe: en ødelagt verdi skal gi NØYAKTIG de
     samme kubikkene som den gyldige standardverdien på 0,5 m – ikke tallene man
     får med berget i dagen, som er noe helt annet (rensk 893 mot 0). Og den
     skal meldes. Det er strengere enn kravet som sto her. */
  const fasitFjell = med({ fjell: new M.Fjellmodell({ standarddybde: 0.5 }) });
  const iDagen = med({ fjell: new M.Fjellmodell({ standarddybde: 0 }) });
  paastand('fjell i dagen er noe MERKBART annet enn standarddybden',
    fasitFjell.sum.rensk > 100 && iDagen.sum.rensk < 1e-6,
    `${fasitFjell.sum.rensk.toFixed(0)} mot ${iDagen.sum.rensk.toFixed(0)}`);
  for (const tom of [null, '']) {
    const r = med({ fjell: new M.Fjellmodell({ standarddybde: tom }) });
    paastand(`fjelldybde ${JSON.stringify(tom)} rettes til standardverdien og meldes`,
      r.merknader.some(m => m.type === 'inngang' && /fjell/i.test(m.tekst))
      && Math.abs(r.sum.rensk - fasitFjell.sum.rensk) < 1e-6
      && Math.abs(r.sum.skjaeringFjell - fasitFjell.sum.skjaeringFjell) < 1e-6,
      `rensk ${r.sum.rensk.toFixed(1)} mot ${fasitFjell.sum.rensk.toFixed(1)}`);
  }
  paastand('en fjelldybde som ikke er oppgitt får standardverdien uten oppstyr',
    Math.abs(new M.Fjellmodell({}).standarddybde - 0.5) < 1e-9);

  const utenDybde = med({ fjell: new M.Fjellmodell({ standarddybde: 5, punkter: [{ x: 50, y: 0 }] }) });
  paastand('en fjellobservasjon uten dybde blir meldt',
    utenDybde.merknader.some(m => m.type === 'inngang' && /observasjon/i.test(m.tekst)));

  /* Bakkefaktoren gar i andre potens pa hvert volum. I Norge ligger den mellom
     0,999 og 1,001 - kommer det noe utenfor et par prosent, er det ikke en
     malestokk. */
  const stor = med({ bakkefaktor: 3 });
  paastand('en urimelig bakkefaktor blir avvist',
    stor.merknader.some(m => m.type === 'inngang')
    && Math.abs(stor.sum.skjaering - fasit.sum.skjaering) < 1);

  // Bakkefaktor under null ga negativ veglengde i rapporten
  const negBf = med({ bakkefaktor: -1 });
  paastand('negativ bakkefaktor gir positiv lengde og merknad',
    negBf.lengde > 0 && negBf.merknader.some(m => m.type === 'inngang'));

  /* En linje uten lengde gir null i alle poster. Det er et gyldig tall, og
     nettopp derfor farlig - rapporten ser ferdig ut. */
  for (const ip of [[], [{ x: 0, y: 0, r: 0 }], [{ x: 5, y: 5, r: 0 }, { x: 5, y: 5, r: 0 }]]) {
    const r = M.beregnMasser(Object.assign(grunn(), { linje: new Linjeforing(ip) }));
    paastand(`linje med ${ip.length} punkt sier ifra`, r.merknader.some(m => m.type === 'linje'));
  }

  /* Radius som ikke far plass blir kortet inn - det skal sta i rapporten, men
     som en OPPLYSNING, ikke som et brudd. Normaler for landbruksveier setter en
     nedre grense for radius; ingen kilde krever at den bygde radien er lik den
     tegnede. Sto den som `linje`, ble den talt med i «brudd», og «Gjør lovlig»
     jaktet paa den med verktøy som ikke traff - knappen ga opp uten aa ha
     prøvd noe som virker. */
  const trang = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 40, y: 0, r: 500 }, { x: 40, y: 40, r: 0 }]);
  const kortet = M.beregnMasser(Object.assign(grunn(), {
    linje: trang, profil: new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: trang.lengde, z: 96, k: 0 }])
  }));
  paastand('innkortet kurve blir meldt i rapporten',
    trang.advarsler.length > 0 && kortet.merknader.some(m => /kortet inn/.test(m.tekst)));
  paastand('men som opplysning, ikke som brudd',
    kortet.merknader.filter(m => /kortet inn/.test(m.tekst)).every(m => m.type === 'avvik'));

  /* Den bygde radien maa vaere tilgjengelig, indeksert slik den som kaller inn
     forventer. `kurver[].ip` peker inn i den SAMMENSLAATTE lista, saa den kan
     ikke brukes til aa skrive noe tilbake. */
  paastand('oppnaddeRadier gir den bygde radien, ikke den bestilte',
    Math.abs(trang.oppnaddeRadier(3)[1] - trang.kurver[0].r) < 1e-9
    && trang.oppnaddeRadier(3)[1] < 500);
  {
    // to punkt oppaa hverandre: indeksene forskyver seg
    const dobbel = new Linjeforing([
      { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 },
      { x: 60, y: 0, r: 30 }, { x: 60, y: 60, r: 0 }
    ]);
    const rr = dobbel.oppnaddeRadier(4);
    paastand('og treffer riktig knekkpunkt naar to laa oppaa hverandre',
      rr.length === 4 && rr[2] != null && rr[1] == null && rr[0] == null,
      JSON.stringify(rr));
  }

  /* Et skarpt hjørne gir ingen post i `kurver`, og `radiusVed` svarer Infinity
     paa rettstrekket gjennom det. En kontroll som bare ser paa kurver ser det
     aldri - og radius null er under ethvert minstekrav. */
  {
    const skarp = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 80, y: 0, r: 0 }, { x: 80, y: 80, r: 0 }]);
    paastand('skarpt hjørne blir funnet', skarp.skarpeHjorner().length === 1
      && Math.abs(Math.abs(skarp.skarpeHjorner()[0].avboy) - Math.PI / 2) < 1e-9);
    const g2 = grunn();
    g2.mal = Object.assign({}, g2.mal, { minRadius: 20 });
    const rSkarp = M.beregnMasser(Object.assign(g2, {
      linje: skarp, profil: new Vertikalprofil([{ s: 0, z: 96, k: 0 }, { s: skarp.lengde, z: 96, k: 0 }])
    }));
    paastand('og meldes som kurvaturbrudd',
      rSkarp.merknader.some(m => m.type === 'kurvatur' && /skarpt hjørne/.test(m.tekst)),
      rSkarp.merknader.filter(m => m.type === 'kurvatur').map(m => m.tekst).join(' | ') || 'ingen');
  }

  /* isFinite(null) er sant. En terrengmodell som svarer null for hull ville
     blitt lest som kote 0 - hundretusenvis av kubikk fylling, ingen merknad. */
  const nullTerreng = med({ terreng: { z: () => null } });
  paastand('terreng som svarer null teller som manglende data',
    nullTerreng.sum.fylling < 1 && nullTerreng.merknader.some(m => m.type === 'data'),
    `fylling ${nullTerreng.sum.fylling.toFixed(0)}`);

  /* Bredde og integrasjonssteg kommer begge fra felt uten grenser, og
     produktet er antall punkt i snittet. Uten tak dør programmet. */
  const t0 = Date.now();
  const fint = med({ integrasjonssteg: 1e-7 });
  paastand('svært lite integrasjonssteg krasjer ikke',
    isFinite(fint.sum.skjaering) && Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
  const bred = med({ mal: { vegbredde: 25, maksSokebredde: 400 } });
  paastand('svært bred veg krasjer ikke', isFinite(bred.sum.skjaering));

  // To knekkpunkt pa samme profilnummer ga et loddrett sprang i profilen
  const dobbel = new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 50, z: 110, k: 0 },
    { s: 50, z: 90, k: 0 }, { s: 100, z: 100, k: 0 }]);
  paastand('doble knekkpunkt gir ikke loddrett sprang',
    Math.abs(dobbel.hoyde(50.1) - dobbel.hoyde(49.9)) < 0.5,
    `${dobbel.hoyde(49.9).toFixed(2)} -> ${dobbel.hoyde(50.1).toFixed(2)}`);
  paastand('alle stigninger er tall etter opprydding', dobbel.stigninger.every(isFinite));
}

/* ------------------------------------------------------------------ */
console.log('\n4b. Hull i terrengmodellen');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const mal = Object.assign({}, KLASSISK);
  const fjell = new M.Fjellmodell({ standarddybde: 5 });

  // Ingen data i det hele tatt
  const tomt = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 1 }, { s: 100, z: 100, k: 1 }]),
    terreng: { z: () => NaN }, mal, fjell, profilAvstand: 10, bakkefaktor: 1
  });
  paastand('helt uten terrengdata gir tall, ikke NaN',
    Object.values(tomt.sum).every(v => isFinite(v)));
  paastand('helt uten terrengdata gir datamerknad',
    tomt.merknader.length > 0 && tomt.merknader.every(m => m.type === 'data'));

  // Data bare på den ene siden
  const halvt = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 99, k: 1 }, { s: 100, z: 99, k: 1 }]),
    // dekning bare fram til 2 m til høyre for senterlinjen
    terreng: { z: (x, y) => (y > -2 ? 100 : NaN) }, mal, fjell, profilAvstand: 10, bakkefaktor: 1
  });
  paastand('delvis dekning gir gyldige tall og merknad',
    Object.values(halvt.sum).every(v => isFinite(v)) && halvt.merknader.some(m => m.type === 'data'));
}

/* ------------------------------------------------------------------ */
console.log('\n5. Massebalanse');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }]);
  const mal = Object.assign({}, KLASSISK);
  const flatt = { z: () => 100 };

  for (const [navn, vegz, fjelldybde] of [
    ['ren skjæring i fjell', 96, 0],
    ['ren skjæring i løsmasse', 96, 20],
    ['ren fylling', 104, 0]
  ]) {
    const r = M.beregnMasser({
      linje, profil: new Vertikalprofil([{ s: 0, z: vegz, k: 1 }, { s: 200, z: vegz, k: 1 }]),
      terreng: flatt, mal, fjell: new M.Fjellmodell({ standarddybde: fjelldybde }),
      profilAvstand: 10, bakkefaktor: 1
    });
    const b = r.balanse;
    /* ANKERET FØRST – de to under er identiteter som holder for ethvert tall.
       Se den lange begrunnelsen ved «fyllingsbehovet ER fyllingen» i seksjon 4.
       Her gjentas de for tre tilfeller, så tre grønne lys hvilte på den samme
       tautologien. */
    sjekk(`${navn}: fyllingsbehovet ER fyllingen`, b.fyllingBehov, r.sum.fylling, 1e-6);
    sjekk(`${navn}: bærelagsbehovet ER bærelaget`, b.baerelagBehov, r.sum.baerelag, 1e-6);
    sjekk(`${navn}: fylling går opp`, b.fyllFraLos + b.fyllFraFjell + b.manglerFylling, b.fyllingBehov, 1e-6);
    sjekk(`${navn}: bærelag går opp`, b.baerelagFraFjell + b.manglerBaerelag, b.baerelagBehov, 1e-6);
    paastand(`${navn}: ingen negative poster`,
      b.manglerFylling >= -1e-9 && b.manglerBaerelag >= -1e-9 && b.overskuddFjell >= -1e-9 && b.tilDeponi >= 0);
  }

  // Dyp fjellskjæring skal dekke bade fylling og bærelag og gi overskudd
  const dyp = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 92, k: 1 }, { s: 200, z: 92, k: 1 }]),
    terreng: flatt, mal, fjell: new M.Fjellmodell({ standarddybde: 0 }), profilAvstand: 10, bakkefaktor: 1
  });
  paastand('dyp fjellskjæring dekker bærelaget', dyp.balanse.manglerBaerelag < 1e-6 && dyp.balanse.overskuddFjell > 0);

  // Ren fylling uten skjæring gir mangel bade pa fylling og bærelag
  const fyll = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 106, k: 1 }, { s: 200, z: 106, k: 1 }]),
    terreng: flatt, mal, fjell: new M.Fjellmodell({ standarddybde: 5 }), profilAvstand: 10, bakkefaktor: 1
  });
  paastand('ren fylling gir massemangel',
    fyll.balanse.manglerFylling > 0 && fyll.balanse.manglerBaerelag > 0 && fyll.balanse.overskuddFjell < 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n6. Veiklasser, breddeutvidelse og stigningskrav');
{
  const V = require(path.join(__dirname, '..', 'public', 'js', 'veiklasser.js'));
  const mal = KLASSISK;   // klasse 5, veibredde 4,5 m

  /* Normalen for klasse 5 krever 5,5 m total bredde i en kort kurve med
     R = 10–14 m. Bygges veien 4,5 m bred, blir utvidelsen 1,0 m. */
  sjekk('utvidelse ved R=10, kort kurve', M.utvidelseFraRadius(mal, 10, 45), 1.0, 1e-9);
  sjekk('utvidelse ved R=10, lang kurve', M.utvidelseFraRadius(mal, 10, 135), 1.5, 1e-9);
  sjekk('utvidelse ved R=12 interpolert', M.utvidelseFraRadius(mal, 12, 90), 1.25, 1e-9);
  sjekk('utvidelse ved R=30 kort kurve', M.utvidelseFraRadius(mal, 30, 45), 0, 1e-9);
  sjekk('utvidelse ved R=30 lang kurve', M.utvidelseFraRadius(mal, 30, 135), 0.5, 1e-9);
  sjekk('utvidelse på rettstrekk', M.utvidelseFraRadius(mal, Infinity, 45), 0, 1e-9);

  /* Stigningskravet avhenger av hvilken vei lasset kjører. Med lassretning
     mot profil 0 (-1) er en fallende veg motbakke for lasset. */
  sjekk('R=10, lasset klatrer', M.maksStigningFraRadius(mal, 10, -0.05, -1), 0.10, 1e-9);
  sjekk('R=10, tom bil klatrer', M.maksStigningFraRadius(mal, 10, +0.05, -1), 0.12, 1e-9);
  sjekk('R=30, lasset klatrer', M.maksStigningFraRadius(mal, 30, -0.05, -1), 0.14, 1e-9);
  sjekk('R=30, tom bil klatrer', M.maksStigningFraRadius(mal, 30, +0.05, -1), 0.17, 1e-9);
  sjekk('rettstrekk, tom bil klatrer', M.maksStigningFraRadius(mal, Infinity, +0.05, -1), 0.20, 1e-9);
  sjekk('uten retning gis det romsligste kravet', M.maksStigningFraRadius(mal, 10, null), 0.12, 1e-9);

  // Verdiene i planen for Ydestad er klasse 5 sine returretningskrav
  sjekk('Ydestad: R=10 gir 12 %', M.maksStigningFraRadius(mal, 10, 0.05, -1), 0.12, 1e-9);
  sjekk('Ydestad: R=30 gir 17 %', M.maksStigningFraRadius(mal, 30, 0.05, -1), 0.17, 1e-9);
  sjekk('Ydestad: rettstrekk gir 20 %', M.maksStigningFraRadius(mal, 1e9, 0.05, -1), 0.20, 1e-9);

  // Hurtigvalg av klasse skal sette malen
  const k3 = V.malFraVeiklasse('k3', Object.assign({}, KLASSISK));
  sjekk('klasse 3 setter veibredde', k3.vegbredde, 4.0, 1e-9);
  sjekk('klasse 3 setter minste radius', k3.minRadius, 10, 1e-9);
  sjekk('klasse 3 setter overgangslengde for bredde', k3.utvidelseOvergang, 20, 1e-9);
  sjekk('klasse 3 setter egen utflating for stigning', k3.utflatingForKurve, 10, 1e-9);
  sjekk('klasse 3 krever 7,0 m i R=10 kort kurve', M.utvidelseFraRadius(k3, 10, 45) + k3.vegbredde, 7.0, 1e-9);
  const k2 = V.malFraVeiklasse('k2', Object.assign({}, KLASSISK));
  sjekk('klasse 2 setter veibredde', k2.vegbredde, 4.5, 1e-9);
  sjekk('klasse 2 har 20 m minsteradius', k2.minRadius, 20, 1e-9);
  sjekk('klasse 2 maks 8 % stigning', M.maksStigningFraRadius(k2, 1e9, 0.05, -1), 0.08, 1e-9);
  paastand('alle klassene har navn og beskrivelse',
    Object.values(V.Veiklasser).every(k => k.navn && k.beskrivelse));

  /* Verdier kontrollert mot normalen kapittel for kapittel. Hver av disse
     var feil en gang, sa de star her for at de ikke skal bli det igjen. */
  const K = V.Veiklasser;
  sjekk('K6 lavbrekk er 200 m, ikke 100', K.k6.minVertikalLavbrekk, 200, 1e-9);
  sjekk('K7 vertikalradius er 50 m', K.k7.minVertikalLavbrekk, 50, 1e-9);
  sjekk('K7 høybrekk er ogsa 50 m', K.k7.minVertikalHoybrekk, 50, 1e-9);

  // Breddeovergang og stigningsutflating er to ulike lengder i normalen
  const overganger = { k2: [20, 20], k3: [20, 10], k4: [20, 10], k5: [15, 10], k6: [20, 10], k7: [5, 10] };
  for (const [n, [bredde, stigning]] of Object.entries(overganger)) {
    sjekk(`${n}: breddeovergang`, K[n].utvidelseOvergang, bredde, 1e-9);
    sjekk(`${n}: stigningsutflating`, K[n].stigningsovergang, stigning, 1e-9);
  }

  // «I fyllinger høyere enn 2 m skal veibredden økes med 0,5 m»
  for (const n of ['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']) {
    paastand(`${n} har fyllingsregelen for ekstra bredde`,
      K[n].ekstraBredde && K[n].ekstraBredde.fyllingshoyde === 2.0 && K[n].ekstraBredde.tillegg === 0.5);
  }
  sjekk('K4 har ogsa stigningsvilkaret', K.k4.ekstraBredde.stigning, 0.12, 1e-9);
  sjekk('K5 har stigningsvilkaret pa 14 %', K.k5.ekstraBredde.stigning, 0.14, 1e-9);

  // K8: normalen sier uttrykkelig at det ikke stilles krav til kurvatur
  paastand('K8 har ingen kurvaturkrav',
    K.k8.minRadius === 0 && K.k8.minVertikalLavbrekk === 0 && K.k8.minVertikalHoybrekk === 0);

  // Traktorvei doserer krappere og brattere enn bilveiklassene
  sjekk('K7 doserer under 20 m radius', K.k7.ensidigUnderRadius, 20, 1e-9);
  sjekk('K7 tillater 10 % ensidig fall', K.k7.ensidigMaks, 0.10, 1e-9);

  /* Radiusbandene er hele meter. En radius mellom to band skal beholde det
     strengere kravet - før falt den mellom stolene og ga null utvidelse. */
  const k3mal = V.malFraVeiklasse('k3', Object.assign({}, KLASSISK, { vegbredde: 4.0 }));
  sjekk('R=14 krever 7,0 m', M.utvidelseFraRadius(k3mal, 14, 45) + 4.0, 7.0, 1e-9);
  sjekk('R=14,5 faller ikke mellom bandene', M.utvidelseFraRadius(k3mal, 14.5, 45) + 4.0, 7.0, 1e-9);
  sjekk('R=15 gar over i neste band', M.utvidelseFraRadius(k3mal, 15, 45) + 4.0, 6.5, 1e-9);
  sjekk('R=24,5 beholder 20-24-kravet', M.utvidelseFraRadius(k3mal, 24.5, 45) + 4.0, 6.0, 1e-9);
  sjekk('R=100 er utenfor tabellen', M.utvidelseFraRadius(k3mal, 100, 45), 0, 1e-9);

  // Samme for stigningskravet
  sjekk('stigning ved R=14', M.maksStigningFraRadius(k3mal, 14, 0.05, -1), 0.05, 1e-9);
  sjekk('stigning ved R=14,5 beholder strengeste', M.maksStigningFraRadius(k3mal, 14.5, 0.05, -1), 0.05, 1e-9);
  sjekk('stigning ved R=15', M.maksStigningFraRadius(k3mal, 15, 0.05, -1), 0.07, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n6a. Avkortet beregningsbredde');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  /* Sidebratt li pa 50 %. Da gar bade skjæringen oppover og fyllingen
     nedover langt ut fra veien - fyllingsfoten havner 9,5 m ut, som er
     nettopp tilfellet beregningsbredden er laget for. */
  const li = { z: (x, y) => 100 + 0.5 * y };
  const grunnmal = Object.assign({}, KLASSISK, { ekstraBredde: null, maksSokebredde: 60 });
  const fjell = new M.Fjellmodell({ standarddybde: 5 });
  const profil = new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]);

  const utenGrense = M.beregnMasser({
    linje, profil, terreng: li, mal: grunnmal, fjell, profilAvstand: 25, bakkefaktor: 1
  });
  const medGrense = M.beregnMasser({
    linje, profil, terreng: li, mal: Object.assign({}, grunnmal, { beregningsbredde: 5 }),
    fjell, profilAvstand: 25, bakkefaktor: 1
  });

  const utslag = pr => Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;
  paastand('uten grense gar skraningen langt ut', utslag(utenGrense.profiler[1]) > 5);
  paastand('med grense stopper profilet ved grensen',
    utslag(medGrense.profiler[1]) <= 5.0001);
  paastand('avkortet volum er mindre', medGrense.sum.skjaering < utenGrense.sum.skjaering);
  paastand('avkortede profiler blir merket',
    medGrense.antallAvkortet > 0 && medGrense.merknader.some(m => m.type === 'avkortet'));
  paastand('uten grense merkes ingenting som avkortet', utenGrense.antallAvkortet === 0);

  // Grensen skal ikke røre profiler som uansett er innenfor
  const flatt = { z: () => 100 };
  const smalt = M.beregnMasser({
    linje, profil, terreng: flatt, mal: Object.assign({}, grunnmal, { beregningsbredde: 20 }),
    fjell, profilAvstand: 25, bakkefaktor: 1
  });
  const fritt = M.beregnMasser({
    linje, profil, terreng: flatt, mal: grunnmal, fjell, profilAvstand: 25, bakkefaktor: 1
  });
  sjekk('romslig grense endrer ingenting', smalt.sum.skjaering, fritt.sum.skjaering, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n6b. Eget tverrfall per profil');
{
  const mal = Object.assign({}, KLASSISK, { ekstraBredde: null });
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const flatt = { z: () => 100 };

  sjekk('standard takfall venstre', M.tverrfallVed(mal, [], 50).venstre, 0.05, 1e-9);
  const ensidig = Object.assign({}, mal, { tverrfallType: 'ensidig', tverrfallRetning: 1 });
  sjekk('ensidig fall venstre', M.tverrfallVed(ensidig, [], 50).venstre, -0.05, 1e-9);
  sjekk('ensidig fall høyre', M.tverrfallVed(ensidig, [], 50).hoyre, 0.05, 1e-9);

  const eget = [{ s: 0, venstre: 0.02, hoyre: 0.08 }, { s: 100, venstre: 0.06, hoyre: 0.04 }];
  sjekk('eget fall interpoleres', M.tverrfallVed(mal, eget, 50).venstre, 0.04, 1e-9);
  sjekk('eget fall interpoleres, høyre', M.tverrfallVed(mal, eget, 50).hoyre, 0.06, 1e-9);

  // Vegkanthøydene skal bli akkurat som fallet tilsier
  const res = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]),
    terreng: flatt, mal, fjell: new M.Fjellmodell({ standarddybde: 5 }),
    tverrfallOverstyring: eget, profilAvstand: 25, bakkefaktor: 1
  });
  const midt = res.profiler.find(p => Math.abs(p.s - 50) < 1e-6);
  const hb = midt.halvbredde;
  const vegVenstre = midt.geometri.veg[0];
  sjekk('venstre vegkant følger eget fall', vegVenstre[1], 100 - 0.04 * hb, 0.01);
  const vegHoyre = midt.geometri.veg[midt.geometri.veg.length - 1];
  sjekk('høyre vegkant følger eget fall', vegHoyre[1], 100 - 0.06 * hb, 0.01);
}

/* ------------------------------------------------------------------ */
console.log('\n6d. Kurvereglene fra normalen');
{
  const mal = Object.assign({}, KLASSISK, { utvidelseOvergang: 15, ekstraBredde: null });

  /* Normalen: "Stigningen flates ut før knappe kurver", og
     stigningsovergangen jevnes ut over en avstand fra tangentpunktene.
     Kravet i kurven ma derfor gjelde ogsa pa innkjøringen. */
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 10 }, { x: 200, y: 200, r: 0 }]);
  const kurve = linje.kurver[0];
  sjekk('radius inne i kurven', linje.radiusVed(kurve.sBC + 1), 10, 1e-6);
  paastand('rettstrekk rett før kurven har uendelig radius', !isFinite(linje.radiusVed(kurve.sBC - 5)));
  sjekk('men effektiv radius tar med utflatingen', M.effektivRadius(linje, mal, kurve.sBC - 5), 10, 1e-6);
  sjekk('effektiv radius etter kurven ogsa', M.effektivRadius(linje, mal, kurve.sEC + 5), 10, 1e-6);
  paastand('langt unna kurven gjelder rettstrekket',
    !isFinite(M.effektivRadius(linje, mal, kurve.sBC - 40)));

  const utenUtflating = Object.assign({}, mal, { utflatingForKurve: 0 });
  paastand('uten utflating gjelder kravet bare i selve kurven',
    !isFinite(M.effektivRadius(linje, utenUtflating, kurve.sBC - 5)));

  /* Normalen: kurver med radius under 60 m skal ha ensidig tverrfall
     (dosering) inn mot kurvesenteret, maks 5 %. */
  const rett = M.tverrfallVed(mal, [], 50, 0);
  sjekk('rettstrekk har takfall venstre', rett.venstre, mal.tverrfall, 1e-9);
  sjekk('rettstrekk har takfall høyre', rett.hoyre, mal.tverrfall, 1e-9);

  const venstresving = M.tverrfallVed(mal, [], 50, 1 / 20);      // R = 20, venstre
  paastand('venstresving doseres mot venstre', venstresving.venstre > 0 && venstresving.hoyre < 0);
  sjekk('doseringen er ikke over 5 %', Math.abs(venstresving.venstre), 0.05, 1e-9);
  const hoyresving = M.tverrfallVed(mal, [], 50, -1 / 20);
  paastand('høyresving doseres mot høyre', hoyresving.hoyre > 0 && hoyresving.venstre < 0);

  const slakKurve = M.tverrfallVed(mal, [], 50, 1 / 200);        // R = 200
  sjekk('slak kurve beholder takfall', slakKurve.venstre, mal.tverrfall, 1e-9);

  paastand('egne verdier overstyrer doseringen',
    M.tverrfallVed(mal, [{ s: 50, venstre: 0.02, hoyre: 0.03 }], 50, 1 / 20).venstre === 0.02);

  /* Vertikalkurvene har egne minstekrav, ulikt i lavbrekk og høybrekk.
     R = L / A der A er stigningsbruddet som desimaltall. */
  const flatt = { z: () => 100 };
  const rettLinje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 300, y: 0, r: 0 }]);
  const fjell = new M.Fjellmodell({ standarddybde: 5 });
  // K = 0,2 gir A = 10 % over L = 2 m, altsa radius 20 m - langt under kravet
  const skarp = M.beregnMasser({
    linje: rettLinje,
    profil: new Vertikalprofil([{ s: 0, z: 100, k: 0.2 }, { s: 150, z: 107.5, k: 0.2 }, { s: 300, z: 100, k: 0.2 }]),
    terreng: flatt, mal, fjell, profilAvstand: 25, bakkefaktor: 1
  });
  paastand('for skarp vertikalkurve blir merket',
    skarp.merknader.some(m => m.type === 'vertikalkurve'));
  paastand('merknaden sier hvilken K som trengs',
    skarp.merknader.some(m => m.type === 'vertikalkurve' && /øk K til/.test(m.tekst)));

  const slak = M.beregnMasser({
    linje: rettLinje,
    profil: new Vertikalprofil([{ s: 0, z: 100, k: 3 }, { s: 150, z: 107.5, k: 3 }, { s: 300, z: 100, k: 3 }]),
    terreng: flatt, mal, fjell, profilAvstand: 25, bakkefaktor: 1
  });
  paastand('slak vertikalkurve gir ingen merknad',
    !slak.merknader.some(m => m.type === 'vertikalkurve'));
}

/* ------------------------------------------------------------------ */
console.log('\n6e. Snuplass og møteplass – vegen blir bredere på et stykke');
{
  /* EN SNUPLASS ER IKKE ET EGET ANLEGG. Det er vegen som er bredere på et
     stykke, så den er en UTVIDELSE akkurat som den kurver får. Da følger alt
     annet med av seg selv: masser, tverrsnitt, 3D, rapport og eksport leser
     allerede `utvidelse`, og ingen av dem trenger å vite at det står en
     snuplass der.

     Punktet brukeren setter er MIDTEN. Ligger det for nær enden, flyttes midten
     inn så hele plassen får plass - ellers ville en snuplass satt ytterst på
     vegen blitt halvert i stillhet, og det er nettopp der man setter dem. */
  const linjeP = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 200, y: 0, r: 0 }]);
  const profilP = new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 200, z: 100, k: 0 }]);
  const obP = M.StandardMal.slitelagTykkelse + M.StandardMal.baerelagTykkelse;
  const kjorP = (plasser, overgang, m2) => M.beregnMasser({
    linje: linjeP, profil: profilP, terreng: { z: () => 100 },
    mal: Object.assign({}, KLASSISK, { overbygningHelning: 0,
      utvidelseOvergang: overgang }, m2 || {}),
    fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
    profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, plasser
  });
  const lagP = r => r.sum.baerelag + r.sum.slitelag;

  /* UTEN AVTRAPPING ER PLASSEN ET REKTANGEL, og overbygningen er lengden ganger
     bredden ganger tykkelsen. Ikke noe mer. */
  const utenP = lagP(kjorP(null, 0));
  for (const [s, L, B, hva] of [
    [100, 20, 4, 'midt på vegen'],
    [97, 13, 3, 'med kanter som IKKE lander på rutenettet'],
    [7, 20, 4, 'så nær starten at midten må klemmes inn'],
    [195, 20, 4, 'og så nær slutten']
  ]) {
    sjekk(`snuplass ${hva}: ${L} × ${B} m`,
      lagP(kjorP([{ s, lengde: L, bredde: B, innkjoring: 0, form: 'rektangel' }], 0)) - utenP, L * B * obP, 0.02);
  }

  /* KANTENE MÅ VÆRE EGNE STASJONER.
     Stasjonene er et jevnt rutenett – hver femte meter – og en plass på femten
     meter har kanter som nesten aldri lander på det. Volumet regnes med
     gjennomsnittlig endeareal, så en kant mellom to profiler rampes ut over
     hele mellomrommet. Målt før kantstasjonene: 70,0 m³ mot 56,0 håndregnet,
     25 % for mye, og plassen stakk 5 m ut i hver ende av der den var satt. */
  {
    const r = kjorP([{ s: 100, lengde: 20, bredde: 4, innkjoring: 0, form: 'rektangel' }], 0);
    const med = r.profiler.filter(p => p.utvidelse > 1e-9).map(p => p.s);
    sjekk('plassen begynner nøyaktig der den er satt', Math.min(...med), 90, 1e-6);
    sjekk('  og slutter nøyaktig der den slutter', Math.max(...med), 110, 1e-6);
    paastand('  og bredden er den bestilte, ikke en rampe',
      med.every(s => Math.abs(r.profiler.find(p => p.s === s).utvidelse - 4) < 1e-9),
      `${med.length} profiler`);
  }

  /* MED AVTRAPPING KOMMER RAMPENE I TILLEGG, og de er trekanter. En veg kan
     ikke ha et sprang i vegkanten, så plassen trappes inn og ut med vegens egen
     `utvidelseOvergang` – samme mekanisme som kurveutvidelsen bruker. */
  {
    const d = lagP(kjorP([{ s: 100, lengde: 20, bredde: 4, form: 'rektangel' }], 15)) - lagP(kjorP(null, 15));
    sjekk('med avtrapping: rektangelet pluss to trekantramper',
      d, (20 * 4 + 2 * (15 * 4 / 2)) * obP, 0.05);
  }

  /* INNKJØRINGEN KAN IKKE VÆRE EN VEGG.
     Kurveutvidelsen trappes av over `utvidelseOvergang` – en FAST lengde. Det
     går bra for en kurve, som utvider vegen med en meter eller to. En snuplass
     tar vegen fra 4,5 til 10 m, og da blir den faste lengden en kant: målt med
     overgang 15 ble flaren 1:5,5 per side, og med veiklassene som setter den
     til 5 ble den 1:1,8. Man kjører ikke inn på en 1:1,8.
     Derfor har hver plass sin egen innkjøring: minst vegens overgang, og minst
     1:5 for den halve bredden hver side skal ut. */
  {
    const flare = r => {
      let verst = 0;
      const p = r.profiler;
      for (let i = 1; i < p.length; i++) {
        const dh = Math.abs(p[i].halvbredde - p[i - 1].halvbredde);
        const ds = p[i].s - p[i - 1].s;
        if (ds > 1e-6 && dh / ds > verst) verst = dh / ds;
      }
      return verst;
    };
    for (const [ov, B] of [[15, 5.5], [5, 5.5], [5, 10], [0, 8]]) {
      const f = flare(kjorP([{ s: 100, lengde: 20, bredde: B, form: 'rektangel' }], ov));
      paastand(`overgang ${ov} m, plass ${B} m: aldri brattere enn 1:5 per side`,
        f <= 1 / 5 + 1e-9, `1:${(1 / f).toFixed(1)}`);
    }
    /* Og en SMAL utvidelse skal fortsatt bruke vegens egen overgang – den er
       slakkere enn 1:5, og da er det den som gjelder. */
    const smalF = flare(kjorP([{ s: 100, lengde: 20, bredde: 2, form: 'rektangel' }], 15));
    sjekk('en smal plass bruker vegens egen overgang', 1 / smalF, 15, 0.2);

    /* Men den som VIL ha skarp kant, skal få den. `innkjoring: 0` er et valg,
       ikke en mangel – derfor skiller koden mellom «ikke oppgitt» og «null». */
    const skarp = flare(kjorP([{ s: 100, lengde: 20, bredde: 4, innkjoring: 0, form: 'rektangel' }], 15));
    paastand('men innkjoring 0 gir skarp kant for den som ber om det',
      skarp > 1, `1:${(1 / skarp).toFixed(2)}`);
  }

  /* TO GRUNNER TIL Å VÆRE BRED ER IKKE DOBBELT SÅ BRED VEG.
     Ligger snuplassen i en sving, skal bredden være den BREDESTE av de to, ikke
     summen. Legges de oppå hverandre, får en snuplass i en krapp kurve en
     vegbredde ingen har bedt om. */
  {
    const sving = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 25 },
      { x: 200, y: 60, r: 0 }]);
    const kjorS = plasser => M.beregnMasser({
      linje: sving, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 220, z: 100, k: 0 }]),
      terreng: { z: () => 100 }, mal: Object.assign({}, KLASSISK, { overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.1, plasser
    });
    const iSvingen = kjorS(null).profiler.reduce((b, p) => Math.max(b, p.utvidelse), 0);
    paastand('kurven gir utvidelse i utgangspunktet', iSvingen > 0.2, `${iSvingen.toFixed(2)} m`);
    const smal = kjorS([{ s: 110, lengde: 20, bredde: iSvingen / 2, form: 'rektangel' }]);
    const bred = kjorS([{ s: 110, lengde: 20, bredde: iSvingen * 3, form: 'rektangel' }]);
    const maks = r => r.profiler.reduce((b, p) => Math.max(b, p.utvidelse), 0);
    sjekk('en plass SMALERE enn kurvens utvidelse endrer ingenting',
      maks(smal), iSvingen, 1e-9);
    sjekk('  og en bredere plass gjelder, men bare sin egen bredde',
      maks(bred), iSvingen * 3, 1e-9);
  }

  /* SIDEN ER HELE POENGET.
     En snuplass legges ut til den siden det ER plass på. Var bredden alltid
     symmetrisk om senterlinja, ville halve plassen havnet på feil side – og i
     sidehelling er det ikke bare et bilde, det er kubikken. */
  {
    const bredder = (side) => {
      const r = kjorP([{ s: 100, lengde: 20, bredde: 6, side, innkjoring: 0 }], 0);
      const p = r.profiler.find(q => q.s === 100);
      return { v: p.halvbreddeVenstre, h: p.halvbreddeHoyre, sum: p.utvidelse };
    };
    const hb0 = M.StandardMal.vegbredde / 2;
    const midt = bredder('sentrum'), v = bredder('venstre'), h = bredder('hoyre');
    sjekk('sentrum deler utvidelsen likt', midt.v - midt.h, 0, 1e-9);
    sjekk('  og legger halvparten på hver side', midt.v, hb0 + 3, 1e-9);
    sjekk('venstre legger ALT til venstre', v.v, hb0 + 6, 1e-9);
    sjekk('  og rører ikke høyre side', v.h, hb0, 1e-9);
    sjekk('høyre legger ALT til høyre', h.h, hb0 + 6, 1e-9);
    sjekk('  og rører ikke venstre side', h.v, hb0, 1e-9);
    for (const [navn, b] of [['sentrum', midt], ['venstre', v], ['høyre', h]]) {
      sjekk(`  ${navn}: samlet bredde er den samme uansett side`, b.sum, 6, 1e-9);
    }

    /* HVER SIDE TAR DET BREDESTE KRAVET DER – IKKE SUMMEN.
       Denne prøven kjørte bare på flat mark, der kurveutvidelsen og normalens
       tillegg begge er null. Da er alle tre sidene like brede, og hullet var
       usynlig: den ensidige grenen LA plassen oppå den symmetriske utvidelsen i
       stedet for å konkurrere med den. Målt med kurveutvidelse 1 m og en 6 m
       plass: 10,50 m samlet midt på, 11,50 m til høyre – samme plass, to
       vegbredder. Prøven var skrevet for nettopp denne invarianten og kunne
       ikke feile på den.

       Riktig regel: `hb(side) = vegbredde/2 + max(sym/2, plass på den siden)`.
       Sidene kan derfor godt bli ULIKT brede – den siden uten snuplass trenger
       fortsatt kurvens utvidelse – men ingen av dem er en sum. */
    {
      const kant = (u) => {
        const p = M.beregnTverrprofil({
          linje: linjeP, terreng: { z: () => 100 },
          mal: Object.assign({}, KLASSISK, { overbygningHelning: 0 }),
          fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
          s: 100, vegnivaa: 100, utvidelse: u, integrasjonssteg: 0.05
        });
        return { v: p.halvbreddeVenstre, h: p.halvbreddeHoyre };
      };
      const hb0 = M.StandardMal.vegbredde / 2;
      const mKurve = kant({ sym: 1, v: 0, h: 6 });
      sjekk('plassen konkurrerer med kurven, den legges ikke oppå',
        mKurve.h, hb0 + 6, 1e-9);
      sjekk('  og den andre siden beholder kurvens egen utvidelse',
        mKurve.v, hb0 + 0.5, 1e-9);
      /* En plass SMALERE enn kurven skal ikke gjøre noe i det hele tatt. */
      sjekk('en ensidig plass smalere enn kurven endrer ingenting',
        kant({ sym: 4, v: 0, h: 1 }).h, hb0 + 2, 1e-9);

      /* NORMALENS TILLEGG ER ET MINSTEKRAV OG LEGGES PÅ, uansett hvorfor vegen
         ellers er bred. Her ble det lagt i samme kanal som kurven og dermed
         spist opp av en snuplass: målt 5,50 m plassbidrag med og uten at
         normalen krevde 0,5 m ekstra. */
      const medTil = kant({ sym: 0, v: 0, h: 6, tillegg: 0.5 });
      sjekk('normalens tillegg legges PÅ plassen', medTil.h, hb0 + 6 + 0.25, 1e-9);
      sjekk('  også på siden uten plass', medTil.v, hb0 + 0.25, 1e-9);
      sjekk('  og en plass midt på får det samme',
        kant({ sym: 6, v: 0, h: 0, tillegg: 0.5 }).h, hb0 + 3 + 0.25, 1e-9);
    }

    /* INNKJØRINGEN MÅLES PER SIDE, ikke på halve bredden.
       En ensidig plass legger HELE bredden ut til én side, så `bredde / 2` ga
       dobbelt så bratt flare som lovet – målt 1:2,5 der koden sier minst 1:5. */
    {
      const flare2 = (side) => {
        const r = kjorP([{ s: 100, lengde: 20, bredde: 6, side, form: 'rektangel' }], 0);
        let verst = 0;
        const p = r.profiler;
        for (let i = 1; i < p.length; i++) {
          const dh = Math.max(Math.abs(p[i].halvbreddeVenstre - p[i - 1].halvbreddeVenstre),
            Math.abs(p[i].halvbreddeHoyre - p[i - 1].halvbreddeHoyre));
          const ds = p[i].s - p[i - 1].s;
          if (ds > 1e-6 && dh / ds > verst) verst = dh / ds;
        }
        return verst;
      };
      for (const side of ['sentrum', 'venstre', 'hoyre']) {
        const f = flare2(side);
        paastand(`innkjøringen er minst 1:5 også for side «${side}»`,
          f <= 1 / 5 + 1e-9, `1:${(1 / f).toFixed(2)}`);
      }
    }

    /* PÅ FLAT MARK GIR DE SAMME KUBIKK – det er bare plasseringen som skiller.
       Gjør de ikke det, er noe galt med fordelingen og ikke med terrenget. */
    const lag3 = side => lagP(kjorP([{ s: 100, lengde: 20, bredde: 6, side, innkjoring: 0 }], 0));
    sjekk('på flat mark koster alle tre det samme', lag3('venstre'), lag3('sentrum'), 0.01);
    sjekk('  også høyre', lag3('hoyre'), lag3('sentrum'), 0.01);

    /* I SIDEHELLING SKILLER DE SEG, og det er hele grunnen til å velge.
       Terrenget faller mot venstre her (høyre normal peker mot synkende y), så
       en plass ut til høyre går OPPOVER og koster skjæring, mens en ut til
       venstre går nedover og koster fylling. Målt: +609 m³ skjæring mot høyre,
       +164 m³ fylling mot venstre – fire ganger forskjell i det som dominerer. */
    const skraatt = { z: (x, y) => 100 - y * 0.3 };
    const iHelling = plasser => M.beregnMasser({
      linje: linjeP, profil: profilP, terreng: skraatt,
      mal: Object.assign({}, KLASSISK, { overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, plasser
    }).sum;
    const u0 = iHelling(null);
    const pV = iHelling([{ s: 100, lengde: 20, bredde: 6, side: 'venstre', innkjoring: 0, form: 'rektangel' }]);
    const pH = iHelling([{ s: 100, lengde: 20, bredde: 6, side: 'hoyre', innkjoring: 0, form: 'rektangel' }]);
    paastand('i sidehelling koster oppsiden skjæring',
      pH.skjaering - u0.skjaering > 100,
      `+${(pH.skjaering - u0.skjaering).toFixed(0)} m³`);
    paastand('  og nedsiden koster fylling i stedet',
      pV.fylling - u0.fylling > 100 && pV.skjaering - u0.skjaering < 10,
      `fylling +${(pV.fylling - u0.fylling).toFixed(0)}, `
      + `skjæring +${(pV.skjaering - u0.skjaering).toFixed(0)} m³`);
    paastand('  så de to sidene er IKKE det samme regnestykket',
      Math.abs((pH.skjaering + pH.fylling) - (pV.skjaering + pV.fylling)) > 100,
      `${(pH.skjaering + pH.fylling).toFixed(0)} mot ${(pV.skjaering + pV.fylling).toFixed(0)} m³`);

    /* TRAUET FØLGER DEN BREDE SIDEN, DET SPEILER DEN IKKE.
       Trauet ligger under vegkroppen. Speilet det den brede siden, ville det
       gravd like langt ut på siden der det ikke bygges noe. */
    const medTrau = side => M.beregnMasser({
      linje: linjeP, profil: profilP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK, { utskifting: true, maksUtskifting: 4,
        overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 1.5, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05,
      plasser: [{ s: 100, lengde: 20, bredde: 6, side, innkjoring: 0 }]
    });
    /* Målt i geometrien, ikke i et tall som kunne vært riktig ved et uhell:
       hvor langt ut på HVER side trauet faktisk er dypere enn vanlig rensk. */
    const trauUt = (side, teikn) => {
      const g = medTrau(side).geometriFor(100).geometri;
      let ytterst = 0;
      for (const [t, z] of g.rensk) {
        if (teikn * t <= 0) continue;
        const terr = g.terreng.reduce((b, q) =>
          Math.abs(q[0] - t) < Math.abs(b[0] - t) ? q : b, g.terreng[0])[1];
        if (terr - z > KLASSISK.renskDybde + 0.01 && Math.abs(t) > ytterst) ytterst = Math.abs(t);
      }
      return ytterst;
    };
    const midtV = trauUt('sentrum', -1), midtH = trauUt('sentrum', 1);
    sjekk('sentrum: trauet er like langt ut til begge sider', midtV, midtH, 0.05);
    sjekk('høyre: trauet følger den brede siden', trauUt('hoyre', 1), midtH + 3, 0.05);
    sjekk('  og speiler den IKKE til den tomme siden', trauUt('hoyre', -1), midtV - 3, 0.05);
    /* Og volumet er det samme: like stor vegkropp, bare annerledes plassert.
       Speilet trauet den brede siden, ville det gravd seks meter ekstra på en
       side det ikke bygges noe, i full trauhøyde. */
    sjekk('  og utskiftingen koster det samme på flat mark',
      medTrau('hoyre').sum.utskifting, medTrau('sentrum').sum.utskifting, 0.5);
  }

  /* EN SNUPLASS ER OVAL, IKKE FIRKANTET.
     Vegen buler ut, er bredest på midten, og kommer inn igjen. Arealet under en
     halv ellipse er π/4 av rektangelet – 79 % – så formen er ikke pynt, den er
     kubikk. En møteplass er derimot rett, med innkjøring i hver ende, og begge
     må finnes. */
  {
    const utenO = lagP(kjorP(null, 0));
    const rekt = lagP(kjorP([{ s: 100, lengde: 20, bredde: 5.5,
      form: 'rektangel', innkjoring: 0 }], 0)) - utenO;
    const oval = lagP(kjorP([{ s: 100, lengde: 20, bredde: 5.5, form: 'oval' }], 0)) - utenO;
    sjekk('rektangelet er lengden ganger bredden', rekt, 20 * 5.5 * obP, 0.02);
    /* Toleransen er den målte diskretiseringsfeilen, ikke en slark: trapesregelen
       konvergerer sakte mot en ellipse fordi den står loddrett i endene. Med de
       32 delintervallene koden bruker, ligger den 0,15 % under fasiten. */
    sjekk('og ovalen er π/4 av det', oval, Math.PI / 4 * 20 * 5.5 * obP, 0.12);
    paastand('  altså merkbart mindre enn rektangelet',
      oval < rekt * 0.82 && oval > rekt * 0.75,
      `${(100 * oval / rekt).toFixed(1)} % av rektangelet`);

    /* GROV MODUS SKAL IKKE ENDRE DET ENDELIGE SVARET.
       Optimaliseringen kjører med `raskt: true` og får ovalen med åtte
       delintervall i stedet for 32 – den sammenligner alternativer mot
       hverandre, og da holder det at feilen er den samme i alle. Men den
       ENDELIGE beregningen må være uberørt: her sammenlignes de to, og de skal
       ikke være like (grov er grovere), mens full oppløsning skal stå stille. */
    {
      const grov = M.beregnMasser({
        linje: linjeP, profil: profilP, terreng: { z: () => 100 },
        mal: Object.assign({}, KLASSISK, { overbygningHelning: 0, utvidelseOvergang: 0 }),
        fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
        profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, raskt: true,
        plasser: [{ s: 100, lengde: 20, bredde: 5.5, form: 'oval' }]
      });
      paastand('grov modus gir færre profiler enn full',
        grov.profiler.length < kjorP([{ s: 100, lengde: 20, bredde: 5.5, form: 'oval' }], 0)
          .profiler.length, `${grov.profiler.length} profiler`);
      sjekk('men full oppløsning står stille', oval,
        Math.PI / 4 * 20 * 5.5 * obP, 0.12);
    }

    /* FORMEN ER STANDARD. Knappen heter «Snuplass», og en snuplass er oval –
       så en plass uten oppgitt form skal være det. */
    const utenForm = lagP(kjorP([{ s: 100, lengde: 20, bredde: 5.5 }], 0)) - utenO;
    sjekk('en plass uten oppgitt form er oval', utenForm, oval, 1e-9);

    /* OVALEN TRAPPER SEG SELV – den skal ikke ha innkjøring i tillegg, ellers
       blir den lengre enn den er satt til. */
    {
      const r = kjorP([{ s: 100, lengde: 20, bredde: 5.5, form: 'oval' }], 15);
      const med = r.profiler.filter(q => q.utvidelse > 1e-6).map(q => q.s);
      paastand('ovalen holder seg innenfor sin egen lengde',
        Math.min(...med) >= 90 - 1e-6 && Math.max(...med) <= 110 + 1e-6,
        `${Math.min(...med)} til ${Math.max(...med)}`);
      const midt = r.profiler.find(q => Math.abs(q.s - 100) < 1e-6);
      sjekk('  og er bredest nøyaktig på midten', midt.utvidelse, 5.5, 0.01);
    }

    /* OG DEN KAN VÆRE ENSIDIG, som alt annet. En oval snuplass ut til én side
       er nettopp den figuren man kjører rundt på. */
    {
      const h = kjorP([{ s: 100, lengde: 20, bredde: 6, form: 'oval', side: 'hoyre' }], 0)
        .profiler.find(q => Math.abs(q.s - 100) < 1e-6);
      sjekk('en oval kan legges ut til én side', h.halvbreddeHoyre,
        M.StandardMal.vegbredde / 2 + 6, 0.01);
      sjekk('  uten å røre den andre', h.halvbreddeVenstre,
        M.StandardMal.vegbredde / 2, 0.01);
    }
  }

  /* TRAUET MELDES PER SIDE, IKKE SOM ETT MAKSTALL.
     `utskiftingHalvbredde` var ett tall – maksimum av de to sidene – og
     tegningen malte den bredden på BEGGE. Målt med en 6 m snuplass til høyre:
     6,05 m vanlig avdekking ble malt som trau på venstre side. */
  {
    const pr = M.beregnTverrprofil({
      linje: linjeP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK, { utskifting: true, maksUtskifting: 4,
        overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 1.5, punkter: [] }),
      s: 100, vegnivaa: 100, utvidelse: { sym: 0, v: 0, h: 6 }, integrasjonssteg: 0.05
    });
    paastand('trauet er bredere på snuplassiden',
      pr.utskiftingHalvbreddeHoyre > pr.utskiftingHalvbreddeVenstre + 5.9,
      `${pr.utskiftingHalvbreddeVenstre.toFixed(2)} mot ${pr.utskiftingHalvbreddeHoyre.toFixed(2)}`);
    sjekk('  og forskjellen er nøyaktig plassens bredde',
      pr.utskiftingHalvbreddeHoyre - pr.utskiftingHalvbreddeVenstre, 6, 0.01);
    sjekk('  fellestallet er det ytterste av de to',
      pr.utskiftingHalvbredde, pr.utskiftingHalvbreddeHoyre, 1e-9);
    /* «DET YTTERSTE AV DE TO» MÅ PRØVES BEGGE VEIER.
       Over ligger plassen ALLTID til høyre – `{sym: 0, v: 0, h: 6}` – og i hele
       fila finnes det ikke ett profil der venstre er bredest. Da er
       `Math.max(venstre, høyre)` og `høyre` det samme tallet uansett, og
       påstanden ville stått grønn med maks byttet ut med «alltid høyre».
       Samme snuplass speilvendt gir den andre halvdelen av regelen. */
    const prV = M.beregnTverrprofil({
      linje: linjeP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK, { utskifting: true, maksUtskifting: 4,
        overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 1.5, punkter: [] }),
      s: 100, vegnivaa: 100, utvidelse: { sym: 0, v: 6, h: 0 }, integrasjonssteg: 0.05
    });
    paastand('  speilvendt er det venstre som er bredest',
      prV.utskiftingHalvbreddeVenstre > prV.utskiftingHalvbreddeHoyre + 5.9,
      `${prV.utskiftingHalvbreddeVenstre.toFixed(2)} mot ${prV.utskiftingHalvbreddeHoyre.toFixed(2)}`);
    sjekk('    og da er fellestallet DEN siden',
      prV.utskiftingHalvbredde, prV.utskiftingHalvbreddeVenstre, 1e-9);
  }

  /* MAKSUTSLAG MÅLES FRA SIDENS EGEN VEGKANT.
     Her ble gjennomsnittet trukket fra en ensidig skråningsfot, som gir både
     falsk alarm og tapt alarm. Med en plass ut til høyre står venstre vegkant
     der den alltid har stått, og utslaget der er uendret. */
  {
    /* OPPSETTET MÅ FAKTISK KUNNE GI EN UTSLAGSALARM.
       Her sto en sidehelling på 1:20 mot `maksUtslag: 6`. Målt i det oppsettet:
       NULL utslagsmerknader, både med og uten snuplass – og påstanden var
       `u1 <= u0 + 6`, altså 0 <= 6. Den kunne ikke bli rød uansett hva koden
       gjorde med sidene.

       Nå er hellingen 1:4 og grensen 3 m, og da fyrer merknaden. Og det som
       måles er VERDIEN på merknaden, ikke antallet: en snuplass til høyre skal
       ikke gjøre utslaget på venstre side større. Verdien står på merknaden,
       satt der den ble målt (masser.js:2107). */
    const utslagsverdi = (plasser) => {
      const r = M.beregnMasser({
        linje: linjeP, profil: profilP, terreng: { z: (x, y) => 100 + 0.25 * y },
        mal: Object.assign({}, KLASSISK, { overbygningHelning: 0, maksUtslag: 3 }),
        fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
        profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, plasser
      });
      const m = (r.merknader || []).filter(q => q.type === 'utslag');
      return { antall: m.length, verst: m.reduce((v, q) => Math.max(v, q.verdi || 0), 0) };
    };
    const u0 = utslagsverdi(null);
    const u1 = utslagsverdi([{ s: 100, lengde: 20, bredde: 6, side: 'hoyre',
      form: 'rektangel', innkjoring: 5 }]);
    paastand('oppsettet gir faktisk en utslagsalarm å måle på',
      u0.antall > 0 && u0.verst > 0,
      `${u0.antall} merknader, verst ${u0.verst.toFixed(2)} m`);
    paastand('en plass til høyre gir ikke større utslag enn før',
      u1.verst <= u0.verst + 1e-6,
      `uten plass ${u0.verst.toFixed(2)} m, med plass ${u1.verst.toFixed(2)} m`);
  }

  /* HELNINGSFELTENE MÅ VALIDERES.
     `overbygningHelning: '1,5'` – et komma i stedet for punktum, som er lett å
     skrive – ga skulder NaN, fylling 0,00 m³ og bærelag NaN, uten et ord.
     Nå rettes verdien og det sies fra, slik alle andre malfelt gjør. */
  {
    const medHelning = (v) => M.beregnMasser({
      linje: linjeP, profil: new Vertikalprofil([{ s: 0, z: 102, k: 0 }, { s: 200, z: 102, k: 0 }]),
      terreng: { z: () => 100 }, mal: Object.assign({}, KLASSISK, { overbygningHelning: v }),
      fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 10, bakkefaktor: 1, integrasjonssteg: 0.1
    });
    const god = medHelning(1.5);
    for (const [navn, v] of [['komma-streng', '1,5'], ['NaN', NaN]]) {
      const r = medHelning(v);
      paastand(`${navn} gir tall, ikke NaN`,
        isFinite(r.sum.fylling) && isFinite(r.sum.baerelag) && r.sum.baerelag > 0,
        `fylling ${r.sum.fylling.toFixed(0)}, bærelag ${r.sum.baerelag.toFixed(0)}`);
      paastand(`  og det sies fra om ${navn}`,
        (r.merknader || []).some(m => m.type === 'inngang'));
      sjekk('  og den faller tilbake på standardverdien',
        r.sum.baerelag, god.sum.baerelag, 0.01);
    }
    /* `venta` STO BARE I NAVNET.
       Påstanden krevde `isFinite(baerelag)` og at det fantes en
       inngangsmerknad – grensene 0 og 5 ble aldri prøvd. Målt: med klemgrensa
       i MALGRENSER flyttet fra [0, 5] til [0, 50] sto selvtesten grønn, og en
       helning på 99 ville sluppet gjennom som 50.

       Nå måles resultatet mot en kjøring med den VENTEDE verdien: klemmes 99
       til 5, skal svaret være det samme som om man hadde skrevet 5. Det er
       selve grensen, ikke at det kom et tall. */
    for (const [navn, v, venta] of [['for liten', -3, 0], ['for stor', 99, 5]]) {
      const r = medHelning(v);
      const fasit = medHelning(venta);
      paastand(`${navn} verdi meldes`,
        (r.merknader || []).some(m => m.type === 'inngang'));
      sjekk(`  og klemmes til ${venta} – samme svar som om man skrev ${venta}`,
        r.sum.baerelag, fasit.sum.baerelag, 0.01);
      /* Og grensen må ligge et annet sted enn verdien, ellers sier likheten
         ingenting. En helning på 99 og en på 5 skal gi ULIKE svar. */
      paastand(`  og ${venta} er noe annet enn ${v} – ellers prøver likheten intet`,
        Math.abs(fasit.sum.baerelag - god.sum.baerelag) > 1e-9 || venta === 5,
        `klemt ${fasit.sum.baerelag.toFixed(2)}, standard ${god.sum.baerelag.toFixed(2)}`);
    }
  }

  /* EN PLASS SOM ER SKREVET FEIL SKAL SIES FRA OM, IKKE SPERRES.
     Bredden gikk rett inn i vegbredden uten å passere noen grense. En tastefeil
     – 55 i stedet for 5,5, ett tegn – ga en veg på 59,5 m uten et ord. Ved
     500 m kom det merknader fra geometrien, men ved 50 m ingen.
     Det sperres ikke: en stor plass er en gyldig ting å ville ha, og hvor stor
     den kan være vet ikke programmet. */
  {
    const medBredde = (b) => M.beregnMasser({
      linje: linjeP, profil: profilP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK), fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 10, bakkefaktor: 1, integrasjonssteg: 0.2,
      plasser: [{ s: 100, lengde: 20, bredde: b, navn: 'Snuplass',
        form: 'rektangel', innkjoring: 0 }]
    });
    const meldt = (b) => (medBredde(b).merknader || [])
      .some(m => m.type === 'inngang' && /bred/.test(m.tekst));
    paastand('en snuplass på 5,5 m meldes ikke', !meldt(5.5));
    paastand('  heller ikke en stor plass på 12 m', !meldt(12));
    paastand('men en tastefeil på 55 m blir meldt', meldt(55));
    /* Og den skal fortsatt REGNES, ikke kastes – tallet er brukerens valg. */
    const stor = medBredde(55).profiler.find(p => Math.abs(p.s - 100) < 1e-6);
    sjekk('  og plassen regnes likevel med',
      stor.halvbreddeVenstre + stor.halvbreddeHoyre, KLASSISK.vegbredde + 55, 0.01);
  }

  /* EN GRENSE SOM GJØR TALLET STØRRE ER IKKE EN GRENSE.
     `beregningsbredde` sier hvor langt ut regnestykket skal telle. To feil satt
     i den samtidig:

     1) `flateVed` brukte den AVKORTEDE foten til å avgjøre «bygd skråning eller
        rå bakke». Klippet grensen foten, begynte flaten å svare «rå bakke» inne
        i skråningen man faktisk bygger, og fyllingen VOKSTE når grensen ble
        strammet: 52,59 m²/lm uten grense, 52,98 med 2 m, 54,41 med 1 m.
     2) Med masseutskifting ble integrasjonsområdet utvidet til trauet UTEN å
        respektere grensen, så den bet ikke i det hele tatt: 70,44 m²/lm uansett,
        mens rapporten samtidig meldte «avkortet». */
  {
    const medGrense = (bb, utskifting) => M.beregnTverrprofil({
      linje: linjeP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK, { utskifting, beregningsbredde: bb }),
      fjell: new M.Fjellmodell({ standarddybde: 4, punkter: [] }),
      s: 50, vegnivaa: 102, utvidelse: 0, integrasjonssteg: 0.02
    });
    for (const utskifting of [false, true]) {
      const navn = utskifting ? 'med utskifting' : 'uten utskifting';
      const v = [0, 5, 3, 2, 1].map(bb => medGrense(bb, utskifting).areal.fylling);
      let stiger = false;
      for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1] + 1e-6) stiger = true;
      paastand(`${navn}: fyllingen vokser ALDRI når grensen strammes`, !stiger,
        v.map(x => x.toFixed(2)).join(' → '));
      paastand(`  og grensen biter i det hele tatt`,
        v[v.length - 1] < v[0] - 0.5,
        `${v[0].toFixed(2)} uten grense mot ${v[v.length - 1].toFixed(2)} med 1 m`);
    }
  }

  /* NORMALENS BREDDEKRAV STÅR IKKE UTENFOR INNGANGSKONTROLLEN.
     `ekstraBredde` er et objekt, og `klem` går over enkeltfelt – så ingen av de
     tre nøklene ble sett på. Et komma i stedet for punktum i `tillegg` slo av
     hele kravet uten et ord: 307,5 m³ mindre fylling, null merknader. */
  {
    const medEkstra = (eb) => M.beregnMasser({
      linje: linjeP, profil: new Vertikalprofil([{ s: 0, z: 104, k: 0 }, { s: 200, z: 104, k: 0 }]),
      terreng: { z: () => 100 }, mal: Object.assign({}, KLASSISK, { ekstraBredde: eb }),
      fjell: new M.Fjellmodell({ standarddybde: 9, punkter: [] }),
      profilAvstand: 10, bakkefaktor: 1, integrasjonssteg: 0.1
    });
    const god = medEkstra({ fyllingshoyde: 2, stigning: 0.14, tillegg: 0.5 });
    for (const [navn, eb] of [
      ['komma i tillegget', { fyllingshoyde: 2, stigning: 0.14, tillegg: '0,5' }],
      ['NaN i tillegget', { fyllingshoyde: 2, stigning: 0.14, tillegg: NaN }],
      ['tull i fyllingshøyden', { fyllingshoyde: 'x', stigning: 0.14, tillegg: 0.5 }]
    ]) {
      const r = medEkstra(eb);
      sjekk(`${navn} faller tilbake på standarden`, r.sum.fylling, god.sum.fylling, 0.5);
      paastand(`  og det sies fra om det`,
        (r.merknader || []).some(m => m.type === 'inngang'));
    }
  }

  /* RESTEN UNDER TRAUET MÅLES FRA DEN BUNNEN SOM FAKTISK GRAVES.
     Her sto avstanden fra GRENSEPLANET ned til fjellet. Men er renskedybden
     større enn `maksUtskifting`, graves det dypere enn grensen uansett – og da
     er det ingen rest igjen, selv om formelen meldte en. */
  {
    const pr = M.beregnTverrprofil({
      linje: linjeP, terreng: { z: () => 100 },
      mal: Object.assign({}, KLASSISK, { utskifting: true, maksUtskifting: 0.30,
        renskDybde: 0.50 }),
      fjell: new M.Fjellmodell({ standarddybde: 2.0, punkter: [] }),
      s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
    });
    const g = pr.geometri;
    const botnMidt = g.rensk.reduce((b, q) => Math.abs(q[0]) < Math.abs(b[0]) ? q : b, g.rensk[0])[1];
    const fjellMidt = g.fjell.reduce((b, q) => Math.abs(q[0]) < Math.abs(b[0]) ? q : b, g.fjell[0])[1];
    sjekk('resten er avstanden fra den gravde bunnen ned til fjellet',
      pr.utskiftingRest, botnMidt - fjellMidt, 0.02);
  }

  /* INGEN PLASS SKAL IKKE ENDRE NOE. Tomme og ugyldige lister må gå stille
     igjennom – en plass uten bredde eller lengde er ikke en plass. */
  {
    const fasit = lagP(kjorP(null, 0));
    for (const [hva, p] of [
      ['tom liste', []],
      ['uten bredde', [{ s: 100, lengde: 20, bredde: 0, form: 'rektangel' }]],
      ['uten lengde', [{ s: 100, lengde: 0, bredde: 4, form: 'rektangel' }]],
      ['uten stasjon', [{ lengde: 20, bredde: 4 }]],
      ['bare tull', [null, undefined, {}]],
      /* `> 0` ER IKKE NOK: `Infinity > 0` er sant, så en uendelig bredde slapp
         gjennom filteret og ga NaN i bærelaget – et helt svar uten tall.
         `1e400` er den samme verdien, og den er lett å få inn fra et felt. */
      ['uendelig bredde', [{ s: 100, lengde: 20, bredde: Infinity }]],
      ['1e400 i bredden', [{ s: 100, lengde: 20, bredde: 1e400 }]],
      ['uendelig lengde', [{ s: 100, lengde: Infinity, bredde: 5 }]],
      ['NaN i bredden', [{ s: 100, lengde: 20, bredde: NaN }]]
    ]) sjekk(`${hva} endrer ingenting`, lagP(kjorP(p, 0)), fasit, 1e-9);
  }

  /* PLASSEN SKAL KOSTE NOE Å BYGGE. Den er ikke bare bredere asfalt – det skal
     graves og fylles for den også, og rensken følger fotavtrykket. */
  {
    const skraatt = { z: (x, y) => 100 - y * 0.25 };     // sidehelling 1:4
    const kjorH = plasser => M.beregnMasser({
      linje: linjeP, profil: profilP, terreng: skraatt,
      mal: Object.assign({}, KLASSISK, { overbygningHelning: 0 }),
      fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
      profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, plasser
    });
    const u = kjorH(null).sum, m = kjorH([{ s: 100, lengde: 20, bredde: 6, form: 'rektangel' }]).sum;
    paastand('en plass i sidehelling koster både skjæring og fylling',
      m.skjaering > u.skjaering + 1 && m.fylling > u.fylling + 1,
      `skjæring ${u.skjaering.toFixed(0)}→${m.skjaering.toFixed(0)}, `
      + `fylling ${u.fylling.toFixed(0)}→${m.fylling.toFixed(0)}`);
    paastand('  og rensken følger det bredere fotavtrykket',
      m.rensk > u.rensk + 1, `${u.rensk.toFixed(0)}→${m.rensk.toFixed(0)}`);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n6c. Avlesning av PDF');
{
  const Pdf = require(path.join(__dirname, '..', 'public', 'js', 'pdfimport.js'));

  /* Bézier-kurvene ma følges, ikke bare avsluttes. Her ble bare endepunktet
     tatt med, sa en vertikalkurve tegnet som en Bézier ble lest som en rett
     korde mellom endene - og pilhøyden, det tallet man leser av profilen for,
     forsvant. */
  {
    const kurve = Pdf.tolkBaner('1 0 0 1 0 0 cm 0 0 m 100 100 200 100 300 0 c S')[0];
    const ys = kurve.map(p => p.y);
    sjekk('en Bézier gir maks pilhøyde 75, ikke 0', Math.max(...ys), 75, 0.01);
    sjekk('kurven starter der den skal', kurve[0].x, 0, 1e-9);
    sjekk('og ender der den skal', kurve[kurve.length - 1].x, 300, 1e-9);
    paastand('kurven blir flere punkt enn to', kurve.length >= 5, `${kurve.length} punkt`);

    // `v` bruker startpunktet som første kontrollpunkt, `y` endepunktet som andre
    const v = Pdf.tolkBaner('1 0 0 1 0 0 cm 0 0 m 200 100 300 0 v S')[0];
    const y = Pdf.tolkBaner('1 0 0 1 0 0 cm 0 0 m 100 100 300 0 y S')[0];
    /* PILHØYDEN KAN IKKE SKILLE DE TO – DE ER SPEILBILDER.
       Her sto `maks y > 20` for begge, og begge gir 43,9453. Det er ikke en
       tilfeldighet: `v` setter startpunktet som første kontrollpunkt, `y`
       endepunktet som andre, så kurvene er speilvendte om midten og MÅ ha
       samme pilhøyde. Påstandene kunne derfor byttes om uten at noe skjedde,
       og de fanget ikke at de to operatorene ble lest likt.

       Det som skiller dem er HVOR bulen ligger: `v` har den sent (x = 161,1),
       `y` tidlig (x = 138,9). Det er den forskjellen som prøves nå. */
    const topp = k => k.reduce((b, p) => (p.y > b.y ? p : b), k[0]);
    paastand('v-kurven bøyer av fra korden', Math.max(...v.map(p => p.y)) > 20);
    paastand('y-kurven bøyer av fra korden', Math.max(...y.map(p => p.y)) > 20);
    /* SAMME TALL, ULIK OPERATOR – ELLERS PRØVES INGENTING.
       De to over har forskjellige operander, så de gir forskjellige kurver
       uansett hvordan operatorene leses. Målt: leses `v` som `y`, flytter
       toppen seg bare fra x = 161,1 til 182,8, og en påstand om «sent» holder
       fortsatt.

       Her får begge NØYAKTIG de samme fire tallene. Da er den eneste
       forskjellen operatoren selv, og leses de likt, blir kurvene identiske. */
    const vS = Pdf.tolkBaner('1 0 0 1 0 0 cm 0 0 m 200 100 300 0 v S')[0];
    const yS = Pdf.tolkBaner('1 0 0 1 0 0 cm 0 0 m 200 100 300 0 y S')[0];
    paastand('v og y med samme tall gir ULIKE kurver',
      Math.abs(topp(vS).x - topp(yS).x) > 10,
      `v topper på x = ${topp(vS).x.toFixed(1)}, y på x = ${topp(yS).x.toFixed(1)}`);
  }

  /* Kandidatutvalget kastet alt med under femten punkt. En veglinje tegnet som
     noen fa rette tangenter har ikke femten punkt - i Ydestad-planen ligger
     den med fire, over 1166 enheter - og falt derfor ut. Brukeren fikk
     terrenglinjen a velge, og trodde det var veien. */
  {
    const linje = [];
    for (const [x, y] of [[0, 0], [400, 60], [800, 20], [1200, 90]]) linje.push({ x, y });
    const rutenett = [];
    for (const x of [0, 400, 800, 1200]) rutenett.push({ x, y: 50 });   // flat strek
    const ramme = [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 0, y: 300 }]; // gar tilbake
    const k = Pdf.kandidater([linje, rutenett, ramme]);
    paastand('en veglinje med fire punkt blir kandidat', k.some(x => x.punkt === 4 && x.bredde > 1000),
      `${k.length} kandidater`);
    paastand('en flat rutenettstrek blir det ikke', !k.some(x => x.hoyde < 1));
    paastand('og en ramme som går tilbake heller ikke', k.length === 1, `${k.length}`);

    // samme strek tegnet to ganger skal bare telle en gang
    const to = Pdf.kandidater([linje, linje.map(p => ({ x: p.x, y: p.y }))]);
    sjekk('samme strek to ganger gir én kandidat', to.length, 1, 0);
  }

  // Transformasjonsmatrisen ma sla inn pa punktene
  const baner = Pdf.tolkBaner('q 1 0 0 1 100 200 cm 0 0 m 10 5 l 20 3 l S Q 50 50 m 60 60 l S');
  sjekk('to baner tolket', baner.length, 2, 0);
  sjekk('cm forskyver x', baner[0][0].x, 100, 1e-9);
  sjekk('cm forskyver y', baner[0][0].y, 200, 1e-9);
  sjekk('punkt etter forskyvning', baner[0][2].x, 120, 1e-9);
  paastand('Q gjenoppretter matrisen', Math.abs(baner[1][0].x - 50) < 1e-9);

  const skalert = Pdf.tolkBaner('q 2 0 0 3 0 0 cm 5 7 m 10 9 l S Q');
  sjekk('cm skalerer x', skalert[0][0].x, 10, 1e-9);
  sjekk('cm skalerer y', skalert[0][0].y, 21, 1e-9);

  // Kandidater: bare brede linjer som gar mot høyre
  const framover = [], bakover = [], kort = [];
  for (let i = 0; i < 30; i++) {
    framover.push({ x: i * 5, y: 10 + Math.sin(i) });
    bakover.push({ x: (29 - i) * 5, y: 10 });
    if (i < 20) kort.push({ x: i * 0.5, y: 10 });
  }
  const k = Pdf.kandidater([framover, bakover, kort]);
  sjekk('bare den ene banen er kandidat', k.length, 1, 0);
  paastand('det er den som gar framover', k[0].bane === framover);

  /* Omregningen: to referansepunkt gir malestokk og forskyvning i hver
     retning. Med en rett linje ma svaret bli nøyaktig. */
  const rett = [];
  for (let i = 0; i <= 20; i++) rett.push({ x: i * 10, y: i * 2 });
  const r = Pdf.tilHoyder(rett, [{ pdfX: 0, pdfY: 0, s: 0, z: 100 }, { pdfX: 200, pdfY: 40, s: 400, z: 140 }], 50);
  sjekk('første profilnummer', r.punkt[0].s, 0, 1e-9);
  sjekk('siste profilnummer', r.punkt[r.punkt.length - 1].s, 400, 1e-9);
  let verst = 0;
  for (const p of r.punkt) verst = Math.max(verst, Math.abs(p.z - (100 + p.s / 10)));
  sjekk('høydene treffer eksakt på en rett linje', verst, 0, 1e-6);

  const snudd = Pdf.tilHoyder(rett, [{ pdfX: 0, pdfY: 40, s: 0, z: 100 }, { pdfX: 200, pdfY: 0, s: 400, z: 140 }], 100);
  paastand('snudd høydeakse gir synkende høyder', snudd.punkt[0].z > snudd.punkt[snudd.punkt.length - 1].z);
  paastand('like x-verdier avvises',
    Pdf.tilHoyder(rett, [{ pdfX: 5, pdfY: 0, s: 0, z: 100 }, { pdfX: 5, pdfY: 40, s: 400, z: 140 }], 50) === null);
}

/* ------------------------------------------------------------------ */
(async () => {
  console.log('\n7. Pakking av terrengfliser');
  {
    // Fram og tilbake gjennom flisformatet skal ikke endre høydene
    const n = 64 * 64;
    const inn = new Float32Array(n);
    for (let i = 0; i < n; i++) inn[i] = 137.42 + (i % 977) * 0.13;
    inn[5] = NaN; inn[900] = NaN;
    const ut = H.pakkOpp(H.pakkFlis(inn, 64));
    let maks = 0, nanOk = true;
    for (let i = 0; i < n; i++) {
      if (isNaN(inn[i])) { if (!isNaN(ut.data[i])) nanOk = false; continue; }
      maks = Math.max(maks, Math.abs(inn[i] - ut.data[i]));
    }
    sjekk('16-bits pakking holder centimeteren', maks, 0, 0.006);
    paastand('manglende data overlever pakkingen', nanOk);

    // Stort høydespenn i samme flis ma falle tilbake til float32
    const bratt = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) bratt[i] = i * 0.5;      // spenner 512 m
    const b2 = H.pakkFlis(bratt, 32);
    paastand('stort høydespenn sendes som float32', b2.readUInt8(4) === H.FORMAT_F32);
    const u2 = H.pakkOpp(b2);
    let maks2 = 0;
    for (let i = 0; i < 1024; i++) maks2 = Math.max(maks2, Math.abs(bratt[i] - u2.data[i]));
    sjekk('float32-varianten er eksakt', maks2, 0, 1e-9);
  }

  console.log('\n8. Terrengmodell mot Kartverket sitt punkt-API');
  try {
    const sone = 33, sr = 25833;
    const tx = 171, ty = 25344;                       // 43776–44032 øst, 6488064–6488320 nord
    const rist = H.pakkOpp(await H.hentFlis(sr, tx, ty, 1)).data;
    const P = 256;
    const originX = tx * 256, originY = (ty + 1) * 256;

    const punkter = [];
    const indekser = [];
    for (let n = 0; n < 30; n++) {
      const i = 10 + (n * 8) % 236, j = 10 + (n * 17) % 236;
      punkter.push([originX + (i + 0.5), originY - (j + 0.5)]);
      indekser.push(j * P + i);
    }
    const svar = await fetch(`https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=${sr}&punkter=${encodeURIComponent(JSON.stringify(punkter))}`);
    const data = await svar.json();
    let maks = 0, sum = 0, m = 0;
    data.punkter.forEach((p, n) => {
      if (p.z == null) return;
      const v = rist[indekser[n]];
      if (!isFinite(v)) return;
      const d = Math.abs(v - p.z);
      maks = Math.max(maks, d); sum += d; m++;
    });
    console.log(`  ${m} kontrollpunkt, snitt ${(sum / m).toFixed(4)} m, største ${maks.toFixed(4)} m`);
    paastand('terrenghøydene stemmer med Kartverket (< 1 cm)', m > 20 && maks < 0.01);

    /* Utenfor dekningen svarer høydetjenesten 0,00 for hver eneste piksel -
       ikke en nodata-verdi, ikke en feilmelding. Uten at det fanges opp blir
       et hull i terrengmodellen lest som havflaten, og en veg pa kote 260 far
       en skjæring pa 260 meter uten en eneste merknad. */
    const utenfor = [['Nordsjøen', 58.0, 3.0], ['Sverige', 59.8, 13.5]];
    for (const [navn, lat, lon] of utenfor) {
      const s2 = Geo.sone(lon);
      const p2 = Geo.tilUtm(lat, lon, s2);
      const flis = H.pakkOpp(await H.hentFlis(Geo.epsg(s2), Math.floor(p2.x / 256), Math.floor(p2.y / 256), 1)).data;
      const gyldige = [...flis].filter(v => !Number.isNaN(v)).length;
      paastand(`${navn}: uten dekning gir manglende data, ikke kote 0`, gyldige === 0,
        `${gyldige} av ${flis.length} celler har verdi`);
    }
    const paaLand = H.pakkOpp(await H.hentFlis(sr, tx, ty, 1)).data;
    paastand('en flis med dekning blir ikke kastet som tom',
      [...paaLand].filter(v => !Number.isNaN(v)).length > paaLand.length * 0.9);

    /* EN FLIS KAN VÆRE HALVT UTENFOR DEKNINGEN.
       «Bare null» fanger flisen som er null over alt. En flis PÅ kanten har
       ekte data i den ene enden og nuller i den andre, og de nullene sto som
       vanlige koter. Målt på prosjektets egen buffer: 17 av 270 fliser har
       begge deler – seksten er dekningskanter der nabocellene til nullene
       ligger på 680 til 790 meter, og én er en ekte strandlinje der de ligger
       på 0,02. Skillet er hvor høyt det spretter ved siden av nullene. */
    const rutenett = (px, f) => {
      const d = new Float32Array(px * px);
      for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) d[j * px + i] = f(i, j);
      return d;
    };
    const etterKant = (px, f) => {
      const d = rutenett(px, f);
      H.nullflateKant(d, px);
      let nan = 0, nuller = 0;
      for (const v of d) { if (Number.isNaN(v)) nan++; else if (v === 0) nuller++; }
      return { nan, nuller, n: d.length };
    };
    {
      const k = etterKant(32, i => (i < 16 ? 0 : 700 + i * 0.5));
      paastand('en dekningskant blir manglende data, ikke kote 0',
        k.nuller === 0 && k.nan === 512, `${k.nan} NaN, ${k.nuller} nuller igjen`);
    }
    {
      const s = etterKant(32, i => (i < 16 ? 0 : 0.02 + i * 0.05));
      paastand('  men en strandlinje beholder havflaten sin',
        s.nan === 0 && s.nuller === 512, `${s.nan} NaN, ${s.nuller} nuller igjen`);
    }
    {
      const u = etterKant(32, i => 100 + i);
      paastand('  og en flis uten nuller røres ikke',
        u.nan === 0 && u.nuller === 0, `${u.nan} NaN`);
    }
    /* Og på ekte fliser: ingen som er sluppet gjennom skal ha et stup ved
       siden av nullene sine. Går denne i rødt, ligger det en forgiftet flis i
       mellomlageret – da er `FLIS_TOLKNING` ikke bumpet. */
    try {
      const mappe = H.cacheMappe && H.cacheMappe();
      const fsm = require('fs'), pth = require('path');
      if (mappe && fsm.existsSync(mappe)) {
        const pre = `v${require('fs').readFileSync('lib/hoydedata.js', 'utf8')
          .match(/const FLIS_TOLKNING = (\d+)/)[1]}_`;
        const filer = fsm.readdirSync(mappe).filter(f => f.startsWith(pre) && f.endsWith('.bin'));
        let verstFil = null, verst = 0, sett = 0;
        for (const f of filer) {
          let o; try { o = H.pakkOpp(fsm.readFileSync(pth.join(mappe, f))); } catch (e2) { continue; }
          const d = o.data, w = o.px, rader = Math.floor(d.length / w);
          let n0 = 0; for (let i = 0; i < d.length; i++) if (d[i] === 0) n0++;
          if (!n0 || n0 === d.length) continue;
          sett++;
          const nab = [];
          for (let j = 0; j < rader; j++) for (let i = 0; i < w; i++) {
            const k2 = j * w + i; if (d[k2] !== 0) continue;
            for (const nb of [i > 0 ? k2 - 1 : -1, i < w - 1 ? k2 + 1 : -1,
              j > 0 ? k2 - w : -1, j < rader - 1 ? k2 + w : -1]) {
              if (nb < 0) continue;
              if (d[nb] !== 0 && isFinite(d[nb])) nab.push(Math.abs(d[nb]));
            }
          }
          if (!nab.length) continue;
          nab.sort((a, b) => a - b);
          const p10 = nab[Math.floor(nab.length * 0.1)];
          if (p10 > verst) { verst = p10; verstFil = f; }
        }
        paastand('ingen flis i mellomlageret har nullflate mot høyt terreng',
          verst <= 5, `${sett} fliser med både null og data, verst ${verst.toFixed(2)} m`
          + (verstFil ? ' i ' + verstFil : ''));
      }
    } catch (e3) { paastand('mellomlagerprøven kom seg gjennom', false, e3.message); }
  } catch (e) {
    /* Bare nettfeil er en gyldig grunn til a hoppe over. Alt annet er en feil
       i prøven eller i koden, og skal telle - ellers rapporterer denne
       seksjonen «0 feil» uansett hva som gikk galt. */
    const nettfeil = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|fetch failed|getaddrinfo/i.test(
      e.message + ' ' + (e.code || ''));
    if (nettfeil) console.log('  HOPPET OVER (ingen nettforbindelse): ' + e.message);
    else paastand('seksjon 8 kom seg gjennom', false, e.message);
  }

console.log('\n6f. Snuplass som SIRKEL – radien er et tall man kan stille på');
{
  /* «Hvor er det man stiller på snuplass altså radien» – og svaret var at den
     ikke fantes. Ovalen er en halv ellipse i breddetillegget, så krumningen
     falt ut av lengde og bredde: man styrte radien uten å se den.

     FASITEN ER ET INTEGRAL, ikke et tall fra en tidligere kjøring. Figuren er
     en sirkel med radius R1 om plassens senter, koblet til den rette vegkanten
     med en motkurve R2. Arealet regnes her ved å integrere den samme
     geometrien med tett steg – en annen vei enn beregningen tar, som går om
     profiler og gjennomsnittlig endeareal. */
  const linjeS = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 300, y: 0, r: 0 }]);
  const profilS = new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 300, z: 100, k: 0 }]);
  const malS = Object.assign({}, KLASSISK, { overbygningHelning: 0, utvidelseOvergang: 0 });
  const obS = malS.slitelagTykkelse + malS.baerelagTykkelse;
  const kjorS = plasser => M.beregnMasser({
    linje: linjeS, profil: profilS, terreng: { z: () => 100 }, mal: malS,
    fjell: new M.Fjellmodell({ standarddybde: 99, punkter: [] }),
    profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.05, plasser
  });
  const lagS = r => r.sum.baerelag + r.sum.slitelag;
  const utenS = lagS(kjorS(null));

  /** Tilleggsarealet til en sirkelplass, regnet med tett numerisk integral. */
  const fasitAreal = (R1, R2, w, ensidig) => {
    const c = ensidig ? R1 - w / 2 : 0;
    const a = w / 2 + R2 - c;
    const d = Math.sqrt((R1 + R2) * (R1 + R2) - a * a);
    const st = R2 > 0 ? R1 * d / (R1 + R2) : d;
    const y = tt => {
      const at = Math.abs(tt);
      if (at >= d) return w / 2;
      if (R2 > 0 && at >= st) {
        const u = d - at;
        return w / 2 + R2 - Math.sqrt(Math.max(0, R2 * R2 - u * u));
      }
      return c + Math.sqrt(Math.max(0, R1 * R1 - tt * tt));
    };
    const n = 400000;
    let A = 0;
    for (let i = 0; i < n; i++) {
      const tt = -d + (i + 0.5) * 2 * d / n;
      A += (ensidig ? Math.max(0, y(tt) - w / 2) : Math.max(0, 2 * y(tt) - w)) * (2 * d / n);
    }
    return { A, d };
  };

  const w = malS.vegbredde;
  for (const [R1, R2, side, hva] of [
    [13, 15, 'sentrum', 'midt på vegen'],
    [13, 0, 'sentrum', 'uten overgangsbue – ren sirkel'],
    [10, 20, 'sentrum', 'liten sirkel, lang overgang'],
    [13, 15, 'hoyre', 'ensidig, ut til høyre']
  ]) {
    const f = fasitAreal(R1, R2, w, side !== 'sentrum');
    const r = kjorS([{ s: 150, radius: R1, overgangsradius: R2, side, form: 'sirkel' }]);
    sjekk(`sirkel R${R1}/R${R2} ${hva}: overbygningen er arealet · tykkelsen`,
      lagS(r) - utenS, f.A * obS, Math.max(0.4, f.A * obS * 0.004));
  }

  /* RADIEN MÅ FAKTISK STYRE. En større radius skal gi mer, og figuren skal
     være lengre enn 2R – overgangsbuen strekker den. */
  /* Her sto en sammenligning av TOTALENE, ikke av tillegget – og totalen
     inneholder hele vegen, så «dobbelt så stor radius» ble drukket i de 945 m³
     som lå der fra før. Kravet er at TILLEGGET vokser for hver eneste radius,
     over hele spennet. Målt: 53,1 · 108,5 · 181,1 · 322,3 · 501,3 · 801,4 m³. */
  const tillegg = R => lagS(kjorS([{ s: 150, radius: R, overgangsradius: 15, form: 'sirkel' }])) - utenS;
  const rekke = [6, 8, 10, 13, 16, 20].map(tillegg);
  let stiger = true;
  for (let i = 1; i < rekke.length; i++) if (!(rekke[i] > rekke[i - 1] * 1.2)) stiger = false;
  paastand('tillegget vokser med radien, hele veien',
    stiger && rekke[0] > 10 && rekke[rekke.length - 1] > 500);

  /* LENGDE OG BREDDE SKAL IKKE LESES NÅR FORMEN ER SIRKEL.
     To tall som beskriver den samme kurven kan settes i motstrid, og da finnes
     det ikke ett riktig svar – bare to. Prøven setter dem til noe vilt og
     krever at svaret ikke rører seg. */
  const rein = lagS(kjorS([{ s: 150, radius: 13, overgangsradius: 15, form: 'sirkel' }]));
  const forstyrret = lagS(kjorS([{ s: 150, radius: 13, overgangsradius: 15, form: 'sirkel',
    lengde: 300, bredde: 40 }]));
  sjekk('lengde og bredde leses ikke når formen er sirkel', forstyrret, rein, 0.01);

  /* OG OMVENDT: en oval skal ikke la seg påvirke av en radius som ligger der. */
  const oval = lagS(kjorS([{ s: 150, lengde: 20, bredde: 5.5, form: 'oval' }]));
  const ovalMedR = lagS(kjorS([{ s: 150, lengde: 20, bredde: 5.5, form: 'oval',
    radius: 30, overgangsradius: 50 }]));
  sjekk('og radien leses ikke når formen er oval', ovalMedR, oval, 0.01);

  /* EN UMULIG SIRKEL SKAL IKKE GI NaN. Radius under halve vegbredden, eller en
     ensidig plass der overgangsbuen ikke kan nå fram, har ingen løsning – da
     faller plassen tilbake på ovalen sin i stedet for å svare med et tall som
     ikke er et tall. Det var slik `Infinity` slapp gjennom en gang før. */
  for (const [hva, pl] of [
    ['radius under halve vegbredden', { s: 150, radius: 1, overgangsradius: 15, form: 'sirkel', lengde: 20, bredde: 5.5 }],
    ['ensidig der overgangsbuen ikke når fram', { s: 150, radius: 13, overgangsradius: 0, side: 'hoyre', form: 'sirkel', lengde: 20, bredde: 5.5 }],
    ['radius som ikke er et tall', { s: 150, radius: NaN, overgangsradius: 15, form: 'sirkel', lengde: 20, bredde: 5.5 }]
  ]) {
    const r = kjorS([pl]);
    paastand(`umulig sirkel gir tall, ikke NaN: ${hva}`,
      Number.isFinite(r.sum.baerelag) && Number.isFinite(r.sum.fylling)
      && Number.isFinite(r.sum.skjaering),
      `baerelag ${r.sum.baerelag}, fylling ${r.sum.fylling}`);
  }
}

  console.log(`\n${ok} tester ok, ${feil} feil\n`);
  process.exit(feil ? 1 : 0);
})();
