# P1-Mock 完成报告

> **日期**: 2026-08-05  
> **状态**: ✅ 已完成  
> **类型**: 静态交互验证(纯前端 Mock)

## 概述

完成了外部 App 调度台的 P1-Mock 阶段,实现了完整的用户交互流程,但不调用真实的外部 App(QoderWork/千问Work/WorkBuddy)。所有逻辑都在前端模拟,用于验证产品形态和交互设计。

## 已完成功能

### 1. Mock 派发工具 ✅

**文件**: `frontend/src/stores/chat.ts`

- 关键词检测自动触发派发:
  - "重构" → 派发给 QoderWork
  - "单元测试" → 派发给千问Work
  - "文档" → 派发给 WorkBuddy
  - "全面" / "完整实现" → 并发派发 3 个任务
- 支持单任务和多任务并发派发
- 创建 `ExternalTask` 数据结构存储任务状态

**数据模型**:
```typescript
interface ExternalTask {
  id: string;
  sessionId: string;
  appId: 'qoderwork' | 'qwenworkcn' | 'workbuddy';
  appName: string;
  prompt: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  logs?: Array<{ time: number; message: string }>;
  result?: string;
  error?: string;
}
```

### 2. 主会话派发状态显示 ✅

**文件**: `frontend/src/stores/chat.ts`, `frontend/src/components/MessageBubble.vue`

- 派发时在消息流插入系统消息,显示:
  - 单任务: "🚀 检测到复杂任务,已派发给 QoderWork..."
  - 并发: 列出所有子任务 + 实时进度更新区域
- 带"新建对话"按钮(可点击,立刻创建新会话)
- 输入框禁用 + placeholder 显示等待状态: `⏳ 等待外部任务 (1/3 已完成，2 进行中)`

**交互**:
- 用户可以在等待时点击"新建对话"继续其他工作
- 主会话阻塞,不能发新消息,直到所有外部任务完成

### 3. 左侧任务列表显示外部任务卡片 ✅

**文件**: `frontend/src/components/Sidebar.vue`

- 在"最近"区域顶部显示外部任务卡片
- 每个卡片显示:
  - 状态图标: 🔄 running / ✅ completed / ❌ failed / ⏳ queued
  - App 徽章: QoderWork / 千问Work / WorkBuddy
  - 任务摘要(前 20 字)
  - 相对时间
- 状态图标实时更新
- Running 任务的图标有旋转动画

**样式**:
- running: 蓝色背景
- completed: 绿色背景
- failed: 红色背景

### 4. Mock 执行过程:自动完成 ✅

**文件**: `frontend/src/stores/chat.ts` (`mockExecuteTask`)

- 模拟任务执行生命周期:
  - 1 秒后: queued → running
  - 3-5 秒: 逐步更新进度条(0% → 100%)
  - 完成: running → completed
- 每个阶段自动插入日志到 `logs` 数组
- 并发任务独立完成,不互相阻塞
- 全部完成后在主会话插入汇总结果消息

### 5. 外部任务详情视图 ✅

**文件**: `frontend/src/views/ExternalTaskView.vue`

点击左侧外部任务卡片,右侧显示详情页:

- **顶部**: 任务头部
  - App 名称 + 状态徽章
  - 取消/重试按钮(根据状态显示)
  - 任务描述(完整 prompt)
  - 元信息(创建/开始/完成时间 + 进度)
- **中间**: 执行日志(timeline 格式)
- **底部**: 结果区域
  - completed: 显示绿色结果卡片
  - failed: 显示红色错误卡片

### 6. 并发派发交互细节 ✅

**文件**: `frontend/src/components/Sidebar.vue`, `frontend/src/components/InputBar.vue`

- 原会话卡片显示"等待中"状态:
  - 黄色背景 + 旋转图标
  - 视觉提示该会话正在等待外部任务
- 输入框 placeholder 动态显示: `⏳ 等待外部任务 (2/3 进行中)`
- 可以新建其他会话,不影响等待中的会话

## 技术实现

### 数据流

