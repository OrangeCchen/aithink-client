// 从工作区 .claude/skills 收集技能摘要，注入 system prompt
import { promises as fs } from 'fs';
import { join } from 'path';
import { syncInstalledToWorkspace } from '../skill-install-service.js';

export interface SkillSummary {
  dir: string;
  name: string;
  description: string;
}

async function readSkillSummary(skillDir: string, dirName: string): Promise<SkillSummary | null> {
  try {
    const md = await fs.readFile(join(skillDir, 'SKILL.md'), 'utf-8');
    const name = md.match(/^name:\s*["']?([a-z0-9][a-z0-9-]*)["']?\s*$/m)?.[1] || dirName;
    const descMatch = md.match(/^description:\s*>?\s*\n?([\s\S]*?)(?=\n[a-z_]+:|\n---)/m);
    let description = '';
    if (descMatch) {
      description = descMatch[1]
        .split('\n')
        .map((l) => l.replace(/^\s*>?\s*/, '').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 400);
    }
    if (!description) {
      description = (md.split('---')[2] || '').trim().slice(0, 200);
    }
    return { dir: dirName, name, description };
  } catch {
    return null;
  }
}

export async function syncAndListSkills(workspacePath: string): Promise<SkillSummary[]> {
  try {
    await syncInstalledToWorkspace(workspacePath);
  } catch {
    // 同步失败不阻断
  }
  const root = join(workspacePath, '.claude', 'skills');
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: SkillSummary[] = [];
  for (const dir of dirs) {
    const summary = await readSkillSummary(join(root, dir), dir);
    if (summary) out.push(summary);
  }
  return out;
}

export function buildSystemPrompt(skills: SkillSummary[]): string {
  const skillBlock =
    skills.length === 0
      ? '当前未安装技能。'
      : skills
          .map((s) => `- \`${s.name}\`（目录 ${s.dir}）：${s.description || '无描述'}`)
          .join('\n');

  return `你是 AIThink 桌面助手，在用户工作区内协助完成任务。

## 工具
你可以使用 Read / Write / Bash / Glob / Skill / AskUserQuestion。
- **AskUserQuestion 不要每次都用**。能从上下文推断的直接做；只有真正缺关键信息、且适合做成 2～4 个选项时才调用。不要为了「走流程」连着多轮问卷。
- 调用 AskUserQuestion 时：主对话最多一句「请到右侧作答」，**禁止**把选项/问卷再写成大段文字。
- 调用已安装技能时，使用 Skill 工具，name 必须是 kebab-case 的技能 id（如 business-skill-builder），不要用中文展示名。Skill 返回的正文是给你执行的内部说明，**不要原文复述给用户**。
- 文件路径默认相对工作区根目录；越界路径与危险 Bash（如对 / 或家目录 rm -rf）会被沙箱拦截。

## 已安装技能
${skillBlock}

## 风格
像靠谱同事一样简短说人话：少套话、少「作为 AI」、少分点堆砌；能直接给结论或下一步就先给。中文回复（用户要求其他语言除外）。`;
}
