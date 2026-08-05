import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data?: any) => {
    return ipcRenderer.invoke(channel, data);
  },
  on: (channel: string, callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
});

// 类型声明
declare global {
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
}
