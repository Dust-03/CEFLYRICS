const LONG_VERSE_CHARS = 360;

// Divide una cita larga en dos diapositivas cerca del centro, priorizando un corte natural.
export function verseParts(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= LONG_VERSE_CHARS) return [clean];

  const middle = Math.floor(clean.length / 2);
  const min = Math.max(1, middle - 120);
  const max = Math.min(clean.length - 1, middle + 120);
  const naturalBreaks = [...clean.matchAll(/[;:,.!?](?=\s)/g)]
    .map((match) => match.index! + 1)
    .filter((index) => index >= min && index <= max);
  const breaks = naturalBreaks.length
    ? naturalBreaks
    : [...clean.matchAll(/\s+/g)].map((match) => match.index!).filter((index) => index >= min && index <= max);
  const split = breaks.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? middle;
  const first = clean.slice(0, split).trim();
  const second = clean.slice(split).trim();
  return [`${first} (...)`, `(...) ${second}`];
}
