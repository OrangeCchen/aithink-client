import AppKit
import ApplicationServices
import Foundation

// MARK: - JSON helpers

func jsonObject(_ obj: Any) -> String {
  guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]),
        let s = String(data: data, encoding: .utf8) else {
    return #"{"ok":false,"error":"json_encode_failed"}"#
  }
  return s
}

func printJSON(_ obj: [String: Any]) {
  print(jsonObject(obj))
}

func fail(_ message: String, code: String = "error") -> Never {
  printJSON(["ok": false, "error": message, "code": code])
  exit(1)
}

func argValue(_ flag: String) -> String? {
  let args = CommandLine.arguments
  guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
  return args[i + 1]
}

func hasFlag(_ flag: String) -> Bool {
  CommandLine.arguments.contains(flag)
}

// MARK: - Permission / App discovery

func checkPermission() -> [String: Any] {
  let trusted = AXIsProcessTrusted()
  return [
    "ok": true,
    "accessibilityTrusted": trusted,
    "hint": trusted
      ? "辅助功能已授权"
      : "请在「系统设置 → 隐私与安全性 → 辅助功能」中勾选 AIThink / mac-computer-use"
  ]
}

func findApp(bundleId: String) -> [String: Any] {
  let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
  guard let app = apps.first, app.processIdentifier > 0 else {
    return [
      "ok": false,
      "code": "app_not_running",
      "error": "未找到运行中的 App（bundleId=\(bundleId)）。请先打开并登录后再派发。"
    ]
  }

  let pid = app.processIdentifier
  let appElement = AXUIElementCreateApplication(pid)
  var windowsRef: CFTypeRef?
  AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)

  var windows: [[String: Any]] = []
  if let arr = windowsRef as? [AXUIElement] {
    for (idx, win) in arr.enumerated() {
      var titleRef: CFTypeRef?
      var posRef: CFTypeRef?
      var sizeRef: CFTypeRef?
      AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &titleRef)
      AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &posRef)
      AXUIElementCopyAttributeValue(win, kAXSizeAttribute as CFString, &sizeRef)

      var point = CGPoint.zero
      var size = CGSize.zero
      if let pos = posRef {
        AXValueGetValue(pos as! AXValue, .cgPoint, &point)
      }
      if let sz = sizeRef {
        AXValueGetValue(sz as! AXValue, .cgSize, &size)
      }

      windows.append([
        "index": idx,
        "title": (titleRef as? String) ?? "",
        "bounds": [
          "x": point.x,
          "y": point.y,
          "w": size.width,
          "h": size.height
        ]
      ])
    }
  }

  return [
    "ok": true,
    "pid": Int(pid),
    "bundleId": bundleId,
    "name": app.localizedName ?? bundleId,
    "active": app.isActive,
    "windows": windows
  ]
}

func activateApp(pid: pid_t) -> Bool {
  guard let app = NSRunningApplication(processIdentifier: pid) else { return false }
  return app.activate()
}

// MARK: - AX tree helpers

struct AXNodeInfo {
  let element: AXUIElement
  let role: String
  let title: String
  let value: String
  let description: String
  let frame: CGRect
}

func axString(_ element: AXUIElement, _ attr: CFString) -> String {
  var ref: CFTypeRef?
  AXUIElementCopyAttributeValue(element, attr, &ref)
  if let s = ref as? String { return s }
  if let n = ref as? NSNumber { return n.stringValue }
  return ""
}

func axFrame(_ element: AXUIElement) -> CGRect {
  var posRef: CFTypeRef?
  var sizeRef: CFTypeRef?
  AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &posRef)
  AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef)
  var point = CGPoint.zero
  var size = CGSize.zero
  if let pos = posRef { AXValueGetValue(pos as! AXValue, .cgPoint, &point) }
  if let sz = sizeRef { AXValueGetValue(sz as! AXValue, .cgSize, &size) }
  return CGRect(origin: point, size: size)
}

func axChildren(_ element: AXUIElement) -> [AXUIElement] {
  var ref: CFTypeRef?
  AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &ref)
  return (ref as? [AXUIElement]) ?? []
}

func axIsSettable(_ element: AXUIElement, _ attr: CFString) -> Bool {
  var settable = DarwinBoolean(false)
  let result = AXUIElementIsAttributeSettable(element, attr, &settable)
  return result == .success && settable.boolValue
}

func isComposerCandidate(_ element: AXUIElement, role: String) -> Bool {
  let excluded: Set<String> = [
    "AXStaticText", "AXHeading", "AXImage", "AXLink", "AXButton",
    "AXMenuBar", "AXMenu", "AXMenuItem", "AXToolbar", "AXScrollBar"
  ]
  if excluded.contains(role) { return false }

  let preferred: Set<String> = [
    "AXTextArea", "AXTextField", "AXComboBox", "AXSearchField"
  ]
  if preferred.contains(role) { return true }

  // Web/Electron editors sometimes expose custom roles; require settable value.
  if role.lowercased().contains("text") {
    return axIsSettable(element, kAXValueAttribute as CFString)
  }
  return false
}

func composerScore(_ node: AXNodeInfo) -> CGFloat {
  let area = node.frame.width * node.frame.height
  var score = area + node.frame.origin.y * 2
  switch node.role {
  case "AXTextArea": score += 50_000
  case "AXTextField", "AXSearchField": score += 30_000
  case "AXComboBox": score += 10_000
  default: break
  }
  // Prefer short placeholder-like values over long rendered message bodies.
  if node.value.count > 240 { score -= 20_000 }
  return score
}

func collectEditable(
  _ element: AXUIElement,
  depth: Int,
  maxDepth: Int,
  into out: inout [AXNodeInfo]
) {
  if depth > maxDepth { return }
  let role = axString(element, kAXRoleAttribute as CFString)
  let title = axString(element, kAXTitleAttribute as CFString)
  let value = axString(element, kAXValueAttribute as CFString)
  let desc = axString(element, kAXDescriptionAttribute as CFString)
  let frame = axFrame(element)

  if isComposerCandidate(element, role: role), frame.width > 40, frame.height > 12 {
    out.append(AXNodeInfo(
      element: element,
      role: role,
      title: title,
      value: value,
      description: desc,
      frame: frame
    ))
  }

  for child in axChildren(element) {
    collectEditable(child, depth: depth + 1, maxDepth: maxDepth, into: &out)
  }
}

