'use strict';
/**
 * Skjermkortet bak 3D-visningene.
 *
 * Tegner3d (ui-3d.js) bestemmer HVA som tegnes: gitre, lag, farger og
 * kamera. Her ligger bare HVORDAN skjermkortet gjør det.
 *
 * GEOMETRIEN BYGGES ÉN GANG, KAMERAET SENDES HVERT BILDE.
 * Prosessoren regnet farge og lys for hver celle og fylte hver piksel i hvert
 * eneste bilde – og måtte senke oppløsningen til 40 % for å holde følge. Her
 * lastes cellene opp én gang som en mesh, og mens man drar, flyr eller går,
 * er det bare et dusin kameratall som sendes.
 *
 * ETT LERRET FOR ALLE.
 * Skjermkortet tegner i et skjult lerret som deles av alle visningene og
 * rapportene, og bildet kopieres inn i visningens eget 2D-lerret. Da finnes
 * det én WebGL-kontekst i hele programmet (nettleserne har et tak på seksten),
 * meshene deles på tvers, og alt som leste 2D-lerretet – rapportbildene,
 * meldingene, prøvene – virker som før.
 *
 * Uten WebGL2, eller mens konteksten er mistet, svarer `klar()` nei, og
 * Tegner3d tegner med prosessoren som før.
 */
