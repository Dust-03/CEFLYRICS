// Lector de USFM: se queda con el texto que se proyecta y descarta notas, referencias y títulos.
// Es estricto a propósito: un marcador desconocido frena la lectura, porque lo que se escapa de
// acá termina en la pantalla de la iglesia.

export type UsfmVerse = { chapter: number; verse: number; text: string };
export type UsfmBook = { code: string; name: string; verses: UsfmVerse[] };

// Líneas que no se proyectan: encabezados, introducciones, títulos de sección y de salmo.
const SKIPPED_LINES = new Set([
  'id',
  'ide',
  'h',
  'toc1',
  'toc2',
  'toc3',
  'mt',
  'mt1',
  'mt2',
  'mt3',
  'imt1',
  'ip',
  'is1',
  'ili',
  'ms1',
  'mr',
  's1',
  's2',
  'r',
  'd',
  'sp',
  'qa',
  'cl',
  'rem',
]);

// Marcadores de párrafo: cortan la línea pero el versículo sigue.
const PARAGRAPHS = new Set(['p', 'm', 'b', 'nb', 'pc', 'pmo', 'pi1', 'mi', 'li1', 'li2', 'q', 'q1', 'q2', 'q3', 'qr']);

// Marcadores de carácter: se saca la marca y queda el texto. El de apertura se lleva un espacio;
// el de cierre no, porque ese espacio separa palabras.
const CHARACTER = new Set(['w', 'add', 'nd', 'wj', 'tl', 'bk', 'k', 'it', 'qs', 'wh']);
const OPENING = /\\\+?(?:add|nd|wj|tl|bk|k|it|qs|wh)\s/g;
const CLOSING = /\\\+?(?:add|nd|wj|tl|bk|k|it|qs|wh)\*/g;

function stripInline(text: string) {
  return text
    .replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g, '$1')
    .replace(OPENING, '')
    .replace(CLOSING, '')
    .replace(/¶\s*/g, '') // marca de párrafo de la KJV, dentro del texto
    .replace(/\s+/g, ' ')
    .trim();
}

// La RV1909 trae el título del salmo pegado al versículo 1, y el texto arranca en mayúsculas:
// "Salmo de David. JEHOVÁ es mi pastor". El título no se proyecta como parte del versículo.
const PSALM_TITLE = /^(.*?[a-záéíóúñ].*?[.:;?])\s+([¿¡]?(?:A\s)?[A-ZÁÉÍÓÚÑ]{2,}(?![a-záéíóúñ]).*)$/su;

export function stripPsalmTitle(text: string) {
  return PSALM_TITLE.exec(text)?.[2] ?? text;
}

export function parseUsfm(source: string): UsfmBook {
  // Notas al pie y referencias cruzadas pueden abarcar marcadores: se sacan primero.
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const text = withoutBom.replace(/\\f\s.*?\\f\*/gs, '').replace(/\\x\s.*?\\x\*/gs, '');

  let code = '';
  let name = '';
  let chapter = 0;
  let current: { chapter: number; verse: number; parts: string[] } | null = null;
  const verses: UsfmVerse[] = [];

  const flush = () => {
    if (!current) return;
    const verseText = stripInline(current.parts.join(' '));
    if (/[\\|]/.test(verseText)) {
      throw new Error(`${code} ${current.chapter}:${current.verse}: quedó un marcador sin procesar: ${verseText}`);
    }
    verses.push({ chapter: current.chapter, verse: current.verse, text: verseText });
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^\\([a-z]+[0-9]*)(?:\s+(.*))?$/s.exec(line);
    if (!match || CHARACTER.has(match[1])) {
      current?.parts.push(line);
      continue;
    }
    const [, marker, rest = ''] = match;
    if (marker === 'id') code = rest.slice(0, 3);
    if (marker === 'h') name = rest.trim();

    if (marker === 'c') {
      flush();
      chapter = Number(rest);
    } else if (marker === 'v') {
      flush();
      const verse = /^(\d+)(?:\s+(.*))?$/s.exec(rest);
      if (!verse) throw new Error(`${code} ${chapter}: versículo sin número simple: ${rest.slice(0, 40)}`);
      current = { chapter, verse: Number(verse[1]), parts: [verse[2] ?? ''] };
    } else if (PARAGRAPHS.has(marker)) {
      if (rest) current?.parts.push(rest);
    } else if (SKIPPED_LINES.has(marker)) {
      // Un título entre versículos no corta el versículo anterior, solo se ignora.
    } else {
      throw new Error(`${code} ${chapter}: marcador desconocido \\${marker}`);
    }
  }
  flush();
  return { code, name, verses };
}
