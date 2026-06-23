import { useState } from 'react'
import { Plus, PenLine, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { WatchlistGroup } from '@/types'

interface Props {
  groups: WatchlistGroup[]
  selectedGroupId: number | null
  onSelectGroup: (id: number) => void
  onChanged: () => void
}

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
  const [hovering, setHovering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(group.name)

  const handleRename = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === group.name) { setEditing(false); return }
    try {
      await api.watchlist.updateGroup(group.id, { name: trimmed })
      onChanged()
    } catch { /* ignore */ }
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm(`删除"${group.name}"及其中所有股票？`)) return
    try {
      await api.watchlist.deleteGroup(group.id)
      onChanged()
    } catch { /* ignore */ }
  }

  const startEdit = () => {
    setEditName(group.name)
    setEditing(true)
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { if (!editing) setHovering(false) }}
    >
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-brand bg-paper-2/50 px-2 py-1.5">
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') { setEditing(false); setHovering(false) }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
          />
          <button onClick={handleRename} className="shrink-0 text-brand hover:text-brand-strong">
            <Check className="size-3" />
          </button>
          <button onClick={() => { setEditing(false); setHovering(false) }} className="shrink-0 text-ink-faint hover:text-ink">
            <X className="size-3" />
          </button>
        </div>
      ) : (
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
      )}

      {!editing && (
        <div className={cn(
          'flex shrink-0 gap-0.5 transition-opacity duration-150',
          hovering ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}>
          <button
            onClick={(e) => { e.stopPropagation(); startEdit() }}
            className="rounded-md p-1.5 text-ink-faint hover:bg-paper-2 hover:text-ink"
            title="重命名"
          >
            <PenLine className="size-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete() }}
            className="rounded-md p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-500"
            title="删除分组"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

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
      <button onClick={handleCreate} disabled={!name.trim()} className="shrink-0 text-brand disabled:opacity-40 hover:text-brand-strong">
        <Check className="size-3" />
      </button>
      <button onClick={() => { setShow(false); setName('') }} className="shrink-0 text-ink-faint hover:text-ink">
        <X className="size-3" />
      </button>
    </div>
  )
}

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
