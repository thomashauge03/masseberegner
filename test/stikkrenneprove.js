'use strict';
/**
 * Stikkrenner mot fasit regnet for hånd.
 *
 *   node test/stikkrenneprove.js
 *
 * Alt er oppdiktet: en rett veg på 100 m langs x, standardmalen, terrenget en
 * formel. Tverrsnittet er rennas eget snitt (`res.snittVed`), utenfor massene.
 *
 * Standardmalen: vegbredde 4,0, tverrfall 5 % til begge sider, overbygning
 * 0,70 m (slitelag 0,10, bærelag 0,60), skulder 0,70 · 1,5 = 1,05 m, fylling
 * og skjæring 1:1,5, grøfta 0,20 m under planum med 0,30 m bunn og 1:1 inn,
 * rensk 0,20 m og 1,0 m forbi foten. Renna: Ø600, ytre 0,69 m – veggen
 * 0,045 m, så topp rør er bunn + 0,645 – minstefall 10 ‰, overdekning 0,5 m,
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
/** Vegen fra z0 til z1 over terrenget T, og renna regnet i sitt eget snitt. */
function regn(T, z, renne, mal = {}, z1 = z) {
  const vp = new Vertikalprofil([{ s: 0, z, k: 1 }, { s: 100, z: z1, k: 1 }]);
  const res = M.beregnMasser({ linje, profil: vp, terreng: { z: T }, mal: Object.assign({}, M.StandardMal, mal), fjell: null,
    profilAvstand: 5, bakkefaktor: 1 });
  return { res, svar: Stikkrenner.beregn(renne, res.snittVed(renne.s), res.mal,
    { stigning: vp.stigning(renne.s), lengde: linje.lengde, terreng: T, snitt: s => res.snittVed(s) }) };
}
const flatt = () => 100;

console.log('\n1. Fylling på flatt terreng');
{
  /* Vegen 1,5 m over terreng 100. Planum i kanten 101,5 − 0,10 − 0,70 =
     100,70; skulderen til 3,05; skråningen 1:1,5 ned til renskebunnen 99,80:
     1,35 m ut, foten i 4,40. Endene 0,5 m forbi: 4,90 til hver side, 9,80 m –
     og der er bakken renska, 99,80. Innløpet på bakken; utløpet med
     minstefallet: 99,80 − 0,098. */
  const { res, svar: a } = regn(flatt, 101.5, { id: 's1', navn: 'SR 1', s: 42.5, innlop: 'auto' });
  paastand('snittet er rennas eget – ikke et profil i massene', !res.stasjoner.includes(42.5) && res.snittVed(42.5).s === 42.5);
  sjekk('enden til venstre: foten pluss 0,5 m', a.ender.venstre.t, 4.90, 0.001);
  sjekk('lengden fot til fot pluss tillegget', a.lengde, 9.80, 0.002);
  sjekk('innløpet på bakken', a.bunnInn, 99.80, 0.001);
  sjekk('utløpet med minstefallet', a.bunnUt, 99.702, 0.001);
  sjekk('fallet er minstefallet', a.fall, 10, 0.05);
  /* Overdekningen er minst i venstre vegkant (t = −2): flaten 101,40, bunnen
     99,80 − 0,098 · 2,9 / 9,8 = 99,7710, topp rør + 0,645 = 100,416. */
  sjekk('overdekningen: minst i vegkanten der renna er høyest', a.overdekning, 0.984, 0.002);
  paastand('  og den er nok – renna er ikke senket', a.senket === 0 && a.senketInn === 0);
  paastand('flatt terreng: utløpet havner under bakken, og det sies', a.merknader.some(m => m.type === 'utlop' && /grøft ut/.test(m.tekst)),
    JSON.stringify(a.merknader));
  paastand('innløpet er venstre når endene er like høye', a.innlop === 'venstre');
  sjekk('endene i plan: rett på tvers', a.ender.hoyre.y, -4.90, 0.001);
}

