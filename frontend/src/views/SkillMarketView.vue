<template>
  <div class="skill-market-view">
    <!-- 顶部：标题 + 页签 -->
    <div class="sm-header">
      <div class="sm-header-main">
        <div class="sm-title-row">
          <h1 class="sm-title">技能中心</h1>
          <p class="sm-subtitle">
            <template v-if="activeTab === 'market'">
              发现并安装技能
              <template v-if="originFilter !== 'aithink'">
                ，社区共
                <span class="highlight">{{ total.toLocaleString() }}</span> 个
              </template>
            </template>
            <template v-else>
              已安装
              <span class="highlight">{{ installedCount }}</span> 个技能
            </template>
          </p>
        </div>
        <div class="sm-tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'market' }"
            @click="skillStore.setTab('market')"
          >
            技能市场
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'mine' }"
            @click="skillStore.setTab('mine')"
          >
            我的技能
            <span v-if="installedCount > 0" class="tab-count">{{ installedCount }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="sm-body">
      <!-- 工具栏：搜索 / 来源 / 分类 / 排序 -->
      <section class="sm-toolbar">
        <div class="toolbar-search">
          <input
            v-model="keywordInput"
            type="search"
            class="search-input"
            :placeholder="activeTab === 'market' ? '搜索技能名称或关键词' : '搜索已安装技能'"
            @keydown.enter="commitSearch"
          />
          <button class="btn-ghost search-btn" @click="commitSearch">搜索</button>
        </div>

        <div v-if="activeTab === 'market'" class="toolbar-filters">
          <div class="filter-group">
            <button
              v-for="opt in originOptions"
              :key="opt.key"
              class="category-btn"
              :class="{ active: originFilter === opt.key }"
              @click="skillStore.setOrigin(opt.key)"
            >
              {{ opt.label }}
            </button>
          </div>

          <div v-if="originFilter !== 'aithink'" class="toolbar-meta">
            <select
              class="sort-select"
              :value="activeCategory"
              @change="onCategoryChange"
            >
              <option value="">全部分类</option>
              <option v-for="cat in categories" :key="cat.key" :value="cat.key">
                {{ cat.name }}
              </option>
            </select>
            <select v-model="sortBy" @change="onSortChange" class="sort-select">
              <option value="score">综合排序</option>
              <option value="downloads">下载量</option>
              <option value="stars">收藏数</option>
              <option value="newest">最新</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 市场：加载 / 错误 -->
      <div v-if="activeTab === 'market' && loading && skills.length === 0" class="loading-hint">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="activeTab === 'market' && error" class="error-hint">
        <span>{{ error }}</span>
        <button class="btn-ghost" @click="skillStore.loadSkills(true)">重试</button>
      </div>

      <!-- 市场列表 -->
      <div v-else-if="activeTab === 'market' && skills.length > 0" class="skills-grid">
        <article
          v-for="skill in skills"
          :key="skill.slug"
          class="skill-card"
          @click="skillStore.openDetail(skill.slug)"
        >
          <div class="card-badges">
            <span class="origin-badge" :class="skill.origin">{{ skill.originLabel }}</span>
            <template v-if="skillStore.isInstalled(skill.slug)">
              <button
                class="use-btn"
                @click.stop="useSkill(skill.name, skill.slug)"
                title="在对话中使用"
              >
                立即使用
              </button>
              <span class="installed-badge">已安装</span>
            </template>
          </div>
          <div class="skill-icon">
            <img v-if="skill.iconUrl" :src="skill.iconUrl" :alt="skill.name" />
            <div v-else class="icon-placeholder">{{ skill.name[0]?.toUpperCase() || '?' }}</div>
          </div>
          <div class="skill-content">
            <div class="skill-header">
              <h3 class="skill-name">{{ skill.name }}</h3>
              <svg
                v-if="skill.verified"
                class="verified-badge"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
              >
                <path
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  stroke-width="2"
                  fill="none"
                />
              </svg>
            </div>
            <div class="skill-author">@{{ skill.author || 'unknown' }}</div>
            <p class="skill-desc">{{ truncate(skill.description, 80) }}</p>
            <div class="skill-footer">
              <div class="skill-stats">
                <span v-if="skill.origin === 'community'" class="stat-item" title="下载量">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {{ formatNumber(skill.downloads) }}
                </span>
                <span v-if="skill.origin === 'community'" class="stat-item" title="收藏数">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <path
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                  {{ formatNumber(skill.stars) }}
                </span>
                <span v-else class="stat-item">{{ skill.installable === false ? '预览' : `v${skill.version || '1.0'}` }}</span>
              </div>
              <div v-if="skill.tags && skill.tags.length > 0" class="skill-tags">
                <span v-for="tag in skill.tags.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- 我的技能列表 -->
      <div v-else-if="activeTab === 'mine' && mySkills.length > 0" class="skills-grid">
        <article
          v-for="skill in mySkills"
          :key="skill.slug"
          class="skill-card"
          @click="skillStore.openDetail(skill.slug)"
        >
          <div class="card-badges">
            <button
              class="use-btn"
              @click.stop="useSkill(skill.name, resolveSkillName(skill.slug))"
              title="在对话中使用"
            >
              立即使用
            </button>
            <span class="installed-badge">已安装</span>
          </div>
          <div class="skill-icon">
            <img v-if="skill.iconUrl" :src="skill.iconUrl" :alt="skill.name" />
            <div v-else class="icon-placeholder">{{ skill.name[0]?.toUpperCase() || '?' }}</div>
          </div>
          <div class="skill-content">
            <div class="skill-header">
              <h3 class="skill-name">{{ skill.name }}</h3>
            </div>
            <div class="skill-author">
              {{ skill.version ? `v${skill.version}` : '本地技能' }}
            </div>
            <p class="skill-desc">{{ truncate(skill.description, 80) }}</p>
          </div>
        </article>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-hint">
        <p v-if="activeTab === 'mine'">还没有安装技能，去「技能市场」逛逛吧</p>
        <p v-else>暂无技能</p>
        <button
          v-if="activeTab === 'mine'"
          class="btn-primary"
          style="margin-top: 12px"
          @click="skillStore.setTab('market')"
        >
          浏览市场
        </button>
      </div>

      <!-- 加载更多 -->
      <div v-if="activeTab === 'market' && !loading && skills.length > 0 && hasMore" class="load-more">
        <button class="btn-ghost" @click="skillStore.loadMore()">加载更多</button>
      </div>
    </div>

    <!-- 技能详情覆盖层 -->
    <div v-if="selectedSlug" class="detail-overlay" @click.self="skillStore.closeDetail()">
      <div class="detail-panel">
        <button class="detail-close" @click="skillStore.closeDetail()" title="返回">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </button>

        <div v-if="detailLoading" class="loading-hint">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>

        <div v-else-if="detailError" class="error-hint">
          <span>{{ detailError }}</span>
          <button class="btn-ghost" @click="skillStore.loadDetail(selectedSlug)">重试</button>
        </div>

        <template v-else-if="detail">
          <div class="detail-header">
            <div class="detail-icon">
              <img v-if="detail.iconUrl" :src="detail.iconUrl" :alt="detail.name" />
              <div v-else class="icon-placeholder">{{ detail.name[0]?.toUpperCase() || '?' }}</div>
            </div>
            <div class="detail-meta">
              <div class="detail-title-row">
                <h2 class="detail-name">{{ detail.name }}</h2>
                <span v-if="detail.version" class="detail-version">v{{ detail.version }}</span>
                <span class="origin-badge" :class="detail.origin">{{ detail.originLabel }}</span>
              </div>
              <div class="detail-author">@{{ detail.author || 'unknown' }}</div>
              <div class="detail-stats">
                <span v-if="detail.origin === 'community'">{{ formatNumber(detail.downloads) }} 下载</span>
                <span v-if="detail.origin === 'community'">{{ formatNumber(detail.stars) }} 收藏</span>
                <span
                  v-for="report in detail.securityReports"
                  :key="report.reportUrl || report.statusText"
                  class="security-badge"
                  :class="{ safe: report.status === 'benign' }"
                >
                  {{ report.statusText || report.status }}
                </span>
              </div>
            </div>
            <div class="detail-actions">
              <button
                v-if="!skillStore.isInstalled(selectedSlug) && detail.installable !== false"
                class="btn-primary"
                :disabled="installing === selectedSlug"
                @click="skillStore.openInstallConfirm(selectedSlug)"
              >
                {{ installing === selectedSlug ? '安装中...' : '安装' }}
              </button>
              <button
                v-else-if="!skillStore.isInstalled(selectedSlug)"
                class="btn-primary"
                disabled
                title="官方预览技能将随产品内置"
              >
                即将内置
              </button>
              <template v-else>
                <button
                  class="btn-primary"
                  @click="useSkill(detail.name, resolveSkillName(detail.slug))"
                >
                  立即使用
                </button>
                <button
                  class="btn-danger"
                  :disabled="installing === selectedSlug"
                  @click="skillStore.remove(selectedSlug)"
                >
                  {{ installing === selectedSlug ? '处理中...' : '移除' }}
                </button>
              </template>
            </div>
          </div>

          <p v-if="skillStore.isInstalled(selectedSlug)" class="installed-hint">
            已安装，Agent 在对话中可自动使用此技能。也可在对话输入框输入 <code>/</code> 快速调用。
            <template v-if="detail.slug === 'business-skill-builder'">
              试试说：「帮我把客服投诉处理流程做成一个技能」。
            </template>
          </p>
          <p v-if="detailError" class="error-inline">{{ detailError }}</p>

          <div class="detail-section">
            <h3 class="detail-section-title">简介</h3>
            <p class="detail-desc">{{ detail.description || '暂无描述' }}</p>
          </div>

          <div v-if="detail.changelog" class="detail-section">
            <h3 class="detail-section-title">更新日志</h3>
            <p class="detail-desc">{{ detail.changelog }}</p>
          </div>

          <!-- 权限与依赖：静态占位，后续接真检测 -->
          <div class="detail-section">
            <h3 class="detail-section-title">权限与依赖（预览）</h3>
            <ul class="permission-list">
              <li v-for="item in permissionPlaceholders" :key="item">{{ item }}</li>
            </ul>
            <p class="detail-muted">正式依赖检测将在后续版本接入；当前安装前请阅读技能说明。</p>
          </div>

          <div v-if="detail.tags && detail.tags.length > 0" class="detail-section">
            <h3 class="detail-section-title">标签</h3>
            <div class="detail-tags">
              <span v-for="tag in detail.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 安装确认弹层 -->
    <div
      v-if="installConfirmOpen"
      class="detail-overlay confirm-overlay"
      @click.self="skillStore.closeInstallConfirm()"
    >
      <div class="confirm-panel">
        <h2 class="confirm-title">安装确认</h2>
        <p class="confirm-desc">
          即将安装
          <strong>{{ installConfirmSkill?.name || installConfirmSlug }}</strong>
          。请确认你了解其来源与可能使用的能力。
        </p>
        <div class="confirm-block">
          <h4>技能身份</h4>
          <p>来源：{{ installConfirmSkill?.originLabel || '社区' }}</p>
          <p>作者：@{{ installConfirmSkill?.author || 'unknown' }}</p>
          <p v-if="installConfirmSkill?.version">版本：v{{ installConfirmSkill.version }}</p>
        </div>
        <div class="confirm-block">
          <h4>可能涉及的权限</h4>
          <ul class="permission-list">
            <li v-for="item in permissionPlaceholders" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div class="confirm-actions">
          <button class="btn-ghost" @click="skillStore.closeInstallConfirm()">取消</button>
          <button class="btn-primary" @click="skillStore.confirmInstall()">确认安装</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSkillStore } from '@/stores/skill';
