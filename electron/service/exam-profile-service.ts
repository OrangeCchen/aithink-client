import { join, extname } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import type {
  DeposeNoteParams,
  DeposeNoteResult,
  DepositionSource,
  SyllabusNode
} from '../../shared/types.js';

export function flattenSyllabus(nodes: SyllabusNode[]): SyllabusNode[] {
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

function syllabusPath(folderPath: string): string {
  return join(folderPath, 'syllabus.json');
}

function notesRoot(folderPath: string): string {
  return join(folderPath, 'notes');
}

function slugFromTitle(title: string, index: number): string {
  const prefix = String(index + 1).padStart(2, '0');
  const safe = title
    .trim()
    .slice(0, 40)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-');
  return `${prefix}-${safe || 'chapter'}`;
}

/** 补全 id / slug，保证写入磁盘后结构稳定 */
export function normalizeSyllabusNodes(
  nodes: SyllabusNode[],
  idPrefix = 'chapter'
): SyllabusNode[] {
  return nodes.map((node, index) => {
    const title = (node.title || '').trim() || `章节 ${index + 1}`;
    return {
      id: node.id?.trim() || `${idPrefix}-${index}-${randomUUID().slice(0, 8)}`,
      title,
      slug: node.slug?.trim() || slugFromTitle(title, index),
      children: node.children?.length
        ? normalizeSyllabusNodes(node.children, `${idPrefix}-${index}`)
        : undefined
    };
  });
}

export function parseSyllabusJson(raw: string): SyllabusNode[] {
  const parsed = JSON.parse(raw) as unknown;
  let nodes: SyllabusNode[] | undefined;
  if (Array.isArray(parsed)) {
    nodes = parsed as SyllabusNode[];
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).nodes)) {
    nodes = (parsed as { nodes: SyllabusNode[] }).nodes;
  }
  if (!nodes?.length) {
    throw new Error('考纲 JSON 需为非空的 nodes 数组，或直接为节点数组');
  }
  return normalizeSyllabusNodes(nodes);
}

/** 从 Markdown 大纲解析：`# 章节` 或 `- 章节` 每行一条 */
export function parseSyllabusMarkdown(raw: string): SyllabusNode[] {
  const nodes: SyllabusNode[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('```')) continue;
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    const title = (heading?.[1] || bullet?.[1] || '').trim();
    if (title) nodes.push({ id: '', title, slug: '' });
  }
  if (!nodes.length) {
    throw new Error('Markdown 考纲未解析到章节，请使用 # 标题 或 - 列表项');
  }
  return normalizeSyllabusNodes(nodes);
}

export async function parseSyllabusFile(filePath: string): Promise<SyllabusNode[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();
  if (ext === '.json') return parseSyllabusJson(raw);
  if (ext === '.md' || ext === '.markdown') return parseSyllabusMarkdown(raw);
  throw new Error('仅支持 .json / .md / .markdown 考纲文件');
}

async function ensureNotesDirs(folderPath: string, nodes: SyllabusNode[]): Promise<void> {
  await fs.mkdir(notesRoot(folderPath), { recursive: true });
  for (const node of flattenSyllabus(nodes)) {
    await fs.mkdir(join(notesRoot(folderPath), node.slug), { recursive: true });
  }
}

export async function writeSyllabus(folderPath: string, nodes: SyllabusNode[]): Promise<void> {
  const normalized = nodes.length ? normalizeSyllabusNodes(nodes) : [];
  await fs.mkdir(folderPath, { recursive: true });
  await ensureNotesDirs(folderPath, normalized);
  await fs.writeFile(
    syllabusPath(folderPath),
    JSON.stringify({ version: 1, nodes: normalized }, null, 2),
    'utf-8'
  );
}

/** 考纲初始为空；章节在沉淀笔记时从对话中创建 */
export async function initExamFolderBlank(folderPath: string): Promise<SyllabusNode[]> {
  await fs.mkdir(folderPath, { recursive: true });
  await fs.mkdir(notesRoot(folderPath), { recursive: true });
  await fs.writeFile(
    syllabusPath(folderPath),
    JSON.stringify({ version: 1, nodes: [] }, null, 2),
    'utf-8'
  );
  return [];
}

/** 按章节名追加考纲节点（同名则复用） */
export async function addSyllabusNode(
  folderPath: string,
  title: string
): Promise<SyllabusNode> {
  const titleTrim = title.trim();
  if (!titleTrim) {
    throw new Error('章节名不能为空');
  }
  const { nodes } = await readSyllabus(folderPath);
  const list = nodes.length ? normalizeSyllabusNodes(nodes) : [];
  const existing = list.find((n) => n.title === titleTrim);
  if (existing) return existing;

  const newNode: SyllabusNode = {
    id: `chapter-${list.length}-${randomUUID().slice(0, 8)}`,
    title: titleTrim,
    slug: slugFromTitle(titleTrim, list.length)
  };
  list.push(newNode);
  await fs.mkdir(join(notesRoot(folderPath), newNode.slug), { recursive: true });
  await fs.writeFile(
    syllabusPath(folderPath),
    JSON.stringify({ version: 1, nodes: list }, null, 2),
    'utf-8'
  );
  return newNode;
}

