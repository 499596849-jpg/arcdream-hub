window.__ModuleLoader__.load({
  id: 'dsh-arc-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = 'http://127.0.0.1:8799'

    const S = {
      wrap: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px 2px 18px', fontSize: '13px', color: 'var(--dsw-alias-label-primary, #dbe7f3)' },
      row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      card: { border: '1px solid var(--dsw-alias-border-secondary, rgba(120,180,220,.25))', borderRadius: '10px', padding: '12px 14px', background: 'var(--dsw-alias-bg-elevated, rgba(10,20,32,.5))' },
      label: { fontSize: '11px', letterSpacing: '.08em', opacity: .65, fontFamily: 'ui-monospace, Consolas, monospace' },
      btn: { padding: '5px 11px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-secondary, rgba(120,180,220,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '12px' },
      ok: { color: '#39c98a' },
      bad: { color: '#e0a34a' },
      val: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11px', opacity: .9, wordBreak: 'break-all' }
    }

    function useStatus() {
      const [st, setSt] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const r = await fetch(API + '/api/status')
            const j = await r.json()
            if (alive) setSt(j && j.ok ? j : { ok: false })
          } catch (e) { if (alive) setSt({ ok: false }) }
        }
        load()
        const t = setInterval(load, 8000)
        return () => { alive = false; clearInterval(t) }
      }, [])
      return st
    }

    function setMode(mode) {
      fetch(API + '/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }).catch(() => {})
    }

    function ArcHubSettings() {
      const st = useStatus()
      const [persona, setPersona] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => {
        let alive = true
        fetch(API + '/api/persona').then(r => r.json()).then(j => { if (alive) setPersona(j) }).catch(() => { if (alive) setPersona({ ok: false }) })
        return () => { alive = false }
      }, [])
      const online = !!(st && st.ok)
      const mode = (st && st.mode) || '—'
      const hasKey = !!(st && st.model && st.model.hasKey)
      const personaOK = !!(persona && persona.ok)
      return h('div', { style: S.wrap },
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { ...S.label } }, '弧梦数字中枢 · HELA'),
            h('span', { style: { marginLeft: 'auto', ...S.label, color: online ? '#39c98a' : '#e0a34a' } }, online ? '● 中枢在线' : '○ 未连接')
          ),
          h('div', { style: { ...S.row, marginTop: '8px' } },
            h('span', null, '运行模式：'),
            h('b', null, mode === 'single' ? '单序列' : mode === 'multimodal' ? '多模态' : mode),
            h('button', { style: S.btn, disabled: busy, onClick: () => { setBusy(true); setMode('single'); setTimeout(() => setBusy(false), 800) } }, '切单序列'),
            h('button', { style: S.btn, disabled: busy, onClick: () => { setBusy(true); setMode('multimodal'); setTimeout(() => setBusy(false), 800) } }, '切多模态')
          ),
          h('div', { style: { ...S.row, marginTop: '8px' } },
            h('span', { style: S.label }, '人设卡：'),
            h('span', { style: personaOK ? S.ok : S.bad }, personaOK ? ('已加密 / ' + (persona.source === 'encrypted' ? '加密读取' : '明文读取')) : '未找到'),
            h('span', { style: { marginLeft: '12px', ...S.label } }, '模型 API：'),
            h('span', { style: hasKey ? S.ok : S.bad }, hasKey ? ((st.model.provider || '') + ' / ' + (st.model.model || '')) : '未配置')
          ),
          h('div', { style: { ...S.row, marginTop: '10px' } },
            h('button', { style: S.btn, onClick: () => window.open(API + '/', '_blank') }, '打开完整中枢'),
            h('button', { style: S.btn, onClick: () => window.open(API + '/m', '_blank') }, '打开 H5'),
            h('button', { style: S.btn, onClick: () => fetch(API + '/api/ping').then(() => location.reload()).catch(() => {}) }, '刷新状态')
          )
        ),
        h('div', { style: { ...S.label, lineHeight: 1.9 } },
          '中枢数据目录：' + ((st && st.dataDir) || '—'),
          h('br'),
          '这份设置面板只读取本机中枢（127.0.0.1:8799），不上传任何数据；人设卡与 API Key 都只在本机。'
        )
      )
    }


    async function openHub() {
      try {
        const r = await fetch(API + '/api/ping', { signal: AbortSignal.timeout(700) })
        if (r.ok) { window.open(API + '/', '_blank'); return }
      } catch (e) { /* not running */ }
      try { await fetch('http://127.0.0.1:8795/hub/start') } catch (e) { /* helper absent */ }
      window.open(API + '/', '_blank')
    }

    function ArcHubOrb() {
      const cvRef = React.useRef(null)
      React.useEffect(() => {
        const cv = cvRef.current
        if (!cv) return
        const ctx = cv.getContext('2d')
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = 104, H = 104
        cv.width = W * dpr; cv.height = H * dpr
        cv.style.width = W + 'px'; cv.style.height = H + 'px'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const t0 = performance.now()
        const colors = ['#38e8ff', '#8f7dff', '#ffcf7a', '#ff4fd8']
        const parts = Array.from({ length: 7 }, (_, i) => ({
          r: 1, sp: .45 + (i % 4) * .22, ph: i * 1.07,
          s: 1.2 + (i % 3) * .55, c: colors[i % 4]
        }))
        let raf = 0
        const draw = (now) => {
          const t = (now - t0) / 1000
          ctx.clearRect(0, 0, W, H)
          const cx = W / 2, cy = H / 2
          const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 32)
          g.addColorStop(0, 'rgba(235,255,255,.95)')
          g.addColorStop(.32, 'rgba(56,232,255,.7)')
          g.addColorStop(1, 'rgba(56,232,255,0)')
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 32, 0, 6.283); ctx.fill()
          ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 6.283)
          ctx.fillStyle = 'rgba(6,20,32,.95)'; ctx.fill()
          ctx.strokeStyle = 'rgba(120,240,255,.9)'; ctx.lineWidth = 1.4; ctx.stroke()
          ctx.beginPath(); ctx.arc(cx, cy, 10 + Math.sin(t * 2) * 1.2, 0, 6.283)
          ctx.strokeStyle = 'rgba(255,207,122,.5)'; ctx.lineWidth = .8; ctx.stroke()
          ctx.beginPath(); ctx.ellipse(cx, cy, 38, 24, 0, 0, 6.283)
          ctx.setLineDash([2, 6]); ctx.strokeStyle = 'rgba(120,220,255,.2)'; ctx.stroke(); ctx.setLineDash([])
          for (const p of parts) {
            const a = t * p.sp + p.ph
            const x = cx + Math.cos(a) * 38
            const y = cy + Math.sin(a) * 24
            ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.283)
            ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0
          }
          raf = requestAnimationFrame(draw)
        }
        raf = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(raf)
      }, [])
      return h('div', {
        title: '打开弧梦数字中枢',
        onClick: openHub,
        style: { position: 'fixed', right: '20px', bottom: '118px', width: '104px', height: '104px', cursor: 'pointer', zIndex: 90, borderRadius: '50%', pointerEvents: 'auto' }
      }, h('canvas', { ref: cvRef, style: { display: 'block' } }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'arc-hub',
          order: 60,
          label: '弧梦中枢'
        }, ArcHubSettings))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'arc-hub-orb',
          order: 900,
          label: '弧梦数字中枢'
        }, ArcHubOrb))
      }
    }
  }
})
