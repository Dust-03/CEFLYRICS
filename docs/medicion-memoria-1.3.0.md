# Medición de memoria 1.3.0

Medición del 16 de noviembre de 2026 en Windows, con `npm run medir`. El medidor suma el working set
de los procesos de Electron; se ejecuta con la consola y la salida abiertas, por lo que estos valores
incluyen cinco procesos. El sistema operativo puede mantener páginas liberadas en memoria, así que el
working set no baja necesariamente justo después de cerrar una vista.

| Estado | RAM total | Procesos |
| --- | ---: | ---: |
| Reposo | 466 MB | 5 |
| Configuración | 474 MB | 5 |
| Medios | 487 MB | 5 |
| Salmos 119 abierto | 561 MB | 5 |
| Salmos 119:176 seleccionado | 561 MB | 5 |
| Video en salida | 749 MB | 6 |

La selección cambia la lista visible de 176 versículos a uno y conserva solo los identificadores del
capítulo para el selector. El sistema reportó el mismo working set antes y después de esa selección;
esta medida no muestra una reducción inmediata en RAM del proceso, aunque la interfaz deja de retener
los textos del resto del capítulo. La caché de metadatos de biblias también quedó limitada a una
versión activa.

La búsqueda de `jehová` tardó 135 ms en el primer recorrido y 225 ms con el renderizador limitado a
cuatro veces menos CPU. El video mantuvo 241 cuadros y descartó uno. Repetir la medición en la PC del
culto es recomendable porque el working set varía según Windows, los monitores y la carga del equipo.