const Gl3d = {
  lerret: null,
  gl: null,
  /** Konteksten er mistet. Prosessoren tegner til den kommer tilbake. */
  tapt: false,
  /** WebGL2 finnes ikke, eller shaderne ville ikke bygges. Prøves ikke igjen. */
  feilet: false,
  /** Mesher bygd. Prøvene krever at tallet står stille mens man beveger seg. */
  bygget: 0,
  /** WebGL-lerreter laget. Skal aldri bli mer enn ett. */
  lerreter: 0,
  /** Felles nullpunkt for alle mesher, i hele kilometer – se `nyttBilde`. */
  origo: null,
  _mesher: new Map(),
  _bildenr: 0,
  _kontekstNr: 0,
  _idFor: new WeakMap(),
  _nesteId: 1,
  _hashFor: new WeakMap(),
  _fbo: {},
  _asynk: null,

  klar() {
    if (this.feilet || this.tapt) return false;
    return !!this.gl || this._start();
  },

  _start() {
    if (typeof document === 'undefined') { this.feilet = true; return false; }
    const c = document.createElement('canvas');
    c.width = 2; c.height = 2;
    let gl = null;
    try {
      gl = c.getContext('webgl2', {
        antialias: true, alpha: false, depth: true, stencil: true,
        premultipliedAlpha: false, preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
    } catch (e) { gl = null; }
    if (!gl) { this.feilet = true; return false; }
    this.lerret = c; this.gl = gl; this.lerreter++;
    /* MISTET KONTEKST ER IKKE EN FEIL, DET ER VÆR.
       En driver som starter på nytt, en fane som har ligget lenge i
       bakgrunnen – skjermkortet tar konteksten tilbake uten å spørre. Da
       tegner prosessoren, og når den kommer tilbake, bygges alt på nytt. */
    c.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.tapt = true;
      this._glemAlt(false);
      this._tegnAktive();
    });
    c.addEventListener('webglcontextrestored', () => {
      this.tapt = false;
      this._kontekstNr++;
      if (!this._lagProgram()) { this.feilet = true; return; }
      this._tegnAktive();
    });
    if (!this._lagProgram()) { this.feilet = true; this.gl = null; return false; }
    return true;
  },

  _tegnAktive() {
    for (const v of [typeof Veg3d !== 'undefined' ? Veg3d : null,
      typeof Tomt3d !== 'undefined' ? Tomt3d : null,
      typeof Ror3d !== 'undefined' ? Ror3d : null]) {
      if (v && v.aktiv) v.tegn();
    }
  },

  /* KAMERAET ER DET SAMME SOM I `Tegner3d._kamera`, LINJE FOR LINJE.
     rx, sy og w regnes nøyaktig som `kam.punkt()`; projeksjonen
     `px = cx + F·rx/w` er skrevet om til klippkoordinater. Da havner
     skjermkortet og overleggsstrekene på de samme pikslene.
     DYBDEN ER LINEÆR I w, som prosessorens dybdebuffer. Klippingen mot
     nærplanet bruker den vanlige, lineære klipp-z; selve dybdeprøven går på
     `gl_FragDepth`, som har jevn presisjon helt ut: 24 bit over 50 km er tre
     millimeter. Med vanlig hyperbolsk dybde og et nærplan på 35 cm ville to
     flater en kilometer unna slåss om pikslene. */
  _VS: `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec3 aFarge;
layout(location = 3) in vec3 aId;
uniform vec3 uOff;
uniform float uOv;
uniform vec4 uRot;
uniform float uD;
uniform vec4 uProj;
uniform vec2 uNF;
out vec3 vNorm;
out vec3 vVerden;
out float vW;
flat out vec3 vFarge;
flat out vec3 vId;
void main() {
  vec2 xy = aPos.xy + uOff.xy;
  float z = (aPos.z - uOff.z) * uOv;
  float rx = xy.x * uRot.x + xy.y * uRot.y;
  float ry = xy.x * uRot.y - xy.y * uRot.x;
  float w = uD - (ry * uRot.z + z * uRot.w);
  float sy = ry * uRot.w - z * uRot.z;
  float a = (uNF.y + uNF.x) / (uNF.y - uNF.x);
  float b = -2.0 * uNF.y * uNF.x / (uNF.y - uNF.x);
  gl_Position = vec4(uProj.x * rx + uProj.y * w, -uProj.z * sy + uProj.w * w, a * w + b, w);
  vNorm = aNorm;
  vVerden = vec3(xy, aPos.z);
  vW = w;
  vFarge = aFarge;
  vId = aId;
}`,

  /* uPass: 0 = bildet, 1 = cellenummer, 2 = dybde kodet i RGB.
     Lyset er `_lys` i ui-3d.js, med én forskjell: normalen er utjevnet over
     nabocellene, så lyset glir over flaten i stedet for å skifte rute for
     rute. Fargen er flat per celle (`flat`), som før – en skjæringscelle ved
     siden av en fyllingscelle skal ikke få en rødgrønn overgang. */
  _FS: `#version 300 es
precision highp float;
in vec3 vNorm;
in vec3 vVerden;
in float vW;
flat in vec3 vFarge;
flat in vec3 vId;
uniform int uPass;
uniform float uIdPa;
uniform vec2 uNF;
uniform vec4 uOye;
out vec4 ut;
void main() {
  gl_FragDepth = clamp((vW - uNF.x) / (uNF.y - uNF.x), 0.0, 1.0);
  if (uPass == 1) { ut = uIdPa > 0.5 ? vec4(vId, 1.0) : vec4(0.0); return; }
  if (uPass == 2) {
    float s = floor(clamp(vW / uNF.y, 0.0, 1.0) * 16777215.0);
    float r = floor(s / 65536.0);
    float g = floor((s - r * 65536.0) / 256.0);
    float b = s - r * 65536.0 - g * 256.0;
    ut = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
    return;
  }
  vec3 n = normalize(vNorm);
  float ly;
  if (uOye.w > 0.5 && dot(n, uOye.xyz - vVerden) < 0.0) ly = 0.45;
  else ly = 0.55 + 0.45 * clamp(dot(n, vec3(-0.4, 0.4, 0.82)), 0.0, 1.0);
  ut = vec4(min(vFarge * ly, vec3(1.0)), 1.0);
}`,

  _lagProgram() {
    const gl = this.gl;
    const lag = (type, kilde) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, kilde);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        console.warn('Gl3d: ' + gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = lag(gl.VERTEX_SHADER, this._VS), fs = lag(gl.FRAGMENT_SHADER, this._FS);
    if (!vs || !fs) return false;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      console.warn('Gl3d: ' + gl.getProgramInfoLog(p));
      return false;
    }
    this._p = p;
    this._u = {};
    for (const n of ['uOff', 'uOv', 'uRot', 'uD', 'uProj', 'uNF', 'uPass', 'uIdPa', 'uOye']) {
      this._u[n] = gl.getUniformLocation(p, n);
    }
    this._fbo = {};
    return true;
  },

  /**
   * Et nytt bilde begynner. Nullpunktet følger det AKTIVE gitteret.
   *
   * UTM-tall er sju sifre, og et 32-biters flyttall har sju. Lastet man dem
   * opp som de er, ville modellen skjelvet med desimeter når man snur den.
   * Alle mesher står derfor mot ett felles nullpunkt, regnet i dobbel
   * presisjon her. FELLES, ikke ett per mesh: to flater i nøyaktig samme
   * høyde – en tomt og naboens terreng – må gi bit-like dybder, ellers slåss
   * de om pikslene. Flytter man seg mer enn 50 km (et annet prosjekt), bygges
   * alt på nytt mot et nytt nullpunkt.
   */
  nyttBilde(g) {
    this._bildenr++;
    let x = g && g.midtX, y = g && g.midtY;
    if (!(Number.isFinite(x) && Number.isFinite(y)) && g && g.wx) {
      for (let k = 0; k < g.wx.length; k++) {
        if (g.finnes[k] && Number.isFinite(g.wx[k])) { x = g.wx[k]; y = g.wy[k]; break; }
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const o = this.origo;
    if (o && Math.abs(x - o.x) < 50000 && Math.abs(y - o.y) < 50000) return;
    this._glemAlt(true);
    this.origo = { x: Math.round(x / 1000) * 1000, y: Math.round(y / 1000) * 1000 };
  },

  _nr(o) {
    let v = this._idFor.get(o);
    if (!v) { v = this._nesteId++; this._idFor.set(o, v); }
    return v;
  },

  /* `krev` kan være en ny tabell i hvert bilde med det samme innholdet –
     `_ogsaa` og helflatemasken lager nye. Da er identiteten verdiløs, og
     innholdet er det som teller. 50 000 byte er under et tidels millisekund. */
  _hash(a) {
    let v = this._hashFor.get(a);
    if (v !== undefined) return v;
    let h = 2166136261;
    for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    v = (h >>> 0).toString(36) + ':' + a.length;
    this._hashFor.set(a, v);
    return v;
  },

  /**
   * Meshen for ett lag av ett gitter, bygd bare når nøkkelen er ny.
   *
   * @param {string} stempel alt fargen avhenger av utenom gitteret, høyden og
   *   masken: visning, lagbrytere, tema, fargeskala, arealdekke. Se
   *   `Tegner3d._fargestempel`. Står noe utenfor nøkkelen, blir fargen stående
   *   fra forrige gang – og prøven «samme bilde» er den som ser det.
   */
  mesh(g, lag, steg, stempel) {
    if (!this.gl || !this.origo || !g || !lag || !lag.hoyde) return null;
    const s = Math.max(1, steg | 0);
    const nokkel = this._nr(g) + '|' + this._nr(lag.hoyde) + '|'
      + (lag.krev ? this._hash(lag.krev) : '-') + '|' + s + '|' + g.maksAvvik + '|' + stempel;
    let m = this._mesher.get(nokkel);
    if (!m) {
      m = this._bygg(g, lag, s);
      this._mesher.set(nokkel, m);
    }
    m.sist = this._bildenr;
    return m;
  },

  /**
   * Nodene som hjørner, cellene som indekser.
   *
   * HJØRNET k00 ER CELLAS EGET. Fargen og cellenummeret ligger i noden, og
   * `flat` i shaderen tar dem fra trekantens SISTE hjørne. Begge trekantene
   * i en celle slutter derfor på k00 – og k00 er nedre venstre hjørne i
   * nøyaktig én celle. Én node per celle, og ingen celle låner nabofargen.
   *
   * Cellene som tegnes er de samme som `_raster` tegner, med de samme fire
   * prøvene: finnes, krev, celleSperre og farge ≠ 0.
   */
  _bygg(g, lag, s) {
    const gl = this.gl;
    const nb = g.nb, nh = g.nh, hoyde = lag.hoyde, krev = lag.krev;
    const rader = [], kol = [];
    for (let j = 0; j < nh - 1; j += s) rader.push(j);
    rader.push(nh - 1);
    for (let i = 0; i < nb - 1; i += s) kol.push(i);
    kol.push(nb - 1);
    const nr = rader.length, nk = kol.length, nv = nr * nk;
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const far = new Uint8Array(nv * 4);
    const ids = new Uint8Array(nv * 4);
    const ox = this.origo.x, oy = this.origo.y;
    for (let jj = 0; jj < nr; jj++) {
      for (let ii = 0; ii < nk; ii++) {
        const k = rader[jj] * nb + kol[ii], v = (jj * nk + ii) * 3;
        if (!g.finnes[k]) continue;
        pos[v] = g.wx[k] - ox; pos[v + 1] = g.wy[k] - oy;
        const z = hoyde[k];
        pos[v + 2] = Number.isFinite(z) ? z : 0;
      }
    }
    const indeks = new Uint32Array(Math.max(6, (nr - 1) * (nk - 1) * 6));
    let ni = 0;
    /* Fargen UTEN lys. Lyset regnes i shaderen, av normalen – se `_lys`. */
    Tegner3d._lysEn = true;
    try {
      for (let jj = 0; jj < nr - 1; jj++) {
        const j0 = rader[jj] * nb, j1 = rader[jj + 1] * nb;
        for (let ii = 0; ii < nk - 1; ii++) {
          const i0 = kol[ii], i1 = kol[ii + 1];
          const k00 = j0 + i0, k10 = j0 + i1, k01 = j1 + i0, k11 = j1 + i1;
          if (!g.finnes[k00] || !g.finnes[k10] || !g.finnes[k01] || !g.finnes[k11]) continue;
          if (krev && (!krev[k00] || !krev[k10] || !krev[k01] || !krev[k11])) continue;
          if (g.celleSperre && g.celleSperre[k00]) continue;
          const f = lag.farge(k00, k10, k01, k11, hoyde);
          if (f === 0) continue;
          const v00 = jj * nk + ii, v10 = v00 + 1, v01 = v00 + nk, v11 = v01 + 1;
          far[v00 * 4] = f & 255; far[v00 * 4 + 1] = (f >> 8) & 255; far[v00 * 4 + 2] = (f >> 16) & 255;
          const id = k00 + 1;
          ids[v00 * 4] = (id >> 16) & 255; ids[v00 * 4 + 1] = (id >> 8) & 255; ids[v00 * 4 + 2] = id & 255;
          /* Flatenormalen slik `_lys` regner den – kryssproduktet av de to
             ekte kantene, pekende opp – lagt til i alle fire hjørnene. Ikke
             normalisert: en stor celle teller mer enn en liten. */
          const a = v00 * 3, b10 = v10 * 3, b01 = v01 * 3;
          const ax = pos[b10] - pos[a], ay = pos[b10 + 1] - pos[a + 1], az = pos[b10 + 2] - pos[a + 2];
          const bx = pos[b01] - pos[a], by = pos[b01 + 1] - pos[a + 1], bz = pos[b01 + 2] - pos[a + 2];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
          for (const v of [v00, v10, v01, v11]) {
            nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz;
          }
          indeks[ni++] = v10; indeks[ni++] = v11; indeks[ni++] = v00;
          indeks[ni++] = v11; indeks[ni++] = v01; indeks[ni++] = v00;
        }
      }
    } finally { Tegner3d._lysEn = false; }
    this.bygget++;
    if (ni === 0) return { tom: true, n: 0 };
    for (let v = 0; v < nv * 3; v += 3) {
      const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]);
      if (l > 0) { nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l; } else nor[v + 2] = 1;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufre = [];
    const attr = (data, loc, size, type, norm, stride) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, norm, stride, 0);
      bufre.push(b);
    };
    attr(pos, 0, 3, gl.FLOAT, false, 0);
    attr(nor, 1, 3, gl.FLOAT, false, 0);
    attr(far, 2, 3, gl.UNSIGNED_BYTE, true, 4);
    attr(ids, 3, 3, gl.UNSIGNED_BYTE, true, 4);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indeks.subarray(0, ni), gl.STATIC_DRAW);
    bufre.push(ib);
    gl.bindVertexArray(null);
    return { vao, bufre, n: ni, sist: this._bildenr };
  },

  _slett(m, gl) {
    if (!m || m.tom || m.slettet) return;
    m.slettet = true;
    if (!gl) return;
    gl.deleteVertexArray(m.vao);
    for (const b of m.bufre) gl.deleteBuffer(b);
  },

  /** @param {boolean} slett false når konteksten er borte – da finnes ingenting å slette. */
  _glemAlt(slett) {
    const gl = slett && !this.tapt ? this.gl : null;
    for (const m of this._mesher.values()) this._slett(m, gl);
    this._mesher.clear();
    if (gl) {
      for (const f of Object.values(this._fbo)) {
        gl.deleteFramebuffer(f.fb); gl.deleteRenderbuffer(f.farge); gl.deleteRenderbuffer(f.dybde);
      }
    }
    this._fbo = {};
    if (gl && this._asynk) {
      if (this._asynk.sync) gl.deleteSync(this._asynk.sync);
      gl.deleteBuffer(this._asynk.buf);
    }
    this._asynk = null;
  },

  /* En mesh ingen har tegnet på 600 bilder, slettes. Bytter man fram og
     tilbake mellom to visninger, står begges mesher; et anlegg som er
     fjernet, eller rapportens utskriftsfarger, forsvinner av seg selv. */
  _rydd() {
    if (this._bildenr % 60) return;
    for (const [k, m] of this._mesher) {
      if (this._bildenr - m.sist > 600) { this._slett(m, this.gl); this._mesher.delete(k); }
    }
  },

  _kameraUniformer(R) {
    const gl = this.gl, u = this._u, k = R.kam;
    gl.uniform3f(u.uOff, this.origo.x - k.ox, this.origo.y - k.oy, k.oz);
    gl.uniform1f(u.uOv, k.ov);
    gl.uniform4f(u.uRot, k.ca, k.sa, k.cp, k.sp);
    gl.uniform1f(u.uD, k.D);
    gl.uniform4f(u.uProj, 2 * k.F / R.rb, 2 * k.cx / R.rb - 1, 2 * k.F / R.rh, 1 - 2 * k.cy / R.rh);
    gl.uniform2f(u.uNF, k.naer, R.fjern);
    if (k.oye) gl.uniform4f(u.uOye, k.oye.x - k.ox, k.oye.y - k.oy, k.oye.z, 1);
    else gl.uniform4f(u.uOye, 0, 0, 0, 0);
  },

  _tegnMesh(m) {
    if (!m || m.tom || m.slettet) return;
    const gl = this.gl;
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
  },

  /**
   * Ett bilde, i lista sin rekkefølge.
   *
   * GJENNOMSIKTIGE LAG, SLIK PROSESSOREN GJØR DEM.
   * Prosessoren tegner laget i et eget buffer med egen dybde, og blander inn
   * bare lagets NÆRMESTE flate, og bare der den ligger foran det
   * ugjennomsiktige. Her er det tre gjennomløp:
   *   A  laget inn i dybden alene – nå står dets nærmeste flate der den er
   *      foran;
   *   B  laget blandet inn der dybden er LIK, og sjablongen sørger for at hver
   *      piksel blandes bare én gang;
   *   C  dybden tilbake slik den var: tømt og tegnet på nytt av alt som har
   *      skrevet dybde. Ellers ville fjellet under det halvgjennomsiktige
   *      terrenget forsvunnet bak terrenget.
   * Et naboanleggs gjennomsiktige lag SKAL beholde dybden (se
   * `_tegnFulltAnlegg`), og hopper over C.
   */
  tegn(R) {
    const gl = this.gl, c = this.lerret;
    if (c.width !== R.rb || c.height !== R.rh) { c.width = R.rb; c.height = R.rh; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, R.rb, R.rh);
    gl.useProgram(this._p);
    this._kameraUniformer(R);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.stencilMask(0xff);
    const farge = rgb => gl.clearColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
    farge(R.bak);
    gl.clearDepth(1); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (R.horisont) {
      // himmel over horisontlinja, fjern bakke under – se `tegn()` i ui-3d.js
      const grense = Math.max(0, Math.min(R.rh, R.horisont.grense));
      gl.enable(gl.SCISSOR_TEST);
      if (grense > 0) { gl.scissor(0, R.rh - grense, R.rb, grense); farge(R.horisont.himmel); gl.clear(gl.COLOR_BUFFER_BIT); }
      if (grense < R.rh) { gl.scissor(0, 0, R.rb, R.rh - grense); farge(R.horisont.fjern); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.uniform1i(this._u.uPass, 0);
    const dybde = [];
    for (const d of R.liste) {
      if (!d.m || d.m.tom) continue;
      if (d.modus === 'opak') {
        gl.depthFunc(gl.LESS);
        this._tegnMesh(d.m);
        dybde.push(d);
        continue;
      }
      // A
      gl.colorMask(false, false, false, false);
      gl.depthFunc(gl.LESS);
      this._tegnMesh(d.m);
      // B
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.EQUAL);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, d.blanding);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      this._tegnMesh(d.m);
      gl.disable(gl.BLEND);
      gl.disable(gl.STENCIL_TEST);
      gl.depthMask(true);
      if (d.modus === 'gjennomDybde') { dybde.push(d); continue; }
      // C
      gl.colorMask(false, false, false, false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.depthFunc(gl.LESS);
      for (const e of dybde) this._tegnMesh(e.m);
      gl.colorMask(true, true, true, true);
    }
    gl.bindVertexArray(null);
    R.dybde = dybde;
    R.kontekstNr = this._kontekstNr;
    this._rydd();
  },

  _fboFor(navn, b, h) {
    const gl = this.gl;
    let f = this._fbo[navn];
    if (f && f.b === b && f.h === h) return f;
    if (f) { gl.deleteFramebuffer(f.fb); gl.deleteRenderbuffer(f.farge); gl.deleteRenderbuffer(f.dybde); }
    const fb = gl.createFramebuffer();
    const farge = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, farge);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, b, h);
    const dybde = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, dybde);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, b, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, farge);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dybde);
    f = { fb, farge, dybde, b, h };
    this._fbo[navn] = f;
    return f;
  },

  /**
   * Det som skrev dybde i bildet, tegnet på nytt i et eget buffer og lest ut.
   * Samme lister, samme kamera og samme dybdeprøve som bildet – bare med
   * cellenummer (1) eller avstand (2) som farge.
   */
  _passe(R, pass, b, h, pbo) {
    const gl = this.gl;
    const f = this._fboFor(pass === 1 ? 'id' : 'dybde', b, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
    gl.viewport(0, 0, b, h);
    gl.useProgram(this._p);
    this._kameraUniformer(R);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true); gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.uniform1i(this._u.uPass, pass);
    for (const d of R.dybde || []) {
      gl.uniform1f(this._u.uIdPa, d.id ? 1 : 0);
      this._tegnMesh(d.m);
    }
    gl.bindVertexArray(null);
    if (pbo) {
      // til en buffer på skjermkortet – hentes senere, se `dybdeOppslagRask`
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, b * h * 4, gl.STREAM_READ);
      gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }
    const ut = new Uint8Array(b * h * 4);
    gl.readPixels(0, 0, b, h, gl.RGBA, gl.UNSIGNED_BYTE, ut);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ut;
  },

  _gyldig(R) { return !!R && this.klar() && R.kontekstNr === this._kontekstNr && !!R.dybde; },

  /** Cellen under hver piksel, som prosessorens `_id`: rad 0 øverst, −1 = ingenting. */
  lesId(R) {
    if (!this._gyldig(R)) return null;
    if (R.idBuffer) return R.idBuffer;
    const px = this._passe(R, 1, R.rb, R.rh);
    const ut = new Int32Array(R.rb * R.rh);
    for (let y = 0; y < R.rh; y++) {
      const kilde = (R.rh - 1 - y) * R.rb * 4, mal = y * R.rb;
      for (let x = 0; x < R.rb; x++) {
        const i = kilde + x * 4;
        ut[mal + x] = ((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) - 1;
      }
    }
    R.idBuffer = ut;
    return ut;
  },

  /**
   * Avstanden w under et rasterpunkt, i KVART oppløsning.
   *
   * Strekene på bakken spør om dette for hvert bilde. Full oppløsning ville
   * vært åtte megabyte å lese ut hver gang; en sekstendedel er en halv, og
   * toleransen i `_verdensstrek` – to prosent pluss en halvmeter – er langt
   * større enn det fire piksler flytter seg.
   */
  dybdeOppslag(R) {
    if (!this._gyldig(R)) return null;
    if (R.dybdeFn) return R.dybdeFn;
    const qb = Math.max(1, Math.ceil(R.rb / 4)), qh = Math.max(1, Math.ceil(R.rh / 4));
    R.dybdeFn = this._dekod(this._passe(R, 2, qb, qh), qb, qh, R.rb, R.rh, R.fjern);
    return R.dybdeFn;
  },

  _dekod(px, qb, qh, rb, rh, fjern) {
    const d = new Float32Array(qb * qh);
    for (let y = 0; y < qh; y++) {
      const kilde = (qh - 1 - y) * qb * 4;
      for (let x = 0; x < qb; x++) {
        const i = kilde + x * 4;
        d[y * qb + x] = px[i + 3]
          ? ((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) / 16777215 * fjern : Infinity;
      }
    }
    const fx = qb / rb, fy = qh / rh;
    return (ix, iy) => d[Math.min(qh - 1, Math.floor(iy * fy)) * qb + Math.min(qb - 1, Math.floor(ix * fx))];
  },

  /**
   * Dybden mens man beveger seg: fra forrige bilde, uten å vente.
   *
   * MÅLT: å lese dybden rett ut kostet 11 ms av 12 i hvert bilde man gikk.
   * Selve tegningen tok 0,2 – resten var nettleseren som ventet på at
   * skjermkortet skulle bli ferdig, for så å sende pikslene tilbake. Her
   * bestilles utlesingen i ett bilde og hentes i et senere, når skjermkortet
   * sier den er klar. Strekene gjemmer seg da bak bakken slik den sto én
   * sekstidels sekund før – og når man stopper, tegnes det ett bilde med
   * den eksakte (se `_dybdeOppslag` i ui-3d.js).
   */
  dybdeOppslagRask(R) {
    if (!this._gyldig(R)) return null;
    if (R.dybdeFn) return R.dybdeFn;
    const gl = this.gl;
    let A = this._asynk;
    if (A && A.kontekstNr !== this._kontekstNr) A = this._asynk = null;
    if (A && A.sync) {
      const s = gl.clientWaitSync(A.sync, 0, 0);
      if (s === gl.ALREADY_SIGNALED || s === gl.CONDITION_SATISFIED) {
        gl.deleteSync(A.sync);
        A.sync = null;
        const px = new Uint8Array(A.qb * A.qh * 4);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, A.buf);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        A.fn = this._dekod(px, A.qb, A.qh, A.rb, A.rh, A.fjern);
        A.fnRb = A.rb; A.fnRh = A.rh;
      }
    }
    if (!A || !A.sync) {
      const qb = Math.max(1, Math.ceil(R.rb / 4)), qh = Math.max(1, Math.ceil(R.rh / 4));
      if (!A) A = this._asynk = { buf: gl.createBuffer(), kontekstNr: this._kontekstNr };
      this._passe(R, 2, qb, qh, A.buf);
      A.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      Object.assign(A, { qb, qh, rb: R.rb, rh: R.rh, fjern: R.fjern });
    }
    // før det første svaret har kommet – eller lerretet har skiftet størrelse – den eksakte
    if (A.fn && A.fnRb === R.rb && A.fnRh === R.rh) return A.fn;
    return this.dybdeOppslag(R);
  }
};

if (typeof module !== 'undefined') module.exports = Gl3d;
