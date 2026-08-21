'use strict';
/* Verste tilfellet fra sveipet, brutt ned: hvor mye av restavviket skyldes
   Math.max(1, rute), og hvor mye er gulvet fra at kota rundes til 1 cm? */
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

// verste tilfellet: B=30, fall 1:2, berg 8 m ned, sprengt vegg, rute 0.25
const o = { punkter: rekt(0,0,30,30), kanter: veggK, mal: mal(), z:(x)=>100+x/2, dybde:()=>8 };
const start = 107.5, r = 0.25;

const kA = sok(o, start, 1);   // slik koden gjor det (Math.max(1, 0.25) = 1)
const kB = sok(o, start, r);   // konsistent sok
console.log(`kote fra koden i dag : ${kA}`);
console.log(`kote med samme rute  : ${kB}`);
console.log(`kotefeil             : ${(kA-kB).toFixed(3)} m\n`);

const vis = (k, tekst) => {
  const s = kjor(o, k, r).sum;
  console.log(`  ${tekst}  kote ${k.toFixed(2)}: fylling ${s.fylling.toFixed(0)}  fjell ${s.skjaeringFjell.toFixed(0)}  los ${s.skjaeringLosmasse.toFixed(0)}  -> RESTAVVIK ${bal(s).toFixed(1)} m3`);
  return bal(s);
};
console.log('Rapporten (rute 0.25) evaluert i kotene rundt:');
const aA = vis(kA, 'koden i dag  ');
const aB = vis(kB, 'konsistent   ');
console.log('\nGULVET fra 1 cm-avrundingen av kota (toFixed(2) i app.js linje 426):');
for (const d of [-0.02,-0.01,0,0.01,0.02]) vis(+(kB+d).toFixed(2), `kB${d>=0?'+':''}${d.toFixed(2)}     `);

const s1 = kjor(o, kB, r).sum, s2 = kjor(o, +(kB+0.01).toFixed(2), r).sum;
console.log(`\nBalansen endrer seg ${Math.abs(bal(s2)-bal(s1)).toFixed(1)} m3 per CENTIMETER kote.`);
console.log(`=> 1 cm-avrundingen alene gir inntil ${(Math.abs(bal(s2)-bal(s1))/2).toFixed(1)} m3 restavvik, uansett rutenett.`);

console.log('\nKONTROLL: ved rute 1 m er Math.max(1,1)=1, dvs. INGEN uoverensstemmelse.');
{
  const k1 = sok(o, start, 1);
  const s = kjor(o, k1, 1).sum;
  console.log(`  rute 1: sok og rapport pa samme rutenett, kote ${k1} -> restavvik ${bal(s).toFixed(1)} m3`);
}
