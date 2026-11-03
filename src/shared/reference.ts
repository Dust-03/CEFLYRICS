// Intérprete de citas bíblicas en español: "jn 3 16", "Juan 3:16", "1 Co 13:4-7", "primera de Juan 1".
// Corre igual en la consola y en los clientes de la LAN: no depende de la base.
import { makeVid } from './vid';

export type Reference = {
  book: number;
  chapter?: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
};

// Nombre y abreviaturas de cada libro, en el orden de vid. Las claves van sin acentos ni espacios.
const BOOKS: [name: string, abbreviations: string[]][] = [
  ['Génesis', ['gn', 'gen', 'ge']],
  ['Éxodo', ['ex', 'exo', 'exod']],
  ['Levítico', ['lv', 'lev']],
  ['Números', ['nm', 'nu', 'num']],
  ['Deuteronomio', ['dt', 'deu', 'deut']],
  ['Josué', ['jos']],
  ['Jueces', ['jue', 'jc', 'juec']],
  ['Rut', ['rt', 'rut']],
  ['1 Samuel', ['1s', '1sa', '1sam']],
  ['2 Samuel', ['2s', '2sa', '2sam']],
  ['1 Reyes', ['1r', '1re', '1rey']],
  ['2 Reyes', ['2r', '2re', '2rey']],
  ['1 Crónicas', ['1cr', '1cro', '1cron']],
  ['2 Crónicas', ['2cr', '2cro', '2cron']],
  ['Esdras', ['esd']],
  ['Nehemías', ['neh', 'ne']],
  ['Ester', ['est']],
  ['Job', ['jb', 'job']],
  ['Salmos', ['sal', 'sl', 'ps', 'salmo']],
  ['Proverbios', ['pr', 'pro', 'prov']],
  ['Eclesiastés', ['ec', 'ecl', 'ecle']],
  ['Cantares', ['cnt', 'cant', 'ct', 'cantar', 'cantardeloscantares']],
  ['Isaías', ['is', 'isa']],
  ['Jeremías', ['jer', 'jr']],
  ['Lamentaciones', ['lm', 'lam']],
  ['Ezequiel', ['ez', 'eze', 'ezeq']],
  ['Daniel', ['dn', 'dan']],
  ['Oseas', ['os', 'ose']],
  ['Joel', ['jl', 'joe']],
  ['Amós', ['am', 'amo']],
  ['Abdías', ['abd', 'ab']],
  ['Jonás', ['jon']],
  ['Miqueas', ['mi', 'miq']],
  ['Nahúm', ['nah', 'na']],
  ['Habacuc', ['hab', 'ha']],
  ['Sofonías', ['sof']],
  ['Hageo', ['hag']],
  ['Zacarías', ['zac', 'za']],
  ['Malaquías', ['mal', 'ml']],
  ['Mateo', ['mt', 'mat']],
  ['Marcos', ['mc', 'mr', 'mar']],
  ['Lucas', ['lc', 'luc']],
  ['Juan', ['jn', 'ju']],
  ['Hechos', ['hch', 'hec', 'hech']],
  ['Romanos', ['ro', 'rm', 'rom']],
  ['1 Corintios', ['1co', '1cor']],
  ['2 Corintios', ['2co', '2cor']],
  ['Gálatas', ['ga', 'gal', 'gl']],
  ['Efesios', ['ef', 'efe']],
  ['Filipenses', ['fil', 'flp']],
  ['Colosenses', ['col']],
  ['1 Tesalonicenses', ['1ts', '1te', '1tes']],
  ['2 Tesalonicenses', ['2ts', '2te', '2tes']],
  ['1 Timoteo', ['1ti', '1tm', '1tim']],
  ['2 Timoteo', ['2ti', '2tm', '2tim']],
  ['Tito', ['tit', 'tt']],
  ['Filemón', ['flm', 'file']],
  ['Hebreos', ['heb', 'hb']],
  ['Santiago', ['stg', 'sant', 'sgo']],
  ['1 Pedro', ['1p', '1pe', '1ped']],
  ['2 Pedro', ['2p', '2pe', '2ped']],
  ['1 Juan', ['1jn', '1ju']],
  ['2 Juan', ['2jn', '2ju']],
  ['3 Juan', ['3jn', '3ju']],
  ['Judas', ['jud', 'jds']],
  ['Apocalipsis', ['ap', 'apo', 'apoc', 'rev']],
];

// Libros de un solo capítulo: "Judas 3" es el versículo 3.
const SINGLE_CHAPTER = new Set([31, 57, 63, 64, 65]);

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const compact = (text: string) => fold(text).replace(/\s+/g, '');

const exactKeys = new Map<string, number>();
const prefixKeys: [key: string, book: number][] = [];
BOOKS.forEach(([name, abbreviations], index) => {
  const book = index + 1;
  for (const key of [compact(name), ...abbreviations]) {
    const owner = exactKeys.get(key);
    if (owner && owner !== book) throw new Error(`La abreviatura "${key}" está en dos libros`);
    exactKeys.set(key, book);
    prefixKeys.push([key, book]);
  }
});

