// Lo que el preload expone a los renderers en window.ceflirics.
export type AppInfo = {
  name: string;
  version: string;
  electron: string;
};

export type CefliricsApi = {
  getAppInfo: () => Promise<AppInfo>;
};

export const IPC = {
  getAppInfo: 'app:get-info',
} as const;
