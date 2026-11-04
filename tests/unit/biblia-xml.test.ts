import { describe, expect, it } from 'vitest';
import { parseBibleXml } from '../../src/main/bible/xml';

const nameOf = (number: number) => `Libro ${number}`;

describe('biblias en XML', () => {
  it('lee Zefania, sin notas y con los nombres del archivo', () => {
    const xml = `<?xml version="1.0"?><XMLBIBLE biblename="Prueba">
      <BIBLEBOOK bnumber="43" bname="Juan"><CHAPTER cnumber="3">
        <VERS vnumber="16">Porque de tal <STYLE css="x">manera</STYLE> amó<NOTE>una nota</NOTE> &amp; más</VERS>
      </CHAPTER></BIBLEBOOK></XMLBIBLE>`;
    expect(parseBibleXml(xml, nameOf)).toEqual({
      books: [
        { number: 43, name: 'Juan', verses: [{ chapter: 3, verse: 16, text: 'Porque de tal manera amó & más' }] },
      ],
      skipped: [],
    });
  });

  it('lee el formato book, chapter, verse, y sin nombres usa los de fábrica', () => {
    const xml = `<bible><testament name="Old"><book number="1"><chapter number="1">
      <verse number="1">En el principio</verse><verse number="2">La tierra</verse>
    </chapter></book></testament></bible>`;
    const { books } = parseBibleXml(xml, nameOf);
    expect(books[0].name).toBe('Libro 1');
    expect(books[0].verses.map(({ verse }) => verse)).toEqual([1, 2]);
  });

  it('lee OpenSong, que ordena los libros por posición', () => {
    const book = (name: string) => `<b n="${name}"><c n="1"><v n="1">Texto de ${name}</v></c></b>`;
    const xml = `<bible>${Array.from({ length: 66 }, (_, index) => book(`L${index + 1}`)).join('')}</bible>`;
    const { books } = parseBibleXml(xml, nameOf);
    expect(books).toHaveLength(66);
    expect(books[42]).toMatchObject({ number: 43, name: 'L43' });
  });

  it('con menos de 66 libros sin número no adivina cuál es cuál', () => {
    const xml = '<bible><b n="Génesis"><c n="1"><v n="1">Algo</v></c></b></bible>';
    expect(() => parseBibleXml(xml, nameOf)).toThrow('no se reconoce');
  });

  it('lee OSIS, con versículos como elementos y como marcas', () => {
    const elementos = '<osis><verse osisID="John.3.16">Porque de tal manera</verse></osis>';
    const marcas = `<osis><chapter osisID="Gen.1"><verse sID="Gen.1.1" osisID="Gen.1.1"/>En el principio<note>x</note>
      <verse eID="Gen.1.1"/><verse sID="Gen.1.2" osisID="Gen.1.2"/>Y la tierra<verse eID="Gen.1.2"/></chapter></osis>`;
    expect(parseBibleXml(elementos, nameOf).books[0]).toMatchObject({ number: 43 });
    const { books } = parseBibleXml(marcas, nameOf);
    expect(books[0].verses).toEqual([
      { chapter: 1, verse: 1, text: 'En el principio' },
      { chapter: 1, verse: 2, text: 'Y la tierra' },
    ]);
  });

  it('avisa los libros que no maneja, y sigue con los demás', () => {
    const xml = `<XMLBIBLE><BIBLEBOOK bnumber="70" bname="Tobías"><CHAPTER cnumber="1"><VERS vnumber="1">A</VERS></CHAPTER></BIBLEBOOK>
      <BIBLEBOOK bnumber="1" bname="Génesis"><CHAPTER cnumber="1"><VERS vnumber="1">B</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
    const { books, skipped } = parseBibleXml(xml, nameOf);
    expect(books.map(({ name }) => name)).toEqual(['Génesis']);
    expect(skipped).toEqual(['Tobías']);
  });

  it('rechaza lo que no es XML o no conoce', () => {
    expect(() => parseBibleXml('SQLite format 3', nameOf)).toThrow('no es un archivo XML');
    expect(() => parseBibleXml('<raro><cosa/></raro>', nameOf)).toThrow('no se reconoce');
  });
});
