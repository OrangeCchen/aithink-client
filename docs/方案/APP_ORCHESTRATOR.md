# 本机 App 调度台方案（Orchestrator）

> **版本**: v0.3  
> **日期**: 2026-08-05  
> **状态**: ✅ P0 体检完成,准备启动 P1  
> **优先级**: **高 — 先执行**(主界面优先,内部改造后置)  
> **近期目标 App**: QoderWork.app / QwenWorkCN.app / WorkBuddy.app（均已装在本机）  
> **长期目标**: 任意已授权 App（对标 Codex `@Computer`）  
> **对照调研**: [`codex调研报告.md`](./codex调研报告.md)

## 与 Sidecar 方案的关系

本方案与 [`SIDECAR_MIGRATION.md`](./SIDECAR_MIGRATION.md)/[`PHASE1_CHECKLIST.md`](./PHASE1_CHECKLIST.md) 是**两条不同方向的路**:

- **本方案(调度台)**:调度**外部已装 App**,做统一指挥台。不造 agent,用别人的（后期执行面可扩到任意 App）。
- **Sidecar 方案**:把**自家 agent 逻辑**迁到 Python 独立进程。自己造 agent。

**当前策略(2026-08-04 确认)**:**分先后执行,主界面优先**。

1. **先做本方案(调度台)**:P1 搭主界面(任务列表 UI + 任务模型 + 后台异步),用现有 `agent-sdk.ts` 或 mock 数据跑通流程,验证产品形态。
2. **后做 Sidecar 迁移**:等调度台跑起来、价值验证后,再决定要不要把内部 agent 换成 Python Sidecar。

两者不冲突在价值上,但架构/技术栈完全不同,当前**不混合**,按顺序推进。

## 0. 一句话定位

做一个**本机编排控制台**：把任务「派」给本机执行面，统一管理并发、状态与结果汇总。用户看到的是「任务列表 + 后台异步执行」的指挥台。

- **短期**：执行面 = 已装且已登录的 Agent 产品（QoderWork / QwenWorkCN / WorkBuddy）；不重复造 agent，用别人的。
- **长期**：执行面扩到**任意已授权 App**（Computer Use 同款兜底）；编排层不变，适配器从「特化」扩到「通用」。

与 Codex 桌面控制台同构：Codex 调 `@Browser` / `@Computer` / 插件，就是一次「派」；细节见 [`codex调研报告.md`](./codex调研报告.md) §7。

---

## 1. 决定性前提：这三个 App 没有 CLI/API，只能驱动 GUI

已确认的硬事实（本机探测）：

- `codex` CLI **未安装**（`which codex` → not found）。
- 三个近期目标都是 **macOS 桌面 App**：`QoderWork.app`、`QwenWorkCN.app`、`WorkBuddy.app`。
- 因此近期「控制它们」= **GUI 自动化**，不是调 API。这是 P2～P3 的骨架约束。
- 长期任意 App 仍可能无 API → 同一套 `AppAdapter`，驱动档位下沉到 AX / 视觉（见 §2、§5）。

「用户自己登录账号」这一点**只解决了凭证/成本问题**（我们不碰任何密钥，用户用自己的号和额度），但**不改变**下面三个本质难点：界面脆性、完成检测、结果抽取。

---

## 2. 驱动档位：从特化 Agent 到任意 App

能否稳定驱动，取决于每个 App 的实现方式。分三档，难度天差地别：

| 若是… | 驱动方式 | 稳定性 | 说明 |
|---|---|---|---|
| **Electron / 网页壳** | 远程调试端口 + CDP（像操作网页一样） | 高 | 基于 DOM，精确读控件/填输入/抓结果。最好情况 |
| **原生 App** | macOS 辅助功能 API（Accessibility 控件树 + 发点击） | 中 | 读得到控件就行，读不到要降级 |
| **啥都读不到** | 截图 + 视觉模型认屏 + 模拟鼠标键盘 | 低 | 万能但最脆，纯靠像素 |

