/// <reference types="vite/client" />
import type { CefliricsApi } from '@shared/api';

declare global {
  interface Window {
    ceflirics: CefliricsApi;
  }
}
