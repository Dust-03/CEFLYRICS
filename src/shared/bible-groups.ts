// Grupos de libros de la Biblia. `id` es también el sufijo de la variable de color en el tema.
export const BOOK_GROUPS = [
  { id: 'pentateuco', name: 'Pentateuco', from: 1, to: 5 },
  { id: 'historicos', name: 'Históricos', from: 6, to: 17 },
  { id: 'poeticos', name: 'Poéticos', from: 18, to: 22 },
  { id: 'mayores', name: 'Profetas mayores', from: 23, to: 27 },
  { id: 'menores', name: 'Profetas menores', from: 28, to: 39 },
  { id: 'evangelios', name: 'Evangelios y Hechos', from: 40, to: 44 },
  { id: 'paulinas', name: 'Cartas de Pablo', from: 45, to: 57 },
  { id: 'generales', name: 'Cartas generales y Apocalipsis', from: 58, to: 66 },
] as const;

export const TESTAMENTS = [
  { name: 'Antiguo Testamento', from: 1, to: 39 },
  { name: 'Nuevo Testamento', from: 40, to: 66 },
] as const;

export function bookGroup(book: number) {
  return BOOK_GROUPS.find((group) => book >= group.from && book <= group.to) ?? BOOK_GROUPS[0];
}

// Abreviaturas de la Biblia de la iglesia, en el orden de vid: "Gn", "1 S", "Flm".
// El espacio después del número es duro para que "1 S" no se corte en dos renglones.
const ABBREVIATIONS = (
  'Gn Éx Lv Nm Dt Jos Jue Rt 1_S 2_S 1_R 2_R 1_Cr 2_Cr Esd Neh Est Job Sal Pr Ec Cnt Is Jer Lm Ez Dn Os Jl Am ' +
  'Abd Jon Miq Nah Hab Sof Hag Zac Mal Mt Mc Lc Jn Hch Ro 1_Co 2_Co Gl Ef Fil Col 1_Ts 2_Ts 1_Ti 2_Ti Tit Flm Heb ' +
  'Stg 1_P 2_P 1_Jn 2_Jn 3_Jn Jud Ap'
)
  .split(' ')
  .map((abbreviation) => abbreviation.replace('_', ' '));

export function bookShortName(book: number) {
  return ABBREVIATIONS[book - 1] ?? '';
}
