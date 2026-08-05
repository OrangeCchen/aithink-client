import { onUnmounted, ref, type Ref } from 'vue';

export type PolishMode = 'rewrite' | 'continue' | 'adjust';

export type PolishPlacement = 'top' | 'bottom';

export interface PolishAnchor {
  /** 选区水平中心（viewport） */
  x: number;
  /** 选区顶边 */
  top: number;
  /** 选区底边 */
  bottom: number;
}

export interface TextPolishSession {
  visible: boolean;
  top: number;
  left: number;
  selectedText: string;
  /** 箭头指向的原始选区 */
  anchor: PolishAnchor;
  /** 面板相对选区：bottom=在下方（箭头在面板顶），top=在上方 */
  placement: PolishPlacement;
}

/** 划词轻浮层：只读选区，不插入 mark，便于复制 */
export interface SelectionPeek {
  text: string;
  top: number;
  left: number;
  range: Range;
}

export interface UseTextPolishOptions {
  /** 划词所在的可编辑根节点 */
  getRoot: () => HTMLElement | null;
  disabled?: () => boolean;
  /** 面板预估高度，用于避让窗口底部 */
  panelHeight?: number;
  panelWidth?: number;
}

function emptyAnchor(): PolishAnchor {
  return { x: 0, top: 0, bottom: 0 };
}

function anchorFromRect(rect: DOMRect): PolishAnchor {
  return {
    x: rect.left + rect.width / 2,
    top: rect.top,
    bottom: rect.bottom
  };
}

function clampPanelPosition(
  anchor: PolishAnchor,
  panelWidth: number,
  panelHeight: number,
  margin = 12
) {
  const width = Math.min(panelWidth, window.innerWidth - margin * 2);
  const height = Math.min(panelHeight, window.innerHeight - margin * 2);

  // 水平以选区中心对齐，再夹入视口
  let left = anchor.x - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  // 优先放在选区下方（箭头朝上指向原文）；放不下则翻到上方
  let placement: PolishPlacement = 'bottom';
  let top = anchor.bottom + 10;
  if (top + height > window.innerHeight - margin) {
    const above = anchor.top - height - 10;
    if (above >= margin) {
      top = above;
      placement = 'top';
    } else {
      top = Math.max(margin, window.innerHeight - height - margin);
      // 仍根据与选区的相对位置决定箭头朝向
      placement = top + height / 2 < (anchor.top + anchor.bottom) / 2 ? 'top' : 'bottom';
    }
  }

  return { top, left, width, placement };
}

/** 轻菜单优先贴在选区上方 */
function clampMenuPosition(anchor: DOMRect, menuWidth: number, menuHeight: number, margin = 8) {
  let left = anchor.left + anchor.width / 2 - menuWidth / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
  let top = anchor.top - menuHeight - 8;
  if (top < margin) top = anchor.bottom + 8;
  top = Math.max(margin, Math.min(top, window.innerHeight - menuHeight - margin));
  return { top, left };
}

/**
 * 通用划词润色：管理选区高亮、浮层定位与替换。
 * UI 使用 QuickPolishPanel，生成逻辑由调用方注入。
 */
