// Estilos de lo proyectado: fuente, colores y fondo. Viajan con cada diapositiva.

export type Background = { kind: 'css'; value: string } | { kind: 'image' | 'video'; url: string; thumb?: string };

export type Theme = {
  font: string;
  color: string;
  outlineColor: string | null;
  titleColor: string;
  scale: number;
  uppercase: boolean;
  shadow: boolean;
  background: Background;
  // Grosor de la letra: 400 normal, 600 seminegrita, 700 negrita.
  weight: number;
  italic: boolean;
  lineHeight: number;
  // Grosor del contorno, en fracción del tamaño de la letra.
  outlineWidth: number;
  // Margen libre en cada borde, en fracción de la pantalla: 0,05 deja un 5 % en cualquier tamaño.
  margin: number;
};

export type ThemeEntry = { id: string; name: string; theme: Theme; factory: boolean };

// Fuentes libres (OFL) incluidas en el programa: se ven igual en cualquier equipo.
export const FONTS = [
  { id: 'system', name: 'Del sistema', css: "system-ui, 'Segoe UI', sans-serif" },
  { id: 'inter', name: 'Inter', css: "'Inter', sans-serif" },
  { id: 'montserrat', name: 'Montserrat', css: "'Montserrat', sans-serif" },
  { id: 'oswald', name: 'Oswald', css: "'Oswald', sans-serif" },
  { id: 'lora', name: 'Lora', css: "'Lora', serif" },
  { id: 'playfair', name: 'Playfair Display', css: "'Playfair Display', serif" },
  { id: 'merriweather', name: 'Merriweather', css: "'Merriweather', serif" },
] as const;

export function fontCss(id: string) {
  return (FONTS.filter((font) => font.id === id)[0] ?? FONTS[0]).css;
}

export const WEIGHTS = [
  { value: 400, name: 'Normal' },
  { value: 600, name: 'Seminegrita' },
  { value: 700, name: 'Negrita' },
] as const;

export const BACKGROUNDS = [
  { name: 'Noche', value: 'radial-gradient(circle at 50% 40%, #1b2440, #05070d 75%)' },
  { name: 'Amanecer', value: 'linear-gradient(160deg, #2b1b4d, #a2415f 60%, #f0a04b)' },
  { name: 'Bosque', value: 'linear-gradient(160deg, #0d2a22, #16543f 70%, #2f7d5b)' },
  { name: 'Mar', value: 'linear-gradient(160deg, #06263f, #0d5c7a 70%, #2aa3a8)' },
  { name: 'Vino', value: 'linear-gradient(160deg, #24060f, #5e1230 70%, #8e2547)' },
  { name: 'Negro', value: '#000000' },
  { name: 'Blanco', value: '#f6f4ef' },
] as const;

export const DEFAULT_THEME: Theme = {
  font: 'system',
  color: '#ffffff',
  outlineColor: null,
  titleColor: '#f2b544',
  scale: 1,
  uppercase: false,
  shadow: true,
  background: { kind: 'css', value: BACKGROUNDS[0].value },
  weight: 600,
  italic: false,
  lineHeight: 1.25,
  outlineWidth: 0.045,
  margin: 0.05,
};

const style = (name: string, font: string, background: number, extra: Partial<Theme> = {}): ThemeEntry => ({
  id: `fabrica-${name.toLowerCase()}`,
  name,
  factory: true,
  theme: { ...DEFAULT_THEME, font, background: { kind: 'css', value: BACKGROUNDS[background].value }, ...extra },
});

export const FACTORY_THEMES: ThemeEntry[] = [
  style('Noche', 'system', 0),
  style('Amanecer', 'montserrat', 1, { titleColor: '#ffe3b0' }),
  style('Bosque', 'lora', 2, { titleColor: '#bfe8c9' }),
  style('Mar', 'inter', 3, { titleColor: '#bdeef0' }),
  style('Vino', 'playfair', 4, { titleColor: '#f2c6d3' }),
  style('Negro', 'oswald', 5, { uppercase: true, titleColor: '#cccccc' }),
  style('Claro', 'merriweather', 6, { color: '#1c2433', titleColor: '#8a5a12', shadow: false, weight: 700 }),
];

const HEX = /^#[0-9a-f]{6}$/i;

// Un número dentro del rango, o el de fábrica si no vino (estilos guardados antes de la 1.4.0).
function number(input: unknown, min: number, max: number, fallback: number) {
  return typeof input === 'number' && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback;
}

function parseBackground(input: unknown): Background | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kind, value, url, thumb } = input as Record<string, unknown>;
  if (kind === 'css' && typeof value === 'string' && value.length <= 300 && !/url\s*\(/i.test(value)) {
    return { kind, value };
  }
  if ((kind === 'image' || kind === 'video') && typeof url === 'string' && url.startsWith('cef-media://')) {
    const hasThumb = typeof thumb === 'string' && thumb.startsWith('cef-media://');
    return { kind, url: url.slice(0, 200), ...(hasThumb ? { thumb: thumb.slice(0, 200) } : {}) };
  }
  return null;
}

// Lo que llega por IPC no se da por bueno.
export function parseTheme(input: unknown): Theme | null {
  if (typeof input !== 'object' || input === null) return null;
  const { font, color, outlineColor, titleColor, scale, uppercase, shadow, background } = input as Record<
    string,
    unknown
  >;
  const { weight, italic, lineHeight, outlineWidth, margin } = input as Record<string, unknown>;
  const parsedBackground = parseBackground(background);
  if (!parsedBackground || typeof font !== 'string' || !FONTS.some((item) => item.id === font)) return null;
  if (typeof color !== 'string' || !HEX.test(color) || typeof titleColor !== 'string' || !HEX.test(titleColor)) {
    return null;
  }
  if (
    outlineColor !== undefined &&
    outlineColor !== null &&
    (typeof outlineColor !== 'string' || !HEX.test(outlineColor))
  ) {
    return null;
  }
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return null;
  return {
    font,
    color,
    outlineColor: typeof outlineColor === 'string' ? outlineColor : null,
    titleColor,
    scale: Math.min(2, Math.max(0.5, scale)),
    uppercase: !!uppercase,
    shadow: !!shadow,
    background: parsedBackground,
    weight: WEIGHTS.find((item) => item.value === weight)?.value ?? DEFAULT_THEME.weight,
    italic: italic === true,
    lineHeight: number(lineHeight, 0.9, 2, DEFAULT_THEME.lineHeight),
    outlineWidth: number(outlineWidth, 0.01, 0.15, DEFAULT_THEME.outlineWidth),
    margin: number(margin, 0, 0.2, DEFAULT_THEME.margin),
  };
}
