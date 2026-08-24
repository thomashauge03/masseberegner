'use strict';
/**
 * Vegen i tre dimensjoner.
 *
 * Tverrprofilen viser ett snitt om gangen, og lengdeprofilen viser bare
 * senterlinja. Ingen av dem viser det man egentlig vil se: hvordan skråningene
 * legger seg i terrenget langs hele strekket, og hvor bredt inngrepet blir.
 * Ligger linja for høyt, vises det som fyllingsvinger som brer seg utover og et
 * fotavtrykk som sveller – og det ser man bare fra siden.
 *
 * Tegningen ligger i Tegner3d (ui-3d.js), den samme som tomta bruker. Her er
 * bare vegens eget: gitteret, lagene, strekene og tallene.
 *
 * GITTERET ER IKKE I UTM
 * For en tomt er gitteret et rett rutenett i kartplanet. For en veg er den ene
 * aksen STASJON langs senterlinja og den andre AVSTAND UT fra den, så nodene
 * svinger med kurven. Derfor bærer gitteret sine egne verdenskoordinater –
 * `App.linje.punktMedAvvik(s, t)` – og aldri en formel som `minX + i * rute`.
 * Den formelen gir en rett stripe i stedet for vegens trasé: koden kompilerer,
 * bildet ser fint ut, og modellen er bare en annen veg.
 *
 * DEN VIKTIGSTE REGELEN
 * Jordarbeidsflaten kommer fra `pr.geometri.jord`, som masser.js har marsjert
 * ut. Denne fila regner ALDRI ut sin egen skråningsgeometri. Fristelsen er
 * større her enn på tomta – det er kortere å marsjere ut fra `fotVenstre` med
 * malens helning enn å slå opp – men da har man to modeller som kan drive fra
 * hverandre, og bildet havner i et tilbud.
 */

