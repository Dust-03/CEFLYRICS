# CEFLYRICS: software de proyección para iglesias (clon propio, de escritorio)

## Objetivo
Programa de escritorio para proyectar versículos, letras, videos y anuncios en el culto,
con funcionalidad equivalente a Holyrics más extras propios. Idioma de la UI y del código
comentado: español (Argentina). Nombres de variables y APIs en inglés.

## Decisiones tomadas (2026-11-03)
- Licencia: **GPL-3.0**; toda dependencia debe ser compatible con GPL-3.0.
- **No se copia código de FreeShow, OpenLP ni otro proyecto GPL ajeno.** Así el código queda todo
  propio y se puede agregar la excepción de enlace que necesita la DLL de NDI (ver sección (e) del
  informe). Mirar qué funciones ofrecen esos programas sí está permitido.
- UI del operador: **Svelte** (Svelte 5 + Vite).
- El programa se llama CEFLYRICS, con y. Quedan con i, a propósito, la carpeta del proyecto, la de la
  firma y la identidad de la app Android (`ar.ceflirics.control`), que no se ve y permite actualizarla.
- Carpeta del proyecto: `D:\Proyectos Claude\CEFLIRICS`.
- Logo de la iglesia: `assets/logo-cef.svg`, calcado de su imagen, sin color fijo (`currentColor`).
  Es de la iglesia, no un recurso libre. `assets/logo-ceflyrics.svg` le suma "lyrics" en trazos, con
  la fuente Yellowtail (Apache-2.0).
- `prototype/` y `docs/investigacion.md` se crearon en la Etapa 0
  (ver `docs/plan-etapa-0.md`). Las preguntas abiertas están en la sección (e) del informe.

## Extra principal
Enviar versículos, letras y VIDEOS GUARDADOS a otras pantallas de la red local (TV, PC,
TV box) con reproducción sincronizada, sin internet. Prototipo Node sin dependencias en
`prototype/` (server.js + public/), a escribir en la Etapa 0, con: reloj compartido
(ping/pong NTP-like), inicio programado a T+600 ms, precarga del video a blob, corrección de
deriva cada 200 ms, token solo para el operador. La app final reutiliza esa lógica.

## Reglas legales (obligatorias)
- Desarrollo en sala limpia: implementar desde la especificación de `docs/investigacion.md`.
- NO descompilar ni copiar código, íconos, fuentes (CMG Sans), textos de ayuda, traducciones de
  UI, nombre, logo o colores de Holyrics. NO leer ni usar el repo `msb7-jpg/holyrics-analysis`
  (código descompilado).
- Se permite: replicar funciones y flujos, y ser interoperable (importar el JSON que exporta
  Holyrics; opcionalmente una API de nombres compatibles, a partir de la documentación pública).
- Contenido incluido de fábrica SOLO si es dominio público: Reina-Valera 1909, KJV/WEB/BSB.
  RVR1960 (marca registrada de SBU), RVR95, NVI, NTV, LBLA/NBLA: NO se incluyen. Se ofrecen
  por importador, con aviso de responsabilidad del usuario.
- No incluir canciones modernas. Importadores sí (TXT, OpenLyrics, JSON de Holyrics).
- NDI: link a ndi.video, leyenda "NDI® is a registered trademark of Vizrt NDI AB" en la UI y
  en Acerca de, DLL junto a la app. Prohibido NDI en Android/TV box (requiere licencia comercial).

## Stack
- Electron + TypeScript. UI del operador en Svelte.
- Motor de render ÚNICO (HTML/CSS + Canvas/WebGL): el mismo bundle corre en ventanas de
  proyector, navegadores de la LAN, OBS Browser Source y NDI offscreen.
- SQLite (better-sqlite3) + FTS5. Medios en carpeta de la app con hash de contenido.
- Fastify + ws, mDNS (bonjour-service), QR (qrcode), HTTP Range para medios.
- NDI: @stagetimerio/grandiose (Apache-2.0) sobre BrowserWindow offscreen.
- FFmpeg (LGPL) para miniaturas y proxies H.264 1080p. whisper.cpp local para voz.
- Empaquetado: electron-builder NSIS de un clic y para toda la PC, con la regla de firewall en el
  instalador (`scripts/installer.nsh`). Control móvil: APK propio, ver `docs/plan-control-movil.md`.

## Arquitectura
Proceso main (Node): store único de estado ("lo que está al aire"), SQLite, servidor
REST+WebSocket, servicio de sincronía (reloj maestro + medios), NDI sender, workers.
Renderers: Operador, Salida x N, y clientes LAN como PWA (remote, stage, "seguí el texto",
pantallas sincronizadas).

## Sincronización (objetivo: p95 ≤34 ms, un cuadro a 30 fps, en Wi-Fi 5 GHz; ideal <15 ms)
- Reloj: 4 marcas NTP con performance.now(), ráfagas de 32-64, mediana del 25 % de menor RTT,
  deriva en ppm, slew gradual (<=1 ms/s).
- Bandas: <15 ms nada; 15-120 ms playbackRate 1±0,5-2 %; >120-500 ms seek con lead aprendido.
  En Safari/WebKit usar micropausa en vez de playbackRate.
- requestVideoFrameCallback para medir mediaTime. Calibrar latencia de salida por pantalla.
- Reconexión de una pantalla: resincronizar en <2 s.

## Datos (modelo en docs/investigacion.md, sección (c))
Biblias (vid BBCCCVVV, FTS5, mapa de versificación RV1909 vs KJV: 18 casos), canciones
(slides con etiqueta V/C/P, comentarios `//` solo en retorno, múltiples arreglos), temas JSON,
medios, cultos recurrentes (RRULE), playlists, miembros/roles/asignaciones, play_log, dispositivos.

## Prioridades
MVP: salidas por monitor, motor de render, Biblia, letras, temas, playlist, multimedia con
precarga, alertas/cuenta regresiva, stage view, remoto PWA con QR+mDNS, pantallas sincronizadas.
Siguiente: importadores, cultos/escalas/informes, anuncios, NDI, API local, Ctrl+K, favoritos.
Opcional: quiz/sorteo, scripts sandbox, voz→versículo, subtítulos en vivo, nube.

## Convenciones de trabajo
- Plan corto antes de cada etapa; commits chicos y descriptivos.
- Cada módulo con criterios de aceptación probados (ver tabla (a) del informe).
- Pruebas automáticas de sincronía con Playwright (varias pantallas, relojes desfasados).
- Atajos estándar: F8 wallpaper, F9 solo fondo, F10 negro, ESC salir, flechas navegar.
- Nada de telemetría ni envío de datos de miembros a la nube por defecto (Ley 25.326).
- Antes de borrar o reescribir algo grande, avisar.
- Herramientas, descargas e instaladores siempre en el disco D (`D:\Programas\...`).

## Hoja de ruta
0 Fundaciones (2-3 sem) → 1 MVP proyección (6-8) → 2 Red + sincronía (4-6) →
3 Migración y gestión (4-6) → 4 Producción/NDI/API (3-4) → 5 Diferenciales (6-10) → 6 Nube.
