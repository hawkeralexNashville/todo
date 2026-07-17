'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

const UNCATEGORIZED = 'sec-none'

export default function OrganizePage() {
  const [items, setItems] = useState(null)
  const [buckets, setBuckets] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [ri, rb] = await Promise.all([
      fetch('/api/items', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/buckets', { cache: 'no-store' }).then((r) => r.json()),
    ])
    setItems(ri.items || [])
    setBuckets(rb.buckets || [])
  }

  // One section per bucket, plus an Uncategorized section at the end.
  const sections = useMemo(() => {
    const list = buckets.map((b) => ({
      key: `sec-${b.id}`,
      bucketId: b.id,
      name: b.name,
      items: (items || []).filter((i) => i.bucket_id === b.id),
    }))
    list.push({
      key: UNCATEGORIZED,
      bucketId: null,
      name: 'Uncategorized',
      items: (items || []).filter((i) => i.bucket_id == null),
    })
    return list
  }, [buckets, items])

  const activeItem =
    activeId != null ? (items || []).find((i) => i.id === activeId) : null

  async function onDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const itemId = active.id
    const newBucketId =
      over.id === UNCATEGORIZED ? null : Number(String(over.id).slice(4))

    const item = (items || []).find((i) => i.id === itemId)
    if (!item) return
    if ((item.bucket_id ?? null) === (newBucketId ?? null)) return

    const prevBucketId = item.bucket_id ?? null
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, bucket_id: newBucketId } : i)),
    )
    try {
      await fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bucket_id: newBucketId }),
      })
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, bucket_id: prevBucketId } : i,
        ),
      )
    }
  }

  async function createBucket(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setNewName('')
    setNewOpen(false)
    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.bucket) setBuckets((prev) => [...prev, data.bucket])
    } catch {
      // ignore
    }
  }

  async function deleteItem(id) {
    const prev = items
    setItems((list) => (list ? list.filter((i) => i.id !== id) : list))
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
    } catch {
      setItems(prev) // restore on failure
    }
  }

  async function addItem(bucketId, name, type) {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, type, bucket_id: bucketId }),
      })
      const data = await res.json()
      if (data.item) setItems((prev) => (prev ? [...prev, data.item] : [data.item]))
    } catch {
      // ignore
    }
  }

  async function renameBucket(bucketId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const prev = buckets.find((b) => b.id === bucketId)?.name
    setBuckets((list) =>
      list.map((b) => (b.id === bucketId ? { ...b, name: trimmed } : b)),
    )
    try {
      await fetch(`/api/buckets/${bucketId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
    } catch {
      setBuckets((list) =>
        list.map((b) => (b.id === bucketId ? { ...b, name: prev } : b)),
      )
    }
  }

  async function deleteBucket(bucketId) {
    setBuckets((prev) => prev.filter((b) => b.id !== bucketId))
    setItems((prev) =>
      prev ? prev.map((i) => (i.bucket_id === bucketId ? { ...i, bucket_id: null } : i)) : prev,
    )
    try {
      await fetch(`/api/buckets/${bucketId}`, { method: 'DELETE' })
    } catch {
      // ignore
    }
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      <nav className="sticky top-0 z-10 flex items-center justify-between bg-canvas/90 px-5 py-4 backdrop-blur">
        <Link
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Back
        </Link>
        <Link
          href="/reorder"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Priority
        </Link>
      </nav>

      <div className="mx-auto w-full max-w-md px-6 pb-24 pt-2">
        {items === null ? null : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex flex-col gap-7">
              {sections.map((sec) => (
                <BucketSection
                  key={sec.key}
                  section={sec}
                  activeId={activeId}
                  onAdd={(name, type) => addItem(sec.bucketId, name, type)}
                  onDeleteItem={deleteItem}
                  onDelete={
                    sec.bucketId != null
                      ? () => deleteBucket(sec.bucketId)
                      : null
                  }
                  onRename={
                    sec.bucketId != null
                      ? (name) => renameBucket(sec.bucketId, name)
                      : null
                  }
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? (
                <div className="rounded-xl bg-white px-4 py-3 text-[16px] font-light text-neutral-800 shadow-md">
                  {activeItem.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {newOpen ? (
          <form onSubmit={createBucket} className="mt-8 flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Bucket name"
              className="flex-1 border-0 border-b border-neutral-200 bg-transparent pb-1 text-[15px] text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="text-[15px] text-blue-500 disabled:opacity-30"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewOpen(false)
                setNewName('')
              }}
              className="text-[15px] text-neutral-300"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setNewOpen(true)}
            className="mt-8 text-[15px] text-blue-500 transition hover:text-blue-600"
          >
            + New bucket
          </button>
        )}
      </div>
    </main>
  )
}

function BucketSection({ section, activeId, onAdd, onDeleteItem, onDelete, onRename }) {
  const { setNodeRef, isOver } = useDroppable({ id: section.key })
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('one_off')

  function submitNew(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    onAdd(trimmed, newType)
    setNewName('') // keep the form open to add several quickly
  }

  function commitRename() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== section.name) {
      onRename(trimmed)
    } else {
      setDraft(section.name)
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        {editing && onRename ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraft(section.name)
                setEditing(false)
              }
            }}
            className="w-48 border-0 border-b border-neutral-300 bg-transparent pb-0.5 text-sm font-semibold uppercase tracking-wide text-neutral-800 outline-none"
          />
        ) : onRename ? (
          <button
            onClick={() => {
              setDraft(section.name)
              setEditing(true)
            }}
            aria-label={`Rename ${section.name}`}
            className="text-sm font-semibold uppercase tracking-wide text-neutral-800 transition hover:text-blue-500"
          >
            {section.name}
          </button>
        ) : (
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            {section.name}
          </h2>
        )}
        {onDelete ? (
          confirming ? (
            <span className="flex items-center gap-3 text-xs">
              <button
                onClick={onDelete}
                className="text-red-400 transition hover:text-red-500"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-neutral-300 transition hover:text-neutral-500"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              aria-label="Delete bucket"
              className="text-lg leading-none text-neutral-300 transition hover:text-red-400"
            >
              ×
            </button>
          )
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        className={
          'flex min-h-[52px] flex-col gap-2 rounded-xl p-1 transition-colors ' +
          (isOver ? 'bg-blue-50' : 'bg-neutral-50')
        }
      >
        {section.items.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-neutral-300">
            Drag items here
          </p>
        ) : (
          section.items.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              dimmed={activeId === item.id}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))
        )}
      </div>

      {adding ? (
        <form onSubmit={submitNew} className="mt-2 px-1">
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
            className="w-full border-0 border-b border-neutral-200 bg-transparent pb-1 text-[15px] font-light text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex rounded-full bg-neutral-100 p-0.5 text-[11px]">
              <MiniType
                active={newType === 'one_off'}
                onClick={() => setNewType('one_off')}
              >
                One-off
              </MiniType>
              <MiniType
                active={newType === 'evergreen'}
                onClick={() => setNewType('evergreen')}
              >
                Evergreen
              </MiniType>
            </div>
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
          className="mt-2 px-2 text-sm text-neutral-400 transition hover:text-blue-500"
        >
          + Add item
        </button>
      )}
    </section>
  )
}

function MiniType({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

function DraggableItem({ item, dimmed, onDelete }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: item.id })
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      ref={setNodeRef}
      className={
        'flex select-none items-center rounded-xl bg-white px-3 py-3 text-[16px] font-light text-neutral-800 shadow-sm ' +
        (dimmed ? 'opacity-30' : '')
      }
    >
      {/* Drag handle — only this grabs the tile, so delete stays tappable. */}
      <button
        type="button"
        aria-label="Drag to a bucket"
        className="mr-2 cursor-grab touch-none px-1 text-neutral-300 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripGlyph />
      </button>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {item.type === 'evergreen' ? (
        <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-300">
          Evergreen
        </span>
      ) : null}
      {confirming ? (
        <span className="ml-3 flex items-center gap-2 text-xs">
          <button
            onClick={onDelete}
            className="text-red-400 transition hover:text-red-500"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-neutral-300 transition hover:text-neutral-500"
          >
            No
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete item"
          className="ml-3 text-neutral-300 transition hover:text-red-400"
        >
          <TrashGlyph />
        </button>
      )}
    </div>
  )
}

function TrashGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 5h11M7 5V3.5h4V5M6 5l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
