// Arma resources/bibles.db, la base de fábrica con las biblias de dominio público.
// Baja cada USFM de eBible.org, verifica su hash y frena si algo no da lo esperado.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookNumber } from '../src/main/bible/books';
import { parseUsfm, stripPsalmTitle } from '../src/main/bible/usfm';
import { openDatabase } from '../src/main/db/database';
import { makeVid } from '../src/shared/vid';

type Source = {
  code: string;
  name: string;
  language: string;
  ebible: string;
  sha256: string;
  versification: string;
  verses: number;
  psalmTitlesInText?: boolean;
};

// La cantidad de versículos es la medida, no un número de referencia: si cambia, hay que revisar.
const SOURCES: Source[] = [
  {
    code: 'RV1909',
    name: 'Reina-Valera 1909',
    language: 'es',
    ebible: 'spaRV1909',
    sha256: '56937c2be9ad278aed91370d6a15a98fe976f275d0cbaa6e26910291d949c7a5',
    versification: 'rv1909',
    verses: 31084,
    psalmTitlesInText: true,
  },
  {
    code: 'KJV',
    name: 'King James Version',
    language: 'en',
    ebible: 'eng-kjv',
    sha256: '206085ace5494f7eb46975990c0734fd8354e5ecce4d12cc74ce6f1aa8efd129',
    versification: 'kjv',
    verses: 31102,
  },
  {
    code: 'WEB',
    name: 'World English Bible',
    language: 'en',
    ebible: 'engwebu',
    sha256: '6408bba4ee3428d94472092069a7222680abf2382c6f93ee15cec0f0f4cc06fb',
    versification: 'web',
    verses: 31098,
  },
  {
    code: 'BSB',
    name: 'Berean Standard Bible',
    language: 'en',
    ebible: 'engbsb',
    sha256: '75ca91d5a5c69ca4cbdeabdb03ea1a458db20cf3966abe15d86df086acf7fbc4',
    versification: 'kjv',
    verses: 31086,
  },
];

// La WEB lleva el final de Romanos al capítulo 14.
const VERSIFICATION_MAP = [14024, 14025, 14026].map((chapterVerse, i) => ({
  from: 45_000_000 + chapterVerse,
  to: makeVid({ book: 45, chapter: 16, verse: 25 + i }),
}));

const CACHE = 'data/usfm';
const OUTPUT = 'resources/bibles.db';

async function fetchSource(source: Source) {
  const zip = join(CACHE, `${source.ebible}.zip`);
  const folder = join(CACHE, source.ebible);
  mkdirSync(folder, { recursive: true });
  if (!existsSync(zip)) {
    const response = await fetch(`https://ebible.org/Scriptures/${source.ebible}_usfm.zip`);
    if (!response.ok) throw new Error(`${source.ebible}: HTTP ${response.status}`);
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  }
  const hash = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (hash !== source.sha256) throw new Error(`${source.ebible}: el archivo cambió (${hash}). Hay que revisarlo.`);
  // En Windows, el tar del sistema es el que abre zip.
  const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
  execFileSync(tar, ['-xf', zip, '-C', folder]);
  return folder;
}

function readBooks(folder: string, source: Source) {
  const books = [];
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.usfm'))) {
    const usfm = readFileSync(join(folder, file), 'utf8');
    const bookNo = bookNumber(/\\id (\S{3})/.exec(usfm)?.[1] ?? '');
    if (!bookNo) continue; // deuterocanónicos y páginas de presentación
    const book = parseUsfm(usfm);
    const verses = book.verses
      .filter((verse) => verse.text) // números sin texto: 18 en la RV1909 y 5 en la WEB
      .map((verse) => {
        const isFirstOfPsalm = book.code === 'PSA' && verse.verse === 1;
        const text = source.psalmTitlesInText && isFirstOfPsalm ? stripPsalmTitle(verse.text) : verse.text;
        return { vid: makeVid({ book: bookNo, chapter: verse.chapter, verse: verse.verse }), text };
      });
    books.push({ bookNo, name: book.name, verses });
  }
  return books.sort((a, b) => a.bookNo - b.bookNo);
}

mkdirSync('resources', { recursive: true });
rmSync(OUTPUT, { force: true });
const db = openDatabase(OUTPUT);

for (const source of SOURCES) {
  const books = readBooks(await fetchSource(source), source);
  const count = books.reduce((total, book) => total + book.verses.length, 0);
  if (books.length !== 66) throw new Error(`${source.code}: ${books.length} libros en vez de 66`);
  if (count !== source.verses) throw new Error(`${source.code}: ${count} versículos en vez de ${source.verses}`);

  db.transaction(() => {
    const { lastInsertRowid: bibleId } = db
      .prepare(
        `INSERT INTO bibles (code, name, language, versification, license_kind, source)
         VALUES (?, ?, ?, ?, 'public_domain', ?)`,
      )
      .run(source.code, source.name, source.language, source.versification, `eBible.org: ${source.ebible}`);
    const addBook = db.prepare('INSERT INTO bible_books (bible_id, book_no, name) VALUES (?, ?, ?)');
    const addVerse = db.prepare('INSERT INTO verses (bible_id, vid, text) VALUES (?, ?, ?)');
    for (const book of books) {
      addBook.run(bibleId, book.bookNo, book.name);
      for (const verse of book.verses) addVerse.run(bibleId, verse.vid, verse.text);
    }
  })();
  console.log(`${source.code}: ${count} versículos`);
}

const addMapping = db.prepare(
  `INSERT INTO versification_map (from_scheme, from_vid, to_scheme, to_vid) VALUES ('web', ?, 'kjv', ?)`,
);
for (const { from, to } of VERSIFICATION_MAP) addMapping.run(from, to);

db.exec(`INSERT INTO verses_fts (verses_fts) VALUES ('optimize')`);
db.pragma('journal_mode = DELETE');
db.exec('VACUUM');
db.close();
console.log(`Listo: ${OUTPUT}`);
