import { computed, ref } from 'vue';
import type {
  TranscriptionProgressEvent,
  TranscriptionRecord,
  TranscriptionStage
} from '@shared/transcription-types';

export interface ActiveTranscriptionTask {
  id: string | null;
  fileName: string;
  stage: TranscriptionStage;
  progress: number;
  message: string;
}

export interface SelectedMediaFile {
  path: string;
  name: string;
}

export interface TranscriptionAttention {
  unreadCompletedIds: string[];
  failedIds: string[];
}

const ATTENTION_KEY = 'aithink.transcription.attention';

/** 模块级单例：主侧栏与转写页共享同一份任务进度 */
const records = ref<TranscriptionRecord[]>([]);
const current = ref<TranscriptionRecord | null>(null);
const selectedFiles = ref<SelectedMediaFile[]>([]);
const modelPath = ref('');
const modelReady = ref(false);
const activeId = ref<string | null>(null);
const activeTask = ref<ActiveTranscriptionTask | null>(null);
/** 正在生成纪要的记录（可与媒体转写并行，不占用 busy） */
const minutesActiveId = ref<string | null>(null);
const progress = ref(0);
const progressMessage = ref('');
const error = ref('');
const hydrated = ref(false);
const attention = ref<TranscriptionAttention>(loadAttention());

/** 仅媒体 Whisper 占用；纪要生成不排队、不挡听写 */
const busy = computed(() => Boolean(activeId.value));
const minutesBusy = computed(() => Boolean(minutesActiveId.value));
const queuedRecords = computed(() =>
  records.value
    .filter((record) => record.stage === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)
);
const queueLength = computed(() => queuedRecords.value.length);

const unreadCompletedCount = computed(() => attention.value.unreadCompletedIds.length);
const failedCount = computed(() => attention.value.failedIds.length);
const hasAttention = computed(
  () => unreadCompletedCount.value > 0 || failedCount.value > 0
);

let bootstrapped = false;
let drainingQueue = false;
let unsubscribeProgress: (() => void) | null = null;

function loadAttention(): TranscriptionAttention {
  try {
    const raw = localStorage.getItem(ATTENTION_KEY);
    if (!raw) return { unreadCompletedIds: [], failedIds: [] };
    const parsed = JSON.parse(raw) as Partial<TranscriptionAttention>;
    return {
      unreadCompletedIds: Array.isArray(parsed.unreadCompletedIds)
        ? parsed.unreadCompletedIds.filter((id) => typeof id === 'string')
        : [],
      failedIds: Array.isArray(parsed.failedIds)
        ? parsed.failedIds.filter((id) => typeof id === 'string')
        : []
    };
  } catch {
    return { unreadCompletedIds: [], failedIds: [] };
  }
}

function persistAttention() {
  localStorage.setItem(ATTENTION_KEY, JSON.stringify(attention.value));
}