func findComposer(pid: pid_t) -> [String: Any] {
  let appElement = AXUIElementCreateApplication(pid)
  var nodes: [AXNodeInfo] = []
  collectEditable(appElement, depth: 0, maxDepth: 25, into: &nodes)

  let ranked = nodes.sorted { composerScore($0) > composerScore($1) }

  guard let best = ranked.first, best.frame.width > 40, best.frame.height > 12 else {
    return [
      "ok": false,
      "code": "composer_not_found",
      "error": "未在辅助功能树中找到输入框。请确认目标 App 主窗口可见且已登录。",
      "candidates": nodes.prefix(8).map { n -> [String: Any] in
        [
          "role": n.role,
          "title": n.title,
          "description": n.description,
          "bounds": [
            "x": n.frame.origin.x,
            "y": n.frame.origin.y,
            "w": n.frame.width,
            "h": n.frame.height
          ]
        ]
      }
    ]
  }

  return [
    "ok": true,
    "role": best.role,
    "title": best.title,
    "description": best.description,
    "valuePreview": String(best.value.prefix(120)),
    "bounds": [
      "x": best.frame.origin.x,
      "y": best.frame.origin.y,
      "w": best.frame.width,
      "h": best.frame.height
    ],
    "center": [
      "x": best.frame.midX,
      "y": best.frame.midY
    ]
  ]
}

struct TextSegment {
  let text: String
  let frame: CGRect
}

/// 只采集主对话区（与 composer 同列、排除左侧边栏），避免历史列表标题污染结果。
func collectConversationTexts(pid: pid_t, maxDepth: Int = 30) -> (segments: [TextSegment], composerFound: Bool) {
  guard let composer = findBestEditableElement(pid: pid, bundleId: nil) else {
    return ([], false)
  }
  let composerFrame = axFrame(composer)
  let appElement = AXUIElementCreateApplication(pid)
  var segments: [TextSegment] = []

  func walk(_ el: AXUIElement, depth: Int) {
    if depth > maxDepth { return }
    let role = axString(el, kAXRoleAttribute as CFString)
    let value = axString(el, kAXValueAttribute as CFString)
    let title = axString(el, kAXTitleAttribute as CFString)
    if role == "AXStaticText" || role == "AXTextArea" || role.contains("Text") {
      let t = value.isEmpty ? title : value
      let trimmed = t.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.count >= 2 {
        let frame = axFrame(el)
        // macOS AX：Y 向上增大。消息在输入框上方 → minY >= composer.maxY
        let inComposer =
          frame.midY <= composerFrame.maxY + 16 &&
          frame.midY >= composerFrame.minY - 16 &&
          frame.midX >= composerFrame.minX - 48 &&
          frame.midX <= composerFrame.maxX + 48

        // 豆包等 Electron Web：侧边栏 midX ~540，主对话区与 composer 同列（midX 更大）
        let inChatPanel = frame.midX >= composerFrame.minX - 100
        // 对话气泡在 composer 可视区域之上（macOS AX 中 Y 较小的一带；勿用 minY >= composer.maxY）
        let inChatVerticalBand = frame.maxY <= composerFrame.maxY + 120

        if !inComposer && inChatPanel && inChatVerticalBand {
          segments.append(TextSegment(text: trimmed, frame: frame))
        }
      }
    }
    for c in axChildren(el) { walk(c, depth: depth + 1) }
  }

  walk(appElement, depth: 0)
  // 按 Y 从上到下（macOS 坐标系：Y 大在上）
  segments.sort { $0.frame.midY > $1.frame.midY }
  return (segments, true)
}

func textArray(from segments: [TextSegment]) -> [String] {
  segments.map(\.text)
}

func collectTextSnapshot(pid: pid_t, maxDepth: Int = 30) -> [String: Any] {
  let conv = collectConversationTexts(pid: pid, maxDepth: maxDepth)
  var texts = textArray(from: conv.segments)

  if texts.isEmpty {
    // 回退：全窗口扫描（旧逻辑）
    let appElement = AXUIElementCreateApplication(pid)
    func walk(_ el: AXUIElement, depth: Int) {
      if depth > maxDepth { return }
      let role = axString(el, kAXRoleAttribute as CFString)
      let value = axString(el, kAXValueAttribute as CFString)
      let title = axString(el, kAXTitleAttribute as CFString)
      if role == "AXStaticText" || role == "AXTextArea" || role.contains("Text") {
        let t = value.isEmpty ? title : value
        let trimmed = t.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count >= 2 { texts.append(trimmed) }
      }
      for c in axChildren(el) { walk(c, depth: depth + 1) }
    }
    walk(appElement, depth: 0)
  }

  let joined = texts.suffix(12).joined(separator: "\n---\n")
  return [
    "ok": true,
    "textCount": texts.count,
    "texts": texts,
    "text": String(joined.prefix(20000)),
    "lastText": texts.last ?? "",
    "composerScoped": conv.composerFound
  ]
}

// MARK: - Actions

func setValue(_ element: AXUIElement, _ text: String) -> Bool {
  let result = AXUIElementSetAttributeValue(
    element,
    kAXValueAttribute as CFString,
    text as CFTypeRef
  )
  return result == .success
}

func press(_ element: AXUIElement) -> Bool {
  let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
  return result == .success
}

func focus(_ element: AXUIElement) -> Bool {
  let r1 = AXUIElementSetAttributeValue(
    element,
    kAXFocusedAttribute as CFString,
    kCFBooleanTrue
  )
  return r1 == .success
}

func postKey(pid: pid_t, keyCode: CGKeyCode, flags: CGEventFlags = [], global: Bool = false) {
  let src = CGEventSource(stateID: .hidSystemState)
  if let down = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true) {
    down.flags = flags
    if global { down.post(tap: .cghidEventTap) } else { down.postToPid(pid) }
  }
  if let up = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false) {
    up.flags = flags
    if global { up.post(tap: .cghidEventTap) } else { up.postToPid(pid) }
  }
}

func typeUnicode(pid: pid_t, text: String, global: Bool = false) {
  let src = CGEventSource(stateID: .hidSystemState)
  for ch in text.utf16 {
    var chars = [UniChar(ch)]
    if let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true) {
      down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
      if global { down.post(tap: .cghidEventTap) } else { down.postToPid(pid) }
    }
    if let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false) {
      up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
      if global { up.post(tap: .cghidEventTap) } else { up.postToPid(pid) }
    }
    usleep(4000)
  }
}

