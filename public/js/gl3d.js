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
  _meshNr: 0,
  _skygge: null,
  /** Skyggekart bygd. Prøvene krever at tallet står når bare kameraet flytter seg. */
  skyggekartBygd: 0,

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
layout(location = 3) in vec4 aId;
uniform vec3 uOff;
uniform float uOv;
uniform vec4 uRot;
uniform float uD;
uniform vec4 uProj;
uniform vec2 uNF;
uniform mat4 uLys;
uniform float uNormOff;
out vec3 vNorm;
out vec3 vVerden;
out float vW;
out vec4 vLys;
out vec2 vMark;
flat out vec3 vFarge;
flat out vec4 vId;
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
  vMark = aPos.xy;
  // skyggekartet slås opp litt ut langs normalen – se _skyggekart
  vLys = uLys * vec4(aPos + aNorm * uNormOff, 1.0);
}`,

  /* uPass: 0 = bildet, 1 = cellenummer, 2 = dybde kodet i RGB.
     Lyset er `_lys` i ui-3d.js, med én forskjell: normalen er utjevnet over
     nabocellene, så lyset glir over flaten i stedet for å skifte rute for
     rute. Fargen er flat per celle (`flat`), som før – en skjæringscelle ved
     siden av en fyllingscelle skal ikke få en rødgrønn overgang.

     SOLA ER LYSET. Skyggen fjerner bare det direkte sollyset: i skygge er
     lyset 0,55, det samme som en skråning som vender bort fra sola. Bunnen
     står der den sto, så rødt og grønt leses like godt i skyggen som i sola.

     PÅ BAKKEN (uOye.w = 1) kommer himmelen inn: skyggene får et svakt blått
     stikk fra himmellyset, og flatene tones mot horisontfargen med avstanden
     – luftperspektiv. HORISONT er den samme fargen som himmelen har nede ved
     horisonten (_HIMMEL_FS), så det fjerne terrenget glir over i himmelen
     uten en kant. */
  _FS: `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vNorm;