function addUnique(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

function markAttentionFromEvent(event: TranscriptionProgressEvent) {
  if (event.stage === 'cancelled') return;

  if (event.stage === 'completed') {
    attention.value = {
      unreadCompletedIds: addUnique(attention.value.unreadCompletedIds, event.id),
      failedIds: attention.value.failedIds.filter((id) => id !== event.id)
    };
    persistAttention();
    return;
  }

  if (event.stage === 'error') {
    attention.value = {
      unreadCompletedIds: attention.value.unreadCompletedIds.filter((id) => id !== event.id),
      failedIds: addUnique(attention.value.failedIds, event.id)
    };
    persistAttention();
    return;
  }

  // 纪要失败时常回落到 ready，并带失败文案
  if (
    event.stage === 'ready'
    && (event.message.includes('失败') || Boolean(records.value.find((r) => r.id === event.id)?.error))
  ) {
    attention.value = {
      unreadCompletedIds: attention.value.unreadCompletedIds.filter((id) => id !== event.id),
      failedIds: addUnique(attention.value.failedIds, event.id)
    };
    persistAttention();
  }
}

function pruneAttention(existingIds: Set<string>) {
  const next: TranscriptionAttention = {
    unreadCompletedIds: attention.value.unreadCompletedIds.filter((id) => existingIds.has(id)),
    failedIds: attention.value.failedIds.filter((id) => existingIds.has(id))
  };
  if (
    next.unreadCompletedIds.length !== attention.value.unreadCompletedIds.length
    || next.failedIds.length !== attention.value.failedIds.length
  ) {
    attention.value = next;
    persistAttention();
  }
}

/** 点击主菜单「文件转写」时清除角标 */
export function clearTranscriptionAttention() {
  attention.value = { unreadCompletedIds: [], failedIds: [] };
  persistAttention();
}

function attentionFileNames(ids: string[], limit = 3): string[] {
  return ids
    .map((id) => records.value.find((record) => record.id === id)?.fileName || '未命名文件')
    .slice(0, limit);
}

const attentionTooltip = computed(() => {
  const parts: string[] = [];
  const unreadIds = attention.value.unreadCompletedIds;
  const failIds = attention.value.failedIds;

  if (unreadIds.length) {
    const names = attentionFileNames(unreadIds);
    const more = unreadIds.length > names.length ? ` 等 ${unreadIds.length} 项` : '';
    parts.push(`已完成未查看：${names.join('、')}${more}`);
  }
  if (failIds.length) {
    const names = attentionFileNames(failIds);
    const more = failIds.length > names.length ? ` 等 ${failIds.length} 项` : '';
    parts.push(`失败：${names.join('、')}${more}`);
  }
  return parts.join('\n');
});

function mergeSelectedFiles(
  existing: SelectedMediaFile[],
  incoming: SelectedMediaFile[]
): SelectedMediaFile[] {
  const map = new Map(existing.map((file) => [file.path, file]));
  for (const file of incoming) map.set(file.path, file);
  return [...map.values()];
}

async function loadConfig() {
  const config = await window.electronAPI.invoke('transcription:get-config');
  modelPath.value = config.modelPath || '';
  modelReady.value = Boolean(config.ready);
}

async function loadRecords() {
  records.value = await window.electronAPI.invoke('transcription:list');
  if (current.value) {
    current.value = records.value.find((record) => record.id === current.value?.id) || current.value;
  }
  pruneAttention(new Set(records.value.map((record) => record.id)));
}

function bindListeners() {
  if (unsubscribeProgress) return;

  unsubscribeProgress = window.electronAPI.on(
    'transcription:progress',
    (event: TranscriptionProgressEvent) => {
      const terminal = ['completed', 'ready', 'error', 'cancelled'].includes(event.stage);
      const fileName = activeTask.value?.fileName
        || records.value.find((record) => record.id === event.id)?.fileName
        || current.value?.fileName
        || '转写任务';

      progress.value = event.progress;
      progressMessage.value = event.message;

      const record = records.value.find((item) => item.id === event.id);
      if (record) {
        record.stage = event.stage;
        record.progress = event.progress;
        record.updatedAt = Date.now();
        if (event.stage === 'error') record.error = event.message;
      }
      if (current.value?.id === event.id) {
        current.value = {
          ...current.value,
          stage: event.stage,
          progress: event.progress,
          updatedAt: Date.now(),
          error: event.stage === 'error' ? event.message : current.value.error
        };
      }

      if (event.stage === 'queued') {
        return;
      }

      if (terminal) {
        markAttentionFromEvent(event);
        if (activeId.value === event.id || activeId.value === 'pending') {
          activeId.value = null;
        }
        if (minutesActiveId.value === event.id) {
          minutesActiveId.value = null;
        }
        if (activeTask.value?.id === event.id || activeTask.value?.id == null) {
          activeTask.value = null;
        }
        void loadRecords().then(() => drainJobQueue());
        return;
      }

      // 纪要阶段不占媒体 busy；仅在刚释放媒体坑位时推进队列，避免每次进度都抢占/重入
      if (event.stage === 'summarizing') {
        const releasedMedia = activeId.value === event.id;
        if (releasedMedia) {
          activeId.value = null;
        }
        minutesActiveId.value = event.id;
        // 无媒体任务时始终展示纪要进度；有媒体时不抢侧栏
        if (!activeId.value || activeTask.value?.id === event.id) {
          activeTask.value = {
            id: event.id,
            fileName,
            stage: event.stage,
            progress: event.progress,
            message: event.message
          };
        }
        if (releasedMedia) {
          void drainJobQueue();
        }
        return;
      }

      activeId.value = event.id;
      activeTask.value = {
        id: event.id,
        fileName,
        stage: event.stage,
        progress: event.progress,
        message: event.message
      };
    }
  );
}

/** 应用启动时调用一次，保证离开转写页仍能收到进度 */
export async function bootstrapFileTranscription() {
  if (bootstrapped) return;
  bootstrapped = true;
  bindListeners();
  await Promise.all([loadConfig(), loadRecords()]);
  hydrated.value = true;
  void drainJobQueue();
}

async function chooseModel() {
  error.value = '';
  const result = await window.electronAPI.invoke('transcription:select-model');
  if (!result.canceled) {
    modelPath.value = result.modelPath;
    modelReady.value = true;
  }
}

async function chooseFile() {
  error.value = '';
  const result = await window.electronAPI.invoke('transcription:select-file');
  if (result.canceled) return;
  const files: SelectedMediaFile[] = Array.isArray(result.files)
    ? result.files.map((file: { filePath: string; fileName: string }) => ({
        path: file.filePath,
        name: file.fileName
      }))
    : result.filePath
      ? [{ path: result.filePath, name: result.fileName }]
      : [];
  if (!files.length) return;
  selectedFiles.value = mergeSelectedFiles(selectedFiles.value, files);
}

function setDroppedFile(file: File) {
  setDroppedFiles([file]);
}

function setDroppedFiles(files: FileList | File[]) {
  const list = Array.from(files);
  if (!list.length) return;
  error.value = '';
  const mediaExt = /\.(wav|mp3|m4a|aac|flac|mp4|mov|mkv|webm)$/i;
  const incoming: SelectedMediaFile[] = [];
  for (const file of list) {
    if (!mediaExt.test(file.name) && list.length > 1) continue;
    const path = window.electronAPI.getPathForFile(file);
    if (!path) continue;
    incoming.push({ path, name: file.name });
  }
  if (!incoming.length) {
    error.value = '无法读取拖入文件的本地路径，或格式不受支持';
    return;
  }
  selectedFiles.value = mergeSelectedFiles(selectedFiles.value, incoming);
}

function removeSelectedFile(path: string) {
  selectedFiles.value = selectedFiles.value.filter((file) => file.path !== path);
}

function clearSelectedFiles() {
  selectedFiles.value = [];
}

async function startQueuedRecord(recordId: string) {
  error.value = '';
  const queued = records.value.find((item) => item.id === recordId);
  progress.value = 0;
  progressMessage.value = '正在创建任务';
  activeTask.value = {
    id: recordId,
    fileName: queued?.fileName || '转写任务',
    stage: 'idle',
    progress: 0,
    message: '正在创建任务'
  };
  activeId.value = recordId;
  try {
    const record: TranscriptionRecord = await window.electronAPI.invoke(
      'transcription:start',
      { id: recordId }
    );
    current.value = record;
    activeId.value = record.id;
    activeTask.value = {
      id: record.id,
      fileName: record.fileName,
      stage: record.stage,
      progress: record.progress,
      message: '转写已开始'
    };
    await loadRecords();
    return record;
  } catch (reason: any) {
    error.value = reason?.message || '启动转写失败';
    activeId.value = null;
    activeTask.value = null;
    await loadRecords();
    return null;
  }
}

async function drainJobQueue() {
  if (drainingQueue || busy.value) return;
  drainingQueue = true;
  try {
    while (!busy.value) {
      await loadRecords();
      const next = records.value
        .filter((record) => record.stage === 'queued')
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!next) break;
      const record = await startQueuedRecord(next.id);
      if (!record) continue;
      break;
    }
  } finally {
    drainingQueue = false;
  }
}

