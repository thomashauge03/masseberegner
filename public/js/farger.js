'use strict';
/**
 * Fargene som brukes nar profilene tegnes pa lerret.
 *
 * De hentes fra CSS-variablene, slik at stilarket er eneste sted en farge
 * defineres. Uten dette ville tegnefargene levd sitt eget liv i JavaScript
 * og drevet fra hverandre neste gang noen justerte designet.
 */

const Farger = {
  _bufret: {},

  hent(navn) {
    if (this._bufret[navn]) return this._bufret[navn];
    const v = getComputedStyle(document.documentElement).getPropertyValue('--' + navn).trim();
    this._bufret[navn] = v || '#888';
    return this._bufret[navn];
  },

  /** Kalles dersom temaet endres, sa fargene hentes pa nytt. */
  glem() { this._bufret = {}; this._rgbBufret = {}; this._skravur = null; },

  /**
   * Samme farge som tre tall, til bruk der pikslene settes én for én.
   *
   * 3D-visningen blander farger per piksel i en Uint32Array og kan ikke sende
   * en CSS-streng inn i den. Fargen ma likevel komme fra stilarket, ellers
   * lever tegnefargene sitt eget liv i JavaScript og driver fra hverandre neste
   * gang noen justerer designet – det er nettopp det denne fila finnes for.
   *
   * Tar bade #rrggbb, #rgb og rgb()/rgba(). Gjennomsikten kastes: den som
   * blander, bestemmer selv hvor mye som skal slippe gjennom.
   */
  rgb(navn) {
    if (!this._rgbBufret) this._rgbBufret = {};
    if (this._rgbBufret[navn]) return this._rgbBufret[navn];
    const s = this.hent(navn);
    let ut = [136, 136, 136];
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
    if (m) {
      ut = [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    } else {
      const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
      if (h) {
        const k = h[1].length === 3 ? h[1].split('').map(c => c + c).join('') : h[1];
        ut = [parseInt(k.slice(0, 2), 16), parseInt(k.slice(2, 4), 16), parseInt(k.slice(4, 6), 16)];
      }
    }
    this._rgbBufret[navn] = ut;
    return ut;
  },

  /* Grunnfargene til flatene, ikke strekfargene.
     `skjaering` og `fylling` er strekene i profilen og er ANDRE verdier enn
     flatene kartet fyller med. Blander man dem, får 3D-modellen en annen
     fargeskala enn fargeoverlegget i kartet – to bilder av samme tall. */
  get skjaeringFlateRgb() { return this.rgb('data-skjaering-flate'); },
  get fyllingFlateRgb() { return this.rgb('data-fylling-flate'); },
  get terrengRgb() { return this.rgb('data-terreng'); },
  /* Terrenget som FLATE i 3D, ikke som strek i et snitt.
     De to trenger hver sin farge. På papir er terrengstreken nesten svart, som
     den skal være for en tynn strek på hvitt – men 3D-modellen fyller halve
     bildet med den, og da blir arket en svart blokk med et lite fargefelt oppå.
     Målt på tomterapporten dekket den mørke flaten 42 % av bildet. */
  get terrengFlateRgb() { return this.rgb('data-terrengflate'); },
  get fjellRgb() { return this.rgb('data-fjell'); },
  get flateRgb() { return this.rgb('flate'); },

  get terreng() { return this.hent('data-terreng'); },
  get rensk() { return this.hent('data-rensk'); },
  get veg() { return this.hent('data-veg'); },
  get planum() { return this.hent('data-planum'); },
  get skjaering() { return this.hent('data-skjaering'); },
  get skjaeringFlate() { return this.hent('data-skjaering-flate'); },
  get fylling() { return this.hent('data-fylling'); },
  get fyllingFlate() { return this.hent('data-fylling-flate'); },
  get fjell() { return this.hent('data-fjell'); },
  get baerelag() { return this.hent('data-baerelag'); },
  get slitelag() { return this.hent('data-slitelag'); },
  get rutenett() { return this.hent('data-rutenett'); },
  get akse() { return this.hent('data-akse'); },
  get flate() { return this.hent('flate'); },
  get blekk() { return this.hent('blekk'); },
  get blekkSvak() { return this.hent('blekk-svak'); },
  get kantSterk() { return this.hent('kant-sterk'); },

  /**
   * Skravur for fjell i skjæringen.
   *
   * Fjellet er en del av skjæringen, ikke noe ved siden av. Derfor blir det
   * lagt som skravur oppa skjæringsfargen i stedet for a fa en egen farge -
   * da slipper vi en fjerde kulør, og det leses med en gang som "denne
   * delen av det samme".
   */
  fjellskravur(ctx) {
    if (this._skravur) return this._skravur;
    const s = 8;
    const l = document.createElement('canvas');
    l.width = s; l.height = s;
    const k = l.getContext('2d');
    k.strokeStyle = this.fjell;
    k.lineWidth = 1.6;
    k.beginPath();
    k.moveTo(-s, s); k.lineTo(s, -s);
    k.moveTo(0, 2 * s); k.lineTo(2 * s, 0);
    k.stroke();
    this._skravur = ctx.createPattern(l, 'repeat');
    return this._skravur;
  }
};
