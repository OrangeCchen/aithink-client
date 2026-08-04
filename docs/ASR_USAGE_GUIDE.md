# ASR 实时转写和本地模型转写使用指南

## 📋 概述

本文档介绍如何使用新实现的两个核心 ASR（自动语音识别）功能：

1. **实时转写**：边录音边转写，实时显示文字结果
2. **本地模型转写**：使用 Sherpa-ONNX 进行完全离线的语音识别

---

## 🏗️ 架构设计

### 技术栈

- **后端（主进程）**：
  - `sherpa-onnx-node`：本地语音识别引擎
  - `AudioRecorderService`：音频录制服务
  - `ASRService`：ASR 核心服务

- **前端（渲染进程）**：
  - Web Audio API：音频捕获
  - Vue 3 + Composition API
  - TypeScript

### 数据流

```
麦克风 → Web Audio API → 渲染进程 → IPC → 主进程 → Sherpa-ONNX → 识别结果 → IPC → 渲染进程 → 界面显示
```

---

## 🚀 快速开始

### 1. 安装依赖

项目已包含必要的依赖：
```json
{
  "sherpa-onnx-node": "^1.13.2",
  "sherpa-onnx-darwin-x64": "^1.12.20"
}
```

### 2. 下载模型文件

**当前默认已内置流式中文 ASR 模型**（`resources/models/zh-streaming/`，随应用打包），无需手动下载即可使用实时/文件转写。

如需替换或扩展模型，本项目统一的运行时模型目录为：

- macOS: `~/Library/Application Support/aithink/models/`
- Windows: `%APPDATA%/aithink/models/`
- Linux: `~/.config/aithink/models/`

> 注意：`艾德智能笔记` 是本项目的参考对标应用（见 `FEATURE_REQUIREMENTS.md`），不是本项目目录，不要把模型放到它的数据目录下。

#### Qwen3-ASR（可选，中文识别）
```bash
# 下载地址
https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2

# 解压后放置到本项目模型目录：
~/Library/Application Support/aithink/models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/
```

#### SenseVoice（可选，多语言支持）
```bash
# 下载地址
https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2

# 解压后放置到本项目模型目录：
~/Library/Application Support/aithink/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/
```

### 3. 配置模型路径

在 `ASRTranscription.vue` 的 `onMounted` 中配置模型路径：

```typescript
// 修改这一行
config.sherpa.modelPath = '/path/to/your/model';

// 改为实际路径，例如：
config.sherpa.modelPath = path.join(
  app.getPath('userData'),
  'models',
  'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25'
);
```

---

## 💡 功能使用

### 功能 1：实时转写

#### 使用步骤

1. **打开转写页面**
   - 启动应用后，导航到"语音转写"页面

2. **选择引擎**
   - 选择 "Sherpa-ONNX (本地)" 引擎

3. **开始录音**
   - 点击"开始录音"按钮
   - 授予麦克风权限（首次使用时）

4. **实时查看转写结果**
   - 说话时，文字会实时显示在界面上
   - 临时结果显示为灰色，最终结果显示为白色

5. **停止录音**
   - 点击"停止录音"按钮
   - 音频文件会自动保存到本地

#### 代码示例

```typescript
import { useASR } from '@/composables/useASR';

const {
  isRecording,
  transcriptionText,
  segments,
  startRealtimeRecording,
  stopRealtimeRecording,
  onRealtimeSegment
} = useASR();

// 开始实时转写
async function start() {
  await createSession('sherpa-onnx', '实时转写会话');
  await startRealtimeRecording({
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16
  });
}

// 监听实时结果
onRealtimeSegment((result) => {
  console.log('新的转写片段:', result.segment.text);
});

// 停止转写
async function stop() {
  const session = await stopRealtimeRecording();
  console.log('转写完成:', session);
}
```

---

### 功能 2：本地模型转写（离线）

#### 使用步骤

1. **选择音频文件**
   - 点击"选择音频文件"按钮
   - 选择 WAV、MP3 等音频文件

2. **开始转写**
   - 点击"开始转写"按钮
   - 等待转写完成

3. **查看结果**
   - 转写完成后，结果会显示在界面上
   - 可以编辑和导出结果

#### 代码示例

```typescript
import { useASR } from '@/composables/useASR';

const {
  isTranscribing,
  transcriptionText,
  transcribeFile,
  onTranscriptionProgress
} = useASR();

// 转写文件
async function transcribe(filePath: string) {
  await createSession('sherpa-onnx', '文件转写');
  
  const session = await transcribeFile(filePath);
  console.log('转写结果:', session.segments);
}

// 监听进度
onTranscriptionProgress((data) => {
  console.log(`进度: ${data.progress}%`);
});
```

---

## 🔧 配置选项

### ASR 配置

```typescript
interface ASRConfig {
  engine: 'sherpa-onnx' | 'whisper';
  sherpa?: {
    modelPath: string;           // 模型路径
    modelType: 'streaming' | 'offline';  // 流式或离线
    language: string;             // 'zh' | 'en' | 'auto'
    sampleRate: number;           // 16000
    numThreads: number;           // 4
    enableVAD: boolean;           // 语音活动检测
  };
  enableRealtimeTranscription: boolean;
  realtimeChunkDuration: number;  // 实时转写块时长（毫秒）
}
```

