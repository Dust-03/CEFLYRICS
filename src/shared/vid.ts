// Identificador de versículo: un entero BBCCCVVV (libro, capítulo, versículo).
// Juan 3:16 es 43003016. Ordenar por vid ordena la Biblia.

export type VerseRef = { book: number; chapter: number; verse: number };

export function makeVid({ book, chapter, verse }: VerseRef) {
  return book * 1_000_000 + chapter * 1_000 + verse;
}

export function parseVid(vid: number): VerseRef {
  return {
    book: Math.floor(vid / 1_000_000),
    chapter: Math.floor((vid % 1_000_000) / 1_000),
    verse: vid % 1_000,
  };
}
