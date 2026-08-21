'use strict';
/** Kartdelen: bakgrunnskart, tegning av senterlinje og observasjonspunkt. */

const Kart = {
  kart: null,
  lag: {},
  ipMarkorer: [],
  fjellMarkorer: [],
  modus: 'rediger',
  app: null,

  init(app) {
    this.app = app;
    const kart = L.map('kart', { zoomControl: true, doubleClickZoom: false }).setView([58.14, 7.07], 13);
    this.kart = kart;

    const kv = navn => L.tileLayer(
      `https://cache.kartverket.no/v1/wmts/1.0.0/${navn}/default/webmercator/{z}/{y}/{x}.png`,
      { maxZoom: 20, maxNativeZoom: 18, attribution: '© Kartverket' }
    );
    this.bakgrunner = { topo: kv('topo'), toporaster: kv('toporaster'), topograatone: kv('topograatone') };
    this.bakgrunner.topo.addTo(kart);
    this.gjeldendeBakgrunn = 'topo';

    // Skyggerelieff laget av laserdataene - viser terrengformene tydelig
    this.skygge = L.tileLayer.arcgisBilde('las_dtm_somlos', { opacity: 0.45 });
    this.skygge.addTo(kart);

    this.losmasse = L.tileLayer.wms('https://geo.ngu.no/mapserver/LosmasserWMS2', {
      layers: 'Losmasse_flate', format: 'image/png', transparent: true, opacity: 0.45,
      attribution: '© NGU'
    });

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
    if (p('modusVeg')) p('modusVeg').onclick = () => this.app.settModus('veg');
    if (p('modusTomt')) p('modusTomt').onclick = () => this.app.settModus('tomt');
    for (const [id, felt] of [['tm_kote', 1], ['tm_nivaamodus', 1], ['tm_fall', 1],
      ['tm_fallretning', 1], ['tm_rutestorrelse', 1]]) {
      const e = p(id);
      if (!e) continue;
      e.onchange = () => {
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
    p('bakgrunnskart').onchange = e => {
      this.kart.removeLayer(this.bakgrunner[this.gjeldendeBakgrunn]);
      this.gjeldendeBakgrunn = e.target.value;
      this.bakgrunner[this.gjeldendeBakgrunn].addTo(this.kart);
      this.bakgrunner[this.gjeldendeBakgrunn].bringToBack();
    };
    p('visSkygge').onchange = e => e.target.checked ? this.skygge.addTo(this.kart) : this.kart.removeLayer(this.skygge);
    p('visLosmasse').onchange = e => e.target.checked ? this.losmasse.addTo(this.kart) : this.kart.removeLayer(this.losmasse);

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
      ['verktoySondering', 'sondering'], ['verktoyTomt', 'tegnTomt']]) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('aktiv', navn === m);
    }
    document.getElementById('kart').style.cursor = (m === 'rediger') ? '' : 'crosshair';
    if (m === 'tegnTomt') {
      this.app.status('Klikk rundt tomta. Dobbeltklikk eller Enter for å lukke den.');
    }
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
    L.TileLayer.prototype.initialize.call(this, '', Object.assign({ maxZoom: 20, attribution: '© Kartverket høydedata' }, opsjoner));
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
