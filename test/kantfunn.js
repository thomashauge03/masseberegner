'use strict';
/**
 * Funn i skraningsfot() og skraningsflate() – kjør: node test/kantfunn.js
 * Hver bolk skriver ut både det programmet svarer og fasiten regnet for hånd.
 */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

const grunnmal = () => Object.assign({}, Tomt.StandardTomtemal, {
  matjordDybde: 0, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0,
  forsterkningslag: 0, frostsikring: 0, avrettingslag: 0, overberg: 0,
  maksSokebredde: 60, maksSkjaeringsdybde: 0, maksFyllingshoyde: 0, maksVeggHoyde: 0,
  minAvstandTilBerg: 0
});
const rekt = (b, l) => [{x:0,y:0},{x:b,y:0},{x:b,y:l},{x:0,y:l}];
const flatt = { z: () => 100 };
const dyptFjell = new M.Fjellmodell({ standarddybde: 100 });

/* ---------- 0. Kontroll: det som SKAL stemme, stemmer ---------- */
console.log('0. KONTROLL – de enkle tilfellene er riktige');
{
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.0 });
  const fot = T.skraningsfot({ tomt: { punkter: rekt(40,60), kanter: [],
    nivaa: {modus:'flat',kote:98} }, mal, terreng: flatt, fjell: dyptFjell });
  console.log(`   2 m skjæring, 1:2 -> ut = ${fot[0].ut.toFixed(3)} m (fasit 4,000)`);
  const m2 = Object.assign(grunnmal(), { veggHelning: 0.1, losmasseOverFjell: 2.0 });
  const f2 = T.skraningsfot({ tomt: { punkter: rekt(40,60),
    kanter: [{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'}],
    nivaa: {modus:'flat',kote:96} }, mal: m2, terreng: flatt,
    fjell: new M.Fjellmodell({ standarddybde: 1 }) });
  console.log(`   bergvegg, fjell 1 m ned, 4 m skjæring -> ut = ${f2[0].ut.toFixed(3)} m `
    + '(fasit 0,3 i berg + 2,0 i løsmasse = 2,300) – knekker riktig ved fjelloverflaten');
}

/* ---------- 1. Åpen kant: linja går 45 m ut, volumet regner null ---------- */
console.log('\n1. ÅPEN KANT – linja og tallene er uenige');
{
  const mal = Object.assign({}, Tomt.StandardTomtemal);       // maksSokebredde 45
  const o = { tomt: { punkter: rekt(40,60), kanter: [{type:'apen'},{},{},{}],
    nivaa: {modus:'flat',kote:98} }, mal, terreng: flatt, fjell: dyptFjell };
  const fot = T.skraningsfot(o);
  const k0 = fot.filter(f => f.kant === 0);
  const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 0.5, bakkefaktor: 1 }));
  console.log(`   kant 0 er åpen: skraningsfot gir ut = ${k0[0].ut.toFixed(2)} m `
    + `(= maksSokebredde ${mal.maksSokebredde}), type "${k0[0].type}"`);
  console.log(`   beregnTomtemasser regner 0 m³ og 0 m² utenfor kant 0 `
    + `(arealMedSkraning ${r.arealMedSkraning.toFixed(0)} m²)`);
  console.log('   ui-kart.js:485 tegner alle punktene – også de åpne – som strek.');
}

/* ---------- 2. Åpen kant knuser innerflate (yttergrense-modus) ---------- */
console.log('\n2. ÅPEN KANT I YTTERGRENSE-MODUS – ferdig flate blir stille feil');
{
  for (const sok of [12, 20, 45]) {
    const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.0, maksSokebredde: sok });
    const inn = T.innerflate({ tomt: { punkter: rekt(40,60),
      kanter: [{},{},{},{type:'apen'}], nivaa: {modus:'flat',kote:98} },
      mal, terreng: flatt, fjell: dyptFjell });
    console.log(`   maksSokebredde ${String(sok).padStart(2)} -> ferdig flate `
      + (inn.punkter ? `${Tomt.areal(inn.punkter).toFixed(0)} m²` : 'FOR LITEN')
      + `   innrykk ${inn.innrykk.map(v=>v.toFixed(1)).join(', ')}`);
  }
  console.log('   Fasit: 1664 m². Den åpne kanten skal ikke kreve noe innrykk.');
}

