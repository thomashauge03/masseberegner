'use strict';
/** Massesammendrag i sidepanelet, utskriftsrapport og eksport. */

const Rapport = {
  app: null,
  init(app) { this.app = app; return this; },

  /**
   * Sprengningen slik den som skal sprenge spør om den.
   *
   * Kubikk alene er ikke et anbudsgrunnlag. Han spør: hvor langt er strekket,
   * hvor bredt blir bruddet, hvor dypt må jeg ned, og hvor mange steder må jeg
   * flytte riggen til? Fem tusen kubikk samlet på hundre meter er én rigging;
   * de samme fem tusen fordelt på tolv flekker langs to kilometer er tolv
   * riggingner og en helt annen pris.
   *
   * Radene vises bare når det FINNES fjell å ta. På en veg i ren løsmasse er
   * fire tomme rader verre enn ingen: de ser ut som noe man har glemt å fylle
   * ut.
   */
  sprengningsrader(res) {
    const sp = res && res.sprengning;
    if (!sp || !(sp.lopemeter > 0)) return '';
    const t = (v, d = 0) => this.tall(v, d);
    const rad = (navn, verdi, tittel) =>
      `<div class="sumrad" title="${tittel}"><span>&nbsp;&nbsp;&nbsp;&nbsp;${navn}</span>`
      + `<span class="verdi">${verdi}</span></div>`;
    return rad('løpemeter', t(sp.lopemeter, 0) + ' m',
      'Hvor langt av strekket det i det hele tatt er fjell å ta ut – summen av delstrekkene, ikke hele veglengden')
      + rad('areal', t(sp.areal, 0) + ' m²',
        'Fotavtrykket av sprengningen: bredden av fjellskjæringen målt i hvert snitt, ganget med lengden')
      + rad('bredest', t(sp.storsteBredde, 1) + ' m',
        'Den bredeste fjellskjæringen på hele strekket')
      + rad('delstrekk', sp.antallStrekk + (sp.antallStrekk === 1 ? ' sted' : ' steder'),
        'Hvor mange atskilte steder det må sprenges – hver av dem er en rigging');
  },

  tall(v, des = 0) {
    if (!isFinite(v)) return '–';
    return v.toLocaleString('nb-NO', { minimumFractionDigits: des, maximumFractionDigits: des });
  },

  /** Sammendraget i sidepanelet. */
  visSammendrag(res) {
    const boks = document.getElementById('massesammendrag');
    if (!res) { boks.innerHTML = '<span class="tomtekst">Tegn en senterlinje i kartet for å komme i gang.</span>'; return; }
    const s = res.sum, b = res.balanse, f = res.faktorer, m = res.mal;
    const t = (v, d = 0) => this.tall(v, d);

    let maksSkjaering = 0, maksFylling = 0;
    for (const p of res.profiler) {
      maksSkjaering = Math.max(maksSkjaering, p.maksSkjaering);
      maksFylling = Math.max(maksFylling, p.maksFylling);
    }

    const varsler = res.merknader;
    const geometrifeil = varsler.filter(v => v.type === 'geometri').length;
    const alvorlig = geometrifeil
      ? `<div class="varselboks"><b class="merke-varsel">⚠ ${geometrifeil} profiler der skråningen ikke når terrenget</b><br>
         Volumene på disse profilene er ikke til å stole på. Senk eller hev lengdeprofilen,
         eller øk «Søkebredde tverrprofil» under Vegmal.</div>`
      : '';
    /* En merknad om et tall som ikke lar seg regne med hører ikke til noe
       profilnummer. «prof 0» foran den peker et sted den ikke gjelder.
       REGELEN ER «HAR DEN EN STASJON», IKKE «ER DEN AV DISSE TO TYPENE».
       Her sto en liste over to typer, og den holdt akkurat så lenge det bare
       fantes to typer uten sted. Første merknad som gjaldt HELE anlegget –
       den om at massene er regnet mot naboanleggene – kastet på `v.s.toFixed`
       inne i en async beregning, altså som en ufanget avvisning: atten av dem,
       uten en eneste feilmelding på skjermen. Spørsmålet er om det finnes en
       stasjon å skrive, og det svarer tallet selv på. */
    const utenSted = v => v.type === 'inngang' || !Number.isFinite(v.s);
    const varselHtml = alvorlig + (varsler.length
      ? `<div class="varselboks"><b>${varsler.length} merknad${varsler.length === 1 ? '' : 'er'}</b>`
      + varsler.slice(0, 40).map(v =>
        `<div>${utenSted(v) ? '' : 'prof ' + v.s.toFixed(0) + ' – '}${v.tekst}</div>`).join('')
      + (varsler.length > 40 ? `<div>… og ${varsler.length - 40} til</div>` : '') + '</div>'
      : '');

    boks.innerHTML = `
      ${varselHtml}
      <div class="sumkort">
        <h4>Nøkkeltall</h4>
        <div class="sumrad"><span>Veglengde</span><span class="verdi">${t(res.lengde, 1)} m</span></div>
        <div class="sumrad"><span>Profiler</span><span class="verdi">${res.profiler.length} <small>hver ${t(res.mal.profilAvstand || (res.stasjoner[1] - res.stasjoner[0]), 0)} m</small></span></div>
        <div class="sumrad"><span>Største skjæringsdybde</span><span class="verdi">${t(maksSkjaering, 1)} m</span></div>
        <div class="sumrad"><span>Største fyllingshøyde</span><span class="verdi">${t(maksFylling, 1)} m</span></div>
      </div>

      <div class="sumkort">
        <h4>Masser – prosjektert fast volum (p.f.m³) <button class="hjelpknapp" data-hjelp="masser" title="Hva betyr postene?">?</button></h4>
        <div class="sumrad" title="Matjord, torv, stubber og røtter som skrapes av før man begynner. Regnes ${m.renskDybde} m tykt over hele fotavtrykket pluss ${m.renskUtenfor} m på hver side. Går til deponi eller til jordkledning av fyllingene.">
          <span>Rensk / avdekking</span><span class="verdi">${t(s.rensk)} m³</span></div>
        <div class="strek"></div>
        <div class="sumrad stor" title="Alt som må graves eller sprenges bort for å komme ned på planum, medregnet grøft og skjæringsskråning.">
          <span class="merke-skjaering">Skjæring totalt</span><span class="verdi merke-skjaering">${t(s.skjaering)} m³</span></div>
        <div class="sumrad" title="Den delen av skjæringen som ligger over fjellet – jord og løsmasse som kan graves.">
          <span>&nbsp;&nbsp;– løsmasse</span><span class="verdi">${t(s.skjaeringLosmasse)} m³</span></div>
        <div class="sumrad" title="Den delen som ligger under fjelloverflaten og må sprenges. Avhenger helt av hvor dypt dere har satt fjellet.">
          <span class="merke-fjell">&nbsp;&nbsp;– fjell (sprengning)</span><span class="verdi merke-fjell">${t(s.skjaeringFjell)} m³</span></div>
${this.sprengningsrader(res)}
        <div class="strek"></div>
        <div class="sumrad stor" title="Hulrommet mellom terrenget og veien der veien ligger høyere enn bakken – det som må fylles opp for å bære veien. Måles opp til planum, så bærelaget kommer i tillegg.">
          <span class="merke-fylling">Fylling</span><span class="verdi merke-fylling">${t(s.fylling)} m³</span></div>
        <div class="sumrad" title="Sprengstein under vegkroppen, ${m.baerelagTykkelse} m tykt i ${m.vegbredde} m bredde. Dette er selve bæringen og må skaffes uansett om veien ligger i skjæring eller fylling.">
          <span>Bærelag</span><span class="verdi">${t(s.baerelag)} m³</span></div>
        <div class="sumrad" title="Knust grus på toppen, ${m.slitelagTykkelse} m tykt i ${m.slitelagBredde} m bredde.">
          <span>Slitelag</span><span class="verdi">${t(s.slitelag)} m³</span></div>
        <div class="hjelpetekstboks skjult" data-hjelptekst="masser">
          <p><b>Rensk</b> er matjord og stubber som skrapes av først. Den er ikke bygge­masse – den går til deponi eller brukes til å jordkle fyllingene.</p>
          <p><b>Skjæring</b> er alt som må bort for å komme ned på planum. Den deles i løsmasse og fjell etter hvor dypt fjellet ligger, og det er den delingen som avgjør hva jobben koster.</p>
          <p><b>Fylling</b> er hulrommet under veien der den ligger høyere enn bakken. Er dette tallet stort, ligger lengdeprofilen høyt over terrenget – prøv «Massebalanse» eller «Optimaliser», eller senk profilen for hånd.</p>
          <p><b>Bærelag og slitelag</b> er selve vegkroppen og kommer i tillegg til fyllingen. De må skaffes uansett.</p>
          <p>Fylling og skjæring trenger ikke å være like store. Ett fast kubikkmeter fjell blir til om lag ${f.fjellIFylling} m³ ferdig fylling når det er sprengt og lagt ut.</p>
        </div>
      </div>

      <div class="sumkort">
        <h4>Anbrakt volum (p.a.m³)</h4>
        <div class="sumrad"><span>Sprengt fjell på lass</span><span class="verdi">${t(b.fjellSprengtLos)} m³ <small>×${f.sprengningsfaktor}</small></span></div>
        <div class="sumrad"><span>Fylling + bærelag</span><span class="verdi">${t(s.fylling + s.baerelag)} m³</span></div>
      </div>

      <div class="sumkort">
        <h4>Massebalanse</h4>
        <div class="sumrad"><span>Tilgjengelig fra fjellskjæring</span><span class="verdi">${t(b.fraFjell)} m³ <small>×${f.fjellIFylling}</small></span></div>
        <div class="sumrad"><span>Tilgjengelig brukbar løsmasse</span><span class="verdi">${t(b.brukbarLos)} m³ <small>×${f.brukbarLosmasse}</small></span></div>
        <div class="strek"></div>
        <div class="sumrad"><span>Fylling, behov ${t(b.fyllingBehov)} m³</span><span class="verdi ${b.manglerFylling > 1 ? 'merke-varsel' : 'merke-fylling'}">${b.manglerFylling > 1 ? 'mangler ' + t(b.manglerFylling) : 'dekket'}</span></div>
        <div class="sumrad"><span>Bærelag, behov ${t(b.baerelagBehov)} m³</span><span class="verdi ${b.manglerBaerelag > 1 ? 'merke-varsel' : 'merke-fylling'}">${b.manglerBaerelag > 1 ? 'mangler ' + t(b.manglerBaerelag) : 'dekket av egen stein'}</span></div>
        <div class="strek"></div>
        ${b.manglerTotalt > 1
        ? `<div class="sumrad stor"><span>Må kjøres inn</span><span class="verdi merke-varsel">${t(b.manglerTotalt)} m³</span></div>`
        : `<div class="sumrad stor"><span>Overskudd av sprengstein</span><span class="verdi merke-fylling">${t(b.overskuddFjell)} m³</span></div>`}
        <div class="sumrad"><span>Til deponi (rensk + ubrukbar løsmasse)</span><span class="verdi">${t(b.tilDeponi)} m³</span></div>
        ${b.overskuddLos > 1
        ? `<div class="sumrad"><span>Brukbar løsmasse til overs</span><span class="verdi">${t(b.overskuddLos)} m³</span></div>`
        : ''}
        <div class="sumrad"><small>Til sammen ${t(b.tilDeponi + b.overskuddLos + b.overskuddFjell)} m³ skal ut av anlegget.</small></div>
      </div>

      <div class="sumkort">
        <h4>Massetransport (Brucknerkurve)</h4>
        ${this.brucknerSvg(res)}
        <div class="sumrad"><small>Over null = overskudd bakover, under null = behov for tilkjørt masse.</small></div>
      </div>

      ${this.usikkerhetKort(res)}

      <div class="sumkort">
        <h4>Grunnlag</h4>
        <div class="sumrad"><span>Terrengmodell</span><span class="verdi"><small>Kartverket DTM1, 1 m laser</small></span></div>
        <div class="sumrad"><span>Koordinatsystem</span><span class="verdi"><small>EUREF89 UTM${this.app.sone}</small></span></div>
        <div class="sumrad"><span>Lengdekorreksjon</span><span class="verdi"><small>${res.bakkefaktor === 1 ? 'av' : '×' + res.bakkefaktor.toFixed(6)}</small></span></div>
      </div>`;

    const skogknapp = boks.querySelector('#sjekkSkog');
    if (skogknapp) skogknapp.onclick = () => this.app.sjekkSkogdekke();

    // Hjelpetekstene folder seg ut der de hører hjemme, ikke i et eget vindu
    boks.querySelectorAll('.hjelpknapp').forEach(kn => {
      kn.onclick = () => {
        const t = boks.querySelector(`[data-hjelptekst="${kn.dataset.hjelp}"]`);
        if (t) { t.classList.toggle('skjult'); kn.classList.toggle('aktiv'); }
      };
    });
  },

  /**
   * Hva tallene taler av at forutsetningene er feil.
   *
   * Terrenget er malt, men dybden til fjell er anslatt. Den star for hele
   * forskjellen mellom graving og sprengning, og er derfor det eneste tallet
   * som virkelig kan velte et anbud. Her vises hva et halvmetersbom betyr.
   */
  /**
   * Skogdekket langs traseen.
   *
   * Terrengmodellen er laget av laserpulser som ma na helt ned til bakken.
   * Star det tett skog, slipper fa av dem gjennom, og høyden er interpolert
   * mellom spredte treff i stedet for malt. Det er den viktigste grunnen til
   * at terrenghøyden kan bomme - og den kan males.
   */
  skograd() {
    const s = this.app.skogdekke;
    if (!s) {
      return `<div class="sumrad"><span><button class="minilenke" id="sjekkSkog">Sjekk skogdekket langs traseen</button></span>
              <span class="verdi"><small>ikke målt</small></span></div>`;
    }
    const tett = s.andelOver5 > 0.25;
    return `<div class="sumrad"><span>Skog over traseen</span>
        <span class="verdi ${tett ? 'merke-varsel' : ''}">${(s.andelOver5 * 100).toFixed(0)} % over 5 m</span></div>
      <div class="sumrad"><small>Snitt ${s.snitt.toFixed(1)} m, høyeste ${s.maks.toFixed(0)} m.
        ${tett ? 'Under tett skog når laseren dårligere ned, så terrenghøyden her er mer usikker enn på åpen mark.'
        : 'Stort sett åpent – gode forhold for laserdata.'}</small></div>`;
  },

  usikkerhetKort(res) {
    const u = res.usikkerhet;
    if (!u) return '';
    const t = (v, d = 0) => this.tall(v, d);
    /* `spenn` er avstanden fra 0,5 m grunnere til 0,5 m dypere - altsa over en
       hel meter. Teksten sa «et halvmetersbom flytter», og viste dermed
       omtrent dobbelt sa mye som den lovte. Her males ett bom, den veien som
       slar hardest ut. */
    const enVei = Math.max(Math.abs(u.fjellGrunnere - u.fjellNa), Math.abs(u.fjellDypere - u.fjellNa));
    const andelEnVei = u.skjaeringTotalt > 0 ? (enVei / u.skjaeringTotalt * 100) : 0;
    const antallObs = this.app.P.fjell.punkter.length;
    return `
      <div class="sumkort">
        <h4>Hvor sikre er tallene <button class="hjelpknapp" data-hjelp="sikkerhet" title="Hva betyr dette?">?</button></h4>
        <div class="hjelpetekstboks skjult" data-hjelptekst="sikkerhet">
          <p><b>Terrenghøydene er målt.</b> De kommer fra Kartverkets laserskanning og er kontrollert
            mot Kartverkets eget API – de stemmer eksakt. På åpen mark er dette det beste grunnlaget
            som finnes uten å måle selv.</p>
          <p><b>Skog over traseen</b> forteller hvor godt laseren har nådd ned. Terrengmodellen lages
            av laserpulser som må helt ned på bakken. Står det tett skog, slipper få gjennom, og
            høyden mellom treffene er <i>regnet ut, ikke målt</i>. Er tallet høyt, er terrenget langs
            veien mindre å stole på enn ellers – da er en befaring med GPS verdt tiden.</p>
          <p><b>Dybden til fjell er et anslag.</b> Programmet kan ikke vite hvor fjellet ligger.
            Det bruker verdien du har satt under Grunnforhold. Linjene under viser hva sprengningen
            blir hvis den verdien bommer med en halv meter hver vei – det er som regel den største
            usikkerheten i hele regnestykket.</p>
          <p><b>Kort sagt:</b> terrenget kan du regne med. Sprengningsvolumet er ikke sikrere enn
            det du vet om fjellet. Registrer fjellpunkt i kartet der dere har gravd, sett eller
            sondert, så strammer det seg inn.</p>
        </div>
        <div class="sumrad"><span>Terrenghøyder</span><span class="verdi merke-fylling">Målt</span></div>
        <div class="sumrad"><small>Kartverket DTM1, kontrollert mot deres eget API</small></div>
        ${this.skograd()}
        <div class="strek"></div>
        <div class="sumrad"><span>Dybde til fjell</span><span class="verdi ${antallObs ? '' : 'merke-varsel'}">${antallObs ? antallObs + ' observasjoner' : 'Kun anslag'}</span></div>
        <div class="sumrad"><span>Sprengning ved 0,5 m grunnere fjell</span><span class="verdi">${t(u.fjellGrunnere)} m³</span></div>
        <div class="sumrad"><span>Sprengning nå</span><span class="verdi merke-fjell">${t(u.fjellNa)} m³</span></div>
        <div class="sumrad"><span>Sprengning ved 0,5 m dypere fjell</span><span class="verdi">${t(u.fjellDypere)} m³</span></div>
        <div class="strek"></div>
        <div class="sumrad stor">
          <span>Et halvmetersbom flytter</span>
          <span class="verdi ${andelEnVei > 15 ? 'merke-varsel' : ''}">${t(enVei)} m³</span>
        </div>
        <div class="sumrad"><small>Det er ${andelEnVei.toFixed(0)} % av hele skjæringsvolumet.
          Bommer dere en halvmeter hver vei, er spennet ${t(u.spenn)} m³.</small></div>
        <div class="sumrad"><small>${antallObs ? 'Flere observasjoner i kartet strammer inn anslaget.'
        : 'Registrer fjellpunkt i kartet der dere vet hva som ligger under.'}</small></div>
      </div>`;
  },

  brucknerSvg(res) {
    const d = (res.bruckner || []).filter(p => isFinite(p.s) && isFinite(p.verdi));
    if (d.length < 2) return '<div class="tomtekst">Ikke nok data til å tegne kurven.</div>';
    const B = 340, H = 90;
    const sMax = d[d.length - 1].s || 1;
    let vMin = 0, vMax = 0;
    for (const p of d) { vMin = Math.min(vMin, p.verdi); vMax = Math.max(vMax, p.verdi); }
    const spenn = Math.max(1, vMax - vMin);
    const X = s => 4 + s / sMax * (B - 8);
    const Y = v => H - 6 - (v - vMin) / spenn * (H - 14);
    const linje = d.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(1)},${Y(p.verdi).toFixed(1)}`).join(' ');
    const flate = `${linje} L${X(sMax).toFixed(1)},${Y(0).toFixed(1)} L${X(0).toFixed(1)},${Y(0).toFixed(1)} Z`;
    return `<svg viewBox="0 0 ${B} ${H}" style="width:100%;height:90px">
      <path d="${flate}" fill="rgba(78,163,255,.22)"/>
      <line x1="4" y1="${Y(0).toFixed(1)}" x2="${B - 4}" y2="${Y(0).toFixed(1)}" stroke="#4a5666"/>
      <path d="${linje}" fill="none" stroke="#4ea3ff" stroke-width="1.6"/>
      <text x="6" y="11" fill="#6d7d90" font-size="9">${this.tall(vMax)} m³</text>
      <text x="6" y="${H - 1}" fill="#6d7d90" font-size="9">${this.tall(vMin)} m³</text>
    </svg>`;
  },

  /* ---------------- Utskriftsrapport ---------------- */

  /**
   * Tegner lengdeprofilen og et utvalg tverrsnitt til bilder for rapporten.
   *
   * Lerretene pa skjermen er sma og har mørk bakgrunn. Til papir tegnes de pa
   * nytt i full bredde med lys bakgrunn, ellers blir utskriften bade uleselig
   * og full av toner.
   */
  lagTegninger(res, antallTverrsnitt = 6) {
    const bilder = { tverrsnitt: [] };
    const lyst = () => {
      // bytt til den lyse paletten mens vi tegner for papir
      document.documentElement.setAttribute('data-utskrift', '1');
      Farger.glem();
      if (typeof Tomt3d !== 'undefined') Tomt3d.glemFarger();
      if (typeof Veg3d !== 'undefined') Veg3d.glemFarger();
    };
    const tilbake = () => {
      document.documentElement.removeAttribute('data-utskrift');
      Farger.glem();
      if (typeof Tomt3d !== 'undefined') Tomt3d.glemFarger();
      if (typeof Veg3d !== 'undefined') Veg3d.glemFarger();
    };

    const midlertidig = (bredde, hoyde, tegn) => {
      const l = document.createElement('canvas');
      l.width = bredde; l.height = hoyde;
      l.style.width = bredde + 'px'; l.style.height = hoyde + 'px';
      Object.defineProperty(l, 'clientWidth', { value: bredde });
      Object.defineProperty(l, 'clientHeight', { value: hoyde });
      tegn(l);
      return l.toDataURL('image/png');
    };

    lyst();
    try {
      const gammeltLerret = Lengdeprofil.lerret;
      const gammelCtx = Lengdeprofil.ctx;
      const gammelPeker = Lengdeprofil.peker;
      Lengdeprofil.peker = null;
      bilder.lengdeprofil = midlertidig(1600, 520, l => {
        Lengdeprofil.lerret = l; Lengdeprofil.ctx = l.getContext('2d');
        Lengdeprofil.tegn();
      });
      Lengdeprofil.lerret = gammeltLerret; Lengdeprofil.ctx = gammelCtx; Lengdeprofil.peker = gammelPeker;

      const gammelTverr = Tverrprofil.lerret, gammelTverrCtx = Tverrprofil.ctx, gammelProfil = Tverrprofil.profil;
      const steg = Math.max(1, Math.floor(res.profiler.length / antallTverrsnitt));
      for (let i = 0; i < res.profiler.length; i += steg) {
        const pr = res.profiler[i];
        bilder.tverrsnitt.push({
          s: pr.s, areal: pr.areal,
          bilde: midlertidig(900, 460, l => {
            Tverrprofil.lerret = l; Tverrprofil.ctx = l.getContext('2d');
            Tverrprofil.profil = pr;
            Tverrprofil.tegn();
          })
        });
      }
      Tverrprofil.lerret = gammelTverr; Tverrprofil.ctx = gammelTverrCtx; Tverrprofil.profil = gammelProfil;
    } finally {
      tilbake();
      Lengdeprofil.tegn(); Tverrprofil.tegn();
    }
    return bilder;
  },

  /**
   * Tegningene til en tomterapport.
   *
   * Tomterapporten hadde INGEN. Åtte tabeller etter hverandre på én side, alle
   * med samme vekt – man måtte lese hele for å finne ut hva saken gjaldt. En
   * vegrapport har lengdeprofil og tverrsnitt; en tomt hadde tall og bare tall.
   *
   * Bildene lages av det som alt finnes, ikke av en ny tegnerutine: 3D-modellen
   * sett rett ovenfra ER planet, og den samme modellen på skrå er perspektivet.
   * `Tomt3d.eksportBilde()` sto allerede der, ubrukt.
   */
  lagTomtetegninger(res) {
    const bilder = {};
    if (typeof Tomt3d === 'undefined' || !res || !res.rutenett || !res.rutenett.length) return bilder;

    document.documentElement.setAttribute('data-utskrift', '1');
    Farger.glem(); Tomt3d.glemFarger();
    const foer = {
      lerret: Tomt3d.lerret, over: Tomt3d.over, aktiv: Tomt3d.aktiv,
      yaw: Tomt3d.yaw, pitch: Tomt3d.pitch, fyldig: Tomt3d.fyldig, visning: Tomt3d.visning,
      modus: Tomt3d.modus, fokus: Tomt3d.fokus,
      senter: Tomt3d.senter, skala: Tomt3d.skala, panX: Tomt3d.panX, panY: Tomt3d.panY,
      skalaSatt: Tomt3d._skalaSatt, gitterFor: Tomt3d._gitterFor, bilde: Tomt3d._bilde,
      fitSkala: Tomt3d._fitSkala, tilpassetFor: Tomt3d._tilpassetFor,
      lag: Object.assign({}, Tomt3d.lag), kontekst: Tomt3d.kontekst
    };
    const lag = (b, h, yaw, pitch, fyldig) => {
      const r = document.createElement('canvas');
      const o = document.createElement('canvas');
      for (const c of [r, o]) {
        c.width = b; c.height = h;
        Object.defineProperty(c, 'clientWidth', { value: b });
        Object.defineProperty(c, 'clientHeight', { value: h });
        // tegn() gir opp med én gang om panelet er skjult; her er det aldri i DOM-en
        Object.defineProperty(c, 'offsetParent', { value: document.body });
      }
      Tomt3d.lerret = r; Tomt3d.over = o;
      Tomt3d.aktiv = true;
      Tomt3d.yaw = yaw; Tomt3d.pitch = pitch; Tomt3d.fyldig = fyldig;
      /* RAPPORTEN SKAL ALDRI ARVE EN SKJERMTILSTAND.
         Sto «Før» på da rapporten ble laget, ble alle tomtetegningene bart
         terreng – riktig etter koden, tomt etter formålet. Tegningene i en
         rapport viser massene; det er det rapporten handler om. */
      Tomt3d.visning = 'vanlig';
      /* OG ALDRI EN KAMERAPOSISJON HELLER.
         Sto man på bakken da rapporten ble laget, tegnet den tomtebildene fra
         øyehøyde: perspektiv, horisont og himmel i en plantegning. Og med et
         dreiepunkt satt av et klikk ble bildet sentrert der brukeren sist
         pekte, så deler av tomta falt utenfor. Rapporten er ikke skjermen. */
      Tomt3d.modus = 'oversikt';
      Tomt3d.fokus = null;
      /* OG ALDRI NABOANLEGGENE.
         «Alle anlegg» er en skjermbryter: den tegner naboene som ferdige
         flater UTEN skråninger og UTEN masser, for å svare på hvor ting ligger
         i forhold til hverandre. I en rapport som går til kunden ville de stått
         i samme bilde som beregnede masser, uten noe som skiller dem – en
         flate som ser regnet ut og ikke er det. Dessuten rammer innrammingen
         da inn naboene også, og tomta blir en flekk midt i et grått felt,
         stikk i strid med `kontekst`-innstillingen nedenfor. */
      Tomt3d.lag = Object.assign({}, Tomt3d.lag, { andre: false });
      Tomt3d.glemBakgrunn(); Tomt3d._andreNa = null;
      Tomt3d.senter = null; Tomt3d.panX = 0; Tomt3d.panY = 0;
      Tomt3d._skalaSatt = false;
      Tomt3d._gitterFor = null;
      Tomt3d._bilde = null;                       // egne skrapebuffere for denne størrelsen
      Tomt3d.glemFarger();
      Tomt3d.tegn();
      const l = document.createElement('canvas');
      l.width = r.width; l.height = r.height;
      const k = l.getContext('2d');
      k.drawImage(r, 0, 0);
      k.drawImage(o, 0, 0);
      return l.toDataURL('image/png');
    };
    try {
      /* Rett ovenfra: dette ER planet, med skjæring og fylling i farge.
         Fyldig, fordi et papir ikke tåler den halvgjennomsiktige lesemåten –
         der blir en grunn skjæring og en grunn fylling samme grå. */
      /* Smal ring rundt i planet. På skjermen er 40 m terreng rundt riktig –
         man vil se hva tomta ligger i. På et papir gjør den at selve tomta
         blir en flekk midt i et grått felt: målt dekket tomta under en
         tidel av bildet. Perspektivbildet beholder ringen, for der er
         nettopp terrenget rundt det man ser etter. */
      Tomt3d.lag.rutenett = true;
      Tomt3d.kontekst = 8;
      /* Formatet er valgt etter SIDEBREDDEN, ikke etter skjermen. A4 er
         595 pt bred med 38 pt marg, altså 519 pt innhold. Et bilde som er
         høyere enn det er bredt måtte krympes for å få plass i høyden – og
         da krympet bredden med, så tegningen endte som en frimerkestor
         flekk i venstre tredel med et tomt felt ved siden av. */
      bilder.plan = lag(1560, 900, 0, 89.5, true);
      Tomt3d.lag.rutenett = false;
      Tomt3d.kontekst = 30;
      // og på skrå, så man ser hvordan skråningene legger seg
      bilder.perspektiv = lag(1560, 680, 32, 34, true);
    } catch (e) {
      /* Et bilde som ikke lot seg lage skal ikke ta rapporten med seg. */
    } finally {
      Object.assign(Tomt3d, {
        lerret: foer.lerret, over: foer.over, aktiv: foer.aktiv,
        yaw: foer.yaw, pitch: foer.pitch, fyldig: foer.fyldig, visning: foer.visning,
        modus: foer.modus, fokus: foer.fokus,
        senter: foer.senter, skala: foer.skala, panX: foer.panX, panY: foer.panY,
        /* OG INNRAMMINGEN MÅ LEGGES TILBAKE.
           Rapporten tegner på egne lerret på 1560 px og skriver da _fitSkala og
           _tilpassetFor for DEN størrelsen. Uten dette leste den neste
           opptegningen på skjermen forholdet mellom skjermens skala og
           rapportlerretets innramming – og modellen krympet rundt 40 % for hver
           PDF man laget, uten at noe rørte seg mens man så på. */
        _fitSkala: foer.fitSkala, _tilpassetFor: foer.tilpassetFor,
        _skalaSatt: foer.skalaSatt, _gitterFor: null, _bilde: null, lag: foer.lag,
        /* Bakgrunnsgitrene ble bygd for rapportens kamera og må bygges på nytt
           for skjermens. `lag` legges tilbake over – står bryteren på, kommer
           naboanleggene tilbake ved neste opptegning. */
        _andreNokkel: null, _andreNa: null,
        kontekst: foer.kontekst
      });
      // knappene eier ikke tilstanden, så de må få vite at den er lagt tilbake
      if (Tomt3d.paaVisning) Tomt3d.paaVisning(Tomt3d.visning);
      document.documentElement.removeAttribute('data-utskrift');
      Farger.glem(); Tomt3d.glemFarger();
      if (Tomt3d.aktiv) Tomt3d.tegn();
    }

    /* Snittet gjennom tomta, tegnet på nytt for papir. */
    if (typeof Tomteprofil !== 'undefined' && Tomteprofil.lerret) {
      document.documentElement.setAttribute('data-utskrift', '1');
      Farger.glem();
      const gml = Tomteprofil.lerret, gmlCtx = Tomteprofil.ctx;
      try {
        const c = document.createElement('canvas');
        c.width = 1560; c.height = 440;
        Object.defineProperty(c, 'clientWidth', { value: 1560 });
        Object.defineProperty(c, 'clientHeight', { value: 440 });
        Tomteprofil.lerret = c;
        if ('ctx' in Tomteprofil) Tomteprofil.ctx = c.getContext('2d');
        Tomteprofil.tegn();
        /* SNITTET MALER INGEN BUNN.
           På skjermen kommer bakgrunnen fra CSS-en på selve lerretet, og
           `tegn()` nøyer seg med `clearRect`. På et lerret som ikke står i
           siden er «tømt» det samme som gjennomsiktig, og bildet kom ut helt
           svart i PDF-en. Bunnen males derfor UNDER det som er tegnet.
           (Tverrsnittet i vegrapporten fyller selv, og har aldri hatt dette.) */
        const kb = c.getContext('2d');
        kb.setTransform(1, 0, 0, 1, 0, 0);
        kb.globalCompositeOperation = 'destination-over';
        kb.fillStyle = Farger.flate;
        kb.fillRect(0, 0, c.width, c.height);
        kb.globalCompositeOperation = 'source-over';
        bilder.snitt = c.toDataURL('image/png');
      } catch (e) { /* uten snitt går rapporten fint */ }
      Tomteprofil.lerret = gml;
      if ('ctx' in Tomteprofil) Tomteprofil.ctx = gmlCtx;
      document.documentElement.removeAttribute('data-utskrift');
      Farger.glem();
      Tomteprofil.tegn();
    }
    return bilder;
  },

  /** Koordinater og høyder for senterlinjen, til utsetting i felt. */
  stikningstabell(res, steg) {
    const app = this.app;
    const rader = [];
    const mal = res.mal;
    for (const p of res.profiler) {
      if (steg > 0 && Math.abs(p.s % steg) > 1e-6 && p.s !== res.profiler[res.profiler.length - 1].s) continue;
      const vk = app.linje.punktMedAvvik(p.s, -p.halvbredde);
      const hk = app.linje.punktMedAvvik(p.s, p.halvbredde);
      const fall = app.fallVed ? app.fallVed(p.s) : { venstre: mal.tverrfall, hoyre: mal.tverrfall };
      rader.push({
        s: p.s, n: p.y, o: p.x, z: p.vegnivaa,
        terreng: p.terrengSenter,
        vkN: vk.y, vkO: vk.x, vkZ: p.vegnivaa - fall.venstre * p.halvbredde,
        hkN: hk.y, hkO: hk.x, hkZ: p.vegnivaa - fall.hoyre * p.halvbredde
      });
    }
    return rader;
  },

  /**
   * @param {{seksjon?:string}} [valg] med `seksjon` settes rapporten sammen som
   *   en DEL av et større dokument, og HTML-en returneres i stedet for å åpnes.
   */
  apneRapport(valg) {
    const app = this.app, res = app.resultat;
    if (!res) { this.eksportsvar('Ingen beregning å rapportere ennå.', true); return; }
    /* En tomt har ingen intervaller. Her ble tomteresultatet sendt rett inn i
       vegrapporten, og `for (const iv of res.intervaller)` kastet «not
       iterable» - uten try/catch noe sted, så knappen så ut som om den ikke
       gjorde noe i det hele tatt. */
    if (app.erTomt()) return this.apneTomterapport(app, res, valg);
    const t = (v, d = 0) => this.tall(v, d);
    const s = res.sum, b = res.balanse, m = res.mal, f = res.faktorer;
    const dato = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric' });

    // Samle volum per 20 m for en lesbar tabell
    const bolk = 20;
    const rader = [];
    let gjeldende = null;
    for (const iv of res.intervaller) {
      const start = Math.floor(iv.fra / bolk) * bolk;
      if (!gjeldende || gjeldende.fra !== start) {
        gjeldende = { fra: start, til: start + bolk, rensk: 0, skjaering: 0, fjell: 0, los: 0, fylling: 0, baerelag: 0, slitelag: 0 };
        rader.push(gjeldende);
      }
      gjeldende.rensk += iv.volum.rensk;
      gjeldende.skjaering += iv.volum.skjaering;
      gjeldende.fjell += iv.volum.skjaeringFjell;
      gjeldende.los += iv.volum.skjaeringLosmasse;
      gjeldende.fylling += iv.volum.fylling;
      gjeldende.baerelag += iv.volum.baerelag;
      gjeldende.slitelag += iv.volum.slitelag;
      gjeldende.til = iv.til;
    }

    const merknader = res.merknader.map(v =>
      `<tr><td>${Number.isFinite(v.s) && v.type !== 'inngang' ? v.s.toFixed(0) : '–'}</td><td>${v.type}</td><td>${v.tekst}</td></tr>`).join('');

    const tegninger = this.lagTegninger(res);
    const stikning = this.stikningstabell(res, res.lengdeKart > 600 ? 10 : 5);

    const html = this.rapportskall(app, {
      typer: 'veg',
      under: escapeHtml(app.P.navn),
      hoyre: `${dato}<br>Veglengde ${t(res.lengde, 1)} m<br>${klassenavn(app)}`,
      seksjon: valg && valg.seksjon
    }, `

<div class="to">
<div>
<h2>Sammendrag</h2>
<table class="noekkel">
<tr><td>Rensk / avdekking (${m.renskDybde} m + ${m.renskUtenfor} m utenfor)</td><td>${t(s.rensk)} m³</td></tr>
<tr><td>Skjæring i løsmasse</td><td>${t(s.skjaeringLosmasse)} p.f.m³</td></tr>
<tr><td>Skjæring i fjell (sprengning)</td><td>${t(s.skjaeringFjell)} p.f.m³</td></tr>
${res.sprengning && res.sprengning.lopemeter > 0 ? `<tr><td>&nbsp;&nbsp;– løpemeter sprengning</td><td>${t(res.sprengning.lopemeter)} m</td></tr>
<tr><td>&nbsp;&nbsp;– areal sprengning</td><td>${t(res.sprengning.areal)} m²</td></tr>
<tr><td>&nbsp;&nbsp;– bredeste fjellskjæring</td><td>${t(res.sprengning.storsteBredde, 1)} m</td></tr>
<tr><td>&nbsp;&nbsp;– antall steder å rigge</td><td>${res.sprengning.antallStrekk}</td></tr>` : ''}
<tr class="sum"><td>Skjæring totalt</td><td>${t(s.skjaering)} p.f.m³</td></tr>
<tr><td>Fylling (geometrisk volum)</td><td>${t(s.fylling)} m³</td></tr>
<tr><td>Bærelag ${m.baerelagTykkelse} m × ${m.vegbredde} m</td><td>${t(s.baerelag)} p.a.m³</td></tr>
<tr><td>Slitelag ${m.slitelagTykkelse} m × ${m.slitelagBredde} m</td><td>${t(s.slitelag)} p.a.m³</td></tr>
<tr class="sum"><td>Fylling + bærelag</td><td>${t(s.fylling + s.baerelag)} p.a.m³</td></tr>
</table>

<h2>Massebalanse</h2>
<table class="noekkel">
<tr><td>Tilgjengelig fra fjellskjæring (× ${f.fjellIFylling})</td><td>${t(b.fraFjell)} m³</td></tr>
<tr><td>Tilgjengelig brukbar løsmasse (${Math.round(f.brukbarLosmasse * 100)} % × ${f.losmasseIFylling})</td><td>${t(b.brukbarLos)} m³</td></tr>
<tr><td>Fylling dekket av egne masser</td><td>${t(b.fyllFraLos + b.fyllFraFjell)} av ${t(b.fyllingBehov)} m³</td></tr>
<tr><td>Bærelag dekket av egen sprengstein</td><td>${t(b.baerelagFraFjell)} av ${t(b.baerelagBehov)} m³</td></tr>
<tr class="sum"><td>${b.manglerTotalt > 1 ? 'Må kjøres inn' : 'Overskudd av sprengstein'}</td><td>${t(b.manglerTotalt > 1 ? b.manglerTotalt : b.overskuddFjell)} m³</td></tr>
<tr><td>Til deponi (rensk + ubrukbar løsmasse)</td><td>${t(b.tilDeponi)} m³</td></tr>
<tr><td>Sprengt fjell, løst volum (× ${f.sprengningsfaktor})</td><td>${t(b.fjellSprengtLos)} p.a.m³</td></tr>
</table>
</div>

<div>
<h2>Forutsetninger</h2>
<table class="noekkel">
<tr><td>Veiklasse</td><td>${klassenavn(app)}</td></tr>
<tr><td>Vegbredde inkl. skulder</td><td>${m.vegbredde} m</td></tr>
<tr><td>Tverrfall</td><td>${(m.tverrfall * 100).toFixed(1)} % ${m.tverrfallType === 'tak' ? '(tosidig)' : '(ensidig)'}</td></tr>
<tr><td>Overbygning (bærelag + slitelag)</td><td>${(m.baerelagTykkelse + m.slitelagTykkelse).toFixed(2)} m</td></tr>
<tr><td>Grøftedybde under planum</td><td>${m.grofteDybdePlanum} m</td></tr>
<tr><td>Grøftebunn</td><td>${m.grofteBunn} m</td></tr>
<tr><td>Skjæring i løsmasse</td><td>1:${m.skjaeringLosmasse}</td></tr>
<tr><td>Skjæring i fjell</td><td>1:${m.skjaeringFjell}</td></tr>
<tr><td>Fyllingsskråning</td><td>1:${m.fylling}</td></tr>
<tr><td>Profilavstand</td><td>${t(res.stasjoner[1] - res.stasjoner[0], 1)} m</td></tr>
<tr><td>Standard dybde til fjell</td><td>${app.P.fjell.standarddybde} m</td></tr>
<tr><td>Observasjoner av fjelldybde</td><td>${app.P.fjell.punkter.length} stk</td></tr>
<tr><td>Lengdekorreksjon UTM → bakke</td><td>${res.bakkefaktor === 1 ? 'ikke brukt' : '× ' + res.bakkefaktor.toFixed(6)}</td></tr>
</table>
<p class="liten">Volumene er regnet med gjennomsnittlig endeareal mellom profilene, med Pappus-korreksjon for kurvatur.
Skjæring og fylling er regnet mot planum (under overbygningen) og mot terreng etter rensk.
p.f. = prosjektert fast volum, p.a. = prosjektert anbrakt volum.</p>
</div>
</div>

<h2>Masser per ${bolk} meter</h2>
<table>
<thead><tr><th>Fra–til</th><th>Rensk</th><th>Skjæring løsm.</th><th>Skjæring fjell</th><th>Skjæring sum</th><th>Fylling</th><th>Bærelag</th><th>Slitelag</th></tr></thead>
<tbody>
${rader.map(r => `<tr><td>${r.fra}–${r.til.toFixed(0)}</td><td>${t(r.rensk)}</td><td>${t(r.los)}</td><td>${t(r.fjell)}</td><td>${t(r.skjaering)}</td><td>${t(r.fylling)}</td><td>${t(r.baerelag)}</td><td>${t(r.slitelag)}</td></tr>`).join('')}
<tr class="sum"><td>Sum</td><td>${t(s.rensk)}</td><td>${t(s.skjaeringLosmasse)}</td><td>${t(s.skjaeringFjell)}</td><td>${t(s.skjaering)}</td><td>${t(s.fylling)}</td><td>${t(s.baerelag)}</td><td>${t(s.slitelag)}</td></tr>
</tbody></table>

<h2>Lengdeprofil</h2>
<img class="tegning" src="${tegninger.lengdeprofil}" alt="Lengdeprofil">

<h2>Tverrsnitt</h2>
<div class="tverrsnitt">
${tegninger.tverrsnitt.map(t => `<figure>
  <img src="${t.bilde}" alt="Tverrsnitt profil ${t.s.toFixed(0)}">
  <figcaption>Profil ${t.s.toFixed(0)} · skjæring ${t.areal.skjaering.toFixed(1)} m²
    (fjell ${t.areal.skjaeringFjell.toFixed(1)}) · fylling ${t.areal.fylling.toFixed(1)} m²</figcaption>
</figure>`).join('')}
</div>

<h2>Stikningsdata – senterlinje</h2>
<p class="liten">EUREF89 UTM${app.sone}. VK og HK er venstre og høyre vegkant.
Z er ferdig vegnivå. Hele oppsettet med hver ${t(res.stasjoner[1] - res.stasjoner[0], 1)} meter
kan hentes som CSV under fanen «Linje».</p>
<table class="stikning">
<thead><tr><th>Profil</th><th>Nord</th><th>Øst</th><th>Z veg</th><th>Z terreng</th>
<th>VK nord</th><th>VK øst</th><th>VK Z</th><th>HK nord</th><th>HK øst</th><th>HK Z</th></tr></thead>
<tbody>
${stikning.map(r => `<tr><td>${r.s.toFixed(0)}</td>
<td>${r.n.toFixed(3)}</td><td>${r.o.toFixed(3)}</td><td>${r.z.toFixed(3)}</td>
<td>${isFinite(r.terreng) ? r.terreng.toFixed(3) : '–'}</td>
<td>${r.vkN.toFixed(3)}</td><td>${r.vkO.toFixed(3)}</td><td>${r.vkZ.toFixed(3)}</td>
<td>${r.hkN.toFixed(3)}</td><td>${r.hkO.toFixed(3)}</td><td>${r.hkZ.toFixed(3)}</td></tr>`).join('')}
</tbody></table>

${merknader ? `<h2>Merknader</h2><table><thead><tr><th>Profil</th><th>Type</th><th>Merknad</th></tr></thead><tbody>${merknader}</tbody></table>` : ''}
`);
    if (valg && valg.seksjon) return html;
    this.visRapport(html, app);
  },

  /**
   * Forbeholdet som står nederst i rapporten. Ett sted, uansett hvor mange anlegg.
   *
   * Setningene i midten skiller seg: vegen regnes profil for profil, tomta celle
   * for celle, og forbeholdet må si det som faktisk gjelder. Er begge deler med
   * i samme dokument, står begge setningene – ikke den ene på vegne av begge.
   */
  rapportbunn(typer) {
    const sett = new Set(Array.isArray(typer) ? typer : [typer || 'veg']);
    const har = t => sett.has(t);
    const midt = [];
    if (har('veg')) {
      midt.push('Terrenghøydene er hentet fra Kartverket sin nasjonale høydemodell '
        + '(DTM1, 1×1 m fra flybåren laserskanning) og er kontrollert mot Kartverket sitt punkt-API.');
    }
    if (har('tomt')) {
      midt.push('Volumene for tomtene er regnet celle for celle på den samme høydemodellen. '
        + 'Skjæringen måles fra den avdekkede flaten, altså etter at matjorda er tatt av.');
    }
    return `<div class="bunn liten">
<b>Hauge Maskin</b> · Beregnet i Massekalk.
${midt.join('\n')}
Terrengmodellen viser terrenget slik det var da området sist ble skannet –
<span class="raud">kontroller mot befaring før kontrahering</span>.
Dybden til fjell er den største usikkerheten i sprengningsvolumet.
</div>`;
  },

  /**
   * Skallet rundt en rapport: hodet, brevhodet og bunnen.
   *
   * Sto skallet inne i hver av de to rapportene, kunne de ikke settes sammen –
   * en prosjektrapport ville fått to `<html>`-tagger og to brevhoder inni
   * hverandre. Nå er skallet ett sted, og `kropp` er det eneste som skiller en
   * vegrapport fra en tomterapport.
   *
   * `valg.seksjon` gjør rapporten til en DEL av noe større: brevhodet blir en
   * overskrift, og hodet og bunnen faller bort. Da kan flere anlegg stå etter
   * hverandre i ett dokument uten at noe gjentas.
   */
  rapportskall(app, valg, kropp) {
    if (valg.seksjon) {
      return `<section class="anleggsdel">
<h1 class="anleggstittel">${valg.seksjon}</h1>
<div class="liten">${valg.hoyre.replace(/<br>/g, ' · ')}</div>
${kropp}
</section>`;
    }
    return `<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8">
<title>${escapeHtml(valg.tittel || 'Masseberegning')} – ${escapeHtml(app.P.navn)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap">
<style>${this.rapportstil()}</style></head><body>
<div class="brevhode">
  <img src="${location.origin}/bilde/hm-logo.png" alt="Hauge Maskin">
  <div>
    <div class="tittel">${escapeHtml(valg.tittel || 'Masseberegning')}</div>
    <div class="under">${valg.under}</div>
  </div>
  <div class="hoyre">
    ${valg.hoyre}
  </div>
</div>
<button class="ikkeSkriv knapp" onclick="window.print()" style="float:right">Skriv ut / lagre som PDF</button>
<div class="liten">Terrengmodell: Kartverket DTM1 (1 m laserdata) · EUREF89 UTM${app.sone}</div>
${kropp}
${this.rapportbunn(valg.typer)}
</body></html>`;
  },

  /* Stilen deles av vegrapporten og tomterapporten. Sto den to steder,
     ville de to drevet fra hverandre - og en tomterapport som ser ut som noe
     annet enn en vegrapport ser ut som den kommer fra et annet program. */
  rapportstil() {
    return `
  body{font-family:"Segoe UI",Arial,sans-serif;color:#0b0b0c;margin:22px;font-size:12px;line-height:1.45}
  .brevhode{display:flex;align-items:center;gap:14px;background:#0b0b0c;color:#fff;
    padding:12px 16px;border-bottom:4px solid #d81e28;margin:-22px -22px 18px}
  .brevhode img{height:36px}
  .brevhode .tittel{font-family:"Barlow Condensed",Arial,sans-serif;font-weight:700;
    text-transform:uppercase;letter-spacing:.04em;font-size:24px;line-height:1.05}
  .brevhode .under{color:#d0d0d5;font-size:11px}
  .brevhode .hoyre{margin-left:auto;text-align:right;color:#d0d0d5;font-size:11px}
  h1{font-size:19px;margin:0} h2{font-family:"Barlow Condensed",Arial,sans-serif;font-size:16px;
    text-transform:uppercase;letter-spacing:.04em;margin:20px 0 6px;
    border-bottom:2px solid #0b0b0c;padding-bottom:3px}
  table{border-collapse:collapse;width:100%;margin-bottom:10px}
  th,td{border:1px solid #d0d0d5;padding:3px 6px;text-align:right;font-variant-numeric:tabular-nums}
  th{background:#0b0b0c;color:#fff;text-align:right;font-weight:600;
    font-family:"Barlow Condensed",Arial,sans-serif;text-transform:uppercase;letter-spacing:.03em}
  td:first-child,th:first-child{text-align:left}
  .sum td{font-weight:700;background:#f4f4f5;border-top:2px solid #0b0b0c}
  .to{display:grid;grid-template-columns:1fr 1fr;gap:22px}
  .noekkel td:first-child{text-align:left;width:64%}
  .liten{font-size:11px;color:#52525b}
  .raud{color:#a8151d;font-weight:700}
  .bunn{margin-top:16px;border-top:3px solid #d81e28;padding-top:8px}
  .tegning{width:100%;border:1px solid #d0d0d5;margin-bottom:6px}
  .tverrsnitt{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .tverrsnitt figure{margin:0}
  .tverrsnitt img{width:100%;border:1px solid #d0d0d5}
  .tverrsnitt figcaption{font-size:10.5px;color:#52525b;padding-top:2px}
  .stikning{font-size:10px}
  .stikning td,.stikning th{padding:2px 4px}
  h2{page-break-after:avoid} .tverrsnitt figure{page-break-inside:avoid}
  table{page-break-inside:auto} tr{page-break-inside:avoid}
  /* Hvert anlegg starter på ny side i en prosjektrapport. Sto to anlegg på
     samme ark, måtte leseren finne skillet selv – og et tall fra feil anlegg
     er en feil ingen oppdager. */
  .anleggsdel{page-break-before:always;margin-top:26px}
  .anleggsdel:first-of-type{page-break-before:auto}
  .anleggstittel{font-family:"Barlow Condensed",Arial,sans-serif;font-size:22px;
    text-transform:uppercase;letter-spacing:.03em;margin:0;
    border-bottom:4px solid #d81e28;padding-bottom:4px}
  .knapp{background:#d81e28;color:#fff;border:2px solid #0b0b0c;box-shadow:3px 3px 0 0 #0b0b0c;
    padding:7px 16px;font-weight:700;text-transform:uppercase;cursor:pointer;font-family:inherit}
  @media print{body{margin:12mm} .ikkeSkriv{display:none} .brevhode{margin:-12mm -12mm 14px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
    th,.sum td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
  },

  /**
   * Åpner html-en i et vindu, eller laster den ned om vinduet blir blokkert.
   *
   * Blokkerer nettleseren nye vinduer, gir window.open null. Da lastes
   * rapporten ned som fil i stedet, så arbeidet ikke bare forsvinner.
   */
  visRapport(html, app) {
    const v = window.open('', '_blank');
    if (v && v.document) { v.document.write(html); v.document.close(); return; }
    this.lastNed(this.filnavn('_rapport.html'), html, 'text/html;charset=utf-8');
    app.status('Nettleseren blokkerte nytt vindu – rapporten ble lastet ned som fil i stedet');
  },

  /**
   * Rapport for en tomt.
   *
   * Samme stil og samme rekkefølge som vegrapporten og sidepanelet: mål, nivå,
   * sider, nøkkeltall, masser, mur, overbygning, massebalanse, merknader.
   */
  apneTomterapport(app, res, valg) {
    const t = (v, d = 0) => this.tall(v, d);
    const s = res.sum, b = res.balanse, m = app.P.mal, tt = app.P.tomt;
    const p = app.tomtIUtm(tt);
    const flate = app._innerflate || p;
    const bf = app.bakkefaktor();
    const dato = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric' });
    const niv = tt.nivaa || {};
    const nivaatekst = niv.modus === 'fall'
      ? `${t(niv.kote, 2)} m med fall ${t((niv.fall || 0) * 100, 1)} % mot ${t(niv.fallretning || 0, 0)}°`
      : niv.modus === 'sluk' ? `${t(niv.kote, 2)} m, faller mot ett punkt`
        : `${t(niv.kote, 2)} m, flatt`;

    const rad = (a, c, sum) => `<tr class="${sum ? 'sum' : ''}"><td>${a}</td><td>${c}</td></tr>`;
    const post = (navn, v, sum) => v > 0.5 ? rad(navn, t(v) + ' m³', sum) : '';

    const sider = Tomt.kanter(flate).map(k => {
      const kant = (tt.kanter || [])[k.nr] || {};
      const type = kant.type || 'skraning';
      const grader = ((90 - k.retning * 180 / Math.PI) % 360 + 360) % 360;
      const hell = type === 'mur' ? '1:' + t(kant.murAnlegg != null ? kant.murAnlegg : m.murAnlegg, 2)
        : type === 'fjellvegg' ? '10:1' : type === 'apen' ? '–' : '1:' + t(m.skjaeringLosmasse, 1);
      return `<tr><td>${k.nr + 1}</td><td>${t(k.lengde * bf, 1)} m</td><td>${t(grader, 0)}°</td>`
        + `<td>${escapeHtml(Tomt.Kanttyper[type] || type)}</td><td>${hell}</td></tr>`;
    }).join('');

    const lag = s.slitelag + s.baerelag + s.forsterkningslag + s.frostsikring + s.avrettingslag;
    const lagrad = (navn, v, tykk) => v > 0.005
      ? rad(navn + (tykk ? ` <small>${t(tykk, 2)} m</small>` : ''), t(v) + ' m³') : '';

    const merknader = (res.merknader || []).map(v =>
      `<tr><td>${escapeHtml(v.type || '–')}</td><td>${escapeHtml(v.tekst)}</td></tr>`).join('');

    const html = this.rapportskall(app, {
      tittel: 'Masseberegning – tomt',
      typer: 'tomt',
      under: escapeHtml(app.P.navn),
      hoyre: `${dato}<br>${t(res.areal)} m² · `
        + `${escapeHtml((Tomt.Arbeidstyper[tt.arbeidstype] || { navn: 'Planering' }).navn)}`
        + `<br>EUREF89 UTM${app.sone} · NN2000`,
      seksjon: valg && valg.seksjon
    }, `

<div class="to">
<div>
<h2>Mål og nivå</h2>
<table class="noekkel"><tbody>
${rad('Areal, ferdig flate', t(res.areal) + ' m²')}
${rad('Areal med skråninger', t(res.arealMedSkraning) + ' m²')}
${rad('Omkrets', t(Tomt.omkrets(flate) * bf, 1) + ' m')}
${rad('Hjørner', String(flate.length))}
${rad('Ferdig nivå (NN2000)', nivaatekst, true)}
${rad('Overbygning over planum', t(res.overbygning, 2) + ' m')}
${rad('Omrisset betyr', tt.omrissBetyr === 'yttergrense'
    ? 'yttergrense – ferdig flate regnet innover' : 'ferdig flate')}
</tbody></table>

<h2>Nøkkeltall</h2>
<table class="noekkel"><tbody>
${rad('Dypeste skjæring', t(res.dypesteSkjaering, 2) + ' m')}
${rad('Høyeste fylling', t(res.hoyesteFylling, 2) + ' m')}
${res.hoyesteVegg > 0.05 ? rad('Høyeste bergvegg', t(res.hoyesteVegg, 2) + ' m') : ''}
${res.rekkevidde > 0 ? rad('Skråningen går lengst ut', t(res.rekkevidde, 1) + ' m') : ''}
${rad('Ruter regnet', String(res.celler) + ` <small>à ${t(m.rutestorrelse, 2)} m</small>`)}
</tbody></table>
</div>

<div>
<h2>Masser – prosjektert fast volum</h2>
<table class="noekkel"><tbody>
${post('Matjord som tas av', s.matjord)}
${post('Rensk mot fjell', s.rensk)}
${post('Skjæring totalt', s.skjaering, true)}
${post('&nbsp;&nbsp;– løsmasse', s.skjaeringLosmasse)}
${post('&nbsp;&nbsp;– fjell (sprengning)', s.skjaeringFjell)}
${post('&nbsp;&nbsp;– overberg', s.overberg)}
${post('Fylling', s.fylling, true)}
</tbody></table>

${res.murLengde > 0.5 ? `<h2>Støttemur</h2>
<table class="noekkel"><tbody>
${rad('Lengde', t(res.murLengde, 1) + ' m')}
${rad('Høyeste punkt', t(res.murHoyde, 2) + ' m')}
${post('Fundamentgrøft', s.murFundament)}
${post('Drenerende bakfylling', s.murBakfylling)}
</tbody></table>` : ''}

${lag > 0.5 ? `<h2>Byggeklart – lag som skal inn</h2>
<table class="noekkel"><tbody>
${lagrad('Frostsikring', s.frostsikring, m.frostsikring)}
${lagrad('Forsterkningslag', s.forsterkningslag, m.forsterkningslag)}
${lagrad('Bærelag', s.baerelag, m.baerelagTykkelse)}
${lagrad('Avretting', s.avrettingslag, m.avrettingslag)}
${lagrad('Slitelag', s.slitelag, m.slitelagTykkelse)}
${rad('Sum overbygning', t(lag) + ' m³', true)}
</tbody></table>` : ''}
</div>
</div>

<h2>Sidene</h2>
<table><thead><tr><th>Side</th><th>Lengde</th><th>Retning</th><th>Behandling</th><th>Helning</th></tr></thead>
<tbody>${sider}</tbody></table>

${b ? `<h2>Massebalanse</h2>
<table class="noekkel"><tbody>
${rad(`Sprengt fjell, løst på lass <small>× ${app.P.faktorer.sprengningsfaktor}</small>`, t(b.fjellSprengtLos) + ' p.a.m³')}
${rad(`Tilgjengelig til fylling <small>fjell × ${app.P.faktorer.fjellIFylling}</small>`, t(b.tilgjengelig) + ' m³')}
${rad('Fyllingsbehov', t(b.fyllingBehov) + ' m³')}
${rad(b.manglerTotalt > 1 ? '<span class="raud">Må kjøres inn</span>' : 'Overskudd',
    t(b.manglerTotalt > 1 ? b.manglerTotalt : Math.abs(b.balanse)) + ' m³', true)}
${rad('Til deponi', t(b.tilDeponi) + ' m³')}
</tbody></table>` : ''}

${merknader ? `<h2>Merknader</h2><table><thead><tr><th>Type</th><th>Merknad</th></tr></thead>
<tbody>${merknader}</tbody></table>` : ''}
`);
    if (valg && valg.seksjon) return html;
    this.visRapport(html, app);
  },

  /* ---------------- Eksport ---------------- */

  /**
   * Kan det eksporteres, og i hvilken form?
   *
   * `if (!res)` er en sannhetskontroll, ikke en formkontroll. Sju eksportknapper
   * og to rapportknapper slapp et TOMTEresultat rett inn i kode som forutsetter
   * `res.profiler`. Utfallet var tre uklassede TypeError-er, tre knapper som
   * gjorde bokstavelig talt ingenting, og – verst – en LandXML-fil på 811 tegn
   * med veglinja fra et tomt veganlegg. En fil som ser ferdig ut er verre enn
   * ingen fil.
   *
   * @returns {{ok:true, form:'veg'|'tomt'}|{ok:false, grunn:string}}
   */
  kanEksportere() {
    const app = this.app, res = app.resultat;
    if (!res) return { ok: false, grunn: 'Ingen beregning ennå – regn ut anlegget først.' };
    if (!app.sone) return { ok: false, grunn: 'Koordinatsonen er ikke satt – tegn anlegget i kartet først.' };
    if (app.erTomt()) {
      /* Stubben som skrives når skråningene ikke får plass innenfor grensa har
         verken rutenett eller celler. Den ville gitt en fil med null på hver
         post, og null ser ut som et svar. */
      if (!res.rutenett || !res.rutenett.length || !res.celler) {
        const m = res.merknader && res.merknader[0];
        return { ok: false, grunn: 'Tomta er ikke ferdig regnet – '
          + (m ? m.tekst : 'sett et ferdig nivå og prøv igjen') };
      }
      /* En stikningsfil for noe som ikke kan bygges er akkurat den filen som
         «ser ferdig ut»: den åpnes i instrumentet uten en eneste innsigelse, og
         punktene står der som om de skulle settes ut. */
      if (res.ubyggelig) {
        return { ok: false, grunn: res.ubyggelig.tekst };
      }
      return { ok: true, form: 'tomt' };
    }
    if (!Array.isArray(res.profiler) || res.profiler.length < 2) {
      return { ok: false, grunn: 'Veglinja har ikke nok profiler til eksport.' };
    }
    if (!app.linje || !app.linje.elementer.length) {
      return { ok: false, grunn: 'Ingen linjeføring – sett minst to knekkpunkt.' };
    }
    return { ok: true, form: 'veg' };
  },

  /**
   * Melder fra der brukeren faktisk står.
   *
   * `alert()` på tre av knappene, en diskret grå statuslinje øverst til høyre på
   * de andre, og ingenting i det hele tatt på de tre som kastet. Nå går alt til
   * samme boks rett under knappene.
   */
  eksportsvar(tekst, feil) {
    const boks = document.getElementById('eksportsvar');
    if (boks) {
      boks.innerHTML = `<div class="${feil ? 'merke-varsel' : ''}">${feil ? '⚠ ' : ''}${escapeHtml(tekst)}</div>`;
    }
    this.app.status((feil ? '⚠ ' : '') + tekst);
  },

  /** Kjører en eksport med vakt, feilmelding og logging på plass. */
  kjorEksport(navn, lag) {
    const kan = this.kanEksportere();
    if (!kan.ok) { this.eksportsvar(kan.grunn, true); return false; }
    try {
      lag(kan.form);
      return true;
    } catch (e) {
      console.error('Eksport «' + navn + '» feilet', e);
      this.eksportsvar(navn + ' kunne ikke skrives: ' + e.message, true);
      return false;
    }
  },

  /** Filnavn uten æøå-massakre – `\W` er ASCII-only uansett flagg. */
  filnavn(ekstra) {
    return Lager.filnavn(this.app.P.navn) + (ekstra || '');
  },

  lastNed(navn, innhold, type = 'text/csv;charset=utf-8') {
    /* Byte order mark hører til CSV-ene: uten den viser Excel æ, ø og å feil.
       Foran GeoJSON knekker den JSON.parse, og foran DXF og SOSI star den i
       veien for lesere som forventer et bestemt første tegn. */
    const csv = /\.csv$/i.test(navn);
    const blob = new Blob([(csv ? '﻿' : '') + innhold], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = navn;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  /* Desimaltegn i CSV.
     Semikolon som skilletegn og PUNKTUM som desimaltegn: norsk Excel leser da
     tallene som tekst, og verre – felt med to desimaler der heltallsdelen er
     1–31 og desimalene 01–12 blir DATOER. 3.05 m³ ble til 3. mai. Skilletegnet
     er riktig; det er desimaltegnet som er feil. */
  n(v, des) {
    return Number.isFinite(v) ? v.toFixed(des).replace('.', ',') : '';
  },

  /** To linjer som sier hva filen inneholder, hvilket system og hvilken høyde. */
  csvHode(app, ekstra) {
    const na = new Date().toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
    const rader = [`# Massekalk ${na} · ${String(app.P.navn).replace(/[\r\n;]+/g, ' ')} · `
      + `EUREF89 UTM${app.sone} (EPSG:${Geo.epsg(app.sone)}) · høyder NN2000`];
    if (ekstra) rader.push('# ' + ekstra);
    return rader;
  },

  /**
   * Stikningsradene for en veg – uten filhode, så de kan stables i en samlefil.
   *
   * @returns {{merknad:string, overskrift:string, rader:Array<string>, svar:string}}
   */
  stikningRaderVeg(app, res) {
    const ob = (res.mal.slitelagTykkelse || 0) + (res.mal.baerelagTykkelse || 0);
    const rader = [];
    /* Samme kilde som rapporten og de andre eksportene bruker. Tidligere ble
       vegkanthøyden regnet rett fra mal.tverrfall her, som ga samme høyde pa
       begge sider - galt bade ved ensidig fall, ved egne tverrfall og i
       kurver som doseres. */
    for (const r of Eksport.punkter(app, res)) {
      rader.push([
        this.n(r.s, 2), this.n(r.senter.n, 3), this.n(r.senter.o, 3), this.n(r.senter.z, 3),
        this.n(r.terreng, 3),
        this.n(r.venstre.n, 3), this.n(r.venstre.o, 3), this.n(r.venstre.z, 3),
        this.n(r.hoyre.n, 3), this.n(r.hoyre.o, 3), this.n(r.hoyre.z, 3)
      ].join(';'));
    }
    return {
      merknad: `Z_veg og VK_z/HK_z er FERDIG vegnivå. Planum ligger ${this.n(ob, 2)} m under.`,
      overskrift: 'Profil;Nord;Ost;Z_veg;Z_terreng;VK_nord;VK_ost;VK_z;HK_nord;HK_ost;HK_z',
      rader,
      svar: 'stikningsdata for ' + res.profiler.length + ' profiler'
    };
  },

  eksportStikning() {
    this.kjorEksport('Stikningsdata', form => {
      const app = this.app, res = app.resultat;
      if (form === 'tomt') return this.eksportStikningTomt(app, res);
      const d = this.stikningRaderVeg(app, res);
      const rader = this.csvHode(app, d.merknad);
      rader.push(d.overskrift);
      for (const r of d.rader) rader.push(r);
      this.lastNed(this.filnavn('_stikning.csv'), rader.join('\r\n'));
      this.eksportsvar('Skrev ' + d.svar);
    });
  },

  /** Stikningsradene for en tomt – uten filhode, så de kan stables i en samlefil. */
  stikningRaderTomt(app, res) {
    const d = Eksport.tomtpunkter(app, res);
    const rader = [];
    const rad = (n, t, k, y, x, zf, zp, zt, m) => rader.push(
      [n, t, k == null ? '' : k, this.n(y, 3), this.n(x, 3),
        this.n(zf, 3), this.n(zp, 3), this.n(zt, 3), m || ''].join(';'));

    for (const h of d.hjorner) {
      rad('F' + String(h.nr).padStart(2, '0'), 'hjorne', null, h.y, h.x, h.zFerdig, h.zPlanum, null, '');
    }
    if (d.erYttergrense) {
      const tp = Tomt.tyngdepunkt(d.flate);
      for (const g of d.grense) {
        const naer = Tomtmasser.naermestePaOmriss(d.flate, g.x, g.y);
        rad('G' + String(g.nr).padStart(2, '0'), 'grense', null, g.y, g.x, null,
          Tomtmasser.nivaaVed(d.nivaa, naer.x, naer.y, tp) - d.ob, null, '');
      }
    }
    let k = 0;
    for (const f of d.fot) {
      if (f.type === 'apen') continue;
      const m = f.moterGrense ? 'kuttet i tomtegrensa'
        : f.iLufta ? 'landet ikke – henger i lufta'
          : f.manglerData ? 'terrengdataene tok slutt' : '';
      if (f.traff !== true) { rad('–', f.type, f.kant + 1, f.y, f.x, null, null, null, m); continue; }
      rad('U' + String(++k).padStart(4, '0'),
        f.type === 'skjaering' ? 'skjaeringstopp' : 'fyllingsfot',
        f.kant + 1, f.y, f.x, null, null, f.z, m);
    }
    for (const m of Eksport.murpunkter(d)) {
      rad(m.navn, m.kode.toLowerCase(), null, m.y, m.x, null, null, m.z, '');
    }
    return {
      merknad: 'Z_ferdig er overflaten det kjøres på. Z_planum ligger '
        + this.n(d.ob, 2) + ' m under (overbygningen). Utslagspunkt uten Z_terreng er '
        + 'punkt der skråningen ikke landet – de er utelatt, ikke satt til null.',
      foran: d.erYttergrense
        ? ['# Omrisset er tegnet som YTTERGRENSE: G-punktene er tomtegrensa, '
          + 'F/P-punktene er den ferdige flaten innenfor.'] : [],
      overskrift: 'Punkt;Type;Kant;Nord_m;Ost_m;Z_ferdig;Z_planum;Z_terreng;Merknad',
      rader,
      svar: rader.length + ' stikningspunkt for tomta'
    };
  },

  eksportStikningTomt(app, res) {
    const d = this.stikningRaderTomt(app, res);
    const rader = this.csvHode(app, d.merknad).concat(d.foran, [d.overskrift], d.rader);
    this.lastNed(this.filnavn('_stikning.csv'), rader.join('\r\n'));
    this.eksportsvar('Skrev ' + d.svar);
  },

  /** Masseradene for en veg – uten filhode, så de kan stables i en samlefil. */
  masseRaderVeg(app, res) {
    const rader = [];
    res.profiler.forEach((p, i) => {
      const iv = res.intervaller[i];
      rader.push([
        this.n(p.s, 2), iv ? this.n(iv.lengde, 2) : '',
        isFinite(p.radius) ? this.n(p.radius, 1) : '', this.n(p.utvidelse, 2),
        this.n(p.vegnivaa, 3), this.n(p.terrengSenter, 3), this.n(p.fjelldybde, 2),
        this.n(p.areal.skjaering, 2), this.n(p.areal.skjaeringFjell, 2),
        this.n(p.areal.fylling, 2), this.n(p.areal.rensk, 2),
        iv ? this.n(iv.volum.skjaering, 2) : '', iv ? this.n(iv.volum.skjaeringFjell, 2) : '',
        iv ? this.n(iv.volum.fylling, 2) : '', iv ? this.n(iv.volum.rensk, 2) : '',
        iv ? this.n(iv.volum.baerelag, 2) : '', iv ? this.n(iv.volum.slitelag, 2) : ''
      ].join(';'));
    });
    return {
      merknad: 'A-kolonnene er uvektet tverrsnittsareal. '
        + 'V-kolonnene er kurvevektet volum (Pappus) og er derfor ikke A × lengde i kurver.',
      foran: [],
      overskrift: 'Profil;Lengde_til_neste;Radius;Breddeutvidelse;Z_veg;Z_terreng;Fjelldybde;'
        + 'A_skjaering_m2;A_skjaering_fjell_m2;A_fylling_m2;A_rensk_m2;'
        + 'V_skjaering_m3;V_fjell_m3;V_fylling_m3;V_rensk_m3;V_baerelag_m3;V_slitelag_m3',
      rader,
      svar: 'masseoppsett for ' + res.profiler.length + ' profiler'
    };
  },

  eksportMasser() {
    this.kjorEksport('Masseoppsett', form => {
      const app = this.app, res = app.resultat;
      if (form === 'tomt') return this.eksportMasserTomt(app, res);
      const d = this.masseRaderVeg(app, res);
      const rader = this.csvHode(app, d.merknad).concat([d.overskrift], d.rader);
      this.lastNed(this.filnavn('_masser.csv'), rader.join('\r\n'));
      this.eksportsvar('Skrev ' + d.svar);
    });
  },

  /** Massesammendrag for en tomt. Det finnes ingen profiler å dele opp etter. */
  masseRaderTomt(app, res) {
    const s = res.sum, b = res.balanse || {}, m = app.P.mal, t = app.P.tomt;
    const rader = [];
    const post = (navn, v, merk) => {
      if (!(v > 0.005)) return;
      rader.push([navn, this.n(v, 1), merk || ''].join(';'));
    };
    post('Matjord (avdekking)', s.matjord, 'mellomlagres ofte på tomta');
    post('Rensk mot fjell', s.rensk, 'siste laget av bergflaten');
    post('Skjæring totalt', s.skjaering);
    post('Skjæring, løsmasse', s.skjaeringLosmasse, 'rensk er trukket ut');
    post('Skjæring, fjell', s.skjaeringFjell, 'sprengning');
    post('Overberg', s.overberg, 'egen post – ikke bakt inn i fjellvolumet (R761 prosess 22.1)');
    post('Fylling', s.fylling);
    post('Frostsikring', s.frostsikring);
    post('Forsterkningslag', s.forsterkningslag);
    post('Bærelag', s.baerelag);
    post('Avrettingslag', s.avrettingslag);
    post('Slitelag', s.slitelag);
    post('Murfundament', s.murFundament, 'grøft under muren');
    post('Drenerende bakfylling', s.murBakfylling, 'kjøpes – må være drenerende');

    rader.push('');
    rader.push('Nøkkeltall;Verdi;Enhet');
    const tall = (navn, v, enhet) => rader.push([navn, this.n(v, 2), enhet || ''].join(';'));
    tall('Areal, ferdig flate', res.areal, 'm2');
    tall('Areal inkl. skråninger', res.arealMedSkraning, 'm2');
    tall('Omkrets', Tomt.omkrets(app.tomtIUtm(t)), 'm');
    rader.push(['Ferdig kote', this.n(t.nivaa.kote, 2),
      'm NN2000 – ' + (Tomt.Nivaamoduser[t.nivaa.modus] || t.nivaa.modus)].join(';'));
    tall('Overbygningstykkelse', res.overbygning, 'm');
    tall('Dypeste skjæring', res.dypesteSkjaering, 'm');
    tall('Høyeste fylling', res.hoyesteFylling, 'm');
    if (res.hoyesteVegg > 0.05) tall('Høyeste bergvegg', res.hoyesteVegg, 'm');
    tall('Skråningsutslag, største', res.rekkevidde, 'm');

    if (b.tilgjengelig != null) {
      rader.push('');
      rader.push('Massebalanse;Volum_m3');
      const bal = (navn, v) => rader.push([navn, this.n(v, 1)].join(';'));
      bal('Sprengt fjell, løst på lass', b.fjellSprengtLos);
      bal('Tilgjengelig til fylling', b.tilgjengelig);
      bal('Fyllingsbehov', b.fyllingBehov);
      bal('Balanse', b.balanse);
      if (b.manglerTotalt > 1) bal('Må kjøres inn', b.manglerTotalt);
      bal('Til deponi', b.tilDeponi);
    }
    if (res.merknader && res.merknader.length) {
      rader.push('');
      rader.push('Merknader');
      for (const q of res.merknader) rader.push(String(q.tekst).replace(/[\r\n;]+/g, ' '));
    }
    return {
      merknad: `rutestørrelse ${this.n(m.rutestorrelse, 2)} m · `
        + `${res.celler} celler · alle volum i prosjektert fast masse (p.f.m³)`,
      foran: [],
      overskrift: 'Post;Volum_m3;Merknad',
      rader,
      svar: 'massesammendrag for tomta'
    };
  },

  eksportMasserTomt(app, res) {
    const d = this.masseRaderTomt(app, res);
    const rader = this.csvHode(app, d.merknad).concat([d.overskrift], d.rader);
    this.lastNed(this.filnavn('_massesammendrag.csv'), rader.join('\r\n'));
    this.eksportsvar('Skrev ' + d.svar);
  },

  /** Rutenettradene for en tomt – uten filhode, så de kan stables i en samlefil. */
  rutenettRader(app, res) {
    const rader = [];
    for (const c of res.rutenett) {
      rader.push([this.n(c.y, 3), this.n(c.x, 3), c.inne ? 'ja' : 'nei',
        this.n(c.zT, 3), this.n(c.zAvdekket, 3), this.n(c.zPlanum, 3),
        c.zFerdig == null ? '' : this.n(c.zFerdig, 3),
        this.n(c.matjord, 3),
        c.d > 0 ? this.n(c.d, 3) : '', c.d < 0 ? this.n(-c.d, 3) : '',
        this.n(c.fjellDel, 3)].join(';'));
    }
    return {
      merknad: 'Gravedybde måles fra Z_avdekket, altså etter at matjorda er tatt av '
        + '– ikke fra naturlig terreng. Z_ferdig står tomt utenfor tomta.',
      foran: [],
      overskrift: 'Nord_m;Ost_m;Innenfor;Z_terreng;Z_avdekket;Z_planum;Z_ferdig;'
        + 'Matjord_m;Gravedybde_m;Fylling_m;Fjelldel_m',
      rader,
      svar: res.rutenett.length + ' ruter'
    };
  },

  /** Rutenettet som CSV. Egen knapp – det er tusenvis av rader. */
  eksportRutenett() {
    this.kjorEksport('Rutenett', form => {
      const app = this.app, res = app.resultat;
      if (form !== 'tomt') throw new Error('Rutenettet finnes bare for en tomt');
      const d = this.rutenettRader(app, res);
      const rader = this.csvHode(app, d.merknad).concat([d.overskrift], d.rader);
      this.lastNed(this.filnavn('_rutenett.csv'), rader.join('\r\n'));
      this.eksportsvar('Skrev ' + d.svar);
    });
  },

  /** Eksport til de andre filformatene. */
  eksporter(format) {
    const navn = { kof: 'KOF', landxml: 'LandXML', sosi: 'SOSI', dxf: 'DXF' }[format];
    if (!navn) return;
    this.kjorEksport(navn, form => {
      const app = this.app, res = app.resultat;
      const tomt = form === 'tomt';
      const oppsett = {
        kof: ['.KOF', () => tomt ? Eksport.kofTomt(app, res) : Eksport.kof(app, res), 'text/plain;charset=utf-8'],
        /* Aldri <Alignment> for en tomt. Her ble veglinja fra det tomme
           veganlegget skrevet ut i stedet – en velformet fil som åpnet uten
           innsigelser og inneholdt null meter av det brukeren regnet på. */
        landxml: ['.xml', () => tomt ? Eksport.landxmlTomt(app, res) : Eksport.landxml(app, res), 'application/xml;charset=utf-8'],
        sosi: ['.sos', () => tomt ? Eksport.sosiTomt(app, res) : Eksport.sosi(app, res), 'text/plain;charset=utf-8'],
        dxf: ['.dxf', () => tomt ? Eksport.dxfTomt(app, res) : Eksport.dxf(app, res), 'application/dxf']
      }[format];
      const [endelse, lag, type] = oppsett;
      const innhold = lag();
      this.lastNed(this.filnavn(endelse), innhold, type);
      this.eksportsvar('Eksporterte ' + this.filnavn(endelse)
        + ' (' + Math.round(innhold.length / 1024) + ' kB)');
    });
  },

  eksportGeojson() {
    this.kjorEksport('GeoJSON', form => {
      const app = this.app, res = app.resultat;
      const geo = form === 'tomt' ? this.geojsonTomt(app, res) : this.geojsonVeg(app, res);
      this.lastNed(this.filnavn('.geojson'), JSON.stringify(geo, null, 1), 'application/geo+json');
      this.eksportsvar('Skrev ' + geo.features.length + ' objekter til GeoJSON');
    });
  },

  geojsonVeg(app, res) {
    const ll = q => { const g = Geo.fraUtm(q.x, q.y, app.sone); return [+g.lon.toFixed(8), +g.lat.toFixed(8)]; };
    const senter = res.profiler.map(p => ll({ x: p.x, y: p.y }));
    const venstre = res.profiler.map(p => ll(app.linje.punktMedAvvik(p.s, p.fotVenstre)));
    const hoyre = res.profiler.map(p => ll(app.linje.punktMedAvvik(p.s, p.fotHoyre)));
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { navn: app.P.navn, type: 'senterlinje', lengde: +res.lengde.toFixed(2) }, geometry: { type: 'LineString', coordinates: senter } },
        { type: 'Feature', properties: { type: 'fotavtrykk' }, geometry: { type: 'Polygon', coordinates: [venstre.concat(hoyre.slice().reverse(), [venstre[0]])] } },
        ...app.P.fjell.punkter.map(p => ({ type: 'Feature', properties: { type: 'fjellobservasjon', dybde: p.dybde }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))
      ]
    };
  },

  geojsonTomt(app, res) {
    const d = Eksport.tomtpunkter(app, res);
    const t = app.P.tomt;
    const ll = q => { const g = Geo.fraUtm(q.x, q.y, app.sone); return [+g.lon.toFixed(8), +g.lat.toFixed(8)]; };
    const llz = (q, z) => { const c = ll(q); return Number.isFinite(z) ? [c[0], c[1], +z.toFixed(3)] : c; };
    const ring = p => p.map(ll).concat([ll(p[0])]);
    const f = [];
    f.push({
      type: 'Feature',
      properties: {
        type: 'ferdig_flate', navn: app.P.navn,
        areal_m2: +res.areal.toFixed(1), omkrets_m: +Tomt.omkrets(d.flate).toFixed(1),
        kote: t.nivaa.kote, nivaamodus: t.nivaa.modus,
        fall: t.nivaa.fall || 0, fallretning: t.nivaa.fallretning || 0,
        overbygning_m: +d.ob.toFixed(3), hoydereferanse: 'NN2000'
      },
      geometry: { type: 'Polygon', coordinates: [ring(d.flate)] }
    });
    if (d.erYttergrense) {
      f.push({
        type: 'Feature',
        properties: { type: 'tomtegrense', omrissBetyr: 'yttergrense',
          merknad: 'Ingenting er regnet utenfor denne linja' },
        geometry: { type: 'Polygon', coordinates: [ring(d.omriss)] }
      });
    }
    /* Utslaget som en FLATE bare når foten er kjent hele veien rundt. Et
       Polygon er et løfte om en lukket grense; er en del av foten kuttet, må
       de kjente bitene leveres som linjer med `komplett: false`. */
    const komplett = Eksport.fotErKomplett(d.fot);
    if (komplett) {
      f.push({
        type: 'Feature',
        properties: { type: 'utslag', komplett: true,
          arealMedSkraning_m2: +res.arealMedSkraning.toFixed(1),
          rekkevidde_m: +(res.rekkevidde || 0).toFixed(1), hoydereferanse: 'NN2000' },
        geometry: { type: 'Polygon', coordinates: [ring(d.fot.filter(q => q.type !== 'apen'))] }
      });
    } else {
      for (const s of Eksport.fotstrekk(d.fot)) {
        f.push({
          type: 'Feature',
          properties: { type: 'utslag', undertype: s.type, komplett: false,
            merknad: 'Skråningen landet ikke hele veien rundt', hoydereferanse: 'NN2000' },
          geometry: { type: 'LineString', coordinates: s.punkt.map(q => llz(q, q.z)) }
        });
      }
    }
    for (const k of d.kanter) {
      const a = d.flate[k.nr], b = d.flate[(k.nr + 1) % d.flate.length];
      if (!a || !b) continue;
      f.push({
        type: 'Feature',
        properties: { type: 'kant', nr: k.nr + 1, kanttype: k.type || 'skraning',
          behandling: Tomt.Kanttyper[k.type || 'skraning'],
          lengde_m: +k.lengde.toFixed(2),
          retning_grader: +(((90 - k.retning * 180 / Math.PI) % 360 + 360) % 360).toFixed(0) },
        geometry: { type: 'LineString', coordinates: [ll(a), ll(b)] }
      });
    }
    for (const h of d.hjorner) {
      f.push({
        type: 'Feature',
        properties: { type: 'hjorne', nr: h.nr, z_ferdig: +h.zFerdig.toFixed(3),
          z_planum: +h.zPlanum.toFixed(3), hoydereferanse: 'NN2000' },
        geometry: { type: 'Point', coordinates: llz(h, h.zFerdig) }
      });
    }
    for (const p of app.P.fjell.punkter) {
      f.push({ type: 'Feature', properties: { type: 'fjellobservasjon', dybde: p.dybde },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] } });
    }
    return { type: 'FeatureCollection', features: f };
  },

  /* ================================================================
     SAMLEEKSPORT – alle anlegg i ÉN fil

     Et prosjekt med to tomter og en veg er tre modeller som skal bygges av
     samme lag, på samme plass, i samme koordinatsystem. Tre separate filer per
     format er tre importer der én kan glippe, og der ingenting sier at de hører
     sammen. En samlefil har ETT koordinatsystem, og modellene kan ikke havne i
     hver sin projeksjon ved et uhell.

     PRISEN ER AT PROGRAMMET MÅ INNOM HVERT ANLEGG.
     `app.linje`, `app.vprofil`, `app.resultat` og `app._innerflate` hører alle
     til det aktive anlegget. Det finnes ingen vei utenom å bytte til hvert av
     dem og vente på at beregningen blir ferdig – terrenget må kanskje lastes
     ned først. Derfor er dette den ene eksporten som er asynkron, og den ene
     som viser framdrift.
     ================================================================ */

  /**
   * Venter til det aktive anlegget har et ferdig resultat, eller til det tar
   * for lang tid.
   *
   * @param {number} [frist] hvor lenge det er verdt å vente, i millisekunder
   * @param {string} [ventetId] hvilket anlegg resultatet SKAL gjelde.
   *   Uten den svarte den på at `app.resultat` var sant, uansett hvem det
   *   tilhørte. To runder gjennom anleggene som overlapper – en samleeksport
   *   og et «full detalj» – kunne da gi den ene et resultat som hørte til den
   *   andres anlegg, og modellen ble skrevet under feil navn. Det er den samme
   *   stille feilen vakten i `App.beregn()` finnes for å hindre, bare på
   *   leserens side.
   */
  ventPaaResultat(frist = 45000, ventetId) {
    const app = this.app;
    const start = Date.now();
    return new Promise((los, avvis) => {
      const sjekk = () => {
        if (ventetId != null && app.P && app.P.aktivt !== ventetId) {
          return avvis(new Error('anlegget ble byttet mens beregningen gikk'));
        }
        if (app.resultat) return los(app.resultat);
        if (Date.now() - start > frist) {
          return avvis(new Error('beregningen ble ikke ferdig på '
            + Math.round(frist / 1000) + ' sekunder'));
        }
        setTimeout(sjekk, 120);
      };
      sjekk();
    });
  },

  /**
   * Går gjennom hvert anlegg i prosjektet og henter bidraget til én samlefil.
   *
   * `hent(app, res, anlegg, i)` kalles én gang per anlegg, mens NETTOPP det
   * anlegget er aktivt. Kaster den, står anlegget over – men det blir sagt fra
   * om hvilket og hvorfor. Et anlegg som stilltiende ble utelatt er den verste
   * utgangen av alle: filen ser komplett ut, og at tomta mangler oppdages på
   * plassen.
   */
  async gjennomAlleAnlegg(hent) {
    const app = this.app;
    const P = app.P;
    const foer = P.aktivt;
    const anlegg = P.anlegg.slice();
    const tatt = [], hoppet = [];
    /* Autolagring midt i en runde ville lagret prosjektet med et annet aktivt
       anlegg enn brukeren står i. */
    app.autolagringPause = (app.autolagringPause || 0) + 1;
    try {
      for (let i = 0; i < anlegg.length; i++) {
        const a = anlegg[i];
        this.eksportsvar(`Henter ${i + 1} av ${anlegg.length}: ${a.navn || a.type} …`);
        try {
          if (P.aktivt !== a.id) app.byttAnlegg(a.id);
          const res = await this.ventPaaResultat(45000, a.id);
          const kan = this.kanEksportere();
          if (!kan.ok) throw new Error(kan.grunn);
          const bit = await hent(app, res, a, tatt.length);
          if (bit == null) throw new Error('ingenting å skrive');
          tatt.push({ anlegg: a, bit });
        } catch (e) {
          hoppet.push({ anlegg: a, grunn: e.message });
        }
      }
    } finally {
      app.autolagringPause--;
      if (P.aktivt !== foer) {
        app.byttAnlegg(foer);
        try { await this.ventPaaResultat(); } catch (e) { /* brukeren ser status selv */ }
      }
    }
    return { tatt, hoppet };
  },

  /** Sier fra om hva som kom med og hva som ikke gjorde det – aldri bare det første. */
  samlesvar(navn, filnavn, kb, tatt, hoppet) {
    const deler = [`${navn}: ${tatt.length} av ${tatt.length + hoppet.length} anlegg`
      + ` i ${filnavn} (${kb} kB)`];
    if (hoppet.length) {
      deler.push('Ikke med: ' + hoppet
        .map(h => `${h.anlegg.navn || h.anlegg.type} (${h.grunn})`).join('; '));
    }
    this.eksportsvar(deler.join(' · '), hoppet.length > 0);
  },

  /** Kortnavn foran punktnavn og lag: A, B, C … så to modeller aldri kolliderer. */
  anleggskode(i) { return String.fromCharCode(65 + (i % 26)); },

  /**
   * Rapport for HELE prosjektet: sammendraget først, så hvert anlegg for seg.
   *
   * SAMMENDRAGET FØRST ER IKKE EN PYNTEDETALJ.
   * Det er det tallet en pris settes på, og det står ingen andre steder enn i
   * topplinja på skjermen. En rapport som begynner med det første anlegget og
   * lar leseren legge sammen selv, er en rapport der summen aldri blir sjekket.
   *
   * Anlegg som ikke er regnet ferdig kommer med i tabellen med en tom sum og en
   * merknad – ikke som en rad som mangler. En rad som ikke er der, er en rad
   * ingen leter etter.
   */
  async apneProsjektrapport() {
    const app = this.app;
    if (!app.P || app.P.anlegg.length < 2) return this.apneRapport();
    if (this._samlerNa) { this.eksportsvar('En samleeksport er allerede i gang', true); return; }
    this._samlerNa = true;
    try {
      const t = v => this.tall(v);
      const { tatt, hoppet } = await this.gjennomAlleAnlegg((a2, res, anl, i) => {
        const html = this.apneRapport({
          seksjon: this.anleggskode(i) + ' · ' + escapeHtml(anl.navn || anl.type)
        });
        if (!html) return null;
        return { html, navn: anl.navn || anl.type, type: anl.type, sum: res.sum,
          balanse: res.balanse || {}, kode: this.anleggskode(i) };
      });
      if (!tatt.length) {
        this.eksportsvar('Ingen av anleggene kunne rapporteres – '
          + hoppet.map(h => (h.anlegg.navn || h.anlegg.type) + ': ' + h.grunn).join('; '), true);
        return;
      }
      const sum = app.prosjektsum() || {};
      const dato = new Date().toLocaleDateString('nb-NO',
        { day: '2-digit', month: 'long', year: 'numeric' });
      const rad = b => `<tr><td>${b.kode} · ${escapeHtml(b.navn)}</td><td>${b.type}</td>`
        + `<td>${t(b.sum.skjaering)}</td><td>${t(b.sum.skjaeringFjell)}</td>`
        + `<td>${t(b.sum.fylling)}</td></tr>`;
      /* Anlegg som ikke kom med står i tabellen med grunnen sin. Å utelate dem
         ville gjort rapporten til en påstand om at prosjektet består av de
         anleggene som tilfeldigvis lot seg regne. */
      const utelatt = hoppet.map(h => `<tr class="liten"><td>${escapeHtml(h.anlegg.navn
        || h.anlegg.type)}</td><td>${h.anlegg.type}</td><td colspan="3">`
        + `<span class="raud">ikke regnet</span> – ${escapeHtml(h.grunn)}</td></tr>`).join('');
      const kropp = `
<h2>Hele prosjektet</h2>
<table><thead><tr><th>Anlegg</th><th>Type</th><th>Skjæring m³</th>
<th>Sprengning m³</th><th>Fylling m³</th></tr></thead><tbody>
${tatt.map(x => rad(x.bit)).join('')}
${utelatt}
<tr class="sum"><td>Sum</td><td>${tatt.length} anlegg</td><td>${t(sum.skjaering)}</td>
<td>${t(sum.skjaeringFjell)}</td><td>${t(sum.fylling)}</td></tr>
</tbody></table>
<div class="liten">${sum.manglerTotalt > 1
    ? `<span class="raud">Må kjøres inn: ${t(sum.manglerTotalt)} m³</span> · `
    : ''}Til deponi: ${t(sum.tilDeponi)} m³${sum.gamle
    ? ` · ${sum.gamle} anlegg er regnet under andre forutsetninger og teller ikke med i summen`
    : ''}</div>
${tatt.map(x => x.bit.html).join('\n')}`;
      const typer = [...new Set(tatt.map(x => x.bit.type))];
      const html = this.rapportskall(app, {
        tittel: 'Masseberegning – prosjekt',
        typer,
        under: escapeHtml(app.P.navn),
        hoyre: `${dato}<br>${tatt.length} anlegg<br>EUREF89 UTM${app.sone} · NN2000`
      }, kropp);
      this.visRapport(html, app);
      this.eksportsvar('Rapport for ' + tatt.length + ' av '
        + (tatt.length + hoppet.length) + ' anlegg', hoppet.length > 0);
    } catch (e) {
      console.error('Prosjektrapporten feilet', e);
      this.eksportsvar('Prosjektrapporten feilet: ' + e.message, true);
    } finally {
      this._samlerNa = false;
    }
  },

  /**
   * CSV for alle anleggene: én blokk per anlegg, hver med sin egen overskrift.
   *
   * EN VEGTABELL OG EN TOMTETABELL ER IKKE DEN SAMME TABELLEN.
   * Vegen har profil, radius og tverrsnittsareal; tomta har poster og volum.
   * Å presse dem sammen til én overskriftsrad ville gitt tjue kolonner der
   * halvparten alltid står tomme – og en tom kolonne ser ut som en verdi noen
   * har glemt å fylle ut. Derfor får hvert anlegg sin egen blokk, med en
   * kommentarlinje som sier hvilket anlegg blokken hører til. Regnearket leser
   * det som flere tabeller under hverandre, som er nøyaktig det det er.
   *
   * @param {string} hva 'stikning' eller 'masser'
   */
  async eksporterCsvAlle(hva) {
    const app = this.app;
    if (!app.P || app.P.anlegg.length < 2) {
      return hva === 'rutenett' ? this.eksportRutenett()
        : hva === 'stikning' ? this.eksportStikning() : this.eksportMasser();
    }
    if (this._samlerNa) { this.eksportsvar('En samleeksport er allerede i gang', true); return; }
    this._samlerNa = true;
    try {
      const navn = { stikning: 'Stikningsdata', masser: 'Masseoppsett', rutenett: 'Rutenett' }[hva];
      const { tatt, hoppet } = await this.gjennomAlleAnlegg((a2, res, anl) => {
        const tomt = a2.erTomt();
        if (hva === 'rutenett' && !tomt) throw new Error('rutenettet finnes bare for en tomt');
        const d = hva === 'rutenett' ? this.rutenettRader(a2, res)
          : hva === 'stikning'
            ? (tomt ? this.stikningRaderTomt(a2, res) : this.stikningRaderVeg(a2, res))
            : (tomt ? this.masseRaderTomt(a2, res) : this.masseRaderVeg(a2, res));
        if (!d.rader.length) return null;
        return Object.assign({ anleggsnavn: anl.navn || anl.type, anleggstype: anl.type }, d);
      });
      if (!tatt.length) {
        this.eksportsvar(navn + ': ingen av anleggene kunne skrives – '
          + hoppet.map(h => (h.anlegg.navn || h.anlegg.type) + ': ' + h.grunn).join('; '), true);
        return;
      }
      const rader = this.csvHode(app, 'Ett avsnitt per anlegg. Hvert avsnitt har sin '
        + 'egen overskriftsrad, fordi en veg og en tomt ikke har de samme kolonnene.');
      for (const t of tatt) {
        const b = t.bit;
        rader.push('');
        rader.push('# ANLEGG: ' + String(b.anleggsnavn).replace(/[\r\n;]+/g, ' ')
          + ' (' + b.anleggstype + ')');
        rader.push('# ' + String(b.merknad).replace(/[\r\n;]+/g, ' '));
        for (const f of (b.foran || [])) rader.push(f);
        rader.push(b.overskrift);
        for (const r of b.rader) rader.push(r);
      }
      const fil = this.filnavn('_alle_' + hva + '.csv');
      const innhold = rader.join('\r\n');
      this.lastNed(fil, innhold);
      this.samlesvar(navn, fil, Math.round(innhold.length / 1024), tatt, hoppet);
    } catch (e) {
      console.error('Samle-CSV «' + hva + '» feilet', e);
      this.eksportsvar('Samleeksporten feilet: ' + e.message, true);
    } finally {
      this._samlerNa = false;
    }
  },

  /**
   * Samleeksporten. Ett format, alle anlegg, én fil.
   *
   * Hvert format har sin egen måte å bære flere modeller på – KOF har prefiks
   * på punktnavnet, LandXML har flere <Alignment> og <Surface>, SOSI har
   * løpende objektnummer, DXF har lagnavn. Derfor er sammensyingen skrevet per
   * format, mens rundgangen mellom anleggene er felles.
   */
  async eksporterAlle(format) {
    const app = this.app;
    if (!app.P || app.P.anlegg.length < 2) {
      // ett anlegg: samlefilen ER enkeltfilen, og da er den vanlige veien riktig
      if (format === 'geojson') return this.eksportGeojson();
      return this.eksporter(format);
    }
    if (this._samlerNa) { this.eksportsvar('En samleeksport er allerede i gang', true); return; }
    this._samlerNa = true;
    try {
      const oppsett = {
        kof: ['.KOF', 'KOF', 'text/plain;charset=utf-8'],
        landxml: ['.xml', 'LandXML', 'application/xml;charset=utf-8'],
        sosi: ['.sos', 'SOSI', 'text/plain;charset=utf-8'],
        dxf: ['.dxf', 'DXF', 'application/dxf'],
        geojson: ['.geojson', 'GeoJSON', 'application/geo+json']
      }[format];
      if (!oppsett) return;
      const [endelse, navn, mime] = oppsett;

      /* Tilstanden som må leve på tvers av anleggene. KOF-navnegiveren eier
         settet med brukte punktnavn for HELE filen, og SOSI-telleren eier
         objektnummeret – begge må derfor lages her, ikke per anlegg. */
      const navner = format === 'kof' ? Eksport.kofNavner() : null;
      let sosiId = 1;
      const sosiOmr = { minN: Infinity, maksN: -Infinity, minO: Infinity, maksO: -Infinity };
      let sosiNiva = 2;

      const { tatt, hoppet } = await this.gjennomAlleAnlegg((a2, res, anl, i) => {
        const tomt = a2.erTomt();
        const merke = this.anleggskode(i);
        const anleggsnavn = anl.navn || (tomt ? 'Tomt' : 'Veg');
        if (format === 'kof') {
          const pre = merke;
          const d = tomt ? Eksport.tomtpunkter(a2, res) : null;
          const rader = tomt
            ? Eksport.kofKroppTomt(a2, res, b => navner(pre + b), d)
            : Eksport.kofKroppVeg(a2, res, b => navner(pre + b));
          if (!rader.length) return null;
          return { rader, merknader: tomt ? Eksport.kofMerknaderTomt(d) : [], merke, anleggsnavn };
        }
        if (format === 'landxml') {
          return tomt
            ? Object.assign({ anleggsnavn },
              Eksport.landxmlDelerTomt(a2, res, anleggsnavn + ' – '))
            : { alignment: Eksport.landxmlAlignment(a2, res, anleggsnavn), anleggsnavn };
        }
        if (format === 'sosi') {
          const d = tomt
            ? Eksport.sosiDelerTomt(a2, res, sosiId, anleggsnavn)
            : Eksport.sosiDelerVeg(a2, res, sosiId, anleggsnavn);
          sosiId = d.nesteId;
          sosiNiva = Math.max(sosiNiva, d.niva);
          sosiOmr.minN = Math.min(sosiOmr.minN, d.omr.minN);
          sosiOmr.maksN = Math.max(sosiOmr.maksN, d.omr.maksN);
          sosiOmr.minO = Math.min(sosiOmr.minO, d.omr.minO);
          sosiOmr.maksO = Math.max(sosiOmr.maksO, d.omr.maksO);
          return d;
        }
        if (format === 'dxf') {
          const pre = Eksport.dxfLagpre(anleggsnavn);
          return tomt ? Eksport.dxfKroppTomt(a2, res, pre) : Eksport.dxfKroppVeg(a2, res, pre);
        }
        // geojson
        const g = tomt ? this.geojsonTomt(a2, res) : this.geojsonVeg(a2, res);
        for (const f of g.features) {
          f.properties = Object.assign({ anlegg: anleggsnavn, anleggstype: anl.type }, f.properties);
        }
        return g.features;
      });

      if (!tatt.length) {
        this.eksportsvar(navn + ': ingen av anleggene kunne skrives – '
          + hoppet.map(h => (h.anlegg.navn || h.anlegg.type) + ': ' + h.grunn).join('; '), true);
        return;
      }

      let innhold;
      if (format === 'kof') {
        const merk = [];
        for (const t of tatt) {
          merk.push(t.bit.merke + ' = ' + t.bit.anleggsnavn);
          for (const m of t.bit.merknader) merk.push(t.bit.merke + ': ' + m);
        }
        const rader = Eksport.kofHode(app, merk);
        for (const t of tatt) for (const r of t.bit.rader) rader.push(r);
        innhold = rader.join('\r\n') + '\r\n';
      } else if (format === 'landxml') {
        const ali = tatt.filter(t => t.bit.alignment).map(t => t.bit.alignment);
        const fla = tatt.filter(t => t.bit.flater).flatMap(t => t.bit.flater);
        const lin = tatt.filter(t => t.bit.linjer).flatMap(t => t.bit.linjer);
        const kropp = [];
        if (ali.length) {
          kropp.push(`  <Alignments name="${Eksport.xml(app.P.navn)}">\n${ali.join('\n')}\n  </Alignments>`);
        }
        if (fla.length) {
          kropp.push(`  <Surfaces name="${Eksport.xml(app.P.navn)}">\n${fla.join('\n')}\n  </Surfaces>`);
        }
        if (lin.length) {
          kropp.push(`  <PlanFeatures name="Massekalk">\n${lin.join('\n')}\n  </PlanFeatures>`);
        }
        innhold = Eksport.landxmlDokument(app, kropp.join('\n'));
      } else if (format === 'sosi') {
        const rader = Eksport.sosiHode(app, sosiOmr, sosiNiva);
        for (const t of tatt) for (const r of t.bit.rader) rader.push(r);
        rader.push('.SLUTT');
        innhold = rader.join('\r\n') + '\r\n';
      } else if (format === 'dxf') {
        innhold = Eksport.dxfDokument(tatt.flatMap(t => t.bit));
      } else {
        innhold = JSON.stringify({
          type: 'FeatureCollection',
          properties: { prosjekt: app.P.navn, anlegg: tatt.length },
          features: tatt.flatMap(t => t.bit)
        }, null, 1);
      }

      const fil = this.filnavn('_alle' + endelse);
      this.lastNed(fil, innhold, mime);
      this.samlesvar(navn, fil, Math.round(innhold.length / 1024), tatt, hoppet);
    } catch (e) {
      console.error('Samleeksport «' + format + '» feilet', e);
      this.eksportsvar('Samleeksporten feilet: ' + e.message, true);
    } finally {
      this._samlerNa = false;
    }
  }
};

function klassenavn(app) {
  const k = Veiklasser[app.P.mal.veiklasse];
  return k ? k.navn : 'Egne verdier';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
