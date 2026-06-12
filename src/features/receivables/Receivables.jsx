import { useMemo, useState } from 'react'
import { FileSpreadsheet, History, MessageCircle, Pencil, Search, Trash2, Wallet } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../hooks/useToast'
import { downloadCsv } from '../../lib/csvExport'
import { daysUntil, todayIso } from '../../lib/dateTime'
import { isActiveReceivable } from '../../lib/realDataGuards'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

const today = todayIso
const daysTo = daysUntil

const statusLabels = {
  open: 'Pendiente',
  partial: 'Parcialmente pagada',
  paid: 'Pagada',
  overdue: 'Vencida',
  collection: 'En gestion',
  uncollectible: 'Incobrable',
}

const statusColors = {
  open: '#3B82F6',
  partial: '#F59E0B',
  paid: '#10B981',
  overdue: '#EF4444',
  collection: '#8B5CF6',
  uncollectible: '#6B7280',
}

const tabs = ['Todas', 'Pendiente', 'Vencida', 'Parcial', 'Pagada', 'Gestion', 'Incobrable']

export function Receivables() {
  const toast = useToast()
  const receivables = useERPStore((state) => state.receivables)
  const invoices = useERPStore((state) => state.invoices)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const registerPayment = useERPStore((state) => state.registerPayment)
  const updateReceivable = useERPStore((state) => state.updateReceivable)
  const deleteReceivable = useERPStore((state) => state.deleteReceivable)
  const [tab, setTab] = useState('Todas')
  const [query, setQuery] = useState('')
  const [paying, setPaying] = useState(null)
  const [editing, setEditing] = useState(null)
  const [history, setHistory] = useState(null)
  const [payment, setPayment] = useState({ amount: '', method: 'Efectivo', reference: '', date: today(), comment: '' })
  const [editDraft, setEditDraft] = useState({ total: '', paid: '', balance: '', dueDate: '', status: 'open' })
  const activeReceivables = useMemo(() => receivables.filter((item) => isActiveReceivable(item, invoices, company?.id)), [invoices, receivables, company])

  const statusCounts = useMemo(() => {
    const counts = { Todas: activeReceivables.length }
    tabs.forEach((t) => { if (t !== 'Todas') counts[t] = 0 })
    activeReceivables.forEach((item) => {
      const days = daysTo(item.dueDate)
      const computed = item.status === 'collection' || item.status === 'uncollectible' ? item.status : days < 0 && item.balance > 0 ? 'overdue' : item.status
      const label = { open: 'Pendiente', partial: 'Parcial', paid: 'Pagada', overdue: 'Vencida', collection: 'Gestion', uncollectible: 'Incobrable' }[computed]
      if (label) counts[label] = (counts[label] || 0) + 1
    })
    return counts
  }, [activeReceivables])

  const filtered = useMemo(() => activeReceivables.filter((item) => {
    const days = daysTo(item.dueDate)
    const computedStatus = item.status === 'collection' || item.status === 'uncollectible' ? item.status : days < 0 && item.balance > 0 ? 'overdue' : item.status
    if (tab === 'Todas') return true
    if (tab === 'Pendiente') return computedStatus === 'open'
    if (tab === 'Parcial') return computedStatus === 'partial'
    if (tab === 'Pagada') return computedStatus === 'paid'
    if (tab === 'Vencida') return computedStatus === 'overdue'
    if (tab === 'Gestion') return computedStatus === 'collection'
    if (tab === 'Incobrable') return computedStatus === 'uncollectible'
    return true
  }).filter((item) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (item.customerName || '').toLowerCase().includes(q)
      || (item.invoiceNumber || '').toLowerCase().includes(q)
      || (item.status || '').toLowerCase().includes(q)
  }), [activeReceivables, tab, query])
  const total = filtered.reduce((sum, item) => sum + Number(item.balance || 0), 0)

  function savePayment() {
    try {
      registerPayment({ invoiceId: paying.invoiceId, ...payment, amount: parseMoney(payment.amount) })
      toast.success('Pago registrado correctamente.')
      setPaying(null)
      setPayment({ amount: '', method: 'Efectivo', reference: '', date: today(), comment: '' })
    } catch (error) {
      toast.error(error.message)
    }
  }

  function openPayment(row) {
    setPaying(row)
    setPayment({ amount: moneyInput(row.balance), method: 'Efectivo', reference: '', date: today(), comment: '' })
  }

  function openEdit(row) {
    setEditing(row)
    setEditDraft({
      total: moneyInput(row.total),
      paid: moneyInput(row.paid),
      balance: moneyInput(row.balance),
      dueDate: row.dueDate || today(),
      status: row.status || 'open',
    })
  }

  function saveEdit() {
    try {
      updateReceivable(editing.id, {
        total: parseMoney(editDraft.total),
        paid: parseMoney(editDraft.paid),
        balance: parseMoney(editDraft.balance),
        dueDate: editDraft.dueDate,
        status: editDraft.status,
      })
      toast.success('Cuenta por cobrar actualizada.')
      setEditing(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function setStatus(row, newStatus) {
    try {
      updateReceivable(row.id, { status: newStatus })
      toast.success(`Estado cambiado a ${statusLabels[newStatus] || newStatus}.`)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function removeReceivable(row) {
    if (!window.confirm(`Eliminar la cuenta por cobrar de la factura ${row.invoiceNumber}?`)) return
    try {
      deleteReceivable(row.id)
      toast.success('Cuenta por cobrar eliminada.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function exportAging() {
    const rows = customers.map((customer) => {
      const own = activeReceivables.filter((item) => item.customerId === customer.id && item.balance > 0)
      return own.reduce((row, item) => {
        const late = Math.max(-daysTo(item.dueDate), 0)
        const bucket = late <= 30 ? '0-30' : late <= 60 ? '31-60' : late <= 90 ? '61-90' : '+90'
        row[bucket] += item.balance
        row.Total += item.balance
        return row
      }, { Cliente: customer.name, '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0, Total: 0 })
    }).filter((row) => row.Total > 0)
    downloadCsv('trifusion-aging.csv', rows)
  }

  return (
    <div className="space-y-5">
      <section className="module-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase" style={{ color: 'var(--color-pending)' }}>Cuentas por cobrar</p>
            <h2 className="font-display text-3xl font-bold">CxC y gestion de cobros</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{filtered.length} facturas | {currency.format(total)} pendientes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid var(--line)', background: 'var(--bg-input)' }}>
              <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
              <input id="receivable-query" name="receivable-query" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar cliente, factura, estado" />
            </div>
            <Button variant="ghost" icon={FileSpreadsheet} onClick={exportAging}>Aging Excel</Button>
          </div>
        </div>
      </section>

      <section className="module-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${tab === item ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>
              {item}
              {statusCounts[item] > 0 ? (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: tab === item ? 'rgba(59,130,246,.25)' : 'rgba(255,255,255,.1)' }}>{statusCounts[item]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <DataTable data={filtered} columns={[
          { header: 'Cliente', accessorKey: 'customerName' },
          { header: 'Factura', accessorKey: 'invoiceNumber' },
          { header: 'Vence', cell: ({ row }) => <DueDateCell item={row.original} /> },
          { header: 'Total', cell: ({ row }) => currency.format(roundMoney(row.original.total)) },
          { header: 'Abonado', cell: ({ row }) => currency.format(roundMoney(row.original.paid)) },
          { header: 'Balance', cell: ({ row }) => <span style={{ color: row.original.balance > 0 ? 'var(--color-pending)' : 'var(--color-income)' }}>{currency.format(roundMoney(row.original.balance))}</span> },
          { header: 'Dias', cell: ({ row }) => <DaysCell item={row.original} /> },
          { header: 'Estado', cell: ({ row }) => <Status item={row.original} /> },
          { header: 'Acciones', cell: ({ row }) => <Actions row={row.original} onPay={openPayment} onEdit={openEdit} onDelete={removeReceivable} onRemind={remind} onStatus={setStatus} customers={customers} company={company} onHistory={setHistory} /> },
        ]} />
      </section>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title="Registrar pago" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPaying(null)}>Cancelar</Button><Button variant="success" onClick={savePayment}>Confirmar pago</Button></div>}>
        {paying ? <div className="grid gap-3"><p style={{ color: 'rgba(255,255,255,.6)' }}>Factura: <b>{paying.invoiceNumber}</b> | Cliente: <b>{paying.customerName}</b> | Vence: {paying.dueDate}</p><p style={{ color: 'rgba(255,255,255,.6)' }}>Total: {currency.format(roundMoney(paying.total))} | Abonado: {currency.format(roundMoney(paying.paid))} | <b>Balance: {currency.format(roundMoney(paying.balance))}</b></p><div className="grid gap-3 md:grid-cols-2"><Input label="Monto" name="payment-amount" type="number" step="0.01" min="0" value={payment.amount} onChange={(v) => setPayment((s) => ({ ...s, amount: v }))} /><Select label="Metodo" name="payment-method" value={payment.method} onChange={(v) => setPayment((s) => ({ ...s, method: v }))} options={['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque']} /><Input label="Referencia" name="payment-reference" value={payment.reference} onChange={(v) => setPayment((s) => ({ ...s, reference: v }))} /><Input label="Fecha" name="payment-date" type="date" value={payment.date} onChange={(v) => setPayment((s) => ({ ...s, date: v }))} /><div className="md:col-span-2"><Input label="Comentario" name="payment-comment" value={payment.comment} onChange={(v) => setPayment((s) => ({ ...s, comment: v }))} /></div></div></div> : null}
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar cuenta por cobrar" size="md" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button variant="success" onClick={saveEdit}>Guardar cambios</Button></div>}>
        {editing ? <div className="grid gap-3 md:grid-cols-2"><Input label="Total" name="edit-total" type="number" step="0.01" min="0" value={editDraft.total} onChange={(v) => setEditDraft((s) => ({ ...s, total: v, balance: moneyInput(Math.max(parseMoney(v) - parseMoney(s.paid), 0)) }))} /><Input label="Pagado" name="edit-paid" type="number" step="0.01" min="0" value={editDraft.paid} onChange={(v) => setEditDraft((s) => ({ ...s, paid: v, balance: moneyInput(Math.max(parseMoney(s.total) - parseMoney(v), 0)) }))} /><Input label="Balance" name="edit-balance" type="number" step="0.01" min="0" value={editDraft.balance} onChange={(v) => setEditDraft((s) => ({ ...s, balance: v }))} /><Input label="Vencimiento" name="edit-due-date" type="date" value={editDraft.dueDate} onChange={(v) => setEditDraft((s) => ({ ...s, dueDate: v }))} /><Select label="Estado" name="edit-status" value={editDraft.status} onChange={(v) => setEditDraft((s) => ({ ...s, status: v }))} options={['open', 'partial', 'paid', 'overdue', 'collection', 'uncollectible']} /></div> : null}
      </Modal>
      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title="Historial de abonos" size="lg">
        {history ? <div className="space-y-3"><p className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>Factura: <b>{history.invoiceNumber}</b> | Cliente: <b>{history.customerName}</b> | Balance: <b>{currency.format(roundMoney(history.balance))}</b></p><DataTable data={history.payments || []} columns={[
          { header: 'Fecha/Hora', cell: ({ row }) => formatDate(row.original.createdAt || row.original.date) },
          { header: 'Usuario', accessorKey: 'user' },
          { header: 'Metodo', accessorKey: 'method' },
          { header: 'Referencia', accessorKey: 'reference' },
          { header: 'Comentario', accessorKey: 'comment' },
          { header: 'Monto', cell: ({ row }) => currency.format(row.original.amount) },
          { header: 'Balance ant.', cell: ({ row }) => currency.format(row.original.balanceBefore || 0) },
          { header: 'Balance nuevo', cell: ({ row }) => currency.format(row.original.balanceAfter || 0) },
        ]} emptyText="No hay abonos registrados." /></div> : null}
      </Modal>
    </div>
  )
}

function DueDateCell({ item }) {
  const overdue = daysTo(item.dueDate) < 0 && item.balance > 0
  return <span style={{ color: overdue ? 'var(--color-alert)' : undefined }}>{item.dueDate || '-'}</span>
}

function DaysCell({ item }) {
  const days = daysTo(item.dueDate)
  const balance = Number(item.balance || 0)
  if (balance <= 0 || days >= 0) return <span>{days}</span>
  return <span className="font-bold" style={{ color: days < -90 ? 'var(--color-alert)' : 'var(--color-pending)' }}>{days}</span>
}

function Status({ item }) {
  const days = daysTo(item.dueDate)
  const computedStatus = item.status === 'collection' || item.status === 'uncollectible' ? item.status : days < 0 && item.balance > 0 ? 'overdue' : item.status
  const color = statusColors[computedStatus] || '#6B7280'
  const text = statusLabels[computedStatus] || computedStatus
  return <span className="inline-flex items-center gap-2"><span className="h-2 w-8 rounded-full" style={{ background: color }} />{text}</span>
}

function Actions({ row, onPay, onEdit, onDelete, onRemind, onHistory, customers, company }) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="flex gap-1">
      <Icon icon={Wallet} disabled={roundMoney(row.balance) <= 0} onClick={() => onPay(row)} />
      <Icon icon={Pencil} onClick={() => onEdit(row)} />
      <Icon icon={History} onClick={() => onHistory(row)} />
      <Icon icon={MessageCircle} onClick={() => onRemind(row, customers, company)} />
      <div className="relative">
        <button onClick={() => setMenu(!menu)} className="rounded-md border p-2 text-xs font-bold transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.65)' }}>...</button>
        {menu ? <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border p-1 shadow-2xl" style={{ borderColor: 'var(--line)', background: 'var(--bg-surface)' }} onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { onStatus(row, 'collection'); setMenu(false) }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/[0.06]">Marcar en gestion</button>
          <button onClick={() => { onStatus(row, 'uncollectible'); setMenu(false) }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/[0.06]" style={{ color: 'rgb(254,202,202)' }}>Marcar incobrable</button>
          <button onClick={() => { onStatus(row, 'open'); setMenu(false) }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/[0.06]">Reabrir pendiente</button>
          <button onClick={() => { onDelete(row); setMenu(false) }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/[0.06]" style={{ color: 'rgb(254,202,202)' }}>Eliminar</button>
        </div> : null}
      </div>
    </div>
  )
}

function Icon({ icon: IconSvg, onClick, disabled = false }) { return <button disabled={disabled} onClick={onClick} className="rounded-md border p-2 transition disabled:cursor-not-allowed disabled:opacity-35" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.65)' }}><IconSvg size={15} /></button> }
function Input({ label, value, onChange, type = 'text', step, min, name }) { return <label><span className="label-dark">{label}</span><input id={name} name={name} type={type} step={step} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="input-dark" /></label> }
function Select({ label, value, onChange, options, name }) { return <label><span className="label-dark">{label}</span><select id={name} name={name} value={value} onChange={(e) => onChange(e.target.value)} className="input-dark">{options.map((option) => <option key={option}>{option}</option>)}</select></label> }
function remind(item, customers, company) { const customer = customers.find((c) => c.id === item.customerId); window.open(`https://wa.me/${customer?.whatsapp || company.whatsapp}?text=${encodeURIComponent(`Estimado ${item.customerName}, le recordamos que tiene una factura No. ${item.invoiceNumber} por ${currency.format(item.balance)} con vencimiento el ${item.dueDate}. Para consultas: ${company.phone || company.whatsapp}. Gracias.`)}`) }
function roundMoney(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100 }
function parseMoney(value) { return roundMoney(String(value || '0').replace(',', '.')) }
function moneyInput(value) { return roundMoney(value).toFixed(2) }
