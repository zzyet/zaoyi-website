import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { motion, useTransform, useInView, useMotionValue, useSpring } from 'framer-motion'

// ─── Theme Context ──────────────────────────────────────────────────────────
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })

function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }) {
  const systemTheme = () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  const [theme, setTheme] = useState(() => {
    if (localStorage.getItem('zaoyi-theme-manual') === '1') {
      const saved = localStorage.getItem('zaoyi-theme')
      if (saved === 'light' || saved === 'dark') return saved
    }
    return systemTheme()
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    if (localStorage.getItem('zaoyi-theme-manual') === '1') {
      localStorage.setItem('zaoyi-theme', theme)
    }
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      if (localStorage.getItem('zaoyi-theme-manual') === '1') return
      setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = () => {
    localStorage.setItem('zaoyi-theme-manual', '1')
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('zaoyi-theme', next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Dot Grid + Water Ripple Background ─────────────────────────────────────
// Desktop: mouse path + click ripples, continuous RAF.
// Mobile: grid hidden by default; tap reveals denser dots + a strong water-drop
// ripple, then fades the grid away and stops RAF.
function VBCodeBackground() {
  const canvasRef = useRef(null)
  const ripplesRef = useRef([])
  const mouseRef = useRef({ x: -9999, y: -9999, lastX: -9999, lastY: -9999, lastSpawn: 0 })
  const dotsRef = useRef([])
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      canvas.style.display = 'none'
      return
    }

    const isCoarse =
      window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(pointer: coarse)').matches

    const ctx = canvas.getContext('2d', { alpha: true })
    // Mobile: denser grid; springier, sharper rings for a livelier water feel
    const GAP = isCoarse ? 15 : 24
    const DOT_RADIUS = isCoarse ? 1.6 : 1.55
    const WAVE_SPEED = isCoarse ? 235 : 360
    const WAVE_AMPLITUDE = isCoarse ? 30 : 21
    const WAVE_LENGTH = isCoarse ? 120 : 150
    const WAVE_ENVELOPE = WAVE_LENGTH * (isCoarse ? 1.45 : 1.75)
    const WAVE_LIFETIME = isCoarse ? 2450 : 2700
    const SPAWN_GAP = 28
    const SPAWN_INTERVAL = 28
    const HOVER_RADIUS = 170
    const HOVER_STRENGTH = 2.5
    const SPRING = isCoarse ? 0.17 : 0.2
    const DAMPING = isCoarse ? 0.78 : 0.74
    const MAX_RIPPLES = isCoarse ? 10 : 18
    const TAP_STRENGTH = 2.05
    const TAP_CLICK_DEBOUNCE = 420
    // Per-dot visibility: charge when the ring hits, then each dot fades on its own.
    // Mobile fades in gently (bloom) instead of snapping to full brightness.
    const LIT_IN = isCoarse ? 0.4 : 0.7
    const LIT_OUT = 0.13
    const GLOW_FOLLOW = isCoarse ? 0.26 : 0.26
    const TANGENT_MIX = isCoarse ? 0.28 : 0.14 // slight swirl so motion feels less radial-only
    // Wave crest harmonics — mobile uses a softer blend (less high-frequency
    // texture) so the ring reads as one smooth pulse instead of a busy ripple.
    const HARMONIC_1 = isCoarse ? 0.82 : 0.72
    const HARMONIC_2 = isCoarse ? 0.15 : 0.22
    const HARMONIC_3 = isCoarse ? 0.03 : 0.06
    const TWO_PI = Math.PI * 2
    const INV_WAVE_LENGTH = 1 / WAVE_LENGTH
    const ENVELOPE_SIGMA2 = 2 * (WAVE_ENVELOPE / 2.6) ** 2

    let width = 0, height = 0, dpr = 1
    let lastFrame = performance.now()
    let drawing = false
    let lastTapSpawn = 0
    let colorCache = { theme: '', baseAlpha: 0.07, peakAlpha: 0.24, rgb: '124,110,190' }

    const getColors = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'light'
      if (colorCache.theme === theme) return colorCache
      const isDark = theme === 'dark'
      colorCache = {
        theme,
        baseAlpha: isCoarse ? (isDark ? 0.2 : 0.14) : (isDark ? 0.1 : 0.07),
        peakAlpha: isCoarse ? (isDark ? 0.55 : 0.46) : (isDark ? 0.28 : 0.24),
        rgb: isDark ? '168,155,220' : '124,110,190',
      }
      return colorCache
    }

    const buildDots = () => {
      const cols = Math.ceil(width / GAP) + 2
      const rows = Math.ceil(height / GAP) + 2
      const offsetX = (width - (cols - 1) * GAP) / 2
      const offsetY = (height - (rows - 1) * GAP) / 2
      const dots = []
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dots.push({
            x: offsetX + col * GAP,
            y: offsetY + row * GAP,
            dx: 0,
            dy: 0,
            vx: 0,
            vy: 0,
            glow: 0,
            lit: 0,
          })
        }
      }
      dotsRef.current = dots
    }

    const clearCanvas = () => {
      ctx.clearRect(0, 0, width, height)
    }

    const resetDotsRest = () => {
      const dots = dotsRef.current
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i]
        dot.dx = 0
        dot.dy = 0
        dot.vx = 0
        dot.vy = 0
        dot.glow = 0
        dot.lit = 0
      }
    }

    const spawnRipple = (x, y, strength = 1, bornOffset = 0) => {
      ripplesRef.current.push({ x, y, born: performance.now() + bornOffset, strength })
      while (ripplesRef.current.length > MAX_RIPPLES) {
        ripplesRef.current.shift()
      }
    }

    // Primary drop + a softer trailing ring (mobile water echo)
    const spawnTapRipplePair = (x, y) => {
      spawnRipple(x, y, TAP_STRENGTH, 0)
      if (isCoarse) spawnRipple(x, y, TAP_STRENGTH * 0.42, 110)
    }

    const easeOutCubic = (t) => 1 - (1 - t) ** 3

    const draw = (now) => {
      const dt = Math.min(32, now - lastFrame) / 16.67
      lastFrame = now
      ctx.clearRect(0, 0, width, height)

      const ripples = ripplesRef.current
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (now - ripples[i].born > WAVE_LIFETIME) ripples.splice(i, 1)
      }

      const { baseAlpha, peakAlpha, rgb } = getColors()
      const dots = dotsRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const spring = 1 - Math.pow(1 - SPRING, dt)
      const damp = Math.pow(DAMPING, dt)
      let anyLit = false

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i]
        let tx = 0, ty = 0, intensity = 0

        for (let r = 0; r < ripples.length; r++) {
          const ripple = ripples[r]
          const ageMs = now - ripple.born
          if (ageMs < 0) continue
          const age = ageMs * 0.001

          const rx = dot.x - ripple.x
          const ry = dot.y - ripple.y
          const distSq = rx * rx + ry * ry
          const waveFront = age * WAVE_SPEED
          const maxReach = waveFront + WAVE_ENVELOPE
          if (distSq > maxReach * maxReach) continue
          const minReach = waveFront - WAVE_ENVELOPE
          if (minReach > 0 && distSq < minReach * minReach) continue

          const dist = Math.sqrt(distSq) || 0.0001
          const fromFront = dist - waveFront

          const lifeT = ageMs / WAVE_LIFETIME
          const lifeFade = 1 - easeOutCubic(lifeT)
          const distFade = Math.exp(-dist / (isCoarse ? 560 : 720))
          const ringFade = Math.exp(-(fromFront * fromFront) / ENVELOPE_SIGMA2)

          const phase = fromFront * INV_WAVE_LENGTH * TWO_PI
          // Multi-harmonic crest — reads more like a lively water ring
          const wave =
            (Math.sin(phase) * HARMONIC_1 + Math.sin(phase * 2.1 + 0.35) * HARMONIC_2 + Math.sin(phase * 3.2) * HARMONIC_3) *
            WAVE_AMPLITUDE * lifeFade * distFade * ringFade * ripple.strength

          const invDist = 1 / dist
          const nx = rx * invDist
          const ny = ry * invDist
          tx += nx * wave - ny * wave * TANGENT_MIX
          ty += ny * wave + nx * wave * TANGENT_MIX
          intensity = Math.max(intensity, Math.abs(ringFade * lifeFade * distFade))
        }

        let hoverGlow = 0
        if (!isCoarse) {
          const mdx = dot.x - mx
          const mdy = dot.y - my
          const mDistSq = mdx * mdx + mdy * mdy
          if (mDistSq < HOVER_RADIUS * HOVER_RADIUS) {
            const mDist = Math.sqrt(mDistSq) || 1
            const proximity = 1 - mDist / HOVER_RADIUS
            const ease = proximity * proximity * (3 - 2 * proximity)
            hoverGlow = ease * HOVER_STRENGTH
            const pullStrength = ease * 3.2
            tx -= (mdx / mDist) * pullStrength
            ty -= (mdy / mDist) * pullStrength
            intensity = Math.max(intensity, ease)
          }
        }

        const ax = (tx - dot.dx) * spring
        const ay = (ty - dot.dy) * spring
        dot.vx = (dot.vx + ax) * damp
        dot.vy = (dot.vy + ay) * damp
        dot.dx += dot.vx
        dot.dy += dot.vy
        dot.glow += (intensity - dot.glow) * Math.min(1, GLOW_FOLLOW * dt)

        // Mobile: each dot lights when the ring passes, then fades on its own schedule
        if (isCoarse) {
          if (intensity > 0.02) {
            const targetLit = Math.min(1, 0.4 + intensity * 1.7)
            dot.lit += (targetLit - dot.lit) * Math.min(1, LIT_IN * dt)
          } else {
            dot.lit += (0 - dot.lit) * Math.min(1, LIT_OUT * dt)
          }
          if (dot.lit > 0.02) anyLit = true
        }

        const glow = Math.max(0, Math.min(1.6, dot.glow + hoverGlow * 0.28))
        const reveal = isCoarse ? dot.lit : 1
        const alpha = (baseAlpha + (peakAlpha - baseAlpha) * Math.min(1, glow * 1.35)) * reveal
        if (alpha < 0.01) continue
        const radius = DOT_RADIUS + glow * (isCoarse ? 2.5 : 1.6)

        ctx.beginPath()
        ctx.arc(dot.x + dot.dx, dot.y + dot.dy, radius, 0, TWO_PI)
        ctx.fillStyle = `rgba(${rgb},${alpha})`
        ctx.fill()
      }

      if (isCoarse && ripples.length === 0 && !anyLit) {
        drawing = false
        rafRef.current = null
        resetDotsRest()
        clearCanvas()
        return
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    const startDrawLoop = () => {
      if (drawing) return
      drawing = true
      lastFrame = performance.now()
      rafRef.current = requestAnimationFrame(draw)
    }

    const resize = () => {
      const nextW = window.innerWidth
      const nextH = window.innerHeight

      // Mobile browser chrome show/hide fires resize and makes the page jump —
      // ignore tiny height-only changes; only react to real orientation flips.
      if (isCoarse && width > 0) {
        const widthChanged = Math.abs(nextW - width) > 40
        const heightChanged = Math.abs(nextH - height) > 120
        if (!widthChanged && !heightChanged) return
      }
      dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2)
      width = nextW
      height = nextH
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildDots()
      ripplesRef.current = []
      if (isCoarse && !drawing) clearCanvas()
    }

    // ── Mobile: tap-only water drops (no follow, on-demand RAF) ────────────
    if (isCoarse) {
      const spawnTapRipple = (x, y) => {
        const now = performance.now()
        if (now - lastTapSpawn < 80) return
        lastTapSpawn = now
        spawnTapRipplePair(x, y)
        startDrawLoop()
      }

      const onTouchStart = (e) => {
        // Multi-touch (e.g. pinch) — never splash
        if (e.touches.length !== 1) return
        const t = e.touches[0]
        // Splash immediately on finger-down — don't wait to see if it turns
        // into a scroll/swipe, so the ripple always shows on touch.
        spawnTapRipple(t.clientX, t.clientY)
      }

      // Click fallback (and debounce against touchstart → click double fire)
      const onClick = (e) => {
        const now = performance.now()
        if (now - lastTapSpawn < TAP_CLICK_DEBOUNCE) return
        spawnTapRipple(e.clientX, e.clientY)
      }

      const onOrientation = () => { setTimeout(resize, 250) }
      const onTheme = () => {
        colorCache.theme = ''
        if (!drawing) clearCanvas()
      }
      const themeObs = new MutationObserver(onTheme)

      resize()
      window.addEventListener('orientationchange', onOrientation)
      window.addEventListener('resize', resize, { passive: true })
      window.addEventListener('touchstart', onTouchStart, { passive: true })
      window.addEventListener('click', onClick, { passive: true })
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

      return () => {
        themeObs.disconnect()
        window.removeEventListener('orientationchange', onOrientation)
        window.removeEventListener('resize', resize)
        window.removeEventListener('touchstart', onTouchStart)
        window.removeEventListener('click', onClick)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        drawing = false
        ripplesRef.current = []
      }
    }

    // ── Desktop: path ripples + continuous RAF ────────────────────────────
    const spawnAlongPath = (x, y, strength) => {
      const mouse = mouseRef.current
      const lx = mouse.lastX
      const ly = mouse.lastY
      if (lx < -9000) {
        spawnRipple(x, y, strength)
        mouse.lastX = x
        mouse.lastY = y
        mouse.lastSpawn = performance.now()
        return
      }

      const dx = x - lx
      const dy = y - ly
      const dist = Math.hypot(dx, dy)
      if (dist < 2) return

      const steps = Math.max(1, Math.floor(dist / SPAWN_GAP))
      const stepStrength = strength * Math.min(1, 0.55 + dist / 220)
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        spawnRipple(lx + dx * t, ly + dy * t, stepStrength * (0.55 + 0.45 * t))
      }
      mouse.lastX = x
      mouse.lastY = y
      mouse.lastSpawn = performance.now()
    }

    const onMouseMove = (e) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      const now = performance.now()
      const moved = Math.hypot(
        e.clientX - mouseRef.current.lastX,
        e.clientY - mouseRef.current.lastY,
      )
      if (moved >= SPAWN_GAP || now - mouseRef.current.lastSpawn > SPAWN_INTERVAL) {
        spawnAlongPath(e.clientX, e.clientY, 0.8)
      }
    }
    const onMouseDown = (e) => {
      spawnRipple(e.clientX, e.clientY, 1.85)
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown)
    startDrawLoop()

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      drawing = false
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="vb-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