/* ---------- 3. Skråning som aldri lander ---------- */
console.log('\n3. SKRÅNING SOM ALDRI MØTER TERRENGET – ingen merknad');
{
  const terr = { z: (x) => x < 0 ? 99 + x / 1.5 : 99 };     // faller 1:1,5 utover
  for (const sok of [45, 90]) {
    const mal = Object.assign(grunnmal(), { fylling: 2.0, maksSokebredde: sok });
    const o = { tomt: { punkter: rekt(40,60), kanter: [], nivaa: {modus:'flat',kote:100} },
      mal, terreng: terr, fjell: dyptFjell };
    const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 1, bakkefaktor: 1 }));
    const fot = T.skraningsfot(o).filter(f => f.kant === 3);
    console.log(`   maksSokebredde ${sok}: fylling ${r.sum.fylling.toFixed(0)} m³, `
      + `linja ${fot[0].ut.toFixed(0)} m ut, traff=${fot[0].traff}`);
  }
  console.log('   Volumet firedobles av en innstilling brukeren aldri ser. Ingen merknad.');
  console.log('   `traff:false` skrives i tomtmasser.js:437, men leses ingen steder.');
}

/* ---------- 4. Hjørnevifta tegnes ikke ---------- */
console.log('\n4. HJØRNEVIFTA – volumet har den, linja kutter den bort');
{
  const mal = grunnmal();
  const o = { tomt: { punkter: rekt(40,60), kanter: [], nivaa: {modus:'flat',kote:94} },
    mal, terreng: flatt, fjell: dyptFjell };
  const fot = T.skraningsfot(o);
  const k0 = fot.filter(f=>f.kant===0), k1 = fot.filter(f=>f.kant===1);
  const A = k0[k0.length-1], B = k1[0];
  const midt = { x:(A.x+B.x)/2, y:(A.y+B.y)/2 };
  console.log(`   6 m skjæring 1:2,5: utslag på kanten ${fot[0].ut.toFixed(2)} m`);
  console.log(`   men midt i hjørnet (40,0) ligger den tegnede streken bare `
    + `${Math.hypot(midt.x-40, midt.y-0).toFixed(2)} m ut`);
  console.log('   Volumet strekker seg 15,00 m ut også der (vifte rundt hjørnet).');
}

/* ---------- 5. Hjørnevifta tildeles etter kantnummer ---------- */
console.log('\n5. HJØRNEVIFTA TILDELES ETTER KANTNUMMER – svaret roterer med tomta');
{
  const kv = rekt(60, 60);
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.5 });
  const svar = [];
  for (let k = 0; k < 4; k++) {
    const kanter = [{},{},{},{}]; kanter[k] = { type: 'apen' };
    const r = T.beregnTomtemasser({ tomt: { punkter: kv, kanter, nivaa: {modus:'flat',kote:92} },
      mal, terreng: flatt, fjell: dyptFjell, rutestorrelse: 0.5, bakkefaktor: 1 });
    svar.push(r.sum.skjaering);
    console.log(`   kant ${k} åpen -> skjæring ${r.sum.skjaering.toFixed(0)} m³`);
  }
  const kjegle = Math.PI * 400 * 8 / 12;
  console.log(`   Samme tomt rotert 90°: spenn ${(Math.max(...svar)-Math.min(...svar)).toFixed(0)} m³ `
    + `= 2 kvartkjegler à ${kjegle.toFixed(0)} m³ (${(((Math.max(...svar)/Math.min(...svar))-1)*100).toFixed(1)} %)`);
}

