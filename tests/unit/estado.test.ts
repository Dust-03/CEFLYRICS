import { expect, test } from 'vitest';
import { initialState, parseAction, reduce } from '../../src/shared/state';

const slide = { body: 'En el principio', title: 'Génesis 1:1' };

test('lo que se manda al aire le gana a Logo, Fondo y Negro', () => {
  for (const mode of ['wallpaper', 'background', 'black'] as const) {
    const covered = reduce(initialState, { type: 'toggle-mode', mode });
    expect(reduce(covered, { type: 'show-slide', slide })).toMatchObject({ mode: 'live', slide });
  }
  const run = { id: 't', label: '', message: '', endsAt: 1, remainingMs: 0 };
  const running = reduce(reduce(initialState, { type: 'timer-run', run }), { type: 'toggle-mode', mode: 'black' });
  expect(reduce(running, { type: 'timer-show', id: 't', layout: 'full' }).mode).toBe('live');
});

test('mostrar y limpiar', () => {
  const shown = reduce(initialState, { type: 'show-slide', slide });
  expect(shown.slide).toEqual(slide);
  expect(shown.rev).toBe(1);
  expect(reduce(shown, { type: 'clear' })).toMatchObject({ slide: null, mode: 'live', rev: 2 });
});

test('limpiar sin nada al aire no genera un cambio', () => {
  expect(reduce(initialState, { type: 'clear' })).toBe(initialState);
});

test('los modos se prenden y se apagan, y mostrar en negro no quita el negro', () => {
  const black = reduce(initialState, { type: 'toggle-mode', mode: 'black' });
  expect(black.mode).toBe('black');
  expect(reduce(black, { type: 'toggle-mode', mode: 'black' }).mode).toBe('live');
  expect(reduce(black, { type: 'toggle-mode', mode: 'wallpaper' }).mode).toBe('wallpaper');
});

test('las acciones inválidas se rechazan', () => {
  for (const input of [null, 'clear', {}, { type: 'borrar-todo' }, { type: 'toggle-mode', mode: 'live' }]) {
    expect(parseAction(input)).toBeNull();
  }
  expect(parseAction({ type: 'show-slide', slide: { body: 1, title: '' } })).toBeNull();
  expect(parseAction({ type: 'show-slide', slide: { body: 'x', title: 'y', extra: 1 } })).toEqual({
    type: 'show-slide',
    slide: { body: 'x', title: 'y' },
  });
});