const Veg3d = Object.assign(Object.create(Tegner3d), {
  /* Egne felt, ikke arvet. Et objekt på prototypen ville vært DELT med tomta –
     slår man av terrenget her, forsvant det der òg. */
  yaw: 0,
  /* Lav vinkel, ikke tomtas 55 grader. Det er den lave vinkelen som avslører en
     linje som ligger for høyt. */
  pitch: 22,
  kontekst: 30,
  /* HELE VEGEN, ikke et vindu.
     Her sto det 100 – hundre meter til hver side av snittet. Det var galt av
     samme grunn som en tverrprofil er for lite: det man vil vite er hvor på
     STREKKET det svulmer ut, og da må strekket være i bildet. Vinduet finnes
     fortsatt som valg for den som vil se på ett parti, men det er ikke det man
     møter. */
  vindu: 0,            // meter til hver side av snittet; 0 = hele vegen
  lag: { terreng: true, grav: true, vegbane: true, fjell: false, rutenett: false, grenser: true },

  /* Kolonneskjemaet. Likt i hver rad, så en kolonne alltid betyr det samme:
     foten er kolonne 0 og SISTE, vegkantene 27 og 35, senterlinja 31. Da blir
     fot, vegkant og senterlinje eksakte sammenhengende kanter i modellen, og
     overleggsstrekene er bare kolonneindekser.
     En felles absolutt t-akse ble prøvd og forkastet: den gir en SAGTANNET
     skråningsfot, fordi rasteriseringen hopper over firkanter der et hjørne
     mangler. På en tomt er det en halv rute i utkanten. På en veg er fotlinja
     selve leveransen, og et fotavtrykk som er systematisk for smalt er en
     stille løgn. */
  KANT_V: 27, KANT_H: 35, SENTER: 31, KOL: 63,

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('veg3d');
    this.over = document.getElementById('veg3dover');
    if (!this.lerret) return this;
    this._musKobling();
    new ResizeObserver(() => this.tegn()).observe(this.lerret);
    return this;
  },

  aktiver(pa) {
    this.aktiv = !!pa;
    const vis = (id, synlig) => {
      const e = document.getElementById(id);
      if (e) e.classList.toggle('skjult', !synlig);
    };
    vis('veg3d', this.aktiv);
    vis('veg3dover', this.aktiv);
    vis('tverrprofil', !this.aktiv);
    vis('veg3dverktoy', this.aktiv);
    vis('tverrpunkthoyder', !this.aktiv);
    for (const [id, pa2] of [['vegVis3d', this.aktiv], ['vegVisSnitt', !this.aktiv]]) {
      const k = document.getElementById(id);
      if (k) k.classList.toggle('aktiv', pa2);
    }
    if (this.aktiv) { this._gitterFor = null; this._skalaSatt = false; this.tegn(); }
    else Tverrprofil.tegn();
  },

  _harData(res) { return !!(res && res.profiler && res.profiler.length > 1 && this.app.linje); },

  /** Meldingen når det ikke er noe å vise ennå. */
  _tomTekst() { return 'Legg inn en veglinje og en høydeprofil, så kommer modellen her'; },

  /**
   * Snittet flyttet seg.
   *
   * Vises hele vegen, endrer ikke gitteret seg av det – bare merket for hvor
   * snittet står. Bygges gitteret om her, kastes hele modellen og bygges opp
   * igjen for hvert eneste dratt i skyveren, og det hakker.
   */
  stasjonEndret() {
    if (!this.aktiv) return;
    if (this.vindu > 0) this._gitterFor = null;
    this.tegn();
  },

  /**
   * Et klikk i modellen velger stedet, og snittet flytter seg dit.
   *
   * Dette er selve navigeringen. Uten den er den eneste måten å komme til en
   * fylling man ser i modellen, å gjette seg fram med skyveren under – man ser
   * stedet, men kan ikke gå dit.
   */
  _velg(k, g) {
    if (!g || k < 0) return;
    const j = (k / g.nb) | 0;
    if (j >= 0 && j < g.nh) this.app.settTverrStasjon(g.s[j]);
  },

  /** Piltastene går bortover langs vegen, ett profil om gangen. */
  _stegVis(n) {
    const res = this.app && this.app.resultat;
    if (!res || !res.profiler || !res.profiler.length) return;
    const steg = res.profilsteg || 5;
    const na = this.app.tverrStasjon || 0;
    this.app.settTverrStasjon(Math.max(0, Math.min(res.lengde, na + n * steg)));
  },

  /**
   * Høyden på en flate ved en gitt offset.
   *
   * Samme lineære oppslag som tverrprofilen bruker. Listene kan ha
   * NÆRDUPLIKATE t – brekkpunktene ±hb ligger et hundredels mikrometer fra
   * hverandre – så divisjonen må tåle at de to er like.
   */
  _hoydeVed(liste, t) {
    if (!liste || !liste.length) return NaN;
    if (t <= liste[0][0]) return liste[0][1];
    const sis = liste[liste.length - 1];
    if (t >= sis[0]) return sis[1];
    let lav = 0, hoy = liste.length - 1;
    while (hoy - lav > 1) {
      const m = (lav + hoy) >> 1;
      if (liste[m][0] <= t) lav = m; else hoy = m;
    }
    const bredde = liste[hoy][0] - liste[lav][0];
    if (!(bredde > 1e-12)) return liste[hoy][1];
    const f = (t - liste[lav][0]) / bredde;
    return liste[lav][1] + f * (liste[hoy][1] - liste[lav][1]);
  },

  /**
   * Korridoren som et gitter: én rad per profil, KOL kolonner per rad.
   *
   * Radene desimeres ALDRI. Hopper man over annenhver stasjon for å spare tid,
   * endrer volumet modellen omslutter seg −26 % til +21 % på skjæringen – og
   * bildet ser like troverdig ut. Er det for mye, krymper VINDUET i stedet.
   */
  _gitter() {
    const app = this.app;
    const res = app && app.resultat;
    if (!res || !res.profiler || res.profiler.length < 2 || !app.linje) return null;

    const midt = app.tverrStasjon || 0;
    const fra = this.vindu > 0 ? midt - this.vindu : -Infinity;
    const til = this.vindu > 0 ? midt + this.vindu : Infinity;
    const rader = res.profiler.filter(p => p.s >= fra && p.s <= til);
    if (rader.length < 2) return null;

    const nokkel = res.profiler.length + '|' + fra.toFixed(2) + '|' + til.toFixed(2)
      + '|' + this.kontekst;
    if (this._gitterFor === res.profiler && this._gitterNokkel === nokkel) return this._gitterBuffer;

    /* Kontekstkolonner på hver side: bare terreng, ingen prosjektert flate.
       Uten dem slutter modellen i skråningsfoten, og man ser ikke om vegen går
       i ei li eller over en rygg. */
    const kn = this.kontekst > 0 ? 6 : 0;
    const nb = this.KOL + 2 * kn;
    const nh = rader.length;
    const n = nb * nh;
    if (n > 4e6) return null;

    /* Float64, ikke Float32. Nordkoordinaten er rundt 6 460 000, og der ligger
       nabotallene i float32 en halv meter fra hverandre – mens steget på tvers
       av vegen her er 0,33 m. Med float32 kollapset 18 % av cellene til null
       bredde, og lyset regnet kryssproduktet av to kanter som ikke fantes. */
    const wx = new Float64Array(n), wy = new Float64Array(n);
    const zJord = new Float32Array(n), zT = new Float32Array(n);
    const zFjell = new Float32Array(n), zVeg = new Float32Array(n);
    const d = new Float32Array(n), tAkse = new Float32Array(n);
    const finnes = new Uint8Array(n), harGrav = new Uint8Array(n);
    const harVeg = new Uint8Array(n), usikker = new Uint8Array(n);
    const celleSperre = new Uint8Array(n);
    const sRad = new Float64Array(nh);

    let lav = Infinity, hoy = -Infinity, utenGeo = 0;

    for (let j = 0; j < nh; j++) {
      let pr = rader[j];
      sRad[j] = pr.s;
      /* Over 800 stasjoner slipper masser.js tegningsgeometrien for å spare
         minne. Da regnes det ene profilet om igjen her, og slippes med én gang
         det er skrevet inn i tabellene – aldri holdt på. */
      if (!pr.geometri && res.geometriFor) {
        try { pr = res.geometriFor(pr.s) || pr; } catch (e) { /* raden blir hull */ }
      }
      const geo = pr.geometri;
      if (!geo || !geo.jord || geo.jord.length < 2) { utenGeo++; continue; }

      const hb = pr.halvbredde;
      const tV = pr.fotVenstre, tH = pr.fotHoyre;
      const bleik = pr.manglerData || pr.avkortet
        || (pr.sider && ((pr.sider[-1] && pr.sider[-1].truffet === false)
          || (pr.sider[1] && pr.sider[1].truffet === false)));

      for (let i = 0; i < nb; i++) {
        const k = j * nb + i;
        let t, erGrav = true;
        if (i < kn) {                                   // kontekst til venstre
          t = tV - this.kontekst * (kn - i) / kn; erGrav = false;
        } else if (i >= nb - kn) {                      // kontekst til høyre
          t = tH + this.kontekst * (i - (nb - kn) + 1) / kn; erGrav = false;
        } else {
          const c = i - kn;
          if (c <= this.KANT_V) t = tV + (-hb - tV) * (c / this.KANT_V);
          else if (c >= this.KANT_H) t = hb + (tH - hb) * ((c - this.KANT_H) / (this.KOL - 1 - this.KANT_H));
          else t = -hb + 2 * hb * ((c - this.KANT_V) / (this.KANT_H - this.KANT_V));
        }
        tAkse[k] = t;
        const p = app.linje.punktMedAvvik(pr.s, t);
        wx[k] = p.x; wy[k] = p.y;

        if (erGrav) {
          const zj = this._hoydeVed(geo.jord, t);
          const zt = this._hoydeVed(geo.rensk, t);
          if (!Number.isFinite(zj) || !Number.isFinite(zt)) continue;
          zJord[k] = zj; zT[k] = zt;
          zFjell[k] = this._hoydeVed(geo.fjell, t);
          d[k] = zt - zj;
          finnes[k] = 1; harGrav[k] = 1;
          const c = i - kn;
          if (c >= this.KANT_V && c <= this.KANT_H && geo.veg && geo.veg.length > 1) {
            const zv = this._hoydeVed(geo.veg, t);
            if (Number.isFinite(zv)) { zVeg[k] = zv; harVeg[k] = 1; }
          }
          if (bleik) usikker[k] = 1;
          lav = Math.min(lav, zj, zt); hoy = Math.max(hoy, zj, zt);
        } else {
          const z = app.terreng ? app.terreng.z(p.x, p.y) : NaN;
          if (!Number.isFinite(z)) continue;
          zT[k] = z; zJord[k] = z; zFjell[k] = z;
          finnes[k] = 1;
          lav = Math.min(lav, z); hoy = Math.max(hoy, z);
        }
      }
    }
    if (!Number.isFinite(lav)) return null;

    /* FOLDING I KRAPPE KURVER.
       Der skråningen strekker seg forbi kurvesenteret, folder korridoren seg
       over seg selv på innersida, og dybdebufferet ville tegnet det uten et
       ord. Testen står per CELLE, ikke per profil: `forbiKurvesenter` på
       profilet er verken nødvendig eller tilstrekkelig for at akkurat den cella
       er foldet. Fortegnet på kryssproduktet av de to cellekantene er det. */
    let tegn = 0, sperret = 0;
    for (let j = 0; j < nh - 1; j++) {
      for (let i = 0; i < nb - 1; i++) {
        const k00 = j * nb + i, k10 = k00 + 1, k01 = k00 + nb;
        if (!finnes[k00] || !finnes[k10] || !finnes[k01]) continue;
        const kr = (wx[k10] - wx[k00]) * (wy[k01] - wy[k00])
          - (wy[k10] - wy[k00]) * (wx[k01] - wx[k00]);
        if (!tegn) { tegn = Math.sign(kr) || 0; continue; }
        if (kr * tegn < 0) { celleSperre[k00] = 1; sperret++; }
      }
    }

    /* Fargeskalaen regnes på HELE vegen, ikke på vinduet. Normalisert på
       vinduet ville samme farge betydd to forskjellige ting i to skjermbilder
       av samme veg. */
    let maksAvvik = 0;
    for (const p of res.profiler) {
      maksAvvik = Math.max(maksAvvik, p.maksSkjaering || 0, p.maksFylling || 0);
    }

    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (let k = 0; k < n; k++) {
      if (!finnes[k]) continue;
      minX = Math.min(minX, wx[k]); maksX = Math.max(maksX, wx[k]);
      minY = Math.min(minY, wy[k]); maksY = Math.max(maksY, wy[k]);
    }

    const g = {
      nb, nh, lav, hoy, maksAvvik: Math.max(0.5, maksAvvik),
      midtX: (minX + maksX) / 2, midtY: (minY + maksY) / 2,
      diagonal: Math.hypot(maksX - minX, maksY - minY),
      linjebredde: 1,
      wx, wy, zT, zP: zJord, zF: zFjell, zVeg, harVeg,
      d, tAkse, s: sRad, finnes, harGrav, usikker, celleSperre,
      sperret, utenGeo, fra: rader[0].s, til: rader[rader.length - 1].s,
      totalt: n, kn
    };
    this._gitterFor = res.profiler; this._gitterNokkel = nokkel; this._gitterBuffer = g;
    return g;
  },

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
          const dd = g.d[k00];
          const t = Math.min(1, Math.sqrt(Math.abs(dd) / g.maksAvvik));
          const tab = dd >= 0 ? pal.skjaering : pal.fylling;
          const i = Math.min(pal.N - 1, Math.round(t * (pal.N - 1))) * 3;
          let r = tab[i], gg = tab[i + 1], bl = tab[i + 2];
          const ly = this._lys(g, k00, k10, k01, z);
          const m = g.usikker[k00] ? 0.82 : 1;
          r = Math.min(255, r * ly * m); gg = Math.min(255, gg * ly * m); bl = Math.min(255, bl * ly * m);
          if (this.lag.rutenett && this._paaRutelinje(g, k00)) { r *= 0.72; gg *= 0.72; bl *= 0.72; }
          return (255 << 24) | (bl << 16) | (gg << 8) | r;
        }
      });
    }
    /* Vegbanen er en EGEN ugjennomsiktig flate. Den er 16–29 % av bredden og er
       selve leveransen; blandet inn i graveflaten forsvinner den. */
    if (this.lag.vegbane) {
      ut.push({ hoyde: g.zVeg, krev: g.harVeg, blanding: 0,
        farge: enkel(Farger.rgb('data-slitelag')) });
    }
    if (this.lag.terreng) ut.push({ hoyde: g.zT, farge: enkel(Farger.terrengRgb), blanding: 0.45 });
    if (this.lag.fjell) ut.push({ hoyde: g.zF, krev: g.harGrav, farge: enkel(Farger.fjellRgb), blanding: 0.5 });
    return ut;
  },

  /** Fot, vegkant og senterlinje er bare kolonneindekser i gitteret. */
  _overleggEkstra(k, g, kam, skjerm) {
    if (!this.lag.grenser) return;
    const kol = (i, farge, bredde) => {
      k.strokeStyle = farge; k.lineWidth = bredde; k.beginPath();
      let forrige = false;
      for (let j = 0; j < g.nh; j++) {
        const kk = j * g.nb + i;
        if (!g.finnes[kk]) { forrige = false; continue; }
        const p = skjerm(g.wx[kk], g.wy[kk], g.zP[kk]);
        if (forrige) k.lineTo(p.x, p.y); else k.moveTo(p.x, p.y);
        forrige = true;
      }
      k.stroke();
    };
    const kn = g.kn;
    kol(kn, Farger.skjaering, 1.6);                          // venstre fot
    kol(g.nb - 1 - kn, Farger.skjaering, 1.6);               // høyre fot
    kol(kn + this.KANT_V, Farger.veg, 1.4);                  // venstre vegkant
    kol(kn + this.KANT_H, Farger.veg, 1.4);                  // høyre vegkant
    kol(kn + this.SENTER, Farger.blekk, 1.8);                // senterlinja

    /* HVOR SNITTET STÅR.
       Vises hele vegen, er dette det eneste som knytter modellen til
       tverrsnittet ved siden av og til skyveren under. Uten merket er de tre
       tre løsrevne bilder av samme veg. */
    const sNa = this.app.tverrStasjon;
    if (sNa != null && g.nh > 1) {
      let j = 0;
      for (let q = 1; q < g.nh; q++) {
        if (Math.abs(g.s[q] - sNa) < Math.abs(g.s[j] - sNa)) j = q;
      }
      k.strokeStyle = Farger.blekk; k.lineWidth = 2.4;
      k.beginPath();
      let forrige = false;
      for (let i = 0; i < g.nb; i++) {
        const kk = j * g.nb + i;
        if (!g.finnes[kk]) { forrige = false; continue; }
        const p = skjerm(g.wx[kk], g.wy[kk], g.zP[kk]);
        if (forrige) k.lineTo(p.x, p.y); else k.moveTo(p.x, p.y);
        forrige = true;
      }
      k.stroke();
      // profilnummeret ved enden av merket, så man vet hvor man er
      const enden = j * g.nb + g.nb - 1;
      if (g.finnes[enden]) {
        const p = skjerm(g.wx[enden], g.wy[enden], g.zP[enden]);
        k.fillStyle = Farger.blekk;
        k.font = '11px system-ui, sans-serif';
        k.textAlign = 'left';
        k.fillText('prof ' + Rapport.tall(g.s[j], 0), p.x + 5, p.y + 4);
      }
    }
  },

  _hudLinjer(g) {
    const res = this.app.resultat;
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    const linjer = [];
    /* TALLENE GJELDER VINDUET, IKKE HELE VEGEN – og det må stå.
       Uten det leses strekningens sum som prosjektets sum. */
    linjer.push(`Strekning ${t2(g.fra, 0)}–${t2(g.til, 0)} m`
      + (this.vindu > 0 ? ` av ${t2(res.lengde, 0)} m` : ' (hele vegen)')
      + ` · ${g.nh} profiler`);
    let skj = 0, fyl = 0;
    for (const iv of (res.intervaller || [])) {
      if (iv.fra < g.fra - 1e-6 || iv.til > g.til + 1e-6) continue;
      skj += iv.volum.skjaering; fyl += iv.volum.fylling;
    }
    linjer.push(`${t2(skj)} m³ skjæring · ${t2(fyl)} m³ fylling på strekningen`);
    // fotavtrykket: det er her man leser av at linja ligger for høyt
    let bredest = 0, bs = 0;
    for (const p of res.profiler) {
      if (p.s < g.fra - 1e-6 || p.s > g.til + 1e-6) continue;
      const br = p.fotHoyre - p.fotVenstre;
      if (br > bredest) { bredest = br; bs = p.s; }
    }
    if (bredest > 0) linjer.push(`Bredeste inngrep ${t2(bredest, 1)} m ved profil ${t2(bs, 0)}`);
    const usikre = this._tellUsikre(g);
    if (usikre) linjer.push(`${usikre} noder er bleiket – skråningen der nådde ikke terrenget`);
    if (g.sperret) {
      linjer.push(`${g.sperret} celler er ikke tegnet – skråningen strekker seg forbi `
        + 'kurvesenteret, og volumet der er ikke entydig');
    }
    if (g.utenGeo) linjer.push(`${g.utenGeo} profiler mangler tverrsnittsgeometri`);
    return linjer;
  },

  _avlesning(g, kk) {
    const t2 = (v, d = 0) => Rapport.tall(v, d);
    const j = (kk / g.nb) | 0;
    const dd = g.d[kk];
    return [
      `Profil ${t2(g.s[j], 1)} · avvik ${t2(g.tAkse[kk], 2)} m`,
      `Terreng ${t2(g.zT[kk], 2)} · jordarbeid ${t2(g.zP[kk], 2)}`,
      g.harGrav[kk]
        ? (dd >= 0 ? `Skjæring ${t2(dd, 2)} m` : `Fylling ${t2(-dd, 2)} m`)
        : 'Terreng utenfor inngrepet'
    ];
  },

  /**
   * Utgangsstillingen.
   *
   * Senteret er midten av det som faktisk vises, ikke et punkt på linja: viser
   * man hele vegen, ville et punkt midt på linja lagt halve modellen utenfor
   * ruta hvis traseen svinger.
   *
   * DREININGEN BLIR MÅLT, IKKE GJETTET.
   * Her sto `retning + 90` – vegen på tvers av bildet. Det er riktig for et
   * kort strekk og galt for hele vegen: en to kilometer lang veg lagt på tvers
   * av en rute som er høyere enn den er bred, må krympe til den smaleste kanten
   * passer, og blir en tråd. Nå prøves begge veier mot den samme tilpasningen
   * som tegningen bruker, og den som gjør modellen størst vinner.
   */
  nullstill() {
    const app = this.app;
    const res = app && app.resultat;
    this.panX = 0; this.panY = 0;
    this.senter = null;
    this._skalaSatt = false;
    this.pitch = this.vindu > 0 ? 22 : 32;
    const g = this._gitter(1);
    if (g && res && app.linje) {
      this.senter = { x: g.midtX, y: g.midtY };
      const p = app.linje.punktVed(Math.max(0, Math.min(res.lengde, app.tverrStasjon || 0)));
      const grunn = (p && Number.isFinite(p.x)) ? p.retning * 180 / Math.PI : 0;
      const c = this.lerret;
      if (c && c.clientWidth > 20) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.yaw = this._besteYaw([grunn, grunn + 90], c.clientWidth * dpr, c.clientHeight * dpr, g);
      } else {
        this.yaw = grunn + 90;
      }
    }
    this.tegn();
  }
});

if (typeof module !== 'undefined') module.exports = Veg3d;
