<template>
  <div class="tx-page">
    <aside v-show="records.length > 0" class="tx-rail">
      <div class="rail-head">
        <div>
          <p class="rail-label">Recent</p>
          <h2>最近记录</h2>
        </div>
        <span class="count-chip">{{ records.length }}</span>
      </div>

      <div class="rail-actions">
        <button class="btn-ghost-block primary" type="button" @click="openSetup('media')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建转写
        </button>
        <button class="btn-ghost-block" type="button" @click="openSetup('dictation')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
          粘贴听写
        </button>
        <button class="btn-ghost-block" type="button" @click="showAllRecords">
          全部记录
        </button>
      </div>

      <div class="rail-list">
        <div
          v-if="activeTask"
          class="rail-item active processing"
          :class="activeTask.stage === 'summarizing' ? 'processing-minutes' : 'processing-transcribe'"
          role="button"
          tabindex="0"
          @click="openActiveTask"
          @keydown.enter.prevent="openActiveTask"
        >
          <div class="rail-item-line">
            <span class="rail-item-name">{{ activeTask.fileName }}</span>
            <strong>{{ Math.round(activeTask.progress) }}%</strong>
          </div>
          <span class="rail-item-message">{{ activeTask.message }}</span>
          <div class="rail-progress" aria-hidden="true">
            <span :style="{ width: `${activeTask.progress}%` }"></span>
          </div>
          <button
            type="button"
            class="rail-cancel"
            :disabled="!activeTask.id"
            @click.stop="cancel"
          >
            取消
          </button>
        </div>

        <div
          v-for="(record, index) in queuedRecords"
          :key="record.id"
          class="rail-item queued"
        >
          <div class="rail-item-line">
            <span class="rail-item-name">{{ record.fileName }}</span>
            <strong>排队</strong>
          </div>
          <span class="rail-item-message">队列第 {{ index + 1 }} 位 · 等待转写</span>
          <button type="button" class="rail-cancel" @click="cancelQueued(record)">
            取消排队
          </button>
        </div>

        <div
          v-for="record in recentRecords"
          :key="record.id"
          class="rail-item"
          :class="{ active: current?.id === record.id, renaming: renamingId === record.id }"
        >
          <button
            v-if="renamingId !== record.id"
            type="button"
            class="rail-open"
            @click="openRecord(record)"
          >
            <span class="rail-item-name">{{ record.fileName }}</span>
            <span class="rail-item-meta">
              {{ formatDate(record.updatedAt) }}
              <i class="stage-dot" :class="record.stage"></i>
              {{ stageLabel(record.stage) }}
            </span>
          </button>
          <div v-else class="rail-rename" @click.stop>
            <input
              :ref="(el) => setRenameInputRef(el)"
              v-model="renamingName"
              type="text"
              class="rail-rename-input"
              :disabled="renamingBusy"
              @keydown.enter.prevent="confirmRename(record)"
              @keydown.escape.prevent="cancelRename"
              @blur="confirmRename(record)"
            />
            <span class="rail-rename-hint">
              {{ isDictationRecord(record) ? '仅修改记录名称' : '将同步重命名原始文件' }}
            </span>
          </div>
          <div
            v-if="activeTask?.id !== record.id && renamingId !== record.id"
            class="rail-item-actions"
          >
            <button
              type="button"
              class="rail-action"
              title="重命名"
              @click.stop="startRename(record)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              class="rail-action danger"
              title="删除"
              @click.stop="confirmRemove(record)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="recentRecords.length === 0 && !activeTask && !queuedRecords.length" class="rail-empty">
          暂无最近记录
        </div>
      </div>
    </aside>

    <main
      class="tx-main"
      :class="{
        'list-mode': pageMode === 'list',
        'detail-mode': pageMode === 'detail',
        'minutes-focus': pageMode === 'detail' && minutesExpanded
      }"
    >
      <header v-show="!(pageMode === 'detail' && minutesExpanded)" class="tx-hero">
        <div class="hero-copy">
          <h1>文件转写</h1>
          <p class="hero-desc">本地转写音视频，并生成结构化会议纪要</p>
        </div>
        <div class="hero-meta">
          <span class="pill" :class="{ ok: modelReady }">
            {{ modelReady ? '模型就绪' : '待配置模型' }}
          </span>
        </div>
      </header>

      <div v-if="error" class="alert" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="error = ''">关闭</button>
      </div>

      <section v-show="pageMode === 'list'" class="record-list-page">
        <div class="list-toolbar">
          <div>
            <h2>全部转写</h2>
            <p>查看和管理所有转写记录</p>
          </div>
        </div>

        <div v-if="records.length" class="list-controls">
          <label class="search-box">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input v-model="searchQuery" type="search" placeholder="搜索文件名或转写内容" />
          </label>
          <div class="filter-group" aria-label="按状态筛选">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              :class="{ active: statusFilter === option.value }"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="!records.length" class="list-empty">
          <div class="empty-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 5h16v14H4z" />
              <path d="M8 9h8M8 13h5" />
            </svg>
          </div>
          <h3>从录音或听写开始</h3>
          <p>选择本地音视频转写，或粘贴语音备忘录听写文本生成会议纪要。</p>
          <div class="list-empty-actions">
            <button type="button" class="btn-primary compact" @click="openSetup('media')">新建转写</button>
            <button type="button" class="btn-secondary compact" @click="openSetup('dictation')">粘贴听写</button>
          </div>
        </div>

        <div v-else-if="filteredRecords.length" class="record-table-wrap">
          <table class="record-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>状态</th>
                <th>时长</th>
                <th>转写耗时</th>
                <th>字数</th>
                <th>更新时间</th>
                <th><span class="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in filteredRecords" :key="record.id" @click="openRecord(record)">
                <td>
                  <span class="file-cell">
                    <i class="stage-dot" :class="record.stage"></i>
                    <span>
                      <strong>{{ record.fileName }}</strong>
                      <small>
                        {{
                          isDictationRecord(record)
                            ? record.minutes
                              ? '听写 · 已生成纪要'
                              : '听写文本'
                            : record.minutes
                              ? '已生成会议纪要'
                              : '仅转写全文'
                        }}
                      </small>
                    </span>
                  </span>
                </td>
                <td>
                  <span class="status-badge" :class="record.stage">
                    {{ stageLabel(record.stage) }}
                    <template v-if="isActiveStage(record.stage)">
                      · {{ Math.round(record.progress) }}%
                    </template>
                  </span>
                  <div
                    v-if="isActiveStage(record.stage)"
                    class="list-progress"
                    :class="record.stage === 'summarizing' ? 'minutes' : 'transcribe'"
                    aria-hidden="true"
                  >
                    <span :style="{ width: `${record.progress}%` }"></span>
                  </div>
                </td>
                <td>
                  {{
                    isDictationRecord(record)
                      ? '听写文本'
                      : formatDurationShort(record.duration)
                  }}
                </td>
                <td>
                  {{
                    isDictationRecord(record)
                      ? '—'
                      : formatProcessingMs(record.processingMs)
                  }}
                </td>
                <td>{{ formatTextCount(record.transcript) }}</td>
                <td>{{ formatFullDate(record.updatedAt) }}</td>
                <td>
                  <button
                    type="button"
                    class="table-delete"
                    title="删除"
                    :disabled="activeTask?.id === record.id"
                    @click.stop="confirmRemove(record)"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="list-empty filtered">
          <h3>没有匹配的记录</h3>
          <p>尝试更换关键词或状态筛选。</p>
        </div>
      </section>

      <section v-show="pageMode === 'setup'" class="setup">
        <div class="setup-mode-switch" role="tablist" aria-label="新建方式">
          <button
            type="button"
            role="tab"
            :aria-selected="setupMode === 'media'"
            :class="{ active: setupMode === 'media' }"
            @click="setupMode = 'media'"
          >
            音视频转写
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="setupMode === 'dictation'"
            :class="{ active: setupMode === 'dictation' }"
            @click="setupMode = 'dictation'"
          >
            粘贴听写
          </button>
        </div>

        <template v-if="setupMode === 'media'">
          <div class="setup-row">
            <button type="button" class="tile model-tile" @click="chooseModel">
              <div class="tile-top">
                <span class="tile-tag">Model</span>
                <span class="status-led" :class="{ on: modelReady }"></span>
              </div>
              <h3>{{ modelReady ? '模型已配置' : '选择本地模型' }}</h3>
              <p class="tile-path">
                {{ modelReady ? shortPath(modelPath) : 'ggml-*.bin · 配置一次后自动记住' }}
              </p>
              <span class="tile-action">{{ modelReady ? '更换模型' : '浏览文件' }}</span>
            </button>

            <div
              class="tile drop-tile"
              :class="{ dragging, filled: selectedFiles.length > 0 }"
              @dragover.prevent="dragging = true"
              @dragleave.prevent="dragging = false"
              @drop.prevent="handleDrop"
              @click="chooseFile()"
            >
              <div class="drop-ring" aria-hidden="true"></div>
              <div class="tile-top">
                <span class="tile-tag">Media</span>
                <span v-if="selectedFiles.length" class="file-count">{{ selectedFiles.length }}</span>
              </div>
              <h3>
                {{
                  selectedFiles.length === 0
                    ? '拖入或选择音视频'
                    : selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : `已选 ${selectedFiles.length} 个文件`
                }}
              </h3>
              <p class="tile-path">
                {{
                  selectedFiles.length === 1
                    ? shortPath(selectedFiles[0].path)
                    : selectedFiles.length > 1
                      ? '可继续添加，将按顺序排队转写'
                      : '支持多选 · WAV · MP3 · M4A · MP4 · MOV · WebM'
                }}
              </p>
              <span class="tile-action">选择文件（可多选）</span>
            </div>
          </div>

          <div v-if="selectedFiles.length" class="selected-files" @click.stop>
            <div class="selected-files-head">
              <span>待转写 {{ selectedFiles.length }} 个</span>
              <button type="button" class="btn-text" @click="clearSelectedFiles">清空</button>
            </div>
            <ul>
              <li v-for="file in selectedFiles" :key="file.path">
                <span :title="file.path">{{ file.name }}</span>
                <button type="button" title="移除" @click="removeSelectedFile(file.path)">×</button>
              </li>
            </ul>
          </div>

          <button
            type="button"
            class="btn-primary"
            :disabled="!modelReady || !selectedFiles.length"
            @click="startCurrentTranscription"
          >
            {{ startButtonLabel }}
            <svg
              v-if="!busy || selectedFiles.length"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <p v-if="busy || queueLength" class="setup-hint">
            <template v-if="busy">当前任务进行中，新选文件会加入排队。</template>
            <template v-if="queueLength"> 队列中还有 {{ queueLength }} 个。</template>
          </p>
        </template>

        <template v-else>
          <div class="dictation-panel">
            <label class="dictation-field">
              <span>标题（可选）</span>
              <input
                v-model="dictationTitle"
                type="text"
                maxlength="120"
                placeholder="例如：周一晨会听写"
              />
            </label>
            <label class="dictation-field grow">
              <span>听写文本</span>
              <textarea
                v-model="dictationText"
                class="dictation-textarea"
                :disabled="minutesBusy"
                spellcheck="false"
                placeholder="从语音备忘录复制听写文本并粘贴到这里。系统会清理填充词与噪音碎片，并整理多人讨论后生成会议纪要。"
              ></textarea>
            </label>
            <p class="setup-hint">
              无需本地 Whisper 模型。适合备忘录听写、多人交错与口误较多的文本。有转写任务进行中也可直接生成。
            </p>
            <button
              type="button"
              class="btn-primary"
              :disabled="minutesBusy || !dictationText.trim()"
              @click="startDictationMinutes"
            >
              {{ minutesBusy ? '生成中…' : '生成会议纪要' }}
            </button>
          </div>
        </template>
      </section>

      <section
        v-if="current"
        v-show="pageMode === 'detail'"
        class="result"
        :class="{ 'minutes-fullscreen': minutesExpanded }"
      >
        <div v-show="!minutesExpanded" class="result-head">
          <div>
            <p class="detail-label">{{ isDictationRecord(current) ? '听写详情' : '转写详情' }}</p>
            <h2>{{ current.fileName }}</h2>
            <p class="result-meta">
              <template v-if="isDictationRecord(current)">
                听写文本
                <template v-if="current.transcript">
                  · {{ formatTextCount(current.transcript) }}
                </template>
              </template>
              <template v-else>
                {{ formatDuration(current.duration) }}
                <template v-if="current.language"> · {{ current.language }}</template>
                · {{ current.segments.length }} 片段
              </template>
            </p>
          </div>
          <div class="result-actions">
            <button
              type="button"
              class="btn-secondary"
              :disabled="!canGenerateTitle || titleGenerating"
              :title="canGenerateTitle ? '根据会议纪要生成约 15 字摘要标题' : '请先生成会议纪要'"
              @click="generateAiTitle"
            >
              {{ titleGenerating ? '生成中…' : 'AI标题' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="!canExport" @click="exportCurrent">导出</button>
          </div>
        </div>

        <div v-if="!isDictationRecord(current)" v-show="!minutesExpanded" class="media-player">
          <audio
            ref="audioRef"
            :src="mediaUrl"
            preload="auto"
            @loadedmetadata="handleAudioMetadata"
            @durationchange="handleAudioMetadata"
            @canplay="flushPendingSeek"
            @seeked="handleAudioSeeked"
            @timeupdate="handleAudioTime"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
            @error="audioError = '原始音频暂时无法播放'"
          ></audio>
          <div
            ref="waveformRef"
            class="waveform"
            role="slider"
            tabindex="0"
            aria-label="拖动或点击定位播放位置"
            :aria-valuenow="Math.round(playbackTime)"
            :aria-valuemin="0"
            :aria-valuemax="Math.round(mediaDuration)"
            @pointerdown="startWaveformSeek"
          >
            <span
              v-for="index in 96"
              :key="index"
              :class="{ played: index / 96 <= playbackProgress }"
              :style="{ height: waveformHeight(index) }"
            ></span>
            <i class="playhead" :style="{ left: `${playbackProgress * 100}%` }" aria-hidden="true"></i>
          </div>
          <div class="player-controls">
            <div class="player-left">
              <button type="button" class="player-icon primary" :title="isPlaying ? '暂停' : '播放'" @click="togglePlayback">
                <svg v-if="!isPlaying" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                </svg>
              </button>
              <button type="button" class="player-icon skip" title="后退 10 秒" @click="skipAudio(-10)">
                <span class="skip-label">-10</span>
              </button>
              <button type="button" class="player-icon skip" title="前进 10 秒" @click="skipAudio(10)">
                <span class="skip-label">+10</span>
              </button>
              <span class="player-time">{{ formatPlayerTime(playbackTime) }} / {{ formatPlayerTime(mediaDuration) }}</span>
            </div>
            <div class="player-right">
              <span v-if="audioError" class="audio-error">{{ audioError }}</span>
              <label class="volume-control">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M4 10v4h3l4 3V7L7 10H4z" />
                  <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
                </svg>
                <input
                  v-model.number="volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  @input="applyVolume"
                />
                <span>{{ Math.round(volume * 100) }}%</span>
              </label>
              <select v-model.number="playbackRate" aria-label="播放速度" @change="applyPlaybackRate">
                <option :value="0.75">0.75x</option>
                <option :value="1">1x</option>
                <option :value="1.25">1.25x</option>
                <option :value="1.5">1.5x</option>
                <option :value="2">2x</option>
              </select>
            </div>
          </div>
        </div>

        <div v-if="transcriptOutdated && !minutesExpanded" class="regen-banner">
          <span>转写已更新，可基于最新全文重新生成会议纪要</span>
          <button type="button" class="btn-text" :disabled="minutesBusy || !transcriptDraft.trim()" @click="generateCurrentMinutes">
            重新生成纪要
          </button>
        </div>

        <div class="result-grid" :class="{ 'minutes-expanded': minutesExpanded }">
          <article v-show="!minutesExpanded" class="panel panel-transcript">
            <div class="panel-head">
              <h3>{{ isDictationRecord(current) ? '听写全文' : '转写全文' }}</h3>
              <button type="button" class="btn-text" :disabled="busy" @click="persistTranscript">保存</button>
            </div>
            <div v-if="!isDictationRecord(current) && current.segments.length" class="segments">
              <div class="segments-head">
                <span>语音对照 · 播放时自动高亮跟随</span>
                <span v-if="isPlaying && currentSegmentId" class="segments-live">同步中</span>
              </div>
              <div ref="segmentScrollRef" class="segment-scroll">
                <button
                  v-for="segment in current.segments"
                  :key="segment.id"
                  type="button"
                  class="segment"
                  :data-segment-id="segment.id"
                  :class="{ current: currentSegmentId === segment.id }"
                  @click="seekToSegment(segment)"
                >
                  <time>{{ formatTimestamp(segment.startTime) }}</time>
                  <p>{{ segment.text }}</p>
                </button>
              </div>
            </div>
            <details v-if="!isDictationRecord(current) && current.segments.length" class="transcript-edit">
              <summary>编辑全文</summary>
              <textarea
                v-model="transcriptDraft"
                class="editor editor-compact"
                :disabled="busy"
                spellcheck="false"
                placeholder="转写结果会显示在这里"
              ></textarea>
            </details>
            <textarea
              v-else
              v-model="transcriptDraft"
              class="editor"
              :disabled="busy"
              spellcheck="false"
              :placeholder="isDictationRecord(current) ? '听写文本会显示在这里' : '转写结果会显示在这里'"
            ></textarea>
          </article>

          <article class="panel panel-minutes">
            <div class="panel-head">
              <h3>会议纪要</h3>
              <div class="panel-head-actions">
                <button
                  type="button"
                  class="btn-icon"
                  :title="minutesExpanded ? '还原双栏布局' : '放大纪要占满右侧'"
                  :aria-pressed="minutesExpanded"
                  @click="minutesExpanded = !minutesExpanded"
                >
                  <svg v-if="!minutesExpanded" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" />
                    <path d="M3 3l7 7M21 3l-7 7M3 21l7-7M21 21l-7-7" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M9 9H3V3M15 9h6V3M9 15H3v6M21 15v6h-6" />
                    <path d="M3 9l6-6M21 9l-6-6M3 15l6 6M21 15l-6 6" />
                  </svg>
                  {{ minutesExpanded ? '还原' : '放大' }}
                </button>
                <button
                  type="button"
                  class="btn-text"
                  :disabled="!transcriptDraft.trim() || minutesBusy"
                  @click="generateCurrentMinutes"
                >
                  {{ current.minutes ? '重新生成' : '生成纪要' }}
                </button>
                <button
                  v-if="current.minutes"
                  type="button"
                  class="btn-text"
                  @click="copyMinutes"
                >
                  复制
                </button>
                <span v-if="current.minutes" class="save-state">
                  {{ minutesSaving ? '保存中…' : minutesDirty ? '待保存' : '已保存' }}
                </span>
              </div>
            </div>
            <template v-if="current.minutes">
              <div class="minutes-format-bar" @mousedown.prevent>
                <button type="button" title="二级标题" @click="formatMinutes('formatBlock', 'h2')">标题</button>
                <button type="button" title="加粗" @click="formatMinutes('bold')"><strong>B</strong></button>
                <button type="button" title="无序列表" @click="formatMinutes('insertUnorderedList')">• 列表</button>
                <button type="button" title="有序列表" @click="formatMinutes('insertOrderedList')">1. 列表</button>
              </div>
              <div class="minutes-scroll">
                <div
                  :key="minutesViewKey"
                  ref="minutesEditorRef"
                  class="minutes-body markdown-body rich-editor"
                  :class="{ focused: minutesFocused, locked: minutesEditorLocked }"
                  contenteditable="true"
                  role="textbox"
                  aria-label="会议纪要，可直接编辑；划词可添加注释或局部修改"
                  spellcheck="true"
                  @focus="minutesFocused = true"
                  @input="minutesDirty = true"
                  @mouseup="handleMinutesSelection"
                  @keyup="handleMinutesSelection"
                  @blur="handleMinutesBlur"
                  @paste="handleMinutesPaste"
                ></div>
              </div>
              <Teleport to="body">
                <div
                  v-if="selectionMenu.visible"
                  class="minutes-selection-menu"
                  :style="{ top: `${selectionMenu.top}px`, left: `${selectionMenu.left}px` }"
                  @mousedown.prevent
                >
                  <button type="button" @click="addSelectionAsQuote">添加注释</button>
                  <button type="button" class="primary" @click="openLocalPolish">局部修改</button>
                </div>
              </Teleport>
              <QuickPolishPanel
                ref="polishPanelRef"
                :visible="polishSession.visible"
                :top="polishSession.top"
                :left="polishSession.left"
                :selected-text="polishSession.selectedText"
                :anchor-x="polishSession.anchor.x"
                :placement="polishSession.placement"
                :loading="selectionRewriting"
                :auto-generate="false"
                @close="closePolish"
                @discard="closePolish"
                @generate="handlePolishGenerate"
                @replace="handlePolishReplace"
                @positioned="clampPolishToViewport"
              />
              <form
                v-if="minutesExpanded || reviseQuotes.length"
                class="minutes-revise-bar"
                @submit.prevent="submitGlobalRevise"
              >
                <div v-if="reviseQuotes.length" class="revise-quotes">
                  <span class="revise-quotes-label">引用</span>
                  <div class="revise-quote-list">
                    <span
                      v-for="(quote, index) in reviseQuotes"
                      :key="`${index}-${quote.slice(0, 12)}`"
                      class="revise-quote-chip"
                      :title="quote"
                    >
                      <em>{{ truncateQuote(quote) }}</em>
                      <button type="button" title="移除引用" @click="removeReviseQuote(index)">×</button>
                    </span>
                  </div>
                </div>
                <div class="revise-input-row">
                  <input
                    v-model="globalReviseOpinion"
                    type="text"
                    class="minutes-revise-input"
                    :disabled="minutesBusy || selectionRewriting"
                    maxlength="500"
                    placeholder="描述要对整篇纪要做的修改，例如：更简洁、补充风险、行动项加上负责人…"
                    @keydown.enter.exact.prevent="submitGlobalRevise"
                  />
                  <button
                    type="submit"
                    class="btn-primary compact"
                    :disabled="minutesBusy || selectionRewriting || !globalReviseOpinion.trim()"
                  >
                    {{ minutesBusy ? '修改中…' : '全局修改' }}
                  </button>
                </div>
              </form>
            </template>
            <div v-else class="minutes-empty">
              <div class="orbit" aria-hidden="true">
                <span></span>
              </div>
              <h4>生成结构化纪要</h4>
              <p>整理关键讨论、决策、行动项与风险。也可先修改左侧转写再生成。</p>
              <button
                type="button"
                class="btn-primary compact"
                :disabled="!transcriptDraft.trim() || minutesBusy"
                @click="generateCurrentMinutes"
              >
                {{ minutesBusy ? '生成中…' : '生成会议纪要' }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { marked } from 'marked';
import type {
  TranscriptionRecord,
  TranscriptionSegment,
  TranscriptionStage
} from '@shared/transcription-types';
import { useFileTranscription } from '../composables/useFileTranscription';
import { useTextPolish, type PolishMode } from '../composables/useTextPolish';
import { useUiStore } from '../stores/ui';
import QuickPolishPanel from '../components/QuickPolishPanel.vue';

const uiStore = useUiStore();

const {
  records,
  current,
  selectedFiles,
  queuedRecords,
  queueLength,
  modelPath,
  modelReady,
  hydrated,
  busy,
  minutesBusy,
  minutesActiveId,
  activeTask,
  error,
  chooseModel,
  chooseFile,
  setDroppedFiles,
  removeSelectedFile,
  clearSelectedFiles,
  startTranscription,
  createFromText,
  cancel,
  cancelQueued,
  selectRecord,
  saveTranscript,
  saveMinutes,
  generateMinutes,
  rewriteSelection,
  reviseMinutes,
  exportRecord,
  removeRecord,
  renameRecord,
  generateTitle
} = useFileTranscription();

const globalReviseOpinion = ref('');
const reviseQuotes = ref<string[]>([]);

type SetupMode = 'media' | 'dictation';
const setupMode = ref<SetupMode>('media');
const dictationTitle = ref('');
const dictationText = ref('');

function isDictationRecord(record?: TranscriptionRecord | null) {
  if (!record) return false;
  return record.sourceType === 'dictation' || !record.sourcePath;
}

const renamingId = ref<string | null>(null);
const renamingName = ref('');
const renamingBusy = ref(false);
const renameInputEl = ref<HTMLInputElement | null>(null);

function setRenameInputRef(el: Element | ComponentPublicInstance | null) {
  renameInputEl.value = el instanceof HTMLInputElement ? el : null;
}

function fileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

function startRename(record: TranscriptionRecord) {
  if (['converting', 'loading-model', 'transcribing'].includes(record.stage)) {
    ElMessage.warning('转写进行中，请完成或取消后再重命名');
    return;
  }
  renamingId.value = record.id;
  // 听写记录无扩展名，直接改完整名称；媒体记录编辑主文件名
  renamingName.value = isDictationRecord(record) ? record.fileName : fileStem(record.fileName);
  void nextTick(() => {
    renameInputEl.value?.focus();
    renameInputEl.value?.select();
  });
}

function cancelRename() {
  renamingId.value = null;
  renamingName.value = '';
  renamingBusy.value = false;
}

async function confirmRename(record: TranscriptionRecord) {
  if (renamingId.value !== record.id || renamingBusy.value) return;
  const next = renamingName.value.trim();
  const dictation = isDictationRecord(record);
  const unchanged = dictation
    ? next === record.fileName
    : next === fileStem(record.fileName);
  if (!next || unchanged) {
    cancelRename();
    return;
  }

  renamingBusy.value = true;
  try {
    await renameRecord(record, next);
    ElMessage.success(dictation ? '已修改记录名称' : '已重命名原始文件');
    cancelRename();
  } catch (reason: any) {
    renamingBusy.value = false;
    ElMessage.error(reason?.message || '重命名失败');
    void nextTick(() => {
      renameInputEl.value?.focus();
      renameInputEl.value?.select();
    });
  }
}

const startButtonLabel = computed(() => {
  const count = selectedFiles.value.length;
  if (!count) return busy.value ? '转写进行中…' : '开始转写';
  if (busy.value) return `加入队列（${count}）`;
  return count > 1 ? `开始转写（${count}）` : '开始转写';
});

type PageMode = 'list' | 'setup' | 'detail';
type StatusFilter = 'all' | 'active' | 'ready' | 'completed' | 'error';

const pageMode = ref<PageMode>('setup');
const transcriptDraft = ref('');
const minutesSourceTranscript = ref('');
const audioRef = ref<HTMLAudioElement | null>(null);
const waveformRef = ref<HTMLElement | null>(null);
const segmentScrollRef = ref<HTMLElement | null>(null);
const playbackTime = ref(0);
const audioDuration = ref(0);
const playbackRate = ref(1);
const volume = ref(1);
const isPlaying = ref(false);
const audioError = ref('');
const seekingWaveform = ref(false);
const pendingSeekTime = ref<number | null>(null);
const minutesEditorRef = ref<HTMLElement | null>(null);
const polishPanelRef = ref<InstanceType<typeof QuickPolishPanel> | null>(null);
const minutesFocused = ref(false);
const minutesDirty = ref(false);
const minutesSaving = ref(false);
const selectionRewriting = ref(false);
const minutesViewKey = ref(0);
const minutesExpanded = ref(false);

const {
  session: polishSession,
  peekSelection,
  clearPeek,
  beginPolishFromPeek,
  replaceWithHtml,
  stripMarksHtml,
  clampToViewport: clampPolishToViewport,
  close: closePolish
} = useTextPolish({
  getRoot: () => minutesEditorRef.value,
  disabled: () =>
    minutesBusy.value
    || selectionRewriting.value
    || (busy.value && activeTask.value?.id === current.value?.id)
});

const selectionMenu = ref({
  visible: false,
  top: 0,
  left: 0,
  text: '',
  range: null as Range | null
});

function hideSelectionMenu() {
  selectionMenu.value = { visible: false, top: 0, left: 0, text: '', range: null };
  clearPeek();
}

function truncateQuote(text: string, max = 28) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function removeReviseQuote(index: number) {
  reviseQuotes.value = reviseQuotes.value.filter((_, i) => i !== index);
}

function addSelectionAsQuote() {
  const text = selectionMenu.value.text.trim();
  if (!text) return;
  if (!reviseQuotes.value.includes(text)) {
    reviseQuotes.value = [...reviseQuotes.value, text];
  }
  if (!minutesExpanded.value) minutesExpanded.value = true;
  hideSelectionMenu();
  ElMessage.success('已添加到引用');
}

function openLocalPolish() {
  const { text, range } = selectionMenu.value;
  hideSelectionMenu();
  if (!beginPolishFromPeek(text, range)) {
    ElMessage.warning('选区已失效，请重新划词');
  }
}

function buildReviseOpinionWithQuotes(opinion: string) {
  if (!reviseQuotes.value.length) return opinion;
  const listed = reviseQuotes.value
    .map((quote, index) => `${index + 1}. ${quote}`)
    .join('\n');
  return `参考摘录：\n${listed}\n\n修改意见：\n${opinion}`;
}
const dragging = ref(false);
const searchQuery = ref('');
const statusFilter = ref<StatusFilter>('all');

const filterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'ready', label: '待生成纪要' },
  { value: 'completed', label: '已完成' },
  { value: 'error', label: '异常' }
];

const recentRecords = computed(() =>
  records.value
    .filter(
      (record) =>
        record.id !== activeTask.value?.id
        && record.stage !== 'queued'
    )
    .slice(0, 8)
);

const canExport = computed(() =>
  Boolean(current.value?.minutes?.trim() || current.value?.transcript?.trim())
);

const canGenerateTitle = computed(() => Boolean(current.value?.minutes?.trim()));
const titleGenerating = ref(false);

const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN');
  return records.value.filter((record) => {
    const matchesQuery = !query
      || record.fileName.toLocaleLowerCase('zh-CN').includes(query)
      || record.transcript.toLocaleLowerCase('zh-CN').includes(query);
    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && isActiveStage(record.stage))
      || (statusFilter.value === 'error' && ['error', 'cancelled'].includes(record.stage))
      || record.stage === statusFilter.value;
    return matchesQuery && matchesStatus;
  });
});

