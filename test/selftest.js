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
  /* 0,60 m bærelag i full bredde, og i tillegg de øverste 0,10 m pa den halve
     meteren skulder som ligger utenfor slitelaget - der gar bærelaget helt
     opp til veinivaet. */
  sjekk('bærelagsareal', pr.areal.baerelag, 0.6 * 4.5 + 0.1 * (4.5 - 4.0), 1e-9);
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
  sjekk('bærelagsvolum over 100 m', res.sum.baerelag, (0.6 * 4.5 + 0.1 * 0.5) * 100, 0.5);
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
       skraning 1:1,5 ned 2,375 m            => 3,5625 m ut
       under vegen: ∫0^2,5 (102,30 - 0,05t - 99,80) dt = 6,25 - 0,15625
       trekant utenfor: 0,5 · 2,375 · 3,5625                                */
  const fyllEnSide = (2.5 * 2.5 - 0.05 * 2.5 * 2.5 / 2) + 0.5 * 2.375 * 3.5625;
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

  /* Pappus-vekten (1 + t·krumning) blir negativ forbi kurvesenteret. Da ble
     et areal trukket fra i stedet for lagt til, og et fyllingsareal pa 36 m²
     kom ut som −0,3 m². */
  const krapp = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 60, y: 0, r: 12 }, { x: 60, y: 60, r: 0 }]);
  const li = { z: (x, y) => 100 + 0.55 * y };
  const mal = Object.assign({}, M.StandardMal, { maksSokebredde: 45, ekstraBredde: null });
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
  const knekkmal = Object.assign({}, M.StandardMal, {
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
  const bredde = M.StandardMal.breddeIKurve;
  const knappest = M.utvidelseFraRadius(M.StandardMal, bredde[0][0], 90);
  paastand('radius under tabellen gir minst like mye utvidelse som det knappeste bandet',
    M.utvidelseFraRadius(M.StandardMal, bredde[0][0] - 3, 90) >= knappest - 1e-9);

  /* En kurve kortere enn profilavstanden falt mellom to profiler og fikk
     ingen utvidelse i det hele tatt. */
  const kortKurve = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 12 }, { x: 100, y: 100, r: 0 }]);
  const stasjonerGrovt = [];
  for (let s = 0; s <= kortKurve.lengde; s += 20) stasjonerGrovt.push(s);
  const utv = M.lagUtvidelsesprofil(kortKurve, M.StandardMal, stasjonerGrovt, null);
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
  const krappMal = Object.assign({}, M.StandardMal, { maksSokebredde: 45, ekstraBredde: null });
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

  /* Overbygningen skal fylle nøyaktig det som ble gravd ut ned til planum.
     Slitelaget ligger bare over kjørebanen, sa skuldrene ma fylles med
     bærelag helt opp - ellers star 50 til 100 kubikk per kilometer pa
     ingen post. */
  for (const veiklasse of ['k1', 'k3', 'k7', 'k8']) {
    const vm = Object.assign({}, M.StandardMal, VK.malFraVeiklasse(veiklasse) || {},
      { grofteDybdePlanum: 0, grofteBunn: 0 });
    const r = M.beregnMasser({
      linje: rettLinje, profil: new Vertikalprofil([{ s: 0, z: 100, k: 0 }, { s: 100, z: 100, k: 0 }]),
      terreng: { z: () => 100 }, mal: vm, fjell: new M.Fjellmodell({ standarddybde: 5 }),
      profilAvstand: 10, bakkefaktor: 1
    });
    const gravd = (vm.slitelagTykkelse + vm.baerelagTykkelse) * vm.vegbredde * 100;
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
  paastand('masse fra skjæringen blir faktisk brukt i fyllingen',
    b.fyllFraLos + b.fyllFraFjell > 1,
    `løsmasse ${b.fyllFraLos.toFixed(0)}, fjell ${b.fyllFraFjell.toFixed(0)}`);
  paastand('løsmassen brukes før sprengsteinen',
    b.fyllFraLos > 0 && (b.fyllFraLos >= b.brukbarLos - 1e-6 || b.fyllFraFjell < 1e-6),
    `${b.fyllFraLos.toFixed(1)} av ${b.brukbarLos.toFixed(1)} brukbar`);
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
  {
    const f = midt.faktorer, s = midt.sum;
    const id = (navn, a, b2) => sjekk('  ' + navn, a, b2, 1e-6);
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
  const full = rensk(M.StandardMal.renskDybde);
  const halv = rensk(M.StandardMal.renskDybde / 2);
  paastand('halv dybde til fjell gir halv rensk',
    Math.abs(halv - full / 2) < full * 0.02, `${halv.toFixed(0)} mot ${(full / 2).toFixed(0)}`);
  /* Ligger fjellet dypere enn renskelaget, skal rensken vaere nøyaktig
     renskedybden ganger bredden - det gamle flate regnestykket. Volumene for
     ulike fjelldybder kan ikke sammenlignes direkte, for et dypere fjell gir
     slakere skjæring og dermed bredere rensk. */
  {
    const pr = M.beregnTverrprofil({
      linje, terreng: { z: () => 100 }, mal: M.StandardMal,
      fjell: new M.Fjellmodell({ standarddybde: 5 }), s: 50, vegnivaa: 96, utvidelse: 0,
      tverrfall: { venstre: 0.05, hoyre: 0.05 }, integrasjonssteg: 0.1
    });
    const bredde = (pr.fotHoyre - pr.fotVenstre) + 2 * M.StandardMal.renskUtenfor;
    sjekk('med fjellet dypt er rensken dybde ganger bredde',
      pr.areal.rensk, M.StandardMal.renskDybde * bredde, 0.01);
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
    P: { navn: 'Prøvevei «test»', vip: vp.vip, mal: M.StandardMal, fjell: { punkter: [] } },
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
  paastand('anførselstegn i prosjektnavnet blir escapet', !/name="[^"]*«/.test(xml)
    || xml.includes('&quot;') || !xml.includes('name="Prøvevei "'));

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
  paastand('DXF legger fotavtrykket i sin egen kote, ikke på null', (() => {
    const b = fotBlokk(Eksport.dxf(app, res));
    const z = b && b.filter(p => p[0] === '30').map(p => Number(p[1]));
    return !!z && z.length > 4 && z.every(v => Math.abs(v - 100) < 30);
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

  for (const [navn, tekst] of [['KOF', kof], ['LandXML', xml], ['SOSI', sos], ['DXF', dxf]]) {
    paastand(`${navn} inneholder verken NaN eller undefined`,
      !/NaN|undefined|Infinity/.test(tekst));
  }
}

/* ------------------------------------------------------------------ */
console.log('\n4e. Fjellflaten på tvers av snittet');
{
  const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
  const mal = Object.assign({}, M.StandardMal, { maksSokebredde: 40 });
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
    mal: {
      vegbredde: 4.5, tverrfallType: 'tak', tverrfall: 0.05,
      breddeIKurve: [], ensidigUnderRadius: 0, maksSokebredde: 60,
      skjaeringLosmasse: 1.5, fylling: 1.5, renskDybde: 0.2
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

  for (const tom of [null, '']) {
    const r = med({ fjell: new M.Fjellmodell({ standarddybde: tom }) });
    paastand(`fjelldybde ${JSON.stringify(tom)} gir ikke fjell i dagen`,
      r.merknader.some(m => m.type === 'inngang' && /fjell/i.test(m.tekst))
      && r.sum.skjaeringFjell < r.sum.skjaering * 0.99,
      `fjell ${r.sum.skjaeringFjell.toFixed(0)} av ${r.sum.skjaering.toFixed(0)}`);
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
    paastand('v-kurven bøyer av fra korden', Math.max(...v.map(p => p.y)) > 20);
    paastand('y-kurven bøyer av fra korden', Math.max(...y.map(p => p.y)) > 20);
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
  } catch (e) {
    /* Bare nettfeil er en gyldig grunn til a hoppe over. Alt annet er en feil
       i prøven eller i koden, og skal telle - ellers rapporterer denne
       seksjonen «0 feil» uansett hva som gikk galt. */
    const nettfeil = /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|fetch failed|getaddrinfo/i.test(
      e.message + ' ' + (e.code || ''));
    if (nettfeil) console.log('  HOPPET OVER (ingen nettforbindelse): ' + e.message);
    else paastand('seksjon 8 kom seg gjennom', false, e.message);
  }

  console.log(`\n${ok} tester ok, ${feil} feil\n`);
  process.exit(feil ? 1 : 0);
})();
