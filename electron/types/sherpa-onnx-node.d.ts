// sherpa-onnx-node 无官方类型声明，这里补一个最小声明供 electron 侧编译。
// 运行时真实 API 见 node_modules/sherpa-onnx-node/*.js。
declare module 'sherpa-onnx-node' {
  export interface Waveform {
    samples: Float32Array;
    sampleRate: number;
  }

  export interface WaveObject {
    samples: Float32Array;
    sampleRate: number;
  }

  export class OnlineStream {
    acceptWaveform(obj: Waveform): void;
    inputFinished(): void;
  }

  export class OnlineRecognizer {
    constructor(config: any);
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    isEndpoint(stream: OnlineStream): boolean;
    reset(stream: OnlineStream): void;
    getResult(stream: OnlineStream): {
      text: string;
      tokens: string[];
      timestamps?: number[];
      is_final?: boolean;
      [key: string]: any;
    };
  }

  export class OfflineRecognizer {
    constructor(config: any);
    createStream(): OnlineStream;
    decode(stream: OnlineStream): void;
    getResult(stream: OnlineStream): { text: string; [key: string]: any };
  }

  export function readWave(path: string): WaveObject;
  export function writeWave(path: string, wave: WaveObject): void;

  const _default: any;
  export default _default;
}
