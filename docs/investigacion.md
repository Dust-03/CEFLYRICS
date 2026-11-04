# Especificación de sala limpia de CEFLYRICS

Versión del 2026-11-03. Este documento es la base desde la que se implementa. Describe **qué** debe
hacer el programa, con palabras propias, a partir de los objetivos del proyecto y de fuentes públicas.
No contiene código, textos de ayuda, traducciones, íconos ni colores de Holyrics.

Las secciones (a) y (c) se citan desde `CLAUDE.md`. Lo que todavía no está resuelto está en la
sección (e): conviene leerla antes de empezar un módulo.

**No es asesoramiento legal.** Las secciones sobre licencias y datos personales resumen fuentes
leídas por el equipo; antes de distribuir el programa las debería revisar un abogado.

## (a) Módulos y criterios de aceptación

Prioridad: **MVP** (Etapas 1 y 2), **Siguiente** (Etapas 3 y 4), **Opcional** (Etapa 5 en adelante).
Cada criterio debe tener una prueba automática, salvo los marcados *(manual)*.

### MVP

| Módulo | Qué hace | Criterios de aceptación |
|---|---|---|
| **Salidas por monitor** | Detecta los monitores y abre una ventana de salida a pantalla completa en cada uno, cada una con su rol: público, retorno o transmisión. | Con 2 monitores, la salida abre en el elegido sin tapar al operador. Si un monitor se desconecta en vivo, el programa sigue funcionando y lo informa. Al reconectarlo, la salida vuelve sola en menos de 5 s. |
| **Motor de render** | Un único bundle HTML/CSS + Canvas/WebGL que dibuja texto, fondos y medios a partir del estado "al aire". | La misma diapositiva se ve igual en Electron, en un navegador de la LAN y en OBS Browser Source: diferencia de píxeles menor al 1 % en pruebas de captura. El texto largo se ajusta sin salirse del área segura. Una transición no baja de 30 fps en una PC de referencia *(manual)*. |
| **Biblia** | Búsqueda por referencia y por texto, varias versiones lado a lado, proyección de versículos. | "jn 3 16", "Juan 3:16" y "1 Co 13:4-7" se resuelven bien, con abreviaturas en español. La búsqueda de texto en toda la Biblia responde en menos de 100 ms. Un rango largo se reparte en varias diapositivas sin cortar palabras. Comparar versiones respeta el mapa de versificación. |
| **Letras** | Canciones con diapositivas etiquetadas, varios arreglos por canción, proyección y navegación. | Cada diapositiva tiene etiqueta V/C/P (verso, coro, puente). Un mismo texto se reutiliza en varios arreglos sin duplicarse. Las líneas `//` se ven solo en el retorno, nunca en la salida al público. La búsqueda por título o por letra responde en menos de 100 ms con 5.000 canciones. |
| **Temas** | Tipografía, colores, fondo, posición y sombra, guardados como JSON y reutilizables. | Cambiar el tema al aire se aplica en la siguiente diapositiva sin cortes. Un tema exportado y reimportado se ve idéntico. Si falta una fuente, se usa una alternativa y se avisa. |
| **Playlist** | Orden del culto con canciones, versículos, medios y anuncios; se arma antes y se recorre en vivo. | Se puede reordenar por arrastre, también durante el culto. Las flechas avanzan por diapositiva y, al terminar un ítem, pasan al siguiente. Se guarda sola: un cierre inesperado no pierde más de 5 s de trabajo. |
| **Multimedia con precarga** | Imágenes, video y audio guardados en la carpeta de la app por hash de contenido. | El mismo archivo importado dos veces ocupa lugar una sola vez. Un video precargado arranca en menos de 200 ms. Los formatos que el motor no reproduce se convierten a H.264 1080p con FFmpeg, mostrando el avance. |
| **Alertas y cuenta regresiva** | Mensajes sobre lo proyectado (por ejemplo, un auto mal estacionado) y cuentas regresivas. | Una alerta aparece sobre cualquier contenido sin interrumpirlo. La cuenta regresiva llega a cero con menos de 1 s de error y se ve igual en todas las pantallas. |
| **Stage view** | Vista de retorno para quien canta o predica: diapositiva actual, siguiente, reloj y mensajes del operador. | Muestra actual y siguiente, con las líneas `//`. Un mensaje del operador llega en menos de 500 ms. Funciona en un navegador de la LAN. |
| **Remoto PWA** | Control desde el celular, con conexión por QR y descubrimiento por mDNS. | Escanear el QR conecta sin escribir nada. Sin token solo se puede mirar. Avanzar desde el celular llega al aire en menos de 200 ms por Wi-Fi. |
| **Pantallas sincronizadas** | Envía versículos, letras y videos guardados a TV, PC o TV box de la LAN, sin internet. Ver `prototype/README.md`. | p95 de dispersión de hasta 34 ms (un cuadro a 30 fps) en Wi-Fi de 5 GHz. Reconexión en menos de 2 s, sin perder la sincronía. El loop no se corta. Prueba automática ya hecha en `tests/sync`; falta medirlo con equipos reales *(manual)*. |

