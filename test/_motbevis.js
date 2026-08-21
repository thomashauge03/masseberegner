'use strict';
const path=require('path');
const T=require(path.join(__dirname,'..','public','js','tomtmasser.js'));
const Tomt=require(path.join(__dirname,'..','public','js','tomt.js'));
const M=require(path.join(__dirname,'..','public','js','masser.js'));
const grunnmal=()=>Object.assign({},Tomt.StandardTomtemal,{
 matjordDybde:0,renskDybde:0,slitelagTykkelse:0,baerelagTykkelse:0,
 forsterkningslag:0,frostsikring:0,avrettingslag:0,overberg:0,
 maksSokebredde:60,maksSkjaeringsdybde:0,maksFyllingshoyde:0,maksVeggHoyde:0,minAvstandTilBerg:0});
const rekt=(b,l)=>[{x:0,y:0},{x:b,y:0},{x:b,y:l},{x:0,y:l}];
const flatt={z:()=>100};
const dyptFjell=new M.Fjellmodell({standarddybde:100});

console.log('A) INGEN apen kant (alle fire vanlige) – varierer svaret med maksSokebredde?');
for(const sok of [12,20,45,60]){
 const mal=Object.assign(grunnmal(),{skjaeringLosmasse:2.0,maksSokebredde:sok});
 const inn=T.innerflate({tomt:{punkter:rekt(40,60),kanter:[{},{},{},{}],nivaa:{modus:'flat',kote:98}},mal,terreng:flatt,fjell:dyptFjell});
 console.log(`   sok ${String(sok).padStart(2)} -> ${inn.punkter?Tomt.areal(inn.punkter).toFixed(1)+' m²':'FOR LITEN'}  innrykk ${inn.innrykk.map(v=>v.toFixed(2)).join(', ')}`);
}
console.log('   (fasit uten apen kant: 32 x 52 = 1664 m²)\n');

console.log('B) EN apen kant (kant 3 = linja x=0). Hva BURDE riktig svar vaere?');
console.log('   Kant 3 apen -> ingen innrykk der. Ovrige tre krever 4 m.');
console.log('   x: 0..36, y: 4..56  ->  36 x 52 = ' + (36*52) + ' m²');
console.log('   Programmet gir (se kantfunn bolk 2): 1344 / 1056 / 362 m² alt etter maksSokebredde.\n');

console.log('C) Er avviket bare oppløsning? Innrykk pa apen kant vs maksUt:');
for(const sok of [12,20,45]){
 const mal=Object.assign(grunnmal(),{skjaeringLosmasse:2.0,maksSokebredde:sok});
 const inn=T.innerflate({tomt:{punkter:rekt(40,60),kanter:[{},{},{},{type:'apen'}],nivaa:{modus:'flat',kote:98}},mal,terreng:flatt,fjell:dyptFjell});
 console.log(`   sok ${String(sok).padStart(2)}: innrykk hjorne = ${inn.innrykk.map(v=>v.toFixed(2)).join(', ')}  -> (sok+4)/2 = ${((sok+4)/2).toFixed(2)}`);
}
