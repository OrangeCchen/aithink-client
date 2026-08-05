# Codex / ChatGPT Desktop：「浏览器」与「电脑操控」调研报告

> **版本**: v0.2  
> **日期**: 2026-08-05  
> **对照方案**: [`APP_ORCHESTRATOR.md`](./APP_ORCHESTRATOR.md)

---

## 1. 一句话结论

ChatGPT 桌面端（含 Work / Codex）把操控能力拆成**三层工具栈**：隔离的内置浏览器（`@Browser`，适合 localhost / 批注）、带登录态的 Chrome 扩展（`@Chrome`）+ Excel 等结构化插件，以及兜底的任意应用 GUI 操控（`@Computer`，依赖屏幕录制/辅助功能）。它们不是 Codex CLI 的能力，而是桌面 Agent 的**本地执行面**。

**对 AIThink 的对齐结论（2026-08-05）**：

- Codex 调 `@Browser` / `@Computer` / 插件，与调度台「派给 QoderWork 等」在编排抽象上**同构**：都是 `编排层 → dispatch → 执行面 → 回收结果`。
- 短期执行面 = 几家已装 Agent App（CDP 适配器）；**长期目标 = 任意 App**（Computer Use 同款兜底）。
- 「魔法箭头」指的是 **Computer Use 画中画（PiP）里的独立代理光标**，不是浏览器 Annotation 批注。

---

## 2. 截图功能清单

以下为截图 UI 原文提取 + 含义说明；与官方文档交叉验证处标「事实」，仅凭 UI 推断处标「推断」。

### 2.1 浏览器（Browser）设置页

| UI 项 | 截图状态 | 含义 |
|---|---|---|
| 标题 / 副标题 | 「浏览器」「管理内置浏览器」 | 管理的是**应用内嵌浏览器**，不是系统 Chrome/Safari。【事实：截图 + 官方 Browser 文档】 |
| 跳转链接「计算机使用设置」 | 文案：可在该处设置浏览器扩展 | 内置浏览器与 Computer Use / Chrome 扩展是**相邻但不同**的控制面；扩展在「电脑操控」页管理。【事实】 |
| 总开关「浏览器 — 让 ChatGPT 控制内置浏览器」 | **开** | 授权 ChatGPT 对内置浏览器执行打开/点击/输入/截图等操作；对应插件侧的 Browser + Computer Use 协作。【事实】 |
| 「导入…」 | 常规区右侧按钮 | 导入浏览器资料（书签/配置等）。【事实：官方写可管理 profile-import；具体可导入内容未在截图展开 → **未公开确认**完整导入项列表】 |
| **网页 URL 和链接打开目标** | **默认浏览器** | 普通外链默认交给系统默认浏览器，避免污染内置会话。【事实：截图】 |
| **本地 URL 打开目标位置** | **ChatGPT** | localhost 等本地开发地址优先进内置浏览器，便于 AI 预览/批注/操控。【事实：截图；与官方一致】 |
| 浏览数据 → 清除浏览数据 | 按钮 | 清除内置浏览器历史、站点数据、缓存、下载记录等。【事实】 |
| 浏览历史 → 管理 | 按钮 | 查看/删除内置浏览器历史；官方还说明 ChatGPT 可请求搜索历史以找相关页，需用户批准。【事实】 |
| **批注截图** | **始终包含** | Annotation 会把带批注的截图作为多模态上下文发给模型；「始终包含」提高理解力但烧额度。【事实】 |

截图未出现、但官方 Browser 文档另有的相关项（供对照）：下载目录设置、站点 allow/block list、Developer mode（Enable full CDP access）。截图可能未滚动到或版本差异 → 以用户本机设置为准。

### 2.2 电脑操控（Computer Use）设置页

