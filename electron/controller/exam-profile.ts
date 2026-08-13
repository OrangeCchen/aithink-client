import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { getDatabase } from '../service/database.js';
import {
  addSyllabusNode,
  deposeNote,
  getSyllabusFilePath,
  initExamFolderBlank,
  initExamFolderFromFile,
  listChapterNotes,
  readSyllabus
} from '../service/exam-profile-service.js';
import type { DeposeNoteParams, WorkspaceSpace } from '../../shared/types.js';

export async function registerExamProfileHandlers() {
  const db = await getDatabase();

  ipcMain.handle(
    'exam-profile:create',
    async (
      _event,
      params: { name: string; folderPath?: string; syllabusFilePath?: string }
    ): Promise<{ success: boolean; space?: WorkspaceSpace; error?: string }> => {
      let folderPath = params.folderPath?.trim();
      if (!folderPath) {
        const picked = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: '选择备考项目目录'
        });
        if (picked.canceled || !picked.filePaths[0]) {
          return { success: false, error: '未选择目录' };
        }
        folderPath = picked.filePaths[0];
      }
      folderPath = resolve(folderPath);
      const name = (params.name || '').trim() || '备考项目';
      const now = Date.now();

      try {
        if (params.syllabusFilePath?.trim()) {
          await initExamFolderFromFile(folderPath, resolve(params.syllabusFilePath.trim()));
        } else {
          await initExamFolderBlank(folderPath);
        }
      } catch (err: any) {
        return { success: false, error: err?.message || '初始化考纲失败' };
      }

      const space: WorkspaceSpace = {
        id: randomUUID(),
        name,
        folderPath,
        createdAt: now,
        updatedAt: now,
        examProfile: { enabled: true }
      };
      await db.createSpace(space);
      return { success: true, space };
    }
  );

  ipcMain.handle(
    'exam-profile:enable',
    async (
      _event,
      params: { spaceId: string }
    ): Promise<{ success: boolean; space?: WorkspaceSpace; error?: string }> => {
      const space = db.getSpace(params.spaceId);
      if (!space) return { success: false, error: '空间不存在' };
      try {
        await initExamFolderBlank(space.folderPath);
      } catch (err: any) {
        return { success: false, error: err?.message || '初始化考纲失败' };
      }
      const updated = await db.updateSpace(params.spaceId, {
        examProfile: { enabled: true }
      });
      if (!updated) return { success: false, error: '更新失败' };
      return { success: true, space: updated };
    }
  );

  ipcMain.handle(
    'exam-profile:get-syllabus',
    async (_event, params: { spaceId: string }) => {
      const space = db.getSpace(params.spaceId);
      if (!space) return { ok: false, error: '空间不存在', nodes: [] };
      const data = await readSyllabus(space.folderPath);
      return {
        ok: true,
        ...data,
        spaceId: space.id,
        folderPath: space.folderPath,
        syllabusFilePath: getSyllabusFilePath(space.folderPath)
      };
    }
  );

  ipcMain.handle(
    'exam-profile:import-syllabus',
    async (
      _event,
      params: { spaceId: string; syllabusFilePath?: string }
    ): Promise<{ success: boolean; error?: string; nodeCount?: number }> => {
      const space = db.getSpace(params.spaceId);
      if (!space) return { success: false, error: '空间不存在' };

      let filePath = params.syllabusFilePath?.trim();
      if (!filePath) {
        const picked = await dialog.showOpenDialog({
          properties: ['openFile'],
          title: '导入考纲文件',
          filters: [
            { name: '考纲', extensions: ['json', 'md', 'markdown'] },
            { name: '全部', extensions: ['*'] }
          ]
        });
        if (picked.canceled || !picked.filePaths[0]) {
          return { success: false, error: '未选择文件' };
        }
        filePath = picked.filePaths[0];
      }

      try {
        const nodes = await initExamFolderFromFile(space.folderPath, resolve(filePath));
        return { success: true, nodeCount: nodes.length };
      } catch (err: any) {
        return { success: false, error: err?.message || '导入失败' };
      }
    }
  );

  ipcMain.handle(
    'exam-profile:depose-note',
    async (_event, params: DeposeNoteParams): Promise<{ success: boolean; result?: any; error?: string }> => {
      const space = db.getSpace(params.spaceId);
      if (!space) return { success: false, error: '空间不存在' };
      if (!space.examProfile?.enabled) {
        return { success: false, error: '当前空间未启用备考项目' };
      }

      let syllabusNodeId = params.syllabusNodeId;
      if (!syllabusNodeId && params.newChapterTitle?.trim()) {
        const node = await addSyllabusNode(space.folderPath, params.newChapterTitle.trim());
        syllabusNodeId = node.id;
      }
      if (!syllabusNodeId) {
        return { success: false, error: '请选择章节或填写新章节名' };
      }

      const result = await deposeNote(space.folderPath, space.id, {
        ...params,
        syllabusNodeId
      });
      if (!result.ok) return { success: false, error: result.error };
      return { success: true, result };
    }
  );

  ipcMain.handle(
    'exam-profile:list-chapter-notes',
    async (_event, params: { spaceId: string; syllabusSlug: string }) => {
      const space = db.getSpace(params.spaceId);
      if (!space) return { ok: false, error: '空间不存在', files: [] };
      const files = await listChapterNotes(space.folderPath, params.syllabusSlug);
      return { ok: true, files };
    }
  );

  ipcMain.handle(
    'exam-profile:patch-session',
    async (_event, params: { sessionId: string; syllabusNodeId?: string | null }) => {
      const session = db.getSession(params.sessionId);
      if (!session) return { success: false, error: '会话不存在' };
      if (params.syllabusNodeId === null || params.syllabusNodeId === undefined) {
        delete session.syllabusNodeId;
      } else {
        session.syllabusNodeId = params.syllabusNodeId;
      }
      await db.upsertSession(session, db.getMessages(session.id));
      return { success: true, session };
    }
  );
}
