'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'

/**
 * Gobind — the mentor's 3D companion (named for Guru Gobind Singh). Ported
 * from the ai-avatar-2.html lab's buildNova() factory: an iridescent glass
 * octahedron that breathes, follows the cursor, blinks, and shows emotions
 * on a canvas-texture face. Two instances can mount at once (the big hero +
 * a compact one beside the chat composer) — each is an independent Three.js
 * scene, so they react to expressions separately.
 */

export type GobindExpression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking' | 'sleepy' | 'wink' | 'love' | 'star'

export interface GobindAvatarHandle {
  setExpression: (name: GobindExpression, holdSeconds?: number) => void
  setPalette: (a: string, b: string, c: string) => void
  sleep: () => void
  wake: () => void
}

interface GobindAvatarProps {
  /** Square canvas size in px. */
  size?: number
  /** Whether Gobind dozes off after being left idle. Off for compact
   *  chat-mounted instances so it doesn't fall asleep mid-conversation. */
  idleSleep?: boolean
  /** Seconds of no pointer movement before dozing off (idleSleep only). */
  idleLimit?: number
  className?: string
}

// eye/mouth/symbol table — how each expression draws to the face texture
const EXPR: Record<GobindExpression, { eye?: string; mouth?: string | null; dots?: boolean; zzz?: boolean; symbol?: string }> = {
  neutral: { eye: 'neutral', mouth: null },
  happy: { eye: 'happy', mouth: 'smile' },
  sad: { eye: 'sad', mouth: 'frown' },
  surprised: { eye: 'wide', mouth: 'o' },
  thinking: { eye: 'neutral', mouth: null, dots: true },
  sleepy: { eye: 'closed', mouth: null, zzz: true },
  wink: { eye: 'wink', mouth: 'smile' },
  love: { symbol: 'heart' },
  star: { symbol: 'star' },
}

