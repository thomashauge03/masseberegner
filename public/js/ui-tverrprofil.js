'use strict';
/** Tverrprofilet: terreng, fjell, planum, grøft, skråninger og vegkropp. */

const Tverrprofil = {
  app: null, lerret: null, ctx: null, profil: null,
  marg: { v: 42, h: 12, o: 10, u: 24 },

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('tverrprofil');
    this.ctx = this.lerret.getContext('2d');
    const skyver = document.getElementById('tverrSkyver');
    skyver.oninput = () => {
      const res = app.resultat;
      if (!res) return;
      const i = Math.round(skyver.value / 100 * (res.profiler.length - 1));
      app.settTverrStasjon(res.profiler[i].s);
    };
    document.getElementById('tverrForrige').onclick = () => this.flytt(-1);
    document.getElementById('tverrNeste').onclick = () => this.flytt(1);
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);

    /* Musepekeren leser av snittet der den star: avstand fra senterlinjen,
       høyder, hvor dypt det skal graves eller fylles - og helningen bade
       pa tvers og pa langs. En skraning er lettest a kjenne igjen som 1:n,
       sa den star slik ved siden av prosentene. */
    this.lerret.addEventListener('mousemove', e => {
      const r = this.lerret.getBoundingClientRect();
      this.peker = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.tegn();
    });
    this.lerret.addEventListener('mouseleave', () => { this.peker = null; this.tegn(); });
    return this;
  },

  /** Tekst med bakgrunn under, sa den leses uansett hva den ligger oppa. */
  _merkelapp(c, tekst, x, y, o = {}) {
    const b = c.measureText(tekst).width;
    const h = o.hoyde || 12;
    const midt = c.textAlign === 'center';
    const venstre = midt ? x - b / 2 : (c.textAlign === 'right' ? x - b : x);
    const topp = c.textBaseline === 'bottom' ? y - h + 2 : (c.textBaseline === 'middle' ? y - h / 2 : y);
    c.save();
    c.fillStyle = Farger.flate;
    c.globalAlpha = o.gjennomsikt != null ? o.gjennomsikt : 0.82;
    c.fillRect(venstre - 3, topp - 1, b + 6, h + 1);
    c.restore();
    c.fillStyle = o.farge || Farger.blekk;
    c.fillText(tekst, x, y);
  },

  /**
   * Helningen til en tegnet linje der pekeren star.
   * @param {Array<[number,number]>} liste punktene [avstand, høyde]
   * @returns {number|null} stigning som forhold, positiv oppover mot høyre
   */
  _helning(liste, t) {
    if (!liste || liste.length < 2) return null;
    let i = 0;
    for (let j = 1; j < liste.length; j++) {
      if (Math.abs(liste[j][0] - t) < Math.abs(liste[i][0] - t)) i = j;
    }
    /* To nabopunkt rundt treffet gir en jevnere avlesning enn ett steg. Men
       punktene kan ligge oppa hverandre - knekkpunktene i malen legges inn
       med en brøkdel av en millimeter mellom seg, og siste punkt star to
       ganger - sa det ma søkes utover til det er en virkelig avstand a dele
       pa. Uten det ga hver avlesning nær kanten ingen helning i det hele
       tatt. */
    let lav = Math.max(0, i - 1), hoy = Math.min(liste.length - 1, i + 1);
    while (liste[hoy][0] - liste[lav][0] < 1e-6) {
      if (lav > 0) lav--;
      else if (hoy < liste.length - 1) hoy++;
      else return null;
    }
    return (liste[hoy][1] - liste[lav][1]) / (liste[hoy][0] - liste[lav][0]);
  },

  /** Høyden til en tegnet linje der pekeren star. */
  _hoydeVed(liste, t) {
    if (!liste || !liste.length) return NaN;
    if (t <= liste[0][0]) return liste[0][1];
    if (t >= liste[liste.length - 1][0]) return liste[liste.length - 1][1];
    for (let i = 0; i < liste.length - 1; i++) {
      if (t >= liste[i][0] && t <= liste[i + 1][0]) {
        const d = liste[i + 1][0] - liste[i][0];
        if (d < 1e-9) return liste[i][1];
        const f = (t - liste[i][0]) / d;
        return liste[i][1] + f * (liste[i + 1][1] - liste[i][1]);
      }
    }
    return NaN;
  },

  /**
   * Er det et hull i terrengmodellen her?
   *
   * Punkt uten terrengdata blir hoppet over nar snittet regnes, sa de star
   * ikke i listene i det hele tatt. Et hull ser derfor ut som to nabopunkt
   * med uvanlig stor avstand mellom seg - og interpolasjonen imellom dem er
   * ren oppdikting.
   */
  _erHull(liste, t, grense = 1.0) {
    if (!liste || liste.length < 2) return false;
    for (let i = 0; i < liste.length - 1; i++) {
      if (t >= liste[i][0] && t <= liste[i + 1][0]) {
        return liste[i + 1][0] - liste[i][0] > grense;
      }
    }
    return false;
  },

  /** «1:1,5» ved siden av prosenten – det malet en maskinfører kjenner. */
  _somForhold(helning) {
    const a = Math.abs(helning);
    if (a < 1e-4) return 'flatt';
    if (a > 20) return 'nesten loddrett';
    return '1:' + (1 / a).toFixed(a > 1 ? 2 : 1).replace('.', ',');
  },

  flytt(retning) {
    const res = this.app.resultat;
    if (!res) return;
    let i = res.profiler.findIndex(p => Math.abs(p.s - this.app.tverrStasjon) < 1e-6);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(res.profiler.length - 1, i + retning));
    this.app.settTverrStasjon(res.profiler[i].s);
  },

  vis(profil) {
    this.profil = profil;
    const res = this.app.resultat;
    if (res && profil) {
      const i = res.profiler.indexOf(profil);
      if (i >= 0) document.getElementById('tverrSkyver').value = Math.round(i / Math.max(1, res.profiler.length - 1) * 100);
      const a = profil.areal;
      document.getElementById('tverrEtikett').innerHTML =
        `Profil <b>${profil.s.toFixed(1)}</b> · veg ${profil.vegnivaa.toFixed(2)} · terr ${isFinite(profil.terrengSenter) ? profil.terrengSenter.toFixed(2) : '–'} · `
        + `<span class="merke-skjaering">skjær ${a.skjaering.toFixed(1)} m²</span> `
        + `(<span class="merke-fjell">fjell ${a.skjaeringFjell.toFixed(1)}</span>) · `
        + `<span class="merke-fylling">fyll ${a.fylling.toFixed(1)} m²</span>`
        + (isFinite(profil.radius) ? ` · R=${profil.radius.toFixed(0)} m` : '');
    }
    this.tegn();
  },

  tegn() {
    const l = this.lerret, c = this.ctx;
    if (!l.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    if (l.width !== l.clientWidth * dpr || l.height !== l.clientHeight * dpr) {
      l.width = l.clientWidth * dpr; l.height = l.clientHeight * dpr;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = l.clientWidth, H = l.clientHeight, m = this.marg;
    c.clearRect(0, 0, B, H);
    c.fillStyle = Farger.flate; c.fillRect(0, 0, B, H);

    let pr = this.profil;
    if (!pr) {
      c.fillStyle = Farger.blekkSvak; c.font = '13px system-ui'; c.textAlign = 'center';
      c.fillText('Velg et profilnummer for å se tverrsnittet.', B / 2, H / 2);
      return;
    }
    /* Pa lange veier blir tegningsgeometrien sluppet for a spare minne. Da
       regnes det ene snittet som skal vises om igjen - det koster under et
       millisekund. */
    if (!pr.geometri) {
      const res = this.app.resultat;
      if (res && res.geometriFor) pr = res.geometriFor(pr.s);
    }
    if (!pr.geometri || pr.geometri.terreng.length < 2) {
      c.fillStyle = Farger.skjaering; c.font = '13px system-ui'; c.textAlign = 'center';
      c.fillText('Terrengmodellen mangler data for profil ' + pr.s.toFixed(1) + '.', B / 2, H / 2);
      return;
    }

    // omrade
    let zMin = Infinity, zMax = -Infinity;
    for (const liste of [pr.geometri.terreng, pr.geometri.jord, pr.geometri.veg]) {
      for (const [, z] of liste) if (isFinite(z)) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    }
    if (!isFinite(zMin)) { zMin = pr.vegnivaa - 2; zMax = pr.vegnivaa + 2; }
    const tMin = pr.fotVenstre - 1.5, tMax = pr.fotHoyre + 1.5;
    const zSlakk = Math.max(0.35, (zMax - zMin) * 0.10);
    zMin -= zSlakk; zMax += zSlakk;

    // lik malestokk i begge retninger, tilpasset lerretet
    const bruksB = B - m.v - m.h, bruksH = H - m.o - m.u;
    const skala = Math.min(bruksB / (tMax - tMin), bruksH / (zMax - zMin));
    const midtT = (tMin + tMax) / 2, midtZ = (zMin + zMax) / 2;
    const px = t => m.v + bruksB / 2 + (t - midtT) * skala;
    const py = z => m.o + bruksH / 2 - (z - midtZ) * skala;

    // tatt vare pa, sa musepekeren kan regne seg tilbake til meter
    this._kart = { px, py, tMin, tMax, zMin, zMax, m, B, H, pr };

    /* rutenett
       Tallene stod i den svake blekkfargen. Pa aksene gar det, men de samme
       tallene havner ogsa oppa tegningen - og vegoverflaten er hvit. Gratt pa
       hvitt er under to i kontrast, og da er tallet borte. Aksetallene far
       full blekkfarge, og de som star inne i tegningen far en bakgrunn under
       seg sa de leses uansett hva de ligger over. */
    c.strokeStyle = Farger.rutenett; c.lineWidth = 1; c.fillStyle = Farger.blekk; c.font = '10px system-ui';
    const zSteg = velgSteg(zMax - zMin, 5);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let z = Math.ceil(zMin / zSteg) * zSteg; z <= zMax; z += zSteg) {
      c.beginPath(); c.moveTo(m.v, py(z)); c.lineTo(B - m.h, py(z)); c.stroke();
      c.fillText(z.toFixed(1), m.v - 4, py(z));
    }
    const tSteg = velgSteg(tMax - tMin, 8);
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = Math.ceil(tMin / tSteg) * tSteg; t <= tMax; t += tSteg) {
      c.beginPath(); c.moveTo(px(t), m.o); c.lineTo(px(t), H - m.u); c.stroke();
      c.fillStyle = Farger.blekk;
      c.fillText(t.toFixed(0), px(t), H - m.u + 3);
    }
    c.strokeStyle = Farger.akse;
    c.beginPath(); c.moveTo(px(0), m.o); c.lineTo(px(0), H - m.u); c.stroke();

    const bane = (punkter, lukk) => {
      c.beginPath();
      punkter.forEach(([t, z], i) => { const X = px(t), Y = py(z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      if (lukk) c.closePath();
    };

    /* Flaten mellom terrenget og jordarbeidsflaten deles i to:
       ligger jordarbeidsflaten under terrenget skal det graves (skjæring),
       ligger den over skal det fylles. */
    const terr = pr.geometri.terreng, jord = pr.geometri.jord, fjellL = pr.geometri.fjell;
    c.save();
    bane(terr.concat(jord.slice().reverse()), true);
    c.clip();
    c.fillStyle = Farger.skjaeringFlate;   // skjæring: under terrengoverflaten
    bane(terr.concat([[terr[terr.length - 1][0], zMin], [terr[0][0], zMin]]), true); c.fill();
    c.fillStyle = Farger.fyllingFlate;     // fylling: over terrengoverflaten
    bane(terr.concat([[terr[terr.length - 1][0], zMax], [terr[0][0], zMax]]), true); c.fill();
    c.restore();

    /* Fjellet er den delen av skjæringen som ma sprenges. Det blir skravert
       oppa skjæringsfargen i stedet for a fa en egen kulør, sa det leses som
       "denne delen av det samme". */
    c.save();
    bane(terr.concat(jord.slice().reverse()), true); c.clip();
    bane(fjellL.concat([[fjellL[fjellL.length - 1][0], zMin], [fjellL[0][0], zMin]]), true);
    c.fillStyle = Farger.fjellskravur(c); c.fill();
    c.restore();

    // fjelloverflate
    c.strokeStyle = Farger.fjell; c.lineWidth = 1.2; c.setLineDash([5, 4]);
    bane(fjellL); c.stroke();

    // terreng etter rensk - grensen masseberegningen regnes fra
    if (pr.geometri.rensk && pr.geometri.rensk.length > 1) {
      c.strokeStyle = Farger.rensk; c.lineWidth = 1; c.setLineDash([2, 3]);
      bane(pr.geometri.rensk); c.stroke();
    }
    c.setLineDash([]);

    // jordarbeidsflate (planum, grøft, skraninger)
    c.strokeStyle = Farger.planum; c.lineWidth = 1.8; bane(jord); c.stroke();

    // vegkropp: baerelag og slitelag
    /* AT DET FINNES ET RESULTAT BETYR IKKE AT DET ER ET VEGRESULTAT.
       Her sto `resultat ? resultat.mal : StandardMal`. Et TOMTEresultat har
       ingen `mal`, og da ble `mal` undefined – vakten slapp den gjennom fordi
       resultatet fantes. Neste linje leste `mal.slitelagTykkelse` og kastet.
       Det skjer hver gang programmet står i en tomt mens et vegtverrsnitt
       tegnes, og det gjør det for eksempel når en samleeksport går gjennom
       anleggene. Spørsmålet er om malen finnes, ikke om resultatet gjør det. */
    const hb = pr.halvbredde, mal = (this.app.resultat && this.app.resultat.mal) || StandardMal;
    const veg = pr.geometri.veg;
    if (veg.length > 1) {
      const planum = veg.map(([t, z]) => [t, z - mal.slitelagTykkelse - mal.baerelagTykkelse]);
      c.fillStyle = Farger.baerelag;
      bane(veg.map(([t, z]) => [t, z - mal.slitelagTykkelse]).concat(planum.slice().reverse()), true); c.fill();
      c.fillStyle = Farger.slitelag;
      bane(veg.concat(veg.map(([t, z]) => [t, z - mal.slitelagTykkelse]).reverse()), true); c.fill();
      c.strokeStyle = Farger.veg; c.lineWidth = 2; bane(veg); c.stroke();
    }

    // fjelloverflaten tegnes pa nytt over vegkroppen - det er den som avgjør
    // hvor mye som ma sprenges, sa den skal alltid vaere synlig
    c.strokeStyle = Farger.fjell; c.lineWidth = 1.2; c.setLineDash([5, 4]);
    bane(fjellL); c.stroke(); c.setLineDash([]);

    // terrenglinje
    c.strokeStyle = Farger.terreng; c.lineWidth = 1.7; bane(terr); c.stroke();

    /* Malsetting. Breddemalet ligger rett over vegoverflaten, som er hvit -
       derfor med bakgrunn under, ellers forsvinner det. */
    c.font = '10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    this._merkelapp(c, `${(mal.vegbredde + pr.utvidelse).toFixed(2)} m`, px(0), py(pr.vegnivaa) - 5);
    c.strokeStyle = Farger.blekk; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px(-hb), py(pr.vegnivaa) - 3); c.lineTo(px(hb), py(pr.vegnivaa) - 3); c.stroke();

    // tegnforklaring
    /* Tegnforklaringen viser hver post slik den faktisk er tegnet - strek,
       flate eller skravur. Med bare fargeruter ville de tre rødtonene sett
       nesten like ut. */
    const forklaring = [
      ['Terreng', 'strek', Farger.terreng],
      ['Etter rensk', 'stipla', Farger.rensk],
      ['Planum/skråning', 'strek', Farger.planum],
      ['Skjæring', 'flate', Farger.skjaeringFlate],
      ['Fylling', 'flate', Farger.fyllingFlate],
      ['Fjell', 'skravur', null]
    ];
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '10px system-ui';
    let fx = m.v + 4;
    const fy = m.o + 9;
    for (const [navn, form, farge] of forklaring) {
      c.save();
      if (form === 'flate') { c.fillStyle = farge; c.fillRect(fx, fy - 5, 11, 10); }
      else if (form === 'skravur') {
        c.fillStyle = Farger.skjaeringFlate; c.fillRect(fx, fy - 5, 11, 10);
        c.beginPath(); c.rect(fx, fy - 5, 11, 10); c.clip();
        c.fillStyle = Farger.fjellskravur(c); c.fillRect(fx, fy - 5, 11, 10);
      } else {
        c.strokeStyle = farge; c.lineWidth = 1.8;
        if (form === 'stipla') c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + 11, fy); c.stroke();
      }
      c.restore();
      c.fillStyle = Farger.blekkSvak; c.fillText(navn, fx + 15, fy);
      fx += 18 + c.measureText(navn).width + 8;
    }

    if (pr.advarsel) {
      c.fillStyle = Farger.skjaering; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText('⚠ ' + pr.advarsel, B - m.h, m.o + 4);
    }

    this._tegnAvlesning(c, pr, terr, jord, pr.geometri.rensk, { px, py, tMin, tMax, m, B, H });
  },

  /**
   * Avlesningen under musepekeren.
   *
   * Det som er verdt a vite pa et punkt i snittet er hvor langt ute man star,
   * hvor høyt terrenget og jordarbeidsflaten ligger der, hvor mye som skal
   * graves eller fylles - og helningen. Helningen pa tvers er den man ser i
   * snittet; stigningen langs veien star ved siden av, for det er den som er
   * bundet av veiklassen og radien i kurven.
   */
  _tegnAvlesning(c, pr, terr, jord, etterRensk, k) {
    if (!this.peker) return;
    const { px, py, tMin, tMax, m, B, H } = k;
    const { x, y } = this.peker;
    if (x < m.v || x > B - m.h || y < m.o || y > H - m.u) return;

    // fra piksel tilbake til meter fra senterlinjen
    const t = tMin + (x - px(tMin)) / (px(tMax) - px(tMin)) * (tMax - tMin);
    if (!isFinite(t)) return;

    /* Utenfor snittet finnes det ingen avlesning. Uten dette gjentok den
       verdien fra ytterste punkt sa langt ut man dro musen, og et tall som
       star stille nar man beveger seg ser ut som en malt verdi. */
    const utenfor = t < pr.fotVenstre - 1e-6 || t > pr.fotHoyre + 1e-6;
    /* Hull i terrengmodellen star ikke i listene i det hele tatt - de blir
       hoppet over nar snittet regnes. `_hoydeVed` interpolerer da rett over
       hullet og finner pa en høyde som ser like troverdig ut som de andre.
       Er det mer enn et par steg mellom nabopunktene, er det et hull. */
    const hull = this._erHull(terr, t);
    const zT = (utenfor || hull) ? NaN : this._hoydeVed(terr, t);
    const zJ = (utenfor || hull) ? NaN : this._hoydeVed(jord, t);
    // volumene males fra terrenget ETTER rensk, ikke fra det ratt terrenget
    const zR = (utenfor || hull) ? NaN : this._hoydeVed(etterRensk, t);
    const hTerr = (utenfor || hull) ? null : this._helning(terr, t);
    const hJord = (utenfor || hull) ? null : this._helning(jord, t);

    // loddrett hjelpelinje der pekeren star
    c.save();
    c.strokeStyle = Farger.blekk; c.globalAlpha = 0.45; c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(x, m.o); c.lineTo(x, H - m.u); c.stroke();
    c.restore();

    // prikker der linjene krysser
    for (const [z, farge] of [[zT, Farger.terreng], [zJ, Farger.planum]]) {
      if (!isFinite(z)) continue;
      c.fillStyle = farge;
      c.beginPath(); c.arc(x, py(z), 3, 0, Math.PI * 2); c.fill();
    }

    const rader = [];
    rader.push(['Avstand fra senter', `${t >= 0 ? '+' : '−'}${Math.abs(t).toFixed(2)} m`]);
    if (utenfor) rader.push(['', 'utenfor snittet']);
    if (hull) rader.push(['', 'terrengmodellen mangler data her']);
    if (isFinite(zT)) rader.push(['Terreng', zT.toFixed(2) + ' moh']);
    if (isFinite(zJ)) rader.push(['Jordarbeid', zJ.toFixed(2) + ' moh']);
    if (isFinite(zR) && isFinite(zJ)) {
      /* Males fra terrenget etter rensk - det er den flaten volumene regnes
         mot. Mot ratt terreng ble tallet en renskedybde for stort, og helt
         nær nullpunktet fikk det til og med feil fortegn: «skjæring 0,05 m»
         der det i virkeligheten skulle fylles. */
      const d = zR - zJ;
      rader.push([d >= 0 ? 'Skjæring her' : 'Fylling her', Math.abs(d).toFixed(2) + ' m']);
    }
    if (hJord != null) {
      rader.push(['Helning på tvers', `${(Math.abs(hJord) * 100).toFixed(1)} %  ${this._somForhold(hJord)}`]);
    }
    if (hTerr != null) {
      rader.push(['Terrenget på tvers', `${(Math.abs(hTerr) * 100).toFixed(1)} %  ${this._somForhold(hTerr)}`]);
    }

    /* Stigningen langs veien, og hva veiklassen tillater der. Kravet henger
       av radien i kurven, sa det er ikke det samme tallet hele veien. */
    const app = this.app;
    if (app && app.vprofil && app.linje) {
      const g = app.vprofil.stigning(pr.s);
      const tillatt = app.tillattStigning ? app.tillattStigning(pr.s, pr.s, g) : null;
      const over = tillatt != null && Math.abs(g) > tillatt + 1e-4;
      rader.push(['Stigning langs vegen',
        `${(g * 100).toFixed(1)} %` + (tillatt != null ? `  (maks ${(tillatt * 100).toFixed(0)} %)` : ''),
        over]);
      if (isFinite(pr.radius)) rader.push(['Radius her', pr.radius.toFixed(0) + ' m']);
    }

    // boksen legges pa den siden av pekeren det er plass
    c.font = '10px system-ui';
    let bredde = 0;
    for (const [a, b] of rader) bredde = Math.max(bredde, c.measureText(a).width + c.measureText(b).width + 22);
    const hoyde = rader.length * 13 + 8;
    const bx = (x + 12 + bredde < B - m.h) ? x + 12 : x - 12 - bredde;
    const by = Math.max(m.o + 2, Math.min(y - hoyde / 2, H - m.u - hoyde - 2));

    c.save();
    c.globalAlpha = 0.94;
    c.fillStyle = Farger.flate;
    c.fillRect(bx, by, bredde, hoyde);
    c.restore();
    c.strokeStyle = Farger.kantSterk || Farger.blekk; c.lineWidth = 1;
    c.strokeRect(bx + 0.5, by + 0.5, bredde - 1, hoyde - 1);

    c.textBaseline = 'middle';
    rader.forEach(([venstre, hoyre, uthevet], i) => {
      const ly = by + 10 + i * 13;
      c.textAlign = 'left';
      c.fillStyle = Farger.blekkSvak;
      c.fillText(venstre, bx + 7, ly);
      c.textAlign = 'right';
      c.fillStyle = uthevet ? Farger.skjaering : Farger.blekk;
      c.fillText(hoyre, bx + bredde - 7, ly);
    });
  }
};
