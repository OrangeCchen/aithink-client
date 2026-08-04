# PRD2Spec

从 PRD + 蓝湖设计稿一键生成功能规格说明书（功规）的浏览器扩展。

## 功能

- 从飞书企业平台文档自动提取 PRD 正文
- 识别文档中的蓝湖/MasterGo 设计稿链接
- 自动抓取设计稿截图与标注
- 调用 Claude Sonnet 4.6 生成综合型功规（交互状态 + 字段/接口 + 边界/异常 + 验收标准）
- 流式预览生成过程
- 一键写回原文档或复制 Markdown

## 本地开发

### 1. 安装依赖

```bash
cd extension
npm install
```

### 2. 构建扩展

```bash
npm run build
```

构建产物在 `extension/dist/` 目录。

### 3. 加载到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension/dist/` 目录

### 4. 配置 API Key

1. 点击扩展图标打开侧边栏
2. 点击右上角"设置"
3. 填入你的 Anthropic API Key（从 https://console.anthropic.com/ 获取）
4. 选择模型（推荐 Claude Sonnet 4.6）

## 使用方式

1. 在飞书企业平台打开一个 PRD 文档
2. 点击浏览器扩展图标，打开侧边栏
3. 点击"从当前文档读取"提取 PRD
4. 点击"生成功规"，扩展会自动：
   - 抓取文档中的蓝湖/MasterGo 设计稿链接
   - 打开设计稿页面截图
   - 调用 Claude 生成功规
5. 生成完成后，点击"写回原文档"或"复制 Markdown"

## 技术栈

- Chrome Extension MV3
- Vite + CRXJS
- React + TypeScript + Tailwind CSS
- Anthropic Claude API（多模态）

## 目录结构

```
extension/
├── manifest.json          # MV3 配置
├── src/
│   ├── background/        # Service Worker（消息路由、LLM 调用）
│   ├── content/           # Content Scripts（飞书、蓝湖）
│   ├── sidepanel/         # React UI
│   └── shared/            # 共享类型、工具函数
└── public/icons/          # 扩展图标
```

## 注意事项

- 飞书企业平台的 DOM 结构可能因企业定制而不同，如果提取失败，请反馈具体页面 URL
- 蓝湖/MasterGo 需要登录态，请确保浏览器已登录
- 生成的功规需要人工复核，AI 可能遗漏或误判部分细节
- API Key 存储在本地 Chrome Storage，不会上传

## License

MIT
