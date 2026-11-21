import { expect, test } from 'vitest';
import { DEFAULT_KEY_BUTTONS, keyActionToAction, parseKeyButtons } from '../../src/shared/keys';

test('sin nada guardado quedan los botones de fábrica', () => {
  expect(parseKeyButtons(null)).toEqual(DEFAULT_KEY_BUTTONS);
  expect(parseKeyButtons('basura')).toEqual(DEFAULT_KEY_BUTTONS);
});

test('se respetan nombre, tecla y acción elegidos', () => {
  const buttons = parseKeyButtons([
    { label: '  Logo  ', key: 'F2', action: 'wallpaper' },
    { label: 'Fondo', key: 'F9', action: 'black' },
    { label: 'Negro', key: '', action: 'black' },
    { label: 'Quitar', key: 'Escape', action: 'clear' },
  ]);
  expect(buttons[0]).toEqual({ label: 'Logo', key: 'F2', action: 'wallpaper' });
  expect(buttons[1].action).toBe('black');
  expect(buttons[2].key).toBe('');
});

test('lo inválido se corrige sin perder los cuatro botones', () => {
  const buttons = parseKeyButtons([
    { label: '', key: 'F11', action: 'borrar-todo' },
    { label: 'Un nombre larguísimo de botón', key: 'F8', action: 'background' },
    { label: 'Otro', key: 'F8', action: 'black' },
  ]);
  expect(buttons).toHaveLength(4);
  // F11 es de pantalla completa; la acción desconocida vuelve a la de fábrica.
  expect(buttons[0]).toEqual({ label: 'Wallpaper', key: '', action: 'wallpaper' });
  expect(buttons[1].label).toHaveLength(16);
  // Una tecla hace una sola cosa: la repetida queda sin asignar.
  expect(buttons[2].key).toBe('');
  expect(buttons[3]).toEqual(DEFAULT_KEY_BUTTONS[3]);
});

test('cada acción se traduce a lo que entiende el estado', () => {
  expect(keyActionToAction('clear')).toEqual({ type: 'clear' });
  expect(keyActionToAction('black')).toEqual({ type: 'toggle-mode', mode: 'black' });
});