分层原则（对齐 Codex）：**有结构化通道（API / 插件 / CDP）就优先；Computer Use 式视觉操控只做降级。**

### 2.1 P0 体检结论（2026-08-04，只读探测）

| App | BundleID | 版本 | 技术栈 | 落档 |
|---|---|---|---|---|
| QoderWork | `com.qoder.work` | 0.0.26 | **Electron**（有 `Electron Framework.framework` + `app.asar`） | **CDP 档（最优）** |
| QwenWorkCN | `cn.qwenwork.desktop.mac` | 0.1.4 | **Electron**（同上，含 `Updater`） | **CDP 档（最优）** |
| WorkBuddy | `com.workbuddy.workbuddy` | 5.2.6 | **Electron**（Exec 名即 `Electron`，含 `WorkBuddy Repair.app`） | **CDP 档（最优）** |

**结论**：三者全是 Electron，均落在最高稳定性的 CDP 档。可用 Chrome DevTools Protocol 基于 DOM 精确驱动（读控件/填输入/抓结果/判完成），P2～P3 **无需**退化到辅助功能或截图认像素。

**P0 收尾 — CDP 连通性验证（2026-08-04，实际启动测试）**：

| App | 启动命令 | 调试端口行为 | HTTP `/json/version` | 结论 |
|---|---|---|---|---|
| QoderWork | `QoderWork --remote-debugging-port=9222` | 遵守参数,监听 `127.0.0.1:9222` | ✅ 可达 | **CDP 完全可用** |
| WorkBuddy | `Electron --remote-debugging-port=9224` | 遵守参数,监听 `127.0.0.1:9224` | ✅ 可达 | **CDP 完全可用** |
| QwenWorkCN | `QwenWorkCN --remote-debugging-port=9223` | **忽略参数**,自选动态端口(实测 `50413`) | ✅ 可达(需从日志解析实际端口) | **CDP 可用,需额外解析步骤** |

三者均可通过 CDP 驱动,**P0 体检通过**。QwenWorkCN 需要从启动日志的 `DevTools listening on ws://127.0.0.1:<port>/...` 行提取实际端口号。

**重要发现**：正常启动(不带 `--remote-debugging-port`)时,三个 App 默认**不开**调试端口。调度台需要用 `child_process.spawn` 显式加该参数重启目标 App,才能获得 CDP 控制权。这意味着:**用户正常打开的 App 实例不可控,调度台必须启动自己的实例**。

---

## 3. 目标架构：编排台 + 执行面适配器

编排层只认统一接口；执行面从「几家 Agent」扩到「任意 App」时，**换的是适配器，不是调度台**。

```
┌─────────────────────────────────────────────┐
│   编排台  (复用现有 Electron)                     │
│   任务列表 · 派发 · 状态机 · 结果汇总 · PiP 监督   │
└─────────────────────┬───────────────────────┘
                      │  AppAdapter
                      │  dispatch / poll / getResult
     ┌────────────────┼────────────────┬────────────────┐
     ▼                ▼                ▼                ▼
 [QoderWork]    [QwenWorkCN]     [WorkBuddy]     [任意 App]
  CDP 特化         CDP 特化         CDP 特化      CDP / AX / 视觉
     └──────── 近期 P2～P3 ────────┘              └─ 长期 P4～P5 ─┘
```

与 Codex 的映射（工具 = 派）：

```
Codex:     Agent 编排  ──派──►  @Computer / @Browser / Add-in
AIThink:   调度台编排  ──派──►  特化 Agent App  →  后期任意 App
```

- **调度台**：干净、稳定、一次写好。任务模型（排队/运行/完成/失败）、后台并发、任务列表 UI、结果汇总、可观测性（PiP / 魔法箭头）。
- **适配器**：每执行面一个（或一族），脏活、易碎、单独维护。只实现——派任务 / 查状态 / 取结果。
- **不需要 Python Sidecar**：CDP（puppeteer-core）、AppleScript/辅助功能、截图，Node 全能干，直接建在现有 Electron 栈上。Python 只有在将来要 LangGraph 或上云时才考虑。