const mediaUrl = computed(() =>
  current.value ? `aithink-media://transcription/${encodeURIComponent(current.value.id)}` : ''
);
const mediaDuration = computed(() => {
  const live = audioRef.value?.duration;
  if (live && Number.isFinite(live) && live > 0) return live;
  if (audioDuration.value && Number.isFinite(audioDuration.value) && audioDuration.value > 0) {
    return audioDuration.value;
  }
  return current.value?.duration || 0;
});
const playbackProgress = computed(() =>
  mediaDuration.value ? Math.min(1, Math.max(0, playbackTime.value / mediaDuration.value)) : 0
);
const currentSegmentId = computed(() => {
  const segments = current.value?.segments;
  if (!segments?.length) return null;
  const t = playbackTime.value;
  const exact = segments.find(
    (segment) => t >= segment.startTime && t < segment.endTime
  );
  if (exact) return exact.id;
  // 片段间隙或结尾：取已开始的最后一段，保证播放全程有高亮
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (t >= segments[i].startTime) return segments[i].id;
  }
  return segments[0].id;
});
const transcriptOutdated = computed(() =>
  Boolean(
    current.value?.minutes
    && transcriptDraft.value.trim()
    && transcriptDraft.value.trim() !== minutesSourceTranscript.value.trim()
  )
);

