import { create } from 'zustand';
export const useAppStore = create((set) => ({
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
    pushLog: (line) => set((s) => ({ log: [...s.log.slice(-50), `[${new Date().toLocaleTimeString()}] ${line}`] })),
    reset: () => set({
        stage: 'idle',
        prd: null,
        designs: [],
        spec: '',
        error: null,
        log: [],
    }),
}));
