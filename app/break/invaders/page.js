'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Leaderboard from '@/components/Leaderboard'

const DARK = '#262626'
const BLUE = '#3b82f6'
const RED = '#f87171'
const COLS = 7
const ROWS = 4

export default function InvadersPage() {
  const canvasRef = useRef(null)
  const [dims, setDims] = useState(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [status, setStatus] = useState('ready') // ready | playing | over
  const [scores, setScores] = useState(null)
  const [lastScore, setLastScore] = useState(null)

  const onOverRef = useRef(() => {})

  async function loadScores() {
    try {
      const d = await fetch('/api/scores?game=invaders', { cache: 'no-store' }).then((r) =>
        r.json(),
      )
      setScores(d.scores || [])
    } catch {
      setScores([])
    }
  }

  useEffect(() => {
    loadScores()
  }, [])

  onOverRef.current = (finalScore) => {
    setLastScore(finalScore)
    fetch('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'invaders', score: finalScore }),
    })
      .then(() => loadScores())
      .catch(() => {})
  }

  // Pause a running task timer so break time isn't counted as work.
  useEffect(() => {
    fetch('/api/items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const running = (d.items || []).find((i) => i.timer_started_at)
        if (running) {
          fetch(`/api/items/${running.id}/timer`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'pause' }),
          }).catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const compute = () => {
      const w = Math.min(window.innerWidth - 32, 420)
      const h = Math.min(window.innerHeight - 260, Math.round(w * 1.2))
      setDims({ w, h: Math.max(h, 300) })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  useEffect(() => {
    if (!dims) return
    const canvas = canvasRef.current
    if (!canvas) return
    const { w: W, h: H } = dims
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const cellW = W * 0.08
    const cellH = W * 0.055
    const gapX = W * 0.035
    const gapY = W * 0.03
    const gridW = COLS * cellW + (COLS - 1) * gapX
    const playerW = W * 0.12
    const playerH = 14
    const playerY = H - 26
    const bulletSpeed = H * 1.4
    const bombSpeed = H * 0.6
    const fireInterval = 0.36

    const G = {
      alive: [],
      blockX: (W - gridW) / 2,
      blockY: 44,
      dir: 1,
      bullets: [],
      bombs: [],
      playerX: W / 2 - playerW / 2,
      lvl: 1,
      score: 0,
      lives: 3,
      status: 'ready',
      keys: { left: false, right: false },
      fireT: 0,
    }

    const levelFactor = () => Math.pow(1.18, G.lvl - 1)

    function invaderCount() {
      let n = 0
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (G.alive[r][c]) n++
      return n
    }

    function resetWave() {
      G.alive = Array.from({ length: ROWS }, () => Array(COLS).fill(true))
      G.blockX = (W - gridW) / 2
      G.blockY = 44
      G.dir = 1
      G.bullets = []
      G.bombs = []
    }

    function newGame() {
      G.lvl = 1
      G.score = 0
      G.lives = 3
      setScore(0)
      setLives(3)
      setLevel(1)
      setLastScore(null)
      resetWave()
      G.status = 'ready'
      setStatus('ready')
    }

    function nextWave() {
      G.lvl += 1
      setLevel(G.lvl)
      resetWave()
      G.status = 'playing'
    }

    function loseLife() {
      G.lives -= 1
      setLives(G.lives)
      G.bombs = []
      if (G.lives <= 0) {
        G.status = 'over'
        setStatus('over')
        onOverRef.current(G.score)
      }
    }

    function invaderRect(r, c) {
      return {
        x: G.blockX + c * (cellW + gapX),
        y: G.blockY + r * (cellH + gapY),
        w: cellW,
        h: cellH,
      }
    }

    newGame()

    function pointerMove(e) {
      const rect = canvas.getBoundingClientRect()
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      G.playerX = Math.max(0, Math.min(W - playerW, x - playerW / 2))
    }
    function activate() {
      if (G.status === 'ready') {
        G.status = 'playing'
        setStatus('playing')
      } else if (G.status === 'over') newGame()
    }
    function onKey(e, down) {
      if (e.key === 'ArrowLeft') G.keys.left = down
      if (e.key === 'ArrowRight') G.keys.right = down
      if (down && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        activate()
      }
    }
    const kd = (e) => onKey(e, true)
    const ku = (e) => onKey(e, false)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('touchmove', pointerMove, { passive: true })
    canvas.addEventListener('pointerdown', activate)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    let raf
    let last = performance.now()
    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.033)
      last = now
      update(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }

    function update(dt) {
      const kv = W * 1.0 * dt
      if (G.keys.left) G.playerX = Math.max(0, G.playerX - kv)
      if (G.keys.right) G.playerX = Math.min(W - playerW, G.playerX + kv)

      if (G.status !== 'playing') return

      const total = ROWS * COLS
      const aliveN = invaderCount()
      const deadFrac = (total - aliveN) / total
      const speed = W * 0.09 * levelFactor() * (1 + deadFrac * 2.2)

      // move block; find alive bounds
      let minC = COLS, maxC = -1
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (G.alive[r][c]) { minC = Math.min(minC, c); maxC = Math.max(maxC, c) }
      G.blockX += G.dir * speed * dt
      const leftEdge = G.blockX + minC * (cellW + gapX)
      const rightEdge = G.blockX + maxC * (cellW + gapX) + cellW
      if (rightEdge > W - 6 && G.dir > 0) { G.dir = -1; G.blockY += cellH * 0.7 }
      else if (leftEdge < 6 && G.dir < 0) { G.dir = 1; G.blockY += cellH * 0.7 }

      // reached player?
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (G.alive[r][c] && invaderRect(r, c).y + cellH >= playerY) {
            G.lives = 0
            setLives(0)
            G.status = 'over'
            setStatus('over')
            onOverRef.current(G.score)
            return
          }

      // fire
      G.fireT += dt
      if (G.fireT >= fireInterval) {
        G.fireT = 0
        G.bullets.push({ x: G.playerX + playerW / 2, y: playerY })
      }
      for (const b of G.bullets) b.y -= bulletSpeed * dt
      G.bullets = G.bullets.filter((b) => b.y > -10)

      // bullet vs invader
      for (const b of G.bullets) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!G.alive[r][c]) continue
            const q = invaderRect(r, c)
            if (b.x >= q.x && b.x <= q.x + q.w && b.y >= q.y && b.y <= q.y + q.h) {
              G.alive[r][c] = false
              b.y = -100 // consume bullet
              G.score += 10
              setScore(G.score)
            }
          }
        }
      }
      G.bullets = G.bullets.filter((b) => b.y > -10)

      // bombs: spawn from a random alive invader
      const bombRate = 0.55 * levelFactor()
      if (aliveN > 0 && Math.random() < bombRate * dt) {
        const shooters = []
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) if (G.alive[r][c]) shooters.push([r, c])
        const [r, c] = shooters[(Math.random() * shooters.length) | 0]
        const q = invaderRect(r, c)
        G.bombs.push({ x: q.x + q.w / 2, y: q.y + q.h })
      }
      for (const bomb of G.bombs) bomb.y += bombSpeed * dt
      // bomb vs player
      for (const bomb of G.bombs) {
        if (
          bomb.y >= playerY &&
          bomb.y <= playerY + playerH &&
          bomb.x >= G.playerX &&
          bomb.x <= G.playerX + playerW
        ) {
          bomb.y = H + 100
          loseLife()
        }
      }
      G.bombs = G.bombs.filter((b) => b.y < H + 10)

      if (aliveN === 0) nextWave()
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      // invaders
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!G.alive[r][c]) continue
          const q = invaderRect(r, c)
          ctx.fillStyle = `rgba(38,38,38,${0.9 - r * 0.12})`
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(q.x, q.y, q.w, q.h, 3)
          else ctx.rect(q.x, q.y, q.w, q.h)
          ctx.fill()
        }
      }
      // bullets
      ctx.fillStyle = BLUE
      for (const b of G.bullets) ctx.fillRect(b.x - 1.5, b.y - 8, 3, 8)
      // bombs
      ctx.fillStyle = RED
      for (const bomb of G.bombs) {
        ctx.beginPath()
        ctx.arc(bomb.x, bomb.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      // player craft (triangle)
      ctx.fillStyle = DARK
      ctx.beginPath()
      ctx.moveTo(G.playerX + playerW / 2, playerY)
      ctx.lineTo(G.playerX, playerY + playerH)
      ctx.lineTo(G.playerX + playerW, playerY + playerH)
      ctx.closePath()
      ctx.fill()
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('touchmove', pointerMove)
      canvas.removeEventListener('pointerdown', activate)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [dims])

  return (
    <main className="relative flex min-h-dvh flex-col bg-canvas">
      <nav className="flex items-center justify-between px-5 py-4">
        <Link
          href="/break"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Games
        </Link>
        <span className="text-sm uppercase tracking-widest text-neutral-400">
          Space Invaders
        </span>
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-6">
        <div className="flex w-full max-w-[420px] items-center justify-between px-1 text-xs text-neutral-400">
          <span className="tabular-nums">Score {score}</span>
          <span className="flex items-center gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={
                  'h-2 w-2 rounded-full ' + (i < lives ? 'bg-blue-500' : 'bg-neutral-200')
                }
              />
            ))}
          </span>
          <span className="tabular-nums">Wave {level}</span>
        </div>

        <div className="relative touch-none select-none">
          {dims ? (
            <canvas
              ref={canvasRef}
              style={{ width: dims.w, height: dims.h }}
              className="touch-none rounded-2xl border border-neutral-200 bg-white"
            />
          ) : null}
          {status !== 'playing' ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
              <p className="text-lg font-light text-neutral-700">
                {status === 'over' ? 'Game over' : 'Space Invaders'}
              </p>
              <p className="text-[13px] text-neutral-400">
                {status === 'over'
                  ? 'Tap or press space to play again'
                  : 'Tap or press space to start'}
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-[11px] text-neutral-300">
          Move: mouse, finger, or ← →  ·  auto-fire
        </p>

        {status === 'over' && scores ? (
          <div className="mt-2 flex w-full flex-col items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-neutral-300">
              Your top scores
            </p>
            <Leaderboard scores={scores} highlight={lastScore} />
          </div>
        ) : null}
      </div>
    </main>
  )
}