import { useChatStore } from '@/stores/chat';
import { useUiStore } from '@/stores/ui';
import type { SkillOrigin, SkillSortBy } from '@shared/skill-types';

const skillStore = useSkillStore();
const chatStore = useChatStore();
const uiStore = useUiStore();

const keywordInput = ref('');

const originOptions: { key: SkillOrigin | ''; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'aithink', label: 'AIThink 官方' },
  { key: 'community', label: '社区' }
];

const permissionPlaceholders = [
  '读取工作目录中的相关文件',
  '在对话中生成与改写内容',
  '视技能而定：网络访问或浏览器操作',
  '视技能而定：执行本地命令（需你确认）'
];

/** 构造调用提示：必须带 Agent 认的 skillName（kebab-case），中文名仅作说明 */
const buildSkillPrompt = (displayName: string, skillName: string) => {
  const id = skillName || displayName;
  if (displayName && displayName !== id) {
    return `请使用 Skill 工具调用技能「${id}」（${displayName}），并严格按其 SKILL.md 流程开始执行：`;
  }
  return `请使用 Skill 工具调用技能「${id}」，并严格按其 SKILL.md 流程开始执行：`;
};

const resolveSkillName = (slug: string): string => {
  const installed = skillStore.installed.find((s) => s.slug === slug);
  return installed?.skillName || slug;
};

