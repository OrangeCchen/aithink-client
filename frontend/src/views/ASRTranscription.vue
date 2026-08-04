<template>
  <div class="asr-transcription-view">
    <div class="header">
      <h1>语音转写</h1>
      <div class="engine-selector">
        <label>引擎：</label>
        <select v-model="selectedEngine" :disabled="isRecording || isTranscribing" @change="onEngineChange">
          <option value="dashscope">阿里云 DashScope (在线)</option>
          <option value="sherpa-onnx">Sherpa-ONNX (本地，已停用)</option>
          <option value="whisper" disabled>Whisper (即将支持)</option>
        </select>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- 实时转写区域 -->
    <div class="realtime-section">
      <h2>实时转写</h2>

      <div class="controls">
        <button
          v-if="!isRecording"
          @click="startRealtime"
          :disabled="isInitializing || isTranscribing"
          class="btn btn-primary"
        >
          <svg class="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="currentColor"/>
          </svg>
          开始录音
        </button>

        <button
          v-else
          @click="stopRealtime"
          class="btn btn-danger"
        >
          <svg class="icon" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
          </svg>
          停止录音
        </button>

        <div v-if="isRecording" class="recording-indicator">
          <span class="pulse"></span>
          录音中... {{ recordingDuration }}s
        </div>
      </div>

      <!-- 实时转写结果 -->
      <div class="transcription-result" v-if="transcriptionText || segments.length > 0">
        <h3>转写结果</h3>
        <div class="segments">
          <div
            v-for="segment in segments"
            :key="segment.id"
            :class="['segment', { 'is-final': segment.isFinal, 'is-interim': !segment.isFinal }]"
          >
            <span class="timestamp">{{ formatTime(segment.startTime) }}</span>
            <span class="text">{{ segment.text }}</span>
            <span v-if="segment.speaker" class="speaker">{{ segment.speaker }}</span>
          </div>
        </div>

        <!-- 完整文本 -->
        <div class="full-text">
          <h4>完整文本</h4>
          <div class="text-content" contenteditable="true">
            {{ transcriptionText }}
          </div>
        </div>
      </div>
    </div>

    <!-- 文件转写区域 -->
    <div class="file-section">
      <h2>文件转写</h2>

      <div class="file-upload">
        <button
          @click="selectFile"
          :disabled="isRecording || isTranscribing"
          class="btn btn-secondary"
        >
          选择音频文件
        </button>

        <div v-if="selectedFile" class="selected-file">
          <span>{{ selectedFile.name }}</span>
          <button @click="transcribeSelectedFile" class="btn btn-primary">
            开始转写
          </button>
        </div>
      </div>

      <!-- 转写进度 -->
      <div v-if="transcriptionProgress > 0" class="progress">
        <div class="progress-bar" :style="{ width: transcriptionProgress + '%' }">
          {{ transcriptionProgress.toFixed(0) }}%
        </div>
      </div>
    </div>

    <!-- 会话信息 -->
    <div v-if="currentSession" class="session-info">
      <h3>会话信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>会话 ID:</label>
          <span>{{ currentSession.id }}</span>
        </div>
        <div class="info-item">
          <label>名称:</label>
          <span>{{ currentSession.name }}</span>
        </div>
        <div class="info-item">
          <label>引擎:</label>
          <span>{{ currentSession.engine }}</span>
        </div>
        <div class="info-item">
          <label>状态:</label>
          <span :class="'status-' + currentSession.status">{{ getStatusText(currentSession.status) }}</span>
        </div>
        <div class="info-item" v-if="currentSession.duration">
          <label>时长:</label>
          <span>{{ currentSession.duration.toFixed(2) }}s</span>
        </div>
        <div class="info-item" v-if="currentSession.audioFilePath">
          <label>音频文件:</label>
          <span class="file-path">{{ currentSession.audioFilePath }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useASR } from '../composables/useASR';
import type { ASREngine } from '../../../shared/asr-types';

const {
  currentSession,
  isRecording,
  isTranscribing,
  transcriptionText,
  segments,
  error,
  initialize,
  createSession,
  startRealtimeRecording,
  stopRealtimeRecording,
  transcribeFile,
  onRealtimeSegment,
  onTranscriptionProgress
} = useASR();

const selectedEngine = ref<ASREngine>('dashscope');
const isInitializing = ref(false);
const recordingDuration = ref(0);
const selectedFile = ref<{ path: string; name: string } | null>(null);
const transcriptionProgress = ref(0);

let recordingTimer: NodeJS.Timeout | null = null;

