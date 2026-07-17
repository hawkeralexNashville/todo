'use client'

import { useEffect, useState } from 'react'
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
  const [busy, setBusy] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  useEffect(() => {
    fetch('/api/items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
  }, [])

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
                    onToggleType={toggleType}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </main>
  )
}

function SortableTile({ item, onToggleType }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      <span className="min-w-0 flex-1 truncate text-[17px] font-light">
        {item.name}
      </span>
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
