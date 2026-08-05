<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="panelRef"
      class="qp-panel"
      :class="[`qp-place-${placement}`]"
      :style="{ top: `${top}px`, left: `${left}px` }"
      @mousedown.prevent
    >
      <i class="qp-arrow" :style="{ left: `${arrowOffset}px` }" aria-hidden="true"></i>
      <header class="qp-head">
        <strong>快速润色</strong>
        <div class="qp-pager">
          <button type="button" :disabled="index <= 0" aria-label="上一个" @click="index -= 1">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span>{{ candidates.length ? index + 1 : 0 }} / {{ candidates.length }}</span>
          <button
            type="button"
            :disabled="index >= candidates.length - 1"
            aria-label="下一个"
            @click="index += 1"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        <button type="button" class="qp-icon-btn" title="关闭" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="qp-toolbar">
        <div class="qp-idea">
          <button type="button" class="qp-idea-trigger" @click="ideaOpen = !ideaOpen">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
            润色思路
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div v-if="ideaOpen" class="qp-idea-menu">
            <button
              v-for="item in ideaPresets"
              :key="item"
              type="button"
              @click="applyIdea(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <div class="qp-meta-right">
          <span>{{ loading ? '生成中…' : currentText ? `已生成 ${charCount} 字` : '待生成' }}</span>
          <span class="qp-ai">内容由 AI 生成</span>
        </div>
      </div>

      <label class="qp-opinion">
        <input
          ref="opinionInputRef"
          v-model="opinion"
          type="text"
          placeholder="先写修改意见，例如：更简洁、突出行动项"
          :disabled="loading"
          @mousedown.stop
          @keydown.enter.prevent="run('rewrite')"
        />
      </label>

      <div class="qp-preview" :class="{ compare }">
        <template v-if="currentText">
          <p v-if="compare" class="qp-original">{{ selectedText }}</p>
          <div class="qp-result markdown-body" v-html="renderedResult"></div>
        </template>
        <p v-else class="qp-placeholder">
          {{
            loading
              ? 'AI 正在润色选中内容…'
              : '先填写修改意见或选择润色思路，再点「重写」生成。'
          }}
        </p>
      </div>

      <footer class="qp-foot">
        <label class="qp-switch" @mousedown.stop>
          <input v-model="compare" type="checkbox" />
          <i></i>
          <span>对照原文</span>
        </label>

        <div class="qp-actions">
          <div class="qp-actions-edit">
            <button type="button" :disabled="loading" @click="run('continue')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              续写
            </button>
            <button type="button" :disabled="loading" @click="onAdjust">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                <path d="M2 14h4M10 8h4M18 16h4" />
              </svg>
              调整
            </button>
            <button type="button" class="qp-rewrite" :disabled="loading" @click="run('rewrite')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M21 12a9 9 0 1 1-2.6-6.2" />
                <path d="M21 3v6h-6" />
              </svg>
              {{ loading ? '生成中' : '重写' }}
            </button>
          </div>
          <div class="qp-divider" aria-hidden="true"></div>
          <div class="qp-actions-commit">
            <button type="button" :disabled="loading" @click="emit('discard')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 6h18M8 6V4h8v2M9 6l1 14h4l1-14" />
              </svg>
              弃用
            </button>
            <button
              type="button"
              class="qp-replace"
              :disabled="loading || !currentText"
              @click="emit('replace', currentText)"
            >
              替换
            </button>
          </div>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { marked } from 'marked';
import type { PolishMode, PolishPlacement } from '../composables/useTextPolish';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    top: number;
    left: number;
    selectedText: string;
    /** 原始选区水平中心，用于箭头指向 */
    anchorX?: number;
    placement?: PolishPlacement;
    loading?: boolean;
    /** 打开时是否自动重写一次；默认关闭，等用户给意见后再生成 */
    autoGenerate?: boolean;
  }>(),
  {
    anchorX: 0,
    placement: 'bottom',
    loading: false,
    autoGenerate: false
  }
);

const emit = defineEmits<{
  close: [];
  discard: [];
  replace: [text: string];
  generate: [payload: { mode: PolishMode; opinion: string; selectedText: string }];
  positioned: [el: HTMLElement];
}>();

const opinion = ref('');
const candidates = ref<string[]>([]);
const index = ref(0);
const compare = ref(true);
const ideaOpen = ref(false);
const opinionInputRef = ref<HTMLInputElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const hasAutoGenerated = ref(false);

const ideaPresets = [
  '更简洁专业',
  '突出决策与行动项',
  '补充负责人与截止时间',
  '语气更正式'
];

const currentText = computed(() => candidates.value[index.value] || '');
const charCount = computed(() => currentText.value.replace(/\s/g, '').length);

const arrowOffset = computed(() => {
  const panelWidth = panelRef.value?.offsetWidth || 440;
  const raw = props.anchorX - props.left;
  return Math.max(16, Math.min(raw, panelWidth - 16));
});

function sanitizePreviewHtml(rawHtml: string) {
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  parsed.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => {
    node.remove();
  });
  parsed.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
      if (
        ['href', 'src'].includes(attribute.name)
        && !/^(https?:|mailto:|#|\/)/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return parsed.body.innerHTML;
}

const renderedResult = computed(() => {
  const text = currentText.value.trim();
  if (!text) return '';
  try {
    const html = marked.parse(text, { async: false, breaks: true, gfm: true }) as string;
    return sanitizePreviewHtml(html);
  } catch {
    return sanitizePreviewHtml(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }
});

async function notifyPositioned() {
  await nextTick();
  if (panelRef.value) emit('positioned', panelRef.value);
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      opinion.value = '';
      candidates.value = [];
      index.value = 0;
      compare.value = true;
      ideaOpen.value = false;
      hasAutoGenerated.value = false;
      return;
    }
    await notifyPositioned();
    opinionInputRef.value?.focus();
    if (props.autoGenerate && !hasAutoGenerated.value) {
      hasAutoGenerated.value = true;
      run('rewrite');
    }
  }
);

