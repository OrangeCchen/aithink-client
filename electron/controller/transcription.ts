import { BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { basename, dirname, extname, join } from 'path';
import { promises as fs } from 'fs';
import type {
  CreateFromTextRequest,
  EnqueueTranscriptionRequest,
  GenerateMinutesRequest,
  RecordIdRequest,
  RenameTranscriptionRequest,
  ReviseMinutesRequest,
  RewriteMinutesSelectionRequest,
  StartTranscriptionRequest,
  TranscriptionProgressEvent,
  TranscriptionRecord,
  TranscriptionStage,
  UpdateMinutesRequest,
  UpdateTranscriptRequest
} from '../../shared/transcription-types.js';
import { loadConfig, saveConfig } from '../service/config-service.js';
import { convertToWhisperWav } from '../service/audio-converter.js';
import { WhisperTranscriptionService } from '../service/whisper-transcription-service.js';
import {
  generateMeetingMinutes,
  generateMinutesTitle,
  reviseMeetingMinutes,
  rewriteMinutesSelection
} from '../service/meeting-minutes-service.js';
import {
  buildMinutesDoneNotify,
  notifyDesktop
} from '../service/desktop-notify.js';
import {
  deleteTranscriptionRecord,
  getTranscriptionRecord,
  listTranscriptionRecords,
  saveTranscriptionRecord
} from '../service/transcription-repository.js';

const whisper = new WhisperTranscriptionService();
const activeControllers = new Map<string, AbortController>();
/** 仅统计 Whisper 媒体转写占用；纪要生成不占坑，便于排队转写下一项 */
let runningMediaJobs = 0;
const IN_FLIGHT_STAGES: TranscriptionStage[] = [
  'idle',
  'converting',
  'loading-model',
  'transcribing',
  'summarizing'
];

function notify(event: TranscriptionProgressEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('transcription:progress', event);
  }
}

function updateProgress(
  record: TranscriptionRecord,
  stage: TranscriptionStage,
  progress: number,
  message: string
): void {
  record.stage = stage;
  record.progress = Math.max(0, Math.min(100, progress));
  record.updatedAt = Date.now();
  notify({ id: record.id, stage, progress: record.progress, message });
}

/** 基于已有转写生成纪要；失败时保留转写，阶段回落 ready 便于手动重试 */
async function generateMinutesForRecord(
  record: TranscriptionRecord,
  signal: AbortSignal,
  options?: { notifyOnSuccess?: boolean }
): Promise<void> {
  if (!record.transcript.trim()) {
    updateProgress(record, 'ready', 100, '转写完成，但内容为空，无法生成纪要');
    await saveTranscriptionRecord(record);
    return;
  }

  record.error = undefined;
  const sourceKind = record.sourceType === 'dictation' ? 'dictation' : 'media';
  updateProgress(
    record,
    'summarizing',
    8,
    sourceKind === 'dictation' ? '正在根据听写生成会议纪要' : '转写完成，正在生成会议纪要'
  );
  await saveTranscriptionRecord(record);

  try {
    record.minutes = await generateMeetingMinutes(
      record.transcript,
      signal,
      (progress, message) =>
        updateProgress(
          record,
          'summarizing',
          // 保底不低于 8%，避免界面长时间停在 0%
          Math.max(8, Math.round(progress * 100)),
          message
        ),
      sourceKind
    );

    // 听写记录：纪要完成后按内容重写 ≤15 字摘要标题
    if (sourceKind === 'dictation' && record.minutes.trim()) {
      updateProgress(record, 'summarizing', 92, '正在生成标题');
      try {
        const title = await generateMinutesTitle(record.minutes, signal);
        if (title) record.fileName = title;
      } catch (titleError: any) {
        console.warn(
          '[transcription] dictation title generation failed:',
          titleError?.message || titleError
        );
      }
    }

    updateProgress(record, 'completed', 100, '会议纪要已生成');
    await saveTranscriptionRecord(record);
    if (options?.notifyOnSuccess !== false) {
      notifyDesktop(buildMinutesDoneNotify(record.fileName, record.minutes));
    }
  } catch (error: any) {
    if (signal.aborted || error?.name === 'AbortError') {
      updateProgress(record, 'ready', 100, '纪要生成已取消，转写已保留');
    } else {
      record.error = error?.message || '纪要生成失败';
      updateProgress(record, 'ready', 100, '转写完成，纪要生成失败，可手动重试');
      notifyDesktop({
        title: '转写完成 · 纪要失败',
        subtitle: record.fileName.replace(/\.[^.]+$/, '') || record.fileName,
        body: `转写已保留，纪要生成失败：${record.error}`
      });
    }
    await saveTranscriptionRecord(record);
  }
}

