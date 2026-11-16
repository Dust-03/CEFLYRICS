import { describe, expect, it } from 'vitest';
import { decodeText, parseHolyricsJson, parseOpenLyrics } from '../../src/main/song-import';
import { parseSongText } from '../../src/shared/song-text';

describe('codificación de los TXT', () => {
  it('lee UTF-8 y saca la marca del principio', () => {
    expect(decodeText(Buffer.from('\uFEFFCorazón', 'utf8'))).toBe('Corazón');
  });

  it('lee los archivos viejos de Windows sin romper los acentos', () => {
    expect(decodeText(Buffer.from('Corazón', 'latin1'))).toBe('Corazón');
  });
});

describe('etiquetas cortas', () => {
  it('V1, C y P no salen proyectadas', () => {
    const slides = parseSongText('V1\nUno\n\nC\nCoro\n\nP\nPuente\n\nV2\nDos');
    expect(slides.map(({ label, text }) => [label, text])).toEqual([
      ['V1', 'Uno'],
      ['C', 'Coro'],
      ['P', 'Puente'],
      ['V2', 'Dos'],
    ]);
  });

  it('una línea de letra que empieza igual sigue siendo letra', () => {
    expect(parseSongText('Cristo vive')[0].text).toBe('Cristo vive');
  });
});

describe('OpenLyrics', () => {
  const song = `<?xml version="1.0"?>
    <song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
      <properties>
        <titles><title>Sublime &amp; santo</title><title>Otro título</title></titles>
        <authors><author>Ana</author><author type="words">Juan</author></authors>
      </properties>
      <lyrics>
        <verse name="v1"><lines>Primera <chord name="G"/>línea<br/>Segunda<comment>solo piano</comment></lines></verse>
        <verse name="c"><lines>El coro</lines></verse>
      </lyrics>
    </song>`;

  it('saca título, autores y letra, sin acordes ni comentarios', () => {
    expect(parseOpenLyrics(song)).toEqual({
      title: 'Sublime & santo',
      author: 'Ana, Juan',
      text: 'Verso 1\nPrimera línea\nSegunda\n\nCoro\nEl coro',
    });
  });

  it('rechaza lo que no es OpenLyrics o viene vacío', () => {
    expect(() => parseOpenLyrics('<html></html>')).toThrow('no es un archivo OpenLyrics');
    expect(() => parseOpenLyrics('<song><title>Solo título</title></song>')).toThrow('no tiene');
  });
});

describe('JSON de Holyrics', () => {
  const paragraph = (text: string, description = '') => ({ number: 1, description, text, translations: null });
  const file = JSON.stringify([
    {
      id: 1,
      title: '404 - No hay Dios ',
      artist: 'Iglesia',
      author: '',
      lyrics: {
        full_text: 'no se usa',
        paragraphs: [
          paragraph('Primera línea \r\nSegunda\n\n'),
          paragraph('El coro', 'Coro'),
          paragraph('Tercera', 'Solo piano'),
        ],
      },
    },
    { id: 2, title: 'Sin estrofas', author: 'Ana', lyrics: { full_text: 'Uno\n\nDos', paragraphs: [] } },
    { id: 3, title: '', lyrics: { full_text: 'Sin título', paragraphs: [] } },
  ]);

  it('saca cada canción con una diapositiva por estrofa', () => {
    const [first, second, third] = parseHolyricsJson(`\uFEFF${file}`);
    expect(first).toEqual({
      name: '404 - No hay Dios',
      song: {
        title: '404 - No hay Dios',
        author: 'Iglesia',
        text: 'Primera línea\nSegunda\n\nCoro\nEl coro\n\nTercera',
      },
    });
    expect(parseSongText(first.song!.text).map(({ label }) => label)).toEqual(['V1', 'C', 'V2']);
    expect(second.song).toEqual({ title: 'Sin estrofas', author: 'Ana', text: 'Uno\n\nDos' });
    expect(third).toEqual({ name: 'Canción 3', error: 'no tiene título o letra' });
  });

  it('rechaza lo que no es una exportación de Holyrics', () => {
    expect(() => parseHolyricsJson('{roto')).toThrow('no es un archivo JSON válido');
    expect(() => parseHolyricsJson('[{"nombre": "x"}]')).toThrow('no es una exportación');
  });
});
