'use strict';
/**
 * Formen på et prosjekt: anleggslista og vinduene inn i det aktive anlegget.
 *
 * HVORFOR DETTE LIGGER FOR SEG SELV.
 * Logikken sto midt i `App.klargjorProsjekt` i app.js. Den er ren databehandling
 * – den rører verken skjermen, kartet eller lagringen – men app.js kan ikke
 * lastes utenfor en nettleser, og derfor kunne ingen node-prøve nå den.
 *
 * Det gikk akkurat så galt som det måtte: `test/anleggsprove.js` hadde ikke ett
 * eneste `require`. Den SKREV AV aksessor-logikken øverst i seg selv og prøvde
 * kopien. Kopien var allerede to felt på etterskudd – den hadde
 * `['ip', 'vip', 'mal', 'tomt']` mens programmet hadde fått `tverrfall` og
 * `plasser` i tillegg. Målt: med hele aksessor-mekanismen revet ut av app.js
 * – `for (const felt of [])` – meldte prøven fortsatt «24 ok, 0 feil».
 *
 * Tjuefire grønne hakk som ikke kunne bli røde uansett hva som skjedde med
 * koden. Nå ligger logikken her, og prøven laster den.
 */

/* Hentes der de bor: globaler i nettleseren, moduler i node. Et oppslag i
   stedet for en fast referanse, slik at rekkefølgen på script-taggene ikke blir
   en usynlig avhengighet. */
function _masser() {
  if (typeof StandardMal !== 'undefined') return { StandardMal };
  return require('./masser.js');
}
function _veiklasser() {
  if (typeof Veiklasser !== 'undefined') return { Veiklasser };
  return require('./veiklasser.js');
}
function _tomt() {
  if (typeof StandardTomtemal !== 'undefined') return { StandardTomtemal, nyTomt };
  return require('./tomt.js');
}
function _ror() {
  if (typeof Ror !== 'undefined') return Ror;
  return require('./ror.js');
}
function _groft() {
  if (typeof Groft !== 'undefined') return Groft;
  return require('./groft.js');
}

/**
 * Grøftefeltene i et røranlegg, gjort om til det regnestykket tåler.
 *
 * Som rørfeltene: en prosjektfil kan være redigert for hånd eller sendt fra
 * en kollega. Et tall utenfor grensene klemmes; det som ikke er et tall,
 * faller tilbake på nivået over – anlegget på standarden, koden og
 * strekningen på anlegget.
 */
function _rettGroft(a, G) {
  const lagret = a.mal.groft && typeof a.mal.groft === 'object' ? a.mal.groft : {};
  const m = Object.assign({}, G.StandardGroftmal);
  for (const f of Object.keys(G.StandardGroftmal)) {
    const v = G.klem(f, lagret[f]);
    if (v !== null) m[f] = v;
  }
  a.mal.groft = m;
  const malFelt = kilde => {
    const ut = {};
    if (kilde && typeof kilde === 'object' && !Array.isArray(kilde)) {
      for (const f of G.MALFELT) { const v = G.klem(f, kilde[f]); if (v !== null) ut[f] = v; }
    }
    return ut;
  };
  for (const k of Object.values(a.ror.koder)) {
    if (!('groft' in k)) continue;
    const g = malFelt(k.groft);
    if (Object.keys(g).length) k.groft = g; else delete k.groft;
  }
  const j = a.ror.groft && typeof a.ror.groft === 'object' && !Array.isArray(a.ror.groft) ? a.ror.groft : {};
  const id = v => v != null && typeof v !== 'object';
  /* Avstivingen står bare når den er en av dem regnestykket kjenner; en
     kassebredde uten kasse, eller utenfor grensene, faller bort – da gjelder
     standarden. */
  const avstiving = s => {
    if (!G.AVSTIVING.includes(s.avstiving)) return {};
    const kb = s.avstiving === 'kasse' ? G.klem('kassebredde', s.kassebredde) : null;
    return kb !== null ? { avstiving: s.avstiving, kassebredde: kb } : { avstiving: s.avstiving };
  };
  a.ror.groft = {
    // en strekning fra et punkt til det samme punktet dekker ingenting
    strekninger: (Array.isArray(j.strekninger) ? j.strekninger : [])
      .filter(s => s && typeof s === 'object' && id(s.fra) && id(s.til) && String(s.fra) !== String(s.til))
      .map(s => Object.assign({ fra: String(s.fra), til: String(s.til), mal: malFelt(s.mal),
        fjell: G.klem('fjell', s.fjell), egen: s.egen === true }, avstiving(s))),
    sammen: (Array.isArray(j.sammen) ? j.sammen : [])
      .filter(p => Array.isArray(p) && p.length === 2 && p.every(id) && String(p[0]) !== String(p[1]))
      .map(p => p.map(String))
  };
}

