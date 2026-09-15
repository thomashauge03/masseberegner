'use strict';
/**
 * Lager et demoprosjekt pa virkelig terreng ved Ydestad i Lyngdal og kjører
 * hele beregningen utenfor nettleseren. Brukes til a kontrollere at kjeden
 * terrengdata -> linjeføring -> lengdeprofil -> masser henger sammen.
 *
 *   node test/demo-ydestad.js
 */

const fs = require('fs');
const path = require('path');

/* FILA PAASTO I SITT EGET FILHODE AT DEN KONTROLLERER NOE – uten en eneste
   paastand. Den skrev ut skjaering, fjell, fylling, baerelag og massebalanse og
   avsluttet med 0 uansett hvilke tall som kom ut. En fil i `test`-mappa som
   ikke kan bli roed er ikke en kontroll, den er en utskrift.

   Verre: linje 34 svelget ALLE nedlastingsfeil med en tom `catch`. Uten
   nettforbindelse fikk den null terrengfliser, regnet massene paa et terreng
   som ikke fantes, skrev ut tallene i pen tabell og lagret demoprosjektet.

   Naa telles flisene, og til slutt staar det paastander om kjeden fila sier at
   den kontrollerer. Kommer det ingen fliser i det hele tatt, sies det at
   proeven ble HOPPET OVER – det er noe annet enn at den gikk. */
const FLISER = { ok: 0, feil: 0, sisteFeil: null };
let feil = 0, ok = 0;
const sjekk = (navn, sant, detalj) => {
  if (sant) { ok++; console.log('  ok   ' + navn); }
  else { feil++; console.log('  FEIL ' + navn + (detalj ? '  ' + detalj : '')); }
};
const Geo = require('../public/js/geo.js');
const { Linjeforing } = require('../public/js/linjeforing.js');
const { Vertikalprofil, foreslaProfil } = require('../public/js/vertikalprofil.js');
const M = require('../public/js/masser.js');
const { hentFlis, pakkOpp } = require('../lib/hoydedata.js');

/* --- Terrengmodell for Node (samme oppslag som i nettleseren) --- */
class NodeTerreng {
  constructor(sone) { this.sone = sone; this.sr = Geo.epsg(sone); this.fliser = new Map(); }
  async last(linje, halvbredde) {
    const trengs = new Set();
    for (let s = 0; s <= linje.lengde; s += 8) {
      const p = linje.punktVed(Math.min(s, linje.lengde));
      const nx = Math.sin(p.retning), ny = -Math.cos(p.retning);
      for (let t = -halvbredde; t <= halvbredde; t += 16) {
        trengs.add(Math.floor((p.x + nx * t) / 256) + '_' + Math.floor((p.y + ny * t) / 256));
      }
    }
    for (const k of trengs) {
      const [tx, ty] = k.split('_').map(Number);
      try {
        this.fliser.set(k, pakkOpp(await hentFlis(this.sr, tx, ty, 1)).data);
        FLISER.ok++;
      } catch (e) { FLISER.feil++; FLISER.sisteFeil = e.message; }
    }
    return trengs.size;
  }
  _celle(gi, gj) {
    const tx = Math.floor(gi / 256), i = gi - tx * 256;
    const ty = Math.ceil(-gj / 256) - 1, j = gj + (ty + 1) * 256;
    const f = this.fliser.get(tx + '_' + ty);
    return f ? f[j * 256 + i] : NaN;
  }
  z(x, y) {
    const fx = x - 0.5, fy = -y - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), dx = fx - i0, dy = fy - j0;
    const a = this._celle(i0, j0), b = this._celle(i0 + 1, j0), c = this._celle(i0, j0 + 1), d = this._celle(i0 + 1, j0 + 1);
    if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) return NaN;
    return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
  }
}

