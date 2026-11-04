// Estilos de lo proyectado: fuente, colores y fondo. Viajan con cada diapositiva.

export type Background = { kind: 'css'; value: string } | { kind: 'image' | 'video'; url: string };

export type Theme = {
  font: string;
  color: string;
  titleColor: string;
  scale: number;
  uppercase: boolean;
  shadow: boolean;
  background: Background;
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
  return (FONTS.find((font) => font.id === id) ?? FONTS[0]).css;
}

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
  titleColor: '#f2b544',
  scale: 1,
  uppercase: false,
  shadow: true,
  background: { kind: 'css', value: BACKGROUNDS[0].value },
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
  style('Claro', 'merriweather', 6, { color: '#1c2433', titleColor: '#8a5a12', shadow: false }),
];

const HEX = /^#[0-9a-f]{6}$/i;

function parseBackground(input: unknown): Background | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kind, value, url } = input as Record<string, unknown>;
  if (kind === 'css' && typeof value === 'string' && value.length <= 300 && !/url\s*\(/i.test(value)) {
    return { kind, value };
  }
  if ((kind === 'image' || kind === 'video') && typeof url === 'string' && url.startsWith('cef-media://')) {
    return { kind, url: url.slice(0, 200) };
  }
  return null;
}

// Lo que llega por IPC no se da por bueno.
export function parseTheme(input: unknown): Theme | null {
  if (typeof input !== 'object' || input === null) return null;
  const { font, color, titleColor, scale, uppercase, shadow, background } = input as Record<string, unknown>;
  const parsedBackground = parseBackground(background);
  if (!parsedBackground || typeof font !== 'string' || !FONTS.some((item) => item.id === font)) return null;
  if (typeof color !== 'string' || !HEX.test(color) || typeof titleColor !== 'string' || !HEX.test(titleColor)) {
    return null;
  }
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return null;
  return {
    font,
    color,
    titleColor,
    scale: Math.min(1.6, Math.max(0.5, scale)),
    uppercase: !!uppercase,
    shadow: !!shadow,
    background: parsedBackground,
  };
}