func clickAt(pid: pid_t, x: CGFloat, y: CGFloat, global: Bool = false) {
  let point = CGPoint(x: x, y: y)
  let src = CGEventSource(stateID: .hidSystemState)
  if let move = CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) {
    if global { move.post(tap: .cghidEventTap) } else { move.postToPid(pid) }
  }
  if let down = CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left) {
    if global { down.post(tap: .cghidEventTap) } else { down.postToPid(pid) }
  }
  if let up = CGEvent(mouseEventSource: src, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) {
    if global { up.post(tap: .cghidEventTap) } else { up.postToPid(pid) }
  }
}

func useGlobalEvents(bundleId: String?) -> Bool {
  isWorkBuddyBundle(bundleId)
}

func ensureAppFrontmost(pid: pid_t, bundleId: String?) {
  guard useGlobalEvents(bundleId: bundleId) else { return }
  _ = activateApp(pid: pid)
  usleep(220_000)
}

func isWorkBuddyHomeComposer(_ frame: CGRect) -> Bool {
  // 首页大输入框在窗口中部；会话页输入框靠近底部 (y≈700+)
  frame.origin.y < 620
}

func isWorkBuddySessionComposer(_ frame: CGRect) -> Bool {
  frame.origin.y > 650
}

func isWorkBuddyFooterControl(_ node: AXNodeInfo) -> Bool {
  if node.role == "AXComboBox" { return true }
  let label = node.title + node.value + node.description
  let footerLabels = ["默认权限", "选择工作空间", "Auto", "auto"]
  for token in footerLabels where label.contains(token) { return true }
  // 首页输入框下方的窄控件行（Auto / 权限等），勿当作 composer
  if node.frame.origin.y >= 580, node.frame.height < 44, node.role != "AXTextArea" {
    return true
  }
  return false
}

func workBuddyComposerArea(_ node: AXNodeInfo) -> CGFloat {
  node.frame.width * node.frame.height
}

func findBestEditableElement(pid: pid_t, bundleId: String? = nil) -> AXUIElement? {
  let appElement = AXUIElementCreateApplication(pid)
  var nodes: [AXNodeInfo] = []
  collectEditable(appElement, depth: 0, maxDepth: 25, into: &nodes)
  if nodes.isEmpty { return nil }

  if isWorkBuddyBundle(bundleId) {
    let pool = nodes.filter { !isWorkBuddyFooterControl($0) }
    let candidates = pool.isEmpty ? nodes : pool

    // 会话页：底部大 TextArea
    let session = candidates.filter { $0.role == "AXTextArea" && isWorkBuddySessionComposer($0.frame) }
    if let best = session.max(by: { workBuddyComposerArea($0) < workBuddyComposerArea($1) }) {
      return best.element
    }

    // 首页：中部大 TextArea（排除底部 ComboBox）
    let home = candidates.filter { $0.role == "AXTextArea" && isWorkBuddyHomeComposer($0.frame) }
    if let best = home.max(by: { workBuddyComposerArea($0) < workBuddyComposerArea($1) }) {
      return best.element
    }

    return candidates.sorted { composerScore($0) > composerScore($1) }.first?.element
  }

  let ranked = nodes.sorted { composerScore($0) > composerScore($1) }
  return ranked.first?.element
}

/// Raise windows without forcing frontmost activation (weak foreground).
func raiseAppWindows(pid: pid_t) -> Bool {
  // 不再 raise：kAXRaiseAction 会把目标 App 拉到最前，干扰用户当前工作区。
  _ = pid
  return true
}

func pastePrompt(_ text: String, pid: pid_t, bundleId: String? = nil) {
  let pb = NSPasteboard.general
  pb.clearContents()
  pb.setString(text, forType: .string)
  usleep(40_000)
  // Cmd+V
  postKey(
    pid: pid,
    keyCode: 9,
    flags: .maskCommand,
    global: useGlobalEvents(bundleId: bundleId)
  )
}

func clearComposer(pid: pid_t) {
  // Cmd+A then Delete — WorkBuddy 等 React contenteditable 会触发 removeChild 崩溃，勿对空编辑器使用
  postKey(pid: pid, keyCode: 0, flags: .maskCommand)
  usleep(40_000)
  postKey(pid: pid, keyCode: 51) // delete
  usleep(40_000)
}

let workBuddyBundleId = "com.workbuddy.workbuddy"

func isWorkBuddyBundle(_ bundleId: String?) -> Bool {
  bundleId == workBuddyBundleId
}

/// WorkBuddy：仅用 Backspace 清空，避免 Cmd+A 破坏 React DOM
func gentleClearComposer(pid: pid_t, composer: AXUIElement, bundleId: String? = nil) {
  let len = max(normalizedComposerText(composer).count, 1)
  let global = useGlobalEvents(bundleId: bundleId)
  for _ in 0..<min(len + 12, 160) {
    postKey(pid: pid, keyCode: 51, global: global)
    usleep(7_000)
  }
}

func prepareComposerForInput(pid: pid_t, composer: AXUIElement, bundleId: String?) {
  if composerLooksEmpty(composer) {
    return
  }
  if isWorkBuddyBundle(bundleId) {
    gentleClearComposer(pid: pid, composer: composer, bundleId: bundleId)
  } else {
    clearComposer(pid: pid)
  }
  usleep(60_000)
}

func countPromptInChat(pid: pid_t, prompt: String) -> Int {
  let promptT = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
  if promptT.isEmpty { return 0 }
  let snap = collectTextSnapshot(pid: pid)
  let texts = snapshotTexts(from: snap)
  return texts.filter { trimLine($0) == promptT }.count
}

func chatContainsUserPrompt(pid: pid_t, prompt: String) -> Bool {
  return countPromptInChat(pid: pid, prompt: prompt) > 0
}

func readComposerText(_ element: AXUIElement) -> String {
  let value = axString(element, kAXValueAttribute as CFString)
  if !value.isEmpty { return value }
  return axString(element, kAXDescriptionAttribute as CFString)
}

func collectButtons(_ element: AXUIElement, depth: Int, maxDepth: Int, into out: inout [AXNodeInfo]) {
  if depth > maxDepth { return }
  let role = axString(element, kAXRoleAttribute as CFString)
  if role == "AXButton" || role == "AXLink" {
    out.append(
      AXNodeInfo(
        element: element,
        role: role,
        title: axString(element, kAXTitleAttribute as CFString),
        value: axString(element, kAXValueAttribute as CFString),
        description: axString(element, kAXDescriptionAttribute as CFString),
        frame: axFrame(element)
      )
    )
  }
  for child in axChildren(element) {
    collectButtons(child, depth: depth + 1, maxDepth: maxDepth, into: &out)
  }
}

