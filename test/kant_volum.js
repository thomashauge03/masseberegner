'use strict';
/* Uavhengig kontroll av volumet i tomtemodus. Fasit regnet for hand. */
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');

function nullmal(o) {
  return Object.assign({
    skjaeringLosmasse: 2.5, skjaeringFjell: 0.2, fylling: 2.0,
    veggHelning: 0.1, losmasseOverFjell: 2.0,
    matjordDybde: 0, renskDybde: 0, frostsikring: 0, forsterkningslag: 0,
    baerelagTykkelse: 0, slitelagTykkelse: 0, avrettingslag: 0,
    overberg: 0, minAvstandTilBerg: 0,
    maksFyllingshoyde: 0, maksSkjaeringsdybde: 0, maksVeggHoyde: 0,
    rutestorrelse: 1, maksSokebredde: 45
  }, o || {});
}

function rekt(x0, y0, b, h) {
  return [{ x: x0, y: y0 }, { x: x0 + b, y: y0 }, { x: x0 + b, y: y0 + h }, { x: x0, y: y0 + h }];
}

function kjor(o) {
  return TM.beregnTomtemasser({
    tomt: o.tomt, mal: o.mal, terreng: { z: o.z }, fjell: { dybde: o.dybde || (() => 1000) },
    rutestorrelse: o.rute || 1, bakkefaktor: 1
  });
}

const rader = [];
function sjekk(navn, fasit, faktisk, felt) {
  const avvik = fasit === 0 ? (Math.abs(faktisk) < 1e-6 ? 0 : Infinity)
    : (faktisk - fasit) / fasit * 100;
  rader.push({ navn, felt, fasit, faktisk, avvik });
  const flagg = Math.abs(avvik) > 1 ? '  <-- AVVIK' : '';
  console.log(`${navn} | ${felt}: fasit ${fasit.toFixed(2)}  program ${faktisk.toFixed(2)}  avvik ${avvik.toFixed(2)} %${flagg}`);
}

const PI = Math.PI;