/** 多选文件立刻全部入队展示，再按序开始转写 */
async function startTranscription() {
  if (!selectedFiles.value.length || !modelReady.value) return null;
  error.value = '';
  const filePaths = selectedFiles.value.map((file) => file.path);
  selectedFiles.value = [];
  try {
    await window.electronAPI.invoke('transcription:enqueue', { filePaths });
    await loadRecords();
    await drainJobQueue();
    return current.value;
  } catch (reason: any) {
    error.value = reason?.message || '加入转写队列失败';
    return null;
  }
}

/** 从粘贴听写文本创建记录（不经 Whisper） */
async function createFromText(transcript: string, title?: string) {
  error.value = '';
  try {
    const record: TranscriptionRecord = await window.electronAPI.invoke(
      'transcription:create-from-text',
      { transcript, title }
    );
    current.value = record;
    await loadRecords();
    return record;
  } catch (reason: any) {
    error.value = reason?.message || '创建听写记录失败';
    return null;
  }
}

async function cancel() {
  if (!activeTask.value?.id) return;
  await window.electronAPI.invoke('transcription:cancel', { id: activeTask.value.id });
}

async function cancelQueued(record: TranscriptionRecord) {
  if (record.stage !== 'queued') return;
  await window.electronAPI.invoke('transcription:cancel', { id: record.id });
  await loadRecords();
}

