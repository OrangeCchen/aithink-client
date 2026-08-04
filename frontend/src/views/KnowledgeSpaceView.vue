<template>
  <div class="knowledge-view">
    <!-- 顶部标题 -->
    <div class="ks-header">
      <div class="ks-header-main">
        <h1 class="ks-title">知识空间</h1>
        <p class="ks-subtitle">管理长期授权资料范围、默认沉淀位置和知识使用规则</p>
      </div>
    </div>

    <div class="ks-body">
      <!-- 区域一：默认知识空间 -->
      <section class="ks-section">
        <div class="ks-section-head">
          <h2 class="ks-section-title">默认知识空间</h2>
          <span class="ks-section-desc">临时资料确认沉淀后的默认去向</span>
        </div>
        <div class="default-card">
          <div class="default-card-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div class="default-card-info">
            <div class="default-card-name">{{ defaultSpace.name }}</div>
            <div class="default-card-path">{{ defaultSpace.path }}</div>
            <div class="default-card-meta">
              <span class="status-dot" :class="statusClass(defaultSpace.status)"></span>
              <span>{{ statusLabel(defaultSpace.status) }}</span>
              <span class="meta-sep">·</span>
              <span>最近同步 {{ defaultSpace.lastSync }}</span>
              <span class="meta-sep">·</span>
              <span>{{ defaultSpace.usage }}</span>
            </div>
          </div>
          <button class="btn-ghost" @click="changeDefaultLocation">修改默认位置</button>
        </div>
      </section>

      <!-- 区域二：授权文件夹 -->
      <section class="ks-section">
        <div class="ks-section-head">
          <h2 class="ks-section-title">授权文件夹</h2>
          <span class="ks-section-desc">只有明确授权的文件夹才进入长期可调用范围</span>
          <button class="btn-primary" @click="addFolder">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>添加授权文件夹</span>
          </button>
        </div>
        <div class="folder-list">
          <div v-for="folder in folders" :key="folder.id" class="folder-item">
            <div class="folder-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div class="folder-info">
              <div class="folder-name-row">
                <span class="folder-name">{{ folder.name }}</span>
                <span class="folder-badge" :class="statusClass(folder.status)">
                  <span class="status-dot" :class="statusClass(folder.status)"></span>
                  {{ statusLabel(folder.status) }}
                </span>
              </div>
              <div class="folder-path">{{ folder.path }}</div>
              <div class="folder-meta">
                <span>{{ folder.fileCount }} 个文件</span>
                <span class="meta-sep">·</span>
                <span>最近同步 {{ folder.lastSync }}</span>
              </div>
            </div>
            <div class="folder-actions">
              <button class="btn-ghost sm" @click="viewFolderDetails(folder)">查看文件</button>
              <button class="btn-ghost sm" @click="organizeFolder(folder)">整理文件夹</button>
              <button class="btn-ghost sm" @click="resync(folder)" title="重新同步">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
              </button>
              <button class="btn-ghost sm danger" @click="revokeFolder(folder)">取消授权</button>
            </div>
          </div>
          <div v-if="folders.length === 0" class="ks-empty">
            还没有授权任何文件夹。添加后，其中的资料才能被长期调用。
          </div>
        </div>
      </section>

      <!-- 区域三：沉淀规则 -->
      <section class="ks-section">
        <div class="ks-section-head">
          <h2 class="ks-section-title">沉淀规则</h2>
          <span class="ks-section-desc">临时资料默认不进入知识空间，规则决定任务结束后如何处理</span>
        </div>
        <div class="rule-list">
          <div v-for="rule in rules" :key="rule.key" class="rule-item">
            <div class="rule-info">
              <div class="rule-name">{{ rule.label }}</div>
              <div class="rule-desc">{{ rule.desc }}</div>
            </div>
            <div class="rule-options">
              <button
                v-for="opt in ruleOptions"
                :key="opt.value"
                class="rule-opt"
                :class="{ active: rule.strategy === opt.value }"
                @click="rule.strategy = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 文件夹详情对话框 -->
    <el-dialog
      v-model="showDetailsDialog"
      :title="`${currentFolder?.name} - 文件管理`"
      width="90%"
      top="5vh"
      :close-on-click-modal="false"
    >
      <div class="folder-details">
        <div class="details-header">
          <p class="details-path">路径: {{ currentFolder?.path }}</p>
        </div>
        <div class="details-screenshot">
          <img src="/kn.png" alt="知识库管理界面示意图" style="width: 100%; height: auto;" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