/* ---------- 1. Flatt terreng, flatt niva, ren skjaering ---------- */
{
  const B = 40, H = 40, dyp = 2, m = 2.5;
  const r = kjor({ tomt: { punkter: rekt(0, 0, B, H), kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal(), z: () => 100 });
  const inne = B * H * dyp;
  const kant = 0.5 * dyp * (dyp * m) * (2 * B + 2 * H);
  const hjorne = (1 / 3) * PI * Math.pow(dyp * m, 2) * dyp;
  sjekk('1 flat skjaering', inne + kant + hjorne, r.sum.skjaering, 'skjaering');
  console.log(`   (inne ${inne}  kanter ${kant.toFixed(1)}  hjorner ${hjorne.toFixed(1)})  areal ${r.areal}`);
}

/* ---------- 2. Ren fylling ---------- */
{
  const B = 40, H = 40, hoy = 2, m = 2.0;
  const r = kjor({ tomt: { punkter: rekt(0, 0, B, H), kanter: [], nivaa: { modus: 'flat', kote: 100 + hoy } },
    mal: nullmal(), z: () => 100 });
  const inne = B * H * hoy;
  const kant = 0.5 * hoy * (hoy * m) * (2 * B + 2 * H);
  const hjorne = (1 / 3) * PI * Math.pow(hoy * m, 2) * hoy;
  sjekk('2 ren fylling', inne + kant + hjorne, r.sum.fylling, 'fylling');
}

/* ---------- 3. Niva akkurat i terrengoverflaten -> alt null ---------- */
{
  const r = kjor({ tomt: { punkter: rekt(0, 0, 40, 40), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal: nullmal(), z: () => 100 });
  console.log(`3 niva = terreng: skjaering ${r.sum.skjaering}  fylling ${r.sum.fylling}  celler ${r.celler}`);
  sjekk('3 niva=terreng', 0, r.sum.skjaering + r.sum.fylling, 'sum');
}

/* ---------- 4. Skratt terreng (plan), halvt skjaering / halvt fylling ---------- */
{
  /* Terreng z = 100 + 0.05*(x-20) over 40x40 fra x=0..40, niva 100.
     Inne: integral |0.05(x-20)| dx dy = 40 * 2 * (0.05*20*20/2) = 40*2*10 = 800
     skjaering = fylling = 400 hver. */
  const z = (x) => 100 + 0.05 * (x - 20);
  const r = kjor({ tomt: { punkter: rekt(0, 0, 40, 40), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal: nullmal(), z: (x) => z(x) });
  // bare innenfor: summer rutenettet
  let innSkj = 0, innFyl = 0;
  for (const c of r.rutenett) if (c.inne) { if (c.d > 0) innSkj += c.d; else innFyl += -c.d; }
  sjekk('4 skratt terreng inne skj', 400, innSkj, 'skjaering inne');
  sjekk('4 skratt terreng inne fyll', 400, innFyl, 'fylling inne');
}

/* ---------- 5. Trappetrinn i terrenget ---------- */
{
  /* z = 102 for x < 20, 100 for x >= 20. Niva 100.
     Inne: venstre halvdel 20*40*2 = 1600 skjaering, hoyre halvdel 0. */
  const r = kjor({ tomt: { punkter: rekt(0, 0, 40, 40), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal: nullmal(), z: (x) => (x < 20 ? 102 : 100) });
  let innSkj = 0;
  for (const c of r.rutenett) if (c.inne && c.d > 0) innSkj += c.d;
  sjekk('5 trapp inne', 1600, innSkj, 'skjaering inne');
}

/* ---------- 6. Kjegleformet terreng ---------- */
{
  /* Kjegle: z = 100 + max(0, 10 - 0.5*rad) med topp i (0,0)? Enklere:
     sirkulaer tomt er vanskelig; bruk kjegle med senter i tomtesenter.
     z = 100 + 4 - 0.2*r, altsa toppen 104 i senter, faller 0.2/m.
     Niva 100. Tomt: kvadrat 40x40 sentrert i (0,0), fra -20..20.
     Inne-volum = integral over kvadratet av (4 - 0.2*r) der positivt.
     4 - 0.2r > 0 for r < 20. Kvadratets hjorne har r = 28.28 > 20, sa
     kjeglen er helt inne i kvadratet (sirkel r=20 tangerer kantene).
     Volum = kjegle med radius 20, hoyde 4 = (1/3)*pi*400*4 = 1675.516 */
  const z = (x, y) => 100 + Math.max(0, 4 - 0.2 * Math.hypot(x, y));
  const r = kjor({ tomt: { punkter: rekt(-20, -20, 40, 40), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal: nullmal(), z });
  let innSkj = 0;
  for (const c of r.rutenett) if (c.inne && c.d > 0) innSkj += c.d;
  sjekk('6 kjegle inne', (1 / 3) * PI * 400 * 4, innSkj, 'skjaering inne');
}

/* ---------- 7. Fjell pa kjent dybde: skjaeringen skal deles ---------- */
{
  /* Flatt terreng 100, fjell 1.5 m ned (zFjell = 98.5), niva 97 -> dyp 3.
     Inne 40x40: los = 1.5*1600 = 2400, fjell = 1.5*1600 = 2400. */
  const r = kjor({ tomt: { punkter: rekt(0, 0, 40, 40), kanter: [], nivaa: { modus: 'flat', kote: 97 } },
    mal: nullmal(), z: () => 100, dybde: () => 1.5 });
  let los = 0, fj = 0;
  for (const c of r.rutenett) if (c.inne) { fj += c.fjell; los += c.d - c.fjell; }
  sjekk('7 fjell inne los', 2400, los, 'losmasse inne');
  sjekk('7 fjell inne fjell', 2400, fj, 'fjell inne');
  console.log(`   totalt: skjaering ${r.sum.skjaering.toFixed(1)} fjell ${r.sum.skjaeringFjell.toFixed(1)} los ${r.sum.skjaeringLosmasse.toFixed(1)}`);
}

/* ---------- 8. Skraningen treffer akkurat sokebreddegrensen ---------- */
{
  /* dyp 4 m, helning 2.5 -> 10 m ut. maksSokebredde = 10.
     Fasit som i sak 1: inne + kant + hjorne. */
  const B = 30, dyp = 4, m = 2.5;
  const r = kjor({ tomt: { punkter: rekt(0, 0, B, B), kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal({ maksSokebredde: 10 }), z: () => 100 });
  const fasit = B * B * dyp + 0.5 * dyp * (dyp * m) * 4 * B + (1 / 3) * PI * Math.pow(dyp * m, 2) * dyp;
  sjekk('8 sokebredde=utslag', fasit, r.sum.skjaering, 'skjaering');
}

/* ---------- 9. Samme, men sokebredde for smal (avkuttet) ---------- */
{
  const B = 30, dyp = 4, m = 2.5, sok = 5;
  const r = kjor({ tomt: { punkter: rekt(0, 0, B, B), kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal({ maksSokebredde: sok }), z: () => 100 });
  /* Kant: trapes fra d=0 (hoyde 4) til d=5 (hoyde 4-5/2.5=2): (4+2)/2*5 = 15 m2
     Hjorne: rotasjon av samme profil om hjornepunktet, Pappus/skiver:
     V = integral_0^5 2*pi*... nei - kvart-kjegle-stubb: 4 hjorner = full
     rotasjonslegeme: integral_0^5 (4 - d/2.5) * 2*pi*d dd */
  let hj = 0; const N = 200000;
  for (let i = 0; i < N; i++) { const d = (i + 0.5) * sok / N; hj += (dyp - d / m) * 2 * PI * d * (sok / N); }
  const fasit = B * B * dyp + 15 * 4 * B + hj;
  sjekk('9 avkuttet skraning', fasit, r.sum.skjaering, 'skjaering');
}

/* ---------- 10. Byggegrop med fjellvegg pa alle kanter ---------- */
{
  /* Flatt 100, fjell ved 100 (dybde 0), niva 96 -> 4 m ren fjellskjaering.
     Vegg 0.1 -> 0.4 m ut. Inne 20x20 = 1600 m3.
     Kant: 0.5*4*0.4*4*20 = 64. Hjorne: (1/3)*pi*0.16*4 = 0.67 */
  const B = 20, dyp = 4, m = 0.1;
  const kanter = [0, 1, 2, 3].map(() => ({ type: 'fjellvegg' }));
  const r = kjor({ tomt: { punkter: rekt(0, 0, B, B), kanter, nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal(), z: () => 100, dybde: () => 0 });
  const fasit = B * B * dyp + 0.5 * dyp * (dyp * m) * 4 * B + (1 / 3) * PI * Math.pow(dyp * m, 2) * dyp;
  sjekk('10 fjellvegg', fasit, r.sum.skjaering, 'skjaering');
}

/* ---------- 11. Finere rutenett: konvergerer det? ---------- */
{
  const B = 40, dyp = 2, m = 2.5;
  const fasit = B * B * dyp + 0.5 * dyp * (dyp * m) * 4 * B + (1 / 3) * PI * Math.pow(dyp * m, 2) * dyp;
  for (const rute of [1, 0.5, 0.25]) {
    const r = kjor({ tomt: { punkter: rekt(0, 0, B, B), kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
      mal: nullmal(), z: () => 100, rute });
    console.log(`11 rute ${rute}: program ${r.sum.skjaering.toFixed(1)}  fasit ${fasit.toFixed(1)}  avvik ${((r.sum.skjaering - fasit) / fasit * 100).toFixed(2)} %`);
  }
}

console.log('\n--- avvik over 1 % ---');
for (const r of rader) if (Math.abs(r.avvik) > 1) console.log(`${r.navn} (${r.felt}): fasit ${r.fasit.toFixed(2)} program ${r.faktisk.toFixed(2)} avvik ${r.avvik.toFixed(2)} %`);
