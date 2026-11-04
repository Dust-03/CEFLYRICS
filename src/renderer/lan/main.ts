// La pantalla que abre la tele en su navegador. Dibuja con el mismo motor que el proyector; se
// compila aparte, para navegadores viejos (ver vite.lan.config.ts).
import '../fonts';
import { createRenderer } from '@render-engine/index';
import type { OnAirState } from '@shared/state';

const PING_MS = 5000;
const SILENT_MS = 12_000;
const NOTICE_MS = 8000;
const FULLSCREEN_NOTICE = 'Apretá OK en el control para pantalla completa';

const notice = document.getElementById('aviso')!;

// El reloj de la tele suele estar corrido: los temporizadores usan la hora de la PC.
let clockOffset = 0;
let bestRoundTrip = Infinity;

// Sin sonido salvo que se pida en Transmisión: en la misma sala se escucharía con eco.
let sound = false;

const render = createRenderer(document.getElementById('stage')!, {
  audio: () => sound,
  now: () => Date.now() + clockOffset,
});

let socket: WebSocket | null = null;
let heardAt = 0;

// El video de fondo sigue mudo: el audio es de lo que se proyecta.
function applySound() {
  const video = document.querySelector<HTMLVideoElement>('.cef-media video');
  if (video) video.muted = !sound;
}

function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const sendSize = () => send({ t: 'size', w: window.innerWidth, h: window.innerHeight });

function onPong(sentAt: number, serverTime: number) {
  const received = Date.now();
  const roundTrip = received - sentAt;
  if (roundTrip > bestRoundTrip + 20) return;
  bestRoundTrip = Math.min(bestRoundTrip, roundTrip);
  clockOffset = serverTime - (sentAt + received) / 2;
}

function connect() {
  const current = new WebSocket(`ws://${location.host}/ws`);
  socket = current;
  heardAt = Date.now();
  current.onopen = () => {
    if (notice.textContent !== FULLSCREEN_NOTICE) notice.textContent = '';
    sendSize();
    send({ t: 'ping', c: Date.now() });
  };
  current.onmessage = ({ data }) => {
    heardAt = Date.now();
    const message = JSON.parse(data) as { t: string; state: OnAirState; c: number; s: number; on: boolean };
    if (message.t === 'state') render(message.state);
    else if (message.t === 'sound') {
      sound = message.on;
      applySound();
    } else if (message.t === 'pong') onPong(message.c, message.s);
  };
  current.onclose = () => {
    // Lo proyectado queda en pantalla: que se corte la red no tiene que dejar la tele en negro.
    notice.textContent = 'Buscando CEFLYRICS…';
    setTimeout(connect, 1500);
  };
}

setInterval(() => {
  send({ t: 'ping', c: Date.now() });
  // Si la red se cae sin avisar, el navegador tarda minutos en darse cuenta.
  if (socket?.readyState === WebSocket.OPEN && Date.now() - heardAt > SILENT_MS) socket.close();
}, PING_MS);

function goFullscreen() {
  // El navegador silencia lo que arranca solo: apretar una tecla le da permiso para sonar.
  applySound();
  const page = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  if (page.requestFullscreen) page.requestFullscreen().catch(() => {});
  else page.webkitRequestFullscreen?.();
}

window.addEventListener('resize', sendSize);
window.addEventListener('click', goFullscreen);
window.addEventListener('keydown', goFullscreen);

notice.textContent = FULLSCREEN_NOTICE;
setTimeout(() => {
  if (notice.textContent === FULLSCREEN_NOTICE) notice.textContent = '';
}, NOTICE_MS);

connect();