watch([currentText, compare, () => props.loading], () => {
  if (props.visible) void notifyPositioned();
});

function applyIdea(item: string) {
  opinion.value = item;
  ideaOpen.value = false;
  opinionInputRef.value?.focus();
}

async function onAdjust() {
  ideaOpen.value = true;
  await nextTick();
  opinionInputRef.value?.focus();
}

function run(mode: PolishMode) {
  emit('generate', {
    mode,
    opinion: opinion.value.trim(),
    selectedText: props.selectedText
  });
}

/** 由父组件在生成成功后调用 */
function pushCandidate(text: string) {
  const value = text.trim();
  if (!value) return;
  candidates.value = [...candidates.value, value];
  index.value = candidates.value.length - 1;
}

defineExpose({ pushCandidate });
</script>

<style scoped>
.qp-panel {
  --qp-blue: #3370ff;
  --qp-blue-soft: #edf3ff;
  --qp-ink: #111827;
  --qp-muted: #6b7280;
  --qp-line: #e5e7eb;

  position: fixed;
  z-index: 80;
  box-sizing: border-box;
  width: min(440px, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  padding: 12px;
  border: 1px solid var(--qp-line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

/* 箭头指向原始选区中心 */
.qp-arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border: 1px solid var(--qp-line);
  transform: translateX(-50%) rotate(45deg);
  pointer-events: none;
}

.qp-place-bottom .qp-arrow {
  top: -6px;
  border-right: 0;
  border-bottom: 0;
  box-shadow: -2px -2px 4px rgba(15, 23, 42, 0.04);
}

.qp-place-top .qp-arrow {
  bottom: -6px;
  border-left: 0;
  border-top: 0;
  box-shadow: 2px 2px 4px rgba(15, 23, 42, 0.04);
}

.qp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.qp-head strong {
  color: var(--qp-ink);
  font-size: 14px;
  font-weight: 650;
}

.qp-pager {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--qp-muted);
  font-size: 12px;
}

.qp-pager button,
.qp-icon-btn {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--qp-muted);
  cursor: pointer;
}

.qp-pager button:disabled {
  opacity: 0.35;
  cursor: default;
}

.qp-pager button:hover:not(:disabled),
.qp-icon-btn:hover {
  background: #f3f4f6;
  color: var(--qp-ink);
}

.qp-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.qp-idea {
  position: relative;
}

.qp-idea-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #c7d7fe;
  border-radius: 8px;
  background: var(--qp-blue-soft);
  color: var(--qp-blue);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.qp-idea-menu {
  position: absolute;
  z-index: 2;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--qp-line);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.qp-idea-menu button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.qp-idea-menu button:hover {
  background: var(--qp-blue-soft);
  color: var(--qp-blue);
}

.qp-meta-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: #9ca3af;
  font-size: 11px;
}

.qp-ai {
  color: #5b8cff;
}

.qp-opinion {
  display: block;
  margin-bottom: 8px;
}

.qp-opinion input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--qp-line);
  border-radius: 8px;
  outline: 0;
  font-size: 12px;
}

.qp-opinion input:focus {
  border-color: #9db7fa;
  box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
}

.qp-preview {
  min-height: 84px;
  max-height: 160px;
  margin-bottom: 10px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  background: #fafbfc;
}

.qp-placeholder {
  margin: 0;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.6;
}

.qp-original {
  margin: 0 0 8px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.65;
  text-decoration: line-through;
}

.qp-result {
  color: var(--qp-ink);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.qp-result :deep(p) {
  margin: 0.35em 0;
}

.qp-result :deep(p:first-child) {
  margin-top: 0;
}

.qp-result :deep(p:last-child) {
  margin-bottom: 0;
}

.qp-result :deep(ul),
.qp-result :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.3em;
}

.qp-result :deep(li) {
  margin: 0.15em 0;
}

.qp-result :deep(strong) {
  font-weight: 650;
  color: #0f172a;
}

.qp-result :deep(code) {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 12px;
}

.qp-preview.compare .qp-result {
  padding: 6px 8px;
  border-radius: 6px;
  background: #e8f0ff;
}

.qp-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qp-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.qp-switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.qp-switch i {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: #d1d5db;
  transition: background 0.15s;
}

.qp-switch i::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s;
}

.qp-switch input:checked + i {
  background: var(--qp-blue);
}

.qp-switch input:checked + i::after {
  transform: translateX(14px);
}

.qp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.qp-actions-edit,
.qp-actions-commit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qp-divider {
  width: 1px;
  height: 22px;
  background: var(--qp-line);
}

.qp-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--qp-line);
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.qp-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.qp-actions button:hover:not(:disabled) {
  background: #f9fafb;
}

.qp-rewrite {
  border-color: #c7d7fe !important;
  background: var(--qp-blue-soft) !important;
  color: var(--qp-blue) !important;
}

.qp-replace {
  border-color: var(--qp-blue) !important;
  background: var(--qp-blue) !important;
  color: #fff !important;
  font-weight: 600;
}

.qp-replace:hover:not(:disabled) {
  background: #245bdb !important;
}
</style>
