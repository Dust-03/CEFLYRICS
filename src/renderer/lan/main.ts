// La pantalla que abre la tele en su navegador. Dibuja con el mismo motor que el proyector; se
// compila aparte, para navegadores viejos (ver vite.lan.config.ts).
// Las fuentes quedan en pantalla.css, que se pide aparte.
import '../fonts';
import { createRenderer } from '@render-engine/index';
import type { OnAirState } from '@shared/state';

const PING_MS = 5000;
const SILENT_MS = 12_000;
const NOTICE_MS = 8000;
const SOCKET_WAIT_MS = 4000;
const POLL_MS = 500;
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
let socketWorks = false;
let polling = false;

// El video de fondo sigue mudo: el audio es de lo que se proyecta.
function applySound() {
  const video = document.querySelector<HTMLVideoElement>('.cef-media video');
  if (video) video.muted = !sound;
}

function send(message: object) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
}

const sendSize = () => send({ t: 'size', w: window.innerWidth, h: window.innerHeight });

function onPong(sentAt: number, serverTime: number) {
  const received = Date.now();
  const roundTrip = received - sentAt;
  if (roundTrip > bestRoundTrip + 20) return;
  bestRoundTrip = Math.min(bestRoundTrip, roundTrip);
  clockOffset = serverTime - (sentAt + received) / 2;
}

type Message = { t: string; state: OnAirState; c: number; s: number; on: boolean };

function receive(message: Message) {
  if (message.t === 'state') {
    render(message.state);
    // Ya anda: un error de ahora en más no tiene que aparecer en medio del culto.
    window.onerror = null;
  } else if (message.t === 'sound') {
    sound = message.on;
    applySound();
  } else if (message.t === 'pong') onPong(message.c, message.s);
}

function connected() {
  if (notice.textContent !== FULLSCREEN_NOTICE) notice.textContent = '';
}

// Lo proyectado queda en pantalla: que se corte la red no tiene que dejar la tele en negro.
function disconnected() {
  notice.textContent = 'Buscando CEFLYRICS…';
}

function connect() {
  let current: WebSocket;
  try {
    current = new WebSocket(`ws://${location.host}/ws`);
  } catch {
    return;
  }
  socket = current;
  heardAt = Date.now();
  current.onopen = () => {
    socketWorks = true;
    connected();
    sendSize();
    send({ t: 'ping', c: Date.now() });
  };
  current.onmessage = ({ data }) => {
    heardAt = Date.now();
    receive(JSON.parse(data));
  };
  current.onclose = () => {
    if (socketWorks) disconnected();
    setTimeout(connect, polling ? 30_000 : 1500);
  };
}

// Las teles muy viejas no tienen WebSocket, o tienen uno anterior al estándar: en ese caso se
// pregunta seguido qué hay al aire.
let shownState = '';

function poll() {
  polling = !socketWorks;
  if (!polling) return;
  const request = new XMLHttpRequest();
  request.open('GET', `/api/pantalla?w=${window.innerWidth}&h=${window.innerHeight}&t=${Date.now()}`);
  request.timeout = PING_MS;
  request.onreadystatechange = () => {
    if (request.readyState !== 4) return;
    setTimeout(poll, POLL_MS);
    if (socketWorks) return;
    if (request.status !== 200) {
      disconnected();
      return;
    }
    connected();
    for (const message of JSON.parse(request.responseText) as Message[]) {
      const state = message.t === 'state' ? JSON.stringify(message.state) : '';
      if (state && state === shownState) continue;
      if (state) shownState = state;
      receive(message);
    }
  };
  request.send();
}

setInterval(() => {
  send({ t: 'ping', c: Date.now() });
  // Si la red se cae sin avisar, el navegador tarda minutos en darse cuenta.
  if (socket?.readyState === 1 && Date.now() - heardAt > SILENT_MS) socket.close();
}, PING_MS);

function goFullscreen() {
  // El navegador silencia lo que arranca solo: apretar una tecla le da permiso para sonar.
  applySound();
  const page = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  if (page.requestFullscreen) page.requestFullscreen()?.catch(() => {});
  else page.webkitRequestFullscreen?.();
}

window.addEventListener('resize', sendSize);
window.addEventListener('click', goFullscreen);
window.addEventListener('keydown', goFullscreen);

notice.textContent = FULLSCREEN_NOTICE;
setTimeout(() => {
  if (notice.textContent === FULLSCREEN_NOTICE) notice.textContent = '';
}, NOTICE_MS);

// Son 2,6 MB: se piden cuando la pantalla ya está dibujada, y solo si la tele sabe usarlos.
if (document.fonts) {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = '/pantalla.css';
  fonts.media = 'print';
  fonts.onload = () => (fonts.media = 'all');
  document.head.appendChild(fonts);
}

connect();
setTimeout(poll, SOCKET_WAIT_MS);
