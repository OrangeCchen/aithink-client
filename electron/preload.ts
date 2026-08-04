import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electron', {
  // IPC invoke 调用
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  // IPC 事件监听
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
    const subscription = (event: any, ...args: any[]) => callback(event, ...args);
    ipcRenderer.on(channel, subscription);

    // 返回取消订阅函数
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // 打开外部链接
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
});

// 保持向后兼容
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
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
});

// 类型声明
declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
    electronAPI: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on: (channel: string, callback: (data: any) => void) => () => void;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
