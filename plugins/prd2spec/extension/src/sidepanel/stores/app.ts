import { create } from 'zustand';
import type { DesignCapture, PrdContent } from '../../shared/types';

export type Stage = 'idle' | 'extracting' | 'capturing' | 'generating' | 'done' | 'error';

interface AppState {
  stage: Stage;
  prd: PrdContent | null;
  designs: DesignCapture[];
  spec: string;
  error: string | null;
  log: string[];

  setStage: (s: Stage) => void;
  setPrd: (p: PrdContent | null) => void;
  setDesigns: (d: DesignCapture[]) => void;
  appendSpecChunk: (text: string) => void;
  setSpec: (text: string) => void;
  setError: (e: string | null) => void;
  pushLog: (line: string) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  stage: 'idle',
  prd: null,
  designs: [],
  spec: '',
  error: null,
  log: [],

  setStage: (stage) => set({ stage }),
  setPrd: (prd) => set({ prd }),
  setDesigns: (designs) => set({ designs }),
  appendSpecChunk: (text) => set((s) => ({ spec: s.spec + text })),
  setSpec: (spec) => set({ spec }),
  setError: (error) => set({ error }),
  pushLog: (line) =>
    set((s) => ({ log: [...s.log.slice(-50), `[${new Date().toLocaleTimeString()}] ${line}`] })),
  reset: () =>
    set({
      stage: 'idle',
      prd: null,
      designs: [],
      spec: '',
      error: null,
      log: [],
    }),
}));
