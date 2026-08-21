'use strict';
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

console.log('metrikk: restavvik i rapporten ved kota koden finner, delt pa den STORSTE');
console.log('massestrommen i samme rapport (max av tilgjengelig og fylling).\n');
let verstAbs = {v:0}, verstRel = {v:0}, verstKote = {v:0};
let n=0;
for (const B of [12, 20, 30])
for (const fall of [0, 1/20, 1/8, 1/4, 1/2])
for (const bergdyp of [0, 2, 8])
for (const kanter of [[], veggK])
for (const brukerRute of [0.25, 0.5]) {
  const o = { punkter: rekt(0,0,B,B), kanter, mal: mal(), z:(x)=>100+x*fall, dybde:()=>bergdyp };
  const start = 100 + B*fall/2;
  const kA = sok(o, start, Math.max(1, brukerRute)), kB = sok(o, start, brukerRute);
  if (kA==null||kB==null) continue; n++;
  const s = kjor(o, kA, brukerRute).sum;
  const avvik = bal(s);
  const stromning = Math.max(s.fylling, s.skjaeringFjell*0.9 + s.skjaeringLosmasse*0.665, 1);
  const rel = Math.abs(avvik)/stromning*100, kf = Math.abs(kA-kB);
  const merk = `B=${B} fall=1:${fall?Math.round(1/fall):'0'} berg=${bergdyp}m ${kanter.length?'sprengt vegg':'skraning'} rute=${brukerRute}`;
  if (Math.abs(avvik) > verstAbs.v) verstAbs = {v:Math.abs(avvik), merk, kA, kB, stromning, rel};
  if (rel > verstRel.v) verstRel = {v:rel, merk, kA, kB, avvik, stromning};
  if (kf > verstKote.v) verstKote = {v:kf, merk, kA, kB, avvik, stromning, rel};
}
console.log(`${n} oppsett med en reell balansekote.\n`);
console.log(`STORST ABSOLUTT restavvik : ${verstAbs.v.toFixed(1)} m3  av ${verstAbs.stromning.toFixed(0)} m3 (${verstAbs.rel.toFixed(2)} %)`);
console.log(`   ${verstAbs.merk}   kote ${verstAbs.kA} mot ${verstAbs.kB}`);
console.log(`STORST RELATIVT restavvik : ${verstRel.v.toFixed(2)} %  (${verstRel.avvik.toFixed(1)} m3 av ${verstRel.stromning.toFixed(0)} m3)`);
console.log(`   ${verstRel.merk}   kote ${verstRel.kA} mot ${verstRel.kB}`);
console.log(`STORST KOTEFEIL           : ${verstKote.v.toFixed(3)} m  (restavvik ${verstKote.avvik.toFixed(1)} m3 = ${verstKote.rel.toFixed(2)} %)`);
console.log(`   ${verstKote.merk}   kote ${verstKote.kA} mot ${verstKote.kB}`);

console.log('\n--- Hvor mye av restavviket skyldes Math.max(1,...), og hvor mye er');
console.log('--- ren halveringsopplosning? Sammenlikn med det KONSISTENTE soket:');
{
  const o = { punkter: rekt(0,0,30,30), kanter: veggK, mal: mal(), z:(x)=>100+x/4, dybde:()=>2 };
  for (const r of [0.25, 0.5, 1]) {
    const kA = sok(o, 103.75, Math.max(1,r)), kB = sok(o, 103.75, r);
    const aA = bal(kjor(o,kA,r).sum), aB = bal(kjor(o,kB,r).sum);
    console.log(`  rute ${r}: koden i dag kote ${kA} -> avvik ${aA.toFixed(1)} m3 | konsistent kote ${kB} -> avvik ${aB.toFixed(1)} m3`);
  }
}
