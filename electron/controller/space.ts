import { ipcMain, shell } from 'electron';
import { randomUUID } from 'crypto';
import { join, relative, basename, resolve } from 'path';
import { promises as fs } from 'fs';
import { getDatabase } from '../service/database.js';
import type { SpaceFileEntry, WorkspaceSpace } from '../../shared/types.js';

const SKIP_NAMES = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'dist-electron']);

function shouldSkip(name: string): boolean {
  if (SKIP_NAMES.has(name)) return true;
  if (name === '.claude') return true;
  if (name.startsWith('.')) return true;
  return false;
}

async function listFilesShallow(
  root: string,
  maxDepth = 4,
  maxEntries = 400
): Promise<SpaceFileEntry[]> {
  const rootAbs = resolve(root);
  const results: SpaceFileEntry[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (results.length >= maxEntries || depth > maxDepth) return;
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (results.length >= maxEntries) return;
      if (shouldSkip(name)) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const isDir = stat.isDirectory();
      results.push({
        name,
        path: full,
        relativePath: relative(rootAbs, full) || name,
        isDir,
        mtime: stat.mtimeMs,
        size: isDir ? 0 : stat.size
      });
      if (isDir && depth < maxDepth) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(rootAbs, 0);
  results.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.mtime - a.mtime;
  });
  return results;
}

export async function registerSpaceHandlers() {
  const db = await getDatabase();

  ipcMain.handle('space:list', async () => {
    return db.listSpaces();
  });

  ipcMain.handle(
    'space:create',
    async (
      _event,
      params: { name: string; folderPath: string }
    ): Promise<WorkspaceSpace> => {
      const name = (params.name || '').trim() || basename(params.folderPath) || '未命名空间';
      const folderPath = resolve(params.folderPath);
      try {
        await fs.mkdir(folderPath, { recursive: true });
      } catch {
        // ignore
      }
      const now = Date.now();
      return db.createSpace({
        id: randomUUID(),
        name,
        folderPath,
        createdAt: now,
        updatedAt: now
      });
    }
  );

  ipcMain.handle(
    'space:update',
    async (
      _event,
      params: { id: string; name?: string; folderPath?: string }
    ): Promise<{ success: boolean; space?: WorkspaceSpace; error?: string }> => {
      const patch: { name?: string; folderPath?: string } = {};
      if (params.name !== undefined) patch.name = params.name.trim();
      if (params.folderPath !== undefined) {
        const folderPath = resolve(params.folderPath);
        try {
          await fs.mkdir(folderPath, { recursive: true });
        } catch (err: any) {
          return { success: false, error: err?.message || '无法创建目录' };
        }
        patch.folderPath = folderPath;
      }
      const space = await db.updateSpace(params.id, patch);
      if (!space) return { success: false, error: '空间不存在' };
      return { success: true, space };
    }
  );

  ipcMain.handle('space:delete', async (_event, params: { id: string }) => {
    const result = await db.deleteSpace(params.id);
    return { success: result.ok, error: result.error };
  });

  ipcMain.handle(
    'space:list-files',
    async (
      _event,
      params: { folderPath?: string; spaceId?: string }
    ): Promise<{ files: SpaceFileEntry[]; folderPath: string; error?: string }> => {
      let folderPath = params.folderPath;
      if (!folderPath && params.spaceId) {
        folderPath = db.getSpace(params.spaceId)?.folderPath;
      }
      if (!folderPath) {
        return { files: [], folderPath: '', error: '未指定空间目录' };
      }
      try {
        await fs.mkdir(folderPath, { recursive: true });
        const files = await listFilesShallow(folderPath);
        return { files, folderPath };
      } catch (err: any) {
        return { files: [], folderPath, error: err?.message || '无法读取目录' };
      }
    }
  );

  /** 打开文件（系统默认应用）或文件夹（访达） */
  ipcMain.handle('space:reveal', async (_event, params: { path: string }) => {
    const target = resolve(params.path);
    try {
      const errMsg = await shell.openPath(target);
      if (errMsg) {
        return { success: false, error: errMsg };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || '无法打开' };
    }
  });
}
