// ASR Composable - 在 Vue 组件中使用 ASR 功能
import { ref, onUnmounted } from 'vue';
import type {
  ASRConfig,
  ASREngine,
  TranscriptionSession,
  TranscriptionSegment,
  AudioRecordingConfig,
  RealtimeTranscriptionResult
} from '../../../shared/asr-types';

export function useASR() {
  const currentSession = ref<TranscriptionSession | null>(null);
  const isRecording = ref(false);
  const isTranscribing = ref(false);
  const transcriptionText = ref('');
  const segments = ref<TranscriptionSegment[]>([]);
  const error = ref<string | null>(null);

  // 音频处理相关
  let audioContext: AudioContext | null = null;

  /**
   * 初始化 ASR 引擎
   */
  async function initialize(config: ASRConfig) {
    try {
      const result = await window.electron.invoke('asr:initialize', config);
      if (!result.success) {
        throw new Error(result.error);
      }
      console.log('ASR initialized successfully');
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize ASR';
      throw err;
    }
  }

  /**
   * 创建转写会话
   */
  async function createSession(engine: ASREngine, name?: string) {
    try {
      const result = await window.electron.invoke('asr:createSession', engine, name);
      if (!result.success) {
        throw new Error(result.error);
      }
      currentSession.value = result.session;
      segments.value = [];
      transcriptionText.value = '';
      return result.session;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create session';
      throw err;
    }
  }

  /**
   * 开始实时录音+转写
   */
  async function startRealtimeRecording(audioConfig?: AudioRecordingConfig) {
    try {
      error.value = null;
      isRecording.value = true;
      isTranscribing.value = true;

      // 请求麦克风权限并开始录音
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: audioConfig?.channels || 1,
          sampleRate: audioConfig?.sampleRate || 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 创建 AudioContext
      audioContext = new AudioContext({
        sampleRate: audioConfig?.sampleRate || 16000
      });

      const source = audioContext.createMediaStreamSource(stream);

      // 使用 ScriptProcessorNode 或 AudioWorklet 处理音频
      await setupAudioProcessing(source);

      // 通知主进程开始录音
      const result = await window.electron.invoke('asr:startRealtimeRecording', audioConfig);
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('Started realtime recording');
    } catch (err) {
      isRecording.value = false;
      isTranscribing.value = false;
      error.value = err instanceof Error ? err.message : 'Failed to start recording';
      throw err;
    }
  }

  /**
   * 设置音频处理
   */
  async function setupAudioProcessing(
    source: MediaStreamAudioSourceNode
  ) {
    if (!audioContext) return;

    // buffer 越大 → IPC 次数越少、送给 DashScope 的音频块越规整。
    // 16384 样本 @16k ≈ 1s/次（4096 时 ~4 次/秒，JSON 序列化抖动大易丢帧）。
    const bufferSize = 16384;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isRecording.value) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // 转换 Float32Array 到 Int16Array
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // fire-and-forget：不 await，避免上一帧 IPC 未完成时下一帧叠加/乱序
      window.electron
        .invoke('asr:sendAudioData', Array.from(int16Data))
        .catch((err) => console.error('Failed to send audio data:', err));
    };

    source.connect(processor);
    // processor 需要接一个输出节点才能在部分浏览器/Electron 中触发 onaudioprocess，
    // 但绝对不能直接接 destination（会把麦克风音频播出来，产生回声，导致重复转写）。
    // 用 gain=0 的静音节点作为哑输出。
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  /**
   * 停止实时录音+转写
   */
  async function stopRealtimeRecording() {
    try {
      isRecording.value = false;

      // 停止音频处理
      if (audioContext) {
        await audioContext.close();
        audioContext = null;
      }

      // 通知主进程停止录音
      const result = await window.electron.invoke('asr:stopRealtimeRecording');
      if (!result.success) {
        throw new Error(result.error);
      }

      isTranscribing.value = false;
      currentSession.value = result.session;

      console.log('Stopped realtime recording');
      return result.session;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to stop recording';
      throw err;
    }
  }

  /**
   * 转写音频文件
   */
  async function transcribeFile(audioFilePath: string, sessionId?: string) {
    try {
      error.value = null;
      isTranscribing.value = true;

      const result = await window.electron.invoke('asr:transcribeFile', audioFilePath, sessionId);
      if (!result.success) {
        throw new Error(result.error);
      }

      currentSession.value = result.session;
      segments.value = result.session.segments;
      updateTranscriptionText();

      isTranscribing.value = false;
      return result.session;
    } catch (err) {
      isTranscribing.value = false;
      error.value = err instanceof Error ? err.message : 'Failed to transcribe file';
      throw err;
    }
  }

  /**
   * 监听实时转写结果
   */
  function onRealtimeSegment(callback: (result: RealtimeTranscriptionResult) => void) {
    window.electron.on('asr:realtimeSegment', (_event: any, result: RealtimeTranscriptionResult) => {
      // 按 id 就地更新：同一句只占一行（临时→定稿），不同句追加新行
      const idx = segments.value.findIndex(s => s.id === result.segment.id);
      if (idx >= 0) {
        segments.value[idx] = result.segment;
      } else {
        segments.value.push(result.segment);
      }

      // 更新文本
      updateTranscriptionText();

      // 调用回调
      callback(result);
    });
  }

  /**
   * 监听转写进度
   */
  function onTranscriptionProgress(callback: (data: { sessionId: string; progress: number }) => void) {
    window.electron.on('asr:transcriptionProgress', (_event: any, data: any) => {
      callback(data);
    });
  }

  /**
   * 更新转写文本
   * - 无说话人信息：纯拼接（中文不加分隔符）
   * - 有说话人信息：按说话人分段，连续同一说话人的句子合并为一段，段首加"说话人 N："
   */
  function updateTranscriptionText() {
    const segs = segments.value;
    const hasSpeaker = segs.some(s => s.speaker);

    if (!hasSpeaker) {
      transcriptionText.value = segs.map(s => s.text).join('');
      return;
    }

    const lines: string[] = [];
    let curSpeaker: string | undefined;
    let curText = '';
    for (const s of segs) {
      if (s.speaker !== curSpeaker) {
        if (curText) lines.push(`${curSpeaker ?? '未知'}：${curText}`);
        curSpeaker = s.speaker;
        curText = s.text;
      } else {
        curText += s.text;
      }
    }
    if (curText) lines.push(`${curSpeaker ?? '未知'}：${curText}`);
    transcriptionText.value = lines.join('\n');
  }

  /**
   * 清理资源
   */
  async function cleanup() {
    try {
      if (isRecording.value) {
        await stopRealtimeRecording();
      }

      await window.electron.invoke('asr:cleanup');

      currentSession.value = null;
      segments.value = [];
      transcriptionText.value = '';
      error.value = null;
    } catch (err) {
      console.error('Failed to cleanup ASR:', err);
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup();
  });

  return {
    // 状态
    currentSession,
    isRecording,
    isTranscribing,
    transcriptionText,
    segments,
    error,

    // 方法
    initialize,
    createSession,
    startRealtimeRecording,
    stopRealtimeRecording,
    transcribeFile,
    onRealtimeSegment,
    onTranscriptionProgress,
    cleanup
  };
}
