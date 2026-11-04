import { describe, expect, it } from 'vitest';
import { dovePose, LOGO_PARTS } from '../../src/renderer/operator/splash-logo';

const points = (path: string) => [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [+x, +y]);

describe('partes del logo', () => {
  it('separa el círculo, la paloma, "cef" y las seis letras', () => {
    expect(LOGO_PARTS.dove.match(/M/g)).toHaveLength(5);
    expect(LOGO_PARTS.cef.match(/M/g)).toHaveLength(4);
    expect(LOGO_PARTS.letters).toHaveLength(6);
    expect(LOGO_PARTS.ring.match(/M/g)).toHaveLength(1);
  });
});

describe('aleteo', () => {
  it('sin doblar es exactamente el dibujo del logo', () => {
    expect(dovePose(0)).toBe(LOGO_PARTS.dove);
  });

  it('mantiene los comandos, para que el navegador pueda pasar de una pose a otra', () => {
    const commands = (path: string) => path.replace(/[^A-Za-z]/g, '');
    expect(commands(dovePose(-62))).toBe(commands(LOGO_PARTS.dove));
  });

  it('mueve el ala y deja quietas la cabeza y la cola', () => {
    const rest = points(LOGO_PARTS.dove);
    const bent = points(dovePose(-62));
    expect(bent).toHaveLength(rest.length);
    const moved = (index: number) => Math.hypot(bent[index][0] - rest[index][0], bent[index][1] - rest[index][1]);
    rest.forEach(([x, y], index) => {
      const head = x > 2430;
      const tail = y > 660;
      if (head || tail) expect(moved(index), `${x} ${y}`).toBeLessThan(0.2);
    });
    const tip = rest.findIndex(([x, y]) => y < 260 && x < 2170);
    expect(moved(tip)).toBeGreaterThan(200);
  });
});
