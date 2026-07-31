import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring } from 'framer-motion'

// ─── Theme Context ──────────────────────────────────────────────────────────
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })

function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('zaoyi-theme')
    if (saved) return saved
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
    return 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('zaoyi-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Dot Grid + Water Ripple Background ─────────────────────────────────────
// Static dot grid; mouse movement spawns ripple wave sources that propagate
// outward like water surface waves. Multiple ripples overlap and decay.
function VBCodeBackground() {
  const canvasRef = useRef(null)
  const ripplesRef = useRef([])
  const mouseRef = useRef({ x: -9999, y: -9999, lastSpawn: 0 })
  const dotsRef = useRef([])
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const isMobile = window.innerWidth < 768
    const GAP = isMobile ? 32 : 24
    const DOT_RADIUS = 1.3
    const WAVE_SPEED = 480          // px / second — ring expansion speed
    const WAVE_AMPLITUDE = 16       // peak displacement (px)
    const WAVE_LENGTH = 120         // wavelength (px) — ripple width
    const WAVE_LIFETIME = 2400      // ms — total fade-out time
    const SPAWN_INTERVAL = 50       // ms — min gap between mouse-trail ripples
    const HOVER_RADIUS = 160        // px — proximity glow radius around cursor
    const HOVER_STRENGTH = 2.5      // glow intensity multiplier

    let width = 0, height = 0, dpr = 1
    let startTime = performance.now()

    const getColors = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      return {
        baseAlpha: isDark ? 0.12 : 0.09,
        peakAlpha: isDark ? 0.30 : 0.25,
        rgb: isDark ? '155,155,170' : '160,160,172',
      }
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
          })
        }
      }
      dotsRef.current = dots
    }

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildDots()
    }

    const spawnRipple = (x, y, strength = 1) => {
      ripplesRef.current.push({
        x, y,
        born: performance.now(),
        strength,
      })
      if (ripplesRef.current.length > 12) {
        ripplesRef.current.shift()
      }
    }

    const draw = () => {
      const now = performance.now()
      ctx.clearRect(0, 0, width, height)

      const ripples = ripplesRef.current
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (now - ripples[i].born > WAVE_LIFETIME) ripples.splice(i, 1)
      }

      const { baseAlpha, peakAlpha, rgb } = getColors()
      const dots = dotsRef.current

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i]
        let dx = 0, dy = 0, intensity = 0

        for (let r = 0; r < ripples.length; r++) {
          const ripple = ripples[r]
          const age = (now - ripple.born) / 1000
          const ageMs = now - ripple.born

          const rx = dot.x - ripple.x
          const ry = dot.y - ripple.y
          const dist = Math.sqrt(rx * rx + ry * ry) || 0.0001

          const waveFront = age * WAVE_SPEED
          const fromFront = dist - waveFront

          if (Math.abs(fromFront) > WAVE_LENGTH * 1.2) continue

          const lifeFade = 1 - ageMs / WAVE_LIFETIME
          const distFade = Math.exp(-dist / 600)
          const ringFade = Math.exp(-(fromFront * fromFront) / (2 * (WAVE_LENGTH / 2.5) ** 2))

          const phase = (fromFront / WAVE_LENGTH) * Math.PI * 2
          const wave = Math.sin(phase) * WAVE_AMPLITUDE * lifeFade * distFade * ringFade * ripple.strength

          const nx = rx / dist
          const ny = ry / dist
          dx += nx * wave
          dy += ny * wave
          intensity = Math.max(intensity, Math.abs(ringFade * lifeFade * distFade))
        }

        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const mdx = dot.x - mx
        const mdy = dot.y - my
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy)
        let hoverGlow = 0
        if (mDist < HOVER_RADIUS) {
          const proximity = 1 - mDist / HOVER_RADIUS
          const ease = proximity * proximity
          hoverGlow = ease * HOVER_STRENGTH
          const pullStrength = ease * 4
          dx -= (mdx / (mDist || 1)) * pullStrength
          dy -= (mdy / (mDist || 1)) * pullStrength
          intensity = Math.max(intensity, ease)
        }

        const alpha = baseAlpha + (peakAlpha - baseAlpha) * Math.min(1, intensity * 1.4 + hoverGlow * 0.3)
        const radius = DOT_RADIUS + intensity * 1.4 + hoverGlow * 0.8

        ctx.beginPath()
        ctx.arc(dot.x + dx, dot.y + dy, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${alpha})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    const onMouseMove = (e) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      const now = performance.now()
      if (now - mouseRef.current.lastSpawn > SPAWN_INTERVAL) {
        mouseRef.current.lastSpawn = now
        spawnRipple(e.clientX, e.clientY, 0.75)
      }
    }
    const onMouseDown = (e) => {
      spawnRipple(e.clientX, e.clientY, 1.8)
    }
    const onTouch = (e) => {
      const t = e.touches[0]
      if (!t) return
      spawnRipple(t.clientX, t.clientY, 1.0)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  )
}