/** 启动时清理上次异常退出遗留的“进行中”状态 */
export async function reconcileInterruptedTranscriptions(): Promise<void> {
  const records = await listTranscriptionRecords();
  await Promise.all(
    records
      .filter((record) => IN_FLIGHT_STAGES.includes(record.stage))
      .map(async (record) => {
        record.stage = 'cancelled';
        record.error = '上次退出应用时任务被中断，请重新转写';
        record.updatedAt = Date.now();
        await saveTranscriptionRecord(record);
      })
  );
}

/** 退出前取消进行中的转写/纪要任务 */
export async function interruptActiveTranscriptions(): Promise<void> {
  const ids = [...activeControllers.keys()];
  for (const id of ids) {
    activeControllers.get(id)?.abort();
  }
  whisper.cancel();
  await Promise.all(
    ids.map(async (id) => {
      const record = await getTranscriptionRecord(id);
      if (!record || !IN_FLIGHT_STAGES.includes(record.stage)) return;
      record.stage = 'cancelled';
      record.error = '应用退出，转写已中断';
      record.updatedAt = Date.now();
      await saveTranscriptionRecord(record);
    })
  );
  activeControllers.clear();
}

function runTranscriptionJob(record: TranscriptionRecord, controller: AbortController): void {
  void (async () => {
    let converted: Awaited<ReturnType<typeof convertToWhisperWav>> | null = null;
    const startedAt = Date.now();
    let holdingMediaSlot = false;
    try {
      if (!record.sourcePath) throw new Error('缺少音视频文件路径');
      if (!record.modelPath) throw new Error('缺少 Whisper 模型路径');
      const sourcePath = record.sourcePath;
      const modelPath = record.modelPath;
      record.error = undefined;
      runningMediaJobs += 1;
      holdingMediaSlot = true;
      updateProgress(record, 'converting', 1, '正在转换音频格式');
      await saveTranscriptionRecord(record);

      converted = await convertToWhisperWav(
        sourcePath,
        controller.signal,
        (progress) =>
          updateProgress(
            record,
            'converting',
            1 + Math.round(progress * 14),
            '正在转换音频格式'
          )
      );

      const result = await whisper.transcribe(
        modelPath,
        converted.path,
        controller.signal,
        (stage) => {
          updateProgress(
            record,
            stage,
            stage === 'loading-model' ? 16 : 22,
            stage === 'loading-model' ? '正在加载本地模型' : '正在本地转写'
          );
        },
        (progress) =>
          updateProgress(
            record,
            'transcribing',
            22 + Math.round(progress * 0.73),
            '正在本地转写'
          )
      );

      record.language = result.language;
      record.duration = result.duration;
      record.processingMs = Date.now() - startedAt;
      record.segments = result.segments;
      record.transcript = result.transcript;
      await saveTranscriptionRecord(record);

      // 转写结束即释放媒体坑位，纪要并行生成，不阻塞队列中的下一个文件
      runningMediaJobs = Math.max(0, runningMediaJobs - 1);
      holdingMediaSlot = false;

      await generateMinutesForRecord(record, controller.signal);
    } catch (error: any) {
      if (record.stage === 'ready' || record.stage === 'completed' || record.stage === 'summarizing') {
        return;
      }
      record.processingMs = Date.now() - startedAt;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        updateProgress(record, 'cancelled', record.progress, '任务已取消');
      } else {
        record.error = error?.message || '转写失败';
        updateProgress(record, 'error', record.progress, record.error || '转写失败');
        notifyDesktop({
          title: '转写失败',
          subtitle: record.fileName.replace(/\.[^.]+$/, '') || record.fileName,
          body: record.error || '转写失败'
        });
      }
      await saveTranscriptionRecord(record);
    } finally {
      if (holdingMediaSlot) {
        runningMediaJobs = Math.max(0, runningMediaJobs - 1);
      }
      activeControllers.delete(record.id);
      await converted?.cleanup();
    }
  })();
}

