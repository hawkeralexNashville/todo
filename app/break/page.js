'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const DARK = '#262626'
const BLUE = '#3b82f6'
// Neutral bricks, fading top → bottom for a little depth.
const ROW_COLORS = [
  'rgba(38,38,38,0.92)',
  'rgba(38,38,38,0.78)',
  'rgba(38,38,38,0.64)',
  'rgba(38,38,38,0.50)',
  'rgba(38,38,38,0.38)',
]
const COLS = 8
const ROWS = 5
const BEST_KEY = 'breakout_best'

export default function BreakPage() {
  const canvasRef = useRef(null)
  const [dims, setDims] = useState(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [status, setStatus] = useState('ready') // ready | playing | over

  // Load best score.
  useEffect(() => {
    setBest(Number(localStorage.getItem(BEST_KEY) || 0))
  }, [])

  // Stepping away to play shouldn't count as work time — pause a running timer.
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

  // Responsive play-field size.
  useEffect(() => {
    const compute = () => {
      const w = Math.min(window.innerWidth - 32, 440)
      const h = Math.min(window.innerHeight - 190, Math.round(w * 1.35))
      setDims({ w, h: Math.max(h, 320) })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  // The game.
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

    const R = Math.max(6, Math.round(W * 0.016))
    const paddleH = 12
    const paddleW = Math.round(W * 0.22)
    const sidePad = 12
    const topPad = 44
    const gap = 6
    const brickW = (W - 2 * sidePad - (COLS - 1) * gap) / COLS
    const brickH = 16

    const G = {
      paddleX: W / 2 - paddleW / 2,
      ball: { x: W / 2, y: H - 60, vx: 0, vy: 0 },
      bricks: [],
      lvl: 1,
      score: 0,
      lives: 3,
      status: 'ready',
      keys: { left: false, right: false },
    }

    function speedFor(lvl) {
      return H * 0.62 * Math.pow(1.08, lvl - 1) // px per second
    }

    function layoutBricks() {
      const bricks = []
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          bricks.push({
            x: sidePad + c * (brickW + gap),
            y: topPad + r * (brickH + gap),
            w: brickW,
            h: brickH,
            color: ROW_COLORS[r % ROW_COLORS.length],
            alive: true,
          })
        }
      }
      G.bricks = bricks
    }

    function restBallOnPaddle() {
      G.ball.x = G.paddleX + paddleW / 2
      G.ball.y = H - 40 - R
      G.ball.vx = 0
      G.ball.vy = 0
    }

    function launch() {
      const a = (Math.random() - 0.5) * 0.6 // small angle
      const s = speedFor(G.lvl)
      G.ball.vx = s * Math.sin(a)
      G.ball.vy = -s * Math.cos(a)
      G.status = 'playing'
      setStatus('playing')
    }

    function newGame() {
      G.lvl = 1
      G.score = 0
      G.lives = 3
      setScore(0)
      setLives(3)
      setLevel(1)
      layoutBricks()
      restBallOnPaddle()
      G.status = 'ready'
      setStatus('ready')
    }

    function nextLevel() {
      G.lvl += 1
      setLevel(G.lvl)
      layoutBricks()
      restBallOnPaddle()
      G.status = 'ready'
      setStatus('ready')
    }

    function loseLife() {
      G.lives -= 1
      setLives(G.lives)
      if (G.lives <= 0) {
        G.status = 'over'
        setStatus('over')
        const b = Number(localStorage.getItem(BEST_KEY) || 0)
        if (G.score > b) {
          localStorage.setItem(BEST_KEY, String(G.score))
          setBest(G.score)
        }
      } else {
        restBallOnPaddle()
        G.status = 'ready'
        setStatus('ready')
      }
    }

    newGame()

    // ---- input ----
    function pointerMove(e) {
      const rect = canvas.getBoundingClientRect()
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      G.paddleX = Math.max(0, Math.min(W - paddleW, x - paddleW / 2))
      if (G.status === 'ready') restBallOnPaddle()
    }
    function activate() {
      if (G.status === 'ready') launch()
      else if (G.status === 'over') newGame()
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

    // ---- loop ----
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
      // keyboard paddle
      const kv = W * 0.9 * dt
      if (G.keys.left) G.paddleX = Math.max(0, G.paddleX - kv)
      if (G.keys.right) G.paddleX = Math.min(W - paddleW, G.paddleX + kv)

      if (G.status !== 'playing') {
        if (G.status === 'ready') restBallOnPaddle()
        return
      }

      const b = G.ball
      b.x += b.vx * dt
      b.y += b.vy * dt

      // walls
      if (b.x - R < 0) { b.x = R; b.vx = Math.abs(b.vx) }
      if (b.x + R > W) { b.x = W - R; b.vx = -Math.abs(b.vx) }
      if (b.y - R < 0) { b.y = R; b.vy = Math.abs(b.vy) }

      // paddle
      const py = H - 40
      if (
        b.vy > 0 &&
        b.y + R >= py &&
        b.y - R <= py + paddleH &&
        b.x >= G.paddleX - R &&
        b.x <= G.paddleX + paddleW + R
      ) {
        const hit = (b.x - (G.paddleX + paddleW / 2)) / (paddleW / 2)
        const angle = Math.max(-1, Math.min(1, hit)) * (Math.PI / 3)
        const s = Math.hypot(b.vx, b.vy)
        b.vx = s * Math.sin(angle)
        b.vy = -Math.abs(s * Math.cos(angle))
        b.y = py - R
      }

      // bricks
      for (const br of G.bricks) {
        if (!br.alive) continue
        const cx = Math.max(br.x, Math.min(b.x, br.x + br.w))
        const cy = Math.max(br.y, Math.min(b.y, br.y + br.h))
        const dx = b.x - cx
        const dy = b.y - cy
        if (dx * dx + dy * dy <= R * R) {
          br.alive = false
          G.score += 10
          setScore(G.score)
          const oL = b.x + R - br.x
          const oR = br.x + br.w - (b.x - R)
          const oT = b.y + R - br.y
          const oB = br.y + br.h - (b.y - R)
          const m = Math.min(oL, oR, oT, oB)
          if (m === oT || m === oB) b.vy = -b.vy
          else b.vx = -b.vx
          break
        }
      }

      if (G.bricks.every((br) => !br.alive)) {
        nextLevel()
        return
      }

      // dropped
      if (b.y - R > H) loseLife()
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
      else ctx.rect(x, y, w, h)
      ctx.closePath()
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      // bricks
      for (const br of G.bricks) {
        if (!br.alive) continue
        ctx.fillStyle = br.color
        roundRect(br.x, br.y, br.w, br.h, 4)
        ctx.fill()
      }
      // paddle
      ctx.fillStyle = DARK
      roundRect(G.paddleX, H - 40, paddleW, paddleH, 6)
      ctx.fill()
      // ball
      ctx.fillStyle = BLUE
      ctx.beginPath()
      ctx.arc(G.ball.x, G.ball.y, R, 0, Math.PI * 2)
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
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Back
        </Link>
        <span className="text-xs uppercase tracking-widest text-neutral-300">
          Best {best}
        </span>
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <div className="flex w-full max-w-[440px] items-center justify-between px-1 text-xs text-neutral-400">
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
          <span className="tabular-nums">Lvl {level}</span>
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
                {status === 'over' ? 'Game over' : 'Breakout'}
              </p>
              <p className="text-[13px] text-neutral-400">
                {status === 'over'
                  ? 'Tap or press space to play again'
                  : 'Tap or press space to launch'}
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-[11px] text-neutral-300">
          Move: mouse, finger, or ← →
        </p>
      </div>
    </main>
  )
}
