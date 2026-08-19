'use strict';
/** Massesammendrag i sidepanelet, utskriftsrapport og eksport. */

const Rapport = {
  app: null,
  init(app) { this.app = app; return this; },

  tall(v, des = 0) {
    if (!isFinite(v)) return '–';
    return v.toLocaleString('nb-NO', { minimumFractionDigits: des, maximumFractionDigits: des });
  },

  /** Sammendraget i sidepanelet. */
  visSammendrag(res) {
    const boks = document.getElementById('massesammendrag');
    if (!res) { boks.innerHTML = '<span class="tomtekst">Tegn en senterlinje i kartet for å komme i gang.</span>'; return; }
    const s = res.sum, b = res.balanse, f = res.faktorer;
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
    const varselHtml = alvorlig + (varsler.length
      ? `<div class="varselboks"><b>${varsler.length} merknad${varsler.length === 1 ? '' : 'er'}</b>`
      + varsler.slice(0, 40).map(v => `<div>prof ${v.s.toFixed(0)} – ${v.tekst}</div>`).join('')
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
        <h4>Masser – prosjektert fast volum (p.f.m³)</h4>
        <div class="sumrad"><span>Rensk / avdekking</span><span class="verdi">${t(s.rensk)} m³</span></div>
        <div class="strek"></div>
        <div class="sumrad stor"><span class="merke-skjaering">Skjæring totalt</span><span class="verdi merke-skjaering">${t(s.skjaering)} m³</span></div>
        <div class="sumrad"><span>&nbsp;&nbsp;– løsmasse</span><span class="verdi">${t(s.skjaeringLosmasse)} m³</span></div>
        <div class="sumrad"><span class="merke-fjell">&nbsp;&nbsp;– fjell (sprengning)</span><span class="verdi merke-fjell">${t(s.skjaeringFjell)} m³</span></div>
        <div class="strek"></div>
        <div class="sumrad stor"><span class="merke-fylling">Fylling</span><span class="verdi merke-fylling">${t(s.fylling)} m³</span></div>
        <div class="sumrad"><span>Bærelag</span><span class="verdi">${t(s.baerelag)} m³</span></div>
        <div class="sumrad"><span>Slitelag</span><span class="verdi">${t(s.slitelag)} m³</span></div>
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
      </div>

      <div class="sumkort">
        <h4>Massetransport (Brucknerkurve)</h4>
        ${this.brucknerSvg(res)}
        <div class="sumrad"><small>Over null = overskudd bakover, under null = behov for tilkjørt masse.</small></div>
      </div>

      <div class="sumkort">
        <h4>Grunnlag</h4>
        <div class="sumrad"><span>Terrengmodell</span><span class="verdi"><small>Kartverket DTM1, 1 m laser</small></span></div>
        <div class="sumrad"><span>Koordinatsystem</span><span class="verdi"><small>EUREF89 UTM${this.app.sone}</small></span></div>
        <div class="sumrad"><span>Lengdekorreksjon</span><span class="verdi"><small>${res.bakkefaktor === 1 ? 'av' : '×' + res.bakkefaktor.toFixed(6)}</small></span></div>
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

  apneRapport() {
    const app = this.app, res = app.resultat;
    if (!res) { alert('Ingen beregning å rapportere ennå.'); return; }
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

    const merknader = res.merknader.map(v => `<tr><td>${v.s.toFixed(0)}</td><td>${v.type}</td><td>${v.tekst}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8">
<title>Masseberegning – ${app.P.navn}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap">
<style>
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
  .knapp{background:#d81e28;color:#fff;border:2px solid #0b0b0c;box-shadow:3px 3px 0 0 #0b0b0c;
    padding:7px 16px;font-weight:700;text-transform:uppercase;cursor:pointer;font-family:inherit}
  @media print{body{margin:12mm} .ikkeSkriv{display:none} .brevhode{margin:-12mm -12mm 14px;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
    th,.sum td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="brevhode">
  <img src="${location.origin}/bilde/hm-logo.png" alt="Hauge Maskin">
  <div>
    <div class="tittel">Masseberegning</div>
    <div class="under">${escapeHtml(app.P.navn)}</div>
  </div>
  <div class="hoyre">
    ${dato}<br>Veglengde ${t(res.lengde, 1)} m<br>${klassenavn(app)}
  </div>
</div>
<button class="ikkeSkriv knapp" onclick="window.print()" style="float:right">Skriv ut / lagre som PDF</button>
<div class="liten">Terrengmodell: Kartverket DTM1 (1 m laserdata) · EUREF89 UTM${app.sone}</div>

<div class="to">
<div>
<h2>Sammendrag</h2>
<table class="noekkel">
<tr><td>Rensk / avdekking (${m.renskDybde} m + ${m.renskUtenfor} m utenfor)</td><td>${t(s.rensk)} m³</td></tr>
<tr><td>Skjæring i løsmasse</td><td>${t(s.skjaeringLosmasse)} p.f.m³</td></tr>
<tr><td>Skjæring i fjell (sprengning)</td><td>${t(s.skjaeringFjell)} p.f.m³</td></tr>
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

${merknader ? `<h2>Merknader</h2><table><thead><tr><th>Profil</th><th>Type</th><th>Merknad</th></tr></thead><tbody>${merknader}</tbody></table>` : ''}

<div class="bunn liten">
<b>Hauge Maskin</b> · Beregnet i Massekalk.
Terrenghøydene er hentet fra Kartverket sin nasjonale høydemodell (DTM1, 1×1 m fra flybåren laserskanning)
og er kontrollert mot Kartverket sitt punkt-API.
Terrengmodellen viser terrenget slik det var da området sist ble skannet –
<span class="raud">kontroller mot befaring før kontrahering</span>.
Dybden til fjell er den største usikkerheten i sprengningsvolumet.
</div>
</body></html>`;

    const v = window.open('', '_blank');
    v.document.write(html);
    v.document.close();
  },

  /* ---------------- Eksport ---------------- */

  lastNed(navn, innhold, type = 'text/csv;charset=utf-8') {
    const blob = new Blob(['﻿' + innhold], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = navn;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  eksportStikning() {
    const app = this.app, res = app.resultat;
    if (!res) return alert('Ingen beregning ennå.');
    const rader = ['Profil;Nord;Ost;Z_veg;Z_terreng;VK_nord;VK_ost;VK_z;HK_nord;HK_ost;HK_z'];
    for (const p of res.profiler) {
      const vk = app.linje.punktMedAvvik(p.s, -p.halvbredde);
      const hk = app.linje.punktMedAvvik(p.s, p.halvbredde);
      const mal = res.mal;
      const zk = p.vegnivaa - mal.tverrfall * p.halvbredde;
      rader.push([
        p.s.toFixed(2), p.y.toFixed(3), p.x.toFixed(3), p.vegnivaa.toFixed(3),
        isFinite(p.terrengSenter) ? p.terrengSenter.toFixed(3) : '',
        vk.y.toFixed(3), vk.x.toFixed(3), zk.toFixed(3),
        hk.y.toFixed(3), hk.x.toFixed(3), zk.toFixed(3)
      ].join(';'));
    }
    this.lastNed(this.app.P.navn.replace(/\W+/g, '_') + '_stikning.csv', rader.join('\r\n'));
  },

  eksportMasser() {
    const res = this.app.resultat;
    if (!res) return alert('Ingen beregning ennå.');
    const rader = ['Profil;Radius;Breddeutvidelse;Z_veg;Z_terreng;Fjelldybde;A_skjaering;A_skjaering_fjell;A_fylling;A_rensk;V_skjaering_til_neste;V_fjell;V_fylling;V_rensk;V_baerelag;V_slitelag'];
    res.profiler.forEach((p, i) => {
      const iv = res.intervaller[i];
      rader.push([
        p.s.toFixed(2), isFinite(p.radius) ? p.radius.toFixed(1) : '', p.utvidelse.toFixed(2),
        p.vegnivaa.toFixed(3), isFinite(p.terrengSenter) ? p.terrengSenter.toFixed(3) : '', p.fjelldybde.toFixed(2),
        p.areal.skjaering.toFixed(2), p.areal.skjaeringFjell.toFixed(2), p.areal.fylling.toFixed(2), p.areal.rensk.toFixed(2),
        iv ? iv.volum.skjaering.toFixed(2) : '', iv ? iv.volum.skjaeringFjell.toFixed(2) : '',
        iv ? iv.volum.fylling.toFixed(2) : '', iv ? iv.volum.rensk.toFixed(2) : '',
        iv ? iv.volum.baerelag.toFixed(2) : '', iv ? iv.volum.slitelag.toFixed(2) : ''
      ].join(';'));
    });
    this.lastNed(this.app.P.navn.replace(/\W+/g, '_') + '_masser.csv', rader.join('\r\n'));
  },

  eksportGeojson() {
    const app = this.app, res = app.resultat;
    if (!res) return alert('Ingen beregning ennå.');
    const ll = q => { const g = Geo.fraUtm(q.x, q.y, app.sone); return [+g.lon.toFixed(8), +g.lat.toFixed(8)]; };
    const senter = res.profiler.map(p => ll({ x: p.x, y: p.y }));
    const venstre = res.profiler.map(p => ll(app.linje.punktMedAvvik(p.s, p.fotVenstre)));
    const hoyre = res.profiler.map(p => ll(app.linje.punktMedAvvik(p.s, p.fotHoyre)));
    const geo = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { navn: app.P.navn, type: 'senterlinje', lengde: +res.lengde.toFixed(2) }, geometry: { type: 'LineString', coordinates: senter } },
        { type: 'Feature', properties: { type: 'fotavtrykk' }, geometry: { type: 'Polygon', coordinates: [venstre.concat(hoyre.slice().reverse(), [venstre[0]])] } },
        ...app.P.fjell.punkter.map(p => ({ type: 'Feature', properties: { type: 'fjellobservasjon', dybde: p.dybde }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))
      ]
    };
    this.lastNed(app.P.navn.replace(/\W+/g, '_') + '.geojson', JSON.stringify(geo, null, 1), 'application/geo+json');
  }
};

function klassenavn(app) {
  const k = Veiklasser[app.P.mal.veiklasse];
  return k ? k.navn : 'Egne verdier';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
