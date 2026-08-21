'use strict';
/* Bredt søk: finnes det I DET HELE TATT et oppsett der Math.max(1, rute) i
   balanserTomt flytter balansekoten merkbart, eller der restavviket i
   rapporten blir stort? */
const TM = require('C:/Users/thoma/massekalk/public/js/tomtmasser.js');
const Tomt = require('C:/Users/thoma/massekalk/public/js/tomt.js');
const mal = o => Object.assign({}, Tomt.StandardTomtemal, o || {});
const rekt = (x0,y0,b,h) => [{x:x0,y:y0},{x:x0+b,y:y0},{x:x0+b,y:y0+h},{x:x0,y:y0+h}];
const F = { fjellIFylling:0.9, brukbarLosmasse:0.7, losmasseIFylling:0.95 };
const bal = s => s.skjaeringFjell*F.fjellIFylling + s.skjaeringLosmasse*F.brukbarLosmasse*F.losmasseIFylling - s.fylling;
const kjor = (o,kote,rute) => TM.beregnTomtemasser({
  tomt:{punkter:o.punkter,kanter:o.kanter,nivaa:{modus:'flat',kote}},
  mal:o.mal, terreng:{z:o.z}, fjell:{dybde:o.dybde}, rutestorrelse:rute, bakkefaktor:1});

function sok(o, start, rute) {
  const m = k => bal(kjor(o,k,rute).sum);
  let lav=start-30, hoy=start+30;
  if (!(m(lav)>0 && m(hoy)<0)) return null;
  for (let i=0;i<24;i++){ const mid=(lav+hoy)/2; if (m(mid)>0) lav=mid; else hoy=mid; }
  return +((lav+hoy)/2).toFixed(2);
}

const veggK = [0,1,2,3].map(()=>({type:'fjellvegg'}));
let verste = { koteFeil:0 }, versteAndel = { andel:0 };
let n = 0;

for (const B of [12, 20, 30, 50, 80])
for (const fall of [0, 1/20, 1/8, 1/4, 1/2])
for (const bergdyp of [0, 0.5, 2, 5, 12])
for (const kanter of [[], veggK])
for (const brukerRute of [0.25, 0.5]) {
  const o = { punkter: rekt(0,0,B,B), kanter, mal: mal(),
    z: (x,y) => 100 + x*fall, dybde: () => bergdyp };
  const start = 100 + B*fall/2;
  const kA = sok(o, start, Math.max(1, brukerRute));   // koden i dag
  const kB = sok(o, start, brukerRute);                // konsistent
  if (kA == null || kB == null) continue;
  n++;
  const rA = kjor(o, kA, brukerRute).sum;              // rapporten ved kode-kota
  const avvik = bal(rA);
  const fyll = Math.max(1, rA.fylling);
  const andel = Math.abs(avvik)/fyll*100;
  const kf = Math.abs(kA-kB);
  const merk = `B=${B} fall=${fall.toFixed(3)} berg=${bergdyp} ${kanter.length?'vegg':'skran'} rute=${brukerRute}`;
  if (kf > verste.koteFeil) verste = { koteFeil:kf, merk, kA, kB, avvik, fyll, andel };
  if (andel > versteAndel.andel) versteAndel = { andel, merk, kA, kB, avvik, fyll, koteFeil:kf };
}

console.log(`Prøvde ${n} oppsett der det finnes en balansekote.\n`);
console.log('Størst KOTEFEIL (kote fra koden i dag mot kote med samme rute):');
console.log(`  ${verste.merk}`);
console.log(`  kote i dag ${verste.kA}  mot  konsistent ${verste.kB}   -> feil ${verste.koteFeil.toFixed(3)} m`);
console.log(`  restavvik i rapporten ${verste.avvik.toFixed(1)} m3 av ${verste.fyll.toFixed(0)} m3 fylling (${verste.andel.toFixed(2)} %)\n`);
console.log('Størst RESTAVVIK som andel av fyllingsbehovet:');
console.log(`  ${versteAndel.merk}`);
console.log(`  kote i dag ${versteAndel.kA}  mot  konsistent ${versteAndel.kB}   -> feil ${versteAndel.koteFeil.toFixed(3)} m`);
console.log(`  restavvik ${versteAndel.avvik.toFixed(1)} m3 av ${versteAndel.fyll.toFixed(0)} m3 fylling (${versteAndel.andel.toFixed(2)} %)`);

/* Til sammenlikning: hvor mye endrer selve VOLUMET seg mellom rute 1 og 0.25? */
console.log('\nTil sammenlikning, ren oppløsningsforskjell i volumet ved fast kote:');
{
  const o = { punkter: rekt(0,0,30,30), kanter: veggK, mal: mal(), z:()=>100, dybde:()=>0 };
  for (const r of [1,0.5,0.25,0.1]) {
    const s = kjor(o, 96, r).sum;
    console.log(`  rute ${r}: fjell ${s.skjaeringFjell.toFixed(1)}  fylling ${s.fylling.toFixed(1)}`);
  }
}
