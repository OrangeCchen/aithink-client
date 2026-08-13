import { defineStore } from 'pinia';
import type {
  SkillItem,
  SkillCategory,
  SkillSortBy,
  SkillListParams,
  SkillDetail,
  InstalledSkill,
  SkillCenterTab,
  SkillOrigin
} from '@shared/skill-types';

export const useSkillStore = defineStore('skill', {
  state: () => ({
    activeTab: 'market' as SkillCenterTab,
    skills: [] as SkillItem[],
    total: 0,
    categories: [] as SkillCategory[],
    activeCategory: '' as string, // 空字符串 = 全部
    originFilter: '' as SkillOrigin | '',
    keyword: '',
    sortBy: 'score' as SkillSortBy,
    page: 1,
    pageSize: 24,
    loading: false,
    error: null as string | null,
    // 详情页
    selectedSlug: '' as string,
    detail: null as SkillDetail | null,
    detailLoading: false,
    detailError: null as string | null,
    // 安装状态
    installed: [] as InstalledSkill[],
    installing: '' as string, // 正在安装/移除的 slug
    // 安装确认弹层
    installConfirmSlug: '' as string,
    installConfirmOpen: false
  }),

  getters: {
    hasMore: (state) => {
      if (state.originFilter === 'aithink') return false;
      return state.skills.length < state.total;
    },
    installedSlugs: (state) => new Set(state.installed.map((s) => s.slug)),
    isInstalled: (state) => (slug: string) => state.installed.some((s) => s.slug === slug),
    installConfirmSkill: (state) => {
      if (!state.installConfirmSlug) return null;
      if (state.detail?.slug === state.installConfirmSlug) return state.detail;
      return state.skills.find((s) => s.slug === state.installConfirmSlug) || null;
    },
    // 我的技能：用已安装列表拼卡片数据
    mySkills: (state): SkillItem[] => {
      const q = state.keyword.trim().toLowerCase();
      return state.installed
        .filter((item) => {
          if (!q) return true;
          return (
            item.name.toLowerCase().includes(q) ||
            item.slug.toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q)
          );
        })
        .map((item) => {
          const fromMarket = state.skills.find((s) => s.slug === item.slug);
          if (fromMarket) return fromMarket;
          return {
            slug: item.slug,
            name: item.name,
            description: item.description || '已安装技能',
            iconUrl: '',
            category: '',
            subCategories: [],
            tags: [],
            author: '',
            namespace: null,
            homepage: '',
            source: '',
            origin: 'community' as SkillOrigin,
            originLabel: '已安装',
            downloads: 0,
            installs: 0,
            stars: 0,
            score: 0,
            verified: false,
            version: item.version,
            updatedAt: item.installedAt,
            installable: true
          };
        });
    }
  },

  actions: {
    setTab(tab: SkillCenterTab) {
      if (this.activeTab === tab) return;
      this.activeTab = tab;
      this.closeDetail();
      this.closeInstallConfirm();
    },

    // 加载分类列表（初次调用）
    async loadCategories() {
      try {
        const result = await window.electronAPI.invoke('skill:categories');
        if (result?.success) {
          this.categories = result.categories || [];
        } else {
          this.error = result?.error || '加载分类失败';
        }
      } catch (err: any) {
        this.error = err?.message || '加载分类失败';
      }
    },

    // 加载技能列表（首次或筛选变动）
    async loadSkills(reset = true) {
      if (reset) {
        this.page = 1;
        this.skills = [];
      }

      this.loading = true;
      this.error = null;

      const params: SkillListParams = {
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy
      };
      if (this.activeCategory) {
        params.category = this.activeCategory;
      }
      if (this.keyword.trim()) {
        params.keyword = this.keyword.trim();
      }
      if (this.originFilter) {
        params.origin = this.originFilter;
      }

      try {
        const result = await window.electronAPI.invoke('skill:list', params);
        if (result?.success) {
          const newSkills = result.skills || [];
          this.skills = reset ? newSkills : [...this.skills, ...newSkills];
          this.total = result.total || 0;
        } else {
          this.error = result?.error || '加载技能失败';
        }
      } catch (err: any) {
        this.error = err?.message || '加载技能失败';
      } finally {
        this.loading = false;
      }
    },

    // 加载更多（分页）
    async loadMore() {
      if (!this.hasMore || this.loading) return;
      this.page += 1;
      await this.loadSkills(false);
    },

    // 切换分类
    async setCategory(categoryKey: string) {
      if (this.activeCategory === categoryKey) return;
      this.activeCategory = categoryKey;
      await this.loadSkills(true);
    },

    // 切换来源
    async setOrigin(origin: SkillOrigin | '') {
      if (this.originFilter === origin) return;
      this.originFilter = origin;
      // 官方清单不走 SkillHub 分类
      if (origin === 'aithink') {
        this.activeCategory = '';
      }
      await this.loadSkills(true);
    },

    // 搜索
    async setKeyword(keyword: string) {
      this.keyword = keyword;
      if (this.activeTab === 'market') {
        await this.loadSkills(true);
      }
    },

    // 切换排序
    async setSort(newSort: SkillSortBy) {
      if (this.sortBy === newSort) return;
      this.sortBy = newSort;
      await this.loadSkills(true);
    },

    // 加载已安装技能列表
    async loadInstalled() {
      try {
        const result = await window.electronAPI.invoke('skill:installed');
        if (result?.success) {
          this.installed = result.installed || [];
        }
      } catch {
        // 静默失败，不影响浏览
      }
    },

    // 打开详情页
    async openDetail(slug: string) {
      this.selectedSlug = slug;
      await this.loadDetail(slug);
    },

    // 关闭详情页
    closeDetail() {
      this.selectedSlug = '';
      this.detail = null;
      this.detailError = null;
    },

    // 加载技能详情
    async loadDetail(slug: string) {
      this.detailLoading = true;
      this.detailError = null;
      this.detail = null;
      try {
        const result = await window.electronAPI.invoke('skill:detail', slug);
        if (result?.success) {
          this.detail = result.detail;
        } else {
          // 我的技能里可能只有本地 manifest
          const local = this.installed.find((s) => s.slug === slug);
          if (local) {
            this.detail = {
              slug: local.slug,
              name: local.name,
              description: '该技能已安装在本地。完整详情暂不可用（可能来自社区且网络不可达）。',
              iconUrl: '',
              category: '',
              subCategories: [],
              tags: [],
              author: '',
              namespace: null,
              homepage: '',
              source: '',
              origin: 'community',
              originLabel: '已安装',
              downloads: 0,
              installs: 0,
              stars: 0,
              score: 0,
              verified: false,
              version: local.version,
              updatedAt: local.installedAt,
              installable: true,
              displayName: local.name,
              changelog: '',
              contentZhAvailable: false,
              ownerImage: null,
              securityReports: []
            };
          } else {
            this.detailError = result?.error || '加载详情失败';
          }
        }
      } catch (err: any) {
        this.detailError = err?.message || '加载详情失败';
      } finally {
        this.detailLoading = false;
      }
    },

    openInstallConfirm(slug: string) {
      this.installConfirmSlug = slug;
      this.installConfirmOpen = true;
    },

    closeInstallConfirm() {
      this.installConfirmOpen = false;
      this.installConfirmSlug = '';
    },

    // 确认后安装
    async confirmInstall() {
      const slug = this.installConfirmSlug;
      if (!slug) return;
      this.closeInstallConfirm();
      await this.install(slug);
    },

    // 安装技能
    async install(slug: string) {
      if (this.installing) return;
      this.installing = slug;
      try {
        const result = await window.electronAPI.invoke('skill:install', slug);
        if (result?.success) {
          await this.loadInstalled();
        } else {
          this.detailError = result?.error || '安装失败';
        }
      } catch (err: any) {
        this.detailError = err?.message || '安装失败';
      } finally {
        this.installing = '';
      }
    },

    // 移除技能
    async remove(slug: string) {
      if (this.installing) return;
      this.installing = slug;
      try {
        const result = await window.electronAPI.invoke('skill:remove', slug);
        if (result?.success) {
          await this.loadInstalled();
          if (this.activeTab === 'mine' && this.selectedSlug === slug) {
            this.closeDetail();
          }
        } else {
          this.detailError = result?.error || '移除失败';
        }
      } catch (err: any) {
        this.detailError = err?.message || '移除失败';
      } finally {
        this.installing = '';
      }
    },

    // 重置
    reset() {
      this.activeTab = 'market';
      this.skills = [];
      this.total = 0;
      this.activeCategory = '';
      this.originFilter = '';
      this.keyword = '';
      this.sortBy = 'score';
      this.page = 1;
      this.error = null;
      this.selectedSlug = '';
      this.detail = null;
      this.closeInstallConfirm();
    }
  }
});
