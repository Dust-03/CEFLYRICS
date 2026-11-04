// Biblias en XML. Hay varios formatos en uso y la extensión no dice cuál es, así que se mira el
// contenido: Zefania (XMLBIBLE), OSIS, Beblia (book, chapter, verse) y OpenSong (b, c, v).
import { decodeXml } from '../song-import';
import { BOOK_CODES } from './books';

export type XmlVerse = { chapter: number; verse: number; text: string };
export type XmlBook = { number: number; name: string; verses: XmlVerse[] };
export type XmlBible = { books: XmlBook[]; skipped: string[] };

const OSIS_BOOKS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr',
  'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel',
  'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John',
  'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm',
  'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]; // prettier-ignore

type Shape = {
  book: string;
  chapter: string;
  verse: string;
  bookNumber?: string;
  bookName: string;
  chapterNumber: string;
  verseNumber: string;
};

const SHAPES: Shape[] = [
  {
    book: 'BIBLEBOOK',
    chapter: 'CHAPTER',
    verse: 'VERS',
    bookNumber: 'bnumber',
    bookName: 'bname',
    chapterNumber: 'cnumber',
    verseNumber: 'vnumber',
  },
  {
    book: 'book',
    chapter: 'chapter',
    verse: 'verse',
    bookNumber: 'number',
    bookName: 'name',
    chapterNumber: 'number',
    verseNumber: 'number',
  },
  { book: 'b', chapter: 'c', verse: 'v', bookName: 'n', chapterNumber: 'n', verseNumber: 'n' },
];

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
}

function* elements(xml: string, tag: string) {
  for (const [, attributes, body] of xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi'))) {
    yield { attributes, body };
  }
}

// Las notas no se proyectan; las marcas de estilo se sacan y queda su texto.
function cleanVerse(xml: string) {
  const text = xml
    .replace(/<(note|title|rdg|reference)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  return decodeXml(text).replace(/\s+/g, ' ').trim();
}

function parseShape(xml: string, shape: Shape, nameOf: (number: number) => string): XmlBible {
  const found = [...elements(xml, shape.book)];
  const books: XmlBook[] = [];
  const skipped: string[] = [];
  found.forEach(({ attributes, body }, index) => {
    const declared = shape.bookNumber ? Number(attribute(attributes, shape.bookNumber)) : NaN;
    // Sin número, lo único que ordena los libros es su posición, y eso vale solo con los 66.
    const number = Number.isInteger(declared) ? declared : found.length === BOOK_CODES.length ? index + 1 : NaN;
    const name = attribute(attributes, shape.bookName)?.trim();
    if (!(number >= 1 && number <= BOOK_CODES.length)) {
      skipped.push(name || `libro ${index + 1}`);
      return;
    }
    const verses: XmlVerse[] = [];
    for (const chapter of elements(body, shape.chapter)) {
      const chapterNumber = parseInt(attribute(chapter.attributes, shape.chapterNumber) ?? '', 10);
      for (const verse of elements(chapter.body, shape.verse)) {
        const verseNumber = parseInt(attribute(verse.attributes, shape.verseNumber) ?? '', 10);
        const text = cleanVerse(verse.body);
        if (chapterNumber > 0 && verseNumber > 0 && text) {
          verses.push({ chapter: chapterNumber, verse: verseNumber, text });
        }
      }
    }
    if (verses.length) books.push({ number, name: decodeXml(name || nameOf(number)), verses });
  });
  return { books, skipped };
}

function parseOsis(xml: string, nameOf: (number: number) => string): XmlBible {
  const byBook = new Map<number, XmlBook>();
  const skipped = new Set<string>();
  // Un versículo puede ser un elemento o dos marcas sueltas: en los dos casos, va hasta la marca siguiente.
  const opening = /<verse\b[^>]*\bosisID\s*=\s*["']([^.\s"']+)\.(\d+)\.(\d+)[^"']*["'][^>]*>/gi;
  for (const match of xml.matchAll(opening)) {
    const [tag, code, chapter, verse] = match;
    if (tag.endsWith('/>') && !/\bsID\s*=/i.test(tag)) continue;
    const index = OSIS_BOOKS.indexOf(code);
    if (index < 0) {
      skipped.add(code);
      continue;
    }
    const start = match.index + tag.length;
    const next = xml.slice(start).search(/<verse\b|<\/verse>/i);
    const text = cleanVerse(xml.slice(start, next < 0 ? undefined : start + next));
    if (!text) continue;
    const number = index + 1;
    const book = byBook.get(number) ?? { number, name: nameOf(number), verses: [] };
    book.verses.push({ chapter: Number(chapter), verse: Number(verse), text });
    byBook.set(number, book);
  }
  return { books: [...byBook.values()], skipped: [...skipped] };
}

export function parseBibleXml(xml: string, nameOf: (number: number) => string): XmlBible {
  if (!xml.trimStart().startsWith('<')) throw new Error('no es un archivo XML');
  if (/<osis\b/i.test(xml)) return parseOsis(xml, nameOf);
  for (const shape of SHAPES) {
    const result = parseShape(xml, shape, nameOf);
    if (result.books.length) return result;
  }
  throw new Error('no se reconoce este formato de Biblia');
}
