'use strict';
const path=require('path');
const T=require(path.join(__dirname,'..','public','js','tomtmasser.js'));
const Tomt=require(path.join(__dirname,'..','public','js','tomt.js'));
const M=require(path.join(__dirname,'..','public','js','masser.js'));
const OX=442183.27, OY=6461902.61;
const rekt=(b,l)=>[{x:OX,y:OY},{x:OX+b,y:OY},{x:OX+b,y:OY+l},{x:OX,y:OY+l}];
// HELT STANDARD tomtemal - ingen testspesifikke overstyringer
const mal=Object.assign({},Tomt.StandardTomtemal);
console.log('StandardTomtemal.minAvstandTilBerg =',mal.minAvstandTilBerg,
            ' rutestorrelse (std) =',Tomt.StandardTomtemal.rutestorrelse);
console.log('tomt 40 x 30 m = 1200 m2, terreng kote 100, fjell 1,0 m under, ferdig niva 99,5\n');
console.log('rute   celler   celle-areal   celler*areal   merknadstekst');
for (const rute of [5,2,1,0.5,0.25]) {
  const r=T.beregnTomtemasser({tomt:{punkter:rekt(40,30),kanter:[],nivaa:{modus:'flat',kote:99.5}},
    mal, terreng:{z:()=>100}, fjell:new M.Fjellmodell({standarddybde:1.0}),
    rutestorrelse:rute, bakkefaktor:1});
  const m=r.merknader.find(m=>m.type==='berg');
  const n=m?parseInt(m.tekst,10):0;
  console.log(`${String(rute).padStart(4)} ${String(n).padStart(8)} ${(rute*rute).toFixed(4).padStart(11)} m2 ${(n*rute*rute).toFixed(0).padStart(11)} m2   "${m?m.tekst.slice(0,60):'-'}..."`);
}
