# CLAUDE.md

This file provides project guidance for Claude Code when working in `aithink-client/`.

## Required Reading

Before making code changes, read:

- `README.md` for human-facing setup, run commands, and feature overview.
- `AI_README.md` for architecture, data flow, IPC/HTTP contracts, feature status, and file-location guidance.
- `docs/` for topic-specific documentation:
  - `docs/DEVELOPMENT.md`
  - `docs/FEATURE_REQUIREMENTS.md`
  - `docs/ASR_IMPLEMENTATION_SUMMARY.md`
  - `docs/ASR_USAGE_GUIDE.md`

If the task involves browser extension sync, PRD2Spec, browser side panel, Feishu/design extraction, or browsing footprint recording, also inspect the relevant files under `plugins/prd2spec/`, especially `plugins/prd2spec/extension/`.

## Documentation Sync Rule

When changing product behavior or engineering structure, check whether both docs need updates:

- `README.md` is the human-facing quick start and feature overview.
- `AI_README.md` is the AI/developer-facing code map and implementation guide.

Update both files when a change affects:

- architecture or process boundaries
- run/build/package commands
- dependencies or toolchain
- configuration or model/provider behavior
- data storage
- IPC channels
- local HTTP APIs
- feature completion status
- `plugins/prd2spec/` integration

Do not update only one document if the same fact appears in both. If a topic document under `docs/` covers the same area, update that file too.

## Current Project Boundaries

- `aithink-client/` is the main Electron + Vue 3 desktop app.
- `plugins/prd2spec/extension/` is the browser extension that syncs sessions and browsing footprints back to the desktop app.
- Other sibling directories are outside this project's normal implementation scope unless the user explicitly asks about them.

## Implementation Notes

- Renderer code should use the preload bridge and IPC; do not call Node/Electron/Agent SDK directly from Vue components.
- New desktop backend capabilities usually need shared types, an Electron controller/service, registration in `electron/main.ts`, and a frontend store/composable.
- The current data store is JSON via `electron/service/database.ts`, not SQLite.
- ASR handlers are registered (`registerASRHandlers()` in `electron/main.ts`) and the code/UI remain, but the sherpa-onnx streaming model (`resources/models/zh-streaming/`) and the `sherpa-onnx-node` dependency were REMOVED (poor accuracy). `asr-service.ts` lazy-loads sherpa via `loadSherpa()`, so the app still boots; ASR only throws when actually invoked. `electron/types/sherpa-onnx-node.d.ts` is kept so tsc still compiles. To re-enable ASR: `npm i sherpa-onnx-node` + provide a model, or wire a different engine (e.g. Whisper — `ggml-large-v3-turbo.bin` sits in `aithink/models/`).
