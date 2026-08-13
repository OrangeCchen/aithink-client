// AIThink 官方技能清单：来源打标 + 官方筛选 + 本地 bundle 安装
import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import type { OfficialSkillSeed, SkillItem } from '../../shared/skill-types.js';
import { ORIGIN_LABELS } from '../../shared/skill-types.js';

/** SkillHub slug / 命名空间命中即视为官方 */
export const AITHINK_OFFICIAL_SLUGS = new Set<string>([
  'business-skill-builder',
  'civil-servant-review',
  'meeting-to-todos',
  'browser-footprint-summary'
]);

export const AITHINK_OFFICIAL_HANDLES = new Set<string>(['aithink', 'AIThink']);

/** 官方区静态种子（不依赖 SkillHub 也能展示） */
export const AITHINK_OFFICIAL_SEEDS: OfficialSkillSeed[] = [
  {
    slug: 'business-skill-builder',
    name: '场景技能工坊',
    description:
      '访谈业务场景，沉淀为可安装、可复用的工作流技能。',
    category: 'productivity',
    tags: ['技能创建', '业务访谈'],
    version: '1.0.0',
    installable: true,
    skillName: 'business-skill-builder'
  },
  {
    slug: 'civil-servant-review',
    name: '公务员场景审校',
    description:
      '审演示脚本与建设内容是否像公务员真实办公，给出依据与机关/公开案例参照。',
    category: 'productivity',
    tags: ['公务员', '场景审校', '演示话术'],
    version: '1.0.0',
    installable: true,
    skillName: 'civil-servant-review'
  },
  {
    slug: 'meeting-to-todos',
    name: '会议纪要转待办',
    description:
      '把会议录音转写或文字纪要整理为结构化待办，区分决策、行动项与责任人，便于直接跟进。',
    category: 'productivity',
    tags: ['会议', '待办'],
    version: '0.1.0',
    installable: false
  },
  {
    slug: 'browser-footprint-summary',
    name: '浏览足迹摘要',
    description:
      '基于浏览器扩展同步的页面足迹，生成调研摘要与关键链接清单，适合竞品与资料整理。',
    category: 'research',
    tags: ['浏览器', '调研'],
    version: '0.1.0',
    installable: false
  }
];

export function isAithinkOfficial(slug: string, handle?: string): boolean {
  if (slug && AITHINK_OFFICIAL_SLUGS.has(slug)) return true;
  if (handle && AITHINK_OFFICIAL_HANDLES.has(handle)) return true;
  return false;
}

export function resolveOrigin(
  slug: string,
  handle?: string
): { origin: 'aithink' | 'community'; originLabel: string } {
  if (isAithinkOfficial(slug, handle)) {
    return { origin: 'aithink', originLabel: ORIGIN_LABELS.aithink };
  }
  return { origin: 'community', originLabel: ORIGIN_LABELS.community };
}

export function officialSeedToSkillItem(seed: OfficialSkillSeed): SkillItem {
  return {
    slug: seed.slug,
    name: seed.name,
    description: seed.description,
    iconUrl: '',
    category: seed.category,
    subCategories: [],
    tags: seed.tags,
    author: 'AIThink',
    namespace: {
      canonicalName: `@aithink/${seed.slug}`,
      displayName: 'AIThink',
      handle: 'aithink'
    },
    homepage: '',
    source: 'aithink',
    origin: 'aithink',
    originLabel: ORIGIN_LABELS.aithink,
    downloads: 0,
    installs: 0,
    stars: 0,
    score: 0,
    verified: true,
    version: seed.version,
    updatedAt: 0,
    installable: seed.installable
  };
}

export function listOfficialSkills(keyword = ''): SkillItem[] {
  const q = keyword.trim().toLowerCase();
  const items = AITHINK_OFFICIAL_SEEDS.map(officialSeedToSkillItem);
  if (!q) return items;
  return items.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.slug.toLowerCase().includes(q)
  );
}

export function getOfficialSeed(slug: string): OfficialSkillSeed | undefined {
  return AITHINK_OFFICIAL_SEEDS.find((s) => s.slug === slug);
}

export function isOfficialInstallable(slug: string): boolean {
  const seed = getOfficialSeed(slug);
  if (!seed) return true; // 非静态官方条目，走 SkillHub
  return seed.installable;
}

/** 官方技能 bundle 根目录（开发 / 打包） */
export function resolveOfficialSkillsRoot(): string {
  const candidates = [
    join(process.resourcesPath || '', 'official-skills'),
    join(__dirname, '../../../resources/official-skills'),
    join(app.getAppPath(), 'resources/official-skills')
  ];
  for (const dir of candidates) {
    if (dir && existsSync(dir)) return dir;
  }
  return candidates[1];
}

export function resolveOfficialSkillDir(slug: string): string {
  return join(resolveOfficialSkillsRoot(), slug);
}

export function hasOfficialBundle(slug: string): boolean {
  return existsSync(join(resolveOfficialSkillDir(slug), 'SKILL.md'));
}
