// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.
import type { OnAirState, SlideMedia } from '@shared/state';
import { DEFAULT_THEME, fontCss, type Theme } from '@shared/theme';

export type RenderState = Pick<OnAirState, 'slide' | 'mode'>;

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
  const wallpaper = layer(stage, 'cef-wallpaper');
  wallpaper.textContent = 'CEFLIRICS';
  const black = layer(stage, 'cef-black');

  // Con F9 sin nada al aire se mantiene el último fondo usado.
  let theme = DEFAULT_THEME;

  return function render({ slide, mode }: RenderState) {
    theme = slide?.theme ?? (slide ? DEFAULT_THEME : theme);
    applyTheme(theme, { background, text, body, title });
    const bg = theme.background;
    // El video de fondo no lleva sonido: el audio es de lo que se proyecta.
    showFile(background, bg.kind === 'css' ? null : { kind: bg.kind, url: bg.url, loop: true }, false);

    const hasMedia = !!slide?.media;
    body.textContent = slide?.body ?? '';
    title.textContent = slide?.title ?? '';
    showFile(media, mode === 'live' ? (slide?.media ?? null) : null, audio);

    background.classList.toggle('cef-on', mode === 'live' || mode === 'background');
    text.classList.toggle('cef-on', mode === 'live' && !!slide && !hasMedia);
    media.classList.toggle('cef-on', mode === 'live' && hasMedia);
    wallpaper.classList.toggle('cef-on', mode === 'wallpaper');
    black.classList.toggle('cef-on', mode === 'black');
  };
}