function _rorplan() {
  if (typeof RorPlan !== 'undefined') return RorPlan;
  return require('./rorplan.js');
}

/**
 * Plandelen i et tegnet røranlegg, gjort om til det programmet tåler.
 *
 * Som grøftejusteringene: en prosjektfil kan være redigert for hånd. Et
 * punkt uten to tall kan ikke tegnes; et rør, en kum eller en låst høyde som
 * peker på noe som ikke finnes, ville gitt en linje uten trase eller en grop
 * uten rør. Det som ikke treffer, tas bort; tall utenfor grensene klemmes.
 */
function _rettPlan(a, RP) {
  const erObjekt = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = v => (v != null && typeof v !== 'object' && String(v) !== '' ? String(v) : null);
  const tall = v => {
    const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };
  const liste = v => (Array.isArray(v) ? v : []);
  const p = erObjekt(a.ror.plan) ? a.ror.plan : {};
  const traseer = [], punktTil = new Map();
  for (const t of liste(p.traseer)) {
    const tid = erObjekt(t) ? id(t.id) : null;
    if (!tid || traseer.some(x => x.id === tid)) continue;
    const punkter = [];
    for (const q of liste(t.punkter)) {
      if (!erObjekt(q)) continue;
      const pid = id(q.id), lat = tall(q.lat), lon = tall(q.lon);
      if (!pid || punktTil.has(pid) || punkter.some(x => x.id === pid)) continue;
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      punkter.push({ id: pid, lat, lon });
    }
    if (punkter.length < 2) continue;
    traseer.push({ id: tid, punkter });
    for (const q of punkter) punktTil.set(q.id, tid);
  }
  const ror = [];
  for (const r of liste(p.ror)) {
    if (!erObjekt(r)) continue;
    const rid = id(r.id), trase = id(r.trase), kode = r.kode != null ? String(r.kode).trim() : '';
    if (!rid || !kode || !traseer.some(t => t.id === trase) || ror.some(x => x.id === rid)) continue;
    // `klem` klemmer 40 ned til 10, men avviser alt under −10: det settes til −10, ikke midt i traseen
    const side = RP.klem('side', r.side);
    ror.push({ id: rid, trase, kode, side: side === null ? (tall(r.side) < 0 ? -10 : 0) : side,
      regel: r.regel === 'selvfall' || r.regel === 'trykk' ? r.regel : null, motsatt: r.motsatt === true });
  }
  const paaRoret = (rid, pid) => { const r = ror.find(x => x.id === rid); return !!r && punktTil.get(pid) === r.trase; };
  const kummer = [];
  for (const k of liste(p.kummer)) {
    if (!erObjekt(k)) continue;
    const kid = id(k.id), rid = id(k.ror), pid = id(k.punkt);
    if (!kid || !paaRoret(rid, pid) || kummer.some(x => x.id === kid)) continue;
    const d = RP.klem('diameter', k.diameter);
    kummer.push({ id: kid, ror: rid, punkt: pid, diameter: d === null ? RP.StandardPlanmal.kum.diameter : d });
  }
  const laast = [];
  for (const l of liste(p.laast)) {
    if (!erObjekt(l)) continue;
    const rid = id(l.ror), pid = id(l.punkt), bunn = tall(l.bunn);
    if (!paaRoret(rid, pid) || bunn === null || laast.some(x => x.ror === rid && x.punkt === pid)) continue;
    const ut = { ror: rid, punkt: pid, bunn };
    const k = l.kilde;
    if (erObjekt(k) && id(k.anlegg) && id(k.punkt) && tall(k.topp) !== null) {
      ut.kilde = { anlegg: id(k.anlegg), punkt: id(k.punkt), topp: tall(k.topp) };
    }
    // lagt av «Legg høydene» (etappe 3d-2) – en påkobling er aldri det
    else if (l.lagt === true) ut.lagt = true;
    laast.push(ut);
  }
  const greiner = [];
  for (const g of liste(p.greiner)) {
    if (!erObjekt(g) || !erObjekt(g.til)) continue;
    const tid = id(g.trase), ende = g.ende === 'start' || g.ende === 'slutt' ? g.ende : null;
    const til = { trase: id(g.til.trase), punkt: id(g.til.punkt) };
    if (!ende || !traseer.some(t => t.id === tid) || til.trase === tid || punktTil.get(til.punkt) !== til.trase) continue;
    if (greiner.some(x => x.trase === tid && x.ende === ende)) continue;
    greiner.push({ trase: tid, ende, til });
  }
  a.ror.plan = { traseer, ror, kummer, laast, greiner };
  const m = erObjekt(a.mal.plan) ? a.mal.plan : {}, kum = erObjekt(m.kum) ? m.kum : {};
  const av = erObjekt(m.avvik) ? m.avvik : {};
  const std = RP.StandardPlanmal, sa = std.avvik, ell = (v, s) => (v === null ? s : v);
  a.mal.plan = {
    overdekning: ell(RP.klem('overdekning', m.overdekning), std.overdekning),
    kryssKlaring: ell(RP.klem('kryssKlaring', m.kryssKlaring), std.kryssKlaring),
    kum: { diameter: ell(RP.klem('diameter', kum.diameter), std.kum.diameter),
      arbeidsrom: ell(RP.klem('arbeidsrom', kum.arbeidsrom), std.kum.arbeidsrom) },
    // trykkrørene (etappe 3d): en fil fra før har dem ikke, og får standarden
    brekk: ell(RP.klem('brekk', m.brekk), std.brekk),
    trykkMinFall: ell(RP.klem('trykkMinFall', m.trykkMinFall), std.trykkMinFall),
    // avviket mot innmålt: en fil fra før etappe 3c har det ikke, og knappen er da av
    avvik: { vis: av.vis === true,
      plan: ell(RP.klem('avvikPlan', av.plan), sa.plan),
      selvfall: ell(RP.klem('avvikHoyde', av.selvfall), sa.selvfall),
      trykk: ell(RP.klem('avvikHoyde', av.trykk), sa.trykk),
      sok: ell(RP.klem('sok', av.sok), sa.sok) }
  };
  for (const k of Object.values(a.ror.koder)) {
    for (const f of ['gods', 'overdekning', 'minFall', 'maksFall']) {
      if (!(f in k)) continue;
      const v = RP.klem(f, k[f]);
      if (v === null) delete k[f]; else k[f] = v;
    }
    if ('regel' in k && k.regel !== 'selvfall' && k.regel !== 'trykk') delete k.regel;
  }
}

