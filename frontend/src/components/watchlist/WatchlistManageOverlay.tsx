import { useState } from 'react'
import { X, Plus, ChevronUp, ChevronDown, Trash2, PenLine, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import type { WatchlistGroup } from '@/types'

interface WatchlistManageOverlayProps {
  groups: WatchlistGroup[]
  onClose: () => void
  onChanged: () => void
}

export function WatchlistManageOverlay({
  groups,
  onClose,
  onChanged,
}: WatchlistManageOverlayProps) {
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [newGroupInput, setNewGroupInput] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  const toggleCollapse = (id: number) =>
    setCollapsed((p) => ({ ...p, [id]: !p[id] }))

  const handleRenameStart = (id: number, name: string) => {
    setEditingGroupId(id)
    setEditingName(name)
  }

  const handleRenameConfirm = async () => {
    if (editingGroupId == null || !editingName.trim()) return
    try {
      await api.watchlist.updateGroup(editingGroupId, { name: editingName.trim() })
      setEditingGroupId(null)
      onChanged()
    } catch (error) {
      console.error('Failed to rename group:', error)
    }
  }

  const handleDeleteGroup = async (id: number) => {
    if (!confirm('删除该分组将同时删除其中所有股票，确认吗？')) return
    try {
      await api.watchlist.deleteGroup(id)
      onChanged()
    } catch (error) {
      console.error('Failed to delete group:', error)
    }
  }

  const handleMoveGroupUp = async (idx: number) => {
    if (idx === 0) return
    const sorted = [...groups]
    const temp = sorted[idx - 1]
    sorted[idx - 1] = sorted[idx]
    sorted[idx] = temp
    try {
      await Promise.all(sorted.map((g, i) => api.watchlist.updateGroup(g.id, { sort_order: i })))
      onChanged()
    } catch (error) {
      console.error('Failed to reorder groups:', error)
    }
  }

  const handleMoveGroupDown = async (idx: number) => {
    if (idx === groups.length - 1) return
    const sorted = [...groups]
    const temp = sorted[idx + 1]
    sorted[idx + 1] = sorted[idx]
    sorted[idx] = temp
    try {
      await Promise.all(sorted.map((g, i) => api.watchlist.updateGroup(g.id, { sort_order: i })))
      onChanged()
    } catch (error) {
      console.error('Failed to reorder groups:', error)
    }
  }

  const handleDeleteItem = async (itemId: number) => {
    try {
      await api.watchlist.removeItem(itemId)
      onChanged()
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  const handleMoveItem = async (itemId: number, targetGroupId: number) => {
    try {
      await api.watchlist.updateItem(itemId, { group_id: targetGroupId })
      onChanged()
    } catch (error) {
      console.error('Failed to move item:', error)
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupInput.trim()) return
    try {
      await api.watchlist.createGroup(newGroupInput.trim())
      setNewGroupInput('')
      setShowNewGroup(false)
      onChanged()
    } catch (error) {
      console.error('Failed to create group:', error)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mb-auto w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[16px] font-bold text-ink">自选管理</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewGroup(true)}
            >
              <Plus className="size-3.5" />
              新建分组
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-ink-faint hover:bg-paper-2 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-4 py-4">
          {/* new group input */}
          {showNewGroup && (
            <div className="mb-4 flex gap-2 rounded-xl border border-brand bg-paper p-3">
              <input
                autoFocus
                type="text"
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                placeholder="输入新分组名称..."
                className="flex-1 bg-transparent text-[14px] text-ink focus:outline-none"
              />
              <Button
                size="sm"
                onClick={handleCreateGroup}
                disabled={!newGroupInput.trim()}
              >
                创建
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowNewGroup(false); setNewGroupInput('') }}
              >
                取消
              </Button>
            </div>
          )}

          {groups.length === 0 && !showNewGroup && (
            <p className="py-10 text-center text-sm text-ink-faint">暂无自选分组</p>
          )}

          {groups.map((group, idx) => (
            <div
              key={group.id}
              className="mb-3 overflow-hidden rounded-xl border border-line-soft bg-paper"
            >
              {/* group header */}
              <div className="flex items-center gap-1.5 px-3 py-2.5">
                <button
                  onClick={() => toggleCollapse(group.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  {editingGroupId === group.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameConfirm()
                        if (e.key === 'Escape') setEditingGroupId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-brand bg-paper-2/50 px-2 py-0.5 text-[14px] font-semibold text-ink focus:outline-none"
                    />
                  ) : (
                    <span className="text-[14px] font-semibold text-ink">{group.name}</span>
                  )}
                </button>
                <span className="shrink-0 text-[12px] text-ink-faint">
                  {group.items.length} 只
                </span>
                {editingGroupId === group.id ? (
                  <button
                    onClick={handleRenameConfirm}
                    className="rounded p-1 text-brand hover:bg-brand-soft"
                  >
                    <Check className="size-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleRenameStart(group.id, group.name)}
                    className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink"
                  >
                    <PenLine className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleMoveGroupUp(idx)}
                  disabled={idx === 0}
                  className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink disabled:opacity-30"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => handleMoveGroupDown(idx)}
                  disabled={idx === groups.length - 1}
                  className="rounded p-1 text-ink-faint hover:bg-paper-2 hover:text-ink disabled:opacity-30"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {/* items */}
              {!collapsed[group.id] &&
                group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 border-t border-line-soft px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-semibold text-ink">
                        {item.stock_name}
                      </span>
                      <span className="tnum ml-2 text-[11px] text-ink-faint">
                        {item.stock_code}
                      </span>
                      {item.industry && (
                        <span className="ml-2 text-[11px] text-ink-faint">{item.industry}</span>
                      )}
                    </div>
                    {groups.length > 1 && (
                      <Select
                        key={`${item.id}-${group.id}`}
                        onValueChange={(v) => handleMoveItem(item.id, Number(v))}
                      >
                        <SelectTrigger className="h-7 w-24 text-[12px]">
                          <SelectValue placeholder="移动到" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups
                            .filter((g) => g.id !== group.id)
                            .map((g) => (
                              <SelectItem key={g.id} value={String(g.id)}>
                                {g.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