console.log('\n2. Massene er de samme med og uten renner');
{
  /* En kolle mellom to profiler (42,5 m ligger mellom 40 og 45). Som eget
     profil i summen ga en renne der 10 % mer fylling; nå står den utenfor. */
  const kolle = (x, y) => 100 + (Math.abs(x - 42.5) < 1.5 ? 1.2 : 0);
  const med = regn(kolle, 101.5, { id: 'k', s: 42.5 }).res;
  const uten = M.beregnMasser({ linje, profil: new Vertikalprofil([{ s: 0, z: 101.5, k: 1 }, { s: 100, z: 101.5, k: 1 }]),
    terreng: { z: kolle }, mal: Object.assign({}, M.StandardMal), fjell: null, profilAvstand: 5, bakkefaktor: 1 });
  paastand('en renne ved en kolle: fyllingen og skjæringen er de samme', med.sum.fylling === uten.sum.fylling
    && med.sum.skjaering === uten.sum.skjaering, `${med.sum.fylling} mot ${uten.sum.fylling}`);
  // et snitt i en stasjon som alt er et profil, er det profilet
  paastand('et snitt i et profil er profilet selv', med.snittVed(45).fotHoyre === med.profiler.find(p => p.s === 45).fotHoyre);
}

console.log('\n3. Skjev renne');
{
  const { svar: b } = regn(flatt, 101.5, { id: 's2', s: 42.5, vinkel: 30, innlop: 'auto' });
  sjekk('30°: lengden er 9,80 / cos 30°', b.lengde, 9.80 / Math.cos(Math.PI / 6), 0.002);
  sjekk('  og utløpet ligger minstefallet lavere over den lengden', b.bunnUt, 99.80 - 0.01 * 9.80 / Math.cos(Math.PI / 6), 0.001);
  sjekk('høyre ende er dreid framover i stasjoneringen', b.ender.hoyre.x, 42.5 + 4.90 * Math.tan(Math.PI / 6), 0.002);
  sjekk('  og venstre bakover', b.ender.venstre.x, 42.5 - 4.90 * Math.tan(Math.PI / 6), 0.002);
  // en veg som stiger: flaten over en skjev renne er høyere framover
  const { res } = regn(flatt, 101.5, { id: 'x', s: 42.5 });
  const stig = Stikkrenner.beregn({ id: 's2b', s: 42.5, vinkel: 30, innlop: 'auto' }, res.snittVed(42.5), M.StandardMal,
    { stigning: 0.1, lengde: 100, terreng: flatt });
  paastand('  vegens stigning er med i overdekningen for en skjev renne', stig.overdekning < b.overdekning - 0.05,
    `${stig.overdekning} mot ${b.overdekning}`);
  /* SKJÆRING PÅ BEGGE SIDER, VEGEN STIGER 8 %, RENNA 45°. Grøftebunnen i
     snittet ved 50 m: planum 104 − 0,10 − 0,70 = 103,20, grøfta 0,20 under,
     103,00, midt i den 3,40 ut. Høyre ende ligger 3,40 fram langs vegen og
     venstre 3,40 tilbake: grøfta der er 103,00 ± 0,08 · 3,40 = ± 0,272. Her
     ble begge lest av snittet, 103,00 – innløpet sto 0,27 m over grøfta. */
  const grov = regn((x) => 102 + 0.08 * x + 2, 100, { id: 's2c', s: 50, vinkel: 45, innlop: 'auto' }, {}, 108).svar;
  sjekk('skjev renne i en stigning: grøfta i høyre ende er høyere', grov.ender.hoyre.overflate, 103.272, 0.002);
  sjekk('  og i venstre lavere', grov.ender.venstre.overflate, 102.728, 0.002);
  paastand('  innløpet er der grøfta ligger høyest', grov.innlop === 'hoyre');
  /* TERRENGET FALLER 8 % LANGS VEGEN, RENNA 45° SKJEV. I snittet i x ligger
     foten 4,40 + 0,12 (x − 42,5) ut: fyllingen er 0,08 høyere per meter fram,
     og skråningen 1:1,5. Til høyre krysser renna foten t fram langs vegen:
     t = 4,40 + 0,12 t gir 5,00, i 47,5, og enden 5,50 ut. Til venstre t
     tilbake: t = 4,40 − 0,12 t gir 3,9286, og enden 4,4286. Lest rett på
     tvers lå begge i 4,90 – enden fram 0,60 m inne i fyllingen. Bakken i
     endene: 100 − 0,08 · 5,5 − 0,20 = 99,36 og 100 + 0,08 · 4,4286 − 0,20 =
     100,1543. */
  const lf = regn(x => 100 - 0.08 * (x - 42.5), 101.5, { id: 's2d', s: 42.5, vinkel: 45, innlop: 'auto' }).svar;
  sjekk('terreng som faller langs vegen: enden fram er der renna krysser foten', lf.ender.hoyre.t, 5.50, 0.001);
  sjekk('  lest i snittet der', lf.ender.hoyre.s, 47.5, 0.001);
  sjekk('  og enden bak', lf.ender.venstre.t, 4.4286, 0.001);
  sjekk('  lengden', lf.lengde, (5.5 + 4.4286) * Math.SQRT2, 0.002);
  sjekk('  bakken i enden fram', lf.ender.hoyre.overflate, 99.36, 0.001);
  sjekk('  og bak', lf.ender.venstre.overflate, 100.1543, 0.001);
  /* KOMMER IKKE UT: 40 % fall langs vegen og renna 60° skjev – foten går
     fortere ut enn renna, og de møtes aldri. Enden leses da rett på tvers,
     og merknaden sier at lengden er usikker. */
  const aldri = regn(x => 100 - 0.4 * (x - 42.5), 101.5, { id: 's2e', s: 42.5, vinkel: 60, innlop: 'auto' }).svar;
  paastand('renna som ikke kommer ut av fyllingen: enden rett på tvers, og det sies', Math.abs(aldri.ender.hoyre.t - 4.90) < 0.001
    && aldri.merknader.some(m => m.type === 'terreng' && /kommer ikke ut/.test(m.tekst)), JSON.stringify(aldri.merknader));
  /* LØSEREN, MED SNITT LAGET FOR HÅND. Foten til høyre er 10 − 1,5 (s − 42,5)
     ut: den kommer innover fortere enn renna går utover, og vanlige steg
     svinger seg ut. Sekanten finner krysset – t = 10 − 1,5 t gir 4,00. */
  const { res: r3 } = regn(flatt, 101.5, { id: 'l', s: 42.5 });
  const A = r3.snittVed(42.5);
  const medFot = tFot => Object.assign({}, A, { sider: Object.assign({}, A.sider, { 1: Object.assign({}, A.sider[1], { tFot }) }) });
  const bratt = Stikkrenner.beregn({ id: 'l1', s: 42.5, vinkel: 45 }, A, r3.mal,
    { lengde: 100, terreng: flatt, snitt: s => medFot(10 - 1.5 * (s - 42.5)) });
  sjekk('løseren finner krysset der vanlige steg svinger seg ut', bratt.ender.hoyre.t, 4.50, 0.001);
  /* Og der det ikke finnes et: foten hopper fra 8,0 til 4,4 ved 47, og renna
     krysser den aldri. Enden leses rett på tvers, der foten er 6,0. */
  const hopp = Stikkrenner.beregn({ id: 'l2', s: 42.5, vinkel: 45 }, medFot(6.0), r3.mal,
    { lengde: 100, terreng: flatt, snitt: s => medFot(s < 47 ? 8.0 : 4.4) });
  paastand('  og uten et kryss: enden rett på tvers, og det sies', Math.abs(hopp.ender.hoyre.t - 6.5) < 1e-9
    && hopp.merknader.some(m => /nesten langs renna/.test(m.tekst)), JSON.stringify({ t: hopp.ender.hoyre.t, m: hopp.merknader }));
}

