// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.
import logoSvg from '../../../assets/logo-ceflyrics.svg?raw';
import type { OnAirState, SlideMedia } from '@shared/state';
import { DEFAULT_THEME, fontCss, type Theme } from '@shared/theme';
import { formatRemaining, remainingMs, type TimerLayout, type TimerRun } from '@shared/timers';

export type RenderState = Pick<OnAirState, 'slide' | 'mode'> & Partial<Pick<OnAirState, 'timers' | 'shownTimer'>>;

// Las medidas se escriben en u, una centésima del lado que manda: el ancho, salvo en pantallas más
// anchas que 16:9, donde manda el alto. Así nada se sale en ninguna proporción. Se calcula a mano y
// no con cqw porque muchos televisores traen navegadores viejos: por lo mismo no hay inset ni gap.
const STYLES = `
.cef-stage { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow: hidden; background: #000; color: #fff; }
.cef-layer { position: absolute; top: 0; right: 0; bottom: 0; left: 0; opacity: 0; transition: opacity 0.25s ease; }
.cef-layer.cef-on { opacity: 1; }
.cef-fill { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.cef-media { background: #000; }
.cef-media .cef-fill { object-fit: contain; }
.cef-wallpaper { display: flex; align-items: center; justify-content: center; background: #05070d; }
.cef-logo { width: 46u; height: 20.7u; color: #fff; }
.cef-logo svg { display: block; width: 100%; height: 100%; }
.cef-text { display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: var(--cef-margin-y, 5vh) var(--cef-margin-x, 5vw); text-align: center; }
.cef-body { margin: 0; max-width: 100%; white-space: pre-line; overflow-wrap: break-word; word-wrap: break-word; }
.cef-shadow .cef-body { text-shadow: 0 0.2u 0.8u rgba(0, 0, 0, 0.6); }
.cef-title { margin: 2.5u 0 0; font-weight: 600; }
.cef-outline .cef-body, .cef-outline .cef-title { position: relative; z-index: 0; }
.cef-outline .cef-body::before, .cef-outline .cef-title::before { content: attr(data-text); position: absolute; top: 0; right: 0; left: 0; z-index: -1; -webkit-text-stroke: var(--cef-stroke); }
.cef-outline.cef-shadow .cef-body { text-shadow: none; }
.cef-outline.cef-shadow .cef-body::before { text-shadow: 0 0.2u 0.8u rgba(0, 0, 0, 0.6); }
.cef-title:empty { margin: 0; }
.cef-timer { display: none; flex-direction: column; align-items: center; justify-content: center; opacity: 1; font-variant-numeric: tabular-nums; }
.cef-timer.cef-on { display: flex; }
.cef-timer-label { margin-bottom: 1u; font-size: 3.2u; font-weight: 600; }
.cef-timer-time { font-size: 17u; font-weight: 700; line-height: 1; }
.cef-timer-done .cef-timer-time { font-size: 8u; line-height: 1.2; text-align: center; padding: 0 5u; }
.cef-timer-corner { top: auto; left: auto; right: 2u; bottom: 2u; flex-direction: row; padding: 0.8u 1.6u; background: rgba(0, 0, 0, 0.65); border-radius: 1u; color: #fff; }
.cef-timer-corner .cef-timer-label { margin: 0 1.2u 0 0; font-size: 1.6u; }
.cef-timer-corner .cef-timer-time, .cef-timer-corner.cef-timer-done .cef-timer-time { font-size: 3.4u; padding: 0; }
.cef-black { background: #000; transition-duration: 0s; }
`.replace(/(\d[\d.]*)u\b/g, 'calc($1 * var(--cef-u))');

// El texto se achica hasta entrar, pero no más que esto: de ahí abajo no se lee.
const MIN_FIT = 0.05;

function layer(stage: HTMLElement, className: string) {
  const element = document.createElement('div');
  element.className = `cef-layer ${className}`;
  stage.append(element);
  return element;
}

// Pone una foto o un video en la capa. Si ya está el mismo archivo no lo toca: reiniciar el
// video de fondo entre diapositivas se vería como un salto.
function showFile(host: HTMLElement, file: SlideMedia | null, audio: boolean, playback: boolean) {
  const current = host.firstElementChild as HTMLVideoElement | HTMLImageElement | null;
  if (current?.dataset.url === file?.url) {
    if (file?.kind === 'video') (current as HTMLVideoElement).loop = file.loop;
    return;
  }
  if (current instanceof HTMLVideoElement) current.pause();
  host.textContent = '';
  if (!file) return;

  // En una vista de la consola alcanza con la miniatura: decodificar el archivo acá le quitaría
  // recursos al proyector.
  const still = !playback && file.thumb;
  if (file.kind === 'image' || still) {
    const image = document.createElement('img');
    image.className = 'cef-fill';
    image.dataset.url = file.url;
    image.decoding = 'async';
    image.src = still || file.url;
    host.append(image);
    return;
  }
  const video = document.createElement('video');
  video.className = 'cef-fill';
  video.dataset.url = file.url;
  video.src = file.url;
  video.loop = file.loop;
  video.muted = !audio;
  video.playsInline = true;
  host.append(video);
  if (!playback) return;
  video.play().catch(() => {
    // Si el navegador bloquea el audio, se reproduce sin sonido.
    video.muted = true;
    video.play().catch(() => {});
  });
}