// ─── Scroll Reveal ───────────────────────────────────────────────────────────
function ScrollReveal({ children, direction = 'up', delay = 0, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const isCoarse =
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches)

  const variants = {
    hidden: isCoarse
      ? { opacity: 0, y: 12 }
      : {
          opacity: 0,
          y: direction === 'up' ? 40 : direction === 'down' ? -40 : 0,
          x: direction === 'left' ? 40 : direction === 'right' ? -40 : 0,
        },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: { duration: isCoarse ? 0.35 : 0.7, delay: isCoarse ? Math.min(delay, 0.08) : delay, ease: [0.25, 0.46, 0.45, 0.94] }
    }
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── AI E2E Coding Window ──────────────────────────────────────────────────
function AICodingWindow() {
  const [activeStep, setActiveStep] = useState(0)
  const [visibleLines, setVisibleLines] = useState([])
  const [done, setDone] = useState(false)
  const timerRef = useRef(null)
  const logContainerRef = useRef(null)
  const runIdRef = useRef(0)

  const steps = [
    { label: '需求分析', color: '#7c5cff' },
    { label: '产品设计', color: '#a855f7' },
    { label: '工程实现', color: '#06b6d4' },
    { label: '质量保障', color: '#10b981' },
    { label: '部署上线', color: '#f59e0b' },
  ]

  const stepTimings = [720, 900, 640, 560, 820]

  const allLogs = [
    { step: 0, text: 'AI Agent 启动 — 接入企业需求会话，建立上下文窗口与约束边界', meta: 'agent.init', type: 'system' },
    { step: 0, text: '解析需求文档 v2.3 — 识别 3 个核心模块、7 个接口契约、14 条验收标准', meta: 'prd.parse', type: 'info' },
    { step: 0, text: '竞品与场景分析完成 — 生成结构化 PRD，并标注优先级与风险项', meta: 'prd.draft', type: 'success' },
    { step: 0, text: '需求结构化完成 — 输出 12 条用户故事 + 验收用例矩阵，待人工确认', meta: 'stories×12', type: 'success' },
    { step: 1, text: '设计智能体启动 — 基于用户旅程拆解页面流、状态机与交互边界', meta: 'design.boot', type: 'system' },
    { step: 1, text: '高保真原型生成 — Figma 结构映射到 React 组件树与路由骨架', meta: 'figma→react', type: 'info' },
    { step: 1, text: '设计令牌同步 — 颜色 / 间距 / 字号校验通过，组件库一致性锁定', meta: 'tokens.ok', type: 'success' },
    { step: 1, text: '可用性快速评估完成 — 关键路径减少 2 步，关键 CTA 对比度达标', meta: 'ux.check', type: 'success' },
    { step: 2, text: '代码生成引擎启动 — 目标栈 React + Vite + 云原生服务分层', meta: 'codegen', type: 'system' },
    { step: 2, text: '组件树与 API 层构建中 — 前端 64% · 服务端 51% · 契约对齐中', meta: 'build 64%', type: 'info' },
    { step: 2, text: '全栈代码生成完成 — 187 files / 12,430 LOC，模块边界与依赖图已写入', meta: '187 files', type: 'info' },
    { step: 2, text: 'AI Code Review 通过 — 0 critical / 2 suggestion，安全扫描无阻断项', meta: 'review.ok', type: 'success' },
    { step: 3, text: '测试智能体启动 — 自动补齐单元、集成与端到端回归用例', meta: 'qa.boot', type: 'system' },
    { step: 3, text: '单元测试全部通过 — 246/246 green，关键路径断言覆盖完成', meta: 'unit 246', type: 'success' },
    { step: 3, text: 'E2E 回归通过 — 32/32 scenarios · 覆盖率 94.2% · 冒烟门禁开启', meta: 'e2e 94.2%', type: 'success' },
    { step: 3, text: '智能缺陷修复完成 — 捕获 2 个边缘态并自动提交热修补丁', meta: 'fix×2', type: 'info' },
    { step: 4, text: 'CI/CD 流水线触发 — 构建多架构生产镜像并执行供应连签名', meta: 'ci.trigger', type: 'system' },
    { step: 4, text: '镜像构建与推送完成 — registry 校验通过，版本标签 v2.3.1-prod', meta: 'image.push', type: 'info' },
    { step: 4, text: 'K8s 滚动更新进行中 — 金丝雀 10% → 50% → 100%，流量无损切换', meta: 'rollout', type: 'info' },
    { step: 4, text: '部署成功 — 健康检查全部通过，生产环境已接管真实流量', meta: 'prod.live', type: 'success' },
    { step: 4, text: 'AI 监控激活 — 追踪 200+ 指标：延迟、错误率、饱和度与业务漏斗', meta: 'otel.on', type: 'success' },
  ]

  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibleLines])

  useEffect(() => {
    const isCoarse =
      window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(pointer: coarse)').matches

    let cancelled = false
    let index = 0
    const runId = ++runIdRef.current
    // Mobile: slower cadence — progress still moves, fewer React updates while scrolling
    const mobileScale = isCoarse ? 1.35 : 1

    const resetAndLoop = () => {
      if (cancelled || runId !== runIdRef.current) return
      setDone(true)
      timerRef.current = setTimeout(() => {
        if (cancelled || runId !== runIdRef.current) return
        setDone(false)
        setVisibleLines([])
        setActiveStep(0)
        index = 0
        timerRef.current = setTimeout(addNextLine, 600)
      }, 2200)
    }

    const addNextLine = () => {
      if (cancelled || runId !== runIdRef.current) return
      if (index >= allLogs.length) {
        resetAndLoop()
        return
      }
      const log = allLogs[index]
      if (index === 0 || allLogs[index - 1].step !== log.step) {
        setActiveStep(log.step)
      }
      setVisibleLines((prev) => [
        ...prev,
        {
          ...log,
          id: index,
          prefix: log.type === 'success' ? '✓' : log.type === 'system' ? '◆' : '›',
        },
      ])
      index += 1
      const delay = Math.round((stepTimings[log.step] ?? 700) * mobileScale)
      timerRef.current = setTimeout(addNextLine, delay)
    }

    timerRef.current = setTimeout(addNextLine, 400)
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const progress = Math.round(((activeStep + (done ? 1 : 0.35)) / steps.length) * 100)
  const clampedProgress = Math.min(100, Math.max(8, progress))

  return (
    <motion.div
      className="ai-pipeline"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Mobile first screen: hero copy + empty stage + pipeline chrome through timeline */}
      <div className="ai-pipeline-fold">
        <div className="ai-pipeline-hero">
          <h1 className="ai-pipeline-hero-title">
            Ideas
            <span className="hero-arrow" aria-hidden="true">
              <svg viewBox="0 0 72 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="heroArrowGrad" x1="0" y1="12" x2="72" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#7c5cff" stopOpacity="0.25" />
                    <stop offset="0.5" stopColor="#a855f7" />
                    <stop offset="1" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <circle cx="3.5" cy="12" r="1.4" fill="url(#heroArrowGrad)" opacity="0.28" />
                <circle cx="10" cy="12" r="1.7" fill="url(#heroArrowGrad)" opacity="0.4" />
                <circle cx="17" cy="12" r="2" fill="url(#heroArrowGrad)" opacity="0.52" />
                <circle cx="24.5" cy="12" r="2.3" fill="url(#heroArrowGrad)" opacity="0.66" />
                <circle cx="32.5" cy="12" r="2.7" fill="url(#heroArrowGrad)" opacity="0.82" />
                <path
                  d="M40 5.5 52 12 40 18.5"
                  stroke="url(#heroArrowGrad)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M50 5.5 62 12 50 18.5"
                  stroke="url(#heroArrowGrad)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Software
            <br />
            <span className="hero-em">Faster</span>
          </h1>
          <p className="ai-pipeline-hero-tagline">
            让每一个想法，更快成为可交付的软件。
          </p>
          <div className="ai-pipeline-hero-stats">
            <span><CountUp value={10} suffix="×" /> 更快交付</span>
            <span className="hero-mini-stats-sep">/</span>
            <span><CountUp value={92} suffix="%" /> 更少缺陷</span>
            <span className="hero-mini-stats-sep">/</span>
            <span><CountUp value={60} suffix="%" /> 更低成本</span>
          </div>
          <p className="ai-pipeline-hero-stats-note">基于内部交付项目的综合估算</p>
        </div>

        <div className="ai-pipeline-stage-slot" aria-hidden="true" />

        <div className="ai-pipeline-card">
          <div className="ai-pipeline-header">
            <div className="ai-pipeline-header-left">
              <span className="ai-pipeline-dots" aria-hidden="true"><i /><i /><i /></span>
              <div className="ai-pipeline-heading">
                <span className="ai-pipeline-title">AI E2E Pipeline</span>
                <span className="ai-pipeline-sub">zzyet.com · end-to-end delivery</span>
              </div>
            </div>
            <div className="ai-pipeline-header-right">
              <span className={`ai-pipeline-live${done ? ' done' : ''}`}>
                <i />{done ? 'SHIPPED' : 'RUNNING'}
              </span>
              <span className="ai-pipeline-pct">{clampedProgress}%</span>
            </div>
          </div>

          <div className="ai-pipeline-bar" aria-hidden="true">
            <div className="ai-pipeline-bar-fill" style={{ width: `${clampedProgress}%` }} />
          </div>

          <ol className="ai-pipeline-timeline" aria-label="交付阶段">
            {steps.map((step, i) => (
              <li
                key={step.label}
                className={`ai-pipeline-node${i < activeStep || done ? ' done' : ''}${i === activeStep && !done ? ' active' : ''}`}
                style={{ '--step-color': step.color }}
              >
                <span className="ai-pipeline-node-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="ai-pipeline-node-label">{step.label}</span>
                {i < steps.length - 1 && <span className="ai-pipeline-node-link" />}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Below the fold on mobile — log + footer */}
      <div className="ai-pipeline-continued">
        <div className="ai-pipeline-log vb-log-scroll" id="pipeline-log" ref={logContainerRef}>
          {visibleLines.map((log, i) => (
            <motion.div
              key={`${log.step}-${i}-${log.text}`}
              className={`ai-pipeline-line type-${log.type}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className="ai-pipeline-line-prefix">
                {log.type === 'success' ? '✓' : log.type === 'system' ? '›' : '·'}
              </span>
              <span className="ai-pipeline-line-text">{log.text}</span>
              <span className="ai-pipeline-line-meta">{log.meta}</span>
            </motion.div>
          ))}
          {!done && <span className="ai-pipeline-cursor" />}
        </div>

        <div className="ai-pipeline-footer">
          <span>{done ? '交付完成' : `当前阶段 · ${steps[activeStep].label}`}</span>
          <span>{visibleLines.length} events</span>
          <span>latency 12ms</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Theme Toggle Button ────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
    >
      {theme === 'light' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      )}
    </button>
  )
}

// ─── Navbar ──────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="/" className="nav-logo" style={{ textDecoration: 'none' }}>
          造翼科技
        </a>
        <ul className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <li><a href="#pipeline" onClick={() => setMenuOpen(false)}>全流程</a></li>
          <li><a href="#advantages" onClick={() => setMenuOpen(false)}>AI 优势</a></li>
          <li><a href="#value" onClick={() => setMenuOpen(false)}>端到端价值</a></li>
          <li><a href="#compare" onClick={() => setMenuOpen(false)}>对比</a></li>
          <li><a href="#cta" onClick={() => setMenuOpen(false)}>联系</a></li>
        </ul>
        <div className="nav-actions">
          <a
            href="https://t.me/Morty_an"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary nav-cta"
            onClick={() => setMenuOpen(false)}
          >
            预约咨询
          </a>
          <ThemeToggle />
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={menuOpen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}

// ─── Count-up number (animates 0 → value once it scrolls into view) ────────
function CountUp({ value, suffix = '', duration = 1.4 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    let raf
    let start = null
    const step = (ts) => {
      if (start === null) start = ts
      const progress = Math.min((ts - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [inView, value, duration])

  return <span ref={ref}>{display}{suffix}</span>
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  // Mouse-reactive parallax for the background glow (desktop only)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 20 })
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 20 })
  const orb1X = useTransform(smoothX, v => v * -30)
  const orb1Y = useTransform(smoothY, v => v * -20)

  useEffect(() => {
    const isCoarse =
      window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    if (isCoarse) return
    const onMove = (e) => {
      mouseX.set(e.clientX / window.innerWidth - 0.5)
      mouseY.set(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [mouseX, mouseY])

  return (
    <section className="hero hero-minimal">
      <div className="hero-scrim" />
      <motion.div className="hero-glow" style={{ x: orb1X, y: orb1Y }} />
      <div className="hero-aurora" aria-hidden="true">
        <span className="hero-aurora-blob b1" />
        <span className="hero-aurora-blob b2" />
        <span className="hero-aurora-blob b3" />
      </div>

      <div className="hero-stage">
        <div className="container hero-layout hero-layout-stack">
          <AICodingWindow />
        </div>
      </div>

      <a href="#pipeline" className="hero-scroll-cue" aria-label="向下查看交付全流程">
        <span>交付全流程</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>
    </section>
  )
}

// ─── Pipeline ────────────────────────────────────────────────────────────────
const pipelineSteps = [
  { step: '01', title: '需求分析', desc: 'AI 对话式需求挖掘，自动生成 PRD 与用户故事', ai: 'AI 辅助访谈 + 竞品分析 + 需求结构化', color: '#7c5cff', accent: 'rgba(124,92,255,0.10)', icon: '📋' },
  { step: '02', title: '产品设计', desc: 'AI 生成高保真原型与交互方案，快速验证产品假设', ai: 'AI 原型生成 + 设计系统 + 可用性评估', color: '#a855f7', accent: 'rgba(168,85,247,0.10)', icon: '🎨' },
  { step: '03', title: '工程实现', desc: 'AI 编码助手全栈开发，自动生成测试与文档', ai: 'AI 编码 + 代码审查 + 自动化文档', color: '#06b6d4', accent: 'rgba(6,182,212,0.10)', icon: '⚡' },
  { step: '04', title: '质量保障', desc: 'AI 驱动全维度测试，智能缺陷检测与自动修复', ai: 'AI 测试生成 + 智能回归 + 自动修复', color: '#10b981', accent: 'rgba(16,185,129,0.10)', icon: '🔍' },
  { step: '05', title: '部署上线', desc: '一键部署，AI 监控运维，持续优化迭代', ai: 'AI 部署编排 + 智能监控 + 自动扩缩', color: '#f59e0b', accent: 'rgba(245,158,11,0.10)', icon: '🚀' },
]

function Pipeline() {
  return (
    <section id="pipeline" className="section">
      <div className="section-glow" aria-hidden="true" />
      <div className="container">
        <ScrollReveal>
          <span className="badge">全流程覆盖</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            AI 驱动的<span className="gradient-text">端到端</span>开发管线
          </h2>
          <p className="section-subtitle">
            从想法诞生到产品上线，AI 贯穿每一个环节，消除传统流程中的信息断层与效率损耗。
          </p>
        </ScrollReveal>

        {/* Horizontal pipeline cards */}
        <div className="pipeline-grid" style={{ marginTop: 60 }}>
          {pipelineSteps.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 0.12}>
              <motion.div
                className="pipeline-card"
                whileHover={{ y: -6, boxShadow: `0 12px 40px -12px ${item.color}40` }}
                transition={{ duration: 0.3 }}
                style={{
                  '--pc-accent': item.color,
                  '--pc-accent-bg': item.accent,
                  borderTop: `3px solid ${item.color}`,
                }}
              >
                <div className="pipeline-step-header">
                  <div
                    className="pipeline-step-badge"
                    style={{ background: item.accent, color: item.color }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                  <h3 className="pipeline-step-title">
                    <span className="pipeline-step-num">{item.step}</span>
                    {item.title}
                  </h3>
                </div>

                {/* Connector arrow (between cards) */}
                {i < pipelineSteps.length - 1 && (
                  <div className="pipeline-arrow">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <circle cx="14" cy="14" r="13" stroke={item.color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4"/>
                      <path d="M12 10L16 14L12 18" stroke={item.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                    </svg>
                  </div>
                )}

                <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.7, marginBottom: 16, flex: 1 }}>
                  {item.desc}
                </p>

                {/* AI capability tag */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 500,
                  color: item.color,
                  background: item.accent,
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: `1px solid ${item.color}20`,
                  alignSelf: 'flex-start',
                }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={item.color} strokeWidth="1.5">
                    <path d="M8 1.5C8 1.5 3 4.5 3 8.5V13.5L8 15L13 13.5V8.5C13 4.5 8 1.5 8 1.5Z"/>
                  </svg>
                  {item.ai}
                </span>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Advantage Cards ─────────────────────────────────────────────────────────
const advantages = [
  { number: '10×', label: '开发速度提升', desc: 'AI 并行处理需求、设计、编码、测试，交付周期从天缩短到小时', color: 'var(--accent)' },
  { number: '92%', label: '缺陷率降低', desc: 'AI 全维度自动测试与智能代码审查，在源头拦截缺陷', color: 'var(--teal)' },
  { number: '60%', label: '开发成本降低', desc: '减少重复性人工投入，团队聚焦高价值创意与决策', color: 'var(--violet)' },
]

function AdvantageCards() {
  return (
    <section id="advantages" className="section">
      <div className="section-glow" aria-hidden="true" />
      <div className="container">
        <ScrollReveal>
          <span className="badge">AI 优势</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            用<span className="gradient-text">数据</span>说话
          </h2>
        </ScrollReveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          marginTop: 48
        }}>
          {advantages.map((item, i) => (
            <ScrollReveal key={item.label} delay={i * 0.15}>
              <motion.div
                className="card"
                whileHover={{ y: -6, boxShadow: 'var(--shadow-glow)' }}
                transition={{ duration: 0.3 }}
                style={{ textAlign: 'center' }}
              >
                <div className="stat-number" style={{ color: item.color, WebkitTextFillColor: item.color }}>
                  {item.number}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>
                  {item.label}
                </h3>
                <p style={{ color: 'var(--text-body)', fontSize: 14, lineHeight: 1.7 }}>
                  {item.desc}
                </p>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Value Propositions ──────────────────────────────────────────────────────
const values = [
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    title: '零信息损耗',
    desc: 'AI 统一管理需求到上线的全部信息，告别文档孤岛与沟通失真，确保每一行代码都可追溯至用户真实需求。',
    color: '#7c5cff',
    gradient: 'linear-gradient(135deg, #7c5cff, #a78bfa)',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s-8-4.5-8-11.8V3l8-1.5L20 3v7.2C20 17.5 12 22 12 22z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    title: '端到端问责',
    desc: '单一团队负责全流程，彻底消除 "这个问题是前端的/后端的/设计的" 等推诿，真正对最终产品负责。',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7, #c084fc)',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: '极速迭代',
    desc: '想法到可用原型只需数小时，用户反馈直达 AI 工作流，实现天级甚至小时级的持续交付节奏。',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.4-1 4.5-2.6 6L12 22l-4.4-7A9 9 0 0 1 5 9a7 7 0 0 1 7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
    title: '持续进化',
    desc: '产品上线后 AI 持续监控用户行为与系统指标，自动识别优化机会，让软件像生物一样不断进化。',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
  },
]

function ValueProps() {
  return (
    <section id="value" className="section">
      <div className="section-glow" aria-hidden="true" />
      <div className="container">
        <ScrollReveal>
          <span className="badge">端到端价值</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            为什么选择<span className="gradient-text"> AI 原生</span>开发？
          </h2>
          <p className="section-subtitle">
            AI 不是工具，而是全新的软件开发范式——从组织架构到交付节奏的彻底重塑。
          </p>
        </ScrollReveal>

        <div className="value-grid" style={{ marginTop: 56 }}>
          {values.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.12}>
              <motion.div
                className="value-card"
                whileHover={{ y: -6 }}
                transition={{ duration: 0.3 }}
                style={{ '--vc-color': item.color }}
              >
                <div className="value-card-header">
                  <div className="value-icon" style={{ background: item.gradient }}>
                    {item.icon}
                  </div>
                  <h3 className="value-card-title">{item.title}</h3>
                </div>

                <p style={{ color: 'var(--text-body)', fontSize: 15, lineHeight: 1.8 }}>
                  {item.desc}
                </p>

                {/* Subtle bottom accent stripe */}
                <div style={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                  height: 3,
                  background: item.gradient,
                  borderRadius: '0 0 var(--radius) var(--radius)',
                  opacity: 0,
                  transition: 'opacity 0.3s ease',
                }} className="value-card-accent" />
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Comparison Table ────────────────────────────────────────────────────────
const compareRows = [
  { label: '需求到上线周期', traditional: '2-6 个月', ai: '3-14 天', aiWin: true },
  { label: '需求传递损耗', traditional: '高（文档→设计→开发→测试）', ai: '低（AI 统一上下文）', aiWin: true },
  { label: '跨角色协作成本', traditional: 'PM × 设计师 × 前端 × 后端 × QA × DevOps', ai: 'AI 多智能体协同', aiWin: true },
  { label: '测试覆盖率', traditional: '40-60%', ai: '90%+（AI 自动生成）', aiWin: true },
  { label: 'Bug 发现时机', traditional: '测试阶段 / 上线后', ai: '编码时实时检测', aiWin: true },
  { label: '文档维护', traditional: '滞后、容易过时', ai: 'AI 自动同步更新', aiWin: true },
  { label: '技术债累积', traditional: '快 → 持续增长', ai: 'AI 持续重构治理', aiWin: true },
]

function ComparisonTable() {
  return (
    <section id="compare" className="section">
      <div className="section-glow" aria-hidden="true" />
      <div className="container">
        <ScrollReveal>
          <span className="badge">代际对比</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            传统开发 vs <span className="gradient-text">AI 原生开发</span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="compare-scroll" style={{ marginTop: 48 }}>
            <table className="compare-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>对比维度</th>
                  <th style={{ width: '35%' }}>
                    <span style={{ color: 'var(--text-muted)' }}>传统开发模式</span>
                  </th>
                  <th style={{ width: '35%' }}>
                      <span style={{ background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                      造翼科技 AI 原生
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, i) => (
                  <motion.tr
                    key={row.label}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06, duration: 0.4 }}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-card-hover)' }}
                  >
                    <td>{row.label}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      <span className="cross">✕</span> {row.traditional}
                    </td>
                    <td style={{ fontWeight: row.aiWin ? 600 : 400 }}>
                      <span className="check" style={{ marginRight: 4 }}>✓</span> {row.ai}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section id="cta" className="cta-section">
      <div className="container">
        <ScrollReveal className="cta-panel">
          <span className="badge">立即开始</span>
          <h2 className="cta-title" style={{ marginTop: 16 }}>
            Ready to Build with <span className="gradient-text">AI</span>?
          </h2>
          <p className="cta-subtitle">
            从创意到产品，
            <br />
            让 AI 与专业工程团队共同加速你的软件交付。
          </p>

          <motion.div
            className="cta-actions"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <a href="https://t.me/Morty_an" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: 16 }}>
              Start Your Project
            </a>
          </motion.div>
        </ScrollReveal>
      </div>
    </section>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-panel">
          <p className="footer-copy">© {new Date().getFullYear()} 造翼科技 ZaoYi Tech. AI 原生端到端软件开发.</p>
          <p className="footer-contact">
            联系：<a href="https://t.me/Morty_an" target="_blank" rel="noopener noreferrer">@Morty_an</a>
          </p>
        </div>
      </div>
    </footer>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <VBCodeBackground />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Navbar />
        <main>
          <Hero />
          <Pipeline />
          <AdvantageCards />
          <ValueProps />
          <ComparisonTable />
          <CTA />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