const renderedMinutes = computed(() => {
  const rawHtml = marked.parse(normalizeMinutesMarkdown(current.value?.minutes || ''), {
    async: false,
    breaks: true,
    gfm: true
  }) as string;
  return sanitizeRichHtml(rawHtml);
});

/** 仅在本条纪要生成/润色时锁定；勿用全局 busy，否则任意转写都会导致无法编辑 */
const minutesEditorLocked = computed(
  () =>
    selectionRewriting.value
    || (Boolean(current.value?.id) && minutesActiveId.value === current.value?.id)
    || (busy.value && activeTask.value?.id === current.value?.id)
);

watch(minutesEditorLocked, (locked) => {
  const el = minutesEditorRef.value;
  if (!el) return;
  el.setAttribute('contenteditable', locked ? 'false' : 'true');
}, { immediate: true });

/**
 * 只在切换记录 / 重新渲染 key / 服务端 minutes 变更时灌入 HTML。
 * 禁止持续 v-html 绑定，否则响应式更新会冲掉 contenteditable 编辑态。
 */
watch(
  [minutesViewKey, () => current.value?.id, () => current.value?.minutes],
  async () => {
    await nextTick();
    if (!minutesEditorRef.value) return;
    if (minutesDirty.value && document.activeElement === minutesEditorRef.value) return;
    minutesEditorRef.value.innerHTML = renderedMinutes.value || '<p><br></p>';
    minutesEditorRef.value.setAttribute(
      'contenteditable',
      minutesEditorLocked.value ? 'false' : 'true'
    );
  },
  { immediate: true }
);

