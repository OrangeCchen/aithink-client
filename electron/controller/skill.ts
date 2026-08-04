import { ipcMain } from 'electron';
import {
  fetchSkills,
  fetchCategories,
  fetchSkillDetail,
  fetchSkillFiles,
  fetchSkillFileContent
} from '../service/skillhub-service.js';
import {
  installSkill,
  removeSkill,
  listInstalled
} from '../service/skill-install-service.js';
import type { SkillListParams } from '../../shared/skill-types.js';

export function registerSkillHandlers() {
  // 技能列表（来自 skillhub.cn）
  ipcMain.handle('skill:list', async (_event, params: SkillListParams = {}) => {
    try {
      const result = await fetchSkills(params);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取技能列表失败', skills: [], total: 0 };
    }
  });

  // 技能分类
  ipcMain.handle('skill:categories', async () => {
    try {
      const categories = await fetchCategories();
      return { success: true, categories };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取分类失败', categories: [] };
    }
  });

  // 技能详情
  ipcMain.handle('skill:detail', async (_event, slug: string) => {
    try {
      const detail = await fetchSkillDetail(slug);
      return { success: true, detail };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取技能详情失败' };
    }
  });

  // 技能文件清单
  ipcMain.handle('skill:files', async (_event, slug: string) => {
    try {
      const files = await fetchSkillFiles(slug);
      return { success: true, files };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取文件清单失败', files: [] };
    }
  });

  // 单个文件内容
  ipcMain.handle('skill:fileContent', async (_event, slug: string, path: string) => {
    try {
      const content = await fetchSkillFileContent(slug, path);
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取文件内容失败', content: '' };
    }
  });

  // 安装技能
  ipcMain.handle('skill:install', async (_event, slug: string) => {
    try {
      const installed = await installSkill(slug);
      return { success: true, installed };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '安装失败' };
    }
  });

  // 移除技能
  ipcMain.handle('skill:remove', async (_event, slug: string) => {
    try {
      await removeSkill(slug);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '移除失败' };
    }
  });

  // 已安装技能列表
  ipcMain.handle('skill:installed', async () => {
    try {
      const installed = await listInstalled();
      return { success: true, installed };
    } catch (err: any) {
      return { success: false, error: err?.message ?? '获取已安装列表失败', installed: [] };
    }
  });
}
