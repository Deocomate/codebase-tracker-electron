import type { TreeData } from '../types'

export type SidebarTab = 'selected' | 'ignored'

export function filterTreeByTab(node: TreeData | null, tab: SidebarTab): TreeData | null {
  if (!node) return null

  if (tab === 'selected' && node.is_ignored) {
    return null
  }

  const filteredChildren = node.children
    .map((child) => filterTreeByTab(child, tab))
    .filter((child): child is TreeData => child !== null)

  if (tab === 'ignored' && node.is_ignored) {
    return {
      ...node,
      children: filteredChildren
    }
  }

  const matchesTab = tab === 'selected'
    ? node.checked !== 'unchecked'
    : node.checked !== 'checked'

  if (!matchesTab && filteredChildren.length === 0) return null

  return {
    ...node,
    tokens: node.is_dir
      ? filteredChildren.reduce((sum, child) => sum + child.tokens, 0)
      : node.tokens,
    children: filteredChildren
  }
}

export function mergeTreeOrder(fullNode: TreeData, reorderedNode: TreeData): TreeData {
  if (!fullNode.children.length) return { ...fullNode, children: [] }

  const fullChildMap = new Map(fullNode.children.map((child) => [child.id, child]))
  const visibleChildIds = new Set(reorderedNode.children.map((child) => child.id))
  const reorderedVisibleChildren = reorderedNode.children.map((child) => {
    const fullChild = fullChildMap.get(child.id)
    return fullChild ? mergeTreeOrder(fullChild, child) : child
  })

  let visibleIndex = 0
  const mergedChildren = fullNode.children.map((child) => {
    if (!visibleChildIds.has(child.id)) return child
    const nextVisibleChild = reorderedVisibleChildren[visibleIndex]
    visibleIndex += 1
    return nextVisibleChild ?? child
  })

  return {
    ...fullNode,
    children: mergedChildren
  }
}

export function collectTreeIds(node: TreeData): string[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...collectTreeIds(child))
  }
  return ids
}

export function getFlatPathsFromTree(tree: TreeData | null): string[] {
  if (!tree) return []

  const paths: string[] = []

  function visit(node: TreeData): void {
    const normalized = node.id.replace(/\\/g, '/').replace(/^\.\//, '')
    if (normalized && normalized !== '.') {
      paths.push(node.is_dir && !normalized.endsWith('/') ? `${normalized}/` : normalized)
    }

    for (const child of node.children) {
      visit(child)
    }
  }

  visit(tree)
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b))
}