### 音频录制配置

```typescript
interface AudioRecordingConfig {
  sampleRate: number;   // 16000 或 48000
  channels: number;     // 1 (mono) or 2 (stereo)
  bitDepth: number;     // 16 or 24
  deviceId?: string;    // 音频设备 ID
}
```

---

## 📁 文件结构

```
aithink-client/
├── shared/
│   └── asr-types.ts                    # ASR 类型定义
├── electron/
│   ├── controller/
│   │   └── asr.ts                      # ASR IPC 处理器
│   ├── service/
│   │   ├── asr-service.ts              # ASR 核心服务
│   │   └── audio-recorder-service.ts   # 音频录制服务
│   └── main.ts                         # 注册 ASR 处理器
└── frontend/
    ├── src/
    │   ├── composables/
    │   │   └── useASR.ts               # ASR Composable
    │   └── views/
    │       └── ASRTranscription.vue    # 转写界面
    └── ...
```

---

## 🎯 核心 API

### ASRService（主进程）

```typescript
class ASRService {
  // 初始化引擎
  initialize(config: ASRConfig): Promise<void>
  
  // 创建会话
  createSession(engine: ASREngine, name?: string): TranscriptionSession
  
  // 开始实时转写
  startRealtimeTranscription(sessionId: string): void
  
  // 处理实时音频
  processRealtimeAudio(audioBuffer: Int16Array | Float32Array, sampleRate: number): Promise<TranscriptionSegment | null>
  
  // 停止实时转写
  stopRealtimeTranscription(): TranscriptionSession | null
  
  // 转写音频文件
  transcribeAudioFile(audioFilePath: string, sessionId?: string, onProgress?: (progress: number) => void): Promise<TranscriptionSession>
  
  // 清理资源
  cleanup(): void
}
```

### useASR（渲染进程）

```typescript
function useASR() {
  return {
    // 状态
    currentSession: Ref<TranscriptionSession | null>,
    isRecording: Ref<boolean>,
    isTranscribing: Ref<boolean>,
    transcriptionText: Ref<string>,
    segments: Ref<TranscriptionSegment[]>,
    error: Ref<string | null>,
    
    // 方法
    initialize: (config: ASRConfig) => Promise<void>,
    createSession: (engine: ASREngine, name?: string) => Promise<TranscriptionSession>,
    startRealtimeRecording: (config?: AudioRecordingConfig) => Promise<void>,
    stopRealtimeRecording: () => Promise<TranscriptionSession>,
    transcribeFile: (filePath: string, sessionId?: string) => Promise<TranscriptionSession>,
    onRealtimeSegment: (callback: (result: RealtimeTranscriptionResult) => void) => void,
    onTranscriptionProgress: (callback: (data: { sessionId: string; progress: number }) => void) => void,
    cleanup: () => Promise<void>
  }
}
```

---

## 🐛 常见问题

### 1. 模型加载失败

**问题**：初始化时提示 "Model path not found"

**解决方案**：
- 确认模型文件已下载并解压
- 检查模型路径是否正确
- 确保模型文件夹包含必需的 `.onnx` 文件

### 2. 录音无声音

**问题**：录音时没有捕获到音频

**解决方案**：
- 检查麦克风权限
- 确认系统设置中默认麦克风设备正确
- 在 macOS 上，检查"系统偏好设置 > 安全性与隐私 > 麦克风"

### 3. 转写结果为空

**问题**：录音结束后没有转写结果

**解决方案**：
- 检查是否有有效的语音输入
- 调整 VAD（语音活动检测）阈值
- 确认音频格式正确（16kHz, 16-bit, mono）

### 4. 实时转写延迟高

**问题**：转写结果延迟较大

**解决方案**：
- 减小 `realtimeChunkDuration`（默认 3000ms）
- 增加 `numThreads`（CPU 线程数）
- 使用更小的模型（如 tiny 或 base）

---

## 🔐 隐私说明

- ✅ **完全本地处理**：所有语音识别在本地进行，不上传到云端
- ✅ **数据安全**：音频文件存储在本地，用户完全控制
- ✅ **离线可用**：无需网络连接即可使用

---

## 🚧 待完成功能

### 短期（1-2周）

- [ ] FFmpeg 集成，支持更多音频格式
- [ ] 说话人分离（Speaker Diarization）
- [ ] 音频波形可视化
- [ ] 导出功能（Markdown、TXT、SRT）

### 中期（1个月）

- [ ] Whisper 引擎集成
- [ ] 模型下载管理界面
- [ ] 转写历史记录
- [ ] 批量文件转写

### 长期（2-3个月）

- [ ] 实时字幕显示
- [ ] 多语言自动检测
- [ ] AI 摘要和关键词提取
- [ ] 云同步（可选）

---

## 📚 参考资料

1. **Sherpa-ONNX 官方文档**
   - https://github.com/k2-fsa/sherpa-onnx

2. **Node.js Addon 示例**
   - https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-addon-examples

3. **Web Audio API**
   - https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

4. **Electron IPC 通信**
   - https://www.electronjs.org/docs/latest/tutorial/ipc

---

## 📞 支持

如有问题，请：
1. 查看控制台日志（开发者工具）
2. 检查主进程日志
3. 提交 Issue 到项目仓库

---

*最后更新：2026-08-03*
