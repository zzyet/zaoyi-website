import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'

// ─── Neural Network Canvas Background ────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const timeRef = useRef(0)
  const dataRef = useRef({ neurons: [], particles: [], pulses: [] })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let w, h

    const resize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Neurons (larger, glowing nodes) ──
    const NEURON_COUNT = 25
    const neuronColors = [
      { fill: 'rgba(77,124,254,0.55)', glow: 'rgba(77,124,254,0.18)' },
      { fill: 'rgba(124,58,237,0.50)', glow: 'rgba(124,58,237,0.15)' },
      { fill: 'rgba(6,182,212,0.50)', glow: 'rgba(6,182,212,0.15)' },
      { fill: 'rgba(139,92,246,0.45)', glow: 'rgba(139,92,246,0.14)' },
    ]
    dataRef.current.neurons = Array.from({ length: NEURON_COUNT }, (_, idx) => {
      const nc = neuronColors[Math.floor(Math.random() * neuronColors.length)]
      // Evenly distribute across the viewport with some margin
      const cols = 5, rows = Math.ceil(NEURON_COUNT / cols)
      const cellW = w / cols, cellH = h / rows
      const col = idx % cols, row = Math.floor(idx / cols)
      return {
        x: cellW * (col + 0.5) + (Math.random() - 0.5) * cellW * 0.6,
        y: cellH * (row + 0.5) + (Math.random() - 0.5) * cellH * 0.6,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        r: 3 + Math.random() * 3,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
        color: nc,
      }
    })

    // ── Background ambient particles (small, many) ──
    const PARTICLE_COUNT = 100
    const particleColors = ['rgba(77,124,254,0.22)', 'rgba(124,58,237,0.18)', 'rgba(6,182,212,0.16)', 'rgba(99,102,241,0.14)']
    dataRef.current.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.5 + 0.5,
      color: particleColors[Math.floor(Math.random() * particleColors.length)],
    }))

    // ── Signal pulses traveling along connections ──
    dataRef.current.pulses = []

    const animate = () => {
      timeRef.current += 1
      ctx.clearRect(0, 0, w, h)

      const { neurons, particles, pulses } = dataRef.current
      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const t = timeRef.current * 0.016

      // ── Draw & update ambient particles ──
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }

      // ── Update neurons ──
      // Compute neuron-neuron repulsion to prevent clustering
      for (let i = 0; i < neurons.length; i++) {
        const n = neurons[i]
        for (let j = i + 1; j < neurons.length; j++) {
          const m = neurons[j]
          const dx = n.x - m.x
          const dy = n.y - m.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const MIN_DIST = 80
          if (dist < MIN_DIST && dist > 0) {
            const force = 0.015 * (1 - dist / MIN_DIST)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            n.vx += fx
            n.vy += fy
            m.vx -= fx
            m.vy -= fy
          }
        }
      }

      for (const n of neurons) {
        // Mouse attraction — gentle pull toward cursor
        const dx = mx - n.x
        const dy = my - n.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const MOUSE_RANGE = 200
        if (dist < MOUSE_RANGE && dist > 1) {
          const force = 0.025 * (1 - dist / MOUSE_RANGE)
          n.vx += (dx / dist) * force
          n.vy += (dy / dist) * force
        }

        // Small random jitter to keep movement alive
        n.vx += (Math.random() - 0.5) * 0.04
        n.vy += (Math.random() - 0.5) * 0.04

        n.x += n.vx
        n.y += n.vy

        // Strong damping
        n.vx *= 0.94
        n.vy *= 0.94

        // Clamp speed
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy)
        const MAX_SPEED = 0.8
        if (speed > MAX_SPEED) {
          n.vx = (n.vx / speed) * MAX_SPEED
          n.vy = (n.vy / speed) * MAX_SPEED
        }

        // Wrap around edges with margin
        const margin = 40
        if (n.x < margin) { n.x = margin; n.vx *= -0.5 }
        if (n.x > w - margin) { n.x = w - margin; n.vx *= -0.5 }
        if (n.y < margin) { n.y = margin; n.vy *= -0.5 }
        if (n.y > h - margin) { n.y = h - margin; n.vy *= -0.5 }
      }

      // ── Draw neural connections ──
      const CONNECTION_DIST = 220
      const drawnPairs = new Set()

      for (let i = 0; i < neurons.length; i++) {
        const a = neurons[i]
        for (let j = i + 1; j < neurons.length; j++) {
          const b = neurons[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < CONNECTION_DIST) {
            let alpha = 0.14 * (1 - d / CONNECTION_DIST)
            const midX = (a.x + b.x) / 2
            const midY = (a.y + b.y) / 2
            // Boost alpha for connections near mouse (spotlight effect)
            const mouseDist = Math.sqrt((midX - mx) ** 2 + (midY - my) ** 2)
            if (mouseDist < 250) alpha = Math.min(0.35, alpha + 0.15 * (1 - mouseDist / 250))

            // Glow line behind
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(77,124,254,${alpha * 0.5})`
            ctx.lineWidth = 2.5
            ctx.stroke()

            // Core line
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(77,124,254,${alpha})`
            ctx.lineWidth = 0.8
            ctx.stroke()

            // Data pulse management
            const pairKey = `${Math.min(i, j)}-${Math.max(i, j)}`
            if (!drawnPairs.has(pairKey)) {
              drawnPairs.add(pairKey)
              // Find or create pulse for this pair
              let pulse = pulses.find(p => p.pair === pairKey)
              if (!pulse) {
                pulse = {
                  pair: pairKey,
                  a: i, b: j,
                  progress: Math.random(),
                  speed: 0.003 + Math.random() * 0.006,
                  color: Math.random() > 0.5 ? 'rgba(77,124,254,0.9)' : 'rgba(6,182,212,0.85)',
                }
                pulses.push(pulse)
              }
            }
          }
        }
      }

      // Clean up stale pulses
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k]
        if (p.a >= neurons.length || p.b >= neurons.length) {
          pulses.splice(k, 1)
          continue
        }
        p.progress += p.speed
        if (p.progress > 1) p.progress = 0

        const a = neurons[p.a]
        const b = neurons[p.b]
        const px = a.x + (b.x - a.x) * p.progress
        const py = a.y + (b.y - a.y) * p.progress

        // Pulse glow
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, 6)
        gradient.addColorStop(0, p.color)
        gradient.addColorStop(0.4, p.color.replace('0.9', '0.4').replace('0.85', '0.35'))
        gradient.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(px, py, 6, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        //Core dot
        ctx.beginPath()
        ctx.arc(px, py, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
      }

      // Limit pulse count
      if (pulses.length > 80) pulses.splice(0, pulses.length - 80)

      // ── Draw neurons with glow ──
      for (const n of neurons) {
        const pulseR = n.r + Math.sin(t * n.pulseSpeed + n.pulsePhase) * 2

        // Mouse proximity boost — bigger & brighter near cursor
        const nDx = mx - n.x
        const nDy = my - n.y
        const nDist = Math.sqrt(nDx * nDx + nDy * nDy)
        const mouseBoost = nDist < 200 ? (1 - nDist / 200) : 0
        const glowRadius = pulseR * (4 + mouseBoost * 5)
        const glowAlpha = Math.min(0.4, 0.18 + mouseBoost * 0.25)

        // Outer glow
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowRadius)
        glow.addColorStop(0, n.color.glow.replace(/0\.\d+/, String(glowAlpha)))
        glow.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        // Mid ring
        ctx.beginPath()
        ctx.arc(n.x, n.y, pulseR + 2, 0, Math.PI * 2)
        ctx.strokeStyle = n.color.fill.replace('0.55', '0.2').replace('0.50', '0.18')
        ctx.lineWidth = 1
        ctx.stroke()

        // Core neuron
        const coreGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, pulseR)
        coreGrad.addColorStop(0, '#ffffff')
        coreGrad.addColorStop(0.5, n.color.fill)
        coreGrad.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2)
        ctx.fillStyle = coreGrad
        ctx.fill()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()

    const onMouse = (e) => { mouseRef.current.x = e.clientX; mouseRef.current.y = e.clientY }
    window.addEventListener('mousemove', onMouse)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

