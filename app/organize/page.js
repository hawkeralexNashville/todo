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
import Modal from '@/components/Modal'
import { parseEstimate, formatDuration, elapsedSeconds } from '@/lib/time'

const PRIORITY = 'priority'
const UNCATEGORIZED = 'bucket-none'

export default function OrganizePage() {
  const [items, setItems] = useState(null)
  const [buckets, setBuckets] = useState([])
  const [activeDragId, setActiveDragId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [detailDraft, setDetailDraft] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

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

  // Right column: the queue Home follows, in order.
  const priorityItems = useMemo(
    () =>
      (items || [])
        .filter((i) => i.prioritized)
        .sort((a, b) => a.position - b.position),
    [items],
  )

  // Keep the "spent" total live if any queued item's timer is running.
  const anyRunning = priorityItems.some((i) => i.timer_started_at)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  const totalPlanned = priorityItems.reduce((s, i) => s + (i.time_estimate || 0), 0)
  const totalSpent = priorityItems.reduce((s, i) => s + elapsedSeconds(i, nowMs), 0)

  // Left column: every active item, grouped by category (nothing is removed
  // when prioritized — those tiles just turn green).
  const sections = useMemo(() => {
    const all = items || []
    const list = buckets.map((b) => ({
      key: `bucket-${b.id}`,
      bucketId: b.id,
      name: b.name,
      items: all.filter((i) => i.bucket_id === b.id),
    }))
    list.push({
      key: UNCATEGORIZED,
      bucketId: null,
      name: 'Uncategorized',
      items: all.filter((i) => i.bucket_id == null),
    })
    return list
  }, [buckets, items])

  const activeItem = useMemo(() => {
    if (!activeDragId) return null
    const id = Number(String(activeDragId).slice(2))
    return itemsById.get(id) || null
  }, [activeDragId, itemsById])

  // ---- persistence ---------------------------------------------------------

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

  function priorityIndexOf(overId) {
    const ids = priorityItems.map((i) => i.id)
    if (overId === PRIORITY) return ids.length
    if (typeof overId === 'string' && overId.startsWith('p-'))
      return ids.indexOf(Number(overId.slice(2)))
    return -1
  }

  function onDragEnd(event) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return

    const activeStr = String(active.id)
    const id = Number(activeStr.slice(2))
    const item = itemsById.get(id)
    if (!item || item.done) return // finished items are not draggable

    const overId = over.id
    const ids = priorityItems.map((i) => i.id)
    const overIsPriority =
      overId === PRIORITY ||
      (typeof overId === 'string' && overId.startsWith('p-'))

    if (activeStr.startsWith('b-')) {
      // Dragging a left (backlog) tile.
      if (overIsPriority) {
        if (item.prioritized) {
          // Already queued — reposition it.
          const from = ids.indexOf(id)
          let to = priorityIndexOf(overId)
          if (to < 0) to = ids.length - 1
          if (from >= 0 && to >= 0 && from !== to) setPriority(arrayMove(ids, from, to))
        } else {
          // Pull into the queue.
          let at = priorityIndexOf(overId)
          if (at < 0) at = ids.length
          const newIds = [...ids]
          newIds.splice(at, 0, id)
          setPriority(newIds)
        }
      } else if (overId === UNCATEGORIZED) {
        if ((item.bucket_id ?? null) !== null) patchItem(id, { bucket_id: null })
      } else if (typeof overId === 'string' && overId.startsWith('bucket-')) {
        const bucketId = Number(overId.slice(7))
        if ((item.bucket_id ?? null) !== bucketId) patchItem(id, { bucket_id: bucketId })
      }
    } else if (activeStr.startsWith('p-')) {
      // Dragging a right (priority) tile — reorder only.
      if (overIsPriority) {
        const from = ids.indexOf(id)
        let to = priorityIndexOf(overId)
        if (to < 0) to = ids.length - 1
        if (from >= 0 && to >= 0 && from !== to) setPriority(arrayMove(ids, from, to))
      }
    }
  }

  function unprioritize(id) {
    setPriority(priorityItems.map((i) => i.id).filter((x) => x !== id))
  }

  function addToPriority(id) {
    const ids = priorityItems.map((i) => i.id)
    if (ids.includes(id)) return
    setPriority([...ids, id]) // append to the bottom of the queue
  }

  // ---- item + bucket actions ----------------------------------------------

  const toggleType = (id, type) => patchItem(id, { type })
  const renameItem = (id, name) => patchItem(id, { name })
  const setEstimate = (id, seconds) => patchItem(id, { time_estimate: seconds })

  function openDetail(item) {
    setDetailItem(item)
    setDetailDraft(item.description || '')
  }

  function saveDetail() {
    if (!detailItem) return
    patchItem(detailItem.id, { description: detailDraft.trim() || null })
    setDetailItem(null)
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

  async function addItem(bucketId, name, type, timeEstimate) {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          type,
          bucket_id: bucketId,
          time_estimate: timeEstimate ?? null,
        }),
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

  async function resetToday() {
    try {
      await fetch('/api/reset', { method: 'POST' })
    } catch {
      // ignore; a retry is harmless
    }
    await load() // refetch so evergreens/skips reflect the reset
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
        <ResetControl onReset={resetToday} />
      </nav>

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-2">
        {items === null ? null : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActiveDragId(e.active.id)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* LEFT: backlog by category (everything) */}
              <div>
                <h2 className="mb-3 px-1 text-xs uppercase tracking-widest text-neutral-400">
                  Backlog
                </h2>
                <div className="flex flex-col gap-6">
                  {sections.map((sec) => (
                    <BucketSection
                      key={sec.key}
                      section={sec}
                      activeDragId={activeDragId}
                      bucketNameById={bucketNameById}
                      onAdd={(name, type, est) => addItem(sec.bucketId, name, type, est)}
                      onRenameItem={renameItem}
                      onToggleType={toggleType}
                      onSetEstimate={setEstimate}
                      onDeleteItem={deleteItem}
                      onAddToList={addToPriority}
                      onOpenDetail={openDetail}
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

                  {newOpen ? (
                    <form onSubmit={createBucket} className="flex items-center gap-3 px-1">
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
                      className="px-1 text-left text-[15px] text-blue-500 transition hover:text-blue-600"
                    >
                      + New bucket
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT: priority queue */}
              <div>
                <div className="mb-3 flex items-baseline justify-between px-1">
                  <h2 className="text-xs uppercase tracking-widest text-neutral-400">
                    Priority
                  </h2>
                  {totalPlanned > 0 ? (
                    <span className="text-xs tabular-nums text-neutral-400">
                      {formatDuration(totalSpent)} / {formatDuration(totalPlanned)}
                    </span>
                  ) : null}
                </div>
                <PriorityDroppable>
                  <SortableContext
                    items={priorityItems.map((i) => `p-${i.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {priorityItems.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-neutral-300">
                        Drag items here to queue them
                      </p>
                    ) : (
                      priorityItems.map((item) => (
                        <PriorityTile
                          key={item.id}
                          item={item}
                          bucketName={bucketNameById.get(item.bucket_id) || 'Uncategorized'}
                          onRemove={() => unprioritize(item.id)}
                        />
                      ))
                    )}
                  </SortableContext>
                </PriorityDroppable>
              </div>
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
      </div>

      <Modal open={detailItem !== null} onClose={() => setDetailItem(null)}>
        {detailItem ? (
          <div>
            <p className="mb-3 text-[15px] font-light text-neutral-800">
              {detailItem.name}
            </p>
            <textarea
              autoFocus
              rows={7}
              value={detailDraft}
              onChange={(e) => setDetailDraft(e.target.value)}
              placeholder="Add a longer description…"
              className="w-full resize-none rounded-lg border border-neutral-200 bg-transparent p-3 text-[15px] font-light text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
            />
            <div className="mt-4 flex items-center justify-end gap-4">
              <button
                onClick={() => setDetailItem(null)}
                className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={saveDetail}
                className="text-[15px] text-blue-500 transition hover:text-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </main>
  )
}

// Manual counterpart to the automatic 4 AM reset: flips today's completed
// evergreens back to undone right now. A light two-tap confirm guards
// against an accidental click undoing your progress mid-day.
function ResetControl({ onReset }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    await onReset()
    setBusy(false)
    setConfirming(false)
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-3 text-[15px]">
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="text-red-400 transition hover:text-red-500 disabled:opacity-40"
        >
          {busy ? 'Resetting…' : 'Reset?'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="text-neutral-300 transition hover:text-neutral-500"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
    >
      Reset
    </button>
  )
}

function PriorityDroppable({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: PRIORITY })
  return (
    <div
      ref={setNodeRef}
      className={
        'flex min-h-[120px] flex-col gap-2 rounded-xl p-1 transition-colors ' +
        (isOver ? 'bg-blue-50' : 'bg-neutral-50')
      }
    >
      {children}
    </div>
  )
}

function BucketSection({
  section,
  activeDragId,
  onAdd,
  onRenameItem,
  onToggleType,
  onSetEstimate,
  onDeleteItem,
  onAddToList,
  onOpenDetail,
  onDelete,
  onRename,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.key })
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.name)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('evergreen')
  const [newEstimate, setNewEstimate] = useState('')

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
    onAdd(trimmed, newType, parseEstimate(newEstimate))
    setNewName('')
    setNewEstimate('')
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            {section.name}
          </h3>
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
          'flex min-h-[48px] flex-col gap-2 rounded-xl p-1 transition-colors ' +
          (isOver ? 'bg-blue-50' : 'bg-neutral-50')
        }
      >
        {section.items.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-neutral-300">
            Drop items here
          </p>
        ) : (
          section.items.map((item) => (
            <BacklogTile
              key={item.id}
              item={item}
              dimmed={activeDragId === `b-${item.id}`}
              onRename={onRenameItem}
              onToggleType={onToggleType}
              onSetEstimate={onSetEstimate}
              onDelete={onDeleteItem}
              onAddToList={onAddToList}
              onOpenDetail={onOpenDetail}
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
          <div className="mt-2 flex items-center justify-between gap-2">
            <MiniTypeToggle type={newType} onChange={setNewType} />
            <div className="flex items-center gap-2">
              <input
                value={newEstimate}
                onChange={(e) => setNewEstimate(e.target.value)}
                placeholder="0:30"
                inputMode="numeric"
                aria-label="Time estimate"
                className="w-14 rounded-full bg-neutral-100 px-2.5 py-1 text-center text-[11px] tabular-nums text-neutral-700 outline-none placeholder:text-neutral-400"
              />
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
                  setNewEstimate('')
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

// LEFT tile: draggable. Turns light green once queued; turns solid green with
// a checkmark once completed today (read-only — editing/deleting a finished
// item belongs on the Done screen).
function BacklogTile({
  item,
  dimmed,
  onRename,
  onToggleType,
  onSetEstimate,
  onDelete,
  onAddToList,
  onOpenDetail,
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `b-${item.id}` })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const [estDraft, setEstDraft] = useState(formatDuration(item.time_estimate))
  const [confirming, setConfirming] = useState(false)

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) onRename(item.id, trimmed)
    else setDraft(item.name)
    const parsed = parseEstimate(estDraft)
    if (parsed !== (item.time_estimate ?? null)) onSetEstimate(item.id, parsed)
  }

  const estTag = formatDuration(item.time_estimate)

  if (item.done) {
    return (
      <div className="flex items-center rounded-xl bg-green-200 px-2 py-2.5 shadow-sm">
        <span className="mr-1.5 shrink-0 px-1 text-green-700" aria-hidden="true">
          <CheckGlyph />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-light text-neutral-500 line-through decoration-neutral-400">
          {item.name}
        </span>
        {estTag ? (
          <span className="ml-2 shrink-0 text-[11px] tabular-nums text-green-700">
            {estTag}
          </span>
        ) : null}
        <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-green-700">
          {item.type === 'evergreen' ? 'Evergreen' : 'One-off'}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={
        'flex items-center rounded-xl px-2 py-2.5 shadow-sm transition-colors ' +
        (item.prioritized ? 'bg-green-100' : 'bg-white') +
        (dimmed ? ' opacity-30' : '')
      }
    >
      <button
        type="button"
        aria-label="Drag"
        className="mr-1.5 shrink-0 cursor-grab touch-none px-1 text-neutral-400 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripGlyph />
      </button>

      {editing ? (
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(item.name)
                setEstDraft(formatDuration(item.time_estimate))
                setEditing(false)
              }
            }}
            className="w-full border-0 border-b border-neutral-300 bg-transparent pb-0.5 text-[15px] font-light text-neutral-800 outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <MiniTypeToggle type={item.type} onChange={(t) => onToggleType(item.id, t)} />
            <div className="flex items-center gap-2">
              <input
                value={estDraft}
                onChange={(e) => setEstDraft(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="0:30"
                inputMode="numeric"
                aria-label="Time estimate"
                className="w-14 rounded-full bg-neutral-100 px-2.5 py-1 text-center text-[11px] tabular-nums text-neutral-700 outline-none placeholder:text-neutral-400"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commit}
                className="shrink-0 text-[13px] text-blue-500 transition hover:text-blue-600"
              >
                Done
              </button>
            </div>
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
            <div className="mt-0.5 flex items-center gap-3">
              {!item.prioritized ? (
                <button
                  onClick={() => onAddToList(item.id)}
                  className="whitespace-nowrap text-[11px] text-blue-500 transition hover:text-blue-600"
                >
                  Add to list
                </button>
              ) : null}
              <button
                onClick={() => onOpenDetail(item)}
                className="whitespace-nowrap text-[11px] text-neutral-400 transition hover:text-blue-500"
              >
                {item.description ? 'Edit detail' : 'Add detail'}
              </button>
            </div>
          </div>
          {estTag ? (
            <span className="ml-2 shrink-0 text-[11px] tabular-nums text-neutral-400">
              {estTag}
            </span>
          ) : null}
          <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">
            {item.type === 'evergreen' ? 'Evergreen' : 'One-off'}
          </span>
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
                className="text-neutral-400 transition hover:text-neutral-600"
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

// RIGHT tile: sortable. Shows its category; × removes it from the queue.
// Once completed today it turns green with a checkmark and is no longer
// draggable, but × still works if you want to drop it from tomorrow's queue.
function PriorityTile({ item, bucketName, onRemove }) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } =
    useSortable({ id: `p-${item.id}`, disabled: item.done })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center rounded-xl px-2 py-2.5 shadow-sm ' +
        (item.done ? 'bg-green-200' : 'bg-white') +
        (isDragging ? ' shadow-md' : '')
      }
    >
      {item.done ? (
        <span className="mr-1.5 shrink-0 px-1 text-green-700" aria-hidden="true">
          <CheckGlyph />
        </span>
      ) : (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="mr-1.5 shrink-0 cursor-grab touch-none px-1 text-neutral-400 active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripGlyph />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={
            'truncate text-[15px] font-light ' +
            (item.done
              ? 'text-neutral-500 line-through decoration-neutral-400'
              : 'text-neutral-800')
          }
        >
          {item.name}
        </div>
        <div
          className={
            'truncate text-[11px] ' + (item.done ? 'text-green-700' : 'text-neutral-400')
          }
        >
          {bucketName}
        </div>
      </div>
      {item.time_estimate ? (
        <span
          className={
            'ml-2 shrink-0 text-[11px] tabular-nums ' +
            (item.done ? 'text-green-700' : 'text-neutral-400')
          }
        >
          {formatDuration(item.time_estimate)}
        </span>
      ) : null}
      <button
        onClick={onRemove}
        aria-label="Remove from priority"
        className="ml-2 shrink-0 text-lg leading-none text-neutral-300 transition hover:text-red-400"
      >
        ×
      </button>
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
      // Without this, clicking the button blurs the name input first, which
      // commits/closes the editor (see BacklogTile.commit) before the click
      // itself can fire — so the toggle silently does nothing.
      onMouseDown={(e) => e.preventDefault()}
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

function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
