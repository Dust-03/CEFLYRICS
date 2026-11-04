# Etapa 1: MVP de proyección (6-8 semanas)

Objetivo: que un operador pueda llevar un culto completo con esta app, en una sola PC con un
proyector. La red, el remoto y las pantallas sincronizadas son de la Etapa 2.

Al terminar, la prueba es simple: un culto simulado de una hora, sin tocar el teclado de otra
cosa que no sea la app.

Los criterios de cada módulo están en la sección (a) de `docs/investigacion.md`. Acá solo va el
orden y lo que entrega cada paso.

## Pasos

| # | Paso | Entrega | Criterio principal |
|---|------|---------|--------------------|
| 1.1 | Datos de biblias | Script que convierte USFM a SQLite. RV1909, KJV, WEB y BSB incluidas de fábrica. | Conteo de versículos correcto en las 4. Responde la pregunta 3: lista real de diferencias de versificación. (hecho; el mapa completo pasa a 1.5) |
| 1.2 | Referencias | Intérprete de citas en español, con abreviaturas. | "jn 3 16", "Juan 3:16" y "1 Co 13:4-7" se resuelven; cubierto con una tabla de pruebas. (hecho) |
| 1.3 | Consola de 3 zonas | Playlist, vista previa y al aire. Mandar a la vista previa y de ahí al aire; flechas. | Nada llega al público sin confirmarse. (hecho, sin la zona de playlist, que llega en 1.8) |
| 1.4 | Motor de render | Ajuste de texto, área segura, reparto en diapositivas y transiciones. | El texto largo nunca se sale. Misma imagen en Electron y navegador. |
| 1.5 | Biblia en la consola | Búsqueda, versiones lado a lado y proyección. | Versículo imprevisto al aire en menos de 5 s. Búsqueda en menos de 100 ms. (búsqueda y proyección hechas; faltan versiones lado a lado y el mapa) |
| 1.6 | Letras | Editor, etiquetas V/C/P, arreglos y líneas `//`. | Con 5.000 canciones de prueba, búsqueda en menos de 100 ms. |
| 1.7 | Temas | Editor y aplicación por ítem o global, guardados como JSON. | Exportar y reimportar da la misma imagen. |
| 1.8 | Playlist | Armado, reordenar y guardado automático. | Un cierre forzado pierde menos de 5 s de trabajo. |
| 1.9 | Multimedia | Importar por hash, imagen, video y audio, con precarga y FFmpeg. | Arranque de video precargado en menos de 200 ms. |
| 1.10 | Alertas y cuenta regresiva | Mensajes sobre lo proyectado y temporizadores. | Una alerta no interrumpe lo que está al aire. |
| 1.11 | Salidas con roles | Público y retorno en monitores distintos, con líneas `//` solo en el retorno. | Desconectar un monitor en vivo no corta nada (prueba manual). |
| 1.12 | Culto simulado | Recorrido completo con teclado físico. | Una hora sin fallas, con registro de lo que haya que corregir. |

## Orden

1.1 → 1.2 → 1.3 → 1.4 → 1.5 da el primer resultado útil: **proyectar la Biblia de verdad**.
Después 1.6 → 1.7 → 1.8, para llegar a un culto de letras y versículos. Luego 1.9 → 1.10 → 1.11, y
1.12 cierra.

La Biblia va primero porque obliga a resolver el parser, el reparto de texto y la consola, que
después reutilizan las letras.

## Decisiones que hacen falta

- **Tipografía:** resuelta. Van seis fuentes libres (OFL) dentro del programa, con sus licencias.
- **FFmpeg (antes de 1.9):** las compilaciones comunes son GPL, y las hay LGPL con menos códecs.
  Corre como programa aparte, así que no se mezcla con el código. Hay que elegir cuál y comprobar
  su licencia.
- **Firewall (antes de la Etapa 2):** el instalador por usuario no puede crear reglas. Ver
  `docs/plan-etapa-0.md`.

## Riesgos

- **Calidad de los textos:** los USFM pueden traer notas, títulos o marcas que no van proyectados.
  Hay que revisar una muestra de cada versión a mano.
- **Ajuste de texto:** medir texto para repartirlo es lento si se hace mal; afecta al tiempo de
  respuesta de 1.5.
- **Video en la salida:** los códecs dependen de lo que trae Electron. Lo que no se reproduzca pasa
  por FFmpeg, y eso puede tardar minutos en un video largo.