// ─── Scroll Reveal ───────────────────────────────────────────────────────────
function ScrollReveal({ children, direction = 'up', delay = 0, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  const variants = {
    hidden: {
      opacity: 0,
      y: direction === 'up' ? 40 : direction === 'down' ? -40 : 0,
      x: direction === 'left' ? 40 : direction === 'right' ? -40 : 0,
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: { duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] }
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
  const [minimized, setMinimized] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [visibleLines, setVisibleLines] = useState([])
  const timerRef = useRef(null)
  const logContainerRef = useRef(null)

  const steps = [
    { label: '需求分析', icon: '📋', color: '#7c5cff' },
    { label: '产品设计', icon: '🎨', color: '#a855f7' },
    { label: '工程实现', icon: '⚡', color: '#06b6d4' },
    { label: '质量保障', icon: '🔍', color: '#10b981' },
    { label: '部署上线', icon: '🚀', color: '#f59e0b' },
  ]

  const stepTimings = [800, 1000, 700, 600, 900]

  const allLogs = [
    { step: 0, text: '> AI Agent 启动 — 接收用户需求...', type: 'system' },
    { step: 0, text: '> 解析需求文档 v2.3 — 识别 3 个核心功能模块', type: 'info' },
    { step: 0, text: '> 竞品分析完成 — 生成 PRD 草稿', type: 'success' },
    { step: 0, text: '> 结构化需求 — 12 条用户故事已生成', type: 'success' },
    { step: 1, text: '> 启动设计智能体 — 分析交互模式...', type: 'system' },
    { step: 1, text: '> 生成高保真原型 (Figma → React 组件映射)', type: 'info' },
    { step: 1, text: '> 设计系统令牌已同步 — 一致性校验通过', type: 'success' },
    { step: 2, text: '> 代码生成引擎启动 — 目标栈: React + Vite', type: 'system' },
    { step: 2, text: '> 组件树构建中... [██░░░░░░░░] 20%', type: 'info' },
    { step: 2, text: '> 全栈代码生成完成 — 187 个文件, 12,430 行', type: 'info' },
    { step: 2, text: '> AI Code Review 通过 — 0 严重缺陷', type: 'success' },
    { step: 3, text: '> 测试智能体启动 — 生成测试用例...', type: 'system' },
    { step: 3, text: '> 单元测试: 246/246 通过 ✓', type: 'success' },
    { step: 3, text: '> E2E 测试: 32/32 通过 ✓  覆盖率: 94.2%', type: 'success' },
    { step: 3, text: '> 智能缺陷检测 — 发现 2 个边缘情况, 自动修复完成', type: 'info' },
    { step: 4, text: '> CI/CD 流水线触发 — 构建镜像...', type: 'system' },
    { step: 4, text: '> Docker 镜像构建完成 — 推送到 registry', type: 'info' },
    { step: 4, text: '> K8s 滚动更新 — 流量切换中...', type: 'info' },
    { step: 4, text: '> 部署成功 ✓  健康检查通过 — 生产环境已上线', type: 'success' },
    { step: 4, text: '> AI 监控已激活 — 实时追踪 200+ 指标', type: 'success' },
  ]

  // Auto-scroll log container (NOT the page)
  useEffect(() => {
    const el = logContainerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [visibleLines])

  // Core animation loop — runs once, drives steps via timer chain.
  // `index` is a plain ref (not React state) so the schedule is the single
  // source of truth — state updaters below stay pure (no setTimeout/setState
  // inside them), since React StrictMode double-invokes updater functions in
  // dev to catch exactly that kind of impurity, which was silently doubling
  // the animation speed.
  useEffect(() => {
    let cancelled = false
    let index = 0

    const addNextLine = () => {
      if (cancelled || index >= allLogs.length) return

      const log = allLogs[index]
      if (index === 0 || allLogs[index - 1].step !== log.step) {
        setActiveStep(log.step)
      }
      setVisibleLines(prev => [...prev, log])
      index += 1

      if (index >= allLogs.length) return

      const isLastInStep = allLogs[index].step !== log.step
      const delay = isLastInStep ? 1500 : (stepTimings[log.step] || 900)
      timerRef.current = setTimeout(addNextLine, delay)
    }

    // Start after 800ms delay
    timerRef.current = setTimeout(addNextLine, 800)

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div style={{
      position: 'relative',
      zIndex: 10,
      width: '100%',
      maxWidth: 380,
      transition: 'all 0.3s ease',
    }}>
      {!minimized && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="ai-window-card"
          style={{
            width: '100%', maxWidth: 380, maxHeight: 420,
            background: 'var(--vb-terminal-bg, rgba(15,15,26,0.94))',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 12,
            border: '1px solid var(--vb-terminal-border, rgba(124,92,255,0.20))',
            boxShadow: 'var(--vb-terminal-shadow, 0 8px 40px rgba(124,92,255,0.12), 0 0 0 1px rgba(124,92,255,0.08))',
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--vb-terminal-border, rgba(124,92,255,0.12))',
            background: 'rgba(124,92,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <span style={{
                fontSize: 12, fontFamily: 'var(--font-mono)',
                color: 'var(--vb-terminal-text, #a0a0b8)',
                marginLeft: 8, letterSpacing: '0.02em',
              }}>
                AI E2E Pipeline — zzyet.com
              </span>
            </div>
            <button
              onClick={() => setMinimized(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--vb-terminal-text, #6b6b80)', padding: 2,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Step indicators */}
          <div style={{
            display: 'flex', gap: 4, padding: '10px 16px',
            borderBottom: '1px solid var(--vb-terminal-border, rgba(124,92,255,0.08))',
            background: 'var(--vb-stepbar-bg, rgba(124,92,255,0.04))',
          }}>
            {steps.map((step, i) => (
              <div key={step.label}
                style={{
                  flex: 1, textAlign: 'center',
                  padding: '4px 2px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: i <= activeStep ? 600 : 400,
                  fontFamily: 'var(--font-sans)',
                  color: i <= activeStep ? 'var(--vb-terminal-accent, #a78bfa)' : 'var(--vb-terminal-text, #6b6b80)',
                  background: i <= activeStep ? 'rgba(124,92,255,0.10)' : 'transparent',
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 1 }}>{step.icon}</div>
                {step.label}
              </div>
            ))}
          </div>

          {/* Log output */}
          <div style={{
            padding: '12px 16px',
            minHeight: 200,
            maxHeight: 240,
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.8,
            letterSpacing: '0.01em',
          }} className="vb-log-scroll ai-window-log" ref={logContainerRef}>
            {visibleLines.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  color: log.type === 'success' ? 'var(--vb-log-success, #27c93f)'
                       : log.type === 'system' ? 'var(--vb-log-system, #a78bfa)'
                       : 'var(--vb-log-info, #a0a0b8)',
                }}
              >
                {log.text}
              </motion.div>
            ))}
            {visibleLines.length < allLogs.length && (
              <span style={{
                display: 'inline-block', width: 8, height: 14,
                background: 'var(--vb-cursor, #a78bfa)',
                animation: 'vbBlink 0.8s step-end infinite',
                verticalAlign: 'middle', marginLeft: 2,
              }} />
            )}
          </div>
        </motion.div>
      )}

      {/* Minimized button */}
      {minimized && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setMinimized(false)}
          whileHover={{ scale: 1.08 }}
          style={{
            width: 48, height: 48,
            borderRadius: 12,
            background: 'var(--vb-button-bg, rgba(124,92,255,0.90))',
            border: '1px solid var(--vb-terminal-border, rgba(124,92,255,0.30))',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--vb-terminal-shadow, 0 4px 24px rgba(124,92,255,0.25))',
            color: '#fff',
            transition: 'all 0.3s ease',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M6 7h8M6 10h5M6 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </motion.button>
      )}
    </div>
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
        <a href="#" className="nav-logo" style={{ textDecoration: 'none' }}>
          造翼科技
        </a>
        <button
          className="mobile-menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen
              ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
            }
          </svg>
        </button>
        <ul className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <li><a href="#playground" onClick={() => setMenuOpen(false)}>试玩</a></li>
          <li><a href="#pipeline" onClick={() => setMenuOpen(false)}>全流程</a></li>
          <li><a href="#advantages" onClick={() => setMenuOpen(false)}>AI 优势</a></li>
          <li><a href="#value" onClick={() => setMenuOpen(false)}>端到端价值</a></li>
          <li><a href="#compare" onClick={() => setMenuOpen(false)}>对比</a></li>
          <li><a href="#github" onClick={() => setMenuOpen(false)}>开源</a></li>
          <li><a href="#cta" onClick={() => setMenuOpen(false)}>联系</a></li>
        </ul>
        <ThemeToggle />
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