const useSkill = (displayName: string, skillName?: string) => {
  chatStore.setPendingInput(buildSkillPrompt(displayName, skillName || displayName));
  skillStore.closeDetail();
  uiStore.showChat();
};

const activeTab = computed(() => skillStore.activeTab);
const skills = computed(() => skillStore.skills);
const mySkills = computed(() => skillStore.mySkills);
const total = computed(() => skillStore.total);
const categories = computed(() => skillStore.categories);
const activeCategory = computed(() => skillStore.activeCategory);
const originFilter = computed(() => skillStore.originFilter);
const sortBy = computed({
  get: () => skillStore.sortBy,
  set: (val: SkillSortBy) => skillStore.setSort(val)
});
const loading = computed(() => skillStore.loading);
const error = computed(() => skillStore.error);
const hasMore = computed(() => skillStore.hasMore);
const selectedSlug = computed(() => skillStore.selectedSlug);
const detail = computed(() => skillStore.detail);
const detailLoading = computed(() => skillStore.detailLoading);
const detailError = computed(() => skillStore.detailError);
const installing = computed(() => skillStore.installing);
const installedCount = computed(() => skillStore.installed.length);
const installConfirmOpen = computed(() => skillStore.installConfirmOpen);
const installConfirmSlug = computed(() => skillStore.installConfirmSlug);
const installConfirmSkill = computed(() => skillStore.installConfirmSkill);