in vec3 vVerden;
in float vW;
in vec4 vLys;
in vec2 vMark;
flat in vec3 vFarge;
flat in vec4 vId;
uniform int uPass;
uniform float uVirkelig;
uniform float uIdPa;
uniform vec2 uNF;
uniform vec4 uOye;
uniform sampler2DShadow uSkygge;
uniform float uSkyggePa;
uniform float uSkyggeTeksel;
uniform float uSkyggeBias;
uniform float uTake;
out vec4 ut;
const vec3 SOL = vec3(-0.4, 0.4, 0.82);
const vec3 HORISONT = vec3(0.80, 0.86, 0.92);
const vec3 HIMMELLYS = vec3(0.45, 0.60, 0.85);
const vec3 SENIT = vec3(0.24, 0.45, 0.78);
// Støy i verdenskoordinater: den står fast i landskapet når kameraet flytter seg.
float hash(vec2 p) {
  p = fract(mod(p, 1024.0) * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float stoy(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * stoy(p) + 0.3 * stoy(p * 2.7 + 3.1) + 0.2 * stoy(p * 7.3 - 1.7); }
// Materialets egen farge – se tabellen i specen for etappe 3. Tre skalaer:
// store flekker (~25 m), mellomstore (~3 m) og korn (~0,5 m).
vec3 materialFarge(int m, vec2 p, vec3 n) {
  float s = fbm(p * 0.04), a = fbm(p * 0.35), b = fbm(p * 2.3);
  vec3 c;
  if (m == 1) c = mix(vec3(0.30, 0.42, 0.17), vec3(0.46, 0.53, 0.24), 0.7 * a + 0.3 * s) * (0.9 + 0.2 * b);
  else if (m == 2) c = mix(vec3(0.17, 0.22, 0.11), vec3(0.30, 0.29, 0.16), a) * (0.85 + 0.3 * b);
  else if (m == 3) c = mix(vec3(0.42, 0.39, 0.22), vec3(0.34, 0.39, 0.23), a) * (0.9 + 0.2 * b);
  else if (m == 4) c = vec3(0.10, 0.22, 0.30) * (0.95 + 0.1 * a);
  else if (m == 6) c = mix(vec3(0.52, 0.49, 0.43), vec3(0.63, 0.60, 0.53), b) * (0.92 + 0.12 * a);
  else if (m == 7) c = mix(vec3(0.40, 0.30, 0.20), vec3(0.50, 0.38, 0.26), a) * (0.88 + 0.24 * b);
  else if (m == 8) c = mix(vec3(0.42, 0.42, 0.41), vec3(0.58, 0.57, 0.55), a) * (0.8 + 0.3 * b);
  else if (m == 9) c = mix(vec3(0.46, 0.42, 0.36), vec3(0.58, 0.54, 0.48), b) * (0.88 + 0.2 * a);
  else if (m == 10) c = mix(vec3(0.45, 0.45, 0.45), vec3(0.55, 0.54, 0.52), a);
  else if (m == 11) c = vec3(0.90, 0.93, 0.96) * (0.96 + 0.06 * a);
  else c = vec3(0.5);
  // bratt naturmark er stein og jord, ikke gress
  if (m <= 3 && n.z < 0.75) {
    c = mix(c, mix(vec3(0.45, 0.43, 0.40), vec3(0.40, 0.33, 0.24), a), smoothstep(0.75, 0.55, n.z));
  }
  return c;
}
float skygge() {
  if (uSkyggePa < 0.5) return 1.0;
  vec3 p = vLys.xyz * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++)
      s += texture(uSkygge, vec3(p.xy + vec2(float(i), float(j)) * uSkyggeTeksel, p.z - uSkyggeBias));
  return s / 9.0;
}
void main() {
  gl_FragDepth = clamp((vW - uNF.x) / (uNF.y - uNF.x), 0.0, 1.0);
  if (uPass == 1) { ut = uIdPa > 0.5 ? vec4(vId.rgb, 1.0) : vec4(0.0); return; }
  if (uPass == 2) {
    float s = floor(clamp(vW / uNF.y, 0.0, 1.0) * 16777215.0);
    float r = floor(s / 65536.0);
    float g = floor((s - r * 65536.0) / 256.0);
    float b = s - r * 65536.0 - g * 256.0;
    ut = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
    return;
  }
  vec3 n = normalize(vNorm);
  bool bakken = uOye.w > 0.5;
  bool bakside = bakken && dot(n, uOye.xyz - vVerden) < 0.0;
  float direkte = bakside ? 0.0 : clamp(dot(n, SOL), 0.0, 1.0) * skygge();
  float ly = bakside ? 0.45 : 0.55 + 0.45 * direkte;
  /* MATERIALET (fjerde byte i cellenummeret). I «Før» og «Etter» er det
     materialets egen farge; ellers bare lysstyrken, så rødt forblir rødt. */
  int mat = int(vId.a * 255.0 + 0.5);
  vec3 alb = vFarge;
  if (mat > 0) {
    if (uVirkelig > 0.5 && mat != 20) alb = materialFarge(mat, vMark, n);
    else alb *= 0.92 + 0.16 * fbm(vMark * 0.8);
  }
  vec3 c = min(alb * ly, vec3(1.0));
  if (mat == 4 && uVirkelig > 0.5 && bakken) {
    // vannet speiler himmelen, mest når man ser langs det
    vec3 v = normalize(vVerden - uOye.xyz);
    vec3 r = reflect(v, vec3(0.0, 0.0, 1.0));
    float fr = 0.04 + 0.96 * pow(1.0 - clamp(-v.z, 0.0, 1.0), 5.0);
    c = mix(c, mix(HORISONT, SENIT, pow(max(r.z, 0.0), 0.45)), fr);
  }
  if (bakken) {
    c = mix(c, HIMMELLYS, 0.06 * (1.0 - direkte));
    if (uTake > 0.0) c = mix(c, HORISONT, 1.0 - exp(-pow(vW / uTake, 1.3)));
  }
  ut = vec4(c, 1.0);
}`,

  /* HIMMELEN: én trekant over hele skjermen, og blikkretningen regnet per
     piksel av kameraets egne formler snudd baklengs (se `_kamera` i
     ui-3d.js): fra skjermpunktet til rx og sy med w = 1, så til ry og z, og
     til slutt verdensretningen. Dis nede ved horisonten, dyp blå oppe, og en
     glød der sola står. */
  _HIMMEL_VS: `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`,

  _HIMMEL_FS: `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec4 uRot;
uniform vec4 uProj;
out vec4 ut;
const vec3 SOL = vec3(-0.4, 0.4, 0.82);
const vec3 HORISONT = vec3(0.80, 0.86, 0.92);
const vec3 SENIT = vec3(0.24, 0.45, 0.78);
const vec3 BAKKE = vec3(0.52, 0.56, 0.52);
void main() {
  float rx = (vNdc.x - uProj.y) / uProj.x;
  float sy = (uProj.w - vNdc.y) / uProj.z;
  float ry = -uRot.z + sy * uRot.w;
  float z = -uRot.w - sy * uRot.z;
  vec3 d = normalize(vec3(rx * uRot.x + ry * uRot.y, rx * uRot.y - ry * uRot.x, z));
  vec3 c = d.z >= 0.0 ? mix(HORISONT, SENIT, pow(d.z, 0.45))
                      : mix(HORISONT, BAKKE, clamp(-d.z * 5.0, 0.0, 1.0));
  float s = max(dot(d, normalize(SOL)), 0.0);
  c += vec3(1.0, 0.95, 0.8) * (pow(s, 800.0) * 1.5 + pow(s, 10.0) * 0.15);
  ut = vec4(min(c, vec3(1.0)), 1.0);
}`,

  /* Skyggekartet: bare dybden, sett fra sola. */
  _SKYGGE_VS: `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uLys;
void main() { gl_Position = uLys * vec4(aPos, 1.0); }`,

  _SKYGGE_FS: `#version 300 es
precision mediump float;
void main() {}`,

  _program(vsKilde, fsKilde, uniformer) {
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
    const vs = lag(gl.VERTEX_SHADER, vsKilde), fs = lag(gl.FRAGMENT_SHADER, fsKilde);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      console.warn('Gl3d: ' + gl.getProgramInfoLog(p));
      return null;
    }
    const u = {};
    for (const n of uniformer) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  },

  _lagProgram() {
    const gl = this.gl;
    const hoved = this._program(this._VS, this._FS, ['uOff', 'uOv', 'uRot', 'uD', 'uProj', 'uNF',
      'uPass', 'uIdPa', 'uOye', 'uLys', 'uNormOff', 'uSkygge', 'uSkyggePa', 'uSkyggeTeksel',
      'uSkyggeBias', 'uTake', 'uVirkelig']);
    const himmel = this._program(this._HIMMEL_VS, this._HIMMEL_FS, ['uRot', 'uProj']);
    const skygge = this._program(this._SKYGGE_VS, this._SKYGGE_FS, ['uLys']);
    if (!hoved || !himmel || !skygge) return false;
    this._p = hoved.p; this._u = hoved.u;
    this._himmel = himmel;
    this._skyggeP = skygge;
    this._tomVao = gl.createVertexArray();
    /* ET SKYGGESAMPLER MÅ ALLTID HA ET DYBDEBILDE Å LESE.
       Også når det ikke finnes noen skygger, og også i id- og dybdepassene,
       som aldri slår opp i det: WebGL nekter å tegne med en sampler2DShadow
       som peker på noe annet. Ett piksel på dybde 1 betyr «alltid sol». */
    this._ingenSkygge = this._dybdetekstur(1);
    this._fboSkygge = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboSkygge);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._ingenSkygge, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.viewport(0, 0, 1, 1);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this._p);
    gl.uniform1i(this._u.uSkygge, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._ingenSkygge);
    gl.activeTexture(gl.TEXTURE0);
    this._skygge = null;
    this._fbo = {};
    return true;
  },

  _dybdetekstur(storrelse) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, storrelse, storrelse);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
  },

  /**
   * Scenen sett fra sola, som et dybdebilde.
   *
   * SOLA STÅR FAST I VERDEN, så kartet avhenger ikke av kameraet: det bygges
   * når settet av flater endrer seg, og ellers aldri. Å dra, fly og gå koster
   * ingenting ekstra.
   *
   * Bare de UGJENNOMSIKTIGE flatene kaster skygge. Det halvgjennomsiktige
   * terrenget over gravflaten er et røntgenbilde, ikke noe som står i lyset.
   *
   * Kartet rammer inn alle flatene i bildet, sett langs sola. Tekselen er
   * rundt en halv meter på et anlegg på to kilometer – grovt for en grøft, men
   * godt nok for en fylling. Oppslaget gjøres litt ut langs normalen
   * (`uNormOff`), og det er det som hindrer at en flate skygger for seg selv.
   */
  _skyggekart(R) {
    const gl = this.gl;
    const kastere = R.liste.filter(d => d.modus === 'opak' && d.m && !d.m.tom && !d.m.slettet);
    if (!kastere.length) return null;
    const nokkel = kastere.map(d => d.m.nr).join(',') + '|' + this.origo.x + ',' + this.origo.y;
    const S0 = this._skygge;
    if (S0 && S0.nokkel === nokkel) return S0;
    const L = [-0.4, 0.4, 0.82], lL = Math.hypot(...L);
    const f = L.map(v => -v / lL);
    let r = [f[1] * 1 - f[2] * 0, f[2] * 0 - f[0] * 1, f[0] * 0 - f[1] * 0];     // f × ẑ
    const lr = Math.hypot(...r); r = r.map(v => v / lr);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const dot = (a, p) => a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
    const min = [Infinity, Infinity, Infinity], maks = [-Infinity, -Infinity, -Infinity];
    for (const d of R.liste) {
      const b = d.m && d.m.boks;
      if (!b) continue;
      for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
        const p = [x, y, z];
        const q = [dot(r, p), dot(u, p), dot(f, p)];
        for (let i = 0; i < 3; i++) { if (q[i] < min[i]) min[i] = q[i]; if (q[i] > maks[i]) maks[i] = q[i]; }
      }
    }
    if (!Number.isFinite(min[0])) return null;
    for (let i = 0; i < 3; i++) { min[i] -= 2; maks[i] += 2; }
    const dx = maks[0] - min[0], dy = maks[1] - min[1], dz = maks[2] - min[2];
    const stor = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE),
      Math.max(1024, Math.pow(2, Math.ceil(Math.log2(Math.max(dx, dy) / 0.5)))));
    // radene i matrisen er lysets akser, skalert til [-1, 1]
    const rad = (a, lo, d) => [2 * a[0] / d, 2 * a[1] / d, 2 * a[2] / d, -2 * lo / d - 1];
    const r0 = rad(r, min[0], dx), r1 = rad(u, min[1], dy), r2 = rad(f, min[2], dz);
    const mat = new Float32Array([
      r0[0], r1[0], r2[0], 0,
      r0[1], r1[1], r2[1], 0,
      r0[2], r1[2], r2[2], 0,
      r0[3], r1[3], r2[3], 1]);
    let S = S0;
    if (!S || S.stor !== stor) {
      if (S) gl.deleteTexture(S.tex);
      S = { tex: this._dybdetekstur(stor), stor };
    }
    Object.assign(S, { nokkel, mat, teksel: Math.max(dx, dy) / stor, bias: 0.05 / dz });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboSkygge);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, S.tex, 0);
    gl.viewport(0, 0, stor, stor);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    gl.useProgram(this._skyggeP.p);
    gl.uniformMatrix4fv(this._skyggeP.u.uLys, false, mat);
    for (const d of kastere) this._tegnMesh(d.m);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.skyggekartBygd++;
    this._skygge = S;
    return S;
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
    // boksen rundt nodene – skyggekartet rammer inn etter den
    const boks = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let jj = 0; jj < nr; jj++) {
      for (let ii = 0; ii < nk; ii++) {
        const k = rader[jj] * nb + kol[ii], v = (jj * nk + ii) * 3;
        if (!g.finnes[k]) continue;
        pos[v] = g.wx[k] - ox; pos[v + 1] = g.wy[k] - oy;
        const z = hoyde[k];
        pos[v + 2] = Number.isFinite(z) ? z : 0;
        for (let a = 0; a < 3; a++) {
          if (pos[v + a] < boks[a]) boks[a] = pos[v + a];
          if (pos[v + a] > boks[a + 3]) boks[a + 3] = pos[v + a];
        }
      }
    }
    const indeks = new Uint32Array(Math.max(6, (nr - 1) * (nk - 1) * 6));
    let ni = 0;
    const matF = lag.materiale || (lag.farge && lag.farge.materiale) || null;
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
          // materialet i fjerde byte – se materialFarge i _FS
          if (matF) ids[v00 * 4 + 3] = matF(k00) & 255;
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
    attr(ids, 3, 4, gl.UNSIGNED_BYTE, true, 4);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indeks.subarray(0, ni), gl.STATIC_DRAW);
    bufre.push(ib);
    gl.bindVertexArray(null);
    return { vao, bufre, n: ni, sist: this._bildenr, nr: ++this._meshNr, boks };
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
    if (gl && this._skygge) {
      gl.deleteTexture(this._skygge.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._ingenSkygge);
      gl.activeTexture(gl.TEXTURE0);
    }
    this._skygge = null;
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
    // skyggekartet først: det har sin egen ramme og sitt eget program
    const S = R.skygger === false ? null : this._skyggekart(R);
    if (c.width !== R.rb || c.height !== R.rh) { c.width = R.rb; c.height = R.rh; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, R.rb, R.rh);
    gl.useProgram(this._p);
    this._kameraUniformer(R);
    const u = this._u;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, S ? S.tex : this._ingenSkygge);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.uSkyggePa, S ? 1 : 0);
    if (S) {
      gl.uniformMatrix4fv(u.uLys, false, S.mat);
      gl.uniform1f(u.uNormOff, 1.5 * S.teksel);
      gl.uniform1f(u.uSkyggeTeksel, 1 / S.stor);
      gl.uniform1f(u.uSkyggeBias, S.bias);
    }
    gl.uniform1f(u.uTake, R.take || 0);
    gl.uniform1f(u.uVirkelig, R.virkelig ? 1 : 0);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.stencilMask(0xff);
    const farge = rgb => gl.clearColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
    farge(R.bak);
    gl.clearDepth(1); gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (R.himmel) {
      // en ekte himmel, bak alt – se _HIMMEL_FS
      const k = R.kam, hu = this._himmel.u;
      gl.useProgram(this._himmel.p);
      gl.uniform4f(hu.uRot, k.ca, k.sa, k.cp, k.sp);
      gl.uniform4f(hu.uProj, 2 * k.F / R.rb, 2 * k.cx / R.rb - 1, 2 * k.F / R.rh, 1 - 2 * k.cy / R.rh);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindVertexArray(this._tomVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      gl.useProgram(this._p);
    } else if (R.horisont) {
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
