# CEFLIRICS

Software de escritorio para proyectar versículos, letras, videos y anuncios en el culto.
Incluye envío de contenido y videos guardados a otras pantallas de la red local (TV, PC,
TV box) con reproducción sincronizada, sin internet.

Estado: **Etapa 0 (fundaciones)**. Ver [docs/plan-etapa-0.md](docs/plan-etapa-0.md).

## Requisitos de desarrollo

- Windows 10/11
- Node.js 26 LTS
- Git
- Microsoft Edge, para las pruebas de sincronía

```bash
npm install
npm run dev        # abre la app
npm run test:app   # prueba de arranque
npm run test:sync  # pruebas de sincronía
npm test           # pruebas unitarias
npm run check      # tipos, ESLint y formato
npm run dist       # instalador en release/
```

## Licencia

GPL-3.0. Ver [LICENSE](LICENSE).

Las biblias incluidas de fábrica son solo de dominio público (Reina-Valera 1909, KJV, WEB,
BSB). Otras traducciones se cargan con el importador y son responsabilidad de quien las importa.