const onSortChange = () => {
  skillStore.setSort(sortBy.value);
};

const onCategoryChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  skillStore.setCategory(value);
};

const commitSearch = () => {
  skillStore.setKeyword(keywordInput.value);
};

const truncate = (text: string, maxLen: number): string => {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
};

watch(
  () => skillStore.keyword,
  (val) => {
    if (val !== keywordInput.value) keywordInput.value = val;
  }
);

onMounted(async () => {
  keywordInput.value = skillStore.keyword;
  await skillStore.loadInstalled();
  await skillStore.loadCategories();
  await skillStore.loadSkills(true);
});
</script>

<style scoped>
.skill-market-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
  position: relative;
}

.sm-header {
  padding: 28px 40px 0;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sm-header-main {
  max-width: 1200px;
  margin: 0 auto;
}

.sm-title-row {
  margin-bottom: 16px;
}

.sm-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.sm-subtitle {
  font-size: var(--font-base);
  color: var(--color-text-tertiary);
  line-height: var(--leading-normal);
}

.highlight {
  color: var(--color-accent);
  font-weight: 600;
}

.sm-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  position: relative;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-btn.active {
  color: var(--color-accent-text, var(--color-accent));
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.tab-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-bg-soft, var(--color-bg-hover));
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.sm-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 40px 40px;
}

