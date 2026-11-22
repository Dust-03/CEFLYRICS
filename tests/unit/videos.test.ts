import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { openDatabase, type Db } from '../../src/main/db/database';
import { MediaService, type VideoConverter } from '../../src/main/media';
import { convertForTv, isTvReady, parseVideoInfo, probeVideo } from '../../src/main/video';

const FFMPEG = 'node_modules/ffmpeg-static/ffmpeg.exe';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cef-videos-'));
  db = openDatabase(join(dir, 'prueba.db'));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('lee el formato del video de lo que escribe ffmpeg', () => {
  const phone = parseVideoInfo(
    '  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 3840x2160, 52000 kb/s, 59.94 fps, 60 tbr, 600 tbn (default)',
  );
  expect(phone).toEqual({ codec: 'hevc', pixelFormat: 'yuv420p10le', width: 3840, height: 2160, fps: 59.94 });
  expect(isTvReady(phone!, 'mov')).toBe(false);

  const ready = parseVideoInfo(
    '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 9000 kb/s, 30 fps, 30 tbr, 15360 tbn (default)',
  );
  expect(isTvReady(ready!, 'mp4')).toBe(true);
  expect(isTvReady(ready!, 'webm')).toBe(false);
  expect(isTvReady({ ...ready!, fps: 60 }, 'mp4')).toBe(false);
  expect(isTvReady({ ...ready!, width: 2160, height: 3840 }, 'mp4')).toBe(false);
  expect(parseVideoInfo('Input #0, png_pipe')).toBeNull();
});

// Hace de conversor: copia el archivo y deja esperar el final.
function fakeConverter() {
  let release = () => {};
  const converter: VideoConverter & { calls: string[] } = {
    calls: [],
    needsConversion: async (_file, ext) => ext !== 'm4v',
    convert: async (file, output) => {
      converter.calls.push(file);
      await new Promise<void>((resolve) => (release = resolve));
      writeFileSync(output, 'convertido');
    },
  };
  return { converter, finish: () => release() };
}

test('al agregar un video lo convierte en segundo plano y la dirección vieja sigue andando', async () => {
  const folder = join(dir, 'media');
  const { converter, finish } = fakeConverter();
  let changes = 0;
  const media = new MediaService(db, folder, undefined, converter, () => changes++);
  const video = join(dir, 'celular.mp4');
  writeFileSync(video, 'hevc 4k');

  await media.add([video]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const [before] = await media.list();
  expect(before.converting).toBe(true);
  expect(changes).toBe(1);

  finish();
  await media.convertVideos();
  const [after] = await media.list();
  expect(after.converting).toBeUndefined();
  expect(after.url).toMatch(/\.m4v$/);
  expect(after.size).toBe('convertido'.length);
  expect(readdirSync(folder).filter((name) => !name.includes('thumb'))).toHaveLength(1);
  expect(changes).toBe(2);

  // Un estilo guardado con la dirección de antes encuentra el archivo nuevo.
  const old = await media.serve(new Request(before.url.replace('cef-media:', 'http:')));
  expect(old.headers.get('content-type')).toBe('video/mp4');
  expect(await old.text()).toBe('convertido');

  // Lo ya convertido no se vuelve a tocar.
  await media.convertVideos();
  expect(converter.calls).toHaveLength(1);
});

test('si borran el video mientras se convierte no queda nada en la carpeta', async () => {
  const folder = join(dir, 'media');
  const { converter, finish } = fakeConverter();
  const media = new MediaService(db, folder, undefined, converter);
  const video = join(dir, 'celular.mov');
  writeFileSync(video, 'hevc 4k');

  await media.add([video]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await media.remove((await media.list())[0].id);
  finish();
  await media.convertVideos();
  expect(await media.list()).toEqual([]);
  expect(readdirSync(folder)).toEqual([]);
});

test.skipIf(!existsSync(FFMPEG))(
  'ffmpeg pasa un video HEVC a 60 cuadros a uno que abre la tele',
  async () => {
    const input = join(dir, 'celular.mp4');
    execFileSync(FFMPEG, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x1440:rate=60:duration=1',
      '-c:v',
      'libx265',
      '-x265-params',
      'log-level=error',
      '-pix_fmt',
      'yuv420p10le',
      '-tag:v',
      'hvc1',
      input,
    ]);
    const before = await probeVideo(FFMPEG, input);
    expect(before).toMatchObject({ codec: 'hevc', fps: 60 });
    expect(isTvReady(before!, 'mp4')).toBe(false);

    const output = join(dir, 'tele.mp4');
    await convertForTv(FFMPEG, input, output);
    const after = await probeVideo(FFMPEG, output);
    expect(after).toMatchObject({ codec: 'h264', pixelFormat: 'yuv420p', width: 1080, height: 1216, fps: 30 });
    expect(isTvReady(after!, 'mp4')).toBe(true);
  },
  60_000,
);