console.log('\n4. Sidebratt terreng: skjæring til venstre, fylling til høyre');
{
  /* Terrenget stiger 30 % mot venstre (y), vegen i 100 midt på. Venstre er
     skjæring: planum 99,20, grøftebunnen 0,20 under, 99,00, fra 3,25 til 3,55
     – innløpet midt i, 3,40. Høyre er fylling: skråningen fra 99,20 i 3,05
     møter renskebunnen 99,80 − 0,3 t i t = 3,9091. Enden 0,5 m forbi, i
     4,4091: bakken der er 100 − 0,3 · 4,4091 − 0,20 = 98,4773. */
  const { svar: c } = regn((x, y) => 100 + 0.3 * y, 100, { id: 's3', s: 50, innlop: 'auto' });
  paastand('innløpet er siden som ligger høyest: skjæringen', c.innlop === 'venstre' && c.ender.venstre.type === 'skjaering'
    && c.ender.hoyre.type === 'fylling');
  sjekk('innløpet midt i grøftebunnen', c.ender.venstre.t, 3.40, 0.001);
  sjekk('  med overflaten i grøftebunnen', c.ender.venstre.overflate, 99.00, 0.001);
  sjekk('utløpet ved foten pluss tillegget', c.ender.hoyre.t, 3.9091 + 0.5, 0.002);
  sjekk('  med bakken der enden ligger, ikke i foten', c.ender.hoyre.overflate, 98.4773, 0.002);
  /* Bakken faller 0,523 m over 7,809 m – mer enn minstefallet, så renna går
     fra bunn til bunn. Da er topp rør 0,349 m under vegkanten til venstre:
     0,151 m for lite. Senkingen i innløpet når dit med 1 − 1,4 / 7,809, så
     innløpet senkes 0,151 / 0,8207 = 0,184 m – og utløpet blir på bakken.
     Her ble hele renna senket, og utløpet havnet under bakken. */
  sjekk('innløpet senkes, renna dreies om utløpet', c.senketInn, 0.1843, 0.002);
  paastand('  og utløpet blir på bakken', c.senket === 0 && Math.abs(c.bunnUt - c.ender.hoyre.overflate) < 1e-9
    && !c.merknader.some(m => m.type === 'utlop'), JSON.stringify(c.merknader));
  sjekk('  og da er overdekningen kravet', c.overdekning, 0.5, 1e-6);
  paastand('  merknaden sier at innløpet ligger under grøftebunnen', c.merknader.some(m => m.type === 'senket'
    && /innløpet senket 0,18 m/.test(m.tekst) && /under grøftebunnen/.test(m.tekst)), JSON.stringify(c.merknader));
  const h = regn((x, y) => 100 + 0.3 * y, 100, { id: 's3h', s: 50, innlop: 'hoyre' }).svar;
  paastand('innløpet kan velges mot fallet i terrenget', h.innlop === 'hoyre' && h.bunnInn > h.bunnUt);
  // speilet: terrenget stiger mot høyre – da er det høyre side auto velger
  const sp = regn((x, y) => 100 - 0.3 * y, 100, { id: 's3s', s: 50, innlop: 'auto' }).svar;
  paastand('terrenget stiger mot høyre: auto velger høyre', sp.innlop === 'hoyre' && sp.ender.hoyre.type === 'skjaering'
    && Math.abs(sp.ender.hoyre.t - 3.40) < 0.001, JSON.stringify({ innlop: sp.innlop, h: sp.ender.hoyre }));
  /* TILLEGGET 2 M PÅ 30 % SIDEHELLING. Enden i 5,9091 ligger på bakken
     100 − 0,3 · 5,9091 = 98,2273 – utenfor rensken (1,0 m), så ikke avtatt.
     Lest i foten ble utløpet hengende 0,40 m over bakken uten merknad. */
  const langt = regn((x, y) => 100 + 0.3 * y, 100, { id: 's3t', s: 50, innlop: 'auto' }, { stikkrenneTillegg: 2 }).svar;
  sjekk('et langt tillegg: bakken der enden faktisk ligger', langt.ender.hoyre.overflate, 98.2273, 0.002);
  paastand('  og utløpet henger ikke', !langt.merknader.some(m => /henger/.test(m.tekst)), JSON.stringify(langt.merknader));
}

