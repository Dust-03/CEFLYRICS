import { spawn } from 'node:child_process';

// Lo que reproduce cualquier tele: H.264 de 8 bits, hasta 1080p y 30 cuadros, en MP4.
// Los celulares graban en HEVC 4K a 60 cuadros, que el navegador de muchas teles no abre.
export type VideoInfo = { codec: string; pixelFormat: string; width: number; height: number; fps: number };

// Sin ffprobe: alcanza con lo que ffmpeg escribe al abrir el archivo.
export function parseVideoInfo(stderr: string): VideoInfo | null {
  const line = /Stream #\S+.*?: Video: (.*)/.exec(stderr)?.[1];
  if (!line) return null;
  const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(line);
  return {
    codec: /^(\w+)/.exec(line)?.[1] ?? '',
    pixelFormat: /,\s*(yuv\w+|nv\w+|p0\w+|gray\w*|rgb\w*|bgr\w*)/.exec(line)?.[1] ?? '',
    width: Number(size?.[1] ?? 0),
    height: Number(size?.[2] ?? 0),
    fps: Number(/([\d.]+) fps/.exec(line)?.[1] ?? 0),
  };
}

export const isTvReady = (info: VideoInfo, ext: string) =>
  (ext === 'mp4' || ext === 'm4v') &&
  info.codec === 'h264' &&
  (info.pixelFormat === 'yuv420p' || info.pixelFormat === 'yuvj420p') &&
  Math.min(info.width, info.height) <= 1080 &&
  info.fps <= 30.5;

function run(ffmpeg: string, args: string[], signal?: AbortSignal) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], signal });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Solo interesa el principio (los datos del archivo) y el final (el error, si lo hay).
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

export async function probeVideo(ffmpeg: string, file: string) {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file]);
  return parseVideoInfo(stderr);
}

// El lado corto queda en 1080 como máximo, sea horizontal o vertical (ffmpeg ya lo gira solo).
const SCALE = "scale=w='if(gte(iw,ih),-2,min(iw,1080))':h='if(gte(iw,ih),min(ih,1080),-2)'";

export async function convertForTv(ffmpeg: string, input: string, output: string, signal?: AbortSignal) {
  const { code, stderr } = await run(
    ffmpeg,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      SCALE,
      '-fpsmax',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-profile:v',
      'high',
      '-level',
      '4.1',
      '-pix_fmt',
      'yuv420p',
      // El índice al principio: la tele empieza a reproducir sin bajar todo el archivo.
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-f',
      'mp4',
      output,
    ],
    signal,
  );
  if (code !== 0) throw new Error(stderr.trim().split('\n').pop() || `ffmpeg terminó con código ${code}`);
}
