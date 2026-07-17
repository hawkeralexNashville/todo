'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function ReorderPage() {
  const router = useRouter()
  const [items, setItems] = useState(null)
  const [buckets, setBuckets] = useState([])
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('one_off')
  const [newBucketId, setNewBucketId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  useEffect(() => {
    Promise.all([
      fetch('/api/items', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/buckets', { cache: 'no-store' }).then((r) => r.json()),
    ]).then(([ri, rb]) => {
      setItems(ri.items || [])
      setBuckets(rb.buckets || [])
    })
  }, [])

  const bucketNameById = useMemo(() => {
    const m = new Map()
    for (const b of buckets) m.set(b.id, b.name)
    return m
  }, [buckets])

  function onDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id)
      const newIndex = prev.findIndex((i) => i.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function toggleType(id, nextType) {
    // Persist immediately (a type fix is independent of the drag order).
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, type: nextType } : i)) : prev,
    )
    try {
      await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: nextType }),
      })
    } catch {
      // Revert on failure.
      setItems((prev) =>
        prev
          ? prev.map((i) =>
              i.id === id
                ? { ...i, type: nextType === 'one_off' ? 'evergreen' : 'one_off' }
                : i,
            )
          : prev,
      )
    }
  }

  async function renameItem(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const prev = items?.find((i) => i.id === id)?.name
    if (trimmed === prev) return
    setItems((list) =>
      list ? list.map((i) => (i.id === id ? { ...i, name: trimmed } : i)) : list,
    )
    try {
      await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
    } catch {
      setItems((list) =>
        list ? list.map((i) => (i.id === id ? { ...i, name: prev } : i)) : list,
      )
    }
  }

  async function addItem(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          type: newType,
          bucket_id: newBucketId,
        }),
      })
      const data = await res.json()
      if (data.item) setItems((prev) => (prev ? [...prev, data.item] : [data.item]))
    } catch {
      // ignore
    }
    setNewName('') // keep the form open to add several quickly
  }

  async function save() {
    if (busy || !items) return
    setBusy(true)
    try {
      await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: items.map((i) => i.id) }),
      })
      router.push('/')
    } catch {
      setBusy(false)
    }
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      <nav className="sticky top-0 z-10 flex items-center justify-between bg-canvas/90 px-5 py-4 backdrop-blur">
        <Link
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Cancel
        </Link>
        <Link
          href="/organize"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Organize
        </Link>
        <button
          onClick={save}
          disabled={busy || !items || items.length === 0}
          className="text-[15px] text-blue-500 transition hover:text-blue-600 disabled:opacity-30"
        >
          {busy ? 'Saving…' : 'Set'}
        </button>
      </nav>

      <div className="mx-auto w-full max-w-md px-6 pb-24 pt-6">
        {items === null ? null : items.length === 0 ? (
          <p className="mt-24 text-center text-neutral-300">No active items</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <SortableTile
                    key={item.id}
                    item={item}
                    bucketName={bucketNameById.get(item.bucket_id) || null}
                    onToggleType={toggleType}
                    onRename={renameItem}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {items !== null &&
          (adding ? (
            <form onSubmit={addItem} className="mt-3 rounded-xl bg-white p-4 shadow-sm">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setNewName('')
                  }
                }}
                placeholder="New item"
                className="w-full border-0 border-b border-neutral-200 bg-transparent pb-1 text-[16px] font-light text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <BucketChip
                  active={newBucketId === null}
                  onClick={() => setNewBucketId(null)}
                >
                  No bucket
                </BucketChip>
                {buckets.map((b) => (
                  <BucketChip
                    key={b.id}
                    active={newBucketId === b.id}
                    onClick={() => setNewBucketId(b.id)}
                  >
                    {b.name}
                  </BucketChip>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <TypeToggle type={newType} onChange={setNewType} />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!newName.trim()}
                    className="text-sm text-blue-500 transition hover:text-blue-600 disabled:opacity-30"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false)
                      setNewName('')
                    }}
                    className="text-sm text-neutral-300 transition hover:text-neutral-500"
                  >
                    Done
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-3 px-2 text-sm text-neutral-400 transition hover:text-blue-500"
            >
              + Add item
            </button>
          ))}
      </div>
    </main>
  )
}

function SortableTile({ item, bucketName, onToggleType, onRename }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) {
      onRename(item.id, trimmed)
    } else {
      setDraft(item.name)
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex select-none items-center rounded-xl bg-white py-3 pl-3 pr-3 text-neutral-800 transition-shadow ' +
        (isDragging ? 'z-10 shadow-md' : 'shadow-sm')
      }
    >
      {/* Drag handle — only this grabs the tile, so the toggle stays tappable. */}
      <button
        type="button"
        aria-label="Drag to reorder"
        className="mr-3 cursor-grab touch-none px-1 text-neutral-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripGlyph />
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(item.name)
                setEditing(false)
              }
            }}
            className="w-full border-0 border-b border-neutral-300 bg-transparent pb-0.5 text-[17px] font-light text-neutral-800 outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(item.name)
              setEditing(true)
            }}
            aria-label="Rename item"
            className="block w-full truncate text-left text-[17px] font-light"
          >
            {item.name}
          </button>
        )}
        <div className="truncate text-xs text-neutral-400">
          {bucketName || 'Uncategorized'}
        </div>
      </div>
      <TypeToggle
        type={item.type}
        onChange={(next) => onToggleType(item.id, next)}
      />
    </li>
  )
}

function TypeToggle({ type, onChange }) {
  return (
    <div className="ml-3 flex shrink-0 rounded-full bg-neutral-100 p-0.5 text-[11px]">
      <TypeOption active={type === 'one_off'} onClick={() => onChange('one_off')}>
        One-off
      </TypeOption>
      <TypeOption
        active={type === 'evergreen'}
        onClick={() => onChange('evergreen')}
      >
        Evergreen
      </TypeOption>
    </div>
  )
}

function TypeOption({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={
        'rounded-full px-2.5 py-1 transition ' +
        (active
          ? 'bg-white text-neutral-700 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-600')
      }
    >
      {children}
    </button>
  )
}

function BucketChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-sm transition ' +
        (active
          ? 'border-blue-400 bg-blue-50 text-blue-600'
          : 'border-neutral-200 text-neutral-500 hover:border-neutral-300')
      }
    >
      {children}
    </button>
  )
}

function GripGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="4" r="1" />
      <circle cx="10" cy="4" r="1" />
      <circle cx="6" cy="8" r="1" />
      <circle cx="10" cy="8" r="1" />
      <circle cx="6" cy="12" r="1" />
      <circle cx="10" cy="12" r="1" />
    </svg>
  )
}
