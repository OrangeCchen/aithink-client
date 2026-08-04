// SkillHub 数据服务：在主进程调用 skillhub.cn 公开 API
// 放主进程的原因：1) 遵循 preload+IPC 边界 2) 规避浏览器直连的 CORS
import type {
  SkillItem,
  SkillCategory,
  SkillListParams,
  SkillListResult,
  SkillSubCategory,
  SkillDetail,
  SkillFile,
  SkillSecurityReport
} from '../../shared/skill-types.js';
import {
  getOfficialSeed,
  listOfficialSkills,
  officialSeedToSkillItem,
  resolveOrigin
} from './aithink-skills.js';

const API_BASE = 'https://api.skillhub.cn';
// skillhub 校验来源，缺失会被拒绝
const COMMON_HEADERS = {
  Accept: 'application/json',
  Origin: 'https://skillhub.cn',
  Referer: 'https://skillhub.cn/'
};

// 分类结果缓存（分类很少变动）
let categoriesCache: SkillCategory[] | null = null;

async function apiGet(path: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      headers: COMMON_HEADERS,
      signal: ctrl.signal
    });
    if (!resp.ok) {
      throw new Error(`SkillHub API ${path} 请求失败: HTTP ${resp.status}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// 把 skillhub 原始技能对象归一化为 SkillItem
function normalizeSkill(raw: any): SkillItem {
  const namespace = raw?.namespace
    ? {
        canonicalName: raw.namespace.canonicalName ?? '',
        displayName: raw.namespace.displayName ?? raw.ownerName ?? '',
        handle: raw.namespace.handle ?? '',
        publicSlug: raw.namespace.publicSlug ?? undefined
      }
    : null;

  const subCategories: SkillSubCategory[] = Array.isArray(raw?.subCategories)
    ? raw.subCategories.map((s: any) => ({ key: s?.key ?? '', name: s?.name ?? '' }))
    : [];

  const tags: string[] = Array.isArray(raw?.tags) ? raw.tags.filter(Boolean) : [];
  const slug = raw?.slug ?? raw?.name ?? '';
  const { origin, originLabel } = resolveOrigin(slug, namespace?.handle);

  return {
    slug,
    name: raw?.name ?? raw?.slug ?? '',
    description: (raw?.description_zh || raw?.description || '').trim(),
    iconUrl: raw?.iconUrl ?? '',
    category: raw?.category ?? '',
    subCategories,
    tags,
    author: namespace?.displayName || raw?.ownerName || '',
    namespace,
    homepage: raw?.homepage ?? '',
    source: raw?.source ?? '',
    origin,
    originLabel,
    downloads: Number(raw?.downloads ?? 0),
    installs: Number(raw?.installs ?? 0),
    stars: Number(raw?.stars ?? 0),
    score: Number(raw?.score ?? 0),
    verified: Boolean(raw?.verified),
    version: raw?.version ?? '',
    updatedAt: Number(raw?.updated_at ?? 0),
    installable: true
  };
}

// 拉取技能列表
export async function fetchSkills(params: SkillListParams): Promise<SkillListResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 24;
  const sortBy = params.sortBy ?? 'score';
  const keyword = params.keyword?.trim() ?? '';
  const origin = params.origin ?? '';

  // 官方筛选：只返回本地静态清单，不打 SkillHub
  if (origin === 'aithink') {
    const skills = listOfficialSkills(keyword);
    return { skills, total: skills.length };
  }

  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  qs.set('sortBy', sortBy);
  if (params.category) qs.set('category', params.category);
  if (keyword) qs.set('keyword', keyword);

  const json = await apiGet(`/api/skills?${qs.toString()}`);
  const data = json?.data ?? {};
  let skills: SkillItem[] = (Array.isArray(data.skills) ? data.skills : []).map(normalizeSkill);
  let total = Number(data.total ?? 0);

  // 社区筛选：去掉命中官方白名单的条目
  if (origin === 'community') {
    skills = skills.filter((s) => s.origin !== 'aithink');
  }

  // 全部：首页前置官方静态技能（仅第一页、无分类时）
  if (!origin && page === 1 && !params.category) {
    const official = listOfficialSkills(keyword);
    if (official.length > 0) {
      const seen = new Set(skills.map((s) => s.slug));
      const prepend = official.filter((s) => !seen.has(s.slug));
      skills = [...prepend, ...skills];
      total += prepend.length;
    }
  }

  return { skills, total };
}

// 拉取分类
export async function fetchCategories(): Promise<SkillCategory[]> {
  if (categoriesCache) return categoriesCache;

  const json = await apiGet('/api/v1/categories');
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  const categories = items
    .filter((c) => c?.active !== false)
    .map((c) => ({
      key: c?.key ?? '',
      name: c?.name ?? '',
      nameEn: c?.nameEn ?? '',
      sortOrder: Number(c?.sortOrder ?? 0)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  categoriesCache = categories;
  return categories;
}

function officialDetailFromSeed(slug: string): SkillDetail | null {
  const seed = getOfficialSeed(slug);
  if (!seed) return null;
  const base = officialSeedToSkillItem(seed);
  return {
    ...base,
    displayName: seed.name,
    changelog: seed.installable
      ? '官方技能，安装后即可在对话中使用。'
      : '官方预览版，随客户端迭代更新。',
    contentZhAvailable: true,
    ownerImage: null,
    securityReports: [
      {
        status: 'benign',
        statusText: '官方技能，随产品分发',
        reportUrl: ''
      }
    ]
  };
}

// 拉取技能详情（官方种子走本地详情；其余走 SkillHub）
export async function fetchSkillDetail(slug: string): Promise<SkillDetail> {
  const local = officialDetailFromSeed(slug);
  if (local) return local;

  try {
    const json = await apiGet(`/api/v1/skills/${encodeURIComponent(slug)}`);
    const rawSkill = json?.skill ?? {};
    const base = normalizeSkill(rawSkill);

    // 安全审核报告（对象 map → 数组）
    const reports: SkillSecurityReport[] = [];
    const rawReports = json?.securityReports ?? {};
    for (const key of Object.keys(rawReports)) {
      const r = rawReports[key];
      if (r) {
        reports.push({
          status: r.status ?? '',
          statusText: r.statusText ?? '',
          reportUrl: r.reportUrl ?? ''
        });
      }
    }

    return {
      ...base,
      slug: json?.slug ?? base.slug,
      displayName: rawSkill?.displayName ?? base.name,
      version: json?.latestVersion?.version ?? base.version,
      changelog: json?.latestVersion?.changelog ?? '',
      contentZhAvailable: Boolean(json?.contentZhAvailable),
      ownerImage: json?.owner?.image ?? null,
      securityReports: reports
    };
  } catch (err) {
    if (local) return local;
    throw err;
  }
}

// 拉取技能文件清单
export async function fetchSkillFiles(slug: string): Promise<SkillFile[]> {
  const json = await apiGet(`/api/v1/skills/${encodeURIComponent(slug)}/files`);
  const files: any[] = Array.isArray(json?.files) ? json.files : [];
  return files.map((f) => ({
    path: f?.path ?? '',
    sha256: f?.sha256 ?? '',
    size: Number(f?.size ?? 0)
  }));
}

// 拉取单个文件文本内容（服务端 302 跳 COS，fetch 默认跟随重定向）
export async function fetchSkillFileContent(slug: string, filePath: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const url = `${API_BASE}/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(filePath)}`;
    const resp = await fetch(url, { headers: COMMON_HEADERS, signal: ctrl.signal });
    if (!resp.ok) {
      throw new Error(`下载文件失败 ${filePath}: HTTP ${resp.status}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}