type FolderStatus = 'available' | 'processing' | 'failed' | 'todo';

interface AuthorizedFolder {
  id: string;
  name: string;
  path: string;
  status: FolderStatus;
  fileCount: number;
  lastSync: string;
}

// 默认知识空间（mock）
const defaultSpace = reactive({
  name: '我的知识空间',
  path: '~/AIThink/默认知识空间',
  status: 'available' as FolderStatus,
  lastSync: '今天 10:24',
  usage: '占用 128 MB'
});

// 授权文件夹(初始 mock 数据)
const folders = ref<AuthorizedFolder[]>([
  { id: '1', name: '公文模板库', path: '~/文档/公文模板', status: 'available', fileCount: 42, lastSync: '今天 09:10' },
  { id: '2', name: '2026 政策文件', path: '~/文档/政策文件/2026', status: 'processing', fileCount: 128, lastSync: '同步中' },
  { id: '3', name: '会议纪要归档', path: '~/工作/会议纪要', status: 'todo', fileCount: 7, lastSync: '3 个文件需处理' },
  { id: '4', name: '历史素材', path: '~/素材/2024-2025', status: 'failed', fileCount: 0, lastSync: '解析失败' }
]);

// 文件夹详情对话框
const showDetailsDialog = ref(false);
const currentFolder = ref<AuthorizedFolder | null>(null);

// 沉淀规则（mock，PRD KS-306：每次询问/默认不沉淀/默认沉淀）
const ruleOptions = [
  { value: 'ask', label: '每次询问' },
  { value: 'never', label: '默认不沉淀' },
  { value: 'always', label: '默认沉淀' }
];

const rules = reactive([
  { key: 'file', label: '临时上传文件', desc: '任务中上传的文件是否加入知识空间', strategy: 'ask' },
  { key: 'web', label: '临时网页', desc: '任务中引用的网页来源是否长期保留', strategy: 'never' },
  { key: 'conclusion', label: '对话结论', desc: '对话中产生的结论是否写入知识空间', strategy: 'ask' },
  { key: 'artifact', label: '任务产物', desc: '生成的草稿、纪要、表格是否保存为长期材料', strategy: 'never' }
]);

const statusLabel = (s: FolderStatus) =>
  ({ available: '可用', processing: '处理中', failed: '失败', todo: '需处理' }[s]);

const statusClass = (s: FolderStatus) => `is-${s}`;

// 交互
const changeDefaultLocation = () => ElMessage.info('修改默认位置：修改前将提示影响范围');

const addFolder = async () => {
  try {
    // 调用 Electron 文件夹选择对话框
    const result = await window.electronAPI.invoke('dialog:open-folder');

    if (result && !result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];

      // 检查是否已经添加过
      const exists = folders.value.some(f => f.path === selectedPath);
      if (exists) {
        ElMessage.warning('该文件夹已经添加过了');
        return;
      }

      // 提取文件夹名称（路径的最后一部分）
      const pathParts = selectedPath.split(/[/\\]/);
      const folderName = pathParts[pathParts.length - 1] || '未命名文件夹';

      // 添加到列表
      const newFolder: AuthorizedFolder = {
        id: Date.now().toString(),
        name: folderName,
        path: selectedPath,
        status: 'available',
        fileCount: 0,
        lastSync: '刚刚'
      };

      folders.value.push(newFolder);
      ElMessage.success(`已添加授权文件夹「${folderName}」`);

      // TODO: 这里可以调用后端 API 保存到数据库
      // await window.electronAPI.invoke('knowledge:add-folder', { path: selectedPath });
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
    ElMessage.error('添加文件夹失败');
  }
};

