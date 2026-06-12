import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Lock, Plus, Printer, Trash2, Unlock, AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { DataTable } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { buildCashCutReport } from '../../lib/cashDeskEngine'
import { downloadCsv } from '../../lib/csvExport'
import { dayKeyInSystemZone, todayIso } from '../../lib/dateTime'
import { currency, formatDate } from '../../lib/formatters'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'

const movementCategories = ['Gastos', 'Compras', 'Transporte', 'Mensajeria', 'Servicios', 'Mantenimiento', 'Retiros', 'Ingresos extraordinarios', 'Ajustes']
const periodOptions = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
  { id: 'all', label: 'Todo' },
]

export function CashDesk() {
  const toast = useToast()
  const company = useERPStore((state) => state.company)
  const branches = useERPStore((state) => state.branches)
  const invoices = useERPStore((state) => state.invoices)
  const creditNotes = useERPStore((state) => state.creditNotes)
  const expenses = useERPStore((state) => state.expenses)
  const receivables = useERPStore((state) => state.receivables)
  const payments = useERPStore((state) => state.payments)
  const cash = useERPStore((state) => state.cashRegister)
  const currentUser = useERPStore((state) => state.currentUser)
  const openCashRegister = useERPStore((state) => state.openCashRegister)
  const closeCashRegister = useERPStore((state) => state.closeCashRegister)
  const registerCashMovement = useERPStore((state) => state.registerCashMovement)
  const deleteCashMovement = useERPStore((state) => state.deleteCashMovement)
  const [openForm, setOpenForm] = useState({
    amount: cash.counted || 0,
    branchId: branches[0]?.id || '',
    branchName: branches[0]?.name || '',
    cashName: cash.name || 'Caja principal',
    cashier: currentUser?.name || 'Usuario',
  })
  const [counted, setCounted] = useState(cash.counted || 0)
  const [movement, setMovement] = useState({ type: 'expense', category: 'Gastos', amount: '', method: 'Efectivo', concept: '', reference: '' })
  const [movementPeriod, setMovementPeriod] = useState('day')
  const [closeConfirm, setCloseConfirm] = useState(false)
  const report = useMemo(() => buildCashCutReport({ cashRegister: { ...cash, counted }, invoices, creditNotes, expenses, receivables, payments, company, branches }), [branches, cash, company, counted, creditNotes, expenses, invoices, payments, receivables])
  const manualMovements = useMemo(() => (report.movements || [])
    .filter((item) => isManualMovement(item))
    .filter((item) => inMovementPeriod(item.createdAt, movementPeriod))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))), [movementPeriod, report.movements])
  const manualSummary = useMemo(() => summarizeManualMovements(manualMovements), [manualMovements])

  function setOpenField(key, value) {
    setOpenForm((state) => ({ ...state, [key]: value }))
  }

  function selectBranch(branchId) {
    const branch = branches.find((item) => item.id === branchId)
    setOpenForm((state) => ({ ...state, branchId, branchName: branch?.name || '' }))
  }

  function submitMovement(event) {
    event.preventDefault()
    try {
      registerCashMovement(movement)
      setMovement({ type: 'expense', category: 'Gastos', amount: '', method: 'Efectivo', concept: '', reference: '' })
      toast.success('Movimiento registrado y caja recalculada.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleClose() {
    try {
      closeCashRegister(counted)
      toast.success('Caja cerrada correctamente.')
      setCloseConfirm(false)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function removeMovement(row) {
    if (row.type === 'opening') {
      toast.error('La apertura de caja no se elimina; cierre y abra una caja nueva si necesita corregirla.')
      return
    }
    if (!isManualMovement(row)) {
      toast.error('Este movimiento pertenece a un documento del sistema. Corrija el documento original para recalcular caja.')
      return
    }
    if (!window.confirm(`Eliminar el movimiento "${row.concept || row.type}"?`)) return
    try {
      deleteCashMovement(row.id, 'Eliminacion confirmada desde caja')
      toast.success('Movimiento eliminado y caja recalculada.')
    } catch (error) {
      toast.error(error.message)
    }
  }

  async function exportCutPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(report.companyName || 'Cierre de caja', 14, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`RNC: ${report.rnc || 'N/A'} | Sucursal: ${report.branchName} | Caja: ${report.cashName} | Cajero: ${report.cashier}`, 14, 21)
    doc.text(`Apertura: ${formatDate(report.openedAt)} | Cierre: ${report.closedAt ? formatDate(report.closedAt) : 'En curso'}`, 14, 27)
    autoTable(doc, {
      startY: 34,
      head: [['Concepto', 'Monto']],
      body: [
        ['Fondo inicial', currency.format(report.openingAmount)],
        ['Ventas totales', currency.format(report.grossSales)],
        ['Devoluciones / notas credito', currency.format(report.returns)],
        ['Descuentos', currency.format(report.discounts)],
        ['ITBIS', currency.format(report.tax)],
        ['Gastos', currency.format(report.expenses)],
        ['Balance calculado de caja', currency.format(report.expected)],
        ['Efectivo contado', currency.format(report.counted)],
        ['Diferencia', currency.format(report.difference)],
      ],
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    })
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Metodo', 'Ventas', 'Devoluciones', 'Neto']],
      body: report.byMethod.map((item) => [item.method, currency.format(item.sales), currency.format(item.refunds), currency.format(item.net)]),
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    })
    doc.save('cierre-caja-profesional.pdf')
  }

  function exportManualCsv() {
    downloadCsv(`movimientos-manuales-${movementPeriod}.csv`, manualMovements.map((item) => ({
      Fecha: formatDate(item.createdAt),
      Tipo: movementTypeLabel(item.type),
      Categoria: item.category || '',
      Metodo: item.method || '',
      Concepto: item.concept || item.note || '',
      Referencia: item.reference || '',
      Monto: signedManualAmount(item),
    })))
  }

  return (
    <div className="space-y-5">
      <section className="module-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase" style={{ color: 'rgb(191,219,254)' }}>Caja profesional</p>
            <h2 className="font-display text-3xl font-bold">Apertura, movimientos y corte diario</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Control tactil para POS, tablets y arqueos con auditoria del estado actual.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="ghost" icon={Printer} onClick={() => window.print()}>Imprimir corte</Button>
            <Button variant="primary" icon={Download} onClick={exportCutPdf}>PDF corte</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="font-display text-xl font-bold">Apertura y cierre</h3>
          <div className="mt-4 rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
            <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Estado</p>
            <p className={cash.status === 'open' ? 'mt-2 text-3xl font-extrabold' : 'mt-2 text-3xl font-extrabold'} style={{ color: cash.status === 'open' ? 'var(--color-income)' : 'var(--color-alert)' }}>{cash.status === 'open' ? 'Abierta' : 'Cerrada'}</p>
            <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Apertura: {formatDate(cash.openedAt)}</p>
          </div>

          <div className="mt-4 grid gap-3">
            <label><span className="label-dark">Sucursal</span><select id="cash-branch" name="cash-branch" value={openForm.branchId} onChange={(event) => selectBranch(event.target.value)} className="input-dark"><option value="">Sucursal principal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label><span className="label-dark">Caja</span><input id="cash-name" name="cash-name" value={openForm.cashName} onChange={(event) => setOpenField('cashName', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Cajero</span><input id="cash-cashier" name="cash-cashier" value={openForm.cashier} onChange={(event) => setOpenField('cashier', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Monto inicial</span><input id="cash-opening-amount" name="cash-opening-amount" type="number" value={openForm.amount} onChange={(event) => setOpenField('amount', event.target.value)} className="input-dark" /></label>
            <label><span className="label-dark">Efectivo contado al cierre</span><input id="cash-counted" name="cash-counted" type="number" value={counted} onChange={(event) => setCounted(event.target.value)} className="input-dark" /></label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button icon={Unlock} variant="success" onClick={() => openCashRegister(openForm)}>Abrir caja</Button>
            <Button icon={Lock} variant="danger" onClick={() => setCloseConfirm(true)}>Cerrar caja</Button>
          </div>
        </div>

        <div className="printable-report panel rounded-lg p-4 sm:p-5">
          <h3 className="font-display text-xl font-bold">Corte de caja</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Total label="Ventas" value={report.grossSales} />
            <Total label="Balance calculado" value={report.expected} />
            <Total label="Contado" value={report.counted} />
            <Total label="Diferencia" value={report.difference} danger={Math.abs(report.difference) > 0.01} />
            <Total label="Transferencias" value={report.byMethod.find((item) => item.method === 'Transferencia')?.net || 0} />
            <Total label="Tarjetas" value={report.byMethod.find((item) => item.method === 'Tarjeta')?.net || 0} />
            <Total label="Credito" value={report.byMethod.find((item) => item.method === 'Credito')?.net || 0} />
            <Total label="Notas credito" value={report.returns} />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <DataTable data={report.byMethod} columns={methodColumns} initialPageSize={8} emptyText="Sin pagos en el corte." />
            <DataTable data={report.movements || []} columns={movementColumns(removeMovement)} initialPageSize={8} emptyText="Sin movimientos de caja." />
          </div>
        </div>
      </section>

      <section className="module-surface p-4 sm:p-5">
        <h3 className="font-display text-xl font-bold">Movimiento manual</h3>
        <form onSubmit={submitMovement} className="mt-4 grid gap-3 lg:grid-cols-[.7fr_.85fr_.7fr_.7fr_1fr_1fr_auto]">
          <label><span className="label-dark">Tipo</span><select id="cash-movement-type" name="cash-movement-type" value={movement.type} onChange={(event) => setMovement((state) => ({ ...state, type: event.target.value }))} className="input-dark"><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="withdrawal">Retiro</option></select></label>
          <label><span className="label-dark">Categoria</span><select id="cash-movement-category" name="cash-movement-category" value={movement.category} onChange={(event) => setMovement((state) => ({ ...state, category: event.target.value }))} className="input-dark">{movementCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label><span className="label-dark">Metodo</span><select id="cash-movement-method" name="cash-movement-method" value={movement.method} onChange={(event) => setMovement((state) => ({ ...state, method: event.target.value }))} className="input-dark"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></label>
          <label><span className="label-dark">Monto</span><input id="cash-movement-amount" name="cash-movement-amount" type="number" value={movement.amount} onChange={(event) => setMovement((state) => ({ ...state, amount: event.target.value }))} className="input-dark" /></label>
          <label><span className="label-dark">Concepto</span><input id="cash-movement-concept" name="cash-movement-concept" value={movement.concept} onChange={(event) => setMovement((state) => ({ ...state, concept: event.target.value }))} className="input-dark" /></label>
          <label><span className="label-dark">Referencia</span><input id="cash-movement-reference" name="cash-movement-reference" value={movement.reference} onChange={(event) => setMovement((state) => ({ ...state, reference: event.target.value }))} className="input-dark" /></label>
          <Button icon={Plus} variant="primary" className="self-end" type="submit">Registrar</Button>
        </form>
      </section>

      <section className="printable-report panel rounded-lg p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">Reporte de movimientos manuales</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Entradas y salidas registradas manualmente, separadas de facturacion, inventario, CxC y CxP.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <select id="cash-period-filter" name="cash-period-filter" value={movementPeriod} onChange={(event) => setMovementPeriod(event.target.value)} className="input-dark max-w-40">{periodOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <Button variant="ghost" icon={FileSpreadsheet} onClick={exportManualCsv}>Excel</Button>
            <Button variant="ghost" icon={Printer} onClick={() => window.print()}>Imprimir</Button>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Total label="Ingresos manuales" value={manualSummary.income} />
          <Total label="Salidas manuales" value={manualSummary.outflow} danger={manualSummary.outflow > 0} />
          <Total label="Balance manual" value={manualSummary.net} danger={manualSummary.net < 0} />
        </div>
        <DataTable data={manualMovements} columns={manualMovementColumns(removeMovement)} initialPageSize={15} emptyText="Sin movimientos manuales para este periodo." searchPlaceholder="Buscar categoria, concepto, referencia o metodo..." />
      </section>

      <Modal
        open={closeConfirm}
        onClose={() => setCloseConfirm(false)}
        title="Confirmar cierre de caja"
        description="Revise el efectivo contado antes de cerrar. El cierre es irreversible hasta una nueva apertura."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCloseConfirm(false)}>Cancelar</Button><Button variant="danger" icon={Lock} onClick={handleClose}>Confirmar cierre</Button></div>}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg p-4" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)' }}>
            <AlertTriangle size={24} style={{ color: 'var(--color-pending)' }} />
            <div>
              <p className="font-bold" style={{ color: 'rgb(252,211,77)' }}>Diferencia detectada: {currency.format(report.difference)}</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,.6)' }}>Balance calculado: {currency.format(report.expected)} vs contado: {currency.format(report.counted)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,.035)' }}>
              <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Total ventas</p>
              <p className="font-display text-xl font-bold">{currency.format(report.grossSales)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,.035)' }}>
              <p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>Gastos</p>
              <p className="font-display text-xl font-bold">{currency.format(report.expenses)}</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Total({ label, value, danger }) {
  return <div className="rounded-lg p-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.04)' }}><p className="text-xs font-extrabold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>{label}</p><p className={`mt-1 font-display text-2xl font-bold ${danger ? 'text-red-300' : ''}`}>{currency.format(value || 0)}</p></div>
}

const methodColumns = [
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Ventas', cell: ({ row }) => currency.format(row.original.sales || 0) },
  { header: 'Devoluciones', cell: ({ row }) => currency.format(row.original.refunds || 0) },
  { header: 'Neto', cell: ({ row }) => currency.format(row.original.net || 0) },
]

const movementColumns = (removeMovement) => [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt) },
  { header: 'Tipo', cell: ({ row }) => movementTypeLabel(row.original.type) },
  { header: 'Categoria', accessorKey: 'category' },
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Concepto', cell: ({ row }) => row.original.concept || row.original.note || '' },
  { header: 'Monto', cell: ({ row }) => currency.format(row.original.amount || 0) },
  { header: 'Acciones', cell: ({ row }) => isManualMovement(row.original) ? <button type="button" onClick={() => removeMovement(row.original)} className="rounded-md border p-2 transition" style={{ borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' }} aria-label="Eliminar movimiento"><Trash2 size={15} /></button> : <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,.35)' }}>Sistema</span> },
]

const manualMovementColumns = (removeMovement) => [
  { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt) },
  { header: 'Tipo', cell: ({ row }) => movementTypeLabel(row.original.type) },
  { header: 'Categoria', accessorKey: 'category' },
  { header: 'Metodo', accessorKey: 'method' },
  { header: 'Concepto', cell: ({ row }) => row.original.concept || row.original.note || '' },
  { header: 'Referencia', accessorKey: 'reference' },
  { header: 'Monto', cell: ({ row }) => currency.format(signedManualAmount(row.original)) },
  { header: 'Acciones', cell: ({ row }) => <button type="button" onClick={() => removeMovement(row.original)} className="no-print rounded-md border p-2 transition" style={{ borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.1)', color: 'rgb(254,202,202)' }} aria-label="Eliminar movimiento"><Trash2 size={15} /></button> },
]

function isManualMovement(movement) {
  return movement?.source === 'manual' || movementCategories.includes(movement?.category)
}

function inMovementPeriod(value, period) {
  if (period === 'all') return true
  const key = dayKeyInSystemZone(value)
  const today = todayIso()
  if (period === 'day') return key === today
  if (period === 'week') {
    const date = new Date(`${key}T12:00:00`)
    const now = new Date(`${today}T12:00:00`)
    const start = new Date(now)
    const day = start.getDay() || 7
    start.setDate(start.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    return date >= start && date <= now
  }
  if (period === 'month') return key.slice(0, 7) === today.slice(0, 7)
  if (period === 'year') return key.slice(0, 4) === today.slice(0, 4)
  return true
}

function signedManualAmount(movement) {
  const amount = Number(movement?.amount || 0)
  const type = String(movement?.type || '').toLowerCase()
  return ['expense', 'withdrawal', 'retiro'].includes(type) ? -amount : amount
}

function summarizeManualMovements(movements) {
  return movements.reduce((summary, movement) => {
    const signed = signedManualAmount(movement)
    if (signed >= 0) summary.income += signed
    else summary.outflow += Math.abs(signed)
    summary.net += signed
    return summary
  }, { income: 0, outflow: 0, net: 0 })
}

function movementTypeLabel(type) {
  const value = String(type || '').toLowerCase()
  if (value === 'income') return 'Ingreso'
  if (value === 'expense') return 'Gasto'
  if (value === 'withdrawal' || value === 'retiro') return 'Retiro'
  if (value === 'payable_payment') return 'Pago CxP'
  return type || 'Movimiento'
}
