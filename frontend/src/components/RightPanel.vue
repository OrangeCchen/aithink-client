<template>
  <div class="right-panel">
    <!-- 顶栏页签：有待回答问题时突出「问题」 -->
    <div class="rp-tabs">
      <button
        class="rp-tab"
        :class="{ active: activeTab === 'questions', pulse: hasPending && activeTab !== 'questions' }"
        @click="activeTab = 'questions'"
      >
        问题
        <span v-if="pendingCount > 0" class="badge">{{ pendingCount }}</span>
      </button>
      <button class="rp-tab" :class="{ active: activeTab === 'footprint' }" @click="activeTab = 'footprint'">
        足迹
      </button>
      <button class="rp-tab" :class="{ active: activeTab === 'context' }" @click="activeTab = 'context'">
        上下文
      </button>
    </div>

    <div class="rp-body">
      <QuestionPanel v-if="activeTab === 'questions'" />
      <div v-else-if="activeTab === 'footprint'" class="tab-pane">
        <FootprintPanel />
      </div>
      <div v-else class="tab-pane context-pane">
        <div class="context-section">
          <div class="context-label">已安装技能 {{ installedCount }}</div>
          <div v-if="installedCount === 0" class="empty-inline">暂无已安装技能</div>
          <div v-else class="skill-list">
            <div v-for="skill in installed" :key="skill.slug" class="skill-item">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-id">{{ skill.skillName || skill.slug }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import FootprintPanel from './FootprintPanel.vue';
import QuestionPanel from './QuestionPanel.vue';
import { useQuestionStore } from '@/stores/question';
import { useSkillStore } from '@/stores/skill';

const questionStore = useQuestionStore();
const skillStore = useSkillStore();

const activeTab = ref<'questions' | 'footprint' | 'context'>('footprint');

const hasPending = computed(() => questionStore.hasPending);
const pendingCount = computed(() => questionStore.pending?.questions.length || 0);
const installed = computed(() => skillStore.installed);
const installedCount = computed(() => skillStore.installed.length);

watch(
  () => questionStore.focusQuestions,
  (v) => {
    if (v && questionStore.hasPending) {
      activeTab.value = 'questions';
      questionStore.focusQuestions = false;
    }
  }
);

watch(hasPending, (v) => {
  if (v) activeTab.value = 'questions';
});

onMounted(() => {
  if (skillStore.installed.length === 0) {
    skillStore.loadInstalled();
  }
});
</script>

<style scoped>
.right-panel {
  background: var(--color-bg-subtle);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  min-height: 0;
}

.rp-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg);
}

.rp-tab {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.rp-tab.active {
  color: var(--color-accent-text, var(--color-accent));
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.rp-tab.pulse {
  color: var(--color-accent);
}

.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-accent);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.rp-body {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg);
  min-height: 0;
}

.tab-pane {
  height: 100%;
}

.context-pane {
  padding: 16px;
}

.context-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.context-label {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.empty-inline {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  padding: 12px 0;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.skill-name {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.skill-id {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
}
</style>