| UI 项 | 截图状态 | 含义 |
|---|---|---|
| 标题 / 副标题 | 「电脑操控」「管理 ChatGPT 如何使用你电脑上的其他应用程序」 | 管的是本机其它 App 的操控与集成，不只是浏览网页。【事实】 |
| **任意应用** | **开** — 「允许 ChatGPT 控制您电脑上的应用」 | 广义 GUI 操控开关：看屏 + 键鼠操作已授权 App。【事实】 |
| Google Chrome | **开**；「已安装浏览器扩展程序」+「管理」 | 深度浏览器通道：用真实 Chrome 登录态做事；「管理」可进扩展/域名 allow·block。【事实】 |
| Microsoft Excel | **开** — Excel 加载项 | 走 ChatGPT for Excel Add-in 的结构化读写，而非纯点 UI；Computer Use 可辅助打开 Excel/加载项。【事实：Help Center】 |
| 锁屏操作 | **关** — Locked Use | macOS 专属；开启后可在锁屏后继续任务。【事实】 |
| **始终隐藏画中画** | **关** | 默认会用 PiP 展示正在操控的 App；打开此项则隐藏该可见性通道。【事实】 |

---

## 3. 能力全景：各部件如何协作

### 3.1 先分清产品线（避免混淆）

| 表面 | 是什么 | 与 Browser / Computer Use 关系 |
|---|---|---|
| ChatGPT 桌面端（macOS/Windows） | 统一桌面 App（Chat / Work / Codex） | Browser + Computer Use 的主战场【事实】 |
| ChatGPT Work（桌面） | 知识工作 Agent 面 | 同样可装 Computer Use / Browser 插件【事实】 |
| Codex（桌面模式） | 编码 Agent 面（diff、worktree、本地仓库等） | 可调用同一套本地 Browser / Computer Use【事实】 |
| Codex CLI / IDE 扩展 | 终端/编辑器里的编码 Agent | **不是**本截图里的 GUI Computer Use；CLI 侧重 repo/shell【事实】 |
| 云端 Work / Operator 类云浏览器 | 云端会话 | 不能访问本机 App / 登录态【事实】 |

### 3.2 协作关系（推荐选型顺序）

```
有专用 Plugin / MCP / Excel Add-in？
    → 优先结构化集成（更稳、可审计）
需要真实 Chrome 登录态？
    → @Chrome + Chrome 扩展
本地开发预览 / 视觉批注？
    → @Browser 内置浏览器（独立 profile）
没有 API、必须点原生 GUI？
    → @Computer 任意应用（截图 + 键鼠）
```

官方明确的分工【事实】：

- **内置浏览器**：独立 profile；localhost / file 预览；Annotation / Adjust；可与 Computer Use 结合做点击与截图验收；不能在内置浏览器里自动化文件上传。
- **Chrome 扩展**：进入已登录 Chrome；按域名询问 / allowlist / blocklist。
- **Excel 加载项**：结构化改 workbook；Computer Use 可选，用于打开 Excel。
- **任意应用**：跨 App 工作流、复现 GUI bug、改没有插件的软件设置。
- **锁屏（macOS）**：远程/离席续跑；authorization plug-in；本机输入 → 重锁。
- **画中画**：后台操控时的实时监督窗；可拖到 Pet；多 App 堆叠切换；可始终隐藏。
- **批注截图**：人在页面上标问题 → 带图进对话 → Agent 修 UI。

### 3.3 平台差异（重要）

| | macOS | Windows |
|---|---|---|
| 后台操控 | 可后台跑，**独立代理光标** + PiP 监督【事实】 | 前台接管指针/键盘，同会话难并行【事实】 |
| Locked Use | 可选【事实】 | 不支持【事实】 |
| 离席建议 | Locked Use 或 Remote 督导 | 保持解锁联网，或放进 Windows VM【事实】 |

### 3.4 PiP 与「魔法箭头」（Computer Use 可视化）

易与浏览器 Annotation 混淆，此处单独澄清：