// ─── Magnetic button — nudges toward the cursor within its bounds ──────────
function MagneticButton({ children, className, href, target, rel }) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 200, damping: 14, mass: 0.3 })
  const springY = useSpring(y, { stiffness: 200, damping: 14, mass: 0.3 })

  const handleMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect()
    x.set((e.clientX - rect.left - rect.width / 2) * 0.35)
    y.set((e.clientY - rect.top - rect.height / 2) * 0.35)
  }
  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.a>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  const { scrollY } = useScroll()
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0])
  const heroY = useTransform(scrollY, [0, 400], [0, 60])

  // Mouse-reactive parallax for the background glow orbs
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const smoothX = useSpring(mouseX, { stiffness: 40, damping: 20 })
  const smoothY = useSpring(mouseY, { stiffness: 40, damping: 20 })
  const orb1X = useTransform(smoothX, v => v * -36)
  const orb1Y = useTransform(smoothY, v => v * -24)
  const orb2X = useTransform(smoothX, v => v * 28)
  const orb2Y = useTransform(smoothY, v => v * 20)

  useEffect(() => {
    const onMove = (e) => {
      mouseX.set(e.clientX / window.innerWidth - 0.5)
      mouseY.set(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [mouseX, mouseY])

  return (
    <section className="hero">
      <div className="hero-scrim" />
      <motion.div style={{ opacity: heroOpacity, y: heroY, width: '100%' }}>
        <div className="container hero-row">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="hero-copy-block"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <span className="badge hero-badge" style={{ marginBottom: 22, display: 'inline-flex' }}>
                <span className="badge-dot" />
                AI 原生端到端软件开发
              </span>
            </motion.div>

            <h1 className="hero-title">
              从
              <span className="hero-em">想法</span>
              <span className="hero-arrow">→</span>
              <span className="hero-em">上线</span>
              <br />
              AI <span className="hero-em">全程</span>驱动
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="hero-desc"
            >
              造翼科技 将 AI 深度融入软件开发全生命周期，突破传统开发瓶颈，实现 <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>10 倍速</strong> 端到端交付。
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.6 }}
              className="hero-cta-row"
            >
              <MagneticButton href="#pipeline" className="btn btn-primary">
                探索全流程
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </MagneticButton>
              <a href="https://t.me/Morty_an" target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                预约演示
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="hero-stats"
            >
              <div className="hero-stat">
                <span className="hero-stat-num" style={{ color: 'var(--accent)' }}><CountUp value={10} suffix="×" /></span>
                <span className="hero-stat-label">开发速度提升</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-num" style={{ color: 'var(--teal)' }}><CountUp value={92} suffix="%" /></span>
                <span className="hero-stat-label">缺陷率降低</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-num" style={{ color: 'var(--violet)' }}><CountUp value={60} suffix="%" /></span>
                <span className="hero-stat-label">开发成本降低</span>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50, rotate: -3 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.85, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="hero-visual"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
            >
              <AICodingWindow />
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      <a href="#pipeline" className="hero-scroll-cue" aria-label="向下滚动查看更多">
        <span>向下滚动</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>

      {/* Animated gradient orbs behind hero — drift with cursor for parallax depth */}
      <motion.div className="hero-orb-1" style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '60vw', height: '60vw', maxWidth: 700, maxHeight: 700,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,92,255,0.3) 0%, rgba(34,211,238,0.18) 40%, transparent 70%)',
        pointerEvents: 'none',
        filter: 'blur(40px)',
        x: orb1X, y: orb1Y,
      }} />
      <motion.div className="hero-orb-2" style={{
        position: 'absolute', bottom: '-10%', left: '-5%',
        width: '40vw', height: '40vw', maxWidth: 500, maxHeight: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.25) 0%, rgba(124,92,255,0.14) 50%, transparent 70%)',
        pointerEvents: 'none',
        filter: 'blur(40px)',
        x: orb2X, y: orb2Y,
      }} />
    </section>
  )
}

