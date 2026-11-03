import { createRenderer } from '@render-engine/index';
import type { OnAirState } from '@shared/state';

const render = createRenderer(document.getElementById('stage')!);
let rev = -1;

function apply(state: OnAirState) {
  if (state.rev < rev) return;
  rev = state.rev;
  render(state);
  // Para medir en las pruebas cuánto tarda en llegar un cambio.
  (window as any).__cefOutput = { rev, at: performance.timeOrigin + performance.now() };
}

// La misma página corre fuera de Electron: ahí el estado llega por apply.
(window as any).__cefApply = apply;
if (window.ceflirics) {
  window.ceflirics.onState(apply);
  window.ceflirics.getState().then(apply);
}
