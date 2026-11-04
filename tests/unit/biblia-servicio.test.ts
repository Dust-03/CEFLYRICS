import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { BibleService } from '../../src/main/bible/service';
import { BOOK_GROUPS, bookShortName } from '../../src/shared/bible-groups';

test('los grupos cubren los 66 libros sin repetir', () => {
  const books = BOOK_GROUPS.flatMap(({ from, to }) => Array.from({ length: to - from + 1 }, (_, i) => from + i));
  expect(books).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
});

test('cada libro tiene una etiqueta corta distinta', () => {
  const labels = Array.from({ length: 66 }, (_, i) => bookShortName(i + 1));
  expect(new Set(labels).size).toBe(66);
  expect(labels[0]).toBe('Gén');
  expect(labels[8]).toBe('1 Sam');
  expect(labels[56]).toBe('Flm');
});

const FILE = 'resources/bibles.db';
const present = existsSync(FILE);
const db = present ? new Database(FILE, { readonly: true }) : null;
const bible = db ? new BibleService(db) : null;
afterAll(() => db?.close());

describe.skipIf(!present)('búsqueda en la base real', () => {
  test('lista las versiones con el español primero', () => {
    expect(bible!.list().map((b) => b.code)).toEqual(['RV1909', 'KJV', 'WEB', 'BSB']);
  });

  test('cuenta bien los capítulos', () => {
    const books = bible!.books('RV1909');
    expect(books).toHaveLength(66);
    expect(books[18]).toEqual({ book: 19, name: 'Salmos', chapters: 150 });
    expect(books[64].chapters).toBe(1);
  });

  test('una cita trae sus versículos con etiqueta', () => {
    const result = bible!.search('RV1909', '1 co 13:4-7');
    expect(result.kind).toBe('reference');
    expect(result.verses.map((v) => v.label)).toEqual([
      '1 Corintios 13:4',
      '1 Corintios 13:5',
      '1 Corintios 13:6',
      '1 Corintios 13:7',
    ]);
  });

  test('un capítulo entero y una cita que no existe', () => {
    expect(bible!.chapter('RV1909', 19, 23)).toHaveLength(6);
    expect(bible!.search('RV1909', 'juan 99:1').verses).toEqual([]);
  });

  test('una palabra busca en el texto, con prefijo y sin acentos', () => {
    const result = bible!.search('RV1909', 'unigeni');
    expect(result.kind).toBe('text');
    expect(result.verses.some((v) => v.label === 'Juan 3:16')).toBe(true);
  });

  test('la palabra exacta va antes que las que empiezan igual', () => {
    const verses = bible!.search('RV1909', 'amor').verses;
    expect(verses.slice(0, 20).every((v) => /(^|\P{L})amor(\P{L}|$)/iu.test(v.text))).toBe(true);
    expect(verses.at(-1)?.text).toMatch(/amor/i);
  });

  test('la sintaxis de FTS5 no rompe la búsqueda', () => {
    for (const query of ['"', 'dios"', 'NEAR(', 'a AND', '*', '-', 'x:y']) {
      expect(() => bible!.search('RV1909', query)).not.toThrow();
    }
  });

  test('responde en menos de 100 ms aun con muchos resultados', () => {
    for (const query of ['jehová', 'dios', 'y', 'sal 119']) {
      const start = performance.now();
      bible!.search('RV1909', query);
      const elapsed = performance.now() - start;
      expect(elapsed, query).toBeLessThan(100);
    }
  });
});
