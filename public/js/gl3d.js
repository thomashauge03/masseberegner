'use strict';
/**
 * 3D-bildet tegnet av skjermkortet, mens man drar.
 *
 * HVORFOR. Tegner3d skriver hver piksel selv i JavaScript. Det er raskt nok i
 * ro, men et bilde koster 20–30 ms på et lite anlegg i full skjerm og langt
 * mer på et stort. Mens man drar, ble bildet da grovt og hakkete – og det er
 * det man sammenligner med andre 3D-program, som lar skjermkortet tegne.
 *
 * HVORDAN. Når en dragning begynner, tar Tegner3d opp scenen ÉN gang: hver
 * celle som to trekanter med sin ferdige farge (lys, massefarge, naboanlegg –
 * alt er regnet inn). Opptaket lastes opp hit, og hvert bilde under
 * dragningen er da bare et nytt kamera. Når man slipper, tegnes det skarpe
 * bildet som før – det er det klikk, avlesning og dybdeprøver bygger på.
 *
 * INGEN AVHENGIGHET. Rå WebGL 2, ingen bibliotek – av samme grunn som står
 * øverst i ui-3d.js: ingenting som kan hindre appen i å starte. Mangler
 * WebGL 2, eller mister skjermkortet konteksten, tegnes det som før.
 *
 * GJENNOMSIKTIGE LAG følger den samme regelen som rasteret: laget tegnes for
 * seg (nærmeste flate i laget vinner), og blandes så inn bare der det ligger
 * foran det ugjennomsiktige. Det gjøres med en egen ramme for laget og en
 * fullskjermstrekant som skriver lagets dybde som sin egen.
 *
 * ALT TEGNES I EN EGEN RAMME MED 24 BITS DYBDE, og kopieres til lerretet til
 * slutt. Lerretets egen dybde kan være 16 bit på en mobil, og da er ikke samme
 * flate tegnet to steder lenger det samme tallet – terrenget og graveflaten
 * der ingenting er gravd, ville flimret om hverandre.
 */
const Gl3d = {
  /** Kan denne nettleseren i det hele tatt? Svaret huskes. */
  kan() {
    if (this._kan !== undefined) return this._kan;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext && c.getContext('webgl2');
      this._kan = !!gl;
      // prøvekonteksten gis tilbake med en gang – en nettleser har bare et fåtall
      const tap = gl && gl.getExtension('WEBGL_lose_context');
      if (tap) tap.loseContext();
    } catch (e) { this._kan = false; }
    return this._kan;
  },

  _VS: `#version 300 es
in vec3 pos;
in vec4 farge;
uniform vec2 off;
uniform float z0, ov, ca, sa, cp, sp, dist, F, cx, cy, rb, rh, naer, fjern;
out vec4 v;
void main() {
  float x = pos.x + off.x, y = pos.y + off.y, z = (pos.z - z0) * ov;
  float rx = x * ca + y * sa;
  float ry = x * sa - y * ca;
  float dk = -(ry * cp + z * sp);
  float sy = ry * sp - z * cp;
  float w = dist + dk;
  /* px = cx + F·rx/w i rasterpiksler, som Tegner3d._kamera – skrevet før
     divisjonen, så skjermkortet deler og klipper mot nærplanet selv. */
  float X = (2.0 * cx / rb - 1.0) * w + (2.0 * F / rb) * rx;
  float Y = -((2.0 * cy / rh - 1.0) * w + (2.0 * F / rh) * sy);
  float Z = (fjern + naer) / (fjern - naer) * w - 2.0 * fjern * naer / (fjern - naer);
  gl_Position = vec4(X, Y, Z, w);
  v = farge;
}`,

  _FS: `#version 300 es
precision mediump float;
in vec4 v;
out vec4 ut;
void main() { ut = v; }`,

  _VS_FULL: `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,

  /* Laget blandes inn der det ligger foran: dybden er lagets egen, og
     dybdeprøven mot det ugjennomsiktige gjør resten (LEQUAL). Rasteret sier
     «d2 > d1 → hopp over», altså vinner laget ved likhet – og likhet er
     vanlig: terrenget ligger oppå graveflaten der ingenting er gravd.
     INGEN FORSKYVNING. Begge dybdene er 24 bit og regnes av de samme hjørnene,
     så samme flate gir nøyaktig samme tall. En fast forskyvning i dybde er
     ikke-lineær i meter: på en veg på 2,6 km ble den tre meter ved den fjerne
     kanten, og terrenget la seg over tynne fyllinger. */
  _FS_BLAND: `#version 300 es
