import { defineStore } from 'pinia';

export type MainView = 'chat' | 'knowledge' | 'transcription' | 'skill';

export const useUiStore = defineStore('ui', {
  state: () => ({
    // 当前主视图：对话 or 知识空间
    activeView: 'chat' as MainView
  }),

  actions: {
    setView(view: MainView) {
      this.activeView = view;
    },

    showChat() {
      this.activeView = 'chat';
    },

    showKnowledge() {
      this.activeView = 'knowledge';
    },

    showTranscription() {
      this.activeView = 'transcription';
    },

    showSkill() {
      this.activeView = 'skill';
    }
  }
});