Atajos en todos los módulos: F8 wallpaper, F9 solo fondo, F10 negro, ESC salir, flechas navegar.

### Siguiente

| Módulo | Qué hace | Criterios de aceptación |
|---|---|---|
| **Importadores** | TXT, OpenLyrics y JSON de Holyrics para canciones; USFM para biblias. | Validar OpenLyrics contra el esquema 0.9. Una importación con errores informa qué ítem falló y sigue con el resto. Importar dos veces no duplica. Al importar una biblia con derechos, se muestra el aviso de responsabilidad del usuario. El JSON de Holyrics depende de la pregunta 2 de la sección (e). |
| **Cultos, escalas e informes** | Cultos recurrentes (RRULE), roles, asignaciones y estadísticas de lo proyectado. | "Todos los domingos a las 10" genera las fechas bien, con cambios de horario incluidos. Avisa si una persona tiene dos asignaciones a la vez. El informe por período sale de `play_log`. Ver las reglas de datos personales en la sección (d). |
| **Anuncios** | Secuencias de diapositivas que rotan solas, por ejemplo antes del culto. | Rotan con el tiempo configurado. Se interrumpen con un atajo y se retoman donde estaban. |
| **NDI** | Salida NDI desde una ventana offscreen, solo en Windows, macOS o Linux. | Se ve en un receptor NDI a 1080p30 sin cortes *(manual)*. Cumple las reglas de la sección (d). Depende de la pregunta 1 de la sección (e). |
| **API local** | REST + WebSocket para integraciones; opcionalmente con nombres compatibles con la API pública de Holyrics. | Cada token tiene permisos propios. Sin token no se accede a nada que modifique el estado. Documentación propia, escrita desde cero. |
| **Ctrl+K** | Paleta de comandos y búsqueda global. | Encuentra canciones, versículos, medios y acciones en menos de 100 ms. Se usa entera con el teclado. |
| **Favoritos** | Accesos rápidos a ítems frecuentes. | Un ítem se proyecta con un solo atajo. |

### Opcional

| Módulo | Qué hace | Criterio principal |
|---|---|---|
| **Quiz y sorteo** | Juegos para reuniones. | Un sorteo no repite ganador salvo que se pida. |
| **Scripts en sandbox** | Automatizaciones del usuario. | Un script no accede a archivos ni a la red sin permiso explícito. |
| **Voz a versículo** | Detecta una cita hablada y la propone, con whisper.cpp local. | Nunca proyecta sola: siempre confirma el operador. El audio no sale de la PC. |
| **Subtítulos en vivo** | Transcripción local en pantalla. | Retraso menor a 3 s. |
| **Nube** | Copias y sincronización opcionales. | Apagada por defecto. No incluye datos de miembros sin una decisión legal previa; ver sección (d). |

## (b) Flujos del operador

**Pedidos del usuario para la consola (2026-11-03).** La Biblia tiene un apartado propio y cómodo, con
búsqueda. Los libros se muestran separados en sus grupos (Pentateuco, históricos, poéticos, profetas,
evangelios, cartas), cada grupo con su color. La interfaz es simple pero atractiva, con modo claro y
modo oscuro a elección de quien la use. Cada cosa tiene su menú: Biblia, Canciones, Medios, Estilos y
Texto. Se agregan letras escribiéndolas o pegándolas, y se suben fotos y videos. Hay fuentes y fondos
para las letras, agrupados en un menú Configuración. Hay temporizadores configurables: de duración y
cuenta atrás hasta una hora. El diseño es propio: no se tomó de la interfaz de Holyrics, que no se abrió.

