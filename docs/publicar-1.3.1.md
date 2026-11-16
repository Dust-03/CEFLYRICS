# Publicar CEFLYRICS 1.3.1 en GitHub

La aplicación busca versiones estables en GitHub Releases. Para que el actualizador las encuentre,
cada versión debe publicarse como Release estable (no como borrador ni como pre-release) y conservar
los archivos de actualización que genera electron-builder.

## Preparar el instalador

1. Ejecutar `npm ci`.
2. Ejecutar `npm run apk` para incluir la app de control Android.
3. Ejecutar `npm run dist` en Windows. El script reconstruye la base de biblias y crea el instalador.
4. Confirmar en `release/` el instalador `CEFLYRICS-Instalador-1.3.1.exe`, su archivo `.blockmap` y `latest.yml`.

## Publicar

1. Crear en `Dust-03/CEFLYRICS` un Release estable con la etiqueta `v1.3.1` y el título `CEFLYRICS 1.3.1`.
2. Copiar el resumen de `CHANGELOG.md` en las notas del Release.
3. Adjuntar el instalador, el `.blockmap` y `latest.yml` que produjo electron-builder.
4. Publicar el Release. La próxima comprobación automática encontrará esta versión en las instalaciones anteriores.

No subir `resources/bibles.db`, `resources/ceflyrics-control.apk`, `userdata/` ni credenciales. La base
y el APK van dentro del instalador y se generan localmente antes de empaquetar.
