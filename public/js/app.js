'use strict';
/** Massekalk – binder sammen kart, profiler og beregning. */

const App = {
  P: null,
  sone: 32,
  linje: null,
  vprofil: null,
  terreng: null,
  terrengProfil: null,
  fjellmodell: null,
  resultat: null,
  tverrStasjon: 0,
  profilManuelt: false,
  _tidsavbrudd: null,
  _terrengnokkel: '',

  nyttProsjekt() {
    return {
      navn: 'Nytt prosjekt',
      ip: [],
      vip: [],
      standardRadius: 30,
      mal: Object.assign({}, StandardMal),
      faktorer: Object.assign({}, StandardFaktorer),
      fjell: { standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [] },
      tverrfall: [],            // egne fall per profil, satt i tverrprofilet
      profilAvstand: 5,
      bakkekorreksjon: true
    };
  },

  /**
   * Eldre prosjektfiler hadde grøftedybden malt fra vegkanten og
   * breddeutvidelsen som tillegg. Normalen maler fra planum og oppgir
   * total bredde, sa gamle filer regnes om ved apning.
   */
  moderniserProsjekt(P) {
    const m = P.mal || {};
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
    if (!Array.isArray(P.tverrfall)) P.tverrfall = [];
    return P;
  },

  async start() {
    this.P = this.nyttProsjekt();
    Kart.init(this);
    Lengdeprofil.init(this);
    Tverrprofil.init(this);
    Rapport.init(this);
    this.koblingerUI();
    this.malTilSkjema();
    this.tegnAlt();
    this.status('Klar. Velg «Tegn senterlinje» og klikk i kartet.');
    try {
      const liste = await Lager.saFrø();
      if (liste.length) this.status(`Klar. ${liste.length} lagrede prosjekt – trykk «Åpne».`);
    } catch (e) { /* uten lager virker programmet fortsatt, bare uten lagring */ }
  },

  status(t) { document.getElementById('statuslinje').textContent = t; },

  /**
   * Ja/nei-boks i programmets egen stil.
   *
   * Nettleserens confirm() blir blokkert i noen sammenhenger, og da forsvant
   * handlingen uten at brukeren fikk vite hvorfor. Denne gjør det samme, men
   * er alltid synlig.
   */
  bekreft(tekst, jaTekst = 'Ja') {
    return new Promise(løs => {
      const boks = document.getElementById('dialog');
      const innhold = document.getElementById('dialoginnhold');
      document.getElementById('dialogtittel').textContent = 'Bekreft';
      innhold.innerHTML = `<p class="notis" style="font-size:13px">${tekst}</p>
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="bekreftNei">Avbryt</button>
          <button class="knapp primaer" id="bekreftJa">${jaTekst}</button>
        </div>`;
      const lukk = svar => {
        boks.classList.add('skjult');
        document.removeEventListener('keydown', taste);
        løs(svar);
      };
      const taste = e => {
        if (e.key === 'Escape') lukk(false);
        if (e.key === 'Enter') lukk(true);
      };
      innhold.querySelector('#bekreftJa').onclick = () => lukk(true);
      innhold.querySelector('#bekreftNei').onclick = () => lukk(false);
      document.addEventListener('keydown', taste);
      boks.classList.remove('skjult');
      innhold.querySelector('#bekreftJa').focus();
    });
  },

  /** Tømmer alle panelene. Brukes nar et prosjekt legges bort. */
  tomPaneler() {
    this.resultat = null;
    this.terrengProfil = null;
    this.vprofil = null;
    this._terrengnokkel = '';
    this.tverrStasjon = 0;
    Rapport.visSammendrag(null);
    Tverrprofil.vis(null);
    Kart.lag.venstreFot.setLatLngs([]);
    Kart.lag.hoyreFot.setLatLngs([]);
    Kart.lag.vegkant.clearLayers();
    Kart.lag.stasjoner.clearLayers();
    Kart.lag.markorPos.clearLayers();
    this.visHoydetabell();
    this.visLinjetabell();
    Lengdeprofil.tegn();
    for (const f of ['tp_venstre', 'tp_senter', 'tp_hoyre']) {
      const e = document.getElementById(f);
      if (e) { e.value = ''; e.classList.remove('overstyrt'); }
    }
    document.getElementById('tverrEtikett').textContent = '–';
  },

  framdrift(vis, tekst, andel) {
    const boks = document.getElementById('framdrift');
    boks.classList.toggle('skjult', !vis);
    if (tekst) document.getElementById('framdriftTekst').textContent = tekst;
    document.getElementById('framdriftStolpe').style.width = Math.round((andel || 0) * 100) + '%';
  },

  /* ---------------- geometri ---------------- */

  byggLinje() {
    const P = this.P;
    if (P.ip.length) this.sone = Geo.sone(P.ip[0].lon);
    const ip = P.ip.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, this.sone);
      return { x: u.x, y: u.y, r: p.r || 0 };
    });
    this.linje = new Linjeforing(ip);
    return this.linje;
  },

  bakkefaktor() {
    if (!this.P.bakkekorreksjon || !this.linje || !this.linje.lengde) return 1;
    const p = this.linje.punktVed(this.linje.lengde / 2);
    let h = 0;
    if (this.terrengProfil && this.terrengProfil.z.length) {
      const gyldige = this.terrengProfil.z.filter(isFinite);
      if (gyldige.length) h = gyldige.reduce((a, b) => a + b, 0) / gyldige.length;
    }
    return Geo.bakkefaktor(p.x, p.y, this.sone, h);
  },

  korridorbredde() { return (this.P.mal.maksSokebredde || 45) + 12; },

  async lastTerreng() {
    if (!this.linje || this.linje.lengde <= 0) return;
    const res = this.linje.lengde > 4000 ? 2 : 1;
    if (!this.terreng || this.terreng.sone !== this.sone || this.terreng.res !== res) {
      this.terreng = new Terreng(this.sone, res);
    }
    const nokkel = this.P.ip.map(p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)},${p.r}`).join('|') + '#' + this.korridorbredde();
    if (nokkel === this._terrengnokkel) return;
    this.framdrift(true, 'Henter terrengdata fra Kartverket…', 0);
    await this.terreng.lastKorridor(this.linje, this.korridorbredde(), (f, t) => {
      this.framdrift(true, `Henter terrengdata fra Kartverket… ${f}/${t}`, t ? f / t : 1);
    });
    this.framdrift(false);
    this._terrengnokkel = nokkel;
    if (this.terreng.mangler.size) {
      this.status(`⚠ Fikk ikke ${this.terreng.mangler.size} av ${this.terreng.fliser.size + this.terreng.mangler.size} terrengfliser – deler av traseen mangler data`);
    } else {
      this.status(`Terreng lastet (${this.terreng.fliser.size} fliser, ${this.terreng.minneMb()} MB)`);
    }
  },

  hentTerrengProfil() {
    const steg = Math.max(0.5, Math.min(2, this.P.profilAvstand / 2));
    const s = [], z = [];
    for (let d = 0; d <= this.linje.lengde + 1e-9; d += steg) {
      const dd = Math.min(d, this.linje.lengde);
      const p = this.linje.punktVed(dd);
      s.push(dd); z.push(this.terreng.z(p.x, p.y));
      if (dd >= this.linje.lengde) break;
    }
    this.terrengProfil = { s, z };
  },

  justerProfilTilLengde() {
    const L = this.linje.lengde;
    const V = this.P.vip;
    if (!V.length) return;
    for (let i = V.length - 1; i >= 0; i--) if (V[i].s > L + 1e-6) V.splice(i, 1);
    if (!V.length) return;
    const siste = V[V.length - 1];
    if (Math.abs(siste.s - L) > 0.5) {
      const g = V.length > 1 ? (siste.z - V[V.length - 2].z) / (siste.s - V[V.length - 2].s) : 0;
      V.push({ s: L, z: siste.z + g * (L - siste.s), k: siste.k });
    }
  },

  lagProfilforslag() {
    const vipAvstand = parseFloat(document.getElementById('vipAvstand').value) || 40;
    const k = parseFloat(document.getElementById('kVerdi').value);
    const maksBrukt = this.P.mal.stigningIKurve.reduce((a, r) => Math.max(a, r[1], r[2]), 0);
    this.P.vip = foreslaProfil(this.terrengProfil.s, this.terrengProfil.z, {
      vipAvstand, maksStigning: maksBrukt, k: isFinite(k) ? k : 1,
      // krappe kurver har strengere stigningskrav
      maksStigningFor: (sA, sB, g) => this.tillattStigning(sA, sB, g),
      // hold profilen innenfor det som lar seg bygge
      maksOverTerreng: this.P.mal.maksFyllingshoyde > 0 ? this.P.mal.maksFyllingshoyde : null,
      maksUnderTerreng: this.P.mal.maksSkjaeringsdybde > 0 ? this.P.mal.maksSkjaeringsdybde : null,
      // høyder brukeren har bestemt blir liggende
      laste: this.lasteHoyder()
    });
    this.profilManuelt = false;
  },

  /* ---------------- hovedløkke ---------------- */

  planlegg(forsinkelse = 260) {
    clearTimeout(this._tidsavbrudd);
    this._tidsavbrudd = setTimeout(() => this.oppdater(), forsinkelse);
  },

  async oppdater() {
    this.byggLinje();
    Kart.tegn();
    if (!this.linje || this.linje.lengde <= 1) {
      this.resultat = null; Rapport.visSammendrag(null); Lengdeprofil.tegn(); Tverrprofil.vis(null);
      this.visLinjetabell();
      return;
    }
    await this.lastTerreng();
    this.hentTerrengProfil();
    if (this.P.vip.length < 2) this.lagProfilforslag();
    else this.justerProfilTilLengde();
    this.beregn();
  },

  beregn() {
    if (!this.linje || !this.terreng || this.P.vip.length < 2) return;
    this.vprofil = new Vertikalprofil(this.P.vip);
    this.fjellmodell = new Fjellmodell({
      standarddybde: this.P.fjell.standarddybde,
      rekkevidde: this.P.fjell.rekkevidde,
      strekninger: this.P.fjell.strekninger,
      punkter: this.P.fjell.punkter.map(p => {
        const u = Geo.tilUtm(p.lat, p.lon, this.sone);
        return { x: u.x, y: u.y, dybde: p.dybde };
      })
    });
    const t0 = performance.now();
    this.resultat = beregnMasser({
      linje: this.linje, profil: this.vprofil, terreng: this.terreng,
      mal: this.P.mal, fjell: this.fjellmodell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      profilAvstand: this.P.profilAvstand, bakkefaktor: this.bakkefaktor()
    });
    this.resultat.mal.profilAvstand = this.P.profilAvstand;
    this.resultat.usikkerhet = this.regnUsikkerhet();
    const tid = performance.now() - t0;

    Rapport.visSammendrag(this.resultat);
    Kart.tegnResultat(this.resultat);
    Lengdeprofil.tegn();
    this.settTverrStasjon(this.tverrStasjon, true);
    this.visLinjetabell();
    this.visHoydetabell();
    this.status(`Beregnet ${this.resultat.profiler.length} profiler på ${tid.toFixed(0)} ms`);
  },

  /**
   * Største stigning veiklassen tillater pa strekket mellom to profilnummer.
   *
   * Den krappeste kurven pa strekket bestemmer, sa radien males flere steder
   * og ikke bare i endene - ellers ville en kurve midt pa strekket blitt
   * oversett. Fortegnet pa stigningen avgjør om det er lassretningen eller
   * returretningen som gjelder.
   */
  tillattStigning(sA, sB, stigning) {
    const mal = this.P.mal;
    if (!this.linje) return 1;
    let minste = Infinity;
    const steg = Math.max(1, Math.abs(sB - sA) / 8);
    for (let s = Math.min(sA, sB); s <= Math.max(sA, sB) + 1e-9; s += steg) {
      const g = maksStigningFraRadius(mal, this.linje.radiusVed(s), stigning, mal.lassretning);
      if (g < minste) minste = g;
    }
    return isFinite(minste) ? minste : 1;
  },

  /**
   * Flytter et knekkpunkt sidelengs, pa tvers av veien der det ligger.
   * Retningen tas fra nabopunktene, sa forskyvningen blir vinkelrett pa
   * linjen og ikke pa nord-akse.
   */
  flyttIpSidelengs(ipUtm, i, avstand) {
    const n = ipUtm.length;
    const foran = ipUtm[Math.max(0, i - 1)];
    const bak = ipUtm[Math.min(n - 1, i + 1)];
    const dx = bak.x - foran.x, dy = bak.y - foran.y;
    const l = Math.hypot(dx, dy) || 1;
    // høyre normal
    return { x: ipUtm[i].x + (dy / l) * avstand, y: ipUtm[i].y - (dx / l) * avstand, r: ipUtm[i].r };
  },

  ipTilUtm() {
    return this.P.ip.map(p => {
      const u = Geo.tilUtm(p.lat, p.lon, this.sone);
      return { x: u.x, y: u.y, r: p.r || 0 };
    });
  },

  /**
   * Hvor mye tallene flytter seg nar forutsetningene endres.
   *
   * Terrenghøydene er malt, men dybden til fjell er anslatt - og det er den
   * som avgjør hvor mye som ma sprenges. Her regnes sprengningsvolumet om
   * igjen med fjellet en halvmeter høyere og en halvmeter lavere, sa man ser
   * hva anslaget faktisk betyr i kubikk. Terrengmodellens egen unøyaktighet
   * regnes pa samme mate ved a heve og senke hele terrenget 0,1 m.
   */
  regnUsikkerhet() {
    if (!this.linje || !this.terreng || !this.vprofil) return null;
    const lagFjell = tillegg => new Fjellmodell({
      standarddybde: Math.max(0, this.P.fjell.standarddybde + tillegg),
      rekkevidde: this.P.fjell.rekkevidde,
      strekninger: (this.P.fjell.strekninger || []).map(s => ({ fra: s.fra, til: s.til, dybde: Math.max(0, s.dybde + tillegg) })),
      punkter: this.P.fjell.punkter.map(p => {
        const u = Geo.tilUtm(p.lat, p.lon, this.sone);
        return { x: u.x, y: u.y, dybde: Math.max(0, p.dybde + tillegg) };
      })
    });
    const kjor = fjell => beregnMasser({
      linje: this.linje, profil: this.vprofil, terreng: this.terreng,
      mal: this.P.mal, fjell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      profilAvstand: Math.max(this.P.profilAvstand, 10),
      integrasjonssteg: 0.25,
      bakkefaktor: this.bakkefaktor()
    });
    try {
      const grunn = kjor(lagFjell(0)).sum;
      const grunnere = kjor(lagFjell(-0.5)).sum;   // fjellet ligger høyere
      const dypere = kjor(lagFjell(+0.5)).sum;
      return {
        fjellNa: grunn.skjaeringFjell,
        fjellGrunnere: grunnere.skjaeringFjell,
        fjellDypere: dypere.skjaeringFjell,
        spenn: Math.abs(grunnere.skjaeringFjell - dypere.skjaeringFjell),
        skjaeringTotalt: grunn.skjaering
      };
    } catch (e) { return null; }
  },

  /** Rask beregning brukt av optimaliseringen. */
  beregnRaskt(vipListe, linje) {
    const vp = new Vertikalprofil(vipListe);
    return beregnMasser({
      linje: linje || this.linje, profil: vp, terreng: this.terreng,
      mal: this.P.mal, fjell: this.fjellmodell, faktorer: this.P.faktorer,
      tverrfallOverstyring: this.P.tverrfall,
      /* Grovere enn den endelige beregningen. Optimaliseringen sammenligner
         alternativer mot hverandre, og da holder det at feilen er den samme
         i alle - den forsvinner i sammenligningen. Den endelige beregningen
         kjøres uansett med full oppløsning etterpa. */
      profilAvstand: Math.max(this.P.profilAvstand, 15),
      integrasjonssteg: 0.5,
      raskt: true,
      bakkefaktor: this.bakkefaktor()
    });
  },

  settTverrStasjon(s, behold) {
    if (!this.resultat) { this.tverrStasjon = s; return; }
    let best = this.resultat.profiler[0], bestD = Infinity;
    for (const p of this.resultat.profiler) {
      const d = Math.abs(p.s - s);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.tverrStasjon = best.s;
    Tverrprofil.vis(best);
    this.visPunkthoyder(best);
    Kart.visStasjon(best.s);
    if (!behold) Lengdeprofil.tegn();
    else Lengdeprofil.tegn();
  },

  linjeEndret() { this.planlegg(120); },
  grunnEndret() { Kart.tegn(); this.visSonderinger(); this.planlegg(60); },
  profilEndret(underDrag) {
    this.profilManuelt = true;
    this.vprofil = new Vertikalprofil(this.P.vip);
    Lengdeprofil.tegn();
    if (!underDrag) this.planlegg(30);
  },

  /* ---------------- retting ---------------- */

  /** Teller brudd pa kravene, sa man ser hva en retting faktisk gjorde. */
  tellBrudd(vp) {
    if (!vp || !this.linje || !this.terrengProfil) return null;
    const mal = this.P.mal;
    let stigning = 0, fylling = 0, skjaering = 0, verstStigning = 0;
    const slutt = this.linje.lengde;
    for (let s = 0; s <= slutt; s += Math.max(1, this.P.profilAvstand)) {
      const g = vp.stigning(s);
      const tillatt = maksStigningFraRadius(mal, this.linje.radiusVed(s), g, mal.lassretning);
      if (Math.abs(g) > tillatt + 1e-4) stigning++;
      verstStigning = Math.max(verstStigning, Math.abs(g));
      const t = this.terrengHoyde(s);
      if (!isFinite(t)) continue;
      if (mal.maksFyllingshoyde > 0 && vp.hoyde(s) - t > mal.maksFyllingshoyde) fylling++;
      if (mal.maksSkjaeringsdybde > 0 && t - vp.hoyde(s) > mal.maksSkjaeringsdybde) skjaering++;
    }
    return { stigning, fylling, skjaering, verstStigning, totalt: stigning + fylling + skjaering };
  },

  /**
   * Retter opp et prosjekt som bryter kravene, og leter samtidig etter den
   * billigste løsningen.
   *
   * "Foreslå profil" lager en helt ny linje fra terrenget. Pa et prosjekt som
   * alt er tegnet ferdig er det for grovt - der vil man beholde linjen, fa
   * bort bruddene, og sa fa ned sprengningen og fyllingen sa langt det gar.
   *
   * Rettingen kommer først. Optimaliseringen leter lokalt, og fra en profil
   * som bryter kravene med 8 % ville den brukt kreftene pa a klatre ut av
   * bruddene i stedet for a finne noe billigere.
   */
  async rettOpp() {
    if (!this.vprofil || this.P.vip.length < 2 || !this.terrengProfil || !this.resultat) {
      this.status('Ingen profil å rette ennå.');
      return;
    }
    if (this.P.vip.every(v => v.laast)) {
      this.status('Alle høyder er låst – lås opp noen for at profilen skal kunne rettes.');
      return;
    }

    const bruddFor = this.tellBrudd(this.vprofil);
    const volumFor = {
      fjell: this.resultat.sum.skjaeringFjell,
      skjaering: this.resultat.sum.skjaering,
      fylling: this.resultat.sum.fylling
    };

    this.framdrift(true, 'Retter profilen…', 0.15);
    await pause();

    const mal = this.P.mal;
    rettProfil(this.P.vip, {
      maksStigningFor: (sA, sB, g) => this.tillattStigning(sA, sB, g),
      maksOverTerreng: mal.maksFyllingshoyde > 0 ? mal.maksFyllingshoyde : null,
      maksUnderTerreng: mal.maksSkjaeringsdybde > 0 ? mal.maksSkjaeringsdybde : null,
      terrengVed: lagTerrengoppslag(this.terrengProfil.s, this.terrengProfil.z)
    });
    this.profilManuelt = true;
    this.beregn();

    // Sa jakten pa minst mulig sprengning og fylling
    await this.optimaliser(true);

    const bruddEtter = this.tellBrudd(this.vprofil);
    const igjen = bruddEtter ? bruddEtter.totalt : 0;
    const spart = volumFor.fjell - this.resultat.sum.skjaeringFjell;
    const spartFylling = volumFor.fylling - this.resultat.sum.fylling;
    const tall = v => Math.round(Math.abs(v)).toLocaleString('nb-NO');

    const deler = [];
    if (bruddFor.totalt > igjen) deler.push(`rettet ${bruddFor.totalt - igjen} brudd`);
    if (Math.abs(spart) > 5) deler.push(`sprengning ${spart > 0 ? '−' : '+'}${tall(spart)} m³`);
    if (Math.abs(spartFylling) > 5) deler.push(`fylling ${spartFylling > 0 ? '−' : '+'}${tall(spartFylling)} m³`);
    if (igjen > 0) deler.push(`${igjen} brudd står igjen – terrenget tillater ikke både stigningskrav og fyllingsgrense, se merknadene`);
    this.status(deler.length ? 'Rettet opp: ' + deler.join(' · ') : 'Fant ingenting å rette.');
  },

  /* ---------------- optimalisering ---------------- */

  async balanser() {
    if (!this.terreng || !this.linje) return;
    if (this.P.vip.every(v => v.laast)) {
      this.status('Alle høyder er låst – lås opp noen for å kunne balansere massene');
      return;
    }
    this.framdrift(true, 'Finner høyden som gir massebalanse…', 0.1);
    await pause();
    const grunn = this.P.vip.map(v => ({ s: v.s, z: v.z, k: v.k, laast: v.laast }));
    // Laste høyder blir liggende; bare de andre løftes eller senkes
    const flytt = (liste, d) => liste.map(v => ({ s: v.s, z: v.laast ? v.z : v.z + d, k: v.k }));
    const verdi = d => this.beregnRaskt(flytt(grunn, d)).balanse.balanse;
    let lo = -8, hi = 8;
    let vLo = verdi(lo), vHi = verdi(hi);
    let d;
    if (vLo * vHi > 0) {
      // ingen fortegnsskifte - velg endepunktet nærmest balanse
      d = Math.abs(vLo) < Math.abs(vHi) ? lo : hi;
    } else {
      for (let i = 0; i < 26; i++) {
        const midt = (lo + hi) / 2;
        const vM = verdi(midt);
        if (vLo * vM <= 0) { hi = midt; vHi = vM; } else { lo = midt; vLo = vM; }
        this.framdrift(true, 'Finner høyden som gir massebalanse…', 0.1 + 0.9 * i / 26);
        if (i % 6 === 0) await pause();
      }
      d = (lo + hi) / 2;
    }
    this.P.vip.forEach(v => { if (!v.laast) v.z += d; });
    this.profilManuelt = true;
    this.framdrift(false);
    this.beregn();
  },

  async optimaliser(stille) {
    if (!this.terreng || !this.linje) return;
    const V = this.P.vip;
    if (V.length < 2) return;
    if (V.every(v => v.laast)) {
      if (!stille) this.status('Alle høyder er låst – lås opp noen for å kunne optimalisere');
      return;
    }
    const maksTillatt = this.P.mal.stigningIKurve.reduce((a, r) => Math.max(a, r[1], r[2]), 0);

    const mal = this.P.mal;
    const kostnad = (liste, linje) => {
      const r = this.beregnRaskt(liste, linje);
      const s = r.sum, b = r.balanse;
      const vpKost = new Vertikalprofil(liste);

      /* Kostnadsbilde, i den rekkefølgen det gjør vondt:
           sprengning        dyrest, og den man helst vil unnga
           graving i løsmasse
           transport inn eller ut av anlegget nar massene ikke gar opp
           inngrep i terrenget - renskevolumet er tykkelsen ganger
             fotavtrykket, sa det er et direkte mal pa hvor bredt man river
             opp lia. Uten dette leddet ville en løsning som sparer noen
             kubikk, men brer seg dobbelt sa langt utover, kommet best ut.
           fylling           billigst, sa lenge massene finnes */
      let k = s.skjaeringFjell * 3
        + s.skjaeringLosmasse * 1
        + Math.abs(b.balanse) * 1.6
        + s.rensk * 2
        + s.fylling * 0.5;

      /* Følg terrenget. Dette er arealet mellom veglinjen og bakken i
         lengdeprofilen - jo mindre, jo tettere ligger veien pa terrenget.
         Volumleddene over drar i samme retning, men de kan gi like svar for
         en veg som ligger rolig oppa bakken og en som svinger over og under
         den. Dette leddet skiller dem, og det er den rolige man vil ha. */
      if (this.terrengProfil) {
        const tp = this.terrengProfil;
        // hvert femte punkt holder til a male et areal
        const hopp = Math.max(1, Math.round(5 / Math.max(0.5, tp.s[1] - tp.s[0])));
        let avvik = 0;
        for (let i = hopp; i < tp.s.length; i += hopp) {
          if (!isFinite(tp.z[i]) || !isFinite(tp.z[i - hopp])) continue;
          const dA = Math.abs(vpKost.hoyde(tp.s[i - hopp]) - tp.z[i - hopp]);
          const dB = Math.abs(vpKost.hoyde(tp.s[i]) - tp.z[i]);
          avvik += (dA + dB) / 2 * (tp.s[i] - tp.s[i - hopp]);
        }
        k += avvik * 30;
      }

      /* Kravene fra veiklassen og grensene for hva som lar seg bygge legges
         inn som svaert dyre brudd. Uten dette ville optimaliseringen valgt
         den løsningen som er billigst pa papiret - gjerne en 20 % bakke i en
         30-meterskurve, eller en fylling som stikker 40 m ut. */
      for (const m of r.merknader) if (m.type === 'kurvatur') k += 200000;
      for (const pr of r.profiler) {
        const g = vpKost.stigning(pr.s);
        const tillatt = maksStigningFraRadius(mal, pr.radius, g, mal.lassretning);
        if (Math.abs(g) > tillatt) k += (Math.abs(g) - tillatt) * 400000;

        if (mal.maksFyllingshoyde > 0 && pr.maksFylling > mal.maksFyllingshoyde) {
          k += (pr.maksFylling - mal.maksFyllingshoyde) * 3000;
        }
        if (mal.maksSkjaeringsdybde > 0 && pr.maksSkjaering > mal.maksSkjaeringsdybde) {
          k += (pr.maksSkjaering - mal.maksSkjaeringsdybde) * 3000;
        }
        if (mal.maksUtslag > 0) {
          const utslag = Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;
          if (utslag > mal.maksUtslag) k += (utslag - mal.maksUtslag) * 2000;
        }
        if (pr.advarsel) k += 50000;             // skraningen fant ikke terrenget
      }
      return k;
    };
    void maksTillatt;

    this.framdrift(true, 'Optimaliserer lengdeprofilen…', 0);
    await pause();
    let best = V.map(v => ({ s: v.s, z: v.z, k: v.k, laast: v.laast }));
    let bestK = kostnad(best);
    let steg = 1.5;
    const runder = 4;
    for (let runde = 0; runde < runder; runde++) {
      for (let i = 0; i < best.length; i++) {
        if (best[i].laast) continue;             // denne høyden er bestemt
        for (const d of [steg, -steg]) {
          const forsok = best.map((v, j) => ({ s: v.s, z: v.z + (j === i ? d : 0), k: v.k, laast: v.laast }));
          const kk = kostnad(forsok);
          if (kk < bestK - 1e-6) { best = forsok; bestK = kk; }
        }
        this.framdrift(true, 'Optimaliserer lengdeprofilen…', (runde + i / best.length) / runder);
        if (i % 4 === 0) await pause();
      }
      steg /= 2;
    }
    /* Sidelengs flytting av linjen.
       Pa en sidebratt li ligger det ofte mye a spare pa a flytte veien noen
       meter inn i skraningen i stedet for a bygge en høy fylling ut. Hvert
       knekkpunkt prøves flyttet pa tvers, og linjen bygges pa nytt sa
       kurvene fortsatt blir riktige. */
    const maksSide = this.P.mal.sideforskyvning || 0;
    let flyttet = 0;
    if (maksSide > 0 && this.P.ip.length >= 2) {
      const start = this.ipTilUtm();
      let beste = start.map(p => Object.assign({}, p));
      let besteK = kostnad(best, new Linjeforing(beste));
      let sideSteg = Math.min(maksSide, 1.5);

      for (let runde = 0; runde < 3; runde++) {
        for (let i = 0; i < beste.length; i++) {
          for (const d of [sideSteg, -sideSteg]) {
            const forsok = beste.map(p => Object.assign({}, p));
            const flytta = this.flyttIpSidelengs(beste, i, d);
            // hold oss innenfor det brukeren har tillatt, malt fra der punktet la
            const samlet = Math.hypot(flytta.x - start[i].x, flytta.y - start[i].y);
            if (samlet > maksSide + 1e-6) continue;
            forsok[i] = flytta;
            const linje2 = new Linjeforing(forsok);
            if (linje2.lengde <= 1) continue;
            const kk = kostnad(best, linje2);
            if (kk < besteK - 1e-6) { beste = forsok; besteK = kk; }
          }
          this.framdrift(true, 'Prøver å flytte linjen sidelengs…', (runde + i / beste.length) / 3);
          if (i % 3 === 0) await pause();
        }
        sideSteg /= 2;
      }
      for (let i = 0; i < beste.length; i++) {
        const d = Math.hypot(beste[i].x - start[i].x, beste[i].y - start[i].y);
        if (d > 0.01) {
          flyttet++;
          const g = Geo.fraUtm(beste[i].x, beste[i].y, this.sone);
          this.P.ip[i].lat = g.lat; this.P.ip[i].lon = g.lon;
        }
      }
      this._terrengnokkel = '';       // korridoren ma lastes for den nye linjen
      this.byggLinje();
    }

    this.P.vip = best;
    this.profilManuelt = true;
    this.framdrift(false);
    if (flyttet) {
      await this.lastTerreng();
      this.hentTerrengProfil();
      this.justerProfilTilLengde();
      Kart.tegn();
    }
    this.beregn();
    if (flyttet) this.status(`Optimalisert – ${flyttet} knekkpunkt flyttet sidelengs`);
  },

  /* ---------------- kontroll mot Kartverket ---------------- */

  async kontrollerHoyder() {
    const boks = document.getElementById('kontrollsvar');
    if (!this.linje || !this.terreng) { boks.textContent = 'Ingen linje å kontrollere.'; return; }
    boks.textContent = 'Spør Kartverket …';
    const punkter = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const s = this.linje.lengde * (i + 0.5) / n;
      const t = (i % 7 - 3) * 4;
      const p = this.linje.punktMedAvvik(s, t);
      punkter.push([+p.x.toFixed(3), +p.y.toFixed(3)]);
    }
    try {
      const bolker = [];
      for (let i = 0; i < punkter.length; i += 40) bolker.push(punkter.slice(i, i + 40));
      const svar = [];
      for (const b of bolker) {
        const r = await fetch(`api/punkt?sr=${Geo.epsg(this.sone)}&punkter=${encodeURIComponent(JSON.stringify(b))}`);
        const d = await r.json();
        svar.push(...(d.punkter || []));
      }
      let maks = 0, sum = 0, m = 0, kilder = new Set();
      svar.forEach((p, i) => {
        if (p.z == null) return;
        const z = this.terreng.z(punkter[i][0], punkter[i][1]);
        if (!isFinite(z)) return;
        const d = Math.abs(z - p.z);
        maks = Math.max(maks, d); sum += d; m++;
        if (p.datakilde) kilder.add(p.datakilde);
      });
      boks.innerHTML = m
        ? `<div class="rad"><span>Kontrollpunkt</span><span>${m} stk</span></div>
           <div class="rad"><span>Gjennomsnittlig avvik</span><span>${(sum / m).toFixed(3)} m</span></div>
           <div class="rad"><span>Største avvik</span><span>${maks.toFixed(3)} m</span></div>
           <div class="rad"><span>Datakilde</span><span>${[...kilder].join(', ') || '–'}</span></div>
           <div style="margin-top:6px">Avviket kommer av at API-et oppgir høyden med to desimaler. Modellen i programmet er den samme.</div>`
        : 'Fikk ingen høyder tilbake.';
    } catch (e) {
      boks.textContent = 'Kontrollen feilet: ' + e.message;
    }
  },

  /* ---------------- skjema ---------------- */

  malTilSkjema() {
    const m = this.P.mal, f = this.P.faktorer, g = this.P.fjell;
    const sett = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    sett('m_vegbredde', m.vegbredde);
    sett('m_tverrfall', (m.tverrfall * 100).toFixed(1));
    sett('m_tverrfallType', m.tverrfallType);
    sett('m_slitelagTykkelse', m.slitelagTykkelse);
    sett('m_slitelagBredde', m.slitelagBredde);
    sett('m_baerelagTykkelse', m.baerelagTykkelse);
    sett('m_grofteDybdePlanum', m.grofteDybdePlanum);
    sett('m_grofteBunn', m.grofteBunn);
    sett('m_grofteInnerHelning', m.grofteInnerHelning);
    sett('m_skjaeringLosmasse', m.skjaeringLosmasse);
    sett('m_skjaeringFjell', m.skjaeringFjell);
    sett('m_fylling', m.fylling);
    sett('m_renskDybde', m.renskDybde);
    sett('m_renskUtenfor', m.renskUtenfor);
    sett('m_utvidelseOvergang', m.utvidelseOvergang);
    sett('m_veiklasse', m.veiklasse || 'egen');
    sett('m_lassretning', String(m.lassretning || -1));
    this.visVeiklasse();
    this.visKravtabell();
    sett('m_maksFyllingshoyde', m.maksFyllingshoyde);
    sett('m_maksSkjaeringsdybde', m.maksSkjaeringsdybde);
    sett('m_maksUtslag', m.maksUtslag);
    sett('m_beregningsbredde', m.beregningsbredde);
    sett('m_sideforskyvning', m.sideforskyvning || 0);
    sett('m_profilAvstand', this.P.profilAvstand);
    sett('m_maksSokebredde', m.maksSokebredde);
    document.getElementById('m_bakkekorreksjon').checked = !!this.P.bakkekorreksjon;
    sett('f_sprengningsfaktor', f.sprengningsfaktor);
    sett('f_fjellIFylling', f.fjellIFylling);
    sett('f_losmasseIFylling', f.losmasseIFylling);
    sett('f_brukbarLosmasse', f.brukbarLosmasse);
    sett('g_standarddybde', g.standarddybde);
    sett('g_rekkevidde', g.rekkevidde);
    this.visStrekninger();
    this.visSonderinger();
  },

  skjemaTilMal() {
    const tall = id => parseFloat(document.getElementById(id).value);
    const m = this.P.mal, f = this.P.faktorer, g = this.P.fjell;
    m.vegbredde = tall('m_vegbredde');
    m.tverrfall = tall('m_tverrfall') / 100;
    m.tverrfallType = document.getElementById('m_tverrfallType').value;
    m.slitelagTykkelse = tall('m_slitelagTykkelse');
    m.slitelagBredde = tall('m_slitelagBredde');
    m.baerelagTykkelse = tall('m_baerelagTykkelse');
    m.grofteDybdePlanum = tall('m_grofteDybdePlanum');
    m.grofteBunn = tall('m_grofteBunn');
    m.grofteInnerHelning = tall('m_grofteInnerHelning');
    m.skjaeringLosmasse = tall('m_skjaeringLosmasse');
    m.skjaeringFjell = tall('m_skjaeringFjell');
    m.fylling = tall('m_fylling');
    m.renskDybde = tall('m_renskDybde');
    m.renskUtenfor = tall('m_renskUtenfor');
    m.utvidelseOvergang = tall('m_utvidelseOvergang');
    m.maksSokebredde = tall('m_maksSokebredde');
    m.maksFyllingshoyde = tall('m_maksFyllingshoyde');
    m.maksSkjaeringsdybde = tall('m_maksSkjaeringsdybde');
    m.maksUtslag = tall('m_maksUtslag');
    m.beregningsbredde = tall('m_beregningsbredde');
    m.sideforskyvning = tall('m_sideforskyvning');
    m.lassretning = parseInt(document.getElementById('m_lassretning').value, 10) || -1;
    this.P.profilAvstand = Math.max(1, tall('m_profilAvstand'));
    this.P.bakkekorreksjon = document.getElementById('m_bakkekorreksjon').checked;
    f.sprengningsfaktor = tall('f_sprengningsfaktor');
    f.fjellIFylling = tall('f_fjellIFylling');
    f.losmasseIFylling = tall('f_losmasseIFylling');
    f.brukbarLosmasse = tall('f_brukbarLosmasse');
    g.standarddybde = tall('g_standarddybde');
    g.rekkevidde = tall('g_rekkevidde');
  },

  visStrekninger() {
    const tb = document.querySelector('#strekningTabell tbody');
    tb.innerHTML = '';
    this.P.fjell.strekninger.forEach((st, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input type="number" value="${st.fra}"></td>
                      <td><input type="number" value="${st.til}"></td>
                      <td><input type="number" step="0.1" value="${st.dybde}"></td>
                      <td><button title="Slett">×</button></td>`;
      const [a, b, c] = tr.querySelectorAll('input');
      a.onchange = () => { st.fra = parseFloat(a.value) || 0; this.grunnEndret(); };
      b.onchange = () => { st.til = parseFloat(b.value) || 0; this.grunnEndret(); };
      c.onchange = () => { st.dybde = parseFloat(c.value) || 0; this.grunnEndret(); };
      tr.querySelector('button').onclick = () => { this.P.fjell.strekninger.splice(i, 1); this.visStrekninger(); this.grunnEndret(); };
      tb.appendChild(tr);
    });
  },

  visSonderinger() {
    const boks = document.getElementById('sonderingListe');
    const p = this.P.fjell.punkter;
    if (!p.length) { boks.innerHTML = '<span class="tomtekst">Ingen registrert. Velg «Fjellpunkt» og klikk i kartet.</span>'; return; }
    boks.innerHTML = p.map((o, i) => {
      let prof = '';
      if (this.linje && this.linje.lengde > 0) {
        const u = Geo.tilUtm(o.lat, o.lon, this.sone);
        const pr = this.linje.projiser(u.x, u.y);
        prof = `prof ${pr.s.toFixed(0)}, avvik ${pr.avvik.toFixed(1)} m`;
      }
      return `<div class="rad"><span>${o.dybde.toFixed(1)} m &nbsp;<small>${prof}</small></span><button data-i="${i}">×</button></div>`;
    }).join('');
    boks.querySelectorAll('button').forEach(b => {
      b.onclick = () => { this.P.fjell.punkter.splice(+b.dataset.i, 1); this.grunnEndret(); };
    });
  },

  /* ---------------- veiklasse ---------------- */

  fyllVeiklassevalg() {
    const v = document.getElementById('m_veiklasse');
    if (!v || v.options.length) return;
    for (const [n, k] of Object.entries(Veiklasser)) {
      const o = document.createElement('option');
      o.value = n; o.textContent = k.navn;
      v.appendChild(o);
    }
  },

  visVeiklasse() {
    const boks = document.getElementById('veiklasseinfo');
    if (!boks) return;
    const k = Veiklasser[this.P.mal.veiklasse] || Veiklasser.egen;
    boks.innerHTML = `<p>${k.beskrivelse}</p>`
      + (k.kilde ? `<p class="kilde">${k.kilde}</p>` : '')
      + (k.usikker ? `<p class="merke-varsel">Kontroller kravene mot gjeldende vegnormal.</p>` : '')
      + (k.fri ? '' : `<div class="klassetall">
           <span>Min. bredde <b>${k.vegbredde} m</b></span>
           <span>Min. radius <b>${k.minRadius} m</b></span>
           <span>Maks stigning <b>${Math.round(k.maksStigningLass * 100)} / ${Math.round(k.maksStigningRetur * 100)} %</b></span>
         </div>`);
  },

  visKravtabell() {
    const tb = document.querySelector('#kravTabell tbody');
    if (!tb) return;
    const m = this.P.mal;
    const bredde = m.breddeIKurve || [];
    const stign = m.stigningIKurve || [];
    tb.innerHTML = stign.map(rad => {
      const til = rad[0];
      const b = bredde.find(r => til >= r[0] && til <= r[1]);
      const merke = til > 1e8 ? '> 60 m' : `≤ ${til} m`;
      return `<tr><td>${merke}</td>
        <td>${b ? (b[2] === b[3] ? b[2].toFixed(1) : b[2].toFixed(1) + '–' + b[3].toFixed(1)) + ' m' : '–'}</td>
        <td>${(rad[1] * 100).toFixed(0)} %</td>
        <td>${(rad[2] * 100).toFixed(0)} %</td></tr>`;
    }).join('');
  },

  velgVeiklasse(navn) {
    this.P.mal = malFraVeiklasse(navn, this.P.mal);
    this.P.mal.veiklasse = navn;
    if (Veiklasser[navn] && !Veiklasser[navn].fri) {
      // Vegbredden er minstekravet i klassen; byggherren kan ville ha mer
      const k = Veiklasser[navn];
      if (this.P.mal.vegbredde < k.vegbredde) this.P.mal.vegbredde = k.vegbredde;
    }
    this.malTilSkjema();
    this.planlegg(30);
  },

  /* ---------------- punkthøyder i tverrprofilet ---------------- */

  /** Fallet som gjelder i et profilnummer, enten fra malen eller overstyrt. */
  fallVed(s) { return tverrfallVed(this.P.mal, this.P.tverrfall, s); },

  visPunkthoyder(pr) {
    const v = document.getElementById('tp_venstre');
    const c = document.getElementById('tp_senter');
    const h = document.getElementById('tp_hoyre');
    if (!v || !pr) return;
    const fall = this.fallVed(pr.s);
    v.value = (pr.vegnivaa - fall.venstre * pr.halvbredde).toFixed(3);
    c.value = pr.vegnivaa.toFixed(3);
    h.value = (pr.vegnivaa - fall.hoyre * pr.halvbredde).toFixed(3);
    const egen = (this.P.tverrfall || []).some(t => Math.abs(t.s - pr.s) < 1e-6);
    v.classList.toggle('overstyrt', egen);
    h.classList.toggle('overstyrt', egen);
  },

  /**
   * Skriver inn en høyde i et punkt i tverrsnittet.
   *
   * Senterlinjen styrer lengdeprofilen, mens vegkantene styrer tverrfallet
   * pa den sida. Slik kan et oppmalt tverrsnitt legges rett inn: mal de tre
   * punktene i felt, skriv dem inn, og malen retter seg etter dem.
   */
  settPunkthoyde(hvor, verdi) {
    const pr = this.resultat && this.resultat.profiler.find(p => Math.abs(p.s - this.tverrStasjon) < 1e-6);
    if (!pr || !isFinite(verdi)) return;

    if (hvor === 'senter') {
      const finnes = this.P.vip.find(v => Math.abs(v.s - pr.s) < 1e-6);
      if (finnes) { finnes.z = verdi; finnes.laast = true; }
      else this.P.vip.push({ s: pr.s, z: verdi, k: 0, laast: true });
      this.P.vip.sort((a, b) => a.s - b.s);
      this.profilEndret(false);
      this.visHoydetabell();
      return;
    }

    const fall = this.fallVed(pr.s);
    const nytt = { s: pr.s, venstre: fall.venstre, hoyre: fall.hoyre };
    const helning = (pr.vegnivaa - verdi) / pr.halvbredde;
    if (hvor === 'venstre') nytt.venstre = helning; else nytt.hoyre = helning;

    const i = this.P.tverrfall.findIndex(t => Math.abs(t.s - pr.s) < 1e-6);
    if (i >= 0) this.P.tverrfall[i] = nytt; else this.P.tverrfall.push(nytt);
    this.P.tverrfall.sort((a, b) => a.s - b.s);
    this.beregn();
  },

  nullstillPunkthoyder() {
    const s = this.tverrStasjon;
    const i = this.P.tverrfall.findIndex(t => Math.abs(t.s - s) < 1e-6);
    if (i >= 0) this.P.tverrfall.splice(i, 1);
    const j = this.P.vip.findIndex(v => Math.abs(v.s - s) < 1e-6);
    if (j >= 0 && this.P.vip.length > 2) this.P.vip.splice(j, 1);
    this.profilEndret(false);
    this.beregn();
  },

  /* ---------------- høydetabell ---------------- */

  /** Høyder brukeren har last - de skal ligge i ro. */
  lasteHoyder() {
    return this.P.vip.filter(v => v.laast).map(v => ({ s: v.s, z: v.z, k: v.k }));
  },

  terrengHoyde(s) {
    if (!this.terrengProfil) return NaN;
    const { s: ss, z: zz } = this.terrengProfil;
    if (!ss.length) return NaN;
    if (s <= ss[0]) return zz[0];
    if (s >= ss[ss.length - 1]) return zz[zz.length - 1];
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] < s) lo = m; else hi = m; }
    const f = (s - ss[lo]) / (ss[hi] - ss[lo] || 1);
    return zz[lo] + f * (zz[hi] - zz[lo]);
  },

  visHoydetabell() {
    const tb = document.querySelector('#hoydeTabell tbody');
    if (!tb) return;
    tb.innerHTML = '';
    const V = this.P.vip;
    V.forEach((v, i) => {
      const zt = this.terrengHoyde(v.s);
      const diff = zt - v.z;                     // positiv = skjæring
      const tr = document.createElement('tr');
      if (v.laast) tr.className = 'laast';
      tr.innerHTML =
        `<td><input type="number" step="1" value="${+v.s.toFixed(2)}"></td>
         <td><input type="number" step="0.01" value="${+v.z.toFixed(3)}"></td>
         <td>${isFinite(zt) ? zt.toFixed(2) : '–'}</td>
         <td class="${diff >= 0 ? 'diff-skjaering' : 'diff-fylling'}">${isFinite(diff) ? (diff >= 0 ? '+' : '') + diff.toFixed(2) : '–'}</td>
         <td><input type="checkbox" ${v.laast ? 'checked' : ''}></td>
         <td><button title="Slett">×</button></td>`;
      const [fS, fZ] = tr.querySelectorAll('input[type=number]');
      const laas = tr.querySelector('input[type=checkbox]');
      fS.onchange = () => {
        const ny = parseFloat(fS.value);
        if (isFinite(ny)) { v.s = Math.max(0, Math.min(this.linje ? this.linje.lengde : ny, ny)); }
        this.P.vip.sort((a, b) => a.s - b.s);
        this.profilEndret(false); this.visHoydetabell();
      };
      fZ.onchange = () => {
        const ny = parseFloat(fZ.value);
        if (isFinite(ny)) { v.z = ny; v.laast = true; v.k = 0; }
        this.profilEndret(false); this.visHoydetabell();
      };
      laas.onchange = () => {
        v.laast = laas.checked;
        // Last punkt skal treffes eksakt, og da kan det ikke ha vertikalkurve
        if (v.laast) v.k = 0;
        this.profilEndret(false);
        this.visHoydetabell();
      };
      tr.querySelector('button').onclick = () => {
        this.P.vip.splice(i, 1); this.profilEndret(false); this.visHoydetabell();
      };
      tb.appendChild(tr);
    });

    const laste = V.filter(v => v.laast).length;
    const info = document.getElementById('hoydeinfo');
    if (info) {
      info.innerHTML = this.vprofil && V.length > 1
        ? `<div class="rad"><span>Punkt i profilen</span><span>${V.length}, ${laste} låst</span></div>
           <div class="rad"><span>Største stigning</span><span>${(this.vprofil.maksStigning(1) * 100).toFixed(1)} %</span></div>
           <div class="rad"><span>Vertikalkurver</span><span>${this.vprofil.kurver.length}</span></div>`
        : '';
    }
    const topp = document.getElementById('hoydeToppinfo');
    if (topp) {
      topp.textContent = this.linje && this.linje.lengde > 0
        ? `Veglengde ${(this.linje.lengde * this.bakkefaktor()).toFixed(1)} m · profil 0 – ${this.linje.lengde.toFixed(0)}`
        : 'Tegn en senterlinje først';
    }
  },

  /**
   * Legger inn en høyde pa et valgt profilnummer.
   * Uten oppgitt høyde brukes den prosjekterte linjen der den ligger na,
   * sa man kan sette ned punkter langs veien og justere dem etterpa.
   */
  leggTilHoyde(s, z) {
    if (!this.linje || this.linje.lengde <= 0) return;
    const ss = Math.max(0, Math.min(this.linje.lengde, s));
    const hoyde = isFinite(z) ? z
      : (this.vprofil && this.P.vip.length > 1 ? this.vprofil.hoyde(ss) : this.terrengHoyde(ss));
    if (!isFinite(hoyde)) return;

    /* En last høyde er et punkt veien skal gjennom, ikke et knekkpunkt for
       tangentene. En vertikalkurve ville dratt linjen forbi punktet med
       A·L/8, sa den far K = 0 og treffes eksakt. */
    const finnes = this.P.vip.find(v => Math.abs(v.s - ss) < 0.05);
    if (finnes) { finnes.z = +hoyde.toFixed(3); finnes.laast = true; finnes.k = 0; }
    else this.P.vip.push({ s: +ss.toFixed(2), z: +hoyde.toFixed(3), k: 0, laast: true });
    this.P.vip.sort((a, b) => a.s - b.s);
    this.profilEndret(false);
    this.visHoydetabell();
    this.settTverrStasjon(ss);
    this.status(`Høyde ${hoyde.toFixed(2)} lagt inn i profil ${ss.toFixed(0)}`);
  },

  /** Fyller tabellen med jevn avstand, med terrenghøyde der det ikke finnes noe fra før. */
  fyllHoyder(steg) {
    if (!this.linje || this.linje.lengde <= 0) return;
    const k = document.getElementById('h_retteLinjer').checked ? 0 : (parseFloat(document.getElementById('kVerdi').value) || 1);
    const gammel = this.vprofil;
    const ny = [];
    for (let s = 0; s <= this.linje.lengde + 1e-6; s += steg) {
      const ss = Math.min(s, this.linje.lengde);
      const fanns = this.P.vip.find(v => Math.abs(v.s - ss) < steg / 2 && v.laast);
      if (fanns) { ny.push(fanns); continue; }
      const z = gammel && this.P.vip.length > 1 ? gammel.hoyde(ss) : this.terrengHoyde(ss);
      ny.push({ s: +ss.toFixed(2), z: isFinite(z) ? +z.toFixed(3) : 0, k, laast: false });
      if (ss >= this.linje.lengde) break;
    }
    const slutt = +this.linje.lengde.toFixed(2);
    if (!ny.some(v => Math.abs(v.s - slutt) < 1e-6)) {
      const z = gammel ? gammel.hoyde(slutt) : this.terrengHoyde(slutt);
      ny.push({ s: slutt, z: isFinite(z) ? +z.toFixed(3) : 0, k, laast: false });
    }
    this.P.vip = ny.sort((a, b) => a.s - b.s);
    this.profilEndret(false);
    this.visHoydetabell();
  },

  limInnHoyder() {
    const felt = document.getElementById('h_lim');
    const rader = lesHoydetabell(felt.value);
    if (!rader.length) { alert('Fant ingen profilnummer og høyder i teksten.'); return; }
    const L = this.linje ? this.linje.lengde : Infinity;
    const utenfor = rader.filter(r => r.s > L + 0.5).length;
    const beholdt = rader.filter(r => r.s <= L + 0.5);
    // Innlimte høyder er punkt veien skal gjennom, sa de far ingen vertikalkurve
    this.P.vip = beholdt.map(r => ({ s: +Math.min(r.s, L).toFixed(2), z: r.z, k: 0, laast: true }));
    this.profilManuelt = true;
    this.beregn();
    this.visHoydetabell();
    felt.value = '';
    this.status(`La inn ${beholdt.length} låste høyder`
      + (utenfor ? ` (${utenfor} lå utenfor veglengden på ${L.toFixed(0)} m og ble hoppet over)` : ''));
  },

  visLinjetabell() {
    const tb = document.querySelector('#ipTabell tbody');
    tb.innerHTML = '';
    this.P.ip.forEach((pt, i) => {
      const u = Geo.tilUtm(pt.lat, pt.lon, this.sone);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${u.y.toFixed(1)}</td><td>${u.x.toFixed(1)}</td>
                      <td><input type="number" step="5" value="${pt.r || 0}"></td>
                      <td><button title="Slett">×</button></td>`;
      tr.querySelector('input').onchange = e => { pt.r = parseFloat(e.target.value) || 0; this.linjeEndret(); };
      tr.querySelector('button').onclick = () => { this.P.ip.splice(i, 1); this.linjeEndret(); };
      tb.appendChild(tr);
    });
    const info = document.getElementById('linjeinfo');
    if (this.linje && this.linje.lengde > 0) {
      const k = this.linje.kurver.map(c =>
        `<div class="rad"><span>BC ${c.sBC.toFixed(0)} – EC ${c.sEC.toFixed(0)}</span><span>R = ${c.r.toFixed(1)} m${c.tegn > 0 ? ' venstre' : ' høyre'}</span></div>`
      ).join('');
      info.innerHTML = `<div class="rad"><span>Lengde i kartplanet</span><span>${this.linje.lengde.toFixed(2)} m</span></div>`
        + `<div class="rad"><span>Lengde på bakken</span><span>${(this.linje.lengde * this.bakkefaktor()).toFixed(2)} m</span></div>`
        + `<div class="rad"><span>Sone</span><span>EUREF89 UTM${this.sone}</span></div>`
        + (k || '<div class="rad"><span>Ingen kurver lagt inn</span><span></span></div>')
        + this.linje.advarsler.map(a => `<div class="rad merke-varsel"><span>${a.tekst}</span><span></span></div>`).join('');
    } else info.innerHTML = '';
  },

  /* ---------------- lagring ---------------- */

  async lagre() {
    this.P.navn = document.getElementById('prosjektnavn').value.trim() || 'Uten navn';
    try {
      await Lager.lagre(this.P.navn, this.P);
      this.status('Lagret «' + this.P.navn + '»');
    } catch (e) {
      this.status('Kunne ikke lagre: ' + e.message);
    }
  },

  async apneDialog() {
    const liste = await Lager.liste();
    const innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = 'Prosjekter';
    innhold.innerHTML = `
      <div class="dialogverktoy">
        <button class="knapp" id="dlgImport">Importer fil…</button>
        <button class="knapp" id="dlgEksportAlle">Eksporter alle</button>
        <input type="file" id="dlgFil" accept=".json" hidden multiple>
      </div>
      ${liste.length
        ? liste.map(p => `<div class="rad">
            <span data-navn="${escapeAttr(p.navn)}">${p.navn}<br><small style="color:#97a5b6">${new Date(p.endret).toLocaleString('nb-NO')}</small></span>
            <button class="knapp" data-eksport="${escapeAttr(p.navn)}">Eksporter</button>
            <button class="knapp" data-slett="${escapeAttr(p.navn)}">Slett</button>
          </div>`).join('')
        : '<p class="tomtekst">Ingen lagrede prosjekter ennå.</p>'}
      <p class="notis" style="margin-top:12px">Prosjektene ligger i nettleseren på denne maskinen.
      Eksporter en fil for å ta med prosjektet til en annen maskin eller ta sikkerhetskopi.</p>`;

    innhold.querySelectorAll('[data-navn]').forEach(el => { el.onclick = () => this.apne(el.dataset.navn); });
    innhold.querySelectorAll('[data-eksport]').forEach(el => { el.onclick = () => Lager.eksporter(el.dataset.eksport); });
    innhold.querySelectorAll('[data-slett]').forEach(el => {
      el.onclick = async () => {
        const navn = el.dataset.slett;
        document.getElementById('dialog').classList.add('skjult');
        if (!await this.bekreft(`Slette prosjektet «${navn}»? Dette kan ikke angres.`, 'Slett')) {
          return this.apneDialog();
        }
        await Lager.slett(navn);
        this.apneDialog();
      };
    });
    const fil = innhold.querySelector('#dlgFil');
    innhold.querySelector('#dlgImport').onclick = () => fil.click();
    innhold.querySelector('#dlgEksportAlle').onclick = async () => {
      const n = await Lager.eksporterAlle();
      this.status(`Eksporterte ${n} prosjekt`);
    };
    fil.onchange = async () => {
      const lagt = [];
      for (const f of fil.files) {
        try { lagt.push(...await Lager.importer(f)); }
        catch (e) { alert('Klarte ikke lese ' + f.name + ': ' + e.message); }
      }
      if (lagt.length) { this.status(`Importerte ${lagt.join(', ')}`); await this.apneDialog(); }
    };
    document.getElementById('dialog').classList.remove('skjult');
  },

  async apne(navn) {
    const d = await Lager.hent(navn);
    if (!d) return;
    this.P = this.moderniserProsjekt(Object.assign(this.nyttProsjekt(), d));
    this.P.mal = Object.assign({}, StandardMal, this.P.mal || {});
    this.P.faktorer = Object.assign({}, StandardFaktorer, d.faktorer || {});
    this.P.fjell = Object.assign({ standarddybde: 0.5, rekkevidde: 60, strekninger: [], punkter: [] }, d.fjell || {});
    document.getElementById('prosjektnavn').value = this.P.navn;
    document.getElementById('dialog').classList.add('skjult');
    this._terrengnokkel = '';
    this.malTilSkjema();
    await this.oppdater();
    Kart.zoomTilLinje();
  },

  tegnAlt() { Kart.tegn(); Lengdeprofil.tegn(); Tverrprofil.tegn(); },

  /* ---------------- knapper og felt ---------------- */

  koblingerUI() {
    const id = x => document.getElementById(x);

    id('prosjektnavn').onchange = e => { this.P.navn = e.target.value; };
    id('knappLagre').onclick = () => this.lagre();
    id('knappApne').onclick = () => this.apneDialog();
    id('dialogLukk').onclick = () => id('dialog').classList.add('skjult');
    id('knappNy').onclick = async () => {
      if (this.P.ip.length) {
        const ja = await this.bekreft(
          'Starte på et nytt prosjekt? Det du har tegnet nå forsvinner hvis det ikke er lagret.',
          'Nytt prosjekt');
        if (!ja) return;
      }
      const mal = Object.assign({}, this.P.mal);   // behold vegmalen til neste vei
      this.P = this.nyttProsjekt();
      this.P.mal = mal;
      this.tomPaneler();
      Kart.tegn();
      id('prosjektnavn').value = this.P.navn;
      id('prosjektnavn').select();
      this.malTilSkjema();
      // Uten dette blir man staende i redigeringsmodus og far ikke satt et
      // eneste punkt, uten at noe forteller hvorfor.
      Kart.settModus('tegn');
      this.status('Nytt prosjekt – klikk i kartet for å tegne senterlinjen. Dobbeltklikk for å avslutte.');
    };
    id('knappRapport').onclick = () => Rapport.apneRapport();

    id('knappForeslaProfil').onclick = () => {
      if (!this.terrengProfil) return;
      this.lagProfilforslag();
      this.beregn();
    };
    id('knappRettOpp').onclick = () => this.rettOpp();
    id('knappBalanser').onclick = () => this.balanser();
    id('knappOptimaliser').onclick = () => this.optimaliser();
    id('kVerdi').onchange = e => {
      const k = parseFloat(e.target.value);
      if (isFinite(k)) { this.P.vip.forEach(v => v.k = k); this.profilEndret(false); }
    };

    // Alle malfeltene
    document.querySelectorAll('#fane-mal input, #fane-mal select, #fane-grunn input').forEach(el => {
      if (el.closest('.minitabell')) return;
      el.addEventListener('change', () => { this.skjemaTilMal(); this._terrengnokkel = ''; this.planlegg(50); });
    });
    id('knappNullstillMal').onclick = () => {
      this.P.mal = Object.assign({}, StandardMal);
      this.P.faktorer = Object.assign({}, StandardFaktorer);
      this.malTilSkjema(); this.planlegg(30);
    };
    // Veiklasse
    this.fyllVeiklassevalg();
    id('m_veiklasse').onchange = e => this.velgVeiklasse(e.target.value);

    // Punkthøyder i tverrprofilet
    for (const [felt, hvor] of [['tp_venstre', 'venstre'], ['tp_senter', 'senter'], ['tp_hoyre', 'hoyre']]) {
      id(felt).onchange = e => this.settPunkthoyde(hvor, parseFloat(e.target.value));
    }
    id('tp_nullstill').onclick = () => this.nullstillPunkthoyder();

    // Høydetabellen
    id('h_fyll').onclick = () => this.fyllHoyder(Math.max(1, parseFloat(id('h_steg').value) || 5));
    id('h_laasAlle').onclick = () => { this.P.vip.forEach(v => v.laast = true); this.visHoydetabell(); Lengdeprofil.tegn(); };
    id('h_laasIngen').onclick = () => { this.P.vip.forEach(v => v.laast = false); this.visHoydetabell(); Lengdeprofil.tegn(); };
    id('h_limInn').onclick = () => this.limInnHoyder();
    id('h_tomTabell').onclick = async () => {
      if (!await this.bekreft('Fjerne alle innlagte høyder og lage nytt forslag fra terrenget?', 'Tøm tabellen')) return;
      this.P.vip = [];
      if (this.terrengProfil) this.lagProfilforslag();
      this.beregn(); this.visHoydetabell();
    };
    const nyHoyde = () => {
      const sFelt = id('h_nyS'), zFelt = id('h_nyZ');
      const s = sFelt.value === '' ? (this.tverrStasjon || 0) : parseFloat(sFelt.value);
      this.leggTilHoyde(s, parseFloat(zFelt.value));
      sFelt.value = ''; zFelt.value = '';
      sFelt.focus();
    };
    id('h_nyRad').onclick = nyHoyde;
    for (const f of ['h_nyS', 'h_nyZ']) {
      id(f).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nyHoyde(); } });
    }
    id('h_retteLinjer').onchange = e => {
      const k = e.target.checked ? 0 : (parseFloat(id('kVerdi').value) || 1);
      this.P.vip.forEach(v => v.k = k);
      this.profilEndret(false); this.visHoydetabell();
    };

    id('knappNyStrekning').onclick = () => {
      const L = this.linje ? this.linje.lengde : 100;
      this.P.fjell.strekninger.push({ fra: 0, til: Math.round(L), dybde: this.P.fjell.standarddybde });
      this.visStrekninger(); this.grunnEndret();
    };

    id('knappEksportStikning').onclick = () => Rapport.eksportStikning();
    id('knappEksportMasser').onclick = () => Rapport.eksportMasser();
    id('knappEksportGeojson').onclick = () => Rapport.eksportGeojson();
    id('knappKontroller').onclick = () => this.kontrollerHoyder();

    /* Stor visning. Panelene tegner seg sjøl pa nytt via ResizeObserver,
       men Leaflet ma fa beskjed eksplisitt. */
    const rute = document.querySelector('.rute');
    const settStor = navn => {
      const alt = ['kart', 'profil', 'tverr'];
      const alleredePa = rute.classList.contains('stor-' + navn);
      alt.forEach(n => rute.classList.remove('stor-' + n));
      if (!alleredePa) rute.classList.add('stor-' + navn);
      document.querySelectorAll('.utvidknapp').forEach(b => {
        b.classList.toggle('aktiv', !alleredePa && b.dataset.utvid === navn);
        b.textContent = (!alleredePa && b.dataset.utvid === navn) ? '⤡' : '⤢';
      });
      setTimeout(() => {
        if (Kart.kart) Kart.kart.invalidateSize();
        Lengdeprofil.tegn(); Tverrprofil.tegn();
      }, 60);
    };
    document.querySelectorAll('.utvidknapp').forEach(b => {
      b.onclick = () => settStor(b.dataset.utvid);
    });
    id('knappSidepanel').onclick = () => {
      rute.classList.toggle('uten-side');
      setTimeout(() => {
        if (Kart.kart) Kart.kart.invalidateSize();
        Lengdeprofil.tegn(); Tverrprofil.tegn();
      }, 60);
    };
    this._nullstillVisning = () => {
      ['kart', 'profil', 'tverr'].forEach(n => rute.classList.remove('stor-' + n));
      document.querySelectorAll('.utvidknapp').forEach(b => { b.classList.remove('aktiv'); b.textContent = '⤢'; });
      setTimeout(() => { if (Kart.kart) Kart.kart.invalidateSize(); Lengdeprofil.tegn(); Tverrprofil.tegn(); }, 60);
    };

    document.querySelectorAll('.fane').forEach(f => {
      f.onclick = () => {
        document.querySelectorAll('.fane').forEach(x => x.classList.remove('aktiv'));
        document.querySelectorAll('.faneinnhold').forEach(x => x.classList.remove('aktiv'));
        f.classList.add('aktiv');
        document.getElementById('fane-' + f.dataset.fane).classList.add('aktiv');
      };
    });

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') { Kart.settModus('rediger'); if (this._nullstillVisning) this._nullstillVisning(); }
      if (e.key === 'ArrowRight') Tverrprofil.flytt(1);
      if (e.key === 'ArrowLeft') Tverrprofil.flytt(-1);
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.lagre(); }
    });
  }
};

function lesPar(tekst, skala) {
  const par = [];
  for (const bit of String(tekst).split(',')) {
    const m = bit.trim().match(/^(-?[\d.]+)\s*:\s*(-?[\d.]+)$/);
    if (!m) continue;
    par.push([parseFloat(m[1]), parseFloat(m[2]) * skala]);
  }
  return par.length ? par.sort((a, b) => a[0] - b[0]) : null;
}
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
/**
 * Slipper til tegningen mellom tunge runder.
 *
 * setTimeout ville vaert det opplagte, men nettleseren struper den til ett
 * sekund i faner som ligger i bakgrunnen. Bytter man fane midt i en
 * optimalisering, ville de femti smapausene blitt til nesten et minutt med
 * venting. En melding til seg selv over en MessageChannel blir ikke strupet.
 */
const _pausekanal = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const _pausekø = [];
if (_pausekanal) {
  _pausekanal.port1.onmessage = () => { const f = _pausekø.shift(); if (f) f(); };
}
function pause() {
  if (!_pausekanal) return new Promise(r => setTimeout(r, 0));
  return new Promise(r => { _pausekø.push(r); _pausekanal.port2.postMessage(0); });
}

window.addEventListener('DOMContentLoaded', () => App.start());