/** 把全角竖线/缺分隔行的伪表格，规范化成 GFM 表格 */
function normalizeMinutesMarkdown(markdown: string): string {
  const text = markdown.replace(/\uFF5C/g, '|');
  return text
    .split(/\n{2,}/)
    .map((block) => normalizeTableBlock(block))
    .join('\n\n');
}

function ensureMarkdownTableRow(line: string): string {
  let value = line.trim();
  if (!value.startsWith('|')) value = `| ${value}`;
  if (!value.endsWith('|')) value = `${value} |`;
  return value;
}

function normalizeTableBlock(block: string): string {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return block;

  const pipeLines = lines.filter((line) => (line.match(/\|/g) || []).length >= 2);
  if (pipeLines.length < 2 || pipeLines.length < lines.length * 0.7) return block;

  const isSeparator = (line: string) =>
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);

  const header = ensureMarkdownTableRow(pipeLines[0]);
  const cols = header.split('|').filter((cell) => cell.trim() !== '').length;
  const separator = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = pipeLines
    .slice(1)
    .filter((line) => !isSeparator(line))
    .map((line) => ensureMarkdownTableRow(line));

  return [header, separator, ...body].join('\n');
}

function sanitizeRichHtml(rawHtml: string) {
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  parsed.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove());
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

watch(
  () => current.value?.id,
  (id) => {
    const record = current.value;
    transcriptDraft.value = record?.transcript || '';
    minutesSourceTranscript.value = record?.minutes ? record.transcript || '' : '';
    playbackTime.value = 0;
    pendingSeekTime.value = null;
    audioDuration.value = record?.duration || 0;
    isPlaying.value = false;
    audioError.value = '';
    minutesFocused.value = false;
    minutesDirty.value = false;
    minutesViewKey.value += 1;
    minutesExpanded.value = false;
    reviseQuotes.value = [];
    globalReviseOpinion.value = '';
    hideSelectionMenu();
    closePolish();
    if (!id && audioRef.value) {
      audioRef.value.pause();
    }
  },
  { immediate: true }
);

const pageModeReady = ref(false);
watch(hydrated, async (ready) => {
  if (!ready || pageModeReady.value) return;
  pageModeReady.value = true;
  // 有数据时默认打开第一条详情；无数据进入新建页
  if (records.value.length > 0) {
    await openRecord(records.value[0]);
  } else {
    pageMode.value = 'setup';
  }
});

watch(currentSegmentId, async (id, prev) => {
  if (!id || id === prev) return;
  await nextTick();
  const el = segmentScrollRef.value?.querySelector(
    `[data-segment-id="${CSS.escape(id)}"]`
  ) as HTMLElement | null;
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

function openSetup(mode: SetupMode = 'media') {
  setupMode.value = mode;
  pageMode.value = 'setup';
  current.value = null;
  transcriptDraft.value = '';
  error.value = '';
  if (mode === 'dictation') {
    // 保留已粘贴内容，便于从详情返回继续编辑
  } else {
    dictationTitle.value = '';
    dictationText.value = '';
  }
}

function showAllRecords() {
  pageMode.value = records.value.length > 0 ? 'list' : 'setup';
  error.value = '';
}

async function openRecord(record: TranscriptionRecord) {
  await selectRecord(record);
  pageMode.value = 'detail';
}

async function openActiveTask() {
  const id = activeTask.value?.id;
  if (!id) return;
  const record = records.value.find((item) => item.id === id) || current.value;
  if (record && record.id === id) {
    await openRecord(record);
    return;
  }
  await selectRecord({ id } as TranscriptionRecord);
  if (current.value) pageMode.value = 'detail';
}

async function startCurrentTranscription() {
  const record = await startTranscription();
  if (!record) return;
  // 开始后进入当前任务详情，侧栏可看排队与进度
  await openRecord(record);
}

async function startDictationMinutes() {
  const text = dictationText.value.trim();
  if (!text || minutesBusy.value) return;
  const record = await createFromText(text, dictationTitle.value.trim() || undefined);
  if (!record) return;
  dictationTitle.value = '';
  dictationText.value = '';
  await openRecord(record);
  transcriptDraft.value = record.transcript;
  minutesSourceTranscript.value = record.transcript;
  await generateMinutes(record.transcript);
  if (error.value && !current.value?.minutes) {
    ElMessage.error(error.value);
    return;
  }
  minutesSourceTranscript.value = transcriptDraft.value;
  minutesViewKey.value += 1;
  if (current.value?.minutes) {
    ElMessage.success('会议纪要已生成');
  }
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length) setDroppedFiles(files);
}

async function persistTranscript() {
  await saveTranscript(transcriptDraft.value);
  ElMessage.success(current.value?.minutes ? '转写已保存，可重新生成纪要' : '转写修改已保存');
}

async function generateCurrentMinutes() {
  closePolish();
  if (minutesDirty.value && minutesEditorRef.value) {
    await saveMinutes(richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML)));
    minutesDirty.value = false;
  }
  await generateMinutes(transcriptDraft.value);
  minutesSourceTranscript.value = transcriptDraft.value;
  minutesViewKey.value += 1;
}

