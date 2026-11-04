// Formato para escribir o pegar una letra: una línea en blanco separa cada diapositiva. Un bloque
// puede empezar con una etiqueta ("Coro", "[Verso 2]"). Las líneas con // solo se ven en el retorno.

export type SongSlide = { label: string; text: string; returnNotes: string };

const LABEL = /^\[?\s*(coro|estribillo|verso|estrofa|puente|pre-?\s?coro|intro|final|v|c|p|b)\s*(\d*)\s*\]?\s*:?\s*$/i;

function shortLabel(word: string, number: string) {
  const lower = word.toLowerCase();
  if (lower.startsWith('coro') || lower === 'estribillo' || lower === 'c') return `C${number}`;
  if (lower === 'puente' || lower === 'p' || lower === 'b') return `P${number}`;
  if (lower.startsWith('pre')) return `PC${number}`;
  if (lower === 'intro') return `I${number}`;
  if (lower === 'final') return `F${number}`;
  return `V${number || ''}`;
}

const LONG_LABELS: Record<string, string> = {
  C: 'Coro',
  P: 'Puente',
  PC: 'Precoro',
  I: 'Intro',
  F: 'Final',
  V: 'Verso',
};

export function labelName(label: string) {
  const match = /^([A-Z]+)(\d*)$/.exec(label);
  if (!match) return label;
  return `${LONG_LABELS[match[1]] ?? match[1]}${match[2] ? ` ${match[2]}` : ''}`;
}

export function parseSongText(input: string): SongSlide[] {
  const slides: SongSlide[] = [];
  let verse = 0;
  for (const block of input.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const match = LABEL.exec(lines[0]);
    if (match) lines.shift();
    const notes = lines.filter((line) => line.startsWith('//')).map((line) => line.slice(2).trim());
    const text = lines.filter((line) => !line.startsWith('//')).join('\n');
    if (!text) continue;
    let label = match ? shortLabel(match[1], match[2]) : '';
    if (!label || label === 'V') label = match?.[2] ? `V${match[2]}` : `V${++verse}`;
    else if (label.startsWith('V')) verse = Number(label.slice(1));
    slides.push({ label, text, returnNotes: notes.join('\n') });
  }
  return slides;
}

export function toSongText(slides: SongSlide[]) {
  return slides
    .map(({ label, text, returnNotes }) => {
      const notes = returnNotes
        ? `\n${returnNotes
            .split('\n')
            .map((line) => `// ${line}`)
            .join('\n')}`
        : '';
      return `${labelName(label)}\n${text}${notes}`;
    })
    .join('\n\n');
}
