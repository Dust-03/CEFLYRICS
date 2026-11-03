// Motor de render único: el mismo código dibuja en las ventanas de salida, en los navegadores de
// la LAN, en OBS y en NDI. No puede depender de Electron ni de Node.

export function renderBlack(stage: HTMLElement) {
  stage.style.cssText = 'position:fixed;inset:0;background:#000';
}
