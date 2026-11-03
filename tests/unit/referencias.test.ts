import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { bookName, formatReference, parseReference, referenceRange } from '../../src/shared/reference';

const ref = (book: number, chapter?: number, verse?: number, endChapter?: number, endVerse?: number) => {
  const result: Record<string, number> = { book };
  if (chapter !== undefined) result.chapter = chapter;
  if (verse !== undefined) result.verse = verse;
  if (endChapter !== undefined) result.endChapter = endChapter;
  if (endVerse !== undefined) result.endVerse = endVerse;
  return result;
};

test.each([
  // Los tres ejemplos de la especificación.
  ['jn 3 16', ref(43, 3, 16)],
  ['Juan 3:16', ref(43, 3, 16)],
  ['1 Co 13:4-7', ref(46, 13, 4, undefined, 7)],
  // Formas de escribir el lugar.
  ['juan 3,16', ref(43, 3, 16)],
  ['juan 3.16', ref(43, 3, 16)],
  ['Juan 3', ref(43, 3)],
  ['Juan', ref(43)],
  ['  JUAN   3 :  16 ', ref(43, 3, 16)],
  ['romanos 8:28-30', ref(45, 8, 28, undefined, 30)],
  ['romanos 8:28 al 30', ref(45, 8, 28, undefined, 30)],
  ['romanos 8:28 a 30', ref(45, 8, 28, undefined, 30)],
  ['romanos 8:28–30', ref(45, 8, 28, undefined, 30)],
  ['mt 5:3-6:2', ref(40, 5, 3, 6, 2)],
  ['salmos 1-3', ref(19, 1, undefined, 3)],
  // Acentos, puntos y mayúsculas.
  ['Génesis 1:1', ref(1, 1, 1)],
  ['genesis 1 1', ref(1, 1, 1)],
  ['Gn. 1:1', ref(1, 1, 1)],
  ['1 Co. 13', ref(46, 13)],
  ['ÉXODO 20', ref(2, 20)],
  // Libros numerados.
  ['1co 13', ref(46, 13)],
  ['2cr 7 14', ref(14, 7, 14)],
  ['1 juan 1 9', ref(62, 1, 9)],
  ['1 de juan 1:9', ref(62, 1, 9)],
  ['primera de juan 1', ref(62, 1)],
  ['Primera carta de San Juan 4:8', ref(62, 4, 8)],
  ['1ra corintios 13', ref(46, 13)],
  ['segunda timoteo 3:16', ref(55, 3, 16)],
  ['2da pedro 1', ref(61, 1)],
  ['I samuel 17', ref(9, 17)],
  ['ii reyes 2', ref(12, 2)],
  ['3 juan 4', ref(64, 1, 4)],
  // Parecidos que no hay que confundir.
  ['job 1', ref(18, 1)],
  ['jos 1', ref(6, 1)],
  ['jon 1', ref(32, 1)],
  ['jue 1', ref(7, 1)],
  ['jud 3', ref(65, 1, 3)],
  ['fil 4:13', ref(50, 4, 13)],
  ['flm 6', ref(57, 1, 6)],
  ['filemon 6', ref(57, 1, 6)],
  ['mi 5', ref(33, 5)],
  ['mal 3', ref(39, 3)],
  ['mt 5', ref(40, 5)],
  ['mr 1', ref(41, 1)],
  ['ez 37', ref(26, 37)],
  ['esd 1', ref(15, 1)],
  ['est 1', ref(17, 1)],
  // Nombres largos y populares.
  ['salmo 23', ref(19, 23)],
  ['sal 23:1', ref(19, 23, 1)],
  ['cantar de los cantares 2:1', ref(22, 2, 1)],
  ['cantares 2', ref(22, 2)],
  ['san juan 3:16', ref(43, 3, 16)],
  ['san mateo 5', ref(40, 5)],
  ['evangelio de lucas 2', ref(42, 2)],
  ['evangelio segun san marcos 1', ref(41, 1)],
  ['apocalipsis 22:21', ref(66, 22, 21)],
  ['ap 1', ref(66, 1)],
  // Comienzo de nombre sin ambigüedad, mientras se escribe.
  ['apoc', ref(66)],
  ['deuter', ref(5)],
  ['lament 3', ref(25, 3)],
  // Libros de un capítulo: el número es el versículo.
  ['abdias 3', ref(31, 1, 3)],
  ['judas 24-25', ref(65, 1, 24, undefined, 25)],
  ['judas 1:3', ref(65, 1, 3)],
])('%s', (input, expected) => {
  expect(parseReference(input)).toEqual(expected);
});

test.each([
  [''],
  ['   '],
  ['3:16'],
  ['1 3 16'],
  ['libro inexistente 3'],
  ['j 3'],
  ['juan 0'],
  ['juan 3:0'],
  ['juan 3:18-16'],
  ['juan 5-3'],
  ['juan 3:16:20'],
  ['juan abc'],
  ['4 juan 1'],
])('rechaza "%s"', (input) => {
  expect(parseReference(input)).toBeNull();
});

test('el rango en la base cubre lo pedido', () => {
  const range = (text: string) => referenceRange(parseReference(text)!);
  expect(range('juan 3:16')).toEqual({ from: 43003016, to: 43003016 });
  expect(range('1 co 13:4-7')).toEqual({ from: 46013004, to: 46013007 });
  expect(range('juan 3')).toEqual({ from: 43003001, to: 43003999 });
  expect(range('mt 5:3-6:2')).toEqual({ from: 40005003, to: 40006002 });
  expect(range('salmos 1-3')).toEqual({ from: 19001001, to: 19003999 });
  expect(range('juan')).toEqual({ from: 43001001, to: 43999999 });
  expect(range('judas 3')).toEqual({ from: 65001003, to: 65001003 });
});

test.each([
  ['jn 3 16', 'Juan 3:16'],
  ['1 co 13:4-7', '1 Corintios 13:4-7'],
  ['mt 5:3-6:2', 'Mateo 5:3-6:2'],
  ['salmos 1-3', 'Salmos 1-3'],
  ['sal 23', 'Salmos 23'],
  ['apoc', 'Apocalipsis'],
])('escribe %s como %s', (input, expected) => {
  expect(formatReference(parseReference(input)!)).toBe(expected);
});

test('todos los libros se entienden por su propio nombre', () => {
  for (let book = 1; book <= 66; book++) {
    expect(parseReference(`${bookName(book)} 1`)?.book, bookName(book)).toBe(book);
  }
});

const FILE = 'resources/bibles.db';
describe.skipIf(!existsSync(FILE))('con los nombres reales de la RV1909', () => {
  test('cada libro de la base se reconoce', () => {
    const db = new Database(FILE, { readonly: true });
    const books = db
      .prepare(
        `SELECT book_no, bible_books.name FROM bible_books
         JOIN bibles ON bibles.id = bible_id WHERE code = 'RV1909'`,
      )
      .all() as { book_no: number; name: string }[];
    db.close();
    expect(books).toHaveLength(66);
    for (const { book_no, name } of books) expect(parseReference(`${name} 1`)?.book, name).toBe(book_no);
  });
});
