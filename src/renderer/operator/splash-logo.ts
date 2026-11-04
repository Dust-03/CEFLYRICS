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

const SHOULDER = { x: 2290, y: 560 };
const WING_TIP = { x: 2130, y: 250 };
const WING_LENGTH = Math.hypot(WING_TIP.x - SHOULDER.x, WING_TIP.y - SHOULDER.y);
// De acá a la derecha está la cabeza, que no se mueve.
const HEAD_X = 2430;
const NECK_WIDTH = 130;

const smooth = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

// Cuánto acompaña cada punto al ala: nada en el hombro y la cabeza, todo en la punta.
function wingWeight(x: number, y: number) {
  const along =
    ((x - SHOULDER.x) * (WING_TIP.x - SHOULDER.x) + (y - SHOULDER.y) * (WING_TIP.y - SHOULDER.y)) / WING_LENGTH ** 2;
  return smooth(along) * smooth((HEAD_X - x) / NECK_WIDTH);
}

// La paloma con el ala doblada esos grados. Se dobla el dibujo en vez de cortarlo, así no se abren
// huecos, y como los comandos del trazado no cambian, el navegador puede pasar de una pose a otra.
export function dovePose(degrees: number) {
  return LOGO_PARTS.dove.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_match, rawX: string, rawY: string) => {
    const x = Number(rawX);
    const y = Number(rawY);
    const angle = (degrees * wingWeight(x, y) * Math.PI) / 180;
    const dx = x - SHOULDER.x;
    const dy = y - SHOULDER.y;
    const bentX = SHOULDER.x + dx * Math.cos(angle) - dy * Math.sin(angle);
    const bentY = SHOULDER.y + dx * Math.sin(angle) + dy * Math.cos(angle);
    return `${Math.round(bentX * 10) / 10} ${Math.round(bentY * 10) / 10}`;
  });
}