**Preparar el culto.** Abre el culto de la fecha (ya creado por la recurrencia), arma la playlist
buscando con Ctrl+K o desde cada pestaña, revisa cada ítem en la vista previa y asigna un tema.

**Proyectar en vivo.** La pantalla del operador muestra tres zonas: playlist, vista previa y lo que
está al aire. La vista previa nunca llega al público hasta que se confirma. Enter o doble clic pone
un ítem al aire y las flechas recorren las diapositivas.

**Versículo imprevisto.** El predicador cita un pasaje que no estaba previsto. El operador escribe
la referencia, ve el resultado en la vista previa y lo manda al aire. Meta: menos de 5 s. Al salir,
vuelve al punto de la playlist donde estaba.

**Emergencia.** F10 pone negro de inmediato en todas las salidas, sea cual sea el foco. Volver a
apretar restaura lo anterior. F9 deja solo el fondo y F8 el wallpaper.

**Sumar una pantalla.** Se abre la dirección corta en el navegador de la TV o se escanea el QR. La
pantalla aparece en la lista del operador con su estado de carga y con su latencia, que se calibra
una sola vez por equipo. El operador elige qué contenido recibe.

**Video sincronizado.** El operador carga el video, ve el avance de precarga de cada pantalla y
reproduce cuando todas están listas. Si una no llegó, el programa avisa y deja decidir entre esperar
y seguir sin ella. Esa pantalla se suma sola al terminar la carga.

**Migrar desde otro programa.** Se abre el asistente, se elige el archivo exportado y se revisa un
resumen de lo que se importa y lo que falla, antes de confirmar.

## (c) Modelo de datos

SQLite con FTS5. Los identificadores son enteros o UUID. Toda tabla editable lleva `created_at` y
`updated_at`.

### Biblias

- `bibles(id, code, name, language, versification, license_kind, source, imported_by_user)`.
  `license_kind` distingue `public_domain` de `user_imported`.
- `bible_books(bible_id, book_no, name, abbreviations)`.
- `verses(bible_id, vid, text)`, con clave `(bible_id, vid)`.
- `verses_fts`: FTS5 sobre `text`, con normalización de acentos.
- `versification_map(from_scheme, from_vid, to_scheme, to_vid)`.

`vid` es un entero `BBCCCVVV`: libro, capítulo y versículo. Juan 3:16 es `43003016`. El libro va de
1 a 66 en el orden protestante; los deuterocanónicos, si se suman, van desde el 67.

### Canciones

- `songs(id, title, author, copyright, ccli, key, bpm, notes, archived)`.
- `song_slides(id, song_id, label, text, return_notes)`: `label` es V, C o P con número (`V1`).
  `return_notes` guarda las líneas `//`.
- `song_arrangements(id, song_id, name, is_default)`.
- `arrangement_items(arrangement_id, position, slide_id)`: permite repetir un coro sin copiarlo.
- `songs_fts`: FTS5 sobre título y letra.

### Temas y medios

- `themes(id, name, definition_json)`. `definition_json` lleva versión de esquema.
- `media(id, sha256, kind, original_name, duration_ms, width, height, proxy_sha256, tags)`. El archivo
  vive en la carpeta de la app, con nombre igual al hash.

### Cultos y playlists

- `services(id, title, rrule, starts_at, duration_min, theme_id)`.
- `service_occurrences(id, service_id, date, overrides_json)`: guarda los cambios de una fecha puntual.
- `playlists(id, occurrence_id, name)`.
- `playlist_items(id, playlist_id, position, kind, ref_id, arrangement_id, theme_id, settings_json)`.
  `kind` es `song`, `verse`, `media`, `announcement` o `text`.

### Personas

- `members(id, full_name, contact, active, consent_at)`: lo mínimo para organizar servicios. No hay
  campos de salud, situación personal ni pedidos de oración; ver sección (d).
- `roles(id, name)`.
- `assignments(id, occurrence_id, member_id, role_id, status)`.

### Registro y equipos