// 按当前引擎检查就绪状态并（仅本地引擎）初始化
async function setupEngine() {
  error.value = null;
  try {
    isInitializing.value = true;

    const configResult = await window.electron.invoke('asr:getDefaultConfig', selectedEngine.value);
    if (!configResult.success) {
      throw new Error('获取默认配置失败');
    }

    // 未就绪：DashScope 缺 API Key / 本地缺模型，展示后端给出的原因
    if (!configResult.ready) {
      error.value = configResult.reason || '当前引擎不可用';
      return;
    }

    // DashScope 为在线引擎，连接在「开始录音」时才建立，此处无需 initialize
    if (selectedEngine.value === 'dashscope') {
      console.log('DashScope ASR 就绪，模型:', configResult.model);
      return;
    }

    // 本地 sherpa：模型路径已填入 config，立即初始化引擎
    await initialize(configResult.config);
    console.log('ASR initialized with model dir:', configResult.modelDir);
  } catch (err) {
    console.error('Failed to setup engine:', err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isInitializing.value = false;
  }
}

// 切换引擎时重新检查就绪状态
async function onEngineChange() {
  await setupEngine();
}

// 初始化
onMounted(async () => {
  await setupEngine();

  // 监听实时转写结果
  onRealtimeSegment((result) => {
    console.log('Received segment:', result.segment.text);
  });

  // 监听转写进度
  onTranscriptionProgress((data) => {
    transcriptionProgress.value = data.progress;
  });

  // 监听运行时错误（如 DashScope WS 中途失败）
  window.electron.on('asr:error', (_event: any, data: { message: string }) => {
    error.value = data.message;
  });
});

// 开始实时转写
async function startRealtime() {
  try {
    // 创建会话
    await createSession(selectedEngine.value, `实时转写 ${new Date().toLocaleString()}`);

    // 开始录音
    await startRealtimeRecording({
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16
    });

    // 启动计时器
    recordingDuration.value = 0;
    recordingTimer = setInterval(() => {
      recordingDuration.value++;
    }, 1000);
  } catch (err) {
    console.error('Failed to start realtime:', err);
  }
}

// 停止实时转写
async function stopRealtime() {
  try {
    await stopRealtimeRecording();

    // 停止计时器
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
  } catch (err) {
    console.error('Failed to stop realtime:', err);
  }
}

// 选择文件（走原生对话框拿真实路径，contextIsolation 下 File.path 不可用）
async function selectFile() {
  const result = await window.electron.invoke('asr:selectAudioFile');
  if (!result.canceled && result.filePath) {
    selectedFile.value = { path: result.filePath, name: result.fileName };
  }
}

// 转写选中的文件
async function transcribeSelectedFile() {
  if (!selectedFile.value) return;

  try {
    transcriptionProgress.value = 0;

    // 创建会话
    await createSession(selectedEngine.value, selectedFile.value.name);

    // 转写文件
    await transcribeFile(selectedFile.value.path);

    transcriptionProgress.value = 100;
  } catch (err) {
    console.error('Failed to transcribe file:', err);
  }
}

// 格式化时间
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 获取状态文本
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    idle: '空闲',
    recording: '录音中',
    processing: '处理中',
    completed: '已完成',
    error: '错误'
  };
  return statusMap[status] || status;
}
</script>

<style scoped lang="scss">
.asr-transcription-view {
  height: 100%;
  overflow-y: auto;
  padding: 20px 40px;
  max-width: 1200px;
  margin: 0 auto;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;

    h1 {
      font-size: 28px;
      font-weight: 600;
    }

    .engine-selector {
      display: flex;
      align-items: center;
      gap: 10px;

      select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }
    }
  }

  .error-message {
    background: #fee;
    color: #c33;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 20px;
  }

  .realtime-section,
  .file-section {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;

    h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
    }
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .icon {
      width: 16px;
      height: 16px;
    }

    &.btn-primary {
      background: #1890ff;
      color: #fff;

      &:hover:not(:disabled) {
        background: #40a9ff;
      }
    }

    &.btn-secondary {
      background: #f0f0f0;
      color: #333;

      &:hover:not(:disabled) {
        background: #e0e0e0;
      }
    }

    &.btn-danger {
      background: #ff4d4f;
      color: #fff;

      &:hover {
        background: #ff7875;
      }
    }
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ff4d4f;
    font-weight: 500;

    .pulse {
      width: 12px;
      height: 12px;
      background: #ff4d4f;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .transcription-result {
    margin-top: 20px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }
  }

  .segments {
    max-height: 300px;
    overflow-y: auto;
    background: #f9f9f9;
    border-radius: 4px;
    padding: 12px;

    .segment {
      display: flex;
      gap: 12px;
      padding: 8px;
      margin-bottom: 8px;
      border-radius: 4px;

      &.is-final {
        background: #fff;
      }

      &.is-interim {
        background: #f0f0f0;
        opacity: 0.7;
      }

      .timestamp {
        color: #999;
        font-size: 12px;
        min-width: 50px;
      }

      .text {
        flex: 1;
        font-size: 14px;
        line-height: 1.6;
      }

      .speaker {
        color: #1890ff;
        font-size: 12px;
        font-weight: 500;
      }
    }
  }

  .full-text {
    margin-top: 20px;

    h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .text-content {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px;
      min-height: 100px;
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
  }

  .file-upload {
    display: flex;
    align-items: center;
    gap: 16px;

    .selected-file {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #f0f0f0;
      border-radius: 4px;
    }
  }

  .progress {
    margin-top: 16px;
    height: 30px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;

    .progress-bar {
      height: 100%;
      background: #1890ff;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      transition: width 0.3s;
    }
  }

  .session-info {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;

      .info-item {
        display: flex;
        gap: 8px;

        label {
          font-weight: 500;
          color: #666;
          min-width: 80px;
        }

        span {
          color: #333;

          &.status-idle { color: #999; }
          &.status-recording { color: #ff4d4f; }
          &.status-processing { color: #1890ff; }
          &.status-completed { color: #52c41a; }
          &.status-error { color: #ff4d4f; }

          &.file-path {
            font-size: 12px;
            color: #666;
            word-break: break-all;
          }
        }
      }
    }
  }
}
</style>