// ─── Tech Grid Overlay (CSS) ─────────────────────────────────────────────────
function GridOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.25,
        backgroundImage: `
          linear-gradient(rgba(77,124,254,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(77,124,254,0.06) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 70%)',
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
          <li><a href="#pipeline" onClick={() => setMenuOpen(false)}>全流程</a></li>
          <li><a href="#advantages" onClick={() => setMenuOpen(false)}>AI 优势</a></li>
          <li><a href="#value" onClick={() => setMenuOpen(false)}>端到端价值</a></li>
          <li><a href="#compare" onClick={() => setMenuOpen(false)}>对比</a></li>
          <li><a href="#github" onClick={() => setMenuOpen(false)}>开源</a></li>
          <li><a href="#cta" onClick={() => setMenuOpen(false)}>联系</a></li>
        </ul>
      </div>
    </nav>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  const { scrollY } = useScroll()
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0])
  const heroY = useTransform(scrollY, [0, 400], [0, 60])

  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      <motion.div style={{ opacity: heroOpacity, y: heroY, width: '100%' }}>
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ maxWidth: 680 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <span className="badge" style={{ marginBottom: 28, display: 'inline-flex' }}>
                <span className="badge-dot" />
                AI 原生端到端软件开发
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
              className="hero-title"
            >
              从<span className="gradient-text">想法</span>到
              <br />
              <span className="gradient-text">上线</span>，AI 全程驱动
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="hero-desc"
            >
              造翼科技 将 AI 深度融入软件开发全生命周期——
              从需求分析到产品设计、工程实现、质量保障、部署上线，
              突破传统开发瓶颈，实现 <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>10 倍速</strong> 端到端交付。
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.6 }}
              style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}
            >
              <a href="#pipeline" className="btn btn-primary">
                探索全流程
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </a>
              <a href="#cta" className="btn btn-outline">
                预约演示
              </a>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Animated gradient orbs behind hero */}
      <div className="hero-orb-1" style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '60vw', height: '60vw', maxWidth: 700, maxHeight: 700,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(77,124,254,0.08) 0%, rgba(6,182,212,0.04) 40%, transparent 70%)',
        pointerEvents: 'none',
        filter: 'blur(40px)',
      }} />
      <div className="hero-orb-2" style={{
        position: 'absolute', bottom: '-10%', left: '-5%',
        width: '40vw', height: '40vw', maxWidth: 500, maxHeight: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, rgba(77,124,254,0.03) 50%, transparent 70%)',
        pointerEvents: 'none',
        filter: 'blur(40px)',
      }} />
    </section>
  )
}

// ─── Pipeline ────────────────────────────────────────────────────────────────
const pipelineSteps = [
  { step: '01', title: '需求分析', desc: 'AI 对话式需求挖掘，自动生成 PRD 与用户故事', ai: 'AI 辅助访谈 + 竞品分析 + 需求结构化' },
  { step: '02', title: '产品设计', desc: 'AI 生成高保真原型与交互方案，快速验证产品假设', ai: 'AI 原型生成 + 设计系统 + 可用性评估' },
  { step: '03', title: '工程实现', desc: 'AI 编码助手全栈开发，自动生成测试与文档', ai: 'AI 编码 + 代码审查 + 自动化文档' },
  { step: '04', title: '质量保障', desc: 'AI 驱动全维度测试，智能缺陷检测与自动修复', ai: 'AI 测试生成 + 智能回归 + 自动修复' },
  { step: '05', title: '部署上线', desc: '一键部署，AI 监控运维，持续优化迭代', ai: 'AI 部署编排 + 智能监控 + 自动扩缩' },
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

        <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          {pipelineSteps.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 0.1}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                {/* Left: step number + connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="step-number">{item.step}</div>
                  {i < pipelineSteps.length - 1 && <div className="pipeline-connector" />}
                </div>

                {/* Right: card */}
                <div className="card" style={{ flex: 1, maxWidth: 600, marginBottom: i < pipelineSteps.length - 1 ? 20 : 0 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12, lineHeight: 1.7 }}>
                    {item.desc}
                  </p>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: 'var(--accent2)',
                    background: 'var(--accent2-light)',
                    padding: '4px 12px',
                    borderRadius: 100
                  }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1.5C8 1.5 3 4.5 3 8.5V13.5L8 15L13 13.5V8.5C13 4.5 8 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <path d="M6 8L7.5 9.5L10 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    {item.ai}
                  </span>
                </div>
              </div>
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
  { number: '60%', label: '开发成本降低', desc: '减少重复性人工投入，团队聚焦高价值创意与决策', color: 'var(--accent2)' },
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
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
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
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    title: '零信息损耗',
    desc: 'AI 统一管理需求到上线的全部信息，告别文档孤岛与沟通失真，确保每一行代码都可追溯至用户真实需求。'
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s-8-4.5-8-11.8V3l8-1.5L20 3v7.2C20 17.5 12 22 12 22z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    title: '端到端问责',
    desc: '单一团队负责全流程，彻底消除 "这个问题是前端的/后端的/设计的" 等推诿，真正对最终产品负责。'
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: '极速迭代',
    desc: '想法到可用原型只需数小时，用户反馈直达 AI 工作流，实现天级甚至小时级的持续交付节奏。'
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.4-1 4.5-2.6 6L12 22l-4.4-7A9 9 0 0 1 5 9a7 7 0 0 1 7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
    title: '持续进化',
    desc: '产品上线后 AI 持续监控用户行为与系统指标，自动识别优化机会，让软件像生物一样不断进化。'
  }
]

function ValueProps() {
  const iconColors = [bg => ({ background: 'var(--accent-light)' }), bg => ({ background: 'rgba(124,58,237,0.08)' }), bg => ({ background: 'rgba(6,182,212,0.08)' }), bg => ({ background: 'rgba(245,158,11,0.08)' })]
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

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 24,
          marginTop: 48
        }}>
          {values.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 0.12}>
              <motion.div
                className="card"
                whileHover={{ y: -4 }}
                transition={{ duration: 0.3 }}
              >
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                  ...iconColors[i](),
                }}>
                  {item.icon}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
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
                  background: '#1a1a2e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
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
            <a href="#" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: 16 }}>
              预约免费咨询
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </a>
            <a href="#" className="btn btn-outline" style={{ padding: '16px 40px', fontSize: 16 }}>
              了解更多
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
        <p>© {new Date().getFullYear()} 造翼科技 ZaoYi Tech. AI 原生端到端软件开发.</p>
      </div>
    </footer>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <GridOverlay />
      <div className="scan-line" />
      <ParticleCanvas />
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
    </>
  )
}
