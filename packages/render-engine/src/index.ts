// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.
import logoSvg from '../../../assets/logo-ceflyrics.svg?raw';
import type { OnAirState, SlideMedia } from '@shared/state';
import { DEFAULT_THEME, fontCss, type Theme } from '@shared/theme';
import { formatRemaining, remainingMs, type TimerLayout, type TimerRun } from '@shared/timers';

export type RenderState = Pick<OnAirState, 'slide' | 'mode'> & Partial<Pick<OnAirState, 'timers' | 'shownTimer'>>;

// Las medidas van en em de la pantalla, donde 1em es u: una centésima del lado que manda, el ancho,
// salvo en pantallas más anchas que 16:9, donde manda el alto. Así nada se sale en ninguna proporción.
// Sin var(), calc(), cqw, inset ni gap: los navegadores de las teles viejas no los entienden.
const CENTER = `-webkit-box-align: center; -webkit-align-items: center; align-items: center;
  -webkit-box-pack: center; -webkit-justify-content: center; justify-content: center;`;
const FLEX = 'display: block; display: -webkit-box; display: -webkit-flex; display: flex;';
const COLUMN = '-webkit-box-orient: vertical; -webkit-flex-direction: column; flex-direction: column;';
const ROW = '-webkit-box-orient: horizontal; -webkit-flex-direction: row; flex-direction: row;';

const STYLES = `
.cef-stage { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow: hidden; background: #000; color: #fff; }
.cef-layer { position: absolute; top: 0; right: 0; bottom: 0; left: 0; opacity: 0; -webkit-transition: opacity 0.25s ease; transition: opacity 0.25s ease; }
.cef-layer.cef-on { opacity: 1; }
.cef-fill { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.cef-media { background: #000; }
.cef-media .cef-fill { object-fit: contain; }
.cef-wallpaper { ${FLEX} ${CENTER} background: #05070d; }
.cef-logo { width: 46em; height: 20.7em; color: #fff; }
.cef-logo svg { display: block; width: 100%; height: 100%; }
.cef-text { ${FLEX} ${COLUMN} ${CENTER} -webkit-box-sizing: border-box; box-sizing: border-box; text-align: center; }
.cef-body, .cef-title { -webkit-flex-shrink: 0; flex-shrink: 0; }
.cef-body { margin: 0; max-width: 100%; white-space: pre-line; overflow-wrap: break-word; word-wrap: break-word; }
.cef-shadow .cef-body { text-shadow: 0 0.035em 0.14em rgba(0, 0, 0, 0.6); }
.cef-title { margin: 0; font-weight: 600; }
.cef-timer { display: none; ${COLUMN} ${CENTER} opacity: 1; text-align: center; font-variant-numeric: tabular-nums; }
.cef-timer.cef-on { ${FLEX} }
.cef-timer-label { margin-bottom: 0.3125em; font-size: 3.2em; font-weight: 600; }
.cef-timer-time { font-size: 17em; font-weight: 700; line-height: 1; }
.cef-timer-done .cef-timer-time { font-size: 8em; line-height: 1.2; padding: 0 0.625em; }
.cef-timer-corner { top: auto; left: auto; right: 2em; bottom: 2em; ${ROW} padding: 0.8em 1.6em; background: rgba(0, 0, 0, 0.65); border-radius: 1em; color: #fff; }
.cef-timer-corner .cef-timer-label { margin: 0 0.75em 0 0; font-size: 1.6em; }
.cef-timer-corner .cef-timer-time, .cef-timer-corner.cef-timer-done .cef-timer-time { font-size: 3.4em; padding: 0; }
.cef-black { background: #000; -webkit-transition-duration: 0s; transition-duration: 0s; }
`;

// El texto se achica hasta entrar, pero no más que esto: de ahí abajo no se lee.
const MIN_FIT = 0.05;

// Con className y no con classList, que falta en algunas teles y en otras no acepta el segundo argumento.
function toggle(element: HTMLElement, name: string, on: boolean) {
  const names = element.className.split(' ').filter((other) => other && other !== name);
  if (on) names.push(name);
  element.className = names.join(' ');
}

function layer(stage: HTMLElement, className: string) {
  const element = document.createElement('div');
  element.className = `cef-layer ${className}`;
  stage.appendChild(element);
  return element;
}

