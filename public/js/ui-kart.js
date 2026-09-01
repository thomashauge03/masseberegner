'use strict';
/** Kartdelen: bakgrunnskart, tegning av senterlinje og observasjonspunkt. */

/**
 * Bakgrunnene og overleggene som ET REGISTER, ikke som kall spredt i init.
 *
 * Grunnen er en felle som var innebygd i den gamle koden: bytteren fjernet det
 * gamle laget FØR den slo opp det nye. En knapp med en verdi som ikke fantes i
 * ordboka kastet da på `undefined.addTo` etter at bakgrunnen alt var borte, og
 * `gjeldendeBakgrunn` sto igjen ugyldig – så NESTE bytte kastet allerede på
 * `removeLayer(undefined)`. Kartet ble aldri friskt igjen uten å laste siden på
 * nytt. Nå bygges både knappene og lagene fra det samme registeret, så de to kan
 * ikke drive fra hverandre i det hele tatt.
 *
 * FLYFOTO – HVA SOM FINNES OG HVA SOM IKKE GJØR DET
 * Norge i bilder er stengt for oss. Kartverkets åpne WMTS-cache har bare topo,
 * toporaster, topograatone og sjokartraster – null ortofoto. `wms.nib` svarer
 * med BAAT-autentiseringsfeil, `tilecache.norgeibilder.no` med «Token
 * Required», og gamle `opencache.statkart.no` svarer ikke i det hele tatt. Det
 * som står igjen uten nøkkel er Esri World Imagery, og det er brukt her til det
 * ene Esri uttrykkelig gir rett til: å tegne omriss oppå bildet. Derfor tre
 * betingelser som er bygd inn nedenfor og ikke kan skrus av: attribusjonen står
 * alltid, flisene når aldri et canvas eller en fil, og bildet er
 * orienteringsgrunnlag – ikke målegrunnlag. Kilden oppgir 5 m horisontal
 * nøyaktighet, så man plasserer en tomt etter det, men måler ikke på det.
 */
const KARTLAG = {
  bakgrunner: [
    { navn: 'topo', tekst: 'Kart', tittel: 'Kartverkets topografiske kart', kv: 'topo' },
    { navn: 'toporaster', tekst: 'Turkart', tittel: 'Turkart (raster)', kv: 'toporaster' },
    { navn: 'graatone', tekst: 'Gråtone', tittel: 'Dempet gråtonekart – tegningen kommer tydelig fram', kv: 'topograatone' },
    {
      navn: 'flyfoto', tekst: 'Flyfoto', tittel: 'Flyfoto – for å se hva som står der i dag',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      /* maxNativeZoom er IKKE en finjustering her. Fra zoom 19 og oppover svarer
         tjenesten `200 image/jpeg` med en grå rute der det står «Map data not
         yet available» – 2 521 byte, samme bilde over hele distrikts-Norge.
         Leaflet ser ingen feil og viser den. Uten grensen ville man zoomet inn
         for å plassere et hjørne og fått grå skjerm med sin egen tegning
         svevende oppå. maxZoom 21 gjør at Leaflet strekker zoom 18-flisen i
         stedet; tegningen er vektor og forblir skarp. */
      maksEkte: 18,
      attribusjon: 'Flyfoto © Esri, Vantor, Microsoft, Earthstar Geographics',
      /* crossOrigin settes bevisst IKKE på denne. Tjenestens egen metadata sier
         `exportTilesAllowed: false`, og et canvas som aldri kan lese pikslene
         kan heller ikke komme til å legge dem i en PDF eller en fil. */
      moerkt: true
    }
  ],
  overlegg: [
    {
      navn: 'skygge', tekst: 'Terrengskygge', standard: true, zIndex: 200,
      tittel: 'Skyggerelieff av laserdataene – viser terrengformene',
      arcgis: 'las_dtm_somlos', opacity: 0.45,
      /* Halv styrke om noen slår den på oppå et flyfoto. */
      opacityFoto: 0.25,
      /* AV AV SEG SJØL PÅ FLYFOTO.
         Skyggen finnes for å lese terrengformer ut av et flatt kart. Et foto
         viser bakken i seg selv, og skyggen oppå gjør to ting galt: den legger
         et grønngrått slør over bildet, og – verre – tjenesten strekker
         kontrasten PER FLIS, så over et foto ser man rutene som lysere og
         mørkere firkanter. Det ser ut som en feil i programmet. Slår man den på
         igjen mens fotoet står, blir den stående. */
      avPaaFoto: true
    },
    {
      navn: 'matrikkel', tekst: 'Eiendomsgrenser', standard: false, zIndex: 400,
      tittel: 'Eiendomsgrenser og teiger fra matrikkelen',
      wms: 'https://wms.geonorge.no/skwms1/wms.matrikkelkart',
      /* Begge lag må bes om samtidig: grensene kommer på vanlig arbeidszoom,
         mens teigene med matrikkelnummer først slår inn lenger inn. */
      lag: 'eiendomsgrense,teig', opacity: 0.85, attribusjon: '© Kartverket (matrikkel)'
    },
    {
      navn: 'vegnavn', tekst: 'Vegnavn', standard: true, zIndex: 500, kunFoto: true,
      tittel: 'Vegnavn og skiltnummer – topokartet har dem innebygd',
      wms: 'https://wms.geonorge.no/skwms1/wms.vegnett2',
      /* Bare navnene, ikke veglinjene. De fargede linjene konkurrerer med
         brukerens egen vegtegning og gjør bildet uleselig. */
      lag: 'vegnavn,vegnavn_nr', opacity: 1, attribusjon: '© Kartverket (vegnett)'
    },
    {
      navn: 'losmasse', tekst: 'Løsmasser', standard: false, zIndex: 300,
      tittel: 'Løsmassekart fra NGU',
      wms: 'https://geo.ngu.no/mapserver/LosmasserWMS2',
      lag: 'Losmasse_flate', opacity: 0.45, attribusjon: '© NGU'
    }
  ]
};

