// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.
import type { OnAirState, SlideMedia } from '@shared/state';
import { DEFAULT_THEME, fontCss, type Theme } from '@shared/theme';
import { formatRemaining, remainingMs, type TimerLayout, type TimerRun } from '@shared/timers';

export type RenderState = Pick<OnAirState, 'slide' | 'mode'> & Partial<Pick<OnAirState, 'timers' | 'shownTimer'>>;

// Las medidas van en unidades del contenedor (cqw), para verse igual a cualquier tamaño.
const STYLES = `
.cef-stage { position: absolute; inset: 0; overflow: hidden; container-type: size; background: #000; color: #fff; }
.cef-layer { position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s ease; }
.cef-layer.cef-on { opacity: 1; }
.cef-fill { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cef-media { background: #000; }
.cef-media .cef-fill { object-fit: contain; }
.cef-wallpaper { display: grid; place-content: center; background: #05070d; color: #f2b544; font-family: system-ui, 'Segoe UI', sans-serif; font-size: 6cqw; font-weight: 800; letter-spacing: 0.08em; }
.cef-text { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5cqw; padding: 5cqh 6cqw; text-align: center; }
.cef-body { margin: 0; font-size: 5cqw; line-height: 1.25; font-weight: 600; white-space: pre-line; }
.cef-shadow .cef-body { text-shadow: 0 0.2cqw 0.8cqw rgb(0 0 0 / 0.6); }
.cef-title { margin: 0; font-size: 2.6cqw; font-weight: 600; }
.cef-timer { display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1cqw; opacity: 1; font-variant-numeric: tabular-nums; }
.cef-timer.cef-on { display: flex; }
.cef-timer-label { font-size: 3.2cqw; font-weight: 600; }
.cef-timer-time { font-size: 17cqw; font-weight: 700; line-height: 1; }
.cef-timer-done .cef-timer-time { font-size: 8cqw; line-height: 1.2; text-align: center; padding: 0 5cqw; }
.cef-timer-corner { inset: auto 2cqw 2cqw auto; flex-direction: row; gap: 1.2cqw; padding: 0.8cqw 1.6cqw; background: rgb(0 0 0 / 0.65); border-radius: 1cqw; color: #fff; }
.cef-timer-corner .cef-timer-label { font-size: 1.6cqw; }
.cef-timer-corner .cef-timer-time, .cef-timer-corner.cef-timer-done .cef-timer-time { font-size: 3.4cqw; padding: 0; }
.cef-black { background: #000; transition-duration: 0s; }
`;

function layer(stage: HTMLElement, className: string) {
  const element = document.createElement('div');
  element.className = `cef-layer ${className}`;
  stage.append(element);
  return element;
}

// Pone una foto o un video en la capa. Si ya está el mismo archivo no lo toca: reiniciar el
// video de fondo entre diapositivas se vería como un salto.
function showFile(host: HTMLElement, file: SlideMedia | null, audio: boolean) {
  const current = host.firstElementChild as HTMLVideoElement | HTMLImageElement | null;
  if (current?.dataset.url === file?.url) {
    if (file?.kind === 'video') (current as HTMLVideoElement).loop = file.loop;
    return;
  }
  if (current instanceof HTMLVideoElement) current.pause();
  host.replaceChildren();
  if (!file) return;

  if (file.kind === 'image') {
    const image = document.createElement('img');
    image.className = 'cef-fill';
    image.dataset.url = file.url;
    image.src = file.url;
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
  parts.body.style.color = theme.color;
  parts.body.style.fontSize = `${5 * theme.scale}cqw`;
  parts.body.style.textTransform = theme.uppercase ? 'uppercase' : 'none';
  parts.title.style.color = theme.titleColor;
  parts.title.style.fontSize = `${2.6 * Math.min(theme.scale, 1.2)}cqw`;
}

export function createRenderer(stage: HTMLElement, { audio = false } = {}) {
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
  wallpaper.textContent = 'CEFLIRICS';
  const black = layer(stage, 'cef-black');

  // Con F9 sin nada al aire se mantiene el último fondo usado.
  let theme = DEFAULT_THEME;
  let ticker: ReturnType<typeof setInterval> | undefined;

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
      const left = remainingMs(run, Date.now());
      const done = left === 0 && !!run.message;
      timer.classList.toggle('cef-timer-done', done);
      timerTime.textContent = done ? run.message : formatRemaining(left);
    };
    tick();
    ticker = setInterval(tick, 200);
  }

  return function render({ slide, mode, timers = [], shownTimer = null }: RenderState) {
    theme = slide?.theme ?? (slide ? DEFAULT_THEME : theme);
    const run = timers.find((item) => item.id === shownTimer?.id);
    // A pantalla completa el temporizador reemplaza lo proyectado, con su propio estilo.
    const timerFull = !!run && shownTimer?.layout === 'full';
    const look = (timerFull && run?.theme) || theme;
    applyTheme(look, { background, text, body, title });
    const bg = look.background;
    // El video de fondo no lleva sonido: el audio es de lo que se proyecta.
    showFile(background, bg.kind === 'css' ? null : { kind: bg.kind, url: bg.url, loop: true }, false);

    const hasMedia = !!slide?.media;
    body.textContent = slide?.body ?? '';
    title.textContent = slide?.title ?? '';
    showFile(media, mode === 'live' && !timerFull ? (slide?.media ?? null) : null, audio);
    showTimer(run, shownTimer?.layout, mode === 'live', look);

    background.classList.toggle('cef-on', mode === 'live' || mode === 'background');
    text.classList.toggle('cef-on', mode === 'live' && !!slide && !hasMedia && !timerFull);
    media.classList.toggle('cef-on', mode === 'live' && hasMedia && !timerFull);
    wallpaper.classList.toggle('cef-on', mode === 'wallpaper');
    black.classList.toggle('cef-on', mode === 'black');
  };
}
