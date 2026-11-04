import logo from '../../../assets/logo-ceflyrics.svg?raw';

// El logo es un trazado con el círculo, la paloma y "cef", y uno por cada letra de "lyrics". Acá se
// separan sus partes para animarlas una por una, sin guardar una segunda copia del dibujo.
const [mark, ...letters] = [...logo.matchAll(/\sd="([^"]+)"/g)].map(([, path]) => path);
const markParts = mark.split(/(?=M)/);

export const LOGO_PARTS = {
  ring: markParts[0],
  dove: markParts.slice(1, 6).join(''),
  cef: markParts.slice(6).join(''),
  // l, y, r, i, c, s.
  letters,
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
