# Prototipo de pantallas sincronizadas

Prueba de concepto del extra principal de CEFLIRICS: mandar versículos, letras y videos
guardados a otras pantallas de la red local (TV, PC, TV box) y reproducirlos sincronizados,
sin internet. Es Node puro, sin dependencias. La app final reutiliza esta lógica.

## Cómo correrlo

```bash
node prototype/server.js --token MI_TOKEN
```

Sin `--token`, el servidor inventa uno al azar. Al arrancar muestra las direcciones:

- **Pantallas:** `<IP>:8787`, por ejemplo `192.168.1.39:8787` (abrir en cada TV, PC o TV box de
  la misma red)
- **Operador:** `http://<IP>:8787/?token=MI_TOKEN`
- **Banco de prueba:** `http://localhost:8787/prueba?token=MI_TOKEN`

En la PC de desarrollo el puerto 80 no anduvo por la IP (la conexión se rechaza con un error de
permisos, también desde el navegador), aunque Node escuchaba. No se averiguó la causa.

La primera vez, Windows pide permiso en el firewall para Node: hay que permitir **redes
privadas** para que las otras pantallas puedan conectarse.

Para tener un video de prueba, abrí **Generar video de prueba** desde el operador: graba un
patrón con reloj grande, número de cuadro, barra móvil y un pitido por segundo, y lo sube solo.
También se puede subir cualquier mp4, m4v, webm o mov.

## Cómo funciona

1. **Reloj compartido** (`public/clock.js`): ráfagas de 48 pings con 4 marcas tipo NTP; se usa
   la mediana del 25 % de menor RTT. Resincroniza cada 5 s, estima la deriva en ppm con 60 s
   de historial y aplica los ajustes de a 1 ms/s como máximo (salvo saltos de más de 30 ms).
2. **Estado al aire** (`server.js`): la posición del video se define con un ancla (en la hora
   del servidor `anchorTime` el video está en `anchorPos`). Al reproducir, el inicio se
   programa a T+600 ms para que todas las pantallas lleguen a tiempo.
3. **Pantalla** (`public/pantalla.js`): descarga el video entero a memoria (blob) antes de
   avisar que está lista, mide qué cuadro se ve con `requestVideoFrameCallback` y corrige cada
   200 ms:
   - error menor a 15 ms: nada;
   - de 15 a 120 ms: `playbackRate` entre 0,5 % y 2 % (en Safari/WebKit, micropausa);
   - más de 120 ms: salto con un lead aprendido, y hasta 2 saltos más si quedó a más de 20 ms.
4. **Loop sin cortes** (`public/pantalla.js`): no se usa el loop del navegador, porque cada uno
   tarda distinto en volver al cuadro 0 (se midió hasta ~170 ms). Hay dos `<video>` con el mismo
   blob: el de reserva espera quieto en el cuadro 0, detrás del activo, y arranca cuando la
   posición esperada da la vuelta, adelantado por un lead aprendido (~45 ms). El que terminó se
   rebobina detrás para la próxima vuelta.
5. **Seguridad:** solo quien tiene el token puede mandar comandos o subir archivos. Las
   pantallas solo miran.

## Parámetros de la pantalla

| Parámetro | Qué hace |
|---|---|
| `nombre=TV living` | Nombre que ve el operador |
| `lat=40` | Latencia extra de esa TV en ms (la imagen se adelanta esa cantidad) |
| `debug=1` | Muestra offset, RTT, deriva y error en pantalla (tecla `d`) |
| `skew=2000` | Prueba: reloj desfasado en ms |
| `drift=100` | Prueba: reloj con deriva en ppm |
| `jitter=40` | Prueba: el servidor demora las respuestas hasta esa cantidad de ms |

Doble clic: pantalla completa. Un clic: activa el sonido (los navegadores arrancan en silencio).

## Resultados medidos (2026-11-03, una sola PC)

Banco de prueba con 3 pantallas: una normal, otra a +2 s con +80 ppm y 20 ms de jitter, y otra
a −2 s con −120 ppm y 40 ms de jitter.

| Prueba | p50 | p95 | Máximo | Saltos |
|---|---|---|---|---|
| Video de 5 s, 33 s, primera corrida (6 loops) | 5,4 ms | 20 ms | 24 ms | 0 |
| Video de 5 s, 33 s, segunda corrida (7 loops) | 3,7 ms | 11 ms | 12,9 ms | 0 |
| Antes, con el loop del navegador (video de 20 s, 1 loop) | 12,6 ms | 81,5 ms | 175 ms | 1 a 4 |

- Pausa: las tres pantallas quedan a menos de 15 ms de la posición del servidor.
- Reanudar: hasta ~37 ms de error a los 1,5 s, que la corrección por velocidad va cerrando.

**Ojo con esos números:** se midieron con patrones que tenían un defecto. El codificador H.264 del
navegador tardaba unos 2 s en arrancar, y los archivos quedaban sin cuadros del segundo 0,35 al 2,46
(53 cuadros en 5 s en vez de 150). El generador ya lo corrige. Con un patrón sano y 5 pantallas
reproduciendo en la misma PC, el banco da p95 de 50 ms y máximo de 123 ms (no pasa). No se separó
cuánto de eso es carga de la PC, porque decodificar 3 veces más cuadros en una sola máquina no
representa pantallas independientes. La medición que vale es la de equipos reales.

- Corte del WebSocket: la pantalla sigue reproduciendo con el último estado; el error se
  mantuvo entre −9 y +6 ms durante el corte y la reconexión.
- Recarga completa de la pantalla (como un TV box que se reinicia): menos de 15 ms de error a
  los 2,9 s de abrir la página (reloj listo a los 1,4 s).

## Pendiente

- Medir en Wi-Fi real con una TV o TV box: estas pruebas corren todas en la misma PC.
- Comprobar que un TV box aguanta dos `<video>` cargados a la vez (memoria y decodificador).
- Automatizar el banco con Playwright (Etapa 0.5).