/**
 * Feltene i et røranlegg fra fil, gjort om til det programmet regner med.
 *
 * En prosjektfil kan være redigert for hånd eller sendt fra en kollega, og
 * feltene går rett inn i regnestykker og skjemaer. En dimensjon som tekst ble
 * limt inn i kodetabellen uten escaping; en sone som ikke finnes gir NaN i
 * hver eneste koordinat; maks avstand på 9 999 m trekker én strek gjennom
 * alle punktene med samme kode. Det som ikke kan brukes, får standardverdien.
 */
function _rettRorfelt(a, R) {
  const tall = v => {
    const x = typeof v === 'string' ? parseFloat(v) : v;
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
  };
  const m = tall(a.mal.maksAvstand);
  a.mal.maksAvstand = m !== null && m >= 5 && m <= 200 ? m : R.StandardRormal.maksAvstand;
  const sone = tall(a.ror.sone);
  a.ror.sone = [32, 33, 35].includes(sone) ? sone : 32;
  /* Punktene. Et `null` i lista stoppet åpningen av hele prosjektet, med
     panelene alt tømt. Et punkt uten tre tall kan ikke tegnes – det hopper
     innlesingen også over. */
  const erObjekt = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const punkter = [];
  for (const p of a.ror.punkter) {
    if (!erObjekt(p)) continue;
    const n = tall(p.n), o = tall(p.o), z = tall(p.z);
    if (n === null || o === null || z === null) continue;
    p.n = n; p.o = o; p.z = z;
    p.kode = p.kode != null && String(p.kode).trim() ? String(p.kode) : 'UTEN KODE';
    p.id = p.id != null && String(p.id) ? String(p.id) : `${p.kode}|${n.toFixed(3)}|${o.toFixed(3)}|${z.toFixed(3)}`;
    const nr = tall(p.nr);
    p.nr = nr !== null ? nr : punkter.length + 1;
    punkter.push(p);
  }
  a.ror.punkter = punkter;
  /* Og rettingene: id-er, og par av id-er. Et par som ikke var et par, fikk
     linjebyggingen til å kaste ved hver tegning. */
  const id = v => v != null && typeof v !== 'object';
  const par = v => Array.isArray(v) && v.length === 2 && v.every(id);
  const ret = a.ror.retting;
  ret.av = ret.av.filter(id).map(String);
  ret.brudd = ret.brudd.filter(par).map(v => v.map(String));
  ret.koble = ret.koble.filter(par).map(v => v.map(String));
  for (const kode of Object.keys(a.ror.koder)) {
    const k = a.ror.koder[kode];
    if (!k || typeof k !== 'object' || Array.isArray(k)) { delete a.ror.koder[kode]; continue; }
    const tolket = R.tolkKode(kode);
    if (k.form !== 'linje' && k.form !== 'punkt') k.form = tolket.form;
    k.dim = R.dimensjon(k.dim);
    if (!Object.prototype.hasOwnProperty.call(R.FARGER, k.farge)) {
      k.farge = k.form === 'punkt' ? 'punkt'
        : Object.prototype.hasOwnProperty.call(R.FARGER, tolket.system) ? tolket.system : 'p6';
    }
    k.vis = k.vis !== false;
  }
  // en kode punktene har, men tabellen mangler, får tolkningen sin
  a.ror.koder = R.koderFra(a.ror.punkter, a.ror.koder);
  a.ror.kilder = a.ror.kilder.filter(erObjekt);
  for (const k of a.ror.kilder) {
    const n = tall(k.antall);
    k.antall = n !== null && n >= 0 ? Math.round(n) : 0;
  }
}

