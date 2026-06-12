import { motion } from 'framer-motion'

export function MetricCard({ label, value, detail, miniStats = [], icon: Icon, accent = 'blue', actionLabel = '', onAction, onOpen, openLabel = 'Abrir modulo' }) {
  const colors = {
    blue: { from: 'from-blue-500/25', text: 'text-blue-200', border: 'border-blue-500/25', shadow: 'shadow-blue-500/15', iconBg: 'bg-blue-500/15', iconGlow: 'shadow-blue-400/20' },
    green: { from: 'from-emerald-500/25', text: 'text-emerald-200', border: 'border-emerald-500/25', shadow: 'shadow-emerald-500/15', iconBg: 'bg-emerald-500/15', iconGlow: 'shadow-emerald-400/20' },
    amber: { from: 'from-amber-500/25', text: 'text-amber-200', border: 'border-amber-500/25', shadow: 'shadow-amber-500/15', iconBg: 'bg-amber-500/15', iconGlow: 'shadow-amber-400/20' },
    red: { from: 'from-red-500/25', text: 'text-red-200', border: 'border-red-500/25', shadow: 'shadow-red-500/15', iconBg: 'bg-red-500/15', iconGlow: 'shadow-red-400/20' },
    cyan: { from: 'from-cyan-500/25', text: 'text-cyan-200', border: 'border-cyan-500/25', shadow: 'shadow-cyan-500/15', iconBg: 'bg-cyan-500/15', iconGlow: 'shadow-cyan-400/20' },
    violet: { from: 'from-violet-500/25', text: 'text-violet-200', border: 'border-violet-500/25', shadow: 'shadow-violet-500/15', iconBg: 'bg-violet-500/15', iconGlow: 'shadow-violet-400/20' },
  }
  const c = colors[accent] || colors.blue
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={`metric-card group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${c.border} ${c.shadow} ${onOpen ? 'cursor-pointer' : ''}`}
      style={{ background: 'linear-gradient(180deg, rgba(17,17,24,.96), rgba(13,14,21,.96))', boxShadow: 'inset 0 1px rgba(255,255,255,.04), 0 20px 60px rgba(0,0,0,.22)' }}
    >
      <div className={`pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`} style={{ boxShadow: `inset 0 0 20px color-mix(in srgb, var(--${accent}) 20%, transparent), 0 0 30px color-mix(in srgb, var(--${accent}) 10%, transparent)` }} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.38)' }}>{label}</p>
          <p className="mt-1.5 truncate text-2xl font-black text-white tracking-tight">{value}</p>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>{detail}</p>
          {miniStats.length ? (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {miniStats.slice(0, 4).map((stat) => (
                <div key={stat.label} className={`rounded-lg border px-2 py-1.5 ${c.border}`} style={{ background: `color-mix(in srgb, var(--${accent}) 6%, transparent)` }}>
                  <p className="truncate text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.32)' }}>{stat.label}</p>
                  <p className="truncate text-xs font-bold" style={{ color: 'rgba(255,255,255,.82)' }}>{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {onOpen ? (
              <span className={`rounded-md border px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition-all duration-200 group-hover:scale-105 ${c.border} ${c.text}`} style={{ background: `color-mix(in srgb, var(--${accent}) 10%, transparent)` }}>
                {openLabel}
              </span>
            ) : null}
            {actionLabel && onAction ? <button type="button" onClick={(event) => { event.stopPropagation(); onAction() }} className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/[0.09] hover:text-white">{actionLabel}</button> : null}
          </div>
        </div>
        <div className={`relative shrink-0 rounded-xl bg-gradient-to-br ${c.from} to-transparent p-2.5 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl ${c.iconGlow}`}>
          <Icon size={20} className={c.text} />
        </div>
      </div>
    </motion.div>
  )
}