(async () => {
  const sone = 32;
  // Skogsbilvei langs lia ovenfor Ydestad, om lag i høydekurvenes retning
  const ipUtm = [
    { x: 395010, y: 6463040, r: 0 },
    { x: 395100, y: 6463045, r: 60 },
    { x: 395190, y: 6463060, r: 60 },
    { x: 395270, y: 6463030, r: 30 },
    { x: 395350, y: 6463050, r: 60 },
    { x: 395430, y: 6463060, r: 0 }
  ];

  const linje = new Linjeforing(ipUtm);
  console.log(`Linjeføring: ${linje.lengde.toFixed(1)} m, ${linje.kurver.length} kurver`);
  linje.kurver.forEach(k => console.log(`  BC ${k.sBC.toFixed(0)} – EC ${k.sEC.toFixed(0)}   R = ${k.r.toFixed(1)} m`));
  linje.advarsler.forEach(a => console.log('  ! ' + a.tekst));

  const terreng = new NodeTerreng(sone);
  const mal = Object.assign({}, M.StandardMal);
  const antall = await terreng.last(linje, mal.maksSokebredde + 12);
  console.log(`Terrengfliser: ${antall}`);

  // Terrengprofil langs senterlinjen
  const st = [], zt = [];
  for (let s = 0; s <= linje.lengde; s += 2) {
    const p = linje.punktVed(Math.min(s, linje.lengde));
    st.push(Math.min(s, linje.lengde)); zt.push(terreng.z(p.x, p.y));
  }
  const gyldige = zt.filter(isFinite);
  console.log(`Terreng langs linja: ${Math.min(...gyldige).toFixed(1)} – ${Math.max(...gyldige).toFixed(1)} moh`);

  const vip = foreslaProfil(st, zt, {
    vipAvstand: 40, maksStigning: 0.20, k: 1,
    maksStigningVed: s => M.maksStigningFraRadius(mal, linje.radiusVed(s))
  });
  const profil = new Vertikalprofil(vip);
  console.log(`Lengdeprofil: ${vip.length} knekkpunkt, største stigning ${(profil.maksStigning(1) * 100).toFixed(1)} %`);

  const midt = linje.punktVed(linje.lengde / 2);
  const bf = Geo.bakkefaktor(midt.x, midt.y, sone, gyldige.reduce((a, b) => a + b, 0) / gyldige.length);

  const res = M.beregnMasser({
    linje, profil, terreng, mal,
    fjell: new M.Fjellmodell({ standarddybde: 0.5 }),
    faktorer: M.StandardFaktorer,
    profilAvstand: 5,
    bakkefaktor: bf
  });

  const t = v => Math.round(v).toLocaleString('nb-NO');
  console.log('\n--- Masser ---------------------------------------');
  console.log(`Veglengde                 ${res.lengde.toFixed(1)} m  (kartplan ${res.lengdeKart.toFixed(1)} m, faktor ${bf.toFixed(6)})`);
  console.log(`Rensk / avdekking         ${t(res.sum.rensk)} m³`);
  console.log(`Skjæring løsmasse         ${t(res.sum.skjaeringLosmasse)} p.f.m³`);
  console.log(`Skjæring fjell            ${t(res.sum.skjaeringFjell)} p.f.m³`);
  console.log(`Skjæring totalt           ${t(res.sum.skjaering)} p.f.m³`);
  console.log(`Fylling                   ${t(res.sum.fylling)} m³`);
  console.log(`Bærelag                   ${t(res.sum.baerelag)} m³`);
  console.log(`Slitelag                  ${t(res.sum.slitelag)} m³`);
  console.log(`Fylling + bærelag         ${t(res.sum.fylling + res.sum.baerelag)} p.a.m³`);
  console.log(`Massebalanse              ${res.balanse.balanse >= 0 ? 'overskudd' : 'mangel'} ${t(Math.abs(res.balanse.balanse))} m³`);
  console.log(`Merknader                 ${res.merknader.length}`);
  const typer = {};
  res.merknader.forEach(m => typer[m.type] = (typer[m.type] || 0) + 1);
  console.log('   ' + JSON.stringify(typer));

  console.log('\nProfil   R      Z_terr   Z_veg    skjær   fjell   fyll');
  for (const p of res.profiler.filter((_, i) => i % 8 === 0)) {
    console.log(
      String(p.s.toFixed(0)).padStart(6),
      (isFinite(p.radius) ? p.radius.toFixed(0) : '–').padStart(5),
      (isFinite(p.terrengSenter) ? p.terrengSenter.toFixed(2) : '–').padStart(9),
      p.vegnivaa.toFixed(2).padStart(8),
      p.areal.skjaering.toFixed(1).padStart(8),
      p.areal.skjaeringFjell.toFixed(1).padStart(7),
      p.areal.fylling.toFixed(1).padStart(7)
    );
  }

  // Lagre som demoprosjekt slik at det kan apnes i programmet
  const prosjekt = {
    navn: 'Ydestad demo',
    ip: ipUtm.map(p => { const g = Geo.fraUtm(p.x, p.y, sone); return { lat: +g.lat.toFixed(8), lon: +g.lon.toFixed(8), r: p.r }; }),
    vip: vip.map(v => ({ s: +v.s.toFixed(2), z: +v.z.toFixed(3), k: v.k })),
    standardRadius: 30,
    mal, faktorer: M.StandardFaktorer,
    fjell: { standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [] },
    profilAvstand: 5,
    bakkekorreksjon: true
  };
  // Demoprosjektet legges der programmet henter det første gang det apnes
  const ut = path.join(__dirname, '..', 'public', 'demo', 'ydestad-demo.json');
  fs.mkdirSync(path.dirname(ut), { recursive: true });
  fs.writeFileSync(ut, JSON.stringify(prosjekt, null, 1), 'utf8');
  console.log('\nDemoprosjekt lagret: ' + ut);

  /* ---- Kjeden fila sier at den kontrollerer ---------------------------- */
  console.log('\n--- Kontroll -------------------------------------');
  if (FLISER.ok === 0) {
    console.log('  HOPPET OVER: ingen terrengfliser kunne hentes'
      + (FLISER.sisteFeil ? ' (' + FLISER.sisteFeil + ')' : ''));
    console.log('  Uten terrengdata er det ingenting aa kontrollere.');
    process.exit(0);
  }
  sjekk('terrengfliser kom fram', FLISER.ok > 0,
    FLISER.ok + ' hentet, ' + FLISER.feil + ' feilet');

  /* TERRENGET MAA FAKTISK VAERE UNDER VEGEN. Uten dette kunne fila regne
     massene mot huller i hoeydemodellen og likevel se ferdig ut. */
  const medTerreng = res.profiler.filter(p => Number.isFinite(p.terrengSenter));
  sjekk('terrenget finnes under saa godt som hele linja',
    medTerreng.length > res.profiler.length * 0.95,
    medTerreng.length + ' av ' + res.profiler.length + ' profiler');
  const spennT = medTerreng.length
    ? Math.max(...medTerreng.map(p => p.terrengSenter)) - Math.min(...medTerreng.map(p => p.terrengSenter))
    : 0;
  sjekk('og det er ekte terreng, ikke en flate', spennT > 5,
    'hoeydespenn ' + spennT.toFixed(1) + ' m');

  /* KJEDEN: linjefoering -> lengdeprofil -> masser. Hvert ledd skal gi tall,
     og de skal henge sammen. */
  sjekk('linjefoeringen gir en lengde', res.lengde > 100, res.lengde.toFixed(1) + ' m');
  sjekk('bakkefaktoren er hentet fra terrenget, ikke 1',
    bf > 1.0000001 && bf < 1.2, bf.toFixed(6));
  for (const felt of ['rensk', 'skjaering', 'skjaeringFjell', 'fylling', 'baerelag', 'slitelag']) {
    sjekk('  ' + felt + ' er et tall', Number.isFinite(res.sum[felt]) && res.sum[felt] >= 0,
      String(res.sum[felt]));
  }
  sjekk('det er noe aa grave OG noe aa fylle',
    res.sum.skjaering > 100 && res.sum.fylling > 100,
    'skjaering ' + Math.round(res.sum.skjaering) + ', fylling ' + Math.round(res.sum.fylling));
  sjekk('skjaeringen er summen av loesmasse og fjell',
    Math.abs(res.sum.skjaering - (res.sum.skjaeringLosmasse + res.sum.skjaeringFjell)) < 1,
    res.sum.skjaering.toFixed(1) + ' mot '
    + (res.sum.skjaeringLosmasse + res.sum.skjaeringFjell).toFixed(1));
  sjekk('massebalansen er et tall', Number.isFinite(res.balanse.balanse),
    String(res.balanse.balanse));

  /* Og fila som ble skrevet skal vaere til aa aapne igjen. */
  const lest = JSON.parse(fs.readFileSync(ut, 'utf8'));
  sjekk('demoprosjektet lar seg lese tilbake',
    Array.isArray(lest.ip) && lest.ip.length === prosjekt.ip.length
    && Array.isArray(lest.vip) && lest.vip.length > 1,
    (lest.ip || []).length + ' knekkpunkt, ' + (lest.vip || []).length + ' vipper');

  console.log('\n' + ok + ' kontroller ok, ' + feil + ' feil');
  process.exit(feil ? 1 : 0);
})();
