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
  const mal = Object.assign({}, M.StandardMal);
  const fjell = new M.Fjellmodell({ standarddybde: 99, punkter: [] });

  const pr = M.beregnTverrprofil({
    linje, terreng, mal, fjell, s: 50, vegnivaa: 100, utvidelse: 0, integrasjonssteg: 0.02
  });

  /* Handregning, en side, med normalens verdier (tverrfall 5 %,
     grøft 0,20 m under planum, grøftebunn 0,30 m):
       hb        = 2,25            planum ved senter = 100 - 0,70 = 99,30
       terreng etter rensk         = 99,80
       planum ved vegkant          = 100 - 0,05·2,25 - 0,70 = 99,1875
       grøftebunn                  = 99,1875 - 0,20 = 98,9875
       t1 = 2,25 + 0,20·1,0 = 2,45     t2 = 2,75
       skraning 1:1,5 opp 0,8125 m => 1,21875 m ut, fot ved t = 3,96875
       areal = 1,2515625 + 0,1425 + 0,24375 + 0,49511719 = 2,13292969  */
  const enSide = 2.13292969;
  sjekk('skjæringsareal (begge sider)', pr.areal.skjaering, 2 * enSide, 0.01);
  sjekk('fyllingsareal', pr.areal.fylling, 0, 1e-6);
  sjekk('skjæringsfot høyre', pr.fotHoyre, 3.96875, 0.01);
  sjekk('renskeareal', pr.areal.rensk, 0.2 * (2 * 3.96875 + 2), 0.02);
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
  /* Fyllingsareal for hand, en side.
     Fyllingen blir over 2 m høy, og da krever normalen 0,5 m ekstra
     veibredde. Halvbredden blir derfor 2,5 m, ikke 2,25 m:
       vegkant 103 - 0,05·2,5 = 102,875 ; terreng etter rensk 99,80
       skraning 1:1,5 ned 3,075 m => 4,6125 m ut
       under vegen: ∫0^2,5 (102,30 - 0,05t - 99,80) dt = 6,25 - 0,15625
       trekant utenfor: 0,5 · 3,075 · 4,6125                                */
  const fyllEnSide = (2.5 * 2.5 - 0.05 * 2.5 * 2.5 / 2) + 0.5 * 3.075 * 4.6125;
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
console.log('\n6. Veiklasser, breddeutvidelse og stigningskrav');
{
  const V = require(path.join(__dirname, '..', 'public', 'js', 'veiklasser.js'));
  const mal = M.StandardMal;   // klasse 5, veibredde 4,5 m

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
  const k3 = V.malFraVeiklasse('k3', Object.assign({}, M.StandardMal));
  sjekk('klasse 3 setter veibredde', k3.vegbredde, 4.0, 1e-9);
  sjekk('klasse 3 setter minste radius', k3.minRadius, 10, 1e-9);
  sjekk('klasse 3 setter overgangslengde for bredde', k3.utvidelseOvergang, 20, 1e-9);
  sjekk('klasse 3 setter egen utflating for stigning', k3.utflatingForKurve, 10, 1e-9);
  sjekk('klasse 3 krever 7,0 m i R=10 kort kurve', M.utvidelseFraRadius(k3, 10, 45) + k3.vegbredde, 7.0, 1e-9);
  const k2 = V.malFraVeiklasse('k2', Object.assign({}, M.StandardMal));
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
  const k3mal = V.malFraVeiklasse('k3', Object.assign({}, M.StandardMal, { vegbredde: 4.0 }));
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
  const grunnmal = Object.assign({}, M.StandardMal, { ekstraBredde: null, maksSokebredde: 60 });
  const fjell = new M.Fjellmodell({ standarddybde: 5 });
  const profil = new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]);

  const utenGrense = M.beregnMasser({
    linje, profil, terreng: li, mal: grunnmal, fjell, profilAvstand: 25, bakkefaktor: 1
  });
  const medGrense = M.beregnMasser({
    linje, profil, terreng: li, mal: Object.assign({}, grunnmal, { beregningsbredde: 5 }),
    fjell, profilAvstand: 25, bakkefaktor: 1
  });

  const bredde = utenGrense.profiler[1].fotHoyre - utenGrense.profiler[1].halvbredde;
  paastand('uten grense gar skraningen langt ut', bredde > 5);
  paastand('med grense stopper profilet ved grensen',
    medGrense.profiler[1].fotHoyre <= medGrense.profiler[1].halvbredde + 5.0001);
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
  const mal = Object.assign({}, M.StandardMal, { ekstraBredde: null });
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
  const mal = Object.assign({}, M.StandardMal, { utvidelseOvergang: 15, ekstraBredde: null });

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
console.log('\n6c. Avlesning av PDF');
{
  const Pdf = require(path.join(__dirname, '..', 'public', 'js', 'pdfimport.js'));

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
  } catch (e) {
    console.log('  HOPPET OVER (ingen nettforbindelse?): ' + e.message);
  }

  console.log(`\n${ok} tester ok, ${feil} feil\n`);
  process.exit(feil ? 1 : 0);
})();