```
用户输入 → sendMessage()
    ↓
关键词检测 → dispatchExternalTask() / dispatchMultipleTasks()
    ↓
创建 ExternalTask → 存入 externalTasks[]
    ↓
插入派发通知消息 → messages.push()
    ↓
mockExecuteTask() → setTimeout 模拟执行
    ↓
更新 task.status / progress / logs
    ↓
完成 → 插入结果消息 → 解除输入框禁用
```

### 关键文件

| 文件 | 作用 |
|---|---|
| `shared/types.ts` | ExternalTask 类型定义 |
| `frontend/src/stores/chat.ts` | 外部任务管理逻辑 + Mock 执行 |
| `frontend/src/components/Sidebar.vue` | 左侧任务列表显示 |
| `frontend/src/components/InputBar.vue` | 输入框禁用 + 等待提示 |
| `frontend/src/components/MessageBubble.vue` | "新建对话"按钮渲染 |
| `frontend/src/views/ChatView.vue` | 切换会话/外部任务视图 |
| `frontend/src/views/ExternalTaskView.vue` | 外部任务详情页 |

## 测试方法

1. 启动开发服务器: `npm run dev`
2. 在会话输入框输入以下测试用例:

### 单任务派发
```
帮我重构登录模块
```
预期:
- 立刻派发给 QoderWork
- 左侧出现外部任务卡片(running 状态)
- 主会话显示派发通知 + "新建对话"按钮
- 输入框禁用,显示等待提示
- 3-5 秒后自动完成,显示结果

### 并发派发
```
全面实现用户认证功能
```
预期:
- 同时派发 3 个任务(QoderWork/千问Work/WorkBuddy)
- 左侧出现 3 个外部任务卡片
- 主会话显示 3 个子任务的列表 + 实时进度
- 各自独立完成,最后汇总结果

### 查看外部任务详情
- 点击左侧任务卡片
- 右侧切换到详情视图
- 能看到完整日志和结果

### 新建对话
- 等待时点击"新建对话"按钮
- 立刻创建新会话,可以继续输入
- 原会话保持等待状态

## 与真实实现的差异

| 功能 | Mock 版本 | 真实版本(P2) |
|---|---|---|
| 触发方式 | 关键词检测(硬编码) | Agent 调用 dispatch 工具 |
| App 启动 | 无(直接模拟) | spawn + CDP 连接 |
| 任务执行 | setTimeout 3-5 秒 | 真实 CDP 操作 + 轮询结果 |
| 结果来源 | 硬编码字符串 | 从外部 App 读取 |
| 数据存储 | 前端 store(内存) | 后端数据库 |
| 取消/重试 | 空操作(TODO) | 真实 kill 进程/重新派发 |

## 下一步(P2:真实实现)

Mock 版本已验证交互流程可行,接下来实现真实逻辑:

1. **启动器**: `electron/service/external-app-launcher.ts`
   - spawn QoderWork/千问Work/WorkBuddy
   - 解析调试端口
   - 健康检查

2. **CDP 客户端**: `electron/service/cdp-client.ts`
   - WebSocket 连接
   - 封装常用操作(navigate/evaluate/querySelector)

3. **任务执行器**: `electron/service/external-task-executor.ts`
   - 从队列取任务
   - 启动 App → CDP 操作 → 轮询结果
   - 状态更新推送前端

4. **App 适配器**: 针对每个 App 的具体操作流程
   - QoderWork: 填输入框 → 点击 → 等待 → 读结果
   - 千问Work: (类似)
   - WorkBuddy: (类似)

5. **后端存储**: 迁移 externalTasks 到 database.ts

## 已知限制

- Mock 版本不支持真实取消/重试(按钮是空操作)
- 关键词触发逻辑是硬编码,无法动态调整
- 所有任务都会成功,不会失败(除非手动模拟)
- 数据存在前端内存,刷新页面丢失

这些在 P2 真实实现时会解决。

## 总结

✅ P1-Mock 完成,交互流程验证通过。  
✅ 所有 6 个任务(#8-#13)已完成。  
✅ 无新增类型错误,代码编译通过。  
✅ 可以开始 P2(真实实现)或者先给用户演示,收集反馈。