| 部件 | 是什么 | 不是什么 |
|---|---|---|
| **PiP（画中画）** | 正在被操控 App 的实时监督预览；可拖动、点开目标、多 App 堆叠、可关闭后从 Summary 重开 | 不是批注工具 |
| **魔法箭头** | macOS 后台 Computer Use 的**独立代理光标**：与用户真实鼠标分离；沿曲线移动并朝运动方向转向，便于理解 Agent 在点哪里【公开叙述 / 产品演示】 | 不是 Browser Annotation 的提交箭头；也不是用户用来圈选页面的批注指针 |

底层闭环（箭头只是外壳）：

```
感知（截图 + AX 树）
  → 决策（模型规划 click/type/scroll）
  → 执行（Accessibility / 进程定向键鼠事件；macOS 宜后台投递、不抢全局指针）
  → 可视化（PiP 镜像画面 + overlay 画独立箭头）
```

权限【事实】：Screen Recording（看屏）+ Accessibility（点击/输入/导航）。系统权限 ≠ App 内「Always allow」。

---

## 4. 技术 / 权限模型（基于公开信息）

### 4.1 系统级权限【事实】

- **macOS**：Screen Recording + Accessibility。
- **Windows**：目标 App 须在当前活动桌面可见；持久允许列表可写在 `$CODEX_HOME/config.toml` 的 `computer_use.windows.always_allowed_app_ids`。

### 4.2 应用内审批【事实】

- 首次用某 App 询问；可选 Always allow；可在设置撤销。
- 敏感动作（提交、付款、改权限、删数据等）额外确认。
- 文件读写 / shell 仍走任务 sandbox，与 GUI Computer Use 分层。
- 企业可用 `requirements.toml` 禁用：`computer_use = false`，或关 `browser_use_full_cdp_access`。

### 4.3 浏览器注入 / 控制方式

| 通道 | 公开机制 | 说明 |
|---|---|---|
| 内置浏览器 | Computer Use 操作内置 WebView；可选 full CDP | CDP 可查 console/network/DOM/performance；需显式批准【事实】 |
| Chrome | 官方 Chrome 扩展 + 桌面 Plugins | 扩展权限由 Chrome 提示；可要求 file URL 权限【事实】 |
| Excel | Office Add-in | 结构化读写；数据经 ChatGPT 处理【事实】 |
| 任意 App | 截图感知 + 辅助功能键鼠【推断细节】 | 官方确认看屏、截图、操作窗口/菜单/键盘/剪贴板；是否统一 AX 树或大量坐标点击 → **未公开确认** |

### 4.4 用户可见性与安全边界【事实】

- 可见性：PiP / Summary 重开；可「始终隐藏 PiP」。
- Locked Use：authorization plug-in；全屏遮罩；本机输入 → 重锁。
- 硬限制：不能自动化终端 App 或 ChatGPT 自身；不能代点系统隐私授权弹窗。
- 威胁模型：已登录站点上的点击等同用户本人；截图/页面/打开文件会进模型上下文。
- 用量：批注截图「始终包含」会增加套餐用量。

---

## 5. 典型使用场景

- 本地前端联调：dev server → `@Browser` → Annotation → 改代码再验收。【事实】
- 已登录 SaaS：`@Chrome` 打开 CRM/工单，整理草稿但不发送。【事实】
- 跨 App 知识工作：Messages + Notes。【事实】
- Excel 建模：Add-in 改表；Computer Use 只负责打开 Excel。【事实】
- GUI Bug 复现：对桌面 App / 模拟器跑 Computer Use。【事实】
- 离席续跑（Mac）：Remote + Locked Use。【事实】
- Windows 隔离：Computer Use 放进 VM。【事实】

---

## 6. 与同类产品对比（点到为止）

| 产品 | 定位差异 |
|---|---|
| Cursor Browser | IDE 内嵌/Agent 浏览器；一般不做任意原生 App / 锁屏 / Excel Add-in 级本机操控。【推断】 |
| Claude Computer Use | API 原语（截图+键鼠，自建 loop）；不是一键桌面产品。【事实】 |
| OpenAI Operator / 云浏览器 | 云端托管浏览器；无本机 App / 真实 Chrome profile。【事实】 |
| ChatGPT Desktop Computer Use | 本机 GUI Agent + 插件分层 + macOS 后台/PiP/锁屏。【事实】 |