function handleAudioMetadata() {
  if (!audioRef.value) return;
  const duration = audioRef.value.duration;
  audioDuration.value = Number.isFinite(duration) && duration > 0
    ? duration
    : current.value?.duration || 0;
  audioRef.value.playbackRate = playbackRate.value;
  audioRef.value.volume = volume.value;
  audioError.value = '';
  flushPendingSeek();
}

function handleAudioSeeked() {
  if (!audioRef.value) return;
  playbackTime.value = audioRef.value.currentTime;
  if (
    pendingSeekTime.value != null
    && Math.abs(audioRef.value.currentTime - pendingSeekTime.value) < 0.35
  ) {
    pendingSeekTime.value = null;
  }
}

function handleAudioTime() {
  if (seekingWaveform.value) return;
  playbackTime.value = audioRef.value?.currentTime || 0;
}

function applySeek(seconds: number) {
  const audio = audioRef.value;
  const duration = mediaDuration.value;
  if (!audio || !duration) {
    audioError.value = '音频尚未就绪，暂无法定位';
    return;
  }
  const next = Math.max(0, Math.min(duration - 0.05, seconds));
  pendingSeekTime.value = next;
  playbackTime.value = next;
  audioError.value = '';

  const commit = () => {
    try {
      audio.currentTime = next;
    } catch {
      audioError.value = '当前无法定位到该位置';
    }
  };

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) commit();
  else audio.addEventListener('loadedmetadata', commit, { once: true });
}

function flushPendingSeek() {
  if (pendingSeekTime.value == null || !audioRef.value) return;
  if (audioRef.value.readyState < HTMLMediaElement.HAVE_METADATA) return;
  try {
    audioRef.value.currentTime = pendingSeekTime.value;
  } catch {
    // 等下一次 canplay 再试
  }
}

function seekToRatio(ratio: number) {
  const duration = mediaDuration.value;
  if (!duration) {
    audioError.value = '音频时长未知，暂无法定位';
    return;
  }
  applySeek(ratio * duration);
}

function seekFromClientX(clientX: number) {
  const el = waveformRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width) return;
  seekToRatio(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
}

function startWaveformSeek(event: PointerEvent) {
  event.preventDefault();
  seekingWaveform.value = true;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  seekFromClientX(event.clientX);
  const onMove = (moveEvent: PointerEvent) => seekFromClientX(moveEvent.clientX);
  const onUp = async (upEvent: PointerEvent) => {
    seekingWaveform.value = false;
    try {
      (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(upEvent.pointerId);
    } catch {
      // ignore
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    flushPendingSeek();
    const audio = audioRef.value;
    if (audio && !audio.paused) {
      await audio.play().catch(() => undefined);
    }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

async function togglePlayback() {
  const audio = audioRef.value;
  if (!audio) return;
  if (audio.paused) {
    flushPendingSeek();
    await audio.play().catch(() => {
      audioError.value = '原始音频暂时无法播放';
    });
  } else {
    audio.pause();
  }
}

function pausePlayback() {
  const audio = audioRef.value;
  if (!audio) return;
  audio.pause();
  isPlaying.value = false;
}

/** 转写页用 v-show 保活，离开主视图时必须停掉音频 */
watch(
  () => uiStore.activeView,
  (view) => {
    if (view !== 'transcription') pausePlayback();
  }
);

function skipAudio(offset: number) {
  const duration = mediaDuration.value;
  if (!duration) return;
  applySeek(playbackTime.value + offset);
}

async function seekToSegment(segment: TranscriptionSegment) {
  const audio = audioRef.value;
  if (!audio) return;
  applySeek(segment.startTime);
  flushPendingSeek();
  await audio.play().catch(() => {
    audioError.value = '原始音频暂时无法播放';
  });
}

function applyPlaybackRate() {
  if (audioRef.value) audioRef.value.playbackRate = playbackRate.value;
}

function applyVolume() {
  if (audioRef.value) audioRef.value.volume = volume.value;
}

function waveformHeight(index: number) {
  return `${22 + ((index * 37 + index * index * 11) % 68)}%`;
}

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatMinutes(command: string, value?: string) {
  minutesEditorRef.value?.focus();
  document.execCommand(command, false, value);
  minutesDirty.value = true;
}

function handleMinutesPaste(event: ClipboardEvent) {
  event.preventDefault();
  const html = event.clipboardData?.getData('text/html');
  const text = event.clipboardData?.getData('text/plain') || '';
  const content = html
    ? sanitizeRichHtml(html)
    : text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
  document.execCommand('insertHTML', false, content);
  minutesDirty.value = true;
}

function richHtmlToMarkdown(html: string) {
  const root = new DOMParser().parseFromString(sanitizeRichHtml(html), 'text/html').body;

  const renderChildren = (node: Node): string =>
    Array.from(node.childNodes).map((child) => renderNode(child)).join('');

  const renderList = (element: Element, ordered: boolean): string => {
    const items = Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((item, index) => {
        const marker = ordered ? `${index + 1}. ` : '- ';
        return `${marker}${renderChildren(item).trim()}`;
      });
    return `${items.join('\n')}\n\n`;
  };

  const renderTable = (table: Element): string => {
    const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) =>
        renderChildren(cell).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
      )
    ).filter((cells) => cells.length);
    if (!rows.length) return '';
    const header = rows[0];
    const separator = header.map(() => '---');
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${separator.join(' | ')} |`,
      ...rows.slice(1).map((cells) => `| ${cells.join(' | ')} |`)
    ];
    return `${lines.join('\n')}\n\n`;
  };

  const renderNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof Element)) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'table') return renderTable(node);
    if (tag === 'thead' || tag === 'tbody' || tag === 'tr' || tag === 'th' || tag === 'td') {
      return '';
    }
    const content = renderChildren(node);
    if (tag === 'br') return '\n';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      return `${'#'.repeat(Number(tag[1]))} ${content.trim()}\n\n`;
    }
    if (tag === 'p' || tag === 'div') return `${content.trim()}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'ul') return renderList(node, false);
    if (tag === 'ol') return renderList(node, true);
    if (tag === 'blockquote') {
      return `${content.trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    }
    if (tag === 'pre') return `\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
    if (tag === 'code') return `\`${content}\``;
    if (tag === 'a') {
      const href = node.getAttribute('href');
      return href ? `[${content}](${href})` : content;
    }
    if (tag === 'hr') return '\n---\n\n';
    return content;
  };

  return renderChildren(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function handleMinutesSelection() {
  if (polishSession.value.visible || selectionRewriting.value) return;
  const peek = peekSelection();
  if (!peek) {
    hideSelectionMenu();
    return;
  }
  selectionMenu.value = {
    visible: true,
    top: peek.top,
    left: peek.left,
    text: peek.text,
    range: peek.range
  };
}

function onSelectionMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    hideSelectionMenu();
    if (polishSession.value.visible) closePolish();
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!selectionMenu.value.visible) return;
  const target = event.target as Node | null;
  const menu = document.querySelector('.minutes-selection-menu');
  if (menu && target && menu.contains(target)) return;
  if (minutesEditorRef.value && target && minutesEditorRef.value.contains(target)) {
    // 编辑区内继续划词由 mouseup 处理
    return;
  }
  hideSelectionMenu();
}

onMounted(() => {
  window.addEventListener('keydown', onSelectionMenuKeydown);
  window.addEventListener('pointerdown', onDocumentPointerDown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onSelectionMenuKeydown);
  window.removeEventListener('pointerdown', onDocumentPointerDown, true);
});

function polishOpinionFor(mode: PolishMode, custom: string) {
  const value = custom.trim();
  if (mode === 'continue') {
    return value || '在保留原意的前提下续写这段内容，补全未说完的要点，不要重复已有句子';
  }
  if (mode === 'adjust') {
    return value || '调整表述，使这段更清晰、结构化，保留全部事实与决策';
  }
  return value || '润色这段内容，使表述更简洁专业，保留原有事实与结论';
}

async function handlePolishGenerate(payload: {
  mode: PolishMode;
  opinion: string;
  selectedText: string;
}) {
  if (!current.value || !payload.selectedText) return;
  selectionRewriting.value = true;
  try {
    const fullMinutes = minutesEditorRef.value
      ? richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML))
      : current.value.minutes;
    const rewritten = await rewriteSelection(
      payload.selectedText,
      polishOpinionFor(payload.mode, payload.opinion),
      fullMinutes
    );
    if (rewritten) polishPanelRef.value?.pushCandidate(rewritten);
  } catch (reason: any) {
    ElMessage.error(reason?.message || '润色失败');
  } finally {
    selectionRewriting.value = false;
  }
}

async function handlePolishReplace(text: string) {
  if (!current.value || !text.trim()) return;
  try {
    const html = sanitizeRichHtml(
      marked.parse(text, { async: false, breaks: true, gfm: true }) as string
    );
    replaceWithHtml(html || text);
    minutesDirty.value = true;
    const markdown = minutesEditorRef.value
      ? richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML))
      : text;
    await saveMinutes(markdown);
    minutesDirty.value = false;
    ElMessage.success('已替换选中内容');
  } catch (reason: any) {
    ElMessage.error(reason?.message || '替换失败');
  }
}

