import { defineStore } from 'pinia';
import type { AskUserQuestionItem } from '@shared/types';

export interface PendingQuestionSet {
  toolUseId: string;
  sessionId: string;
  questions: AskUserQuestionItem[];
  receivedAt: number;
}

export const useQuestionStore = defineStore('question', {
  state: () => ({
    pending: null as PendingQuestionSet | null,
    submitting: false,
    error: null as string | null,
    /** 右侧面板是否应聚焦「问题」区 */
    focusQuestions: false
  }),

  getters: {
    hasPending: (state) => Boolean(state.pending && state.pending.questions.length > 0)
  },

  actions: {
    setPending(payload: {
      toolUseId: string;
      sessionId: string;
      questions: AskUserQuestionItem[];
    }) {
      this.pending = {
        toolUseId: payload.toolUseId,
        sessionId: payload.sessionId,
        questions: payload.questions,
        receivedAt: Date.now()
      };
      this.error = null;
      this.focusQuestions = true;
    },

    clear() {
      this.pending = null;
      this.submitting = false;
      this.error = null;
    },

    async submitAnswers(answers: Record<string, string>, response?: string) {
      if (!this.pending) return false;
      this.submitting = true;
      this.error = null;
      try {
        const result = await window.electronAPI.invoke('agent:answer-question', {
          toolUseId: this.pending.toolUseId,
          answers,
          response,
          aiDecide: false
        });
        if (!result?.success) {
          this.error = result?.error || '提交失败：Agent 侧没有等待中的提问（可能已取消或主进程已重启）';
          return false;
        }
        this.clear();
        return true;
      } catch (err: any) {
        this.error = err?.message || '提交失败';
        return false;
      } finally {
        this.submitting = false;
      }
    },

    async submitAiDecide() {
      if (!this.pending) return false;
      this.submitting = true;
      this.error = null;
      try {
        const result = await window.electronAPI.invoke('agent:answer-question', {
          toolUseId: this.pending.toolUseId,
          answers: {},
          response: '请你根据上下文自行选择最合理的选项并继续，无需再向我确认。',
          aiDecide: true
        });
        if (!result?.success) {
          this.error = result?.error || '提交失败：Agent 侧没有等待中的提问（可能已取消或主进程已重启）';
          return false;
        }
        this.clear();
        return true;
      } catch (err: any) {
        this.error = err?.message || '提交失败';
        return false;
      } finally {
        this.submitting = false;
      }
    }
  }
});
