'use strict';
/**
 * Tomta i tre dimensjoner.
 *
 * Tverrsnittet viser ett snitt om gangen, og kartet viser flaten ovenfra. Det
 * som er vanskeligst å se for seg, er nettopp det de to ikke viser: hvordan
 * skråningene legger seg rundt tomta, og hvor de treffer bakken. Det er der
 * mesteparten av volumet ligger.
 *
 * Selve tegningen ligger i Tegner3d (ui-3d.js). Her er bare det som er tomtas
 * eget: gitteret, lagene, grensestrekene og tallene.
 *
 * DEN VIKTIGSTE REGELEN
 * Alle høyder kommer fra `res.rutenett` – det samme rutenettet volumet er
 * regnet på. Denne fila regner ALDRI ut sin egen skråningsgeometri. En
 * 3D-visning som viser noe annet enn tallene ved siden av, er verre enn ingen.
 */

const Tomt3d = Object.assign(Object.create(Tegner3d), {
  /* Egne felt, ikke arvet. Et objekt på prototypen ville vært DELT mellom de to
     visningene – slår man av terrenget på tomta, forsvant det på vegen òg. */
  yaw: 0,
  pitch: 55,
  pitchHjem: 55,
  kontekst: 40,
  /* ØYET PÅ TOMTA ER TO UTM-KOORDINATER.
     Vegen har en SKINNE – stasjon langs senterlinja og avstand ut fra den – og
     det er den som gjør at man ikke kan bli borte. En tomt har ingen slik
     retning; den er en flate. Da er de naturlige tallene x og y i kartplanet,
     og gitteret er et rett rutenett der, så oppslaget er ren indeksregning.
     To vanlige felt, ikke en getter/setter-kobling som vegens `kamS`: her
     finnes det ikke noe profilrutenett som runder dem bort. */
  kamX: 0, kamY: 0,
  /* `andre`: se Veg3d.lag – den holdes i takt med vegens av Tegner3d.settVisAndre. */
  lag: { terreng: true, grav: true, fjell: false, overbygning: false, rutenett: false,
    grenser: true, andre: false },


  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tomt3d');
    this.over = document.getElementById('tomt3dover');
    if (!this.lerret) return this;
    this._musKobling();
    /* Samme mønster som tverrprofilen: lerretet endrer størrelse når panelet
       gjør det, og da må det tegnes på nytt. Observatøren fyrer også når
       panelet er skjult (størrelse null), og da returnerer tegn() med én gang. */
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);
    return this;
  },


  _tomTekst() { return 'Tegn tomta i kartet og sett en kote, så kommer modellen her'; },

  /** Slår visningen på eller av. Alt arbeid henger på denne. */
  aktiver(pa) {
    this.aktiv = !!pa;
    const vis = (id, synlig) => {
      const e = document.getElementById(id);
      if (e) e.classList.toggle('skjult', !synlig);
    };
    vis('tomt3d', this.aktiv);
    vis('tomt3dover', this.aktiv);
    vis('tomtprofil', !this.aktiv);
    vis('tomtKanter', !this.aktiv);
    vis('tomt3dverktoy', this.aktiv);
    vis('snittverktoy', !this.aktiv);
    // «Alle anlegg» hører til 3D-bildet – se Tegner3d.visAndreknapp
    if (Tegner3d.visAndreknapp) Tegner3d.visAndreknapp();
    for (const [id, pa2] of [['tomtVis3d', this.aktiv], ['tomtVisSnitt', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    // slår man av 3D, er man ikke på bakken lenger – se samme sted i ui-veg3d.js
    if (!this.aktiv && this.modus === 'bakken') this.settModus('oversikt', true);
    /* Modellen fyller arbeidsflaten. Se App.stort3d. */
    if (this.app.stort3d) this.app.stort3d('tomt', this.aktiv);
    if (this.aktiv) this.tegn(); else Tomteprofil.tegn();
    /* RAMMEN SETTES NÅR LERRETET HAR FÅTT SIN NYE STØRRELSE, IKKE FØR.
       Panelet vokser til hele arbeidsflaten når 3D slås på. Rammes modellen inn
       før det, er den innrammet for det gamle, lille lerretet – og dreiningen,
       som velges ved å måle hvilken av to som gjør modellen størst, blir valgt
       på feil mål. Flagget leses i tegn(), som vet når størrelsen er på plass;
       en tidtaker ville bare gjettet. */
    if (this.aktiv) this._maaRammes = true;

  },


  /**
   * Rutenettet som et regulært gitter, med høyder i hjørnene.
   *
   * Cellene i `res.rutenett` har koordinaten i SENTER av cella. En flate må
   * tegnes mellom hjørner, ikke mellom sentre, ellers får flaten et hull på en
   * halv celle hele veien rundt kanten. Nodehøyden er derfor middelet av de
   * cellene som møtes i noden.
   *
   * Oppskriften for å finne (i, j) er nøyaktig den samme som fargeoverlegget i
   * kartet bruker. Avviker de, ligger 3D-modellen forskjøvet en halv rute i
   * forhold til fargene – og ingen ville sett hvilken av dem som var riktig.
   */
  _gitter(steg) {
    const res = this.app && this.app.resultat;
    const celler = res && res.rutenett;
    if (!celler || !celler.length) return null;
    if (this._gitterFor === celler && this._gitterSteg === steg) return this._gitterBuffer;

    const rute = Math.max(0.05, (this.app.P.mal.rutestorrelse || 1)) * steg;
    let minX = Infinity, minY = Infinity, maksX = -Infinity, maksY = -Infinity;
    for (const c of celler) {
      minX = Math.min(minX, c.x); maksX = Math.max(maksX, c.x);
      minY = Math.min(minY, c.y); maksY = Math.max(maksY, c.y);
    }
    /* TERRENGET RUNDT ARBEIDET, SÅ MAN SER HVA TOMTA LIGGER I.
       Beregningen slutter der skråningen møter bakken, og en modell som slutter
       der henger i løse lufta: man ser flaten, men ikke om den ligger i en
       skråning, på en rygg eller i en søkk.
       Ringen rundt koster ingenting å hente – terrengdataene er alt lastet ned
       med god margin utenfor beregningen, og ble bare kastet. Går den utenfor
       det som er lastet, svarer terrenget NaN, og da faller de nodene bort av
       seg selv. */
    const marg = Math.max(0, this.kontekst || 0);
    minX -= marg; maksX += marg; minY -= marg; maksY += marg;
    const nb = Math.round((maksX - minX) / rute) + 1;
    const nh = Math.round((maksY - minY) / rute) + 1;
    if (!(nb > 0 && nh > 0) || nb * nh > 4e6) return null;

    const n = nb * nh;
    const sumT = new Float64Array(n), sumP = new Float64Array(n), sumF = new Float64Array(n);
    const sumFerdig = new Float64Array(n);
    const antall = new Int32Array(n), antallFerdig = new Int32Array(n);
    const maksD = new Float32Array(n);
    const inne = new Uint8Array(n), usikker = new Uint8Array(n);

    /* Slås celler sammen, tas MIDDELET av høydene og MAKS av avviket.
       Med middelverdi på avviket forsvinner en dyp grøft i sammenslåingen, og
       fargen viser en jevn flate der det i virkeligheten er et hull. */
    for (const c of celler) {
      const i = Math.round((c.x - minX) / rute), j = Math.round((c.y - minY) / rute);
      if (i < 0 || j < 0 || i >= nb || j >= nh) continue;
      const k = j * nb + i;
      if (Number.isFinite(c.zT)) { sumT[k] += c.zT; }
      if (Number.isFinite(c.zPlanum)) { sumP[k] += c.zPlanum; }
      if (Number.isFinite(c.zFjell)) { sumF[k] += c.zFjell; }
      antall[k]++;
      if (c.zFerdig != null && Number.isFinite(c.zFerdig)) { sumFerdig[k] += c.zFerdig; antallFerdig[k]++; }
      if (Math.abs(c.d) > Math.abs(maksD[k])) maksD[k] = c.d;
      if (c.inne) inne[k] = 1;
    }

    /* Skråningsfoten forteller hvor tallene IKKE står på egne ben: der
       skråningen ble brattet opp for å nå bakken innenfor grensa, eller ikke
       landet i det hele tatt. De cellene tegnes bleikere, så man ikke leser
       dem som like sikre som resten. */
    const fot = (res.skraningsfot || []).filter(f => f.tvunget > 0 || f.traff !== true);
    for (const f of fot) {
      const i = Math.round((f.x - minX) / rute), j = Math.round((f.y - minY) / rute);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < nb && b < nh) usikker[b * nb + a] = 1;
        }
      }
    }

    /* Speilbildet av harGrav: terrenget rundt, uten det som skal graves. I
       fyldig tegnes terrenget bare der, så massen under ikke blir slørt. */
    const utenGrav = new Uint8Array(n);
    const zT = new Float32Array(n), zP = new Float32Array(n), zF = new Float32Array(n);
    const zFerdig = new Float32Array(n), harFerdig = new Uint8Array(n);
    const finnes = new Uint8Array(n), harGrav = new Uint8Array(n);
    const terr = this.app.terreng;
    let hoppet = 0, iKontekst = 0;
    for (let k = 0; k < n; k++) {
      if (antall[k]) {
        finnes[k] = 1; harGrav[k] = 1;
        zT[k] = sumT[k] / antall[k];
        zP[k] = sumP[k] / antall[k];
        zF[k] = sumF[k] / antall[k];
        if (antallFerdig[k]) { zFerdig[k] = sumFerdig[k] / antallFerdig[k]; harFerdig[k] = 1; }
        continue;
      }
      /* Utenfor beregningen: bare terrenget, hentet rett fra høydemodellen.
         Ingen gravflate her – det er nettopp poenget: dette er marka rundt,
         ikke noe som skal røres. */
      const z = terr ? terr.z(minX + (k % nb) * rute, minY + ((k / nb) | 0) * rute) : NaN;
      if (Number.isFinite(z)) { finnes[k] = 1; utenGrav[k] = 1; zT[k] = z; zP[k] = z; zF[k] = z; iKontekst++; }
      else hoppet++;
    }

    let lav = Infinity, hoy = -Infinity, maksAvvik = 0;
    for (let k = 0; k < n; k++) {
      if (!finnes[k]) continue;
      lav = Math.min(lav, zT[k]);
      hoy = Math.max(hoy, zT[k]);
      if (harGrav[k]) {
        lav = Math.min(lav, zP[k]); hoy = Math.max(hoy, zP[k]);
        maksAvvik = Math.max(maksAvvik, Math.abs(maksD[k]));
      }
    }
    if (!Number.isFinite(lav)) return null;

    /* VERDSPOSISJONEN LIGGER I GITTERET, IKKE I EN FORMEL.
       For en tomt er noden alltid `minX + i * rute` – et rett rutenett i UTM.
       En VEG er ikke det: der er den ene aksen stasjon langs senterlinja og den
       andre avstand ut fra den, så noden svinger med kurven. Skulle tegneren
       tjene begge, kan den ikke gjette hvor en node ligger; den må få det
       oppgitt. To lister til koster 16 byte per node, og gjør at nøyaktig den
       samme rasteriseringen kan brukes på begge.

       DE MÅ VÆRE Float64Array.
       Det sto Float32Array her. En nordkoordinat i UTM er rundt 6 460 000, og
       der er avstanden mellom to nabotall i float32 en halv meter. Målt på
       vegens gitter kollapset 18 % av cellene til null bredde på tvers, og
       lyset – som er kryssproduktet av de to cellekantene – bommet med opptil
       0,34 av et spenn på 0,45. Det ser ikke ut som en feil; det ser ut som en
       flate med litt urolig skyggelegging. */
    const wx = new Float64Array(n), wy = new Float64Array(n);
    for (let j = 0; j < nh; j++) {
      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        wx[k] = minX + i * rute; wy[k] = minY + j * rute;
      }
    }

    /* Midtpunkt og diagonal som ekte tall, ikke som formel av nb og rute.
       Kameraet trenger dem, og for en veg finnes det ingen `rute` å regne dem
       av. På et rett rutenett gir de nøyaktig det samme som formelen gjorde. */
    /* LANDSKAPET SLIK DET BLIR – ÉN SAMMENHENGENDE FLATE.
       zP er planum, ikke ferdig nivå: inne på tomta ligger hele overbygningen
       oppå den. zFerdig finnes derfor bare INNE på tomta; utenfor er det
       skråningen som gjelder, og der legges ingen overbygning – da er planum
       selve den ferdige flaten. I ringen rundt er zP alt satt til terrenget, så
       flaten går sømløst ut i marka.
       Masken må sjekkes: zFerdig er en Float32Array som står på 0 der den ikke
       er fylt, og uten sjekken faller tomta til kote 0. */
    const zEtter = new Float32Array(n);
    for (let k = 0; k < n; k++) zEtter[k] = harFerdig[k] ? zFerdig[k] : zP[k];

    const g = {
      nb, nh, rute, minX, minY, lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
      utenGrav, zEtter,
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      wx, wy, zT, zP, zF, zFerdig, harFerdig, harGrav, d: maksD, finnes, inne, usikker,
      hoppet, iKontekst, totalt: n, celler: celler.length
    };
    this._gitterFor = celler; this._gitterSteg = steg; this._gitterBuffer = g;
    return g;
  },


  /** Det som står i boksen under markøren. */
  _avlesning(g, kk) {
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    const d = g.d[kk];
    return [
      // ser man «etter», peker man på ferdig flate – da må ferdig kote stå der
      `Terreng ${t2(g.zT[kk], 2)} · planum ${t2(g.zP[kk], 2)}`
        + (this.visning === 'etter' && g.zEtter ? ` · ferdig ${t2(g.zEtter[kk], 2)}` : ''),
      d >= 0 ? `Skjæring ${t2(d, 2)} m` : `Fylling ${t2(-d, 2)} m`,
      `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`
    ];
  },


  /* ---------------- på bakken ---------------- */

  /**
   * Gulvet under et punkt, lest AV GITTERET – aldri regnet på nytt.
   *
   * Indeksformelen er NØYAKTIG den samme som fargeoverlegget og grensestreken
   * bruker (`Math.round((x - minX) / rute)`). Skrev man den om her, ville
   * gulvet og modellen ligge en halv rute i utakt – man ville gått litt ved
   * siden av bakken man ser, og ingen ville sett hvilken av de to som var feil.
   *
   * Gulvet er gravflaten der det graves, terrenget ellers – og det følger
   * hvilket bilde man ser på, gjennom `_flateHoyde`.
   */
  _gulv(g, x, y) {
    if (!g || !g.rute) return NaN;
    const i = Math.round((x - g.minX) / g.rute);
    const j = Math.round((y - g.minY) / g.rute);
    if (i < 0 || j < 0 || i >= g.nb || j >= g.nh) return NaN;
    const k = j * g.nb + i;
    if (!g.finnes[k]) return NaN;
    const tab = this._flateHoyde(g);
    if (tab) return tab[k];
    return g.harGrav[k] ? g.zP[k] : g.zT[k];
  },

  /** Øyet: der man står, kamH over gulvet. */
  _bakkePos(g) {
    if (!g) return null;
    if (!this._kamSatt) this._bakkeStart(g);
    /* TOMTA KAN HA FLYTTET SEG UNDER FØTTENE.
       Tegner man om omrisset, endrer koten eller bytter prosjekt mens man står
       på bakken, bygges gitteret på nytt med andre minX/minY – og posisjonen
       man sto i kan havne utenfor det. Da gir `_gulv` NaN, `_bakkeKamera` gir
       null, og `_kamera` faller stille tilbake til oversiktskameraet, som i
       bakkemodus har skala 1: et frimerke midt på lerretet, uten et ord om hva
       som skjedde. Er man havnet utenfor, plasseres man på nytt. */
    let gulv = this._gulv(g, this.kamX, this.kamY);
    if (!Number.isFinite(gulv)) {
      this._bakkeStart(g);
      /* OG SNU BLIKKET MED.
         `settModus` setter posisjon og retning i to skritt, og retningen bare
         én gang. Går man ned på bakken FØR det finnes et gitter – tomta er
         tegnet, men koten ikke satt ennå – sto kamYaw igjen på det den var, og
         når gitteret dukket opp ble man plassert i enden av tomta med hele
         flata rett bak ryggen. Bildet var kontekstterreng og himmel, og
         ingenting sa hvorfor. */
      if (this.seFramover) this.seFramover();
      gulv = this._gulv(g, this.kamX, this.kamY);
    }
    if (!Number.isFinite(gulv)) return null;
    /* Flyr man, står høyden stille mens landskapet ruller under. Går man,
       følger øyet bakken slavisk – det er det føtter gjør. Se ui-veg3d.js. */
    if (this.ferd === 'fly') {
      if (this.kamZ == null) this.kamZ = gulv + this.kamH;
      const z = Math.max(gulv + 1.6, this.kamZ);
      this.kamZ = z;
      this.kamH = z - gulv;
      return { x: this.kamX, y: this.kamY, z };
    }
    return { x: this.kamX, y: this.kamY, z: gulv + this.kamH };
  },

  /** Gulvet rett under kameraet – det basen trenger for å begrense flygingen. */
  _gulvNa(g) { return this._gulv(g, this.kamX, this.kamY); },


  /**
   * Hvor man lander når man går ned på bakken.
   *
   * Rekkefølgen er ikke tilfeldig: det man SER PÅ er alltid det man vil stå i.
   *   1. Dreiepunktet, om man har klikket på noe. Da lander man nøyaktig der.
   *   2. I ENDEN AV TOMTA, ikke midt på den. Står man i midten, ser man halve
   *      tomta og har den andre halvparten i ryggen. Står man i enden av den
   *      lengste retningen, ligger hele flata foran – og det er nettopp det
   *      bildet man går ned for å få.
   *      Punktet regnes av nodene som er merket `inne`, ikke av gitterets
   *      randboks: gitteret har en ring kontekstterreng rundt seg, og på en
   *      L-formet tomt ligger randboksens midtpunkt gjerne utenfor flata. Man
   *      ville landet i skogen ved siden av.
   *   3. Midt i gitteret, som siste utvei.
   */
  /* Hver gang man går ned, plasseres øyet på nytt – ellers står man der man sto
     forrige gang, som kan være en helt annen tomt. */
  _bakkeInn() { this._bakkeStart(this._sisteGitter); },

  _bakkeStart(g) {
    if (!g || !g.rute) { this._kamSatt = false; return; }
    this._kamSatt = true;
    if (this.fokus && Number.isFinite(this.fokus.x)) {
      this.kamX = this.fokus.x; this.kamY = this.fokus.y;
      if (Number.isFinite(this._gulv(g, this.kamX, this.kamY))) return;
    }
    const m = this._tomtemidte(g);
    if (!m) { this.kamX = g.midtX; this.kamY = g.midtY; return; }
    const langsX = (m.maksX - m.minX) >= (m.maksY - m.minY);
    this.kamX = langsX ? m.minX + g.rute : m.x;
    this.kamY = langsX ? m.y : m.minY + g.rute;
    const gaar = this.ferd === 'gaa';
    if (!this._kanStaa(g, this.kamX, this.kamY, gaar)) { this.kamX = m.x; this.kamY = m.y; }
    if (!this._kanStaa(g, this.kamX, this.kamY, gaar)) { this.kamX = g.midtX; this.kamY = g.midtY; }
  },

  /** Tyngdepunkt og randboks for SELVE tomta – ikke for gitteret rundt den. */
  _tomtemidte(g) {
    let sx = 0, sy = 0, n = 0;
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (let k = 0; k < g.nb * g.nh; k++) {
      if (!g.finnes[k] || !g.inne || !g.inne[k]) continue;
      const x = g.wx[k], y = g.wy[k];
      sx += x; sy += y; n++;
      if (x < minX) minX = x;
      if (x > maksX) maksX = x;
      if (y < minY) minY = y;
      if (y > maksY) maksY = y;
    }
    if (!n) return null;
    return { x: sx / n, y: sy / n, minX, maksX, minY, maksY };
  },

  /**
   * Gåing på en flate: fram er dit man SER, side er til høyre for blikket.
   *
   * Vegen legger de samme to tallene på stasjon og avvik, fordi den har en
   * skinne å følge. En tomt har ingen retning, så her dreies de med `kamYaw`
   * og legges rett på kartplanet. Blikkretningen i kameraet er
   * `(−sin kamYaw, cos kamYaw)` – se `_bakkeKamera` – og høyre for den er
   * `(cos kamYaw, sin kamYaw)`. Med den retningen er kamYaw det samme som en
   * kompassretning: 0 er nord, 90 er øst.
   *
   * Klemmingen til gitteret er ikke pynt: går man utenfor, gir `_gulv` NaN,
   * `_bakkePos` gir null, og bildet faller stille tilbake til oversiktskameraet
   * uten et ord om hva som skjedde.
   */
  _bakkeFlytt(fram, side) {
    const g = this._sisteGitter;
    if (!g) return;
    const a = this.kamYaw * Math.PI / 180;
    const sa = Math.sin(a), ca = Math.cos(a);
    let nx = this.kamX - fram * sa + side * ca;
    let ny = this.kamY + fram * ca + side * sa;
    const marg = g.rute * 0.5;
    nx = Math.max(g.minX + marg, Math.min(g.minX + (g.nb - 1) * g.rute - marg, nx));
    ny = Math.max(g.minY + marg, Math.min(g.minY + (g.nh - 1) * g.rute - marg, ny));
    /* Er det ikke gulv der man vil gå, blir man stående. Hullene i gitteret er
       ekte – der har terrengmodellen ingen data – og å gå ut i et av dem er å
       falle ut av modellen.
       GÅR man, er tomtegrensa veggen i tillegg: da holder man seg på flata.

       SKLI LANGS VEGGEN, IKKE STOPP MOT DEN. Går man skrått inn i en kant og
       hele skrittet forkastes, står man bom fast selv om den ene komponenten var
       lovlig – og det kjennes som om tastene henger. Derfor prøves først hele
       skrittet, så bare den ene aksen, så bare den andre. Det er tre oppslag i
       et rutenett, altså ingenting, og forskjellen er hele følelsen av å gå. */
    const gaar = this.ferd === 'gaa';
    if (this._kanStaa(g, nx, ny, gaar)) { this.kamX = nx; this.kamY = ny; return; }
    if (this._kanStaa(g, nx, this.kamY, gaar)) { this.kamX = nx; return; }
    if (this._kanStaa(g, this.kamX, ny, gaar)) { this.kamY = ny; }
  },

  /** Finnes det gulv her – og får man stå her? */
  _kanStaa(g, x, y, baregpaaTomta) {
    if (!Number.isFinite(this._gulv(g, x, y))) return false;
    if (!baregpaaTomta || !g.inne) return true;
    const i = Math.round((x - g.minX) / g.rute), j = Math.round((y - g.minY) / g.rute);
    if (i < 0 || j < 0 || i >= g.nb || j >= g.nh) return false;
    return !!g.inne[j * g.nb + i];
  },

  /** Lander man, kommer man ned PÅ tomta – ikke ved siden av den. */
  _ferdEndret(f) {
    const g = this._sisteGitter;
    if (f !== 'gaa' || !g) return;
    if (this._kanStaa(g, this.kamX, this.kamY, true)) return;
    /* Utenfor flata: gå til nærmeste node som ER innenfor. Rett fram til
       tyngdepunktet ville hoppet tvers over tomta og mistet det man så på. */
    let best = -1, bestD = Infinity;
    for (let k = 0; k < g.nb * g.nh; k++) {
      if (!g.finnes[k] || !g.inne[k]) continue;
      const d = (g.wx[k] - this.kamX) ** 2 + (g.wy[k] - this.kamY) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best >= 0) { this.kamX = g.wx[best]; this.kamY = g.wy[best]; }
  },

  /**
   * «Se framover» – mot midten av tomta, med blikket litt ned mot bakken.
   *
   * Vegen ser langs vegen. En tomt har ingen langs, men den har en midte, og
   * det man vil se på når man går ned er nettopp flata. Står man alt i midten,
   * beholdes retningen.
   *
   * Omregningen er ikke identiteten. Blikkretningen er `(sin kamYaw,
   * −cos kamYaw)`, så for en matematisk vinkel θ = atan2(dy, dx) er
   * kamYaw = θ + 90°. Feil fortegn her gir et kamera som ser rett bakover, og
   * bildet ser like troverdig ut.
   */
  seFramover() {
    const g = this._sisteGitter;
    if (g) {
      const m = this._tomtemidte(g);
      const mx = m ? m.x : g.midtX, my = m ? m.y : g.midtY;
      const dx = mx - this.kamX, dy = my - this.kamY;
      if (Math.hypot(dx, dy) > 2) this.kamYaw = Math.atan2(-dx, dy) * 180 / Math.PI;
    }
    this.kamPitch = -Math.atan(this.kamH / Math.max(60, 6 * this.kamH)) * 180 / Math.PI;
  },

  /** Hvor man står, i den formen en tomt har: koordinat, ikke profilnummer. */
  _bakkeHud() {
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    return ['N ' + t2(this.kamY, 1) + '  Ø ' + t2(this.kamX, 1)];
  },

  /**
   * Et klikk i modellen setter stedet – og flytter deg dit når du står i den.
   *
   * Ovenfra er det bare dreiepunktet som flyttes (det gjør basen). Står man på
   * bakken, er et klikk den raskeste måten å komme seg tvers over en tomt på,
   * og uten den er den eneste veien å gå hele strekket med W.
   */
  _velg(k, g) {
    if (!g || k < 0 || this.modus !== 'bakken') return;
    if (!g.finnes[k]) return;
    this.kamX = g.wx[k]; this.kamY = g.wy[k];
    this._kamSatt = true;
  },

  /** Tallene øverst til venstre. Hver visning har sine egne. */
  _hudLinjer(g) {
    const res = this.app.resultat;
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    const linjer = [];
    if (res && res.sum) {
      linjer.push(`${t2(res.sum.skjaering)} m³ skjæring · ${t2(res.sum.fylling)} m³ fylling`);
      linjer.push(`${t2(res.arealMedSkraning)} m² med skråninger · rute ${t2(g.rute, 2)} m`);
    }
    const usikre = this._tellUsikre(g);
    if (usikre) linjer.push(`${usikre} ruter er bleiket – skråningen der står ikke på egne ben`);
    return linjer;
  },


  /** Tomtegrensa og skråningsfoten, tegnet som streker på flaten. */
  _overleggEkstra(k, g, kam, skjerm) {
    const res = this.app.resultat;
    if (this.lag.grenser) {
      const t = this.app.P.tomt;
      const p = this.app.tomtIUtm(t);
      const flate = this.app._innerflate || p;
      /* Omrisset skal ligge PÅ den flaten som tegnes, ikke alltid på planum –
         ellers svever tomtegrensa over marka i «før» og ligger nede i
         bærelaget i «etter». */
      const zTab = this._flateHoyde(g) || g.zP;
      const zVed = (x, y) => {
        const i = Math.round((x - g.minX) / g.rute), j = Math.round((y - g.minY) / g.rute);
        const kk = j * g.nb + i;
        return (i >= 0 && j >= 0 && i < g.nb && j < g.nh && g.finnes[kk]) ? zTab[kk] : g.lav;
      };
      /* Gjennom _verdensstrek: den klipper mot nærplanet og prøver mot
         rasterets dybde. Står man PÅ tomta, ligger halve grensa bak øyet, og et
         punkt bak øyet speiles over til motsatt side av skjermen når man deler
         på dybden – grensa ble en vifte av streker tvers over bildet.
         `lukk` blir et ekstra punkt i stedet for closePath: en lukket bane kan
         ikke klippes stykkevis. */
      const strek = (punkt, farge, bredde, lukk) => {
        if (punkt.length < 2) return;
        k.strokeStyle = farge; k.lineWidth = bredde;
        const p3 = punkt.map(q => ({ x: q.x, y: q.y, z: q.z != null ? q.z : zVed(q.x, q.y) }));
        if (lukk) p3.push(p3[0]);
        this._verdensstrek(k, p3);
      };
      strek(flate, Farger.veg, 2, true);
      if (t.omrissBetyr === 'yttergrense' && flate !== p) strek(p, Farger.blekkSvak, 1.4, true);
      for (const s of (typeof Eksport !== 'undefined' ? Eksport.fotstrekk(res.skraningsfot || []) : [])) {
        strek(s.punkt, s.type === 'skjaering' ? Farger.skjaering : Farger.fylling, 1.6, false);
      }
    }

  },


  /**
   * Lagene tomta viser, i tegnerekkefølge.
   *
   * @returns {Array<{hoyde, farge, blanding, krev}>}
   *   hoyde    Float32Array med koten i hver node
   *   farge    (k00, k10, k01, k11, z) → 0xAABBGGRR, eller 0 for «hopp over»
   *   blanding 0 = ugjennomsiktig, ellers hvor mye laget slipper gjennom
   *   krev     Uint8Array som må være satt i alle fire hjørner
   */
  _lagliste(g, pal) {
    const enkel = (rgb, hopp) => (k00, k10, k01, k11, z) => {
      if (hopp && hopp(k00)) return 0;
      const ly = this._lys(g, k00, k10, k01, z, this._kamNa);
      const r = Math.min(255, rgb[0] * ly), gg = Math.min(255, rgb[1] * ly), bl = Math.min(255, rgb[2] * ly);
      return (255 << 24) | (bl << 16) | (gg << 8) | r;
    };
    const ut = [];
    if (this.lag.grav) {
      ut.push({
        hoyde: g.zP, krev: g.harGrav, blanding: 0,
        farge: (k00, k10, k01, k11, z) => {
          const d = g.d[k00];
          const t = Math.min(1, Math.sqrt(Math.abs(d) / g.maksAvvik));
          const tab = d >= 0 ? pal.skjaering : pal.fylling;
          const i = Math.min(pal.N - 1, Math.round(t * (pal.N - 1))) * 3;
          let r = tab[i], gg = tab[i + 1], bl = tab[i + 2];
          const ly = this._lys(g, k00, k10, k01, z, this._kamNa);
          // celler der skråningen ikke sto på egne ben tones ned
          const m = g.usikker[k00] ? 0.82 : 1;
          r = Math.min(255, r * ly * m); gg = Math.min(255, gg * ly * m); bl = Math.min(255, bl * ly * m);
          if (this.lag.rutenett && this._paaRutelinje(g, k00)) { r *= 0.72; gg *= 0.72; bl *= 0.72; }
          return (255 << 24) | (bl << 16) | (gg << 8) | r;
        }
      });
    }
    /* I FYLDIG blir terrenget stående igjen der det IKKE røres.
       Legges det halvgjennomsiktig oppå graveflaten – slik den vanlige
       visningen gjør – blir massen en blek gjenskinn av seg selv, og en grunn
       skjæring ved siden av en grunn fylling er nesten samme grå. Her ser man
       volumet i stedet, med terrenget rundt som ramme. */
    if (this.lag.terreng) {
      ut.push(this.fyldig
        ? { hoyde: g.zT, farge: enkel(Farger.terrengFlateRgb), blanding: 0, krev: g.utenGrav }
        : { hoyde: g.zT, farge: enkel(Farger.terrengFlateRgb), blanding: 0.45 });
    }
    if (this.lag.fjell) ut.push({ hoyde: g.zF, farge: enkel(Farger.fjellRgb), blanding: 0.5 });
    if (this.lag.overbygning) {
      ut.push({ hoyde: g.zFerdig, blanding: 0.6, krev: g.harFerdig,
        farge: enkel(Farger.rgb('data-baerelag')) });
    }
    return ut;
  },
});

if (typeof module !== 'undefined') module.exports = Tomt3d;