const Kart = {
  kart: null,
  lag: {},
  ipMarkorer: [],
  fjellMarkorer: [],
  modus: 'rediger',
  app: null,

  /* ---------------- bakgrunn og overlegg ---------------- */

  /** Lagene, laget én gang fra registeret. Ingen av dem er lagt på kartet ennå. */
  byggLag() {
    this.bakgrunner = {};
    for (const b of KARTLAG.bakgrunner) {
      const url = b.kv
        ? `https://cache.kartverket.no/v1/wmts/1.0.0/${b.kv}/default/webmercator/{z}/{y}/{x}.png`
        : b.url;
      const o = {
        maxZoom: 21,
        maxNativeZoom: b.maksEkte || 18,
        zIndex: 100,
        attribution: b.attribusjon || '© Kartverket'
      };
      /* crossOrigin må settes FØR src for at nettleseren skal gjøre en
         CORS-henting i det hele tatt – serverens header alene hjelper ikke.
         Uten den blir et canvas som tegner flisen «tainted», og toDataURL
         kaster. Den står derfor på alt vi selv har lov til å ta bilde av, og
         bevisst ikke på flyfotoet. */
      if (!b.moerkt) o.crossOrigin = 'anonymous';
      this.bakgrunner[b.navn] = L.tileLayer(url, o);
    }

    this.overlegg = {};
    for (const v of KARTLAG.overlegg) {
      let lag;
      if (v.arcgis) {
        lag = L.tileLayer.arcgisBilde(v.arcgis, { opacity: v.opacity, zIndex: v.zIndex });
      } else {
        lag = L.tileLayer.wms(v.wms, {
          layers: v.lag, format: 'image/png', transparent: true,
          opacity: v.opacity, zIndex: v.zIndex,
          attribution: v.attribusjon, crossOrigin: 'anonymous'
        });
      }
      this.overlegg[v.navn] = lag;
    }
    // gamle navn, så ingenting utenfor denne fila trenger å vite om omskrivingen
    this.skygge = this.overlegg.skygge;
    this.losmasse = this.overlegg.losmasse;
  },

  /** Det brukeren valgte sist, validert mot registeret. */
  lagreteValg() {
    const fallback = { bakgrunn: 'topo' };
    for (const v of KARTLAG.overlegg) fallback[v.navn] = !!v.standard;
    try {
      const raa = localStorage.getItem('massekalk.kartvalg');
      if (!raa) return fallback;
      const j = JSON.parse(raa);
      /* Valideres mot registeret, ikke bare mot at det er et objekt. Er et lag
         fjernet eller omdøpt siden sist, ville en lagret nøkkel ellers gitt
         nøyaktig den døde tilstanden hele denne omskrivingen skal hindre. */
      const ut = Object.assign({}, fallback);
      if (this.bakgrunner && this.bakgrunner[j.bakgrunn]) ut.bakgrunn = j.bakgrunn;
      for (const v of KARTLAG.overlegg) if (typeof j[v.navn] === 'boolean') ut[v.navn] = j[v.navn];
      return ut;
    } catch (e) { return fallback; }
  },

  lagreValg() {
    try {
      const v = { v: 1, bakgrunn: this.gjeldendeBakgrunn };
      for (const o of KARTLAG.overlegg) v[o.navn] = this.kart.hasLayer(this.overlegg[o.navn]);
      localStorage.setItem('massekalk.kartvalg', JSON.stringify(v));
    } catch (e) { /* privat modus eller fullt lager: valget huskes bare ikke */ }
  },

  /** Knappene og avkryssingsboksene, bygd fra det samme registeret som lagene. */
  byggKartvalg() {
    const rad = document.getElementById('bakgrunnsvalg');
    const boks = document.getElementById('overleggsvalg');
    if (!rad || !boks) return;
    const valg = this.lagreteValg();

    rad.innerHTML = '';
    for (const b of KARTLAG.bakgrunner) {
      const k = document.createElement('button');
      k.className = 'kartknapp';
      k.dataset.bakgrunn = b.navn;
      k.textContent = b.tekst;
      k.title = b.tittel;
      k.setAttribute('role', 'radio');
      k.onclick = () => this.settBakgrunn(b.navn);
      rad.appendChild(k);
    }

    boks.innerHTML = '';
    for (const v of KARTLAG.overlegg) {
      const l = document.createElement('label');
      l.className = 'kartbrikke';
      l.dataset.overlegg = v.navn;
      l.title = v.tittel;
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.id = 'vis_' + v.navn;
      i.checked = !!valg[v.navn];
      i.onchange = () => {
        // brukeren har tatt over dette laget: da skal vi ikke slå det på igjen selv
        if (this._avAvOss) delete this._avAvOss[v.navn];
        /* Rører han bryteren mens fotoet står, er det et svar på nettopp det
           spørsmålet, og det huskes. */
        if (this.erMoerk(this.gjeldendeBakgrunn)) {
          this._paaFoto = this._paaFoto || {};
          this._paaFoto[v.navn] = i.checked;
        }
        this.settOverlegg(v.navn, i.checked);
        this.lagreValg();
      };
      l.appendChild(i);
      l.appendChild(document.createTextNode(' ' + v.tekst));
      boks.appendChild(l);
      this.settOverlegg(v.navn, i.checked, true);
    }
  },

  /**
   * Lagvelgeren åpner og lukker seg.
   *
   * Den ligger oppå kartet, så den MÅ lukke seg selv – ellers står den i veien
   * for nettopp det man skulle se på. Lukkes ved klikk utenfor, ved Escape, og
   * når man har valgt en bakgrunn (da er man ferdig). Overleggene lukker den
   * ikke: der skrur folk gjerne på to ting etter hverandre.
   */
  koblLagvelger() {
    const knapp = document.getElementById('kartlagknapp');
    const panel = document.getElementById('kartlagpanel');
    if (!knapp || !panel) return;
    const sett = pa => {
      panel.classList.toggle('skjult', !pa);
      knapp.setAttribute('aria-expanded', pa ? 'true' : 'false');
    };
    knapp.onclick = e => { e.stopPropagation(); sett(panel.classList.contains('skjult')); };
    document.addEventListener('click', e => {
      if (!panel.classList.contains('skjult') && !panel.contains(e.target) && e.target !== knapp) sett(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') sett(false); });
    this._lukkLagvelger = () => sett(false);
  },

  /** Navnet på knappen skal si hva som vises nå, uten å åpne noe. */
  visLagnavn() {
    const e = document.getElementById('kartlagnavn');
    if (!e) return;
    const b = KARTLAG.bakgrunner.find(x => x.navn === this.gjeldendeBakgrunn);
    const paa = KARTLAG.overlegg.filter(v => this.overlegg[v.navn] && this.kart.hasLayer(this.overlegg[v.navn])).length;
    e.textContent = (b ? b.tekst : 'Kart') + (paa ? ' +' + paa : '');
  },

  settOverlegg(navn, pa, stille) {
    const lag = this.overlegg[navn];
    if (!lag) return;
    if (pa) { lag.addTo(this.kart); lag.setZIndex((KARTLAG.overlegg.find(v => v.navn === navn) || {}).zIndex || 200); }
    else if (this.kart.hasLayer(lag)) this.kart.removeLayer(lag);
    if (!stille) { this.lagreValg(); this.visLagnavn(); }
  },

  /**
   * Bytter bakgrunn.
   *
   * SLÅ OPP FØRST, FJERN ETTERPÅ. Den gamle rekkefølgen – fjern, så slå opp –
   * gjorde at en ukjent nøkkel etterlot kartet uten bakgrunn OG med en ugyldig
   * `gjeldendeBakgrunn`, slik at også neste bytte kastet. Det finnes ingen vei
   * tilbake fra det uten å laste siden på nytt.
   */
  settBakgrunn(navn, forste) {
    const nytt = this.bakgrunner[navn];
    if (!nytt) return;                          // ukjent navn: la alt stå som det står
    if (!forste && this.gjeldendeBakgrunn === navn) return;
    const gammelt = this.bakgrunner[this.gjeldendeBakgrunn];
    nytt.addTo(this.kart);
    nytt.setZIndex(100);
    if (gammelt && gammelt !== nytt && this.kart.hasLayer(gammelt)) this.kart.removeLayer(gammelt);
    this.gjeldendeBakgrunn = navn;

    document.querySelectorAll('#bakgrunnsvalg .kartknapp').forEach(k => {
      const pa = k.dataset.bakgrunn === navn;
      k.classList.toggle('aktiv', pa);
      k.setAttribute('aria-checked', pa ? 'true' : 'false');
    });
    this.settKontrast(navn);
    if (!forste && this._lukkLagvelger) this._lukkLagvelger();
    /* Vegnavn hører til flyfotoet. Topokartet har navnene innebygd, og to sett
       navn oppå hverandre er verre enn ingen. */
    const foto = this.erMoerk(navn);
    for (const v of KARTLAG.overlegg) {
      const l = document.querySelector(`#overleggsvalg [data-overlegg="${v.navn}"]`);
      const i = document.getElementById('vis_' + v.navn);
      if (v.kunFoto) {
        if (l) l.classList.toggle('skjult', !foto);
        this.settOverlegg(v.navn, foto && i && i.checked, true);
      }
      if (v.opacityFoto != null && this.overlegg[v.navn]) {
        this.overlegg[v.navn].setOpacity(foto ? v.opacityFoto : v.opacity);
      }
      /* Slås av når fotoet kommer, og PÅ IGJEN når kartet kommer tilbake – men
         bare så lenge brukeren ikke har sagt noe selv. Rører han bryteren MENS
         fotoet står, har han uttalt seg om nettopp dette tilfellet, og da
         gjelder det fra da av. Uten det siste ble valget hans overstyrt igjen
         ved neste bakgrunnsbytte, og bryteren så ut til å ha sitt eget liv. */
      if (v.avPaaFoto && i) {
        const vil = this._paaFoto ? this._paaFoto[v.navn] : undefined;
        if (foto) {
          if (vil !== undefined) i.checked = vil;
          else if (i.checked) {
            this._avAvOss = this._avAvOss || {};
            this._avAvOss[v.navn] = true;
            i.checked = false;
          }
        } else if (this._avAvOss && this._avAvOss[v.navn]) {
          i.checked = true;
          delete this._avAvOss[v.navn];
        }
        this.settOverlegg(v.navn, i.checked, true);
      }
    }
    this.visLagnavn();
    if (!forste) this.lagreValg();
  },

  erMoerk(navn) {
    const b = KARTLAG.bakgrunner.find(x => x.navn === navn);
    return !!(b && b.moerkt);
  },

  /**
   * Tegningen må kunne ses mot bakgrunnen den ligger på.
   *
   * Streken og tomta er stilt for et hvitt topokart. Verre er haloen under
   * senterlinjen: den er SVART, og forsvinner mot skog og asfalt akkurat som
   * linjen selv gjør. Ett sted skal vite om dette, og det er her.
   */
  settKontrast(navn) {
    const foto = this.erMoerk(navn);
    if (this.lag.linjeSkygge) {
      this.lag.linjeSkygge.setStyle(foto
        ? { color: '#ffffff', opacity: 0.85, weight: 7 }
        : { color: '#0b0b0c', opacity: 0.55, weight: 6 });
    }
    if (this.lag.linje) this.lag.linje.setStyle({ weight: foto ? 4 : 3 });
    // fotoet under trenger mindre fyll for at tomta skal leses som en flate
    if (this.lag.tomt) this.lag.tomt.setStyle({ fillOpacity: foto ? 0.10 : 0.18 });
  },

  init(app) {
    this.app = app;
    const kart = L.map('kart', { zoomControl: true, doubleClickZoom: false }).setView([58.14, 7.07], 13);
    this.kart = kart;

    this.byggLag();

    /* Senterlinjen far svart omriss under den lyse streken. Uten det
       forsvinner den i lyse partier av kartet. */
    this.lag.linjeSkygge = L.polyline([], { color: '#0b0b0c', weight: 6, opacity: .55 }).addTo(kart);
    this.lag.linje = L.polyline([], { color: Farger.veg, weight: 3 }).addTo(kart);
    this.lag.hjelpelinje = L.polyline([], { color: Farger.veg, weight: 1, dashArray: '4 4', opacity: .5 }).addTo(kart);
    this.lag.venstreFot = L.polyline([], { color: Farger.skjaering, weight: 1.8, opacity: .95 }).addTo(kart);
    this.lag.hoyreFot = L.polyline([], { color: Farger.skjaering, weight: 1.8, opacity: .95 }).addTo(kart);
    /* Tomta. Fyllet er halvgjennomsiktig sa terrengskyggen under fortsatt
       synes - det er den man leser tomta ut fra nar man velger hvor den skal
       ligge. Hjørnene er en egen gruppe, sa de kan tegnes om for seg nar man
       drar i ett av dem uten a bygge hele laget pa nytt. */
    this.lag.tomt = L.polygon([], {
      color: Farger.veg, weight: 2.5, fillColor: Farger.veg, fillOpacity: 0.18
    }).addTo(kart);
    this.lag.tomtHjelp = L.polyline([], {
      color: Farger.veg, weight: 1.5, dashArray: '5 5', opacity: 0.7
    }).addTo(kart);
    this.lag.tomtHjorner = L.layerGroup().addTo(kart);
    this.lag.vegkant = L.layerGroup().addTo(kart);
    this.lag.stasjoner = L.layerGroup().addTo(kart);
    this.lag.markorPos = L.layerGroup().addTo(kart);
    /* MÅLESTREKENE.
       Et eget lag, over alt annet: de er en skisse man sikter med, ikke en del
       av prosjektet. De regnes ikke inn i noe, de lagres ikke, og de forsvinner
       når man tømmer dem. Nettopp derfor er de nyttige – man kan strekke en
       strek tvers over kartet for å se hvor langt det er til bekken uten å
       røre en eneste linje som betyr noe. */
    this.lag.maal = L.layerGroup().addTo(kart);

    this.byggKartvalg();
    this.koblLagvelger();
    this.settBakgrunn(this.lagreteValg().bakgrunn, true);

    // Kartet lages før panelene har fatt endelig størrelse
    setTimeout(() => kart.invalidateSize(), 60);
    new ResizeObserver(() => kart.invalidateSize()).observe(document.getElementById('kart'));

    /* Et klikk pa selve linjen i Rediger setter inn et knekkpunkt der. Har man
       glemt en sving, eller vil ha mer sving pa et strekk som alt er tegnet,
       er det denne veien.

       Bare i Rediger. Mens man tegner skal punktet alltid pa enden - ellers
       havner et klikk som tilfeldigvis ligger nær et tidligere strekk midt i
       rekken, og linjen gar i sikksakk. */
    this.lag.linje.on('click', e => {
      if (this.modus !== 'rediger') return;
      L.DomEvent.stop(e);
      const plass = this.settInnPunkt(e.latlng, 40);
      if (plass >= 0) this.app.status(`Satte inn knekkpunkt ${plass + 1} – dra det dit du vil ha svingen`);
    });

    /* Et dobbeltklikk gir to click-hendelser før dblclick kommer. Mens man
       tegnet ble derfor det siste punktet lagt inn to ganger: ett for klikket
       man mente, og ett til for det som bare skulle avslutte tegningen.
       Derfor holdes klikket igjen et øyeblikk, sa dblclick rekker a stanse
       det. Utenfor tegnemodus er det ingen grunn til a vente. */
    kart.on('click', e => {
      if (this.modus !== 'tegn' && this.modus !== 'tegnTomt') { this.klikk(e); return; }
      clearTimeout(this._klikkVent);
      const kopi = { latlng: e.latlng };
      this._klikkVent = setTimeout(() => { this._klikkVent = null; this.klikk(kopi); }, 220);
    });
    kart.on('mousemove', e => this.visInfo(e));
    kart.on('dblclick', () => {
      clearTimeout(this._klikkVent);            // det andre klikket skal ikke bli et punkt
      this._klikkVent = null;
      if (this.modus === 'tegn') this.settModus('rediger');
      else if (this.modus === 'tegnTomt') this.avsluttTomt();
      else if (this.modus === 'maal') this._avsluttMaal();
    });

    this.koblingerUI();
    return this;
  },

  koblingerUI() {
    const p = id => document.getElementById(id);
    p('verktoyTegn').onclick = () => this.settModus('tegn');
    if (p('verktoyTomt')) p('verktoyTomt').onclick = () => this.settModus('tegnTomt');
    p('verktoyFlytt').onclick = () => this.settModus('rediger');
    p('verktoySondering').onclick = () => this.settModus('sondering');
    if (p('verktoyMaal')) p('verktoyMaal').onclick = () => this.settModus('maal');
    if (p('verktoyMaalTom')) p('verktoyMaalTom').onclick = () => this.tomMaal();
    if (p('modusVeg')) p('modusVeg').onclick = () => this.app.settModus('veg');
    if (p('modusTomt')) p('modusTomt').onclick = () => this.app.settModus('tomt');
    if (p('visTomtefarger')) p('visTomtefarger').onchange = () => this.tegnTomtefarger();
    if (p('tp_retning')) p('tp_retning').onchange = e => {
      Tomteprofil.retning = e.target.value;
      Tomteprofil.tegn();
    };
    if (p('tp_skyver')) p('tp_skyver').oninput = e => {
      Tomteprofil.forskyvning = (+e.target.value) / 100;
      Tomteprofil.tegn();
    };
    const flyttSnitt = steg => {
      const sk = p('tp_skyver');
      if (!sk) return;
      sk.value = Math.max(0, Math.min(100, (+sk.value) + steg));
      Tomteprofil.forskyvning = (+sk.value) / 100;
      Tomteprofil.tegn();
    };
    if (p('tp_forrige')) p('tp_forrige').onclick = () => flyttSnitt(-5);
    if (p('tp_neste')) p('tp_neste').onclick = () => flyttSnitt(5);
    /* Bare tm_kote finnes. Lista hadde fire id-er til – tm_nivaamodus, tm_fall,
       tm_fallretning og tm_rutestorrelse – som alle ble flyttet til
       Høyde-fanen. Vakten «if (!e) continue» gjorde at løkka gikk stille rundt
       fire ganger uten å finne noe. */
    {
      const e = p('tm_kote');
      if (e) e.onchange = () => {
        this.app.merk('endret ferdig nivå');
        this.app.skjemaTilTomt();
        this.app.tomtTilSkjema();
        this.app.beregnTomt();
      };
    }
    if (p('tm_foreslaKote')) p('tm_foreslaKote').onclick = async () => {
      const k = this.app.foreslaKote();
      if (k == null) { this.app.status('Tegn tomta først, så terrenget kan leses'); return; }
      this.app.merk('foreslå kote');
      this.app.P.tomt.nivaa.kote = k;
      this.app.tomtTilSkjema();
      await this.app.beregnTomt();
      this.app.status(`Foreslo kote ${k.toFixed(2)} – middelhøyden i terrenget pluss overbygningen`);
    };
    if (p('tm_balanser')) p('tm_balanser').onclick = () => this.app.balanserTomt();
    p('knappAngre').onclick = () => this.app.angre();
    if (p('knappGjorOm')) p('knappGjorOm').onclick = () => this.app.gjorOm();
    /* Bakgrunnsknappene og overleggsboksene kobles i byggKartvalg(), fordi de
       lages derfra. Her sto tre uvernede oppslag – `p('bakgrunnskart').onchange`
       uten `if (p(...))` – som tok hele oppstarten med seg om noen døpte om en
       id i HTML-en. */

    const sok = p('sokefelt'), liste = p('sokeliste');
    let tidsavbrudd = null;
    sok.oninput = () => {
      clearTimeout(tidsavbrudd);
      const q = sok.value.trim();
      if (q.length < 2) { liste.classList.add('skjult'); return; }
      tidsavbrudd = setTimeout(async () => {
        try {
          const r = await fetch('api/sok?q=' + encodeURIComponent(q));
          const d = await r.json();
          liste.innerHTML = '';
          (d.treff || []).slice(0, 12).forEach(t => {
            const el = document.createElement('div');
            el.innerHTML = `${t.navn}<small>${t.type}${t.kommune ? ' · ' + t.kommune : ''}</small>`;
            el.onclick = () => {
              this.kart.setView([t.lat, t.lon], 16);
              liste.classList.add('skjult');
              sok.value = t.navn;
            };
            liste.appendChild(el);
          });
          liste.classList.toggle('skjult', !(d.treff || []).length);
        } catch (e) { liste.classList.add('skjult'); }
      }, 320);
    };
    document.addEventListener('click', e => {
      if (!e.target.closest('.kartsok')) liste.classList.add('skjult');
    });
  },

  settModus(m) {
    this.modus = m;
    for (const [id, navn] of [['verktoyTegn', 'tegn'], ['verktoyFlytt', 'rediger'],
      ['verktoySondering', 'sondering'], ['verktoyTomt', 'tegnTomt'],
      ['verktoyMaal', 'maal']]) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('aktiv', navn === m);
    }
    document.getElementById('kart').style.cursor = (m === 'rediger') ? '' : 'crosshair';
    if (m === 'tegnTomt') {
      this.app.status('Klikk rundt tomta. Dobbeltklikk eller Enter for å lukke den.');
    }
    if (m === 'settSluk') {
      this.app.status('Klikk der sluket skal stå – flaten kommer til å falle mot det punktet.');
    }
    if (m === 'maal') {
      this.app.status('Klikk for å måle. Hvert strekk får lengden sin, og summen står til slutt. '
        + 'Dobbeltklikk eller Esc avslutter streken.');
    } else if (this._maalNa && this._maalNa.length) {
      // bytter man verktøy midt i en strek, blir den stående som den er
      this._avsluttMaal();
    }
  },

  /* ---------------- måling ---------------- */

  /**
   * Frihåndsstreker med mål, tegnet oppå kartet.
   *
   * Dette er ikke prosjektering – det er å sikte. Skal vegen treffe mellom to
   * hus, skal fyllingsfoten holde seg innenfor et jorde, eller er det langt nok
   * fra bekken til at man slipper å søke? Alt det er spørsmål man svarer på ved
   * å strekke en strek og lese et tall, og uten et slikt verktøy blir svaret
   * enten en gjetning eller en linje man tegner og angrer.
   *
   * LENGDEN REGNES I UTM, ikke med Leaflets geodetiske avstand. Det er den samme
   * regningen som resten av programmet bruker, så et mål her og en stasjon der
   * er det samme tallet. To målestokker på samme kart er verre enn ingen.
   */
  _maalLengde(a, b) {
    const sone = this.app.sone || Geo.sone(a.lng);
    const p1 = Geo.tilUtm(a.lat, a.lng, sone);
    const p2 = Geo.tilUtm(b.lat, b.lng, sone);
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  },

  /** Kompassretningen fra a til b, i grader fra nord. */
  _maalRetning(a, b) {
    const sone = this.app.sone || Geo.sone(a.lng);
    const p1 = Geo.tilUtm(a.lat, a.lng, sone);
    const p2 = Geo.tilUtm(b.lat, b.lng, sone);
    const g = Math.atan2(p2.x - p1.x, p2.y - p1.y) * 180 / Math.PI;
    return (g + 360) % 360;
  },

  _maalKlikk(latlng) {
    if (!this._maalNa) this._maalNa = [];
    this._maalNa.push(latlng);
    this._tegnMaal();
  },

  /**
   * Tegner streken som er under arbeid, og alle de ferdige.
   *
   * Etikettene er L.marker med et tomt ikon og en permanent tooltip. Det er
   * Leaflets egen måte å feste tekst til et sted på – en divIcon ville fulgt
   * med i zoom som et bilde, mens tooltipen holder skriftstørrelsen.
   */
  _tegnMaal() {
    this.lag.maal.clearLayers();
    const strekene = (this._maalFerdige || []).concat(
      this._maalNa && this._maalNa.length ? [this._maalNa] : []);
    for (const punkt of strekene) {
      if (punkt.length < 1) continue;
      const paagaar = punkt === this._maalNa;
      L.polyline(punkt, {
        color: '#ffffff', weight: 5, opacity: 0.5, interactive: false
      }).addTo(this.lag.maal);
      L.polyline(punkt, {
        color: Farger.skjaering, weight: 2, opacity: 1,
        dashArray: paagaar ? '6 4' : null, interactive: false
      }).addTo(this.lag.maal);
      for (const q of punkt) {
        L.circleMarker(q, {
          radius: 3, color: Farger.skjaering, fillColor: '#ffffff',
          fillOpacity: 1, weight: 1.5, interactive: false
        }).addTo(this.lag.maal);
      }
      /* HVERT STREKK FÅR SITT EGET TALL, ikke bare summen.
         Sikter man mellom to hus, er det avstanden til HVERT av dem man vil
         vite; en total sier bare hvor langt man har dratt musa. */
      let sum = 0;
      for (let i = 1; i < punkt.length; i++) {
        const d = this._maalLengde(punkt[i - 1], punkt[i]);
        sum += d;
        const midt = L.latLng((punkt[i - 1].lat + punkt[i].lat) / 2,
          (punkt[i - 1].lng + punkt[i].lng) / 2);
        L.marker(midt, { icon: L.divIcon({ className: 'maaltomt', html: '' }), interactive: false })
          .bindTooltip(Rapport.tall(d, d < 100 ? 1 : 0) + ' m', {
            permanent: true, direction: 'center', className: 'maaletikett'
          }).addTo(this.lag.maal);
      }
      if (punkt.length > 2) {
        L.marker(punkt[punkt.length - 1], {
          icon: L.divIcon({ className: 'maaltomt', html: '' }), interactive: false
        }).bindTooltip('sum ' + Rapport.tall(sum, 0) + ' m', {
          permanent: true, direction: 'right', offset: [8, 0], className: 'maaletikett maalsum'
        }).addTo(this.lag.maal);
      }
      /* Retningen på det siste strekket mens man tegner: det er den man sikter
         etter når man skal legge en veg parallelt med noe. */
      if (paagaar && punkt.length > 1) {
        const a = punkt[punkt.length - 2], b = punkt[punkt.length - 1];
        L.marker(b, { icon: L.divIcon({ className: 'maaltomt', html: '' }), interactive: false })
          .bindTooltip(Rapport.tall(this._maalRetning(a, b), 0) + '°', {
            permanent: true, direction: 'bottom', offset: [0, 6], className: 'maaletikett maalgrad'
          }).addTo(this.lag.maal);
      }
    }
  },

  /** Legger streken som er under arbeid til side, og starter en ny. */
  _avsluttMaal() {
    if (this._maalNa && this._maalNa.length > 1) {
      if (!this._maalFerdige) this._maalFerdige = [];
      this._maalFerdige.push(this._maalNa);
    }
    this._maalNa = [];
    this._tegnMaal();
  },

  /** Tømmer alle målestreker. */
  tomMaal() {
    this._maalFerdige = [];
    this._maalNa = [];
    this._tegnMaal();
    this.app.status('Målestrekene er borte');
  },

  /**
   * Avslutter tegningen av en tomt.
   *
   * Polygonet lukkes av seg selv - siste hjørne henger sammen med det første -
   * sa brukeren skal ikke klikke pa startpunktet igjen. Gjør man det, star to
   * hjørner pa samme sted, og kanten mellom dem har ingen retning a marsjere
   * skraningen langs.
   */
  avsluttTomt() {
    if (this.modus !== 'tegnTomt') return;
    const t = this.app.P.tomt;
    if (t && t.punkter.length >= 3) {
      this.settModus('rediger');
      this.app.tomtEndret();
    } else if (t) {
      this.app.status(`Tomta trenger minst tre hjørner – du har ${t.punkter.length}.`);
    }
  },

  /**
   * Setter inn et knekkpunkt der klikket traff linjen.
   *
   * Har man glemt en sving, eller vil ha mer sving pa et strekk som alt er
   * tegnet, er det ingen vei utenom a fa punktet inn pa riktig plass i
   * rekkefølgen - a legge det til pa slutten gir en linje som gar tilbake
   * dit den kom fra. Punktet havner mellom de to knekkpunktene strekket
   * ligger mellom, og far prosjektets standardradius sa svingen blir myk med
   * en gang.
   *
   * @returns {number} plassen punktet fikk, eller -1 om klikket var for langt unna
   */
  settInnPunkt(latlng, maksAvstand = 40) {
    const app = this.app, P = app.P;
    if (P.ip.length < 2) return -1;
    /* Bygg linjen pa nytt først. `linjeEndret` er utsatt noen hundredels
       sekund, sa rett etter at et punkt er slettet eller flyttet kan
       `app.linje` fortsatt vaere den gamle - og da regnes plassen i rekken ut
       fra en linje som ikke finnes lenger. */
    app.byggLinje();
    if (!app.linje || app.linje.lengde <= 0) return -1;
    const utm = Geo.tilUtm(latlng.lat, latlng.lng, app.sone);
    const pr = app.linje.projiser(utm.x, utm.y);
    if (!isFinite(pr.s) || pr.avstand > maksAvstand) return -1;

    /* Hvilket strekk traff vi? Knekkpunktene har hvert sitt profilnummer
       langs linjen, og punktet skal inn mellom de to som omslutter treffet.
       Kurvene gjør at knekkpunktet ikke ligger pa linjen selv, sa det males
       til tangentskjæringen - der punktet faktisk er. */
    const ipUtm = app.ipTilUtm();
    const langs = ipUtm.map((q, i) => {
      if (i === 0) return 0;
      if (i === ipUtm.length - 1) return app.linje.lengde;
      const kurve = (app.linje.kurver || []).find(k => k.ip === i);
      return kurve ? (kurve.sBC + kurve.sEC) / 2 : app.linje.projiser(q.x, q.y).s;
    });
    let plass = ipUtm.length - 1;
    for (let i = 1; i < langs.length; i++) {
      if (pr.s <= langs[i] + 1e-9) { plass = i; break; }
    }
    app.merk('sett inn knekkpunkt');
    const nytt = { lat: latlng.lat, lon: latlng.lng, r: P.standardRadius || 0 };
    P.ip.splice(plass, 0, nytt);

    /* Settes punktet inn midt i en kurve som alt finnes, far tre kurver
       plutselig dele pa den samme strekningen. Linjeføringen korter dem inn
       for a fa dem til a passe, og resultatet kan bli en radius pa under en
       meter - en sving ingen kjører. Da er det bedre a gi det nye punktet en
       radius som faktisk far plass. */
    const passer = () => {
      const l = app.byggLinje();
      if (!l) return true;
      const kurve = (l.kurver || []).find(k => k.ip === plass);
      // ingen kurve i det hele tatt er greit ved radius 0
      if (!kurve) return !nytt.r;
      return kurve.r >= nytt.r * 0.75;
    };
    let kortet = false;
    while (nytt.r > 5 && !passer()) { nytt.r = Math.round(nytt.r / 2); kortet = true; }
    if (nytt.r <= 5 && !passer()) { nytt.r = 0; kortet = true; }

    app.linjeEndret();
    if (kortet) {
      app.status(nytt.r
        ? `Satte inn knekkpunkt ${plass + 1} med radius ${nytt.r} m – det var ikke plass til mer`
        : `Satte inn knekkpunkt ${plass + 1} uten kurve – det var ikke plass til en radius her`);
    }
    return plass;
  },

  klikk(e) {
    const P = this.app.P;
    if (this.modus === 'tegn') {
      /* Nar man tegner, skal punktet pa enden. Alltid.

         Her sto det et forsøk pa a vaere hjelpsom: traff klikket linjen, ble
         punktet satt inn der i stedet. Det ødela tegningen fullstendig. Følger
         man en veg som svinger tilbake mot seg selv, havner neste klikk ofte
         nær et tidligere strekk - og da ble punktet lagt inn midt i rekken.
         Rekkefølgen ble stokket om, og linjen gikk i sikksakk uten at noen
         hadde bedt om det.

         Vil man sette inn et punkt pa et strekk som alt er tegnet, klikker
         man pa selve linjen i Rediger. Det er en egen handling, og den skal
         ikke skje ved et uhell. */
      this.app.merk('nytt knekkpunkt');
      P.ip.push({ lat: e.latlng.lat, lon: e.latlng.lng, r: P.standardRadius || 0 });
      this.app.linjeEndret();
    } else if (this.modus === 'tegnTomt') {
      if (!this.app.erTomt()) { this.app.status('Bytt til et tomteanlegg først'); return; }
      /* Samme regel som for veglinjen: nar man tegner, skal hjørnet pa enden.
         Alltid. Et forsøk pa a vaere hjelpsom og sette punktet inn der klikket
         traff en kant ville stokket om rekkefølgen, og polygonet ville krysset
         seg selv uten at noen hadde bedt om det. */
      this.app.merk('nytt tomtehjørne');
      P.tomt.punkter.push({ lat: e.latlng.lat, lon: e.latlng.lng });
      this.app.tomtEndret();
    } else if (this.modus === 'maal') {
      this._maalKlikk(e.latlng);
    } else if (this.modus === 'settSluk') {
      /* Sluket er ferdig regnet i tre filer – i beregningen, i HTML-rapporten
         og i PDF-en – men ingenting skrev noen gang punktet. `nivaa.punkt` sto
         på null i hver eneste tomt, så modusen kunne ikke velges og ville ikke
         virket om den ble det. En grusplass med sluk måtte legges som «flat». */
      if (!this.app.erTomt()) { this.app.status('Bytt til et tomteanlegg først'); return; }
      this.app.merk('satte sluket');
      const t = this.app.P.tomt;
      t.nivaa.punkt = { lat: e.latlng.lat, lon: e.latlng.lng };
      t.nivaa.modus = 'sluk';
      this.settModus('rediger');
      this.app.tomthoydeTilSkjema();
      this.app.beregnTomt();
      this.app.status('Sluket er satt – flaten faller mot det punktet');
    } else if (this.modus === 'sondering') {
      this.app.merk('ny fjellobservasjon');
      const punkt = { lat: e.latlng.lat, lon: e.latlng.lng, dybde: P.fjell.standarddybde };
      P.fjell.punkter.push(punkt);
      this.app.grunnEndret();
      // apne redigeringsboksen med en gang, sa dybden kan skrives inn
      const m = this.fjellMarkorer[this.fjellMarkorer.length - 1];
      if (m) {
        m.openPopup();
        setTimeout(() => {
          const felt = document.querySelector('.leaflet-popup-content input');
          if (felt) { felt.focus(); felt.select(); }
        }, 60);
      }
    }
  },

  visInfo(e) {
    const app = this.app;
    const utm = Geo.tilUtm(e.latlng.lat, e.latlng.lng, app.sone);
    let tekst = `N ${utm.y.toFixed(1)}  Ø ${utm.x.toFixed(1)}  (UTM${app.sone})`;
    if (app.terreng) {
      const z = app.terreng.z(utm.x, utm.y);
      if (isFinite(z)) tekst += `   ·   Terreng ${z.toFixed(2)} moh`;
    }
    if (app.linje && app.linje.lengde > 0) {
      const pr = app.linje.projiser(utm.x, utm.y);
      if (pr.avstand < 60) tekst += `   ·   Profil ${pr.s.toFixed(1)}  avvik ${pr.avvik.toFixed(1)} m`;
    }
    document.getElementById('kartinfo').textContent = tekst;
  },

  /** Tegner linjeføring, knekkpunkt og fotavtrykk pa nytt. */
  /**
   * Tegner tomta: omriss, hjørner som kan dras, og en stiplet strek fra siste
   * hjørne tilbake til det første mens man holder pa.
   *
   * Den stiplede streken er der fordi et polygon under tegning ellers ser ut
   * som en apen linje. Man ser ikke hva man holder pa a lage før man lukker
   * det, og da er det for sent a se at formen ble feil.
   */
  /**
   * Farger hele tomta etter hvor dypt det skal graves og hvor høyt det skal
   * fylles - skjæringen rød, fyllingen grønn, sterkere farge jo mer.
   *
   * Dette er det som svarer til fotavtrykket pa en veg: ett bilde som viser
   * hele anlegget pa én gang. Tallene sier at det er 3800 m³ skjæring, men ikke
   * om det er ett hjørne som star for alt eller om det ligger jevnt utover - og
   * det er den forskjellen som avgjør hvordan man legger opp arbeidet.
   *
   * Skraningscellene utenfor tomta er med. Uten dem stopper fargen brått i
   * tomtekanten, og da ser man ikke utslaget mot naboen - som ofte er det som
   * avgjør om løsningen gar.
   */
  tegnTomtefarger() {
    const app = this.app;
    if (this.lag.tomtefarger) { this.kart.removeLayer(this.lag.tomtefarger); this.lag.tomtefarger = null; }
    if (!app.erTomt() || !app.resultat || !app.resultat.rutenett || !app.resultat.rutenett.length) return;
    if (!document.getElementById('visTomtefarger')
      || !document.getElementById('visTomtefarger').checked) return;

    const celler = app.resultat.rutenett;
    const rute = Math.max(0.25, app.P.mal.rutestorrelse || 1);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity, maksAvvik = 0;
    for (const c of celler) {
      minX = Math.min(minX, c.x); maksX = Math.max(maksX, c.x);
      minY = Math.min(minY, c.y); maksY = Math.max(maksY, c.y);
      maksAvvik = Math.max(maksAvvik, Math.abs(c.d));
    }
    if (!(maksAvvik > 0.01)) return;
    const nb = Math.round((maksX - minX) / rute) + 1;
    const nh = Math.round((maksY - minY) / rute) + 1;
    if (nb < 2 || nh < 2 || nb * nh > 4e6) return;

    const lerret = document.createElement('canvas');
    lerret.width = nb; lerret.height = nh;
    const g = lerret.getContext('2d');
    const bilde = g.createImageData(nb, nh);
    const d = bilde.data;
    for (const c of celler) {
      const i = Math.round((c.x - minX) / rute);
      const j = nh - 1 - Math.round((c.y - minY) / rute);   // bildet har y nedover
      if (i < 0 || i >= nb || j < 0 || j >= nh) continue;
      const k = (j * nb + i) * 4;
      /* Kvadratrota gjør at de grunne partiene ogsa synes. Med lineær skala
         forsvinner alt under en meter nar ett hjørne er ti meter dypt, og da
         ser tomta ut som om den er urørt der den faktisk skal graves. */
      const styrke = Math.min(1, Math.sqrt(Math.abs(c.d) / maksAvvik));
      if (c.d > 0) { d[k] = 216; d[k + 1] = 30; d[k + 2] = 40; }     // skjæring
      else { d[k] = 52; d[k + 1] = 160; d[k + 2] = 90; }             // fylling
      d[k + 3] = Math.round(40 + 175 * styrke) * (c.inne ? 1 : 0.75);
    }
    g.putImageData(bilde, 0, 0);

    const sone = app.sone;
    const hj = (x, y) => { const g2 = Geo.fraUtm(x, y, sone); return [g2.lat, g2.lon]; };
    const grenser = L.latLngBounds(
      hj(minX - rute / 2, minY - rute / 2),
      hj(maksX + rute / 2, maksY + rute / 2));
    this.lag.tomtefarger = L.imageOverlay(lerret.toDataURL(), grenser, { opacity: 0.85 });
    this.lag.tomtefarger.addTo(this.kart);
    this.lag.tomtefarger.bringToFront();
    if (this.lag.tomt) this.lag.tomt.bringToFront();
  },

  /**
   * Målene rett i kartet: lengden på hver kant og arealet i midten.
   *
   * Det er her man leser dem. A matte se ned i et panel for a vite om den ene
   * siden ble 32 eller 34 meter er tungvint - malet hører hjemme pa streken det
   * gjelder, slik det star pa en situasjonsplan.
   *
   * Etiketten sier ogsa hva slags behandling kanten har fatt, sa man ser med én
   * gang hvilken side som er sprengt vegg og hvilken som er planert skraning.
   * Klikk pa den, sa legger snittet seg vinkelrett pa nettopp den kanten.
   */
  /**
   * Skråningslinja - der skråningen møter terrenget.
   *
   * Det samme som fotavtrykket pa en veg, og like viktig: tomta er kanskje
   * 50 x 70 m, men med fire meters skjæring i morene gar skraningen ti meter ut
   * hele veien rundt, og da er det 70 x 90 m som blir berørt. Star naboen elleve
   * meter unna, gar det - star han ni, gjør det ikke.
   *
   * Rød der det skjæres, grønn der det fylles, slik profilene er farget.
   *
   * Er den ferdige flaten regnet innover fra en yttergrense, tegnes ogsa den,
   * sa man ser hvor mye plass som faktisk blir igjen.
   */
  tegnSkraningslinje() {
    const app = this.app;
    if (!this.lag.skraningsfot) this.lag.skraningsfot = L.layerGroup().addTo(this.kart);
    this.lag.skraningsfot.clearLayers();
    if (!app.erTomt() || !app.terreng) return;
    const t = app.P.tomt;
    const p = app.tomtIUtm(t);
    if (p.length < 3 || t.nivaa.kote == null) return;

    /* Gikk innrykket ikke opp, finnes det ingen ferdig flate a marsjere fra.
       Her sto `app._innerflate || p`, og da ble skraningen tegnet fra det man
       hadde TEGNET - altsa fra yttergrensa og enda lenger ut. Streken gikk
       titalls meter forbi grensa man nettopp hadde sagt at ingenting skulle
       utenfor, og det sa ut som om programmet ikke brydde seg om valget. */
    if (t.omrissBetyr === 'yttergrense' && !app._innerflate) return;
    const indre = app._innerflate || p;
    const fot = Tomtmasser.skraningsfot({
      tomt: { punkter: indre, kanter: t.kanter, nivaa: app.tomtenivaaIUtm(t) },
      mal: app.P.mal, terreng: app.terreng, fjell: app.fjellmodellIUtm(),
      // streken stopper i grensa, akkurat som gravemaskinen ma
      grense: t.omrissBetyr === 'yttergrense' ? p : null
    });
    if (!fot.length) return;
    const hj = q => { const g = Geo.fraUtm(q.x, q.y, app.sone); return [g.lat, g.lon]; };

    /* Tegnes i biter etter type, sa fargen skifter der skjæring gar over i
       fylling. Én strek i én farge ville skjult nettopp det skiftet - og det er
       der man ma se etter, for det er der de to skraningene møtes. */
    /* Gar skraningen utenfor det tegnede omrisset, males den strekningen opp
       tykk og varslende. Ellers ser det ut som en feil at streken krysser
       grensa - og det er nettopp den strekningen som er svaret pa hvor muren ma
       sta. */
    /* MERKINGEN SKAL SI HVOR GALT DET ER, IKKE BARE AT GRENSA BLE RØRT.
       Her ble hver strekning som møtte grensa malt opp tykk og rød-stiplet, og
       det leses som en feil. Men skraningen blir brattet opp til den nar bakken
       - og blir den 1:1,8 der standarden er 1:2,0, er det ingenting a varsle
       om. Blir den 1:0,4, er det ikke lenger en skraning men en vegg, og DET
       ma man se.

       Derfor males den mot standarden for nettopp den kanten:
         innenfor standarden      vanlig strek
         brattere enn standarden  tynn stiplet - «se her»
         brattere enn 1:0,5       tykk stiplet - her ma det mur eller sprengt vegg */
    const mal = app.P.mal;
    const kantFor = i => (t.kanter && t.kanter[i]) || {};
    const alvor = f => {
      /* Punkt der det kreves brattere enn en sprengt bergvegg har ingen
         helning å måle – de har ingen løsning i det hele tatt. De skal merkes
         sterkest, ikke svakest, og uten dette tegnet de seg som helt vanlige
         streker fordi `tvunget` står på null der. */
      if (f.umulig) return 2;
      if (t.omrissBetyr !== 'yttergrense' || !(f.tvunget > 0)) return 0;
      const k = kantFor(f.kant);
      const standard = f.type === 'skjaering'
        ? (k.skjaeringLosmasse != null ? k.skjaeringLosmasse : mal.skjaeringLosmasse)
        : (k.fylling != null ? k.fylling : mal.fylling);
      if (f.tvunget < 0.5) return 2;                       // en vegg, ikke en skraning
      if (f.tvunget < (standard || 2) * 0.9) return 1;     // brattere enn N200 gir
      return 0;
    };

    let bit = [], forrige = null, forrigeUte = null;
    const tøm = () => {
      if (bit.length > 1) {
        const grunn = forrige === 'fylling' ? Farger.fylling : Farger.skjaering;
        L.polyline(bit, forrigeUte === 2
          ? { color: Farger.skjaering, weight: 3.5, opacity: 1, dashArray: '2 4' }
          : forrigeUte === 1
            ? { color: grunn, weight: 2.4, opacity: 1, dashArray: '6 3' }
            : {
              color: grunn, weight: 1.8, opacity: 0.95,
              dashArray: forrige === 'apen' ? '3 5' : null
            }).addTo(this.lag.skraningsfot);
      }
      bit = [];
    };
    for (const f of fot.concat([fot[0]])) {
      const ute = alvor(f);
      if (forrige !== null && (f.type !== forrige || ute !== forrigeUte)) { bit.push(hj(f)); tøm(); }
      forrige = f.type; forrigeUte = ute;
      bit.push(hj(f));
    }
    tøm();

    // den ferdige flaten, nar den er regnet innover fra yttergrensa
    if (app._innerflate) {
      L.polygon(app._innerflate.map(hj), {
        color: Farger.veg, weight: 2, fillColor: Farger.veg, fillOpacity: 0.10,
        dashArray: '6 4'
      }).addTo(this.lag.skraningsfot);
    }
  },

  tegnTomtemal() {
    const app = this.app;
    if (!this.lag.tomtemal) this.lag.tomtemal = L.layerGroup().addTo(this.kart);
    this.lag.tomtemal.clearLayers();
    if (!app.erTomt()) return;
    const t = app.P.tomt;
    if (!t || t.punkter.length < 3) return;
    const p = app.tomtIUtm(t);
    if (p.length < 3) return;
    const kanter = Tomt.kanter(p);
    const bf = app.bakkefaktor();
    const kort = Tomt.Kantkort;

    kanter.forEach(k => {
      const i = k.nr;                 // punktnummer, ikke plass i lista
      const kant = (t.kanter && t.kanter[i]) || {};
      const type = kant.type || 'skraning';
      const midt = Geo.fraUtm((k.a.x + k.b.x) / 2, (k.a.y + k.b.y) / 2, app.sone);
      const valgt = Tomteprofil.retning === 'kant' + i;
      const html = `<div class="kantmal type-${type}${valgt ? ' valgt' : ''}" data-kant="${i}">`
        + `<b>Side ${i + 1} · ${(k.lengde * bf).toFixed(1)} m</b>`
        + `<span>${kort[type] || type}</span></div>`;
      const m = L.marker([midt.lat, midt.lon], {
        interactive: true,
        icon: L.divIcon({ className: '', html, iconSize: [0, 0] })
      });
      /* Klikk pa etiketten apner en liten boks der behandlingen byttes.
         Her sto det at et klikk bare valgte snittet, og da matte man ned i
         tabellen for a bytte fra grøft til sprengt vegg - to steder for det som
         er én tanke. Na gjøres begge deler der man peker. */
      m.bindPopup(() => {
        const d = document.createElement('div');
        d.className = 'kantboks';
        d.innerHTML = `<b>Side ${i + 1}</b><div class="mal">${(k.lengde * bf).toFixed(1)} m</div>`;
        const velg = document.createElement('select');
        velg.innerHTML = Object.entries(Tomt.Kanttyper).map(([v, n]) =>
          `<option value="${v}"${v === type ? ' selected' : ''}>${n}</option>`).join('');
        velg.onchange = () => {
          app.merk('kantbehandling');
          if (!Array.isArray(t.kanter)) t.kanter = [];
          t.kanter[i] = Object.assign({}, t.kanter[i], { type: velg.value });
          this.kart.closePopup();
          app.visKanttabell();
          app.visSnittvelger();
          app.beregnTomt();
        };
        d.appendChild(velg);
        const kn = document.createElement('button');
        kn.className = 'knapp';
        kn.textContent = 'Vis snitt her';
        kn.onclick = () => {
          Tomteprofil.retning = 'kant' + i;
          const v2 = document.getElementById('tp_retning');
          if (v2) v2.value = 'kant' + i;
          Tomteprofil.tegn();
          this.kart.closePopup();
          this.tegnTomtemal();
          app.status(`Snitt vinkelrett på side ${i + 1} – ${kort[type] || type}`);
        };
        d.appendChild(kn);
        return d;
      });
      m.addTo(this.lag.tomtemal);
    });

    const tp = Tomtmasser.tyngdepunktAv(p);
    const senter = Geo.fraUtm(tp.x, tp.y, app.sone);
    const areal = Tomt.areal(p) * bf * bf;
    /* Tallene skal bare vises nar de FINNES. Her sto det `r && r.sum`, og et
       tomt sum-objekt er sant - sa Math.round(undefined) ga «NaN m³ skjæring»
       midt i kartet nar beregningen ikke gikk opp. Det ser ut som om programmet
       er i stykker, mens det egentlig var noe brukeren kunne rettet. */
    const r = app.resultat;
    const harTall = r && r.sum && Number.isFinite(r.sum.skjaering) && Number.isFinite(r.sum.fylling);
    let under;
    if (harTall) {
      under = `<span>${Math.round(r.sum.skjaering).toLocaleString('nb-NO')} m³ skjæring · `
        + `${Math.round(r.sum.fylling).toLocaleString('nb-NO')} m³ fylling</span>`;
    } else if (r && r.merknader && r.merknader.length) {
      under = `<span class="feil">${escapeHtml(r.merknader[0].tekst.slice(0, 70))}</span>`;
    } else {
      under = '<span>sett et ferdig nivå under «Høyde»</span>';
    }
    /* Er tomta tegnet som yttergrense, er det tallet man leser her den FERDIGE
       flaten, ikke det man tegnet. Ellers ser man 1128 m² og tror det er
       plassen man far - mens skraningene har spist det meste. */
    const yttergrense = t.omrissBetyr === 'yttergrense';
    const ferdigAreal = yttergrense && app._innerflate
      ? Tomt.areal(app._innerflate) * bf * bf : null;
    L.marker([senter.lat, senter.lon], {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html: '<div class="tomtemal-areal">'
          + `<b>${Math.round(ferdigAreal != null ? ferdigAreal : areal).toLocaleString('nb-NO')} m²</b>`
          + (ferdigAreal != null
            ? `<span>ferdig flate · tegnet ${Math.round(areal).toLocaleString('nb-NO')} m²</span>` : '')
          + under + '</div>',
        iconSize: [0, 0]
      })
    }).addTo(this.lag.tomtemal);
  },

  tegnTomt() {
    const app = this.app;
    this.lag.tomtHjorner.clearLayers();
    const t = app.erTomt() ? app.P.tomt : null;
    if (!t || !t.punkter.length) {
      this.lag.tomt.setLatLngs([]);
      this.lag.tomtHjelp.setLatLngs([]);
      return;
    }
    const pkt = t.punkter.map(p => [p.lat, p.lon]);

    if (pkt.length >= 3 && this.modus !== 'tegnTomt') {
      this.lag.tomt.setLatLngs(pkt);
      this.lag.tomtHjelp.setLatLngs([]);
    } else {
      // under tegning: hard strek langs det som er tegnet, stiplet tilbake til start
      this.lag.tomt.setLatLngs([]);
      this.lag.tomtHjelp.setLatLngs(pkt.length >= 3 ? pkt.concat([pkt[0]]) : pkt);
    }

    this.tegnTomtemal();
    t.punkter.forEach((pt, i) => {
      const m = L.marker([pt.lat, pt.lon], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="ip-markor"></div>', iconSize: [13, 13], iconAnchor: [6.5, 6.5] })
      });
      m.on('dragstart', () => app.merk('flytt tomtehjørne ' + (i + 1)));
      m.on('drag', ev => {
        pt.lat = ev.latlng.lat; pt.lon = ev.latlng.lng;
        const na = t.punkter.map(q => [q.lat, q.lon]);
        if (this.lag.tomt.getLatLngs()[0] && this.lag.tomt.getLatLngs()[0].length) this.lag.tomt.setLatLngs(na);
        else this.lag.tomtHjelp.setLatLngs(na.concat([na[0]]));
      });
      m.on('dragend', () => app.tomtEndret());
      m.bindPopup(() => {
        const d = document.createElement('div');
        d.innerHTML = `<b>Hjørne ${i + 1}</b> av ${t.punkter.length}<br>`;
        const knapp = document.createElement('button');
        knapp.className = 'knapp';
        knapp.textContent = 'Slett hjørnet';
        knapp.onclick = () => {
          if (t.punkter.length <= 3) { app.status('En tomt kan ikke ha færre enn tre hjørner'); return; }
          app.merk('slett tomtehjørne');
          t.punkter.splice(i, 1);
          /* Kantbehandlingen ligger indeksert pa punktnummer. Sletter man et
             hjørne uten a flytte lista med, blir alt etter det forskjøvet én
             plass: sprengt vegg pa side 4 blir plutselig staende pa side 3.
             Det synes ikke i tallene før noen ser pa kartet. */
          if (Array.isArray(t.kanter) && t.kanter.length) t.kanter.splice(i, 1);
          this.kart.closePopup();
          app.tomtEndret();
        };
        d.appendChild(knapp);
        return d;
      });
      m.addTo(this.lag.tomtHjorner);
    });
  },

  tegn() {
    const app = this.app, P = app.P;

    this.tegnTomt();
    if (app.erTomt()) {
      // vegens lag skal ikke henge igjen fra forrige anlegg
      this.ipMarkorer.forEach(m => this.kart.removeLayer(m));
      this.ipMarkorer = [];
      for (const n of ['linje', 'linjeSkygge', 'hjelpelinje', 'venstreFot', 'hoyreFot']) this.lag[n].setLatLngs([]);
      this.lag.vegkant.clearLayers();
      this.lag.stasjoner.clearLayers();
      return;
    }

    /* ... OG TOMTAS LAG SKAL IKKE HENGE IGJEN PÅ VEGEN.
       Vegens lag ble ryddet over, men ikke tomtas. `tegnTomt()` tømmer bare
       selve polygonet; kantetikettene, arealetiketten, skråningslinja,
       fargeoverlegget og den stiplede snittlinja tegnes fra `visTomtemasser()`,
       som selv starter med `if (!this.erTomt()) return`. Ingen av dem kunne
       altså ryddes i vegmodus. Etter tomtearbeid og et trykk på «▬ Veg» ble de
       liggende oppå veganlegget – og siden polygonet forsvant, så det ut som
       etikettene hørte til vegen. */
    if (this.lag.tomtemal) this.lag.tomtemal.clearLayers();
    if (this.lag.skraningsfot) this.lag.skraningsfot.clearLayers();
    if (this.lag.tomtefarger) { this.kart.removeLayer(this.lag.tomtefarger); this.lag.tomtefarger = null; }

    this.ipMarkorer.forEach(m => this.kart.removeLayer(m));
    this.ipMarkorer = [];
    P.ip.forEach((pt, i) => {
      const m = L.marker([pt.lat, pt.lon], {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="ip-markor"></div>', iconSize: [13, 13], iconAnchor: [6.5, 6.5] })
      }).addTo(this.kart);
      // merket tas før flyttingen starter, sa Angre gar tilbake dit punktet la
      m.on('dragstart', () => app.merk('flytt knekkpunkt ' + (i + 1)));
      m.on('drag', ev => { pt.lat = ev.latlng.lat; pt.lon = ev.latlng.lng; this.tegnLinjeRask(); });
      m.on('dragend', () => app.linjeEndret());
      m.bindPopup(() => {
        const d = document.createElement('div');
        d.innerHTML = `<b>Knekkpunkt ${i + 1}</b><br>Radius <input type="number" step="5" min="0" value="${pt.r || 0}"> m<br>`;
        const inp = d.querySelector('input');
        inp.onchange = () => {
          app.merk('radius i knekkpunkt ' + (i + 1));
          pt.r = parseFloat(inp.value) || 0; app.linjeEndret();
        };
        const b = document.createElement('button');
        b.className = 'knapp'; b.textContent = 'Slett punkt';
        b.onclick = () => {
          app.merk('slett knekkpunkt ' + (i + 1));
          P.ip.splice(i, 1); this.kart.closePopup(); app.linjeEndret();
        };
        d.appendChild(b);
        return d;
      });
      this.ipMarkorer.push(m);
    });

    this.tegnLinjeRask();

    // Fjellobservasjoner
    this.fjellMarkorer.forEach(m => this.kart.removeLayer(m));
    this.fjellMarkorer = [];
    (P.fjell.punkter || []).forEach((pt, i) => {
      const m = L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({ className: '', html: '<div class="fjell-markor"></div>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] })
      }).addTo(this.kart);
      m.bindPopup(() => {
        const d = document.createElement('div');
        d.innerHTML = `<b>Fjellobservasjon</b><br>Dybde <input type="number" step="0.1" value="${pt.dybde}"> m<br>`;
        d.querySelector('input').onchange = ev => { pt.dybde = parseFloat(ev.target.value) || 0; app.grunnEndret(); };
        const b = document.createElement('button');
        b.className = 'knapp'; b.textContent = 'Slett';
        b.onclick = () => { P.fjell.punkter.splice(i, 1); this.kart.closePopup(); app.grunnEndret(); };
        d.appendChild(b);
        return d;
      });
      this.fjellMarkorer.push(m);
    });
  },

  tegnLinjeRask() {
    const app = this.app, P = app.P;
    this.lag.hjelpelinje.setLatLngs(P.ip.map(p => [p.lat, p.lon]));
    const linje = app.byggLinje();
    if (!linje || linje.lengde <= 0) { this.lag.linje.setLatLngs([]); this.lag.linjeSkygge.setLatLngs([]); return; }
    const punkter = [];
    const steg = Math.max(0.5, linje.lengde / 600);
    for (let s = 0; s <= linje.lengde; s += steg) {
      const p = linje.punktVed(s);
      const ll = Geo.fraUtm(p.x, p.y, app.sone);
      punkter.push([ll.lat, ll.lon]);
    }
    const sl = linje.punktVed(linje.lengde);
    punkter.push([Geo.fraUtm(sl.x, sl.y, app.sone).lat, Geo.fraUtm(sl.x, sl.y, app.sone).lon]);
    this.lag.linje.setLatLngs(punkter);
    this.lag.linjeSkygge.setLatLngs(punkter);
  },

  /** Tegner fotavtrykket (skjæringstopp / fyllingsfot) etter en beregning. */
  tegnResultat(res) {
    const app = this.app;
    const v = [], h = [], vk1 = [], vk2 = [];
    for (const pr of res.profiler) {
      const pv = app.linje.punktMedAvvik(pr.s, pr.fotVenstre);
      const ph = app.linje.punktMedAvvik(pr.s, pr.fotHoyre);
      const kv = app.linje.punktMedAvvik(pr.s, -pr.halvbredde);
      const kh = app.linje.punktMedAvvik(pr.s, pr.halvbredde);
      const c = q => { const ll = Geo.fraUtm(q.x, q.y, app.sone); return [ll.lat, ll.lon]; };
      v.push(c(pv)); h.push(c(ph)); vk1.push(c(kv)); vk2.push(c(kh));
    }
    this.lag.venstreFot.setLatLngs(v);
    this.lag.hoyreFot.setLatLngs(h);
    this.lag.vegkant.clearLayers();
    L.polyline(vk1, { color: Farger.veg, weight: 1.2, opacity: .7 }).addTo(this.lag.vegkant);
    L.polyline(vk2, { color: Farger.veg, weight: 1.2, opacity: .7 }).addTo(this.lag.vegkant);

    this.lag.stasjoner.clearLayers();
    const merkeavstand = res.lengdeKart > 1200 ? 100 : 50;
    for (let s = 0; s <= res.lengdeKart + 1e-6; s += merkeavstand) {
      const p = app.linje.punktVed(Math.min(s, res.lengdeKart));
      const ll = Geo.fraUtm(p.x, p.y, app.sone);
      L.marker([ll.lat, ll.lon], {
        icon: L.divIcon({ className: '', html: `<div class="stasjonstall">${Math.round(s)}</div>`, iconSize: [0, 0] }),
        interactive: false
      }).addTo(this.lag.stasjoner);
    }
  },

  /** Viser hvor det valgte tverrprofilet ligger. */
  visStasjon(s) {
    const app = this.app;
    this.lag.markorPos.clearLayers();
    if (!app.linje || app.linje.lengde <= 0) return;
    const p = app.linje.punktVed(Math.min(s, app.linje.lengde));
    const a = app.linje.punktMedAvvik(s, -30), b = app.linje.punktMedAvvik(s, 30);
    const c = q => { const ll = Geo.fraUtm(q.x, q.y, app.sone); return [ll.lat, ll.lon]; };
    L.polyline([c(a), c(b)], { color: '#fff', weight: 1.4, dashArray: '5 4', opacity: .85 }).addTo(this.lag.markorPos);
    L.marker(c(p), { icon: L.divIcon({ className: '', html: '<div class="stasjon-markor"></div>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] }), interactive: false }).addTo(this.lag.markorPos);
  },

  zoomTilLinje() {
    if (this.lag.linje.getLatLngs().length > 1) this.kart.fitBounds(this.lag.linje.getBounds(), { padding: [40, 40] });
  }
};

/* ArcGIS ImageServer som flislag - brukes til skyggerelieff av laserdataene. */
L.TileLayer.ArcgisBilde = L.TileLayer.extend({
  initialize(tjeneste, opsjoner) {
    this._tjeneste = tjeneste;
    L.TileLayer.prototype.initialize.call(this, '', Object.assign({
      maxZoom: 21, attribution: '© Kartverket høydedata', crossOrigin: 'anonymous'
    }, opsjoner));
  },
  getTileUrl(kord) {
    // Flisrutenettet i web-mercator: hele verden er 2 * 20037508,34 m bredt
    const halv = 20037508.342789244;
    const flis = (halv * 2) / Math.pow(2, kord.z);
    const minx = -halv + kord.x * flis;
    const maxy = halv - kord.y * flis;
    const bbox = [minx, maxy - flis, minx + flis, maxy].join(',');
    return `https://hoydedata.no/arcgis/rest/services/${this._tjeneste}/ImageServer/exportImage`
      + `?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=png&transparent=true&f=image`;
  }
});
L.tileLayer.arcgisBilde = (t, o) => new L.TileLayer.ArcgisBilde(t, o);
