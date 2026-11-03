#!/usr/bin/env node
// Prototipo de pantallas sincronizadas de CEFLIRICS (Etapa 0.4).
// Servidor HTTP + WebSocket sin dependencias: reloj maestro, estado "al aire",
// medios con HTTP Range y subida de archivos protegida con token de operador.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.CEF_PORT || 8787);
const TOKEN = String(args.token || process.env.CEF_TOKEN || crypto.randomBytes(9).toString('base64url'));
const START_LEAD_MS = 600; // el inicio se programa a T+600 ms para que todas las pantallas lleguen
const PUBLIC_DIR = path.join(__dirname, 'public');
const MEDIA_DIR = path.join(__dirname, 'media');
const MAX_UPLOAD_BYTES = 4 * 1024 ** 3;
const MAX_FRAME_BYTES = 1024 * 1024;
const IDLE_TIMEOUT_MS = 20000;

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Reloj maestro: monotónico, en milisegundos. Las pantallas se sincronizan contra este valor.
const now = () => performance.now();

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};
const ALIASES = {
  '/': '/operador.html',
  '/pantalla': '/pantalla.html',
  '/prueba': '/prueba.html',
  '/generar': '/generar.html',
};

// Estado "al aire". La posición del video se deriva de un ancla: en la hora de servidor
// anchorTime el video está en anchorPos; si playing, avanza a velocidad 1 desde ahí.
const state = {
  rev: 0,
  media: null,
  duration: 0,
  playing: false,
  anchorTime: 0,
  anchorPos: 0,
  loop: true,
  text: null,
  black: false,
};

function positionAt(t) {
  if (!state.playing || t <= state.anchorTime) return state.anchorPos;
  let pos = state.anchorPos + (t - state.anchorTime) / 1000;
  if (state.duration > 0) pos = state.loop ? pos % state.duration : Math.min(pos, state.duration);
  return pos;
}

// ---------- WebSocket mínimo (RFC 6455, solo frames de texto sin fragmentar) ----------

const conns = new Set();
let nextConnId = 1;

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class Conn {
  constructor(socket, ip) {
    this.id = nextConnId++;
    this.socket = socket;
    this.ip = ip;
    this.role = null;
    this.name = '';
    this.simJitter = 0;
    this.ready = null;
    this.stats = null;
    this.buf = Buffer.alloc(0);
    this.lastSeen = Date.now();
    socket.setNoDelay(true);
    // La hora de llegada se toma antes de parsear, para que t1 sea lo más preciso posible.
    socket.on('data', (chunk) => this.onData(chunk, now()));
    socket.on('close', () => this.onClose());
    socket.on('error', () => socket.destroy());
    conns.add(this);
  }

  onData(chunk, recvTime) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > MAX_FRAME_BYTES) return this.close();
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = this.buf.subarray(off, off + len);
      if (masked) {
        const mask = this.buf.subarray(maskOff, maskOff + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(off + len);

      if (opcode === 0x1) this.onMessage(payload.toString('utf8'), recvTime);
      else if (opcode === 0x8) return this.close();
      else if (opcode === 0x9) this.write(encodeFrame(0xa, payload));
    }
  }

  write(frame) {
    if (!this.socket.destroyed) this.socket.write(frame);
  }

  send(obj) {
    this.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj))));
  }

  close() {
    if (!this.socket.destroyed) {
      this.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      this.socket.destroy();
    }
  }

  onClose() {
    conns.delete(this);
    if (this.role === 'display') broadcastDisplays();
  }

  onMessage(text, t1) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'ping': {
        // t2 se marca antes del retardo simulado: así el jitter cae en el tramo de vuelta,
        // igual que una red asimétrica real.
        const t2 = now();
        const reply = () => this.send({ t: 'pong', id: msg.id, t0: msg.t0, t1, t2 });
        if (this.simJitter > 0) setTimeout(reply, Math.random() * this.simJitter);
        else reply();
        break;
      }
      case 'hello':
        this.onHello(msg);
        break;
      case 'cmd':
        if (this.role !== 'operator') return this.send({ t: 'error', message: 'Solo el operador puede enviar comandos' });
        handleCommand(msg);
        break;
      case 'ready':
        this.onReady(msg);
        break;
      case 'stats':
        if (msg.stats && typeof msg.stats === 'object') this.stats = msg.stats;
        break;
    }
  }

  onHello(msg) {
    if (msg.role === 'operator') {
      if (!checkToken(msg.token)) {
        this.send({ t: 'error', message: 'Token de operador inválido' });
        return this.close();
      }
      this.role = 'operator';
      this.name = 'Operador';
    } else {
      this.role = 'display';
      this.name = String(msg.name || `Pantalla ${this.id}`).slice(0, 60);
      this.simJitter = clamp(Number(msg.simJitter) || 0, 0, 500);
      if (msg.ready) this.onReady(msg.ready);
    }
    this.send({ t: 'welcome', id: this.id, role: this.role });
    this.send({ t: 'state', state });
    if (this.role === 'operator') this.send({ t: 'displays', displays: displayList() });
    else broadcastDisplays();
  }

  onReady(msg) {
    const duration = Number(msg.duration);
    this.ready = { media: String(msg.media || ''), duration: Number.isFinite(duration) ? duration : 0 };
    if (this.ready.media === state.media && this.ready.duration > 0 && !state.duration) {
      state.duration = this.ready.duration;
      broadcastState();
    }
  }
}

