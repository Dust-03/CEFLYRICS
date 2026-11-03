// Banco de prueba: varias pantallas en iframes con relojes falsos, medidas contra el reloj real.
import { connectOperator, fmt, getToken } from './comun.js';

const $ = (id) => document.getElementById(id);
const token = getToken();
$('volver').href = `/?token=${encodeURIComponent(token)}`;

// Cada pantalla simula un equipo distinto. skew en ms, drift en ppm, jitter en ms.
const SCREENS = [
  { nombre: 'Banco 1', skew: 0, drift: 0, jitter: 0 },
  { nombre: 'Banco 2', skew: 2000, drift: 80, jitter: 20 },
  { nombre: 'Banco 3', skew: -2000, drift: -120, jitter: 40 },
];
const WARMUP_MS = 3000;
const SAMPLE_MS = 100;

const frames = SCREENS.map((s) => {
  const iframe = document.createElement('iframe');
  const q = new URLSearchParams({ ...s, debug: '1' });
  iframe.src = `/pantalla?${q}`;
  iframe.title = s.nombre;
  $('pantallas').append(iframe);
  return iframe;
});

let state = null;
const conn = connectOperator({
  token,
  onStatus: (status, message) => status === 'error' && ($('resultado').textContent = `Error: ${message}`),
  onMessage: (msg) => msg.t === 'state' && (state = msg.state),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hooks = () => frames.map((f) => f.contentWindow?.__cef);

async function waitFor(cond, timeoutMs, label) {
  const until = performance.now() + timeoutMs;
  while (!cond()) {
    if (performance.now() > until) throw new Error(`Tiempo agotado esperando: ${label}`);
    await sleep(100);
  }
}

// Diferencia más corta entre dos posiciones de un video que se repite.
function circularDiff(a, b, d, loop) {
  let diff = a - b;
  if (loop && d) diff = ((((diff + d / 2) % d) + d) % d) - d / 2;
  return diff;
}

function sampleSpread() {
  const h = hooks();
  const epoch = performance.timeOrigin + performance.now();
  const d = h[0].duration;
  const loop = h[0].loop;
  const p0 = h[0].positionAtEpoch(epoch);
  const rel = h.map((x) => circularDiff(x.positionAtEpoch(epoch), p0, d, loop) * 1000);
  window.__bench.series.push({ epoch, rel });
  return Math.max(...rel) - Math.min(...rel);
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function drawChart(values) {
  const c = $('grafico');
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const max = Math.max(50, ...values);
  const y = (v) => c.height - (v / max) * (c.height - 10);
  g.strokeStyle = '#e5534b';
  g.setLineDash([6, 4]);
  g.beginPath();
  g.moveTo(0, y(34));
  g.lineTo(c.width, y(34));
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#f2b544';
  g.lineWidth = 2;
  g.beginPath();
  values.forEach((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * c.width;
    if (i) g.lineTo(x, y(v));
    else g.moveTo(x, y(v));
  });
  g.stroke();
  g.fillStyle = '#8d97ab';
  g.font = '14px system-ui';
  g.fillText(`34 ms`, 6, y(34) - 4);
}

async function run({ media = $('medio').value, seconds = Number($('segundos').value) || 20 } = {}) {
  $('resultado').textContent = 'Preparando…';
  conn.cmd('load', { media });
  await waitFor(() => state?.media === media, 5000, 'cargar el video');
  await waitFor(() => hooks().every((h) => h?.ready), 60000, 'que todas las pantallas estén listas');
  conn.cmd('play', { position: 0 });
  await waitFor(() => state?.playing, 5000, 'reproducir');

  const startedAt = performance.now();
  const spreads = [];
  const all = [];
  while (performance.now() - startedAt < WARMUP_MS + seconds * 1000) {
    await sleep(SAMPLE_MS);
    const spread = sampleSpread();
    all.push(spread);
    if (performance.now() - startedAt >= WARMUP_MS) spreads.push(spread);
    drawChart(all);
    $('resultado').textContent = `Midiendo… dispersión actual ${fmt(spread)} ms`;
  }
  const sorted = [...spreads].sort((a, b) => a - b);
  const summary = {
    media,
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    screens: hooks().map((h) => h.stats()),
  };
  summary.pass = summary.p95 <= 34;
  window.__bench.last = summary;
  $('resultado').textContent =
    `${summary.pass ? 'PASA' : 'NO PASA'} · p50 ${fmt(summary.p50)} ms · p95 ${fmt(summary.p95)} ms · ` +
    `máx ${fmt(summary.max)} ms · ${summary.samples} muestras`;
  return summary;
}

window.__bench = { run, sampleSpread, last: null, series: [], events: () => hooks().map((h) => h.events) };

$('btn-correr').onclick = () => run().catch((err) => ($('resultado').textContent = `Error: ${err.message}`));
$('btn-cortar').onclick = () => hooks()[1]?.dropConnection();

fetch('/api/media')
  .then((r) => r.json())
  .then((files) => {
    $('medio').innerHTML = files.map((f) => `<option>${f.name}</option>`).join('');
    if (!files.length) $('resultado').textContent = 'No hay videos: generá el patrón de prueba primero.';
  });
