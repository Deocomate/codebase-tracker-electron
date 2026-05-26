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

/**
 * Build treemap view data as a deep hierarchy so the packed-circle chart can
 * drill into real folders instead of a flat module aggregate.
 */
export function buildTreemapViewData(node: TreeData | null): TreemapViewData {
  if (!node) return { root: null, topItems: [], totalTokens: 0 }

  let totalTokens = 0

  function mapNode(
    currNode: TreeData,
    depth = 0,
    inheritedGroup?: GroupMeta,
    siblingIndex = 0
  ): TreemapNode | null {
    if (currNode.checked === 'unchecked' || currNode.is_ignored) return null

    const ownGroup =
      depth === 1
        ? {
            key: getGroupKey(currNode.id),
            label: currNode.name || getGroupLabel(getGroupKey(currNode.id)),
            color: MODULE_COLORS[siblingIndex % MODULE_COLORS.length]
          }
        : inheritedGroup

    const group =
      ownGroup ?? {
        key: getGroupKey(currNode.id),
        label: getGroupLabel(getGroupKey(currNode.id)),
        color: '#000000'
      }

    if (!currNode.is_dir) {
      if (currNode.tokens <= 0) return null
      totalTokens += currNode.tokens

      return {
        name: currNode.name || currNode.id,
        loc: currNode.tokens,
        path: currNode.id,
        tokens: currNode.tokens,
        isDir: false,
        depth,
        groupKey: group.key,
        groupLabel: group.label,
        color: group.color
      }
    }

    const children = currNode.children
      .map((child, index) => mapNode(child, depth + 1, group, index))
      .filter((child): child is TreemapNode => child !== null)
      .sort((a, b) => b.tokens - a.tokens)

    if (children.length === 0) return null

    const tokens = children.reduce((sum, child) => sum + child.tokens, 0)

    return {
      name: depth === 0 ? 'Total Context' : currNode.name || currNode.id,
      loc: tokens,
      path: currNode.id,
      tokens,
      isDir: true,
      depth,
      groupKey: depth === 0 ? currNode.id : group.key,
      groupLabel: depth === 0 ? 'Total Context' : group.label,
      color: depth === 0 ? '#000000' : group.color,
      children
    }
  }

  const root = mapNode(node)

  const topItems: TreemapTopItem[] = (root?.children ?? [])
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      path: c.path,
      parentPath: root?.path ?? '.',
      tokens: c.tokens,
      percentage: totalTokens > 0 ? (c.tokens / totalTokens) * 100 : 0,
      groupKey: c.groupKey,
      groupLabel: c.groupLabel,
      color: c.color
    }))
    .sort((a, b) => b.tokens - a.tokens)

  return { root, topItems, totalTokens }
}
