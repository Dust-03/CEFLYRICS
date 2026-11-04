import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { BibleImportInput, ImportResult } from '@shared/api';
import type { Db } from '../db/database';
import { decodeText } from '../song-import';
import { BOOK_CODES } from './books';
import { parseUsfm } from './usfm';
import { parseBibleXml } from './xml';

export const BIBLE_EXTENSIONS = ['usfm', 'sfm', 'txt', 'xml', 'xmm'];
const XML_EXTENSIONS = ['.xml', '.xmm'];

const CODE = /^[A-Za-z0-9-]{2,12}$/;
const MAX_NAME = 60;

type ParsedBook = { number: number; name: string; verses: { vid: number; text: string }[] };

// Las biblias con derechos no vienen con el programa: las carga el usuario, bajo su responsabilidad.
export class BibleImporter {
  constructor(private db: Db) {}

  private readUsfm(source: string): ParsedBook {
    const book = parseUsfm(source);
    const index = BOOK_CODES.indexOf(book.code.toUpperCase() as (typeof BOOK_CODES)[number]);
    if (index < 0) throw new Error(`el libro ${book.code || 'sin código'} no es de los 66 que maneja el programa`);
    if (!book.verses.length) throw new Error('no tiene versículos');
    const number = index + 1;
    const verses = book.verses
      .filter(({ text }) => text)
      .map(({ chapter, verse, text }) => ({ vid: number * 1_000_000 + chapter * 1_000 + verse, text }));
    return { number, name: book.name.trim() || book.code, verses };
  }

  // Si el archivo no trae los nombres, se usan los de la Biblia en español de fábrica.
  private bookName(number: number) {
    const row = this.db
      .prepare(
        `SELECT bk.name FROM bible_books bk JOIN bibles b ON b.id = bk.bible_id
         WHERE b.code = 'RV1909' AND bk.book_no = ?`,
      )
      .get(number) as { name: string } | undefined;
    return row?.name ?? BOOK_CODES[number - 1];
  }

  private async read(file: string, rejected: ImportResult['rejected']): Promise<ParsedBook[]> {
    const source = decodeText(await readFile(file));
    if (!XML_EXTENSIONS.includes(extname(file).toLowerCase())) return [this.readUsfm(source)];
    const { books, skipped } = parseBibleXml(source, (number) => this.bookName(number));
    if (skipped.length) {
      rejected.push({ name: basename(file), reason: `no entraron: ${skipped.join(', ')}` });
    }
    return books.map(({ number, name, verses }) => ({
      number,
      name,
      verses: verses.map(({ chapter, verse, text }) => ({ vid: number * 1_000_000 + chapter * 1_000 + verse, text })),
    }));
  }

  async import(files: string[], { code, name }: BibleImportInput): Promise<ImportResult> {
    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = String(name).trim().slice(0, MAX_NAME);
    if (!CODE.test(cleanCode)) throw new Error('La sigla va de 2 a 12 letras o números');
    if (!cleanName) throw new Error('Falta el nombre de la Biblia');
    if (this.db.prepare('SELECT 1 FROM bibles WHERE code = ?').get(cleanCode)) {
      throw new Error(`Ya hay una Biblia con la sigla ${cleanCode}`);
    }

    const books = new Map<number, ParsedBook>();
    const result: ImportResult = { added: 0, rejected: [] };
    for (const file of files) {
      try {
        for (const book of await this.read(file, result.rejected)) {
          if (books.has(book.number)) throw new Error(`${book.name} está repetido`);
          books.set(book.number, book);
        }
      } catch (error) {
        result.rejected.push({ name: basename(file), reason: (error as Error).message });
      }
    }
    if (!books.size) return result;

    this.db.transaction(() => {
      const { lastInsertRowid: bibleId } = this.db
        .prepare(
          `INSERT INTO bibles (code, name, language, versification, license_kind, imported_by_user)
           VALUES (?, ?, 'es', 'kjv', 'user_imported', 1)`,
        )
        .run(cleanCode, cleanName);
      const addBook = this.db.prepare('INSERT INTO bible_books (bible_id, book_no, name) VALUES (?, ?, ?)');
      const addVerse = this.db.prepare('INSERT OR REPLACE INTO verses (bible_id, vid, text) VALUES (?, ?, ?)');
      for (const { number, name: bookName, verses } of books.values()) {
        addBook.run(bibleId, number, bookName);
        for (const { vid, text } of verses) addVerse.run(bibleId, vid, text);
      }
    })();
    result.added = books.size;
    return result;
  }

  // Las de fábrica no se borran.
  remove(code: string) {
    this.db.prepare('DELETE FROM bibles WHERE code = ? AND imported_by_user = 1').run(String(code));
  }
}
