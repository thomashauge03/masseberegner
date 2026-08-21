'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const rekt = (b, l) => [{x:0,y:0},{x:b,y:0},{x:b,y:l},{x:0,y:l}];
const grunnmal = () => Object.assign({}, Tomt.StandardTomtemal, {
  matjordDybde: 0, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0,
  forsterkningslag: 0, frostsikring: 0, avrettingslag: 0, overberg: 0,
  maksSokebredde: 60, maksSkjaeringsdybde: 0, maksFyllingshoyde: 0, maksVeggHoyde: 0,
  minAvstandTilBerg: 0
});

function stat(fot, filter) {
  const f = filter ? fot.filter(filter) : fot;
  if (!f.length) return 'ingen punkt';
  const u = f.map(q => q.ut);
  return `n=${f.length} ut min=${Math.min(...u).toFixed(3)} maks=${Math.max(...u).toFixed(3)}`;
}

console.log('=== A. Flatt terreng, 2 m skjæring, 1:2 -> skal være 4,0 m ut ===');
{
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.0 });
  const o = {
    tomt: { punkter: rekt(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal, terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 100 })
  };
  const fot = T.skraningsfot(o);
  console.log('  ', stat(fot), ' typer:', [...new Set(fot.map(f=>f.type))].join(','));
}

console.log('\n=== B. Fylling 2 m, 1:2 -> skal være 4,0 m ut ===');
{
  const mal = Object.assign(grunnmal(), { fylling: 2.0 });
  const o = {
    tomt: { punkter: rekt(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal, terreng: { z: () => 98 }, fjell: new M.Fjellmodell({ standarddybde: 100 })
  };
  const fot = T.skraningsfot(o);
  console.log('  ', stat(fot), ' typer:', [...new Set(fot.map(f=>f.type))].join(','));
}

console.log('\n=== C. Fjellvegg, fjell 1 m under terreng, planum 96 ===');
{
  /* zT=100, zFjell=99, zK=96. veggHelning 0.1 -> 0.3 m ut til fjelloverflaten.
     Deretter losmasseOverFjell 2.0 over 1 m -> 2 m. Sum 2,3 m. */
  const mal = Object.assign(grunnmal(), { veggHelning: 0.1, losmasseOverFjell: 2.0 });
  const o = {
    tomt: { punkter: rekt(40, 60),
      kanter: [{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'}],
      nivaa: { modus: 'flat', kote: 96 } },
    mal, terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 1 })
  };
  const fot = T.skraningsfot(o);
  console.log('   fasit 2.300 ', stat(fot));
  // og knekkpunkt: sjekk skraningsflate direkte
  for (const d of [0.1, 0.3, 0.5, 1.0, 2.3]) {
    console.log(`   skraningsflate(d=${d}) = ${T.skraningsflate(d, 96, 99, {type:'fjellvegg'}, mal).toFixed(4)}`);
  }
}

console.log('\n=== D. Åpen kant: skal gi INGENTING utenfor ===');
{
  const mal = grunnmal();
  const o = {
    tomt: { punkter: rekt(40, 60),
      kanter: [{type:'apen'},{type:'apen'},{type:'apen'},{type:'apen'}],
      nivaa: { modus: 'flat', kote: 98 } },
    mal, terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 100 })
  };
  const fot = T.skraningsfot(o);
  console.log('   ', stat(fot), ' typer:', [...new Set(fot.map(f=>f.type))].join(','));
  console.log('   traff-flagg:', [...new Set(fot.map(f=>String(f.traff)))].join(','));
  const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 0.5, bakkefaktor: 1 }));
  console.log('   volum skjæring (skal være 2400*2=4800, ingenting utenfor):', r.sum.skjaering.toFixed(1));
  console.log('   arealMedSkraning:', r.arealMedSkraning.toFixed(1), ' areal:', r.areal.toFixed(1));
}

console.log('\n=== E. Skråningen møter aldri terrenget (terreng stiger like bratt) ===');
{
  // Skjæring 1:2. Terrenget stiger 1 m per 2 m utover fra x=0-kanten (mot -x).
  // Kant 3 er x=0-kanten (fra (0,60) til (0,0)), normal peker mot -x.
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.0, maksSokebredde: 45 });
  const o = {
    tomt: { punkter: rekt(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    // terreng: 100 inne, stiger 1:2 for x<0
    mal, terreng: { z: (x) => x < 0 ? 100 - x / 2 : 100 },
    fjell: new M.Fjellmodell({ standarddybde: 100 })
  };
  const fot = T.skraningsfot(o);
  for (let k = 0; k < 4; k++) {
    const f = fot.filter(q => q.kant === k);
    console.log(`   kant ${k}: ${stat(f)} traff=${[...new Set(f.map(q=>String(q.traff)))].join(',')}`);
  }
  const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 1, bakkefaktor: 1 }));
  console.log('   merknader:', JSON.stringify(r.merknader));
  console.log('   skjæring:', r.sum.skjaering.toFixed(1));

  // samme, men med større søkebredde -> volumet skal endre seg mye om det er kuttet
  const mal2 = Object.assign(grunnmal(), { skjaeringLosmasse: 2.0, maksSokebredde: 90 });
  const r2 = T.beregnTomtemasser(Object.assign({}, o, { mal: mal2, rutestorrelse: 1, bakkefaktor: 1 }));
  console.log('   samme med maksSokebredde 90:', r2.sum.skjaering.toFixed(1));
}

console.log('\n=== F. Fylling som ikke lander (terrenget faller bratt bort) ===');
{
  const mal = Object.assign(grunnmal(), { fylling: 2.0, maksSokebredde: 45 });
  const o = {
    tomt: { punkter: rekt(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    mal, terreng: { z: (x) => x < 0 ? 99 + x / 1.5 : 99 },   // faller 1:1,5 utover
    fjell: new M.Fjellmodell({ standarddybde: 100 })
  };
  const fot = T.skraningsfot(o);
  for (let k = 0; k < 4; k++) {
    const f = fot.filter(q => q.kant === k);
    console.log(`   kant ${k}: ${stat(f)} traff=${[...new Set(f.map(q=>String(q.traff)))].join(',')}`);
  }
  const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 1, bakkefaktor: 1 }));
  console.log('   merknader:', JSON.stringify(r.merknader));
  const mal2 = Object.assign(mal, {}); mal2.maksSokebredde = 90;
  const r2 = T.beregnTomtemasser(Object.assign({}, o, { mal: mal2, rutestorrelse: 1, bakkefaktor: 1 }));
  console.log('   fylling 45 m:', r.sum.fylling.toFixed(1), ' 90 m:', r2.sum.fylling.toFixed(1));
}