一句话：Cursor ≈ 开发态浏览器闭环；Claude CU ≈ 可嵌入控制原语；Operator ≈ 云浏览器助手；ChatGPT Desktop ≈ **本机工作站 Agent 控制台**。

---

## 7. 对 AIThink 的结论（与调度台合并）

对照 [`APP_ORCHESTRATOR.md`](./APP_ORCHESTRATOR.md)：本机调度台，CDP 优先，辅助功能/截图降级；目标 App 当前为 QoderWork / QwenWorkCN / WorkBuddy（均已确认 Electron + CDP 可用）。

### 7.1 编排抽象：Codex 的「工具」= 调度台的「派」

```
Codex:     Agent 编排  ──派──►  @Computer / @Browser / Add-in / MCP
AIThink:   调度台编排  ──派──►  QoderWork / QwenWorkCN / WorkBuddy
                              （后期）任意 App / @Computer 同款执行面
```

同构点：任务模型、dispatch / poll / getResult、并发、权限与可观测性。

差异点不在「要不要控 App」，而在**执行面契约**：

| | Codex 的「派」 | AIThink 当前的「派」 | AIThink 长期的「派」 |
|---|---|---|---|
| 执行面 | 自家/半集成工具 | 第三方完整 Agent 产品（聊天 UI） | 任意已授权 App |
| 接口 | 相对稳定的工具协议 | 无正式 API，靠 CDP 填框/点发送 | CDP（Electron）或 AX+截图（原生） |
| 完成信号 | 工具返回/状态 | 需适配器判定「对方对话是否结束」 | observe → act → re-observe |
| 结果 | 结构化或约定回传 | 从 DOM/界面抽取 | 界面状态 / 截图验收 / 业务产物 |

**产品叙事**：AIThink 对齐的是 Codex **桌面编排控制台**，不是 Codex CLI 的 sandbox 编码面。  
**工程现实**：先做黑盒 Agent 适配器练调度；再把执行面扩成任意 App——编排层可复用，适配器从「特化」扩到「通用」。

### 7.2 分层控制（与 Codex 同一原则）

```
有结构化通道（API / 插件 / CDP DOM）？
    → 优先走它
否则
    → Computer Use 式视觉 + 键鼠兜底
```

- 三个目标 App 已落 **CDP 档** → 短期不要一上来像素点击。【对照 P0 体检】
- Excel Add-in 启示：能 API/插件就别点 UI；通用 GUI 只做降级。
- 隔离浏览器 vs 真实浏览器要拆开（若做预览能力）。

### 7.3 路线图（短期 → 任意 App）

| 阶段 | 内容 | 执行面 |
|---|---|---|
| **P1** | 任务模型 + 列表 + 后台并发 | 与具体 App 无关（编排地基） |
| **P2** | 第一个 Electron Agent 闭环（派任务 → 完成检测 → 抽结果） | 单 App CDP 适配器 |
| **P3** | 接第 2～3 家，压实 `AppAdapter` 抽象 | 多家特化 Agent |
| **P4** | 任意 Electron：通用 CDP / 调试端口驱动 | 扩大执行面 |
| **P5** | 任意原生 App：AX + 截图 + 独立光标 | 对标 `@Computer` |
| **贯穿** | 授权向导、PiP、魔法箭头、暂停/接管 | 可观测性（不绑死某一档） |

长期形态：

```
AIThink 编排台
  ├─ Tool: QoderWork / QwenWorkCN / WorkBuddy   ← 今天的「派」
  ├─ Tool: Browser / CDP 预览（可选）
  └─ Tool: @Computer（任意 App）                 ← 后期兜底
```

### 7.4 魔法箭头 / PiP：怎么落到 AIThink

目标体验对齐 Codex：后台跑执行面时，用户能看见「Agent 点了哪里」，而不必盯着被控窗。

**档 A — MVP（推荐先做，挂在 CDP 任务上）**

