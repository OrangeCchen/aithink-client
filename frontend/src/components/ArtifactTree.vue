<template>
  <div class="tree">
    <TreeNode
      v-for="node in nodes"
      :key="node.path"
      :node="node"
      :depth="0"
      :expanded="expanded"
      @toggle="toggle"
      @open="open"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  ref,
  watch,
  type Component,
  type PropType,
  type VNode
} from 'vue';
import type { SpaceFileEntry } from '@shared/types';

export interface TreeNodeData {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNodeData[];
}

const props = defineProps<{
  files: SpaceFileEntry[];
}>();

const emit = defineEmits<{
  open: [path: string, isDir: boolean];
}>();

const expanded = ref<Record<string, boolean>>({});

function buildTree(files: SpaceFileEntry[]): TreeNodeData[] {
  const root: TreeNodeData[] = [];
  const dirMap = new Map<string, TreeNodeData>();

  const ensureDir = (parts: string[], fullPathParts: string[]): TreeNodeData => {
    let list = root;
    let node: TreeNodeData | undefined;
    let accRel = '';
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      accRel = accRel ? `${accRel}/${name}` : name;
      let existing = list.find((n) => n.name === name && n.isDir);
      if (!existing) {
        // 尽量用后端给的绝对路径；否则用相对路径占位
        const match = files.find((f) => f.relativePath.replace(/\\/g, '/') === accRel && f.isDir);
        existing = {
          name,
          path: match?.path || fullPathParts.slice(0, i + 1).join('/') || accRel,
          isDir: true,
          children: []
        };
        list.push(existing);
        dirMap.set(accRel, existing);
      }
      node = existing;
      list = existing.children;
    }
    return node!;
  };

  // 先建目录
  const dirs = files.filter((f) => f.isDir).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const d of dirs) {
    const parts = d.relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const node = ensureDir(parts, parts);
    node.path = d.path;
  }

  // 再挂文件
  const fileEntries = files
    .filter((f) => !f.isDir)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const f of fileEntries) {
    const parts = f.relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[parts.length - 1];
    const parentParts = parts.slice(0, -1);
    let list = root;
    if (parentParts.length > 0) {
      const parent = ensureDir(parentParts, parentParts);
      list = parent.children;
    }
    if (!list.find((n) => n.name === name && !n.isDir)) {
      list.push({ name, path: f.path, isDir: false, children: [] });
    }
  }

  const sortNodes = (nodes: TreeNodeData[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });
    for (const n of nodes) {
      if (n.children.length) sortNodes(n.children);
    }
  };
  sortNodes(root);
  return root;
}

const nodes = computed(() => buildTree(props.files));

watch(
  nodes,
  (list) => {
    // 默认展开第一层目录
    for (const n of list) {
      if (n.isDir && expanded.value[n.path] === undefined) {
        expanded.value[n.path] = true;
      }
    }
  },
  { immediate: true }
);

const toggle = (path: string) => {
  expanded.value[path] = !expanded.value[path];
};

const open = (path: string, isDir: boolean) => {
  emit('open', path, isDir);
};

const TreeNode: Component = defineComponent({
  name: 'TreeNode',
  props: {
    node: { type: Object as PropType<TreeNodeData>, required: true },
    depth: { type: Number, required: true },
    expanded: { type: Object as PropType<Record<string, boolean>>, required: true }
  },
  emits: ['toggle', 'open'],
  setup(p, { emit: localEmit }) {
    return (): VNode => {
      const node = p.node;
      const isOpen = Boolean(p.expanded[node.path]);
      const pad = 8 + p.depth * 14;

      const chevron = node.isDir
        ? h(
            'button',
            {
              class: ['chevron', { open: isOpen }],
              onClick: (e: Event) => {
                e.stopPropagation();
                localEmit('toggle', node.path);
              }
            },
            [
              h(
                'svg',
                {
                  viewBox: '0 0 24 24',
                  width: 11,
                  height: 11,
                  fill: 'none',
                  stroke: 'currentColor',
                  'stroke-width': 2
                },
                [h('polyline', { points: '9 18 15 12 9 6' })]
              )
            ]
          )
        : h('span', { class: 'chevron-spacer' });

      const icon = node.isDir
        ? h(
            'svg',
            {
              class: 'file-icon',
              viewBox: '0 0 24 24',
              width: 14,
              height: 14,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 1.8
            },
            [
              h('path', {
                d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'
              })
            ]
          )
        : h(
            'svg',
            {
              class: 'file-icon',
              viewBox: '0 0 24 24',
              width: 14,
              height: 14,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 1.8
            },
            [
              h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
              h('polyline', { points: '14 2 14 8 20 8' })
            ]
          );

      const row = h(
        'div',
        {
          class: ['tree-row', { dir: node.isDir }],
          style: { paddingLeft: `${pad}px` },
          title: node.isDir
            ? `单击展开，双击打开：${node.path}`
            : `单击打开：${node.path}`,
          onClick: () => {
            if (node.isDir) {
              localEmit('toggle', node.path);
            } else {
              localEmit('open', node.path, false);
            }
          },
          onDblclick: (e: Event) => {
            e.preventDefault();
            localEmit('open', node.path, node.isDir);
          }
        },
        [chevron, icon, h('span', { class: 'file-name' }, node.name)]
      );

      const children: VNode[] =
        node.isDir && isOpen
          ? node.children.map((child) =>
              h(TreeNode, {
                key: child.path,
                node: child,
                depth: p.depth + 1,
                expanded: p.expanded,
                onToggle: (path: string) => localEmit('toggle', path),
                onOpen: (path: string, isDir: boolean) => localEmit('open', path, isDir)
              })
            )
          : [];

      return h('div', { class: 'tree-node' }, [row, ...children]);
    };
  }
});
</script>

<style scoped>
.tree {
  display: flex;
  flex-direction: column;
  padding: 4px 4px 12px;
}

:deep(.tree-row) {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px 5px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  user-select: none;
}

:deep(.tree-row:hover) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

:deep(.chevron) {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

:deep(.chevron.open) {
  transform: rotate(90deg);
}

:deep(.chevron-spacer) {
  width: 16px;
  flex-shrink: 0;
}

:deep(.file-icon) {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

:deep(.tree-row.dir .file-icon) {
  color: #ca8a04;
}

:deep(.file-name) {
  flex: 1;
  font-size: var(--font-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