// Pone una foto o un video en la capa. Si ya está el mismo archivo no lo toca: reiniciar el
// video de fondo entre diapositivas se vería como un salto.
function showFile(host: HTMLElement, file: SlideMedia | null, audio: boolean, playback: boolean) {
  const current = host.firstElementChild as HTMLElement | null;
  if (current?.getAttribute('data-url') === file?.url) {
    if (file?.kind === 'video') (current as HTMLVideoElement).loop = file.loop;
    return;
  }
  if (current?.tagName === 'VIDEO') (current as HTMLVideoElement).pause?.();
  host.textContent = '';
  if (!file) return;

  // En una vista de la consola alcanza con la miniatura: decodificar el archivo acá le quitaría
  // recursos al proyector.
  const still = !playback && file.thumb;
  if (file.kind === 'image' || still) {
    const url = still || file.url;
    if (!('objectFit' in document.documentElement.style)) {
      // Una tele que no sabe encajar la foto la estiraría: como fondo sí sabe.
      const picture = document.createElement('div');
      picture.className = 'cef-fill';
      picture.setAttribute('data-url', file.url);
      picture.style.background = `url("${url}") no-repeat center`;
      picture.style.backgroundSize = host.className.indexOf('cef-media') >= 0 ? 'contain' : 'cover';
      host.appendChild(picture);
      return;
    }
    const image = document.createElement('img');
    image.className = 'cef-fill';
    image.setAttribute('data-url', file.url);
    image.decoding = 'async';
    image.src = url;
    host.appendChild(image);
    return;
  }
  const video = document.createElement('video');
  video.className = 'cef-fill';
  video.setAttribute('data-url', file.url);
  video.src = file.url;
  video.loop = file.loop;
  video.muted = !audio;
  video.playsInline = true;
  host.appendChild(video);
  if (!playback) return;
  // En los navegadores viejos play() no devuelve nada, y los que no saben de video ni siquiera lo tienen.
  video.play?.()?.catch(() => {
    // Si el navegador bloquea el audio, se reproduce sin sonido.
    video.muted = true;
    video.play()?.catch(() => {});
  });
}

// El contorno se dibuja con sombras sin desenfoque alrededor de la letra: toda tele, por vieja que
// sea, pinta las sombras debajo del texto. Con el trazo (text-stroke), algunas lo pintaban encima y la
// letra se veía toda negra. Dos anillos para que no queden huecos en contornos gruesos.
function outlineShadow(width: number, color: string, shadow: boolean) {
  const shadows: string[] = [];
  const ring = (radius: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const x = +(Math.cos(angle) * radius).toFixed(4);
      const y = +(Math.sin(angle) * radius).toFixed(4);
      shadows.push(`${x}em ${y}em 0 ${color}`);
    }
  };
  ring(width, 16);
  ring(width / 2, 8);
  // La sombra de siempre, al final para que quede debajo del contorno.
  if (shadow) shadows.push('0 0.035em 0.14em rgba(0, 0, 0, 0.6)');
  return shadows.join(', ');
}