/// Prefer circular send button near composer bottom-right (含首页输入框下方独立发送钮).
func findSendButton(pid: pid_t, near composerFrame: CGRect, bundleId: String? = nil) -> AXUIElement? {
  let appElement = AXUIElementCreateApplication(pid)
  var buttons: [AXNodeInfo] = []
  collectButtons(appElement, depth: 0, maxDepth: 30, into: &buttons)

  let ySlackBelow = isWorkBuddyBundle(bundleId) && isWorkBuddyHomeComposer(composerFrame) ? 120.0 : 40.0

  let candidates = buttons.filter { b in
    let f = b.frame
    guard f.width > 8, f.height > 8, f.width < 120, f.height < 120 else { return false }
    let nearX = f.midX >= composerFrame.maxX - 160 && f.midX <= composerFrame.maxX + 60
    let nearY = f.midY >= composerFrame.maxY - 80 && f.midY <= composerFrame.maxY + ySlackBelow
    let label = (b.title + b.description + b.value).lowercased()
    let looksSend =
      label.contains("send") ||
      label.contains("提交") ||
      label.contains("发送") ||
      label.contains("arrow") ||
      (f.width >= 24 && f.width <= 56 && abs(f.width - f.height) < 12)
    return (nearX && nearY) || (looksSend && nearY)
  }

  return candidates.sorted { a, b in
    // 优先最靠右的圆形发送钮（WorkBuddy 等）
    if abs(a.frame.midY - b.frame.midY) < 24 {
      return a.frame.midX > b.frame.midX
    }
    let da = hypot(a.frame.midX - composerFrame.maxX, a.frame.midY - composerFrame.maxY)
    let db = hypot(b.frame.midX - composerFrame.maxX, b.frame.midY - composerFrame.maxY)
    return da < db
  }.first?.element
}

func clickSendButton(
  pid: pid_t,
  button: AXUIElement,
  showCursor: Bool,
  preferClick: Bool = false,
  global: Bool = false
) -> Bool {
  let frame = axFrame(button)
  if showCursor {
    flashCursor(at: CGPoint(x: frame.midX, y: frame.midY), durationMs: 280)
  }
  if !preferClick, press(button) { return true }
  clickAt(pid: pid, x: frame.midX, y: frame.midY, global: global)
  return true
}

func axIsEnabled(_ element: AXUIElement) -> Bool {
  var ref: CFTypeRef?
  AXUIElementCopyAttributeValue(element, kAXEnabledAttribute as CFString, &ref)
  if let b = ref as? Bool { return b }
  if let n = ref as? NSNumber { return n.boolValue }
  return true
}

