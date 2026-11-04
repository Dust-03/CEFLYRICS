import { bookName } from './reference';

// Grupos de libros de la Biblia. `id` es también el sufijo de la variable de color en el tema.
export const BOOK_GROUPS = [
  { id: 'pentateuco', name: 'Pentateuco', from: 1, to: 5 },
  { id: 'historicos', name: 'Históricos', from: 6, to: 17 },
  { id: 'poeticos', name: 'Poéticos', from: 18, to: 22 },
  { id: 'mayores', name: 'Profetas mayores', from: 23, to: 27 },
  { id: 'menores', name: 'Profetas menores', from: 28, to: 39 },
  { id: 'evangelios', name: 'Evangelios', from: 40, to: 43 },
  { id: 'hechos', name: 'Hechos', from: 44, to: 44 },
  { id: 'paulinas', name: 'Cartas de Pablo', from: 45, to: 57 },
  { id: 'generales', name: 'Cartas generales', from: 58, to: 65 },
  { id: 'apocalipsis', name: 'Apocalipsis', from: 66, to: 66 },
] as const;

// Etiqueta corta para el botón del libro: "Gén", "1 Sam", "Flm".
export function bookShortName(book: number) {
  if (book === 57) return 'Flm'; // Filipenses y Filemón empiezan igual
  const name = bookName(book);
  const numbered = /^(\d) (.+)$/.exec(name);
  return numbered ? `${numbered[1]} ${numbered[2].slice(0, 3)}` : name.slice(0, 3);
}
