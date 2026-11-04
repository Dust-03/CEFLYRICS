# CEFLYRICS

Programa de escritorio para proyectar versículos, letras, fotos, videos y temporizadores en el
culto. Funciona sin internet: las teles y los celulares se conectan por la red local.

Versión actual: **1.2.0**.

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
- **Importar y exportar:** canciones en TXT y OpenLyrics, biblias en XML y USFM, y todo junto en un archivo
  para pasarlo a otra PC.

Atajos de teclado: F8 logo, F9 fondo, F10 negro, F11 pantalla completa, Esc quitar. Mandar algo al aire saca el logo, el
fondo o el negro.

## Cómo funciona

Todo gira alrededor de una sola cosa: **lo que está al aire**. Lo guarda el programa de la PC, y
el proyector, las teles y los celulares miran siempre lo mismo. Si algo cambia desde cualquier lado,
se actualiza en todos al instante.

| Parte | Qué es | Qué puede hacer |
| --- | --- | --- |
| **Consola** | La ventana del operador en la PC | Prepara y manda todo al aire |
| **Salida** | La pantalla del proyector | Muestra lo que está al aire, a pantalla completa en el segundo monitor |
| **Teles** | Cualquier navegador de la misma red | Solo mirar: desde ahí no se puede cambiar nada |
| **Celulares** | CEFLYRICS Control, o el navegador | Manejar lo que está al aire, con un PIN y un nombre |

### En el culto

1. Abrí CEFLYRICS. Si hay un segundo monitor, la salida se abre sola en él.
2. Elegí un versículo, una canción, una foto o un video: aparece en **Vista previa**, sin salir al
   proyector.
3. Tocá **Al aire**, o hacé doble clic, para mandarlo. En el celular son dos toques.
4. **Logo**, **Fondo** y **Negro** son accesos directos: tapan la pantalla al momento. Lo próximo que
   mandes al aire los saca solo. **Quitar** deja la pantalla limpia.

Los **atajos** son lo que se guarda con la estrella para tenerlo a mano; en la PC, Ctrl+1 a Ctrl+9
llevan a los nueve primeros. Tocar de nuevo el menú en el que estás te devuelve a su inicio.

### La red

No hace falta internet. El programa abre un pequeño servidor dentro de la red local, en el puerto
8787, y de ahí salen la página de las teles y la del control. Las teles reciben los cambios al
instante y, si se corta la conexión, conservan lo proyectado y vuelven solas.

Cada celular se vincula una sola vez y recibe su propia llave. En **Transmisión** se ve cuáles están
conectados y se puede desvincular cualquiera. El PIN sirve solo para vincular celulares nuevos.

### Los datos

Todo queda en la PC: canciones, medios, estilos, temporizadores y atajos se guardan en una base local,
y no se envía nada a internet. **Configuración → Importar y exportar** sirve para sumar canciones y
biblias, y para pasar todo a otra PC en un solo archivo.

## Instalación

Hace falta Windows 10 u 11 de 64 bits.

1. Abrí `CEFLYRICS-Instalador-1.2.0.exe`. Como no tiene firma digital, Windows puede avisar: tocá
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

1. Bajá la app de Android desde [descargas/ceflyrics-control.apk](descargas/ceflyrics-control.apk) o
   con el QR de **Transmisión**. Android va a pedir permiso para instalar una app de fuera de la tienda.
   En iPhone se usa desde Safari, con el otro QR.
2. La app encuentra la PC sola. Escribí un nombre y el PIN, una sola vez.

Desde la PC se ve qué celulares están conectados y se puede desvincular cualquiera.

## Limitaciones

- El video en las teles no va sincronizado cuadro a cuadro con el proyector.
- Todavía no se importan las canciones de Holyrics.
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
Las demás traducciones no se incluyen: se cargan con el importador y son responsabilidad de quien
las importa.