export function bookName(book: number) {
  return BOOKS[book - 1]?.[0] ?? '';
}

// Una abreviatura conocida gana; si no, sirve cualquier comienzo de nombre que no sea ambiguo.
function resolveBook(text: string) {
  const key = compact(text);
  if (!key) return null;
  const exact = exactKeys.get(key);
  if (exact) return exact;
  const matches = new Set(prefixKeys.filter(([candidate]) => candidate.startsWith(key)).map(([, book]) => book));
  return matches.size === 1 ? [...matches][0] : null;
}

const ORDINALS: [RegExp, string][] = [
  [/^(?:primera|primer|primero|1ra|1era|1er|1a|i)\s+(?:de\s+|carta\s+(?:de\s+)?(?:san\s+)?)?/, '1 '],
  [/^(?:segunda|segundo|2da|2a|ii)\s+(?:de\s+|carta\s+(?:de\s+)?(?:san\s+)?)?/, '2 '],
  [/^(?:tercera|tercero|3ra|3era|3a|iii)\s+(?:de\s+|carta\s+(?:de\s+)?(?:san\s+)?)?/, '3 '],
  [/^([123])\s+de\s+/, '$1 '],
];

function normalize(input: string) {
  let text = fold(input)
    .replace(/[–—]/g, '-')
    .replace(/(?<=[a-z])\./g, ' ') // "1 Co." pero no "3.16"
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:evangelio\s+(?:segun|de)\s+)?(?:san|s)\s+(?=[a-z])/, '')
    .replace(/^evangelio\s+(?:segun|de)\s+/, '');
  for (const [pattern, replacement] of ORDINALS) text = text.replace(pattern, replacement);
  return text.replace(/\s+(?:al|a)\s+(?=\d)/, '-');
}

function parsePlace(text: string, singleChapter: boolean): Omit<Reference, 'book'> | null {
  // capítulo, o capítulo y versículo con ":", ",", "." o espacio, y un posible final de rango.
  const match = /^(\d+)(?:\s*[:,.\s]\s*(\d+))?(?:\s*-\s*(\d+)(?:\s*[:,.]\s*(\d+))?)?$/.exec(text);
  if (!match) return null;
  const [first, second, third, fourth] = match.slice(1).map((n) => (n === undefined ? undefined : Number(n)));

  const place: Omit<Reference, 'book'> = {};
  if (singleChapter && second === undefined) {
    place.chapter = 1;
    place.verse = first;
    if (third !== undefined) place.endVerse = third;
  } else {
    place.chapter = first;
    if (second !== undefined) place.verse = second;
    if (fourth !== undefined) {
      place.endChapter = third;
      place.endVerse = fourth;
    } else if (third !== undefined) {
      if (second !== undefined) place.endVerse = third;
      else place.endChapter = third;
    }
  }
  return isValid(place) ? place : null;
}

function isValid({ chapter = 1, verse = 1, endChapter, endVerse }: Omit<Reference, 'book'>) {
  if (chapter < 1 || verse < 1) return false;
  if (endChapter !== undefined && endChapter < chapter) return false;
  if (endVerse !== undefined && (endChapter ?? chapter) === chapter && endVerse < verse) return false;
  return true;
}

export function parseReference(input: string): Reference | null {
  const text = normalize(input);
  // El libro puede empezar con número ("1 co") y tener varias palabras ("cantar de los cantares").
  const match = /^([123]\s*)?([a-zñ]+(?:\s+[a-zñ]+)*)\s*(\d.*)?$/.exec(text);
  if (!match) return null;
  const book = resolveBook(`${match[1] ?? ''}${match[2]}`);
  if (!book) return null;
  if (!match[3]) return { book };
  const place = parsePlace(match[3].trim(), SINGLE_CHAPTER.has(book));
  return place ? { book, ...place } : null;
}

// Rango de vid para buscar en la base. Sin versículo final se llega al fin del capítulo.
export function referenceRange({ book, chapter, verse, endChapter, endVerse }: Reference) {
  if (chapter === undefined) {
    return { from: makeVid({ book, chapter: 1, verse: 1 }), to: makeVid({ book, chapter: 999, verse: 999 }) };
  }
  const lastVerse = endVerse ?? (endChapter === undefined ? (verse ?? 999) : 999);
  return {
    from: makeVid({ book, chapter, verse: verse ?? 1 }),
    to: makeVid({ book, chapter: endChapter ?? chapter, verse: lastVerse }),
  };
}

export function formatReference({ book, chapter, verse, endChapter, endVerse }: Reference) {
  const name = bookName(book);
  if (chapter === undefined) return name;
  let text = `${name} ${chapter}`;
  if (verse !== undefined) text += `:${verse}`;
  if (endChapter !== undefined && endChapter !== chapter) {
    text += `-${endChapter}`;
    if (endVerse !== undefined) text += `:${endVerse}`;
  } else if (endVerse !== undefined) {
    text += `-${endVerse}`;
  }
  return text;
}
