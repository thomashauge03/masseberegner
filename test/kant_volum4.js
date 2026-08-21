'use strict';
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');
const Tomt = require('C:/Users/thoma/massekalk/public/js/tomt.js');
const PI = Math.PI;
const mal = o => Object.assign({}, Tomt.StandardTomtemal, o || {});
const kjor = o => TM.beregnTomtemasser({
  tomt: o.tomt, mal: o.mal, terreng: { z: o.z }, fjell: { dybde: o.dybde || (() => 1000) },
  rutestorrelse: o.rute || 1, bakkefaktor: 1 });
const rekt = (x0,y0,b,h) => [{x:x0,y:y0},{x:x0+b,y:y0},{x:x0+b,y:y0+h},{x:x0,y:y0+h}];

// tomtebalanse kopiert ordrett fra app.js (linje 1313-1337)
const F = { fjellIFylling: 0.9, brukbarLosmasse: 0.7, losmasseIFylling: 0.95, sprengningsfaktor: 1.5 };
function tomtebalanse(s, f) {
  f = f || F;
  const fjellFast = s.skjaeringFjell, losFast = s.skjaeringLosmasse, fyllingBehov = s.fylling;
  const overbygningBehov = s.slitelag + s.baerelag + s.forsterkningslag + s.frostsikring + s.avrettingslag;
  const fraFjell = fjellFast * f.fjellIFylling;
  const brukbarLos = losFast * f.brukbarLosmasse * f.losmasseIFylling;
  const tilgjengelig = fraFjell + brukbarLos;
  return { tilgjengelig, balanse: tilgjengelig - fyllingBehov,
    tilDeponi: s.matjord + s.rensk + losFast * (1 - f.brukbarLosmasse) };
}

