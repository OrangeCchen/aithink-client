// 技能市场（Skill Market）相关类型定义
// 数据源：skillhub.cn 公开 API（https://api.skillhub.cn）+ AIThink 官方静态清单

// 排序方式（与 skillhub 支持的取值对齐）
export type SkillSortBy = 'score' | 'downloads' | 'stars' | 'newest';

// 技能来源（客户端归一化后的权威字段）
export type SkillOrigin = 'aithink' | 'community';

// 技能中心顶部页签
export type SkillCenterTab = 'market' | 'mine';

// 技能作者/命名空间
export interface SkillNamespace {
  canonicalName: string;  // 如 @user_xxx/web-tools-guide
  displayName: string;    // 展示用作者名
  handle: string;         // 作者 handle
  publicSlug?: string;
}

// 技能子分类
export interface SkillSubCategory {
  key: string;
  name: string;
}

// 单个技能（字段归一化后的形态）
export interface SkillItem {
  slug: string;
  name: string;
  description: string;        // 中文优先，回退英文
  iconUrl: string;
  category: string;
  subCategories: SkillSubCategory[];
  tags: string[];
  author: string;            // namespace.displayName
  namespace: SkillNamespace | null;
  homepage: string;
  source: string;            // community / official ...（SkillHub 原始值）
  origin: SkillOrigin;       // 客户端权威来源
  originLabel: string;       // 展示文案：AIThink 官方 / 社区
  downloads: number;
  installs: number;
  stars: number;
  score: number;
  verified: boolean;
  version: string;
  updatedAt: number;
  /** 是否可安装；官方预览可为 false，社区默认 true */
  installable: boolean;
}

// 技能分类
export interface SkillCategory {
  key: string;
  name: string;
  nameEn: string;
  sortOrder: number;
}

// 列表查询参数
export interface SkillListParams {
  page?: number;
  pageSize?: number;
  sortBy?: SkillSortBy;
  category?: string;
  keyword?: string;
  origin?: SkillOrigin | '';
}

// 列表返回结果
export interface SkillListResult {
  skills: SkillItem[];
  total: number;
}

// 技能安全审核状态
export interface SkillSecurityReport {
  status: string;       // benign / ...
  statusText: string;   // 安全，无风险
  reportUrl: string;
}

// 技能详情
export interface SkillDetail extends SkillItem {
  displayName: string;
  changelog: string;         // 最新版本更新日志
  contentZhAvailable: boolean;
  ownerImage: string | null;
  securityReports: SkillSecurityReport[];
}

// 技能文件清单项
export interface SkillFile {
  path: string;
  sha256: string;
  size: number;
}

// 已安装技能（manifest 记录）
export interface InstalledSkill {
  slug: string;
  name: string;           // 展示名（可中文）
  /** 斜杠菜单等处展示的一句话说明 */
  description?: string;
  /** Agent Skill 工具用的 frontmatter name；缺失时回退 slug */
  skillName?: string;
  version: string;
  installedAt: number;
}

/** 输入框中已挂载、等待随下一条消息调用的技能 */
export interface ComposerAttachedSkill {
  slug: string;
  name: string;
  skillName?: string;
}

// 官方静态技能（随客户端分发的展示清单）
export interface OfficialSkillSeed {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  /** 是否可安装到本地；true 时从 resources/official-skills 复制 */
  installable: boolean;
  /** Agent 启用用的 frontmatter name；默认等于 slug */
  skillName?: string;
}

// 默认查询参数
export const DEFAULT_SKILL_LIST_PARAMS: Required<Pick<SkillListParams, 'page' | 'pageSize' | 'sortBy'>> = {
  page: 1,
  pageSize: 24,
  sortBy: 'score'
};

export const ORIGIN_LABELS: Record<SkillOrigin, string> = {
  aithink: 'AIThink 官方',
  community: '社区'
};
