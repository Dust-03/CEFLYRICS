import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { BibleImportInput, ImportResult } from '@shared/api';
import type { Db } from '../db/database';
import { decodeText } from '../song-import';
import { BOOK_CODES } from './books';
import { parseUsfm } from './usfm';

export const BIBLE_EXTENSIONS = ['usfm', 'sfm', 'txt'];

const CODE = /^[A-Za-z0-9-]{2,12}$/;
const MAX_NAME = 60;

type ParsedBook = { number: number; name: string; verses: { vid: number; text: string }[] };

// Las biblias con derechos no vienen con el programa: las carga el usuario, bajo su responsabilidad.
export class BibleImporter {
  constructor(private db: Db) {}

  private async read(file: string): Promise<ParsedBook> {
    const book = parseUsfm(decodeText(await readFile(file)));
    const index = BOOK_CODES.indexOf(book.code.toUpperCase() as (typeof BOOK_CODES)[number]);
    if (index < 0) throw new Error(`el libro ${book.code || 'sin código'} no es de los 66 que maneja el programa`);
    if (!book.verses.length) throw new Error('no tiene versículos');
    const number = index + 1;
    const verses = book.verses
      .filter(({ text }) => text)
      .map(({ chapter, verse, text }) => ({ vid: number * 1_000_000 + chapter * 1_000 + verse, text }));
    return { number, name: book.name.trim() || book.code, verses };
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
        const book = await this.read(file);
        if (books.has(book.number)) throw new Error(`${book.name} está repetido`);
        books.set(book.number, book);
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
