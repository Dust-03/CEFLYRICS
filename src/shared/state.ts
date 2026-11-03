// Estado "al aire": la única fuente de verdad de lo que se ve en todas las salidas.
// Vive en el proceso main; los renderers lo reciben y lo cambian solo con acciones.

export type Slide = { body: string; title: string };

// F8 wallpaper, F9 solo fondo, F10 negro.
export type OverrideMode = 'wallpaper' | 'background' | 'black';
export type OutputMode = 'live' | OverrideMode;

export type OnAirState = {
  rev: number;
  slide: Slide | null;
  mode: OutputMode;
};

export type Action =
  { type: 'show-slide'; slide: Slide } | { type: 'clear' } | { type: 'toggle-mode'; mode: OverrideMode };

export const initialState: OnAirState = { rev: 0, slide: null, mode: 'live' };

export function reduce(state: OnAirState, action: Action): OnAirState {
  switch (action.type) {
    case 'show-slide':
      return { ...state, rev: state.rev + 1, slide: action.slide };
    case 'clear':
      // Con ESC se vuelve al estado limpio. Sin nada que limpiar, no hay cambio.
      if (!state.slide && state.mode === 'live') return state;
      return { ...state, rev: state.rev + 1, slide: null, mode: 'live' };
    case 'toggle-mode':
      return { ...state, rev: state.rev + 1, mode: state.mode === action.mode ? 'live' : action.mode };
  }
}

const OVERRIDE_MODES: readonly string[] = ['wallpaper', 'background', 'black'];
const MAX_TEXT = 20_000;

// Lo que llega por IPC no se da por bueno: viene de un proceso con menos privilegios.
export function parseAction(input: unknown): Action | null {
  if (typeof input !== 'object' || input === null) return null;
  const action = input as Record<string, unknown>;
  if (action.type === 'clear') return { type: 'clear' };
  if (action.type === 'toggle-mode' && OVERRIDE_MODES.includes(action.mode as string)) {
    return { type: 'toggle-mode', mode: action.mode as OverrideMode };
  }
  if (action.type === 'show-slide' && typeof action.slide === 'object' && action.slide !== null) {
    const { body, title } = action.slide as Record<string, unknown>;
    if (typeof body !== 'string' || typeof title !== 'string') return null;
    return { type: 'show-slide', slide: { body: body.slice(0, MAX_TEXT), title: title.slice(0, 500) } };
  }
  return null;
}