async function selectRecord(record: TranscriptionRecord) {
  current.value = await window.electronAPI.invoke('transcription:get', { id: record.id });
  error.value = '';
  progress.value = current.value?.progress || 0;
}

async function saveTranscript(transcript: string) {
  if (!current.value) return;
  current.value = await window.electronAPI.invoke('transcription:update-transcript', {
    id: current.value.id,
    transcript
  });
  await loadRecords();
}

async function saveMinutes(minutes: string) {
  if (!current.value) return;
  current.value = await window.electronAPI.invoke('transcription:update-minutes', {
    id: current.value.id,
    minutes
  });
  await loadRecords();
}

async function generateMinutes(transcript: string) {
  if (!current.value) return;
  if (minutesActiveId.value === current.value.id) return;
  error.value = '';
  const recordId = current.value.id;
  const fileName = current.value.fileName;
  minutesActiveId.value = recordId;
  // 有媒体转写进行中时不抢侧栏进度条；否则展示纪要进度
  if (!activeId.value) {
    activeTask.value = {
      id: recordId,
      fileName,
      stage: 'summarizing',
      progress: 8,
      message: '正在生成会议纪要'
    };
  }
  try {
    current.value = await window.electronAPI.invoke('transcription:generate-minutes', {
      id: recordId,
      transcript
    });
    if (current.value?.error && !current.value.minutes) error.value = current.value.error;
    // 手动生成终态也走 attention：根据结果标记
    if (current.value) {
      if (current.value.stage === 'completed') {
        markAttentionFromEvent({
          id: current.value.id,
          stage: 'completed',
          progress: 100,
          message: '会议纪要已生成'
        });
      } else if (current.value.error || current.value.stage === 'ready') {
        markAttentionFromEvent({
          id: current.value.id,
          stage: current.value.error ? 'error' : 'ready',
          progress: 100,
          message: current.value.error || '纪要生成失败'
        });
      }
    }
    await loadRecords();
  } catch (reason: any) {
    error.value = reason?.message || '生成纪要失败';
  } finally {
    if (minutesActiveId.value === recordId) minutesActiveId.value = null;
    if (activeTask.value?.id === recordId && activeTask.value.stage === 'summarizing') {
      activeTask.value = null;
    }
  }
}

async function rewriteSelection(selectedText: string, opinion: string, fullMinutes: string) {
  if (!current.value) return '';
  if (minutesActiveId.value === current.value.id || activeId.value === current.value.id) {
    return '';
  }
  error.value = '';
  const recordId = current.value.id;
  const fileName = current.value.fileName;
  minutesActiveId.value = recordId;
  if (!activeId.value) {
    activeTask.value = {
      id: recordId,
      fileName,
      stage: 'summarizing',
      progress: 10,
      message: '正在按意见重写选中内容'
    };
  }
  try {
    const result = await window.electronAPI.invoke('transcription:rewrite-selection', {
      id: recordId,
      selectedText,
      opinion,
      fullMinutes
    });
    return String(result?.text || '').trim();
  } catch (reason: any) {
    error.value = reason?.message || '局部重写失败';
    return '';
  } finally {
    if (minutesActiveId.value === recordId) minutesActiveId.value = null;
    if (activeTask.value?.id === recordId && activeTask.value.stage === 'summarizing') {
      activeTask.value = null;
    }
  }
}