async function submitGlobalRevise() {
  if (!current.value?.minutes || minutesBusy.value || selectionRewriting.value) return;
  const opinion = globalReviseOpinion.value.trim();
  if (!opinion) {
    ElMessage.warning('请先填写修改意见');
    return;
  }
  closePolish();
  hideSelectionMenu();
  try {
    // 先落盘未保存的编辑，再基于最新全文做全局修改
    let fullMinutes = current.value.minutes;
    if (minutesDirty.value && minutesEditorRef.value) {
      fullMinutes = richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML));
      await saveMinutes(fullMinutes);
      minutesDirty.value = false;
    } else if (minutesEditorRef.value) {
      fullMinutes = richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML));
    }
    const updated = await reviseMinutes(buildReviseOpinionWithQuotes(opinion), fullMinutes);
    if (!updated?.minutes) {
      ElMessage.error(error.value || '全局修改失败');
      return;
    }
    globalReviseOpinion.value = '';
    reviseQuotes.value = [];
    minutesViewKey.value += 1;
    minutesDirty.value = false;
    ElMessage.success('已按意见修改整篇纪要');
  } catch (reason: any) {
    ElMessage.error(reason?.message || '全局修改失败');
  }
}

async function handleMinutesBlur(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (next && (event.currentTarget as HTMLElement).parentElement?.contains(next)) {
    return;
  }
  minutesFocused.value = false;
  if (polishSession.value.visible || selectionMenu.value.visible) return;
  if (!minutesDirty.value || !minutesEditorRef.value) return;
  minutesSaving.value = true;
  try {
    const markdown = richHtmlToMarkdown(stripMarksHtml(minutesEditorRef.value.innerHTML));
    await saveMinutes(markdown);
    minutesDirty.value = false;
  } catch (reason: any) {
    ElMessage.error(reason?.message || '会议纪要保存失败');
  } finally {
    minutesSaving.value = false;
  }
}

async function exportCurrent() {
  const result = await exportRecord();
  if (result && !result.canceled) ElMessage.success('已导出会议纪要');
}

async function generateAiTitle() {
  if (!current.value || !canGenerateTitle.value || titleGenerating.value) return;
  titleGenerating.value = true;
  try {
    const updated = await generateTitle();
    if (updated?.fileName) {
      ElMessage.success(`标题已更新为「${isDictationRecord(updated) ? updated.fileName : fileStem(updated.fileName)}」`);
    }
  } catch (reason: any) {
    ElMessage.error(reason?.message || '生成标题失败');
  } finally {
    titleGenerating.value = false;
  }
}

async function copyMinutes() {
  if (!current.value?.minutes) return;
  const content = minutesDirty.value && minutesEditorRef.value
    ? richHtmlToMarkdown(minutesEditorRef.value.innerHTML)
    : current.value.minutes;
  await navigator.clipboard.writeText(content);
  ElMessage.success('会议纪要已复制');
}

async function confirmRemove(record: TranscriptionRecord) {
  try {
    await ElMessageBox.confirm(`删除「${record.fileName}」的转写记录？`, '删除记录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }
  const deletingCurrent = current.value?.id === record.id;
  await removeRecord(record);

  // 侧边列表为空才回到主界面（新建页）；否则保持当前页面
  if (!records.value.length) {
    pageMode.value = 'setup';
    return;
  }
  if (deletingCurrent && pageMode.value === 'detail') {
    const next = records.value[0];
    if (next) await openRecord(next);
  }
}

function isActiveStage(stage: TranscriptionStage) {
  return ['queued', 'idle', 'converting', 'loading-model', 'transcribing', 'summarizing'].includes(stage);
}

function stageLabel(stage: TranscriptionStage) {
  const labels: Record<TranscriptionStage, string> = {
    queued: '排队中',
    idle: '等待',
    converting: '转换中',
    'loading-model': '加载模型',
    transcribing: '转写中',
    ready: '待生成纪要',
    summarizing: '生成纪要',
    completed: '已完成',
    cancelled: '已取消',
    error: '失败'
  };
  return labels[stage];
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function formatFullDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return '时长未知';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  return hours
    ? `${hours} 小时 ${minutes} 分钟`
    : `${minutes} 分 ${String(rest).padStart(2, '0')} 秒`;
}

function formatDurationShort(seconds?: number) {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分` : `${Math.max(1, minutes)} 分钟`;
}

/** 转写墙钟耗时（毫秒） */
function formatProcessingMs(ms?: number) {
  if (ms == null || ms < 0) return '—';
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours) return `${hours} 小时 ${minutes} 分`;
  if (minutes) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
  return `${seconds} 秒`;
}

function formatTextCount(text: string) {
  const count = text.replace(/\s/g, '').length;
  return count ? `${count.toLocaleString('zh-CN')} 字` : '—';
}

function shortPath(path?: string) {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join('/')}`;
}
</script>

<style scoped>
.tx-page {
  --tx-bg: #f7f8fa;
  --tx-surface: #ffffff;
  --tx-ink: #1f2329;
  --tx-muted: #8a919f;
  --tx-line: #e5e7eb;
  --tx-accent: #3370ff;
  --tx-accent-soft: #edf3ff;
  --tx-deep: #1f2329;
  --tx-danger: #d92d20;

  height: 100%;
  min-width: 0;
  display: flex;
  background: var(--tx-bg);
  color: var(--tx-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif;
}

/* —— 左侧记录 —— */
.tx-rail {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 12px 14px;
  border-right: 1px solid var(--tx-line);
  background: #fafafa;
}

.rail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0 4px;
}

.rail-label,
.tile-tag {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tx-muted);
}

.rail-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.count-chip {
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--tx-accent-soft);
  color: var(--tx-accent);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rail-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.rail-actions .btn-ghost-block:last-child {
  grid-column: 1 / -1;
}

.btn-ghost-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
  color: var(--tx-ink);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.btn-ghost-block.primary {
  border-color: #c7d7fe;
  background: var(--tx-accent-soft);
  color: var(--tx-accent);
  font-weight: 600;
}

.btn-ghost-block:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
}

.btn-ghost-block.primary:hover {
  border-color: #9db7fa;
}

.rail-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rail-item {
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.rail-item:hover {
  background: rgba(255, 255, 255, 0.8);
}

.rail-item.active {
  background: var(--tx-accent-soft);
  border-color: #c7d7fe;
  box-shadow: 0 1px 0 rgba(51, 112, 255, 0.06);
}

.rail-item.active .rail-item-name {
  color: #245bdb;
}

.rail-open {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 56px 10px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}

.rail-rename {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
}

.rail-rename-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #c7d7fe;
  border-radius: 8px;
  background: #fff;
  color: var(--tx-ink);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
}

.rail-rename-hint {
  color: var(--tx-muted);
  font-size: 10px;
  line-height: 1.3;
}

.rail-item-name {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--tx-ink);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-item.processing,
.rail-item.queued {
  gap: 7px;
  padding: 10px;
  border-color: #c7d7fe;
  background: var(--tx-surface);
}

.rail-item.processing-transcribe {
  border-color: #c7d7fe;
}

.rail-item.processing-transcribe strong {
  color: var(--tx-accent);
}

.rail-item.processing-minutes {
  border-color: #fcd34d;
  background: #fffbeb;
}

.rail-item.processing-minutes strong {
  color: #d97706;
}

.rail-item.queued {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.rail-item.queued strong {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}

.rail-item-line {
  min-width: 0;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.rail-item-line strong {
  flex-shrink: 0;
  color: var(--tx-accent);
  font: 600 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-variant-numeric: tabular-nums;
}

.rail-item-message {
  overflow: hidden;
  color: var(--tx-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-progress {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.rail-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--tx-accent), #0ea5e9);
  transition: width 0.25s ease, background 0.2s ease;
}

.processing-minutes .rail-progress span {
  background: linear-gradient(90deg, #d97706, #f59e0b);
}

.rail-cancel {
  align-self: flex-end;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--tx-danger);
  font-size: 10px;
  cursor: pointer;
}

.rail-cancel:disabled {
  opacity: 0.4;
  cursor: wait;
}

.rail-item-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  overflow: hidden;
  color: var(--tx-muted);
  font-size: 10px;
  white-space: nowrap;
}

.stage-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94a3b8;
}

.stage-dot.completed,
.stage-dot.ready {
  background: var(--tx-accent);
}

.stage-dot.error {
  background: var(--tx-danger);
}

.stage-dot.transcribing,
.stage-dot.converting,
.stage-dot.loading-model {
  background: #3370ff;
  box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.15);
}

.stage-dot.summarizing {
  background: #d97706;
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.18);
}

.rail-item-actions {
  position: absolute;
  top: 6px;
  right: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 2px 2px 10px;
  border-radius: 8px;
  background: linear-gradient(90deg, transparent, #fafafa 36%);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.rail-item:hover .rail-item-actions,
.rail-item.active .rail-item-actions {
  opacity: 1;
  pointer-events: auto;
}

.rail-item.active .rail-item-actions {
  background: linear-gradient(90deg, transparent, var(--tx-accent-soft) 36%);
}

.rail-item:hover:not(.active) .rail-item-actions {
  background: linear-gradient(90deg, transparent, #fff 36%);
}

.rail-action {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-muted);
  cursor: pointer;
}

.rail-action:hover {
  background: var(--tx-accent-soft);
  color: var(--tx-accent);
}

.rail-action.danger:hover {
  background: #fff1f2;
  color: var(--tx-danger);
}

.rail-empty {
  padding: 28px 8px;
  text-align: center;
  color: var(--tx-muted);
  font-size: 11px;
}

/* —— 主区 —— */
.tx-main {
  min-width: 0;
  flex: 1;
  overflow-y: auto;
  padding: 20px clamp(20px, 3vw, 36px) 32px;
}

.tx-main.list-mode {
  padding-inline: clamp(24px, 4vw, 52px);
}

/* 详情态：右侧整体不滚，仅双栏内容区内部滚动 */
.tx-main.detail-mode {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 16px;
}

.tx-main.detail-mode .tx-hero,
.tx-main.detail-mode .alert {
  flex: 0 0 auto;
  width: 100%;
  max-width: 1180px;
  align-self: center;
}

.tx-main.minutes-focus {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px clamp(16px, 2.5vw, 28px) 12px;
}

.tx-hero {
  max-width: 1180px;
  margin: 0 auto 18px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--tx-line);
}

.hero-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.tx-hero h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.35;
  white-space: nowrap;
  flex: none;
  height: auto;
  transform: none;
  font-stretch: normal;
}