console.log('\n5. For lite overdekning, og for lite fall til å dreie renna');
{
  /* LAV VEG PÅ FLATT TERRENG, i 100: skjæring på begge sider – rensket
     terreng 99,80 står 0,60 over planum 99,20, så grøfta er full. Grøfte-
     bunnen 99,00, midt i 3,40 ut, på begge sider: endene er like høye, og
     minstefallet gir utløpet, 99,00 − 0,068. Topp rør i venstre vegkant
     99,00 − 0,014 + 0,645 = 99,631, under flaten 99,90: 0,269 m. Det
     mangler 0,231, og fallet har ingenting å gi – hele renna senkes. */
  const { svar: e } = regn(flatt, 100, { id: 's10', s: 42.5, innlop: 'auto' });
  sjekk('uten fall å gi: hele renna senkes med det som mangler', e.senket, 0.231, 0.001);
  paastand('  og innløpet er ikke senket for seg', e.senketInn === 0);
  sjekk('  utløpet', e.bunnUt, 98.932 - 0.231, 0.001);
  sjekk('  og da er overdekningen kravet', e.overdekning, 0.5, 1e-6);
  paastand('  merknadene: senket, og utløpet under grøftebunnen', e.merknader.some(m => m.type === 'senket'
    && /^senket 0,23 m for overdekningen – innløpet ligger 0,23 m under grøftebunnen$/.test(m.tekst))
    && e.merknader.some(m => m.type === 'utlop' && /0,30 m under grøftebunnen/.test(m.tekst)), JSON.stringify(e.merknader));
  /* 16 % SIDEHELLING, VEGEN I 100,4: full grøft til venstre, 99,40 midt i
     3,40 ut; fylling til høyre. Skråningen fra 99,60 i 3,05 møter rensk-
     bunnen 99,80 − 0,16 t i t = 3,6184; enden 0,5 forbi, der bakken er
     100 − 0,16 · 4,1184 − 0,20 = 99,1411. Bakken faller 0,2589 over 7,5184 m,
     og minstefallet tar 0,0752: innløpet kan senkes 0,1838. Overdekningen
     trenger 0,2418 – mer. Så innløpet ned til minstefallet, 99,2162: topp rør
     i venstre kant 99,2162 − 0,014 + 0,645 = 99,8472, under flaten 100,30:
     0,4528. Hele renna senkes resten, 0,0472, og utløpet havner så mye under
     bakken. Her ble hele renna senket 0,197, og utløpet med den. */
  const { svar: f } = regn((x, y) => 100 + 0.16 * y, 100.4, { id: 's11', s: 50, innlop: 'auto' });
  sjekk('litt fall å gi: innløpet senkes ned til minstefallet', f.senketInn, 0.1838, 0.001);
  sjekk('  og hele renna med resten', f.senket, 0.0472, 0.001);
  sjekk('  så utløpet havner bare resten under bakken', f.ender.hoyre.overflate - f.bunnUt, 0.0472, 0.001);
  sjekk('  fallet er minstefallet', f.fall, 10, 0.05);
  sjekk('  og overdekningen kravet', f.overdekning, 0.5, 1e-6);
  paastand('  merknaden sier begge', f.merknader.some(m => m.type === 'senket'
    && /^senket 0,05 m for overdekningen, innløpet 0,18 m til – innløpet ligger 0,23 m under grøftebunnen/.test(m.tekst)), JSON.stringify(f.merknader));
  // lengdeprofilet merker renna der den krysser senterlinja: 3,40 m fra innløpet, med minstefallet
  sjekk('bunnen i senterlinja: innløpet minus fallet over 3,40 m', Stikkrenner.bunnISenter(f), 99.169 - 0.034, 0.001);
}