function checkToken(candidate) {
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function broadcast(obj, role) {
  const frame = encodeFrame(0x1, Buffer.from(JSON.stringify(obj)));
  for (const c of conns) if (c.role && (!role || c.role === role)) c.write(frame);
}

function broadcastState() {
  state.rev++;
  broadcast({ t: 'state', state });
}

function displayList() {
  return [...conns]
    .filter((c) => c.role === 'display')
    .map((c) => ({ id: c.id, name: c.name, ip: c.ip, ready: c.ready, stats: c.stats }));
}

function broadcastDisplays() {
  broadcast({ t: 'displays', displays: displayList() }, 'operator');
}

function handleCommand(msg) {
  const t = now();
  switch (msg.action) {
    case 'load': {
      const media = msg.media == null ? null : String(msg.media);
      if (media && (!isSafeName(media) || !fs.existsSync(path.join(MEDIA_DIR, media)))) return;
      // Con el mismo video se conserva la duración: las pantallas no la reenvían si ya lo tienen.
      const duration = media === state.media ? state.duration : 0;
      Object.assign(state, { media, duration, playing: false, anchorTime: t, anchorPos: 0 });
      break;
    }
    case 'play': {
      if (!state.media || state.playing) return;
      const pos = Number.isFinite(msg.position) ? msg.position : positionAt(t);
      Object.assign(state, { playing: true, anchorPos: Math.max(0, pos), anchorTime: t + START_LEAD_MS });
      break;
    }
    case 'pause':
      if (!state.playing) return;
      Object.assign(state, { playing: false, anchorPos: positionAt(t), anchorTime: t });
      break;
    case 'seek': {
      const pos = Math.max(0, Number(msg.position) || 0);
      Object.assign(state, { anchorPos: pos, anchorTime: state.playing ? t + START_LEAD_MS : t });
      break;
    }
    case 'loop': {
      // Se reancla en la posición actual para que el cambio no produzca un salto.
      if (state.playing && t > state.anchorTime) Object.assign(state, { anchorPos: positionAt(t), anchorTime: t });
      state.loop = !!msg.value;
      break;
    }
    case 'text':
      state.text = msg.text
        ? { title: String(msg.text.title || '').slice(0, 200), body: String(msg.text.body || '').slice(0, 5000) }
        : null;
      break;
    case 'black':
      state.black = !!msg.value;
      break;
    default:
      return;
  }
  broadcastState();
}

setInterval(() => {
  const limit = Date.now() - IDLE_TIMEOUT_MS;
  for (const c of conns) if (c.lastSeen < limit) c.close();
  broadcastDisplays();
}, 1000);

// ---------- HTTP ----------

function isSafeName(name) {
  return /^[\w-][\w.-]{0,119}$/.test(name) && Object.hasOwn(MEDIA_TYPES, path.extname(name).toLowerCase());
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}`);
  }
  return urls.length ? urls : [`http://localhost:${PORT}`];
}

