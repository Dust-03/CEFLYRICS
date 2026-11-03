# Etapa 0: Fundaciones (2-3 semanas)

Objetivo: dejar el repositorio, las herramientas y el esqueleto de la app listos para que la
Etapa 1 (MVP de proyección) solo tenga que agregar funciones, y validar temprano el riesgo
técnico más grande: la sincronía de video en la LAN.

## Pasos

| # | Paso | Resultado | Criterio de aceptación |
|---|------|-----------|------------------------|
| 0.1 | Herramientas | Node 26 LTS en `D:\Programas\nodejs`, Git en `D:\Programas\Git`, cachés de npm y Electron en `D:\Programas` | `node -v`, `npm -v` y `git --version` responden (hecho) |
| 0.2 | Repositorio | `git init`, `LICENSE` (GPL-3.0), `README.md`, `.gitignore`, `.editorconfig` | Primer commit en `main` |
| 0.3 | Especificación sala limpia | `docs/investigacion.md`: (a) tabla de módulos con criterios de aceptación, (b) flujos del operador, (c) modelo de datos, (d) fuentes públicas usadas, (e) preguntas abiertas | Ninguna fuente es código, recurso o texto de Holyrics (hecho) |
| 0.4 | Prototipo de sincronía | `prototype/server.js` + `public/` (Node sin dependencias): reloj NTP-like, inicio a T+600 ms, precarga a blob, deriva cada 200 ms, token de operador | Dos pestañas con reloj desfasado ±2 s reproducen el mismo video con diferencia ≤34 ms (hecho; probado con un equipo real, ver `prototype/README.md`) |
| 0.5 | Prueba automática de sincronía | Playwright con 3 páginas y relojes falsos desfasados (`npm run test:sync`, usa Edge) | La prueba mide la diferencia real de posición y falla si p95 > 34 ms (hecho) |
| 0.6 | Esqueleto Electron | electron-vite + TypeScript + Svelte 5. Carpetas `src/main`, `src/preload`, `src/renderer/operator`, `src/renderer/output`, `src/shared`, `packages/render-engine` | `npm run dev` abre la ventana del operador (hecho) |
| 0.7 | Store de estado + IPC tipado | Store único en main ("lo que está al aire"), eventos tipados hacia los renderers | Un cambio en el operador llega a la salida en <50 ms (hecho) |
| 0.8 | Salida por monitor | Ventana de salida a pantalla completa en el segundo monitor, renderizada con `packages/render-engine` | F10 negro, ESC salir; la salida se ve igual en Electron y en un navegador (hecho) |
| 0.9 | Base de datos | better-sqlite3 + migraciones versionadas + prueba de FTS5 | Prueba que crea la base, inserta y busca con FTS5 (hecho) |
| 0.10 | Calidad | ESLint, Prettier, Vitest, `svelte-check` | `npm run check` y `npm test` pasan (hecho) |
| 0.11 | Empaquetado de humo | electron-builder NSIS por usuario | El instalador instala y abre la app en una PC limpia |

## Orden

0.1 → 0.2 → 0.3 y 0.4 en paralelo → 0.5 → 0.6 → 0.7 → 0.8 → 0.9 → 0.10 → 0.11.
El prototipo (0.4-0.5) va antes del esqueleto porque es el riesgo más alto: si la sincronía no
alcanza el objetivo, conviene saberlo antes de construir sobre ella.

## Riesgos

- better-sqlite3 13 trae binarios Node-API: no hace falta recompilarlo ni Build Tools. Riesgo descartado.
- Las pruebas de sincronía en una sola PC no reflejan el Wi-Fi real: hace falta una prueba
  manual con al menos una TV o TV box antes de cerrar la Etapa 2.
- Licencia GPL-3.0: revisar la licencia de cada dependencia nueva antes de agregarla.

## Fuera de esta etapa

Biblia, letras, temas, playlist, multimedia, remoto PWA, mDNS/QR, NDI: Etapa 1 en adelante.
