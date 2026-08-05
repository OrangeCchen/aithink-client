<template>
  <div class="thinking">
    <div class="bubble">
      <span class="label">{{ label }}</span>
      <span class="dots" aria-hidden="true">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
      <span v-if="detail" class="detail">{{ detail }}</span>
      <span class="timer">{{ elapsed }}s</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

withDefaults(
  defineProps<{
    label?: string;
    detail?: string;
  }>(),
  {
    label: '深度思考中',
    detail: ''
  }
);

const elapsed = ref(0);
let timer: number | null = null;

onMounted(() => {
  timer = window.setInterval(() => {
    elapsed.value++;
  }, 1000);
});

onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.thinking {
  display: flex;
  margin-bottom: 16px;
  padding: 0 28px;
}

.bubble {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-sm);
}

.label {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: pulse 1.4s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

.detail {
  color: var(--color-text-muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timer {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  margin-left: 2px;
}

@keyframes pulse {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