export async function initExamFolderFromFile(
  folderPath: string,
  syllabusFilePath: string
): Promise<SyllabusNode[]> {
  const nodes = await parseSyllabusFile(syllabusFilePath);
  await writeSyllabus(folderPath, nodes);
  return nodes;
}

/** @deprecated 保留旧调用，等价于空白初始化 */
export async function initExamFolder(
  folderPath: string,
  _templateId?: string
): Promise<SyllabusNode[]> {
  return initExamFolderBlank(folderPath);
}

export async function readSyllabus(folderPath: string): Promise<{
  version?: number;
  nodes: SyllabusNode[];
}> {
  try {
    const raw = await fs.readFile(syllabusPath(folderPath), 'utf-8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      templateId?: string;
      nodes?: SyllabusNode[];
    };
    const nodes = normalizeSyllabusNodes(parsed.nodes || []);
    if (nodes.length && JSON.stringify(parsed.nodes) !== JSON.stringify(nodes)) {
      await fs.writeFile(
        syllabusPath(folderPath),
        JSON.stringify({ version: parsed.version || 1, nodes }, null, 2),
        'utf-8'
      );
      await ensureNotesDirs(folderPath, nodes);
    }
    return { version: parsed.version, nodes };
  } catch {
    return { nodes: [] };
  }
}

function findNode(nodes: SyllabusNode[], id: string): SyllabusNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function sanitizeFilename(title: string): string {
  const t = title
    .trim()
    .slice(0, 48)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-');
  return t || 'note';
}

function buildFrontmatter(params: {
  profileId: string;
  syllabusPath: string;
  title: string;
  sessionId: string;
  sources: DepositionSource[];
}): string {
  const lines = [
    '---',
    `profileId: ${params.profileId}`,
    `syllabusPath: "${params.syllabusPath.replace(/"/g, '\\"')}"`,
    `title: "${params.title.replace(/"/g, '\\"')}"`,
    `sessionId: ${params.sessionId}`,
    'sources:',
    ...params.sources.map((s) => {
      if (s.apps?.length) {
        return `  - type: ${s.type}\n    apps: [${s.apps.join(', ')}]`;
      }
      return `  - type: ${s.type}`;
    }),
    `createdAt: ${new Date().toISOString()}`,
    '---',
    ''
  ];
  return lines.join('\n');
}

export async function deposeNote(
  folderPath: string,
  profileId: string,
  params: DeposeNoteParams
): Promise<DeposeNoteResult> {
  if (!params.syllabusNodeId) {
    return { ok: false, error: '缺少章节 id' };
  }
  const syllabusNodeId = params.syllabusNodeId;
  const { nodes } = await readSyllabus(folderPath);
  const node = findNode(nodes, syllabusNodeId);
  if (!node) {
    return { ok: false, error: '考纲章节不存在' };
  }

  const dir = join(notesRoot(folderPath), node.slug);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${Date.now()}-${sanitizeFilename(params.title)}.md`;
  const fullPath = join(dir, filename);
  const body = params.content.trim();
  if (!body) {
    return { ok: false, error: '沉淀内容为空' };
  }

  const markdown =
    buildFrontmatter({
      profileId,
      syllabusPath: node.slug,
      title: params.title,
      sessionId: params.sessionId,
      sources: params.sources
    }) + body + '\n';

  await fs.writeFile(fullPath, markdown, 'utf-8');
  const relativePath = join('notes', node.slug, filename);
  return { ok: true, path: fullPath, relativePath, syllabusNodeId: node.id };
}

export async function listChapterNotes(
  folderPath: string,
  syllabusSlug: string
): Promise<Array<{ name: string; path: string; relativePath: string; mtime: number; size: number }>> {
  const dir = join(notesRoot(folderPath), syllabusSlug);
  try {
    const names = await fs.readdir(dir);
    const files = await Promise.all(
      names
        .filter((n) => n.endsWith('.md'))
        .map(async (name) => {
          const path = join(dir, name);
          const stat = await fs.stat(path);
          return {
            name,
            path,
            relativePath: join('notes', syllabusSlug, name),
            mtime: stat.mtimeMs,
            size: stat.size
          };
        })
    );
    return files.sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function getSyllabusFilePath(folderPath: string): string {
  return syllabusPath(folderPath);
}
