'use strict';
const path=require('path');
const T=require(path.join(__dirname,'..','public','js','tomtmasser.js'));
const Tomt=require(path.join(__dirname,'..','public','js','tomt.js'));
const M=require(path.join(__dirname,'..','public','js','masser.js'));
const OX=442183.27,OY=6461902.61;
const rekt=(b,l)=>[{x:OX,y:OY},{x:OX+b,y:OY},{x:OX+b,y:OY+l},{x:OX,y:OY+l}];
// Realistisk mal: standardmalen, bare med lagtykkelser satt
const mal=Object.assign({},Tomt.StandardTomtemal,{forsterkningslag:0.40,baerelagTykkelse:0.10,
  slitelagTykkelse:0.05,frostsikring:0,avrettingslag:0});
const kjor=(p,kote,rute)=>T.beregnTomtemasser({tomt:{punkter:p,kanter:[],nivaa:{modus:'flat',kote}},
  mal, terreng:{z:()=>100}, fjell:new M.Fjellmodell({standarddybde:100}),
  rutestorrelse:rute, bakkefaktor:1});
const tykk=mal.forsterkningslag+mal.baerelagTykkelse+mal.slitelagTykkelse;
console.log('lagtykkelse sum =',tykk.toFixed(2),'m   default rutestorrelse =',Tomt.StandardTomtemal.rutestorrelse);
for(const [b,l] of [[12.3,8.7],[10,10],[24.5,17.3],[7.4,5.1]]){
 const p=rekt(b,l), eks=Tomt.areal(p);
 console.log(`\ntomt ${b} x ${l} m  eksakt areal ${eks.toFixed(2)} m2`);
 for(const rute of [1,2,5,0.25]){
  const r=kjor(p,99,rute);
  const lag=r.sum.slitelag+r.sum.baerelag+r.sum.forsterkningslag;
  const impl=lag/tykk;
  console.log(`  rute ${rute} m: RAPPORT Areal=${eks.toFixed(1)} m2 | telt r.areal=${r.areal.toFixed(2)} m2 | Sum overbygning=${lag.toFixed(2)} m3 -> tilsvarer ${impl.toFixed(2)} m2 | avvik ${(100*(impl-eks)/eks).toFixed(2)} % | merknader ${r.merknader.length}`);
 }
}
