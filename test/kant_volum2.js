'use strict';
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');
const PI = Math.PI;

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
function kjor(o) {
  return TM.beregnTomtemasser({
    tomt: o.tomt, mal: o.mal, terreng: { z: o.z }, fjell: { dybde: o.dybde || (() => 1000) },
    rutestorrelse: o.rute || 1, bakkefaktor: o.bf || 1
  });
}
function areal(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j].x * p[i].y - p[i].x * p[j].y; return Math.abs(a / 2); }
function omkrets(p) { let l = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) l += Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y); return l; }
function vis(navn, fasit, prog) {
  const av = fasit === 0 ? (Math.abs(prog) < 1e-6 ? 0 : Infinity) : (prog - fasit) / fasit * 100;
  console.log(`${navn}: fasit ${fasit.toFixed(2)}  program ${prog.toFixed(2)}  avvik ${av.toFixed(2)} %${Math.abs(av) > 1 ? '   <-- AVVIK' : ''}`);
  return av;
}

/* Steiner: for ETHVERT enkelt polygon er ytre skraningsvolum med lineaer
   profil h(d)=h0(1-d/W) lik  h0*P*W/2 + pi*h0*W^2/3.  (dA/dd = P + 2*pi*d) */
function skraningsFasit(P, h0, W) { return h0 * P * W / 2 + PI * h0 * W * W / 3; }

console.log('=== A. L-formet tomt (konkavt hjorne) ===');
{
  // L: 60x60 med 30x30 tatt bort i hjornet
  const p = [{x:0,y:0},{x:60,y:0},{x:60,y:30},{x:30,y:30},{x:30,y:60},{x:0,y:60}];
  const dyp = 2, m = 2.5, W = dyp * m;
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal(), z: () => 100 });
  const A = areal(p), P = omkrets(p);
  const fasit = A * dyp + skraningsFasit(P, dyp, W);
  console.log(`   areal ${A}  omkrets ${P}  program-areal ${r.areal}`);
  vis('A L-form skjaering', fasit, r.sum.skjaering);
}

console.log('\n=== B. Trekant ===');
{
  const p = [{x:0,y:0},{x:60,y:0},{x:0,y:60}];
  const dyp = 2, W = dyp * 2.5;
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal(), z: () => 100 });
  const A = areal(p), P = omkrets(p);
  vis('B trekant skjaering', A * dyp + skraningsFasit(P, dyp, W), r.sum.skjaering);
  console.log(`   fasit areal ${A}  program areal ${r.areal.toFixed(1)}`);
}

console.log('\n=== C. Kvadrat rotert 45 grader ===');
{
  const s = 40 / Math.SQRT2 * Math.SQRT2; // side 40, rotert
  const c = 40 / Math.SQRT2;
  const p = [{x:c,y:0},{x:2*c,y:c},{x:c,y:2*c},{x:0,y:c}];
  const dyp = 2, W = 5;
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 100 - dyp } },
    mal: nullmal(), z: () => 100 });
  const A = areal(p), P = omkrets(p);
  console.log(`   fasit areal ${A.toFixed(1)}  program areal ${r.areal.toFixed(1)}`);
  vis('C rotert kvadrat', A * dyp + skraningsFasit(P, dyp, W), r.sum.skjaering);
}

console.log('\n=== D. Fallplan: middeldybde = dybde i tyngdepunktet ===');
{
  const p = [{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'fall', kote: 96, fall: 0.03, fallretning: 45 } },
    mal: nullmal(), z: () => 100 });
  let inn = 0, n = 0;
  for (const c of r.rutenett) if (c.inne) { inn += c.d; n++; }
  vis('D fallplan inne', 2400 * 4, inn);
  console.log(`   celler inne ${n}`);
}

console.log('\n=== E. rensk uten at berget nas ===');
{
  // berg 5 m nede, skjaering bare 1 m -> ingen fjelluttak -> rensk skal vaere 0
  const p = [{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 99 } },
    mal: nullmal({ renskDybde: 0.2 }), z: () => 100, dybde: () => 5 });
  console.log(`   skjaeringFjell ${r.sum.skjaeringFjell.toFixed(1)} m3   rensk ${r.sum.rensk.toFixed(1)} m3`);
  console.log(`   FASIT rensk = 0 (berget rores ikke)`);
}

console.log('\n=== F. overberg: avhenger av rutestorrelsen? ===');
{
  const p = [{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  for (const rute of [1, 0.5, 0.25]) {
    const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 97 } },
      mal: nullmal({ overberg: 0.3 }), z: () => 100, dybde: () => 1, rute });
    console.log(`   rute ${rute} m: skjaeringFjell ${r.sum.skjaeringFjell.toFixed(1)}  overberg ${r.sum.overberg.toFixed(1)} "m3"`);
  }
}

console.log('\n=== G. fjellvegg og rutestorrelse ===');
{
  const p = [{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  const dyp = 4, m = 0.1;
  const kanter = [0,1,2,3].map(() => ({ type: 'fjellvegg' }));
  const fasit = 400 * dyp + skraningsFasit(80, dyp, dyp * m);
  for (const rute of [1, 0.5, 0.25, 0.1]) {
    const r = kjor({ tomt: { punkter: p, kanter, nivaa: { modus: 'flat', kote: 100 - dyp } },
      mal: nullmal(), z: () => 100, dybde: () => 0, rute });
    console.log(`   rute ${rute}: program ${r.sum.skjaering.toFixed(1)}  fasit ${fasit.toFixed(1)}  avvik ${((r.sum.skjaering-fasit)/fasit*100).toFixed(2)} %`);
  }
}

console.log('\n=== H. bakkefaktor ===');
{
  const p = [{x:0,y:0},{x:40,y:0},{x:40,y:40},{x:0,y:40}];
  const a = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 98 } }, mal: nullmal(), z: () => 100 });
  const b = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 98 } }, mal: nullmal(), z: () => 100, bf: 1.02 });
  console.log(`   bf=1: ${a.sum.skjaering.toFixed(1)}   bf=1.02: ${b.sum.skjaering.toFixed(1)}   forhold ${(b.sum.skjaering/a.sum.skjaering).toFixed(5)} (venter 1.0404)`);
}

console.log('\n=== I. matjord vs skjaering: dobbelttelling? ===');
{
  const p = [{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  const r = kjor({ tomt: { punkter: p, kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal: nullmal({ matjordDybde: 0.25 }), z: () => 100 });
  console.log(`   skjaering ${r.sum.skjaering.toFixed(1)}  matjord ${r.sum.matjord.toFixed(1)}  arealMedSkraning ${r.arealMedSkraning.toFixed(0)}`);
}
