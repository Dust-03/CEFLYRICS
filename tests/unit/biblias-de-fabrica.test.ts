import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { makeVid } from '../../src/shared/vid';

const FILE = 'resources/bibles.db';
const present = existsSync(FILE);
const db = present ? new Database(FILE, { readonly: true }) : null;

const verse = (code: string, book: number, chapter: number, number: number) =>
  (
    db!
      .prepare('SELECT text FROM verses JOIN bibles ON bibles.id = bible_id WHERE code = ? AND vid = ?')
      .get(code, makeVid({ book, chapter, verse: number })) as { text: string } | undefined
  )?.text;

const search = (code: string, query: string) =>
  db!
    .prepare(
      `SELECT verses.vid FROM verses_fts
       JOIN verses ON verses.id = verses_fts.rowid
       JOIN bibles ON bibles.id = verses.bible_id
       WHERE verses_fts MATCH ? AND code = ?`,
    )
    .all(query, code);

afterAll(() => db?.close());

// Requiere npm run bibles: la base se genera y no se versiona.
describe.skipIf(!present)('biblias de fábrica', () => {
  test('están las cuatro, solo de dominio público, con 66 libros', () => {
    const rows = db!
      .prepare(
        `SELECT code, license_kind, COUNT(*) AS books FROM bibles
         JOIN bible_books ON bible_id = bibles.id GROUP BY code ORDER BY code`,
      )
      .all();
    expect(rows).toEqual(
      ['BSB', 'KJV', 'RV1909', 'WEB'].map((code) => ({ code, license_kind: 'public_domain', books: 66 })),
    );
  });

  test('tienen la cantidad de versículos esperada', () => {
    const rows = db!
      .prepare('SELECT code, COUNT(*) AS verses FROM verses JOIN bibles ON bibles.id = bible_id GROUP BY code')
      .all();
    expect(rows).toEqual(
      expect.arrayContaining([
        { code: 'RV1909', verses: 31084 },
        { code: 'KJV', verses: 31102 },
        { code: 'WEB', verses: 31098 },
        { code: 'BSB', verses: 31086 },
      ]),
    );
  });

  test('los textos conocidos están bien', () => {
    expect(verse('RV1909', 43, 3, 16)).toMatch(/^Porque de tal manera amó Dios al mundo, que ha dado á su Hijo/);
    expect(verse('RV1909', 1, 1, 1)).toMatch(/^EN el principio crió Dios los cielos y la tierra/);
    expect(verse('KJV', 43, 3, 16)).toMatch(/^For God so loved the world/);
    expect(verse('RV1909', 66, 22, 21)).toBeTruthy();
  });

  test('el título del salmo no queda en el versículo 1', () => {
    expect(verse('RV1909', 19, 23, 1)).toBe('JEHOVÁ es mi pastor; nada me faltará.');
    expect(verse('RV1909', 19, 25, 1)).toMatch(/^A TI, oh Jehová/);
    expect(verse('RV1909', 19, 1, 1)).toMatch(/^BIENAVENTURADO el varón/);
    const leftovers = db!
      .prepare(
        `SELECT vid FROM verses JOIN bibles ON bibles.id = bible_id
         WHERE code = 'RV1909' AND vid BETWEEN 19000000 AND 19999999 AND vid % 1000 = 1
         AND (text LIKE 'Salmo %' OR text LIKE 'Al Músico%' OR text LIKE 'Cántico %' OR text LIKE 'Masquil%')`,
      )
      .all();
    expect(leftovers).toEqual([]);
  });

  test('no se cuelan marcas ni versículos vacíos', () => {
    const dirty = db!
      .prepare(
        `SELECT COUNT(*) AS n FROM verses
         WHERE text = '' OR text LIKE '%\\%' ESCAPE '|' OR text LIKE '%¶%' OR text LIKE '%strong=%' OR text LIKE '%|%'`,
      )
      .get() as { n: number };
    expect(dirty.n).toBe(0);
  });

  test('la búsqueda ignora acentos y responde en menos de 100 ms', () => {
    const start = performance.now();
    const found = search('RV1909', 'unigenito');
    const elapsed = performance.now() - start;
    expect(found.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  test('la WEB tiene mapeado el final de Romanos', () => {
    expect(verse('WEB', 45, 14, 24)).toBeTruthy();
    expect(verse('WEB', 45, 16, 25)).toBeUndefined();
    const row = db!
      .prepare(`SELECT to_vid FROM versification_map WHERE from_scheme = 'web' AND from_vid = ?`)
      .get(makeVid({ book: 45, chapter: 14, verse: 24 }));
    expect(row).toEqual({ to_vid: makeVid({ book: 45, chapter: 16, verse: 25 }) });
  });
});
