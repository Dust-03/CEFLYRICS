import type { Action, OnAirState } from './state';

// Lo que el preload expone a los renderers en window.ceflirics.
export type AppInfo = {
  name: string;
  version: string;
  electron: string;
};

export type OutputInfo = {
  open: boolean;
  fullscreen: boolean;
  displays: number;
};

export type CefliricsApi = {
  getAppInfo: () => Promise<AppInfo>;
  getState: () => Promise<OnAirState>;
  dispatch: (action: Action) => void;
  onState: (listener: (state: OnAirState) => void) => () => void;
  getOutputInfo: () => Promise<OutputInfo>;
  toggleOutput: () => void;
  onOutputInfo: (listener: (info: OutputInfo) => void) => () => void;
};

export const IPC = {
  getAppInfo: 'app:get-info',
  getState: 'state:get',
  dispatch: 'state:dispatch',
  stateChanged: 'state:changed',
  getOutputInfo: 'output:get-info',
  toggleOutput: 'output:toggle',
  outputInfoChanged: 'output:info-changed',
} as const;
