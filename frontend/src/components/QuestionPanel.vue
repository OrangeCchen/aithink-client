<template>
  <div class="question-panel">
    <div v-if="!hasPending" class="empty-hint">
      <p>暂无待回答问题</p>
      <p class="hint-sub">Agent 需要你做选择时，问题会出现在这里</p>
    </div>

    <template v-else>
      <h2 class="panel-heading">请回答以下问题</h2>

      <div
        v-for="(q, index) in pending!.questions"
        :key="q.question + index"
        class="question-block"
      >
        <div class="q-index">{{ String(index + 1).padStart(2, '0') }}</div>
        <div class="q-body">
          <div class="q-header">{{ q.header || `问题 ${index + 1}` }}</div>
          <p class="q-text">{{ q.question }}</p>

          <div class="options">
            <label
              v-for="opt in q.options"
              :key="opt.label"
              class="option"
              :class="{ selected: isSelected(q, opt.label) }"
            >
              <input
                v-if="q.multiSelect"
                type="checkbox"
                :checked="isSelected(q, opt.label)"
                @change="toggleMulti(q, opt.label)"
              />
              <input
                v-else
                type="radio"
                :name="'q-' + index"
                :checked="isSelected(q, opt.label)"
                @change="selectSingle(q, opt.label)"
              />
              <span class="opt-content">
                <span class="opt-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
              </span>
            </label>

            <!-- 其它 -->
            <label class="option" :class="{ selected: isOtherSelected(q) }">
              <input
                v-if="q.multiSelect"
                type="checkbox"
                :checked="isOtherSelected(q)"
                @change="toggleOther(q)"
              />
              <input
                v-else
                type="radio"
                :name="'q-' + index"
                :checked="isOtherSelected(q)"
                @change="selectOther(q)"
              />
              <span class="opt-content">
                <span class="opt-label">其他</span>
                <span class="opt-desc">填写自定义说明</span>
              </span>
            </label>
            <input
              v-if="isOtherSelected(q)"
              v-model="otherTexts[q.question]"
              class="other-input"
              type="text"
              placeholder="请输入你的说明"
            />
          </div>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <button class="btn-secondary" :disabled="submitting" @click="onAiDecide">
          AI 自行决定
        </button>
        <button class="btn-primary" :disabled="submitting || !canSubmit" @click="onSubmit">
          {{ submitting ? '提交中...' : '提交答案' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useQuestionStore } from '@/stores/question';
import type { AskUserQuestionItem } from '@shared/types';

const questionStore = useQuestionStore();

const hasPending = computed(() => questionStore.hasPending);
const pending = computed(() => questionStore.pending);
const submitting = computed(() => questionStore.submitting);
const error = computed(() => questionStore.error);

/** question → 选中的 label 列表 */
const selections = reactive<Record<string, string[]>>({});
const otherSelected = reactive<Record<string, boolean>>({});
const otherTexts = reactive<Record<string, string>>({});

watch(
  () => pending.value?.toolUseId,
  () => {
    Object.keys(selections).forEach((k) => delete selections[k]);
    Object.keys(otherSelected).forEach((k) => delete otherSelected[k]);
    Object.keys(otherTexts).forEach((k) => delete otherTexts[k]);
    if (pending.value) {
      for (const q of pending.value.questions) {
        selections[q.question] = [];
        otherSelected[q.question] = false;
        otherTexts[q.question] = '';
      }
    }
  },
  { immediate: true }
);

const isSelected = (q: AskUserQuestionItem, label: string) =>
  (selections[q.question] || []).includes(label);

const isOtherSelected = (q: AskUserQuestionItem) => Boolean(otherSelected[q.question]);

const selectSingle = (q: AskUserQuestionItem, label: string) => {
  selections[q.question] = [label];
  otherSelected[q.question] = false;
};

const selectOther = (q: AskUserQuestionItem) => {
  selections[q.question] = [];
  otherSelected[q.question] = true;
};

const toggleMulti = (q: AskUserQuestionItem, label: string) => {
  const cur = selections[q.question] || [];
  if (cur.includes(label)) {
    selections[q.question] = cur.filter((x) => x !== label);
  } else {
    selections[q.question] = [...cur, label];
  }
};

const toggleOther = (q: AskUserQuestionItem) => {
  otherSelected[q.question] = !otherSelected[q.question];
};

const canSubmit = computed(() => {
  if (!pending.value) return false;
  return pending.value.questions.every((q) => {
    const picked = (selections[q.question] || []).length > 0;
    const other = otherSelected[q.question] && (otherTexts[q.question] || '').trim();
    return picked || other;
  });
});

const buildAnswers = (): Record<string, string> => {
  const answers: Record<string, string> = {};
  if (!pending.value) return answers;
  for (const q of pending.value.questions) {
    const labels = [...(selections[q.question] || [])];
    if (otherSelected[q.question] && (otherTexts[q.question] || '').trim()) {
      labels.push(`其他: ${(otherTexts[q.question] || '').trim()}`);
    }
    answers[q.question] = labels.join(', ');
  }
  return answers;
};

const onSubmit = async () => {
  await questionStore.submitAnswers(buildAnswers());
};

const onAiDecide = async () => {
  await questionStore.submitAiDecide();
};
</script>

<style scoped>
.question-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 120px;
}

.empty-hint {
  text-align: center;
  padding: 28px 12px;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}

.hint-sub {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.8;
}

.panel-heading {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.question-block {
  display: flex;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}

.q-index {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--color-accent-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-accent-text, var(--color-accent));
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.q-body {
  flex: 1;
  min-width: 0;
}

.q-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.q-text {
  margin: 0 0 10px;
  font-size: var(--font-sm);
  color: var(--color-text-primary);
  line-height: 1.5;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  background: var(--color-bg);
}

.option:hover {
  border-color: var(--color-border-strong, var(--color-border));
}

.option.selected {
  border-color: var(--color-accent);
  background: var(--color-accent-soft, rgba(59, 130, 246, 0.08));
}

.option input {
  margin-top: 3px;
}

.opt-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.opt-label {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

.opt-desc {
  font-size: 12px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.other-input {
  margin-top: 4px;
  margin-left: 22px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  background: var(--color-bg);
  color: var(--color-text-primary);
}

.other-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: stretch;
  position: sticky;
  bottom: 0;
  padding-top: 8px;
  background: var(--color-bg);
}

.btn-primary,
.btn-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
}

.btn-primary {
  border: none;
  background: var(--color-accent);
  color: #fff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #ef4444;
}
</style>
