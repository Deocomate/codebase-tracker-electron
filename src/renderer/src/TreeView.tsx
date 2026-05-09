import { useState, type ChangeEvent } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  FileText,
  File
} from 'lucide-react'
import type { TreeData } from './types'

export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0'
  if (tokens < 1000) return tokens.toLocaleString()
  if (tokens < 1_000_000) {
    const value = tokens / 1000
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}k`
  }
  const value = tokens / 1_000_000
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`
}

interface TreeNodeProps {
  node: TreeData
  onToggle?: (path: string, isChecked: boolean) => void
  onReorder?: (newTreeData: TreeData) => void
  onAddIgnore?: (pattern: string) => void
  parentPath?: string
}

function SortableTreeNode({ 
  node, 
  onToggle, 
  onReorder,
  onAddIgnore
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const getIcon = () => {
    if (node.is_dir) {
      return expanded ? (
        <FolderOpen size={16} className="text-blue-500 shrink-0" />
      ) : (
        <Folder size={16} className="text-blue-400 shrink-0" />
      )
    }
    const ext = node.name?.split('.').pop()?.toLowerCase()
    if (['py', 'js', 'jsx', 'ts', 'tsx', 'java', 'go', 'rs', 'php', 'cpp'].includes(ext ?? '')) {
      return <FileCode2 size={15} className="text-slate-600 shrink-0" />
    }
    if (['md', 'txt', 'json', 'yml', 'yaml', 'xml'].includes(ext ?? '')) {
      return <FileText size={15} className="text-amber-600 shrink-0" />
    }
    return <File size={15} className="text-slate-400 shrink-0" />
  }

  const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    if (onToggle) onToggle(node.id, e.target.checked)
  }

  return (
    <div ref={setNodeRef} style={style} className="select-none font-medium text-textMain">
      <div
        className={`flex items-center py-0.75 pl-1 pr-2 hover:bg-[#e4e6e8] cursor-pointer transition-colors group ${
          node.is_ignored ? 'opacity-40 grayscale' : ''
        }`}
        onClick={() => node.is_dir && setExpanded(!expanded)}
        onContextMenu={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pattern = await window.api.show_tree_context_menu(node.id, node.is_dir);
          if (pattern && onAddIgnore) {
            onAddIgnore(pattern);
          }
        }}
      >
        {/* Drag handle - only visible on hover */}
        <div 
          {...attributes} 
          {...listeners} 
          className="w-5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical size={14} className="text-slate-400" />
        </div>

        <div className="w-5 flex justify-center shrink-0">
          {node.is_dir &&
            (expanded ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            ))}
        </div>

        <input
          type="checkbox"
          className="mx-1 w-3.25 h-3.25 border-slate-300 text-accent cursor-pointer shrink-0"
          checked={node.checked === 'checked'}
          ref={(el) => {
            if (el) el.indeterminate = node.checked === 'partial'
          }}
          disabled={!node.selectable || node.is_ignored}
          onChange={handleCheckboxChange}
        />

        <span className="mr-1.5 shrink-0">{getIcon()}</span>
        <span className="text-[13px] truncate flex-1 min-w-0">{node.name}</span>
        <span
          className={`ml-2 shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-slate-600 ${
            node.is_ignored ? 'opacity-75' : ''
          }`}
          title={`${node.tokens.toLocaleString()} estimated tokens`}
        >
          {formatTokenCount(node.tokens)}
        </span>
      </div>

      {expanded && node.children && node.children.length > 0 && (
        <div className="ml-3 pl-px">
          <SortableContext items={node.children.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {node.children.map((child) => (
              <SortableTreeNode 
                key={child.id} 
                node={child} 
                onToggle={onToggle}
                onReorder={onReorder}
                onAddIgnore={onAddIgnore}
                parentPath={node.id}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

interface TreeViewProps {
  data: TreeData | null
  onToggle?: (path: string, isChecked: boolean) => void
  onReorder?: (newTreeData: TreeData) => void
  onAddIgnore?: (pattern: string) => void
  emptyMessage?: string
}

export default function TreeView({ data, onToggle, onReorder, onAddIgnore, emptyMessage }: TreeViewProps) {
  const [_, setActiveId] = useState<string | null>(null)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || !data || !onReorder) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    // Helper function to reorder nodes in tree
    const reorderNodes = (node: TreeData): TreeData => {
      if (!node.children || node.children.length === 0) return node

      // Check if both active and over are children of this node
      const childIds = node.children.map(c => c.id)
      const activeIndex = childIds.indexOf(activeId)
      const overIndex = childIds.indexOf(overId)

      if (activeIndex !== -1 && overIndex !== -1) {
        // Both nodes are children of this node - reorder them
        const newChildren = arrayMove(node.children, activeIndex, overIndex)
        return { ...node, children: newChildren }
      }

      // Otherwise, recurse into children
      return {
        ...node,
        children: node.children.map(child => reorderNodes(child))
      }
    }

    const newTreeData = reorderNodes(data)
    onReorder(newTreeData)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-textMuted text-sm flex flex-col items-center gap-3">
        <Folder size={32} className="opacity-20" />
        {emptyMessage ?? 'No folder opened.'}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="pb-4">
        <SortableTreeNode 
          node={data} 
          onToggle={onToggle} 
          onReorder={onReorder}
          onAddIgnore={onAddIgnore}
        />
      </div>
    </DndContext>
  )
}
