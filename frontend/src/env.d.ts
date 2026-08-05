/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  electronAPI: {
    invoke: (channel: string, data?: any) => Promise<any>;
    on: (channel: string, callback: (data: any) => void) => () => void;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    getPathForFile: (file: File) => string;
  };
}
