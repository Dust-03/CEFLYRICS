import { defineConfig } from '@playwright/test';

const PORT = 8799;

export default defineConfig({
  testDir: 'tests',
  // Las pruebas miden tiempos: de a una, para que no compitan por la CPU.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // El Chromium de Playwright no trae H.264; Edge sí, y viene con Windows.
    channel: 'msedge',
    launchOptions: {
      args: [
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  projects: [
    { name: 'patron', testMatch: /patron\.setup\.ts/ },
    { name: 'sincronia', testMatch: /sync[\\/].*\.spec\.ts/, dependencies: ['patron'] },
    { name: 'app', testMatch: /app[\\/].*\.spec\.ts/ },
  ],
  webServer: {
    command: `"${process.execPath}" prototype/server.js --port ${PORT} --token test --media tests/.media`,
    url: `http://localhost:${PORT}/api/media`,
    reuseExistingServer: false,
  },
});
