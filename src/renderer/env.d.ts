/// <reference types="vite/client" />
import type { CeflyricsApi } from '@shared/api';

declare global {
  interface Window {
    ceflyrics: CeflyricsApi;
  }
}
