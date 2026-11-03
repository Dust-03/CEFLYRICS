// Genera un video patrón de sincronía con canvas + MediaRecorder y lo sube al servidor.
import { getToken, uploadFile } from './comun.js';

const $ = (id) => document.getElementById(id);
const canvas = $('lienzo');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const FPS = 30;
const token = getToken();
$('volver').href = `/?token=${encodeURIComponent(token)}`;

const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function draw(tSec, frameNo) {
  const sec = Math.floor(tSec);
  const frac = tSec - sec;
  ctx.fillStyle = `hsl(${(sec * 47) % 360} 45% 18%)`;
  ctx.fillRect(0, 0, W, H);

  // Barra que cruza la pantalla una vez por segundo.
  ctx.fillStyle = '#f2b544';
  ctx.fillRect(frac * (W - 40), H - 100, 40, 70);
  for (let i = 0; i <= 10; i++) ctx.fillRect(i * ((W - 40) / 10) + 19, H - 30, 2, 14);

  // Destello en el primer cuadro de cada segundo (para medir con una cámara).
  if (frac < 1.5 / FPS) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(W - 200, 40, 160, 160);
  }

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 190px ui-monospace, Consolas, monospace';
  const m = Math.floor(tSec / 60);
  const s = (tSec - m * 60).toFixed(2).padStart(5, '0');
  ctx.fillText(`${String(m).padStart(2, '0')}:${s}`, W / 2, H / 2 - 40);
  ctx.font = '48px ui-monospace, Consolas, monospace';
  ctx.fillText(`cuadro ${frameNo}`, W / 2, H / 2 + 100);
  ctx.textAlign = 'left';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText('CEFLIRICS · patrón de sincronía', 40, 60);
}

async function record(seconds) {
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('Este navegador no puede grabar video');

  // Un pitido por segundo; más agudo cada 10 s.
  const audio = new AudioContext();
  const dest = audio.createMediaStreamDestination();
  const base = audio.currentTime + 0.05;
  for (let i = 0; i <= seconds; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = i % 10 === 0 ? 1760 : 880;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(dest);
    osc.start(base + i);
    osc.stop(base + i + 0.06);
  }

  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));

  const t0 = performance.now() + 50;
  recorder.start(1000);
  let frameNo = 0;
  await new Promise((resolve) => {
    const loop = () => {
      const t = Math.max(0, (performance.now() - t0) / 1000);
      draw(t, frameNo++);
      $('estado').textContent = `Grabando… ${Math.ceil(seconds - t)} s`;
      if (t >= seconds) return resolve();
      requestAnimationFrame(loop);
    };
    loop();
  });
  recorder.stop();
  await stopped;
  audio.close();
  return { blob: new Blob(chunks, { type: mimeType.split(';')[0] }), ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

$('btn-grabar').onclick = async () => {
  const button = $('btn-grabar');
  button.disabled = true;
  try {
    const seconds = Math.min(300, Math.max(5, Number($('duracion').value) || 30));
    const { blob, ext } = await record(seconds);
    const name = `patron-prueba-${seconds}s.${ext}`;
    await uploadFile(name, blob, token, (p) => ($('estado').textContent = `Subiendo ${Math.round(p * 100)} %`));
    $('estado').textContent = `Listo: ${name} (${(blob.size / 1048576).toFixed(1)} MB). Ya aparece en el operador.`;
  } catch (err) {
    $('estado').textContent = `Error: ${err.message}`;
  } finally {
    button.disabled = false;
  }
};

draw(0, 0);
