# mac-computer-use

macOS 原生 helper：用辅助功能操控**已打开**的桌面 App，并绘制魔法箭头 overlay。

## 构建

```bash
npm run build:computer-use
# 或
swiftc -O -o native/mac-computer-use/mac-computer-use \
  native/mac-computer-use/Sources/main.swift \
  -framework AppKit -framework ApplicationServices -framework Cocoa -framework QuartzCore
```

## 权限

系统设置 → 隐私与安全性 → **辅助功能**：勾选 AIThink（开发时也可能需要勾选 Terminal / Cursor，因为由它们拉起 helper）。

## 常用命令

```bash
./native/mac-computer-use/mac-computer-use check-permission
./native/mac-computer-use/mac-computer-use find-app --bundle-id com.bot.pc.doubao
./native/mac-computer-use/mac-computer-use find-composer --pid <pid>
./native/mac-computer-use/mac-computer-use dispatch --pid <pid> --prompt "你好"
./native/mac-computer-use/mac-computer-use dispatch --pid <pid> --prompt "你好"
./native/mac-computer-use/mac-computer-use poll-reply --pid <pid> --prompt "你好" --baseline-json '[]'
./native/mac-computer-use/mac-computer-use control-end
```

不会启动新的 App 实例；目标必须已在运行。