console.log('\n6. Låste høyder står');
{
  const { svar: d } = regn(flatt, 101.5, { id: 's4', s: 42.5, innlop: 'venstre', bunnInn: 99.5, bunnUt: 99.48 });
  paastand('begge låst: høydene står', d.bunnInn === 99.5 && d.bunnUt === 99.48 && d.laastInn && d.laastUt);
  paastand('  for lite fall mellom dem sies', d.merknader.some(m => m.type === 'fall'), JSON.stringify(d.merknader));
  const hoy = regn(flatt, 101.5, { id: 's5', s: 42.5, innlop: 'venstre', bunnInn: 100.45, bunnUt: 100.3 }).svar;
  paastand('låst for høyt: renna senkes ikke, men overdekningen sies – og hvor', hoy.senket === 0 && hoy.senketInn === 0
    && hoy.bunnInn === 100.45 && hoy.merknader.some(m => m.type === 'overdekning' && /til venstre/.test(m.tekst)), JSON.stringify(hoy.merknader));
  paastand('  og at innløpet ligger over bakken', hoy.merknader.some(m => m.type === 'innlop'));
  paastand('  og at utløpet henger over bakken', hoy.merknader.some(m => m.type === 'utlop' && /henger/.test(m.tekst)));
  const inn = regn(flatt, 101.5, { id: 's6', s: 42.5, innlop: 'venstre', bunnInn: 99.6 }).svar;
  sjekk('bare innløpet låst: utløpet med minstefallet fra det', inn.bunnUt, 99.6 - 0.098, 0.001);
}