func normalizedComposerText(_ element: AXUIElement) -> String {
  readComposerText(element)
    .replacingOccurrences(of: "\u{FEFF}", with: "")
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

func composerContainsPrompt(_ element: AXUIElement, prompt: String) -> Bool {
  let current = normalizedComposerText(element)
  let promptT = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
  if promptT.isEmpty { return false }
  if current.contains(promptT) { return true }
  let head = String(promptT.prefix(12))
  return !head.isEmpty && current.contains(head)
}

func composerLooksEmpty(_ element: AXUIElement) -> Bool {
  let current = normalizedComposerText(element)
  if current.isEmpty { return true }
  let placeholders = [
    "今天帮你做些什么", "发消息", "按住空格", "@ 引用", "调用技能", "/ 调用"
  ]
  for p in placeholders {
    if current.contains(p) { return true }
  }
  return false
}

/// 发送后输入框应清空，或对话区已出现用户消息
func verifyMessageSent(
  composer: AXUIElement,
  prompt: String,
  pid: pid_t,
  bundleId: String?,
  chatCountBefore: Int = 0
) -> Bool {
  if isWorkBuddyBundle(bundleId) {
    if countPromptInChat(pid: pid, prompt: prompt) > chatCountBefore {
      return true
    }
    let promptT = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    if let currentComposer = findBestEditableElement(pid: pid, bundleId: bundleId) {
      let now = normalizedComposerText(currentComposer)
      let nowFrame = axFrame(currentComposer)
      if isWorkBuddySessionComposer(nowFrame) {
        return true
      }
      if now.isEmpty || (!promptT.isEmpty && !now.contains(promptT)) {
        return true
      }
      // 首页发送后会进入会话页（底部输入框）
      if isWorkBuddyHomeComposer(axFrame(composer)) && nowFrame.origin.y > 650 {
        return true
      }
    }
  }
  if composerLooksEmpty(composer) { return true }
  return !composerContainsPrompt(composer, prompt: prompt)
}

func fillComposer(
  pid: pid_t,
  composer: AXUIElement,
  prompt: String,
  showCursor: Bool,
  bundleId: String?
) -> (ok: Bool, method: String) {
  var target = composer
  var frame = axFrame(target)
  var homeComposer = isWorkBuddyBundle(bundleId) && isWorkBuddyHomeComposer(frame)
  let global = useGlobalEvents(bundleId: bundleId)
  if showCursor {
    flashCursor(at: CGPoint(x: frame.midX, y: frame.midY), durationMs: 320)
  }

  let clickY = homeComposer ? frame.minY + min(28, frame.height * 0.35) : frame.midY
  clickAt(pid: pid, x: frame.midX, y: clickY, global: global)
  usleep(120_000)
  _ = focus(target)
  usleep(80_000)

  if let resolved = findBestEditableElement(pid: pid, bundleId: bundleId) {
    target = resolved
    frame = axFrame(target)
    homeComposer = isWorkBuddyBundle(bundleId) && isWorkBuddyHomeComposer(frame)
  }

  if composerContainsPrompt(target, prompt: prompt) {
    if homeComposer {
      return (true, "wb_home_ready")
    }
    return (true, "already_has_prompt")
  }

  prepareComposerForInput(pid: pid, composer: target, bundleId: bundleId)

  if isWorkBuddyBundle(bundleId) {
    pastePrompt(prompt, pid: pid, bundleId: bundleId)
    usleep(280_000)
    if let current = findBestEditableElement(pid: pid, bundleId: bundleId),
       composerContainsPrompt(current, prompt: prompt) {
      return (true, homeComposer ? "wb_home_paste" : "wb_click_paste")
    }
    typeUnicode(pid: pid, text: prompt, global: global)
    usleep(280_000)
    if let current = findBestEditableElement(pid: pid, bundleId: bundleId),
       composerContainsPrompt(current, prompt: prompt) {
      return (true, homeComposer ? "wb_home_type" : "wb_click_type")
    }
    return (false, "wb_input_failed")
  }

  if prompt.count <= 800 {
    typeUnicode(pid: pid, text: prompt)
    usleep(220_000)
    if composerContainsPrompt(composer, prompt: prompt) {
      return (true, "click_type_unicode")
    }
  }

  pastePrompt(prompt, pid: pid)
  usleep(220_000)
  if composerContainsPrompt(composer, prompt: prompt) {
    return (true, "click_paste")
  }

  if setValue(composer, prompt) {
    usleep(160_000)
    if composerContainsPrompt(composer, prompt: prompt) {
      return (true, "click_set_value")
    }
  }

  return (false, "input_failed")
}

func focusWorkBuddyComposer(
  pid: pid_t,
  composer: AXUIElement,
  composerFrame: CGRect,
  showCursor: Bool,
  homeComposer: Bool,
  global: Bool
) {
  let clickY = homeComposer
    ? composerFrame.minY + min(28, composerFrame.height * 0.35)
    : composerFrame.midY
  if showCursor {
    flashCursor(at: CGPoint(x: composerFrame.midX, y: clickY), durationMs: 240)
  }
  clickAt(pid: pid, x: composerFrame.midX, y: clickY, global: global)
  usleep(100_000)
  _ = focus(composer)
  usleep(80_000)
}

func submitWorkBuddy(
  pid: pid_t,
  composer: AXUIElement,
  composerFrame: CGRect,
  showCursor: Bool,
  homeComposer: Bool
) -> String {
  let global = true
  focusWorkBuddyComposer(
    pid: pid,
    composer: composer,
    composerFrame: composerFrame,
    showCursor: showCursor,
    homeComposer: homeComposer,
    global: global
  )

  if homeComposer {
    // 首页：输入框聚焦后 Return 即可发送（postToPid 无效，须走 HID）
    postKey(pid: pid, keyCode: 36, global: global)
    usleep(520_000)
    return "wb_home_enter"
  }

  if let sendBtn = findSendButton(pid: pid, near: composerFrame, bundleId: workBuddyBundleId) {
    _ = clickSendButton(
      pid: pid,
      button: sendBtn,
      showCursor: showCursor,
      preferClick: true,
      global: global
    )
    usleep(420_000)
    return "wb_session_click_send"
  }

  clickAt(pid: pid, x: composerFrame.maxX - 28, y: composerFrame.midY, global: global)
  usleep(320_000)
  postKey(pid: pid, keyCode: 36, global: global)
  usleep(360_000)
  return "wb_session_coord_send+enter"
}

func submitComposer(
  pid: pid_t,
  composer: AXUIElement,
  composerFrame: CGRect,
  showCursor: Bool,
  bundleId: String? = nil
) -> String {
  let wb = isWorkBuddyBundle(bundleId)
  let homeComposer = wb && isWorkBuddyHomeComposer(composerFrame)
  if wb {
    return submitWorkBuddy(
      pid: pid,
      composer: composer,
      composerFrame: composerFrame,
      showCursor: showCursor,
      homeComposer: homeComposer
    )
  }

  var methods: [String] = []

  if let sendBtn = findSendButton(pid: pid, near: composerFrame), axIsEnabled(sendBtn) {
    _ = clickSendButton(pid: pid, button: sendBtn, showCursor: showCursor)
    methods.append("click_send")
    usleep(280_000)
  }

  postKey(pid: pid, keyCode: 36, flags: .maskCommand)
  usleep(80_000)
  postKey(pid: pid, keyCode: 36)
  methods.append("cmd_enter+enter")
  usleep(320_000)

  return methods.joined(separator: "+")
}

func dispatchOnce(
  pid: pid_t,
  prompt: String,
  showCursor: Bool,
  forceActivate: Bool,
  bundleId: String? = nil
) -> [String: Any] {
  _ = forceActivate
  usleep(120_000)

  guard let composer = findBestEditableElement(pid: pid, bundleId: bundleId) else {
    return [
      "ok": false,
      "code": "composer_not_found",
      "error": "未找到输入框，无法派发。请确保目标 App 窗口未最小化且在当前桌面可见。"
    ]
  }

  if isWorkBuddyBundle(bundleId) {
    // WorkBuddy Electron 须前台 + 全局 HID 事件，postToPid 无效
    ensureAppFrontmost(pid: pid, bundleId: bundleId)
  }
  let chatCountBefore = isWorkBuddyBundle(bundleId) ? countPromptInChat(pid: pid, prompt: prompt) : 0
  let fill = fillComposer(
    pid: pid,
    composer: composer,
    prompt: prompt,
    showCursor: showCursor,
    bundleId: bundleId
  )
  if !fill.ok {
    let previewEl = findBestEditableElement(pid: pid, bundleId: bundleId) ?? composer
    let hint = isWorkBuddyBundle(bundleId)
      ? "WorkBuddy 输入框异常时可点「重置输入框」后重试，并确保窗口在当前桌面可见。"
      : "请确保目标 App 窗口在当前桌面可见后重试。"
    return [
      "ok": false,
      "code": "input_not_accepted",
      "error": "输入未进入真实编辑器。\(hint)",
      "method": fill.method,
      "forceActivate": false,
      "composerPreview": String(normalizedComposerText(previewEl).prefix(80))
    ]
  }

  let activeComposer = findBestEditableElement(pid: pid, bundleId: bundleId) ?? composer
  let activeFrame = axFrame(activeComposer)

  var sendMethod = submitComposer(
    pid: pid,
    composer: activeComposer,
    composerFrame: activeFrame,
    showCursor: showCursor,
    bundleId: bundleId
  )

  usleep(isWorkBuddyBundle(bundleId) ? 450_000 : 280_000)

  if !verifyMessageSent(
    composer: activeComposer,
    prompt: prompt,
    pid: pid,
    bundleId: bundleId,
    chatCountBefore: chatCountBefore
  ), isWorkBuddyBundle(bundleId) {
    ensureAppFrontmost(pid: pid, bundleId: bundleId)
    focusWorkBuddyComposer(
      pid: pid,
      composer: activeComposer,
      composerFrame: activeFrame,
      showCursor: showCursor,
      homeComposer: isWorkBuddyHomeComposer(activeFrame),
      global: true
    )
    postKey(pid: pid, keyCode: 36, global: true)
    sendMethod += isWorkBuddyHomeComposer(activeFrame) ? "+wb_retry_home_enter" : "+wb_retry_enter"
    usleep(520_000)
  }

  if !verifyMessageSent(
    composer: activeComposer,
    prompt: prompt,
    pid: pid,
    bundleId: bundleId,
    chatCountBefore: chatCountBefore
  ) {
    let previewEl = findBestEditableElement(pid: pid, bundleId: bundleId) ?? activeComposer
    return [
      "ok": false,
      "code": "send_not_accepted",
      "error": "内容已填入但未能发送。请确认 WorkBuddy 窗口可见，且输入框未处于报错状态。",
      "method": "\(fill.method)+\(sendMethod)",
      "forceActivate": false,
      "composerPreview": String(normalizedComposerText(previewEl).prefix(80))
    ]
  }

  return [
    "ok": true,
    "method": "\(fill.method)+\(sendMethod)",
    "forceActivate": false,
    "verifiedInput": true,
    "verifiedSent": true,
    "bounds": [
      "x": activeFrame.origin.x,
      "y": activeFrame.origin.y,
      "w": activeFrame.width,
      "h": activeFrame.height
    ]
  ]
}

func dispatchPrompt(
  pid: pid_t,
  prompt: String,
  showCursor: Bool,
  bundleId: String? = nil
) -> [String: Any] {
  defer { endControlSession() }
  var result = dispatchOnce(
    pid: pid,
    prompt: prompt,
    showCursor: showCursor,
    forceActivate: false,
    bundleId: bundleId
  )
  if (result["ok"] as? Bool) == true {
    return result
  }

  let failCode = result["code"] as? String ?? ""
  // 已输入但未发送时不要整段重试（否则会重复输入 hi→hihi）
  if failCode == "send_not_accepted" {
    return result
  }

  usleep(500_000)
  result = dispatchOnce(
    pid: pid,
    prompt: prompt,
    showCursor: showCursor,
    forceActivate: false,
    bundleId: bundleId
  )
  result["retriedWithoutActivate"] = true
  return result
}

/// Tear down overlay / AppKit side effects so macOS clears the control indicator.
func endControlSession() {
  CursorOverlay.shared.hide()
  usleep(20_000)
}

func extractReplyText(fullText: String, baseline: String) -> String {
  let text = fullText.trimmingCharacters(in: .whitespacesAndNewlines)
  if baseline.isEmpty { return text }
  if text.contains(baseline), text.count > baseline.count {
    let sliced = String(text.dropFirst(baseline.count))
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !sliced.isEmpty { return sliced }
  }
  return text
}

func trimLine(_ s: String) -> String {
  s.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// 定位当前轮用户 prompt 在快照中的最后一次出现（WorkBuddy 等同屏多轮对话必需）
func findPromptAnchor(in current: [String], prompt: String) -> Int {
  let promptT = trimLine(prompt)
  if promptT.isEmpty { return -1 }

  var anchor = -1
  for (i, t) in current.enumerated() {
    let x = trimLine(t)
    if x == promptT {
      anchor = i
    } else if promptT.count >= 4, x.contains(promptT) {
      anchor = i
    }
  }
  return anchor
}

func isAppMetaLine(_ x: String) -> Bool {
  if x.isEmpty { return true }
  let metaLabels: Set<String> = [
    "WorkBuddy", "Auto", "共消耗", "内容由 AI 生成，请核实重要信息",
    "腾讯元宝提供搜索技术支持"
  ]
  if metaLabels.contains(x) { return true }
  if x.range(of: #"^\d{1,2}:\d{2}$"#, options: .regularExpression) != nil { return true }
  if x.range(of: #"^\d+(\.\d+)?$"#, options: .regularExpression) != nil { return true }
  return false
}

/// 对比派发前后文本片段，只返回新增内容（排除用户 prompt）。
func extractReplyFromSnapshots(
  current: [String],
  baseline: [String],
  prompt: String
) -> String {
  let promptT = trimLine(prompt)
  let promptAnchor = findPromptAnchor(in: current, prompt: prompt)
  let priorTexts: Set<String>
  if promptAnchor >= 0 {
    priorTexts = Set(current.prefix(promptAnchor + 1).map(trimLine))
  } else {
    priorTexts = Set(baseline.map(trimLine))
  }

  var pool = baseline
  var newSegments: [String] = []

  for (i, t) in current.enumerated() {
    if promptAnchor >= 0, i <= promptAnchor { continue }
    if let idx = pool.firstIndex(of: t) {
      pool.remove(at: idx)
      continue
    }
    newSegments.append(t)
  }

  // 同一节点内容变长（流式输出）
  for (i, t) in current.enumerated() {
    if promptAnchor >= 0, i <= promptAnchor { continue }
    for b in baseline {
      if t.count > b.count + 6, t.hasPrefix(b) {
        let ext = String(t.dropFirst(b.count)).trimmingCharacters(in: .whitespacesAndNewlines)
        if ext.count >= 2 { newSegments.append(ext) }
      }
    }
  }

  func keep(_ s: String) -> Bool {
    let x = trimLine(s)
    if x.isEmpty { return false }
    if x == promptT { return false }
    if promptT.count >= 2, x == promptT { return false }
    if isAppMetaLine(x) { return false }
    // 旧消息残留片段（如「👋，有什么可以帮你的吗？」）
    for b in baseline {
      if b == x { return false }
      if b.contains(x), x.count >= 3, x != b { return false }
    }
    // 天气卡片底部的推荐追问 chip
    if x.hasSuffix("？"), x.count <= 32, x != promptT {
      if x.contains("未来一周") || x.contains("降水概率") || x.contains("温度变化") {
        return false
      }
    }
    // 常见侧边栏/历史标题噪声
    if x.hasPrefix("自动化任务-") { return false }
    if x.hasPrefix("每日 AI") { return false }
    // 豆包等 App 的意图分类标签（非助手正文）
    let uiLabels: Set<String> = [
      "问候", "问答", "写作", "翻译", "总结", "搜索", "识图", "阅读",
      "编程", "推理", "音乐", "视频", "PPT", "文档", "表格",
      "快速", "更多", "录音转写", "帮我写作", "解题答疑",
      "AI 生成可能有误 注意核实"
    ]
    if uiLabels.contains(x) { return false }
    let suggestionChips = [
      "你都有些什么功能？",
      "你可以陪我聊天解闷吗？",
      "给我讲个笑话吧。"
    ]
    if suggestionChips.contains(x) { return false }
    return true
  }

  var seen = Set<String>()
  var uniq: [String] = []
  for s in newSegments where keep(s) {
    if seen.contains(s) { continue }
    seen.insert(s)
    uniq.append(s)
  }

  if uniq.isEmpty { return "" }

  // 只取 prompt 之后、且未在历史轮次出现过的片段（WorkBuddy 长列表关键）
  var orderedParts: [String] = []
  var usedParts = Set<String>()
  let candidates = Set(uniq)
  if promptAnchor >= 0 {
    for i in (promptAnchor + 1)..<current.count {
      let x = trimLine(current[i])
      // 滚出当前轮：遇到 prompt 之前已可见的旧气泡内容则停止
      if priorTexts.contains(x) { break }
      if !keep(x) || !candidates.contains(x) || usedParts.contains(x) { continue }
      usedParts.insert(x)
      orderedParts.append(x)
    }
  } else {
    for t in current {
      let x = trimLine(t)
      if !keep(x) || !candidates.contains(x) || usedParts.contains(x) { continue }
      usedParts.insert(x)
      orderedParts.append(x)
    }
    for s in uniq where !usedParts.contains(s) {
      orderedParts.append(s)
    }
  }

  if orderedParts.count == 1 {
    return orderedParts[0]
  }
  if orderedParts.count > 1 {
    // AX 按 Y 降序采集，卡片内多段文本需反转为阅读顺序
    return orderedParts.reversed().joined(separator: "\n")
  }

  return uniq.sorted { $0.count > $1.count }.first ?? ""
}

func parseStringArrayJSON(_ json: String) -> [String]? {
  guard let data = json.data(using: .utf8),
        let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else {
    return nil
  }
  return arr
}

func snapshotTexts(from snap: [String: Any]) -> [String] {
  if let texts = snap["texts"] as? [String] { return texts }
  return String((snap["text"] as? String) ?? "")
    .components(separatedBy: "\n---\n")
    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
}

/// 单次 poll：对比 baseline 抽取当前可见的新增回复
func pollReply(pid: pid_t, prompt: String, baseline: [String]) -> [String: Any] {
  let snap = collectTextSnapshot(pid: pid)
  let currentTexts = snapshotTexts(from: snap)
  let reply = extractReplyFromSnapshots(
    current: currentTexts,
    baseline: baseline,
    prompt: prompt
  )
  let trimmed = reply.trimmingCharacters(in: .whitespacesAndNewlines)
  return [
    "ok": true,
    "reply": trimmed,
    "changed": trimmed.count >= 2,
    "replyLength": trimmed.count,
    "textCount": currentTexts.count,
    "composerScoped": snap["composerScoped"] ?? false
  ]
}

/// Single-process lifecycle: dispatch → wait for stable reply → release control → exit.
func runTask(
  bundleId: String,
  prompt: String,
  timeoutMs: Int,
  showCursor: Bool,
  stableNeeded: Int,
  pollIntervalMs: Int
) -> [String: Any] {
  defer { endControlSession() }

  let found = findApp(bundleId: bundleId)
  guard (found["ok"] as? Bool) == true, let pidNum = found["pid"] as? Int else {
    return found
  }
  let pid = pid_t(pidNum)

  let baselineSnap = collectTextSnapshot(pid: pid)
  let baselineTexts =
    (baselineSnap["texts"] as? [String]) ??
    String((baselineSnap["text"] as? String) ?? "")
      .components(separatedBy: "\n---\n")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

  var dispatchResult = dispatchOnce(
    pid: pid,
    prompt: prompt,
    showCursor: showCursor,
    forceActivate: false
  )
  if (dispatchResult["ok"] as? Bool) != true {
    usleep(500_000)
    dispatchResult = dispatchOnce(
      pid: pid,
      prompt: prompt,
      showCursor: showCursor,
      forceActivate: false
    )
    dispatchResult["retriedWithoutActivate"] = true
  }
  guard (dispatchResult["ok"] as? Bool) == true else {
    return dispatchResult
  }

  let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
  var lastReply = ""
  var stableHits = 0
  var latestReply = ""

  while Date() < deadline {
    usleep(useconds_t(pollIntervalMs * 1000))
    let snap = collectTextSnapshot(pid: pid)
    let currentTexts =
      (snap["texts"] as? [String]) ??
      String((snap["text"] as? String) ?? "")
        .components(separatedBy: "\n---\n")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    let reply = extractReplyFromSnapshots(
      current: currentTexts,
      baseline: baselineTexts,
      prompt: prompt
    )
    latestReply = reply

    let changed = !reply.isEmpty && reply.count >= 2

    if !changed {
      stableHits = 0
      continue
    }

    if reply == lastReply, !reply.isEmpty {
      stableHits += 1
    } else {
      lastReply = reply
      stableHits = 0
    }

    if stableHits >= stableNeeded {
      return [
        "ok": true,
        "phase": "completed",
        "pid": Int(pid),
        "result": String(reply.prefix(50_000)),
        "dispatchMethod": dispatchResult["method"] ?? "unknown",
        "stableHits": stableHits
      ]
    }
  }

  if !latestReply.isEmpty {
    return [
      "ok": true,
      "phase": "completed_partial",
      "pid": Int(pid),
      "result": String(latestReply.prefix(50_000)),
      "dispatchMethod": dispatchResult["method"] ?? "unknown",
      "stableHits": stableHits,
      "warning": "回复未完全稳定，已返回当前可见内容"
    ]
  }

  return [
    "ok": false,
    "code": "timeout",
    "error": "等待目标 App 回复超时（\(timeoutMs / 1000)s）。请确认主窗口可见且已生成回复。",
    "lastText": String(latestReply.prefix(500))
  ]
}

// MARK: - Magic cursor overlay

final class CursorOverlay: NSObject {
  static let shared = CursorOverlay()
  private var window: NSWindow?
  private var arrow: NSView?

  func show(at point: CGPoint) {
    let size: CGFloat = 28
    let frame = NSRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)
    if window == nil {
      let w = NSWindow(
        contentRect: frame,
        styleMask: .borderless,
        backing: .buffered,
        defer: false
      )
      w.isOpaque = false
      w.backgroundColor = .clear
      w.level = .screenSaver
      w.ignoresMouseEvents = true
      w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
      let view = ArrowView(frame: NSRect(origin: .zero, size: frame.size))
      w.contentView = view
      arrow = view
      window = w
    } else {
      window?.setFrame(frame, display: true)
    }
    window?.orderFrontRegardless()
  }

  func move(to point: CGPoint, durationMs: Int) {
    guard let window else {
      show(at: point)
      return
    }
    let size = window.frame.size
    let target = NSRect(
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
      width: size.width,
      height: size.height
    )
    NSAnimationContext.runAnimationGroup { ctx in
      ctx.duration = Double(durationMs) / 1000.0
      ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      window.animator().setFrame(target, display: true)
    }
  }

  func hide() {
    window?.orderOut(nil)
    window = nil
    arrow = nil
  }
}

final class ArrowView: NSView {
  override func draw(_ dirtyRect: NSRect) {
    guard let ctx = NSGraphicsContext.current?.cgContext else { return }
    ctx.clear(bounds)
    let path = NSBezierPath()
    path.move(to: NSPoint(x: 4, y: bounds.height - 4))
    path.line(to: NSPoint(x: 4, y: 8))
    path.line(to: NSPoint(x: bounds.width - 6, y: 4))
    path.close()
    NSColor.systemOrange.withAlphaComponent(0.95).setFill()
    path.fill()
    NSColor.black.withAlphaComponent(0.35).setStroke()
    path.lineWidth = 1
    path.stroke()
  }
}

func flashCursor(at point: CGPoint, durationMs: Int) {
  // Convert AX top-left coords to Cocoa bottom-left for main screen
  let screenH = NSScreen.main?.frame.height ?? 900
  let cocoaY = screenH - point.y
  let cocoaPoint = CGPoint(x: point.x, y: cocoaY)

  let app = NSApplication.shared
  CursorOverlay.shared.show(at: cocoaPoint)
  let until = Date().addingTimeInterval(Double(durationMs) / 1000.0)
  while Date() < until {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
  }
  CursorOverlay.shared.hide()
  _ = app
}

func runCursorMove(x: CGFloat, y: CGFloat, durationMs: Int) -> [String: Any] {
  defer { endControlSession() }
  let screenH = NSScreen.main?.frame.height ?? 900
  let cocoaPoint = CGPoint(x: x, y: screenH - y)
  let app = NSApplication.shared
  CursorOverlay.shared.show(at: cocoaPoint)
  CursorOverlay.shared.move(to: cocoaPoint, durationMs: durationMs)
  let until = Date().addingTimeInterval(Double(max(durationMs, 200)) / 1000.0 + 0.05)
  while Date() < until {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
  }
  _ = app
  return ["ok": true, "x": x, "y": y]
}

// MARK: - CLI

func usage() -> Never {
  let text = """
  usage: mac-computer-use <command> [options]
  commands:
    check-permission
    find-app --bundle-id <id>
    find-composer --pid <pid>
    snapshot-text --pid <pid>
    dispatch --pid <pid> --prompt <text> [--no-cursor]
    poll-reply --pid <pid> --prompt <text> --baseline-json <json array>
    run-task --bundle-id <id> --prompt <text> [--timeout-ms 900000] [--stable-needed 3] [--poll-ms 2000] [--no-cursor]
    click-at --pid <pid> --x <n> --y <n>
    cursor-flash --x <n> --y <n> [--ms 450]
    cursor-move --x <n> --y <n> [--ms 350]
    cursor-hide
    control-end
  """
  fail(text, code: "usage")
}

let args = CommandLine.arguments
guard args.count >= 2 else { usage() }
let cmd = args[1]

switch cmd {
case "check-permission":
  printJSON(checkPermission())

case "find-app":
  guard let bundleId = argValue("--bundle-id") else { fail("missing --bundle-id") }
  printJSON(findApp(bundleId: bundleId))

case "find-composer":
  guard let pidStr = argValue("--pid"), let pid = Int32(pidStr) else { fail("missing --pid") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  printJSON(findComposer(pid: pid))

case "snapshot-text":
  guard let pidStr = argValue("--pid"), let pid = Int32(pidStr) else { fail("missing --pid") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  printJSON(collectTextSnapshot(pid: pid))

case "dispatch":
  guard let pidStr = argValue("--pid"), let pid = Int32(pidStr) else { fail("missing --pid") }
  guard let prompt = argValue("--prompt") else { fail("missing --prompt") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  let bundleId = argValue("--bundle-id")
  printJSON(
    dispatchPrompt(
      pid: pid,
      prompt: prompt,
      showCursor: !hasFlag("--no-cursor"),
      bundleId: bundleId
    )
  )

case "poll-reply":
  guard let pidStr = argValue("--pid"), let pid = Int32(pidStr) else { fail("missing --pid") }
  guard let prompt = argValue("--prompt") else { fail("missing --prompt") }
  guard let baselineJson = argValue("--baseline-json") else { fail("missing --baseline-json") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  guard let baseline = parseStringArrayJSON(baselineJson) else {
    fail("invalid --baseline-json, expected JSON string array")
  }
  printJSON(pollReply(pid: pid, prompt: prompt, baseline: baseline))

case "run-task":
  guard let bundleId = argValue("--bundle-id") else { fail("missing --bundle-id") }
  guard let prompt = argValue("--prompt") else { fail("missing --prompt") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  let timeoutMs = Int(argValue("--timeout-ms") ?? "900000") ?? 900_000
  let stableNeeded = Int(argValue("--stable-needed") ?? "3") ?? 3
  let pollMs = Int(argValue("--poll-ms") ?? "2000") ?? 2000
  printJSON(
    runTask(
      bundleId: bundleId,
      prompt: prompt,
      timeoutMs: timeoutMs,
      showCursor: !hasFlag("--no-cursor"),
      stableNeeded: stableNeeded,
      pollIntervalMs: pollMs
    )
  )

case "click-at":
  guard let pidStr = argValue("--pid"), let pid = Int32(pidStr) else { fail("missing --pid") }
  guard let xStr = argValue("--x"), let yStr = argValue("--y"),
        let x = Double(xStr), let y = Double(yStr) else { fail("missing --x/--y") }
  if !AXIsProcessTrusted() { fail("辅助功能未授权", code: "no_accessibility") }
  clickAt(pid: pid, x: CGFloat(x), y: CGFloat(y))
  printJSON(["ok": true])

case "cursor-flash":
  guard let xStr = argValue("--x"), let yStr = argValue("--y"),
        let x = Double(xStr), let y = Double(yStr) else { fail("missing --x/--y") }
  let ms = Int(argValue("--ms") ?? "450") ?? 450
  flashCursor(at: CGPoint(x: x, y: y), durationMs: ms)
  printJSON(["ok": true])

case "cursor-move":
  guard let xStr = argValue("--x"), let yStr = argValue("--y"),
        let x = Double(xStr), let y = Double(yStr) else { fail("missing --x/--y") }
  let ms = Int(argValue("--ms") ?? "350") ?? 350
  printJSON(runCursorMove(x: CGFloat(x), y: CGFloat(y), durationMs: ms))

case "cursor-hide":
  endControlSession()
  printJSON(["ok": true])

case "control-end":
  endControlSession()
  printJSON(["ok": true, "released": true])

default:
  usage()
}
