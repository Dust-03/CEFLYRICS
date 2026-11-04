import { describe, expect, it } from 'vitest';
import { deviceName, lanAddress, listAddresses, parsePort } from '@shared/lan';

const entry = (address: string, extra = {}) => ({
  address,
  family: 'IPv4',
  internal: false,
  mac: 'aa:bb:cc:dd:ee:ff',
  ...extra,
});

describe('puerto', () => {
  it('acepta solo puertos que un programa común puede abrir', () => {
    expect(parsePort('8787')).toBe(8787);
    expect(parsePort(1024)).toBe(1024);
    expect(parsePort(65535)).toBe(65535);
    for (const bad of ['80', 1023, 65536, 'abc', '', null, undefined, 8787.5]) expect(parsePort(bad)).toBeNull();
  });

  it('arma la dirección que se escribe en la tele', () => {
    expect(lanAddress('192.168.1.39', 8787)).toBe('192.168.1.39:8787');
  });
});

describe('direcciones de la PC', () => {
  it('saltea las internas, las de IPv6 y las que Windows inventa sin red', () => {
    const list = listAddresses({
      Ethernet: [
        entry('fe80::1', { family: 'IPv6' }),
        entry('169.254.10.2'),
        entry('192.168.1.39', { mac: '11:22:33:44:55:66' }),
      ],
      'Loopback Pseudo-Interface 1': [entry('127.0.0.1', { internal: true })],
    });
    expect(list).toEqual([{ ip: '192.168.1.39', adapter: 'Ethernet', mac: '11:22:33:44:55:66' }]);
  });

  it('deja afuera las máquinas virtuales y las VPN', () => {
    const list = listAddresses({
      'vEthernet (WSL)': [entry('172.20.0.1')],
      'VMware Network Adapter VMnet8': [entry('192.168.80.1')],
      'Wi-Fi': [entry('10.0.0.5')],
    });
    expect(list.map(({ ip }) => ip)).toEqual(['10.0.0.5']);
  });

  it('si solo hay adaptadores raros, los muestra igual', () => {
    expect(listAddresses({ 'vEthernet (Puente)': [entry('192.168.1.2')] })).toHaveLength(1);
  });

  it('pone primero la red típica de una casa o una iglesia', () => {
    const list = listAddresses({ A: [entry('10.1.1.1')], B: [entry('172.16.0.4')], C: [entry('192.168.0.9')] });
    expect(list.map(({ ip }) => ip)).toEqual(['192.168.0.9', '10.1.1.1', '172.16.0.4']);
  });

  it('sin red devuelve la lista vacía', () => {
    expect(listAddresses({})).toEqual([]);
  });
});

describe('nombre de la pantalla', () => {
  it('reconoce las teles más comunes', () => {
    expect(deviceName('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit')).toBe('Tele Samsung');
    expect(deviceName('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit')).toBe('Tele LG');
    expect(deviceName('Mozilla/5.0 (Linux; Android 9; BRAVIA 4K) AppleWebKit')).toBe('Android TV');
    expect(deviceName('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit')).toBe('Android');
    expect(deviceName('algo desconocido')).toBe('Navegador');
  });
});
