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
const { Vertikalprofil, foreslaProfil, lesHoydetabell } = require(path.join(__dirname, '..', 'public', 'js', 'vertikalprofil.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));
const H = require(path.join(__dirname, '..', 'lib', 'hoydedata.js'));

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
  const mal = Object.assign({}, M.StandardMal);
  const fjell = new M.Fjellmodell({ standarddybde: 99, punkter: [] });

  const pr = M.beregnTverrprofil({
    linje, terreng, mal, fjell, s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });

  /* Handregning, en side:
       hb        = 2,25            planum ved senter = 100 - 0,70 = 99,30
       terreng etter rensk         = 99,80
       planum ved vegkant          = 100 - 0,06·2,25 - 0,70 = 99,165
       grøftebunn                  = min(99,865-0,80 ; 99,165-0,05) = 99,065
       t1 = 2,25 + 0,10·1,0 = 2,35     t2 = 2,85
       skraning 1:1,5 opp 0,735 m  => 1,1025 m ut, fot ved t = 3,9525
       areal = 1,276875 + 0,0685 + 0,3675 + 0,40516875 = 2,11804375  */
  const enSide = 2.11804375;
  sjekk('skjæringsareal (begge sider)', pr.areal.skjaering, 2 * enSide, 0.01);
  sjekk('fyllingsareal', pr.areal.fylling, 0, 1e-6);
  sjekk('skjæringsfot høyre', pr.fotHoyre, 3.9525, 0.01);
  sjekk('renskeareal', pr.areal.rensk, 0.2 * (2 * 3.9525 + 2), 0.02);
  sjekk('bærelagsareal', pr.areal.baerelag, 0.6 * 4.5, 1e-9);
  sjekk('slitelagsareal', pr.areal.slitelag, 0.1 * 4.0, 1e-9);
  sjekk('ingen fjell når fjellet ligger 99 m nede', pr.areal.skjaeringFjell, 0, 1e-9);

  // Alt i fjell
  const prFjell = M.beregnTverrprofil({
    linje, terreng, mal, fjell: new M.Fjellmodell({ standarddybde: 0 }),
    s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });
  paastand('alt regnes som fjell når fjellet ligger i dagen',
    Math.abs(prFjell.areal.skjaeringFjell - prFjell.areal.skjaering) < 1e-6);

  // Volum over 100 m
  const res = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 1 }, { s: 100, z: 100, k: 1 }]),
    terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.02
  });
  sjekk('skjæringsvolum over 100 m', res.sum.skjaering, 2 * enSide * 100, 3);
  sjekk('bærelagsvolum over 100 m', res.sum.baerelag, 0.6 * 4.5 * 100, 0.5);
  sjekk('lengde', res.lengde, 100, 1e-9);

  // Ren fylling: veg 3 m over terrenget
  const resF = M.beregnMasser({
    linje, profil: new Vertikalprofil([{ s: 0, z: 103, k: 1 }, { s: 100, z: 103, k: 1 }]),
    terreng, mal, fjell, profilAvstand: 5, bakkefaktor: 1, integrasjonssteg: 0.02
  });
  /* Fyllingsareal for hand, en side:
       vegkant 103 - 0,06·2,25 = 102,865 ; planum 102,165 ; terreng etter rensk 99,80
       skraning 1:1,5 ned 3,065 m => 4,5975 m ut
       under vegen  (0..2,25): høyde = (102,165 - 0,06t·0) ... integreres eksakt under
       trapes:  A = ∫0^2,25 (102,30 - 0,06t - 99,80) dt  = 2,5·2,25 - 0,06·2,25²/2 = 5,625 - 0,151875
                 + trekant utenfor: 0,5·(102,865-99,80)·4,5975 = 0,5·3,065·4,5975
                 + rektangel mellom planum og vegkant ved t = 2,25: 0 (vertikalt skille)      */
  const fyllEnSide = (2.5 * 2.25 - 0.06 * 2.25 * 2.25 / 2) + 0.5 * 3.065 * 4.5975;
  sjekk('fyllingsareal (begge sider)', resF.profiler[0].areal.fylling, 2 * fyllEnSide, 0.02);
  sjekk('ingen skjæring ved ren fylling', resF.sum.skjaering, 0, 1e-6);

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
console.log('\n4b. Hull i terrengmodellen');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const mal = Object.assign({}, M.StandardMal);
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
  const mal = Object.assign({}, M.StandardMal);
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
console.log('\n6. Breddeutvidelse og stigningskrav');
{
  const mal = M.StandardMal;
  sjekk('utvidelse ved R=10', M.utvidelseFraRadius(mal, 10), 1.5, 1e-9);
  sjekk('utvidelse ved R=30', M.utvidelseFraRadius(mal, 30), 0.25, 1e-9);
  sjekk('utvidelse på rettstrekk', M.utvidelseFraRadius(mal, Infinity), 0, 1e-9);
  sjekk('maks stigning ved R=10', M.maksStigningFraRadius(mal, 10), 0.12, 1e-9);
  sjekk('maks stigning ved R=30', M.maksStigningFraRadius(mal, 30), 0.17, 1e-9);
  sjekk('maks stigning på rettstrekk', M.maksStigningFraRadius(mal, Infinity), 0.20, 1e-9);
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
  } catch (e) {
    console.log('  HOPPET OVER (ingen nettforbindelse?): ' + e.message);
  }

  console.log(`\n${ok} tester ok, ${feil} feil\n`);
  process.exit(feil ? 1 : 0);
})();
