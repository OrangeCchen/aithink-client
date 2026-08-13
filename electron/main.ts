import { app, BrowserWindow, ipcMain, shell, dialog, protocol } from 'electron';
import { join } from 'path';
import { registerChatHandlers } from './controller/chat.js';
import { registerConfigHandlers } from './controller/config.js';
import { registerRecordingHandlers } from './controller/recording.js';
import {
  interruptActiveTranscriptions,
  reconcileInterruptedTranscriptions,
  registerTranscriptionHandlers
} from './controller/transcription.js';
import { registerSkillHandlers } from './controller/skill.js';
import { registerSpaceHandlers } from './controller/space.js';
import { registerExternalTaskHandlers } from './controller/external-task.js';
import { registerExamProfileHandlers } from './controller/exam-profile.js';
import { loadConfig } from './service/config-service.js';
import { startHttpServer, getLastExtensionPing } from './service/http-server.js';
import { registerMediaProtocol } from './service/media-protocol.js';
import { shutdownExternalTaskExecutor } from './service/external-task-executor.js';

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aithink-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
]);

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

ipcMain.handle('dialog:open-syllabus-file', async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择考纲文件',
    filters: [
      { name: '考纲', extensions: ['json', 'md', 'markdown'] },
      { name: '全部', extensions: ['*'] }
    ],
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
    const baseUrl = ((config as any).qwen?.baseUrl || '').trim();

    if (!apiKey) {
      return { status: 'error', error: '未配置 API Key' };
    }

    // baseUrl 通常已含 /compatible-mode/v1，勿再拼一层 /v1
    const base = (baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(
      /\/+$/,
      ''
    );
    const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        return { status: 'connected' };
      }
      if (resp.status === 401 || resp.status === 403) {
        return { status: 'error', error: 'API Key 无效' };
      }
      return { status: 'error', error: `HTTP ${resp.status}` };
    } catch {
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
  app.setName('AIThink');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aithink.client');
  }

  registerMediaProtocol();

  // 初始化配置（首次启动会创建默认配置）
  await loadConfig();

  // 注册 IPC 处理器
  await registerChatHandlers();
  await registerSpaceHandlers();
  await registerExamProfileHandlers();
  registerConfigHandlers();
  registerRecordingHandlers();
  registerTranscriptionHandlers();
  registerSkillHandlers();
  registerExternalTaskHandlers();
  await reconcileInterruptedTranscriptions();

  // 启动 HTTP 服务（接收浏览器插件的会话同步）
  startHttpServer();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let quitting = false;
app.on('before-quit', async (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  try {
    await interruptActiveTranscriptions();
    await shutdownExternalTaskExecutor();
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
