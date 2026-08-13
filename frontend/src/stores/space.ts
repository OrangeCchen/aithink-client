import { defineStore } from 'pinia';
import type { SpaceFileEntry, WorkspaceSpace } from '@shared/types';
import { useExamProfileStore } from './examProfile';

export const useSpaceStore = defineStore('space', {
  state: () => ({
    spaces: [] as WorkspaceSpace[],
    activeSpaceId: '' as string,
    files: [] as SpaceFileEntry[],
    filesLoading: false,
    filesError: null as string | null,
    /** 展开的空间 id 集合 */
    expandedIds: {} as Record<string, boolean>
  }),

  getters: {
    defaultSpace(state): WorkspaceSpace | null {
      return state.spaces.find((s) => s.isDefault) || state.spaces[0] || null;
    },
    /** 非默认空间（侧栏「空间」列表） */
    customSpaces(state): WorkspaceSpace[] {
      return state.spaces.filter((s) => !s.isDefault);
    },
    activeSpace(state): WorkspaceSpace | null {
      return (
        state.spaces.find((s) => s.id === state.activeSpaceId) ||
        state.spaces.find((s) => s.isDefault) ||
        state.spaces[0] ||
        null
      );
    },
    activeFolderPath(): string {
      return this.activeSpace?.folderPath || '';
    }
  },

  actions: {
    async loadSpaces() {
      try {
        const list = (await window.electronAPI.invoke('space:list')) as WorkspaceSpace[];
        this.spaces = list || [];
        const fallback =
          this.spaces.find((s) => s.isDefault) || this.spaces[0] || null;
        if (!this.activeSpaceId && fallback) {
          this.activeSpaceId = fallback.id;
        } else if (
          this.activeSpaceId &&
          !this.spaces.find((s) => s.id === this.activeSpaceId) &&
          fallback
        ) {
          this.activeSpaceId = fallback.id;
        }
      } catch (err) {
        console.error('Failed to load spaces:', err);
      }
    },

    selectDefaultSpace() {
      const space = this.defaultSpace;
      if (space) this.setActiveSpace(space.id);
    },

    setActiveSpace(spaceId: string) {
      const space = this.spaces.find((s) => s.id === spaceId);
      if (!space) return;
      this.activeSpaceId = spaceId;
      this.expandedIds[spaceId] = true;
      void useExamProfileStore().loadSyllabusForActiveSpace();
    },

    toggleExpanded(spaceId: string) {
      this.expandedIds[spaceId] = !this.expandedIds[spaceId];
    },

    async createSpace(name: string, folderPath: string) {
      const space = (await window.electronAPI.invoke('space:create', {
        name,
        folderPath
      })) as WorkspaceSpace;
      await this.loadSpaces();
      if (space?.id) {
        this.setActiveSpace(space.id);
      }
      return space;
    },

    async renameSpace(id: string, name: string) {
      const result = await window.electronAPI.invoke('space:update', { id, name });
      if (result?.success) await this.loadSpaces();
      return result;
    },

    async updateSpaceFolder(id: string, folderPath: string) {
      const result = await window.electronAPI.invoke('space:update', {
        id,
        folderPath
      });
      if (result?.success) await this.loadSpaces();
      return result;
    },

    async deleteSpace(id: string) {
      const target = this.spaces.find((s) => s.id === id);
      if (target?.isDefault) {
        return { success: false, error: '默认空间不可删除' };
      }
      const result = await window.electronAPI.invoke('space:delete', { id });
      if (result?.success) {
        if (this.activeSpaceId === id) this.activeSpaceId = '';
        await this.loadSpaces();
      }
      return result;
    },

    async loadFiles(folderPath?: string) {
      const path = folderPath || this.activeFolderPath;
      if (!path) {
        this.files = [];
        return;
      }
      this.filesLoading = true;
      this.filesError = null;
      try {
        const result = await window.electronAPI.invoke('space:list-files', {
          folderPath: path,
          spaceId: this.activeSpaceId || undefined
        });
        this.files = result?.files || [];
        if (result?.error) this.filesError = result.error;
      } catch (err: any) {
        this.files = [];
        this.filesError = err?.message || '读取失败';
      } finally {
        this.filesLoading = false;
      }
    },

    async revealPath(targetPath: string) {
      return window.electronAPI.invoke('space:reveal', { path: targetPath });
    }
  }
});
