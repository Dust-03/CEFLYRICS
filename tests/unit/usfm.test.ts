import { expect, test } from 'vitest';
import { bookNumber } from '../../src/main/bible/books';
import { parseUsfm, stripPsalmTitle } from '../../src/main/bible/usfm';

const book = (body: string) => `\\id JHN Título\n\\h Juan\n\\toc1 Juan\n\\mt1 Juan\n${body}`;

test('saca código, nombre y texto limpio de las palabras marcadas', () => {
  const result = parseUsfm(
    book(
      '\\c 3\n\\p\n\\v 16 \\w Porque|strong="G1063"\\w* \\w de tal manera|strong="G3779"\\w* \\w amó|strong="G25,G3739"\\w* Dios.',
    ),
  );
  expect(result.code).toBe('JHN');
  expect(result.name).toBe('Juan');
  expect(result.verses).toEqual([{ chapter: 3, verse: 16, text: 'Porque de tal manera amó Dios.' }]);
});

test('descarta notas al pie y referencias cruzadas, aunque tengan marcadores adentro', () => {
  const { verses } = parseUsfm(
    book('\\c 1\n\\p\n\\v 1 Texto\\f + \\fr 1:1 \\ft Nota \\+w al|strong="H1"\\+w* pie\\f* sigue\\x - \\xo 1:1 \\xt Gen 1:1\\x* fin.'),
  );
  expect(verses[0].text).toBe('Texto sigue fin.');
});

test('conserva el texto de los marcadores de carácter', () => {
  const { verses } = parseUsfm(
    book('\\c 1\n\\p\n\\v 1 \\wj \\+w Yo|strong="G1"\\+w* soy\\wj* \\add el\\add* \\nd Señor\\nd*.'),
  );
  expect(verses[0].text).toBe('Yo soy el Señor.');
});

test('un versículo sigue en varias líneas poéticas', () => {
  const { verses } = parseUsfm(book('\\c 1\n\\q1\n\\v 1 Primera línea\n\\q2 segunda línea\n\\b\n\\qs Selah.\\qs*\n\\v 2 Otra'));
  expect(verses).toEqual([
    { chapter: 1, verse: 1, text: 'Primera línea segunda línea Selah.' },
    { chapter: 1, verse: 2, text: 'Otra' },
  ]);
});

test('los títulos de sección y de salmo no entran al texto', () => {
  const { verses } = parseUsfm(
    book('\\c 3\n\\s1 Título de sección\n\\r (2 Samuel 15)\n\\d Salmo de David\n\\q1\n\\v 1 Oh Jehová\n\\s1 Otro título\n\\q1\n\\v 2 Muchos'),
  );
  expect(verses.map((v) => v.text)).toEqual(['Oh Jehová', 'Muchos']);
});

test('un marcador desconocido frena en vez de colarse en la pantalla', () => {
  expect(() => parseUsfm(book('\\c 1\n\\p\n\\v 1 Texto\n\\zzz raro'))).toThrow(/marcador desconocido/);
  expect(() => parseUsfm(book('\\c 1\n\\p\n\\v 1 Texto \\nuevo raro\\nuevo*'))).toThrow(/sin procesar/);
});

test('los rangos de versículos frenan', () => {
  expect(() => parseUsfm(book('\\c 1\n\\p\n\\v 1-2 Texto'))).toThrow();
});

test('saca la marca de párrafo de la KJV', () => {
  const { verses } = parseUsfm(book('\\c 3\n\\p\n\\v 16 ¶ For God so loved'));
  expect(verses[0].text).toBe('For God so loved');
});

test('separa el título del salmo sin tocar el texto que no lo tiene', () => {
  expect(stripPsalmTitle('Salmo de David. JEHOVÁ es mi pastor; nada me faltará.')).toBe(
    'JEHOVÁ es mi pastor; nada me faltará.',
  );
  expect(stripPsalmTitle('Salmo de David. A TI, oh Jehová, levantaré mi alma.')).toBe(
    'A TI, oh Jehová, levantaré mi alma.',
  );
  expect(stripPsalmTitle('Salmo de David, cuando huía de Absalom. ¡OH Jehová, cuánto!')).toBe('¡OH Jehová, cuánto!');
  for (const text of ['ALELUYA. Alabad á Jehová, porque es bueno', 'BENDICE, alma mía, á Jehová. Jehová, Dios mío']) {
    expect(stripPsalmTitle(text)).toBe(text);
  }
});

test('numera los libros en el orden protestante', () => {
  expect(bookNumber('GEN')).toBe(1);
  expect(bookNumber('MAL')).toBe(39);
  expect(bookNumber('MAT')).toBe(40);
  expect(bookNumber('JHN')).toBe(43);
  expect(bookNumber('REV')).toBe(66);
  expect(bookNumber('TOB')).toBeNull();
});
