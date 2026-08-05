<template>
  <el-dialog
    v-model="visible"
    title="设置"
    width="600px"
    :close-on-click-modal="false"
    @open="handleOpen"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="Claude" name="claude">
        <el-form label-width="100px">
          <el-form-item label="API Key">
            <el-input
              v-model="config.claude.apiKey"
              type="password"
              placeholder="sk-ant-..."
              show-password
            />
            <div class="form-hint">在 console.anthropic.com 获取</div>
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input
              v-model="config.claude.baseUrl"
              placeholder="https://api.anthropic.com"
            />
            <div class="form-hint">留默认或填写自建代理地址</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="Qwen / OpenAI 兼容" name="qwen">
        <el-form label-width="100px">
          <el-form-item label="API Key">
            <el-input
              v-model="config.qwen.apiKey"
              type="password"
              placeholder="sk-..."
              show-password
            />
            <div class="form-hint">阿里云百炼 DashScope API Key（sk-...）</div>
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input
              v-model="config.qwen.baseUrl"
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
            >
              <template #append>
                <el-button @click="testConnection" :loading="testing">测试连接</el-button>
              </template>
            </el-input>
            <div class="form-hint">
              OpenAI 兼容接口。默认直连 DashScope；也可填自建兼容网关。
            </div>
            <el-alert
              v-if="connectionStatus"
              :type="connectionStatus.type"
              :title="connectionStatus.message"
              :closable="false"
              style="margin-top: 8px"
            >
              <template v-if="connectionStatus.type === 'error' && connectionStatus.help">
                <div style="white-space: pre-line; font-size: 12px; margin-top: 8px">
                  {{ connectionStatus.help }}
                </div>
              </template>
            </el-alert>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="通用" name="general">
        <el-form label-width="110px">
          <el-form-item label="默认模型">
            <el-select v-model="config.defaultModel" style="width: 100%">
              <el-option
                v-for="m in availableModels"
                :key="m.value"
                :label="m.label"
                :value="m.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="最近目录">
            <div class="path-row">
              <el-input
                v-model="defaultWorkspacePath"
                placeholder="侧栏「最近」使用的工作目录"
              />
              <el-button @click="browseDefaultWorkspace">浏览…</el-button>
            </div>
            <div class="form-hint">
              侧栏「最近」下任务的默认工作文件夹；更改后新任务与该空间下已有任务都会写到此目录。
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useModelStore } from '@/stores/model';
import { useSpaceStore } from '@/stores/space';
import { useChatStore } from '@/stores/chat';
import type { AppConfig } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';

const visible = defineModel<boolean>({ default: false });

const modelStore = useModelStore();
const spaceStore = useSpaceStore();
const chatStore = useChatStore();
const availableModels = computed(() => modelStore.availableModels);

const activeTab = ref('claude');
const saving = ref(false);
const testing = ref(false);
const connectionStatus = ref<{ type: 'success' | 'error', message: string, help?: string } | null>(null);
const config = ref<AppConfig>(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
const defaultWorkspacePath = ref('');

const handleOpen = async () => {
  try {
    const loaded = await window.electronAPI.invoke('config:get');
    config.value = loaded;
    connectionStatus.value = null;
    await spaceStore.loadSpaces();
    defaultWorkspacePath.value = spaceStore.defaultSpace?.folderPath || '';
  } catch (error) {
    console.error('加载配置失败:', error);
  }
};

const browseDefaultWorkspace = async () => {
  try {
    const result = await window.electronAPI.invoke('dialog:open-folder');
    if (!result || result.canceled || !result.filePaths?.length) return;
    defaultWorkspacePath.value = result.filePaths[0] as string;
  } catch (err) {
    console.error(err);
    ElMessage.error('选择文件夹失败');
  }
};

const testConnection = async () => {
  testing.value = true;
  connectionStatus.value = null;
  try {
    const base = config.value.qwen.baseUrl.replace(/\/+$/, '');
    const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.value.qwen.apiKey || 'empty'}`
      }
    });
    if (response.ok) {
      connectionStatus.value = {
        type: 'success',
        message: '连接成功！OpenAI 兼容接口可用'
      };
    } else {
      const body = await response.text().catch(() => '');
      connectionStatus.value = {
        type: 'error',
        message: `连接失败 HTTP ${response.status}`,
        help: body.slice(0, 200) || '请检查 Base URL 与 API Key'
      };
    }
  } catch (error: any) {
    connectionStatus.value = {
      type: 'error',
      message: `无法连接到 ${config.value.qwen.baseUrl}`,
      help: `请确认：
1. API Key 已填写（百炼控制台）
2. Base URL 为 https://dashscope.aliyuncs.com/compatible-mode/v1
3. 网络可访问阿里云`
    };
  } finally {
    testing.value = false;
  }
};

const handleSave = async () => {
  saving.value = true;
  try {
    await window.electronAPI.invoke('config:set', JSON.parse(JSON.stringify(config.value)));
    modelStore.setModel(config.value.defaultModel);

    const nextPath = defaultWorkspacePath.value.trim();
    const def = spaceStore.defaultSpace;
    if (def && nextPath && nextPath !== def.folderPath) {
      const result = await spaceStore.updateSpaceFolder(def.id, nextPath);
      if (!result?.success) {
        ElMessage.error(result?.error || '更新最近目录失败');
        return;
      }
      if (chatStore.spaceId === def.id || !chatStore.spaceId) {
        chatStore.setSpace(def.id, nextPath);
      }
    }

    ElMessage.success('配置已保存');
    visible.value = false;
  } catch (error: any) {
    ElMessage.error('保存失败: ' + error.message);
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}

.path-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.path-row .el-input {
  flex: 1;
}

:deep(.el-dialog__body) {
  padding-top: 0;
}
</style>
