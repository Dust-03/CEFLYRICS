// Pantalla sincronizada: precarga el video a memoria (blob), sincroniza el reloj con el
// servidor y corrige la deriva cada 200 ms para seguir la posición "al aire".
import { ClockSync } from './clock.js';

const params = new URLSearchParams(location.search);
const num = (key) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) ? v : 0;
};

// Parámetros de prueba: reloj desfasado (skew, ms), deriva (drift, ppm) y jitter de red (ms).
const sim = { skewMs: num('skew'), driftPpm: num('drift'), jitterMs: num('jitter') };
// Latencia extra de esta pantalla (TV, capturadora): se adelanta la imagen esa cantidad.
const outputLatencyMs = num('lat');
const displayName = params.get('nombre') || `Pantalla ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const isWebKit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Electron/.test(navigator.userAgent);

// Bandas de corrección (ms). Ver CLAUDE.md, "Sincronización".
const BAND_OK_MS = 15;
const BAND_EXIT_MS = 5;
const BAND_RATE_MS = 120;
const TICK_MS = 200;

const localFromPerf = (p) => p * (1 + sim.driftPpm / 1e6) + sim.skewMs;
const localNow = () => localFromPerf(performance.now());

const $ = (id) => document.getElementById(id);
const video = $('video');
const ui = {
  text: $('texto'),
  textTitle: $('texto-titulo'),
  textBody: $('texto-cuerpo'),
  black: $('negro'),
  waiting: $('espera'),
  status: $('estado'),
  progress: $('progreso'),
  soundHint: $('aviso-sonido'),
  debug: $('debug'),
};
$('nombre').textContent = displayName;
ui.debug.hidden = params.get('debug') !== '1';

let ws = null;
let reconnectDelay = 500;
let state = null;
const clock = new ClockSync({
  send: wsSend,
  localNow,
  onLock: () => {
    if (!loadingMedia) setStatus('Conectada');
    tick();
  },
});

// Medios
const blobCache = new Map();
let loadingMedia = null;
let loadedMedia = null;
let loadAbort = null;
let progress = 0;

// Corrección
let frame = null;
let correcting = false;
let settleUntil = 0;
let seekLeadMs = 80;
let startLeadMs = 0;
let justSeeked = false;
let justStarted = false;
let startTimer = null;
let armedFor = null;
let startedFor = null;
let seeks = 0;
let lastErrMs = NaN;
let errAbsAvgMs = 0;

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 500;
    const ready = loadedMedia ? { media: loadedMedia, duration: video.duration } : null;
    wsSend({ t: 'hello', role: 'display', name: displayName, simJitter: sim.jitterMs, ready });
    clock.start();
    setStatus(clock.locked ? 'Conectada' : 'Sincronizando reloj…');
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'pong') clock.handlePong(msg);
    else if (msg.t === 'state') onState(msg.state);
  };
  ws.onclose = () => {
    clock.stop();
    setStatus('Sin conexión, reintentando…');
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 2000);
  };
}

function onState(next) {
  const prev = state;
  state = next;
  video.loop = !!state.loop;
  if (state.media !== loadedMedia && state.media !== loadingMedia) loadMedia(state.media);
  const anchorChanged =
    !prev || prev.anchorTime !== state.anchorTime || prev.anchorPos !== state.anchorPos || prev.playing !== state.playing;
  if (anchorChanged) clearStart();
  render();
  tick();
}

function render() {
  const s = state || {};
  ui.black.classList.toggle('on', !!s.black);
  ui.text.classList.toggle('on', !!s.text);
  if (s.text) {
    ui.textTitle.textContent = s.text.title;
    ui.textBody.textContent = s.text.body;
  }
  ui.text.classList.toggle('sobre-video', !!s.media);
  const showWaiting = !s.media ? !s.text : loadedMedia !== s.media;
  ui.waiting.classList.toggle('on', showWaiting);
  ui.progress.style.width = `${Math.round(progress * 100)}%`;
}

function setStatus(text) {
  ui.status.textContent = text;
}

// ---------- Precarga ----------

async function loadMedia(name) {
  loadAbort?.abort();
  loadAbort = null;
  loadedMedia = null;
  loadingMedia = name;
  progress = 0;
  frame = null;
  render();
  if (!name) {
    video.removeAttribute('src');
    video.load();
    loadingMedia = null;
    setStatus('Conectada');
    return;
  }
  try {
    let url = blobCache.get(name);
    if (!url) {
      const ctrl = (loadAbort = new AbortController());
      setStatus(`Descargando ${name}…`);
      const res = await fetch(`/media/${encodeURIComponent(name)}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        progress = total ? received / total : 0;
        render();
      }
      url = URL.createObjectURL(new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' }));
      blobCache.set(name, url);
      while (blobCache.size > 4) {
        const [oldName, oldUrl] = blobCache.entries().next().value;
        URL.revokeObjectURL(oldUrl);
        blobCache.delete(oldName);
      }
    }
    if (loadingMedia !== name) return;
    setStatus('Preparando video…');
    video.src = url;
    await once(video, 'loadedmetadata');
    await fixDuration();
    if (loadingMedia !== name) return;
    loadingMedia = null;
    loadedMedia = name;
    progress = 1;
    setStatus('Lista');
    wsSend({ t: 'ready', media: name, duration: video.duration });
    render();
    tick();
  } catch (err) {
    if (err.name === 'AbortError') return;
    loadingMedia = null;
    setStatus(`No se pudo cargar ${name}: ${err.message}`);
  }
}

