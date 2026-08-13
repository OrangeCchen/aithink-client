import { defineStore } from 'pinia';
import type { DepositionSource, SpaceFileEntry, SyllabusNode, WorkspaceSpace } from '@shared/types';
import { useSpaceStore } from './space';
import { useChatStore } from './chat';

function flatten(nodes: SyllabusNode[]): SyllabusNode[] {
  const out: SyllabusNode[] = [];
  const walk = (list: SyllabusNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export const useExamProfileStore = defineStore('examProfile', {
  state: () => ({
    syllabusNodes: [] as SyllabusNode[],
    syllabusTemplateId: '' as string,
    activeSyllabusNodeId: '' as string,
    /** messageId -> 已沉淀 relativePath */
    depositedMessages: {} as Record<string, string>,
    dismissedMessages: {} as Record<string, boolean>,
    lastHighlightPath: '' as string,
    chapterNotes: [] as SpaceFileEntry[],
    chapterNotesLoading: false,
    chapterNotesError: null as string | null
  }),

  getters: {
    examSpaces(): WorkspaceSpace[] {
      return useSpaceStore().spaces.filter((s) => s.examProfile?.enabled);
    },

    isExamMode(): boolean {
      const space = useSpaceStore().activeSpace;
      return Boolean(space?.examProfile?.enabled);
    },

    flatNodes(state): SyllabusNode[] {
      return flatten(state.syllabusNodes);
    },

    activeNode(state): SyllabusNode | null {
      if (!state.activeSyllabusNodeId) return null;
      return flatten(state.syllabusNodes).find((n) => n.id === state.activeSyllabusNodeId) || null;
    },

    activeNodeLabel(): string {
      return this.activeNode?.title || (this.flatNodes.length ? '选择章节' : '考纲尚空');
    },

    isSyllabusEmpty(): boolean {
      return this.isExamMode && this.flatNodes.length === 0;
    }
  },

  actions: {
    async loadSyllabusForActiveSpace() {
      const spaceStore = useSpaceStore();
      const space = spaceStore.activeSpace;
      if (!space?.examProfile?.enabled) {
        this.syllabusNodes = [];
        this.syllabusTemplateId = '';
        this.chapterNotes = [];
        return;
      }
      try {
        const result = await window.electronAPI.invoke('exam-profile:get-syllabus', {
          spaceId: space.id
        });
        this.syllabusNodes = result?.nodes || [];
        this.syllabusTemplateId = result?.version ? String(result.version) : '';
        if (
          this.activeSyllabusNodeId &&
          !this.flatNodes.find((n) => n.id === this.activeSyllabusNodeId)
        ) {
          this.activeSyllabusNodeId = '';
        }
        await this.loadChapterNotesForPanel();
      } catch (err) {
        console.error('load syllabus failed:', err);
        this.syllabusNodes = [];
        this.chapterNotes = [];
      }
    },

    async loadChapterNotesForPanel() {
      const spaceStore = useSpaceStore();
      const space = spaceStore.activeSpace;
      const node = this.activeNode;
      if (!space?.examProfile?.enabled || !node) {
        this.chapterNotes = [];
        this.chapterNotesError = null;
        return;
      }
      this.chapterNotesLoading = true;
      this.chapterNotesError = null;
      try {
        const result = await window.electronAPI.invoke('exam-profile:list-chapter-notes', {
          spaceId: space.id,
          syllabusSlug: node.slug
        });
        this.chapterNotes = (result?.files || []).map(
          (f: { name: string; path: string; relativePath: string; mtime: number; size: number }) => ({
            name: f.name,
            path: f.path,
            relativePath: f.relativePath,
            isDir: false,
            mtime: f.mtime,
            size: f.size
          })
        );
        if (result?.error) this.chapterNotesError = result.error;
      } catch (err: any) {
        this.chapterNotes = [];
        this.chapterNotesError = err?.message || '读取本章语料失败';
      } finally {
        this.chapterNotesLoading = false;
      }
    },

    async setActiveSyllabusNode(nodeId: string) {
      this.activeSyllabusNodeId = nodeId;
      await this.loadChapterNotesForPanel();
      const chatStore = useChatStore();
      const sessionId = chatStore.currentSessionId;
      if (sessionId) {
        await window.electronAPI
          .invoke('exam-profile:patch-session', {
            sessionId,
            syllabusNodeId: nodeId || null
          })
          .catch(() => {});
      }
    },

    restoreFromSession(_sessionId: string, syllabusNodeId?: string) {
      if (syllabusNodeId) {
        this.activeSyllabusNodeId = syllabusNodeId;
      }
    },

    async importSyllabus(syllabusFilePath?: string) {
      const spaceStore = useSpaceStore();
      const space = spaceStore.activeSpace;
      if (!space?.examProfile?.enabled) {
        throw new Error('当前空间不是备考项目');
      }
      const result = await window.electronAPI.invoke('exam-profile:import-syllabus', {
        spaceId: space.id,
        syllabusFilePath
      });
      if (!result?.success) {
        throw new Error(result?.error || '导入失败');
      }
      await this.loadSyllabusForActiveSpace();
      return result.nodeCount as number;
    },

    openSyllabusFile() {
      const spaceStore = useSpaceStore();
      const root = spaceStore.activeFolderPath;
      if (!root) return;
      void spaceStore.revealPath(`${root}/syllabus.json`);
    },

    async createExamProfile(name: string, syllabusFilePath?: string, folderPath?: string) {
      const result = await window.electronAPI.invoke('exam-profile:create', {
        name,
        folderPath,
        syllabusFilePath
      });
      if (!result?.success) {
        throw new Error(result?.error || '创建失败');
      }
      const spaceStore = useSpaceStore();
      await spaceStore.loadSpaces();
      if (result.space?.id) {
        spaceStore.setActiveSpace(result.space.id);
        await this.loadSyllabusForActiveSpace();
      }
      return result.space;
    },

    async depose(params: {
      messageId: string;
      title: string;
      content: string;
      sources: DepositionSource[];
      syllabusNodeId?: string;
      /** 无已有章节时，从对话提炼并写入考纲 */
      chapterTitle?: string;
    }) {
      const spaceStore = useSpaceStore();
      const chatStore = useChatStore();
      const space = spaceStore.activeSpace;
      const nodeId = params.syllabusNodeId || this.activeSyllabusNodeId;
      const newChapterTitle =
        !nodeId && params.chapterTitle?.trim() ? params.chapterTitle.trim() : undefined;
      if (!space?.examProfile?.enabled) {
        throw new Error('请先选择备考项目空间');
      }
      if (!nodeId && !newChapterTitle) {
        throw new Error('请填写章节名，或选择已有章节');
      }
      if (!chatStore.currentSessionId) {
        throw new Error('当前无学习会话');
      }

      const result = await window.electronAPI.invoke('exam-profile:depose-note', {
        spaceId: space.id,
        syllabusNodeId: nodeId || undefined,
        newChapterTitle,
        title: params.title,
        content: params.content,
        sessionId: chatStore.currentSessionId,
        sources: params.sources
      });

      if (!result?.success) {
        throw new Error(result?.error || '沉淀失败');
      }

      const rel = result.result?.relativePath as string;
      if (rel) {
        this.depositedMessages[params.messageId] = rel;
        this.lastHighlightPath = rel;
      }
      const createdNodeId = result.result?.syllabusNodeId as string | undefined;
      if (createdNodeId) {
        await this.loadSyllabusForActiveSpace();
        await this.setActiveSyllabusNode(createdNodeId);
      } else {
        await this.loadChapterNotesForPanel();
      }
      return result.result;
    },

    dismissMessage(messageId: string) {
      this.dismissedMessages[messageId] = true;
    },

    isDeposited(messageId: string): boolean {
      return Boolean(this.depositedMessages[messageId]);
    },

    isDismissed(messageId: string): boolean {
      return Boolean(this.dismissedMessages[messageId]);
    }
  }
});
