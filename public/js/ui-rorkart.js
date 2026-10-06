'use strict';
/**
 * Oversiktskartet for rør – valget, bakgrunnskartet og fila. Selve kartet
 * tegnes i rorkart.js.
 *
 * Rørene hentes fra ALLE røranleggene i prosjektet, innmålte og planlagte,
 * uten å bytte hvilket anlegg som er oppe. Ingenting i prosjektet endres:
 * ingen høyder, ingen koder, ingen farger – og ingen angrepost.
 */
const RorkartUI = {
  app: null,

  init(app) {
    this.app = app;
    return this;
  },

  /** Om prosjektet har noe å tegne: et røranlegg med punkt eller tegnede rør. */
  harRor() {
    const P = this.app && this.app.P;
    return !!P && Array.isArray(P.anlegg) && P.anlegg.some(a => a.type === 'ror' && a.ror
      && ((a.ror.punkter || []).length || (a.ror.plan && a.ror.plan.ror.length)));
  },

  /**
   * Rørene i alle røranleggene, i én sone.
   *
   * ALLE KODER ER MED HER. «Med» i kodetabellen sier hva som tegnes i appen;
   * i kartet er det avkryssingen i valget som bestemmer, og den begynner med
   * det som er med i appen.
   *
   * De planlagte bygges uten terreng: kartet trenger bare hvor rørene ligger,
   * og da er også rør med på arket før høydene er regnet.
   *
   * @returns {{prosjekt, sone, dato, linjer, kummer, koder, vist:Set}}
   */
  samle() {
    const app = this.app, P = app.P;
    const forste = P.anlegg.find(a => a.type === 'ror' && a.ror);
    const sone = app.sone || (forste && forste.ror.sone) || 32;
    const linjer = [], kummer = [], koder = {}, vist = new Set();
    const lengdeAv = xy => {
      let s = 0;
      for (let i = 1; i < xy.length; i++) s += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
      return s;
    };
    const maalteKummer = [];
    for (const a of P.anlegg) {
      if (a.type !== 'ror' || !a.ror) continue;
      const r = a.ror, plan = !!r.plan;
      const synlige = {};
      for (const [kode, k] of Object.entries(r.koder || {})) {
        synlige[kode] = Object.assign({}, k, { vis: true });
        if (k.vis !== false) vist.add(kode);
      }
      const tilXY = Ror.lagTilXY(r.sone, sone);
      let b;
      if (plan) {
        b = RorPlan.bygg({
          plan: r.plan, koder: synlige, mal: (a.mal && a.mal.plan) || {},
          tilSone: (lat, lon) => { const u = Geo.tilUtm(lat, lon, r.sone); return { o: u.x, n: u.y }; },
          tilXY, terrengZ: () => NaN, innmalt: () => null
        });
      } else {
        b = Ror.byggLinjer(Object.assign({}, r, { koder: synlige }), a.mal, tilXY);
      }
      const egne = [];
      for (const l of b.linjer.concat(b.utenHoyde || [])) {
        if (!l.xy || l.xy.length < 2) continue;
        const k = synlige[l.kode] || Ror.tolkKode(l.kode);
        const linje = { kode: l.kode, kilde: plan ? 'planlagt' : 'innmalt', xy: l.xy,
          lengde: Number.isFinite(l.lengde) ? l.lengde : lengdeAv(l.xy), dim: +k.dim || 0, anlegg: a.id, ror: l.id };
        linjer.push(linje);
        egne.push(linje);
        if (!koder[l.kode]) koder[l.kode] = { system: k.system || '', dim: +k.dim || 0 };
      }
      if (plan) {
        /* Kummen står i et punkt på traseen. Røret kan ligge ved siden av
           traseen, så den settes på rørets nærmeste punkt. */
        for (const K of r.plan.kummer || []) {
          const ror = r.plan.ror.find(x => x.id === K.ror);
          const t = ror && r.plan.traseer.find(x => x.id === ror.trase);
          const p = t && t.punkter.find(x => x.id === K.punkt);
          const linje = egne.find(l => l.ror === K.ror);
          if (!p || !linje) continue;
          const u = Geo.tilUtm(p.lat, p.lon, sone);
          let best = linje.xy[0], bd = Infinity;
          for (const q of linje.xy) { const d = Math.hypot(q.x - u.x, q.y - u.y); if (d < bd) { bd = d; best = q; } }
          kummer.push({ x: best.x, y: best.y, d: (+K.diameter || 1000) / 1000, kode: linje.kode, kilde: 'planlagt' });
        }
      } else {
        for (const p of b.objekter || []) {
          if (!/KUM/i.test(p.kode || '')) continue;
          const q = tilXY(p);
          if (Number.isFinite(q.x) && Number.isFinite(q.y)) maalteKummer.push({ x: q.x, y: q.y, d: 1, kilde: 'innmalt' });
        }
      }
    }
    /* En innmålt kum har sin egen kode, ikke rørets. Den hører til røret som
       går nærmest – innen to meter – så den står på typesiden til det røret. */
    for (const k of maalteKummer) {
      let best = null, bd = 2;
      for (const l of linjer) {
        for (let i = 1; i < l.xy.length; i++) {
          const d = Ror.avstandTilStrekk(k, l.xy[i - 1], l.xy[i]);
          if (d < bd) { bd = d; best = l; }
        }
      }
      kummer.push(Object.assign(k, { kode: best ? best.kode : null }));
    }
    const dato = new Date();
    return { prosjekt: P.navn, sone, linjer, kummer, koder, vist,
      dato: `${String(dato.getDate()).padStart(2, '0')}.${String(dato.getMonth() + 1).padStart(2, '0')}.${dato.getFullYear()}` };
  },

  /** Knappen: valget, så fila. */
  async apne() {
    const app = this.app;
    if (this._paagaar) { app.status('Oversiktskartet lages allerede – vent til det er ferdig'); return null; }
    if (!this.harRor()) { app.status('Prosjektet har ingen rør å tegne – importer en fil eller tegn en trase først'); return null; }
    let data;
    try { data = this.samle(); } catch (e) {
      app.status('Klarte ikke å samle rørene til kartet: ' + e.message);
      console.error(e);
      return null;
    }
    if (!data.linjer.length) { app.status('Ingen av rørene har nok punkt til å bli en strek i kartet'); return null; }
    const valg = await this.dialog(data);
    if (!valg) return null;
    return this.lag(valg, true, data);
  },

  /**
   * Valget: hvilke rørtyper, om hver type skal ha sin egen side, bakgrunn og
   * papir.
   * @returns {Promise<?{koder:string[], perType:boolean, bakgrunn:string, papir:string}>}
   */
  dialog(data) {
    return new Promise(los => {
      const boks = document.getElementById('dialog');
      const ramme = boks.querySelector('.dialogboks');
      const innhold = document.getElementById('dialoginnhold');
      const lukkeknapp = document.getElementById('dialogLukk');
      document.getElementById('dialogtittel').textContent = 'Oversiktskart for rørene';
      const farger = Rorkart.fargetabell(Rorkart.kodeinfo(data));
      const kodene = [...farger.keys()].sort((a, b) => {
        const fa = farger.get(a), fb = farger.get(b);
        return fa.system < fb.system ? -1 : fa.system > fb.system ? 1 : fa.nr - fb.nr;
      });
      const rader = kodene.map((kode, i) => {
        const om = Rorkart.omKode(data, kode);
        const med = data.vist.has(kode) || !data.vist.size;
        return `<tr data-kode="${escapeAttr(kode)}">
          <td><input type="checkbox" id="rkk${i}"${med ? ' checked' : ''}></td>
          <th scope="row"><label for="rkk${i}"><span class="rorfarge" style="background:${farger.get(kode).hex}" aria-hidden="true"></span>${escapeHtml(kode)}</label></th>
          <td class="tall">${Rapport.tall(om.lengde)} m</td><td class="tall">${om.antall}</td><td>${escapeHtml(om.kilde)}</td></tr>`;
      }).join('');
      innhold.innerHTML = `
        <p class="notis">Rørene i alle røranleggene i prosjektet, innmålte og planlagte. Hver type får sin
          farge, og tegnforklaringen står i siden. Ingenting i prosjektet endres.</p>
        <table class="rorkoder rorkartkoder"><thead><tr><th scope="col">Med</th><th scope="col">Rørtype</th>
          <th scope="col">Lengde</th><th scope="col">Rør</th><th scope="col">Kilde</th></tr></thead>
          <tbody>${rader}</tbody></table>
        <div class="knapperad"><button class="knapp" id="rkAlle" aria-label="Kryss av alle rørtypene">Alle</button>
          <button class="knapp" id="rkIngen" aria-label="Fjern krysset for alle rørtypene">Ingen</button></div>
        <div class="rorinnstilling"><label><input type="checkbox" id="rkPerType" checked> Ett kart per type i tillegg</label></div>
        <div class="rorinnstilling"><label for="rkBakgrunn">Bakgrunnskart</label>
          <select id="rkBakgrunn" class="minivalg"><option value="topograatone">Gråtone (Kartverket)</option>
            <option value="topo">Topografisk (Kartverket)</option><option value="">Uten</option></select></div>
        <div class="rorinnstilling"><label for="rkPapir">Papir</label>
          <select id="rkPapir" class="minivalg"><option value="A3">A3 liggende</option><option value="A4">A4 liggende</option></select></div>
        <p class="notis" id="rkSvar" role="status"></p>
        <div class="knapperad" style="justify-content:flex-end">
          <button class="knapp" id="rkAvbryt">Avbryt</button>
          <button class="knapp primaer" id="rkLag">Lag PDF</button>
        </div>`;
      const bokser = () => [...innhold.querySelectorAll('tbody input[type=checkbox]')];
      innhold.querySelector('#rkAlle').onclick = () => bokser().forEach(b => { b.checked = true; });
      innhold.querySelector('#rkIngen').onclick = () => bokser().forEach(b => { b.checked = false; });
      let avgjort = false;
      const gammelLukk = lukkeknapp.onclick;
      // markøren tilbake dit den kom fra når valget lukkes – knappen som åpnet det
      const forrige = document.activeElement;
      const taste = e => { if (e.key === 'Escape') lukk(null); };
      const lukk = svar => {
        if (avgjort) return;
        avgjort = true;
        boks.classList.add('skjult');
        ramme.classList.remove('bred');
        lukkeknapp.onclick = gammelLukk;
        document.removeEventListener('keydown', taste);
        if (forrige && typeof forrige.focus === 'function') forrige.focus();
        los(svar);
      };
      lukkeknapp.onclick = () => lukk(null);
      innhold.querySelector('#rkAvbryt').onclick = () => lukk(null);
      innhold.querySelector('#rkLag').onclick = () => {
        const koder = bokser().filter(b => b.checked).map(b => b.closest('tr').dataset.kode);
        // ingen valgt er ikke et kart – det sies her, i dialogen, der det kan rettes
        if (!koder.length) { innhold.querySelector('#rkSvar').textContent = 'Kryss av minst én rørtype.'; return; }
        lukk({ koder, perType: innhold.querySelector('#rkPerType').checked,
          bakgrunn: innhold.querySelector('#rkBakgrunn').value, papir: innhold.querySelector('#rkPapir').value });
      };
      document.addEventListener('keydown', taste);
      ramme.classList.add('bred');
      boks.classList.remove('skjult');
      const forste = innhold.querySelector('tbody input[type=checkbox]');
      if (forste) forste.focus();
    });
  },

  /**
   * Bakgrunnskartet for et utsnitt: flisene satt sammen på et lerret, som JPEG.
   *
   * Flisene hentes med fetch, så lerretet ikke blir «skittent» – tjenesten
   * svarer Access-Control-Allow-Origin: *. En flis som ikke kommer, prøves én
   * gang til og blir ellers hvit; mangler mer enn halvparten, er det ikke et
   * kart, og siden lages uten. Hvor mange som manglet, står i svaret.
   *
   * ÉN FRIST FOR HELE SIDEN, og «Avbryt» stopper alt. Her ventet hver flis
   * opp til 15 s for seg, seks om gangen: en A3-side kunne stå i over seks
   * minutter på et nett som ikke svarte, med hele programmet bak
   * framdriftsboksen.
   *
   * @param {object} plan  fra Rorkart.flisplan
   * @param {{signal?:AbortSignal, frist?:number, framdrift?:(andel:number) => void}} [o]
   * @returns {Promise<?{bytes, bredde, hoyde, mangler:number, av:number}>}
   */
  async hentBakgrunn(plan, o = {}) {
    if (!plan || !plan.fliser.length || !plan.bredde || !plan.hoyde) return null;
    const stopp = new AbortController();
    const frist = setTimeout(() => stopp.abort(), o.frist || 40000);
    const avbryt = () => stopp.abort();
    if (o.signal) { if (o.signal.aborted) stopp.abort(); else o.signal.addEventListener('abort', avbryt); }
    const l = document.createElement('canvas');
    l.width = plan.bredde; l.height = plan.hoyde;
    const c = l.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, l.width, l.height);
    let ok = 0, ferdig = 0;
    const hent = async f => {
      for (let forsok = 0; forsok < 2 && !stopp.signal.aborted; forsok++) {
        try {
          const svar = await fetch(f.url, { mode: 'cors', signal: stopp.signal });
          // 4xx: flisa finnes ikke – å spørre igjen gir det samme svaret
          if (!svar.ok) { if (svar.status < 500) return; continue; }
          const bilde = await createImageBitmap(await svar.blob());
          c.drawImage(bilde, Math.floor(f.px), Math.floor(f.py));
          if (bilde.close) bilde.close();
          ok++;
          return;
        } catch (e) { /* prøves én gang til, om fristen ikke er ute */ }
      }
    };
    const ko = plan.fliser.slice();
    try {
      // seks om gangen – nok til å gå fort, få nok til ikke å hamre på tjenesten
      await Promise.all(Array.from({ length: Math.min(6, ko.length) }, async () => {
        while (ko.length && !stopp.signal.aborted) {
          await hent(ko.shift());
          ferdig++;
          if (o.framdrift) o.framdrift(ferdig / plan.fliser.length);
        }
      }));
      if (ok < plan.fliser.length / 2) return null;
      const blob = await new Promise(los => l.toBlob(los, 'image/jpeg', 0.85));
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), bredde: plan.bredde, hoyde: plan.hoyde,
        mangler: plan.fliser.length - ok, av: plan.fliser.length };
    } finally {
      clearTimeout(frist);
      if (o.signal) o.signal.removeEventListener('abort', avbryt);
      l.width = 0; l.height = 0;           // sju megapiksler per side slippes med en gang
    }
  },

  /**
   * Lager PDF-en.
   * @param {{koder, perType, bakgrunn, papir}} valg
   * @param {boolean} [lastNed]
   * @param {object} [data] fra `samle`
   * @returns {Promise<?Uint8Array>}
   */
  async lag(valg, lastNed = true, data = null) {
    const app = this.app;
    if (this._paagaar) { app.status('Oversiktskartet lages allerede – vent til det er ferdig'); return null; }
    this._paagaar = true;
    const avbryt = new AbortController();
    const knapp = document.getElementById('framdriftAvbryt');
    app.framdrift(true, 'Lager oversiktskartet…', 0.05);
    try {
      data = data || this.samle();
      const sidene = Rorkart.sider(data, valg);
      const bakgrunner = new Map();
      let mangler = 0, feilet = false;
      if (valg.bakgrunn) {
        if (knapp) { knapp.classList.remove('skjult'); knapp.onclick = () => avbryt.abort(); }
        for (let i = 0; i < sidene.length && !avbryt.signal.aborted; i++) {
          /* KOM IKKE BAKGRUNNEN FOR ÉN SIDE, PRØVES IKKE DE NESTE. Nettet som
             sviktet der, svikter for dem også, og hver side ville ventet hele
             fristen sin. */
          if (feilet) { mangler++; continue; }
          const tekst = `Henter bakgrunnskart ${i + 1} av ${sidene.length}…`;
          const bilde = await this.hentBakgrunn(Rorkart.flisplan(sidene[i].utsnitt, data.sone, valg.bakgrunn), {
            signal: avbryt.signal, framdrift: a => app.framdrift(true, tekst, 0.05 + 0.85 * (i + a) / sidene.length) });
          if (bilde) bakgrunner.set(i, bilde); else { mangler++; feilet = true; }
        }
      }
      if (avbryt.signal.aborted) { app.status('Oversiktskartet ble avbrutt – ingen fil er laget'); return null; }
      app.framdrift(true, 'Tegner oversiktskartet…', 0.92);
      const P = Rorkart.lagPdf(data, valg, sidene, bakgrunner, mangler ? 'Bakgrunnskartet kunne ikke hentes' : null);
      const bytes = await P.bygg();
      const hull = [...bakgrunner.values()].reduce((s, b) => s + (b.mangler || 0), 0);
      if (lastNed) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = Lager.filnavn(app.P.navn) + '_oversiktskart.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      app.status(`Oversiktskart ${lastNed ? 'lastet ned' : 'laget'} · ${sidene.length} side${sidene.length === 1 ? '' : 'r'}`
        + ` · ${(bytes.length / 1024).toFixed(0)} kB`
        + (mangler ? ` · bakgrunnskartet kunne ikke hentes for ${mangler} av ${sidene.length}` : '')
        + (hull ? ` · ${hull} fliser manglet i bakgrunnskartet` : ''));
      return bytes;
    } catch (e) {
      app.status('Klarte ikke å lage oversiktskartet: ' + e.message);
      console.error(e);
      return null;
    } finally {
      this._paagaar = false;
      if (knapp) { knapp.classList.add('skjult'); knapp.onclick = null; }
      app.framdrift(false);
    }
  }
};

if (typeof module !== 'undefined') module.exports = RorkartUI;