// Los videos grabados con MediaRecorder no traen duración: se fuerza a calcularla.
async function fixDuration() {
  if (Number.isFinite(video.duration) && video.duration > 0) return;
  video.currentTime = 1e101;
  await Promise.race([once(video, 'durationchange'), sleep(3000)]);
  video.currentTime = 0;
  await Promise.race([once(video, 'seeked'), sleep(1000)]);
}

const once = (el, type) => new Promise((resolve) => el.addEventListener(type, resolve, { once: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Medición ----------

// requestVideoFrameCallback dice qué cuadro (mediaTime) se muestra y cuándo (expectedDisplayTime).
function onVideoFrame(_now, meta) {
  frame = { mediaTime: meta.mediaTime, at: meta.expectedDisplayTime };
  video.requestVideoFrameCallback(onVideoFrame);
}
if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) video.requestVideoFrameCallback(onVideoFrame);

function duration() {
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
}

// Posición que se ve en pantalla en el instante perfT (reloj performance.now de esta página).
function actualPositionAt(perfT) {
  if (frame && !video.paused && !video.seeking && perfT - frame.at < 300 && perfT - frame.at > -100) {
    return frame.mediaTime + ((perfT - frame.at) / 1000) * video.playbackRate;
  }
  return video.currentTime;
}

// Posición que debería verse en perfT según el estado del servidor.
function expectedPositionAt(perfT) {
  const sNow = clock.serverNow(localFromPerf(perfT));
  if (!state.playing || sNow <= state.anchorTime) return state.anchorPos;
  return wrap(state.anchorPos + (sNow - state.anchorTime + outputLatencyMs) / 1000);
}

function wrap(pos) {
  const d = duration();
  if (!d) return pos;
  return state.loop ? ((pos % d) + d) % d : Math.min(pos, d);
}

// Diferencia actual - esperada, en segundos; con loop se toma el camino más corto.
function circularDiff(actual, expected) {
  const d = duration();
  let diff = actual - expected;
  if (state.loop && d) diff = ((((diff + d / 2) % d) + d) % d) - d / 2;
  return diff;
}

// ---------- Corrección ----------

function tick() {
  if (!clock.locked || !state || !state.media || loadedMedia !== state.media) return;
  const perfT = performance.now();
  const sNow = clock.serverNow(localFromPerf(perfT));

  if (!state.playing) {
    clearStart();
    if (!video.paused) video.pause();
    setRate(1);
    if (!video.seeking && Math.abs(video.currentTime - state.anchorPos) > 0.04) video.currentTime = state.anchorPos;
    lastErrMs = NaN;
    return;
  }

  const untilStartMs = state.anchorTime - sNow;
  if (untilStartMs > 0 && startedFor !== state.anchorTime) {
    // Inicio programado: quieto en la posición de arranque, con el play agendado.
    if (!video.paused) video.pause();
    setRate(1);
    if (!video.seeking && Math.abs(video.currentTime - state.anchorPos) > 0.01) video.currentTime = state.anchorPos;
    armStart(untilStartMs);
    return;
  }

  if (video.seeking || perfT < settleUntil) return;
  if (!state.loop && video.ended) return;
  if (video.paused) {
    // Se llegó tarde al inicio (o se reconectó): arrancar y dejar que la corrección ajuste.
    startedFor = state.anchorTime;
    playVideo();
    settleUntil = perfT + 300;
    return;
  }

  const errMs = circularDiff(actualPositionAt(perfT), expectedPositionAt(perfT)) * 1000;
  lastErrMs = errMs;
  errAbsAvgMs = errAbsAvgMs * 0.9 + Math.abs(errMs) * 0.1;
  correct(errMs, perfT);
}

function correct(errMs, perfT) {
  const abs = Math.abs(errMs);
  // Aprende cuánto tarda en arrancar y en saltar este equipo (errMs < 0 = atrasado).
  if (justStarted) {
    startLeadMs = clamp(startLeadMs - errMs * 0.5, 0, 400);
    justStarted = false;
  }
  if (justSeeked) {
    seekLeadMs = clamp(seekLeadMs - errMs * 0.7, 0, 1500);
    justSeeked = false;
  }

  if (abs > BAND_RATE_MS) return seekTo(expectedPositionAt(perfT + seekLeadMs));

  if (isWebKit) {
    // WebKit cambia mal el playbackRate: se usa una micropausa si va adelantado.
    if (errMs > BAND_OK_MS) microPause(errMs);
    else if (errMs < -BAND_OK_MS) seekTo(expectedPositionAt(perfT + seekLeadMs));
    return;
  }

  if (correcting ? abs < BAND_EXIT_MS : abs < BAND_OK_MS) {
    correcting = false;
    setRate(1);
    return;
  }
  correcting = true;
  // Corrige el error en unos 2 s, con la velocidad entre 0,5 % y 2 %.
  const delta = clamp(abs / 2000, 0.005, 0.02);
  setRate(errMs > 0 ? 1 - delta : 1 + delta);
}

function seekTo(pos) {
  correcting = false;
  setRate(1);
  seeks++;
  justSeeked = true;
  video.currentTime = pos;
  settleUntil = performance.now() + 250;
}

function microPause(ms) {
  video.pause();
  settleUntil = performance.now() + ms + 250;
  setTimeout(playVideo, ms);
}

function setRate(rate) {
  if (Math.abs(video.playbackRate - rate) > 1e-4) video.playbackRate = rate;
}

function armStart(untilStartMs) {
  if (armedFor === state.anchorTime) return;
  clearStart();
  const anchor = (armedFor = state.anchorTime);
  startTimer = setTimeout(() => {
    startTimer = null;
    if (!state.playing || state.anchorTime !== anchor) return;
    startedFor = anchor;
    justStarted = true;
    settleUntil = performance.now() + 250;
    playVideo();
  }, Math.max(0, untilStartMs - startLeadMs));
}

function clearStart() {
  clearTimeout(startTimer);
  startTimer = null;
  armedFor = null;
  startedFor = null;
}

function playVideo() {
  video.play().catch((err) => {
    // Si el navegador bloquea el audio, se reproduce sin sonido y se avisa.
    if (err.name === 'NotAllowedError' && !video.muted) {
      video.muted = true;
      ui.soundHint.classList.add('on');
      video.play().catch(() => {});
    }
  });
}

video.addEventListener('seeked', () => {
  settleUntil = Math.max(settleUntil, performance.now() + 150);
});

setInterval(tick, TICK_MS);

// ---------- Estadísticas ----------

function stats() {
  return {
    offsetMs: clock.locked ? clock.offsetAt(localNow()) : null,
    rttMs: clock.rtt,
    driftPpm: clock.driftPpm,
    errMs: lastErrMs,
    errAvgMs: errAbsAvgMs,
    rate: video.playbackRate,
    seeks,
    seekLeadMs,
    startLeadMs,
    progress,
    media: loadedMedia,
    latencyMs: outputLatencyMs,
    sim,
  };
}

setInterval(() => {
  const s = stats();
  wsSend({ t: 'stats', stats: s });
  if (!ui.debug.hidden) {
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
    ui.debug.textContent =
      `${displayName}\n` +
      `offset ${f(s.offsetMs)} ms · rtt ${f(s.rttMs)} ms · deriva ${f(s.driftPpm)} ppm\n` +
      `error ${f(s.errMs)} ms (prom ${f(s.errAvgMs)}) · vel ${f(s.rate, 3)} · saltos ${s.seeks}\n` +
      `lead salto ${f(s.seekLeadMs, 0)} ms · lead inicio ${f(s.startLeadMs, 0)} ms`;
  }
}, 1000);

// Ganchos para el banco de prueba (misma página/origen) y para Playwright.
window.__cef = {
  positionAtEpoch: (epochMs) => actualPositionAt(epochMs - performance.timeOrigin),
  expectedAtEpoch: (epochMs) => expectedPositionAt(epochMs - performance.timeOrigin),
  get ready() {
    return clock.locked && !!state && loadedMedia === state.media && !!loadedMedia;
  },
  get duration() {
    return duration();
  },
  get loop() {
    return !!state?.loop;
  },
  stats,
  dropConnection: () => ws?.close(),
};

// ---------- Interacción ----------

document.addEventListener('click', () => {
  video.muted = false;
  ui.soundHint.classList.remove('on');
});
document.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'd') ui.debug.hidden = !ui.debug.hidden;
});

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

render();
connect();
