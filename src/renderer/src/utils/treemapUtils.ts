import type { TreeData } from '../types'

const MODULE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#ca8a04',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#0f766e',
  '#be185d'
]

export interface TreemapNode {
  name: string
  loc: number
  path: string
  tokens: number
  isDir: boolean
  depth: number
  groupKey: string
  groupLabel: string
  color: string
  children?: TreemapNode[]
}

export interface TreemapTopItem {
  name: string
  path: string
  parentPath: string
  tokens: number
  percentage: number
  groupKey: string
  groupLabel: string
  color: string
}

export interface TreemapViewData {
  root: TreemapNode | null
  topItems: TreemapTopItem[]
  totalTokens: number
}

interface GroupMeta {
  key: string
  label: string
  color: string
}

function getPathParts(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
}

function getGroupKey(path: string): string {
  const parts = getPathParts(path)
  if (parts[0] === 'src' && parts.length > 1) return `src/${parts[1]}`
  return parts[0] ?? 'root'
}

function getGroupLabel(key: string): string {
  return key === 'root' ? 'Root files' : key
}

function buildGroupMap(root: TreeData | null): Map<string, GroupMeta> {
  const keys = new Set<string>()

  function visit(node: TreeData | null): void {
    if (!node || node.checked === 'unchecked' || node.is_ignored || node.tokens <= 0) return
    if (!node.is_dir) keys.add(getGroupKey(node.id))
    node.children.forEach(visit)
  }

  visit(root)

  return new Map(
    Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key, index) => [
        key,
        {
          key,
          label: getGroupLabel(key),
          color: MODULE_COLORS[index % MODULE_COLORS.length]
        }
      ])
  )
}

function getGroupMeta(path: string, groupMap: Map<string, GroupMeta>): GroupMeta {
  const key = getGroupKey(path)
  return (
    groupMap.get(key) ?? {
      key,
      label: getGroupLabel(key),
      color: MODULE_COLORS[0]
    }
  )
}

/**
 * Build treemap view data aggregated at the folder/module level.
 * Instead of rendering every file as a leaf node, we sum tokens per group key
 * (e.g. "src/components", "src/utils") and produce a flat list of large blocks.
 */
export function buildTreemapViewData(node: TreeData | null): TreemapViewData {
  if (!node) return { root: null, topItems: [], totalTokens: 0 }

  const groupMap = buildGroupMap(node)
  const folderTokens = new Map<string, number>()
  let totalTokens = 0

  // Recursively sum tokens for each group (folder)
  function sumTokens(currNode: TreeData): void {
    if (currNode.checked === 'unchecked' || currNode.is_ignored || currNode.tokens <= 0) return

    if (!currNode.is_dir) {
      const group = getGroupMeta(currNode.id, groupMap)
      const currentVal = folderTokens.get(group.key) || 0
      folderTokens.set(group.key, currentVal + currNode.tokens)
      totalTokens += currNode.tokens
    }

    currNode.children.forEach(sumTokens)
  }

  sumTokens(node)

  // Build flat array of folder-level nodes for treemap
  const children: TreemapNode[] = Array.from(folderTokens.entries())
    .map(([key, tokens]) => {
      const group = groupMap.get(key)!
      return {
        name: group.label,
        loc: tokens,
        path: key,
        tokens: tokens,
        isDir: true,
        depth: 1,
        groupKey: key,
        groupLabel: group.label,
        color: group.color
      }
    })
    .filter((c) => c.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)

  const root: TreemapNode = {
    name: 'Total Context',
    loc: totalTokens,
    path: 'total-context',
    tokens: totalTokens,
    isDir: true,
    depth: 0,
    groupKey: 'total-context',
    groupLabel: 'Total Context',
    color: '#000',
    children
  }

  const topItems: TreemapTopItem[] = children.slice(0, 8).map((c) => ({
    name: c.name,
    path: c.path,
    parentPath: 'total-context',
    tokens: c.tokens,
    percentage: totalTokens > 0 ? (c.tokens / totalTokens) * 100 : 0,
    groupKey: c.groupKey,
    groupLabel: c.groupLabel,
    color: c.color
  }))

  return { root, topItems, totalTokens }
}