/**
 * En mal fra en eldre fil, brakt opp til dagens navn.
 *
 * Lå som `App.moderniserMal`. Den er ren – ingen `this`, ingen skjerm – og
 * hører til formen på fila, ikke til grensesnittet.
 */
function moderniserMal(mal) {
  const m = mal || {};
  if (m.grofteDybde != null && m.grofteDybdePlanum == null) {
    const overbygning = (m.slitelagTykkelse || 0.10) + (m.baerelagTykkelse || 0.60);
    m.grofteDybdePlanum = Math.max(0.05, +(m.grofteDybde - overbygning).toFixed(3));
    delete m.grofteDybde;
  }
  if (m.breddeutvidelse && !m.breddeIKurve) {
    m.breddeIKurve = m.breddeutvidelse
      .filter(r => r[1] > 0)
      .map(r => [r[0], r[0] + 4, (m.vegbredde || 4.5) + r[1], (m.vegbredde || 4.5) + r[1]]);
    delete m.breddeutvidelse;
  }
  if (m.maksStigning && !m.stigningIKurve) {
    m.stigningIKurve = m.maksStigning.map(r => [r[0], r[1], r[1]]);
    delete m.maksStigning;
  }
  /* Unntaket for korte rettstrekk kom med etter at malen ble lagret. Det
     hører til klassen, og en mal uten det får klassens – ikke standardmalens:
     den er K5, og K5 sitt unntak gjelder returretningen. */
  // bare en vegmal – en tomt eller et rør har ingen veiklasse og ingen vegbredde
  if (m.kortStrekk === undefined && (m.veiklasse !== undefined || m.vegbredde !== undefined)) {
    const k = m.veiklasse && _veiklasser().Veiklasser[m.veiklasse];
    m.kortStrekk = k && k.kortStrekk ? Object.assign({}, k.kortStrekk) : null;
  }
  return m;
}

