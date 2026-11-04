// Temporizadores: de duración ("5 minutos") o hasta una hora ("hasta las 19:00").
import { parseTheme, type Theme } from './theme';

export type TimerConfig = {
  id: number;
  name: string;
  kind: 'duration' | 'clock';
  seconds: number;
  clock: string;
  message: string;
};

// Un temporizador en marcha. `endsAt` es la hora real en que termina; en pausa es null y lo que
// falta queda en `remainingMs`.
export type TimerRun = {
  id: string;
  label: string;
  message: string;
  endsAt: number | null;
  remainingMs: number;
  theme?: Theme;
};

export type TimerLayout = 'full' | 'corner';
export type ShownTimer = { id: string; layout: TimerLayout };

export function remainingMs(run: TimerRun, now: number) {
  return run.endsAt === null ? run.remainingMs : Math.max(0, run.endsAt - now);
}

export function formatRemaining(ms: number) {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Próxima vez que el reloj marca esa hora: hoy si todavía no pasó, si no mañana.
export function nextClockTarget(clock: string, now: number) {
  const match = CLOCK.exec(clock);
  if (!match) return null;
  const target = new Date(now);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

// Pone en marcha un temporizador guardado. Null si la hora elegida no es válida.
export function createTimerRun(timer: TimerConfig, now: number, theme?: Theme): TimerRun | null {
  const base = { id: String(timer.id), label: timer.name, message: timer.message, theme };
  if (timer.kind === 'clock') {
    const endsAt = nextClockTarget(timer.clock, now);
    return endsAt ? { ...base, endsAt, remainingMs: endsAt - now } : null;
  }
  const ms = timer.seconds * 1000;
  return { ...base, endsAt: now + ms, remainingMs: ms };
}

// Lo que llega por IPC no se da por bueno.
export function parseTimerRun(input: unknown): TimerRun | null {
  if (typeof input !== 'object' || input === null) return null;
  const { id, label, message, endsAt, remainingMs: remaining, theme } = input as Record<string, unknown>;
  if (typeof id !== 'string' || typeof label !== 'string' || typeof message !== 'string') return null;
  if (endsAt !== null && (typeof endsAt !== 'number' || !Number.isFinite(endsAt))) return null;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0) return null;
  const parsedTheme = theme === undefined ? undefined : parseTheme(theme);
  if (parsedTheme === null) return null;
  return {
    ...(parsedTheme ? { theme: parsedTheme } : {}),
    id: id.slice(0, 40),
    label: label.slice(0, 100),
    message: message.slice(0, 200),
    endsAt,
    remainingMs: remaining,
  };
}
