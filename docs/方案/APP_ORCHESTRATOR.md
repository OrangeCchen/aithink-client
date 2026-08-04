# 本机 App 调度台方案（Orchestrator）

> **版本**: v0.2  
> **日期**: 2026-08-04  
> **状态**: ✅ P0 体检完成,准备启动 P1  
> **优先级**: **高 — 先执行**(主界面优先,内部改造后置)  
> **目标 App**: QoderWork.app / QwenWorkCN.app / WorkBuddy.app（均已装在本机）

## 与 Sidecar 方案的关系

本方案与 [`SIDECAR_MIGRATION.md`](./SIDECAR_MIGRATION.md)/[`PHASE1_CHECKLIST.md`](./PHASE1_CHECKLIST.md) 是**两条不同方向的路**:

- **本方案(调度台)**:调度**外部已装 App**,做统一指挥台。不造 agent,用别人的。
- **Sidecar 方案**:把**自家 agent 逻辑**迁到 Python 独立进程。自己造 agent。

**当前策略(2026-08-04 确认)**:**分先后执行,主界面优先**。

1. **先做本方案(调度台)**:P1 搭主界面(任务列表 UI + 任务模型 + 后台异步),用现有 `agent-sdk.ts` 或 mock 数据跑通流程,验证产品形态。
2. **后做 Sidecar 迁移**:等调度台跑起来、价值验证后,再决定要不要把内部 agent 换成 Python Sidecar。

两者不冲突在价值上,但架构/技术栈完全不同,当前**不混合**,按顺序推进。

## 0. 一句话定位

不重复造 agent，而是做一个**本机调度台**：把任务派给电脑上已安装、用户已登录的桌面 App（QoderWork / QwenWorkCN / WorkBuddy），统一管理它们的并发、状态与结果汇总。用户看到的是一个"任务列表 + 后台异步执行"的指挥台。

---

## 1. 决定性前提：这三个 App 没有 CLity/API，只能驱动 GUI

已确认的硬事实（本机探测）：

- `codex` CLI **未安装**（`which codex` → not found）。
- 三个目标都是 **macOS 桌面 App**：`QoderWork.app`、`QwenWorkCN.app`、`WorkBuddy.app`。
- 因此"控制它们" = **GUI 自动化**，不是调 API。这是整份方案的骨架约束。

"用户自己登录账号"这一点**只解决了凭证/成本问题**（我们不碰任何密钥，用户用自己的号和额度），但**不改变**下面三个本质难点：界面脆性、完成检测、结果抽取。

---

## 2. 决定性未知：三个 App 各是什么技术栈

能否稳定驱动，取决于每个 App 的实现方式。分三档，难度天差地别：

| 若是… | 驱动方式 | 稳定性 | 说明 |
|---|---|---|---|
| **Electron / 网页壳** | 远程调试端口 + CDP（像操作网页一样） | 高 | 基于 DOM，精确读控件/填输入/抓结果。最好情况 |
| **原生 App** | macOS 辅助功能 API（Accessibility 控件树 + 发点击） | 中 | 读得到控件就行，读不到要降级 |
| **啥都读不到** | 截图 + 视觉模型认屏 + 模拟鼠标键盘 | 低 | 万能但最脆，纯靠像素 |

**QoderWork**（Qoder 系做 IDE，极可能 Electron）、**QwenWorkCN**、**WorkBuddy** 各落哪一档，目前是**猜**。方案第 0 步（P0 体检）就是把这三个"猜"变成"定"。

### 2.1 P0 体检结论（2026-08-04，只读探测）

| App | BundleID | 版本 | 技术栈 | 落档 |
|---|---|---|---|---|
| QoderWork | `com.qoder.work` | 0.0.26 | **Electron**（有 `Electron Framework.framework` + `app.asar`） | **CDP 档（最优）** |
| QwenWorkCN | `cn.qwenwork.desktop.mac` | 0.1.4 | **Electron**（同上，含 `Updater`） | **CDP 档（最优）** |
| WorkBuddy | `com.workbuddy.workbuddy` | 5.2.6 | **Electron**（Exec 名即 `Electron`，含 `WorkBuddy Repair.app`） | **CDP 档（最优）** |

