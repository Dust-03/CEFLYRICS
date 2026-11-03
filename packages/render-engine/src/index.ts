// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.
import type { OnAirState } from '@shared/state';

export type RenderState = Pick<OnAirState, 'slide' | 'mode'>;

// Las medidas van en unidades del contenedor (cqw), para verse igual a cualquier tamaño.
const STYLES = `
.cef-stage { position: absolute; inset: 0; overflow: hidden; container-type: size; background: #000; color: #fff; font-family: system-ui, 'Segoe UI', sans-serif; }
.cef-layer { position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s ease; }
.cef-layer.cef-on { opacity: 1; }
.cef-background { background: radial-gradient(circle at 50% 40%, #1b2440, #05070d 75%); }
.cef-wallpaper { display: grid; place-content: center; background: #05070d; color: #f2b544; font-size: 6cqw; font-weight: 800; letter-spacing: 0.08em; }
.cef-text { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5cqw; padding: 5cqh 6cqw; text-align: center; }
.cef-body { margin: 0; font-size: 5cqw; line-height: 1.25; font-weight: 600; white-space: pre-line; text-shadow: 0 0.2cqw 0.8cqw rgb(0 0 0 / 0.6); }
.cef-title { margin: 0; font-size: 2.6cqw; font-weight: 600; color: #f2b544; }
.cef-black { background: #000; transition-duration: 0s; }
`;

function layer(stage: HTMLElement, className: string) {
  const element = document.createElement('div');
  element.className = `cef-layer ${className}`;
  stage.append(element);
  return element;
}

export function createRenderer(stage: HTMLElement) {
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
  const wallpaper = layer(stage, 'cef-wallpaper');
  wallpaper.textContent = 'CEFLIRICS';
  const black = layer(stage, 'cef-black');

  return function render({ slide, mode }: RenderState) {
    body.textContent = slide?.body ?? '';
    title.textContent = slide?.title ?? '';
    background.classList.toggle('cef-on', mode === 'live' || mode === 'background');
    text.classList.toggle('cef-on', mode === 'live' && !!slide);
    wallpaper.classList.toggle('cef-on', mode === 'wallpaper');
    black.classList.toggle('cef-on', mode === 'black');
  };
}
