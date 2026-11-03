// Utilidades compartidas por el operador, el generador y el banco de prueba.

export function getToken() {
  const fromUrl = new URLSearchParams(location.search).get('token');
  try {
    if (fromUrl) sessionStorage.setItem('cef-token', fromUrl);
    return fromUrl || sessionStorage.getItem('cef-token') || '';
  } catch {
    return fromUrl || '';
  }
}

export function saveToken(token) {
  try {
    sessionStorage.setItem('cef-token', token);
  } catch {
    // Sin almacenamiento: el token vive solo en esta página.
  }
}

// Conexión de operador con reconexión automática.
export function connectOperator({ token, onMessage, onStatus }) {
  let ws = null;
  let closedByUser = false;
  let delay = 500;
  const send = (obj) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      delay = 500;
      send({ t: 'hello', role: 'operator', token });
      onStatus?.('conectado');
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'error') {
        closedByUser = true;
        onStatus?.('error', msg.message);
      }
      onMessage(msg);
    };
    ws.onclose = () => {
      if (closedByUser) return;
      onStatus?.('desconectado');
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 2000);
    };
  };
  open();
  return {
    send,
    cmd: (action, extra = {}) => send({ t: 'cmd', action, ...extra }),
    close: () => {
      closedByUser = true;
      ws?.close();
    },
  };
}

// Sube un archivo con progreso. Devuelve una promesa con la respuesta del servidor.
export function uploadFile(name, blob, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/media/${encodeURIComponent(name)}`);
    xhr.setRequestHeader('x-token', token);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Respuesta vacía.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.send(blob);
  });
}

// Nombre de archivo apto para el servidor: sin acentos ni espacios.
export function safeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120);
}

export function formatTime(sec) {
  if (!Number.isFinite(sec)) return '--:--.-';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export const fmt = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
