import { useEffect, useRef, useState } from 'react'
import { Plus, PenLine, Trash2, Check, X, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { WatchlistGroup } from '@/types'

interface Props {
  groups: WatchlistGroup[]
  selectedGroupId: number | null
  onSelectGroup: (id: number) => void
  onChanged: () => void
}

// ---- Three-dot menu ----
function GroupMenu({
  group,
  onRename,
  onDeleted,
}: {
  group: WatchlistGroup
  onRename: () => void
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDelete = async () => {
    try {
      await api.watchlist.deleteGroup(group.id)
      onDeleted()
    } catch { /* ignore */ }
    setOpen(false)
    setConfirming(false)
  }

  return (
    <div className="relative hidden shrink-0 lg:block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
          setConfirming(false)
        }}
        className="rounded-md p-1.5 text-ink-faint/40 transition-colors hover:bg-paper-2 hover:text-ink-soft"
        title="更多操作"
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-paper shadow-lg">
          {confirming ? (
            <div className="p-2.5">
              <p className="mb-2 text-[12px] text-ink">确认删除「{group.name}」？</p>
              <p className="mb-2.5 text-[11px] text-ink-faint">分组内股票将一并删除</p>
              <div className="flex gap-1.5">
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded-lg bg-red-500 py-1 text-[12px] font-medium text-white hover:bg-red-600"
                >
                  删除
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-lg border border-line py-1 text-[12px] text-ink hover:bg-paper-2"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="p-1">
              <button
                onClick={() => { setOpen(false); onRename() }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-paper-2"
              >
                <PenLine className="size-3.5 text-ink-faint" />
                重命名
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-50"
              >
                <Trash2 className="size-3.5" />
                删除分组
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Single group item ----
function GroupItem({
  group,
  active,
  onSelect,
  onChanged,
}: {
  group: WatchlistGroup
  active: boolean
  onSelect: (id: number) => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)

  const startEdit = () => {
    setEditName(group.name)
    setEditing(true)
  }

  const handleRename = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === group.name) { setEditing(false); return }
    try {
      await api.watchlist.updateGroup(group.id, { name: trimmed })
      onChanged()
    } catch { /* ignore */ }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-brand bg-paper-2/50 px-2 py-1.5">
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
        />
        <button onClick={handleRename} className="shrink-0 text-brand hover:text-brand-strong">
          <Check className="size-3" />
        </button>
        <button onClick={() => setEditing(false)} className="shrink-0 text-ink-faint hover:text-ink">
          <X className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center">
      <button
        onClick={() => onSelect(group.id)}
        className={cn(
          'flex min-w-max flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
          active
            ? 'bg-brand-soft font-medium text-brand-strong'
            : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
        )}
      >
        <span>{group.name}</span>
        <span className={cn('ml-2 shrink-0 text-[11px]', active ? 'text-brand/70' : 'text-ink-faint/60')}>
          {group.items.length}
        </span>
      </button>
      <GroupMenu group={group} onRename={startEdit} onDeleted={onChanged} />
    </div>
  )
}

// ---- New group inline input ----
function NewGroupInput({ onCreated }: { onCreated: () => void }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await api.watchlist.createGroup(trimmed)
      onCreated()
    } catch { /* ignore */ }
    setName('')
    setShow(false)
  }

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="flex min-w-max shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-ink-faint transition-colors hover:bg-paper-2 hover:text-ink"
      >
        <Plus className="size-3.5" />
        新建分组
      </button>
    )
  }

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1 rounded-lg border border-brand bg-paper-2/50 px-2 py-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreate()
          if (e.key === 'Escape') { setShow(false); setName('') }
        }}
        placeholder="分组名称…"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      <button
        onClick={handleCreate}
        disabled={!name.trim()}
        className="shrink-0 text-brand disabled:opacity-40 hover:text-brand-strong"
      >
        <Check className="size-3" />
      </button>
      <button
        onClick={() => { setShow(false); setName('') }}
        className="shrink-0 text-ink-faint hover:text-ink"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

// ---- Panel ----
export function WatchlistGroupPanel({ groups, selectedGroupId, onSelectGroup, onChanged }: Props) {
  return (
    <aside className="sticky top-0 z-40 flex min-w-0 gap-2 overflow-x-auto border-b border-line bg-cream/90 px-3 py-2 backdrop-blur lg:static lg:w-[180px] lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:border-b-0 lg:border-r lg:bg-paper/40 lg:px-3 lg:py-5 lg:backdrop-blur-none">
      <div className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint lg:block">
        自选分组
      </div>
      {groups.map((group) => (
        <GroupItem
          key={group.id}
          group={group}
          active={selectedGroupId === group.id}
          onSelect={onSelectGroup}
          onChanged={onChanged}
        />
      ))}
      <NewGroupInput onCreated={onChanged} />
    </aside>
  )
}
