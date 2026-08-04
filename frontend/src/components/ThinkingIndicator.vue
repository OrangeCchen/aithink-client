<template>
  <div class="thinking">
    <div class="avatar">
      <svg viewBox="0 0 32 32" width="20" height="20">
        <defs>
          <linearGradient :id="gradId" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#667eea" />
            <stop offset="100%" stop-color="#764ba2" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="15" :fill="`url(#${gradId})`" />
        <path d="M16 8 L18.5 13.5 L24 16 L18.5 18.5 L16 24 L13.5 18.5 L8 16 L13.5 13.5 Z"
              fill="white" />
      </svg>
    </div>
    <div class="bubble">
      <span class="dot dot1"></span>
      <span class="dot dot2"></span>
      <span class="dot dot3"></span>
      <span class="timer">{{ elapsed }}s</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const gradId = `ti-grad-${Math.random().toString(36).slice(2, 8)}`;
const elapsed = ref(0);
let timer: number | null = null;

onMounted(() => {
  timer = window.setInterval(() => {
    elapsed.value++;
  }, 1000);
});

onUnmounted(() => {
  if (timer !== null) {
    clearInterval(timer);
  }
});
</script>

<style scoped>
.thinking {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 0 16px;
  align-items: center;
}

.avatar {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.bubble {
  padding: 14px 18px;
  background: #f9fafb;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  animation: pulse 1.4s infinite ease-in-out;
}

.dot2 {
  animation-delay: 0.2s;
}

.dot3 {
  animation-delay: 0.4s;
}

.timer {
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}

@keyframes pulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
