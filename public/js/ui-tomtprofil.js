'use strict';
/**
 * Snitt gjennom tomta.
 *
 * Det samme lengdeprofilen er for en veg: et bilde av hva som skal graves og
 * fylles, som man kan lese av mens man setter høyden. Snittet legges gjennom
 * tomtas tyngdepunkt, langs fallretningen - det er den veien det ferdige nivaet
 * heller, og dermed den retningen forskjellen mot terrenget er størst.
 *
 * Uten et slikt bilde ser man bare tall. Da vet man ikke om det er ett hjørne
 * som drar hele skjæringen, eller om tomta ligger jevnt for dypt.
 */

const Tomteprofil = {
  app: null,
  lerret: null,
  retning: 'fall',        // 'fall' eller 'tvers'
  forskyvning: 0.5,       // 0..1 tvers over tomta, 0,5 = gjennom tyngdepunktet

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tomtprofil');
    if (!this.lerret) return this;
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);
    /* Klikk i snittet flytter det ferdige nivaet dit man peker. Det er den
       raskeste maten a prøve seg fram pa - samme grep som a dra et knekkpunkt
       i lengdeprofilen. */
    this.lerret.addEventListener('click', e => this.klikk(e));
    this.lerret.style.cursor = 'ns-resize';
    return this;
  },

  /**
   * Hvor langt skråningene faktisk går, målt på beregningen som er kjørt.
   *
   * Snittet skal vise det samme som volumet er regnet på. Leses tallet fra
   * søkebredden i stedet, tegnes en strek som stopper et annet sted enn der
   * skråningen slutter – og da ser den ferdige flaten ut til å stupe rett ned.
   */
  /** Helningsfeltet fra siste beregning, bufret så snittet ikke bygger det på nytt. */
  _felt(app) {
    const fot = app.resultat && app.resultat.skraningsfot;
    if (!fot) return null;
    if (this._feltFor !== fot) { this._feltFor = fot; this._feltBuffer = Tomtmasser.helningsfelt(fot); }
    return this._feltBuffer;
  },

  _rekkevidde(app) {
    const f = app.resultat && app.resultat.skraningsfot;
    if (!f || !f.length) return app.P.mal.maksSokebredde || 45;
    return f.reduce((m, q) => Math.max(m, q.ut || 0), 0);
  },

  /** Punktene i snittet, med terreng, fjell og ferdig nivå. */
  snitt() {
    const app = this.app;
    if (!app || !app.erTomt() || !app.terreng) return null;
    const t = app.P.tomt;
    const p = app.tomtIUtm(t);
    if (p.length < 3) return null;

    const tp = Tomtmasser.tyngdepunktAv(p);
    /* Retningen snittet legges i. Langs fallet er standarden, for det er den
       veien det ferdige nivaet heller og dermed der forskjellen mot terrenget
       er størst. Pa tvers er den andre man vil se - det er den som viser om
       tomta ligger skjevt i lia. */
    let grader = t.nivaa.fallretning || 0;
    if (this.retning === 'tvers') grader += 90;
    else if (/^kant\d+$/.test(this.retning)) {
      /* Snitt vinkelrett pa en valgt kant. Det er dette man vil se nar man
         lurer pa hvordan den ene siden blir - om bergveggen star der den skal,
         eller hvor langt skraningen gar ut mot naboen. Samme spørsmal som
         tverrprofilen svarer pa for en veg.

         Retningen tas fra kantens utoverrettede normal, sa snittet peker ut av
         tomta. Peker den innover, ser man skraningen speilvendt - og det er
         akkurat den forvekslingen som gjør at man tror utslaget gar feil vei. */
      /* SLÅ OPP PÅ NUMMER, IKKE PÅ PLASS I LISTA.
         `Tomt.kanter` hopper over kanter med lengde null – derfor bærer hvert
         element sitt eget `nr` (tomt.js:356). Med ett dobbeltklikket hjørne er
         plass og nummer ikke lenger det samme: «vinkelrett på side 5» la seg
         på side 6, og på den siste ble `k` undefined, så snittet falt stille
         tilbake til fallretningen mens etiketten fortsatt sa «Vinkelrett på
         kant 6». Kartet gjør det riktig (ui-kart.js setter 'kant' + k.nr), og
         app.js har en hel kommentarblokk om nettopp denne forvekslingen –
         profilen var det ene stedet rettelsen ikke var gjort. */
      const kNr = +this.retning.slice(4);
      const k = Tomt.kanter(p).find(q => q.nr === kNr);
      if (k) grader = ((Math.atan2(k.nx, k.ny) * 180 / Math.PI) % 360 + 360) % 360;
    }
    const rad = grader * Math.PI / 180;
    // enhetsvektor langs snittet; nord er (0,1), øst er (1,0)
    const ex = Math.sin(rad), ey = Math.cos(rad);
    // normalen, som snittet forskyves langs
    const nx = Math.cos(rad), ny = -Math.sin(rad);

    /* Hvor langt tomta strekker seg vinkelrett pa snittet - det er der
       skyveren beveger seg. */
    let tMin = Infinity, tMaks = -Infinity;
    for (const q of p) {
      const u = (q.x - tp.x) * nx + (q.y - tp.y) * ny;
      tMin = Math.min(tMin, u); tMaks = Math.max(tMaks, u);
    }
    const skyv = tMin + (tMaks - tMin) * Math.max(0, Math.min(1, this.forskyvning));
    const senter = { x: tp.x + nx * skyv, y: tp.y + ny * skyv };

    /* Hvor langt snittet rekker: til det er godt utenfor bade tomta og
       skraningene, sa man ser hvor de treffer terrenget. */
    let rekke = 0;
    for (const q of p) rekke = Math.max(rekke, Math.hypot(q.x - senter.x, q.y - senter.y));
    /* Snittet ma rekke sa langt skraningen faktisk gar. Her sto søkebredden,
       og nadde ikke skraningen bakken innenfor den, stoppet streken midt i
       lufta - i snittet sa det ut som om den ferdige flaten stupte rett ned.
       Det er ikke noe man kan bygge, og det var heller ikke det programmet
       regnet: det er bare der tegningen sluttet. */
    rekke += Math.max(10, Math.min(200, this._rekkevidde(app) + 5));

    const fjell = app.fjellmodellIUtm();   // sonderingene ma vaere i UTM, se app.js
    const nivaa = app.tomtenivaaIUtm(t);
    const mal = app.P.mal;
    /* ÉN KILDE TIL OVERBYGNINGEN. Her sto den fjerde kopien av den samme
       summen. Kommer et lag til i malen, blir en av kopiene stående igjen med
       fire ledd – og da tegner snittet et annet planum enn det volumet regner. */
    const ob = app.overbygningstykkelse();

    /* Er tomta tegnet som yttergrense, er det den INNRYKKEDE flaten som skal
       planeres. Snittet ma vise den, ellers ser man en flate som ikke skal
       bygges og skraninger som starter feil sted. */
    const flate = (t.omrissBetyr === 'yttergrense' && app._innerflate) ? app._innerflate : p;
    const kantFor = i => (t.kanter && t.kanter[i]) || {};

    /* TRAUET LESES AV BEREGNINGEN, IKKE REGNET OM IGJEN.
       Hver rute i `res.rutenett` bærer `zTrau` og `utskift` – og kommentaren
       der de legges inn (tomtmasser.js:611-616) sier rett ut at de ble tatt med
       for at tegningen skal kunne vise trauet. Ingen leste dem.

       Utslaget var stygt: slås masseutskifting på, males HELE tomta grønn som
       fylling. Cellefeltet `d` måles fra trau-bunnen (tomtmasser.js:522), så
       med fjellet tre meter nede er `d` negativ overalt. Målt på en 40 × 30 m
       tomt, flat mark, fjell 3 m nede: 4 585 m³ masseutskifting gravd ut, og
       beregningen melder 0 m³ skjæring og 4 454 m³ fylling. En grop blir til
       en oppfylling på skjermen.

       Å regne trauet på nytt her ville vært en andre sannhet om det samme.
       Oppslaget er derfor en ren indeks på beregningens egne ruter. */
    const rute = Math.max(1, mal.rutestorrelse || 1);
    let trauKart = null;
    const rn = app.resultat && app.resultat.rutenett;
    if (Array.isArray(rn) && rn.length) {
      trauKart = new Map();
      for (const c of rn) {
        if (c.zTrau == null) continue;
        trauKart.set(Math.round(c.x / rute) + ',' + Math.round(c.y / rute), c);
      }
    }
    const trauVed = (x, y) => (trauKart
      ? trauKart.get(Math.round(x / rute) + ',' + Math.round(y / rute)) || null : null);

    const punkt = [];
    const steg = Math.max(0.5, (2 * rekke) / 400);
    for (let d = -rekke; d <= rekke; d += steg) {
      const x = senter.x + ex * d, y = senter.y + ey * d;
      const zT = app.terreng.z(x, y);
      const inne = Tomtmasser.innenforPolygon(flate, x, y);
      let zF = null;
      if (Number.isFinite(zT)) {
        const dyp = fjell.dybde(x, y);
        zF = zT - (Number.isFinite(dyp) ? dyp : 0.5);
      }
      /* Utenfor flaten gar jordarbeidsflaten videre som skraning, med samme
         regnestykke som volumet bruker. Her sto det ingenting - snittet stoppet
         i kanten, og skraningen, som er halve poenget med a se pa et snitt,
         var rett og slett ikke tegnet. */
      let zSkraning = null;
      /* Er omrisset yttergrensen, slutter inngrepet i den streken – men
         skråningen KUTTES ikke der. Den brattes opp akkurat så mye at den når
         bakken innenfor grensa, og snittet må tegne den slik. Sto det et kutt
         her i stedet, viste snittet en loddrett flate som ingen kan bygge, og
         som programmet heller ikke regnet på. */
      const utenforGrensa = t.omrissBetyr === 'yttergrense'
        && !Tomtmasser.innenforPolygon(p, x, y)
        && Tomtmasser.naermestePaOmriss(p, x, y).d > 0.6;
      if (!inne && !utenforGrensa && Number.isFinite(zT)) {
        const naer = Tomtmasser.naermestePaOmriss(flate, x, y);
        const kant = kantFor(naer.kant);
        const zKant = Tomtmasser.nivaaVed(nivaa, naer.x, naer.y, tp);
        const zTKant = app.terreng.z(naer.x, naer.y);
        if (Number.isFinite(zKant) && naer.d <= rekke) {
          const planumKant = zKant - ob;
          const skjaerer = Number.isFinite(zTKant) ? zTKant > planumKant : zT > planumKant;
          // nøyaktig samme helning som volumet er regnet med
          const tvunget = Tomtmasser.tvungetVed(this._felt(app), naer.kant, naer.u);
          const z = skjaerer
            ? Tomtmasser.skraningsflate(naer.d, planumKant, zF == null ? zT - 0.5 : zF, kant, mal, tvunget)
            : Tomtmasser.fyllingsflate(naer.d, planumKant, kant, mal, tvunget);
          /* Skraningen slutter der den møter terrenget. Uten den prøven ville
             streken fortsatt inn i bakken pa den ene siden og ut i lufta pa den
             andre. */
          if (Number.isFinite(z) && (skjaerer ? z < zT : z > zT)) zSkraning = z;
        }
      }
      let zN = null;
      if (inne) {
        /* Referansen for fallet ma vaere tomtas tyngdepunkt - det samme som
           volumet regnes med. Her sto `senter`, som er der snittet ligger, og
           det flytter seg med skyveren: samme tomt fikk forskjellig ferdig niva
           alt etter hvor man dro skyveren. */
        const v = Tomtmasser.nivaaVed(nivaa, x, y, tp);
        if (Number.isFinite(v)) zN = v;
      }
      /* Jordarbeidsflaten er én sammenhengende strek: planum inne i tomta,
         skraning utenfor. Tegnes de hver for seg, blir det et hopp i kanten. */
      const zJord = inne ? (zN == null ? null : zN - ob) : zSkraning;
      /* Trauet fra beregningens egen rute. `utskift` er hvor mye som skiftes ut
         nettopp der, så en rute der fjellet ligger i dagen skilles fra en der
         det graves fire meter – se tomtmasser.js:611-617. */
      const c = trauVed(x, y);
      const zTrau = c && Number.isFinite(c.zTrau) ? c.zTrau : null;
      const utskift = c && Number.isFinite(c.utskift) ? c.utskift : 0;
      punkt.push({ d, zT: Number.isFinite(zT) ? zT : null, zF, zN, zJord, inne,
        zTrau, utskift });
    }
    /* ================================================================
       OVERBYGNINGEN SLUTTER IKKE I EN LODDRETT VEGG.

       `zN` settes bare der `inne` er sann, så overbygningskroppen ble et
       rektangel med loddrett ende i tomtegrensa – med en bar planumshylle
       stikkende ut under den. Tilbakemeldingen var «trodde overbygninga
       skulle ha skråkant den og», og det er riktig: lagene trapper ut i en
       skulder, de står ikke som en murkant.

       DETTE VAR ET BEVISST VALG EN GANG, OG BEGRUNNELSEN ER UTGÅTT. Her sto
       det at kilen ikke kunne tegnes fordi «skråningen under den starter på
       selve tomtekanten, uten skulder» – da ville kroppen hengt utover et
       fall som alt var borte under den. Motoren fikk siden skulderen
       (tomtmasser.js:339 og 443: `dUt = naer.d - skulder`), og hylla er
       målbar i snittet: på en tomt på kote 105 ligger `zJord` på planum
       104,44 et halvt steg utenfor kanten, og først DERETTER faller den
       1:2. Motsigelsen som stengte tegningen finnes ikke lenger.

       `zOb` er toppen av kroppen: `zN` inne, og utenfor en rett linje ned
       med `overbygningHelning`. Bredden er `ob · helning`, så linja treffer
       planum nøyaktig i skulderens ytterkant – null tykkelse akkurat der
       hylla slutter og skråningen tar over. Egen felt, ikke utvidet `zN`:
       `zN` betyr FERDIG NIVÅ, og det finnes ikke utenfor tomta.
       ================================================================ */
    const obHelning = Math.max(0, mal.overbygningHelning === undefined
      ? (mal.fylling || 0) : mal.overbygningHelning);
    const skulder = ob * obHelning;
    const n = punkt.length;
    const naerInne = (framover) => {
      const ut = new Array(n).fill(-1);
      let sist = -1;
      for (let k = 0; k < n; k++) {
        const i = framover ? k : n - 1 - k;
        if (punkt[i].inne && punkt[i].zN != null) sist = i;
        ut[i] = sist;
      }
      return ut;
    };
    const fraVenstre = naerInne(true), fraHogre = naerInne(false);
    for (let k = 0; k < n; k++) {
      const q = punkt[k];
      if (q.inne && q.zN != null) { q.zOb = q.zN; continue; }
      q.zOb = null;
      if (!(skulder > 0) || q.zJord == null) continue;
      for (const j of [fraVenstre[k], fraHogre[k]]) {
        if (j < 0) continue;
        const av = Math.abs(q.d - punkt[j].d);
        if (av > skulder) continue;
        const z = punkt[j].zN - av / obHelning;
        if (q.zOb == null || z > q.zOb) q.zOb = z;
      }
      /* Er kilen alt tynnere enn ingenting, finnes den ikke. Uten dette ville
         et punkt der skråningen stiger BRATTERE enn skulderen – en fjellvegg –
         fått en kropp tegnet under bakken. */
      if (q.zOb != null && q.zOb <= q.zJord) q.zOb = null;
    }
    return { punkt, ob, retning: grader, senter, tMin, tMaks, skyv };
  },

  tegn() {
    const c = this.lerret;
    if (!c || !this.app) return;
    const dpr = window.devicePixelRatio || 1;
    const b = c.clientWidth, h = c.clientHeight;
    if (b < 20 || h < 20) return;
    c.width = Math.round(b * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, b, h);

    const s = this.snitt();
    if (!s || !s.punkt.some(q => q.zT != null)) {
      g.fillStyle = Farger.blekkSvak;
      g.font = '13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(this.app.erTomt() && this.app.P.tomt.punkter.length < 3
        ? 'Tegn tomta i kartet, så kommer snittet her'
        : 'Venter på terrengdata…', b / 2, h / 2);
      return;
    }

    // samme omregning som klikket bruker - se _omrade()
    const omr = this._omrade(s, b, h);
    if (!omr) return;
    const { marg, minZ, maksZ, X, Y } = omr;

    // rutenett og kotetall
    g.strokeStyle = Farger.rutenett;
    g.fillStyle = Farger.blekkSvak;
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right';
    const trinn = this._trinn(maksZ - minZ);
    for (let z = Math.ceil(minZ / trinn) * trinn; z <= maksZ; z += trinn) {
      const y = Y(z);
      g.globalAlpha = 0.35; g.beginPath(); g.moveTo(marg.v, y); g.lineTo(b - marg.h, y); g.stroke();
      g.globalAlpha = 1; g.fillText(z.toFixed(trinn < 1 ? 1 : 0), marg.v - 5, y + 3);
    }
    /* EN OVERDREVET HØYDE SKAL STÅ SKREVET PÅ TEGNINGEN.
       Det er nettopp den stilltiende overdrivelsen som gjorde at snittet så
       galt ut uten at noe sa hvorfor – se `_omrade`. Står den her, kan man
       lese vinkelen med det forbeholdet den fortjener. Er målestokken lik i
       begge retninger, er det ingenting å opplyse om, og da står det
       ingenting. */
    if (omr.overdriv > 1.05) {
      g.textAlign = 'right';
      g.globalAlpha = 0.75;
      g.fillText('høyde ' + (Math.round(omr.overdriv * 10) / 10) + '× overdrevet',
        b - marg.h, marg.o + 9);
      g.globalAlpha = 1;
      g.textAlign = 'right';
    }

    /* Skjæring og fylling farges - det er dem øyet skal finne. Skjæring der
       terrenget ligger over det ferdige nivaet, fylling der det ligger under. */
    const bane = (velg, farge) => {
      g.fillStyle = farge; g.globalAlpha = 0.5;
      let i = 0;
      while (i < s.punkt.length) {
        while (i < s.punkt.length && !velg(s.punkt[i])) i++;
        const start = i;
        while (i < s.punkt.length && velg(s.punkt[i])) i++;
        if (i - start < 2) continue;
        g.beginPath();
        for (let k = start; k < i; k++) g.lineTo(X(s.punkt[k].d), Y(s.punkt[k].zT));
        for (let k = i - 1; k >= start; k--) g.lineTo(X(s.punkt[k].d), Y(s.punkt[k].zJord));
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    };
    /* Fargen skal dekke bade tomta og skraningene, ellers ser det ut som om
       det bare skal graves inne pa tomta - og pa en bratt tomt er skraningene
       ofte mer masse enn selve flaten. */
    const gyldig = q => q.zT != null && q.zJord != null;
    bane(q => gyldig(q) && q.zT > q.zJord, Farger.skjaeringFlate);
    bane(q => gyldig(q) && q.zT < q.zJord, Farger.fyllingFlate);

    /* MASSEUTSKIFTINGEN MÅ SYNES – DET ER DEN SOM KOSTER MEST.
       Slås den på, males hele tomta grønn som fylling, fordi cellefeltet `d`
       måles fra bunnen i trauet. Målt på en 40 × 30 m tomt, flat mark, fjell
       3 m nede: 4 585 m³ gravd ut, og skjermen sa 0 m³ skjæring og 4 454 m³
       fylling. Gropa fantes ikke i bildet i det hele tatt.

       Vegen fikk den blå markeringen; tomta fikk den aldri. Her er den: flaten
       mellom den avdekkede bakken og bunnen i trauet, i samme blå som vegen
       bruker, med bunnlinja trukket opp. Den tegnes FØR overbygningen og
       strekene, så den ligger under dem og ikke over. */
    const harTrau = s.punkt.some(q => q.utskift > 0.02 && q.zTrau != null);
    if (harTrau) {
      const topp = q => (q.zTrau != null && q.utskift > 0.02
        ? q.zTrau + q.utskift : null);
      g.fillStyle = Farger.utskiftingFlate;
      let i = 0;
      while (i < s.punkt.length) {
        while (i < s.punkt.length && topp(s.punkt[i]) == null) i++;
        const start = i;
        while (i < s.punkt.length && topp(s.punkt[i]) != null) i++;
        if (i - start < 2) continue;
        g.beginPath();
        for (let k = start; k < i; k++) g.lineTo(X(s.punkt[k].d), Y(topp(s.punkt[k])));
        for (let k = i - 1; k >= start; k--) g.lineTo(X(s.punkt[k].d), Y(s.punkt[k].zTrau));
        g.closePath(); g.fill();
      }
      /* Bunnen i trauet er den linja graveren skal ned til. Den tegnes tydelig,
         som på vegen – uten den ser flaten ut som en skygge. */
      g.strokeStyle = Farger.utskifting; g.lineWidth = 1.8;
      g.beginPath();
      let nede = true;
      for (const q of s.punkt) {
        if (!(q.utskift > 0.02) || q.zTrau == null) { nede = true; continue; }
        const px = X(q.d), py = Y(q.zTrau);
        if (nede) { g.moveTo(px, py); nede = false; } else g.lineTo(px, py);
      }
      g.stroke();
    }

    /* OVERBYGNINGEN ER EN KROPP, IKKE LUFT.
       Dette er det brukeren så: «på tomt føler streken flyr over». Den hvite
       ferdig nivå-streken svevde over toppen av det som var farget, med et
       svart gap under seg. Målt på en flat tomt kote 97 med standardmalen:
       toppen av den grønne fyllingen lå på y = 189, den hvite streken på
       y = 178 – elleve piksler, som er nøyaktig de 0,55 m overbygning.

       Gapet var ekte nok: fargeflatene går fra terrenget ned til PLANUM, og
       over planum ligger overbygningen, som ingenting tegnet. Vegsnittet har
       aldri hatt problemet – det fyller vegkroppen mellom planum og
       vegoverflaten (ui-tverrprofil.js:341-373). Tomta gjorde det ikke.

       To bånd, som vegen: hele kroppen i bærelagsfargen og slitelaget øverst i
       sin egen. Da kjenner den som har lært å lese vegsnittet dette igjen uten
       å lære noe nytt, og ingen ny farge må holdes i synk.

       OG DEN SLUTTER IKKE I EN LODDRETT VEGG. Her sto det at kroppen måtte
       tegnes BARE inne på tomta, fordi skråningen under den startet på selve
       tomtekanten uten skulder – kilen ville hengt utover et fall som alt var
       borte under den. Den motsigelsen lå i motoren, og der ble den løst:
       `skulder` i tomtmasser.js:339, brukt på `dUt` i 443. Toppen følger
       derfor `zOb`, som trapper ut over skulderen – se `snitt()`. */
    if (s.ob > 0) {
      const kropp = (topp, bunn, farge) => {
        g.fillStyle = farge;
        let i = 0;
        while (i < s.punkt.length) {
          while (i < s.punkt.length && !(topp(s.punkt[i]) > bunn(s.punkt[i]))) i++;
          const start = i;
          while (i < s.punkt.length && topp(s.punkt[i]) > bunn(s.punkt[i])) i++;
          if (i - start < 2) continue;
          g.beginPath();
          for (let k = start; k < i; k++) g.lineTo(X(s.punkt[k].d), Y(topp(s.punkt[k])));
          for (let k = i - 1; k >= start; k--) g.lineTo(X(s.punkt[k].d), Y(bunn(s.punkt[k])));
          g.closePath(); g.fill();
        }
      };
      /* Slitelaget kan ikke være tykkere enn hele kroppen – en mal der noen har
         satt slitelaget høyere enn summen ville ellers malt det nedover forbi
         planum, altså tegnet dekke der det skal graves. */
      const sl = Math.min(Math.max(this.app.P.mal.slitelagTykkelse || 0, 0), s.ob);
      /* `zOb` er toppen av kroppen – ferdig nivå inne på tomta, og den skrå
         skulderkanten utenfor. Skillet mellom de to båndene klemmes mot
         planum: ute i kilen er hele kroppen tynnere enn slitelaget, og uten
         klemmen ville slitelaget blitt malt NEDOVER forbi planum, altså
         dekke der det skal graves. Begge båndene ender da i null tykkelse i
         samme punkt, der hylla slutter. */
      const har = q => q.zOb != null && q.zJord != null && q.zOb > q.zJord;
      const skille = q => Math.max(q.zOb - sl, q.zJord);
      kropp(q => (har(q) ? skille(q) : null), q => (har(q) ? q.zJord : null), Farger.baerelag);
      if (sl > 0) kropp(q => (har(q) ? q.zOb : null), q => (har(q) ? skille(q) : null), Farger.slitelag);
    }

    const strek = (velg, farge, tykk, stiplet) => {
      g.strokeStyle = farge; g.lineWidth = tykk;
      g.setLineDash(stiplet ? [4, 4] : []);
      g.beginPath();
      let nede = true;
      for (const q of s.punkt) {
        const v = velg(q);
        if (v == null) { nede = true; continue; }
        const x = X(q.d), y = Y(v);
        if (nede) { g.moveTo(x, y); nede = false; } else g.lineTo(x, y);
      }
      g.stroke(); g.setLineDash([]);
    };
    /* TERRENGET TEGNES SIST. Det er streken man orienterer seg etter – den
       sier hvor bakken ligger nå – og den sto først, så planum og ferdig nivå
       la seg oppå den der de møtes. */
    strek(q => q.zF, Farger.fjell, 1.2, true);          // fjelloverflaten
    strek(q => q.zJord, Farger.planum, 1.4, true);   // planum inne, skråning utenfor
    strek(q => q.zN, Farger.veg, 2.4, false);         // ferdig nivå
    strek(q => q.zT, Farger.terreng, 1.6, false);        // terrenget

    // tegnforklaring
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'left';
    /* FORKLARINGEN SKAL VISE HVER POST SLIK DEN FAKTISK ER TEGNET.
       Her sto fire poster, alle som en heldekkende rute. To av dem – Planum og
       Fjell – tegnes stiplet, så ruta løy om formen. Og de to STØRSTE tingene
       på lerretet, skjæringen og fyllingen, sto ikke i forklaringen i det hele
       tatt. Overbygningen er ny og hører med, men bare når det finnes en: en
       post om en farge som ikke er brukt er en opplysning om noe annet enn det
       man ser på. */
    let x = marg.v;
    const poster = [['Terreng', 'strek', Farger.terreng],
      ['Ferdig nivå', 'strek', Farger.veg],
      ['Planum', 'stiplet', Farger.planum]];
    if (s.ob > 0) poster.push(['Overbygning', 'flate', Farger.baerelag]);
    /* Bare når det faktisk skiftes ut masse. En post om en farge som ikke er
       brukt er en opplysning om noe annet enn det man ser på. */
    if (s.punkt.some(q => q.utskift > 0.02 && q.zTrau != null)) {
      poster.push(['Masseutskifting', 'flate', Farger.utskiftingFlate]);
    }
    poster.push(['Skjæring', 'flate', Farger.skjaeringFlate],
      ['Fylling', 'flate', Farger.fyllingFlate],
      ['Fjell', 'stiplet', Farger.fjell]);
    for (const [navn, form, farge] of poster) {
      if (form === 'flate') {
        g.fillStyle = farge; g.fillRect(x, h - 17, 10, 8);
      } else {
        g.strokeStyle = farge; g.lineWidth = form === 'stiplet' ? 1.4 : 1.8;
        g.setLineDash(form === 'stiplet' ? [3, 3] : []);
        g.beginPath(); g.moveTo(x, h - 12.5); g.lineTo(x + 10, h - 12.5); g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = Farger.blekkSvak;
      g.fillText(navn, x + 14, h - 10);
      x += g.measureText(navn).width + 30;
    }
    g.textAlign = 'right';
    const hvor = /^kant\d+$/.test(this.retning)
      ? 'Vinkelrett på kant ' + (+this.retning.slice(4) + 1)
      : (this.retning === 'tvers' ? 'På tvers' : 'Langs fallet');
    g.fillText(`${hvor} · retning ${Math.round(s.retning)}°`, b - marg.h, h - 10);
    this._merkAv(s);
  },

  /**
   * Merker snittlinja i kartet, og skriver hvor den ligger.
   *
   * Uten den vet man ikke hvilket snitt man ser pa. Tverrprofilen pa en veg har
   * profilnummeret sitt a vise til; her ma linja tegnes.
   */
  _merkAv(s) {
    const e = document.getElementById('tp_etikett');
    if (e) {
      const midt = (s.tMin + s.tMaks) / 2;
      const fra = s.skyv - midt;
      e.textContent = Math.abs(fra) < 0.05 ? 'gjennom midten'
        : `${Math.abs(fra).toFixed(1)} m ${fra > 0 ? 'over' : 'under'} midten`;
    }
    if (typeof Kart === 'undefined' || !Kart.kart || !Kart.lag) return;
    const app = this.app;
    const rad = s.retning * Math.PI / 180;
    const ex = Math.sin(rad), ey = Math.cos(rad);
    const d0 = s.punkt[0].d, d1 = s.punkt[s.punkt.length - 1].d;
    const hj = (x, y) => { const g = Geo.fraUtm(x, y, app.sone); return [g.lat, g.lon]; };
    const linje = [hj(s.senter.x + ex * d0, s.senter.y + ey * d0),
      hj(s.senter.x + ex * d1, s.senter.y + ey * d1)];
    if (!Kart.lag.snittlinje) {
      Kart.lag.snittlinje = L.polyline([], {
        color: Farger.blekk, weight: 1.5, dashArray: '7 5', opacity: 0.9
      }).addTo(Kart.kart);
    }
    Kart.lag.snittlinje.setLatLngs(app.erTomt() ? linje : []);
  },

  /** Pen avstand mellom kotelinjene. */
  _trinn(spenn) {
    for (const t of [0.5, 1, 2, 5, 10, 20, 50]) if (spenn / t <= 8) return t;
    return 100;
  },

  /** Klikk i snittet setter det ferdige nivået der man peker. */
  klikk(e) {
    const app = this.app;
    if (!app || !app.erTomt()) return;
    const s = this.snitt();
    if (!s) return;
    const c = this.lerret;
    const b = c.clientWidth, h = c.clientHeight;
    const omr = this._omrade(s, b, h);
    if (!omr) return;
    const r = c.getBoundingClientRect();
    const z = omr.zVed(e.clientY - r.top);
    if (!Number.isFinite(z)) return;

    /* Nivaet skal havne der man peker - ogsa i bredden.
       Her ble den klikkede høyden satt rett inn som `kote`, og kote er verdien
       i TYNGDEPUNKTET. Med fall pa flaten betyr det at man klikker i den ene
       enden av tomta og nivaet legger seg et helt annet sted: pa 60 m med 3 %
       fall er avviket nesten en meter. Na regnes forskjellen mellom nivaet der
       man pekte og koten, og den legges til. */
    const t = app.P.tomt;
    const d = omr.dVed(e.clientX - r.left);
    let tillegg = 0;
    if (Number.isFinite(d) && t.nivaa.kote != null) {
      const rad = s.retning * Math.PI / 180;
      const x = s.senter.x + Math.sin(rad) * d, y = s.senter.y + Math.cos(rad) * d;
      const p = app.tomtIUtm(t);
      const tp = Tomtmasser.tyngdepunktAv(p);
      const her = Tomtmasser.nivaaVed(app.tomtenivaaIUtm(t), x, y, tp);
      if (Number.isFinite(her)) tillegg = t.nivaa.kote - her;
    }
    app.merk('satte ferdig nivå i snittet');
    t.nivaa.kote = +(z + tillegg).toFixed(2);
    app.tomtTilSkjema();
    app.beregnTomt();
  },

  /**
   * Omregningen mellom lerret og virkelighet.
   *
   * Ett sted, brukt bade nar det tegnes og nar det klikkes. Her regnet klikket
   * ut sitt eget spenn, og de to kunne drive fra hverandre - sarlig etter at
   * skraningene kom med i tegningen og gjorde spennet større. Da traff klikket
   * en annen høyde enn den man pekte pa.
   */
  _omrade(s, b, h) {
    const marg = { v: 52, h: 12, o: 14, u: 26 };
    let minZ = Infinity, maksZ = -Infinity;
    for (const q of s.punkt) {
      /* Trauet må med i høydevinduet, ellers tegnes en fire meter dyp grop
         utenfor bildet og man ser bare at noe blått forsvinner nedover. */
      for (const v of [q.zT, q.zF, q.zN, q.zJord, q.zTrau]) {
        if (v != null && Number.isFinite(v)) { minZ = Math.min(minZ, v); maksZ = Math.max(maksZ, v); }
      }
    }
    if (!(maksZ > minZ)) maksZ = minZ + 1;
    if (!Number.isFinite(minZ)) return null;
    const spenn = maksZ - minZ;
    minZ -= spenn * 0.08; maksZ += spenn * 0.08;
    const d0 = s.punkt[0].d, d1 = s.punkt[s.punkt.length - 1].d;
    const bredde = b - marg.v - marg.h, hoyde = h - marg.o - marg.u;
    /* ================================================================
       HØYDEN OG BREDDEN MÅ HENGE SAMMEN.

       Her fylte X hele bredden og Y hele høyden, hver for seg. Da er
       målestokken ulik i de to retningene, og en skråning tegnes ikke i sin
       egen vinkel. Målt på en tomt på 80 × 60 m i et panel på 645 × 260:
       4,84 piksler per meter vannrett mot 29,15 loddrett – seks gangers
       overdrivelse. Fyllingsskråningen er 1:2, altså 26,6 grader, og ble
       tegnet som 71,6. Brukeren så det med en gang: «ser alt for bratt ut».
       Tallene var riktige hele veien; det var bildet som løy.

       Vegens snitt har alltid gjort dette rett – se `ui-tverrprofil.js`,
       «lik malestokk i begge retninger». To snitt i samme program som
       tegner den samme slags figur på to måter, er én for mye.

       HVORFOR IKKE BARE 1:1? Fordi en tomt er flat og brei. Den samme
       tomta er 120 m med skråninger og 7,6 m fra bunn til topp – seksten
       mot én. I ren målestokk blir hele snittet 37 piksler høyt i et panel
       på 220, og da ser man ingenting. Overdrivelse er da også vanlig
       praksis i anleggstegninger – men den SKAL stå skrevet på tegningen,
       og den skal ikke være seks.

       Derfor: `sy` legger seg så nær `sx` som høyden tillater, med et tak
       på TAK ganger. Er snittet så høyt at ren målestokk ikke får plass,
       gir `Math.min` etter og komprimerer – figuren er alltid innenfor.
       ================================================================ */
    /* TAKET ER TO, OG DET ER MÅLT, IKKE VALGT PÅ FØLELSEN.
       På den samme tomta tegnes fyllingsskråningen på 1:2 slik:
         6× (som før) → 71,6 grader – en vegg
         3×           → 56,3 grader – fortsatt bratt
         2×           → 45,0 grader – leses som den skråningen den er
         1× (sant)    → 26,6 grader, men da er hele snittet 37 px høyt
       Ved 2 bruker figuren en tredel av panelhøyden, og et utskiftingslag på
       en halv meter blir fem piksler – tynt, men synlig. */
    const TAK = 2;
    const sx = bredde / (d1 - d0);
    const syFull = hoyde / (maksZ - minZ);
    const sy = Math.min(syFull, sx * TAK);
    const overdriv = sy / sx;
    /* Z-VINDUET UTVIDES TIL DET LERRETET FAKTISK DEKKER.
       Da er `(maksZ - minZ) === hoyde / sy` eksakt, og både `Y`, `zVed` og
       rutenettløkka i `tegn` regner videre på nøyaktig samme formel som før.
       Alternativet – å gi dem hver sin nye formel – er tre steder å ta feil
       på i stedet for ett. */
    const midtZ = (minZ + maksZ) / 2;
    const halv = (hoyde / sy) / 2;
    minZ = midtZ - halv; maksZ = midtZ + halv;
    return {
      marg, minZ, maksZ, d0, d1, bredde, hoyde, overdriv,
      X: d => marg.v + (d - d0) / (d1 - d0) * bredde,
      Y: z => marg.o + (maksZ - z) / (maksZ - minZ) * hoyde,
      zVed: y => maksZ - (y - marg.o) / hoyde * (maksZ - minZ),
      dVed: x => d0 + (x - marg.v) / bredde * (d1 - d0)
    };
  }
};

if (typeof module !== 'undefined') module.exports = Tomteprofil;