const GobindAvatar = forwardRef<GobindAvatarHandle, GobindAvatarProps>(function GobindAvatar(
  { size = 140, idleSleep = true, idleLimit = 8, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const apiRef = useRef<GobindAvatarHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      setExpression: (name, hold) => apiRef.current?.setExpression(name, hold),
      setPalette: (a, b, c) => apiRef.current?.setPalette(a, b, c),
      sleep: () => apiRef.current?.sleep(),
      wake: () => apiRef.current?.wake(),
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch (err) {
      console.warn('[GobindAvatar] WebGL init failed.', err)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0.1, 5.2)
    camera.lookAt(0, 0, 0)

    const CYAN = new THREE.Color('#67E8F9')
    const VIOLET = new THREE.Color('#A78BFA')
    const PINK = new THREE.Color('#F0ABFC')

    const envCanvas = document.createElement('canvas')
    envCanvas.width = 64
    envCanvas.height = 64
    const ex = envCanvas.getContext('2d')!
    const g = ex.createLinearGradient(0, 0, 0, 64)
    g.addColorStop(0, '#0a1030')
    g.addColorStop(0.5, '#243a8a')
    g.addColorStop(0.75, '#7a4adf')
    g.addColorStop(1, '#f0abfc')
    ex.fillStyle = g
    ex.fillRect(0, 0, 64, 64)
    const envTex = new THREE.CanvasTexture(envCanvas)
    envTex.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envMap = pmrem.fromEquirectangular(envTex).texture
    envTex.dispose()
    pmrem.dispose()
    scene.environment = envMap

    const avatar = new THREE.Group()
    scene.add(avatar)

    const R = 1.18
    const coreGeo = new THREE.OctahedronGeometry(R, 0)
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#dfe8ff'),
      metalness: 0,
      roughness: 0.06,
      transmission: 0.9,
      thickness: 2.0,
      ior: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 1,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [120, 520],
      attenuationColor: VIOLET.clone(),
      attenuationDistance: 2.4,
      envMapIntensity: 1.4,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    avatar.add(core)

    const glowGeo = new THREE.SphereGeometry(R * 0.47, 32, 32)
    const glowMat = new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    avatar.add(glow)

    // face: expression-driven eyes/mouth drawn to a canvas texture
    const fc = document.createElement('canvas')
    fc.width = fc.height = 256
    const fx = fc.getContext('2d')!
    const faceTex = new THREE.CanvasTexture(fc)

    function strokeStyle(lw = 13) {
      fx.strokeStyle = '#eafcff'
      fx.fillStyle = '#eafcff'
      fx.lineCap = 'round'
      fx.lineJoin = 'round'
      fx.shadowColor = '#a78bfa'
      fx.shadowBlur = 18
      fx.lineWidth = lw
    }
    let gx = 0
    let gy = 0
    function eye(cx: number, cy: number, open: number, type?: string, noPupil?: boolean) {
      strokeStyle()
      fx.beginPath()
      if (type === 'happy') fx.ellipse(cx, cy + 6, 26, 22, 0, Math.PI * 1.05, Math.PI * 1.95)
      else if (type === 'sad') fx.ellipse(cx, cy - 6, 26, 22, 0, Math.PI * 0.05, Math.PI * 0.95)
      else if (type === 'closed') fx.ellipse(cx, cy, 24, 2, 0, 0, Math.PI * 2)
      else if (type === 'wide') fx.ellipse(cx, cy, 22, 24 * open, 0, 0, Math.PI * 2)
      else fx.ellipse(cx, cy, 22, Math.max(1.5, 22 * open), 0, 0, Math.PI * 2)
      fx.stroke()
      if ((type === 'wide' || type === 'neutral') && !noPupil && open > 0.55) {
        fx.beginPath()
        fx.arc(cx + gx, cy + gy, 5, 0, Math.PI * 2)
        fx.fill()
      }
    }
    function symbol(kind?: string) {
      strokeStyle(11)
      fx.beginPath()
      if (kind === 'heart') {
        fx.fillStyle = '#ff8fcf'
        fx.shadowColor = '#ff8fcf'
        fx.moveTo(128, 150)
        fx.bezierCurveTo(70, 100, 90, 60, 128, 96)
        fx.bezierCurveTo(166, 60, 186, 100, 128, 150)
        fx.fill()
      } else if (kind === 'star') {
        fx.fillStyle = '#ffe08a'
        fx.shadowColor = '#ffe08a'
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 16 : 38
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          const px = 128 + Math.cos(a) * r
          const py = 118 + Math.sin(a) * r
          if (i) fx.lineTo(px, py)
          else fx.moveTo(px, py)
        }
        fx.closePath()
        fx.fill()
      }
      faceTex.needsUpdate = true
    }

    function drawFace(open = 1, expr: GobindExpression = 'neutral', rightOpen: number | null = null, time = 0) {
      fx.clearRect(0, 0, 256, 256)
      const e = EXPR[expr] || EXPR.neutral
      if (e.symbol) {
        symbol(e.symbol)
        return
      }
      if (rightOpen == null) rightOpen = open
      if (e.eye === 'wink') {
        eye(86, 110, open, 'neutral')
        eye(170, 110, rightOpen, 'neutral', true)
      } else {
        eye(86, 110, open, e.eye)
        eye(170, 110, open, e.eye)
      }
      strokeStyle(10)
      if (e.mouth === 'smile') {
        fx.beginPath()
        fx.arc(128, 158, 30, Math.PI * 0.12, Math.PI * 0.88)
        fx.stroke()
      } else if (e.mouth === 'frown') {
        fx.beginPath()
        fx.arc(128, 196, 30, Math.PI * 1.12, Math.PI * 1.88)
        fx.stroke()
      } else if (e.mouth === 'o') {
        fx.beginPath()
        fx.arc(128, 168, 13, 0, Math.PI * 2)
        fx.stroke()
      }
      if (e.dots) {
        fx.fillStyle = '#eafcff'
        ;[108, 128, 148].forEach((x, i) => {
          fx.beginPath()
          fx.arc(x, 172, 4, 0, Math.PI * 2)
          fx.globalAlpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(time * 4 - i * 0.9))
          fx.fill()
        })
        fx.globalAlpha = 1
      }
      if (e.zzz) {
        const f = (time * 0.55) % 1
        fx.fillStyle = '#eafcff'
        fx.globalAlpha = 1 - f
        fx.font = 'italic 22px serif'
        fx.fillText('z', 176, 86 - f * 16)
        fx.font = 'italic 16px serif'
        fx.fillText('z', 196, 70 - f * 16)
        fx.globalAlpha = 1
      }
      faceTex.needsUpdate = true
    }
    drawFace(1, 'neutral')
    const faceGeo = new THREE.PlaneGeometry(R * 0.9, R * 0.9)
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
    const face = new THREE.Mesh(faceGeo, faceMat)
    face.position.set(0, 0, R + 0.07)
    face.renderOrder = 999
    avatar.add(face)

    const N = 70
    const pPos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 2.0 + Math.random() * 0.9
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      pPos[i * 3] = r * Math.sin(p) * Math.cos(t)
      pPos[i * 3 + 1] = r * Math.cos(p) * 0.6
      pPos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t)
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const haloMat = new THREE.PointsMaterial({ color: CYAN, size: 0.03, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
    const halo = new THREE.Points(pGeo, haloMat)
    avatar.add(halo)

    const key = new THREE.DirectionalLight(CYAN, 2.2)
    key.position.set(2, 3, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(VIOLET, 1.8)
    rim.position.set(-3, 1, -2)
    scene.add(rim)
    const fill = new THREE.PointLight(PINK, 6, 12)
    fill.position.set(0, -2, 2)
    scene.add(fill)
    const ambient = new THREE.AmbientLight(0x223066, 0.6)
    scene.add(ambient)

    function setPalette(a: string, b: string, c: string) {
      CYAN.set(a)
      VIOLET.set(b)
      PINK.set(c)
      key.color.set(a)
      rim.color.set(b)
      fill.color.set(c)
      haloMat.color.set(a)
      glowMat.color.set(b)
      coreMat.attenuationColor.set(b)
      coreMat.needsUpdate = true
    }

    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onPointerMove = (e: PointerEvent) => {
      target.x = (e.clientX / innerWidth - 0.5) * 2
      target.y = (e.clientY / innerHeight - 0.5) * 2
      lastActivity = clock.getElapsedTime()
      if (asleep) wake()
    }
    addEventListener('pointermove', onPointerMove)

    // Local non-null binding — TS closure narrowing doesn't propagate the
    // `if (!canvas) return` check into nested function declarations.
    const node: HTMLCanvasElement = canvas
    function resize() {
      const s = node.clientWidth || size
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(s, s, false)
      camera.aspect = 1
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(node)
    resize()

    let expr: GobindExpression = 'neutral'
    let exprHold = -1
    let pop = 0
    let winkT = 0
    let prevExpr: GobindExpression = 'neutral'
    let transT = -1
    const TRANS_DUR = 0.36
    function setExpression(name: GobindExpression, holdSec = 0) {
      if (!EXPR[name]) return
      if (name !== expr) {
        prevExpr = expr
        transT = 0
      }
      expr = name
      pop = 1
      exprHold = holdSec > 0 ? holdSec : -1
      winkT = 0
    }

    let lastActivity = 0
    let asleep = false
    let sleepEase = 0
    const IDLE_LIMIT = idleSleep === false ? Infinity : idleLimit
    function sleep() {
      if (asleep) return
      asleep = true
      setExpression('sleepy')
    }
    function wake() {
      if (!asleep) return
      asleep = false
      setExpression('surprised', 0.7)
    }

    apiRef.current = { setExpression, setPalette, sleep, wake }

    const clock = new THREE.Clock()
    let nextBlink = 2.5
    let blinkT = -1
    let rafId = 0
    function frame() {
      rafId = requestAnimationFrame(frame)
      const t = clock.getElapsedTime()
      const dt = Math.min(clock.getDelta(), 0.05)
      if (!reduce) {
        if (lastActivity === 0) lastActivity = t
        if (!asleep && t - lastActivity > IDLE_LIMIT) sleep()
        sleepEase += ((asleep ? 1 : 0) - sleepEase) * 0.05
        const spin = 1 - 0.8 * sleepEase
        cur.x += (target.x - cur.x) * 0.06
        cur.y += (target.y - cur.y) * 0.06
        avatar.rotation.y = cur.x * 0.5 + Math.sin(t * 0.25) * 0.15 * spin
        avatar.rotation.x = cur.y * 0.35 + Math.sin(t * 0.4) * 0.05
        avatar.rotation.z = sleepEase * 0.18
        avatar.position.y = -sleepEase * 0.16
        core.rotation.y = t * 0.35 * spin
        core.rotation.x = Math.sin(t * 0.5) * 0.2
        pop = Math.max(0, pop - dt * 2.2)
        const bsp = 1.4 - 0.85 * sleepEase
        const breathe = 1 + Math.sin(t * bsp) * (0.025 + 0.02 * sleepEase) + pop * 0.12
        core.scale.setScalar(breathe)
        glowMat.opacity = (0.4 + Math.sin(t * bsp) * 0.12 + pop * 0.3) * (1 - 0.45 * sleepEase)
        glow.scale.setScalar(1 + Math.sin(t * bsp) * 0.06 + pop * 0.15)
        halo.rotation.y = t * 0.08
        gx = Math.max(-9, Math.min(9, cur.x * 5 + Math.sin(t * 0.7) * 2))
        gy = Math.max(-7, Math.min(7, cur.y * 4 + Math.cos(t * 0.9) * 1.5))

        let open = 1
        let shownExpr = expr
        const sym = EXPR[expr]?.symbol
        if (transT >= 0) {
          transT += dt
          const k = Math.min(1, transT / TRANS_DUR)
          shownExpr = k < 0.5 ? prevExpr : expr
          const h = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2
          open = k < 0.5 ? h : h * (1 + 0.14 * Math.sin(h * Math.PI))
          if (transT >= TRANS_DUR) transT = -1
        } else if (!sym) {
          if (blinkT >= 0) {
            const k = blinkT / 0.18
            open = Math.abs(k - 0.5) * 2
            blinkT += dt
            if (blinkT > 0.18) blinkT = -1
          } else if (t > nextBlink) {
            blinkT = 0
            nextBlink = t + 2.4 + Math.random() * 3.4
          } else open = 0.93 + 0.07 * Math.sin(t * 2.0)
        }
        if (exprHold > 0) {
          exprHold -= dt
          if (exprHold <= 0) {
            setExpression('neutral')
            exprHold = -1
          }
        }
        winkT += dt
        const rightOpen = shownExpr === 'wink' ? Math.max(0, 1 - winkT / 0.32) : open
        drawFace(open, shownExpr, rightOpen, t)
        face.rotation.y = -avatar.rotation.y * 0.6
        face.rotation.x = -avatar.rotation.x * 0.6
      }
      renderer.render(scene, camera)
    }
    frame()

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      removeEventListener('pointermove', onPointerMove)
      apiRef.current = null
      coreGeo.dispose()
      coreMat.dispose()
      glowGeo.dispose()
      glowMat.dispose()
      faceGeo.dispose()
      faceMat.dispose()
      faceTex.dispose()
      pGeo.dispose()
      haloMat.dispose()
      envMap.dispose()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleSleep, idleLimit, size])

  return <canvas ref={canvasRef} className={className} style={{ width: size, height: size, display: 'block', cursor: 'grab' }} />
})

export default GobindAvatar