.hero-desc {
  margin: 0;
  color: var(--tx-muted);
  font-size: 12px;
  line-height: 1.5;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 2px;
}

.setup-hint {
  margin: 10px 0 0;
  color: var(--tx-muted);
  font-size: 12px;
  text-align: center;
}

.file-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--tx-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 650;
}

.selected-files {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
}

.selected-files-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--tx-ink);
  font-size: 12px;
  font-weight: 600;
}

.selected-files ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.selected-files li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 7px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
}

.selected-files li span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-files li button {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.selected-files li button:hover {
  background: #fee2e2;
  color: var(--tx-danger);
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 6px;
  border: 1px solid var(--tx-line);
  background: var(--tx-surface);
  color: var(--tx-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.pill.ok {
  border-color: #c7d7fe;
  background: var(--tx-accent-soft);
  color: #245bdb;
}

.alert {
  max-width: 1180px;
  margin: 0 auto 18px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #fecdd3;
  background: #fff1f2;
  color: #9f1239;
  font-size: 12px;
}

.alert button {
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.setup,
.result,
.record-list-page {
  max-width: 1180px;
  margin: 0 auto;
}

.tx-main.detail-mode .result {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.tx-main.detail-mode .result-head,
.tx-main.detail-mode .media-player,
.tx-main.detail-mode .regen-banner {
  flex-shrink: 0;
}

.tx-main.detail-mode .result-grid {
  flex: 1;
  min-height: 0;
  height: auto;
  align-items: stretch;
}

.tx-main.detail-mode .panel {
  min-height: 0;
  height: 100%;
  max-height: 100%;
}

.tx-main.detail-mode .panel-minutes {
  min-height: 0;
}

.tx-main.detail-mode .minutes-scroll,
.tx-main.detail-mode .minutes-body,
.tx-main.detail-mode .editor,
.tx-main.detail-mode .segments {
  min-height: 0;
}

.tx-main.detail-mode .editor {
  resize: none;
  overflow: auto;
}

.tx-main.detail-mode .segment-scroll {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.result.minutes-fullscreen {
  max-width: none;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.setup-mode-switch {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 3px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: #f3f4f6;
}

.setup-mode-switch button {
  min-width: 104px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
}

.setup-mode-switch button.active {
  background: #fff;
  color: var(--tx-ink);
  box-shadow: 0 1px 2px rgba(31, 35, 41, 0.08);
}

.setup-row {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 14px;
  margin-bottom: 14px;
}

.dictation-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 20px;
  border: 1px solid var(--tx-line);
  border-radius: 14px;
  background: var(--tx-surface);
}

.dictation-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--tx-muted);
  font-size: 12px;
  font-weight: 600;
}

.dictation-field.grow {
  min-height: 0;
}

.dictation-field input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--tx-line);
  border-radius: 8px;
  background: #fff;
  color: var(--tx-ink);
  font-size: 13px;
  font-weight: 500;
  outline: none;
}

.dictation-field input:focus,
.dictation-textarea:focus {
  border-color: #9db7fa;
  box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
}

.dictation-textarea {
  width: 100%;
  min-height: 280px;
  padding: 12px 14px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  resize: vertical;
  outline: none;
  background: #fff;
  color: var(--tx-ink);
  font: 13px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

.tile {
  position: relative;
  min-height: 156px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
}

.tile:hover {
  border-color: #b8c0cc;
  box-shadow: 0 3px 10px rgba(31, 35, 41, 0.05);
}

.tile:disabled,
.drop-tile.disabled {
  opacity: 0.62;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.tile-top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.status-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
}

.status-led.on {
  background: var(--tx-accent);
  box-shadow: 0 0 0 3px var(--tx-accent-soft);
}

.tile h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.tile-path {
  margin: 10px 0 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--tx-muted);
  font-size: 11px;
  line-height: 1.55;
  text-overflow: ellipsis;
}

.tile-action {
  margin-top: auto;
  padding-top: 16px;
  color: var(--tx-accent);
  font-size: 12px;
  font-weight: 600;
}

.drop-tile.dragging,
.drop-tile.filled {
  border-color: #9db7fa;
  background: #f7f9ff;
}

.drop-ring {
  position: absolute;
  inset: 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  pointer-events: none;
  transition: border-color 0.18s;
}

.drop-tile.dragging .drop-ring,
.drop-tile.filled .drop-ring {
  border-color: #9db7fa;
}

.model-tile,
.drop-tile {
  font: inherit;
  color: inherit;
}

.btn-primary {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-deep);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.btn-primary:hover:not(:disabled) {
  background: #30343b;
}

.btn-primary:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

.btn-primary.solid {
  background: var(--tx-accent);
  color: #fff;
  border: 0;
}

.btn-secondary {
  padding: 6px 10px;
  border: 1px solid var(--tx-line);
  border-radius: 6px;
  background: var(--tx-surface);
  color: var(--tx-ink);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary:hover {
  border-color: #cbd5e1;
}

.btn-secondary:disabled,
.btn-text:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-text {
  border: 0;
  background: none;
  color: var(--tx-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-text.danger {
  color: var(--tx-danger);
  margin-top: 4px;
}

/* —— 完整列表 —— */
.list-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.list-toolbar h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.list-toolbar p:last-child {
  margin: 8px 0 0;
  color: var(--tx-muted);
  font-size: 12px;
}

.btn-primary.compact,
.btn-secondary.compact {
  width: auto;
  flex-shrink: 0;
  padding: 8px 13px;
  font-size: 12px;
}

.list-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.search-box {
  width: min(360px, 46%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
  color: #94a3b8;
}

.search-box:focus-within {
  border-color: #9db7fa;
  box-shadow: 0 0 0 3px var(--tx-accent-soft);
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--tx-ink);
  font: 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

.filter-group {
  display: flex;
  padding: 3px;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.65);
}

.filter-group button {
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-muted);
  font-size: 11px;
  cursor: pointer;
}

.filter-group button.active {
  background: var(--tx-surface);
  color: var(--tx-ink);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.record-table-wrap {
  overflow: hidden;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
  box-shadow: 0 1px 2px rgba(31, 35, 41, 0.03);
}

.record-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.record-table th {
  padding: 11px 14px;
  border-bottom: 1px solid var(--tx-line);
  background: #f8fafc;
  color: var(--tx-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-align: left;
}

.record-table th:first-child {
  width: 34%;
}

.record-table th:nth-child(2) {
  width: 14%;
}

.record-table th:last-child {
  width: 64px;
}

.record-table td {
  padding: 13px 14px;
  border-bottom: 1px solid #f1f5f9;
  color: #475569;
  font-size: 11px;
}

.record-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

.record-table tbody tr:last-child td {
  border-bottom: 0;
}

.record-table tbody tr:hover {
  background: #f8fafc;
}

.file-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-cell > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-cell strong {
  overflow: hidden;
  color: var(--tx-ink);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-cell small {
  color: #94a3b8;
  font-size: 10px;
}

.status-badge {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
}

.status-badge.queued,
.status-badge.idle,
.status-badge.converting,
.status-badge.loading-model,
.status-badge.transcribing {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-badge.summarizing {
  background: #fffbeb;
  color: #b45309;
}

.status-badge.queued {
  background: #f1f5f9;
  color: #475569;
}

.status-badge.completed,
.status-badge.ready {
  background: var(--tx-accent-soft);
  color: #245bdb;
}

.status-badge.error,
.status-badge.cancelled {
  background: #fff1f2;
  color: #be123c;
}

.list-progress {
  width: 88px;
  height: 3px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.list-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--tx-accent), #0ea5e9);
  transition: width 0.25s ease, background 0.2s ease;
}

.list-progress.minutes span {
  background: linear-gradient(90deg, #d97706, #f59e0b);
}

.table-delete {
  border: 0;
  background: none;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
}

.table-delete:hover:not(:disabled) {
  color: var(--tx-danger);
}

.table-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.list-empty {
  min-height: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: var(--tx-surface);
  text-align: center;
}

.list-empty.filtered {
  min-height: 240px;
}

.empty-mark {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  border: 1px solid #c7d7fe;
  border-radius: 10px;
  background: var(--tx-accent-soft);
  color: var(--tx-accent);
}

.list-empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
}

.list-empty h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.list-empty p {
  margin: 8px 0 18px;
  color: var(--tx-muted);
  font-size: 12px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

/* —— 结果 —— */
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.detail-label {
  margin: 0 0 3px;
  color: var(--tx-muted);
  font-size: 11px;
}

.result-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.result-meta {
  margin: 5px 0 0;
  color: var(--tx-muted);
  font-size: 12px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.media-player {
  margin-bottom: 12px;
  padding: 14px 16px 12px;
  border: 1px solid var(--tx-line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(31, 35, 41, 0.04);
}

.media-player audio {
  display: none;
}

.waveform {
  position: relative;
  width: 100%;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 1.5px;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: #f5f7fb;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.waveform span {
  min-width: 1px;
  flex: 1;
  border-radius: 999px;
  background: #d5dbe7;
  pointer-events: none;
}

.waveform span.played {
  background: #3b82f6;
}

.playhead {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 2px;
  margin-left: -1px;
  border-radius: 2px;
  background: #111827;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.player-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
}

.player-left,
.player-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-icon {
  min-width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #667085;
  cursor: pointer;
}

.player-icon:hover {
  background: #eef2f7;
  color: var(--tx-ink);
}

.player-icon.primary {
  color: #2563eb;
  background: #eff6ff;
}

.player-icon.skip {
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
}

.skip-label {
  font-variant-numeric: tabular-nums;
}

.player-time {
  margin-left: 4px;
  color: #6b7280;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.volume-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6b7280;
  font-size: 11px;
}

.volume-control input[type='range'] {
  width: 88px;
  accent-color: #3b82f6;
}

.player-right select {
  height: 30px;
  padding: 0 24px 0 10px;
  border: 1px solid var(--tx-line);
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #374151;
  font-size: 12px;
}

.audio-error {
  color: var(--tx-danger);
  font-size: 10px;
}

.regen-banner {
  max-width: 1180px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
}

.result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr);
  gap: 12px;
  align-items: stretch;
}

.result-grid.minutes-expanded {
  grid-template-columns: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  height: 100%;
}

.result.minutes-fullscreen .panel-minutes {
  min-height: 0;
  height: 100%;
}

.result.minutes-fullscreen .minutes-scroll,
.result.minutes-fullscreen .minutes-body {
  min-height: 0;
}

.minutes-revise-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--tx-line);
  background: #fafafa;
}

.revise-quotes {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.revise-quotes-label {
  flex-shrink: 0;
  margin-top: 4px;
  color: var(--tx-muted);
  font-size: 11px;
  font-weight: 600;
}

.revise-quote-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.revise-quote-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 3px 6px 3px 8px;
  border: 1px solid #dbe4ff;
  border-radius: 999px;
  background: #eef3ff;
  color: #245bdb;
  font-size: 11px;
  line-height: 1.35;
}

.revise-quote-chip em {
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revise-quote-chip button {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.revise-quote-chip button:hover {
  background: rgba(36, 91, 219, 0.12);
  color: #1d4ed8;
}

.revise-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.minutes-revise-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--tx-line);
  border-radius: 8px;
  background: #fff;
  color: var(--tx-ink);
  font-size: 13px;
  outline: none;
}

.minutes-revise-input:focus {
  border-color: #9db7fa;
  box-shadow: 0 0 0 3px rgba(51, 112, 255, 0.12);
}

.minutes-revise-input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.minutes-selection-menu {
  position: fixed;
  z-index: 4200;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--tx-line);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.minutes-selection-menu button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.minutes-selection-menu button:hover {
  background: #f3f4f6;
}

.minutes-selection-menu button.primary {
  color: var(--tx-accent);
}

.minutes-selection-menu button.primary:hover {
  background: var(--tx-accent-soft);
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--tx-line);
  border-radius: 6px;
  background: #fff;
  color: #505762;
  font-size: 12px;
  cursor: pointer;
}

.btn-icon:hover,
.btn-icon[aria-pressed='true'] {
  border-color: #c7d7fe;
  background: var(--tx-accent-soft);
  color: var(--tx-accent);
}

.panel {
  min-height: 560px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--tx-line);
  border-radius: 10px;
  background: var(--tx-surface);
  overflow: hidden;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 42px;
  padding: 0 14px;
  border-bottom: 1px solid var(--tx-line);
  background: #fafafa;
}

.panel-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.panel-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.save-state {
  color: var(--tx-muted);
  font-size: 10px;
}

.editor {
  width: 100%;
  min-height: 400px;
  flex: 1;
  padding: 14px 16px;
  resize: vertical;
  border: 0;
  border-radius: 0;
  outline: none;
  background: var(--tx-surface);
  color: var(--tx-ink);
  font: 13px/1.75 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  transition: border-color 0.15s, background 0.15s;
}

.editor:focus {
  box-shadow: inset 0 0 0 1px #9db7fa;
}

.segments {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 10px 14px 12px;
  color: var(--tx-muted);
  font-size: 11px;
}

.segments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  color: var(--tx-ink);
}

.segments-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 10px;
  font-weight: 600;
}

.segments-live::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.45);
  animation: live-pulse 1.4s ease-out infinite;
}

