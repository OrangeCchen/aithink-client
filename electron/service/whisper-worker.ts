import { createWhisperContext, transcribeAsync } from 'whisper-cpp-node';

interface WorkerRequest {
  modelPath: string;
  audioPath: string;
}

function send(message: unknown): void {
  if (process.connected && process.send) process.send(message);
}

function sendAndFlush(message: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.connected || !process.send) {
      reject(new Error('Whisper worker IPC channel is unavailable'));
      return;
    }
    process.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

process.once('message', async (request: WorkerRequest) => {
  let context: ReturnType<typeof createWhisperContext> | null = null;
  try {
    send({ type: 'stage', stage: 'loading-model' });
    context = createWhisperContext({
      model: request.modelPath,
      use_gpu: true,
      flash_attn: true,
      no_prints: true
    });
    send({ type: 'stage', stage: 'transcribing' });
    const result = await transcribeAsync(context, {
      fname_inp: request.audioPath,
      language: 'zh',
      detect_language: false,
      translate: false,
      no_timestamps: false,
      split_on_word: true,
      temperature: 0,
      progress_callback: (progress) => send({ type: 'progress', progress })
    });
    await sendAndFlush({
      type: 'result',
      language: result.language,
      segments: result.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text
      }))
    });
  } catch (error) {
    await sendAndFlush({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
  } finally {
    context?.free();
    if (process.connected) process.disconnect();
  }
});