/* ---------- 6. Halveringen finner ikke den første kryssingen ---------- */
console.log('\n6. HALVERINGEN TAR FEIL GREN NÅR TERRENGET IKKE ER MONOTONT');
{
  const terr = { z: (x) => {
    if (x >= 0) return 97;
    const d = -x; let z = 97 - d / 20;
    if (d > 4 && d < 5.5) z += 1.0;          // en liten kolle utenfor
    return z; } };
  const mal = Object.assign(grunnmal(), { fylling: 2.0 });
  const fot = T.skraningsfot({ tomt: { punkter: rekt(40,60), kanter: [],
    nivaa: {modus:'flat',kote:100} }, mal, terreng: terr, fjell: dyptFjell })
    .filter(f => f.kant === 3);
  let f1 = null;
  for (let d = 0.005; d < 30; d += 0.005) { if (100 - d/2 <= terr.z(-d)) { f1 = d; break; } }
  console.log(`   fyllingsfot: programmet ${fot[0].ut.toFixed(3)} m — fasit ${f1.toFixed(3)} m`);
  console.log('   Kommentaren i tomtmasser.js:412 antar at flaten møter terrenget');
  console.log('   én gang. Ekte terreng (DTM1) er aldri monotont.');
}

/* ---------- 7. Fjelloverflaten leses i feil punkt ---------- */
console.log('\n7. BERGVEGG: FJELLDYBDEN LESES LANGT UTE, IKKE VED KANTEN');
{
  const mal = Object.assign(grunnmal(), { veggHelning: 0.1, losmasseOverFjell: 2.0 });
  const P = rekt(40, 60);
  const K = [{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'},{type:'fjellvegg'}];
  const utenfor = (x,y) => T.innenforPolygon(P,x,y) ? 0 : T.naermestePaOmriss(P,x,y).d;
  const kjor = (fjell, navn) => {
    const o = { tomt: { punkter: P, kanter: K, nivaa: {modus:'flat',kote:92} },
      mal, terreng: flatt, fjell };
    const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 0.5, bakkefaktor: 1 }));
    const fot = T.skraningsfot(o);
    console.log(`   ${navn}: skjæring ${r.sum.skjaering.toFixed(0)} m³, `
      + `løsmasse ${r.sum.skjaeringLosmasse.toFixed(0)} m³, utslag ${fot[0].ut.toFixed(2)} m`);
    return r;
  };
  const a = kjor(new M.Fjellmodell({ standarddybde: 0.5 }), 'fjell 0,5 m under overalt   ');
  const b = kjor({ dybde: (x,y) => 0.5 + Math.min(3.0, utenfor(x,y)*0.75) },
    'fjell dypner utenfor tomta ');
  console.log(`   Inne i tomta er A og B identiske. Forskjell `
    + `${(b.sum.skjaering-a.sum.skjaering).toFixed(0)} m³ `
    + `(${((b.sum.skjaering/a.sum.skjaering-1)*100).toFixed(1)} %), utslaget 1,75 -> 7,45 m.`);
  console.log('   skraningsflate() bruker zFjell i CELLA, ikke ved kanten, så flaten');
  console.log('   synker utover når fjellet dypner. En gravd flate kan ikke synke utover.');
  let ned = 0, n = 0;
  let forrige = -Infinity;
  for (let d = 0.05; d <= 12; d += 0.05) {
    const zF = 100 - (0.5 + Math.min(3.0, d*0.75));
    const z = T.skraningsflate(d, 92, zF, {type:'fjellvegg'}, mal);
    if (z < forrige - 1e-9) ned++; n++; forrige = z;
  }
  console.log(`   ${ned} av ${n} steg utover går NEDOVER.`);
}

/* ---------- 8. Mur og overgang har ingen geometri ---------- */
console.log('\n8. KANTTYPENE "mur" OG "overgang" BEHANDLES SOM VANLIG SKRÅNING');
{
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2.5 });
  for (const type of ['skraning','mur','overgang','fjellvegg']) {
    const o = { tomt: { punkter: rekt(40,60), kanter: [{type},{type},{type},{type}],
      nivaa: {modus:'flat',kote:94} }, mal, terreng: flatt,
      fjell: new M.Fjellmodell({ standarddybde: 0.5 }) };
    const fot = T.skraningsfot(o);
    const r = T.beregnTomtemasser(Object.assign({}, o, { rutestorrelse: 0.5, bakkefaktor: 1 }));
    console.log(`   ${type.padEnd(10)} ut=${fot[0].ut.toFixed(2).padStart(6)} m   `
      + `skjæring=${r.sum.skjaering.toFixed(0).padStart(6)} m³`);
  }
  console.log('   maksMurHoyde, fundamentDybde, fundamentBredde og bakfylling er');
  console.log('   definert i StandardTomtemal, men brukes ingen steder i beregningen.');
}
