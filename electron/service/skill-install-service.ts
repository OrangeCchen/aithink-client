// 技能安装服务：SkillHub 下载或官方 bundle 复制到 userData/skills/，并同步到会话 workspace
import { app } from 'electron';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import {
  fetchSkillDetail,
  fetchSkillFiles,
  fetchSkillFileContent
} from './skillhub-service.js';
import {
  getOfficialSeed,
  hasOfficialBundle,
  isOfficialInstallable,
  resolveOfficialSkillDir
} from './aithink-skills.js';
import type { InstalledSkill } from '../../shared/skill-types.js';

// userData/skills 根目录
function getSkillsRoot(): string {
  return join(app.getPath('userData'), 'skills');
}

function getManifestPath(): string {
  return join(getSkillsRoot(), 'manifest.json');
}


const workspaceSyncCache = new Map<string, { manifestMtime: number; names: string[] }>();

export function invalidateSkillSyncCache(): void {
  workspaceSyncCache.clear();
}

async function getManifestMtime(): Promise<number> {
  try {
    const stat = await fs.stat(getManifestPath());
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

function getSkillDir(slug: string): string {
  return join(getSkillsRoot(), slug);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// 读取 manifest（已安装列表）；补齐缺失的 skillName / description
export async function listInstalled(): Promise<InstalledSkill[]> {
  try {
    const content = await fs.readFile(getManifestPath(), 'utf-8');
    const parsed = JSON.parse(content);
    const skills: InstalledSkill[] = Array.isArray(parsed?.skills) ? parsed.skills : [];
    let dirty = false;
    for (const skill of skills) {
      const skillDir = getSkillDir(skill.slug);
      if (!skill.skillName) {
        skill.skillName = await readSkillFrontmatterName(skillDir, skill.slug);
        dirty = true;
      }
      if (!skill.description?.trim()) {
        const seed = getOfficialSeed(skill.slug);
        skill.description =
          seed?.description?.trim() ||
          (await readSkillFrontmatterDescription(skillDir)) ||
          '';
        if (skill.description) dirty = true;
      }
    }
    if (dirty) await writeManifest(skills);
    return skills;
  } catch {
    return [];
  }
}

async function writeManifest(skills: InstalledSkill[]): Promise<void> {
  await ensureDir(getSkillsRoot());
  await fs.writeFile(getManifestPath(), JSON.stringify({ skills }, null, 2), 'utf-8');
}

export async function isInstalled(slug: string): Promise<boolean> {
  const list = await listInstalled();
  return list.some((s) => s.slug === slug);
}

async function upsertManifest(entry: InstalledSkill): Promise<InstalledSkill> {
  const list = (await listInstalled()).filter((s) => s.slug !== entry.slug);
  list.push(entry);
  await writeManifest(list);
  invalidateSkillSyncCache();
  return entry;
}

/** 从 SKILL.md frontmatter 解析 name（供 Agent SDK skills 选项） */
async function readSkillFrontmatterName(skillDir: string, fallback: string): Promise<string> {
  try {
    const md = await fs.readFile(join(skillDir, 'SKILL.md'), 'utf-8');
    const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return fallback;
    const nameLine = match[1].match(/^name:\s*["']?([a-z0-9][a-z0-9-]*)["']?\s*$/m);
    return nameLine?.[1] || fallback;
  } catch {
    return fallback;
  }
}

/** 从 SKILL.md frontmatter 解析 description（一行摘要） */
async function readSkillFrontmatterDescription(skillDir: string): Promise<string> {
  try {
    const md = await fs.readFile(join(skillDir, 'SKILL.md'), 'utf-8');
    const descMatch = md.match(/^description:\s*>?\s*\n?([\s\S]*?)(?=\n[a-z_]+:|\n---)/m);
    if (!descMatch) return '';
    return descMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*>?\s*/, '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 120);
  } catch {
    return '';
  }
}

/** 从 resources/official-skills/{slug} 复制到 userData */
async function installOfficialBundledSkill(slug: string): Promise<InstalledSkill> {
  const seed = getOfficialSeed(slug);
  if (!seed?.installable) {
    throw new Error('该官方技能暂不支持安装');
  }
  if (!hasOfficialBundle(slug)) {
    throw new Error('未找到官方技能文件，请确认安装包完整或重新安装应用');
  }

  const src = resolveOfficialSkillDir(slug);
  const skillDir = getSkillDir(slug);
  await fs.rm(skillDir, { recursive: true, force: true });
  await fs.cp(src, skillDir, { recursive: true });

  const skillName =
    seed.skillName || (await readSkillFrontmatterName(skillDir, slug));

  return upsertManifest({
    slug,
    name: seed.name,
    description: seed.description || (await readSkillFrontmatterDescription(skillDir)),
    skillName,
    version: seed.version || '',
    installedAt: Date.now()
  });
}

// 安装技能：官方 bundle 优先；否则走 SkillHub 下载（幂等）
export async function installSkill(slug: string): Promise<InstalledSkill> {
  const seed = getOfficialSeed(slug);
  if (seed) {
    if (!isOfficialInstallable(slug)) {
      throw new Error('该官方技能为预览版，将随产品版本内置，暂不支持从市场安装');
    }
    return installOfficialBundledSkill(slug);
  }

  const detail = await fetchSkillDetail(slug);
  const files = await fetchSkillFiles(slug);
  if (files.length === 0) {
    throw new Error('该技能没有可下载的文件');
  }

  const skillDir = getSkillDir(slug);
  // 幂等：重装先清目录
  await fs.rm(skillDir, { recursive: true, force: true });
  await ensureDir(skillDir);

  // 逐个下载写入（保留子目录结构）
  for (const file of files) {
    if (!file.path) continue;
    const content = await fetchSkillFileContent(slug, file.path);
    const target = join(skillDir, file.path);
    await ensureDir(dirname(target));
    await fs.writeFile(target, content, 'utf-8');
  }

  const skillName = await readSkillFrontmatterName(skillDir, slug);

  return upsertManifest({
    slug,
    name: detail.name || slug,
    description:
      detail.description?.trim() ||
      (await readSkillFrontmatterDescription(skillDir)) ||
      '',
    skillName,
    version: detail.version || '',
    installedAt: Date.now()
  });
}

// 移除技能：删目录 + 更新 manifest
export async function removeSkill(slug: string): Promise<void> {
  await fs.rm(getSkillDir(slug), { recursive: true, force: true });
  const list = (await listInstalled()).filter((s) => s.slug !== slug);
  await writeManifest(list);
  invalidateSkillSyncCache();
}

// 把已安装技能同步到会话 workspace 的 .claude/skills/，返回启用的技能 name 列表
// 供 agent-sdk 在 query 前调用，实现"装了即全局启用"
export async function syncInstalledToWorkspace(workspacePath: string): Promise<string[]> {
  const installed = await listInstalled();
  if (installed.length === 0) return [];

  const manifestMtime = await getManifestMtime();
  const cached = workspaceSyncCache.get(workspacePath);
  if (cached && cached.manifestMtime === manifestMtime) {
    return cached.names;
  }

  const targetRoot = join(workspacePath, '.claude', 'skills');
  await ensureDir(targetRoot);

  const enabledNames: string[] = [];
  for (const skill of installed) {
    const src = getSkillDir(skill.slug);
    const dest = join(targetRoot, skill.slug);
    try {
      // 存在性校验：源目录缺失则跳过（manifest 与磁盘不一致时的兜底）
      await fs.access(src);
      await fs.rm(dest, { recursive: true, force: true });
      await fs.cp(src, dest, { recursive: true });
      const fmName =
        skill.skillName || (await readSkillFrontmatterName(src, skill.slug));
      if (fmName) enabledNames.push(fmName);
    } catch {
      // 单个技能同步失败不阻断其它
      continue;
    }
  }

  workspaceSyncCache.set(workspacePath, { manifestMtime, names: enabledNames });
  return enabledNames;
}
