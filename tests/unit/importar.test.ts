import { describe, expect, it } from 'vitest';
import { decodeText, parseOpenLyrics } from '../../src/main/song-import';
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