console.log('=== Q. Realistisk tomt: hva blir konsekvensen av dobbelttellingen? ===');
{
  // 50 x 70 m tomt, terreng flatt 100, ferdig kote 98, berg 6 m ned, standardmal
  const m = mal();
  const r = kjor({ tomt: { punkter: rekt(0,0,50,70), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal: m, z: () => 100, dybde: () => 6 });
  const s = r.sum, b = tomtebalanse(s);
  console.log(`   areal ${r.areal} m2, areal med skraning ${r.arealMedSkraning} m2`);
  console.log(`   skjaering ${s.skjaering.toFixed(0)}  losmasse ${s.skjaeringLosmasse.toFixed(0)}  fjell ${s.skjaeringFjell.toFixed(0)}  fylling ${s.fylling.toFixed(0)}`);
  console.log(`   matjord ${s.matjord.toFixed(0)}  rensk ${s.rensk.toFixed(0)}   (berget rores aldri - rensk skal vaere 0)`);
  console.log(`   PROGRAM: tilDeponi ${b.tilDeponi.toFixed(0)} m3, brukbar til fylling ${b.tilgjengelig.toFixed(0)} m3`);
  // riktig regnestykke: matjord og rensk er en DEL av losmassen
  const losUtenTopp = s.skjaeringLosmasse - s.matjord;   // rensk skal vaere 0 her
  const b2 = tomtebalanse(Object.assign({}, s, { skjaeringLosmasse: losUtenTopp, rensk: 0 }));
  console.log(`   RIKTIG:  tilDeponi ${b2.tilDeponi.toFixed(0)} m3, brukbar til fylling ${b2.tilgjengelig.toFixed(0)} m3`);
  console.log(`   avvik deponi ${((b.tilDeponi-b2.tilDeponi)/b2.tilDeponi*100).toFixed(1)} %,  avvik brukbar ${((b.tilgjengelig-b2.tilgjengelig)/b2.tilgjengelig*100).toFixed(1)} %`);
  console.log(`   sum bokfoert oppgravd: ${(s.skjaering + s.matjord + s.rensk).toFixed(0)} m3 mot faktisk hull ${s.skjaering.toFixed(0)} m3`);
}

console.log('\n=== R. Sprengt vegg: 1 m rutenett mister veggvolumet ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  const kanter = [0,1,2,3].map(() => ({ type: 'fjellvegg' }));
  for (const hoyde of [3, 6, 10]) {
    const B = 30;
    const a = kjor({ tomt: { punkter: rekt(0,0,B,B), kanter, nivaa: { modus:'flat', kote: 100-hoyde } },
      mal: m, z: () => 100, dybde: () => 0, rute: 1 });
    const b = kjor({ tomt: { punkter: rekt(0,0,B,B), kanter, nivaa: { modus:'flat', kote: 100-hoyde } },
      mal: m, z: () => 100, dybde: () => 0, rute: 0.1 });
    const W = hoyde * 0.1;
    const fasit = B*B*hoyde + hoyde*(4*B)*W/2 + PI*hoyde*W*W/3;
    console.log(`   vegg ${hoyde} m: rute 1 -> ${a.sum.skjaering.toFixed(1)}   rute 0.1 -> ${b.sum.skjaering.toFixed(1)}   fasit ${fasit.toFixed(1)}   avvik(rute 1) ${((a.sum.skjaering-fasit)/fasit*100).toFixed(2)} %`);
  }
}

console.log('\n=== S. Fjellskjaering (ikke vegg) med standardhelning 0.2 og 1 m rutenett ===');
{
  const m = mal({ matjordDybde: 0, renskDybde: 0, forsterkningslag: 0, baerelagTykkelse: 0,
    slitelagTykkelse: 0, frostsikring: 0, avrettingslag: 0 });
  // fjell i dagen, ren fjellskjaering, helning 0.2 -> W = 0.2*h
  for (const hoyde of [2, 4, 8]) {
    const B = 30, W = hoyde*0.2;
    const a = kjor({ tomt:{punkter:rekt(0,0,B,B),kanter:[],nivaa:{modus:'flat',kote:100-hoyde}}, mal:m, z:()=>100, dybde:()=>0, rute:1 });
    const b = kjor({ tomt:{punkter:rekt(0,0,B,B),kanter:[],nivaa:{modus:'flat',kote:100-hoyde}}, mal:m, z:()=>100, dybde:()=>0, rute:0.1 });
    const fasit = B*B*hoyde + hoyde*(4*B)*W/2 + PI*hoyde*W*W/3;
    console.log(`   ${hoyde} m fjell: rute 1 -> ${a.sum.skjaering.toFixed(1)}  rute 0.1 -> ${b.sum.skjaering.toFixed(1)}  fasit ${fasit.toFixed(1)}  avvik(rute 1) ${((a.sum.skjaering-fasit)/fasit*100).toFixed(2)} %`);
  }
}

console.log('\n=== T. overberg: hva burde det vaere? ===');
{
  const m = mal({ matjordDybde:0, renskDybde:0, forsterkningslag:0, baerelagTykkelse:0,
    slitelagTykkelse:0, frostsikring:0, avrettingslag:0, overberg: 0.3 });
  const B = 20, dyp = 3, berg = 1;   // 2 m fjell under 1 m losmasse
  for (const rute of [1, 0.5, 0.25]) {
    const r = kjor({ tomt:{punkter:rekt(0,0,B,B),kanter:[],nivaa:{modus:'flat',kote:100-dyp}}, mal:m, z:()=>100, dybde:()=>berg, rute });
    console.log(`   rute ${rute}: overberg ${r.sum.overberg.toFixed(1)} "m3"  (fjellvolum ${r.sum.skjaeringFjell.toFixed(1)})`);
  }
  const konturareal = B*B + 4*B*(dyp-berg);
  console.log(`   FASIT ca: konturareal ${konturareal} m2 x 0.3 m = ${(konturareal*0.3).toFixed(0)} m3, og det skal IKKE endre seg med rutestorrelsen`);
  console.log(`   formelen i koden: mal.overberg [m] * cellA [m2] / ruteM [m] = m2, ikke m3`);
}
