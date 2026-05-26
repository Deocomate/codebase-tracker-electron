import { useEffect, useMemo, useState, type MouseEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { hierarchy, pack, type HierarchyCircularNode } from 'd3-hierarchy'
import { ChevronRight, Home, PieChart, XCircle } from 'lucide-react'
import type { TreeData } from '../../types'
import { formatTokenCount } from '../../utils/formatTokenCount'
import { buildTreemapViewData, type TreemapNode } from '../../utils/treemapUtils'
import Card from './Card'

interface ContextTreemapProps {
  treeData: TreeData | null
  projectPath: string
  onToggleNode: (path: string, isChecked: boolean) => void | Promise<void>
}

interface HoveredNode {
  x: number
  y: number
  data: TreemapNode
  tokens: number
  color: string
}

interface ContextMenuState {
  x: number
  y: number
  node: TreemapNode
}

const PACK_VIEWBOX_SIZE = 500
const VIEW_COLORS = [
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

function getReadableTextColor(color: string): string {
  const hex = color.replace('#', '')
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.58 ? '#172033' : '#ffffff'
}

function getCircleLabel(label: string, radius: number): string {
  const compactParts = label.split('/')
  const compactLabel = compactParts[compactParts.length - 1] || label
  const maxChars = Math.max(4, Math.floor(radius / 6))

  if (compactLabel.length <= maxChars) return compactLabel
  return `${compactLabel.slice(0, Math.max(1, maxChars - 3))}...`
}

function findTreemapNodeByPath(root: TreemapNode | null, path: string): TreemapNode | null {
  if (!root) return null
  if (root.path === path) return root

  for (const child of root.children ?? []) {
    const found = findTreemapNodeByPath(child, path)
    if (found) return found
  }

  return null
}

function getPathSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
}

function getBreadcrumbItems(activePath: string, rootPath: string): Array<{ label: string; path: string }> {
  const rootSegments = getPathSegments(rootPath)
  const activeSegments = getPathSegments(activePath)
  const visibleSegments =
    rootSegments.length > 0 ? activeSegments.slice(rootSegments.length) : activeSegments

  return visibleSegments.map((label, index) => {
    const pathSegments = [...rootSegments, ...visibleSegments.slice(0, index + 1)]
    const path =
      rootPath === '.'
        ? `./${pathSegments.join('/')}`
        : pathSegments.length > 0
          ? pathSegments.join('/')
          : rootPath

    return { label, path }
  })
}

function getDisplayColor(node: TreemapNode, siblingIndex: number, activePath: string, rootPath: string): string {
  if (activePath === rootPath) return node.color
  return VIEW_COLORS[siblingIndex % VIEW_COLORS.length]
}

export default function ContextTreemap({
  treeData,
  projectPath,
  onToggleNode
}: ContextTreemapProps): ReactElement | null {
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null)
  const [activePath, setActivePath] = useState('.')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const {
    root: clusterData,
    topItems,
    totalTokens
  } = useMemo(() => buildTreemapViewData(treeData), [treeData])

  useEffect(() => {
    if (!clusterData) return

    if (activePath === clusterData.path) return
    if (!findTreemapNodeByPath(clusterData, activePath)) {
      setActivePath(clusterData.path)
    }
  }, [activePath, clusterData])

  useEffect(() => {
    const handleCloseMenu = (): void => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('click', handleCloseMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', handleCloseMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const rootPath = clusterData?.path ?? '.'
  const activeRootData = useMemo(() => {
    if (!clusterData) return null
    return findTreemapNodeByPath(clusterData, activePath) ?? clusterData
  }, [activePath, clusterData])
  const activeViewTokens = activeRootData?.tokens ?? totalTokens
  const breadcrumbItems = useMemo(
    () => getBreadcrumbItems(activePath, rootPath),
    [activePath, rootPath]
  )

  const packedNodes = useMemo(() => {
    if (!activeRootData || activeViewTokens <= 0) return []

    const rootHierarchy = hierarchy<TreemapNode>(activeRootData)
      .sum((node) => (node.children?.length ? 0 : node.tokens || 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const packedRoot = pack<TreemapNode>().size([PACK_VIEWBOX_SIZE, PACK_VIEWBOX_SIZE]).padding(3)(
      rootHierarchy
    )

    return packedRoot.children ?? []
  }, [activeRootData, activeViewTokens])

  if (!clusterData || !clusterData.children?.length || totalTokens <= 0) return null

  const handleNodeHover = (
    event: MouseEvent<SVGCircleElement>,
    node: HierarchyCircularNode<TreemapNode>,
    color: string
  ): void => {
    setHoveredNode({
      x: event.clientX,
      y: event.clientY,
      data: node.data,
      tokens: node.value || node.data.tokens,
      color
    })
  }

  const handleNodeClick = (
    event: MouseEvent<SVGCircleElement>,
    node: HierarchyCircularNode<TreemapNode>
  ): void => {
    event.stopPropagation()
    setContextMenu(null)

    if (node.data.isDir && node.data.children?.length) {
      setActivePath(node.data.path)
    }
  }

  const handleContextMenu = (
    event: MouseEvent<SVGCircleElement>,
    node: HierarchyCircularNode<TreemapNode>
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, node: node.data })
  }

  const handleIgnore = async (): Promise<void> => {
    if (!contextMenu) return

    const ignoredPath = contextMenu.node.path
    setContextMenu(null)
    await onToggleNode(ignoredPath, false)
  }

  return (
    <Card
      title={
        <div className="flex w-full items-center gap-3">
          <PieChart size={16} className="shrink-0 text-accent" />
          <span className="font-semibold uppercase tracking-wide text-textMain text-sm">
            Total Context Analysis
          </span>
          <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-white">
            {formatTokenCount(totalTokens)} TOKENS
          </span>
        </div>
      }
    >
      <div className="flex flex-col overflow-visible rounded-md bg-slate-50">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-borderDark/20 bg-gray-100/70 px-4 py-2 font-mono text-[12px] text-slate-600">
          <button
            type="button"
            onClick={() => setActivePath(rootPath)}
            className={`flex items-center gap-1 font-semibold transition-colors hover:text-accent ${
              activePath === rootPath ? 'text-accent' : ''
            }`}
          >
            <Home size={14} />
            Root
          </button>

          {breadcrumbItems.map((item, index) => (
            <div key={item.path} className="flex items-center gap-1.5">
              <ChevronRight size={14} className="text-slate-400" />
              <button
                type="button"
                onClick={() => setActivePath(item.path)}
                className={`transition-colors hover:text-accent ${
                  index === breadcrumbItems.length - 1 ? 'font-bold text-accent' : ''
                }`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>

        <div
          className="relative flex min-h-[380px] w-full items-center justify-center overflow-visible p-6"
          onMouseLeave={() => setHoveredNode(null)}
        >
          <svg
            viewBox={`0 0 ${PACK_VIEWBOX_SIZE} ${PACK_VIEWBOX_SIZE}`}
            className="h-full max-h-[400px] w-full overflow-visible drop-shadow-sm"
            role="img"
            aria-label={`Total context module token distribution for ${projectPath}`}
          >
            {packedNodes.map((node, index) => {
              const displayColor = getDisplayColor(node.data, index, activePath, rootPath)
              const textColor = getReadableTextColor(displayColor)
              const showLabel = node.r >= 34
              const showTokens = node.r >= 62

              return (
                <g key={node.data.path}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={displayColor}
                    fillOpacity={1}
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1}
                    className={`transition-all duration-500 ease-out hover:stroke-white hover:[stroke-width:3px] hover:brightness-110 ${
                      node.data.isDir && node.data.children?.length
                        ? 'cursor-zoom-in'
                        : 'cursor-pointer'
                    }`}
                    onClick={(event) => handleNodeClick(event, node)}
                    onContextMenu={(event) => handleContextMenu(event, node)}
                    onMouseEnter={(event) => handleNodeHover(event, node, displayColor)}
                    onMouseMove={(event) => handleNodeHover(event, node, displayColor)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <title>
                      {node.data.path}: {formatTokenCount(node.value || node.data.tokens)}
                    </title>
                  </circle>
                  {showLabel && (
                    <text
                      x={node.x}
                      y={showTokens ? node.y - 8 : node.y + 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={textColor}
                      className="pointer-events-none select-none font-bold"
                      style={{
                        fontSize: Math.min(22, Math.max(13, node.r / 2.6)),
                        textShadow:
                          textColor === '#ffffff' ? '0 1px 2px rgba(15,23,42,0.45)' : undefined
                      }}
                    >
                      {getCircleLabel(node.data.name, node.r)}
                    </text>
                  )}
                  {showTokens && (
                    <text
                      x={node.x}
                      y={node.y + 17}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={textColor}
                      className="pointer-events-none select-none font-mono opacity-75"
                      style={{
                        fontSize: Math.min(16, Math.max(10, node.r / 4.2)),
                        textShadow:
                          textColor === '#ffffff' ? '0 1px 2px rgba(15,23,42,0.45)' : undefined
                      }}
                    >
                      {formatTokenCount(node.value || node.data.tokens)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {hoveredNode &&
            createPortal(
              <div
                className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full pb-3"
                style={{ left: hoveredNode.x, top: hoveredNode.y }}
              >
                <div className="min-w-[210px] whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-3 py-2.5 text-[12px] text-white shadow-2xl backdrop-blur-sm">
                  <div className="mb-2 flex items-center gap-2 border-b border-slate-700/80 pb-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: hoveredNode.color }}
                    />
                    <span className="max-w-[260px] truncate font-bold tracking-wide">
                      {hoveredNode.data.path}
                    </span>
                  </div>
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Tokens:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {hoveredNode.tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Share:</span>
                    <span className="font-mono font-bold text-sky-400">
                      {((hoveredNode.tokens / activeViewTokens) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {contextMenu &&
            createPortal(
              <div
                className="fixed z-[9999] min-w-[190px] rounded-md border border-borderDark bg-white py-1 text-[13px] text-textMain shadow-xl"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="max-w-[240px] truncate border-b border-borderDark/10 px-3 py-1.5 font-mono text-[11px] text-textMuted">
                  {contextMenu.node.path}
                </div>
                <button
                  type="button"
                  onClick={() => void handleIgnore()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition-colors hover:bg-red-50"
                >
                  <XCircle size={14} />
                  Unselect (Move to Ignored)
                </button>
              </div>,
              document.body
            )}
        </div>

        <div className="w-full border-t border-borderDark/20 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-textMuted">
            Legend & Top Modules
            <div className="ml-2 h-px flex-1 bg-borderDark/20" />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {topItems.map((item) => (
              <div key={item.path} className="group flex min-w-[120px] items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full shadow-sm transition-transform group-hover:scale-125"
                  style={{ backgroundColor: item.color }}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[12px] font-semibold leading-none text-textMain mb-1">
                    {item.name}
                  </span>
                  <span className="font-mono text-[10px] font-medium leading-none text-textMuted">
                    {formatTokenCount(item.tokens)} ({item.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
