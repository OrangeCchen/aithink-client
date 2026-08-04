// ASR Controller - 处理渲染进程的 ASR 相关请求
import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getASRService } from '../service/asr-service.js';
import { AudioRecorderService } from '../service/audio-recorder-service.js';
import { DashScopeASRService } from '../service/dashscope-asr-service.js';
import { loadConfig } from '../service/config-service.js';
import type {
  ASRConfig,
  AudioRecordingConfig
} from '../../shared/asr-types.js';
import {
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_ASR_CONFIG
} from '../../shared/asr-types.js';

let audioRecorder: AudioRecorderService | null = null;
let realtimeTranscriptionInterval: NodeJS.Timeout | null = null;
// 阿里云 DashScope 实时识别：整段录音期间保持一条 WS 连接
let dashscope: DashScopeASRService | null = null;

/**
 * 定位打包/开发环境下的 Sherpa 流式模型目录。
 * - 打包后：process.resourcesPath/models/zh-streaming（见 electron-builder.json extraResources）
 * - 开发时：__dirname = dist-electron/electron → 仓库根 resources/models/zh-streaming
 */
function resolveSherpaModelDir(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'models', 'zh-streaming'),
    // dev: __dirname = dist-electron/electron/controller → 仓库根需回退三级
    path.join(__dirname, '../../../resources/models/zh-streaming'),
    path.join(app.getAppPath(), 'resources/models/zh-streaming')
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'tokens.txt'))) return dir;
  }
  return candidates[1];
}

/** 在模型目录中按前缀匹配文件名（模型版本不同文件名会变，避免写死）。 */
function findModelFile(dir: string, pattern: RegExp): string {
  try {
    const name = fs.readdirSync(dir).find((f) => pattern.test(f));
    return name ? path.join(dir, name) : '';
  } catch {
    return '';
  }
}

