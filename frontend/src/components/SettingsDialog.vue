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
            <div class="form-hint">阿里云百炼或自建代理的 API Key</div>
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input
              v-model="config.qwen.baseUrl"
              placeholder="http://localhost:8000"
            >
              <template #append>
                <el-button @click="testConnection" :loading="testing">测试连接</el-button>
              </template>
            </el-input>
            <div class="form-hint">
              需要支持 Anthropic /v1/messages 格式的网关(LiteLLM/claude-code-proxy)
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

      <el-tab-pane label="阿里云语音" name="dashscope">
        <el-form label-width="100px">
          <el-form-item label="API Key">
            <el-input
              v-model="config.dashscopeAsr.apiKey"
              type="password"
              placeholder="sk-..."
              show-password
            />
            <div class="form-hint">阿里云百炼(DashScope) API Key，用于实时语音识别</div>
          </el-form-item>
          <el-form-item label="识别模型">
            <el-select v-model="config.dashscopeAsr.model" style="width: 100%">
              <el-option label="Paraformer 实时 (paraformer-realtime-v2)" value="paraformer-realtime-v2" />
              <el-option label="Fun-ASR 实时 (fun-asr-realtime)" value="fun-asr-realtime" />
              <el-option label="Qwen-Audio 实时 (qwen-audio-3.0-asr-flash-streaming)" value="qwen-audio-3.0-asr-flash-streaming" />
            </el-select>
            <div class="form-hint">默认 Paraformer；中文场景通用，支持 16kHz 单声道流式识别</div>
          </el-form-item>
          <el-form-item label="说话人分离">
            <el-switch v-model="config.dashscopeAsr.diarizationEnabled" />
            <div class="form-hint">多人对话时开启，自动区分说话人；单人场景请关闭（否则可能影响识别质量）</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="通用" name="general">
        <el-form label-width="100px">
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
import type { AppConfig } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';

const visible = defineModel<boolean>({ default: false });

const modelStore = useModelStore();
const availableModels = computed(() => modelStore.availableModels);

const activeTab = ref('claude');
const saving = ref(false);
const testing = ref(false);
const connectionStatus = ref<{ type: 'success' | 'error', message: string, help?: string } | null>(null);
const config = ref<AppConfig>(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));

const handleOpen = async () => {
  try {
    const loaded = await window.electronAPI.invoke('config:get');
    config.value = loaded;
    connectionStatus.value = null;
  } catch (error) {
    console.error('加载配置失败:', error);
  }
};

const testConnection = async () => {
  testing.value = true;
  connectionStatus.value = null;
  try {
    const response = await fetch(`${config.value.qwen.baseUrl}/health`);
    if (response.ok) {
      connectionStatus.value = {
        type: 'success',
        message: '连接成功！代理服务运行正常'
      };
    } else {
      connectionStatus.value = {
        type: 'error',
        message: '连接失败',
        help: '服务响应异常，请检查配置'
      };
    }
  } catch (error: any) {
    connectionStatus.value = {
      type: 'error',
      message: `无法连接到 ${config.value.qwen.baseUrl}`,
      help: `请确保 LiteLLM 代理已启动：

1. 在项目根目录运行: ./start-litellm.sh
2. 或使用 Docker: docker run -p 8000:8000 ...
3. 或切换到 Claude 模型（在"通用"标签页）`
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

:deep(.el-dialog__body) {
  padding-top: 0;
}
</style>