const viewFolderDetails = (folder: AuthorizedFolder) => {
  currentFolder.value = folder;
  showDetailsDialog.value = true;
};

const organizeFolder = (f: { name: string }) => ElMessage.info(`整理「${f.name}」：默认只生成建议，不改动原文件`);
const resync = (f: { name: string }) => ElMessage.success(`已发起「${f.name}」重新同步`);

const revokeFolder = (f: { id: string; name: string }) => {
  if (!confirm(`取消授权「${f.name}」？取消后该范围内资料不再被新任务调用。`)) return;
  folders.value = folders.value.filter(item => item.id !== f.id);
  ElMessage.success('已取消授权');

  // TODO: 这里可以调用后端 API 从数据库删除
  // await window.electronAPI.invoke('knowledge:remove-folder', { id: f.id });
};
</script>

<style scoped>
.knowledge-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  overflow: hidden;
}

.ks-header {
  padding: 24px 32px 20px;
  border-bottom: 1px solid var(--color-border);
}

.ks-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.ks-subtitle {
  font-size: var(--font-base);
  color: var(--color-text-tertiary);
}

.ks-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}

.ks-section {
  margin-bottom: 32px;
}

.ks-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.ks-section-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.ks-section-desc {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.ks-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

/* 默认知识空间卡片 */
.default-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.default-card-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.default-card-info {
  flex: 1;
  min-width: 0;
}

.default-card-name {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--color-text-primary);
}

.default-card-path {
  font-size: var(--font-sm);
  color: var(--color-text-tertiary);
  margin: 2px 0 6px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.default-card-meta,
.folder-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.meta-sep {
  color: var(--color-border-strong);
}

/* 授权文件夹列表 */
.folder-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: all 0.15s ease;
}

.folder-item:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-sm);
}

.folder-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-bg-soft);
  color: var(--color-text-tertiary);
}

.folder-info {
  flex: 1;
  min-width: 0;
}

.folder-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folder-name {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--color-text-primary);
}

.folder-path {
  font-size: var(--font-sm);
  color: var(--color-text-tertiary);
  margin: 2px 0 4px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.folder-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 状态标记 */
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.status-dot.is-available { background: var(--color-success); }
.status-dot.is-processing { background: var(--color-accent); }
.status-dot.is-failed { background: var(--color-danger); }
.status-dot.is-todo { background: var(--color-warning); }

.folder-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
}
.folder-badge.is-available { color: var(--color-success); background: var(--color-success-soft); }
.folder-badge.is-processing { color: var(--color-accent-text); background: var(--color-accent-soft); }
.folder-badge.is-failed { color: var(--color-danger); background: var(--color-danger-soft); }
.folder-badge.is-todo { color: var(--color-warning); background: var(--color-warning-soft); }

/* 按钮 */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  background: var(--color-text-primary);
  color: #fff;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-base);
  font-weight: 500;
  transition: all 0.15s ease;
}
.btn-primary:hover { background: #000; box-shadow: var(--shadow-md); }

.btn-ghost {
  padding: 7px 14px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-base);
  white-space: nowrap;
  transition: all 0.15s ease;
}
.btn-ghost:hover { border-color: var(--color-text-tertiary); color: var(--color-text-primary); }
.btn-ghost.sm { padding: 5px 10px; font-size: var(--font-sm); }
.btn-ghost.danger:hover { border-color: var(--color-danger); color: var(--color-danger); }

/* 沉淀规则 */
.rule-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--color-bg);
}
.rule-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.rule-info { flex: 1; min-width: 0; }

.rule-name {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--color-text-primary);
}
.rule-desc {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-top: 2px;
}

.rule-options {
  display: inline-flex;
  padding: 2px;
  background: var(--color-bg-soft);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.rule-opt {
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-sm);
  transition: all 0.15s ease;
}
.rule-opt.active {
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

/* 文件夹详情对话框 */
.folder-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.details-header {
  padding: 12px 16px;
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.details-path {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  margin-bottom: 8px;
}

.details-hint {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.details-screenshot {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #f5f5f5;
}

.details-screenshot img {
  width: 100%;
  height: auto;
  display: block;
}
</style>