// El degradé como se escribía antes de 2013: otro nombre, y los grados contados desde otro lado.
export function oldGradient(value: string) {
  return value
    .replace(/^linear-gradient\((\d+)deg/, (_, angle) => `-webkit-linear-gradient(${90 - Number(angle)}deg`)
    .replace(/^radial-gradient\(circle at ([^,]+),/, '-webkit-radial-gradient($1, circle,');
}

function applyTheme(
  theme: Theme,
  parts: { background: HTMLElement; text: HTMLElement; body: HTMLElement; title: HTMLElement },
) {
  const { background: bg } = theme;
  // Primero negro: una tele que no entiende el degradé se quedaría con el fondo anterior.
  parts.background.style.background = '#000';
  if (bg.kind === 'css') {
    parts.background.style.background = oldGradient(bg.value);
    parts.background.style.background = bg.value;
  }
  parts.text.style.fontFamily = fontCss(theme.font);
  toggle(parts.text, 'cef-shadow', theme.shadow);
  parts.text.style.fontWeight = String(theme.weight);
  parts.text.style.fontStyle = theme.italic ? 'italic' : 'normal';
  parts.body.style.color = theme.color;
  parts.body.style.lineHeight = String(theme.lineHeight);
  // Sin contorno, la sombra la pone la clase cef-shadow.
  const outline = theme.outlineColor ? outlineShadow(theme.outlineWidth, theme.outlineColor, theme.shadow) : '';
  parts.body.style.textShadow = outline;
  parts.title.style.textShadow = theme.outlineColor ? outlineShadow(theme.outlineWidth, theme.outlineColor, false) : '';
  parts.body.style.textTransform = theme.uppercase ? 'uppercase' : 'none';
  parts.title.style.color = theme.titleColor;
}

type RendererOptions = {
  // Una función si puede cambiar mientras la pantalla está abierta.
  audio?: boolean | (() => boolean);
  playback?: boolean;
  now?: () => number;
};

export function createRenderer(
  stage: HTMLElement,
  { audio = false, playback = true, now = Date.now }: RendererOptions = {},
) {
  if (!document.getElementById('cef-styles')) {
    const style = document.createElement('style');
    style.id = 'cef-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  toggle(stage, 'cef-stage', true);

  const background = layer(stage, 'cef-background');
  const text = layer(stage, 'cef-text');
  const body = document.createElement('p');
  const title = document.createElement('p');
  body.className = 'cef-body';
  title.className = 'cef-title';
  text.appendChild(body);
  text.appendChild(title);
  const media = layer(stage, 'cef-media');
  const timer = layer(stage, 'cef-timer');
  const timerLabel = document.createElement('div');
  const timerTime = document.createElement('div');
  timerLabel.className = 'cef-timer-label';
  timerTime.className = 'cef-timer-time';
  timer.appendChild(timerLabel);
  timer.appendChild(timerTime);
  const wallpaper = layer(stage, 'cef-wallpaper');
  const logo = document.createElement('div');
  logo.className = 'cef-logo';
  // El dibujo va adentro de la página: con una máscara, las teles que no la entienden muestran un
  // rectángulo blanco.
  logo.innerHTML = logoSvg;
  wallpaper.appendChild(logo);
  const black = layer(stage, 'cef-black');

  // Con F9 sin nada al aire se mantiene el último fondo usado.
  let theme = DEFAULT_THEME;
  // El estilo que se está dibujando: el del temporizador, si está a pantalla completa.
  let applied = DEFAULT_THEME;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let fitted = '';
  // El margen es una fracción de la pantalla: el mismo 5 % en una tele chica que en una grande.
  let margin = DEFAULT_THEME.margin;

  function unit() {
    return Math.min(stage.clientWidth, (stage.clientHeight * 16) / 9) / 100;
  }

  // Prueba tamaños hasta que el texto y la referencia entran en la pantalla.
  function fitText(force = false) {
    const { clientWidth: width, clientHeight: height } = stage;
    const { scale } = applied;
    const key = [width, height, body.textContent, title.textContent, JSON.stringify(applied), margin].join('|');
    if (!width || !height || (key === fitted && !force)) return;
    fitted = key;
    const u = unit();
    const gap = title.textContent ? 2.5 * u : 0;
    const room = height * (1 - 2 * margin);
    title.style.marginTop = `${gap}px`;
    const fits = (fit: number) => {
      body.style.fontSize = `${5.8 * scale * u * fit}px`;
      title.style.fontSize = `${2.6 * Math.min(scale, 1.2) * u * fit}px`;
      return body.offsetHeight + gap + title.offsetHeight <= room;
    };
    if (fits(1)) return;
    let small = MIN_FIT;
    let big = 1;
    for (let step = 0; step < 7; step++) {
      const middle = (small + big) / 2;
      if (fits(middle)) small = middle;
      else big = middle;
    }
    fits(small);
  }

  function measure() {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    stage.style.fontSize = `${unit()}px`;
    text.style.padding = `${height * margin}px ${width * margin}px`;
    fitText();
  }

  measure();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(stage);
  else window.addEventListener('resize', measure);
  // Una fuente que recién termina de cargar cambia lo que ocupa el texto.
  document.fonts?.addEventListener?.('loadingdone', () => fitText(true));

  function showTimer(run: TimerRun | undefined, layout: TimerLayout | undefined, visible: boolean, look: Theme) {
    clearInterval(ticker);
    toggle(timer, 'cef-on', !!run && visible);
    if (!run || !visible) return;
    const full = layout === 'full';
    toggle(timer, 'cef-timer-corner', !full);
    timer.style.fontFamily = fontCss(look.font);
    timer.style.color = full ? look.color : '';
    timerLabel.style.color = full ? look.titleColor : '';
    timerLabel.textContent = run.label;
    const tick = () => {
      const left = remainingMs(run, now());
      const done = left === 0 && !!run.message;
      toggle(timer, 'cef-timer-done', done);
      const next = done ? run.message : formatRemaining(left);
      if (timerTime.textContent !== next) timerTime.textContent = next;
    };
    tick();
    ticker = setInterval(tick, 250);
  }

  return function render({ slide, mode, timers = [], shownTimer = null }: RenderState) {
    theme = slide?.theme ?? (slide ? DEFAULT_THEME : theme);
    const run = timers.filter((item) => item.id === shownTimer?.id)[0];
    // A pantalla completa el temporizador reemplaza lo proyectado, con su propio estilo.
    const timerFull = !!run && shownTimer?.layout === 'full';
    const look = (timerFull && run?.theme) || theme;
    applied = look;
    applyTheme(look, { background, text, body, title });
    if ((look.margin ?? DEFAULT_THEME.margin) !== margin) {
      margin = look.margin ?? DEFAULT_THEME.margin;
      measure();
    }
    const bg = look.background;
    // El video de fondo no lleva sonido: el audio es de lo que se proyecta.
    const backgroundFile = bg.kind === 'css' ? null : { kind: bg.kind, url: bg.url, thumb: bg.thumb, loop: true };
    showFile(background, backgroundFile, false, playback);

    const hasMedia = !!slide?.media;
    body.textContent = slide?.body ?? '';
    title.textContent = slide?.title ?? '';
    const sound = typeof audio === 'function' ? audio() : audio;
    showFile(media, mode === 'live' && !timerFull ? (slide?.media ?? null) : null, sound, playback);
    showTimer(run, shownTimer?.layout, mode === 'live', look);
    fitText();

    toggle(background, 'cef-on', mode === 'live' || mode === 'background');
    toggle(text, 'cef-on', mode === 'live' && !!slide && !hasMedia && !timerFull);
    toggle(media, 'cef-on', mode === 'live' && hasMedia && !timerFull);
    toggle(wallpaper, 'cef-on', mode === 'wallpaper');
    toggle(black, 'cef-on', mode === 'black');
  };
}
