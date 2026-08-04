import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join } from 'path';
import { registerChatHandlers } from './controller/chat.js';
import { registerConfigHandlers } from './controller/config.js';
import { registerRecordingHandlers } from './controller/recording.js';
import { registerASRHandlers } from './controller/asr.js';
import { registerSkillHandlers } from './controller/skill.js';
import { loadConfig } from './service/config-service.js';
import { startHttpServer, getLastExtensionPing } from './service/http-server.js';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // 开发环境加载 Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 窗口控制 IPC
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

// 打开外部链接
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
});

// 文件夹选择对话框
ipcMain.handle('dialog:open-folder', async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择工作空间文件夹',
    buttonLabel: '选择'
  });

  return result;
});

// 连接状态检测
ipcMain.handle('connection:checkExtension', async () => {
  const lastPing = getLastExtensionPing();
  if (lastPing === 0) return { status: 'disconnected' };
  const elapsed = Date.now() - lastPing;
  return { status: elapsed < 30000 ? 'connected' : 'disconnected', lastPing };
});

ipcMain.handle('connection:checkQwen', async () => {
  try {
    const config = await loadConfig();
    const apiKey = (config as any).qwen?.apiKey;
    const baseUrl = (config as any).qwen?.baseUrl;

    if (!apiKey) {
      return { status: 'error', error: '未配置 API Key' };
    }

    // 真实测试：调用 baseUrl 的 /v1/models 接口验证连通性
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/v1/models` : 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.ok || resp.status === 401) {
        // 200 = 完全成功；401 = 服务可达但 key 错误（仍算服务可用）
        return { status: resp.ok ? 'connected' : 'error', error: resp.ok ? undefined : 'API Key 无效' };
      }
      return { status: 'error', error: `HTTP ${resp.status}` };
    } catch (err: any) {
      // 网络错误：服务不可达
      return { status: 'error', error: '服务不可达' };
    }
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('connection:checkHttp', async () => {
  // HTTP 服务在本进程中，如果能执行到这里说明服务在运行
  return { status: 'connected' };
});

// 注册 custom protocol: aithink://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('aithink', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('aithink');
}

// 处理 macOS 上的 open-url 事件（custom protocol）
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('aithink://')) {
    // 如果窗口已存在，聚焦；否则创建
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow();
    }
  }
});

// Windows/Linux: 处理第二实例启动（带 protocol URL）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows/Linux 上 protocol URL 在 commandLine 中
    const url = commandLine.find((arg) => arg.startsWith('aithink://'));
    if (url && mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  // 初始化配置（首次启动会创建默认配置）
  await loadConfig();

  // 注册 IPC 处理器
  await registerChatHandlers();
  registerConfigHandlers();
  registerRecordingHandlers();
  registerASRHandlers();
  registerSkillHandlers();

  // 启动 HTTP 服务（接收浏览器插件的会话同步）
  startHttpServer();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