---

## 4. 适配器统一接口（草案）

调度台只认这一个抽象，接一个新执行面 = 实现一个它：

```ts
interface AppAdapter {
  readonly appId: string;              // 'qoderwork' | 'qwenworkcn' | 'workbuddy' | 后续任意
  readonly driver: 'cdp' | 'a11y' | 'vision';

  ensureReady(): Promise<void>;        // App 已启动 / 已登录 / 可驱动
  dispatch(task: TaskInput): Promise<DispatchHandle>;  // 派任务（填框+提交 / 通用动作序列）
  poll(handle: DispatchHandle): Promise<TaskState>;    // 查状态（轮询完成检测）
  getResult(handle: DispatchHandle): Promise<TaskResult>; // 完成后抽取结果
  cancel?(handle: DispatchHandle): Promise<void>;
}
```

- `dispatch` 在特化 Agent 上最容易（填框、点按钮）；在任意 App 上可能是一串 GUI 动作。
- **`poll` / `getResult` 是硬骨头**，是每个适配器真正的工作量与验收核心：
  - **完成检测**：App 无回调，只能轮询——盯某 DOM 元素出现 / 截图比对「停止转圈」。每个 App 信号都不同。
  - **结果抽取**：结果在界面哪一块，从非结构化 UI 里捞出来。

---

## 5. 分期路线（顺序关键）

「统一调度台」的价值要等接了 2～3 个执行面才显现；但每个封闭 App 的驱动都是硬仗。先追「统一」会在抽象上空转。正确顺序：先啃通一个特化 Agent，再扩执行面，最后才上通用 Computer Use。

| 阶段 | 内容 | 执行面 | 产出/验收 |
|---|---|---|---|
| **P0 · 体检** | 探测技术档位、调试端口 | 三家 Agent | ✅ 均 CDP 可用 |
| **P1 · 调度台骨架** | 任务模型 + 后台并发 + 任务列表 UI | **无关**（编排地基） | 排队/并发/状态可见 |
| **P2 · 第一个闭环** | 派任务→检测完成→抓结果 | 单个 Agent（CDP） | 一家真正闭环 |
| **P3 · 接第 2～3 家** | 检验 `AppAdapter` 抽象 | 多家特化 Agent | 抽象稳定或据此重构 |
| **P4 · 任意 Electron** | 通用 CDP / 调试端口驱动 | 扩大执行面 | 不限那三家 |
| **P5 · 任意原生 App** | AX + 截图 + 独立光标（对标 `@Computer`） | 通用 GUI 兜底 | 无 CDP 也能控 |
| **贯穿** | 授权向导、PiP、魔法箭头、暂停/接管 | 可观测性 | 不绑死某一档 |

P4 / P5 与「从 QoderWork 抠结果」**不要绑在同一 milestone**；任意 App 单独立项。详解与实现分档见调研报告 §7.3～§7.4。

---

## 6. 可观测性：PiP 与魔法箭头

后台异步 ≠ 无监督。对齐 Codex Computer Use 的产品配套（不是浏览器 Annotation）：

| 部件 | 作用 |
|---|---|
| **PiP / 运行预览** | 实时或近实时展示正在被驱动的 App；可拖动、切换多任务、暂停/接管 |
| **魔法箭头** | **独立于用户鼠标**的可视化代理光标：动作前游到点击点，让人看懂 Agent 点了哪里 |

**实现分档**（与驱动档位解耦，可视化壳可先做）：

- **档 A（MVP，可挂在 P2 CDP 上）**：CDP 真操作 + PiP screencast/截图流 + overlay 假箭头动画（贝塞尔轨迹、朝向运动方向）。坐标需做 PiP 缩放仿射变换；喂模型的截图排除 overlay。
- **档 B（P5）**：系统级独立光标（Screen Recording + Accessibility；macOS 宜进程定向事件、不抢全局指针）+ 全屏透明 overlay + PiP。通常需原生 helper。