export function registerASRHandlers() {
  const asrService = getASRService();

  // 初始化 ASR 引擎
  ipcMain.handle('asr:initialize', async (_event, config: ASRConfig) => {
    try {
      await asrService.initialize(config);
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize ASR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 创建转写会话
  ipcMain.handle('asr:createSession', async (_event, engine: string, name?: string) => {
    try {
      const session = asrService.createSession(engine as any, name);
      return { success: true, session };
    } catch (error) {
      console.error('Failed to create session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 开始实时录音+转写
  ipcMain.handle('asr:startRealtimeRecording', async (_event, audioConfig?: AudioRecordingConfig) => {
    try {
      // 创建音频录制器（两种引擎都用它保存 WAV 存档）
      const config = audioConfig || DEFAULT_AUDIO_CONFIG;
      audioRecorder = new AudioRecorderService(config);
      await audioRecorder.startRecording();

      const session = asrService.getCurrentSession();
      if (!session) {
        throw new Error('No active session');
      }

      // ── 阿里云 DashScope：开一条 WS，音频经 sendAudioData 直接转发，不跑 sherpa 轮询 ──
      if (session.engine === 'dashscope') {
        const appConfig = await loadConfig();
        const { apiKey, model } = appConfig.dashscopeAsr;
        if (!apiKey) {
          throw new Error('未配置 DashScope API Key，请在「设置 → 阿里云语音」中填写');
        }
        const mainWindow = BrowserWindow.getAllWindows()[0];
        dashscope = new DashScopeASRService(
          apiKey,
          model,
          config.sampleRate,
          session.id,
          {
            onSegment: (segment) => {
              mainWindow?.webContents.send('asr:realtimeSegment', {
                sessionId: session.id,
                segment,
                timestamp: Date.now()
              });
            },
            onError: (message) => {
              mainWindow?.webContents.send('asr:error', { message });
            }
          },
          appConfig.dashscopeAsr.diarizationEnabled
        );
        await dashscope.connect();
        return { success: true, sessionId: session.id };
      }

      // ── 本地 sherpa 引擎：定时处理缓冲音频（已移除模型，实际会在 initialize 报错） ──
      asrService.startRealtimeTranscription(session.id);

      // 启动实时转写处理（每隔一定时间处理缓冲的音频）
      if (realtimeTranscriptionInterval) {
        clearInterval(realtimeTranscriptionInterval);
      }

      realtimeTranscriptionInterval = setInterval(async () => {
        if (!audioRecorder || !audioRecorder.getIsRecording()) {
          return;
        }

        // 仅取自上次以来新增的音频（sherpa stream 有状态，不能重复喂整段）
        const audioData = audioRecorder.drainRealtimeAudio();
        if (audioData.length === 0) {
          return;
        }

        // 处理音频
        const segment = await asrService.processRealtimeAudio(
          audioData,
          config.sampleRate
        );

        // 如果有转写结果，发送给渲染进程
        if (segment) {
          const mainWindow = BrowserWindow.getAllWindows()[0];
          if (mainWindow) {
            mainWindow.webContents.send('asr:realtimeSegment', {
              sessionId: session.id,
              segment,
              timestamp: Date.now()
            });
          }
        }

      }, 1000); // 每秒处理一次（drainRealtimeAudio 只取增量，游标已推进）

      return { success: true, sessionId: session.id };
    } catch (error) {
      console.error('Failed to start realtime recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 接收来自渲染进程的音频数据（WebAudio API 捕获）
  ipcMain.handle('asr:sendAudioData', async (_event, audioData: number[]) => {
    try {
      if (!audioRecorder) {
        throw new Error('Audio recorder not initialized');
      }

      // 转换为 Int16Array，先存进录制器（用于保存 WAV）
      const int16Data = new Int16Array(audioData);
      audioRecorder.addAudioData(int16Data);

      // DashScope 引擎：把这帧 PCM（Int16 小端）转发到 WS
      if (dashscope) {
        dashscope.sendAudio(Buffer.from(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength));
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to send audio data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 停止实时录音+转写
  ipcMain.handle('asr:stopRealtimeRecording', async (_event) => {
    try {
      // 停止定时器
      if (realtimeTranscriptionInterval) {
        clearInterval(realtimeTranscriptionInterval);
        realtimeTranscriptionInterval = null;
      }

      // DashScope：发送 finish-task，等服务端返回尾句后自行关闭
      if (dashscope) {
        dashscope.finish();
        dashscope = null;
      }

      // 停止录音
      let audioFilePath: string | null = null;
      if (audioRecorder) {
        audioFilePath = await audioRecorder.stopRecording();
        audioRecorder = null;
      }

      // 停止转写
      const session = asrService.stopRealtimeTranscription();

      if (session && audioFilePath) {
        session.audioFilePath = audioFilePath;
      }

      return { success: true, session, audioFilePath };
    } catch (error) {
      console.error('Failed to stop realtime recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 转写音频文件（离线模式）
  ipcMain.handle('asr:transcribeFile', async (_event, audioFilePath: string, sessionId?: string) => {
    try {
      const current = asrService.getCurrentSession();
      const mainWindow = BrowserWindow.getAllWindows()[0];
      const sendProgress = (progress: number, sid: string) => {
        mainWindow?.webContents.send('asr:transcriptionProgress', { sessionId: sid, progress });
      };

      // ── 阿里云 DashScope：解析 WAV 后经实时 WS 推流转写 ──
      if (current?.engine === 'dashscope') {
        const appConfig = await loadConfig();
        const { apiKey, model } = appConfig.dashscopeAsr;
        if (!apiKey) {
          throw new Error('未配置 DashScope API Key，请在「设置 → 阿里云语音」中填写');
        }
        const { transcribeFileViaDashScope } = await import('../service/dashscope-asr-service.js');
        const { segments, durationSec } = await transcribeFileViaDashScope(
          audioFilePath,
          apiKey,
          model,
          current.id,
          (p) => sendProgress(p, current.id),
          appConfig.dashscopeAsr.diarizationEnabled
        );
        current.segments = segments;
        current.status = 'completed';
        current.audioFilePath = audioFilePath;
        current.duration = durationSec;
        current.endedAt = Date.now();
        return { success: true, session: current };
      }

      // ── 本地 sherpa 引擎 ──
      const session = await asrService.transcribeAudioFile(
        audioFilePath,
        sessionId,
        (progress) => sendProgress(progress, sessionId || session.id)
      );

      return { success: true, session };
    } catch (error) {
      console.error('Failed to transcribe file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 获取当前会话
  ipcMain.handle('asr:getCurrentSession', async (_event) => {
    try {
      const session = asrService.getCurrentSession();
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // 选择本地音频文件（返回真实路径；contextIsolation 下 File.path 不可用，必须走原生对话框）
  ipcMain.handle('asr:selectAudioFile', async () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return { canceled: true };

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择音频文件',
      buttonLabel: '选择',
      filters: [
        { name: '音频文件', extensions: ['wav'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    const filePath = result.filePaths[0];
    return { canceled: false, filePath, fileName: path.basename(filePath) };
  });

  // 获取指定引擎的默认配置与就绪状态（渲染进程据此提示用户）
  ipcMain.handle('asr:getDefaultConfig', async (_event, engine?: string) => {
    // 阿里云 DashScope：就绪 = 已配置 API Key（连接在开始录音时才建立）
    if (engine === 'dashscope') {
      const appConfig = await loadConfig();
      const hasKey = !!appConfig.dashscopeAsr.apiKey;
      const config: ASRConfig = { ...DEFAULT_ASR_CONFIG, engine: 'dashscope' };
      return {
        success: true,
        config,
        ready: hasKey,
        reason: hasKey ? '' : '未配置 DashScope API Key，请在「设置 → 阿里云语音」中填写',
        model: appConfig.dashscopeAsr.model
      };
    }

    // 本地 sherpa：解析模型文件路径判断就绪（模型已移除时 ready=false）
    const modelDir = resolveSherpaModelDir();
    const config: ASRConfig = {
      ...DEFAULT_ASR_CONFIG,
      sherpa: {
        ...DEFAULT_ASR_CONFIG.sherpa!,
        encoder: findModelFile(modelDir, /^encoder.*\.onnx$/),
        decoder: findModelFile(modelDir, /^decoder.*\.onnx$/),
        joiner: findModelFile(modelDir, /^joiner.*\.onnx$/),
        tokens: findModelFile(modelDir, /^tokens.*\.txt$/)
      }
    };
    const ready = !!(
      config.sherpa!.encoder &&
      config.sherpa!.decoder &&
      config.sherpa!.joiner &&
      config.sherpa!.tokens
    );
    return {
      success: true,
      config,
      modelDir,
      ready,
      reason: ready ? '' : `未找到 Sherpa 模型文件，请确认已放入：${modelDir}`
    };
  });

  // 清理资源
  ipcMain.handle('asr:cleanup', async (_event) => {
    try {
      if (realtimeTranscriptionInterval) {
        clearInterval(realtimeTranscriptionInterval);
        realtimeTranscriptionInterval = null;
      }

      if (dashscope) {
        dashscope.close();
        dashscope = null;
      }

      if (audioRecorder) {
        if (audioRecorder.getIsRecording()) {
          await audioRecorder.stopRecording();
        }
        audioRecorder = null;
      }

      asrService.cleanup();
      return { success: true };
    } catch (error) {
      console.error('Failed to cleanup ASR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