precision highp float;
uniform sampler2D fT;
uniform highp sampler2D dT;
uniform float styrke;
out vec4 ut;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(fT, p, 0);
  if (c.a < 0.5) discard;
  gl_FragDepth = texelFetch(dT, p, 0).r;
  ut = vec4(c.rgb, styrke);
}`,

  _program(gl, vs, fs) {
    const lag = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, lag(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, lag(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  },

  /**
   * Skjermkortets lerret for en visning – lagd første gang, lagt rett over
   * det vanlige lerretet og under overlegget. Null når det ikke går.
   *
   * EGET FELT, IKKE ARVET. Ror3d arver fra Tomt3d, og et `vis._glTilstand`
   * som ble lest gjennom prototypen, ga røret tomtas lerret: rørbildet ble
   * tegnet inn i tomtepanelet. Derfor spørres det bare etter visningens eget.
   *
   * Et lerret som ikke står i siden (rapporten tegner i et lerret utenfor),
   * får ingen tilstand – og svaret huskes ikke, så visningen får skjermkortet
   * når den står i siden igjen.
   */
  tilstand(vis) {
    if (Object.prototype.hasOwnProperty.call(vis, '_glTilstand')) return vis._glTilstand;
    if (!this.kan() || !vis.lerret || !vis.lerret.parentNode) return null;
    vis._glTilstand = null;
    let c = null;
    try {
      c = document.createElement('canvas');
      c.className = 'gl3d skjult';
      c.setAttribute('aria-hidden', 'true');
      vis.lerret.parentNode.insertBefore(c, vis.lerret.nextSibling);
      /* Uten kantutjevning, med vilje: bildet i bevegelse skal se ut som
         bildet i ro, ellers blinker kantene i det man slipper. */
      const gl = c.getContext('webgl2', { antialias: false, alpha: false, depth: false,
        preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) { c.remove(); return null; }
      const t = { lerret: c, gl, scene: null };
      t.prog = this._program(gl, this._VS, this._FS);
      t.bland = this._program(gl, this._VS_FULL, this._FS_BLAND);
      t.u = {};
      for (const n of ['off', 'z0', 'ov', 'ca', 'sa', 'cp', 'sp', 'dist', 'F', 'cx', 'cy', 'rb', 'rh', 'naer', 'fjern']) {
        t.u[n] = gl.getUniformLocation(t.prog, n);
      }
      t.ub = { fT: gl.getUniformLocation(t.bland, 'fT'), dT: gl.getUniformLocation(t.bland, 'dT'),
        styrke: gl.getUniformLocation(t.bland, 'styrke') };
      t.aPos = gl.getAttribLocation(t.prog, 'pos');
      t.aFarge = gl.getAttribLocation(t.prog, 'farge');
      t.vao = gl.createVertexArray();
      t.tomVao = gl.createVertexArray();
      t.bPos = gl.createBuffer();
      t.bFarge = gl.createBuffer();
      /* Mister skjermkortet konteksten (driveroppdatering, for mange faner),
         går tegningen tilbake til rasteret – for godt i denne økta. */
      c.addEventListener('webglcontextlost', () => {
        vis._glTilstand = null;
        c.remove();
      });
      vis._glTilstand = t;
    } catch (e) {
      // et lerret som ble satt inn, men aldri kom i gang, skal ikke bli stående
      if (c) c.remove();
      vis._glTilstand = null;
    }
    return vis._glTilstand;
  },

  /** Laster opp et opptak: posisjoner, farger og delene i rekkefølge. */
  last(t, opptak) {
    const gl = t.gl;
    gl.bindVertexArray(t.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.bPos);
    gl.bufferData(gl.ARRAY_BUFFER, opptak.pos.subarray(0, opptak.n * 3), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(t.aPos);
    gl.vertexAttribPointer(t.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, t.bFarge);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(opptak.farge.buffer, 0, opptak.n * 4), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(t.aFarge);
    gl.vertexAttribPointer(t.aFarge, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindVertexArray(null);
    t.scene = { deler: opptak.deler, ox: opptak.ox, oy: opptak.oy, nokkel: opptak.nokkel };
  },

  /**
   * De to rammene, i lerretets størrelse: hovedrammen (bildet, 24 bits dybde)
   * og lagrammen et gjennomsiktig lag tegnes i for seg – den med teksturer,
   * fordi blandingen leser dem.
   */
  _rammer(t, b, h) {
    const gl = t.gl;
    if (t.rammer && t.rammer.b === b && t.rammer.h === h) return t.rammer;
    if (t.rammer) {
      const r = t.rammer;
      gl.deleteFramebuffer(r.hoved); gl.deleteRenderbuffer(r.hF); gl.deleteRenderbuffer(r.hD);
      gl.deleteFramebuffer(r.lag); gl.deleteTexture(r.fT); gl.deleteTexture(r.dT);
    }
    const tekstur = (intern, format, type) => {
      const x = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, x);
      gl.texImage2D(gl.TEXTURE_2D, 0, intern, b, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return x;
    };
    const buffer = intern => {
      const x = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, x);
      gl.renderbufferStorage(gl.RENDERBUFFER, intern, b, h);
      return x;
    };
    const hF = buffer(gl.RGBA8), hD = buffer(gl.DEPTH_COMPONENT24);
    const hoved = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, hoved);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, hF);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, hD);
    const fT = tekstur(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    const dT = tekstur(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    const lag = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, lag);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fT, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    t.rammer = { hoved, hF, hD, lag, fT, dT, b, h };
    return t.rammer;
  },

  /**
   * Ett bilde. `k` er kameraet fra Tegner3d._kamera (feltet `gl`), `bak`
   * bakgrunnsfargen som [r, g, b] 0–255. False når det ikke ble noe bilde –
   * da tegner rasteret.
   */
  tegn(t, k, b, h, bak) {
    const gl = t.gl, c = t.lerret, sc = t.scene;
    // konteksten kan være tapt før hendelsen om det har kommet fram
    if (!sc || gl.isContextLost()) return false;
    if (c.width !== b || c.height !== h) { c.width = b; c.height = h; }
    const r = this._rammer(t, b, h);
    gl.viewport(0, 0, b, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.hoved);
    gl.clearColor(bak[0] / 255, bak[1] / 255, bak[2] / 255, 1);
    gl.clearDepth(1);
    // tømmingen følger dybdemasken – en maske som sto av fra forrige lag, tømte ingenting
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const settKamera = () => {
      const u = t.u;
      gl.useProgram(t.prog);
      gl.uniform2f(u.off, sc.ox - k.sx, sc.oy - k.sy);
      gl.uniform1f(u.z0, k.z0); gl.uniform1f(u.ov, k.ov);
      gl.uniform1f(u.ca, k.ca); gl.uniform1f(u.sa, k.sa);
      gl.uniform1f(u.cp, k.cp); gl.uniform1f(u.sp, k.sp);
      gl.uniform1f(u.dist, k.dist); gl.uniform1f(u.F, k.F);
      gl.uniform1f(u.cx, k.cx); gl.uniform1f(u.cy, k.cy);
      gl.uniform1f(u.rb, b); gl.uniform1f(u.rh, h);
      gl.uniform1f(u.naer, k.naer); gl.uniform1f(u.fjern, k.fjern);
      gl.bindVertexArray(t.vao);
    };
    settKamera();
    for (const d of sc.deler) {
      if (!d.antall) continue;
      if (!(d.blanding > 0)) {
        gl.disable(gl.BLEND);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.drawArrays(gl.TRIANGLES, d.start, d.antall);
        continue;
      }
      // laget for seg: nærmeste flate i laget, i egen ramme
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.lag);
      gl.clearColor(0, 0, 0, 0);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      gl.drawArrays(gl.TRIANGLES, d.start, d.antall);
      // så inn i bildet, der det ligger foran
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.hoved);
      gl.useProgram(t.bland);
      gl.bindVertexArray(t.tomVao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.fT);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, r.dT);
      gl.uniform1i(t.ub.fT, 0); gl.uniform1i(t.ub.dT, 1);
      gl.uniform1f(t.ub.styrke, d.blanding);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(!!d.settDybde);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.BLEND);
      settKamera();
    }
    gl.bindVertexArray(null);
    // bildet over på lerretet
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.hoved);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, b, h, 0, 0, b, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }
};

if (typeof module !== 'undefined') module.exports = Gl3d;
