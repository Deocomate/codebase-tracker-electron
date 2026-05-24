import { useMemo, useState, type MouseEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { hierarchy, pack } from 'd3-hierarchy'
import { PieChart, Play, XCircle } from 'lucide-react'
import type { TreeData } from '../../types'
import { formatTokenCount } from '../../utils/formatTokenCount'
import { buildTreemapViewData, type TreemapNode } from '../../utils/treemapUtils'
import Card from './Card'

interface ContextTreemapProps {
  treeData: TreeData | null
  projectPath: string
  isGenerating: boolean
  progress: number
  onStart: () => void | Promise<void>
  onCancel: () => void | Promise<void>
}

interface HoveredNode {
  x: number
  y: number
  data: TreemapNode
  tokens: number
}

const PACK_VIEWBOX_SIZE = 500

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

export default function ContextTreemap({
  treeData,
  projectPath,
  isGenerating,
  progress,
  onStart,
  onCancel
}: ContextTreemapProps): ReactElement | null {
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null)

  const {
    root: clusterData,
    topItems,
    totalTokens
  } = useMemo(() => buildTreemapViewData(treeData), [treeData])

  const packedNodes = useMemo(() => {
    if (!clusterData || totalTokens <= 0) return []

    const rootHierarchy = hierarchy<TreemapNode>(clusterData)
      .sum((node) => (node.children?.length ? 0 : node.tokens || 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const packedRoot = pack<TreemapNode>().size([PACK_VIEWBOX_SIZE, PACK_VIEWBOX_SIZE]).padding(3)(
      rootHierarchy
    )

    return packedRoot.leaves()
  }, [clusterData, totalTokens])

  if (!clusterData || !clusterData.children?.length || totalTokens <= 0) return null

  const handleNodeHover = (
    event: MouseEvent<SVGCircleElement>,
    node: (typeof packedNodes)[number]
  ): void => {
    setHoveredNode({
      x: event.clientX,
      y: event.clientY,
      data: node.data,
      tokens: node.value || node.data.tokens
    })
  }

  return (
    <Card
      title={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <PieChart size={16} className="shrink-0 text-accent" />
            <span className="font-semibold text-textMain uppercase tracking-wide text-sm">
              Total Context
            </span>
            <span className="shrink-0 bg-slate-800 text-white px-2 py-0.5 text-[11px] font-mono rounded-sm">
              {formatTokenCount(totalTokens)} TOKENS
            </span>
          </span>

          <div className="flex items-center gap-2">
            {isGenerating && (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-xs font-mono text-accent">{progress}%</span>
                <div className="w-24 h-1.5 bg-gray-200 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <button
                  onClick={() => void onCancel()}
                  className="text-danger hover:text-red-700 p-1 transition"
                  title="Cancel generation"
                >
                  <XCircle size={15} />
                </button>
              </div>
            )}
            <button
              onClick={() => void onStart()}
              disabled={!projectPath || isGenerating}
              className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-white py-1.5 px-4 text-[12px] font-semibold rounded-sm transition disabled:opacity-50 shadow-sm"
            >
              {isGenerating ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
              {isGenerating ? 'PROCESSING...' : 'SCAN & GENERATE'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col overflow-visible border border-borderDark/40 rounded-sm bg-slate-50">
        <div
          className="relative flex min-h-[380px] w-full items-center justify-center overflow-visible p-6"
          onMouseLeave={() => setHoveredNode(null)}
        >
          <svg
            viewBox={`0 0 ${PACK_VIEWBOX_SIZE} ${PACK_VIEWBOX_SIZE}`}
            className="h-full max-h-[400px] w-full overflow-visible drop-shadow-sm"
            role="img"
            aria-label="Total context module token distribution"
          >
            {packedNodes.map((node) => {
              const textColor = getReadableTextColor(node.data.color)
              const showLabel = node.r >= 34
              const showTokens = node.r >= 62

              return (
                <g key={node.data.path}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={node.data.color}
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth={1}
                    className="cursor-pointer transition-all duration-300 hover:stroke-white hover:[stroke-width:3px] hover:brightness-110"
                    onMouseEnter={(event) => handleNodeHover(event, node)}
                    onMouseMove={(event) => handleNodeHover(event, node)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <title>
                      {node.data.groupLabel}: {formatTokenCount(node.value || node.data.tokens)}
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
                      style={{ backgroundColor: hoveredNode.data.color }}
                    />
                    <span className="font-bold tracking-wide">{hoveredNode.data.groupLabel}</span>
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
                      {((hoveredNode.tokens / totalTokens) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
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
