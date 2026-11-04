# CEFLYRICS

Programa de escritorio para proyectar versículos, letras, fotos, videos y temporizadores en el
culto. Funciona sin internet: las teles y los celulares se conectan por la red local.

Versión actual: **1.1.1**.

## Qué hace

- **Biblia:** Reina-Valera 1909, KJV, WEB y BSB incluidas, con búsqueda por cita o por palabra.
- **Canciones:** letras con diapositivas por verso y coro.
- **Medios:** fotos y videos, con sonido en la salida.
- **Atajos:** versículos, canciones y medios guardados con una estrella.
- **Temporizadores:** por duración o en cuenta atrás hasta una hora.
- **Estilos:** fuentes, colores y fondos, con modo claro y oscuro en la consola.
- **Salida:** se abre sola en el segundo monitor y se adapta a cualquier resolución.
- **Transmisión:** cualquier tele con navegador muestra lo que está al aire, en una dirección fija.
- **Control desde el celular:** app de Android o navegador, con PIN y un nombre por cada celular.
- **Datos:** exportar e importar todo en un archivo, para pasarlo a otra PC.

Atajos de teclado: F8 logo, F9 fondo, F10 negro, Esc quitar. Mandar algo al aire saca el logo, el
fondo o el negro.

## Instalación

Hace falta Windows 10 u 11 de 64 bits.

1. Abrí `CEFLYRICS-Instalador-1.1.1.exe`. Como no tiene firma digital, Windows puede avisar: tocá
   **Más información** y **Ejecutar de todas formas**.
2. Aceptá el permiso de administrador. Se instala solo, crea la regla del firewall y abre el programa.

Para generar el instalador, ver [Desarrollo](#desarrollo).

## Ver en una tele

Conectá la tele al mismo router que la PC, abrí su navegador y escribí la dirección que aparece en
el menú **Transmisión**, por ejemplo `192.168.1.39:8787`. El puerto es siempre el mismo; para que
la IP tampoco cambie, reservala en el router.

## Control desde el celular

**CEFLYRICS Control** es solo un control remoto: no proyecta sola y necesita el programa abierto en
una PC de la misma red.

1. En **Transmisión**, escaneá el QR para bajar la app de Android. En iPhone se usa desde Safari,
   con el otro QR.
2. La app encuentra la PC sola. Escribí un nombre y el PIN, una sola vez.

Desde la PC se ve qué celulares están conectados y se puede desvincular cualquiera.

## Limitaciones

- El video en las teles no va sincronizado cuadro a cuadro con el proyector.
- Todavía no se importan canciones ni otras biblias.
- La conexión por la red local va sin cifrar: conviene que el Wi-Fi tenga clave.

## Desarrollo

Requisitos: Windows 10/11, Node.js 26, Git y Microsoft Edge para las pruebas. Para la app de
Android, además, el SDK 34, el JDK 17 y Gradle 8.7 en `D:\Programas` (o donde indique `CEF_TOOLS`).

```bash
npm install
npm run dev        # abre la app
npm test           # pruebas unitarias
npm run test:app   # pruebas de la app
npm run test:sync  # pruebas de sincronía del prototipo
npm run check      # tipos, ESLint y formato
npm run apk        # app de Android, en resources/
npm run dist       # instalador, en release/
```

El instalador incluye el APK: generá primero la app con `npm run apk`. La firma de Android se crea
sola la primera vez, fuera del repositorio.

La especificación está en [docs/investigacion.md](docs/investigacion.md), y los planes en
[docs/](docs/).

## Licencia

GPL-3.0. Ver [LICENSE](LICENSE).

Los logos de la iglesia CEF (`assets/logo-cef.svg`, `assets/logo-ceflyrics.svg` y `assets/icono.*`)
no están bajo esa licencia: pertenecen a la iglesia. Quien use este código en otro lado tiene que
reemplazarlos.

Las biblias incluidas de fábrica son solo de dominio público (Reina-Valera 1909, KJV, WEB y BSB).
Las demás traducciones no se incluyen.
