// Estado "al aire": la única fuente de verdad de lo que se ve en todas las salidas.
// Vive en el proceso main; los renderers lo reciben y lo cambian solo con acciones.
import { parseTheme, type Theme } from './theme';
import { parseTimerRun, type ShownTimer, type TimerLayout, type TimerRun } from './timers';

export type SlideMedia = { kind: 'image' | 'video'; url: string; loop: boolean };
export type Slide = { body: string; title: string; theme?: Theme; media?: SlideMedia };

// F8 wallpaper, F9 solo fondo, F10 negro.
export type OverrideMode = 'wallpaper' | 'background' | 'black';
export type OutputMode = 'live' | OverrideMode;

export type OnAirState = {
  rev: number;
  slide: Slide | null;
  mode: OutputMode;
  timers: TimerRun[];
  shownTimer: ShownTimer | null;
};

export type Action =
  | { type: 'show-slide'; slide: Slide }
  | { type: 'clear' }
  | { type: 'toggle-mode'; mode: OverrideMode }
  | { type: 'timer-run'; run: TimerRun }
  | { type: 'timer-stop'; id: string }
  | { type: 'timer-show'; id: string; layout: TimerLayout }
  | { type: 'timer-hide' };

export const initialState: OnAirState = { rev: 0, slide: null, mode: 'live', timers: [], shownTimer: null };

export function reduce(state: OnAirState, action: Action): OnAirState {
  switch (action.type) {
    case 'show-slide':
      return { ...state, rev: state.rev + 1, slide: action.slide };
    case 'clear':
      // Con ESC se vuelve al estado limpio. Sin nada que limpiar, no hay cambio.
      // Los temporizadores siguen corriendo: solo dejan de verse.
      if (!state.slide && state.mode === 'live' && !state.shownTimer) return state;
      return { ...state, rev: state.rev + 1, slide: null, mode: 'live', shownTimer: null };
    case 'toggle-mode':
      return { ...state, rev: state.rev + 1, mode: state.mode === action.mode ? 'live' : action.mode };
    case 'timer-run':
      return {
        ...state,
        rev: state.rev + 1,
        timers: [...state.timers.filter((run) => run.id !== action.run.id), action.run],
      };
    case 'timer-stop':
      return {
        ...state,
        rev: state.rev + 1,
        timers: state.timers.filter((run) => run.id !== action.id),
        shownTimer: state.shownTimer?.id === action.id ? null : state.shownTimer,
      };
    case 'timer-show':
      if (!state.timers.some((run) => run.id === action.id)) return state;
      return { ...state, rev: state.rev + 1, shownTimer: { id: action.id, layout: action.layout } };
    case 'timer-hide':
      return state.shownTimer ? { ...state, rev: state.rev + 1, shownTimer: null } : state;
  }
}

const OVERRIDE_MODES: readonly string[] = ['wallpaper', 'background', 'black'];
const MAX_TEXT = 20_000;

function parseMedia(input: unknown): SlideMedia | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kind, url, loop } = input as Record<string, unknown>;
  if ((kind !== 'image' && kind !== 'video') || typeof url !== 'string' || !url.startsWith('cef-media://')) return null;
  return { kind, url: url.slice(0, 200), loop: !!loop };
}

function parseSlide(input: unknown): Slide | null {
  if (typeof input !== 'object' || input === null) return null;
  const { body, title, theme, media } = input as Record<string, unknown>;
  if (typeof body !== 'string' || typeof title !== 'string') return null;
  const slide: Slide = { body: body.slice(0, MAX_TEXT), title: title.slice(0, 500) };
  if (theme !== undefined) {
    const parsed = parseTheme(theme);
    if (!parsed) return null;
    slide.theme = parsed;
  }
  if (media !== undefined) {
    const parsed = parseMedia(media);
    if (!parsed) return null;
    slide.media = parsed;
  }
  return slide;
}

// Lo que llega por IPC no se da por bueno: viene de un proceso con menos privilegios.
export function parseAction(input: unknown): Action | null {
  if (typeof input !== 'object' || input === null) return null;
  const action = input as Record<string, unknown>;
  if (action.type === 'clear') return { type: 'clear' };
  if (action.type === 'toggle-mode' && OVERRIDE_MODES.includes(action.mode as string)) {
    return { type: 'toggle-mode', mode: action.mode as OverrideMode };
  }
  if (action.type === 'timer-hide') return { type: 'timer-hide' };
  if (action.type === 'timer-run') {
    const run = parseTimerRun(action.run);
    return run ? { type: 'timer-run', run } : null;
  }
  if (action.type === 'timer-stop' && typeof action.id === 'string') return { type: 'timer-stop', id: action.id };
  if (action.type === 'timer-show' && typeof action.id === 'string') {
    if (action.layout !== 'full' && action.layout !== 'corner') return null;
    return { type: 'timer-show', id: action.id, layout: action.layout };
  }
  if (action.type === 'show-slide') {
    const slide = parseSlide(action.slide);
    return slide ? { type: 'show-slide', slide } : null;
  }
  return null;
}
