'use strict';
/* Konvergensprøve for tomteberegningen.  node test/konvergensprove.js */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));
const OX = 442183.27, OY = 6461902.61;
const rekt = (b, l) => [{x:OX,y:OY},{x:OX+b,y:OY},{x:OX+b,y:OY+l},{x:OX,y:OY+l}];
const gm = o => Object.assign({}, Tomt.StandardTomtemal, {matjordDybde:0,renskDybde:0,
  slitelagTykkelse:0,baerelagTykkelse:0,forsterkningslag:0,frostsikring:0,avrettingslag:0,
  overberg:0,maksSokebredde:60,maksSkjaeringsdybde:0,maksFyllingshoyde:0,maksVeggHoyde:0,
  minAvstandTilBerg:0}, o||{});
const kjor = (p, kote, rute, mal, terreng, fjell) => T.beregnTomtemasser({
  tomt:{punkter:p,kanter:[],nivaa:{modus:'flat',kote}}, mal: mal||gm(),
  terreng: terreng||{z:()=>100}, fjell: fjell||new M.Fjellmodell({standarddybde:100}),
  rutestorrelse: rute, bakkefaktor: 1});

console.log('FUNN 1  Overberg skalerer med 1/rutestørrelse');
{const mal = Object.assign({}, Tomt.StandardTomtemal, {overberg:0.30, maksSokebredde:60});
 for (const rute of [5,2,1,0.5,0.25]) {
   const r = kjor(rekt(40,60), 96, rute, mal, {z:()=>100}, new M.Fjellmodell({standarddybde:0.5}));
   console.log(`  rute ${rute} m -> overberg ${r.sum.overberg.toFixed(0)} m3`);
 }}

console.log('\nFUNN 2  Arealet konvergerer ikke; opptil 5 % feil ved 1 m');
{let seed=12345; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
 let verste=0, over2=0;
 for (let i=0;i<40;i++){ const B=6+rnd()*50, L=6+rnd()*50;
   const r=kjor(rekt(B,L),98,1); const av=100*(r.areal-B*L)/(B*L);
   if(Math.abs(av)>2) over2++; if(Math.abs(av)>Math.abs(verste)) verste=av; }
 console.log(`  40 tilfeldige rektangler, rute 1 m: ${over2} har over 2 % arealfeil, verste ${verste.toFixed(2)} %`);
 const p=rekt(11.6,29.5);
 console.log(`  11,6 x 29,5 m: eksakt ${Tomt.areal(p).toFixed(1)} m2, regnet ${kjor(p,98,1).areal.toFixed(1)} m2`);}

console.log('\nFUNN 3  maksSokebredde flytter rutenettets fase og endrer arealet');
{const p=rekt(40.4,60.4);
 for (const msb of [44,45,46]) {
   const r=kjor(p,98,2,gm({maksSokebredde:msb}));
   console.log(`  maksSokebredde ${msb} m, rute 2 m -> areal ${r.areal.toFixed(0)} m2 (eksakt ${Tomt.areal(p).toFixed(0)}), skjaering ${r.sum.skjaering.toFixed(0)} m3`);
 }}

console.log('\nFUNN 4  Overbygningen regnes av det talte arealet, ikke det viste');
{const mal=gm({forsterkningslag:0.40,baerelagTykkelse:0.10,slitelagTykkelse:0.05});
 const p=rekt(12.3,8.7);
 for (const rute of [1,2,5]) {
   const r=kjor(p,99,rute,mal);
   const lag=r.sum.slitelag+r.sum.baerelag+r.sum.forsterkningslag;
   console.log(`  rute ${rute} m: rapporten viser ${Tomt.areal(p).toFixed(1)} m2, overbygning ${lag.toFixed(1)} m3 = ${(lag/0.55).toFixed(1)} m2`);
 }}

console.log('\nFUNN 5  Liten tomt forsvinner uten merknad');
{const mal=gm({forsterkningslag:0.40,baerelagTykkelse:0.10,slitelagTykkelse:0.05});
 const p=[{x:OX+3.2,y:OY+3.2},{x:OX+5.2,y:OY+3.2},{x:OX+5.2,y:OY+5.2},{x:OX+3.2,y:OY+5.2}];
 for (const rute of [5,1]) {
   const r=kjor(p,98,rute,mal);
   console.log(`  2 x 2 m tomt, rute ${rute} m: areal ${r.areal.toFixed(2)} m2, overbygning ${(r.sum.slitelag+r.sum.baerelag+r.sum.forsterkningslag).toFixed(2)} m3, ${r.merknader.length} merknader`);
 }}

console.log('\nFUNN 6  "N ruter ma dypsprenges" skalerer med rutenettet');
{const mal=gm({minAvstandTilBerg:0.75});
 for (const rute of [5,1,0.25]) {
   const r=kjor(rekt(40,30),99.5,rute,mal,{z:()=>100},new M.Fjellmodell({standarddybde:1.0}));
   const m=r.merknader.find(m=>m.type==='berg');
   console.log(`  rute ${rute} m: ${m?m.tekst.split(' ')[0]+' ruter':'ingen'}`);
 }}