export function useTextPolish(options: UseTextPolishOptions) {
  const session = ref<TextPolishSession>({
    visible: false,
    top: 0,
    left: 0,
    selectedText: '',
    anchor: emptyAnchor(),
    placement: 'bottom'
  });
  let savedRange: Range | null = null;
  let peekedRange: Range | null = null;

  function clearMark(root = options.getRoot()) {
    if (!root) return;
    root.querySelectorAll('mark.polish-mark').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  /** 用 mark 固化选区高亮；跨节点选区用 extractContents，避免点击浮层后原生选区消失 */
  function markSelection(range: Range) {
    clearMark();
    const working = range.cloneRange();
    try {
      const mark = document.createElement('mark');
      mark.className = 'polish-mark';
      // surroundContents 无法处理跨元素选区；extractContents 更稳
      mark.appendChild(working.extractContents());
      working.insertNode(mark);
      const next = document.createRange();
      next.selectNodeContents(mark);
      savedRange = next;
      // 清掉原生选区，避免与 mark 叠加重影；视觉只靠 mark
      window.getSelection()?.removeAllRanges();
    } catch {
      savedRange = range.cloneRange();
    }
  }

  function close() {
    clearMark();
    savedRange = null;
    peekedRange = null;
    session.value = {
      visible: false,
      top: 0,
      left: 0,
      selectedText: '',
      anchor: emptyAnchor(),
      placement: 'bottom'
    };
  }

  function readLiveSelection(): { range: Range; text: string; rect: DOMRect } | null {
    if (options.disabled?.()) return null;
    const root = options.getRoot();
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    return { range: range.cloneRange(), text, rect: range.getBoundingClientRect() };
  }

  /**
   * 只读选区并定位轻菜单，不插入 mark、不清 Selection，保证可复制。
   */
  function peekSelection(menuWidth = 196, menuHeight = 36): SelectionPeek | null {
    const live = readLiveSelection();
    if (!live) {
      peekedRange = null;
      return null;
    }
    peekedRange = live.range;
    const pos = clampMenuPosition(live.rect, menuWidth, menuHeight);
    return {
      text: live.text,
      top: pos.top,
      left: pos.left,
      range: live.range
    };
  }

  function clearPeek() {
    peekedRange = null;
  }

  /** 用当前原生选区进入润色（会 mark） */
  function captureFromSelection(): boolean {
    const live = readLiveSelection();
    if (!live) return false;
    return beginPolishFromRange(live.range, live.text, live.rect);
  }

  /** 用 peek 保存的 Range 进入润色（点击菜单后选区可能已丢） */
  function beginPolishFromPeek(text: string, range?: Range | null): boolean {
    const target = range || peekedRange;
    if (!target || !text.trim()) return false;
    let rect: DOMRect;
    try {
      rect = target.getBoundingClientRect();
    } catch {
      return false;
    }
    return beginPolishFromRange(target, text.trim(), rect);
  }

  function beginPolishFromRange(range: Range, text: string, rect: DOMRect): boolean {
    const panelHeight = options.panelHeight ?? 340;
    const panelWidth = options.panelWidth ?? 440;
    markSelection(range);
    peekedRange = null;
    // mark 后用 mark 的真实位置作为箭头锚点（更贴近原文高亮）
    const root = options.getRoot();
    const mark = root?.querySelector('mark.polish-mark');
    const markRect = mark?.getBoundingClientRect();
    const anchor = anchorFromRect(
      markRect && markRect.width + markRect.height > 0 ? markRect : rect
    );
    const pos = clampPanelPosition(anchor, panelWidth, panelHeight);
    session.value = {
      visible: true,
      top: pos.top,
      left: pos.left,
      selectedText: text,
      anchor,
      placement: pos.placement
    };
    return true;
  }

  /**
   * 按浮层真实尺寸，相对「原始选区锚点」重新定位。
   * 箭头始终指向 anchor，而不是面板被裁切后的边缘。
   */
  function clampToViewport(panelEl: HTMLElement | null) {
    if (!panelEl || !session.value.visible) return;
    const width = panelEl.offsetWidth || panelEl.getBoundingClientRect().width;
    const height = panelEl.offsetHeight || panelEl.getBoundingClientRect().height;
    if (!width || !height) return;
    const pos = clampPanelPosition(session.value.anchor, width, height);
    if (
      pos.top !== session.value.top
      || pos.left !== session.value.left
      || pos.placement !== session.value.placement
    ) {
      session.value = {
        ...session.value,
        top: pos.top,
        left: pos.left,
        placement: pos.placement
      };
    }
  }

  function replaceWithHtml(html: string): boolean {
    const root = options.getRoot();
    const mark = root?.querySelector('mark.polish-mark');
    if (mark) {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const fragment = document.createDocumentFragment();
      while (holder.firstChild) fragment.appendChild(holder.firstChild);
      mark.replaceWith(fragment);
      savedRange = null;
      session.value = {
        visible: false,
        top: 0,
        left: 0,
        selectedText: '',
        anchor: emptyAnchor(),
        placement: 'bottom'
      };
      return true;
    }
    if (!savedRange) return false;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
    const ok = document.execCommand('insertHTML', false, html);
    close();
    return ok;
  }

  function stripMarksHtml(html: string): string {
    return html.replace(/<\/?mark[^>]*>/g, '');
  }

  onUnmounted(() => close());

  return {
    session: session as Ref<TextPolishSession>,
    peekSelection,
    clearPeek,
    captureFromSelection,
    beginPolishFromPeek,
    replaceWithHtml,
    stripMarksHtml,
    clampToViewport,
    close,
    clearMark
  };
}
