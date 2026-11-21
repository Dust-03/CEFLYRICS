// Botones de salida de la columna "Al aire": cada uno con su nombre, su tecla y lo que hace.
// El operador los cambia en Configuración; el proceso main atiende las teclas.
import type { Action } from './state';

export type KeyAction = 'wallpaper' | 'background' | 'black' | 'clear';
export type KeyButton = { label: string; key: string; action: KeyAction };

export const KEY_ACTIONS: { action: KeyAction; label: string }[] = [
  { action: 'wallpaper', label: 'Mostrar el wallpaper' },
  { action: 'background', label: 'Dejar solo el fondo' },
  { action: 'black', label: 'Poner la pantalla en negro' },
  { action: 'clear', label: 'Quitar lo que está al aire' },
];

// F11 queda para pantalla completa; letras y flechas, para escribir y navegar.
const KEY_NAMES: Record<string, string> = {
  Escape: 'Esc',
  Insert: 'Insert',
  Home: 'Inicio',
  End: 'Fin',
  PageUp: 'Re Pág',
  PageDown: 'Av Pág',
  Pause: 'Pausa',
};
export const FREE_KEYS = [
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12'],
  ...Object.keys(KEY_NAMES),
];

export const DEFAULT_KEY_BUTTONS: KeyButton[] = [
  { label: 'Wallpaper', key: 'F8', action: 'wallpaper' },
  { label: 'Fondo', key: 'F9', action: 'background' },
  { label: 'Negro', key: 'F10', action: 'black' },
  { label: 'Quitar', key: 'Escape', action: 'clear' },
];

export const MAX_LABEL = 16;

export const keyName = (key: string) => KEY_NAMES[key] ?? key;

export function keyActionToAction(action: KeyAction): Action {
  return action === 'clear' ? { type: 'clear' } : { type: 'toggle-mode', mode: action };
}

// Lo que llega del renderer o de la base se valida: siempre quedan cuatro botones usables.
// Una tecla repetida o desconocida queda sin asignar ('').
export function parseKeyButtons(value: unknown): KeyButton[] {
  const list = Array.isArray(value) ? value : [];
  const used = new Set<string>();
  return DEFAULT_KEY_BUTTONS.map((fallback, index) => {
    const item = (list[index] ?? fallback) as Partial<KeyButton>;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, MAX_LABEL) : '';
    const action = KEY_ACTIONS.some((entry) => entry.action === item.action) ? item.action! : fallback.action;
    let key = typeof item.key === 'string' && FREE_KEYS.includes(item.key) ? item.key : '';
    if (used.has(key)) key = '';
    if (key) used.add(key);
    return { label: label || fallback.label, key, action };
  });
}
