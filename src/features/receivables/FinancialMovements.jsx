import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, Download, FileSpreadsheet, Pencil, Printer, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../hooks/useToast'
import { downloadCsv } from '../../lib/csvExport'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

const typeConfig = {
  ingreso: { icon: ArrowDownCircle, color: 'var(--color-income)', bg: 'rgba(16,185,129,.12)' },
  income: { icon: ArrowDownCircle, color: 'var(--color-income)', bg: 'rgba(16,185,129,.12)' },
  pago: { icon: ArrowDownCircle, color: 'var(--color-income)', bg: 'rgba(16,185,129,.12)' },
  egreso: { icon: ArrowUpCircle, color: 'var(--color-alert)', bg: 'rgba(239,68,68,.12)' },
  expense: { icon: ArrowUpCircle, color: 'var(--color-alert)', bg: 'rgba(239,68,68,.12)' },
  gasto: { icon: ArrowUpCircle, color: 'var(--color-alert)', bg: 'rgba(239,68,68,.12)' },
  transferencia: { icon: RefreshCw, color: 'var(--color-nav)', bg: 'rgba(59,130,246,.12)' },
  transfer: { icon: RefreshCw, color: 'var(--color-nav)', bg: 'rgba(59,130,246,.12)' },
}

function getTypeConfig(type) {
  return typeConfig[String(type || '').toLowerCase()] || { icon: RefreshCw, color: 'var(--text-secondary)', bg: 'rgba(255,255,255,.06)' }
}

export function FinancialMovements() {
  const toast = useToast()
  const movements = useERPStore((state) => state.financialMovements || [])
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const filtered = useMemo(() => {
    let result = movements
    if (query) {
      const q = query.toLowerCase()
      result = result.filter((m) =>
        (m.documentNumber || '').toLowerCase().includes(q)
        || (m.customerName || '').toLowerCase().includes(q)
        || (m.type || '').toLowerCase().includes(q)
        || (m.method || '').toLowerCase().includes(q)
        || (m.observations || '').toLowerCase().includes(q)
      )
    }
    if (typeFilter !== 'all') {
      result = result.filter((m) => String(m.type || '').toLowerCase() === typeFilter.toLowerCase())
    }
    if (dateFrom) {
      result = result.filter((m) => String(m.createdAt || m.date || '').slice(0, 10) >= dateFrom)
    }
    if (dateTo) {
      result = result.filter((m) => String(m.createdAt || m.date || '').slice(0, 10) <= dateTo)
    }
    return result
  }, [movements, query, typeFilter, dateFrom, dateTo])

  const types = useMemo(() => [...new Set(movements.map((m) => m.type).filter(Boolean))], [movements])

  function openEdit(movement) {
    setEditing(movement)
    setEditForm({
      type: movement.type || '',
      method: movement.method || '',
      amount: String(movement.amount || '0'),
      observations: movement.observations || '',
      reference: movement.reference || '',
    })
  }

  function saveEdit() {
    try {
      const state = useERPStore.getState()
      const updated = (state.financialMovements || []).map((m) =>
        m.id === editing.id
          ? { ...m, ...editForm, amount: Number(editForm.amount), updatedAt: new Date().toISOString() }
          : m
      )
      useERPStore.setState({ financialMovements: updated })
      toast.success('Movimiento actualizado.')
      setEditing(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function deleteMovement(movement) {
    if (!window.confirm(`Eliminar movimiento ${movement.id}?`)) return
    try {
      const state = useERPStore.getState()
      useERPStore.setState({
        financialMovements: (state.financialMovements || []).filter((m) => m.id !== movement.id),
      })
      toast.success('Movimiento eliminado.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function exportCsv() {
    const rows = filtered.map((m) => ({
      ID: m.id || '',
      Fecha: m.date || '',
      Hora: m.time || '',
      Usuario: m.user || '',
      Tipo: m.type || '',
      Documento: m.documentNumber || '',
      Cliente: m.customerName || '',
      Monto: m.amount || 0,
      Comentario: m.observations || '',
    }))
    downloadCsv('movimientos-financieros.csv', rows)
  }

  function printMovements() {
    window.print()
  }

  return (
    <div className="space-y-5">
      <section className="module-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase" style={{ color: 'var(--color-info)' }}>Modulo financiero</p>
            <h2 className="font-display text-3xl font-bold">Movimientos financieros</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Registro automatico de facturas, creditos, abonos, ajustes, reversiones y cobros. {filtered.length} movimiento(s).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" icon={Printer} onClick={printMovements}>Imprimir</Button>
            <Button variant="primary" icon={FileSpreadsheet} onClick={exportCsv}>Exportar CSV</Button>
          </div>
        </div>
      </section>

      <section className="module-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', background: 'var(--bg-input)' }}>
            <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
            <input id="financial-query" name="financial-query" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar por documento, cliente, tipo, metodo, comentario..." />
          </div>
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            <CalendarDays size={14} />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-dark max-w-36" />
            <span>-</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-dark max-w-36" />
          </label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-dark max-w-40">
            <option value="all">Todos los tipos</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-4">
          <DataTable data={filtered} columns={[
            { header: 'ID', cell: ({ row }) => <span className="text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>{row.original.id?.slice(0, 12)}...</span> },
            { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt || row.original.date) },
            { header: 'Usuario', accessorKey: 'user' },
            { header: 'Tipo', cell: ({ row }) => <TypeBadge type={row.original.type} /> },
            { header: 'Documento', accessorKey: 'documentNumber' },
            { header: 'Cliente', accessorKey: 'customerName' },
            { header: 'Monto', cell: ({ row }) => <span style={{ color: getTypeConfig(row.original.type).color }}>{currency.format(row.original.amount || 0)}</span> },
            { header: 'Comentario', accessorKey: 'observations' },
            { header: 'Acciones', cell: ({ row }) => (
              <div className="flex gap-1">
                <button onClick={() => openEdit(row.original)} className="rounded-md border p-2 transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.65)' }} title="Editar"><Pencil size={15} /></button>
                <button onClick={() => deleteMovement(row.original)} className="rounded-md border p-2 transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.65)' }} title="Eliminar"><Trash2 size={15} /></button>
              </div>
            )},
          ]} />
        </div>
      </section>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar movimiento" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="success" onClick={saveEdit}>Guardar</Button></div>}>
        {editing ? <div className="grid gap-3 md:grid-cols-2">
          <Input label="Tipo" name="financial-type" value={editForm.type} onChange={(v) => setEditForm((s) => ({ ...s, type: v }))} />
          <Input label="Metodo" name="financial-method" value={editForm.method} onChange={(v) => setEditForm((s) => ({ ...s, method: v }))} />
          <Input label="Monto" name="financial-amount" type="number" step="0.01" value={editForm.amount} onChange={(v) => setEditForm((s) => ({ ...s, amount: v }))} />
          <Input label="Referencia" name="financial-reference" value={editForm.reference} onChange={(v) => setEditForm((s) => ({ ...s, reference: v }))} />
          <div className="md:col-span-2"><Input label="Observaciones" name="financial-observations" value={editForm.observations} onChange={(v) => setEditForm((s) => ({ ...s, observations: v }))} /></div>
        </div> : null}
      </Modal>
    </div>
  )
}

function TypeBadge({ type }) {
  const config = getTypeConfig(type)
  const Icon = config.icon
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ background: config.bg, color: config.color }}>
      <Icon size={12} /> {type || 'Movimiento'}
    </span>
  )
}

function Input({ label, value, onChange, type = 'text', step, name }) {
  return <label><span className="label-dark">{label}</span><input id={name} name={name} type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label>
}
