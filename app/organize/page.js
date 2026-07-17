'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
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

const PRIORITY = 'priority'
const UNCATEGORIZED = 'bucket-none'

export default function OrganizePage() {
  const [items, setItems] = useState(null)
  const [buckets, setBuckets] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')

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

  const itemsById = useMemo(() => {
    const m = new Map()
    for (const it of items || []) m.set(it.id, it)
    return m
  }, [items])

  const bucketNameById = useMemo(() => {
    const m = new Map()
    for (const b of buckets) m.set(b.id, b.name)
    return m
  }, [buckets])

  // The queue Home follows, in order.
  const priorityItems = useMemo(
    () =>
      (items || [])
        .filter((i) => i.prioritized)
        .sort((a, b) => a.position - b.position),
    [items],
  )

  // Backlog, grouped by bucket (unordered).
  const sections = useMemo(() => {
    const backlog = (items || []).filter((i) => !i.prioritized)
    const list = buckets.map((b) => ({
      key: `bucket-${b.id}`,
      bucketId: b.id,
      name: b.name,
      items: backlog.filter((i) => i.bucket_id === b.id),
    }))
    list.push({
      key: UNCATEGORIZED,
      bucketId: null,
      name: 'Uncategorized',
      items: backlog.filter((i) => i.bucket_id == null),
    })
    return list
  }, [buckets, items])

  const activeItem = activeId != null ? itemsById.get(activeId) : null

  // ---- persistence helpers -------------------------------------------------

  function setPriority(newIds) {
    setItems((prev) =>
      prev.map((it) => {
        const idx = newIds.indexOf(it.id)
        if (idx >= 0) return { ...it, prioritized: true, position: idx }
        if (it.prioritized) return { ...it, prioritized: false }
        return it
      }),
    )
    fetch('/api/priority', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: newIds }),
    }).catch(() => {})
  }

  function patchItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {})
  }

  // ---- drag ----------------------------------------------------------------

  function onDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const id = Number(active.id)
    const item = itemsById.get(id)
    if (!item) return

    const overId = over.id
    const priorityIds = priorityItems.map((i) => i.id)

    // Resolve the drop target.
    let target
    if (overId === PRIORITY) target = { kind: 'priority', overItemId: null }
    else if (overId === UNCATEGORIZED) target = { kind: 'bucket', bucketId: null }
    else if (typeof overId === 'string' && overId.startsWith('bucket-'))
      target = { kind: 'bucket', bucketId: Number(overId.slice(7)) }
    else if (typeof overId === 'number')
      target = { kind: 'priority', overItemId: overId }
    else return

    if (target.kind === 'priority') {
      if (item.prioritized) {
        const from = priorityIds.indexOf(id)
        const to =
          target.overItemId != null
            ? priorityIds.indexOf(target.overItemId)
            : priorityIds.length - 1
        if (from < 0 || to < 0 || from === to) return
        setPriority(arrayMove(priorityIds, from, to))
      } else {
        // Promote from backlog.
        const insertAt =
          target.overItemId != null
            ? priorityIds.indexOf(target.overItemId)
            : priorityIds.length
        const newIds = [...priorityIds]
        newIds.splice(insertAt < 0 ? priorityIds.length : insertAt, 0, id)
        setPriority(newIds)
      }
      return
    }

    // target.kind === 'bucket'
    if (item.prioritized) {
      // Demote to a bucket: drop from the queue and set its bucket.
      const newIds = priorityIds.filter((x) => x !== id)
      setItems((prev) =>
        prev.map((it) => {
          if (it.id === id)
            return { ...it, prioritized: false, bucket_id: target.bucketId }
          const idx = newIds.indexOf(it.id)
          if (idx >= 0) return { ...it, position: idx }
          return it
        }),
      )
      fetch('/api/priority', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: newIds }),
      }).catch(() => {})
      fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bucket_id: target.bucketId }),
      }).catch(() => {})
    } else {
      // Move between backlog buckets.
      if ((item.bucket_id ?? null) === (target.bucketId ?? null)) return
      patchItem(id, { bucket_id: target.bucketId })
    }
  }

  // ---- item + bucket actions ----------------------------------------------

  function toggleType(id, type) {
    patchItem(id, { type })
  }

  function renameItem(id, name) {
    patchItem(id, { name })
  }

  async function deleteItem(id) {
    const prev = items
    setItems((list) => (list ? list.filter((i) => i.id !== id) : list))
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
    } catch {
      setItems(prev)
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

  async function createBucket(e) {
    e.preventDefault()
    const name = newBucketName.trim()
    if (!name) return
    setNewBucketName('')
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

  function renameBucket(bucketId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    setBuckets((list) =>
      list.map((b) => (b.id === bucketId ? { ...b, name: trimmed } : b)),
    )
    fetch(`/api/buckets/${bucketId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => {})
  }

  async function deleteBucket(bucketId) {
    setBuckets((prev) => prev.filter((b) => b.id !== bucketId))
    setItems((prev) =>
      prev
        ? prev.map((i) => (i.bucket_id === bucketId ? { ...i, bucket_id: null } : i))
        : prev,
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
          Done
        </Link>
      </nav>

      <div className="mx-auto w-full max-w-md px-6 pb-24 pt-2">
        {items === null ? null : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActiveId(Number(e.active.id))}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {/* Priority queue */}
            <section className="mb-8">
              <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-neutral-800">
                Priority
              </h2>
              <PriorityDroppable>
                <SortableContext
                  items={priorityItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {priorityItems.length === 0 ? (
                    <p className="px-3 py-5 text-center text-sm text-neutral-300">
                      Drag items here to queue them
                    </p>
                  ) : (
                    priorityItems.map((item) => (
                      <PriorityTile
                        key={item.id}
                        item={item}
                        bucketName={bucketNameById.get(item.bucket_id) || 'Uncategorized'}
                        onRename={renameItem}
                        onToggleType={toggleType}
                        onDelete={deleteItem}
                      />
                    ))
                  )}
                </SortableContext>
              </PriorityDroppable>
            </section>

            <p className="mb-3 px-1 text-xs uppercase tracking-widest text-neutral-300">
              Backlog
            </p>

            <div className="flex flex-col gap-7">
              {sections.map((sec) => (
                <BucketSection
                  key={sec.key}
                  section={sec}
                  activeId={activeId}
                  onAdd={(name, type) => addItem(sec.bucketId, name, type)}
                  onRenameItem={renameItem}
                  onToggleType={toggleType}
                  onDeleteItem={deleteItem}
                  onDelete={
                    sec.bucketId != null ? () => deleteBucket(sec.bucketId) : null
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
                <div className="rounded-xl bg-white px-3 py-2.5 text-[15px] font-light text-neutral-800 shadow-md">
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
              value={newBucketName}
              onChange={(e) => setNewBucketName(e.target.value)}
              placeholder="Bucket name"
              className="flex-1 border-0 border-b border-neutral-200 bg-transparent pb-1 text-[15px] text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={!newBucketName.trim()}
              className="text-[15px] text-blue-500 disabled:opacity-30"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewOpen(false)
                setNewBucketName('')
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

function PriorityDroppable({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: PRIORITY })
  return (
    <div
      ref={setNodeRef}
      className={
        'flex min-h-[64px] flex-col gap-2 rounded-xl p-1 transition-colors ' +
        (isOver ? 'bg-blue-50' : 'bg-neutral-50')
      }
    >
      {children}
    </div>
  )
}

function BucketSection({
  section,
  activeId,
  onAdd,
  onRenameItem,
  onToggleType,
  onDeleteItem,
  onDelete,
  onRename,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.key })
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('one_off')

  function commitRename() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== section.name) onRename(trimmed)
    else setDraft(section.name)
  }

  function submitNew(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    onAdd(trimmed, newType)
    setNewName('')
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
            <BacklogTile
              key={item.id}
              item={item}
              dimmed={activeId === item.id}
              onRename={onRenameItem}
              onToggleType={onToggleType}
              onDelete={onDeleteItem}
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
            <MiniTypeToggle type={newType} onChange={setNewType} />
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

function PriorityTile({ item, bucketName, onRename, onToggleType, onDelete }) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <ItemTile
      item={item}
      bucketName={bucketName}
      innerRef={setNodeRef}
      style={style}
      dragging={isDragging}
      handleProps={{ ...listeners, ...attributes }}
      onRename={onRename}
      onToggleType={onToggleType}
      onDelete={onDelete}
    />
  )
}

function BacklogTile({ item, dimmed, onRename, onToggleType, onDelete }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: item.id })
  return (
    <ItemTile
      item={item}
      innerRef={setNodeRef}
      dimmed={dimmed}
      handleProps={{ ...listeners, ...attributes }}
      onRename={onRename}
      onToggleType={onToggleType}
      onDelete={onDelete}
    />
  )
}

// Presentational tile shared by the Priority list and the backlog buckets.
// Tapping the name opens an inline editor (name + One-off/Evergreen). The
// default view stays quiet: grip, name (+ optional bucket), delete.
function ItemTile({
  item,
  bucketName,
  innerRef,
  style,
  dragging,
  dimmed,
  handleProps,
  onRename,
  onToggleType,
  onDelete,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const [confirming, setConfirming] = useState(false)

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) onRename(item.id, trimmed)
    else setDraft(item.name)
  }

  return (
    <div
      ref={innerRef}
      style={style}
      className={
        'flex items-center rounded-xl bg-white px-2 py-2.5 shadow-sm ' +
        (dragging ? 'shadow-md ' : '') +
        (dimmed ? 'opacity-30' : '')
      }
    >
      <button
        type="button"
        aria-label="Drag"
        className="mr-1.5 shrink-0 cursor-grab touch-none px-1 text-neutral-300 active:cursor-grabbing"
        {...handleProps}
      >
        <GripGlyph />
      </button>

      {editing ? (
        <div className="min-w-0 flex-1">
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
            className="w-full border-0 border-b border-neutral-300 bg-transparent pb-0.5 text-[15px] font-light text-neutral-800 outline-none"
          />
          <div className="mt-2">
            <MiniTypeToggle
              type={item.type}
              onChange={(t) => onToggleType(item.id, t)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => {
                setDraft(item.name)
                setEditing(true)
              }}
              aria-label="Rename item"
              className="block w-full truncate text-left text-[15px] font-light text-neutral-800"
            >
              {item.name}
            </button>
            {bucketName ? (
              <div className="truncate text-[11px] text-neutral-400">
                {bucketName}
              </div>
            ) : null}
          </div>
          {item.type === 'evergreen' ? (
            <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-neutral-300">
              Evergreen
            </span>
          ) : null}
          {confirming ? (
            <span className="ml-2 flex shrink-0 items-center gap-1.5 text-xs">
              <button
                onClick={() => onDelete(item.id)}
                className="text-red-400 transition hover:text-red-500"
              >
                Del
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
              className="ml-2 shrink-0 text-neutral-300 transition hover:text-red-400"
            >
              <TrashGlyph />
            </button>
          )}
        </>
      )}
    </div>
  )
}

function MiniTypeToggle({ type, onChange }) {
  return (
    <div className="flex w-min rounded-full bg-neutral-100 p-0.5 text-[11px]">
      <MiniType active={type === 'one_off'} onClick={() => onChange('one_off')}>
        One-off
      </MiniType>
      <MiniType active={type === 'evergreen'} onClick={() => onChange('evergreen')}>
        Evergreen
      </MiniType>
    </div>
  )
}

function MiniType({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'whitespace-nowrap rounded-full px-2.5 py-1 transition ' +
        (active
          ? 'bg-white text-neutral-700 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-600')
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

function TrashGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 5h11M7 5V3.5h4V5M6 5l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