console.log('\n7. Det som ikke går');
{
  const { res: r7, svar: ute } = regn(flatt, 101.5, { id: 's7', s: 120 });
  paastand('profilet utenfor linja', ute.feil === 'profilet er utenfor linja', JSON.stringify(ute));
  // også når den som kaller, har et profil å gi – endeprofilet, som `geometriFor` svarer med
  const endeprofil = Stikkrenner.beregn({ id: 's7b', s: 120 }, r7.snittVed(100), r7.mal, { lengde: 100, terreng: flatt });
  paastand('  også med endeprofilet gitt: renna får ikke lengden derfra', endeprofil.feil === 'profilet er utenfor linja', JSON.stringify(endeprofil));
  // et hull i terrenget under vegen: endene har bakke, men profilet har ikke alt
  const hullUnder = regn((x, y) => (y > 0.8 && y < 1.2 ? NaN : 100), 101.5, { id: 's7c', s: 42.5 }).svar;
  paastand('et hull under vegen sies', hullUnder.merknader.some(m => m.type === 'terreng' && /hull i profilet/.test(m.tekst)),
    JSON.stringify(hullUnder.merknader));
  // et hull bare i snittet der en skjev renne krysser foten – ikke i krysset
  const hullFram = regn((x, y) => (x > 47 && x < 48 && Math.abs(y) < 0.5 ? NaN : 100 - 0.08 * (x - 42.5)), 101.5,
    { id: 's7d', s: 42.5, vinkel: 45 }).svar;
  paastand('  også i snittet der en skjev renne krysser foten', hullFram.merknader.some(m => /hull i profilet/.test(m.tekst)),
    JSON.stringify(hullFram.merknader));
  // terrenget mangler der enden går ut: ingen høyder å gi – ikke tall som ser riktige ut
  const hull = regn((x, y) => (y < -3 ? NaN : 100), 101.5, { id: 's8', s: 42.5 }).svar;
  paastand('terrenget mangler der renna går ut: ingen høyder', /terrenget mangler/.test(hull.feil || ''), JSON.stringify(hull));
  // bakken faller brattere enn fyllingen til høyre: skråningen når den aldri – uten hull i terrenget
  const stup = regn((x, y) => (y < 0 ? 100 + y : 100), 100.5, { id: 's9', s: 42.5 }).svar;
  paastand('fyllingen når ikke bakken: det sies, også uten hull', stup.merknader.some(m => m.type === 'terreng' && /søkebredden/.test(m.tekst)),
    JSON.stringify(stup.merknader));
  const k = Stikkrenner.fraMal({ stikkrenneDim: 'x', stikkrenneFall: -3, stikkrenneOverdekning: 99, stikkrenneTillegg: null });
  paastand('malen: et ugyldig tall er forvalget, et for stort klemmes', k.dim === 600 && k.fall === 0 && k.overdekning === 5 && k.tillegg === 0.5,
    JSON.stringify(k));
}

console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
