import logo from '../../../assets/logo-ceflirics.svg?raw';

// El logo son dos trazados: el círculo con la paloma y "cef", y la palabra "lirics". Acá se separan
// sus partes para animarlas una por una, sin guardar una segunda copia del dibujo.
const [mark, word] = [...logo.matchAll(/\sd="([^"]+)"/g)].map(([, path]) => path.split(/(?=M)/));

export const LOGO_PARTS = {
  ring: mark[0],
  dove: mark.slice(1, 6).join(''),
  cef: mark.slice(6).join(''),
  // l, i, r, i, c, s. Cada i lleva su punto, y la l el hueco del rulo.
  letters: [word[0] + word[1], word[2] + word[3], word[4], word[5] + word[6], word[7], word[8]],
};
