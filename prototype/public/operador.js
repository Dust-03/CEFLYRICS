// Consola del operador del prototipo: medios, reproducción, texto y estado de las pantallas.
import { ClockSync } from './clock.js';
import { connectOperator, fmt, formatTime, getToken, safeFileName, saveToken, uploadFile } from './comun.js';

const $ = (id) => document.getElementById(id);
let token = getToken();
let conn = null;
let state = null;
let clock = null;

function start() {
  if (!token) {
    $('panel-token').hidden = false;
    return;
  }
  $('link-generar').href = `/generar?token=${encodeURIComponent(token)}`;
  $('link-prueba').href = `/prueba?token=${encodeURIComponent(token)}`;
  conn = connectOperator({
    token,
    onStatus: (status, message) => {
      const chip = $('conexion');
      chip.textContent = status === 'error' ? 'token inválido' : status;
      chip.className = `chip ${status === 'conectado' ? 'ok' : status === 'error' ? 'err' : 'warn'}`;
      if (status === 'conectado') clock.start();
      if (status === 'error') {
        $('panel-token').hidden = false;
        $('token-error').textContent = message;
      }
    },
    onMessage: (msg) => {
      if (msg.t === 'pong') clock.handlePong(msg);
      else if (msg.t === 'state') onState(msg.state);
      else if (msg.t === 'displays') renderDisplays(msg.displays);
    },
  });
  // El operador también sincroniza su reloj, solo para mostrar la posición en vivo.
  clock = new ClockSync({ send: conn.send, burstSize: 16 });
  loadMediaList();
}

function onState(next) {
  state = next;
  $('loop').checked = state.loop;
  $('btn-negro').classList.toggle('primario', state.black);
  const chip = $('estado-video');
  chip.textContent = !state.media
    ? 'sin video'
    : state.playing
      ? `al aire: ${state.media}`
      : `en pausa: ${state.media}`;
  chip.className = `chip ${state.playing ? 'ok' : ''}`;
  for (const el of document.querySelectorAll('.medio')) el.classList.toggle('al-aire', el.dataset.name === state.media);
}

function positionNow() {
  if (!state || !clock?.locked) return NaN;
  const t = clock.serverNow();
  if (!state.playing || t <= state.anchorTime) return state.anchorPos;
  let pos = state.anchorPos + (t - state.anchorTime) / 1000;
  if (state.duration > 0) pos = state.loop ? pos % state.duration : Math.min(pos, state.duration);
  return pos;
}

function renderDisplays(list) {
  $('cant-pantallas').textContent = String(list.length);
  const rows = list.map((d) => {
    const s = d.stats || {};
    const ready = state?.media && d.ready?.media === state.media;
    const status = ready
      ? '<span class="chip ok">lista</span>'
      : state?.media
        ? `<span class="chip warn">cargando ${Math.round((s.progress || 0) * 100)} %</span>`
        : '<span class="chip">esperando</span>';
    const err = Math.abs(s.errMs);
    const errClass = !Number.isFinite(err) ? '' : err < 15 ? 'ok' : err < 33 ? 'warn' : 'err';
    return `<tr>
      <td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.ip)}</td><td>${status}</td>
      <td>${fmt(s.offsetMs)} ms</td><td>${fmt(s.rttMs)} ms</td><td>${fmt(s.driftPpm)} ppm</td>
      <td><span class="chip ${errClass}">${fmt(s.errMs)} ms</span></td>
      <td>${fmt(s.rate, 3)}</td><td>${s.seeks ?? '—'}</td></tr>`;
  });
  $('pantallas').innerHTML = rows.join('') || '<tr><td colspan="9" class="muted">Ninguna pantalla conectada</td></tr>';
}

async function loadMediaList() {
  const files = await fetch('/api/media').then((r) => r.json());
  const box = $('medios');
  box.innerHTML = '';
  if (!files.length) box.innerHTML = '<p class="muted">No hay videos. Subí uno o generá el patrón de prueba.</p>';
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'medio';
    row.dataset.name = f.name;
    row.classList.toggle('al-aire', f.name === state?.media);
    row.innerHTML = `<span></span><small class="muted">${(f.size / 1048576).toFixed(1)} MB</small><button>Cargar</button>`;
    row.querySelector('span').textContent = f.name;
    row.querySelector('button').onclick = () => conn.cmd('load', { media: f.name });
    box.append(row);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

$('form-token').onsubmit = (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  saveToken(token);
  location.search = `?token=${encodeURIComponent(token)}`;
};
$('btn-play').onclick = () => conn.cmd('play');
$('btn-pausa').onclick = () => conn.cmd('pause');
$('btn-inicio').onclick = () => conn.cmd('seek', { position: 0 });
$('btn-ir').onclick = () => conn.cmd('seek', { position: Number($('ir-a').value) || 0 });
$('loop').onchange = (e) => conn.cmd('loop', { value: e.target.checked });
$('btn-texto').onclick = () =>
  conn.cmd('text', { text: { title: $('texto-titulo').value, body: $('texto-cuerpo').value } });
$('btn-limpiar').onclick = () => conn.cmd('text', { text: null });
$('btn-negro').onclick = () => conn.cmd('black', { value: !state?.black });

$('archivo').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const name = safeFileName(file.name);
  try {
    await uploadFile(name, file, token, (p) => ($('subida').textContent = `Subiendo ${Math.round(p * 100)} %`));
    $('subida').textContent = `Subido: ${name}`;
    loadMediaList();
  } catch (err) {
    $('subida').textContent = `Error: ${err.message}`;
  }
  e.target.value = '';
};

document.addEventListener('keydown', (e) => {
  if (!conn || e.target.matches('input, textarea')) return;
  if (e.key === 'F10') {
    e.preventDefault();
    conn.cmd('black', { value: !state?.black });
  } else if (e.key === 'Escape') {
    conn.cmd('text', { text: null });
  } else if (e.key === ' ') {
    e.preventDefault();
    conn.cmd(state?.playing ? 'pause' : 'play');
  }
});

fetch('/api/info')
  .then((r) => r.json())
  .then((info) => ($('url-pantallas').textContent = info.urls.join('  ·  ')));

setInterval(() => ($('posicion').textContent = formatTime(positionNow())), 100);

start();