/** 更新记录标题：听写仅改 fileName；媒体同步重命名磁盘文件 */
async function applyRecordFileName(
  record: TranscriptionRecord,
  fileName: string
): Promise<TranscriptionRecord> {
  const raw = (fileName || '').trim();
  if (!raw) throw new Error('请输入文件名');
  if (/[\\/]/.test(raw)) throw new Error('文件名不能包含路径');

  const cleaned = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('文件名无效');
  }

  const isDictation = record.sourceType === 'dictation' || !record.sourcePath;

  if (isDictation) {
    if (cleaned === record.fileName) return record;
    record.fileName = cleaned;
    record.updatedAt = Date.now();
    await saveTranscriptionRecord(record);
    return record;
  }

  const oldExt = extname(record.fileName || record.sourcePath || '');
  const nextName = extname(cleaned) ? cleaned : `${cleaned}${oldExt}`;
  if (nextName === record.fileName) return record;

  const sourcePath = record.sourcePath!;
  const sourceDir = dirname(sourcePath);
  const nextPath = join(sourceDir, nextName);

  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error('原始文件不存在或无法访问，无法重命名');
  }

  if (nextPath !== sourcePath) {
    const sourceStat = await fs.stat(sourcePath);
    const targetStat = await fs.stat(nextPath).catch(() => null);
    const sameFile =
      targetStat != null
      && targetStat.dev === sourceStat.dev
      && targetStat.ino === sourceStat.ino;

    if (targetStat && !sameFile) {
      throw new Error(`同目录已存在「${nextName}」`);
    }

    try {
      if (sameFile) {
        const tempPath = join(sourceDir, `.${record.id}.rename-tmp${oldExt || extname(nextName)}`);
        await fs.rename(sourcePath, tempPath);
        await fs.rename(tempPath, nextPath);
      } else {
        await fs.rename(sourcePath, nextPath);
      }
    } catch (error: any) {
      throw new Error(error?.message || '重命名文件失败');
    }
  }

  record.fileName = nextName;
  record.sourcePath = nextPath;
  record.updatedAt = Date.now();
  await saveTranscriptionRecord(record);
  return record;
}

