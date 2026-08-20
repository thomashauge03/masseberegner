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
    this.lag.vegkant = L.layerGroup().addTo(kart);
    this.lag.stasjoner = L.layerGroup().addTo(kart);
    this.lag.markorPos = L.layerGroup().addTo(kart);

    // Kartet lages før panelene har fatt endelig størrelse
    setTimeout(() => kart.invalidateSize(), 60);
    new ResizeObserver(() => kart.invalidateSize()).observe(document.getElementById('kart'));

    /* Et klikk pa selve linjen setter inn et knekkpunkt der, ogsa nar man
       star i Flytt. Da slipper man a bytte verktøy for a legge til en sving
       man har glemt. */
    this.lag.linje.on('click', e => {
      if (this.modus === 'sondering') return;
      L.DomEvent.stop(e);
      const plass = this.settInnPunkt(e.latlng, 40);
      if (plass >= 0) this.app.status(`Satte inn knekkpunkt ${plass + 1} – dra det dit du vil ha svingen`);
    });

    kart.on('click', e => this.klikk(e));
    kart.on('mousemove', e => this.visInfo(e));
    kart.on('dblclick', () => { if (this.modus === 'tegn') this.settModus('rediger'); });

    this.koblingerUI();
    return this;
  },

  koblingerUI() {
    const p = id => document.getElementById(id);
    p('verktoyTegn').onclick = () => this.settModus('tegn');
    p('verktoyFlytt').onclick = () => this.settModus('rediger');
    p('verktoySondering').onclick = () => this.settModus('sondering');
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
    for (const [id, navn] of [['verktoyTegn', 'tegn'], ['verktoyFlytt', 'rediger'], ['verktoySondering', 'sondering']]) {
      document.getElementById(id).classList.toggle('aktiv', navn === m);
    }
    document.getElementById('kart').style.cursor = (m === 'rediger') ? '' : 'crosshair';
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
    if (P.ip.length < 2 || !app.linje || app.linje.lengde <= 0) return -1;
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
    P.ip.splice(plass, 0, { lat: latlng.lat, lon: latlng.lng, r: P.standardRadius || 0 });
    app.linjeEndret();
    return plass;
  },

  klikk(e) {
    const P = this.app.P;
    if (this.modus === 'tegn') {
      /* Traff klikket linjen et sted mellom to knekkpunkt, er det en ny sving
         som skal inn der - ikke et nytt punkt pa enden. Ellers er det ikke mulig
         a fa mer sving pa et strekk uten a tegne hele linjen om igjen. */
      if (P.ip.length >= 2 && this.settInnPunkt(e.latlng, 25) >= 0) return;
      this.app.merk('nytt knekkpunkt');
      P.ip.push({ lat: e.latlng.lat, lon: e.latlng.lng, r: P.standardRadius || 0 });
      this.app.linjeEndret();
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
  tegn() {
    const app = this.app, P = app.P;

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