// ─── Snake mini-game — real directional control, roams the full board ──────
function SnakeGame() {
  const canvasRef = useRef(null)
  const startRef = useRef(() => {})
  const [status, setStatus] = useState('idle') // idle | playing | over
  const [finalScore, setFinalScore] = useState(0)
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('zaoyi-snake-highscore') || 0))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let width = 0, height = 0, cell = 18, cols = 0, rows = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cell = Math.max(14, Math.floor(Math.min(width / 32, height / 11)))
      cols = Math.max(6, Math.floor(width / cell))
      rows = Math.max(6, Math.floor(height / cell))
    }
    resize()
    window.addEventListener('resize', resize)

    let phase = 'idle'
    let snake, dir, nextDir, food, tickMs, acc, lastTs, raf, score

    const randCell = () => ({ x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) })
    const placeFood = () => {
      let f, tries = 0
      do { f = randCell(); tries++ } while (snake.some(s => s.x === f.x && s.y === f.y) && tries < 200)
      food = f
    }

    const resetGame = () => {
      const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2)
      snake = [{ x: cx - 1, y: cy }, { x: cx - 2, y: cy }, { x: cx - 3, y: cy }]
      dir = { x: 1, y: 0 }
      nextDir = { x: 1, y: 0 }
      tickMs = 135
      acc = 0
      lastTs = null
      score = 0
      placeFood()
    }
    resetGame()

    const start = () => {
      if (phase === 'idle' || phase === 'over') {
        resetGame()
        phase = 'playing'
        setStatus('playing')
      }
    }
    startRef.current = start

    const setDir = (dx, dy) => {
      if (phase !== 'playing') { start(); return }
      if (dx === -dir.x && dy === -dir.y) return
      nextDir = { x: dx, y: dy }
    }

    const KEY_MAP = {
      ArrowUp: [0, -1], KeyW: [0, -1],
      ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0],
      ArrowRight: [1, 0], KeyD: [1, 0],
    }
    const onKey = (e) => {
      if (KEY_MAP[e.code]) {
        e.preventDefault()
        setDir(...KEY_MAP[e.code])
      } else if (e.code === 'Space') {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', onKey)

    let touchStart = null
    const onTouchStart = (e) => { touchStart = e.changedTouches[0] }
    const onTouchEnd = (e) => {
      if (!touchStart) { start(); return }
      const t = e.changedTouches[0]
      const dx = t.clientX - touchStart.clientX
      const dy = t.clientY - touchStart.clientY
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) { start() }
      else if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0)
      else setDir(0, dy > 0 ? 1 : -1)
      touchStart = null
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    const onPointer = () => { if (phase !== 'playing') start() }
    canvas.addEventListener('pointerdown', onPointer)

    const loop = (ts) => {
      if (phase === 'playing') {
        if (lastTs === null) lastTs = ts
        acc += Math.min(ts - lastTs, 200)
        lastTs = ts
        while (acc >= tickMs) {
          acc -= tickMs
          dir = nextDir
          const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }
          if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) { phase = 'over'; break }
          const eating = head.x === food.x && head.y === food.y
          const body = eating ? snake : snake.slice(0, -1)
          if (body.some(s => s.x === head.x && s.y === head.y)) { phase = 'over'; break }
          snake.unshift(head)
          if (eating) {
            score += 1
            tickMs = Math.max(75, tickMs - 2.5)
            placeFood()
          } else {
            snake.pop()
          }
        }
        if (phase === 'over') {
          const prevHs = Number(localStorage.getItem('zaoyi-snake-highscore') || 0)
          const hs = Math.max(prevHs, score)
          localStorage.setItem('zaoyi-snake-highscore', String(hs))
          setFinalScore(score)
          setHighScore(hs)
          setStatus('over')
        }
      } else {
        lastTs = null
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      ctx.clearRect(0, 0, width, height)

      // Idle state still shows a faded static preview of the snake so the
      // box reads as "game waiting to start" rather than an empty rectangle.
      const isIdle = phase === 'idle'
      ctx.globalAlpha = isIdle ? 0.32 : 1

      const fx = food.x * cell + cell / 2, fy = food.y * cell + cell / 2
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(fx, fy, cell * 0.26, 0, Math.PI * 2)
      ctx.fill()

      const pad = Math.max(1.5, cell * 0.08)
      const r = Math.max(3, cell * 0.24)
      snake.forEach((s, i) => {
        const t = i / Math.max(snake.length - 1, 1)
        ctx.fillStyle = i === 0
          ? (isDark ? '#a78bfa' : '#7c5cff')
          : `rgba(124,92,255,${0.85 - t * 0.5})`
        const x = s.x * cell + pad, y = s.y * cell + pad, w = cell - pad * 2, h = cell - pad * 2
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
        else ctx.rect(x, y, w, h)
        ctx.fill()
      })

      ctx.globalAlpha = 1

      if (phase !== 'idle') {
        ctx.font = '600 13px "Source Code Pro", ui-monospace, Menlo, Consolas, monospace'
        ctx.fillStyle = isDark ? 'rgba(240,240,245,0.75)' : 'rgba(26,26,46,0.65)'
        ctx.textAlign = 'right'
        ctx.fillText(`分数 ${score}`, width - 12, 20)
        ctx.textAlign = 'left'
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div className="hero-game-wrap" id="playground">
      <div className="hero-game-caption">
        <span>🐍 方向键 / WASD 控制，手机端可滑动切换方向</span>
        <span>最高分 {highScore}</span>
      </div>
      <div className="hero-game-canvas-wrap">
        <canvas ref={canvasRef} className="hero-game-canvas" />
        {status !== 'playing' && (
          <div className="hero-game-overlay">
            {status === 'idle' ? (
              <button className="btn btn-primary" onClick={() => startRef.current()}>开始游戏</button>
            ) : (
              <>
                <span className="hero-game-overlay-text">游戏结束 · 得分 {finalScore}</span>
                <button className="btn btn-primary" onClick={() => startRef.current()}>再玩一次</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
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
    <section id="pipeline" className="section section-alt">
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
                {/* Step indicator + icon */}
                <div className="pipeline-step-header">
                  <div className="pipeline-step-badge" style={{ background: item.color }}>
                    {item.icon}
                  </div>
                  <span className="pipeline-step-num">{item.step}</span>
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

                {/* Content */}
                <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8, color: 'var(--text-heading)' }}>
                  {item.title}
                </h3>
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
    <section id="value" className="section section-alt">
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
                {/* Icon */}
                <div className="value-icon" style={{ background: item.gradient }}>
                  {item.icon}
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: 'var(--text-heading)' }}>
                  {item.title}
                </h3>

                {/* Description */}
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

// ─── GitHub Showcase ──────────────────────────────────────────────────────────
function GitHubShowcase() {
  return (
    <section id="github" className="section section-alt">
      <div className="container">
        <ScrollReveal>
          <span className="badge">开源透明</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            用 AI 开发的<span className="gradient-text">代码</span>，全部开源
          </h2>
          <p className="section-subtitle">
            造翼科技官网本身由 AI 驱动开发——React + Vite + Framer Motion，代码托管在 GitHub，每一行都可审查。
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div style={{ marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href="https://github.com/zzyet/zaoyi-website"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <motion.div
                className="card"
                whileHover={{ y: -4 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '20px 28px',
                  minWidth: 280,
                }}
              >
                <div style={{
                  width: 44, height: 44,
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-alt)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--text-heading)">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>
                    zaoyi-website
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    github.com/zzyet/zaoyi-website
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </motion.div>
            </a>

            <a
              href="https://github.com/zzyet"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <motion.div
                className="card"
                whileHover={{ y: -4 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '20px 28px',
                  minWidth: 280,
                }}
              >
                <div style={{
                  width: 44, height: 44,
                  borderRadius: 'var(--radius)',
                  background: 'var(--gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <line x1="9" y1="9" x2="15" y2="9"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="12" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 4 }}>
                    更多 AI 开源项目
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    github.com/zzyet
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </motion.div>
            </a>
          </div>
        </ScrollReveal>
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
      <div className="container">
        <ScrollReveal>
          <span className="badge">代际对比</span>
          <h2 className="section-title" style={{ marginTop: 16 }}>
            传统开发 vs <span className="gradient-text">AI 原生开发</span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div style={{ marginTop: 48, overflowX: 'auto' }}>
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
        <ScrollReveal>
          <span className="badge">立即开始</span>
          <h2 className="cta-title" style={{ marginTop: 16 }}>
            准备好用 AI 重构你的
            <br />
            <span className="gradient-text">软件开发方式</span>了吗？
          </h2>
          <p className="cta-subtitle">
            告诉我们你的想法，剩下的交给 造翼科技。
          </p>

          <motion.div
            style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <a href="https://t.me/Morty_an" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.015-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.441-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.333-1.386 4.025-1.627 4.476-1.635.1-.002.321.023.465.141.119.098.152.228.168.32.016.093.036.305.02.472z"/></svg>
              预约免费咨询
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
        <p style={{ marginBottom: 8 }}>© {new Date().getFullYear()} 造翼科技 ZaoYi Tech. AI 原生端到端软件开发.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          联系：<a href="https://t.me/Morty_an" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>@Morty_an</a>
        </p>
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
          <GitHubShowcase />
          <CTA />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