export function registerTranscriptionHandlers(): void {
  ipcMain.handle('transcription:select-file', async () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return { canceled: true };
    const result = await dialog.showOpenDialog(window, {
      title: '选择要转写的音频或视频（可多选）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音频和视频',
          extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'mp4', 'mov', 'mkv', 'webm']
        },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const files = result.filePaths.map((filePath) => ({
      filePath,
      fileName: basename(filePath)
    }));
    return {
      canceled: false,
      files,
      // 兼容旧字段
      filePath: files[0].filePath,
      fileName: files[0].fileName
    };
  });

  ipcMain.handle('transcription:select-model', async () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return { canceled: true };
    const result = await dialog.showOpenDialog(window, {
      title: '选择 Whisper GGML 模型',
      properties: ['openFile'],
      filters: [{ name: 'Whisper GGML 模型', extensions: ['bin'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const modelPath = result.filePaths[0];
    const stat = await fs.stat(modelPath);
    if (!stat.isFile() || stat.size < 1024 * 1024) {
      throw new Error('所选文件不是有效的 Whisper GGML 模型');
    }
    const config = await loadConfig();
    config.transcription.modelPath = modelPath;
    await saveConfig(config);
    return { canceled: false, modelPath };
  });

  ipcMain.handle('transcription:get-config', async () => {
    const config = await loadConfig();
    const modelPath = config.transcription.modelPath;
    const ready = Boolean(modelPath && (await fs.stat(modelPath).catch(() => null))?.isFile());
    return { modelPath, ready };
  });

  /** 批量入队：立刻落库为 queued，界面可立即看到全部任务 */
  ipcMain.handle(
    'transcription:enqueue',
    async (_event, request: EnqueueTranscriptionRequest) => {
      const config = await loadConfig();
      if (!config.transcription.modelPath) {
        throw new Error('请先选择 Whisper GGML 模型');
      }
      const filePaths = (request.filePaths || []).filter(Boolean);
      if (!filePaths.length) throw new Error('请选择要转写的文件');

      const created: TranscriptionRecord[] = [];
      for (const filePath of filePaths) {
        const now = Date.now();
        const record: TranscriptionRecord = {
          id: randomUUID(),
          fileName: basename(filePath),
          sourcePath: filePath,
          modelPath: config.transcription.modelPath,
          sourceType: 'media',
          stage: 'queued',
          progress: 0,
          createdAt: now,
          updatedAt: now,
          segments: [],
          transcript: '',
          minutes: ''
        };
        await saveTranscriptionRecord(record);
        updateProgress(record, 'queued', 0, '排队等待中');
        created.push(record);
      }
      return created;
    }
  );

  ipcMain.handle(
    'transcription:start',
    async (_event, request: StartTranscriptionRequest) => {
      const config = await loadConfig();
      if (!config.transcription.modelPath) {
        throw new Error('请先选择 Whisper GGML 模型');
      }
      if (runningMediaJobs > 0) {
        throw new Error('已有转写任务进行中，请等待完成或取消后再试');
      }

      let record: TranscriptionRecord | null = null;
      if (request.id) {
        record = await getTranscriptionRecord(request.id);
        if (!record) throw new Error('转写记录不存在');
        if (!['queued', 'idle', 'cancelled', 'error'].includes(record.stage)) {
          throw new Error('该任务当前不可开始');
        }
        record.modelPath = config.transcription.modelPath;
        record.error = undefined;
      } else if (request.filePath) {
        const now = Date.now();
        record = {
          id: randomUUID(),
          fileName: basename(request.filePath),
          sourcePath: request.filePath,
          modelPath: config.transcription.modelPath,
          sourceType: 'media',
          stage: 'idle',
          progress: 0,
          createdAt: now,
          updatedAt: now,
          segments: [],
          transcript: '',
          minutes: ''
        };
      } else {
        throw new Error('缺少转写任务参数');
      }

      const controller = new AbortController();
      activeControllers.set(record.id, controller);
      await saveTranscriptionRecord(record);
      runTranscriptionJob(record, controller);
      return record;
    }
  );

  ipcMain.handle('transcription:cancel', async (_event, request: RecordIdRequest) => {
    const record = await getTranscriptionRecord(request.id);
    if (record?.stage === 'queued') {
      updateProgress(record, 'cancelled', 0, '已从队列取消');
      await saveTranscriptionRecord(record);
      return { success: true };
    }
    activeControllers.get(request.id)?.abort();
    whisper.cancel();
    return { success: true };
  });

  ipcMain.handle(
    'transcription:update-transcript',
    async (_event, request: UpdateTranscriptRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      record.transcript = request.transcript;
      await saveTranscriptionRecord(record);
      return record;
    }
  );

  ipcMain.handle(
    'transcription:update-minutes',
    async (_event, request: UpdateMinutesRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      record.minutes = request.minutes;
      record.updatedAt = Date.now();
      await saveTranscriptionRecord(record);
      return record;
    }
  );

  ipcMain.handle(
    'transcription:generate-minutes',
    async (_event, request: GenerateMinutesRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      if (activeControllers.has(record.id)) throw new Error('该任务正在处理中');
      const controller = new AbortController();
      activeControllers.set(record.id, controller);
      record.transcript = request.transcript;
      try {
        await generateMinutesForRecord(record, controller.signal);
        return (await getTranscriptionRecord(record.id)) || record;
      } finally {
        activeControllers.delete(record.id);
      }
    }
  );

  ipcMain.handle(
    'transcription:rewrite-selection',
    async (_event, request: RewriteMinutesSelectionRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      if (activeControllers.has(record.id)) throw new Error('该任务正在处理中');
      const controller = new AbortController();
      activeControllers.set(record.id, controller);
      try {
        const rewritten = await rewriteMinutesSelection(
          request.selectedText,
          request.opinion,
          request.fullMinutes || record.minutes,
          controller.signal
        );
        return { text: rewritten };
      } finally {
        activeControllers.delete(record.id);
      }
    }
  );

  /** 按意见全局修订整篇会议纪要并落库 */
  ipcMain.handle(
    'transcription:revise-minutes',
    async (_event, request: ReviseMinutesRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      if (activeControllers.has(record.id)) throw new Error('该任务正在处理中');
      const source = (request.fullMinutes || record.minutes || '').trim();
      if (!source) throw new Error('会议纪要为空，无法修改');

      const controller = new AbortController();
      activeControllers.set(record.id, controller);
      try {
        updateProgress(record, 'summarizing', 5, '正在按意见修改整篇纪要');
        await saveTranscriptionRecord(record);
        record.minutes = await reviseMeetingMinutes(
          source,
          request.opinion,
          controller.signal,
          (progress, message) =>
            updateProgress(record, 'summarizing', Math.round(progress * 100), message)
        );
        record.error = undefined;
        updateProgress(record, 'completed', 100, '纪要已按意见修改');
        await saveTranscriptionRecord(record);
        notifyDesktop({
          title: '纪要已修订',
          subtitle: record.fileName.replace(/\.[^.]+$/, '') || record.fileName,
          body: `「${record.fileName.replace(/\.[^.]+$/, '') || record.fileName}」已按意见更新`
        });
        return record;
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          updateProgress(record, record.minutes ? 'completed' : 'ready', 100, '修改已取消');
        } else {
          record.error = error?.message || '全局修改失败';
          updateProgress(
            record,
            record.minutes ? 'completed' : 'ready',
            100,
            record.error || '全局修改失败'
          );
          notifyDesktop({
            title: '纪要修订失败',
            subtitle: record.fileName.replace(/\.[^.]+$/, '') || record.fileName,
            body: record.error || '全局修改失败'
          });
        }
        await saveTranscriptionRecord(record);
        throw error;
      } finally {
        activeControllers.delete(record.id);
      }
    }
  );

  ipcMain.handle('transcription:list', () => listTranscriptionRecords());
  ipcMain.handle('transcription:get', (_event, request: RecordIdRequest) =>
    getTranscriptionRecord(request.id)
  );
  ipcMain.handle('transcription:delete', async (_event, request: RecordIdRequest) => {
    activeControllers.get(request.id)?.abort();
    await deleteTranscriptionRecord(request.id);
    return { success: true };
  });

  /** 从粘贴的听写文本创建记录（无音频），由前端再调 generate-minutes */
  ipcMain.handle(
    'transcription:create-from-text',
    async (_event, request: CreateFromTextRequest) => {
      const transcript = (request.transcript || '').trim();
      if (!transcript) throw new Error('请粘贴听写文本');

      const now = Date.now();
      const titleRaw = (request.title || '').trim().replace(/[\\/:*?"<>|]/g, '_');
      const stamp = new Date(now).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(/\//g, '-');
      const fileName = titleRaw || `听写纪要 ${stamp}`;

      const record: TranscriptionRecord = {
        id: randomUUID(),
        fileName,
        sourceType: 'dictation',
        stage: 'ready',
        progress: 100,
        createdAt: now,
        updatedAt: now,
        segments: [],
        transcript,
        minutes: ''
      };
      await saveTranscriptionRecord(record);
      return record;
    }
  );

  /** 重命名：有源文件则改磁盘文件；听写文本仅改记录名称 */
  ipcMain.handle(
    'transcription:rename',
    async (_event, request: RenameTranscriptionRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');

      if (['converting', 'loading-model', 'transcribing'].includes(record.stage)) {
        throw new Error('转写进行中，请完成或取消后再重命名');
      }

      return applyRecordFileName(record, request.fileName);
    }
  );

  /** 根据会议纪要生成 ≤15 字摘要标题，并同步更新列表标题 */
  ipcMain.handle(
    'transcription:generate-title',
    async (_event, request: RecordIdRequest) => {
      const record = await getTranscriptionRecord(request.id);
      if (!record) throw new Error('转写记录不存在');
      if (!record.minutes?.trim()) throw new Error('请先生成会议纪要');
      if (activeControllers.has(record.id)) throw new Error('该任务正在处理中');

      const controller = new AbortController();
      activeControllers.set(record.id, controller);
      try {
        const title = await generateMinutesTitle(record.minutes, controller.signal);
        if (!title) throw new Error('未能生成标题，请重试');
        return applyRecordFileName(record, title);
      } finally {
        activeControllers.delete(record.id);
      }
    }
  );

  ipcMain.handle('transcription:export', async (_event, request: RecordIdRequest) => {
    const record = await getTranscriptionRecord(request.id);
    if (!record) throw new Error('转写记录不存在');
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return { canceled: true };
    const defaultName = record.fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?\"<>|]/g, '_');
    const result = await dialog.showSaveDialog(window, {
      title: '导出会议纪要',
      defaultPath: `${defaultName}-会议纪要.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const content = `${record.minutes || '# 会议纪要\n\n尚未生成会议纪要'}\n\n---\n\n# 转写全文\n\n${record.transcript}\n`;
    await fs.writeFile(result.filePath, content, 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });
}
