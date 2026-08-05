import { defineStore } from 'pinia';
import type { Session } from '@shared/types';

export const useSessionsStore = defineStore('sessions', {
  state: () => ({
    sessions: [] as Session[],
    loading: false
  }),

  actions: {
    async loadSessions() {
      this.loading = true;
      try {
        const sessions = await window.electronAPI.invoke('agent:list-sessions');
        this.sessions = sessions;
      } catch (error) {
        console.error('Failed to load sessions:', error);
      } finally {
        this.loading = false;
      }
    },

    addSession(session: Session) {
      this.sessions.unshift(session);
    },

    async deleteSession(sessionId: string) {
      try {
        await window.electronAPI.invoke('agent:delete-session', { sessionId });
        this.sessions = this.sessions.filter((s) => s.id !== sessionId);
      } catch (error) {
        console.error('Failed to delete session:', error);
        throw error;
      }
    },

    async deleteAllSessions() {
      try {
        const result = await window.electronAPI.invoke('agent:delete-all-sessions');
        this.sessions = [];
        return result;
      } catch (error) {
        console.error('Failed to delete all sessions:', error);
        throw error;
      }
    }
  }
});