/**
 * Bygger prosjektet om til dagens form, og legger på vinduene inn i anlegget.
 *
 * Returnerer det samme objektet, endret på plass – kallerne regner med det.
 */
function klargjor(P) {
  if (!P) return P;
  const { StandardMal } = _masser();
  const { StandardTomtemal, nyTomt } = _tomt();

  /* ET PROSJEKT MED GEOMETRI ER IKKE «UBESTEMT».
     Flagget slettes med `delete` når man velger type, så det står ikke i den
     lagrede fila – og åpningen bygger prosjektet som
     `Object.assign(nyttProsjekt(), fila)`, der standardverdien `true` da
     kommer tilbake. Et ferdig tegnet prosjekt kom altså opp med «Hva skal du
     regne på?», og ett klikk der byttet ut hele det aktive anlegget: målt en
     tomt med 5 852 m³ skjæring som ble null, uten en angrepost.
     Prøven står her og ikke i `apne`, fordi det er den samme fella for
     import, for angre, og for hver annen vei et prosjekt kan komme inn. Et
     HELT NYTT prosjekt har ingen geometri og forblir ubestemt – det er
     nettopp da spørsmålet er på sin plass. */
  if (Array.isArray(P.anlegg) && P.anlegg.some(a => (a.ip && a.ip.length)
    || (a.tomt && a.tomt.punkter && a.tomt.punkter.length)
    || (a.ror && a.ror.punkter && a.ror.punkter.length))) {
    delete P.ubestemt;
  }

  /* Er `mal` eller `ip` en egen nøkkel pa prosjektet, er fila fra før
     tomtemodus. I den nye forma finnes de bare som ikke-tellbare aksessorer,
     og de blir aldri lagret - sa dette er et trygt kjennetegn.

     Sjekken kan ikke vaere "mangler anlegg". Apningen setter prosjektet
     sammen som Object.assign(nyttProsjekt(), fila), og da har resultatet
     alltid et anlegg - det tomme fra nyttProsjekt(). En gammel fil ville
     da fatt innholdet sitt kastet, uten et eneste tegn pa at noe var galt. */
  /* EN AKSESSOR ER IKKE EN GAMMEL FIL.
     Her sto `hasOwnProperty`, og den er SANN også for aksessorene denne
     funksjonen selv legger på nedenfor. Kjørte man klargjøringen to ganger på
     samme objekt – og det gjør en prøve, en import eller hva som helst som
     vil forsikre seg – så den sine egne `mal`, `ip` og `vip`, konkluderte med
     «gammel fil», og bygde hele anleggslista om til ETT veganlegg. Tre anlegg
     ble til ett, uten et eneste tegn på at noe var galt.
     Kjennetegnet på den gamle forma er en VERDI på prosjektet, ikke et navn. */
  const eier = k => {
    const d = Object.getOwnPropertyDescriptor(P, k);
    return !!d && 'value' in d;
  };
  const gammelForm = eier('mal') || eier('ip') || eier('vip');
  if (gammelForm || !Array.isArray(P.anlegg) || !P.anlegg.length) {
    P.anlegg = [{
      id: 'a1', type: 'veg', navn: P.navn || 'Veg',
      ip: P.ip || [], vip: P.vip || [], mal: P.mal || Object.assign({}, StandardMal)
    }];
    P.aktivt = 'a1';
    P.versjon = 2;
  }
  /* Males FØR malene flettes: etterpa har hvert anlegg nøkkelen uansett.
     RØR HAR INGEN UTSKIFTING. Rørmalen har ingen `utskifting`-nøkkel og skal
     ikke ha det – uten unntaket ville hvert prosjekt med et røranlegg blitt
     meldt som «lagret før masseutskiftingen fantes» ved hver åpning. */
  const manglerUtskifting = P.anlegg.some(a => a && a.type !== 'ror' && !a.ror && a.mal
    && typeof a.mal === 'object' && !('utskifting' in a.mal));
  for (const a of P.anlegg) {
    if (!a.type) a.type = a.tomt ? 'tomt' : a.ror ? 'ror' : 'veg';
    if (a.type === 'tomt') {
      a.mal = Object.assign({}, StandardTomtemal, a.mal || {});
      /* Nivaet ma flettes for seg. Object.assign gar bare ett niva ned, sa
         en lagret tomt ville byttet ut hele `nivaa` med sin egen - og felt
         som kom til etterpa ble undefined i stedet for a fa standardverdien.
         Da regnet et gammelt prosjekt med NaN uten a si fra. */
      const nivaa = Object.assign(nyTomt().nivaa, (a.tomt && a.tomt.nivaa) || {});
      a.tomt = Object.assign(nyTomt(), a.tomt || {});
      a.tomt.nivaa = nivaa;
      if (!Array.isArray(a.tomt.punkter)) a.tomt.punkter = [];
      if (!Array.isArray(a.tomt.kanter)) a.tomt.kanter = [];
      a.ip = a.ip || [];      // se nyttAnlegg: tomme lister, ikke undefined
      a.vip = a.vip || [];
    } else if (a.type === 'ror') {
      /* RØRET FÅR SIN EGEN MAL, IKKE VEGENS.
         Uten denne greina gikk røret inn i `else` under og fikk hele vegmalen
         flettet inn – et rør med vegbredde og grøftedybde, og skjemaene ville
         lest dem som om de betydde noe. Etappe 2 legger grøfta inn her. */
      const R = _ror();
      a.mal = Object.assign({}, R.StandardRormal, a.mal || {});
      a.ror = Object.assign(R.nyRor(), a.ror || {});
      if (!Array.isArray(a.ror.punkter)) a.ror.punkter = [];
      if (!Array.isArray(a.ror.kilder)) a.ror.kilder = [];
      if (!a.ror.koder || typeof a.ror.koder !== 'object') a.ror.koder = {};
      a.ror.retting = Object.assign({ av: [], brudd: [], koble: [] }, a.ror.retting || {});
      for (const k of ['av', 'brudd', 'koble']) if (!Array.isArray(a.ror.retting[k])) a.ror.retting[k] = [];
      _rettRorfelt(a, R);
      _rettGroft(a, _groft());
      // et tegnet anlegg har en plan; et innmålt får ingen
      if (a.ror.plan) _rettPlan(a, _rorplan());
      a.ip = a.ip || [];      // se nyttAnlegg: tomme lister, ikke undefined
      a.vip = a.vip || [];
    } else {
      // en vegmal fra en eldre fil kan ligge inne i anlegget ogsa
      a.mal = Object.assign({}, StandardMal, moderniserMal(a.mal || {}));
      a.ip = a.ip || [];
      a.vip = a.vip || [];
    }
  }
  /* EN FIL SOM ER ELDRE ENN MASSEUTSKIFTINGEN SKAL SI DET.
     Et prosjekt lagret før utskiftingen fins har ingen `utskifting`-nøkkel, og
     `Object.assign` over lar da standardverdien – PÅ – bli stående. Det er med
     vilje: ellers ville gamle og nye prosjekter i samme program regnet to
     forskjellige svar, og det er verre. Men kubikken ENDRER seg, og på et
     tilbud som er sendt er det ikke noe man skal finne ut av selv. Flagget
     leses av åpningen, som sier det én gang.

     IKKE TELLBART, SÅ DET IKKE BLIR LAGRET. `JSON.stringify` tar bare tellbare
     felt, og et vanlig `P.utskiftingErNy = …` ville fulgt med ut i fila – og
     `eier()` over ser etter en VERDI pa prosjektet, sa et lagret flagg er
     nettopp den slags felt som har skapt bry før. Det hører til denne
     apningen, ikke til prosjektet. */
  Object.defineProperty(P, 'utskiftingErNy',
    { value: manglerUtskifting, enumerable: false, configurable: true, writable: true });
  /* TO ANLEGG MED SAMME ID ER ETT ANLEGG SOM IKKE FINNES.
     Alt slår opp med `find(a => a.id === P.aktivt)`, som gir det FØRSTE. Får
     to samme id – ved en håndredigert fil, en sammenslåing eller en framtidig
     «kopier anlegg» – blir det andre permanent uoppnåelig, og slettingen tar
     feil anlegg. Ett gjennomløp ved åpning koster ingenting og gjør at
     tilstanden ikke kan oppstå. */
  const sett = new Set();
  for (const a of P.anlegg) {
    if (!a.id || sett.has(a.id)) {
      a.id = 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    }
    sett.add(a.id);
  }
  if (!P.anlegg.some(a => a.id === P.aktivt)) P.aktivt = P.anlegg[0].id;

  /* TVERRFALLET HØRER TIL VEGEN, IKKE TIL PROSJEKTET.
     Lista er nøklet på STASJON langs en senterlinje – {s, ...}. Lå den på
     prosjektet, delte to veger den: et tverrfall lagt inn i profil 120 på
     Veg 1 slo også inn i profil 120 på Veg 2, som er et helt annet sted i
     terrenget. Med ett anlegg fantes ikke problemet, og derfor sto det slik.
     Gamle filer har lista på prosjektet; den flyttes til det første
     veganlegget, der den kom fra. */
  for (const a of P.anlegg) if (!Array.isArray(a.tverrfall)) a.tverrfall = [];
  if (Array.isArray(P.tverrfall) && P.tverrfall.length) {
    const foerste = P.anlegg.find(a => a.type === 'veg') || P.anlegg[0];
    if (!foerste.tverrfall.length) foerste.tverrfall = P.tverrfall;
  }
  delete P.tverrfall;

  /* Snuplasser og møteplasser hører til ANLEGGET, av samme grunn som
     tverrfallslista over: to veger i samme prosjekt har hver sine, og en
     stasjon på den ene er et helt annet sted i terrenget enn på den andre. */
  for (const a of P.anlegg) if (!Array.isArray(a.plasser)) a.plasser = [];
  /* Stikkrennene likeså – og en renne uten et profil å stå i er ingen renne.
     Resten av tallene klemmes der de leses (se stikkrenner.js). */
  for (const a of P.anlegg) {
    a.stikkrenner = Array.isArray(a.stikkrenner)
      ? a.stikkrenner.filter(r => r && typeof r.s === 'number' && Number.isFinite(r.s)) : [];
  }

  const aktivt = () => P.anlegg.find(a => a.id === P.aktivt) || P.anlegg[0];
  for (const felt of FELT) {
    delete P[felt];                       // fjern verdien fra den gamle forma
    Object.defineProperty(P, felt, {
      configurable: true,
      enumerable: false,
      get() { return aktivt()[felt]; },
      set(v) { aktivt()[felt] = v; }
    });
  }
  return P;
}

/* Feltene som er VINDUER inn i det aktive anlegget. Lista står her og ikke
   inne i løkka, så en prøve kan lese den og kreve at hvert felt virker – da
   kan ikke et nytt felt legges til uten at det blir prøvd. */
const FELT = ['ip', 'vip', 'mal', 'tomt', 'ror', 'tverrfall', 'plasser', 'stikkrenner'];

const Prosjektform = { klargjor, moderniserMal, FELT };

if (typeof module !== 'undefined') {
  module.exports = Prosjektform;
}