- **Tamaño del instalador:** las 4 biblias y FFmpeg lo acercan a 250 MB.

## Adelantado a pedido del usuario (2026-11-03)

Menú lateral con Biblia, Canciones, Medios, Estilos y Texto. Hecho, con estos recortes:

- **1.6 Letras:** alta, edición, borrado, búsqueda y líneas `//`. Faltan los arreglos: el orden de
  una canción es el de sus diapositivas.
- **1.7 Temas:** estilos de fábrica y propios, con fuente, tamaño, colores y fondo (color, foto o
  video), uno para canciones y otro para Biblia. Falta el estilo por ítem y exportar a JSON.
- **1.9 Multimedia:** fotos y videos por hash, con sonido en la salida y repetición. Falta la
  conversión con FFmpeg: lo que el motor no reproduce no se puede proyectar. Falta medir el arranque.

Después, también a pedido: menú **Temporizadores** (varios a la vez, de duración o hasta una hora, a
pantalla completa o en la esquina, con mensaje al llegar a cero) y menú **Configuración**, que reúne
estilos y fuentes. Del paso 1.10 faltan las alertas sobre lo proyectado.

Menú **Atajos** (adelantado de Favoritos): versículos, canciones, fotos y videos guardados con una
estrella, numerados, con Ctrl+1 a Ctrl+9 hacia la vista previa.

Menú **Transmisión** (adelantado de la Etapa 2): la app sirve lo que está al aire a las teles de la
red, en un puerto fijo (8787 de fábrica, guardado en `settings`). Si está ocupado avisa y espera: no
se muda a otro. Muestra la dirección, un QR, las pantallas conectadas con su resolución y la dirección
física para reservar la IP en el router. Solo se lee: desde la red no se cambia nada.

- Por ahora va con `node:http` y `ws`, sin Fastify: son tres archivos y los medios. Fastify entra
  cuando haya una API de verdad.
- La página de las teles (`src/renderer/lan`) se compila aparte, en un script común con sintaxis de
  2017, porque el navegador de un televisor puede ser viejo. Por eso el motor no usa cqw, inset ni gap.
- **Falta:** la sincronía de video del prototipo. Un video llega a la tele y se reproduce, pero no va
  en el mismo cuadro que el proyector. Es el trabajo de la Etapa 2.
- **Sonido:** apagado de fábrica, porque en la misma sala hay eco. Se activa en el menú. El navegador
  de la tele necesita una tecla apretada para sonar.
- **Probado en una tele real (2026-11-04):** texto, foto, video con sonido, pantalla completa y
  reconexión sola tras reiniciar la app, a 1280 × 720, además de un celular Android.
- **Firewall:** si el aviso de Windows queda sin responder, se guarda una regla de bloqueo y no vuelve
  a preguntar. Pasó con esta PC: hubo que cambiarla a mano, como administrador. Conviene explicarlo en
  el menú y detectarlo, porque desde la misma PC todo responde igual y el problema no se ve.

**Cualquier resolución (paso 1.4):** el motor mide la pantalla y usa como unidad una centésima del
ancho, o del alto en pantallas más anchas que 16:9. El texto que no entra se achica hasta entrar, con
un piso del 30 %. La salida se reacomoda si cambia la resolución del monitor, y las vistas de la
consola toman la forma de la salida. Falta repartir un texto muy largo en varias diapositivas.

## Fuera de esta etapa

Remoto y stage view por la LAN, sincronía de video en las teles, importadores (salvo USFM
para las biblias de fábrica), cultos, miembros, NDI y API.

## Pendientes de la Etapa 0 que conviene resolver acá

Instalador en una PC limpia, teclado físico, y desconectar el monitor en vivo (1.11 y 1.12).

## Rendimiento (2026-11-03)

La PC de destino es modesta. `npm run medir` compara arranque, memoria, CPU, búsqueda y video.

| Medida | Antes | Después |
|---|---|---|
| Videos decodificándose con uno al aire | 3 | 1 |
| Memoria con un video al aire (conjunto de trabajo) | 790 MB | 640 a 705 MB |
| Paquete instalado | 429 MB | 358 MB |

La memoria real en reposo es de unos 245 MB, casi todo Electron. Medido en la PC de desarrollo: falta
medir en la PC de destino.