/** 按意见全局修订整篇纪要 */
async function reviseMinutes(opinion: string, fullMinutes?: string) {
  if (!current.value) return null;
  if (minutesActiveId.value === current.value.id || activeId.value === current.value.id) {
    return null;
  }
  const trimmed = opinion.trim();
  if (!trimmed) {
    error.value = '请填写修改意见';
    return null;
  }
  error.value = '';
  const recordId = current.value.id;
  const fileName = current.value.fileName;
  minutesActiveId.value = recordId;
  if (!activeId.value) {
    activeTask.value = {
      id: recordId,
      fileName,
      stage: 'summarizing',
      progress: 0,
      message: '正在按意见修改整篇纪要'
    };
  }
  try {
    current.value = await window.electronAPI.invoke('transcription:revise-minutes', {
      id: recordId,
      opinion: trimmed,
      fullMinutes
    }) as TranscriptionRecord;
    await loadRecords();
    return current.value;
  } catch (reason: any) {
    error.value = reason?.message || '全局修改失败';
    return null;
  } finally {
    if (minutesActiveId.value === recordId) minutesActiveId.value = null;
    if (activeTask.value?.id === recordId && activeTask.value.stage === 'summarizing') {
      activeTask.value = null;
    }
  }
}

async function exportRecord() {
  if (!current.value) return null;
  return window.electronAPI.invoke('transcription:export', { id: current.value.id });
}

async function removeRecord(record: TranscriptionRecord) {
  await window.electronAPI.invoke('transcription:delete', { id: record.id });
  if (current.value?.id === record.id) current.value = null;
  await loadRecords();
}

async function renameRecord(record: TranscriptionRecord, fileName: string) {
  const updated = await window.electronAPI.invoke('transcription:rename', {
    id: record.id,
    fileName
  }) as TranscriptionRecord;
  const index = records.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) records.value[index] = updated;
  else await loadRecords();
  if (current.value?.id === updated.id) current.value = updated;
  if (activeTask.value?.id === updated.id) {
    activeTask.value = { ...activeTask.value, fileName: updated.fileName };
  }
  return updated;
}

/** 根据会议纪要生成摘要标题并同步列表 */
async function generateTitle() {
  if (!current.value) return null;
  if (!current.value.minutes?.trim()) {
    error.value = '请先生成会议纪要';
    return null;
  }
  const updated = await window.electronAPI.invoke('transcription:generate-title', {
    id: current.value.id
  }) as TranscriptionRecord;
  const index = records.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) records.value[index] = updated;
  else await loadRecords();
  if (current.value?.id === updated.id) current.value = updated;
  if (activeTask.value?.id === updated.id) {
    activeTask.value = { ...activeTask.value, fileName: updated.fileName };
  }
  return updated;
}

export function useFileTranscription() {
  void bootstrapFileTranscription();
  return {
    records,
    current,
    selectedFiles,
    queuedRecords,
    queueLength,
    modelPath,
    modelReady,
    hydrated,
    busy,
    minutesBusy,
    minutesActiveId,
    activeTask,
    progress,
    progressMessage,
    error,
    attention,
    unreadCompletedCount,
    failedCount,
    hasAttention,
    attentionTooltip,
    clearTranscriptionAttention,
    chooseModel,
    chooseFile,
    setDroppedFile,
    setDroppedFiles,
    removeSelectedFile,
    clearSelectedFiles,
    startTranscription,
    createFromText,
    cancel,
    cancelQueued,
    selectRecord,
    saveTranscript,
    saveMinutes,
    generateMinutes,
    rewriteSelection,
    reviseMinutes,
    exportRecord,
    removeRecord,
    renameRecord,
    generateTitle,
    loadRecords
  };
}
