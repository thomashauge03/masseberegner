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
  /** Flest terrengfliser (256 × 256 m) et kart får koter for, og alle profilene til sammen. */
  KOTETAK: 100,
  PROFILTAK: 400,

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
   * og da er også rør med på arket før høydene er regnet. Med `o.terreng` –
   * hentet for lengdeprofilene – får de høydene sine, som i appen.
   *
   * @param {{terreng?: {z:(x:number, y:number) => number}}} [o]
   * @returns {{prosjekt, sone, dato, linjer, kummer, koder, vist:Set}}
   */
  samle(o = {}) {
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
          tilXY, terrengZ: o.terreng ? (x, y) => o.terreng.z(x, y) : () => NaN,
          innmalt: (anlegg, punkt) => (app._innmaltTopp ? app._innmaltTopp(anlegg, punkt) : null)
        });
      } else {
        b = Ror.byggLinjer(Object.assign({}, r, { koder: synlige }), a.mal, tilXY);
      }
      const egne = [];
      for (const l of b.linjer.concat(b.utenHoyde || [])) {
        if (!l.xy || l.xy.length < 2) continue;
        const k = synlige[l.kode] || Ror.tolkKode(l.kode);
        const linje = { kode: l.kode, kilde: plan ? 'planlagt' : 'innmalt', xy: l.xy,
          lengde: Number.isFinite(l.lengde) ? l.lengde : lengdeAv(l.xy), dim: +k.dim || 0, anlegg: a.id, ror: l.id,
          // høydene (topp rør) og det som trengs til bunnen – til lengdeprofilene
          punkter: l.punkter || null, kodeinfo: k, regel: l.plan ? l.plan.regel : null, motsatt: !!(l.plan && l.plan.motsatt) };
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
          kummer.push({ x: best.x, y: best.y, d: (+K.diameter || 1000) / 1000, kode: linje.kode, kilde: 'planlagt',
            linje, navn: K.id });
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
      kummer.push(Object.assign(k, { kode: best ? best.kode : null, linje: best }));
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
   * Valget: hvilke rørtyper, om kartet deles i blad, om typen skal stå
   * skrevet langs rørene, om hver type skal ha sin egen side, bakgrunn og papir.
   * @returns {Promise<?{koder:string[], malestokk:string, tekst:boolean, perType:boolean, bakgrunn:string, papir:string}>}
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
        <div class="rorinnstilling"><label for="rkMalestokk">Kartblad</label>
          <select id="rkMalestokk" class="minivalg"><option value="auto">Delt i blad i 1:1000 når alt ikke får plass på ett ark</option>
            <option value="500">Delt i blad i 1:500</option><option value="1000">Delt i blad i 1:1000</option>
            <option value="2000">Delt i blad i 1:2000</option><option value="en">Alt på ett ark</option></select></div>
        <p class="notis" id="rkBlad" aria-live="polite"></p>
        <div class="rorinnstilling"><label><input type="checkbox" id="rkTekst" checked> Rørtypen i hvite tekstbokser langs rørene, mange steder</label></div>
        <div class="rorinnstilling"><label><input type="checkbox" id="rkPerType" checked> Ett kart per type i tillegg</label></div>
        <div class="rorinnstilling"><label><input type="checkbox" id="rkKoter" checked> Høydekoter fra terrengmodellen</label></div>
        <div class="rorinnstilling"><label><input type="checkbox" id="rkProfiler" checked> Lengdeprofil for hvert rør – terrenget og dybden</label></div>
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
      /* HVOR MANGE ARK DET BLIR, før man trykker: et anlegg på to kilometer i
         1:500 er mange sider, og det skal man vite før de skrives ut. */
      const visBlad = () => {
        const koder = bokser().filter(b => b.checked).map(b => b.closest('tr').dataset.kode);
        const ut = innhold.querySelector('#rkBlad');
        if (!koder.length) { ut.textContent = ''; return; }
        try {
          const s = Rorkart.sider(data, { koder, papir: innhold.querySelector('#rkPapir').value,
            malestokk: innhold.querySelector('#rkMalestokk').value });
          const n = s.filter(x => x.bladNr).length;
          ut.textContent = n ? `Oversikten og ${n} kartblad i 1:${Rapport.tall(s[1].utsnitt.N)}`
            : `Alt på ett ark, i 1:${Rapport.tall(s[0].utsnitt.N)}`;
        } catch (e) { ut.textContent = ''; }
      };
      innhold.querySelector('#rkAlle').onclick = () => { bokser().forEach(b => { b.checked = true; }); visBlad(); };
      innhold.querySelector('#rkIngen').onclick = () => { bokser().forEach(b => { b.checked = false; }); visBlad(); };
      for (const e of [...bokser(), innhold.querySelector('#rkMalestokk'), innhold.querySelector('#rkPapir')]) e.addEventListener('change', visBlad);
      visBlad();
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
        lukk({ koder, malestokk: innhold.querySelector('#rkMalestokk').value,
          tekst: innhold.querySelector('#rkTekst').checked, perType: innhold.querySelector('#rkPerType').checked,
          koter: innhold.querySelector('#rkKoter').checked, profiler: innhold.querySelector('#rkProfiler').checked,
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
   * Lengdeprofilene: for hvert nummererte rør med høyder – stasjonene, topp og
   * bunn innvendig i punktene, terrenget prøvd langs røret, og kummene der de
   * står. Rør uten høyder får ingen profil.
   */
  profiler(data, m) {
    const ut = [];
    for (const l of data.linjer) {
      if (!l.nr || !Array.isArray(l.punkter)) continue;
      const s = [0];
      for (let i = 1; i < l.xy.length; i++) s.push(s[i - 1] + Math.hypot(l.xy[i].x - l.xy[i - 1].x, l.xy[i].y - l.xy[i - 1].y));
      const topp = [], bunn = [];
      l.punkter.forEach((p, i) => {
        if (!Number.isFinite(p.z) || i >= s.length) return;
        topp.push({ s: s[i], z: p.z });
        bunn.push({ s: s[i], z: RorPlan.bunnFraTopp(p.z, l.kodeinfo || {}) });
      });
      if (topp.length < 2) continue;
      const L = s[s.length - 1];
      // punktet ved stasjon sv langs røret
      const ved = sv => {
        let i = 1;
        while (i < s.length - 1 && s[i] < sv) i++;
        const d = s[i] - s[i - 1], u = d > 0 ? Math.max(0, Math.min(1, (sv - s[i - 1]) / d)) : 0;
        return { x: l.xy[i - 1].x + (l.xy[i].x - l.xy[i - 1].x) * u, y: l.xy[i - 1].y + (l.xy[i].y - l.xy[i - 1].y) * u };
      };
      const terreng = [];
      // hver halve til annenhver meter – en lang ledning får ikke fem meter mellom prøvene
      const dS = Math.max(0.5, Math.min(2, L / 600));
      for (let sv = 0; sv < L; sv += dS) { const q = ved(sv); terreng.push({ s: sv, z: m.z(q.x, q.y) }); }
      const qL = ved(L);
      terreng.push({ s: L, z: m.z(qL.x, qL.y) });
      // kummen står der den ligger nærmest røret
      const kummer = (data.kummer || []).filter(k => k.linje === l).map(k => {
        let best = 0, bd = Infinity;
        for (let i = 0; i + 1 < l.xy.length; i++) {
          const a = l.xy[i], b = l.xy[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
          const u = L2 > 0 ? Math.max(0, Math.min(1, ((k.x - a.x) * dx + (k.y - a.y) * dy) / L2)) : 0;
          const d = Math.hypot(k.x - a.x - dx * u, k.y - a.y - dy * u);
          if (d < bd) { bd = d; best = s[i] + u * (s[i + 1] - s[i]); }
        }
        return { s: best, navn: k.navn || '' };
      });
      /* Fallet på et tegnet selvfallsrør, mellom punktene langs røret, I
         FALLRETNINGEN: et stykke som går oppover, er motfall og står som minus.
         Her sto tallverdien, og 98 → 98,3 ble «fall 10–20 ‰». */
      let fall = null;
      if (l.kilde === 'planlagt' && l.regel === 'selvfall') {
        const f = [];
        for (let i = 1; i < bunn.length; i++) {
          const d = bunn[i].s - bunn[i - 1].s;
          const ned = (bunn[i - 1].z - bunn[i].z) * (l.motsatt ? -1 : 1);
          if (d > 0.5) f.push(1000 * ned / d);
        }
        if (f.length) fall = { min: Math.min(...f), maks: Math.max(...f) };
      }
      ut.push({ nr: l.nr, kode: l.kode, kilde: l.kilde, dim: l.dim, lengde: L, topp, bunn, terreng, kummer, fall });
    }
    return ut.sort((a, b) => a.nr - b.nr);
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
      // «Avbryt» når noe hentes over nettet – bakgrunnen eller terrenget
      if (knapp && (valg.bakgrunn || valg.koter || valg.profiler)) { knapp.classList.remove('skjult'); knapp.onclick = () => avbryt.abort(); }
      if (valg.bakgrunn) {
        for (let i = 0; i < sidene.length && !avbryt.signal.aborted; i++) {
          /* KOM IKKE BAKGRUNNEN FOR ÉN SIDE, PRØVES IKKE DE NESTE. Nettet som
             sviktet der, svikter for dem også, og hver side ville ventet hele
             fristen sin. */
          if (feilet) { mangler++; continue; }
          const tekst = `Henter bakgrunnskart ${i + 1} av ${sidene.length}…`;
          const bilde = await this.hentBakgrunn(Rorkart.flisplan(sidene[i].utsnitt, data.sone, valg.bakgrunn), {
            signal: avbryt.signal, framdrift: a => app.framdrift(true, tekst, 0.05 + 0.55 * (i + a) / sidene.length) });
          if (bilde) bakgrunner.set(i, bilde); else { mangler++; feilet = true; }
        }
      }
      /* TERRENGET: kotene for hvert kart, og høydene langs rørene til
         lengdeprofilene – i egne terrengmodeller; appens egen røres ikke.
         MED TAK, FRAMDRIFT OG AVBRYT. To anlegg tretti kilometer fra
         hverandre ga et samlekart i 1:100 000 og nesten 29 000 fliser med
         programmet sperret bak framdriftsboksen. Et kart som trenger flere
         fliser enn taket, får ingen koter, og det står i kartet. */
      let utenProfil = 0, terrengHull = 0, utenKoter = 0, forLangt = false;
      const stopp = new Error('avbrutt');
      const teller = (tekst, fra, til) => (ferdig, totalt) => {
        if (avbryt.signal.aborted) throw stopp;
        app.framdrift(true, tekst, fra + (til - fra) * (totalt ? ferdig / totalt : 1));
      };
      if ((valg.koter || valg.profiler) && !avbryt.signal.aborted) {
        const modeller = new Map();
        const modell = res => { if (!modeller.has(res)) modeller.set(res, new Terreng(data.sone, res)); return modeller.get(res); };
        if (valg.koter) {
          for (let i = 0; i < sidene.length && !avbryt.signal.aborted; i++) {
            const u = sidene[i].utsnitt;
            if (Rorkart.fliserFor(u) > this.KOTETAK) {
              sidene[i].koterMerknad = 'Høydekotene er ikke tegnet – kartet dekker et for stort område';
              utenKoter++;
              continue;
            }
            const res = Rorkart.terrengOpplosning(u.N), m = modell(res);
            await m.lastOmraade([{ x: u.x0, y: u.y0 }, { x: u.x1, y: u.y0 }, { x: u.x1, y: u.y1 }, { x: u.x0, y: u.y1 }], 0,
              teller(`Henter terrenget til kart ${i + 1} av ${sidene.length}…`, 0.6 + 0.15 * i / sidene.length, 0.6 + 0.15 * (i + 1) / sidene.length));
            terrengHull += m.mangler.size;
            sidene[i].koter = Rorkart.lagKoter(u, (x, y) => m.z(x, y), { res });
          }
        }
        if (valg.profiler && !avbryt.signal.aborted) {
          const nokler = Rorkart.flisnokler(data.linjer.filter(l => valg.koder.includes(l.kode)));
          if (nokler.size > this.PROFILTAK) forLangt = true;
          else {
            const m = modell(1);
            await m._lastFliser(nokler, teller('Henter terrenget langs rørene…', 0.76, 0.9));
            terrengHull += m.mangler.size;
            data = this.samle({ terreng: m });
            // nummer bare på rørene som får en profil – de med høyder
            const harHoyder = l => Array.isArray(l.punkter) && l.punkter.filter(p => Number.isFinite(p.z)).length >= 2;
            Rorkart.nummerer(data, valg.koder, harHoyder);
            data.profiler = this.profiler(data, m);
            utenProfil = data.linjer.filter(l => valg.koder.includes(l.kode) && !harHoyder(l)).length;
          }
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
      // alle sidene – kartene og lengdeprofilene
      const n = P.sider.length;
      app.status(`Oversiktskart ${lastNed ? 'lastet ned' : 'laget'} · ${n} side${n === 1 ? '' : 'r'}`
        + ` · ${(bytes.length / 1024).toFixed(0)} kB`
        + (mangler ? ` · bakgrunnskartet kunne ikke hentes for ${mangler} av ${sidene.length}` : '')
        + (hull ? ` · ${hull} fliser manglet i bakgrunnskartet` : '')
        + (data.profiler ? ` · ${data.profiler.length} lengdeprofiler` : '')
        + (utenProfil ? ` · ${utenProfil} rør har ingen høyder og ingen profil` : '')
        + (utenKoter ? ` · ${utenKoter} kart dekker for mye til høydekoter` : '')
        + (forLangt ? ' · rørene er for lange til lengdeprofiler i én fil – velg færre typer' : '')
        + (terrengHull ? ` · ${terrengHull} terrengfliser manglet` : ''));
      return bytes;
    } catch (e) {
      if (avbryt.signal.aborted) { app.status('Oversiktskartet ble avbrutt – ingen fil er laget'); return null; }
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