.sm-toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}

.toolbar-search {
  display: flex;
  gap: 8px;
  max-width: 480px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-size: var(--font-sm);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.search-btn {
  flex-shrink: 0;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-left: auto;
}

.category-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-btn:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-hover);
}

.category-btn.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
  font-weight: 500;
}

.sort-select {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.skill-card {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s ease;
}

.skill-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.skill-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-soft, var(--color-bg-hover));
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-icon img,
.detail-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.skill-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 88px;
}

.skill-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.verified-badge {
  color: var(--color-accent);
  flex-shrink: 0;
}

.skill-author {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.skill-desc {
  font-size: var(--font-sm);
  color: var(--color-text-tertiary);
  line-height: var(--leading-normal);
  margin: 4px 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.skill-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}

.skill-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.skill-tags,
.detail-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  padding: 2px 6px;
  background: var(--color-bg-soft, var(--color-bg-hover));
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  font-size: 10px;
  white-space: nowrap;
}

.loading-hint,
.error-hint,
.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  font-size: var(--font-base);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.btn-ghost {
  padding: 8px 20px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-ghost:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-hover);
}

.card-badges {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 1;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 70%;
}

.origin-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg-soft, var(--color-bg-hover));
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.origin-badge.aithink {
  background: var(--color-accent-soft, rgba(59, 130, 246, 0.15));
  color: var(--color-accent-text, var(--color-accent));
  font-weight: 500;
}

.installed-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-sm, 4px);
  background: var(--color-accent);
  color: #fff;
}

.use-btn {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
  cursor: pointer;
}

.use-btn:hover {
  background: var(--color-accent);
  color: #fff;
}

.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 24px;
  overflow-y: auto;
  z-index: 10;
}

.confirm-overlay {
  z-index: 20;
}

.detail-panel,
.confirm-panel {
  width: 100%;
  max-width: 720px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.confirm-panel {
  max-width: 480px;
  margin-top: 80px;
}

.detail-close {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.detail-close:hover {
  background: var(--color-bg-hover);
}

.detail-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.detail-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-meta {
  flex: 1;
  min-width: 0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-name {
  font-size: var(--font-lg, 18px);
  font-weight: 600;
  color: var(--color-text-primary, var(--color-text));
  margin: 0;
}

.detail-version {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 1px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
}

.detail-author {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.security-badge {
  padding: 1px 8px;
  border-radius: var(--radius-sm, 4px);
  background: var(--color-bg-hover);
}

.security-badge.safe {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.detail-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-primary {
  padding: 8px 24px;
  border: none;
  background: var(--color-accent);
  color: #fff;
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled,
.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger {
  padding: 8px 24px;
  border: 1px solid var(--color-border-strong, var(--color-border));
  background: var(--color-bg);
  color: #ef4444;
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

.installed-hint {
  font-size: 12px;
  color: #16a34a;
  margin: 0 0 16px;
}

.error-inline {
  font-size: 12px;
  color: #ef4444;
  margin: 0 0 16px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-primary, var(--color-text));
  margin: 0 0 8px;
}

.detail-desc {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.detail-muted {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 8px 0 0;
}

.permission-list {
  margin: 0;
  padding-left: 18px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.confirm-title {
  font-size: 18px;
  margin: 0 0 8px;
  color: var(--color-text-primary, var(--color-text));
}

.confirm-desc {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 16px;
}

.confirm-block {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--color-bg-soft, var(--color-bg-hover));
  border-radius: var(--radius-md);
}

.confirm-block h4 {
  margin: 0 0 8px;
  font-size: var(--font-sm);
  color: var(--color-text-primary, var(--color-text));
}

.confirm-block p {
  margin: 0 0 4px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