function applyTheme(
  theme: Theme,
  parts: { background: HTMLElement; text: HTMLElement; body: HTMLElement; title: HTMLElement },
) {
  const { background: bg } = theme;
  parts.background.style.background = bg.kind === 'css' ? bg.value : '#000';
  parts.text.style.fontFamily = fontCss(theme.font);
  parts.text.classList.toggle('cef-shadow', theme.shadow);
  parts.text.style.fontWeight = String(theme.weight);
  parts.text.style.fontStyle = theme.italic ? 'italic' : 'normal';
  parts.body.style.color = theme.color;
  parts.body.style.lineHeight = String(theme.lineHeight);
  // El contorno va en una copia del texto por debajo (::before), no con paint-order: los navegadores
  // viejos de las teles lo ignoran y pintan el trazo encima, tapando la letra. La mitad del trazo
  // queda bajo la letra: se duplica para que se vea el grosor elegido.
  parts.text.classList.toggle('cef-outline', !!theme.outlineColor);
  parts.text.style.setProperty('--cef-stroke', `${theme.outlineWidth * 2}em ${theme.outlineColor ?? 'transparent'}`);
  parts.body.style.fontSize = `calc(${5.8 * theme.scale} * var(--cef-u) * var(--cef-fit, 1))`;
  parts.body.style.textTransform = theme.uppercase ? 'uppercase' : 'none';
  parts.title.style.color = theme.titleColor;
  parts.title.style.fontSize = `calc(${2.6 * Math.min(theme.scale, 1.2)} * var(--cef-u) * var(--cef-fit, 1))`;
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
    document.head.append(style);
  }
  stage.classList.add('cef-stage');

  const background = layer(stage, 'cef-background');
  const text = layer(stage, 'cef-text');
  const body = document.createElement('p');
  const title = document.createElement('p');
  body.className = 'cef-body';
  title.className = 'cef-title';
  text.append(body, title);
  const media = layer(stage, 'cef-media');
  const timer = layer(stage, 'cef-timer');
  const timerLabel = document.createElement('div');
  const timerTime = document.createElement('div');
  timerLabel.className = 'cef-timer-label';
  timerTime.className = 'cef-timer-time';
  timer.append(timerLabel, timerTime);
  const wallpaper = layer(stage, 'cef-wallpaper');
  const logo = document.createElement('div');
  logo.className = 'cef-logo';
  // El dibujo va adentro de la página: con una máscara, las teles que no la entienden muestran un
  // rectángulo blanco.
  logo.innerHTML = logoSvg;
  wallpaper.append(logo);
  const black = layer(stage, 'cef-black');

  // Con F9 sin nada al aire se mantiene el último fondo usado.
  let theme = DEFAULT_THEME;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let fitted = '';
  // El margen es una fracción de la pantalla: el mismo 5 % en una tele chica que en una grande.
  let margin = DEFAULT_THEME.margin;

  // Prueba tamaños hasta que el texto y la referencia entran en la pantalla.
  function fitText(force = false) {
    const { clientWidth: width, clientHeight: height } = stage;
    const key = [width, height, body.textContent, title.textContent, body.style.cssText, margin].join('|');
    if (!width || !height || (key === fitted && !force)) return;
    fitted = key;
    const style = getComputedStyle(text);
    const room = text.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const gap = parseFloat(getComputedStyle(title).marginTop);
    const fits = (scale: number) => {
      stage.style.setProperty('--cef-fit', String(scale));
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
    stage.style.setProperty('--cef-margin-x', `${width * margin}px`);
    stage.style.setProperty('--cef-margin-y', `${height * margin}px`);
    stage.style.setProperty('--cef-u', `${Math.min(width, (height * 16) / 9) / 100}px`);
    fitText();
  }

  measure();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(stage);
  else window.addEventListener('resize', measure);
  // Una fuente que recién termina de cargar cambia lo que ocupa el texto.
  document.fonts?.addEventListener?.('loadingdone', () => fitText(true));

  function showTimer(run: TimerRun | undefined, layout: TimerLayout | undefined, visible: boolean, look: Theme) {
    clearInterval(ticker);
    timer.classList.toggle('cef-on', !!run && visible);
    if (!run || !visible) return;
    const full = layout === 'full';
    timer.classList.toggle('cef-timer-corner', !full);
    timer.style.fontFamily = fontCss(look.font);
    timer.style.color = full ? look.color : '';
    timerLabel.style.color = full ? look.titleColor : '';
    timerLabel.textContent = run.label;
    const tick = () => {
      const left = remainingMs(run, now());
      const done = left === 0 && !!run.message;
      timer.classList.toggle('cef-timer-done', done);
      const next = done ? run.message : formatRemaining(left);
      if (timerTime.textContent !== next) timerTime.textContent = next;
    };
    tick();
    ticker = setInterval(tick, 250);
  }

  return function render({ slide, mode, timers = [], shownTimer = null }: RenderState) {
    theme = slide?.theme ?? (slide ? DEFAULT_THEME : theme);
    const run = timers.find((item) => item.id === shownTimer?.id);
    // A pantalla completa el temporizador reemplaza lo proyectado, con su propio estilo.
    const timerFull = !!run && shownTimer?.layout === 'full';
    const look = (timerFull && run?.theme) || theme;
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
    body.textContent = body.dataset.text = slide?.body ?? '';
    title.textContent = title.dataset.text = slide?.title ?? '';
    const sound = typeof audio === 'function' ? audio() : audio;
    showFile(media, mode === 'live' && !timerFull ? (slide?.media ?? null) : null, sound, playback);
    showTimer(run, shownTimer?.layout, mode === 'live', look);
    fitText();

    background.classList.toggle('cef-on', mode === 'live' || mode === 'background');
    text.classList.toggle('cef-on', mode === 'live' && !!slide && !hasMedia && !timerFull);
    media.classList.toggle('cef-on', mode === 'live' && hasMedia && !timerFull);
    wallpaper.classList.toggle('cef-on', mode === 'wallpaper');
    black.classList.toggle('cef-on', mode === 'black');
  };
}
