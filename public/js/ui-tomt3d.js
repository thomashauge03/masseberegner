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
  kontekst: 40,
  lag: { terreng: true, grav: true, fjell: false, overbygning: false, rutenett: false, grenser: true },


  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tomt3d');
    this.over = document.getElementById('tomt3dover');
    if (!this.lerret) return this;
    this._musKobling();
    /* Samme mønster som tverrprofilen: lerretet endrer størrelse når panelet
       gjør det, og da må det tegnes på nytt. Observatøren fyrer også når
       panelet er skjult (størrelse null), og da returnerer tegn() med én gang. */
    new ResizeObserver(() => this.tegn()).observe(this.lerret);
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
    for (const [id, pa2] of [['tomtVis3d', this.aktiv], ['tomtVisSnitt', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    if (this.aktiv) this.tegn(); else Tomteprofil.tegn();
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
    const g = {
      nb, nh, rute, minX, minY, lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
      utenGrav,
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
      `Terreng ${t2(g.zT[kk], 2)} · planum ${t2(g.zP[kk], 2)}`,
      d >= 0 ? `Skjæring ${t2(d, 2)} m` : `Fylling ${t2(-d, 2)} m`,
      `N ${t2(g.wy[kk], 1)}  Ø ${t2(g.wx[kk], 1)}`
    ];
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
      const zVed = (x, y) => {
        const i = Math.round((x - g.minX) / g.rute), j = Math.round((y - g.minY) / g.rute);
        const kk = j * g.nb + i;
        return (i >= 0 && j >= 0 && i < g.nb && j < g.nh && g.finnes[kk]) ? g.zP[kk] : g.lav;
      };
      const strek = (punkt, farge, bredde, lukk) => {
        if (punkt.length < 2) return;
        k.strokeStyle = farge; k.lineWidth = bredde; k.beginPath();
        punkt.forEach((q, i) => {
          const s = skjerm(q.x, q.y, q.z != null ? q.z : zVed(q.x, q.y));
          if (i === 0) k.moveTo(s.x, s.y); else k.lineTo(s.x, s.y);
        });
        if (lukk) k.closePath();
        k.stroke();
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
      const ly = this._lys(g, k00, k10, k01, z);
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
          const ly = this._lys(g, k00, k10, k01, z);
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
        ? { hoyde: g.zT, farge: enkel(Farger.terrengRgb), blanding: 0, krev: g.utenGrav }
        : { hoyde: g.zT, farge: enkel(Farger.terrengRgb), blanding: 0.45 });
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
