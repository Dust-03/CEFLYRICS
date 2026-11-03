// Lee la duración de cada cuadro de un MP4 fragmentado, sin decodificarlo: el navegador puede
// saltear cuadros al reproducir, y acá interesa lo que quedó grabado en el archivo.

const CONTAINERS = ['moov', 'trak', 'mdia', 'moof', 'traf', 'mvex'];

export function videoFrameDurationsMs(buf: Buffer) {
  const samples = new Map<number, number[]>();
  const timescales = new Map<number, number>();
  const defaults = new Map<number, number>();
  let trackId = 0;
  let videoTrack = 0;
  let fragmentTrack = 0;
  let fragmentDefault = 0;

  const walk = (start: number, end: number) => {
    let p = start;
    while (p + 8 <= end) {
      const size = buf.readUInt32BE(p) || end - p;
      const type = buf.toString('latin1', p + 4, p + 8);
      const body = p + 8;
      if (CONTAINERS.includes(type)) walk(body, p + size);
      if (type === 'tkhd') trackId = buf.readUInt32BE(body + (buf[body] ? 20 : 12));
      if (type === 'mdhd') timescales.set(trackId, buf.readUInt32BE(body + (buf[body] ? 20 : 12)));
      if (type === 'hdlr' && buf.toString('latin1', body + 8, body + 12) === 'vide') videoTrack = trackId;
      if (type === 'trex') defaults.set(buf.readUInt32BE(body + 4), buf.readUInt32BE(body + 12));
      if (type === 'tfhd') {
        const flags = buf.readUIntBE(body + 1, 3);
        fragmentTrack = buf.readUInt32BE(body + 4);
        let q = body + 8;
        if (flags & 0x1) q += 8;
        if (flags & 0x2) q += 4;
        fragmentDefault = flags & 0x8 ? buf.readUInt32BE(q) : (defaults.get(fragmentTrack) ?? 0);
      }
      if (type === 'trun') {
        const flags = buf.readUIntBE(body + 1, 3);
        const count = buf.readUInt32BE(body + 4);
        let q = body + 8;
        if (flags & 0x1) q += 4;
        if (flags & 0x4) q += 4;
        const list = samples.get(fragmentTrack) ?? [];
        for (let i = 0; i < count; i++) {
          let duration = fragmentDefault;
          if (flags & 0x100) {
            duration = buf.readUInt32BE(q);
            q += 4;
          }
          if (flags & 0x200) q += 4;
          if (flags & 0x400) q += 4;
          if (flags & 0x800) q += 4;
          list.push(duration);
        }
        samples.set(fragmentTrack, list);
      }
      p += size;
    }
  };

  walk(0, buf.length);
  const timescale = timescales.get(videoTrack) ?? 1;
  return (samples.get(videoTrack) ?? []).map((d) => (d / timescale) * 1000);
}
