// 音频录制服务 - 负责捕获麦克风音频
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { AudioRecordingConfig } from '../../shared/asr-types.js';

export class AudioRecorderService {
  private audioBuffer: Int16Array[] = [];
  private realtimeReadOffset: number = 0; // 已被实时转写消费的 chunk 数（游标，不影响完整缓冲）
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private config: AudioRecordingConfig;
  private outputFilePath: string | null = null;

  constructor(config: AudioRecordingConfig) {
    this.config = config;
  }

  /**
   * 开始录音
   */
  async startRecording(outputPath?: string): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    this.audioBuffer = [];
    this.realtimeReadOffset = 0;
    this.isRecording = true;
    this.recordingStartTime = Date.now();

    if (outputPath) {
      this.outputFilePath = outputPath;
    } else {
      // 默认保存路径
      const userDataPath = app.getPath('userData');
      const recordingsDir = path.join(userDataPath, 'recordings');

      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }

      this.outputFilePath = path.join(
        recordingsDir,
        `recording_${Date.now()}.wav`
      );
    }

    console.log(`Started recording to: ${this.outputFilePath}`);
  }

  /**
   * 添加音频数据
   * @param audioData 音频数据（从渲染进程传来）
   */
  addAudioData(audioData: Int16Array): void {
    if (!this.isRecording) {
      return;
    }
    this.audioBuffer.push(audioData);
  }

  /**
   * 停止录音
   */
  async stopRecording(): Promise<string | null> {
    if (!this.isRecording) {
      return null;
    }

    this.isRecording = false;
    const duration = (Date.now() - this.recordingStartTime) / 1000;
    console.log(`Stopped recording. Duration: ${duration.toFixed(2)}s`);

    // 保存音频文件
    if (this.outputFilePath && this.audioBuffer.length > 0) {
      await this.saveWavFile(this.outputFilePath);
      const filePath = this.outputFilePath;
      this.audioBuffer = [];
      return filePath;
    }

    return null;
  }

  /**
   * 保存为 WAV 文件
   */
  private async saveWavFile(filePath: string): Promise<void> {
    // 计算总样本数
    const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);

    // 合并所有音频块
    const audioData = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    // 生成 WAV 文件头
    const wavHeader = this.createWavHeader(
      audioData.length,
      this.config.sampleRate,
      this.config.channels,
      this.config.bitDepth
    );

    // 写入文件
    const buffer = Buffer.concat([
      wavHeader,
      Buffer.from(audioData.buffer)
    ]);

    fs.writeFileSync(filePath, buffer);
    console.log(`Saved WAV file: ${filePath} (${buffer.length} bytes)`);
  }

  /**
   * 创建 WAV 文件头
   */
  private createWavHeader(
    dataLength: number,
    sampleRate: number,
    channels: number,
    bitDepth: number
  ): Buffer {
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const dataSize = dataLength * (bitDepth / 8);

    const buffer = Buffer.alloc(44);
    let offset = 0;

    // RIFF chunk descriptor
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;

    // fmt sub-chunk
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, offset); offset += 2;  // AudioFormat (PCM)
    buffer.writeUInt16LE(channels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(byteRate, offset); offset += 4;
    buffer.writeUInt16LE(blockAlign, offset); offset += 2;
    buffer.writeUInt16LE(bitDepth, offset); offset += 2;

    // data sub-chunk
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset);

    return buffer;
  }

  /**
   * 获取当前缓冲区数据（用于实时转写）
   */
  getBufferedAudio(): Int16Array {
    if (this.audioBuffer.length === 0) {
      return new Int16Array(0);
    }

    // 合并最近的音频数据
    const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioData = new Int16Array(totalSamples);
    let offset = 0;

    for (const chunk of this.audioBuffer) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    return audioData;
  }

  /**
   * 读取自上次调用以来新增的音频（用于实时转写喂给有状态的 sherpa stream）。
   * 不清空 audioBuffer——完整录音仍保留给 saveWavFile。
   */
  drainRealtimeAudio(): Int16Array {
    if (this.realtimeReadOffset >= this.audioBuffer.length) {
      return new Int16Array(0);
    }

    const newChunks = this.audioBuffer.slice(this.realtimeReadOffset);
    this.realtimeReadOffset = this.audioBuffer.length;

    const totalSamples = newChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioData = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of newChunks) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }
    return audioData;
  }

  /**
   * 清空缓冲区（已处理的音频）
   */
  clearBuffer(): void {
    this.audioBuffer = [];
    this.realtimeReadOffset = 0;
  }

  /**
   * 获取录音时长
   */
  getRecordingDuration(): number {
    if (!this.isRecording) {
      return 0;
    }
    return (Date.now() - this.recordingStartTime) / 1000;
  }

  /**
   * 是否正在录音
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }
}
