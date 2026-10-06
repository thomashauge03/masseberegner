'use strict';
/**
 * Stikkrenner mot fasit regnet for hånd.
 *
 *   node test/stikkrenneprove.js
 *
 * Alt er oppdiktet: en rett veg på 100 m langs x, standardmalen, terrenget en
 * formel. Tverrsnittet regnes av `beregnMasser` med renna som eget profil.
 *
 * Standardmalen: vegbredde 4,0, tverrfall 5 % til begge sider, overbygning
 * 0,70 m (slitelag 0,10, bærelag 0,60), skulder 0,70 · 1,5 = 1,05 m, fylling
 * og skjæring 1:1,5, grøfta 0,20 m under planum med 0,30 m bunn og 1:1 inn,
 * rensk 0,20 m. Renna: Ø600, ytre 0,69 m, minstefall 10 ‰, overdekning 0,5 m,
 * tillegg 0,5 m forbi foten.
 */
const path = require('path');
const js = f => path.join(__dirname, '..', 'public', 'js', f);
const { Linjeforing } = require(js('linjeforing.js'));
const { Vertikalprofil } = require(js('vertikalprofil.js'));
const M = require(js('masser.js'));
const Stikkrenner = require(js('stikkrenner.js'));

let feil = 0, ok = 0;
const fmt = v => (typeof v === 'number' ? v.toPrecision(6) : String(v));
function sjekk(navn, faktisk, ventet, toleranse) {
  const d = Math.abs(faktisk - ventet);
  if (d <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(d)}, grense ${toleranse})`); }
}
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

const linje = new Linjeforing([{ x: 0, y: 0, r: 0 }, { x: 100, y: 0, r: 0 }]);
/** Vegen i høyden z over terrenget T, og renna regnet i sitt eget profil. */
function regn(T, z, renne, mal = {}) {
  const res = M.beregnMasser({ linje, profil: new Vertikalprofil([{ s: 0, z, k: 1 }, { s: 100, z, k: 1 }]),
    terreng: { z: T }, mal: Object.assign({}, M.StandardMal, mal), fjell: null, profilAvstand: 5, bakkefaktor: 1,
    ekstraStasjoner: [renne.s] });
  return { res, svar: Stikkrenner.beregn(renne, res.geometriFor(renne.s), res.mal, { stigning: 0, lengde: linje.lengde }) };
}
const flatt = () => 100;

console.log('\n1. Fylling på flatt terreng');
{
  /* Vegen 1,5 m over terreng 100. Planum i kanten 101,5 − 0,10 − 0,70 =
     100,70; skulderen til 3,05; skråningen 1:1,5 ned til renskebunnen 99,80:
     1,35 m ut, foten i 4,40. Endene 0,5 m forbi: 4,90 til hver side, 9,80 m.
     Innløpet på bakken, 99,80; utløpet med minstefallet: 99,80 − 0,098. */
  const { res, svar: a } = regn(flatt, 101.5, { id: 's1', navn: 'SR 1', s: 42.5, innlop: 'auto' });
  paastand('profilet til renna er regnet som eget profil', res.stasjoner.includes(42.5));
  sjekk('enden til venstre: foten pluss 0,5 m', a.ender.venstre.t, 4.90, 0.001);
  sjekk('lengden fot til fot pluss tillegget', a.lengde, 9.80, 0.002);
  sjekk('innløpet på bakken', a.bunnInn, 99.80, 0.001);
  sjekk('utløpet med minstefallet', a.bunnUt, 99.702, 0.001);
  sjekk('fallet er minstefallet', a.fall, 10, 0.05);
  /* Overdekningen er minst i venstre vegkant (t = −2): flaten 101,40, bunnen
     99,80 − 0,098 · 2,9 / 9,8 = 99,7710, topp rør + 0,69 = 100,461. */
  sjekk('overdekningen: minst i vegkanten der renna er høyest', a.overdekning, 0.939, 0.002);
  paastand('  og den er nok – renna er ikke senket', a.senket === 0);
  paastand('flatt terreng: utløpet havner under bakken, og det sies', a.merknader.some(m => m.type === 'utlop' && /grøft ut/.test(m.tekst)),
    JSON.stringify(a.merknader));
  paastand('innløpet er venstre når endene er like høye', a.innlop === 'venstre');
  sjekk('endene i plan: rett på tvers', a.ender.hoyre.y, -4.90, 0.001);
  // et rør uten masse i profilet: massene er de samme med og uten renna
  const uten = M.beregnMasser({ linje, profil: new Vertikalprofil([{ s: 0, z: 101.5, k: 1 }, { s: 100, z: 101.5, k: 1 }]),
    terreng: { z: flatt }, mal: Object.assign({}, M.StandardMal), fjell: null, profilAvstand: 5, bakkefaktor: 1 });
  sjekk('massene er de samme med renna som eget profil', res.sum.fylling, uten.sum.fylling, 1e-6);
}

console.log('\n2. Skjev renne');
{
  const { svar: b } = regn(flatt, 101.5, { id: 's2', s: 42.5, vinkel: 30, innlop: 'auto' });
  sjekk('30°: lengden er 9,80 / cos 30°', b.lengde, 9.80 / Math.cos(Math.PI / 6), 0.002);
  sjekk('  og utløpet ligger minstefallet lavere over den lengden', b.bunnUt, 99.80 - 0.01 * 9.80 / Math.cos(Math.PI / 6), 0.001);
  sjekk('høyre ende er dreid framover i stasjoneringen', b.ender.hoyre.x, 42.5 + 4.90 * Math.tan(Math.PI / 6), 0.002);
  sjekk('  og venstre bakover', b.ender.venstre.x, 42.5 - 4.90 * Math.tan(Math.PI / 6), 0.002);
  // en veg som stiger: flaten over en skjev renne er høyere framover
  const stig = Stikkrenner.beregn({ id: 's2b', s: 42.5, vinkel: 30, innlop: 'auto' },
    regn(flatt, 101.5, { id: 'x', s: 42.5 }).res.geometriFor(42.5), M.StandardMal, { stigning: 0.1, lengde: 100 });
  paastand('  vegens stigning er med i overdekningen for en skjev renne', stig.overdekning < b.overdekning - 0.05,
    `${stig.overdekning} mot ${b.overdekning}`);
}

console.log('\n3. Sidebratt terreng: skjæring til venstre, fylling til høyre');
{
  /* Terrenget stiger 30 % mot venstre (y), vegen i 100 midt på. Venstre er
     skjæring: planum 99,20, grøftebunnen 0,20 under, 99,00, fra 3,25 til 3,55
     – innløpet midt i, 3,40. Høyre er fylling: skråningen fra 99,20 i 3,05
     møter renskebunnen 99,80 − 0,3 t i t = 3,9091, z = 98,627. */
  const { svar: c } = regn((x, y) => 100 + 0.3 * y, 100, { id: 's3', s: 50, innlop: 'auto' });
  paastand('innløpet er siden som ligger høyest: skjæringen', c.innlop === 'venstre' && c.ender.venstre.type === 'skjaering'
    && c.ender.hoyre.type === 'fylling');
  sjekk('innløpet midt i grøftebunnen', c.ender.venstre.t, 3.40, 0.001);
  sjekk('  med overflaten i grøftebunnen', c.ender.venstre.overflate, 99.00, 0.001);
  sjekk('utløpet ved foten pluss tillegget', c.ender.hoyre.t, 3.9091 + 0.5, 0.002);
  sjekk('  med bakken der', c.ender.hoyre.overflate, 98.627, 0.002);
  /* Bakken faller 0,373 m over 7,809 m – mer enn minstefallet, så renna går
     fra bunn til bunn. Men da er topp rør bare 0,277 m under vegkanten til
     venstre: hele renna senkes 0,223 m, og det sies. */
  sjekk('renna senkes til overdekningen holder', c.senket, 0.5 - 0.2769, 0.002);
  sjekk('  og da er overdekningen kravet', c.overdekning, 0.5, 1e-6);
  sjekk('  fallet følger terrenget', c.fall, (99.00 - 98.627) / 7.8091 * 1000, 0.3);
  paastand('  merknaden sier at innløpet ligger under grøftebunnen', c.merknader.some(m => m.type === 'senket' && /under grøftebunnen/.test(m.tekst)),
    JSON.stringify(c.merknader));
  const h = regn((x, y) => 100 + 0.3 * y, 100, { id: 's3h', s: 50, innlop: 'hoyre' }).svar;
  paastand('innløpet kan velges mot fallet i terrenget', h.innlop === 'hoyre' && h.bunnInn > h.bunnUt);
}

console.log('\n4. Låste høyder står');
{
  const { svar: d } = regn(flatt, 101.5, { id: 's4', s: 42.5, innlop: 'venstre', bunnInn: 99.5, bunnUt: 99.48 });
  paastand('begge låst: høydene står', d.bunnInn === 99.5 && d.bunnUt === 99.48 && d.laastInn && d.laastUt);
  paastand('  for lite fall mellom dem sies', d.merknader.some(m => m.type === 'fall'), JSON.stringify(d.merknader));
  const hoy = regn(flatt, 101.5, { id: 's5', s: 42.5, innlop: 'venstre', bunnInn: 100.45, bunnUt: 100.3 }).svar;
  paastand('låst for høyt: renna senkes ikke, men overdekningen sies', hoy.senket === 0 && hoy.bunnInn === 100.45
    && hoy.merknader.some(m => m.type === 'overdekning'), JSON.stringify(hoy.merknader));
  paastand('  og at innløpet ligger over bakken', hoy.merknader.some(m => m.type === 'innlop'));
  paastand('  og at utløpet henger over bakken', hoy.merknader.some(m => m.type === 'utlop' && /henger/.test(m.tekst)));
  const inn = regn(flatt, 101.5, { id: 's6', s: 42.5, innlop: 'venstre', bunnInn: 99.6 }).svar;
  sjekk('bare innløpet låst: utløpet med minstefallet fra det', inn.bunnUt, 99.6 - 0.098, 0.001);
}

console.log('\n5. Det som ikke går');
{
  const ute = regn(flatt, 101.5, { id: 's7', s: 120 }).svar;
  paastand('profilet utenfor linja', ute.feil === 'profilet er utenfor linja', JSON.stringify(ute));
  // terrenget mangler et stykke ut på høyre side: skråningen når det ikke
  const hull = regn((x, y) => (y < -3 ? NaN : 100), 101.5, { id: 's8', s: 42.5 }).svar;
  paastand('terrenget mangler: lengden er usikker, og det sies', hull.merknader.some(m => m.type === 'terreng'), JSON.stringify(hull.merknader));
  const k = Stikkrenner.fraMal({ stikkrenneDim: 'x', stikkrenneFall: -3, stikkrenneOverdekning: 99, stikkrenneTillegg: null });
  paastand('malen: et ugyldig tall er forvalget, et for stort klemmes', k.dim === 600 && k.fall === 0 && k.overdekning === 5 && k.tillegg === 0.5,
    JSON.stringify(k));
}

console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
