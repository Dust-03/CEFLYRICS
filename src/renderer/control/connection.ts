import type { Action, OnAirState } from '@shared/state';

const TOKEN_KEY = 'cef-control-token';
const RECONNECT_MS = 1500;
const PING_MS = 5000;
const SILENT_MS = 12_000;

type Pending = { resolve: (value: never) => void; reject: (reason: Error) => void };
type Listeners = {
  onState: (state: OnAirState) => void;
  onOnline: (online: boolean) => void;
  // El PIN cambió: este celular quedó desvinculado.
  onRejected: () => void;
};

export function savedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento no hay nada que olvidar.
  }
}

export async function pair(pin: string): Promise<'ok' | 'pin' | 'locked' | 'offline'> {
  let response: Response;
  try {
    response = await fetch('/api/vincular', { method: 'POST', body: JSON.stringify({ pin }) });
  } catch {
    return 'offline';
  }
  if (response.status === 429) return 'locked';
  if (!response.ok) return 'pin';
  const { token } = (await response.json()) as { token: string };
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    return 'offline';
  }
  return 'ok';
}

export function connect(token: string, { onState, onOnline, onRejected }: Listeners) {
  let socket: WebSocket | null = null;
  let heardAt = 0;
  let nextId = 1;
  let stopped = false;
  const pending = new Map<number, Pending>();

  function open() {
    const current = new WebSocket(`ws://${location.host}/control-ws`);
    socket = current;
    heardAt = Date.now();
    current.onopen = () => current.send(JSON.stringify({ t: 'auth', token }));
    current.onmessage = ({ data }) => {
      heardAt = Date.now();
      const message = JSON.parse(data) as { t?: string; state: OnAirState; id?: number; r: never };
      if (message.t === 'state') {
        onOnline(true);
        onState(message.state);
      } else if (message.id !== undefined) {
        pending.get(message.id)?.resolve(message.r);
        pending.delete(message.id);
      }
    };
    current.onclose = ({ code }) => {
      for (const { reject } of pending.values()) reject(new Error('Sin conexión'));
      pending.clear();
      onOnline(false);
      if (code === 4001) {
        stopped = true;
        onRejected();
      } else if (!stopped) setTimeout(open, RECONNECT_MS);
    };
  }

  const ticker = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send('{"t":"ping"}');
    if (Date.now() - heardAt > SILENT_MS) socket.close();
  }, PING_MS);

  open();

  return {
    call<T>(method: string, ...args: unknown[]) {
      return new Promise<T>((resolve, reject) => {
        if (socket?.readyState !== WebSocket.OPEN) {
          reject(new Error('Sin conexión'));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve: resolve as (value: never) => void, reject });
        socket.send(JSON.stringify({ id, m: method, a: args }));
      });
    },
    dispatch(action: Action) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'dispatch', a: action }));
    },
    stop() {
      stopped = true;
      clearInterval(ticker);
      socket?.close();
    },
  };
}

export type Connection = ReturnType<typeof connect>;
