// Transmisión: lo que necesitan el servidor de la red y su menú.
export const DEFAULT_LAN_PORT = 8787;

export type LanAddress = { ip: string; adapter: string; mac: string };
export type LanScreen = { id: number; ip: string; device: string; width: number; height: number };
export type LanStatus = 'on' | 'off' | 'busy';

export type LanInfo = {
  status: LanStatus;
  port: number;
  addresses: LanAddress[];
  // La IP con la que se conectó la última pantalla, si ya no es la de esta PC.
  previousIp: string | null;
  screens: LanScreen[];
  // Si las teles reproducen el audio de los videos.
  sound: boolean;
  // Para vincular un celular como control.
  pin: string;
  controls: number;
  // Si la PC tiene el instalador de la app para ofrecerlo.
  apk: boolean;
};

export type LanApi = {
  info: () => Promise<LanInfo>;
  setPort: (port: number) => void;
  setEnabled: (enabled: boolean) => void;
  setSound: (sound: boolean) => void;
  renewPin: () => void;
  onInfo: (listener: (info: LanInfo) => void) => () => void;
};

// Por debajo de 1024 Windows suele negarlos.
export function parsePort(input: unknown) {
  const port = Number(input);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

export function lanAddress(ip: string, port: number) {
  return `${ip}:${port}`;
}

type NetworkInterface = { address: string; family: string | number; internal: boolean; mac: string };

// Los adaptadores que crean las máquinas virtuales y las VPN no llegan a la tele.
const VIRTUAL = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|tailscale|zerotier|hamachi|bluetooth/i;

function networkRank(ip: string) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
}

// Las direcciones de esta PC en la red, primero la que más probablemente vea la tele.
export function listAddresses(interfaces: Record<string, NetworkInterface[] | undefined>): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [adapter, entries] of Object.entries(interfaces)) {
    for (const { address, family, internal, mac } of entries ?? []) {
      const ipv4 = family === 'IPv4' || family === 4;
      if (ipv4 && !internal && !address.startsWith('169.254.')) found.push({ ip: address, adapter, mac });
    }
  }
  const real = found.filter(({ adapter }) => !VIRTUAL.test(adapter));
  return (real.length ? real : found).sort((a, b) => networkRank(a.ip) - networkRank(b.ip));
}

export function deviceName(userAgent: string) {
  if (/tizen|samsung/i.test(userAgent)) return 'Tele Samsung';
  if (/web0s|webos|netcast/i.test(userAgent)) return 'Tele LG';
  if (/android.*(tv|aft|box)|bravia|googletv/i.test(userAgent)) return 'Android TV';
  if (/iphone|ipad/i.test(userAgent)) return 'iPhone o iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'PC con Windows';
  if (/macintosh/i.test(userAgent)) return 'Mac';
  if (/tv/i.test(userAgent)) return 'Tele';
  return 'Navegador';
}