@keyframes live-pulse {
  70% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
  100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
}

.segment-scroll {
  flex: 1;
  min-height: 180px;
  max-height: min(48vh, 420px);
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 2px;
  scroll-behavior: smooth;
}

.segment {
  width: 100%;
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 10px;
  padding: 8px 10px;
  margin: 0;
  border: 0;
  border-radius: 8px;
  border-left: 2px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.segment:hover {
  background: #f8fafc;
}

.segment.current {
  background: #eef2ff;
  border-left-color: #6366f1;
}

.segment.current time {
  color: #4f46e5;
  font-weight: 600;
}

.segment.current p {
  color: #1e1b4b;
}

.segment time {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.transcript-edit {
  margin: 0;
  padding: 8px 14px 12px;
  border-top: 1px solid var(--tx-line);
  color: var(--tx-muted);
  font-size: 11px;
}

.transcript-edit summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--tx-ink);
}

.editor-compact {
  margin-top: 8px;
  min-height: 120px;
  max-height: 200px;
}

.segment p {
  margin: 0;
  color: #334155;
  line-height: 1.55;
}

.panel-minutes {
  position: relative;
  min-height: 620px;
  background: var(--tx-surface);
  color: var(--tx-ink);
}

/* 滚动放在外层，避免 contenteditable + overflow 吃掉顶部 padding */
.minutes-scroll {
  flex: 1;
  min-height: 420px;
  overflow: auto;
}

.minutes-body {
  margin: 0;
  padding: 18px 20px 28px;
  min-height: 100%;
  box-sizing: border-box;
  color: #3f4753;
  font: 14px/1.8 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  word-break: break-word;
}

.rich-editor :deep(mark.polish-mark) {
  background: #c7d7fe;
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.rich-editor {
  outline: 0;
  cursor: text;
  transition: box-shadow 0.15s, background 0.15s;
}

.rich-editor.focused {
  box-shadow: inset 0 0 0 1px #9db7fa;
  background: #fff;
}

.rich-editor.locked {
  cursor: not-allowed;
  opacity: 0.72;
}

.minutes-format-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tx-line);
  background: #fafafa;
}

.minutes-format-bar button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #505762;
  font-size: 12px;
  cursor: pointer;
}

.minutes-format-bar button:hover {
  background: #eef2f7;
  color: var(--tx-ink);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1.1em 0 0.45em;
  color: var(--tx-ink);
  font-weight: 600;
  line-height: 1.35;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--tx-line);
  font-size: 18px;
}

.markdown-body :deep(h2) {
  font-size: 15px;
}

.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-size: 13px;
}

.markdown-body :deep(p) {
  margin: 0.5em 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.markdown-body :deep(li) {
  margin: 0.25em 0;
}

.markdown-body :deep(strong) {
  color: var(--tx-ink);
  font-weight: 600;
}

.markdown-body :deep(blockquote) {
  margin: 10px 0;
  padding: 7px 10px;
  border-left: 3px solid #9db7fa;
  background: #f6f8fc;
  color: #5f6672;
}

.markdown-body :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: #f1f3f5;
  font: 0.92em 'SF Mono', Menlo, Monaco, Consolas, monospace;
}

.markdown-body :deep(hr) {
  margin: 14px 0;
  border: 0;
  border-top: 1px solid var(--tx-line);
}

.markdown-body :deep(a) {
  color: var(--tx-accent);
  text-decoration: none;
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 10px 0 14px;
  border-collapse: collapse;
  border: 1px solid #dbe3f0;
  border-radius: 8px;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.5;
  background: #fff;
}

.markdown-body :deep(thead) {
  background: #f3f6fb;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 9px 12px;
  border: 1px solid #e5ebf5;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.markdown-body :deep(th) {
  color: #334155;
  font-weight: 650;
  white-space: nowrap;
  background: #f3f6fb;
}

.markdown-body :deep(tbody tr:nth-child(even)) {
  background: #fafbfd;
}

.markdown-body :deep(tbody tr:hover) {
  background: #f0f5ff;
}

.markdown-body :deep(td:nth-child(2)),
.markdown-body :deep(td:nth-child(3)),
.markdown-body :deep(td:nth-child(4)),
.markdown-body :deep(th:nth-child(2)),
.markdown-body :deep(th:nth-child(3)),
.markdown-body :deep(th:nth-child(4)) {
  white-space: nowrap;
}

.minutes-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.orbit {
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 10px;
  border: 1px solid #c7d7fe;
  background: var(--tx-accent-soft);
  display: grid;
  place-items: center;
}

.orbit span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tx-accent);
  box-shadow: 0 0 0 5px rgba(51, 112, 255, 0.12);
}

.minutes-empty h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-ink);
}

.minutes-empty p {
  margin: 0 0 8px;
  max-width: 260px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1000px) {
  .tx-rail {
    width: 210px;
  }
  .result-grid,
  .setup-row {
    grid-template-columns: 1fr;
  }
  .volume-control input[type='range'] {
    width: 64px;
  }
  .record-table th:nth-child(3),
  .record-table td:nth-child(3),
  .record-table th:nth-child(4),
  .record-table td:nth-child(4) {
    display: none;
  }
}

@media (max-width: 760px) {
  .tx-rail {
    display: none;
  }
  .list-controls,
  .list-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .search-box {
    width: auto;
  }
  .filter-group {
    overflow-x: auto;
  }
  .record-table th:nth-child(5),
  .record-table td:nth-child(5) {
    display: none;
  }
}
</style>
