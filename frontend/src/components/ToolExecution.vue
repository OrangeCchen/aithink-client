<template>
  <div class="tool-execution">
    <el-collapse v-model="activeNames">
      <el-collapse-item :name="tool.id">
        <template #title>
          <div class="tool-header">
            <span class="tool-label">执行命令:</span>
            <span class="tool-name">{{ tool.name }}</span>
            <el-icon class="collapse-icon"><ArrowRight /></el-icon>
          </div>
        </template>
        <div class="tool-body">
          <div class="tool-section">
            <div class="section-label">输入</div>
            <pre class="section-content">{{ tool.input }}</pre>
          </div>
          <div v-if="tool.output" class="tool-section">
            <div class="section-label">输出</div>
            <pre class="section-content">{{ tool.output }}</pre>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import type { ToolCall } from '@shared/types';

defineProps<{
  tool: ToolCall;
}>();

const activeNames = ref<string[]>([]);
</script>

<style scoped>
.tool-execution {
  width: 100%;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  width: 100%;
}

.tool-label {
  color: #6b7280;
}

.tool-name {
  color: #1f2937;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-weight: 500;
}

.collapse-icon {
  margin-left: auto;
  transition: transform 0.3s;
}

.tool-body {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.section-content {
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #1f2937;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

:deep(.el-collapse-item__header) {
  padding: 12px 16px;
  background: #f9fafb;
  border: none;
}

:deep(.el-collapse-item__wrap) {
  border: none;
  background: #ffffff;
}

:deep(.el-collapse-item__content) {
  padding: 0;
}
</style>