**结论**：三者全是 Electron，均落在最高稳定性的 CDP 档。可用 Chrome DevTools Protocol 基于 DOM 精确驱动（读控件/填输入/抓结果/判完成），无需退化到辅助功能或截图认像素。第 2 节的"决定性未知"已消解。

**P0 收尾 — CDP 连通性验证（2026-08-04，实际启动测试）**：

| App | 启动命令 | 调试端口行为 | HTTP `/json/version` | 结论 |
|---|---|---|---|---|
| QoderWork | `QoderWork --remote-debugging-port=9222` | 遵守参数,监听 `127.0.0.1:9222` | ✅ 可达 | **CDP 完全可用** |
| WorkBuddy | `Electron --remote-debugging-port=9224` | 遵守参数,监听 `127.0.0.1:9224` | ✅ 可达 | **CDP 完全可用** |
| QwenWorkCN | `QwenWorkCN --remote-debugging-port=9223` | **忽略参数**,自选动态端口(实测 `50413`) | ✅ 可达(需从日志解析实际端口) | **CDP 可用,需额外解析步骤** |

三者均可通过 CDP 驱动,**P0 体检通过**。QwenWorkCN 需要从启动日志的 `DevTools listening on ws://127.0.0.1:<port>/...` 行提取实际端口号。

**重要发现**：正常启动(不带 `--remote-debugging-port`)时,三个 App 默认**不开**调试端口。调度台需要用 `child_process.spawn` 显式加该参数重启目标 App,才能获得 CDP 控制权。这意味着:**用户正常打开的 App 实例不可控,调度台必须启动自己的实例**。

---

## 3. 目标架构：调度台 + 每 App 一个适配器

三个 App 界面各不相同，**没有通用解**，唯一站得住的是**适配器模式**：

```
┌───────────────────────────────────┐
│   调度台  (复用现有 Electron)          │
│   任务列表 UI · 派发 · 状态机 · 结果汇总 │
└─────────────────┬─────────────────┘
                  │  统一接口
                  │  dispatch(task) / poll() / getResult()
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 [QoderWork   [QwenWorkCN   [WorkBuddy
  适配器]       适配器]        适配器]
      └── 底层驱动: CDP / 辅助功能 / 截图点击 ──┘
```

- **调度台**：干净、稳定、一次写好。任务模型（排队/运行/完成/失败）、后台并发、任务列表 UI、结果汇总。
- **适配器**：每 App 一个，脏活、易碎、单独维护。只实现三个动作——派任务 / 查状态 / 取结果。
- **不需要 Python Sidecar**：CDP（puppeteer-core）、AppleScript/辅助功能、截图，Node 全能干，直接建在现有 Electron 栈上。Python 只有在将来要 LangGraph 或上云时才考虑。

---

## 4. 适配器统一接口（草案）

调度台只认这一个抽象，接一个新 App = 实现一个它：

```ts
interface AppAdapter {
  readonly appId: string;              // 'qoderwork' | 'qwenworkcn' | 'workbuddy'
  readonly driver: 'cdp' | 'a11y' | 'vision';

  ensureReady(): Promise<void>;        // App 已启动 / 已登录 / 可驱动
  dispatch(task: TaskInput): Promise<DispatchHandle>;  // 派任务（填框+提交）
  poll(handle: DispatchHandle): Promise<TaskState>;    // 查状态（轮询完成检测）
  getResult(handle: DispatchHandle): Promise<TaskResult>; // 完成后抽取结果
  cancel?(handle: DispatchHandle): Promise<void>;
}
```

- `dispatch` 最容易（填框、点按钮）。
- **`poll` / `getResult` 是硬骨头**，是每个适配器真正的工作量与验收核心：
  - **完成检测**：App 无回调，只能轮询——盯某 DOM 元素出现 / 截图比对"停止转圈"。每个 App 信号都不同。
  - **结果抽取**：结果在界面哪一块，从非结构化 UI 里捞出来。

---

## 5. 分期路线（顺序关键：别一上来追"统一"）