function listMedia(res) {
  const files = fs
    .readdirSync(MEDIA_DIR)
    .filter(isSafeName)
    .map((name) => ({ name, size: fs.statSync(path.join(MEDIA_DIR, name)).size }));
  json(res, 200, files);
}

function uploadMedia(req, res, name) {
  if (!checkToken(req.headers['x-token'])) return json(res, 401, { error: 'Token inválido' });
  if (!isSafeName(name)) return json(res, 400, { error: 'Nombre o formato no permitido (mp4, m4v, webm, mov)' });
  if (Number(req.headers['content-length']) > MAX_UPLOAD_BYTES) return json(res, 413, { error: 'Archivo demasiado grande' });
  const dest = path.join(MEDIA_DIR, name);
  const tmp = `${dest}.${process.pid}.part`;
  const out = fs.createWriteStream(tmp);
  let received = 0;
  const fail = (status, error) => {
    out.destroy();
    fs.rm(tmp, { force: true }, () => {});
    if (!res.headersSent) json(res, status, { error });
  };
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) {
      req.destroy();
      fail(413, 'Archivo demasiado grande');
    }
  });
  req.on('aborted', () => fail(400, 'Subida interrumpida'));
  out.on('error', () => fail(500, 'No se pudo guardar el archivo'));
  out.on('finish', () => {
    fs.rename(tmp, dest, (err) => {
      if (err) return fail(500, 'No se pudo guardar el archivo');
      json(res, 201, { name, size: received });
    });
  });
  req.pipe(out);
}

function serveMedia(req, res, name) {
  if (!isSafeName(name)) return json(res, 404, { error: 'No encontrado' });
  const file = path.join(MEDIA_DIR, name);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return json(res, 404, { error: 'No encontrado' });
  }
  const headers = {
    'Content-Type': MEDIA_TYPES[path.extname(name).toLowerCase()],
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), stat.size - 1);
    } else {
      start = Math.max(0, stat.size - Number(range[2]));
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

function serveStatic(req, res, pathname) {
  const rel = ALIASES[pathname] || pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return json(res, 404, { error: 'No encontrado' });
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return json(res, 404, { error: 'No encontrado' });
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    if (isGet && p === '/api/media') return listMedia(res);
    if (isGet && p === '/api/info') return json(res, 200, { urls: lanUrls() });
    if (req.method === 'PUT' && p.startsWith('/api/media/')) return uploadMedia(req, res, decodeURIComponent(p.slice(11)));
    if (isGet && p.startsWith('/media/')) return serveMedia(req, res, decodeURIComponent(p.slice(7)));
    if (isGet) return serveStatic(req, res, p);
    json(res, 405, { error: 'Método no permitido' });
  } catch {
    if (!res.headersSent) json(res, 400, { error: 'Pedido inválido' });
  }
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws') || !key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  new Conn(socket, String(socket.remoteAddress || '').replace(/^::ffff:/, ''));
});

server.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls();
  console.log('CEFLIRICS · prototipo de pantallas sincronizadas');
  console.log(`  Operador:  ${urls[0]}/?token=${TOKEN}`);
  for (const u of urls) console.log(`  Pantallas: ${u}/pantalla`);
  console.log(`  Banco de prueba: http://localhost:${PORT}/prueba?token=${TOKEN}`);
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return out;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