1. PiP / 运行面板：目标 App 的 screencast 或周期性截图。
2. Overlay 画自定义箭头（与系统鼠标分离）。
3. 真实操作走 CDP；动作前先把箭头沿贝塞尔曲线「游」到目标点，再执行，再刷新画面。
4. PiP 有缩放时，箭头坐标必须做仿射变换，避免「指着 A、点着 B」。
5. 喂给模型的截图应排除 overlay，避免箭头被当成页面 UI。

**档 B — 对标完整 Computer Use（P5）**

1. 权限：Screen Recording + Accessibility；逐 App Always allow。
2. 感知：按窗口截图 + AX 树。
3. 执行：进程定向键鼠事件（macOS 后台、不抢用户指针）；Windows 需接受前台接管或 VM 隔离。
4. 可视化：全屏透明 overlay 画独立光标 + PiP 监督。
5. 通常需要原生 helper（Swift / node-addon），纯 JS 不够稳。

档 A 的 PiP/箭头壳可原样接到档 B；先练可视化，再补系统级执行。

### 7.5 产品配套（不只是技术）

- 权限与可见性是产品：授权向导、逐 App 批准、PiP、敏感动作确认、企业开关。
- 后台异步 ≠ 无监督：任务列表需预览 / 暂停 / 接管（PiP 与 Locked Use 的等价物）。
- 同 App 慎并行多个 Computer Use 式任务（稳定性风险）。

### 7.6 当前建议（执行优先级）

1. **先交付 P1 编排地基**（与 App 无关）。
2. **P2 啃通一家 CDP 闭环**（验证「派」的脏活：完成检测 + 结果抽取）。
3. **可观测性可提前**：运行面板 PiP + 假箭头，不阻塞适配器。
4. **任意 App / 真独立光标单独立项**，不要与「从 QoderWork 抠结果」绑在同一 milestone。

---

## 8. 资料来源

**官方 / 学习站**

- Computer Use（developers.openai.com/codex/app/computer-use）
- Browser（developers.openai.com/codex/app/browser）
- Use your computer with ChatGPT
- Chrome extension
- ChatGPT for Excel（Help Center）
- Introducing ChatGPT for Excel
- ChatGPT is now a partner for your most ambitious work（桌面合并、内置浏览器、Computer Use 发布叙述）

**用户提供截图**

- 浏览器设置：`image-ace57e64-91bf-4254-8907-b03bcaecb149.png`
- 电脑操控设置：`image-85d478f9-c876-4e5f-a02c-e21b47f5842c.png`

**工作区对照**

- [`APP_ORCHESTRATOR.md`](./APP_ORCHESTRATOR.md)
- [`P1_MOCK_COMPLETED.md`](./P1_MOCK_COMPLETED.md)

**二手 / 对比（辅助，非权威）**

- MacObserver：Locked Computer Use 报道
- TechTimes：Windows 前台接管说明
- 产品演示叙述：独立光标「游泳」轨迹与方向转向（魔法箭头手感来源）
- 开源参照（实现线索，非 Codex 内部证实）：`CGEventPostToPid` + 透明 overlay cursor 一类方案

---

## 9. 不确定性汇总（未公开确认）

- 「导入…」完整可导入对象列表
- 任意 App 操控是否统一走 Accessibility 树，或大量坐标点击
- Codex CLI 是否具备与桌面同级的 Computer Use / 内置浏览器
- 截图设置页是否因版本省略了 CDP / 下载路径等项
- Cursor Browser 与 ChatGPT 内置浏览器的协议层细节是否同类（仅产品层对比）
- 独立代理光标是否完全依赖公开 AX/CG API，或另有私有接口

---

## 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-05 | v0.1 | 初版：Browser / Computer Use 截图清单与能力调研 |
| 2026-08-05 | v0.2 | 合并讨论结论：编排同构（工具=派）、魔法箭头=PiP 独立光标、短期 Agent App → 长期任意 App 路线图与实现分档 |