"统一调度台"的价值要等接了 2~3 个 App 才显现；但每个封闭 App 的驱动都是硬仗。先追"统一"会在抽象上空转、一个都没真正跑通。正确顺序是反过来——先啃通一个，再用第二个检验抽象。

| 阶段 | 内容 | 与 App 相关性 | 产出/验收 |
|---|---|---|---|
| **P0 · 体检** | 探测三个 App 的技术档位（Electron/原生/纯像素）、能否开调试端口、辅助功能能读到多少 | 三个都测 | 每 App 一张"可行性 + 驱动方式"结论表；只读 `.app` 包，不启动、不改动、不联网 |
| **P1 · 调度台骨架** | 任务模型 + 后台异步并发 + 任务列表 UI | **无关**，永远有用 | 能把任务排队/并发跑起来，UI 显示状态；复用现有 Electron，不加新进程 |
| **P2 · 第一个闭环** | 挑体检结论**最易**的 App（大概率是 Electron 档），打通"派任务→检测完成→抓结果"全链路 | 单个 App | 一个 App 真正闭环。胜过三个半吊子 |
| **P3 · 接第二个** | 用第二个 App **检验适配器抽象是否正确**（一个 App 定义不出好抽象） | 单个 App | 抽象接口稳定下来，或据此重构 |
| **P4 · 接第三个** | 抽象成熟后复制流程 | 单个 App | 三个 App 全部纳入调度台 |

---

## 6. 前置条件（绕不开）

1. **系统授权**：调度台需要 macOS 的**辅助功能（Accessibility）**和**屏幕录制**权限（GUI 自动化 + 截图必需）。首次需用户在"系统设置 → 隐私与安全性"手动授权，是一次性步骤。
2. **App 需已登录**：适配器假设目标 App 已由用户登录、处于可用状态。`ensureReady()` 负责检测；未登录时应停在任务上并提示用户，而非盲目操作。

---

## 7. 风险与对策

| 风险 | 性质 | 对策 |
|---|---|---|
| **界面脆性** | 物理属性：依赖对方 UI 布局，对方改版即失效 | 驱动层做薄、隔离在各自适配器里；调度台不受影响，把维护成本圈在最小范围 |
| **完成检测/结果抽取不可靠** | 无回调，靠轮询与 UI 解析 | 每个适配器把 `poll`/`getResult` 当核心验收项；失败要能报"无法判定"而非假成功 |
| **自动化操作已登录账号** | 部分产品条款敏感（尤其网页系） | 这三个是本机桌面 App、用户自己的号，风险相对可控；仍需逐个确认各自使用条款，出现异常先停 |
| **权限被系统回收** | macOS 更新后授权可能失效 | 启动时校验权限，缺失则引导用户重新授权 |

---

## 8. 当前状态与下一步

- [x] 方案定稿（本文档）
- [x] **P0 体检**：三个 App 全是 Electron,均可通过 CDP 驱动(最优档)
- [ ] **P1 调度台骨架** ← 下一步
- [ ] P2 第一个 App 闭环

**P0 总结**：原本"决定性未知"的技术档位已确定——三者全落在最高稳定性的 CDP 档,避免了截图/辅助功能那条脆弱路径。QwenWorkCN 需要从日志解析动态端口,但不影响可行性。

**P1 的核心交付**：任务模型(Task 状态机:queued/running/completed/failed)、后台并发管理(复用 `activeQueries` 思路)、任务列表 UI(左侧任务卡片+状态、右侧运行面板)。这一步**与具体 App 无关**,是调度台的永久地基。

---

## 附：与其他方案的关系

- 本方案与 [`SIDECAR_MIGRATION.md`](./SIDECAR_MIGRATION.md) 是**不同方向**：Sidecar 是把自家 agent 逻辑迁到 Python 独立进程；本方案是调度**外部已装 App**，且明确**不需要 Python Sidecar**，直接建在现有 Electron + Node 栈上。
- 现有 `electron/service/agent-sdk.ts` 的 `activeQueries` 并发管理思路，可作为 P1 任务模型的起点。

---

**变更记录**

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-04 | v0.1 | 初版讨论稿 |