- `play_log(id, occurrence_id, kind, ref_id, started_at, duration_ms)`. No guarda quién operaba.
- `devices(id, name, kind, token_hash, output_latency_ms, seek_lead_ms, start_lead_ms, last_seen_at)`.
  Los leads se guardan por equipo, como aprendió el prototipo.
- `settings(key, value_json)`.

## (d) Fuentes y reglas legales

### Registro de sala limpia

Fuentes leídas para escribir este documento:

| Fuente | Qué se usó | Fecha |
|---|---|---|
| [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/texto), texto original | Artículos 2, 7, 9 y 12 | 2026-11-03 |
| [Licencia de la BSB](https://berean.bible/terms.htm) | Dominio público desde el 30/04/2023 | 2026-11-03 |
| [Copyright de la WEB](https://ebible.org/web/copyright.htm) | Dominio público; condiciones del nombre | 2026-11-03 |
| [RV1909 en eBible](https://ebible.org/details.php?id=spaRV1909) | Dominio público; descarga USFM | 2026-11-03 |
| [KJV en eBible](https://ebible.org/details.php?id=eng-kjv) | Dominio público fuera del Reino Unido | 2026-11-03 |
| [OpenLyrics](https://github.com/openlyrics/openlyrics/) | Formato abierto, esquema RelaxNG 0.9 | 2026-11-03 |
| [API pública de Holyrics](https://raw.githubusercontent.com/holyrics/API-Server/main/README-en.md) | Solo forma de acceso y nombres de métodos, en parte (la lectura no cubrió todo el documento) | 2026-11-03 |
| [Licenciamiento de NDI](https://docs.ndi.video/docs/sdk/licensing) y [distribución](https://docs.ndi.video/docs/sdk/software-distribution) | Marca y distribución de DLL | 2026-11-03 |
| [OpenLP](https://gitlab.com/openlp/openlp) | GPL-3.0 o posterior | 2026-11-03 |
| [grandiose](https://github.com/stagetimerio/grandiose) | Apache-2.0; las bibliotecas de NDI siguen bajo la licencia de NDI | 2026-11-03 |

**No se leyó ni se usó** el repositorio `msb7-jpg/holyrics-analysis`, ni código descompilado, ni
recursos del programa Holyrics. Quien sume una fuente nueva la agrega a esta tabla.

### Contenido incluido de fábrica

| Texto | Estado | Condiciones |
|---|---|---|
| Reina-Valera 1909 | Dominio público | Ninguna declarada. Fuente: USFM de eBible. |
| KJV | Dominio público fuera del Reino Unido | Allí, imprimirla o importar copias impresas requiere permiso, por una patente real. Se incluye con esa nota en Acerca de. |
| WEB | Dominio público | "World English Bible" es marca de eBible.org: si el texto se modifica, no puede usar ese nombre. Se distribuye sin cambios. |
| BSB | Dominio público desde 2023 | Sus términos permiten todos los usos. |

RVR1960, RVR95, NVI, NTV, LBLA y NBLA no se incluyen: solo se cargan con el importador, con aviso de
responsabilidad del usuario. No se incluyen canciones modernas.

### Datos personales (Ley 25.326)

Lo que dice el texto leído, y cómo se traduce al diseño:

- **Las convicciones religiosas son datos sensibles** (art. 2), y la salud también. Por eso, una
  lista de personas de una iglesia revela un dato sensible por sí sola.
- **Las asociaciones religiosas pueden llevar un registro de sus miembros** (art. 7, inc. 3), como
  excepción a la prohibición general de esos registros. La ley no define el alcance de ese registro.
  **Diseño:** guardar solo miembros, y solo lo necesario para organizar servicios. Nada de visitantes
  ni de "pedidos de oración" con nombres y situaciones personales, que quedarían fuera de esa
  excepción con facilidad.
- **Nadie puede ser obligado a dar datos sensibles** (art. 7, inc. 1). **Diseño:** todo campo de
  persona es opcional, salvo el nombre.
- **Hay que adoptar medidas de seguridad** (art. 9). **Diseño:** los datos de miembros no se exponen
  en la API sin un token con ese permiso, ni se muestran en los clientes de la LAN. El respaldo
  exportado avisa que contiene datos personales.
- **Está prohibido transferirlos a países sin protección adecuada** (art. 12). **Diseño:** la nube
  queda apagada por defecto, y no sube datos de miembros sin una decisión legal previa.

El texto leído es el original, sin reformas posteriores ni el Decreto 1558/2001. Hay proyectos de
reforma: hay que verificar qué está vigente antes de lanzar el programa.

### Licencias

- **El proyecto es GPL-3.0.** FreeShow (GPL-3.0) y OpenLP (GPL-3.0 o posterior) son compatibles, pero
  **se decidió no copiar su código** (pregunta 1 de la sección (e)).
- **Toda dependencia nueva** se revisa antes de agregarla. Electron, Svelte, better-sqlite3, Fastify,
  ws, bonjour-service y qrcode se asumen MIT, y Playwright y grandiose son Apache-2.0: **confirmar**
  cada una al instalarla. FFmpeg debe usarse en una compilación LGPL o GPL compatible.
- **NDI:** usar "NDI®" con la leyenda "NDI® is a registered trademark of Vizrt NDI AB" en la interfaz
  y en Acerca de, con link a ndi.video. Las DLL van junto a la app y nunca en la ruta del sistema,
  acompañadas de `Processing.NDI.Lib.Licenses.txt`. El EULA del programa debe cubrir los requisitos
  del EULA del SDK. Prohibido en Android y TV box, porque requiere licencia comercial. Las reglas
  exactas están en la licencia que trae el SDK, que hay que leer al descargarlo.

## (e) Preguntas abiertas

1. **¿GPL-3.0 es compatible con la DLL propietaria de NDI?** Es el punto legal más serio. La GPL pide
   que el programa combinado se distribuya bajo GPL, y la biblioteca de NDI es propietaria. Lo usual
   es agregar una excepción de enlace (GPL, sección 7) para el código propio, pero esa excepción no
   cubre código ajeno: si se reutiliza código GPL de FreeShow u OpenLP, sus autores no la dieron.
   FreeShow usa NDI, pero eso no resuelve la pregunta para este proyecto. **Decidido el 2026-11-03:**
   no se copia código GPL ajeno, para poder agregar la excepción sobre código propio. Falta redactar
   esa excepción al llegar al módulo NDI y que la revise un abogado.
2. **¿Qué formato tiene el JSON que exporta Holyrics?** No se encontró documentación pública de ese
   archivo, solo una API con campos de canción como `id`, `title`, `artist`, `author`, `note`, `key`,
   `bpm`, `time_sig`, `groups` y `archived`. **Hace falta un archivo real exportado por un usuario**
   con su propio contenido. Estudiar ese archivo es interoperabilidad y está permitido; descompilar
   el programa no lo está.
3. **Mapa de versificación RV1909 vs KJV.** Medido en la Etapa 1 con el USFM de eBible: **son 18 los
   números de versículo sin texto**: Nm 12:16, Nm 29:40, 1 S 23:29, 2 S 20:26, 2 Cr 33:25, Job 35:16,
   Job 38:39-41, Job 40:20-24, Os 11:12, Jon 1:17, Hch 19:41 y 2 Co 13:14. Ahí la RV1909 corta los capítulos en otro punto, y en varios capítulos toda la numeración
   queda corrida respecto de la KJV: su Nm 13:2 es el 13:1 de la KJV. **Defecto de esta fuente:** para
   no pasarse de la cantidad de versículos de la KJV, pega los últimos versículos del capítulo en uno
   solo (Job 39:30 tiene 575 caracteres, y Nm 13:34 no existe como tal). Se guarda el texto como viene.
   Falta armar el mapa completo para comparar versiones (paso 1.5) y decidir si se separan esos
   versículos con otra fuente. La WEB, aparte, lleva Ro 16:25-27 a 14:24-26, y a la BSB le faltan 16
   versículos que omite (Mt 17:21 y otros).
4. **¿La sincronía cumple en equipos reales?** Hay una prueba de 38 s con un equipo, con valores
   informados por la pantalla. Falta medir con cámara, con varios equipos y con el patrón de cadencia
   pareja. También falta ver si un TV box aguanta dos videos cargados a la vez.
5. **¿Cómo se llama el producto?** "CEFLYRICS" se usa como nombre de trabajo. Antes de publicar,
   conviene revisar que no se confunda con la marca Holyrics, por la terminación parecida.
