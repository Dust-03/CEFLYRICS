# Control móvil (adelantado de la Etapa 2)

Una app de Android para manejar CEFLIRICS desde el celular. No proyecta sola: la PC sigue haciendo
todo, y el celular elige qué sale al aire.

## Decisiones

- **La app es una cáscara:** guarda la dirección de la PC y abre la pantalla que sirve la app de
  escritorio. Actualizar el programa de la PC actualiza el control, sin reinstalar nada.
- **Android nativo, sin Capacitor:** alcanza con un WebView. Sin dependencias nuevas y compila con el
  SDK 34 y el JDK 17 que ya están en `D:\Programas`.
- **PIN de 6 dígitos:** se muestra en Transmisión y sirve para vincular un celular. Cambiarlo
  desvincula a todos. Cinco intentos fallidos bloquean esa IP por un minuto.
- **Sin cifrado:** va por HTTP en la red local, como las teles. El PIN viaja una sola vez.
- **Descarga desde la propia PC:** Transmisión muestra un QR que baja el APK, sin tienda.
- **iPhone:** sin app, porque publicarla necesita una Mac y una cuenta paga. Usa la misma pantalla
  desde Safari.

## Pasos

| Paso | Qué | Criterio |
| --- | --- | --- |
| 1 | Canal de control: vincular con PIN y órdenes por WebSocket | Sin token no se lee ni se cambia nada |
| 2 | Pantalla del control | Biblia, canciones, medios, atajos y F8/F9/F10 desde un celular |
| 3 | App Android | Se conecta con un QR, recuerda la PC y no deja apagar la pantalla |
| 4 | Descarga y vinculación desde Transmisión | Dos QR: bajar la app y conectarla |

## Fuera de esta etapa

Temporizadores desde el celular, editar canciones, subir fotos, roles por operador y la tienda de
Google.

## Firma del APK

La clave queda en `D:\Programas\CEFLIRICS-firma`, fuera del repositorio. Si se pierde, una versión
nueva no se puede instalar sobre la anterior: hay que desinstalar primero. Conviene guardar una copia.