「始终隐藏画中画」类开关可后期加：降打扰也降可观测性，默认建议开启监督。

---

## 7. 前置条件（绕不开）

1. **近期（CDP 特化 Agent）**：调度台用带 `--remote-debugging-port` 的方式启动目标实例；用户需已在该实例登录。
2. **长期（任意 App / PiP 截屏）**：macOS **屏幕录制** + **辅助功能**；首次在「系统设置 → 隐私与安全性」授权；逐 App「Always allow」与敏感动作确认（产品能力，不只是技术）。
3. **`ensureReady()`**：未就绪（未登录 / 无权限 / 端口不可达）时应停在任务上并提示用户，而非盲目操作。

---

## 8. 风险与对策

| 风险 | 性质 | 对策 |
|---|---|---|
| **界面脆性** | 物理属性：依赖对方 UI 布局，对方改版即失效 | 驱动层做薄、隔离在各自适配器里；调度台不受影响 |
| **完成检测/结果抽取不可靠** | 无回调，靠轮询与 UI 解析 | 每个适配器把 `poll`/`getResult` 当核心验收项；失败报「无法判定」而非假成功 |
| **自动化操作已登录账号** | 部分产品条款敏感 | 本机桌面 App、用户自己的号，风险相对可控；仍需逐个确认条款，异常先停 |
| **权限被系统回收** | macOS 更新后授权可能失效 | 启动时校验权限，缺失则引导重新授权 |
| **过早追任意 App** | 通用 GUI 最脆，易拖垮节奏 | 先 P1～P3 特化闭环；P4/P5 单独立项；结构化通道优先于像素点击 |
| **同 App 并行 Computer Use** | 稳定性差 | 同执行面慎并行；编排层做互斥或排队 |

---

## 9. 当前状态与下一步

- [x] 方案定稿（本文档）
- [x] **P0 体检**：三个 App 全是 Electron,均可通过 CDP 驱动(最优档)
- [x] Codex Browser / Computer Use 调研与结论合并（[`codex调研报告.md`](./codex调研报告.md) v0.2）
- [ ] **P1 调度台骨架** ← 下一步
- [ ] P2 第一个 App 闭环
- [ ] （可选提前）运行面板 PiP + 假箭头可观测性
- [ ] P4 / P5 任意 App（单独立项）

**P0 总结**：技术档位已确定——三者全落 CDP 档。QwenWorkCN 需从日志解析动态端口,不影响可行性。

**P1 的核心交付**：任务模型(Task 状态机:queued/running/completed/failed)、后台并发管理(复用 `activeQueries` 思路)、任务列表 UI(左侧任务卡片+状态、右侧运行面板)。这一步**与具体 App 无关**,是调度台的永久地基——也是后期接任意 App 时仍然成立的地基。

---

## 附：与其他方案的关系

- 本方案与 [`SIDECAR_MIGRATION.md`](./SIDECAR_MIGRATION.md) 是**不同方向**：Sidecar 是把自家 agent 逻辑迁到 Python 独立进程；本方案是调度**外部执行面**，且明确**不需要 Python Sidecar**，直接建在现有 Electron + Node 栈上。
- 现有 `electron/service/agent-sdk.ts` 的 `activeQueries` 并发管理思路，可作为 P1 任务模型的起点。
- 与 Codex 桌面能力的对照、魔法箭头实现分档、长期任意 App 产品叙事，以 [`codex调研报告.md`](./codex调研报告.md) 为准；本文管调度台落地顺序与适配器约束。

---

**变更记录**

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-04 | v0.1 | 初版讨论稿 |
| 2026-08-04 | v0.2 | P0 体检完成（三 App 均 CDP） |
| 2026-08-05 | v0.3 | 同步调研结论：工具=派、短期特化 Agent → 长期任意 App；扩展 P4/P5；补充 PiP/魔法箭头可观测性与权限分层 |
